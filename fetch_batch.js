const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('data.sqlite');

const dhakaTimeString = new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" });
const now = new Date(dhakaTimeString);
const currentHour = now.getHours();
const currentMinute = now.getMinutes();

// Human Jitter: Randomize start (8:00-8:30 AM) and end (5:30-6:00 PM)
const startHour = 8;
const startMinuteJitter = Math.floor(Math.random() * 31); // 0 to 30 mins late
const endHour = 17; // 5 PM
const endMinuteJitter = Math.floor(Math.random() * 31); // ends between 5:30 and 6:00 PM

const isTooEarly = (currentHour < startHour) || (currentHour === startHour && currentMinute < startMinuteJitter);
const isTooLate = (currentHour > endHour + 1) || (currentHour === endHour + 1 && currentMinute > endMinuteJitter);

if (isTooEarly || isTooLate) {
  console.log(JSON.stringify({ message: `Outside jittered working hours. Current: ${currentHour}:${currentMinute}. Sleeping.` }));
  process.exit(0);
}

db.get(`SELECT count(*) as count FROM campaign_leads WHERE status = 'sent' AND date(sent_at) = date('now')`, [], (err, row) => {
  if (err) {
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
  
  // Daily Limit Jitter: Randomize limit between 18 and 24 to avoid fixed patterns
  const dailyLimit = Math.floor(Math.random() * (24 - 18 + 1)) + 18;
  if (row && row.count >= dailyLimit) {
    console.log(JSON.stringify({ message: `Daily jittered limit of ${dailyLimit} reached today (${row.count} sent). Sleeping.` }));
    process.exit(0);
  }

  db.all(`
    SELECT phone, business_name as name, area, category 
    FROM campaign_leads 
    WHERE status = 'pending' 
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
