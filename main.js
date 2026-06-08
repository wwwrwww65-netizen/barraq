const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  screen,
  globalShortcut,
  Menu,
} = require('electron');
const fs = require('fs');
const path = require('path');

// ══════════════════════════════════════════════════════════════════════
// الرسوميات والأداء (يجب قبل app.whenReady())
// • الافتراضي: تسريع العتاد مفعّل — أخف على المعالج وأسلس على الأجهزة الضعيفة.
// • إن ظهرت شاشة سوداء: شغّل التطبيق مع المتغير البيئي MISTER_CASHER_SAFE_GRAPHICS=1
//   (يعيد وضع «إيقاف GPU بالكامل» السابق).
// ══════════════════════════════════════════════════════════════════════
function isWeakHostMachine() {
  try {
    const cpus = require('os').cpus();
    if (!cpus || !cpus.length) return false;
    const cores = cpus.length;
    const maxMhz = Math.max(...cpus.map((c) => c.speed || 0));
    return cores <= 4 && maxMhz > 0 && maxMhz < 2400;
  } catch (_) {
    return false;
  }
}

const weakHostMachine = isWeakHostMachine();

function _mcPerfSettingsPath() {
  return path.join(app.getPath('userData'), 'mc_perf_settings.json');
}

function readMcPerfOverrideSync() {
  try {
    const raw = fs.readFileSync(_mcPerfSettingsPath(), 'utf8');
    const j = JSON.parse(raw);
    const mode = j && j.override;
    if (mode === 'weak' || mode === 'strong' || mode === 'auto') return mode;
  } catch (_) {}
  return 'auto';
}

function writeMcPerfOverrideSync(mode) {
  try {
    fs.writeFileSync(_mcPerfSettingsPath(), JSON.stringify({ override: mode }), 'utf8');
  } catch (e) {
    console.warn('[MC_PERF] Could not write perf settings:', e.message);
  }
}

function resolveEffectiveWeakHost(override) {
  const mode = override != null ? override : readMcPerfOverrideSync();
  if (mode === 'weak') return true;
  if (mode === 'strong') return false;
  return weakHostMachine;
}

let effectiveWeakHost = resolveEffectiveWeakHost();
global._mcCompactDbWrites = effectiveWeakHost;
global._mcWeakHost = effectiveWeakHost;

function applyMcPerfOverride(mode) {
  writeMcPerfOverrideSync(mode);
  effectiveWeakHost = resolveEffectiveWeakHost(mode);
  global._mcCompactDbWrites = effectiveWeakHost;
  global._mcWeakHost = effectiveWeakHost;
}

const useSafeGraphics =
  process.env.MISTER_CASHER_SAFE_GRAPHICS === '1' ||
  process.env.MISTER_CASHER_SAFE_GRAPHICS === 'true' ||
  (effectiveWeakHost && process.env.MISTER_CASHER_SAFE_GRAPHICS !== '0');

if (useSafeGraphics) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-software-rasterizer');
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
} else {
  // تقليل مشاكل بعض تعريفات Vulkan دون إجبار الرسم على المعالج فقط
  try {
    app.commandLine.appendSwitch('disable-features', 'Vulkan');
  } catch (_) {}
  // رسم النصوص/الطبقات عبر GPU عند توفره — يخفف الحمل عن المعالج في الواجهات المعقدة
  try {
    app.commandLine.appendSwitch('enable-gpu-rasterization');
  } catch (_) {}
}

app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');

// 🔒 Single Instance Lock - منع تشغيل أكثر من نسخة واحدة في نفس الوقت
// (نفس النهج المستخدم في VS Code و Slack و Discord)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  // النسخة الأولى ستستقبل حدث second-instance وتُحضر نافذتها للواجهة
  console.log('[MisterCasherPOS] ⚠️ Another instance is already running — focusing existing window.');
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // تركيز النافذة الموجودة عند محاولة تشغيل البرنامج مرة أخرى
    const allWindows = BrowserWindow.getAllWindows();
    if (allWindows.length > 0) {
      const win = allWindows[0];
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

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
  stopGoogleDriveAutoScheduler,
  collectLocalStorageSnapshot,
} = require('./google-drive-main');
const dgram = require('dgram');
const http = require('http');
const os = require('os');
const licenseManager = require('./licensing/license-manager');
const { LICENSE_KICK_UDP_TYPE } = require('./licensing/constants');

const PORT = 41234;
const HTTP_PORT = 41235;
const BROADCAST_ADDR = '255.255.255.255';
const myInstanceId = Math.random().toString(36).substring(7);

/**
 * محاكاة طابعة حرارية: لا يُرسل إلى الطابعة؛ يُصدَّر PDF بنفس HTML وبـ @page 80mm (preferCSSPageSize).
 * تشغيل: متغير بيئة MISTER_CASHER_SIMULATE_PRINT=1 أو وسيط --simulate-thermal-print
 * فتح الملف تلقائياً: MISTER_CASHER_SIMULATE_PRINT_OPEN=1 أو --simulate-thermal-print-open
 */
function isSimulateThermalPrint() {
  if (process.argv.includes('--simulate-thermal-print')) return true;
  const v = process.env.MISTER_CASHER_SIMULATE_PRINT;
  return v === '1' || v === 'true' || v === 'yes';
}

function shouldOpenSimulatedPrintPdf() {
  if (process.argv.includes('--simulate-thermal-print-open')) return true;
  const v = process.env.MISTER_CASHER_SIMULATE_PRINT_OPEN;
  return v === '1' || v === 'true';
}

/** سجلات الطباعة — تظهر في طرفية التشغيل؛ واجهة الصفحة: Ctrl+Shift+I (أدوات المطوّر) */
function logPrint(...args) {
  console.log('[MisterCasherPOS.print]', new Date().toISOString(), ...args);
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
let peerPresenceInterval = null;
let mainWindow = null;
let shutdownDone = false;

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
 * تعيين MISTER_CASHER_PRINT_EXPLICIT_FIRST=1 لعكس الترتيب (80mm ثم تعريف الطابعة).
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
        autoHideMenuBar: false,
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
          // capturePage() تم حذفه — كان يستهلك ذاكرة كبيرة في كل طباعة دون فائدة حقيقية
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
        const dbPath = path.join(app.getPath('userData'), 'pos_database.db');

        // 🔒 PROTECTION: Check if we already have local data
        try {
          const dbAPI = require('./sql-database');
          const localOrders = dbAPI.getOrders(1);
          const localProducts = dbAPI.getProducts();
          const hasLocalOrders = localOrders && localOrders.length > 0;
          const hasLocalProducts = localProducts && localProducts.length > 0;

          if (hasLocalOrders || hasLocalProducts) {
            console.warn('[HTTP Sync] ⚠️ Local database has data - skipping automatic overwrite');
            console.warn('[HTTP Sync] Local orders:', localOrders?.length || 0, ', Products:', localProducts?.length || 0);
            writeAuditLog('SYNC_BLOCKED_LOCAL_DATA', {
              peerIp: ip,
              localOrders: localOrders?.length || 0,
              localProducts: localProducts?.length || 0
            });
            if (cb) cb(new Error('local_data_exists'));
            return;
          }
        } catch (checkErr) {
          console.warn('[HTTP Sync] Could not check local DB:', checkErr.message);
        }

        // 🛡️ Create backup before writing
        try {
          if (fs.existsSync(dbPath)) {
            const backupPath = dbPath + `.backup.${Date.now()}`;
            fs.copyFileSync(dbPath, backupPath);
            console.log('[HTTP Sync] 💾 Backup created:', backupPath);
            writeAuditLog('SYNC_BACKUP_CREATED', { peerIp: ip, backupPath });

            // Keep only last 5 backups
            const backups = fs.readdirSync(path.dirname(dbPath))
              .filter(f => f.startsWith('pos_database.json.backup.'))
              .sort((a, b) => b.localeCompare(a));
            if (backups.length > 5) {
              backups.slice(5).forEach(old => {
                fs.unlinkSync(path.join(path.dirname(dbPath), old));
                console.log('[HTTP Sync] 🗑️ Removed old backup:', old);
              });
            }
          }
        } catch (backupErr) {
          console.warn("[HTTP Sync] Backup warning:", backupErr.message);
        }

        writeAuditLog("SYNC_FROM_PEER_START", { peerIp: ip });

        // Write parsed data to SQLite
        const dbAPI = require('./sql-database');
        const writeSuccess = dbAPI.writeFull(parsed);
        if (!writeSuccess) throw new Error("writeFull to SQLite returned false");

        console.log("[HTTP Sync] Database pulled from peer and saved to SQLite:", ip);
        writeAuditLog("SYNC_FROM_PEER_SUCCESS", {
          peerIp: ip,
          orders: parsed.orders ? parsed.orders.length : 0,
          products: parsed.products ? parsed.products.length : 0
        });
        probePeerWaReady(ip, (capable) => {
          if (capable) notifyLanSyncHubCandidate(ip);
        });
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) win.webContents.send("db-file-updated");
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
        const dbAPI = require('./sql-database');
        const dbData = dbAPI.readFull();
        res.writeHead(200);
        res.end(JSON.stringify(dbData));
      } catch (e) {
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
  licenseManager.setHttpServer(httpServer);
}

