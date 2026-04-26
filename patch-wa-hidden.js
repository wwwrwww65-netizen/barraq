const fs = require('fs');

let mainJs = fs.readFileSync('e:/baraaq/main.js', 'utf8');

const newWaCode = "let waNativeWin = null;\\n" +
"let waReady = false;\\n" +
"\\n" +
"function startWhatsApp() {\\n" +
"  waManualStop = false;\\n" +
"  if (waNativeWin) {\\n" +
"    waNativeWin.show();\\n" +
"    return;\\n" +
"  }\\n" +
"  \\n" +
"  console.log('[WA-NATIVE] Starting Hidden Window...');\\n" +
"  const { BrowserWindow, app } = require('electron');\\n" +
"  waNativeWin = new BrowserWindow({\\n" +
"    width: 1024,\\n" +
"    height: 768,\\n" +
"    show: true,\\n" +
"    title: 'WhatsApp Web - حزمة الإرسال الخفي',\\n" +
"    webPreferences: {\\n" +
"      partition: 'persist:whatsapp',\\n" +
"      nodeIntegration: false,\\n" +
"      contextIsolation: true,\\n" +
"      backgroundThrottling: false\\n" +
"    }\\n" +
"  });\\n" +
"\\n" +
"  waNativeWin.setMenu(null);\\n" +
"  waNativeWin.loadURL('https://web.whatsapp.com');\\n" +
"\\n" +
"  waNativeWin.on('close', (e) => {\\n" +
"    if(!app.isQuitting) {\\n" +
"      e.preventDefault();\\n" +
"      waNativeWin.hide();\\n" +
"    }\\n" +
"  });\\n" +
"\\n" +
"  waNativeWin.webContents.on('did-finish-load', () => {\\n" +
"    console.log('[WA-NATIVE] WhatsApp Web loaded');\\n" +
"    BrowserWindow.getAllWindows().forEach(win => {\\n" +
"      if(win !== waNativeWin) win.webContents.send('wa-ready');\\n" +
"    });\\n" +
"    waReady = true;\\n" +
"  });\\n" +
"}\\n" +
"\\n" +
"ipcMain.on('wa-check-status', (event) => {\\n" +
"  if (waNativeWin && waReady) event.sender.send('wa-ready');\\n" +
"  else event.sender.send('wa-disconnected', 'Not started');\\n" +
"});\\n" +
"\\n" +
"ipcMain.on('wa-start', (event) => {\\n" +
"  startWhatsApp();\\n" +
"  event.sender.send('wa-ready');\\n" +
"});\\n" +
"\\n" +
"ipcMain.on('wa-disconnect', async () => {\\n" +
"  console.log('[WA-NATIVE] Disconnecting...');\\n" +
"  if (waNativeWin) {\\n" +
"    waNativeWin.destroy();\\n" +
"    waNativeWin = null;\\n" +
"  }\\n" +
"  waReady = false;\\n" +
"  const { session, BrowserWindow } = require('electron');\\n" +
"  const ses = session.fromPartition('persist:whatsapp');\\n" +
"  await ses.clearStorageData();\\n" +
"  BrowserWindow.getAllWindows().forEach(win => win.webContents.send('wa-disconnected', 'manual'));\\n" +
"});\\n" +
"\\n" +
"ipcMain.on('wa-refresh', () => {\\n" +
"  if (waNativeWin) {\\n" +
"    waNativeWin.reload();\\n" +
"  } else {\\n" +
"    startWhatsApp();\\n" +
"  }\\n" +
"});\\n" +
"\\n" +
"ipcMain.on('wa-show-window', () => {\\n" +
"  if (waNativeWin) {\\n" +
"    waNativeWin.show();\\n" +
"    waNativeWin.focus();\\n" +
"  } else {\\n" +
"    startWhatsApp();\\n" +
"  }\\n" +
"});\\n";

const startIdx = mainJs.indexOf('function startWhatsApp() {');
const endIdx = mainJs.indexOf('// We need to keep track of the main window for notifications');

