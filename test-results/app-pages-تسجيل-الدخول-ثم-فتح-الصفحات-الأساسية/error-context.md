# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: app-pages.spec.js >> تسجيل الدخول ثم فتح الصفحات الأساسية
- Location: tests/e2e/app-pages.spec.js:47:1

# Error details

```
TimeoutError: page.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('#username')

```

# Test source

```ts
  1  | /**
  2  |  * E2E: تسجيل دخول ثم تحميل كل صفحة تطبيق رئيسية (دخان واجهات)
  3  |  */
  4  | const { test, expect } = require('@playwright/test');
  5  | const { _electron: electron } = require('playwright');
  6  | const path = require('path');
  7  | const { pathToFileURL } = require('url');
  8  | 
  9  | const projectRoot = path.join(__dirname, '..', '..');
  10 | 
  11 | const PAGES_AFTER_LOGIN = [
  12 |   'index.html',
  13 |   'pos.html',
  14 |   'menu.html',
  15 |   'sales.html',
  16 |   'orders.html',
  17 |   'inventory.html',
  18 |   'purchases.html',
  19 |   'returns.html',
  20 |   'staff.html',
  21 |   'customers.html',
  22 |   'accounting.html',
  23 |   'statistics.html',
  24 |   'profit-loss.html',
  25 |   'settings.html',
  26 |   'permissions.html',
  27 |   'fatora.html',
  28 |
  29 |
  30 |   'profile.html',
  31 |   'suppliers.html',
  32 |   'setup.html',
  33 |   'inv-documents.html',
  34 |   'acc-banks.html',
  35 |   'acc-reports.html',
  36 |   'cashier-report.html',
  37 |   'acc-tree.html',
  38 |   'acc-expenses.html',
  39 |   'journal.html',
  40 |   'add-item.html',
  41 |   'add-category.html',
  42 |   'day-closures.html',
  43 | ];
  44 | 
  45 | test.describe.configure({ mode: 'serial' });
  46 | 
  47 | test('تسجيل الدخول ثم فتح الصفحات الأساسية', async () => {
  48 |   test.setTimeout(600000);
  49 | 
  50 |   const electronApp = await electron.launch({
  51 |     cwd: projectRoot,
  52 |     args: ['.'],
  53 |   });
  54 | 
  55 |   const window = await electronApp.firstWindow();
  56 | 
  57 |   try {
  58 |     await window.waitForLoadState('domcontentloaded', { timeout: 60000 });
> 59 |     await window.fill('#username', 'admin');
     |                  ^ TimeoutError: page.fill: Timeout 30000ms exceeded.
  60 |     await window.fill('#password', '123456');
  61 |     await window.click('#btn-login-submit');
  62 |     await window.waitForURL(/index\.html/i, { timeout: 30000 });
  63 |     await expect(window.locator('.app-container, .sidebar, body').first()).toBeVisible({
  64 |       timeout: 20000,
  65 |     });
  66 | 
  67 |     for (const pageName of PAGES_AFTER_LOGIN) {
  68 |       const fileUrl = pathToFileURL(path.join(projectRoot, pageName)).href;
  69 |       await window.goto(fileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  70 |       const u = window.url().toLowerCase();
  71 |       expect(u, `فشل تحميل ${pageName}`).toContain(pageName.toLowerCase());
  72 |       await expect(window.locator('body')).toBeVisible({ timeout: 15000 });
  73 |     }
  74 |   } finally {
  75 |     await electronApp.close();
  76 |   }
  77 | });
  78 | 
```