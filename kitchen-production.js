// kitchen-production.js

let currentDb = null;
/** تبويب المطبخ النشط — لإعادة الرسم بعد مزامنة القاعدة */
let kpActiveTab = 'dashboard';

const KITCHEN_PREFS_KEY = 'kitchen_prefs';

const KITCHEN_PREFS_DEFAULT = {
    sourceWarehouse: 'restaurant',
    autoDeductOnSale: false,
    soundAlertLowStock: true,
    autoPrintReceive: true
};

function getKitchenPrefs() {
    try {
        return { ...KITCHEN_PREFS_DEFAULT, ...JSON.parse(localStorage.getItem(KITCHEN_PREFS_KEY) || '{}') };
    } catch (e) {
        return { ...KITCHEN_PREFS_DEFAULT };
    }
}

function getKitchenSourceWh() {
    const w = getKitchenPrefs().sourceWarehouse;
    if (['main', 'restaurant', 'beverages'].includes(w)) return w;
    return 'restaurant';
}

function kitchenWhLabel(wh) {
    if (wh === 'main') return 'المستودع الرئيسي';
    if (wh === 'restaurant') return 'مخزن المطعم الداخلي';
    if (wh === 'beverages') return 'مخزن المشروبات';
    return wh;
}

document.addEventListener('DOMContentLoaded', async () => {
    currentDb = await window.dbReadSlice(['kitchenTx', 'kitchenStock', 'inventory', 'issueOrders']);
    if (!currentDb.kitchenTx) {
        await window.dbUpdate((db) => {
            if (!db.kitchenTx) db.kitchenTx = [];
        });
        currentDb.kitchenTx = [];
    }

    // Add Force Refresh API
    window.forceRecalculateKitchenStock = async function() {
        await syncKitchenStockToInventory(true);
        alert("✅ تم إعادة جرد المطبخ بالكامل من واقع سجلات الاستلام.");
    };

    const navItems = document.querySelectorAll('#kp-nav-menu .nav-item[data-tab]');

    await switchTab('dashboard');

    navItems.forEach((item) => {
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            navItems.forEach((nav) => nav.classList.remove('active'));
            item.classList.add('active');

            const tab = item.getAttribute('data-tab');
            await switchTab(tab);
        });
    });

    if (typeof window.registerPosDatabaseRefresh === 'function') {
        window.registerPosDatabaseRefresh(async () => {
            currentDb = await window.dbReadSlice(['kitchenTx', 'kitchenStock', 'inventory', 'issueOrders']);
            await switchTab(kpActiveTab);
            navItems.forEach((nav) => {
                nav.classList.toggle('active', nav.getAttribute('data-tab') === kpActiveTab);
            });
        });
    }

    // Run stock sync immediately on load
    await syncKitchenStockToInventory();
});

function playKitchenLowStockBeep() {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.frequency.value = 880;
        o.type = 'sine';
        g.gain.setValueAtTime(0.12, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        o.start(ctx.currentTime);
        o.stop(ctx.currentTime + 0.22);
        setTimeout(() => {
            try {
                ctx.close();
            } catch (e2) {}
        }, 400);
    } catch (e) {}
}

function maybeRunKitchenStockSoundCheck(db) {
    const p = getKitchenPrefs();
    if (!p.soundAlertLowStock) return;
    const list = db.kitchenStock || [];
    for (const k of list) {
        const min = k.minQty != null ? Number(k.minQty) : 3;
        if ((Number(k.qty) || 0) <= min) {
            playKitchenLowStockBeep();
            setTimeout(() => playKitchenLowStockBeep(), 350);
            break;
        }
    }
}

/** نفس مسار طباعة الكاشير (Electron)؛ عند الفشل تُفتح نافذة مع زر طباعة يدوية */
async function sendKitchenHtmlToPrinter(fullHtmlDoc) {
    try {
        const { ipcRenderer } = require('electron');
        const pName = (typeof localStorage !== 'undefined' && localStorage.getItem('cashier_printer')) || '';
        const res = await ipcRenderer.invoke('print-to-device', { html: fullHtmlDoc, printerName: pName });
        if (res && res.success) {
            if (res.debug) console.log('[kitchen.print]', res.debug);
            return;
        }
        console.warn('[kitchen.print]', res);
    } catch (e) {
        console.warn('[kitchen.print] ipc', e);
    }
    const win = window.open('', '_blank', 'width=480,height=720');
    if (!win) return;
    win.document.open();
    win.document.write(fullHtmlDoc);
    win.document.close();
}

function printKitchenReceiveReceipt(tx, copyLabel) {
    const wh = kitchenWhLabel(tx.sourceWarehouse || getKitchenSourceWh());
    const label = copyLabel ? ` — نسخة ${copyLabel}` : '';
    const html = `
        <html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>سند استلام${label}</title>
        <style>
            @page { size: 80mm auto; margin: 0; }
            html { overflow: visible; }
            body { 
                width: 100%; 
                max-width: 80mm; 
                margin: 0 auto; 
                padding: 0;
                background: #fff; 
                color: #000; 
                direction: rtl;
                font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; 
                text-align: center; 
                font-size: 10pt;
                line-height: 1.4;
                overflow: visible; 
            }
            .receipt-wrapper {
                width: 100%;
                padding-top: 3mm;
                padding-bottom: 3mm;
                padding-left: 4mm;
                padding-right: 6mm;
                margin: 0 auto;
                box-sizing: border-box;
            }
            .logo { font-size: 22px; font-weight: 900; margin-bottom: 4px; }
            .badge { display: inline-block; border: 2px solid #333; padding: 6px 18px; border-radius: 6px; font-weight: 700; margin: 12px 0; }
            .details { text-align: right; background: #f9f9f9; border-radius: 8px; padding: 14px; margin-bottom: 16px; font-size: 14px; }
            .details p { margin: 7px 0; border-bottom: 1px solid #eee; padding-bottom: 4px; }
            .label { font-weight: 700; display: inline-block; width: 125px; }
            @media print { button { display: none; } }
        </style></head><body>
            <div class="receipt-wrapper">
            <div class="logo">🍽 Mister Casher</div>
            <div style="color:#888;font-size:12px;margin-bottom:8px;">المطبخ — استلام من المخزن${label}</div>
            <div class="badge">سند استلام #${tx.id}</div>
            <div class="details">
                <p><span class="label">المستودع المصدر:</span> ${wh}</p>
                <p><span class="label">التاريخ:</span> ${new Date(tx.date).toLocaleString('ar-SA')}</p>
                <p><span class="label">الصنف:</span> ${tx.itemName}</p>
                <p><span class="label">الكمية:</span> ${tx.qty} ${tx.unit || ''}</p>
                <p><span class="label">رصيد المخزن بعد:</span> ${tx.warehouseQtyAfter}</p>
                <p><span class="label">ملاحظات:</span> ${tx.notes || '-'}</p>
                <p><span class="label">المستلم:</span> ${tx.user || '-'}</p>
            </div>
            </div>
            <button onclick="window.print()" style="padding:8px 18px;background:#ff4757;color:white;border:none;border-radius:6px;cursor:pointer;">طباعة</button>
        </div></body></html>`;
    void sendKitchenHtmlToPrinter(html);
}

