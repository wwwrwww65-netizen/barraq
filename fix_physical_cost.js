const fs = require('fs');
const path = require('path');

const dbPath = process.env.APPDATA + '\\baraaq\\pos_database.json';

try {
    const rawData = fs.readFileSync(dbPath, 'utf8');
    const db = JSON.parse(rawData);

    let updatedCount = 0;

    if (db.inventory && db.purchases) {
        db.inventory.forEach(invItem => {
            // Recalculate physicalCost based on purchases
            let totalPhysicalValue = 0;
            let totalPhysicalQty = 0;
            db.purchases.forEach(pur => {
                if (pur.items) {
                    pur.items.forEach(buyItem => {
                        if (buyItem.sku === invItem.sku) {
                            totalPhysicalQty += Number(buyItem.qty);
                            totalPhysicalValue += Number(buyItem.qty) * Number(buyItem.price);
                        }
                    });
                }
            });

            if (totalPhysicalQty > 0) {
                invItem.physicalCost = totalPhysicalValue / totalPhysicalQty;
                updatedCount++;
            } else if (!invItem.physicalCost) {
                invItem.physicalCost = (invItem.cost || 0) * (invItem.standardYield || 1);
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
