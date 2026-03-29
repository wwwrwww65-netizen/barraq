const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const dbPath = path.join(app.getPath('userData'), 'pos_database.json');

// Initialize database
let db = { orders: [], products: [], inventory: [] };
try {
    if (fs.existsSync(dbPath)) {
        const raw = fs.readFileSync(dbPath, 'utf8');
        db = JSON.parse(raw);
    } else {
        fs.writeFileSync(dbPath, JSON.stringify(db));
        console.log('Created JSON DB at', dbPath);
    }
} catch(err) {
    console.error('Failed to initialize JSON DB:', err);
}

function saveDB() {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

// Helper methods exposed to IPC
module.exports = {
    saveOrder: (orderData) => {
        try {
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

            saveDB();
            return { success: true };
        } catch(e) {
            console.error('DB transaction failed:', e);
            throw e;
        }
    },
    
    getOrders: () => {
        return db.orders.slice().sort((a,b) => b.timestamp - a.timestamp).slice(0, 500);
    },

    getInventory: () => {
        return db.inventory;
    },
    
    saveProduct: (product) => {
        const idx = db.products.findIndex(p => p.id === product.id);
        if (idx !== -1) db.products[idx] = product;
        else db.products.push(product);
        saveDB();
        return { success: true };
    },

    getProducts: () => {
        return db.products;
    },

    saveCategory: (category) => {
        if (!db.categories) db.categories = [];
        const idx = db.categories.findIndex(c => c.id === category.id);
        if (idx !== -1) db.categories[idx] = category;
        else db.categories.push(category);
        saveDB();
        return { success: true };
    },

    getCategories: () => {
        return db.categories || [];
    }
};