async function switchTab(tab) {
    kpActiveTab = tab || 'dashboard';
    const contentArea = document.getElementById('main-content-area');
    const pageTitle = document.getElementById('page-title');

    contentArea.innerHTML = '';
    
    // Always fetch latest DB before rendering any tab to ensure dropdowns and stats are strictly synced
    currentDb = await window.dbReadSlice(['kitchenTx', 'kitchenStock', 'inventory', 'issueOrders']);

    if (tab === 'dashboard') {
        pageTitle.innerText = 'لوحة رئيسية الإنتاج';
        contentArea.innerHTML = renderDashboard();
        setTimeout(async () => {
            try {
                maybeRunKitchenStockSoundCheck(currentDb);
            } catch (e) {}
        }, 400);
    } else if (tab === 'pending_issues') {
        pageTitle.innerText = "أوامر صرف بانتظار استلام المطبخ";
        contentArea.innerHTML = renderPendingIssues();
    } else if (tab === 'receive') {
        pageTitle.innerText = 'استلام مواد من المخزن (سحب يدوي)';
        contentArea.innerHTML = renderReceive();
    } else if (tab === 'handover') {
        pageTitle.innerText = "تسليم للمبيعات (تحويل جاهز)";
        contentArea.innerHTML = renderHandover();
    } else if (tab === 'stock') {
        pageTitle.innerText = "رصيد ومخزون المطبخ الحالي";
        contentArea.innerHTML = renderStock();
    } else if (tab === 'reports') {
        pageTitle.innerText = "التقارير وسندات المطبخ";
        contentArea.innerHTML = renderReports();
    } else if (tab === 'options') {
        pageTitle.innerText = "خيارات إعدادات المطبخ";
        contentArea.innerHTML = renderOptions();
    }
}

// Helper to get formatted ID
function generateTxId(prefix) {
    return prefix + '-' + Math.floor(Math.random() * 100000);
}

// UI Actions API bound to window so they work from generic HTML strings
window.confirmKitchenReceiveOrder = async function(orderId) {
    try {
        const db = await window.dbReadSlice(['issueOrders', 'kitchenTx', 'kitchenStock', 'inventory']);
        if (!db.issueOrders) return;
        
        const orderIdx = db.issueOrders.findIndex(o => o.id === orderId);
        if (orderIdx === -1) return;
        const order = db.issueOrders[orderIdx];
        
        if (!await ModernDialog.confirm(`هل أنت متأكد من استلام الصنف "${order.itemName}" (الكمية: ${order.qty} ${order.unit || ''}) من ${order.fromWhName}؟`)) return;

        // 1. Mark order as received
        db.issueOrders[orderIdx].status = 'مستلم بالمطبخ';

        const physQty = Number(order.qty) || 0;
        const stdQty = order.stdQty != null ? Number(order.stdQty) : (physQty * (order.standardYield || 1));

        // 2. Create Kitchen TX (Receive)
        const newTx = {
            id: generateTxId('IN'),
            type: 'receive',
            itemName: order.itemName,
            itemSku: order.sku,
            qty: stdQty,
            unit: order.unit || '',
            notes: `استلام أوامر المخزن - ${order.id}`,
            date: new Date().toISOString(),
            user: "الشيف المناوب",
            warehouseQtyBefore: 0, 
            warehouseQtyAfter: 0, 
            sourceWarehouse: order.fromWh
        };

        if (!db.kitchenTx) db.kitchenTx = [];
        db.kitchenTx.push(newTx);

        // 3. Add to kitchen internal stock tracker
        if (!db.kitchenStock) db.kitchenStock = [];
        const kIdx = db.kitchenStock.findIndex(k => (k.sku && k.sku === order.sku) || k.name === order.itemName);
        if (kIdx !== -1) {
            db.kitchenStock[kIdx].qty = (Number(db.kitchenStock[kIdx].qty) || 0) + stdQty;
        } else {
            db.kitchenStock.push({
                name: order.itemName,
                sku: order.sku,
                unit: order.unit || '',
                qty: stdQty,
                minQty: 3
            });
        }

        // 4. Sync to db.inventory (warehouseId: 'restaurant') with full metadata
        if (!db.inventory) db.inventory = [];
        let invIdx = db.inventory.findIndex(i => i.sku === order.sku && i.warehouseId === 'restaurant');
        if (invIdx === -1) invIdx = db.inventory.findIndex(i => i.name === order.itemName && i.warehouseId === 'restaurant');

        if (invIdx !== -1) {
            const oldQty = Number(db.inventory[invIdx].qty) || 0;
            const oldPhysicalQty = Number(db.inventory[invIdx].physicalQty) || 0;
            const oldCost = Number(db.inventory[invIdx].cost) || 0;
            const newCost = Number(order.cost) || 0;
            const totalValue = (oldQty * oldCost) + (stdQty * newCost);
            const totalQty = oldQty + stdQty;
            const oldPhysicalCost = Number(db.inventory[invIdx].physicalCost) || (oldCost * (db.inventory[invIdx].standardYield || 1));
            const newPhysicalCost = newCost * (order.standardYield || 1);
            const totalPhysicalValue = (oldPhysicalQty * oldPhysicalCost) + (physQty * newPhysicalCost);
            const totalPhysicalQty = oldPhysicalQty + physQty;
            db.inventory[invIdx].qty = totalQty;
            db.inventory[invIdx].physicalQty = totalPhysicalQty;
            db.inventory[invIdx].cost = totalQty > 0 ? (totalValue / totalQty) : newCost;
            db.inventory[invIdx].physicalCost = totalPhysicalQty > 0 ? (totalPhysicalValue / totalPhysicalQty) : newPhysicalCost;
            db.inventory[invIdx].standardYield = order.standardYield || 1;
        } else {
            const srcItem = db.inventory.find(i => i.sku === order.sku && i.warehouseId === order.fromWh) || {};
            db.inventory.push({
                ...srcItem,
                name: order.itemName,
                sku: order.sku,
                qty: stdQty,
                physicalQty: physQty,
                unit: order.unit || '',
                warehouseId: 'restaurant',
                cost: order.cost || 0,
                physicalCost: order.cost * (order.standardYield || 1),
                standardYield: order.standardYield || 1,
                minQty: srcItem.minQty != null ? srcItem.minQty : 3
            });
        }

        await window.dbWrite(db);
        currentDb = db;

        const prefs = getKitchenPrefs();
        if (prefs.autoPrintReceive) {
            printKitchenReceiveReceipt(newTx, 1);
        }
        
        alert(`✅ تم استلام البضاعة (أمر صرف #${order.id}) وإضافتها لمخزون المطبخ بنجاح!`);
        await switchTab('dashboard');
    } catch (e) {
        console.error(e);
        alert('حدث خطأ أثناء تأكيد الاستلام: ' + e.message);
    }
};

