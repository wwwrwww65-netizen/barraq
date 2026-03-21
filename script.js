// --- Global Authentication Guard ---
if (!window.location.pathname.includes('login.html')) {
    if (!localStorage.getItem('currentUser')) {
        window.location.href = 'login.html';
    }
}

// Update Date and Time continuously
function updateDateTime() {
    const timeDisplay = document.getElementById('datetime-display');
    const now = new Date();
    
    // Arabic formatted date
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('ar-SA', options);
    
    // Arabic formatted time
    const timeStr = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
    
    timeDisplay.innerHTML = `${dateStr} - ${timeStr}`;
}

setInterval(updateDateTime, 1000);
updateDateTime();

// Setup Sales Chart with Chart.js
document.addEventListener('DOMContentLoaded', () => {
    const chartCanvas = document.getElementById('salesChart');
    if (chartCanvas) {
        const ctx = chartCanvas.getContext('2d');
        
        // Create elegant gradient for line chart
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(59, 130, 246, 0.5)'); // Blue accent
        gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
        
        const data = {
            labels: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'],
            datasets: [{
                label: 'المبيعات (ر.س)',
                data: [3200, 2800, 3500, 4100, 3800, 5200, 6500],
                backgroundColor: gradient,
                borderColor: '#3b82f6', // Accent blue
                borderWidth: 3,
                pointBackgroundColor: '#0f172a',
                pointBorderColor: '#3b82f6',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.4 // Smooth curves
            }]
        };

        const config = {
            type: 'line',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false // Hide default legend for cleaner look
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleFont: { family: 'Cairo', size: 14 },
                        bodyFont: { family: 'Cairo', size: 14 },
                        padding: 12,
                        cornerRadius: 8,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return context.parsed.y + ' ر.س';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#94a3b8',
                            font: { family: 'Cairo', size: 12 }
                        }
                    },
                    y: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#94a3b8',
                            font: { family: 'Cairo', size: 12 },
                            callback: function(value) {
                                return value + ' ر.س';
                            }
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index',
                },
            }
        };

        new Chart(ctx, config);
    }
    
    // Generic UI Interactions
    const navItems = document.querySelectorAll('.nav-item');
    /* 
    We removed the e.preventDefault() from here to allow real navigation 
    between our newly created html pages. 
    */
});

/* =====================================
   Global Settings Sync 
===================================== */
window.syncGlobalSettings = function() {
    const saved = localStorage.getItem('restaurant_settings');
    if(saved) {
        try {
            const data = JSON.parse(saved);
            
            // 1. Sidebar Logo & Name Update (Global)
            const sideLogos = document.querySelectorAll('.restaurant-logo');
            sideLogos.forEach(img => { if(data.logo) img.src = data.logo; });
            
            const sideTitles = document.querySelectorAll('.logo span');
            sideTitles.forEach(span => {
                if(data.name) {
                    span.innerHTML = data.name + ' <span class="highlight">POS</span>';
                }
            });

            // 2. Receipt Updates (If on pos.html)
            const rLogo = document.getElementById('r-store-logo');
            if(rLogo && data.logo) rLogo.src = data.logo;

            const rName = document.getElementById('r-store-name');
            if(rName && data.name) rName.innerText = data.name;

            const rTax = document.getElementById('r-store-tax');
            if(rTax && data.tax) rTax.innerText = 'الرقم الضريبي: ' + data.tax;

            const rBranch = document.getElementById('r-store-branch');
            if(rBranch && data.branch) rBranch.innerText = data.branch;

            const rFooter = document.getElementById('r-store-footer');
            if(rFooter && data.footer) rFooter.innerText = data.footer;

        } catch(e) {
            console.error('Settings parse error', e);
        }
    }

    // --- 3. Profile Setup & Dropdown Menu ---
    const cUserStr = localStorage.getItem('currentUser');
    if(cUserStr) {
        try {
            const cUser = JSON.parse(cUserStr);
            const profiles = document.querySelectorAll('.user-profile');
            
            profiles.forEach(p => {
                // Update text
                const uName = p.querySelector('.user-name');
                const uRole = p.querySelector('.user-role');
                const ava = p.querySelector('.avatar');
                
                if(uName) uName.innerText = cUser.username;
                if(uRole) uRole.innerText = cUser.role;
                if(ava) ava.src = cUser.avatar;
                
                // Set relative positioning & pointer cursor
                p.style.position = 'relative';
                p.style.cursor = 'pointer';
                p.style.display = 'flex';
                p.style.alignItems = 'center';
                
                // Add Icon indicating dropdown
                if(!p.querySelector('.drop-icon-indicator')) {
                    p.innerHTML += '<i class="ph-bold ph-caret-down drop-icon-indicator" style="margin-right: 10px; color: var(--text-muted);"></i>';
                }

                // Create Dropdown Node Native HTML
                if(!p.querySelector('.profile-dropdown')) {
                    const drop = document.createElement('div');
                    drop.className = 'profile-dropdown';
                    drop.style.position = 'absolute';
                    drop.style.top = '110%';
                    drop.style.left = '0';
                    drop.style.background = 'rgba(15, 23, 42, 0.95)';
                    drop.style.backdropFilter = 'blur(10px)';
                    drop.style.border = '1px solid rgba(255,255,255,0.1)';
                    drop.style.borderRadius = '8px';
                    drop.style.width = '200px';
                    drop.style.display = 'none';
                    drop.style.flexDirection = 'column';
                    drop.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
                    drop.style.zIndex = '9999';
                    
                    drop.innerHTML = `
                        <a href="profile.html" style="padding: 12px 15px; display:flex; gap:10px; align-items:center; color:white; border-bottom:1px solid rgba(255,255,255,0.05); font-weight:600;"><i class="ph-fill ph-user-circle"></i> معلومات الحساب</a>
                        <a href="settings.html" style="padding: 12px 15px; display:flex; gap:10px; align-items:center; color:white; border-bottom:1px solid rgba(255,255,255,0.05); font-weight:600;"><i class="ph-fill ph-gear"></i> إعدادات الهوية</a>
                        <a href="permissions.html" style="padding: 12px 15px; display:flex; gap:10px; align-items:center; color:white; border-bottom:1px solid rgba(255,255,255,0.05); font-weight:600;"><i class="ph-fill ph-shield-check"></i> الصلاحيات</a>
                        <div id="btn-logout-global" style="padding: 12px 15px; display:flex; gap:10px; align-items:center; color:var(--accent-red); font-weight:800; cursor:pointer;"><i class="ph-bold ph-sign-out"></i> تسجيل الخروج</div>
                    `;
                    p.appendChild(drop);

                    // Add hover/click listener
                    p.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        // Toggle logic
                        if(drop.style.display === 'flex') {
                            drop.style.display = 'none';
                        } else {
                            // close others
                            document.querySelectorAll('.profile-dropdown').forEach(d => d.style.display = 'none');
                            drop.style.display = 'flex';
                        }
                    });

                    // Logout Action
                    drop.querySelector('#btn-logout-global').addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        // Clear user
                        localStorage.removeItem('currentUser');
                        // Optional: don't clear restaurant_settings so they persist for login page
                        window.location.href = 'login.html';
                    });
                }
            });

            // Global Click outside dropdown to close
            document.addEventListener('click', () => {
                document.querySelectorAll('.profile-dropdown').forEach(d => {
                    d.style.display = 'none';
                });
            });

        } catch(e) {
            console.error('Profile auth error', e);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.syncGlobalSettings();
});
