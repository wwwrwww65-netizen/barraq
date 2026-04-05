document.addEventListener('DOMContentLoaded', async () => {

    const curSym = () => (window.HashCurrency ? HashCurrency.getConfig().symbol : 'ر.س');
    const curNum = (n) => (window.HashCurrency ? HashCurrency.formatNumber(n) : Number(n).toFixed(2));
    const curFmt = (n) => (window.HashCurrency ? HashCurrency.format(n) : Number(n).toFixed(2) + ' ر.س');
    
    let currentPlPeriod = 'month';

    // Period Filters
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentPlPeriod = e.target.dataset.period || 'month';
            loadProfitLossData(currentPlPeriod);
        });
    });

    let plChart = null;

    function initChart() {
        const ctx = document.getElementById('plChart').getContext('2d');
        
        Chart.defaults.color = "rgba(255, 255, 255, 0.5)";
        Chart.defaults.font.family = "'Cairo', sans-serif";
        
        const gradRev = ctx.createLinearGradient(0, 0, 0, 400);
        gradRev.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
        gradRev.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

        const gradExp = ctx.createLinearGradient(0, 0, 0, 400);
        gradExp.addColorStop(0, 'rgba(239, 68, 68, 0.4)');
        gradExp.addColorStop(1, 'rgba(239, 68, 68, 0.0)');

        plChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['الأسبوع 1', 'الأسبوع 2', 'الأسبوع 3', 'الأسبوع 4'],
                datasets: [
                    {
                        label: 'صافي الإيرادات (بعد المرتجعات)',
                        data: [0, 0, 0, 0],
                        backgroundColor: gradRev,
                        borderColor: '#10b981',
                        borderWidth: 2,
                        borderRadius: 6
                    },
                    {
                        label: 'المصروفات المنصرفة',
                        data: [0, 0, 0, 0],
                        backgroundColor: gradExp,
                        borderColor: '#ef4444',
                        borderWidth: 2,
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { usePointStyle: true } }
                },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { callback: (v) => v + ' ' + curSym() } }
                }
            }
        });
    }
    
    initChart();

    async function loadProfitLossData(period = 'month') {
        const db = (await window.dbRead()) || {};
        /** نفس مصدر `acc.js` — الطلبات كاملة من القاعدة (لا حد 500 كما في db-get-orders) */
        let orders = db.orders || [];
        let returns = db.returns || [];
        let hrExpenses = db.hrExpenses || [];
        let purchases = db.purchases || [];
        let erpExpenses = db.expenses || [];
        let otherIncomeRows = db.otherIncome || [];

        if(window.isDateInPeriod) {
            orders = orders.filter(o => window.isDateInPeriod(o.timestamp || o.dateStr || o.date, period));
            returns = returns.filter(r => window.isDateInPeriod(r.timestamp || r.date, period));
            hrExpenses = hrExpenses.filter(h => window.isDateInPeriod(h.timestamp || h.date, period));
            purchases = purchases.filter(p => window.isDateInPeriod(p.date, period));
            erpExpenses = erpExpenses.filter(e => window.isDateInPeriod(e.date, period));
            otherIncomeRows = otherIncomeRows.filter((row) =>
                window.isDateInPeriod(row.date || row.timestamp, period),
            );
        }
        
        // 1. Calculate Income (مواءمة تصنيف الدفع مع لوحة المحاسبة)
        let cashSales = 0;
        let networkSales = 0;
        let totalRevenue = 0;

        orders.forEach((o) => {
            const t = Number(o.total) || 0;
            totalRevenue += t;
            const pm = o.paymentMethod || '';
            if (pm === 'cash' || pm === 'كاش') cashSales += t;
            else if (['card', 'bank', 'شبكة / بطاقة', 'شبكة'].includes(pm)) networkSales += t;
            else if (pm === 'مجزأ') {
                cashSales += Number(o.splitCash) || 0;
                networkSales += Number(o.splitNetwork) || 0;
            } else {
                networkSales += t;
            }
        });

        // 2. Calculate Returns 
        let totalReturns = 0;
        returns.forEach(r => {
            totalReturns += (r.amount || 0);
        });
        
        // 3. مصروفات فعلية من القاعدة (بدون أرقام وهمية)
        function hrCountsAsSalaryExpense(hr) {
            const t = String(hr.type || '');
            return !t.includes('خصم') && !t.includes('جزاء');
        }
        let totalSalaries = 0;
        hrExpenses.forEach((hr) => {
            if (!hrCountsAsSalaryExpense(hr)) return;
            totalSalaries += Number(hr.amount) || 0;
        });
        let salariesFromErp = 0;
        let opExpenses = 0;
        erpExpenses.forEach(e => {
            const a = Number(e.amount) || 0;
            if (e.cat && String(e.cat).includes('رواتب')) salariesFromErp += a;
            else opExpenses += a;
        });
        totalSalaries += salariesFromErp;

        let totalPurchases = 0;
        purchases.forEach(p => { totalPurchases += (p.total || p.amount || 0); });

        const totalExpenses = totalPurchases + totalSalaries + opExpenses;
        let otherIncome = 0;
        otherIncomeRows.forEach((row) => {
            otherIncome += Number(row.amount) || 0;
        });
        const netRevenue = totalRevenue - totalReturns + otherIncome;
        /* تفريق إيرادات أخرى حسب الوسيلة (للعرض فقط) */
        let otherIncCash = 0, otherIncBank = 0;
        otherIncomeRows.forEach((row) => {
            const a = Number(row.amount) || 0;
            if (row.pMethod === 'bank') otherIncBank += a;
            else otherIncCash += a;
        });
        const netProfit = netRevenue - totalExpenses;

        // UI Updates KPIs
        document.getElementById('pl-total-revenue').innerHTML = `${curNum(netRevenue)} <small>${curSym()}</small>`;
        document.getElementById('pl-total-expense').innerHTML = `${curNum(totalExpenses)} <small>${curSym()}</small>`;
        document.getElementById('pl-total-returns').innerHTML = `${curNum(totalReturns)} <small>${curSym()}</small>`;
        
        const netEl = document.getElementById('pl-net-profit');
        netEl.innerHTML = `${curNum(netProfit)} <small>${curSym()}</small>`;
        netEl.style.color = netProfit >= 0 ? 'var(--accent-blue)' : 'var(--accent-red)';
        
        // UI Breakdown Table
        document.getElementById('bd-sales-cash').innerText = cashSales.toFixed(2);
        document.getElementById('bd-sales-network').innerText = networkSales.toFixed(2);
        const oiEl = document.getElementById('bd-other-income');
        if (oiEl) oiEl.innerText = (otherIncCash + otherIncBank).toFixed(2);
        
        document.getElementById('bd-purchases').innerText = '- ' + totalPurchases.toFixed(2);
        document.getElementById('bd-salaries').innerText = '- ' + totalSalaries.toFixed(2);
        document.getElementById('bd-expenses').innerText = '- ' + opExpenses.toFixed(2);
        document.getElementById('bd-returns').innerText = '- ' + totalReturns.toFixed(2);
        
        const grandEl = document.getElementById('bd-grand-total');
        grandEl.innerText = curFmt(netProfit);
        if (netProfit < 0) {
            grandEl.classList.add('loss');
        } else {
            grandEl.classList.remove('loss');
        }

        // مخطط: تجميع حسب أسبوع الشهر (1–7، 8–14، …) من بيانات حقيقية
        function weekBucket(ts) {
            const d = new Date(ts || Date.now());
            if (isNaN(d.getTime())) return 0;
            const day = d.getDate();
            if (day <= 7) return 0;
            if (day <= 14) return 1;
            if (day <= 21) return 2;
            return 3;
        }
        const revW = [0, 0, 0, 0];
        orders.forEach((o) => {
            revW[weekBucket(o.timestamp || o.date)] += Number(o.total) || 0;
        });
        returns.forEach((r) => {
            const b = weekBucket(r.timestamp || r.date);
            revW[b] -= Number(r.amount) || 0;
        });
        otherIncomeRows.forEach((row) => {
            revW[weekBucket(row.timestamp || row.date)] += Number(row.amount) || 0;
        });
        for (let i = 0; i < revW.length; i++) revW[i] = Math.max(0, revW[i]);
        const expW = [0, 0, 0, 0];
        purchases.forEach(p => {
            expW[weekBucket(p.date)] += Number(p.total || p.amount) || 0;
        });
        erpExpenses.forEach(e => {
            expW[weekBucket(e.date)] += Number(e.amount) || 0;
        });
        hrExpenses.forEach((h) => {
            if (!hrCountsAsSalaryExpense(h)) return;
            expW[weekBucket(h.timestamp || h.date)] += Number(h.amount) || 0;
        });
        plChart.data.datasets[0].data = revW;
        plChart.data.datasets[1].data = expW;
        plChart.update();
    }

    const activePl = document.querySelector('.filter-btn.active');
    currentPlPeriod = (activePl && activePl.dataset.period) || 'month';
    loadProfitLossData(currentPlPeriod);

    if (typeof window.registerPosDatabaseRefresh === 'function') {
        window.registerPosDatabaseRefresh(() => loadProfitLossData(currentPlPeriod));
    }
});
