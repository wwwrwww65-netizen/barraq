/**
 * اختبارات محرك القيود المحاسبية
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const JC = require('../../journal-core.js');

describe('JournalCore', () => {
  it('ensureChartOfAccounts يملأ الدليل الافتراضي', () => {
    const db = {};
    JC.ensureChartOfAccounts(db);
    expect(db.chartOfAccounts.length).toBeGreaterThan(5);
    expect(db.chartOfAccounts.some((a) => a.code === '4110')).toBe(true);
  });

  it('rebuildJournalEntries يولّد قيد مبيعات متوازن', () => {
    const db = {
      orders: [
        {
          orderId: 'T1',
          timestamp: Date.now(),
          total: 100,
          paymentMethod: 'كاش',
        },
      ],
      returns: [],
      purchases: [],
      expenses: [],
      hrExpenses: [],
      otherIncome: [],
      bankTransfers: [],
      journalEntries: [],
    };
    JC.rebuildJournalEntries(db);
    expect(db.journalEntries.length).toBe(1);
    const e = db.journalEntries[0];
    expect(JC.entryIsBalanced(e)).toBe(true);
    const t = JC.lineTotals(e.lines);
    expect(t.debit).toBe(100);
    expect(t.credit).toBe(100);
  });

  it('المرتجع: مدين مرتجعات ودائن صندوق', () => {
    const db = {
      orders: [],
      returns: [{ id: 'R1', amount: 40, method: 'كاش', timestamp: Date.now(), date: '2026-04-01' }],
      purchases: [],
      expenses: [],
      hrExpenses: [],
      otherIncome: [],
      bankTransfers: [],
      journalEntries: [],
    };
    JC.rebuildJournalEntries(db);
    expect(db.journalEntries.length).toBe(1);
    expect(JC.entryIsBalanced(db.journalEntries[0])).toBe(true);
  });

  it('مشتريات آجل: مدين مشتريات ودائن ذمم', () => {
    const db = {
      orders: [],
      returns: [],
      purchases: [
        {
          id: 'P1',
          total: 200,
          payMethod: 'credit',
          date: '2026-04-01',
          supName: 'مورد',
        },
      ],
      expenses: [],
      hrExpenses: [],
      otherIncome: [],
      bankTransfers: [],
      journalEntries: [],
    };
    JC.rebuildJournalEntries(db);
    const e = db.journalEntries.find((x) => x.sourceType === 'purchase');
    expect(e).toBeTruthy();
    expect(JC.entryIsBalanced(e)).toBe(true);
  });

  it('يحتفظ بالقيد اليدوي عند إعادة البناء', () => {
    const manual = {
      id: 'JE-MAN-TEST',
      date: '2026-04-01',
      timestamp: 1,
      memo: 'test',
      sourceType: 'manual',
      sourceId: '',
      lines: [
        { accountCode: '1110', accountName: 'صندوق', debit: 50, credit: 0 },
        { accountCode: '3110', accountName: 'جاري', debit: 0, credit: 50 },
      ],
    };
    const db = {
      orders: [],
      returns: [],
      purchases: [],
      expenses: [],
      hrExpenses: [],
      otherIncome: [],
      bankTransfers: [],
      journalEntries: [manual],
    };
    JC.rebuildJournalEntries(db);
    expect(db.journalEntries.some((x) => x.id === 'JE-MAN-TEST')).toBe(true);
  });
});
