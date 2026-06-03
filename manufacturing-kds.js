const { ipcRenderer } = require('electron');

async function saveDB(db) {
    await window.dbWrite(db);
    try { ipcRenderer.send('notify-db-changed'); } catch(e) {}
}

document.addEventListener('DOMContentLoaded', async () => {

    // --- Time Clock (يتوقف عند إخفاء النافذة لتوفير المعالج) ---
    let kdsClockTimer = null;
    function tickKdsClock() {
        const el = document.getElementById('kds-live-clock');
        if (!el || document.hidden) return;
        el.innerText = new Date().toLocaleTimeString('en-US', {
            hour12: true,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    }
    function startKdsClock() {
        if (kdsClockTimer != null) return;
        tickKdsClock();
        kdsClockTimer = setInterval(tickKdsClock, 1000);
    }
    function stopKdsClock() {
        if (kdsClockTimer != null) {
            clearInterval(kdsClockTimer);
            kdsClockTimer = null;
        }
    }
    startKdsClock();

    // --- Load Settings ---
    const savedSet = localStorage.getItem('restaurant_settings');
    if(savedSet) {
        const ds = JSON.parse(savedSet);
        if(ds.logo && document.getElementById('dyn-login-logo')) document.getElementById('dyn-login-logo').src = ds.logo;
        if(ds.name && document.getElementById('kds-rest-name')) document.getElementById('kds-rest-name').innerHTML = `<i class="ph-fill ph-fire"></i> شاشة مطبخ ${ds.name} (KDS)`;
    }

    // --- KDS Engine ---
    let orders = [];

    async function fetchOrders() {
        // ✅ Fetch from JSON database via IPC
        const allOrders = await ipcRenderer.invoke('db-get-orders') || [];

        // Only show orders from today that are not archived/done
        const todayStart = new Date();
        todayStart.setHours(0,0,0,0);

        orders = allOrders.filter(o => {
            const ts = o.timestamp || o.createdAt || 0;
            return ts >= todayStart.getTime();
        });

        // Assign manufacturingStatus to new orders that don't have it + persist back to DB
        let modified = false;
        const db = await window.dbRead();
        orders.forEach(o => {
            // Find matching order in db.orders
            const dbOrder = (db.orders || []).find(x => x.orderId === o.orderId);
            if(dbOrder && !dbOrder.manufacturingStatus) {
                dbOrder.manufacturingStatus = 'new';
                dbOrder.createdAt = dbOrder.timestamp || Date.now();
                modified = true;
            }
            // Reflect manufacturingStatus from DB into our local variable
            if(dbOrder) {
                o.manufacturingStatus = dbOrder.manufacturingStatus || 'new';
                o.createdAt = dbOrder.createdAt || dbOrder.timestamp || Date.now();
            } else {
                o.manufacturingStatus = o.manufacturingStatus || 'new';
                o.createdAt = o.timestamp || Date.now();
            }
        });

        if(modified) await saveDB(db);

        renderBoard();
    }

    // Handle Button Clicks - Update Kitchen Status in DB
    window.updateKDSStatus = async function(orderId, nextStatus) {
        const db = await window.dbRead();
        const dbOrder = (db.orders || []).find(o => o.orderId === orderId);
        
        if(dbOrder) {
            dbOrder.manufacturingStatus = nextStatus;
            
            // عند تفعيل «خصم تلقائي من المخزن عند البيع» في إعدادات المطبخ: تم خصم المستودع من نقطة البيع — لا نكرر التسليم التلقائي على مخزون المطبخ الداخلي
            let skipAutoHandover = false;
            try {
                const kp = JSON.parse(localStorage.getItem('manufacturing_prefs') || '{}');
                skipAutoHandover = kp.autoDeductOnSale === true;
            } catch (e) {}

            if (nextStatus === 'done' && !dbOrder.manufacturing_ordersHandoverCreated) {
                if (skipAutoHandover) {
                    dbOrder.manufacturing_ordersHandoverCreated = true;
                } else {
                    if (!db.manufacturing_orders) db.manufacturing_orders = [];
                    if (!db.manufacturing_stock) db.manufacturing_stock = [];

                    (dbOrder.items || []).forEach((item) => {
                        const itemName = item.name || item.nameAr || 'صنف غير معروف';
                        const qty = Number(item.qty) || 1;

                        const newTx = {
                            id: 'OUT-' + Math.floor(Math.random() * 100000),
                            type: 'handover',
                            itemName: itemName,
                            qty: qty,
                            notes: 'تسليم تلقائي - فاتورة مبيعات #' + dbOrder.orderId,
                            date: new Date().toISOString(),
                            user: 'KDS (آلي)'
                        };
                        db.manufacturing_orders.push(newTx);

                        const kIdx = db.manufacturing_stock.findIndex((k) => k.name === itemName);
                        if (kIdx !== -1) {
                            db.manufacturing_stock[kIdx].qty -= qty;
                        }
                    });

                    dbOrder.manufacturing_ordersHandoverCreated = true;
                }
            }
            
            await saveDB(db);
        }
        
        // Update local reference too
        const localOrder = orders.find(o => o.orderId === orderId);
        if(localOrder) localOrder.manufacturingStatus = nextStatus;
        
        // تأجيل إعادة التحميل لمنع الشاشة السوداء
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                renderBoard();
            });
        });
    };

    function renderBoard() {
        const colNew = document.getElementById('col-new');
        const colPrep = document.getElementById('col-prep');
        const colReady = document.getElementById('col-ready');
        if(!colNew) return;

        const colNewTickets = [];
        const colPrepTickets = [];
        const colReadyTickets = [];

        let countNew=0, countPrep=0, countReady=0;

        orders.forEach(o => {
            // Robust status detection
            let status = (o.manufacturingStatus || 'new').toString().toLowerCase();
            if (status === 'undefined' || status === 'null') status = 'new';

            // Skip completed or archived
            if (status === 'done' || status === 'archived') return;

            let targetTickets, actionHtml;
            
            // Map status to column and button
            if(status === 'prep') {
                targetTickets = colPrepTickets;
                countPrep++;
                actionHtml = `<button class="btn-kds-act to-ready" onclick="updateKDSStatus('${o.orderId}', 'ready')"><i class="ph-bold ph-check"></i> جاهز للاستلام</button>`;
            } else if(status === 'ready') {
                targetTickets = colReadyTickets;
                countReady++;
                actionHtml = `<button class="btn-kds-act to-done" onclick="updateKDSStatus('${o.orderId}', 'done')"><i class="ph-bold ph-check-circle"></i> تم التسليم للعميل/ويتر</button>`;
            } else {
                // ANY other status (new, pending, empty, etc.) goes to NEW column with the button
                targetTickets = colNewTickets;
                countNew++;
                actionHtml = `<button class="btn-kds-act to-prep" onclick="updateKDSStatus('${o.orderId}', 'prep')"><i class="ph-bold ph-fire"></i> استلام وبدء التحضير</button>`;
            }
            if(!targetTickets) return;

            const otype = (o.type && o.type.includes('سفري')) ? 'سفري' : 'محلي (صالة)';
            const elapsedMins = Math.floor((Date.now() - (o.createdAt || o.timestamp || Date.now())) / 60000);
            const timerWarn = elapsedMins > 15 ? 'warn' : '';

            let itemsHtml = '';
            if(Array.isArray(o.items) && o.items.length > 0) {
                o.items.forEach(i => {
                    itemsHtml += `
                        <div class="k-item">
                            <span class="k-item-name"><i class="ph-bold ph-caret-left" style="color:var(--text-muted); font-size:12px;"></i> ${i.name}</span>
                            <span class="k-qty">x${i.qty}</span>
                        </div>`;
                });
            } else {
                itemsHtml = `<p style="color:var(--text-muted); font-size:12px;">(تفاصيل الطلب غير متوفرة)</p>`;
            }

            targetTickets.push(`
                <div class="kds-ticket" id="ticket-${o.orderId}">
                    <div class="kds-ticket-head">
                        <span class="t-id"><i class="ph-fill ph-receipt text-blue"></i> ${o.orderId}</span>
                        <span class="t-type ${otype==='سفري'?'type-takeaway':'type-local'}">${otype}</span>
                    </div>
                    <div class="kds-ticket-meta">
                        <span><i class="ph ph-user"></i> كاشير رقم 1</span>
                        <span class="t-timer ${timerWarn}"><i class="ph-bold ph-clock"></i> ${elapsedMins} دقيقة</span>
                    </div>
                    <div class="kds-ticket-items">
                        ${itemsHtml}
                        ${o.note ? `<p class="kds-order-note"><i class="ph-fill ph-warning-circle"></i> ${o.note}</p>` : ''}
                    </div>
                    <div class="kds-ticket-action">${actionHtml}</div>
                </div>
            `);
        });

        colNew.innerHTML = colNewTickets.join('');
        colPrep.innerHTML = colPrepTickets.join('');
        colReady.innerHTML = colReadyTickets.join('');

        document.getElementById('count-new').innerText = countNew;
        document.getElementById('count-prep').innerText = countPrep;
        document.getElementById('count-ready').innerText = countReady;
        document.getElementById('kds-order-count').innerText = `${countNew+countPrep+countReady} طلبات قيد العمل`;

        if(countNew === 0) colNew.innerHTML = `<div class="kds-empty"><i class="ph-light ph-tray"></i><p>لا توجد طلبات جديدة</p></div>`;
        if(countPrep === 0) colPrep.innerHTML = `<div class="kds-empty"><i class="ph-light ph-cooking-pot"></i><p>لا توجد طلبات في التحضير</p></div>`;
        if(countReady === 0) colReady.innerHTML = `<div class="kds-empty"><i class="ph-light ph-bell-ringing"></i><p>لا توجد طلبات جاهزة</p></div>`;
    }

    if (typeof window.registerPosDatabaseRefresh === 'function') {
        window.registerPosDatabaseRefresh(() => {
            fetchOrders();
            console.log('[KDS] ⚡ New order received from network — refreshing...');
        });
    }

    // ✅ تحديث دوري — يتوقف أثناء إخفاء النافذة (توفير موارد على الأجهزة الضعيفة)
    let kdsPollTimer = null;
    function startKdsPolling() {
        if (kdsPollTimer != null) return;
        kdsPollTimer = setInterval(fetchOrders, 10000);
    }
    function stopKdsPolling() {
        if (kdsPollTimer != null) {
            clearInterval(kdsPollTimer);
            kdsPollTimer = null;
        }
    }
    document.addEventListener('visibilitychange', async () => {
        if (document.hidden) {
            stopKdsClock();
            stopKdsPolling();
        } else {
            startKdsClock();
            await fetchOrders();
            startKdsPolling();
        }
    });

    await fetchOrders();
    startKdsPolling();
});
