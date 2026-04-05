document.addEventListener('DOMContentLoaded', () => {

    // --- State and Default Data ---
    const STORAGE_KEY = 'system_roles';
    let roles = [];
    let currentRoleIndex = null;

    const defaultRoles = [
        {
            name: "المدير العام (Super Admin)",
            icon: "ph-crown",
            desc: "صلاحيات مطلقة غير مقيدة",
            perms: { 
                pos_access: true, pos_discount: true, pos_return: true, sales_access: true,
                menu_manage: true, inv_manage: true, hr_manage: true, stats_access: true, sys_admin: true,
                fatora_access: true
            }
        },
        {
            name: "كاشير نقطة البيع (Cashier)",
            icon: "ph-monitor",
            desc: "إنطباع واستقبال طلبات الزبائن",
            perms: { 
                pos_access: true, pos_discount: false, pos_return: false, sales_access: false,
                menu_manage: false, inv_manage: false, hr_manage: false, stats_access: false, sys_admin: false,
                fatora_access: false
            }
        },
        {
            name: "مشرف المشتريات والمخازن",
            icon: "ph-package",
            desc: "توريد الأغذية ومراقبة الاستهلاك",
            perms: { 
                pos_access: false, pos_discount: false, pos_return: false, sales_access: false,
                menu_manage: true, inv_manage: true, hr_manage: false, stats_access: false, sys_admin: false,
                fatora_access: false
            }
        },
        {
            name: "مسؤول الفوترة والزكاة",
            icon: "ph-link",
            desc: "منصة فوترة / ZATCA دون صلاحيات محاسبة كاملة",
            perms: {
                pos_access: false, pos_discount: false, pos_return: false, sales_access: false,
                menu_manage: false, inv_manage: false, hr_manage: false, stats_access: false, sys_admin: false,
                fatora_access: true
            }
        }
    ];

    // --- Initialization ---
    function init() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if(!stored) {
            roles = defaultRoles;
            saveRoles();
        } else {
            roles = JSON.parse(stored);
            roles.forEach((r) => {
                if (!r.perms) r.perms = {};
                if (r.perms.fatora_access === undefined) {
                    r.perms.fatora_access = r.perms.hr_manage === true;
                }
            });
            saveRoles();
        }
        renderRolesList();
    }

    // --- Rendering ---
    function renderRolesList() {
        const container = document.getElementById('roles-container');
        container.innerHTML = ''; // Clear

        roles.forEach((r, idx) => {
            const el = document.createElement('div');
            el.className = `role-item ${idx === currentRoleIndex ? 'active' : ''}`;
            el.innerHTML = `
                <div class="role-icon"><i class="ph-fill ${r.icon || 'ph-user-gear'}"></i></div>
                <div class="role-info">
                    <h4>${r.name}</h4>
                    <p>${r.desc || 'مستخدم مخصص'}</p>
                </div>
            `;
            el.addEventListener('click', () => selectRole(idx));
            container.appendChild(el);
        });
    }

    // --- Selection and Matrix ---
    const emptyState = document.getElementById('empty-state-card');
    const editorCard = document.getElementById('editor-card');
    const editingTitle = document.getElementById('editing-role-name');

    const permKeys = [
        'pos_access', 'pos_discount', 'pos_return', 'sales_access',
        'menu_manage', 'inv_manage', 'hr_manage', 'stats_access', 'sys_admin', 'fatora_access'
    ];

    function selectRole(idx) {
        currentRoleIndex = idx;
        const role = roles[idx];
        
        renderRolesList(); // re-render to update active class

        // Show editor
        emptyState.style.display = 'none';
        editorCard.style.display = 'flex';
        
        editingTitle.innerText = role.name;

        // Apply checkboxes
        permKeys.forEach(k => {
            document.getElementById(`p_${k}`).checked = role.perms[k] === true;
        });

        // If it's Super Admin, maybe visually lock them? We'll just let them edit for now
        if(role.name.includes('Super Admin')) {
            editingTitle.innerHTML = role.name + ' <span style="font-size:11px; background:rgba(239,68,68,0.2); color:#ef4444; padding:3px 8px; border-radius:12px; margin-right:10px;">احذر عند التعديل!</span>';
        }
    }

    // --- Save Logic ---
    function saveRoles() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(roles));
    }

    document.getElementById('btn-save-matrix').addEventListener('click', () => {
        if(currentRoleIndex === null) return;
        
        const btn = document.getElementById('btn-save-matrix');
        const origText = btn.innerHTML;
        btn.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin"></i> جاري تحديث الصلاحيات...';
        btn.style.pointerEvents = 'none';

        setTimeout(() => {
            // Collect booleans
            permKeys.forEach(k => {
                roles[currentRoleIndex].perms[k] = document.getElementById(`p_${k}`).checked;
            });
            
            saveRoles();
            
            btn.innerHTML = origText;
            btn.style.pointerEvents = 'auto';
            alert('تم تشفير وحفظ الصلاحيات بنجاح. ستطبق على المستخدمين المعنيين فور تسجيل دخولهم.');
        }, 800);
    });

    // --- Add New Role Modal ---
    const modal = document.getElementById('add-role-modal');
    const nameInput = document.getElementById('new-role-name');
    
    document.getElementById('btn-add-new-role').addEventListener('click', () => {
        modal.classList.add('active');
        nameInput.focus();
    });

    document.getElementById('close-role-modal').addEventListener('click', () => {
        modal.classList.remove('active');
    });

    modal.addEventListener('click', (e) => {
        if(e.target === modal) modal.classList.remove('active');
    });

    document.getElementById('btn-save-new-role').addEventListener('click', () => {
        const val = nameInput.value.trim();
        if(!val) return alert('الرجاء إدخال اسم للدور الوظيفي');

        roles.push({
            name: val,
            icon: "ph-user", // generic
            desc: "دور وظيفي مخصص",
            perms: { 
                pos_access: false, pos_discount: false, pos_return: false, sales_access: false,
                menu_manage: false, inv_manage: false, hr_manage: false, stats_access: false, sys_admin: false,
                fatora_access: false
            }
        });

        saveRoles();
        modal.classList.remove('active');
        nameInput.value = '';
        
        // Select the newly added role automatically
        selectRole(roles.length - 1);
        
        // Scroll to bottom of roles list (optional, but good UX)
        const container = document.getElementById('roles-container');
        container.scrollTop = container.scrollHeight;
    });

    // Run!
    init();
});
