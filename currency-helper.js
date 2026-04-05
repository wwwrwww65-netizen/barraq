/**
 * عملة النظام — تُقرأ من localStorage.restaurant_settings
 * تُحمَّل قبل script.js في صفحات HTML.
 */
(function (global) {
  'use strict';

  const PRESETS = {
    SAR: { code: 'SAR', symbol: 'ر.س', label: 'ريال سعودي', localeNum: 'en-US' },
    USD: { code: 'USD', symbol: '$', label: 'دولار أمريكي', localeNum: 'en-US' },
    EUR: { code: 'EUR', symbol: '€', label: 'يورو', localeNum: 'en-US' },
    YER: { code: 'YER', symbol: 'ر.ي', label: 'ريال يمني', localeNum: 'en-US' },
  };

  function readSettingsObj() {
    try {
      const raw = global.localStorage && global.localStorage.getItem('restaurant_settings');
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function getConfig() {
    const d = readSettingsObj();
    const preset = String(d.currencyPreset || 'SAR').toUpperCase();
    if (preset === 'CUSTOM') {
      const sym = String(d.currencySymbol || '').trim() || 'ر.س';
      const label = String(d.currencyLabel || '').trim() || sym;
      const loc = String(d.currencyLocale || 'ar-SA').trim() || 'ar-SA';
      return { code: 'CUSTOM', symbol: sym, label, localeNum: loc };
    }
    const p = PRESETS[preset] || PRESETS.SAR;
    return { ...p };
  }

  function formatNumber(n) {
    const c = getConfig();
    const num = Number(n);
    const x = Number.isFinite(num) ? num : 0;
    return x.toLocaleString(c.localeNum, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function format(n) {
    return formatNumber(n) + ' ' + getConfig().symbol;
  }

  /** استخراج رقم من نص معروض (يعمل مع أي رمز عملة) */
  function parseLoose(text) {
    if (text == null) return NaN;
    const s = String(text).replace(/\s+/g, ' ');
    const m = s.match(/-?\d+(?:[.,]\d+)?/);
    if (!m) return NaN;
    let t = m[0].replace(',', '.');
    if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
    return parseFloat(t);
  }

  function applySymToDom() {
    try {
      if (!global.document || !global.document.querySelectorAll) return;
      const sym = getConfig().symbol;
      const lab = getConfig().label;
      global.document.querySelectorAll('.js-cur-sym').forEach((el) => {
        el.textContent = sym;
      });
      global.document.querySelectorAll('.js-cur-label').forEach((el) => {
        el.textContent = lab;
      });
    } catch (_) {}
  }

  global.HashCurrency = {
    PRESETS,
    getConfig,
    formatNumber,
    format,
    parseLoose,
    applySymToDom,
  };
})(typeof window !== 'undefined' ? window : globalThis);
