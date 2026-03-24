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
  `);

  db.run(`
    INSERT OR IGNORE INTO campaign_leads (
      business_name, category, area, phone, website, address, search_query, website_status
    )
    SELECT
      "Business Name", "Category", "Area", "Phone Number", "Website", "Address", "Search Query", "Website Status"
    FROM "Untitled spreadsheet - Probaho Targets"
    WHERE "Phone Number" IS NOT NULL AND "Phone Number" != ''
  `, function(err) {
    if (err) {
      console.error(err);
    } else {
      console.log(`Database setup complete. Imported leads into campaign_leads. Rows added: ${this.changes}`);
    }
  });
});

db.close();
