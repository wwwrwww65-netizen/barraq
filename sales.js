const { ipcRenderer } = require('electron');

let allSalesOrders = [];
let filteredSalesOrders = [];
const SALES_PAGE_SIZE = 25;
let salesCurrentPage = 1;
let _salesSearchTimer;

// Auto-fix negative split values in database
async function autoFixNegativeSplitValues() {
    try {
        const db = await window.dbReadSlice(['orders']);
        const orders = db.orders || [];
        
        console.log(`\n🔍 [Auto-Fix] Scanning ${orders.length} orders...`);
        
        let fixedCount = 0;
        let negativeFound = [];
        
        orders.forEach(order => {
            const total = Number(order.total) || 0;
            const splitCash = Number(order.splitCash) || 0;
            const splitNetwork = Number(order.splitNetwork) || 0;
            const pm = (order.paymentMethod || '').trim();
            
            if (pm === 'مجزأ') {
                let needsFix = false;
                let newCash = splitCash;
                let newNetwork = splitNetwork;
                
                // Fix negative network
                if (splitNetwork < 0) {
                    negativeFound.push({
                        orderId: order.orderId,
                        total: total,
                        oldCash: splitCash,
                        oldNetwork: splitNetwork
                    });
                    
                    newNetwork = 0;
                    newCash = total;
                    needsFix = true;
                    console.warn(`❌ ${order.orderId}: Network ${splitNetwork.toFixed(2)} → 0, Cash ${splitCash.toFixed(2)} → ${total.toFixed(2)}`);
                }
                
                // Fix negative cash
                if (splitCash < 0) {
                    negativeFound.push({
                        orderId: order.orderId,
                        total: total,
                        oldCash: splitCash,
                        oldNetwork: splitNetwork
                    });
                    
                    newCash = 0;
                    newNetwork = total;
                    needsFix = true;
                    console.warn(`❌ ${order.orderId}: Cash ${splitCash.toFixed(2)} → 0, Network ${splitNetwork.toFixed(2)} → ${total.toFixed(2)}`);
                }
                
                // Fix sum mismatch
                if (Math.abs((newCash + newNetwork) - total) > 0.01) {
                    console.warn(`⚠️ ${order.orderId}: Sum mismatch ${newCash.toFixed(2)} + ${newNetwork.toFixed(2)} ≠ ${total.toFixed(2)}`);
                    newNetwork = total - newCash;
                    if (newNetwork < 0) {
                        newNetwork = 0;
                        newCash = total;
                    }
                    needsFix = true;
                }
                
                // Fix missing values
                if (splitCash === 0 && splitNetwork === 0 && total > 0) {
                    console.warn(`⚠️ ${order.orderId}: Missing split values, assuming all cash`);
                    newCash = total;
                    newNetwork = 0;
                    needsFix = true;
                }
                
                if (needsFix) {
                    order.splitCash = Math.round(newCash * 100) / 100;
                    order.splitNetwork = Math.round(newNetwork * 100) / 100;
                    fixedCount++;
                }
            }
        });
        
        if (negativeFound.length > 0) {
            console.log('\n📋 Negative values found:');
            console.table(negativeFound);
        }
        
        if (fixedCount > 0) {
            console.log(`\n✅ [Auto-Fix] Fixed ${fixedCount} orders`);
            await window.dbWrite(db);
            console.log('💾 Database saved. Please refresh the page.');
        } else {
            console.log('\n✅ [Auto-Fix] No issues found. All split values are correct.');
            
            // Show summary of all split payment orders
            let splitOrders = orders.filter(o => (o.paymentMethod || '').trim() === 'مجزأ');
            console.log(`\n💰 Split Payment Summary: ${splitOrders.length} orders`);
            
            let totalCash = 0;
            let totalNetwork = 0;
            splitOrders.forEach(o => {
                totalCash += Number(o.splitCash) || 0;
                totalNetwork += Number(o.splitNetwork) || 0;
            });
            
            console.log(`   Total Cash: ${totalCash.toFixed(2)}`);
            console.log(`   Total Network: ${totalNetwork.toFixed(2)}`);
            console.log(`   Grand Total: ${(totalCash + totalNetwork).toFixed(2)}`);
        }
    } catch (error) {
        console.error('[Auto-Fix] Error:', error);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadSales();

    if (typeof window.registerPosDatabaseRefresh === 'function') {
        window.registerPosDatabaseRefresh(() => loadSales());
    }

    const searchInput = document.getElementById('sales-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(_salesSearchTimer);
            _salesSearchTimer = setTimeout(() => {
                salesCurrentPage = 1;
                renderSalesTable(e.target.value.toLowerCase().trim());
            }, 300);
        });
    }

    const periodFilter = document.getElementById('sales-period-filter');
    const customWrap = document.getElementById('sales-custom-date-wrap');
    
    if (periodFilter) {
        periodFilter.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                if (customWrap) customWrap.style.display = 'flex';
            } else {
                if (customWrap) customWrap.style.display = 'none';
                salesCurrentPage = 1;
                loadSales();
            }
        });
    }
});

