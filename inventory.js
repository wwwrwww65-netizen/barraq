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
    if (!db.purchases) db.purchases = [];

    // ── Pending Receipts Panel (Warehouse Manager view) ──────────────────────
    const whNames = { main: 'المستودع الرئيسي', restaurant: 'مخزن المطعم', beverages: 'مخزن المشروبات' };

    function getSystemTaxRate() {
        try {
            const s = JSON.parse(localStorage.getItem('restaurant_settings') || '{}');
            const rate = parseFloat(s.taxRate);
            return isNaN(rate) ? 15 : rate;
        } catch(e) { return 15; }
    }

    function renderPendingReceipts() {
        const pending = (db.purchases || []).filter(p => p.status === 'قيد الاستلام');
        const section = document.getElementById('pending-receipts-section');
        const list    = document.getElementById('pending-receipts-list');
        const badge   = document.getElementById('pending-count-badge');
        const navLink = document.getElementById('nav-pending-link');
        const navCnt  = document.getElementById('nav-pending-count');

        if (!section || !list) return;

        if (pending.length === 0) {
            section.style.display = 'none';
            if (navLink) navLink.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        if (badge) badge.textContent = pending.length + ' فاتورة معلقة';
        if (navLink) navLink.style.display = '';
        if (navCnt)  navCnt.textContent = pending.length;

        list.innerHTML = '';
        pending.forEach(pur => {
            const destWhName = whNames[pur.destWh || 'main'] || pur.destWh;
            const itemsSummary = (pur.items || []).map(i => `${i.name} (${i.qty})`).join(' ، ');
            const card = document.createElement('div');
            card.style.cssText = 'background:var(--bg-card); border:1px solid var(--border-color); border-radius:10px; padding:14px 18px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;';
            card.innerHTML = `
                <div style="flex:1; min-width:220px;">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
                        <strong style="color:#fbbf24; font-size:15px;">${pur.id}</strong>
                        <span style="color:var(--text-muted); font-size:12px;">مرجع: ${pur.ref || '-'}</span>
                    </div>
                    <div style="font-size:12px; color:var(--text-secondary); margin-bottom:4px;">
                        <i class="ph ph-truck"></i> المورد: <strong>${pur.supName}</strong>
                        &nbsp;|&nbsp;
                        <i class="ph ph-warehouse"></i> الوجهة: <strong>${destWhName}</strong>
                        &nbsp;|&nbsp;
                        <i class="ph ph-calendar"></i> تاريخ الفاتورة: ${pur.date}
                    </div>
                    <div style="font-size:12px; color:var(--text-muted);">
                        الأصناف: ${itemsSummary}
                    </div>
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <span style="color:var(--text-primary); font-weight:700; font-size:14px;">${xf(pur.total)}</span>
                    <button class="wh-receive-btn" data-id="${pur.id}"
                        style="background:linear-gradient(135deg,#10b981,#059669); color:#fff; border:none; border-radius:8px; padding:9px 18px; cursor:pointer; font-size:13px; font-weight:700; display:flex; align-items:center; gap:6px;">
                        <i class="ph ph-check-circle"></i> تأكيد الاستلام
                    </button>
                </div>
            `;
            list.appendChild(card);
        });

        // Attach receive handlers
        list.querySelectorAll('.wh-receive-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const purId = e.currentTarget.dataset.id;
                const pur = (db.purchases || []).find(p => p.id === purId);
                if (!pur) return;
                if (!confirm(`تأكيد استلام الفاتورة ${pur.id} من المورد "${pur.supName}" وإضافة الكميات للمخزون؟`)) return;
                await whReceivePurchase(pur);
            });
        });
    }

    async function whReceivePurchase(pur) {
        const taxPct = getSystemTaxRate();
        const destWh = pur.destWh || 'main';

        pur.items.forEach(buyItem => {
            const unitCost = buyItem.price / (1 + taxPct / 100);
            let invItem = erpItems.find(i => i.sku === buyItem.sku && (i.warehouseId || 'main') === destWh);

            if (invItem) {
                invItem.qty = (Number(invItem.qty) || 0) + buyItem.qty;
                invItem.cost = unitCost;
            } else {
                let src = erpItems.find(i => i.sku === buyItem.sku);
                if (src) {
                    let clone = { ...src, warehouseId: destWh, qty: buyItem.qty, cost: unitCost };
                    erpItems.push(clone);
                } else {
                    erpItems.push({ sku: buyItem.sku, name: buyItem.name, category: '', unit: '', cost: unitCost, qty: buyItem.qty, minQty: 0, warehouseId: destWh });
                }
            }

            erpTx.push({
                id: 'TX-' + Math.floor(Math.random() * 90000 + 10000),
                type: 'in',
                total: buyItem.qty * unitCost,
                date: Date.now(),
                fromWh: 'SUPPLIER',
                toWh: destWh,
                sku: buyItem.sku,
                refInvoice: pur.id
            });
        });

        pur.status = 'مستلمة بالمخزن';
        db.inventory = erpItems;
        db.inventoryTx = erpTx;
        await window.dbWrite(db);
        try { const { ipcRenderer } = require('electron'); ipcRenderer.send('notify-db-changed'); } catch(e) {}

        renderPendingReceipts();
        renderTable();
        renderKPIs();

        // Print receive note
        whPrintReceiveNote(pur);
        alert(`✅ تم استلام الفاتورة ${pur.id} وإضافة الكميات للمخزون!`);
    }

    function whPrintReceiveNote(pur) {
        const taxPct = getSystemTaxRate();
        const destWhName = whNames[pur.destWh || 'main'] || pur.destWh;
        const dateStr = new Date().toLocaleDateString('ar-SA', { year:'numeric', month:'long', day:'numeric' });
        let rows = ''; let sub = 0;
        (pur.items || []).forEach((it, i) => {
            const uc = it.price / (1 + taxPct / 100);
            const lt = it.qty * uc;
            sub += lt;
            rows += `<tr><td style="text-align:center">${i+1}</td><td>${it.name}</td><td style="text-align:center">${it.qty}</td><td style="text-align:center">${uc.toFixed(2)}</td><td style="text-align:center">${lt.toFixed(2)}</td><td style="text-align:center;color:green">✓</td></tr>`;
        });
        const w = window.open('','_blank','width=820,height=700');
        w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>أمر استلام - ${pur.id}</title>
        <style>body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;padding:28px;color:#111;font-size:13px}
        h1{margin:0 0 4px;font-size:20px;color:#0f172a}.sub{color:#10b981;font-weight:600;font-size:14px}
        .meta{background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px 16px;text-align:right;min-width:230px}
        .meta p{margin:3px 0;font-size:13px}.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1e293b;padding-bottom:16px;margin-bottom:18px}
        .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px}
        .box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px}
        .box label{font-size:11px;color:#64748b;display:block;margin-bottom:2px}.box span{font-weight:700;color:#0f172a;font-size:14px}
        table{width:100%;border-collapse:collapse;margin-top:14px}
        th{background:#1e293b;color:#fff;padding:10px 8px;text-align:center;font-size:12px}
        td{padding:9px 8px;border-bottom:1px solid #e2e8f0;font-size:12px}tr:nth-child(even) td{background:#f8fafc}
        .sumbox{background:#1e293b;color:#fff;border-radius:10px;padding:14px 22px;min-width:250px;margin-top:16px;margin-right:auto}
        .sl{display:flex;justify-content:space-between;margin-bottom:7px;font-size:13px}
        .sl.tot{font-size:16px;font-weight:700;border-top:1px solid rgba(255,255,255,.2);padding-top:9px;margin-top:5px}
        .sigs{display:flex;justify-content:space-around;margin-top:48px;text-align:center}
        .sig{border-top:1.5px solid #1e293b;padding-top:7px;width:155px;font-size:12px;color:#334155}
        .notice{background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:9px 14px;font-size:12px;color:#92400e;margin-top:14px}
        </style></head><body>
        <div class="hdr">
          <div><h1>أمر استلام بضاعة</h1><p class="sub">Goods Received Note (GRN)</p><p style="margin-top:7px;font-size:12px;color:#64748b">إدارة المخازن والمستودعات</p></div>
          <div class="meta">
            <p><strong>رقم الأمر:</strong> GRN-${pur.id}</p>
            <p><strong>مرجع فاتورة المورد:</strong> ${pur.ref || '-'}</p>
            <p><strong>تاريخ الاستلام الفعلي:</strong> ${dateStr}</p>
            <p><strong>تاريخ الفاتورة:</strong> ${pur.date}</p>
          </div>
        </div>
        <div class="grid2">
          <div class="box"><label>المورد</label><span>${pur.supName}</span></div>
          <div class="box"><label>المستودع المستلِم</label><span>${destWhName}</span></div>
          <div class="box"><label>طريقة الدفع</label><span>${pur.payMethod==='cash'?'نقداً':pur.payMethod==='bank'?'حوالة بنكية':'آجل (ذمة)'}</span></div>
          <div class="box"><label>حالة الاستلام</label><span style="color:#10b981">✓ تم الاستلام وإدخال المخزون</span></div>
        </div>
        <table><thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>سعر الوحدة (ق.ض)</th><th>الإجمالي</th><th>تم الإدخال</th></tr></thead>
        <tbody>${rows}</tbody></table>
        <div style="display:flex;justify-content:flex-end"><div class="sumbox">
          <div class="sl"><span>إجمالي قبل الضريبة:</span><span>${sub.toFixed(2)} ر.س</span></div>
          <div class="sl"><span>ضريبة ${taxPct}%:</span><span>${(sub*taxPct/100).toFixed(2)} ر.س</span></div>
          <div class="sl tot"><span>الإجمالي النهائي:</span><span>${xf(pur.total)}</span></div>
        </div></div>
        <div class="notice">⚠️ هذا السند يُثبت استلام البضاعة وإدخالها في المخزون الإلكتروني. يُعتمد بتوقيع أمين المستودع والمستلم.</div>
        <div class="sigs">
          <div class="sig">أمين المستودع<br><br>.........................</div>
          <div class="sig">مسؤول المشتريات<br><br>.........................</div>
          <div class="sig">مدير العمليات<br><br>.........................</div>
        </div></body></html>`);
        w.document.close(); w.focus();
        setTimeout(() => { w.print(); }, 600);
    }

    renderPendingReceipts();
    // ─────────────────────────────────────────────────────────────────────────

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
                        <button type="button" class="action-btn btn-delete-item" data-sku="${item.sku}" data-wh="${wh}" title="حذف"><i class="ph ph-trash" style="color:var(--accent-red)"></i></button>
                        <button type="button" class="action-btn text-green btn-quick-in" data-sku="${item.sku}" title="إصدار استلام"><i class="ph ph-plus-circle"></i></button>
                    </div>
                </td>
            `
        };
    }

    // ── Infinite Scroll State ────────────────────────────────────────────────
    const INV_INITIAL_CHUNK = 50;    // أول تحميل
    const INV_LOAD_MORE     = 20;    // كل scroll إضافي
    let   _filteredItems    = [];    // البيانات المصفاة الكاملة
    let   _renderedCount    = 0;     // كم صف رُسم حتى الآن
    let   _isLoadingMore    = false; // حارس لمنع طلبين متزامنين

    /** يُرتّب البيانات المصفاة ويُخزّنها، ثم يرسم أول chunk */
    function renderTable() {
        updateTableTitle();
        tbody.innerHTML = '';
        _renderedCount = 0;

        let base = erpItems.filter((i) => whNorm(i.warehouseId) === currentWH);

        if (viewFilters.category)
            base = base.filter((it) => (it.category || '') === viewFilters.category);
        if (viewFilters.lowOnly)
            base = base.filter((it) => (Number(it.qty) || 0) <= (Number(it.minQty) || 0));

        const q = (document.getElementById('inv-search')?.value || '').toLowerCase().trim();
        if (q)
            base = base.filter((it) =>
                String(it.name || '').toLowerCase().includes(q) ||
                String(it.sku  || '').toLowerCase().includes(q)
            );

        _filteredItems = base;

        if (_filteredItems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:20px;">لا توجد أصناف مطابقة للعرض الحالي.</td></tr>';
            return;
        }

        _appendRows(INV_INITIAL_CHUNK);
    }

    /** يضيف `count` صف من _filteredItems ابتداءً من _renderedCount */
    function _appendRows(count) {
        const fragment = document.createDocumentFragment();
        const end = Math.min(_renderedCount + count, _filteredItems.length);

        for (let i = _renderedCount; i < end; i++) {
            const { rowClass, html } = buildRowHtml(_filteredItems[i]);
            const tr = document.createElement('tr');
            if (rowClass) tr.className = rowClass;
            tr.innerHTML = html;
            fragment.appendChild(tr);
        }

        tbody.appendChild(fragment);
        _renderedCount = end;
        _bindRowActions(tbody);
    }

    /** يربط أحداث الأزرار فقط للصفوف الجديدة غير المربوطة */
    function _bindRowActions(container) {
        container.querySelectorAll('.btn-quick-in:not([data-bound])').forEach((btn) => {
            btn.dataset.bound = '1';
            btn.addEventListener('click', (e) => {
                const sku = e.currentTarget.dataset.sku;
                document.getElementById('tx-sku').value = sku;
                document.getElementById('tx-type').value = 'in';
                updateTxDropdown();
                openModal('txModal');
            });
        });
        container.querySelectorAll('.btn-edit-item:not([data-bound])').forEach((btn) => {
            btn.dataset.bound = '1';
            btn.addEventListener('click', (e) => {
                const sku = e.currentTarget.dataset.sku;
                const wh  = e.currentTarget.dataset.wh || currentWH;
                openItemModalEdit(sku, wh);
            });
        });
        container.querySelectorAll('.btn-delete-item:not([data-bound])').forEach((btn) => {
            btn.dataset.bound = '1';
            btn.addEventListener('click', (e) => {
                const sku = e.currentTarget.dataset.sku;
                const wh  = e.currentTarget.dataset.wh || currentWH;
                deleteItem(sku, wh);
            });
        });
    }

    /** تحديث قائمة الفئات المقترحة */
    function updateCategorySuggestions() {
        const datalist = document.getElementById('cat-list');
        if (!datalist) return;
        const cats = new Set();
        erpItems.forEach((it) => {
            if (it.category) cats.add(it.category);
        });
        // إضافة الفئات الافتراضية إذا لم تكن موجودة
        const defaultCats = ['المواد التموينية', 'اللحوم والدواجن', 'الخضروات والفاكهة', 'الزيوت والصلصات', 'البهارات والمكسرات', 'مواد تعبئة وتغليف'];
        defaultCats.forEach(c => cats.add(c));
        
        datalist.innerHTML = '';
        [...cats].sort().forEach((c) => {
            const option = document.createElement('option');
            option.value = c;
            datalist.appendChild(option);
        });
    }

    /** حذف صنف من المخزون */
    async function deleteItem(sku, wh) {
        const idx = findItemIndex(sku, wh);
        if (idx === -1) {
            alert('تعذر العثور على الصنف!');
            return;
        }
        const item = erpItems[idx];
        const confirmed = confirm(`⚠️ هل أنت متأكد من حذف الصنف التالي؟\n\nرمز الصنف: ${item.sku}\nاسم الصنف: ${item.name}\nالكمية الحالية: ${item.qty} ${item.unit || ''}\n\nسيتم حذف الصنف نهائياً من المخزون!`);
        if (!confirmed) return;

        // حذف الصنف من المصفوفة
        erpItems.splice(idx, 1);

        // حفظ التغييرات في قاعدة البيانات
        db.inventory = erpItems;
        await saveDB(db);

        // إعادة عرض الجدول وتحديث المؤشرات
        _patchedRender();
        renderKPIs();

        alert(`✅ تم حذف الصنف "${item.name}" بنجاح!`);
    }

    // ── Intersection Observer: تحميل المزيد عند الوصول لآخر صف ────────────
    const _sentinel = document.createElement('tr');
    _sentinel.id = 'inv-scroll-sentinel';
    _sentinel.innerHTML = '<td colspan="9" style="padding:4px"></td>';

    const _scrollObserver = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        if (_isLoadingMore) return;
        if (_renderedCount >= _filteredItems.length) return;

        _isLoadingMore = true;
        // requestAnimationFrame يضمن الاستجابة بعد رسم الإطار الحالي
        requestAnimationFrame(() => {
            _appendRows(INV_LOAD_MORE);
            _isLoadingMore = false;
        });
    }, { threshold: 0.1 });

    // أعد تعليق sentinel بعد كل renderTable
    const _origRenderTable = renderTable;
    function _observeSentinel() {
        tbody.appendChild(_sentinel);
        _scrollObserver.observe(_sentinel);
    }
    // نُضيف sentinel بعد استدعاء renderTable
    const _patchedRender = function() {
        _scrollObserver.unobserve(_sentinel);
        renderTable();
        if (_filteredItems.length > INV_INITIAL_CHUNK) _observeSentinel();
    };

    // ── Debounce: بحث 300ms ─────────────────────────────────────────────────
    let _invSearchTimer;
    document.getElementById('inv-search')?.addEventListener('input', () => {
        clearTimeout(_invSearchTimer);
        _invSearchTimer = setTimeout(() => _patchedRender(), 300);
    });

    _patchedRender();
    renderKPIs();
    // تفعيل sentinel عند التحميل الأول
    if (_filteredItems.length > INV_INITIAL_CHUNK) _observeSentinel();

    if (typeof window.registerPosDatabaseRefresh === 'function') {
        window.registerPosDatabaseRefresh(async () => {
            db = await window.dbRead();
            erpItems = db.inventory || [];
            erpTx = db.inventoryTx || [];
            _patchedRender();
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
            _patchedRender();
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
        updateCategorySuggestions();
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
        updateCategorySuggestions();
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
                <div style="background: var(--bg-main); border-radius:12px; padding:20px; text-align:right;">
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
                        <strong style="color:var(--text-primary); font-size:22px;">${xf(valMain + valRest + valBev)}</strong>
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
            
            // منع الإرسال المزدوج
            const submitBtn = e.target.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> جاري التحويل...';
            }
            
            try {
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
                formTransfer.reset();
                
                // تأجيل إعادة التحميل لمنع الشاشة السوداء
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        renderTable();
                        renderKPIs();
                        alert('تم تحويل البضاعة بنجاح وتسجيل سند التحويل!');
                    });
                });
            } catch (error) {
                console.error('Error transferring inventory:', error);
                alert('حدث خطأ أثناء التحويل');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="ph ph-check-circle"></i> تأكيد التحويل';
                }
            }
        });
    }

    const formItem = document.getElementById('form-item');
    if (formItem) {
        formItem.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // منع الإرسال المزدوج
            const submitBtn = e.target.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> جاري الحفظ...';
            }
            
            try {
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
                
                // تأجيل إعادة التحميل لمنع الشاشة السوداء
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        renderTable();
                        renderKPIs();
                    });
                });
            } catch (error) {
                console.error('Error saving inventory item:', error);
                alert('حدث خطأ أثناء حفظ الصنف');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="ph ph-check-circle"></i> حفظ الصنف';
                }
            }
        });
    }

    const formTx = document.getElementById('form-tx');

    const destLabels = {
        kitchen_main: 'المطبخ الرئيسي',
        kitchen_cold: 'قسم التحضير البارد',
        kitchen_grills: 'قسم المشويات',
        kitchen_pastry: 'قسم الحلويات والمخبوزات',
        production: 'قسم الإنتاج والتجهيز',
        bar: 'البار والمشروبات',
        other: 'أخرى'
    };

    function updateTxDropdown() {
        const skuSelect = document.getElementById('tx-sku');
        if (skuSelect) {
            const currentItems = erpItems.filter((i) => whNorm(i.warehouseId) === currentWH);
            skuSelect.innerHTML = currentItems.map((it) => `<option value="${it.sku}">${it.name} — متوفر: ${it.qty} ${it.unit || ''} (${it.sku})</option>`).join('');
        }
    }

    function updateTxModalUI() {
        const bType = document.getElementById('tx-type').value;
        const isOut = bType === 'out';
        const destGrp  = document.getElementById('tx-dest-group');
        const notesGrp = document.getElementById('tx-notes-group');
        const title    = document.getElementById('tx-modal-title');
        const submitBtn= document.getElementById('tx-submit-btn');
        if (destGrp)  destGrp.style.display  = isOut ? '' : 'none';
        if (notesGrp) notesGrp.style.display = isOut ? '' : 'none';
        if (title)    title.textContent = isOut ? 'إصدار أمر صرف (خروج للتشغيل)' : 'سند استلام (دخول مستودع)';
        if (submitBtn) submitBtn.textContent = isOut ? 'إصدار أمر الصرف' : 'تأكيد الاستلام';
        if (submitBtn) submitBtn.style.background = isOut ? 'linear-gradient(135deg,#f59e0b,#d97706)' : '';
    }

    document.getElementById('tx-type')?.addEventListener('change', updateTxModalUI);

    btnReceive?.addEventListener('click', () => { updateTxDropdown(); updateTxModalUI(); });
    btnIssue?.addEventListener('click',   () => { updateTxDropdown(); updateTxModalUI(); });

    if (formTx) {
        formTx.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // منع الإرسال المزدوج
            const submitBtn = e.target.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> جاري الحفظ...';
            }
            
            try {
                const bSku  = document.getElementById('tx-sku').value;
                const bType = document.getElementById('tx-type').value;
                const bQty  = Number(document.getElementById('tx-qty').value);

                const idx = erpItems.findIndex((it) => it.sku === bSku && whNorm(it.warehouseId) === currentWH);
                if (idx === -1) {
                    alert('الصنف غير موجود في المخزن الحالي.');
                    return;
                }

                if (bType === 'in') {
                    // ── Simple IN: add to stock directly ──
                    erpItems[idx].qty += bQty;

                    const newTxId = 'TX-' + Math.floor(Math.random() * 90000 + 10000);
                    const totalCost = bQty * erpItems[idx].cost;
                    const newTx = { id: newTxId, type: 'in', total: totalCost, date: Date.now(), wh: currentWH, sku: bSku, toWh: currentWH };
                    erpTx.push(newTx);

                    db.inventory = erpItems;
                    db.inventoryTx = erpTx;
                    await saveDB(db);

                    closeModal('txModal');
                    formTx.reset();
                    updateTxModalUI();
                    
                    // تأجيل إعادة التحميل لمنع الشاشة السوداء
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            renderTable();
                            renderKPIs();
                            printInventoryReceipt(newTx, erpItems[idx], bQty, 'in');
                        });
                    });

                } else {
                    // ── OUT: issue order flow ──
                    if (erpItems[idx].qty < bQty) {
                        alert(`الكمية المتوفرة (${erpItems[idx].qty}) لا تكفي للصرف (مطلوب: ${bQty})!`);
                        return;
                    }

                    const destKey  = document.getElementById('tx-dest').value;
                    const destName = destLabels[destKey] || destKey;
                    const notes    = document.getElementById('tx-notes').value;
                    const item     = erpItems[idx];

                    // Deduct from warehouse immediately
                    erpItems[idx].qty -= bQty;

                    const issueId   = 'ISS-' + Math.floor(Math.random() * 90000 + 10000);
                    const totalCost = bQty * item.cost;

                    // Log in inventoryTx (out)
                    erpTx.push({
                        id: issueId,
                        type: 'out',
                        total: totalCost,
                        date: Date.now(),
                        fromWh: currentWH,
                        sku: bSku,
                        destKey,
                        destName
                    });

                    // Create issue order record (to be confirmed by kitchen)
                    if (!db.issueOrders) db.issueOrders = [];
                    const issueOrder = {
                        id: issueId,
                        status: 'قيد الاستلام',
                        date: new Date().toISOString().split('T')[0],
                        dateTs: Date.now(),
                        fromWh: currentWH,
                        fromWhName: whNames[currentWH] || currentWH,
                        destKey,
                        destName,
                        sku: bSku,
                        itemName: item.name,
                        unit: item.unit || '',
                        qty: bQty,
                        cost: item.cost,
                        total: totalCost,
                        notes
                    };
                    db.issueOrders.push(issueOrder);

                    db.inventory   = erpItems;
                    db.inventoryTx = erpTx;
                    await saveDB(db);

                    closeModal('txModal');
                    formTx.reset();
                    updateTxModalUI();
                    
                    // تأجيل إعادة التحميل لمنع الشاشة السوداء
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            renderTable();
                            renderKPIs();
                            renderPendingReceipts();
                            printIssueOrder(issueOrder);
                            alert(`✅ تم إصدار أمر الصرف ${issueId}\nالصنف: ${item.name} — ${bQty} ${item.unit||''}\nالوجهة: ${destName}\n\nتم خصم الكمية من المخزون فوراً. ينتظر تأكيد الاستلام من ${destName}.`);
                        });
                    });
                }
            } catch (error) {
                console.error('Error processing inventory transaction:', error);
                alert('حدث خطأ أثناء العملية');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = bType === 'in' ? 'تأكيد الاستلام' : 'إصدار أمر الصرف';
                }
            }
        });
    }

    // ── Print Issue Order Document (Thermal 80mm) ───────────────────────────
    function printIssueOrder(order) {
        const dateStr = new Date(order.dateTs || Date.now()).toLocaleString('ar-SA');
        
        const settings = db.settings || {};
        const storeName = settings.storeName || 'إدارة النظام';
        const logoBase64 = settings.logoBase64 || '';
        
        let logoHtml = '';
        if (logoBase64) {
            logoHtml = `<img src="${logoBase64}" class="store-logo" alt="شعار المتجر">`;
        }

        const w = window.open('', '_blank', 'width=400,height=600');
        w.document.write(`<!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <title>أمر صرف - ${order.id}</title>
                <style>
                    *, *::before, *::after {
                        box-sizing: border-box;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    html, body {
                        margin: 0;
                        padding: 0;
                        width: 100%;
                        max-width: 80mm;
                        margin: 0 auto;
                        background: #ffffff;
                        color: #000000;
                        direction: rtl;
                        unicode-bidi: embed;
                        font-family: 'Cairo', 'Segoe UI', 'Arial', 'Tahoma', sans-serif;
                        text-align: center;
                        line-height: 1.4;
                        font-size: 10pt;
                        -webkit-font-smoothing: antialiased;
                        overflow: visible;
                        word-break: break-word;
                        overflow-wrap: anywhere;
                        -webkit-text-size-adjust: none;
                    }
                    @page {
                        size: 80mm auto;
                        margin: 0;
                    }
                    .receipt-wrapper {
                        width: 100%;
                        padding-top: 3mm;
                        padding-bottom: 3mm;
                        padding-left: 4mm;
                        padding-right: 6mm;
                        margin: 0 auto;
                        box-sizing: border-box;
                        unicode-bidi: embed;
                        font-variant-numeric: tabular-nums;
                    }
                    .store-logo {
                        width: 29mm;
                        height: 29mm;
                        object-fit: contain;
                        margin-left: auto;
                        margin-right: auto;
                        display: block;
                        margin-bottom: 2mm;
                        filter: grayscale(100%);
                        image-rendering: -webkit-optimize-contrast;
                        image-rendering: crisp-edges;
                        image-rendering: pixelated;
                    }
                    .header { text-align: center; border-bottom: 1.5px dashed #000; padding-bottom: 3mm; margin-bottom: 3mm; }
                    .header h2 { margin: 0 0 2mm 0; font-size: 14pt; font-weight: bold; }
                    .header p { margin: 0; font-size: 10pt; color: #000; }
                    .header h3 { margin: 1mm 0 0 0; border:1px solid #000; display:inline-block; padding:1.5mm 3mm; border-radius:1mm; font-size:11pt; font-weight: bold; }
                    .details { text-align: start; margin-bottom: 3mm; padding: 0; }
                    .details p { margin: 1.5mm 0; font-size: 9.5pt; border-bottom: 1px dotted #666; padding-bottom: 1mm; display: flex; justify-content: space-between; align-items: start; gap: 2mm;}
                    .details span.label { font-weight: bold; text-align: start; flex-shrink: 0; }
                    .details span.val { text-align: end; word-break: break-word; }
                    .main-item { border: 2px solid #000; border-radius: 2mm; padding: 2mm; margin: 3mm 0; text-align: center; }
                    .main-item h4 { margin: 0 0 1mm 0; font-size: 12pt; }
                    .main-item .qty { font-size: 14pt; font-weight: 900; }
                    .notice { border: 1px dotted #000; padding: 2mm; font-size: 9pt; text-align: center; margin-top: 3mm; }
                    .footer { text-align: start; margin-top: 5mm; font-size: 9pt; border-top: 1.5px dashed #000; padding-top: 3mm;}
                    .footer p { margin: 3mm 0; display: flex; justify-content: space-between; gap: 2mm;}
                </style>
            </head>
            <body>
                <div class="receipt-wrapper">
                    <div class="header">
                        ${logoHtml}
                        <h2>${storeName}</h2>
                        <p>إدارة المخازن والمستودعات</p>
                        <h3>أمر صرف مواد</h3>
                    </div>
                    <div class="details">
                        <p><span class="label">رقم أمر الصرف:</span> <span class="val">${order.id}</span></p>
                        <p><span class="label">تاريخ الإصدار:</span> <span class="val">${dateStr}</span></p>
                        <p><span class="label">مستودع المصدر:</span> <span class="val">${order.fromWhName}</span></p>
                        <p><span class="label">الجهة المستلِمة:</span> <span class="val">${order.destName}</span></p>
                        <p><span class="label">تكلفة الوحدة:</span> <span class="val">${xf(order.cost)}</span></p>
                    </div>

                    <div class="main-item">
                        <h4>${order.itemName} / ${order.sku}</h4>
                        <div class="qty">${order.qty} ${order.unit}</div>
                        ${order.notes ? `<div style="margin-top: 1mm; font-size: 9pt;">ملاحظات: ${order.notes}</div>` : ''}
                    </div>

                    <div class="details">
                        <p><span class="label">إجمالي التكلفة:</span> <span class="val">${xf(order.total)}</span></p>
                        <p><span class="label">حالة الاستلام:</span> <span class="val">بانتظار التأكيد</span></p>
                    </div>

                    <div class="notice">هذا السند يُثبت خروج البضاعة من المخزون.<br>يرجى تأكيد الاستلام من طرف ${order.destName}.</div>

                    <div class="footer">
                        <p><span style="flex:1;">أمين المستودع</span> <span style="flex:1;text-align:end;">.................</span></p>
                        <p><span style="flex:1;">مستلم البضاعة</span> <span style="flex:1;text-align:end;">.................</span></p>
                        <p style="text-align: center; justify-content: center; margin-top: 4mm;">طبعت بواسطة نظام الإدارة الإلكتروني</p>
                    </div>
                </div>
            </body>
            </html>
        `);
        w.document.close();
        w.focus();
        setTimeout(() => { w.print(); w.close(); }, 600);
    }

    function printInventoryReceipt(tx, item, qty, type) {
        const typeName = type === 'in' ? 'سند إدخال (استلام)' : 'أمر صرف (خروج)';
        const dateStr = new Date(tx.date).toLocaleString('ar-SA');
        
        const settings = db.settings || {};
        const storeName = settings.storeName || 'إدارة النظام';
        const logoBase64 = settings.logoBase64 || '';
        
        let logoHtml = '';
        if (logoBase64) {
            logoHtml = `<img src="${logoBase64}" class="store-logo" alt="شعار المتجر">`;
        }

        const receiptWindow = window.open('', '_blank', 'width=400,height=600');
        receiptWindow.document.write(`
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <title>طباعة ${typeName}</title>
                <style>
                    *, *::before, *::after {
                        box-sizing: border-box;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    html, body {
                        margin: 0;
                        padding: 0;
                        width: 100%;
                        max-width: 80mm;
                        margin: 0 auto;
                        background: #ffffff;
                        color: #000000;
                        direction: rtl;
                        unicode-bidi: embed;
                        font-family: 'Cairo', 'Segoe UI', 'Arial', 'Tahoma', sans-serif;
                        text-align: center;
                        line-height: 1.4;
                        font-size: 10pt;
                        -webkit-font-smoothing: antialiased;
                        overflow: visible;
                        word-break: break-word;
                        overflow-wrap: anywhere;
                        -webkit-text-size-adjust: none;
                    }
                    @page {
                        size: 80mm auto;
                        margin: 0;
                    }
                    .receipt-wrapper {
                        width: 100%;
                        padding-top: 3mm;
                        padding-bottom: 3mm;
                        padding-left: 4mm;
                        padding-right: 6mm;
                        margin: 0 auto;
                        box-sizing: border-box;
                        unicode-bidi: embed;
                        font-variant-numeric: tabular-nums;
                    }
                    .store-logo {
                        width: 29mm;
                        height: 29mm;
                        object-fit: contain;
                        margin-left: auto;
                        margin-right: auto;
                        display: block;
                        margin-bottom: 2mm;
                        filter: grayscale(100%);
                        image-rendering: -webkit-optimize-contrast;
                        image-rendering: crisp-edges;
                        image-rendering: pixelated;
                    }
                    .header { text-align: center; border-bottom: 1.5px dashed #000; padding-bottom: 3mm; margin-bottom: 3mm; }
                    .header h2 { margin: 0 0 2mm 0; font-size: 14pt; font-weight: bold; }
                    .header p { margin: 0; font-size: 10pt; color: #000; }
                    .header h3 { margin: 1mm 0 0 0; border:1px solid #000; display:inline-block; padding:1.5mm 3mm; border-radius:1mm; font-size:11pt; font-weight: bold; }
                    .details { text-align: start; margin-bottom: 3mm; padding: 0; }
                    .details p { margin: 1.5mm 0; font-size: 9.5pt; border-bottom: 1px dotted #666; padding-bottom: 1mm; display: flex; justify-content: space-between; align-items: start; gap: 2mm;}
                    .details span.label { font-weight: bold; text-align: start; flex-shrink: 0; }
                    .details span.val { text-align: end; word-break: break-word; }
                    .footer { text-align: start; margin-top: 5mm; font-size: 9pt; border-top: 1.5px dashed #000; padding-top: 3mm;}
                    .footer p { margin: 3mm 0; display: flex; justify-content: space-between; }
                </style>
            </head>
            <body>
                <div class="receipt-wrapper">
                    <div class="header">
                        ${logoHtml}
                        <h2>${storeName}</h2>
                        <p>المخازن والمستودعات</p>
                        <h3>${typeName}</h3>
                    </div>

                    <div class="details">
                        <p><span class="label">رقم السند:</span> <span class="val">${tx.id}</span></p>
                        <p><span class="label">تاريخ ووقت:</span> <span class="val">${dateStr}</span></p>
                        <p><span class="label">المستودع:</span> <span class="val">${item.warehouseId === 'main' ? 'المستودع الرئيسي' : item.warehouseId === 'restaurant' ? 'مخزن المطعم' : 'مخزن المشروبات'}</span></p>
                        <br>
                        <p><span class="label">رقم الصنف:</span> <span class="val">${item.sku}</span></p>
                        <p><span class="label">اسم الصنف:</span> <span class="val">${item.name}</span></p>
                        <p><span class="label">الكمية:</span> <span class="val">${qty} ${item.unit || ''}</span></p>
                        <p><span class="label">تكلفة الوحدة:</span> <span class="val">${xf(item.cost)}</span></p>
                        <p><span class="label">الإجمالي:</span> <span class="val">${xf(tx.total)}</span></p>
                        <p><span class="label">المشرف المسؤول:</span> <span class="val">سالم أحمد</span></p>
                    </div>

                    <div class="footer">
                        <p><span>توقيع أمين المستودع</span> <span>.........................</span></p>
                        <p><span>توقيع المستلم</span> <span>.........................</span></p>
                        <p style="text-align: center; justify-content: center; margin-top: 4mm;">طبعت بواسطة نظام الإدارة الإلكتروني</p>
                    </div>
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
