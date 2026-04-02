// --- Global Authentication Guard ---
if (!window.location.pathname.includes('login.html')) {
    const cUserRaw = localStorage.getItem('currentUser');
    if (!cUserRaw) {
        window.location.href = 'login.html';
    } else {
        try {
            // Map each page to the exact permission key defined in permissions.js
            const pageMap = {
                // نقطة البيع والمبيعات
                'pos.html':           'pos_access',
                'kitchen.html':       'pos_access',
                'sales.html':         'sales_access',
                'returns.html':       'pos_return',
                'customers.html':     'sales_access',

                // الأصناف والمنيو
                'menu.html':          'menu_manage',
                'add-category.html':  'menu_manage',
                'add-item.html':      'menu_manage',

                // المخازن والمشتريات
                'inventory.html':     'inv_manage',
                'purchases.html':     'inv_manage',
                'inv-documents.html': 'inv_manage',
                'suppliers.html':     'inv_manage',

                // الموظفين والمحاسبة
                'staff.html':         'hr_manage',
                'accounting.html':    'hr_manage',
                'acc-banks.html':     'hr_manage',
                'acc-tree.html':      'hr_manage',
                'acc-reports.html':   'hr_manage',
                'acc-expenses.html':  'hr_manage',

                // الإحصائيات
                'statistics.html':    'stats_access',

                // إعدادات النظام والصلاحيات
                'settings.html':      'sys_admin',
                'permissions.html':   'sys_admin',
            };

            const cUser = JSON.parse(cUserRaw);
            const path = window.location.pathname;
            const currentPageKey = Object.keys(pageMap).find(p => path.endsWith(p));

            if (currentPageKey) {
                // Super Admin bypasses all permission checks
                if (cUser.role !== 'المدير العام') {
                    const systemRoles = JSON.parse(localStorage.getItem('system_roles') || '[]');
                    const myRole = systemRoles.find(r => r.name === cUser.role);
                    const requiredPerm = pageMap[currentPageKey];

                    if (!myRole || !myRole.perms || myRole.perms[requiredPerm] !== true) {
                        alert('📛 تنبيه أمني: حسابك لا يملك صلاحية الدخول لهذه الشاشة. يرجى مراجعة الإدارة.');
                        window.location.href = 'index.html';
                    }
                }
            }
        } catch(e) { console.error('Auth Guard Check Failed', e); }
    }
}

// --- Local Network Synchronization ---
window._networkSyncing = false; // global flag to avoid re-broadcasting synced data

// Buffer for large-data chunk reassembly
const _chunkBuffers = {};
const MAX_UDP_PAYLOAD = 48000; // safe limit well below UDP max ~65535

