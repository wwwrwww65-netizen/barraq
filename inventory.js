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
    let currentWH = 'main';
    const viewFilters = { lowOnly: false, category: '' };

    const whTitles = {
        main: 'مراقبة أرصدة الأصناف (المستودع الرئيسي)',
        restaurant: 'مراقبة أرصدة الأصناف (مخزن المطعم الداخلي)',
        beverages: 'مراقبة أرصدة الأصناف (مخزن المشروبات)'
    };

    function getSystemTaxRate() {
        try {
            const s = JSON.parse(localStorage.getItem('restaurant_settings') || '{}');
            const rate = parseFloat(s.taxRate);
            return isNaN(rate) ? 15 : rate;
        } catch (e) { return 15; }
    }

    function renderPendingReceipts() {
        const pending = (db.purchases || []).filter(p => p.status === 'قيد الاستلام');
        const cancellations = (db.purchases || []).filter(p => p.status === 'بانتظار تأكيد إلغاء الاستلام');
        const pendingIssues = (db.issueOrders || []).filter(o => (o.destWh || o.destKey) === currentWH && o.status === 'قيد الاستلام');
        
        const section = document.getElementById('pending-receipts-section');
        const list = document.getElementById('pending-receipts-list');
        const badge = document.getElementById('pending-count-badge');
        const navLink = document.getElementById('nav-pending-link');
        const navCnt = document.getElementById('nav-pending-count');

        if (!section || !list) return;

        const totalRequests = pending.length + cancellations.length + pendingIssues.length;

        if (totalRequests === 0) {
            section.style.display = 'none';
            if (navLink) navLink.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        if (badge) badge.textContent = totalRequests + ' طلبات معلقة';
        if (navLink) navLink.style.display = '';
        if (navCnt) navCnt.textContent = totalRequests;

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

        // ── Internal Transfers (from other warehouses) ──
        pendingIssues.forEach(order => {
            const card = document.createElement('div');
            card.style.cssText = 'background:rgba(59,130,246,0.05); border:1px solid rgba(59,130,246,0.2); border-radius:10px; padding:14px 18px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;';
            card.innerHTML = `
                <div style="flex:1; min-width:220px;">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
                        <strong style="color:var(--accent-blue); font-size:15px;">${order.id}</strong>
                        <span style="background:rgba(59,130,246,0.1); color:var(--accent-blue); padding:2px 8px; border-radius:4px; font-size:10px; font-weight:700;">تحويل داخلي</span>
                    </div>
                    <div style="font-size:12px; color:var(--text-secondary); margin-bottom:4px;">
                        <i class="ph ph-warehouse"></i> من: <strong>${order.fromWhName}</strong>
                        &nbsp;|&nbsp;
                        <i class="ph ph-package"></i> الصنف: <strong>${order.itemName}</strong>
                        &nbsp;|&nbsp;
                        <i class="ph ph-calendar"></i> التاريخ: ${order.date}
                    </div>
                    <div style="font-size:12px; color:var(--text-muted);">
                        الكمية المحولة: <strong style="color:var(--text-primary);">${order.qty} ${order.unit}</strong>
                    </div>
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <button class="wh-confirm-transfer-btn" data-id="${order.id}"
                        style="background:linear-gradient(135deg,#3b82f6,#2563eb); color:#fff; border:none; border-radius:8px; padding:9px 18px; cursor:pointer; font-size:13px; font-weight:700; display:flex; align-items:center; gap:6px;">
                        <i class="ph ph-check-circle"></i> تأكيد الاستلام الفعلي
                    </button>
                </div>
            `;
            list.appendChild(card);
        });

        // Attach handlers for internal transfers
        list.querySelectorAll('.wh-confirm-transfer-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const orderId = e.currentTarget.dataset.id;
                const order = (db.issueOrders || []).find(o => o.id === orderId);
                if (!order) return;
                if (!await ModernDialog.confirm(`تأكيد استلام الصنف "${order.itemName}" (الكمية: ${order.qty}) من ${order.fromWhName} وإضافته لهذا المستودع؟`)) return;
                
                await whReceiveInternalTransfer(order);
            });
        });

        // Attach receive handlers
        list.querySelectorAll('.wh-receive-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const purId = e.currentTarget.dataset.id;
                const pur = (db.purchases || []).find(p => p.id === purId);
                if (!pur) return;
                if (!await ModernDialog.confirm(`تأكيد استلام الفاتورة ${pur.id} من المورد "${pur.supName}" وإضافة الكميات للمخزون؟`)) return;
                await whReceivePurchase(pur);
            });
        });

        // ── Pending Cancellations ──────────────────────
        if (cancellations.length > 0) {
            const separator = document.createElement('div');
            separator.style.cssText = 'border-top: 1px dashed rgba(239,68,68,0.3); margin: 20px 0 15px; padding-top: 15px; display: flex; align-items: center; gap: 8px; color: #ef4444; font-size: 14px; font-weight: 700;';
            separator.innerHTML = '<i class="ph-fill ph-warning-circle"></i> طلبات إلغاء استلام سابقة';
            list.appendChild(separator);

            cancellations.forEach(pur => {
                const destWhName = whNames[pur.destWh || 'main'] || pur.destWh;
                const card = document.createElement('div');
                card.style.cssText = 'background:rgba(239,68,68,0.05); border:1px solid rgba(239,68,68,0.2); border-radius:10px; padding:14px 18px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;';
                card.innerHTML = `
                    <div style="flex:1; min-width:220px;">
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
                            <strong style="color:#ef4444; font-size:15px;">${pur.id}</strong>
                            <span style="color:var(--text-muted); font-size:12px;">مستلمة سابقاً</span>
                        </div>
                        <div style="font-size:12px; color:var(--text-secondary); margin-bottom:4px;">
                            <i class="ph ph-truck"></i> المورد: <strong>${pur.supName}</strong>
                            &nbsp;|&nbsp;
                            <i class="ph ph-warehouse"></i> المستودع: <strong>${destWhName}</strong>
                        </div>
                        <div style="font-size:12px; color:#b91c1c; font-weight:600;">
                            ⚠️ مطلوب عكس الكميات بسبب: ${pur.cancelledReason || 'تعديل أو إلغاء'}
                        </div>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <button class="wh-confirm-cancel-btn" data-id="${pur.id}"
                            style="background:linear-gradient(135deg,#ef4444,#dc2626); color:#fff; border:none; border-radius:8px; padding:9px 18px; cursor:pointer; font-size:13px; font-weight:700; display:flex; align-items:center; gap:6px;">
                            <i class="ph ph-arrow-u-up-left"></i> تأكيد عكس المخزون
                        </button>
                    </div>
                `;
                list.appendChild(card);
            });

            list.querySelectorAll('.wh-confirm-cancel-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const purId = e.currentTarget.dataset.id;
                    const pur = (db.purchases || []).find(p => p.id === purId);
                    if (!pur) return;
                    if (!await ModernDialog.confirm(`⚠️ تحذير: هل أنت متأكد من تأكيد إلغاء الاستلام للفاتورة ${pur.id}؟\n\nسيتم خصم الكميات من المخزون فوراً.`)) return;
                    await whConfirmCancellation(pur);
                });
            });
        }
    }

    async function whConfirmCancellation(pur) {
        const taxPct = getSystemTaxRate();
        const destWh = pur.destWh || 'main';
        let warnings = [];

        pur.items.forEach(buyItem => {
            let invItem = erpItems.find(i => i.sku === buyItem.sku && (i.warehouseId || 'main') === destWh);
            if (invItem) {
                const standardYield = invItem.standardYield || 1;
                const actualYield = Number(buyItem.yield) || 0;
                const qtyToRemove = buyItem.qty * (actualYield > 0 ? actualYield : standardYield);

                const newQty = (Number(invItem.qty) || 0) - qtyToRemove;
                if (newQty < 0) {
                    warnings.push(`${buyItem.name}: الكمية الحالية (${invItem.qty.toFixed(2)}) أقل من المطلوب خصمه (${qtyToRemove.toFixed(2)})`);
                }
                invItem.qty = Math.max(0, newQty);
                // تحديث الكمية الفيزيائية أيضاً
                if (invItem.physicalQty != null) {
                    invItem.physicalQty = Math.max(0, invItem.physicalQty - buyItem.qty);
                }
            }

            // حذف حركات المخزون المرتبطة
            db.inventoryTx = (db.inventoryTx || []).filter(tx => !(tx.refInvoice === pur.id && tx.type === 'in'));
        });

        // عكس مديونية المورد إن كانت آجلة
        if (pur.payMethod === 'credit' && db.suppliers) {
            const supObj = db.suppliers.find(s => s.id === pur.supId);
            if (supObj) {
                supObj.balance = Math.max(0, (supObj.balance || 0) - pur.total);
            }
        }

        pur.status = 'ملغاة';
        pur.cancelledAt = new Date().toISOString();
        
        db.inventory = erpItems;
        await saveDB(db);

        renderPendingReceipts();
        renderTable();
        renderKPIs();

        let msg = `✅ تم إلغاء استلام الفاتورة ${pur.id} وعكس الكميات بنجاح.`;
        if (warnings.length) msg += '\n\n⚠️ تنبيهات:\n' + warnings.join('\n');
        alert(msg);
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

    async function whReceiveInternalTransfer(order) {
        let destWh = order.destWh || order.destKey || 'main';
        
        // ربط أقسام المطبخ بمخزن المطعم الرئيسي لتوحيد الجرد
        const kitchenKeys = ['restaurant', 'kitchen_main', 'kitchen', 'kitchen_cold', 'kitchen_grills', 'kitchen_pastry', 'production'];
        if (kitchenKeys.includes(destWh)) {
            destWh = 'restaurant';
        }
        const sku = order.sku;
        const physQty = Number(order.qty) || 0;
        const stdQty = Number(order.stdQty) || 0;

        let invItem = erpItems.find(i => i.sku === sku && (i.warehouseId || 'main') === destWh);

        if (invItem) {
            const oldQty = Number(invItem.qty) || 0;
            const oldPhysicalQty = Number(invItem.physicalQty) || 0;
            const oldCost = Number(invItem.cost) || 0;
            const newCost = Number(order.cost) || 0;
            
            const totalValue = (oldQty * oldCost) + (stdQty * newCost);
            const totalQty = oldQty + stdQty;
            
            const oldPhysicalCost = Number(invItem.physicalCost) || (oldCost * (invItem.standardYield || 1));
            const newPhysicalCost = Number(order.cost) * (order.standardYield || 1);
            const totalPhysicalValue = (oldPhysicalQty * oldPhysicalCost) + (physQty * newPhysicalCost);
            const totalPhysicalQty = oldPhysicalQty + physQty;

            invItem.qty = totalQty;
            invItem.physicalQty = totalPhysicalQty;
            invItem.cost = totalQty > 0 ? (totalValue / totalQty) : newCost;
            invItem.physicalCost = totalPhysicalQty > 0 ? (totalPhysicalValue / totalPhysicalQty) : newPhysicalCost;
        } else {
            const srcItem = erpItems.find(i => i.sku === order.sku && i.warehouseId === (order.fromWh || 'main')) || {};
            erpItems.push({
                ...srcItem,
                sku: order.sku,
                name: order.itemName,
                unit: order.unit,
                warehouseId: destWh,
                qty: stdQty,
                physicalQty: physQty,
                cost: order.cost,
                physicalCost: order.cost * (order.standardYield || 1),
                standardYield: order.standardYield || 1,
                minQty: srcItem.minQty != null ? srcItem.minQty : 0
            });
        }

        const dbOrder = (db.issueOrders || []).find(o => o.id === order.id);
        if (dbOrder) dbOrder.status = 'مكتمل';

        erpTx.push({
            id: 'IN-' + order.id,
            type: 'in',
            total: order.total,
            date: Date.now(),
            wh: destWh,
            sku: sku,
            notes: `استلام تحويل من ${order.fromWhName} (${order.id})`
        });

        // ── المزامنة مع سجل المطبخ ──
        if (destWh === 'restaurant') {
            if (!db.kitchenTx) db.kitchenTx = [];
            db.kitchenTx.push({
                id: 'IN-' + order.id,
                type: 'receive',
                itemName: order.itemName,
                itemSku: order.sku,
                qty: Number(order.stdQty) || 0,
                unit: order.unit || '',
                notes: `استلام من المخازن - ${order.id}`,
                date: new Date().toISOString(),
                user: "أمين المستودع",
                warehouseQtyBefore: 0,
                warehouseQtyAfter: 0,
                sourceWarehouse: order.fromWh
            });
        }

        db.inventory = erpItems;
        db.inventoryTx = erpTx;
        await saveDB(db);

        renderTable();
        renderKPIs();
        renderPendingReceipts();

        // Print confirmation receipt
        const newTx = erpTx[erpTx.length - 1];
        printInventoryReceipt(newTx, invItem || { sku, name: order.itemName, unit: order.unit, warehouseId: destWh, cost: order.cost }, physQty, 'in');

        alert(`✅ تم استلام الصنف "${order.itemName}" وإضافته للمخزون بنجاح!`);
    }

    async function whReceivePurchase(pur) {
        const taxPct = getSystemTaxRate();
        const destWh = pur.destWh || 'main';

        pur.items.forEach(buyItem => {
            const unitCost = buyItem.price; // السعر المدخل في الفاتورة هو أصلاً قبل الضريبة
            let invItem = erpItems.find(i => i.sku === buyItem.sku && (i.warehouseId || 'main') === destWh);

            const standardYield = (invItem ? invItem.standardYield : 0) || 1;
            const actualYield = Number(buyItem.yield) || 0;

            // الإنتاجية = الكمية المشتراة × (الإنتاجية المدخلة أو المعيارية)
            let addedQty = buyItem.qty * (actualYield > 0 ? actualYield : standardYield);

            if (invItem) {
                // تحديث الإنتاجية المعيارية إذا كانت الافتراضية
                if (actualYield > 0 && (!invItem.standardYield || invItem.standardYield === 1)) {
                    invItem.standardYield = actualYield;
                }
                const oldQty = Number(invItem.qty) || 0;
                const oldCost = Number(invItem.cost) || 0;
                const newCostPerYield = unitCost * (buyItem.qty / addedQty);
                
                const totalValue = (oldQty * oldCost) + (addedQty * newCostPerYield);
                const totalQty = oldQty + addedQty;
                
                const oldPhysicalQty = Number(invItem.physicalQty) || 0;
                const oldPhysicalCost = Number(invItem.physicalCost) || (oldCost * (invItem.standardYield || 1));
                const totalPhysicalValue = (oldPhysicalQty * oldPhysicalCost) + (buyItem.qty * unitCost);
                const totalPhysicalQty = oldPhysicalQty + buyItem.qty;
                
                invItem.qty = totalQty;
                invItem.physicalQty = totalPhysicalQty;
                invItem.cost = totalQty > 0 ? (totalValue / totalQty) : newCostPerYield;
                invItem.physicalCost = totalPhysicalQty > 0 ? (totalPhysicalValue / totalPhysicalQty) : unitCost;
            } else {
                let src = erpItems.find(i => i.sku === buyItem.sku);
                if (src) {
                    let clone = {
                        ...src,
                        warehouseId: destWh,
                        qty: addedQty,
                        physicalQty: buyItem.qty,
                        cost: unitCost * (buyItem.qty / addedQty),
                        physicalCost: unitCost
                    };
                    erpItems.push(clone);
                } else {
                    erpItems.push({
                        sku: buyItem.sku,
                        name: buyItem.name,
                        category: 'مشتريات جديدة',
                        unit: 'وحدة',
                        cost: unitCost * (buyItem.qty / addedQty),
                        physicalCost: unitCost,
                        qty: addedQty,
                        physicalQty: buyItem.qty,
                        minQty: 0,
                        warehouseId: destWh,
                        standardYield: actualYield > 0 ? actualYield : 1
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

            // ── المزامنة مع سجل المطبخ ──
            if (destWh === 'restaurant') {
                if (!db.kitchenTx) db.kitchenTx = [];
                db.kitchenTx.push({
                    id: 'PUR-' + pur.id,
                    type: 'receive',
                    itemName: buyItem.name,
                    itemSku: buyItem.sku,
                    qty: addedQty,
                    unit: buyItem.unit || 'وحدة',
                    notes: `شراء مباشر من المورد - ${pur.supName}`,
                    date: new Date().toISOString(),
                    user: "أمين المستودع",
                    warehouseQtyBefore: 0,
                    warehouseQtyAfter: 0,
                    sourceWarehouse: 'SUPPLIER'
                });
            }
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

        // Load restaurant settings from localStorage (same as POS)
        const sysSetRaw = localStorage.getItem('restaurant_settings');
        let storeName = 'إدارة النظام';
        let storeTax = '';
        let storeBranch = '';
        let storePhone = '';
        let logoBase64 = '';

        if (sysSetRaw) {
            try {
                const s = JSON.parse(sysSetRaw);
                storeName = s.name || storeName;
                storeTax = s.taxNumber || s.tax || '';
                storeBranch = s.branch || '';
                storePhone = s.phone || '';
                logoBase64 = (s.logo && s.logo.startsWith('data:')) ? s.logo : '';
            } catch (e) { console.error('Error parsing settings in whPrintReceiveNote', e); }
        }

        let logoHtml = '';
        if (logoBase64) {
            logoHtml = `<img src="${logoBase64}" class="store-logo" alt="شعار المتجر">`;
        }

        let itemsHtml = '';
        let subTotal = 0;
        (pur.items || []).forEach((it, i) => {
            const unitCost = it.price / (1 + taxPct / 100);
            const lineTotal = it.qty * unitCost;
            subTotal += lineTotal;
            itemsHtml += `
                <tr>
                    <td style="text-align:center">${i + 1}</td>
                    <td>${it.name}</td>
                    <td style="text-align:center">${it.qty}</td>
                    <td style="text-align:center">${unitCost.toFixed(2)}</td>
                    <td style="text-align:center">${lineTotal.toFixed(2)}</td>
                    <td style="text-align:center; color: #10b981;">✓</td>
                </tr>`;
        });

        const w = window.open('', '_blank', 'width=400,height=600');
        w.document.write(`<!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <title>أمر استلام - ${pur.id}</title>
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
                    }
                    .store-logo {
                        width: 25mm;
                        height: 25mm;
                        object-fit: contain;
                        margin-left: auto;
                        margin-right: auto;
                        display: block;
                        margin-bottom: 2mm;
                        filter: grayscale(100%);
                    }
                    .store-name {
                        font-size: 14pt;
                        font-weight: 900;
                        margin: 2mm 0 1mm 0;
                    }
                    .store-info {
                        font-size: 9pt;
                        margin: 0.5mm 0;
                        color: #333;
                    }
                    .tax-number {
                        font-size: 9pt;
                        font-weight: 700;
                        margin: 1mm 0;
                    }
                    .header { text-align: center; border-bottom: 1.5px dashed #000; padding-bottom: 3mm; margin-bottom: 3mm; }
                    .header h3 { margin: 1mm 0 0 0; border:1px solid #000; display:inline-block; padding:1.5mm 3mm; border-radius:1mm; font-size:11pt; font-weight: bold; }
                    
                    table { width: 100%; border-collapse: collapse; margin-top: 3mm; font-size: 9pt; }
                    th { border-bottom: 1.5px solid #000; padding: 1.5mm 1mm; text-align: center; font-weight: 900; }
                    td { padding: 1.5mm 1mm; border-bottom: 0.5px solid #eee; }
                    
                    .summary { margin-top: 3mm; padding-top: 2mm; border-top: 1.5px dashed #000; }
                    .sl { display: flex; justify-content: space-between; margin-bottom: 1mm; font-size: 9.5pt; }
                    .sl.tot { font-size: 11pt; font-weight: 900; margin-top: 2mm; border-top: 1px solid #000; padding-top: 1mm; }
                    
                    .notice { border: 1px dotted #000; padding: 2mm; font-size: 8.5pt; text-align: center; margin-top: 3mm; }
                    .footer { text-align: start; margin-top: 5mm; font-size: 9pt; border-top: 1.5px dashed #000; padding-top: 3mm;}
                    .footer p { margin: 3mm 0; display: flex; justify-content: space-between; gap: 2mm;}
                </style>
            </head>
            <body>
                <div class="receipt-wrapper">
                    <div class="header">
                        ${logoHtml}
                        <div class="store-name">${storeName}</div>
                        ${storeTax ? `<div class="tax-number">الرقم الضريبي: ${storeTax}</div>` : ''}
                        <div class="store-info">${storeBranch}</div>
                        ${storePhone ? `<div class="store-info">هاتف: ${storePhone}</div>` : ''}
                        
                        <div style="margin: 3mm 0; border-top: 1.5px dashed #000;"></div>
                        <p style="margin: 0; font-size: 10pt; color: #000;">إدارة المستودعات</p>
                        <h3>سند استلام بضاعة (GRN)</h3>
                    </div>

                    <div style="text-align: start; font-size: 9pt; margin-bottom: 3mm;">
                        <div><strong>رقم السند:</strong> GRN-${pur.id}</div>
                        <div><strong>المورد:</strong> ${pur.supName}</div>
                        <div><strong>المستودع:</strong> ${destWhName}</div>
                        <div><strong>تاريخ الاستلام:</strong> ${dateStr}</div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th style="width: 10%;">#</th>
                                <th style="width: 50%; text-align: start;">الصنف</th>
                                <th style="width: 20%;">الكمية</th>
                                <th style="width: 20%;">مستلم</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                    </table>

                    <div class="summary">
                        <div class="sl"><span>إجمالي قبل الضريبة:</span> <span>${subTotal.toFixed(2)}</span></div>
                        <div class="sl"><span>ضريبة القيمة المضافة:</span> <span>${(subTotal * taxPct / 100).toFixed(2)}</span></div>
                        <div class="sl tot"><span>الإجمالي النهائي:</span> <span>${xf(pur.total)}</span></div>
                    </div>

                    <div class="notice">هذا السند يُثبت استلام البضاعة وإدخالها في المخزون. يرجى الاحتفاظ بنسخة للتدقيق.</div>

                    <div class="footer">
                        <p><span style="flex:1;">أمين المستودع</span> <span style="flex:1;text-align:end;">.................</span></p>
                        <p style="text-align: center; justify-content: center; margin-top: 4mm;">طبعت بواسطة نظام الإدارة الإلكتروني</p>
                    </div>
                </div>
            </body>
            </html>
        `);
        w.document.close(); w.focus();
        setTimeout(() => { w.print(); w.close(); }, 600);
    }

    renderPendingReceipts();
    // ─────────────────────────────────────────────────────────────────────────

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

        const formatKpi = (val) => {
            return Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        };

        setHtml('kpi-inv-valuation', `${formatKpi(totalVal)}<span class="currency">${curSym()}</span>`);
        const subVal = document.getElementById('kpi-inv-valuation-sub');
        if (subVal) subVal.textContent = whTitles[currentWH]?.split('(')[1]?.replace(')', '') || 'المخزن النشط';

        const formatCount = (count, unit, plural) => {
            if (count === 1) return `حركة ${unit} واحدة`;
            if (count === 2) return `حركتا ${unit}`;
            if (count >= 3 && count <= 10) return `${count} حركات ${unit}`;
            return `${count} حركة ${unit}`;
        };

        setHtml('kpi-inv-in-month', `${formatKpi(inVal)}<span class="currency">${curSym()}</span>`);
        const inSub = document.getElementById('kpi-inv-in-sub');
        if (inSub) inSub.innerHTML = `<i class="ph ph-tag"></i> ${formatCount(inThisMonth.length, 'إدخال')} هذا الشهر`;

        setHtml('kpi-inv-out-month', `${formatKpi(outVal)}<span class="currency">${curSym()}</span>`);
        const outSub = document.getElementById('kpi-inv-out-sub');
        if (outSub) outSub.innerHTML = `<i class="ph ph-receipt"></i> ${formatCount(outThisMonth.length, 'صرف')} هذا الشهر`;

        const lowStockText = lowStockCount === 1 ? 'صنف واحد' : lowStockCount === 2 ? 'صنفان' : lowStockCount >= 3 && lowStockCount <= 10 ? `${lowStockCount} أصناف` : `${lowStockCount} صنف`;
        setHtml('kpi-inv-low', `${lowStockCount === 0 ? '0' : lowStockCount} <span class="currency" style="font-size:14px">${lowStockCount === 1 ? 'صنف' : 'أصناف'}</span>`);
        
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

        const yld = Number(item.standardYield) || 1;
        const physQty = (item.physicalQty != null && Number(item.physicalQty) > 0)
            ? Number(item.physicalQty)
            : Number((qty / yld).toFixed(4));
        
        const wh = whNorm(item.warehouseId);
        return {
            rowClass,
            html: `
                <td><span class="badge-barcode">${item.sku}</span></td>
                <td><strong>${item.name}</strong></td>
                <td>${item.category || ''}</td>
                <td>${item.unit || ''}</td>
                <td title="التكلفة للوحدة المشتراة (متوسط التكلفة)">${xf(item.physicalCost || (item.cost * (item.standardYield || 1)))}</td>
                <td class="physical-col" style="text-align:center;">${formatArabicQty(physQty, item.unit || 'وحدة')}</td>
                <td class="qty-col ${qty === 0 ? 'empty' : qty <= minQ ? 'low' : 'safe'}">${Number(qty.toFixed(2))}</td>
                <td style="text-align:center; color:var(--text-muted); font-size:12px;">${item.standardYield || 1}</td>
                <td class="capacity-col" style="text-align:center;">${Number(qty.toFixed(2))}</td>
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
        const confirmed = await ModernDialog.confirm(`⚠️ هل أنت متأكد من حذف الصنف التالي؟\n\nرمز الصنف: ${item.sku}\nاسم الصنف: ${item.name}\nالكمية الحالية: ${item.qty} ${item.unit || ''}\n\nسيتم حذف الصنف نهائياً من المخزون!`);
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
                    renderPendingReceipts();
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
            renderPendingReceipts();
        });
    });

    function openModal(id) {
        const el = document.getElementById(id);
        if (el) window.openModalLayer(el);
    }
    function closeModal(id) {
        const el = document.getElementById(id);
        if (el) window.closeModalLayer(el);
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
        document.getElementById('item-cost').value = (it.cost * (it.standardYield || 1)) || '';
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
            // تحديث إضافي بعد الفتح للتأكيد
            setTimeout(updateTransCapacity, 10);
        });
    }

    const transFrom = document.getElementById('trans-from');
    if (transFrom) transFrom.addEventListener('change', updateTransDropdown);

    function updateTransCapacity() {
        const fromWh = document.getElementById('trans-from').value;
        const sku = document.getElementById('trans-sku').value;
        const item = erpItems.find(it => it.sku === sku && whNorm(it.warehouseId) === fromWh);
        const transQtyEl = document.getElementById('trans-qty');
        const capacityEl = document.getElementById('trans-capacity');
        const capacityRow = document.getElementById('trans-capacity-row');

        if (!item || !transQtyEl || !capacityEl || !capacityRow) return;

        const qty = Number(transQtyEl.value);
        // حساب النسبة بنفس طريقة أمر صرف الخروج
        const ratio = (Number(item.physicalQty) > 0) ? (Number(item.qty) / Number(item.physicalQty)) : (item.standardYield || 1);
        
        // شرط الظهور: إذا كانت الكميات مختلفة أو النسبة ليست 1
        const isDifferent = Math.abs(ratio - 1) > 0.001 || Math.abs((Number(item.qty)||0) - (Number(item.physicalQty)||0)) > 0.01;

        if (!isDifferent) {
            capacityRow.style.display = 'none';
            return;
        }

        capacityRow.style.display = '';
        if (transQtyEl.value !== '') {
            const cap = qty * ratio;
            capacityEl.value = parseFloat(cap.toFixed(2));
        } else {
            capacityEl.value = '';
        }
    }

    function updateTransQtyFromCapacity() {
        const fromWh = document.getElementById('trans-from').value;
        const sku = document.getElementById('trans-sku').value;
        const item = erpItems.find(it => it.sku === sku && whNorm(it.warehouseId) === fromWh);
        const capacityEl = document.getElementById('trans-capacity');
        const transQtyEl = document.getElementById('trans-qty');

        if (!item || !capacityEl || !transQtyEl) return;

        const cap = Number(capacityEl.value);
        const ratio = (Number(item.physicalQty) > 0) ? (Number(item.qty) / Number(item.physicalQty)) : (item.standardYield || 1);

        if (capacityEl.value !== '' && ratio > 0) {
            transQtyEl.value = parseFloat((cap / ratio).toFixed(4));
        } else if (capacityEl.value === '') {
            transQtyEl.value = '';
        }
    }

    function updateTransDropdown() {
        const fromWh = document.getElementById('trans-from').value;
        const skuSelect = document.getElementById('trans-sku');
        if (skuSelect) {
            const currentItems = erpItems.filter((i) => whNorm(i.warehouseId) === fromWh);
            skuSelect.innerHTML = currentItems.map((it) => {
                const phys = it.physicalQty != null ? it.physicalQty : (it.qty / (it.standardYield || 1));
                const std = Number(it.qty) || 0;
                return `<option value="${it.sku}">${it.name} (متوفر: ${Number(phys.toFixed(2))} حبة / ${Number(std.toFixed(2))} نفر)</option>`;
            }).join('');
        }
        updateTransCapacity();
    }

    document.getElementById('trans-sku')?.addEventListener('change', updateTransCapacity);
    document.getElementById('trans-qty')?.addEventListener('input', updateTransCapacity);
    document.getElementById('trans-capacity')?.addEventListener('input', updateTransQtyFromCapacity);
    document.getElementById('trans-from')?.addEventListener('change', updateTransDropdown);

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

                const srcItem = erpItems[srcIdx];
                const yld = Number(srcItem.standardYield) || 1;
                const tCap = Number(document.getElementById('trans-capacity')?.value) || 0;

                let stdQtyToMove;
                if (tCap > 0) {
                    // استخدم السعة المُدخلة يدوياً
                    stdQtyToMove = tCap;
                } else {
                    // احسب بناءً على نسبة الكمية الفعلية
                    const ratio = (Number(srcItem.physicalQty) > 0) ? (Number(srcItem.qty) / Number(srcItem.physicalQty)) : yld;
                    stdQtyToMove = tQty * ratio;
                }

                if ((srcItem.physicalQty || 0) < tQty) {
                    alert('الكمية الفعلية في المصدر لا تكفي للتحويل!');
                    return;
                }

                // خصم من المصدر
                srcItem.physicalQty = (Number(srcItem.physicalQty) || 0) - tQty;
                srcItem.qty = (Number(srcItem.qty) || 0) - stdQtyToMove;

                // إنشاء سجل تحويل معلق بدلاً من الإضافة المباشرة
                const newTxId = 'TRF-' + Math.floor(Math.random() * 90000 + 10000);
                if (!db.issueOrders) db.issueOrders = [];
                
                const transferOrder = {
                    id: newTxId,
                    status: 'قيد الاستلام',
                    date: new Date().toISOString().split('T')[0],
                    dateTs: Date.now(),
                    fromWh,
                    fromWhName: whNames[fromWh] || fromWh,
                    destWh: toWh,
                    destName: whNames[toWh] || toWh,
                    sku: tSku,
                    itemName: srcItem.name,
                    unit: srcItem.unit || '',
                    qty: tQty,
                    stdQty: stdQtyToMove,
                    cost: srcItem.cost,
                    total: stdQtyToMove * (srcItem.cost || 0),
                    standardYield: srcItem.standardYield || 1,
                    notes: 'تحويل داخلي بين المستودعات'
                };
                db.issueOrders.push(transferOrder);

                // سجل في العمليات كخروج من المصدر
                erpTx.push({
                    id: newTxId,
                    type: 'out',
                    total: transferOrder.total,
                    date: Date.now(),
                    wh: fromWh,
                    fromWh,
                    toWh,
                    sku: tSku,
                    notes: 'تحويل إلى ' + transferOrder.destName
                });

                db.inventory = erpItems;
                db.inventoryTx = erpTx;
                db.issueOrders = db.issueOrders;
                await saveDB(db);

                closeModal('transferModal');
                formTransfer.reset();

                // تأجيل إعادة التحميل لمنع الشاشة السوداء
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        renderTable();
                        renderKPIs();
                        renderPendingReceipts();
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
                    const yieldVal = Number(document.getElementById('item-standard-yield').value) || 1;
                    const physicalCost = Number(document.getElementById('item-cost').value) || 0;
                    erpItems[idx].cost = physicalCost / yieldVal;
                    erpItems[idx].qty = Number(document.getElementById('item-qty').value);
                    erpItems[idx].physicalQty = Number(document.getElementById('item-physical-qty').value);
                    erpItems[idx].minQty = Number(document.getElementById('item-min').value);
                    erpItems[idx].standardYield = Number(document.getElementById('item-standard-yield').value) || 1;
                } else {
                    const skuFromInput = document.getElementById('item-sku-input').value.trim();
                    const hasQty = document.getElementById('item-has-qty').checked;

                    const yieldVal = Number(document.getElementById('item-standard-yield').value) || 1;
                    const physicalCost = Number(document.getElementById('item-cost').value) || 0;

                    const newItem = {
                        sku: skuFromInput || ('SKU-' + Math.floor(1000 + Math.random() * 9000)),
                        name: document.getElementById('item-name').value,
                        category: document.getElementById('item-cat').value,
                        unit: document.getElementById('item-unit').value,
                        cost: physicalCost / yieldVal,
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
        restaurant: 'مخزن المطعم الداخلي { مخزون المطبخ }',
        beverages: 'مخزن المشروبات',
        kitchen_cold: 'قسم التحضير البارد',
        kitchen_grills: 'قسم المشويات',
        kitchen_pastry: 'قسم الحلويات والمخبوزات',
        production: 'قسم الإنتاج والتجهيز',
        other: 'أخرى'
    };

    document.getElementById('tx-dest')?.addEventListener('change', (e) => {
        const customInput = document.getElementById('tx-dest-custom');
        if (customInput) {
            customInput.style.display = e.target.value === 'other' ? 'block' : 'none';
            if (e.target.value === 'other') customInput.focus();
        }
    });

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

        const txOverlay = document.getElementById('txModal');
        if (txOverlay) {
            txOverlay.classList.toggle('inbound', !isOut);
            txOverlay.classList.toggle('outbound', isOut);
        }
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
                    let destName = destLabels[destKey] || destKey;
                    if (destKey === 'other') {
                        const customVal = document.getElementById('tx-dest-custom').value.trim();
                        destName = customVal || 'جهة أخرى';
                    }
                    const notes = document.getElementById('tx-notes').value;

                    // تحديد هل الوجهة مخزن حقيقي أم قسم تشغيلي
                    const isWarehouseDest = ['restaurant', 'beverages'].includes(destKey);

                    // خصم من المخزن الحالي
                    item.qty -= stdDeduction;
                    item.physicalQty = (Number(item.physicalQty) || 0) - bQty;

                    const issueId = 'ISS-' + Math.floor(Math.random() * 90000 + 10000);
                    const totalCost = stdDeduction * (item.cost || 0);

                    // سجل في العمليات العامة كخروج
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

                    // إنشاء سجل أمر الصرف
                    if (!db.issueOrders) db.issueOrders = [];
                    const issueOrder = {
                        id: issueId,
                        status: isWarehouseDest ? 'قيد الاستلام' : 'مكتمل',
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

                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            renderTable();
                            renderKPIs();
                            renderPendingReceipts();
                            printIssueOrder(issueOrder);
                            
                            if (isWarehouseDest) {
                                alert(`✅ تم إصدار أمر تحويل ${issueId}\nالوجهة: ${destName}\nينتظر تأكيد الاستلام من المخزن المستهدف.`);
                            } else {
                                alert(`✅ تم تنفيذ صرف مباشر ${issueId}\nالوجهة: ${destName}\nتم الخصم من المخزون بنجاح.`);
                            }
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

        // Load restaurant settings from localStorage (same as POS)
        const sysSetRaw = localStorage.getItem('restaurant_settings');
        let storeName = 'إدارة النظام';
        let storeTax = '';
        let storeBranch = '';
        let storePhone = '';
        let logoBase64 = '';

        if (sysSetRaw) {
            try {
                const s = JSON.parse(sysSetRaw);
                storeName = s.name || storeName;
                storeTax = s.taxNumber || s.tax || '';
                storeBranch = s.branch || '';
                storePhone = s.phone || '';
                logoBase64 = (s.logo && s.logo.startsWith('data:')) ? s.logo : '';
            } catch (e) { console.error('Error parsing settings in printIssueOrder', e); }
        }

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
                    .store-name {
                        font-size: 16px;
                        font-weight: 900;
                        margin: 2mm 0 1mm 0;
                        line-height: 1.2;
                        text-align: center;
                    }
                    .store-info {
                        font-size: 10px;
                        margin: 0.5mm 0;
                        line-height: 1.4;
                        text-align: center;
                    }
                    .tax-number {
                        font-size: 10px;
                        font-weight: 700;
                        margin: 1mm 0;
                        text-align: center;
                    }
                    .header { text-align: center; border-bottom: 1.5px dashed #000; padding-bottom: 3mm; margin-bottom: 3mm; }
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
                        <div class="store-name">${storeName}</div>
                        ${storeTax ? `<div class="tax-number">الرقم الضريبي: ${storeTax}</div>` : ''}
                        <div class="store-info">${storeBranch}</div>
                        ${storePhone ? `<div class="store-info">هاتف: ${storePhone}</div>` : ''}
                        
                        <div style="margin: 3mm 0; border-top: 1.5px dashed #000;"></div>
                        <p style="margin: 0; font-size: 10pt; color: #000;">إدارة المخازن والمستودعات</p>
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

        // Load restaurant settings from localStorage (same as POS)
        const sysSetRaw = localStorage.getItem('restaurant_settings');
        let storeName = 'إدارة النظام';
        let storeTax = '';
        let storeBranch = '';
        let storePhone = '';
        let logoBase64 = '';

        if (sysSetRaw) {
            try {
                const s = JSON.parse(sysSetRaw);
                storeName = s.name || storeName;
                storeTax = s.taxNumber || s.tax || '';
                storeBranch = s.branch || '';
                storePhone = s.phone || '';
                logoBase64 = (s.logo && s.logo.startsWith('data:')) ? s.logo : '';
            } catch (e) { console.error('Error parsing settings in printInventoryReceipt', e); }
        }

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
                    .store-name {
                        font-size: 16px;
                        font-weight: 900;
                        margin: 2mm 0 1mm 0;
                        line-height: 1.2;
                        text-align: center;
                    }
                    .store-info {
                        font-size: 10px;
                        margin: 0.5mm 0;
                        line-height: 1.4;
                        text-align: center;
                    }
                    .tax-number {
                        font-size: 10px;
                        font-weight: 700;
                        margin: 1mm 0;
                        text-align: center;
                    }
                    .header { text-align: center; border-bottom: 1.5px dashed #000; padding-bottom: 3mm; margin-bottom: 3mm; }
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
                        <div class="store-name">${storeName}</div>
                        ${storeTax ? `<div class="tax-number">الرقم الضريبي: ${storeTax}</div>` : ''}
                        <div class="store-info">${storeBranch}</div>
                        ${storePhone ? `<div class="store-info">هاتف: ${storePhone}</div>` : ''}

                        <div style="margin: 3mm 0; border-top: 1.5px dashed #000;"></div>
                        <p style="margin: 0; font-size: 10pt; color: #000;">المخازن والمستودعات</p>
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
                        ${tx.notes ? `<p><span class="label">ملاحظات:</span> <span class="val">${tx.notes}</span></p>` : ''}
                        <p><span class="label">المشرف المسؤول:</span> <span class="val">أمين المستودع</span></p>
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
