document.addEventListener('DOMContentLoaded', async () => {
    const { ipcRenderer } = require('electron');
    
    // State
    let hsOrders = [];
    let currentFilter = 'all';
    let currentDateFilter = 'all'; // all, today, week, month, 2weeks, single, range
    let customDateSingle = '';
    let customDateFrom = '';
    let customDateTo = '';
    let selectedOrderIds = new Set();
    let selectionTouched = false;

    // Format currency
    const formatCurrency = (amount) =>
        window.MisterCasherCurrency ? MisterCasherCurrency.format(amount) : Number(amount).toFixed(2) + ' ر.س';
    function getVoucherCaptureScale() {
        if (window.MC_PERF && typeof window.MC_PERF.getVoucherCaptureScale === 'function') {
            return window.MC_PERF.getVoucherCaptureScale();
        }
        return 1.5;
    }

    // Load data
    async function loadData() {
        try {
            const dbData = await window.dbReadSlice(['orders']);
            const targetCompany = new URLSearchParams(window.location.search).get('company') || 'هنقرستيشن';
            
            // تحديث نصوص الواجهة لتناسب الشركة المختارة
            updateUiText(targetCompany);

            hsOrders = (dbData.orders || []).filter(o => {
                if (targetCompany === 'هنقرستيشن') {
                    return o.deliveryCompany === 'هنقرستيشن' || o.orderType === 'هنقرستيشن' || (o.hungerStation === true && !o.deliveryCompany);
                }
                return o.deliveryCompany === targetCompany || o.orderType === targetCompany;
            });
            renderDashboard();
            renderOrders();
        } catch(e) {
            console.error('Failed to load HungerStation data:', e);
        }
    }

    function updateUiText(companyName) {
        // تحديث عنوان المتصفح
        document.title = `Mister Casher - ${companyName}`;
        
        // تحديث عنوان الصفحة الرئيسي
        const pageTitle = document.querySelector('.page-title h2');
        if (pageTitle) {
            pageTitle.innerHTML = `<i class="ph ph-motorcycle" style="color: #ff6b00;"></i> إدارة طلبات ${companyName}`;
        }
        
        // تحديث نص البحث في الهيدر
        const headerSearch = document.querySelector('.top-header .search-bar input');
        if (headerSearch) {
            headerSearch.placeholder = `ابحث في طلبات ${companyName}...`;
        }

        // تحديث نص البحث في الفلتر
        const filterSearch = document.getElementById('hs-search-input');
        if (filterSearch) {
            filterSearch.placeholder = `ابحث في طلبات ${companyName}...`;
        }

        // تحديث عنوان مودال استلام المبلغ
        const bulkModalHeader = document.querySelector('#hs-bulk-receive-modal h2');
        if (bulkModalHeader) {
            bulkModalHeader.innerHTML = `<i class="ph ph-hand-coins"></i> استلام مبلغ من ${companyName}`;
        }

        // تحديث قالب سند القبض
        const voucherTitle = document.querySelector('.v-main-title');
        if (voucherTitle) {
            voucherTitle.innerText = `سند قبض — ${companyName}`;
        }
        
        const voucherFromLabel = document.getElementById('hsv-from');
        if (voucherFromLabel) {
            voucherFromLabel.innerText = companyName;
        }

        // تحديث رسالة الجدول الفارغ
        const emptyMsg = document.querySelector('.hs-empty p');
        if (emptyMsg) {
            emptyMsg.innerText = `لا توجد طلبات لشركة ${companyName} بعد`;
        }
    }

    function getOrderTimestamp(order) {
        if (order.timestamp) return Number(order.timestamp);
        if (order.date) {
            const parsed = Date.parse(order.date);
            if (!Number.isNaN(parsed)) return parsed;
        }
        return 0;
    }

    function formatDateInputLabel(dateStr) {
        if (!dateStr) return '';
        try {
            const [y, m, d] = dateStr.split('-').map(Number);
            const dt = new Date(y, m - 1, d);
            return dt.toLocaleDateString('ar-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });
        } catch (_) {
            return dateStr;
        }
    }

    function getDateFilterLabel() {
        if (currentDateFilter === 'all') return 'كل الأوقات';
        if (currentDateFilter === 'today') return 'اليوم';
        if (currentDateFilter === 'week') return 'هذا الأسبوع';
        if (currentDateFilter === 'month') return 'هذا الشهر';
        if (currentDateFilter === '2weeks') return 'آخر أسبوعين';
        if (currentDateFilter === 'single' && customDateSingle) {
            return `تاريخ ${formatDateInputLabel(customDateSingle)}`;
        }
        if (currentDateFilter === 'range') {
            if (customDateFrom && customDateTo) {
                return `من ${formatDateInputLabel(customDateFrom)} إلى ${formatDateInputLabel(customDateTo)}`;
            }
            if (customDateFrom) return `من ${formatDateInputLabel(customDateFrom)}`;
            if (customDateTo) return `حتى ${formatDateInputLabel(customDateTo)}`;
        }
        return 'كل الأوقات';
    }

    function updateDateFilterLabel() {
        const el = document.getElementById('hs-active-date-label');
        if (el) el.textContent = getDateFilterLabel();
    }

    function setDateFilterActive(mode) {
        currentDateFilter = mode;
        const presetModes = ['all', 'today', 'week', 'month', '2weeks'];
        document.querySelectorAll('.hs-filter-btn[data-date]').forEach(b => {
            b.classList.toggle('active', presetModes.includes(mode) && b.dataset.date === mode);
        });
        updateDateFilterLabel();
    }

    function resetSelectionToVisible(orders) {
        selectedOrderIds = new Set(orders.map(o => o.orderId).filter(Boolean));
        selectionTouched = false;
    }

    // Date filtering
    function filterByDate(orders) {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

        if (currentDateFilter === 'all') return orders;

        return orders.filter(order => {
            const orderTs = getOrderTimestamp(order);

            if (currentDateFilter === 'today') {
                return orderTs >= todayStart;
            }
            if (currentDateFilter === 'week') {
                const weekAgo = new Date(todayStart);
                weekAgo.setDate(weekAgo.getDate() - 7);
                return orderTs >= weekAgo.getTime();
            }
            if (currentDateFilter === 'month') {
                const monthAgo = new Date(todayStart);
                monthAgo.setMonth(monthAgo.getMonth() - 1);
                return orderTs >= monthAgo.getTime();
            }
            if (currentDateFilter === '2weeks') {
                const twoWeeksAgo = new Date(todayStart);
                twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
                return orderTs >= twoWeeksAgo.getTime();
            }
            if (currentDateFilter === 'single' && customDateSingle) {
                const dayStart = new Date(customDateSingle).getTime();
                const dayEnd = dayStart + 86400000 - 1;
                return orderTs >= dayStart && orderTs <= dayEnd;
            }
            if (currentDateFilter === 'range') {
                if (customDateFrom) {
                    const fromTs = new Date(customDateFrom).getTime();
                    if (orderTs < fromTs) return false;
                }
                if (customDateTo) {
                    const toTs = new Date(customDateTo).getTime() + 86400000 - 1;
                    if (orderTs > toTs) return false;
                }
            }
            return true;
        });
    }

    function getFilteredOrders() {
        let filtered = filterByDate(hsOrders);
        if (currentFilter === 'paid') {
            filtered = filtered.filter(o => o.hsPaymentStatus === 'paid');
        } else if (currentFilter === 'unpaid') {
            filtered = filtered.filter(o => o.hsPaymentStatus !== 'paid');
        }
        const searchInput = document.getElementById('hs-search-input');
        const searchTerm = (searchInput ? searchInput.value : '').toLowerCase();
        if (searchTerm) {
            filtered = filtered.filter(o =>
                (o.orderId || '').toLowerCase().includes(searchTerm) ||
                (o.customerName || '').toLowerCase().includes(searchTerm)
            );
        }
        return filtered;
    }

    function syncSelectAllCheckbox(filtered) {
        const selectAll = document.getElementById('hs-select-all');
        if (!selectAll) return;
        const visibleIds = filtered.map(o => o.orderId).filter(Boolean);
        const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedOrderIds.has(id));
        selectAll.checked = allSelected;
        selectAll.indeterminate = !allSelected && visibleIds.some(id => selectedOrderIds.has(id));
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

        const kpiPeriod = document.querySelector('#hs-total-orders')?.closest('.hs-card')?.querySelector('.hs-card-subtitle span');
        if (kpiPeriod) kpiPeriod.textContent = getDateFilterLabel();
    }

    // Render orders table
    function renderOrders(resetSelection = false) {
        const tbody = document.getElementById('hs-orders-table');
        const filtered = getFilteredOrders();

        if (resetSelection || !selectionTouched) {
            resetSelectionToVisible(filtered);
        } else {
            const visibleIds = new Set(filtered.map(o => o.orderId).filter(Boolean));
            selectedOrderIds = new Set([...selectedOrderIds].filter(id => visibleIds.has(id)));
        }

        if (filtered.length === 0) {
            const targetCompany = new URLSearchParams(window.location.search).get('company') || 'هنقرستيشن';
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="hs-empty">
                        <i class="ph ph-motorcycle"></i>
                        <p>لا توجد طلبات لشركة ${targetCompany} بعد</p>
                    </td>
                </tr>
            `;
            syncSelectAllCheckbox([]);
            return;
        }

        tbody.innerHTML = filtered.map(order => {
            const itemsCount = order.items ? order.items.length : 0;
            const statusClass = order.hsStatus || 'delivered';
            const statusText = 'مكتمل';
            const paymentClass = order.hsPaymentStatus || 'unpaid';
            const paymentText = paymentClass === 'paid' ? 'مدفوع' : 'غير مدفوع';
            const isChecked = selectedOrderIds.has(order.orderId);
            const safeId = (order.orderId || '').replace(/'/g, "\\'");

            return `
                <tr>
                    <td style="text-align:center;">
                        <input type="checkbox" class="hs-order-cb hs-order-checkbox" data-order-id="${order.orderId || ''}" ${isChecked ? 'checked' : ''} onchange="toggleHsOrderSelection('${safeId}', this.checked)">
                    </td>
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

        syncSelectAllCheckbox(filtered);

        // Populate tfoot with summary rows (print/PDF friendly — no big cards)
        const tfoot = document.getElementById('hs-orders-tfoot');
        if (tfoot) {
            const totalAmt  = filtered.reduce((s, o) => s + (Number(o.total) || 0), 0);
            const paidAmt   = filtered.filter(o => o.hsPaymentStatus === 'paid').reduce((s, o) => s + (Number(o.total) || 0), 0);
            const unpaidAmt = filtered.filter(o => o.hsPaymentStatus !== 'paid').reduce((s, o) => s + (Number(o.total) || 0), 0);
            const paidCount   = filtered.filter(o => o.hsPaymentStatus === 'paid').length;
            const unpaidCount = filtered.filter(o => o.hsPaymentStatus !== 'paid').length;
            const sym = window.MisterCasherCurrency ? MisterCasherCurrency.getConfig().symbol : 'ر.س';

            const dateLabel = getDateFilterLabel();
            tfoot.innerHTML = `
                <tr style="background:rgba(255,107,0,0.07); font-weight:700; border-top:3px solid #ff6b00;">
                    <td colspan="4" style="padding:12px 14px; font-size:13px; border-top:3px solid #94a3b8;">
                        ◼ إجمالي الطلبات: <strong>${filtered.length} طلب</strong> — <span style="color:#ff6b00;">${dateLabel}</span>
                    </td>
                    <td style="padding:12px 14px; border-top:3px solid #94a3b8;"></td>
                    <td style="padding:12px 14px; font-size:15px; font-weight:800; border-top:3px solid #94a3b8;">
                        ${totalAmt.toFixed(2)} ${sym}
                    </td>
                    <td colspan="3" style="padding:12px 14px; font-size:12px; border-top:3px solid #94a3b8;">الإجمالي الكلي</td>
                </tr>
                <tr style="background:rgba(16,185,129,0.06);">
                    <td colspan="4" style="padding:9px 14px; font-size:13px;">
                        ✓ المدفوع: <strong>${paidCount} طلب</strong>
                    </td>
                    <td style="padding:9px 14px;"></td>
                    <td style="padding:9px 14px; font-size:14px; font-weight:800;">
                        ${paidAmt.toFixed(2)} ${sym}
                    </td>
                    <td colspan="3" style="padding:9px 14px; font-size:12px;">تم الاستلام</td>
                </tr>
                <tr style="background:rgba(239,68,68,0.06);">
                    <td colspan="4" style="padding:9px 14px; font-size:13px;">
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
                        <strong>الشركة:</strong> ${order.deliveryCompany || order.orderType || 'هنقرستيشن'}<br>
                        <strong>العميل:</strong> ${order.customerName || 'طلب خارجي'}<br>
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
                        <div style="font-size: 13px; color: #ff6b00; font-weight: 700; margin-top: 8px;">تاريخ الطلب: ${order.date || '-'}</div>
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
            const dbData = typeof window.dbReadSlice === 'function' ? await window.dbReadSlice(['orders', 'receipt_vouchers']) : await window.dbReadArchive();
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
                from: order.deliveryCompany || order.orderType || 'هنقرستيشن',
                orderId: orderId,
                paymentMethod: selectedMethod,
                notes: notes || `استلام مبلغ طلب ${orderId} — تاريخ الطلب: ${order.date || '-'}`,
                dateFilterLabel: order.date ? `تاريخ الطلب: ${order.date}` : '',
                date: now.toLocaleString('ar-u-nu-latn'),
                timestamp: now.getTime()
            };
            dbData.receipt_vouchers.push(newVoucher);
            
            
            await window.dbWrite(dbData);
            modal.remove();
            
            // تأجيل إعادة التحميل لمنع الشاشة السوداء
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    loadData();
                    showNotification(`تم استلام ${formatCurrency(order.total)} - تم إنشاء سند قبض`, 'success');
                });
            });
            
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
        const targetCompany = new URLSearchParams(window.location.search).get('company') || 'هنقرستيشن';
        let restName = targetCompany;
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
        const filterSlug = getDateFilterLabel().replace(/\s+/g, '_').replace(/[^\w\u0600-\u06FF_-]/g, '');
        
        if (typeof window.exportPageToPDF === 'function') {
            window.exportPageToPDF(targetCompany + '_' + restName + '_' + filterSlug + '_' + dateStr + '.pdf');
        } else {
            window.print();
        }
    };

    window.toggleHsOrderSelection = function(orderId, checked) {
        if (!orderId) return;
        selectionTouched = true;
        if (checked) selectedOrderIds.add(orderId);
        else selectedOrderIds.delete(orderId);
        syncSelectAllCheckbox(getFilteredOrders());
    };

    const selectAllEl = document.getElementById('hs-select-all');
    if (selectAllEl) {
        selectAllEl.addEventListener('change', () => {
            selectionTouched = true;
            const filtered = getFilteredOrders();
            if (selectAllEl.checked) {
                filtered.forEach(o => { if (o.orderId) selectedOrderIds.add(o.orderId); });
            } else {
                filtered.forEach(o => { if (o.orderId) selectedOrderIds.delete(o.orderId); });
            }
            renderOrders(false);
        });
    }

    const singleDateInput = document.getElementById('hs-date-single');
    if (singleDateInput) {
        singleDateInput.addEventListener('change', () => {
            if (!singleDateInput.value) return;
            customDateSingle = singleDateInput.value;
            customDateFrom = '';
            customDateTo = '';
            const fromEl = document.getElementById('hs-date-from');
            const toEl = document.getElementById('hs-date-to');
            if (fromEl) fromEl.value = '';
            if (toEl) toEl.value = '';
            setDateFilterActive('single');
            renderDashboard();
            renderOrders(true);
        });
    }

    const applyRangeBtn = document.getElementById('hs-apply-date-range');
    if (applyRangeBtn) {
        applyRangeBtn.addEventListener('click', () => {
            const fromEl = document.getElementById('hs-date-from');
            const toEl = document.getElementById('hs-date-to');
            customDateFrom = fromEl ? fromEl.value : '';
            customDateTo = toEl ? toEl.value : '';
            if (!customDateFrom && !customDateTo) {
                alert('الرجاء اختيار تاريخ البداية أو النهاية على الأقل');
                return;
            }
            if (customDateFrom && customDateTo && customDateFrom > customDateTo) {
                alert('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
                return;
            }
            customDateSingle = '';
            if (singleDateInput) singleDateInput.value = '';
            document.querySelectorAll('.hs-filter-btn[data-date]').forEach(b => b.classList.remove('active'));
            currentDateFilter = 'range';
            updateDateFilterLabel();
            renderDashboard();
            renderOrders(true);
        });
    }

    // Filter buttons - Payment status
    document.querySelectorAll('.hs-filter-btn[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.hs-filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderOrders(true);
        });
    });

    // Filter buttons - Date range
    document.querySelectorAll('.hs-filter-btn[data-date]').forEach(btn => {
        btn.addEventListener('click', () => {
            customDateSingle = '';
            customDateFrom = '';
            customDateTo = '';
            if (singleDateInput) singleDateInput.value = '';
            const fromEl = document.getElementById('hs-date-from');
            const toEl = document.getElementById('hs-date-to');
            if (fromEl) fromEl.value = '';
            if (toEl) toEl.value = '';
            setDateFilterActive(btn.dataset.date);
            renderDashboard();
            renderOrders(true);
        });
    });

    // Search input
    document.getElementById('hs-search-input').addEventListener('input', () => {
        renderOrders(false);
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
    updateDateFilterLabel();
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

    function getSelectedUnpaidOrders() {
        return getFilteredOrders().filter(o =>
            o.hsPaymentStatus !== 'paid' && selectedOrderIds.has(o.orderId)
        );
    }

    // Bulk receive modal
    window.openBulkReceiveModal = async function() {
        const unpaidOrders = getSelectedUnpaidOrders();
        const totalUnpaid = unpaidOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
        const dateLabel = getDateFilterLabel();
        const companyName = new URLSearchParams(window.location.search).get('company') || 'هنقرستيشن';

        if (unpaidOrders.length === 0) {
            alert('لا توجد طلبات غير مدفوعة محددة للاستلام');
            return;
        }

        document.getElementById('bulk-unpaid-amount').textContent = formatCurrency(totalUnpaid);
        document.getElementById('bulk-unpaid-count').textContent = `${unpaidOrders.length} طلب محدد غير مدفوع`;
        const bulkDateLabel = document.getElementById('bulk-date-range-label');
        if (bulkDateLabel) bulkDateLabel.textContent = `الفترة: ${dateLabel}`;
        document.getElementById('bulk-receive-amount').value = totalUnpaid.toFixed(2);
        
        window.openModalLayer(document.getElementById('hs-bulk-receive-modal'));
    };

    window.closeBulkReceiveModal = function() {
        window.closeModalLayer(document.getElementById('hs-bulk-receive-modal'));
    };

    window.confirmBulkReceive = async function() {
        const amount = parseFloat(document.getElementById('bulk-receive-amount').value) || 0;
        const paymentMethod = document.querySelector('input[name="bulk_pay_method"]:checked').value;
        const notes = document.getElementById('bulk-receive-notes').value || '';

        if (amount <= 0) {
            alert('الرجاء إدخال مبلغ صحيح');
            return;
        }

        const companyName = new URLSearchParams(window.location.search).get('company') || 'هنقرستيشن';
        const dateLabel = getDateFilterLabel();
        const selectedUnpaid = getSelectedUnpaidOrders()
            .sort((a, b) => getOrderTimestamp(a) - getOrderTimestamp(b));

        if (selectedUnpaid.length === 0) {
            alert('لا توجد طلبات محددة غير مدفوعة');
            return;
        }

        if (!await ModernDialog.confirm(`هل تريد تأكيد استلام ${formatCurrency(amount)} من ${companyName}؟\nالفترة: ${dateLabel}\nعدد الطلبات المحددة: ${selectedUnpaid.length}\nسيتم إنشاء سند قبض.`)) {
            return;
        }

        try {
            const dbData = typeof window.dbReadSlice === 'function' ? await window.dbReadSlice(['orders', 'receipt_vouchers']) : await window.dbReadArchive();
            const now = new Date();
            const periodNote = `الفترة: ${dateLabel}`;

            // Create receipt voucher (سند قبض)
            if (!dbData.receipt_vouchers) dbData.receipt_vouchers = [];
            
            const newVoucher = {
                id: 'RV-HS-' + Date.now(),
                type: 'سند قبض',
                amount: amount,
                from: companyName,
                orderId: 'طلبات متعددة',
                paymentMethod: paymentMethod,
                notes: notes || `استلام مبلغ من ${companyName} — ${periodNote}`,
                dateFilterLabel: dateLabel,
                date: now.toLocaleString('ar-u-nu-latn'),
                timestamp: now.getTime()
            };
            dbData.receipt_vouchers.push(newVoucher);

            // Mark selected orders as paid based on amount received
            const unpaidOrders = selectedUnpaid;
            
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
            
            
            await window.dbWrite(dbData);
            closeBulkReceiveModal();
            
            // تأجيل إعادة التحميل لمنع الشاشة السوداء
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    loadData();
                    showNotification(`تم استلام ${formatCurrency(amount)} - تم إنشاء سند قبض`, 'success');
                });
            });
            
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
            if (restNameEl) restNameEl.innerText = sysSet.name || 'مطابخ ومحائذ Mister Casher';
            
            const branchEl = document.getElementById('hsv-branch');
            if (branchEl) branchEl.innerText = sysSet.branch || '';
            
            const phoneEl = document.getElementById('hsv-phone');
            if (phoneEl) phoneEl.innerText = sysSet.phone || '';
            
            const logoEl = document.getElementById('hsv-logo');
            if (logoEl && sysSet.logo && sysSet.logo !== '2222.png') {
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
            const descParts = [voucherData.notes];
            if (voucherData.dateFilterLabel) descParts.push(`(${voucherData.dateFilterLabel})`);
            document.getElementById('hsv-desc').innerText = descParts.filter(Boolean).join(' ');
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
                scale: getVoucherCaptureScale(),
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
