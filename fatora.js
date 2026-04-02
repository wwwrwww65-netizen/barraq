document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('fatora-settings-form');
    const statusIcon = document.getElementById('fatora-status-icon');
    const statusTitle = document.getElementById('fatora-status-title');
    const statusDesc = document.getElementById('fatora-status-desc');
    const statusBox = document.getElementById('fatora-connection-status');
    const btnTest = document.getElementById('btn-test-fatora');
    const btnReset = document.getElementById('btn-reset-fatora');
    const toggleApiKeyBtn = document.getElementById('toggle-api-key');
    const apiKeyInput = document.getElementById('fatora_api_key');

    // Load settings
    const db = await window.dbRead();
    if (db.fatora_settings) {
        let envRadio = document.querySelector(`input[name="fatora_env"][value="${db.fatora_settings.env || 'sandbox'}"]`);
        if(envRadio) envRadio.checked = true;
        
        document.getElementById('fatora_api_key').value = db.fatora_settings.apiKey || '';
        document.getElementById('fatora_merchant_id').value = db.fatora_settings.merchantId || '';
        document.getElementById('fatora_auto_sync').checked = db.fatora_settings.autoSync === false ? false : true;
        
        if (db.fatora_settings.apiKey && db.fatora_settings.merchantId) {
            setConnectedStatus();
        }
    }

    // Toggle API Key visibility
    if(toggleApiKeyBtn) {
        toggleApiKeyBtn.addEventListener('click', () => {
            if (apiKeyInput.type === 'password') {
                apiKeyInput.type = 'text';
                toggleApiKeyBtn.innerHTML = '<i class="ph ph-eye-slash" style="font-size: 20px;"></i>';
            } else {
                apiKeyInput.type = 'password';
                toggleApiKeyBtn.innerHTML = '<i class="ph ph-eye" style="font-size: 20px;"></i>';
            }
        });
    }

    // Test connection
    if(btnTest) {
        btnTest.addEventListener('click', () => {
            const apiKey = document.getElementById('fatora_api_key').value;
            const merchantId = document.getElementById('fatora_merchant_id').value;

            if (!apiKey || !merchantId) {
                alert('الرجاء إدخال مفتاح الربط ورقم التاجر لاختبار الاتصال.');
                return;
            }

            btnTest.innerHTML = '<i class="ph ph-spinner ph-spin" style="font-size: 18px;"></i> جاري التحقق...';
            btnTest.disabled = true;

            // Mock API Call
            setTimeout(() => {
                btnTest.innerHTML = '<i class="ph-bold ph-check" style="font-size: 18px;"></i> تم الاتصال بنجاح';
                setConnectedStatus();
                setTimeout(() => {
                    btnTest.innerHTML = '<i class="ph-bold ph-arrows-out-line-horizontal" style="font-size: 18px;"></i> اختبار الاتصال مع المنصة';
                    btnTest.disabled = false;
                }, 2000);
            }, 1500);
        });
    }

    // Save Settings
    if(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const env = document.querySelector('input[name="fatora_env"]:checked').value;
            const apiKey = document.getElementById('fatora_api_key').value;
            const merchantId = document.getElementById('fatora_merchant_id').value;
            const autoSync = document.getElementById('fatora_auto_sync').checked;

            await window.dbUpdate(db => {
                db.fatora_settings = { env, apiKey, merchantId, autoSync };
            });

            alert('تم حفظ إعدادات منصة فوترة (الزكاة) بنجاح!');
            setConnectedStatus();
        });
    }

    // Reset Fields
    if(btnReset) {
        btnReset.addEventListener('click', async () => {
            if(confirm('هل أنت متأكد من تصفير إعدادات الربط؟')) {
                document.querySelector('input[name="fatora_env"][value="sandbox"]').checked = true;
                document.getElementById('fatora_api_key').value = '';
                document.getElementById('fatora_merchant_id').value = '';
                document.getElementById('fatora_auto_sync').checked = true;

                await window.dbUpdate(db => {
                    db.fatora_settings = null;
                });

                setDisconnectedStatus();
            }
        });
    }

    function setConnectedStatus() {
        if(!statusBox) return;
        statusBox.style.background = 'rgba(16, 185, 129, 0.1)';
        statusBox.style.border = '1px solid rgba(16, 185, 129, 0.3)';
        statusIcon.className = 'ph-fill ph-check-circle';
        statusIcon.style.color = 'var(--accent-green)';
        statusTitle.textContent = 'متصل وجاهز';
        statusDesc.textContent = 'تم إعداد الربط بنجاح مع منصة فوترة.';
    }

    function setDisconnectedStatus() {
        if(!statusBox) return;
        statusBox.style.background = 'rgba(239, 68, 68, 0.1)';
        statusBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        statusIcon.className = 'ph-fill ph-warning-circle';
        statusIcon.style.color = 'var(--accent-red)';
        statusTitle.textContent = 'غير متصل';
        statusDesc.textContent = 'يرجى إدخال بيانات الربط أدناه والتحقق من الاتصال';
    }
});
