// ✅ staff.js — HR Module fully connected to pos_database.json (Premium Full-Page Design)
const fs = require('fs');
const nodePath = require('path');
const dbPath = require('electron').ipcRenderer.sendSync('get-db-path');

function loadDB() {
    try { return JSON.parse(fs.readFileSync(dbPath, 'utf8')); }
    catch(e) { return {}; }
}
function saveDB(db) { fs.writeFileSync(dbPath, JSON.stringify(db, null, 2)); }
const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── DB State ──────────────────────────────────────────────────
let db = loadDB();
if (!db.employees)  db.employees  = [];
if (!db.hrExpenses) db.hrExpenses = [];
if (!db.attendance) db.attendance = [];

if (db.employees.length === 0) {
    db.employees = [
        { id:'EMP-001', name:'أحمد الكاشير', role:'كاشير', nationality:'يمني', phone:'0551234567', iqama:'2100001111', expiry:'2026-08-14', salary:4500, loans:200, status:'active', startDate:'2024-01-15', notes:'', avatar:'' },
        { id:'EMP-002', name:'محمد علي صالح', role:'مطبخ', nationality:'مصري', phone:'0501112223', iqama:'2200002222', expiry:'2027-01-02', salary:5200, loans:0, status:'active', startDate:'2023-06-10', notes:'شيف رئيسي' }
    ];
    saveDB(db);
}

// ── Role Config ───────────────────────────────────────────────
const roleConfig = {
    'إدارة':  { badge: 'role-admin',    icon: 'ph-crown',         color: '#8b5cf6' },
    'كاشير':  { badge: 'role-cashier',  icon: 'ph-cash-register', color: '#3b82f6' },
    'مطبخ':   { badge: 'role-kitchen',  icon: 'ph-cooking-pot',   color: '#f59e0b' },

    'خدمة':   { badge: 'role-service',  icon: 'ph-broom',         color: '#ec4899' }
};

const statusConfig = {
    'active': { label: 'مداوم الآن',        class: 'status-online'  },
    'leave':  { label: 'إجازة / خارج',      class: 'status-offline' },
    'end':    { label: 'منتهية الخدمة',     class: 'status-offline' }
};

