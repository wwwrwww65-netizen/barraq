/**
 * Modern Dialogs Utility
 * Replacing native alert/confirm with premium UI
 */

const ModernDialog = {
    _overlay: null,
    _container: null,
    _resolve: null,

    init() {
        if (this._overlay) return;

        this._overlay = document.createElement('div');
        this._overlay.className = 'md-overlay';
        this._overlay.innerHTML = `
            <div class="md-container">
                <div class="md-header">
                    <div class="md-icon-circle">
                        <i class="ph-fill ph-info"></i>
                    </div>
                    <h3 class="md-title">تنبيه</h3>
                </div>
                <div class="md-body">
                    محتوى الرسالة هنا...
                </div>
                <div class="md-footer">
                    <button class="md-btn md-btn-secondary" id="md-btn-cancel">
                        <i class="ph ph-x-circle"></i>
                        <span>إلغاء</span>
                    </button>
                    <button class="md-btn md-btn-primary" id="md-btn-ok">
                        <i class="ph ph-check-circle"></i>
                        <span>موافق</span>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(this._overlay);

        this._container = this._overlay.querySelector('.md-container');
        
        document.getElementById('md-btn-ok').addEventListener('click', () => this.close(true));
        document.getElementById('md-btn-cancel').addEventListener('click', () => this.close(false));
        
        this._overlay.addEventListener('click', (e) => {
            if (e.target === this._overlay && !this._isConfirm) {
                this.close(false);
            }
        });
    },

    show({ title, message, type = 'info', confirm = false, okText = 'موافق', cancelText = 'إلغاء' }) {
        this.init();
        this._isConfirm = confirm;
        
        const iconMap = {
            info: 'ph-info',
            success: 'ph-check-circle',
            warning: 'ph-warning',
            error: 'ph-x-circle'
        };

        const container = this._container;
        container.className = `md-container md-type-${type}`;
        container.querySelector('.md-title').innerText = title || (confirm ? 'تأكيد' : 'تنبيه');
        container.querySelector('.md-body').innerHTML = String(message || '').replace(/\n/g, '<br>');
        container.querySelector('.md-icon-circle i').className = `ph-fill ${iconMap[type] || 'ph-info'}`;
        
        const btnOk = document.getElementById('md-btn-ok');
        const btnCancel = document.getElementById('md-btn-cancel');
        
        btnOk.querySelector('span').innerText = okText;
        btnCancel.querySelector('span').innerText = cancelText;
        btnCancel.style.display = confirm ? 'flex' : 'none';

        this._overlay.classList.add('active');
        document.body.style.overflow = 'hidden';

        return new Promise((resolve) => {
            this._resolve = resolve;
        });
    },

    close(result) {
        this._overlay.classList.remove('active');
        document.body.style.overflow = '';
        if (this._resolve) {
            this._resolve(result);
            this._resolve = null;
        }
    },

    alert(message, title = 'تنبيه', type = 'info') {
        return this.show({ title, message, type, confirm: false });
    },

    confirm(message, title = 'تأكيد', type = 'warning') {
        return this.show({ title, message, type, confirm: true });
    },

    success(message, title = 'تم بنجاح') {
        return this.show({ title, message, type: 'success', confirm: false });
    },

    error(message, title = 'خطأ') {
        return this.show({ title, message, type: 'error', confirm: false });
    },

    warning(message, title = 'تحذير') {
        return this.show({ title, message, type: 'warning', confirm: false });
    }
};

// Global Exposure
window.ModernDialog = ModernDialog;

/**
 * 🛠️ mcasherConfirm & mcasherAlert (Compatibility)
 */
window.mcasherConfirm = function(msg, title = 'تأكيد العملية') {
    return ModernDialog.confirm(msg, title);
};
window.mcasherAlert = function(msg, title = 'تنبيه') {
    return ModernDialog.alert(msg, title);
};

// Override Native Functions
window.alert = function(msg) {
    ModernDialog.alert(msg);
};

// لا تستبدل window.confirm — في Electron يُرجع false فوراً ويكسر confirmCloseDay وغيره.
// استخدم دائماً: const ok = await window.mcasherConfirm('الرسالة', 'العنوان');

// Auto-inject CSS
(function injectStyles() {
    if (document.getElementById('modern-dialogs-css')) return;
    const link = document.createElement('link');
    link.id = 'modern-dialogs-css';
    link.rel = 'stylesheet';
    link.href = 'modern-dialogs.css';
    document.head.appendChild(link);
})();
