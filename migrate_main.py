import sys
import re

with open('e:/baraaq/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace dbAPI initialization
content = content.replace("const dbAPI = require('./database');", "const dbAPI = require('./sql-database');")

# Remove the memory caching logic block and replace with standard SQLite calls
old_handlers = """ipcMain.handle('db-save-order', async (event, data) => {
  if (!_dbCacheReady) await _loadDbIntoCache();
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
function _sortedOrdersFromCache() {
  const list = (_dbCache && _dbCache.orders) ? _dbCache.orders : [];
  return list.slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 500);
}

ipcMain.handle('db-get-orders', async () => {
  if (!_dbCacheReady) await _loadDbIntoCache();
  return _sortedOrdersFromCache();
});

ipcMain.handle('db-get-products', async () => {
  if (!_dbCacheReady) await _loadDbIntoCache();
  return _dbCache.products || [];
});

ipcMain.handle('db-get-categories', async () => {
  if (!_dbCacheReady) await _loadDbIntoCache();
  return _dbCache.categories || [];
});

ipcMain.handle('db-get-inventory', async () => {
  if (!_dbCacheReady) await _loadDbIntoCache();
  return _dbCache.inventory || [];
});

ipcMain.handle('db-save-product', async (event, data) => {
  if (!_dbCacheReady) await _loadDbIntoCache();
  const result = dbAPI.saveProduct(data);
  setImmediate(() => broadcastDBChanged());
  return result;
});

ipcMain.handle('db-save-category', async (event, data) => {
  if (!_dbCacheReady) await _loadDbIntoCache();
  const result = dbAPI.saveCategory(data);
  setImmediate(() => broadcastDBChanged());
  return result;
});
ipcMain.handle('db-save-inventory', async (event, item) => {
  if (!_dbCacheReady) await _loadDbIntoCache();
  const result = dbAPI.saveInventoryItem(item);
  setImmediate(() => broadcastDBChanged());
  return result;
});

// Async full-DB read/write — used by renderer files to avoid blocking readFileSync on UI thread
const _dbPath = path.join(app.getPath('userData'), 'pos_database.json');
const _auditLogPath = path.join(app.getPath('userData'), 'pos_database_audit.log');
const _emptyDB = { orders: [], products: [], categories: [], inventory: [], purchases: [], suppliers: [], inventoryTx: [], returns: [], expenses: [], bankTransfers: [], hrExpenses: [], otherIncome: [], employees: [], attendance: [], penaltyRules: [], chartOfAccounts: [], journalEntries: [], systemNotifications: [], inventoryAlertState: {}, deliveryCompanies: [] };

// ⚡ In-Memory Cache — يُخزَّن في الذاكرة لتجنب قراءة القرص في كل مرة
let _dbCache = null;
let _dbCacheReady = false;
let _dbWriteQueue = Promise.resolve();

function _dayClosureRecordKey(c) {
  const t = Number(c && c.closedAt) || 0;
  if (t > 1e11) return 't:' + t;
  if (c && c.id) return 'id:' + c.id;
  return '';
}

function _dayClosureId(c) {
  if (!c || typeof c !== 'object') return '';
  if (c.id) return String(c.id);
  const t = Number(c.closedAt) || 0;
  return t > 0 ? 'DAY-' + t : '';
}

function _stripShiftsFromClosure(c) {
  if (!c || typeof c !== 'object') return c;
  const out = { ...c };
  delete out.shifts;
  delete out.allDayShifts;
  return out;
}

/** نقل shifts إلى day_closure_details لتصغير حجم pos_database.json */
function _migrateDayClosureStorage(db) {
  if (!db || typeof db !== 'object' || db._dayClosuresCompactV1) return false;
  if (!Array.isArray(db.day_closures)) db.day_closures = [];
  if (!db.day_closure_details || typeof db.day_closure_details !== 'object') {
    db.day_closure_details = {};
  }
  let changed = false;
  for (const raw of db.day_closures) {
    if (!raw || typeof raw !== 'object') continue;
    const shifts = raw.shifts || raw.allDayShifts;
    if (!Array.isArray(shifts) || shifts.length === 0) continue;
    const id = _dayClosureId(raw);
    if (!id) continue;
    if (!db.day_closure_details[id]) {
      db.day_closure_details[id] = { shifts };
      changed = true;
    }
    delete raw.shifts;
    delete raw.allDayShifts;
    changed = true;
  }
  db._dayClosuresCompactV1 = true;
  return changed;
}

function _mergeDayClosures(existing, incoming) {
  const map = new Map();
  for (const list of [existing, incoming]) {
    if (!Array.isArray(list)) continue;
    for (const c of list) {
      if (!c || typeof c !== 'object') continue;
      const key = _dayClosureRecordKey(c);
      if (!key) continue;
      const prev = map.get(key);
      if (!prev || (Number(c.closedAt) || 0) >= (Number(prev.closedAt) || 0)) map.set(key, c);
    }
  }
  return Array.from(map.values());
}

function _writeDbAtomicQueued(data) {
  const payload = global._mcCompactDbWrites
    ? JSON.stringify(data)
    : JSON.stringify(data, null, 2);
  const tmpPath = `${_dbPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  _dbWriteQueue = _dbWriteQueue
    .catch(() => {})
    .then(async () => {
      await fs.promises.writeFile(tmpPath, payload, 'utf8');
      await fs.promises.rename(tmpPath, _dbPath);
    })
    .catch(async (err) => {
      try { await fs.promises.unlink(tmpPath); } catch (_) {}
      console.error('[DB Write] Queued write failed:', err.message);
      writeAuditLog('DB_WRITE_ERROR', { error: err.message, queued: true });
      throw err;
    });
  return _dbWriteQueue;
}

async function _loadDbIntoCache() {
  try {
    const data = await fs.promises.readFile(_dbPath, 'utf8');
    _dbCache = JSON.parse(data);
    if (_migrateDayClosureStorage(_dbCache)) {
      console.log('[DB Cache] ضغط سجلات إقفال اليوم (فصل تفاصيل الورديات)');
      const persistMigration = () => void _writeDbAtomicQueued(_dbCache);
      if (effectiveWeakHost) setTimeout(persistMigration, 12000);
      else setImmediate(persistMigration);
    }
    _dbCacheReady = true;
    console.log('[DB Cache] ✅ Database loaded into memory cache.');
  } catch (e) {
    console.warn('[DB Cache] ⚠️ Could not load DB into cache, using empty:', e.message);
    _dbCache = JSON.parse(JSON.stringify(_emptyDB));
    _dbCacheReady = true;
  }
}

// ⚡ وظيفة لتحديث الكاش فوراً بعد أي عملية حفظ تتم عبر النظام القديم
async function _refreshDbCache() {
  await _loadDbIntoCache();
}"""

new_handlers = """ipcMain.handle('db-save-order', async (event, data) => {
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
"""

content = content.replace(old_handlers, new_handlers)

# Replace the app.whenReady part
old_ready = """// تحميل قاعدة البيانات للذاكرة + ربط database.js بالكاش (بدون قراءة قرص متكررة)
app.whenReady().then(async () => {
  await _loadDbIntoCache();
  dbAPI.setMemoryBackend(
    () => _dbCache,
    (db) => {
      _dbCache = db;
      _dbCacheReady = true;
      void _writeDbAtomicQueued(db);
    }
  );
  if (effectiveWeakHost) {
    console.log('[MisterCasherPOS] Low-power mode: safe graphics, compact DB writes, background throttling.');
  }
});"""

new_ready = """// تحميل قاعدة البيانات وتهيئتها
app.whenReady().then(async () => {
  const sqlDbPath = path.join(app.getPath('userData'), 'pos_database.db');
  dbAPI.initDb(sqlDbPath);
  
  const sqlMigrator = require('./sql-migrator');
  await sqlMigrator.migrate(_dbPath);

  if (effectiveWeakHost) {
    console.log('[MisterCasherPOS] Low-power mode: safe graphics, compact DB writes, background throttling.');
  }
});"""

content = content.replace(old_ready, new_ready)

old_read_day = """function _dayClosureListItem(c) {
  if (!c || typeof c !== 'object') return c;
  const shifts = c.shifts || c.allDayShifts || [];
  const ordersFromShifts =
    shifts.length > 0
      ? shifts.reduce((s, sh) => s + (sh.ordersCount || sh.totalOrders || sh.orders_count || 0), 0)
      : 0;
  const id = _dayClosureId(c);
  const detailsMap = _dbCache && _dbCache.day_closure_details;
  const hasStoredDetails =
    Boolean(id && detailsMap && detailsMap[id] && Array.isArray(detailsMap[id].shifts) && detailsMap[id].shifts.length > 0);
  return {
    id: c.id,
    closedAt: c.closedAt,
    date: c.date,
    closedBy: c.closedBy,
    shiftsCount: c.shiftsCount || shifts.length || 0,
    ordersCount: c.ordersCount || ordersFromShifts || 0,
    totalIncome: c.totalIncome || 0,
    drawerTotal: c.drawerTotal || 0,
    totalCash: c.totalCash,
    totalNetwork: c.totalNetwork,
    totalTax: c.totalTax,
    totalReturns: c.totalReturns,
    totalExpenses: c.totalExpenses,
    hungerStationUnpaid: c.hungerStationUnpaid,
    deliveryBreakdown: c.deliveryBreakdown,
    hasShiftDetails: shifts.length > 0 || hasStoredDetails,
  };
}

ipcMain.handle('db-read-day-closures', async () => {
  try {
    if (!_dbCacheReady) await _loadDbIntoCache();
    const list = Array.isArray(_dbCache?.day_closures) ? _dbCache.day_closures : [];
    return list.map(_dayClosureListItem);
  } catch (e) {
    console.error('[DB Read] day_closures:', e.message);
    return [];
  }
});

/** قراءة أجزاء من القاعدة فقط — يقلل حجم IPC (لوحة القيادة، إلخ) */
ipcMain.handle('db-read-slice', async (event, keys) => {
  try {
    if (!_dbCacheReady) await _loadDbIntoCache();
    const list = Array.isArray(keys) ? keys : [];
    const out = {};
    for (const key of list) {
      if (!key || typeof key !== 'string') continue;
      const val = _dbCache[key];
      if (Array.isArray(val)) out[key] = val.slice();
      else if (val && typeof val === 'object') out[key] = { ...val };
      else out[key] = val;
    }
    return out;
  } catch (e) {
    console.error('[DB Read] slice:', e.message);
    return {};
  }
});

/** تحديث طلب واحد دون إرسال القاعدة كاملة عبر IPC */
ipcMain.handle('db-update-order', async (event, orderData) => {
  try {
    if (!_dbCacheReady) await _loadDbIntoCache();
    if (!orderData || orderData.orderId == null) {
      return { success: false, error: 'invalid order' };
    }
    if (!_dbCache.orders) _dbCache.orders = [];
    const idx = _dbCache.orders.findIndex((o) => String(o.orderId) === String(orderData.orderId));
    if (idx >= 0) {
      const old = _dbCache.orders[idx] || {};
      _dbCache.orders[idx] = {
        ...old,
        ...orderData,
        orderId: orderData.orderId,
        timestamp: orderData.timestamp || old.timestamp,
        editVersion: Number(old.editVersion || 0) + 1,
        updatedAt: orderData.updatedAt || Date.now(),
      };
    } else {
      orderData.editVersion = orderData.editVersion || 1;
      _dbCache.orders.push(orderData);
    }
    void _writeDbAtomicQueued(_dbCache);
    setImmediate(() => broadcastDBChanged());
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

/** إضافة سجل إقفال يوم دون قراءة/كتابة القاعدة كاملة */
ipcMain.handle('db-append-day-closure', async (event, payload) => {
  try {
    if (!_dbCacheReady) await _loadDbIntoCache();
    const summary = payload && payload.summary;
    const shifts = (payload && payload.shifts) || [];
    if (!summary || !summary.id) return { success: false, error: 'invalid closure' };
    if (!Array.isArray(_dbCache.day_closures)) _dbCache.day_closures = [];
    if (!_dbCache.day_closure_details || typeof _dbCache.day_closure_details !== 'object') {
      _dbCache.day_closure_details = {};
    }
    const dupKey = summary.id || ('DAY-' + (summary.closedAt || ''));
    const exists = _dbCache.day_closures.some(
      (c) => (c.id || ('DAY-' + (c.closedAt || ''))) === dupKey
    );
    if (!exists) _dbCache.day_closures.push(_stripShiftsFromClosure(summary));
    _dbCache.day_closure_details[summary.id] = { shifts: Array.isArray(shifts) ? shifts : [] };
    void _writeDbAtomicQueued(_dbCache);
    setImmediate(() => broadcastDBChanged());
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('db-read-day-closure-detail', async (event, closureId) => {
  try {
    if (!_dbCacheReady) await _loadDbIntoCache();
    const list = Array.isArray(_dbCache?.day_closures) ? _dbCache.day_closures : [];
    const id = String(closureId || '');
    const found =
      list.find((c) => c && c.id === id) ||
      list.find((c) => c && 'DAY-' + c.closedAt === id);
    if (!found) return null;
    const key = _dayClosureId(found) || id;
    const details = _dbCache.day_closure_details && key ? _dbCache.day_closure_details[key] : null;
    const shifts =
      (found.shifts || found.allDayShifts) ||
      (details && details.shifts) ||
      [];
    return { ...found, shifts: Array.isArray(shifts) ? shifts : [] };
  } catch (e) {
    return null;
  }
});

ipcMain.handle('db-read-full', async () => {
  try {
    // إذا كانت الكاش جاهزة ومكتملة — أرجعها فوراً بدون I/O
    if (_dbCacheReady && _dbCache && _dbCache.inventory) {
      return _dbCache;
    }
    // Fallback: قراءة من القرص إذا لم تكن الكاش جاهزة بعد أو كانت ناقصة
    const data = await fs.promises.readFile(_dbPath, 'utf8');
    const parsed = JSON.parse(data);
    if (parsed && parsed.inventory) {
      _dbCache = parsed;
      _dbCacheReady = true;
    }
    return _dbCache || parsed;
  } catch (e) {
    console.error('[DB Read] Error reading database:', e.message);
    writeAuditLog('DB_READ_ERROR', { error: e.message });
    // لا ترجع null أبداً إذا كان هناك كاش قديم
    return (_dbCache && _dbCache.inventory) ? _dbCache : _emptyDB;
  }
});
ipcMain.handle('db-write-full', async (event, data, opts) => {
  try {
    // منع فقدان سجلات الإقفال عند حفظ لقطة قديمة من نافذة أخرى (بدون day_closures)
    const cacheClosures = _dbCache && Array.isArray(_dbCache.day_closures) ? _dbCache.day_closures : [];
    const cacheClosureDetails =
      _dbCache && _dbCache.day_closure_details && typeof _dbCache.day_closure_details === 'object'
        ? _dbCache.day_closure_details
        : null;
    const incomingHasCore =
      (data.orders?.length || 0) > 0 ||
      (data.products?.length || 0) > 0 ||
      (data.inventory?.length || 0) > 0;
    if (cacheClosures.length > 0 && incomingHasCore) {
      if (!Array.isArray(data.day_closures)) {
        data.day_closures = cacheClosures.slice();
      } else if (data.day_closures.length < cacheClosures.length) {
        data.day_closures = _mergeDayClosures(cacheClosures, data.day_closures);
      }
    }
    if (cacheClosureDetails && incomingHasCore) {
      if (!data.day_closure_details || typeof data.day_closure_details !== 'object') {
        data.day_closure_details = { ...cacheClosureDetails };
      } else {
        data.day_closure_details = { ...cacheClosureDetails, ...data.day_closure_details };
      }
    }
    _migrateDayClosureStorage(data);

    _dbCache = data;
    _dbCacheReady = true;

    void _writeDbAtomicQueued(data);

    const broadcast = !opts || opts.broadcast !== false;
    if (broadcast) setImmediate(() => broadcastDBChanged());
    return true;
  } catch (e) {
    console.error('[DB Write] ❌ Error:', e.message);
    writeAuditLog('DB_WRITE_ERROR', { error: e.message });
    return false;
  }
});"""

new_read_day = """ipcMain.handle('db-read-day-closures', async () => {
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

ipcMain.handle('db-write-full', async (event, data, opts) => {
  const success = dbAPI.writeFull(data);
  const broadcast = !opts || opts.broadcast !== false;
  if (success && broadcast) setImmediate(() => broadcastDBChanged());
  return success;
});"""

content = content.replace(old_read_day, new_read_day)

with open('e:/baraaq/main.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Migration applied successfully.")
