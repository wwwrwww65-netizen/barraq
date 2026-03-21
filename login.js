document.addEventListener('DOMContentLoaded', () => {

    const form = document.getElementById('loginForm');
    const userInp = document.getElementById('username');
    const pwdInp = document.getElementById('password');
    const errBox = document.getElementById('login-error');
    const btnSubmit = document.getElementById('btn-login-submit');

    // Make sure we are logged out fully when visiting login page
    localStorage.removeItem('currentUser');

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        // Admin Auth defaults
        const adminUser = 'admin';
        const adminPwd = localStorage.getItem('admin_pwd') || '123456';

        const uVal = userInp.value.trim();
        const pVal = pwdInp.value.trim();

        if (uVal === adminUser && pVal === adminPwd) {
            // Success
            errBox.style.display = 'none';

            // Visual Loading
            const origHTML = btnSubmit.innerHTML;
            btnSubmit.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin"></i> جاري المصادقة...';
            btnSubmit.style.pointerEvents = 'none';

            setTimeout(() => {
                const userObj = {
                    username: uVal,
                    role: 'المدير العام',
                    avatar: 'https://i.pravatar.cc/150?img=11'
                };
                localStorage.setItem('currentUser', JSON.stringify(userObj));
                window.location.href = 'index.html'; // Redirect
            }, 800);
            
        } else {
            // Fail
            errBox.style.display = 'block';
            pwdInp.value = ''; // clear password
            
            // Add slight shake animation to login box
            const box = document.querySelector('.login-box');
            box.style.animation = 'none';
            setTimeout(() => { box.style.animation = 'slideUpFade 0.4s reverse forwards'; }, 10);
            setTimeout(() => { box.style.animation = 'slideUpFade 0.4s forwards'; }, 400);
        }
    });

});
