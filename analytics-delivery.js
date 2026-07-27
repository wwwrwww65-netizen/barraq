const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', async () => {
    
    // Check if the user has correct permissions (optional based on app structure)
    // if(!window.hasPermission || !window.hasPermission('view_reports')) return;

    const curNum = (n) => (window.MisterCasherCurrency ? MisterCasherCurrency.formatNumber(n) : Number(n).toFixed(2));
    const curSym = () => (window.MisterCasherCurrency ? MisterCasherCurrency.getConfig().symbol : 'ر.س');

    let allOrders = [];
    let filteredOrders = [];
    let currentRange = 'today';

    let aggregatedCompanies = [];
    
    // --- Date Filter Buttons ---
    const dateBtns = document.querySelectorAll('.date-btn, .glass-btn');
    dateBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            dateBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentRange = e.target.dataset.range || 'all';
            await applyFilters();
        });
    });

    // --- Search Box ---
    const searchInput = document.getElementById('item-search');
    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderTable(e.target.value);
        });
    }

    // --- Charts Init ---
    const isLight = document.body.classList.contains('light-theme');
    Chart.defaults.color = isLight ? '#64748b' : 'rgba(255, 255, 255, 0.5)';
    Chart.defaults.font.family = "'Cairo', sans-serif";

    let ordersChart = null;
    let donutChart = null;

    function initCharts() {
        const ctxOrders = document.getElementById('deliveryOrdersChart').getContext('2d');
        ordersChart = new Chart(ctxOrders, {
            type: 'bar',
            data: { labels: [], datasets: [{
                label: 'عدد الطلبات المنفذة',
                data: [],
                backgroundColor: 'rgba(14, 165, 233, 0.7)',
                borderColor: '#0ea5e9',
                borderWidth: 1,
                borderRadius: 4
            }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { color: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' } },
                    x: { grid: { display: false } }
                }
            }
        });

        const ctxDonut = document.getElementById('deliveryRevenueDonutChart').getContext('2d');
        donutChart = new Chart(ctxDonut, {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: ['#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f43f5e', '#10b981', '#3b82f6'],
                    borderWidth: 0, hoverOffset: 10
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '70%',
                plugins: { legend: { position: 'left', labels: { usePointStyle: true } } }
            }
        });
    }

    initCharts();

    window.addEventListener('themeChanged', () => {
        if (ordersChart) {
            const isL = document.body.classList.contains('light-theme') || document.documentElement.getAttribute('data-theme') === 'light';
            Chart.defaults.color = isL ? '#64748b' : 'rgba(255, 255, 255, 0.5)';
            ordersChart.options.scales.y.grid.color = isL ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
            ordersChart.update('none');
        }
        if (donutChart) {
            donutChart.update('none');
        }
    });

    // --- Initial Data Load ---
    async function loadData() {
        try {
            // Optimize load time: only fetch everything if we are looking beyond 'today'
            const method = (currentRange === 'today') ? 'db-get-orders' : 'db-get-orders-all';
            allOrders = await ipcRenderer.invoke(method) || [];
            await applyFilters();
        } catch (err) {
            console.error("Failed to load orders for delivery analytics", err);
        }
    }

    async function applyFilters() {
        const now = new Date();
        filteredOrders = allOrders.filter(o => {
            const d = new Date(o.timestamp || o.date);
            if (isNaN(d)) return false;
            if (currentRange === 'today') {
                return d.toDateString() === now.toDateString();
            } else if (currentRange === 'week') {
                const diff = (now - d) / (1000 * 60 * 60 * 24);
                return diff <= 7;
            } else if (currentRange === 'month') {
                return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            } else if (currentRange === 'year') {
                return d.getFullYear() === now.getFullYear();
            }
            return true; // all
        });

        processAndRender();
    }

    function processAndRender() {
        const compMap = new Map();
        let totalOrders = 0;
        let totalRevenue = 0;

        filteredOrders.forEach(order => {
            const isDelivery = order.hungerStation === true || order.orderType === 'توصيل' || !!order.deliveryCompany;
            if (isDelivery) {
                const compName = order.deliveryCompany || (order.hungerStation === true ? 'هنقرستيشن' : 'توصيل');
                const orderTotal = Number(order.total) || 0;
                
                if (!compMap.has(compName)) {
                    compMap.set(compName, { name: compName, ordersCount: 0, revenue: 0 });
                }
                const d = compMap.get(compName);
                d.ordersCount += 1;
                d.revenue += orderTotal;

                totalOrders += 1;
                totalRevenue += orderTotal;
            }
        });

        aggregatedCompanies = Array.from(compMap.values()).sort((a, b) => b.revenue - a.revenue);

        // Update main KPIs
        const elTotalOrders = document.getElementById('kpi-total-orders');
        const elTotalRevenue = document.getElementById('kpi-total-revenue');
        const elAvgOrder = document.getElementById('kpi-avg-order');
        const elTopComp = document.getElementById('kpi-top-company');
        const elTopCompRev = document.getElementById('kpi-top-company-revenue');

        if(elTotalOrders) elTotalOrders.innerText = totalOrders;
        if(elTotalRevenue) elTotalRevenue.innerText = curNum(totalRevenue);
        
        const avgOrder = totalOrders > 0 ? (totalRevenue / totalOrders) : 0;
        if(elAvgOrder) elAvgOrder.innerText = curNum(avgOrder);

        const topComp = aggregatedCompanies[0] || { name: 'لا يوجد', revenue: 0, ordersCount: 0 };
        if(elTopComp) elTopComp.innerText = topComp.name;
        if(elTopCompRev) elTopCompRev.innerText = `${curNum(topComp.revenue)} ${curSym()} (${topComp.ordersCount} طلب)`;

        updateCharts();
        renderTable();
    }

    function updateCharts() {
        const labels = aggregatedCompanies.map(c => c.name);
        const ordersData = aggregatedCompanies.map(c => c.ordersCount);
        const revenueData = aggregatedCompanies.map(c => c.revenue);

        ordersChart.data.labels = labels;
        ordersChart.data.datasets[0].data = ordersData;
        ordersChart.update();

        donutChart.data.labels = labels;
        donutChart.data.datasets[0].data = revenueData;
        donutChart.update();
    }

    function renderTable(searchTerm = '') {
        const tbody = document.getElementById('delivery-items-tbody');
        const ptBody = document.getElementById('pt-delivery-body');
        
        if (!tbody) return;

        let filtered = aggregatedCompanies;
        if (searchTerm) {
            const lowSearch = searchTerm.toLowerCase();
            filtered = filtered.filter(c => c.name.toLowerCase().includes(lowSearch));
        }

        if (filtered.length === 0) {
            const emptyRow = `<tr><td colspan="6" style="text-align:center; padding:30px;">لا توجد بيانات لشركات التوصيل في هذه الفترة</td></tr>`;
            tbody.innerHTML = emptyRow;
            if (ptBody) ptBody.innerHTML = emptyRow;
            return;
        }

        const totalOverallRevenue = filtered.reduce((s, c) => s + c.revenue, 0);

        const html = filtered.map((c, idx) => {
            const pct = totalOverallRevenue > 0 ? Math.round((c.revenue / totalOverallRevenue) * 100) : 0;
            const avg = c.ordersCount > 0 ? (c.revenue / c.ordersCount) : 0;
            
            return `
                <tr>
                    <td><span class="bs-rank">${idx + 1}</span></td>
                    <td style="font-weight:700; color:var(--text-primary);">${c.name}</td>
                    <td><div style="font-size:1.1rem; font-weight:600;">${c.ordersCount}</div></td>
                    <td style="font-weight:700; color:#10b981;">${curNum(c.revenue)} <small class="js-cur-sym">${curSym()}</small></td>
                    <td>${curNum(avg)} <small class="js-cur-sym">${curSym()}</small></td>
                    <td style="width: 25%;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <div class="bs-bar-bg" style="flex:1; height:8px; background:rgba(0,0,0,0.1); border-radius:10px; overflow:hidden;">
                                <div class="bs-bar-fill" style="height:100%; width:${pct}%; background:#0ea5e9; border-radius:10px;"></div>
                            </div>
                            <span style="font-size:12px; font-weight:600; width:40px; text-align:right;">${pct}%</span>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = html;

        if (ptBody) {
            ptBody.innerHTML = filtered.map((c, idx) => {
                const avg = c.ordersCount > 0 ? (c.revenue / c.ordersCount) : 0;
                return `
                    <tr>
                        <td>${idx + 1}</td>
                        <td>${c.name}</td>
                        <td>${c.ordersCount}</td>
                        <td>${curNum(c.revenue)}</td>
                        <td>${curNum(avg)}</td>
                    </tr>
                `;
            }).join('');
        }
    }

    // Export functionality
    window.exportTableToCSV = function(filename) {
        let csv = ['الترتيب,الشركة,الطلبات,العائد,متوسط الطلب'];
        aggregatedCompanies.forEach((c, idx) => {
            const avg = c.ordersCount > 0 ? (c.revenue / c.ordersCount) : 0;
            csv.push(`${idx + 1},${c.name},${c.ordersCount},${c.revenue},${avg.toFixed(2)}`);
        });
        const blob = new Blob(['\uFEFF' + csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
    };

    // Load everything
    loadData();
});
