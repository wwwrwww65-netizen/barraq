document.addEventListener('DOMContentLoaded', () => {

    const tbody = document.querySelector('.inv-table tbody');
    if(!tbody) return;

    // --- State Management ---
    let erpItems = [];
    const storedItems = localStorage.getItem('erp_inventory_items');
    if (storedItems) {
        erpItems = JSON.parse(storedItems);
    } else {
        // Initial Dummy Data
        erpItems = [
            { sku: 'SKU-2001', name: 'أرز بسمتي هندي', category: 'المواد التموينية', unit: 'كيس 40كج', cost: 320, qty: 14, minQty: 15, warehouseId: 'main' },
            { sku: 'SKU-2002', name: 'لحم حري طازج', category: 'اللحوم', unit: 'ذبيحة', cost: 1200, qty: 35, minQty: 10, warehouseId: 'main' },
            { sku: 'SKU-2005', name: 'دجاج مبرد', category: 'الدواجن', unit: 'كرتون', cost: 145, qty: 80, minQty: 30, warehouseId: 'restaurant' },
            { sku: 'SKU-2012', name: 'زيت قلي نباتي', category: 'الزيوت', unit: 'تنكة', cost: 160, qty: 0, minQty: 10, warehouseId: 'restaurant' },
            { sku: 'SKU-2015', name: 'مياه لتر ونصف', category: 'المرطبات', unit: 'كرتون', cost: 12, qty: 50, minQty: 20, warehouseId: 'beverages' }
        ];
        localStorage.setItem('erp_inventory_items', JSON.stringify(erpItems));
    }

    let erpTx = [];
    const storedTx = localStorage.getItem('erp_inventory_tx');
    if (storedTx) {
        erpTx = JSON.parse(storedTx);
    } else {
        erpTx = [
            { id: 'TX01', type: 'in', total: 24500, date: Date.now() - 86400000 },
            { id: 'TX02', type: 'out', total: 18350, date: Date.now() - 400000 }
        ];
        localStorage.setItem('erp_inventory_tx', JSON.stringify(erpTx));
    }

    // --- Render Functions ---
    let currentWH = 'main';

    function renderKPIs() {
        // Filter variables by currentWH
        const currentItems = erpItems.filter(i => (i.warehouseId || 'main') === currentWH);
        
        const totalVal = currentItems.reduce((sum, it) => sum + (it.qty * it.cost), 0);
        // We will just do global IN/OUT for KPIs, or filter if we add warehouseId to Txs. Let's keep Txs global for now.
        const inVal = erpTx.filter(t => t.type === 'in').reduce((sum, t) => sum + t.total, 0);
        const outVal = erpTx.filter(t => t.type === 'out').reduce((sum, t) => sum + t.total, 0);
        const lowStockCount = currentItems.filter(it => it.qty <= it.minQty).length;

        const kpis = document.querySelectorAll('.kpi-value');
        if (kpis.length >= 4) {
            kpis[0].innerHTML = `${totalVal.toLocaleString()}<span class="currency">ر.س</span>`;
            kpis[1].innerHTML = `${inVal.toLocaleString()}<span class="currency">ر.س</span>`;
            kpis[2].innerHTML = `${outVal.toLocaleString()}<span class="currency">ر.س</span>`;
            kpis[3].innerHTML = `${lowStockCount} <span class="currency" style="font-size:14px">أصناف</span>`;
        }
    }

    function renderTable() {
        tbody.innerHTML = '';
        const currentItems = erpItems.filter(i => (i.warehouseId || 'main') === currentWH);

        if(currentItems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:20px;">لا توجد أصناف في هذا المخزن</td></tr>';
            return;
        }

        currentItems.forEach(item => {
            let rowClass = '';
            let statusTag = '';

            if (item.qty === 0) {
                rowClass = 'stock-row-danger';
                statusTag = '<span class="inv-tag tag-empty"><i class="ph-fill ph-x-circle"></i> رصيد صفري</span>';
            } else if (item.qty <= item.minQty) {
                rowClass = 'stock-row-warning';
                statusTag = '<span class="inv-tag tag-low"><i class="ph-fill ph-warning"></i> تحت الحد الأدنى</span>';
            } else {
                statusTag = '<span class="inv-tag tag-safe">رصيد كافي</span>';
            }

            const tr = document.createElement('tr');
            if (rowClass) tr.className = rowClass;

            tr.innerHTML = `
                <td><span class="badge-barcode">${item.sku}</span></td>
                <td><strong>${item.name}</strong></td>
                <td>${item.category}</td>
                <td>${item.unit}</td>
                <td>${item.cost.toFixed(2)} ر.س</td>
                <td class="qty-col ${item.qty === 0 ? 'empty' : (item.qty <= item.minQty ? 'low' : 'safe')}">${item.qty}</td>
                <td>${(item.qty * item.cost).toLocaleString()} ر.س</td>
                <td>${statusTag}</td>
                <td>
                    <div class="tbl-actions">
                        <button class="action-btn" title="تعديل"><i class="ph ph-pencil-simple"></i></button>
                        <button class="action-btn text-green btn-quick-in" data-sku="${item.sku}" title="إصدار استلام"><i class="ph ph-plus-circle"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Re-attach quick receive
        document.querySelectorAll('.btn-quick-in').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const sku = e.currentTarget.dataset.sku;
                document.getElementById('tx-sku').value = sku;
                document.getElementById('tx-type').value = 'in';
                openModal('txModal');
            });
        });
    }

    renderTable();
    renderKPIs();

    // --- Warehouse Tabs Logic ---
    const whTabs = document.querySelectorAll('.warehouse-tab');
    whTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            whTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentWH = tab.dataset.wh || 'main';
            renderTable();
            renderKPIs();
        });
    });


    // --- Modals Logic ---
    const modals = document.querySelectorAll('.modal-overlay');
    function openModal(id) {
        document.getElementById(id).classList.add('active');
    }
    function closeModal(id) {
        document.getElementById(id).classList.remove('active');
    }

    // Attach open buttons
    const btnAddProduct = document.querySelector('.bg-blue'); // تعريف منتج جديد
    if(btnAddProduct) btnAddProduct.addEventListener('click', () => openModal('itemModal'));

    const btnReceive = document.querySelector('.bg-green'); // استلام
    if(btnReceive) btnReceive.addEventListener('click', () => {
        document.getElementById('tx-type').value = 'in';
        openModal('txModal');
    });

    const btnIssue = document.querySelector('.bg-red'); // صرف
    if(btnIssue) btnIssue.addEventListener('click', () => {
        document.getElementById('tx-type').value = 'out';
        openModal('txModal');
    });

    // Attach close buttons
    document.querySelectorAll('.btn-cancel-modal').forEach(b => b.addEventListener('click', (e) => {
        closeModal(e.currentTarget.closest('.modal-overlay').id);
    }));

    // Filter Low Stock
    const btnFilterLow = document.getElementById('btn-filter-low');
    if(btnFilterLow) {
        btnFilterLow.addEventListener('click', () => {
            const currentItems = erpItems.filter(i => (i.warehouseId || 'main') === currentWH);
            const lowItems = currentItems.filter(it => it.qty <= it.minQty);
            
            tbody.innerHTML = '';
            if(lowItems.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:20px;">لا توجد نواقص في هذا المخزن! كل الكميات ممتازة.</td></tr>';
                return;
            }
            // Temporarily replace render block
            lowItems.forEach(item => {
                let rowClass = item.qty === 0 ? 'stock-row-danger' : 'stock-row-warning';
                let statusTag = item.qty === 0 ? '<span class="inv-tag tag-empty"><i class="ph-fill ph-x-circle"></i> رصيد صفري</span>' : '<span class="inv-tag tag-low"><i class="ph-fill ph-warning"></i> تحت الحد الأدنى</span>';
                
                const tr = document.createElement('tr');
                tr.className = rowClass;
                tr.innerHTML = `
                    <td><span class="badge-barcode">${item.sku}</span></td>
                    <td><strong>${item.name}</strong></td>
                    <td>${item.category}</td>
                    <td>${item.unit}</td>
                    <td>${item.cost.toFixed(2)} ر.س</td>
                    <td class="qty-col ${item.qty === 0 ? 'empty' : 'low'}">${item.qty}</td>
                    <td>${(item.qty * item.cost).toLocaleString()} ر.س</td>
                    <td>${statusTag}</td>
                    <td></td>
                `;
                tbody.appendChild(tr);
            });
        });
    }

    // Valuation Modal Dashboard
    const btnValuation = document.getElementById('btn-valuation');
    if(btnValuation) {
        btnValuation.addEventListener('click', () => {
            let valMain = 0; let valRest = 0; let valBev = 0;
            erpItems.forEach(it => {
                let v = it.qty * it.cost;
                if(it.warehouseId === 'main') valMain += v;
                else if(it.warehouseId === 'restaurant') valRest += v;
                else if(it.warehouseId === 'beverages') valBev += v;
            });

            const content = document.getElementById('valuation-content');
            content.innerHTML = `
                <div style="background: rgba(15,23,42,0.5); border-radius:12px; padding:20px; text-align:right;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:8px;">
                        <span>المستودع الرئيسي:</span>
                        <strong style="color:var(--accent-blue)">${valMain.toFixed(2)} ر.س</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:8px;">
                        <span>مخزن المطعم (التشغيل):</span>
                        <strong style="color:var(--accent-orange)">${valRest.toFixed(2)} ر.س</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:8px;">
                        <span>مخزن المشروبات:</span>
                        <strong style="color:var(--accent-green)">${valBev.toFixed(2)} ر.س</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-top:16px; font-size:18px;">
                        <span>إجمالي التقييم النهائي:</span>
                        <strong style="color:white; font-size:22px;">${(valMain + valRest + valBev).toFixed(2)} ر.س</strong>
                    </div>
                </div>
            `;
            openModal('valuationModal');
        });
    }

    // Transfer Modal
    const btnOpenTransfer = document.getElementById('btn-open-transfer');
    if(btnOpenTransfer) {
        btnOpenTransfer.addEventListener('click', () => {
            document.getElementById('trans-from').value = currentWH;
            updateTransDropdown();
            openModal('transferModal');
        });
    }

    const transFrom = document.getElementById('trans-from');
    if(transFrom) transFrom.addEventListener('change', updateTransDropdown);

    function updateTransDropdown() {
        const fromWh = document.getElementById('trans-from').value;
        const skuSelect = document.getElementById('trans-sku');
        if(skuSelect) {
            const currentItems = erpItems.filter(i => (i.warehouseId || 'main') === fromWh);
            skuSelect.innerHTML = currentItems.map(it => `<option value="${it.sku}">${it.name} (متوفر: ${it.qty})</option>`).join('');
        }
    }

    const formTransfer = document.getElementById('form-transfer');
    if(formTransfer) {
        formTransfer.addEventListener('submit', (e) => {
            e.preventDefault();
            const fromWh = document.getElementById('trans-from').value;
            const toWh = document.getElementById('trans-to').value;
            const tSku = document.getElementById('trans-sku').value;
            const tQty = Number(document.getElementById('trans-qty').value);

            if(fromWh === toWh) { alert('لا يمكن التحويل لنفس المستودع!'); return; }

            const srcIdx = erpItems.findIndex(it => it.sku === tSku && (it.warehouseId||'main') === fromWh);
            if(srcIdx === -1) return;

            if(erpItems[srcIdx].qty < tQty) {
                alert('الكمية في المصدر لا تكفي للتحويل!');
                return;
            }

            // Deduct from source
            erpItems[srcIdx].qty -= tQty;

            // Find or create in destination
            const dstIdx = erpItems.findIndex(it => it.sku === tSku && it.warehouseId === toWh);
            if(dstIdx !== -1) {
                erpItems[dstIdx].qty += tQty;
            } else {
                // Clone item
                const newItem = {...erpItems[srcIdx]};
                newItem.warehouseId = toWh;
                newItem.qty = tQty;
                erpItems.push(newItem);
            }

            // Log Transfer Tx
            const newTxId = 'TRF-' + Math.floor(Math.random() * 10000);
            erpTx.push({
                id: newTxId,
                type: 'transfer',
                total: tQty * erpItems[srcIdx].cost,
                date: Date.now(),
                fromWh,
                toWh,
                sku: tSku
            });

            localStorage.setItem('erp_inventory_items', JSON.stringify(erpItems));
            localStorage.setItem('erp_inventory_tx', JSON.stringify(erpTx));

            closeModal('transferModal');
            renderTable();
            renderKPIs();
            formTransfer.reset();
            alert('تم تحويل البضاعة بنجاح وتسجيل سند التحويل!');
        });
    }

    // Save Item
    const formItem = document.getElementById('form-item');
    if(formItem) {
        formItem.addEventListener('submit', (e) => {
            e.preventDefault();
            const newItem = {
                sku: 'SKU-' + Math.floor(1000 + Math.random() * 9000),
                name: document.getElementById('item-name').value,
                category: document.getElementById('item-cat').value,
                unit: document.getElementById('item-unit').value,
                cost: Number(document.getElementById('item-cost').value),
                qty: Number(document.getElementById('item-qty').value),
                minQty: Number(document.getElementById('item-min').value),
                warehouseId: currentWH
            };
            erpItems.push(newItem);
            localStorage.setItem('erp_inventory_items', JSON.stringify(erpItems));
            
            closeModal('itemModal');
            renderTable();
            renderKPIs();
            formItem.reset();
        });
    }

    // Save Transaction (In/Out)
    const formTx = document.getElementById('form-tx');
    if(formTx) {
        // Populate SKUs only for current warehouse
        const updateTxDropdown = () => {
            const skuSelect = document.getElementById('tx-sku');
            if(skuSelect) {
                const currentItems = erpItems.filter(i => (i.warehouseId || 'main') === currentWH);
                skuSelect.innerHTML = currentItems.map(it => `<option value="${it.sku}">${it.name} (${it.sku})</option>`).join('');
            }
        };

        // Update dropdown whenever we open modal
        btnReceive?.addEventListener('click', updateTxDropdown);
        btnIssue?.addEventListener('click', updateTxDropdown);
        document.querySelector('.bg-blue')?.addEventListener('click', updateTxDropdown);

        formTx.addEventListener('submit', (e) => {
            e.preventDefault();
            const bSku = document.getElementById('tx-sku').value;
            const bType = document.getElementById('tx-type').value;
            const bQty = Number(document.getElementById('tx-qty').value);

            // Find Item
            const idx = erpItems.findIndex(it => it.sku === bSku);
            if(idx === -1) return;

            if(bType === 'in') {
                erpItems[idx].qty += bQty;
            } else {
                if(erpItems[idx].qty < bQty) {
                    alert('الكمية المتوفرة لا تكفي للصرف!');
                    return;
                }
                erpItems[idx].qty -= bQty;
            }

            const newTxId = 'TX-' + Math.floor(Math.random() * 10000);
            const totalCost = bQty * erpItems[idx].cost;
            const newTx = {
                id: newTxId,
                type: bType,
                total: totalCost,
                date: Date.now()
            };
            erpTx.push(newTx);

            localStorage.setItem('erp_inventory_items', JSON.stringify(erpItems));
            localStorage.setItem('erp_inventory_tx', JSON.stringify(erpTx));

            closeModal('txModal');
            renderTable();
            renderKPIs();
            formTx.reset();

            // Auto-print receipt
            printInventoryReceipt(newTx, erpItems[idx], bQty, bType);
        });
    }

    function printInventoryReceipt(tx, item, qty, type) {
        const typeName = type === 'in' ? 'سند إدخال (استلام)' : 'أمر صرف (خروج)';
        const dateStr = new Date(tx.date).toLocaleString('ar-SA');
        
        const receiptWindow = window.open('', '_blank', 'width=400,height=600');
        receiptWindow.document.write(`
            <html dir="rtl" lang="ar">
            <head>
                <title>طباعة ${typeName}</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; text-align: center; color: #333; }
                    .header { border-bottom: 2px dashed #ccc; padding-bottom: 15px; margin-bottom: 20px; }
                    .header h2 { margin: 0 0 5px 0; font-size: 22px; }
                    .header p { margin: 0; font-size: 14px; color: #666; }
                    .details { text-align: right; margin-bottom: 20px; background: #f9f9f9; padding: 15px; border-radius: 8px;}
                    .details p { margin: 8px 0; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
                    .details span.label { font-weight: bold; display: inline-block; width: 120px; }
                    .footer { margin-top: 30px; font-size: 12px; color: #888; border-top: 1px solid #ccc; padding-top: 10px;}
                    @media print {
                        body { width: 80mm; margin: 0 auto; padding: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>سمر حضرموت للمطاعم</h2>
                    <p>المخازن والمستودعات</p>
                    <h3 style="margin-top:10px; border:1px solid #333; display:inline-block; padding:5px 15px; border-radius:5px;">${typeName}</h3>
                </div>
                
                <div class="details">
                    <p><span class="label">رقم السند:</span> ${tx.id}</p>
                    <p><span class="label">التاريخ والوقت:</span> ${dateStr}</p>
                    <p><span class="label">المستودع:</span> ${item.warehouseId === 'main' ? 'المستودع الرئيسي' : (item.warehouseId === 'restaurant' ? 'مخزن المطعم' : 'مخزن المشروبات')}</p>
                    <br>
                    <p><span class="label">رمز الصنف:</span> ${item.sku}</p>
                    <p><span class="label">اسم الصنف:</span> ${item.name}</p>
                    <p><span class="label">الكمية المصدرة:</span> ${qty} ${item.unit}</p>
                    <p><span class="label">تكلفة الوحدة:</span> ${Number(item.cost).toFixed(2)} ر.س</p>
                    <p><span class="label">إجمالي التكلفة:</span> ${Number(tx.total).toFixed(2)} ر.س</p>
                    <p><span class="label">المشرف المسؤول:</span> سالم أحمد</p>
                </div>

                <div class="footer">
                    <p>توقيع أمين المستودع .........................</p>
                    <p>توقيع المستلم .........................</p>
                    <p>طبعت بواسطة نظام الإدارة الإلكتروني</p>
                </div>
            </body>
            </html>
        `);
        receiptWindow.document.close();
        receiptWindow.focus();
        setTimeout(() => {
            receiptWindow.print();
            receiptWindow.close();
        }, 500);
    }

});
