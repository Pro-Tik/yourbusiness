const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('data.sqlite');

db.all(`
  SELECT phone, business_name as name, area 
  FROM campaign_leads 
  WHERE status = 'pending' 
  AND category LIKE '%Interior Design%' 
  AND website_status = 'No Website'
  LIMIT 5
`, [], (err, rows) => {
  if (err) {
    console.error(JSON.stringify({ error: err.message }));
    return;
  }
  console.log(JSON.stringify(rows, null, 2));
});

db.close();
