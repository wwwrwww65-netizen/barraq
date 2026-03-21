document.addEventListener('DOMContentLoaded', () => {

    // --- Date Filter Buttons Toggle ---
    const dateBtns = document.querySelectorAll('.date-btn');
    dateBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            dateBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            // Re-render chart data
            fetchRealDataAndUpdateCharts(e.target.dataset.range);
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
                labels: ['الأسبوع 1', 'الأسبوع 2', 'الأسبوع 3', 'الأسبوع 4'], // Default
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

    // Initialize Empty
    initCharts();

    // The Magic: Fetch Real LocalStorage Data!
    function fetchRealDataAndUpdateCharts(range = 'month') {
        
        let ordersStr = localStorage.getItem('pos_orders');
        let returnsStr = localStorage.getItem('pos_returns');
        let hrstr = localStorage.getItem('hr_expenses');
        let purStr = localStorage.getItem('purchases_log'); // Assuming later

        let orders = ordersStr ? JSON.parse(ordersStr) : [];
        let returns = returnsStr ? JSON.parse(returnsStr) : [];
        let hrExpenses = hrstr ? JSON.parse(hrstr) : [];
        let purchases = purStr ? JSON.parse(purStr) : [];

        // CALCULATE GLOBALS
        let totalRevenue = 0;
        let cashSales = 0;
        let cardSales = 0;
        
        orders.forEach(o => {
            totalRevenue += o.total;
            if(o.paymentMethod.includes('كاش')) cashSales += o.total;
            else cardSales += o.total;
        });

        // Deduct Returns
        let totalReturns = 0;
        returns.forEach(r => {
            totalReturns += r.amount;
            if(r.method.includes('كاش')) cashSales -= r.amount;
            else cardSales -= r.amount;
        });

        const netRevenue = totalRevenue - totalReturns;

        // EXPENSES Calculation
        let totalHRExpenses = 0;
        hrExpenses.forEach(hr => totalHRExpenses += hr.amount);

        let totalPurchases = 0;
        purchases.forEach(pur => totalPurchases += pur.amount);

        // Assume some standard food cost as expenses if purchases are empty right now for demo purposes
        if(totalPurchases === 0) {
            totalPurchases = netRevenue * 0.45; // 45% default food cost
        }

        const exactExpenses = totalHRExpenses + totalPurchases;
        const netProfit = netRevenue - exactExpenses;
        let margin = netRevenue > 0 ? ((netProfit / netRevenue) * 100).toFixed(1) : 0;

        // --- UPDATE HTML KPIs ---
        document.getElementById('dash-revenue').innerHTML = netRevenue.toFixed(2) + ' <small style="font-size:16px;">ر.س</small>';
        document.getElementById('dash-expenses').innerHTML = exactExpenses.toFixed(2) + ' <small style="font-size:16px;">ر.س</small>';
        document.getElementById('dash-profit').innerHTML = netProfit.toFixed(2) + ' <small style="font-size:16px;">ر.س</small>';
        
        const mEl = document.getElementById('dash-margin');
        mEl.innerHTML = margin + '%';
        if(margin < 0) mEl.style.color = 'var(--accent-red)';
        else mEl.style.color = 'var(--accent-green)';

        // Financial List Bottom Updates
        const posEls = document.querySelectorAll('.perf-amount');
        if(posEls.length >= 3) {
            posEls[0].querySelector('h3').innerText = netRevenue.toFixed(2) + ' ر.س'; // In
            posEls[1].querySelector('h3').innerText = '-' + exactExpenses.toFixed(2) + ' ر.س'; // Out
            
            const bal = posEls[2].querySelector('h3');
            bal.innerText = netProfit.toFixed(2) + ' ر.س'; // Balance
            if(netProfit < 0) bal.style.color = 'var(--accent-red)';
            else bal.style.color = 'var(--accent-blue)';
        }

        // --- UPDATE CHARTS ---
        // 1. Update Donut Chart (Cash vs Card)
        categoryDonutChart.data.datasets[0].data = [Math.max(0, cashSales), Math.max(0, cardSales)];
        categoryDonutChart.update();

        // 2. Trend Chart (Simulating weekly breakdown from total)
        mainTrendChart.data.datasets[0].data = [
            netRevenue * 0.20, netRevenue * 0.25, netRevenue * 0.15, netRevenue * 0.40
        ];
        mainTrendChart.data.datasets[1].data = [
            exactExpenses * 0.22, exactExpenses * 0.20, exactExpenses * 0.28, exactExpenses * 0.30
        ];
        mainTrendChart.update();
    }

    // Call it initially
    fetchRealDataAndUpdateCharts();
});
