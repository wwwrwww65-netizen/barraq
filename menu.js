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
                <div class="menu-item-row">
                    <div class="item-visuals">
                        <img src="${p.image||''}" alt="${p.nameAr}">
                        <div class="item-text">
                            <h4>${p.nameAr}</h4>
                            <p>${catName}</p>
                        </div>
                    </div>
                    <div class="item-price">${Number(p.price).toFixed(2)} ر.س</div>
                    <div class="item-status">
                        ${p.isActive ? '<span class="status-badge active">متاح</span>' : '<span class="status-badge inactive">غير متاح</span>'}
                    </div>
                    <div class="item-pos">
                        ${p.isActive ? '<i class="ph-fill ph-check-circle text-green"></i> ظاهر في الكاشير' : '<i class="ph-fill ph-x-circle text-red"></i> مخفي'}
                    </div>
                    <div class="item-actions">
                        <button class="btn-icon edit" title="تعديل"><i class="ph ph-pencil-simple"></i></button>
                        <button class="btn-icon view" title="إحصائيات المبيعات"><i class="ph ph-chart-line-up"></i></button>
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
