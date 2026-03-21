document.addEventListener('DOMContentLoaded', () => {
    loadSales();

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

function loadSales() {
    const ordersStr = localStorage.getItem('pos_orders');
    const orders = ordersStr ? JSON.parse(ordersStr) : [];
    
    // Sort descending by timestamp
    orders.sort((a, b) => b.timestamp - a.timestamp);

    const tbody = document.getElementById('sales-tbody');
    const emptyState = document.getElementById('empty-state');
    
    if (orders.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        document.querySelector('.sales-table').style.display = 'none';
        updateKPIs([]);
        return;
    }

    emptyState.style.display = 'none';
    document.querySelector('.sales-table').style.display = 'table';
    updateKPIs(orders);

    let rowsHTML = '';
    orders.forEach(order => {
        // Badges mapping
        let typeClass = order.type.includes('محلي') ? 'badge-dinein' : order.type.includes('سفري') ? 'badge-takeout' : 'badge-delivery';
        let methodClass = order.paymentMethod.includes('كاش') ? 'badge-cash' : 'badge-card';

        rowsHTML += `
            <tr>
                <td><strong>${order.orderId}</strong></td>
                <td style="color:var(--text-secondary); font-size:12px;">${order.date}</td>
                <td><span class="badge ${typeClass}">${order.type}</span></td>
                <td><span class="badge ${methodClass}"><i class="ph ph-${order.paymentMethod.includes('كاش') ? 'money' : 'credit-card'}"></i> ${order.paymentMethod}</span></td>
                <td>${order.items} أصناف</td>
                <td style="color:var(--accent-green); font-weight:800;">${order.total.toFixed(2)} ر.س</td>
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
        if (o.paymentMethod.includes('كاش')) {
            cashRev += o.total;
        } else {
            cardRev += o.total;
        }
    });

    document.getElementById('kpi-total-revenue').innerText = totalRev.toFixed(2) + ' ر.س';
    document.getElementById('kpi-total-orders').innerText = orderCount;
    document.getElementById('kpi-cash-revenue').innerText = cashRev.toFixed(2) + ' ر.س';
    document.getElementById('kpi-card-revenue').innerText = cardRev.toFixed(2) + ' ر.س';
}

function clearSales() {
    if(confirm('هل أنت متأكد من مسح جميع سجلات المبيعات الحالية؟ لا يمكن التراجع!')) {
        localStorage.removeItem('pos_orders');
        loadSales();
    }
}
