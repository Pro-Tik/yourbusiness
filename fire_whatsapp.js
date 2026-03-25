require('dotenv').config();
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: node fire_whatsapp.js <phone>");
    process.exit(1);
  }

  const rawPhone = args[0];

  const db = new sqlite3.Database('data.sqlite');
  
  const lead = await new Promise((resolve, reject) => {
    db.get(`SELECT business_name, area FROM campaign_leads WHERE phone = ?`, [rawPhone], (err, row) => {
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

  let phone = rawPhone.replace(/\D/g, ''); 
  if (phone.startsWith('01') && phone.length === 11) {
    phone = '88' + phone;
  }

  const businessName = rawName.trim() !== '' && rawName !== '-' ? rawName.trim() : 'your business';
  const area = rawArea.trim() !== '' && rawArea !== '-' ? rawArea.trim() : 'your area';

  const message = `Assalamu Walaikum. I know you are busy, so I will keep this under 60 seconds. 

I was searching for top Interior Design firms in ${area} and noticed ${businessName} doesn't have an official website yet.

We are a local agency, and if you are open to it, we can build a highly professional, modern website for your portfolio at a very negotiable price.

Would you like me to send over a quick live demo to see what it could look like?`;

  const apiUrl = process.env.EVOLUTION_API_URL || 'http://localhost:8080/message/sendText/{instanceName}';
  const apikey = process.env.EVOLUTION_API_KEY || 'your_api_key';

  try {
    /* 
    const response = await axios.post(apiUrl, {
      number: phone + '@s.whatsapp.net',
      text: message
    }, {
      headers: {
        'apikey': apikey,
        'Content-Type': 'application/json'
      }
    });
    console.log("Message sent successfully:", response.data);
    */
    console.log(`[MOCK SUCCESS] Sent message to ${phone}`);
    console.log(`Message content: \\n${message}`);

    // Critical Safety Update: Automatically mark as sent upon success to definitively prevent double-texting
    await new Promise((resolve, reject) => {
      db.run(`UPDATE campaign_leads SET status = 'sent' WHERE phone = ?`, [rawPhone], function(err) {
        if (err) {
          console.error("[WARNING] Failed to update lead status to 'sent' in database:", err.message);
          reject(err);
        } else {
          console.log(`[SUCCESS] Database updated! Lead ${rawPhone} immediately permanently marked as 'sent'.`);
          resolve();
        }
      });
    });

  } catch (error) {
    console.error("[CRITICAL ERROR] Failed to send message:", error.message);
    
    // Mark as failed in DB so we don't infinitely retry the same incorrect number
    await new Promise((resolve, reject) => {
      db.run(`UPDATE campaign_leads SET status = 'failed' WHERE phone = ?`, [rawPhone], function(err) {
        if (err) {
          console.error("[WARNING] Failed to update lead status to 'failed' in database:", err.message);
          resolve(); // Resolve anyway to proceed with exit
        } else {
          console.log(`[UPDATED] Database updated! Lead ${rawPhone} marked as 'failed'.`);
          resolve();
        }
      });
    });

    console.log("Exiting with failure code to prevent any marking.");
    db.close();
    process.exit(1);
  }

  db.close();
  const minDelay = 60000;
  const maxDelay = 180000;
  const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
  console.log(`Waiting ${Math.floor(randomDelay/1000)} seconds as a mandatory safety random delay...`);
  await new Promise(r => setTimeout(r, randomDelay));
}

main().catch(err => {
  console.error("Script error:", err);
  process.exit(1);
});