if (startIdx > -1 && endIdx > -1) {
  mainJs = mainJs.substring(0, startIdx) + newWaCode + '\\n' + mainJs.substring(endIdx);
}

const deliverStart = mainJs.indexOf('async function deliverWhatsAppMessage(data) {');
const deliverEnd = mainJs.indexOf('async function teardownWaClient() {');

const newDeliverCode = "async function deliverWhatsAppMessage(data) {\\n" +
"  if (!waNativeWin) return { ok: false, error: 'no_client', code: 'NO_CLIENT' };\\n" +
"  try {\\n" +
"    const { clipboard, nativeImage } = require('electron');\\n" +
"    const number = data.number;\\n" +
"    const text = data.text;\\n" +
"    const hasImage = !!data.image;\\n" +
"\\n" +
"    const toEnglishDigits = (v) =>\\n" +
"      String(v || '')\\n" +
"        .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))\\n" +
"        .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));\\n" +
"\\n" +
"    let phone = toEnglishDigits(number).replace(/[^0-9]/g, '');\\n" +
"    if (phone.startsWith('00966')) phone = phone.substring(2);\\n" +
"    if (phone.startsWith('9660')) phone = '966' + phone.substring(4);\\n" +
"    if (phone.startsWith('05')) phone = '966' + phone.substring(1);\\n" +
"    if (phone.startsWith('5') && phone.length === 9) phone = '966' + phone;\\n" +
"\\n" +
"    const encodedText = encodeURIComponent(text || '');\\n" +
"    const url = 'https://web.whatsapp.com/send?phone=' + phone + '&text=' + encodedText;\\n" +
"    \\n" +
"    console.log('[WA-NATIVE] Loading URL:', url);\\n" +
"    await waNativeWin.loadURL(url);\\n" +
"\\n" +
"    const chatLoaded = await waNativeWin.webContents.executeJavaScript(\\n" +
"      \"new Promise(resolve => {\\n\" +\\n" +
"      \"  let attempts = 0;\\n\" +\\n" +
"      \"  const check = setInterval(() => {\\n\" +\\n" +
"      \"    attempts++;\\n\" +\\n" +
"      \"    const input = document.querySelector('div[contenteditable=\\\"true\\\"][data-tab=\\\"10\\\"]');\\n\" +\\n" +
"      \"    const invalid = document.querySelector('div[data-animate-modal-popup=\\\"true\\\"]');\\n\" +\\n" +
"      \"    if (input) {\\n\" +\\n" +
"      \"      clearInterval(check);\\n\" +\\n" +
"      \"      resolve(true);\\n\" +\\n" +
"      \"    } else if (invalid || attempts > 30) {\\n\" +\\n" +
"      \"      clearInterval(check);\\n\" +\\n" +
"      \"      resolve(false);\\n\" +\\n" +
"      \"    }\\n\" +\\n" +
"      \"  }, 500);\\n\" +\\n" +
"      \"});\"\\n" +
"    );\\n" +
"\\n" +
"    if (!chatLoaded) {\\n" +
"      return { ok: false, error: 'Chat failed to load or invalid number', code: 'INVALID_NUMBER' };\\n" +
"    }\\n" +
"\\n" +
"    if (hasImage) {\\n" +
"      console.log('[WA-NATIVE] Pasting image from clipboard...');\\n" +
"      const img = nativeImage.createFromDataURL(data.image);\\n" +
"      clipboard.writeImage(img);\\n" +
"      \\n" +
"      waNativeWin.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'V', modifiers: ['control'] });\\n" +
"      waNativeWin.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'V', modifiers: ['control'] });\\n" +
"\\n" +
"      const imgSent = await waNativeWin.webContents.executeJavaScript(\\n" +
"        \"new Promise(resolve => {\\n\" +\\n" +
"        \"  let attempts = 0;\\n\" +\\n" +
"        \"  const check = setInterval(() => {\\n\" +\\n" +
"        \"    attempts++;\\n\" +\\n" +
"        \"    const sendBtn = document.querySelector('span[data-icon=\\\"send\\\"]');\\n\" +\\n" +
"        \"    if (sendBtn && sendBtn.closest('div[role=\\\"button\\\"]')) {\\n\" +\\n" +
"        \"      sendBtn.closest('div[role=\\\"button\\\"]').click();\\n\" +\\n" +
"        \"      clearInterval(check);\\n\" +\\n" +
"        \"      resolve(true);\\n\" +\\n" +
"        \"    } else if (attempts > 20) {\\n\" +\\n" +
"        \"      clearInterval(check);\\n\" +\\n" +
"        \"      resolve(false);\\n\" +\\n" +
"        \"    }\\n\" +\\n" +
"        \"  }, 500);\\n\" +\\n" +
"        \"});\"\\n" +
"      );\\n" +
"      \\n" +
"      if (!imgSent) {\\n" +
"        return { ok: false, error: 'Failed to click image send button', code: 'TIMEOUT' };\\n" +
"      }\\n" +
"    } else {\\n" +
"      console.log('[WA-NATIVE] Sending text message...');\\n" +
"      await waNativeWin.webContents.executeJavaScript(\\n" +
"        \"new Promise(resolve => {\\n\" +\\n" +
"        \"  setTimeout(() => {\\n\" +\\n" +
"        \"    const sendBtn = document.querySelector('span[data-icon=\\\"send\\\"]');\\n\" +\\n" +
"        \"    if (sendBtn) sendBtn.closest('button').click();\\n\" +\\n" +
"        \"    resolve(true);\\n\" +\\n" +
"        \"  }, 500);\\n\" +\\n" +
"        \"});\"\\n" +
"      );\\n" +
"    }\\n" +
"\\n" +
"    setTimeout(() => {\\n" +
"      if(waNativeWin) waNativeWin.loadURL('https://web.whatsapp.com');\\n" +
"    }, 2000);\\n" +
"\\n" +
"    return { ok: true };\\n" +
"\\n" +
"  } catch (e) {\\n" +
"    console.error('[WA-NATIVE] Delivery Error:', e);\\n" +
"    return { ok: false, error: e.message, code: 'ERROR' };\\n" +
"  }\\n" +
"}\\n";

