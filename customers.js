document.addEventListener('DOMContentLoaded', async () => {

    const customersListContainer = document.getElementById('customers-list-container');
    const modal = document.getElementById('add-customer-modal');
    const modalTitle = document.getElementById('modal-title');
    const customerForm = document.getElementById('new-customer-form');
    const btnCloseModal = document.getElementById('btn-close-cust-modal');
    const btnOpenModal = document.getElementById('btn-open-cust-modal');
    const btnOpenModalCard = document.getElementById('btn-open-cust-modal-card');
    const searchInput = document.getElementById('search-customer');
    const filterBtns = document.querySelectorAll('.cust-filter-btn');

    let allCustomers = [];

    // --- Database Operations ---
    async function loadCustomers() {
        if (customersListContainer) {
            customersListContainer.innerHTML = Array(8).fill(`
                <div class="skeleton-card" style="height: 200px;">
                    <div class="skeleton-content">
                        <div class="skeleton-line full" style="margin-bottom: 12px;"></div>
                        <div class="skeleton-line medium" style="margin-bottom: 8px;"></div>
                        <div class="skeleton-line short" style="margin-bottom: 16px;"></div>
                        <div class="skeleton-line full"></div>
                    </div>
                </div>
            `).join('');
        }
        const db = await window.dbReadSlice(['customers']);
        allCustomers = db.customers || [];
        renderCustomers();
        updateKPIs();
    }

    async function saveCustomer(customerData) {
        const db = await window.dbRead();
        if (!db.customers) db.customers = [];

        if (customerData.id) {
            // Edit mode
            const index = db.customers.findIndex(c => c.id === customerData.id);
            if (index !== -1) {
                db.customers[index] = { ...db.customers[index], ...customerData, updatedAt: Date.now() };
            }
        } else {
            // Add mode
            customerData.id = 'CUST-' + Date.now();
            customerData.createdAt = Date.now();
            customerData.ordersCount = 0;
            customerData.points = 0;
            customerData.type = 'regular'; // Default
            db.customers.push(customerData);
        }

        await window.dbWrite(db);
        await loadCustomers();
    }

    async function deleteCustomer(id) {
        if (!confirm('هل أنت متأكد من حذف هذا العميل؟ لا يمكن التراجع عن هذه الخطوة.')) return;
        
        const db = await window.dbRead();
        db.customers = (db.customers || []).filter(c => c.id !== id);
        await window.dbWrite(db);
        await loadCustomers();
    }

    // --- UI Rendering ---
    function renderCustomers() {
        const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
        const activeFilter = document.querySelector('.cust-filter-btn.active').dataset.filter;

        const filtered = allCustomers.filter(c => {
            const matchesQuery = (c.name || '').toLowerCase().includes(query) || (c.phone || '').includes(query);
            const matchesFilter = (activeFilter === 'all' || c.type === activeFilter);
            return matchesQuery && matchesFilter;
        });

        customersListContainer.innerHTML = '';

        if (filtered.length === 0) {
            customersListContainer.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 50px; color: var(--text-muted);">
                    <i class="ph ph-users-three" style="font-size: 48px; opacity: 0.2; margin-bottom: 10px;"></i>
                    <p>لا يوجد عملاء مطابقين للبحث</p>
                </div>
            `;
            return;
        }

        filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).forEach(c => {
            const initials = (c.name || '??').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            
            const card = document.createElement('div');
            card.className = 'customer-card';
            card.dataset.type = c.type;
            card.innerHTML = `
                <div class="cust-card-header">
                    <div class="cust-avatar-box">
                        <div class="cust-avatar" style="background: ${c.type === 'vip' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #3b82f6, #2563eb)'}">${initials}</div>
                        <div class="cust-info">
                            <h3>${c.name}</h3>
                            <p><i class="ph ph-phone"></i> ${c.phone}</p>
                        </div>
                    </div>
                    <span class="cust-badge ${c.type}">${c.type === 'vip' ? '<i class="ph-fill ph-crown"></i> VIP' : '<i class="ph-fill ph-user"></i> عادي'}</span>
                </div>
                
                <div class="cust-stats">
                    <div class="stat-item">
                        <span>إجمالي الطلبات</span>
                        <strong>${c.ordersCount || 0} طلب</strong>
                    </div>
                    <div class="stat-item">
                        <span>نقاط الولاء</span>
                        <strong class="highlight">${c.points || 0} نقطة</strong>
                    </div>
                    <div class="stat-item">
                        <span>آخر زيارة</span>
                        <strong>${c.lastVisit || 'لا يوجد'}</strong>
                    </div>
                </div>

                <div class="cust-actions-grid">
                    <button class="cust-btn call" onclick="window.location.href='tel:${c.phone}'" title="اتصال"><i class="ph ph-phone-call"></i></button>
                    <button class="cust-btn msg" onclick="window.open('https://wa.me/${c.phone}', '_blank')" title="رسالة واتساب"><i class="ph ph-whatsapp-logo"></i></button>
                    <button class="cust-btn edit" data-id="${c.id}" title="تعديل"><i class="ph ph-pencil-simple"></i></button>
                    <button class="cust-btn delete" data-id="${c.id}" title="حذف" style="color: var(--accent-red); background: rgba(239, 68, 68, 0.1);"><i class="ph ph-trash"></i></button>
                </div>
            `;

            // Attach event listeners to buttons within the card
            card.querySelector('.edit').addEventListener('click', () => openEditModal(c));
            card.querySelector('.delete').addEventListener('click', () => deleteCustomer(c.id));

            customersListContainer.appendChild(card);
        });
    }

    function updateKPIs() {
        const total = allCustomers.length;
        const vips = allCustomers.filter(c => c.type === 'vip').length;
        const thisMonth = allCustomers.filter(c => {
            const date = new Date(c.createdAt || 0);
            const now = new Date();
            return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        }).length;

        const kpis = document.querySelectorAll('.cust-kpi-card h2');
        if (kpis[0]) kpis[0].innerText = total.toLocaleString();
        if (kpis[1]) kpis[1].innerText = '+' + thisMonth;
        if (kpis[2]) kpis[2].innerText = vips.toLocaleString();
    }

    // --- Modal Management ---
    function openAddModal() {
        modalTitle.innerHTML = '<i class="ph ph-user-plus"></i> إضافة تسجيل عميل جديد';
        customerForm.reset();
        document.getElementById('c-id').value = '';
        window.openModalLayer(modal);
    }

    function openEditModal(customer) {
        modalTitle.innerHTML = '<i class="ph ph-pencil-simple"></i> تعديل بيانات العميل';
        document.getElementById('c-id').value = customer.id;
        document.getElementById('c-name').value = customer.name;
        document.getElementById('c-phone').value = customer.phone;
        document.getElementById('c-email').value = customer.email || '';
        document.getElementById('c-notes').value = customer.notes || '';
        window.openModalLayer(modal);
    }

    function closeModal() {
        window.closeModalLayer(modal);
    }

    // --- Event Listeners ---
    if (btnOpenModal) btnOpenModal.addEventListener('click', openAddModal);
    if (btnOpenModalCard) btnOpenModalCard.addEventListener('click', openAddModal);
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);

    customerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('c-name').value;
        const phone = document.getElementById('c-phone').value;
        const email = document.getElementById('c-email').value;
        const notes = document.getElementById('c-notes').value;
        const id = document.getElementById('c-id').value;

        const submitBtn = customerForm.querySelector('.btn-save-cust');
        const originalHTML = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="ph-fill ph-spinner-gap ph-spin"></i> جاري الحفظ...';
        submitBtn.disabled = true;

        try {
            await saveCustomer({ id, name, phone, email, notes });
            closeModal();
            // Show success toast (optional, alert for now)
            // alert('تم الحفظ بنجاح');
        } catch (err) {
            console.error(err);
            alert('حدث خطأ أثناء الحفظ');
        } finally {
            submitBtn.innerHTML = originalHTML;
            submitBtn.disabled = false;
        }
    });

    if (searchInput) {
        searchInput.addEventListener('input', renderCustomers);
    }

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderCustomers();
        });
    });

    // Close on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Initialize
    await loadCustomers();
});