window.saveKitchenReceive = async function() {
    const itemName = document.getElementById('kp-rcv-item').value;
    const qty = Number(document.getElementById('kp-rcv-qty').value);
    const notes = document.getElementById('kp-rcv-notes').value;
    const sourceWh = document.getElementById('kp-rcv-wh').value;

    if (!itemName || !qty || qty <= 0) {
        alert('يرجى اختيار الصنف وتحديد الكمية بشكل صحيح');
        return;
    }

    const db = await window.dbReadSlice(['inventory', 'kitchenTx', 'kitchenStock']);
    const invItem = (db.inventory || []).find(
        (i) => i.name === itemName && (i.warehouseId || 'main') === sourceWh
    );

    if (!invItem) {
        alert(
            `⚠️ هذا الصنف غير موجود في ${kitchenWhLabel(sourceWh)}.\nغيّر «مستودع الاستلام» من إعدادات المطبخ أو انقل الرصيد من صفحة المخازن.`
        );
        return;
    }

    if (invItem.qty < qty) {
        alert(
            `⚠️ الكمية المطلوبة (${qty}) تتجاوز الرصيد في ${kitchenWhLabel(sourceWh)} (${invItem.qty} ${invItem.unit || ''})!`
        );
        return;
    }

    const newTx = {
        id: generateTxId('IN'),
        type: 'receive',
        itemName: itemName,
        itemSku: invItem.sku,
        qty: qty,
        unit: invItem.unit || '',
        notes: notes,
        date: new Date().toISOString(),
        user: "الشيف أحمد",
        warehouseQtyBefore: invItem.qty,
        warehouseQtyAfter: invItem.qty - qty,
        sourceWarehouse: sourceWh
    };

    await window.dbUpdate((db) => {
        if (!db.kitchenTx) db.kitchenTx = [];
        db.kitchenTx.push(newTx);

        const idx = (db.inventory || []).findIndex(
            (i) => i.name === itemName && (i.warehouseId || 'main') === sourceWh
        );
        if (invIdx !== -1) {
            db.inventory[idx].qty -= qty * (invItem.standardYield || 1);
            if (db.inventory[idx].physicalQty != null) {
                db.inventory[idx].physicalQty -= qty;
            }
        }

        // 3. Add to kitchen internal stock tracker AND inventory
        const addedStdQty = qty * (invItem.standardYield || 1);
        if (!db.kitchenStock) db.kitchenStock = [];
        const kIdx = db.kitchenStock.findIndex(k => k.name === itemName);
        if (kIdx !== -1) {
            db.kitchenStock[kIdx].qty += addedStdQty;
            if (db.kitchenStock[kIdx].minQty == null && invItem.minQty != null) {
                db.kitchenStock[kIdx].minQty = Number(invItem.minQty);
            }
        } else {
            db.kitchenStock.push({
                name: itemName,
                sku: invItem.sku,
                unit: invItem.unit || '',
                qty: addedStdQty,
                minQty: invItem.minQty != null ? Number(invItem.minQty) : 3
            });
        }

        // --- Sync with db.inventory (warehouseId: 'restaurant') ---
        if (!db.inventory) db.inventory = [];
        let invIdxRes = db.inventory.findIndex(i => i.sku === invItem.sku && i.warehouseId === 'restaurant');
        if (invIdxRes === -1) {
            invIdxRes = db.inventory.findIndex(i => i.name === itemName && i.warehouseId === 'restaurant');
        }

        const addedCost = invItem.cost || 0;
        const addedPhysicalCost = invItem.physicalCost || (addedCost * (invItem.standardYield || 1));

        if (invIdxRes !== -1) {
            const oldQty = Number(db.inventory[invIdxRes].qty) || 0;
            const oldPhysicalQty = Number(db.inventory[invIdxRes].physicalQty) || 0;
            const oldCost = Number(db.inventory[invIdxRes].cost) || 0;
            const oldPhysicalCost = Number(db.inventory[invIdxRes].physicalCost) || (oldCost * (db.inventory[invIdxRes].standardYield || 1));
            
            const totalValue = (oldQty * oldCost) + (addedStdQty * addedCost);
            const totalPhysicalValue = (oldPhysicalQty * oldPhysicalCost) + (qty * addedPhysicalCost);
            
            const newTotalQty = oldQty + addedStdQty;
            const newTotalPhysicalQty = oldPhysicalQty + qty;

            db.inventory[invIdxRes].qty = newTotalQty;
            db.inventory[invIdxRes].physicalQty = newTotalPhysicalQty;
            db.inventory[invIdxRes].cost = newTotalQty > 0 ? (totalValue / newTotalQty) : addedCost;
            db.inventory[invIdxRes].physicalCost = newTotalPhysicalQty > 0 ? (totalPhysicalValue / newTotalPhysicalQty) : addedPhysicalCost;
            db.inventory[invIdxRes].standardYield = invItem.standardYield || 1;
        } else {
            db.inventory.push({
                name: itemName,
                sku: invItem.sku,
                qty: addedStdQty,
                physicalQty: qty,
                unit: invItem.unit || '',
                warehouseId: 'restaurant',
                cost: addedCost,
                physicalCost: addedPhysicalCost,
                standardYield: invItem.standardYield || 1
            });
        }
    });

    currentDb = await window.dbReadSlice(['kitchenTx', 'kitchenStock', 'inventory', 'issueOrders']);

    const prefs = getKitchenPrefs();
    if (prefs.autoPrintReceive) {
        printKitchenReceiveReceipt(newTx, 1);
        setTimeout(() => printKitchenReceiveReceipt(newTx, 2), 650);
    }
    maybeRunKitchenStockSoundCheck(currentDb);

    alert(`✅ تم حفظ سند الاستلام #${newTx.id} بنجاح!\n\n📦 ${itemName}\nالكمية المستلمة: ${qty}\nرصيد المخزن الجديد: ${newTx.warehouseQtyAfter}`);
    await switchTab('dashboard');
};

window.saveKitchenHandover = async function() {
    const itemName = document.getElementById('kp-out-item').value;
    const qty = Number(document.getElementById('kp-out-qty').value);
    const notes = "تسليم للمبيعات";

    if(!itemName || !qty || qty <= 0) {
        alert("يرجى اختيار الصنف وتحديد الكمية بشكل صحيح");
        return;
    }

    const newTx = {
        id: generateTxId('OUT'),
        type: 'handover',
        itemName: itemName,
        qty: qty,
        notes: notes,
        date: new Date().toISOString(),
        user: "مساعد الشيف"
    };

    await window.dbUpdate(db => {
        // 1. Save the transaction
        if (!db.kitchenTx) db.kitchenTx = [];
        db.kitchenTx.push(newTx);
        // (No inventory deduction on handover — items were already pulled from warehouse on receive)
    });

    currentDb = await window.dbReadSlice(['kitchenTx', 'kitchenStock', 'inventory', 'issueOrders']);

    alert(`✅ تم حفظ سند التسليم #${newTx.id} للمبيعات بنجاح!`);
    switchTab('dashboard');
};


