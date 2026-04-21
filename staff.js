// ✅ staff.js — HR Module fully connected to pos_database.json (Premium Full-Page Design)
const nodePath = require('path');
const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const curSym = () => (window.HashCurrency ? HashCurrency.getConfig().symbol : 'ر.س');
const xfNum = (n) => (window.HashCurrency ? HashCurrency.formatNumber(n) : fmt(n));
const xf = (n) => (window.HashCurrency ? HashCurrency.format(n) : fmt(n) + ' ر.س');

let db = {};
let voucherSearchQuery = '';

function formatVoucherNo(n) {
    const num = Math.max(1, Number(n) || 1);
    return `V-${String(num).padStart(6, '0')}`;
}

function ensureVoucherConfig() {
    if (!db.hrMeta || typeof db.hrMeta !== 'object') db.hrMeta = {};
    if (!Number.isFinite(Number(db.hrMeta.nextVoucherNo)) || Number(db.hrMeta.nextVoucherNo) < 1) {
        db.hrMeta.nextVoucherNo = 1;
    } else {
        db.hrMeta.nextVoucherNo = Math.floor(Number(db.hrMeta.nextVoucherNo));
    }
}

function allocateVoucherNo() {
    ensureVoucherConfig();
    const no = formatVoucherNo(db.hrMeta.nextVoucherNo);
    db.hrMeta.nextVoucherNo += 1;
    return no;
}

function normalizeVoucherNumber(raw) {
    const txt = String(raw || '').trim().toUpperCase();
    const m = txt.match(/(\d+)/);
    if (!m) return '';
    return formatVoucherNo(Number(m[1]));
}

function ensureVoucherNumbersOnDb() {
    ensureVoucherConfig();
    if (!Array.isArray(db.hrExpenses)) return false;

    let changed = false;
    let maxNum = 0;
    db.hrExpenses.forEach((item) => {
        const n = normalizeVoucherNumber(item?.voucherNo);
        if (n) {
            item.voucherNo = n;
            const numeric = Number((n.match(/\d+/) || ['0'])[0]) || 0;
            if (numeric > maxNum) maxNum = numeric;
        }
    });

    const sorted = [...db.hrExpenses].sort((a, b) => {
        const ta = Number(a?.timestamp || a?.lastModified || 0);
        const tb = Number(b?.timestamp || b?.lastModified || 0);
        return ta - tb;
    });
    sorted.forEach((item) => {
        if (!normalizeVoucherNumber(item?.voucherNo)) {
            maxNum += 1;
            item.voucherNo = formatVoucherNo(maxNum);
            changed = true;
        }
    });

    if (Number(db.hrMeta.nextVoucherNo) <= maxNum) {
        db.hrMeta.nextVoucherNo = maxNum + 1;
        changed = true;
    }
    return changed;
}

function ensurePayrollCycleConfig() {
    if (!db.hrCycle || typeof db.hrCycle !== 'object') {
        db.hrCycle = {
            startDay: 1,
            cycleLengthDays: 30,
            cycleNumber: 1,
            lastResetAt: null,
            nextAutoResetAt: null,
            autoResetEnabled: true,
            payrollClosed: false,
            warnedPendingClose: false,
        };
    }
    if (!Number.isFinite(Number(db.hrCycle.startDay))) db.hrCycle.startDay = 1;
    db.hrCycle.startDay = Math.max(1, Math.min(28, Number(db.hrCycle.startDay)));
    if (!Number.isFinite(Number(db.hrCycle.cycleLengthDays))) db.hrCycle.cycleLengthDays = 30;
    db.hrCycle.cycleLengthDays = Math.max(1, Math.min(62, Number(db.hrCycle.cycleLengthDays)));
    if (!Number.isFinite(Number(db.hrCycle.cycleNumber))) db.hrCycle.cycleNumber = 1;
    if (typeof db.hrCycle.autoResetEnabled !== 'boolean') db.hrCycle.autoResetEnabled = true;
    db.hrCycle.payrollClosed = Boolean(db.hrCycle.payrollClosed);
    db.hrCycle.warnedPendingClose = Boolean(db.hrCycle.warnedPendingClose);
}

function calcNextAutoResetFromNow() {
    ensurePayrollCycleConfig();
    return Date.now() + (Number(db.hrCycle.cycleLengthDays || 30) * 24 * 60 * 60 * 1000);
}

async function checkAndRunAutoCycleReset() {
    ensurePayrollCycleConfig();
    if (!db.hrCycle.autoResetEnabled) return;
    const nextAt = Number(db.hrCycle.nextAutoResetAt || 0);
    if (!nextAt) {
        db.hrCycle.nextAutoResetAt = calcNextAutoResetFromNow();
        await persistDb();
        return;
    }
    if (Date.now() < nextAt) return;
    if (!db.hrCycle.payrollClosed) {
        if (!db.hrCycle.warnedPendingClose) {
            db.hrCycle.warnedPendingClose = true;
            await persistDb();
            alert('تم تجاوز موعد التصفير التلقائي، لكن الدورة غير مقفلة. يرجى إقفال دورة الرواتب أولاً ثم يتم التصفير.');
        }
        return;
    }

    db.employees.forEach(e => { e.loans = 0; });
    db.hrCycle.cycleNumber = Number(db.hrCycle.cycleNumber || 1) + 1;
    db.hrCycle.lastResetAt = Date.now();
    db.hrCycle.nextAutoResetAt = calcNextAutoResetFromNow();
    db.hrCycle.payrollClosed = false;
    db.hrCycle.warnedPendingClose = false;
    await persistDb();
    alert('تم تنفيذ التصفير التلقائي لدورة الرواتب وبدء دورة جديدة.');
}

async function persistDb() {
    await window.dbWrite(db);
}

/** يمنع بقاء التركيز داخل حقل مخفي بعد إغلاق المودال (يسبب عدم استقبال الكتابة عند إعادة الفتح). */
function hideAdvanceVoucherError() {
    const el = document.getElementById('advance-voucher-inline-error');
    if (el) {
        el.style.display = 'none';
        el.textContent = '';
    }
}

/** رسالة تحقق داخل المودال — بدون window.alert (في Electron يكسر التركيز والكتابة). */
function showAdvanceVoucherError(message) {
    const modal = document.getElementById('advance-modal');
    if (modal) {
        modal.removeAttribute('inert');
        modal.classList.add('active');
    }
    const el = document.getElementById('advance-voucher-inline-error');
    if (el) {
        el.textContent = message;
        el.style.display = 'block';
    }
}

