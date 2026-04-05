document.addEventListener('DOMContentLoaded', () => {

    const form = document.querySelector('#settings-form');
    const dropZone = document.getElementById('drop-zone');
    const logoInput = document.getElementById('logo-input');
    const previewLogo = document.getElementById('preview-logo');

    const inputName = document.getElementById('set-name');
    const inputBranch = document.getElementById('set-branch');
    const inputTax = document.getElementById('set-tax');
    const inputTaxRate = document.getElementById('set-tax-rate');
    const inputPhone = document.getElementById('set-phone');
    const inputWhatsapp = document.getElementById('set-whatsapp');
    const inputFooter = document.getElementById('set-footer');

    let base64Logo = '';

    // --- LocalStorage Integration: Load Existing ---
    const saved = localStorage.getItem('restaurant_settings');
    if (saved) {
        const d = JSON.parse(saved);
        if(d.name) inputName.value = d.name;
        if(d.branch) inputBranch.value = d.branch;
        if(d.tax) inputTax.value = d.tax;
        if(d.taxRate !== undefined && d.taxRate !== '') inputTaxRate.value = d.taxRate;
        if(d.phone) inputPhone.value = d.phone;
        if(d.whatsapp) inputWhatsapp.value = d.whatsapp;
        if(d.footer) inputFooter.value = d.footer;
        if(d.logo) {
            base64Logo = d.logo;
            previewLogo.src = base64Logo;
            previewLogo.style.display = 'block';
        }
    }

    // --- Load Printers for Cashier ---
    const setCashierPrinter = document.getElementById('set-cashier-printer');
    const savedCashierPrinter = localStorage.getItem('cashier_printer') || '';
    
    try {
        const { ipcRenderer } = require('electron');
        ipcRenderer.invoke('get-printers').then(printers => {
            if(printers && printers.length > 0) {
                printers.forEach(p => {
                    const option = document.createElement('option');
                    option.value = p.name;
                    option.text = p.name;
                    option.style.color = '#000';
                    if(p.name === savedCashierPrinter) option.selected = true;
                    setCashierPrinter.appendChild(option);
                });
            }
        }).catch(e => console.error(e));
    } catch(e) {}

    // --- Drag & Drop Image Logic ---
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });

    dropZone.addEventListener('drop', handleDrop, false);
    logoInput.addEventListener('change', function() { handleFiles(this.files); });

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }

    function handleFiles(files) {
        if (!files || files.length === 0) return;
        const file = files[0];
        
        if (!file.type.startsWith('image/')) {
            alert('الرجاء رفع صورة فقط');
            return;
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = function() {
            base64Logo = reader.result;
            previewLogo.src = base64Logo;
            previewLogo.style.display = 'block';
        }
    }

    // --- Form Save Logic ---
    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const btn = document.querySelector('.btn-save-settings');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin"></i> جاري حفظ السحابة...';
        btn.style.pointerEvents = 'none';

        const taxRateVal = parseFloat(inputTaxRate.value);
        const data = {
            name: inputName.value || 'هـــش HASH',
            branch: inputBranch.value,
            tax: inputTax.value || '300123456780003',
            taxRate: isNaN(taxRateVal) ? 15 : taxRateVal,
            phone: inputPhone.value,
            whatsapp: inputWhatsapp.value,
            footer: inputFooter.value,
            logo: base64Logo || '1111.png' // شعار هش HASH الرسمي كافتراضي
        };

        localStorage.setItem('restaurant_settings', JSON.stringify(data));
        if (setCashierPrinter) {
            localStorage.setItem('cashier_printer', setCashierPrinter.value);
        }

        setTimeout(() => {
            alert('تم تطبيق إعدادات الهوية بنجاح على النظام الكلي (الكاشير والمطبخ والفواتير)!');
            btn.innerHTML = originalText;
            btn.style.pointerEvents = 'auto';
            
            // Trigger global sync from script.js manually here for immediate visual update
            if(typeof window.syncGlobalSettings === 'function') {
                window.syncGlobalSettings();
            }

        }, 1000);
    });

    // Reset settings
    const resetBtn = document.getElementById('btn-reset-settings');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if(confirm('هل تريد استعادة شعار واسم "هش HASH" ومسح بيانات المطعم الحالية؟')) {
                // مسح بيانات المطعم وإعادة الشعار الرسمي للبرنامج
                localStorage.removeItem('restaurant_settings');
                location.reload();
            }
        });
    }

    // --- Google Drive (OAuth حقيقي + رفع/استعادة) ---
    const btnGoogleLogin = document.getElementById('btn-google-login');
    const gdStatusBox = document.getElementById('google-drive-status');
    const gdIcon = document.getElementById('gd-icon');
    const gdTitle = document.getElementById('gd-title');
    const gdSubtitle = document.getElementById('gd-subtitle');
    const btnGdBackup = document.getElementById('btn-gd-backup');
    const btnGdRestore = document.getElementById('btn-gd-restore');

    let isDriveLinked = null;

    function updateDriveUI() {
        if (isDriveLinked) {
            gdStatusBox.style.background = 'rgba(66, 133, 244, 0.1)';
            gdStatusBox.style.borderColor = '#4285F4';
            gdIcon.className = 'ph-fill ph-cloud-check';
            gdIcon.style.color = '#4285F4';
            gdTitle.innerText = 'متصل بنجاح';
            gdSubtitle.innerText = 'الحساب: ' + (isDriveLinked.email || '—');

            btnGoogleLogin.innerHTML = '<i class="ph-fill ph-sign-out"></i> إلغاء الربط بالحساب';
            btnGoogleLogin.style.background = 'var(--bg-card)';
            btnGoogleLogin.style.border = '1px solid var(--border-light)';
            btnGoogleLogin.style.color = '#EA4335';

            btnGdBackup.style.display = 'block';
            btnGdRestore.style.display = 'block';
        } else {
            gdStatusBox.style.background = 'rgba(234, 67, 53, 0.1)';
            gdStatusBox.style.borderColor = 'rgba(234, 67, 53, 0.3)';
            gdIcon.className = 'ph-fill ph-cloud-slash';
            gdIcon.style.color = '#EA4335';
            gdTitle.innerText = 'غير متصل';
            gdSubtitle.innerText = 'لم يتم ربط أي حساب حتى الآن';

            btnGoogleLogin.innerHTML = '<i class="ph-fill ph-google-logo"></i> تسجيل الدخول بحساب Google';
            btnGoogleLogin.style.background = '#4285F4';
            btnGoogleLogin.style.border = 'none';
            btnGoogleLogin.style.color = 'white';

            btnGdBackup.style.display = 'none';
            btnGdRestore.style.display = 'none';
        }
    }

    (async function refreshGoogleDriveStatus() {
        try {
            const { ipcRenderer } = require('electron');
            const st = await ipcRenderer.invoke('google-drive-status');
            if (!st.configOk) {
                isDriveLinked = null;
                gdSubtitle.innerText =
                    'أضف ملف google-oauth.json بجانب التطبيق (أو متغيرات البيئة) — راجع google-oauth.example.json';
                updateDriveUI();
                return;
            }
            if (st.linked) {
                isDriveLinked = { email: st.email || '', linkedAt: new Date().toISOString() };
                localStorage.setItem('google_drive_linked', JSON.stringify(isDriveLinked));
            } else {
                isDriveLinked = null;
                localStorage.removeItem('google_drive_linked');
            }
            updateDriveUI();
            if (typeof loadDriveAutoUi === 'function') loadDriveAutoUi();
        } catch (e) {
            gdSubtitle.innerText = 'يتطلب تشغيل التطبيق عبر Electron (.exe)';
        }
    })();

    btnGoogleLogin.addEventListener('click', async () => {
        try {
            const { ipcRenderer } = require('electron');
            if (isDriveLinked) {
                if (
                    !confirm(
                        'هل أنت متأكد من إلغاء ربط حساب Google Drive؟ لن يُحذف الملف من Drive، لكن هذا الجهاز لن يصل إليه حتى تعيد الربط.'
                    )
                ) {
                    return;
                }
                await ipcRenderer.invoke('google-drive-disconnect');
                localStorage.removeItem('google_drive_linked');
                isDriveLinked = null;
                updateDriveUI();
                return;
            }

            btnGoogleLogin.disabled = true;
            btnGoogleLogin.innerHTML =
                '<i class="ph-fill ph-spinner-gap ph-spin"></i> انتظر نافذة المتصفح وأكمل تسجيل الدخول...';
            const res = await ipcRenderer.invoke('google-drive-auth-start');
            btnGoogleLogin.disabled = false;

            if (res.success) {
                isDriveLinked = { email: res.email || '', linkedAt: new Date().toISOString() };
                localStorage.setItem('google_drive_linked', JSON.stringify(isDriveLinked));
                alert('تم الربط بنجاح مع Google Drive.');
                updateDriveUI();
            } else {
                alert(
                    res.message ||
                        res.error ||
                        'فشل الربط. تأكد من إضافة عنوان إعادة التوجيه في Google Cloud:\nhttp://127.0.0.1:45231/oauth2callback'
                );
                updateDriveUI();
            }
        } catch (e) {
            alert('خطأ: ' + (e && e.message));
            btnGoogleLogin.disabled = false;
            updateDriveUI();
        }
    });

    btnGdBackup.addEventListener('click', async () => {
        const originalText = btnGdBackup.innerHTML;
        btnGdBackup.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin"></i> جاري الرفع...';
        btnGdBackup.style.pointerEvents = 'none';
        try {
            const { ipcRenderer } = require('electron');
            const backupData = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                backupData[key] = localStorage.getItem(key);
            }
            const res = await ipcRenderer.invoke('google-drive-backup', backupData);
            if (res.success) {
                alert(
                    'تم رفع النسخة إلى Google Drive بنجاح.\nالحجم تقريباً: ' +
                        res.sizeKB +
                        ' KB\n(' +
                        (res.mode === 'update' ? 'تحديث نفس الملف' : 'ملف جديد') +
                        ')'
                );
            } else {
                alert('فشل الرفع: ' + (res.error || res.message || 'غير معروف'));
            }
        } catch (e) {
            alert('خطأ: ' + (e && e.message));
        }
        btnGdBackup.innerHTML = originalText;
        btnGdBackup.style.pointerEvents = 'auto';
    });

    btnGdRestore.addEventListener('click', async () => {
        if (
            !confirm(
                'تحذير: سيتم استبدال قاعدة البيانات على هذا الجهاز وإعدادات localStorage من آخر نسخة على Drive.\n\nأنصح بأخذ نسخة يدوية أولاً.\n\nهل تريد المتابعة؟'
            )
        ) {
            return;
        }
        const originalText = btnGdRestore.innerHTML;
        btnGdRestore.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin"></i> جاري التحميل...';
        btnGdRestore.style.pointerEvents = 'none';
        try {
            const { ipcRenderer } = require('electron');
            const res = await ipcRenderer.invoke('google-drive-restore');
            if (res.success) {
                const ls = res.localStorage || {};
                Object.keys(ls).forEach((k) => {
                    try {
                        localStorage.setItem(k, ls[k]);
                    } catch (e) {}
                });
                ipcRenderer.send('notify-db-changed');
                alert('تمت الاستعادة. سيتم إعادة تحميل الصفحة.');
                location.reload();
            } else {
                alert('فشل الاستعادة: ' + (res.message || res.error || 'غير معروف'));
            }
        } catch (e) {
            alert('خطأ: ' + (e && e.message));
        }
        btnGdRestore.innerHTML = originalText;
        btnGdRestore.style.pointerEvents = 'auto';
    });

    const gdAutoEnabled = document.getElementById('gd-auto-enabled');
    const gdAutoInterval = document.getElementById('gd-auto-interval');
    const gdAutoLast = document.getElementById('gd-auto-last');
    let prevAutoEnabled = false;

    async function loadDriveAutoUi() {
        try {
            const { ipcRenderer } = require('electron');
            const s = await ipcRenderer.invoke('google-drive-get-auto');
            if (gdAutoEnabled) gdAutoEnabled.checked = !!s.enabled;
            if (gdAutoInterval) gdAutoInterval.value = String(s.intervalMinutes || 360);
            prevAutoEnabled = !!s.enabled;
            if (gdAutoLast) {
                let t = s.lastAutoRunAt
                    ? 'آخر نسخ تلقائي ناجح: ' + new Date(s.lastAutoRunAt).toLocaleString('ar-SA')
                    : 'لم يُسجَّل نسخ تلقائي ناجح بعد';
                if (s.lastAutoError) t += ' — آخر خطأ: ' + s.lastAutoError;
                gdAutoLast.textContent = t;
            }
        } catch (e) {}
    }

    async function saveDriveAuto(resetSchedule) {
        try {
            const { ipcRenderer } = require('electron');
            const enabled = gdAutoEnabled ? gdAutoEnabled.checked : false;
            const intervalMinutes = gdAutoInterval ? parseInt(gdAutoInterval.value, 10) || 360 : 360;
            await ipcRenderer.invoke('google-drive-save-auto', {
                enabled,
                intervalMinutes,
                resetSchedule: !!resetSchedule,
            });
            prevAutoEnabled = enabled;
            await loadDriveAutoUi();
        } catch (e) {
            alert('فشل حفظ إعداد النسخ التلقائي');
        }
    }

    if (gdAutoEnabled) {
        gdAutoEnabled.addEventListener('change', async () => {
            const nowOn = gdAutoEnabled.checked;
            await saveDriveAuto(nowOn && !prevAutoEnabled);
        });
    }
    if (gdAutoInterval) {
        gdAutoInterval.addEventListener('change', () => saveDriveAuto(false));
    }

    try {
        const { ipcRenderer } = require('electron');
        ipcRenderer.on('google-drive-auto-backup', () => {
            loadDriveAutoUi();
        });
    } catch (e) {}

    loadDriveAutoUi();

    // --- WhatsApp Bot Logic ---
    const btnWaLink = document.getElementById('btn-wa-link');
    const waStatusText = document.getElementById('wa-status-text');
    const waQrContainer = document.getElementById('wa-qr-container');
    const inputWaAdmin = document.getElementById('set-wa-admin');
    const inputWaHubIp = document.getElementById('set-wa-hub-ip');
    const inputWaLoans = document.getElementById('set-wa-loans');
    const inputWaReports = document.getElementById('set-wa-reports');

    // Load WhatsApp Settings
    const waSettingsRaw = localStorage.getItem('wa_settings');
    if(waSettingsRaw) {
        const waOpts = JSON.parse(waSettingsRaw);
        if(waOpts.admin) inputWaAdmin.value = waOpts.admin;
        if (inputWaHubIp && waOpts.hubIp) inputWaHubIp.value = waOpts.hubIp;
        if(waOpts.loans !== undefined) inputWaLoans.checked = waOpts.loans;
        if(waOpts.reports !== undefined) inputWaReports.checked = waOpts.reports;
        const setExpenses = document.getElementById('set-wa-expenses');
        if(setExpenses && waOpts.expenses !== undefined) setExpenses.checked = waOpts.expenses;
    }

    try {
        const { ipcRenderer } = require('electron');
        const QRCode = require('qrcode');

        function setWaStatus(state) {
            if (state === 'connected') {
                waStatusText.innerText = 'متصل (البوت جاهز ونشط الآن)';
                waStatusText.style.color = '#10b981';
                btnWaLink.innerHTML = '<i class="ph-fill ph-check-circle"></i> البوت نشط الآن';
                btnWaLink.style.background = '#10b981';
                btnWaLink.disabled = true;
                waQrContainer.innerHTML = '<i class="ph-fill ph-check-circle" style="font-size:60px; color:#10b981;"></i><br><span style="color:#10b981;font-weight:700;">واتساب مرتبط بنجاح ✓</span>';
                localStorage.setItem('wa_connected', 'true');
            } else if (state === 'loading') {
                waStatusText.innerText = 'جاري التهيئة...';
                waStatusText.style.color = 'var(--text-muted)';
                btnWaLink.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin"></i> جاري التشغيل...';
                btnWaLink.disabled = true;
                waQrContainer.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin" style="font-size:40px; color:#ccc;"></i>';
            } else if (state === 'disconnected') {
                waStatusText.innerText = 'غير متصل';
                waStatusText.style.color = 'var(--accent-red)';
                btnWaLink.innerHTML = '<i class="ph-bold ph-link"></i> ربط واتساب';
                btnWaLink.disabled = false;
                btnWaLink.style.background = '';
                waQrContainer.innerHTML = '<i class="ph ph-qr-code" style="font-size:60px; color:var(--text-muted);"></i>';
                localStorage.setItem('wa_connected', 'false');
            }
        }

        // Always check current WA status on page load (QR may already be ready in background)
        setWaStatus('loading');
        ipcRenderer.send('wa-check-status');

        // Handle immediate status response (already running)
        ipcRenderer.on('wa-still-loading', () => {
            waStatusText.innerText = 'جاري التهيئة في الخلفية...';
        });

        btnWaLink.addEventListener('click', () => {
            setWaStatus('loading');
            waQrContainer.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin" style="font-size:40px; color:#ccc;"></i>';
            ipcRenderer.send('wa-start');
        });

        // زر التحديث - يعيد الاتصال بدون مسح الجلسة
        const btnWaRefresh = document.getElementById('btn-wa-refresh');
        if(btnWaRefresh) {
            btnWaRefresh.addEventListener('click', () => {
                setWaStatus('loading');
                ipcRenderer.send('wa-refresh');
                setTimeout(() => ipcRenderer.send('wa-check-status'), 2000);
            });
        }

        // زر إلغاء الربط - يمسح الجلسة ويقطع الاتصال نهائياً
        const btnWaDisconnect = document.getElementById('btn-wa-disconnect');
        if(btnWaDisconnect) {
            btnWaDisconnect.addEventListener('click', () => {
                if(!confirm('هل أنت متأكد من إلغاء ربط واتساب؟\nسيتم مسح جلسة الاتصال وستحتاج لمسح QR من جديد.')) return;
                ipcRenderer.send('wa-disconnect');
                setWaStatus('disconnected');
                localStorage.removeItem('wa_connected');
                waQrContainer.innerHTML = '<i class="ph ph-plugs" style="font-size:48px; color:var(--accent-red);"></i><br><small style="color:var(--accent-red); margin-top:8px; display:block;">تم إلغاء الربط</small>';
                waStatusText.innerText = 'تم قطع الاتصال ومسح الجلسة';
            });
        }

        ipcRenderer.on('wa-qr', async (e, qrString) => {
            waStatusText.innerText = 'يرجى مسح الكود باستخدام واتساب (تبويب الواتساب > الأجهزة المرتبطة)';
            waStatusText.style.color = 'var(--accent-orange)';
            btnWaLink.innerHTML = '<i class="ph ph-qr-code"></i> انتظار المسح...';
            try {
                const qrImageBase64 = await QRCode.toDataURL(qrString, {
                    width: 250,
                    margin: 3,
                    color: { dark: '#000000', light: '#ffffff' }
                });
                waQrContainer.innerHTML = `<img src="${qrImageBase64}" style="width:240px;height:240px;border-radius:12px;border:3px solid #10b981;box-shadow:0 0 20px rgba(16,185,129,0.4);background:#fff;display:block;"><br><small style="color:var(--text-muted);font-size:12px;margin-top:6px;display:block;">افتح واتساب &gt; الأجهزة المرتبطة &gt; ربط جهاز</small>`;
            } catch(e) {
                waQrContainer.innerHTML = '<span style="color:red;font-size:12px;">فشل توليد رمز QR</span>';
            }
        });

        ipcRenderer.on('wa-ready', () => {
            setWaStatus('connected');
        });

        ipcRenderer.on('wa-authenticated', () => {
            waStatusText.innerText = 'تم مسح الكود ✓ — جاري تهيئة الجلسة...';
            waStatusText.style.color = '#10b981';
            btnWaLink.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin"></i> جاري الاتصال...';
            btnWaLink.disabled = true;

            let secondsLeft = 35;
            waQrContainer.innerHTML = `
                <div style="text-align:center; padding:10px;">
                    <i class="ph-fill ph-check-circle" style="font-size:52px; color:#10b981;"></i>
                    <div style="margin-top:12px; font-size:15px; color:#10b981; font-weight:800;">تم مسح الكود بنجاح ✓</div>
                    <div style="margin-top:6px; font-size:13px; color:var(--text-muted);">جاري تهيئة الجلسة مع خوادم واتساب...</div>
                    <div style="margin:14px auto; width:190px; height:7px; background:rgba(255,255,255,0.08); border-radius:4px; overflow:hidden;">
                        <div id="wa-cd-fill" style="height:100%; width:100%; background:linear-gradient(90deg,#10b981,#34d399); border-radius:4px; transition:width 1s linear;"></div>
                    </div>
                    <div id="wa-cd-text" style="font-size:13px; color:var(--text-muted);">
                        يُتوقع الاتصال خلال <strong style="color:#10b981; font-size:18px;">${secondsLeft}</strong> ثانية
                    </div>
                </div>`;

            const fillEl = document.getElementById('wa-cd-fill');
            const txtEl  = document.getElementById('wa-cd-text');
            const cdTimer = setInterval(() => {
                secondsLeft--;
                if(fillEl) fillEl.style.width = Math.max((secondsLeft / 35) * 100, 0) + '%';
                if(txtEl) {
                    if(secondsLeft > 0) {
                        txtEl.innerHTML = `يُتوقع الاتصال خلال <strong style="color:#10b981; font-size:18px;">${secondsLeft}</strong> ثانية`;
                    } else {
                        txtEl.innerHTML = '<strong style="color:#10b981;">جاري التأكيد النهائي...</strong>';
                    }
                }
                if(secondsLeft <= 0) clearInterval(cdTimer);
            }, 1000);
        });

        ipcRenderer.on('wa-disconnected', (e, msg) => {
            if (msg === 'not_started') {
                setWaStatus('disconnected');
                return;
            }
            waStatusText.innerText = 'انقطع الاتصال: ' + msg;
            waStatusText.style.color = 'var(--accent-red)';
            btnWaLink.innerHTML = '<i class="ph-bold ph-link"></i> إعادة محاولة الاتصال';
            btnWaLink.disabled = false;
            btnWaLink.style.background = '';
            waQrContainer.innerHTML = '<i class="ph ph-warning-circle" style="font-size:48px; color:var(--accent-red);"></i><br><small style="color:var(--accent-red);">انقطع الاتصال</small>';
            localStorage.setItem('wa_connected', 'false');
        });

    } catch(e) {
        // If not running in Electron
        waStatusText.innerText = 'تقنية الواتساب تتطلب تشغيل النظام عبر التطبيق الفعلي (.exe)';
        waQrContainer.innerHTML = '<i class="ph ph-desktop" style="font-size:48px; color:var(--text-muted);"></i>';
        btnWaLink.disabled = true;
    }

    // Capture save to storage
    form.addEventListener('submit', () => {
        const waData = {
            admin: inputWaAdmin.value,
            hubIp: inputWaHubIp ? inputWaHubIp.value.trim() : '',
            loans: inputWaLoans.checked,
            expenses: document.getElementById('set-wa-expenses') ? document.getElementById('set-wa-expenses').checked : true,
            reports: inputWaReports.checked
        };
        localStorage.setItem('wa_settings', JSON.stringify(waData));
    });

});
