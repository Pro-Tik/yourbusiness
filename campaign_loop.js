/**
 * campaign_loop.js
 * 
 * Autonomous WhatsApp outreach campaign runner.
 * Runs continuously inside Docker — fetches pending leads, fires messages
 * one-by-one (fire_whatsapp.js handles its own per-message delays),
 * then sleeps and polls again until all leads are exhausted.
 */

require('dotenv').config();
const { execSync } = require('child_process');
const sqlite3 = require('sqlite3').verbose();

// ── Config ──────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MINUTES = 5;   // How long to wait when no leads are ready
const DB_PATH = process.env.DB_PATH || 'data.sqlite';

// ── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });
  console.log(`[${ts}] ${msg}`);
}

/**
 * Atomically claims the next available lead using BEGIN IMMEDIATE.
 * Returns the phone number, or null if none available.
 *
 * Uses 'in_progress' status to prevent two workers from claiming the same lead.
 * A watchdog first resets any stale in_progress claims older than 15 minutes.
 */
function getNextLead() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);

    const dhakaStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });
    const now = new Date(dhakaStr);
    const hour = now.getHours();
    const minute = now.getMinutes();

    // Jittered working hours: 08:00–18:30
    const startMinuteJitter = Math.floor(Math.random() * 31);
    const endMinuteJitter = Math.floor(Math.random() * 31);
    const isTooEarly = hour < 8 || (hour === 8 && minute < startMinuteJitter);
    const isTooLate = hour > 18 || (hour === 18 && minute > 30 + endMinuteJitter);

    if (isTooEarly || isTooLate) {
      log(`Outside working hours (${hour}:${String(minute).padStart(2, '0')} Dhaka). Sleeping.`);
      db.close();
      return resolve(null);
    }

    db.serialize(() => {
      // Step 1 — Watchdog: reset stale in_progress claims older than 15 minutes
      db.run(
        `UPDATE campaign_leads SET status = 'pending', claimed_at = NULL
         WHERE status = 'in_progress'
         AND claimed_at < datetime('now', '-15 minutes')`,
        [],
        (wErr) => { if (wErr) log(`[WATCHDOG WARN] ${wErr.message}`); }
      );

      // Step 2 — Check daily limit (jittered 18-24)
      db.get(
        `SELECT count(*) as count FROM campaign_leads
         WHERE status = 'sent' AND date(sent_at, 'localtime') = date('now', 'localtime')`,
        [],
        (err, row) => {
          if (err) { db.close(); return reject(err); }
          const dailyLimit = Math.floor(Math.random() * (24 - 18 + 1)) + 18;
          const sentToday = row ? row.count : 0;

          if (sentToday >= dailyLimit) {
            log(`Daily limit of ${dailyLimit} reached (${sentToday} sent today). Sleeping.`);
            db.close();
            return resolve(null);
          }

          // Step 3 — Atomic claim: BEGIN IMMEDIATE prevents two workers from
          // reading the same pending lead simultaneously.
          db.run('BEGIN IMMEDIATE', (beginErr) => {
            if (beginErr) {
              // Another worker has the lock right now — back off
              db.close();
              return resolve(null);
            }

            db.get(
              `SELECT phone FROM campaign_leads
               WHERE status = 'pending' AND website_status = 'No Website'
               LIMIT 1`,
              [],
              (fetchErr, lead) => {
                if (fetchErr || !lead) {
                  db.run('ROLLBACK');
                  db.close();
                  return fetchErr ? reject(fetchErr) : resolve(null);
                }

                // Claim it — no other worker can read this row as pending now
                db.run(
                  `UPDATE campaign_leads SET status = 'in_progress', claimed_at = datetime('now')
                   WHERE phone = ?`,
                  [lead.phone],
                  (updateErr) => {
                    if (updateErr) {
                      db.run('ROLLBACK');
                      db.close();
                      return reject(updateErr);
                    }
                    db.run('COMMIT', (commitErr) => {
                      db.close();
                      if (commitErr) return reject(commitErr);
                      resolve(lead.phone);
                    });
                  }
                );
              }
            );
          });
        }
      );
    });
  });
}

// ── Main loop ────────────────────────────────────────────────────────────────
async function run() {
  log('=== Campaign loop started ===');

  while (true) {
    let phone;

    try {
      phone = await getNextLead();
    } catch (err) {
      log(`[ERROR] DB error while fetching lead: ${err.message}`);
      await sleep(60_000);
      continue;
    }

    if (!phone) {
      // Either outside hours, daily limit hit, or no leads left
      const totalPending = await new Promise(res => {
        const db = new sqlite3.Database(DB_PATH);
        db.get(`SELECT count(*) as c FROM campaign_leads WHERE status = 'pending'`, [], (e, r) => {
          db.close();
          res(r ? r.c : 0);
        });
      });

      if (totalPending === 0) {
        log('All leads processed. Campaign complete. Exiting.');
        process.exit(0);
      }

      log(`Polling again in ${POLL_INTERVAL_MINUTES} minutes...`);
      await sleep(POLL_INTERVAL_MINUTES * 60_000);
      continue;
    }

    log(`→ Firing message to ${phone}`);
    try {
      // fire_whatsapp.js handles: presence delay, pre-send check, sending,
      // DB update (sent/replied/skipped), and the 3-7 min post-send delay.
      execSync(`node fire_whatsapp.js ${phone}`, { stdio: 'inherit' });
    } catch (err) {
      // Exit code 1: fire_whatsapp.js already marked the lead as 'failed'.
      // The watchdog in getNextLead() will clean up any 'in_progress' records
      // that outlive 15 minutes if something crashes mid-script.
      log(`[WARNING] fire_whatsapp.js exited non-zero for ${phone} — lead marked failed, continuing.`);
    }
    // No extra sleep here — fire_whatsapp.js already waits 3–7 minutes
  }
}

run().catch(err => {
  console.error('Fatal error in campaign_loop.js:', err);
  process.exit(1);
});
