/**
 * دخان E2E: تشغيل Electron وفتح النافذة الأولى (صفحة تسجيل الدخول)
 */
const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const path = require('path');

const projectRoot = path.join(__dirname, '..', '..');

test.describe.configure({ mode: 'serial' });

test('تشغيل التطبيق وعرض صفحة الدخول', async () => {
  test.setTimeout(120000);

  const electronApp = await electron.launch({
    cwd: projectRoot,
    args: ['.'],
  });

  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded', { timeout: 60000 });
    const url = window.url();
    expect(url).toMatch(/login\.html/i);
    const form = window.locator('#loginForm, form#loginForm, form').first();
    await expect(form).toBeVisible({ timeout: 15000 });
  } finally {
    await electronApp.close();
  }
});
