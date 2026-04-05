const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', async () => {
    await loadSales();

    if (typeof window.registerPosDatabaseRefresh === 'function') {
        window.registerPosDatabaseRefresh(() => loadSales());
    }

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
    const xf = (n) => (window.HashCurrency ? HashCurrency.format(n) : Number(n).toFixed(2) + ' ر.س');
    // Read from SQLite JSON database via IPC
    let orders = await ipcRenderer.invoke('db-get-orders');
    if (!orders) orders = [];

    const fDate = document.getElementById('filter-date');
    if(fDate && fDate.value) {
        let selectedDate = new Date(fDate.value);
        let selectedStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
        let selectedEnd = new Date(selectedStart.getTime());
        selectedEnd.setDate(selectedEnd.getDate() + 1);
        orders = orders.filter(o => {
            let d = new Date(o.timestamp || o.dateStr || o.date);
            return d >= selectedStart && d < selectedEnd;
        });
    }

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
        let typeClass = (order.type||'').includes('محلي') ? 'badge-dinein' : 'badge-takeout';
        let methodClass = (order.paymentMethod||'').includes('كاش') ? 'badge-cash' : 'badge-card';
        const itemsCount = Array.isArray(order.items) ? order.items.length : (order.itemsCount || 0);

        rowsHTML += `
            <tr>
                <td><strong>${order.orderId}</strong></td>
                <td style="color:var(--text-secondary); font-size:12px;">${order.date || order.dateStr || ''}</td>
                <td><span class="badge ${typeClass}">${order.type || ''}</span></td>
                <td><span class="badge ${methodClass}"><i class="ph ph-${(order.paymentMethod||'').includes('كاش') ? 'money' : 'credit-card'}"></i> ${order.paymentMethod || ''}</span></td>
                <td>${itemsCount} أصناف</td>
                <td style="color:var(--accent-green); font-weight:800;">${xf(order.total)}</td>
                <td style="text-align:center;">
                    <button class="sales-action-btn" title="طباعة الفاتورة مرة أخرى" onclick="reprintOrder('${order.orderId}')"><i class="ph ph-printer"></i></button>
                    <button class="sales-action-btn" title="عرض الفاتورة HTML" style="color:#8b5cf6" onclick="viewInvoiceHTML('${order.orderId}')"><i class="ph ph-file-html"></i></button>
                    <button class="sales-action-btn" title="تفاصيل الطلب" style="color:var(--accent-blue)"><i class="ph ph-eye"></i></button>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = rowsHTML;
}

function updateKPIs(orders) {
    const xf = (n) => (window.HashCurrency ? HashCurrency.format(n) : Number(n).toFixed(2) + ' ر.س');
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
    if(el('kpi-total-revenue')) el('kpi-total-revenue').innerText = xf(totalRev);
    if(el('kpi-total-orders')) el('kpi-total-orders').innerText = orderCount;
    if(el('kpi-cash-revenue')) el('kpi-cash-revenue').innerText = xf(cashRev);
    if(el('kpi-card-revenue')) el('kpi-card-revenue').innerText = xf(cardRev);
}

async function clearSales() {
    if(confirm('هل أنت متأكد من مسح جميع سجلات المبيعات الحالية؟ لا يمكن التراجع!')) {
        try {
            const db = await window.dbRead();
            db.orders = [];
            await window.dbWrite(db);
        } catch(e) { console.error(e); }
        await loadSales();
    }
}

// Open invoices folder
function openInvoicesFolder() {
    const { ipcRenderer } = require('electron');
    const path = require('path');
    const invoicesDir = path.join(__dirname, 'invoices');
    
    // Check if directory exists
    const fs = require('fs');
    if (!fs.existsSync(invoicesDir)) {
        alert('لا توجد فواتير محفوظة بعد. قم بإتمام عملية بيع أولاً.');
        return;
    }
    
    // Open folder in file explorer
    ipcRenderer.invoke('open-folder', invoicesDir).catch(err => {
        console.error('Failed to open folder:', err);
        // Fallback: show message with folder path
        alert(`مجلد الفواتير موجود في:\n${invoicesDir}`);
    });
}

// View specific invoice HTML file
async function viewInvoiceHTML(orderId) {
    const fs = require('fs');
    const path = require('path');
    const { ipcRenderer } = require('electron');
    
    const invoicesDir = path.join(__dirname, 'invoices');
    
    if (!fs.existsSync(invoicesDir)) {
        alert('لا توجد فواتير محفوظة بعد.');
        return;
    }
    
    // Find invoice file for this order ID
    const files = fs.readdirSync(invoicesDir);
    const invoiceFile = files.find(f => f.includes(orderId.replace('#', '')) && f.endsWith('.html'));
    
    if (!invoiceFile) {
        alert(`لم يتم العثور على فاتورة HTML للطلب ${orderId}`);
        return;
    }
    
    const filePath = path.join(invoicesDir, invoiceFile);
    
    // Open the HTML file in default browser
    try {
        await ipcRenderer.invoke('open-folder', filePath);
    } catch(e) {
        console.error('Failed to open invoice:', e);
        alert(`مسار الفاتورة:\n${filePath}`);
    }
}

// Reprint order
async function reprintOrder(orderId) {
    const { ipcRenderer } = require('electron');
    
    // Get orders from database
    const orders = await ipcRenderer.invoke('db-get-orders');
    const order = orders.find(o => o.orderId === orderId);
    
    if (!order) {
        alert('لم يتم العثور على الطلب!');
        return;
    }
    
    if (confirm(`هل تريد إعادة طباعة فاتورة ${orderId}؟`)) {
        // Trigger print via IPC - you can implement this based on your printing logic
        alert('جاري إرسال أمر الطباعة...');
        // You can call the same print logic used in pos.js here
    }
}
