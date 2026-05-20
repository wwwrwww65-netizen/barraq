/**
 * nav-fast.js — مُعطَّل (كان يسبب فقدان CSS على صفحات فيها تنسيقات مضمّنة
 * مثل سجلات الإقفال وهنقرستيشن). التنقّل يعود للوضع العادي عبر تحميل كامل للصفحة.
 */
(function initMcNavFastDisabled() {
    if (typeof window !== 'undefined') {
        window.__mcNavFastReady = true;
        window.mcNavigateFast = function () {
            return false;
        };
        window.mcClearNavPageCache = function () {};
    }
})();
