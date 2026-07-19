// Delivery Companies Logic - Premium Version
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Delivery] Initializing...');

    const gridEl = document.getElementById('companies-grid');
    const totalEl = document.getElementById('total-companies');
    const activeEl = document.getElementById('active-companies');
    const searchInput = document.getElementById('search-company');
    
    const modal = document.getElementById('add-company-modal');
    const btnAdd = document.getElementById('btn-add-company');
    const btnClose = document.getElementById('btn-close-company-modal');
    const form = document.getElementById('form-add-company');
    const modalTitle = document.getElementById('modal-company-title');
    
    let companies = [];

    // Safety check for critical elements
    if (!btnAdd || !modal) {
        console.error('[Delivery] Critical elements missing:', { btnAdd, modal });
        return;
    }

    // Load data from DB
    async function loadData() {
        try {
            if (gridEl) {
                gridEl.innerHTML = Array(6).fill(`
                    <div class="skeleton-card company-card" style="height: 180px;">
                        <div class="skeleton-content">
                            <div class="skeleton-line full" style="margin-bottom: 12px;"></div>
                            <div class="skeleton-line medium" style="margin-bottom: 8px;"></div>
                            <div class="skeleton-line short"></div>
                        </div>
                    </div>
                `).join('');
            }
            const _db = await window.dbReadSlice(['deliveryCompanies']);
            companies = _db.deliveryCompanies || [];
            
            // Seed default if empty
            if (companies.length === 0) {
                companies.push({ name: 'هنقرستيشن', phone: '', address: '', isActive: true });
                _db.deliveryCompanies = companies;
                await window.dbWrite(_db);
            }
            
            renderCompanies();
        } catch (e) {
            console.error('[Delivery] Load error:', e);
        }
    }

    function renderCompanies(query = '') {
        const filtered = companies.filter(c => 
            c.name.toLowerCase().includes(query.toLowerCase())
        );

        if (totalEl) totalEl.innerText = companies.length;
        if (activeEl) activeEl.innerText = companies.filter(c => c.isActive !== false).length;

        if (!gridEl) return;

        if (filtered.length === 0) {
            gridEl.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 60px; color: var(--text-muted);">لا توجد شركات توصيل مطابقة.</div>`;
            return;
        }

        let html = '';
        filtered.forEach((c, idx) => {
            const isActive = c.isActive !== false;
            const statusClass = isActive ? 'status-active' : 'status-inactive';
            const statusText = isActive ? 'نشط' : 'معطل';
            
            html += `
                <div class="company-card">
                    <div class="card-top">
                        <div class="company-icon-box">
                            <i class="ph ph-motorcycle"></i>
                        </div>
                        <span class="card-status ${statusClass}">${statusText}</span>
                    </div>
                    <div class="company-info">
                        <h3>${c.name}</h3>
                        <p><i class="ph ph-phone"></i> ${c.phone || 'بدون هاتف'}</p>
                        <p><i class="ph ph-info"></i> ${c.address || 'لا يوجد ملاحظات'}</p>
                    </div>
                    <div class="card-actions">
                        <button class="btn-card-action" onclick="window.editCompany(${idx})">
                            <i class="ph ph-pencil-simple"></i> تعديل
                        </button>
                        <button class="btn-card-action delete" onclick="window.deleteCompany(${idx})">
                            <i class="ph ph-trash"></i> حذف
                        </button>
                    </div>
                </div>
            `;
        });
        
        gridEl.innerHTML = html;
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => renderCompanies(e.target.value.trim()));
    }

    // Modal Events
    btnAdd.onclick = () => {
        form.reset();
        document.getElementById('edit-comp-idx').value = '';
        if (modalTitle) modalTitle.innerHTML = `<i class="ph ph-plus-circle"></i> إضافة شركة توصيل`;
        window.openModalLayer(modal);
    };

    if (btnClose) {
        btnClose.onclick = () => window.closeModalLayer(modal);
    }

    window.editCompany = (idx) => {
        const c = companies[idx];
        document.getElementById('edit-comp-idx').value = idx;
        document.getElementById('comp-name').value = c.name;
        document.getElementById('comp-phone').value = c.phone || '';
        document.getElementById('comp-address').value = c.address || '';
        document.getElementById('comp-active').checked = c.isActive !== false;
        
        if (modalTitle) modalTitle.innerHTML = `<i class="ph ph-pencil-simple"></i> تعديل بيانات الشركة`;
        window.openModalLayer(modal);
    };

    window.deleteCompany = async (idx) => {
        const c = companies[idx];
        if (await ModernDialog.confirm(`هل أنت متأكد من حذف شركة التوصيل (${c.name})؟`)) {
            companies.splice(idx, 1);
            const _db = await window.dbReadSlice(['deliveryCompanies']);
            _db.deliveryCompanies = companies;
            await window.dbWrite(_db);
            renderCompanies(searchInput ? searchInput.value.trim() : '');
        }
    };

    form.onsubmit = async (e) => {
        e.preventDefault();
        const idx = document.getElementById('edit-comp-idx').value;
        const comp = {
            name: document.getElementById('comp-name').value.trim(),
            phone: document.getElementById('comp-phone').value.trim(),
            address: document.getElementById('comp-address').value.trim(),
            isActive: document.getElementById('comp-active').checked
        };
        
        if (!comp.name) return alert('يرجى إدخال اسم الشركة');

        const _db = await window.dbReadSlice(['deliveryCompanies']);
        if (idx !== '') companies[parseInt(idx)] = comp;
        else {
            if (companies.some(c => c.name === comp.name)) return alert('الشركة موجودة مسبقاً');
            companies.push(comp);
        }
        
        _db.deliveryCompanies = companies;
        await window.dbWrite(_db);
        window.closeModalLayer(modal);
        renderCompanies(searchInput ? searchInput.value.trim() : '');
    };

    await loadData();
});
