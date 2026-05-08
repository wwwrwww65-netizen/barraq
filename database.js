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
    const dbPath = getDbPath();
    const tempPath = dbPath + '.tmp';
    try {
        const jsonContent = JSON.stringify(dbData, null, 2);
        fs.writeFileSync(tempPath, jsonContent, 'utf8');
        
        // Use synchronous rename for simplicity in this synchronous-looking function
        // but ensure we handle potential Windows file locks
        let success = false;
        for (let i = 0; i < 5; i++) {
            try {
                if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
                fs.renameSync(tempPath, dbPath);
                success = true;
                break;
            } catch (e) {
                console.warn(`[DB Save] Rename attempt ${i+1} failed, retrying...`, e.message);
                // Simple busy wait
                const start = Date.now();
                while (Date.now() - start < 100) {} 
            }
        }
        if (!success) throw new Error('Failed to rename temp database file after 5 attempts');
    } catch (e) {
        console.error('[DB] Atomic save failed:', e.message);
        // Fallback to direct write if atomic fails for some reason
        fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
    }
}

// Helper methods exposed to IPC
/**
 * بناء قائمة خصومات مخزون لسطر فاتورة: وصفة اختيارية على المنتج أو مطابقة اسم الصنف المباع.
 * @param {string|undefined} warehouseId - إن وُجدت: البحث فقط داخل هذا المستودع (وضع المطبخ التلقائي)
 * @param {string} orderId - رقم الفاتورة للتوثيق
 */
function buildLineDeductions(db, lineItem, warehouseId, orderId = '') {
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
            const s = r.sku || '';
            if (n && q > 0) lines.push({ name: n, qty: q, sku: s });
        }
    } else if (soldName) {
        lines.push({ name: soldName, qty: qtySold, sku: lineItem.sku || '' });
    }

    const findInv = (invName, invSku = '') => {
        const cleanName = (invName || "").trim();
        const cleanSku = (invSku || "").trim();
        
        // POS deduction priority: Restaurant (Kitchen) -> Beverages -> Main
        const priorities = ['restaurant', 'beverages', 'main'];
        
        // 1. Try matching by SKU (if provided) in priority warehouses
        if (cleanSku) {
            for (const p of priorities) {
                const match = (db.inventory || []).find(
                    (inv) => (inv.sku || "").trim() === cleanSku && (inv.warehouseId || 'main') === p
                );
                if (match) return match;
            }
        }

        // 2. Try matching by Name in priority warehouses
        for (const p of priorities) {
            const match = (db.inventory || []).find(
                (inv) => (inv.name || "").trim() === cleanName && (inv.warehouseId || 'main') === p
            );
            if (match) return match;
        }

        // 3. Fallback to requested wh or any match (SKU first, then Name)
        if (useWh) {
            if (cleanSku) {
                const skuMatch = (db.inventory || []).find(
                    (inv) => (inv.sku || "").trim() === cleanSku && (inv.warehouseId || 'main') === warehouseId
                );
                if (skuMatch) return skuMatch;
            }
            const nameMatch = (db.inventory || []).find(
                (inv) => (inv.name || "").trim() === cleanName && (inv.warehouseId || 'main') === warehouseId
            );
            if (nameMatch) return nameMatch;
        }

        // Final fallback: any restaurant match or any general match
        const resMatch = (db.inventory || []).find((inv) => (
            (cleanSku && (inv.sku || "").trim() === cleanSku) || 
            (cleanName && (inv.name || "").trim() === cleanName)
        ) && (inv.warehouseId || 'main') === 'restaurant');
        
        if (resMatch) return resMatch;

        return (db.inventory || []).find((inv) => (
            (cleanSku && (inv.sku || "").trim() === cleanSku) || 
            (cleanName && (inv.name || "").trim() === cleanName)
        ));
    };

    for (const d of lines) {
        const row = findInv(d.name, d.sku);
        if (row) {
            const oldQty = Number(row.qty) || 0;
            const deduction = Number(d.qty) || 0;
            
            if (row.physicalQty != null) {
                const oldPhys = Number(row.physicalQty) || 0;
                if (oldQty > 0) {
                    // Deduct physical count proportionally to the normalized quantity
                    row.physicalQty = oldPhys - (deduction * (oldPhys / oldQty));
                } else {
                    // Fallback if normalized qty is already 0
                    row.physicalQty = oldPhys - deduction; 
                }
            }
            row.qty = oldQty - deduction;
            
            // Record kitchen transaction if deducted from restaurant warehouse
            if ((row.warehouseId || 'main') === 'restaurant') {
                if (!db.kitchenTx) db.kitchenTx = [];
                db.kitchenTx.push({
                    id: 'SALE-' + Date.now() + '-' + Math.floor(Math.random()*1000),
                    type: 'pos_sale',
                    itemName: row.name,
                    itemSku: row.sku || '',
                    qty: d.qty,
                    unit: row.unit || '',
                    date: new Date().toISOString(),
                    notes: `خصم مبيعات POS - فاتورة #${orderId || 'Direct'}`
                });
            }
        }
    }
}

module.exports = {
    saveOrder: (orderData) => {
        try {
            let db = loadDB();
            
            // PREVENT DUPLICATE: Check if order with same ID already exists
            const existingIndex = db.orders.findIndex(o => o.orderId === orderData.orderId);
            if (existingIndex !== -1) {
                console.warn(`[DB] Order ${orderData.orderId} already exists, preventing duplicate save`);
                return { success: false, duplicate: true, message: 'Order already exists' };
            }
            
            db.orders.push(orderData);

            const wh = orderData.inventoryDeductWarehouse;

            if (orderData.items) {
                for (let item of orderData.items) {
                    buildLineDeductions(db, item, wh, orderData.orderId);
                }
            }

            saveDB(db);
            console.log(`[DB] Order ${orderData.orderId} saved successfully`);
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
