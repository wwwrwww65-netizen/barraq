/**
 * محرك قيود محاسبية مزدوجة مبسّط — يُولَّد تلقائياً من الطلبات والمرتجعات والمشتريات وغيرها.
 * يعمل في المتصفح/Electron (window.JournalCore) وفي Node (module.exports) للاختبارات.
 */
(function (root) {
    'use strict';

    const DEFAULT_COA = [
        { code: '1110', name: 'الصندوق النقدي', type: 'asset' },
        { code: '1120', name: 'البنك', type: 'asset' },
        { code: '1130', name: 'ذمم العملاء', type: 'asset' },
        { code: '1140', name: 'الأصول الثابتة', type: 'asset' },
        { code: '1141', name: 'مجمع الإهلاك للأصول', type: 'asset' },
        { code: '1150', name: 'مخزون مواد قيد التصنيع (WIP)', type: 'asset' },
        { code: '1151', name: 'مخزون منتجات تامة (FG)', type: 'asset' },
        { code: '2110', name: 'ذمم الموردين (آجل)', type: 'liability' },
        { code: '2190', name: 'ذمم الموظفين', type: 'liability' },
        { code: '3110', name: 'جاري الشركاء / رأس المال', type: 'equity' },
        { code: '4110', name: 'إيرادات المبيعات', type: 'revenue' },
        { code: '4120', name: 'مرتجعات المبيعات', type: 'expense' },
        { code: '4130', name: 'إيرادات أخرى', type: 'revenue' },
        { code: '5110', name: 'المشتريات والبضاعة', type: 'expense' },
        { code: '5210', name: 'مصروفات تشغيلية', type: 'expense' },
        { code: '5310', name: 'الرواتب والأجور', type: 'expense' },
        { code: '5410', name: 'الإيجار', type: 'expense' },
        { code: '5510', name: 'مصروف الإهلاك', type: 'expense' },
    ];

    function round2(n) {
        return Math.round((Number(n) || 0) * 100) / 100;
    }

    function ymd(ts) {
        const d = new Date(ts);
        if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
        return d.toISOString().slice(0, 10);
    }

    function safeId(s) {
        return String(s == null ? '' : s).replace(/[^a-zA-Z0-9-_]/g, '_');
    }

    function accName(chart, code) {
        const row = (chart || []).find((c) => c.code === code);
        return row ? row.name : code;
    }

    let PaymentSplit;
    try {
        PaymentSplit = require('./payment-split.js');
    } catch (_e) {
        PaymentSplit = root.PaymentSplit || null;
    }

    function hrAffectsLiquidity(h) {
        if (PaymentSplit) return PaymentSplit.hrAffectsLiquidity(h);
        const t = String(h.type || '');
        if (t.includes('سلفة')) return true;
        return !t.includes('خصم / جزاء') && !t.includes('جزاء');
    }

    function orderPaymentSplit(o) {
        const t = round2(o.total);
        if (t <= 0) return { cash: 0, bank: 0 };
        if (PaymentSplit) {
            const x = PaymentSplit.orderToCashBank(o);
            return { cash: round2(x.c), bank: round2(x.b) };
        }
        const pm = o.paymentMethod || '';
        let cash = 0;
        let bank = 0;
        if (pm === 'cash' || pm === 'كاش') cash = t;
        else if (['card', 'bank', 'شبكة / بطاقة', 'شبكة', 'مدى', 'فيزا'].includes(pm)) bank = t;
        else if (pm === 'مجزأ') {
            cash = round2(o.splitCash);
            bank = round2(o.splitNetwork);
        } else bank = t;
        const s = cash + bank;
        if (s < 0.01 && t > 0) bank = t;
        else if (Math.abs(s - t) > 0.02) bank = round2(t - cash);
        return { cash: round2(cash), bank: round2(bank) };
    }

    function returnRefundCashBank(r) {
        if (PaymentSplit) return PaymentSplit.returnRefundCashBank(r);
        const amt = round2(r.amount);
        const pm = String(r.method || '').trim();
        if (pm === 'cash' || pm === 'كاش' || pm === 'نقد') return { c: amt, b: 0 };
        if (['card', 'bank', 'شبكة / بطاقة', 'شبكة', 'مدى', 'فيزا'].includes(pm)) return { c: 0, b: amt };
        if (pm === 'مجزأ') {
            const c = round2(r.splitCash);
            const b = round2(r.splitNetwork);
            return c || b ? { c, b } : { c: 0, b: amt };
        }
        return { c: 0, b: amt };
    }

    function expenseAccountCode(cat) {
        const c = String(cat || '');
        if (c.includes('رواتب')) return '5310';
        if (c.includes('إيجار')) return '5410';
        return '5210';
    }

    function lineTotals(lines) {
        let d = 0;
        let c = 0;
        (lines || []).forEach((l) => {
            d += round2(l.debit);
            c += round2(l.credit);
        });
        return { debit: round2(d), credit: round2(c) };
    }

    function entryIsBalanced(entry) {
        const t = lineTotals(entry.lines);
        return Math.abs(t.debit - t.credit) < 0.001;
    }

    function ensureChartOfAccounts(db) {
        if (!db.chartOfAccounts || !Array.isArray(db.chartOfAccounts) || db.chartOfAccounts.length === 0) {
            db.chartOfAccounts = JSON.parse(JSON.stringify(DEFAULT_COA));
        }
        return db.chartOfAccounts;
    }

    /**
     * تم تعطيل إعادة البناء الشامل للحفاظ على القيود التي تنشأ لحظيا.
     */
    function rebuildJournalEntries(db) {
        ensureChartOfAccounts(db);
        const entries = db.journalEntries || [];
        // Preserve all existing entries instead of rebuilding
        return { count: entries.length, balanced: entries.every(entryIsBalanced) };
    }

    function validateManualEntry(entry) {
        if (!entry.lines || entry.lines.length < 2) return { ok: false, msg: 'يُشترط سطران على الأقل' };
        if (!entryIsBalanced(entry)) return { ok: false, msg: 'مجموع المدين يجب أن يساوي مجموع الدائن' };
        return { ok: true };
    }

    const JournalCore = {
        DEFAULT_COA,
        ensureChartOfAccounts,
        rebuildJournalEntries,
        entryIsBalanced,
        lineTotals,
        validateManualEntry,
        round2,
        accName,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = JournalCore;
    }
    root.JournalCore = JournalCore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