function closeHrModal(modalOrId) {
    const modal = typeof modalOrId === 'string' ? document.getElementById(modalOrId) : modalOrId;
    if (!modal) return;
    if (modal.id === 'advance-modal') hideAdvanceVoucherError();
    modal.classList.remove('active');
    modal.setAttribute('inert', '');
    const ae = document.activeElement;
    if (ae && modal.contains(ae)) {
        try {
            ae.blur();
        } catch (_) { /* ignore */ }
    }
    try {
        document.body.setAttribute('tabindex', '-1');
        document.body.focus({ preventScroll: true });
        document.body.removeAttribute('tabindex');
    } catch (_) { /* ignore */ }
}

function openHrModal(modalId) {
    const m = document.getElementById(modalId);
    if (!m) return;
    if (modalId === 'advance-modal') hideAdvanceVoucherError();
    m.removeAttribute('inert');
    m.classList.add('active');
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
// ── Pagination State (Employees Grid) ────────────────────────────


const EMP_PAGE_SIZE = 24;
let empCurrentPage  = 1;
let _empSearchTimer;
window.showView = function(viewId, navId) {
    document.querySelectorAll('.hr-view').forEach(v => v.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(viewId).style.display = 'block';
    if(navId) document.getElementById(navId)?.classList.add('active');

    if(viewId === 'view-employees') renderEmployees();
    if(viewId === 'view-payroll') renderPayroll();
    if(viewId === 'view-vouchers') renderVouchers();
    if(viewId === 'view-deductions') void renderDeductions();
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
    document.getElementById('kpi-loans').innerHTML      = `${xfNum(totalLoan)} <span style="font-size:14px">${curSym()}</span>`;
    document.getElementById('kpi-payroll').innerHTML    = `${xfNum(payroll)} <span style="font-size:14px">${curSym()}</span>`;
}

// ── Render Employees Grid ─────────────────────────────────────
let activeRoleFilter = 'all';
let searchQuery = '';

function renderEmployees() {
    updateKPIs();
    const grid = document.getElementById('staff-grid');
    if (!grid) return;

    let filtered = db.employees.filter(e => {
        const matchRole   = activeRoleFilter === 'all' || e.role === activeRoleFilter;
        const matchSearch = e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (e.iqama || '').includes(searchQuery);
        return matchRole && matchSearch;
    });

    // تحديث التبويبات
    const roleTabsContainer = document.getElementById('role-tabs');
    if (roleTabsContainer) {
        const uniqueRoles = [...new Set(db.employees.map(e => e.role))].filter(Boolean);
        let tabsHtml = `<button class="role-tab ${activeRoleFilter === 'all' ? 'active' : ''}" data-role="all">الجميع (${db.employees.length})</button>`;
        uniqueRoles.forEach(r => {
            const cnt = db.employees.filter(e => e.role === r).length;
            tabsHtml += `<button class="role-tab ${activeRoleFilter === r ? 'active' : ''}" data-role="${r}">${r} (${cnt})</button>`;
        });
        roleTabsContainer.innerHTML = tabsHtml;
        document.querySelectorAll('.role-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.role-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeRoleFilter = btn.dataset.role;
                empCurrentPage = 1;
                renderEmployees();
            });
        });
    }

    // ── Pagination ─────────────────────────────────────────────────
    const total      = filtered.length;
    const totalPages = Math.max(1, Math.ceil((total + 1) / EMP_PAGE_SIZE)); // +1 for add-card
    if (empCurrentPage > totalPages) empCurrentPage = totalPages;
    const start     = (empCurrentPage - 1) * EMP_PAGE_SIZE;
    const pageItems = filtered.slice(start, start + EMP_PAGE_SIZE);

    const todayStr = new Date().toLocaleDateString('ar-SA');
    function getEmpStatus(empId) {
        const todayAtt = db.attendance.find(a => a.empId === empId && a.date === todayStr);
        if (todayAtt && todayAtt.status === 'حضور') return { label: 'مداوم الآن', class: 'status-online' };
        if (todayAtt && todayAtt.status === 'غياب') return { label: 'إجازة / غائب', class: 'status-offline' };
        return { label: 'لم يُحضر بعد', class: 'status-offline', style: 'background:rgba(255,255,255,0.05); color:var(--text-muted); border-color:var(--border-color);' };
    }

    grid.innerHTML = '';
    const fragment = document.createDocumentFragment();

    pageItems.forEach(emp => {
        const rc = roleConfig[emp.role] || { badge: '', icon: 'ph-user', color: '#64748b' };
        const sc = getEmpStatus(emp.id);
        const avatarHtml = emp.avatar
            ? `<img src="${emp.avatar}" style="width:100px;height:100px;border-radius:50%;object-fit:cover;border:3px solid ${rc.color};box-shadow:0 8px 25px rgba(0,0,0,0.5);">`
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
            <div style="width:100%;display:flex;gap:6px;margin-top:16px;">
                <button class="action-btn-mini btn-att-present" onclick="markAttendanceQuick('${emp.id}','حضور')" title="حضور"><i class="ph ph-fingerprint"></i></button>
                <button class="action-btn-mini btn-att-absent" onclick="markAttendanceQuick('${emp.id}','غياب')" title="غياب"><i class="ph ph-user-minus"></i></button>
                <button class="action-btn-mini btn-att-excused" onclick="markAttendanceQuick('${emp.id}','مستأذن')" title="إذن"><i class="ph ph-clock"></i></button>
                <button class="action-btn-full" style="background:var(--accent-blue);color:var(--text-primary);border:none;" onclick="openFullProfile('${emp.id}')"><i class="ph ph-user-circle"></i> عرض الملف</button>
            </div>
        `;
        fragment.appendChild(card);
    });

    // كارد إضافة موظف — فقط في آخر صفحة أو إذا كانت الصفحة الأخيرة
    if (empCurrentPage === totalPages) {
        const addCard = document.createElement('div');
        addCard.className = 'staff-card card add-new-staff-card';
        addCard.innerHTML = `
            <i class="ph ph-user-plus icon-huge text-pink"></i>
            <h3>تعيين موظف جديد</h3>
            <button class="hr-btn-solid bg-pink mt-3" onclick="showView('view-add-employee','nav-new-emp')"><i class="ph ph-plus"></i> إنشاء الملف الآن</button>
        `;
        fragment.appendChild(addCard);
    }

    grid.appendChild(fragment);
    _renderEmpPagination(empCurrentPage, totalPages, total, grid);
}

function _renderEmpPagination(page, totalPages, total, grid) {
    let bar = document.getElementById('emp-pagination-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'emp-pagination-bar';
        bar.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;padding:20px 0;flex-wrap:wrap;grid-column:1/-1;';
        grid.parentElement?.appendChild(bar);
    }
    if (totalPages <= 1) { bar.innerHTML = ''; return; }

    const bs = (active) => `background:${active?'var(--accent-blue)':'var(--bg-card)'};color:${active?'#fff':'var(--text-secondary)'};border:1px solid ${active?'var(--accent-blue)':'var(--border-color)'};border-radius:8px;padding:6px 16px;cursor:pointer;font-family:inherit;font-weight:700;font-size:13px;transition:background-color 0.15s ease;`;

    let html = `<span style="color:var(--text-muted);font-size:13px">صفحة ${page}/${totalPages} — ${total} موظف</span>`;
    html += `<button style="${bs(false)}" id="ep-first" ${page===1?'disabled':''}>«</button>`;
    html += `<button style="${bs(false)}" id="ep-prev"  ${page===1?'disabled':''}>‹</button>`;
    for (let i = Math.max(1, page-2); i <= Math.min(totalPages, page+2); i++)
        html += `<button style="${bs(i===page)}" class="ep-num" data-p="${i}">${i}</button>`;
    html += `<button style="${bs(false)}" id="ep-next" ${page===totalPages?'disabled':''}>›</button>`;
    html += `<button style="${bs(false)}" id="ep-last" ${page===totalPages?'disabled':''}>»</button>`;

    bar.innerHTML = html;
    bar.querySelector('#ep-first')?.addEventListener('click', () => { empCurrentPage = 1; renderEmployees(); });
    bar.querySelector('#ep-prev' )?.addEventListener('click', () => { empCurrentPage--; renderEmployees(); });
    bar.querySelector('#ep-next' )?.addEventListener('click', () => { empCurrentPage++; renderEmployees(); });
    bar.querySelector('#ep-last' )?.addEventListener('click', () => { empCurrentPage = totalPages; renderEmployees(); });
    bar.querySelectorAll('.ep-num').forEach(b =>
        b.addEventListener('click', () => { empCurrentPage = Number(b.dataset.p); renderEmployees(); })
    );
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
    
    document.getElementById('pro-salary').innerHTML = `${xfNum(emp.salary || 0)} <span style="font-size:12px">${curSym()}</span>`;
    document.getElementById('pro-loans').innerHTML  = `${xfNum(emp.loans || 0)} <span style="font-size:12px">${curSym()}</span>`;
    document.getElementById('pro-net').innerHTML    = `${xfNum(netSalary)} <span style="font-size:12px">${curSym()}</span>`;
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

    // ── Sales Tab (cashiers only) ──────────────────────────────────────
    const cashierRoles = ['كاشير', 'cashier', 'مبيعات'];
    const isCashier = cashierRoles.some(r => (emp.role || '').toLowerCase().includes(r.toLowerCase()));
    const salesTabBtn = document.getElementById('pro-sales-tab-btn');
    if (salesTabBtn) salesTabBtn.style.display = isCashier ? 'inline-flex' : 'none';

    if (isCashier) {
        // Read orders from pos_database via db-helper if available, else try ipcRenderer
        (async () => {
            let allOrders = [];
            try {
                if (window.dbRead) {
                    const posDb = await window.dbRead();
                    allOrders = posDb.orders || [];
                } else {
                    const { ipcRenderer } = require('electron');
                    const posDb = ipcRenderer.sendSync('db-read');
                    allOrders = (posDb && posDb.orders) || [];
                }
            } catch(e) { console.error('Sales load failed', e); }

            // Match orders to this employee by name (cashier field or legacy)
            const myOrders = allOrders.filter(o => {
                const c = o.cashier || '';
                return c === emp.name || c === emp.username || (!c && false);
            });

            const salesBody = document.getElementById('pro-sales-body');
            const salesKpi  = document.getElementById('pro-sales-kpi');
            if (!salesBody) return;

            const totalSales = myOrders.reduce((s, o) => s + (o.total || 0), 0);
            const fmt2 = (n) => (window.HashCurrency ? HashCurrency.format(n) : n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ر.س');
            const payColor = m => m === 'كاش' ? '#10b981' : m === 'مجزأ' ? '#f59e0b' : '#60a5fa';

            if (salesKpi) {
                salesKpi.innerHTML = `
                    <span style="background:rgba(16,185,129,0.12); color:#10b981; padding:6px 14px; border-radius:20px; font-weight:700;">${myOrders.length} طلب</span>
                    <span style="background:rgba(16,185,129,0.12); color:#10b981; padding:6px 14px; border-radius:20px; font-weight:700;">${fmt2(totalSales)}</span>
                `;
            }

            if (myOrders.length === 0) {
                salesBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">لا توجد مبيعات مسجلة بهذا الاسم بعد.</td></tr>';
                return;
            }

            const sorted = [...myOrders].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            salesBody.innerHTML = sorted.map(o => `
                <tr>
                    <td><strong>${o.orderId || '—'}</strong></td>
                    <td style="font-size:12px; color:var(--text-muted);">${o.date || '—'}</td>
                    <td>${o.type || 'محلي'}</td>
                    <td style="color:${payColor(o.paymentMethod)}; font-weight:700;">${o.paymentMethod || '—'}</td>
                    <td style="font-weight:800; color:#10b981;">${fmt2(o.total)}</td>
                </tr>`).join('');
        })();
    }

    // ── Print Button ──────────────────────────────────────────────────
    document.getElementById('pro-btn-print').onclick = () => window.print();

    // ── Delete Button ─────────────────────────────────────────────────
    document.getElementById('pro-btn-delete').onclick = async () => {
        const confirmed = confirm(
            `⚠️ حذف الموظف: ${emp.name}\n\n` +
            `• سيُحذف ملف الموظف من قائمة الموظفين.\n` +
            `• ستبقى جميع سجلاته المالية والمبيعات محفوظة في قاعدة البيانات لأسباب محاسبية.\n` +
            `• لا يمكن التراجع عن هذا الإجراء.\n\n` +
            `هل أنت متأكد؟`
        );
        if (!confirmed) return;

        // Remove employee from db
        db.employees = db.employees.filter(e => e.id !== emp.id);

        // Remove system login if exists
        try {
            const users = JSON.parse(localStorage.getItem('system_users') || '[]');
            const updated = users.filter(u => u.username !== emp.username && u.name !== emp.name);
            localStorage.setItem('system_users', JSON.stringify(updated));
        } catch(e) {}

        // Save and navigate
        await persistDb();
        showView('view-employees', 'nav-employees');
        renderStaff();
        updateKPIs();
        alert(`✅ تم حذف الموظف "${emp.name}" بنجاح.\nسجلاته المالية محفوظة في قاعدة البيانات.`);
    };

    document.getElementById('pro-btn-reset').onclick = async () => {
        const openLoans = Number(emp.loans) || 0;
        if (openLoans <= 0) {
            alert('لا توجد سلف/خصومات مفتوحة لهذا الموظف حالياً.');
            return;
        }
        const confirmed = confirm(
            `تصفير حساب الموظف: ${emp.name}\n\n` +
            `سيتم تصفير الرصيد المفتوح (${xf(openLoans)}) والبدء بدورة جديدة له.\n` +
            `هل تريد المتابعة؟`
        );
        if (!confirmed) return;
        emp.loans = 0;
        await persistDb();
        updateKPIs();
        renderEmployees();
        renderPayroll();
        openFullProfile(emp.id);
        alert('تم تصفير حساب الموظف بنجاح.');
    };

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
    const myVouchers = (db.hrExpenses || [])
        .map((h, idx) => ({ h, idx }))
        .filter(({ h }) => h.employee === empName);
    const tbody = document.getElementById('pro-finances-body');
    if(!tbody) return;
    if(myVouchers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">لا توجد حركات مالية مسجلة.</td></tr>';
        return;
    }
    tbody.innerHTML = [...myVouchers].reverse().map(({ h, idx }) => `
        <tr>
            <td dir="ltr" style="text-align:right">${h.date}</td>
            <td style="color:${h.type.includes('سلفة')||h.type.includes('عليه')?'#f87171':'#34d399'}; font-weight:700;">${h.type}</td>
            <td style="font-weight:800; font-size:16px;">${xf(h.amount)}</td>
            <td>${h.reason || '—'}</td>
            <td>
                <button onclick="editHrVoucher(${idx})" style="background:none; border:none; color:var(--accent-blue); font-size:16px; cursor:pointer;" title="تعديل"><i class="ph ph-pencil-simple"></i></button>
                <button onclick="deleteHrVoucher(${idx})" style="background:none; border:none; color:#ef4444; font-size:16px; cursor:pointer; margin-right:8px;" title="حذف"><i class="ph ph-trash"></i></button>
            </td>
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

window.markAttendanceQuick = async function(empId, status) {
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
    await persistDb();
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
                setTimeout(async () => {
                    if(confirm(`هل تريد تطبيق خصم آلي (جزاء غياب) بقيمة ${xf(absenceRule.amount)} على الموظف؟`)) {
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
                        await persistDb();
                        updateKPIs();
                        renderEmployees();
                        if(document.getElementById('view-deductions').style.display==='block') await renderDeductions();
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
        openHrModal('advance-modal');
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const a = document.getElementById('voucher-amount');
                try {
                    a?.focus({ preventScroll: true });
                } catch (_) {
                    a?.focus();
                }
            });
        });
    }
};

