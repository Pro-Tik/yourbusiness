/**
 * telegram.js
 *
 * Shared Telegram notification helper.
 * - Rate-limited: max 1 message per second to avoid 429 errors
 * - Formats messages with Telegram Markdown V2
 * - Silently fails if credentials are missing (so the app still runs without Telegram)
 */

const https = require('https');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Simple in-memory rate limiter — queues messages, fires max 1/sec
let lastSent = 0;
const queue = [];
let processing = false;

function escapeMarkdown(text) {
    // Escape special chars for Telegram MarkdownV2
    return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

function httpPost(data) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(data);
        const options = {
            hostname: 'api.telegram.org',
            path: `/bot${BOT_TOKEN}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        };
        const req = https.request(options, (res) => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => resolve(JSON.parse(raw)));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function processQueue() {
    if (processing) return;
    processing = true;
    while (queue.length > 0) {
        const now = Date.now();
        const wait = Math.max(0, 1100 - (now - lastSent)); // 1.1s between messages
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        const { text, resolve } = queue.shift();
        try {
            const result = await httpPost({
                chat_id: CHAT_ID,
                text,
                parse_mode: 'MarkdownV2',
                disable_web_page_preview: true,
            });
            lastSent = Date.now();
            resolve(result);
        } catch (e) {
            resolve(null); // silent fail
        }
    }
    processing = false;
}

/**
 * Send a Telegram message. Non-blocking (queued).
 * @param {string} text  Raw text — will be auto-escaped
 * @returns {Promise}
 */
function send(text) {
    if (!BOT_TOKEN || !CHAT_ID) return Promise.resolve(null);
    return new Promise((resolve) => {
        queue.push({ text: escapeMarkdown(text), resolve });
        processQueue();
    });
}

/**
 * Send a pre-formatted MarkdownV2 message (caller handles escaping).
 * Use this for structured messages with bold/code formatting.
 */
function sendFormatted(markdownText) {
    if (!BOT_TOKEN || !CHAT_ID) return Promise.resolve(null);
    return new Promise((resolve) => {
        queue.push({ text: markdownText, resolve });
        processQueue();
    });
}

// ── Convenience helpers ───────────────────────────────────────────────────────

function tgEsc(s) { return escapeMarkdown(s); }

const tg = {
    send,
    sendFormatted,
    esc: tgEsc,

    /** 🚀 Campaign started */
    campaignStart: (totalPending) =>
        sendFormatted(`🚀 *Campaign Started*\n📋 Pending leads: \`${totalPending}\``),

    /** ✅ Message sent successfully */
    messageSent: (phone, instance, businessName) =>
        sendFormatted(`✅ *Message Sent*\n📞 \`${tgEsc(phone)}\`\n🏢 ${tgEsc(businessName)}\n📡 Instance: \`${tgEsc(instance)}\``),

    /** 💬 Reply detected */
    replyDetected: (phone, businessName, instance) =>
        sendFormatted(`💬 *Reply Detected\\!*\n📞 \`${tgEsc(phone)}\`\n🏢 ${tgEsc(businessName)}\n📡 Via: \`${tgEsc(instance)}\``),

    /** ⏭️ Lead skipped (already contacted or replied) */
    leadSkipped: (phone, reason) =>
        sendFormatted(`⏭️ *Lead Skipped*\n📞 \`${tgEsc(phone)}\`\n🔎 Reason: ${tgEsc(reason)}`),

    /** ❌ Message failed */
    messageFailed: (phone, error) =>
        sendFormatted(`❌ *Send Failed*\n📞 \`${tgEsc(phone)}\`\n⚠️ ${tgEsc(error)}`),

    /** 😴 Campaign sleeping */
    sleeping: (reason, minutes) =>
        sendFormatted(`😴 *Sleeping*\n📝 ${tgEsc(reason)}\n⏱️ Next check: ${minutes} min`),

    /** 🏁 Campaign complete */
    campaignComplete: () =>
        sendFormatted(`🏁 *Campaign Complete\\!*\nAll leads have been processed\\.`),

    /** 📵 Instance disconnected */
    instanceDown: (instance) =>
        sendFormatted(`📵 *Instance Down\\!*\n⚡ \`${tgEsc(instance)}\` is not connected to WhatsApp\\.`),

    /** 📊 Daily report */
    dailyReport: (stats) => sendFormatted(
        `📊 *Daily Campaign Report*\n` +
        `📅 Date: \`${tgEsc(new Date().toLocaleDateString('en-BD', { timeZone: 'Asia/Dhaka' }))}\`\n\n` +
        `✅ Sent today: \`${stats.sentToday}\`\n` +
        `💬 Replies: \`${stats.replied}\`\n` +
        `⏳ Pending: \`${stats.pending}\`\n` +
        `❌ Failed: \`${stats.failed}\`\n` +
        `🔄 In Progress: \`${stats.inProgress}\`\n\n` +
        `📡 Instances: ${tgEsc(stats.instances.join(', '))}`
    ),
};

module.exports = tg;
