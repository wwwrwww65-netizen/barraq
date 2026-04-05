/**
 * دخان سريع: توليد PDF بنفس خيارات محاكاة الطابعة الحرارية (بدون تشغيل واجهة POS كاملة).
 * تشغيل: npx electron scripts/print-sim-smoke.js
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 80mm;
      max-width: 80mm;
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 14px;
      padding: 4mm;
      background: #fff;
      color: #000;
    }
    h1 { font-size: 16px; margin-bottom: 3mm; }
    .line { border-top: 1px dashed #000; margin: 3mm 0; }
  </style>
</head>
<body>
  <h1>اختبار محاكاة حراري</h1>
  <p>Hash POS — print-sim-smoke</p>
  <div class="line"></div>
  <p>عرض 80mm — preferCSSPageSize</p>
</body>
</html>`;

app.whenReady().then(async () => {
  const tmpFile = path.join(app.getPath('temp'), `print-sim-smoke-${Date.now()}.html`);
  fs.writeFileSync(tmpFile, html, 'utf8');

  const win = new BrowserWindow({
    show: false,
    width: 420,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  });

  await win.loadFile(tmpFile);
  await new Promise((r) => setTimeout(r, 400));

  const pdfBuf = await win.webContents.printToPDF({
    printBackground: true,
    preferCSSPageSize: true,
    margins: { marginType: 'none' },
    scale: 1,
  });

  try {
    fs.unlinkSync(tmpFile);
  } catch (_) { /* ignore */ }

  const outDir = path.join(app.getPath('userData'), 'print-simulations');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `smoke-${Date.now()}.pdf`);
  fs.writeFileSync(outPath, pdfBuf);

  const n = pdfBuf.length;
  console.log('[print-sim-smoke] OK — bytes:', n, '→', outPath);
  if (n < 800) {
    console.error('[print-sim-smoke] FAIL — PDF صغير جداً (مشكوك فيه)');
    app.exit(1);
    return;
  }

  win.close();
  app.exit(0);
}).catch((e) => {
  console.error('[print-sim-smoke]', e);
  app.exit(1);
});
