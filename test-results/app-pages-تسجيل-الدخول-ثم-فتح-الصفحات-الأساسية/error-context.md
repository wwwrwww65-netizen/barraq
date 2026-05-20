# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: app-pages.spec.js >> تسجيل الدخول ثم فتح الصفحات الأساسية
- Location: tests\e2e\app-pages.spec.js:47:1

# Error details

```
Error: electron.launch: WebSocket error: read ECONNRESET
Call log:
  - <launching> "E:\baraaq\node_modules\electron\dist\electron.exe" "-r" "E:\baraaq\node_modules\playwright-core\lib\server\electron\loader.js" "--inspect=0" "--remote-debugging-port=0" "."
  - <launched> pid=9376
  - [pid=9376][out]
  - [pid=9376][err] Debugger listening on ws://127.0.0.1:64357/c9c88167-eaa2-46d9-adf1-5a4953625260
  - <ws connecting> ws://127.0.0.1:64357/c9c88167-eaa2-46d9-adf1-5a4953625260
  - [pid=9376][err] For help, see: https://nodejs.org/en/docs/inspector
  - [pid=9376][err] Debugger attached.
  - <ws connected> ws://127.0.0.1:64357/c9c88167-eaa2-46d9-adf1-5a4953625260
  - [pid=9376][out] [MisterCasherPOS] ⚠️ Another instance is already running — focusing existing window.
  - [pid=9376][err]
  - [pid=9376][err] DevTools listening on ws://127.0.0.1:64359/devtools/browser/a0f2d7af-1b58-4d19-ad52-563bc1268f58
  - <ws connecting> ws://127.0.0.1:64359/devtools/browser/a0f2d7af-1b58-4d19-ad52-563bc1268f58
  - <ws disconnected> ws://127.0.0.1:64357/c9c88167-eaa2-46d9-adf1-5a4953625260 code=1005 reason=
  - <ws error> ws://127.0.0.1:64359/devtools/browser/a0f2d7af-1b58-4d19-ad52-563bc1268f58 error read ECONNRESET
  - <ws connect error> ws://127.0.0.1:64359/devtools/browser/a0f2d7af-1b58-4d19-ad52-563bc1268f58 read ECONNRESET
  - <ws disconnected> ws://127.0.0.1:64359/devtools/browser/a0f2d7af-1b58-4d19-ad52-563bc1268f58 code=1006 reason=
  - [pid=9376] <kill>
  - [pid=9376] <will force kill>
  - [pid=9376] taskkill stderr: ERROR: The process "9376" not found.
  - [pid=9376] <process did exit: exitCode=0, signal=null>
  - [pid=9376] starting temporary directories cleanup
  - [pid=9376] finished temporary directories cleanup

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
  28 |   'kitchen.html',
  29 |   'kitchen-production.html',
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
> 50 |   const electronApp = await electron.launch({
     |                       ^ Error: electron.launch: WebSocket error: read ECONNRESET
  51 |     cwd: projectRoot,
  52 |     args: ['.'],
  53 |   });
  54 | 
  55 |   const window = await electronApp.firstWindow();
  56 | 
  57 |   try {
  58 |     await window.waitForLoadState('domcontentloaded', { timeout: 60000 });
  59 |     await window.fill('#username', 'admin');
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