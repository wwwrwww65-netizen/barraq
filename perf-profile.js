/**
 * perf-profile.js — ملف أداء موحّد لجميع الشاشات
 * يكتشف الأجهزة الضعيفة تلقائياً ويخفّف العمليات الثقيلة دون إلغاء الميزات.
 */
(function initMcPerfProfile() {
    if (typeof window !== 'undefined' && window.MC_PERF) return;

    const STORAGE_KEY = 'mc_perf_override'; // 'auto' | 'weak' | 'strong'

    function readOverride() {
        try {
            return localStorage.getItem(STORAGE_KEY) || 'auto';
        } catch (_) {
            return 'auto';
        }
    }

    function detectWeak() {
        const override = readOverride();
        if (override === 'weak') return true;
        if (override === 'strong') return false;

        const cores = Number(navigator.hardwareConcurrency) || 2;
        const memGb = Number(navigator.deviceMemory) || 0; // Chrome/Electron فقط
        if (cores <= 2) return true;
        if (memGb > 0 && memGb <= 4) return true;
        if (cores <= 4 && memGb > 0 && memGb <= 8) return true;
        return false;
    }

    const isWeak = detectWeak();

    function runWhenIdle(fn, timeoutMs) {
        const t = timeoutMs != null ? timeoutMs : (isWeak ? 120 : 40);
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(() => {
                try {
                    fn();
                } catch (e) {
                    console.warn('[MC_PERF] idle task:', e);
                }
            }, { timeout: t });
        } else {
            setTimeout(() => {
                try {
                    fn();
                } catch (e) {
                    console.warn('[MC_PERF] deferred task:', e);
                }
            }, isWeak ? 16 : 0);
        }
    }

    function getVoucherCaptureScale() {
        if (isWeak) return 1;
        const cores = Number(navigator.hardwareConcurrency) || 2;
        const mem = Number(navigator.deviceMemory) || 0;
        if (cores <= 2 || (mem > 0 && mem <= 2)) return 1.25;
        if (cores <= 4 || (mem > 0 && mem <= 4)) return 1.5;
        return 2;
    }

    function getInventoryCheckMs() {
        return isWeak ? 120000 : 45000;
    }

    function getDbRefreshDebounceMs() {
        return isWeak ? 900 : 200;
    }

    function shouldRunSalesAutoFixThisSession() {
        try {
            return !sessionStorage.getItem('mc_sales_split_fix_done');
        } catch (_) {
            return true;
        }
    }

    function markSalesAutoFixDone() {
        try {
            sessionStorage.setItem('mc_sales_split_fix_done', '1');
        } catch (_) {}
    }

    const profile = {
        isWeak,
        readOverride,
        runWhenIdle,
        getVoucherCaptureScale,
        getInventoryCheckMs,
        getDbRefreshDebounceMs,
        shouldRunSalesAutoFixThisSession,
        markSalesAutoFixDone,
        setOverride(mode) {
            const m = mode === 'weak' || mode === 'strong' || mode === 'auto' ? mode : 'auto';
            try {
                localStorage.setItem(STORAGE_KEY, m);
            } catch (_) {}
            try {
                const { ipcRenderer } = require('electron');
                ipcRenderer.invoke('mc-save-perf-override', m).finally(() => {
                    window.location.reload();
                });
            } catch (_) {
                window.location.reload();
            }
        },
    };

    if (typeof window !== 'undefined') {
        window.MC_PERF = profile;
        try {
            const mode = readOverride();
            if (mode !== 'auto') {
                const { ipcRenderer } = require('electron');
                ipcRenderer.invoke('mc-save-perf-override', mode).catch(() => {});
            }
        } catch (_) {}
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = profile;
    }
})();
