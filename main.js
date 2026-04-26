const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  screen,
  globalShortcut,
} = require('electron');

// تحسين الأداء: تفعيل GPU بشكل صحيح مع تفادي الشاشة السوداء بطريقة أفضل
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-hardware-overlays', 'single-fullscreen,single-on-top,underlay');

app.on('web-contents-created', (e, webContents) => {
  webContents.on('context-menu', (event, params) => {
    const { Menu, MenuItem } = require('electron');
    const menu = new Menu();
    let hasItems = false;
    if (params.isEditable) {
      menu.append(new MenuItem({ label: 'قص', role: 'cut' }));
      menu.append(new MenuItem({ label: 'نسخ', role: 'copy' }));
      menu.append(new MenuItem({ label: 'لصق', role: 'paste' }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ label: 'تحديد الكل', role: 'selectAll' }));
      hasItems = true;
    } else if (params.selectionText && params.selectionText.trim() !== '') {
      menu.append(new MenuItem({ label: 'نسخ', role: 'copy' }));
      hasItems = true;
    }
    if (hasItems) {
      menu.popup();
    }
  });
});

const {
  setupGoogleDriveIpc,
  startGoogleDriveAutoScheduler,
  collectLocalStorageSnapshot,
} = require('./google-drive-main');
const fs = require('fs');
const path = require('path');
const dgram = require('dgram');
const http = require('http');
const os = require('os');

const PORT = 41234;
const HTTP_PORT = 41235;
const BROADCAST_ADDR = '255.255.255.255';
const myInstanceId = Math.random().toString(36).substring(7);

/**
 * محاكاة طابعة حرارية: لا يُرسل إلى الطابعة؛ يُصدَّر PDF بنفس HTML وبـ @page 80mm (preferCSSPageSize).
 * تشغيل: متغير بيئة HASH_POS_SIMULATE_PRINT=1 أو وسيط --simulate-thermal-print
 * فتح الملف تلقائياً: HASH_POS_SIMULATE_PRINT_OPEN=1 أو --simulate-thermal-print-open
 */
function isSimulateThermalPrint() {
  if (process.argv.includes('--simulate-thermal-print')) return true;
  const v = process.env.HASH_POS_SIMULATE_PRINT;
  return v === '1' || v === 'true' || v === 'yes';
}

function shouldOpenSimulatedPrintPdf() {
  if (process.argv.includes('--simulate-thermal-print-open')) return true;
  const v = process.env.HASH_POS_SIMULATE_PRINT_OPEN;
  return v === '1' || v === 'true';
}

/** سجلات الطباعة — تظهر في طرفية التشغيل؛ واجهة الصفحة: Ctrl+Shift+I (أدوات المطوّر) */
function logPrint(...args) {
  console.log('[HashPOS.print]', new Date().toISOString(), ...args);
}

function placePrintWindowOnPrimaryDisplay(win) {
  try {
    const display = screen.getPrimaryDisplay();
    const { x, y, width, height } = display.workArea;
    const w = 320;
    const h = 400;
    // Move to corner but keep on-screen as Chromium sometimes fails to render off-screen
    win.setBounds({
      x: x + width - w - 8,
      y: y + height - h - 8,
      width: w,
      height: h,
    });
    // Set low opacity and show without stealing focus
    win.setOpacity(0.02);
    win.showInactive();
  } catch (e) {
    logPrint('placePrintWindowOnPrimaryDisplay', e && e.message);
    win.showInactive();
  }
}

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

