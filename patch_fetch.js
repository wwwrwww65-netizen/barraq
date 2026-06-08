const fs = require('fs');
let content = fs.readFileSync('e:/baraaq/main.js', 'utf8');
const lines = content.split('\r\n');

// Replace lines 628-675 (index 627-674, 48 lines)
const newLines = [
'        } catch (backupErr) {',
'          console.warn("[HTTP Sync] Backup warning:", backupErr.message);',
'        }',
'',
'        writeAuditLog("SYNC_FROM_PEER_START", { peerIp: ip });',
'',
'        // Write parsed data to SQLite',
'        const writeSuccess = dbAPI.writeFull(parsed);',
'        if (!writeSuccess) throw new Error("writeFull to SQLite returned false");',
'',
'        console.log("[HTTP Sync] Database pulled from peer and saved to SQLite:", ip);',
'        writeAuditLog("SYNC_FROM_PEER_SUCCESS", {',
'          peerIp: ip,',
'          orders: parsed.orders ? parsed.orders.length : 0,',
'          products: parsed.products ? parsed.products.length : 0',
'        });',
'        probePeerWaReady(ip, (capable) => {',
'          if (capable) notifyLanSyncHubCandidate(ip);',
'        });',
'        BrowserWindow.getAllWindows().forEach((win) => {',
'          if (!win.isDestroyed()) win.webContents.send("db-file-updated");',
'        });',
'        if (cb) cb(null);'
];

lines.splice(627, 48, ...newLines);
fs.writeFileSync('e:/baraaq/main.js', lines.join('\r\n'));
console.log('Done - replaced lines 628-675 with SQLite write');
