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

  // 1. Fetch details from database to prevent AI hallucination and unquoted argument bugs
  const db = new sqlite3.Database('data.sqlite');
  
  const lead = await new Promise((resolve, reject) => {
    db.get(`SELECT business_name, area FROM campaign_leads WHERE phone = ?`, [rawPhone], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
  db.close();

  if (!lead) {
    console.error(`[ERROR] No lead found in the database with phone number: ${rawPhone}`);
    process.exit(1);
  }

  const name = lead.business_name;
  const area = lead.area;

  // 2. Sanitize and format the phone number
  let phone = rawPhone.replace(/\D/g, ''); // Remove non-digit characters
  if (phone.startsWith('01') && phone.length === 11) {
    phone = '88' + phone;
  }

  // 3. Fallback logic for missing Name or Area
  const greetingName = name && name.trim() !== '' && name !== '-' ? name.trim() : 'there';
  const areaText = area && area.trim() !== '' && area !== '-' ? ` in ${area.trim()}` : '';

  const message = `Hello ${greetingName},\n\nWe noticed your business${areaText}. We are offering a special 3,500 BDT promo for our digital marketing services. Would you be interested?`;

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
  } catch (error) {
    console.error("[CRITICAL ERROR] Failed to send message:", error.message);
    console.log("Exiting with failure code to prevent agent from marking as 'sent'.");
    process.exit(1);
  }

  console.log("Waiting 60 seconds as a mandatory safety delay...");
  await new Promise(r => setTimeout(r, 60000));
}

main().catch(err => {
  console.error("Script error:", err);
  process.exit(1);
});
