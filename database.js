const fs = require('fs');
const path = require('path');

/** مسار ملف القاعدة؛ في الاختبارات يُعيّن عبر POS_TEST_DB_FILE لتجنّب تحميل electron */
function getDbPath() {
    if (process.env.POS_TEST_DB_FILE) {
        return process.env.POS_TEST_DB_FILE;
    }
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'pos_database.json');
}

// Always read fresh to avoid state desync since renderers also modify the file directly
function loadDB() {
    const dbPath = getDbPath();
    let freshDb = { orders: [], products: [], inventory: [], categories: [] };
    try {
        if (fs.existsSync(dbPath)) {
            const raw = fs.readFileSync(dbPath, 'utf8');
            freshDb = JSON.parse(raw);
        }
    } catch(e) {}
    if(!freshDb.orders) freshDb.orders = [];
    if(!freshDb.products) freshDb.products = [];
    if(!freshDb.categories) freshDb.categories = [];
    if(!freshDb.inventory) freshDb.inventory = [];
    return freshDb;
}

function saveDB(dbData) {
    fs.writeFileSync(getDbPath(), JSON.stringify(dbData, null, 2));
}

// Helper methods exposed to IPC
/**
 * بناء قائمة خصومات مخزون لسطر فاتورة: وصفة اختيارية على المنتج أو مطابقة اسم الصنف المباع.
 * @param {string|undefined} warehouseId - إن وُجدت: البحث فقط داخل هذا المستودع (وضع المطبخ التلقائي)
 */
function buildLineDeductions(db, lineItem, warehouseId) {
    const qtySold = Number(lineItem.qty) || 1;
    const soldName = lineItem.name || lineItem.nameAr;
    const useWh = warehouseId != null && warehouseId !== '';

    const prod =
        lineItem.id != null
            ? (db.products || []).find((p) => String(p.id) === String(lineItem.id))
            : null;
    const rawList = prod && Array.isArray(prod.rawMaterials) ? prod.rawMaterials : null;

    const lines = [];
    if (rawList && rawList.length) {
        for (const r of rawList) {
            const n = r.name || r.inventoryName;
            const per = Number(r.qtyPerUnit) || Number(r.qty) || 0;
            const q = per * qtySold;
            if (n && q > 0) lines.push({ name: n, qty: q });
        }
    } else if (soldName) {
        lines.push({ name: soldName, qty: qtySold });
    }

    const findInv = (invName) => {
        if (useWh) {
            return db.inventory.find(
                (inv) => inv.name === invName && (inv.warehouseId || 'main') === warehouseId
            );
        }
        return db.inventory.find((inv) => inv.name === invName);
    };

    for (const d of lines) {
        const row = findInv(d.name);
        if (row) {
            row.qty = (Number(row.qty) || 0) - d.qty;
        }
    }
}

module.exports = {
    saveOrder: (orderData) => {
        try {
            let db = loadDB();
            db.orders.push(orderData);

            const wh = orderData.inventoryDeductWarehouse;

            if (orderData.items) {
                for (let item of orderData.items) {
                    buildLineDeductions(db, item, wh);
                }
            }

            saveDB(db);
            return { success: true };
        } catch(e) {
            console.error('DB transaction failed:', e);
            throw e;
        }
    },
    
    getOrders: () => {
        return loadDB().orders.slice().sort((a,b) => b.timestamp - a.timestamp).slice(0, 500);
    },

    getInventory: () => {
        return loadDB().inventory;
    },

    /** دمج/إضافة صنف مخزون (مفتاح: sku + مستودع، أو name + مستودع إن لم يوجد sku) */
    saveInventoryItem: (item) => {
        try {
            if (!item || typeof item !== 'object') {
                return { success: false, error: 'invalid item' };
            }
            const db = loadDB();
            const wh = item.warehouseId || 'main';
            let idx = -1;
            if (item.sku) {
                idx = db.inventory.findIndex(
                    (inv) => inv.sku === item.sku && (inv.warehouseId || 'main') === wh,
                );
            }
            if (idx === -1 && item.name) {
                idx = db.inventory.findIndex(
                    (inv) => inv.name === item.name && (inv.warehouseId || 'main') === wh,
                );
            }
            const merged = { warehouseId: wh, ...item };
            if (idx !== -1) {
                db.inventory[idx] = { ...db.inventory[idx], ...merged };
            } else {
                db.inventory.push(merged);
            }
            saveDB(db);
            return { success: true };
        } catch (e) {
            console.error('saveInventoryItem failed:', e);
            return { success: false, error: e.message };
        }
    },

    saveProduct: (product) => {
        let db = loadDB();
        const idx = db.products.findIndex(p => p.id === product.id);
        if (idx !== -1) db.products[idx] = product;
        else db.products.push(product);
        saveDB(db);
        return { success: true };
    },

    getProducts: () => {
        return loadDB().products;
    },

    saveCategory: (category) => {
        let db = loadDB();
        const idx = db.categories.findIndex(c => c.id === category.id);
        if (idx !== -1) db.categories[idx] = category;
        else db.categories.push(category);
        saveDB(db);
        return { success: true };
    },

    getCategories: () => {
        return loadDB().categories;
    }
};
