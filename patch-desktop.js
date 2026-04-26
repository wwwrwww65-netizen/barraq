const fs = require('fs');

// 1. Update settings.html
let html = fs.readFileSync('e:/baraaq/settings.html', 'utf8');
if (!html.includes('wa-mode-desktop')) {
  const injectAfterHtml = '</label>\\n                                </div>\\n\\n                                <!-- Hidden Window Panel -->';
  const desktopCardHtml = `
                                    <label id="wa-mode-desktop-card" style="cursor:pointer; display:flex; align-items:flex-start; gap:12px; padding:14px; border-radius:12px; border:2px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.03); transition:all 0.2s;">
                                        <input type="radio" name="wa_mode_select" id="wa-mode-desktop" value="desktop" style="margin-top:3px; accent-color:#25D366; width:18px; height:18px; flex-shrink:0;">
                                        <div>
                                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px; flex-wrap:wrap;">
                                                <i class="ph-fill ph-desktop" style="color:#94a3b8; font-size:18px;"></i>
                                                <strong style="color:#94a3b8; font-size:14px;">وضع التطبيق المثبت (WhatsApp Desktop)</strong>
                                            </div>
                                            <p style="color:var(--text-secondary); font-size:12px; margin:0; line-height:1.7;">
                                                يرسل من خلال <strong style="color:white;">تطبيق واتساب الرسمي للكمبيوتر</strong>. لا يفتح تبويبات كروم جديدة أبداً.
                                            </p>
                                        </div>
                                    </label>
`;
  html = html.replace('</label>\\n                                </div>\\n\\n                                <!-- Hidden Window Panel -->', '</label>\\n' + desktopCardHtml + '                                </div>\\n\\n                                <!-- Hidden Window Panel -->');
  fs.writeFileSync('e:/baraaq/settings.html', html, 'utf8');
  console.log('settings.html patched with desktop option');
}

// 2. Update settings.js
let js = fs.readFileSync('e:/baraaq/settings.js', 'utf8');
if (!js.includes("mode === 'desktop'")) {
  js = js.replace(
    "const currentWaMode = localStorage.getItem('wa_mode') || 'browser';",
    "const currentWaMode = localStorage.getItem('wa_mode') || 'browser';\\n    if(document.getElementById('wa-mode-desktop')) { if(currentWaMode === 'desktop') document.getElementById('wa-mode-desktop').checked = true; }"
  );
  js = js.replace(
    "document.getElementById('wa-mode-bot').addEventListener('change', () => {",
    "document.getElementById('wa-mode-desktop')?.addEventListener('change', () => {\\n        localStorage.setItem('wa_mode', 'desktop');\\n        updateWaUI('desktop');\\n    });\\n\\n    document.getElementById('wa-mode-bot').addEventListener('change', () => {"
  );
  js = js.replace(
    "if (mode === 'bot') {",
    "if (mode === 'desktop') {\\n            document.getElementById('wa-browser-panel').style.display = 'none';\\n            document.getElementById('wa-bot-panel').style.display = 'none';\\n            if(document.getElementById('wa-mode-desktop-card')) document.getElementById('wa-mode-desktop-card').style.borderColor = '#25D366';\\n        } else if (mode === 'bot') {"
  );
  js = js.replace(
    "document.getElementById('wa-mode-bot-card').style.borderColor = 'rgba(255,255,255,0.1)';",
    "document.getElementById('wa-mode-bot-card').style.borderColor = 'rgba(255,255,255,0.1)';\\n        if(document.getElementById('wa-mode-desktop-card')) document.getElementById('wa-mode-desktop-card').style.borderColor = 'rgba(255,255,255,0.1)';"
  );
  fs.writeFileSync('e:/baraaq/settings.js', js, 'utf8');
  console.log('settings.js patched with desktop option');
}

// 3. Update main.js
let mainJs = fs.readFileSync('e:/baraaq/main.js', 'utf8');
if (!mainJs.includes("if (data.wa_mode === 'desktop')")) {
  const desktopLogic = `

  // ✅ وضع التطبيق المكتبي: إرسال عبر WhatsApp Desktop الرسمي
  if (data.wa_mode === 'desktop') {
    try {
      const { shell, clipboard, nativeImage } = require('electron');
      const fs = require('fs');
      const os = require('os');
      const path = require('path');
      const { exec } = require('child_process');

      const toEnglishDigits = (v) =>
        String(v || '')
          .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
          .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

      let phone = toEnglishDigits(data.number || '').replace(/[^0-9]/g, '');
      if (phone.startsWith('00966')) phone = phone.substring(2);
      if (phone.startsWith('9660'))  phone = '966' + phone.substring(4);
      if (phone.startsWith('05'))    phone = '966' + phone.substring(1);
      if (phone.startsWith('5') && phone.length === 9) phone = '966' + phone;

      const text    = String(data.text || '');
      const encoded = encodeURIComponent(text);
      const url     = \`whatsapp://send?phone=\${phone}&text=\${encoded}\`;
      
      await shell.openExternal(url);
      console.log(\`[WA][DESKTOP] Opened WhatsApp Desktop URL for \${phone}\`);

      if (data.image) {
        const img = nativeImage.createFromDataURL(data.image);
        clipboard.writeImage(img);

        const vbsPath = path.join(os.tmpdir(), \`wa_send_desk_\${Date.now()}.vbs\`);
        const vbsCode = \`
WScript.Sleep 5500
Set WshShell = WScript.CreateObject("WScript.Shell")
WshShell.AppActivate "WhatsApp"
WScript.Sleep 500
WshShell.SendKeys "^v"
WScript.Sleep 2000
WshShell.SendKeys "~"
\`;
        fs.writeFileSync(vbsPath, vbsCode.trim(), 'utf8');
        exec(\`cscript //nologo "\${vbsPath}"\`, (err) => {
          try { fs.unlinkSync(vbsPath); } catch (e) {}
        });
      } else {
        const vbsPath = path.join(os.tmpdir(), \`wa_send_desk_\${Date.now()}.vbs\`);
        const vbsCode = \`
WScript.Sleep 5500
Set WshShell = WScript.CreateObject("WScript.Shell")
WshShell.AppActivate "WhatsApp"
WScript.Sleep 500
WshShell.SendKeys "~"
\`;
        fs.writeFileSync(vbsPath, vbsCode.trim(), 'utf8');
        exec(\`cscript //nologo "\${vbsPath}"\`, (err) => {
          try { fs.unlinkSync(vbsPath); } catch (e) {}
        });
      }
    } catch (e) {
      console.error('[WA][DESKTOP] Failed to open URL:', e?.message);
    }
    return;
  }
`;

  const browserModeEnd = mainJs.indexOf('// Fallback: if media send fails');
  const browserModeStart = mainJs.indexOf("if (data.wa_mode === 'browser') {");
  
  // Find the exact return statement of the browser mode block
  const searchStr = `
      console.log(\`[WA][BROWSER-AUTO] Executing VBScript macro for \${phone}\`);
    } catch (e) {
      console.error('[WA][BROWSER] Failed to open URL:', e?.message);
    }
    return;
  }`;

  const insertPos = mainJs.indexOf(searchStr);
  if (insertPos > -1) {
    const afterReturnPos = insertPos + searchStr.length;
    mainJs = mainJs.substring(0, afterReturnPos) + desktopLogic + mainJs.substring(afterReturnPos);
    fs.writeFileSync('e:/baraaq/main.js', mainJs, 'utf8');
    console.log('main.js patched with desktop option');
  } else {
    console.log('Could not find insert position in main.js for desktop mode');
  }
}