async function loadSales() {
    // ⚡ إظهار شاشات الهيكل (Skeleton Screens) للجدول أثناء انتظار البيانات
    const tbody = document.getElementById('sales-tbody');
    const tbl = document.querySelector('.sales-table');
    const emptyState = document.getElementById('empty-state');
    
    if (tbody) {
        if(emptyState) emptyState.style.display = 'none';
        if(tbl) tbl.style.display = 'table';
        tbody.innerHTML = Array(8).fill(`
            <tr class="skeleton-row">
                <td><div class="skeleton-line short"></div></td>
                <td><div class="skeleton-line medium"></div></td>
                <td><div class="skeleton-line short"></div></td>
                <td><div class="skeleton-line medium"></div></td>
                <td><div class="skeleton-line short"></div></td>
                <td><div class="skeleton-line full"></div></td>
                <td><div class="skeleton-line short"></div></td>
                <td><div class="skeleton-line medium"></div></td>
                <td><div class="skeleton-line short"></div></td>
            </tr>
        `).join('');
    }

    // إصلاح القيم السالبة مرة واحدة لكل جلسة — لا يُعاد مسح آلاف الطلبات عند كل فتح
    const shouldFix =
        !window.MC_PERF ||
        typeof window.MC_PERF.shouldRunSalesAutoFixThisSession !== 'function' ||
        window.MC_PERF.shouldRunSalesAutoFixThisSession();
    if (shouldFix) {
        await autoFixNegativeSplitValues();
        if (window.MC_PERF && typeof window.MC_PERF.markSalesAutoFixDone === 'function') {
            window.MC_PERF.markSalesAutoFixDone();
        }
    }
    
    // Read from SQLite JSON database via IPC
    allSalesOrders = await ipcRenderer.invoke('db-get-orders');
    if (!allSalesOrders) allSalesOrders = [];

    // Filter out returned orders to match closing reports
    allSalesOrders = allSalesOrders.filter(o => o.status !== 'returned');

    const period = document.getElementById('sales-period-filter')?.value || 'today';
    let filteredList = [];
    
    if (period === 'all') {
        filteredList = allSalesOrders;
    } else if (period === 'custom') {
        const fromVal = document.getElementById('sales-date-from')?.value;
        const toVal = document.getElementById('sales-date-to')?.value;
        if (fromVal && toVal) {
            const startStr = fromVal + 'T00:00:00';
            const endStr = toVal + 'T23:59:59';
            filteredList = allSalesOrders.filter(o => {
                const ts = o.timestamp || new Date(o.dateStr || o.date).getTime();
                return ts >= new Date(startStr).getTime() && ts <= new Date(endStr).getTime();
            });
        } else {
            filteredList = allSalesOrders; // Fallback if dates are not selected
        }
    } else {
        // today, yesterday, week, month
        if (typeof window.isDateInPeriod === 'function') {
            filteredList = allSalesOrders.filter(o => window.isDateInPeriod(o.timestamp || o.dateStr || o.date, period));
        } else {
            filteredList = allSalesOrders;
        }
    }
    
    allSalesOrders = filteredList;

    // Sort descending by timestamp
    allSalesOrders.sort((a, b) => b.timestamp - a.timestamp);
    updateKPIs(allSalesOrders);

    const searchStr = document.getElementById('sales-search')?.value.toLowerCase().trim() || '';
    renderSalesTable(searchStr);
}

