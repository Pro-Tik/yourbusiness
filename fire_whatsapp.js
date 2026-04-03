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

  // Fix #4: Use DB_PATH env var
  const DB_PATH = process.env.DB_PATH || 'data.sqlite';
  const db = new sqlite3.Database(DB_PATH);

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

  // === SPINTAX POOLS ===
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
      `${g}। ${area}-তে ${businessName} কি ${tn} group ডাইনিং বা ক্যাটারিং অফার করছে?`,
    ]);
  } else {
    message = randomChoice([
      `${g}। ${businessName} কি ${tt} ${area}-তে নতুন কোনো কাস্টমার বা ক্লায়েন্ট সার্ভিস নিচ্ছে?`,
      `${g}। ${area}-এর ${businessName} কি ${tn} নতুন কাস্টমারদের জন্য খোলা আছে?`,
      `${g}। একটু জানতে চাইছিলাম — ${businessName} কি ${tm} ${area}-তে অ্যাভেইলেবল আছে?`,
      `${g}। ${area}-তে ${businessName} কি ${tm} নতুন ক্লায়েন্ট নেওয়া শুরু করেছে?`,
    ]);
  }

  const HARDCODED_INSTANCES = ['openclaw'];
  // activeInstances: healthy & under capacity (passed from campaign_loop)
  const activeInstances = (process.env.ACTIVE_INSTANCES || process.env.EVOLUTION_INSTANCES || HARDCODED_INSTANCES.join(','))
    .split(',').map(s => s.trim()).filter(Boolean);

  // Fix #2: allInstances: ALL configured instances (used for pre-send history check)
  const allInstances = (process.env.EVOLUTION_INSTANCES || HARDCODED_INSTANCES.join(','))
    .split(',').map(s => s.trim()).filter(Boolean);

  const baseUrl = process.env.EVOLUTION_API_BASE_URL || 'http://192.168.1.101:8081';
  const apikey = process.env.EVOLUTION_API_KEY || 'e4686f129a08a357780f37b23d9ecb6489019558f2a02eebe';

  // ── Pre-Send History Check (Bug #2 Fix) ───────────────────────────────────
  console.log(`[PRE-CHECK] Scanning ${allInstances.length} instance(s) for prior contact with ${phone}...`);
  for (const inst of allInstances) {
    try {
      const res = await axios.post(
        `${baseUrl}/chat/findMessages/${inst}`,
        { where: { key: { remoteJid: `${phone}@s.whatsapp.net` } }, limit: 10 },
        { headers: { apikey, 'Content-Type': 'application/json' }, timeout: 8000 }
      );
      const msgs = Array.isArray(res.data) ? res.data : (res.data?.messages || res.data?.records || []);

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
      console.log(`[PRE-CHECK WARNING] Instance '${inst}' check failed (${preErr.message}).`);
    }
  }
  console.log(`[PRE-CHECK] No prior contact found. Safe to send.`);

  // ── Round-Robin (Uses activeInstances ONLY) ────────────────────────────────
  const instanceName = await new Promise((resolve) => {
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS instance_counter (id INTEGER PRIMARY KEY, counter INTEGER DEFAULT 0)`);
      db.run(`INSERT OR IGNORE INTO instance_counter (id, counter) VALUES (1, 0)`);
      db.get(`SELECT counter FROM instance_counter WHERE id = 1`, [], (err, row) => {
        const counter = row ? row.counter : 0;
        const picked = activeInstances[counter % activeInstances.length];
        const next = counter + 1;
        db.run(`UPDATE instance_counter SET counter = ? WHERE id = 1`, [next]);
        resolve(picked);
      });
    });
  });
  console.log(`[ROUND-ROBIN] Selected instance: ${instanceName} (${activeInstances.indexOf(instanceName) + 1}/${activeInstances.length})`);

  const apiUrl = `${baseUrl}/message/sendText/${instanceName}`;

  try {
    // Typing simulation
    try {
      await axios.post(`${baseUrl}/chat/presenceUpdate/${instanceName}`, {
        number: phone + '@s.whatsapp.net',
        presence: 'composing'
      }, { headers: { 'apikey': apikey, 'Content-Type': 'application/json' } });

      const typingSecs = Math.floor(Math.random() * (7 - 3 + 1)) + 3;
      console.log(`[SIMULATION] Showing "typing..." status for ${typingSecs} seconds...`);
      await new Promise(r => setTimeout(r, typingSecs * 1000));
    } catch (pErr) { console.log(`[WARNING] Presence failed: ${pErr.message}`); }

    const response = await axios.post(apiUrl, {
      number: phone + '@s.whatsapp.net',
      text: message
    }, { headers: { 'apikey': apikey, 'Content-Type': 'application/json' } });

    console.log(`[SUCCESS] Message pushed via ${instanceName} for ${phone}`);

    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE campaign_leads SET status = 'sent', sent_at = CURRENT_TIMESTAMP, sent_by_instance = ? WHERE phone = ?`,
        [instanceName, rawPhone],
        (err) => err ? reject(err) : resolve()
      );
    });

    await tg.messageSent(rawPhone, instanceName, businessName);

  } catch (error) {
    console.error("[CRITICAL ERROR] Failed to send message:", error.message);
    await tg.messageFailed(rawPhone, error.message);
    await new Promise((resolve) => {
      db.run(
        `UPDATE campaign_leads SET status = 'failed', last_failed_at = CURRENT_TIMESTAMP,
                retry_count = COALESCE(retry_count, 0) + 1
         WHERE phone = ?`, [rawPhone], () => resolve()
      );
    });
    db.close();
    process.exit(1);
  }

  // Mandatory random delay 3-7 mins
  const minDelay = 180000;
  const maxDelay = 420000;
  const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
  console.log(`Waiting ${Math.floor(randomDelay / 1000)}s mandatory safety delay...`);
  await new Promise(r => setTimeout(r, randomDelay));

  // Fix #5: Protocol: Long Break after every 7 messages sent by THIS INSTANCE today
  const sentByThisInstanceToday = await new Promise((resolve) => {
    db.get(
      `SELECT count(*) as count FROM campaign_leads
       WHERE status = 'sent' AND date(sent_at, 'localtime') = date('now', 'localtime')
       AND sent_by_instance = ?`,
      [instanceName],
      (err, row) => resolve(row ? row.count : 0)
    );
  });

  if (sentByThisInstanceToday > 0 && sentByThisInstanceToday % 7 === 0) {
    const breakMins = Math.floor(Math.random() * (40 - 20 + 1)) + 20;
    console.log(`[LONG BREAK] ${sentByThisInstanceToday} sent by ${instanceName} today. Taking a ${breakMins} min break...`);
    await new Promise(r => setTimeout(r, breakMins * 60000));
  }

  db.close();
}

main().catch(err => {
  console.error("Script error:", err);
  process.exit(1);
});
