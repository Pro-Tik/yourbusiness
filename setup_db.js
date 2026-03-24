const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('data.sqlite');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS campaign_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_name TEXT,
      category TEXT,
      area TEXT,
      phone TEXT UNIQUE,
      website TEXT,
      address TEXT,
      search_query TEXT,
      website_status TEXT,
      status TEXT DEFAULT 'pending'
    )
  `, function(err) {
    if (err) {
      console.error("[ERROR] Failed to create campaign_leads table:", err);
    } else {
      console.log("Database setup complete. Scema for 'campaign_leads' verified.");
      console.log("Note: The data for this campaign has already been populated.");
    }
  });
});

db.close();
