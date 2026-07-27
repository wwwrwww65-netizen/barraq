(function () {
    document.addEventListener('DOMContentLoaded', async () => {

        let accChart = null;
        let currentAccPeriod = 'today';

        async function loadAccountingData(period = 'this_month') {
            const xf = (n) =>
                window.MisterCasherCurrency
                    ? MisterCasherCurrency.format(n)
                    : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ر.س';
            const bankTrxBodyInit = document.getElementById('bank-trx-body');
            if (bankTrxBodyInit) {
                bankTrxBodyInit.innerHTML = Array(6).fill(`
                <tr class="skeleton-row">
                    <td><div class="skeleton-line short"></div></td>
                    <td><div class="skeleton-line medium"></div></td>
                    <td><div class="skeleton-line medium"></div></td>
                    <td><div class="skeleton-line full"></div></td>
                </tr>
            `).join('');
            }

            const expTbodyInit = document.getElementById('exp-tbody');
            if (expTbodyInit) {
                expTbodyInit.innerHTML = Array(6).fill(`
                <tr class="skeleton-row">
                    <td><div class="skeleton-line short"></div></td>
                    <td><div class="skeleton-line short"></div></td>
                    <td><div class="skeleton-line medium"></div></td>
                    <td><div class="skeleton-line full"></div></td>
                    <td><div class="skeleton-line medium"></div></td>
                    <td><div class="skeleton-line medium"></div></td>
                    <td><div class="skeleton-line short"></div></td>
                    <td><div class="skeleton-line medium"></div></td>
                    <td><div class="skeleton-line short"></div></td>
                </tr>
            `).join('');
            }

            // افتراضياً لصفحات المحاسبة والتقارير عند الفتح، نحن بحاجة فقط لطلبات "اليوم" أو الأيام الأخيرة
            // جلب orders (الأحدث فقط) بدلاً من orders_all (كل التاريخ) يمنع تجميد الشاشة تماماً.
            const db = await window.dbReadSlice(['orders', 'purchases', 'expenses', 'bankTransfers', 'returns', 'hrExpenses', 'otherIncome']);
            let posOrders = db.orders || [];
            let erpPurchases = db.purchases || [];
            let erpExpenses = db.expenses || [];
            let bankTransfers = db.bankTransfers || [];
            let returnsRows = db.returns || [];
            let hrExpenses = db.hrExpenses || [];
            let otherIncomeRows = db.otherIncome || [];

            if (window.isDateInPeriod) {
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
                if (window.PaymentSplit) return window.PaymentSplit.hrAffectsLiquidity(h);
                const t = String(h.type || '');
                if (t.includes('سلفة')) return true;
                return !t.includes('خصم / جزاء') && !t.includes('جزاء');
            }

            const allOrdersForReturns = db.orders || [];
            let totalReturns = 0;
            let totalReturnsAll = 0;
            returnsRows.forEach((r) => {
                const amt = Number(r.amount) || 0;
                totalReturnsAll += amt;
                if (window.PaymentSplit && !window.PaymentSplit.returnAffectsLiquidity(r, allOrdersForReturns)) return;
                totalReturns += amt;
            });
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
                posOrders.filter((o) => o.status !== 'returned'),
                (o) => new Date(o.timestamp || o.date || Date.now()),
                (o) => o.total,
            );
            const ordersForRetChart = db.orders || [];
            const retByDay = sumByWeekday(
                returnsRows.filter(
                    (r) => !window.PaymentSplit || window.PaymentSplit.returnAffectsLiquidity(r, ordersForRetChart),
                ),
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

            // 2. ✅ Financial Aggregation Engine — منطق موحّد (payment-split.js)
            const activeOrders = posOrders.filter((o) => o.status !== 'returned');
            let totalRev = 0;
            let cashRev = 0;
            let bankRev = 0;
            if (window.PaymentSplit) {
                const agg = window.PaymentSplit.aggregateOrderRevenue(activeOrders);
                totalRev = agg.total;
                cashRev = agg.cash;
                bankRev = agg.bank;
            } else {
                activeOrders.forEach((o) => {
                    const t = Number(o.total) || 0;
                    totalRev += t;
                    const pm = o.paymentMethod || '';
                    if (pm === 'cash' || pm === 'كاش') cashRev += t;
                    else if (['card', 'bank', 'شبكة / بطاقة', 'شبكة'].includes(pm)) bankRev += t;
                    else if (pm === 'مجزأ') {
                        cashRev += Number(o.splitCash) || 0;
                        bankRev += Number(o.splitNetwork) || 0;
                    } else bankRev += t;
                });
            }
            otherIncomeRows.forEach((row) => {
                const a = Number(row.amount) || 0;
                if (row.pMethod === 'bank') bankRev += a;
                else cashRev += a;
            });
            /* totalRev يستبعد الطلبات المرتجعة — لا نخصم المرتجعات مرتين */
            const totalRevNet = totalRev + totalOtherIncome;

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
                else bankExp += a; // 'bank' or 'card' goes to bank
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
                if (window.PaymentSplit) return window.PaymentSplit.returnRefundCashBank(r);
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
                if (window.PaymentSplit && !window.PaymentSplit.returnAffectsLiquidity(r, allOrdersForReturns)) return;
                const x = returnRefundCashBank(r);
                cashRetOut += x.c;
                bankRetOut += x.b;
            });

            // Manual Transfers
            let manualCashIn = 0, manualCashOut = 0, manualBankIn = 0, manualBankOut = 0;
            bankTransfers.forEach(t => {
                if (t.type === 'deposit_cash') manualCashIn += t.amount;
                if (t.type === 'deposit_bank') manualBankIn += t.amount;
                if (t.type === 'transfer_to_bank') { manualCashOut += t.amount; manualBankIn += t.amount; }
                if (t.type === 'transfer_to_cash') { manualBankOut += t.amount; manualCashIn += t.amount; }
            });

            const netProfit = totalRevNet - totalPur - totalExp;
            const cashBal = cashRev - cashPur - cashExp - cashRetOut + manualCashIn - manualCashOut;
            const bankBal = bankRev - bankPur - bankExp - bankRetOut + manualBankIn - manualBankOut;

            // Render Bank Transactions Table
            const bankTrxBody = document.getElementById('bank-trx-body');
            if (bankTrxBody) {
                if (bankTransfers.length === 0) {
                    bankTrxBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;">لا توجد حركات تحويل أو إيداع يدوية حتى الآن.</td></tr>';
                } else {
                    let html = '';
                    [...bankTransfers].reverse().forEach(t => {
                        let dStr = new Date(t.date).toLocaleString('ar-u-nu-latn');
                        let typeStr = '', colorAttr = '';
                        if (t.type === 'deposit_cash') { typeStr = 'إيداع للخزينة (كاش)'; colorAttr = 'var(--accent-green)'; }
                        if (t.type === 'deposit_bank') { typeStr = 'إيداع للبنك'; colorAttr = 'var(--accent-blue)'; }
                        if (t.type === 'transfer_to_bank') { typeStr = 'تحويل من الخزينة للبنك'; colorAttr = 'var(--accent-orange)'; }
                        if (t.type === 'transfer_to_cash') { typeStr = 'تحويل من البنك للخزينة'; colorAttr = 'var(--accent-orange)'; }
                        html += `
                    <tr>
                        <td dir="ltr" style="text-align:right">${dStr}</td>
                        <td style="color:${colorAttr}; font-weight:700;">${typeStr}</td>
                        <td style="color:white; font-weight:800; font-size:16px;">${t.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td>${t.desc}</td>
                    </tr>`;
                    });
                    bankTrxBody.innerHTML = html;
                }
            }

            // ----- A. accounting.html Dashboard -----
            if (document.getElementById('kpi-revenue')) {
                const fmt = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

                if (document.getElementById('bal-total')) document.getElementById('bal-total').innerText = xf(cashBal + bankBal);
                if (document.getElementById('bal-cash')) document.getElementById('bal-cash').innerText = xf(cashBal);
                if (document.getElementById('bal-bank')) document.getElementById('bal-bank').innerText = xf(bankBal);

                const today = new Date().toLocaleDateString('ar-u-nu-latn', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                if (document.getElementById('current-date')) document.getElementById('current-date').innerText = today;

                const ctx = document.getElementById('financeChart');
                if (ctx) {
                    const isL = document.body.classList.contains('light-theme') || document.documentElement.getAttribute('data-theme') === 'light';
                    const tickColor = isL ? '#64748b' : '#94a3b8';
                    const textColor = isL ? '#1e293b' : '#fff';

                    if (accChart) accChart.destroy();
                    accChart = new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'],
                            datasets: [
                                { label: 'الإيراد بعد المرتجعات (حسب يوم الأسبوع)', data: revByDay, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.4 },
                                { label: 'توريد + مصروفات + سندات موظفين', data: outByDay, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', fill: true, tension: 0.4 }
                            ]
                        },
                        options: { responsive: true, color: textColor, scales: { x: { ticks: { color: tickColor } }, y: { ticks: { color: tickColor } } } }
                    });
                }

                const rentries = document.getElementById('recent-entries');
                if (rentries) {
                    let combined = [
                        ...posOrders.map(o => ({ date: new Date(o.timestamp || o.date || Date.now()), id: o.orderId, desc: 'مبيعات الكاشير', amt: o.total, type: 'in', acc: 'صندوق الإيرادات' })),
                        ...returnsRows.map((r) => ({
                            date: new Date(r.timestamp || r.date || Date.now()),
                            id: r.id || r.returnId || 'RET',
                            desc: r.reason ? `مرتجع: ${r.reason}` : 'مرتجع مبيعات',
                            amt: Number(r.amount) || 0,
                            type: 'out',
                            acc: 'مرتجعات',
                        })),
                        ...erpPurchases.map(p => ({ date: new Date(p.date || Date.now()), id: p.id, desc: 'شراء فاتورة مورد: ' + (p.supName || 'عام'), amt: p.total, type: 'out', acc: 'المشتريات' })),
                        ...erpExpenses.map(e => ({ date: new Date(e.date || Date.now()), id: e.id, desc: e.desc, amt: e.amount, type: 'out', acc: e.cat })),
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
                    combined.forEach(c => { if (isNaN(c.date.getTime())) c.date = new Date(); });

                    combined.sort((a, b) => b.date - a.date);
                    rentries.innerHTML = ''; // Clear loader

                    if (combined.length === 0) {
                        rentries.innerHTML = '<div style="text-align:center; padding:20px; color:gray;">لا توجد حركات مسجلة</div>';
                    }

                    combined.slice(0, 7).forEach(c => {
                        let dStr = "تاريخ غير متوفر";
                        try { dStr = c.date.toISOString().split('T')[0]; } catch (e) { }

                        const isOut = c.type === 'out';
                        rentries.innerHTML += `
                    <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border-color); padding:12px 16px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                        <div style="display:flex; gap:16px; align-items:center;">
                            <div style="width:40px; height:40px; border-radius:8px; background:${isOut ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)'}; color:${isOut ? 'var(--accent-red)' : 'var(--accent-green)'}; display:flex; align-items:center; justify-content:center; font-size:20px;">
                                <i class="ph-bold ${isOut ? 'ph-arrow-up-right' : 'ph-arrow-down-left'}"></i>
                            </div>
                            <div>
                                <div style="font-weight:700; color:white;">${c.desc}</div>
                                <div style="font-size:12px; color:var(--text-muted);">${dStr} • مرجع: ${c.id || '-'}</div>
                            </div>
                        </div>
                        <div style="text-align:left;">
                            <div style="font-weight:800; color:${isOut ? 'var(--text)' : 'var(--accent-green)'};">${isOut ? '- ' : '+ '}${xf(c.amt)}</div>
                            <div style="font-size:11px; color:var(--text-muted); background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; display:inline-block; margin-top:4px;">${c.acc}</div>
                        </div>
                    </div>`;
                    });
                }
            }

            // ----- B. acc-expenses.html Expenses Management -----
            if (document.getElementById('exp-tbody')) {
                const fmt2 = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
                if (kpiExp) kpiExp.innerText = xf(totalExp);

                // ─────────────────────────────────────────────────────
                // ✅ حسابات ثقيلة: تُحسب مرة واحدة فقط عند تحميل الصفحة
                // ─────────────────────────────────────────────────────
                const lastZTimeNum = parseInt(localStorage.getItem('last_z_report_time')) || 0;
                const shiftFloat = parseFloat(localStorage.getItem('shift_cash_float')) || 0;

                function calculateBalancesUpTo(dateLimitExclusive = null) {
                    let cash = 0, bank = 0;
                    const limitT = dateLimitExclusive ? dateLimitExclusive.getTime() : null;
                    const isIn = (d) => {
                        if (!d) return false;
                        const t = typeof d === 'number' ? d : new Date(d).getTime();
                        return !limitT || t < limitT;
                    };
                    (db.orders || []).forEach(o => {
                        if (!isIn(o.timestamp || o.dateStr || o.date)) return;
                        if (window.PaymentSplit) {
                            const x = window.PaymentSplit.orderToCashBank(o);
                            cash += x.c; bank += x.b;
                        } else if (o.status !== 'returned') {
                            const t = Number(o.total) || 0, pm = o.paymentMethod || '';
                            if (['cash', 'كاش', 'نقد'].includes(pm)) cash += t;
                            else if (['card', 'bank', 'شبكة / بطاقة', 'شبكة', 'مدى', 'فيزا'].includes(pm)) bank += t;
                            else if (pm === 'مجزأ') { cash += Number(o.splitCash) || 0; bank += Number(o.splitNetwork) || 0; }
                            else bank += t;
                        }
                    });
                    (db.returns || []).forEach(r => {
                        if (!isIn(r.timestamp || r.date)) return;
                        if (window.PaymentSplit && !window.PaymentSplit.returnAffectsLiquidity(r, db.orders || [])) return;
                        const amt = Number(r.amount) || 0, pm = String(r.method || '').trim();
                        if (['cash', 'كاش', 'نقد'].includes(pm)) cash -= amt;
                        else if (pm === 'مجزأ') { cash -= Number(r.splitCash) || 0; bank -= Number(r.splitNetwork) || 0; }
                        else bank -= amt;
                    });
                    (db.purchases || []).forEach(p => {
                        if (!isIn(p.date)) return;
                        if (p.payMethod === 'cash') cash -= Number(p.total) || 0;
                        if (p.payMethod === 'bank') bank -= Number(p.total) || 0;
                    });
                    (db.expenses || []).forEach(e => {
                        if (!isIn(e.date)) return;
                        if (e.pMethod === 'cash') cash -= Number(e.amount) || 0;
                        else bank -= Number(e.amount) || 0; // 'bank' or 'card'
                    });
                    (db.hrExpenses || []).forEach(h => {
                        if (!hrAffectsLiquidity(h) || !isIn(h.timestamp || h.date)) return;
                        if (h.pMethod === 'bank') bank -= Number(h.amount) || 0;
                        else cash -= Number(h.amount) || 0;
                    });
                    (db.otherIncome || []).forEach(row => {
                        if (!isIn(row.timestamp || row.date)) return;
                        if (row.pMethod === 'bank') bank += Number(row.amount) || 0;
                        else cash += Number(row.amount) || 0;
                    });
                    (db.bankTransfers || []).forEach(t => {
                        if (!isIn(t.date)) return;
                        if (t.type === 'deposit_cash') cash += Number(t.amount) || 0;
                        if (t.type === 'deposit_bank') bank += Number(t.amount) || 0;
                        if (t.type === 'transfer_to_bank') { cash -= Number(t.amount) || 0; bank += Number(t.amount) || 0; }
                        if (t.type === 'transfer_to_cash') { bank -= Number(t.amount) || 0; cash += Number(t.amount) || 0; }
                    });
                    return { cash, bank };
                }

                // حساب رصيد الدرج (الوردية الحالية)
                function _splitShiftOrder(o) {
                    if (window.PaymentSplit) return window.PaymentSplit.splitOrderAmounts(o);
                    const pm = String(o.paymentMethod || '').trim(), total = Number(o.total) || 0;
                    if (pm.includes('كاش') || pm === 'cash') return { cash: total, network: 0, hungerStation: 0 };
                    return { cash: 0, network: total, hungerStation: 0 };
                }
                const _todayOrders = (db.orders || []).filter(o =>
                    o.status !== 'returned' &&
                    window.isDateInPeriod(o.timestamp || o.dateStr || o.date, 'today') &&
                    (o.timestamp || o.createdAt || Date.now()) >= lastZTimeNum
                );
                const _todayExpenses = ((db.hrExpenses || []).concat(db.expenses || [])).filter(h =>
                    window.isDateInPeriod(h.timestamp || h.date, 'today') &&
                    (h.timestamp || new Date(h.date).getTime()) >= lastZTimeNum
                );
                let _dCashSales = 0, _dNetworkSales = 0;
                _todayOrders.forEach(o => { const pay = _splitShiftOrder(o); _dCashSales += pay.cash; _dNetworkSales += pay.network; });
                let _dCashExp = 0;
                _todayExpenses.forEach(h => {
                    const a = Number(h.amount) || 0;
                    const isCash = window.PaymentSplit ? window.PaymentSplit.isCashPaymentMethod(h.pMethod) : (h.pMethod !== 'bank' && h.pMethod !== 'network' && h.pMethod !== 'شبكة');
                    if (isCash) _dCashExp += a;
                });
                const _drawerBalanceNow = shiftFloat + _dCashSales - _dCashExp;
                const _networkBalanceNow = _dNetworkSales;
                const _todayStart = new Date(); _todayStart.setHours(0, 0, 0, 0);
                const _balancesCurrent = calculateBalancesUpTo(null);
                const sym = window.MisterCasherCurrency ? MisterCasherCurrency.getConfig().symbol : 'ر.س';

                // ─────────────────────────────────────────────────────
                // ✅ Pre-build mapped arrays once (reused on each filter)
                // ─────────────────────────────────────────────────────
                const normalizeHrTypeLabel = (type) => {
                    const t = String(type || '').trim();
                    if (t === 'عليه (سلفة/خصم)') return 'عليه (سلفة)';
                    return t || 'سند موظف';
                };
                const _baseExpenses = (db.expenses || []).map(e => {
                    const dr = e.timestamp || e.date;
                    return {
                        ...e, _source: 'expense', _textDesc: String(e.desc || '').toLowerCase(), _textCat: String(e.cat || '').toLowerCase(),
                        _displayCat: String(e.cat || 'مصروف عام'), _displayDesc: String(e.desc || '—'),
                        _displayPMethod: String(e.pMethod || 'cash'), _displayId: String(e.id || 'EXP'),
                        _dateRef: dr, _timeRef: typeof dr === 'number' ? dr : (new Date(dr).getTime() || 0)
                    };
                });
                const _hrAsExpenses = (db.hrExpenses || []).map((h, origIdx) => ({ h, origIdx }))
                    .filter(item => hrAffectsLiquidity(item.h))
                    .map(item => {
                        const h = item.h, dr = h.timestamp || h.date;
                        return {
                            ...h, _source: 'hr', _hrIndex: item.origIdx,
                            _textDesc: String(h.reason || h.type || '').toLowerCase(), _textCat: String(h.type || 'سند موظف').toLowerCase(),
                            _displayCat: normalizeHrTypeLabel(h.type),
                            _displayDesc: (h.employee ? `الموظف: ${h.employee} — ` : '') + String(h.reason || 'سند صرف موظف'),
                            _displayPMethod: String(h.pMethod || 'cash'), _displayId: String(h.voucherNo || h.id || ('HR-' + (h.timestamp || ''))),
                            _dateRef: dr, _timeRef: typeof dr === 'number' ? dr : (new Date(dr).getTime() || 0)
                        };
                    });
                const _allExpRows = _baseExpenses.concat(_hrAsExpenses);

                const renderExp = () => {
                    window.mcRenderExp = renderExp; // Expose globally for inline HTML events
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

                    let fDateParsed = null;
                    if (fDate && fDate.includes('-')) { 
                        let p = fDate.split('-');
                        fDateParsed = new Date(p[0], p[1] - 1, p[2], 0, 0, 0, 0).getTime(); 
                    }
                    let tDateParsed = null;
                    if (tDate && tDate.includes('-')) { 
                        let p = tDate.split('-');
                        tDateParsed = new Date(p[0], p[1] - 1, p[2], 23, 59, 59, 999).getTime(); 
                    }

                    const customWrap = document.getElementById('exp-custom-date-wrap');
                    // تصفية سريعة باستخدام البيانات المُحضَّرة مسبقاً
                    let filt = _allExpRows.filter(e => {
                        if (q && !e._textDesc.includes(q) && !e._textCat.includes(q)) return false;
                        if (selPeriod === 'custom') {
                            let edTime = e._timeRef;
                            if (!edTime || isNaN(edTime)) edTime = 0;
                            
                            if (fDateParsed !== null && edTime < fDateParsed) return false;
                            if (tDateParsed !== null && edTime > tDateParsed) return false;
                            return true;
                        }
                        return window.isDateInPeriod(e._dateRef || e.date, selPeriod);
                    });
                    filt.sort((a, b) => (a._timeRef || 0) - (b._timeRef || 0));
                    const sum = filt.reduce((s, e) => s + (Number(e.amount) || 0), 0);
                    const sumStr = fmt2(sum);
                    const wordsLine = sarAmountToArabicWords(sum);

                    const kpiExp = document.getElementById('kpi-total-exp');
                    if (kpiExp) {
                        const qsSym = window.MisterCasherCurrency ? MisterCasherCurrency.getConfig().symbol : 'ر.س';
                        kpiExp.innerHTML = sumStr + ' <span class="js-cur-sym" style="font-size:14px;">' + qsSym + '</span>';
                        const titleEl = kpiExp.parentElement.querySelector('.kpi-title span');
                        if (titleEl && periodSelect && periodSelect.selectedIndex >= 0) {
                            titleEl.innerText = 'إجمالي المصروفات (' + periodSelect.options[periodSelect.selectedIndex].text + ')';
                        }
                    }

                    if (filt.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;">لا توجد مصروفات.</td></tr>';
                    } else {
                        let runningBal = 0;
                        filt.forEach(e => {
                            runningBal += (Number(e.amount) || 0);
                            e._runningBal = runningBal;
                        });
                        const dispFilt = [...filt].reverse();

                        // ✅ بناء HTML كاملاً أولاً ثم إدراجه مرة واحدة — يمنع O(N²) DOM
                        let htmlParts = [];
                        dispFilt.forEach(e => {
                            const m = e._displayPMethod === 'cash'
                                ? '<span class="inv-tag tag-safe" style="background:#0f172a; border:1px solid #334155; color:white;"><i class="ph-fill ph-money"></i> كاش نقدي</span>'
                                : e._displayPMethod === 'card' 
                                    ? '<span class="inv-tag tag-safe" style="background:rgba(245,158,11,0.1); color:var(--accent-orange)"><i class="ph-fill ph-credit-card"></i> شبكة / بطاقة</span>' 
                                    : '<span class="inv-tag tag-safe" style="background:rgba(59,130,246,0.1); color:var(--accent-blue)"><i class="ph-fill ph-bank"></i> حوالة بنكية</span>';
                            const amtStr = fmt2(e.amount);
                            const rbStr = fmt2(e._runningBal);
                            const isCancelled = e.status === 'ملغاة';
                            const isEditable = !isCancelled;
                            const hrIdx = e._source === 'hr' ? e._hrIndex : '';
                            htmlParts.push(`
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
                                    <button class="btn-download-exp" data-id="${e.id || ''}" data-source="${e._source}" data-hr-index="${hrIdx}" title="تحميل صورة السند" style="background:none;border:none;color:var(--accent-blue);font-size:18px;cursor:pointer;"><i class="ph ph-download-simple"></i></button>
                                    ${e._source === 'hr' ? '<span style="font-size:11px;color:var(--text-muted);padding:2px 6px;border:1px solid var(--border-color);border-radius:6px;">سند موظف</span>' : ''}
                                    ${isEditable ? `<button class="btn-edit-exp" data-id="${e.id || ''}" data-source="${e._source}" data-hr-index="${hrIdx}" title="تعديل السند" style="background:#3b82f6;color:#fff;border:none;border-radius:6px;padding:3px 9px;cursor:pointer;font-size:12px;"><i class="ph ph-pencil"></i> تعديل</button>` : ''}
                                    ${isEditable ? `<button class="btn-delete-exp" data-id="${e.id || ''}" data-source="${e._source}" data-hr-index="${hrIdx}" title="حذف السند" style="background:#ef4444;color:#fff;border:none;border-radius:6px;padding:3px 9px;cursor:pointer;font-size:12px;"><i class="ph ph-trash"></i> حذف</button>` : ''}
                                </div>
                            </td>
                        </tr>`);
                        });
                        tbody.innerHTML = htmlParts.join(''); // ✅ إدراج واحد فقط

                        // ✅ Event delegation بدلاً من إضافة listener لكل زر
                        tbody.addEventListener('click', async (ev) => {
                            const btnEdit = ev.target.closest('.btn-edit-exp');
                            const btnDelete = ev.target.closest('.btn-delete-exp');
                            const btnDl = ev.target.closest('.btn-download-exp');

                            if (btnEdit) {
                                const src = btnEdit.dataset.source;
                                if (src === 'hr') {
                                    const hrIdx = Number(btnEdit.dataset.hrIndex);
                                    const hrRec = (db.hrExpenses || [])[hrIdx];
                                    if (hrRec) openEditHrModal(hrRec, hrIdx);
                                } else {
                                    const expRec = (db.expenses || []).find(x => x.id === btnEdit.dataset.id);
                                    if (expRec) openEditExpModal(expRec);
                                }
                            }
                            if (btnDelete) {
                                const src = btnDelete.dataset.source;
                                if (src === 'hr') {
                                    const hrIdx = Number(btnDelete.dataset.hrIndex);
                                    const hrRec = (db.hrExpenses || [])[hrIdx];
                                    if (hrRec) await deleteHrExpense(hrRec, hrIdx);
                                } else {
                                    const expRec = (db.expenses || []).find(x => x.id === btnDelete.dataset.id);
                                    if (expRec) await deleteExpense(expRec);
                                }
                            }
                            if (btnDl) {
                                const src = btnDl.dataset.source;
                                if (src === 'hr') {
                                    const hrIdx = Number(btnDl.dataset.hrIndex);
                                    const hrRec = (db.hrExpenses || [])[hrIdx];
                                    if (hrRec) await downloadExpenseVoucherImage(hrRec, 'hr');
                                } else {
                                    const expRec = (db.expenses || []).find(x => x.id === btnDl.dataset.id);
                                    if (expRec) await downloadExpenseVoucherImage(expRec, 'expense');
                                }
                            }
                        }, { once: false });
                    }


                    if (tfoot) {
                        const drawerBalanceNow = _drawerBalanceNow;
                        const networkBalanceNow = _networkBalanceNow;
                        const balancesCurrent = _balancesCurrent;
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
                    if (window.MC_PERF && typeof window.MC_PERF.getVoucherCaptureScale === 'function') {
                        return window.MC_PERF.getVoucherCaptureScale();
                    }
                    return 1.5;
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
                if (document.getElementById('exp-date')) {
                    const tzDate = new Date();
                    const localYMD = tzDate.getFullYear() + '-' + String(tzDate.getMonth() + 1).padStart(2, '0') + '-' + String(tzDate.getDate()).padStart(2, '0');
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
                        id: 'EXP-' + Math.floor(Math.random() * 9000 + 1000),
                        cat: document.getElementById('exp-category').value,
                        desc: document.getElementById('exp-desc').value,
                        amount: Number(document.getElementById('exp-amount').value),
                        date: document.getElementById('exp-date').value,
                        timestamp: Date.now(),
                        pMethod: document.getElementById('exp-payment').value
                    };

                    try {
                        const dbNow = await window.dbReadSlice(['expenses']);
                        if (!dbNow.expenses) dbNow.expenses = [];

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
                                renderExp(true);
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

                                if (document.getElementById('ev-date')) document.getElementById('ev-date').innerText = displayDate;
                                if (document.getElementById('ev-foot-date')) document.getElementById('ev-foot-date').innerText = displayDate;
                                if (document.getElementById('ev-number')) document.getElementById('ev-number').innerText = newExp.id;
                                if (document.getElementById('ev-cat')) document.getElementById('ev-cat').innerText = newExp.cat;
                                if (document.getElementById('ev-amt')) document.getElementById('ev-amt').innerText = xf(newExp.amount);
                                if (document.getElementById('ev-amt-balance')) document.getElementById('ev-amt-balance').innerText = xf(newExp.amount);
                                if (document.getElementById('ev-desc')) document.getElementById('ev-desc').innerText = newExp.desc;
                                if (document.getElementById('ev-pay')) document.getElementById('ev-pay').innerText = newExp.pMethod === 'cash' ? 'كاش' : 'حوالة بنكية';
                                if (document.getElementById('ev-notes')) document.getElementById('ev-notes').innerText = newExp.desc || 'سند مصروف معتمد من النظام';
                                if (document.getElementById('ev-rest-name')) document.getElementById('ev-rest-name').innerText = sysSet.name || '';
                                if (document.getElementById('ev-branch')) document.getElementById('ev-branch').innerText = sysSet.branch || '';
                                if (document.getElementById('ev-phone')) document.getElementById('ev-phone').innerText = sysSet.phone || '';
                                const logoEl = document.getElementById('ev-logo');
                                if (logoEl && sysSet.logo && sysSet.logo !== '2222.png') logoEl.src = sysSet.logo;

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

                                    const canvas = await html2canvas(voucherEl, { scale: voucherCaptureScale, useCORS: true, backgroundColor: '#fff', width: 800, windowWidth: 1200, logging: false });

                                    const fc = document.createElement('canvas'); fc.width = 1600; fc.height = 1132;
                                    const ctx2 = fc.getContext('2d');
                                    ctx2.fillStyle = '#fff'; ctx2.fillRect(0, 0, 1600, 1132);
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
                document.getElementById('search-exp')?.addEventListener('input', renderExp);
                document.getElementById('exp-period-filter')?.addEventListener('change', (ev) => {
                    let val = ev.target.value;
                    let customWrap = document.getElementById('exp-custom-date-wrap');
                    let overlay = document.getElementById('exp-custom-overlay');
                    let customOpt = document.querySelector('#exp-period-filter option[value="custom"]');

                    if (val === 'custom') {
                        if (customWrap) customWrap.style.display = 'flex';
                        if (overlay) overlay.style.display = 'block';
                    } else {
                        if (customWrap) customWrap.style.display = 'none';
                        if (overlay) overlay.style.display = 'none';
                        if (customOpt) customOpt.textContent = 'تاريخ محدد...';
                        if (typeof renderExp === 'function') renderExp();
                    }
                });

                if (typeof renderExp === 'function') {
                    window.mcRenderExp = renderExp;
                    renderExp();
                }

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

                            if (document.getElementById('hr-v-date')) document.getElementById('hr-v-date').innerText = displayDateHR;
                            if (document.getElementById('hr-v-bottom-date')) document.getElementById('hr-v-bottom-date').innerText = displayDateHR;
                            if (document.getElementById('hr-v-number')) document.getElementById('hr-v-number').innerText = rec.voucherNo || ('HR-' + (rec.timestamp || ''));
                            if (document.getElementById('hr-v-name')) document.getElementById('hr-v-name').innerText = rec.employee || '';

                            const amtFmt = Number(rec.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            if (document.getElementById('hr-v-amt')) document.getElementById('hr-v-amt').innerText = amtFmt;
                            if (document.getElementById('hr-v-amt-text')) document.getElementById('hr-v-amt-text').innerText = amtFmt;
                            if (document.getElementById('hr-v-reason-text')) document.getElementById('hr-v-reason-text').innerText = rec.reason || '';
                            if (document.getElementById('hr-v-notes')) document.getElementById('hr-v-notes').innerText = 'سند معتمد من النظام';

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
                            if (document.getElementById('hr-v-balance-text')) document.getElementById('hr-v-balance-text').innerText = netFmt;

                            if (document.getElementById('hr-v-rest-name') && sysSet.name) document.getElementById('hr-v-rest-name').innerText = sysSet.name;
                            if (document.getElementById('hr-v-branch') && sysSet.branch) document.getElementById('hr-v-branch').innerText = sysSet.branch;
                            if (document.getElementById('hr-v-phone') && sysSet.phone) document.getElementById('hr-v-phone').innerText = sysSet.phone;
                            const logoEl = document.getElementById('hr-v-logo');
                            if (logoEl && sysSet.logo && sysSet.logo !== '2222.png') logoEl.src = sysSet.logo;

                        } else {
                            voucherEl = document.getElementById('exp-voucher-template');
                            container = document.getElementById('exp-voucher-container');

                            if (document.getElementById('ev-date')) document.getElementById('ev-date').innerText = displayDate;
                            if (document.getElementById('ev-foot-date')) document.getElementById('ev-foot-date').innerText = displayDate;
                            if (document.getElementById('ev-number')) document.getElementById('ev-number').innerText = rec.id;
                            if (document.getElementById('ev-cat')) document.getElementById('ev-cat').innerText = rec.cat;
                            if (document.getElementById('ev-amt')) document.getElementById('ev-amt').innerText = window.xf ? window.xf(rec.amount) : rec.amount;
                            if (document.getElementById('ev-amt-balance')) document.getElementById('ev-amt-balance').innerText = window.xf ? window.xf(rec.amount) : rec.amount;
                            if (document.getElementById('ev-desc')) document.getElementById('ev-desc').innerText = rec.desc;
                            if (document.getElementById('ev-pay')) document.getElementById('ev-pay').innerText = rec.pMethod === 'cash' ? 'كاش' : (rec.pMethod === 'card' ? 'بطاقة شبكة / مدى' : 'حوالة بنكية');
                            if (document.getElementById('ev-notes')) document.getElementById('ev-notes').innerText = 'سند مصروف معتمد من النظام';

                            if (document.getElementById('ev-rest-name') && sysSet.name) document.getElementById('ev-rest-name').innerText = sysSet.name;
                            if (document.getElementById('ev-branch') && sysSet.branch) document.getElementById('ev-branch').innerText = sysSet.branch;
                            if (document.getElementById('ev-phone') && sysSet.phone) document.getElementById('ev-phone').innerText = sysSet.phone;
                            const logoEl = document.getElementById('ev-logo');
                            if (logoEl && sysSet.logo && sysSet.logo !== '2222.png') logoEl.src = sysSet.logo;
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

                        const canvas = await html2canvas(voucherEl, { scale: voucherCaptureScale, useCORS: true, backgroundColor: '#fff', width: 800, windowWidth: 1200, logging: false });

                        const imgData = canvas.toDataURL('image/jpeg', 0.95);

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
                        const dbNow = await window.dbReadSlice(['expenses']);
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
                                renderExp(true);
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
                        const dbNow = await window.dbReadSlice(['hrExpenses', 'employees']);
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
                                renderExp(true);
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

                        const dbNow = await window.dbReadSlice(['expenses', 'hrExpenses', 'employees']);
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

                                    if (document.getElementById('ev-date')) document.getElementById('ev-date').innerText = displayDate;
                                    if (document.getElementById('ev-foot-date')) document.getElementById('ev-foot-date').innerText = displayDate;
                                    if (document.getElementById('ev-number')) document.getElementById('ev-number').innerText = editedExpenseForWa.id;
                                    if (document.getElementById('ev-cat')) document.getElementById('ev-cat').innerText = editedExpenseForWa.cat;
                                    if (document.getElementById('ev-amt')) document.getElementById('ev-amt').innerText = xf(editedExpenseForWa.amount);
                                    if (document.getElementById('ev-amt-balance')) document.getElementById('ev-amt-balance').innerText = xf(editedExpenseForWa.amount);
                                    if (document.getElementById('ev-desc')) document.getElementById('ev-desc').innerText = editedExpenseForWa.desc;
                                    if (document.getElementById('ev-pay')) document.getElementById('ev-pay').innerText = editedExpenseForWa.pMethod === 'cash' ? 'كاش' : 'حوالة بنكية';
                                    if (document.getElementById('ev-notes')) document.getElementById('ev-notes').innerText = editedExpenseForWa.desc || 'سند مصروف معتمد من النظام';
                                    if (document.getElementById('ev-rest-name')) document.getElementById('ev-rest-name').innerText = sysSet.name || '';
                                    if (document.getElementById('ev-branch')) document.getElementById('ev-branch').innerText = sysSet.branch || '';
                                    if (document.getElementById('ev-phone')) document.getElementById('ev-phone').innerText = sysSet.phone || '';
                                    const logoEl = document.getElementById('ev-logo');
                                    if (logoEl && sysSet.logo && sysSet.logo !== '2222.png') logoEl.src = sysSet.logo;

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

                                        const canvas = await html2canvas(voucherEl, { scale: voucherCaptureScale, useCORS: true, backgroundColor: '#fff', width: 800, windowWidth: 1200, logging: false });

                                        const fc = document.createElement('canvas'); fc.width = 1600; fc.height = 1132;
                                        const ctx2 = fc.getContext('2d');
                                        ctx2.fillStyle = '#fff'; ctx2.fillRect(0, 0, 1600, 1132);
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
                                renderExp(true);
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
            if (document.getElementById('pl-total-rev')) {
                const fmt3 = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                document.getElementById('pl-rev-sales').innerText = fmt3(totalRev);
                const plRet = document.getElementById('pl-returns-row');
                if (plRet) plRet.innerText = totalReturnsAll > 0 ? `(${fmt3(totalReturnsAll)})` : '0.00';
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
                    const sysRaw = JSON.parse(localStorage.getItem('restaurant_settings') || '{}');
                    if (sysRaw.taxRate !== undefined) dynamicTaxRate = Number(sysRaw.taxRate) / 100;
                } catch (e) { }

                const taxBase = totalRevNet > 0 ? totalRevNet : 0;
                const taxCollected = taxBase - (taxBase / (1 + dynamicTaxRate));
                const extZakatAmount = netProfit > 0 ? (netProfit * 0.025) : 0;
                const netTaxStatement = taxCollected; // Usually minus tax paid on purchases, but keeping simple

                if (document.getElementById('pl-tax-collected')) {
                    document.getElementById('pl-tax-collected').innerText = fmt3(taxCollected);
                    document.getElementById('pl-zakat-est').innerText = fmt3(extZakatAmount);
                    document.getElementById('pl-net-tax').innerText = fmt3(netTaxStatement);
                }

                // General Ledger
                const lTbody = document.getElementById('ledger-tbody');
                if (lTbody) {
                    let combinedLedger = [
                        ...posOrders.map(o => ({ date: new Date(o.timestamp || Date.now()), id: o.orderId, type: 'إيراد', desc: 'مبيعات الكاشير', inAmt: o.total, outAmt: 0 })),
                        ...returnsRows.map((r) => ({
                            date: new Date(r.timestamp || r.date || Date.now()),
                            id: r.id || r.returnId || 'RET',
                            type: 'مرتجع',
                            desc: r.reason || 'مرتجع مبيعات',
                            inAmt: 0,
                            outAmt: Number(r.amount) || 0,
                        })),
                        ...erpPurchases.map(p => ({ date: new Date(p.date), id: p.id, type: 'مشتريات/بضاعة', desc: `فاتورة من ${p.supName}`, inAmt: 0, outAmt: p.total })),
                        ...erpExpenses.map(e => ({ date: new Date(e.date), id: e.id, type: `مصروف - ${e.cat}`, desc: e.desc, inAmt: 0, outAmt: e.amount })),
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
                    combinedLedger.sort((a, b) => b.date - a.date);
                    lTbody.innerHTML = '';
                    combinedLedger.forEach(l => {
                        lTbody.innerHTML += `
                    <tr>
                        <td dir="ltr" style="text-align:right">${l.date.toISOString().split('T')[0]}</td>
                        <td><strong>${l.id || '-'}</strong></td>
                        <td style="color:var(--text-muted)">${l.type}</td>
                        <td>${l.desc}</td>
                        <td style="color:var(--accent-green); font-weight:700;">${l.inAmt > 0 ? l.inAmt.toLocaleString() : '-'}</td>
                        <td style="color:var(--accent-red); font-weight:700;">${l.outAmt > 0 ? l.outAmt.toLocaleString() : '-'}</td>
                    </tr>`;
                    });
                }

                // Balance Sheet
                if (document.getElementById('bs-cash')) {
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
        if (filterBtns.length > 0) {
            filterBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    filterBtns.forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');
                    let txt = e.target.innerText;
                    let p = 'this_month';
                    if (txt.includes('اليوم')) p = 'today';
                    else if (txt.includes('ربع')) p = 'quarter';
                    else if (txt.includes('سنة') || txt.includes('سنوي')) p = 'year';
                    currentAccPeriod = p;
                    loadAccountingData(p);
                });
            });

            let initialPeriod = 'this_month';
            const activeBtn = document.querySelector('.time-filters .filter-btn.active');
            if (activeBtn) {
                let txt = activeBtn.innerText;
                if (txt.includes('اليوم')) initialPeriod = 'today';
                else if (txt.includes('ربع')) initialPeriod = 'quarter';
                else if (txt.includes('سنة')) initialPeriod = 'year';
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

        window.addEventListener('themeChanged', () => {
            // Only update chart colors — do NOT reload all data (expensive)
            if (accChart) {
                const isL = document.body.classList.contains('light-theme') || document.documentElement.getAttribute('data-theme') === 'light';
                const tickColor = isL ? '#64748b' : '#94a3b8';
                accChart.options.scales.x.ticks.color = tickColor;
                accChart.options.scales.y.ticks.color = tickColor;
                accChart.update('none'); // 'none' = no animation, instant
            }
        });

        // Global date UI listeners attached once
        if (!window.mcAccDateUIInit) {
            window.mcAccDateUIInit = true;
            document.body.addEventListener('click', (ev) => {
                const btn = ev.target.closest('#btn-apply-custom-date');
                const overlay = ev.target.closest('#exp-custom-overlay');

                if (btn || overlay) {
                    const wrap = document.getElementById('exp-custom-date-wrap');
                    const ov = document.getElementById('exp-custom-overlay');
                    if (wrap) wrap.style.display = 'none';
                    if (ov) ov.style.display = 'none';

                    const customOpt = document.querySelector('#exp-period-filter option[value="custom"]');
                    if (btn && customOpt) {
                        const from = document.getElementById('exp-date-from')?.value;
                        const to = document.getElementById('exp-date-to')?.value;
                        if (from && to) customOpt.textContent = `من ${from} إلى ${to}`;
                        else if (from) customOpt.textContent = `من ${from} فصاعداً`;
                        else if (to) customOpt.textContent = `حتى ${to}`;
                        else customOpt.textContent = 'تاريخ محدد...';
                    }
                    if (overlay && customOpt) {
                        customOpt.textContent = 'تاريخ محدد...';
                        const sel = document.getElementById('exp-period-filter');
                        if (sel) sel.value = 'today';
                    }

                    if (typeof window.mcRenderExp === 'function') window.mcRenderExp();
                }
            });
        }
    });
})();
