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
    currentDb = await window.dbRead();
    if (!currentDb.kitchenTx) {
        await window.dbUpdate((db) => {
            if (!db.kitchenTx) db.kitchenTx = [];
        });
        currentDb.kitchenTx = [];
    }

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
            currentDb = await window.dbRead();
            await switchTab(kpActiveTab);
            navItems.forEach((nav) => {
                nav.classList.toggle('active', nav.getAttribute('data-tab') === kpActiveTab);
            });
        });
    }
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

function printKitchenReceiveReceipt(tx, copyLabel) {
    const wh = kitchenWhLabel(tx.sourceWarehouse || getKitchenSourceWh());
    const win = window.open('', '_blank', 'width=450,height=620');
    const label = copyLabel ? ` — نسخة ${copyLabel}` : '';
    win.document.write(`
        <html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>سند استلام${label}</title>
        <style>
            body { font-family:'Segoe UI',Tahoma,sans-serif; padding:22px; color:#333; text-align:center; }
            .logo { font-size:22px; font-weight:900; margin-bottom:4px; }
            .badge { display:inline-block; border:2px solid #333; padding:6px 18px; border-radius:6px; font-weight:700; margin:12px 0; }
            .details { text-align:right; background:#f9f9f9; border-radius:8px; padding:14px; margin-bottom:16px; font-size:14px; }
            .details p { margin:7px 0; border-bottom:1px solid #eee; padding-bottom:4px; }
            .label { font-weight:700; display:inline-block; width:125px; }
            @media print { button { display:none; } }
        </style></head><body>
            <div class="logo">🍽 هـش HASH</div>
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
            <button onclick="window.print()" style="padding:8px 18px;background:#ff4757;color:white;border:none;border-radius:6px;cursor:pointer;">طباعة</button>
        </body></html>`);
    win.document.close();
}

async function switchTab(tab) {
    kpActiveTab = tab || 'dashboard';
    const contentArea = document.getElementById('main-content-area');
    const pageTitle = document.getElementById('page-title');

    contentArea.innerHTML = '';

    if (tab === 'receive') {
        currentDb = await window.dbRead();
    }

    if (tab === 'dashboard') {
        pageTitle.innerText = 'لوحة رئيسية الإنتاج';
        contentArea.innerHTML = renderDashboard();
        setTimeout(async () => {
            try {
                const db = await window.dbRead();
                maybeRunKitchenStockSoundCheck(db);
            } catch (e) {}
        }, 400);
    } else if (tab === 'receive') {
        pageTitle.innerText = 'استلام مواد من المخزن';
        contentArea.innerHTML = renderReceive();
    } else if (tab === 'handover') {
        pageTitle.innerText = "تسليم للمبيعات";
        contentArea.innerHTML = renderHandover();
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
window.saveKitchenReceive = async function() {
    const itemName = document.getElementById('kp-rcv-item').value;
    const qty = Number(document.getElementById('kp-rcv-qty').value);
    const notes = document.getElementById('kp-rcv-notes').value;
    const sourceWh = getKitchenSourceWh();

    if (!itemName || !qty || qty <= 0) {
        alert('يرجى اختيار الصنف وتحديد الكمية بشكل صحيح');
        return;
    }

    const db = await window.dbRead();
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
        if (idx !== -1) {
            db.inventory[idx].qty -= qty;
        }

        // 3. Add to kitchen internal stock tracker
        if (!db.kitchenStock) db.kitchenStock = [];
        const kIdx = db.kitchenStock.findIndex(k => k.name === itemName);
        if (kIdx !== -1) {
            db.kitchenStock[kIdx].qty += qty;
            if (db.kitchenStock[kIdx].minQty == null && invItem.minQty != null) {
                db.kitchenStock[kIdx].minQty = Number(invItem.minQty);
            }
        } else {
            db.kitchenStock.push({
                name: itemName,
                sku: invItem.sku,
                unit: invItem.unit || '',
                qty: qty,
                minQty: invItem.minQty != null ? Number(invItem.minQty) : 3
            });
        }
    });

    currentDb = await window.dbRead();

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

    currentDb = await window.dbRead();

    alert(`✅ تم حفظ سند التسليم #${newTx.id} للمبيعات بنجاح!`);
    switchTab('dashboard');
};


