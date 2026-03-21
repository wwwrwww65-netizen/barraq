document.addEventListener('DOMContentLoaded', () => {

    // --- Time Clock ---
    setInterval(() => {
        const d = new Date();
        document.getElementById('kds-live-clock').innerText = d.toLocaleTimeString('en-US', {hour12:true, hour:'2-digit', minute:'2-digit', second:'2-digit'});
    }, 1000);

    // --- Load Settings ---
    const savedSet = localStorage.getItem('restaurant_settings');
    if(savedSet) {
        const ds = JSON.parse(savedSet);
        if(ds.logo) document.getElementById('dyn-login-logo').src = ds.logo;
        if(ds.name) document.getElementById('kds-rest-name').innerHTML = `<i class="ph-fill ph-fire"></i> شاشة مطبخ ${ds.name} (KDS)`;
    }

    // --- KDS Engine ---
    let orders = [];

    function fetchOrders() {
        const str = localStorage.getItem('pos_orders');
        orders = str ? JSON.parse(str) : [];

        // Migrate Old Orders to have a Kitchen Status and a Date.now() timestamp if missing
        let modified = false;
        orders.forEach(o => {
            if(!o.kitchenStatus) {
                o.kitchenStatus = 'new';
                o.createdAt = Date.now();
                modified = true;
            }
            // Some existing mock POS orders don't have createdAt
            if(!o.createdAt) { o.createdAt = Date.now() - (Math.random() * 600000); modified = true; } // Random 1-10 mins ago
        });
        if(modified) localStorage.setItem('pos_orders', JSON.stringify(orders));
        
        renderBoard();
    }

    // Handle Button Clicks
    window.updateKDSStatus = function(orderId, nextStatus) {
        const idx = orders.findIndex(o => o.orderId === orderId);
        if(idx > -1) {
            orders[idx].kitchenStatus = nextStatus;
            
            // If going from ready -> done (Delivered to customer), we don't delete from pos_orders, we just mark as "done" so it hides from KDS
            localStorage.setItem('pos_orders', JSON.stringify(orders));
            renderBoard();
        }
    }

    function renderBoard() {
        const colNew = document.getElementById('col-new');
        const colPrep = document.getElementById('col-prep');
        const colReady = document.getElementById('col-ready');

        // Clear contents
        colNew.innerHTML = '';
        colPrep.innerHTML = '';
        colReady.innerHTML = '';

        let countNew=0, countPrep=0, countReady=0;

        orders.forEach(o => {
            if(o.kitchenStatus === 'done' || o.kitchenStatus === 'archived') return; // Skip closed orders from showing in KDS

            let colContainer, badgeClass, actionHtml;

            if(o.kitchenStatus === 'new') {
                colContainer = colNew; countNew++; badgeClass = 'type-local';
                actionHtml = `<button class="btn-kds-act to-prep" onclick="updateKDSStatus('${o.orderId}', 'prep')"><i class="ph-bold ph-fire"></i> استلام وبدء التحضير</button>`;
            } else if(o.kitchenStatus === 'prep') {
                colContainer = colPrep; countPrep++; badgeClass = 'type-takeaway'; // Or another generic one
                actionHtml = `<button class="btn-kds-act to-ready" onclick="updateKDSStatus('${o.orderId}', 'ready')"><i class="ph-bold ph-check"></i> جاهز للاستلام</button>`;
            } else if(o.kitchenStatus === 'ready') {
                colContainer = colReady; countReady++; badgeClass = 'type-takeaway';
                actionHtml = `<button class="btn-kds-act to-done" onclick="updateKDSStatus('${o.orderId}', 'done')"><i class="ph-bold ph-check-circle"></i> تم التسليم للعميل/ويتر</button>`;
            }

            // Type string
            const otype = (o.type && o.type.includes('سفري')) ? 'سفري' : 'محلي (صالة)';

            // Items List
            let itemsHtml = '';
            if(o.items && o.items.length > 0) {
                o.items.forEach(i => {
                    itemsHtml += `
                        <div class="k-item">
                            <span class="k-item-name"><i class="ph-bold ph-caret-left" style="color:var(--text-muted); font-size:12px;"></i> ${i.name}</span>
                            <span class="k-qty">x${i.qty}</span>
                        </div>
                    `;
                });
            } else {
                itemsHtml = `<p style="color:var(--text-muted); font-size:12px;">(تفاصيل الطلب غير متوفرة)</p>`;
            }

            // Elapsed time
            const elapsedMins = Math.floor((Date.now() - o.createdAt) / 60000);
            const timerWarn = elapsedMins > 15 ? 'warn' : '';

            // Card HTML
            const card = `
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
                        ${o.note ? `<p style="margin-top:10px; color:var(--accent-orange); font-size:12px; font-weight:bold; background:rgba(249, 115, 22, 0.1); padding:5px; border-radius:4px;"><i class="ph-fill ph-warning-circle"></i> ${o.note}</p>` : ''}
                    </div>
                    <div class="kds-ticket-action">
                        ${actionHtml}
                    </div>
                </div>
            `;
            colContainer.insertAdjacentHTML('beforeend', card);
        });

        // Set counters
        document.getElementById('count-new').innerText = countNew;
        document.getElementById('count-prep').innerText = countPrep;
        document.getElementById('count-ready').innerText = countReady;
        
        let totalActive = countNew + countPrep + countReady;
        document.getElementById('kds-order-count').innerText = `${totalActive} طلبات قيد العمل`;

        // Apply Empty States
        if(countNew === 0) colNew.innerHTML = `<div class="kds-empty"><i class="ph-light ph-tray"></i><p>لا توجد طلبات جديدة</p></div>`;
        if(countPrep === 0) colPrep.innerHTML = `<div class="kds-empty"><i class="ph-light ph-cooking-pot"></i><p>لا توجد طلبات في التحضير</p></div>`;
        if(countReady === 0) colReady.innerHTML = `<div class="kds-empty"><i class="ph-light ph-bell-ringing"></i><p>لا توجد طلبات جاهزة</p></div>`;
    }

    // Auto Refresh KDS every 5 seconds to catch new POS orders from other windows
    fetchOrders();
    setInterval(fetchOrders, 5000);
});
