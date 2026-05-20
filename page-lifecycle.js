/**
 * page-lifecycle.js — تنظيف الذاكرة عند مغادرة الشاشة
 */
(function initMcPageLifecycle() {
    if (typeof window === 'undefined' || window.__mcPageLifecycleReady) return;
    window.__mcPageLifecycleReady = true;

    const teardownFns = new Set();
    const intervalIds = new Set();
    const timeoutIds = new Set();

    window.mcRegisterPageTeardown = function (fn) {
        if (typeof fn === 'function') teardownFns.add(fn);
        return function unsub() {
            teardownFns.delete(fn);
        };
    };

    window.mcSetInterval = function (fn, ms) {
        const id = setInterval(fn, ms);
        intervalIds.add(id);
        return id;
    };

    window.mcSetTimeout = function (fn, ms) {
        const id = setTimeout(() => {
            timeoutIds.delete(id);
            fn();
        }, ms);
        timeoutIds.add(id);
        return id;
    };

    window.__mcRunPageTeardown = function () {
        teardownFns.forEach((fn) => {
            try {
                fn();
            } catch (e) {
                console.warn('[MC Lifecycle] teardown:', e && e.message);
            }
        });
        teardownFns.clear();

        intervalIds.forEach((id) => clearInterval(id));
        intervalIds.clear();
        timeoutIds.forEach((id) => clearTimeout(id));
        timeoutIds.clear();

        if (Array.isArray(window.__mcPageRefreshUnsubs)) {
            window.__mcPageRefreshUnsubs.forEach((u) => {
                try {
                    if (typeof u === 'function') u();
                } catch (_) {}
            });
            window.__mcPageRefreshUnsubs.length = 0;
        }

        if (window.dashboardChart && typeof window.dashboardChart.destroy === 'function') {
            try {
                window.dashboardChart.destroy();
            } catch (_) {}
            window.dashboardChart = null;
        }
    };

    window.addEventListener('pagehide', () => {
        window.__mcRunPageTeardown();
    });

    window.addEventListener('beforeunload', () => {
        window.__mcRunPageTeardown();
    });
})();
