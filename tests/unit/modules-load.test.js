/**
 * تحميل وحدات رئيسية بدون تشغيل التطبيق كاملاً
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

describe('module loads', () => {
  it('zatca-engine يصدّر الصنف', () => {
    const ZatcaEngine = require('../../zatca-engine.js');
    expect(typeof ZatcaEngine).toBe('function');
  });

  it('database يصدّر دوال متوقعة', () => {
    const db = require('../../database.js');
    expect(typeof db.saveOrder).toBe('function');
    expect(typeof db.getOrders).toBe('function');
    expect(typeof db.getInventory).toBe('function');
    expect(typeof db.saveProduct).toBe('function');
    expect(typeof db.getProducts).toBe('function');
    expect(typeof db.saveCategory).toBe('function');
    expect(typeof db.getCategories).toBe('function');
  });
});
