const fs = require('fs');
const path = 'C:\\Users\\lenovo\\AppData\\Roaming\\baraaq\\pos_database.json';
try {
    const content = fs.readFileSync(path, 'utf8');
    const db = JSON.parse(content);
    const bevItems = db.inventory.filter(it => it.warehouseId === 'beverages');
    console.log('Items in beverages warehouse:', bevItems.length);
    bevItems.forEach(it => console.log(`- ${it.name}: ${it.qty}`));
} catch (e) {
    console.error('Error:', e.message);
}
