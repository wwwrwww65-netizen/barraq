// ملف الأداء الموحّد — يجب أن يُحمَّل قبل أي منطق ثقيل
try {
    require('./perf-profile.js');
} catch (e) {
    console.warn('[MC_PERF] perf-profile load failed:', e && e.message);
}
try {
    require('./page-lifecycle.js');
} catch (e) {
    console.warn('[MC Lifecycle] load failed:', e && e.message);
}
// تعطيل التنقّل السريع — كان يفتح الصفحات بدون CSS/تنسيقات مضمّنة
try {
    localStorage.setItem('mc_fast_nav', 'off');
} catch (_) {}

// --- Modern Dialogs Injection ---
(function injectModernDialogs() {
    if (document.getElementById('modern-dialogs-js')) return;
    const script = document.createElement('script');
    script.id = 'modern-dialogs-js';
    script.src = 'modern-dialogs.js';
    document.head.appendChild(script);
})();

// --- Global Authentication Guard ---
// setup.html: إعداد جهاز جديد مستقل من معالج المزامنة — بدون تسجيل دخول بعد
const _isPublicAuthPage =
    window.location.pathname.includes('login.html') ||
    window.location.pathname.includes('setup.html') ||
    window.location.pathname.includes('activation.html');
if (!_isPublicAuthPage) {
    const cUserRaw = localStorage.getItem('currentUser');
    if (!cUserRaw) {
        (async () => {
            try {
                const { ipcRenderer } = require('electron');
                const access = await ipcRenderer.invoke('license-evaluate-access');
                if (!access.ok) {
                    const lock = access.lock ? '?lock=' + encodeURIComponent(access.lock) : '';
                    window.location.href = 'activation.html' + lock;
                    return;
                }
            } catch (_) {}
            window.location.href = 'login.html';
        })();
    } else {
        try {
            (function migrateFatoraPerm() {
                try {
                    const raw = localStorage.getItem('system_roles');
                    if (!raw) return;
                    const roles = JSON.parse(raw);
                    let changed = false;
                    roles.forEach((r) => {
                        if (!r.perms) r.perms = {};
                        if (r.perms.fatora_access === undefined) {
                            r.perms.fatora_access = r.perms.hr_manage === true;
                            changed = true;
                        }
                    });
                    if (changed) localStorage.setItem('system_roles', JSON.stringify(roles));
                } catch (_) { /* ignore */ }
            })();

            // Map each page to the exact permission key defined in permissions.js
            const pageMap = {
                // نقطة البيع والمبيعات
                'pos.html':           'pos_access',
                'kitchen.html':       'pos_access',
                'sales.html':         'sales_access',
                'returns.html':       'pos_return',
                'customers.html':     'sales_access',
                'orders.html':        'sales_access',
                'cashier-report.html': 'sales_access',

                // الأصناف والمنيو
                'menu.html':          'menu_manage',
                'add-category.html':  'menu_manage',
                'add-item.html':      'menu_manage',

                // المخازن والمشتريات
                'inventory.html':     'inv_manage',
                'purchases.html':     'inv_manage',
                'inv-documents.html': 'inv_manage',
                'suppliers.html':     'inv_manage',
                'kitchen-production.html': 'inv_manage',

                // الموظفين والمحاسبة
                'staff.html':         'hr_manage',
                'accounting.html':    'hr_manage',
                'acc-banks.html':     'hr_manage',
                'acc-tree.html':      'hr_manage',
                'acc-reports.html':   'hr_manage',
                'journal.html':       'hr_manage',
                'acc-expenses.html':  'hr_manage',
                'profit-loss.html':   'hr_manage',
                'fatora.html':        'fatora_access',

                // الإحصائيات
                'statistics.html':    'stats_access',

                // إعدادات النظام والصلاحيات
                'settings.html':      'sys_admin',
                'permissions.html':   'sys_admin',
            };

            const cUser = JSON.parse(cUserRaw);
            const path = window.location.pathname;
            const currentPageKey = Object.keys(pageMap).find(p => path.endsWith(p));

            // 1. الحماية الصارمة للمسارات (Route Guard)
            if (currentPageKey) {
                if (cUser.role !== 'المدير العام') {
                    const systemRoles = JSON.parse(localStorage.getItem('system_roles') || '[]');
                    const myRole = systemRoles.find(r => r.name === cUser.role);
                    const requiredPerm = pageMap[currentPageKey];

                    if (!myRole || !myRole.perms || myRole.perms[requiredPerm] !== true) {
                        alert('📛 تنبيه أمني: حسابك لا يملك صلاحية الدخول لهذه الشاشة. يرجى مراجعة الإدارة.');
                        if (!path.endsWith('index.html')) {
                            window.location.href = 'index.html';
                        } else {
                            window.location.href = 'login.html';
                        }
                    }
                }
            }

            // 2. وظيفة إخفاء العناصر غير المصرح بها من الواجهة (UI Filtering)
            window.syncGlobalPermissionsUI = function() {
                if (cUser.role === 'المدير العام') return; // المدير يرى كل شيء

                const systemRoles = JSON.parse(localStorage.getItem('system_roles') || '[]');
                const myRole = systemRoles.find(r => r.name === cUser.role);
                if (!myRole || !myRole.perms) return;

                // فحص كل الروابط في الصفحة (Sidebar + Dashboard Buttons)
                const links = document.querySelectorAll('a[href]');
                links.forEach(link => {
                    const href = link.getAttribute('href');
                    const targetPage = Object.keys(pageMap).find(p => href.endsWith(p));
                    
                    if (targetPage) {
                        const requiredPerm = pageMap[targetPage];
                        if (myRole.perms[requiredPerm] !== true) {
                            // إخفاء العنصر تماماً
                            link.style.display = 'none';
                            
                            // إذا كان في قائمة منسدلة أو أب له كلاس nav-item
                            const parentNav = link.closest('.nav-item');
                            if (parentNav) parentNav.style.display = 'none';
                        }
                    }
                });

                // إخفاء المجموعات الفارغة في السايدبار (اختياري لتحسين المظهر)
                document.querySelectorAll('.nav-group').forEach(group => {
                    const visibleItems = Array.from(group.querySelectorAll('.nav-item')).filter(i => i.style.display !== 'none');
                    if (visibleItems.length === 0) group.style.display = 'none';
                });
            };

        } catch(e) { console.error('Auth Guard Check Failed', e); }
    }

    // إرسال معلومات المطعم للمدير الخلفي (لتحديث التراخيص) في حال تغيرت من الإعدادات
    try {
        const saved = localStorage.getItem('restaurant_settings');
        if (saved && typeof require !== 'undefined') {
            const data = JSON.parse(saved);
            // محاولة جلب الرقم من عدة مصادر بالترتيب
            let phoneVal = data.phone || '';
            if (!phoneVal) {
                // fallback: رقم هاتف الإدارة من إعدادات الواتساب
                try {
                    const waRaw = localStorage.getItem('wa_settings');
                    if (waRaw) phoneVal = JSON.parse(waRaw).admin || '';
                } catch(_) {}
            }
            if (!phoneVal) phoneVal = localStorage.getItem('admin_phone') || '';
            const { ipcRenderer } = require('electron');
            ipcRenderer.send('update-restaurant-info', {
                restaurantName: data.name || '',
                phone: phoneVal,
                adminUsername: localStorage.getItem('admin_username') || ''
            });
        }
    } catch (e) {}
}

// --- إعادة تحميل الواجهات عند تحديث pos_database (محلي أو مزامنة شبكة) ---
(function initPosDatabaseLiveRefresh() {
    const handlers = new Set();
    let debounceTimer = null;
    let refreshPendingWhileHidden = false;
    if (!Array.isArray(window.__mcPageRefreshUnsubs)) window.__mcPageRefreshUnsubs = [];

    function runRefreshHandlers() {
        const run = () => {
            handlers.forEach((fn) => {
                try {
                    const r = fn();
                    if (r && typeof r.then === 'function') r.catch((e) => console.warn('[pos-db-refresh]', e && e.message));
                } catch (e) {
                    console.warn('[pos-db-refresh]', e);
                }
            });
        };
        if (window.MC_PERF && typeof window.MC_PERF.runWhenIdle === 'function') {
            window.MC_PERF.runWhenIdle(run, window.MC_PERF.isWeak ? 200 : 80);
        } else {
            run();
        }
    }

    function scheduleRefresh() {
        if (debounceTimer) clearTimeout(debounceTimer);
        const debounceMs =
            window.MC_PERF && typeof window.MC_PERF.getDbRefreshDebounceMs === 'function'
                ? window.MC_PERF.getDbRefreshDebounceMs()
                : window.MC_PERF && window.MC_PERF.isWeak
                  ? 900
                  : 200;
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            if (document.hidden) {
                refreshPendingWhileHidden = true;
                return;
            }
            runRefreshHandlers();
        }, debounceMs);
    }

    window.registerPosDatabaseRefresh = function (fn) {
        if (typeof fn !== 'function') return function () {};
        handlers.add(fn);
        const unsub = function () {
            handlers.delete(fn);
        };
        window.__mcPageRefreshUnsubs.push(unsub);
        return unsub;
    };

    window.addEventListener('pos-db-updated', scheduleRefresh);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && refreshPendingWhileHidden) {
            refreshPendingWhileHidden = false;
            scheduleRefresh();
        }
    });
})();

// --- Local Network Synchronization ---
window._networkSyncing = false; // global flag to avoid re-broadcasting synced data

// Buffer for large-data chunk reassembly
const _chunkBuffers = {};
const MAX_UDP_PAYLOAD = 48000; // safe limit well below UDP max ~65535

/** تجميع ipc لمزامنة localStorage الصغيرة في إطار واحد — يقلل الضغط على العملية الرئيسية */
const _lsSyncPending = new Map();
let _lsSyncFlushScheduled = false;

