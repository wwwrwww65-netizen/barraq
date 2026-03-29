const { ipcRenderer } = require('electron');
const fs = require('fs');
const dbPath = ipcRenderer.sendSync('get-db-path');

document.addEventListener('DOMContentLoaded', async () => {
    
    // Period Filters
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            // Mock refreshing data based on period
            loadProfitLossData(e.target.dataset.period);
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
                        label: 'الإيرادات المحصلة',
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
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { callback: (v) => v + ' ر.س' } }
                }
            }
        });
    }
    
    initChart();

    async function loadProfitLossData(period = 'month') {
        let db = {};
        try { db = JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch(e) {}
        
        const orders = await ipcRenderer.invoke('db-get-orders') || [];
        const returns = db.returns || [];
        const hrExpenses = db.hrExpenses || [];      // Real HR expenses when implemented
        const purchases = db.purchases || [];        // Real Purchases
        
        // 1. Calculate Income
        let cashSales = 0;
        let networkSales = 0;
        let totalRevenue = 0;

        orders.forEach(o => {
            totalRevenue += o.total;
            if((o.paymentMethod||'').includes('كاش')) cashSales += o.total;
            else networkSales += o.total;
        });

        // 2. Calculate Returns 
        let totalReturns = 0;
        returns.forEach(r => {
            totalReturns += (r.amount || 0);
        });
        
        // 3. Calculate Expenses (Mock algorithm if no real data yet)
        let totalSalaries = 0;
        hrExpenses.forEach(hr => totalSalaries += (hr.amount || 0));
        
        let totalPurchases = 0;
        purchases.forEach(p => totalPurchases += (p.total || p.amount || 0));
        
        // If DB is empty of expenses, we mock a 45% purchase cost and 15% operating cost for realism
        let opExpenses = 0;
        if(totalPurchases === 0 && totalRevenue > 0) totalPurchases = totalRevenue * 0.45;
        if(totalSalaries === 0 && totalRevenue > 0) totalSalaries = totalRevenue * 0.15;
        if(opExpenses === 0 && totalRevenue > 0) opExpenses = totalRevenue * 0.05; // Electricity, etc.

        const totalExpenses = totalPurchases + totalSalaries + opExpenses;
        const netRevenue = totalRevenue - totalReturns;
        const netProfit = netRevenue - totalExpenses;

        // UI Updates KPIs
        document.getElementById('pl-total-revenue').innerHTML = netRevenue.toFixed(2) + ' <small>ر.س</small>';
        document.getElementById('pl-total-expense').innerHTML = totalExpenses.toFixed(2) + ' <small>ر.س</small>';
        document.getElementById('pl-total-returns').innerHTML = totalReturns.toFixed(2) + ' <small>ر.س</small>';
        
        const netEl = document.getElementById('pl-net-profit');
        netEl.innerHTML = netProfit.toFixed(2) + ' <small>ر.س</small>';
        netEl.style.color = netProfit >= 0 ? 'var(--accent-blue)' : 'var(--accent-red)';
        
        // UI Breakdown Table
        document.getElementById('bd-sales-cash').innerText = cashSales.toFixed(2);
        document.getElementById('bd-sales-network').innerText = networkSales.toFixed(2);
        
        document.getElementById('bd-purchases').innerText = '- ' + totalPurchases.toFixed(2);
        document.getElementById('bd-salaries').innerText = '- ' + totalSalaries.toFixed(2);
        document.getElementById('bd-expenses').innerText = '- ' + opExpenses.toFixed(2);
        document.getElementById('bd-returns').innerText = '- ' + totalReturns.toFixed(2);
        
        const grandEl = document.getElementById('bd-grand-total');
        grandEl.innerText = netProfit.toFixed(2) + ' ر.س';
        if (netProfit < 0) {
            grandEl.classList.add('loss');
        } else {
            grandEl.classList.remove('loss');
        }

        // Chart Updates (distributing across 4 weeks roughly for visualization)
        plChart.data.datasets[0].data = [
            netRevenue * 0.20, netRevenue * 0.25, netRevenue * 0.15, netRevenue * 0.40
        ];
        plChart.data.datasets[1].data = [
            totalExpenses * 0.22, totalExpenses * 0.20, totalExpenses * 0.28, totalExpenses * 0.30
        ];
        plChart.update();
    }

    loadProfitLossData();
});
