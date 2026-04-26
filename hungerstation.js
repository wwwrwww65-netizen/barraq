document.addEventListener('DOMContentLoaded', async () => {
    const { ipcRenderer } = require('electron');
    
    // State
    let hsOrders = [];
    let currentFilter = 'all';
    let currentDateFilter = 'all'; // all, today, week, month, custom

    // Format currency
    const formatCurrency = (amount) =>
        window.HashCurrency ? HashCurrency.format(amount) : Number(amount).toFixed(2) + ' ر.س';

    // Load data
    async function loadData() {
        try {
            const dbData = await window.dbRead();
            hsOrders = (dbData.orders || []).filter(o => o.hungerStation === true || o.orderType === 'هنقرستيشن');
            renderDashboard();
            renderOrders();
        } catch(e) {
            console.error('Failed to load HungerStation data:', e);
        }
    }

    // Date filtering
    function filterByDate(orders) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        if (currentDateFilter === 'all') return orders;
        
        return orders.filter(order => {
            const orderDate = new Date(order.timestamp || 0);
            
            if (currentDateFilter === 'today') {
                return orderDate >= today;
            } else if (currentDateFilter === 'week') {
                const weekAgo = new Date(today);
                weekAgo.setDate(weekAgo.getDate() - 7);
                return orderDate >= weekAgo;
            } else if (currentDateFilter === 'month') {
                const monthAgo = new Date(today);
                monthAgo.setMonth(monthAgo.getMonth() - 1);
                return orderDate >= monthAgo;
            }
            return true;
        });
    }

    // Render dashboard KPIs
    function renderDashboard() {
        const filteredOrders = filterByDate(hsOrders);
        
        const totalOrders = filteredOrders.length;
        const totalSales = filteredOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
        const deliveredOrders = filteredOrders.filter(o => o.hsStatus === 'delivered').length;
        const paidOrders = filteredOrders.filter(o => o.hsPaymentStatus === 'paid');
        const unpaidOrders = filteredOrders.filter(o => o.hsPaymentStatus !== 'paid');
        
        const totalPaid = paidOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
        const totalUnpaid = unpaidOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

        document.getElementById('hs-total-orders').textContent = totalOrders;
        const salesEl = document.getElementById('hs-total-sales');
        if (salesEl) salesEl.innerHTML = formatCurrency(totalSales);
        document.getElementById('hs-total-paid').innerHTML = formatCurrency(totalPaid);
        document.getElementById('hs-total-unpaid').innerHTML = formatCurrency(totalUnpaid);
        document.getElementById('hs-delivered-orders').textContent = deliveredOrders;
        document.getElementById('hs-pending-payment').textContent = unpaidOrders.length;
    }

    // Render orders table
    function renderOrders() {
        const tbody = document.getElementById('hs-orders-table');
        const filteredOrders = filterByDate(hsOrders);
        
        let filtered = filteredOrders;
        
        // Apply payment filter - ONLY for paid/unpaid, not for 'all'
        if (currentFilter === 'paid') {
            filtered = filteredOrders.filter(o => o.hsPaymentStatus === 'paid');
        } else if (currentFilter === 'unpaid') {
            filtered = filteredOrders.filter(o => o.hsPaymentStatus !== 'paid');
        }
        // For 'all', show everything (no filter)

        // Apply search
        const searchInput = document.getElementById('hs-search-input');
        const searchTerm = (searchInput ? searchInput.value : '').toLowerCase();
        if (searchTerm) {
            filtered = filtered.filter(o => 
                (o.orderId || '').toLowerCase().includes(searchTerm) ||
                (o.customerName || '').toLowerCase().includes(searchTerm)
            );
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="hs-empty">
                        <i class="ph ph-motorcycle"></i>
                        <p>لا توجد طلبات</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filtered.map(order => {
            const itemsCount = order.items ? order.items.length : 0;
            const statusClass = order.hsStatus || 'delivered';
            const statusText = 'مكتمل';
            const paymentClass = order.hsPaymentStatus || 'unpaid';
            const paymentText = paymentClass === 'paid' ? 'مدفوع' : 'غير مدفوع';

            return `
                <tr>
                    <td><strong>${order.orderId || '-'}</strong></td>
                    <td>${order.date || '-'}</td>
                    <td>${order.customerName || 'هنقرستيشن'}</td>
                    <td>${itemsCount} أصناف</td>
                    <td><strong>${formatCurrency(order.total || 0)}</strong></td>
                    <td><span class="hs-status ${statusClass}">${statusText}</span></td>
                    <td><span class="hs-status ${paymentClass}">${paymentText}</span></td>
                    <td>
                        <button onclick="viewOrder('${order.orderId}')" style="background:none;border:none;cursor:pointer;color:var(--text-primary);font-size:18px;margin-left:8px;" title="عرض">
                            <i class="ph ph-eye"></i>
                        </button>
                        ${paymentClass !== 'paid' ? `
                            <button onclick="markAsPaid('${order.orderId}')" style="background:none;border:none;cursor:pointer;color:#10b981;font-size:18px;" title="تحديد كمدفوع">
                                <i class="ph ph-check-circle"></i>
                            </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }).join('');

        // Populate tfoot with summary rows (print/PDF friendly — no big cards)
        const tfoot = document.getElementById('hs-orders-tfoot');
        if (tfoot) {
            const totalAmt  = filtered.reduce((s, o) => s + (Number(o.total) || 0), 0);
            const paidAmt   = filtered.filter(o => o.hsPaymentStatus === 'paid').reduce((s, o) => s + (Number(o.total) || 0), 0);
            const unpaidAmt = filtered.filter(o => o.hsPaymentStatus !== 'paid').reduce((s, o) => s + (Number(o.total) || 0), 0);
            const paidCount   = filtered.filter(o => o.hsPaymentStatus === 'paid').length;
            const unpaidCount = filtered.filter(o => o.hsPaymentStatus !== 'paid').length;
            const sym = window.HashCurrency ? HashCurrency.getConfig().symbol : 'ر.س';

            tfoot.innerHTML = `
                <tr style="background:rgba(255,107,0,0.07); font-weight:700; border-top:3px solid #ff6b00;">
                    <td colspan="3" style="padding:12px 14px; font-size:13px; border-top:3px solid #94a3b8;">
                        ◼ إجمالي الطلبات: <strong>${filtered.length} طلب</strong>
                    </td>
                    <td style="padding:12px 14px; border-top:3px solid #94a3b8;"></td>
                    <td style="padding:12px 14px; font-size:15px; font-weight:800; border-top:3px solid #94a3b8;">
                        ${totalAmt.toFixed(2)} ${sym}
                    </td>
                    <td colspan="3" style="padding:12px 14px; font-size:12px; border-top:3px solid #94a3b8;">الإجمالي الكلي</td>
                </tr>
                <tr style="background:rgba(16,185,129,0.06);">
                    <td colspan="3" style="padding:9px 14px; font-size:13px;">
                        ✓ المدفوع: <strong>${paidCount} طلب</strong>
                    </td>
                    <td style="padding:9px 14px;"></td>
                    <td style="padding:9px 14px; font-size:14px; font-weight:800;">
                        ${paidAmt.toFixed(2)} ${sym}
                    </td>
                    <td colspan="3" style="padding:9px 14px; font-size:12px;">تم الاستلام</td>
                </tr>
                <tr style="background:rgba(239,68,68,0.06);">
                    <td colspan="3" style="padding:9px 14px; font-size:13px;">
                        ✗ غير المدفوع: <strong>${unpaidCount} طلب</strong>
                    </td>
                    <td style="padding:9px 14px;"></td>
                    <td style="padding:9px 14px; font-size:14px; font-weight:800;">
                        ${unpaidAmt.toFixed(2)} ${sym}
                    </td>
                    <td colspan="3" style="padding:9px 14px; font-size:12px;">متبقية - لم تُدفع بعد</td>
                </tr>
            `;
        }
    }

    // View order details
    window.viewOrder = function(orderId) {
        const order = hsOrders.find(o => o.orderId === orderId);
        if (!order) return;

        let itemsHtml = '';
        if (order.items) {
            itemsHtml = order.items.map(item => `
                <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-color);">
                    <span>${item.name} × ${item.qty}</span>
                    <strong>${formatCurrency(item.price * item.qty)}</strong>
                </div>
            `).join('');
        }

        const modal = document.createElement('div');
        modal.className = 'hs-modal active';
        modal.innerHTML = `
            <div class="hs-modal-content">
                <div class="hs-modal-header">
                    <h2><i class="ph ph-receipt"></i> تفاصيل الطلب ${order.orderId}</h2>
                    <button class="close-modal" onclick="this.closest('.hs-modal').remove()">
                        <i class="ph ph-x"></i>
                    </button>
                </div>
                <div class="hs-modal-body">
                    <div style="margin-bottom:16px;">
                        <strong>التاريخ:</strong> ${order.date || '-'}<br>
                        <strong>العميل:</strong> ${order.customerName || 'هنقرستيشن'}<br>
                        <strong>الحالة:</strong> مكتمل<br>
                        <strong>الدفع:</strong> ${order.hsPaymentStatus === 'paid' ? 'مدفوع' : 'غير مدفوع'}
                    </div>
                    <div style="background:var(--bg-dark);padding:16px;border-radius:8px;margin-bottom:16px;">
                        <strong>الأصناف:</strong>
                        ${itemsHtml}
                    </div>
                    <div style="text-align:left;font-size:20px;font-weight:800;">
                        الإجمالي: ${formatCurrency(order.total || 0)}
                    </div>
                </div>
                <div class="hs-modal-footer">
                    <button class="hs-action-btn secondary" onclick="this.closest('.hs-modal').remove()">إغلاق</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    };

    // Mark order as paid - Open modal to select payment method
    window.markAsPaid = function(orderId) {
        const order = hsOrders.find(o => o.orderId === orderId);
        if (!order) return;

        const modal = document.createElement('div');
        modal.className = 'hs-modal active';
        modal.id = 'payment-modal-' + orderId;
        modal.innerHTML = `
            <div class="hs-modal-content" style="width: 500px;">
                <div class="hs-modal-header">
                    <h2><i class="ph ph-money"></i> استلام مبلغ - ${order.orderId}</h2>
                    <button class="close-modal" onclick="this.closest('.hs-modal').remove()">
                        <i class="ph ph-x"></i>
                    </button>
                </div>
                <div class="hs-modal-body">
                    <div style="background: linear-gradient(135deg, rgba(255,107,0,0.1), rgba(255,133,51,0.1)); padding: 16px; border-radius: 12px; margin-bottom: 20px; border: 1px solid #ff6b00;">
                        <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">المبلغ الإجمالي للطلب:</div>
                        <div style="font-size: 32px; font-weight: 800; color: #ff6b00;">${formatCurrency(order.total || 0)}</div>
                    </div>
                    
                    <div class="hs-form-group">
                        <label>طريقة الدفع:</label>
                        <div style="display: flex; gap: 10px; margin-top: 8px;">
                            <label class="payment-method-hs selected" style="flex:1; padding: 15px; border: 2px solid #ff6b00; border-radius: 8px; cursor: pointer; background: rgba(255,107,0,0.1); text-align: center;">
                                <input type="radio" name="hs_pay_method_${orderId}" value="كاش" checked style="display:none;">
                                <i class="ph ph-money" style="font-size: 32px; color: #ff6b00; display: block; margin-bottom: 8px;"></i>
                                <strong>كاش</strong>
                            </label>
                            <label class="payment-method-hs" style="flex:1; padding: 15px; border: 2px solid var(--border-color); border-radius: 8px; cursor: pointer; background: var(--bg-dark); text-align: center;">
                                <input type="radio" name="hs_pay_method_${orderId}" value="شبكة" style="display:none;">
                                <i class="ph ph-credit-card" style="font-size: 32px; color: var(--text-muted); display: block; margin-bottom: 8px;"></i>
                                <strong style="color: var(--text-muted)">شبكة</strong>
                            </label>
                            <label class="payment-method-hs" style="flex:1; padding: 15px; border: 2px solid var(--border-color); border-radius: 8px; cursor: pointer; background: var(--bg-dark); text-align: center;">
                                <input type="radio" name="hs_pay_method_${orderId}" value="تحويل بنكي" style="display:none;">
                                <i class="ph ph-bank" style="font-size: 32px; color: var(--text-muted); display: block; margin-bottom: 8px;"></i>
                                <strong style="color: var(--text-muted)">تحويل بنكي</strong>
                            </label>
                        </div>
                    </div>
                    
                    <div class="hs-form-group">
                        <label>ملاحظات (اختياري):</label>
                        <input type="text" id="hs-payment-notes-${orderId}" placeholder="رقم التحويل، اسم البنك...">
                    </div>
                    
                    <div style="background: var(--bg-dark); padding: 12px; border-radius: 8px; margin-top: 16px; border-right: 3px solid #ff6b00;">
                        <strong style="color: #ff6b00;"><i class="ph ph-receipt"></i> سيتم إنشاء سند قبض</strong>
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">يُسجل المبلغ كـ "سند قبض" في النظام المحاسبي</div>
                    </div>
                </div>
                <div class="hs-modal-footer">
                    <button class="hs-action-btn secondary" onclick="this.closest('.hs-modal').remove()">إلغاء</button>
                    <button class="hs-action-btn primary" onclick="confirmOrderPayment('${orderId}')">
                        <i class="ph ph-check-circle"></i>
                        تأكيد استلام المبلغ
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Add event listeners for payment method selection
        modal.querySelectorAll('.payment-method-hs').forEach(label => {
            label.addEventListener('click', () => {
                modal.querySelectorAll('.payment-method-hs').forEach(l => {
                    l.classList.remove('selected');
                    l.style.borderColor = 'var(--border-color)';
                    l.style.background = 'var(--bg-dark)';
                    l.querySelector('i').style.color = 'var(--text-muted)';
                    l.querySelector('strong').style.color = 'var(--text-muted)';
                });
                label.classList.add('selected');
                label.style.borderColor = '#ff6b00';
                label.style.background = 'rgba(255,107,0,0.1)';
                label.querySelector('i').style.color = '#ff6b00';
                label.querySelector('strong').style.color = '#ff6b00';
            });
        });
    };

    // Confirm payment for single order
    window.confirmOrderPayment = async function(orderId) {
        const modal = document.getElementById('payment-modal-' + orderId);
        const selectedMethod = modal.querySelector('input[type="radio"]:checked').value;
        const notes = document.getElementById('hs-payment-notes-' + orderId).value || '';

        try {
            const dbData = await window.dbRead();
            const orderIndex = dbData.orders.findIndex(o => o.orderId === orderId);
            
            if (orderIndex === -1) {
                alert('لم يتم العثور على الطلب');
                return;
            }

            const order = dbData.orders[orderIndex];
            const now = new Date();

            // Update order
            dbData.orders[orderIndex].hsPaymentStatus = 'paid';
            dbData.orders[orderIndex].hsPaidDate = now.toLocaleString('ar-u-nu-latn');
            dbData.orders[orderIndex].hsPaymentMethod = selectedMethod;
            
            // Create receipt voucher (سند قبض)
            if (!dbData.receipt_vouchers) dbData.receipt_vouchers = [];
            
            const newVoucher = {
                id: 'RV-HS-' + Date.now(),
                type: 'سند قبض',
                amount: order.total,
                from: 'هنقرستيشن',
                orderId: orderId,
                paymentMethod: selectedMethod,
                notes: notes || `استلام مبلغ طلب ${orderId}`,
                date: now.toLocaleString('ar-u-nu-latn'),
                timestamp: now.getTime(),
                // Mark that this affects drawer balance
                receivedInDrawer: selectedMethod === 'كاش' || selectedMethod === 'cash'
            };
            dbData.receipt_vouchers.push(newVoucher);
            
            // Update drawer balance if payment was cash
            if (selectedMethod === 'كاش' || selectedMethod === 'cash') {
                const currentFloat = parseFloat(localStorage.getItem('shift_cash_float')) || 0;
                localStorage.setItem('shift_cash_float', currentFloat + order.total);
            }
            
            await window.dbWrite(dbData);
            modal.remove();
            loadData();
            
            showNotification(`تم استلام ${formatCurrency(order.total)} - تم إنشاء سند قبض`, 'success');
            
            setTimeout(() => {
                if (typeof generateAndDownloadVoucher === 'function') {
                    generateAndDownloadVoucher(newVoucher);
                }
            }, 500);
        } catch(e) {
            console.error('Failed to confirm payment:', e);
            alert('حدث خطأ أثناء تحديث الحالة');
        }
    };

    // Export to PDF - uses system's built-in PDF engine
    window.exportHSPDF = function() {
        let restName = "هنقرستيشن";
        try {
            const sysRaw = localStorage.getItem('restaurant_settings');
            if (sysRaw) {
                const sys = JSON.parse(sysRaw);
                if (sys.name && sys.name.trim() !== '') {
                    restName = sys.name.trim().replace(/\s+/g, '_');
                }
            }
        } catch(e) {}
        
        const d = new Date();
        const dateStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        
        if (typeof window.exportPageToPDF === 'function') {
            window.exportPageToPDF('هنقرستيشن_' + restName + '_' + dateStr + '.pdf');
        } else {
            window.print();
        }
    };

    // Filter buttons - Payment status
    document.querySelectorAll('.hs-filter-btn[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.hs-filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderOrders();
        });
    });

    // Filter buttons - Date range
    document.querySelectorAll('.hs-filter-btn[data-date]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.hs-filter-btn[data-date]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentDateFilter = btn.dataset.date;
            renderDashboard();
            renderOrders();
        });
    });

    // Search input
    document.getElementById('hs-search-input').addEventListener('input', () => {
        renderOrders();
    });

    // Notification helper
    function showNotification(message, type = 'success') {
        const notif = document.createElement('div');
        notif.style.cssText = `position:fixed;top:20px;right:20px;background:${type === 'success' ? '#10b981' : '#ef4444'};color:white;padding:15px 25px;border-radius:8px;box-shadow:0 10px 25px rgba(0,0,0,0.3);z-index:9999999;display:flex;align-items:center;gap:10px;font-weight:bold;animation:slideIn 0.3s ease-out;`;
        notif.innerHTML = `<i class="ph-fill ph-check-circle" style="font-size:24px;"></i> <span>${message}</span>`;
        document.body.appendChild(notif);
        setTimeout(() => {
            notif.style.opacity = '0';
            notif.style.transition = 'opacity 0.5s';
            setTimeout(() => notif.remove(), 500);
        }, 3000);
    }

    // Initial load
    loadData();

    // Listen for database changes
    if (typeof window.registerPosDatabaseRefresh === 'function') {
        window.registerPosDatabaseRefresh(() => loadData());
    } else {
        window.addEventListener('storage', (e) => {
            if (e.key === null || e.key === 'pos_database') {
                loadData();
            }
        });
    }

    // Bulk receive modal
    window.openBulkReceiveModal = async function() {
        const filteredOrders = filterByDate(hsOrders);
        const unpaidOrders = filteredOrders.filter(o => o.hsPaymentStatus !== 'paid');
        const totalUnpaid = unpaidOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

        document.getElementById('bulk-unpaid-amount').textContent = formatCurrency(totalUnpaid);
        document.getElementById('bulk-unpaid-count').textContent = `${unpaidOrders.length} طلب غير مدفوع`;
        document.getElementById('bulk-receive-amount').value = totalUnpaid.toFixed(2);
        
        document.getElementById('hs-bulk-receive-modal').classList.add('active');
    };

    window.closeBulkReceiveModal = function() {
        document.getElementById('hs-bulk-receive-modal').classList.remove('active');
    };

    window.confirmBulkReceive = async function() {
        const amount = parseFloat(document.getElementById('bulk-receive-amount').value) || 0;
        const paymentMethod = document.querySelector('input[name="bulk_pay_method"]:checked').value;
        const notes = document.getElementById('bulk-receive-notes').value || '';

        if (amount <= 0) {
            alert('الرجاء إدخال مبلغ صحيح');
            return;
        }

        if (!confirm(`هل تريد تأكيد استلام ${formatCurrency(amount)} من هنقرستيشن؟\nسيتم إنشاء سند قبض.`)) {
            return;
        }

        try {
            const dbData = await window.dbRead();
            const now = new Date();

            // Create receipt voucher (سند قبض)
            if (!dbData.receipt_vouchers) dbData.receipt_vouchers = [];
            
            const newVoucher = {
                id: 'RV-HS-' + Date.now(),
                type: 'سند قبض',
                amount: amount,
                from: 'هنقرستيشن',
                orderId: 'طلبات متعددة',
                paymentMethod: paymentMethod,
                notes: notes || `استلام مبلغ من هنقرستيشن`,
                date: now.toLocaleString('ar-u-nu-latn'),
                timestamp: now.getTime()
            };
            dbData.receipt_vouchers.push(newVoucher);

            // Mark orders as paid based on amount received
            const unpaidOrders = hsOrders.filter(o => o.hsPaymentStatus !== 'paid')
                .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            
            let remainingAmount = amount;
            let totalCashReceived = 0;
            
            for (const order of unpaidOrders) {
                if (remainingAmount <= 0) break;
                
                const orderTotal = Number(order.total) || 0;
                
                if (remainingAmount >= orderTotal) {
                    // Full payment for this order
                    const orderIndex = dbData.orders.findIndex(o => o.orderId === order.orderId);
                    if (orderIndex !== -1) {
                        dbData.orders[orderIndex].hsPaymentStatus = 'paid';
                        dbData.orders[orderIndex].hsPaidDate = now.toLocaleString('ar-u-nu-latn');
                        dbData.orders[orderIndex].hsPaymentMethod = paymentMethod;
                    }
                    remainingAmount -= orderTotal;
                    if (paymentMethod === 'كاش' || paymentMethod === 'cash') {
                        totalCashReceived += orderTotal;
                    }
                } else {
                    // Partial payment - stop here
                    break;
                }
            }
            
            // Update drawer balance if payment was cash
            if (totalCashReceived > 0) {
                const currentFloat = parseFloat(localStorage.getItem('shift_cash_float')) || 0;
                localStorage.setItem('shift_cash_float', currentFloat + totalCashReceived);
            }
            
            await window.dbWrite(dbData);
            closeBulkReceiveModal();
            loadData();
            
            showNotification(`تم استلام ${formatCurrency(amount)} - تم إنشاء سند قبض`, 'success');
            
            setTimeout(() => {
                if (typeof generateAndDownloadVoucher === 'function') {
                    generateAndDownloadVoucher(newVoucher);
                }
            }, 500);
        } catch(e) {
            console.error('Failed to confirm bulk receive:', e);
            alert('حدث خطأ أثناء تحديث الحالة');
        }
    };

    // Add event listeners for bulk payment method selection
    document.querySelectorAll('.payment-method-bulk').forEach(label => {
        label.addEventListener('click', () => {
            document.querySelectorAll('.payment-method-bulk').forEach(l => {
                l.classList.remove('selected');
                l.style.borderColor = 'var(--border-color)';
                l.style.background = 'var(--bg-dark)';
                l.querySelector('i').style.color = 'var(--text-muted)';
                l.querySelector('strong').style.color = 'var(--text-muted)';
            });
            label.classList.add('selected');
            label.style.borderColor = '#ff6b00';
            label.style.background = 'rgba(255,107,0,0.1)';
            label.querySelector('i').style.color = '#ff6b00';
            label.querySelector('strong').style.color = '#ff6b00';
        });
    });

    // Helper to generate and download voucher image
    window.generateAndDownloadVoucher = async function(voucherData) {
        try {
            const sysRaw = localStorage.getItem('restaurant_settings');
            const sysSet = sysRaw ? JSON.parse(sysRaw) : {};
            
            const restNameEl = document.getElementById('hsv-rest-name');
            if (restNameEl) restNameEl.innerText = sysSet.name || 'مطابخ ومحائذ هـــش HASH';
            
            const branchEl = document.getElementById('hsv-branch');
            if (branchEl) branchEl.innerText = sysSet.branch || '';
            
            const phoneEl = document.getElementById('hsv-phone');
            if (phoneEl) phoneEl.innerText = sysSet.phone || '';
            
            const logoEl = document.getElementById('hsv-logo');
            if (logoEl && sysSet.logo && sysSet.logo !== '1111.png') {
                logoEl.src = sysSet.logo;
            }

            const formatVoucherDate = (dateStr) => {
                try {
                    return new Date(dateStr).toISOString().split('T')[0].replace(/-/g, '/');
                } catch(e) {
                    return dateStr;
                }
            };

            const displayDate = formatVoucherDate(voucherData.date || new Date().toISOString());

            document.getElementById('hsv-date').innerText = displayDate;
            document.getElementById('hsv-number').innerText = voucherData.id;
            document.getElementById('hsv-amt-balance').innerText = formatCurrency(voucherData.amount);
            document.getElementById('hsv-amt').innerText = formatCurrency(voucherData.amount);
            document.getElementById('hsv-desc').innerText = voucherData.notes;
            document.getElementById('hsv-pay').innerText = voucherData.paymentMethod;
            document.getElementById('hsv-notes').innerText = 'تم الاستلام والتأكيد من النظام';
            document.getElementById('hsv-foot-date').innerText = displayDate;

            const container = document.getElementById('hs-voucher-container');
            const template = document.getElementById('hs-voucher-template');
            
            if (!container || !template) return;
            
            container.style.position = 'fixed';
            container.style.top = '-9999px';
            container.style.left = '0';
            container.style.width = '840px';
            template.style.width = '800px';

            await new Promise(r => setTimeout(r, 150)); // let dom update

            const canvas = await html2canvas(template, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                width: 800,
                windowWidth: 1200,
                logging: false
            });

            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = 1600;
            finalCanvas.height = 1132;
            const ctx = finalCanvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 1600, 1132);
            ctx.drawImage(canvas, 0, 0, 1600, 1132);

            const imgData = finalCanvas.toDataURL('image/jpeg', 0.95);
            
            // Trigger download
            const a = document.createElement('a');
            a.href = imgData;
            a.download = `سند_قبض_هنقرستيشن_${voucherData.id}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            showNotification('تم تحميل صورة السند بنجاح', 'success');

        } catch (e) {
            console.error('Error generating voucher image:', e);
            showNotification('حدث خطأ أثناء تحميل السند', 'error');
        } finally {
            const container = document.getElementById('hs-voucher-container');
            const template = document.getElementById('hs-voucher-template');
            if (container) {
                container.style.position = 'absolute';
                container.style.top = '-9999px';
                container.style.left = '-9999px';
                container.style.width = '';
            }
            if (template) {
                template.style.width = '';
            }
            document.querySelectorAll('iframe.html2canvas-container').forEach(f => {
                try { f.remove(); } catch(e){}
            });
        }
    };
});