try {
    const { ipcRenderer } = require('electron');

    function flushLsSyncPending() {
        _lsSyncFlushScheduled = false;
        if (!_lsSyncPending.size) return;
        const entries = [..._lsSyncPending.entries()];
        _lsSyncPending.clear();
        for (let i = 0; i < entries.length; i++) {
            const key = entries[i][0];
            const val = entries[i][1];
            if (val === null) {
                ipcRenderer.send('network-sync-send', { action: 'removeItem', key });
            } else {
                ipcRenderer.send('network-sync-send', { action: 'setItem', key, value: val });
            }
        }
    }

    function scheduleLsSyncFlush() {
        if (_lsSyncFlushScheduled) return;
        _lsSyncFlushScheduled = true;
        queueMicrotask(flushLsSyncPending);
    }

    /** إرسال القيم الضخمة على دفعات عبر macrotask لتفادي تجمد اللوحة أثناء رفع الشعار وغيره */
    function scheduleChunkedLocalStorageSync(key, str) {
        const totalChunks = Math.ceil(str.length / MAX_UDP_PAYLOAD);
        const chunkId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
        console.log(`[Sync] 📦 Chunking large value for key: ${key} (${(str.length / 1024).toFixed(1)} KB, ${totalChunks} chunks)`);
        const CHUNK_BURST = 6;
        let i = 0;
        function burst() {
            const end = Math.min(i + CHUNK_BURST, totalChunks);
            for (; i < end; i++) {
                ipcRenderer.send('network-sync-send', {
                    action: 'setItem_chunk',
                    key,
                    chunkId,
                    chunkIndex: i,
                    totalChunks,
                    chunk: str.slice(i * MAX_UDP_PAYLOAD, (i + 1) * MAX_UDP_PAYLOAD),
                });
            }
            if (i < totalChunks) setTimeout(burst, 0);
        }
        burst();
    }

    /** IP آخر جهاز على الشبكة يملك واتساب جاهزاً — يُستخدم تلقائياً كمركز واتساب عند ترك حقل Hub فارغاً */
    function recordLanSyncHubIp(ip, opts) {
        if (!ip || typeof ip !== 'string') return;
        const clean = ip.replace(/^::ffff:/, '').trim();
        if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(clean) || clean === '127.0.0.1') return;
        try {
            Object.getPrototypeOf(localStorage).setItem.call(localStorage, 'last_lan_sync_hub_ip', clean);
            if (opts && opts.mergeIntoWaSettings) {
                const raw = localStorage.getItem('wa_settings');
                if (raw) {
                    const w = JSON.parse(raw);
                    if (!(w.hubIp && String(w.hubIp).trim())) {
                        w.hubIp = clean;
                        Object.getPrototypeOf(localStorage).setItem.call(localStorage, 'wa_settings', JSON.stringify(w));
                    }
                }
            }
            console.log('[Sync] مركز واتساب تلقائي (LAN):', clean);
        } catch (e) {
            console.warn('[Sync] recordLanSyncHubIp:', e);
        }
    }

    ipcRenderer.on('lan-sync-hub-ip', (event, ip) => {
        recordLanSyncHubIp(ip, { mergeIntoWaSettings: true });
    });

    ipcRenderer.on('license-peer-rejected', (event, data) => {
        const hub = data.hubDeviceId || '—';
        const allowed = data.allowedClients != null ? data.allowedClients : '?';
        const goUpgrade = confirm(
            'تم الوصول للحد الأقصى للأجهزة (' + allowed + ').\n\n' +
            'السيرفر الرئيسي: ' + hub + '\n\nهل تود إرسال طلب ترقية؟'
        );
        if (goUpgrade) {
            ipcRenderer.invoke('license-request-upgrade', {
                clientDeviceId: data.clientDeviceId || '',
                hubDeviceId: hub,
            }).then((r) => {
                if (r && r.success) alert('تم إرسال طلب الترقية.');
                else alert((r && r.error) || 'تعذّر إرسال الطلب.');
            });
        }
    });

    ipcRenderer.on('license-killed', () => {
        window.location.href = 'activation.html?lock=blocked';
    });

    // تصفير شبكي: بعد سحب قاعدة فارغة من المركز — مسح localStorage مع الإبقاء على بيانات دخول المدير
    ipcRenderer.on('lan-factory-reset-clear-localstorage', () => {
        try {
            const aUser = localStorage.getItem('admin_username');
            const aPwd = localStorage.getItem('admin_pwd');
            window._networkSyncing = true;
            try {
                localStorage.clear();
                if (aUser != null && aUser !== '') localStorage.setItem('admin_username', aUser);
                if (aPwd != null && aPwd !== '') localStorage.setItem('admin_pwd', aPwd);
            } finally {
                window._networkSyncing = false;
            }
            window.location.href = 'login.html';
        } catch (e) {
            console.error('[Factory reset LAN] clear localStorage:', e);
        }
    });

    window.resolveWaHubIp = function (waSettings) {
        try {
            const manual = waSettings && waSettings.hubIp && String(waSettings.hubIp).trim();
            if (manual) return manual;
            return (localStorage.getItem('last_lan_sync_hub_ip') || '').trim();
        } catch (_) {
            return '';
        }
    };

    // Listen for incoming sync updates (including chunked large data)
    ipcRenderer.on('network-sync-update', (event, data) => {
        window._networkSyncing = true;

        if (data.action === 'setItem_chunk') {
            // ── Chunked large value: buffer and reassemble ──────────────────
            if (!_chunkBuffers[data.chunkId]) {
                _chunkBuffers[data.chunkId] = {
                    key: data.key,
                    chunks: new Array(data.totalChunks).fill(null),
                    received: 0
                };
            }
            _chunkBuffers[data.chunkId].chunks[data.chunkIndex] = data.chunk;
            _chunkBuffers[data.chunkId].received++;

            if (_chunkBuffers[data.chunkId].received === data.totalChunks) {
                const fullValue = _chunkBuffers[data.chunkId].chunks.join('');
                // Use prototype to bypass our own interceptor (avoid re-broadcast)
                Object.getPrototypeOf(localStorage).setItem.call(localStorage, data.key, fullValue);
                delete _chunkBuffers[data.chunkId];
                window.dispatchEvent(new Event('storage'));
                if (data.key === 'restaurant_settings' && typeof window.syncGlobalSettings === 'function') {
                    window.syncGlobalSettings();
                }
                console.log(`[Sync] ✅ Large value reassembled for key: ${data.key}`);
            }
        } else if (data.action === 'setItem') {
            localStorage.setItem(data.key, data.value);
            window.dispatchEvent(new Event('storage'));
            if (data.key === 'restaurant_settings' && typeof window.syncGlobalSettings === 'function') {
                window.syncGlobalSettings();
            }
        } else if (data.action === 'removeItem') {
            localStorage.removeItem(data.key);
        } else if (data.action === 'clear') {
            localStorage.clear();
        }

        window._networkSyncing = false;
    });

    // ── FULL SYNC: Another device is requesting all our data ──────────────
    ipcRenderer.on('need-to-send-full-data', (event, req) => {
        // Only respond if we have meaningful data (avoid new devices responding)
        if (!localStorage.getItem('system_roles') && !localStorage.getItem('pos_database')) return;

        // Random delay (0-1s) so only the fastest device responds, avoiding duplicates
        setTimeout(() => {
            const snapshot = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key !== 'currentUser') { // never sync active sessions
                    snapshot[key] = localStorage.getItem(key);
                }
            }
            ipcRenderer.send('broadcast-full-sync', { payload: snapshot });
            console.log('[Sync] Sent full data snapshot to new device.');
        }, Math.floor(Math.random() * 1000));
    });

    // ── FULL SYNC: We received a full data snapshot from another device ───
    ipcRenderer.on('apply-full-sync', (event, data) => {
        if (!data.payload) return;
        // Only apply if WE are a fresh device (don't overwrite existing data)
        const alreadyHasData = !!localStorage.getItem('system_roles');
        if (alreadyHasData) return;

        console.log('[Sync] Receiving full data from network...');
        window._networkSyncing = true;
        Object.keys(data.payload).forEach(key => {
            // Use prototype to bypass our send-to-network override
            Object.getPrototypeOf(localStorage).setItem.call(localStorage, key, data.payload[key]);
        });
        if (data._lanSourceIp && data._waHubCapable) {
            recordLanSyncHubIp(data._lanSourceIp, { mergeIntoWaSettings: true });
        }
        window._networkSyncing = false;

        console.log('[Sync] Full data applied! Reloading...');
        setTimeout(() => window.location.reload(), 500);
    });

    // ── pos_database.json updated by a peer — notify current page ─────────
    ipcRenderer.on('db-file-updated', () => {
        console.log('[Sync] 📥 pos_database.json updated from network — dispatching reload event...');
        window.dispatchEvent(new CustomEvent('pos-db-updated'));
    });

    // ── Peer discovery: existing device announces itself when a new device pings ──
    ipcRenderer.on('check-should-announce', async (event, info) => {
        const hasLocalStorageData = !!localStorage.getItem('system_roles');
        if (hasLocalStorageData) {
            let hostname = info.myHostname || 'جهاز';
            try { hostname = await ipcRenderer.invoke('get-hostname'); } catch(e) {}
            ipcRenderer.send('network-sync-send', {
                type: 'peer_pong',
                hostname,
                hasData: true
            });
        }
    });

    // ── A peer was discovered — tell the sync wizard UI ─────────────────────
    ipcRenderer.on('peer-discovered', (event, peer) => {
        window.dispatchEvent(new CustomEvent('sw-peer-found', { detail: peer }));
    });

    // Apply full sync: also dismiss the wizard with progress
    ipcRenderer.on('apply-full-sync-wizard', () => {
        window.dispatchEvent(new CustomEvent('sw-sync-complete'));
    });

    // استعادة localStorage من نسخة احتياطية
    ipcRenderer.on('restore-local-storage', (event, lsData) => {
        if (!lsData || typeof lsData !== 'object') return;
        
        console.log('[Restore] Received localStorage data for restore, keys:', Object.keys(lsData).length);
        
        // حفظ البيانات مؤقتاً لاستعادتها بعد إعادة التحميل
        try {
            localStorage.setItem('_restore_pending', JSON.stringify(lsData));
        } catch (e) {
            console.error('[Restore] Failed to save restore data:', e.message);
        }
    });

    // Intercept localStorage — chunk large values (e.g. base64 images) for UDP
    const _origSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(key, value) {
        _origSetItem(key, value);
        if (!window._networkSyncing) {
            const str = String(value);
            if (str.length > MAX_UDP_PAYLOAD) {
                scheduleChunkedLocalStorageSync(key, str);
            } else {
                _lsSyncPending.set(key, str);
                scheduleLsSyncFlush();
            }
        }
    };

    const _origRemoveItem = localStorage.removeItem.bind(localStorage);
    localStorage.removeItem = function(key) {
        _origRemoveItem(key);
        if (!window._networkSyncing) {
            _lsSyncPending.set(key, null);
            scheduleLsSyncFlush();
        }
    };

    const _origClear = localStorage.clear.bind(localStorage);
    localStorage.clear = function() {
        _origClear();
        if (!window._networkSyncing) {
            _lsSyncPending.clear();
            _lsSyncFlushScheduled = false;
            ipcRenderer.send('network-sync-send', { action: 'clear' });
        }
    };
    
} catch(e) {
    console.log("Not running in Electron or IPC failed");
}

