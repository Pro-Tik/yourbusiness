const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('data.sqlite');

const phone = process.argv[2];
if (!phone) {
  console.error("Usage: node mark_completed.js <phone>");
  process.exit(1);
}

db.run(`UPDATE campaign_leads SET status = 'sent' WHERE phone = ?`, [phone], function(err) {
  if (err) {
    console.error("Error updating status:", err.message);
  } else {
    console.log(`Updated status to 'sent' for phone: ${phone}. Changes: ${this.changes}`);
  }
});

db.close();
