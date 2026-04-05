const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { setupGoogleDriveIpc, startGoogleDriveAutoScheduler } = require('./google-drive-main');
const fs = require('fs');
const path = require('path');
const dgram = require('dgram');
const http = require('http');
const os = require('os');

const PORT = 41234;
const HTTP_PORT = 41235;
const BROADCAST_ADDR = '255.255.255.255';
const myInstanceId = Math.random().toString(36).substring(7);

let server;
let httpServer;

/** حد آمن لحجم JSON في حزمة UDP واحدة (restaurant_settings + شعار base64 يتجاوز الحد بسهولة) */
const FULL_SYNC_UDP_SAFE_CHARS = 10000;
/** تجميع أجزاء المزامنة الكاملة الواردة من أجهزة أخرى */
const fullSyncChunkBuffers = new Map();

function tryApplyAssembledFullSync(assembledStr, lanSourceIp) {
  let parsed;
  try {
    parsed = JSON.parse(assembledStr);
  } catch (e) {
    console.error('[Sync] assembled full sync JSON parse failed:', e.message);
    return;
  }
  if (parsed.type !== 'sync_response' || !parsed.payload || typeof parsed.payload !== 'object') return;
  const sourceIp = normalizeLanIp(lanSourceIp || '');
  const send = (waHubCapable) => {
    const envelope = { ...parsed, _lanSourceIp: sourceIp, _waHubCapable: !!waHubCapable };
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) win.webContents.send('apply-full-sync', envelope);
    });
    console.log('[Sync] Full sync applied from chunks, localStorage keys:', Object.keys(parsed.payload).length);
  };
  if (!sourceIp) {
    send(false);
    return;
  }
  probePeerWaReady(sourceIp, (ready) => send(ready));
}

function handleSyncResponsePart(data, sourceIp) {
  const chunkId = data.chunkId;
  const totalParts = Number(data.totalParts);
  const partIndex = Number(data.partIndex);
  const part = data.part;
  if (!chunkId || !Number.isFinite(totalParts) || totalParts < 1) return;
  if (!Number.isFinite(partIndex) || partIndex < 0 || partIndex >= totalParts) return;
  if (typeof part !== 'string') return;

  let buf = fullSyncChunkBuffers.get(chunkId);
  if (!buf) {
    buf = {
      parts: new Array(totalParts),
      totalParts,
      arrived: 0,
      timer: null,
      sourceIp: normalizeLanIp(sourceIp || ''),
    };
    buf.timer = setTimeout(() => {
      fullSyncChunkBuffers.delete(chunkId);
      console.warn('[Sync] full sync chunk timeout:', chunkId);
    }, 120000);
    fullSyncChunkBuffers.set(chunkId, buf);
  } else if (buf.sourceIp === '' && sourceIp) {
    buf.sourceIp = normalizeLanIp(sourceIp);
  }
  if (buf.totalParts !== totalParts) return;
  if (buf.parts[partIndex] != null) return;
  buf.parts[partIndex] = part;
  buf.arrived++;
  if (buf.arrived !== totalParts) return;
  if (buf.timer) clearTimeout(buf.timer);
  fullSyncChunkBuffers.delete(chunkId);
  tryApplyAssembledFullSync(buf.parts.join(''), buf.sourceIp || '');
}

// === Get LAN IP ===
function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

function normalizeLanIp(ip) {
  if (!ip) return '';
  const clean = String(ip).replace(/^::ffff:/, '').trim();
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(clean) || clean === '127.0.0.1') return '';
  return clean;
}

function notifyLanSyncHubCandidate(ip) {
  const clean = normalizeLanIp(ip);
  if (!clean) return;
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send('lan-sync-hub-ip', clean);
  });
}

/** يتحقق عبر HTTP إن كان الجهاز يملك واتساب جاهزاً (لتجنب جعل الفرعي «مركزاً» على الرئيسي عند سحب DB من الفرعي). */
function probePeerWaReady(ip, done) {
  const clean = normalizeLanIp(ip);
  if (!clean) return done(false);
  http.get(`http://${clean}:${HTTP_PORT}/`, (res) => {
    let b = '';
    res.on('data', (d) => {
      b += d;
    });
    res.on('end', () => {
      try {
        done(!!JSON.parse(b).waReady);
      } catch (_) {
        done(false);
      }
    });
  }).on('error', () => done(false));
}

