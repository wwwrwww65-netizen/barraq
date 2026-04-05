(function() {
document.addEventListener('DOMContentLoaded', async () => {

    let accChart = null;
    let currentAccPeriod = 'this_month';

    async function loadAccountingData(period = 'this_month') {
        const db = await window.dbRead();
        let posOrders = db.orders || [];
        let erpPurchases = db.purchases || [];
        let erpExpenses = db.expenses || [];
        let bankTransfers = db.bankTransfers || [];
        let returnsRows = db.returns || [];
        let hrExpenses = db.hrExpenses || [];
        let otherIncomeRows = db.otherIncome || [];

    if(window.isDateInPeriod) {
        posOrders = posOrders.filter(o => window.isDateInPeriod(o.timestamp || o.dateStr || o.date, period));
        erpPurchases = erpPurchases.filter(p => window.isDateInPeriod(p.date, period));
        erpExpenses = erpExpenses.filter(e => window.isDateInPeriod(e.date, period));
        bankTransfers = bankTransfers.filter(t => window.isDateInPeriod(t.date, period));
        returnsRows = returnsRows.filter(r => window.isDateInPeriod(r.timestamp || r.date, period));
        hrExpenses = hrExpenses.filter((h) => window.isDateInPeriod(h.timestamp || h.date, period));
        otherIncomeRows = otherIncomeRows.filter((row) =>
            window.isDateInPeriod(row.date || row.timestamp, period),
        );
    }

    function hrAffectsLiquidity(h) {
        const t = String(h.type || '');
        return !t.includes('خصم') && !t.includes('جزاء');
    }

    let totalReturns = 0;
    returnsRows.forEach((r) => { totalReturns += Number(r.amount) || 0; });
    let totalOtherIncome = 0;
    otherIncomeRows.forEach((row) => { totalOtherIncome += Number(row.amount) || 0; });

    /** تجميع حسب يوم الأسبوع — ترتيب المخطط: السبت … الجمعة */
    function jsDayToChartBucket(d) {
        if (!d || isNaN(d.getTime())) return null;
        const g = d.getDay();
        return g === 6 ? 0 : g + 1;
    }
    function sumByWeekday(rows, getDateFn, getValueFn) {
        const b = [0, 0, 0, 0, 0, 0, 0];
        rows.forEach((row) => {
            const d = getDateFn(row);
            if (!d || isNaN(d.getTime())) return;
            const di = jsDayToChartBucket(d);
            if (di === null) return;
            b[di] += Number(getValueFn(row)) || 0;
        });
        return b;
    }

    const revByDayGross = sumByWeekday(
        posOrders,
        (o) => new Date(o.timestamp || o.date || Date.now()),
        (o) => o.total,
    );
    const retByDay = sumByWeekday(
        returnsRows,
        (r) => new Date(r.timestamp || r.date || Date.now()),
        (r) => Number(r.amount) || 0,
    );
    const otherIncByDay = sumByWeekday(
        otherIncomeRows,
        (row) => new Date(row.timestamp || row.date || Date.now()),
        (row) => Number(row.amount) || 0,
    );
    const revByDay = revByDayGross.map((v, i) =>
        Math.max(0, v - (retByDay[i] || 0)) + (otherIncByDay[i] || 0),
    );
    const purByDay = sumByWeekday(
        erpPurchases,
        (p) => new Date(p.date || Date.now()),
        (p) => p.total,
    );
    const expByDay = sumByWeekday(
        erpExpenses,
        (e) => new Date(e.date || Date.now()),
        (e) => e.amount,
    );
    const hrByDay = sumByWeekday(
        hrExpenses.filter(hrAffectsLiquidity),
        (h) => new Date(h.timestamp || h.date || Date.now()),
        (h) => Number(h.amount) || 0,
    );
    const outByDay = revByDay.map((_, i) => purByDay[i] + expByDay[i] + hrByDay[i]);

    // 2. ✅ Financial Aggregation Engine (مواءمة مع profit-loss.js)
    let totalRev = 0, cashRev = 0, bankRev = 0;
    posOrders.forEach((o) => {
        const t = Number(o.total) || 0;
        totalRev += t;
        const pm = o.paymentMethod || '';
        if (pm === 'cash' || pm === 'كاش') cashRev += t;
        else if (['card', 'bank', 'شبكة / بطاقة', 'شبكة'].includes(pm)) bankRev += t;
        else if (pm === 'مجزأ') {
            cashRev += Number(o.splitCash) || 0;
            bankRev += Number(o.splitNetwork) || 0;
        } else {
            bankRev += t;
        }
    });
    otherIncomeRows.forEach((row) => {
        const a = Number(row.amount) || 0;
        if (row.pMethod === 'bank') bankRev += a;
        else cashRev += a;
    });
    const totalRevNet = Math.max(0, totalRev - totalReturns) + totalOtherIncome;

    let totalPur = 0, cashPur = 0, bankPur = 0;
    erpPurchases.forEach((p) => {
        const pt = Number(p.total) || 0;
        totalPur += pt;
        if (p.payMethod === 'cash') cashPur += pt;
        if (p.payMethod === 'bank') bankPur += pt;
    });

    let totalExp = 0, cashExp = 0, bankExp = 0;
    let salaries = 0, rent = 0, others = 0;
    erpExpenses.forEach((e) => {
        const a = Number(e.amount) || 0;
        totalExp += a;
        if (e.pMethod === 'cash') cashExp += a;
        if (e.pMethod === 'bank') bankExp += a;
        if (e.cat && e.cat.includes('رواتب')) salaries += a;
        else if (e.cat && e.cat.includes('إيجار')) rent += a;
        else others += a;
    });
    /* سندات HR: الصرف النقدي/البنكي فقط (خصم/جزاء = ذمّة موظف دون خروج نقد آني) */
    hrExpenses.forEach((h) => {
        if (!hrAffectsLiquidity(h)) return;
        const a = Number(h.amount) || 0;
        totalExp += a;
        salaries += a;
        if (h.pMethod === 'bank') bankExp += a;
        else cashExp += a;
    });

    function returnRefundCashBank(r) {
        const amt = Number(r.amount) || 0;
        const pm = String(r.method || '').trim();
        if (pm === 'cash' || pm === 'كاش' || pm === 'نقد') return { c: amt, b: 0 };
        if (['card', 'bank', 'شبكة / بطاقة', 'شبكة', 'مدى', 'فيزا'].includes(pm)) return { c: 0, b: amt };
        if (pm === 'مجزأ') {
            const c = Number(r.splitCash) || 0;
            const b = Number(r.splitNetwork) || 0;
            return c || b ? { c, b } : { c: 0, b: amt };
        }
        return { c: 0, b: amt };
    }
    let cashRetOut = 0, bankRetOut = 0;
    returnsRows.forEach((r) => {
        const x = returnRefundCashBank(r);
        cashRetOut += x.c;
        bankRetOut += x.b;
    });

    // Manual Transfers
    let manualCashIn = 0, manualCashOut = 0, manualBankIn = 0, manualBankOut = 0;
    bankTransfers.forEach(t => {
        if(t.type === 'deposit_cash') manualCashIn += t.amount;
        if(t.type === 'deposit_bank') manualBankIn += t.amount;
        if(t.type === 'transfer_to_bank') { manualCashOut += t.amount; manualBankIn += t.amount; }
        if(t.type === 'transfer_to_cash') { manualBankOut += t.amount; manualCashIn += t.amount; }
    });

    const netProfit = totalRevNet - totalPur - totalExp;
    const cashBal = cashRev - cashPur - cashExp - cashRetOut + manualCashIn - manualCashOut;
    const bankBal = bankRev - bankPur - bankExp - bankRetOut + manualBankIn - manualBankOut;

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

        document.getElementById('kpi-revenue').innerText = fmt(totalRevNet) + ' ر.س';
        document.getElementById('kpi-expenses').innerText = fmt(totalPur + totalExp) + ' ر.س';
        document.getElementById('kpi-profit').innerText = fmt(netProfit) + ' ر.س';

        const kpiProfitEl = document.getElementById('kpi-profit');
        const pt = document.getElementById('kpi-profit-trend');
        if (pt && kpiProfitEl) {
            if (netProfit >= 0) {
                pt.className = 'kpi-trend positive';
                pt.innerHTML = '<i class="ph-bold ph-trend-up"></i> أرباح إيجابية';
                kpiProfitEl.style.color = '';
            } else {
                pt.className = 'kpi-trend negative';
                pt.innerHTML = '<i class="ph-bold ph-trend-down"></i> خسارة تشغيلية';
                kpiProfitEl.style.color = 'var(--accent-red)';
            }
        }

        if(document.getElementById('bal-total')) document.getElementById('bal-total').innerText = fmt(cashBal + bankBal) + ' ر.س';
        if(document.getElementById('bal-cash')) document.getElementById('bal-cash').innerText = fmt(cashBal) + ' ر.س';
        if(document.getElementById('bal-bank')) document.getElementById('bal-bank').innerText = fmt(bankBal) + ' ر.س';

        const today = new Date().toLocaleDateString('ar-SA', {weekday:'long', year:'numeric', month:'long', day:'numeric'});
        if(document.getElementById('current-date')) document.getElementById('current-date').innerText = today;

        const ctx = document.getElementById('financeChart');
        if(ctx) {
            if(accChart) accChart.destroy();
            accChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: ['السبت','الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة'],
                    datasets: [
                        { label: 'الإيراد بعد المرتجعات (حسب يوم الأسبوع)', data: revByDay, borderColor:'#10b981', backgroundColor:'rgba(16,185,129,0.1)', fill:true, tension:0.4 },
                        { label: 'توريد + مصروفات + سندات موظفين', data: outByDay, borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,0.1)', fill:true, tension:0.4 }
                    ]
                },
                options: { responsive:true, color:'#fff', scales: { x:{ticks:{color:'#94a3b8'}}, y:{ticks:{color:'#94a3b8'}} } }
            });
        }

        const rentries = document.getElementById('recent-entries');
        if(rentries) {
            let combined = [
                ...posOrders.map(o => ({ date: new Date(o.timestamp||o.date||Date.now()), id: o.orderId, desc: 'مبيعات الكاشير', amt: o.total, type: 'in', acc:'صندوق الإيرادات' })),
                ...returnsRows.map((r) => ({
                    date: new Date(r.timestamp || r.date || Date.now()),
                    id: r.id || r.returnId || 'RET',
                    desc: r.reason ? `مرتجع: ${r.reason}` : 'مرتجع مبيعات',
                    amt: Number(r.amount) || 0,
                    type: 'out',
                    acc: 'مرتجعات',
                })),
                ...erpPurchases.map(p => ({ date: new Date(p.date||Date.now()), id: p.id, desc: 'شراء فاتورة مورد: '+(p.supName||'عام'), amt: p.total, type: 'out', acc:'المشتريات' })),
                ...erpExpenses.map(e => ({ date: new Date(e.date||Date.now()), id: e.id, desc: e.desc, amt: e.amount, type: 'out', acc: e.cat })),
                ...hrExpenses.filter(hrAffectsLiquidity).map((h) => ({
                    date: new Date(h.timestamp || h.date || Date.now()),
                    id: h.id || 'HR-' + (h.timestamp || ''),
                    desc: (h.type || 'سند') + (h.employee ? ` — ${h.employee}` : '') + (h.reason ? `: ${h.reason}` : ''),
                    amt: Number(h.amount) || 0,
                    type: 'out',
                    acc: 'موارد بشرية',
                })),
                ...otherIncomeRows.map((row) => ({
                    date: new Date(row.timestamp || row.date || Date.now()),
                    id: row.id || 'OI-' + (row.timestamp || ''),
                    desc: row.desc || row.note || 'إيراد آخر',
                    amt: Number(row.amount) || 0,
                    type: 'in',
                    acc: 'إيرادات أخرى',
                })),
            ];
            
            // Clean invalid dates
            combined.forEach(c => { if(isNaN(c.date.getTime())) c.date = new Date(); });
            
            combined.sort((a,b) => b.date - a.date);
            rentries.innerHTML = ''; // Clear loader
            
            if(combined.length === 0) {
                rentries.innerHTML = '<div style="text-align:center; padding:20px; color:gray;">لا توجد حركات مسجلة</div>';
            }
            
            combined.slice(0, 7).forEach(c => {
                let dStr = "تاريخ غير متوفر";
                try { dStr = c.date.toISOString().split('T')[0]; } catch(e) {}
                
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
            const filt = erpExpenses.filter(e => e.desc.toLowerCase().includes(q) || (e.cat && e.cat.includes(q)));
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
        function closeExpenseModal() {
            if (!modal) return;
            modal.classList.remove('active');
            modal.setAttribute('inert', '');
            const ae = document.activeElement;
            if (ae && modal.contains(ae)) {
                try {
                    ae.blur();
                } catch (_) { /* ignore */ }
            }
            try {
                document.body.setAttribute('tabindex', '-1');
                document.body.focus({ preventScroll: true });
                document.body.removeAttribute('tabindex');
            } catch (_) { /* ignore */ }
        }
        document.getElementById('btn-add-expense')?.addEventListener('click', () => {
            modal.removeAttribute('inert');
            modal.classList.add('active');
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const el = document.getElementById('exp-category');
                    try {
                        el?.focus({ preventScroll: true });
                    } catch (_) {
                        el?.focus();
                    }
                });
            });
        });
        document.querySelectorAll('.btn-close-modal').forEach(b => b.addEventListener('click', () => closeExpenseModal()));
        if(document.getElementById('exp-date')) {
            const tzDate = new Date();
            const localYMD = tzDate.getFullYear() + '-' + String(tzDate.getMonth()+1).padStart(2, '0') + '-' + String(tzDate.getDate()).padStart(2, '0');
            document.getElementById('exp-date').value = localYMD;
        }

        document.getElementById('form-expense')?.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const newExp = {
                id: 'EXP-' + Math.floor(Math.random()*9000+1000),
                cat: document.getElementById('exp-category').value,
                desc: document.getElementById('exp-desc').value,
                amount: Number(document.getElementById('exp-amount').value),
                date: document.getElementById('exp-date').value,
                pMethod: document.getElementById('exp-payment').value
            };
            const dbNow = await window.dbRead();
            if(!dbNow.expenses) dbNow.expenses = [];
            dbNow.expenses.push(newExp);
            await window.dbWrite(dbNow);

            erpExpenses.push(newExp);
            totalExp += newExp.amount;
            if(kpiExp) kpiExp.innerText = totalExp.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' ر.س';

            closeExpenseModal();
            const formExp = document.getElementById('form-expense');
            if (formExp) formExp.reset();
            const expDateInput = document.getElementById('exp-date');
            if (expDateInput) {
                const tzD = new Date();
                expDateInput.value = tzD.getFullYear() + '-' + String(tzD.getMonth() + 1).padStart(2, '0') + '-' + String(tzD.getDate()).padStart(2, '0');
            }
            renderExp();

            // تأجيل التقاط الصورة والواتساب إلى إطار لاحق حتى تُغلق الواجهة ولا يتداخل html2canvas مع التركيز
            setTimeout(() => {
                (async () => {
                    try {
                        const waRaw = localStorage.getItem('wa_settings');
                        if (!waRaw) return;
                        const waSettings = JSON.parse(waRaw);
                        if (!waSettings.expenses || !waSettings.admin) return;
                        const adminPhone = String(waSettings.admin);

                        const sysRaw = localStorage.getItem('restaurant_settings');
                        const sysSet = sysRaw ? JSON.parse(sysRaw) : {};
                        const todayStr = newExp.date || new Date().toISOString().split('T')[0];

                        if(document.getElementById('ev-date')) document.getElementById('ev-date').innerText = todayStr;
                        if(document.getElementById('ev-number')) document.getElementById('ev-number').innerText = newExp.id;
                        if(document.getElementById('ev-cat')) document.getElementById('ev-cat').innerText = newExp.cat;
                        if(document.getElementById('ev-amt')) document.getElementById('ev-amt').innerText = newExp.amount.toLocaleString('en-US', {minimumFractionDigits:2}) + ' ر.س';
                        if(document.getElementById('ev-desc')) document.getElementById('ev-desc').innerText = newExp.desc;
                        if(document.getElementById('ev-pay')) document.getElementById('ev-pay').innerText = newExp.pMethod === 'cash' ? 'كاش نقدي' : 'حوالة بنكية';
                        if(document.getElementById('ev-rest-name')) document.getElementById('ev-rest-name').innerText = sysSet.name || '';
                        if(document.getElementById('ev-branch')) document.getElementById('ev-branch').innerText = sysSet.branch || '';
                        if(document.getElementById('ev-phone')) document.getElementById('ev-phone').innerText = sysSet.phone || '';
                        if(document.getElementById('ev-stamp')) document.getElementById('ev-stamp').innerText = sysSet.name || '';
                        const logoEl = document.getElementById('ev-logo');
                        if(logoEl && sysSet.logo && sysSet.logo !== '1111.png') logoEl.src = sysSet.logo;

                        const voucherEl = document.getElementById('exp-voucher-template');
                        const container = document.getElementById('exp-voucher-container');
                        if (!voucherEl || !container) return;
                        try {
                            container.style.position = 'fixed';
                            container.style.top = '-9999px';
                            container.style.left = '0';
                            container.style.width = '840px';
                            voucherEl.style.width = '800px';
                            await new Promise(r => setTimeout(r, 150));

                            const canvas = await html2canvas(voucherEl, { scale:2, useCORS:true, backgroundColor:'#fff', width:800, windowWidth:1200, logging:false });

                            const fc = document.createElement('canvas'); fc.width=1600; fc.height=1132;
                            const ctx2 = fc.getContext('2d');
                            ctx2.fillStyle='#fff'; ctx2.fillRect(0,0,1600,1132);
                            ctx2.drawImage(canvas, 0, 0, 1600, 1132);
                            const imgData = fc.toDataURL('image/jpeg', 0.95);

                            const captionMsg = `سند مصروف — ${newExp.cat}\nالمبلغ: ${newExp.amount.toLocaleString('en-US')} ر.س\n${newExp.desc}`;
                            const { ipcRenderer } = require('electron');
                            const hubIp =
                                typeof window.resolveWaHubIp === 'function'
                                    ? window.resolveWaHubIp(waSettings)
                                    : (waSettings.hubIp && String(waSettings.hubIp).trim()) || '';
                            ipcRenderer.send('wa-send-message', {
                                number: adminPhone,
                                text: captionMsg,
                                image: imgData,
                                waHubIp: hubIp,
                            });
                            console.log('Sent expense voucher image to admin:', adminPhone);
                        } finally {
                            container.style.position = 'absolute';
                            container.style.top = '-9999px';
                            container.style.left = '-9999px';
                            container.style.width = '';
                            voucherEl.style.width = '';
                            document.querySelectorAll('iframe.html2canvas-container').forEach((f) => {
                                try {
                                    f.remove();
                                } catch (_) { /* ignore */ }
                            });
                        }
                    } catch (sqError) { console.error('Error sending expense WA voucher', sqError); }
                })();
            }, 0);
        });

        document.getElementById('search-exp')?.addEventListener('input', renderExp);
        renderExp();
    }

    // ----- C. acc-reports.html Final Reports -----
    if(document.getElementById('pl-total-rev')) {
        const fmt3 = (n) => n.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});

        document.getElementById('pl-rev-sales').innerText = fmt3(totalRev);
        const plRet = document.getElementById('pl-returns-row');
        if (plRet) plRet.innerText = totalReturns > 0 ? `(${fmt3(totalReturns)})` : '0.00';
        document.getElementById('pl-total-rev').innerText = fmt3(totalRevNet);
        document.getElementById('pl-cogs-pur').innerText = `(${fmt3(totalPur)})`;
        const gross = totalRevNet - totalPur;
        document.getElementById('pl-gross-profit').innerText = fmt3(gross);
        document.getElementById('pl-exp-salaries').innerText = `(${fmt3(salaries)})`;
        document.getElementById('pl-exp-rent').innerText = `(${fmt3(rent)})`;
        document.getElementById('pl-exp-other').innerText = `(${fmt3(others)})`;
        document.getElementById('pl-total-exp').innerText = `(${fmt3(totalExp)})`;
        document.getElementById('pl-net-profit').innerText = fmt3(netProfit) + ' ر.س';

        // Zakat & Taxes calculations
        let dynamicTaxRate = 0.15;
        try {
           const sysRaw = JSON.parse(localStorage.getItem('restaurant_settings')||'{}');
           if(sysRaw.taxRate !== undefined) dynamicTaxRate = Number(sysRaw.taxRate)/100;
        } catch(e) {}

        const taxBase = totalRevNet > 0 ? totalRevNet : 0;
        const taxCollected = taxBase - (taxBase / (1 + dynamicTaxRate));
        const extZakatAmount = netProfit > 0 ? (netProfit * 0.025) : 0;
        const netTaxStatement = taxCollected; // Usually minus tax paid on purchases, but keeping simple

        if(document.getElementById('pl-tax-collected')) {
            document.getElementById('pl-tax-collected').innerText = fmt3(taxCollected);
            document.getElementById('pl-zakat-est').innerText = fmt3(extZakatAmount);
            document.getElementById('pl-net-tax').innerText = fmt3(netTaxStatement);
        }

        // General Ledger
        const lTbody = document.getElementById('ledger-tbody');
        if(lTbody) {
            let combinedLedger = [
                ...posOrders.map(o => ({ date: new Date(o.timestamp||Date.now()), id: o.orderId, type:'إيراد', desc:'مبيعات الكاشير', inAmt:o.total, outAmt:0 })),
                ...returnsRows.map((r) => ({
                    date: new Date(r.timestamp || r.date || Date.now()),
                    id: r.id || r.returnId || 'RET',
                    type: 'مرتجع',
                    desc: r.reason || 'مرتجع مبيعات',
                    inAmt: 0,
                    outAmt: Number(r.amount) || 0,
                })),
                ...erpPurchases.map(p => ({ date: new Date(p.date), id: p.id, type:'مشتريات/بضاعة', desc:`فاتورة من ${p.supName}`, inAmt:0, outAmt:p.total })),
                ...erpExpenses.map(e => ({ date: new Date(e.date), id: e.id, type:`مصروف - ${e.cat}`, desc:e.desc, inAmt:0, outAmt:e.amount })),
                ...hrExpenses.filter(hrAffectsLiquidity).map((h) => ({
                    date: new Date(h.timestamp || h.date || Date.now()),
                    id: h.id || 'HR-' + (h.timestamp || ''),
                    type: 'موارد بشرية',
                    desc: `${h.type || 'سند'}${h.employee ? ` — ${h.employee}` : ''}`,
                    inAmt: 0,
                    outAmt: Number(h.amount) || 0,
                })),
                ...otherIncomeRows.map((row) => ({
                    date: new Date(row.timestamp || row.date || Date.now()),
                    id: row.id || 'OI-' + (row.timestamp || ''),
                    type: 'إيراد آخر',
                    desc: row.desc || row.note || '—',
                    inAmt: Number(row.amount) || 0,
                    outAmt: 0,
                })),
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
    } // End of loadAccountingData

    // Setup filter listeners
    const filterBtns = document.querySelectorAll('.header-actions .filter-btn, .time-filters .filter-btn');
    if(filterBtns.length > 0) {
        filterBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                filterBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                let txt = e.target.innerText;
                let p = 'this_month';
                if(txt.includes('اليوم')) p = 'today';
                else if(txt.includes('ربع')) p = 'quarter';
                else if(txt.includes('سنة') || txt.includes('سنوي')) p = 'year';
                currentAccPeriod = p;
                loadAccountingData(p);
            });
        });
        
        let initialPeriod = 'this_month';
        const activeBtn = document.querySelector('.time-filters .filter-btn.active');
        if(activeBtn) {
            let txt = activeBtn.innerText;
            if(txt.includes('اليوم')) initialPeriod = 'today';
            else if(txt.includes('ربع')) initialPeriod = 'quarter';
            else if(txt.includes('سنة')) initialPeriod = 'year';
        }
        currentAccPeriod = initialPeriod;
        await loadAccountingData(initialPeriod);
    } else {
        currentAccPeriod = 'all';
        await loadAccountingData('all');
    }

    if (typeof window.registerPosDatabaseRefresh === 'function') {
        window.registerPosDatabaseRefresh(() => loadAccountingData(currentAccPeriod));
    }
});
})();