function renderDashboard() {
    const txs = (currentDb && currentDb.kitchenTx) ? currentDb.kitchenTx : [];
    
    // --- Pending Issue Orders from Warehouse ---
    const kitchenDestinations = ['restaurant', 'kitchen_main', 'kitchen', 'kitchen_cold', 'kitchen_grills', 'kitchen_pastry', 'production'];
    const pendingOrders = (currentDb && currentDb.issueOrders)
        ? currentDb.issueOrders.filter(o =>
            o.status === 'قيد الاستلام' &&
            (kitchenDestinations.includes(o.destWh) || kitchenDestinations.includes(o.destKey))
          )
        : [];
    
    // Update Sidebar Navigation Badge
    const navLink = document.getElementById('kp-nav-pending');
    const navCnt = document.getElementById('kp-pending-count');
    if (navLink && navCnt) {
        if (pendingOrders.length > 0) {
            navLink.style.display = '';
            navCnt.textContent = pendingOrders.length;
        } else {
            navLink.style.display = 'none';
        }
    }

    let pendingHTML = '';
    if (pendingOrders.length > 0) {
        let cardsHTML = pendingOrders.map(order => `
            <div class="kp-pending-item">
                <div class="kp-pending-main">
                    <div class="kp-pending-header">
                        <span class="kp-pending-id">${order.id}</span>
                        <strong class="kp-pending-name">${order.itemName}</strong>
                    </div>
                    <div class="kp-pending-info">
                        <i class="ph ph-warehouse"></i> من: ${order.fromWhName} |
                        <i class="ph ph-calendar"></i> التاريخ: ${order.date} 
                        ${order.notes ? `| <i class="ph ph-info"></i> ${order.notes}` : ''}
                    </div>
                </div>
                <div class="kp-pending-actions">
                    <span class="kp-pending-qty">${order.qty} <span class="kp-pending-unit">${order.unit}</span></span>
                    <button class="kp-action-btn kp-confirm-btn" onclick="window.confirmKitchenReceiveOrder('${order.id}')">
                        <i class="ph ph-check-circle"></i> تأكيد الاستلام
                    </button>
                </div>
            </div>
        `).join('');

        pendingHTML = `
            <div class="kp-card kp-pending-wrapper">
                <div class="kp-pending-title-row">
                    <h3 class="kp-pending-title"><i class="ph ph-truck"></i> أوامر جاهزة بانتظار استلام المطبخ (${pendingOrders.length})</h3>
                </div>
                ${cardsHTML}
            </div>
        `;
    }
    // -----------------------------------------

    const receivedCount = Number((txs.filter(t => t.type === 'receive').reduce((sum, t) => sum + (Number(t.qty)||0), 0)).toFixed(2));
    const handoverCount = Number((txs.filter(t => t.type === 'handover').reduce((sum, t) => sum + (Number(t.qty)||0), 0)).toFixed(2));

    let receivedPhysicalCount = 0;
    txs.filter(t => t.type === 'receive').forEach(t => {
        let yld = 1;
        if (currentDb && currentDb.inventory) {
            const invItem = currentDb.inventory.find(i => (i.sku === t.itemSku || i.name === t.itemName) && i.warehouseId === 'restaurant');
            if (invItem && invItem.standardYield) {
                yld = Number(invItem.standardYield);
            }
        }
        receivedPhysicalCount += (Number(t.qty) || 0) / yld;
    });
    receivedPhysicalCount = Number(receivedPhysicalCount.toFixed(2));

    let rowsHTML = txs.slice(-10).reverse().map(t => {
        let badge = t.type === 'receive' ? '<span class="kp-badge status-in">استلام</span>' : '<span class="kp-badge status-out">تسليم</span>';
        let dateObj = new Date(t.date);
        let timeStr = dateObj.toLocaleTimeString('ar-SA') + ' - ' + dateObj.toLocaleDateString('ar-SA');
        
        // Lookup standardYield to calculate physicalQty
        let yld = 1;
        if (currentDb && currentDb.inventory) {
            const invItem = currentDb.inventory.find(i => (i.sku === t.itemSku || i.name === t.itemName) && i.warehouseId === 'restaurant');
            if (invItem && invItem.standardYield) {
                yld = Number(invItem.standardYield);
            }
        }
        const stdQty = Number(t.qty) || 0;
        const physQty = Number((stdQty / yld).toFixed(2));

        return `
            <tr>
                <td>#${t.id}</td>
                <td>${badge}</td>
                <td>${t.itemName}</td>
                <td><strong style="color:var(--accent-orange)">${Number(stdQty.toFixed(2))}</strong></td>
                <td><strong style="color:var(--accent-green)">${physQty}</strong></td>
                <td>${timeStr}</td>
                <td>${t.user || '-'}</td>
                <td>مكتمل</td>
            </tr>
        `;
    }).join("");

    if (rowsHTML === "") {
        rowsHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-muted);">لا يوجد سجل عمليات بعد.</td></tr>`;
    }

    return `
        ${pendingHTML}
        
        <div class="kp-stats-grid">
            <div class="kp-stat-card">
                <div class="kp-icon-box orange">
                    <i class="ph-fill ph-download-simple"></i>
                </div>
                <div class="kp-stat-details">
                    <p>إجمالي المستلم (نفر/طبق)</p>
                    <h3>${receivedCount} وحدة</h3>
                </div>
            </div>
            <div class="kp-stat-card">
                <div class="kp-icon-box green">
                    <i class="ph-fill ph-package"></i>
                </div>
                <div class="kp-stat-details">
                    <p>إجمالي المستلم (كمية فعلية)</p>
                    <h3>${receivedPhysicalCount} حبة</h3>
                </div>
            </div>
            <div class="kp-stat-card">
                <div class="kp-icon-box blue">
                    <i class="ph-fill ph-upload-simple"></i>
                </div>
                <div class="kp-stat-details">
                    <p>إجمالي المًسلَم للبيع</p>
                    <h3>${handoverCount} وحدة</h3>
                </div>
            </div>
            <div class="kp-stat-card" onclick="switchTab('stock')" style="cursor:pointer">
                <div class="kp-icon-box red">
                    <i class="ph-fill ph-warning-circle"></i>
                </div>
                <div class="kp-stat-details">
                    <p>أصناف قاربت على النفاذ</p>
                    <h3>${(currentDb.kitchenStock || []).filter(k => (Number(k.qty)||0) <= (Number(k.minQty)||3)).length} أصناف</h3>
                </div>
            </div>
            <div class="kp-stat-card">
                <div class="kp-icon-box green">
                    <i class="ph-fill ph-check-circle"></i>
                </div>
                <div class="kp-stat-details">
                    <p>سجل العمليات الإجمالي</p>
                    <h3>${txs.length} حركة</h3>
                </div>
            </div>
        </div>

        <div class="kp-table-container kp-card" style="padding:0; margin-top:20px;">
            <h3><i class="ph ph-clock-counter-clockwise"></i> آخر الحركات والاسناد (سجل المطبخ)</h3>
            <table class="kp-table">
                <thead>
                    <tr>
                        <th>رقم السند</th>
                        <th>النوع</th>
                        <th>الصنف</th>
                        <th>الكمية (نفر/طبق)</th>
                        <th>الكمية الفعلية</th>
                        <th>الوقت</th>
                        <th>المسؤول</th>
                        <th>الحالة</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHTML}
                </tbody>
            </table>
        </div>
    `;
}

/** 
 * ريندر لصفحة مستقلة مخصصة فقط للأوامر المعلقة (عند الضغط من السايدبار)
 */
function renderPendingIssues() {
    const kitchenDestinations = ['restaurant', 'kitchen_main', 'kitchen'];
    const pendingOrders = (currentDb && currentDb.issueOrders)
        ? currentDb.issueOrders.filter(o =>
            o.status === '\u0642\u064a\u062f \u0627\u0644\u0627\u0633\u062a\u0644\u0627\u0645' &&
            (kitchenDestinations.includes(o.destWh) || kitchenDestinations.includes(o.destKey))
          )
        : [];
    
    if (pendingOrders.length === 0) {
        return `
            <div class="kp-card">
                <div class="kp-empty-state">
                    <i class="ph ph-check-circle" style="color:var(--accent-green); opacity:0.5;"></i>
                    <h3>لا توجد أوامر معلقة حالياً</h3>
                    <p>تم استلام جميع طلبات الصرف المحولة من المستودعات.</p>
                    <button class="kp-action-btn secondary" style="margin-top:20px;" onclick="switchTab('dashboard')">العودة للوحة الرئيسية</button>
                </div>
            </div>
        `;
    }

    let cardsHTML = pendingOrders.map(order => `
        <div class="kp-pending-item">
            <div class="kp-pending-main">
                <div class="kp-pending-header">
                    <span class="kp-pending-id">${order.id}</span>
                    <strong class="kp-pending-name">${order.itemName}</strong>
                </div>
                <div class="kp-pending-info">
                    <i class="ph ph-warehouse"></i> من: ${order.fromWhName} |
                    <i class="ph ph-calendar"></i> التاريخ: ${order.date} 
                    ${order.notes ? `| <i class="ph ph-info"></i> ${order.notes}` : ''}
                </div>
            </div>
            <div class="kp-pending-actions">
                <span class="kp-pending-qty">${order.qty} <span class="kp-pending-unit">${order.unit}</span></span>
                <button class="kp-action-btn kp-confirm-btn" onclick="window.confirmKitchenReceiveOrder('${order.id}')">
                    <i class="ph ph-check-circle"></i> تأكيد الاستلام
                </button>
            </div>
        </div>
    `).join('');

    return `
        <div class="kp-card kp-pending-wrapper">
            <div class="kp-pending-title-row">
                <h3 class="kp-pending-title"><i class="ph ph-clock-counter-clockwise"></i> قائمة طلبات الصرف الواردة (${pendingOrders.length})</h3>
            </div>
            <p style="color:var(--text-muted); margin-bottom:20px; font-size:13px;">يرجى مراجعة الأصناف أدناه والضغط على "تأكيد الاستلام" لإضافتها لمخزون المطبخ فور وصولها فعلياً.</p>
            ${cardsHTML}
        </div>
    `;
}

