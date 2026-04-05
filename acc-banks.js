/**
 * الخزينة والبنوك — نفس منطق acc.js: طلبات كاملة، مرتجعات، HR، إيرادات أخرى، dbRead/dbWrite
 */
(function () {
    const fmt = (n) =>
        Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const xf = (n) => (window.HashCurrency ? HashCurrency.format(n) : fmt(n) + ' ر.س');
    const curSym = () => (window.HashCurrency ? HashCurrency.getConfig().symbol : 'ر.س');

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/"/g, '&quot;');
    }

    function hrAffectsLiquidity(h) {
        const t = String(h.type || '');
        return !t.includes('خصم') && !t.includes('جزاء');
    }

    function orderToCashBank(o) {
        const t = Number(o.total) || 0;
        const pm = String(o.paymentMethod || '').trim();
        if (pm === 'cash' || pm === 'كاش' || pm === 'نقد') return { c: t, b: 0 };
        if (['card', 'bank', 'شبكة / بطاقة', 'شبكة', 'مدى', 'فيزا'].includes(pm)) return { c: 0, b: t };
        if (pm === 'مجزأ') return { c: Number(o.splitCash) || 0, b: Number(o.splitNetwork) || 0 };
        return { c: 0, b: t };
    }

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

    async function refreshLiquidity() {
        const db = (await window.dbRead()) || {};
        const posOrders = db.orders || [];
        const erpPurchases = db.purchases || [];
        const erpExpenses = db.expenses || [];
        const bankTransfers = db.bankTransfers || [];
        const returnsRows = db.returns || [];
        const hrExps = db.hrExpenses || [];
        const otherIncomeRows = db.otherIncome || [];

        let cashRev = 0;
        let bankRev = 0;
        posOrders.forEach((o) => {
            const x = orderToCashBank(o);
            cashRev += x.c;
            bankRev += x.b;
        });
        otherIncomeRows.forEach((row) => {
            const a = Number(row.amount) || 0;
            if (row.pMethod === 'bank') bankRev += a;
            else cashRev += a;
        });

        let cashPur = 0;
        let bankPur = 0;
        erpPurchases.forEach((p) => {
            const pt = Number(p.total) || 0;
            if (p.payMethod === 'cash') cashPur += pt;
            else if (p.payMethod === 'bank') bankPur += pt;
        });

        let cashExp = 0;
        let bankExp = 0;
        erpExpenses.forEach((e) => {
            const a = Number(e.amount) || 0;
            if (e.pMethod === 'cash') cashExp += a;
            else if (e.pMethod === 'bank') bankExp += a;
        });
        hrExps.forEach((h) => {
            if (!hrAffectsLiquidity(h)) return;
            const a = Number(h.amount) || 0;
            if (h.pMethod === 'bank') bankExp += a;
            else cashExp += a;
        });

        let cashRetOut = 0;
        let bankRetOut = 0;
        returnsRows.forEach((r) => {
            const x = returnRefundCashBank(r);
            cashRetOut += x.c;
            bankRetOut += x.b;
        });

        let manualCashIn = 0;
        let manualCashOut = 0;
        let manualBankIn = 0;
        let manualBankOut = 0;
        bankTransfers.forEach((t) => {
            if (t.type === 'deposit_cash') manualCashIn += t.amount;
            if (t.type === 'deposit_bank') manualBankIn += t.amount;
            if (t.type === 'transfer_to_bank') {
                manualCashOut += t.amount;
                manualBankIn += t.amount;
            }
            if (t.type === 'transfer_to_cash') {
                manualBankOut += t.amount;
                manualCashIn += t.amount;
            }
        });

        const cashBal = cashRev - cashPur - cashExp - cashRetOut + manualCashIn - manualCashOut;
        const bankBal = bankRev - bankPur - bankExp - bankRetOut + manualBankIn - manualBankOut;
        const totalLiq = cashBal + bankBal;

        const cashBox = document.getElementById('cash-balance-box');
        const bankBox = document.getElementById('bank-balance-box');
        const totalBox = document.getElementById('total-liquidity');
        if (cashBox) {
            cashBox.innerHTML = fmt(cashBal) + ' <span style="font-size:18px;">' + curSym() + '</span>';
            cashBox.style.color = cashBal < 0 ? 'var(--accent-red)' : '';
        }
        if (bankBox) {
            bankBox.innerHTML = fmt(bankBal) + ' <span style="font-size:18px;">' + curSym() + '</span>';
            bankBox.style.color = bankBal < 0 ? 'var(--accent-red)' : '';
        }
        if (totalBox) {
            totalBox.innerHTML = fmt(totalLiq) + ' <span style="font-size:14px;">' + curSym() + '</span>';
            totalBox.style.color = totalLiq < 0 ? 'var(--accent-red)' : '';
        }

        const setTxt = (id, v) => {
            const el = document.getElementById(id);
            if (el) el.innerText = v;
        };
        setTxt('cb-sales', xf(cashRev));
        setTxt('cb-pur', xf(cashPur));
        setTxt('cb-exp', xf(cashExp));
        setTxt('cb-ret', xf(cashRetOut));
        setTxt('bb-sales', xf(bankRev));
        setTxt('bb-pur', xf(bankPur));
        setTxt('bb-exp', xf(bankExp));
        setTxt('bb-ret', xf(bankRetOut));

        const bankTrxBody = document.getElementById('bank-trx-body');
        if (bankTrxBody) {
            if (bankTransfers.length === 0) {
                bankTrxBody.innerHTML =
                    '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-muted);">لا توجد حركات تحويل أو إيداع يدوية حتى الآن.</td></tr>';
            } else {
                const typeMap = {
                    deposit_cash: { label: 'إيداع للخزينة (نقد)', color: 'var(--accent-green)' },
                    deposit_bank: { label: 'إيداع لحساب البنك', color: 'var(--accent-blue)' },
                    transfer_to_bank: { label: 'تحويل من الخزينة ← إلى البنك', color: 'var(--accent-orange)' },
                    transfer_to_cash: { label: 'تحويل من البنك ← إلى الخزينة', color: 'var(--accent-orange)' },
                };
                let html = '';
                [...bankTransfers].reverse().forEach((t) => {
                    const info = typeMap[t.type] || { label: t.type, color: 'white' };
                    const dStr = new Date(t.date).toLocaleString('ar-SA');
                    html += `<tr>
                    <td dir="ltr" style="text-align:right">${dStr}</td>
                    <td style="color:${info.color}; font-weight:700;">${info.label}</td>
                    <td style="color:white; font-weight:800; font-size:16px;">${fmt(t.amount)}</td>
                    <td>${t.desc || ''}</td>
                </tr>`;
                });
                bankTrxBody.innerHTML = html;
            }
        }

        renderOtherIncomeTable(otherIncomeRows);
    }

    function renderOtherIncomeTable(rows) {
        const tb = document.getElementById('oi-tbody');
        if (!tb) return;
        const list = (rows || []).slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        if (list.length === 0) {
            tb.innerHTML =
                '<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--text-muted);">لا توجد إيرادات يدوية مسجّلة.</td></tr>';
            return;
        }
        tb.innerHTML = '';
        list.forEach((row) => {
            const pm = row.pMethod === 'bank' ? 'بنك' : 'كاش';
            const d = row.date || (row.timestamp ? new Date(row.timestamp).toISOString().split('T')[0] : '—');
            tb.insertAdjacentHTML(
                'beforeend',
                `<tr>
                <td><strong>${esc(row.id || '—')}</strong></td>
                <td dir="ltr" style="text-align:right">${esc(d)}</td>
                <td>${esc(row.desc || row.note || '—')}</td>
                <td style="font-weight:800;">${xf(row.amount)}</td>
                <td>${pm}</td>
                <td><button type="button" class="btn-text oi-del" data-oid="${row.id}" style="color:var(--accent-red)"><i class="ph ph-trash"></i></button></td>
            </tr>`,
            );
        });
        tb.querySelectorAll('.oi-del').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-oid');
                if (!id || !confirm('حذف هذا الإيراد من السجل؟')) return;
                const db = await window.dbRead();
                db.otherIncome = (db.otherIncome || []).filter((r) => String(r.id) !== String(id));
                await window.dbWrite(db);
                await refreshLiquidity();
            });
        });
    }

    window.openBankModal = function (type) {
        const m = document.getElementById('bank-modal');
        const dGroup = document.getElementById('bm-transfer-dir-group');
        document.getElementById('form-bank-trx').reset();
        document.getElementById('bm-type').value = type;
        const titles = {
            transfer: '<i class="ph ph-arrows-left-right"></i> تحويل بين الصناديق',
            deposit_cash: '<i class="ph ph-money"></i> إيداع نقدي للصندوق',
            deposit_bank: '<i class="ph ph-bank"></i> إيداع لحساب البنك',
        };
        document.getElementById('bm-title').innerHTML = titles[type] || 'معاملة مالية';
        dGroup.style.display = type === 'transfer' ? 'block' : 'none';
        m.classList.add('active');
    };

    document.addEventListener('DOMContentLoaded', async () => {
        await refreshLiquidity();

        document.getElementById('form-bank-trx')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            let type = document.getElementById('bm-type').value;
            if (type === 'transfer') type = document.getElementById('bm-transfer-dir').value;

            const trx = {
                id: 'TRX-' + Math.floor(Math.random() * 90000 + 10000),
                type,
                amount: Number(document.getElementById('bm-amount').value),
                desc: document.getElementById('bm-desc').value,
                date: new Date().toISOString(),
            };

            const db = await window.dbRead();
            if (!db.bankTransfers) db.bankTransfers = [];
            db.bankTransfers.push(trx);
            await window.dbWrite(db);
            document.getElementById('bank-modal').classList.remove('active');
            await refreshLiquidity();
        });

        document.getElementById('form-other-income')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = Number(document.getElementById('oi-amount').value);
            const desc = document.getElementById('oi-desc').value.trim();
            const pMethod = document.getElementById('oi-pmethod').value === 'bank' ? 'bank' : 'cash';
            if (!amount || amount <= 0 || !desc) {
                alert('أدخل مبلاً صحيحاً ووصفاً');
                return;
            }
            const now = new Date();
            const row = {
                id: 'OI-' + Math.floor(Math.random() * 90000 + 10000),
                amount,
                desc,
                pMethod,
                date: now.toISOString().split('T')[0],
                timestamp: now.getTime(),
            };
            const db = await window.dbRead();
            if (!db.otherIncome) db.otherIncome = [];
            db.otherIncome.push(row);
            await window.dbWrite(db);
            document.getElementById('other-income-modal').classList.remove('active');
            e.target.reset();
            await refreshLiquidity();
        });

        document.getElementById('btn-open-other-income')?.addEventListener('click', () => {
            document.getElementById('other-income-modal')?.classList.add('active');
        });
        document.querySelectorAll('.btn-close-oi').forEach((b) =>
            b.addEventListener('click', () => document.getElementById('other-income-modal')?.classList.remove('active')),
        );

        if (typeof window.registerPosDatabaseRefresh === 'function') {
            window.registerPosDatabaseRefresh(() => refreshLiquidity());
        }
    });
})();