/**
 * طباعة HTML صامتة — print-to-device / print-receipt
 * ويندوز + اسم طابعة: أولاً حجم الورق من تعريف الطابعة (usePrinterDefaultPageSize)، وإن فشلت المهمة يُعاد بـ 80mm صريح.
 * نافذة الطباعة تُعرض داخل الشاشة الرئيسية (Chromium قد يُرسم إيصالاً فارغاً إن كانت النافذة خارج الإحداثيات/بدون تركيز).
 * تعيين HASH_POS_PRINT_EXPLICIT_FIRST=1 لعكس الترتيب (80mm ثم تعريف الطابعة).
 */
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
      try {
        if (printWin && !printWin.isDestroyed()) {
          printWin.setAlwaysOnTop(false);
          printWin.close();
        }
      } catch (_) { /* ignore */ }
      printWin = null;
      cleanupFile();
      resolve(payload);
    };
    try {
      const body = html && String(html).length > 0
        ? String(html)
        : '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>';
      const htmlLen = body.length;
      fs.writeFileSync(tmpFile, body, 'utf8');

      const trimmedPreview = (printerName && String(printerName).trim()) ? String(printerName).trim().slice(0, 160) : '';
      logPrint('job start', { htmlLen, printerName: trimmedPreview || '(افتراضي النظام)', platform: process.platform });

      printWin = new BrowserWindow({
        show: false,
        width: 420,
        height: 980,
        frame: false,
        skipTaskbar: true,
        focusable: true,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: false,
          backgroundThrottling: false,
        },
      });

      printWin.webContents.on('console-message', (_e, level, message) => {
        if (level >= 2) logPrint('[صفحة-طباعة]', message);
      });

      printWin.webContents.once('did-fail-load', (_e, code, desc) => {
        logPrint('did-fail-load', code, desc);
        finish({ success: false, reason: desc || String(code), debug: { htmlLen } });
      });

      printWin.loadFile(tmpFile).catch((err) => {
        logPrint('loadFile', err.message);
        finish({ success: false, error: err.message, debug: { htmlLen } });
      });

      printWin.webContents.once('did-finish-load', () => {
        (async () => {
          if (!printWin || settled) return;
          placePrintWindowOnPrimaryDisplay(printWin);

          let meta = { sh: 0, tc: 0, docH: 0 };
          try {
            meta = await printWin.webContents.executeJavaScript(`(async () => {
              try { await document.fonts.ready; } catch (e) {}
              document.documentElement.style.background = '#ffffff';
              document.body.style.background = '#ffffff';
              const sh0 = document.body ? document.body.scrollHeight : 0;
              const docH = document.documentElement ? document.documentElement.scrollHeight : 0;
              if (Math.max(sh0, docH) < 80) {
                document.body.style.minHeight = '120mm';
              }
              window.scrollTo(0, 0);
              await new Promise((r) => {
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => requestAnimationFrame(r))
                );
              });
              const b = document.body;
              const sh = b ? b.scrollHeight : 0;
              const tc = b && b.textContent ? b.textContent.replace(/\\s+/g, '').length : 0;
              return { sh: Math.max(sh, docH), tc, docH };
            })();`);
            logPrint('قياس التخطيط', meta);
            if (meta && meta.sh < 48 && meta.tc < 8) {
              logPrint('محتوى قليل — انتظار إضافي 1200ms');
              await new Promise((r) => setTimeout(r, 1200));
            }
          } catch (err) {
            logPrint('خطأ قياس التخطيط', err && err.message);
          }
          try {
            await printWin.webContents.capturePage();
          } catch (capErr) {
            logPrint('capturePage', capErr && capErr.message);
          }
          await new Promise((r) => setTimeout(r, 200));
          if (!printWin || settled) return;

          if (isSimulateThermalPrint()) {
            try {
              const simDir = path.join(app.getPath('userData'), 'print-simulations');
              fs.mkdirSync(simDir, { recursive: true });
              const outPath = path.join(simDir, `thermal-sim-${Date.now()}.pdf`);
              const pdfBuf = await printWin.webContents.printToPDF({
                printBackground: true,
                preferCSSPageSize: true,
                margins: { marginType: 'none' },
                scale: 1,
              });
              fs.writeFileSync(outPath, pdfBuf);
              logPrint('محاكاة PDF', outPath, 'bytes=', pdfBuf.length);
              if (shouldOpenSimulatedPrintPdf()) {
                const openErr = await shell.openPath(outPath);
                if (openErr) logPrint('فتح PDF', openErr);
              }
              finish({ success: true, simulated: true, path: outPath, debug: { ...meta, htmlLen } });
            } catch (simErr) {
              logPrint('خطأ محاكاة PDF', simErr);
              finish({
                success: false,
                simulated: true,
                error: simErr && simErr.message ? simErr.message : String(simErr),
                debug: { ...meta, htmlLen },
              });
            }
            return;
          }

          const trimmedDevice =
            printerName && String(printerName).trim() !== ''
              ? String(printerName).trim()
              : '';

          const basePrint = {
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
            header: '',
            footer: '',
          };

          const explicit80 = { width: 80000, height: 800000 };

          const runPrint = (opts, label) =>
            new Promise((res) => {
              if (!printWin || settled || printWin.isDestroyed()) {
                res({ success: false, failureReason: 'no-window' });
                return;
              }
              logPrint('webContents.print', label, {
                deviceName: opts.deviceName || '(default)',
                usePrinterDefaultPageSize: !!opts.usePrinterDefaultPageSize,
                pageSizeMicrons: opts.pageSize || null,
              });
              printWin.webContents.print(opts, (success, failureReason) => {
                logPrint('نتيجة الطباعة', label, { success, failureReason: failureReason || '' });
                res({ success, failureReason: failureReason || '' });
              });
            });

          const debugBase = {
            platform: process.platform,
            htmlLen,
            deviceName: trimmedDevice || '(default)',
            ...meta,
          };

          const explicitFirst = process.env.HASH_POS_PRINT_EXPLICIT_FIRST === '1';

          if (process.platform === 'win32' && trimmedDevice) {
            let r;
            if (explicitFirst) {
              r = await runPrint(
                { ...basePrint, deviceName: trimmedDevice, pageSize: explicit80 },
                'win:80mm-first'
              );
              if (!r.success) {
                r = await runPrint(
                  { ...basePrint, deviceName: trimmedDevice, usePrinterDefaultPageSize: true },
                  'win:printer-default-retry'
                );
              }
            } else {
              r = await runPrint(
                { ...basePrint, deviceName: trimmedDevice, usePrinterDefaultPageSize: true },
                'win:printer-default-first'
              );
              if (!r.success) {
                r = await runPrint(
                  { ...basePrint, deviceName: trimmedDevice, pageSize: explicit80 },
                  'win:80mm-retry'
                );
              }
            }
            finish({
              success: r.success,
              reason: r.success ? undefined : r.failureReason,
              debug: {
                ...debugBase,
                strategy: explicitFirst ? 'win-explicit-first' : 'win-default-first',
              },
            });
            return;
          }

          const o = { ...basePrint, pageSize: explicit80 };
          if (trimmedDevice) o.deviceName = trimmedDevice;
          const r = await runPrint(o, 'explicit-80mm');
          finish({
            success: r.success,
            reason: r.success ? undefined : r.failureReason,
            debug: { ...debugBase, strategy: 'explicit-80mm' },
          });
        })().catch((e) => {
          logPrint('خطأ مسار الطباعة', e);
          finish({ success: false, error: e.message, debug: { error: e.message } });
        });
      });

      setTimeout(() => {
        if (!settled) {
          logPrint('انتهت مهلة 30 ثانية');
          finish({ success: false, reason: 'timeout' });
        }
      }, 30000);
    } catch (e) {
      logPrint('خطأ فادح', e);
      cleanupFile();
      finish({ success: false, error: e.message });
    }
  });
}

