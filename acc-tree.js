/**
 * تعبئة شجرة الحسابات من القاعدة (بدون أرقام وهمية)
 */
(function () {
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

    async function paintAccTree() {
        const db = (await window.dbRead()) || {};
        const posOrders = db.orders || [];
        const erpPurchases = db.purchases || [];
        const erpExpenses = db.expenses || [];
        const bankTransfers = db.bankTransfers || [];
        const returnsRows = db.returns || [];
        const hrExps = db.hrExpenses || [];
        const otherIncomeRows = db.otherIncome || [];

        let totalRev = 0;
        let cashRev = 0;
        let bankRev = 0;
        posOrders.forEach((o) => {
            const t = Number(o.total) || 0;
            totalRev += t;
            const x = orderToCashBank(o);
            cashRev += x.c;
            bankRev += x.b;
        });
        let totalReturns = 0;
        returnsRows.forEach((r) => {
            totalReturns += Number(r.amount) || 0;
        });
        let totalOtherIncome = 0;
        otherIncomeRows.forEach((row) => {
            const a = Number(row.amount) || 0;
            totalOtherIncome += a;
            if (row.pMethod === 'bank') bankRev += a;
            else cashRev += a;
        });
        const totalRevNet = Math.max(0, totalRev - totalReturns) + totalOtherIncome;

        let cashPur = 0;
        let bankPur = 0;
        let creditPur = 0;
        erpPurchases.forEach((p) => {
            const pt = Number(p.total) || 0;
            if (p.payMethod === 'cash') cashPur += pt;
            else if (p.payMethod === 'bank') bankPur += pt;
            else if (p.payMethod === 'credit') creditPur += pt;
        });

        let cashExp = 0;
        let bankExp = 0;
        let salaries = 0;
        let rent = 0;
        erpExpenses.forEach((e) => {
            const a = Number(e.amount) || 0;
            if (e.pMethod === 'cash') cashExp += a;
            else if (e.pMethod === 'bank') bankExp += a;
            if (e.cat && e.cat.includes('رواتب')) salaries += a;
            else if (e.cat && e.cat.includes('إيجار')) rent += a;
        });
        hrExps.forEach((h) => {
            if (!hrAffectsLiquidity(h)) return;
            const a = Number(h.amount) || 0;
            salaries += a;
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

        const fmt = (n) =>
            Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ر.س';

        const set = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.innerText = text;
        };

        set('tree-cash', fmt(cashBal));
        set('tree-bank', fmt(bankBal));
        set('tree-rev', fmt(totalRevNet));
        set('tree-pur', fmt(erpPurchases.reduce((s, p) => s + (Number(p.total) || 0), 0)));
        set('tree-sal', fmt(salaries + rent));
        set('tree-suppliers', fmt(creditPur));
    }

    document.addEventListener('DOMContentLoaded', async () => {
        await paintAccTree();
        if (typeof window.registerPosDatabaseRefresh === 'function') {
            window.registerPosDatabaseRefresh(() => paintAccTree());
        }
    });
})();
