const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const dbPath = require('electron').ipcRenderer.sendSync('get-db-path');

function loadDB() {
    try { return JSON.parse(fs.readFileSync(dbPath, 'utf8')); }
    catch(e) { return { orders:[], products:[], inventory:[], purchases:[], suppliers:[], inventoryTx:[], returns:[] }; }
}
function saveDB(db) { fs.writeFileSync(dbPath, JSON.stringify(db, null, 2)); }

document.addEventListener('DOMContentLoaded', async () => {
    
    // --- Elements ---
    const searchInput = document.getElementById('return-search-input');
    const btnSearch = document.getElementById('btn-search-order');
    const resultCard = document.getElementById('order-result');
    
    const resId = document.getElementById('res-order-id');
    const resDate = document.getElementById('res-date');
    const resTotal = document.getElementById('res-total');
    const resMethod = document.getElementById('res-method');
    const resType = document.getElementById('res-type');
    
    const btnProcess = document.getElementById('btn-process-return');

    let currentFoundOrder = null;

    // --- Search Logic (from JSON DB via IPC) ---
    btnSearch.addEventListener('click', async () => {
        const query = searchInput.value.trim();
        if(!query) return alert('الرجاء إدخال رقم الطلب أولاً');

        // Fetch from JSON database
        const orders = await ipcRenderer.invoke('db-get-orders');
        
        const found = (orders || []).find(o => o.orderId.toLowerCase() === query.toLowerCase());

        if(found) {
            currentFoundOrder = found;
            resId.innerText = 'رقم الطلب: ' + found.orderId;
            resDate.innerText = found.date || found.dateStr || '';
            resTotal.innerText = Number(found.total).toFixed(2) + ' ر.س';
            resMethod.innerText = found.paymentMethod || '';
            resType.innerText = found.type || '';
            resultCard.classList.add('active');
        } else {
            resultCard.classList.remove('active');
            currentFoundOrder = null;
            alert('لم يتم العثور على أي فاتورة مبيعات مسجلة بهذا الرقم. تأكد من الرقم واعد المحاولة.');
        }
    });

    // --- Process Return Logic ---
    btnProcess.addEventListener('click', async () => {
        if(!currentFoundOrder) return;

        if(!confirm('تأكيد عملية الاسترجاع؟ سيتم خصم المبلغ من المبيعات الأصلية، وإرجاع الأصناف لسجل المطبخ.')) return;

        const originalText = btnProcess.innerHTML;
        btnProcess.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin"></i> جاري إرجاع المبلغ...';
        btnProcess.style.pointerEvents = 'none';

        try {
            await window.dbUpdate(db => {
                // 1. Remove from orders
                db.orders = (db.orders || []).filter(o => o.orderId !== currentFoundOrder.orderId);

                // 2. Add to returns
                if(!db.returns) db.returns = [];
                const now = new Date();
                db.returns.push({
                    origId: currentFoundOrder.orderId,
                    returnTime: now.toLocaleDateString('ar-SA') + ' ' + now.toLocaleTimeString('ar-SA'),
                    timestamp: now.getTime(),
                    amount: currentFoundOrder.total,
                    method: currentFoundOrder.paymentMethod,
                    emp: 'المدير / الكاشير'
                });

                // 3. Auto-Return to Kitchen Production Log
                if (currentFoundOrder.items && currentFoundOrder.items.length > 0) {
                    if (!db.kitchenTx) db.kitchenTx = [];
                    if (!db.kitchenStock) db.kitchenStock = [];

                    currentFoundOrder.items.forEach(item => {
                        const itemName = item.name || item.nameAr || "صنف مسترجع";
                        const qty = Number(item.qty) || 1;
                        
                        // Add an incoming return to kitchen log
                        db.kitchenTx.push({
                            id: 'RET-' + Math.floor(Math.random() * 100000),
                            type: 'receive', 
                            itemName: itemName,
                            qty: qty,
                            notes: "مرتجع من المبيعات - فاتورة #" + currentFoundOrder.orderId,
                            date: new Date().toISOString(),
                            user: "الكاشير (آلي)"
                        });

                        // Add back to kitchen stock
                        const kIdx = db.kitchenStock.findIndex(k => k.name === itemName);
                        if (kIdx !== -1) {
                            db.kitchenStock[kIdx].qty += qty;
                        } else {
                            db.kitchenStock.push({ name: itemName, qty: qty, unit: "وحدة" });
                        }
                    });
                }
            });

            alert('✅ تم استرداد المبلغ وإلغاء عملية الكاشير بنجاح! تم تنبيه المطبخ بالمرتجعات.');
            
            resultCard.classList.remove('active');
            currentFoundOrder = null;
            searchInput.value = '';
            btnProcess.innerHTML = originalText;
            btnProcess.style.pointerEvents = 'auto';

            loadReturns();

        } catch(e) {
            console.error('Return process error', e);
            alert('حدث خطأ أثناء معالجة الاسترجاع.');
            btnProcess.innerHTML = originalText;
            btnProcess.style.pointerEvents = 'auto';
        }
    });

    // --- Load Returns Historical Data ---
    function loadReturns() {
        const db = loadDB();
        const returns = (db.returns || []).slice().sort((a,b) => b.timestamp - a.timestamp);
        
        const tbody = document.getElementById('returns-tbody');
        const emptyState = document.getElementById('empty-returns');
        const tableObj = document.querySelector('.ret-table');

        let totalVal = 0;
        returns.forEach(r => totalVal += r.amount);

        const el = (id) => document.getElementById(id);
        if(el('kpi-total-returns')) el('kpi-total-returns').innerText = totalVal.toFixed(2) + ' ر.س';
        if(el('kpi-return-count')) el('kpi-return-count').innerText = returns.length + ' طلب';
        if(returns.length > 0 && el('kpi-last-return')) {
            el('kpi-last-return').innerHTML = returns[0].returnTime + `<br><span style="font-size:14px;color:var(--text-muted)">(${returns[0].origId})</span>`;
        }

        if(returns.length === 0) {
            if(tableObj) tableObj.style.display = 'none';
            if(emptyState) emptyState.style.display = 'block';
            return;
        }

        if(emptyState) emptyState.style.display = 'none';
        if(tableObj) tableObj.style.display = 'table';
        tbody.innerHTML = '';

        returns.forEach(r => {
            tbody.insertAdjacentHTML('beforeend', `
                <tr>
                    <td><strong>${r.origId}</strong></td>
                    <td style="color:var(--text-secondary); font-size:12px;">${r.returnTime}</td>
                    <td style="color:var(--accent-red); font-weight:800;">${Number(r.amount).toFixed(2)} ر.س</td>
                    <td><span style="color:var(--text-secondary)"><i class="ph ph-money"></i> ${r.method}</span></td>
                    <td>${r.emp || ''}</td>
                    <td><span class="badge-returned">مسترجع</span></td>
                </tr>
            `);
        });
    }

    loadReturns();

    // --- Auto Fill from URL ---
    const urlParams = new URLSearchParams(window.location.search);
    const urlOrderId = urlParams.get('orderId');
    if (urlOrderId) {
        searchInput.value = urlOrderId;
        btnSearch.click();
    }
});
