document.addEventListener('DOMContentLoaded', async () => {

    const xf = (n) => (window.HashCurrency ? HashCurrency.format(n) : Number(n).toFixed(2) + ' ر.س');
    
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
        try {
            let query = searchInput.value.trim();
            if(!query) return alert('الرجاء إدخال رقم الطلب أولاً');

            // Normalize the search text to handle 'ORD-' or '#' if user typed it
            query = query.replace(/^#/, '').replace(/^ord-?/i, '').trim();

            const db = await window.dbRead();
            const orders = (db.orders || []);
            
            const found = orders.find((o) => {
                const oid = String(o.orderId || o.id || '').replace(/^#/, '').replace(/^ord-?/i, '').trim();
                return oid.toLowerCase() === query.toLowerCase();
            });

            if(found) {
                currentFoundOrder = found;
                resId.innerText = 'رقم الطلب: ' + (found.orderId || found.id || 'غير معروف');
                resDate.innerText = found.date || found.dateStr || new Date().toLocaleDateString('ar-SA');
                resTotal.innerText = xf(found.total || found.grandTotal || 0);
                resMethod.innerText = found.paymentMethod || 'نقدي';
                resType.innerText = found.type || found.orderType || 'محلي';
                
                resultCard.style.display = 'flex';
                resultCard.style.flexDirection = 'column';
                resultCard.style.width = '100%';
                resultCard.classList.add('active');

                // Clean up any old buttons or messages
                const oldMsg = document.getElementById('already-returned-msg');
                if (oldMsg) oldMsg.remove();
                
                // Force destruction of older button to avoid duplicates
                let oldBtn = document.getElementById('btn-process-return');
                if(oldBtn) oldBtn.remove();

                if (found.isReturned) {
                    const msg = document.createElement('div');
                    msg.id = 'already-returned-msg';
                    msg.innerHTML = '<i class="ph-fill ph-warning-circle"></i> هذه الفاتورة تم استرجاعها وإلغاؤها مسبقاً!';
                    msg.style.padding = '15px';
                    msg.style.background = 'rgba(245, 158, 11, 0.1)';
                    msg.style.color = 'var(--accent-orange)';
                    msg.style.borderRadius = 'var(--border-radius-md)';
                    msg.style.textAlign = 'center';
                    msg.style.fontWeight = 'bold';
                    msg.style.marginTop = '15px';
                    resultCard.appendChild(msg);
                } else {
                    // Forcefully create a new button with heavy inline styles to bypass ANY css conflicts
                    const newBtn = document.createElement('button');
                    newBtn.id = 'btn-process-return';
                    newBtn.innerHTML = '<i class="ph-fill ph-warning-circle"></i> إرجاع الأموال وإلغاء الطلب نهائياً';
                    newBtn.style.cssText = `
                        width: 100%;
                        padding: 15px;
                        background: #dc2626; /* bright red */
                        color: white;
                        border: 2px solid #b91c1c;
                        border-radius: 8px;
                        font-family: inherit;
                        font-size: 18px;
                        font-weight: 800;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 10px;
                        margin-top: 20px;
                        box-shadow: 0 4px 15px rgba(220, 38, 38, 0.4);
                        transition: all 0.2s;
                    `;
                    
                    newBtn.onmouseover = () => { newBtn.style.transform = 'translateY(-2px)'; };
                    newBtn.onmouseout = () => { newBtn.style.transform = 'translateY(0)'; };
                    
                    // Attach the event
                    newBtn.addEventListener('click', processReturnAction);
                    
                    // Directly append it to the result card!
                    resultCard.appendChild(newBtn);
                }

            } else {
                resultCard.style.display = 'none';
                resultCard.classList.remove('active');
                currentFoundOrder = null;
                alert('لم يتم العثور على أي فاتورة مبيعات مسجلة بهذا الرقم. يرجى التأكد من الرقم والمحاولة مرة أخرى.');
            }
        } catch(e) {
            console.error("Search Error:", e);
            alert("حدث خطأ أثناء البحث عن الفاتورة.");
        }
    });

    // Support 'Enter' key press down on input
    searchInput.addEventListener('keydown', (e) => {
        if(e.key === 'Enter') {
            btnSearch.click();
        }
    });

    // --- Process Return Logic ---
    async function processReturnAction() {
        const currentBtn = document.getElementById('btn-process-return');
        if(!currentFoundOrder) return;

        if(!confirm('تأكيد عملية الاسترجاع؟ سيتم خصم المبلغ من المبيعات الأصلية، وإرجاع الأصناف لسجل المطبخ.')) return;

        const originalText = currentBtn.innerHTML;
        currentBtn.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin"></i> جاري إرجاع المبلغ...';
        currentBtn.style.pointerEvents = 'none';

        try {
            await window.dbUpdate(db => {
                // 1. Flag as returned instead of deleting
                const ord = (db.orders || []).find(o => (o.orderId === currentFoundOrder.orderId) || (o.id === currentFoundOrder.id));
                if (ord) {
                    ord.isReturned = true;
                }

                // 2. Add to returns ledger
                if(!db.returns) db.returns = [];
                const now = new Date();
                db.returns.push({
                    id: 'RET-' + now.getTime(),
                    origId: currentFoundOrder.orderId || currentFoundOrder.id,
                    returnTime: now.toLocaleDateString('ar-SA') + ' ' + now.toLocaleTimeString('ar-SA'),
                    timestamp: now.getTime(),
                    date: now.toISOString().split('T')[0],
                    amount: currentFoundOrder.total || currentFoundOrder.grandTotal || 0,
                    method: currentFoundOrder.paymentMethod,
                    splitCash: currentFoundOrder.splitCash,
                    splitNetwork: currentFoundOrder.splitNetwork,
                    emp: 'المدير / الكاشير',
                });

                // 3. Auto-Return to Kitchen Production Log
                if (currentFoundOrder.items && currentFoundOrder.items.length > 0) {
                    if (!db.kitchenTx) db.kitchenTx = [];
                    if (!db.kitchenStock) db.kitchenStock = [];

                    currentFoundOrder.items.forEach(item => {
                        const itemName = item.name || item.nameAr || "صنف مسترجع";
                        const qty = Number(item.qty) || 1;
                        
                        db.kitchenTx.push({
                            id: 'RET-' + Math.floor(Math.random() * 100000),
                            type: 'receive', 
                            itemName: itemName,
                            qty: qty,
                            notes: "مرتجع من المبيعات - فاتورة #" + (currentFoundOrder.orderId || currentFoundOrder.id),
                            date: new Date().toISOString(),
                            user: "الكاشير (آلي)"
                        });

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
            
            resultCard.style.display = 'none';
            resultCard.classList.remove('active');
            currentFoundOrder = null;
            searchInput.value = '';

            await loadReturns();

        } catch(e) {
            console.error('Return process error', e);
            alert('حدث خطأ أثناء معالجة الاسترجاع.');
            currentBtn.innerHTML = originalText;
            currentBtn.style.pointerEvents = 'auto';
        }
    }

    if (btnProcess) {
        btnProcess.addEventListener('click', processReturnAction);
    }

    // --- Load Returns Historical Data ---
    async function loadReturns() {
        const db = await window.dbRead();
        const returns = (db.returns || []).slice().sort((a,b) => b.timestamp - a.timestamp);
        
        const tbody = document.getElementById('returns-tbody');
        const emptyState = document.getElementById('empty-returns');
        const tableObj = document.querySelector('.ret-table');

        let totalVal = 0;
        returns.forEach(r => totalVal += r.amount);

        const el = (id) => document.getElementById(id);
        if(el('kpi-total-returns')) el('kpi-total-returns').innerText = xf(totalVal);
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
                    <td style="color:var(--accent-red); font-weight:800;">${xf(r.amount)}</td>
                    <td><span style="color:var(--text-secondary)"><i class="ph ph-money"></i> ${r.method}</span></td>
                    <td>${r.emp || ''}</td>
                    <td><span class="badge-returned">مسترجع</span></td>
                </tr>
            `);
        });
    }

    await loadReturns();

    // --- Auto Fill from URL ---
    const urlParams = new URLSearchParams(window.location.search);
    const urlOrderId = urlParams.get('orderId');
    if (urlOrderId) {
        searchInput.value = urlOrderId;
        btnSearch.click();
    }
});
