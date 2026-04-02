(function() {
    // 1. Inject Notification CSS and Sound
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
        .notif-list {
            max-height: 400px;
            overflow-y: auto;
        }
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

        /* Toast Popup CSS */
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

    // Dynamic high-pitch beep using AudioContext (Always works, no files required)
    const playBeep = () => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = "sine";
            // Urgent high double beep
            osc.frequency.setValueAtTime(900, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.3);
        } catch(e) {}
    };

    function showToast(title, body) {
        playBeep();
        const t = document.createElement('div');
        t.className = 'toast-msg';
        t.innerHTML = `
            <i class="ph-fill ph-warning" style="font-size:35px; color:#ef4444;"></i>
            <div>
                <h4 style="margin:0 0 5px; font-size:17px; font-weight:800;">${title}</h4>
                <p style="margin:0; font-size:14px; color:#cbd5e1; font-weight:600;">${body}</p>
            </div>
        `;
        toastContainer.appendChild(t);
        
        // Auto remove alert after 6 seconds
        setTimeout(() => { 
            t.style.animation = 'slideOutRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards';
            setTimeout(() => t.remove(), 500); 
        }, 6000);
    }

    // --- Dropdown Management ---
    let notifications = JSON.parse(localStorage.getItem('sys_notifications') || '[]');
    let unreadCount = notifications.filter(n => !n.read).length;

    const dropdown = document.createElement('div');
    dropdown.className = 'notif-dropdown';
    document.body.appendChild(dropdown);

    function renderDropdown() {
        if(notifications.length === 0) {
            dropdown.innerHTML = `<div class="notif-header">مركز الإشعارات</div><div style="padding:40px; text-align:center; color:var(--text-muted);"><i class="ph ph-bell-slash" style="font-size:40px; margin-bottom:10px;"></i><br>لا توجد تنبيهات حالياً</div>`;
        } else {
            let html = `<div class="notif-header"><span>مركز الإشعارات (${unreadCount})</span> <button id="mark-all-read" style="background:rgba(59, 130, 246, 0.1); padding:5px 10px; border-radius:6px; border:none; color:var(--accent-blue); cursor:pointer; font-size:12px; font-weight:700;">تحديد كمقروء</button></div><div class="notif-list">`;
            [...notifications].reverse().slice(0, 30).forEach(n => {
                let icon = n.type === 'inventory' ? '<i class="ph-fill ph-warning"></i>' : '<i class="ph-fill ph-bell-ringing"></i>';
                html += `
                    <div class="notif-item ${!n.read ? 'notif-unread' : ''}">
                        <div class="notif-icon">${icon}</div>
                        <div class="notif-content">
                            <h4>${n.title}</h4>
                            <p>${n.body}</p>
                            <span class="notif-time">${n.time}</span>
                        </div>
                    </div>`;
            });
            html += `</div>`;
            dropdown.innerHTML = html;

            const btnMarkRead = document.getElementById('mark-all-read');
            if(btnMarkRead) {
                btnMarkRead.addEventListener('click', (e) => {
                    e.stopPropagation();
                    notifications.forEach(n => n.read = true);
                    saveNotifs();
                    renderDropdown();
                    updateBadge();
                });
            }
        }
    }

    function saveNotifs() {
        localStorage.setItem('sys_notifications', JSON.stringify(notifications));
    }

    function updateBadge() {
        unreadCount = notifications.filter(n => !n.read).length;
        document.querySelectorAll('.notification-btn .badge').forEach(b => {
            b.innerText = unreadCount;
            b.style.display = unreadCount > 0 ? 'flex' : 'none';
        });
    }

    window.addSystemNotification = function(type, title, body) {
        notifications.push({ id: Date.now(), type, title, body, time: new Date().toLocaleString('ar-SA'), read: false });
        if(notifications.length > 50) notifications.shift(); // keep last 50 only
        saveNotifs();
        updateBadge();
        if(dropdown.classList.contains('show')) renderDropdown();
    };

    // Attach to specific bell icons dynamically across all pages
    setInterval(() => {
        const bells = document.querySelectorAll('.notification-btn');
        bells.forEach(bell => {
            if(!bell.dataset.bound) {
                bell.dataset.bound = 'true';
                bell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const rect = bell.getBoundingClientRect();
                    // Position dropdown dynamically relative to the bell button
                    dropdown.style.top = (rect.bottom + 10) + 'px';
                    // Since it's RTL and on the left, orient from the left edge of bell
                    dropdown.style.left = Math.max(10, rect.left - 100) + 'px'; 
                    
                    dropdown.classList.toggle('show');
                    renderDropdown();
                });
            }
        });
    }, 1000);

    document.addEventListener('click', (e) => {
        if(!dropdown.contains(e.target) && !e.target.closest('.notification-btn')) {
            dropdown.classList.remove('show');
        }
    });

    // 2. Automated Inventory Alert System (Checking every 5 seconds)
    setInterval(async () => {
        try {
            if(window.dbRead) {
                const db = await window.dbRead();
                const inventory = db.inventory || [];
                
                let alertedItems = JSON.parse(localStorage.getItem('alerted_inv_items') || '{}');
                let hasChanges = false;

                inventory.forEach(item => {
                    let minLimit = Number(item.minStock || 5);
                    let currentStock = Number(item.stock || 0);

                    // If stock drops below or equals minimum threshold
                    if (currentStock <= minLimit) {
                        if (!alertedItems[item.id]) {
                            // Only alert ONCE until stock is replenished again
                            showToast('🔴 نقص حاد في المخزون!', '"الصنف: ' + item.name + '" تجاوز الحد الأدنى. المتبقي (' + currentStock + ') ' + (item.unit || ''));
                            
                            window.addSystemNotification('inventory', 'تنبيه مخزون: ' + item.name, 'صنف "' + item.name + '" وصل إلى حد النفاذ. الكمية المتبقية: ' + currentStock + ' ' + (item.unit || ''));
                            
                            alertedItems[item.id] = true;
                            hasChanges = true;
                        }
                    } else {
                        // If stock goes back UP above minimum threshold, clear alert lock
                        if (alertedItems[item.id]) {
                            delete alertedItems[item.id];
                            hasChanges = true;
                        }
                    }
                });

                if(hasChanges) {
                    localStorage.setItem('alerted_inv_items', JSON.stringify(alertedItems));
                }
            }
        } catch(err) {} // ignore during loads
    }, 5000); // Check every 5 seconds

    // Initial load
    setTimeout(updateBadge, 500);
})();
