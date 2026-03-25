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

  const greetings = ["Assalamu Walaikum.", "Hello!", "Salam!", "Hi there,", "Greetings!"];
  const subgreetings = ["I know you are busy, so I will keep this under 60 seconds.", "I'll be quick since I know you're busy.", "I won't take much of your time.", "Quick question for you."];
  const openings = [
    `I was searching for top ${category} businesses in ${area}`,
    `I was looking for reliable ${category} services around ${area}`,
    `I was checking out local ${category} firms in ${area}`,
    `I was browsing for the best ${category} options in ${area}`
  ];
  const issues = [
    `and noticed ${businessName} doesn't have an official website yet.`,
    `and realized that ${businessName} is missing a professional website.`,
    `and couldn't find a modern website for ${businessName}.`,
    `but saw that ${businessName} does not seem to have an active website.`
  ];
  const pitches = [
    `We are a local agency, and if you are open to it, we can build a highly professional, modern website for your portfolio at a very negotiable price.`,
    `My team builds premium websites for local businesses. If you're interested, we can create a stunning site for you at an affordable rate.`,
    `We specialize in web design for local services, and we'd love to build a modern website for your business at a great price.`
  ];
  const closings = [
    `Would you like me to send over a quick live demo to see what it could look like?`,
    `Can I shoot over a quick demo link to show you what we have in mind?`,
    `Are you open to seeing a quick preview of what it could look like?`,
    `Should I send over a quick video demo of the layout?`
  ];

  const randomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];
  
  const message = `${randomChoice(greetings)} ${randomChoice(subgreetings)}

${randomChoice(openings)} ${randomChoice(issues)}

${randomChoice(pitches)}

${randomChoice(closings)}`;

  const instances = process.env.EVOLUTION_INSTANCES ? process.env.EVOLUTION_INSTANCES.split(',') : ['openclaw'];
  const instanceName = instances[Math.floor(Math.random() * instances.length)];
  const baseUrl = process.env.EVOLUTION_API_BASE_URL || 'http://192.168.1.101:8081';
  const apiUrl = `${baseUrl}/message/sendText/${instanceName}`;
  const apikey = process.env.EVOLUTION_API_KEY || 'e4686f129a08a357780f37b23d9ecb6489019558f2a02eebe';

  try {
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

    // Critical Safety Update: Automatically mark as sent upon success to definitively prevent double-texting
    await new Promise((resolve, reject) => {
      db.run(`UPDATE campaign_leads SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE phone = ?`, [rawPhone], function(err) {
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
