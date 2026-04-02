const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const dbPath = require('electron').ipcRenderer.sendSync('get-db-path');

function loadDB() {
    try { return JSON.parse(fs.readFileSync(dbPath, 'utf8')); }
    catch(e) { return { orders:[], products:[], inventory:[], purchases:[], suppliers:[], inventoryTx:[], returns:[], expenses:[] }; }
}
function saveDB(db) {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    try { ipcRenderer.send('notify-db-changed'); } catch(e) {}
}

document.addEventListener('DOMContentLoaded', async () => {

    // --- Time Clock ---
    setInterval(() => {
        document.getElementById('kds-live-clock').innerText =
            new Date().toLocaleTimeString('en-US', {hour12:true, hour:'2-digit', minute:'2-digit', second:'2-digit'});
    }, 1000);

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

        // Assign kitchenStatus to new orders that don't have it + persist back to DB
        let modified = false;
        const db = loadDB();
        orders.forEach(o => {
            // Find matching order in db.orders
            const dbOrder = (db.orders || []).find(x => x.orderId === o.orderId);
            if(dbOrder && !dbOrder.kitchenStatus) {
                dbOrder.kitchenStatus = 'new';
                dbOrder.createdAt = dbOrder.timestamp || Date.now();
                modified = true;
            }
            // Reflect kitchenStatus from DB into our local variable
            if(dbOrder) {
                o.kitchenStatus = dbOrder.kitchenStatus || 'new';
                o.createdAt = dbOrder.createdAt || dbOrder.timestamp || Date.now();
            } else {
                o.kitchenStatus = o.kitchenStatus || 'new';
                o.createdAt = o.timestamp || Date.now();
            }
        });

        if(modified) saveDB(db);

        renderBoard();
    }

    // Handle Button Clicks - Update Kitchen Status in DB
    window.updateKDSStatus = function(orderId, nextStatus) {
        const db = loadDB();
        const dbOrder = (db.orders || []).find(o => o.orderId === orderId);
        
        if(dbOrder) {
            dbOrder.kitchenStatus = nextStatus;
            
            // Automatic Handover when completed
            if (nextStatus === 'done' && !dbOrder.kitchenTxHandoverCreated) {
                if (!db.kitchenTx) db.kitchenTx = [];
                if (!db.kitchenStock) db.kitchenStock = [];
                
                (dbOrder.items || []).forEach(item => {
                    const itemName = item.name || item.nameAr || "صنف غير معروف";
                    const qty = Number(item.qty) || 1;
                    
                    const newTx = {
                        id: 'OUT-' + Math.floor(Math.random() * 100000),
                        type: 'handover',
                        itemName: itemName,
                        qty: qty,
                        notes: "تسليم تلقائي - فاتورة مبيعات #" + dbOrder.orderId,
                        date: new Date().toISOString(),
                        user: "KDS (آلي)"
                    };
                    db.kitchenTx.push(newTx);
                    
                    // Deduct from internal kitchen stock tracker
                    const kIdx = db.kitchenStock.findIndex(k => k.name === itemName);
                    if (kIdx !== -1) {
                        db.kitchenStock[kIdx].qty -= qty;
                    }
                });
                
                dbOrder.kitchenTxHandoverCreated = true;
            }
            
            saveDB(db);
        }
        
        // Update local reference too
        const localOrder = orders.find(o => o.orderId === orderId);
        if(localOrder) localOrder.kitchenStatus = nextStatus;
        renderBoard();
    };

    function renderBoard() {
        const colNew = document.getElementById('col-new');
        const colPrep = document.getElementById('col-prep');
        const colReady = document.getElementById('col-ready');
        if(!colNew) return;

        colNew.innerHTML = '';
        colPrep.innerHTML = '';
        colReady.innerHTML = '';

        let countNew=0, countPrep=0, countReady=0;

        orders.forEach(o => {
            if(o.kitchenStatus === 'done' || o.kitchenStatus === 'archived') return;

            let colContainer, actionHtml;
            if(o.kitchenStatus === 'new') {
                colContainer = colNew; countNew++;
                actionHtml = `<button class="btn-kds-act to-prep" onclick="updateKDSStatus('${o.orderId}', 'prep')"><i class="ph-bold ph-fire"></i> استلام وبدء التحضير</button>`;
            } else if(o.kitchenStatus === 'prep') {
                colContainer = colPrep; countPrep++;
                actionHtml = `<button class="btn-kds-act to-ready" onclick="updateKDSStatus('${o.orderId}', 'ready')"><i class="ph-bold ph-check"></i> جاهز للاستلام</button>`;
            } else if(o.kitchenStatus === 'ready') {
                colContainer = colReady; countReady++;
                actionHtml = `<button class="btn-kds-act to-done" onclick="updateKDSStatus('${o.orderId}', 'done')"><i class="ph-bold ph-check-circle"></i> تم التسليم للعميل/ويتر</button>`;
            }
            if(!colContainer) return;

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

            colContainer.insertAdjacentHTML('beforeend', `
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
                        ${o.note ? `<p style="margin-top:10px; color:var(--accent-orange); font-size:12px; font-weight:bold; background:rgba(249,115,22,0.1); padding:5px; border-radius:4px;"><i class="ph-fill ph-warning-circle"></i> ${o.note}</p>` : ''}
                    </div>
                    <div class="kds-ticket-action">${actionHtml}</div>
                </div>
            `);
        });

        document.getElementById('count-new').innerText = countNew;
        document.getElementById('count-prep').innerText = countPrep;
        document.getElementById('count-ready').innerText = countReady;
        document.getElementById('kds-order-count').innerText = `${countNew+countPrep+countReady} طلبات قيد العمل`;

        if(countNew === 0) colNew.innerHTML = `<div class="kds-empty"><i class="ph-light ph-tray"></i><p>لا توجد طلبات جديدة</p></div>`;
        if(countPrep === 0) colPrep.innerHTML = `<div class="kds-empty"><i class="ph-light ph-cooking-pot"></i><p>لا توجد طلبات في التحضير</p></div>`;
        if(countReady === 0) colReady.innerHTML = `<div class="kds-empty"><i class="ph-light ph-bell-ringing"></i><p>لا توجد طلبات جاهزة</p></div>`;
    }

    // ✅ Immediate refresh when a peer broadcasts a new order
    window.addEventListener('pos-db-updated', () => {
        fetchOrders();
        console.log('[KDS] ⚡ New order received from network — refreshing...');
    });

    // ✅ Auto Refresh KDS every 10 seconds as backup
    await fetchOrders();
    setInterval(fetchOrders, 10000);
});
