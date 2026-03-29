const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', async () => {
    await loadSales();

    const searchInput = document.getElementById('sales-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const rows = document.querySelectorAll('#sales-tbody tr');
            rows.forEach(row => {
                const text = row.innerText.toLowerCase();
                row.style.display = text.includes(query) ? '' : 'none';
            });
        });
    }
});

async function loadSales() {
    // Read from SQLite JSON database via IPC
    let orders = await ipcRenderer.invoke('db-get-orders');
    if (!orders) orders = [];

    // Sort descending by timestamp
    orders.sort((a, b) => b.timestamp - a.timestamp);

    const tbody = document.getElementById('sales-tbody');
    const emptyState = document.getElementById('empty-state');
    
    if (orders.length === 0) {
        tbody.innerHTML = '';
        if(emptyState) emptyState.style.display = 'block';
        const tbl = document.querySelector('.sales-table');
        if(tbl) tbl.style.display = 'none';
        updateKPIs([]);
        return;
    }

    if(emptyState) emptyState.style.display = 'none';
    const tbl = document.querySelector('.sales-table');
    if(tbl) tbl.style.display = 'table';
    updateKPIs(orders);

    let rowsHTML = '';
    orders.forEach(order => {
        let typeClass = (order.type||'').includes('محلي') ? 'badge-dinein' : (order.type||'').includes('سفري') ? 'badge-takeout' : 'badge-delivery';
        let methodClass = (order.paymentMethod||'').includes('كاش') ? 'badge-cash' : 'badge-card';
        const itemsCount = Array.isArray(order.items) ? order.items.length : (order.itemsCount || 0);

        rowsHTML += `
            <tr>
                <td><strong>${order.orderId}</strong></td>
                <td style="color:var(--text-secondary); font-size:12px;">${order.date || order.dateStr || ''}</td>
                <td><span class="badge ${typeClass}">${order.type || ''}</span></td>
                <td><span class="badge ${methodClass}"><i class="ph ph-${(order.paymentMethod||'').includes('كاش') ? 'money' : 'credit-card'}"></i> ${order.paymentMethod || ''}</span></td>
                <td>${itemsCount} أصناف</td>
                <td style="color:var(--accent-green); font-weight:800;">${Number(order.total).toFixed(2)} ر.س</td>
                <td style="text-align:center;">
                    <button class="sales-action-btn" title="طباعة الفاتورة مرة أخرى"><i class="ph ph-printer"></i></button>
                    <button class="sales-action-btn" title="تفاصيل الطلب" style="color:var(--accent-blue)"><i class="ph ph-eye"></i></button>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = rowsHTML;
}

function updateKPIs(orders) {
    let totalRev = 0;
    let cashRev = 0;
    let cardRev = 0;
    let orderCount = orders.length;

    orders.forEach(o => {
        totalRev += o.total;
        if ((o.paymentMethod||'').includes('كاش')) {
            cashRev += o.total;
        } else {
            cardRev += o.total;
        }
    });

    const el = (id) => document.getElementById(id);
    if(el('kpi-total-revenue')) el('kpi-total-revenue').innerText = totalRev.toFixed(2) + ' ر.س';
    if(el('kpi-total-orders')) el('kpi-total-orders').innerText = orderCount;
    if(el('kpi-cash-revenue')) el('kpi-cash-revenue').innerText = cashRev.toFixed(2) + ' ر.س';
    if(el('kpi-card-revenue')) el('kpi-card-revenue').innerText = cardRev.toFixed(2) + ' ر.س';
}

async function clearSales() {
    if(confirm('هل أنت متأكد من مسح جميع سجلات المبيعات الحالية؟ لا يمكن التراجع!')) {
        // Clear orders from JSON DB
        const fs = require('fs');
        const path = require('path');
        const dbPath = require('electron').ipcRenderer.sendSync('get-db-path');
        try {
            const raw = fs.readFileSync(dbPath, 'utf8');
            const db = JSON.parse(raw);
            db.orders = [];
            fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        } catch(e) { console.error(e); }
        await loadSales();
    }
}
