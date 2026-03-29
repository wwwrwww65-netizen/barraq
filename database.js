const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const dbPath = path.join(app.getPath('userData'), 'pos_database.json');

// Always read fresh to avoid state desync since renderers also modify the file directly
function loadDB() {
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
    fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
}

// Helper methods exposed to IPC
module.exports = {
    saveOrder: (orderData) => {
        try {
            let db = loadDB();
            db.orders.push(orderData);

            // Deduct inventory where name matches
            if (orderData.items) {
                for (let item of orderData.items) {
                    let matchingInv = db.inventory.find(inv => inv.name === item.name);
                    if(matchingInv) {
                        matchingInv.qty -= item.qty;
                    }
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