function renderSalesTable(query = '') {
    const tbody = document.getElementById('sales-tbody');
    const emptyState = document.getElementById('empty-state');
    const tbl = document.querySelector('.sales-table');
    if (!tbody) return;

    filteredSalesOrders = allSalesOrders.filter(o => {
        if(!query) return true;
        const text = (o.orderId + " " + (o.date || o.dateStr || "") + " " + (o.type || "") + " " + (o.paymentMethod || "")).toLowerCase();
        return text.includes(query);
    });

    if (filteredSalesOrders.length === 0) {
        tbody.innerHTML = '';
        if(emptyState) emptyState.style.display = 'block';
        if(tbl) tbl.style.display = 'none';
        _renderSalesPagination(0, 0, 0, tbody);
        return;
    }

    if(emptyState) emptyState.style.display = 'none';
    if(tbl) tbl.style.display = 'table';

    const total = filteredSalesOrders.length;
    const totalPages = Math.max(1, Math.ceil(total / SALES_PAGE_SIZE));
    if (salesCurrentPage > totalPages) salesCurrentPage = totalPages;

    const start = (salesCurrentPage - 1) * SALES_PAGE_SIZE;
    const pageItems = filteredSalesOrders.slice(start, start + SALES_PAGE_SIZE);

    const xf = (n) => (window.MisterCasherCurrency ? MisterCasherCurrency.format(n) : Number(n).toFixed(2) + ' ر.س');
    const fragment = document.createDocumentFragment();

    pageItems.forEach(order => {
        let typeClass = (order.type||'').includes('محلي') ? 'badge-dinein' : 'badge-takeout';
        let methodClass = (order.paymentMethod||'').includes('كاش') ? 'badge-cash' : 'badge-card';
        const itemsCount = Array.isArray(order.items) ? order.items.length : (order.itemsCount || 0);
        
        let itemsDetails = '-';
        if (Array.isArray(order.items) && order.items.length > 0) {
            itemsDetails = order.items.map(item => {
                const name = item.name || item.productName || item.itemName || '-';
                const qty = item.qty || item.quantity || 1;
                return `${name} x${qty}`;
            }).join('، ');
        }

        // Debug: Log order data
        if (order.paymentMethod === 'مجزأ') {
            console.log('[Sales] Split order:', {
                orderId: order.orderId,
                total: order.total,
                splitCash: order.splitCash,
                splitNetwork: order.splitNetwork,
                paymentMethod: order.paymentMethod
            });
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${order.orderId}</strong></td>
            <td style="color:var(--text-secondary); font-size:12px;">${order.date || order.dateStr || ''}</td>
            <td><span class="sales-badge ${typeClass}">${order.type || ''}</span></td>
            <td><span class="sales-badge ${methodClass}"><i class="ph ph-${(order.paymentMethod||'').includes('كاش') ? 'money' : 'credit-card'}"></i> ${order.paymentMethod || ''}</span></td>
            <td>${itemsCount} أصناف</td>
            <td style="font-size: 12px; color: var(--text-secondary); max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${itemsDetails}">${itemsDetails}</td>
            <td>${order.cashier || '-'}</td>
            <td style="color:var(--accent-green); font-weight:800;">${xf(order.total)}</td>
            <td style="text-align:center;">
                <button class="sales-action-btn" title="طباعة الفاتورة مرة أخرى" onclick="reprintOrder('${order.orderId}')"><i class="ph ph-printer"></i></button>
                <button class="sales-action-btn" title="تفاصيل الطلب" style="color:var(--accent-blue)" onclick="viewOrderDetails('${order.orderId}')"><i class="ph ph-eye"></i></button>
            </td>
        `;
        fragment.appendChild(tr);
    });
    
    tbody.innerHTML = '';
    tbody.appendChild(fragment);
    
    _renderSalesPagination(salesCurrentPage, totalPages, total, tbody);
}

function _renderSalesPagination(page, totalPages, total, tbody) {
    let bar = document.getElementById('sales-pagination-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'sales-pagination-bar';
        bar.className = 'no-print';
        bar.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;padding:16px 0;flex-wrap:wrap;';
        const tbl = document.querySelector('.sales-table');
        if(tbl) tbl.parentNode.insertBefore(bar, tbl.nextSibling);
    }
    
    if (totalPages <= 1) { bar.innerHTML = ''; return; }

    const start = (page - 1) * SALES_PAGE_SIZE + 1;
    const end   = Math.min(page * SALES_PAGE_SIZE, total);
    const bs = (active) => `background:${active?'var(--accent-blue)':'var(--bg-card)'};color:${active?'#fff':'var(--text-secondary)'};border:1px solid ${active?'var(--accent-blue)':'var(--border-color)'};border-radius:8px;padding:6px 14px;cursor:pointer;font-family:inherit;font-weight:700;font-size:13px;transition:background-color 0.15s ease;`;

    let html = `<span style="color:var(--text-muted);font-size:13px">صفحة ${page}/${totalPages} (مبيعة ${start}–${end} من ${total})</span>`;
    html += `<button style="${bs(false)}" id="sp-first" ${page===1?'disabled':''}>«</button>`;
    html += `<button style="${bs(false)}" id="sp-prev"  ${page===1?'disabled':''}>‹</button>`;
    for (let i = Math.max(1, page-2); i <= Math.min(totalPages, page+2); i++)
        html += `<button style="${bs(i===page)}" class="sp-num" data-p="${i}">${i}</button>`;
    html += `<button style="${bs(false)}" id="sp-next" ${page===totalPages?'disabled':''}>›</button>`;
    html += `<button style="${bs(false)}" id="sp-last" ${page===totalPages?'disabled':''}>»</button>`;

    bar.innerHTML = html;
    bar.querySelector('#sp-first')?.addEventListener('click', () => { salesCurrentPage = 1; renderSalesTable(document.getElementById('sales-search')?.value.toLowerCase().trim()||''); });
    bar.querySelector('#sp-prev' )?.addEventListener('click', () => { salesCurrentPage--; renderSalesTable(document.getElementById('sales-search')?.value.toLowerCase().trim()||''); });
    bar.querySelector('#sp-next' )?.addEventListener('click', () => { salesCurrentPage++; renderSalesTable(document.getElementById('sales-search')?.value.toLowerCase().trim()||''); });
    bar.querySelector('#sp-last' )?.addEventListener('click', () => { salesCurrentPage = totalPages; renderSalesTable(document.getElementById('sales-search')?.value.toLowerCase().trim()||''); });
    bar.querySelectorAll('.sp-num').forEach(b =>
        b.addEventListener('click', () => { salesCurrentPage = Number(b.dataset.p); renderSalesTable(document.getElementById('sales-search')?.value.toLowerCase().trim()||''); })
    );
}

function updateKPIs(orders) {
    const xf = (n) => (window.MisterCasherCurrency ? MisterCasherCurrency.format(n) : Number(n).toFixed(2) + ' ر.س');
    let totalRev = 0;
    let cashRev = 0;
    let cardRev = 0;
    let orderCount = orders.length;

    console.log('\n💰 [Sales KPIs] Processing', orderCount, 'orders...');
    console.log('[Sales KPIs] Payment methods found:', [...new Set(orders.map(o => o.paymentMethod))]);

    orders.forEach(o => {
        totalRev += o.total;
        
        // Handle split payment correctly
        const pm = (o.paymentMethod || '').trim();
        
        if (pm === 'مجزأ') {
            // For split payment, use the stored split values
            const cashPart = Number(o.splitCash) || 0;
            const netPart = Number(o.splitNetwork) || 0;
            
            console.log(`[Sales] Split order ${o.orderId}: total=${o.total}, cash=${cashPart}, net=${netPart}`);
            
            // ALWAYS use split values for split payment orders
            cashRev += cashPart;
            cardRev += netPart;
            
            if (netPart < 0) {
                console.error(`[Sales] ERROR: ${o.orderId} has NEGATIVE network ${netPart}!`);
            }
        } else if (pm.includes('كاش') || pm === 'cash') {
            cashRev += o.total;
        } else if (pm.includes('شبكة') || pm === 'network' || pm.includes('بطاقة') || pm === 'card') {
            cardRev += o.total;
            console.log(`[Sales] Network order ${o.orderId}: total=${o.total}`);
        } else if (pm === 'توصيل') {
            // HungerStation - check if paid
            if (o.hsPaymentStatus === 'paid' && o.hsPaymentMethod) {
                if (o.hsPaymentMethod.includes('كاش') || o.hsPaymentMethod === 'cash') {
                    cashRev += o.total;
                } else {
                    cardRev += o.total;
                    console.log(`[Sales] HS paid order ${o.orderId}: total=${o.total}, method=${o.hsPaymentMethod}`);
                }
            } else {
                console.log(`[Sales] HS unpaid order ${o.orderId}: EXCLUDED from totals`);
            }
        } else {
            // Default: treat as network for safety
            console.warn(`[Sales] Order ${o.orderId}: Unknown payment method "${pm}", treating as network`);
            cardRev += o.total;
        }
    });

    console.log('\n💰 Sales KPIs Calculated:');
    console.log(`   - Total Revenue: ${totalRev.toFixed(2)} ر.س`);
    console.log(`   - Cash Revenue: ${cashRev.toFixed(2)} ر.س`);
    console.log(`   - Card Revenue: ${cardRev.toFixed(2)} ر.س`);
    console.log(`   - Order Count: ${orderCount}`);
    console.log(`   - Check: ${cashRev.toFixed(2)} + ${cardRev.toFixed(2)} = ${(cashRev + cardRev).toFixed(2)}`);
    
    const el = (id) => document.getElementById(id);
    if(el('kpi-total-revenue')) el('kpi-total-revenue').innerText = xf(totalRev);
    if(el('kpi-total-orders')) el('kpi-total-orders').innerText = orderCount;
    if(el('kpi-cash-revenue')) el('kpi-cash-revenue').innerText = xf(cashRev);
    if(el('kpi-card-revenue')) el('kpi-card-revenue').innerText = xf(cardRev);

    // Update table footer (for print and view)
    const tfoot = document.getElementById('sales-tfoot');
    if(tfoot) {
        if(orders.length > 0) {
            tfoot.style.display = 'table-footer-group';
            tfoot.innerHTML = `
                <tr style="background: rgba(245, 158, 11, 0.1); border-top: 2px solid rgba(245, 158, 11, 0.3);">
                    <td colspan="3" style="text-align:right; font-weight:800; font-size:15px; color:var(--text-primary);">الإجمالي الكلي (كاش + شبكة)</td>
                    <td colspan="4" style="text-align:right; font-weight:700; color:var(--text-secondary);">عدد الطلبات: ${orderCount}</td>
                    <td style="font-weight:900; font-size:16px; color:var(--accent-orange);">${xf(totalRev)}</td>
                    <td class="no-print"></td>
                </tr>
                <tr style="background: rgba(15, 23, 42, 0.4);">
                    <td colspan="8" style="text-align:center; padding: 12px; font-weight:700;">
                        <span style="color:var(--accent-green); margin-left: 20px;">كاش: ${xf(cashRev)}</span>
                        <span style="color:var(--accent-blue);">شبكة/بطاقة: ${xf(cardRev)}</span>
                    </td>
                    <td class="no-print"></td>
                </tr>
            `;
        } else {
            tfoot.style.display = 'none';
        }
    }
}

// === تحسين التصدير والطباعة (PDF) للمبيعات لكي تتم طباعة كل السجلات دفعة واحدة ===
window.addEventListener('beforeprint', () => {
    const tbody = document.getElementById('sales-tbody');
    if (!tbody || !filteredSalesOrders) return;
    
    let bar = document.getElementById('sales-pagination-bar');
    if(bar) bar.style.display = 'none';

    const xf = (n) => (window.MisterCasherCurrency ? MisterCasherCurrency.format(n) : Number(n).toFixed(2) + ' ر.س');
    const fragment = document.createDocumentFragment();

    filteredSalesOrders.forEach(order => {
        let typeClass = (order.type||'').includes('محلي') ? 'badge-dinein' : 'badge-takeout';
        const itemsCount = Array.isArray(order.items) ? order.items.length : (order.itemsCount || 0);

        let itemsDetails = '-';
        if (Array.isArray(order.items) && order.items.length > 0) {
            itemsDetails = order.items.map(item => {
                const name = item.name || item.productName || item.itemName || '-';
                const qty = item.qty || item.quantity || 1;
                return `${name} x${qty}`;
            }).join('، ');
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${order.orderId}</strong></td>
            <td style="font-size:12px;">${order.date || order.dateStr || ''}</td>
            <td>${order.type || ''}</td>
            <td>${order.paymentMethod || ''}</td>
            <td>${itemsCount} أصناف</td>
            <td style="font-size: 11px;">${itemsDetails}</td>
            <td style="font-size: 11px;">${order.cashier || '-'}</td>
            <td style="font-weight:800;">${xf(order.total)}</td>
            <td class="no-print"></td>
        `;
        fragment.appendChild(tr);
    });
    
    tbody.innerHTML = '';
    tbody.appendChild(fragment);
});