function renderDashboard() {
    const txs = (currentDb && currentDb.kitchenTx) ? currentDb.kitchenTx : [];
    
    const receivedCount = txs.filter(t => t.type === 'receive').reduce((sum, t) => sum + t.qty, 0);
    const handoverCount = txs.filter(t => t.type === 'handover').reduce((sum, t) => sum + t.qty, 0);

    let rowsHTML = txs.slice(-10).reverse().map(t => {
        let badge = t.type === 'receive' ? '<span class="kp-badge status-in">استلام</span>' : '<span class="kp-badge status-out">تسليم</span>';
        let dateObj = new Date(t.date);
        let timeStr = dateObj.toLocaleTimeString('ar-SA') + ' - ' + dateObj.toLocaleDateString('ar-SA');
        return `
            <tr>
                <td>#${t.id}</td>
                <td>${badge}</td>
                <td>${t.itemName}</td>
                <td>${t.qty}</td>
                <td>${timeStr}</td>
                <td>${t.user || '-'}</td>
                <td>مكتمل</td>
            </tr>
        `;
    }).join("");

    if (rowsHTML === "") {
        rowsHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">لا يوجد سجل عمليات بعد.</td></tr>`;
    }

    return `
        <div class="kp-stats-grid">
            <div class="kp-stat-card">
                <div class="kp-icon-box orange">
                    <i class="ph-fill ph-download-simple"></i>
                </div>
                <div class="kp-stat-details">
                    <p>إجمالي المستلم (وحده)</p>
                    <h3>${receivedCount} وحدة</h3>
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
            <div class="kp-stat-card">
                <div class="kp-icon-box red">
                    <i class="ph-fill ph-warning-circle"></i>
                </div>
                <div class="kp-stat-details">
                    <p>أصناف قاربت على النفاذ</p>
                    <h3>0 أصناف</h3>
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
                        <th>الكمية</th>
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

function renderReceive() {
    const wh = getKitchenSourceWh();
    let inventoryItems = currentDb && currentDb.inventory ? currentDb.inventory : [];
    inventoryItems = inventoryItems.filter((i) => (i.warehouseId || 'main') === wh);
    const optionsJSON = inventoryItems
        .map((i) => `<option value="${i.name.replace(/"/g, '&quot;')}">${i.name} (متوفر: ${i.qty})</option>`)
        .join('');

    return `
        <div class="kp-card">
            <h3><i class="ph ph-download-simple"></i> سند استلام من المخزن للمطبخ</h3>
            <p style="color:var(--text-muted); margin-bottom:20px;">المصدر الحالي: <strong style="color:var(--accent-orange)">${kitchenWhLabel(wh)}</strong> — يمكن تغييره من تبويب «خيارات إعدادات المطبخ».</p>
            
            <div class="kp-form-grid">
                <div class="kp-form-group">
                    <label>تاريخ ووقت الاستلام</label>
                    <input type="datetime-local" class="kp-input" value="2026-04-02T08:30">
                </div>
                <div class="kp-form-group">
                    <label>المسؤول (المستلم)</label>
                    <input type="text" class="kp-input" value="الشيف التنفيذي / أحمد" readonly>
                </div>
            </div>

            <div class="kp-form-group" style="margin-top:20px;">
                <label>اختيار الصنف / المادة الخام (قائمة المخازن)</label>
                <select class="kp-select" id="kp-rcv-item">
                    <option value="" disabled selected>اختر الصنف من المخزن...</option>
                    ${optionsJSON}
                </select>
            </div>

            <div class="kp-form-grid" style="margin-top:20px;">
                <div class="kp-form-group">
                    <label>الكمية المستلمة</label>
                    <input type="number" id="kp-rcv-qty" class="kp-input" placeholder="0" min="1">
                </div>
                <div class="kp-form-group">
                    <label>ملاحظات الاستلام</label>
                    <input type="text" id="kp-rcv-notes" class="kp-input" placeholder="مثال: بحالة ممتازة للاستخدام الفوري">
                </div>
            </div>

            <div style="margin-top:30px; display:flex; gap:10px; justify-content:flex-end;">
                <button class="kp-action-btn secondary"><i class="ph ph-x"></i> إلغاء تفريغ</button>
                <button class="kp-action-btn" onclick="window.saveKitchenReceive()"><i class="ph ph-check"></i> حفظ سند الاستلام وإضافته للسجل</button>
            </div>
        </div>
    `;
}