window.updateRcvItemsList = function() {
    const wh = document.getElementById('kp-rcv-wh')?.value || 'main';
    let inventoryItems = currentDb && currentDb.inventory ? currentDb.inventory : [];
    inventoryItems = inventoryItems.filter((i) => (i.warehouseId || 'main') === wh);
    
    const sel = document.getElementById('kp-rcv-item');
    if (!sel) return;
    
    if(inventoryItems.length > 0) {
        sel.innerHTML = '<option value="" disabled selected>-- اختر الصنف لسحبه وتفريغ المخزون --</option>' + 
            inventoryItems.map((i) => `<option value="${i.name.replace(/"/g, '&quot;')}">${i.name} — متوفر: ${i.qty} ${i.unit || ''} (تكلفة: ${Number(i.cost||0).toFixed(2)})</option>`).join('');
    } else {
        sel.innerHTML = '<option value="" disabled selected>لا توجد أصناف في هذا المستودع</option>';
    }
};

function renderReceive() {
    const wh = getKitchenSourceWh();
    let inventoryItems = currentDb && currentDb.inventory ? currentDb.inventory : [];
    inventoryItems = inventoryItems.filter((i) => (i.warehouseId || 'main') === wh);
    
    // Auto-update to current date/time
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const localDatetime = now.toISOString().slice(0,16);

    const optionsJSON = inventoryItems.length > 0 
        ? inventoryItems.map((i) => `<option value="${i.name.replace(/"/g, '&quot;')}">${i.name} — متوفر: ${i.qty} ${i.unit || ''} (تكلفة: ${Number(i.cost||0).toFixed(2)})</option>`).join('')
        : '<option value="" disabled>لا توجد أصناف في هذا المستودع</option>';

    return `
        <div class="kp-card" style="border-top: 4px solid var(--accent-orange);">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom:15px; margin-bottom:20px;">
                <h3 style="margin:0;"><i class="ph ph-hand-grabbing text-orange"></i> سحب مواد من المخزن (طلب يدوي)</h3>
                <span style="background:rgba(234,179,8,0.15); color:#fbbf24; padding:5px 12px; border-radius:20px; font-size:12px;">سحب فوري</span>
            </div>
            
            <p style="color:var(--text-muted); margin-bottom:24px; font-size:13px;">استخدم هذه الشاشة إذا كان المطبخ يقوم <strong>بسحب</strong> المواد مباشرة دون انتظار أمر صرف من المخازن.</p>
            
            <div class="kp-form-grid">
                <div class="kp-form-group">
                    <label>تاريخ ووقت السحب</label>
                    <input type="datetime-local" class="kp-input" value="${localDatetime}" readonly style="opacity:0.8; cursor:not-allowed;">
                </div>
                <div class="kp-form-group">
                    <label>المسؤول (المستلم)</label>
                    <input type="text" class="kp-input" value="مدير المطبخ (تلقائي)" readonly style="opacity:0.8; cursor:not-allowed;">
                </div>
            </div>

            <div class="kp-form-group" style="margin-top:20px; background:rgba(0,0,0,0.15); padding:15px; border-radius:8px; border:1px solid rgba(255,255,255,0.03);">
                <label style="color:#fbbf24;"><i class="ph ph-warehouse"></i> مصدر السحب (اختر المستودع)</label>
                <select class="kp-select" id="kp-rcv-wh" onchange="window.updateRcvItemsList()" style="margin-bottom:15px; border-color:rgba(234,179,8,0.5);">
                    <option value="main" ${wh === 'main' ? 'selected' : ''}>المستودع الرئيسي</option>
                    <option value="restaurant" ${wh === 'restaurant' ? 'selected' : ''}>مخزن المطعم الداخلي</option>
                    <option value="beverages" ${wh === 'beverages' ? 'selected' : ''}>مخزن المشروبات</option>
                </select>

                <label style="color:#fbbf24;"><i class="ph ph-package"></i> الصنف المراد سحبه</label>
                <select class="kp-select" id="kp-rcv-item" style="font-weight:bold;">
                    <option value="" disabled selected>-- اختر الصنف لسحبه وتفريغ المخزون --</option>
                    ${optionsJSON}
                </select>
            </div>

            <div class="kp-form-grid" style="margin-top:20px;">
                <div class="kp-form-group">
                    <label><i class="ph ph-scales"></i> الكمية المسحوبة المطلوبة</label>
                    <input type="number" id="kp-rcv-qty" class="kp-input" placeholder="0" min="1" style="font-size:18px; font-weight:bold;">
                </div>
                <div class="kp-form-group">
                    <label><i class="ph ph-note"></i> سبب السحب / ملاحظات</label>
                    <input type="text" id="kp-rcv-notes" class="kp-input" placeholder="مثال: تعويض نقص فترة المساء...">
                </div>
            </div>

            <div style="margin-top:35px; display:flex; gap:12px; justify-content:flex-end; border-top: 1px solid rgba(255,255,255,0.05); padding-top:20px;">
                <button class="kp-action-btn secondary" onclick="switchTab('dashboard')"><i class="ph ph-x"></i> إلغاء ورجوع</button>
                <button class="kp-action-btn" style="background:linear-gradient(135deg, #f59e0b, #d97706); font-size:15px;" onclick="window.saveKitchenReceive()">
                    <i class="ph ph-check-circle"></i> تأكيد السحب وخصم المخزون
                </button>
            </div>
        </div>
    `;
}

function renderHandover() {
    const xf = (n) => (window.MisterCasherCurrency ? MisterCasherCurrency.format(n) : Number(n).toFixed(2) + ' ر.س');
    let menuItems = (currentDb && currentDb.products) ? currentDb.products : [];
    
    // Auto-update to current date/time
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const localDatetime = now.toISOString().slice(0,16);

    let optionsJSON = menuItems.length > 0
        ? menuItems.map((i) => `<option value="${i.nameAr}">${i.nameAr} — منيو (${xf(i.price)})</option>`).join('')
        : '<option value="" disabled>المنيو فارغ</option>';

    return `
        <div class="kp-card" style="border-top: 4px solid var(--accent-blue);">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom:15px; margin-bottom:20px;">
                <h3 style="margin:0;"><i class="ph ph-upload-simple text-blue"></i> تسليم جاهز (للمبيعات / نقاط البيع)</h3>
                <span style="background:rgba(59,130,246,0.15); color:#60a5fa; padding:5px 12px; border-radius:20px; font-size:12px;">مرحلة الإنتاج النهائي</span>
            </div>
            
            <p style="color:var(--text-muted); margin-bottom:24px; font-size:13px;">قم بتسجيل الأصناف الجاهزة (وجبات/منتجات تامة الصنع) التي تم إنتاجها وتسليمها للكاشير للبيع المباشر.</p>
            
            <div class="kp-form-grid">
                <div class="kp-form-group">
                    <label>تاريخ ووقت التسليم</label>
                    <input type="datetime-local" class="kp-input" value="${localDatetime}" readonly style="opacity:0.8; cursor:not-allowed;">
                </div>
                <div class="kp-form-group">
                    <label>القسم المستلم (الواجهة)</label>
                    <select class="kp-select">
                        <option>الكاشير الرئيسي (واجهة المطعم)</option>
                        <option>قسم التجهيز الخارجي (طلبات محلية)</option>
                    </select>
                </div>
            </div>

            <div class="kp-form-group" style="margin-top:20px; background:rgba(0,0,0,0.15); padding:15px; border-radius:8px; border:1px solid rgba(255,255,255,0.03);">
                <label style="color:#60a5fa;"><i class="ph ph-hamburger"></i> الصنف المنتج الجاهز (من المنيو)</label>
                <select class="kp-select" id="kp-out-item" style="font-weight:bold;">
                    <option value="" disabled selected>-- اختر الصنف الجاهز المُسلّم --</option>
                    ${optionsJSON}
                </select>
            </div>

            <div class="kp-form-grid" style="margin-top:20px;">
                <div class="kp-form-group">
                    <label><i class="ph ph-scales"></i> الكمية المُسلّمة (وحدة بيع)</label>
                    <input type="number" id="kp-out-qty" class="kp-input" placeholder="0" min="1" style="font-size:18px; font-weight:bold;">
                </div>
                <div class="kp-form-group">
                    <label><i class="ph ph-check-circle"></i> حالة المنتج</label>
                    <input type="text" class="kp-input" value="جاهز 100% للبيع المباشر" readonly style="color:#10b981; font-weight:bold; background:rgba(16,185,129,0.05); border-color:rgba(16,185,129,0.2);">
                </div>
            </div>

            <div style="margin-top:35px; display:flex; gap:12px; justify-content:flex-end; border-top: 1px solid rgba(255,255,255,0.05); padding-top:20px;">
                <button class="kp-action-btn secondary" onclick="switchTab('dashboard')"><i class="ph ph-x"></i> إلغاء ورجوع</button>
                <button class="kp-action-btn" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); font-size:15px;" onclick="window.saveKitchenHandover()">
                    <i class="ph ph-check"></i> حفظ واعتماد التسليم للبيع
                </button>
            </div>
        </div>
    `;
}

