(function() {
document.addEventListener('DOMContentLoaded', async () => {

    let accChart = null;
    let currentAccPeriod = 'today';

    async function loadAccountingData(period = 'this_month') {
        const xf = (n) =>
            window.MisterCasherCurrency
                ? MisterCasherCurrency.format(n)
                : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ر.س';
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
        if (t.includes('سلفة')) return true;
        return !t.includes('خصم / جزاء') && !t.includes('جزاء');
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
                let dStr = new Date(t.date).toLocaleString('ar-u-nu-latn');
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

        document.getElementById('kpi-revenue').innerText = xf(totalRevNet);
        document.getElementById('kpi-expenses').innerText = xf(totalPur + totalExp);
        document.getElementById('kpi-profit').innerText = xf(netProfit);

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

        if(document.getElementById('bal-total')) document.getElementById('bal-total').innerText = xf(cashBal + bankBal);
        if(document.getElementById('bal-cash')) document.getElementById('bal-cash').innerText = xf(cashBal);
        if(document.getElementById('bal-bank')) document.getElementById('bal-bank').innerText = xf(bankBal);

        const today = new Date().toLocaleDateString('ar-u-nu-latn', {weekday:'long', year:'numeric', month:'long', day:'numeric'});
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
                            <div style="font-weight:800; color:${isOut?'var(--text)':'var(--accent-green)'};">${isOut?'- ':'+ '}${xf(c.amt)}</div>
                            <div style="font-size:11px; color:var(--text-muted); background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; display:inline-block; margin-top:4px;">${c.acc}</div>
                        </div>
                    </div>`;
            });
        }
    }

    // ----- B. acc-expenses.html Expenses Management -----
    if(document.getElementById('exp-tbody')) {
        const fmt2 = (n) => n.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});

        function tripleUnder1000(n) {
            const num = Math.floor(Number(n)) % 1000;
            if (num === 0) return '';
            const a = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
            const tensNames = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
            const teens = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
            const hundredsCompound = ['', '', '', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
            const h = Math.floor(num / 100);
            const rest = num % 100;
            const parts = [];
            if (h === 1) parts.push('مائة');
            else if (h === 2) parts.push('مائتان');
            else if (h > 2) parts.push(hundredsCompound[h] || a[h] + 'مائة');
            if (rest === 0) return parts.join(' و');
            const t = Math.floor(rest / 10);
            const u = rest % 10;
            if (t === 0) parts.push(a[u]);
            else if (t === 1) parts.push(teens[u]);
            else if (u === 0) parts.push(tensNames[t]);
            else parts.push(a[u] + ' و' + tensNames[t]);
            return parts.filter(Boolean).join(' و');
        }
        function thousandsMultiplierWords(q) {
            if (q === 1) return 'ألف';
            if (q === 2) return 'ألفان';
            const t = tripleUnder1000(q);
            if (q >= 3 && q <= 10) return t + ' آلاف';
            return t + ' ألفاً';
        }
        function integerToArabicWords(n) {
            let v = Math.floor(Number(n));
            if (v === 0) return 'صفر';
            if (v < 0 || v > 999999999) return String(v);
            if (v < 1000) return tripleUnder1000(v) || 'صفر';
            const q = Math.floor(v / 1000);
            const r = v % 1000;
            const qw = thousandsMultiplierWords(q);
            if (r === 0) return qw;
            const rw = tripleUnder1000(r);
            return rw ? qw + ' و' + rw : qw;
        }
        function sarAmountToArabicWords(amount) {
            const x = Math.round(Number(amount) * 100) / 100;
            if (!isFinite(x) || x < 0) return '';
            const riyals = Math.floor(x + 1e-8);
            const halalas = Math.round((x - riyals) * 100);
            let s = 'فقط ' + integerToArabicWords(riyals) + ' ريال سعودي';
            if (halalas > 0) s += ' و' + integerToArabicWords(halalas) + ' هللة';
            s += ' لاغير';
            return s.replace(/\s+/g, ' ').trim();
        }

        const kpiExp = document.getElementById('kpi-total-exp');
        if(kpiExp) kpiExp.innerText = xf(totalExp);

        const renderExp = () => {
            const tbody = document.getElementById('exp-tbody');
            const tfoot = document.getElementById('exp-tfoot');
            tbody.innerHTML = '';
            const q = (document.getElementById('search-exp')?.value || '').toLowerCase();
            const periodSelect = document.getElementById('exp-period-filter');
            const selPeriod = periodSelect ? periodSelect.value : 'all';
            
            const fDateInput = document.getElementById('exp-date-from');
            const tDateInput = document.getElementById('exp-date-to');
            const fDate = fDateInput ? fDateInput.value : '';
            const tDate = tDateInput ? tDateInput.value : '';

            const customWrap = document.getElementById('exp-custom-date-wrap');
            if(customWrap) {
                customWrap.style.display = (selPeriod === 'custom') ? 'flex' : 'none';
            }
            
            // Apply filtering for expenses report based on selection
            const baseExpenses = (db.expenses || []).map((e) => ({
                ...e,
                _source: 'expense',
                _textDesc: String(e.desc || ''),
                _textCat: String(e.cat || ''),
                _displayCat: String(e.cat || 'مصروف عام'),
                _displayDesc: String(e.desc || '—'),
                _displayPMethod: String(e.pMethod || 'cash'),
                _displayId: String(e.id || 'EXP'),
                _dateRef: e.timestamp || e.date,
            }));
            const normalizeHrTypeLabel = (type) => {
                const t = String(type || '').trim();
                if (t === 'عليه (سلفة/خصم)') return 'عليه (سلفة)';
                return t || 'سند موظف';
            };
            const hrAsExpenses = (db.hrExpenses || []).map((h, origIdx) => ({ h, origIdx })).filter(item => hrAffectsLiquidity(item.h)).map(item => ({
                ...item.h,
                _source: 'hr',
                _hrIndex: item.origIdx,
                _textDesc: String(item.h.reason || item.h.type || ''),
                _textCat: String(item.h.type || 'سند موظف'),
                _displayCat: normalizeHrTypeLabel(item.h.type),
                _displayDesc: (item.h.employee ? `الموظف: ${item.h.employee} — ` : '') + String(item.h.reason || 'سند صرف موظف'),
                _displayPMethod: String(item.h.pMethod || 'cash'),
                _displayId: String(item.h.voucherNo || item.h.id || ('HR-' + (item.h.timestamp || ''))),
                _dateRef: item.h.timestamp || item.h.date,
            }));
            let filt = baseExpenses.concat(hrAsExpenses);
            filt = filt.filter(e => {
                let textMatch = e._textDesc.toLowerCase().includes(q) || e._textCat.toLowerCase().includes(q);
                
                let dateMatch = true;
                if(selPeriod === 'custom') {
                    if(!e.date) dateMatch = false;
                    else {
                        let ed = new Date(e.date);
                        ed.setHours(0,0,0,0);
                        if(fDate) {
                            let fd = new Date(fDate);
                            fd.setHours(0,0,0,0);
                            if(ed < fd) dateMatch = false;
                        }
                        if(tDate && dateMatch) {
                            let td = new Date(tDate);
                            td.setHours(0,0,0,0);
                            if(ed > td) dateMatch = false;
                        }
                    }
                } else {
                    const dateRef = e._dateRef || e.date;
                    dateMatch = window.isDateInPeriod(dateRef, selPeriod);
                }
                
                return textMatch && dateMatch;
            });
            filt.sort((a,b) => new Date(a._dateRef || a.date) - new Date(b._dateRef || b.date)); // Sort ascending for running balance logic
            const sum = filt.reduce((s, e) => s + (Number(e.amount) || 0), 0);
            const sumStr = fmt2(sum);
            const wordsLine = sarAmountToArabicWords(sum);
            const sym = window.MisterCasherCurrency ? MisterCasherCurrency.getConfig().symbol : 'ر.س';

            // Helper to recursively calculate balance up to a date limit
            function calculateBalancesUpTo(dateLimitExclusive=null, startTime=null) {
                let cash = 0, bank = 0;
                let bOrders = db.orders || [];
                let bReturns = db.returns || [];
                let bPurchases = db.purchases || [];
                let bExpenses = db.expenses || [];
                let bOtherInc = db.otherIncome || [];
                let bBankTrans = db.bankTransfers || [];
                let bHrExp = db.hrExpenses || [];
                
                const isInRange = (dStr) => {
                    if(!dStr) return false;
                    let targetD = new Date(dStr || Date.now());
                    if(startTime && targetD < startTime) return false;
                    if(dateLimitExclusive && targetD >= dateLimitExclusive) return false;
                    return true;
                };

                bOrders.forEach(o => {
                    if(!isInRange(o.timestamp||o.dateStr||o.date)) return;
                    let t = Number(o.total)||0;
                    let pm = o.paymentMethod||'';
                    if(['cash','كاش','نقد'].includes(pm)) cash += t;
                    else if(['card','bank','شبكة / بطاقة','شبكة','مدى','فيزا'].includes(pm)) bank += t;
                    else if(pm==='مجزأ') { cash += Number(o.splitCash)||0; bank += Number(o.splitNetwork)||0; }
                    else bank += t;
                });

                bReturns.forEach(r => {
                    if(!isInRange(r.timestamp||r.date)) return;
                    let x = returnRefundCashBank(r);
                    cash -= x.c; bank -= x.b;
                });

                bPurchases.forEach(p => {
                    if(!isInRange(p.date)) return;
                    let pt = Number(p.total)||0;
                    if(p.payMethod==='cash') cash -= pt;
                    if(p.payMethod==='bank') bank -= pt;
                });

                bExpenses.forEach(e => {
                    if(!isInRange(e.date)) return;
                    let a = Number(e.amount)||0;
                    if(e.pMethod==='cash') cash -= a;
                    if(e.pMethod==='bank') bank -= a;
                });
                
                bHrExp.forEach(h => {
                    if(!hrAffectsLiquidity(h)) return;
                    if(!isInRange(h.timestamp||h.date)) return;
                    let a = Number(h.amount)||0;
                    if(h.pMethod==='bank') bank -= a;
                    else cash -= a;
                });

                bOtherInc.forEach(row => {
                    if(!isInRange(row.timestamp||row.date)) return;
                    let a = Number(row.amount)||0;
                    if(row.pMethod==='bank') bank += a;
                    else cash += a;
                });

                bBankTrans.forEach(t => {
                    if(!isInRange(t.date)) return;
                    if(t.type==='deposit_cash') cash += Number(t.amount)||0;
                    if(t.type==='deposit_bank') bank += Number(t.amount)||0;
                    if(t.type==='transfer_to_bank') { cash -= Number(t.amount)||0; bank += Number(t.amount)||0; }
                    if(t.type==='transfer_to_cash') { bank -= Number(t.amount)||0; cash += Number(t.amount)||0; }
                });

                return { cash, bank };
            }

            // Logic to match Main Dashboard "Drawer Balance" EXACTLY
            const lastZTimeNum = parseInt(localStorage.getItem('last_z_report_time')) || 0;
            const shiftFloat = parseFloat(localStorage.getItem('shift_cash_float')) || 0;

            // Dashboard logic: Filter by Today AND last Z-report
            // Exclude returned orders to match dashboard calculation
            let dOrders = (db.orders || []).filter(o =>
                o.status !== 'returned' &&
                window.isDateInPeriod(o.timestamp || o.dateStr || o.date, 'today') && 
                ((o.timestamp || o.createdAt || Date.now()) >= lastZTimeNum)
            );
            let dReturns = (db.returns || []).filter(r => 
                window.isDateInPeriod(r.timestamp || r.date, 'today') &&
                ((r.timestamp || Date.now()) >= lastZTimeNum)
            );
            let dExpenses = (db.hrExpenses || []).concat(db.expenses || []).filter(h => 
                window.isDateInPeriod(h.timestamp || h.date, 'today') &&
                ((h.timestamp || new Date(h.date).getTime()) >= lastZTimeNum)
            );

            function splitShiftOrder(o) {
                const pm = String(o.paymentMethod || '').trim();
                const total = Number(o.total) || 0;
                const isHS = o.hungerStation === true || o.orderType === 'هنقرستيشن';
                const isHSPaid = o.hsPaymentStatus === 'paid';
                
                // HungerStation unpaid should NOT affect drawer balance
                if (isHS && !isHSPaid) {
                    return { cash: 0, network: 0, hungerStation: total };
                }
                
                // HungerStation paid - check payment method
                if (isHS && isHSPaid) {
                    const hsMethod = (o.hsPaymentMethod || '').trim();
                    if (hsMethod.includes('كاش') || hsMethod === 'cash') {
                        return { cash: total, network: 0, hungerStation: 0 };
                    } else {
                        return { cash: 0, network: total, hungerStation: 0 };
                    }
                }
                
                if (pm === 'مجزأ') {
                    const c = Number(o.splitCash) || 0;
                    const n = Number(o.splitNetwork) || 0;
                    
                    // Validation: if split values are invalid, use total as cash
                    if (c < 0 || n < 0) {
                        return { cash: total, network: 0, hungerStation: 0 };
                    }
                    
                    if (c || n) return { cash: c, network: n, hungerStation: 0 };
                    // If no split values stored, assume all cash
                    return { cash: total, network: 0, hungerStation: 0 };
                }
                if (pm.includes('كاش') || pm === 'cash') return { cash: total, network: 0, hungerStation: 0 };
                return { cash: 0, network: total, hungerStation: 0 };
            }
            function splitShiftReturn(r) {
                const pm = String(r.method || '').trim();
                const amount = Number(r.amount) || 0;
                if (pm === 'مجزأ') {
                    const c = Number(r.splitCash) || 0;
                    const n = Number(r.splitNetwork) || 0;
                    if (c || n) return { cash: c, network: n };
                    return { cash: 0, network: amount };
                }
                if (pm.includes('كاش') || pm === 'cash') return { cash: amount, network: 0 };
                return { cash: 0, network: amount };
            }

            let dCashSales = 0;
            let dHungerStationUnpaid = 0;
            dOrders.forEach(o => {
                const pay = splitShiftOrder(o);
                dCashSales += pay.cash;
                dHungerStationUnpaid += (pay.hungerStation || 0);
            });
            // NOTE: Returns are NOT subtracted here because returned orders are already excluded from dOrders
            // This matches the dashboard calculation exactly

            let dTotalExp = 0;
            let dCashExp = 0;
            let dBankExp = 0;
            dExpenses.forEach(h => {
                const a = Number(h.amount) || 0;
                dTotalExp += a;
                // تفريق بين النقدي والبنكي
                if (h.pMethod === 'bank') dBankExp += a;
                else dCashExp += a;
            });

            // رصيد الدرج = يتأثر فقط بالمصروفات النقدية (البنك لا يخرج من الدرج)
            let drawerBalanceNow = shiftFloat + dCashSales - dCashExp;

            
            // Debug: Log the calculation
            console.log('\n💵 Expenses Page - Drawer Balance Calculation:');
            console.log(`   - Shift Float: ${shiftFloat.toFixed(2)} ر.س`);
            console.log(`   - Cash Sales: ${dCashSales.toFixed(2)} ر.س`);
            console.log(`   - HungerStation Unpaid: ${dHungerStationUnpaid.toFixed(2)} ر.س`);
            console.log(`   - Cash Expenses: ${dCashExp.toFixed(2)} ر.س`);
            console.log(`   - Bank Expenses (لا تؤثر على الدرج): ${dBankExp.toFixed(2)} ر.س`);
            console.log(`   - Drawer Balance: ${drawerBalanceNow.toFixed(2)} ر.س`);
            console.log(`   - Check: ${shiftFloat} + ${dCashSales} - ${dCashExp} = ${drawerBalanceNow.toFixed(2)}`);
            
            // Compare with Dashboard if available
            if (window.__dashboardData) {
                const dashDrawer = window.__dashboardData.drawerBalance || 0;
                const diff = Math.abs(drawerBalanceNow - dashDrawer);
                console.log('\n🔍 Comparison with Dashboard:');
                console.log(`   - Expenses Page Drawer: ${drawerBalanceNow.toFixed(2)} ر.س`);
                console.log(`   - Dashboard Drawer: ${dashDrawer.toFixed(2)} ر.س`);
                console.log(`   - Difference: ${diff.toFixed(2)} ر.س`);
                if (diff > 0.01) {
                    console.warn(`   ⚠️ رصيد الدرج مختلف! الفرق: ${diff.toFixed(2)} ر.س`);
                } else {
                    console.log(`   ✅ رصيد الدرج متطابق!`);
                }
            }
            
            let dNetworkSales = 0;
            dOrders.forEach(o => {
                const pay = splitShiftOrder(o);
                dNetworkSales += pay.network;
            });
            // NOTE: Returns are NOT subtracted here because returned orders are already excluded from dOrders
            let networkBalanceNow = dNetworkSales;

            // Accounting Balances (Historical/Lifetime)
            let todayStart = new Date();
            todayStart.setHours(0,0,0,0);
            let balancesYest = calculateBalancesUpTo(todayStart);
            let balancesCurrent = calculateBalancesUpTo(null);

            if(filt.length===0) {
                tbody.innerHTML='<tr><td colspan="9" style="text-align:center;padding:20px;">لا توجد مصروفات.</td></tr>';
            } else {
                let runningBal = 0;
                // We sort descending for display (recent first), but for balance column we need a cumulative sum.
                // Let's keep it simple: if the user wants a running balance, it should be calculated base to top or top to base.
                // Usually, the 'Balance' column in such reports is cumulative.
                // Let's sort ASC, calculate balance, then reverse for display.
                filt.forEach(e => {
                    runningBal += (Number(e.amount) || 0);
                    e._runningBal = runningBal;
                });
                const dispFilt = [...filt].reverse();

                dispFilt.forEach(e => {
                    let m = e._displayPMethod === 'cash'
                        ? '<span class="inv-tag tag-safe" style="background:#0f172a; border:1px solid #334155; color:white;"><i class="ph-fill ph-money"></i> كاش نقدي</span>'
                        : '<span class="inv-tag tag-safe" style="background:rgba(59,130,246,0.1); color:var(--accent-blue)"><i class="ph-fill ph-bank"></i> حوالة بنكية</span>';
                    const amtStr = fmt2(e.amount);
                    const rbStr = fmt2(e._runningBal);
                    const isCancelled = e.status === 'ملغاة';
                    const isEditable = !isCancelled;
                    tbody.innerHTML += `
                        <tr style="${isCancelled ? 'opacity:0.45;' : ''}">
                            <td><strong>${e._displayId}</strong>${isCancelled ? ' <span style="font-size:10px;color:#ef4444;border:1px solid #ef4444;border-radius:4px;padding:1px 5px;">ملغى</span>' : ''}</td>
                            <td dir="ltr" style="text-align:right">${e.date}</td>
                            <td style="color:var(--accent-orange); font-weight:700;">${e._displayCat}</td>
                            <td>${e._displayDesc}</td>
                            <td dir="ltr" style="text-align:right; font-weight:800;">${amtStr}</td>
                            <td dir="ltr" style="text-align:right; font-weight:800;">${amtStr}</td>
                            <td>${m}</td>
                            <td dir="ltr" style="text-align:right; font-weight:800; color:var(--accent-amber);">${rbStr}</td>
                            <td class="no-print">
                                <div style="display:flex;gap:5px;align-items:center;">
                                    <button class="btn-download-exp" data-id="${e.id || ''}" data-source="${e._source}" data-hr-index="${e._source === 'hr' ? e._hrIndex : ''}" title="تحميل صورة السند" style="background:none;border:none;color:var(--accent-blue);font-size:18px;cursor:pointer;"><i class="ph ph-download-simple"></i></button>
                                    ${e._source === 'hr' ? '<span style="font-size:11px;color:var(--text-muted);padding:2px 6px;border:1px solid var(--border-color);border-radius:6px;">سند موظف</span>' : ''}
                                    ${isEditable ? `<button class="btn-edit-exp" data-id="${e.id || ''}" data-source="${e._source}" data-hr-index="${e._source === 'hr' ? e._hrIndex : ''}" title="تعديل السند" style="background:#3b82f6;color:#fff;border:none;border-radius:6px;padding:3px 9px;cursor:pointer;font-size:12px;"><i class="ph ph-pencil"></i> تعديل</button>` : ''}
                                    ${isEditable ? `<button class="btn-delete-exp" data-id="${e.id || ''}" data-source="${e._source}" data-hr-index="${e._source === 'hr' ? e._hrIndex : ''}" title="حذف السند" style="background:#ef4444;color:#fff;border:none;border-radius:6px;padding:3px 9px;cursor:pointer;font-size:12px;"><i class="ph ph-trash"></i> حذف</button>` : ''}
                                </div>
                            </td>
                        </tr>`;
                });

                // Attach edit/delete handlers after rendering
                setTimeout(() => {
                    document.querySelectorAll('.btn-edit-exp').forEach(btn => {
                        btn.addEventListener('click', (ev) => {
                            const src = ev.currentTarget.dataset.source;
                            if (src === 'hr') {
                                const hrIdx = Number(ev.currentTarget.dataset.hrIndex);
                                const hrRec = (db.hrExpenses || [])[hrIdx];
                                if (hrRec) openEditHrModal(hrRec, hrIdx);
                                return;
                            }
                            const expId = ev.currentTarget.dataset.id;
                            const expRec = (db.expenses || []).find(x => x.id === expId);
                            if (expRec) openEditExpModal(expRec);
                        });
                    });
                    document.querySelectorAll('.btn-delete-exp').forEach(btn => {
                        btn.addEventListener('click', async (ev) => {
                            const src = ev.currentTarget.dataset.source;
                            if (src === 'hr') {
                                const hrIdx = Number(ev.currentTarget.dataset.hrIndex);
                                const hrRec = (db.hrExpenses || [])[hrIdx];
                                if (hrRec) await deleteHrExpense(hrRec, hrIdx);
                                return;
                            }
                            const expId = ev.currentTarget.dataset.id;
                            const expRec = (db.expenses || []).find(x => x.id === expId);
                            if (expRec) await deleteExpense(expRec);
                        });
                    });
                    document.querySelectorAll('.btn-download-exp').forEach(btn => {
                        btn.addEventListener('click', async (ev) => {
                            const src = ev.currentTarget.dataset.source;
                            if (src === 'hr') {
                                const hrIdx = Number(ev.currentTarget.dataset.hrIndex);
                                const hrRec = (db.hrExpenses || [])[hrIdx];
                                if (hrRec) await downloadExpenseVoucherImage(hrRec, 'hr');
                            } else {
                                const expId = ev.currentTarget.dataset.id;
                                const expRec = (db.expenses || []).find(x => x.id === expId);
                                if (expRec) await downloadExpenseVoucherImage(expRec, 'expense');
                            }
                        });
                    });
                }, 0);
            }

            if (tfoot) {
                tfoot.innerHTML = `
                    <tr class="exp-foot-total">
                        <td colspan="4" style="text-align:right;">إجمالي العمليات</td>
                        <td dir="ltr" style="text-align:right;">${sumStr}</td>
                        <td dir="ltr" style="text-align:right;">${sumStr}</td>
                        <td>—</td>
                        <td dir="ltr" style="text-align:right;">${sumStr}</td>
                        <td class="no-print"></td>
                    </tr>
                    <tr class="exp-foot-balance">
                        <td colspan="9" class="exp-balance-cell">
                            <div class="exp-balance-inner" style="flex-direction:row; gap:30px; font-size:16px;">
                                <div class="exp-balance-title" style="margin:0;">الرصيد الحالي دائن:</div>
                                <div class="exp-balance-num" dir="ltr" style="margin:0;">${sumStr} ${sym}</div>
                                <div class="exp-balance-words" style="margin:0;">(${wordsLine})</div>
                            </div>
                        </td>
                    </tr>
                    <tr class="exp-balances-summary no-border">
                        <td colspan="9" style="padding:15px; text-align:center;">
                            <div style="display:flex; justify-content:center; align-items:center; flex-wrap:wrap; gap:20px; font-size:14px;">
                                <div class="stat-box" style="padding:10px 20px; border-radius:8px; border:1px solid var(--border-color);">
                                    <span style="color:var(--text-muted);display:block;margin-bottom:4px;font-size:12px">رصيد الدرج الحالي (بالوردية)</span>
                                    <strong style="color:var(--accent-green);font-size:16px;">${fmt2(drawerBalanceNow)} <span>${sym}</span></strong>
                                </div>
                                <div class="stat-box" style="padding:10px 20px; border-radius:8px; border:1px solid var(--border-color);">
                                    <span style="color:var(--text-muted);display:block;margin-bottom:4px;font-size:12px">رصيد الشبكة (بالوردية)</span>
                                    <strong style="color:var(--accent-blue);font-size:16px;">${fmt2(networkBalanceNow)} <span>${sym}</span></strong>
                                </div>
                                <div class="stat-box" style="padding:10px 20px; border-radius:8px; border:1px solid var(--border-color);">
                                    <span style="color:var(--text-muted);display:block;margin-bottom:4px;font-size:12px">رصيد الصندوق الكلي (محاسبياً)</span>
                                    <strong style="color:var(--text-primary);font-size:16px;">${fmt2(balancesCurrent.cash)} <span>${sym}</span></strong>
                                </div>
                                <div class="stat-box" style="padding:10px 20px; border-radius:8px; border:1px solid var(--border-color);">
                                    <span style="color:var(--text-muted);display:block;margin-bottom:4px;font-size:12px">رصيد البنك الكلي (محاسبياً)</span>
                                    <strong style="color:var(--text-primary);font-size:16px;">${fmt2(balancesCurrent.bank)} <span>${sym}</span></strong>
                                </div>
                                <div class="stat-box" style="padding:10px 20px; border-radius:8px; border:1px solid var(--border-color);">
                                    <span style="color:var(--text-muted);display:block;margin-bottom:4px;font-size:12px">إجمالي نقدية المؤسسة</span>
                                    <strong style="color:var(--accent-orange);font-size:16px;">${fmt2(balancesCurrent.cash + balancesCurrent.bank)} <span>${sym}</span></strong>
                                </div>
                            </div>
                        </td>
                    </tr>`;
            }
        };

        function getVoucherCaptureScale() {
            const cores = Number(navigator.hardwareConcurrency) || 2;
            const mem = Number(navigator.deviceMemory) || 0;
            if (cores <= 2 || (mem > 0 && mem <= 2)) return 1.4;
            if (cores <= 4 || (mem > 0 && mem <= 4)) return 1.7;
            return 2;
        }
        const voucherCaptureScale = getVoucherCaptureScale();
        const modal = document.getElementById('expenseModal');
        function closeExpenseModal() {
            if (!modal) return;
            const ae = document.activeElement;
            if (ae && modal.contains(ae)) {
                try {
                    ae.blur();
                } catch (_) { /* ignore */ }
            }
            window.closeModalLayer(modal);
        }
        document.getElementById('btn-add-expense')?.addEventListener('click', () => {
            window.openModalLayer(modal, '#exp-category');
        });
        document.querySelectorAll('.btn-close-modal').forEach(b => b.addEventListener('click', () => closeExpenseModal()));
        if(document.getElementById('exp-date')) {
            const tzDate = new Date();
            const localYMD = tzDate.getFullYear() + '-' + String(tzDate.getMonth()+1).padStart(2, '0') + '-' + String(tzDate.getDate()).padStart(2, '0');
            document.getElementById('exp-date').value = localYMD;
        }

        const expenseForm = document.getElementById('form-expense');
        if (expenseForm && expenseForm.__expenseSubmitHandler) {
            expenseForm.removeEventListener('submit', expenseForm.__expenseSubmitHandler);
        }
        // ── علم تأمين لمنع إرسال سند المصروف أكثر من مرة ──
        let _expenseWaSending = false;
        const expenseSubmitHandler = async (ev) => {
            ev.preventDefault();

            // منع الإرسال المزدوج بالكامل
            if (_expenseWaSending) {
                console.warn('[Expense] Already processing — ignoring duplicate submit');
                return;
            }
            _expenseWaSending = true;

            // منع الإرسال المزدوج - تعطيل الزر أثناء الحفظ
            const submitBtn = ev.target.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> جاري الحفظ...';
            }
            
            const newExp = {
                id: 'EXP-' + Math.floor(Math.random()*9000+1000),
                cat: document.getElementById('exp-category').value,
                desc: document.getElementById('exp-desc').value,
                amount: Number(document.getElementById('exp-amount').value),
                date: document.getElementById('exp-date').value,
                timestamp: Date.now(),
                pMethod: document.getElementById('exp-payment').value
            };
            
            try {
                const dbNow = await window.dbRead();
                if(!dbNow.expenses) dbNow.expenses = [];
                
                // التأكد من عدم التكرار قبل الإضافة
                const exists = dbNow.expenses.find(e => e.id === newExp.id);
                if (!exists) {
                    dbNow.expenses.push(newExp);
                    await window.dbWrite(dbNow);
                }

                // إغلاق النافذة أولاً
                closeExpenseModal();
                const formExp = document.getElementById('form-expense');
                if (formExp) formExp.reset();
                const expDateInput = document.getElementById('exp-date');
                if (expDateInput) {
                    const tzD = new Date();
                    expDateInput.value = tzD.getFullYear() + '-' + String(tzD.getMonth() + 1).padStart(2, '0') + '-' + String(tzD.getDate()).padStart(2, '0');
                }
                
                // تأجيل إعادة التحميل لمنع الشاشة السوداء - إعطاء المتصفح وقت للتحديث
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        renderExp();
                    });
                });
                
                // واتساب - تأجيل أكثر لعدم التداخل مع renderExp
                setTimeout(async () => {
                    try {
                        const waRaw = localStorage.getItem('wa_settings');
                        if (!waRaw) return;
                        const waSettings = JSON.parse(waRaw);
                        if (!waSettings.expenses || !waSettings.admin) return;
                        const adminPhone = String(waSettings.admin);

                        const sysRaw = localStorage.getItem('restaurant_settings');
                        const sysSet = sysRaw ? JSON.parse(sysRaw) : {};
                        const todayStr = newExp.date || new Date().toISOString().split('T')[0];
                        const displayDate = String(todayStr).replace(/-/g, '/');

                        if(document.getElementById('ev-date')) document.getElementById('ev-date').innerText = displayDate;
                        if(document.getElementById('ev-foot-date')) document.getElementById('ev-foot-date').innerText = displayDate;
                        if(document.getElementById('ev-number')) document.getElementById('ev-number').innerText = newExp.id;
                        if(document.getElementById('ev-cat')) document.getElementById('ev-cat').innerText = newExp.cat;
                        if(document.getElementById('ev-amt')) document.getElementById('ev-amt').innerText = xf(newExp.amount);
                        if(document.getElementById('ev-amt-balance')) document.getElementById('ev-amt-balance').innerText = xf(newExp.amount);
                        if(document.getElementById('ev-desc')) document.getElementById('ev-desc').innerText = newExp.desc;
                        if(document.getElementById('ev-pay')) document.getElementById('ev-pay').innerText = newExp.pMethod === 'cash' ? 'كاش' : 'حوالة بنكية';
                        if(document.getElementById('ev-notes')) document.getElementById('ev-notes').innerText = newExp.desc || 'سند مصروف معتمد من النظام';
                        if(document.getElementById('ev-rest-name')) document.getElementById('ev-rest-name').innerText = sysSet.name || '';
                        if(document.getElementById('ev-branch')) document.getElementById('ev-branch').innerText = sysSet.branch || '';
                        if(document.getElementById('ev-phone')) document.getElementById('ev-phone').innerText = sysSet.phone || '';
                        const logoEl = document.getElementById('ev-logo');
                        if(logoEl && sysSet.logo && sysSet.logo !== '2222.png') logoEl.src = sysSet.logo;

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

                            const canvas = await html2canvas(voucherEl, { scale:voucherCaptureScale, useCORS:true, backgroundColor:'#fff', width:800, windowWidth:1200, logging:false });

                            const fc = document.createElement('canvas'); fc.width=1600; fc.height=1132;
                            const ctx2 = fc.getContext('2d');
                            ctx2.fillStyle='#fff'; ctx2.fillRect(0,0,1600,1132);
                            ctx2.drawImage(canvas, 0, 0, 1600, 1132);
                            const imgData = fc.toDataURL('image/jpeg', 0.95);

                            const captionMsg = [
                                `📌 إشعار إداري — سند مصروف`,
                                `───────────────────`,
                                `رقم السند: ${newExp.id}`,
                                ``,
                                `📂 التصنيف: ${newExp.cat}`,
                                `💰 المبلغ: ${xf(newExp.amount)}`,
                                `🗒 البيان: ${newExp.desc}`,
                            ].join('\n');
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
                                wa_mode: localStorage.getItem('wa_mode') || 'browser'
                            });
                            console.log('Sent expense voucher image to admin:', adminPhone);
                        } finally {
                            container.style.position = 'absolute';
                            container.style.top = '-9999px';
                            container.style.left = '-9999px';
                            container.style.width = '';
                            voucherEl.style.width = '';
                            document.querySelectorAll('iframe.html2canvas-container').forEach((f) => {
                                try { f.remove(); } catch (_) { }
                            });
                        }
                    } catch (sqError) {
                        console.error('Error sending expense WA voucher', sqError);
                    } finally {
                        // تحرير القفل وإعادة تفعيل الزر بعد انتهاء عملية الواتساب بالكامل
                        setTimeout(() => {
                            _expenseWaSending = false;
                            if (submitBtn) {
                                submitBtn.disabled = false;
                                submitBtn.innerHTML = '<i class="ph ph-check-circle"></i> اعتماد سند الصرف وحفظه';
                            }
                        }, 1000);
                    }
                }, 400);

            } catch (error) {
                console.error('Error saving expense:', error);
                alert('حدث خطأ أثناء حفظ سند الصرف');
                // في حالة الخطأ في الحفظ، نحرر القفل فوراً
                _expenseWaSending = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="ph ph-check-circle"></i> اعتماد سند الصرف وحفظه';
                }
            }
        };
        if (expenseForm) {
            expenseForm.__expenseSubmitHandler = expenseSubmitHandler;
            expenseForm.addEventListener('submit', expenseSubmitHandler);
        }

        document.getElementById('search-exp')?.addEventListener('input', renderExp);
        document.getElementById('exp-period-filter')?.addEventListener('change', renderExp);
        document.getElementById('exp-date-from')?.addEventListener('change', renderExp);
        document.getElementById('exp-date-to')?.addEventListener('change', renderExp);
        renderExp();

        // ═══════════════════════════════════════════════════
        // 📥 DOWNLOAD EXPENSE IMAGE - تحميل صورة السند
        // ═══════════════════════════════════════════════════
        async function downloadExpenseVoucherImage(rec, source = 'expense') {
            try {
                const sysRaw = localStorage.getItem('restaurant_settings');
                const sysSet = sysRaw ? JSON.parse(sysRaw) : {};
                const todayStr = rec.date || new Date().toISOString().split('T')[0];
                const displayDate = String(todayStr).replace(/-/g, '/');

                let voucherEl, container;

                if (source === 'hr') {
                    voucherEl = document.getElementById('hr-voucher-template');
                    container = document.getElementById('hr-voucher-container');
                    
                    const d = rec.timestamp ? new Date(rec.timestamp) : new Date();
                    const displayDateHR = d.toISOString().split('T')[0].replace(/-/g, '/');
                    
                    if(document.getElementById('hr-v-date')) document.getElementById('hr-v-date').innerText = displayDateHR;
                    if(document.getElementById('hr-v-bottom-date')) document.getElementById('hr-v-bottom-date').innerText = displayDateHR;
                    if(document.getElementById('hr-v-number')) document.getElementById('hr-v-number').innerText = rec.voucherNo || ('HR-' + (rec.timestamp || ''));
                    if(document.getElementById('hr-v-name')) document.getElementById('hr-v-name').innerText = rec.employee || '';
                    
                    const amtFmt = Number(rec.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    if(document.getElementById('hr-v-amt')) document.getElementById('hr-v-amt').innerText = amtFmt;
                    if(document.getElementById('hr-v-amt-text')) document.getElementById('hr-v-amt-text').innerText = amtFmt;
                    if(document.getElementById('hr-v-reason-text')) document.getElementById('hr-v-reason-text').innerText = rec.reason || '';
                    if(document.getElementById('hr-v-notes')) document.getElementById('hr-v-notes').innerText = rec.reason || '';
                    
                    const typeStr = String(rec.type || '');
                    const docTitle = document.getElementById('hr-v-doc-title');
                    if (docTitle) {
                        if (typeStr.includes('راتب')) docTitle.textContent = 'سند راتب';
                        else if (typeStr.includes('مستحقات')) docTitle.textContent = 'سند صرف مستحقات';
                        else if (typeStr.includes('خصم') || typeStr.includes('جزاء')) docTitle.textContent = 'سند خصم / جزاء';
                        else if (typeStr.includes('سلفة') || typeStr.includes('عليه')) docTitle.textContent = 'سند سلفة';
                        else if (typeStr.includes('مكافأة') || typeStr.includes('له')) docTitle.textContent = 'سند مكافأة';
                        else docTitle.textContent = 'سند صرف';
                    }

                    const labelRecipient = document.getElementById('hr-v-label-recipient');
                    const labelAmount = document.getElementById('hr-v-label-amount');
                    const labelBalance = document.getElementById('hr-v-label-balance');
                    
                    if (typeStr.includes('خصم') || typeStr.includes('جزاء')) {
                        if (labelRecipient) labelRecipient.textContent = 'يُخصم من الأخ :';
                        if (labelAmount) labelAmount.textContent = 'مبلغ وقدره :';
                        if (labelBalance) labelBalance.textContent = 'صافي الرصيد :';
                    } else if (typeStr.includes('سلفة') || typeStr.includes('عليه')) {
                        if (labelRecipient) labelRecipient.textContent = 'تم صرف للأخ :';
                        if (labelAmount) labelAmount.textContent = 'سلفة بقيمة :';
                        if (labelBalance) labelBalance.textContent = 'الرصيد المتبقي :';
                    } else if (typeStr.includes('مكافأة') || typeStr.includes('له')) {
                        if (labelRecipient) labelRecipient.textContent = 'يُصرف للأخ :';
                        if (labelAmount) labelAmount.textContent = 'مكافأة بقيمة :';
                        if (labelBalance) labelBalance.textContent = 'الرصيد لكم :';
                    } else if (typeStr.includes('راتب')) {
                        if (labelRecipient) labelRecipient.textContent = 'راتب الأخ :';
                        if (labelAmount) labelAmount.textContent = 'مبلغ وقدره :';
                        if (labelBalance) labelBalance.textContent = 'صافي الراتب :';
                    } else {
                        if (labelRecipient) labelRecipient.textContent = 'تم صرف للأخ :';
                        if (labelAmount) labelAmount.textContent = 'مبلغ وقدره :';
                        if (labelBalance) labelBalance.textContent = 'الرصيد لكم :';
                    }

                    // Balance calculation logic for UI
                    let empBal = 0;
                    if (typeof db !== 'undefined' && db.employees && rec.employee) {
                        const emp = db.employees.find(e => e.name === rec.employee);
                        const salary = Number(emp?.salary) || 0;
                        const loans = Number(emp?.loans) || 0;
                        empBal = Math.max(0, salary - loans);
                    }
                    const netFmt = empBal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    if(document.getElementById('hr-v-balance-text')) document.getElementById('hr-v-balance-text').innerText = netFmt;

                    if(document.getElementById('hr-v-rest-name') && sysSet.name) document.getElementById('hr-v-rest-name').innerText = sysSet.name;
                    if(document.getElementById('hr-v-branch') && sysSet.branch) document.getElementById('hr-v-branch').innerText = sysSet.branch;
                    if(document.getElementById('hr-v-phone') && sysSet.phone) document.getElementById('hr-v-phone').innerText = sysSet.phone;
                    const logoEl = document.getElementById('hr-v-logo');
                    if(logoEl && sysSet.logo && sysSet.logo !== '2222.png') logoEl.src = sysSet.logo;

                } else {
                    voucherEl = document.getElementById('exp-voucher-template');
                    container = document.getElementById('exp-voucher-container');

                    if(document.getElementById('ev-date')) document.getElementById('ev-date').innerText = displayDate;
                    if(document.getElementById('ev-foot-date')) document.getElementById('ev-foot-date').innerText = displayDate;
                    if(document.getElementById('ev-number')) document.getElementById('ev-number').innerText = rec.id;
                    if(document.getElementById('ev-cat')) document.getElementById('ev-cat').innerText = rec.cat;
                    if(document.getElementById('ev-amt')) document.getElementById('ev-amt').innerText = window.xf ? window.xf(rec.amount) : rec.amount;
                    if(document.getElementById('ev-amt-balance')) document.getElementById('ev-amt-balance').innerText = window.xf ? window.xf(rec.amount) : rec.amount;
                    if(document.getElementById('ev-desc')) document.getElementById('ev-desc').innerText = rec.desc;
                    if(document.getElementById('ev-pay')) document.getElementById('ev-pay').innerText = rec.pMethod === 'cash' ? 'كاش' : 'حوالة بنكية';
                    if(document.getElementById('ev-notes')) document.getElementById('ev-notes').innerText = rec.desc || 'سند مصروف معتمد من النظام';
                    
                    if(document.getElementById('ev-rest-name') && sysSet.name) document.getElementById('ev-rest-name').innerText = sysSet.name;
                    if(document.getElementById('ev-branch') && sysSet.branch) document.getElementById('ev-branch').innerText = sysSet.branch;
                    if(document.getElementById('ev-phone') && sysSet.phone) document.getElementById('ev-phone').innerText = sysSet.phone;
                    const logoEl = document.getElementById('ev-logo');
                    if(logoEl && sysSet.logo && sysSet.logo !== '2222.png') logoEl.src = sysSet.logo;
                }
                if (!voucherEl || !container) {
                    alert('قالب السند غير موجود!');
                    return;
                }

                container.style.position = 'fixed';
                container.style.top = '-9999px';
                container.style.left = '0';
                container.style.width = '840px';
                voucherEl.style.width = '800px';
                await new Promise(r => setTimeout(r, 150));

                const canvas = await html2canvas(voucherEl, { scale:voucherCaptureScale, useCORS:true, backgroundColor:'#fff', width:800, windowWidth:1200, logging:false });

                const fc = document.createElement('canvas'); 
                fc.width = 1600; 
                fc.height = 1132;
                const ctx2 = fc.getContext('2d');
                ctx2.fillStyle = '#fff'; 
                ctx2.fillRect(0,0,1600,1132);
                ctx2.drawImage(canvas, 0, 0, 1600, 1132);
                
                const imgData = fc.toDataURL('image/jpeg', 0.95);
                
                const link = document.createElement('a');
                const safeId = source === 'hr' ? (rec.id || ('HR-' + (rec.timestamp || ''))) : rec.id;
                link.download = `سند_صرف_${safeId}.jpg`;
                link.href = imgData;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
            } catch (err) {
                console.error('Error downloading voucher image', err);
                alert('حدث خطأ أثناء تحميل صورة السند.');
            } finally {
                const expContainer = document.getElementById('exp-voucher-container');
                const expVoucherEl = document.getElementById('exp-voucher-template');
                const hrContainer = document.getElementById('hr-voucher-container');
                const hrVoucherEl = document.getElementById('hr-voucher-template');
                
                [expContainer, hrContainer].forEach(c => {
                    if (c) {
                        c.style.position = 'absolute';
                        c.style.top = '-9999px';
                        c.style.left = '-9999px';
                        c.style.width = '';
                    }
                });
                
                [expVoucherEl, hrVoucherEl].forEach(v => {
                    if (v) v.style.width = '';
                });
                
                document.querySelectorAll('iframe.html2canvas-container').forEach((f) => {
                    try { f.remove(); } catch (_) { }
                });
            }
        }

        // ═══════════════════════════════════════════════════
        // ❌ DELETE EXPENSE - حذف سند المصروف
        // ═══════════════════════════════════════════════════
        async function deleteExpense(expRec) {
            const confirmed = confirm(
                `⚠️ تأكيد الحذف\n\nهل أنت متأكد من حذف سند الصرف؟\n\nرقم السند: ${expRec.id}\nالتصنيف: ${expRec.cat}\nالبيان: ${expRec.desc}\nالمبلغ: ${xf(expRec.amount)}\n\n✅ سيتم حذف السند وعكس تأثيره على الرصيد فوراً.\n\nهل تريد المتابعة؟`
            );
            if (!confirmed) return;

            try {
                const dbNow = await window.dbRead();
                if (!dbNow.expenses) dbNow.expenses = [];
                const idx = dbNow.expenses.findIndex(x => x.id === expRec.id);
                if (idx > -1) dbNow.expenses.splice(idx, 1);
                await window.dbWrite(dbNow);
                db.expenses = dbNow.expenses;

                // Update local totals
                totalExp -= (Number(expRec.amount) || 0);
                if (kpiExp) kpiExp.innerText = xf(totalExp);

                // تأجيل إعادة التحميل لمنع الشاشة السوداء
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        renderExp();
                        alert(`✅ تم حذف السند ${expRec.id} بنجاح.\nالمبلغ ${xf(expRec.amount)} تم عكسه من الرصيد.`);
                    });
                });
            } catch (error) {
                console.error('Error deleting expense:', error);
                alert('حدث خطأ أثناء حذف السند');
            }
        }

        function hrAffectsLoans(type) {
            const t = String(type || '');
            return t.includes('سلفة') || t.includes('عليه') || t.includes('خصم / جزاء') || t.includes('جزاء');
        }
        function adjustHrEmployeeLoans(voucher, direction) {
            if (!hrAffectsLoans(voucher?.type)) return;
            const emp = (db.employees || []).find(e => e.name === voucher.employee);
            if (!emp) return;
            emp.loans = Math.max(0, (Number(emp.loans) || 0) + direction * (Number(voucher.amount) || 0));
        }
        async function deleteHrExpense(hrRec, hrIdx) {
            const ok = confirm(`هل أنت متأكد من حذف سند الموظف؟\n\nالموظف: ${hrRec.employee}\nالنوع: ${hrRec.type}\nالمبلغ: ${xf(hrRec.amount)}`);
            if (!ok) return;
            
            try {
                const dbNow = await window.dbRead();
                if (!dbNow.hrExpenses) dbNow.hrExpenses = [];
                if (hrIdx < 0 || hrIdx >= dbNow.hrExpenses.length) return;
                const oldRec = dbNow.hrExpenses[hrIdx];
                adjustHrEmployeeLoans(oldRec, -1);
                dbNow.hrExpenses.splice(hrIdx, 1);
                await window.dbWrite(dbNow);
                db.hrExpenses = dbNow.hrExpenses;
                db.employees = dbNow.employees || db.employees || [];
                
                // تأجيل إعادة التحميل لمنع الشاشة السوداء
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        renderExp();
                        alert('✅ تم حذف سند الموظف بنجاح.');
                    });
                });
            } catch (error) {
                console.error('Error deleting HR expense:', error);
                alert('حدث خطأ أثناء حذف سند الموظف');
            }
        }

        // ═══════════════════════════════════════════════════
        // ✏️ EDIT EXPENSE - تعديل سند المصروف
        // ═══════════════════════════════════════════════════
        let _editingExpense = null;
        let _editingHrIndex = null;

        function openEditExpModal(expRec) {
            _editingExpense = expRec;
            _editingHrIndex = null;
            const editExpModal = document.getElementById('editExpenseModal');
            if (!editExpModal) return;

            document.getElementById('edit-exp-id-label').innerText = expRec.id;
            document.getElementById('edit-exp-category').value = expRec.cat || '';
            document.getElementById('edit-exp-desc').value = expRec.desc || '';
            document.getElementById('edit-exp-amount').value = expRec.amount || '';
            document.getElementById('edit-exp-date').value = expRec.date || '';
            document.getElementById('edit-exp-payment').value = expRec.pMethod || 'cash';

            window.openModalLayer(editExpModal);
        }
        function openEditHrModal(hrRec, hrIdx) {
            _editingExpense = null;
            _editingHrIndex = hrIdx;
            const editExpModal = document.getElementById('editExpenseModal');
            if (!editExpModal) return;
            document.getElementById('edit-exp-id-label').innerText = hrRec.id || `HR-${hrIdx + 1}`;
            document.getElementById('edit-exp-category').value = hrRec.type || '';
            document.getElementById('edit-exp-desc').value = hrRec.reason || '';
            document.getElementById('edit-exp-amount').value = hrRec.amount || '';
            document.getElementById('edit-exp-date').value = hrRec.date || '';
            document.getElementById('edit-exp-payment').value = hrRec.pMethod || 'cash';
            window.openModalLayer(editExpModal);
        }

        // Close edit expense modal
        document.querySelectorAll('.btn-close-edit-exp-modal').forEach(b => b.addEventListener('click', () => {
            const m = document.getElementById('editExpenseModal');
            if (m) window.closeModalLayer(m);
            _editingExpense = null;
            _editingHrIndex = null;
        }));

        const editExpenseForm = document.getElementById('form-edit-expense');
        if (editExpenseForm && editExpenseForm.__expenseEditSubmitHandler) {
            editExpenseForm.removeEventListener('submit', editExpenseForm.__expenseEditSubmitHandler);
        }
        let _expenseEditWaSending = false;
        // Save edited expense
        const expenseEditSubmitHandler = async (ev) => {
            ev.preventDefault();
            if (!_editingExpense && _editingHrIndex === null) return;
            if (_expenseEditWaSending) return;
            
            // منع الإرسال المزدوج
            const submitBtn = ev.target.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> جاري الحفظ...';
            }
            _expenseEditWaSending = true;

            try {
                const newCat = document.getElementById('edit-exp-category').value.trim();
                const newDesc = document.getElementById('edit-exp-desc').value.trim();
                const newAmount = Number(document.getElementById('edit-exp-amount').value);
                const newDate = document.getElementById('edit-exp-date').value;
                const newPMethod = document.getElementById('edit-exp-payment').value;

                if (!newCat || !newDesc || newAmount <= 0 || !newDate) {
                    alert('يرجى ملء جميع الحقول بشكل صحيح!');
                    return;
                }

                const dbNow = await window.dbRead();
                if (!dbNow.expenses) dbNow.expenses = [];
                if (!dbNow.hrExpenses) dbNow.hrExpenses = [];

                let editedExpenseForWa = null;
                if (_editingExpense) {
                    const recInDb = dbNow.expenses.find(x => x.id === _editingExpense.id);
                    if (!recInDb) { alert('لم يُعثر على السند في قاعدة البيانات!'); return; }
                    const oldAmount = Number(recInDb.amount) || 0;
                    totalExp = totalExp - oldAmount + newAmount;
                    if (kpiExp) kpiExp.innerText = xf(totalExp);
                    recInDb.cat = newCat;
                    recInDb.desc = newDesc;
                    recInDb.amount = newAmount;
                    recInDb.date = newDate;
                    recInDb.pMethod = newPMethod;
                    recInDb.lastModified = new Date().toISOString();
                    editedExpenseForWa = {
                        id: recInDb.id,
                        cat: recInDb.cat,
                        desc: recInDb.desc,
                        amount: recInDb.amount,
                        date: recInDb.date,
                        pMethod: recInDb.pMethod
                    };
                } else {
                    const hrRec = dbNow.hrExpenses[_editingHrIndex];
                    if (!hrRec) { alert('لم يُعثر على سند الموظف!'); return; }
                    const oldHr = { ...hrRec };
                    adjustHrEmployeeLoans(oldHr, -1);
                    hrRec.type = newCat;
                    hrRec.reason = newDesc;
                    hrRec.amount = newAmount;
                    hrRec.date = newDate;
                    hrRec.pMethod = newPMethod;
                    hrRec.lastModified = new Date().toISOString();
                    adjustHrEmployeeLoans(hrRec, 1);
                }

                await window.dbWrite(dbNow);
                db.expenses = dbNow.expenses;
                db.hrExpenses = dbNow.hrExpenses;
                db.employees = dbNow.employees || db.employees || [];

                if (editedExpenseForWa) {
                    setTimeout(async () => {
                        try {
                            const waRaw = localStorage.getItem('wa_settings');
                            if (!waRaw) return;
                            const waSettings = JSON.parse(waRaw);
                            if (!waSettings.expenses || !waSettings.admin) return;
                            const adminPhone = String(waSettings.admin);

                            const sysRaw = localStorage.getItem('restaurant_settings');
                            const sysSet = sysRaw ? JSON.parse(sysRaw) : {};
                            const todayStr = editedExpenseForWa.date || new Date().toISOString().split('T')[0];
                            const displayDate = String(todayStr).replace(/-/g, '/');

                            if(document.getElementById('ev-date')) document.getElementById('ev-date').innerText = displayDate;
                            if(document.getElementById('ev-foot-date')) document.getElementById('ev-foot-date').innerText = displayDate;
                            if(document.getElementById('ev-number')) document.getElementById('ev-number').innerText = editedExpenseForWa.id;
                            if(document.getElementById('ev-cat')) document.getElementById('ev-cat').innerText = editedExpenseForWa.cat;
                            if(document.getElementById('ev-amt')) document.getElementById('ev-amt').innerText = xf(editedExpenseForWa.amount);
                            if(document.getElementById('ev-amt-balance')) document.getElementById('ev-amt-balance').innerText = xf(editedExpenseForWa.amount);
                            if(document.getElementById('ev-desc')) document.getElementById('ev-desc').innerText = editedExpenseForWa.desc;
                            if(document.getElementById('ev-pay')) document.getElementById('ev-pay').innerText = editedExpenseForWa.pMethod === 'cash' ? 'كاش' : 'حوالة بنكية';
                            if(document.getElementById('ev-notes')) document.getElementById('ev-notes').innerText = editedExpenseForWa.desc || 'سند مصروف معتمد من النظام';
                            if(document.getElementById('ev-rest-name')) document.getElementById('ev-rest-name').innerText = sysSet.name || '';
                            if(document.getElementById('ev-branch')) document.getElementById('ev-branch').innerText = sysSet.branch || '';
                            if(document.getElementById('ev-phone')) document.getElementById('ev-phone').innerText = sysSet.phone || '';
                            const logoEl = document.getElementById('ev-logo');
                            if(logoEl && sysSet.logo && sysSet.logo !== '2222.png') logoEl.src = sysSet.logo;

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

                                const canvas = await html2canvas(voucherEl, { scale:voucherCaptureScale, useCORS:true, backgroundColor:'#fff', width:800, windowWidth:1200, logging:false });

                                const fc = document.createElement('canvas'); fc.width=1600; fc.height=1132;
                                const ctx2 = fc.getContext('2d');
                                ctx2.fillStyle='#fff'; ctx2.fillRect(0,0,1600,1132);
                                ctx2.drawImage(canvas, 0, 0, 1600, 1132);
                                const imgData = fc.toDataURL('image/jpeg', 0.95);

                                const captionMsg = [
                                    `📌 إشعار إداري — تم تعديل سند مصروف`,
                                    `───────────────────`,
                                    `رقم السند: ${editedExpenseForWa.id}`,
                                    ``,
                                    `📂 التصنيف: ${editedExpenseForWa.cat}`,
                                    `💰 المبلغ: ${xf(editedExpenseForWa.amount)}`,
                                    `🗒 البيان: ${editedExpenseForWa.desc}`,
                                ].join('\n');
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
                                    wa_mode: localStorage.getItem('wa_mode') || 'browser'
                                });
                                console.log('Sent edited expense voucher image to admin:', adminPhone);
                            } finally {
                                container.style.position = 'absolute';
                                container.style.top = '-9999px';
                                container.style.left = '-9999px';
                                container.style.width = '';
                                voucherEl.style.width = '';
                                document.querySelectorAll('iframe.html2canvas-container').forEach((f) => {
                                    try { f.remove(); } catch (_) { }
                                });
                            }
                        } catch (waEditError) {
                            console.error('Error sending edited expense WA voucher', waEditError);
                        }
                    }, 400);
                }

                // Close modal
                const m = document.getElementById('editExpenseModal');
                if (m) window.closeModalLayer(m);
                _editingExpense = null;
                _editingHrIndex = null;

                // تأجيل إعادة التحميل لمنع الشاشة السوداء
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        renderExp();
                        const recId = _editingExpense ? _editingExpense.id : ('HR-' + _editingHrIndex);
                        alert(`✅ تم تعديل السند بنجاح وتحديث جميع البيانات المرتبطة.`);
                    });
                });
            } catch (error) {
                console.error('Error editing expense:', error);
                alert('حدث خطأ أثناء تعديل السند');
            } finally {
                // إعادة تفعيل الزر
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="ph ph-check-circle"></i> حفظ التعديلات';
                }
                _expenseEditWaSending = false;
            }
        };
        if (editExpenseForm) {
            editExpenseForm.__expenseEditSubmitHandler = expenseEditSubmitHandler;
            editExpenseForm.addEventListener('submit', expenseEditSubmitHandler);
        }
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
        document.getElementById('pl-net-profit').innerText = xf(netProfit);

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
            document.getElementById('bs-cash').innerText = xf(cashBal);
            document.getElementById('bs-bank').innerText = xf(bankBal);
            document.getElementById('bs-total-assets').innerText = xf(cashBal + bankBal);
            document.getElementById('bs-retained-earnings').innerText = xf(netProfit);
            document.getElementById('bs-total-liabilities').innerText = xf(cashBal + bankBal);
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
