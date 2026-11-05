document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('loginForm');
    const userInp = document.getElementById('username');
    const pwdInp = document.getElementById('password');
    const errBox = document.getElementById('login-error');
    const btnSubmit = document.getElementById('btn-login-submit');
    const { ipcRenderer } = require('electron');

    localStorage.removeItem('currentUser');

    // A licensed installation must create its first manager through the
    // owner-approved Firebase bootstrap flow before the normal login screen.
    try {
        // Refresh first: an owner-approved cloud license may restore access
        // even when the local trial has expired.
        try {
            await ipcRenderer.invoke('license-refresh-manual');
        } catch (_) {}
        const access = await ipcRenderer.invoke('license-evaluate-access');
        if (!access || !access.ok) {
            const lock = access && access.lock ? '?lock=' + encodeURIComponent(access.lock) : '';
            window.location.replace('activation.html' + lock);
            return;
        }
        const licenseInfo = await ipcRenderer.invoke('license-get-info').catch(() => ({}));
        const tenantId = localStorage.getItem('mc_tenant_id') || String(licenseInfo.tenantId || '');
        if (tenantId) localStorage.setItem('mc_tenant_id', tenantId);
        if (!tenantId || licenseInfo.managerProvisioned !== true) {
            window.location.replace('manager-setup.html');
            return;
        }
    } catch (error) {
        console.error('[Login] License gate failed:', error);
        window.location.replace('activation.html');
        return;
    }

    // Account switching: keep the selected username fixed.
    const urlParams = new URLSearchParams(window.location.search);
    const switchUser = urlParams.get('switch');
    if (switchUser) {
        userInp.value = switchUser;
        userInp.readOnly = true;

        const switchBadge = document.createElement('div');
        switchBadge.style.cssText = [
            'background:rgba(59,130,246,.12)',
            'border:1px solid rgba(59,130,246,.3)',
            'border-radius:10px',
            'padding:10px 14px',
            'margin-bottom:18px',
            'display:flex',
            'align-items:center',
            'gap:10px',
            'font-size:13px',
            'font-weight:600',
            'color:#93c5fd',
            'font-family:Cairo,sans-serif',
            'direction:rtl'
        ].join(';');
        const label = document.createElement('span');
        label.textContent = 'تبديل الحساب إلى: ' + switchUser;
        switchBadge.appendChild(label);
        form.parentNode.insertBefore(switchBadge, form);
        setTimeout(() => pwdInp.focus(), 100);
    }

    function isNetworkFailure(error) {
        const code = String(error && error.code || '').toLowerCase();
        const message = String(error && error.message || '').toLowerCase();
        return [
            'auth/network-request-failed',
            'unavailable',
            'firestore/unavailable',
            'deadline-exceeded',
            'webchannel-connection'
        ].some((part) => code.includes(part) || message.includes(part))
            || message.includes('network')
            || message.includes('failed to fetch')
            || message.includes('offline');
    }

    function toCurrentUser(profile, offline) {
        const displayName = profile.displayName || profile.username;
        return {
            uid: profile.uid,
            username: displayName,
            name: displayName,
            authUsername: profile.username,
            role: profile.role === 'manager'
                ? 'المدير العام'
                : (profile.jobRole || 'موظف'),
            cloudRole: profile.role,
            tenantId: profile.tenantId,
            permissions: profile.permissions && typeof profile.permissions === 'object' ? profile.permissions : {},
            avatar: profile.avatar || 'avatar.svg',
            empId: profile.employeeId || '',
            offline: Boolean(offline),
        };
    }

    function showLoginError(message) {
        errBox.textContent = message;
        errBox.style.display = 'block';
        pwdInp.value = '';
        pwdInp.focus();

        const box = document.querySelector('.login-box');
        if (box) {
            box.style.animation = 'none';
            setTimeout(() => { box.style.animation = 'slideUpFade 0.4s reverse forwards'; }, 10);
            setTimeout(() => { box.style.animation = 'slideUpFade 0.4s forwards'; }, 400);
        }
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const username = userInp.value.trim();
        const password = pwdInp.value;
        const tenantId = localStorage.getItem('mc_tenant_id') || '';

        errBox.style.display = 'none';
        const originalHtml = btnSubmit.innerHTML;
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin"></i> جاري التحقق من الحساب...';

        try {
            let profile = null;
            let offline = false;

            try {
                const { signInWithUsername } = require('./cloud/auth-service');
                profile = await signInWithUsername({ username, password, tenantId });

                const cached = await ipcRenderer.invoke('cloud-cache-credentials', {
                    username,
                    password,
                    profile,
                });
                if (!cached || !cached.ok) {
                    console.warn('[Login] Secure offline cache was not saved:', cached && cached.code);
                }
            } catch (cloudError) {
                if (!isNetworkFailure(cloudError)) throw cloudError;

                const cached = await ipcRenderer.invoke('cloud-offline-authenticate', {
                    username,
                    password,
                    tenantId,
                });

                if (!cached || !cached.ok) {
                    throw new Error('لا يوجد اتصال بالإنترنت ولا توجد بيانات دخول أوفلاين صالحة لهذا الحساب على هذا الجهاز.');
                }
                profile = cached.profile;
                offline = true;
            }

            const authenticatedUser = toCurrentUser(profile, offline);
            localStorage.setItem('mc_tenant_id', profile.tenantId);
            localStorage.setItem('mc_cloud_identity_ready', '1');
            localStorage.setItem('currentUser', JSON.stringify(authenticatedUser));

            btnSubmit.innerHTML = offline
                ? '<i class="ph-fill ph-check-circle"></i> دخول دون اتصال...'
                : '<i class="ph-fill ph-check-circle"></i> تم التحقق...';

            setTimeout(() => {
                window.location.replace('index.html');
            }, 350);
        } catch (error) {
            console.error('[Login] Authentication failed:', error);
            const code = String(error && error.code || '');
            const messages = {
                'auth/invalid-credential': 'اسم المستخدم أو كلمة المرور غير صحيحة.',
                'auth/user-disabled': 'تم إيقاف هذا الحساب من إدارة المنشأة.',
                'auth/too-many-requests': 'محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.',
                'permission-denied': 'تعذر قراءة صلاحيات الحساب من Firebase. تحقق من قواعد Firestore.',
                'auth/network-request-failed': 'تعذر الاتصال. تحقق من الإنترنت أو استخدم حساباً سبق تسجيل دخوله على هذا الجهاز.',
            };
            showLoginError(messages[code] || error.message || 'تعذر تسجيل الدخول. تحقق من البيانات وحالة التفعيل.');
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = originalHtml;
        }
    });
});
