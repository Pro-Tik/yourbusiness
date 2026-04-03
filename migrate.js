/**
 * migrate.js
 * Idempotent schema migrations — safe to run multiple times.
 * Each ALTER TABLE is wrapped in a try/catch so re-running never breaks anything.
 */
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('data.sqlite');

const migrations = [
    // Original
    `ALTER TABLE campaign_leads ADD COLUMN sent_at DATETIME`,
    // v2: Multi-instance tracking
    `ALTER TABLE campaign_leads ADD COLUMN sent_by_instance TEXT`,
    `ALTER TABLE campaign_leads ADD COLUMN replied_at DATETIME`,
    `ALTER TABLE campaign_leads ADD COLUMN auto_replied INTEGER DEFAULT 0`,
    // v2: Atomic lead claiming — prevents race conditions with multiple workers
    `ALTER TABLE campaign_leads ADD COLUMN claimed_at DATETIME`,
];

db.serialize(() => {
    // status column already exists with DEFAULT 'pending' from setup_db.js
    // Add 'in_progress' as a valid status (just a value, no schema change needed)

    let pending = migrations.length;
    migrations.forEach((sql) => {
        db.run(sql, (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                console.error(`[MIGRATION ERROR] ${sql}\n  →`, err.message);
            } else if (!err) {
                console.log(`[MIGRATION OK] ${sql}`);
            } else {
                console.log(`[MIGRATION SKIP] Column already exists: ${sql}`);
            }
            pending--;
            if (pending === 0) {
                db.close(() => console.log('Migration complete.'));
            }
        });
    });
});
