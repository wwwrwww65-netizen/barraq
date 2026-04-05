/**
 * محرك قيود محاسبية مزدوجة مبسّط — يُولَّد تلقائياً من الطلبات والمرتجعات والمشتريات وغيرها.
 * يعمل في المتصفح/Electron (window.JournalCore) وفي Node (module.exports) للاختبارات.
 */
(function (root) {
    'use strict';

    const DEFAULT_COA = [
        { code: '1110', name: 'الصندوق النقدي', type: 'asset' },
        { code: '1120', name: 'البنك', type: 'asset' },
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

    function hrAffectsLiquidity(h) {
        const t = String(h.type || '');
        return !t.includes('خصم') && !t.includes('جزاء');
    }

    function orderPaymentSplit(o) {
        const t = round2(o.total);
        if (t <= 0) return { cash: 0, bank: 0 };
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
     * يعيد بناء القيود التلقائية من البيانات، مع الإبقاء على القيود اليدوية (sourceType === 'manual').
     */
    function rebuildJournalEntries(db) {
        ensureChartOfAccounts(db);
        const chart = db.chartOfAccounts;
        const manual = (db.journalEntries || []).filter((e) => e && e.sourceType === 'manual');
        const entries = [];

        function pushEntry(e) {
            if (!e.lines || e.lines.length < 2) return;
            if (!entryIsBalanced(e)) {
                console.warn('[JournalCore] قيد غير متوازن تم تجاهله:', e.id, e.memo);
                return;
            }
            entries.push(e);
        }

        (db.orders || []).forEach((o, idx) => {
            const amt = round2(o.total);
            if (amt <= 0) return;
            const { cash, bank } = orderPaymentSplit(o);
            const lines = [];
            if (cash > 0) {
                lines.push({
                    accountCode: '1110',
                    accountName: accName(chart, '1110'),
                    debit: cash,
                    credit: 0,
                });
            }
            if (bank > 0) {
                lines.push({
                    accountCode: '1120',
                    accountName: accName(chart, '1120'),
                    debit: bank,
                    credit: 0,
                });
            }
            lines.push({
                accountCode: '4110',
                accountName: accName(chart, '4110'),
                debit: 0,
                credit: amt,
            });
            const oid = safeId(o.orderId != null ? o.orderId : idx);
            pushEntry({
                id: 'JE-ORD-' + oid,
                date: ymd(o.timestamp || o.date),
                timestamp: Number(o.timestamp) || Date.now(),
                memo: 'قيد مبيعات — ' + (o.orderId || oid),
                sourceType: 'order',
                sourceId: String(o.orderId || ''),
                lines,
            });
        });

        (db.returns || []).forEach((r, idx) => {
            const amt = round2(r.amount);
            if (amt <= 0) return;
            let { c, b } = returnRefundCashBank(r);
            c = round2(c);
            b = round2(b);
            if (Math.abs(c + b - amt) > 0.02) {
                const sum = c + b;
                if (sum < 0.01) b = amt;
                else {
                    c = round2((amt * c) / sum);
                    b = round2(amt - c);
                }
            }
            const lines = [
                {
                    accountCode: '4120',
                    accountName: accName(chart, '4120'),
                    debit: amt,
                    credit: 0,
                },
            ];
            if (c > 0) {
                lines.push({
                    accountCode: '1110',
                    accountName: accName(chart, '1110'),
                    debit: 0,
                    credit: c,
                });
            }
            if (b > 0) {
                lines.push({
                    accountCode: '1120',
                    accountName: accName(chart, '1120'),
                    debit: 0,
                    credit: b,
                });
            }
            const rid = safeId(r.id || r.returnId || 'R' + idx);
            pushEntry({
                id: 'JE-RET-' + rid,
                date: ymd(r.timestamp || r.date),
                timestamp: Number(r.timestamp) || Date.now(),
                memo: 'مرتجع مبيعات — ' + (r.reason || ''),
                sourceType: 'return',
                sourceId: String(r.id || r.returnId || ''),
                lines,
            });
        });

        (db.purchases || []).forEach((p, idx) => {
            const amt = round2(p.total);
            if (amt <= 0) return;
            const pm = p.payMethod;
            const lines = [
                {
                    accountCode: '5110',
                    accountName: accName(chart, '5110'),
                    debit: amt,
                    credit: 0,
                },
            ];
            if (pm === 'credit') {
                lines.push({
                    accountCode: '2110',
                    accountName: accName(chart, '2110'),
                    debit: 0,
                    credit: amt,
                });
            } else if (pm === 'cash') {
                lines.push({
                    accountCode: '1110',
                    accountName: accName(chart, '1110'),
                    debit: 0,
                    credit: amt,
                });
            } else {
                lines.push({
                    accountCode: '1120',
                    accountName: accName(chart, '1120'),
                    debit: 0,
                    credit: amt,
                });
            }
            const pid = safeId(p.id != null ? p.id : 'P' + idx);
            pushEntry({
                id: 'JE-PUR-' + pid,
                date: ymd(p.date),
                timestamp: new Date(p.date || Date.now()).getTime(),
                memo: 'مشتريات — ' + (p.supName || '') + (p.invoiceNum ? ' #' + p.invoiceNum : ''),
                sourceType: 'purchase',
                sourceId: String(p.id || ''),
                lines,
            });
        });

        (db.expenses || []).forEach((e, idx) => {
            const amt = round2(e.amount);
            if (amt <= 0) return;
            const expCode = expenseAccountCode(e.cat);
            const lines = [
                {
                    accountCode: expCode,
                    accountName: accName(chart, expCode),
                    debit: amt,
                    credit: 0,
                },
            ];
            if (e.pMethod === 'cash') {
                lines.push({
                    accountCode: '1110',
                    accountName: accName(chart, '1110'),
                    debit: 0,
                    credit: amt,
                });
            } else {
                lines.push({
                    accountCode: '1120',
                    accountName: accName(chart, '1120'),
                    debit: 0,
                    credit: amt,
                });
            }
            const eid = safeId(e.id != null ? e.id : 'E' + idx);
            pushEntry({
                id: 'JE-EXP-' + eid,
                date: ymd(e.date),
                timestamp: new Date(e.date || Date.now()).getTime(),
                memo: 'مصروف — ' + (e.desc || '') + (e.cat ? ' [' + e.cat + ']' : ''),
                sourceType: 'expense',
                sourceId: String(e.id || ''),
                lines,
            });
        });

        (db.hrExpenses || []).forEach((h, idx) => {
            const amt = round2(h.amount);
            if (amt <= 0) return;
            const lines = [];
            if (hrAffectsLiquidity(h)) {
                lines.push({
                    accountCode: '5310',
                    accountName: accName(chart, '5310'),
                    debit: amt,
                    credit: 0,
                });
                if (h.pMethod === 'bank') {
                    lines.push({
                        accountCode: '1120',
                        accountName: accName(chart, '1120'),
                        debit: 0,
                        credit: amt,
                    });
                } else {
                    lines.push({
                        accountCode: '1110',
                        accountName: accName(chart, '1110'),
                        debit: 0,
                        credit: amt,
                    });
                }
                const hid = safeId(h.id != null ? h.id : 'H' + idx);
                pushEntry({
                    id: 'JE-HR-' + hid,
                    date: ymd(h.timestamp || h.date),
                    timestamp: Number(h.timestamp) || Date.now(),
                    memo: 'موارد بشرية — ' + (h.type || '') + (h.employee ? ' — ' + h.employee : ''),
                    sourceType: 'hr',
                    sourceId: String(h.id || ''),
                    lines,
                });
            } else {
                lines.push({
                    accountCode: '5310',
                    accountName: accName(chart, '5310'),
                    debit: amt,
                    credit: 0,
                });
                lines.push({
                    accountCode: '2190',
                    accountName: accName(chart, '2190'),
                    debit: 0,
                    credit: amt,
                });
                const hid = safeId(h.id != null ? h.id : 'H' + idx);
                pushEntry({
                    id: 'JE-HR-' + hid,
                    date: ymd(h.timestamp || h.date),
                    timestamp: Number(h.timestamp) || Date.now(),
                    memo: 'استقطاع / ذمّة موظف — ' + (h.type || '') + (h.employee ? ' — ' + h.employee : ''),
                    sourceType: 'hr',
                    sourceId: String(h.id || ''),
                    lines,
                });
            }
        });

        (db.otherIncome || []).forEach((row, idx) => {
            const amt = round2(row.amount);
            if (amt <= 0) return;
            const lines = [];
            if (row.pMethod === 'bank') {
                lines.push({
                    accountCode: '1120',
                    accountName: accName(chart, '1120'),
                    debit: amt,
                    credit: 0,
                });
            } else {
                lines.push({
                    accountCode: '1110',
                    accountName: accName(chart, '1110'),
                    debit: amt,
                    credit: 0,
                });
            }
            lines.push({
                accountCode: '4130',
                accountName: accName(chart, '4130'),
                debit: 0,
                credit: amt,
            });
            const oiid = safeId(row.id != null ? row.id : 'OI' + idx);
            pushEntry({
                id: 'JE-OI-' + oiid,
                date: ymd(row.timestamp || row.date),
                timestamp: Number(row.timestamp) || Date.now(),
                memo: 'إيراد آخر — ' + (row.desc || row.note || ''),
                sourceType: 'otherIncome',
                sourceId: String(row.id || ''),
                lines,
            });
        });

        (db.bankTransfers || []).forEach((t, idx) => {
            const amt = round2(t.amount);
            if (amt <= 0) return;
            const lines = [];
            const typ = t.type;
            if (typ === 'deposit_cash') {
                lines.push({ accountCode: '1110', accountName: accName(chart, '1110'), debit: amt, credit: 0 });
                lines.push({ accountCode: '3110', accountName: accName(chart, '3110'), debit: 0, credit: amt });
            } else if (typ === 'deposit_bank') {
                lines.push({ accountCode: '1120', accountName: accName(chart, '1120'), debit: amt, credit: 0 });
                lines.push({ accountCode: '3110', accountName: accName(chart, '3110'), debit: 0, credit: amt });
            } else if (typ === 'transfer_to_bank') {
                lines.push({ accountCode: '1120', accountName: accName(chart, '1120'), debit: amt, credit: 0 });
                lines.push({ accountCode: '1110', accountName: accName(chart, '1110'), debit: 0, credit: amt });
            } else if (typ === 'transfer_to_cash') {
                lines.push({ accountCode: '1110', accountName: accName(chart, '1110'), debit: amt, credit: 0 });
                lines.push({ accountCode: '1120', accountName: accName(chart, '1120'), debit: 0, credit: amt });
            } else return;
            const tid = safeId(t.id != null ? t.id : 'T' + idx);
            pushEntry({
                id: 'JE-BT-' + tid,
                date: ymd(t.date),
                timestamp: new Date(t.date || Date.now()).getTime(),
                memo: 'تحويل / إيداع — ' + (t.desc || typ),
                sourceType: 'bankTransfer',
                sourceId: String(t.id || ''),
                lines,
            });
        });

        manual.forEach((m) => {
            if (m && m.lines && entryIsBalanced(m)) entries.push(m);
        });

        entries.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        db.journalEntries = entries;
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
