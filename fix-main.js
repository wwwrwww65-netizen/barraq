const fs = require('fs');

let mainJs = fs.readFileSync('e:/baraaq/main.js', 'utf8');

const startIdx = mainJs.indexOf('let waNativeWin = null;');
const endIdx = mainJs.indexOf('async function teardownWaClient() {');

if (startIdx === -1 || endIdx === -1) {
    console.log('Could not find start/end bounds for fixing');
    process.exit(1);
}

const correctCode = \`let waNativeWin = null;
let waReady = false;

function startWhatsApp() {
  waManualStop = false;
  if (waNativeWin) {
    waNativeWin.show();
    return;
  }
  
  console.log('[WA-NATIVE] Starting Hidden Window...');
  const { BrowserWindow, app } = require('electron');
  waNativeWin = new BrowserWindow({
    width: 1024,
    height: 768,
    show: true,
    title: 'WhatsApp Web - حزمة الإرسال الخفي',
    webPreferences: {
      partition: 'persist:whatsapp',
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });

  waNativeWin.setMenu(null);
  waNativeWin.loadURL('https://web.whatsapp.com');

  waNativeWin.on('close', (e) => {
    if(!app.isQuitting) {
      e.preventDefault();
      waNativeWin.hide();
    }
  });

  waNativeWin.webContents.on('did-finish-load', () => {
    console.log('[WA-NATIVE] WhatsApp Web loaded');
    const { BrowserWindow: BW } = require('electron');
    BW.getAllWindows().forEach(win => {
      if(win !== waNativeWin) win.webContents.send('wa-ready');
    });
    waReady = true;
  });
}

ipcMain.on('wa-check-status', (event) => {
  if (waNativeWin && waReady) event.sender.send('wa-ready');
  else event.sender.send('wa-disconnected', 'Not started');
});

ipcMain.on('wa-start', (event) => {
  startWhatsApp();
  event.sender.send('wa-ready');
});

ipcMain.on('wa-disconnect', async () => {
  console.log('[WA-NATIVE] Disconnecting...');
  if (waNativeWin) {
    waNativeWin.destroy();
    waNativeWin = null;
  }
  waReady = false;
  const { session, BrowserWindow } = require('electron');
  const ses = session.fromPartition('persist:whatsapp');
  await ses.clearStorageData();
  BrowserWindow.getAllWindows().forEach(win => win.webContents.send('wa-disconnected', 'manual'));
});

ipcMain.on('wa-refresh', () => {
  if (waNativeWin) {
    waNativeWin.reload();
  } else {
    startWhatsApp();
  }
});

ipcMain.on('wa-show-window', () => {
  if (waNativeWin) {
    waNativeWin.show();
    waNativeWin.focus();
  } else {
    startWhatsApp();
  }
});

async function deliverWhatsAppMessage(data) {
  if (!waNativeWin) return { ok: false, error: 'no_client', code: 'NO_CLIENT' };
  try {
    const { clipboard, nativeImage } = require('electron');
    const number = data.number;
    const text = data.text;
    const hasImage = !!data.image;

    const toEnglishDigits = (v) =>
      String(v || '')
        .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
        .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

    let phone = toEnglishDigits(number).replace(/[^0-9]/g, '');
    if (phone.startsWith('00966')) phone = phone.substring(2);
    if (phone.startsWith('9660')) phone = '966' + phone.substring(4);
    if (phone.startsWith('05')) phone = '966' + phone.substring(1);
    if (phone.startsWith('5') && phone.length === 9) phone = '966' + phone;

    const encodedText = encodeURIComponent(text || '');
    const url = 'https://web.whatsapp.com/send?phone=' + phone + '&text=' + encodedText;
    
    console.log('[WA-NATIVE] Loading URL:', url);
    await waNativeWin.loadURL(url);

    const chatLoaded = await waNativeWin.webContents.executeJavaScript(\`
      new Promise(resolve => {
        let attempts = 0;
        const check = setInterval(() => {
          attempts++;
          const input = document.querySelector('div[contenteditable="true"][data-tab="10"]');
          const invalid = document.querySelector('div[data-animate-modal-popup="true"]');
          if (input) {
            clearInterval(check);
            resolve(true);
          } else if (invalid || attempts > 30) {
            clearInterval(check);
            resolve(false);
          }
        }, 500);
      });
    \`);

    if (!chatLoaded) {
      return { ok: false, error: 'Chat failed to load or invalid number', code: 'INVALID_NUMBER' };
    }

    if (hasImage) {
      console.log('[WA-NATIVE] Pasting image from clipboard...');
      const img = nativeImage.createFromDataURL(data.image);
      clipboard.writeImage(img);
      
      waNativeWin.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'V', modifiers: ['control'] });
      waNativeWin.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'V', modifiers: ['control'] });

      const imgSent = await waNativeWin.webContents.executeJavaScript(\`
        new Promise(resolve => {
          let attempts = 0;
          const check = setInterval(() => {
            attempts++;
            const sendBtn = document.querySelector('span[data-icon="send"]');
            if (sendBtn && sendBtn.closest('div[role="button"]')) {
              sendBtn.closest('div[role="button"]').click();
              clearInterval(check);
              resolve(true);
            } else if (attempts > 20) {
              clearInterval(check);
              resolve(false);
            }
          }, 500);
        });
      \`);
      
      if (!imgSent) {
        return { ok: false, error: 'Failed to click image send button', code: 'TIMEOUT' };
      }
    } else {
      console.log('[WA-NATIVE] Sending text message...');
      await waNativeWin.webContents.executeJavaScript(\`
        new Promise(resolve => {
          setTimeout(() => {
            const sendBtn = document.querySelector('span[data-icon="send"]');
            if (sendBtn) sendBtn.closest('button').click();
            resolve(true);
          }, 500);
        });
      \`);
    }

    setTimeout(() => {
      if(waNativeWin) waNativeWin.loadURL('https://web.whatsapp.com');
    }, 2000);

    return { ok: true };

  } catch (e) {
    console.error('[WA-NATIVE] Delivery Error:', e);
    return { ok: false, error: e.message, code: 'ERROR' };
  }
}

\`;

mainJs = mainJs.substring(0, startIdx) + correctCode + mainJs.substring(endIdx);
fs.writeFileSync('e:/baraaq/main.js', mainJs, 'utf8');
console.log('Fixed main.js completely!');
