const fs = require('fs');
const path = require('path');
const dbPath = require('electron').ipcRenderer.sendSync('get-db-path');

function loadDB() {
    try { return JSON.parse(fs.readFileSync(dbPath, 'utf8')); }
    catch(e) { return { orders:[], products:[], categories:[], inventory:[] }; }
}
const { ipcRenderer } = require('electron');
function saveDB(db) { 
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2)); 
    try { ipcRenderer.send('notify-db-changed'); } catch(e) {}
}

document.addEventListener('DOMContentLoaded', () => {

    // ✅ Load from JSON DB
    let db = loadDB();
    if(!db.categories) db.categories = [];
    if(!db.products) db.products = [];

    let categories = db.categories;
    let products = db.products;

    // We no longer inject dummy fallback data so users can have a completely empty menu.

    // Also sync to localStorage for pos.js (which reads menu from localStorage)
    localStorage.setItem('pos_categories', JSON.stringify(categories));
    localStorage.setItem('pos_products', JSON.stringify(products));

    // --- Tab Switching ---
    const tabBtns = document.querySelectorAll('.menu-tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.style.display='none');
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
            pTableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 20px;">لا توجد أصناف مطابقة.</td></tr>`;
            return;
        }
        filtered.forEach(p => {
            const cat = categories.find(c => c.id === p.categoryId);
            const catName = cat ? cat.nameAr : 'غير مصنف';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><img src="${p.image||'placeholder.svg'}" style="width:50px; height:50px; border-radius:6px; object-fit:cover;"></td>
                <td style="font-weight:700;">${p.nameAr}</td>
                <td><span style="font-family:monospace; font-size:12px; color:var(--accent-blue); background:rgba(59,130,246,0.1); padding:2px 6px; border-radius:4px;">${p.sku||'-'}</span></td>
                <td><i class="ph ${cat ? cat.icon : 'ph-folder'}"></i> ${catName}</td>
                <td style="color:var(--accent-green); font-weight:800;">${Number(p.price).toFixed(2)} ر.س</td>
                <td style="color:var(--accent-orange); font-weight:700;">${(p.cost||0) > 0 ? Number(p.cost).toFixed(2) + ' ر.س' : '-'}</td>
                <td>
                    ${p.isActive ? '<span class="status-badge available" style="position:static; display:inline-flex;">متاح <i class="ph-fill ph-check-circle"></i></span>' : '<span class="status-badge hidden-badge" style="position:static; display:inline-flex;">مخفي <i class="ph-fill ph-eye-slash"></i></span>'}
                </td>
                <td style="text-align:center;">
                    <button class="action-btn edit-prod-btn" style="color:var(--accent-blue);" data-id="${p.id}"><i class="ph ph-pencil-simple"></i> تعديل</button>
                    ${!p.isActive
                        ? `<button class="action-btn toggle-prod-btn" style="color:var(--accent-green);" data-id="${p.id}" title="تفعيل"><i class="ph ph-eye"></i></button>`
                        : `<button class="action-btn toggle-prod-btn" style="color:var(--text-muted);" data-id="${p.id}" title="إخفاء"><i class="ph ph-eye-slash"></i></button>`}
                    <button class="action-btn del-prod-btn" style="color:var(--accent-red);" data-id="${p.id}" title="حذف"><i class="ph ph-trash"></i></button>
                </td>
            `;
            pTableBody.appendChild(tr);
        });

        document.querySelectorAll('.edit-prod-btn').forEach(btn => {
            btn.addEventListener('click', (e) => openEditProduct(e.target.closest('button').dataset.id));
        });
        document.querySelectorAll('.toggle-prod-btn').forEach(btn => {
            btn.addEventListener('click', (e) => toggleProductStatus(e.target.closest('button').dataset.id));
        });
        document.querySelectorAll('.del-prod-btn').forEach(btn => {
            btn.addEventListener('click', (e) => deleteProduct(e.target.closest('button').dataset.id));
        });
    }

    if(searchProdInput) searchProdInput.addEventListener('input', (e) => renderProducts(e.target.value));

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

        document.querySelectorAll('.edit-cat-btn').forEach(btn => {
            btn.addEventListener('click', (e) => openEditCategory(e.target.closest('button').dataset.id));
        });
        document.querySelectorAll('.del-cat-btn').forEach(btn => {
            btn.addEventListener('click', (e) => deleteCategory(e.target.closest('button').dataset.id));
        });
    }

    if(searchCatInput) searchCatInput.addEventListener('input', (e) => renderCategories(e.target.value));

    // --- Product Edit ---
    function openEditProduct(id) {
        window.location.href = `add-item.html?edit=${id}`;
    }

    function toggleProductStatus(id) {
        const prod = products.find(p => p.id === id);
        if(prod) {
            prod.isActive = !prod.isActive;
            // ✅ Save to JSON DB
            db.products = products;
            saveDB(db);
            localStorage.setItem('pos_products', JSON.stringify(products));
            renderProducts(searchProdInput?.value || '');
            showNotice(prod.isActive ? 'تم تفعيل الصنف ✅' : 'تم إخفاء الصنف');
        }
    }

    function deleteProduct(id) {
        if(confirm('هل أنت متأكد من الحذف النهائي لهذا الصنف؟')) {
            products = products.filter(p => p.id !== id);
            db.products = products;
            saveDB(db);
            localStorage.setItem('pos_products', JSON.stringify(products));
            renderProducts(searchProdInput?.value || '');
            showNotice('تم حذف الصنف بنجاح');
        }
    }

    // --- Category Edit ---
    function openEditCategory(id) {
        window.location.href = `add-category.html?edit=${id}`;
    }

    function deleteCategory(id) {
        const inUse = products.some(p => p.categoryId === id);
        if(inUse) { 
            alert('لا يمكن حذف القسم! يوجد أصناف مسجلة بداخله. الرجاء مسح هذه الأصناف أولاً لتتمكن من حذفه.'); 
            return; 
        }
        if(confirm('هل أنت متأكد من حذف هذا القسم نهائياً؟')) {
            categories = categories.filter(c => c.id !== id);
            db.categories = categories;
            saveDB(db);
            localStorage.setItem('pos_categories', JSON.stringify(categories));
            renderCategories(searchCatInput?.value || '');
            showNotice('تم الحذف بنجاح');
        }
    }

    // --- Toast Notification ---
    function showNotice(msg) {
        const notif = document.createElement('div');
        Object.assign(notif.style, {
            position:'fixed', bottom:'20px', right:'20px',
            background:'var(--accent-green)', color:'white',
            padding:'12px 24px', borderRadius:'8px',
            boxShadow:'0 5px 15px rgba(0,0,0,0.3)',
            zIndex:'9999', fontWeight:'bold', transition:'opacity 0.5s'
        });
        notif.innerHTML = `<i class="ph ph-check-circle"></i> ${msg}`;
        document.body.appendChild(notif);
        setTimeout(() => { notif.style.opacity = '0'; setTimeout(()=>notif.remove(), 500); }, 3000);
    }

    renderProducts();
    renderCategories();
});
