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

    const chatLoaded = await waNativeWin.webContents.executeJavaScript(
      "new Promise(resolve => { let attempts = 0; const check = setInterval(() => { attempts++; const input = document.querySelector('div[contenteditable=\"true\"][data-tab=\"10\"]'); const invalid = document.querySelector('div[data-animate-modal-popup=\"true\"]'); if (input) { clearInterval(check); resolve(true); } else if (invalid || attempts > 30) { clearInterval(check); resolve(false); } }, 500); });"
    );

    if (!chatLoaded) {
      return { ok: false, error: 'Chat failed to load or invalid number', code: 'INVALID_NUMBER' };
    }

    if (hasImage) {
      console.log('[WA-NATIVE] Pasting image from clipboard...');
      const img = nativeImage.createFromDataURL(data.image);
      clipboard.writeImage(img);
      
      waNativeWin.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'V', modifiers: ['control'] });
      waNativeWin.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'V', modifiers: ['control'] });

      const imgSent = await waNativeWin.webContents.executeJavaScript(
        "new Promise(resolve => { let attempts = 0; const check = setInterval(() => { attempts++; const sendBtn = document.querySelector('span[data-icon=\"send\"]'); if (sendBtn && sendBtn.closest('div[role=\"button\"]')) { sendBtn.closest('div[role=\"button\"]').click(); clearInterval(check); resolve(true); } else if (attempts > 20) { clearInterval(check); resolve(false); } }, 500); });"
      );
      
      if (!imgSent) {
        return { ok: false, error: 'Failed to click image send button', code: 'TIMEOUT' };
      }
    } else {
      console.log('[WA-NATIVE] Sending text message...');
      await waNativeWin.webContents.executeJavaScript(
        "new Promise(resolve => { setTimeout(() => { const sendBtn = document.querySelector('span[data-icon=\"send\"]'); if (sendBtn) sendBtn.closest('button').click(); resolve(true); }, 500); });"
      );
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
