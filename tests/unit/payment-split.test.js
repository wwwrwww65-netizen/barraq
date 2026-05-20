/**
 * اختبارات منطق تقسيم المدفوعات الموحّد
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const PS = require('../../payment-split.js');

describe('PaymentSplit', () => {
  it('كاش عادي يذهب للصندوق', () => {
    const x = PS.splitOrderAmounts({ paymentMethod: 'كاش', total: 50 });
    expect(x.cash).toBe(50);
    expect(x.network).toBe(0);
    expect(x.hungerStation).toBe(0);
  });

  it('توصيل غير مدفوع لا يؤثر على كاش أو شبكة', () => {
    const x = PS.splitOrderAmounts({
      hungerStation: true,
      hsPaymentStatus: 'unpaid',
      total: 120,
    });
    expect(x.cash).toBe(0);
    expect(x.network).toBe(0);
    expect(x.hungerStation).toBe(120);
  });

  it('توصيل مدفوع كاش يُحسب للصندوق', () => {
    const x = PS.orderToCashBank({
      hungerStation: true,
      hsPaymentStatus: 'paid',
      hsPaymentMethod: 'كاش',
      total: 80,
    });
    expect(x.c).toBe(80);
    expect(x.b).toBe(0);
  });

  it('طلب مرتجع لا يُحسب في السيولة', () => {
    const x = PS.orderToCashBank({ status: 'returned', paymentMethod: 'كاش', total: 100 });
    expect(x.c).toBe(0);
    expect(x.b).toBe(0);
  });

  it('مرتجع طلب مُعلَّم returned لا يُخصم مرتين', () => {
    const orders = [{ orderId: '1', status: 'returned', total: 100 }];
    const r = { orderId: '1', amount: 100, method: 'cash' };
    expect(PS.returnAffectsLiquidity(r, orders)).toBe(false);
  });

  it('مرتجع بدون طلب returned يُخصم', () => {
    const r = { orderId: '99', amount: 40, method: 'كاش' };
    expect(PS.returnAffectsLiquidity(r, [])).toBe(true);
  });

  it('خصم موظف لا يؤثر على سيولة الدرج', () => {
    expect(PS.hrAffectsLiquidity({ type: 'خصم / جزاء', amount: 50 })).toBe(false);
    expect(PS.hrAffectsLiquidity({ type: 'له (راتب)', amount: 50 })).toBe(true);
  });
});
