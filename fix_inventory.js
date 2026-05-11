const fs = require('fs');
const path = require('path');

const dbPath = process.env.APPDATA + '\\baraaq\\pos_database.json';

try {
    const rawData = fs.readFileSync(dbPath, 'utf8');
    const db = JSON.parse(rawData);

    let updatedCount = 0;

    if (db.inventory && db.purchases) {
        db.inventory.forEach(invItem => {
            if (!invItem.standardYield || invItem.standardYield === 1) {
                // Find a purchase that contains this SKU and has a yield specified
                for (let i = db.purchases.length - 1; i >= 0; i--) {
                    const pur = db.purchases[i];
                    if (pur.items) {
                        const buyItem = pur.items.find(item => item.sku === invItem.sku);
                        if (buyItem && Number(buyItem.yield) > 1) {
                            invItem.standardYield = Number(buyItem.yield);
                            updatedCount++;
                            console.log(`Updated SKU ${invItem.sku} (${invItem.name}) standardYield to ${invItem.standardYield}`);
                            break;
                        }
                    }
                }
            }
        });

        if (updatedCount > 0) {
            fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
            console.log(`Successfully updated ${updatedCount} inventory items!`);
        } else {
            console.log('No items needed updating.');
        }
    } else {
        console.log('Database missing inventory or purchases data.');
    }
} catch (e) {
    console.error('Error fixing database:', e);
}