// ── Nav & Views Logic ─────────────────────────────────────────
window.showView = function(viewId, navId) {
    document.querySelectorAll('.hr-view').forEach(v => v.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(viewId).style.display = 'block';
    if(navId) document.getElementById(navId)?.classList.add('active');

    if(viewId === 'view-employees') renderEmployees();
    if(viewId === 'view-payroll') renderPayroll();
    if(viewId === 'view-vouchers') renderVouchers();
    if(viewId === 'view-deductions') renderDeductions();
    if(viewId === 'view-add-employee') {
        if(navId === 'nav-new-emp') {
            document.getElementById('form-new-emp').reset();
            document.getElementById('avatar-preview').style.display = 'none';
            delete document.getElementById('form-new-emp').dataset.editId;
            document.getElementById('form-emp-title').innerText = 'إضافة ملف موظف جديد';
        }
        
        // Dinamically link Job Ttles to System Roles
        try {
            const sysRoles = JSON.parse(localStorage.getItem('system_roles') || '[]');
            const opts = document.getElementById('role-options');
            if(opts && sysRoles.length > 0) {
                opts.innerHTML = sysRoles.map(r => `<option value="${r.name}">`).join('');
            }
        } catch(e) { }
    }
};

window.switchProTab = function(tabId, btn) {
    document.querySelectorAll('.ptab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.ptab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    btn.classList.add('active');
};

// ── Avatar Upload Preview ─────────────────────────────────────
const photoInput = document.getElementById('ne-photo');
const photoPreview = document.getElementById('avatar-preview');
let currentAvatarBase64 = '';

if(photoInput) {
    photoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = function(evt) {
            currentAvatarBase64 = evt.target.result;
            photoPreview.src = currentAvatarBase64;
            photoPreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    });
}

// ── KPIs ─────────────────────────────────────────────────────
function updateKPIs() {
    const active    = db.employees.filter(e => e.status === 'active').length;
    const totalLoan = db.employees.reduce((s, e) => s + (e.loans || 0), 0);
    const payroll   = db.employees.reduce((s, e) => s + (e.salary || 0), 0);
    
    document.getElementById('kpi-total').innerHTML     = `${db.employees.length} <span style="font-size:14px">موظف</span>`;
    document.getElementById('kpi-loans').innerHTML      = `${fmt(totalLoan)} <span style="font-size:14px">ر.س</span>`;
    document.getElementById('kpi-payroll').innerHTML    = `${fmt(payroll)} <span style="font-size:14px">ر.س</span>`;
}

// ── Render Employees Grid ─────────────────────────────────────
let activeRoleFilter = 'all';
let searchQuery = '';

function renderEmployees() {
    updateKPIs();
    const grid = document.getElementById('staff-grid');
    if(!grid) return;

    let filtered = db.employees.filter(e => {
        const matchRole   = activeRoleFilter === 'all' || e.role === activeRoleFilter;
        const matchSearch = e.name.toLowerCase().includes(searchQuery.toLowerCase()) || (e.iqama||'').includes(searchQuery);
        return matchRole && matchSearch;
    });

    // Update tab counters & Generate dynamically
    const roleTabsContainer = document.getElementById('role-tabs');
    if (roleTabsContainer) {
        // Find unique roles
        const uniqueRoles = [...new Set(db.employees.map(e => e.role))].filter(Boolean);
        let tabsHtml = `<button class="role-tab ${activeRoleFilter === 'all' ? 'active' : ''}" data-role="all">الجميع (${db.employees.length})</button>`;
        
        uniqueRoles.forEach(r => {
            const cnt = db.employees.filter(e => e.role === r).length;
            tabsHtml += `<button class="role-tab ${activeRoleFilter === r ? 'active' : ''}" data-role="${r}">${r} (${cnt})</button>`;
        });
        roleTabsContainer.innerHTML = tabsHtml;

        // Re-bind click events
        document.querySelectorAll('.role-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.role-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeRoleFilter = btn.dataset.role;
                renderEmployees();
            });
        });
    }

    // Helper: Dynamic Status
    const todayStr = new Date().toLocaleDateString('ar-SA');
    function getEmpStatus(empId) {
        const todayAtt = db.attendance.find(a => a.empId === empId && a.date === todayStr);
        if (todayAtt && todayAtt.status === 'حضور') return { label: 'مداوم الآن', class: 'status-online' };
        if (todayAtt && todayAtt.status === 'غياب') return { label: 'إجازة / غائب', class: 'status-offline' };
        return { label: 'لم يُحضر بعد', class: 'status-offline', style: 'background:rgba(255,255,255,0.05); color:var(--text-muted); border-color:var(--border-color);' };
    }

    grid.innerHTML = '';
    
    filtered.forEach(emp => {
        const rc = roleConfig[emp.role] || { badge:'', icon:'ph-user', color:'#64748b' };
        const sc = getEmpStatus(emp.id);
        const avatarHtml = emp.avatar 
            ? `<img src="${emp.avatar}" style="width:100px; height:100px; border-radius:50%; object-fit:cover; border:3px solid ${rc.color}; box-shadow:0 8px 25px rgba(0,0,0,0.5);">`
            : `<div style="width:100px;height:100px;border-radius:50%;background:var(--bg-card);display:flex;align-items:center;justify-content:center;font-size:40px;border:3px solid ${rc.color};box-shadow:0 8px 25px rgba(0,0,0,0.5);"><i class="ph ${rc.icon}" style="color:${rc.color}"></i></div>`;

        const netSalary = (emp.salary || 0) - (emp.loans || 0);

        const card = document.createElement('div');
        card.className = 'staff-card card';
        let customStyle = sc.style ? `style="${sc.style}"` : '';
        card.innerHTML = `
            <div class="staff-card-header">
                <div class="staff-status ${sc.class}" ${customStyle}>${sc.label}</div>
            </div>
            <div class="staff-avatar-wrapper" style="cursor:pointer;" onclick="openFullProfile('${emp.id}')">
                ${avatarHtml}
                <div class="staff-role-badge ${rc.badge}">${emp.role}</div>
            </div>
            <div class="staff-info">
                <h3>${emp.name}</h3>
                <p class="staff-id">#${emp.id}</p>
                <div class="staff-meta">
                    <span title="الجنسية"><i class="ph ph-flag"></i> ${emp.nationality || '—'}</span>
                    <span><i class="ph ph-identification-card"></i> ${emp.iqama || '—'}</span>
                </div>
            </div>
            <div style="width:100%; display:flex; gap:6px; margin-top:16px;">
                <button class="action-btn-mini btn-att-present" onclick="markAttendanceQuick('${emp.id}', 'حضور')" title="تسجيل حضور سريع"><i class="ph ph-fingerprint"></i></button>
                <button class="action-btn-mini btn-att-absent" onclick="markAttendanceQuick('${emp.id}', 'غياب')" title="تسجيل غياب"><i class="ph ph-user-minus"></i></button>
                <button class="action-btn-mini btn-att-excused" onclick="markAttendanceQuick('${emp.id}', 'مستأذن')" title="تسجيل إذن"><i class="ph ph-clock"></i></button>
                <button class="action-btn-full" style="background:var(--accent-blue); color:white; border:none;" onclick="openFullProfile('${emp.id}')"><i class="ph ph-user-circle"></i> عرض الملف</button>
            </div>
        `;
        grid.appendChild(card);
    });

    const addCard = document.createElement('div');
    addCard.className = 'staff-card card add-new-staff-card';
    addCard.innerHTML = `
        <i class="ph ph-user-plus icon-huge text-pink"></i>
        <h3>تعيين موظف جديد</h3>
        <button class="hr-btn-solid bg-pink mt-3" onclick="showView('view-add-employee', 'nav-new-emp')"><i class="ph ph-plus"></i> إنشاء الملف الآن</button>
    `;
    grid.appendChild(addCard);
}

