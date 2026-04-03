/**
 * reply_poller.js
 *
 * Background poller (Phase 3) — runs every 15 minutes.
 * Checks all 'sent' leads against the Evolution API history using the
 * EXACT instance that sent the original message (sent_by_instance column).
 *
 * If a reply is detected after the sent_at timestamp:
 *   → Updates status to 'replied'
 *   → Sends a one-time auto-reply (if ENABLE_AUTO_REPLY=true)
 *   → Sets auto_replied = 1 to prevent duplicate auto-replies
 *
 * Deployed as a second service in docker-compose.yml alongside campaign.
 */

require('dotenv').config();
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();

// ── Config ───────────────────────────────────────────────────────────────────
const DB_PATH = process.env.DB_PATH || 'data.sqlite';
const POLL_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const BASE_URL = process.env.EVOLUTION_API_BASE_URL || 'http://192.168.1.101:8081';
const API_KEY = process.env.EVOLUTION_API_KEY || '';
const ENABLE_AUTO_REPLY = process.env.ENABLE_AUTO_REPLY === 'true';

// The one-time acknowledgement message when a customer replies
const AUTO_REPLY_TEXT = `ধন্যবাদ আপনার সাড়া দেওয়ার জন্য! আমরা শীঘ্রই আপনার সাথে যোগাযোগ করব। 🙏`;

// ── Helpers ──────────────────────────────────────────────────────────────────
function log(msg) {
    const ts = new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });
    console.log(`[POLLER] [${ts}] ${msg}`);
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function dbGet(db, sql, params) {
    return new Promise((res, rej) =>
        db.get(sql, params, (e, r) => e ? rej(e) : res(r))
    );
}

function dbAll(db, sql, params) {
    return new Promise((res, rej) =>
        db.all(sql, params, (e, r) => e ? rej(e) : res(r))
    );
}

function dbRun(db, sql, params) {
    return new Promise((res, rej) =>
        db.run(sql, params, (e) => e ? rej(e) : res())
    );
}

// ── Core Poll Logic ───────────────────────────────────────────────────────────
async function poll() {
    log('Starting reply check cycle...');
    const db = new sqlite3.Database(DB_PATH);

    try {
        // Find all leads that were sent and haven't been marked as replied yet
        const leads = await dbAll(db,
            `SELECT phone, sent_by_instance, sent_at, auto_replied
       FROM campaign_leads
       WHERE status = 'sent'
       AND sent_by_instance IS NOT NULL`,
            []
        );

        log(`Found ${leads.length} sent lead(s) to check for replies.`);
        let repliedCount = 0;

        for (const lead of leads) {
            const { phone, sent_by_instance, sent_at, auto_replied } = lead;

            // Normalize phone to E.164
            let normalized = phone.replace(/\D/g, '');
            if (normalized.startsWith('01') && normalized.length === 11) {
                normalized = '88' + normalized;
            }
            const jid = `${normalized}@s.whatsapp.net`;

            try {
                const res = await axios.post(
                    `${BASE_URL}/chat/findMessages/${sent_by_instance}`,
                    { where: { key: { remoteJid: jid } }, limit: 20 },
                    { headers: { apikey: API_KEY, 'Content-Type': 'application/json' }, timeout: 8000 }
                );

                const msgs = Array.isArray(res.data) ? res.data
                    : (res.data?.messages || res.data?.records || []);

                // Only count messages received AFTER we sent our outreach
                const sentDate = sent_at ? new Date(sent_at).getTime() : 0;
                const replies = msgs.filter(m => {
                    if (m?.key?.fromMe !== false) return false; // must be FROM the customer
                    const msgTime = m?.messageTimestamp
                        ? Number(m.messageTimestamp) * 1000
                        : 0;
                    return msgTime > sentDate;
                });

                if (replies.length > 0) {
                    repliedCount++;
                    log(`[REPLY DETECTED] ${phone} replied via instance '${sent_by_instance}'.`);

                    await dbRun(db,
                        `UPDATE campaign_leads SET status = 'replied', replied_at = CURRENT_TIMESTAMP
             WHERE phone = ?`,
                        [phone]
                    );

                    // Auto-reply: send only once per lead
                    if (ENABLE_AUTO_REPLY && !auto_replied) {
                        try {
                            await axios.post(
                                `${BASE_URL}/message/sendText/${sent_by_instance}`,
                                { number: jid, text: AUTO_REPLY_TEXT },
                                { headers: { apikey: API_KEY, 'Content-Type': 'application/json' }, timeout: 8000 }
                            );
                            await dbRun(db,
                                `UPDATE campaign_leads SET auto_replied = 1 WHERE phone = ?`,
                                [phone]
                            );
                            log(`[AUTO-REPLY SENT] Sent acknowledgement to ${phone} via '${sent_by_instance}'.`);
                        } catch (arErr) {
                            log(`[AUTO-REPLY ERROR] Failed to send auto-reply to ${phone}: ${arErr.message}`);
                        }
                    }
                }
            } catch (apiErr) {
                // Non-fatal: skip this lead, try again next cycle
                log(`[API WARN] Could not check history for ${phone} on '${sent_by_instance}': ${apiErr.message}`);
            }

            // Small delay between API calls to avoid hammering the server
            await sleep(500);
        }

        log(`Cycle complete. ${repliedCount} new reply(ies) detected.`);
    } catch (err) {
        log(`[ERROR] Poll cycle failed: ${err.message}`);
    } finally {
        db.close();
    }
}

// ── Main Loop ─────────────────────────────────────────────────────────────────
async function run() {
    log('=== Reply Poller started ===');
    while (true) {
        await poll();
        log(`Sleeping ${POLL_INTERVAL_MS / 60000} minutes until next check...`);
        await sleep(POLL_INTERVAL_MS);
    }
}

run().catch(err => {
    console.error('[POLLER FATAL]', err);
    process.exit(1);
});
