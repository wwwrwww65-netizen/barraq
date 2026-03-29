const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const dbPath = require('electron').ipcRenderer.sendSync('get-db-path');

function loadDB() {
    try { return JSON.parse(fs.readFileSync(dbPath, 'utf8')); }
    catch(e) { return { orders:[], products:[], inventory:[], purchases:[], suppliers:[], inventoryTx:[], returns:[], expenses:[], bankTransfers:[] }; }
}
function saveDB(db) { fs.writeFileSync(dbPath, JSON.stringify(db, null, 2)); }

document.addEventListener('DOMContentLoaded', async () => {

    // ✅ 1. Data Retrieval from JSON DB (The Accounting Core needs everything)
    const posOrders = await ipcRenderer.invoke('db-get-orders') || [];

    const db = loadDB();
    const erpPurchases = db.purchases || [];
    let erpExpenses = db.expenses || [];
    const bankTransfers = db.bankTransfers || [];

    // Seed initial expenses if empty
    if(erpExpenses.length === 0) {
        erpExpenses = [
            { id: 'EXP-101', date: new Date().toISOString().split('T')[0], cat: 'إيجارات', desc: 'إيجار شهر المطعم الرئيسي', amount: 5000, pMethod: 'bank' },
            { id: 'EXP-102', date: new Date().toISOString().split('T')[0], cat: 'تغليف ومستهلكات', desc: 'أكياس وعلب بلاستيكية', amount: 450, pMethod: 'cash' },
            { id: 'EXP-103', date: new Date().toISOString().split('T')[0], cat: 'رواتب وأجور', desc: 'سلفة حساب راتب الطباخ', amount: 1500, pMethod: 'cash' }
        ];
        db.expenses = erpExpenses;
        saveDB(db);
    }

    // 2. ✅ Financial Aggregation Engine
    let totalRev = 0, cashRev = 0, bankRev = 0;
    posOrders.forEach(o => {
        totalRev += o.total;
        if(o.paymentMethod === 'cash' || o.paymentMethod === 'كاش') {
            cashRev += o.total;
        } else if(['card','bank','شبكة / بطاقة','شبكة'].includes(o.paymentMethod)) {
            bankRev += o.total;
        } else if(o.paymentMethod === 'مجزأ') {
            cashRev += (o.splitCash || 0);
            bankRev += (o.splitNetwork || 0);
        }
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

    // Manual Transfers
    let manualCashIn = 0, manualCashOut = 0, manualBankIn = 0, manualBankOut = 0;
    bankTransfers.forEach(t => {
        if(t.type === 'deposit_cash') manualCashIn += t.amount;
        if(t.type === 'deposit_bank') manualBankIn += t.amount;
        if(t.type === 'transfer_to_bank') { manualCashOut += t.amount; manualBankIn += t.amount; }
        if(t.type === 'transfer_to_cash') { manualBankOut += t.amount; manualCashIn += t.amount; }
    });

    const netProfit = totalRev - totalPur - totalExp;
    const cashBal = cashRev - cashPur - cashExp + manualCashIn - manualCashOut;
    const bankBal = bankRev - bankPur - bankExp + manualBankIn - manualBankOut;

    // Render Bank Transactions Table
    const bankTrxBody = document.getElementById('bank-trx-body');
    if(bankTrxBody) {
        if(bankTransfers.length === 0) {
            bankTrxBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;">لا توجد حركات تحويل أو إيداع يدوية حتى الآن.</td></tr>';
        } else {
            let html = '';
            [...bankTransfers].reverse().forEach(t => {
                let dStr = new Date(t.date).toLocaleString('ar-SA');
                let typeStr = '', colorAttr = '';
                if(t.type==='deposit_cash') { typeStr='إيداع للخزينة (كاش)'; colorAttr='var(--accent-green)'; }
                if(t.type==='deposit_bank') { typeStr='إيداع للبنك'; colorAttr='var(--accent-blue)'; }
                if(t.type==='transfer_to_bank') { typeStr='تحويل من الخزينة للبنك'; colorAttr='var(--accent-orange)'; }
                if(t.type==='transfer_to_cash') { typeStr='تحويل من البنك للخزينة'; colorAttr='var(--accent-orange)'; }
                html += `
                    <tr>
                        <td dir="ltr" style="text-align:right">${dStr}</td>
                        <td style="color:${colorAttr}; font-weight:700;">${typeStr}</td>
                        <td style="color:white; font-weight:800; font-size:16px;">${t.amount.toLocaleString('en-US', {minimumFractionDigits:2})}</td>
                        <td>${t.desc}</td>
                    </tr>`;
            });
            bankTrxBody.innerHTML = html;
        }
    }

    // ----- A. accounting.html Dashboard -----
    if(document.getElementById('kpi-revenue')) {
        const fmt = (n) => n.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});

        document.getElementById('kpi-revenue').innerText = fmt(totalRev) + ' ر.س';
        document.getElementById('kpi-expenses').innerText = fmt(totalPur + totalExp) + ' ر.س';
        document.getElementById('kpi-profit').innerText = fmt(netProfit) + ' ر.س';

        const pt = document.getElementById('kpi-profit-trend');
        if(pt) {
            if(netProfit >= 0) {
                pt.className = 'kpi-trend positive';
                pt.innerHTML = '<i class="ph-bold ph-trend-up"></i> أرباح إيجابية';
            } else {
                pt.className = 'kpi-trend negative';
                pt.innerHTML = '<i class="ph-bold ph-trend-down"></i> خسارة تشغيلية';
                document.getElementById('kpi-profit').style.color = 'var(--accent-red)';
            }
        }

        if(document.getElementById('bal-total')) document.getElementById('bal-total').innerText = fmt(cashBal + bankBal) + ' ر.س';
        if(document.getElementById('bal-cash')) document.getElementById('bal-cash').innerText = fmt(cashBal) + ' ر.س';
        if(document.getElementById('bal-bank')) document.getElementById('bal-bank').innerText = fmt(bankBal) + ' ر.س';

        const today = new Date().toLocaleDateString('ar-SA', {weekday:'long', year:'numeric', month:'long', day:'numeric'});
        if(document.getElementById('current-date')) document.getElementById('current-date').innerText = today;

        const ctx = document.getElementById('financeChart');
        if(ctx) {
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: ['السبت','الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة'],
                    datasets: [
                        { label: 'الإيرادات المستلمة', data: [totalRev*0.10,totalRev*0.12,totalRev*0.15,totalRev*0.18,totalRev*0.20,totalRev*0.22,totalRev*0.03], borderColor:'#10b981', backgroundColor:'rgba(16,185,129,0.1)', fill:true, tension:0.4 },
                        { label: 'المصروفات والتوريد', data: [totalPur*0.12,totalPur*0.08,totalPur*0.14,totalPur*0.10,totalPur*0.18,totalPur*0.15,totalPur*0.05], borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,0.1)', fill:true, tension:0.4 }
                    ]
                },
                options: { responsive:true, color:'#fff', scales: { x:{ticks:{color:'#94a3b8'}}, y:{ticks:{color:'#94a3b8'}} } }
            });
        }

        const rentries = document.getElementById('recent-entries');
        if(rentries) {
            let combined = [
                ...posOrders.map(o => ({ date: new Date(o.timestamp||Date.now()), id: o.orderId, desc: 'مبيعات الكاشير', amt: o.total, type: 'in', acc:'صندوق الإيرادات' })),
                ...erpPurchases.map(p => ({ date: new Date(p.date), id: p.id, desc: 'شراء فاتورة مورد: '+p.supName, amt: p.total, type: 'out', acc:'المشتريات' })),
                ...erpExpenses.map(e => ({ date: new Date(e.date), id: e.id, desc: e.desc, amt: e.amount, type: 'out', acc: e.cat }))
            ];
            combined.sort((a,b) => b.date - a.date);
            combined.slice(0, 5).forEach(c => {
                const dStr = c.date.toISOString().split('T')[0];
                const isOut = c.type === 'out';
                rentries.innerHTML += `
                    <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border-color); padding:12px 16px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                        <div style="display:flex; gap:16px; align-items:center;">
                            <div style="width:40px; height:40px; border-radius:8px; background:${isOut?'rgba(239,68,68,0.1)':'rgba(16,185,129,0.1)'}; color:${isOut?'var(--accent-red)':'var(--accent-green)'}; display:flex; align-items:center; justify-content:center; font-size:20px;">
                                <i class="ph-bold ${isOut?'ph-arrow-up-right':'ph-arrow-down-left'}"></i>
                            </div>
                            <div>
                                <div style="font-weight:700; color:white;">${c.desc}</div>
                                <div style="font-size:12px; color:var(--text-muted);">${dStr} • مرجع: ${c.id||'-'}</div>
                            </div>
                        </div>
                        <div style="text-align:left;">
                            <div style="font-weight:800; color:${isOut?'var(--text)':'var(--accent-green)'};">${isOut?'- ':'+ '}${c.amt.toLocaleString()} ر.س</div>
                            <div style="font-size:11px; color:var(--text-muted); background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; display:inline-block; margin-top:4px;">${c.acc}</div>
                        </div>
                    </div>`;
            });
        }
    }

    // ----- B. acc-expenses.html Expenses Management -----
    if(document.getElementById('exp-tbody')) {
        const fmt2 = (n) => n.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
        const kpiExp = document.getElementById('kpi-total-exp');
        if(kpiExp) kpiExp.innerText = fmt2(totalExp) + ' ر.س';

        const renderExp = () => {
            const tbody = document.getElementById('exp-tbody');
            tbody.innerHTML = '';
            const q = (document.getElementById('search-exp')?.value || '').toLowerCase();
            const filt = erpExpenses.filter(e => e.desc.toLowerCase().includes(q) || e.cat.includes(q));
            filt.sort((a,b) => new Date(b.date) - new Date(a.date));
            if(filt.length===0) { tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:20px;">لا توجد مصروفات.</td></tr>'; return; }
            filt.forEach(e => {
                let m = e.pMethod === 'cash'
                    ? '<span class="inv-tag tag-safe" style="background:#0f172a; border:1px solid #334155; color:white;"><i class="ph-fill ph-money"></i> كاش نقدي</span>'
                    : '<span class="inv-tag tag-safe" style="background:rgba(59,130,246,0.1); color:var(--accent-blue)"><i class="ph-fill ph-bank"></i> حوالة بنكية</span>';
                tbody.innerHTML += `
                    <tr>
                        <td><strong>${e.id}</strong></td>
                        <td dir="ltr" style="text-align:right">${e.date}</td>
                        <td style="color:var(--accent-orange); font-weight:700;">${e.cat}</td>
                        <td>${e.desc}</td>
                        <td style="font-weight:800; font-size:16px;">${e.amount.toLocaleString()}</td>
                        <td>${m}</td>
                        <td><button title="طباعة السند" style="background:none; border:none; color:var(--accent-blue); font-size:18px; cursor:pointer;"><i class="ph ph-printer"></i></button></td>
                    </tr>`;
            });
        };

        const modal = document.getElementById('expenseModal');
        document.getElementById('btn-add-expense')?.addEventListener('click', () => modal.classList.add('active'));
        document.querySelectorAll('.btn-close-modal').forEach(b => b.addEventListener('click', () => modal.classList.remove('active')));
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
            // ✅ Save to JSON DB
            const dbNow = loadDB();
            if(!dbNow.expenses) dbNow.expenses = [];
            dbNow.expenses.push(newExp);
            saveDB(dbNow);

            erpExpenses.push(newExp);
            totalExp += newExp.amount;
            if(kpiExp) kpiExp.innerText = totalExp.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' ر.س';

            modal.classList.remove('active');
            renderExp();
        });

        document.getElementById('search-exp')?.addEventListener('input', renderExp);
        renderExp();
    }

    // ----- C. acc-reports.html Final Reports -----
    if(document.getElementById('pl-total-rev')) {
        const fmt3 = (n) => n.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});

        document.getElementById('pl-rev-sales').innerText = fmt3(totalRev);
        document.getElementById('pl-total-rev').innerText = fmt3(totalRev);
        document.getElementById('pl-cogs-pur').innerText = `(${fmt3(totalPur)})`;
        const gross = totalRev - totalPur;
        document.getElementById('pl-gross-profit').innerText = fmt3(gross);
        document.getElementById('pl-exp-salaries').innerText = `(${fmt3(salaries)})`;
        document.getElementById('pl-exp-rent').innerText = `(${fmt3(rent)})`;
        document.getElementById('pl-exp-other').innerText = `(${fmt3(others)})`;
        document.getElementById('pl-total-exp').innerText = `(${fmt3(totalExp)})`;
        document.getElementById('pl-net-profit').innerText = fmt3(netProfit) + ' ر.س';

        // General Ledger
        const lTbody = document.getElementById('ledger-tbody');
        if(lTbody) {
            let combinedLedger = [
                ...posOrders.map(o => ({ date: new Date(o.timestamp||Date.now()), id: o.orderId, type:'إيراد', desc:'مبيعات الكاشير', inAmt:o.total, outAmt:0 })),
                ...erpPurchases.map(p => ({ date: new Date(p.date), id: p.id, type:'مشتريات/بضاعة', desc:`فاتورة من ${p.supName}`, inAmt:0, outAmt:p.total })),
                ...erpExpenses.map(e => ({ date: new Date(e.date), id: e.id, type:`مصروف - ${e.cat}`, desc:e.desc, inAmt:0, outAmt:e.amount }))
            ];
            combinedLedger.sort((a,b) => b.date - a.date);
            lTbody.innerHTML = '';
            combinedLedger.forEach(l => {
                lTbody.innerHTML += `
                    <tr>
                        <td dir="ltr" style="text-align:right">${l.date.toISOString().split('T')[0]}</td>
                        <td><strong>${l.id||'-'}</strong></td>
                        <td style="color:var(--text-muted)">${l.type}</td>
                        <td>${l.desc}</td>
                        <td style="color:var(--accent-green); font-weight:700;">${l.inAmt>0?l.inAmt.toLocaleString():'-'}</td>
                        <td style="color:var(--accent-red); font-weight:700;">${l.outAmt>0?l.outAmt.toLocaleString():'-'}</td>
                    </tr>`;
            });
        }

        // Balance Sheet
        if(document.getElementById('bs-cash')) {
            const fmt4 = (n) => n.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' ر.س';
            document.getElementById('bs-cash').innerText = fmt4(cashBal);
            document.getElementById('bs-bank').innerText = fmt4(bankBal);
            document.getElementById('bs-total-assets').innerText = fmt4(cashBal + bankBal);
            document.getElementById('bs-retained-earnings').innerText = fmt4(netProfit);
            document.getElementById('bs-total-liabilities').innerText = fmt4(cashBal + bankBal);
        }
    }
});