/** طباعة HTML صامتة — مسار واحد لـ print-to-device و print-receipt (preload) */
function scheduleSilentPrint(html, printerName) {
  return new Promise((resolve) => {
    let printWin = null;
    let settled = false;
    const tmpFile = path.join(
      app.getPath('temp'),
      `hash-pos-print-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.html`
    );
    const cleanupFile = () => {
      try {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      } catch (_) { /* ignore */ }
    };
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      cleanupFile();
      resolve(payload);
    };
    try {
      const body = html && String(html).length > 0
        ? String(html)
        : '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>';
      fs.writeFileSync(tmpFile, body, 'utf8');

      // نافذة مرئية خارج الشاشة + عدم خفض الأولوية — يقلّل إيصالات فارغة/شريط ~2سم (Chromium لا يرسم أحياناً مع show:false)
      printWin = new BrowserWindow({
        show: true,
        x: -2800,
        y: -2800,
        width: 420,
        height: 980,
        frame: false,
        skipTaskbar: true,
        focusable: false,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: false,
          backgroundThrottling: false,
        },
      });

      printWin.webContents.once('did-fail-load', (_e, code, desc) => {
        console.error('scheduleSilentPrint: did-fail-load', code, desc);
        if (printWin) {
          printWin.close();
          printWin = null;
        }
        finish({ success: false, reason: desc || String(code) });
      });

      printWin.loadFile(tmpFile).catch((err) => {
        console.error('scheduleSilentPrint: loadFile', err);
        if (printWin) {
          printWin.close();
          printWin = null;
        }
        finish({ success: false, error: err.message });
      });

      printWin.webContents.once('did-finish-load', () => {
        (async () => {
          if (!printWin || settled) return;
          try {
            const meta = await printWin.webContents.executeJavaScript(`(async () => {
              try { await document.fonts.ready; } catch (e) {}
              await new Promise((r) => {
                requestAnimationFrame(() => requestAnimationFrame(r));
              });
              const b = document.body;
              const sh = b ? b.scrollHeight : 0;
              const tc = b && b.textContent ? b.textContent.replace(/\\s+/g, '').length : 0;
              return { sh, tc };
            })();`);
            if (meta && meta.sh < 48 && meta.tc < 8) {
              await new Promise((r) => setTimeout(r, 1200));
            }
          } catch (err) {
            console.warn('scheduleSilentPrint: layout wait', err && err.message);
          }
          await new Promise((r) => setTimeout(r, 400));
          if (!printWin || settled) return;
          const printOptions = {
            silent: true,
            printBackground: true,
            color: true,
            margin: { marginType: 'none' },
            scaleFactor: 100,
            landscape: false,
            pagesPerSheet: 1,
            collate: false,
            copies: 1,
            pageRanges: [],
          };
          if (printerName && String(printerName).trim() !== '') {
            printOptions.deviceName = printerName;
          }
          printWin.webContents.print(printOptions, (success, failureReason) => {
            if (!success) {
              finish({ success: false, reason: failureReason });
            } else {
              finish({ success: true });
            }
            if (printWin) {
              printWin.close();
              printWin = null;
            }
          });
        })();
      });

      setTimeout(() => {
        if (printWin && !settled) {
          printWin.close();
          printWin = null;
          finish({ success: false, reason: 'timeout' });
        }
      }, 30000);
    } catch (e) {
      console.error('scheduleSilentPrint:', e);
      cleanupFile();
      finish({ success: false, error: e.message });
    }
  });
}

