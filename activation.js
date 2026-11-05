document.addEventListener('DOMContentLoaded', async () => {
    const { ipcRenderer } = require('electron');

    const elDeviceId = document.getElementById('act-device-id');
    const elStatus = document.getElementById('act-status-text');
    const elAllowed = document.getElementById('act-allowed-text');
    const elTrialEnd = document.getElementById('act-trial-end');
    const elMessage = document.getElementById('act-message');
    const elLock = document.getElementById('act-lock-banner');
    const btnTrial = document.getElementById('btn-start-trial');
    const btnPermanent = document.getElementById('btn-permanent');
    const btnCheck = document.getElementById('btn-check-status');
    const btnLogin = document.getElementById('btn-go-login');
    const btnCopy = document.getElementById('btn-copy-device');
    const upgradeModal = document.getElementById('act-upgrade-modal');

    function setMsg(text, type) {
        elMessage.textContent = text || '';
        elMessage.className = 'act-message' + (type ? ' ' + type : '');
    }

    function collectRestaurantPackage() {
        let settings = {};
        try {
            settings = JSON.parse(localStorage.getItem('restaurant_settings') || '{}');
        } catch (_) {}
        return {
            restaurantName: String(settings.name || '').trim().slice(0, 120),
            branch: String(settings.branch || '').trim().slice(0, 120),
            phone: String(settings.phone || '').trim().slice(0, 40),
            tax: String(settings.tax || '').trim().slice(0, 40),
        };
    }

    function applyLockFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const lock = params.get('lock');
        if (!lock) return;
        const messages = {
            offline: 'يجب الاتصال بالإنترنت لتوثيق الجهاز. مرّ أكثر من 3 أيام دون مزامنة مع الخادم.',
            time_tamper: 'تم اكتشاف تلاعب بساعة Windows. أعد ضبط الوقت ثم تواصل مع الدعم.',
            trial_tamper: 'بيانات التجربة غير متطابقة بين مسارات التخزين.',
            expired: 'انتهت الفترة التجريبية أو الترخيص.',
            blocked: 'تم إيقاف الترخيص من الإدارة.',
        };
        showLockBanner(messages[lock] || 'النظام مقفل. تحقق من الاتصال أو التفعيل.', 'locked');
        btnTrial.disabled = lock === 'time_tamper' || lock === 'trial_tamper';
    }

    function showLockBanner(text, type) {
        elLock.style.display = 'block';
        elLock.textContent = text;
        // إزالة جميع كلاسات الحالة
        elLock.classList.remove('act-lock--active', 'act-lock--trial', 'act-lock--locked');
        if (type === 'active') {
            elLock.classList.add('act-lock--active');
        } else if (type === 'trial') {
            elLock.classList.add('act-lock--trial');
        } else {
            elLock.classList.add('act-lock--locked');
        }
    }

    function hideLockBanner() {
        elLock.style.display = 'none';
        elLock.className = 'act-lock';
    }

    async function refreshUi() {
        try {
            const info = await ipcRenderer.invoke('license-get-info');
            elDeviceId.textContent = info.deviceId || '—';
            elStatus.textContent = info.statusLabel || info.status || '—';
            elAllowed.textContent = String(info.allowedClients ?? '—');
            elTrialEnd.textContent = info.trialEndsAtLabel || '—';
            if (info.canLogin) {
                btnLogin.style.display = 'flex';
                btnLogin.innerHTML = info.managerProvisioned
                    ? '<i class="ph ph-sign-in"></i> الدخول للنظام'
                    : '<i class="ph ph-user-plus"></i> إنشاء حساب المدير';
            }
        } catch (e) {
            setMsg(e.message, 'err');
        }
    }

    btnCopy.addEventListener('click', () => {
        const t = elDeviceId.textContent;
        if (navigator.clipboard) navigator.clipboard.writeText(t);
        setMsg('تم نسخ معرف الجهاز.', 'ok');
    });

    btnTrial.addEventListener('click', async () => {
        btnTrial.disabled = true;
        setMsg('جاري بدء التجربة والتوثيق...', '');
        try {
            const pkg = collectRestaurantPackage();
            localStorage.setItem('mc_trial_blob_mirror', '1');
            const r = await ipcRenderer.invoke('license-start-trial', pkg);
            if (r.success) {
                if (r.trialBlob) {
                    localStorage.setItem('mc_license_trial_blob', r.trialBlob);
                }
                try {
                    await ipcRenderer.invoke('license-save-ls-trial-blob', r.trialBlob || '');
                } catch (_) {}
                setMsg(
                    r.offline
                        ? 'بدأت التجربة محلياً مؤقتاً. اتصل بالإنترنت لإرسال طلب الاعتماد إلى مالك النظام.'
                        : 'تم إرسال طلب التجربة إلى مالك النظام. بعد الموافقة سيصلك رمز إنشاء حساب المدير.',
                    'ok'
                );
                btnLogin.style.display = 'flex';
                await refreshUi();
            } else {
                setMsg(r.error || 'فشل بدء التجربة', 'err');
            }
        } catch (e) {
            setMsg(e.message, 'err');
        }
        btnTrial.disabled = false;
    });

    btnPermanent.addEventListener('click', async () => {
        btnPermanent.disabled = true;
        setMsg('جاري إرسال طلب التفعيل الدائم...', '');
        try {
            const pkg = collectRestaurantPackage();
            const r = await ipcRenderer.invoke('license-request-permanent', pkg);
            if (r.success) {
                setMsg('تم إرسال طلب التفعيل. انتظر موافقة الإدارة ثم اضغط «التحقق من حالة التفعيل».', 'ok');
            } else {
                setMsg(r.error || 'فشل الإرسال', 'err');
            }
        } catch (e) {
            setMsg(e.message, 'err');
        }
        btnPermanent.disabled = false;
    });

    btnCheck.addEventListener('click', async () => {
        btnCheck.disabled = true;
        setMsg('جاري التحقق من الحالة...', '');
        try {
            const r = await ipcRenderer.invoke('license-check-status');
            if (r.success) {
                if (r.found && r.status === 'active') {
                    hideLockBanner();
                    showLockBanner('✅ تم تفعيل الترخيص بنجاح! يمكنك الآن الدخول إلى النظام.', 'active');
                    setMsg('تم تحديث حالة الترخيص — النظام مفعّل.', 'ok');
                    btnLogin.style.display = 'flex';
                } else if (r.found && r.status === 'trial') {
                    showLockBanner('🟡 الجهاز في فترة التجربة المجانية.', 'trial');
                    setMsg('تم تحديث بيانات التجربة.', 'ok');
                    btnLogin.style.display = 'flex';
                } else if (!r.found) {
                    setMsg('لم يُعثر على ترخيص بعد. ابدأ التجربة أو انتظر التفعيل.', '');
                } else {
                    const statusLabels = {
                        blocked: '🔴 الترخيص موقوف من الإدارة',
                        expired: '🔴 انتهت صلاحية الترخيص',
                    };
                    setMsg(statusLabels[r.status] || ('الحالة: ' + r.status), 'err');
                }
                await refreshUi();
            } else {
                setMsg(r.error || 'فشل الاتصال بالخادم', 'err');
            }
        } catch (e) {
            setMsg(e.message, 'err');
        }
        btnCheck.disabled = false;
    });

    btnLogin.addEventListener('click', async () => {
        try {
            await ipcRenderer.invoke('license-refresh-manual');
            const access = await ipcRenderer.invoke('license-evaluate-access');
            if (!access.ok) {
                setMsg(access.message || 'لا يمكن الدخول حالياً.', 'err');
                return;
            }

            const info = await ipcRenderer.invoke('license-get-info');
            if (info.tenantId) localStorage.setItem('mc_tenant_id', info.tenantId);
            window.location.href = info.managerProvisioned === true
                ? 'login.html'
                : 'manager-setup.html';
        } catch (error) {
            setMsg(error.message || 'تعذر التحقق من اعتماد الجهاز.', 'err');
        }
    });

    document.getElementById('btn-upgrade-close').addEventListener('click', () => {
        upgradeModal.style.display = 'none';
    });

    document.getElementById('btn-upgrade-request').addEventListener('click', async () => {
        const hub = upgradeModal.dataset.hubDeviceId || '';
        const client = upgradeModal.dataset.clientDeviceId || '';
        const r = await ipcRenderer.invoke('license-request-upgrade', { clientDeviceId: client, hubDeviceId: hub });
        setMsg(r.success ? 'تم إرسال طلب الترقية.' : (r.error || 'فشل'), r.success ? 'ok' : 'err');
        upgradeModal.style.display = 'none';
    });

    ipcRenderer.on('license-peer-rejected', (e, data) => {
        upgradeModal.dataset.hubDeviceId = data.hubDeviceId || '';
        upgradeModal.dataset.clientDeviceId = data.clientDeviceId || '';
        document.getElementById('act-upgrade-msg').textContent =
            'تم الوصول للحد الأقصى للأجهزة (' + (data.allowedClients || '?') + '). هل تود طلب ترقية؟';
        upgradeModal.style.display = 'flex';
    });

    ipcRenderer.on('license-killed', (e, data) => {
        const reason = data.reason || 'blocked';
        // إذا كنا بالفعل على صفحة التفعيل — لا نُعيد التحميل، نكتفي بإظهار البنر
        const isOnActivationPage = window.location.href.includes('activation');
        if (isOnActivationPage) {
            const lockMessages = {
                blocked: 'تم إيقاف الترخيص من الإدارة.',
                expired: 'انتهت الفترة التجريبية أو الترخيص.',
                offline: 'يجب الاتصال بالإنترنت لتوثيق الجهاز.',
                time_tamper: 'تم اكتشاف تلاعب بساعة Windows.',
                trial_tamper: 'بيانات التجربة غير متطابقة.',
            };
            showLockBanner(lockMessages[reason] || 'النظام مقفل. تحقق من الاتصال أو التفعيل.', 'locked');
        } else {
            window.location.href = 'activation.html?lock=' + encodeURIComponent(reason);
        }
    });

    applyLockFromUrl();
    try {
        const cachedId = localStorage.getItem('mc_device_id');
        if (cachedId) elDeviceId.textContent = cachedId;
    } catch (_) {}
    setTimeout(async () => {
        await refreshUi();
        try {
            const id = elDeviceId.textContent;
            if (id && id !== '—' && id !== 'جاري التحميل...') {
                localStorage.setItem('mc_device_id', id);
            }
        } catch (_) {}
    }, 0);
});