window.addEventListener('afterprint', () => {
    let bar = document.getElementById('sales-pagination-bar');
    if(bar) bar.style.display = 'flex';
    renderSalesTable(document.getElementById('sales-search')?.value.toLowerCase().trim()||'');
});



async function clearSales() {
    if(confirm('هل أنت متأكد من مسح جميع سجلات المبيعات الحالية؟ لا يمكن التراجع!')) {
        try {
            const db = await window.dbReadSlice(['orders']);
            db.orders = [];
            await window.dbWrite(db);
        } catch(e) { console.error(e); }
        await loadSales();
    }
}

// Fix negative balances button
async function fixNegativeBalances() {
    alert('جاري فحص البيانات...');
    
    try {
        // استخدم 'orders' بدلاً من 'orders_all' لتفادي تجميد النظام عند فتح الصفحة
        const db = await window.dbReadSlice(['orders']);
        const allOrders = (db && db.orders) ? db.orders : [];
        
        // Show ALL orders with dates
        let todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        let todayOrders = [];
        let otherOrders = [];
        
        allOrders.forEach(o => {
            const ts = o.timestamp || 0;
            const date = new Date(ts);
            
            let info = `${o.orderId} | ${o.paymentMethod} | ${o.total.toFixed(2)} ر.س | ${date.toLocaleString('ar-SA')}`;
            
            // Add split payment details
            if (o.paymentMethod === 'مجزأ') {
                info += ` [كاش: ${(o.splitCash || 0).toFixed(2)} | شبكة: ${(o.splitNetwork || 0).toFixed(2)}]`;
            }
            
            // Add HungerStation payment status
            if (o.paymentMethod === 'توصيل') {
                const payStatus = o.hsPaymentStatus || 'unknown';
                const payMethod = o.hsPaymentMethod || 'not set';
                info += ` [الحالة: ${payStatus} | الطريقة: ${payMethod}]`;
            }
            
            if (ts >= todayStart.getTime()) {
                todayOrders.push(info);
            } else {
                otherOrders.push(info);
            }
        });
        
        let msg = `📊 إجمالي الطلبات: ${allOrders.length}\n`;
        msg += `━━━━━━━━━━━━━━━\n\n`;
        msg += `✅ طلبات اليوم (${todayOrders.length}):\n`;
        msg += todayOrders.join('\n');
        
        if (otherOrders.length > 0) {
            msg += `\n\n📅 طلبات أخرى (${otherOrders.length}):\n`;
            msg += otherOrders.slice(0, 5).join('\n');
            if (otherOrders.length > 5) {
                msg += `\n... و ${otherOrders.length - 5} طلب آخر`;
            }
        }
        
        alert(msg);
    } catch (error) {
        console.error('Error:', error);
        alert('❌ حدث خطأ: ' + error.message);
    }
}

