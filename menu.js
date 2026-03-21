document.addEventListener('DOMContentLoaded', () => {

    let categories = [];
    const cs = localStorage.getItem('pos_categories');
    if(cs) categories = JSON.parse(cs);

    let products = [];
    const ps = localStorage.getItem('pos_products');
    if(ps) products = JSON.parse(ps);

    // Initial fallback if system is entirely empty
    if(categories.length === 0) {
        categories = [
            { id: 'cat_1', nameAr: 'شعبيات ومندي', icon: 'ph-bowl-food', color: 'orange', order: 1 },
            { id: 'cat_2', nameAr: 'مشويات', icon: 'ph-fire', color: 'red', order: 2 }
        ];
        localStorage.setItem('pos_categories', JSON.stringify(categories));
    }
    if(products.length === 0) {
        products = [
            { id: 'p_1', categoryId: 'cat_1', nameAr: 'مندي دجاج', price: 40, image: 'https://images.unsplash.com/photo-1596797038530-2c107229654b?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=80', isActive: true },
            { id: 'p_2', categoryId: 'cat_1', nameAr: 'مظبي لحم', price: 65, image: 'https://images.unsplash.com/photo-1544928147-79a2dbc1f389?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=80', isActive: true }
        ];
        localStorage.setItem('pos_products', JSON.stringify(products));
    }

    // --- Tab Switching ---
    const tabBtns = document.querySelectorAll('.menu-tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.style.display = 'none');
            
            btn.classList.add('active');
            document.getElementById('tab-' + btn.dataset.tab).style.display = 'block';
        });
    });

    // --- Render Products Table ---
    const pTableBody = document.getElementById('products-table-body');
    const searchProdInput = document.getElementById('search-products-input');

    function renderProducts(query = '') {
        if(!pTableBody) return;
        pTableBody.innerHTML = '';
        
        const filtered = products.filter(p => p.nameAr.toLowerCase().includes(query.toLowerCase()));
        
        if(filtered.length === 0) {
            pTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px;">لا توجد أصناف مطابقة.</td></tr>`;
            return;
        }

        filtered.forEach(p => {
            const cat = categories.find(c => c.id === p.categoryId);
            const catName = cat ? cat.nameAr : 'غير مصنف';
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><img src="${p.image||'https://placehold.co/100'}" style="width:50px; height:50px; border-radius:6px; object-fit:cover;"></td>
                <td style="font-weight:700;">${p.nameAr}</td>
                <td><i class="ph ${cat ? cat.icon : 'ph-folder'}"></i> ${catName}</td>
                <td style="color:var(--accent-green); font-weight:800;">${Number(p.price).toFixed(2)} ر.س</td>
                <td style="color:var(--accent-orange); font-weight:700;">${p.cost > 0 ? Number(p.cost).toFixed(2) + ' ر.س' : '-'}</td>
                <td>
                    ${p.isActive ? '<span class="status-badge available" style="position:static; display:inline-flex;">متاح <i class="ph-fill ph-check-circle"></i></span>' : '<span class="status-badge hidden-badge" style="position:static; display:inline-flex;">مخفي <i class="ph-fill ph-eye-slash"></i></span>'}
                </td>
                <td style="text-align:center;">
                    <button class="action-btn edit-prod-btn" style="color:var(--accent-blue);" data-id="${p.id}"><i class="ph ph-pencil-simple"></i> تعديل</button>
                    ${!p.isActive ? `<button class="action-btn toggle-prod-btn" style="color:var(--accent-green);" data-id="${p.id}" title="تفعيل"><i class="ph ph-eye"></i></button>` : `<button class="action-btn toggle-prod-btn" style="color:var(--text-muted);" data-id="${p.id}" title="إخفاء"><i class="ph ph-eye-slash"></i></button>`}
                </td>
            `;
            pTableBody.appendChild(tr);
        });

        // Attach edit events
        document.querySelectorAll('.edit-prod-btn').forEach(btn => {
            btn.addEventListener('click', (e) => openEditProduct(e.target.closest('button').dataset.id));
        });
        document.querySelectorAll('.toggle-prod-btn').forEach(btn => {
            btn.addEventListener('click', (e) => toggleProductStatus(e.target.closest('button').dataset.id));
        });
    }

    if(searchProdInput) {
        searchProdInput.addEventListener('input', (e) => renderProducts(e.target.value));
    }

    // --- Render Categories Table ---
    const cTableBody = document.getElementById('categories-table-body');
    const searchCatInput = document.getElementById('search-categories-input');

    function renderCategories(query = '') {
        if(!cTableBody) return;
        cTableBody.innerHTML = '';
        
        let sortedCats = [...categories].sort((a,b) => (a.order||0) - (b.order||0));
        const filtered = sortedCats.filter(c => c.nameAr.toLowerCase().includes(query.toLowerCase()));
        
        if(filtered.length === 0) {
            cTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px;">لا توجد أقسام مطابقة.</td></tr>`;
            return;
        }

        filtered.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><div style="width:40px; height:40px; border-radius:8px; background:rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center; font-size:24px; color:var(--accent-${c.color||'blue'});"><i class="ph ${c.icon}"></i></div></td>
                <td style="font-weight:700; font-size:16px;">${c.nameAr}</td>
                <td><span style="display:inline-block; padding:4px 10px; border-radius:12px; background:rgba(255,255,255,0.1); color:var(--accent-${c.color});">${c.color}</span></td>
                <td>${c.order || '-'}</td>
                <td style="text-align:center;">
                    <button class="action-btn edit-cat-btn" style="color:var(--accent-green);" data-id="${c.id}"><i class="ph ph-pencil-simple"></i> تعديل</button>
                    <button class="action-btn del-cat-btn" style="color:var(--accent-red);" data-id="${c.id}"><i class="ph ph-trash"></i> حذف</button>
                </td>
            `;
            cTableBody.appendChild(tr);
        });

        // Attach edit events
        document.querySelectorAll('.edit-cat-btn').forEach(btn => {
            btn.addEventListener('click', (e) => openEditCategory(e.target.closest('button').dataset.id));
        });
        document.querySelectorAll('.del-cat-btn').forEach(btn => {
            btn.addEventListener('click', (e) => deleteCategory(e.target.closest('button').dataset.id));
        });
    }

    if(searchCatInput) {
        searchCatInput.addEventListener('input', (e) => renderCategories(e.target.value));
    }


    // --- Product Edit Logic ---
    function openEditProduct(id) {
        window.location.href = `add-item.html?edit=${id}`;
    }

    window.toggleProductStatus = function(id) {
        const prod = products.find(p => p.id === id);
        if(prod) {
            prod.isActive = !prod.isActive;
            localStorage.setItem('pos_products', JSON.stringify(products));
            renderProducts(searchProdInput.value);
            showNotice(prod.isActive ? 'تم تفعيل الصنف' : 'تم إخفاء الصنف');
        }
    }


    // --- Category Edit Logic ---
    function openEditCategory(id) {
        window.location.href = `add-category.html?edit=${id}`;
    }

    window.deleteCategory = function(id) {
        const inUse = products.some(p => p.categoryId === id);
        if(inUse) {
            alert('لا يمكن حذف القسم! يوجد أصناف بداخل هذا القسم. قم بنقلها أولاً.');
            return;
        }
        
        if(confirm('هل أنت متأكد من حذف هذا القسم؟')) {
            categories = categories.filter(c => c.id !== id);
            localStorage.setItem('pos_categories', JSON.stringify(categories));
            renderCategories(searchCatInput.value);
            showNotice('تم الحذف بنجاح');
        }
    }

    // Notice Toast Utility
    function showNotice(msg) {
        const notif = document.createElement('div');
        notif.style.position = 'fixed';
        notif.style.bottom = '20px';
        notif.style.right = '20px';
        notif.style.background = 'var(--accent-green)';
        notif.style.color = 'white';
        notif.style.padding = '12px 24px';
        notif.style.borderRadius = '8px';
        notif.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
        notif.style.zIndex = '9999';
        notif.style.fontWeight = 'bold';
        notif.innerHTML = `<i class="ph ph-check-circle"></i> ${msg}`;
        document.body.appendChild(notif);
        setTimeout(() => { notif.style.opacity = '0'; setTimeout(()=>notif.remove(), 500); }, 3000);
    }

    // Initial render
    renderProducts();
    renderCategories();

});
