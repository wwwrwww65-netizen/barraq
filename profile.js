document.addEventListener('DOMContentLoaded', () => {

    const cUserStr = localStorage.getItem('currentUser');
    if(!cUserStr) return; // Handled by global guard anyway

    const cUser = JSON.parse(cUserStr);
    
    // Set text display
    document.getElementById('disp-username').innerText = cUser.username;
    document.getElementById('disp-role').innerText = cUser.role;

    // Handle Form submission
    const curPInp = document.getElementById('cur-pwd');
    const newPInp = document.getElementById('new-pwd');
    const confPInp = document.getElementById('new-pwd-conf');
    const errBox = document.getElementById('pwd-error');
    const succBox = document.getElementById('pwd-success');
    const btnSave = document.getElementById('btn-save-pwd');

    btnSave.addEventListener('click', (e) => {
        e.preventDefault();
        errBox.style.display = 'none';
        succBox.style.display = 'none';

        const cv = curPInp.value.trim();
        const nv = newPInp.value.trim();
        const cof = confPInp.value.trim();

        if(!cv || !nv || !cof) {
            errBox.innerText = 'الرجاء تعبئة جميع الحقول!';
            errBox.style.display = 'block';
            return;
        }

        const trueAdminPwd = localStorage.getItem('admin_pwd') || '123456';

        if(cv !== trueAdminPwd) {
            errBox.innerText = 'كلمة المرور الحالية غير صحيحة.';
            errBox.style.display = 'block';
            return;
        }

        if(nv !== cof) {
            errBox.innerText = 'كلمة المرور الجديدة غير متطابقة.';
            errBox.style.display = 'block';
            return;
        }

        if(nv.length < 5) {
            errBox.innerText = 'كلمة المرور الجديدة ضعيفة. يجب أن تكون 5 رموز على الأقل.';
            errBox.style.display = 'block';
            return;
        }

        // Save new password
        localStorage.setItem('admin_pwd', nv);

        // Success Feedback
        curPInp.value = '';
        newPInp.value = '';
        confPInp.value = '';

        succBox.style.display = 'block';
        
        setTimeout(() => {
            succBox.style.display = 'none';
        }, 4000);
    });

});
