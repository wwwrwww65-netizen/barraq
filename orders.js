const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', async () => {

    const xf = (n) => (window.MisterCasherCurrency ? MisterCasherCurrency.format(n) : Number(n).toFixed(2) + ' ر.س');
    
    // Elements
    const grid = document.getElementById('orders-grid');
    const searchInput = document.getElementById('order-search');
    const typeFilter = document.getElementById('order-type-filter');
    const periodFilter = document.getElementById('order-period-filter');
    const dateFilter = document.getElementById('order-date-filter');
    
    // State
    let allOrders = [];
    let returnedIds = new Set();
    let currentModalOrder = null;

    // Load Data
    async function loadData() {
        if (grid) {
            grid.innerHTML = Array(8).fill(`
                <div class="skeleton-card" style="height: 180px;">
                    <div class="skeleton-content">
                        <div class="skeleton-line medium" style="margin-bottom: 12px;"></div>
                        <div class="skeleton-line full" style="margin-bottom: 8px;"></div>
                        <div class="skeleton-line short" style="margin-bottom: 8px;"></div>
                        <div class="skeleton-line full" style="margin-bottom: 16px;"></div>
                        <div class="skeleton-line medium"></div>
                    </div>
                </div>
            `).join('');
        }
        const db = await window.dbReadSlice(['orders', 'returns']);
        allOrders = db.orders || [];
        allOrders = allOrders.sort((a, b) => b.timestamp - a.timestamp);
        const returns = db.returns || [];
        returnedIds = new Set();
        returns.forEach(r => {
            if (r && r.origId) returnedIds.add(r.origId);
            if (r && r.orderId) returnedIds.add(r.orderId);
        });
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
        const fPeriod = periodFilter ? periodFilter.value : 'all';
        const fDate = dateFilter.value;

        let filtered = allOrders.filter(o => {
            const nameSearch = o.customer ? o.customer.toLowerCase() : '';
            const matchSearch = String(o.orderId).toLowerCase().includes(sq) ||
                                nameSearch.includes(sq) ||
                                String(o.paymentMethod).toLowerCase().includes(sq);
            const matchType = fType === 'all' || (o.type && String(o.type).includes(fType));
            let matchDate = true;
            
            if (fPeriod !== 'all') {
                if (fPeriod === 'custom') {
                    if (fDate) {
                        const d  = new Date(o.timestamp || o.date);
                        const year = d.getFullYear();
                        const month = String(d.getMonth() + 1).padStart(2, '0');
                        const day = String(d.getDate()).padStart(2, '0');
                        const ds = `${year}-${month}-${day}`;
                        matchDate = ds === fDate;
                    }
                } else if (window.isDateInPeriod) {
                    matchDate = window.isDateInPeriod(o.timestamp || o.date, fPeriod);
                } else {
                    const d = new Date(o.timestamp || o.date);
                    const now = new Date();
                    if (fPeriod === 'today') {
                        matchDate = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                    }
                }
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
                    const img = itm.image || itm.imgSrc || 'placeholder.svg';
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
                    <div style="display:flex;gap:8px;align-items:center;">
                        <button class="btn-card-edit" onclick="editOrder('${o.orderId}')">
                            <i class="ph ph-pencil-simple"></i> تعديل
                        </button>
                        <button class="btn-card-return" ${isReturned ? 'disabled' : ''} onclick="gotoReturn('${o.orderId}')">
                            <i class="ph ph-arrow-u-down-left"></i> ${isReturned ? 'تم الإرجاع' : 'مرتجع / استرداد'}
                        </button>
                    </div>
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
                const img = itm.image || itm.imgSrc || 'placeholder.svg';
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

        window.openModalLayer(modal);
    };

    window.closeOrderDetails = function() {
        const modal = document.getElementById('orderDetailsModal');
        window.closeModalLayer(modal);
        currentModalOrder = null;
    };

    window.gotoReturn = function(orderId) {
        window.location.href = 'returns.html?orderId=' + encodeURIComponent(orderId);
    };

    window.editOrder = function(orderId) {
        const order = allOrders.find(o => String(o.orderId) === String(orderId));
        if (!order) {
            alert('لم يتم العثور على الطلب للتعديل.');
            return;
        }
        try {
            localStorage.setItem('pos_order_edit_draft', JSON.stringify({
                source: 'orders-history',
                orderId: order.orderId,
                type: order.type || 'محلي',
                paymentMethod: order.paymentMethod || 'كاش',
                items: Array.isArray(order.items) ? order.items : [],
                timestamp: order.timestamp || Date.now(),
                date: order.date,
                uuid: order.uuid,
                icv: order.icv,
                pih: order.pih,
                invoiceHash: order.invoiceHash
            }));
            window.location.href = 'pos.html?edit=1';
        } catch (e) {
            console.error('Failed to prepare order edit draft', e);
            alert('تعذر فتح الطلب للتعديل.');
        }
    };

    window.printOrder = async function() {
        if(!currentModalOrder) return;
        
        try {
            // Load thermal receipt module
            const thermalReceipt = require('./thermal-receipt-updated.js');
            const printCustomerReceipt = thermalReceipt.printCustomerReceipt;
            
            // Calculate totals
            const items = currentModalOrder.items || [];
            const subtotal = items.reduce((sum, item) => sum + ((item.qty || 0) * (item.price || 0)), 0);
            const discount = currentModalOrder.discount || 0;
            
            // Get tax rate from settings
            let taxRate = 0.15; // default 15%
            try {
                const s = JSON.parse(localStorage.getItem('restaurant_settings') || '{}');
                const rate = parseFloat(s.taxRate);
                taxRate = isNaN(rate) ? 0.15 : rate / 100;
            } catch(e) {}
            
            const taxAmount = (subtotal - discount) * taxRate;
            const total = currentModalOrder.total || (subtotal - discount + taxAmount);
            
            // Get payment method
            const paymentMethod = currentModalOrder.paymentMethod || 'نقدي';
            const paymentLabel = paymentMethod === 'cash' || paymentMethod === 'نقدي' ? 'نقدي (كاش)' : 
                                paymentMethod === 'card' || paymentMethod === 'شبكة' ? 'بطاقة (شبكة)' : paymentMethod;
            
            // Build items HTML
            let itemsHtml = '';
            items.forEach(item => {
                const itemTotal = (item.qty || 0) * (item.price || 0);
                itemsHtml += `
                    <tr style="border-bottom: 1px dashed #ddd;">
                        <td style="padding: 2mm 0; text-align: right; max-width: 35mm; word-wrap: break-word;">${item.name || ''}</td>
                        <td style="padding: 2mm 0; text-align: center; width: 12mm; font-weight: 700;">${item.qty || 0}</td>
                        <td style="padding: 2mm 0; text-align: left; width: 18mm; font-weight: 600;">${formatCurrency(itemTotal)}</td>
                    </tr>
                `;
            });
            
            // Build receipt snap
            const receiptSnap = {
                orderType: currentModalOrder.type || 'محلي',
                tableText: currentModalOrder.table ? 'لـ: ' + currentModalOrder.table : '',
                orderId: '#' + (currentModalOrder.orderId || ''),
                date: currentModalOrder.date || new Date(currentModalOrder.timestamp || Date.now()).toLocaleString('ar-SA'),
                itemsHtml: itemsHtml,
                subtotalText: formatCurrency(subtotal),
                totalText: formatCurrency(total),
                discountText: discount > 0 ? formatCurrency(discount) : formatCurrency(0),
                taxLabel: `قيمة الضريبة المضافة ${Math.round(taxRate * 100 * 100) / 100}%:`,
                taxText: formatCurrency(taxAmount),
                paymentText: paymentLabel,
                qrSrc: '',
                notesText: currentModalOrder.notes || ''
            };
            
            console.log('🖨️  Reprinting thermal receipt for order:', currentModalOrder.orderId);
            
            // Print using the same function as POS
            await printCustomerReceipt(receiptSnap);
            
        } catch(e) {
            console.error('❌ Reprint failed:', e);
            alert('حدث خطأ أثناء إعادة الطباعة: ' + e.message);
        }
    };
    
    // Helper function to format currency
    function formatCurrency(amount) {
        if (window.MisterCasherCurrency) {
            return MisterCasherCurrency.format(amount || 0);
        }
        return Number(amount || 0).toLocaleString('en-US', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        }) + ' ر.س';
    }

    // Events — debounce 300ms على البحث، reset page عند تغيير الفلتر
    let _ordersSearchTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(_ordersSearchTimer);
        _ordersSearchTimer = setTimeout(() => { currentPage = 1; renderOrders(); }, 300);
    });
    typeFilter.addEventListener('change', () => { currentPage = 1; renderOrders(); });
    if (periodFilter) {
        periodFilter.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                dateFilter.style.display = 'inline-block';
            } else {
                dateFilter.style.display = 'none';
            }
            currentPage = 1; renderOrders();
        });
    }
    dateFilter.addEventListener('change', () => { currentPage = 1; renderOrders(); });

    // Initial
    loadData();

    if (typeof window.registerPosDatabaseRefresh === 'function') {
        window.registerPosDatabaseRefresh(() => loadData());
    }
});
