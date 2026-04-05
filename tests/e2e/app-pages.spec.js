/**
 * E2E: تسجيل دخول ثم تحميل كل صفحة تطبيق رئيسية (دخان واجهات)
 */
const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');

const projectRoot = path.join(__dirname, '..', '..');

const PAGES_AFTER_LOGIN = [
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

test.describe.configure({ mode: 'serial' });

test('تسجيل الدخول ثم فتح الصفحات الأساسية', async () => {
  test.setTimeout(600000);

  const electronApp = await electron.launch({
    cwd: projectRoot,
    args: ['.'],
  });

  const window = await electronApp.firstWindow();

  try {
    await window.waitForLoadState('domcontentloaded', { timeout: 60000 });
    await window.fill('#username', 'admin');
    await window.fill('#password', '123456');
    await window.click('#btn-login-submit');
    await window.waitForURL(/index\.html/i, { timeout: 30000 });
    await expect(window.locator('.app-container, .sidebar, body').first()).toBeVisible({
      timeout: 20000,
    });

    for (const pageName of PAGES_AFTER_LOGIN) {
      const fileUrl = pathToFileURL(path.join(projectRoot, pageName)).href;
      await window.goto(fileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      const u = window.url().toLowerCase();
      expect(u, `فشل تحميل ${pageName}`).toContain(pageName.toLowerCase());
      await expect(window.locator('body')).toBeVisible({ timeout: 15000 });
    }
  } finally {
    await electronApp.close();
  }
});