// === Fetch pos_database.json from a peer device via HTTP ===
// callback(err) — اختياري؛ يُستدعى بعد الكتابة الناجحة (err === null) أو عند الفشل
function fetchDatabaseFromPeer(ip, callback) {
  const cb = typeof callback === 'function' ? callback : null;
  const url = `http://${ip}:${HTTP_PORT}/database`;
  http.get(url, (res) => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
      if (res.statusCode !== 200) {
        console.error('[HTTP Sync] ❌ Bad status from', ip, ':', res.statusCode);
        if (cb) cb(new Error('http_' + res.statusCode));
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
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) win.webContents.send('db-file-updated');
        });
        if (cb) cb(null);
      } catch (e) {
        console.error('[HTTP Sync] ❌ Failed to apply database from', ip, ':', e.message);
        if (cb) cb(e);
      }
    });
  }).on('error', (e) => {
    console.error('[HTTP Sync] ❌ Pull error from', ip, ':', e.message);
    if (cb) cb(e);
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
      } else if (data.type === 'lan_factory_reset_ls' && data.hubIp && typeof data.hubIp === 'string') {
        // تصفير شبكي: سحب قاعدة الجهاز المركزي ثم إشعار الواجهات بمسح localStorage (مع الإبقاء على بيانات المدير)
        fetchDatabaseFromPeer(data.hubIp.trim(), (err) => {
          if (err) {
            console.error('[Factory reset LAN] فشل سحب القاعدة من', data.hubIp, err.message || err);
            return;
          }
          BrowserWindow.getAllWindows().forEach((win) => {
            if (!win.isDestroyed()) win.webContents.send('lan-factory-reset-clear-localstorage');
          });
        });
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
ipcMain.handle('db-write-full', (event, data, opts) => {
  try {
    fs.writeFileSync(_dbPath, JSON.stringify(data, null, 2));
    const broadcast = !opts || opts.broadcast !== false;
    if (broadcast) broadcastDBChanged();
    return true;
  } catch (e) {
    console.error('db-write-full error:', e);
    return false;
  }
});

// بث أمر تصفير التخزين المحلي على الأجهزة الأخرى (بعد أن تُكتب القاعدة الفارغة على الجهاز المرسل)
ipcMain.on('broadcast-lan-factory-reset', () => {
  try {
    if (!server) return;
    const hubIp = getLocalIP();
    if (!hubIp || hubIp === '127.0.0.1') {
      console.warn('[Factory reset LAN] لا يوجد عنوان LAN صالح للبث');
      return;
    }
    const msg = Buffer.from(
      JSON.stringify({ type: 'lan_factory_reset_ls', instanceId: myInstanceId, hubIp })
    );
    server.send(msg, 0, msg.length, PORT, BROADCAST_ADDR);
    console.log('[Factory reset LAN] بث تصفير الشبكة، المركز:', hubIp);
  } catch (e) {
    console.error('[Factory reset LAN] broadcast error:', e);
  }
});

// --- نسخ احتياطي على قرص / USB / مسار شبكة محلي ---
const _localBackupSettingsPath = () => path.join(app.getPath('userData'), 'local_disk_backup_settings.json');

function loadLocalDiskBackupSettings() {
  try {
    const o = JSON.parse(fs.readFileSync(_localBackupSettingsPath(), 'utf8'));
    const mins = Number(o.intervalMinutes);
    return {
      folderPath: String(o.folderPath || '').trim(),
      enabled: !!o.enabled,
      intervalMinutes: Number.isFinite(mins) ? Math.max(15, Math.min(10080, mins)) : 360,
      lastAutoRunAt: o.lastAutoRunAt || null,
      lastAutoError: String(o.lastAutoError || ''),
    };
  } catch (_) {
    return { folderPath: '', enabled: false, intervalMinutes: 360, lastAutoRunAt: null, lastAutoError: '' };
  }
}

function saveLocalDiskBackupSettings(data) {
  fs.writeFileSync(_localBackupSettingsPath(), JSON.stringify(data, null, 2), 'utf8');
}

function runLocalDiskBackupJob(parentDir, dbFilePath, localStorageSnapshot) {
  try {
    if (!parentDir || typeof parentDir !== 'string') return { success: false, error: 'no_folder' };
    const norm = path.normalize(parentDir.trim());
    if (!fs.existsSync(norm)) return { success: false, error: 'folder_missing' };
    if (!fs.statSync(norm).isDirectory()) return { success: false, error: 'not_a_directory' };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const destDir = path.join(norm, `HashPOS_backup_${stamp}`);
    fs.mkdirSync(destDir, { recursive: true });
    let dbRaw = '{}';
    if (fs.existsSync(dbFilePath)) dbRaw = fs.readFileSync(dbFilePath, 'utf8');
    const dbObj = JSON.parse(dbRaw);
    fs.writeFileSync(path.join(destDir, 'pos_database.json'), JSON.stringify(dbObj, null, 2), 'utf8');
    const ls = localStorageSnapshot && typeof localStorageSnapshot === 'object' ? localStorageSnapshot : {};
    fs.writeFileSync(path.join(destDir, 'hashpos_localStorage.json'), JSON.stringify(ls, null, 2), 'utf8');
    const manifest = {
      hashPosLocalBackupVersion: 1,
      exportedAt: new Date().toISOString(),
      hostname: os.hostname(),
    };
    fs.writeFileSync(path.join(destDir, 'backup_manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    return { success: true, destDir };
  } catch (err) {
    return { success: false, error: err && err.message ? err.message : String(err) };
  }
}

ipcMain.handle('local-disk-backup-pick-folder', async () => {
  const r = await dialog.showOpenDialog({
    title: 'اختر مجلداً للنسخ الاحتياطي (قرص آخر، USB، …)',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths || !r.filePaths[0]) return { canceled: true, folderPath: '' };
  return { canceled: false, folderPath: r.filePaths[0] };
});

ipcMain.handle('local-disk-backup-execute', async (event, payload) => {
  const snap = payload && payload.localStorageSnapshot && typeof payload.localStorageSnapshot === 'object'
    ? payload.localStorageSnapshot
    : {};
  let parentDir = payload && payload.parentDir ? String(payload.parentDir).trim() : '';
  if (!parentDir) {
    const r = await dialog.showOpenDialog({
      title: 'أين تُحفظ النسخة؟ (يُنشأ مجلد فرعي بتاريخ ووقت كل عملية)',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths || !r.filePaths[0]) return { success: false, canceled: true };
    parentDir = r.filePaths[0];
  }
  return runLocalDiskBackupJob(parentDir, _dbPath, snap);
});

ipcMain.handle('local-disk-backup-get-settings', () => loadLocalDiskBackupSettings());

ipcMain.handle('local-disk-backup-save-settings', async (event, data) => {
  const cur = loadLocalDiskBackupSettings();
  const mins = data && Number(data.intervalMinutes);
  const next = {
    folderPath: data && data.folderPath != null ? String(data.folderPath).trim() : cur.folderPath,
    enabled: data && data.enabled !== undefined ? !!data.enabled : cur.enabled,
    intervalMinutes: Number.isFinite(mins) ? Math.max(15, Math.min(10080, mins)) : cur.intervalMinutes,
    lastAutoRunAt: cur.lastAutoRunAt,
    lastAutoError: cur.lastAutoError,
  };
  if (data && data.resetSchedule) {
    next.lastAutoRunAt = new Date().toISOString();
  }
  saveLocalDiskBackupSettings(next);
  return { success: true, settings: next };
});

ipcMain.handle('local-disk-backup-open-folder', async (event, folderPath) => {
  const p = folderPath && String(folderPath).trim();
  if (!p || !fs.existsSync(p)) return { success: false, error: 'missing' };
  const err = await shell.openPath(p);
  return err ? { success: false, error: err } : { success: true };
});

const LOCAL_DISK_AUTO_CHECK_MS = 60 * 1000;
let localDiskAutoInterval = null;

function startLocalDiskAutoScheduler(appRef, BrowserWindowRef) {
  if (localDiskAutoInterval) clearInterval(localDiskAutoInterval);
  localDiskAutoInterval = setInterval(async () => {
    try {
      const auto = loadLocalDiskBackupSettings();
      if (!auto.enabled) return;
      if (!auto.folderPath || !fs.existsSync(auto.folderPath)) {
        const next = { ...auto, lastAutoError: 'folder_missing' };
        saveLocalDiskBackupSettings(next);
        return;
      }
      const intervalMs = (auto.intervalMinutes || 360) * 60 * 1000;
      if (!auto.lastAutoRunAt) {
        const cur = loadLocalDiskBackupSettings();
        cur.lastAutoRunAt = new Date().toISOString();
        saveLocalDiskBackupSettings(cur);
        return;
      }
      const last = new Date(auto.lastAutoRunAt).getTime();
      if (Number.isNaN(last) || Date.now() - last < intervalMs) return;
      const snap = await collectLocalStorageSnapshot(BrowserWindowRef);
      const res = runLocalDiskBackupJob(auto.folderPath, _dbPath, snap);
      const next = loadLocalDiskBackupSettings();
      if (res.success) {
        next.lastAutoRunAt = new Date().toISOString();
        next.lastAutoError = '';
        saveLocalDiskBackupSettings(next);
        try {
          BrowserWindowRef.getAllWindows().forEach((win) => {
            if (!win.isDestroyed()) win.webContents.send('local-disk-auto-backup', { ok: true, destDir: res.destDir });
          });
        } catch (_) {}
      } else {
        next.lastAutoError = res.error || 'backup_failed';
        saveLocalDiskBackupSettings(next);
        console.warn('[Local backup] scheduled failed:', res);
      }
    } catch (e) {
      console.error('[Local backup] scheduler', e);
    }
  }, LOCAL_DISK_AUTO_CHECK_MS);
}

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
    show: false, // لا تظهر النافذة فوراً لمنع الوميض الأبيض
    backgroundColor: '#0b0f19', // لون خلفية مظلم يطابق لون التطبيق
    autoHideMenuBar: true,
    icon: path.join(__dirname, '1111.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false,  // منع تبطئة الصفحة في الخلفية
      enableWebSQL: false,
    }
  });

  win.setMenuBarVisibility(false);
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.control && input.shift && (input.code === 'KeyI' || input.key === 'I' || input.key === 'i')) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
  
  win.loadFile('login.html');
  
  // قم بتكبير النافذة برمجياً وهي لا تزال في حالة الإخفاء 
  // هذا يمنع ظهور المربع الأسود الصغير قبل عملية التكبير (Maximize Animation)
  win.maximize();
  
  win.once('ready-to-show', () => {
    // إظهار النافذة وهي مجهزة مسبقاً بالشاشة الكاملة
    win.show();
  });
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
  startLocalDiskAutoScheduler(app, BrowserWindow);
  setupNetworkSync();
  setupHTTPServer();
  createWindow();

  try {
    const devOk = globalShortcut.register('CommandOrControl+Shift+I', () => {
      const focused = BrowserWindow.getFocusedWindow();
      if (focused && !focused.isDestroyed()) {
        focused.webContents.toggleDevTools();
        return;
      }
      const list = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
      if (list.length) {
        list[0].webContents.toggleDevTools();
        list[0].focus();
      }
    });
    if (!devOk) {
      console.warn('[HashPOS] لم يُسجَّل اختصار Ctrl+Shift+I (قد يكون محجوزاً لتطبيق آخر)');
    }
  } catch (e) {
    console.warn('[HashPOS] globalShortcut DevTools:', e.message);
  }

  // Auto-start WhatsApp disabled — now starts only when user clicks connect in settings
  // This prevents Chrome/Puppeteer from starting automatically and freezing the app
  // setTimeout(() => { setImmediate(() => startWhatsApp()); }, 15000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  try {
    globalShortcut.unregisterAll();
  } catch (_) { /* ignore */ }
});

