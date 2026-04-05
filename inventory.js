const { ipcRenderer } = require('electron');

async function saveDB(db) {
    await window.dbWrite(db);
    try { ipcRenderer.send('notify-db-changed'); } catch (e) {}
}

document.addEventListener('DOMContentLoaded', async () => {
    const xf = (n) => (window.HashCurrency ? HashCurrency.format(n) : Number(n).toFixed(2) + ' ر.س');
    const curSym = () => (window.HashCurrency ? HashCurrency.getConfig().symbol : 'ر.س');
    const tbody = document.querySelector('.inv-table tbody');
    if (!tbody) return;

    let db = await window.dbRead();
    if (!db.inventory) db.inventory = [];
    if (!db.inventoryTx) db.inventoryTx = [];

    let erpItems = db.inventory;
    let erpTx = db.inventoryTx;

    if (erpItems.length === 0) {
        erpItems = [
            { sku: 'SKU-2001', name: 'أرز بسمتي هندي', category: 'المواد التموينية', unit: 'كيس 40كج', cost: 320, qty: 14, minQty: 15, warehouseId: 'main' },
            { sku: 'SKU-2002', name: 'لحم حري طازج', category: 'اللحوم', unit: 'ذبيحة', cost: 1200, qty: 35, minQty: 10, warehouseId: 'main' },
            { sku: 'SKU-2005', name: 'دجاج مبرد', category: 'الدواجن', unit: 'كرتون', cost: 145, qty: 80, minQty: 30, warehouseId: 'restaurant' },
            { sku: 'SKU-2012', name: 'زيت قلي نباتي', category: 'الزيوت', unit: 'تنكة', cost: 160, qty: 0, minQty: 10, warehouseId: 'restaurant' },
            { sku: 'SKU-2015', name: 'مياه لتر ونصف', category: 'المرطبات', unit: 'كرتون', cost: 12, qty: 50, minQty: 20, warehouseId: 'beverages' }
        ];
        db.inventory = erpItems;
        await saveDB(db);
    }

    let currentWH = 'main';
    const viewFilters = { lowOnly: false, category: '' };

    const whTitles = {
        main: 'مراقبة أرصدة الأصناف (المستودع الرئيسي)',
        restaurant: 'مراقبة أرصدة الأصناف (مخزن المطعم الداخلي)',
        beverages: 'مراقبة أرصدة الأصناف (مخزن المشروبات)'
    };

    function whNorm(id) {
        return id || 'main';
    }

    function findItemIndex(sku, wh) {
        return erpItems.findIndex((it) => it.sku === sku && whNorm(it.warehouseId) === whNorm(wh));
    }

    function updateTableTitle() {
        const el = document.getElementById('inv-table-title');
        if (el) el.textContent = whTitles[currentWH] || whTitles.main;
    }

    function isThisMonth(ts) {
        const d = new Date(ts);
        if (isNaN(d.getTime())) return false;
        const n = new Date();
        return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
    }

    function whForInTx(t) {
        if (t.type !== 'in') return null;
        return t.toWh || t.wh || 'main';
    }

    function whForOutTx(t) {
        if (t.type !== 'out') return null;
        return t.fromWh || t.wh || 'main';
    }

    function renderKPIs() {
        const currentItems = erpItems.filter((i) => whNorm(i.warehouseId) === currentWH);

        const totalVal = currentItems.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.cost) || 0), 0);

        const inThisMonth = erpTx.filter((t) => t.type === 'in' && isThisMonth(t.date) && whForInTx(t) === currentWH);
        const inVal = inThisMonth.reduce((s, t) => s + (Number(t.total) || 0), 0);

        const outThisMonth = erpTx.filter((t) => t.type === 'out' && isThisMonth(t.date) && whForOutTx(t) === currentWH);
        const outVal = outThisMonth.reduce((s, t) => s + (Number(t.total) || 0), 0);

        const lowStockCount = currentItems.filter((it) => (Number(it.qty) || 0) <= (Number(it.minQty) || 0)).length;

        const setHtml = (id, html) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = html;
        };

        setHtml('kpi-inv-valuation', `${totalVal.toLocaleString()}<span class="currency">${curSym()}</span>`);
        const subVal = document.getElementById('kpi-inv-valuation-sub');
        if (subVal) subVal.textContent = whTitles[currentWH]?.split('(')[1]?.replace(')', '') || 'المخزن النشط';

        setHtml('kpi-inv-in-month', `${inVal.toLocaleString()}<span class="currency">${curSym()}</span>`);
        const inSub = document.getElementById('kpi-inv-in-sub');
        if (inSub) inSub.innerHTML = `<i class="ph ph-tag"></i> ${inThisMonth.length} حركة إدخال هذا الشهر`;

        setHtml('kpi-inv-out-month', `${outVal.toLocaleString()}<span class="currency">${curSym()}</span>`);
        const outSub = document.getElementById('kpi-inv-out-sub');
        if (outSub) outSub.innerHTML = `<i class="ph ph-receipt"></i> ${outThisMonth.length} حركة صرف هذا الشهر`;

        setHtml('kpi-inv-low', `${lowStockCount} <span class="currency" style="font-size:14px">أصناف</span>`);
        const lowSub = document.getElementById('kpi-inv-low-sub');
        if (lowSub) {
            lowSub.innerHTML =
                lowStockCount > 0
                    ? '<i class="ph ph-warning"></i> تتطلب متابعة أو طلب شراء'
                    : '<i class="ph ph-check"></i> لا نواقص في المخزن النشط';
        }

        const badge = document.getElementById('inv-notif-badge');
        if (badge) {
            badge.textContent = String(lowStockCount);
            badge.style.display = lowStockCount > 0 ? '' : 'none';
        }
    }

    function buildRowHtml(item) {
        let rowClass = '';
        let statusTag = '';
        const qty = Number(item.qty) || 0;
        const minQ = Number(item.minQty) || 0;

        if (qty === 0) {
            rowClass = 'stock-row-danger';
            statusTag = '<span class="inv-tag tag-empty"><i class="ph-fill ph-x-circle"></i> رصيد صفري</span>';
        } else if (qty <= minQ) {
            rowClass = 'stock-row-warning';
            statusTag = '<span class="inv-tag tag-low"><i class="ph-fill ph-warning"></i> تحت الحد الأدنى</span>';
        } else {
            statusTag = '<span class="inv-tag tag-safe">رصيد كافي</span>';
        }

        const wh = whNorm(item.warehouseId);
        return {
            rowClass,
            html: `
                <td><span class="badge-barcode">${item.sku}</span></td>
                <td><strong>${item.name}</strong></td>
                <td>${item.category || ''}</td>
                <td>${item.unit || ''}</td>
                <td>${xf(item.cost)}</td>
                <td class="qty-col ${qty === 0 ? 'empty' : qty <= minQ ? 'low' : 'safe'}">${qty}</td>
                <td>${xf(qty * Number(item.cost))}</td>
                <td>${statusTag}</td>
                <td>
                    <div class="tbl-actions">
                        <button type="button" class="action-btn btn-edit-item" data-sku="${item.sku}" data-wh="${wh}" title="تعديل"><i class="ph ph-pencil-simple"></i></button>
                        <button type="button" class="action-btn text-green btn-quick-in" data-sku="${item.sku}" title="إصدار استلام"><i class="ph ph-plus-circle"></i></button>
                    </div>
                </td>
            `
        };
    }

    function renderTable() {
        tbody.innerHTML = '';
        updateTableTitle();

        let currentItems = erpItems.filter((i) => whNorm(i.warehouseId) === currentWH);

        if (viewFilters.category) {
            currentItems = currentItems.filter((it) => (it.category || '') === viewFilters.category);
        }
        if (viewFilters.lowOnly) {
            currentItems = currentItems.filter((it) => (Number(it.qty) || 0) <= (Number(it.minQty) || 0));
        }

        const q = (document.getElementById('inv-search')?.value || '').toLowerCase().trim();
        if (q) {
            currentItems = currentItems.filter(
                (it) =>
                    String(it.name || '')
                        .toLowerCase()
                        .includes(q) ||
                    String(it.sku || '')
                        .toLowerCase()
                        .includes(q)
            );
        }

        if (currentItems.length === 0) {
            tbody.innerHTML =
                '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:20px;">لا توجد أصناف مطابقة للعرض الحالي.</td></tr>';
            return;
        }

        currentItems.forEach((item) => {
            const { rowClass, html } = buildRowHtml(item);
            const tr = document.createElement('tr');
            if (rowClass) tr.className = rowClass;
            tr.innerHTML = html;
            tbody.appendChild(tr);
        });

        document.querySelectorAll('.btn-quick-in').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const sku = e.currentTarget.dataset.sku;
                document.getElementById('tx-sku').value = sku;
                document.getElementById('tx-type').value = 'in';
                updateTxDropdown();
                openModal('txModal');
            });
        });

        document.querySelectorAll('.btn-edit-item').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const sku = e.currentTarget.dataset.sku;
                const wh = e.currentTarget.dataset.wh || currentWH;
                openItemModalEdit(sku, wh);
            });
        });
    }

    document.getElementById('inv-search')?.addEventListener('input', () => {
        renderTable();
    });

    renderTable();
    renderKPIs();

    if (typeof window.registerPosDatabaseRefresh === 'function') {
        window.registerPosDatabaseRefresh(async () => {
            db = await window.dbRead();
            erpItems = db.inventory || [];
            erpTx = db.inventoryTx || [];
            renderTable();
            renderKPIs();
        });
    }

    const whTabs = document.querySelectorAll('.warehouse-tab');
    whTabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            whTabs.forEach((t) => t.classList.remove('active'));
            tab.classList.add('active');
            currentWH = tab.dataset.wh || 'main';
            updateTableTitle();
            renderTable();
            renderKPIs();
        });
    });

    function openModal(id) {
        document.getElementById(id).classList.add('active');
    }
    function closeModal(id) {
        document.getElementById(id).classList.remove('active');
    }

    function resetItemModal() {
        document.getElementById('item-edit-sku').value = '';
        document.getElementById('item-edit-wh').value = '';
        document.getElementById('item-modal-title').textContent = 'تعريف منتج مخزني جديد';
        document.getElementById('item-qty-label').textContent = 'الرصيد الافتتاحي (الكمية)';
        document.getElementById('item-submit-btn').textContent = 'حفظ المنتج';
        document.getElementById('form-item').reset();
    }

    function openItemModalEdit(sku, wh) {
        const idx = findItemIndex(sku, wh);
        if (idx === -1) return;
        const it = erpItems[idx];
        resetItemModal();
        document.getElementById('item-edit-sku').value = sku;
        document.getElementById('item-edit-wh').value = whNorm(it.warehouseId);
        document.getElementById('item-modal-title').textContent = 'تعديل صنف مخزني';
        document.getElementById('item-qty-label').textContent = 'الكمية الحالية';
        document.getElementById('item-submit-btn').textContent = 'حفظ التعديلات';
        document.getElementById('item-name').value = it.name || '';
        document.getElementById('item-cat').value = it.category || '';
        document.getElementById('item-unit').value = it.unit || '';
        document.getElementById('item-cost').value = it.cost ?? '';
        document.getElementById('item-qty').value = it.qty ?? '';
        document.getElementById('item-min').value = it.minQty ?? '';
        openModal('itemModal');
    }

    const btnAddProduct = document.getElementById('btn-add-product');
    if (btnAddProduct) {
        btnAddProduct.addEventListener('click', () => {
            resetItemModal();
            openModal('itemModal');
        });
    }

    const btnReceive = document.querySelector('.inv-header .bg-green');
    const btnIssue = document.querySelector('.inv-header .bg-red');

    if (btnReceive) {
        btnReceive.addEventListener('click', () => {
            document.getElementById('tx-type').value = 'in';
            updateTxDropdown();
            openModal('txModal');
        });
    }
    if (btnIssue) {
        btnIssue.addEventListener('click', () => {
            document.getElementById('tx-type').value = 'out';
            updateTxDropdown();
            openModal('txModal');
        });
    }

    document.querySelectorAll('.btn-cancel-modal').forEach((b) =>
        b.addEventListener('click', (e) => {
            const overlay = e.currentTarget.closest('.modal-overlay');
            if (overlay && overlay.id === 'itemModal') resetItemModal();
            closeModal(overlay.id);
        })
    );

    const btnFilterLow = document.getElementById('btn-filter-low');
    if (btnFilterLow) {
        btnFilterLow.addEventListener('click', (e) => {
            e.preventDefault();
            viewFilters.lowOnly = !viewFilters.lowOnly;
            viewFilters.category = '';
            btnFilterLow.classList.toggle('nav-filter-active', viewFilters.lowOnly);
            renderTable();
        });
    }

    function populateFilterCategories() {
        const sel = document.getElementById('filter-cat-select');
        if (!sel) return;
        const cats = new Set();
        erpItems.filter((i) => whNorm(i.warehouseId) === currentWH).forEach((it) => {
            if (it.category) cats.add(it.category);
        });
        const cur = sel.value;
        sel.innerHTML = '<option value="">كل الفئات</option>';
        [...cats].sort().forEach((c) => {
            sel.innerHTML += `<option value="${c.replace(/"/g, '&quot;')}">${c}</option>`;
        });
        if ([...cats].includes(cur)) sel.value = cur;
    }

    document.getElementById('btn-inv-filter')?.addEventListener('click', () => {
        populateFilterCategories();
        document.getElementById('filter-low-only').checked = viewFilters.lowOnly;
        document.getElementById('filter-cat-select').value = viewFilters.category || '';
        openModal('filterModal');
    });

    document.getElementById('filter-apply')?.addEventListener('click', () => {
        viewFilters.category = document.getElementById('filter-cat-select').value || '';
        viewFilters.lowOnly = document.getElementById('filter-low-only').checked;
        const navLow = document.getElementById('btn-filter-low');
        if (navLow) navLow.classList.toggle('nav-filter-active', viewFilters.lowOnly);
        closeModal('filterModal');
        renderTable();
    });

    document.getElementById('filter-clear-all')?.addEventListener('click', () => {
        viewFilters.category = '';
        viewFilters.lowOnly = false;
        document.getElementById('filter-cat-select').value = '';
        document.getElementById('filter-low-only').checked = false;
        const navLow = document.getElementById('btn-filter-low');
        if (navLow) navLow.classList.remove('nav-filter-active');
        closeModal('filterModal');
        renderTable();
    });

    document.getElementById('inv-notif-btn')?.addEventListener('click', () => {
        const currentItems = erpItems.filter((i) => whNorm(i.warehouseId) === currentWH);
        const lows = currentItems.filter((it) => (Number(it.qty) || 0) <= (Number(it.minQty) || 0));
        if (lows.length === 0) {
            alert('لا توجد نواقص في المخزن النشط.');
            return;
        }
        const lines = lows.slice(0, 12).map((it) => `• ${it.name} — الرصيد ${it.qty} (الحد ${it.minQty})`);
        const more = lows.length > 12 ? `\n... و${lows.length - 12} صنف آخر` : '';
        alert(`تنبيهات نواقص (${whTitles[currentWH]}):\n\n${lines.join('\n')}${more}`);
        viewFilters.lowOnly = true;
        viewFilters.category = '';
        const navLow = document.getElementById('btn-filter-low');
        if (navLow) navLow.classList.add('nav-filter-active');
        renderTable();
    });

    const btnValuation = document.getElementById('btn-valuation');
    if (btnValuation) {
        btnValuation.addEventListener('click', () => {
            let valMain = 0;
            let valRest = 0;
            let valBev = 0;
            erpItems.forEach((it) => {
                const v = (Number(it.qty) || 0) * (Number(it.cost) || 0);
                if (whNorm(it.warehouseId) === 'main') valMain += v;
                else if (whNorm(it.warehouseId) === 'restaurant') valRest += v;
                else if (whNorm(it.warehouseId) === 'beverages') valBev += v;
            });

            const content = document.getElementById('valuation-content');
            content.innerHTML = `
                <div style="background: rgba(15,23,42,0.5); border-radius:12px; padding:20px; text-align:right;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:8px;">
                        <span>المستودع الرئيسي:</span>
                        <strong style="color:var(--accent-blue)">${xf(valMain)}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:8px;">
                        <span>مخزن المطعم (التشغيل):</span>
                        <strong style="color:var(--accent-orange)">${xf(valRest)}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:8px;">
                        <span>مخزن المشروبات:</span>
                        <strong style="color:var(--accent-green)">${xf(valBev)}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-top:16px; font-size:18px;">
                        <span>إجمالي التقييم النهائي:</span>
                        <strong style="color:white; font-size:22px;">${xf(valMain + valRest + valBev)}</strong>
                    </div>
                </div>
            `;
            openModal('valuationModal');
        });
    }

    const btnOpenTransfer = document.getElementById('btn-open-transfer');
    if (btnOpenTransfer) {
        btnOpenTransfer.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('trans-from').value = currentWH;
            updateTransDropdown();
            openModal('transferModal');
        });
    }

    const transFrom = document.getElementById('trans-from');
    if (transFrom) transFrom.addEventListener('change', updateTransDropdown);

    function updateTransDropdown() {
        const fromWh = document.getElementById('trans-from').value;
        const skuSelect = document.getElementById('trans-sku');
        if (skuSelect) {
            const currentItems = erpItems.filter((i) => whNorm(i.warehouseId) === fromWh);
            skuSelect.innerHTML = currentItems.map((it) => `<option value="${it.sku}">${it.name} (متوفر: ${it.qty})</option>`).join('');
        }
    }

    const formTransfer = document.getElementById('form-transfer');
    if (formTransfer) {
        formTransfer.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fromWh = document.getElementById('trans-from').value;
            const toWh = document.getElementById('trans-to').value;
            const tSku = document.getElementById('trans-sku').value;
            const tQty = Number(document.getElementById('trans-qty').value);

            if (fromWh === toWh) {
                alert('لا يمكن التحويل لنفس المستودع!');
                return;
            }

            const srcIdx = erpItems.findIndex((it) => it.sku === tSku && whNorm(it.warehouseId) === fromWh);
            if (srcIdx === -1) return;

            if (erpItems[srcIdx].qty < tQty) {
                alert('الكمية في المصدر لا تكفي للتحويل!');
                return;
            }

            erpItems[srcIdx].qty -= tQty;

            const dstIdx = erpItems.findIndex((it) => it.sku === tSku && whNorm(it.warehouseId) === toWh);
            if (dstIdx !== -1) {
                erpItems[dstIdx].qty += tQty;
            } else {
                const newItem = { ...erpItems[srcIdx] };
                newItem.warehouseId = toWh;
                newItem.qty = tQty;
                erpItems.push(newItem);
            }

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

            db.inventory = erpItems;
            db.inventoryTx = erpTx;
            await saveDB(db);

            closeModal('transferModal');
            renderTable();
            renderKPIs();
            formTransfer.reset();
            alert('تم تحويل البضاعة بنجاح وتسجيل سند التحويل!');
        });
    }

    const formItem = document.getElementById('form-item');
    if (formItem) {
        formItem.addEventListener('submit', async (e) => {
            e.preventDefault();
            const editSku = document.getElementById('item-edit-sku').value.trim();
            const editWh = document.getElementById('item-edit-wh').value.trim();

            if (editSku) {
                const idx = findItemIndex(editSku, editWh || currentWH);
                if (idx === -1) {
                    alert('تعذر العثور على الصنف للتعديل.');
                    return;
                }
                erpItems[idx].name = document.getElementById('item-name').value;
                erpItems[idx].category = document.getElementById('item-cat').value;
                erpItems[idx].unit = document.getElementById('item-unit').value;
                erpItems[idx].cost = Number(document.getElementById('item-cost').value);
                erpItems[idx].qty = Number(document.getElementById('item-qty').value);
                erpItems[idx].minQty = Number(document.getElementById('item-min').value);
            } else {
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
            }

            db.inventory = erpItems;
            await saveDB(db);

            resetItemModal();
            closeModal('itemModal');
            renderTable();
            renderKPIs();
        });
    }

    const formTx = document.getElementById('form-tx');
    function updateTxDropdown() {
        const skuSelect = document.getElementById('tx-sku');
        if (skuSelect) {
            const currentItems = erpItems.filter((i) => whNorm(i.warehouseId) === currentWH);
            skuSelect.innerHTML = currentItems.map((it) => `<option value="${it.sku}">${it.name} (${it.sku})</option>`).join('');
        }
    }

    btnReceive?.addEventListener('click', updateTxDropdown);
    btnIssue?.addEventListener('click', updateTxDropdown);

    if (formTx) {
        formTx.addEventListener('submit', async (e) => {
            e.preventDefault();
            const bSku = document.getElementById('tx-sku').value;
            const bType = document.getElementById('tx-type').value;
            const bQty = Number(document.getElementById('tx-qty').value);

            const idx = erpItems.findIndex((it) => it.sku === bSku && whNorm(it.warehouseId) === currentWH);
            if (idx === -1) {
                alert('الصنف غير موجود في المخزن الحالي. انتقل إلى تبويب المخزن الصحيح أو أضف الصنف هناك.');
                return;
            }

            if (bType === 'in') {
                erpItems[idx].qty += bQty;
            } else {
                if (erpItems[idx].qty < bQty) {
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
                date: Date.now(),
                wh: currentWH,
                sku: bSku,
                ...(bType === 'in' ? { toWh: currentWH } : { fromWh: currentWH })
            };
            erpTx.push(newTx);

            db.inventory = erpItems;
            db.inventoryTx = erpTx;
            await saveDB(db);

            closeModal('txModal');
            renderTable();
            renderKPIs();
            formTx.reset();

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
                <meta charset="UTF-8">
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
                    <h2>هـــش HASH للمطاعم</h2>
                    <p>المخازن والمستودعات</p>
                    <h3 style="margin-top:10px; border:1px solid #333; display:inline-block; padding:5px 15px; border-radius:5px;">${typeName}</h3>
                </div>

                <div class="details">
                    <p><span class="label">رقم السند:</span> ${tx.id}</p>
                    <p><span class="label">التاريخ والوقت:</span> ${dateStr}</p>
                    <p><span class="label">المستودع:</span> ${item.warehouseId === 'main' ? 'المستودع الرئيسي' : item.warehouseId === 'restaurant' ? 'مخزن المطعم' : 'مخزن المشروبات'}</p>
                    <br>
                    <p><span class="label">رمز الصنف:</span> ${item.sku}</p>
                    <p><span class="label">اسم الصنف:</span> ${item.name}</p>
                    <p><span class="label">الكمية:</span> ${qty} ${item.unit}</p>
                    <p><span class="label">تكلفة الوحدة:</span> ${xf(item.cost)}</p>
                    <p><span class="label">إجمالي التكلفة:</span> ${xf(tx.total)}</p>
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
