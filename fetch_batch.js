const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('data.sqlite');

const dhakaTimeString = new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" });
const currentHour = new Date(dhakaTimeString).getHours();
if (currentHour < 8 || currentHour >= 18) {
  console.log(JSON.stringify({ message: "Outside working hours (8 AM - 6 PM). Sleeping." }));
  process.exit(0);
}

db.get(`SELECT count(*) as count FROM campaign_leads WHERE status = 'sent' AND date(sent_at) = date('now')`, [], (err, row) => {
  if (err) {
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
  
  if (row && row.count >= 30) {
    console.log(JSON.stringify({ message: "Daily limit of 30 messages reached. Sleeping until tomorrow." }));
    process.exit(0);
  }

  db.all(`
    SELECT phone, business_name as name, area 
    FROM campaign_leads 
    WHERE status = 'pending' 
    AND category LIKE '%Interior Design%' 
    AND website_status = 'No Website'
    LIMIT 20
  `, [], (fetchErr, rows) => {
    if (fetchErr) {
      console.error(JSON.stringify({ error: fetchErr.message }));
      db.close();
      return;
    }
    console.log(JSON.stringify(rows, null, 2));
    db.close();
  });
});
