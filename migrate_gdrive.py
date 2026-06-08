import sys

with open('e:/baraaq/google-drive-main.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Patch runDriveBackup
old_backup = """  const dbPath = getDbPath();
  let databaseObj = {};
  try {
    if (fs.existsSync(dbPath)) {
      databaseObj = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    }
  } catch (e) {
    console.warn('[Google Drive] db read', e.message);
  }"""

new_backup = """  const sqlDb = require('./sql-database');
  let databaseObj = sqlDb.readFull();"""

content = content.replace(old_backup, new_backup)

# Patch restore
old_restore = """    if (!payload.database || typeof payload.database !== 'object') {
      return { success: false, error: 'invalid_backup' };
    }

    const dbPath = getDbPath();
    fs.writeFileSync(dbPath, JSON.stringify(payload.database, null, 2), 'utf8');"""

new_restore = """    if (!payload.database || typeof payload.database !== 'object') {
      return { success: false, error: 'invalid_backup' };
    }

    const sqlDb = require('./sql-database');
    sqlDb.writeFull(payload.database);"""

content = content.replace(old_restore, new_restore)

with open('e:/baraaq/google-drive-main.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("google-drive-main.js patched")
