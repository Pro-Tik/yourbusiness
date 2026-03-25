const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('data.sqlite');
db.all("SELECT DISTINCT category FROM campaign_leads", [], (err, rows) => {
  if (err) console.error(err);
  else console.log(rows);
  db.close();
});