function setupNetworkSync() {
  server = dgram.createSocket('udp4');

  server.on('error', (err) => {
    console.error(`UDP error:\n${err.stack}`);
    try { server.close(); } catch (e) { }
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
          } catch (e) { }
        }, 800);

      } else if (data.type === 'peer_ping') {
        const licHandled = licenseManager.handlePeerPingLicense(data, rinfo, myInstanceId, server);
        if (!licHandled) {
          BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('check-should-announce', {
              requesterIP: rinfo.address,
              myIP: getLocalIP(),
              myHostname: os.hostname(),
              clientDeviceId: data.deviceId || '',
            });
          });
        }

      } else if (data.type === 'peer_rejected') {
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send('license-peer-rejected', {
              hubDeviceId: data.hubDeviceId,
              clientDeviceId: data.clientDeviceId,
              allowedClients: data.allowedClients,
              reason: data.reason,
            });
          }
        });

      } else if (data.type === LICENSE_KICK_UDP_TYPE) {
        licenseManager.executeKillSwitch(data.reason || 'blocked');

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
          } catch (e) { }
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
        // Only auto-fetch if we don't have local data
        try {
          const dbAPI = require('./sql-database');
          const localOrders = dbAPI.getOrders(1);
          const localProducts = dbAPI.getProducts();
          const hasLocalData = (localOrders?.length || 0) > 0 || (localProducts?.length || 0) > 0;
          
          if (!hasLocalData) {
            writeAuditLog('DB_CHANGED_FETCH_PEER', { peerIp: rinfo.address, reason: 'no_local_data' });
            fetchDatabaseFromPeer(rinfo.address);
          } else {
            console.log('[Sync] Ignoring db_changed - local data exists');
            writeAuditLog('DB_CHANGED_IGNORED', { peerIp: rinfo.address, reason: 'has_local_data' });
          }
        } catch (e) {
          writeAuditLog('DB_CHANGED_FETCH_PEER', { peerIp: rinfo.address, reason: 'check_error', error: e.message });
          fetchDatabaseFromPeer(rinfo.address);
        }
      } else if (data.type === 'lan_factory_reset_ls' && data.hubIp && typeof data.hubIp === 'string') {
        // 🔒 FACTORY RESET PROTECTION: Require explicit confirmation
        console.warn('[Factory reset LAN] Received factory reset request from:', data.hubIp);
        writeAuditLog('FACTORY_RESET_REQUEST_RECEIVED', {
          hubIp: data.hubIp,
          requesterInstanceId: data.instanceId
        });

        // Show confirmation dialog to user
        const { dialog } = require('electron');
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            dialog.showMessageBox(win, {
              type: 'warning',
              title: '⚠️ طلب تصفير من الشبكة',
              message: 'جهاز آخر يطلب تصفير قاعدة البيانات!',
              detail: `الجهاز ${data.hubIp} يريد مسح جميع بياناتك.\n\nهل توافق على هذا الإجراء؟\n\n⚠️ هذا الإجراء لا يمكن التراجع عنه!`,
              buttons: ['✅ موافق - تصفير البيانات', '❌ رفض - الاحتفاظ ببياناتي'],
              defaultId: 1,
              cancelId: 1,
              noLink: true
            }).then((result) => {
              if (result.response === 0) {
                // User confirmed - proceed with reset
                console.log('[Factory reset LAN] User confirmed factory reset');
                writeAuditLog('FACTORY_RESET_CONFIRMED', { hubIp: data.hubIp });
                fetchDatabaseFromPeer(data.hubIp.trim(), (err) => {
                  if (err) {
                    console.error('[Factory reset LAN] فشل سحب القاعدة من', data.hubIp, err.message || err);
                    writeAuditLog('FACTORY_RESET_FAILED', { hubIp: data.hubIp, error: err.message || err });
                    return;
                  }
                  writeAuditLog('FACTORY_RESET_SUCCESS', { hubIp: data.hubIp });
                  BrowserWindow.getAllWindows().forEach((win) => {
                    if (!win.isDestroyed()) win.webContents.send('lan-factory-reset-clear-localstorage');
                  });
                });
              } else {
                // User denied - log and ignore
                console.log('[Factory reset LAN] User denied factory reset - keeping local data');
                writeAuditLog('FACTORY_RESET_DENIED', { hubIp: data.hubIp });
              }
            });
          }
        });
      } else {
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('network-sync-update', data);
        });
      }
    } catch (e) { }
  });

  server.on('listening', () => {
    try {
      server.setBroadcast(true);
      console.log('Network Sync listening on ' + PORT);
    } catch (e) { }
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
      if (!server) return;
      data.instanceId = myInstanceId;
      const message = Buffer.from(JSON.stringify(data));
      server.send(message, 0, message.length, PORT, BROADCAST_ADDR);
    } catch (e) {
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
    } catch (e) { }
  }

  ipcMain.on('lan-broadcast-presence', () => broadcastPeerPresence());

  if (peerPresenceInterval) clearInterval(peerPresenceInterval);
  peerPresenceInterval = setInterval(broadcastPeerPresence, 25000);
  setTimeout(broadcastPeerPresence, 2500);

  licenseManager.setNetworkRefs(
    (msg, off, len, port, addr) => {
      try {
        server.send(msg, off, len, port, addr);
      } catch (e) {
        console.error('[License] UDP relay:', e.message);
      }
    },
    PORT,
    BROADCAST_ADDR
  );
  licenseManager.startBackgroundWorker();

  // Handle direct PDF Export saving
  ipcMain.handle('export-pdf', async (event, filename) => {
    try {
      const { filePath } = await dialog.showSaveDialog({
        title: 'حفظ التقرير كـ PDF',
        defaultPath: filename || 'report.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });

      if (filePath) {
        // A4 standard dimensions: 210mm x 297mm (8.26" x 11.69")
        const pdfData = await event.sender.printToPDF({
          printBackground: true,
          landscape: false,  // Portrait (vertical)
          marginsType: 0, // Custom margins
          margins: {
            top: 0.04,      // 1mm
            bottom: 0.04,   // 1mm
            left: 0.08,     // 2mm
            right: 0.08     // 2mm
          },
          pageSize: 'A4'
        });
        await fs.promises.writeFile(filePath, pdfData);
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
    } catch (e) {
      console.error('Failed to open folder:', e);
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle('get-printers', async (event) => {
    try {
      return await event.sender.getPrintersAsync();
    } catch (e) {
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

  // notify-db-changed: مُعالج على مستوى الوحدة (broadcastDBChanged) بعد setupNetworkSync
  // لا حاجة لمعالج مكرر هنا — تم الحذف لمنع البث المزدوج

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
// مع debounce لمنع الإرسال المتكرر خلال 500ms
let _broadcastDebounceTimer = null;
function broadcastDBChanged() {
  if (_broadcastDebounceTimer) clearTimeout(_broadcastDebounceTimer);
  const debounceMs = effectiveWeakHost ? 1400 : 550;
  _broadcastDebounceTimer = setTimeout(() => {
    _broadcastDebounceTimer = null;
    try {
      if (!server) return;
      const msg = Buffer.from(JSON.stringify({ type: 'db_changed', instanceId: myInstanceId }));
      server.send(msg, 0, msg.length, PORT, BROADCAST_ADDR);
      BrowserWindow.getAllWindows().forEach((win) => {
        if (win.isDestroyed()) return;
        try {
          if (win.isVisible() || win.isFocused()) {
            win.webContents.send('db-file-updated');
          }
        } catch (_) {}
      });
    } catch (e) { }
  }, debounceMs);
}

ipcMain.on('notify-db-changed', () => {
  broadcastDBChanged();
});

ipcMain.on('get-db-path', (event) => {
  event.returnValue = path.join(app.getPath('userData'), 'pos_database.json');
});

// === Database IPC Handlers ===
const dbAPI = require('./sql-database');

ipcMain.handle('db-save-order', async (event, data) => {
  const result = dbAPI.saveOrder(data);

  setImmediate(() => broadcastDBChanged());

  // ZATCA Direct Auto-Sync
  setTimeout(async () => {
    try {
      if (typeof zatcaService !== 'undefined' && zatcaService.isReady) {
        const dbData = zatcaService.getDbData();
        if (dbData.zatca_csid && dbData.zatca_csid.onboarded) {
          await zatcaService.reportInvoice(data);
        }
      }
    } catch (e) { }
  }, 1000);

  return result;
});

ipcMain.handle('db-get-orders', async () => {
  return dbAPI.getOrders();
});

ipcMain.handle('db-get-orders-all', async () => {
  return dbAPI.getOrders(0);
});

// ⚡ جلب بيانات آخر طلب فقط لتوليد رقم الفاتورة — أسرع بكثير من جلب 500 سجل
ipcMain.handle('db-get-last-order-meta', async () => {
  return dbAPI.getLastOrderMeta();
});

// ⚡ جلب أعلى رقم تسلسلي للطلبات مباشرة دون جلب بيانات الطلبات
ipcMain.handle('db-get-max-order-number', async () => {
  return dbAPI.getMaxOrderNumber();
});

ipcMain.handle('db-get-products', async () => {
  return dbAPI.getProducts();
});

ipcMain.handle('db-get-categories', async () => {
  return dbAPI.getCategories();
});

ipcMain.handle('db-get-inventory', async () => {
  return dbAPI.getInventory();
});

ipcMain.handle('db-save-product', async (event, data) => {
  const result = dbAPI.saveProduct(data);
  setImmediate(() => broadcastDBChanged());
  return result;
});

ipcMain.handle('db-save-category', async (event, data) => {
  const result = dbAPI.saveCategory(data);
  setImmediate(() => broadcastDBChanged());
  return result;
});

ipcMain.handle('db-save-inventory', async (event, item) => {
  const result = dbAPI.saveInventoryItem(item);
  setImmediate(() => broadcastDBChanged());
  return result;
});

// Paths and helpers
const _dbPath = path.join(app.getPath('userData'), 'pos_database.json');
const _auditLogPath = path.join(app.getPath('userData'), 'pos_database_audit.log');
const _emptyDB = { orders: [], products: [], categories: [], inventory: [], purchases: [], suppliers: [], inventoryTx: [], returns: [], expenses: [], bankTransfers: [], hrExpenses: [], otherIncome: [], employees: [], attendance: [], penaltyRules: [], chartOfAccounts: [], journalEntries: [], systemNotifications: [], inventoryAlertState: {}, deliveryCompanies: [] };


// تحميل قاعدة البيانات وتهيئتها
app.whenReady().then(async () => {
  const sqlDbPath = path.join(app.getPath('userData'), 'pos_database.db');
  dbAPI.initDb(sqlDbPath);
  
  const sqlMigrator = require('./sql-migrator');
  await sqlMigrator.migrate(_dbPath);

  if (effectiveWeakHost) {
    console.log('[MisterCasherPOS] Low-power mode: safe graphics, compact DB writes, background throttling.');
  }
});

ipcMain.handle('mc-save-perf-override', async (event, mode) => {
  const m = mode === 'weak' || mode === 'strong' || mode === 'auto' ? mode : 'auto';
  applyMcPerfOverride(m);
  return { ok: true, effectiveWeak: effectiveWeakHost };
});

ipcMain.handle('mc-get-perf-override', async () => {
  return {
    override: readMcPerfOverrideSync(),
    effectiveWeak: effectiveWeakHost,
    hardwareWeak: weakHostMachine,
  };
});


// 📝 Audit Log Helper - تسجيل جميع العمليات الهامة
function writeAuditLog(action, details) {
  try {
    const logEntry = {
      timestamp: new Date().toISOString(),
      action: action,
      details: details,
      hostname: require('os').hostname()
    };
    const logLine = JSON.stringify(logEntry) + '\n';
    fs.appendFileSync(_auditLogPath, logLine, 'utf8');

    // Keep log file under 10MB (rotate if needed)
    try {
      const stats = fs.statSync(_auditLogPath);
      if (stats.size > 10 * 1024 * 1024) { // 10MB
        const oldPath = _auditLogPath + '.old';
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        fs.renameSync(_auditLogPath, oldPath);
        console.log('[Audit] Log rotated');
      }
    } catch (e) { }
  } catch (e) {
    console.error('[Audit] Failed to write log:', e.message);
  }
}
// ⚡ قراءة فورية من الذاكرة (Cache) بدلاً من القرص في كل مرة
ipcMain.handle('db-read-day-closures', async () => {
  return dbAPI.getDayClosures();
});

ipcMain.handle('db-read-slice', async (event, keys) => {
  return dbAPI.readSlice(keys);
});

ipcMain.handle('db-update-order', async (event, orderData) => {
  const result = dbAPI.updateOrder(orderData);
  if (result.success) setImmediate(() => broadcastDBChanged());
  return result;
});

ipcMain.handle('db-append-day-closure', async (event, payload) => {
  const summary = payload && payload.summary;
  const shifts = (payload && payload.shifts) || [];
  const result = dbAPI.appendDayClosure(summary, shifts);
  if (result.success) setImmediate(() => broadcastDBChanged());
  return result;
});

ipcMain.handle('db-read-day-closure-detail', async (event, closureId) => {
  return dbAPI.getDayClosureDetail(closureId);
});

ipcMain.handle('db-read-full', async () => {
  return dbAPI.readFull();
});

ipcMain.handle('db-read-ui', async () => {
  return dbAPI.readUI();
});

ipcMain.handle('db-write-full', async (event, data, opts) => {
  const success = dbAPI.writeFull(data);
  const broadcast = !opts || opts.broadcast !== false;
  if (success && broadcast) setImmediate(() => broadcastDBChanged());
  return success;
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

async function runLocalDiskBackupJob(parentDir, dbFilePath, localStorageSnapshot) {
  try {
    if (!parentDir || typeof parentDir !== "string") return { success: false, error: "no_folder" };
    const norm = path.normalize(parentDir.trim());
    if (!fs.existsSync(norm)) return { success: false, error: "folder_missing" };
    if (!fs.statSync(norm).isDirectory()) return { success: false, error: "not_a_directory" };
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const destDir = path.join(norm, "MisterCasherPOS_backup_" + stamp);
    fs.mkdirSync(destDir, { recursive: true });

    // Flush all pending orders and data from WAL to main DB file before backup
    dbAPI.checkpointDb();

    // Read full database from SQLite (always current)
    const dbObj = dbAPI.readFull();

    // 1. Save JSON snapshot (compatible with all restore tools)
    // Using fs.promises and removing JSON format indentation prevents UI freeze
    await fs.promises.writeFile(path.join(destDir, "pos_database.json"), JSON.stringify(dbObj), "utf8");

    // 2. Copy raw SQLite file (fast direct restore)
    const sqlDbPath = path.join(app.getPath("userData"), "pos_database.db");
    if (fs.existsSync(sqlDbPath)) {
      await fs.promises.copyFile(sqlDbPath, path.join(destDir, "pos_database.db"));
    }

    const ls = localStorageSnapshot && typeof localStorageSnapshot === "object" ? localStorageSnapshot : {};
    await fs.promises.writeFile(path.join(destDir, "mistercasher_localStorage.json"), JSON.stringify(ls), "utf8");
    const manifest = {
      misterCasherLocalBackupVersion: 2,
      exportedAt: new Date().toISOString(),
      hostname: os.hostname(),
      hasSqlite: true,
    };
    await fs.promises.writeFile(path.join(destDir, "backup_manifest.json"), JSON.stringify(manifest), "utf8");
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

// === استعادة النسخة الاحتياطية ===
ipcMain.handle('restore-backup-get-info', async (event, backupFolder) => {
  try {
    const folder = String(backupFolder).trim();
    if (!folder || !fs.existsSync(folder)) {
      return { success: false, error: 'folder_not_found' };
    }

    // البحث عن ملف pos_database.json في المجلد
    const dbFile = path.join(folder, 'pos_database.json');
    if (!fs.existsSync(dbFile)) {
      return { success: false, error: 'database_not_found' };
    }

    // قراءة معلومات قاعدة البيانات
    const dbData = JSON.parse(fs.readFileSync(dbFile, 'utf8'));

    // استخراج التاريخ من اسم المجلد
    const folderName = path.basename(folder);
    const dateMatch = folderName.match(/MisterCasherPOS_backup_(.+)/);
    let dateStr = 'غير معروف';
    if (dateMatch) {
      try {
        const datePart = dateMatch[1].replace(/-/g, '/').replace('T', ' ');
        dateStr = new Date(datePart).toLocaleString('ar-SA');
      } catch (e) {
        dateStr = folderName;
      }
    }

    return {
      success: true,
      date: dateStr,
      ordersCount: dbData.orders?.length || 0,
      productsCount: dbData.products?.length || 0,
      inventoryCount: dbData.inventory?.length || 0,
      hasLocalStorage: fs.existsSync(path.join(folder, 'mistercasher_localStorage.json'))
    };
  } catch (e) {
    console.error('[Restore] Error getting backup info:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('restore-backup-execute', async (event, options) => {
  try {
    if (!options || !options.backupFolder) {
      return { success: false, error: 'لم يتم تحديد مجلد النسخة الاحتياطية' };
    }

    const backupFolder = String(options.backupFolder).trim();
    if (!backupFolder || !fs.existsSync(backupFolder)) {
      return { success: false, error: 'المجلد غير موجود: ' + backupFolder };
    }

    const dbFile = path.join(backupFolder, 'pos_database.json');
    const sqliteFile = path.join(backupFolder, 'pos_database.db');
    const lsFile = path.join(backupFolder, 'mistercasher_localStorage.json');

    // Must have at least one of JSON or SQLite
    if (!fs.existsSync(dbFile) && !fs.existsSync(sqliteFile)) {
      return { success: false, error: 'لم يتم العثور على ملف قاعدة البيانات في المجلد:\n' + backupFolder };
    }

    console.log('[Restore] Starting restore from:', backupFolder);

    // === Case 1: SQLite file exists in backup (direct copy - fastest) ===
    if (fs.existsSync(sqliteFile)) {
      try {
        const sqlDbPath = path.join(app.getPath('userData'), 'pos_database.db');
        // Close DB, copy, reopen
        dbAPI.closeDb();
        fs.copyFileSync(sqliteFile, sqlDbPath);
        dbAPI.initDb(sqlDbPath);
        console.log('[Restore] Restored from SQLite file directly');
        writeAuditLog('DATABASE_RESTORED_SQLITE', { from: backupFolder });
      } catch (e) {
        return { success: false, error: 'فشل استعادة ملف SQLite:\n' + e.message };
      }
    }
    // === Case 2: JSON file exists - convert to SQLite ===
    else {
      let backupDb;
      try {
        const raw = fs.readFileSync(dbFile, 'utf8');
        backupDb = JSON.parse(raw);
      } catch (parseErr) {
        return { success: false, error: 'ملف قاعدة البيانات تالف:\n' + parseErr.message };
      }

      if (!backupDb || typeof backupDb !== 'object') {
        return { success: false, error: 'تنسيق قاعدة البيانات غير صحيح' };
      }

      // Clear all existing SQLite data then write backup
      try {
        const sqlDbPath = path.join(app.getPath('userData'), 'pos_database.db');
        dbAPI.closeDb();
        // Delete old SQLite and create fresh one
        if (fs.existsSync(sqlDbPath)) fs.unlinkSync(sqlDbPath);
        const walPath = sqlDbPath + '-wal';
        const shmPath = sqlDbPath + '-shm';
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
        dbAPI.initDb(sqlDbPath);

        const success = dbAPI.writeFull(backupDb);
        if (!success) throw new Error('writeFull returned false');

        console.log('[Restore] Restored from JSON to SQLite:', Object.keys(backupDb).length, 'keys');
        writeAuditLog('DATABASE_RESTORED_JSON_TO_SQLITE', {
          from: backupFolder,
          orders: backupDb.orders ? backupDb.orders.length : 0,
          products: backupDb.products ? backupDb.products.length : 0
        });
      } catch (writeErr) {
        console.error('[Restore] Failed to write to SQLite:', writeErr.message);
        return { success: false, error: 'فشل كتابة قاعدة البيانات:\n' + writeErr.message };
      }
    }

    // Restore localStorage if available
    if (fs.existsSync(lsFile)) {
      try {
        const lsData = JSON.parse(fs.readFileSync(lsFile, 'utf8'));
        if (lsData && typeof lsData === 'object') {
          BrowserWindow.getAllWindows().forEach((win) => {
            if (!win.isDestroyed()) win.webContents.send('restore-local-storage', lsData);
          });
        }
      } catch (lsErr) {
        console.warn('[Restore] LocalStorage warning:', lsErr.message);
      }
    }

    // We do NOT send 'db-file-updated' here anymore because it instantly reloads
    // the UI, preventing the user from seeing the "Success" alert popup.
    // The UI handles calling 'app-reload' explicitly after showing the alert.

    console.log('[Restore] Restore completed successfully!');
    return { success: true };
  } catch (e) {
    console.error('[Restore] Fatal error:', e.message);
    writeAuditLog('RESTORE_ERROR', { error: e.message });
    return { success: false, error: 'خطأ غير متوقع:\n' + e.message };
  }
});

// إعادة تشغيل التطبيق بالكامل (Relaunch)
ipcMain.on('app-reload', () => {
  app.relaunch();
  app.exit(0);
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
      const res = await runLocalDiskBackupJob(auto.folderPath, _dbPath, snap);
      const next = loadLocalDiskBackupSettings();
      if (res.success) {
        next.lastAutoRunAt = new Date().toISOString();
        next.lastAutoError = '';
        saveLocalDiskBackupSettings(next);
        try {
          BrowserWindowRef.getAllWindows().forEach((win) => {
            if (!win.isDestroyed()) win.webContents.send('local-disk-auto-backup', { ok: true, destDir: res.destDir });
          });
        } catch (_) { }
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
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('zatca-onboard', async (event, data) => {
  try {
    return await zatcaService.onboardDevice(data.otp);
  } catch (e) { return { success: false, error: e.message }; }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: effectiveWeakHost, // على الأجهزة الضعيفة: إظهار فوري يقلل إحساس «شاشة سوداء مجمدة»
    paintWhenInitiallyHidden: true, // يجهّز الطبقة قبل الإظهار — انتقال أوضح وأقل تقطيع عند الفتح
    backgroundColor: '#0b0f19', // لون خلفية مظلم يطابق لون التطبيق
    autoHideMenuBar: false,
    icon: path.join(__dirname, '2222.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // على الأجهزة الضعيفة: تبطئة الخلفية لتوفير المعالج — الميزات كاملة
      backgroundThrottling: effectiveWeakHost,
      enableWebSQL: false,
      spellcheck: false,
    }
  });

  // 🛡️ Disable menu bar completely to prevent Alt key glitch
  Menu.setApplicationMenu(null);
  win.setMenuBarVisibility(false);
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    // 🔄 Ctrl+R - Reload
    if (input.control && (input.code === 'KeyR' || input.key === 'r' || input.key === 'R')) {
      win.reload();
      event.preventDefault();
    }

    // 🛠️ Ctrl+Shift+I - DevTools
    if (input.control && input.shift && (input.code === 'KeyI' || input.key === 'I' || input.key === 'i')) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }

    // 🛡️ منع مفتاح Alt من تنشيط أي وظائف في النافذة قد تسبب فقدان التركيز
    if (input.key === 'Alt') {
      event.preventDefault();
      return;
    }
  });

  const loadStartupPage = async () => {
    try {
      const pageSpec = await licenseManager.resolveStartupPage();
      const qIdx = pageSpec.indexOf('?');
      if (qIdx >= 0) {
        const file = pageSpec.slice(0, qIdx);
        const qs = new URLSearchParams(pageSpec.slice(qIdx + 1));
        const query = {};
        qs.forEach((v, k) => {
          query[k] = v;
        });
        await win.loadFile(file, { query });
      } else {
        await win.loadFile(pageSpec);
      }
    } catch (e) {
      console.error('[License] startup page:', e.message);
      await win.loadFile('login.html');
    }
  };
  loadStartupPage();

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) {
      if (!win.isMaximized()) win.maximize();
      win.show();
      win.focus();
    }
  });

  // تم إزالة أكواد الإخفاء والوميض الاصطناعية بناءً على طلب المستخدم
  // بحيث تفتح الصفحة وتُعرض فوراً وبشكل طبيعي جداً بدون أي خلفية أو شاشة تغطيها.

  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
    // نافذة واتساب المخفية (preventDefault على close) تمنع window-all-closed
    destroyWaNativeWindow();
    if (process.platform !== 'darwin' && BrowserWindow.getAllWindows().length === 0) {
      app.quit();
    }
  });
}

function setupLicenseIpc() {
  const dbPathFn = () => path.join(app.getPath('userData'), 'pos_database.json');

  licenseManager.init(app, dbPathFn);

  ipcMain.handle('license-get-device-id', async () => licenseManager.getDeviceId());
  ipcMain.handle('license-get-info', async () =>
    new Promise((resolve) => {
      setImmediate(() => {
        try {
          resolve(licenseManager.getPublicInfo());
        } catch (e) {
          resolve({ deviceId: '—', status: 'none', statusLabel: '—', canLogin: false, error: e.message });
        }
      });
    })
  );
  ipcMain.handle('license-evaluate-access', async () =>
    new Promise((resolve) => {
      setImmediate(() => {
        try {
          const a = licenseManager.evaluateAccess();
          resolve({ ok: a.ok, message: a.message, lock: a.lock });
        } catch (e) {
          resolve({ ok: false, message: e.message, lock: null });
        }
      });
    })
  );
  ipcMain.handle('license-get-trial-blob', () => licenseManager.cache.trialBlob || null);
  ipcMain.handle('license-start-trial', async (e, pkg) => {
    const r = await licenseManager.startTrial(pkg || {});
    return { ...r, trialBlob: licenseManager.cache.trialBlob || null };
  });
  ipcMain.handle('license-request-permanent', async (e, pkg) =>
    licenseManager.requestPermanentActivation(pkg || {})
  );
  ipcMain.handle('license-request-extra-devices', async (e, pkg) =>
    licenseManager.requestExtraDevices(pkg || {})
  );
  ipcMain.handle('license-check-status', () => licenseManager.checkStatusFromCloud());
  ipcMain.handle('license-refresh-manual', () => licenseManager.refreshLicenseManual());
  ipcMain.handle('license-request-upgrade', async (e, data) =>
    licenseManager.requestUpgrade(data.clientDeviceId, data.hubDeviceId)
  );
  ipcMain.on('license-mark-setup-complete', (event, meta) => {
    licenseManager.markSetupComplete(meta || {});
  });
  ipcMain.on('update-restaurant-info', (event, info) => {
    licenseManager.updateRestaurantInfo(info);
  });
  ipcMain.handle('license-save-ls-trial-blob', async (e, blob) => {
    try {
      const p = path.join(app.getPath('userData'), 'license-ls-trial.json');
      await fs.promises.writeFile(p, JSON.stringify({ blob }), 'utf8');
      return true;
    } catch (err) {
      return false;
    }
  });
}

app.on('before-quit', () => {
  try {
    licenseManager.recordShutdown();
    licenseManager.stopBackgroundWorker();
  } catch (_) {}
});

app.whenReady().then(() => {
  setupLicenseIpc();

  // ══════════════════════════════════════════════════════════════
  // 🚀 استراتيجية الفتح السريع — نفس نهج VS Code و Spotify و Discord
  //   المرحلة 1: النافذة تظهر فوراً (أولوية قصوى)
  //   المرحلة 2: الخدمات الثقيلة تبدأ في الخلفية بعد ظهور النافذة
  // ══════════════════════════════════════════════════════════════

  // ─── المرحلة 1: النافذة أولاً — بدون أي انتظار ────────────────
  createWindow();

  // ─── اختصارات النظام (Reload & DevTools) ──────────────────────
  try {
    // Ctrl+R - Reload
    globalShortcut.register('CommandOrControl+R', () => {
      const win = BrowserWindow.getFocusedWindow();
      if (win && !win.isDestroyed()) win.reload();
    });

    // Ctrl+Shift+I - DevTools
    const devOk = globalShortcut.register('CommandOrControl+Shift+I', () => {
      const focused = BrowserWindow.getFocusedWindow();
      if (focused && !focused.isDestroyed()) { focused.webContents.toggleDevTools(); return; }
      const list = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
      if (list.length) { list[0].webContents.toggleDevTools(); list[0].focus(); }
    });
    if (!devOk) console.warn('[MisterCasherPOS] اختصار Ctrl+Shift+I محجوز بتطبيق آخر');
  } catch (e) { console.warn('[MisterCasherPOS] globalShortcut:', e.message); }

  // ─── المرحلة 2: الخدمات الثقيلة في الخلفية ───────────────────
  // setImmediate: يضمن رسم النافذة أولاً ثم تبدأ الخدمات
  setImmediate(() => {
    // 🌐 UDP Network Sync — الأهم للمزامنة بين الأجهزة
    try { setupNetworkSync(); } catch (e) { console.error('[Startup] NetworkSync:', e.message); }

    // 🌍 HTTP Server — بعد 300ms
    setTimeout(() => {
      try { setupHTTPServer(); } catch (e) { console.error('[Startup] HTTPServer:', e.message); }
    }, 300);

    // ☁️ Google Drive IPC — بعد 600ms (لا يؤثر على الواجهة)
    setTimeout(() => {
      try {
        setupGoogleDriveIpc(ipcMain, app,
          () => path.join(app.getPath('userData'), 'pos_database.json')
        );
      } catch (e) { console.error('[Startup] GoogleDriveIpc:', e.message); }
    }, 600);

    // ⏰ المجدولات التلقائية — بعد 1200ms (أخف الخدمات تأثيراً)
    setTimeout(() => {
      try {
        startGoogleDriveAutoScheduler(
          app,
          () => path.join(app.getPath('userData'), 'pos_database.json'),
          BrowserWindow
        );
      } catch (e) { console.error('[Startup] DriveScheduler:', e.message); }
      try { startLocalDiskAutoScheduler(app, BrowserWindow); }
      catch (e) { console.error('[Startup] DiskScheduler:', e.message); }
    }, 1200);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
// ============================================================
// Graceful Shutdown
// السبب الجذري لعدم إعادة الفتح: نافذة واتساب المخفية + مؤقتات UDP/WA
// تُبقي العملية حية؛ النسخة الجديدة تفشل في requestSingleInstanceLock وتُغلق فوراً.
// ============================================================
function destroyWaNativeWindow() {
  if (!waNativeWin || waNativeWin.isDestroyed()) {
    waNativeWin = null;
    waNativeReady = false;
    return;
  }
  try {
    waNativeWin.removeAllListeners('close');
    waNativeWin.destroy();
  } catch (_) { }
  waNativeWin = null;
  waNativeReady = false;
}

async function shutdownAllServices() {
  waManualStop = true;
  if (waRestartTimer) {
    clearTimeout(waRestartTimer);
    waRestartTimer = null;
  }
  if (peerPresenceInterval) {
    clearInterval(peerPresenceInterval);
    peerPresenceInterval = null;
  }
  if (localDiskAutoInterval) {
    clearInterval(localDiskAutoInterval);
    localDiskAutoInterval = null;
  }
  try { stopGoogleDriveAutoScheduler(); } catch (_) { }

  destroyWaNativeWindow();
  await teardownWaClient();

  try { globalShortcut.unregisterAll(); } catch (_) { }

  if (server) {
    try {
      await new Promise((resolve) => {
        server.close(() => resolve());
        setTimeout(resolve, 500);
      });
      console.log('[MisterCasherPOS] ✅ UDP server closed gracefully.');
    } catch (_) { }
    server = null;
  }

  if (httpServer) {
    try {
      await new Promise((resolve) => {
        httpServer.close(() => resolve());
        setTimeout(resolve, 500);
      });
      console.log('[MisterCasherPOS] ✅ HTTP server closed gracefully.');
    } catch (_) { }
    httpServer = null;
  }

  try { app.releaseSingleInstanceLock(); } catch (_) { }
  console.log('[MisterCasherPOS] 👋 App shutdown complete.');
}

app.on('before-quit', (event) => {
  if (shutdownDone) return;
  event.preventDefault();
  shutdownAllServices()
    .catch((e) => console.error('[MisterCasherPOS] Shutdown error:', e.message))
    .finally(() => {
      shutdownDone = true;
      app.quit();
    });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    destroyWaNativeWindow();
    app.quit();
  }
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
let waNativeWin = null;
let waNativeReady = false;

async function teardownWaClient() {
  try {
    if (waClient) {
      if (waClient.pupBrowser) {
        await waClient.pupBrowser.close().catch(() => { });
      }
      await waClient.destroy().catch(() => { });
    }
  } catch (_) { }
  // إضافة انتظار بسيط للسماح لنظام التشغيل بتحرير ملفات القفل (Lockfiles)
  await new Promise(r => setTimeout(r, 1000));
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
    try { if (fs.existsSync(c)) return c; } catch (_) { }
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
    let _hbStuckCount = 0;
    let _lastState = null;
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

        // كشف الجلسات العالقة: نفس الحالة تتكرر بدون تغيير
        if (st === _lastState) {
          _hbStuckCount++;
          if (_hbStuckCount >= 6) { // بعد 90 ثانية (6 * 15) من نفس الحالة
            console.warn('[WA] Session appears stuck on state:', st, '- Force refreshing...');

            // محاولة إعادة تنشيط الجلسة أولاً
            try {
              // إرسال حدث فارغ لإجبار واتساب على التحديث
              await waClient.pupPage.evaluate(() => {
                window.dispatchEvent(new Event('resize'));
              }).catch(() => { });

              console.log('[WA] Force refresh triggered, waiting for recovery...');
              _hbStuckCount = 0;
            } catch (e) {
              // إذا فشل التنشيط، إعادة تشغيل كاملة
              console.warn('[WA] Force refresh failed, restarting session...');
              clearInterval(_hbTimer);
              await teardownWaClient();
              scheduleWhatsAppRestart('stuck_session', 2000);
            }
          }
        } else {
          _hbStuckCount = 0;
          _lastState = st;
        }

        // تحديث waReady إذا كانت الحالة CONNECTED
        if (st === 'CONNECTED' && !waReady) {
          console.log('[WA] Heartbeat detected CONNECTED state, updating ready flag');
          waReady = true;
          BrowserWindow.getAllWindows().forEach(win => win.webContents.send('wa-ready'));
        }
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

  } catch (e) {
    console.error('[WA] Fatal error:', e);
    waClient = null;
    waInitializing = false;
    waInitFailures += 1;
  }
}

// Renderer asks: what is the current status?
ipcMain.on('wa-check-status', (event) => {
  if (waNativeReady || (waReady && waClient)) {
    // Already connected - show immediately
    event.sender.send('wa-ready');
  } else if (waCachedQR) {
    // QR already generated and cached - send it immediately!
    event.sender.send('wa-qr', waCachedQR);
  } else if (waClient || waInitializing || waNativeWin) {
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

// New: Explicit wait for WA ready state (useful before sending)
ipcMain.handle('wa-wait-ready', async (event, timeout = 30000) => {
  if (waReady && waClient) {
    return { ready: true, state: 'CONNECTED' };
  }

  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (waReady && waClient) {
      return { ready: true, state: 'CONNECTED' };
    }

    // تحقق من الحالة الفعلية
    if (waClient) {
      try {
        const state = await waClient.getState().catch(() => null);
        if (state === 'CONNECTED') {
          waReady = true;
          return { ready: true, state: 'CONNECTED' };
        }
      } catch (e) {
        // تجاهل
      }
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return { ready: false, state: waClient ? 'LOADING' : 'NOT_INITIALIZED' };
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

  if (waNativeWin) {
    try {
      await waNativeWin.webContents.session.clearStorageData();
      waNativeWin.destroy();
    } catch (e) { }
    waNativeWin = null;
    waNativeReady = false;
  }

  try { if (waClient) await waClient.logout().catch(() => { }); } catch (e) { }
  await teardownWaClient();
  // Delete session folder so next start requires fresh QR
  try {
    const sessionDir = path.join(app.getPath('userData'), 'wa_sessions');
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      console.log('[WA] Session folder cleared.');
    }
  } catch (e) { console.error('[WA] Could not clear session folder:', e.message); }
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

  if (waNativeWin) {
    waNativeWin.reload();
    setTimeout(() => {
      waNativeReady = true;
      BrowserWindow.getAllWindows().forEach(win => {
        if (win !== waNativeWin && !win.isDestroyed()) win.webContents.send('wa-ready');
      });
    }, 4500);
    return;
  }

  await teardownWaClient();
  // التأخير كان 1.5 ثانية فقط، وهو غير كافٍ لنظام ويندوز لفك القفل عن مجلد userDataDir
  // تمت زيادة الوقت إلى 4.5 ثوانٍ لضمان الإغلاق الكامل
  setTimeout(() => {
    waManualStop = false;
    startWhatsApp();
  }, 4500);
});

/** إرسال فعلي عبر جلسة واتساب على هذا الجهاز */
async function deliverWhatsAppMessage(data) {
  // تحقق ديناميكي من جاهزية واتساب قبل الإرسال
  if (!waClient) return { ok: false, error: 'no_client', code: 'NO_CLIENT' };

  // انتظار ذكي حتى يصبح واتساب جاهزاً (بدلاً من المهلة الزمنية الثابتة)
  if (!waReady) {
    console.log('[WA] Not ready yet, waiting for ready state...');
    const maxWait = 60000; // حد أقصى 60 ثانية
    const checkInterval = 500; // تحقق كل نصف ثانية
    let waited = 0;

    while (!waReady && waited < maxWait) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;

      // تحقق إضافي من حالة الجلسة
      try {
        const state = await waClient.getState().catch(() => null);
        if (state === 'CONNECTED' && !waReady) {
          console.log('[WA] State is CONNECTED, marking as ready');
          waReady = true;
          break;
        }
      } catch (e) {
        // تجاهل الأخطاء أثناء الانتظار
      }
    }

    if (!waReady) {
      console.warn('[WA] Timeout waiting for ready state after', maxWait, 'ms');
      return { ok: false, error: 'not_ready_timeout', code: 'NOT_READY_TIMEOUT' };
    }
    console.log('[WA] Ready state achieved after', waited, 'ms');
  }
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

ipcMain.on('wa-show-window', (event, phoneUrl) => {
  if (waNativeWin) {
    if (phoneUrl) waNativeWin.loadURL(phoneUrl);
    waNativeWin.setOpacity(1);
    waNativeWin.show();
    waNativeWin.focus();
  } else {
    startNativeWaWindow(phoneUrl);
    if (waNativeWin) {
      waNativeWin.setOpacity(1);
      waNativeWin.show();
      waNativeWin.focus();
    }
  }
});

function startNativeWaWindow(initialUrl) {
  if (waNativeWin) {
    waNativeWin.show();
    if (initialUrl && initialUrl.startsWith('https://')) waNativeWin.loadURL(initialUrl, { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' });
    return;
  }

  waNativeReady = false;

  waNativeWin = new BrowserWindow({
    width: 1024,
    height: 768,
    show: false,
    opacity: 0,
    title: 'واتساب - نافذة الإرسال',
    webPreferences: {
      partition: 'persist:whatsapp',
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });

  waNativeWin.setSkipTaskbar(true);
  waNativeWin.setMenu(null);
  // رفع حد المستمعين لتجنب تحذير MaxListenersExceededWarning
  waNativeWin.webContents.setMaxListeners(30);

  waNativeWin.loadURL(initialUrl || 'https://web.whatsapp.com', {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  });

  waNativeWin.on('close', (e) => {
    e.preventDefault();
    waNativeWin.setOpacity(0);
    waNativeWin.hide();
  });

  // ── التجاوز الإجباري لأي نافذة تأكيد "هل تريد المغادرة؟" لمنع ERR_ABORTED (-3) ──
  waNativeWin.webContents.on('will-prevent-unload', (event) => {
    event.preventDefault();
  });

  waNativeWin.webContents.on('did-finish-load', () => {
    waNativeReady = true;
    BrowserWindow.getAllWindows().forEach(w => {
      if (w !== waNativeWin) w.webContents.send('wa-ready');
    });
  });
}
// ───────────────────────────────────────────────────────────────────────────

let waMessageQueue = [];
let isWaProcessing = false;
let waLastSentCache = new Map(); // { key: phone-text, value: timestamp }

async function processWaQueue() {
  if (isWaProcessing || waMessageQueue.length === 0) return;
  isWaProcessing = true;

  try {
    while (waMessageQueue.length > 0) {
      const { event, data } = waMessageQueue.shift();
      
      // التنظيف الدوري للكاش (إزالة ما هو أقدم من 30 ثانية)
      const now = Date.now();
      for (const [k, ts] of waLastSentCache.entries()) {
        if (now - ts > 30000) waLastSentCache.delete(k);
      }

      await handleWaSendMessage(event, data);

      // ─── زيادة وقت الانتظار بين الرسائل لمنع Race Condition ───
      const waitTime = data && data.image ? 6000 : 4000;
      console.log(`[WA][QUEUE] Waiting ${waitTime}ms before next message...`);
      await new Promise(r => setTimeout(r, waitTime));
    }
  } finally {
    isWaProcessing = false;
  }
}

ipcMain.on('wa-send-message', (event, data) => {
  if (!data || !data.number) return;

  // ── منع التكرار في قائمة الانتظار ──
  const dedupeKey = `${data.number}-${(data.text || '').trim()}`;
  const now = Date.now();
  
  if (waLastSentCache.has(dedupeKey)) {
    const lastTime = waLastSentCache.get(dedupeKey);
    if (now - lastTime < 15000) { // منع التكرار خلال 15 ثانية
      console.warn(`[WA][QUEUE] Duplicate message detected for ${data.number}, ignoring.`);
      return;
    }
  }

  // التحقق من وجود نفس الرسالة حالياً في الطابور
  const existsInQueue = waMessageQueue.find(item => {
    return item.data.number === data.number && (item.data.text || '').trim() === (data.text || '').trim();
  });
  if (existsInQueue) {
    console.warn(`[WA][QUEUE] Message already in queue for ${data.number}, ignoring.`);
    return;
  }

  waLastSentCache.set(dedupeKey, now);
  waMessageQueue.push({ event, data });
  processWaQueue();
});

function normalizePhoneNumber(input) {
  const toEn = (v) => String(v || '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

  let phone = toEn(input).replace(/[^0-9]/g, '');
  if (phone.startsWith('00966')) phone = phone.substring(2);
  if (phone.startsWith('9660')) phone = '966' + phone.substring(4);
  if (phone.startsWith('05')) phone = '966' + phone.substring(1);
  if (phone.startsWith('5') && phone.length === 9) phone = '966' + phone;
  return phone;
}

function isValidImageData(dataImage) {
  return (
    typeof dataImage === 'string' &&
    dataImage.startsWith('data:image/') &&
    dataImage.includes('base64,') &&
    dataImage.length > 200
  );
}

async function waitForChatLoaded(win) {
  return await win.webContents.executeJavaScript(`
    new Promise(r => {
      let n = 0;
      const MAX_WAIT = 1200; // 10 minutes (1200 × 500ms)
      const t = setInterval(() => {
        n++;
        // نتحقق من وجود قائمة الدردشات (#pane-side) أو حقل الإدخال
        const chatList = document.querySelector('#pane-side, #main footer, footer div[contenteditable="true"]');
        if (chatList) {
          clearInterval(t);
          r(true);
        } else if (n > MAX_WAIT) {
          clearInterval(t);
          r(false);
        } else if (n % 60 === 0) {
          // سجّل كل 30 ثانية
          console.log('[WA] Still waiting for chat list... ' + (n/2) + 's elapsed');
        }
      }, 500);
    })
  `);
}


async function waitForTextToStabilize(win) {
  return await win.webContents.executeJavaScript(`
    new Promise(r => {
      let n = 0;
      const maxAttempts = 60;
      const t = setInterval(() => {
        n++;
        const b = document.querySelector('footer div[contenteditable="true"]') ||
                  document.querySelector('div[contenteditable="true"]');
        if (b && b.innerText && b.innerText.trim().length > 0) {
          const initialText = b.innerText.trim();
          setTimeout(() => {
            const currentText = b.innerText ? b.innerText.trim() : '';
            if (currentText === initialText && currentText.length > 0) {
              clearInterval(t);
              r(true);
            }
          }, 300);
        } else if (n >= maxAttempts) {
          clearInterval(t);
          r(false);
        }
      }, 250);
    })
  `);
}

async function waitForActualImagePreview(win) {
  return await win.webContents.executeJavaScript(`
    new Promise(resolve => {
      let attempts = 0;
      const maxAttempts = 40; // 10 seconds

      const interval = setInterval(() => {
        attempts++;

        const images = Array.from(document.querySelectorAll('img[src^="blob:"]'));

        const validImage = images.find(img => {
          const rect = img.getBoundingClientRect();

          // تجاهل الصور الصغيرة أو القديمة
          return (
            rect.width > 150 &&
            rect.height > 150 &&
            img.draggable === true &&
            !img.closest('[data-testid^="msg-"]') // ليست رسالة قديمة
          );
        });

        if (validImage) {
          clearInterval(interval);
          resolve('IMAGE_PREVIEW_FOUND');
        }

        if (attempts >= maxAttempts) {
          clearInterval(interval);
          resolve('NO_IMAGE_PREVIEW');
        }
      }, 250);
    })
  `);
}

async function clickSendButtonForImage(win) {
  return await win.webContents.executeJavaScript(`
    new Promise(resolve => {
      let attempts = 0;
      const maxAttempts = 48; // 12 seconds

      const isVisible = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const s = window.getComputedStyle(el);
        return (
          r.width > 40 &&
          r.height > 40 &&
          s.display !== 'none' &&
          s.visibility !== 'hidden' &&
          s.opacity !== '0'
        );
      };

      const hasRealPreview = () => {
        // ✅ التحقق الصحيح: البحث عن blob image و ::after على نفس الحاوية
        
        // البحث عن حاويات المعاينة المحتملة
        var previewContainers = Array.from(
          document.querySelectorAll(
            'footer, footer[role="contentinfo"], ' +
            'div[role="dialog"], div[aria-modal="true"], ' +
            '[data-lexical-editor], [data-testid="compose-panel"], ' +
            '[data-testid="media-editor"]'
          )
        );

        for (var container of previewContainers) {
          // 1️⃣ التحقق من وجود صورة blob داخل الحاوية
          var hasBlobImage = !!container.querySelector('img[src^="blob:"]');
          
          // 2️⃣ التحقق من وجود ::after ظاهر على الحاوية نفسها
          var afterStyle = window.getComputedStyle(container, '::after');
          var hasAfterPseudo = (
            afterStyle &&
            afterStyle.content &&
            afterStyle.content !== 'none' &&
            afterStyle.content !== 'normal' &&
            afterStyle.display !== 'none' &&
            afterStyle.visibility !== 'hidden' &&
            afterStyle.opacity !== '0'
          );
          
          // 3️⃣ التحقق من وجود صور data URI
          var hasDataImage = !!container.querySelector('img[src^="data:"]');
          
          // 4️⃣ التحقق من canvas
          var hasCanvas = Array.from(container.querySelectorAll('canvas')).some(isVisible);
          
          // ✅ إذا وجد أي من هذه العلامات → المعاينة موجودة
          if (hasBlobImage || hasAfterPseudo || hasDataImage || hasCanvas) {
            return true;
          }
        }

        // ── fallback: البحث عن صور مرئية كبيرة في منطقة المحرر ──
        var composer = document.querySelector('div[contenteditable="true"]')?.closest('[data-lexical-editor]');
        if (composer) {
          var allImages = Array.from(composer.querySelectorAll('img'));
          for (var img of allImages) {
            var rect = img.getBoundingClientRect();
            // إذا وجدت صورة كبيرة (>80x80) في المحرر → هي المعاينة
            if (rect.width > 80 && rect.height > 80) {
              return true;
            }
          }
        }

        return false;
      };

      var t = setInterval(() => {
        attempts++;
        if (hasRealPreview()) {
          clearInterval(t);
          resolve('IMAGE_PREVIEW_FOUND');
        } else if (attempts >= maxAttempts) {
          clearInterval(t);
          resolve('NO_IMAGE_PREVIEW');
        }
      }, 250);
    })
  `);
}

async function clickSendButtonForImage(win) {
  return await win.webContents.executeJavaScript(`
    (function(){
      // ✅ البحث عن زر الإرسال بالـ selectors الحديثة
      var sendBtn =
        // الطريقة 1: الوسم الجديد wds-ic-send-filled
        document.querySelector('[data-icon="wds-ic-send-filled"]')?.closest('div[role="button"]') ||
        document.querySelector('[data-testid="wds-ic-send-filled"]')?.closest('div[role="button"]') ||
        // الطريقة 2: الأيقونة القديمة
        document.querySelector('span[data-icon="send"]')?.closest('button') ||
        document.querySelector('span[data-icon="send"]')?.closest('div[role="button"]') ||
        // الطريقة 3: data-testid
        document.querySelector('[data-testid="send"]') ||
        // الطريقة 4: aria-label
        document.querySelector('[aria-label="إرسال"]') ||
        document.querySelector('[aria-label="Send"]');
      
      if (sendBtn) {
        var rect = sendBtn.getBoundingClientRect();
        console.log('[WA][WEB] Send button found at:', rect.left, rect.top);
        
        // الضغط على الزر
        sendBtn.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, cancelable: true, view: window}));
        sendBtn.dispatchEvent(new MouseEvent('mouseup', {bubbles: true, cancelable: true, view: window}));
        sendBtn.click();
        return "CLICKED_SEND_BUTTON";
      }
      
      return "SEND_BUTTON_NOT_FOUND";
    })();
  `);
}

async function clickSendButtonForText(win) {
  return await win.webContents.executeJavaScript(`
    (function(){
      // البحث عن زر الإرسال بالـ selectors الحديثة
      var icon = 
        document.querySelector('[data-icon="wds-ic-send-filled"]') ||
        document.querySelector('[data-testid="wds-ic-send-filled"]') ||
        document.querySelector('span[data-icon="send"]');
      
      if (icon) {
        var btn = icon.closest('button') || icon.closest('div[role="button"]') || icon.parentElement;
        if (btn) {
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
}

async function waitForUploadToFinish(win) {
  return await win.webContents.executeJavaScript(`
    new Promise(resolve => {
      let n = 0;
      const check = setInterval(() => {
        n++;
        const clock = document.querySelector('span[data-icon="msg-time"]');
        const preview = document.querySelector('div[data-testid="image-preview"]');
        if (!clock && !preview) {
          clearInterval(check);
          resolve(true);
        } else if (n > 60) {
          clearInterval(check);
          resolve(false);
        }
      }, 500);
    });
  `);
}

async function handleWaSendMessage(event, data) {
  if (!data || typeof data !== 'object') return;

  const targetRaw = String(data.number || '');
  const hasImage = isValidImageData(data.image);
  let sendResult = { success: false, number: targetRaw, image: hasImage };

  // ── تحقق ديناميكي من جاهزية واتساب (Bot mode) ──
  if (data.wa_mode === 'bot' && waClient && !waReady) {
    console.log('[WA][NATIVE] Not ready, waiting for connection...');
    const maxWait = 60000;
    const checkInterval = 500;
    let waited = 0;

    while (!waReady && waited < maxWait) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;

      // تحقق من الحالة الفعلية
      try {
        const state = await waClient.getState().catch(() => null);
        if (state === 'CONNECTED' && !waReady) {
          console.log('[WA][NATIVE] State CONNECTED detected during wait');
          waReady = true;
          break;
        }
      } catch (e) {
        // تجاهل
      }

      // تحقق من وجود النافذة
      if (waNativeWin && waNativeWin.webContents && !waNativeWin.webContents.isLoading()) {
        console.log('[WA][NATIVE] Native window ready');
        break;
      }
    }

    if (!waReady && !waNativeWin) {
      console.warn('[WA][NATIVE] Timeout waiting for ready state');
      sendResult.error = 'WhatsApp not ready after 60s';
      if (event && event.sender) {
        event.sender.send('wa-send-result', sendResult);
      }
      return;
    }
  }

  // ── وضع المتصفح (Browser Mode) ─────────────────────────────────────────
  if (data.wa_mode === 'browser') {
    try {
      const { clipboard, nativeImage } = require('electron');
      let phone = normalizePhoneNumber(data.number || '');
      const url = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(data.text || '')}`;
      const vbsPath = path.join(os.tmpdir(), `wa_br_${Date.now()}.vbs`);

      let vbs = `Set S=WScript.CreateObject("WScript.Shell")\nS.Run "chrome.exe """&"${url}"&""""\nWScript.Sleep 8000\n`;
      if (hasImage) {
        clipboard.writeImage(nativeImage.createFromDataURL(data.image));
        vbs += `S.SendKeys "^v"\nWScript.Sleep 2000\nS.SendKeys "~"\nWScript.Sleep 1500\nS.SendKeys "^{w}"`;
      } else {
        vbs += `S.SendKeys "~"\nWScript.Sleep 1500\nS.SendKeys "^{w}"`;
      }

      fs.writeFileSync(vbsPath, vbs, 'utf8');
      require('child_process').exec(`cscript //nologo "${vbsPath}"`, () => {
        try { fs.unlinkSync(vbsPath); } catch (e) { }
      });

      console.log(`[WA][BROWSER] macro sent for ${phone}`);
      sendResult.success = true;
    } catch (e) {
      console.error('[WA][BROWSER]', e?.message);
      sendResult.success = false;
      sendResult.error = e?.message || 'Unknown error';
    }

    if (event && event.sender) {
      event.sender.send('wa-send-result', sendResult);
    }
    return;
  }

  // ── وضع التطبيق المثبت (Desktop Mode) ──────────────────────────────────
  if (data.wa_mode === 'desktop') {
    try {
      const { shell, clipboard, nativeImage } = require('electron');
      let phone = normalizePhoneNumber(data.number || '');

      await shell.openExternal(`whatsapp://send?phone=${phone}&text=${encodeURIComponent(data.text || '')}`);

      if (hasImage) {
        clipboard.writeImage(nativeImage.createFromDataURL(data.image));
        const vbsPath = path.join(os.tmpdir(), `wa_dt_${Date.now()}.vbs`);
        fs.writeFileSync(
          vbsPath,
          `WScript.Sleep 8000\nSet S=WScript.CreateObject("WScript.Shell")\nS.AppActivate "WhatsApp"\nWScript.Sleep 1000\nS.SendKeys "+{INS}"\nWScript.Sleep 2000\nS.SendKeys "~"\nWScript.Sleep 500\nS.SendKeys "~"`,
          'utf8'
        );
        require('child_process').exec(`cscript //nologo "${vbsPath}"`, () => {
          try { fs.unlinkSync(vbsPath); } catch (e) { }
        });
      } else {
        const vbsPath = path.join(os.tmpdir(), `wa_dt_${Date.now()}.vbs`);
        fs.writeFileSync(
          vbsPath,
          `WScript.Sleep 5500\nSet S=WScript.CreateObject("WScript.Shell")\nS.AppActivate "WhatsApp"\nWScript.Sleep 500\nS.SendKeys "~"`,
          'utf8'
        );
        require('child_process').exec(`cscript //nologo "${vbsPath}"`, () => {
          try { fs.unlinkSync(vbsPath); } catch (e) { }
        });
      }

      console.log(`[WA][DESKTOP] sent for ${phone}`);
      sendResult.success = true;
    } catch (e) {
      console.error('[WA][DESKTOP]', e?.message);
      sendResult.success = false;
      sendResult.error = e?.message || 'Unknown error';
    }

    if (event && event.sender) {
      event.sender.send('wa-send-result', sendResult);
    }
    return;
  }

  // ── وضع النافذة المخفية (Hidden Native Window Mode) ────────────────────
  if (data.wa_mode === 'bot') {
    if (!waNativeWin) {
      console.log('[WA][NATIVE] Auto-starting native window...');
      startNativeWaWindow();

      // ✅ إظهار النافذة فوراً بشفافية صفر — Chromium يُجمّد JS في النوافذ المخفية
      if (waNativeWin && !waNativeWin.isVisible()) {
        waNativeWin.setOpacity(0);
        waNativeWin.show();
        console.log('[WA][NATIVE] Window shown (opacity=0) so Chromium runs WA Web JS normally');
      }

      // ── انتظار ديناميكي: ينتظر بصبر لأي وقت حتى تُحمَّل الدردشات ──────────────────
      // يُعيد التحميل كل دقيقتين فقط إذا تعلقت الصفحة فعلاً.
      // لا يُوقف الانتظار أبداً — يُكمل فقط عند ظهور #pane-side.
      await new Promise((resolve) => {
        let stuckSeconds = 0;     // ثوانٍ بلا تقدم حقيقي
        let reloadCount = 0;
        const MAX_RELOADS = 5;        // حد أقصى 5 إعادات تحميل
        const STUCK_THRESHOLD = 120;  // دقيقتان من التعليق الفعلي قبل إعادة التحميل
        let totalWaitSeconds = 0;

        const checkInterval = setInterval(async () => {
          if (!waNativeWin || !waNativeWin.webContents) {
            clearInterval(checkInterval);
            resolve();
            return;
          }

          totalWaitSeconds++;
          // سجّل كل 30 ثانية
          if (totalWaitSeconds % 30 === 0) {
            console.log(`[WA][NATIVE] Still waiting... ${totalWaitSeconds}s total (reloads: ${reloadCount}/${MAX_RELOADS})`);
          }

          try {
            // أولاً: هل #pane-side ظهر؟
            const ready = await waNativeWin.webContents.executeJavaScript(
              `!!document.querySelector('#pane-side, div[data-testid="chat-list"], div[data-tab="3"]')`
            );

            if (ready) {
              clearInterval(checkInterval);
              console.log(`[WA][NATIVE] ✅ WA Web ready after ${totalWaitSeconds}s (reloads: ${reloadCount})`);
              setTimeout(resolve, 1500);
              return;
            }

            // ثانياً: هل الصفحة لا تزال تُحمَّل؟
            const stillLoading = waNativeWin.webContents.isLoading();

            if (stillLoading) {
              // الصفحة تُحمَّل — تقدم حقيقي — نُعيد عداد التعليق
              if (stuckSeconds > 0) stuckSeconds = 0;
            } else {
              // الصفحة انتهى تحميلها لكن #pane-side غائب → تعليق محتمل
              stuckSeconds++;
              if (stuckSeconds % 30 === 0) {
                console.log(`[WA][NATIVE] Page loaded but no chat list yet: ${stuckSeconds}s stuck`);
              }
              // إعادة تحميل فقط بعد دقيقتين من التعليق الكامل
              if (stuckSeconds >= STUCK_THRESHOLD && reloadCount < MAX_RELOADS) {
                reloadCount++;
                stuckSeconds = 0;
                console.warn(`[WA][NATIVE] Reloading after ${STUCK_THRESHOLD}s stuck (attempt ${reloadCount}/${MAX_RELOADS})`);
                try {
                  await waNativeWin.loadURL('https://web.whatsapp.com', {
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                  });
                } catch (e) {
                  console.warn('[WA][NATIVE] Reload error (ignored):', e?.message);
                }
              }
              // بعد 5 إعادات وما زلنا عالقين → نكمل على أي حال
              if (stuckSeconds >= STUCK_THRESHOLD && reloadCount >= MAX_RELOADS) {
                clearInterval(checkInterval);
                console.warn(`[WA][NATIVE] Max reloads (${MAX_RELOADS}) reached after ${totalWaitSeconds}s — proceeding anyway`);
                resolve();
              }
            }
          } catch (e) {
            // executeJavaScript فشل (النافذة تُحمَّل) — نتابع
          }
        }, 1000);
      });


    } // end if (!waNativeWin)


    if (!waNativeWin) {
      console.error('[WA][NATIVE] Failed to initialize window');
      sendResult.error = 'Failed to initialize WhatsApp window';
      if (event && event.sender) event.sender.send('wa-send-result', sendResult);
      return;
    }

    try {
      const { clipboard, nativeImage } = require('electron');
      let phone = normalizePhoneNumber(data.number || '');

      // ✅ إذا كانت هناك صورة، لا نضع النص في URL (سنكتبه كـ caption لاحقاً)
      const url = hasImage
        ? `https://web.whatsapp.com/send?phone=${phone}`
        : `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(data.text || '')}`;

      console.log('[WA][NATIVE] Loading URL (hasImage:', hasImage, ')');

      const wasHidden = !waNativeWin.isVisible();
      if (wasHidden) {
        // ✅ setAlwaysOnTop مؤقتاً يضمن حصول النافذة على focus حقيقي من نظام التشغيل
        waNativeWin.setAlwaysOnTop(true);
        waNativeWin.show();
        waNativeWin.focus();

        // انتظر حتى isFocused()=true فعلاً (حد أقصى 4 ثوانٍ)
        let focusWaited = 0;
        while (!waNativeWin.isFocused() && focusWaited < 4000) {
          await new Promise(r => setTimeout(r, 100));
          focusWaited += 100;
          if (!waNativeWin.isFocused()) waNativeWin.focus(); // إعادة محاولة
        }
        waNativeWin.setAlwaysOnTop(false); // إلغاء always-on-top بعد الحصول على focus
        console.log(`[WA][NATIVE] Window focused after ${focusWaited}ms`);
        await new Promise(r => setTimeout(r, 400)); // استقرار إضافي
      } else {
        // مرئية بالفعل — نحتاج فقط للتأكد من الـ focus
        waNativeWin.setAlwaysOnTop(true);
        waNativeWin.focus();
        let focusWaited = 0;
        while (!waNativeWin.isFocused() && focusWaited < 2000) {
          await new Promise(r => setTimeout(r, 100));
          focusWaited += 100;
          if (!waNativeWin.isFocused()) waNativeWin.focus();
        }
        waNativeWin.setAlwaysOnTop(false);
        await new Promise(r => setTimeout(r, 200));
      }


      // لا تسحب التركيز من واتساب الآن - سنحتاجه للـ paste
      // const mainWins = BrowserWindow.getAllWindows().filter(w => w !== waNativeWin);
      // if (mainWins.length > 0) mainWins[0].focus();

      let loadSuccess = false;
      let loadAttempts = 0;

      while (!loadSuccess && loadAttempts < 3) {
        loadAttempts++;
        try {
          await waNativeWin.webContents.executeJavaScript(`
            try {
              window.onbeforeunload = null;
              if (window.__beforeUnloadOverrides) window.__beforeUnloadOverrides = null;
            } catch (e) {}
          `).catch(() => { });

          await waNativeWin.loadURL(url, {
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          });

          loadSuccess = true;
        } catch (e) {
          if (String(e).includes('ERR_ABORTED')) {
            console.warn(`[WA][NATIVE] loadURL ERR_ABORTED (attempt ${loadAttempts}/3), retrying in 1.5s...`);
            await new Promise(r => setTimeout(r, 1500));
          } else {
            throw e;
          }
        }
      }

      if (!loadSuccess) {
        throw new Error(`Failed to load WhatsApp URL after 3 attempts for ${phone}. Aborting to prevent sending to wrong chat.`);
      }

      let chatLoaded = await waitForChatLoaded(waNativeWin);
      if (!chatLoaded) {
        // إعادة محاولة: أعد تحميل URL المحادثة وانتظر مرة أخرى
        console.warn('[WA][NATIVE] Chat not ready on first attempt, retrying URL load...');
        try {
          await waNativeWin.loadURL(url, {
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          });
        } catch (e) { /* تجاهل ERR_ABORTED */ }
        chatLoaded = await waitForChatLoaded(waNativeWin);
      }

      if (!chatLoaded) {
        console.error('[WA][NATIVE] Chat not loaded after retry');
        try {
          const img = await waNativeWin.webContents.capturePage();
          require('fs').writeFileSync('e:\\baraaq\\wa_error.png', img.toPNG());
          console.log('[WA][NATIVE] Screenshot saved to', 'e:\\baraaq\\wa_error.png');
        } catch (e) { }
        if (wasHidden) waNativeWin.hide();

        sendResult.error = 'Chat not loaded';
        if (event && event.sender) event.sender.send('wa-send-result', sendResult);
        return;
      }

      if (hasImage) {
        console.log('[WA][NATIVE] Image mode: Will paste image + write caption');
        // ✅ لا نحتاج لانتظار استقرار النص لأننا لم نضعه في URL
        // التركيز مباشرة على حقل الإدخال قبل اللصق (ضروري لـ paste)

        // التركيز على حقل الإدخال قبل اللصق (ضروري لـ paste)
        await waNativeWin.webContents.executeJavaScript(`
          (function(){
            var b = document.querySelector('footer div[contenteditable="true"]') ||
                    document.querySelector('div[contenteditable="true"]');
            if (b) { b.click(); b.focus(); }
          })();
        `);
        await new Promise(r => setTimeout(r, 800));

        // ✅ التأكد من أن النافذة مرئية ومركزة فعلياً قبل اللصق
        if (!waNativeWin.isVisible()) {
          console.log('[WA][NATIVE] Window not visible, calling show()...');
          waNativeWin.show();
          await new Promise(r => setTimeout(r, 300));
        }

        if (!waNativeWin.isFocused()) {
          console.log('[WA][NATIVE] Window not focused, calling focus()...');
          waNativeWin.focus();
          await new Promise(r => setTimeout(r, 500));
        }

        // تأكيد نهائي
        console.log('[WA][NATIVE] Window state - Visible:', waNativeWin.isVisible(), 'Focused:', waNativeWin.isFocused());

        let imagePreviewCheck = 'NO_IMAGE_PREVIEW';

        // محاولة اللصق حتى 3 مرات مع إعادة التركيز
        for (let attempt = 1; attempt <= 3; attempt++) {
          console.log(`[WA][NATIVE] Writing image to clipboard and pasting... attempt ${attempt}/3`);

          // كتابة الصورة في الحافظة
          clipboard.writeImage(nativeImage.createFromDataURL(data.image));
          await new Promise(r => setTimeout(r, 300));

          // ✅ لصق الصورة باستخدام Ctrl+V (أكثر موثوقية)
          waNativeWin.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'V', modifiers: ['control'] });
          waNativeWin.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'V', modifiers: ['control'] });
          await new Promise(r => setTimeout(r, 2000));

          // ─── DEBUG: التحقق من الحالة بعد اللصق مباشرة ───
          const debugInfo = await waNativeWin.webContents.executeJavaScript(`
            (function() {
              var active = document.activeElement;
              var activeTag = active ? active.tagName : 'none';
              var activeClass = active ? (active.className || '').toString().slice(0, 50) : '';
              
              // البحث عن blob imgs داخل footer فقط
              var footer = document.querySelector('footer');
              var footerBlobs = footer ? Array.from(footer.querySelectorAll('img[src^="blob:"]')).length : 0;
              
              // البحث عن blob imgs داخل dialogs
              var dialogs = document.querySelectorAll('div[role="dialog"], div[aria-modal="true"]');
              var dialogBlobs = 0;
              dialogs.forEach(function(d) {
                dialogBlobs += d.querySelectorAll('img[src^="blob:"]').length;
              });
              
              // إجمالي blob imgs في الصفحة
              var allBlobs = document.querySelectorAll('img[src^="blob:"]').length;
              
              // ── معلومات جديدة للهيكل الحديث ───
              // البحث عن صور في منطقة المحرر
              var composer = document.querySelector('div[contenteditable="true"]')?.closest('div[data-lexical-editor="true"]')?.parentElement?.parentElement;
              var composerImages = composer ? Array.from(composer.querySelectorAll('img')).length : 0;
              
              // إجمالي الصور المرئية (>40x40)
              var allImages = Array.from(document.querySelectorAll('img'));
              var visibleImages = allImages.filter(function(img) {
                var r = img.getBoundingClientRect();
                return r.width > 40 && r.height > 40;
              }).length;
              
              // التحقق من زر الإرسال
              var sendBtn = document.querySelector('[data-icon="wds-ic-send-filled"]') ||
                            document.querySelector('[data-testid="wds-ic-send-filled"]') ||
                            document.querySelector('span[data-icon="send"]') ||
                            document.querySelector('[data-testid="send"]');
              var sendBtnVisible = sendBtn ? sendBtn.getBoundingClientRect().width > 0 : false;
              
              // ── التحقق من ::after على حاويات المعاينة ──
              var previewContainers = document.querySelectorAll(
                'footer, footer[role="contentinfo"], ' +
                'div[role="dialog"], div[aria-modal="true"], ' +
                '[data-lexical-editor]'
              );
              var afterInfo = [];
              Array.from(previewContainers).forEach(function(container, idx) {
                var afterStyle = window.getComputedStyle(container, '::after');
                if (afterStyle && afterStyle.content && 
                    afterStyle.content !== 'none' && afterStyle.content !== 'normal') {
                  afterInfo.push({
                    container: container.tagName + '.' + (container.className || '').slice(0, 30),
                    hasAfter: true,
                    content: afterStyle.content.slice(0, 20)
                  });
                }
              });
              
              return {
                activeElement: activeTag,
                activeClass: activeClass,
                activeHTML: active ? active.outerHTML.slice(0, 300) : 'none',
                footerBlobCount: footerBlobs,
                dialogBlobCount: dialogBlobs,
                totalBlobCount: allBlobs,
                // معلومات جديدة
                composerImageCount: composerImages,
                visibleLargeImages: visibleImages,
                sendButtonVisible: sendBtnVisible,
                afterPseudoElements: afterInfo,
                // HTML كامل للـ debug
                blobImgsHTML: Array.from(document.querySelectorAll('img[src^="blob:"]')).map(img => img.outerHTML.slice(0, 200)),
                containersHTML: Array.from(document.querySelectorAll('div[role="dialog"], div[aria-modal="true"], footer')).map(el => el.outerHTML.slice(0, 300))
              };
            })()
          `);
          console.log('[WA][NATIVE] DEBUG after paste:', JSON.stringify(debugInfo, null, 2));

          // screenshot للـ debug
          try {
            const debugScreenshot = await waNativeWin.webContents.capturePage();
            const debugPath = `e:\\baraaq\\wa_debug_paste_attempt_${attempt}.png`;
            require('fs').writeFileSync(debugPath, debugScreenshot.toPNG());
            console.log('[WA][NATIVE] DEBUG screenshot saved to', debugPath);
          } catch (e) {
            console.warn('[WA][NATIVE] Failed to capture debug screenshot:', e.message);
          }
          // ─── END DEBUG ───

          // التحقق من ظهور الصورة في المعاينة
          imagePreviewCheck = await waitForActualImagePreview(waNativeWin);
          console.log('[WA][NATIVE] Image preview check:', imagePreviewCheck);

          // ✅ FALLBACK: إذا كان زر الإرسال ظاهر والنص موجود، افترض نجاح اللصق
          if (imagePreviewCheck !== 'IMAGE_PREVIEW_FOUND') {
            const visualCheck = await waNativeWin.webContents.executeJavaScript(`
              (function() {
                // التحقق من وجود زر الإرسال الأخضر
                var sendBtn = document.querySelector('[data-icon="wds-ic-send-filled"]') ||
                              document.querySelector('[data-testid="wds-ic-send-filled"]') ||
                              document.querySelector('span[data-icon="send"]') ||
                              document.querySelector('[data-testid="send"]');
                if (!sendBtn) return false;
                
                var rect = sendBtn.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) return false;
                
                var style = window.getComputedStyle(sendBtn);
                if (style.opacity === '0' || style.visibility === 'hidden') return false;
                
                // التحقق من أن الزر نشط (أخضر)
                var color = style.color || style.fill || '';
                var isActive = color.includes('rgb(37, 211, 102)') || 
                               color.includes('rgb(255, 255, 255)') ||
                               color.includes('#25D366') ||
                               color.includes('25D366');
                
                // التحقق من وجود نص في المحرر
                var editor = document.querySelector('div[contenteditable="true"]');
                var hasText = editor && editor.textContent.trim().length > 0;
                
                return isActive && hasText;
              })()
            `);

            if (visualCheck) {
              console.log('[WA][NATIVE] Visual check PASSED - assuming paste succeeded');
              imagePreviewCheck = 'IMAGE_PREVIEW_FOUND';
            } else {
              console.log('[WA][NATIVE] Visual check FAILED');
            }
          }

          if (imagePreviewCheck === 'IMAGE_PREVIEW_FOUND') break;

          if (attempt < 3) {
            console.warn(`[WA][NATIVE] No preview yet (attempt ${attempt}), refocusing composer and retrying...`);
            // إعادة التركيز على حقل الإدخال
            await waNativeWin.webContents.executeJavaScript(`
              (function(){
                var b = document.querySelector('footer div[contenteditable="true"]') ||
                        document.querySelector('div[contenteditable="true"]');
                if (b) { b.click(); b.focus(); }
              })();
            `);
            await new Promise(r => setTimeout(r, 600));
          }
        }

        // إذا لم تظهر الصورة بعد 3 محاولات، إيقاف الإرسال
        if (imagePreviewCheck !== 'IMAGE_PREVIEW_FOUND') {
          console.error('[WA][NATIVE] No real image preview found after 3 paste attempts. Abort sending.');
          sendResult.success = false;
          sendResult.error = 'Image preview not found after paste - focus or paste failed';

          // إخفاء النافذة إذا كانت مخفية أصلاً
          if (wasHidden) {
            waNativeWin.hide();
          }
          if (event && event.sender) event.sender.send('wa-send-result', sendResult);
          return;
        }

        console.log('[WA][NATIVE] Image preview confirmed, waiting before click...');
        await new Promise(r => setTimeout(r, 600));

        // ✅ التحقق من أننا في وضع الصورة (media mode)
        const isMediaMode = await waNativeWin.webContents.executeJavaScript(`
          !!document.querySelector('[data-testid="media-caption-input-container"]') ||
          !!document.querySelector('img[src^="blob:"][draggable="true"]')
        `);

        if (!isMediaMode) {
          console.error('[WA][NATIVE] Not in media mode - aborting send');
          sendResult.success = false;
          sendResult.error = 'Not in media mode after paste';
          if (wasHidden) waNativeWin.hide();
          if (event && event.sender) event.sender.send('wa-send-result', sendResult);
          return;
        }

        console.log('[WA][NATIVE] Media mode confirmed ✓');

        // ✅ كتابة النص كـ caption للصورة إذا كان هناك نص
        if (data.text && data.text.trim()) {
          console.log('[WA][NATIVE] Writing text as image caption...');
          await new Promise(r => setTimeout(r, 500));

          // البحث عن حقل caption في وضع الوسائط
          const captionWritten = await waNativeWin.webContents.executeJavaScript(`
            (function() {
              return new Promise(function(resolve) {
                var captionInput = document.querySelector('[data-testid="media-caption-input"]') ||
                                  document.querySelector('div[contenteditable="true"][data-lexical-editor="true"]');
                
                if (!captionInput) {
                  console.log('[WA][WEB] No caption input found');
                  resolve(false);
                  return;
                }
                
                captionInput.focus();
                captionInput.click();
                
                setTimeout(function() {
                  // مسح النص الحالي أولاً
                  document.execCommand('selectAll', false, null);
                  setTimeout(function() {
                    document.execCommand('delete', false, null);
                    
                    setTimeout(function() {
                      var fullText = ${JSON.stringify(data.text)};
                      // تقسيم النص على الأسطر
                      var lines = fullText.split('\\n');
                      
                      // كتابة السطر الأول
                      document.execCommand('insertText', false, lines[0]);
                      
                      // لكل سطر بعد الأول: إرسال Enter + كتابة السطر
                      var lineIndex = 1;
                      function writeNextLine() {
                        if (lineIndex >= lines.length) {
                          var inputEvent = new InputEvent('input', { bubbles: true, cancelable: true });
                          captionInput.dispatchEvent(inputEvent);
                          console.log('[WA][WEB] Caption written with', lines.length, 'lines');
                          resolve(true);
                          return;
                        }
                        // إرسال Shift+Enter لسطر جديد في حقل الـ caption
                        var enterEvent = new KeyboardEvent('keydown', {
                          key: 'Enter', code: 'Enter', keyCode: 13,
                          shiftKey: true, bubbles: true, cancelable: true
                        });
                        captionInput.dispatchEvent(enterEvent);
                        
                        setTimeout(function() {
                          document.execCommand('insertText', false, lines[lineIndex]);
                          lineIndex++;
                          setTimeout(writeNextLine, 30);
                        }, 30);
                      }
                      
                      setTimeout(writeNextLine, 50);
                    }, 100);
                  }, 100);
                }, 200);
              });
            })()
          `);


          if (captionWritten) {
            console.log('[WA][NATIVE] Caption written successfully ✓');
            await new Promise(r => setTimeout(r, 500));
          } else {
            console.warn('[WA][NATIVE] Failed to write caption, but continuing with send');
          }
        }

        // ✅ انتظار بسيط ثم النقر مباشرة على زر الإرسال
        console.log('[WA][NATIVE] Waiting before clicking send...');
        await new Promise(r => setTimeout(r, 1000));

        // الضغط على زر الإرسال مرة واحدة فقط
        const clickResult = await clickSendButtonForImage(waNativeWin);
        console.log('[WA][NATIVE] Image Click Result:', clickResult);

        if (clickResult !== 'CLICKED_SEND_BUTTON') {
          sendResult.success = false;
          sendResult.error = `Send button click failed: ${clickResult}`;
          if (wasHidden) waNativeWin.hide();
          if (event && event.sender) event.sender.send('wa-send-result', sendResult);
          return;
        }

        console.log('[WA][NATIVE] Waiting for message to finish uploading (clock icon check)...');
        await waitForUploadToFinish(waNativeWin);
      } else {
        // مسار النص فقط - استخدام زر الإرسال بدلاً من sendInputEvent
        await new Promise(r => setTimeout(r, 800));

        const clickResultText = await clickSendButtonForText(waNativeWin);
        console.log('[WA][NATIVE] Text Click Result:', clickResultText);

        if (clickResultText !== 'CLICKED_SEND_BUTTON') {
          console.warn('[WA][NATIVE] Text send button click failed, falling back to Enter key...');
          // fallback: استخدام Enter إذا فشل النقر
          waNativeWin.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
          waNativeWin.webContents.sendInputEvent({ type: 'char', keyCode: 'Enter' });
          waNativeWin.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      const mWins = BrowserWindow.getAllWindows().filter(w => w !== waNativeWin);
      if (mWins.length > 0) {
        // إعادة التركيز على النافذة الرئيسية بعد انتهاء الإرسال
        mWins[0].focus();
      }

      console.log(`[WA][NATIVE] sent for ${phone}`);

      sendResult.success = true;

      // إخفاء النافذة إذا كانت مخفية أصلاً
      if (wasHidden) {
        waNativeWin.hide();
      }
    } catch (e) {
      console.error('[WA][NATIVE]', e?.message);
      sendResult.success = false;
      sendResult.error = e?.message || 'Unknown error';
    }

    if (event && event.sender) {
      event.sender.send('wa-send-result', sendResult);
    }
    return;
  }

  if (event && event.sender) {
    event.sender.send('wa-send-result', sendResult);
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
  const msgType = payload.image ? 'image+text' : 'text-only';
  const textPreview = String(payload.text || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  console.log(`[WA][SEND] Start -> target="${targetRaw}" type=${msgType} via=${hubIp ? `hub:${hubIp}` : 'local'} preview="${textPreview}"`);

  if (hubIp) {
    const remote = await relayWaHttp(hubIp, payload);
    if (remote && remote.ok) {
      console.log(`[WA][SEND] Success via LAN hub (${hubIp}) -> target="${targetRaw}"`);
      sendResult.success = true;
      if (event && event.sender) {
        event.sender.send('wa-send-result', sendResult);
      }
      return;
    }
    console.warn(`[WA][SEND] Hub relay failed (${hubIp}) -> target="${targetRaw}" reason="${(remote && remote.error) || 'unknown'}", fallback=local`);
  }

  const local = await deliverWhatsAppMessage(payload);
  if (local.ok) {
    console.log(`[WA][SEND] Success local -> target="${targetRaw}" chatId="${local.chatId || ''}" type=${msgType}`);
    sendResult.success = true;
    if (event && event.sender) {
      event.sender.send('wa-send-result', sendResult);
    }
    return;
  }

  console.error(`[WA][SEND] Local failed -> target="${targetRaw}" type=${msgType} code="${local.code || 'UNKNOWN'}" reason="${local.error || 'unknown'}`);
  // Fallback: if media send fails, retry text-only to avoid losing critical notice.
  if (payload.image) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.image;
    console.warn(`[WA][SEND] Trying fallback text-only -> target="${targetRaw}"`);
    const textOnly = await deliverWhatsAppMessage(fallbackPayload);
    if (textOnly.ok) {
      console.warn(`[WA][SEND] Fallback success (text-only) -> target="${targetRaw}" chatId="${textOnly.chatId || ''}"`);
      sendResult.success = true;
      sendResult.fallbackTextOnly = true;
      if (event && event.sender) {
        event.sender.send('wa-send-result', sendResult);
      }
      return;
    }
    console.error(`[WA][SEND] Fallback failed -> target="${targetRaw}" code="${textOnly.code || 'UNKNOWN'}" reason="${textOnly.error || 'unknown'}`);
  }

  sendResult.success = false;
  sendResult.error = local.error || 'Send failed';
  if (event && event.sender) {
    event.sender.send('wa-send-result', sendResult);
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







