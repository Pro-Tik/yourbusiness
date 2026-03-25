const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('data.sqlite');

const dhakaTimeString = new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" });
const currentHour = new Date(dhakaTimeString).getHours();
if (currentHour < 8 || currentHour >= 18) {
  console.log(JSON.stringify({ message: "Outside working hours (8 AM - 6 PM). Sleeping." }));
  process.exit(0);
}

db.all(`
  SELECT phone, business_name as name, area 
  FROM campaign_leads 
  WHERE status = 'pending' 
  AND category LIKE '%Interior Design%' 
  AND website_status = 'No Website'
  LIMIT 20
`, [], (err, rows) => {
  if (err) {
    console.error(JSON.stringify({ error: err.message }));
    return;
  }
  console.log(JSON.stringify(rows, null, 2));
});

db.close();