// === Fetch pos_database.json from a peer device via HTTP ===
function fetchDatabaseFromPeer(ip) {
  const url = `http://${ip}:${HTTP_PORT}/database`;
  http.get(url, (res) => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
      if (res.statusCode !== 200) {
        console.error('[HTTP Sync] ❌ Bad status from', ip, ':', res.statusCode);
        return;
      }
      try {
        const parsed = JSON.parse(body);
        const fs = require('fs');
        const dbPath = path.join(app.getPath('userData'), 'pos_database.json');
        fs.writeFileSync(dbPath, JSON.stringify(parsed, null, 2));
        console.log(`[HTTP Sync] ✅ Database pulled and saved from ${ip}`);
        probePeerWaReady(ip, (capable) => {
          if (capable) notifyLanSyncHubCandidate(ip);
        });
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('db-file-updated');
        });
      } catch(e) {
        console.error('[HTTP Sync] ❌ Failed to apply database from', ip, ':', e.message);
      }
    });
  }).on('error', e => {
    console.error('[HTTP Sync] ❌ Pull error from', ip, ':', e.message);
  });
}

function waRelayClientIp(req) {
  const a = req.socket && req.socket.remoteAddress;
  return a ? String(a).replace(/^::ffff:/, '') : '';
}

function allowWaRelaySource(ip) {
  if (!ip || ip === '127.0.0.1' || ip === '::1') return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function readHttpJsonBody(req, res, maxBytes, done) {
  let body = '';
  let tooBig = false;
  req.on('data', (chunk) => {
    if (tooBig) return;
    body += chunk;
    if (Buffer.byteLength(body, 'utf8') > maxBytes) {
      tooBig = true;
      res.writeHead(413);
      res.end(JSON.stringify({ ok: false, error: 'payload_too_large' }));
      req.destroy();
    }
  });
  req.on('end', () => {
    if (tooBig) return;
    try {
      done(null, body ? JSON.parse(body) : {});
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: 'invalid_json' }));
    }
  });
}

// === HTTP Server: serve pos_database.json to peers + تمرير واتساب من أجهزة الشبكة ===
function setupHTTPServer() {
  const fs = require('fs');
  const dbPath = path.join(app.getPath('userData'), 'pos_database.json');

  httpServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'POST' && req.url === '/wa-relay') {
      const ip = waRelayClientIp(req);
      if (!allowWaRelaySource(ip)) {
        res.writeHead(403);
        res.end(JSON.stringify({ ok: false, error: 'forbidden_source' }));
        return;
      }
      readHttpJsonBody(req, res, 35 * 1024 * 1024, async (err, data) => {
        if (err) return;
        if (!data || typeof data !== 'object') {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: 'invalid_body' }));
          return;
        }
        const { waHubIp: _drop, ...payload } = data;
        const result = await deliverWhatsAppMessage(payload);
        res.writeHead(result.ok ? 200 : 503);
        res.end(JSON.stringify(result));
      });
      return;
    }

    if (req.method === 'GET' && req.url === '/database') {
      try {
        res.writeHead(200);
        res.end(fs.readFileSync(dbPath, 'utf8'));
      } catch(e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
    } else {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          ok: true,
          instanceId: myInstanceId,
          ip: getLocalIP(),
          waReady: !!waReady,
        })
      );
    }
  });

  httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`[HTTP Sync] 🌐 Server ready: http://${getLocalIP()}:${HTTP_PORT}`);
  });
  httpServer.on('error', e => console.error('[HTTP Sync] Server error:', e.message));
}

