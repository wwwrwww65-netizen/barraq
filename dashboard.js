document.addEventListener('DOMContentLoaded', async () => {

    const kpiValues = document.querySelectorAll('.kpi-card .kpi-value');
    if(!kpiValues || kpiValues.length < 5) return; // Not on index page

    // FETCH LIVE DATA
    const { ipcRenderer } = require('electron');
    let orders = await ipcRenderer.invoke('db-get-orders');
    if(!orders) orders = [];

    const rStr = localStorage.getItem('pos_returns');
    const hStr = localStorage.getItem('hr_expenses');
    let returns = rStr ? JSON.parse(rStr) : [];
    let hrExpenses = hStr ? JSON.parse(hStr) : [];

    // --- 1. CALCULATE KPIs (Daily Logic Simplified for Demo) ---
    // In a real app we'd filter by today's date, here we just sum them all assuming they are current session
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

    let drawerBalance = cashSales - totalExp; // Only cash goes to drawer

    // Apply to UI
    kpiValues[0].innerHTML = `${dailySales.toFixed(2)}<span class="currency">ر.س</span>`;
    kpiValues[1].innerHTML = `${orders.length} <span class="text-sm">طلب</span>`;
    let lowStockCount = 0;
    const invStr = localStorage.getItem('erp_inventory_items');
    if(invStr) {
        const invItems = JSON.parse(invStr);
        lowStockCount = invItems.filter(it => it.qty <= it.minQty).length;
    }
    
    kpiValues[2].innerHTML = `${lowStockCount} <span class="text-sm">صنف</span>`; 
    if(lowStockCount > 0) {
        kpiValues[2].style.color = 'var(--accent-orange)';
        kpiValues[2].style.textShadow = '0 0 10px rgba(245, 158, 11, 0.5)';
    }
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

    // --- 5. SHIFT REPORT MODAL LOGIC ---
    window.openShiftReport = function() {
        const modal = document.getElementById('shiftReportModal');
        if(!modal) return;
        
        const now = new Date();
        document.getElementById('shift-datetime').innerText = now.toLocaleString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        
        document.getElementById('shift-cash').innerText = cashSales.toFixed(2) + ' ر.س';
        document.getElementById('shift-network').innerText = networkSales.toFixed(2) + ' ر.س';
        document.getElementById('shift-total-income').innerText = (cashSales + networkSales).toFixed(2) + ' ر.س';
        
        document.getElementById('shift-tax').innerText = totalTax.toFixed(2) + ' ر.س';
        document.getElementById('shift-returns').innerText = totalReturnsAmt.toFixed(2) + ' ر.س';
        document.getElementById('shift-expenses').innerText = totalExp.toFixed(2) + ' ر.س';
        
        document.getElementById('shift-drawer').innerText = drawerBalance.toFixed(2) + ' ر.س';
        
        document.getElementById('shift-grand-total').innerText = dailySales.toFixed(2) + ' ر.س';

        modal.style.display = 'flex';
    };

    window.closeShiftReport = function() {
        const modal = document.getElementById('shiftReportModal');
        if(modal) modal.style.display = 'none';
    };

    window.printShiftReport = function() {
        window.print();
        // Option to optionally clear logs and actually close shift: 
        // localStorage.setItem('pos_returns', '[]');
        // We'll just leave it as is for reporting logic 
    };

});
