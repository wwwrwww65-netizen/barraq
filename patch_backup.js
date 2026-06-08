const fs = require('fs');
let content = fs.readFileSync('e:/baraaq/main.js', 'utf8');
const lines = content.split('\r\n');

// Replace lines 1341-1366 (index 1340-1365)
const newFunction = [
'function runLocalDiskBackupJob(parentDir, dbFilePath, localStorageSnapshot) {',
'  try {',
'    if (!parentDir || typeof parentDir !== "string") return { success: false, error: "no_folder" };',
'    const norm = path.normalize(parentDir.trim());',
'    if (!fs.existsSync(norm)) return { success: false, error: "folder_missing" };',
'    if (!fs.statSync(norm).isDirectory()) return { success: false, error: "not_a_directory" };',
'    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);',
'    const destDir = path.join(norm, "MisterCasherPOS_backup_" + stamp);',
'    fs.mkdirSync(destDir, { recursive: true });',
'',
'    // Read full database from SQLite (always current)',
'    const dbObj = dbAPI.readFull();',
'',
'    // 1. Save JSON snapshot (compatible with all restore tools)',
'    fs.writeFileSync(path.join(destDir, "pos_database.json"), JSON.stringify(dbObj, null, 2), "utf8");',
'',
'    // 2. Copy raw SQLite file (fast direct restore)',
'    const sqlDbPath = path.join(app.getPath("userData"), "pos_database.db");',
'    if (fs.existsSync(sqlDbPath)) {',
'      fs.copyFileSync(sqlDbPath, path.join(destDir, "pos_database.db"));',
'    }',
'',
'    const ls = localStorageSnapshot && typeof localStorageSnapshot === "object" ? localStorageSnapshot : {};',
'    fs.writeFileSync(path.join(destDir, "mistercasher_localStorage.json"), JSON.stringify(ls, null, 2), "utf8");',
'    const manifest = {',
'      misterCasherLocalBackupVersion: 2,',
'      exportedAt: new Date().toISOString(),',
'      hostname: os.hostname(),',
'      hasSqlite: true,',
'    };',
'    fs.writeFileSync(path.join(destDir, "backup_manifest.json"), JSON.stringify(manifest, null, 2), "utf8");',
'    return { success: true, destDir };',
'  } catch (err) {',
'    return { success: false, error: err && err.message ? err.message : String(err) };',
'  }',
'}'
];

// Remove old lines 1340-1365 (26 lines) and insert new ones
lines.splice(1340, 26, ...newFunction);

fs.writeFileSync('e:/baraaq/main.js', lines.join('\r\n'));
console.log('runLocalDiskBackupJob updated to use SQLite');