function setupNetworkSync() {
  server = dgram.createSocket('udp4');

  server.on('error', (err) => {
    console.error(`UDP error:\n${err.stack}`);
    try { server.close(); } catch(e){}
  });

  server.on('message', (msg, rinfo) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.instanceId === myInstanceId) return; // ignore self

      if (data.type === 'sync_request') {
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('need-to-send-full-data', { requestId: data.requestId });
        });
        setTimeout(() => {
          try {
            const dbNotif = Buffer.from(JSON.stringify({ type: 'db_changed', instanceId: myInstanceId }));
            server.send(dbNotif, 0, dbNotif.length, PORT, BROADCAST_ADDR);
          } catch(e) {}
        }, 800);

      } else if (data.type === 'peer_ping') {
        // A new device is scanning the network — check if we have data and respond
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('check-should-announce', {
            requesterIP: rinfo.address,
            myIP: getLocalIP(),
            myHostname: os.hostname()
          });
        });

      } else if (data.type === 'peer_pong') {
        // A peer announced it has data — tell renderer (sync wizard)
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('peer-discovered', {
            ip: rinfo.address,
            hostname: data.hostname || rinfo.address,
            hasData: data.hasData
          });
        });

      } else if (data.type === 'db_sync_request') {
        const delay = Math.floor(Math.random() * 600);
        setTimeout(() => {
          try {
            const dbNotif = Buffer.from(JSON.stringify({ type: 'db_changed', instanceId: myInstanceId }));
            server.send(dbNotif, 0, dbNotif.length, PORT, BROADCAST_ADDR);
          } catch(e) {}
        }, delay);

      } else if (data.type === 'sync_response_part') {
        handleSyncResponsePart(data, rinfo.address);
      } else if (data.type === 'peer_presence') {
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send('lan-peer-seen', {
              instanceId: data.instanceId,
              hostname: data.hostname || '',
            });
          }
        });
      } else if (data.type === 'sync_response') {
        const sourceIp = normalizeLanIp(rinfo.address);
        const sendFull = (waHubCapable) => {
          BrowserWindow.getAllWindows().forEach((win) => {
            if (!win.isDestroyed()) {
              win.webContents.send('apply-full-sync', {
                ...data,
                _lanSourceIp: sourceIp,
                _waHubCapable: !!waHubCapable,
              });
            }
          });
        };
        if (!sourceIp) sendFull(false);
        else probePeerWaReady(sourceIp, sendFull);
      } else if (data.type === 'db_changed') {
        fetchDatabaseFromPeer(rinfo.address);
      } else {
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('network-sync-update', data);
        });
      }
    } catch(e) {}
  });

  server.on('listening', () => {
    try {
      server.setBroadcast(true);
      console.log('Network Sync listening on ' + PORT);
    } catch(e) {}
  });

  try {
    // Try binding, but if multiple apps run on same machine, only one will bind successfully.
    // The others can still SEND broadcasts.
    server.bind(PORT);
  } catch (e) {
    console.log("Could not bind port, maybe already running");
  }

  // Handle outgoing syncs from renderers
  ipcMain.on('network-sync-send', (event, data) => {
    try {
      if(!server) return;
      data.instanceId = myInstanceId;
      const message = Buffer.from(JSON.stringify(data));
      server.send(message, 0, message.length, PORT, BROADCAST_ADDR);
    } catch(e) {
      console.error(e);
    }
  });

  function broadcastPeerPresence() {
    try {
      if (!server) return;
      const msg = Buffer.from(
        JSON.stringify({
          type: 'peer_presence',
          instanceId: myInstanceId,
          hostname: os.hostname(),
        })
      );
      server.send(msg, 0, msg.length, PORT, BROADCAST_ADDR);
    } catch (e) {}
  }

  ipcMain.on('lan-broadcast-presence', () => broadcastPeerPresence());

  setInterval(broadcastPeerPresence, 25000);
  setTimeout(broadcastPeerPresence, 2500);

  // Handle direct PDF Export saving
  ipcMain.handle('export-pdf', async (event, filename) => {
    try {
        const { filePath } = await dialog.showSaveDialog({
            title: 'حفظ التقرير كـ PDF',
            defaultPath: filename || 'report.pdf',
            filters: [{ name: 'PDF', extensions: ['pdf'] }]
        });
        
        if (filePath) {
            const pdfData = await event.sender.printToPDF({
                printBackground: true,
                landscape: false,
                margin: { marginType: 'default' }
            });
            fs.writeFileSync(filePath, pdfData);
            return { success: true, path: filePath };
        }
        return { success: false, cancel: true };
    } catch (e) {
        console.error('PDF export failed:', e);
        return { success: false, error: e.message };
    }
  });

  ipcMain.handle('get-instance-id', () => myInstanceId);
  ipcMain.handle('get-local-ip', () => getLocalIP());
  ipcMain.handle('get-hostname', () => os.hostname());
  
  // Open folder in file explorer
  ipcMain.handle('open-folder', async (event, folderPath) => {
    const { shell } = require('electron');
    try {
      await shell.openPath(folderPath);
      return { success: true };
    } catch(e) {
      console.error('Failed to open folder:', e);
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle('get-printers', async (event) => {
    try {
      return await event.sender.getPrintersAsync();
    } catch(e) {
      console.error('Error getting printers:', e);
      return [];
    }
  });

  ipcMain.handle('print-to-device', async (event, data) => {
    const { html, printerName } = data || {};
    return scheduleSilentPrint(html, printerName);
  });

  ipcMain.handle('print-receipt', async (event, html) => {
    return scheduleSilentPrint(typeof html === 'string' ? html : '', '');
  });

  // Renderer saved pos_database.json → broadcast to all peers
  ipcMain.on('notify-db-changed', () => {
    try {
      if (!server) return;
      const msg = Buffer.from(JSON.stringify({
        type: 'db_changed',
        instanceId: myInstanceId,
      }));
      server.send(msg, 0, msg.length, PORT, BROADCAST_ADDR);
      console.log('[Sync] 📢 Broadcast: pos_database.json changed');
    } catch(e) {
      console.error('[Sync] notify-db-changed error:', e);
    }
  });

  // Renderer has collected all localStorage and wants to broadcast it to new devices
  ipcMain.on('broadcast-full-sync', (event, data) => {
    try {
      if (!server) return;
      const envelope = {
        type: 'sync_response',
        instanceId: myInstanceId,
        payload: data.payload,
      };
      const str = JSON.stringify(envelope);
      if (str.length <= FULL_SYNC_UDP_SAFE_CHARS) {
        const message = Buffer.from(str, 'utf8');
        server.send(message, 0, message.length, PORT, BROADCAST_ADDR);
        console.log('[Sync] Full data sync sent (single UDP), chars:', str.length);
        return;
      }
      const chunkId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
      const totalParts = Math.ceil(str.length / FULL_SYNC_UDP_SAFE_CHARS);
      console.log('[Sync] Full data sync chunking:', totalParts, 'UDP parts,', str.length, 'chars');
      let i = 0;
      const sendNext = () => {
        if (i >= totalParts) {
          console.log('[Sync] Full data sync chunked send complete.');
          return;
        }
        const part = str.slice(
          i * FULL_SYNC_UDP_SAFE_CHARS,
          (i + 1) * FULL_SYNC_UDP_SAFE_CHARS
        );
        const chunkMsg = JSON.stringify({
          type: 'sync_response_part',
          instanceId: myInstanceId,
          chunkId,
          partIndex: i,
          totalParts,
          part,
        });
        const buf = Buffer.from(chunkMsg, 'utf8');
        if (buf.length > 60000) {
          console.error('[Sync] One UDP chunk too large:', buf.length, '- reduce FULL_SYNC_UDP_SAFE_CHARS');
          return;
        }
        server.send(buf, 0, buf.length, PORT, BROADCAST_ADDR);
        i++;
        setImmediate(sendNext);
      };
      sendNext();
    } catch (e) {
      console.error('broadcast-full-sync error:', e);
    }
  });
}

// Helper: broadcast db_changed to all devices on LAN
function broadcastDBChanged() {
  try {
    if (!server) return;
    const msg = Buffer.from(JSON.stringify({ type: 'db_changed', instanceId: myInstanceId }));
    server.send(msg, 0, msg.length, PORT, BROADCAST_ADDR);
    // Also notify all local windows immediately (same machine)
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('db-file-updated');
    });
  } catch(e) {}
}

