/**
 * campaign_loop.js
 *
 * Autonomous WhatsApp outreach campaign runner — v3
 * Features:
 *   - Atomic lead claiming (BEGIN IMMEDIATE) — race-condition safe
 *   - Watchdog resets stale in_progress claims after 15 min
 *   - Instance health check before every send cycle
 *   - Retry failed leads up to 2x with 24h gap
 *   - Telegram notifications for all key events
 */

require('dotenv').config();
const { execSync } = require('child_process');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const tg = require('./telegram');

// ── Config ───────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MINUTES = 5;
const DB_PATH = process.env.DB_PATH || 'data.sqlite';
const BASE_URL = process.env.EVOLUTION_API_BASE_URL || 'http://192.168.1.101:8081';
const API_KEY = process.env.EVOLUTION_API_KEY || '';
const INSTANCES = (process.env.EVOLUTION_INSTANCES || 'openclaw')
  .split(',').map(s => s.trim()).filter(Boolean);
const MAX_RETRIES = 2;
const RETRY_GAP_HOURS = 24;

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });
  console.log(`[${ts}] ${msg}`);
}

// ── Instance Auto-Discovery via fetchInstances ────────────────────────────────
/**
 * Fetches all instances from Evolution API and returns only those that are
 * connected (connectionStatus === 'open').
 *
 * If EVOLUTION_INSTANCES is set in .env, only those named instances are used.
 * If unset, ALL connected instances are used automatically — just add a new
 * instance to the Evolution API and it will be picked up on the next cycle.
 */
async function getHealthyInstances() {
  try {
    const res = await axios.get(
      `${BASE_URL}/instance/fetchInstances`,
      { headers: { apikey: API_KEY }, timeout: 8000 }
    );

    const all = Array.isArray(res.data) ? res.data : [];

    // Filter: connected only
    const connected = all.filter(i => i.connectionStatus === 'open');

    // Optional: filter by names in EVOLUTION_INSTANCES env var
    const envFilter = process.env.EVOLUTION_INSTANCES
      ? process.env.EVOLUTION_INSTANCES.split(',').map(s => s.trim()).filter(Boolean)
      : null;

    const healthy = connected
      .filter(i => !envFilter || envFilter.includes(i.name))
      .map(i => i.name);

    // Log stats for each healthy instance
    connected.forEach(i => {
      const filtered = !envFilter || envFilter.includes(i.name);
      const msgs = i._count?.Message || 0;
      const num = i.number || i.ownerJid || 'unknown';
      log(`[HEALTH] ${i.name} (${num}) — ${msgs} msgs total — ${filtered ? '✓ active' : '✗ excluded by env filter'}`);
    });

    // Alert on any disconnected instance that IS in the env filter
    all
      .filter(i => i.connectionStatus !== 'open')
      .filter(i => !envFilter || envFilter.includes(i.name))
      .forEach(i => {
        log(`[HEALTH] Instance '${i.name}' is DOWN (status: ${i.connectionStatus})`);
        tg.instanceDown(i.name);
      });

    return healthy;
  } catch (e) {
    log(`[HEALTH] fetchInstances failed: ${e.message}. Falling back to env list.`);
    // Fallback: use env list as-is if the API call itself fails
    return (process.env.EVOLUTION_INSTANCES || 'openclaw')
      .split(',').map(s => s.trim()).filter(Boolean);
  }
}

