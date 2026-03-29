document.addEventListener('DOMContentLoaded', () => {

    const form = document.getElementById('loginForm');
    const userInp = document.getElementById('username');
    const pwdInp = document.getElementById('password');
    const errBox = document.getElementById('login-error');
    const btnSubmit = document.getElementById('btn-login-submit');

    // Make sure we are logged out fully when visiting login page
    localStorage.removeItem('currentUser');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const adminUser = localStorage.getItem('admin_username') || 'admin';
        const adminPwd = localStorage.getItem('admin_pwd') || '123456';

        const uVal = userInp.value.trim();
        const pVal = pwdInp.value.trim();

        errBox.style.display = 'none';

        // Visual Loading
        const origHTML = btnSubmit.innerHTML;
        btnSubmit.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin"></i> جاري المصادقة...';
        btnSubmit.style.pointerEvents = 'none';

        let authenticatedUser = null;

        if (uVal === adminUser && pVal === adminPwd) {
            authenticatedUser = { username: 'المدير العام System Admin', role: 'المدير العام', avatar: 'avatar.svg' };
        } else {
            // Ensure Database Auth for Staff
            try {
                const res = { json: async () => JSON.parse(require('fs').readFileSync(require('electron').ipcRenderer.sendSync('get-db-path'),'utf8')) };
                const db = await res.json();
                const emp = db.employees?.find(emp => emp.username === uVal && emp.password === pVal && emp.status !== 'end');
                
                if (emp) {
                    authenticatedUser = {
                        username: emp.name,
                        role: emp.role, // role must map to system_roles
                        avatar: emp.avatar || 'avatar.svg',
                        empId: emp.id
                    };
                }
            } catch (err) {
                console.error('Login DB Error:', err);
            }
        }

        if (authenticatedUser) {
            setTimeout(() => {
                localStorage.setItem('currentUser', JSON.stringify(authenticatedUser));
                window.location.href = 'index.html'; // Navigate to dashboard
            }, 800);
        } else {
            // Fail
            btnSubmit.innerHTML = origHTML;
            btnSubmit.style.pointerEvents = 'auto';
            
            errBox.style.display = 'block';
            pwdInp.value = ''; // clear password
            
            const box = document.querySelector('.login-box');
            box.style.animation = 'none';
            setTimeout(() => { box.style.animation = 'slideUpFade 0.4s reverse forwards'; }, 10);
            setTimeout(() => { box.style.animation = 'slideUpFade 0.4s forwards'; }, 400);
        }
    });

});