// ── Open Employee Profile (Full Page) ────────────────────────
let currentProfileId = null;

window.openFullProfile = function(id) {
    const emp = db.employees.find(e => e.id === id);
    if (!emp) return;
    currentProfileId = id;

    const netSalary = (emp.salary || 0) - (emp.loans || 0);
    const absentDays = db.attendance.filter(a => a.empId === id && a.status === 'غياب').length;

    // Compute Dynamic Status
    const todayStr = new Date().toLocaleDateString('ar-SA');
    const todayAtt = db.attendance.find(a => a.empId === id && a.date === todayStr);
    let statusHtml = `<span class="p-tag" style="color:var(--text-muted); border:1px solid var(--border-color)"><i class="ph ph-question"></i> لم يُحضر بعد اليوم</span>`;
    if (todayAtt && todayAtt.status === 'حضور') statusHtml = `<span class="p-tag" style="color:#34d399; border:1px solid rgba(16,185,129,0.3)"><i class="ph ph-check-circle"></i> مداوم الآن</span>`;
    if (todayAtt && todayAtt.status === 'غياب') statusHtml = `<span class="p-tag" style="color:#f87171; border:1px solid rgba(248,113,113,0.3)"><i class="ph ph-x-circle"></i> غائب / إجازة</span>`;

    const shiftType = emp.shiftType || 'صباحي';
    const hours = emp.workHours || 8;

    // Header Details
    const proAvatar = document.getElementById('pro-avatar');
    if(proAvatar) proAvatar.src = emp.avatar || 'avatar.svg';
    
    document.getElementById('pro-name').innerText   = emp.name;
    document.getElementById('pro-role').innerText   = emp.role;
    
    const proShiftEl = document.getElementById('pro-shift');
    if(proShiftEl) proShiftEl.innerText = `${shiftType} (${hours} سا)`;
    
    const proIqamaEl = document.getElementById('pro-iqama');
    if(proIqamaEl) proIqamaEl.innerText  = emp.iqama || 'غير مسجل';
    
    const proStatusEl = document.getElementById('pro-status');
    if(proStatusEl) proStatusEl.outerHTML = `<span class="p-tag" id="pro-status">${statusHtml}</span>`;
    
    document.getElementById('pro-salary').innerHTML = `${fmt(emp.salary || 0)} <span style="font-size:12px">ر.س</span>`;
    document.getElementById('pro-loans').innerHTML  = `${fmt(emp.loans || 0)} <span style="font-size:12px">ر.س</span>`;
    document.getElementById('pro-net').innerHTML    = `${fmt(netSalary)} <span style="font-size:12px">ر.س</span>`;
    document.getElementById('pro-absent').innerHTML = `${absentDays} <span style="font-size:12px">يوم</span>`;

    // Personal Details
    document.getElementById('pro-info-phone').innerText = emp.phone || '—';
    document.getElementById('pro-info-nat').innerText   = emp.nationality || '—';
    document.getElementById('pro-info-start').innerText = emp.startDate || '—';
    document.getElementById('pro-info-notes').innerText = emp.notes || 'لا يوجد ملاحظات.';

    // Finances Table
    renderProfileFinances(emp.name);
    // Attendance Table
    renderProfileAttendance(emp.id);

    // Switch view
    showView('view-emp-profile');
    // Ensure first tab is active
    document.querySelectorAll('.ptab-btn')[0].click();

    // Bind edit button
    document.getElementById('pro-btn-edit').onclick = () => {
        document.getElementById('ne-name').value        = emp.name || '';
        document.getElementById('ne-role').value        = emp.role || '';
        document.getElementById('ne-nationality').value = emp.nationality || '';
        document.getElementById('ne-phone').value       = emp.phone || '';
        document.getElementById('ne-iqama').value       = emp.iqama || '';
        document.getElementById('ne-expiry').value      = emp.expiry || '';
        document.getElementById('ne-shift').value       = emp.shiftType || 'صباحي';
        document.getElementById('ne-hours').value       = emp.workHours || 8;
        document.getElementById('ne-salary').value      = emp.salary || '';
        document.getElementById('ne-start').value       = emp.startDate || '';
        document.getElementById('ne-notes').value       = emp.notes || '';
        document.getElementById('ne-username').value    = emp.username || '';
        document.getElementById('ne-password').value    = emp.password || '';
        if(emp.avatar) {
            photoPreview.src = emp.avatar;
            photoPreview.style.display = 'block';
            currentAvatarBase64 = emp.avatar;
        } else {
            photoPreview.style.display = 'none';
            currentAvatarBase64 = '';
        }
        document.getElementById('form-new-emp').dataset.editId = id;
        document.getElementById('form-emp-title').innerText = 'تعديل ملف الموظف';
        showView('view-add-employee');
    };
};

