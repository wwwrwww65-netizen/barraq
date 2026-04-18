const { ipcRenderer } = require('electron');

let allSalesOrders = [];
let filteredSalesOrders = [];
const SALES_PAGE_SIZE = 25;
let salesCurrentPage = 1;
let _salesSearchTimer;

document.addEventListener('DOMContentLoaded', async () => {
    await loadSales();

    if (typeof window.registerPosDatabaseRefresh === 'function') {
        window.registerPosDatabaseRefresh(() => loadSales());
    }

    const searchInput = document.getElementById('sales-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(_salesSearchTimer);
            _salesSearchTimer = setTimeout(() => {
                salesCurrentPage = 1;
                renderSalesTable(e.target.value.toLowerCase().trim());
            }, 300);
        });
    }

    const fDate = document.getElementById('filter-date');
    if(fDate) {
        fDate.addEventListener('change', () => {
             salesCurrentPage = 1;
             loadSales();
        });
    }
});

async function loadSales() {
    // Read from SQLite JSON database via IPC
    allSalesOrders = await ipcRenderer.invoke('db-get-orders');
    if (!allSalesOrders) allSalesOrders = [];

    const fDate = document.getElementById('filter-date');
    if(fDate && fDate.value) {
        let selectedDate = new Date(fDate.value);
        let selectedStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
        let selectedEnd = new Date(selectedStart.getTime());
        selectedEnd.setDate(selectedEnd.getDate() + 1);
        allSalesOrders = allSalesOrders.filter(o => {
            let d = new Date(o.timestamp || o.dateStr || o.date);
            return d >= selectedStart && d < selectedEnd;
        });
    }

    // Sort descending by timestamp
    allSalesOrders.sort((a, b) => b.timestamp - a.timestamp);
    updateKPIs(allSalesOrders);

    const searchStr = document.getElementById('sales-search')?.value.toLowerCase().trim() || '';
    renderSalesTable(searchStr);
}

function renderSalesTable(query = '') {
    const tbody = document.getElementById('sales-tbody');
    const emptyState = document.getElementById('empty-state');
    const tbl = document.querySelector('.sales-table');
    if (!tbody) return;

    filteredSalesOrders = allSalesOrders.filter(o => {
        if(!query) return true;
        const text = (o.orderId + " " + (o.date || o.dateStr || "") + " " + (o.type || "") + " " + (o.paymentMethod || "")).toLowerCase();
        return text.includes(query);
    });

    if (filteredSalesOrders.length === 0) {
        tbody.innerHTML = '';
        if(emptyState) emptyState.style.display = 'block';
        if(tbl) tbl.style.display = 'none';
        _renderSalesPagination(0, 0, 0, tbody);
        return;
    }

    if(emptyState) emptyState.style.display = 'none';
    if(tbl) tbl.style.display = 'table';

    const total = filteredSalesOrders.length;
    const totalPages = Math.max(1, Math.ceil(total / SALES_PAGE_SIZE));
    if (salesCurrentPage > totalPages) salesCurrentPage = totalPages;

    const start = (salesCurrentPage - 1) * SALES_PAGE_SIZE;
    const pageItems = filteredSalesOrders.slice(start, start + SALES_PAGE_SIZE);

    const xf = (n) => (window.HashCurrency ? HashCurrency.format(n) : Number(n).toFixed(2) + ' ر.س');
    const fragment = document.createDocumentFragment();

    pageItems.forEach(order => {
        let typeClass = (order.type||'').includes('محلي') ? 'badge-dinein' : 'badge-takeout';
        let methodClass = (order.paymentMethod||'').includes('كاش') ? 'badge-cash' : 'badge-card';
        const itemsCount = Array.isArray(order.items) ? order.items.length : (order.itemsCount || 0);

        const tr = document.createElement('tr');
        tr.innerHTML = `
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
        `;
        fragment.appendChild(tr);
    });
    
    tbody.innerHTML = '';
    tbody.appendChild(fragment);
    
    _renderSalesPagination(salesCurrentPage, totalPages, total, tbody);
}

function _renderSalesPagination(page, totalPages, total, tbody) {
    let bar = document.getElementById('sales-pagination-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'sales-pagination-bar';
        bar.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;padding:16px 0;flex-wrap:wrap;';
        const tbl = document.querySelector('.sales-table');
        if(tbl) tbl.parentNode.insertBefore(bar, tbl.nextSibling);
    }
    
    if (totalPages <= 1) { bar.innerHTML = ''; return; }

    const start = (page - 1) * SALES_PAGE_SIZE + 1;
    const end   = Math.min(page * SALES_PAGE_SIZE, total);
    const bs = (active) => `background:${active?'var(--accent-blue)':'var(--bg-card)'};color:${active?'#fff':'var(--text-secondary)'};border:1px solid ${active?'var(--accent-blue)':'var(--border-color)'};border-radius:8px;padding:6px 14px;cursor:pointer;font-family:inherit;font-weight:700;font-size:13px;transition:background-color 0.15s ease;`;

    let html = `<span style="color:var(--text-muted);font-size:13px">صفحة ${page}/${totalPages} (مبيعة ${start}–${end} من ${total})</span>`;
    html += `<button style="${bs(false)}" id="sp-first" ${page===1?'disabled':''}>«</button>`;
    html += `<button style="${bs(false)}" id="sp-prev"  ${page===1?'disabled':''}>‹</button>`;
    for (let i = Math.max(1, page-2); i <= Math.min(totalPages, page+2); i++)
        html += `<button style="${bs(i===page)}" class="sp-num" data-p="${i}">${i}</button>`;
    html += `<button style="${bs(false)}" id="sp-next" ${page===totalPages?'disabled':''}>›</button>`;
    html += `<button style="${bs(false)}" id="sp-last" ${page===totalPages?'disabled':''}>»</button>`;

    bar.innerHTML = html;
    bar.querySelector('#sp-first')?.addEventListener('click', () => { salesCurrentPage = 1; renderSalesTable(document.getElementById('sales-search')?.value.toLowerCase().trim()||''); });
    bar.querySelector('#sp-prev' )?.addEventListener('click', () => { salesCurrentPage--; renderSalesTable(document.getElementById('sales-search')?.value.toLowerCase().trim()||''); });
    bar.querySelector('#sp-next' )?.addEventListener('click', () => { salesCurrentPage++; renderSalesTable(document.getElementById('sales-search')?.value.toLowerCase().trim()||''); });
    bar.querySelector('#sp-last' )?.addEventListener('click', () => { salesCurrentPage = totalPages; renderSalesTable(document.getElementById('sales-search')?.value.toLowerCase().trim()||''); });
    bar.querySelectorAll('.sp-num').forEach(b =>
        b.addEventListener('click', () => { salesCurrentPage = Number(b.dataset.p); renderSalesTable(document.getElementById('sales-search')?.value.toLowerCase().trim()||''); })
    );
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
