document.addEventListener('DOMContentLoaded', () => {
    
    // --- Elements ---
    const searchInput = document.getElementById('return-search-input');
    const btnSearch = document.getElementById('btn-search-order');
    const resultCard = document.getElementById('order-result');
    
    const resId = document.getElementById('res-order-id');
    const resDate = document.getElementById('res-date');
    const resTotal = document.getElementById('res-total');
    const resMethod = document.getElementById('res-method');
    const resType = document.getElementById('res-type');
    
    const btnProcess = document.getElementById('btn-process-return');

    let currentFoundOrder = null;

    // --- Search Logic ---
    btnSearch.addEventListener('click', () => {
        const query = searchInput.value.trim();
        if(!query) return alert('الرجاء إدخال رقم الطلب أولاً');

        const ordersStr = localStorage.getItem('pos_orders');
        const orders = ordersStr ? JSON.parse(ordersStr) : [];
        
        // Find order exactly matching ID
        const found = orders.find(o => o.orderId.toLowerCase() === query.toLowerCase());

        if(found) {
            currentFoundOrder = found;
            resId.innerText = 'رقم الطلب: ' + found.orderId;
            resDate.innerText = found.date;
            resTotal.innerText = found.total.toFixed(2) + ' ر.س';
            resMethod.innerText = found.paymentMethod;
            resType.innerText = found.type;
            
            resultCard.classList.add('active');
        } else {
            resultCard.classList.remove('active');
            currentFoundOrder = null;
            alert('لم يتم العثور على أي فاتورة مبيعات مسجلة بهذا الرقم. تأكد من الرقم واعد المحاولة.');
        }
    });

    // --- Process Return Logic ---
    btnProcess.addEventListener('click', () => {
        if(!currentFoundOrder) return;

        if(!confirm('تأكيد عملية الإسترجاع؟ سيتم خصم المبلغ من المبيعات الأصلية وإلغاء الفواتير.')) return;

        const originalText = btnProcess.innerHTML;
        btnProcess.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin"></i> جاري ارجاع المبلغ...';
        btnProcess.style.pointerEvents = 'none';

        setTimeout(() => {
            // 1. Remove from Sales (pos_orders)
            let ordersStr = localStorage.getItem('pos_orders');
            let orders = ordersStr ? JSON.parse(ordersStr) : [];
            orders = orders.filter(o => o.orderId !== currentFoundOrder.orderId);
            localStorage.setItem('pos_orders', JSON.stringify(orders));

            // 2. Add to Returns (pos_returns)
            let returnsStr = localStorage.getItem('pos_returns');
            let returns = returnsStr ? JSON.parse(returnsStr) : [];
            
            const now = new Date();
            const timeStr = now.toLocaleTimeString('ar-SA');
            
            returns.push({
                origId: currentFoundOrder.orderId,
                returnTime: now.toLocaleDateString('ar-SA') + ' ' + timeStr,
                timestamp: now.getTime(),
                amount: currentFoundOrder.total,
                method: currentFoundOrder.paymentMethod,
                emp: 'سعيد باعمر (المدير)'
            });
            localStorage.setItem('pos_returns', JSON.stringify(returns));

            alert('تم استرداد المبلغ وإلغاء عملية الكاشير بنجاح!');
            
            // Reset state
            resultCard.classList.remove('active');
            currentFoundOrder = null;
            searchInput.value = '';
            btnProcess.innerHTML = originalText;
            btnProcess.style.pointerEvents = 'auto';

            loadReturns();

        }, 1200);
    });

    // --- Load Returns Historical Data ---
    function loadReturns() {
        const returnsStr = localStorage.getItem('pos_returns');
        const returns = returnsStr ? JSON.parse(returnsStr) : [];
        
        const tbody = document.getElementById('returns-tbody');
        const emptyState = document.getElementById('empty-returns');
        const tableObj = document.querySelector('.ret-table');

        // Sort descending
        returns.sort((a,b) => b.timestamp - a.timestamp);

        // Update KPIs
        let totalVal = 0;
        returns.forEach(r => totalVal += r.amount);

        document.getElementById('kpi-total-returns').innerText = totalVal.toFixed(2) + ' ر.س';
        document.getElementById('kpi-return-count').innerText = returns.length + ' طلب';
        
        if(returns.length > 0) {
            document.getElementById('kpi-last-return').innerHTML = returns[0].returnTime + `<br><span style="font-size:14px;color:var(--text-muted)">(${returns[0].origId})</span>`;
        }

        if(returns.length === 0) {
            tableObj.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        tableObj.style.display = 'table';
        tbody.innerHTML = '';

        returns.forEach(r => {
            let row = `
                <tr>
                    <td><strong>${r.origId}</strong></td>
                    <td style="color:var(--text-secondary); font-size:12px;">${r.returnTime}</td>
                    <td style="color:var(--accent-red); font-weight:800;">${r.amount.toFixed(2)} ر.س</td>
                    <td><span style="color:var(--text-secondary)"><i class="ph ph-money"></i> ${r.method}</span></td>
                    <td>${r.emp}</td>
                    <td><span class="badge-returned">مسترجع</span></td>
                </tr>
            `;
            tbody.insertAdjacentHTML('beforeend', row);
        });
    }

    loadReturns();
});
