document.addEventListener('DOMContentLoaded', async () => {

    function curPlain(n) {
        return window.MisterCasherCurrency ? MisterCasherCurrency.format(n) : Number(n).toFixed(2) + ' ر.س';
    }
    function curNum(n) {
        return window.MisterCasherCurrency ? MisterCasherCurrency.formatNumber(n) : Number(n).toFixed(2);
    }
    function curSym() {
        return window.MisterCasherCurrency ? MisterCasherCurrency.getConfig().symbol : 'ر.س';
    }
    function splitOrderAmountsGlobal(o) {
        const pm = String(o?.paymentMethod || '').trim();
        const total = Number(o?.total) || 0;
        const isHS = o?.hungerStation === true || o?.orderType === 'توصيل';
        const isHSPaid = o?.hsPaymentStatus === 'paid';

        let deliveryCompany = o?.deliveryCompany || 'توصيل';
        if (o?.hungerStation === true && !o?.deliveryCompany) deliveryCompany = 'هنقرستيشن';

        // Delivery unpaid orders should NOT affect drawer balance
        if (isHS && !isHSPaid) {
            let db = {}; db[deliveryCompany] = total;
            return { cash: 0, network: 0, hungerStation: total, deliveryBreakdown: db };
        }
        
        // Delivery paid - check payment method
        if (isHS && isHSPaid) {
            const hsMethod = (o?.hsPaymentMethod || '').trim();
            if (hsMethod.includes('كاش') || hsMethod === 'cash') {
                return { cash: total, network: 0, hungerStation: 0, deliveryBreakdown: {} };
            } else {
                return { cash: 0, network: total, hungerStation: 0, deliveryBreakdown: {} };
            }
        }
        
        if (pm === 'مجزأ') {
            const c = Number(o?.splitCash) || 0;
            const n = Number(o?.splitNetwork) || 0;
            
            // Validation: if split values are invalid, use total as cash
            if (c < 0 || n < 0) {
                console.warn(`[Dashboard Global] Order ${o?.orderId}: Invalid split values (cash=${c}, net=${n}), using total as cash`);
                return { cash: total, network: 0, hungerStation: 0, deliveryBreakdown: {} };
            }
            
            if (c || n) return { cash: c, network: n, hungerStation: 0, deliveryBreakdown: {} };
            return { cash: total, network: 0, hungerStation: 0, deliveryBreakdown: {} };
        }
        if (pm.includes('كاش') || pm === 'cash') return { cash: total, network: 0, hungerStation: 0, deliveryBreakdown: {} };
        return { cash: 0, network: total, hungerStation: 0, deliveryBreakdown: {} };
    }
    function splitReturnAmountsGlobal(r) {
        const pm = String(r?.method || '').trim();
        const amount = Number(r?.amount) || 0;
        if (pm === 'مجزأ') {
            const c = Number(r?.splitCash) || 0;
            const n = Number(r?.splitNetwork) || 0;
            if (c || n) return { cash: c, network: n };
            return { cash: 0, network: amount };
        }
        if (pm.includes('كاش') || pm === 'cash') return { cash: amount, network: 0 };
        return { cash: 0, network: amount };
    }

    /** مصروفات الكاش فقط — مصروفات الشبكة/البنك لا تُخصم من الدرج */
    function sumCashDrawerExpenses(expenseList) {
        let total = 0;
        (expenseList || []).forEach((ex) => {
            const pm = String(ex.pMethod || 'cash').trim();
            if (pm !== 'bank' && pm !== 'network' && pm !== 'شبكة') {
                total += Number(ex.amount) || 0;
            }
        });
        return total;
    }

    const { getReceiptFooterLine, escapeHtmlPrint } = require('./thermal-receipt-updated.js');

    const kpiValues = document.querySelectorAll('.kpi-card .kpi-value');
    if(!kpiValues || kpiValues.length < 6) return; // Not on index page

    // ⚡ عرض آخر قيم محفوظة فوراً من localStorage قبل جلب البيانات
    // هذا يمنع ظهور ... ويعرض الأرقام الأخيرة فوراً على الأجهزة الضعيفة
    try {
        const snap = JSON.parse(localStorage.getItem('_dashboard_kpi_snap') || 'null');
        if (snap && Array.isArray(snap.kpis) && snap.kpis.length >= 6) {
            snap.kpis.forEach((html, i) => { if(kpiValues[i]) kpiValues[i].innerHTML = html; });
        }
        // Restore dynamic cards from snapshot
        if (snap && snap.deliveryHtml) {
            const container = document.getElementById('dynamic-delivery-kpi-container');
            if (container) container.innerHTML = snap.deliveryHtml;
        }
        // Restore recent orders and top items
        if (snap && snap.recentOrdersHtml) {
            const tbody = document.querySelector('.recent-orders tbody');
            if(tbody) tbody.innerHTML = snap.recentOrdersHtml;
        }
        if (snap && snap.topItemsHtml) {
            const itemsContainer = document.querySelector('.items-list');
            if(itemsContainer) itemsContainer.innerHTML = snap.topItemsHtml;
        }
    } catch(e) {}

    let dashboardChart = null;
    /** الفترة المعروضة حالياً — تُحدَّث عند تغيير أزرار اليوم/الأسبوع ليعاد التحميل بعد المزامنة */
    let currentDashboardPeriod = 'today';
    async function loadDashboardData(period = 'today') {
        let db;
        if (typeof window.dbReadSlice === 'function') {
            db = await window.dbReadSlice(['orders', 'returns', 'hrExpenses', 'expenses', 'deliveryCompanies', 'inventory']);
        } else {
            db = await window.dbReadArchive();
        }
        let orders = db.orders || [];
        let returns = db.returns || [];
        
        // Combine all expenses into one central expense array to be subtracted during shift close
        let hrExpenses = (db.hrExpenses || []).concat(db.expenses || []);

        const lastZReport = parseInt(localStorage.getItem('last_z_report_time')) || 0;

        // Apply global date filter and Z-report session cutoff
        if(window.isDateInPeriod) {
            orders = orders.filter(o => {
                const t = o.timestamp || o.createdAt || o.dateStr || o.date || 0;
                return o.status !== 'returned' &&
                       window.isDateInPeriod(t, period) &&
                       (period !== 'today' || t >= lastZReport);
            });
            returns = returns.filter(r => {
                const t = r.timestamp || r.date || 0;
                return window.isDateInPeriod(t, period) &&
                       (period !== 'today' || t >= lastZReport);
            });
            hrExpenses = hrExpenses.filter(h => {
                const t = h.timestamp || h.createdAt || h.date || 0;
                return window.isDateInPeriod(t, period) &&
                       (period !== 'today' || t >= lastZReport);
            });
        }

        // تم إعادة فلتر الوردية لكي تتصفر بيانات لوحة القيادة عند إقفال اليوم/الوردية
        // وتصحيح حساب رصيد الدرج لتجنب التكرار.

        // --- 1. CALCULATE KPIs ---
    let dailySales = 0;
    let cashSales = 0;
    let networkSales = 0;
    let totalTax = 0;
    let totalItemsNum = 0;
    let totalReturnsAmt = 0;

    // الحصول على نسبة الضريبة من الإعدادات
    let taxRateStr = 15;
    const sysSet = localStorage.getItem('restaurant_settings');
    if(sysSet) {
        try {
            const data = JSON.parse(sysSet);
            if(data.taxRate !== undefined) taxRateStr = parseFloat(data.taxRate);
        } catch(e){}
    }
    const TAX_RATE = taxRateStr / 100;

    // Item sales tracking for Top Selling
    let itemSalesMap = {}; 

    function splitOrderAmounts(o) {
        const pm = String(o.paymentMethod || '').trim();
        const total = Number(o.total) || 0;
        const isHS = o.hungerStation === true || o.orderType === 'توصيل';
        const isHSPaid = o.hsPaymentStatus === 'paid';

        let deliveryCompany = o.deliveryCompany || 'توصيل';
        if (o.hungerStation === true && !o.deliveryCompany) deliveryCompany = 'هنقرستيشن';

        // Delivery unpaid orders should NOT affect drawer balance
        if (isHS && !isHSPaid) {
            let db = {}; db[deliveryCompany] = total;
            return { cash: 0, network: 0, hungerStation: total, deliveryBreakdown: db };
        }
        
        // Delivery paid - check payment method
        if (isHS && isHSPaid) {
            const hsMethod = (o.hsPaymentMethod || '').trim();
            if (hsMethod.includes('كاش') || hsMethod === 'cash') {
                return { cash: total, network: 0, hungerStation: 0, deliveryBreakdown: {} };
            } else {
                return { cash: 0, network: total, hungerStation: 0, deliveryBreakdown: {} };
            }
        }
        
        if (pm === 'مجزأ') {
            const c = Number(o.splitCash) || 0;
            const n = Number(o.splitNetwork) || 0;
            
            // Validation: if split values are invalid, use total as cash
            if (c < 0 || n < 0) {
                console.warn(`[Dashboard] Order ${o.orderId}: Invalid split values (cash=${c}, net=${n}), using total as cash`);
                return { cash: total, network: 0, hungerStation: 0, deliveryBreakdown: {} };
            }
            
            if (c || n) return { cash: c, network: n, hungerStation: 0, deliveryBreakdown: {} };
            return { cash: total, network: 0, hungerStation: 0, deliveryBreakdown: {} };
        }
        if (pm.includes('كاش') || pm === 'cash') return { cash: total, network: 0, hungerStation: 0, deliveryBreakdown: {} };
        return { cash: 0, network: total, hungerStation: 0, deliveryBreakdown: {} };
    }
    function splitReturnAmounts(r) {
        const pm = String(r.method || '').trim();
        const amount = Number(r.amount) || 0;
        if (pm === 'مجزأ') {
            const c = Number(r.splitCash) || 0;
            const n = Number(r.splitNetwork) || 0;
            if (c || n) return { cash: c, network: n };
            return { cash: 0, network: amount };
        }
        if (pm.includes('كاش') || pm === 'cash') return { cash: amount, network: 0 };
        return { cash: 0, network: amount };
    }

    orders.forEach(o => {
        dailySales += o.total;
        
        // حساب الضريبة المشمولة من الإجمالي = الإجمالي - (الإجمالي / (1 + النسبة))
        let orderTax = o.total - (o.total / (1 + TAX_RATE));
        totalTax += orderTax;

        const pay = splitOrderAmounts(o);
        cashSales += pay.cash;
        networkSales += pay.network;

        if(Array.isArray(o.items)) {
            o.items.forEach(itm => {
                totalItemsNum += itm.qty;
                if(!itemSalesMap[itm.name]) {
                    itemSalesMap[itm.name] = { qty: 0, revenue: 0, category: 'موجبات', image: itm.image || itm.imgSrc || 'placeholder.svg' };
                }
                itemSalesMap[itm.name].qty += itm.qty;
                itemSalesMap[itm.name].revenue += (itm.price * itm.qty);
            });
        }
    });

    // Returns are only tracked for reporting (not subtracted since orders are already excluded)
    returns.forEach(r => {
        totalReturnsAmt += r.amount;
    });

    let totalExp = 0;
    hrExpenses.forEach(h => totalExp += Number(h.amount) || 0);

    // حساب إحصائيات التوصيل لليوم كاملاً (لعرضها في البطاقات)
    let dailyDeliveryStats = {}; 
    orders.forEach(o => {
        const pay = splitOrderAmounts(o);
        if (pay.hungerStation > 0 && pay.deliveryBreakdown) {
            for (const [comp, amt] of Object.entries(pay.deliveryBreakdown)) {
                if (!dailyDeliveryStats[comp]) dailyDeliveryStats[comp] = { amount: 0, count: 0 };
                dailyDeliveryStats[comp].amount += amt;
                dailyDeliveryStats[comp].count += 1;
            }
        }
    });

    // Drawer balance: جلسة اليوم الحالية (بعد آخر Z أو إقفال يوم)
    const shiftCashFloat = parseFloat(localStorage.getItem('shift_cash_float')) || 0;
    let shiftOrders;
    let shiftReturns;
    let shiftExpenses;
    if (period === 'today') {
        shiftOrders = orders;
        shiftReturns = returns;
        shiftExpenses = hrExpenses;
    } else {
        shiftOrders = (db.orders || []).filter(o =>
            o.status !== 'returned' &&
            window.isDateInPeriod(o.timestamp || o.dateStr || o.date, 'today') &&
            ((o.timestamp || o.createdAt || 0) >= lastZReport)
        );
        shiftReturns = (db.returns || []).filter(r =>
            window.isDateInPeriod(r.timestamp || r.date, 'today') &&
            ((r.timestamp || 0) >= lastZReport)
        );
        shiftExpenses = ((db.hrExpenses || []).concat(db.expenses || [])).filter(h =>
            window.isDateInPeriod(h.timestamp || h.date, 'today') &&
            ((h.timestamp || new Date(h.date).getTime() || h.createdAt || 0) >= lastZReport)
        );
    }

    let shiftCashSales = 0;
    let deliveryStats = {}; // { 'HungerStation': { amount: 0, count: 0 } }
    
    shiftOrders.forEach(o => {
        const pay = splitOrderAmounts(o);
        shiftCashSales += pay.cash;
        
        if (pay.hungerStation > 0 && pay.deliveryBreakdown) {
            for (const [comp, amt] of Object.entries(pay.deliveryBreakdown)) {
                if (!deliveryStats[comp]) deliveryStats[comp] = { amount: 0, count: 0 };
                deliveryStats[comp].amount += amt;
                deliveryStats[comp].count += 1;
            }
        }
    });
    
    // Compatibility for other parts of the code that might use window.__dashboardData
    let shiftHungerStationUnpaid = 0;
    let shiftDeliveryBreakdown = {};
    for (const [c, s] of Object.entries(deliveryStats)) {
        shiftHungerStationUnpaid += s.amount;
        shiftDeliveryBreakdown[c] = s.amount;
    }
    // NOTE: Returns are NOT subtracted here because returned orders are already excluded from shiftOrders

    let shiftTotalExp = 0;
    // Only subtract CASH expenses from drawer — bank/network transfers do NOT touch the cash drawer
    shiftExpenses.forEach(h => {
        const pm = String(h.pMethod || 'cash').trim();
        if (pm !== 'bank' && pm !== 'network' && pm !== 'شبكة') {
            shiftTotalExp += Number(h.amount) || 0;
        }
    });

    // Drawer balance: opening float + cash sales - cash-only expenses
    const drawerBalance = shiftCashFloat + shiftCashSales - shiftTotalExp;

    window.__dashboardData = { dailySales, cashSales, networkSales, totalTax, totalReturnsAmt, totalExp, shiftCashFloat, drawerBalance, shiftHungerStationUnpaid, shiftDeliveryBreakdown };

    document.querySelectorAll('.kpi-cards .kpi-card').forEach((card, idx) => {
        const titleEl = card.querySelector('.kpi-title');
        if (!titleEl) return;
        const defaults = ['مبيعات اليوم', 'الطلبات المنجزة', 'نواقص المخزن', 'المصروفات (الخوارج)', 'الرصيد في الدرج', 'رصيد الشبكة'];
        if (idx < 6 && defaults[idx]) {
            titleEl.textContent = defaults[idx];
        }
    });

    // Apply to UI
    kpiValues[0].innerHTML = `${curNum(dailySales)}<span class="currency">${curSym()}</span>`;
    kpiValues[1].innerHTML = `${orders.length} <span class="text-sm">طلب</span>`;
    const invList = db.inventory || [];
    const lowStockCount = invList.filter(
        (it) => (Number(it.qty) || 0) <= (Number(it.minQty) || 0)
    ).length;

    kpiValues[2].innerHTML = `${lowStockCount} <span class="text-sm">صنف</span>`; 
    if(lowStockCount > 0) {
        kpiValues[2].style.color = 'var(--accent-orange)';
        kpiValues[2].style.textShadow = '0 0 10px rgba(245, 158, 11, 0.5)';
    }
    kpiValues[3].innerHTML = `${curNum(totalExp)}<span class="currency">${curSym()}</span>`;
    
    const dBalEl = kpiValues[4];
    dBalEl.innerHTML = `${curNum(drawerBalance)}<span class="currency">${curSym()}</span>`;
    if(drawerBalance < 0) dBalEl.style.color = 'var(--accent-red)';

    // Network Balance Card (kpiValues[5])
    const networkEl = kpiValues[5];
    networkEl.innerHTML = `${curNum(networkSales)}<span class="currency">${curSym()}</span>`;
    
    // 6. Dynamic Delivery Company Cards
    const deliveryContainer = document.getElementById('dynamic-delivery-kpi-container');
    if (deliveryContainer) {
        const companies = db.deliveryCompanies || [{ name: 'هنقرستيشن', isActive: true }];
        let cardsHtml = '';
        
        companies.forEach(c => {
            if (c.isActive === false) return; // Skip inactive
            
            const stats = dailyDeliveryStats[c.name] || { amount: 0, count: 0 };
            const amountStr = curNum(stats.amount);
            const countStr = stats.count;
            const glowStyle = stats.amount > 0 ? 'style="color: var(--accent-orange); text-shadow: 0 0 10px rgba(245, 158, 11, 0.5);"' : '';
            
            cardsHtml += `
                <div class="card kpi-card">
                    <div class="kpi-icon orange">
                        <i class="ph-fill ph-motorcycle"></i>
                    </div>
                    <div class="kpi-details">
                        <p class="kpi-title">اجمالي ${c.name}</p>
                        <h3 class="kpi-value" ${glowStyle}>${amountStr}<span class="currency">${curSym()}</span></h3>
                        <div class="kpi-count-sub text-sm" style="color: var(--text-secondary); margin-top: -4px; margin-bottom: 4px; opacity: 0.8;">
                            <i class="ph ph-list-numbers" style="vertical-align: middle; margin-left: 4px;"></i> ${countStr} طلبات
                        </div>
                        <p class="kpi-trend negative"><i class="ph ph-clock"></i> في انتظار التسوية</p>
                    </div>
                </div>
            `;
        });
        deliveryContainer.innerHTML = cardsHtml;
    }

    // ⚡ حفظ لقطة (Snapshot) للأرقام واللوائح في LocalStorage لعرضها فوراً المرة القادمة
    try {
        const tbody = document.querySelector('.recent-orders tbody');
        const itemsContainer = document.querySelector('.items-list');
        const snap = { 
            kpis: Array.from(kpiValues).slice(0,6).map(el => el.innerHTML),
            deliveryHtml: deliveryContainer ? deliveryContainer.innerHTML : '',
            recentOrdersHtml: tbody ? tbody.innerHTML : '',
            topItemsHtml: itemsContainer ? itemsContainer.innerHTML : ''
        };
        localStorage.setItem('_dashboard_kpi_snap', JSON.stringify(snap));
    } catch(e) {}



    // --- 2. POPULATE RECENT ORDERS TABLE (Latest 5) ---
    const tbody = document.querySelector('.recent-orders tbody');
    if(tbody) {
        tbody.innerHTML = '';
        
        let recent = [...orders].reverse().slice(0, 5); // Last 5
        
        if(recent.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-muted)">لا توجد طلبات حديثة اليوم</td></tr>`;
        } else {
            const recentRows = recent.map((o) => {
                const oTypeClass = (o.type && o.type.includes('سفري')) ? 'takeaway' : 'dine-in';
                const oTypeNames = (o.type && o.type.includes('سفري')) ? 'سفري' : 'محلي';
                
                // Munge time
                let tStr = "منذ قليل";
                if(o.createdAt) {
                    let diffMs = Date.now() - o.createdAt;
                    let diffMins = Math.floor(diffMs / 60000);
                    if(diffMins > 60) tStr = `منذ ${Math.floor(diffMins/60)} ساعة`;
                    else if(diffMins > 0) tStr = `منذ ${diffMins} دقيقة`;
                }

                return `
                    <tr>
                        <td><strong>${o.orderId}</strong></td>
                        <td><span class="order-type ${oTypeClass}">${oTypeNames}</span></td>
                        <td>عميل عام</td>
                        <td style="color:var(--text-secondary)">${tStr}</td>
                        <td style="font-weight:bold">${curPlain(o.total)}</td>
                        <td><span class="status completed">مكتمل</span></td>
                        <td><a href="orders.html" class="action-btn" title="عرض في سجل الطلبات" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none;color:inherit;"><i class="ph ph-eye"></i></a></td>
                    </tr>
                `;
            });
            tbody.innerHTML = recentRows.join('');
        }
    }
    // --- 3. POPULATE TOP SELLING ITEMS ---
    const itemsContainer = document.querySelector('.items-list');
    if(itemsContainer) {
        // Convert map to array and sort
        const topItems = Object.keys(itemSalesMap).map(k => {
            return {
                name: k,
                qty: itemSalesMap[k].qty,
                revenue: itemSalesMap[k].revenue,
                cat: itemSalesMap[k].category,
                image: itemSalesMap[k].image
            };
        }).sort((a,b) => b.qty - a.qty).slice(0, 4); // Top 4

        itemsContainer.innerHTML = '';

        if(topItems.length === 0) {
            itemsContainer.innerHTML = `<div style="padding:30px; text-align:center; color:var(--text-muted)">لا توجد مبيعات بعد</div>`;
        } else {
            const topItemsRows = topItems.map((itm) => `
                <div class="item-row">
                    <div style="width:45px; height:45px; border-radius:8px; display:flex; align-items:center; justify-content:center; overflow:hidden; background:rgba(59, 130, 246, 0.1);">
                        <img src="${itm.image}" alt="${itm.name}" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='placeholder.svg'">
                    </div>
                    <div class="item-info">
                        <h4>${itm.name}</h4>
                        <p>الصنف المفضل</p>
                    </div>
                    <div class="item-sales">
                        <span class="sales-count">${itm.qty} طلب</span>
                        <span class="sales-revenue">${curPlain(itm.revenue)}</span>
                    </div>
                </div>
                `);
            itemsContainer.innerHTML = topItemsRows.join('');
        }
    }


    // --- 4. RENDER CHART (مؤجّل على الأجهزة الضعيفة — الأرقام تظهر فوراً) ---
    function renderDashboardChart() {
        const ctxCanvas = document.getElementById('salesChart');
        if (!ctxCanvas || typeof Chart === 'undefined') return;
        const ctx = ctxCanvas.getContext('2d');
        const fakeData = [
            dailySales * 0.4, dailySales * 0.7, dailySales * 0.5,
            dailySales * 0.9, dailySales * 0.6, dailySales * 1.1, dailySales,
        ];
        const isLight = document.body.classList.contains('light-theme') || document.documentElement.getAttribute('data-theme') === 'light';
        const gridColor = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
        const ticksColor = isLight ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';

        if (dashboardChart) dashboardChart.destroy();
        dashboardChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'اليوم'],
                datasets: [{
                    label: 'إجمالي المبيعات (' + curSym() + ')',
                    data: fakeData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: '#10b981',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false, // Disabled to prevent the "reloading from scratch" feel
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        grid: { display: false, drawBorder: false },
                        ticks: { color: ticksColor, font: { family: 'Cairo' } },
                    },
                    y: {
                        grid: { color: gridColor },
                        ticks: { color: ticksColor, font: { family: 'Cairo' } },
                    },
                },
            },
        });
    }

    // Listener for dynamic theme changes — lightweight, only update colors
    window.addEventListener('themeChanged', () => {
        if (dashboardChart) {
            const isL = document.body.classList.contains('light-theme') || document.documentElement.getAttribute('data-theme') === 'light';
            const gridColor = isL ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
            const ticksColor = isL ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
            dashboardChart.options.scales.x.ticks.color = ticksColor;
            dashboardChart.options.scales.y.ticks.color = ticksColor;
            dashboardChart.options.scales.y.grid.color = gridColor;
            dashboardChart.update('none'); // instant, no animation
        }
    });
    if (window.MC_PERF && typeof window.MC_PERF.runWhenIdle === 'function') {
        window.MC_PERF.runWhenIdle(renderDashboardChart, 150);
    } else {
        renderDashboardChart();
    }
    } // End of loadDashboardData

    // Bind Time Filters
    const timeFilters = document.querySelectorAll('.time-filters .filter-btn');
    timeFilters.forEach(btn => {
        btn.addEventListener('click', (e) => {
            timeFilters.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            // map text to period if data-period not set
            let p = e.target.dataset.period;
            if(!p) {
                let txt = e.target.innerText;
                if(txt.includes('اليوم')) p = 'today';
                else if(txt.includes('الأمس')) p = 'yesterday';
                else if(txt.includes('7 أيام')) p = 'week';
                else if(txt.includes('شهر')) p = 'month';
            }
            currentDashboardPeriod = p || 'today';
            loadDashboardData(currentDashboardPeriod).catch((err) => {
                console.error('Dashboard reload failed:', err);
                alert('حدث خطأ أثناء تحديث بيانات اللوحة.');
            });
        });
    });

    // Initial Load
    const activeBtn = document.querySelector('.time-filters .filter-btn.active');
    let initPeriod = 'today';
    if(activeBtn) {
        initPeriod = activeBtn.dataset.period || (activeBtn.innerText.includes('اليوم') ? 'today' : (activeBtn.innerText.includes('الأمس') ? 'yesterday' : 'week'));
    }
    currentDashboardPeriod = initPeriod;
    try {
        await loadDashboardData(initPeriod);
    } catch (err) {
        console.error('Initial dashboard load failed:', err);
    }

    if (typeof window.registerPosDatabaseRefresh === 'function') {
        window.registerPosDatabaseRefresh(() =>
            loadDashboardData(currentDashboardPeriod).catch((err) => {
                console.error('Dashboard refresh failed:', err);
            }),
        );
    }

    // --- 5. SHIFT REPORT MODAL LOGIC ---
    window.__floatModalMode = 'set';

    function setupFloatModalUi(mode) {
        const titleEl = document.getElementById('floatModalTitle');
        const labelEl = document.getElementById('floatModalLabel');
        const saveEl = document.getElementById('floatModalSaveBtn');
        if (mode === 'add') {
            if (titleEl) titleEl.innerHTML = '<i class="ph ph-plus-circle"></i> إضافة رصيد إضافي للدرج';
            if (labelEl) labelEl.textContent = 'أدخل المبلغ الإضافي الذي تريد إضافته للدرج:';
            if (saveEl) saveEl.textContent = 'إضافة الرصيد';
            return;
        }
        if (titleEl) titleEl.innerHTML = '<i class="ph ph-money"></i> رصيد مبدئي للدرج';
        if (labelEl) labelEl.textContent = 'أدخل العهدة المبدئية للدرج:';
        if (saveEl) saveEl.textContent = 'حفظ الرصيد';
    }

    window.openShiftFloatModal = function() {
        window.__floatModalMode = 'set';
        const currentFloat = localStorage.getItem('shift_cash_float') || 0;
        const modal = document.getElementById('floatModal');
        const input = document.getElementById('floatInput');
        if(modal && input) {
            setupFloatModalUi('set');
            input.value = currentFloat;
            window.openModalLayer(modal, '#floatInput');
        } else {
            // fallback (if used somewhere else where HTML modal isn't injected)
            const userInput = prompt('أدخل العهدة المبدئية للدرج (الكاش الموجود في الدرج قبل بدء الوردية):', currentFloat);
            if(userInput !== null) {
                const val = parseFloat(userInput) || 0;
                localStorage.setItem('shift_cash_float', val);
                alert('تم تعيين الرصيد الافتتاحي للدرج بنجاح.');
                window.location.reload();
            }
        }
    };

    window.closeShiftFloatModal = function() {
        const modal = document.getElementById('floatModal');
        if(modal) window.closeModalLayer(modal);
    };

    window.saveShiftFloatModal = function() {
        const input = document.getElementById('floatInput');
        if(input) {
            const val = parseFloat(input.value) || 0;
            if (window.__floatModalMode === 'add') {
                if (val <= 0) {
                    alert('يرجى إدخال مبلغ إضافي صحيح أكبر من صفر.');
                    return;
                }
                const currentFloat = parseFloat(localStorage.getItem('shift_cash_float')) || 0;
                const newFloat = currentFloat + val;
                localStorage.setItem('shift_cash_float', newFloat);
                alert(`تمت إضافة ${curPlain(val)} للدرج.\nالرصيد الافتتاحي الجديد: ${curPlain(newFloat)}.`);
            } else {
                localStorage.setItem('shift_cash_float', val);
                alert('تم تعيين الرصيد الافتتاحي للدرج بنجاح.');
            }
            window.location.reload();
        }
    };

    window.addExtraDrawerFloat = function() {
        window.__floatModalMode = 'add';
        const modal = document.getElementById('floatModal');
        const input = document.getElementById('floatInput');
        if (modal && input) {
            setupFloatModalUi('add');
            input.value = '';
            window.openModalLayer(modal, '#floatInput');
            return;
        }
        const userInput = prompt('أدخل المبلغ الإضافي لإيداعه في الدرج:', '0');
        if (userInput === null) return;
        const addVal = parseFloat(userInput);
        if (!Number.isFinite(addVal) || addVal <= 0) {
            alert('يرجى إدخال مبلغ إضافي صحيح أكبر من صفر.');
            return;
        }
        const currentFloat = parseFloat(localStorage.getItem('shift_cash_float')) || 0;
        const newFloat = currentFloat + addVal;
        localStorage.setItem('shift_cash_float', newFloat);
        alert(`تمت إضافة ${curPlain(addVal)} للدرج.\nالرصيد الافتتاحي الجديد: ${curPlain(newFloat)}.`);
        window.location.reload();
    };

    window.openShiftReport = function() {
        const modal = document.getElementById('shiftReportModal');
        if(!modal) return;
        
        const now = new Date();
        document.getElementById('shift-datetime').innerText = now.toLocaleString('ar-u-nu-latn', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        const currentUserConf = localStorage.getItem('currentUser');
        let cashierName = "المدير";
        if(currentUserConf) {
            try {
                const p = JSON.parse(currentUserConf);
                if(p.username || p.name) cashierName = p.username || p.name;
            } catch(e){}
        }
        document.getElementById('shift-cashier-name').innerText = "الموظف (إغلاق الوردية): " + cashierName;

        // ── تحميل الشعار واسم المطعم من الإعدادات ──
        const sysSet = localStorage.getItem('restaurant_settings');
        if (sysSet) {
            try {
                const s = JSON.parse(sysSet);
                const displayName = (s.name && s.name !== 'Mister Casher' && s.name !== 'Mister Casher') ? s.name : 'Mister Casher';
                const shiftNameEl = document.getElementById('shift-res-name');
                if (shiftNameEl) shiftNameEl.innerText = displayName;
                const shiftLogoEl = document.getElementById('shift-logo');
                if (shiftLogoEl && s.logo) {
                    shiftLogoEl.src = s.logo;
                } else if (shiftLogoEl) {
                    shiftLogoEl.src = '2222.png';
                }
            } catch(e){}
        } else {
            const shiftLogoEl = document.getElementById('shift-logo');
            if (shiftLogoEl) shiftLogoEl.src = '2222.png';
        }
        
        const d = window.__dashboardData || { dailySales:0, cashSales:0, networkSales:0, totalTax:0, totalReturnsAmt:0, totalExp:0, shiftCashFloat:0, drawerBalance:0 };

        document.getElementById('shift-float-cash').innerText = curPlain(d.shiftCashFloat);
        document.getElementById('shift-cash').innerText = curPlain(d.cashSales);
        document.getElementById('shift-network').innerText = curPlain(d.networkSales);
        // Update delivery breakdown container dynamically
        const shiftDeliveryContainer = document.getElementById('shift-delivery-breakdown-container');
        if (shiftDeliveryContainer) {
            shiftDeliveryContainer.innerHTML = '';
            if (d.shiftDeliveryBreakdown && Object.keys(d.shiftDeliveryBreakdown).length > 0) {
                for (const [comp, amt] of Object.entries(d.shiftDeliveryBreakdown)) {
                    shiftDeliveryContainer.insertAdjacentHTML('beforeend', `
                    <div class="receipt-row">
                        <span>إجمالي ${comp}:</span>
                        <span style="color:#ff6b00;">${curPlain(amt)}</span>
                    </div>`);
                }
            } else {
                shiftDeliveryContainer.insertAdjacentHTML('beforeend', `
                <div class="receipt-row">
                    <span>إجمالي التوصيل:</span>
                    <span style="color:#ff6b00;">${curPlain(d.shiftHungerStationUnpaid || 0)}</span>
                </div>`);
            }
        } else if (document.getElementById('shift-hungerstation')) {
            document.getElementById('shift-hungerstation').innerText = curPlain(d.shiftHungerStationUnpaid || 0);
        }
        document.getElementById('shift-total-income').innerText = curPlain(d.cashSales + d.networkSales);
        
        document.getElementById('shift-tax').innerText = curPlain(d.totalTax);
        document.getElementById('shift-returns').innerText = curPlain(d.totalReturnsAmt);
        document.getElementById('shift-expenses').innerText = curPlain(d.totalExp);
        
        document.getElementById('shift-drawer').innerText = curPlain(d.drawerBalance);
        
        document.getElementById('shift-grand-total').innerText = curPlain(d.dailySales);

        window.openModalLayer(modal);
    };

    window.closeShiftReport = function() {
        const modal = document.getElementById('shiftReportModal');
        if(modal) window.closeModalLayer(modal);
    };

    window.confirmCloseShift = async function() {
        const shiftOk = await window.mcasherConfirm(
            'هل أنت متأكد من إغلاق الوردية وبدء وردية جديدة؟\nملاحظة: رصيد الدرج لن يتم تصفيره، سيتم الاحتفاظ به.',
            'تأكيد إغلاق الوردية'
        );
        if (!shiftOk) return;

        const closeTime = Date.now();

        // ─── حفظ وقت إغلاق الوردية في قائمة التواريخ — لإعادة بناء التقرير لاحقاً ───
        let zTimestamps = [];
        try { zTimestamps = JSON.parse(localStorage.getItem('z_report_timestamps') || '[]'); } catch(e){}
        const lastZTime = parseInt(localStorage.getItem('last_z_report_time')) || 0;

        // اجمع بيانات الكاشير والمبيعات للوردية الحالية
        const currentUserConf = localStorage.getItem('currentUser');
        let cashierName = 'موظف';
        if (currentUserConf) { try { const p = JSON.parse(currentUserConf); if (p.username || p.name) cashierName = p.username || p.name; } catch(e){} }
        
        // احصل على بيانات الوردية الحالية من قاعدة البيانات لحفظها في السجل
        const db =
            typeof window.dbReadSlice === 'function'
                ? await window.dbReadSlice(['orders', 'returns', 'hrExpenses', 'expenses'])
                : await window.dbReadArchive();
        const allOrders = db.orders || [];
        const allReturns = db.returns || [];
        const allExpenses = (db.hrExpenses || []).concat(db.expenses || []);
        
        // Filter out returned orders to avoid double counting (they're handled via returns)
        const shiftOrders = allOrders.filter(o => o.status !== 'returned' && (o.timestamp || o.createdAt || 0) >= lastZTime);
        const shiftReturns = allReturns.filter(r => (r.timestamp || 0) >= lastZTime);
        const shiftExpenses = allExpenses.filter(e => (e.timestamp || 0) >= lastZTime);
        
        // احسب ملخص الوردية للحفظ في السجل التاريخي
        let shiftCash = 0, shiftNetwork = 0, shiftTotal = 0, shiftHSUnpaid = 0, shiftDeliveryBreakdown = {};
        shiftOrders.forEach(o => {
            const pay = splitOrderAmountsGlobal(o);
            shiftCash += pay.cash;
            shiftNetwork += pay.network;
            shiftTotal += o.total || 0;
            shiftHSUnpaid += (pay.hungerStation || 0);
            if (pay.deliveryBreakdown) {
                for (const [comp, amt] of Object.entries(pay.deliveryBreakdown)) {
                    shiftDeliveryBreakdown[comp] = (shiftDeliveryBreakdown[comp] || 0) + amt;
                }
            }
        });
        // NOTE: Returns are NOT subtracted here because returned orders are already excluded from shiftOrders
        // Returns are only tracked for reporting purposes in the returns field below
        let shiftExp = 0;
        let shiftBankExp = 0;
        // Separate cash vs bank expenses — only cash affects the drawer
        shiftExpenses.forEach(e => {
            const pm = String(e.pMethod || 'cash').trim();
            if (pm === 'bank' || pm === 'network' || pm === 'شبكة') {
                shiftBankExp += Number(e.amount) || 0;
            } else {
                shiftExp += Number(e.amount) || 0;
            }
        });
        
        const currentFloat = parseFloat(localStorage.getItem('shift_cash_float')) || 0;
        // Drawer balance only deducts cash expenses — bank transfer expenses bypass the drawer
        const shiftDrawerBalance = currentFloat + shiftCash - shiftExp;

        // حفظ سجل الوردية في قاعدة البيانات (للتاريخ والتقارير المستقبلية)
        if (!db.shift_history) db.shift_history = [];
        db.shift_history.push({
            id: 'SHIFT-' + closeTime,
            startTime: lastZTime,
            endTime: closeTime,
            cashierName: cashierName,
            openingFloat: currentFloat,
            cashSales: shiftCash,
            networkSales: shiftNetwork,
            totalSales: shiftTotal,
            expenses: shiftExp,
            returns: shiftReturns.reduce((sum, r) => sum + (r.amount || 0), 0),
            hungerStationUnpaid: shiftHSUnpaid,
            deliveryBreakdown: shiftDeliveryBreakdown,
            drawerBalance: shiftDrawerBalance,
            ordersCount: shiftOrders.length,
            closedAt: closeTime
        });
        
        await window.dbWrite(db);

        zTimestamps.push({ startTime: lastZTime || closeTime - 3600000, endTime: closeTime, cashierName });
        localStorage.setItem('z_report_timestamps', JSON.stringify(zTimestamps));

        // Mark current time as start of new shift - DO NOT RESET FLOAT
        localStorage.setItem('last_z_report_time', String(closeTime));
        localStorage.setItem('shift_cash_float', shiftDrawerBalance);
        try { localStorage.removeItem('_dashboard_kpi_snap'); } catch (e) {}

        alert(`تم إغلاق الوردية بنجاح.\n\nملخص الوردية:\n- المبيعات: ${curPlain(shiftTotal)}\n- كاش: ${curPlain(shiftCash)}\n- شبكة: ${curPlain(shiftNetwork)}\n- المصروفات: ${curPlain(shiftExp)}\n- رصيد الدرج المحفوظ: ${curPlain(shiftDrawerBalance)}\n\nسيتم استخدام هذا الرصيد كرصيد افتتاحي للوردية الجديدة.`);
        window.location.reload();
    };


    // =============================================
    // DAY CLOSE REPORT LOGIC
    // =============================================

    window.openDayCloseReport = async function() {
        try {
        const modal = document.getElementById('dayCloseModal');
        if (!modal) return;

        const now = new Date();
        const todayStr = now.toLocaleDateString('ar-u-nu-latn', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        // Fill header
        document.getElementById('day-datetime').innerText = now.toLocaleString('ar-u-nu-latn', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        document.getElementById('day-date').innerText = todayStr;

        const currentUserConf = localStorage.getItem('currentUser');
        let managerName = 'المدير';
        if (currentUserConf) {
            try { const p = JSON.parse(currentUserConf); if (p.username || p.name) managerName = p.username || p.name; } catch(e){}
        }
        document.getElementById('day-cashier-name').innerText = 'المسؤول: ' + managerName;

        // Restore restaurant name AND logo from settings (same as shift modal)
        const sysSet = localStorage.getItem('restaurant_settings');
        if (sysSet) {
            try {
                const s = JSON.parse(sysSet);
                // اسم المطعم
                const displayName = (s.name && s.name !== 'Mister Casher' && s.name !== 'Mister Casher') ? s.name : 'Mister Casher';
                document.getElementById('day-res-name').innerText = displayName;
                // شعار المطعم
                const dayLogoEl = document.getElementById('day-logo');
                if (dayLogoEl && s.logo && s.logo !== '2222.png' && s.logo !== '1(1).png') {
                    dayLogoEl.src = s.logo;
                }
            } catch(e){}
        }

        // Get tax rate
        let taxRate = 15;
        if (sysSet) { try { const s = JSON.parse(sysSet); if (s.taxRate !== undefined) taxRate = parseFloat(s.taxRate); } catch(e){} }
        const TAX_RATE = taxRate / 100;

        // Read database (أجزاء مطلوبة فقط — أسرع على الأجهزة الضعيفة)
        let db =
            typeof window.dbReadSlice === 'function'
                ? await window.dbReadSlice(['orders', 'returns', 'hrExpenses', 'expenses'])
                : await window.dbReadArchive();
        if (!db || typeof db !== 'object') {
            throw new Error('صيغة قاعدة البيانات غير صالحة (dbRead لم يرجع كائن).');
        }
        if (!Array.isArray(db.orders)) console.warn('[DayClose] db.orders is not an array:', db.orders);
        if (!Array.isArray(db.returns)) console.warn('[DayClose] db.returns is not an array:', db.returns);
        if (!Array.isArray(db.hrExpenses)) console.warn('[DayClose] db.hrExpenses is not an array:', db.hrExpenses);
        if (!Array.isArray(db.expenses)) console.warn('[DayClose] db.expenses is not an array:', db.expenses);
        const allOrders = Array.isArray(db?.orders) ? db.orders : [];
        const allReturns = Array.isArray(db?.returns) ? db.returns : [];
        const hrExpenses = Array.isArray(db?.hrExpenses) ? db.hrExpenses : [];
        const extraExpenses = Array.isArray(db?.expenses) ? db.expenses : [];
        const allHrExpenses = hrExpenses.concat(extraExpenses);

        // Filter only TODAY's data (full day, ignore shift boundaries)
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const endOfDay = startOfDay + 86400000;

        function isToday(ts) {
            const t = typeof ts === 'string' ? new Date(ts).getTime() : (ts || 0);
            return t >= startOfDay && t < endOfDay;
        }

        const todayOrders   = allOrders.filter(o   => isToday(o.timestamp || o.createdAt || o.dateStr || o.date));
        const todayReturns  = allReturns.filter(r  => isToday(r.timestamp || r.date));
        const todayExpenses = allHrExpenses.filter(e => isToday(e.timestamp || e.date || (e.createdAt)));

        // ---- بناء قائمة الفترات الزمنية لكل وردية — من قاعدة البيانات الفعلية ----
        let zTimestamps = [];
        try { zTimestamps = JSON.parse(localStorage.getItem('z_report_timestamps') || '[]'); } catch(e){}

        const lastZTime = parseInt(localStorage.getItem('last_z_report_time')) || startOfDay;
        const shiftFloat = parseFloat(localStorage.getItem('shift_cash_float')) || 0;

        // فلترة اليوم فقط
        const todayZTimestamps = zTimestamps.filter(z => isToday(z.endTime || z.startTime));

        // بناء فترات الورديات: نبدأ من بداية اليوم
        // كل وردية = من startTime إلى endTime
        let shiftRanges = [];

        if (todayZTimestamps.length === 0) {
            // لا توجد سجلات ورديات مغلقة — اعتبر كل شيء قبل lastZTime وردية واحدة مغلقة
            const prevOrders = todayOrders.filter(o => (o.timestamp || o.createdAt || 0) < lastZTime);
            if (prevOrders.length > 0) {
                shiftRanges.push({ startTime: startOfDay, endTime: lastZTime, cashierName: 'وردية سابقة', isClosed: true });
            }
        } else {
            // بناء من z_report_timestamps — كل إدخال فيه startTime و endTime
            todayZTimestamps.forEach(z => {
                shiftRanges.push({ startTime: z.startTime || startOfDay, endTime: z.endTime, cashierName: z.cashierName || 'موظف', isClosed: true });
            });
        }

        // إضافة الوردية الحالية (مفتوحة)
        shiftRanges.push({ startTime: lastZTime, endTime: now.getTime(), cashierName: managerName, isCurrent: true });

        // ---- احتساب بيانات كل وردية من قاعدة البيانات الفعلية ----
        const allDayShifts = shiftRanges.map(range => {
            // Filter out returned orders to avoid double counting
            const rOrders   = todayOrders.filter(o   => { const t = o.timestamp || o.createdAt || 0; return t >= range.startTime && t < range.endTime; });
            const rReturns  = todayReturns.filter(r  => { const t = r.timestamp || new Date(r.date||0).getTime() || 0; return t >= range.startTime && t < range.endTime; });
            const rExpenses = todayExpenses.filter(e => { const t = e.timestamp || new Date(e.date||0).getTime() || 0; return t >= range.startTime && t < range.endTime; });

            let cash = 0, net = 0, tax = 0, ret = 0, exp = 0, hsUnpaid = 0;
            let sDeliveryBreakdown = {};

            // Only include non-returned orders in totals
            rOrders.forEach(o => {
                // Skip returned orders - they're tracked via returns instead
                if (o.status === 'returned') return;
                
                tax += o.total - (o.total / (1 + TAX_RATE));
                const pay = splitOrderAmountsGlobal(o);
                cash += pay.cash;
                net += pay.network;
                hsUnpaid += (pay.hungerStation || 0);
                if (pay.deliveryBreakdown) {
                    for (const [comp, amt] of Object.entries(pay.deliveryBreakdown)) {
                        sDeliveryBreakdown[comp] = (sDeliveryBreakdown[comp] || 0) + amt;
                    }
                }
            });
            
            // Returns are only tracked for reporting (not subtracted since orders are already excluded)
            rReturns.forEach(r => {
                ret += r.amount;
            });
            exp = sumCashDrawerExpenses(rExpenses);

            const floatAmt = range.isCurrent ? shiftFloat : 0;
            const activeOrders = rOrders.filter(o => o.status !== 'returned');

            return {
                ...range,
                ordersCount: activeOrders.length,
                cashSales: cash,
                networkSales: net,
                totalTax: tax,
                totalReturns: ret,
                totalExpenses: exp,
                hungerStationUnpaid: hsUnpaid,
                deliveryBreakdown: sDeliveryBreakdown,
                drawerBalance: floatAmt + cash - exp
            };
        });

        // ---- Grand Day Totals ----
        let dayTotalCash = 0, dayTotalNet = 0, dayTotalTax = 0, dayTotalRet = 0, dayTotalExp = 0, dayTotalOrders = 0, dayTotalHSUnpaid = 0;
        let dayDeliveryBreakdown = {};
        allDayShifts.forEach(s => {
            dayTotalCash    += s.cashSales    || 0;
            dayTotalNet     += s.networkSales || 0;
            dayTotalTax     += s.totalTax     || 0;
            dayTotalRet     += s.totalReturns || 0;
            dayTotalExp     += s.totalExpenses|| 0;
            dayTotalOrders  += s.ordersCount  || 0;
            dayTotalHSUnpaid += s.hungerStationUnpaid || 0;
            if (s.deliveryBreakdown) {
                for (const [comp, amt] of Object.entries(s.deliveryBreakdown)) {
                    dayDeliveryBreakdown[comp] = (dayDeliveryBreakdown[comp] || 0) + amt;
                }
            }
        });
        const dayTotalIncome = dayTotalCash + dayTotalNet;
        const dayNetTotal    = dayTotalIncome - dayTotalRet - dayTotalExp;
        // رصيد الدرج = الوردية الحالية (عهدة + كاش الوردية − مصروفات كاش الوردية) — لا نجمع كل يوم مع العهدة لتجنب الازدواج بعد إغلاق Z
        const dayDrawerTotal = allDayShifts.length > 0
            ? (allDayShifts[allDayShifts.length - 1].drawerBalance || 0)
            : (shiftFloat + dayTotalCash - sumCashDrawerExpenses(todayExpenses));

        // Populate summary
        document.getElementById('day-shifts-count').innerText  = allDayShifts.length + ' وردية';
        document.getElementById('day-orders-count').innerText  = dayTotalOrders + ' طلب';
        document.getElementById('day-total-cash').innerText    = curPlain(dayTotalCash);
        document.getElementById('day-total-network').innerText = curPlain(dayTotalNet);
        document.getElementById('day-total-income').innerText  = curPlain(dayTotalIncome);
        document.getElementById('day-total-tax').innerText     = curPlain(dayTotalTax);
        document.getElementById('day-total-returns').innerText = curPlain(dayTotalRet);
        document.getElementById('day-total-expenses').innerText= curPlain(dayTotalExp);
        document.getElementById('day-total-sales').innerText   = curPlain(dayTotalIncome);
        const hsUnpaidEl = document.getElementById('day-total-hs-unpaid');
        if (hsUnpaidEl) hsUnpaidEl.innerText = curPlain(dayTotalHSUnpaid);
        // Update delivery breakdown container
        const dayDeliveryContainer = document.getElementById('day-delivery-breakdown-container');
        if (dayDeliveryContainer) {
            dayDeliveryContainer.innerHTML = '';
            if (dayDeliveryBreakdown && Object.keys(dayDeliveryBreakdown).length > 0) {
                for (const [comp, amt] of Object.entries(dayDeliveryBreakdown)) {
                    dayDeliveryContainer.insertAdjacentHTML('beforeend', `
                    <div class="receipt-row">
                        <span>إجمالي ${comp}:</span>
                        <span style="color:#ff6b00;">${curPlain(amt)}</span>
                    </div>`);
                }
            } else {
                dayDeliveryContainer.insertAdjacentHTML('beforeend', `
                <div class="receipt-row">
                    <span>إجمالي التوصيل:</span>
                    <span style="color:#ff6b00;">${curPlain(dayTotalHSUnpaid)}</span>
                </div>`);
            }
        }
        document.getElementById('day-total-with-hs').innerText = curPlain(dayTotalIncome + dayTotalHSUnpaid);
        document.getElementById('day-drawer-total').innerText  = curPlain(dayDrawerTotal);
        
        // Remove HS unpaid warning
        const existing = document.getElementById('day-hs-warning');
        if (existing) existing.remove();

        // ---- Render Per-Shift Breakdown ----
        const breakdownEl = document.getElementById('day-shifts-breakdown');
        breakdownEl.innerHTML = '';

        allDayShifts.forEach((s, idx) => {
            const sStart = new Date(s.startTime).toLocaleTimeString('ar-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
            const sEnd   = s.isCurrent ? 'الآن' : new Date(s.endTime).toLocaleTimeString('ar-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
            const badge  = s.isCurrent ? '<span style="color:#059669; font-size:10px;">(مفتوحة الآن)</span>' : '<span style="color:#7c3aed; font-size:10px;">(مغلقة)</span>';
            const sIncome = ((s.cashSales||0) + (s.networkSales||0)).toFixed(2);

            breakdownEl.insertAdjacentHTML('beforeend', `
                <div class="day-shift-block">
                    <div class="shift-block-header">
                        <span>الوردية ${idx + 1} — ${s.cashierName || 'موظف'} ${badge}</span>
                        <span>${sStart} ← ${sEnd}</span>
                    </div>
                    <div class="receipt-row"><span>عدد الطلبات:</span><span>${s.ordersCount || 0} طلب</span></div>
                    <div class="receipt-row"><span>مبيعات كاش:</span><span>${curPlain(s.cashSales||0)}</span></div>
                    <div class="receipt-row"><span>مبيعات شبكة:</span><span>${curPlain(s.networkSales||0)}</span></div>
                    ${(function(){
                        let sDeliveryHtml = '';
                        if (s.deliveryBreakdown && Object.keys(s.deliveryBreakdown).length > 0) {
                            for (const [comp, amt] of Object.entries(s.deliveryBreakdown)) {
                                sDeliveryHtml += `<div class="receipt-row"><span>توصيل ${comp}:</span><span style="color:#ff6b00;">${curPlain(amt)}</span></div>`;
                            }
                        } else if (s.hungerStationUnpaid > 0) {
                            sDeliveryHtml = `<div class="receipt-row"><span>توصيل غير مدفوع:</span><span style="color:#ff6b00;">${curPlain(s.hungerStationUnpaid||0)}</span></div>`;
                        }
                        return sDeliveryHtml;
                    })()}
                    <div class="receipt-row"><span>إجمالي الدخل:</span><span style="font-weight:800;">${curPlain(parseFloat(sIncome)||0)}</span></div>
                    <div class="receipt-row"><span>المرتجعات:</span><span style="color:#c00;">${curPlain(s.totalReturns||0)}</span></div>
                    <div class="receipt-row"><span>المصروفات:</span><span style="color:#c00;">${curPlain(s.totalExpenses||0)}</span></div>
                    <div class="receipt-row"><span>رصيد الدرج:</span><span style="font-weight:800; color:#047857;">${curPlain(s.drawerBalance||0)}</span></div>
                </div>
            `);
        });

        // Store snapshot for confirmCloseDay
        window.__dayCloseSnapshot = { allDayShifts, dayTotalCash, dayTotalNet, dayTotalTax, dayTotalRet, dayTotalExp, dayTotalIncome, dayNetTotal, dayDrawerTotal, dayTotalOrders, dayDate: todayStr, closedAt: now.getTime(), dayTotalHSUnpaid, dayDeliveryBreakdown, shiftCashFloat: shiftFloat };

        window.openModalLayer(modal);
        } catch (error) {
            const errMsg = (error && error.message) ? error.message : String(error);
            console.error('openDayCloseReport error:', error);
            alert(`تعذر فتح تقرير إقفال اليوم.\nالسبب: ${errMsg}`);
        }
    };

    window.closeDayCloseReport = function() {
        const modal = document.getElementById('dayCloseModal');
        if (modal) window.closeModalLayer(modal);
    };

    window.confirmCloseDay = async function() {
        const dayOk = await window.mcasherConfirm(
            'هل أنت متأكد من إقفال اليوم بالكامل؟\nسيتم حفظ السجل، طباعة التقرير، والانتقال لليوم الجديد.\nرصيد الدرج يُحفظ كما هو.',
            'تأكيد إقفال اليوم'
        );
        if (!dayOk) return;

        const snap = window.__dayCloseSnapshot;
        if (!snap || !snap.dayDate) {
            if (typeof window.mcasherAlert === 'function') {
                await window.mcasherAlert('افتح تقرير إقفال اليوم أولاً (زر «اقفال اليوم») ثم اضغط تأكيد الإقفال.', 'تنبيه');
            } else {
                alert('افتح تقرير إقفال اليوم أولاً ثم أعد المحاولة.');
            }
            return;
        }

        const confirmBtn = document.querySelector('#dayCloseModal button[onclick*="confirmCloseDay"]');
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.style.opacity = '0.6';
        }

        try {
            const currentUserConf = localStorage.getItem('currentUser');
            let managerName = 'المدير';
            if (currentUserConf) {
                try { const p = JSON.parse(currentUserConf); if (p.username || p.name) managerName = p.username || p.name; } catch (e) {}
            }

            const closedAt = snap.closedAt || Date.now();
            const closureId = 'DAY-' + closedAt;
            const shiftDetails = snap.allDayShifts || [];
            const closureRecord = {
                id: closureId,
                date: snap.dayDate,
                closedAt,
                closedBy: managerName,
                shiftsCount: shiftDetails.length,
                ordersCount: snap.dayTotalOrders || 0,
                totalCash: snap.dayTotalCash || 0,
                totalNetwork: snap.dayTotalNet || 0,
                totalIncome: snap.dayTotalIncome || 0,
                totalTax: snap.dayTotalTax || 0,
                totalReturns: snap.dayTotalRet || 0,
                totalExpenses: snap.dayTotalExp || 0,
                netTotal: snap.dayNetTotal || 0,
                hungerStationUnpaid: snap.dayTotalHSUnpaid || 0,
                deliveryBreakdown: snap.dayDeliveryBreakdown || {},
                drawerTotal: (snap.dayDrawerTotal != null && !isNaN(snap.dayDrawerTotal))
                    ? Number(snap.dayDrawerTotal)
                    : 0
            };

            let dayHistory = [];
            try { dayHistory = JSON.parse(localStorage.getItem('day_history') || '[]'); } catch (e) {}
            dayHistory.push(closureRecord);
            localStorage.setItem('day_history', JSON.stringify(dayHistory));

            let saved = false;
            if (typeof window.dbAppendDayClosure === 'function') {
                const r = await window.dbAppendDayClosure(closureRecord, shiftDetails);
                saved = r && r.success;
            }
            if (!saved) {
                const db = await window.dbReadArchive();
                const mergeClosures = typeof window.mergeDayClosureRecords === 'function'
                    ? window.mergeDayClosureRecords
                    : (dbList, hist) => (dbList || []).concat(hist || []);
                db.day_closures = mergeClosures(db.day_closures || [], dayHistory);
                const dupKey = closureRecord.id || ('DAY-' + closedAt);
                const alreadySaved = db.day_closures.some((c) => (c.id || ('DAY-' + (c.closedAt || ''))) === dupKey);
                if (!alreadySaved) db.day_closures.push(closureRecord);
                if (!db.day_closure_details || typeof db.day_closure_details !== 'object') {
                    db.day_closure_details = {};
                }
                db.day_closure_details[closureId] = { shifts: shiftDetails };
                saved = await window.dbWrite(db);
            }
            if (!saved) {
                throw new Error('تعذر حفظ سجل الإقفال في قاعدة البيانات.');
            }

            // احفظ رصيد الدرج الكامل من التقرير (وليس العهدة الافتتاحية فقط)
            const drawerToKeep = (snap.dayDrawerTotal != null && !isNaN(snap.dayDrawerTotal))
                ? Number(snap.dayDrawerTotal)
                : (() => {
                    const shifts = snap.allDayShifts || [];
                    if (shifts.length) return Number(shifts[shifts.length - 1].drawerBalance) || 0;
                    return parseFloat(localStorage.getItem('shift_cash_float')) || 0;
                })();

            localStorage.setItem('shift_cash_float', String(drawerToKeep));
            localStorage.setItem('last_z_report_time', String(closedAt));
            localStorage.setItem('z_report_timestamps', '[]');
            try {
                localStorage.setItem('last_day_close_at', String(closedAt));
                localStorage.setItem('last_day_close_drawer', String(drawerToKeep));
                localStorage.removeItem('_dashboard_kpi_snap');
            } catch (e) {}

            window.closeDayCloseReport();

            if (typeof window.printDayReport === 'function') {
                await window.printDayReport();
            }

            const successMsg = `تم إقفال اليوم بالكامل بنجاح.\n\nملخص اليوم:\n- عدد الورديات: ${(snap.allDayShifts || []).length}\n- الطلبات: ${snap.dayTotalOrders || 0}\n- المبيعات: ${curPlain(snap.dayTotalIncome || 0)}\n- المصروفات: ${curPlain(snap.dayTotalExp || 0)}\n- رصيد الدرج المحفوظ للوردية الجديدة: ${curPlain(drawerToKeep)}\n\nملاحظة: الطلبات والمبيعات في لوحة القيادة تبدأ من صفر للوردية الجديدة — السجل الكامل في «سجلات الإقفال».`;
            if (typeof window.mcasherAlert === 'function') {
                await window.mcasherAlert(successMsg, 'تم إقفال اليوم');
            } else {
                alert(successMsg);
            }

            window.__dayCloseSnapshot = null;
            window.location.reload();
        } catch (error) {
            console.error('confirmCloseDay error:', error);
            const errMsg = (error && error.message) ? error.message : String(error);
            if (typeof window.mcasherAlert === 'function') {
                await window.mcasherAlert('تعذر إقفال اليوم: ' + errMsg, 'خطأ');
            } else {
                alert('تعذر إقفال اليوم: ' + errMsg);
            }
        } finally {
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.style.opacity = '';
            }
        }
    };

    window.printDayReport = async function() {
        const { ipcRenderer } = require('electron');
        const path = require('path');
        const fs = require('fs');
        
        // Get restaurant settings
        const sysSet = localStorage.getItem('restaurant_settings');
        let restName = 'Mister Casher';
        let logoBase64 = '';
        
        if (sysSet) {
            try {
                const s = JSON.parse(sysSet);
                if (s.name) restName = s.name;
                
                // Convert logo to base64
                if (s.logo && s.logo.startsWith('data:')) {
                    logoBase64 = s.logo;
                } else if (s.logo) {
                    try {
                        const logoPath = path.join(__dirname, s.logo);
                        if (fs.existsSync(logoPath)) {
                            const logoBuffer = fs.readFileSync(logoPath);
                            const ext = path.extname(s.logo).toLowerCase();
                            const mimeType = ext === '.png' ? 'image/png' : 
                                           ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
                            logoBase64 = `data:${mimeType};base64,${logoBuffer.toString('base64')}`;
                        }
                    } catch(e) {
                        console.error('Day report logo error:', e);
                    }
                }
            } catch(e){}
        }
        
        // If no logo, use default
        if (!logoBase64) {
            try {
                const defaultLogo = path.join(__dirname, '2222.png');
                if (fs.existsSync(defaultLogo)) {
                    const logoBuffer = fs.readFileSync(defaultLogo);
                    logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
                }
            } catch(e) {}
        }

        // Get data from the modal
        const managerName = document.getElementById('day-cashier-name')?.innerText || 'المدير';
        const datetime = document.getElementById('day-datetime')?.innerText || '';
        const date = document.getElementById('day-date')?.innerText || '';
        const totalHS = document.getElementById('day-total-hs-unpaid')?.innerText || curPlain(0);
        
        // Collect all rows from day report
        const totalOrders = document.getElementById('day-orders-count')?.innerText || '0';
        const totalCash = document.getElementById('day-total-cash')?.innerText || curPlain(0);
        const totalNetwork = document.getElementById('day-total-network')?.innerText || curPlain(0);
        const totalIncome = document.getElementById('day-total-income')?.innerText || curPlain(0);
        const totalTax = document.getElementById('day-total-tax')?.innerText || curPlain(0);
        const totalReturns = document.getElementById('day-total-returns')?.innerText || curPlain(0);
        const totalExpenses = document.getElementById('day-total-expenses')?.innerText || curPlain(0);
        const totalSales = document.getElementById('day-total-sales')?.innerText || curPlain(0);
        
        // Read delivery breakdown from container
        let deliveryPrintRowsDay = '';
        const dayDeliveryContainer = document.getElementById('day-delivery-breakdown-container');
        if (dayDeliveryContainer && dayDeliveryContainer.children.length > 0) {
            for (let child of dayDeliveryContainer.children) {
                const spans = child.querySelectorAll('span');
                if (spans.length >= 2) {
                    deliveryPrintRowsDay += `<tr class="row-light"><td>${spans[0].innerText}</td><td>${spans[1].innerText}</td></tr>`;
                }
            }
        } else {
            const hsVal = document.getElementById('day-total-hs-unpaid') ? document.getElementById('day-total-hs-unpaid').innerText : '0';
            deliveryPrintRowsDay = `<tr class="row-light"><td style="color:#ff6b00;">إجمالي التوصيل</td><td style="color:#ff6b00;">${hsVal}</td></tr>`;
        }
        
        const totalWithHS = document.getElementById('day-total-with-hs')?.innerText || curPlain(0);
        const totalWithHSLabel = document.getElementById('day-total-with-delivery-label') ? document.getElementById('day-total-with-delivery-label').innerText.replace(':', '') : 'الإجمالي مع التوصيل';
        const drawerTotal = document.getElementById('day-drawer-total')?.innerText || curPlain(0);

        console.log('🖨️  Printing day closure report...');
        console.log('   Logo:', logoBase64 ? '✓ Base64 (' + logoBase64.length + ' bytes)' : '✗ No logo');
        console.log('   Restaurant:', restName);

        const dayPrintFooter = escapeHtmlPrint(getReceiptFooterLine(sysSet, restName, 'تقرير إقفال يوم'));

        // Build HTML with same standards as customer receipt (80mm)
        const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        /* === Report CSS — Arabic RTL 80mm — Modern 2024 Standards ===
           ESC/POS printable area: 72-76mm | Safe content zone: 70mm
        */
        *, *::before, *::after {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        
        @page {
            size: 80mm auto;
            margin: 0;
        }
        
        html {
            -webkit-text-size-adjust: none;
            text-size-adjust: none;
            overflow: visible;
        }

        body {
            width: 100%;
            max-width: 80mm;
            margin: 0 auto;
            padding: 0;
            background: #ffffff;
            color: #000000;
            direction: rtl;
            unicode-bidi: embed;
            font-family: 'Cairo', 'Segoe UI', 'Arial', 'Tahoma', sans-serif;
            text-align: center;
            line-height: 1.4;
            font-size: 10pt;
            -webkit-font-smoothing: antialiased;
            overflow: visible;
            word-break: break-word;
            overflow-wrap: anywhere;
        }
        
        .receipt-wrapper {
            width: 100%;
            padding-top: 3mm;
            padding-bottom: 3mm;
            padding-left: 4mm;
            padding-right: 6mm;
            margin: 0 auto;
            box-sizing: border-box;
        }
        
        .store-logo {
            width: 25mm;
            height: 25mm;
            max-width: 25mm;
            max-height: 25mm;
            object-fit: contain;
            display: block;
            margin-left: auto;
            margin-right: auto;
            margin-bottom: 2mm;
            filter: grayscale(100%);
            image-rendering: -webkit-optimize-contrast;
            image-rendering: crisp-edges;
        }
        
        .report-title {
            font-size: 13pt;
            font-weight: 900;
            margin-top: 2mm;
            margin-bottom: 1mm;
            overflow-wrap: anywhere;
            word-break: break-word;
            padding-left: 1mm;
            padding-right: 1mm;
        }
        
        .report-subtitle {
            font-size: 9.5pt;
            font-weight: 700;
            margin-top: 1mm;
            margin-bottom: 1mm;
        }
        
        .manager-info {
            font-size: 9pt;
            font-weight: 700;
            margin-top: 1.5mm;
            margin-bottom: 1.5mm;
            overflow-wrap: anywhere;
            word-break: break-word;
            padding-left: 1mm;
            padding-right: 1mm;
        }
        
        .cashier-info {
            font-size: 9pt;
            font-weight: 700;
            margin-top: 1.5mm;
            margin-bottom: 1.5mm;
            overflow-wrap: anywhere;
            word-break: break-word;
            padding-left: 1mm;
            padding-right: 1mm;
        }
        
        .datetime {
            font-size: 8pt;
            color: #555555;
            margin-top: 1mm;
            margin-bottom: 1mm;
            overflow-wrap: anywhere;
            word-break: break-word;
            padding-left: 1mm;
            padding-right: 1mm;
        }
        
        .divider {
            border-top: 1.5px dashed #000000;
            margin-top: 3mm;
            margin-bottom: 3mm;
            width: 100%;
        }
        
        .divider-thick {
            border-top: 2px solid #000000;
            margin-top: 3mm;
            margin-bottom: 3mm;
            width: 100%;
        }
        
        .report-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            margin-top: 2mm;
            margin-bottom: 2mm;
            font-size: 9pt;
            border: 1.5px solid #000000;
            break-inside: avoid;
        }
        
        .report-table thead th {
            padding-top: 1.5mm;
            padding-bottom: 1.5mm;
            padding-left: 1.5mm;
            padding-right: 1.5mm;
            border: 1px solid #000000;
            background: #e0e0e0;
            font-weight: 800;
            font-size: 9pt;
            text-align: center;
        }
        
        .report-table tbody td {
            padding-top: 1.5mm;
            padding-bottom: 1.5mm;
            padding-left: 2mm;
            padding-right: 2mm;
            border: 1px solid #cccccc;
            vertical-align: middle;
            overflow-wrap: anywhere;
            word-break: break-word;
            break-inside: avoid;
        }
        
        /* Logical Properties للطاول: start = يمين في RTL */
        .report-table tbody td:first-child {
            width: 56%;
            text-align: start;
            font-weight: 600;
        }
        
        .report-table tbody td:last-child {
            width: 44%;
            text-align: end;
            font-weight: 700;
            font-variant-numeric: tabular-nums;
        }
        
        .report-table tbody tr.row-strong td {
            background: #f0f0f0;
            font-weight: 800;
            font-size: 9.5pt;
        }
        
        .report-table tbody tr.grand-total td {
            font-size: 11pt;
            font-weight: 900;
            background: #000000;
            color: #ffffff;
            border-color: #000000;
            padding-top: 2.5mm;
            padding-bottom: 2.5mm;
            padding-left: 2mm;
            padding-right: 2mm;
        }
        
        .footer-message {
            font-size: 9.5pt;
            font-weight: 700;
            margin-top: 3mm;
            margin-bottom: 1mm;
            text-align: center;
            padding-left: 1mm;
            padding-right: 1mm;
            overflow-wrap: anywhere;
            line-height: 1.5;
        }
        
        .powered-by {
            font-size: 7.5pt;
            color: #555555;
            margin-top: 2mm;
            text-align: center;
            padding-left: 1mm;
            padding-right: 1mm;
            overflow-wrap: anywhere;
        }
    </style>
</head>
<body>
    <div class="receipt-wrapper">
        ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" class="store-logo">` : ''}
        
        <div class="report-title">${restName}</div>
        <div class="report-subtitle">تقرير إقفال اليوم الكامل (X-Report)</div>
        
        <div class="manager-info">${managerName}</div>
        <div class="datetime">${date} - ${datetime}</div>
        
        <div class="divider"></div>
        
        <table class="report-table">
            <thead>
                <tr><th colspan="2">ملخص اليوم الكامل</th></tr>
            </thead>
            <tbody>
                <tr><td>عدد الطلبات</td><td>${totalOrders}</td></tr>
                ${deliveryPrintRowsDay}
                <tr><td>إجمالي الكاش</td><td>${totalCash}</td></tr>
                <tr><td>إجمالي الشبكة</td><td>${totalNetwork}</td></tr>
                <tr class="row-strong"><td>إجمالي الدخل</td><td>${totalIncome}</td></tr>
            </tbody>
        </table>
        
        <table class="report-table">
            <thead>
                <tr><th colspan="2">الضريبة والتعديلات</th></tr>
            </thead>
            <tbody>
                <tr><td>الضريبة</td><td>${totalTax}</td></tr>
                <tr><td>المرتجعات</td><td style="color:#c00;">${totalReturns}</td></tr>
                <tr><td>المصروفات</td><td style="color:#c00;">${totalExpenses}</td></tr>
            </tbody>
        </table>
        
        <div class="divider-thick"></div>
        
        <table class="report-table">
            <tbody>
                <tr class="grand-total"><td>إجمالي المبيعات</td><td>${totalSales}</td></tr>
                <tr class="row-strong"><td>${totalWithHSLabel}</td><td>${totalWithHS}</td></tr>
                <tr class="row-strong"><td>رصيد الدرج</td><td>${drawerTotal}</td></tr>
            </tbody>
        </table>
        
        <div class="footer-message">
            تم إقفال اليوم بالكامل<br>
            شكراً لجهود فريق العمل!
        </div>
        <div class="powered-by">${dayPrintFooter}</div>
    </div>
</body>
</html>`;

        try {
            const cashierPrinter = localStorage.getItem('cashier_printer') || '';
            console.log('📤 Sending to printer:', cashierPrinter || 'Default');
            
            const pr = await ipcRenderer.invoke('print-to-device', { html: html, printerName: cashierPrinter });
            if (pr && pr.debug) console.log('[طباعة إقفال يوم — تشخيص]', pr.debug);
            if (!pr || !pr.success) console.warn('[طباعة إقفال يوم]', pr);
            else console.log('✅ Day report printed successfully');
        } catch(e) { 
            console.error('❌ Day Report print failed:', e); 
            alert('حدث خطأ في طباعة التقرير: ' + e.message);
        }
    };

    // ─── تحديث confirmCloseShift النسخة القديمة (legacy override — للتوافق) ───
    // النسخة الجديدة معرفة أعلى وتحفظ z_report_timestamps
    // لا نحتاج لأي override إضافي هنا

    window.printShiftReport = async function() {
        const { ipcRenderer } = require('electron');
        const path = require('path');
        const fs = require('fs');
        
        // Get restaurant settings
        const sysSet = localStorage.getItem('restaurant_settings');
        let restName = 'Mister Casher';
        let logoBase64 = '';
        
        if (sysSet) {
            try {
                const s = JSON.parse(sysSet);
                if (s.name) restName = s.name;
                
                // Convert logo to base64
                if (s.logo && s.logo.startsWith('data:')) {
                    logoBase64 = s.logo;
                } else if (s.logo) {
                    try {
                        const logoPath = path.join(__dirname, s.logo);
                        if (fs.existsSync(logoPath)) {
                            const logoBuffer = fs.readFileSync(logoPath);
                            const ext = path.extname(s.logo).toLowerCase();
                            const mimeType = ext === '.png' ? 'image/png' : 
                                           ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
                            logoBase64 = `data:${mimeType};base64,${logoBuffer.toString('base64')}`;
                        }
                    } catch(e) {
                        console.error('Shift report logo error:', e);
                    }
                }
            } catch(e){}
        }
        
        // If no logo, use default
        if (!logoBase64) {
            try {
                const defaultLogo = path.join(__dirname, '2222.png');
                if (fs.existsSync(defaultLogo)) {
                    const logoBuffer = fs.readFileSync(defaultLogo);
                    logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
                }
            } catch(e) {}
        }

        // Get data from the modal
        const cashierName = document.getElementById('shift-cashier-name').innerText;
        const datetime = document.getElementById('shift-datetime').innerText;
        const floatCash = document.getElementById('shift-float-cash').innerText;
        const cashSales = document.getElementById('shift-cash').innerText;
        const networkSales = document.getElementById('shift-network').innerText;
        
        // Read delivery breakdown from container
        let deliveryPrintRows = '';
        const shiftDeliveryContainer = document.getElementById('shift-delivery-breakdown-container');
        if (shiftDeliveryContainer && shiftDeliveryContainer.children.length > 0) {
            for (let child of shiftDeliveryContainer.children) {
                const spans = child.querySelectorAll('span');
                if (spans.length >= 2) {
                    deliveryPrintRows += `<tr class="row-light"><td>${spans[0].innerText}</td><td>${spans[1].innerText}</td></tr>`;
                }
            }
        } else {
            const hsVal = document.getElementById('shift-hungerstation') ? document.getElementById('shift-hungerstation').innerText : '0';
            deliveryPrintRows = `<tr><td style="color:#ff6b00;">إجمالي التوصيل</td><td style="color:#ff6b00;">${hsVal}</td></tr>`;
        }
        
        const totalIncome = document.getElementById('shift-total-income')?.innerText || curPlain(0);
        const tax = document.getElementById('shift-tax')?.innerText || curPlain(0);
        const returns = document.getElementById('shift-returns')?.innerText || curPlain(0);
        const expenses = document.getElementById('shift-expenses')?.innerText || curPlain(0);
        const drawer = document.getElementById('shift-drawer')?.innerText || curPlain(0);
        const grandTotal = document.getElementById('shift-grand-total')?.innerText || curPlain(0);

        console.log('🖨️  Printing shift closure report...');
        console.log('   Logo:', logoBase64 ? '✓ Base64 (' + logoBase64.length + ' bytes)' : '✗ No logo');
        console.log('   Restaurant:', restName);

        const shiftPrintFooter = escapeHtmlPrint(getReceiptFooterLine(sysSet, restName, 'تقرير وردية'));

        // Build HTML with same standards as customer receipt (80mm)
        const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        /* === Shift Report CSS — Arabic RTL 80mm — Modern 2024 Standards ===
           ESC/POS printable area: 72-76mm | Safe content zone: 70mm
        */
        *, *::before, *::after {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        
        @page {
            size: 80mm auto;
            margin: 0;
        }
        
        html {
            -webkit-text-size-adjust: none;
            text-size-adjust: none;
            overflow: visible;
        }

        body {
            width: 100%;
            max-width: 80mm;
            margin: 0 auto;
            padding: 0;
            background: #ffffff;
            color: #000000;
            direction: rtl;
            unicode-bidi: embed;
            font-family: 'Cairo', 'Segoe UI', 'Arial', 'Tahoma', sans-serif;
            text-align: center;
            line-height: 1.4;
            font-size: 10pt;
            -webkit-font-smoothing: antialiased;
            overflow: visible;
            word-break: break-word;
            overflow-wrap: anywhere;
        }
        
        .receipt-wrapper {
            width: 100%;
            padding-top: 3mm;
            padding-bottom: 3mm;
            padding-left: 4mm;
            padding-right: 6mm;
            margin: 0 auto;
            box-sizing: border-box;
        }
        
        .store-logo {
            width: 29mm;
            height: 29mm;
            max-width: 29mm;
            max-height: 29mm;
            object-fit: contain;
            display: block;
            margin-left: auto;
            margin-right: auto;
            margin-bottom: 2mm;
            filter: grayscale(100%);
            image-rendering: -webkit-optimize-contrast;
            image-rendering: crisp-edges;
        }
        
        .report-title {
            font-size: 13pt;
            font-weight: 900;
            margin-top: 2mm;
            margin-bottom: 1mm;
            overflow-wrap: anywhere;
            word-break: break-word;
            padding-left: 1mm;
            padding-right: 1mm;
        }
        
        .report-subtitle {
            font-size: 9.5pt;
            font-weight: 700;
            margin-top: 1mm;
            margin-bottom: 1mm;
        }
        
        .cashier-info {
            font-size: 9pt;
            font-weight: 700;
            margin-top: 1.5mm;
            margin-bottom: 1.5mm;
            overflow-wrap: anywhere;
            word-break: break-word;
            padding-left: 1mm;
            padding-right: 1mm;
        }
        
        .datetime {
            font-size: 8pt;
            color: #555555;
            margin-top: 1mm;
            margin-bottom: 1mm;
            overflow-wrap: anywhere;
            word-break: break-word;
            padding-left: 1mm;
            padding-right: 1mm;
        }
        
        .divider {
            border-top: 1.5px dashed #000000;
            margin-top: 3mm;
            margin-bottom: 3mm;
            width: 100%;
        }
        
        .divider-thick {
            border-top: 2px solid #000000;
            margin-top: 3mm;
            margin-bottom: 3mm;
            width: 100%;
        }
        
        .report-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            margin-top: 2mm;
            margin-bottom: 2mm;
            font-size: 9pt;
            border: 1.5px solid #000000;
            break-inside: avoid;
        }
        
        .report-table thead th {
            padding-top: 1.5mm;
            padding-bottom: 1.5mm;
            padding-left: 1.5mm;
            padding-right: 1.5mm;
            border: 1px solid #000000;
            background: #e0e0e0;
            font-weight: 800;
            font-size: 9pt;
            text-align: center;
        }
        
        .report-table tbody td {
            padding-top: 1.5mm;
            padding-bottom: 1.5mm;
            padding-left: 2mm;
            padding-right: 2mm;
            border: 1px solid #cccccc;
            vertical-align: middle;
            overflow-wrap: anywhere;
            word-break: break-word;
            break-inside: avoid;
        }
        
        .report-table tbody td:first-child {
            width: 56%;
            text-align: start;
            font-weight: 600;
        }
        
        .report-table tbody td:last-child {
            width: 44%;
            text-align: end;
            font-weight: 700;
            font-variant-numeric: tabular-nums;
        }
        
        .report-table tbody tr.row-strong td {
            background: #f0f0f0;
            font-weight: 800;
            font-size: 9.5pt;
        }
        
        .report-table tbody tr.grand-total td {
            font-size: 11pt;
            font-weight: 900;
            background: #000000;
            color: #ffffff;
            border-color: #000000;
            padding-top: 2.5mm;
            padding-bottom: 2.5mm;
            padding-left: 2mm;
            padding-right: 2mm;
        }
        
        .footer-message {
            font-size: 9.5pt;
            font-weight: 700;
            margin-top: 3mm;
            margin-bottom: 1mm;
            text-align: center;
            padding-left: 1mm;
            padding-right: 1mm;
            overflow-wrap: anywhere;
            line-height: 1.5;
        }
        
        .powered-by {
            font-size: 7.5pt;
            color: #555555;
            margin-top: 2mm;
            text-align: center;
            padding-left: 1mm;
            padding-right: 1mm;
            overflow-wrap: anywhere;
        }
    </style>
</head>
<body>
    <div class="receipt-wrapper">
        ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" class="store-logo">` : ''}
        
        <div class="report-title">${restName}</div>
        <div class="report-subtitle">تقرير إغلاق الوردية (Z-Report)</div>
        
        <div class="cashier-info">${cashierName}</div>
        <div class="datetime">${datetime}</div>
        
        <div class="divider"></div>
        
        <table class="report-table">
            <thead>
                <tr><th colspan="2">مبيعات الوردية</th></tr>
            </thead>
            <tbody>
                <tr><td>الرصيد الافتتاحي</td><td>${floatCash}</td></tr>
                <tr><td>إجمالي الكاش</td><td>${cashSales}</td></tr>
                <tr><td>إجمالي الشبكة</td><td>${networkSales}</td></tr>
${deliveryPrintRows}
                <tr class="row-strong"><td>إجمالي الدخل</td><td>${totalIncome}</td></tr>
            </tbody>
        </table>
        
        <table class="report-table">
            <thead>
                <tr><th colspan="2">الضريبة</th></tr>
            </thead>
            <tbody>
                <tr><td>الضريبة</td><td>${tax}</td></tr>
            </tbody>
        </table>
        
        <table class="report-table">
            <thead>
                <tr><th colspan="2">التعديلات والدرج</th></tr>
            </thead>
            <tbody>
                <tr><td>المرتجعات</td><td style="color:#c00;">${returns}</td></tr>
                <tr><td>المصروفات</td><td style="color:#c00;">${expenses}</td></tr>
                <tr class="row-strong"><td>رصيد الدرج</td><td>${drawer}</td></tr>
            </tbody>
        </table>
        
        <div class="divider-thick"></div>
        
        <table class="report-table">
            <tbody>
                <tr class="grand-total"><td>إجمالي المبيعات</td><td>${grandTotal}</td></tr>
            </tbody>
        </table>
        
        <div class="footer-message">
            تم إغلاق الوردية<br>
            شكراً لجهودكم!
        </div>
        <div class="powered-by">${shiftPrintFooter}</div>
    </div>
</body>
</html>`;

        try {
            const cashierPrinter = localStorage.getItem('cashier_printer') || '';
            console.log('📤 Sending to printer:', cashierPrinter || 'Default');
            
            const pr2 = await ipcRenderer.invoke('print-to-device', { html: html, printerName: cashierPrinter });
            if (pr2 && pr2.debug) console.log('[طباعة وردية — تشخيص]', pr2.debug);
            if (!pr2 || !pr2.success) console.warn('[طباعة وردية]', pr2);
            else console.log('✅ Shift report printed successfully');
        } catch(e) { 
            console.error('❌ Z-Report print failed:', e); 
            alert('حدث خطأ في طباعة التقرير: ' + e.message);
        }
    };


});