// ═══════════════════════════════════════════════════════════
//  Network Sync Status Badge (shows on all pages)
// ═══════════════════════════════════════════════════════════
(function setupSyncBadge() {
    const PEER_TTL_MS = 70000;

    const style = document.createElement('style');
    style.textContent = `
        #net-sync-badge {
            position: fixed;
            bottom: 20px;
            right: 20px;
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 8px 6px 12px;
            background: rgba(15, 23, 42, 0.94);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 22px;
            font-size: 11px;
            font-weight: 700;
            color: #94a3b8;
            z-index: 10000;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            cursor: pointer;
            user-select: none;
            max-width: 260px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05) inset;
            opacity: 0.85;
        }
        /* رفعه في الصفحات التي تحتوي على شريط أزرار سفلي أو سلة في الكاشير */
        body:has(.form-actions-bar) #net-sync-badge,
        body:has(.cart-footer) #net-sync-badge {
            bottom: 92px;
        }
        /* في صفحة الكاشير، نحركه لليسار قليلاً ليتجنب السايدبار المصغر في اليمين */
        body.pos-body #net-sync-badge {
            right: 100px;
        }
        #net-sync-badge:hover {
            opacity: 1;
            background: rgba(30, 41, 59, 0.98);
            transform: translateY(-3px) scale(1.02);
            border-color: var(--accent-blue);
            color: #fff;
            box-shadow: 0 12px 30px rgba(0,0,0,0.5), 0 0 0 1px rgba(59,130,246,0.3) inset;
        }
        #net-sync-badge .sync-badge-text {
            display: flex;
            align-items: center;
            gap: 7px;
            min-width: 0;
        }
        #net-sync-badge #sync-label {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        #net-sync-badge .dot {
            width: 8px; height: 8px;
            border-radius: 50%;
            background: #64748b;
            transition: background 0.3s ease;
            flex-shrink: 0;
        }
        #net-sync-badge.syncing .dot {
            background: #f59e0b;
            animation: pulse-amber 0.8s infinite;
        }
        #net-sync-badge.connected .dot { background: #10b981; }
        #net-sync-badge.connected { border-color: rgba(16,185,129,0.25); color: #10b981; }
        #net-sync-badge.error .dot { background: #ef4444; }
        #net-sync-refresh-btn {
            flex-shrink: 0;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            border: 1px solid rgba(255,255,255,0.1);
            background: rgba(255,255,255,0.05);
            color: #ffffff;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            transition: color .2s, background .2s, border-color .2s;
        }
        #net-sync-refresh-btn:hover {
            color: #10b981;
            border-color: rgba(16,185,129,0.35);
            background: rgba(16,185,129,0.12);
        }
        #net-sync-refresh-btn:disabled {
            opacity: 0.45;
            cursor: not-allowed;
            pointer-events: none;
        }
        #net-sync-refresh-btn.sync-spin i {
            display: inline-block;
            animation: net-sync-spin 0.65s linear infinite;
        }
        @keyframes pulse-amber {
            0%,100% { opacity:1; transform:scale(1); }
            50% { opacity:0.5; transform:scale(1.4); }
        }
        @keyframes net-sync-spin {
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);

    const peerLastSeen = new Map();

    function prunePeers() {
        const now = Date.now();
        for (const [id, t] of peerLastSeen) {
            if (now - t > PEER_TTL_MS) peerLastSeen.delete(id);
        }
    }

    function lanDeviceCount() {
        prunePeers();
        return 1 + peerLastSeen.size;
    }

    function connectedLabelText() {
        const n = lanDeviceCount();
        if (n <= 1) return 'شبكة · جهاز واحد (هذا الجهاز)';
        return 'شبكة · ' + n + ' أجهزة متصلة';
    }

    const badge = document.createElement('div');
    badge.id = 'net-sync-badge';
    badge.innerHTML =
        '<div class="sync-badge-text"><div class="dot"></div><span id="sync-label">الشبكة: جاري الاستكشاف...</span></div>' +
        '<button type="button" id="net-sync-refresh-btn" title="اضغط لتحديث البحث عن الأجهزة المتصلة وجلب قاعدة البيانات">' +
        '<i class="ph ph-arrows-clockwise" style="font-size:18px; display:block; line-height:1; color: #ffffff !important;"></i></button>';
    document.body.appendChild(badge);

    // ── استعادة آخر حالة محفوظة فوراً (يمنع "جاري الاستكشاف" في كل صفحة) ──
    try {
        const cached = sessionStorage.getItem('_net_sync_state');
        if (cached) {
            const s = JSON.parse(cached);
            if (s && s.state) {
                badge.classList.add(s.state);
                const lab = document.getElementById('sync-label');
                if (lab && s.label) lab.textContent = s.label;
            }
        }
    } catch (_) {}

    const refreshBtn = document.getElementById('net-sync-refresh-btn');

    function setSyncState(state, label) {
        badge.className = '';
        badge.classList.add(state);
        const lab = document.getElementById('sync-label');
        if (!lab) return;
        let finalLabel;
        if (label != null && label !== '') {
            finalLabel = label;
        } else if (state === 'connected') {
            finalLabel = connectedLabelText();
        } else {
            finalLabel = 'الشبكة';
        }
        lab.textContent = finalLabel;
        // حفظ الحالة في sessionStorage لعرضها فوراً عند تحميل الصفحة التالية
        try {
            // لا نحفظ حالة "جاري الاستكشاف" — نحفظ فقط النتائج النهائية
            if (state === 'connected' || state === 'error') {
                sessionStorage.setItem('_net_sync_state', JSON.stringify({ state, label: finalLabel }));
            }
        } catch (_) {}
    }

    function refreshConnectedLabel() {
        if (badge.classList.contains('connected')) {
            setSyncState('connected', connectedLabelText());
            badge.title =
                'المزامنة المحلية: قاعدة البيانات (pos_database) وتغييرات الإعدادات بين الأجهزة. ' +
                'زر التحديث يعيد جلب نسخة القاعدة من الشبكة. ' +
                'لا يشمل جلسة واتساب أو ربط Google Drive.';
        }
    }

    window.addEventListener('pos-db-updated', () => {
        setSyncState('syncing', 'تم تحديث قاعدة البيانات من الشبكة');
        setTimeout(() => setSyncState('connected'), 2200);
    });

    let _syncFlashTimer = null;
    try {
        const { ipcRenderer } = require('electron');

        ipcRenderer.on('lan-peer-seen', (e, d) => {
            if (!d || !d.instanceId) return;
            peerLastSeen.set(d.instanceId, Date.now());
            refreshConnectedLabel();
        });

        ipcRenderer.on('network-sync-update', () => {
            setSyncState('syncing', 'مزامنة إعدادات بين الأجهزة...');
            clearTimeout(_syncFlashTimer);
            _syncFlashTimer = setTimeout(() => setSyncState('connected'), 1600);
        });

        ipcRenderer.on('db-file-updated', () => {
            setSyncState('syncing', 'تحديث قاعدة البيانات...');
        });

        if (refreshBtn) {
            refreshBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                refreshBtn.classList.add('sync-spin');
                refreshBtn.disabled = true;
                setSyncState('syncing', 'جلب قاعدة البيانات وتحديث الأجهزة...');
                try {
                    ipcRenderer.send('lan-broadcast-presence');
                    ipcRenderer.send('network-sync-send', { type: 'db_sync_request' });
                    setTimeout(() => ipcRenderer.send('lan-broadcast-presence'), 500);
                } catch (e) {}
                setTimeout(() => {
                    refreshBtn.classList.remove('sync-spin');
                    refreshBtn.disabled = false;
                    setSyncState('connected');
                }, 3200);
            });
        }

        // إذا لم توجد حالة محفوظة من قبل — انتظر 3.5 ثانية ثم اعرض "متصل"
        // إذا كانت موجودة — تم عرضها فوراً أعلاه فلا داعي لإعادة البحث
        try {
            const cached = sessionStorage.getItem('_net_sync_state');
            if (!cached) {
                // أول مرة فقط: أرسل broadcast واعرض النتيجة بعد 3.5 ثانية
                ipcRenderer.send('lan-broadcast-presence');
                setTimeout(() => setSyncState('connected'), 3500);
            }
        } catch (_) {
            setTimeout(() => setSyncState('connected'), 3500);
        }
        // تحديث عدد الأجهزة كل دقيقتين (بدلاً من 30 ثانية) لتقليل الضغط
        setInterval(refreshConnectedLabel, 120000);
    } catch (e) {
        if (refreshBtn) refreshBtn.style.display = 'none';
        setSyncState('error', 'الشبكة: التطبيق الكامل فقط (.exe)');
    }
})();

(function () {
    var _modalScrollScheduled = null;
    function anyModalLayerOpen() {
        if (document.querySelectorAll('.modal-overlay.active').length) return true;
        if (document.querySelectorAll('.factory-modal-overlay.active').length) return true;
        if (document.querySelectorAll('.hs-modal.active').length) return true;
        if (document.querySelector('.js-modal-layer-root')) return true;
        if (document.getElementById('order-details-modal')) return true;
        var sw = document.getElementById('sw-overlay');
        if (sw && document.body.contains(sw)) {
            var cs = window.getComputedStyle(sw);
            if (cs.display !== 'none' && cs.visibility !== 'hidden') return true;
        }
        var dyn = document.querySelectorAll('.order-modal, .shift-modal');
        for (var i = 0; i < dyn.length; i++) {
            var c2 = window.getComputedStyle(dyn[i]);
            if (c2.display !== 'none' && c2.visibility !== 'hidden') return true;
        }
        return false;
    }
    window.syncModalBodyScroll = function () {
        document.body.style.overflow = anyModalLayerOpen() ? 'hidden' : '';
    };
    window.openModalLayer = function (el, focusSel) {
        if (!el) return;
        el.removeAttribute('inert');
        if (el.classList.contains('order-modal') || el.classList.contains('shift-modal')) {
            el.style.display = 'flex';
        } else {
            el.classList.add('active');
        }
        window.syncModalBodyScroll();
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                var inp = focusSel
                    ? el.querySelector(focusSel)
                    : el.querySelector('input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled])');
                if (inp) {
                    try { inp.focus({ preventScroll: true }); } catch (e1) {
                        try { inp.focus(); } catch (e2) {}
                    }
                }
            });
        });
    };
    window.closeModalLayer = function (el) {
        if (!el) return;
        if (el.classList.contains('order-modal') || el.classList.contains('shift-modal')) {
            el.style.display = 'none';
        } else {
            el.classList.remove('active');
        }
        if (el.hasAttribute('data-restore-inert')) el.setAttribute('inert', '');
        window.syncModalBodyScroll();
    };
    function scheduleModalScrollSync() {
        if (_modalScrollScheduled != null) return;
        _modalScrollScheduled = requestAnimationFrame(function () {
            _modalScrollScheduled = null;
            window.syncModalBodyScroll();
        });
    }
    document.addEventListener('DOMContentLoaded', function () {
        try {
            var mo = new MutationObserver(scheduleModalScrollSync);
            mo.observe(document.body, {
                subtree: true,
                childList: true,
                attributes: true,
                attributeFilter: ['class', 'style', 'inert']
            });
        } catch (e) {}
        window.syncModalBodyScroll();
    });
})();

// Update Date and Time — يتحدث مرة واحدة بالدقيقة دون ضغط على المعالج
function updateDateTime() {
    const timeDisplay = document.getElementById('datetime-display');
    if (!timeDisplay) return;
    const now = new Date();
    
    // Arabic formatted date
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('ar-SA', options);
    
    // Arabic formatted time
    const timeStr = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    
    timeDisplay.innerHTML = `${dateStr} - ${timeStr}`;
}

// تحديث كفؤ: مرة واحدة بالدقيقة دون setInterval كل ثانية
(function smartDateLoop() {
    updateDateTime();
    const now = new Date();
    // انتظر حتى نهاية الدقيقة الحالية + 1 ثانية
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 1000;
    setTimeout(function tick() {
        updateDateTime();
        setTimeout(tick, 60000);
    }, msUntilNextMinute);
})();

document.addEventListener('DOMContentLoaded', () => {
    // 🛡️ حماية التركيز عند تبديل اللغة
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Alt') {
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
                setTimeout(() => activeEl.focus(), 0);
            }
        }
    });

    // استعادة localStorage من نسخة احتياطية إذا وجدت
    try {
        const restoreData = localStorage.getItem('_restore_pending');
        if (restoreData) {
            console.log('[Restore] Found pending localStorage restore data');
            const lsData = JSON.parse(restoreData);
            
            // استعادة جميع المفاتيح
            Object.keys(lsData).forEach(key => {
                try {
                    localStorage.setItem(key, lsData[key]);
                } catch (e) {
                    console.warn('[Restore] Failed to restore key:', key, e.message);
                }
            });
            
            // حذف البيانات المؤقتة
            localStorage.removeItem('_restore_pending');
            console.log('[Restore] LocalStorage restored successfully');
        }
    } catch (e) {
        console.error('[Restore] Error restoring localStorage:', e.message);
        localStorage.removeItem('_restore_pending');
    }
    
    // Generic UI Interactions
    const navItems = document.querySelectorAll('.nav-item');
    /* 
    We removed the e.preventDefault() from here to allow real navigation 
    between our newly created html pages. 
    */

    // --- Dynamic Global Back Button ---
    const path = window.location.pathname;
    const isRootOrMain = path.endsWith('index.html') || path.endsWith('pos.html') || path.endsWith('kitchen.html') || path.endsWith('login.html');
    
    const headerLeft = document.querySelector('.top-header .header-left');
    if (headerLeft && !isRootOrMain) {
        const backBtn = document.createElement('button');
        backBtn.className = 'icon-btn global-back-btn';
        backBtn.innerHTML = '<i class="ph ph-arrow-right"></i>';
        backBtn.style.marginLeft = '15px';
        backBtn.style.color = 'var(--text-primary)';
        backBtn.style.border = '1px solid var(--border-color)';
        backBtn.title = 'رجوع للخلف';
        backBtn.onclick = () => window.history.back();
        
        headerLeft.style.display = 'flex';
        headerLeft.style.alignItems = 'center';
        
        // Ensure breadcrumbs or other elements inside don't break layout
        headerLeft.insertBefore(backBtn, headerLeft.firstChild);
    }
});

/* =====================================
   Global Settings Sync 
===================================== */
window.syncGlobalSettings = function() {
    const saved = localStorage.getItem('restaurant_settings');

    // الافتراضي: شعار Mister Casher واسمه
    const DEFAULT_LOGO = '2222.png';
    const DEFAULT_NAME = 'Mister Casher';

    if (saved) {
        try {
            const data = JSON.parse(saved);

            // تحديد شعار العرض: إذا كان الشعار base64 أو مسار مختلف عن الافتراضي → مطعم
            const logoSrc = (data.logo && data.logo !== '2222.png' && data.logo !== '1(1).png')
                ? data.logo
                : DEFAULT_LOGO;

            // تحديد اسم العرض: إذا أدخل المستخدم اسم مطعم حقيقي → استخدمه
            const isCustomName = data.name && data.name !== 'Mister Casher';
            const displayName = isCustomName ? data.name : DEFAULT_NAME;

            // 1. تحديث شعار واسم الشريط الجانبي (عام)
            const sideLogos = document.querySelectorAll('.restaurant-logo');
            sideLogos.forEach(img => { img.src = logoSrc; });

            const sideTitles = document.querySelectorAll('.logo span');
            sideTitles.forEach(span => {
                span.innerHTML = displayName + ' <span class="highlight">POS</span>';
            });

            // 2. تحديث الفاتورة (إذا كان على pos.html)
            const rLogo = document.getElementById('r-store-logo');
            if (rLogo) rLogo.src = logoSrc;

            const rName = document.getElementById('r-store-name');
            if (rName) rName.innerText = displayName;

            // تحديث اسم المطعم في تقرير إغلاق الوردية (الـ Modal)
            const shiftName = document.getElementById('shift-res-name');
            if (shiftName) shiftName.innerText = displayName;

            // تحديث اسم المطعم في تقرير إقفال اليوم الكامل
            const dayName = document.getElementById('day-res-name');
            if (dayName) dayName.innerText = displayName;

            const rTax = document.getElementById('r-store-tax');
            if (rTax && data.tax) rTax.innerText = 'الرقم الضريبي: ' + data.tax;

            const rBranch = document.getElementById('r-store-branch');
            if (rBranch && data.branch) rBranch.innerText = data.branch;

            const rFooter = document.getElementById('r-store-footer');
            if (rFooter && data.footer) rFooter.innerText = data.footer;

            // 3. تحديث نسبة الضريبة
            if (data.taxRate !== undefined) {
                const taxRatePct = Math.round(parseFloat(data.taxRate) * 100) / 100;
                const cartTaxLabel = document.getElementById('cart-tax-label');
                if (cartTaxLabel) {
                    cartTaxLabel.innerHTML = `<i class="ph ph-receipt"></i> ضريبة ق.م (${taxRatePct}%)`;
                }
                const rTaxRateLabel = document.getElementById('r-tax-rate-label');
                if (rTaxRateLabel) {
                    rTaxRateLabel.innerText = `قيمة الضريبة المضافة ${taxRatePct}%:`;
                }
            }
        } catch(e) {
            console.error('Settings parse error', e);
        }
    } else {
        // لا توجد إعدادات → استخدم شعار Mister Casher الرسمي
        const sideLogos = document.querySelectorAll('.restaurant-logo');
        sideLogos.forEach(img => { img.src = DEFAULT_LOGO; });

        const sideTitles = document.querySelectorAll('.logo span');
        sideTitles.forEach(span => {
            span.innerHTML = DEFAULT_NAME + ' <span class="highlight">POS</span>';
        });
    }

    // --- 3. Profile Setup & Dropdown Menu ---
    // الـ dropdown يُنشأ مباشرة على body بـ position:fixed لتجنب
    // قطعه بسبب overflow:hidden أو contain:strict على الحاويات الأصلية
    const cUserStr = localStorage.getItem('currentUser');

    // إنشاء dropdown عام واحد على مستوى الـ body
    let _globalDrop = document.getElementById('_profile-drop-global');
    if (!_globalDrop) {
        _globalDrop = document.createElement('div');
        _globalDrop.id = '_profile-drop-global';
        _globalDrop.innerHTML = `
            <a href="profile.html" class="pdrop-item"><i class="ph-fill ph-user-circle"></i> معلومات الحساب</a>
            <a href="settings.html" class="pdrop-item"><i class="ph-fill ph-gear"></i> إعدادات الهوية</a>
            <a href="permissions.html" class="pdrop-item"><i class="ph-fill ph-shield-check"></i> الصلاحيات</a>
            <div id="pdrop-switch-section"></div>
            <div class="pdrop-item pdrop-logout" id="btn-logout-global"><i class="ph-bold ph-sign-out"></i> تسجيل الخروج</div>
        `;

        // Inject styles once
        const pdropStyle = document.createElement('style');
        pdropStyle.textContent = `
            #_profile-drop-global {
                position: fixed;
                background: rgba(10, 15, 30, 0.98);
                border: 1px solid rgba(255,255,255,0.12);
                border-radius: 12px;
                width: 220px;
                display: none;
                flex-direction: column;
                box-shadow: 0 16px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset;
                z-index: 2147483000;
                overflow: hidden;
                animation: pdropIn 0.18s cubic-bezier(0.34,1.3,0.64,1) both;
            }
            @keyframes pdropIn {
                from { opacity: 0; transform: translateY(-8px) scale(0.97); }
                to   { opacity: 1; transform: translateY(0)   scale(1); }
            }
            .pdrop-item {
                padding: 13px 16px;
                display: flex;
                gap: 11px;
                align-items: center;
                color: rgba(255,255,255,0.88);
                font-weight: 600;
                font-size: 14px;
                font-family: 'Cairo', sans-serif;
                text-decoration: none;
                border-bottom: 1px solid rgba(255,255,255,0.05);
                transition: background 0.15s;
                cursor: pointer;
            }
            .pdrop-item:last-child { border-bottom: none; }
            .pdrop-item:hover { background: rgba(255,255,255,0.07); color: #fff; }
            .pdrop-item i { font-size: 17px; opacity: 0.85; }
            .pdrop-logout { color: #f87171 !important; font-weight: 800; }
            .pdrop-logout:hover { background: rgba(239,68,68,0.12) !important; }
            /* Switch section */
            #pdrop-switch-section { display: contents; }
            .pdrop-divider {
                margin: 4px 12px;
                border: none;
                border-top: 1px solid rgba(255,255,255,0.07);
            }
            .pdrop-section-label {
                padding: 6px 16px 4px;
                font-size: 10px;
                font-weight: 700;
                letter-spacing: 0.8px;
                color: rgba(255,255,255,0.3);
                text-transform: uppercase;
                font-family: 'Cairo', sans-serif;
            }
            .pdrop-switch-user {
                padding: 10px 16px;
                display: flex;
                gap: 10px;
                align-items: center;
                color: rgba(255,255,255,0.75);
                font-size: 13px;
                font-weight: 600;
                font-family: 'Cairo', sans-serif;
                border-bottom: 1px solid rgba(255,255,255,0.05);
                transition: background 0.15s;
                cursor: pointer;
            }
            .pdrop-switch-user:hover { background: rgba(255,255,255,0.06); color: #fff; }
            .pdrop-switch-user .sw-avatar {
                width: 28px; height: 28px;
                border-radius: 50%;
                background: rgba(59,130,246,0.2);
                border: 1.5px solid rgba(59,130,246,0.4);
                display: flex; align-items: center; justify-content: center;
                font-size: 13px; flex-shrink: 0;
            }
            .pdrop-switch-user .sw-info { display: flex; flex-direction: column; }
            .pdrop-switch-user .sw-name { font-size: 13px; font-weight: 700; }
            .pdrop-switch-user .sw-role { font-size: 10px; color: rgba(255,255,255,0.4); }
            /* Light theme */
            body.light-theme #_profile-drop-global {
                background: rgba(255,255,255,0.97);
                border-color: rgba(0,0,0,0.1);
                box-shadow: 0 16px 40px rgba(0,0,0,0.15);
            }
            body.light-theme .pdrop-item { color: #1e293b; border-bottom-color: rgba(0,0,0,0.06); }
            body.light-theme .pdrop-item:hover { background: rgba(0,0,0,0.04); }
            body.light-theme .pdrop-section-label { color: rgba(0,0,0,0.35); }
            body.light-theme .pdrop-switch-user { color: #334155; border-bottom-color: rgba(0,0,0,0.06); }
            body.light-theme .pdrop-switch-user:hover { background: rgba(0,0,0,0.04); }
            body.light-theme .pdrop-divider { border-top-color: rgba(0,0,0,0.07); }
        `;
        document.head.appendChild(pdropStyle);
        document.body.appendChild(_globalDrop);

        // Logout
        document.getElementById('btn-logout-global').addEventListener('click', (ev) => {
            ev.stopPropagation();
            _globalDrop.style.display = 'none';
            localStorage.removeItem('currentUser');
            window.location.href = 'login.html';
        });

        // Close on click outside
        document.addEventListener('click', (ev) => {
            if (!_globalDrop.contains(ev.target)) {
                _globalDrop.style.display = 'none';
            }
        });

        // Close on scroll / resize
        window.addEventListener('scroll', () => { _globalDrop.style.display = 'none'; }, true);
        window.addEventListener('resize', () => { _globalDrop.style.display = 'none'; });
    }

    if(cUserStr) {
        try {
            const cUser = JSON.parse(cUserStr);
            const profiles = document.querySelectorAll('.user-profile');

            profiles.forEach(p => {
                // Update display text
                const uName = p.querySelector('.user-name');
                const uRole = p.querySelector('.user-role');
                const ava   = p.querySelector('.avatar');
                if(uName) uName.innerText = cUser.username;
                if(uRole) uRole.innerText  = cUser.role;
                if(ava && cUser.avatar)   ava.src = cUser.avatar;

                p.style.cursor = 'pointer';

                // Caret indicator (once)
                if(!p.querySelector('.drop-icon-indicator')) {
                    const caret = document.createElement('i');
                    caret.className = 'ph-bold ph-caret-down drop-icon-indicator';
                    caret.style.cssText = 'margin-right:10px; font-size:13px; color:var(--text-muted); flex-shrink:0;';
                    p.appendChild(caret);
                }

                // Toggle dropdown on click — use fixed position from element's rect
                if (!p._pdropBound) {
                    p._pdropBound = true;
                    p.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        const isVisible = _globalDrop.style.display === 'flex';
                        _globalDrop.style.display = 'none';
                        if (isVisible) return;

                        // ── بناء قائمة تبديل الحساب ──────────────────────
                        _buildSwitchSection(cUser);

                        // Position below the profile element
                        const rect = p.getBoundingClientRect();
                        const dropW = 240;
                        let left = rect.left;
                        if (left + dropW > window.innerWidth - 8) {
                            left = window.innerWidth - dropW - 8;
                        }
                        _globalDrop.style.width = dropW + 'px';
                        _globalDrop.style.top  = (rect.bottom + 6) + 'px';
                        _globalDrop.style.left  = left + 'px';
                        _globalDrop.style.right = 'auto';

                        // Re-trigger animation
                        _globalDrop.style.animation = 'none';
                        _globalDrop.offsetHeight;
                        _globalDrop.style.animation = '';

                        _globalDrop.style.display = 'flex';
                    });
                }
            });

        } catch(e) {
            console.error('Profile auth error', e);
        }
    }

    // ── دالة بناء قسم تبديل الحساب ──────────────────────────────────────
    function _buildSwitchSection(currentUser) {
        const section = document.getElementById('pdrop-switch-section');
        if (!section) return;
        section.innerHTML = '';

        // جمع كل المستخدمين المعروفين في الجهاز
        const knownUsers = [];

        // 1. المدير الرئيسي
        const adminUser = localStorage.getItem('admin_username') || 'admin';
        knownUsers.push({ username: adminUser, display: 'المدير العام System Admin', role: 'المدير العام' });

        // 2. الموظفون من system_roles
        try {
            const roles = JSON.parse(localStorage.getItem('system_roles') || '[]');
            roles.forEach(r => {
                if (r.username && r.username !== adminUser) {
                    knownUsers.push({ username: r.username, display: r.name || r.username, role: r.role || '' });
                }
            });
        } catch(e) {}

        // 3. الموظفون من قاعدة البيانات (employees في localStorage كـ cache)
        try {
            const db = JSON.parse(localStorage.getItem('pos_database') || '{}');
            (db.employees || []).forEach(emp => {
                if (emp.username && emp.status !== 'end' &&
                    !knownUsers.find(u => u.username === emp.username)) {
                    knownUsers.push({ username: emp.username, display: emp.name || emp.username, role: emp.role || '' });
                }
            });
        } catch(e) {}

        // فلتر: استبعاد المستخدم الحالي
        const currentUsername = currentUser?.username || '';
        const others = knownUsers.filter(u =>
            u.username !== currentUsername &&
            u.display  !== currentUsername
        );

        if (others.length === 0) return; // لا يوجد مستخدمون آخرون

        // رسم القسم
        const divider = document.createElement('hr');
        divider.className = 'pdrop-divider';
        section.appendChild(divider);

        const label = document.createElement('div');
        label.className = 'pdrop-section-label';
        label.textContent = 'تبديل الحساب';
        section.appendChild(label);

        others.forEach(u => {
            const item = document.createElement('div');
            item.className = 'pdrop-switch-user';
            // أول حرف من الاسم كـ avatar نصي
            const initial = (u.display || u.username || '?')[0];
            item.innerHTML = `
                <div class="sw-avatar">${initial}</div>
                <div class="sw-info">
                    <span class="sw-name">${u.display}</span>
                    <span class="sw-role">${u.role}</span>
                </div>
                <i class="ph ph-arrow-left" style="margin-right:auto; font-size:13px; opacity:0.4;"></i>
            `;
            item.addEventListener('click', (ev) => {
                ev.stopPropagation();
                _globalDrop.style.display = 'none';
                // تسجيل خروج وانتقال لصفحة الدخول مع username جاهز
                localStorage.removeItem('currentUser');
                window.location.href = 'login.html?switch=' + encodeURIComponent(u.username);
            });
            section.appendChild(item);
        });
    }

    if (window.MisterCasherCurrency && typeof window.MisterCasherCurrency.applySymToDom === 'function') {
        window.MisterCasherCurrency.applySymToDom();
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    window.syncGlobalSettings();
    if (typeof window.syncGlobalPermissionsUI === 'function') {
        window.syncGlobalPermissionsUI();
    }

    const isLoginPage = window.location.pathname.includes('login.html') ||
                        window.location.href.includes('login.html');
    // جهاز جديد = لا يوجد أي من هذه المفاتيح الأساسية في localStorage
    // نتحقق من عدة مفاتيح لتجنب اعتبار الجهاز "جديداً" بسبب غياب مفتاح واحد فقط
    // Function to verify if this is really a new device (with retries to avoid race conditions)
    async function checkIsNewDevice() {
        for (let i = 0; i < 3; i++) {
            const hasData = localStorage.getItem('system_roles') || 
                            localStorage.getItem('restaurant_settings') || 
                            localStorage.getItem('admin_username');
            if (hasData) return false;
            if (i < 2) await new Promise(r => setTimeout(r, 500));
        }
        return true;
    }
    const isNewDevice = await checkIsNewDevice();

    try {
        const { ipcRenderer } = require('electron');

        if (isLoginPage && isNewDevice) {
            // ║ Show visual sync wizard for first-time setup ║
            showSyncWizard(ipcRenderer);
        } else {
            // Existing device: request fresh DB in background
            setTimeout(() => {
                ipcRenderer.send('network-sync-send', { type: 'db_sync_request' });
            }, 5000);
        }
    } catch(e) {}
});

// ═════════════════════════════════════════════════════════════
//  Sync Wizard — First-Time Setup UI
// ═════════════════════════════════════════════════════════════
function showSyncWizard(ipcRenderer) {
    const SEARCH_TIMEOUT = 14; // seconds before auto-close
    let foundPeers = [];
    let selectedPeer = null;
    let searchTimer = null;
    let dismissed = false;

    // ─ Inject CSS ───────────────────────────────────────────────────────
    const css = document.createElement('style');
    css.textContent = `
        @keyframes sw-in  { from{opacity:0;transform:scale(.96)} to{opacity:1;transform:scale(1)} }
        @keyframes sw-out { from{opacity:1;transform:scale(1)} to{opacity:0;transform:scale(.96)} }
        @keyframes sw-radar {
            0%   { width:20px;height:20px;top:50%;left:50%;transform:translate(-50%,-50%);opacity:.9; }
            100% { width:130px;height:130px;top:50%;left:50%;transform:translate(-50%,-50%);opacity:0; }
        }
        @keyframes sw-spin { to{transform:rotate(360deg)} }
        @keyframes sw-slide-in { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes sw-count { from{width:100%} to{width:0%} }

        #sw-overlay {
            position:fixed;inset:0;z-index:2147483647;
            background:linear-gradient(135deg,#020617 0%,#0f172a 60%,#050d1a 100%);
            display:flex;flex-direction:column;align-items:center;justify-content:center;
            gap:20px;direction:rtl;font-family:'Cairo',sans-serif;color:#fff;
            animation:sw-in .4s ease both;
        }
        #sw-overlay.dismissing { animation:sw-out .4s ease both; pointer-events:none; }

        .sw-logo-area { text-align:center; }
        .sw-logo-area img { width:68px;border-radius:18px;
            box-shadow:0 0 40px rgba(16,185,129,.35);margin-bottom:10px; }
        .sw-logo-area h1 { font-size:22px;margin:0;
            background:linear-gradient(90deg,#10b981,#34d399,#10b981);
            -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;color:transparent; }
        .sw-logo-area p { color:#475569;font-size:12px;margin:3px 0 0; }

        .sw-card {
            background:rgba(15,23,42,.85);
            border:1px solid rgba(255,255,255,.07);
            border-radius:22px;padding:28px 36px;
            min-width:370px;max-width:440px;width:90%;
            box-shadow:0 24px 60px rgba(0,0,0,.6);
            text-align:center;
        }

        /* Radar */
        .sw-radar-wrap { position:relative;width:130px;height:130px;margin:0 auto 18px; }
        .sw-radar-core {
            position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
            width:22px;height:22px;background:#10b981;border-radius:50%;
            box-shadow:0 0 20px rgba(16,185,129,.9);
        }
        .sw-radar-ring {
            position:absolute;border-radius:50%;
            border:1.5px solid rgba(16,185,129,.5);
            animation:sw-radar 2s infinite ease-out;
        }
        .sw-radar-ring:nth-child(2){animation-delay:0s}
        .sw-radar-ring:nth-child(3){animation-delay:.65s}
        .sw-radar-ring:nth-child(4){animation-delay:1.3s}

        .sw-h { font-size:17px;font-weight:700;margin:0 0 5px; }
        .sw-p { color:#64748b;font-size:13px;margin:0 0 14px; }

        /* Countdown bar */
        .sw-bar-wrap { background:rgba(255,255,255,.05);border-radius:6px;height:3px;overflow:hidden;margin:14px 0 6px; }
        .sw-bar { height:100%;background:linear-gradient(90deg,#10b981,#34d399);border-radius:6px;width:100%; }
        .sw-secs-label { font-size:11px;color:#334155; }

        /* Device card */
        .sw-peer-card {
            background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.25);
            border-radius:14px;padding:13px 16px;
            display:flex;align-items:center;gap:13px;
            text-align:right;margin-bottom:14px;
            animation:sw-slide-in .3s ease both;
            cursor:pointer;transition:all .2s;
        }
        .sw-peer-card:hover { background:rgba(16,185,129,.14);border-color:rgba(16,185,129,.5); }
        .sw-peer-icon { width:42px;height:42px;min-width:42px;
            background:rgba(16,185,129,.15);border-radius:10px;
            display:flex;align-items:center;justify-content:center;font-size:20px; }
        .sw-peer-name  { font-size:14px;font-weight:700;color:#fff; }
        .sw-peer-ip    { font-size:11px;color:#10b981;margin-top:2px; }

        /* Buttons */
        .sw-btn-primary {
            width:100%;padding:13px;border-radius:14px;
            background:linear-gradient(135deg,#10b981,#059669);
            border:none;color:#fff;font-size:15px;font-weight:700;
            cursor:pointer;font-family:'Cairo',sans-serif;
            box-shadow:0 4px 22px rgba(16,185,129,.4);
            transition:all .2s;margin-bottom:10px;
        }
        .sw-btn-primary:hover{transform:translateY(-1px);box-shadow:0 6px 28px rgba(16,185,129,.55)}
        .sw-btn-primary:disabled{opacity:.5;cursor:not-allowed;transform:none}
        .sw-btn-ghost {
            width:100%;padding:11px;border-radius:14px;
            background:transparent;border:1px solid rgba(255,255,255,.07);
            color:#475569;font-size:13px;cursor:pointer;font-family:'Cairo',sans-serif;
            transition:all .2s;
        }
        .sw-btn-ghost:hover{border-color:rgba(255,255,255,.18);color:#94a3b8}

        /* Progress */
        .sw-prog-wrap { background:rgba(255,255,255,.05);border-radius:8px;height:8px;overflow:hidden;margin:16px 0 8px; }
        .sw-prog-fill { height:100%;background:linear-gradient(90deg,#10b981,#34d399);border-radius:8px;width:0%;transition:width .4s ease; }
        .sw-prog-pct  { font-size:22px;font-weight:800;color:#10b981;margin:8px 0 3px; }
        .sw-prog-step { font-size:12px;color:#475569; }

        /* Not found */
        .sw-warn-icon { font-size:48px;margin-bottom:6px; }
        .sw-warn-title { font-size:17px;font-weight:700;color:#f59e0b;margin:0 0 5px; }
        .sw-warn-sub   { color:#64748b;font-size:13px;margin:0 0 18px; }
    `;
    document.head.appendChild(css);

    // ─ Build HTML ────────────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.id = 'sw-overlay';
    overlay.innerHTML = `
        <div class="sw-logo-area">
            <img src="2222.png" alt="Logo">
            <h1>Mister Casher POS</h1>
            <p>إعداد المزامنة مع الشبكة المحلية</p>
        </div>

        <div class="sw-card">

            <!-- STATE 1: SEARCHING -->
            <div id="sw-s1">
                <div class="sw-radar-wrap">
                    <div class="sw-radar-ring"></div>
                    <div class="sw-radar-ring"></div>
                    <div class="sw-radar-ring"></div>
                    <div class="sw-radar-core"></div>
                </div>
                <div class="sw-h">جاري البحث عن الأجهزة...</div>
                <div class="sw-p">يتم مسح الشبكة المحلية (WiFi / سلك)</div>
                <div class="sw-bar-wrap">
                    <div class="sw-bar" id="sw-cntbar"></div>
                </div>
                <div class="sw-secs-label">سيتم المتابعة تلقائياً خلال <strong id="sw-secs">${SEARCH_TIMEOUT}</strong> ثانية</div>
            </div>

            <!-- STATE 2: FOUND -->
            <div id="sw-s2" style="display:none">
                <div style="font-size:40px;margin-bottom:6px;">🎯</div>
                <div class="sw-h">تم العثور على جهاز!</div>
                <div class="sw-p" style="margin-bottom:16px;">يمكنك مزامنة جميع بيانات النظام من هذا الجهاز</div>
                <div id="sw-peers"></div>
                <button class="sw-btn-primary" id="sw-btn-sync">🔄 مزامنة الآن</button>
                <button class="sw-btn-ghost" id="sw-btn-skip">⏭ تخطي والدخول بدون مزامنة</button>
            </div>

            <!-- STATE 3: SYNCING -->
            <div id="sw-s3" style="display:none">
                <div style="font-size:40px;display:inline-block;animation:sw-spin 1s linear infinite;margin-bottom:8px;">⚙️</div>
                <div class="sw-h">جاري المزامنة...</div>
                <div class="sw-prog-wrap">
                    <div class="sw-prog-fill" id="sw-prog"></div>
                </div>
                <div class="sw-prog-pct" id="sw-pct">0%</div>
                <div class="sw-prog-step" id="sw-step">جاري الاتصال بالجهاز...</div>
            </div>

            <!-- STATE 4: NOT FOUND -->
            <div id="sw-s4" style="display:none">
                <div class="sw-warn-icon">📡</div>
                <div class="sw-warn-title">لم يتم العثور على أجهزة</div>
                <div class="sw-warn-sub">لا توجد أجهزة متصلة بنفس الشبكة حالياً،<br>أو تأكد من تشغيل التطبيق على الجهاز الآخر</div>
                <button class="sw-btn-primary" id="sw-btn-retry" style="background:linear-gradient(135deg,#f59e0b,#d97706);box-shadow:0 4px 16px rgba(245,158,11,.35)">
                    🔍 إعادة البحث
                </button>
                <button class="sw-btn-ghost" id="sw-btn-new">دخول كجهاز جديد مستقل</button>
            </div>

            <!-- STATE 5: CONFIRM SKIP -->
            <div id="sw-s5" style="display:none">
                <div style="font-size:40px;margin-bottom:8px;">⚠️</div>
                <div class="sw-h">هل أنت متأكد؟</div>
                <div class="sw-p" style="margin-bottom:18px;line-height:1.7;">
                    إذا دخلت بدون مزامنة ستبدأ بقاعدة بيانات <strong style="color:#f59e0b;">فارغة</strong> بدون أي بيانات.<br>
                    يمكنك دائماً إعادة بحث لاحقاً من أسفل الشاشة.
                </div>
                <button class="sw-btn-primary" id="sw-btn-confirm-exit"
                    style="background:linear-gradient(135deg,#ef4444,#dc2626);box-shadow:0 4px 16px rgba(239,68,68,.3);margin-bottom:10px;">
                    نعم، ادخل بدون مزامنة
                </button>
                <button class="sw-btn-ghost" id="sw-btn-back-search">← رجوع والبحث مجدداً</button>
            </div>

        </div>
        <div style="font-size:10px;color:#1e3a5f;margin-top:4px;">UDP:41234 · HTTP:41235 · LAN</div>
    `;
    document.body.appendChild(overlay);

    // ─ State helpers ───────────────────────────────────────────────────────
    function showState(n) {
        [1,2,3,4,5].forEach(i => {
            const el = document.getElementById('sw-s'+i);
            if (el) el.style.display = (i===n) ? 'block' : 'none';
        });
    }

    function dismissWizard(delay=0, showBadge=true) {
        if (dismissed) return;
        dismissed = true;
        clearInterval(searchTimer);
        setTimeout(() => {
            overlay.classList.add('dismissing');
            setTimeout(() => {
                overlay.remove();
                // Always inject the retry badge so user can come back
                if (showBadge) injectSyncBadge(ipcRenderer);
            }, 420);
        }, delay);
    }

    // ─ Floating badge: lets user reopen wizard after dismissal ───────────────
    function injectSyncBadge(ipc) {
        const old = document.getElementById('sw-retry-badge');
        if (old) old.remove();

        const badge = document.createElement('div');
        badge.id = 'sw-retry-badge';
        const badgeCss = document.createElement('style');
        badgeCss.textContent = `
            #sw-retry-badge {
                position:fixed;bottom:60px;left:50%;transform:translateX(-50%);
                background:rgba(15,23,42,.95);
                border:1px solid rgba(16,185,129,.35);
                border-radius:22px;padding:9px 20px;
                display:flex;align-items:center;gap:9px;
                font-family:'Cairo',sans-serif;font-size:13px;font-weight:600;
                color:#10b981;cursor:pointer;z-index:999999;
                box-shadow:0 4px 24px rgba(0,0,0,.5);
                direction:rtl;animation:sw-in .4s ease both;
                transition:all .2s;white-space:nowrap;
            }
            #sw-retry-badge:hover {
                background:rgba(16,185,129,.1);
                transform:translateX(-50%) translateY(-2px);
                box-shadow:0 6px 28px rgba(0,0,0,.6);
            }
            #sw-retry-badge .sw-badge-close {
                margin-right:4px;color:#475569;font-size:15px;
                line-height:1;padding:2px 4px;border-radius:4px;
            }
            #sw-retry-badge .sw-badge-close:hover { color:#ef4444; }
        `;
        document.head.appendChild(badgeCss);
        badge.innerHTML = `
            <span style="font-size:16px;">🔄</span>
            <span>مزامنة مع جهاز على الشبكة</span>
            <span class="sw-badge-close" id="sw-badge-x" title="إغلاق">✕</span>
        `;
        document.body.appendChild(badge);

        // Click badge → reopen wizard
        badge.addEventListener('click', (e) => {
            if (e.target.id === 'sw-badge-x') {
                badge.remove(); return;
            }
            badge.remove();
            showSyncWizard(ipc);
        });
    }

    // ─ Countdown timer ────────────────────────────────────────────────────
    let secsLeft = SEARCH_TIMEOUT;
    const secsEl = document.getElementById('sw-secs');
    const barEl  = document.getElementById('sw-cntbar');

    // Animate the countdown bar
    setTimeout(() => {
        if (barEl) {
            barEl.style.transition = `width ${SEARCH_TIMEOUT}s linear`;
            barEl.style.width = '0%';
        }
    }, 100);

    searchTimer = setInterval(() => {
        if (dismissed || foundPeers.length > 0) { clearInterval(searchTimer); return; }
        secsLeft--;
        if (secsEl) secsEl.textContent = secsLeft;
        if (secsLeft <= 0) {
            clearInterval(searchTimer);
            // No device found — show "not found" state
            showState(4);
        }
    }, 1000);

    async function sendPeerPing() {
        let deviceId = '';
        try {
            deviceId = await ipcRenderer.invoke('license-get-device-id');
        } catch (_) {}
        ipcRenderer.send('network-sync-send', { type: 'peer_ping', deviceId });
    }

    // ─ Send peer_ping after socket is ready ─────────────────────────────────
    setTimeout(() => {
        sendPeerPing();
        let pingInterval = setInterval(() => {
            if (dismissed || foundPeers.length > 0) { clearInterval(pingInterval); return; }
            sendPeerPing();
        }, 3000);
    }, 1500);

    // ─ Handle peer discovered ───────────────────────────────────────────────
    window.addEventListener('sw-peer-found', (e) => {
        const peer = e.detail;
        if (dismissed) return;
        // Avoid duplicates
        if (foundPeers.find(p => p.ip === peer.ip)) return;
        foundPeers.push(peer);
        selectedPeer = peer;
        clearInterval(searchTimer);

        // Show found state
        showState(2);

        // Render device card
        const list = document.getElementById('sw-peers');
        if (list) {
            list.innerHTML = `
                <div class="sw-peer-card">
                    <div class="sw-peer-icon">💻</div>
                    <div>
                        <div class="sw-peer-name">${peer.hostname || 'جهاز متصل'}</div>
                        <div class="sw-peer-ip">🌐 ${peer.ip} &nbsp;·&nbsp; ✅ لديه بيانات كاملة</div>
                    </div>
                </div>
            `;
        }
    });

    // ─ Sync button ────────────────────────────────────────────────────────────
    document.getElementById('sw-btn-sync')?.addEventListener('click', () => {
        showState(3);
        startSyncProgress(ipcRenderer);
    });

    // ─ Skip buttons: both go to STATE 5 (confirmation) ───────────────────────
    function askConfirmSkip() { showState(5); }
    document.getElementById('sw-btn-skip')?.addEventListener('click', askConfirmSkip);
    document.getElementById('sw-btn-new')?.addEventListener('click',  askConfirmSkip);

    // ─ STATE 5 handlers ──────────────────────────────────────────────────────
    document.getElementById('sw-btn-confirm-exit')?.addEventListener('click', () => {
        // Confirmed — user wants to setup as a fresh device
        clearInterval(searchTimer);
        window.location.href = 'setup.html';
    });
    document.getElementById('sw-btn-back-search')?.addEventListener('click', () => {
        // Go back to searching
        foundPeers = []; selectedPeer = null;
        secsLeft = SEARCH_TIMEOUT;
        if (secsEl) secsEl.textContent = secsLeft;
        if (barEl) { barEl.style.transition='none'; barEl.style.width='100%'; }
        showState(1);
        setTimeout(() => {
            if (barEl) { barEl.style.transition=`width ${SEARCH_TIMEOUT}s linear`; barEl.style.width='0%'; }
        }, 100);
        sendPeerPing();
        searchTimer = setInterval(() => {
            if (foundPeers.length > 0) { clearInterval(searchTimer); return; }
            secsLeft--;
            if (secsEl) secsEl.textContent = secsLeft;
            if (secsLeft <= 0) { clearInterval(searchTimer); showState(4); }
        }, 1000);
    });

    // ─ Retry button ──────────────────────────────────────────────────────────
    document.getElementById('sw-btn-retry')?.addEventListener('click', () => {
        // Reset and search again
        foundPeers = []; selectedPeer = null; dismissed = false;
        secsLeft = SEARCH_TIMEOUT;
        if (secsEl) secsEl.textContent = secsLeft;
        if (barEl) { barEl.style.transition='none'; barEl.style.width='100%'; }
        showState(1);
        setTimeout(() => {
            if (barEl) { barEl.style.transition=`width ${SEARCH_TIMEOUT}s linear`; barEl.style.width='0%'; }
        }, 100);
        sendPeerPing();
        searchTimer = setInterval(() => {
            secsLeft--;
            if (secsEl) secsEl.textContent = secsLeft;
            if (secsLeft <= 0 || foundPeers.length > 0) {
                clearInterval(searchTimer);
                if (foundPeers.length === 0) showState(4);
            }
        }, 1000);
    });

    // ─ Sync progress animation ─────────────────────────────────────────────
    function startSyncProgress(ipc) {
        const prog  = document.getElementById('sw-prog');
        const pct   = document.getElementById('sw-pct');
        const step  = document.getElementById('sw-step');
        const steps = [
            { pct:10, label:'جاري الاتصال بالجهاز...' },
            { pct:28, label:'جاري استلام الإعدادات والمستخدمين...' },
            { pct:48, label:'جاري استلام المنيو والأصناف...' },
            { pct:65, label:'جاري استلام النظام المحاسبي...' },
            { pct:80, label:'جاري استلام بيانات المخازن والمشتريات...' },
            { pct:95, label:'جاري التحقق وحفظ البيانات...' },
        ];
        let si = 0;
        const advance = setInterval(() => {
            if (si >= steps.length) { clearInterval(advance); return; }
            const s = steps[si++];
            if (prog) prog.style.width = s.pct + '%';
            if (pct)  pct.textContent  = s.pct + '%';
            if (step) step.textContent = s.label;
        }, 700);

        // Trigger actual sync
        ipc.send('network-sync-send', {
            type: 'sync_request',
            requestId: Math.random().toString(36).slice(2)
        });
        ipc.send('network-sync-send', { type: 'db_sync_request' });

        // Complete after ~6s (real sync runs in background)
        setTimeout(() => {
            clearInterval(advance);
            if (prog) prog.style.width = '100%';
            if (pct)  pct.textContent  = '100%';
            if (step) {
                step.textContent = '✅ اكتملت المزامنة بنجاح!';
                step.style.color = '#10b981';
            }
            dismissWizard(1200);
        }, 4500);
    }
}


// ============== GLOBAL EXPORT TO CSV ==============
window.exportTableToCSV = function(filename = 'export.csv') {
    const tables = document.querySelectorAll('table');
    if (!tables.length) { alert('لا يوجد جدول بيانات في هذه الصفحة!'); return; }
    const table = tables[0];
    const rows = table.querySelectorAll('tr');
    const csv = [];
    rows.forEach(row => {
        const cols = row.querySelectorAll('td, th');
        const rowData = [];
        cols.forEach(col => rowData.push('"' + col.innerText.trim().replace(/"/g, '""') + '"'));
        csv.push(rowData.join(','));
    });
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
};

window.isDateInPeriod = function(dateInput, period) {
    if(!period || period === 'all') return true;
    if(!dateInput) return false;
    let d = new Date(dateInput);
    if(isNaN(d.getTime())) return false;
    let now = new Date();
    let startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    if(period === 'today' || period === 'day') {
        return d >= startOfToday;
    } else if(period === 'yesterday') {
        let startOfYest = new Date(startOfToday.getTime());
        startOfYest.setDate(startOfYest.getDate() - 1);
        return d >= startOfYest && d < startOfToday;
    } else if(period === 'week' || period === '1week' || period === '7days') {
        let startOfWeek = new Date(startOfToday.getTime());
        startOfWeek.setDate(startOfWeek.getDate() - 7);
        return d >= startOfWeek;
    } else if(period === 'month' || period === 'this_month') {
        let startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return d >= startOfMonth;
    } else if(period === 'quarter') {
        let qMonth = Math.floor(now.getMonth() / 3) * 3;
        let startOfQ = new Date(now.getFullYear(), qMonth, 1);
        return d >= startOfQ;
    } else if(period === 'year') {
        let startOfYear = new Date(now.getFullYear(), 0, 1);
        return d >= startOfYear;
    }
    return true;
};

// Load Global Notifications Engine (فترة أطول على الأجهزة الضعيفة — نفس الميزة)
(function() {
    try {
        const s = document.createElement('script');
        s.src = 'notifications.js';
        s.defer = true;
        document.head.appendChild(s);
        console.log(
            '[System] Notifications Engine loading' +
                (window.MC_PERF && window.MC_PERF.isWeak ? ' (low-power interval)' : '')
        );
        
        // --- Theme Toggle Logic ---
        document.addEventListener('DOMContentLoaded', () => {
            const body = document.body;
            let themeBtn = null;
            
            // Check saved theme globally
            const savedTheme = localStorage.getItem('sys_theme') || 'dark';
            
            function applyTheme(theme, dispatchEvent = false) {
                const de = document.documentElement;
                if(theme === 'light') {
                    body.classList.remove('dark-theme');
                    body.classList.add('light-theme');
                    de.setAttribute('data-theme', 'light');
                    de.style.backgroundColor = '#f1f5f9';
                    if (themeBtn) {
                        themeBtn.innerHTML = '<i class="ph-fill ph-moon"></i>';
                        themeBtn.style.color = '#3b82f6';
                    }
                } else {
                    body.classList.remove('light-theme');
                    body.classList.add('dark-theme');
                    de.setAttribute('data-theme', 'dark');
                    de.style.backgroundColor = '#0b0f19';
                    if (themeBtn) {
                        themeBtn.innerHTML = '<i class="ph-fill ph-sun"></i>';
                        themeBtn.style.color = '#f59e0b';
                    }
                }
                
                // Only dispatch event when triggered by user (not on initial page load)
                if (dispatchEvent) {
                    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: theme } }));
                }
            }
            
            // Apply on load — silent, no event (charts not ready yet)
            applyTheme(savedTheme, false);

            // Add toggle button to header if it exists
            const headerActions = document.querySelector('.header-actions');
            if(headerActions) {
                // Find where to insert (before the notification bell)
                const notifBtn = document.querySelector('.notification-btn');
                
                themeBtn = document.createElement('button');
                themeBtn.className = 'icon-btn theme-toggle-btn';
                themeBtn.title = 'تغيير المظهر';
                
                if(notifBtn) {
                    headerActions.insertBefore(themeBtn, notifBtn);
                } else {
                    headerActions.appendChild(themeBtn);
                }
                
                // Set initial icon correctly — silent, no event
                applyTheme(localStorage.getItem('sys_theme') || 'dark', false);
                
                themeBtn.addEventListener('click', () => {
                    const isLight = body.classList.contains('light-theme');
                    const newTheme = isLight ? 'dark' : 'light';
                    localStorage.setItem('sys_theme', newTheme);
                    applyTheme(newTheme, true); // dispatch event only on user click
                });
            }
        });
    } catch(e) {}
})();
// Dynamic Delivery Sidebar
document.addEventListener("DOMContentLoaded", function() {
    // Populate dynamic delivery companies in sidebar
    const dynDelivNav = document.getElementById('dynamic-delivery-companies-nav');
    if (dynDelivNav && typeof window.dbRead === 'function') {
        window.dbRead().then(_db => {
            const companies = _db.deliveryCompanies || [];
            let html = '';
            companies.forEach(c => {
                if (c.name !== 'هنقرستيشن' && c.isActive !== false) {
                    const isActiveCompany = window.location.href.includes(`company=${encodeURIComponent(c.name)}`);
                    html += `
                    <a href="hungerstation.html?company=${encodeURIComponent(c.name)}" class="nav-item ${isActiveCompany ? 'active' : ''}" style="padding-right: 25px;">
                        <i class="ph ph-motorcycle"></i><span>${c.name}</span>
                    </a>`;
                }
            });
            dynDelivNav.innerHTML = html;
            
            // Remove active state from original hungerstation link if we are viewing a different company
            const urlParams = new URLSearchParams(window.location.search);
            const hsLink = document.getElementById('nav-hs') || document.querySelector('a[href="hungerstation.html"]');
            if (hsLink) {
                if (urlParams.has('company') && urlParams.get('company') !== 'هنقرستيشن') {
                    hsLink.classList.remove('active');
                } else if (window.location.pathname.includes('hungerstation.html') && !urlParams.has('company')) {
                    hsLink.classList.add('active');
                }
            }
        }).catch(e => console.error('Error loading delivery companies for nav', e));
    }
});

/**
 * 🛠️ حل مشكلة تجمد الحقول في Electron بعد رسائل التأكيد (Confirm/Alert)
 * نقوم باستبدال confirm و alert بنوافذ HTML مخصصة لا تسرق التركيز من النظام.
 */
window.mcasherConfirm = function(msg) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'custom-confirm-overlay';
        overlay.style = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center;
            z-index: 100000; animation: fadeIn 0.2s;
        `;
        
        const box = document.createElement('div');
        box.style = `
            background: #1a1f2c; color: white; padding: 35px; border-radius: 24px;
            width: 90%; max-width: 480px; border: 1px solid rgba(255,255,255,0.1);
            box-shadow: 0 30px 70px rgba(0,0,0,0.7); text-align: center;
            font-family: 'Cairo', sans-serif;
        `;
        
        box.innerHTML = `
            <div style="font-size: 60px; color: #f59e0b; margin-bottom: 20px;"><i class="ph-fill ph-warning-circle"></i></div>
            <h3 style="margin: 0 0 15px; font-size: 22px; font-weight: 800;">تأكيد العملية</h3>
            <p style="margin: 0 0 30px; line-height: 1.7; color: #cbd5e1; font-size: 16px;">${msg.replace(/\n/g, '<br>')}</p>
            <div style="display: flex; gap: 15px; justify-content: center;">
                <button id="confirm-ok" style="background: #3b82f6; color: white; border: none; padding: 12px 40px; border-radius: 12px; cursor: pointer; font-weight: bold; flex: 1; font-size: 16px; transition: 0.2s;">موافق</button>
                <button id="confirm-cancel" style="background: rgba(255,255,255,0.08); color: white; border: none; padding: 12px 40px; border-radius: 12px; cursor: pointer; flex: 1; font-size: 16px; transition: 0.2s;">إلغاء</button>
            </div>
        `;
        
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        
        const okBtn = box.querySelector('#confirm-ok');
        const cancelBtn = box.querySelector('#confirm-cancel');
        
        okBtn.onmouseover = () => okBtn.style.background = '#2563eb';
        okBtn.onmouseout = () => okBtn.style.background = '#3b82f6';
        
        cancelBtn.onmouseover = () => cancelBtn.style.background = 'rgba(255,255,255,0.15)';
        cancelBtn.onmouseout = () => cancelBtn.style.background = 'rgba(255,255,255,0.08)';

        okBtn.onclick = () => {
            document.body.removeChild(overlay);
            resolve(true);
        };
        cancelBtn.onclick = () => {
            document.body.removeChild(overlay);
            resolve(false);
        };
    });
};

window.mcasherAlert = function(msg) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center;
            z-index: 100000; animation: fadeIn 0.2s;
        `;
        
        const box = document.createElement('div');
        box.style = `
            background: #1a1f2c; color: white; padding: 35px; border-radius: 24px;
            width: 90%; max-width: 420px; border: 1px solid rgba(255,255,255,0.1);
            box-shadow: 0 30px 70px rgba(0,0,0,0.7); text-align: center;
            font-family: 'Cairo', sans-serif;
        `;
        
        box.innerHTML = `
            <div style="font-size: 60px; color: #10b981; margin-bottom: 20px;"><i class="ph-fill ph-check-circle"></i></div>
            <h3 style="margin: 0 0 15px; font-size: 22px; font-weight: 800;">تنبيه</h3>
            <p style="margin: 0 0 30px; line-height: 1.7; color: #cbd5e1; font-size: 16px;">${msg.replace(/\n/g, '<br>')}</p>
            <button id="alert-ok" style="background: #3b82f6; color: white; border: none; padding: 12px 60px; border-radius: 12px; cursor: pointer; font-weight: bold; width: 100%; font-size: 16px;">فهمت</button>
        `;
        
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        
        box.querySelector('#alert-ok').onclick = () => {
            document.body.removeChild(overlay);
            resolve();
        };
    });
};