if (deliverStart > -1 && deliverEnd > -1) {
  mainJs = mainJs.substring(0, deliverStart) + newDeliverCode + '\\n' + mainJs.substring(deliverEnd);
}

fs.writeFileSync('e:/baraaq/main.js', mainJs, 'utf8');
console.log('main.js patched!');

let settingsHtml = fs.readFileSync('e:/baraaq/settings.html', 'utf8');
settingsHtml = settingsHtml.replace('id="wa-mode-bot-card"', 'id="wa-mode-bot-card"');
settingsHtml = settingsHtml.replace('>وضع البوت التلقائي (Bot Mode)<', '>وضع النافذة المخفية (بديل البوت)<');
settingsHtml = settingsHtml.replace('يعمل بالخلفية بشكل كامل وتلقائي (يستهلك بعض الرامات)', 'يعمل بالخلفية، يرسل الصور والنصوص برمجياً داخل الكاشير');
settingsHtml = settingsHtml.replace('>تشغيل البوت وتوليد QR<', '>إظهار نافذة واتساب للربط/المسح<');
fs.writeFileSync('e:/baraaq/settings.html', settingsHtml, 'utf8');
console.log('settings.html patched!');

let settingsJs = fs.readFileSync('e:/baraaq/settings.js', 'utf8');
settingsJs = settingsJs.replace(
  "document.getElementById('btn-wa-start')?.addEventListener('click', () => {",
  "document.getElementById('btn-wa-start')?.addEventListener('click', () => {\\n            if(window.electron) window.electron.ipcRenderer.send('wa-show-window'); else ipcRenderer.send('wa-show-window');"
);
fs.writeFileSync('e:/baraaq/settings.js', settingsJs, 'utf8');
console.log('settings.js patched!');