// ── Save New / Edit Employee ──────────────────────────────────
document.getElementById('form-new-emp')?.addEventListener('submit', async (e) => {
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

    await persistDb();
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

function openVoucherEditor(voucherIndex) {
    const voucher = (db.hrExpenses || [])[voucherIndex];
    if (!voucher) return;
    populateEmpSelect();
    const empSel = document.getElementById('voucher-employee');
    const amtEl = document.getElementById('voucher-amount');
    const rsnEl = document.getElementById('voucher-reason');
    const typeSel = document.getElementById('voucher-type');
    const paySel = document.getElementById('voucher-pay-method');
    if (!empSel || !amtEl || !rsnEl || !typeSel || !paySel) return;

    empSel.value = voucher.employee || '';
    amtEl.value = Number(voucher.amount) || 0;
    rsnEl.value = voucher.reason || '';
    paySel.value = voucher.pMethod === 'bank' ? 'bank' : 'cash';

    const t = String(voucher.type || '');
    if (t.includes('عليه') || t.includes('سلفة')) typeSel.value = 'advance';
    else if (t.includes('مكافأة')) typeSel.value = 'bonus';
    else typeSel.value = 'salary';

    document.getElementById('advance-modal').dataset.editIndex = String(voucherIndex);
    openHrModal('advance-modal');
}

document.getElementById('btn-open-advance-modal')?.addEventListener('click', () => {
    const modal = document.getElementById('advance-modal');
    if (modal) delete modal.dataset.editIndex;
    populateEmpSelect();
    openHrModal('advance-modal');
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const el = document.getElementById('voucher-employee');
            try {
                el?.focus({ preventScroll: true });
            } catch (_) {
                el?.focus();
            }
        });
    });
});

