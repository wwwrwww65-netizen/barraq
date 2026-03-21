document.addEventListener('DOMContentLoaded', () => {

    const kpiValues = document.querySelectorAll('.kpi-card .kpi-value');
    if(!kpiValues || kpiValues.length < 5) return; // Not on index page

    // FETCH LIVE DATA
    const oStr = localStorage.getItem('pos_orders');
    const rStr = localStorage.getItem('pos_returns');
    const hStr = localStorage.getItem('hr_expenses');

    let orders = oStr ? JSON.parse(oStr) : [];
    let returns = rStr ? JSON.parse(rStr) : [];
    let hrExpenses = hStr ? JSON.parse(hStr) : [];

    // --- 1. CALCULATE KPIs (Daily Logic Simplified for Demo) ---
    // In a real app we'd filter by today's date, here we just sum them all assuming they are current session
    let dailySales = 0;
    let cashSales = 0;
    let totalItemsNum = 0;

    // Item sales tracking for Top Selling
    let itemSalesMap = {}; 

    orders.forEach(o => {
        dailySales += o.total;
        if(o.paymentMethod.includes('كاش')) cashSales += o.total;

        if(o.items) {
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
        if(r.method.includes('كاش')) cashSales -= r.amount;
    });

    let totalExp = 0;
    hrExpenses.forEach(h => totalExp += h.amount);

    let drawerBalance = cashSales - totalExp; // Only cash goes to drawer

    // Apply to UI
    kpiValues[0].innerHTML = `${dailySales.toFixed(2)}<span class="currency">ر.س</span>`;
    kpiValues[1].innerHTML = `${orders.length} <span class="text-sm">طلب</span>`;
    // Hardcoded out-of-stock for now since inventory logic isn't fully complete
    kpiValues[2].innerHTML = `0 <span class="text-sm">صنف</span>`; 
    kpiValues[3].innerHTML = `${totalExp.toFixed(2)}<span class="currency">ر.س</span>`;
    
    const dBalEl = kpiValues[4];
    dBalEl.innerHTML = `${drawerBalance.toFixed(2)}<span class="currency">ر.س</span>`;
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
                        <td style="font-weight:bold">${o.total.toFixed(2)} ر.س</td>
                        <td><span class="status completed">مكتمل</span></td>
                        <td><button class="action-btn" title="عرض"><i class="ph ph-eye"></i></button></td>
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
                        <span class="sales-revenue">${itm.revenue.toFixed(2)} ر.س</span>
                    </div>
                </div>
                `;
                itemsContainer.insertAdjacentHTML('beforeend', tr);
            });
        }
    }


    // --- 4. RENDER CHART ---
    // We already included Chart.js in index.html, we can just attach to canvas
    const ctxCanvas = document.getElementById('salesChart');
    if(ctxCanvas && typeof Chart !== 'undefined') {
        const ctx = ctxCanvas.getContext('2d');
        
        // Simulating chart data around the live dailySales
        let fakeData = [
            dailySales * 0.4, 
            dailySales * 0.7, 
            dailySales * 0.5, 
            dailySales * 0.9, 
            dailySales * 0.6, 
            dailySales * 1.1, 
            dailySales
        ];

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'اليوم'],
                datasets: [{
                    label: 'إجمالي المبيعات (ر.س)',
                    data: fakeData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: '#10b981',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { grid: { display: false, drawBorder: false }, ticks: { color: 'rgba(255,255,255,0.5)', font: { family: 'Cairo' } } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.5)', font: { family: 'Cairo' } } }
                }
            }
        });
    }

});
