# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: electron-smoke.spec.js >> تشغيل التطبيق وعرض صفحة الدخول
- Location: tests/e2e/electron-smoke.spec.js:12:1

# Error details

```
Error: expect(received).toMatch(expected)

Expected pattern: /login\.html/i
Received string:  "file:///app/setup.html"
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
  15 |   const electronApp = await electron.launch({
  16 |     cwd: projectRoot,
  17 |     args: ['.'],
  18 |   });
  19 | 
  20 |   try {
  21 |     const window = await electronApp.firstWindow();
  22 |     await window.waitForLoadState('domcontentloaded', { timeout: 60000 });
  23 |     const url = window.url();
> 24 |     expect(url).toMatch(/login\.html/i);
     |                 ^ Error: expect(received).toMatch(expected)
  25 |     const form = window.locator('#loginForm, form#loginForm, form').first();
  26 |     await expect(form).toBeVisible({ timeout: 15000 });
  27 |   } finally {
  28 |     await electronApp.close();
  29 |   }
  30 | });
  31 | 
```