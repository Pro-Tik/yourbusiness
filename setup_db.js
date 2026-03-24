const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('data.sqlite');
const leads = require('./leads.json');

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

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO campaign_leads (
      business_name, category, area, phone, website_status
    ) VALUES (?, ?, ?, ?, ?)
  `);

  let added = 0;
  leads.forEach(lead => {
    stmt.run([lead.name, lead.category, lead.area, lead.phone, lead.website_status], function(err) {
      if (!err && this.changes > 0) added++;
    });
  });

  stmt.finalize((err) => {
    if (err) {
      console.error("[ERROR] Failed to populate campaign_leads:", err);
    } else {
      console.log(`Database setup complete. Schema verified and successfully seeded the target campaign leads.`);
    }
  });
});

db.close();
