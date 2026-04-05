const { ipcRenderer } = require('electron');

async function saveDB(db) {
    await window.dbWrite(db);
    try { ipcRenderer.send('notify-db-changed'); } catch(e) {}
}

document.addEventListener('DOMContentLoaded', async () => {

    const xf = (n) => (window.HashCurrency ? HashCurrency.format(n) : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ر.س');

    let db = await window.dbRead();
    if(!db.purchases) db.purchases = [];
    if(!db.suppliers) db.suppliers = [];
    if(!db.inventory) db.inventory = [];
    if(!db.inventoryTx) db.inventoryTx = [];

    let purchases = db.purchases;
    let suppliers = db.suppliers;
    let inventory = db.inventory;
    let inventoryTx = db.inventoryTx;

    function isThisMonth(dateStr) {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;
        const now = new Date();
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }

    // --- KPIs ---
    function renderKPIs() {
        const thisMonth = purchases.filter(p => isThisMonth(p.date));
        document.getElementById('kpi-count').innerText = thisMonth.length + ' فاتورة';

        const paid = purchases.filter(p => ['cash', 'bank'].includes(p.payMethod)).reduce((s, p) => s + p.total, 0);
        document.getElementById('kpi-paid').innerText = xf(paid);

        const credit = purchases.filter(p => p.payMethod === 'credit').reduce((s, p) => s + p.total, 0);
        document.getElementById('kpi-credit').innerText = xf(credit);

        // Top Supplier
        const supCounts = {};
        purchases.forEach(p => supCounts[p.supName] = (supCounts[p.supName] || 0) + 1);
        let topSup = '-'; let max = 0;
        for(let s in supCounts) {
            if(supCounts[s] > max) { max = supCounts[s]; topSup = s; }
        }
        document.getElementById('kpi-top-sup').innerText = topSup;
    }

    // --- Table Render ---
    function renderTable() {
        const tbody = document.getElementById('pur-tbody');
        if(!tbody) return;
        
        tbody.innerHTML = '';
        const search = document.getElementById('search-inv')?.value.toLowerCase() || '';

        const filtered = purchases.filter(p =>
            String(p.id || '').toLowerCase().includes(search) ||
            String(p.supName || '').toLowerCase().includes(search) ||
            String(p.ref || '').toLowerCase().includes(search)
        );
        
        // Sort descending
        filtered.sort((a,b) => new Date(b.date) - new Date(a.date));

        if(filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#666">لا توجد فواتير.</td></tr>';
            return;
        }

        filtered.forEach(p => {
            let pLabel = p.payMethod === 'cash' ? 'كاش من الخزينة' : (p.payMethod === 'bank' ? 'حوالة بنكية' : 'دفع آجل (ذمم)');
            let pColor = p.payMethod === 'credit' ? 'color:var(--accent-red)' : 'color:var(--accent-green)';
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${p.id}</strong> <div style="font-size:11px; color:var(--text-muted)">مرجع: ${p.ref}</div></td>
                <td>${p.supName}</td>
                <td>${p.date}</td>
                <td style="font-weight:700;">${xf(p.total)}</td>
                <td style="${pColor}">${pLabel}</td>
                <td><span class="inv-tag tag-safe"><i class="ph-fill ph-check-circle"></i> مُورد للمستودع</span></td>
                <td>
                    <div class="tbl-actions">
                        <button class="print-pur" data-id="${p.id}" title="طباعة فاتورة المشتريات"><i class="ph ph-printer"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Attach Print Handlers
        document.querySelectorAll('.print-pur').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const purId = e.currentTarget.dataset.id;
                const activePur = purchases.find(x => x.id === purId);
                if(activePur) printPurchaseInvoice(activePur);
            });
        });
    }

    document.getElementById('search-inv')?.addEventListener('input', renderTable);
    
    renderKPIs();
    renderTable();

    if (typeof window.registerPosDatabaseRefresh === 'function') {
        window.registerPosDatabaseRefresh(async () => {
            db = await window.dbRead();
            purchases = db.purchases || [];
            suppliers = db.suppliers || [];
            inventory = db.inventory || [];
            inventoryTx = db.inventoryTx || [];
            renderKPIs();
            renderTable();
            console.log('[Sync] 🔄 Purchases reloaded from network update.');
        });
    }

    // --- Modal Logic ---
    const modal = document.getElementById('invoiceModal');
    const form = document.getElementById('form-invoice');
    const itemsContainer = document.getElementById('items-container');
    const tpl = document.getElementById('item-row-tpl');

    // Setup Modals
    document.getElementById('btn-new-invoice').addEventListener('click', () => {
        const supSel = document.getElementById('inv-supplier');
        supSel.innerHTML = suppliers.filter(s => s.active).map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        if (!supSel.options.length) {
            alert('لا يوجد مورد نشط. أضف مورداً من صفحة «دليل الموردين» أو فعّل مورداً موقوفاً.');
            return;
        }

        document.getElementById('inv-date').valueAsDate = new Date();

        itemsContainer.innerHTML = '';
        addRow();

        calculateTotals();
        modal.classList.add('active');
    });

    document.querySelectorAll('.btn-close-modal').forEach(b => b.addEventListener('click', () => {
        modal.classList.remove('active');
        form.reset();
    }));

    // Row Logic
    function addRow() {
        const clone = tpl.content.cloneNode(true);
        const row = clone.querySelector('.item-row');
        
        // Fill SKUs mapping all available raw items
        const skuSel = row.querySelector('.item-sku');
        // Let's get unique items from inventory ignoring warehouse duplicates for simplicity, just name and category
        const uniqueSkus = [];
        const seenNames = new Set();
        inventory.forEach(i => {
            if(!seenNames.has(i.name)) {
                seenNames.add(i.name);
                uniqueSkus.push(i);
            }
        });

        // Add "New Item" logic ? For now just pick existing
        if (!uniqueSkus.length) {
            skuSel.innerHTML = '<option value="">— لا توجد أصناف في المخزون —</option>';
        } else {
            skuSel.innerHTML = uniqueSkus.map(i => `<option value="${i.sku}" data-name="${i.name}">${i.name} (${i.unit})</option>`).join('');
        }
        
        // Events
        row.querySelector('.btn-remove-row').addEventListener('click', () => {
            row.remove();
            calculateTotals();
        });
        
        row.querySelector('.item-qty').addEventListener('input', calculateTotals);
        row.querySelector('.item-price').addEventListener('input', calculateTotals);
        
        itemsContainer.appendChild(row);
    }

    document.getElementById('btn-add-row').addEventListener('click', addRow);

    // Helper: read tax rate from settings
    function getSystemTaxRate() {
        try {
            const s = JSON.parse(localStorage.getItem('restaurant_settings') || '{}');
            const rate = parseFloat(s.taxRate);
            return isNaN(rate) ? 15 : rate;
        } catch(e) { return 15; }
    }

    function calculateTotals() {
        let sub = 0;
        document.querySelectorAll('.item-row').forEach(row => {
            const q = Number(row.querySelector('.item-qty').value) || 0;
            const p = Number(row.querySelector('.item-price').value) || 0;
            const t = q * p;
            row.querySelector('.item-row-total').value = t.toFixed(2);
            sub += t;
        });

        const taxPct = getSystemTaxRate(); // dynamic from settings
        const tax = sub * (taxPct / 100);
        const grand = sub + tax;

        document.getElementById('subtotal').innerText = sub.toFixed(2);
        document.getElementById('tax').innerText = tax.toFixed(2);
        document.getElementById('grandtotal').innerText = xf(grand);

        // Update label text to show current rate
        const purTaxLabel = document.getElementById('pur-tax-label');
        if (purTaxLabel) purTaxLabel.innerText = `ضريبة القيمة المضافة (${taxPct}%):`;
    }


    // --- Save Logic (The Core ERP Integration) ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // 1. Gather Items
        const purItems = [];
        const rows = document.querySelectorAll('.item-row');
        if(rows.length === 0) { alert('يجب إضافة صنف واحد على الأقل للفاتورة!'); return; }

        let badLine = false;
        let isQtyMissing = false;
        rows.forEach(r => {
            const skuSelect = r.querySelector('.item-sku');
            const sku = skuSelect.value;
            const opt = skuSelect.options[skuSelect.selectedIndex];
            const name = opt && opt.dataset ? opt.dataset.name : '';
            if (!sku || !name) {
                badLine = true;
                return;
            }
            const qty = Number(r.querySelector('.item-qty').value);
            const price = Number(r.querySelector('.item-price').value);
            if (qty <= 0) isQtyMissing = true;

            purItems.push({ sku, name, qty, price });
        });

        if (badLine) {
            alert('يرجى اختيار صنف صالح في كل السطور. عرّف الأصناف أولاً من صفحة المخازن إن لم تكن موجودة.');
            return;
        }
        if (isQtyMissing) {
            alert('يرجى التحقق من صحة الكميات والأسعار!');
            return;
        }

        // 2. Build Purchase Record
        const supId = document.getElementById('inv-supplier').value;
        const supObj = suppliers.find(s => s.id === supId);
        const pMethod = document.getElementById('inv-payment').value;
        const destWh = document.getElementById('inv-warehouse').value;
        const grandTotalRaw = document.getElementById('grandtotal').innerText;
        const grandTot =
            window.HashCurrency && HashCurrency.parseLoose
                ? HashCurrency.parseLoose(grandTotalRaw) || 0
                : Number(String(grandTotalRaw).replace(/[^\d.]/g, '')) || 0;

        const newPurchase = {
            id: 'PUR-' + Math.floor(Math.random() * 90000 + 10000), // Random 5-digit
            ref: document.getElementById('inv-ref').value,
            supId: supId,
            supName: supObj ? supObj.name : 'مورد غير معروف',
            date: document.getElementById('inv-date').value,
            total: grandTot,
            payMethod: pMethod,
            items: purItems,
            status: 'مستلمة بالمخزن'
        };

        // 3. Integrate with Database

        // A. Add to Suppliers Balance if Credit
        if(pMethod === 'credit' && supObj) {
            supObj.balance += grandTot; // Supplier owes us? No, we owe supplier. So supplier balance increases.
        }

        // B. Add to Inventory and Log Transactions
        purItems.forEach(buyItem => {
            // Find in destWh
            let invItem = inventory.find(i => i.name === buyItem.name && (i.warehouseId || 'main') === destWh);
            
            if(invItem) {
                invItem.qty += buyItem.qty;
                invItem.cost = buyItem.price; // Update cost to latest purchase price
            } else {
                // If the item doesn't exist in this specific warehouse, clone it from the list
                let sourceItem = inventory.find(i => i.name === buyItem.name);
                if(sourceItem) {
                    let clone = { ...sourceItem };
                    clone.warehouseId = destWh;
                    clone.qty = buyItem.qty;
                    clone.cost = buyItem.price;
                    inventory.push(clone);
                }
            }

            // Log the 'in' transaction
            inventoryTx.push({
                id: 'TX-' + Math.floor(Math.random() * 10000),
                type: 'in',
                total: buyItem.qty * buyItem.price,
                date: new Date(newPurchase.date).getTime(),
                fromWh: 'SUPPLIER',
                toWh: destWh,
                sku: buyItem.sku,
                refInvoice: newPurchase.id
            });
        });

        // 4. Save Everything to JSON DB
        purchases.push(newPurchase);
        db.purchases = purchases;
        db.suppliers = suppliers;
        db.inventory = inventory;
        db.inventoryTx = inventoryTx;
        await saveDB(db);

        // 5. Cleanup
        modal.classList.remove('active');
        renderKPIs();
        renderTable();
        
        printPurchaseInvoice(newPurchase); // Auto print!
        alert('تم حفظ فاتورة المشتريات وإدخال البضاعة للمخزن وتحديث الأرصدة بنجاح!');
        form.reset();
    });

    // --- HTML Printer Helper ---
    function printPurchaseInvoice(pur) {
        let itemsHtml = '';
        if(pur.items) {
            pur.items.forEach(it => {
                itemsHtml += `
                <tr>
                    <td>${it.name || it.sku}</td>
                    <td>${it.qty}</td>
                    <td>${it.price.toFixed(2)}</td>
                    <td>${(it.qty * it.price).toFixed(2)}</td>
                </tr>`;
            });
        }

        const methodStr = pur.payMethod === 'cash' ? 'نقداً' : (pur.payMethod === 'bank' ? 'حوالة بنكية' : 'آجل (ذمة)');
        const taxPct = getSystemTaxRate();
        const sub = pur.total / (1 + taxPct / 100);
        const tax = pur.total - sub;

        const w = window.open('', '_blank', 'width=800,height=600');
        w.document.write(`
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <title>فاتورة مشتريات وتوريد بضاعة</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Verdana, sans-serif; padding: 20px; color: #333; }
                    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #334155; padding-bottom: 20px; margin-bottom: 20px; }
                    .header-left h1 { margin: 0 0 5px 0; color: #0f172a; }
                    .header-left p { margin: 0; color: #64748b; }
                    .invoice-info { text-align: right; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; }
                    .invoice-info p { margin: 5px 0; font-size: 14px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th { background: #1e293b; color: white; padding: 12px; text-align: right; }
                    td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
                    .totals { width: 300px; margin-right: auto; margin-top:20px; text-align:left;}
                    .tot-line { display:flex; justify-content:space-between; margin-bottom:8px;}
                    .tot-line.grand { font-size: 18px; font-weight: bold; border-top: 2px solid #333; padding-top:10px;}
                    .footer { margin-top: 50px; font-size: 14px; text-align: center; color: #64748b; border-top: 1px solid #cbd5e1; padding-top: 20px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="header-left">
                        <h1>هـــش HASH للمطاعم</h1>
                        <p>إدارة المشتريات والمخازن</p>
                        <h2 style="margin-top:15px; color:#10b981;">فاتورة مشتريات / توريد بضاعة</h2>
                    </div>
                    <div class="invoice-info">
                        <p><strong>رقم الفاتورة الآلي:</strong> ${pur.id}</p>
                        <p><strong>رقم الفاتورة المرجعي:</strong> ${pur.ref}</p>
                        <p><strong>التاريخ:</strong> ${pur.date}</p>
                        <p><strong>المورد (الشركة):</strong> ${pur.supName}</p>
                        <p><strong>طريقة الدفع:</strong> ${methodStr}</p>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>الصنف (وصف البضاعة الموردة)</th>
                            <th>الكمية</th>
                            <th>سعر الوحدة</th>
                            <th>الإجمالي الفرعي</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>

                <div class="totals" style="margin-right:0; margin-left:auto; text-align:right;">
                    <div class="tot-line"><span>الإجمالي قبل الضريبة:</span> <span>${xf(sub)}</span></div>
                    <div class="tot-line"><span>(${taxPct}%) ضريبة القيمة المضافة:</span> <span>${xf(tax)}</span></div>
                    <div class="tot-line grand"><span>الإجمالي النهائي المستحق:</span> <span>${xf(pur.total)}</span></div>
                </div>

                <div class="footer">
                    <div style="display:flex; justify-content:space-around; margin-bottom:40px;">
                        <span>توقيع المشتري / مسؤول المخزن</span>
                        <span>توقيع ممثل المورد / المحاسب</span>
                    </div>
                    <p>هذا السند يعتبر إثبات توريد معتمد في النظام الإلكتروني.</p>
                </div>
            </body>
            </html>
        `);
        w.document.close();
        w.focus();
        setTimeout(() => { w.print(); w.close(); }, 500);
    }

});
