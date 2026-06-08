document.addEventListener('DOMContentLoaded', () => {

    (function injectLicenseSettingsPage() {
        const nav = document.querySelector('.sidebar .nav-menu');
        const pagesHost = document.querySelector('.settings-pages-container');
        if (!nav || !pagesHost || document.getElementById('page-license')) return;

        if (!nav.querySelector('[data-target="page-license"]')) {
            const tab = document.createElement('a');
            tab.href = '#';
            tab.className = 'nav-item settings-tab';
            tab.setAttribute('data-target', 'page-license');
            tab.innerHTML = '<i class="ph ph-medal"></i><span>الإصدار والاشتراكات</span>';
            const advTab = nav.querySelector('[data-target="page-advanced"]');
            if (advTab) nav.insertBefore(tab, advTab);
            else nav.appendChild(tab);
        }

        const page = document.createElement('div');
        page.id = 'page-license';
        page.className = 'settings-page';
        page.innerHTML = `
            <div class="settings-grid">
                <div class="settings-card" style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 40px 20px;">
                    <div style="background: var(--accent-blue); width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 20px; box-shadow: 0 10px 25px rgba(59, 130, 246, 0.4);">
                        <i class="ph-fill ph-medal" style="font-size: 40px; color: #fff !important;"></i>
                    </div>
                    <h2 style="margin-bottom: 10px; font-size: 1.8rem; color: var(--text-primary);">نظام إدارة المطاعم</h2>
                    <p style="color: var(--text-muted); font-size: 1rem; margin-bottom: 30px;">الإصدار الحالي: <span dir="ltr">v1.0.25</span></p>
                    
                    <div style="background: var(--bg-card-hover); padding: 25px; border-radius: 16px; width: 100%; max-width: 500px; border: 1px solid var(--border-light); margin-bottom: 30px; text-align: right;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 15px; border-bottom: 1px dashed var(--border-light); padding-bottom: 15px;">
                            <span style="color: var(--text-secondary);"><i class="ph ph-fingerprint"></i> معرّف الجهاز:</span>
                            <strong id="set-license-device-id" dir="ltr" style="user-select: all; font-family: monospace; color: var(--text-primary);">—</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 15px; border-bottom: 1px dashed var(--border-light); padding-bottom: 15px;">
                            <span style="color: var(--text-secondary);"><i class="ph ph-star"></i> حالة النسخة:</span>
                            <span id="set-license-status" style="font-weight: bold; padding: 4px 12px; border-radius: 20px; background: rgba(59, 130, 246, 0.1); color: var(--accent-blue);">—</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 15px; border-bottom: 1px dashed var(--border-light); padding-bottom: 15px;">
                            <span style="color: var(--text-secondary);"><i class="ph ph-devices"></i> الأجهزة المرتبطة المسموحة:</span>
                            <strong id="set-license-allowed" style="color: var(--text-primary);">—</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; display: none;" id="trial-ends-container">
                            <span style="color: var(--text-secondary);"><i class="ph ph-clock-countdown"></i> انتهاء التجربة:</span>
                            <strong id="set-license-trial-ends" dir="ltr" style="color: #e74c3c;">—</strong>
                        </div>
                    </div>

                    <div style="display: flex; gap: 15px; flex-wrap: wrap; justify-content: center; align-items: center;">
                        <button type="button" class="btn btn-primary" id="btn-license-refresh" style="min-width: 200px; justify-content: center;">
                            <i class="ph ph-arrows-clockwise"></i> تحديث الحالة
                        </button>
                        <button type="button" class="btn btn-primary" id="btn-request-permanent" style="min-width: 200px; background-color: #27ae60 !important; border-color: #27ae60 !important; justify-content: center; display: none;">
                            <i class="ph ph-rocket-launch"></i> طلب ترقية للنسخة الدائمة
                        </button>
                        
                        <button type="button" class="btn btn-primary" id="btn-open-extra-devices-modal" style="background-color: var(--accent-blue) !important; border-color: var(--accent-blue) !important; justify-content: center; display: none; min-width: 200px;">
                            <i class="ph ph-plus-circle"></i> طلب إضافة أجهزة
                        </button>
                    </div>
                    <p id="set-license-msg" style="margin-top: 20px; font-size: 14px; color: var(--text-secondary);"></p>
                </div>
            </div>
        `;
        const advPage = document.getElementById('page-advanced');
        if (advPage) pagesHost.insertBefore(page, advPage);
        else pagesHost.appendChild(page);

        // Inject modal directly into body to avoid CSS transform scoping issues
        if (!document.getElementById('modal-extra-devices')) {
            const modalDiv = document.createElement('div');
            modalDiv.id = 'modal-extra-devices';
            modalDiv.className = 'factory-modal-overlay';
            modalDiv.setAttribute('aria-hidden', 'true');
            modalDiv.innerHTML = `
                <div class="factory-modal-box" role="dialog" aria-modal="true" style="text-align: right; padding: 30px;">
                    <h3 class="factory-modal-title" style="margin-top: 0; display: flex; align-items: center; gap: 12px; font-size: 1.4rem; margin-bottom: 15px; color: var(--text-primary);">
                        <i class="ph-fill ph-desktop" style="color: var(--accent-blue); font-size: 1.8rem;"></i>
                        طلب أجهزة إضافية
                    </h3>
                    <p class="factory-modal-text" style="color: var(--text-secondary); margin-bottom: 25px; font-size: 1rem; line-height: 1.6;">
                        حدد عدد الأجهزة الإضافية التي ترغب بربطها بنظامك. سيتم إرسال الطلب للإدارة للمراجعة والموافقة.
                    </p>
                    <div style="margin-bottom: 30px;">
                        <label style="display: block; color: var(--text-secondary); margin-bottom: 10px; font-size: 0.95rem; font-weight: 600;">العدد المطلوب:</label>
                        <input type="number" id="input-extra-devices" min="1" max="50" value="1" class="input-modern" style="text-align: center; font-size: 1.2rem; font-weight: bold;">
                    </div>
                    <div class="factory-modal-actions" style="display: flex; gap: 12px;">
                        <button type="button" id="btn-cancel-extra-devices" class="factory-btn factory-btn-muted" style="flex: 1; justify-content: center; font-size: 1rem; padding: 12px;">إلغاء</button>
                        <button type="button" id="btn-confirm-extra-devices" class="factory-btn" style="flex: 1; background: var(--accent-blue); color: white; border: none; justify-content: center; font-size: 1rem; padding: 12px;"><i class="ph-fill ph-paper-plane-tilt"></i> إرسال الطلب</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modalDiv);
        }

        const btnRef = document.getElementById('btn-license-refresh');
        const btnUpgrade = document.getElementById('btn-request-permanent');
        const btnOpenExtraDevices = document.getElementById('btn-open-extra-devices-modal');
        const modalExtraDevices = document.getElementById('modal-extra-devices');
        const btnCancelExtraDevices = document.getElementById('btn-cancel-extra-devices');
        const btnConfirmExtraDevices = document.getElementById('btn-confirm-extra-devices');
        const inputExtraDevices = document.getElementById('input-extra-devices');
        
        const elDev = document.getElementById('set-license-device-id');
        const elSt = document.getElementById('set-license-status');
        const elAl = document.getElementById('set-license-allowed');
        const elMsg = document.getElementById('set-license-msg');
        const trialContainer = document.getElementById('trial-ends-container');
        const elTrial = document.getElementById('set-license-trial-ends');

        let currentDeviceId = null;

        async function refreshLicenseUi() {
            try {
                const { ipcRenderer } = require('electron');
                const info = await ipcRenderer.invoke('license-get-info');
                if (elDev) elDev.textContent = info.deviceId || '—';
                currentDeviceId = info.deviceId;
                
                if (elSt) {
                    elSt.textContent = info.statusLabel || info.status || '—';
                    if (info.status === 'active') {
                        elSt.style.background = 'rgba(39, 174, 96, 0.15)';
                        elSt.style.color = '#27ae60';
                    } else if (info.status === 'trial') {
                        elSt.style.background = 'rgba(243, 156, 18, 0.15)';
                        elSt.style.color = '#f39c12';
                    } else {
                        elSt.style.background = 'rgba(231, 76, 60, 0.15)';
                        elSt.style.color = '#e74c3c';
                    }
                }
                
                if (elAl) elAl.textContent = String(info.allowedClients ?? '—');
                
                if (info.status === 'trial' && info.trialEndsAtLabel) {
                    trialContainer.style.display = 'flex';
                    if (elTrial) elTrial.textContent = info.trialEndsAtLabel;
                } else {
                    trialContainer.style.display = 'none';
                }

                // Show upgrade button only if not active, otherwise show extra devices button
                if (btnUpgrade) {
                    if (info.status !== 'active') {
                        btnUpgrade.style.display = 'inline-flex';
                        if (btnOpenExtraDevices) btnOpenExtraDevices.style.display = 'none';
                    } else {
                        btnUpgrade.style.display = 'none';
                        if (btnOpenExtraDevices) btnOpenExtraDevices.style.display = 'inline-flex';
                    }
                }

            } catch (e) {
                if (elMsg) elMsg.textContent = e.message;
            }
        }
        refreshLicenseUi();

        btnRef?.addEventListener('click', async () => {
            btnRef.disabled = true;
            if (elMsg) elMsg.textContent = 'جاري التحديث من السحابة...';
            try {
                const { ipcRenderer } = require('electron');
                const r = await ipcRenderer.invoke('license-refresh-manual');
                if (r.success) {
                    if (elMsg) elMsg.textContent = r.found
                        ? 'تم التحديث بنجاح.'
                        : 'لم يُعثر على ترخيص في السحابة بعد.';
                    await refreshLicenseUi();
                } else if (elMsg) elMsg.textContent = r.error || 'فشل التحديث';
            } catch (e) {
                if (elMsg) elMsg.textContent = e.message;
            }
            btnRef.disabled = false;
        });

        btnUpgrade?.addEventListener('click', async () => {
            btnUpgrade.disabled = true;
            const originalHtml = btnUpgrade.innerHTML;
            btnUpgrade.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin"></i> جاري إرسال الطلب...';
            
            try {
                const { ipcRenderer } = require('electron');
                const restaurantSettings = localStorage.getItem('restaurant_settings');
                let restName = '';
                let phone = '';
                if (restaurantSettings) {
                    const parsed = JSON.parse(restaurantSettings);
                    restName = parsed.name || '';
                    phone = parsed.phone || localStorage.getItem('wa_settings') ? JSON.parse(localStorage.getItem('wa_settings')).admin : '';
                }
                
                const r = await ipcRenderer.invoke('license-request-permanent', {
                    restaurantName: restName,
                    phone: phone,
                    adminUsername: localStorage.getItem('admin_username') || '',
                    deviceId: currentDeviceId
                });
                
                if (r.success) {
                    alert('تم إرسال طلب الترقية للنسخة الدائمة بنجاح! سيتم التواصل معك قريباً لتأكيد التفعيل.');
                } else {
                    alert('فشل إرسال الطلب: ' + (r.error || 'خطأ غير معروف'));
                }
            } catch (e) {
                alert('حدث خطأ أثناء إرسال الطلب: ' + e.message);
            }
            
            btnUpgrade.innerHTML = originalHtml;
            btnUpgrade.disabled = false;
        });

        // Modal Logic for Extra Devices
        btnOpenExtraDevices?.addEventListener('click', () => {
            if (modalExtraDevices) {
                modalExtraDevices.classList.add('active');
                modalExtraDevices.setAttribute('aria-hidden', 'false');
                if(inputExtraDevices) inputExtraDevices.focus();
            }
        });

        function closeExtraDevicesModal() {
            if (modalExtraDevices) {
                modalExtraDevices.classList.remove('active');
                modalExtraDevices.setAttribute('aria-hidden', 'true');
            }
        }

        btnCancelExtraDevices?.addEventListener('click', closeExtraDevicesModal);
        
        modalExtraDevices?.addEventListener('click', (e) => {
            if (e.target === modalExtraDevices) closeExtraDevicesModal();
        });

        btnConfirmExtraDevices?.addEventListener('click', async () => {
            const count = parseInt(inputExtraDevices.value, 10);
            if (isNaN(count) || count < 1) {
                alert('الرجاء إدخال عدد صحيح للأجهزة المطلوبة.');
                return;
            }

            btnConfirmExtraDevices.disabled = true;
            const originalHtml = btnConfirmExtraDevices.innerHTML;
            btnConfirmExtraDevices.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin"></i> إرسال...';

            try {
                const { ipcRenderer } = require('electron');
                const restaurantSettings = localStorage.getItem('restaurant_settings');
                let restName = '';
                let phone = '';
                if (restaurantSettings) {
                    const parsed = JSON.parse(restaurantSettings);
                    restName = parsed.name || '';
                    phone = parsed.phone || localStorage.getItem('wa_settings') ? JSON.parse(localStorage.getItem('wa_settings')).admin : '';
                }

                const r = await ipcRenderer.invoke('license-request-extra-devices', {
                    restaurantName: restName,
                    phone: phone,
                    adminUsername: localStorage.getItem('admin_username') || '',
                    deviceId: currentDeviceId,
                    requestedDevicesCount: count
                });

                if (r.success) {
                    alert('تم إرسال طلب زيادة الأجهزة بنجاح! سيتم مراجعة طلبك وإبلاغك عند التفعيل.');
                    closeExtraDevicesModal();
                } else {
                    alert('فشل إرسال الطلب: ' + (r.error || 'خطأ غير معروف'));
                }
            } catch (e) {
                alert('حدث خطأ أثناء إرسال الطلب: ' + e.message);
            }

            btnConfirmExtraDevices.innerHTML = originalHtml;
            btnConfirmExtraDevices.disabled = false;
        });
    })();

    const selPerf = document.getElementById('set-perf-mode');
    const perfStatus = document.getElementById('set-perf-status');
    function updatePerfStatusText() {
        if (!perfStatus || !window.MC_PERF) return;
        let mode = 'auto';
        try {
            mode = localStorage.getItem('mc_perf_override') || 'auto';
        } catch (_) {}
        if (mode === 'weak') {
            perfStatus.textContent = 'الوضع الحالي: توفير طاقة (يدوي)';
        } else if (mode === 'strong') {
            perfStatus.textContent = 'الوضع الحالي: أداء كامل (يدوي)';
        } else if (window.MC_PERF.isWeak) {
            perfStatus.textContent = 'تلقائي: توفير طاقة — تم اكتشاف جهاز ضعيف';
        } else {
            perfStatus.textContent = 'تلقائي: أداء كامل';
        }
    }
    if (selPerf) {
        (async () => {
            try {
                const { ipcRenderer } = require('electron');
                const disk = await ipcRenderer.invoke('mc-get-perf-override');
                if (disk && disk.override) {
                    localStorage.setItem('mc_perf_override', disk.override);
                    selPerf.value = disk.override;
                } else {
                    selPerf.value = localStorage.getItem('mc_perf_override') || 'auto';
                }
            } catch (_) {
                try {
                    selPerf.value = localStorage.getItem('mc_perf_override') || 'auto';
                } catch (__) {
                    selPerf.value = 'auto';
                }
            }
            updatePerfStatusText();
        })();
        selPerf.addEventListener('change', () => {
            if (window.MC_PERF && typeof window.MC_PERF.setOverride === 'function') {
                window.MC_PERF.setOverride(selPerf.value);
            } else {
                try {
                    localStorage.setItem('mc_perf_override', selPerf.value);
                    const { ipcRenderer } = require('electron');
                    ipcRenderer.invoke('mc-save-perf-override', selPerf.value).finally(() => {
                        window.location.reload();
                    });
                } catch (_) {
                    window.location.reload();
                }
            }
        });
    }

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
    const selCurrencyPreset = document.getElementById('set-currency-preset');
    const wrapCurrencyCustom = document.getElementById('set-currency-custom-wrap');
    const inputCurrencySymbol = document.getElementById('set-currency-symbol');
    const inputCurrencyLabel = document.getElementById('set-currency-label');

    let base64Logo = '';

    function toggleCurrencyCustom() {
        if (!wrapCurrencyCustom || !selCurrencyPreset) return;
        wrapCurrencyCustom.style.display = selCurrencyPreset.value === 'CUSTOM' ? 'block' : 'none';
    }

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
        if (selCurrencyPreset && d.currencyPreset) selCurrencyPreset.value = d.currencyPreset;
        if (inputCurrencySymbol && d.currencySymbol) inputCurrencySymbol.value = d.currencySymbol;
        if (inputCurrencyLabel && d.currencyLabel) inputCurrencyLabel.value = d.currencyLabel;
    }
    toggleCurrencyCustom();
    if (selCurrencyPreset) selCurrencyPreset.addEventListener('change', toggleCurrencyCustom);

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
        let prev = {};
        try {
            const pr = localStorage.getItem('restaurant_settings');
            prev = pr ? JSON.parse(pr) : {};
        } catch (e) {}
        const data = {
            ...prev,
            name: inputName.value || 'Mister Casher',
            branch: inputBranch.value,
            tax: inputTax.value || '300123456780003',
            taxRate: isNaN(taxRateVal) ? 15 : taxRateVal,
            phone: inputPhone.value,
            whatsapp: inputWhatsapp.value,
            footer: inputFooter.value,
            logo: base64Logo || '2222.png',
            currencyPreset: selCurrencyPreset ? selCurrencyPreset.value : 'SAR',
        };
        if (data.currencyPreset === 'CUSTOM') {
            data.currencySymbol = inputCurrencySymbol ? inputCurrencySymbol.value.trim() : '';
            data.currencyLabel = inputCurrencyLabel ? inputCurrencyLabel.value.trim() : '';
        } else {
            delete data.currencySymbol;
            delete data.currencyLabel;
        }

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
            if(confirm('هل تريد استعادة شعار واسم "Mister Casher" ومسح بيانات المطعم الحالية؟')) {
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
            !await ModernDialog.confirm(
                'تحذير: سيتم استبدال قاعدة البيانات على هذا الجهاز وإعدادات localStorage من آخر نسخة على Drive.\n\nأنصح بأخذ نسخة يدوية أولاً.\n\nهل تريد المتابعة؟',
                'تأكيد الاستعادة السحابية'
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
                await ModernDialog.alert('تمت الاستعادة بنجاح. سيتم الآن إعادة تحميل الشاشة.', 'نجاح');
                location.reload();
            } else {
                await ModernDialog.alert('فشل الاستعادة: ' + (res.message || res.error || 'غير معروف'), 'فشل');
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

    // --- نسخ احتياطي على قرص / USB ---
    const elLocalPath = document.getElementById('local-backup-path');
    const btnLocalBrowse = document.getElementById('btn-local-backup-browse');
    const btnLocalOpen = document.getElementById('btn-local-backup-open');
    const btnLocalNow = document.getElementById('btn-local-backup-now');
    const btnLocalRestore = document.getElementById('btn-local-backup-restore');
    const restoreSection = document.getElementById('restore-backup-section');
    const restorePathEl = document.getElementById('restore-backup-path');
    const btnRestoreBrowse = document.getElementById('btn-restore-browse');
    const btnRestoreConfirm = document.getElementById('btn-restore-confirm');
    const btnRestoreCancel = document.getElementById('btn-restore-cancel');
    const restoreInfo = document.getElementById('restore-backup-info');
    const restoreInfoDate = document.getElementById('restore-info-date');
    const restoreInfoOrders = document.getElementById('restore-info-orders');
    const restoreInfoProducts = document.getElementById('restore-info-products');
    const localAutoEn = document.getElementById('local-backup-auto-enabled');
    const localAutoInt = document.getElementById('local-backup-auto-interval');
    const localAutoLast = document.getElementById('local-backup-auto-last');
    let prevLocalAutoEnabled = false;
    let selectedRestoreFolder = null;

    function collectAllLocalStorage() {
        const o = {};
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            o[k] = localStorage.getItem(k);
        }
        return o;
    }

    async function refreshLocalBackupUi() {
        try {
            const { ipcRenderer } = require('electron');
            const s = await ipcRenderer.invoke('local-disk-backup-get-settings');
            const p = (s && s.folderPath) || '';
            if (elLocalPath) {
                elLocalPath.textContent = p || 'لم يُحدد بعد — يمكنك الضغط «نسخ الآن» لاختيار المجلد';
            }
            if (btnLocalOpen) {
                btnLocalOpen.style.display = p ? 'inline-flex' : 'none';
            }
            if (localAutoEn) {
                localAutoEn.checked = !!(s && s.enabled);
                prevLocalAutoEnabled = !!(s && s.enabled);
            }
            if (localAutoInt && s) localAutoInt.value = String(s.intervalMinutes || 360);
            if (localAutoLast && s) {
                let t = s.lastAutoRunAt
                    ? 'آخر نسخ تلقائي ناجح: ' + new Date(s.lastAutoRunAt).toLocaleString('ar-SA')
                    : 'لم يُسجَّل نسخ تلقائي ناجح بعد';
                if (s.lastAutoError) t += ' — آخر خطأ: ' + s.lastAutoError;
                localAutoLast.textContent = t;
            }
        } catch (e) {}
    }

    async function saveLocalBackupSettings(partial) {
        try {
            const { ipcRenderer } = require('electron');
            await ipcRenderer.invoke('local-disk-backup-save-settings', partial);
            await refreshLocalBackupUi();
        } catch (e) {
            alert('فشل حفظ إعداد النسخ المحلي');
        }
    }

    if (btnLocalBrowse) {
        btnLocalBrowse.addEventListener('click', async () => {
            try {
                const { ipcRenderer } = require('electron');
                const r = await ipcRenderer.invoke('local-disk-backup-pick-folder');
                if (r.canceled || !r.folderPath) return;
                await saveLocalBackupSettings({ folderPath: r.folderPath });
            } catch (e) {
                alert('خطأ: ' + (e && e.message));
            }
        });
    }

    if (btnLocalOpen) {
        btnLocalOpen.addEventListener('click', async () => {
            try {
                const { ipcRenderer } = require('electron');
                const s = await ipcRenderer.invoke('local-disk-backup-get-settings');
                const p = (s && s.folderPath) || '';
                if (!p) return;
                const res = await ipcRenderer.invoke('local-disk-backup-open-folder', p);
                if (!res.success && res.error) console.warn(res.error);
            } catch (e) {}
        });
    }

    if (btnLocalNow) {
        btnLocalNow.addEventListener('click', async () => {
            const orig = btnLocalNow.innerHTML;
            btnLocalNow.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin"></i> جاري النسخ...';
            btnLocalNow.style.pointerEvents = 'none';
            try {
                const { ipcRenderer } = require('electron');
                const s = await ipcRenderer.invoke('local-disk-backup-get-settings');
                const parentDir = (s && s.folderPath) || '';
                const res = await ipcRenderer.invoke('local-disk-backup-execute', {
                    parentDir: parentDir || undefined,
                    localStorageSnapshot: collectAllLocalStorage(),
                });
                if (res.canceled) {
                    /* لا شيء */
                } else if (res.success) {
                    await ModernDialog.alert('تم حفظ النسخة بنجاح في:\n' + (res.destDir || ''), 'اكتمل النسخ الاحتياطي');
                } else {
                    await ModernDialog.alert('فشل النسخ: ' + (res.error || 'غير معروف'), 'خطأ');
                }
            } catch (e) {
                await ModernDialog.alert('خطأ: ' + (e && e.message), 'خطأ');
            }
            btnLocalNow.innerHTML = orig;
            btnLocalNow.style.pointerEvents = 'auto';
        });
    }

    // زر استعادة نسخة احتياطية
    if (btnLocalRestore) {
        btnLocalRestore.addEventListener('click', () => {
            if (restoreSection.style.display === 'none') {
                restoreSection.style.display = 'block';
                btnLocalRestore.innerHTML = '<i class="ph-fill ph-x-circle"></i> إغلاق استعادة النسخة';
            } else {
                restoreSection.style.display = 'none';
                btnLocalRestore.innerHTML = '<i class="ph-fill ph-download-simple"></i> استعادة نسخة احتياطية';
            }
        });
    }

    // اختيار مجلد النسخة الاحتياطية
    if (btnRestoreBrowse) {
        btnRestoreBrowse.addEventListener('click', async () => {
            try {
                const { ipcRenderer } = require('electron');
                const r = await ipcRenderer.invoke('local-disk-backup-pick-folder');
                if (r.canceled || !r.folderPath) return;
                
                selectedRestoreFolder = r.folderPath;
                restorePathEl.textContent = r.folderPath;
                
                // فحص محتوى المجلد وعرض المعلومات
                const info = await ipcRenderer.invoke('restore-backup-get-info', r.folderPath);
                if (info.success) {
                    restoreInfo.style.display = 'block';
                    restoreInfoDate.textContent = info.date || '-';
                    restoreInfoOrders.textContent = info.ordersCount || '0';
                    restoreInfoProducts.textContent = info.productsCount || '0';
                } else {
                    restoreInfo.style.display = 'none';
                    alert('⚠️ هذا المجلد لا يحتوي على نسخة احتياطية صالحة!\n\nتأكد من اختيار مجلد HashPOS_backup_xxx');
                }
            } catch (e) {
                alert('خطأ: ' + (e && e.message));
            }
        });
    }

    // إلغاء الاستعادة
    if (btnRestoreCancel) {
        btnRestoreCancel.addEventListener('click', () => {
            restoreSection.style.display = 'none';
            btnLocalRestore.innerHTML = '<i class="ph-fill ph-download-simple"></i> استعادة نسخة احتياطية';
            selectedRestoreFolder = null;
            restorePathEl.textContent = 'لم يتم اختيار مجلد بعد';
            restoreInfo.style.display = 'none';
        });
    }

    // تأكيد الاستعادة
    if (btnRestoreConfirm) {
        btnRestoreConfirm.addEventListener('click', async () => {
            if (!selectedRestoreFolder) {
                alert('⚠️ يرجى اختيار مجلد النسخة الاحتياطية أولاً!');
                return;
            }

            const confirmMsg = `⚠️ تأكيد استعادة النسخة الاحتياطية\n\n` +
                `سيتم استبدال قاعدة البيانات الحالية بالكامل!\n\n` +
                `📂 النسخة المختارة:\n${selectedRestoreFolder}\n\n` +
                `هل أنت متأكد من المتابعة؟`;

            if (!await ModernDialog.confirm(confirmMsg, 'تأكيد الاستعادة')) {
                return;
            }

            const origText = btnRestoreConfirm.innerHTML;
            btnRestoreConfirm.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin"></i> جاري الاستعادة...';
            btnRestoreConfirm.disabled = true;

            try {
                const { ipcRenderer } = require('electron');
                const res = await ipcRenderer.invoke('restore-backup-execute', {
                    backupFolder: selectedRestoreFolder,
                });

                if (res.success) {
                    await ModernDialog.alert('✅ تم استعادة النسخة الاحتياطية بنجاح!\n\nسيتم الآن إعادة تشغيل البرنامج لتطبيق البيانات الجديدة.', 'نجاح الاستعادة');
                    ipcRenderer.send('app-reload');
                } else {
                    await ModernDialog.alert('❌ فشلت عملية الاستعادة:\n' + (res.error || 'خطأ غير معروف'), 'فشل');
                }
            } catch (e) {
                await ModernDialog.alert('❌ خطأ أثناء الاستعادة:\n' + (e && e.message), 'خطأ');
            } finally {
                btnRestoreConfirm.innerHTML = origText;
                btnRestoreConfirm.disabled = false;
            }
        });
    }

    if (localAutoEn) {
        localAutoEn.addEventListener('change', async () => {
            const nowOn = localAutoEn.checked;
            const s = await (async () => {
                try {
                    const { ipcRenderer } = require('electron');
                    return await ipcRenderer.invoke('local-disk-backup-get-settings');
                } catch (e) {
                    return {};
                }
            })();
            if (nowOn && !(s && s.folderPath)) {
                localAutoEn.checked = false;
                alert('حدّد أولاً مجلداً هدفاً بزر «اختيار مجلد» (قرص آخر أو USB).');
                return;
            }
            await saveLocalBackupSettings({
                enabled: nowOn,
                resetSchedule: nowOn && !prevLocalAutoEnabled,
            });
            prevLocalAutoEnabled = nowOn;
        });
    }

    if (localAutoInt) {
        localAutoInt.addEventListener('change', async () => {
            const mins = parseInt(localAutoInt.value, 10) || 360;
            await saveLocalBackupSettings({ intervalMinutes: mins });
        });
    }

    try {
        const { ipcRenderer } = require('electron');
        ipcRenderer.on('local-disk-auto-backup', () => {
            refreshLocalBackupUi();
        });
    } catch (e) {}

    refreshLocalBackupUi();

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
        // If admin exists in storage, always prefer it over the HTML default.
        if(waOpts.admin) inputWaAdmin.value = waOpts.admin;
        if (inputWaHubIp && waOpts.hubIp) inputWaHubIp.value = waOpts.hubIp;
        if(waOpts.loans !== undefined) inputWaLoans.checked = waOpts.loans;
        if(waOpts.reports !== undefined) inputWaReports.checked = waOpts.reports;
        const setExpenses = document.getElementById('set-wa-expenses');
        if(setExpenses && waOpts.expenses !== undefined) setExpenses.checked = waOpts.expenses;

        // Repair case: wa_settings exists but admin is empty, while the UI has a value (HTML default or user-filled).
        // Without this, the input may look filled but staff/accounting pages will still read an empty admin and skip sending.
        try {
            const uiAdmin = (inputWaAdmin?.value || '').trim();
            if (!waOpts.admin && uiAdmin) {
                waOpts.admin = uiAdmin;
                localStorage.setItem('wa_settings', JSON.stringify(waOpts));
                console.warn('[WA][Settings] wa_settings.admin was empty -> repaired from UI value.');
            }
        } catch (e) {}
    } else {
        // Bootstrap wa_settings from currently visible UI values (including default admin value)
        const waBootstrap = {
            admin: (inputWaAdmin?.value || '').trim(),
            hubIp: (inputWaHubIp?.value || '').trim(),
            loans: inputWaLoans ? inputWaLoans.checked : true,
            expenses: document.getElementById('set-wa-expenses') ? document.getElementById('set-wa-expenses').checked : true,
            reports: inputWaReports ? inputWaReports.checked : true
        };
        localStorage.setItem('wa_settings', JSON.stringify(waBootstrap));
        console.warn('[WA][Settings] wa_settings was missing -> bootstrapped from current form values.');
    }

    try {
        const { ipcRenderer } = require('electron');
        const QRCode = require('qrcode');

        // ── تهيئة الوضع الافتراضي (النافذة المتخفية دائماً) ─────────────────────────────────
        localStorage.setItem('wa_mode', 'bot');

        const waBadge = document.getElementById('wa-connection-badge');
        const waDot = document.getElementById('wa-connection-dot');
        const waStatusTextBadge = document.getElementById('wa-connection-status-text');

        window.setWaStatus = function(status) {
            if (!waBadge) return;
            if (status === 'connected') {
                waBadge.style.background = 'rgba(37,211,102,0.15)';
                waBadge.style.color = '#10b981';
                if (waDot) {
                    waDot.style.background = '#10b981';
                    waDot.style.boxShadow = '0 0 5px #10b981';
                }
                if (waStatusTextBadge) waStatusTextBadge.textContent = 'متصل نشط';
                waStatusText.innerText = 'الواتساب متصل ويعمل بشكل سليم';
                waStatusText.style.color = '#10b981';
                if (waQrContainer) waQrContainer.style.display = 'none';
                localStorage.setItem('wa_connected', 'true');
            } else if (status === 'loading') {
                waBadge.style.background = 'rgba(245,158,11,0.15)';
                waBadge.style.color = '#f59e0b';
                if (waDot) {
                    waDot.style.background = '#f59e0b';
                    waDot.style.boxShadow = '0 0 5px #f59e0b';
                }
                if (waStatusTextBadge) waStatusTextBadge.textContent = 'جاري الاتصال...';
                waStatusText.innerText = 'جاري التحقق من الاتصال...';
                waStatusText.style.color = '#f59e0b';
            } else {
                waBadge.style.background = 'rgba(239,68,68,0.15)';
                waBadge.style.color = '#ef4444';
                if (waDot) {
                    waDot.style.background = '#ef4444';
                    waDot.style.boxShadow = '0 0 5px #ef4444';
                }
                if (waStatusTextBadge) waStatusTextBadge.textContent = 'غير متصل';
                waStatusText.innerText = 'غير متصل. يرجى مسح الرمز أو التحقق من الاتصال.';
                waStatusText.style.color = '#ef4444';
                localStorage.setItem('wa_connected', 'false');
            }
        };

        // التحقق المبدئي من الاتصال عند تحميل الإعدادات
        setTimeout(() => {
            setWaStatus('loading');
            ipcRenderer.send('wa-check-status');
        }, 1000);

        // زر التفعيل الرئيسي (فتح نافذة واتساب)
        btnWaLink.addEventListener('click', () => {
            ipcRenderer.send('wa-show-window');
            waStatusText.innerText = 'تم فتح نافذة واتساب — امسح الكود ثم أغلق النافذة (أو تصفح الواتساب)';
            waStatusText.style.color = '#25D366';
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
            admin: (inputWaAdmin?.value || '').trim(),
            hubIp: inputWaHubIp ? inputWaHubIp.value.trim() : '',
            loans: inputWaLoans.checked,
            expenses: document.getElementById('set-wa-expenses') ? document.getElementById('set-wa-expenses').checked : true,
            reports: inputWaReports.checked
        };
        localStorage.setItem('wa_settings', JSON.stringify(waData));
    });

    // --- تصفير النظام بالكامل (يظهر للمدير العام فقط) ---
    (function initFactoryReset() {
        const EMPTY_DB = {
            orders: [], products: [], categories: [], inventory: [],
            purchases: [], suppliers: [], inventoryTx: [], returns: [],
            expenses: [], bankTransfers: [], hrExpenses: [], otherIncome: [],
            employees: [], attendance: [], penaltyRules: [],
            chartOfAccounts: [], journalEntries: [],
            systemNotifications: [], inventoryAlertState: {}
        };

        let cUser = {};
        try {
            cUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        } catch (e) { /* ignore */ }

        const wrap = document.getElementById('settings-factory-reset-wrap');
        if (wrap && cUser.role === 'المدير العام') {
            wrap.style.display = '';
        }

        const mConfirm = document.getElementById('modal-factory-confirm');
        const mPwd = document.getElementById('modal-factory-password');
        const inpPwd = document.getElementById('factory-pwd-input');
        const btnOpen = document.getElementById('btn-factory-reset-open');
        if (!btnOpen || !mConfirm || !mPwd || !inpPwd) return;

        function openModal(el) {
            el.setAttribute('aria-hidden', 'false');
            window.openModalLayer(el);
        }
        function closeModal(el) {
            window.closeModalLayer(el);
            el.setAttribute('aria-hidden', 'true');
        }

        btnOpen.addEventListener('click', () => openModal(mConfirm));

        const btnNo = document.getElementById('btn-factory-confirm-no');
        const btnYes = document.getElementById('btn-factory-confirm-yes');
        const btnPwdCancel = document.getElementById('btn-factory-pwd-cancel');
        const btnPwdSubmit = document.getElementById('btn-factory-pwd-submit');
        if (btnNo) btnNo.addEventListener('click', () => closeModal(mConfirm));
        if (btnYes) {
            btnYes.addEventListener('click', () => {
                closeModal(mConfirm);
                inpPwd.value = '';
                openModal(mPwd);
                setTimeout(() => inpPwd.focus(), 80);
            });
        }
        if (btnPwdCancel) {
            btnPwdCancel.addEventListener('click', () => {
                closeModal(mPwd);
                inpPwd.value = '';
            });
        }
        if (btnPwdSubmit) {
            btnPwdSubmit.addEventListener('click', async () => {
                const pwd = inpPwd.value.trim();
                const expected = localStorage.getItem('admin_pwd') || '123456';
                if (pwd !== expected) {
                    alert('كلمة السر غير صحيحة. أدخل نفس كلمة سر حساب المدير العام المستخدمة في شاشة تسجيل الدخول.');
                    return;
                }
                if (typeof window.dbWrite !== 'function') {
                    alert('تعذر الاتصال بقاعدة البيانات. شغّل التطبيق من البرنامج الرسمي (Electron).');
                    return;
                }
                const prevHtml = btnPwdSubmit.innerHTML;
                btnPwdSubmit.disabled = true;
                btnPwdSubmit.innerHTML = '<i class="ph ph-spinner-gap ph-spin"></i> جاري التصفير...';
                try {
                    const scopeEl = document.querySelector('input[name="factory-reset-scope"]:checked');
                    const scope = scopeEl && scopeEl.value === 'lan' ? 'lan' : 'local';
                    const writeOpts = { broadcast: false };
                    const ok = await window.dbWrite(JSON.parse(JSON.stringify(EMPTY_DB)), writeOpts);
                    if (!ok) {
                        alert('فشل حفظ قاعدة البيانات. لم يُمس التخزين المحلي.');
                        return;
                    }
                    if (scope === 'lan') {
                        try {
                            const { ipcRenderer } = require('electron');
                            ipcRenderer.send('broadcast-lan-factory-reset');
                        } catch (ipcErr) {
                            alert('تعذر إخطار الأجهزة الأخرى. شغّل التطبيق من Electron، أو اختر «هذا الجهاز فقط». تم حفظ القاعدة الفارغة على هذا الجهاز فقط.');
                        }
                    }
                    const aUser = localStorage.getItem('admin_username');
                    const aPwd = localStorage.getItem('admin_pwd');
                    window._networkSyncing = true;
                    try {
                        localStorage.clear();
                        if (aUser != null && aUser !== '') {
                            localStorage.setItem('admin_username', aUser);
                        }
                        if (aPwd != null && aPwd !== '') {
                            localStorage.setItem('admin_pwd', aPwd);
                        }
                    } finally {
                        window._networkSyncing = false;
                    }
                    closeModal(mPwd);
                    window.location.href = 'login.html';
                } catch (err) {
                    console.error(err);
                    alert('حدث خطأ أثناء التصفير: ' + (err && err.message ? err.message : String(err)));
                } finally {
                    btnPwdSubmit.disabled = false;
                    btnPwdSubmit.innerHTML = prevHtml;
                }
            });
        }

        mConfirm.addEventListener('click', (e) => {
            if (e.target === mConfirm) closeModal(mConfirm);
        });
        mPwd.addEventListener('click', (e) => {
            if (e.target === mPwd) closeModal(mPwd);
        });
        inpPwd.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') btnPwdSubmit.click();
        });
    })();

    // --- تصفير العمليات الحسابية فقط (يبقي المنتجات والأصناف والإعدادات) ---
    (function initOpsReset() {
        const btnOpen   = document.getElementById('btn-ops-reset-open');
        const mConfirm  = document.getElementById('modal-ops-reset-confirm');
        const mPwd      = document.getElementById('modal-ops-reset-password');
        const inpPwd    = document.getElementById('ops-pwd-input');
        const btnNo     = document.getElementById('btn-ops-confirm-no');
        const btnYes    = document.getElementById('btn-ops-confirm-yes');
        const btnCancel = document.getElementById('btn-ops-pwd-cancel');
        const btnSubmit = document.getElementById('btn-ops-pwd-submit');
        if (!btnOpen || !mConfirm || !mPwd || !inpPwd) return;

        function openM(el)  { el.setAttribute('aria-hidden','false'); window.openModalLayer(el); }
        function closeM(el) { window.closeModalLayer(el); el.setAttribute('aria-hidden','true'); }

        btnOpen.addEventListener('click', () => openM(mConfirm));
        if (btnNo)    btnNo.addEventListener('click',    () => closeM(mConfirm));
        if (btnYes)   btnYes.addEventListener('click',   () => { closeM(mConfirm); inpPwd.value = ''; openM(mPwd); setTimeout(() => inpPwd.focus(), 80); });
        if (btnCancel) btnCancel.addEventListener('click', () => { closeM(mPwd); inpPwd.value = ''; });

        mConfirm.addEventListener('click', (e) => { if (e.target === mConfirm) closeM(mConfirm); });
        mPwd.addEventListener('click',     (e) => { if (e.target === mPwd)     closeM(mPwd); });
        inpPwd.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnSubmit.click(); });

        if (btnSubmit) {
            btnSubmit.addEventListener('click', async () => {
                const pwd      = inpPwd.value.trim();
                const expected = localStorage.getItem('admin_pwd') || '123456';
                if (pwd !== expected) {
                    alert('كلمة السر غير صحيحة.');
                    return;
                }
                if (typeof window.dbRead !== 'function' || typeof window.dbWrite !== 'function') {
                    alert('تعذر الاتصال بقاعدة البيانات. شغّل التطبيق من البرنامج الرسمي (Electron).');
                    return;
                }
                const prevHtml = btnSubmit.innerHTML;
                btnSubmit.disabled = true;
                btnSubmit.innerHTML = '<i class="ph ph-spinner-gap ph-spin"></i> جاري التصفير...';
                try {
                    // اقرأ قاعدة البيانات الحالية
                    const currentDb = await window.dbRead();

                    // احتفظ بالبيانات الثابتة (المنتجات، الأصناف، المخزون، الموردين، الموظفين، إلخ)
                    const preserved = {
                        products:         currentDb.products         || [],
                        categories:       currentDb.categories       || [],
                        inventory:        currentDb.inventory        || [],
                        suppliers:        currentDb.suppliers        || [],
                        employees:        currentDb.employees        || [],
                        penaltyRules:     currentDb.penaltyRules     || [],
                        chartOfAccounts:  currentDb.chartOfAccounts  || [],
                        customers:        currentDb.customers        || [],
                        inventoryAlertState: currentDb.inventoryAlertState || {},
                    };

                    // قاعدة بيانات جديدة: احتفظ بالثوابت وصفّر العمليات
                    const newDb = {
                        ...preserved,
                        orders:              [],
                        purchases:           [],
                        returns:             [],
                        expenses:            [],
                        bankTransfers:       [],
                        hrExpenses:          [],
                        otherIncome:         [],
                        inventoryTx:         [],
                        journalEntries:      [],
                        attendance:          [],
                        systemNotifications: [],
                    };

                    const ok = await window.dbWrite(newDb, { broadcast: false });
                    if (!ok) {
                        alert('فشل حفظ قاعدة البيانات. لم تُمس البيانات.');
                        return;
                    }

                    // مسح المفاتيح الحسابية من localStorage دون المساس بالإعدادات
                    const keysToRemove = [
                        'current_shift', 'shift_history', 'daily_summary',
                        'cashier_session', 'open_orders', 'pending_orders',
                        'last_sale_no', 'last_purchase_no', 'last_expense_no',
                        'last_return_no', 'last_order_no',
                    ];
                    keysToRemove.forEach(k => { try { localStorage.removeItem(k); } catch(e){} });

                    closeM(mPwd);
                    alert('✅ تم تصفير جميع العمليات الحسابية بنجاح!\n\nالأصناف والمنتجات والإعدادات ظلت كما هي.\nسيتم إعادة تحميل الصفحة الآن.');
                    location.reload();
                } catch (err) {
                    console.error(err);
                    alert('حدث خطأ أثناء التصفير: ' + (err && err.message ? err.message : String(err)));
                } finally {
                    btnSubmit.disabled = false;
                    btnSubmit.innerHTML = prevHtml;
                }
            });
        }
    })();

    // --- Settings Tab Switching ---
    const tabs = document.querySelectorAll('.settings-tab');
    const pages = document.querySelectorAll('.settings-page');
    const tabTitle = document.getElementById('current-tab-title');

    if (tabs.length > 0) {
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = tab.getAttribute('data-target');
                if (!targetId) return;

                // Update Active Tab
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Update Active Page
                pages.forEach(p => {
                    p.classList.remove('active');
                });
                
                const targetPage = document.getElementById(targetId);
                if (targetPage) {
                    targetPage.classList.add('active');
                }

                // Update Title in Header
                if (tabTitle) {
                    tabTitle.textContent = tab.querySelector('span').textContent;
                }

                // Hide Action Buttons if on Support or License Page
                const actionBar = document.querySelector('.settings-actions-bar');
                if (actionBar) {
                    actionBar.style.display = (targetId === 'page-support' || targetId === 'page-license') ? 'none' : 'flex';
                }

                // If support page, update WhatsApp link with restaurant name
                if (targetId === 'page-support') {
                    const waSupportLink = document.getElementById('wa-support-link');
                    if (waSupportLink) {
                        let restaurantName = 'غير محدد';
                        try {
                            const saved = localStorage.getItem('restaurant_settings');
                            if (saved) {
                                const d = JSON.parse(saved);
                                restaurantName = d.name || 'غير محدد';
                            }
                        } catch (e) {}
                        
                        const message = `السلام عليكم، أحتاج دعم فني لنظام مستر كاشير.\nاسم المطعم: ${restaurantName}`;
                        const encodedMessage = encodeURIComponent(message);
                        
                        // Use direct web.whatsapp.com URL so the native window handles it smoothly without wa.me redirects
                        const waWebUrl = `https://web.whatsapp.com/send?phone=967777310606&text=${encodedMessage}`;
                        waSupportLink.href = `https://wa.me/967777310606?text=${encodedMessage}`;
                        
                        // Add click event for "Direct" experience in the internal window
                        waSupportLink.onclick = (e) => {
                            e.preventDefault();
                            
                            try {
                                const { ipcRenderer } = require('electron');
                                // Just show the window and let the URL pre-fill the text.
                                // Do NOT use wa-send-message here, as its automation will auto-hide the window when done.
                                ipcRenderer.send('wa-show-window', waWebUrl);
                            } catch (err) {
                                window.open(waSupportLink.href, '_blank');
                            }
                        };
                    }

                    // Explicitly handle Email support link to open Gmail in browser
                    const emailSupportLink = document.getElementById('email-support-link');
                    if (emailSupportLink) {
                        emailSupportLink.onclick = (e) => {
                            e.preventDefault();
                            
                            // Use Gmail web composer URL instead of mailto to force opening in browser
                            const gmailUrl = 'https://mail.google.com/mail/?view=cm&fs=1&to=Mister.Casher@jeeey.com';
                            
                            try {
                                const { shell } = require('electron');
                                shell.openExternal(gmailUrl);
                            } catch (err) {
                                window.open(gmailUrl, '_blank');
                            }
                        };
                    }
                }
            });

        });
    }

});