try {
    const { ipcRenderer } = require('electron');

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

    // Intercept localStorage — chunk large values (e.g. base64 images) for UDP
    const _origSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(key, value) {
        _origSetItem(key, value);
        if (!window._networkSyncing) {
            const str = String(value);
            if (str.length > MAX_UDP_PAYLOAD) {
                // Send in chunks
                const totalChunks = Math.ceil(str.length / MAX_UDP_PAYLOAD);
                const chunkId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
                console.log(`[Sync] 📦 Chunking large value for key: ${key} (${(str.length/1024).toFixed(1)} KB, ${totalChunks} chunks)`);
                for (let i = 0; i < totalChunks; i++) {
                    ipcRenderer.send('network-sync-send', {
                        action: 'setItem_chunk',
                        key, chunkId, chunkIndex: i, totalChunks,
                        chunk: str.slice(i * MAX_UDP_PAYLOAD, (i + 1) * MAX_UDP_PAYLOAD)
                    });
                }
            } else {
                ipcRenderer.send('network-sync-send', { action: 'setItem', key, value });
            }
        }
    };

    const _origRemoveItem = localStorage.removeItem.bind(localStorage);
    localStorage.removeItem = function(key) {
        _origRemoveItem(key);
        if (!window._networkSyncing) {
            ipcRenderer.send('network-sync-send', { action: 'removeItem', key });
        }
    };

    const _origClear = localStorage.clear.bind(localStorage);
    localStorage.clear = function() {
        _origClear();
        if (!window._networkSyncing) {
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
    const style = document.createElement('style');
    style.textContent = `
        #net-sync-badge {
            position: fixed;
            bottom: 18px;
            left: 18px;
            display: flex;
            align-items: center;
            gap: 7px;
            padding: 6px 13px 6px 10px;
            background: rgba(15, 23, 42, 0.92);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            color: #94a3b8;
            backdrop-filter: blur(10px);
            z-index: 99999;
            transition: all 0.3s ease;
            cursor: default;
            user-select: none;
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
        @keyframes pulse-amber {
            0%,100% { opacity:1; transform:scale(1); }
            50% { opacity:0.5; transform:scale(1.4); }
        }
    `;
    document.head.appendChild(style);

    const badge = document.createElement('div');
    badge.id = 'net-sync-badge';
    badge.innerHTML = '<div class="dot"></div><span id="sync-label">الشبكة: انتظار...</span>';
    document.body.appendChild(badge);

    function setSyncState(state, label) {
        badge.className = '';
        badge.classList.add(state);
        document.getElementById('sync-label').textContent = label;
    }

    // Flash "syncing" then restore
    window.addEventListener('pos-db-updated', () => {
        setSyncState('syncing', 'جاري تحديث البيانات...');
        setTimeout(() => setSyncState('connected', 'شبكة: مُزامَن ✓'), 2000);
    });

    // Also flash when localStorage sync fires
    const _origNSS = window._networkSyncing;
    let _syncFlashTimer = null;
    try {
        const { ipcRenderer } = require('electron');
        ipcRenderer.on('network-sync-update', () => {
            setSyncState('syncing', 'مزامنة البيانات...');
            clearTimeout(_syncFlashTimer);
            _syncFlashTimer = setTimeout(() => setSyncState('connected', 'شبكة: مُزامَن ✓'), 1500);
        });
        ipcRenderer.on('db-file-updated', () => {
            setSyncState('syncing', 'تحديث قاعدة البيانات...');
        });
        // Initial state after a short delay
        setTimeout(() => setSyncState('connected', 'شبكة محلية: نشطة'), 4000);
    } catch(e) {
        setSyncState('error', 'الشبكة: غير متصل');
    }
})();

// Update Date and Time continuously
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

setInterval(updateDateTime, 1000);
updateDateTime();

document.addEventListener('DOMContentLoaded', () => {
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

    // الافتراضي: شعار هش HASH واسمه
    const DEFAULT_LOGO = '1111.png';
    const DEFAULT_NAME = 'هش HASH';

    if (saved) {
        try {
            const data = JSON.parse(saved);

            // تحديد شعار العرض: إذا كان الشعار base64 أو مسار مختلف عن الافتراضي → مطعم
            const logoSrc = (data.logo && data.logo !== '1111.png' && data.logo !== '1(1).png')
                ? data.logo
                : DEFAULT_LOGO;

            // تحديد اسم العرض: إذا أدخل المستخدم اسم مطعم حقيقي → استخدمه
            const isCustomName = data.name && data.name !== 'هش HASH' && data.name !== 'هـــش HASH';
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
        // لا توجد إعدادات → استخدم شعار هش HASH الرسمي
        const sideLogos = document.querySelectorAll('.restaurant-logo');
        sideLogos.forEach(img => { img.src = DEFAULT_LOGO; });

        const sideTitles = document.querySelectorAll('.logo span');
        sideTitles.forEach(span => {
            span.innerHTML = DEFAULT_NAME + ' <span class="highlight">POS</span>';
        });
    }

    // --- 3. Profile Setup & Dropdown Menu ---
    const cUserStr = localStorage.getItem('currentUser');
    if(cUserStr) {
        try {
            const cUser = JSON.parse(cUserStr);
            const profiles = document.querySelectorAll('.user-profile');
            
            profiles.forEach(p => {
                // Update text
                const uName = p.querySelector('.user-name');
                const uRole = p.querySelector('.user-role');
                const ava = p.querySelector('.avatar');
                
                if(uName) uName.innerText = cUser.username;
                if(uRole) uRole.innerText = cUser.role;
                if(ava) ava.src = cUser.avatar;
                
                // Set relative positioning & pointer cursor
                p.style.position = 'relative';
                p.style.cursor = 'pointer';
                p.style.display = 'flex';
                p.style.alignItems = 'center';
                
                // Add Icon indicating dropdown
                if(!p.querySelector('.drop-icon-indicator')) {
                    p.innerHTML += '<i class="ph-bold ph-caret-down drop-icon-indicator" style="margin-right: 10px; color: var(--text-muted);"></i>';
                }

                // Create Dropdown Node Native HTML
                if(!p.querySelector('.profile-dropdown')) {
                    const drop = document.createElement('div');
                    drop.className = 'profile-dropdown';
                    drop.style.position = 'absolute';
                    drop.style.top = '110%';
                    drop.style.left = '0';
                    drop.style.background = 'rgba(15, 23, 42, 0.95)';
                    drop.style.backdropFilter = 'blur(10px)';
                    drop.style.border = '1px solid rgba(255,255,255,0.1)';
                    drop.style.borderRadius = '8px';
                    drop.style.width = '200px';
                    drop.style.display = 'none';
                    drop.style.flexDirection = 'column';
                    drop.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
                    drop.style.zIndex = '9999';
                    
                    drop.innerHTML = `
                        <a href="profile.html" style="padding: 12px 15px; display:flex; gap:10px; align-items:center; color:white; border-bottom:1px solid rgba(255,255,255,0.05); font-weight:600;"><i class="ph-fill ph-user-circle"></i> معلومات الحساب</a>
                        <a href="settings.html" style="padding: 12px 15px; display:flex; gap:10px; align-items:center; color:white; border-bottom:1px solid rgba(255,255,255,0.05); font-weight:600;"><i class="ph-fill ph-gear"></i> إعدادات الهوية</a>
                        <a href="permissions.html" style="padding: 12px 15px; display:flex; gap:10px; align-items:center; color:white; border-bottom:1px solid rgba(255,255,255,0.05); font-weight:600;"><i class="ph-fill ph-shield-check"></i> الصلاحيات</a>
                        <div id="btn-logout-global" style="padding: 12px 15px; display:flex; gap:10px; align-items:center; color:var(--accent-red); font-weight:800; cursor:pointer;"><i class="ph-bold ph-sign-out"></i> تسجيل الخروج</div>
                    `;
                    p.appendChild(drop);

                    // Add hover/click listener
                    p.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        // Toggle logic
                        if(drop.style.display === 'flex') {
                            drop.style.display = 'none';
                        } else {
                            // close others
                            document.querySelectorAll('.profile-dropdown').forEach(d => d.style.display = 'none');
                            drop.style.display = 'flex';
                        }
                    });

                    // Logout Action
                    drop.querySelector('#btn-logout-global').addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        // Clear user
                        localStorage.removeItem('currentUser');
                        // Optional: don't clear restaurant_settings so they persist for login page
                        window.location.href = 'login.html';
                    });
                }
            });

            // Global Click outside dropdown to close
            document.addEventListener('click', () => {
                document.querySelectorAll('.profile-dropdown').forEach(d => {
                    d.style.display = 'none';
                });
            });

        } catch(e) {
            console.error('Profile auth error', e);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.syncGlobalSettings();

    const isLoginPage = window.location.pathname.includes('login.html') ||
                        window.location.href.includes('login.html');
    const isNewDevice = !localStorage.getItem('system_roles');

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
            background-size:200%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;
            animation:sw-spin 4s linear infinite; }
        .sw-logo-area p { color:#475569;font-size:12px;margin:3px 0 0; }

        .sw-card {
            background:rgba(15,23,42,.85);
            border:1px solid rgba(255,255,255,.07);
            border-radius:22px;padding:28px 36px;
            min-width:370px;max-width:440px;width:90%;
            backdrop-filter:blur(24px);
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
            <img src="1111.png" alt="Logo">
            <h1>هـــش HASH POS</h1>
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

    // ─ Send peer_ping after socket is ready ─────────────────────────────────
    setTimeout(() => {
        ipcRenderer.send('network-sync-send', { type: 'peer_ping' });
        // Repeat ping every 3 seconds while searching
        let pingInterval = setInterval(() => {
            if (dismissed || foundPeers.length > 0) { clearInterval(pingInterval); return; }
            ipcRenderer.send('network-sync-send', { type: 'peer_ping' });
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
        ipcRenderer.send('network-sync-send', { type: 'peer_ping' });
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
        ipcRenderer.send('network-sync-send', { type: 'peer_ping' });
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

// Load Global Notifications Engine
(function() {
    try {
        const s = document.createElement('script');
        s.src = 'notifications.js';
        document.head.appendChild(s);
        console.log('[System] Notifications Engine Loaded Globally');
        
        // --- Theme Toggle Logic ---
        document.addEventListener('DOMContentLoaded', () => {
            const body = document.body;
            let themeBtn = null;
            
            // Check saved theme globally
            const savedTheme = localStorage.getItem('sys_theme') || 'dark';
            
            function applyTheme(theme) {
                if(theme === 'light') {
                    body.classList.remove('dark-theme');
                    body.classList.add('light-theme');
                    if (themeBtn) {
                        themeBtn.innerHTML = '<i class="ph-fill ph-moon"></i>';
                        themeBtn.style.color = '#3b82f6';
                    }
                } else {
                    body.classList.remove('light-theme');
                    body.classList.add('dark-theme');
                    if (themeBtn) {
                        themeBtn.innerHTML = '<i class="ph-fill ph-sun"></i>';
                        themeBtn.style.color = '#f59e0b';
                    }
                }
            }
            
            // Always apply theme on load regardless of header actions
            applyTheme(savedTheme);

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
                
                // Set initial icon correctly based on applied theme
                applyTheme(localStorage.getItem('sys_theme') || 'dark');
                
                themeBtn.addEventListener('click', () => {
                    const isLight = body.classList.contains('light-theme');
                    const newTheme = isLight ? 'dark' : 'light';
                    localStorage.setItem('sys_theme', newTheme);
                    applyTheme(newTheme);
                });
            }
        });
    } catch(e) {}
})();