// Open invoices folder
function openInvoicesFolder() {
    const { ipcRenderer } = require('electron');
    const path = require('path');
    const invoicesDir = path.join(__dirname, 'invoices');
    
    // Check if directory exists
    const fs = require('fs');
    if (!fs.existsSync(invoicesDir)) {
        alert('لا توجد فواتير محفوظة بعد. قم بإتمام عملية بيع أولاً.');
        return;
    }
    
    // Open folder in file explorer
    ipcRenderer.invoke('open-folder', invoicesDir).catch(err => {
        console.error('Failed to open folder:', err);
        // Fallback: show message with folder path
        alert(`مجلد الفواتير موجود في:\n${invoicesDir}`);
    });
}

// View order details in modal
async function viewOrderDetails(orderId) {
    try {
        const { ipcRenderer } = require('electron');
        const orders = await ipcRenderer.invoke('db-get-orders-all');
        const order = orders.find(o => o.orderId === orderId);
        
        if (!order) {
            alert('لم يتم العثور على الطلب!');
            return;
        }
        
        // Build items list
        const items = order.items || [];
        console.log('[viewOrderDetails] Order:', order.orderId);
        console.log('[viewOrderDetails] Items:', items);
        console.log('[viewOrderDetails] Items length:', items.length);
        
        let itemsHtml = '';
        if (items.length === 0) {
            itemsHtml = '<tr><td colspan="4" style="padding: 20px; text-align: center; color: #9ca3af;">لا توجد أصناف</td></tr>';
        } else {
            items.forEach((item, index) => {
                console.log(`[viewOrderDetails] Item ${index}:`, item);
                const itemName = item.name || item.productName || item.itemName || '-';
                const itemQty = item.qty || item.quantity || 0;
                const itemPrice = item.price || item.unitPrice || 0;
                const itemTotal = itemQty * itemPrice;
                
                itemsHtml += `
                    <tr>
                        <td style="padding: 12px 8px; border-bottom: 1px solid var(--border-color, #e5e7eb);">${itemName}</td>
                        <td style="padding: 12px 8px; border-bottom: 1px solid var(--border-color, #e5e7eb); text-align: center; font-weight: 600;">${itemQty}</td>
                        <td style="padding: 12px 8px; border-bottom: 1px solid var(--border-color, #e5e7eb); text-align: left;">${formatCurrency(itemPrice)}</td>
                        <td style="padding: 12px 8px; border-bottom: 1px solid var(--border-color, #e5e7eb); text-align: left; font-weight: 600; color: var(--accent-green, #10b981);">${formatCurrency(itemTotal)}</td>
                    </tr>
                `;
            });
        }
        
        // Calculate totals
        const subtotal = items.reduce((sum, item) => sum + ((item.qty || 0) * (item.price || 0)), 0);
        const discount = order.discount || 0;
        const total = order.total || subtotal;
        
        // Check if dark theme
        const isDark = document.body.classList.contains('dark-theme');
        
        // Create modal
        const modalHtml = `
            <div id="order-details-modal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px;">
                <div style="background: ${isDark ? '#1f2937' : 'white'}; border-radius: 16px; max-width: 700px; width: 100%; max-height: 85vh; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.5); display: flex; flex-direction: column;">
                    <!-- Header -->
                    <div style="padding: 24px; border-bottom: 2px solid ${isDark ? '#374151' : '#f3f4f6'}; display: flex; justify-content: space-between; align-items: center;">
                        <h2 style="margin: 0; color: ${isDark ? '#f9fafb' : '#111827'}; font-size: 24px; font-weight: 700;">تفاصيل الطلب</h2>
                        <button onclick="closeOrderDetailsModal()" style="background: ${isDark ? '#374151' : '#f3f4f6'}; border: none; width: 36px; height: 36px; border-radius: 50%; cursor: pointer; color: ${isDark ? '#d1d5db' : '#6b7280'}; font-size: 20px; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" onmouseover="this.style.background='#ef4444'; this.style.color='white'" onmouseout="this.style.background='${isDark ? '#374151' : '#f3f4f6'}'; this.style.color='${isDark ? '#d1d5db' : '#6b7280'}'">&times;</button>
                    </div>
                    
                    <!-- Content (Scrollable) -->
                    <div style="padding: 24px; overflow-y: auto; flex: 1;">
                        <!-- Order Info Grid -->
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
                            <div style="background: ${isDark ? '#111827' : '#f9fafb'}; padding: 16px; border-radius: 12px; border: 1px solid ${isDark ? '#374151' : '#e5e7eb'};">
                                <div style="font-size: 12px; color: ${isDark ? '#9ca3af' : '#6b7280'}; margin-bottom: 6px; font-weight: 500;">رقم الطلب</div>
                                <div style="font-weight: 700; color: ${isDark ? '#f9fafb' : '#111827'}; font-size: 16px;">${order.orderId || '-'}</div>
                            </div>
                            <div style="background: ${isDark ? '#111827' : '#f9fafb'}; padding: 16px; border-radius: 12px; border: 1px solid ${isDark ? '#374151' : '#e5e7eb'};">
                                <div style="font-size: 12px; color: ${isDark ? '#9ca3af' : '#6b7280'}; margin-bottom: 6px; font-weight: 500;">التاريخ والوقت</div>
                                <div style="font-weight: 600; color: ${isDark ? '#e5e7eb' : '#374151'}; font-size: 14px;">${order.date || new Date(order.timestamp || Date.now()).toLocaleString('ar-SA')}</div>
                            </div>
                            <div style="background: ${isDark ? '#111827' : '#f9fafb'}; padding: 16px; border-radius: 12px; border: 1px solid ${isDark ? '#374151' : '#e5e7eb'};">
                                <div style="font-size: 12px; color: ${isDark ? '#9ca3af' : '#6b7280'}; margin-bottom: 6px; font-weight: 500;">نوع الطلب</div>
                                <div style="font-weight: 600; color: ${isDark ? '#e5e7eb' : '#374151'}; font-size: 14px;">${order.type || 'محلي'}</div>
                            </div>
                            <div style="background: ${isDark ? '#111827' : '#f9fafb'}; padding: 16px; border-radius: 12px; border: 1px solid ${isDark ? '#374151' : '#e5e7eb'};">
                                <div style="font-size: 12px; color: ${isDark ? '#9ca3af' : '#6b7280'}; margin-bottom: 6px; font-weight: 500;">طريقة الدفع</div>
                                <div style="font-weight: 600; color: ${isDark ? '#e5e7eb' : '#374151'}; font-size: 14px;">${order.paymentMethod || 'نقدي'}</div>
                            </div>
                        </div>
                        
                        <!-- Items Table -->
                        <h3 style="margin: 0 0 16px 0; color: ${isDark ? '#f9fafb' : '#111827'}; font-size: 18px; font-weight: 700;">الأصناف (${items.length})</h3>
                        <div style="background: ${isDark ? '#111827' : '#ffffff'}; border-radius: 12px; border: 1px solid ${isDark ? '#374151' : '#e5e7eb'}; overflow: hidden; margin-bottom: 24px;">
                            <table style="width: 100%; border-collapse: collapse;">
                                <thead>
                                    <tr style="background: ${isDark ? '#1f2937' : '#f9fafb'}; border-bottom: 2px solid ${isDark ? '#374151' : '#e5e7eb'};">
                                        <th style="padding: 14px 12px; text-align: right; font-size: 13px; color: ${isDark ? '#9ca3af' : '#6b7280'}; font-weight: 600;">الصنف</th>
                                        <th style="padding: 14px 12px; text-align: center; font-size: 13px; color: ${isDark ? '#9ca3af' : '#6b7280'}; font-weight: 600; width: 80px;">الكمية</th>
                                        <th style="padding: 14px 12px; text-align: left; font-size: 13px; color: ${isDark ? '#9ca3af' : '#6b7280'}; font-weight: 600; width: 120px;">السعر</th>
                                        <th style="padding: 14px 12px; text-align: left; font-size: 13px; color: ${isDark ? '#9ca3af' : '#6b7280'}; font-weight: 600; width: 120px;">الإجمالي</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${itemsHtml}
                                </tbody>
                            </table>
                        </div>
                        
                        <!-- Totals Section -->
                        <div style="background: ${isDark ? '#111827' : '#f9fafb'}; border-radius: 12px; border: 1px solid ${isDark ? '#374151' : '#e5e7eb'}; padding: 20px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid ${isDark ? '#374151' : '#e5e7eb'};">
                                <span style="color: ${isDark ? '#9ca3af' : '#6b7280'}; font-weight: 500;">المجموع الفرعي:</span>
                                <span style="font-weight: 600; color: ${isDark ? '#e5e7eb' : '#374151'}; font-size: 16px;">${formatCurrency(subtotal)}</span>
                            </div>
                            ${discount > 0 ? `
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid ${isDark ? '#374151' : '#e5e7eb'};">
                                <span style="color: #ef4444; font-weight: 500;">الخصم:</span>
                                <span style="font-weight: 600; color: #ef4444; font-size: 16px;">- ${formatCurrency(discount)}</span>
                            </div>
                            ` : ''}
                            <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 2px solid ${isDark ? '#374151' : '#e5e7eb'};">
                                <span style="color: ${isDark ? '#f9fafb' : '#111827'}; font-size: 18px; font-weight: 700;">الإجمالي النهائي:</span>
                                <span style="color: #10b981; font-size: 24px; font-weight: 800;">${formatCurrency(total)}</span>
                            </div>
                        </div>
                        
                        ${order.notes ? `
                        <div style="margin-top: 20px; padding: 16px; background: ${isDark ? '#422006' : '#fef3c7'}; border-radius: 12px; border-right: 4px solid #f59e0b;">
                            <div style="font-size: 12px; color: ${isDark ? '#fbbf24' : '#92400e'}; margin-bottom: 6px; font-weight: 600;">ملاحظات:</div>
                            <div style="color: ${isDark ? '#fef3c7' : '#78350f'}; font-weight: 500; line-height: 1.6;">${order.notes}</div>
                        </div>
                        ` : ''}
                    </div>
                    
                    <!-- Footer -->
                    <div style="padding: 20px 24px; border-top: 2px solid ${isDark ? '#374151' : '#f3f4f6'}; display: flex; gap: 12px; justify-content: flex-end; background: ${isDark ? '#111827' : '#ffffff'};">
                        <button onclick="closeOrderDetailsModal()" style="padding: 12px 24px; background: ${isDark ? '#374151' : '#f3f4f6'}; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; color: ${isDark ? '#e5e7eb' : '#374151'}; font-size: 14px; transition: all 0.2s;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">إغلاق</button>
                        <button onclick="reprintOrder('${order.orderId}'); closeOrderDetailsModal();" style="padding: 12px 24px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); border: none; border-radius: 8px; cursor: pointer; font-weight: 600; color: white; font-size: 14px; display: flex; align-items: center; gap: 8px; transition: all 0.2s; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(59, 130, 246, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(59, 130, 246, 0.3)'"><i class="ph ph-printer"></i> طباعة الفاتورة</button>
                    </div>
                </div>
            </div>
        `;
        
        // Add modal to body
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        document.body.appendChild(modalContainer);
        window.syncModalBodyScroll();
        
        // Close on backdrop click
        modalContainer.querySelector('#order-details-modal').addEventListener('click', (e) => {
            if (e.target.id === 'order-details-modal') {
                closeOrderDetailsModal();
            }
        });
        
        // Close on Escape key
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeOrderDetailsModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
        
    } catch(e) {
        console.error('Failed to view order details:', e);
        console.error('Error stack:', e.stack);
        alert('حدث خطأ أثناء عرض تفاصيل الطلب: ' + e.message);
    }
}

