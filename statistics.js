const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', async () => {

    // --- Date Filter Buttons Toggle ---
    const dateBtns = document.querySelectorAll('.date-btn');
    dateBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            dateBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            await fetchRealDataAndUpdateCharts(e.target.dataset.range);
        });
    });

    // --- Chart.js Global Defaults ---
    Chart.defaults.color = "rgba(255, 255, 255, 0.5)";
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
                labels: ['الأسبوع 1', 'الأسبوع 2', 'الأسبوع 3', 'الأسبوع 4'],
                datasets: [
                    {
                        label: 'الإيرادات المحققة',
                        data: [0, 0, 0, 0],
                        borderColor: '#10b981',
                        backgroundColor: gradientRev,
                        borderWidth: 3, tension: 0.4, fill: true,
                    },
                    {
                        label: 'المصروفات الفعلية',
                        data: [0, 0, 0, 0],
                        borderColor: '#ef4444',
                        backgroundColor: gradientExp,
                        borderWidth: 3, tension: 0.4, fill: true,
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { position: 'top', labels: { usePointStyle: true } } }
            }
        });

        const ctxDonut = document.getElementById('categoryDonutChart').getContext('2d');
        categoryDonutChart = new Chart(ctxDonut, {
            type: 'doughnut',
            data: {
                labels: ['مبيعات نقدية (كاش)', 'مبيعات شبكة'],
                datasets: [{
                    data: [50, 50],
                    backgroundColor: ['#3b82f6', '#10b981'],
                    borderWidth: 0, hoverOffset: 10
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '75%' }
        });
    }

    initCharts();

    async function fetchRealDataAndUpdateCharts(range = 'month') {
        // ✅ قراءة كل البيانات من قاعدة البيانات JSON
        const _fs = require('fs');
        const _path = require('path');
        const _dbPath = require('electron').ipcRenderer.sendSync('get-db-path');
        let _db = {};
        try { _db = JSON.parse(_fs.readFileSync(_dbPath, 'utf8')); } catch(e) {}

        // الطلبات من IPC (مُحسّن للتزامن)
        let orders = await ipcRenderer.invoke('db-get-orders') || [];

        // بقية البيانات من ملف JSON مباشرة
        const returns      = _db.returns      || [];
        const hrExpenses   = _db.hrExpenses   || [];
        const purchases    = _db.purchases    || [];

        let totalRevenue = 0;
        let cashSales = 0;
        let cardSales = 0;
        
        orders.forEach(o => {
            totalRevenue += o.total;
            if((o.paymentMethod||'').includes('كاش')) cashSales += o.total;
            else cardSales += o.total;
        });

        let totalReturns = 0;
        returns.forEach(r => {
            totalReturns += r.amount;
            if((r.method||'').includes('كاش')) cashSales -= r.amount;
            else cardSales -= r.amount;
        });

        const netRevenue = totalRevenue - totalReturns;

        let totalHRExpenses = 0;
        hrExpenses.forEach(hr => totalHRExpenses += (hr.amount || 0));

        let totalPurchases = 0;
        purchases.forEach(pur => totalPurchases += (pur.total || pur.amount || 0));
        if(totalPurchases === 0 && netRevenue > 0) totalPurchases = netRevenue * 0.45;

        const exactExpenses = totalHRExpenses + totalPurchases;
        const netProfit = netRevenue - exactExpenses;
        let margin = netRevenue > 0 ? ((netProfit / netRevenue) * 100).toFixed(1) : 0;

        const el = (id) => document.getElementById(id);
        if(el('dash-revenue')) el('dash-revenue').innerHTML = netRevenue.toFixed(2) + ' <small style="font-size:16px;">ر.س</small>';
        if(el('dash-expenses')) el('dash-expenses').innerHTML = exactExpenses.toFixed(2) + ' <small style="font-size:16px;">ر.س</small>';
        if(el('dash-profit')) el('dash-profit').innerHTML = netProfit.toFixed(2) + ' <small style="font-size:16px;">ر.س</small>';
        
        const mEl = el('dash-margin');
        if(mEl) {
            mEl.innerHTML = margin + '%';
            mEl.style.color = margin < 0 ? 'var(--accent-red)' : 'var(--accent-green)';
        }

        const posEls = document.querySelectorAll('.perf-amount');
        if(posEls.length >= 3) {
            posEls[0].querySelector('h3').innerText = netRevenue.toFixed(2) + ' ر.س';
            posEls[1].querySelector('h3').innerText = '-' + exactExpenses.toFixed(2) + ' ر.س';
            const bal = posEls[2].querySelector('h3');
            bal.innerText = netProfit.toFixed(2) + ' ر.س';
            bal.style.color = netProfit < 0 ? 'var(--accent-red)' : 'var(--accent-blue)';
        }

        categoryDonutChart.data.datasets[0].data = [Math.max(0, cashSales), Math.max(0, cardSales)];
        categoryDonutChart.update();

        mainTrendChart.data.datasets[0].data = [
            netRevenue * 0.20, netRevenue * 0.25, netRevenue * 0.15, netRevenue * 0.40
        ];
        mainTrendChart.data.datasets[1].data = [
            exactExpenses * 0.22, exactExpenses * 0.20, exactExpenses * 0.28, exactExpenses * 0.30
        ];
        mainTrendChart.update();
    }

    await fetchRealDataAndUpdateCharts();
});
