/**
 * اختبار HTML الإيصال الحراري (منطق عرض — مع محاكاة DOM لأن الدالة تقرأ عناصر الإيصال)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

function mockReceiptDom() {
  const els = {
    'r-type': { innerText: 'محلي' },
    'r-order-id': { innerText: '#INV-TEST' },
    'r-date': { innerText: '2026-01-01' },
    'r-items': { innerHTML: '<tr><td>صنف</td><td>1</td><td>10</td></tr>' },
    'r-subtotal': { innerText: '10.00 ر.س' },
    'r-total': { innerText: '11.50 ر.س' },
    'r-discount': { innerText: '0.00 ر.س' },
    'r-tax-rate-label': { innerText: 'ضريبة القيمة المضافة:' },
    'r-tax': { innerText: '1.50 ر.س' },
    'r-payment-method': { innerText: 'كاش' },
    'r-qr-code': { src: 'data:image/png;base64,' + 'a'.repeat(120) },
  };
  global.document = {
    getElementById: (id) => els[id] || { innerText: '', innerHTML: '' },
  };
}

describe('getReceiptFooterLine', () => {
  it('بدون تخصيص: اسم البرنامج', () => {
    const { getReceiptFooterLine } = require('../../thermal-receipt-updated.js');
    expect(getReceiptFooterLine(null, 'أي اسم', null)).toContain('Hash POS');
    expect(
      getReceiptFooterLine(JSON.stringify({ name: 'هش HASH', logo: '1111.png' }), 'هش HASH', null)
    ).toContain('Hash POS');
  });

  it('مع اسم منشأة مخصص: بدون Hash POS في الإيصال العادي', () => {
    const { getReceiptFooterLine } = require('../../thermal-receipt-updated.js');
    const line = getReceiptFooterLine(
      JSON.stringify({ name: 'مطعم الأصالة', logo: '1111.png' }),
      'مطعم الأصالة',
      null
    );
    expect(line).toBe('مطعم الأصالة');
    expect(line).not.toContain('Hash POS');
  });

  it('مع شعار base64 يُعتبر تخصيصاً', () => {
    const { getReceiptFooterLine } = require('../../thermal-receipt-updated.js');
    const line = getReceiptFooterLine(
      JSON.stringify({ name: 'هش HASH', logo: 'data:image/png;base64,xx' }),
      'هش HASH',
      'تقرير وردية'
    );
    expect(line).toContain('هش HASH');
    expect(line).toContain('تقرير وردية');
    expect(line).not.toContain('Hash POS');
  });
});

describe('buildThermalReceiptHTML', () => {
  beforeEach(() => {
    mockReceiptDom();
  });

  afterEach(() => {
    delete global.document;
  });

  it('يولّد HTML يحتوي بيانات المطعم ومقاس 80mm', () => {
    const { buildThermalReceiptHTML } = require('../../thermal-receipt-updated.js');
    const html = buildThermalReceiptHTML('', 'مطعم تجريبي', '310000000000003', 'الرياض', '0500000000');
    expect(html).toContain('مطعم تجريبي');
    expect(html).toContain('310000000000003');
    expect(html).toContain('80mm');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('#INV-TEST');
    expect(html).toContain('Hash POS');
    expect(html).toContain('مجموع الأصناف');
  });

  it('يستخدم receiptSnap دون الاعتماد على DOM', () => {
    delete global.document;
    const { buildThermalReceiptHTML } = require('../../thermal-receipt-updated.js');
    const html = buildThermalReceiptHTML('', 'م', '310', 'فرع', '', {
      orderType: 'سفري',
      orderId: '88',
      date: '2026',
      itemsHtml: '<tr><td>ماء</td><td>2</td><td>4</td></tr>',
      subtotalText: '4.00 ر.س',
      totalText: '4.60 ر.س',
      discountText: '0.00 ر.س',
      taxLabel: 'ضريبة 15%:',
      taxText: '0.60 ر.س',
      paymentText: 'شبكة',
      qrSrc: 'data:image/png;base64,' + 'c'.repeat(120),
    });
    expect(html).toContain('سفري');
    expect(html).toContain('88');
    expect(html).toContain('ماء');
    expect(html).toContain('data:image/png;base64,');
  });
});