function renderReports() {
    return `
        <div class="kp-card">
            <h3><i class="ph ph-file-pdf"></i> التقارير وفواتير التحويل (المطبخ)</h3>
            <div class="kp-form-grid" style="margin-bottom:20px;">
                <div class="kp-form-group">
                    <label>تحديد الفترة</label>
                    <select class="kp-select" id="rpt-period">
                        <option value="today">اليوم</option>
                        <option value="week">هذا الأسبوع</option>
                        <option value="month">هذا الشهر</option>
                        <option value="all">جميع السجلات</option>
                    </select>
                </div>
                <div class="kp-form-group">
                    <label>نوع التقرير</label>
                    <select class="kp-select" id="rpt-type">
                        <option value="all">كل العمليات (استلام وتسليم)</option>
                        <option value="receive">الاستلام من المخازن فقط</option>
                        <option value="handover">المُسلّم للمبيعات فقط</option>
                    </select>
                </div>
            </div>
            <div style="display:flex; gap:10px;">
                <button class="kp-action-btn" onclick="window.showKitchenReport()"><i class="ph ph-magnifying-glass"></i> عرض التقرير</button>
                <button class="kp-action-btn secondary" onclick="window.printKitchenReport()"><i class="ph ph-printer"></i> طباعة التقرير</button>
            </div>
        </div>

        <div id="rpt-result" class="kp-card" style="padding:0; margin-top:20px;">
            <div class="kp-empty-state" style="padding:40px;">
                <i class="ph ph-files"></i>
                <h3>اختر المحددات واضغط عرض التقرير</h3>
                <p>سوف تظهر هنا قائمة الإسناد والفواتير بشكل كامل ويمكن طباعتها.</p>
            </div>
        </div>
    `;
}

