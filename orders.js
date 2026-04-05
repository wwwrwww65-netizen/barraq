const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', async () => {
    
    // Elements
    const grid = document.getElementById('orders-grid');
    const searchInput = document.getElementById('order-search');
    const typeFilter = document.getElementById('order-type-filter');
    const dateFilter = document.getElementById('order-date-filter');
    
    // State
    let allOrders = [];
    let returnedIds = new Set();
    let currentModalOrder = null;

    // Load Data
    async function loadData() {
        const db = await window.dbRead();
        
        // Orders: combine db.orders and anything else
        allOrders = db.orders || [];
        allOrders = allOrders.sort((a,b) => b.timestamp - a.timestamp); // newest first
        
        // Find returned items
        const returns = db.returns || [];
        returns.forEach(r => returnedIds.add(r.origId));

        renderOrders();
    }

    function renderOrders() {
        grid.innerHTML = '';
        
        const sq = searchInput.value.toLowerCase().trim();
        const fType = typeFilter.value;
        const fDate = dateFilter.value; // YYYY-MM-DD format

        let filtered = allOrders.filter(o => {
            // Search
            const nameSearch = o.customer ? o.customer.toLowerCase() : '';
            const matchSearch = String(o.orderId).toLowerCase().includes(sq) || 
                                nameSearch.includes(sq) ||
                                String(o.paymentMethod).toLowerCase().includes(sq);
            
            // Type
            const matchType = fType === 'all' || (o.type && String(o.type).includes(fType));
            
            // Date
            let matchDate = true;
            if(fDate) {
                // simple check for date part
                const d = new Date(o.timestamp || o.date);
                const ds = d.toISOString().split('T')[0];
                matchDate = ds === fDate;
            }

            return matchSearch && matchType && matchDate;
        });

        if(filtered.length === 0) {
            grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:50px; color:var(--text-muted)">
                <i class="ph ph-receipt" style="font-size:48px; opacity:0.5; margin-bottom:10px"></i>
                <p>لا توجد طلبات مسجلة أو مطابقة لبحثك</p>
            </div>`;
            return;
        }

        filtered.forEach(o => {
            const isReturned = returnedIds.has(o.orderId);
            const statusClass = isReturned ? 'returned' : 'done';
            const statusText = isReturned ? 'مسترجع' : 'مكتمل';
            
            // Items Preview
            let itemsHtml = '';
            if(o.items && Array.isArray(o.items)) {
                // limit to 4 pictures
                o.items.slice(0, 4).forEach(itm => {
                    const img = itm.image || 'placeholder.svg';
                    itemsHtml += `<img src="${img}" title="${itm.name} (x${itm.qty})" onerror="this.src='placeholder.svg'">`;
                });
                if(o.items.length > 4) {
                    itemsHtml += `<div style="width:40px;height:40px;border-radius:8px;background:rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center;font-size:12px;color:gray">+${o.items.length - 4}</div>`;
                }
            }
            
            // Time formatting
            let tStr = o.date || new Date(o.timestamp).toLocaleString('ar-SA');

            const card = document.createElement('div');
            card.className = `order-card`;
            card.innerHTML = `
                <div class="oc-header">
                    <span class="oc-id">${o.orderId}</span>
                    <span class="oc-status ${statusClass}">${statusText}</span>
                </div>
                <div class="oc-body" onclick="openOrderDetails('${o.orderId}')">
                    <p>المبلغ <span class="price">${Number(o.total).toFixed(2)} ر.س</span></p>
                    <p>تاريخ ووقت <span style="font-size:12px">${tStr}</span></p>
                    <p>نوع وحالة <span style="color:var(--accent-blue)">${o.type || 'عام'} - ${o.paymentMethod || 'كاش'}</span></p>
                    
                    <div class="oc-items">
                        ${itemsHtml}
                    </div>
                </div>
                <div class="oc-footer">
                    <button class="btn-card-return" ${isReturned ? 'disabled' : ''} onclick="gotoReturn('${o.orderId}')">
                        <i class="ph ph-arrow-u-down-left"></i> ${isReturned ? 'تم الإرجاع' : 'مرتجع / استرداد'}
                    </button>
                    <span style="font-size:12px;color:var(--text-muted)">بواسطة: ${o.emp || 'الكاشير'}</span>
                </div>
            `;
            grid.appendChild(card);
        });
    }

    // Modal Details Logic
    window.openOrderDetails = function(orderId) {
        const order = allOrders.find(o => o.orderId === orderId);
        if(!order) return;
        
        currentModalOrder = order;
        const modal = document.getElementById('orderDetailsModal');
        
        document.getElementById('mod-order-id').innerText = order.orderId;
        document.getElementById('mod-date').innerText = order.date || new Date(order.timestamp).toLocaleString('ar-SA');
        document.getElementById('mod-method').innerText = order.paymentMethod || 'غير محدد';
        document.getElementById('mod-cashier').innerText = order.emp || 'الكاشير الرئيسي';
        document.getElementById('mod-type').innerText = order.type || 'عام';
        
        let taxRate = 0.15;
        const sStr = localStorage.getItem('restaurant_settings');
        if(sStr){
            let sSet = JSON.parse(sStr);
            if(sSet.taxRate !== undefined) taxRate = parseFloat(sSet.taxRate)/100;
        }

        const taxAmt = order.total - (order.total / (1 + taxRate));
        document.getElementById('mod-tax').innerText = taxAmt.toFixed(2) + ' ر.س';
        document.getElementById('mod-total').innerText = Number(order.total).toFixed(2) + ' ر.س';
        
        // Loop items
        const listContainer = document.getElementById('mod-items-list');
        listContainer.innerHTML = '';
        if(order.items && Array.isArray(order.items)) {
            order.items.forEach(itm => {
                const tr = document.createElement('div');
                tr.className = 'om-item-row';
                const img = itm.image || 'placeholder.svg';
                tr.innerHTML = `
                    <img src="${img}" class="om-item-img" onerror="this.src='placeholder.svg'">
                    <div class="om-item-info">
                        <h4>${itm.name}</h4>
                        <p>الكمية: ${itm.qty} × ${Number(itm.price).toFixed(2)} ر.س</p>
                    </div>
                    <div class="om-item-price">
                        ${(itm.qty * itm.price).toFixed(2)} ر.س
                    </div>
                `;
                listContainer.appendChild(tr);
            });
        }

        // Return button state
        const btnRet = document.getElementById('btn-return-modal');
        if(returnedIds.has(order.orderId)) {
            btnRet.style.display = 'none';
        } else {
            btnRet.style.display = 'flex';
            btnRet.onclick = () => { gotoReturn(order.orderId); };
        }

        modal.style.display = 'flex';
    };

    window.closeOrderDetails = function() {
        const modal = document.getElementById('orderDetailsModal');
        modal.style.display = 'none';
        currentModalOrder = null;
    };

    window.gotoReturn = function(orderId) {
        window.location.href = 'returns.html?orderId=' + encodeURIComponent(orderId);
    };

    window.printOrder = function() {
        if(!currentModalOrder) return;
        alert('جاري تجهيز الفاتورة للطباعة برقم: ' + currentModalOrder.orderId);
        // Can integrate with electron print-to-pdf or window.print here specifically for older receipts
        // A simple window.print wrapper could work if setup dynamically
    };

    // Events
    searchInput.addEventListener('input', renderOrders);
    typeFilter.addEventListener('change', renderOrders);
    dateFilter.addEventListener('change', renderOrders);

    // Initial
    loadData();

    if (typeof window.registerPosDatabaseRefresh === 'function') {
        window.registerPosDatabaseRefresh(() => loadData());
    }
});
