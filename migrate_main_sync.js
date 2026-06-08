const fs = require('fs');

let content = fs.readFileSync('e:/baraaq/main.js', 'utf8');

// Replace /database endpoint
content = content.replace(
  /if \(req\.method === 'GET' && req\.url === '\/database'\) \{[\s\S]*?\}\) \}\);\n\s*\}/,
  `if (req.method === 'GET' && req.url === '/database') {
      try {
        const sqlDb = require('./sql-database');
        const content = JSON.stringify(sqlDb.readFull());
        res.writeHead(200);
        res.end(content);
      } catch(e) {
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
    }`
);

// Replace runLocalDiskBackupJob
content = content.replace(
  /function runLocalDiskBackupJob[\s\S]*?return \{ success: false, error: err && err\.message \? err\.message : String\(err\) \};\n\s*\}\n\}/,
  `function runLocalDiskBackupJob(parentDir, dbFilePath, localStorageSnapshot) {
  try {
    if (!parentDir || typeof parentDir !== 'string') return { success: false, error: 'no_folder' };
    const norm = path.normalize(parentDir.trim());
    if (!fs.existsSync(norm)) return { success: false, error: 'folder_missing' };
    if (!fs.statSync(norm).isDirectory()) return { success: false, error: 'not_a_directory' };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const destDir = path.join(norm, \`MisterCasherPOS_backup_\${stamp}\`);
    fs.mkdirSync(destDir, { recursive: true });
    
    const sqlDb = require('./sql-database');
    const dbObj = sqlDb.readFull();
    fs.writeFileSync(path.join(destDir, 'pos_database.json'), JSON.stringify(dbObj, null, 2), 'utf8');
    
    const sqlDbPath = path.join(app.getPath('userData'), 'pos_database.db');
    if (fs.existsSync(sqlDbPath)) {
        fs.copyFileSync(sqlDbPath, path.join(destDir, 'pos_database.db'));
    }

    const ls = localStorageSnapshot && typeof localStorageSnapshot === 'object' ? localStorageSnapshot : {};
    fs.writeFileSync(path.join(destDir, 'mistercasher_localStorage.json'), JSON.stringify(ls, null, 2), 'utf8');
    const manifest = {
      misterCasherLocalBackupVersion: 1,
      exportedAt: new Date().toISOString(),
      hostname: os.hostname(),
    };
    fs.writeFileSync(path.join(destDir, 'backup_manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    return { success: true, destDir };
  } catch (err) {
    return { success: false, error: err && err.message ? err.message : String(err) };
  }
}`
);

// Replace fetchDatabaseFromPeer check local data part
content = content.replace(
  /const parsed = JSON\.parse\(body\);\n\s*const dbPath = path\.join\(app\.getPath\('userData'\), 'pos_database\.json'\);\n\n\s*\/\/ \?\? PROTECTION: Check if we already have local data\n\s*try \{\n\s*if \(fs\.existsSync\(dbPath\)\) \{\n\s*const localDb = JSON\.parse\(fs\.readFileSync\(dbPath, 'utf8'\)\);/,
  `const parsed = JSON.parse(body);
        const sqlDb = require('./sql-database');

        // ?? PROTECTION: Check if we already have local data
        try {
          const localDb = sqlDb.readSlice(['orders', 'products']);
          if (true) {`
);

content = content.replace(
  /fs\.writeFileSync\(dbPath, JSON\.stringify\(parsed, null, 2\), 'utf8'\);/,
  `const sqlDb = require('./sql-database');\n          sqlDb.writeFull(parsed);`
);

// Replace DB check in LAN sync
content = content.replace(
  /if \(fs\.existsSync\(dbPath\)\) \{\n\s*const localDb = JSON\.parse\(fs\.readFileSync\(dbPath, 'utf8'\)\);\n\s*const hasLocalData = \(localDb\.orders\?\.length \|\| 0\) > 0 \|\| \(localDb\.products\?\.length \|\| 0\) > 0;/,
  `if (true) {
            const sqlDb = require('./sql-database');
            const localDb = sqlDb.readSlice(['orders', 'products']);
            const hasLocalData = (localDb.orders?.length || 0) > 0 || (localDb.products?.length || 0) > 0;`
);

// Replace restore-backup-execute backup validation and copy
content = content.replace(
  /const dbFile = path\.join\(backupFolder, 'pos_database\.json'\);/,
  `const dbFile = path.join(backupFolder, 'pos_database.json');\n    const sqliteFile = path.join(backupFolder, 'pos_database.db');`
);

content = content.replace(
  /if \(!fs\.existsSync\(dbFile\)\) \{\n\s*return \{ success: false, error: '.*' \};\n\s*\}/,
  `if (!fs.existsSync(dbFile) && !fs.existsSync(sqliteFile)) {
      return { success: false, error: 'ملف قاعدة البيانات غير موجود في النسخة الاحتياطية' };
    }`
);

content = content.replace(
  /let backupDb;\n\s*try \{\n\s*const raw = fs\.readFileSync\(dbFile, 'utf8'\);\n\s*backupDb = JSON\.parse\(raw\);\n\s*\} catch \(parseErr\) \{\n\s*return \{ success: false, error: '.*' \+ parseErr\.message \};\n\s*\}/,
  `let backupDb;
    let isSqlite = false;
    try {
      if (fs.existsSync(sqliteFile)) {
        isSqlite = true;
      } else {
        const raw = fs.readFileSync(dbFile, 'utf8');
        backupDb = JSON.parse(raw);
      }
    } catch (parseErr) {
      return { success: false, error: 'خطأ في القراءة: ' + parseErr.message };
    }`
);

content = content.replace(
  /if \(!backupDb \|\| typeof backupDb !== 'object'\) \{\n\s*return \{ success: false, error: '.*' \};\n\s*\}/,
  `if (!isSqlite && (!backupDb || typeof backupDb !== 'object')) {
      return { success: false, error: 'الملف غير صالح' };
    }`
);

content = content.replace(
  /const tmpBackup = dbPath \+ '\.backup\.' \+ Date\.now\(\);\n\s*if \(fs\.existsSync\(dbPath\)\) fs\.copyFileSync\(dbPath, tmpBackup\);\n\n\s*fs\.writeFileSync\(dbPath, JSON\.stringify\(backupDb, null, 2\), 'utf8'\);/,
  `const sqlDbPath = path.join(app.getPath('userData'), 'pos_database.db');
      const tmpBackup = sqlDbPath + '.backup.' + Date.now();
      if (fs.existsSync(sqlDbPath)) fs.copyFileSync(sqlDbPath, tmpBackup);

      const sqlDb = require('./sql-database');
      if (isSqlite) {
        sqlDb.closeDb();
        fs.copyFileSync(sqliteFile, sqlDbPath);
        sqlDb.initDb(sqlDbPath);
      } else {
        sqlDb.writeFull(backupDb);
      }`
);

fs.writeFileSync('e:/baraaq/main.js', content);
console.log('main.js fully patched for sync/backup!');