ipcMain.on('notify-db-changed', () => {
    broadcastDBChanged();
});

ipcMain.on('get-db-path', (event) => {
    event.returnValue = path.join(app.getPath('userData'), 'pos_database.json');
});

// === Database IPC Handlers ===
const dbAPI = require('./database');

ipcMain.handle('db-save-order', async (event, data) => {
  const result = dbAPI.saveOrder(data);
  // 🚨 Broadcast immediately so kitchen + all devices see the new order NOW
  broadcastDBChanged();
  
  // ZATCA Direct Auto-Sync
  setTimeout(async () => {
      try {
          if(typeof zatcaService !== 'undefined' && zatcaService.isReady) {
              const dbData = zatcaService.getDbData();
              if(dbData.zatca_csid && dbData.zatca_csid.onboarded) {
                  await zatcaService.reportInvoice(data);
              }
          }
      } catch(e) {}
  }, 1000);
  
  return result;
});
ipcMain.handle('db-get-orders',   async ()        => dbAPI.getOrders());
ipcMain.handle('db-save-product', async (event, data) => {
  const result = dbAPI.saveProduct(data);
  broadcastDBChanged();
  return result;
});
ipcMain.handle('db-get-products', async ()        => dbAPI.getProducts());
ipcMain.handle('db-save-category', async (event, data) => {
  const result = dbAPI.saveCategory(data);
  broadcastDBChanged();
  return result;
});
ipcMain.handle('db-get-categories', async ()      => dbAPI.getCategories());
ipcMain.handle('db-get-inventory',async ()        => dbAPI.getInventory());
ipcMain.handle('db-save-inventory', async (event, item) => {
  const result = dbAPI.saveInventoryItem(item);
  broadcastDBChanged();
  return result;
});