function renderProfileFinances(empName) {
    const myVouchers = db.hrExpenses.filter(h => h.employee === empName);
    const tbody = document.getElementById('pro-finances-body');
    if(!tbody) return;
    if(myVouchers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">لا توجد حركات مالية مسجلة.</td></tr>';
        return;
    }
    tbody.innerHTML = [...myVouchers].reverse().map(v => `
        <tr>
            <td dir="ltr" style="text-align:right">${v.date}</td>
            <td style="color:${v.type.includes('سلفة')||v.type.includes('عليه')?'#f87171':'#34d399'}; font-weight:700;">${v.type}</td>
            <td style="font-weight:800; font-size:16px;">${fmt(v.amount)} ر.س</td>
            <td>${v.reason || '—'}</td>
        </tr>`).join('');
}

function renderProfileAttendance(empId) {
    const myAtt = db.attendance.filter(a => a.empId === empId);
    const tbody = document.getElementById('pro-attendance-body');
    if(!tbody) return;
    if(myAtt.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">لا توجد سجلات حضور مسجلة.</td></tr>';
        return;
    }
    tbody.innerHTML = [...myAtt].reverse().map(a => `
        <tr>
            <td dir="ltr" style="text-align:right">${a.date}</td>
            <td>${a.time || '—'}</td>
            <td style="color:${a.status === 'حضور'?'#34d399':'#f87171'}; font-weight:700;">${a.status}</td>
            <td>المدير</td>
        </tr>`).join('');
}

window.markAttendanceQuick = function(empId, status) {
    if(!empId) return;
    const now = new Date();
    const dateStr = now.toLocaleDateString('ar-SA');
    
    // Check if already marked today
    const exists = db.attendance.find(a => a.empId === empId && a.date === dateStr);
    if(exists) {
        if(!confirm(`تم تسجيل (${exists.status}) لهذا الموظف اليوم مسبقاً، هل تريد تغييرها لتصبح (${status})؟`)) return;
        exists.status = status;
        exists.time = now.toLocaleTimeString('ar-SA');
    } else {
        db.attendance.push({ empId, date: dateStr, time: now.toLocaleTimeString('ar-SA'), status, timestamp: Date.now() });
    }
    
    // Save attendance immediately
    saveDB(db);
    renderEmployees();
    
    if(currentProfileId === empId) {
        renderProfileAttendance(empId);
        openFullProfile(empId);
    }
    
    // Smart Penalty Integration for Absence
    if(status === 'غياب') {
        const emp = db.employees.find(e => e.id === empId);
        if(emp && db.penaltyRules) {
            const absenceRule = db.penaltyRules.find(r => r.type === 'absence');
            if(absenceRule) {
                setTimeout(() => {
                    if(confirm(`هل تريد تطبيق خصم آلي (جزاء غياب) بقيمة ${absenceRule.amount} ر.س على الموظف؟`)) {
                        emp.loans = (emp.loans || 0) + absenceRule.amount;
                        if(!db.hrExpenses) db.hrExpenses = [];
                        db.hrExpenses.push({
                            employee: emp.name,
                            amount: absenceRule.amount,
                            type: 'خصم / جزاء',
                            reason: absenceRule.name + ` (تسجيل آلي بتاريخ ${dateStr})`,
                            date: dateStr,
                            timestamp: Date.now()
                        });
                        saveDB(db);
                        updateKPIs();
                        renderEmployees();
                        if(document.getElementById('view-deductions').style.display==='block') renderDeductions();
                        alert('تم خصم الجزاء على الموظف بنجاح!');
                    }
                }, 300);
            }
        }
    }
};

// wrapper for the profile page buttons
window.markAttendance = function(status) {
    markAttendanceQuick(currentProfileId, status);
};

window.openAdvanceModalForCurrent = function() {
    const emp = db.employees.find(e => e.id === currentProfileId);
    if(emp) {
        populateEmpSelect();
        document.getElementById('voucher-employee').value = emp.name;
        document.getElementById('voucher-employee').disabled = true;
        document.getElementById('advance-modal').classList.add('active');
    }
};

