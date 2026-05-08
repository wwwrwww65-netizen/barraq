const fs = require('fs');
const path = 'C:\\Users\\lenovo\\AppData\\Roaming\\baraaq\\pos_database.json';
try {
    const content = fs.readFileSync(path, 'utf8');
    const db = JSON.parse(content);
    console.log('Total transactions:', db.inventoryTx ? db.inventoryTx.length : 0);
    if (db.inventoryTx && db.inventoryTx.length > 0) {
        console.log('Sample transactions (last 5):');
        db.inventoryTx.slice(-5).forEach(tx => {
            console.log(`- Type: ${tx.type}, SKU: ${tx.sku}, Qty: ${tx.qty || 'N/A'}, Total: ${tx.total || 0}, Date: ${new Date(tx.date).toLocaleDateString()}`);
        });
    }
} catch (e) {
    console.error('Error:', e.message);
}
