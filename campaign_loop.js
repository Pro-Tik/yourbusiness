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
 * Returns the next pending lead phone number from the database,
 * or null if none remain.  Respects daily limit (18–24) and working
 * hours (08:00–18:00 Dhaka) — the same rules used in fetch_batch.js.
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
    const endMinuteJitter   = Math.floor(Math.random() * 31);
    const isTooEarly = hour < 8 || (hour === 8 && minute < startMinuteJitter);
    const isTooLate  = hour > 18 || (hour === 18 && minute > 30 + endMinuteJitter);

    if (isTooEarly || isTooLate) {
      log(`Outside working hours (${hour}:${String(minute).padStart(2,'0')} Dhaka). Sleeping until next window.`);
      db.close();
      return resolve(null);
    }

    // Check daily limit (jittered 18–24)
    db.get(
      `SELECT count(*) as count FROM campaign_leads WHERE status = 'sent' AND date(sent_at, 'localtime') = date('now', 'localtime')`,
      [],
      (err, row) => {
        if (err) { db.close(); return reject(err); }

        const dailyLimit = Math.floor(Math.random() * (24 - 18 + 1)) + 18;
        const sentToday  = row ? row.count : 0;

        if (sentToday >= dailyLimit) {
          log(`Daily limit of ${dailyLimit} reached (${sentToday} sent today). Sleeping.`);
          db.close();
          return resolve(null);
        }

        // Fetch one pending lead
        db.get(
          `SELECT phone FROM campaign_leads
           WHERE status = 'pending' AND website_status = 'No Website'
           LIMIT 1`,
          [],
          (err2, lead) => {
            db.close();
            if (err2) return reject(err2);
            resolve(lead ? lead.phone : null);
          }
        );
      }
    );
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
      // fire_whatsapp.js handles its own composing delay + post-send delay
      execSync(`node fire_whatsapp.js ${phone}`, { stdio: 'inherit' });
    } catch (err) {
      // fire_whatsapp.js itself marks the lead as 'failed' and exits with code 1
      log(`[WARNING] fire_whatsapp.js exited non-zero for ${phone} — lead marked failed, continuing.`);
    }
    // No extra sleep here — fire_whatsapp.js already waits 3–7 minutes
  }
}

run().catch(err => {
  console.error('Fatal error in campaign_loop.js:', err);
  process.exit(1);
});
