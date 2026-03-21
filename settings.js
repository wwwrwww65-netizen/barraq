document.addEventListener('DOMContentLoaded', () => {

    const form = document.querySelector('#settings-form');
    const dropZone = document.getElementById('drop-zone');
    const logoInput = document.getElementById('logo-input');
    const previewLogo = document.getElementById('preview-logo');

    const inputName = document.getElementById('set-name');
    const inputBranch = document.getElementById('set-branch');
    const inputTax = document.getElementById('set-tax');
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

        const data = {
            name: inputName.value || 'سمر حضرموت',
            branch: inputBranch.value,
            tax: inputTax.value || '300123456780003',
            phone: inputPhone.value,
            whatsapp: inputWhatsapp.value,
            footer: inputFooter.value,
            logo: base64Logo || 'logo.jpg' // Default logic
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
    const resetBtn = document.querySelector('.btn-primary[type="button"]');
    resetBtn.addEventListener('click', () => {
        if(confirm('هل تريد استعادة تصميم "سمر حضرموت" ومسح الإعدادات الجديدة؟')) {
            localStorage.removeItem('restaurant_settings');
            location.reload();
        }
    });
});
