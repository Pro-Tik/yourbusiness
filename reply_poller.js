/**
 * reply_poller.js
 *
 * Background poller (Phase 3) — runs every 15 minutes.
 * Checks all 'sent' leads against the Evolution API history using the
 * EXACT instance that sent the original message (sent_by_instance column).
 */

require('dotenv').config();
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const tg = require('./telegram');

// ── Config ───────────────────────────────────────────────────────────────────
const DB_PATH = process.env.DB_PATH || 'data.sqlite';
const POLL_INTERVAL_MS = 15 * 60 * 1000;
const BASE_URL = process.env.EVOLUTION_API_BASE_URL || 'http://192.168.1.101:8081';
const API_KEY = process.env.EVOLUTION_API_KEY || '';
const ENABLE_AUTO_REPLY = process.env.ENABLE_AUTO_REPLY === 'true';

const AUTO_REPLY_TEXT = `ধন্যবাদ আপনার সাড়া দেওয়ার জন্য! আমরা শীঘ্রই আপনার সাথে যোগাযোগ করব। 🙏`;

// ── Helpers ──────────────────────────────────────────────────────────────────
function log(msg) {
    const ts = new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });
    console.log(`[POLLER] [${ts}] ${msg}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function dbGet(db, sql, params) { return new Promise((res, rej) => db.get(sql, params, (e, r) => e ? rej(e) : res(r))); }
function dbAll(db, sql, params) { return new Promise((res, rej) => db.all(sql, params, (e, r) => e ? rej(e) : res(r))); }
function dbRun(db, sql, params) { return new Promise((res, rej) => db.run(sql, params, (e) => e ? rej(e) : res())); }

// ── Core Poll Logic ───────────────────────────────────────────────────────────
async function poll() {
    log('Starting reply check cycle...');
    const db = new sqlite3.Database(DB_PATH);

    try {
        const leads = await dbAll(db,
            `SELECT phone, sent_by_instance, sent_at, auto_replied FROM campaign_leads
       WHERE status = 'sent' AND sent_by_instance IS NOT NULL`, []
        );

        log(`Found ${leads.length} sent lead(s) to check for replies.`);
        let replenished = 0;

        for (const lead of leads) {
            const { phone, sent_by_instance, sent_at, auto_replied } = lead;

            let normalized = phone.replace(/\D/g, '');
            if (normalized.startsWith('01') && normalized.length === 11) normalized = '88' + normalized;
            const jid = `${normalized}@s.whatsapp.net`;

            try {
                const res = await axios.post(`${BASE_URL}/chat/findMessages/${sent_by_instance}`,
                    { where: { key: { remoteJid: jid } }, limit: 20 },
                    { headers: { apikey: API_KEY, 'Content-Type': 'application/json' }, timeout: 8000 }
                );

                const msgs = Array.isArray(res.data) ? res.data : (res.data?.messages || res.data?.records || []);

                // Fix #7: Parse sent_at (UTC from SQLite) explicitly to avoid +6h offset error
                const sentDate = sent_at ? new Date(sent_at + ' Z').getTime() : 0;
                const replies = msgs.filter(m => {
                    if (m?.key?.fromMe !== false) return false;
                    const msgTime = m?.messageTimestamp ? Number(m.messageTimestamp) * 1000 : 0;
                    return msgTime > sentDate;
                });

                if (replies.length > 0) {
                    replenished++;
                    log(`[REPLY DETECTED] ${phone} replied via '${sent_by_instance}'.`);

                    await dbRun(db, `UPDATE campaign_leads SET status = 'replied', replied_at = CURRENT_TIMESTAMP WHERE phone = ?`, [phone]);
                    const leadInfo = await dbGet(db, `SELECT business_name FROM campaign_leads WHERE phone = ?`, [phone]);
                    await tg.replyDetected(phone, leadInfo?.business_name || phone, sent_by_instance);

                    if (ENABLE_AUTO_REPLY && !auto_replied) {
                        try {
                            await axios.post(`${BASE_URL}/message/sendText/${sent_by_instance}`,
                                { number: jid, text: AUTO_REPLY_TEXT },
                                { headers: { apikey: API_KEY, 'Content-Type': 'application/json' }, timeout: 8000 }
                            );
                            await dbRun(db, `UPDATE campaign_leads SET auto_replied = 1 WHERE phone = ?`, [phone]);
                            log(`[AUTO-REPLY SENT] Sent to ${phone} via '${sent_by_instance}'.`);
                        } catch (arErr) { log(`[AUTO-REPLY ERROR] ${arErr.message}`); }
                    }
                }
            } catch (apiErr) { log(`[API WARN] ${phone} on '${sent_by_instance}': ${apiErr.message}`); }
            await sleep(500);
        }
        log(`Cycle complete. ${replenished} new reply(ies) detected.`);
    } catch (err) { log(`[ERROR] Poll cycle failed: ${err.message}`); } finally { db.close(); }
}

// ── Daily Report Logic ────────────────────────────────────────────────────────
let lastReportDate = null;

async function sendDailyReportIfDue() {
    const dhakaStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });
    const now = new Date(dhakaStr);
    if (now.getHours() < 18 || lastReportDate === now.toDateString()) return;
    lastReportDate = now.toDateString();

    const db = new sqlite3.Database(DB_PATH);
    try {
        const [sent, replied, pending, failed, inProgress] = await Promise.all([
            dbGet(db, `SELECT count(*) as c FROM campaign_leads WHERE status='sent' AND date(sent_at,'localtime')=date('now','localtime')`, []),
            dbGet(db, `SELECT count(*) as c FROM campaign_leads WHERE status='replied'`, []),
            dbGet(db, `SELECT count(*) as c FROM campaign_leads WHERE status='pending'`, []),
            dbGet(db, `SELECT count(*) as c FROM campaign_leads WHERE status='failed'`, []),
            dbGet(db, `SELECT count(*) as c FROM campaign_leads WHERE status='in_progress'`, []),
        ]);

        // Fix #6: Fetch live instance list for daily report instead of stale startup list
        let instances = [];
        try {
            const res = await axios.get(`${BASE_URL}/instance/fetchInstances`, { headers: { apikey: API_KEY }, timeout: 8000 });
            instances = (Array.isArray(res.data) ? res.data : []).map(i => `${i.name} (${i.connectionStatus})`);
        } catch (e) {
            instances = (process.env.EVOLUTION_INSTANCES || 'openclaw').split(',');
        }

        await tg.dailyReport({
            sentToday: sent?.c || 0,
            replied: replied?.c || 0,
            pending: pending?.c || 0,
            failed: failed?.c || 0,
            inProgress: inProgress?.c || 0,
            instances: instances,
        });
        log('Daily report sent.');
    } catch (e) { log(`[ERROR] Daily report: ${e.message}`); } finally { db.close(); }
}

// ── Main Loop ─────────────────────────────────────────────────────────────────
async function run() {
    log('=== Reply Poller started ===');
    await tg.send('📡 Reply Poller started — checking for replies every 15 min.');
    while (true) {
        await poll();
        await sendDailyReportIfDue();
        log(`Sleeping 15 minutes...`);
        await sleep(POLL_INTERVAL_MS);
    }
}

run().catch(err => { console.error('[POLLER FATAL]', err); process.exit(1); });
