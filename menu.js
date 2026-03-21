document.addEventListener('DOMContentLoaded', () => {

    const catGrid = document.querySelector('.categories-grid');
    const itemsGrid = document.querySelector('.menu-items-grid');

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

    // --- Render Categories ---
    if(catGrid) {
        catGrid.innerHTML = `
            <a href="add-category.html" class="add-cat-card" style="text-decoration:none;">
                <div class="add-icon"><i class="ph ph-plus"></i></div>
                <p>إضافة قسم جديد</p>
            </a>
        `;
        categories.sort((a,b) => (a.order||0) - (b.order||0)).forEach(c => {
            const numItems = products.filter(p => p.categoryId === c.id).length;
            const html = `
                <div class="cat-card">
                    <div class="cat-icon ${c.color||'blue'}"><i class="ph ${c.icon||'ph-folder'}"></i></div>
                    <div class="cat-info">
                        <h3>${c.nameAr}</h3>
                        <p>${numItems} أصناف</p>
                    </div>
                    <button class="cat-options"><i class="ph ph-dots-three-vertical"></i></button>
                </div>
            `;
            catGrid.insertAdjacentHTML('beforeend', html);
        });
    }

    // --- Render Products ---
    if(itemsGrid) {
        itemsGrid.innerHTML = '';
        products.forEach(p => {
            const cat = categories.find(c => c.id === p.categoryId);
            const catName = cat ? cat.nameAr : 'غير مصنف';
            
            const html = `
                <div class="menu-item-card">
                    <div class="item-card-image">
                        <img src="${p.image||'https://images.unsplash.com/photo-1544025162-8315ea07edca?w=400&q=80'}" alt="${p.nameAr}">
                        <div class="status-badge ${p.isActive ? 'available' : 'hidden-badge'}">
                            ${p.isActive ? 'متاح للبيع <i class="ph-fill ph-check-circle"></i>' : 'مخفي <i class="ph-fill ph-eye-slash"></i>'}
                        </div>
                        <div class="item-overlay-actions">
                            <button class="overlay-btn edit"><i class="ph ph-pencil-simple"></i> تعديل</button>
                            <button class="overlay-btn hide"><i class="ph ph-eye-slash"></i> إخفاء</button>
                        </div>
                    </div>
                    <div class="item-card-content">
                        <div class="item-card-header">
                            <h3 class="item-name">${p.nameAr}</h3>
                            <div class="item-category">
                                <i class="ph ${cat ? cat.icon : 'ph-folder'}"></i> ${catName}
                            </div>
                        </div>
                        <p class="item-desc">${p.desc || 'لا يوجد وصف مضاف لهذا الصنف في الوقت الحالي.'}</p>
                        <div class="item-finances">
                            <div class="finance-col">
                                <span class="label">سعر البيع</span>
                                <span class="val price">${Number(p.price).toFixed(2)} ر.س</span>
                            </div>
                            <div class="finance-col">
                                <span class="label">التكلفة</span>
                                <span class="val cost">${p.cost > 0 ? Number(p.cost).toFixed(2) + ' ر.س' : 'غير محدد'}</span>
                            </div>
                            <div class="finance-col">
                                <span class="label">الأرباح</span>
                                <span class="val margin ${p.cost > 0 ? 'positive' : ''}">${p.cost > 0 ? '+' + ((p.price - p.cost)/p.cost*100).toFixed(0) + '%' : '-'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            itemsGrid.insertAdjacentHTML('beforeend', html);
        });
        
        if(products.length === 0) {
            itemsGrid.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted)">لا توجد أصناف في المنيو.</div>`;
        }
    }

});