function closeOrderDetailsModal() {
    const modal = document.getElementById('order-details-modal');
    if (modal) {
        modal.parentElement.remove();
        window.syncModalBodyScroll();
    }
}

// Reprint order
async function reprintOrder(orderId) {
    try {
        // Load thermal receipt module
        const thermalReceipt = require('./thermal-receipt-updated.js');
        const printCustomerReceipt = thermalReceipt.printCustomerReceipt;
        
        // Get orders from database
        const { ipcRenderer } = require('electron');
        const orders = await ipcRenderer.invoke('db-get-orders-all');
        const order = orders.find(o => o.orderId === orderId);
        
        if (!order) {
            alert('لم يتم العثور على الطلب!');
            return;
        }
        
        if (!confirm(`هل تريد إعادة طباعة فاتورة ${orderId}؟`)) {
            return;
        }
        
        // Calculate totals
        const items = order.items || [];
        const subtotal = items.reduce((sum, item) => sum + ((item.qty || 0) * (item.price || 0)), 0);
        const discount = order.discount || 0;
        
        // Get tax rate from settings
        let taxRate = 0.15; // default 15%
        try {
            const s = JSON.parse(localStorage.getItem('restaurant_settings') || '{}');
            const rate = parseFloat(s.taxRate);
            taxRate = isNaN(rate) ? 0.15 : rate / 100;
        } catch(e) {}
        
        const taxAmount = (subtotal - discount) * taxRate;
        const total = order.total || (subtotal - discount + taxAmount);
        
        // Get payment method
        const paymentMethod = order.paymentMethod || 'نقدي';
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
            orderType: order.type || 'محلي',
            tableText: order.table ? 'لـ: ' + order.table : '',
            orderId: '#' + (order.orderId || ''),
            date: order.date || new Date(order.timestamp || Date.now()).toLocaleString('ar-SA'),
            itemsHtml: itemsHtml,
            subtotalText: formatCurrency(subtotal),
            totalText: formatCurrency(total),
            discountText: discount > 0 ? formatCurrency(discount) : formatCurrency(0),
            taxLabel: `قيمة الضريبة المضافة ${Math.round(taxRate * 100 * 100) / 100}%:`,
            taxText: formatCurrency(taxAmount),
            paymentText: paymentLabel,
            qrSrc: '',
            notesText: order.notes || ''
        };
        
        console.log('🖨️  Reprinting thermal receipt for order:', order.orderId);
        
        // Print using the same function as POS
        await printCustomerReceipt(receiptSnap);
        
    } catch(e) {
        console.error('❌ Reprint failed:', e);
        alert('حدث خطأ أثناء إعادة الطباعة: ' + e.message);
    }
}

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

function exportSalesPDF() {
    let restName = "نظام_مستر_كاشير";
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
        window.exportPageToPDF('مبيعات_' + restName + '_' + dateStr + '.pdf');
    } else {
        window.print();
    }
}