document.getElementById('btn-close-advance-modal')?.addEventListener('click', () => {
    const modal = document.getElementById('advance-modal');
    if (modal) delete modal.dataset.editIndex;
    closeHrModal('advance-modal');
});

window.generateVoucherFromSelection = function() {
    const sel = document.getElementById('voucher-type');
    const v = (sel && sel.value) || 'salary';
    if (v === 'advance') return generateVoucher('عليه (سلفة)');
    if (v === 'bonus') return generateVoucher('له (مكافأة)');
    return generateVoucher('له (راتب)');
};


// ── Payroll & Vouchers Views ─────────────────────────────────
function renderPayroll() {
    const tbody = document.getElementById('payroll-tbody');
    if(!tbody) return;
    ensurePayrollCycleConfig();
    let html = '';
    let totalPayroll = 0;
    db.employees.filter(e => e.status !== 'end').forEach(emp => {
        const net = (emp.salary || 0) - (emp.loans || 0);
        totalPayroll += net;
        html += `<tr>
            <td><strong>${emp.name}</strong></td>
            <td>${emp.role}</td>
            <td style="color:var(--accent-green); font-weight:700;">${xf(emp.salary || 0)}</td>
            <td style="color:var(--accent-orange);">${emp.loans > 0 ? '-' + xf(emp.loans) : '—'}</td>
            <td style="color:var(--accent-blue); font-weight:800; font-size:16px;">${xf(net)}</td>
            <td><span class="inv-tag tag-safe">صافي</span></td>
        </tr>`;
    });
    html += `<tr style="background:rgba(255,255,255,0.05); font-weight:900;">
        <td colspan="4" style="text-align:left; color:var(--text-primary); padding:14px;">إجمالي المسير للصرف</td>
        <td colspan="2" style="color:var(--accent-green); font-size:20px; font-weight:900;">${xf(totalPayroll)}</td>
    </tr>`;
    tbody.innerHTML = html;

    const cycleInput = document.getElementById('payroll-cycle-start-day');
    if (cycleInput) cycleInput.value = String(db.hrCycle.startDay || 1);
    const cycleLenInput = document.getElementById('payroll-cycle-length-days');
    if (cycleLenInput) cycleLenInput.value = String(db.hrCycle.cycleLengthDays || 30);
    const nextDateInput = document.getElementById('payroll-next-reset-date');
    if (nextDateInput) {
        if (db.hrCycle.nextAutoResetAt) {
            const d = new Date(db.hrCycle.nextAutoResetAt);
            const ymd = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            nextDateInput.value = ymd;
        } else {
            nextDateInput.value = '';
        }
    }
    const cycleMeta = document.getElementById('payroll-cycle-meta');
    if (cycleMeta) {
        const lastReset = db.hrCycle.lastResetAt ? new Date(db.hrCycle.lastResetAt).toLocaleString('ar-SA') : 'لم يتم بعد';
        const nextReset = db.hrCycle.nextAutoResetAt ? new Date(db.hrCycle.nextAutoResetAt).toLocaleString('ar-SA') : 'غير محدد';
        const closeState = db.hrCycle.payrollClosed ? 'مقفلة وجاهزة للتصفير' : 'غير مقفلة';
        const autoState = db.hrCycle.autoResetEnabled ? 'مفعل' : 'معطل';
        cycleMeta.innerHTML = `الدورة الحالية: <strong>#${db.hrCycle.cycleNumber}</strong> — بداية الدورة: يوم <strong>${db.hrCycle.startDay}</strong> — مدة الدورة: <strong>${db.hrCycle.cycleLengthDays} يوم</strong> — آخر تصفير: <strong>${lastReset}</strong> — التصفير التلقائي القادم: <strong>${nextReset}</strong> — حالة الإقفال: <strong>${closeState}</strong> — التصفير التلقائي: <strong>${autoState}</strong>`;
    }
    const autoToggle = document.getElementById('auto-reset-toggle');
    const autoToggleText = document.getElementById('auto-reset-toggle-text');
    if (autoToggle) autoToggle.checked = Boolean(db.hrCycle.autoResetEnabled);
    if (autoToggleText) autoToggleText.textContent = db.hrCycle.autoResetEnabled ? 'التصفير التلقائي: مفعل' : 'التصفير التلقائي: معطل';
    const closeBtn = document.getElementById('btn-close-payroll-cycle');
    if (closeBtn) closeBtn.textContent = db.hrCycle.payrollClosed ? 'إلغاء إقفال الدورة' : 'إقفال دورة الرواتب';
}

