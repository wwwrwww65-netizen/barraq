document.addEventListener('DOMContentLoaded', async () => {
    const form      = document.getElementById('loginForm');
    const userInp   = document.getElementById('username');
    const pwdInp    = document.getElementById('password');
    const errBox    = document.getElementById('login-error');
    const btnSubmit = document.getElementById('btn-login-submit');

    // Make sure we are logged out fully when visiting login page
    localStorage.removeItem('currentUser');

    // ── تبديل الحساب: قراءة ?switch=username من الـ URL ──────────────────
    const urlParams = new URLSearchParams(window.location.search);
    const switchUser = urlParams.get('switch');
    let isSwitchMode = false;

    if (switchUser) {
        isSwitchMode = true;
        userInp.value = decodeURIComponent(switchUser);
        userInp.readOnly = true; // اليوزر محدد مسبقاً لا يتغير

        // إضافة badge جميل يوضّح وضع التبديل
        const switchBadge = document.createElement('div');
        switchBadge.style.cssText = `
            background: rgba(59,130,246,0.12);
            border: 1px solid rgba(59,130,246,0.3);
            border-radius: 10px;
            padding: 10px 14px;
            margin-bottom: 18px;
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 13px;
            font-weight: 600;
            color: #93c5fd;
            font-family: 'Cairo', sans-serif;
            direction: rtl;
        `;
        switchBadge.innerHTML = `
            <i class="ph-fill ph-swap" style="font-size:18px;"></i>
            <span>تبديل الحساب إلى: <strong style="color:#fff;">${decodeURIComponent(switchUser)}</strong></span>
        `;
        // أضف قبل الـ form مباشرة
        form.parentNode.insertBefore(switchBadge, form);

        // تنسيق حقل username في وضع القراءة
        userInp.style.cssText += `
            background: rgba(59,130,246,0.08) !important;
            border-color: rgba(59,130,246,0.3) !important;
            color: #93c5fd !important;
            cursor: default;
        `;

        // التركيز الفوري على حقل كلمة المرور
        setTimeout(() => { pwdInp.focus(); }, 100);
    }

    setTimeout(async () => {
        try {
            const { ipcRenderer } = require('electron');
            const access = await ipcRenderer.invoke('license-evaluate-access');
            if (!access.ok) {
                const lock = access.lock ? '?lock=' + encodeURIComponent(access.lock) : '';
                window.location.href = 'activation.html' + lock;
            }
        } catch (_) {}
    }, 0);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const adminUser = localStorage.getItem('admin_username') || 'admin';
        const adminPwd  = localStorage.getItem('admin_pwd') || '123456';

        const uVal = userInp.value.trim();
        const pVal = pwdInp.value.trim();

        errBox.style.display = 'none';

        // Visual Loading
        const origHTML = btnSubmit.innerHTML;
        btnSubmit.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin"></i> جاري المصادقة...';
        btnSubmit.style.pointerEvents = 'none';

        let authenticatedUser = null;

        if (uVal === adminUser && pVal === adminPwd) {
            authenticatedUser = { username: 'المدير العام System Admin', role: 'المدير العام', avatar: 'avatar.svg' };
        } else {
            // Ensure Database Auth for Staff
            try {
                const { ipcRenderer } = require('electron');
                const db = await ipcRenderer.invoke('db-read-full') || {};
                const emp = db.employees?.find(emp =>
                    emp.username === uVal && emp.password === pVal && emp.status !== 'end'
                );

                if (emp) {
                    authenticatedUser = {
                        username: emp.name,
                        role: emp.role,
                        avatar: emp.avatar || 'avatar.svg',
                        empId: emp.id
                    };
                }
            } catch (err) {
                console.error('Login DB Error:', err);
            }
        }

        if (authenticatedUser) {
            setTimeout(() => {
                localStorage.setItem('currentUser', JSON.stringify(authenticatedUser));
                // نظّف الـ URL من معامل switch عند النجاح
                window.location.href = 'index.html';
            }, 800);
        } else {
            // Fail
            btnSubmit.innerHTML = origHTML;
            btnSubmit.style.pointerEvents = 'auto';

            errBox.style.display = 'block';
            pwdInp.value = ''; // clear password
            pwdInp.focus();

            const box = document.querySelector('.login-box');
            box.style.animation = 'none';
            setTimeout(() => { box.style.animation = 'slideUpFade 0.4s reverse forwards'; }, 10);
            setTimeout(() => { box.style.animation = 'slideUpFade 0.4s forwards'; }, 400);
        }
    });

});