// Async full-DB read/write — used by renderer files to avoid blocking readFileSync on UI thread
const _dbPath = path.join(app.getPath('userData'), 'pos_database.json');
const _emptyDB = { orders:[], products:[], categories:[], inventory:[], purchases:[], suppliers:[], inventoryTx:[], returns:[], expenses:[], bankTransfers:[], hrExpenses:[], otherIncome:[], employees:[], attendance:[], penaltyRules:[], chartOfAccounts:[], journalEntries:[], systemNotifications:[], inventoryAlertState:{} };
ipcMain.handle('db-read-full', () => {
  try { return JSON.parse(fs.readFileSync(_dbPath, 'utf8')); }
  catch(e) { return _emptyDB; }
});
ipcMain.handle('db-write-full', (event, data) => {
  try { fs.writeFileSync(_dbPath, JSON.stringify(data, null, 2)); broadcastDBChanged(); return true; }
  catch(e) { console.error('db-write-full error:', e); return false; }
});

/* ===============================
   ZATCA Fatoora Native Engine
=============================== */
const ZatcaEngine = require('./zatca-engine');
const zatcaService = new ZatcaEngine(_dbPath);

ipcMain.handle('zatca-init', async (event, data) => {
    try {
        return await zatcaService.initializeEGS(data.vatNumber, data.companyName, data.branchName);
    } catch(e) { return { success: false, error: e.message }; }
});

ipcMain.handle('zatca-onboard', async (event, data) => {
    try {
        return await zatcaService.onboardDevice(data.otp);
    } catch(e) { return { success: false, error: e.message }; }
});

function createWindow () {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '1111.png'), // شعار هش HASH الرسمي
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.setMenuBarVisibility(false);
  win.loadFile('login.html');
  win.maximize();
}

app.whenReady().then(() => {
  setupGoogleDriveIpc(ipcMain, app, () =>
    path.join(app.getPath('userData'), 'pos_database.json')
  );
  startGoogleDriveAutoScheduler(
    app,
    () => path.join(app.getPath('userData'), 'pos_database.json'),
    BrowserWindow
  );
  setupNetworkSync();
  setupHTTPServer();
  createWindow();

  // Auto-start WhatsApp AFTER app is fully loaded and user can interact
  // Using a longer delay (15s) so the main window is 100% ready first
  // Puppeteer runs asynchronously and won't block the UI thread
  setTimeout(() => {
    // setImmediate ensures this runs only when the event loop is idle
    setImmediate(() => startWhatsApp());
  }, 15000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// --- WhatsApp Bot Integration (Auto-Start + QR Caching) ---
let waClient = null;
let waReady = false;
let waCachedQR = null; // Store latest QR so settings page gets it instantly

// Find Chrome path (use installed Chrome for 10x faster startup)
function findChromePath() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
  ];
  const fs = require('fs');
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch(_) {}
  }
  return null;
}

