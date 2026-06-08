const fs = require('fs');

const content = fs.readFileSync('e:/baraaq/main.js', 'utf8');
const lines = content.split('\r\n');

// Find line index of restore handler start and end
let startIdx = -1;
let endIdx = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("ipcMain.handle('restore-backup-execute'")) {
        startIdx = i;
    }
    if (startIdx !== -1 && i > startIdx && lines[i] === '});' && !lines[i-1].includes('//')) {
        // Check if this closes the restore handler
        endIdx = i;
        break;
    }
}

console.log('Restore handler: lines', startIdx+1, 'to', endIdx+1);

// New restore handler
const newHandler = `ipcMain.handle('restore-backup-execute', async (event, options) => {
  try {
    if (!options || !options.backupFolder) {
      return { success: false, error: 'لم يتم تحديد مجلد النسخة الاحتياطية' };
    }

    const backupFolder = String(options.backupFolder).trim();
    if (!backupFolder || !fs.existsSync(backupFolder)) {
      return { success: false, error: 'المجلد غير موجود: ' + backupFolder };
    }

    const dbFile = path.join(backupFolder, 'pos_database.json');
    const sqliteFile = path.join(backupFolder, 'pos_database.db');
    const lsFile = path.join(backupFolder, 'mistercasher_localStorage.json');

    // Must have at least one of JSON or SQLite
    if (!fs.existsSync(dbFile) && !fs.existsSync(sqliteFile)) {
      return { success: false, error: 'لم يتم العثور على ملف قاعدة البيانات في المجلد:\\n' + backupFolder };
    }

    console.log('[Restore] Starting restore from:', backupFolder);

    // === Case 1: SQLite file exists in backup (direct copy - fastest) ===
    if (fs.existsSync(sqliteFile)) {
      try {
        const sqlDbPath = path.join(app.getPath('userData'), 'pos_database.db');
        // Close DB, copy, reopen
        dbAPI.closeDb();
        fs.copyFileSync(sqliteFile, sqlDbPath);
        dbAPI.initDb(sqlDbPath);
        console.log('[Restore] Restored from SQLite file directly');
        writeAuditLog('DATABASE_RESTORED_SQLITE', { from: backupFolder });
      } catch (e) {
        return { success: false, error: 'فشل استعادة ملف SQLite:\\n' + e.message };
      }
    }
    // === Case 2: JSON file exists - convert to SQLite ===
    else {
      let backupDb;
      try {
        const raw = fs.readFileSync(dbFile, 'utf8');
        backupDb = JSON.parse(raw);
      } catch (parseErr) {
        return { success: false, error: 'ملف قاعدة البيانات تالف:\\n' + parseErr.message };
      }

      if (!backupDb || typeof backupDb !== 'object') {
        return { success: false, error: 'تنسيق قاعدة البيانات غير صحيح' };
      }

      // Clear all existing SQLite data then write backup
      try {
        const sqlDbPath = path.join(app.getPath('userData'), 'pos_database.db');
        dbAPI.closeDb();
        // Delete old SQLite and create fresh one
        if (fs.existsSync(sqlDbPath)) fs.unlinkSync(sqlDbPath);
        const walPath = sqlDbPath + '-wal';
        const shmPath = sqlDbPath + '-shm';
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
        dbAPI.initDb(sqlDbPath);

        const success = dbAPI.writeFull(backupDb);
        if (!success) throw new Error('writeFull returned false');

        console.log('[Restore] Restored from JSON to SQLite:', Object.keys(backupDb).length, 'keys');
        writeAuditLog('DATABASE_RESTORED_JSON_TO_SQLITE', {
          from: backupFolder,
          orders: backupDb.orders ? backupDb.orders.length : 0,
          products: backupDb.products ? backupDb.products.length : 0
        });
      } catch (writeErr) {
        console.error('[Restore] Failed to write to SQLite:', writeErr.message);
        return { success: false, error: 'فشل كتابة قاعدة البيانات:\\n' + writeErr.message };
      }
    }

    // Restore localStorage if available
    if (fs.existsSync(lsFile)) {
      try {
        const lsData = JSON.parse(fs.readFileSync(lsFile, 'utf8'));
        if (lsData && typeof lsData === 'object') {
          BrowserWindow.getAllWindows().forEach((win) => {
            if (!win.isDestroyed()) win.webContents.send('restore-local-storage', lsData);
          });
        }
      } catch (lsErr) {
        console.warn('[Restore] LocalStorage warning:', lsErr.message);
      }
    }

    // Notify all windows to reload
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) win.webContents.send('db-file-updated');
    });

    console.log('[Restore] Restore completed successfully!');
    return { success: true };
  } catch (e) {
    console.error('[Restore] Fatal error:', e.message);
    writeAuditLog('RESTORE_ERROR', { error: e.message });
    return { success: false, error: 'خطأ غير متوقع:\\n' + e.message };
  }
});`;

if (startIdx !== -1 && endIdx !== -1) {
    lines.splice(startIdx, endIdx - startIdx + 1, ...newHandler.split('\n'));
    fs.writeFileSync('e:/baraaq/main.js', lines.join('\r\n'));
    console.log('Restore handler fixed! Lines', startIdx+1, 'to', endIdx+1, 'replaced.');
} else {
    console.log('Could not find restore handler bounds. startIdx=', startIdx, 'endIdx=', endIdx);
}