// --- WhatsApp Bot Integration (Auto-Start + QR Caching) ---
let waClient = null;
let waReady = false;
let waCachedQR = null; // Store latest QR so settings page gets it instantly
let waRestartTimer = null;
let waManualStop = false;
let waInitializing = false;
let waInitStartedAt = 0;
let waInitFailures = 0;

async function teardownWaClient() {
  try {
    if (waClient) {
      await waClient.destroy().catch(() => {});
    }
  } catch (_) {}
  waClient = null;
  waReady = false;
  waCachedQR = null;
  waInitializing = false;
}

function scheduleWhatsAppRestart(reason, delayMs = 6000) {
  if (waManualStop) {
    console.log('[WA] Auto-restart skipped (manual stop):', reason);
    return;
  }
  if (waRestartTimer) return;
  // Only schedule restart if waManualStop is false AND we have waClient (meaning bot mode was active)
  // This prevents the bot from endlessly restarting on machines where it keeps failing
  console.log(`[WA] Scheduling auto-restart in ${delayMs}ms. Reason:`, reason);
  waRestartTimer = setTimeout(() => {
    waRestartTimer = null;
    if (!waClient && !waManualStop) startWhatsApp();
  }, delayMs);
}

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
  waManualStop = false;
  waInitializing = true;
  waInitStartedAt = Date.now();
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
      // Important for large WA accounts or slow machines; avoids protocol timeouts during init/send.
      protocolTimeout: 300000,
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
        // Keep a reasonable memory ceiling; too low can cause random "zombie" behavior on big accounts.
        '--js-flags=--max-old-space-size=512',
        // NOTE: --single-process removed — caused Chrome instability on some machines
      ],
    };

    if (chromePath) {
      puppeteerConfig.executablePath = chromePath;
      console.log('[WA] Using installed Chrome:', chromePath);
    } else {
      console.log('[WA] Chrome not found, using bundled Chromium');
    }

    const useRemoteVersion = waInitFailures < 3;
    const waClientConfig = {
      authStrategy: new LocalAuth({
        clientId: 'pos-main-client',
        dataPath: path.join(app.getPath('userData'), 'wa_sessions')
      }),
      puppeteer: puppeteerConfig,
      authTimeoutMs: 0,
      qrMaxRetries: 10, // Gives user 10 refresh cycles (~3+ minutes) to get their phone ready
      restartOnAuthFail: false,
    };
    if (useRemoteVersion) {
      waClientConfig.webVersionCache = {
        type: 'remote',
        // Newer WA Web versions tend to be more stable with recent whatsapp-web.js releases.
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1030410331-alpha.html'
      };
    } else {
      console.warn('[WA] Falling back to default web version cache after repeated init failures.');
    }
    waClient = new Client(waClientConfig);

    waReady = false;
    waCachedQR = null;
    let _forcedReadyTimer = null;

    waClient.on('qr', (qr) => {
      console.log('[WA] QR code ready - cached for instant display');
      waInitializing = false;
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
      waInitializing = false;
      waInitFailures = 0;
      BrowserWindow.getAllWindows().forEach(win => win.webContents.send('wa-ready'));
    });

    // Heartbeat: detect "zombie" sessions (connected but not working) and recover automatically.
    // If getState fails/returns null repeatedly, reinitialize.
    let _hbFailures = 0;
    const _hbTimer = setInterval(async () => {
      try {
        if (!waClient) return;
        const st = await waClient.getState().catch(() => null);
        if (!st) {
          _hbFailures += 1;
          if (_hbFailures >= 3) {
            console.warn('[WA] Heartbeat failed 3x -> reinitializing WhatsApp session...');
            clearInterval(_hbTimer);
            await teardownWaClient();
            scheduleWhatsAppRestart('heartbeat_failed', 2500);
          }
          return;
        }
        _hbFailures = 0;
      } catch (e) {
        _hbFailures += 1;
      }
    }, 15000);

    waClient.on('auth_failure', (msg) => {
      console.error('[WA] Auth failure:', msg);
      if (_forcedReadyTimer) clearTimeout(_forcedReadyTimer);
      waReady = false;
      waClient = null;
      waCachedQR = null;
      waInitializing = false;
      waInitFailures += 1;
      BrowserWindow.getAllWindows().forEach(win => win.webContents.send('wa-disconnected', msg));
      scheduleWhatsAppRestart(`auth_failure: ${msg}`, 8000);
    });

    waClient.on('disconnected', (reason) => {
      console.log('[WA] Disconnected:', reason);
      if (_forcedReadyTimer) clearTimeout(_forcedReadyTimer);
      waReady = false;
      waClient = null;
      waCachedQR = null;
      waInitializing = false;
      waInitFailures += 1;
      BrowserWindow.getAllWindows().forEach(win => win.webContents.send('wa-disconnected', reason));
      scheduleWhatsAppRestart(`disconnected: ${reason}`, 6000);
    });

    console.log('[WA] Initializing in background...');
    waClient.initialize().catch(e => {
      console.error('[WA] Initialize error:', e);
      waClient = null;
      waInitializing = false;
      waInitFailures += 1;
      BrowserWindow.getAllWindows().forEach(win => win.webContents.send('wa-disconnected', e.toString()));
      const msg = String(e?.message || e || '');
      const isDetachedFrame = msg.toLowerCase().includes('frame was detached');
      scheduleWhatsAppRestart(`initialize_error: ${msg}`, isDetachedFrame ? 4000 : 10000);
    });

  } catch(e) {
    console.error('[WA] Fatal error:', e);
    waClient = null;
    waInitializing = false;
    waInitFailures += 1;
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
  } else if (waClient || waInitializing) {
    // If init hangs too long, auto-recover then restart.
    if (waInitializing && waInitStartedAt && (Date.now() - waInitStartedAt) > 60000) {
      console.warn('[WA] Init appears stuck >60s. Reinitializing...');
      teardownWaClient().finally(() => startWhatsApp());
    }
    // Still loading (Chrome starting up)
    event.sender.send('wa-still-loading');
  } else {
    // Not started yet - tell renderer it's disconnected instead of force-starting
    event.sender.send('wa-disconnected');
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
  waManualStop = true;
  if (waRestartTimer) {
    clearTimeout(waRestartTimer);
    waRestartTimer = null;
  }
  try { if (waClient) await waClient.logout().catch(() => {}); } catch(e) {}
  await teardownWaClient();
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
  waManualStop = true;
  if (waRestartTimer) {
    clearTimeout(waRestartTimer);
    waRestartTimer = null;
  }
  await teardownWaClient();
  // Restart after short delay
  setTimeout(() => {
    waManualStop = false;
    startWhatsApp();
  }, 1500);
});

