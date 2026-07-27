const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', async () => {

    const curNum = (n) => (window.MisterCasherCurrency ? MisterCasherCurrency.formatNumber(n) : Number(n).toFixed(2));
    const curSym = () => (window.MisterCasherCurrency ? MisterCasherCurrency.getConfig().symbol : 'ر.س');
    const curFmt = (n) => (window.MisterCasherCurrency ? MisterCasherCurrency.format(n) : Number(n).toFixed(2) + ' ر.س');

    let currentStatsRange = 'today';

    // --- Date Filter Buttons ---
    const dateBtns = document.querySelectorAll('.date-btn');
    dateBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            dateBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentStatsRange = e.target.dataset.range || 'all';
            await fetchRealDataAndUpdateCharts(currentStatsRange);
        });
    });

    // --- Chart.js Global Defaults ---
    const isLight = document.body.classList.contains('light-theme');
    Chart.defaults.color = isLight ? '#64748b' : 'rgba(255, 255, 255, 0.5)';
    Chart.defaults.font.family = "'Cairo', sans-serif";
    Chart.defaults.font.size = 13;

    let mainTrendChart = null;
    let categoryDonutChart = null;

    function initCharts() {
        const ctxTrend = document.getElementById('mainTrendChart').getContext('2d');
        const gradientRev = ctxTrend.createLinearGradient(0, 0, 0, 400);
        gradientRev.addColorStop(0, 'rgba(16, 185, 129, 0.5)');
        gradientRev.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

        const gradientExp = ctxTrend.createLinearGradient(0, 0, 0, 400);
        gradientExp.addColorStop(0, 'rgba(239, 68, 68, 0.4)');
        gradientExp.addColorStop(1, 'rgba(239, 68, 68, 0.0)');

        mainTrendChart = new Chart(ctxTrend, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'الإيرادات المحققة',
                        data: [],
                        borderColor: '#10b981',
                        backgroundColor: gradientRev,
                        borderWidth: 3, tension: 0.4, fill: true, pointRadius: 4,
                    },
                    {
                        label: 'المصروفات الفعلية',
                        data: [],
                        borderColor: '#ef4444',
                        backgroundColor: gradientExp,
                        borderWidth: 3, tension: 0.4, fill: true, pointRadius: 4,
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { position: 'top', labels: { usePointStyle: true } } },
                scales: {
                    y: { beginAtZero: true, grid: { color: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)' } },
                    x: { grid: { display: false } }
                }
            }
        });

        const ctxDonut = document.getElementById('categoryDonutChart').getContext('2d');
        categoryDonutChart = new Chart(ctxDonut, {
            type: 'doughnut',
            data: {
                labels: ['مبيعات نقدية (كاش)', 'مبيعات شبكة'],
                datasets: [{
                    data: [0, 0],
                    backgroundColor: ['#3b82f6', '#10b981'],
                    borderWidth: 0, hoverOffset: 10
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '75%',
                plugins: { legend: { position: 'right', labels: { usePointStyle: true } } }
            }
        });
    }

    initCharts();

    window.addEventListener('themeChanged', () => {
        const isL = document.body.classList.contains('light-theme') || document.documentElement.getAttribute('data-theme') === 'light';
        Chart.defaults.color = isL ? '#64748b' : 'rgba(255, 255, 255, 0.5)';
        if (mainTrendChart) {
            mainTrendChart.options.scales.y.grid.color = isL ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';
            mainTrendChart.update('none');
        }
        if (categoryDonutChart) {
            categoryDonutChart.update('none');
        }
    });

    // ======================================================
    // MAIN DATA FETCH & RENDER
    // ======================================================
    async function fetchRealDataAndUpdateCharts(range = 'all') {
        const _db = (await window.dbReadSlice(['returns', 'hrExpenses', 'purchases'])) || {};

        // Live orders from SQLite (Optimize load time for 'today')
        const method = (range === 'today') ? 'db-get-orders' : 'db-get-orders-all';
        let orders = await ipcRenderer.invoke(method) || [];

        // Other data from JSON DB
        let returns    = _db.returns    || [];
        let hrExpenses = _db.hrExpenses || [];
        let purchases  = _db.purchases  || [];

        // Keep unfiltered copies for the trend chart (we filter inside buildTrendBuckets)
        const allOrders     = orders;
        const allHRExp      = hrExpenses;
        const allPurchases  = purchases;

        // --- Filter by date range for KPIs ---
        if (range !== 'all' && window.isDateInPeriod) {
            orders     = orders.filter(o => o.status !== 'returned' && window.isDateInPeriod(o.timestamp || o.dateStr || o.date, range));
            returns    = returns.filter(r => window.isDateInPeriod(r.timestamp || r.date, range));
            hrExpenses = hrExpenses.filter(h => window.isDateInPeriod(h.timestamp || h.date, range));
            purchases  = purchases.filter(p => window.isDateInPeriod(p.date, range));
        } else {
            // Even in 'all' view, we should exclude returned orders from the count if we want to match KPIs
            orders = orders.filter(o => o.status !== 'returned');
        }

        // ---- Revenue ----
        let totalRevenue = 0;
        let cashSales = 0;
        let cardSales = 0;
        let deliveryBreakdown = {};

        function splitOrderAmounts(o) {
            if (window.PaymentSplit) {
                const pay = window.PaymentSplit.splitOrderAmounts(o);
                // أولوية: حقل deliveryCompany الصريح، ثم paymentMethod إذا كان اسم شركة، ثم 'توصيل' كقيمة عامة
                const compName = o.deliveryCompany ||
                    (o.hungerStation === true
                        ? (o.paymentMethod && o.paymentMethod !== 'توصيل' ? o.paymentMethod : 'هنقرستيشن')
                        : (o.orderType === 'توصيل' && o.paymentMethod && o.paymentMethod !== 'توصيل'
                            ? o.paymentMethod
                            : 'توصيل'));
                const deliveryAmount = pay.hungerStation > 0 ? pay.hungerStation : 0;
                return {
                    cash: pay.cash,
                    card: pay.network,
                    deliveryAmount,
                    compName: deliveryAmount > 0 ? compName : undefined,
                };
            }
            const pm = String(o.paymentMethod || '').trim();
            const total = Number(o.total) || 0;
            const isDelivery = o.hungerStation === true || o.orderType === 'توصيل';
            if (isDelivery) {
                const compName = o.deliveryCompany || pm || 'توصيل';
                return { cash: 0, card: 0, deliveryAmount: total, compName };
            }
            if (pm.includes('كاش') || pm === 'cash') return { cash: total, card: 0, deliveryAmount: 0 };
            return { cash: 0, card: total, deliveryAmount: 0 };
        }

        function splitReturnAmounts(r) {
            const pm = String(r.method || '').trim();
            const amount = Number(r.amount) || 0;
            if (pm === 'مجزأ') {
                const c = Number(r.splitCash) || 0;
                const n = Number(r.splitNetwork) || 0;
                if (c || n) return { cash: c, card: n };
                return { cash: 0, card: amount };
            }
            if (pm.includes('كاش') || pm === 'cash') return { cash: amount, card: 0 };
            return { cash: 0, card: amount };
        }

        orders.forEach(o => {
            totalRevenue += (Number(o.total) || 0);
            const pay = splitOrderAmounts(o);
            cashSales += pay.cash;
            cardSales += pay.card;
            
            if (pay.deliveryAmount > 0 && pay.compName) {
                if (!deliveryBreakdown[pay.compName]) deliveryBreakdown[pay.compName] = 0;
                deliveryBreakdown[pay.compName] += pay.deliveryAmount;
            }
        });

        let totalReturns = 0;
        const allOrdersForRet = allOrders || orders;
        returns.forEach(r => {
            totalReturns += (Number(r.amount) || 0);
            if (window.PaymentSplit && !window.PaymentSplit.returnAffectsLiquidity(r, allOrdersForRet)) return;
            const back = splitReturnAmounts(r);
            cashSales -= back.cash;
            cardSales -= back.card;
        });

        const netRevenue = totalRevenue - totalReturns;

        // ---- Expenses ----
        function hrCountsAsExpense(hr) {
            if (window.PaymentSplit) return window.PaymentSplit.hrAffectsLiquidity(hr);
            const t = String(hr.type || '');
            if (t.includes('سلفة')) return true;
            return !t.includes('خصم / جزاء') && !t.includes('جزاء');
        }
        let totalHRExpenses = 0;
        hrExpenses.forEach(hr => {
            if (!hrCountsAsExpense(hr)) return;
            totalHRExpenses += (Number(hr.amount) || 0);
        });

        let totalPurchases = 0;
        purchases.forEach(pur => totalPurchases += (Number(pur.total) || Number(pur.amount) || 0));

        const exactExpenses = totalHRExpenses + totalPurchases;
        const netProfit = netRevenue - exactExpenses;
        const margin = netRevenue > 0 ? ((netProfit / netRevenue) * 100).toFixed(1) : 0;
        const avgOrder = orders.length > 0 ? (netRevenue / orders.length) : 0;

        // ---- Update KPI Elements ----
        const el = (id) => document.getElementById(id);

        if (el('dash-revenue'))      el('dash-revenue').innerHTML      = `${curNum(netRevenue)} <small class="js-cur-sym" style="font-size:16px;">${curSym()}</small>`;
        if (el('dash-expenses'))     el('dash-expenses').innerHTML     = `${curNum(exactExpenses)} <small class="js-cur-sym" style="font-size:16px;">${curSym()}</small>`;
        if (el('dash-orders-count')) el('dash-orders-count').innerHTML = `${orders.length} <small style="font-size:14px;">طلب</small>`;
        if (el('dash-avg-order'))    el('dash-avg-order').innerHTML    = `${curNum(avgOrder)} <small class="js-cur-sym" style="font-size:14px;">${curSym()}</small>`;

        const profitEl = el('dash-profit');
        if (profitEl) {
            profitEl.innerHTML = `${curNum(netProfit)} <small class="js-cur-sym" style="font-size:16px;">${curSym()}</small>`;
            profitEl.style.color = netProfit < 0 ? 'var(--accent-red)' : '';
        }

        const mEl = el('dash-margin');
        if (mEl) {
            mEl.innerHTML = margin + '%';
            mEl.style.color = Number(margin) < 0 ? 'var(--accent-red)' : 'var(--accent-green)';
        }

        // Perf list
        if (el('perf-revenue'))  el('perf-revenue').innerHTML  = `${curNum(netRevenue)} <span class="js-cur-sym">${curSym()}</span>`;
        if (el('perf-expenses')) el('perf-expenses').innerHTML = `-${curNum(exactExpenses)} <span class="js-cur-sym">${curSym()}</span>`;
        if (el('perf-returns'))  el('perf-returns').innerHTML  = `-${curNum(totalReturns)} <span class="js-cur-sym">${curSym()}</span>`;
        const balEl = el('perf-balance');
        if (balEl) {
            balEl.innerHTML = `${curNum(netProfit)} <span class="js-cur-sym">${curSym()}</span>`;
            balEl.style.color = netProfit < 0 ? 'var(--accent-red)' : 'var(--accent-blue)';
        }

        // ---- Donut Chart: payment methods ----
        let donutLabels = ['مبيعات نقدية (كاش)', 'مبيعات شبكة'];
        let donutData = [
            Math.max(0, cashSales),
            Math.max(0, cardSales)
        ];
        let donutColors = ['#3b82f6', '#10b981'];

        // Add dynamic delivery companies
        const deliveryColors = ['#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f43f5e'];
        let colorIdx = 0;
        
        for (const [comp, amount] of Object.entries(deliveryBreakdown)) {
            donutLabels.push(comp);
            donutData.push(Math.max(0, amount));
            donutColors.push(deliveryColors[colorIdx % deliveryColors.length]);
            colorIdx++;
        }

        categoryDonutChart.data.labels = donutLabels;
        categoryDonutChart.data.datasets[0].data = donutData;
        categoryDonutChart.data.datasets[0].backgroundColor = donutColors;
        categoryDonutChart.update();

        // ---- Trend Chart (uses ALL unfiltered data for 'all', filtered for others) ----
        const trendOrders    = range === 'all' ? allOrders    : orders;
        const trendHRExp     = range === 'all' ? allHRExp     : hrExpenses;
        const trendPurchases = range === 'all' ? allPurchases : purchases;

        const { labels, revenueData, expenseData } = buildTrendBuckets(trendOrders, trendHRExp, trendPurchases, range);
        mainTrendChart.data.labels = labels;
        mainTrendChart.data.datasets[0].data = revenueData;
        mainTrendChart.data.datasets[1].data = expenseData;
        mainTrendChart.update();

        // ---- Top Items ----
        renderTopItemsFromOrders(orders);

        // ---- Populating Print Tables ----
        populatePrintTables({
            netRevenue, exactExpenses, netProfit, margin, avgOrder, ordersCount: orders.length,
            cashSales, cardSales, deliveryBreakdown, totalReturns, totalHRExpenses, totalPurchases
        }, orders);
    }

    // ======================================================
    // BUILD CHART BUCKETS — supports today/week/month/year/all
    // ======================================================
    function buildTrendBuckets(orders, hrExpenses, purchases, range) {
        const labels = [];
        const revenueData = [];
        const expenseData = [];
        const dayNames   = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
        const monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
        const now = new Date();

        if (range === 'today') {
            // Hourly buckets every 3 hours
            for (let h = 3; h <= 24; h += 3) {
                const hourLabel = h === 24 ? '12م' : (h <= 12 ? h + 'ص' : (h - 12) + 'م');
                labels.push(hourLabel);
                const start = new Date(now); start.setHours(h - 3, 0, 0, 0);
                const end   = new Date(now); end.setHours(h, 0, 0, 0);
                let rev = 0, exp = 0;
                orders.forEach(o => {
                    const d = new Date(o.timestamp || o.date);
                    if (d >= start && d < end) rev += (Number(o.total) || 0);
                });
                hrExpenses.forEach(hr => {
                    const d = new Date(hr.timestamp || hr.date);
                    if (d >= start && d < end) exp += (Number(hr.amount) || 0);
                });
                purchases.forEach(p => {
                    const d = new Date(p.date);
                    if (d >= start && d < end) exp += (Number(p.total) || Number(p.amount) || 0);
                });
                revenueData.push(rev);
                expenseData.push(exp);
            }

        } else if (range === 'week') {
            for (let i = 6; i >= 0; i--) {
                const d = new Date(now);
                d.setDate(now.getDate() - i);
                labels.push(dayNames[d.getDay()]);
                const dateStr = d.toISOString().split('T')[0];
                let rev = 0, exp = 0;
                orders.forEach(o => {
                    const od = (o.timestamp || o.dateStr || o.date || '').substring(0, 10);
                    if (od === dateStr) rev += (Number(o.total) || 0);
                });
                hrExpenses.forEach(hr => {
                    const hd = (hr.timestamp || hr.date || '').substring(0, 10);
                    if (hd === dateStr) exp += (Number(hr.amount) || 0);
                });
                purchases.forEach(p => {
                    if ((p.date || '').substring(0, 10) === dateStr) exp += (Number(p.total) || Number(p.amount) || 0);
                });
                revenueData.push(rev);
                expenseData.push(exp);
            }

        } else if (range === 'month') {
            // Last 4 weeks
            for (let w = 3; w >= 0; w--) {
                labels.push(`الأسبوع ${4 - w}`);
                const start = new Date(now); start.setDate(now.getDate() - (w + 1) * 7);
                const end   = new Date(now); end.setDate(now.getDate() - w * 7);
                let rev = 0, exp = 0;
                orders.forEach(o => {
                    const d = new Date(o.timestamp || o.date);
                    if (d >= start && d < end) rev += (Number(o.total) || 0);
                });
                hrExpenses.forEach(hr => {
                    const d = new Date(hr.timestamp || hr.date);
                    if (d >= start && d < end) exp += (Number(hr.amount) || 0);
                });
                purchases.forEach(p => {
                    const d = new Date(p.date);
                    if (d >= start && d < end) exp += (Number(p.total) || Number(p.amount) || 0);
                });
                revenueData.push(rev);
                expenseData.push(exp);
            }

        } else if (range === 'year') {
            // This year by month
            for (let m = 0; m < 12; m++) {
                labels.push(monthNames[m]);
                let rev = 0, exp = 0;
                orders.forEach(o => {
                    const d = new Date(o.timestamp || o.date);
                    if (d.getMonth() === m && d.getFullYear() === now.getFullYear()) rev += (Number(o.total) || 0);
                });
                hrExpenses.forEach(hr => {
                    const d = new Date(hr.timestamp || hr.date);
                    if (d.getMonth() === m && d.getFullYear() === now.getFullYear()) exp += (Number(hr.amount) || 0);
                });
                purchases.forEach(p => {
                    const d = new Date(p.date);
                    if (d.getMonth() === m && d.getFullYear() === now.getFullYear()) exp += (Number(p.total) || Number(p.amount) || 0);
                });
                revenueData.push(rev);
                expenseData.push(exp);
            }

        } else {
            // 'all' — group by month/year from all available data
            const bucketMap = new Map();
            const touch = (key) => { if (!bucketMap.has(key)) bucketMap.set(key, { rev: 0, exp: 0 }); };

            orders.forEach(o => {
                const d = new Date(o.timestamp || o.dateStr || o.date);
                if (isNaN(d.getTime())) return;
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                touch(key);
                bucketMap.get(key).rev += (Number(o.total) || 0);
            });

            hrExpenses.forEach(hr => {
                const d = new Date(hr.timestamp || hr.date);
                if (isNaN(d.getTime())) return;
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                touch(key);
                bucketMap.get(key).exp += (Number(hr.amount) || 0);
            });

            purchases.forEach(p => {
                const d = new Date(p.date);
                if (isNaN(d.getTime())) return;
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                touch(key);
                bucketMap.get(key).exp += (Number(p.total) || Number(p.amount) || 0);
            });

            const sortedKeys = Array.from(bucketMap.keys()).sort();

            if (sortedKeys.length === 0) {
                // No data: show last 6 months as empty placeholders
                for (let i = 5; i >= 0; i--) {
                    const d = new Date(now);
                    d.setMonth(d.getMonth() - i);
                    labels.push(`${monthNames[d.getMonth()]} ${d.getFullYear()}`);
                    revenueData.push(0);
                    expenseData.push(0);
                }
            } else {
                sortedKeys.forEach(key => {
                    const [year, month] = key.split('-');
                    labels.push(`${monthNames[parseInt(month) - 1]} ${year}`);
                    revenueData.push(bucketMap.get(key).rev);
                    expenseData.push(bucketMap.get(key).exp);
                });
            }
        }

        return { labels, revenueData, expenseData };
    }

    // ======================================================
    // RENDER TOP ITEMS FROM REAL ORDERS
    // ======================================================
    function renderTopItemsFromOrders(orders) {
        const container = document.getElementById('stats-dynamic-top-items');
        if (!container) return;

        const itemMap = new Map();
        orders.forEach(order => {
            const items = order.items || [];
            items.forEach(it => {
                const name = it.name || 'غير محدد';
                const qty = Number(it.qty) || 1;
                if (!itemMap.has(name)) itemMap.set(name, 0);
                itemMap.set(name, itemMap.get(name) + qty);
            });
        });

        const sorted = Array.from(itemMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 7);
        const maxQty = sorted.length > 0 ? sorted[0][1] : 1;
        const totalQty = sorted.reduce((s, [, q]) => s + q, 0);

        const colors = [
            'linear-gradient(90deg, #3b82f6, #60a5fa)',
            'linear-gradient(90deg, #10b981, #34d399)',
            'linear-gradient(90deg, #f59e0b, #fbbf24)',
            'linear-gradient(90deg, #ec4899, #f472b6)',
            'linear-gradient(90deg, #8b5cf6, #a78bfa)',
            'linear-gradient(90deg, #ef4444, #f87171)',
            'linear-gradient(90deg, #14b8a6, #5eead4)',
        ];

        if (sorted.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted);">لا توجد مبيعات حتى الآن</div>';
            return;
        }

        container.innerHTML = sorted.map(([name, qty], i) => {
            const pct = totalQty > 0 ? Math.round((qty / totalQty) * 100) : 0;
            const barWidth = Math.round((qty / maxQty) * 100);
            const starIcon = i === 0 ? '<i class="ph-fill ph-fire" style="color:#f59e0b; margin-right:4px;"></i>' : '';
            return `
                <div class="item-progress-row">
                    <div class="item-meta">
                        <span>${name} ${starIcon}</span>
                        <span>${qty} طلب (${pct}%)</span>
                    </div>
                    <div class="prog-bar-bg">
                        <div class="prog-bar-fill" style="width: ${barWidth}%; background: ${colors[i % colors.length]};"></div>
                    </div>
                </div>`;
        }).join('');
    }

    // ======================================================
    // POPULATE PRINT-ONLY TABLES
    // ======================================================
    function populatePrintTables(data, orders) {
        // Table 1: Financial KPIs
        const kpiBody = document.getElementById('pt-kpi-body');
        if (kpiBody) {
            kpiBody.innerHTML = `
                <tr>
                    <td>إجمالي الإيرادات</td>
                    <td>${curFmt(data.netRevenue)}</td>
                    <td>بعد خصم المرتجعات</td>
                </tr>
                <tr>
                    <td>إجمالي المصروفات</td>
                    <td>${curFmt(data.exactExpenses)}</td>
                    <td>رواتب + مشتريات</td>
                </tr>
                <tr>
                    <td>صافي الربح التقديري</td>
                    <td style="color:${data.netProfit < 0 ? 'red' : 'green'}; direction:ltr; text-align:right;">${curFmt(data.netProfit)}</td>
                    <td>الإيرادات ناقص المصروفات</td>
                </tr>
                <tr>
                    <td>هامش الربح التشغيلي</td>
                    <td style="color:${Number(data.margin) < 0 ? 'red' : 'green'};">${data.margin}%</td>
                    <td>نسبة الربح للرصيد</td>
                </tr>
                <tr>
                    <td>عدد الطلبات المكتملة</td>
                    <td>${data.ordersCount} طلب</td>
                    <td>في الفترة المحددة</td>
                </tr>
                <tr>
                    <td>متوسط قيمة الطلب</td>
                    <td>${curFmt(data.avgOrder)}</td>
                    <td>مؤشر أداء</td>
                </tr>
            `;
        }

        // Table 2: Top Items
        const itemsBody = document.getElementById('pt-items-body');
        const itemsTotal = document.getElementById('pt-items-total');
        if (itemsBody) {
            const itemMap = new Map();
            orders.forEach(order => {
                const items = order.items || [];
                items.forEach(it => {
                    const name = it.name || 'غير محدد';
                    const qty = Number(it.qty) || 1;
                    if (!itemMap.has(name)) itemMap.set(name, 0);
                    itemMap.set(name, itemMap.get(name) + qty);
                });
            });

            const sorted = Array.from(itemMap.entries()).sort((a, b) => b[1] - a[1]);
            const totalQty = sorted.reduce((s, [, q]) => s + q, 0);

            if (sorted.length === 0) {
                itemsBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">لا توجد مبيعات في هذه الفترة</td></tr>';
                if (itemsTotal) itemsTotal.innerText = '0';
            } else {
                itemsBody.innerHTML = sorted.map(([name, qty], i) => {
                    const pct = totalQty > 0 ? ((qty / totalQty) * 100).toFixed(1) : 0;
                    return `
                        <tr>
                            <td>${i + 1}</td>
                            <td>${name}</td>
                            <td>${qty}</td>
                            <td>${pct}%</td>
                        </tr>
                    `;
                }).join('');
                if (itemsTotal) itemsTotal.innerText = totalQty;
            }
        }

        // Table 3: Budget & Payments
        const budgetBody = document.getElementById('pt-budget-body');
        if (budgetBody) {
            let deliveryHtml = '';
            let totalDelivery = 0;
            if (data.deliveryBreakdown) {
                for (const [comp, amount] of Object.entries(data.deliveryBreakdown)) {
                    totalDelivery += amount;
                    deliveryHtml += `
                        <tr>
                            <td>مبيعات ${comp}</td>
                            <td>${curFmt(amount)}</td>
                        </tr>
                    `;
                }
            }

            budgetBody.innerHTML = `
                <tr>
                    <td>مبيعات كاش</td>
                    <td>${curFmt(data.cashSales)}</td>
                </tr>
                <tr>
                    <td>مبيعات شبكة</td>
                    <td>${curFmt(data.cardSales)}</td>
                </tr>
                ${deliveryHtml}
                <tr style="background:#f1f5f9;">
                    <td><strong>إجمالي الدخل</strong></td>
                    <td><strong>${curFmt(data.netRevenue)}</strong></td>
                </tr>
                <tr>
                    <td>إجمالي المرتجعات</td>
                    <td style="color:red;">-${curFmt(data.totalReturns)}</td>
                </tr>
                <tr>
                    <td>رواتب وسلف العمال</td>
                    <td style="color:red;">-${curFmt(data.totalHRExpenses)}</td>
                </tr>
                <tr>
                    <td>المشتريات والموردين</td>
                    <td style="color:red;">-${curFmt(data.totalPurchases)}</td>
                </tr>
                <tr style="background:#f1f5f9;">
                    <td><strong>الرصيد الفعلي (الربح)</strong></td>
                    <td style="color:${data.netProfit < 0 ? 'red' : 'green'}; direction:ltr; text-align:right;"><strong>${curFmt(data.netProfit)}</strong></td>
                </tr>
            `;
        }
    }

    // ---- Initial Load ----
    const firstRange = document.querySelector('.date-btn.active')?.dataset?.range || 'all';
    currentStatsRange = firstRange;
    await fetchRealDataAndUpdateCharts(currentStatsRange);

    if (typeof window.registerPosDatabaseRefresh === 'function') {
        window.registerPosDatabaseRefresh(() => fetchRealDataAndUpdateCharts(currentStatsRange));
    }
});