// ── Save New / Edit Employee ──────────────────────────────────
document.getElementById('form-new-emp')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const editId = e.target.dataset.editId;
    const empData = {
        id:          editId || 'EMP-' + Math.floor(Math.random()*90000+10000),
        name:        document.getElementById('ne-name').value.trim(),
        role:        document.getElementById('ne-role').value,
        nationality: document.getElementById('ne-nationality').value.trim(),
        phone:       document.getElementById('ne-phone').value.trim(),
        iqama:       document.getElementById('ne-iqama').value.trim(),
        expiry:      document.getElementById('ne-expiry').value,
        shiftType:   document.getElementById('ne-shift').value,
        workHours:   Number(document.getElementById('ne-hours').value) || 8,
        salary:      Number(document.getElementById('ne-salary').value) || 0,
        startDate:   document.getElementById('ne-start').value || new Date().toISOString().split('T')[0],
        notes:       document.getElementById('ne-notes').value.trim(),
        username:    document.getElementById('ne-username').value.trim() || undefined,
        password:    document.getElementById('ne-password').value.trim() || undefined,
        loans:       editId ? (db.employees.find(e => e.id === editId)?.loans || 0) : 0,
        status:      'active',
        avatar:      currentAvatarBase64
    };

    if (editId) {
        const idx = db.employees.findIndex(e => e.id === editId);
        if (idx !== -1) db.employees[idx] = empData;
    } else {
        db.employees.push(empData);
    }

    saveDB(db);
    e.target.reset();
    currentAvatarBase64 = '';
    delete e.target.dataset.editId;
    alert(`✅ تم ${editId ? 'تعديل' : 'حفظ'} ملف الموظف "${empData.name}" بنجاح!`);
    
    if(editId) { openFullProfile(editId); } else { showView('view-employees', 'nav-employees'); }
});


// ── Vouchers & Advance Modal Generic ─────────────────────────
function populateEmpSelect() {
    const sel = document.getElementById('voucher-employee');
    if (!sel) return;
    sel.innerHTML = '<option value="" disabled selected>اختر الموظف المستفيد...</option>';
    db.employees.filter(e => e.status !== 'end').forEach(emp => {
        sel.innerHTML += `<option value="${emp.name}">${emp.name} (${emp.role})</option>`;
    });
    sel.disabled = false; // Reset disabled
}

document.getElementById('btn-open-advance-modal')?.addEventListener('click', () => {
    populateEmpSelect();
    document.getElementById('advance-modal').classList.add('active');
});

document.getElementById('btn-close-advance-modal')?.addEventListener('click', () => {
    document.getElementById('advance-modal').classList.remove('active');
});


// ── Payroll & Vouchers Views ─────────────────────────────────
function renderPayroll() {
    const tbody = document.getElementById('payroll-tbody');
    if(!tbody) return;
    let html = '';
    let totalPayroll = 0;
    db.employees.filter(e => e.status !== 'end').forEach(emp => {
        const net = (emp.salary || 0) - (emp.loans || 0);
        totalPayroll += net;
        html += `<tr>
            <td><strong>${emp.name}</strong></td>
            <td>${emp.role}</td>
            <td style="color:var(--accent-green); font-weight:700;">${fmt(emp.salary || 0)} ر.س</td>
            <td style="color:var(--accent-orange);">${emp.loans > 0 ? '-' + fmt(emp.loans) + ' ر.س' : '—'}</td>
            <td style="color:var(--accent-blue); font-weight:800; font-size:16px;">${fmt(net)} ر.س</td>
            <td><span class="inv-tag tag-safe">صافي</span></td>
        </tr>`;
    });
    html += `<tr style="background:rgba(255,255,255,0.05); font-weight:900;">
        <td colspan="4" style="text-align:left; color:white; padding:14px;">إجمالي المسير للصرف</td>
        <td colspan="2" style="color:var(--accent-green); font-size:20px; font-weight:900;">${fmt(totalPayroll)} ر.س</td>
    </tr>`;
    tbody.innerHTML = html;
}

function renderVouchers() {
    const tbody = document.getElementById('vouchers-tbody');
    if (!tbody) return;
    const vouchers = db.hrExpenses || [];
    if (vouchers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted);">لا توجد حركات مالية.</td></tr>';
        return;
    }
    tbody.innerHTML = [...vouchers].reverse().map(v => `
        <tr>
            <td dir="ltr" style="text-align:right">${v.date}</td>
            <td><strong>${v.employee}</strong></td>
            <td style="color:${v.type.includes('سلفة')||v.type.includes('عليه')||v.type.includes('جزاء') ? '#f87171' : '#34d399'}; font-weight:700;">${v.type}</td>
            <td style="font-weight:800; font-size:16px;">${fmt(v.amount)} ر.س</td>
            <td>${v.reason || '—'}</td>
        </tr>`).join('');
}