function renderVouchers() {
    const tbody = document.getElementById('vouchers-tbody');
    if (!tbody) return;
    let vouchers = (db.hrExpenses || []).map((h, idx) => ({ h, idx }));
    const q = String(voucherSearchQuery || '').trim().toLowerCase();
    if (q) {
        vouchers = vouchers.filter(({ h }) => {
            const no = String(h.voucherNo || '').toLowerCase();
            const emp = String(h.employee || '').toLowerCase();
            const reason = String(h.reason || '').toLowerCase();
            const type = String(h.type || '').toLowerCase();
            return no.includes(q) || emp.includes(q) || reason.includes(q) || type.includes(q);
        });
    }
    if (vouchers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted);">لا توجد نتائج مطابقة.</td></tr>';
        return;
    }
    tbody.innerHTML = [...vouchers].reverse().map(({ h, idx }) => `
        <tr>
            <td><strong dir="ltr">${h.voucherNo || '—'}</strong></td>
            <td dir="ltr" style="text-align:right">${h.date}</td>
            <td><strong>${h.employee}</strong></td>
            <td style="color:${h.type.includes('سلفة')||h.type.includes('عليه')||h.type.includes('جزاء') ? '#f87171' : '#34d399'}; font-weight:700;">${h.type}</td>
            <td style="font-weight:800; font-size:16px;">${xf(h.amount)}</td>
            <td>${h.reason || '—'}</td>
            <td>
                <button onclick="editHrVoucher(${idx})" style="background:none; border:none; color:var(--accent-blue); font-size:16px; cursor:pointer;" title="تعديل"><i class="ph ph-pencil-simple"></i></button>
                <button onclick="deleteHrVoucher(${idx})" style="background:none; border:none; color:#ef4444; font-size:16px; cursor:pointer; margin-right:8px;" title="حذف"><i class="ph ph-trash"></i></button>
            </td>
        </tr>`).join('');
}

function voucherAffectsEmployeeLoans(voucherType) {
    const t = String(voucherType || '');
    return t.includes('سلفة') || t.includes('عليه') || t.includes('خصم / جزاء') || t.includes('جزاء');
}

function applyVoucherLoanDelta(voucher, direction) {
    if (!voucherAffectsEmployeeLoans(voucher?.type)) return;
    const emp = db.employees.find(e => e.name === voucher.employee);
    if (!emp) return;
    const amt = Number(voucher.amount) || 0;
    emp.loans = Math.max(0, (Number(emp.loans) || 0) + (direction * amt));
}

function refreshHrViewsAfterVoucherChange() {
    updateKPIs();
    renderEmployees();
    renderPayroll();
    renderVouchers();
    if (currentProfileId) {
        const emp = db.employees.find(e => e.id === currentProfileId);
        if (emp) openFullProfile(currentProfileId);
    }
}

window.deleteHrVoucher = async function(index) {
    const voucher = (db.hrExpenses || [])[index];
    if (!voucher) return;
    const ok = confirm(
        `هل تريد حذف العملية المالية؟\n\n` +
        `رقم السند: ${voucher.voucherNo || '—'}\n` +
        `الموظف: ${voucher.employee}\n` +
        `النوع: ${voucher.type}\n` +
        `المبلغ: ${xf(voucher.amount)}\n` +
        `البيان: ${voucher.reason || '—'}`
    );
    if (!ok) return;

    applyVoucherLoanDelta(voucher, -1);
    db.hrExpenses.splice(index, 1);
    await persistDb();
    refreshHrViewsAfterVoucherChange();
    alert('تم حذف العملية المالية بنجاح.');
};

window.editHrVoucher = function(index) {
    openVoucherEditor(index);
};

