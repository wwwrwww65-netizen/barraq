# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: electron-smoke.spec.js >> تشغيل التطبيق وعرض صفحة الدخول
- Location: tests\e2e\electron-smoke.spec.js:12:1

# Error details

```
Error: electron.launch: WebSocket error: read ECONNRESET
Call log:
  - <launching> "E:\baraaq\node_modules\electron\dist\electron.exe" "-r" "E:\baraaq\node_modules\playwright-core\lib\server\electron\loader.js" "--inspect=0" "--remote-debugging-port=0" "."
  - <launched> pid=14272
  - [pid=14272][out]
  - [pid=14272][err] Debugger listening on ws://127.0.0.1:64361/db9c41f2-ecd6-4b61-89a7-29fc4dd186c1
  - [pid=14272][err] For help, see: https://nodejs.org/en/docs/inspector
  - <ws connecting> ws://127.0.0.1:64361/db9c41f2-ecd6-4b61-89a7-29fc4dd186c1
  - <ws connected> ws://127.0.0.1:64361/db9c41f2-ecd6-4b61-89a7-29fc4dd186c1
  - [pid=14272][err] Debugger attached.
  - [pid=14272][out] [MisterCasherPOS] ⚠️ Another instance is already running — focusing existing window.
  - [pid=14272][err]
  - [pid=14272][err] DevTools listening on ws://127.0.0.1:64363/devtools/browser/1b6cf932-44d4-4dfc-814a-7600eff52222
  - <ws connecting> ws://127.0.0.1:64363/devtools/browser/1b6cf932-44d4-4dfc-814a-7600eff52222
  - <ws disconnected> ws://127.0.0.1:64361/db9c41f2-ecd6-4b61-89a7-29fc4dd186c1 code=1005 reason=
  - <ws error> ws://127.0.0.1:64363/devtools/browser/1b6cf932-44d4-4dfc-814a-7600eff52222 error read ECONNRESET
  - <ws connect error> ws://127.0.0.1:64363/devtools/browser/1b6cf932-44d4-4dfc-814a-7600eff52222 read ECONNRESET
  - <ws disconnected> ws://127.0.0.1:64363/devtools/browser/1b6cf932-44d4-4dfc-814a-7600eff52222 code=1006 reason=
  - [pid=14272] <kill>
  - [pid=14272] <will force kill>
  - [pid=14272] taskkill stderr: ERROR: The process "14272" not found.
  - [pid=14272] <process did exit: exitCode=0, signal=null>
  - [pid=14272] starting temporary directories cleanup
  - [pid=14272] finished temporary directories cleanup

```

# Test source

```ts
  1  | /**
  2  |  * دخان E2E: تشغيل Electron وفتح النافذة الأولى (صفحة تسجيل الدخول)
  3  |  */
  4  | const { test, expect } = require('@playwright/test');
  5  | const { _electron: electron } = require('playwright');
  6  | const path = require('path');
  7  | 
  8  | const projectRoot = path.join(__dirname, '..', '..');
  9  | 
  10 | test.describe.configure({ mode: 'serial' });
  11 | 
  12 | test('تشغيل التطبيق وعرض صفحة الدخول', async () => {
  13 |   test.setTimeout(120000);
  14 | 
> 15 |   const electronApp = await electron.launch({
     |                       ^ Error: electron.launch: WebSocket error: read ECONNRESET
  16 |     cwd: projectRoot,
  17 |     args: ['.'],
  18 |   });
  19 | 
  20 |   try {
  21 |     const window = await electronApp.firstWindow();
  22 |     await window.waitForLoadState('domcontentloaded', { timeout: 60000 });
  23 |     const url = window.url();
  24 |     expect(url).toMatch(/login\.html/i);
  25 |     const form = window.locator('#loginForm, form#loginForm, form').first();
  26 |     await expect(form).toBeVisible({ timeout: 15000 });
  27 |   } finally {
  28 |     await electronApp.close();
  29 |   }
  30 | });
  31 | 
```