// Core function: initialize WhatsApp client
function startWhatsApp() {
  // Don't restart if already running or connected
  if (waClient) {
    console.log('[WA] Already initialized, skipping.');
    return;
  }
  try {
    const { Client, LocalAuth } = require('whatsapp-web.js');
    const chromePath = findChromePath();

    const puppeteerConfig = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--mute-audio',
        '--safebrowsing-disable-auto-update',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-ipc-flooding-protection',
        '--memory-pressure-off',
        '--js-flags=--max-old-space-size=256',
        // NOTE: --single-process removed — caused Chrome instability on some machines
      ],
    };

    if (chromePath) {
      puppeteerConfig.executablePath = chromePath;
      console.log('[WA] Using installed Chrome:', chromePath);
    } else {
      console.log('[WA] Chrome not found, using bundled Chromium');
    }

    waClient = new Client({
      authStrategy: new LocalAuth({
        clientId: 'pos-main-client',
        dataPath: path.join(app.getPath('userData'), 'wa_sessions')
      }),
      puppeteer: puppeteerConfig,
      authTimeoutMs: 0,
      qrMaxRetries: 10, // Gives user 10 refresh cycles (~3+ minutes) to get their phone ready
      restartOnAuthFail: false,
      // SOLUTION: Force a highly stable, specific version of WhatsApp Web from a remote cloud.
      // This GUARANTEES the connection won't get stuck on "Loading/Connecting" regardless of the PC 
      // or what WhatsApp pushes in recent updates.
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
      },
    });

    waReady = false;
    waCachedQR = null;
    let _forcedReadyTimer = null;

    waClient.on('qr', (qr) => {
      console.log('[WA] QR code ready - cached for instant display');
      waCachedQR = qr;
      BrowserWindow.getAllWindows().forEach(win => win.webContents.send('wa-qr', qr));
    });

    waClient.on('authenticated', () => {
      console.log('[WA] Authenticated! Starting forced-ready timer...');
      waCachedQR = null;
      BrowserWindow.getAllWindows().forEach(win => win.webContents.send('wa-authenticated'));

      // Failsafe: if 'ready' never fires within 35s after auth, force-send ready anyway
      // (happens on slow machines where Chrome takes long to finalize WA Web session)
      _forcedReadyTimer = setTimeout(() => {
        if (!waReady && waClient) {
          console.log('[WA] Forcing ready state after 35s timeout — authenticated but ready event was delayed');
          waReady = true;
          BrowserWindow.getAllWindows().forEach(win => win.webContents.send('wa-ready'));
        }
      }, 35000);
    });

    waClient.on('ready', () => {
      console.log('[WA] Client is READY!');
      if (_forcedReadyTimer) clearTimeout(_forcedReadyTimer); // Cancel failsafe if ready fires normally
      waReady = true;
      waCachedQR = null;
      BrowserWindow.getAllWindows().forEach(win => win.webContents.send('wa-ready'));
    });

    waClient.on('auth_failure', (msg) => {
      console.error('[WA] Auth failure:', msg);
      if (_forcedReadyTimer) clearTimeout(_forcedReadyTimer);
      waReady = false;
      waClient = null;
      waCachedQR = null;
      BrowserWindow.getAllWindows().forEach(win => win.webContents.send('wa-disconnected', msg));
    });

    waClient.on('disconnected', (reason) => {
      console.log('[WA] Disconnected:', reason);
      if (_forcedReadyTimer) clearTimeout(_forcedReadyTimer);
      waReady = false;
      waClient = null;
      waCachedQR = null;
      BrowserWindow.getAllWindows().forEach(win => win.webContents.send('wa-disconnected', reason));
    });

    console.log('[WA] Initializing in background...');
    waClient.initialize().catch(e => {
      console.error('[WA] Initialize error:', e);
      waClient = null;
      BrowserWindow.getAllWindows().forEach(win => win.webContents.send('wa-disconnected', e.toString()));
    });

  } catch(e) {
    console.error('[WA] Fatal error:', e);
    waClient = null;
  }
}

// Renderer asks: what is the current status?
ipcMain.on('wa-check-status', (event) => {
  if (waReady && waClient) {
    // Already connected - show immediately
    event.sender.send('wa-ready');
  } else if (waCachedQR) {
    // QR already generated and cached - send it immediately!
    event.sender.send('wa-qr', waCachedQR);
  } else if (waClient) {
    // Still loading (Chrome starting up)
    event.sender.send('wa-still-loading');
  } else {
    // Not started yet - start now
    startWhatsApp();
    event.sender.send('wa-still-loading');
  }
});

