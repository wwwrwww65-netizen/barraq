document.addEventListener('DOMContentLoaded', () => {

    // 1. Data Retrieval (The Accounting Core needs everything)
    const posOrders = JSON.parse(localStorage.getItem('pos_orders') || '[]');
    const erpPurchases = JSON.parse(localStorage.getItem('erp_purchases') || '[]');
    let erpExpenses = JSON.parse(localStorage.getItem('erp_expenses') || '[]');

    // Fake Initial Expenses if empty
    if(erpExpenses.length === 0) {
        erpExpenses = [
            { id: 'EXP-101', date: '2023-10-01', cat: 'إيجارات', desc: 'إيجار شهر 10 المطعم الرئيسي', amount: 5000, pMethod: 'bank' },
            { id: 'EXP-102', date: '2023-10-05', cat: 'تغليف ومستهلكات', desc: 'أكياس وعلب بلاستيكية من السوق', amount: 450, pMethod: 'cash' },
            { id: 'EXP-103', date: '2023-10-10', cat: 'رواتب وأجور', desc: 'سلفة حساب راتب الطباخ أمين', amount: 1500, pMethod: 'cash' }
        ];
        localStorage.setItem('erp_expenses', JSON.stringify(erpExpenses));
    }

    // 2. Financial Aggregation Engine
    let totalRev = 0, cashRev = 0, bankRev = 0;
    posOrders.forEach(o => {
        totalRev += o.total;
        if(o.paymentMethod === 'cash') cashRev += o.total;
        if(o.paymentMethod === 'card' || o.paymentMethod === 'bank') bankRev += o.total;
    });

    let totalPur = 0, cashPur = 0, bankPur = 0;
    erpPurchases.forEach(p => {
        totalPur += p.total;
        if(p.payMethod === 'cash') cashPur += p.total;
        if(p.payMethod === 'bank') bankPur += p.total;
    });

    let totalExp = 0, cashExp = 0, bankExp = 0;
    let salaries = 0, rent = 0, others = 0;
    erpExpenses.forEach(e => {
        totalExp += e.amount;
        if(e.pMethod === 'cash') cashExp += e.amount;
        if(e.pMethod === 'bank') bankExp += e.amount;

        if(e.cat.includes('رواتب')) salaries += e.amount;
        else if(e.cat.includes('إيجار')) rent += e.amount;
        else others += e.amount;
    });

    const netProfit = totalRev - totalPur - totalExp;
    const cashBal = cashRev - cashPur - cashExp;
    const bankBal = bankRev - bankPur - bankExp;

    // ----- A. Dashboard `accounting.html` Logic -----
    if(document.getElementById('kpi-revenue')) {
        document.getElementById('kpi-revenue').innerText = totalRev.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' ر.س';
        document.getElementById('kpi-expenses').innerText = (totalPur + totalExp).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' ر.س';
        document.getElementById('kpi-profit').innerText = netProfit.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' ر.س';
        
        const pt = document.getElementById('kpi-profit-trend');
        if(netProfit >= 0) {
            pt.className = 'kpi-trend positive';
            pt.innerHTML = '<i class="ph-bold ph-trend-up"></i> أرباح إيجابية';
        } else {
            pt.className = 'kpi-trend negative';
            pt.innerHTML = '<i class="ph-bold ph-trend-down"></i> خسارة تشغيلية';
            document.getElementById('kpi-profit').style.color = 'var(--accent-red)';
        }

        if(document.getElementById('bal-total')) {
            document.getElementById('bal-total').innerText = (cashBal + bankBal).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' ر.س';
        }
        if(document.getElementById('bal-cash')) document.getElementById('bal-cash').innerText = cashBal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' ر.س';
        if(document.getElementById('bal-bank')) document.getElementById('bal-bank').innerText = bankBal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' ر.س';

        const today = new Date().toLocaleDateString('ar-SA', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'});
        if(document.getElementById('current-date')) document.getElementById('current-date').innerText = today;

        // Chart (Static Mock Data vs Dynamic total)
        const ctx = document.getElementById('financeChart');
        if(ctx) {
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'],
                    datasets: [
                        { label: 'الإيرادات المستلمة', data: [1200, 1900, 1500, 2100, 2500, 3000, 3500], borderColor: '#10b981', backgroundColor:'rgba(16,185,129,0.1)', fill: true, tension: 0.4 },
                        { label: 'المصروفات و التوريد', data: [800, 500, 900, 600, 1200, 800, 1000], borderColor: '#f59e0b', backgroundColor:'rgba(245,158,11,0.1)', fill: true, tension: 0.4 }
                    ]
                },
                options: { responsive: true, color: '#fff', scales: { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } } }
            });
        }

        // Recent Entries List
        const rentries = document.getElementById('recent-entries');
        let combined = [
            ...posOrders.map(o => ({ date: new Date(o.date||Date.now()), id: o.id, desc: 'مبيعات الكاشير', amt: o.total, type: 'in', acc:'صندوق الإيرادات' })),
            ...erpPurchases.map(p => ({ date: new Date(p.date), id: p.id, desc: 'شراء فاتورة مورد: '+p.supName, amt: p.total, type: 'out', acc:'المشتريات' })),
            ...erpExpenses.map(e => ({ date: new Date(e.date), id: e.id, desc: e.desc, amt: e.amount, type: 'out', acc: e.cat }))
        ];
        combined.sort((a,b) => b.date - a.date);
        combined.slice(0, 5).forEach(c => {
            const dStr = c.date.toISOString().split('T')[0];
            const isOut = c.type === 'out';
            const html = `
                <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border-color); padding:12px 16px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; gap:16px; align-items:center;">
                        <div style="width:40px; height:40px; border-radius:8px; background:${isOut?'rgba(239,68,68,0.1)':'rgba(16,185,129,0.1)'}; color:${isOut?'var(--accent-red)':'var(--accent-green)'}; display:flex; align-items:center; justify-content:center; font-size:20px;">
                            <i class="ph-bold ${isOut?'ph-arrow-up-right':'ph-arrow-down-left'}"></i>
                        </div>
                        <div>
                            <div style="font-weight:700; color:white;">${c.desc}</div>
                            <div style="font-size:12px; color:var(--text-muted);">${dStr} • مرجع: ${c.id}</div>
                        </div>
                    </div>
                    <div style="text-align:left;">
                        <div style="font-weight:800; color:${isOut?'var(--text)':'var(--accent-green)'};">${isOut?'- ':'+ '}${c.amt.toLocaleString()} ر.س</div>
                        <div style="font-size:11px; color:var(--text-muted); background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; display:inline-block; margin-top:4px;">${c.acc}</div>
                    </div>
                </div>
            `;
            rentries.innerHTML += html;
        });
    }

    // ----- B. Expenses Management `acc-expenses.html` -----
    if(document.getElementById('exp-tbody')) {
        document.getElementById('kpi-total-exp').innerText = totalExp.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' ';

        const renderExp = () => {
            const tbody = document.getElementById('exp-tbody');
            tbody.innerHTML = '';
            const q = (document.getElementById('search-exp')?.value || '').toLowerCase();
            const filt = erpExpenses.filter(e => e.desc.toLowerCase().includes(q) || e.cat.includes(q));
            filt.sort((a,b) => new Date(b.date) - new Date(a.date));

            if(filt.length===0) { tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:20px;">لا توجد مصروفات.</td></tr>'; return; }

            filt.forEach(e => {
                let m = e.pMethod === 'cash' ? '<span class="inv-tag tag-safe" style="background:#0f172a; border:1px solid #334155; color:white;"><i class="ph-fill ph-money"></i> كاش نقدي</span>' : '<span class="inv-tag tag-safe" style="background:rgba(59,130,246,0.1); color:var(--accent-blue)"><i class="ph-fill ph-bank"></i> حوالة بنكية</span>';
                tbody.innerHTML += `
                    <tr>
                        <td><strong>${e.id}</strong></td>
                        <td dir="ltr" style="text-align:right">${e.date}</td>
                        <td style="color:var(--accent-orange); font-weight:700;">${e.cat}</td>
                        <td>${e.desc}</td>
                        <td style="font-weight:800; font-size:16px;">${e.amount.toLocaleString()}</td>
                        <td>${m}</td>
                        <td><button title="طباعة السند" style="background:none; border:none; color:var(--accent-blue); font-size:18px; cursor:pointer;"><i class="ph ph-printer"></i></button></td>
                    </tr>
                `;
            });
        };

        const modal = document.getElementById('expenseModal');
        document.getElementById('btn-add-expense')?.addEventListener('click', () => modal.classList.add('active'));
        document.querySelectorAll('.btn-close-modal').forEach(b => b.addEventListener('click', () => modal.classList.remove('active')));
        
        // Auto Date
        if(document.getElementById('exp-date')) document.getElementById('exp-date').valueAsDate = new Date();

        document.getElementById('form-expense')?.addEventListener('submit', (ev) => {
            ev.preventDefault();
            const newExp = {
                id: 'EXP-' + Math.floor(Math.random()*9000+1000),
                cat: document.getElementById('exp-category').value,
                desc: document.getElementById('exp-desc').value,
                amount: Number(document.getElementById('exp-amount').value),
                date: document.getElementById('exp-date').value,
                pMethod: document.getElementById('exp-payment').value
            };
            erpExpenses.push(newExp);
            localStorage.setItem('erp_expenses', JSON.stringify(erpExpenses));
            modal.classList.remove('active');
            window.location.reload(); // Quick refresh to update everything
        });

        document.getElementById('search-exp')?.addEventListener('input', renderExp);
        renderExp();
    }

    // ----- C. Final Reports `acc-reports.html` -----
    if(document.getElementById('pl-total-rev')) {
        // Income Statement Fill
        document.getElementById('pl-rev-sales').innerText = totalRev.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        document.getElementById('pl-total-rev').innerText = totalRev.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

        document.getElementById('pl-cogs-pur').innerText = `(${totalPur.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})})`;
        const gross = totalRev - totalPur;
        document.getElementById('pl-gross-profit').innerText = gross.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

        document.getElementById('pl-exp-salaries').innerText = `(${salaries.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})})`;
        document.getElementById('pl-exp-rent').innerText = `(${rent.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})})`;
        document.getElementById('pl-exp-other').innerText = `(${others.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})})`;
        document.getElementById('pl-total-exp').innerText = `(${totalExp.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})})`;

        document.getElementById('pl-net-profit').innerText = netProfit.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' ر.س';

        // Ledger Fill
        const lTbody = document.getElementById('ledger-tbody');
        let combinedLedger = [
            ...posOrders.map(o => ({ date: new Date(o.date||Date.now()), id: o.id, type: 'إيراد', desc: 'مبيعات الكاشير', inAmt: o.total, outAmt: 0 })),
            ...erpPurchases.map(p => ({ date: new Date(p.date), id: p.id, type: 'مشتريات/بضاعة', desc: `فاتورة من ${p.supName}`, inAmt: 0, outAmt: p.total })),
            ...erpExpenses.map(e => ({ date: new Date(e.date), id: e.id, type: `مصروف - ${e.cat}`, desc: e.desc, inAmt: 0, outAmt: e.amount }))
        ];
        combinedLedger.sort((a,b) => b.date - a.date);
        
        lTbody.innerHTML = '';
        combinedLedger.forEach(l => {
            lTbody.innerHTML += `
                <tr>
                    <td dir="ltr" style="text-align:right">${l.date.toISOString().split('T')[0]}</td>
                    <td><strong>${l.id}</strong></td>
                    <td style="color:var(--text-muted)">${l.type}</td>
                    <td>${l.desc}</td>
                    <td style="color:var(--accent-green); font-weight:700;">${l.inAmt>0?l.inAmt.toLocaleString():'-'}</td>
                    <td style="color:var(--accent-red); font-weight:700;">${l.outAmt>0?l.outAmt.toLocaleString():'-'}</td>
                </tr>
            `;
        });
        
        // Balance sheet populator
        if(document.getElementById('bs-cash')) {
            document.getElementById('bs-cash').innerText = cashBal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' ر.س';
            document.getElementById('bs-bank').innerText = bankBal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' ر.س';
            document.getElementById('bs-total-assets').innerText = (cashBal + bankBal).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' ر.س';
            document.getElementById('bs-retained-earnings').innerText = netProfit.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' ر.س';
            document.getElementById('bs-total-liabilities').innerText = (cashBal + bankBal).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' ر.س';
        }
    }

});