// ── Deductions View & Rules ────────────────────────────────
async function renderDeductions() {
    // 1. Render Rules
    const rulesTbody = document.getElementById('rules-tbody');
    if (rulesTbody) {
        if(!db.penaltyRules || !db.penaltyRules[0]?.id) {
            db.penaltyRules = [
                { id: 'rule_absence', name: 'غياب بدون عذر', amount: 150, type: 'absence', isSystem: true },
                { id: 'rule_delay', name: 'تأخير عن الدوام', amount: 50, type: 'delay', isSystem: true },
                { id: 'rule_misc', name: 'إهمال متعمد أو تلف أدوات', amount: 200, type: 'misc', isSystem: false }
            ];
            await persistDb();
        }
        if(db.penaltyRules.length === 0) {
            rulesTbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:15px;color:var(--text-muted);">لا توجد قواعد مسجلة.</td></tr>';
        } else {
            rulesTbody.innerHTML = db.penaltyRules.map((r, i) => `
                <tr>
                    <td><strong>${r.name}</strong></td>
                    <td style="color:#34d399; font-weight:bold;">${xf(r.amount)}</td>
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
            <td style="color:var(--accent-red); font-weight:800; font-size:16px;">${xf(d.amount)}</td>
            <td>${d.reason}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

window.deletePenaltyRule = async function(index) {
    if(!confirm('هل أنت متأكد من حذف هذه القاعدة؟')) return;
    db.penaltyRules.splice(index, 1);
    await persistDb();
    await renderDeductions();
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
    openHrModal('penalty-modal');
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const el = document.getElementById('penalty-employee');
            try {
                el?.focus({ preventScroll: true });
            } catch (_) {
                el?.focus();
            }
        });
    });
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
    closeHrModal('penalty-modal');
});

document.getElementById('form-penalty-trx')?.addEventListener('submit', async (e) => {
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

    await persistDb();
    closeHrModal('penalty-modal');
    e.target.reset();
    
    updateKPIs();
    renderEmployees();
    if(document.getElementById('view-deductions').style.display==='block') await renderDeductions();
    
    alert('تم تطبيق الخصم على الموظف وتسجيله في حسابه بنجاح!');
});

// ── Rule Modal Submit ────────────────────────────────────────
window.openRuleModalForCreate = function() {
    const form = document.getElementById('form-rule-create');
    if (form) delete form.dataset.editIndex;
    const n = document.getElementById('rule-name');
    const a = document.getElementById('rule-amount');
    if (n) n.value = '';
    if (a) a.value = '';
    openHrModal('rule-modal');
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            try {
                n?.focus({ preventScroll: true });
            } catch (_) {
                n?.focus();
            }
        });
    });
};

window.editPenaltyRule = function(index) {
    const r = db.penaltyRules[index];
    document.getElementById('rule-name').value = r.name;
    document.getElementById('rule-amount').value = r.amount;
    document.getElementById('form-rule-create').dataset.editIndex = index;
    openHrModal('rule-modal');
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const el = document.getElementById('rule-name');
            try {
                el?.focus({ preventScroll: true });
            } catch (_) {
                el?.focus();
            }
        });
    });
};

document.getElementById('btn-close-rule-modal')?.addEventListener('click', () => {
    closeHrModal('rule-modal');
    delete document.getElementById('form-rule-create').dataset.editIndex;
});

document.getElementById('form-rule-create')?.addEventListener('submit', async (e) => {
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
    
    await persistDb();
    
    closeHrModal('rule-modal');
    e.target.reset();
    await renderDeductions();
});


// ── Generate Voucher ─────────────────────────────────────────
window.generateVoucher = async function(typeStr) {
    const employee = (document.getElementById('voucher-employee')?.value || '').trim();
    const amount   = String(document.getElementById('voucher-amount')?.value || '').trim();
    const reason   = (document.getElementById('voucher-reason')?.value || '').trim();

    if (!employee || !amount || !reason) {
        const lines = ['يرجى إكمال البيانات التالية:'];
        if (!employee) lines.push('• اختر الموظف المستفيد');
        if (!amount) lines.push('• أدخل المبلغ');
        if (!reason) lines.push('• اكتب البيان / السبب');
        showAdvanceVoucherError(lines.join('\n'));
        const target = !employee
            ? document.getElementById('voucher-employee')
            : !amount
              ? document.getElementById('voucher-amount')
              : document.getElementById('voucher-reason');
        requestAnimationFrame(() => {
            try {
                target?.focus({ preventScroll: true });
            } catch (_) {
                target?.focus();
            }
        });
        return;
    }

    hideAdvanceVoucherError();

    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '/');
    if (document.getElementById('v-date')) document.getElementById('v-date').innerText = todayStr;
    if (document.getElementById('v-bottom-date')) document.getElementById('v-bottom-date').innerText = todayStr;
    if (document.getElementById('v-name')) document.getElementById('v-name').innerText = employee;
    const amtFmt = Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (document.getElementById('v-amt')) document.getElementById('v-amt').innerText = amtFmt;
    if (document.getElementById('v-amt-text')) document.getElementById('v-amt-text').innerText = amtFmt;
    if (document.getElementById('v-reason-text')) document.getElementById('v-reason-text').innerText = reason;
    if (document.getElementById('v-balance-text')) {
        const emp = db.employees?.find((e) => e.name === employee);
        const salary = Number(emp?.salary) || 0;
        const loans = Number(emp?.loans) || 0;
        const amtNum = Number(amount);
        const netRemaining = Math.max(0, salary - loans - amtNum);
        const netFmt = netRemaining.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
        document.getElementById('v-balance-text').innerText = netFmt;
    }
    if (document.getElementById('v-notes')) document.getElementById('v-notes').innerText = reason;
    const docTitle = document.getElementById('v-doc-title');
    if (docTitle) {
        if (typeStr.includes('راتب')) docTitle.textContent = 'سند راتب';
        else if (typeStr.includes('مستحقات')) docTitle.textContent = 'سند صرف مستحقات';
        else docTitle.textContent = 'سند صرف';
    }

    const paySel = document.getElementById('voucher-pay-method');
    const pMethod = paySel && paySel.value === 'bank' ? 'bank' : 'cash';
    const advanceModal = document.getElementById('advance-modal');
    const editIndexRaw = advanceModal?.dataset?.editIndex;
    const isEditMode = editIndexRaw !== undefined && editIndexRaw !== '';
    const editIndex = isEditMode ? Number(editIndexRaw) : -1;
    const existingVoucher = (isEditMode && db.hrExpenses && db.hrExpenses[editIndex]) ? db.hrExpenses[editIndex] : null;
    const voucherNo = normalizeVoucherNumber(existingVoucher?.voucherNo) || allocateVoucherNo();
    if (document.getElementById('v-number')) document.getElementById('v-number').innerText = voucherNo;

    const printContainer = document.getElementById('voucher-print-container');
    let voucherEl = null;
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
                if (logoEl && sysSettings.logo && sysSettings.logo !== '1111.png') {
                    logoEl.src = sysSettings.logo;
                    // Wait for image to load before capturing
                    await new Promise(resolve => { logoEl.onload = resolve; logoEl.onerror = resolve; setTimeout(resolve, 500); });
                }
            }
        } catch(e) {}

        closeHrModal('advance-modal');
        const vAmt = document.getElementById('voucher-amount');
        const vRsn = document.getElementById('voucher-reason');
        if (vAmt) vAmt.value = '';
        if (vRsn) vRsn.value = '';
        await new Promise((r) => setTimeout(r, 0));

        // Position container at start of page with correct size BEFORE capturing
        voucherEl = document.getElementById('voucher-template');
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

        if (!db.hrExpenses) db.hrExpenses = [];
        if (isEditMode && db.hrExpenses[editIndex]) {
            const oldEntry = { ...db.hrExpenses[editIndex] };
            applyVoucherLoanDelta(oldEntry, -1);
            db.hrExpenses[editIndex] = {
                ...db.hrExpenses[editIndex],
                employee,
                amount: Number(amount),
                type: typeStr,
                reason,
                date: new Date().toLocaleDateString('ar-SA'),
                pMethod,
                voucherNo,
                lastModified: Date.now(),
            };
            applyVoucherLoanDelta(db.hrExpenses[editIndex], 1);
        } else {
            const newEntry = {
                employee,
                amount: Number(amount),
                type: typeStr,
                reason,
                date: new Date().toLocaleDateString('ar-SA'),
                timestamp: Date.now(),
                pMethod,
                voucherNo,
            };
            db.hrExpenses.push(newEntry);
            applyVoucherLoanDelta(newEntry, 1);
        }

        await persistDb();
        updateKPIs();
        renderEmployees();
        
        // Refresh specific views if active
        if(currentProfileId) {
            const p = db.employees.find(e=>e.id === currentProfileId);
            if(p && p.name === employee) { openFullProfile(currentProfileId); }
        }
        if(document.getElementById('view-payroll').style.display==='block') renderPayroll();
        if(document.getElementById('view-vouchers').style.display==='block') renderVouchers();

        if (advanceModal) delete advanceModal.dataset.editIndex;
        alert(isEditMode ? '✅ تم تعديل الحركة المالية بنجاح.' : '✅ تم قيد الحركة المالية بنجاح في النظام المحاسبي.');

        // send WhatsApp message automatically to employee and admin if enabled
        try {
            const { ipcRenderer } = require('electron');
            const waDbg = (level, message) => {
                try { ipcRenderer.send('wa-debug-log', { level, message }); } catch (_) {}
            };
            waDbg('info', `[Voucher] Start WA flow voucherNo=${voucherNo} employee="${employee}" editMode=${isEditMode}`);

            const waRaw = localStorage.getItem('wa_settings');
            if (!waRaw) {
                // Fallback for installations that only saved restaurant_settings.whatsapp
                // and never visited "حفظ الإعدادات" after adding WA block.
                let waFallback = {
                    admin: '',
                    hubIp: '',
                    loans: true,
                    expenses: true,
                    reports: true
                };
                try {
                    const rsRaw = localStorage.getItem('restaurant_settings');
                    if (rsRaw) {
                        const rs = JSON.parse(rsRaw);
                        const adminCandidate = String(rs?.whatsapp || rs?.phone || '').trim();
                        if (adminCandidate) waFallback.admin = adminCandidate;
                    }
                } catch (_) {}

                localStorage.setItem('wa_settings', JSON.stringify(waFallback));
                waDbg('warn', `[Voucher] wa_settings missing -> created fallback (admin=${waFallback.admin ? 'yes' : 'no'})`);
            }

            const waSettings = JSON.parse(localStorage.getItem('wa_settings') || '{}');
            if (!waSettings || typeof waSettings !== 'object') {
                waDbg('error', '[Voucher] wa_settings invalid JSON/object -> skipping WA send');
            } else {
                if (!waSettings.admin) {
                    try {
                        const rsRaw = localStorage.getItem('restaurant_settings');
                        if (rsRaw) {
                            const rs = JSON.parse(rsRaw);
                            const fallbackAdmin = String(rs?.whatsapp || rs?.phone || '').trim();
                            if (fallbackAdmin) {
                                waSettings.admin = fallbackAdmin;
                                localStorage.setItem('wa_settings', JSON.stringify(waSettings));
                                waDbg('warn', '[Voucher] Admin missing in wa_settings -> recovered from restaurant_settings (whatsapp/phone)');
                            }
                        }
                    } catch (_) {}
                }
                waDbg('info', `[Voucher] wa_settings loaded loans=${waSettings.loans} admin=${waSettings.admin ? 'yes' : 'no'}`);
                // Default behavior: enabled unless explicitly disabled.
                if (waSettings.loans !== false) {
                    const hubIp =
                        typeof window.resolveWaHubIp === 'function'
                            ? window.resolveWaHubIp(waSettings)
                            : (waSettings.hubIp && String(waSettings.hubIp).trim()) || '';
                    waDbg('info', `[Voucher] WA enabled, hubIp=${hubIp || 'local'}`);

                    const actionText = isEditMode ? 'تم تعديل سند' : 'تم إصدار سند';
                    // 1- Send to Employee
                    const empObj = db.employees?.find(e => e.name === employee);
                    if (empObj && empObj.phone) {
                        let phoneNum = String(empObj.phone).replace(/^0/, '+966');
                        const captionMsg = `مرحباً ${empObj.name}،\n${actionText} رقم (${voucherNo}) لعملية ( ${typeStr} ) بقيمة ${xf(amount)}.\nالبيان: ${reason}`;
                        
                        ipcRenderer.send('wa-send-message', {
                            number: phoneNum,
                            text: captionMsg,
                            image: imgData,
                            waHubIp: hubIp,
                        });
                        waDbg('info', `[Voucher] Queued WA send to employee phone=${phoneNum}`);
                        console.log('Sending WA directly to employee:', phoneNum);
                    } else {
                        waDbg('warn', `[Voucher] Employee phone missing or employee not found for "${employee}"`);
                    }

                    // 2- Send to Admin/Accountant
                    if (waSettings.admin) {
                        let adminPhone = String(waSettings.admin).replace(/^0/, '+966');
                        const adminCaptionMsg = `إشعار إداري:\n${actionText} (${voucherNo})\nالنوع: ${typeStr}\nالموظف: ${employee}\nالقيمة: ${xf(amount)}\nالبيان: ${reason}`;
                        
                        ipcRenderer.send('wa-send-message', {
                            number: adminPhone,
                            text: adminCaptionMsg,
                            image: imgData,
                            waHubIp: hubIp,
                        });
                        waDbg('info', `[Voucher] Queued WA send to admin phone=${adminPhone}`);
                        console.log('Sending WA to Admin:', adminPhone);
                    } else {
                        waDbg('warn', '[Voucher] Admin phone missing in wa_settings -> admin send skipped');
                    }
                } else {
                    waDbg('warn', '[Voucher] WA loans toggle is disabled -> skipping WA send');
                }
            }
        } catch(e) { console.error('Error auto-sending WA voucher', e); }
    } catch(err) {
        console.error('Voucher Error', err);
        alert('حدث خطأ أثناء التوليد.');
    } finally {
        if (voucherEl) {
            voucherEl.style.width = '';
            voucherEl.style.minWidth = '';
        }
        printContainer.style.position = 'absolute';
        printContainer.style.top = '-9999px';
        printContainer.style.left = '-9999px';
        printContainer.style.width = '';
        printContainer.style.opacity = '0';
        printContainer.style.zIndex = '';
        document.querySelectorAll('iframe.html2canvas-container').forEach((f) => {
            try {
                f.remove();
            } catch (_) { /* ignore */ }
        });
    }
};

// ── DOM Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    db = await window.dbRead();
    if (!db.employees) db.employees = [];
    if (!db.hrExpenses) db.hrExpenses = [];
    if (!db.attendance) db.attendance = [];
    ensureVoucherConfig();
    if (ensureVoucherNumbersOnDb()) await persistDb();
    ensurePayrollCycleConfig();
    await checkAndRunAutoCycleReset();

    if (db.employees.length === 0) {
        db.employees = [
            { id:'EMP-001', name:'أحمد الكاشير', role:'كاشير', nationality:'يمني', phone:'0551234567', iqama:'2100001111', expiry:'2026-08-14', salary:4500, loans:200, status:'active', startDate:'2024-01-15', notes:'', avatar:'' },
            { id:'EMP-002', name:'محمد علي صالح', role:'مطبخ', nationality:'مصري', phone:'0501112223', iqama:'2200002222', expiry:'2027-01-02', salary:5200, loans:0, status:'active', startDate:'2023-06-10', notes:'شيف رئيسي' }
        ];
        await persistDb();
    }

    // Nav Click Event Listeners
    document.getElementById('nav-employees')?.addEventListener('click', (e) => { e.preventDefault(); showView('view-employees', 'nav-employees'); });
    document.getElementById('nav-new-emp')?.addEventListener('click', (e) => { e.preventDefault(); showView('view-add-employee', 'nav-new-emp'); });
    document.getElementById('nav-payroll')?.addEventListener('click', (e) => { e.preventDefault(); showView('view-payroll', 'nav-payroll'); });
    document.getElementById('nav-vouchers')?.addEventListener('click', (e) => { e.preventDefault(); showView('view-vouchers', 'nav-vouchers'); });
    document.getElementById('nav-deductions')?.addEventListener('click', (e) => { e.preventDefault(); showView('view-deductions', 'nav-deductions'); });

    document.getElementById('btn-save-cycle-start')?.addEventListener('click', async () => {
        ensurePayrollCycleConfig();
        const inputDay = document.getElementById('payroll-cycle-start-day');
        const inputLen = document.getElementById('payroll-cycle-length-days');
        const day = Number(inputDay?.value || 1);
        const lengthDays = Number(inputLen?.value || 30);
        if (!Number.isFinite(day) || day < 1 || day > 28) {
            alert('الرجاء إدخال يوم بداية صحيح من 1 إلى 28.');
            return;
        }
        if (!Number.isFinite(lengthDays) || lengthDays < 1 || lengthDays > 62) {
            alert('الرجاء إدخال مدة دورة صحيحة من 1 إلى 62 يوم.');
            return;
        }
        db.hrCycle.startDay = day;
        db.hrCycle.cycleLengthDays = lengthDays;
        db.hrCycle.nextAutoResetAt = calcNextAutoResetFromNow();
        db.hrCycle.warnedPendingClose = false;
        await persistDb();
        renderPayroll();
        alert(`تم حفظ إعدادات الدورة: البداية يوم ${day} والمدة ${lengthDays} يوم.`);
    });

    document.getElementById('btn-save-next-reset-date')?.addEventListener('click', async () => {
        ensurePayrollCycleConfig();
        const dateInput = document.getElementById('payroll-next-reset-date');
        const raw = String(dateInput?.value || '').trim();
        if (!raw) {
            alert('يرجى اختيار تاريخ التصفير القادم.');
            return;
        }
        const d = new Date(raw + 'T00:00:00');
        if (Number.isNaN(d.getTime())) {
            alert('تاريخ غير صالح.');
            return;
        }
        db.hrCycle.nextAutoResetAt = d.getTime();
        db.hrCycle.warnedPendingClose = false;
        await persistDb();
        renderPayroll();
        alert('تم حفظ موعد التصفير القادم بنجاح.');
    });

    document.getElementById('auto-reset-toggle')?.addEventListener('change', async (ev) => {
        ensurePayrollCycleConfig();
        db.hrCycle.autoResetEnabled = Boolean(ev.target.checked);
        db.hrCycle.warnedPendingClose = false;
        await persistDb();
        renderPayroll();
        alert(db.hrCycle.autoResetEnabled ? 'تم تفعيل التصفير التلقائي.' : 'تم تعطيل التصفير التلقائي.');
    });

    document.getElementById('btn-close-payroll-cycle')?.addEventListener('click', async () => {
        ensurePayrollCycleConfig();
        db.hrCycle.payrollClosed = !db.hrCycle.payrollClosed;
        db.hrCycle.warnedPendingClose = false;
        await persistDb();
        renderPayroll();
        alert(db.hrCycle.payrollClosed ? 'تم إقفال الدورة. التصفير التلقائي مسموح عند الموعد.' : 'تم إلغاء إقفال الدورة.');
    });

    document.getElementById('btn-start-new-cycle')?.addEventListener('click', async () => {
        ensurePayrollCycleConfig();
        const impacted = db.employees.filter(e => (Number(e.loans) || 0) > 0);
        const total = impacted.reduce((s, e) => s + (Number(e.loans) || 0), 0);
        const ok = confirm(
            `بدء دورة شهر جديد\n\n` +
            `سيتم تصفير السلف/الخصومات المفتوحة لجميع الموظفين.\n` +
            `عدد الموظفين المتأثرين: ${impacted.length}\n` +
            `إجمالي المبالغ التي ستُصفّر: ${xf(total)}\n\n` +
            `هل تريد المتابعة؟`
        );
        if (!ok) return;

        db.employees.forEach(e => { e.loans = 0; });
        db.hrCycle.cycleNumber = Number(db.hrCycle.cycleNumber || 1) + 1;
        db.hrCycle.lastResetAt = Date.now();
        db.hrCycle.nextAutoResetAt = calcNextAutoResetFromNow();
        db.hrCycle.payrollClosed = false;
        db.hrCycle.warnedPendingClose = false;
        await persistDb();
        updateKPIs();
        renderEmployees();
        renderPayroll();
        if (currentProfileId) openFullProfile(currentProfileId);
        alert('تم بدء دورة شهر جديد وتصفير حسابات الموظفين بنجاح.');
    });

    // Role Tabs click logic
    document.querySelectorAll('.role-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.role-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeRoleFilter = btn.dataset.role;
            renderEmployees();
        });
    });

    // Search Box — debounce 300ms
    document.getElementById('search-emp')?.addEventListener('input', (e) => {
        clearTimeout(_empSearchTimer);
        const val = e.target.value.trim();
        _empSearchTimer = setTimeout(() => {
            searchQuery = val;
            empCurrentPage = 1;
            renderEmployees();
        }, 300);
    });
    document.getElementById('search-voucher')?.addEventListener('input', (e) => {
        voucherSearchQuery = String(e.target.value || '').trim();
        renderVouchers();
    });

    renderEmployees();

    if (typeof window.registerPosDatabaseRefresh === 'function') {
        window.registerPosDatabaseRefresh(async () => {
            db = await window.dbRead();
            if (!db.employees) db.employees = [];
            if (!db.hrExpenses) db.hrExpenses = [];
            if (!db.attendance) db.attendance = [];
            ensureVoucherConfig();
            if (ensureVoucherNumbersOnDb()) await persistDb();
            updateKPIs();
            renderEmployees();
            renderPayroll();
            renderVouchers();
            await renderDeductions();
            populateEmpSelect();
        });
    }
});