// ── Deductions View & Rules ────────────────────────────────
function renderDeductions() {
    // 1. Render Rules
    const rulesTbody = document.getElementById('rules-tbody');
    if (rulesTbody) {
        if(!db.penaltyRules || !db.penaltyRules[0]?.id) {
            db.penaltyRules = [
                { id: 'rule_absence', name: 'غياب بدون عذر', amount: 150, type: 'absence', isSystem: true },
                { id: 'rule_delay', name: 'تأخير عن الدوام', amount: 50, type: 'delay', isSystem: true },
                { id: 'rule_misc', name: 'إهمال متعمد أو تلف أدوات', amount: 200, type: 'misc', isSystem: false }
            ];
            saveDB(db);
        }
        if(db.penaltyRules.length === 0) {
            rulesTbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:15px;color:var(--text-muted);">لا توجد قواعد مسجلة.</td></tr>';
        } else {
            rulesTbody.innerHTML = db.penaltyRules.map((r, i) => `
                <tr>
                    <td><strong>${r.name}</strong></td>
                    <td style="color:#34d399; font-weight:bold;">${r.amount} ر.س</td>
                    <td>
                        <button onclick="editPenaltyRule(${i})" style="background:none; border:none; color:var(--accent-blue); font-size:16px; cursor:pointer;" title="تعديل"><i class="ph ph-pencil-simple"></i></button>
                        ${!r.isSystem ? `<button onclick="deletePenaltyRule(${i})" style="background:none; border:none; color:#ef4444; font-size:16px; cursor:pointer; margin-right:8px;" title="حذف"><i class="ph ph-trash"></i></button>` : `<i class="ph ph-lock-key" style="color:var(--text-muted); font-size:16px; margin-right:8px;" title="قاعدة نظام"></i>`}
                    </td>
                </tr>
            `).join('');
        }
    }

    // 2. Render History Log
    const tbody = document.getElementById('deductions-tbody');
    if(!tbody) return;
    const deductions = (db.hrExpenses || []).filter(h => h.type === 'خصم / جزاء');
    if(deductions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted);">لا توجد جزاءات أو خصومات مسجلة. الموظفون مثاليون!</td></tr>';
        return;
    }
    let html = '';
    [...deductions].reverse().forEach(d => {
        html += `<tr>
            <td dir="ltr" style="text-align:right">${d.date}</td>
            <td><strong>${d.employee}</strong></td>
            <td style="color:var(--accent-red); font-weight:800; font-size:16px;">${fmt(d.amount)} ر.س</td>
            <td>${d.reason}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

window.deletePenaltyRule = function(index) {
    if(!confirm('هل أنت متأكد من حذف هذه القاعدة؟')) return;
    db.penaltyRules.splice(index, 1);
    saveDB(db);
    renderDeductions();
};

// ── Penalty Modal Generic ────────────────────────────────────
document.getElementById('btn-open-penalty-modal')?.addEventListener('click', () => {
    // Populate employees
    const sel = document.getElementById('penalty-employee');
    sel.innerHTML = '<option value="" disabled selected>اختر الموظف...</option>';
    db.employees.filter(e => e.status !== 'end').forEach(emp => {
        sel.innerHTML += `<option value="${emp.name}">${emp.name} (${emp.role})</option>`;
    });

    // Populate penalty reasons from rules
    const rulesList = document.getElementById('penalty-reasons-list');
    if(rulesList && db.penaltyRules) {
        rulesList.innerHTML = db.penaltyRules.map(r => `<option value="${r.name}">`).join('');
    }

    document.getElementById('penalty-amount').value = '';
    document.getElementById('penalty-reason').value = '';
    document.getElementById('penalty-modal').classList.add('active');
});

// Auto-fill penalty amount when a configured reason is picked
document.getElementById('penalty-reason')?.addEventListener('input', (e) => {
    const reasonValue = e.target.value;
    if(!db.penaltyRules) return;
    const matchedRule = db.penaltyRules.find(r => r.name === reasonValue);
    if(matchedRule) {
        document.getElementById('penalty-amount').value = matchedRule.amount;
    }
});

document.getElementById('btn-close-penalty-modal')?.addEventListener('click', () => {
    document.getElementById('penalty-modal').classList.remove('active');
});

document.getElementById('form-penalty-trx')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const employee = document.getElementById('penalty-employee').value;
    const amount   = Number(document.getElementById('penalty-amount').value);
    const reason   = document.getElementById('penalty-reason').value;

    if (!employee || !amount || !reason) return alert('الرجاء إكمال البيانات');

    // Subtract from employee effectively by increasing their loans liability
    const emp = db.employees.find(e => e.name === employee);
    if(emp) emp.loans = (emp.loans || 0) + amount;

    // Save as hrExpense but type 'خصم / جزاء' so acc-banks doesn't deduct cash!
    if(!db.hrExpenses) db.hrExpenses = [];
    db.hrExpenses.push({
        employee: employee,
        amount: amount,
        type: 'خصم / جزاء',
        reason: reason,
        date: new Date().toLocaleDateString('ar-SA'),
        timestamp: Date.now()
    });

    saveDB(db);
    document.getElementById('penalty-modal').classList.remove('active');
    e.target.reset();
    
    updateKPIs();
    renderEmployees();
    if(document.getElementById('view-deductions').style.display==='block') renderDeductions();
    
    alert('تم تطبيق الخصم على الموظف وتسجيله في حسابه بنجاح!');
});

// ── Rule Modal Submit ────────────────────────────────────────
window.editPenaltyRule = function(index) {
    const r = db.penaltyRules[index];
    document.getElementById('rule-name').value = r.name;
    document.getElementById('rule-amount').value = r.amount;
    document.getElementById('form-rule-create').dataset.editIndex = index;
    document.getElementById('rule-modal').classList.add('active');
};

document.getElementById('btn-close-rule-modal')?.addEventListener('click', () => {
    document.getElementById('rule-modal').classList.remove('active');
    delete document.getElementById('form-rule-create').dataset.editIndex;
});

document.getElementById('form-rule-create')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if(!db.penaltyRules) db.penaltyRules = [];
    const rxName = document.getElementById('rule-name').value;
    const rxAmt = Number(document.getElementById('rule-amount').value);
    
    if(!rxName || !rxAmt) return;
    
    const editIndex = e.target.dataset.editIndex;
    if(editIndex !== undefined && editIndex !== '') {
        db.penaltyRules[editIndex].name = rxName;
        db.penaltyRules[editIndex].amount = rxAmt;
        delete e.target.dataset.editIndex;
    } else {
        db.penaltyRules.push({ id: Date.now().toString(), name: rxName, amount: rxAmt, type: 'custom', isSystem: false });
    }
    
    saveDB(db);
    
    document.getElementById('rule-modal').classList.remove('active');
    e.target.reset();
    renderDeductions();
});


// ── Generate Voucher ─────────────────────────────────────────
window.generateVoucher = async function(typeStr) {
    const employee = document.getElementById('voucher-employee').value;
    const amount   = document.getElementById('voucher-amount').value;
    const reason   = document.getElementById('voucher-reason').value;

    if (!employee || !amount || !reason) {
        alert('يرجى تعبئة جميع الحقول أولاً.');
        return;
    }

    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '/');
    if (document.getElementById('v-date')) document.getElementById('v-date').innerText = todayStr;
    if (document.getElementById('v-bottom-date')) document.getElementById('v-bottom-date').innerText = todayStr;
    if (document.getElementById('v-number')) document.getElementById('v-number').innerText = Math.floor(Math.random() * 90000) + 10000;
    if (document.getElementById('v-name')) document.getElementById('v-name').innerText = employee;
    if (document.getElementById('v-amt')) document.getElementById('v-amt').innerText = Number(amount).toFixed(2);
    if (document.getElementById('v-amt-text')) document.getElementById('v-amt-text').innerText = Number(amount).toFixed(2);
    if (document.getElementById('v-reason-text')) document.getElementById('v-reason-text').innerText = reason;
    if (document.getElementById('v-balance-text')) document.getElementById('v-balance-text').innerText = typeStr.includes('له') ? 'له ' + amount : 'عليه ' + amount;

    const printContainer = document.getElementById('voucher-print-container');
    printContainer.style.top     = '0';
    printContainer.style.left    = '0';
    printContainer.style.opacity = '1';
    printContainer.style.zIndex  = '-100';

    try {
        // Populate dynamic restaurant settings before render
        try {
            const sysRaw = localStorage.getItem('restaurant_settings'); // ← المفتاح الصحيح
            if (sysRaw) {
                const sysSettings = JSON.parse(sysRaw);
                const titleEl = document.querySelector('#voucher-template .v-right-text h2');
                const pEls = document.querySelectorAll('#voucher-template .v-right-text p');
                const logoEl = document.querySelector('#voucher-template .v-center-logo img');
                if (titleEl && sysSettings.name) titleEl.innerText = sysSettings.name;
                if (pEls[0] && sysSettings.branch) pEls[0].innerText = sysSettings.branch;
                if (pEls[1] && sysSettings.phone) pEls[1].innerText = sysSettings.phone;
                const stampEl = document.getElementById('v-stamp-name');
                if (stampEl && sysSettings.name) stampEl.innerText = sysSettings.name;
                if (logoEl && sysSettings.logo && sysSettings.logo !== '1111.png') {
                    logoEl.src = sysSettings.logo;
                    // Wait for image to load before capturing
                    await new Promise(resolve => { logoEl.onload = resolve; logoEl.onerror = resolve; setTimeout(resolve, 500); });
                }
            }
        } catch(e) {}

        // Position container at start of page with correct size BEFORE capturing
        const voucherEl = document.getElementById('voucher-template');
        printContainer.style.position = 'fixed';
        printContainer.style.top = '-9999px';
        printContainer.style.left = '0';
        printContainer.style.width = '820px';
        printContainer.style.opacity = '0';
        printContainer.style.zIndex = '-1';
        voucherEl.style.width = '800px';
        voucherEl.style.minWidth = '800px';

        // Wait one frame for layout engine to apply
        await new Promise(r => setTimeout(r, 150));

        const canvas = await html2canvas(voucherEl, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            width: 800,
            windowWidth: 1200,
            logging: false
        });

        // Cleanup
        voucherEl.style.width = '';
        voucherEl.style.minWidth = '';
        printContainer.style.position = 'absolute';
        printContainer.style.top  = '-9999px';
        printContainer.style.left = '-9999px';
        printContainer.style.width = '';
        printContainer.style.opacity = '0';

        // Resize to exact target: 1132 × 1600 px
        const TARGET_W = 1600;
        const TARGET_H = 1132;
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width  = TARGET_W;
        finalCanvas.height = TARGET_H;
        const ctx = finalCanvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, TARGET_W, TARGET_H);

        // Scale canvas to fit within target while maintaining ratio (centered)
        ctx.drawImage(canvas, 0, 0, TARGET_W, TARGET_H);

        const imgData = finalCanvas.toDataURL('image/jpeg', 0.95);

        document.getElementById('advance-modal').classList.remove('active');
        document.getElementById('voucher-amount').value = '';
        document.getElementById('voucher-reason').value = '';

        const newEntry = { employee, amount: Number(amount), type: typeStr, reason, date: new Date().toLocaleDateString('ar-SA'), timestamp: Date.now() };
        if (!db.hrExpenses) db.hrExpenses = [];
        db.hrExpenses.push(newEntry);

        if (typeStr.includes('عليه') || typeStr.includes('سلفة')) {
            const emp = db.employees?.find(e => e.name === employee);
            if (emp) emp.loans = (emp.loans || 0) + Number(amount);
        }

        saveDB(db);
        updateKPIs();
        renderEmployees();
        
        // Refresh specific views if active
        if(currentProfileId) {
            const p = db.employees.find(e=>e.id === currentProfileId);
            if(p && p.name === employee) { openFullProfile(currentProfileId); }
        }
        if(document.getElementById('view-payroll').style.display==='block') renderPayroll();
        if(document.getElementById('view-vouchers').style.display==='block') renderVouchers();

        alert('✅ تم قيد الحركة المالية بنجاح في النظام المحاسبي.');

        // send WhatsApp message automatically to employee if enabled
        try {
            const waRaw = localStorage.getItem('wa_settings');
            if (waRaw) {
                const waSettings = JSON.parse(waRaw);
                if (waSettings.loans) {
                    const empObj = db.employees?.find(e => e.name === employee);
                    if (empObj && empObj.phone) {
                        let phoneNum = String(empObj.phone).replace(/^0/, '+966');
                        const captionMsg = `مرحباً ${empObj.name}،\nتم إصدار سند لعملية ( ${typeStr} ) بقيمة ${amount} ر.س.\nالبيان: ${reason}`;
                        const { ipcRenderer } = require('electron');
                        ipcRenderer.send('wa-send-message', {
                            number: phoneNum,
                            text: captionMsg,
                            image: imgData
                        });
                        console.log('Sending WA directly to employee:', phoneNum);
                    }
                }
            }
        } catch(e) { console.error('Error auto-sending WA voucher', e); }
    } catch(err) {
        console.error('Voucher Error', err);
        alert('حدث خطأ أثناء التوليد.');
    }
};

// ── DOM Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Nav Click Event Listeners
    document.getElementById('nav-employees')?.addEventListener('click', (e) => { e.preventDefault(); showView('view-employees', 'nav-employees'); });
    document.getElementById('nav-new-emp')?.addEventListener('click', (e) => { e.preventDefault(); showView('view-add-employee', 'nav-new-emp'); });
    document.getElementById('nav-payroll')?.addEventListener('click', (e) => { e.preventDefault(); showView('view-payroll', 'nav-payroll'); });
    document.getElementById('nav-vouchers')?.addEventListener('click', (e) => { e.preventDefault(); showView('view-vouchers', 'nav-vouchers'); });
    document.getElementById('nav-deductions')?.addEventListener('click', (e) => { e.preventDefault(); showView('view-deductions', 'nav-deductions'); });

    // Role Tabs click logic
    document.querySelectorAll('.role-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.role-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeRoleFilter = btn.dataset.role;
            renderEmployees();
        });
    });

    // Search Box
    document.getElementById('search-emp')?.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim();
        renderEmployees();
    });

    renderEmployees();
});
