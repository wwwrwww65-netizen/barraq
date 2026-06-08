const fs = require('fs');

let content = fs.readFileSync('e:/baraaq/main.js', 'utf8');

// Fix /database HTTP endpoint
content = content.replace(
    "    if (req.method === 'GET' && req.url === '/database') {\n      // تم التحويل إلى async لمنع حجب Main Process عند خدمة الأجهزة الأخرى على الشبكة\n      fs.promises.readFile(dbPath, 'utf8')\n        .then(content => { res.writeHead(200); res.end(content); })\n        .catch(e => { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); });",
    "    if (req.method === 'GET' && req.url === '/database') {\n      // Serve from SQLite\n      try {\n        const fullData = dbAPI.readFull();\n        res.writeHead(200);\n        res.end(JSON.stringify(fullData));\n      } catch (e) {\n        res.writeHead(500);\n        res.end(JSON.stringify({ error: e.message }));\n      }"
);

// Fix inner local data check in fetchDatabaseFromPeer to use SQLite
content = content.replace(
    "          if (fs.existsSync(dbPath)) {\n            const localDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));\n            const hasLocalOrders = localDb.orders && localDb.orders.length > 0;\n            const hasLocalProducts = localDb.products && localDb.products.length > 0;\n\n            if (hasLocalOrders || hasLocalProducts) {",
    "          const localSlice = dbAPI.readSlice(['orders', 'products']);\n            const hasLocalOrders = localSlice.orders && localSlice.orders.length > 0;\n            const hasLocalProducts = localSlice.products && localSlice.products.length > 0;\n\n            if (hasLocalOrders || hasLocalProducts) {"
);

// Remove backup section and atomic write, replace with SQLite writeFull
// Find the backup section + atomic write and replace
const backupStart = "        // 🛡️ Create backup before writing\n        try {\n          if (fs.existsSync(dbPath)) {";
const backupEnd = "        }).catch(e => {\n          console.error('[HTTP Sync] ❌ Write error from', ip, ':', e.message);\n          writeAuditLog('SYNC_FROM_PEER_ERROR', { peerIp: ip, error: e.message });\n          // Clean up temp file if exists\n          try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (e) { }\n          if (cb) cb(e);\n        });";

const idx1 = content.indexOf(backupStart);
const idx2 = content.indexOf(backupEnd);

if (idx1 !== -1 && idx2 !== -1) {
    const newSyncWrite = `        writeAuditLog('SYNC_FROM_PEER_START', { peerIp: ip });

        // Write to SQLite
        const writeSuccess = dbAPI.writeFull(parsed);
        if (!writeSuccess) throw new Error('writeFull to SQLite returned false');

        console.log('[HTTP Sync] OK Database pulled from peer and saved to SQLite:', ip);
        writeAuditLog('SYNC_FROM_PEER_SUCCESS', {
          peerIp: ip,
          orders: parsed.orders ? parsed.orders.length : 0,
          products: parsed.products ? parsed.products.length : 0
        });
        probePeerWaReady(ip, (capable) => {
          if (capable) notifyLanSyncHubCandidate(ip);
        });
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) win.webContents.send('db-file-updated');
        });
        if (cb) cb(null);`;
    
    // Remove the old writeAuditLog('SYNC_FROM_PEER_START') line before the block
    const startOfWriteAudit = content.lastIndexOf("writeAuditLog('SYNC_FROM_PEER_START'", idx1);
    
    content = content.slice(0, startOfWriteAudit) + newSyncWrite + content.slice(idx2 + backupEnd.length);
    console.log('fetchDatabaseFromPeer write logic replaced');
} else {
    console.log('Could not find backup section. idx1=' + idx1 + ' idx2=' + idx2);
}

// Fix UDP db_changed check - replace JSON file read with SQLite
content = content.replace(
    "if (fs.existsSync(dbPath)) {\n            const localDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));\n            const hasLocalData = (localDb.orders?.length || 0) > 0 || (localDb.products?.length || 0) > 0;\n            if (!hasLocalData) {\n              writeAuditLog('DB_CHANGED_FETCH_PEER', { peerIp: rinfo.address, reason: 'no_local_data' });\n              fetchDatabaseFromPeer(rinfo.address);\n            } else {\n              console.log('[Sync] Ignoring db_changed - local data exists');\n              writeAuditLog('DB_CHANGED_IGNORED', { peerIp: rinfo.address, reason: 'has_local_data' });\n            }\n          } else {\n            writeAuditLog('DB_CHANGED_FETCH_PEER', { peerIp: rinfo.address, reason: 'no_db_file' });\n            fetchDatabaseFromPeer(rinfo.address);\n          }",
    "// Check SQLite for local data\n            const localSlice2 = dbAPI.readSlice(['orders', 'products']);\n            const hasLocalData = (localSlice2.orders ? localSlice2.orders.length : 0) > 0 || (localSlice2.products ? localSlice2.products.length : 0) > 0;\n            if (!hasLocalData) {\n              writeAuditLog('DB_CHANGED_FETCH_PEER', { peerIp: rinfo.address, reason: 'no_local_data' });\n              fetchDatabaseFromPeer(rinfo.address);\n            } else {\n              console.log('[Sync] Ignoring db_changed - local data exists');\n              writeAuditLog('DB_CHANGED_IGNORED', { peerIp: rinfo.address, reason: 'has_local_data' });\n            }"
);

fs.writeFileSync('e:/baraaq/main.js', content);
console.log('All patches applied');
