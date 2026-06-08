const fs = require('fs');
const path = require('path');
const sqlDb = require('./sql-database');

async function migrate(dbPath) {
    try {
        if (!fs.existsSync(dbPath)) {
            console.log('[Migrator] No JSON database found to migrate. Fresh start.');
            return;
        }

        // Check if migration is already done in SQLite
        const checkMigration = sqlDb.readSlice(['migration_done']);
        if (checkMigration.migration_done) {
            console.log('[Migrator] Database already migrated to SQLite.');
            return;
        }

        console.log('[Migrator] Starting migration from JSON to SQLite...');

        let rawData;
        try {
            rawData = fs.readFileSync(dbPath, 'utf8');
        } catch (readErr) {
            console.error('[Migrator] Cannot read JSON file:', readErr.message);
            return;
        }

        let dbData;
        try {
            dbData = JSON.parse(rawData);
        } catch (parseErr) {
            console.error('[Migrator] Cannot parse JSON file:', parseErr.message);
            return;
        }

        const success = sqlDb.writeFull(dbData);
        if (success) {
            // Mark migration as done
            sqlDb.writeFull({ migration_done: true });
            console.log('[Migrator] Migration completed successfully.');

            // Keep old JSON file as backup
            try {
                const backupPath = dbPath.replace('.json', '_pre_sql.json');
                fs.copyFileSync(dbPath, backupPath);
                console.log('[Migrator] Old JSON database backed up to: ' + backupPath);
            } catch (backupErr) {
                console.warn('[Migrator] Could not create backup:', backupErr.message);
            }
        } else {
            console.error('[Migrator] Migration failed during writeFull.');
        }

    } catch (e) {
        console.error('[Migrator] Error during migration:', e.message);
    }
}

module.exports = {
    migrate
};