function renderHandover() {
    const xf = (n) => (window.HashCurrency ? HashCurrency.format(n) : Number(n).toFixed(2) + ' ر.س');
    let menuItems = (currentDb && currentDb.products) ? currentDb.products : [];
    let optionsJSON = menuItems.map((i) => `<option value="${i.nameAr}">${i.nameAr} (${xf(i.price)})</option>`).join('');

    return `
        <div class="kp-card">
            <h3><i class="ph ph-upload-simple"></i> سند تسليم نقاط البيع (جاهز)</h3>
            <p style="color:var(--text-muted); margin-bottom:20px;">قم بتسجيل الأصناف المنتجة الجاهزة التي تم تسليمها للكاشير أو الواجهة للبيع المباشر.</p>
            
            <div class="kp-form-grid">
                <div class="kp-form-group">
                    <label>تاريخ ووقت التسليم</label>
                    <input type="datetime-local" class="kp-input" value="2026-04-02T08:30">
                </div>
                <div class="kp-form-group">
                    <label>القسم المستلم</label>
                    <select class="kp-select">
                        <option>الكاشير الرئيسي (واجهة المحل)</option>
                        <option>قسم التجهيز الخارجي</option>
                    </select>
                </div>
            </div>

            <div class="kp-form-group" style="margin-top:20px;">
                <label>اختيار الصنف المنتج (المنيو)</label>
                <select class="kp-select" id="kp-out-item">
                    <option value="" disabled selected>اختر الصنف من المنيو...</option>
                    ${optionsJSON}
                </select>
            </div>

            <div class="kp-form-grid" style="margin-top:20px;">
                <div class="kp-form-group">
                    <label>الكمية المُسلّمة</label>
                    <input type="number" id="kp-out-qty" class="kp-input" placeholder="0" min="1">
                </div>
                <div class="kp-form-group">
                    <label>حالة التسليم</label>
                    <input type="text" class="kp-input" value="مباشر للبيع" readonly style="color:var(--text-muted);">
                </div>
            </div>

            <div style="margin-top:30px; display:flex; gap:10px; justify-content:flex-end;">
                <button class="kp-action-btn secondary"><i class="ph ph-x"></i> إلغاء تفريغ</button>
                <button class="kp-action-btn" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);" onclick="window.saveKitchenHandover()"><i class="ph ph-check"></i> حفظ واعتماد التسليم للبيع</button>
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
    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(`
        <html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تقرير المطبخ والإنتاج</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, sans-serif; padding:30px; color:#333; }
            h1 { text-align:center; font-size:22px; margin-bottom:5px; }
            p.sub { text-align:center; color:#666; margin:0 0 20px; }
            table { width:100%; border-collapse:collapse; margin-top:20px; }
            th { background:#1a1a2e; color:white; padding:10px 8px; }
            td { padding:9px 8px; border-bottom:1px solid #eee; }
            tr:nth-child(even) { background:#f9f9f9; }
            .footer { margin-top:30px; text-align:center; font-size:12px; color:#999; border-top:1px solid #ddd; padding-top:10px; }
            .total { text-align:left; font-weight:bold; margin-top:15px; font-size:16px; }
            @media print { button { display:none; } }
        </style></head>
        <body>
            <h1>🍽 تقرير المطبخ والإنتاج</h1>
            <p class="sub">طُبع بتاريخ: ${new Date().toLocaleString('ar-SA')}</p>
            <table>
                <thead><tr><th>رقم السند</th><th>النوع</th><th>الصنف</th><th>الكمية</th><th>التاريخ</th><th>المسؤول</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <p class="total">إجمالي عدد السندات: ${txs.length} | إجمالي الكميات: ${totalQty}</p>
            <div class="footer">تم الإنشاء بواسطة نظام هـش HASH للمطاعم</div>
            <br><button onclick="window.print()" style="padding:10px 20px;background:#ff4757;color:white;border:none;border-radius:6px;cursor:pointer;font-size:15px;">🖨️ طباعة الآن</button>
        </body></html>`);
    win.document.close();
};

window.printSingleTx = function(txId) {
    const txs = (currentDb && currentDb.kitchenTx) ? currentDb.kitchenTx : [];
    const t = txs.find(x => x.id === txId);
    if (!t) return;
    const typeName = t.type === 'receive' ? 'سند استلام من المخزن' : 'سند تسليم للمبيعات';
    const win = window.open('', '_blank', 'width=450,height=650');
    win.document.write(`
        <html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${typeName}</title>
        <style>
            body { font-family:'Segoe UI',Tahoma,sans-serif; padding:25px; color:#333; text-align:center; }
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
            <div class="logo">🍽 هـش HASH</div>
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
                <p>هـش HASH — نظام إدارة المطاعم</p>
            </div>
            <br><button onclick="window.print()" style="padding:8px 18px;background:#ff4757;color:white;border:none;border-radius:6px;cursor:pointer;">🖨️ طباعة</button>
        </body></html>`);
    win.document.close();
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
