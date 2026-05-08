const fs = require('fs');
const path = 'C:\\Users\\lenovo\\AppData\\Roaming\\baraaq\\pos_database.json';
try {
    const content = fs.readFileSync(path, 'utf8');
    const db = JSON.parse(content);
    console.log('Total inventory items:', db.inventory ? db.inventory.length : 0);
    if (db.inventory && db.inventory.length > 0) {
        console.log('Sample items (first 5):');
        db.inventory.slice(0, 5).forEach(item => {
            console.log(`- ${item.name} (${item.sku}): Qty ${item.qty}, Warehouse: ${item.warehouseId || 'main'}`);
        });
    }
    
    // Check for negative or weird quantities
    const problematic = db.inventory.filter(it => it.qty < 0);
    if (problematic.length > 0) {
        console.log('Negative quantity items found:', problematic.length);
        problematic.slice(0, 5).forEach(item => {
            console.log(`- ${item.name}: ${item.qty}`);
        });
    } else {
        console.log('No negative quantity items found.');
    }

} catch (e) {
    console.error('Error:', e.message);
}
