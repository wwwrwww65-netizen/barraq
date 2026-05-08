const { ipcRenderer } = require('electron');

async function saveDB(db) {
    await window.dbWrite(db);
    try { ipcRenderer.send('notify-db-changed'); } catch (e) { }
}

document.addEventListener('DOMContentLoaded', async () => {
    const xf = (n) => (window.MisterCasherCurrency ? MisterCasherCurrency.format(n) : Number(n).toFixed(2) + ' ر.س');
    const curSym = () => (window.MisterCasherCurrency ? MisterCasherCurrency.getConfig().symbol : 'ر.س');

    // Helper for Arabic Pluralization
    function formatArabicQty(qty, unit) {
        const q = Math.round(qty);
        if (q === 0) return '0 ' + unit;

        // Define common unit plurals
        const unitMap = {
            'حبة': { dual: 'حبتين', plural: 'حبات' },
            'خروف': { dual: 'خروفين', plural: 'خراف' },
            'كيس': { dual: 'كيسين', plural: 'أكياس' },
            'كرتون': { dual: 'كرتونين', plural: 'كراتين' },
            'طبق': { dual: 'طبقين', plural: 'أطباق' },
            'نفر': { dual: 'نفرين', plural: 'نفرات' },
            'حبه': { dual: 'حبتين', plural: 'حبات' }
        };

        const map = unitMap[unit] || { dual: unit + 'ين', plural: unit };

        if (q === 1) return unit;
        if (q === 2) return map.dual;
        if (q >= 3 && q <= 10) return q + ' ' + map.plural;
        return q + ' ' + unit;
    }
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
        } catch (e) { return 15; }
    }

    function renderPendingReceipts() {
        const pending = (db.purchases || []).filter(p => p.status === 'قيد الاستلام');
        const section = document.getElementById('pending-receipts-section');
        const list = document.getElementById('pending-receipts-list');
        const badge = document.getElementById('pending-count-badge');
        const navLink = document.getElementById('nav-pending-link');
        const navCnt = document.getElementById('nav-pending-count');

        if (!section || !list) return;

        if (pending.length === 0) {
            section.style.display = 'none';
            if (navLink) navLink.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        if (badge) badge.textContent = pending.length + ' فاتورة معلقة';
        if (navLink) navLink.style.display = '';
        if (navCnt) navCnt.textContent = pending.length;

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

    // --- Fix for Pending Receipts Sidebar Link ---
    const navPendingLink = document.getElementById('nav-pending-link');
    if (navPendingLink) {
        navPendingLink.addEventListener('click', (e) => {
            e.preventDefault();
            const section = document.getElementById('pending-receipts-section');
            if (section) {
                section.style.display = 'block'; // Ensure it's visible
                section.scrollIntoView({ behavior: 'smooth', block: 'start' });

                // Add a temporary highlight effect
                const inner = section.querySelector('div');
                if (inner) {
                    inner.style.transition = 'all 0.5s ease';
                    inner.style.boxShadow = '0 0 30px rgba(234,179,8,0.5)';
                    inner.style.borderColor = '#fbbf24';
                    setTimeout(() => {
                        inner.style.boxShadow = '';
                        inner.style.borderColor = 'rgba(234,179,8,0.4)';
                    }, 2000);
                }
            }
        });
    }

    async function whReceivePurchase(pur) {
        const taxPct = getSystemTaxRate();
        const destWh = pur.destWh || 'main';

        pur.items.forEach(buyItem => {
            const unitCost = buyItem.price / (1 + taxPct / 100);
            let invItem = erpItems.find(i => i.sku === buyItem.sku && (i.warehouseId || 'main') === destWh);

            const standardYield = (invItem ? invItem.standardYield : 0) || 1;
            const actualYield = Number(buyItem.yield) || 0;

            // Calculation: AddedQty = (Total Actual Yield / Standard Yield)
            // If no yield specified, we assume physical quantity matches standard.
            let addedQty = buyItem.qty;
            if (actualYield > 0) {
                addedQty = actualYield / standardYield;
                console.log(`[Yield Management] Normalizing ${buyItem.qty} physical units (Yield ${actualYield}) to ${addedQty.toFixed(4)} standard units (Std ${standardYield})`);
            }

            if (invItem) {
                invItem.qty = (Number(invItem.qty) || 0) + addedQty;
                invItem.physicalQty = (Number(invItem.physicalQty) || (Number(invItem.qty) - addedQty) || 0) + buyItem.qty;
                invItem.cost = unitCost * (buyItem.qty / addedQty); // Adjusted cost to reflect standard unit
            } else {
                let src = erpItems.find(i => i.sku === buyItem.sku);
                if (src) {
                    let clone = {
                        ...src,
                        warehouseId: destWh,
                        qty: addedQty,
                        physicalQty: buyItem.qty,
                        cost: unitCost * (buyItem.qty / addedQty)
                    };
                    erpItems.push(clone);
                } else {
                    erpItems.push({
                        sku: buyItem.sku,
                        name: buyItem.name,
                        category: '',
                        unit: '',
                        cost: unitCost * (buyItem.qty / addedQty),
                        qty: addedQty,
                        physicalQty: buyItem.qty,
                        minQty: 0,
                        warehouseId: destWh,
                        standardYield: 1 // Default if unknown
                    });
                }
            }

            erpTx.push({
                id: 'TX-' + Math.floor(Math.random() * 90000 + 10000),
                type: 'in',
                total: buyItem.qty * unitCost,
                date: Date.now(),
                fromWh: 'SUPPLIER',
                warehouseId: destWh,
                sku: buyItem.sku,
                refInvoice: pur.id,
                actualQty: buyItem.qty,
                normalizedQty: addedQty
            });
        });

        pur.status = 'مستلمة بالمخزن';
        db.inventory = erpItems;
        db.inventoryTx = erpTx;
        await window.dbWrite(db);
        try { const { ipcRenderer } = require('electron'); ipcRenderer.send('notify-db-changed'); } catch (e) { }

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
        const dateStr = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
        let rows = ''; let sub = 0;
        (pur.items || []).forEach((it, i) => {
            const uc = it.price / (1 + taxPct / 100);
            const lt = it.qty * uc;
            sub += lt;
            rows += `<tr><td style="text-align:center">${i + 1}</td><td>${it.name}</td><td style="text-align:center">${it.qty}</td><td style="text-align:center">${uc.toFixed(2)}</td><td style="text-align:center">${lt.toFixed(2)}</td><td style="text-align:center;color:green">✓</td></tr>`;
        });
        const w = window.open('', '_blank', 'width=820,height=700');
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
          <div class="box"><label>طريقة الدفع</label><span>${pur.payMethod === 'cash' ? 'نقداً' : pur.payMethod === 'bank' ? 'حوالة بنكية' : 'آجل (ذمة)'}</span></div>
          <div class="box"><label>حالة الاستلام</label><span style="color:#10b981">✓ تم الاستلام وإدخال المخزون</span></div>
        </div>
        <table><thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>سعر الوحدة (ق.ض)</th><th>الإجمالي</th><th>تم الإدخال</th></tr></thead>
        <tbody>${rows}</tbody></table>
        <div style="display:flex;justify-content:flex-end"><div class="sumbox">
          <div class="sl"><span>إجمالي قبل الضريبة:</span><span>${sub.toFixed(2)} ر.س</span></div>
          <div class="sl"><span>ضريبة ${taxPct}%:</span><span>${(sub * taxPct / 100).toFixed(2)} ر.س</span></div>
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
                <td class="physical-col" style="text-align:center;">${formatArabicQty(item.physicalQty != null ? item.physicalQty : qty, item.unit || 'وحدة')}</td>
                <td class="qty-col ${qty === 0 ? 'empty' : qty <= minQ ? 'low' : 'safe'}">${qty.toFixed(3)}</td>
                <td style="text-align:center; color:var(--text-muted); font-size:12px;">${item.standardYield || 1}</td>
                <td class="capacity-col" style="text-align:center;">${(qty * (item.standardYield || 1)).toFixed(1)}</td>
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
    const INV_LOAD_MORE = 20;    // كل scroll إضافي
    let _filteredItems = [];    // البيانات المصفاة الكاملة
    let _renderedCount = 0;     // كم صف رُسم حتى الآن
    let _isLoadingMore = false; // حارس لمنع طلبين متزامنين

    /** يُرتّب البيانات المصفاة ويُخزّنها، ثم يرسم أول chunk */
    function renderTable() {
        updateTableTitle();
        if (!erpItems || erpItems.length === 0) {
            console.warn('[Inventory] renderTable called but erpItems is empty. Skipping clear to prevent data disappearance.');
            // If it's truly empty (first load), we show the message, otherwise we keep old data
            if (tbody.innerHTML === '') {
                tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:20px;">جاري تحميل البيانات...</td></tr>';
            }
            return;
        }

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
                String(it.sku || '').toLowerCase().includes(q)
            );

        _filteredItems = base;

        if (_filteredItems.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align:center;color:var(--text-muted);padding:40px;">
                        <i class="ph ph-mask-sad" style="font-size:48px;display:block;margin-bottom:15px;opacity:0.5;"></i>
                        <div style="font-size:18px;font-weight:700;margin-bottom:8px;">لا توجد أصناف مطابقة للعرض الحالي</div>
                        <p style="font-size:14px;margin-bottom:20px;opacity:0.8;">ربما قمت باختيار مستودع فارغ أو أن هناك تصفية نشطة.</p>
                        <button type="button" class="glass-btn" onclick="window.location.reload()" style="padding:8px 20px;">
                            <i class="ph ph-arrows-clockwise"></i> تحديث الصفحة بالكامل
                        </button>
                    </td>
                </tr>`;
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
                const wh = e.currentTarget.dataset.wh || currentWH;
                openItemModalEdit(sku, wh);
            });
        });
        container.querySelectorAll('.btn-delete-item:not([data-bound])').forEach((btn) => {
            btn.dataset.bound = '1';
            btn.addEventListener('click', (e) => {
                const sku = e.currentTarget.dataset.sku;
                const wh = e.currentTarget.dataset.wh || currentWH;
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
    const _patchedRender = function () {
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
            // Stagger staggered refresh to avoid file lock contention among windows
            const staggerDelay = Math.floor(Math.random() * 800) + 100;
            console.log(`[Inventory] 🔄 Database update notification received. Refreshing in ${staggerDelay}ms...`);

            setTimeout(async () => {
                const newDb = await window.dbRead();
                if (newDb && newDb.inventory && newDb.inventory.length > 0) {
                    db = newDb;
                    erpItems = db.inventory || [];
                    erpTx = db.inventoryTx || [];
                    _patchedRender();
                    renderKPIs();
                    console.log('[Inventory] ✅ UI Refreshed with', erpItems.length, 'items');
                } else {
                    console.warn('[Inventory] ⚠️ Received empty database on refresh, ignoring to prevent UI clear.');
                }
            }, staggerDelay);
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
        document.getElementById('item-sku-input').value = '';
        document.getElementById('item-sku-input').disabled = false;
        document.getElementById('item-modal-title').textContent = 'تعريف منتج مخزني جديد';

        const hasQtyCheck = document.getElementById('item-has-qty');
        const qtyInput = document.getElementById('item-qty');
        const physInput = document.getElementById('item-physical-qty');
        const lblStd = document.getElementById('lbl-qty-std');
        const lblPhys = document.getElementById('lbl-qty-phys');
        const qtyNote = document.getElementById('qty-note');

        if (hasQtyCheck) {
            hasQtyCheck.checked = false;
            hasQtyCheck.parentElement.style.display = 'flex';
        }
        if (qtyInput) {
            qtyInput.style.display = 'none';
            qtyInput.required = false;
        }
        if (physInput) {
            physInput.style.display = 'none';
            physInput.required = false;
        }
        if (lblStd) lblStd.style.display = 'none';
        if (lblPhys) lblPhys.style.display = 'none';
        if (qtyNote) qtyNote.style.display = 'none';

        document.getElementById('item-submit-btn').textContent = 'حفظ المنتج';
        document.getElementById('item-standard-yield').value = '1';
        document.getElementById('form-item').reset();
        updateCategorySuggestions();
    }

    // Toggle Quantity Input visibility
    document.getElementById('item-has-qty')?.addEventListener('change', (e) => {
        const qtyInput = document.getElementById('item-qty');
        const physInput = document.getElementById('item-physical-qty');
        const lblStd = document.getElementById('lbl-qty-std');
        const lblPhys = document.getElementById('lbl-qty-phys');
        const qtyNote = document.getElementById('qty-note');

        const show = e.target.checked;
        if (qtyInput) { qtyInput.style.display = show ? 'block' : 'none'; qtyInput.required = show; }
        if (physInput) { physInput.style.display = show ? 'block' : 'none'; physInput.required = show; }
        if (lblStd) lblStd.style.display = show ? 'block' : 'none';
        if (lblPhys) lblPhys.style.display = show ? 'block' : 'none';
        if (qtyNote) qtyNote.style.display = show ? 'block' : 'none';
    });

    function openItemModalEdit(sku, wh) {
        const idx = findItemIndex(sku, wh);
        if (idx === -1) return;
        const it = erpItems[idx];
        resetItemModal();
        document.getElementById('item-edit-sku').value = sku;
        document.getElementById('item-edit-wh').value = whNorm(it.warehouseId);
        document.getElementById('item-modal-title').textContent = 'تعديل صنف مخزني';

        const hasQtyCheck = document.getElementById('item-has-qty');
        const qtyInput = document.getElementById('item-qty');
        const physInput = document.getElementById('item-physical-qty');
        const lblStd = document.getElementById('lbl-qty-std');
        const lblPhys = document.getElementById('lbl-qty-phys');
        const qtyNote = document.getElementById('qty-note');

        if (hasQtyCheck) {
            hasQtyCheck.checked = true;
            hasQtyCheck.parentElement.style.display = 'none'; // Hide checkbox during edit
        }
        if (qtyInput) {
            qtyInput.style.display = 'block';
            qtyInput.required = true;
        }
        if (physInput) {
            physInput.style.display = 'block';
            physInput.required = true;
        }
        if (lblStd) lblStd.style.display = 'block';
        if (lblPhys) lblPhys.style.display = 'block';
        if (qtyNote) qtyNote.style.display = 'block';

        document.getElementById('item-submit-btn').textContent = 'حفظ التعديلات';
        document.getElementById('item-name').value = it.name || '';
        document.getElementById('item-cat').value = it.category || '';
        document.getElementById('item-unit').value = it.unit || '';
        document.getElementById('item-cost').value = it.cost ?? '';
        document.getElementById('item-qty').value = it.qty ?? '';
        document.getElementById('item-physical-qty').value = it.physicalQty ?? it.qty ?? '';
        document.getElementById('item-min').value = it.minQty ?? '';
        document.getElementById('item-standard-yield').value = it.standardYield || 1;

        const skuInput = document.getElementById('item-sku-input');
        if (skuInput) {
            skuInput.value = it.sku || '';
            skuInput.disabled = true; // Don't allow changing SKU during edit to maintain data integrity
        }

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
                    erpItems[idx].physicalQty = Number(document.getElementById('item-physical-qty').value);
                    erpItems[idx].minQty = Number(document.getElementById('item-min').value);
                    erpItems[idx].standardYield = Number(document.getElementById('item-standard-yield').value) || 1;
                } else {
                    const skuFromInput = document.getElementById('item-sku-input').value.trim();
                    const hasQty = document.getElementById('item-has-qty').checked;

                    const newItem = {
                        sku: skuFromInput || ('SKU-' + Math.floor(1000 + Math.random() * 9000)),
                        name: document.getElementById('item-name').value,
                        category: document.getElementById('item-cat').value,
                        unit: document.getElementById('item-unit').value,
                        cost: Number(document.getElementById('item-cost').value),
                        qty: hasQty ? Number(document.getElementById('item-qty').value) : 0,
                        physicalQty: hasQty ? Number(document.getElementById('item-physical-qty').value) : 0,
                        minQty: Number(document.getElementById('item-min').value),
                        standardYield: Number(document.getElementById('item-standard-yield').value) || 1,
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
            skuSelect.innerHTML = currentItems.map((it) => {
                const phys = (it.physicalQty != null ? it.physicalQty : it.qty);
                const std = Number(it.qty) || 0;
                return `<option value="${it.sku}">${it.name} — متوفر: ${formatArabicQty(phys, it.unit || 'وحدة')} (قيمة إنتاجية: ${std.toFixed(2)})</option>`;
            }).join('');
        }
    }

    function updateTxModalUI() {
        const bType = document.getElementById('tx-type').value;
        const isOut = bType === 'out';
        const destGrp = document.getElementById('tx-dest-group');
        const capGrp = document.getElementById('tx-capacity-group');
        const notesGrp = document.getElementById('tx-notes-group');
        const title = document.getElementById('tx-modal-title');
        const submitBtn = document.getElementById('tx-submit-btn');
        if (destGrp) destGrp.style.display = isOut ? '' : 'none';
        if (capGrp) capGrp.style.display = isOut ? '' : 'none';
        if (notesGrp) notesGrp.style.display = isOut ? '' : 'none';
        if (title) title.textContent = isOut ? 'إصدار أمر صرف (خروج للتشغيل)' : 'سند استلام (دخول مستودع)';
        if (submitBtn) submitBtn.textContent = isOut ? 'إصدار أمر الصرف' : 'تأكيد الاستلام';
        if (submitBtn) submitBtn.style.background = isOut ? 'linear-gradient(135deg,#f59e0b,#d97706)' : '';
    }

    document.getElementById('tx-type')?.addEventListener('change', updateTxModalUI);

    btnReceive?.addEventListener('click', () => { updateTxDropdown(); updateTxModalUI(); });
    btnIssue?.addEventListener('click', () => { updateTxDropdown(); updateTxModalUI(); });

    // Auto-calc capacity when qty changes
    document.getElementById('tx-qty')?.addEventListener('input', (e) => {
        const qty = Number(e.target.value);
        const sku = document.getElementById('tx-sku').value;
        const item = erpItems.find(it => it.sku === sku && whNorm(it.warehouseId) === currentWH);
        if (item && qty > 0) {
            const ratio = (Number(item.physicalQty) > 0) ? (Number(item.qty) / Number(item.physicalQty)) : 1;
            const cap = qty * ratio * (item.standardYield || 1);
            // إظهار الرقم بدون أصفار زائدة (مثلاً 16 بدلاً من 16.0)
            document.getElementById('tx-capacity').value = parseFloat(cap.toFixed(2));
        }
    });

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
                const bSku = document.getElementById('tx-sku').value;
                const bType = document.getElementById('tx-type').value;
                const bQty = Number(document.getElementById('tx-qty').value);

                const idx = erpItems.findIndex((it) => it.sku === bSku && whNorm(it.warehouseId) === currentWH);
                if (idx === -1) {
                    alert('الصنف غير موجود في المخزن الحالي.');
                    return;
                }

                if (bType === 'in') {
                    // ── Simple IN: treat bQty as Physical Unit ──
                    const item = erpItems[idx];
                    const ratio = (Number(item.physicalQty) > 0) ? (Number(item.qty) / Number(item.physicalQty)) : 1;
                    const stdAddition = bQty * ratio;

                    item.qty = (Number(item.qty) || 0) + stdAddition;
                    item.physicalQty = (Number(item.physicalQty) || (item.qty - stdAddition) || 0) + bQty;

                    const newTxId = 'TX-' + Math.floor(Math.random() * 90000 + 10000);
                    const totalCost = stdAddition * (item.cost || 0);
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
                    const item = erpItems[idx];
                    const bCap = Number(document.getElementById('tx-capacity').value);

                    let stdDeduction;
                    if (bCap > 0) {
                        // Use manually entered capacity (justice for kitchen)
                        stdDeduction = bCap / (item.standardYield || 1);
                    } else {
                        // Use average ratio
                        const ratio = (Number(item.physicalQty) > 0) ? (Number(item.qty) / Number(item.physicalQty)) : 1;
                        stdDeduction = bQty * ratio;
                    }

                    if (item.qty < stdDeduction) {
                        alert(`الكمية المتوفرة لا تكفي للصرف!`);
                        return;
                    }

                    const destKey = document.getElementById('tx-dest').value;
                    const destName = destLabels[destKey] || destKey;
                    const notes = document.getElementById('tx-notes').value;

                    // Deduct from warehouse
                    item.qty -= stdDeduction;
                    item.physicalQty = (Number(item.physicalQty) || 0) - bQty;

                    const issueId = 'ISS-' + Math.floor(Math.random() * 90000 + 10000);
                    const totalCost = stdDeduction * (item.cost || 0);

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
                        standardYield: item.standardYield || 1,
                        notes
                    };
                    db.issueOrders.push(issueOrder);

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
                            renderPendingReceipts();
                            printIssueOrder(issueOrder);
                            alert(`✅ تم إصدار أمر الصرف ${issueId}\nالصنف: ${item.name} — ${bQty} ${item.unit || ''}\nالوجهة: ${destName}\n\nتم خصم الكمية من المخزون فوراً. ينتظر تأكيد الاستلام من ${destName}.`);
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
