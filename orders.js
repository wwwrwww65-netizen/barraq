const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', async () => {

    const xf = (n) => (window.HashCurrency ? HashCurrency.format(n) : Number(n).toFixed(2) + ' ر.س');
    
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
        allOrders = db.orders || [];
        allOrders = allOrders.sort((a, b) => b.timestamp - a.timestamp);
        const returns = db.returns || [];
        returns.forEach(r => returnedIds.add(r.origId));
        currentPage = 1;  // إعادة لأول صفحة
        renderOrders();
    }

    // ── Pagination State ──────────────────────────────────────────
    const PAGE_SIZE = 20;
    let currentPage = 1;

    function renderOrders() {
        grid.innerHTML = '';

        const sq    = searchInput.value.toLowerCase().trim();
        const fType = typeFilter.value;
        const fDate = dateFilter.value;

        let filtered = allOrders.filter(o => {
            const nameSearch = o.customer ? o.customer.toLowerCase() : '';
            const matchSearch = String(o.orderId).toLowerCase().includes(sq) ||
                                nameSearch.includes(sq) ||
                                String(o.paymentMethod).toLowerCase().includes(sq);
            const matchType = fType === 'all' || (o.type && String(o.type).includes(fType));
            let matchDate = true;
            if (fDate) {
                const d  = new Date(o.timestamp || o.date);
                const ds = d.toISOString().split('T')[0];
                matchDate = ds === fDate;
            }
            return matchSearch && matchType && matchDate;
        });

        const total = filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        if (currentPage > totalPages) currentPage = totalPages;

        const start   = (currentPage - 1) * PAGE_SIZE;
        const pageItems = filtered.slice(start, start + PAGE_SIZE);

        if (total === 0) {
            grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;color:var(--text-muted)">
                <i class="ph ph-receipt" style="font-size:48px;opacity:0.5;margin-bottom:10px"></i>
                <p>لا توجد طلبات مسجلة أو مطابقة لبحثك</p>
            </div>`;
            _renderPagination(0, 0, 0);
            return;
        }

        const fragment = document.createDocumentFragment();
        pageItems.forEach(o => {
            const isReturned  = returnedIds.has(o.orderId);
            const statusClass = isReturned ? 'returned' : 'done';
            const statusText  = isReturned ? 'مسترجع' : 'مكتمل';

            let itemsHtml = '';
            if (o.items && Array.isArray(o.items)) {
                o.items.slice(0, 4).forEach(itm => {
                    const img = itm.image || 'placeholder.svg';
                    itemsHtml += `<img src="${img}" title="${itm.name} (x${itm.qty})" onerror="this.src='placeholder.svg'">`;
                });
                if (o.items.length > 4)
                    itemsHtml += `<div style="width:40px;height:40px;border-radius:8px;background:rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center;font-size:12px;color:gray">+${o.items.length - 4}</div>`;
            }

            const tStr = o.date || new Date(o.timestamp).toLocaleString('ar-SA');
            const card = document.createElement('div');
            card.className = 'order-card';
            card.innerHTML = `
                <div class="oc-header">
                    <span class="oc-id">${o.orderId}</span>
                    <span class="oc-status ${statusClass}">${statusText}</span>
                </div>
                <div class="oc-body" onclick="openOrderDetails('${o.orderId}')">
                    <p>المبلغ <span class="price">${xf(o.total)}</span></p>
                    <p>تاريخ ووقت <span style="font-size:12px">${tStr}</span></p>
                    <p>نوع وحالة <span style="color:var(--accent-blue)">${o.type || 'عام'} - ${o.paymentMethod || 'كاش'}</span></p>
                    <div class="oc-items">${itemsHtml}</div>
                </div>
                <div class="oc-footer">
                    <button class="btn-card-return" ${isReturned ? 'disabled' : ''} onclick="gotoReturn('${o.orderId}')">
                        <i class="ph ph-arrow-u-down-left"></i> ${isReturned ? 'تم الإرجاع' : 'مرتجع / استرداد'}
                    </button>
                    <span style="font-size:12px;color:var(--text-muted)">بواسطة: ${o.emp || 'الكاشير'}</span>
                </div>
            `;
            fragment.appendChild(card);
        });
        grid.appendChild(fragment);
        _renderPagination(currentPage, totalPages, total);
    }

    /** يرسم شريط Pagination تحت الشبكة */
    function _renderPagination(page, totalPages, total) {
        let bar = document.getElementById('orders-pagination-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'orders-pagination-bar';
            bar.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;padding:20px 0;flex-wrap:wrap;';
            grid.parentElement.appendChild(bar);
        }
        if (totalPages <= 1) { bar.innerHTML = ''; return; }

        const start = (page - 1) * PAGE_SIZE + 1;
        const end   = Math.min(page * PAGE_SIZE, total);
        const btnStyle = (active) => `
            background:${active ? 'var(--accent-blue)' : 'var(--bg-card)'};
            color:${active ? '#fff' : 'var(--text-secondary)'};
            border:1px solid ${active ? 'var(--accent-blue)' : 'var(--border-color)'};
            border-radius:8px; padding:6px 14px; cursor:pointer;
            font-family:inherit; font-weight:700; font-size:13px;
            transition:background-color 0.15s ease, color 0.15s ease;
        `;

        let html = `<span style="color:var(--text-muted);font-size:13px;margin-left:8px">صفحة ${page}/${totalPages} (تسجيل ${start}–${end} من ${total})</span>`;
        html += `<button style="${btnStyle(false)}" id="pg-first" ${page===1?'disabled':''}>&#171;</button>`;
        html += `<button style="${btnStyle(false)}" id="pg-prev"  ${page===1?'disabled':''}>‹</button>`;

        const range = 2;
        for (let i = Math.max(1, page - range); i <= Math.min(totalPages, page + range); i++)
            html += `<button style="${btnStyle(i===page)}" class="pg-num" data-p="${i}">${i}</button>`;

        html += `<button style="${btnStyle(false)}" id="pg-next" ${page===totalPages?'disabled':''}>›</button>`;
        html += `<button style="${btnStyle(false)}" id="pg-last" ${page===totalPages?'disabled':''}>&#187;</button>`;

        bar.innerHTML = html;
        bar.querySelector('#pg-first')?.addEventListener('click', () => { currentPage = 1; renderOrders(); });
        bar.querySelector('#pg-prev' )?.addEventListener('click', () => { currentPage--; renderOrders(); });
        bar.querySelector('#pg-next' )?.addEventListener('click', () => { currentPage++; renderOrders(); });
        bar.querySelector('#pg-last' )?.addEventListener('click', () => { currentPage = totalPages; renderOrders(); });
        bar.querySelectorAll('.pg-num').forEach(b =>
            b.addEventListener('click', () => { currentPage = Number(b.dataset.p); renderOrders(); })
        );
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
        document.getElementById('mod-tax').innerText = xf(taxAmt);
        document.getElementById('mod-total').innerText = xf(order.total);
        
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
                        <p>الكمية: ${itm.qty} × ${xf(itm.price)}</p>
                    </div>
                    <div class="om-item-price">
                        ${xf(itm.qty * itm.price)}
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

    // Events — debounce 300ms على البحث، reset page عند تغيير الفلتر
    let _ordersSearchTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(_ordersSearchTimer);
        _ordersSearchTimer = setTimeout(() => { currentPage = 1; renderOrders(); }, 300);
    });
    typeFilter.addEventListener('change', () => { currentPage = 1; renderOrders(); });
    dateFilter.addEventListener('change', () => { currentPage = 1; renderOrders(); });

    // Initial
    loadData();

    if (typeof window.registerPosDatabaseRefresh === 'function') {
        window.registerPosDatabaseRefresh(() => loadData());
    }
});