// ── Phase A: Atomic Lead Claim (with Retry Support) ──────────────────────────
function getNextLead() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);

    const dhakaStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });
    const now = new Date(dhakaStr);
    const hour = now.getHours();
    const minute = now.getMinutes();

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
      // Watchdog: reset stale in_progress claims older than 15 minutes
      db.run(
        `UPDATE campaign_leads SET status = 'pending', claimed_at = NULL
         WHERE status = 'in_progress'
         AND claimed_at < datetime('now', '-15 minutes')`,
        [],
        (wErr) => { if (wErr) log(`[WATCHDOG WARN] ${wErr.message}`); }
      );

      // Phase A: Reset failed leads eligible for retry (retry_count < MAX_RETRIES, failed > 24h ago)
      db.run(
        `UPDATE campaign_leads SET status = 'pending'
         WHERE status = 'failed'
         AND (retry_count IS NULL OR retry_count < ${MAX_RETRIES})
         AND last_failed_at < datetime('now', '-${RETRY_GAP_HOURS} hours')`,
        [],
        (rErr) => { if (rErr) log(`[RETRY-RESET WARN] ${rErr.message}`); }
      );

      // Daily limit check (jittered 18–24)
      db.get(
        `SELECT count(*) as count FROM campaign_leads
         WHERE status = 'sent' AND date(sent_at, 'localtime') = date('now', 'localtime')`,
        [],
        (err, row) => {
          if (err) { db.close(); return reject(err); }
          // Daily limit check — scales with number of active instances
          // Each instance has a safe limit of 18–24 messages/day
          // ACTIVE_INSTANCES is set by the parent campaign_loop when calling getNextLead
          const activeInstances = (process.env.ACTIVE_INSTANCES || process.env.EVOLUTION_INSTANCES || 'openclaw')
            .split(',').map(s => s.trim()).filter(Boolean);
          const perInstanceMin = 18;
          const perInstanceMax = 24;
          const instanceCount = Math.max(1, activeInstances.length);
          const dailyLimit = (Math.floor(Math.random() * (perInstanceMax - perInstanceMin + 1)) + perInstanceMin) * instanceCount;
          const sentToday = row ? row.count : 0;

          if (sentToday >= dailyLimit) {
            log(`Daily limit of ${dailyLimit} reached (${sentToday} sent today). Sleeping.`);
            db.close();
            return resolve(null);
          }

          // Atomic claim
          db.run('BEGIN IMMEDIATE', (beginErr) => {
            if (beginErr) { db.close(); return resolve(null); }

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

                db.run(
                  `UPDATE campaign_leads
                   SET status = 'in_progress', claimed_at = datetime('now')
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

// ── Main Loop ─────────────────────────────────────────────────────────────────
async function run() {
  log('=== Campaign loop started (v3) ===');

  // Get initial pending count for startup notification
  const initPending = await new Promise(res => {
    const db = new sqlite3.Database(DB_PATH);
    db.get(`SELECT count(*) as c FROM campaign_leads WHERE status IN ('pending','in_progress')`, [], (e, r) => {
      db.close(); res(r ? r.c : 0);
    });
  });
  await tg.campaignStart(initPending);

  while (true) {
    // ── Step 1: Discover connected instances ──────────────────────────────────
    const healthyInstances = await getHealthyInstances();
    if (healthyInstances.length === 0) {
      log('[CRITICAL] No healthy instances available! Sleeping 5 min...');
      await tg.send('🚨 CRITICAL: All WhatsApp instances are disconnected! Campaign paused for 5 min.');
      await sleep(5 * 60_000);
      continue;
    }

    // ── Step 2: Per-instance daily cap (max 24 messages each) ────────────────
    const PER_INSTANCE_CAP = 24;
    const todayCounts = await new Promise(res => {
      const db = new sqlite3.Database(DB_PATH);
      db.all(
        `SELECT sent_by_instance, count(*) as count
         FROM campaign_leads
         WHERE status = 'sent'
         AND date(sent_at, 'localtime') = date('now', 'localtime')
         AND sent_by_instance IS NOT NULL
         GROUP BY sent_by_instance`,
        [],
        (e, rows) => { db.close(); res(rows || []); }
      );
    });

    const sentPerInstance = {};
    todayCounts.forEach(r => { sentPerInstance[r.sent_by_instance] = r.count; });

    const availableInstances = healthyInstances.filter(inst => {
      const sent = sentPerInstance[inst] || 0;
      if (sent >= PER_INSTANCE_CAP) {
        log(`[CAP] Instance '${inst}' has reached today's cap (${sent}/${PER_INSTANCE_CAP}). Excluding.`);
        return false;
      }
      log(`[CAP] Instance '${inst}': ${sent}/${PER_INSTANCE_CAP} sent today — available.`);
      return true;
    });

    if (availableInstances.length === 0) {
      const totalToday = Object.values(sentPerInstance).reduce((a, b) => a + b, 0);
      log(`[CAP] All instances have hit their daily cap (${totalToday} total sent today). Sleeping until tomorrow.`);
      await tg.sleeping('All instances at daily cap', POLL_INTERVAL_MINUTES);
      await sleep(POLL_INTERVAL_MINUTES * 60_000);
      continue;
    }

    let phone;
    try {
      phone = await getNextLead();
    } catch (err) {
      log(`[ERROR] DB error while fetching lead: ${err.message}`);
      await sleep(60_000);
      continue;
    }

    if (!phone) {
      const totalPending = await new Promise(res => {
        const db = new sqlite3.Database(DB_PATH);
        db.get(`SELECT count(*) as c FROM campaign_leads WHERE status = 'pending'`, [], (e, r) => {
          db.close(); res(r ? r.c : 0);
        });
      });

      if (totalPending === 0) {
        log('All leads processed. Campaign complete. Exiting.');
        await tg.campaignComplete();
        process.exit(0);
      }

      log(`Polling again in ${POLL_INTERVAL_MINUTES} minutes...`);
      await sleep(POLL_INTERVAL_MINUTES * 60_000);
      continue;
    }

    log(`→ Firing message to ${phone} (available: ${availableInstances.join(', ')})`);
    try {
      execSync(`node fire_whatsapp.js ${phone}`, {
        stdio: 'inherit',
        env: { ...process.env, ACTIVE_INSTANCES: availableInstances.join(',') }
      });
    } catch (err) {
      log(`[WARNING] fire_whatsapp.js exited non-zero for ${phone}.`);
    }
  }
}

run().catch(async err => {
  console.error('Fatal error in campaign_loop.js:', err);
  await tg.send(`💥 FATAL ERROR in campaign_loop.js:\n${err.message}`);
  process.exit(1);
});
