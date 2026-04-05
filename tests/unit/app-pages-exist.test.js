/**
 * التأكد من وجود كل صفحات التطبيق الرئيسية (HTML في الجذر)
 */
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');

/** صفحات النظام المتوقعة — يُحدَّث عند إضافة شاشة */
const APP_HTML_PAGES = [
  'login.html',
  'index.html',
  'pos.html',
  'menu.html',
  'sales.html',
  'orders.html',
  'inventory.html',
  'purchases.html',
  'returns.html',
  'staff.html',
  'customers.html',
  'accounting.html',
  'statistics.html',
  'profit-loss.html',
  'settings.html',
  'permissions.html',
  'fatora.html',
  'kitchen.html',
  'kitchen-production.html',
  'profile.html',
  'suppliers.html',
  'setup.html',
  'inv-documents.html',
  'acc-banks.html',
  'acc-reports.html',
  'cashier-report.html',
  'acc-tree.html',
  'acc-expenses.html',
  'journal.html',
  'add-item.html',
  'add-category.html',
];

describe('app HTML pages exist', () => {
  it('كل الصفحات المعرّفة موجودة على القرص', () => {
    for (const name of APP_HTML_PAGES) {
      const full = path.join(root, name);
      expect(fs.existsSync(full), `مفقود: ${name}`).toBe(true);
    }
  });
});