/** إرسال فعلي عبر جلسة واتساب على هذا الجهاز */
async function deliverWhatsAppMessage(data) {
  if (!waClient) return { ok: false, error: 'no_client', code: 'NO_CLIENT' };
  try {
    const { MessageMedia } = require('whatsapp-web.js');
    const number = data.number;
    const text = data.text;

    // Normalize phone format robustly (supports Arabic/Indic numerals too)
    const toEnglishDigits = (v) =>
      String(v || '')
        .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
        .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

    let chatId = toEnglishDigits(number).replace(/[^0-9]/g, '');
    if (chatId.startsWith('00966')) chatId = chatId.substring(2); // 00966xxxx -> 966xxxx
    if (chatId.startsWith('9660')) chatId = '966' + chatId.substring(4); // 96605xxxx -> 9665xxxx
    if (chatId.startsWith('05')) chatId = '966' + chatId.substring(1); // 05xxxx -> 9665xxxx
    if (chatId.startsWith('5') && chatId.length === 9) chatId = '966' + chatId; // 5xxxxxxxx -> 9665xxxxxxxx
    if (!chatId.endsWith('@c.us')) chatId += '@c.us';

    try {
      const registered = await waClient.getNumberId(chatId);
      if (registered) {
        chatId = registered._serialized;
      } else {
        // getNumberId can intermittently return null even for valid numbers.
        // Continue with normalized chatId instead of failing immediately.
        console.warn('WhatsApp Number check returned null, sending directly:', chatId);
      }
    } catch (e) {
      // Verification may fail transiently; fallback to direct send attempt.
      console.warn('Error verifying number, fallback to direct send:', e?.message || e);
    }

    if (data.image) {
      const parts = data.image.split(',');
      if (!parts[0] || !parts[1]) {
        return { ok: false, error: 'invalid_image_payload', code: 'INVALID_IMAGE_PAYLOAD' };
      }
      const m = parts[0].match(/:(.*?);/);
      if (!m || !m[1]) {
        return { ok: false, error: 'invalid_image_mime', code: 'INVALID_IMAGE_MIME' };
      }
      const mime = m[1];
      const b64 = parts[1];
      const media = new MessageMedia(mime, b64, 'voucher.jpg');
      await waClient.sendMessage(chatId, media, { caption: text });
    } else {
      await waClient.sendMessage(chatId, text);
    }
    console.log('WhatsApp message/media sent to ' + chatId);
    return { ok: true, chatId };
  } catch (e) {
    console.error('Failed to send WA message:', e);
    return { ok: false, error: e?.message || 'send_failed', code: e?.name || 'SEND_FAILED' };
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
// ── نافذة واتساب المخفية (وضع النافذة الداخلية) ──────────────────────────
let waNativeWin = null;
let waNativeReady = false;

ipcMain.on('wa-show-window', () => {
  if (waNativeWin) { waNativeWin.setOpacity(1); waNativeWin.show(); waNativeWin.focus(); }
  else { startNativeWaWindow(); waNativeWin.setOpacity(1); waNativeWin.show(); }
});

function startNativeWaWindow() {
  if (waNativeWin) { waNativeWin.show(); return; }
  waNativeWin = new BrowserWindow({
    width: 1024, height: 768, show: false, opacity: 0,
    title: 'واتساب - نافذة الإرسال',
    webPreferences: { partition: 'persist:whatsapp', nodeIntegration: false, contextIsolation: true, backgroundThrottling: false }
  });
  waNativeWin.setSkipTaskbar(true);
  waNativeWin.setMenu(null);
  waNativeWin.loadURL('https://web.whatsapp.com', { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" });
  waNativeWin.on('close', (e) => { e.preventDefault(); waNativeWin.setOpacity(0); waNativeWin.hide(); });
  waNativeWin.webContents.on('did-finish-load', () => {
    waNativeReady = true;
    BrowserWindow.getAllWindows().forEach(w => { if(w !== waNativeWin) w.webContents.send('wa-ready'); });
  });
}
// ───────────────────────────────────────────────────────────────────────────

let waMessageQueue = [];
let isWaProcessing = false;

async function processWaQueue() {
  if (isWaProcessing || waMessageQueue.length === 0) return;
  isWaProcessing = true;
  
  while (waMessageQueue.length > 0) {
    const { event, data } = waMessageQueue.shift();
    await handleWaSendMessage(event, data);
    // Wait slightly before processing the next message
    await new Promise(r => setTimeout(r, 4000));
  }
  
  isWaProcessing = false;
}

ipcMain.on('wa-send-message', (event, data) => {
  waMessageQueue.push({ event, data });
  processWaQueue();
});

async function handleWaSendMessage(event, data) {
  if (!data || typeof data !== 'object') return;

  // ── وضع المتصفح (Browser Mode) ─────────────────────────────────────────
  if (data.wa_mode === 'browser') {
    try {
      const { clipboard, nativeImage } = require('electron');
      const toEn = (v) => String(v||'').replace(/[٠-٩]/g,(d)=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,(d)=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
      let phone = toEn(data.number||'').replace(/[^0-9]/g,'');
      if(phone.startsWith('00966')) phone=phone.substring(2);
      if(phone.startsWith('9660')) phone='966'+phone.substring(4);
      if(phone.startsWith('05')) phone='966'+phone.substring(1);
      if(phone.startsWith('5')&&phone.length===9) phone='966'+phone;
      const url = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(data.text||'')}`;
      const vbsPath = path.join(os.tmpdir(), `wa_br_${Date.now()}.vbs`);
      
      let vbs = `Set S=WScript.CreateObject("WScript.Shell")\nS.Run "chrome.exe """&"${url}"&""""\nWScript.Sleep 8000\n`;
      if (data.image) {
        clipboard.writeImage(nativeImage.createFromDataURL(data.image));
        vbs += `S.SendKeys "^v"\nWScript.Sleep 2000\nS.SendKeys "~"\nWScript.Sleep 1500\nS.SendKeys "^{w}"`;
      } else {
        vbs += `S.SendKeys "~"\nWScript.Sleep 1500\nS.SendKeys "^{w}"`;
      }
      
      fs.writeFileSync(vbsPath, vbs, 'utf8');
      require('child_process').exec(`cscript //nologo "${vbsPath}"`, ()=>{ try{fs.unlinkSync(vbsPath);}catch(e){} });
      console.log(`[WA][BROWSER] macro sent for ${phone}`);
    } catch(e) { console.error('[WA][BROWSER]', e?.message); }
    return;
  }

  // ── وضع التطبيق المثبت (Desktop Mode) ──────────────────────────────────
  if (data.wa_mode === 'desktop') {
    try {
      const { shell, clipboard, nativeImage } = require('electron');
      const toEn = (v) => String(v||'').replace(/[٠-٩]/g,(d)=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,(d)=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
      let phone = toEn(data.number||'').replace(/[^0-9]/g,'');
      if(phone.startsWith('00966')) phone=phone.substring(2);
      if(phone.startsWith('9660')) phone='966'+phone.substring(4);
      if(phone.startsWith('05')) phone='966'+phone.substring(1);
      if(phone.startsWith('5')&&phone.length===9) phone='966'+phone;
      await shell.openExternal(`whatsapp://send?phone=${phone}&text=${encodeURIComponent(data.text||'')}`);
      if (data.image) {
        clipboard.writeImage(nativeImage.createFromDataURL(data.image));
        const vbsPath = path.join(os.tmpdir(), `wa_dt_${Date.now()}.vbs`);
        fs.writeFileSync(vbsPath, `WScript.Sleep 8000\nSet S=WScript.CreateObject("WScript.Shell")\nS.AppActivate "WhatsApp"\nWScript.Sleep 1000\nS.SendKeys "+{INS}"\nWScript.Sleep 2000\nS.SendKeys "~"\nWScript.Sleep 500\nS.SendKeys "~"`, 'utf8');
        require('child_process').exec(`cscript //nologo "${vbsPath}"`, ()=>{ try{fs.unlinkSync(vbsPath);}catch(e){} });
      } else {
        const vbsPath = path.join(os.tmpdir(), `wa_dt_${Date.now()}.vbs`);
        fs.writeFileSync(vbsPath, `WScript.Sleep 5500\nSet S=WScript.CreateObject("WScript.Shell")\nS.AppActivate "WhatsApp"\nWScript.Sleep 500\nS.SendKeys "~"`, 'utf8');
        require('child_process').exec(`cscript //nologo "${vbsPath}"`, ()=>{ try{fs.unlinkSync(vbsPath);}catch(e){} });
      }
      console.log(`[WA][DESKTOP] sent for ${phone}`);
    } catch(e) { console.error('[WA][DESKTOP]', e?.message); }
    return;
  }

  // ── وضع النافذة المخفية (Hidden Native Window Mode) ────────────────────
  if (data.wa_mode === 'bot') {
    // إذا لم تكن النافذة مهيأة، افتحها تلقائياً وانتظر حتى تجهز
    if (!waNativeWin) {
      console.log('[WA][NATIVE] Auto-starting native window...');
      startNativeWaWindow();
      // انتظر حتى يتم تحميل الصفحة (did-finish-load) أو 15 ثانية كحد أقصى
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 15000);
        waNativeWin.webContents.once('did-finish-load', () => {
          clearTimeout(timeout);
          setTimeout(resolve, 1000); // انتظر ثانية إضافية للتأكد
        });
      });
    }
    if (!waNativeWin) {
      console.error('[WA][NATIVE] Failed to initialize window');
      return;
    }
    try {
      const { clipboard, nativeImage } = require('electron');
      const toEn = (v) => String(v||'').replace(/[٠-٩]/g,(d)=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,(d)=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
      let phone = toEn(data.number||'').replace(/[^0-9]/g,'');
      if(phone.startsWith('00966')) phone=phone.substring(2);
      if(phone.startsWith('9660')) phone='966'+phone.substring(4);
      if(phone.startsWith('05')) phone='966'+phone.substring(1);
      if(phone.startsWith('5')&&phone.length===9) phone='966'+phone;
      const url = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(data.text||'')}`;

      // ─── إظهار النافذة كشفافة بالكامل (Opacity 0) خلف النافذة الرئيسية لمنع الوميض ───
      const wasHidden = !waNativeWin.isVisible();
      if (wasHidden) { 
        waNativeWin.setOpacity(0); 
        waNativeWin.showInactive(); 
      }
      // إبقاء النافذة الرئيسية في المقدمة
      const mainWins = BrowserWindow.getAllWindows().filter(w => w !== waNativeWin);
      if (mainWins.length > 0) mainWins[0].focus();

      await waNativeWin.loadURL(url, { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" });
      const chatLoaded = await waNativeWin.webContents.executeJavaScript(
        'new Promise(r=>{let n=0;const t=setInterval(()=>{n++;const m=document.querySelector("#main, footer");const x=document.querySelector("div[data-animate-modal-popup=\\"true\\"]");if(m){clearInterval(t);r(true);}else if(x||n>60){clearInterval(t);r(false);}},500);});'
      );
      if (!chatLoaded) {
        console.error('[WA][NATIVE] Chat not loaded');
        try {
          const img = await waNativeWin.webContents.capturePage();
          require('fs').writeFileSync('e:\\baraaq\\wa_error.png', img.toPNG());
          console.log('[WA][NATIVE] Screenshot saved to', 'e:\\baraaq\\wa_error.png');
        } catch(e){}
        if (wasHidden) waNativeWin.hide();
        return;
      }
      if (data.image) {
        clipboard.writeImage(nativeImage.createFromDataURL(data.image));
        
        // انتظر حتى يقوم واتساب بتعبئة النص في حقل الكتابة من الـ URL، وإلا فإن تعبئة النص لاحقاً ستلغي الصورة
        if (data.text) {
          await waNativeWin.webContents.executeJavaScript(`
            new Promise(r => {
              let n = 0;
              const t = setInterval(() => {
                n++;
                const b = document.querySelector('footer div[contenteditable="true"]') || document.querySelector('div[contenteditable="true"]');
                if (b && b.innerText.trim().length > 0) {
                  clearInterval(t);
                  r();
                } else if (n > 20) {
                  clearInterval(t);
                  r();
                }
              }, 250);
            })
          `);
        } else {
          await new Promise(r=>setTimeout(r, 1000));
        }

        await waNativeWin.webContents.executeJavaScript(
          '(function(){ var b = document.querySelector(\'footer div[contenteditable="true"]\') || document.querySelector(\'div[contenteditable="true"]\'); if(b){ b.click(); b.focus(); } })();'
        );
        await new Promise(r=>setTimeout(r,400));
        waNativeWin.webContents.sendInputEvent({type:'keyDown',keyCode:'V',modifiers:['control']});
        waNativeWin.webContents.sendInputEvent({type:'keyUp',keyCode:'V',modifiers:['control']});
        await new Promise(r=>setTimeout(r,2000));
        waNativeWin.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});
        waNativeWin.webContents.sendInputEvent({type:'char',keyCode:'Enter'});
        waNativeWin.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});

        const clickResult = await waNativeWin.webContents.executeJavaScript(`
          (function(){
            // زر الإرسال في معاينة الصورة أو في الدردشة العادية
            var icon = document.querySelector('span[data-icon="send"]') ||
                       document.querySelector('[data-testid="send"]') ||
                       document.querySelector('span[data-icon="send-white"]') ||
                       document.querySelector('[aria-label="Send"]') ||
                       document.querySelector('[data-tab="11"]');
            if(icon) {
              var btn = icon.closest('div[role="button"]') || icon.closest('button') || icon.parentElement;
              if(btn) {
                btn.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, cancelable: true, view: window}));
                btn.dispatchEvent(new MouseEvent('mouseup', {bubbles: true, cancelable: true, view: window}));
                btn.click();
                return "CLICKED_SEND_BUTTON";
              }
              return "ICON_FOUND_BUT_NO_BUTTON_PARENT";
            }
            return "ICON_NOT_FOUND";
          })();
        `);
        console.log('[WA][NATIVE] Image Click Result:', clickResult);
      } else {
        await new Promise(r=>setTimeout(r,1000));
        waNativeWin.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});
        waNativeWin.webContents.sendInputEvent({type:'char',keyCode:'Enter'});
        waNativeWin.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});

        await new Promise(r=>setTimeout(r,1000));
        const clickResultText = await waNativeWin.webContents.executeJavaScript(`
          (function(){
            var icon = document.querySelector('span[data-icon="send"]');
            if(icon) {
              var btn = icon.closest('button') || icon.closest('div[role="button"]') || icon.parentElement;
              if(btn) {
                btn.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, cancelable: true, view: window}));
                btn.dispatchEvent(new MouseEvent('mouseup', {bubbles: true, cancelable: true, view: window}));
                btn.click();
                return "CLICKED_SEND_BUTTON";
              }
              return "ICON_FOUND_BUT_NO_BUTTON_PARENT";
            }
            return "ICON_NOT_FOUND";
          })();
        `);
        console.log('[WA][NATIVE] Text Click Result:', clickResultText);
      }
      await new Promise(r=>setTimeout(r,1500));
      // ─── أخفِ النافذة دائماً بعد الإرسال ───
      waNativeWin.hide();
      // أعد تركيز النافذة الرئيسية
      const mWins = BrowserWindow.getAllWindows().filter(w => w !== waNativeWin);
      if (mWins.length > 0) mWins[0].focus();
      console.log(`[WA][NATIVE] sent for ${phone}`);
    } catch(e) { console.error('[WA][NATIVE]', e?.message); }
    return;
  }

  // ─── إذا كان الوضع غير معروف أو غير محدد وتوجد نافذة مخفية، استخدمها ───
  if (data.wa_mode === 'bot' && !waNativeWin) {
    console.warn('[WA][NATIVE] Bot mode selected but native window not initialized, falling through.');
  } else if ((!data.wa_mode || data.wa_mode === 'bot') && waNativeWin) {
    // إعادة توجيه للمعالج الصحيح إذا لم يتم الإمساك به بالفوق
    console.warn('[WA][NATIVE] Rerouting to bot mode handler (wa_mode was:', data.wa_mode, ')');
    data.wa_mode = 'bot';
    waMessageQueue.unshift({ event: null, data });
    return processWaQueue();
  }

  const hubIp = String(data.waHubIp || '').trim();
  const payload = { ...data };
  delete payload.waHubIp;
  const targetRaw = String(payload.number || '');
  const msgType = payload.image ? 'image+text' : 'text-only';
  const textPreview = String(payload.text || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  console.log(`[WA][SEND] Start -> target="${targetRaw}" type=${msgType} via=${hubIp ? `hub:${hubIp}` : 'local'} preview="${textPreview}"`);

  if (hubIp) {
    const remote = await relayWaHttp(hubIp, payload);
    if (remote && remote.ok) {
      console.log(`[WA][SEND] Success via LAN hub (${hubIp}) -> target="${targetRaw}"`);
      return;
    }
    console.warn(`[WA][SEND] Hub relay failed (${hubIp}) -> target="${targetRaw}" reason="${(remote && remote.error) || 'unknown'}", fallback=local`);
  }

  const local = await deliverWhatsAppMessage(payload);
  if (local.ok) {
    console.log(`[WA][SEND] Success local -> target="${targetRaw}" chatId="${local.chatId || ''}" type=${msgType}`);
    return;
  }

  console.error(`[WA][SEND] Local failed -> target="${targetRaw}" type=${msgType} code="${local.code || 'UNKNOWN'}" reason="${local.error || 'unknown'}"`);
  // Fallback: if media send fails, retry text-only to avoid losing critical notice.
  if (payload.image) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.image;
    console.warn(`[WA][SEND] Trying fallback text-only -> target="${targetRaw}"`);
    const textOnly = await deliverWhatsAppMessage(fallbackPayload);
    if (textOnly.ok) {
      console.warn(`[WA][SEND] Fallback success (text-only) -> target="${targetRaw}" chatId="${textOnly.chatId || ''}"`);
      return;
    }
    console.error(`[WA][SEND] Fallback failed -> target="${targetRaw}" code="${textOnly.code || 'UNKNOWN'}" reason="${textOnly.error || 'unknown'}"`);
  }
}

// Debug channel from renderer -> main terminal (for staff/settings pages)
ipcMain.on('wa-debug-log', (event, payload) => {
  try {
    const p = payload && typeof payload === 'object' ? payload : { message: String(payload || '') };
    const level = String(p.level || 'info').toLowerCase();
    const msg = String(p.message || '');
    if (level === 'error') console.error(`[WA][RENDERER] ${msg}`);
    else if (level === 'warn') console.warn(`[WA][RENDERER] ${msg}`);
    else console.log(`[WA][RENDERER] ${msg}`);
  } catch (e) {
    console.warn('[WA][RENDERER] debug-log parse error:', e?.message || e);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});










