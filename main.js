const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const dgram = require('dgram');

const PORT = 41234;
const BROADCAST_ADDR = '255.255.255.255';
const myInstanceId = Math.random().toString(36).substring(7);

let server;

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
      
      // Send to all open windows
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('network-sync-update', data);
      });
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

  ipcMain.handle('get-instance-id', () => myInstanceId);
}

function createWindow () {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, 'logo.jpg'), // if they want a logo
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile('login.html');
  win.maximize();
}

app.whenReady().then(() => {
  setupNetworkSync();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// --- WhatsApp Bot Integration ---
let waClient = null;

ipcMain.on('wa-start', async (event) => {
  try {
    const { Client, LocalAuth } = require('whatsapp-web.js');
    if (waClient) {
      try { await waClient.destroy(); } catch(e){}
    }
    
    // Using LocalAuth saves the session so we don't need to scan QR again
    waClient = new Client({
      authStrategy: new LocalAuth({ clientId: 'pos-main-client' }),
      puppeteer: { 
        headless: true,
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox', 
          '--disable-extensions',
          '--disable-gpu',
          '--disable-dev-shm-usage'
        ] 
      }
    });

    waClient.on('qr', (qr) => {
      // Send QR to frontend
      event.sender.send('wa-qr', qr);
    });

    waClient.on('ready', () => {
      event.sender.send('wa-ready');
    });

    waClient.on('authenticated', () => {
      event.sender.send('wa-authenticated');
    });

    waClient.on('auth_failure', msg => {
      event.sender.send('wa-disconnected', msg);
    });

    waClient.on('disconnected', (reason) => {
      event.sender.send('wa-disconnected', reason);
    });

    try {
      waClient.initialize();
    } catch(e) {
      event.sender.send('wa-disconnected', e.toString());
    }
  } catch(e) {
    console.log("WhatsApp Web module not loaded yet or failed.", e);
    event.sender.send('wa-disconnected', "فشل تحميل مكتبة واتساب: " + e.message);
  }
});

// Handle sending messages from any renderer window
ipcMain.on('wa-send-message', async (event, data) => {
  if (!waClient) return;
  try {
    const { MessageMedia } = require('whatsapp-web.js');
    const number = data.number; // e.g., '+966539774699'
    const text = data.text;
    
    // Formatting number for WhatsApp
    let chatId = number.replace(/[^0-9]/g, '');
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

