const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', async () => {
    
    // Utilities
    const curNum = (n) => (window.HashCurrency ? HashCurrency.formatNumber(n) : Number(n).toFixed(2));
    const curSym = () => (window.HashCurrency ? HashCurrency.getConfig().symbol : 'ر.س');

    let currentRange = 'all';
    let allOrders = [];
    let aggregatedItems = [];

    // Charts
    let topItemsChart = null;
    let contributionDonutChart = null;

    // Initialize Chart.js Defaults
    Chart.defaults.color = document.body.classList.contains('light-theme') ? "#64748b" : "rgba(255, 255, 255, 0.5)";
    Chart.defaults.font.family = "'Outfit', 'Cairo', sans-serif";
    Chart.defaults.font.size = 13;

    function initCharts() {
        const ctxBar = document.getElementById('topItemsChart').getContext('2d');
        const gradActual = ctxBar.createLinearGradient(0, 0, 0, 400);
        gradActual.addColorStop(0, 'rgba(59, 130, 246, 0.8)');
        gradActual.addColorStop(1, 'rgba(59, 130, 246, 0.2)');

        const gradExpected = ctxBar.createLinearGradient(0, 0, 0, 400);
        gradExpected.addColorStop(0, 'rgba(16, 185, 129, 0.6)');
        gradExpected.addColorStop(1, 'rgba(16, 185, 129, 0.1)');

        topItemsChart = new Chart(ctxBar, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'العدد المباع الفعلي',
                        data: [],
                        backgroundColor: gradActual,
                        borderRadius: 6,
                        borderWidth: 0,
                    },
                    {
                        label: 'الطلب المتوقع',
                        data: [],
                        backgroundColor: gradExpected,
                        borderRadius: 6,
                        borderWidth: 0,
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'top', labels: { usePointStyle: true } } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { grid: { display: false } }
                }
            }
        });

        const ctxDonut = document.getElementById('contributionDonutChart').getContext('2d');
        contributionDonutChart = new Chart(ctxDonut, {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'],
                    borderWidth: 0, hoverOffset: 10
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '70%',
                plugins: { legend: { position: 'right', labels: { usePointStyle: true, padding: 20 } } }
            }
        });
    }

    async function loadData() {
        allOrders = await ipcRenderer.invoke('db-get-orders') || [];
        processAndRender();
    }

    function processAndRender() {
        // Filter by Date
        let filteredOrders = allOrders;
        if (currentRange !== 'all' && window.isDateInPeriod) {
            filteredOrders = allOrders.filter(o => window.isDateInPeriod(o.timestamp || o.dateStr || o.date, currentRange));
        }

        // Aggregate Items
        const itemMap = new Map();
        const deliveryMap = new Map();
        let totalItemsSold = 0;
        let totalRevenueTop = 0;

        // Calculate days span for expected value
        let daysSpan = 1;
        if (currentRange === 'week') daysSpan = 7;
        if (currentRange === 'month') daysSpan = 30;
        if (currentRange === 'year') daysSpan = 365;
        if (currentRange === 'all') daysSpan = Math.max(1, (new Date() - new Date(filteredOrders[0]?.timestamp || Date.now())) / (1000 * 60 * 60 * 24));

        filteredOrders.forEach(order => {
            const items = order.items || [];
            items.forEach(it => {
                const name = it.name || 'غير محدد';
                const qty = Number(it.quantity) || 1;
                const price = Number(it.price) || 0;
                const revenue = qty * price;

                if (!itemMap.has(name)) {
                    itemMap.set(name, { name, qty: 0, revenue: 0 });
                }
                const existing = itemMap.get(name);
                existing.qty += qty;
                existing.revenue += revenue;
                
                totalItemsSold += qty;
            });

            // Aggregate Delivery Companies
            const isDelivery = order.hungerStation === true || order.orderType === 'توصيل' || !!order.deliveryCompany;
            if (isDelivery) {
                const compName = order.deliveryCompany || (order.hungerStation === true ? 'هنقرستيشن' : 'توصيل');
                if (!deliveryMap.has(compName)) {
                    deliveryMap.set(compName, { name: compName, ordersCount: 0, revenue: 0 });
                }
                const d = deliveryMap.get(compName);
                d.ordersCount += 1;
                d.revenue += (Number(order.total) || 0);
            }
        });

        // Render Delivery Cards
        const deliveryContainer = document.getElementById('delivery-cards-container');
        if (deliveryContainer && deliveryMap.size > 0) {
            deliveryContainer.style.display = 'grid';
            let cardsHtml = '';
            for (const [compName, stats] of deliveryMap.entries()) {
                cardsHtml += `
                    <div class="glass-card kpi-card" style="border-left: 4px solid #0ea5e9;">
                        <div class="kpi-icon" style="background: rgba(14, 165, 233, 0.1); color: #0ea5e9;"><i class="ph-fill ph-motorcycle"></i></div>
                        <div class="kpi-content">
                            <p class="kpi-label">${compName}</p>
                            <h3 class="kpi-value" style="font-size: 1.2rem;">${curNum(stats.revenue)} <span style="font-size:12px; color:var(--text-muted);">${curSym()}</span></h3>
                            <div class="kpi-trend" style="color:var(--text-muted); margin-top:5px;"><span>${stats.ordersCount} طلبات مُنفذة</span></div>
                        </div>
                    </div>
                `;
            }
            deliveryContainer.innerHTML = cardsHtml;
        } else if (deliveryContainer) {
            deliveryContainer.style.display = 'none';
            deliveryContainer.innerHTML = '';
        }

        // Convert to array and sort by quantity descending
        aggregatedItems = Array.from(itemMap.values()).sort((a, b) => b.qty - a.qty);
        
        // Take top 10 for charts and specific stats
        const top10 = aggregatedItems.slice(0, 10);
        
        top10.forEach(it => totalRevenueTop += it.revenue);

        // Update KPIs
        document.getElementById('kpi-total-qty').innerText = totalItemsSold;
        document.getElementById('kpi-top-revenue').innerText = curNum(totalRevenueTop);
        
        const topStar = top10[0] || { name: 'لا يوجد', qty: 0 };
        document.getElementById('kpi-top-star-name').innerText = topStar.name;
        document.getElementById('kpi-top-star-qty').innerText = `${topStar.qty} طلب`;

        const totalExpectedDaily = Math.round(totalItemsSold / daysSpan);
        document.getElementById('kpi-expected-qty').innerText = totalExpectedDaily;

        // Update Charts
        if (topItemsChart && contributionDonutChart) {
            topItemsChart.data.labels = top10.map(it => it.name.length > 15 ? it.name.substring(0,15)+'...' : it.name);
            topItemsChart.data.datasets[0].data = top10.map(it => it.qty);
            // Algorithm for expected: slightly more than average daily if trend is up (mocked logic here)
            topItemsChart.data.datasets[1].data = top10.map(it => Math.round((it.qty / daysSpan) * (daysSpan + 1))); 
            topItemsChart.update();

            // Donut chart limits to top 5, rest is 'Other'
            const top5 = aggregatedItems.slice(0, 5);
            const top5Rev = top5.reduce((sum, it) => sum + it.revenue, 0);
            const otherRev = totalRevenueTop - top5Rev;
            
            const donutLabels = top5.map(it => it.name.substring(0, 15));
            const donutData = top5.map(it => it.revenue);
            
            if (otherRev > 0) {
                donutLabels.push('أخرى');
                donutData.push(otherRev);
            }

            contributionDonutChart.data.labels = donutLabels;
            contributionDonutChart.data.datasets[0].data = donutData;
            contributionDonutChart.update();
        }

        renderTable();
    }

    function getRankBadge(index) {
        if (index === 0) return '<div class="rank-badge rank-1">1</div>';
        if (index === 1) return '<div class="rank-badge rank-2">2</div>';
        if (index === 2) return '<div class="rank-badge rank-3">3</div>';
        return `<div class="rank-badge" style="background:transparent; color:var(--text-muted); box-shadow:none;">${index + 1}</div>`;
    }

    function renderTable(searchTerm = '') {
        const tbody = document.getElementById('top-items-tbody');
        tbody.innerHTML = '';

        let displayItems = aggregatedItems;
        if (searchTerm) {
            displayItems = aggregatedItems.filter(it => it.name.includes(searchTerm));
        }

        if (displayItems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:#888;">لا توجد بيانات مطابقة</td></tr>';
            return;
        }

        // Days for expectation
        let daysSpan = 1;
        if (currentRange === 'week') daysSpan = 7;
        if (currentRange === 'month') daysSpan = 30;
        if (currentRange === 'year') daysSpan = 365;

        // Find max qty for progress bar
        const maxQty = Math.max(...displayItems.map(it => it.qty), 1);

        displayItems.forEach((item, index) => {
            const expected = Math.round((item.qty / daysSpan) * (daysSpan + 1));
            const progressPercent = (item.qty / maxQty) * 100;
            
            // Choose color based on rank
            let progColor = 'linear-gradient(90deg, #3b82f6, #60a5fa)';
            if (index === 0) progColor = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
            else if (index === 1) progColor = 'linear-gradient(90deg, #10b981, #34d399)';
            else if (index === 2) progColor = 'linear-gradient(90deg, #8b5cf6, #a78bfa)';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${getRankBadge(index)}</td>
                <td>
                    <div class="item-name-cell">
                        <div class="item-avatar"><i class="ph-fill ph-bowl-food"></i></div>
                        <span style="font-weight:700;">${item.name}</span>
                    </div>
                </td>
                <td>
                    <div style="font-weight:800; font-size:16px;">${item.qty}</div>
                    <div class="table-progress">
                        <div class="table-progress-fill" style="width: ${progressPercent}%; background: ${progColor}"></div>
                    </div>
                </td>
                <td style="color:var(--text-muted);"><i class="ph ph-trend-up" style="color:#10b981;"></i> ${expected} (متوقع)</td>
                <td style="color:#10b981; font-weight:800;">${curNum(item.revenue)} <span class="js-cur-sym" style="font-size:11px;">${curSym()}</span></td>
                <td>
                    <span style="background:rgba(59,130,246,0.1); color:#60a5fa; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:700;">ممتاز</span>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // POPULATE PRINT-ONLY TABLE
        const ptBody = document.getElementById('pt-bestsellers-body');
        if (ptBody) {
            if (displayItems.length === 0) {
                ptBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:#888;">لا توجد بيانات مطابقة</td></tr>';
            } else {
                ptBody.innerHTML = displayItems.map((item, index) => {
                    const expected = Math.round((item.qty / daysSpan) * (daysSpan + 1));
                    return `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${item.name}</td>
                            <td>${item.qty}</td>
                            <td>${expected}</td>
                            <td>${curNum(item.revenue)} ${curSym()}</td>
                        </tr>
                    `;
                }).join('');
            }
        }
    }

    // Search logic
    document.getElementById('item-search').addEventListener('input', (e) => {
        renderTable(e.target.value);
    });

    // Date Filters logic
    const dateBtns = document.querySelectorAll('.date-filters .glass-btn');
    dateBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            dateBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentRange = e.target.dataset.range || 'month';
            processAndRender();
        });
    });

    initCharts();
    loadData();

    if (typeof window.registerPosDatabaseRefresh === 'function') {
        window.registerPosDatabaseRefresh(() => loadData());
    }
});
