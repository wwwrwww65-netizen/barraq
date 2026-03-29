const { app, BrowserWindow, ipcMain, dialog } = require('electron');
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

// === Fetch pos_database.json from a peer device via HTTP ===
function fetchDatabaseFromPeer(ip) {
  const url = `http://${ip}:${HTTP_PORT}/database`;
  http.get(url, (res) => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const fs = require('fs');
        const dbPath = path.join(app.getPath('userData'), 'pos_database.json');
        fs.writeFileSync(dbPath, JSON.stringify(parsed, null, 2));
        console.log(`[HTTP Sync] ✅ Database pulled and saved from ${ip}`);
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

// === HTTP Server: serve pos_database.json to peers ===
function setupHTTPServer() {
  const fs = require('fs');
  const dbPath = path.join(app.getPath('userData'), 'pos_database.json');

  httpServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

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
      res.end(JSON.stringify({ ok: true, instanceId: myInstanceId, ip: getLocalIP() }));
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

      } else if (data.type === 'sync_response') {
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('apply-full-sync', data);
        });
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
  ipcMain.handle('get-printers', async (event) => {
    try {
      return await event.sender.getPrintersAsync();
    } catch(e) {
      console.error('Error getting printers:', e);
      return [];
    }
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
      data.instanceId = myInstanceId;
      data.type = 'sync_response';
      const message = Buffer.from(JSON.stringify(data));
      server.send(message, 0, message.length, PORT, BROADCAST_ADDR);
      console.log('Full data sync sent to network.');
    } catch(e) {
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
  setupNetworkSync();
  setupHTTPServer();
  createWindow();

  // Auto-start WhatsApp in background so QR is ready when user opens Settings
  setTimeout(() => {
    startWhatsApp();
  }, 3000); // 3s delay so app window loads first

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
      // No qrMaxRetries limit - keep showing QR until user scans it
      authTimeoutMs: 0,
      restartOnAuthFail: false,
    });

    waReady = false;
    waCachedQR = null;

    waClient.on('qr', (qr) => {
      console.log('[WA] QR code ready - cached for instant display');
      waCachedQR = qr; // Cache it!
      BrowserWindow.getAllWindows().forEach(win => win.webContents.send('wa-qr', qr));
    });

    waClient.on('authenticated', () => {
      console.log('[WA] Authenticated!');
      waCachedQR = null; // Clear QR cache after auth
      BrowserWindow.getAllWindows().forEach(win => win.webContents.send('wa-authenticated'));
    });

    waClient.on('ready', () => {
      console.log('[WA] Client is READY!');
      waReady = true;
      waCachedQR = null;
      BrowserWindow.getAllWindows().forEach(win => win.webContents.send('wa-ready'));
    });

    waClient.on('auth_failure', (msg) => {
      console.error('[WA] Auth failure:', msg);
      waReady = false;
      waClient = null;
      waCachedQR = null;
      BrowserWindow.getAllWindows().forEach(win => win.webContents.send('wa-disconnected', msg));
    });

    waClient.on('disconnected', (reason) => {
      console.log('[WA] Disconnected:', reason);
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

// Handle sending messages from any renderer window
ipcMain.on('wa-send-message', async (event, data) => {
  if (!waClient) return;
  try {
    const { MessageMedia } = require('whatsapp-web.js');
    const number = data.number; // e.g., '+966539774699'
    const text = data.text;
    
    // Formatting number for WhatsApp (Strip + and spaces)
    let chatId = number.replace(/[^0-9]/g, '');
    
    // Auto-fix local Saudi numbers (starts with 05) to 9665
    if (chatId.startsWith('05')) {
        chatId = '966' + chatId.substring(1);
    }
    
    if(!chatId.endsWith('@c.us')) chatId += '@c.us';

    // Verify number is registered and get exact serialized ID (Crucial for new chats)
    try {
        const registered = await waClient.getNumberId(chatId);
        if (registered) {
            chatId = registered._serialized;
        } else {
            console.log("WhatsApp Number not found:", chatId);
            return;
        }
    } catch(e) { console.error("Error verifying number:", e); }

    if (data.image) {
      const parts = data.image.split(',');
      const mime = parts[0].match(/:(.*?);/)[1];
      const b64 = parts[1];
      const media = new MessageMedia(mime, b64, 'voucher.jpg');
      await waClient.sendMessage(chatId, media, { caption: text });
    } else {
      await waClient.sendMessage(chatId, text);
    }
    console.log("WhatsApp message/media sent to " + chatId);
  } catch(e) {
    console.error("Failed to send WA message:", e);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

