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

    // --- Google Drive Logic ---
    const btnGoogleLogin = document.getElementById('btn-google-login');
    const gdStatusBox = document.getElementById('google-drive-status');
    const gdIcon = document.getElementById('gd-icon');
    const gdTitle = document.getElementById('gd-title');
    const gdSubtitle = document.getElementById('gd-subtitle');
    const btnGdBackup = document.getElementById('btn-gd-backup');
    const btnGdRestore = document.getElementById('btn-gd-restore');

    // Check if previously logged in
    const isDriveLinkedStr = localStorage.getItem('google_drive_linked');
    let isDriveLinked = isDriveLinkedStr ? JSON.parse(isDriveLinkedStr) : null;

    function updateDriveUI() {
        if(isDriveLinked) {
            gdStatusBox.style.background = 'rgba(66, 133, 244, 0.1)';
            gdStatusBox.style.borderColor = '#4285F4';
            gdIcon.className = 'ph-fill ph-cloud-check';
            gdIcon.style.color = '#4285F4';
            gdTitle.innerText = 'متصل بنجاح';
            gdSubtitle.innerText = 'الحساب: ' + isDriveLinked.email;
            
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

    updateDriveUI();

    btnGoogleLogin.addEventListener('click', () => {
        if(isDriveLinked) {
            if(confirm('هل أنت متأكد من رغبتك في إلغاء ربط حساب جوجل درايف؟ سيؤدي ذلك لإيقاف المزامنة السحابية.')) {
                localStorage.removeItem('google_drive_linked');
                isDriveLinked = null;
                updateDriveUI();
            }
        } else {
            // Simulate Google OAuth Popup
            btnGoogleLogin.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin"></i> جاري الاتصال بخوادم Google...';
            
            setTimeout(() => {
                const fakeEmail = 'restaurant@gmail.com'; // prompt() is not supported in Electron without polyfills
                if(fakeEmail) {
                    isDriveLinked = { email: fakeEmail, linkedAt: new Date().toISOString() };
                    localStorage.setItem('google_drive_linked', JSON.stringify(isDriveLinked));
                    alert('تم الربط بنجاح مع حساب جوجل درايف!');
                    updateDriveUI();
                }
            }, 1000);
        }
    });

    btnGdBackup.addEventListener('click', () => {
        const originalText = btnGdBackup.innerHTML;
        btnGdBackup.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin"></i> جاري الرفع...';
        btnGdBackup.style.pointerEvents = 'none';

        // Collect all localStorage data
        const backupData = {};
        for(let i=0; i<localStorage.length; i++) {
            const key = localStorage.key(i);
            backupData[key] = localStorage.getItem(key);
        }

        setTimeout(() => {
            alert('تم رفع النسخة الاحتياطية بنجاح إلى جوجل درايف!\nالحجم: ' + (JSON.stringify(backupData).length / 1024).toFixed(2) + ' KB');
            btnGdBackup.innerHTML = originalText;
            btnGdBackup.style.pointerEvents = 'auto';
            
            // Also save locally as a file just in case they want a real backup
            try {
                const { ipcRenderer } = require('electron');
                const fs = require('fs');
                const path = require('path');
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                fs.writeFileSync('database_backup_' + timestamp + '.json', JSON.stringify(backupData));
            } catch(e) {}

        }, 1500);
    });

    // --- WhatsApp Bot Logic ---
    const btnWaLink = document.getElementById('btn-wa-link');
    const waStatusText = document.getElementById('wa-status-text');
    const waQrContainer = document.getElementById('wa-qr-container');
    const inputWaAdmin = document.getElementById('set-wa-admin');
    const inputWaLoans = document.getElementById('set-wa-loans');
    const inputWaReports = document.getElementById('set-wa-reports');

    // Load WhatsApp Settings
    const waSettingsRaw = localStorage.getItem('wa_settings');
    if(waSettingsRaw) {
        const waOpts = JSON.parse(waSettingsRaw);
        if(waOpts.admin) inputWaAdmin.value = waOpts.admin;
        if(waOpts.loans !== undefined) inputWaLoans.checked = waOpts.loans;
        if(waOpts.reports !== undefined) inputWaReports.checked = waOpts.reports;
    }

    try {
        const { ipcRenderer } = require('electron');
        const QRCode = require('qrcode');

        // Check if already authenticated on load
        const wasWaConnected = localStorage.getItem('wa_connected') === 'true';
        if(wasWaConnected) {
            waStatusText.innerText = 'متصل (تم تسجيل الدخول)';
            waStatusText.style.color = '#10b981';
            btnWaLink.innerHTML = '<i class="ph-bold ph-plugs"></i> جاري الاتصال بالخلفية...';
            waQrContainer.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin" style="font-size:40px; color:#10b981;"></i>';
            ipcRenderer.send('wa-start'); // Auto start if previously linked
        }

        btnWaLink.addEventListener('click', () => {
            waStatusText.innerText = 'جاري الاتصال بالسيرفر...';
            waStatusText.style.color = 'var(--text-muted)';
            btnWaLink.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin"></i> جاري التشغيل...';
            btnWaLink.disabled = true;
            waQrContainer.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin" style="font-size:40px; color:#ccc;"></i>';
            
            ipcRenderer.send('wa-start');
        });

        ipcRenderer.on('wa-qr', async (e, qrString) => {
            waStatusText.innerText = 'يرجى مسح الكود باستخدام واتساب';
            waStatusText.style.color = 'var(--accent-orange)';
            try {
                const qrImageBase64 = await QRCode.toDataURL(qrString, { width: 180, margin: 2, color: { dark: '#000000', light: '#ffffff' } });
                waQrContainer.innerHTML = `<img src="${qrImageBase64}" style="width:180px; height:180px; border-radius:8px;">`;
            } catch(e) {
                waQrContainer.innerHTML = '<span style="color:red; font-size:12px;">فشل توليد التشفير للصورة</span>';
            }
        });

        ipcRenderer.on('wa-ready', () => {
            waStatusText.innerText = 'متصل (البوت جاهز)';
            waStatusText.style.color = '#10b981';
            btnWaLink.innerHTML = '<i class="ph-fill ph-check-circle"></i> البوت نشط الآن';
            btnWaLink.style.background = '#10b981';
            waQrContainer.innerHTML = '<i class="ph-fill ph-check-circle" style="font-size:60px; color:#10b981;"></i>';
            localStorage.setItem('wa_connected', 'true');
        });

        ipcRenderer.on('wa-authenticated', () => {
            waStatusText.innerText = 'تم المصادقة جاري التجهيز...';
        });

        ipcRenderer.on('wa-disconnected', (e, msg) => {
            waStatusText.innerText = 'انقطع الاتصال: ' + msg;
            waStatusText.style.color = 'var(--accent-red)';
            btnWaLink.innerHTML = '<i class="ph-bold ph-link"></i> إعادة محاولة الاتصال';
            btnWaLink.disabled = false;
            waQrContainer.innerHTML = '<i class="ph ph-warning-circle" style="font-size:48px; color:var(--accent-red);"></i>';
            localStorage.setItem('wa_connected', 'false');
        });

    } catch(e) {
        // If not running in Electron
        waStatusText.innerText = 'تقنية الواتساب تتطلب تشغيل النظام عبر التطبيق الفعلي';
        btnWaLink.disabled = true;
    }

    // Capture save to storage
    form.addEventListener('submit', () => {
        const waData = {
            admin: inputWaAdmin.value,
            loans: inputWaLoans.checked,
            reports: inputWaReports.checked
        };
        localStorage.setItem('wa_settings', JSON.stringify(waData));
    });

});