// Manual trigger from renderer (button press)
ipcMain.on('wa-start', (event) => {
  if (waReady && waClient) {
    event.sender.send('wa-ready');
    return;
  }
  if (waCachedQR) {
    event.sender.send('wa-qr', waCachedQR);
    return;
  }
  if (waClient) {
    event.sender.send('wa-still-loading');
    return;
  }
  startWhatsApp();
  event.sender.send('wa-still-loading');
});

// Disconnect: destroy session + clear credentials folder
ipcMain.on('wa-disconnect', async () => {
  console.log('[WA] Disconnecting and clearing session...');
  try {
    if (waClient) {
      await waClient.logout().catch(() => {});
      await waClient.destroy().catch(() => {});
    }
  } catch(e) {}
  waClient = null;
  waReady = false;
  waCachedQR = null;
  // Delete session folder so next start requires fresh QR
  try {
    const sessionDir = path.join(app.getPath('userData'), 'wa_sessions');
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      console.log('[WA] Session folder cleared.');
    }
  } catch(e) { console.error('[WA] Could not clear session folder:', e.message); }
  BrowserWindow.getAllWindows().forEach(win => win.webContents.send('wa-disconnected', 'manual_disconnect'));
});

// Refresh: destroy and restart without clearing session (keeps QR if already scanned)
ipcMain.on('wa-refresh', async () => {
  console.log('[WA] Refreshing WhatsApp connection...');
  try {
    if (waClient) {
      await waClient.destroy().catch(() => {});
    }
  } catch(e) {}
  waClient = null;
  waReady = false;
  waCachedQR = null;
  // Restart after short delay
  setTimeout(() => startWhatsApp(), 1500);
});

/** إرسال فعلي عبر جلسة واتساب على هذا الجهاز */
async function deliverWhatsAppMessage(data) {
  if (!waClient) return { ok: false, error: 'no_client' };
  try {
    const { MessageMedia } = require('whatsapp-web.js');
    const number = data.number;
    const text = data.text;

    let chatId = String(number || '').replace(/[^0-9]/g, '');
    if (chatId.startsWith('05')) {
      chatId = '966' + chatId.substring(1);
    }
    if (!chatId.endsWith('@c.us')) chatId += '@c.us';

    try {
      const registered = await waClient.getNumberId(chatId);
      if (registered) {
        chatId = registered._serialized;
      } else {
        console.log('WhatsApp Number not found:', chatId);
        return { ok: false, error: 'number_not_found' };
      }
    } catch (e) {
      console.error('Error verifying number:', e);
      return { ok: false, error: e.message || 'verify_failed' };
    }

    if (data.image) {
      const parts = data.image.split(',');
      const mime = parts[0].match(/:(.*?);/)[1];
      const b64 = parts[1];
      const media = new MessageMedia(mime, b64, 'voucher.jpg');
      await waClient.sendMessage(chatId, media, { caption: text });
    } else {
      await waClient.sendMessage(chatId, text);
    }
    console.log('WhatsApp message/media sent to ' + chatId);
    return { ok: true };
  } catch (e) {
    console.error('Failed to send WA message:', e);
    return { ok: false, error: e.message || 'send_failed' };
  }
}

function relayWaHttp(host, payload) {
  return new Promise((resolve) => {
    const postData = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: host,
        port: HTTP_PORT,
        path: '/wa-relay',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData, 'utf8'),
        },
        timeout: 120000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve({ ok: false, error: body || 'bad_response' });
          }
        });
      }
    );
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
    req.write(postData);
    req.end();
  });
}

// Handle sending messages from any renderer window (محلياً أو عبر جهاز مركزي على الشبكة)
ipcMain.on('wa-send-message', async (event, data) => {
  if (!data || typeof data !== 'object') return;
  const hubIp = String(data.waHubIp || '').trim();
  const payload = { ...data };
  delete payload.waHubIp;

  if (hubIp) {
    const remote = await relayWaHttp(hubIp, payload);
    if (remote && remote.ok) {
      console.log('[WA] Sent via LAN hub', hubIp);
      return;
    }
    console.warn('[WA] Hub relay failed, trying local WhatsApp:', remote && remote.error);
  }

  const local = await deliverWhatsAppMessage(payload);
  if (!local.ok) console.warn('[WA] Local send failed:', local.error);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

