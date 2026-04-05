/**
 * اختبارات وحدة لـ database.js عبر POS_TEST_DB_FILE (بدون Electron)
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const testUserData = path.join(os.tmpdir(), 'vitest-baraaq-userdata');
const testDbFile = path.join(testUserData, 'pos_database.json');

beforeEach(() => {
  fs.mkdirSync(testUserData, { recursive: true });
  if (fs.existsSync(testDbFile)) fs.unlinkSync(testDbFile);
  process.env.POS_TEST_DB_FILE = testDbFile;
});

afterEach(() => {
  delete process.env.POS_TEST_DB_FILE;
});

function loadDatabase() {
  delete require.cache[require.resolve('../../database.js')];
  return require('../../database.js');
}

describe('database.saveOrder / getOrders', () => {
  it('يحفظ طلباً ويسترجعه', () => {
    const database = loadDatabase();
    const order = {
      orderId: '#INV-00001',
      timestamp: Date.now(),
      total: 100,
      paymentMethod: 'كاش',
      items: [{ name: 'صنف تجريبي', qty: 2, price: 50 }],
    };
    const r = database.saveOrder(order);
    expect(r.success).toBe(true);
    const orders = database.getOrders();
    expect(orders.length).toBe(1);
    expect(orders[0].orderId).toBe('#INV-00001');
  });

  it('يخصم من المخزون عند تطابق الاسم', () => {
    fs.writeFileSync(
      testDbFile,
      JSON.stringify({
        orders: [],
        products: [],
        categories: [],
        inventory: [{ name: 'طماطم', qty: 10, minQty: 1 }],
      }),
      'utf8'
    );
    const database = loadDatabase();
    database.saveOrder({
      orderId: '#INV-00002',
      timestamp: Date.now(),
      total: 20,
      paymentMethod: 'كاش',
      items: [{ name: 'طماطم', qty: 3, price: 5 }],
    });
    const raw = JSON.parse(fs.readFileSync(testDbFile, 'utf8'));
    const inv = raw.inventory.find((i) => i.name === 'طماطم');
    expect(inv.qty).toBe(7);
  });

  it('يخصم من مستودع محدد عند تمرير inventoryDeductWarehouse', () => {
    fs.writeFileSync(
      testDbFile,
      JSON.stringify({
        orders: [],
        products: [],
        categories: [],
        inventory: [
          { name: 'ماء', qty: 10, warehouseId: 'main' },
          { name: 'ماء', qty: 5, warehouseId: 'restaurant' },
        ],
      }),
      'utf8',
    );
    const database = loadDatabase();
    database.saveOrder({
      orderId: '#INV-WH',
      timestamp: Date.now(),
      total: 1,
      paymentMethod: 'كاش',
      items: [{ name: 'ماء', qty: 2, price: 1 }],
      inventoryDeductWarehouse: 'restaurant',
    });
    const raw = JSON.parse(fs.readFileSync(testDbFile, 'utf8'));
    const main = raw.inventory.find((i) => i.name === 'ماء' && (i.warehouseId || 'main') === 'main');
    const rest = raw.inventory.find((i) => i.name === 'ماء' && (i.warehouseId || 'main') === 'restaurant');
    expect(main.qty).toBe(10);
    expect(rest.qty).toBe(3);
  });

  it('يخصم خامات الوصفة rawMaterials عند تمرير المستودع', () => {
    fs.writeFileSync(
      testDbFile,
      JSON.stringify({
        orders: [],
        products: [
          {
            id: 'p-burger',
            nameAr: 'برجر',
            rawMaterials: [{ name: 'لحم', qtyPerUnit: 0.2 }],
          },
        ],
        categories: [],
        inventory: [{ name: 'لحم', qty: 10, warehouseId: 'restaurant' }],
      }),
      'utf8',
    );
    const database = loadDatabase();
    database.saveOrder({
      orderId: '#INV-R',
      timestamp: Date.now(),
      total: 50,
      paymentMethod: 'كاش',
      items: [{ id: 'p-burger', name: 'برجر', qty: 2, price: 25 }],
      inventoryDeductWarehouse: 'restaurant',
    });
    const raw = JSON.parse(fs.readFileSync(testDbFile, 'utf8'));
    const inv = raw.inventory.find((i) => i.name === 'لحم');
    expect(inv.qty).toBeCloseTo(9.6);
  });
});

describe('database.saveProduct / getProducts', () => {
  it('يضيف منتجاً جديداً', () => {
    const database = loadDatabase();
    database.saveProduct({ id: 'p1', nameAr: 'برجر', price: 15, categoryId: 'c1', isActive: true });
    const products = database.getProducts();
    expect(products.some((p) => p.id === 'p1')).toBe(true);
  });
});

describe('database.saveCategory / getCategories', () => {
  it('يضيف قسماً', () => {
    const database = loadDatabase();
    database.saveCategory({ id: 'cat1', nameAr: 'مشروبات', order: 1 });
    const cats = database.getCategories();
    expect(cats.some((c) => c.id === 'cat1')).toBe(true);
  });

  it('يحدّث قسماً موجوداً', () => {
    fs.writeFileSync(
      testDbFile,
      JSON.stringify({
        orders: [],
        products: [],
        categories: [{ id: 'c1', nameAr: 'قديم', order: 0 }],
        inventory: [],
      }),
      'utf8',
    );
    const database = loadDatabase();
    database.saveCategory({ id: 'c1', nameAr: 'جديد', order: 2 });
    const cats = database.getCategories();
    const c = cats.find((x) => x.id === 'c1');
    expect(c.nameAr).toBe('جديد');
    expect(c.order).toBe(2);
  });
});

describe('database.getInventory', () => {
  it('يعيد مصفوفة المخزون من الملف', () => {
    fs.writeFileSync(
      testDbFile,
      JSON.stringify({
        orders: [],
        products: [],
        categories: [],
        inventory: [{ name: 'خبز', qty: 5, minQty: 1 }],
      }),
      'utf8',
    );
    const database = loadDatabase();
    const inv = database.getInventory();
    expect(inv.length).toBe(1);
    expect(inv[0].name).toBe('خبز');
    expect(inv[0].qty).toBe(5);
  });
});

describe('database.getOrders', () => {
  it('يرتّب حسب timestamp تنازلياً ويحدّي 500', () => {
    const now = Date.now();
    fs.writeFileSync(
      testDbFile,
      JSON.stringify({
        orders: [
          { orderId: 'a', timestamp: now - 2000, total: 1, items: [] },
          { orderId: 'b', timestamp: now, total: 2, items: [] },
          { orderId: 'c', timestamp: now - 1000, total: 3, items: [] },
        ],
        products: [],
        categories: [],
        inventory: [],
      }),
      'utf8',
    );
    const database = loadDatabase();
    const orders = database.getOrders();
    expect(orders.map((o) => o.orderId)).toEqual(['b', 'c', 'a']);
  });
});

describe('database.saveInventoryItem', () => {
  it('يضيف صنف مخزون ويحدّثه عند تطابق sku ومستودع', () => {
    const database = loadDatabase();
    database.saveInventoryItem({
      sku: 'SKU-T1',
      name: 'صنف مخزون',
      qty: 5,
      minQty: 1,
      warehouseId: 'main',
      unit: 'علبة',
      cost: 10,
    });
    let inv = database.getInventory();
    let row = inv.find((i) => i.sku === 'SKU-T1' && (i.warehouseId || 'main') === 'main');
    expect(row.qty).toBe(5);
    database.saveInventoryItem({ sku: 'SKU-T1', warehouseId: 'main', qty: 12 });
    inv = database.getInventory();
    row = inv.find((i) => i.sku === 'SKU-T1');
    expect(row.qty).toBe(12);
    expect(row.name).toBe('صنف مخزون');
  });
});

describe('database.saveProduct', () => {
  it('يحدّث منتجاً موجوداً', () => {
    fs.writeFileSync(
      testDbFile,
      JSON.stringify({
        orders: [],
        products: [{ id: 'p1', nameAr: 'قديم', price: 1, categoryId: 'c', isActive: true }],
        categories: [],
        inventory: [],
      }),
      'utf8',
    );
    const database = loadDatabase();
    database.saveProduct({ id: 'p1', nameAr: 'محدّث', price: 99, categoryId: 'c', isActive: false });
    const products = database.getProducts();
    const p = products.find((x) => x.id === 'p1');
    expect(p.nameAr).toBe('محدّث');
    expect(p.price).toBe(99);
    expect(p.isActive).toBe(false);
  });
});
