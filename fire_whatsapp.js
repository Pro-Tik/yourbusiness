require('dotenv').config();
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const tg = require('./telegram');

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: node fire_whatsapp.js <phone>");
    process.exit(1);
  }

  const rawPhone = args[0];

  const db = new sqlite3.Database('data.sqlite');

  const lead = await new Promise((resolve, reject) => {
    db.get(`SELECT business_name, area, category FROM campaign_leads WHERE phone = ?`, [rawPhone], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

  if (!lead) {
    console.error(`[ERROR] No lead found in the database with phone number: ${rawPhone}`);
    db.close();
    process.exit(1);
  }

  const rawName = lead.business_name || '';
  const rawArea = lead.area || '';
  const rawCategory = lead.category || 'business';

  let phone = rawPhone.replace(/\D/g, '');
  if (phone.startsWith('01') && phone.length === 11) {
    phone = '88' + phone;
  }

  const businessName = rawName.trim() !== '' && rawName !== '-' ? rawName.trim() : 'your business';
  const area = rawArea.trim() !== '' && rawArea !== '-' ? rawArea.trim() : 'your area';
  const category = rawCategory.trim() !== '' ? rawCategory.trim() : 'business';

  const randomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // === SPINTAX POOLS (each axis spins independently) ===
  const greetings = ["আসসালামু আলাইকুম", "হ্যালো", "ভাইয়া আসসালামু আলাইকুম", "সালাম", "হ্যালো ভাই"];
  const timeNow = ["এখন", "এই মুহূর্তে", "আপাতত"];
  const timeMonth = ["এই মাসে", "এই সময়ে", "এখন"];
  const timeToday = ["আজকে", "আজ", "এখন"];
  const timeWeek = ["এই সপ্তাহে", "এখন", "আজকে"];

  const g = randomChoice(greetings);
  const tn = randomChoice(timeNow);
  const tm = randomChoice(timeMonth);
  const tt = randomChoice(timeToday);
  const tw = randomChoice(timeWeek);

  // Category-aware micro-commitment hooks — 4 structurally distinct forms per category
  const cat = category.toLowerCase();
  let message;

  if (cat.includes('interior') || cat.includes('architect') || cat.includes('furniture') || cat.includes('home decor')) {
    message = randomChoice([
      `${g}। ${businessName} কি ${area}-তে ${tm} নতুন কোনো ইন্টেরিয়র বা ডিজাইন প্রজেক্টের কাজ নিচ্ছে?`,
      `${g}। ${area}-এর ${businessName} কি ${tn} নতুন ক্লায়েন্টের ইন্টেরিয়র প্রজেক্ট নিচ্ছে?`,
      `${g}। একটু জানতে চাইছিলাম — ${businessName} কি ${tm} ${area}-তে নতুন ডিজাইন প্রজেক্ট নিচ্ছে?`,
      `${g}। ${area}-তে ${businessName}-এর কি ${tn} নতুন ইন্টেরিয়র কাজ নেওয়ার সুযোগ আছে?`,
    ]);

  } else if (cat.includes('saloon') || cat.includes('beauty') || cat.includes('spa') || cat.includes('skin')) {
    message = randomChoice([
      `${g}। ${businessName} কি ${tt} ${area}-তে নতুন কোনো কাস্টমারের বুকিং বা সিরিয়াল নিচ্ছে?`,
      `${g}। ${area}-এর ${businessName}-এ কি ${tn} ওয়াক-ইন কাস্টমার নেওয়া হচ্ছে?`,
      `${g}। একটু জানতে চাইছিলাম — ${businessName}-এ ${tt} ${area}-তে সিরিয়াল পাওয়া যাবে?`,
      `${g}। ${area}-তে ${businessName} কি ${tw} নতুন অ্যাপয়েন্টমেন্ট নিচ্ছে?`,
    ]);

  } else if (cat.includes('hardware') || cat.includes('construction') || cat.includes('pest control') || cat.includes('cleaning')) {
    message = randomChoice([
      `${g}। ${businessName} কি ${area}-তে কনস্ট্রাকশন প্রজেক্টের জন্য পাইকারি বা বাল্ক অর্ডারের কাজ নেয়?`,
      `${g}। ${area}-এর ${businessName} কি বড় কন্ট্রাক্টরদের জন্য ${tn} বাল্ক সাপ্লাই দিয়ে থাকে?`,
      `${g}। একটু জানতে চাইছিলাম — ${businessName} কি ${area}-তে বাল্ক মালপত্র সাপ্লাই করে?`,
      `${g}। ${area}-তে ${businessName} কি ${tm} পাইকারি অর্ডার নিচ্ছে?`,
    ]);

  } else if (cat.includes('jewelry')) {
    message = randomChoice([
      `${g}। ${area}-এর ${businessName}-এ কি কাস্টম ব্রাইডাল সেটের অর্ডার নেওয়া হয়, নাকি শুধু রেডিমেড গয়না বিক্রি হয়?`,
      `${g}। ${businessName} কি ${area}-তে ${tn} কাস্টম গয়নার অর্ডার নিচ্ছে?`,
      `${g}। একটু জানতে চাইছিলাম — ${businessName}-এ কি ${tm} বিশেষ কাস্টম ডিজাইনের গয়না বানানো হয়?`,
      `${g}। ${area}-তে ${businessName} কি ${tw} কাস্টম জুয়েলারি অর্ডার অ্যাভেইলেবল রাখে?`,
    ]);

  } else if (cat.includes('restaurant') || cat.includes('cafe') || cat.includes('catering')) {
    message = randomChoice([
      `${g}। ${businessName} কি ${area}-তে কর্পোরেট বা বড় গ্রুপের জন্য ${tn} বুকিং বা ক্যাটারিং অর্ডার নিচ্ছে?`,
      `${g}। ${area}-এর ${businessName}-এ কি ${tw} বিশেষ কোনো অনুষ্ঠানের ক্যাটারিং বুক করা যাবে?`,
      `${g}। একটু জানতে চাইছিলাম — ${businessName} কি ${tm} ${area}-তে বড় পার্টির অর্ডার নেয়?`,
      `${g}। ${area}-তে ${businessName} কি ${tn} গ্রুপ ডাইনিং বা ক্যাটারিং অফার করছে?`,
    ]);

  } else if (cat.includes('hotel') || cat.includes('resort')) {
    message = randomChoice([
      `${g}। ${businessName}-এ কি ${area}-তে ${tw} রুম অ্যাভেইলেবল আছে, নাকি ফুল বুক হয়ে গেছে?`,
      `${g}। ${area}-এর ${businessName}-এ কি কর্পোরেট গ্রুপের জন্য ${tn} বিশেষ রেট পাওয়া যায়?`,
      `${g}। একটু জানতে চাইছিলাম — ${businessName}-এ ${tm} ${area}-তে রুম বুকিং পাওয়া যাবে?`,
      `${g}। ${area}-তে ${businessName} কি ${tw} গ্রুপ চেক-ইনের জন্য স্পেশাল প্যাকেজ দিচ্ছে?`,
    ]);

  } else if (cat.includes('real estate') || cat.includes('property')) {
    message = randomChoice([
      `${g}। ${businessName} কি ${area}-তে ${tn} নতুন কোনো কমার্শিয়াল বা রেসিডেন্শিয়াল প্রপার্টি বিক্রি বা ভাড়া দিচ্ছে?`,
      `${g}। ${area}-এ ${businessName}-এর কাছে কি ${tn} ভালো কোনো ফ্ল্যাট বা স্পেস অ্যাভেইলেবল আছে?`,
      `${g}। একটু জানতে চাইছিলাম — ${businessName} কি ${tm} ${area}-তে নতুন প্রপার্টি লিস্ট করেছে?`,
      `${g}। ${area}-তে ${businessName} কি ${tw} কোনো ভালো কমার্শিয়াল স্পেস অফার করছে?`,
    ]);

  } else if (cat.includes('dental') || cat.includes('eye') || cat.includes('diagnostic') || cat.includes('pharmacy') || cat.includes('physio') || cat.includes('clinic')) {
    message = randomChoice([
      `${g}। ${businessName}-এ কি ${area}-তে ${tn} নতুন পেশেন্টের অ্যাপয়েন্টমেন্ট নেওয়া হচ্ছে?`,
      `${g}। ${area}-এর ${businessName}-এ কি ${tt} ডাক্তারের সিরিয়াল পাওয়া যাবে?`,
      `${g}। একটু জানতে চাইছিলাম — ${businessName}-এ ${tw} ${area}-তে ডাক্তার দেখানো যাবে?`,
      `${g}। ${area}-তে ${businessName} কি ${tn} নতুন পেশেন্ট নিচ্ছে?`,
    ]);

  } else if (cat.includes('school') || cat.includes('coaching') || cat.includes('training') || cat.includes('kindergarten')) {
    message = randomChoice([
      `${g}। ${businessName} কি ${area}-তে ${tn} নতুন স্টুডেন্টের ভর্তি নিচ্ছে?`,
      `${g}। ${area}-এর ${businessName}-এ কি এই ব্যাচে ${tn} আসন খালি আছে?`,
      `${g}। একটু জানতে চাইছিলাম — ${businessName}-এ ${tm} ${area}-তে নতুন ভর্তির সুযোগ আছে?`,
      `${g}। ${area}-তে ${businessName} কি ${tw} নতুন শিক্ষার্থী নিচ্ছে?`,
    ]);

  } else if (cat.includes('law') || cat.includes('accounting') || cat.includes('tax') || cat.includes('insurance')) {
    message = randomChoice([
      `${g}। ${businessName} কি ${area}-তে ${tn} নতুন কোনো ক্লায়েন্টের কেস বা পরামর্শ নিচ্ছে?`,
      `${g}। ${area}-এর ${businessName} কি ${tm} নতুন কর্পোরেট ক্লায়েন্ট নিচ্ছে?`,
      `${g}। একটু জানতে চাইছিলাম — ${businessName} কি ${tn} ${area}-তে নতুন কেস হাতে নিচ্ছে?`,
      `${g}। ${area}-তে ${businessName} কি ${tw} কনসালটেশন নেওয়া যাবে?`,
    ]);

  } else if (cat.includes('gym') || cat.includes('fitness') || cat.includes('yoga')) {
    message = randomChoice([
      `${g}। ${businessName}-এ কি ${area}-তে ${tn} নতুন মেম্বার ভর্তি নেওয়া হচ্ছে, নাকি স্লট ফুল?`,
      `${g}। ${area}-এর ${businessName}-এ কি ${tn} ফ্রি ট্রায়াল সেশনের সুযোগ আছে?`,
      `${g}। একটু জানতে চাইছিলাম — ${businessName}-এ ${tm} ${area}-তে নতুন মেম্বারশিপ পাওয়া যাবে?`,
      `${g}। ${area}-তে ${businessName} কি ${tw} নতুন ব্যাচ শুরু করছে?`,
    ]);

  } else if (cat.includes('car') || cat.includes('auto')) {
    message = randomChoice([
      `${g}। ${businessName} কি ${area}-তে ${tn} সার্ভিসিং বা রিপেয়ারের জন্য নতুন কাস্টমার নিচ্ছে?`,
      `${g}। ${area}-এর ${businessName}-এ কি ${tn} গাড়ির বুকিং বা টেস্ট ড্রাইভ পাওয়া যাবে?`,
      `${g}। একটু জানতে চাইছিলাম — ${businessName}-এ ${tw} ${area}-তে সার্ভিসিং অ্যাপয়েন্টমেন্ট পাওয়া যাবে?`,
      `${g}। ${area}-তে ${businessName} কি ${tm} নতুন গাড়ির স্টক এনেছে?`,
    ]);

  } else if (cat.includes('travel')) {
    message = randomChoice([
      `${g}। ${businessName} কি ${area}-তে ${tm} কোনো গ্রুপ ট্যুর প্যাকেজ অফার করছে?`,
      `${g}। ${area}-এর ${businessName}-এ কি কর্পোরেট ট্র্যাভেল বা বিজনেস ট্রিপের প্যাকেজ ${tn} পাওয়া যায়?`,
      `${g}। একটু জানতে চাইছিলাম — ${businessName} কি ${tw} ${area}-তে নতুন ট্যুর চালু করেছে?`,
      `${g}। ${area}-তে ${businessName} কি ${tm} গ্রুপের জন্য বিশেষ ট্র্যাভেল ডিল দিচ্ছে?`,
    ]);

  } else if (cat.includes('event') || cat.includes('photography')) {
    message = randomChoice([
      `${g}। ${businessName} কি ${area}-তে ${tm} নতুন কোনো ইভেন্ট বা শুটিং বুকিং নিচ্ছে?`,
      `${g}। ${area}-এর ${businessName}-এ কি ${tn} ওয়েডিং বা কর্পোরেট ইভেন্টের বুকিং অ্যাভেইলেবল আছে?`,
      `${g}। একটু জানতে চাইছিলাম — ${businessName} কি ${tw} ${area}-তে ইভেন্ট ম্যানেজমেন্ট করে?`,
      `${g}। ${area}-তে ${businessName} কি ${tm} নতুন প্রজেক্ট নিচ্ছে?`,
    ]);

  } else if (cat.includes('supermarket') || cat.includes('boutique') || cat.includes('electronics')) {
    message = randomChoice([
      `${g}। ${businessName} কি ${area}-তে কর্পোরেট বা বাল্ক অর্ডারের জন্য ${tn} বিশেষ কোনো সুবিধা দিয়ে থাকে?`,
      `${g}। ${area}-এর ${businessName}-এ কি ${tw} নতুন কোনো স্টক এসেছে?`,
      `${g}। একটু জানতে চাইছিলাম — ${businessName}-এ ${tm} ${area}-তে বাল্ক অর্ডারে ছাড় পাওয়া যায়?`,
      `${g}। ${area}-তে ${businessName} কি ${tn} কর্পোরেট পার্চেজের সুবিধা দিচ্ছে?`,
    ]);

  } else if (cat.includes('courier')) {
    message = randomChoice([
      `${g}। ${businessName} কি ${area}-তে রেগুলার বাল্ক পার্সেল ডেলিভারির জন্য ${tn} বিশেষ রেট দেয়?`,
      `${g}। ${area}-এর ${businessName} কি ${tn} নতুন বিজনেস অ্যাকাউন্ট নিচ্ছে?`,
      `${g}। একটু জানতে চাইছিলাম — ${businessName} কি ${tm} ${area}-তে বাল্ক শিপমেন্টের চুক্তি করে?`,
      `${g}। ${area}-তে ${businessName} কি ${tw} কর্পোরেট ক্লায়েন্টদের জন্য বিশেষ ডেলিভারি অফার করছে?`,
    ]);

  } else {
    message = randomChoice([
      `${g}। ${businessName} কি ${area}-তে ${tm} নতুন কোনো কাস্টমার বা ক্লায়েন্ট নিচ্ছে?`,
      `${g}। ${area}-এর ${businessName} কি ${tn} নতুন অর্ডার বা বুকিং নিচ্ছে?`,
      `${g}। একটু জানতে চাইছিলাম — ${businessName} কি ${tw} ${area}-তে নতুন কাজ নিচ্ছে?`,
      `${g}। ${area}-তে ${businessName} কি ${tm} নতুন ক্লায়েন্ট নেওয়া শুরু করেছে?`,
    ]);
  }

  const HARDCODED_INSTANCES = ['openclaw'];
  // Prefer ACTIVE_INSTANCES (set by campaign_loop from live health check)
  // Fall back to EVOLUTION_INSTANCES, then hardcoded default
  const instances = (process.env.ACTIVE_INSTANCES || process.env.EVOLUTION_INSTANCES || HARDCODED_INSTANCES.join(','))
    .split(',').map(s => s.trim()).filter(Boolean);
  const baseUrl = process.env.EVOLUTION_API_BASE_URL || 'http://192.168.1.101:8081';
  const apikey = process.env.EVOLUTION_API_KEY || 'e4686f129a08a357780f37b23d9ecb6489019558f2a02eebe';

  // ── Pre-Send Multi-Instance History Check (Phase 2) ─────────────────────────
  // Query ALL instances before sending. If any instance already contacted this
  // lead or received a reply, update DB and skip.
  console.log(`[PRE-CHECK] Scanning ${instances.length} instance(s) for prior contact with ${phone}...`);
  for (const inst of instances) {
    try {
      const res = await axios.post(
        `${baseUrl}/chat/findMessages/${inst}`,
        { where: { key: { remoteJid: `${phone}@s.whatsapp.net` } }, limit: 10 },
        { headers: { apikey, 'Content-Type': 'application/json' }, timeout: 8000 }
      );
      const msgs = Array.isArray(res.data) ? res.data
        : (res.data?.messages || res.data?.records || []);

      if (msgs.length > 0) {
        const hasReply = msgs.some(m => m?.key?.fromMe === false);
        const hasSent = msgs.some(m => m?.key?.fromMe === true);

        if (hasReply) {
          console.log(`[PRE-CHECK] Lead ${rawPhone} has REPLIED via instance '${inst}'. Marking as replied. Skipping.`);
          await new Promise(r => db.run(
            `UPDATE campaign_leads SET status = 'replied', replied_at = CURRENT_TIMESTAMP WHERE phone = ?`,
            [rawPhone], r
          ));
          await tg.leadSkipped(rawPhone, `Already replied via instance '${inst}'`);
          db.close();
          process.exit(0);
        }

        if (hasSent) {
          console.log(`[PRE-CHECK] Lead ${rawPhone} was already messaged via instance '${inst}'. Recovering DB. Skipping.`);
          await new Promise(r => db.run(
            `UPDATE campaign_leads SET status = 'sent', sent_by_instance = ?, sent_at = CURRENT_TIMESTAMP WHERE phone = ?`,
            [inst, rawPhone], r
          ));
          await tg.leadSkipped(rawPhone, `Already messaged via instance '${inst}' (DB recovery)`);
          db.close();
          process.exit(0);
        }
      }
    } catch (preErr) {
      // Non-fatal: if the API check fails, we continue cautiously
      console.log(`[PRE-CHECK WARNING] Instance '${inst}' history check failed (${preErr.message}). Continuing cautiously.`);
    }
  }
  console.log(`[PRE-CHECK] No prior contact found. Safe to send.`);
  // ── End Pre-Send Check ────────────────────────────────────────────────────────

  // ── Round-Robin Instance Selection ───────────────────────────────────────────
  // Guaranteed alternation between instances — no streaks, no luck required.
  // A counter row in the DB is atomically incremented to pick the next instance.
  const instanceName = await new Promise((resolve) => {
    db.serialize(() => {
      // Create the counter table if it doesn't exist
      db.run(`CREATE TABLE IF NOT EXISTS instance_counter (id INTEGER PRIMARY KEY, counter INTEGER DEFAULT 0)`);
      db.run(`INSERT OR IGNORE INTO instance_counter (id, counter) VALUES (1, 0)`);
      db.get(`SELECT counter FROM instance_counter WHERE id = 1`, [], (err, row) => {
        const counter = row ? row.counter : 0;
        const picked = instances[counter % instances.length];
        const next = counter + 1;
        db.run(`UPDATE instance_counter SET counter = ? WHERE id = 1`, [next]);
        resolve(picked);
      });
    });
  });
  console.log(`[ROUND-ROBIN] Selected instance: ${instanceName} (${instances.indexOf(instanceName) + 1}/${instances.length})`);
  const apiUrl = `${baseUrl}/message/sendText/${instanceName}`;

  try {
    // Advanced Simulation: Send "composing" (typing) status for 3-7 seconds before message
    try {
      const presenceUrl = `${baseUrl}/chat/presenceUpdate/${instanceName}`;
      await axios.post(presenceUrl, {
        number: phone + '@s.whatsapp.net',
        presence: 'composing'
      }, {
        headers: {
          'apikey': apikey,
          'Content-Type': 'application/json'
        }
      });

      const typingSeconds = Math.floor(Math.random() * (7 - 3 + 1)) + 3;
      console.log(`[SIMULATION] Showing "typing..." status for ${typingSeconds} seconds...`);
      await new Promise(r => setTimeout(r, typingSeconds * 1000));
    } catch (presenceErr) {
      console.log(`[WARNING] Presence simulation failed (ignoring): ${presenceErr.message}`);
    }

    const response = await axios.post(apiUrl, {
      number: phone + '@s.whatsapp.net',
      text: message
    }, {
      headers: {
        'apikey': apikey,
        'Content-Type': 'application/json'
      }
    });
    console.log(`[SUCCESS] Message successfully pushed via instance ${instanceName} to Evolution API for ${phone}`);

    // Mark as sent — record which instance was used
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE campaign_leads SET status = 'sent', sent_at = CURRENT_TIMESTAMP, sent_by_instance = ? WHERE phone = ?`,
        [instanceName, rawPhone],
        function (err) {
          if (err) {
            console.error("[WARNING] Failed to update lead status to 'sent' in database:", err.message);
            reject(err);
          } else {
            console.log(`[SUCCESS] Lead ${rawPhone} marked 'sent' via instance '${instanceName}'.`);
            resolve();
          }
        }
      );
    });

    // Telegram notification
    await tg.messageSent(rawPhone, instanceName, businessName);

  } catch (error) {
    console.error("[CRITICAL ERROR] Failed to send message:", error.message);
    await tg.messageFailed(rawPhone, error.message);

    // Mark as failed — increment retry_count
    await new Promise((resolve) => {
      db.run(
        `UPDATE campaign_leads
         SET status = 'failed',
             last_failed_at = CURRENT_TIMESTAMP,
             retry_count = COALESCE(retry_count, 0) + 1
         WHERE phone = ?`,
        [rawPhone],
        (err) => {
          if (err) console.error("[WARNING] Failed to mark lead as failed:", err.message);
          else console.log(`[UPDATED] Lead ${rawPhone} marked 'failed' (retry_count incremented).`);
          resolve();
        }
      );
    });

    db.close();
    process.exit(1);
  }

  // Safety: Mandatory random delay between messages (now increased to 3-7 minutes)
  const minDelay = 180000;  // 3 minutes
  const maxDelay = 420000;  // 7 minutes
  const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
  console.log(`Waiting ${Math.floor(randomDelay / 1000)} seconds as a mandatory safety random delay...`);
  await new Promise(r => setTimeout(r, randomDelay));

  // Protocol: Long Break after every 7 messages sent today to break patterns
  const sentToday = await new Promise((resolve) => {
    db.get(`SELECT count(*) as count FROM campaign_leads WHERE status = 'sent' AND date(sent_at, 'localtime') = date('now', 'localtime')`, [], (err, row) => {
      resolve(row ? row.count : 0);
    });
  });

  if (sentToday > 0 && sentToday % 7 === 0) {
    const breakMins = Math.floor(Math.random() * (40 - 20 + 1)) + 20;
    console.log(`[LONG BREAK] ${sentToday} messages sent today. Taking a ${breakMins} minute human-like break...`);
    await new Promise(r => setTimeout(r, breakMins * 60000));
  }

  db.close();
}

main().catch(err => {
  console.error("Script error:", err);
  process.exit(1);
});
