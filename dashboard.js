document.addEventListener('DOMContentLoaded', async () => {

    function curPlain(n) {
        return window.HashCurrency ? HashCurrency.format(n) : Number(n).toFixed(2) + ' ر.س';
    }
    function curNum(n) {
        return window.HashCurrency ? HashCurrency.formatNumber(n) : Number(n).toFixed(2);
    }
    function curSym() {
        return window.HashCurrency ? HashCurrency.getConfig().symbol : 'ر.س';
    }

    const { getReceiptFooterLine, escapeHtmlPrint } = require('./thermal-receipt-updated.js');

    const kpiValues = document.querySelectorAll('.kpi-card .kpi-value');
    if(!kpiValues || kpiValues.length < 5) return; // Not on index page

    let dashboardChart = null;
    /** الفترة المعروضة حالياً — تُحدَّث عند تغيير أزرار اليوم/الأسبوع ليعاد التحميل بعد المزامنة */
    let currentDashboardPeriod = 'today';
    async function loadDashboardData(period = 'today') {
        let db = await window.dbRead();
        let orders = db.orders || [];
        let returns = db.returns || [];
        
        // Combine all expenses into one central expense array to be subtracted during shift close
        let hrExpenses = (db.hrExpenses || []).concat(db.expenses || []);

        const lastZReport = parseInt(localStorage.getItem('last_z_report_time')) || 0;

        // Apply global date filter and Z-report session cutoff
        if(window.isDateInPeriod) {
            orders = orders.filter(o => 
                window.isDateInPeriod(o.timestamp || o.dateStr || o.date, period) && 
                ((o.timestamp || o.createdAt || Date.now()) >= lastZReport)
            );
            returns = returns.filter(r => 
                window.isDateInPeriod(r.timestamp || r.date, period) &&
                ((r.timestamp || Date.now()) >= lastZReport)
            );
            hrExpenses = hrExpenses.filter(h => 
                window.isDateInPeriod(h.timestamp || h.date, period) &&
                ((h.timestamp || new Date(h.date).getTime()) >= lastZReport)
            );
        }

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

    orders.forEach(o => {
        dailySales += o.total;
        
        // حساب الضريبة المشمولة من الإجمالي = الإجمالي - (الإجمالي / (1 + النسبة))
        let orderTax = o.total - (o.total / (1 + TAX_RATE));
        totalTax += orderTax;

        if(o.paymentMethod && o.paymentMethod.includes('كاش')) {
            cashSales += o.total;
        } else {
            networkSales += o.total;
        }

        if(Array.isArray(o.items)) {
            o.items.forEach(itm => {
                totalItemsNum += itm.qty;
                if(!itemSalesMap[itm.name]) {
                    itemSalesMap[itm.name] = { qty: 0, revenue: 0, category: 'موجبات' };
                }
                itemSalesMap[itm.name].qty += itm.qty;
                itemSalesMap[itm.name].revenue += (itm.price * itm.qty);
            });
        }
    });

    returns.forEach(r => {
        dailySales -= r.amount;
        totalReturnsAmt += r.amount;
        if(r.method && r.method.includes('كاش')) {
            cashSales -= r.amount;
        } else {
            networkSales -= r.amount;
        }
    });

    let totalExp = 0;
    hrExpenses.forEach(h => totalExp += h.amount);

    let shiftCashFloat = parseFloat(localStorage.getItem('shift_cash_float')) || 0;
    // Only cash goes to drawer
    let drawerBalance = shiftCashFloat + cashSales - totalExp + (totalReturnsAmt < 0 ? 0 : 0); // returns are handled in cashSales directly since cashSales -= r.amount

    window.__dashboardData = { dailySales, cashSales, networkSales, totalTax, totalReturnsAmt, totalExp, shiftCashFloat, drawerBalance };

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


    // --- 2. POPULATE RECENT ORDERS TABLE (Latest 5) ---
    const tbody = document.querySelector('.recent-orders tbody');
    if(tbody) {
        tbody.innerHTML = '';
        
        let recent = [...orders].reverse().slice(0, 5); // Last 5
        
        if(recent.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-muted)">لا توجد طلبات حديثة اليوم</td></tr>`;
        } else {
            recent.forEach(o => {
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

                const tr = `
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
                tbody.insertAdjacentHTML('beforeend', tr);
            });
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
                cat: itemSalesMap[k].category
            };
        }).sort((a,b) => b.qty - a.qty).slice(0, 4); // Top 4

        itemsContainer.innerHTML = '';

        if(topItems.length === 0) {
            itemsContainer.innerHTML = `<div style="padding:30px; text-align:center; color:var(--text-muted)">لا توجد مبيعات بعد</div>`;
        } else {
            topItems.forEach(itm => {
                const tr = `
                <div class="item-row">
                    <div style="width:45px; height:45px; border-radius:8px; background:rgba(59, 130, 246, 0.1); display:flex; align-items:center; justify-content:center; color:var(--accent-blue); font-size:24px;">
                        <i class="ph-fill ph-pizza"></i>
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
                `;
                itemsContainer.insertAdjacentHTML('beforeend', tr);
            });
        }
    }


    // --- 4. RENDER CHART ---
    const ctxCanvas = document.getElementById('salesChart');
    if(ctxCanvas && typeof Chart !== 'undefined') {
        const ctx = ctxCanvas.getContext('2d');
        let fakeData = [
            dailySales * 0.4, dailySales * 0.7, dailySales * 0.5, 
            dailySales * 0.9, dailySales * 0.6, dailySales * 1.1, dailySales
        ];

        if(dashboardChart) dashboardChart.destroy();
        dashboardChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'اليوم'],
                datasets: [{
                    label: 'إجمالي المبيعات (' + curSym() + ')',
                    data: fakeData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 3, tension: 0.4, fill: true,
                    pointBackgroundColor: '#10b981', pointBorderWidth: 2, pointRadius: 4,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false, drawBorder: false }, ticks: { color: 'rgba(255,255,255,0.5)', font: { family: 'Cairo' } } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.5)', font: { family: 'Cairo' } } }
                }
            }
        });
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
            loadDashboardData(currentDashboardPeriod);
        });
    });

    // Initial Load
    const activeBtn = document.querySelector('.time-filters .filter-btn.active');
    let initPeriod = 'today';
    if(activeBtn) {
        initPeriod = activeBtn.dataset.period || (activeBtn.innerText.includes('اليوم') ? 'today' : (activeBtn.innerText.includes('الأمس') ? 'yesterday' : 'week'));
    }
    currentDashboardPeriod = initPeriod;
    await loadDashboardData(initPeriod);

    if (typeof window.registerPosDatabaseRefresh === 'function') {
        window.registerPosDatabaseRefresh(() => loadDashboardData(currentDashboardPeriod));
    }

    // --- 5. SHIFT REPORT MODAL LOGIC ---
    window.openShiftFloatModal = function() {
        const currentFloat = localStorage.getItem('shift_cash_float') || 0;
        const modal = document.getElementById('floatModal');
        const input = document.getElementById('floatInput');
        if(modal && input) {
            input.value = currentFloat;
            modal.style.display = 'flex';
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
        if(modal) modal.style.display = 'none';
    };

    window.saveShiftFloatModal = function() {
        const input = document.getElementById('floatInput');
        if(input) {
            const val = parseFloat(input.value) || 0;
            localStorage.setItem('shift_cash_float', val);
            alert('تم تعيين الرصيد الافتتاحي للدرج بنجاح.');
            window.location.reload();
        }
    };

    window.openShiftReport = function() {
        const modal = document.getElementById('shiftReportModal');
        if(!modal) return;
        
        const now = new Date();
        document.getElementById('shift-datetime').innerText = now.toLocaleString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

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
                const displayName = (s.name && s.name !== 'هش HASH' && s.name !== 'هـــش HASH') ? s.name : 'هش HASH';
                const shiftNameEl = document.getElementById('shift-res-name');
                if (shiftNameEl) shiftNameEl.innerText = displayName;
                const shiftLogoEl = document.getElementById('shift-logo');
                if (shiftLogoEl && s.logo) {
                    shiftLogoEl.src = s.logo;
                } else if (shiftLogoEl) {
                    shiftLogoEl.src = '1111.png';
                }
            } catch(e){}
        } else {
            const shiftLogoEl = document.getElementById('shift-logo');
            if (shiftLogoEl) shiftLogoEl.src = '1111.png';
        }
        
        const d = window.__dashboardData || { dailySales:0, cashSales:0, networkSales:0, totalTax:0, totalReturnsAmt:0, totalExp:0, shiftCashFloat:0, drawerBalance:0 };

        document.getElementById('shift-float-cash').innerText = curPlain(d.shiftCashFloat);
        document.getElementById('shift-cash').innerText = curPlain(d.cashSales);
        document.getElementById('shift-network').innerText = curPlain(d.networkSales);
        document.getElementById('shift-total-income').innerText = curPlain(d.cashSales + d.networkSales);
        
        document.getElementById('shift-tax').innerText = curPlain(d.totalTax);
        document.getElementById('shift-returns').innerText = curPlain(d.totalReturnsAmt);
        document.getElementById('shift-expenses').innerText = curPlain(d.totalExp);
        
        document.getElementById('shift-drawer').innerText = curPlain(d.drawerBalance);
        
        document.getElementById('shift-grand-total').innerText = curPlain(d.dailySales);

        modal.style.display = 'flex';
    };

    window.closeShiftReport = function() {
        const modal = document.getElementById('shiftReportModal');
        if(modal) modal.style.display = 'none';
    };

    window.confirmCloseShift = async function() {
        if(!confirm('هل أنت متأكد من إغلاق الوردية وبدء وردية جديدة بـ 0.00؟')) return;

        const closeTime = Date.now();

        // ─── حفظ وقت إغلاق الوردية في قائمة التواريخ — لإعادة بناء التقرير لاحقاً ───
        let zTimestamps = [];
        try { zTimestamps = JSON.parse(localStorage.getItem('z_report_timestamps') || '[]'); } catch(e){}
        const lastZTime = parseInt(localStorage.getItem('last_z_report_time')) || 0;

        // اجمع بيانات الكاشير
        const currentUserConf = localStorage.getItem('currentUser');
        let cashierName = 'موظف';
        if (currentUserConf) { try { const p = JSON.parse(currentUserConf); if (p.username || p.name) cashierName = p.username || p.name; } catch(e){} }

        zTimestamps.push({ startTime: lastZTime || closeTime - 3600000, endTime: closeTime, cashierName });
        localStorage.setItem('z_report_timestamps', JSON.stringify(zTimestamps));

        // Mark current time as start of new shift
        localStorage.setItem('last_z_report_time', closeTime);
        localStorage.setItem('shift_cash_float', 0);

        alert('تم إغلاق الوردية وتصفير الدرج بنجاح. أي مبيعات قادمة ستحسب للوردية الجديدة.');
        window.location.reload();
    };


    // =============================================
    // DAY CLOSE REPORT LOGIC
    // =============================================

    window.openDayCloseReport = async function() {
        const modal = document.getElementById('dayCloseModal');
        if (!modal) return;

        const now = new Date();
        const todayStr = now.toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        // Fill header
        document.getElementById('day-datetime').innerText = now.toLocaleString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
                const displayName = (s.name && s.name !== 'هش HASH' && s.name !== 'هـــش HASH') ? s.name : 'هش HASH';
                document.getElementById('day-res-name').innerText = displayName;
                // شعار المطعم
                const dayLogoEl = document.getElementById('day-logo');
                if (dayLogoEl && s.logo && s.logo !== '1111.png' && s.logo !== '1(1).png') {
                    dayLogoEl.src = s.logo;
                }
            } catch(e){}
        }

        // Get tax rate
        let taxRate = 15;
        if (sysSet) { try { const s = JSON.parse(sysSet); if (s.taxRate !== undefined) taxRate = parseFloat(s.taxRate); } catch(e){} }
        const TAX_RATE = taxRate / 100;

        // Read database
        let db = await window.dbRead();
        let allOrders = db.orders || [];
        let allReturns = db.returns || [];
        let allHrExpenses = (db.hrExpenses || []).concat(db.expenses || []);

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
            const rOrders   = todayOrders.filter(o   => { const t = o.timestamp || o.createdAt || 0; return t >= range.startTime && t < range.endTime; });
            const rReturns  = todayReturns.filter(r  => { const t = r.timestamp || new Date(r.date||0).getTime() || 0; return t >= range.startTime && t < range.endTime; });
            const rExpenses = todayExpenses.filter(e => { const t = e.timestamp || new Date(e.date||0).getTime() || 0; return t >= range.startTime && t < range.endTime; });

            let cash = 0, net = 0, tax = 0, ret = 0, exp = 0;
            rOrders.forEach(o => {
                tax += o.total - (o.total / (1 + TAX_RATE));
                if (o.paymentMethod && o.paymentMethod.includes('كاش')) cash += o.total;
                else net += o.total;
            });
            rReturns.forEach(r => {
                ret += r.amount;
                if (r.method && r.method.includes('كاش')) cash -= r.amount;
                else net -= r.amount;
            });
            rExpenses.forEach(ex => exp += ex.amount);

            const floatAmt = range.isCurrent ? shiftFloat : 0;

            return {
                ...range,
                ordersCount: rOrders.length,
                cashSales: cash,
                networkSales: net,
                totalTax: tax,
                totalReturns: ret,
                totalExpenses: exp,
                drawerBalance: floatAmt + cash - exp
            };
        });

        // ---- Grand Day Totals ----
        let dayTotalCash = 0, dayTotalNet = 0, dayTotalTax = 0, dayTotalRet = 0, dayTotalExp = 0, dayTotalOrders = 0;
        allDayShifts.forEach(s => {
            dayTotalCash    += s.cashSales    || 0;
            dayTotalNet     += s.networkSales || 0;
            dayTotalTax     += s.totalTax     || 0;
            dayTotalRet     += s.totalReturns || 0;
            dayTotalExp     += s.totalExpenses|| 0;
            dayTotalOrders  += s.ordersCount  || 0;
        });
        const dayTotalIncome = dayTotalCash + dayTotalNet;
        const dayNetTotal    = dayTotalIncome - dayTotalRet - dayTotalExp;

        // Populate summary
        document.getElementById('day-shifts-count').innerText  = allDayShifts.length + ' وردية';
        document.getElementById('day-orders-count').innerText  = dayTotalOrders + ' طلب';
        document.getElementById('day-total-cash').innerText    = curPlain(dayTotalCash);
        document.getElementById('day-total-network').innerText = curPlain(dayTotalNet);
        document.getElementById('day-total-income').innerText  = curPlain(dayTotalIncome);
        document.getElementById('day-total-tax').innerText     = curPlain(dayTotalTax);
        document.getElementById('day-total-returns').innerText = curPlain(dayTotalRet);
        document.getElementById('day-total-expenses').innerText= curPlain(dayTotalExp);
        document.getElementById('day-net-total').innerText     = curPlain(dayNetTotal);

        // ---- Render Per-Shift Breakdown ----
        const breakdownEl = document.getElementById('day-shifts-breakdown');
        breakdownEl.innerHTML = '';

        allDayShifts.forEach((s, idx) => {
            const sStart = new Date(s.startTime).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
            const sEnd   = s.isCurrent ? 'الآن' : new Date(s.endTime).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
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
                    <div class="receipt-row"><span>إجمالي الدخل:</span><span style="font-weight:800;">${curPlain(parseFloat(sIncome)||0)}</span></div>
                    <div class="receipt-row"><span>المرتجعات:</span><span style="color:#c00;">${curPlain(s.totalReturns||0)}</span></div>
                    <div class="receipt-row"><span>المصروفات:</span><span style="color:#c00;">${curPlain(s.totalExpenses||0)}</span></div>
                    <div class="receipt-row"><span>رصيد الدرج:</span><span style="font-weight:800; color:#047857;">${curPlain(s.drawerBalance||0)}</span></div>
                </div>
            `);
        });

        // Store snapshot for confirmCloseDay
        window.__dayCloseSnapshot = { allDayShifts, dayTotalCash, dayTotalNet, dayTotalTax, dayTotalRet, dayTotalExp, dayTotalIncome, dayNetTotal, dayTotalOrders, dayDate: todayStr, closedAt: now.getTime() };

        modal.style.display = 'flex';
    };

    window.closeDayCloseReport = function() {
        const modal = document.getElementById('dayCloseModal');
        if (modal) modal.style.display = 'none';
    };

    window.confirmCloseDay = function() {
        if (!confirm('هل أنت متأكد من إقفال اليوم بالكامل؟\nسيتم حفظ سجل كامل لكل الورديات وإعادة تعيين النظام ليوم جديد.')) return;

        const snap = window.__dayCloseSnapshot || {};

        // Save day summary to day_history in localStorage
        let dayHistory = [];
        try { dayHistory = JSON.parse(localStorage.getItem('day_history') || '[]'); } catch(e){}

        dayHistory.push({
            date: snap.dayDate,
            closedAt: snap.closedAt || Date.now(),
            shiftsCount: (snap.allDayShifts || []).length,
            ordersCount: snap.dayTotalOrders || 0,
            totalCash: snap.dayTotalCash || 0,
            totalNetwork: snap.dayTotalNet || 0,
            totalIncome: snap.dayTotalIncome || 0,
            totalTax: snap.dayTotalTax || 0,
            totalReturns: snap.dayTotalRet || 0,
            totalExpenses: snap.dayTotalExp || 0,
            netTotal: snap.dayNetTotal || 0,
            shifts: snap.allDayShifts || []
        });
        localStorage.setItem('day_history', JSON.stringify(dayHistory));

        // Close all shifts — reset shift time to NOW and zero the drawer
        localStorage.setItem('last_z_report_time', Date.now());
        localStorage.setItem('shift_cash_float', 0);

        // Also clear z_report_timestamps (day closed, fresh start)
        localStorage.setItem('z_report_timestamps', '[]');
        // Also clear shift_history (legacy)
        localStorage.setItem('shift_history', '[]');

        alert('✅ تم إقفال اليوم بالكامل بنجاح!\nبيانات اليوم محفوظة. أي مبيعات جديدة ستحسب لليوم الجديد.');
        window.location.reload();
    };

    window.printDayReport = async function() {
        const { ipcRenderer } = require('electron');
        const path = require('path');
        const fs = require('fs');
        
        // Get restaurant settings
        const sysSet = localStorage.getItem('restaurant_settings');
        let restName = 'هش HASH';
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
                const defaultLogo = path.join(__dirname, '1111.png');
                if (fs.existsSync(defaultLogo)) {
                    const logoBuffer = fs.readFileSync(defaultLogo);
                    logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
                }
            } catch(e) {}
        }

        // Get data from the modal
        const managerName = document.getElementById('day-cashier-name').innerText;
        const datetime = document.getElementById('day-datetime').innerText;
        const date = document.getElementById('day-date').innerText;
        
        // Collect all rows from day report
        const totalOrders = document.getElementById('day-total-orders')?.innerText || '0';
        const totalCash = document.getElementById('day-total-cash')?.innerText || curPlain(0);
        const totalNetwork = document.getElementById('day-total-network')?.innerText || curPlain(0);
        const totalIncome = document.getElementById('day-total-income')?.innerText || curPlain(0);
        const totalTax = document.getElementById('day-total-tax')?.innerText || curPlain(0);
        const totalReturns = document.getElementById('day-total-returns')?.innerText || curPlain(0);
        const totalExpenses = document.getElementById('day-total-expenses')?.innerText || curPlain(0);
        const netTotal = document.getElementById('day-net-total')?.innerText || curPlain(0);

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
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        
        @page {
            size: 80mm auto;
            margin: 0;
            padding: 0;
        }
        
        body {
            font-family: 'Segoe UI', 'Cairo', 'Arial', sans-serif;
            margin: 0;
            padding: 0;
            width: 80mm;
            max-width: 80mm;
            min-width: 72mm;
            background: #ffffff;
            color: #000000;
            direction: rtl;
            text-align: center;
            line-height: 1.35;
            font-size: 12px;
            -webkit-font-smoothing: antialiased;
        }
        
        .receipt-wrapper {
            width: 80mm;
            max-width: 80mm;
            padding: 3mm 2mm;
            margin: 0 auto;
        }
        
        .store-logo {
            width: 15mm;
            height: 15mm;
            max-width: 15mm;
            max-height: 15mm;
            object-fit: contain;
            margin: 0 auto 2mm auto;
            display: block;
            filter: grayscale(100%) contrast(120%);
        }
        
        .report-title {
            font-size: 16px;
            font-weight: 900;
            margin: 2mm 0 1mm 0;
        }
        
        .report-subtitle {
            font-size: 12px;
            font-weight: 700;
            margin: 1mm 0;
        }
        
        .manager-info {
            font-size: 11px;
            font-weight: 700;
            margin: 1.5mm 0;
        }
        
        .datetime {
            font-size: 10px;
            color: #555555;
            margin: 1mm 0;
        }
        
        .divider {
            border-top: 1.5px dashed #000000;
            margin: 3mm 0;
            width: 100%;
        }
        
        .divider-thick {
            border-top: 2px solid #000000;
            margin: 3mm 0;
            width: 100%;
        }
        
        .row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1.5mm 0;
            gap: 2mm;
            font-size: 11px;
        }
        
        .row-label {
            text-align: right;
            flex: 1;
            font-weight: 600;
        }
        
        .row-value {
            text-align: left;
            font-weight: 600;
            min-width: 0;
            max-width: 48%;
            overflow-wrap: anywhere;
            word-break: break-word;
        }
        
        .row.bold {
            font-size: 13px;
            font-weight: 800;
        }
        
        .row.highlight {
            background: #f0f0f0;
            padding: 2mm;
            margin: 2mm 0;
            border-radius: 1mm;
        }
        
        .row.grand-total {
            font-size: 14px;
            font-weight: 900;
            background: #000000;
            color: #ffffff;
            padding: 2.5mm;
            margin-top: 3mm;
            border-radius: 1mm;
        }
        
        .footer-message {
            font-size: 11px;
            font-weight: 700;
            margin: 3mm 0 1mm 0;
            text-align: center;
        }
        
        .powered-by {
            font-size: 8px;
            color: #666666;
            margin-top: 2mm;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="receipt-wrapper">
        <!-- Logo -->
        ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" class="store-logo">` : ''}
        
        <!-- Title -->
        <div class="report-title">${restName}</div>
        <div class="report-subtitle">تقرير إقفال اليوم الكامل (X-Report)</div>
        
        <!-- Manager & Date -->
        <div class="manager-info">${managerName}</div>
        <div class="datetime">${date} - ${datetime}</div>
        
        <div class="divider"></div>
        
        <!-- Summary -->
        <div style="text-align:center; background:#f0f0f0; padding:2mm; border-radius:1mm; font-weight:800; font-size:11px; margin-bottom:3mm;">
            ▌ ملخص اليوم الكامل
        </div>
        
        <!-- Financial Details -->
        <div class="row">
            <span class="row-label">عدد الطلبات:</span>
            <span class="row-value">${totalOrders}</span>
        </div>
        <div class="row">
            <span class="row-label">إجمالي الكاش:</span>
            <span class="row-value">${totalCash}</span>
        </div>
        <div class="row">
            <span class="row-label">إجمالي الشبكة:</span>
            <span class="row-value">${totalNetwork}</span>
        </div>
        <div class="row bold highlight">
            <span class="row-label">إجمالي الدخل:</span>
            <span class="row-value">${totalIncome}</span>
        </div>
        
        <div class="divider"></div>
        
        <div class="row">
            <span class="row-label">الضريبة:</span>
            <span class="row-value">${totalTax}</span>
        </div>
        <div class="row">
            <span class="row-label">المرتجعات:</span>
            <span class="row-value" style="color:#c00;">${totalReturns}</span>
        </div>
        <div class="row">
            <span class="row-label">المصروفات:</span>
            <span class="row-value" style="color:#c00;">${totalExpenses}</span>
        </div>
        
        <div class="divider-thick"></div>
        
        <!-- Grand Total -->
        <div class="row grand-total">
            <span class="row-label">صافي اليوم:</span>
            <span class="row-value">${netTotal}</span>
        </div>
        
        <!-- Footer -->
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
            
            await ipcRenderer.invoke('print-to-device', { html: html, printerName: cashierPrinter });
            
            console.log('✅ Day report printed successfully');
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
        let restName = 'هش HASH';
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
                const defaultLogo = path.join(__dirname, '1111.png');
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
        const totalIncome = document.getElementById('shift-total-income').innerText;
        const tax = document.getElementById('shift-tax').innerText;
        const returns = document.getElementById('shift-returns').innerText;
        const expenses = document.getElementById('shift-expenses').innerText;
        const drawer = document.getElementById('shift-drawer').innerText;
        const grandTotal = document.getElementById('shift-grand-total').innerText;

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
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        
        @page {
            size: 80mm auto;
            margin: 0;
            padding: 0;
        }
        
        body {
            font-family: 'Segoe UI', 'Cairo', 'Arial', sans-serif;
            margin: 0;
            padding: 0;
            width: 80mm;
            max-width: 80mm;
            min-width: 72mm;
            background: #ffffff;
            color: #000000;
            direction: rtl;
            text-align: center;
            line-height: 1.35;
            font-size: 12px;
            -webkit-font-smoothing: antialiased;
        }
        
        .receipt-wrapper {
            width: 80mm;
            max-width: 80mm;
            padding: 3mm 2mm;
            margin: 0 auto;
        }
        
        .store-logo {
            width: 15mm;
            height: 15mm;
            max-width: 15mm;
            max-height: 15mm;
            object-fit: contain;
            margin: 0 auto 2mm auto;
            display: block;
            filter: grayscale(100%) contrast(120%);
        }
        
        .report-title {
            font-size: 16px;
            font-weight: 900;
            margin: 2mm 0 1mm 0;
        }
        
        .report-subtitle {
            font-size: 12px;
            font-weight: 700;
            margin: 1mm 0;
        }
        
        .cashier-info {
            font-size: 11px;
            font-weight: 700;
            margin: 1.5mm 0;
        }
        
        .datetime {
            font-size: 10px;
            color: #555555;
            margin: 1mm 0;
        }
        
        .divider {
            border-top: 1.5px dashed #000000;
            margin: 3mm 0;
            width: 100%;
        }
        
        .divider-thick {
            border-top: 2px solid #000000;
            margin: 3mm 0;
            width: 100%;
        }
        
        .row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1.5mm 0;
            gap: 2mm;
            font-size: 11px;
        }
        
        .row-label {
            text-align: right;
            flex: 1;
            font-weight: 600;
        }
        
        .row-value {
            text-align: left;
            font-weight: 600;
            min-width: 0;
            max-width: 48%;
            overflow-wrap: anywhere;
            word-break: break-word;
        }
        
        .row.bold {
            font-size: 13px;
            font-weight: 800;
        }
        
        .row.highlight {
            background: #f0f0f0;
            padding: 2mm;
            margin: 2mm 0;
            border-radius: 1mm;
        }
        
        .row.grand-total {
            font-size: 14px;
            font-weight: 900;
            background: #000000;
            color: #ffffff;
            padding: 2.5mm;
            margin-top: 3mm;
            border-radius: 1mm;
        }
        
        .footer-message {
            font-size: 11px;
            font-weight: 700;
            margin: 3mm 0 1mm 0;
            text-align: center;
        }
        
        .powered-by {
            font-size: 8px;
            color: #666666;
            margin-top: 2mm;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="receipt-wrapper">
        <!-- Logo -->
        ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" class="store-logo">` : ''}
        
        <!-- Title -->
        <div class="report-title">${restName}</div>
        <div class="report-subtitle">تقرير إغلاق الوردية (Z-Report)</div>
        
        <!-- Cashier & Date -->
        <div class="cashier-info">${cashierName}</div>
        <div class="datetime">${datetime}</div>
        
        <div class="divider"></div>
        
        <!-- Financial Details -->
        <div class="row">
            <span class="row-label">الرصيد الافتتاحي:</span>
            <span class="row-value">${floatCash}</span>
        </div>
        <div class="row">
            <span class="row-label">إجمالي الكاش:</span>
            <span class="row-value">${cashSales}</span>
        </div>
        <div class="row">
            <span class="row-label">إجمالي الشبكة:</span>
            <span class="row-value">${networkSales}</span>
        </div>
        <div class="row bold highlight">
            <span class="row-label">إجمالي الدخل:</span>
            <span class="row-value">${totalIncome}</span>
        </div>
        
        <div class="divider"></div>
        
        <div class="row">
            <span class="row-label">الضريبة:</span>
            <span class="row-value">${tax}</span>
        </div>
        
        <div class="divider"></div>
        
        <div class="row">
            <span class="row-label">المرتجعات:</span>
            <span class="row-value" style="color:#c00;">${returns}</span>
        </div>
        <div class="row">
            <span class="row-label">المصروفات:</span>
            <span class="row-value" style="color:#c00;">${expenses}</span>
        </div>
        <div class="row bold highlight">
            <span class="row-label">رصيد الدرج:</span>
            <span class="row-value">${drawer}</span>
        </div>
        
        <div class="divider-thick"></div>
        
        <!-- Grand Total -->
        <div class="row grand-total">
            <span class="row-label">إجمالي المبيعات:</span>
            <span class="row-value">${grandTotal}</span>
        </div>
        
        <!-- Footer -->
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
            
            await ipcRenderer.invoke('print-to-device', { html: html, printerName: cashierPrinter });
            
            console.log('✅ Shift report printed successfully');
        } catch(e) { 
            console.error('❌ Z-Report print failed:', e); 
            alert('حدث خطأ في طباعة التقرير: ' + e.message);
        }
    };

});