window.showKitchenReport = function() {
    const period = document.getElementById('rpt-period').value;
    const type = document.getElementById('rpt-type').value;
    const resultDiv = document.getElementById('rpt-result');

    let txs = (currentDb && currentDb.kitchenTx) ? [...currentDb.kitchenTx] : [];

    // Filter by period
    const now = new Date();
    txs = txs.filter(t => {
        const d = new Date(t.date);
        if (period === 'today') {
            return d.toDateString() === now.toDateString();
        } else if (period === 'week') {
            const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
            return d >= weekAgo;
        } else if (period === 'month') {
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }
        return true;
    });

    // Filter by type
    if (type !== 'all') txs = txs.filter(t => t.type === type);

    if (txs.length === 0) {
        resultDiv.innerHTML = `<div class="kp-empty-state" style="padding:40px;"><i class="ph ph-magnifying-glass"></i><h3>لا توجد نتائج لهذه المحددات</h3><p>جرب تغيير الفترة الزمنية أو نوع التقرير.</p></div>`;
        return;
    }

    const totalQty = txs.reduce((s, t) => s + t.qty, 0);
    const rows = txs.reverse().map(t => {
        const isReceive = t.type === 'receive';
        const badge = isReceive ? '<span class="kp-badge status-in">استلام</span>' : '<span class="kp-badge status-out">تسليم</span>';
        const d = new Date(t.date).toLocaleString('ar-SA');
        return `
            <tr>
                <td><strong>#${t.id}</strong></td>
                <td>${badge}</td>
                <td>${t.itemName}</td>
                <td>${t.qty}</td>
                <td>${d}</td>
                <td>${t.user || '-'}</td>
                <td>${t.notes || '-'}</td>
                <td>
                    <button class="kp-action-btn secondary" style="padding:6px 10px; font-size:12px;" onclick="window.printSingleTx('${t.id}')">
                        <i class="ph ph-printer"></i> طباعة
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    resultDiv.innerHTML = `
        <h3 style="padding:15px; margin:0; border-bottom:1px solid var(--border-color);">
            <i class="ph ph-list-bullets"></i> نتائج التقرير — ${txs.length} سند | إجمالي الكميات: ${totalQty}
        </h3>
        <table class="kp-table">
            <thead>
                <tr>
                    <th>رقم السند</th><th>النوع</th><th>الصنف</th><th>الكمية</th>
                    <th>التاريخ والوقت</th><th>المسؤول</th><th>الملاحظات</th><th>طباعة</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
};

window.printKitchenReport = function() {
    const period = document.getElementById('rpt-period')?.value || 'all';
    const type = document.getElementById('rpt-type')?.value || 'all';
    let txs = (currentDb && currentDb.kitchenTx) ? [...currentDb.kitchenTx] : [];
    const now = new Date();
    txs = txs.filter(t => {
        const d = new Date(t.date);
        if (period === 'today') return d.toDateString() === now.toDateString();
        if (period === 'week') { const w = new Date(now); w.setDate(now.getDate()-7); return d >= w; }
        if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        return true;
    });
    if (type !== 'all') txs = txs.filter(t => t.type === type);
    const totalQty = txs.reduce((s,t) => s + t.qty, 0);
    const rows = txs.map(t => `
        <tr>
            <td>#${t.id}</td>
            <td>${t.type === 'receive' ? 'استلام' : 'تسليم'}</td>
            <td>${t.itemName}</td>
            <td>${t.qty}</td>
            <td>${new Date(t.date).toLocaleString('ar-SA')}</td>
            <td>${t.user || '-'}</td>
        </tr>`).join('');
    const html = `
        <html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تقرير المطبخ والإنتاج</title>
        <style>
            @page { size: 80mm auto; margin: 0; }
            html { overflow: visible; }
            body { 
                width: 100%; 
                max-width: 80mm; 
                margin: 0 auto; 
                padding: 0;
                background: #fff; 
                color: #000; 
                direction: rtl;
                font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; 
                text-align: center; 
                font-size: 10pt;
                line-height: 1.4;
                overflow: visible; 
            }
            .receipt-wrapper {
                width: 100%;
                padding: 3mm 6mm 3mm 4mm;
                margin: 0 auto;
                box-sizing: border-box;
            }
            h1 { text-align:center; font-size:22px; margin-bottom:5px; }
            p.sub { text-align:center; color:#666; margin:0 0 20px; }
            table { width:100%; border-collapse:collapse; margin-top:20px; font-size:12px; }
            th { background:#1a1a2e; color:white; padding:10px 8px; }
            td { padding:9px 8px; border-bottom:1px solid #eee; }
            tr:nth-child(even) { background:#f9f9f9; }
            .footer { margin-top:30px; text-align:center; font-size:12px; color:#999; border-top:1px solid #ddd; padding-top:10px; }
            .total { text-align:left; font-weight:bold; margin-top:15px; font-size:16px; }
            @media print { button { display:none; } }
        </style></head>
        <body>
            <div class="receipt-wrapper">
            <h1>🍽 تقرير المطبخ والإنتاج</h1>
            <p class="sub">طُبع بتاريخ: ${new Date().toLocaleString('ar-SA')}</p>
            <table>
                <thead><tr><th>رقم السند</th><th>النوع</th><th>الصنف</th><th>الكمية</th><th>التاريخ</th><th>المسؤول</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <p class="total">إجمالي عدد السندات: ${txs.length} | إجمالي الكميات: ${totalQty}</p>
            <div class="footer">تم الإنشاء بواسطة نظام Mister Casher للمطاعم</div>
            <br><button onclick="window.print()" style="padding:10px 20px;background:#ff4757;color:white;border:none;border-radius:6px;cursor:pointer;font-size:15px;">🖨️ طباعة الآن</button>
            </div>
        </body></html>`;
    void sendKitchenHtmlToPrinter(html);
};

window.printSingleTx = function(txId) {
    const txs = (currentDb && currentDb.kitchenTx) ? currentDb.kitchenTx : [];
    const t = txs.find(x => x.id === txId);
    if (!t) return;
    const typeName = t.type === 'receive' ? 'سند استلام من المخزن' : 'سند تسليم للمبيعات';
    const html = `
        <html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${typeName}</title>
        <style>
            @page { size: 80mm auto; margin: 0; }
            html { overflow: visible; }
            body { 
                width: 100%; 
                max-width: 80mm; 
                margin: 0 auto; 
                padding: 0;
                background: #fff; 
                color: #000; 
                direction: rtl;
                font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; 
                text-align: center; 
                font-size: 10pt;
                line-height: 1.4;
                overflow: visible; 
            }
            .receipt-wrapper {
                width: 100%;
                padding: 3mm 6mm 3mm 4mm;
                margin: 0 auto;
                box-sizing: border-box;
            }
            .logo { font-size:24px; font-weight:900; margin-bottom:5px; }
            .subtitle { color:#888; font-size:13px; margin-bottom:15px; }
            .type-badge { display:inline-block; border:2px solid #333; padding:5px 20px; border-radius:5px; font-weight:700; margin-bottom:20px; }
            .details { text-align:right; background:#f9f9f9; border-radius:8px; padding:15px; margin-bottom:20px; }
            .details p { margin:8px 0; border-bottom:1px solid #eee; padding-bottom:4px; font-size:14px; }
            .label { font-weight:700; display:inline-block; width:130px; }
            .footer { margin-top:20px; font-size:11px; color:#aaa; border-top:1px dashed #ccc; padding-top:10px; }
            .footer p { margin:4px 0; }
            @media print { button { display:none; } }
        </style></head>
        <body>
            <div class="receipt-wrapper">
            <div class="logo">🍽 Mister Casher</div>
            <div class="subtitle">المطبخ والإنتاج</div>
            <div class="type-badge">${typeName}</div>
            <div class="details">
                <p><span class="label">رقم السند:</span> #${t.id}</p>
                <p><span class="label">التاريخ والوقت:</span> ${new Date(t.date).toLocaleString('ar-SA')}</p>
                <p><span class="label">اسم الصنف:</span> ${t.itemName}</p>
                <p><span class="label">الكمية:</span> ${t.qty}</p>
                <p><span class="label">المسؤول:</span> ${t.user || '-'}</p>
                <p><span class="label">ملاحظات:</span> ${t.notes || '-'}</p>
            </div>
            <div class="footer">
                <p>توقيع المستلم: ................................</p>
                <p>توقيع المشرف: ................................</p>
                <p>Mister Casher — نظام إدارة المطاعم</p>
            </div>
            <br><button onclick="window.print()" style="padding:8px 18px;background:#ff4757;color:white;border:none;border-radius:6px;cursor:pointer;">🖨️ طباعة</button>
            </div>
        </body></html>`;
    void sendKitchenHtmlToPrinter(html);
};


function renderOptions() {
    const p = getKitchenPrefs();
    const wh = getKitchenSourceWh();
    return `
        <div class="kp-card">
            <h3><i class="ph ph-gear"></i> الإعدادات المتقدمة للمطبخ والانتاج</h3>

            <div class="kp-form-group" style="margin-top:20px; max-width:480px;">
                <label>مستودع الاستلام الافتراضي (يُخصم منه الرصيد عند سند الاستلام وعند البيع إن فُعّل الخصم التلقائي)</label>
                <select class="kp-select" id="kp-pref-wh">
                    <option value="main" ${wh === 'main' ? 'selected' : ''}>المستودع الرئيسي</option>
                    <option value="restaurant" ${wh === 'restaurant' ? 'selected' : ''}>مخزن المطعم الداخلي</option>
                    <option value="beverages" ${wh === 'beverages' ? 'selected' : ''}>مخزن المشروبات</option>
                </select>
            </div>
            
            <div style="display:flex; flex-direction:column; gap:15px; margin-top:20px;">
                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:15px; border-radius:8px; border:1px solid var(--border-color);">
                    <div>
                        <h4 style="margin:0;">خصم تلقائي من المخزن بمجرد البيع (بدون تسليم مسبق)</h4>
                        <span style="font-size:12px; color:var(--text-muted);">يُخصم من المستودع أعلاه عند تأكيد الدفع في نقطة البيع (باسم الصنف أو عبر حقل rawMaterials في المنتج). شاشة KDS لن تُنشئ تسليماً تلقائياً لمخزون المطبخ.</span>
                    </div>
                    <label class="switch">
                        <input type="checkbox" id="kp-pref-auto-deduct" ${p.autoDeductOnSale ? 'checked' : ''}>
                        <span class="slider round"></span>
                    </label>
                </div>
                
                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:15px; border-radius:8px; border:1px solid var(--border-color);">
                    <div>
                        <h4 style="margin:0;">تنبيه صوتي باقتراب نفاذ مواد المطبخ</h4>
                        <span style="font-size:12px; color:var(--text-muted);">صفّارة قصيرة عند دخول لوحة المطبخ إذا كان رصيد مادة في مخزون المطبخ الداخلي ≤ الحد الأدنى (من المخزن أو 3 افتراضياً).</span>
                    </div>
                    <label class="switch">
                        <input type="checkbox" id="kp-pref-sound" ${p.soundAlertLowStock ? 'checked' : ''}>
                        <span class="slider round"></span>
                    </label>
                </div>
                
                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:15px; border-radius:8px; border:1px solid var(--border-color);">
                    <div>
                        <h4 style="margin:0;">طباعة سند الاستلام تلقائياً</h4>
                        <span style="font-size:12px; color:var(--text-muted);">بعد حفظ سند الاستلام من المخزن يُفتحان نافذتان للطباعة (نسختان).</span>
                    </div>
                    <label class="switch">
                        <input type="checkbox" id="kp-pref-autoprint" ${p.autoPrintReceive ? 'checked' : ''}>
                        <span class="slider round"></span>
                    </label>
                </div>
            </div>
            
            <div style="margin-top:30px;">
                <button type="button" class="kp-action-btn" onclick="window.saveKitchenPrefs()"><i class="ph ph-floppy-disk"></i> حفظ الإعدادات</button>
            </div>
        </div>
    `;
}

window.saveKitchenPrefs = function () {
    const sel = document.getElementById('kp-pref-wh');
    const autoD = document.getElementById('kp-pref-auto-deduct');
    const sound = document.getElementById('kp-pref-sound');
    const autop = document.getElementById('kp-pref-autoprint');
    const prev = getKitchenPrefs();
    const sw = sel && sel.value;
    const next = {
        sourceWarehouse: ['main', 'restaurant', 'beverages'].includes(sw) ? sw : prev.sourceWarehouse,
        autoDeductOnSale: !!(autoD && autoD.checked),
        soundAlertLowStock: !!(sound && sound.checked),
        autoPrintReceive: !!(autop && autop.checked)
    };
    localStorage.setItem(KITCHEN_PREFS_KEY, JSON.stringify(next));
    alert('تم حفظ إعدادات المطبخ (المستودع، الخصم عند البيع، التنبيه الصوتي، الطباعة التلقائية).');
};

function renderStock() {
    const inv = (currentDb && currentDb.inventory) ? currentDb.inventory.filter(i => i.warehouseId === 'restaurant') : [];
    
    let rows = inv.map(i => {
        const min = i.minQty != null ? i.minQty : 3;
        const isLow = Number(i.qty) <= min;
        return `
            <tr class="${isLow ? 'kp-row-warning' : ''}">
                <td>${i.sku || '-'}</td>
                <td style="font-weight:bold;">${i.name}</td>
                <td><span class="kp-badge ${isLow ? 'status-out' : 'status-in'}">${i.qty} ${i.unit || ''}</span></td>
                <td>${min}</td>
                <td>${Number(i.cost || 0).toFixed(2)} ر.س</td>
                <td>
                    ${isLow ? '<i class="ph-fill ph-warning" style="color:var(--accent-orange)"></i> منخفض' : '<i class="ph-fill ph-check-circle" style="color:var(--accent-green)"></i> متوفر'}
                </td>
            </tr>
        `;
    }).join('');

    if (!rows) {
        rows = `<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--text-muted);">لا يوجد مخزون في المطبخ حالياً. قم باستلام مواد من المخزن.</td></tr>`;
    }

    return `
        <div class="kp-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h3 style="margin:0;"><i class="ph ph-package"></i> المواد الخام والسلع المتوفرة بالمطبخ</h3>
                <button class="kp-action-btn secondary" onclick="switchTab('receive')"><i class="ph ph-plus"></i> استلام مواد جديدة</button>
            </div>
            <div class="kp-table-container">
                <table class="kp-table">
                    <thead>
                        <tr>
                            <th>SKU</th>
                            <th>اسم الصنف</th>
                            <th>الكمية المتبقية</th>
                            <th>الحد الأدنى</th>
                            <th>التكلفة</th>
                            <th>الحالة</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// --- Migration / Auto-Sync Logic ---
function renderStock() {
    const inv = (currentDb && currentDb.inventory) ? currentDb.inventory.filter(i => i.warehouseId === 'restaurant') : [];
    const txs = (currentDb && currentDb.kitchenTx) ? currentDb.kitchenTx : [];

    // Grouping and sorting
    const grouped = {};
    inv.forEach(i => {
        const n = i.name.trim();
        if (!grouped[n]) {
            grouped[n] = { ...i, qty: 0, physicalQty: 0 };
        }
        grouped[n].qty += (Number(i.qty) || 0);
        grouped[n].physicalQty += (Number(i.physicalQty) || 0);
    });

    const items = Object.values(grouped).sort((a,b) => a.qty - b.qty);

    let cardsHTML = items.map(i => {
        const min = i.minQty != null ? i.minQty : 3;
        const yld = Number(i.standardYield) || 1;
        const stdQty = Number(i.qty) || 0;
        // إذا كانت physicalQty غير مسجلة، نحسبها من qty ÷ standardYield
        const physQty = (i.physicalQty != null && Number(i.physicalQty) > 0)
            ? Number(i.physicalQty)
            : stdQty / yld;
        const isLow = physQty <= min;
        const totalIn = txs.filter(t => t.type === 'receive' && t.itemName.trim() === i.name.trim()).reduce((s, t) => s + (Number(t.qty)||0), 0);
        const fmt = (n) => Number(Number(n).toFixed(2));
        
        return `
            <div class="kp-stock-card">
                <div class="kp-stock-card-header">
                    <div>
                        <h4 class="kp-stock-name">${i.name}</h4>
                        <span class="kp-stock-sku">${i.sku || 'بدون كود'}</span>
                    </div>
                    <div class="kp-status-tag ${isLow ? 'status-warning' : 'status-safe'}">
                        <i class="ph-fill ${isLow ? 'ph-warning' : 'ph-check-circle'}"></i>
                        ${isLow ? 'يحتاج طلب' : 'متوفر جيد'}
                    </div>
                </div>

                <div class="kp-stock-main">
                    <span class="kp-qty-large" style="color: ${isLow ? '#f59e0b' : '#10b981'}">
                        ${fmt(physQty)}
                        <span class="kp-qty-unit">${i.unit || 'وحدة'}</span>
                    </span>
                    <span class="kp-qty-label">الكمية الفعلية الحالية</span>
                </div>

                <div class="kp-stock-main" style="margin-top: 10px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 10px;">
                    <span class="kp-qty-large" style="color: var(--accent-orange); font-size: 24px;">
                        ${fmt(stdQty)}
                        <span class="kp-qty-unit">نفر/طبق</span>
                    </span>
                    <span class="kp-qty-label">السعة التشغيلية (جاهز للبيع)</span>
                </div>

                <div class="kp-stock-footer">
                    <div class="kp-audit-info">
                        <i class="ph ph-list-checks"></i>
                        مجموع المستلم: ${fmt(totalIn)}
                    </div>
                    <div style="font-size: 11px; color: var(--text-muted)">
                        الحد الأدنى: ${min}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (!cardsHTML) {
        cardsHTML = `
            <div class="kp-empty-state" style="grid-column: 1 / -1; padding: 100px 0;">
                <i class="ph ph-package" style="font-size: 80px;"></i>
                <h2 style="color:white">لا يوجد مخزون في المطبخ</h2>
                <p>قم باستلام بضاعة من المخازن لتظهر هنا</p>
                <button class="kp-action-btn" onclick="switchTab('receive')" style="margin-top:20px">
                    <i class="ph ph-plus"></i> ابدأ الاستلام الآن
                </button>
            </div>
        `;
    }

    return `
        <div class="kp-stock-grid">
            ${cardsHTML}
        </div>
    `;
}

// Syncs kitchenStock purely from the global inventory (the master source of truth)
async function syncKitchenStockToInventory(forceFromLog = false) {
    const db = await window.dbReadSlice(['inventory', 'kitchenStock']);
    let changed = false;
    if (!db.inventory) { db.inventory = []; }
    const restaurantInv = db.inventory.filter(i => i.warehouseId === 'restaurant');
    const newStock = restaurantInv.map(i => ({
        name: i.name,
        sku: i.sku,
        qty: i.qty,
        unit: i.unit || '',
        minQty: i.minQty != null ? i.minQty : 3
    }));
    if (JSON.stringify(db.kitchenStock) !== JSON.stringify(newStock)) {
        db.kitchenStock = newStock;
        changed = true;
    }
    if (changed) {
        await window.dbWrite(db);
        if (typeof currentDb !== 'undefined') { currentDb = db; }
    }
}

// Run sync immediately
syncKitchenStockToInventory();
