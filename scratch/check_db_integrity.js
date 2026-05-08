const fs = require('fs');
const path = 'C:\\Users\\lenovo\\AppData\\Roaming\\baraaq\\pos_database.json';
try {
    const content = fs.readFileSync(path, 'utf8');
    const db = JSON.parse(content);
    console.log('Inventory count:', db.inventory ? db.inventory.length : 'MISSING');
    console.log('Transactions count:', db.inventoryTx ? db.inventoryTx.length : 'MISSING');
    if (db.inventory) {
        console.log('First 3 items:', JSON.stringify(db.inventory.slice(0, 3), null, 2));
    }
} catch (e) {
    console.error('Error reading DB:', e.message);
    if (e.message.includes('Unexpected end of JSON input')) {
        console.log('FILE IS EMPTY OR CORRUPTED');
    }
}
