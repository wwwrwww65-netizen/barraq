const fs = require('fs');
const path = 'C:\\Users\\lenovo\\AppData\\Roaming\\baraaq\\pos_database.json';

function isThisMonth(ts) {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return false;
    const n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
}

try {
    const content = fs.readFileSync(path, 'utf8');
    const db = JSON.parse(content);
    
    const erpItems = db.inventory || [];
    const erpTx = db.inventoryTx || [];
    const currentWH = 'main';

    // 1. Total Estimated Inventory Value
    const currentItems = erpItems.filter((i) => (i.warehouseId || 'main') === currentWH);
    let totalVal = 0;
    console.log('Calculation for Total Valuation (Main Warehouse):');
    currentItems.forEach(it => {
        const lineVal = (Number(it.qty) || 0) * (Number(it.cost) || 0);
        console.log(`- ${it.name}: Qty ${it.qty} * Cost ${it.cost} = ${lineVal}`);
        totalVal += lineVal;
    });
    console.log('Final Total Valuation:', totalVal);

    // 2. Received (This Month)
    const inThisMonth = erpTx.filter((t) => t.type === 'in' && isThisMonth(t.date) && (t.toWh || t.wh || 'main') === currentWH);
    let inVal = 0;
    console.log('\nCalculation for Received (This Month):');
    inThisMonth.forEach(t => {
        console.log(`- Type: ${t.type}, SKU: ${t.sku}, Total: ${t.total}, Date: ${new Date(t.date).toLocaleDateString()}`);
        inVal += (Number(t.total) || 0);
    });
    console.log('Final Received Value:', inVal, '(Count:', inThisMonth.length, ')');

    // 3. Issued (This Month)
    const outThisMonth = erpTx.filter((t) => t.type === 'out' && isThisMonth(t.date) && (t.fromWh || t.wh || 'main') === currentWH);
    let outVal = 0;
    console.log('\nCalculation for Issued (This Month):');
    outThisMonth.forEach(t => {
        console.log(`- Type: ${t.type}, SKU: ${t.sku}, Total: ${t.total}, Date: ${new Date(t.date).toLocaleDateString()}`);
        outVal += (Number(t.total) || 0);
    });
    console.log('Final Issued Value:', outVal);

} catch (e) {
    console.error('Error:', e.message);
}
