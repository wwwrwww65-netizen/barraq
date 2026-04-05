(function () {
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/"/g, '&quot;');
    }

    const style = document.createElement('style');
    style.innerHTML = `
        .notif-dropdown {
            position: absolute;
            background: rgba(15, 23, 42, 0.98);
            backdrop-filter: blur(15px);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.6);
            display: none;
            flex-direction: column;
            z-index: 10000;
            overflow: hidden;
            animation: slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            min-width: 350px;
            direction: rtl;
        }
        .notif-dropdown.show { display: flex; }
        .notif-header {
            padding: 15px 20px;
            border-bottom: 1px solid rgba(255,255,255,0.05);
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-weight: 800;
            background: rgba(0,0,0,0.3);
            color: white;
        }
        .notif-list { max-height: 400px; overflow-y: auto; }
        .notif-item {
            padding: 16px 20px;
            border-bottom: 1px solid rgba(255,255,255,0.03);
            display: flex;
            gap: 15px;
            align-items: flex-start;
            transition: 0.2s;
        }
        .notif-item:hover { background: rgba(255,255,255,0.08); }
        .notif-icon {
            font-size: 24px;
            color: #ef4444;
            background: rgba(239, 68, 68, 0.1);
            padding: 10px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .notif-content { flex: 1; }
        .notif-content h4 { margin: 0 0 5px; font-size: 15px; color: white; }
        .notif-content p { margin: 0; font-size: 13px; color: #cbd5e1; line-height: 1.4; }
        .notif-time { font-size: 11px; color: #64748b; margin-top: 5px; display: block; }
        .notif-unread { border-right: 4px solid var(--accent-blue) !important; background: rgba(59, 130, 246, 0.05); }
        #toast-container {
            position: fixed;
            bottom: 40px;
            right: 40px;
            z-index: 10001;
            display: flex;
            flex-direction: column;
            gap: 15px;
            direction: rtl;
        }
        .toast-msg {
            background: rgba(15, 23, 42, 0.95);
            border-right: 5px solid #ef4444;
            color: white;
            padding: 18px 24px;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            gap: 18px;
            animation: slideInRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            backdrop-filter: blur(10px);
            min-width: 320px;
        }
        @keyframes slideInRight {
            0% { transform: translateX(120%); opacity: 0; }
            100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutRight {
            0% { transform: translateX(0); opacity: 1; }
            100% { transform: translateX(120%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);

    const toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    document.body.appendChild(toastContainer);

    const playBeep = () => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(900, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.25, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.28);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.28);
            setTimeout(() => {
                try {
                    ctx.close();
                } catch (e2) {}
            }, 400);
        } catch (e) {}
    };

    function showToast(title, body) {
        playBeep();
        const t = document.createElement('div');
        t.className = 'toast-msg';
        t.innerHTML =
            '<i class="ph-fill ph-warning" style="font-size:35px; color:#ef4444;"></i><div><h4 style="margin:0 0 5px; font-size:17px; font-weight:800;">' +
            esc(title) +
            '</h4><p style="margin:0; font-size:14px; color:#cbd5e1; font-weight:600;">' +
            esc(body) +
            '</p></div>';
        toastContainer.appendChild(t);
        setTimeout(() => {
            t.style.animation = 'slideOutRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards';
            setTimeout(() => t.remove(), 500);
        }, 7000);
    }

    let notifications = [];
    let unreadCount = 0;

    const dropdown = document.createElement('div');
    dropdown.className = 'notif-dropdown';
    document.body.appendChild(dropdown);

    function hasDb() {
        return typeof window.dbRead === 'function' && typeof window.dbWrite === 'function';
    }

    async function persistNotifsToDb() {
        try {
            localStorage.setItem('sys_notifications', JSON.stringify(notifications));
        } catch (e) {}
        if (!hasDb()) return;
        try {
            const db = await window.dbRead();
            if (!db.systemNotifications) db.systemNotifications = [];
            db.systemNotifications = notifications.slice(-50);
            await window.dbWrite(db);
        } catch (e) {}
    }

    async function hydrateNotifications() {
        let fromDb = null;
        if (hasDb()) {
            try {
                const db = await window.dbRead();
                if (Array.isArray(db.systemNotifications)) {
                    fromDb = db.systemNotifications;
                }
            } catch (e) {}
        }
        if (fromDb && fromDb.length > 0) {
            notifications = fromDb.slice(-50);
        } else {
            try {
                notifications = JSON.parse(localStorage.getItem('sys_notifications') || '[]');
            } catch (e) {
                notifications = [];
            }
            if (notifications.length > 0 && hasDb()) {
                await persistNotifsToDb();
            }
        }
        unreadCount = notifications.filter((n) => !n.read).length;
        updateBadge();
    }

    async function loadAlertState() {
        if (hasDb()) {
            try {
                const db = await window.dbRead();
                if (db.inventoryAlertState && typeof db.inventoryAlertState === 'object') {
                    return { ...db.inventoryAlertState };
                }
            } catch (e) {}
        }
        try {
            return JSON.parse(localStorage.getItem('alerted_inv_items') || '{}');
        } catch (e) {
            return {};
        }
    }

    async function saveAlertState(obj) {
        try {
            localStorage.setItem('alerted_inv_items', JSON.stringify(obj));
        } catch (e) {}
        if (!hasDb()) return;
        try {
            const db = await window.dbRead();
            db.inventoryAlertState = obj;
            await window.dbWrite(db);
        } catch (e) {}
    }

    function renderDropdown() {
        if (notifications.length === 0) {
            dropdown.innerHTML =
                '<div class="notif-header">مركز الإشعارات</div><div style="padding:40px; text-align:center; color:var(--text-muted);"><i class="ph ph-bell-slash" style="font-size:40px; margin-bottom:10px;"></i><br>لا توجد تنبيهات حالياً</div>';
        } else {
            let html =
                '<div class="notif-header"><span>مركز الإشعارات (' +
                unreadCount +
                ')</span> <button type="button" id="mark-all-read" style="background:rgba(59, 130, 246, 0.1); padding:5px 10px; border-radius:6px; border:none; color:var(--accent-blue); cursor:pointer; font-size:12px; font-weight:700;">تحديد كمقروء</button></div><div class="notif-list">';
            [...notifications].reverse().slice(0, 30).forEach((n) => {
                const icon =
                    n.type === 'inventory'
                        ? '<i class="ph-fill ph-warning"></i>'
                        : '<i class="ph-fill ph-bell-ringing"></i>';
                html +=
                    '<div class="notif-item ' +
                    (!n.read ? 'notif-unread' : '') +
                    '"><div class="notif-icon">' +
                    icon +
                    '</div><div class="notif-content"><h4>' +
                    esc(n.title) +
                    '</h4><p>' +
                    esc(n.body) +
                    '</p><span class="notif-time">' +
                    esc(n.time) +
                    '</span></div></div>';
            });
            html += '</div>';
            dropdown.innerHTML = html;

            const btnMarkRead = document.getElementById('mark-all-read');
            if (btnMarkRead) {
                btnMarkRead.addEventListener('click', (e) => {
                    e.stopPropagation();
                    notifications.forEach((n) => (n.read = true));
                    void persistNotifsToDb();
                    renderDropdown();
                    updateBadge();
                });
            }
        }
    }

    function updateBadge() {
        unreadCount = notifications.filter((n) => !n.read).length;
        document.querySelectorAll('.notification-btn .badge').forEach((b) => {
            if (b.id === 'inv-notif-badge') return;
            b.innerText = unreadCount;
            b.style.display = unreadCount > 0 ? 'flex' : 'none';
        });
    }

    window.addSystemNotification = function (type, title, body) {
        notifications.push({
            id: Date.now(),
            type,
            title,
            body,
            time: new Date().toLocaleString('ar-SA'),
            read: false
        });
        if (notifications.length > 50) notifications.shift();
        void persistNotifsToDb();
        updateBadge();
        if (dropdown.classList.contains('show')) renderDropdown();
    };

    let inventoryCheckRunning = false;
    async function runInventoryCheck() {
        if (document.visibilityState === 'hidden' || !window.dbRead) return;
        if (inventoryCheckRunning) return;
        inventoryCheckRunning = true;
        try {
            const db = await window.dbRead();
            const inventory = db.inventory || [];
            let alertedItems = await loadAlertState();
            let hasChanges = false;
            const newToastLines = [];
            const newAlerts = [];

            inventory.forEach((item) => {
                const minLimit = Number(
                    item.minQty != null ? item.minQty : item.minStock != null ? item.minStock : 5
                );
                const currentStock = Number(
                    item.qty != null ? item.qty : item.stock != null ? item.stock : 0
                );
                const wh = item.warehouseId || 'main';
                const alertKey = (item.sku ? String(item.sku) : String(item.name || '')) + '@' + wh;

                if (currentStock <= minLimit) {
                    if (!alertedItems[alertKey]) {
                        const whLabel =
                            wh === 'main'
                                ? 'رئيسي'
                                : wh === 'restaurant'
                                  ? 'مطعم'
                                  : wh === 'beverages'
                                    ? 'مشروبات'
                                    : wh;
                        newToastLines.push(
                            '• ' +
                                (item.name || item.sku || 'صنف') +
                                ' (' +
                                whLabel +
                                '): ' +
                                currentStock +
                                ' ' +
                                (item.unit || '')
                        );
                        newAlerts.push({ item, whLabel, currentStock });
                        alertedItems[alertKey] = true;
                        hasChanges = true;
                    }
                } else {
                    if (alertedItems[alertKey]) {
                        delete alertedItems[alertKey];
                        hasChanges = true;
                    }
                }
            });

            if (newAlerts.length === 1) {
                const a = newAlerts[0];
                window.addSystemNotification(
                    'inventory',
                    'تنبيه مخزون: ' + (a.item.name || a.item.sku),
                    'المستودع: ' + a.whLabel + ' — المتبقي: ' + a.currentStock + ' ' + (a.item.unit || '')
                );
            } else if (newAlerts.length > 1) {
                const body = newAlerts
                    .map(
                        (a) =>
                            '• ' +
                            (a.item.name || a.item.sku) +
                            ' (' +
                            a.whLabel +
                            '): ' +
                            a.currentStock +
                            ' ' +
                            (a.item.unit || '')
                    )
                    .join('\n')
                    .slice(0, 900);
                window.addSystemNotification(
                    'inventory',
                    'تنبيه مخزون: ' + newAlerts.length + ' أصناف',
                    body
                );
            }

            if (newToastLines.length === 1) {
                const line = newToastLines[0].replace(/^• /, '');
                showToast('نقص في المخزون', line);
            } else if (newToastLines.length > 1) {
                showToast(
                    'نقص في المخزون',
                    newToastLines.length +
                        ' أصناف وصلت للحد — التفاصيل في مركز الإشعارات (الجرس).'
                );
            }

            if (hasChanges) {
                await saveAlertState(alertedItems);
            }
        } catch (err) {
        } finally {
            inventoryCheckRunning = false;
        }
    }

    setInterval(() => {
        const bells = document.querySelectorAll('.notification-btn');
        bells.forEach((bell) => {
            if (bell.id === 'inv-notif-btn') return;
            if (!bell.dataset.bound) {
                bell.dataset.bound = 'true';
                bell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const rect = bell.getBoundingClientRect();
                    dropdown.style.top = rect.bottom + 10 + 'px';
                    dropdown.style.left = Math.max(10, rect.left - 100) + 'px';
                    dropdown.classList.toggle('show');
                    renderDropdown();
                });
            }
        });
    }, 1000);

    document.addEventListener('click', (e) => {
        if (
            !dropdown.contains(e.target) &&
            !e.target.closest('.notification-btn') &&
            !e.target.closest('#inv-notif-btn')
        ) {
            dropdown.classList.remove('show');
        }
    });

    const CHECK_MS = 45000;
    setInterval(runInventoryCheck, CHECK_MS);

    if (typeof window.registerPosDatabaseRefresh === 'function') {
        window.registerPosDatabaseRefresh(async () => {
            try {
                if (hasDb()) {
                    const db = await window.dbRead();
                    if (Array.isArray(db.systemNotifications)) {
                        notifications = db.systemNotifications.slice(-50);
                        try {
                            localStorage.setItem('sys_notifications', JSON.stringify(notifications));
                        } catch (e) {}
                        updateBadge();
                        if (dropdown.classList.contains('show')) renderDropdown();
                    }
                }
            } catch (e) {}
            void runInventoryCheck();
        });
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void runInventoryCheck();
    });

    function boot() {
        void hydrateNotifications().then(() => {
            updateBadge();
            setTimeout(() => void runInventoryCheck(), 2000);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        setTimeout(boot, 0);
    }

    setTimeout(updateBadge, 600);
})();
