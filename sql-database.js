const Database = require('better-sqlite3');

let db;

function initDb(dbPath) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    db.exec(`
        CREATE TABLE IF NOT EXISTS system_data (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE TABLE IF NOT EXISTS orders (
            orderId TEXT PRIMARY KEY,
            timestamp INTEGER,
            updatedAt INTEGER,
            data TEXT
        );

        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            data TEXT
        );

        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            data TEXT
        );

        CREATE TABLE IF NOT EXISTS inventory (
            id TEXT PRIMARY KEY,
            sku TEXT,
            name TEXT,
            warehouseId TEXT,
            data TEXT
        );

        CREATE TABLE IF NOT EXISTS day_closures (
            id TEXT PRIMARY KEY,
            closedAt INTEGER,
            data TEXT
        );

        CREATE TABLE IF NOT EXISTS day_closure_details (
            id TEXT PRIMARY KEY,
            data TEXT
        );

        CREATE TABLE IF NOT EXISTS kitchen_tx (
            id TEXT PRIMARY KEY,
            data TEXT
        );
    `);

    // Create indexes for performance
    db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_sku_wh ON inventory(sku, warehouseId) WHERE sku IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_name_wh ON inventory(name, warehouseId) WHERE name IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_orders_timestamp ON orders(timestamp DESC);
    `);
}

function closeDb() {
    if (db && db.open) {
        db.close();
    }
}

// ---------------------------------------------------------
// Helper
// ---------------------------------------------------------
function _getAllFromTable(tableName) {
    try {
        const rows = db.prepare('SELECT data FROM ' + tableName).all();
        return rows.map(function(r) { return JSON.parse(r.data); });
    } catch (e) {
        console.error('Error reading from ' + tableName + ':', e.message);
        return [];
    }
}

// ---------------------------------------------------------
// Orders
// ---------------------------------------------------------
function saveOrder(orderData) {
    try {
        const check = db.prepare('SELECT orderId FROM orders WHERE orderId = ?').get(orderData.orderId);
        if (check) {
            console.warn('[SQL-DB] Order ' + orderData.orderId + ' already exists, preventing duplicate save');
            return { success: false, duplicate: true, message: 'Order already exists' };
        }

        const wh = orderData.inventoryDeductWarehouse;
        if (orderData.items) {
            for (let item of orderData.items) {
                buildLineDeductions(item, wh, orderData.orderId);
            }
        }

        db.prepare('INSERT INTO orders (orderId, timestamp, updatedAt, data) VALUES (?, ?, ?, ?)').run(
            orderData.orderId,
            orderData.timestamp || Date.now(),
            orderData.updatedAt || Date.now(),
            JSON.stringify(orderData)
        );
        console.log('[SQL-DB] Order ' + orderData.orderId + ' saved successfully');
        return { success: true };
    } catch (e) {
        console.error('DB saveOrder failed:', e.message);
        throw e;
    }
}

function updateOrder(orderData) {
    try {
        if (!orderData || orderData.orderId == null) {
            return { success: false, error: 'invalid order' };
        }

        const existingRow = db.prepare('SELECT data FROM orders WHERE orderId = ?').get(orderData.orderId);
        if (existingRow) {
            const old = JSON.parse(existingRow.data);
            const newData = Object.assign({}, old, orderData, {
                orderId: orderData.orderId,
                timestamp: orderData.timestamp || old.timestamp,
                editVersion: Number(old.editVersion || 0) + 1,
                updatedAt: orderData.updatedAt || Date.now(),
            });
            db.prepare('UPDATE orders SET timestamp = ?, updatedAt = ?, data = ? WHERE orderId = ?').run(
                newData.timestamp,
                newData.updatedAt,
                JSON.stringify(newData),
                orderData.orderId
            );
        } else {
            orderData.editVersion = orderData.editVersion || 1;
            db.prepare('INSERT INTO orders (orderId, timestamp, updatedAt, data) VALUES (?, ?, ?, ?)').run(
                orderData.orderId,
                orderData.timestamp || Date.now(),
                orderData.updatedAt || Date.now(),
                JSON.stringify(orderData)
            );
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

function getOrders(limit) {
    try {
        // Default: last 500 orders for UI display (fast). Pass limit=0 for all orders (backup/reports).
        const sql = (limit === 0)
            ? 'SELECT data FROM orders ORDER BY timestamp DESC'
            : `SELECT data FROM orders ORDER BY timestamp DESC LIMIT ${limit || 500}`;
        const rows = db.prepare(sql).all();
        return rows.map(function(r) { return JSON.parse(r.data); });
    } catch (e) {
        return [];
    }
}

/** جلب آخر طلب فقط لاستخراج رقم الفاتورة — أسرع بكثير من جلب 500 سجل */
function getLastOrderMeta() {
    try {
        const row = db.prepare('SELECT data FROM orders ORDER BY timestamp DESC LIMIT 1').get();
        if (!row) return null;
        const o = JSON.parse(row.data);
        return { orderId: o.orderId, invoiceHash: o.invoiceHash || null };
    } catch (e) {
        return null;
    }
}

/** الحصول على أعلى رقم تسلسلي للطلبات مباشرة من SQL بدون جلب JSON
 *  نستخدم MAX() مع CAST مباشرة في SQLite — أسرع بكثير من جلب كل الصفوف وتحليلها بـ JavaScript
 */
function getMaxOrderNumber() {
    try {
        // استخراج الأرقام من orderId مثل "#INV-00123" عبر CAST في SQLite مباشرة
        // CAST(REPLACE(orderId, '#INV-', '') AS INTEGER) يعطي 123 مباشرة
        const row = db.prepare(`
            SELECT MAX(
                CAST(REPLACE(REPLACE(orderId, '#INV-', ''), '#', '') AS INTEGER)
            ) AS maxNum FROM orders
        `).get();
        const n = row && row.maxNum != null ? Number(row.maxNum) : 0;
        return isNaN(n) ? 0 : n;
    } catch (e) {
        // Fallback: regex loop (بطيء لكن آمن)
        try {
            const rows = db.prepare('SELECT orderId FROM orders').all();
            let maxId = 0;
            for (const r of rows) {
                const match = String(r.orderId || '').match(/\d+/);
                if (match) {
                    const num = parseInt(match[0], 10);
                    if (num > maxId) maxId = num;
                }
            }
            return maxId;
        } catch (_) {
            return 0;
        }
    }
}

// ---------------------------------------------------------
// Products
// ---------------------------------------------------------
function saveProduct(product) {
    try {
        db.prepare('INSERT OR REPLACE INTO products (id, data) VALUES (?, ?)').run(product.id, JSON.stringify(product));
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

function getProducts() {
    return _getAllFromTable('products');
}

// ---------------------------------------------------------
// Categories
// ---------------------------------------------------------
function saveCategory(category) {
    try {
        db.prepare('INSERT OR REPLACE INTO categories (id, data) VALUES (?, ?)').run(category.id, JSON.stringify(category));
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

function getCategories() {
    return _getAllFromTable('categories');
}

// ---------------------------------------------------------
// Inventory
// ---------------------------------------------------------
function getInventory() {
    return _getAllFromTable('inventory');
}

function saveInventoryItem(item) {
    try {
        if (!item || typeof item !== 'object') {
            return { success: false, error: 'invalid item' };
        }
        const wh = item.warehouseId || 'main';
        const id = item.id || ('INV-' + Date.now() + '-' + Math.floor(Math.random() * 1000));

        let existing = null;
        if (item.sku) {
            existing = db.prepare('SELECT data, id FROM inventory WHERE sku = ? AND warehouseId = ?').get(item.sku, wh);
        }
        if (!existing && item.name) {
            existing = db.prepare('SELECT data, id FROM inventory WHERE name = ? AND warehouseId = ?').get(item.name, wh);
        }

        const merged = Object.assign({ warehouseId: wh }, item);
        let finalId = id;

        if (existing) {
            const oldData = JSON.parse(existing.data);
            finalId = existing.id;
            merged.id = finalId;
            const updatedData = Object.assign({}, oldData, merged);
            db.prepare('UPDATE inventory SET sku = ?, name = ?, data = ? WHERE id = ?').run(
                updatedData.sku || null,
                updatedData.name || null,
                JSON.stringify(updatedData),
                finalId
            );
        } else {
            merged.id = finalId;
            db.prepare('INSERT INTO inventory (id, sku, name, warehouseId, data) VALUES (?, ?, ?, ?, ?)').run(
                finalId,
                merged.sku || null,
                merged.name || null,
                wh,
                JSON.stringify(merged)
            );
        }
        return { success: true };
    } catch (e) {
        console.error('saveInventoryItem failed:', e.message);
        return { success: false, error: e.message };
    }
}

// ---------------------------------------------------------
// Inventory Deductions
// ---------------------------------------------------------
function buildLineDeductions(lineItem, warehouseId, orderId) {
    if (!orderId) orderId = '';
    const qtySold = Number(lineItem.qty) || 1;
    const soldName = lineItem.name || lineItem.nameAr;
    const useWh = warehouseId != null && warehouseId !== '';

    const prodRow = lineItem.id != null ? db.prepare('SELECT data FROM products WHERE id = ?').get(String(lineItem.id)) : null;
    const prod = prodRow ? JSON.parse(prodRow.data) : null;
    const rawList = prod && Array.isArray(prod.rawMaterials) ? prod.rawMaterials : null;

    const lines = [];
    if (rawList && rawList.length) {
        for (const r of rawList) {
            const n = r.name || r.inventoryName;
            const per = Number(r.qtyPerUnit) || Number(r.qty) || 0;
            const q = per * qtySold;
            const s = r.sku || '';
            if (n && q > 0) lines.push({ name: n, qty: q, sku: s });
        }
    } else if (soldName) {
        lines.push({ name: soldName, qty: qtySold, sku: lineItem.sku || '' });
    }

    function findInv(invName, invSku) {
        if (!invSku) invSku = '';
        const cleanName = (invName || '').trim();
        const cleanSku = (invSku || '').trim();
        const priorities = ['restaurant', 'beverages', 'main'];

        if (cleanSku) {
            for (const p of priorities) {
                const row = db.prepare('SELECT id, data FROM inventory WHERE sku = ? AND warehouseId = ?').get(cleanSku, p);
                if (row) return JSON.parse(row.data);
            }
        }
        if (cleanName) {
            for (const p of priorities) {
                const row = db.prepare('SELECT id, data FROM inventory WHERE name = ? AND warehouseId = ?').get(cleanName, p);
                if (row) return JSON.parse(row.data);
            }
        }
        if (useWh) {
            if (cleanSku) {
                const row = db.prepare('SELECT id, data FROM inventory WHERE sku = ? AND warehouseId = ?').get(cleanSku, warehouseId);
                if (row) return JSON.parse(row.data);
            }
            if (cleanName) {
                const row = db.prepare('SELECT id, data FROM inventory WHERE name = ? AND warehouseId = ?').get(cleanName, warehouseId);
                if (row) return JSON.parse(row.data);
            }
        }
        if (cleanSku) {
            const match = db.prepare('SELECT id, data FROM inventory WHERE sku = ?').get(cleanSku);
            if (match) return JSON.parse(match.data);
        }
        if (cleanName) {
            const match = db.prepare('SELECT id, data FROM inventory WHERE name = ?').get(cleanName);
            if (match) return JSON.parse(match.data);
        }
        return null;
    }

    for (const d of lines) {
        const row = findInv(d.name, d.sku);
        if (row) {
            const oldQty = Number(row.qty) || 0;
            const deduction = Number(d.qty) || 0;

            if (row.physicalQty != null) {
                const oldPhys = Number(row.physicalQty) || 0;
                row.physicalQty = oldQty > 0 ? (oldPhys - (deduction * (oldPhys / oldQty))) : (oldPhys - deduction);
            }
            row.qty = oldQty - deduction;

            saveInventoryItem(row);

            if ((row.warehouseId || 'main') === 'restaurant') {
                const tx = {
                    id: 'SALE-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
                    type: 'pos_sale',
                    itemName: row.name,
                    itemSku: row.sku || '',
                    qty: d.qty,
                    unit: row.unit || '',
                    date: new Date().toISOString(),
                    notes: 'خصم مبيعات POS - فاتورة #' + (orderId || 'Direct')
                };
                db.prepare('INSERT OR IGNORE INTO kitchen_tx (id, data) VALUES (?, ?)').run(tx.id, JSON.stringify(tx));
            }
        }
    }
}

// ---------------------------------------------------------
// Day Closures
// ---------------------------------------------------------
function getDayClosures() {
    try {
        const rows = db.prepare('SELECT data FROM day_closures ORDER BY closedAt DESC').all();
        return rows.map(function(r) { return JSON.parse(r.data); });
    } catch (e) {
        return [];
    }
}

function getDayClosureDetail(id) {
    try {
        const row = db.prepare('SELECT data FROM day_closures WHERE id = ?').get(id);
        const targetRow = row || db.prepare('SELECT data FROM day_closures WHERE id = ?').get('DAY-' + id);
        if (!targetRow) return null;
        const base = JSON.parse(targetRow.data);
        const detailsRow = db.prepare('SELECT data FROM day_closure_details WHERE id = ?').get(base.id);
        const details = detailsRow ? JSON.parse(detailsRow.data) : { shifts: [] };
        return Object.assign({}, base, { shifts: details.shifts || [] });
    } catch (e) {
        return null;
    }
}

function appendDayClosure(summary, shifts) {
    try {
        if (!summary || !summary.id) return { success: false, error: 'invalid closure' };
        const dupKey = summary.id || ('DAY-' + (summary.closedAt || ''));
        summary.id = dupKey;

        const exists = db.prepare('SELECT id FROM day_closures WHERE id = ?').get(dupKey);
        if (!exists) {
            const strippedSummary = Object.assign({}, summary);
            delete strippedSummary.shifts;
            delete strippedSummary.allDayShifts;
            db.prepare('INSERT INTO day_closures (id, closedAt, data) VALUES (?, ?, ?)').run(
                dupKey,
                summary.closedAt || 0,
                JSON.stringify(strippedSummary)
            );
        }

        db.prepare('INSERT OR REPLACE INTO day_closure_details (id, data) VALUES (?, ?)').run(
            dupKey,
            JSON.stringify({ shifts: Array.isArray(shifts) ? shifts : [] })
        );
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ---------------------------------------------------------
// Full DB & Slice Operations (For Sync / Backup)
// ---------------------------------------------------------
const SYSTEM_KEYS = [
    'purchases', 'suppliers', 'inventoryTx', 'returns', 'expenses', 'bankTransfers',
    'hrExpenses', 'otherIncome', 'employees', 'attendance', 'penaltyRules',
    'chartOfAccounts', 'journalEntries', 'systemNotifications', 'inventoryAlertState',
    'deliveryCompanies', 'customers', 'zatca_keys', 'zatca_csid', 'migration_done'
];

function readSlice(keys) {
    const out = {};
    for (const key of keys) {
        if (key === 'orders') {
            // UI pages: last 500 orders (fast)
            out[key] = getOrders();
        } else if (key === 'orders_all') {
            // Financial reports only: ALL orders (no limit)
            out['orders'] = getOrders(0);
        } else if (['products', 'categories', 'inventory', 'day_closures'].includes(key)) {
            out[key] = _getAllFromTable(key);
        } else if (key === 'day_closure_details') {
            const rows = db.prepare('SELECT id, data FROM day_closure_details').all();
            out[key] = {};
            for (const r of rows) {
                out[key][r.id] = JSON.parse(r.data);
            }
        } else if (key === 'kitchenTx') {
            out[key] = _getAllFromTable('kitchen_tx');
        } else {
            const row = db.prepare('SELECT value FROM system_data WHERE key = ?').get(key);
            out[key] = row ? JSON.parse(row.value) : (SYSTEM_KEYS.includes(key) ? [] : null);
        }
    }
    return out;
}

function readFull() {
    const data = {
        orders: getOrders(0), // 0 = no limit — fetch ALL orders for complete backup/reports
        products: getProducts(),
        categories: getCategories(),
        inventory: getInventory(),
        day_closures: getDayClosures(),
        day_closure_details: readSlice(['day_closure_details']).day_closure_details || {},
        kitchenTx: _getAllFromTable('kitchen_tx')
    };

    const rows = db.prepare('SELECT key, value FROM system_data').all();
    for (const r of rows) {
        // Don't overwrite the keys we already have from dedicated tables
        if (!['migration_done'].includes(r.key)) {
            data[r.key] = JSON.parse(r.value);
        }
    }

    return data;
}

function readUI() {
    const data = {
        orders: getOrders(500), // Only 500 for UI responsiveness
        products: getProducts(),
        categories: getCategories(),
        inventory: getInventory(),
        day_closures: getDayClosures(),
        day_closure_details: readSlice(['day_closure_details']).day_closure_details || {},
        kitchenTx: _getAllFromTable('kitchen_tx')
    };

    const rows = db.prepare('SELECT key, value FROM system_data').all();
    for (const r of rows) {
        if (!['migration_done'].includes(r.key)) {
            data[r.key] = JSON.parse(r.value);
        }
    }

    return data;
}

function writeFull(data) {
    if (!data || typeof data !== 'object') return false;
    try {
        const writeOp = db.transaction(function() {
            if (Array.isArray(data.orders)) {
                const stmt = db.prepare('INSERT OR REPLACE INTO orders (orderId, timestamp, updatedAt, data) VALUES (?, ?, ?, ?)');
                for (const item of data.orders) {
                    if (item && item.orderId) stmt.run(item.orderId, item.timestamp || 0, item.updatedAt || 0, JSON.stringify(item));
                }
            }
            if (Array.isArray(data.products)) {
                const stmt = db.prepare('INSERT OR REPLACE INTO products (id, data) VALUES (?, ?)');
                for (const item of data.products) {
                    if (item && item.id) stmt.run(item.id, JSON.stringify(item));
                }
            }
            if (Array.isArray(data.categories)) {
                const stmt = db.prepare('INSERT OR REPLACE INTO categories (id, data) VALUES (?, ?)');
                for (const item of data.categories) {
                    if (item && item.id) stmt.run(item.id, JSON.stringify(item));
                }
            }
            if (Array.isArray(data.inventory)) {
                const stmt = db.prepare('INSERT OR REPLACE INTO inventory (id, sku, name, warehouseId, data) VALUES (?, ?, ?, ?, ?)');
                for (const item of data.inventory) {
                    if (item) stmt.run(item.id || ('INV-' + Date.now()), item.sku || null, item.name || null, item.warehouseId || 'main', JSON.stringify(item));
                }
            }
            if (Array.isArray(data.day_closures)) {
                const stmt = db.prepare('INSERT OR REPLACE INTO day_closures (id, closedAt, data) VALUES (?, ?, ?)');
                for (const item of data.day_closures) {
                    if (item) stmt.run(item.id || ('DAY-' + item.closedAt), item.closedAt || 0, JSON.stringify(item));
                }
            }
            if (data.day_closure_details && typeof data.day_closure_details === 'object') {
                const stmt = db.prepare('INSERT OR REPLACE INTO day_closure_details (id, data) VALUES (?, ?)');
                for (const id in data.day_closure_details) {
                    stmt.run(id, JSON.stringify(data.day_closure_details[id]));
                }
            }
            if (Array.isArray(data.kitchenTx)) {
                const stmt = db.prepare('INSERT OR REPLACE INTO kitchen_tx (id, data) VALUES (?, ?)');
                for (const item of data.kitchenTx) {
                    if (item && item.id) stmt.run(item.id, JSON.stringify(item));
                }
            }

            const sysStmt = db.prepare('INSERT OR REPLACE INTO system_data (key, value) VALUES (?, ?)');
            const skipKeys = ['orders', 'products', 'categories', 'inventory', 'day_closures', 'day_closure_details', 'kitchenTx'];
            for (const key of Object.keys(data)) {
                if (!skipKeys.includes(key)) {
                    sysStmt.run(key, JSON.stringify(data[key]));
                }
            }
        });

        writeOp();
        return true;
    } catch (e) {
        console.error('writeFull Error:', e.message);
        return false;
    }
}

function checkpointDb() {
    try {
        if (db) {
            db.pragma('wal_checkpoint(TRUNCATE)');
        }
    } catch(e) {
        console.error('Failed to checkpoint DB', e);
    }
}

module.exports = {
    initDb,
    closeDb,
    checkpointDb,
    saveOrder,
    updateOrder,
    getOrders,
    getLastOrderMeta,
    getMaxOrderNumber,
    saveProduct,
    getProducts,
    saveCategory,
    getCategories,
    saveInventoryItem,
    getInventory,
    buildLineDeductions,
    getDayClosures,
    getDayClosureDetail,
    appendDayClosure,
    readSlice,
    readFull,
    readUI,
    writeFull
};
