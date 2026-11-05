document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('manager-setup-form');
  const button = document.getElementById('manager-setup-submit');
  const message = document.getElementById('manager-setup-message');

  function showMessage(text, type) {
    message.textContent = text;
    message.className = 'message ' + (type || 'error');
  }

  try {
    const { ipcRenderer } = require('electron');
    try { await ipcRenderer.invoke('license-refresh-manual'); } catch (_) {}
    const access = await ipcRenderer.invoke('license-evaluate-access');
    if (!access || !access.ok) {
      window.location.replace('activation.html');
      return;
    }
    const licenseInfo = await ipcRenderer.invoke('license-get-info').catch(() => ({}));
    if (licenseInfo.managerProvisioned === true) {
      if (licenseInfo.tenantId) localStorage.setItem('mc_tenant_id', licenseInfo.tenantId);
      window.location.replace('login.html');
      return;
    }
  } catch (error) {
    showMessage('تعذر التحقق من حالة التفعيل. أعد فتح شاشة التفعيل.', 'error');
    form.querySelector('button').disabled = true;
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const claimToken = document.getElementById('claim-token').value.trim();
    const username = document.getElementById('manager-username').value.trim();
    const displayName = document.getElementById('manager-name').value.trim();
    const password = document.getElementById('manager-password').value;
    const confirmPassword = document.getElementById('manager-password-confirm').value;

    if (password !== confirmPassword) {
      showMessage('كلمتا المرور غير متطابقتين.', 'error');
      return;
    }

    button.disabled = true;
    button.innerHTML = '<i class="ph ph-spinner ph-spin"></i> جارٍ إنشاء الحساب والتحقق من الموافقة...';
    message.className = 'message';
    message.textContent = '';

    try {
      const { createFirstManagerAccount } = require('./cloud/manager-bootstrap');
      const deviceId = await require('electron').ipcRenderer.invoke('license-get-device-id');
      const result = await createFirstManagerAccount({
        claimToken,
        deviceId,
        username,
        password,
        displayName,
      });

      document.getElementById('manager-password').value = '';
      document.getElementById('manager-password-confirm').value = '';
      showMessage('تم إنشاء حساب المدير واعتماد صلاحيته. سيتم نقلك إلى تسجيل الدخول.', 'success');
      button.innerHTML = 'تم إنشاء الحساب';
      setTimeout(() => {
        window.location.replace('login.html');
      }, 1100);
    } catch (error) {
      console.error('[Manager setup] Cloud account creation failed:', error);
      const code = error && error.code;
      const messages = {
        'auth/email-already-in-use': 'اسم المستخدم مستخدم مسبقاً داخل هذه المنشأة.',
        'auth/weak-password': 'كلمة المرور ضعيفة. استخدم 8 خانات على الأقل.',
        'auth/network-request-failed': 'تعذر الاتصال بالإنترنت. تحقق من الاتصال ثم أعد المحاولة.',
        'permission-denied': 'قواعد Firestore لم تُحدّث بعد أو أن رمز الاعتماد غير مسموح.',
        'unavailable': 'خدمة Firebase غير متاحة مؤقتاً. أعد المحاولة لاحقاً.',
      };
      showMessage(messages[code] || error.message || 'تعذر إنشاء الحساب. تحقق من الرمز واتصال الإنترنت.', 'error');
      button.disabled = false;
      button.innerHTML = 'إنشاء حساب المدير <i class="ph ph-arrow-left"></i>';
    }
  });
});
