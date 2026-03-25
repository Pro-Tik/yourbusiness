const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('data.sqlite');
db.run("ALTER TABLE campaign_leads ADD COLUMN sent_at DATETIME;", (err) => {
    if (err) console.error("Migration error (may already exist):", err.message);
    else console.log("Successfully added sent_at column");
    db.close();
});
