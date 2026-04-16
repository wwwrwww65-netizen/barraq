document.addEventListener('DOMContentLoaded', async () => {
    const { ipcRenderer } = require('electron');

    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');
    let editingProduct = null;
    let localItemImg = 'placeholder.svg'; // default fallback

    // Attempt to load from JSON DB first via IPC, then localStorage fallback
    let allProducts = await ipcRenderer.invoke('db-get-products') || [];
    if(allProducts.length === 0) {
        const prodStr = localStorage.getItem('pos_products');
        if(prodStr) allProducts = JSON.parse(prodStr);
    }
    
    if(editId) {
        editingProduct = allProducts.find(p => p.id === editId);
        if(editingProduct) localItemImg = editingProduct.image || localItemImg;
    }

    // --- 1. Load Categories ---
    const catSelector = document.getElementById('dynamic-category-selector');
    let cats = await ipcRenderer.invoke('db-get-categories') || [];
    if(cats.length === 0) {
        const catsStr = localStorage.getItem('pos_categories');
        if(catsStr) cats = JSON.parse(catsStr);
    }

    if(!catSelector) return;

    if(cats.length === 0) {
        catSelector.innerHTML = `
            <div style="background:rgba(239, 68, 68, 0.1); padding:10px; border-radius:8px; border:1px solid rgba(239, 68, 68, 0.2); color:var(--accent-red); font-size:12px;">
                <i class="ph-fill ph-warning-circle"></i> لا يوجد أي أقسام مسجلة! يرجى إضافة قسم مسبقاً قبل إضافة الصنف.
                <br><br>
                <a href="add-category.html" class="btn-save-role" style="text-decoration:none; display:inline-block; font-size:11px; padding:6px 10px;">إضافة قسم جديد الآن</a>
            </div>
        `;
    } else {
        catSelector.innerHTML = '';
        cats.forEach((c, idx) => {
            const isChecked = editingProduct ? (editingProduct.categoryId === c.id) : (idx === 0);
            const lbl = document.createElement('label');
            lbl.className = 'cat-radio';
            lbl.innerHTML = `
                <input type="radio" name="item_categoryId" value="${c.id}" ${isChecked ? 'checked' : ''}>
                <div class="cat-box">
                    <i class="ph ${c.icon}"></i>
                    <span>${c.nameAr}</span>
                </div>
            `;
            catSelector.appendChild(lbl);
        });
    }

    // --- 2. Handle Image Upload & Pre-fill ---
    const fileInput = document.querySelector('input[type="file"]');
    const uploadPlaceholder = document.querySelector('.upload-placeholder');
    
    // Fill data if editing
    if (editingProduct) {
        document.querySelector('h2').innerText = 'تعديل الصنف';
        document.querySelector('.btn-save-publish').innerHTML = '<i class="ph ph-check-circle"></i> حفظ التعديلات';
        
        const formTbody = document.querySelector('.form-column');
        formTbody.querySelectorAll('input[type="text"]')[0].value = editingProduct.nameAr || '';
        formTbody.querySelectorAll('input[type="text"]')[1].value = editingProduct.nameEn || '';
        const descArea = document.querySelector('textarea');
        if(descArea) descArea.value = editingProduct.desc || '';

        const numInputs = document.querySelectorAll('input[type="number"]');
        numInputs[0].value = editingProduct.price || 0;
        numInputs[1].value = editingProduct.cost || 0;

        const toggles = document.querySelectorAll('.switch input[type="checkbox"]');
        if(toggles[0]) toggles[0].checked = editingProduct.isActive !== false;
        
        const trackToggle = document.getElementById('track-inventory-toggle');
        if(trackToggle) {
            trackToggle.checked = editingProduct.trackInventory !== false; // Default true if undefined
        }

        if(editingProduct.image && uploadPlaceholder) {
            uploadPlaceholder.innerHTML = `<img src="${localItemImg}" style="width:100%; height:150px; object-fit:cover; border-radius:8px;">`;
        }
    }

    if(fileInput && uploadPlaceholder) {
        uploadPlaceholder.parentElement.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if(file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const MAX_WIDTH = 400; 
                        const scaleSize = MAX_WIDTH / img.width;
                        canvas.width = MAX_WIDTH;
                        canvas.height = img.height * scaleSize;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        
                        localItemImg = canvas.toDataURL('image/jpeg', 0.6); 
                        uploadPlaceholder.innerHTML = `<img src="${localItemImg}" style="width:100%; height:150px; object-fit:cover; border-radius:8px;">`;
                    };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    }


    // --- Recipe / Raw Materials Logic ---
    let inventoryItems = [];
    try {
        inventoryItems = await ipcRenderer.invoke('db-get-inventory') || [];
    } catch(e){}

    const recipeList = document.getElementById('recipe-list');
    const btnAddRecipe = document.getElementById('btn-add-recipe-ingredient');
    const recipeDropdown = document.getElementById('recipe-dropdown');
    const recipeSearch = document.getElementById('recipe-search-input');
    const recipeInvList = document.getElementById('recipe-inv-list');

    function renderRecipeItem(name, qtyPerUnit) {
        const div = document.createElement('div');
        div.className = 'modifier-item';
        div.innerHTML = `
            <input type="text" class="input-modern mod-name recipe-raw-name" value="${name}" readonly style="flex:2;">
            <input type="number" class="recipe-qty-input" value="${qtyPerUnit}" step="0.0001" min="0" required placeholder="الكمية">
            <span style="color:var(--text-muted); font-size:12px; margin:0 10px;">وحدة استهلاك</span>
            <button type="button" class="btn-icon remove" title="إزالة"><i class="ph ph-trash"></i></button>
        `;
        div.querySelector('.remove').addEventListener('click', () => div.remove());
        recipeList.appendChild(div);
    }

    if (editingProduct && editingProduct.rawMaterials && Array.isArray(editingProduct.rawMaterials)) {
        editingProduct.rawMaterials.forEach(rm => renderRecipeItem(rm.name, rm.qtyPerUnit));
    }

    // --- Dynamic Modifiers (الاضافات) ---
    const modifiersList = document.getElementById('modifiers-list');
    const btnAddModifier = document.getElementById('btn-add-modifier');

    function renderModifierRow(name = '', price = 0) {
        const div = document.createElement('div');
        div.className = 'modifier-item';
        div.innerHTML = `
            <input type="text" class="input-modern custom-mod-name" value="${name}" placeholder="اسم الإضافة (مثال: شريحة جبن)" style="flex:2;">
            <input type="number" class="input-modern custom-mod-price" value="${price}" step="0.01" min="0" placeholder="السعر" style="flex:1;">
            <span style="color:var(--text-muted); font-size:12px; margin:0 10px;">ر.س</span>
            <button type="button" class="btn-icon remove" title="إزالة"><i class="ph ph-trash"></i></button>
        `;
        div.querySelector('.remove').addEventListener('click', () => div.remove());
        modifiersList.appendChild(div);
    }

    if (btnAddModifier) {
        btnAddModifier.addEventListener('click', () => renderModifierRow('', 0));
    }

    if (editingProduct && editingProduct.modifiers && Array.isArray(editingProduct.modifiers)) {
        editingProduct.modifiers.forEach(mod => renderModifierRow(mod.name, mod.price));
    }

    function filterRecipeInv() {
        if(!recipeInvList) return;
        recipeInvList.innerHTML = '';
        const query = (recipeSearch.value || '').toLowerCase();
        const filtered = inventoryItems.filter(i => i.name.toLowerCase().includes(query));
        
        if (filtered.length === 0) {
            recipeInvList.innerHTML = '<li style="padding:10px;text-align:center;color:var(--text-muted);font-size:12px;">لا يوجد صنف مطابق بالمخزن</li>';
            return;
        }

        filtered.forEach(item => {
            const whMap = {
                'main': 'المستودع الرئيسي',
                'restaurant': 'مخزن المطعم',
                'beverages': 'مخزن المشروبات'
            };
            const whBadge = whMap[item.warehouseId] || 'المستودع الرئيسي';
            
            const li = document.createElement('li');
            li.className = 'recipe-item-li';
            li.innerHTML = `
                <span class="inv-name">${item.name}</span>
                <span class="inv-badge">${whBadge} | ${item.unit || 'وحدة'}</span>
            `;
            li.addEventListener('click', () => {
                // Check duplicate
                const existing = Array.from(recipeList.querySelectorAll('.recipe-raw-name')).find(inp => inp.value === item.name);
                if (existing) {
                    alert('هذا المكون مضاف مسبقاً للوصفة!');
                } else {
                    renderRecipeItem(item.name, 1);
                }
                recipeDropdown.classList.remove('active');
                recipeSearch.value = '';
            });
            recipeInvList.appendChild(li);
        });
    }

    if(btnAddRecipe && recipeDropdown) {
        btnAddRecipe.addEventListener('click', (e) => {
            e.stopPropagation();
            recipeDropdown.classList.toggle('active');
            if (recipeDropdown.classList.contains('active')) {
                filterRecipeInv();
                recipeSearch.focus();
                // Scroll down slightly so the dropdown is nicely visible
                setTimeout(() => {
                    recipeDropdown.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 50);
            }
        });
        recipeSearch.addEventListener('input', filterRecipeInv);
        document.addEventListener('click', (e) => {
            if (!recipeDropdown.contains(e.target) && e.target !== btnAddRecipe) {
                recipeDropdown.classList.remove('active');
            }
        });
        recipeDropdown.addEventListener('click', (e) => e.stopPropagation());
    }

    // --- 3. Handle Form Submission ---
    const form = document.querySelector('.add-item-form');
    if(!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if(cats.length === 0) {
            alert('لا يمكنك حفظ الصنف بدون اختيار الفئة. يرجى إضافة فئة أولاً.');
            return;
        }

        const formTbody = document.querySelector('.form-column'); 
        const nameAr = formTbody.querySelectorAll('input[type="text"]')[0].value.trim();
        const nameEn = formTbody.querySelectorAll('input[type="text"]')[1].value.trim();
        const desc = document.querySelector('textarea') ? document.querySelector('textarea').value.trim() : '';

        if(!nameAr) return alert('الرجاء كتابة اسم الصنف.');

        const selectedCatEl = document.querySelector('input[name="item_categoryId"]:checked');
        const catId = selectedCatEl ? selectedCatEl.value : null;

        if(!catId) return alert('خطأ في تحديد الفئة.');

        const numInputs = document.querySelectorAll('input[type="number"]');
        const price = Number(numInputs[0].value) || 0;
        const cost = Number(numInputs[1].value) || 0;

        if(price <= 0) return alert('الرجاء تحديد السعر.');

        const toggles = document.querySelectorAll('.switch input[type="checkbox"]');
        const isActive = toggles[0] ? toggles[0].checked : true;
        
        const rawMaterials = [];
        if (recipeList) {
            recipeList.querySelectorAll('.modifier-item').forEach(row => {
                const name = row.querySelector('.recipe-raw-name').value;
                const qtyPerUnit = parseFloat(row.querySelector('.recipe-qty-input').value) || 0;
                if (name && qtyPerUnit > 0) {
                    rawMaterials.push({ name, qtyPerUnit });
                }
            });
        }

        const modifiers = [];
        if (modifiersList) {
            modifiersList.querySelectorAll('.modifier-item').forEach(row => {
                const name = row.querySelector('.custom-mod-name').value.trim();
                const price = parseFloat(row.querySelector('.custom-mod-price').value) || 0;
                if (name) {
                    modifiers.push({ name, price });
                }
            });
        }

        const trackToggle = document.getElementById('track-inventory-toggle');
        const trackInventory = trackToggle ? trackToggle.checked : true;

        const newItem = {
            id: editingProduct ? editingProduct.id : ('ITM_' + Date.now()),
            categoryId: catId,
            nameAr: nameAr,
            nameEn: nameEn,
            desc: desc,
            price: price,
            cost: cost,
            isActive: isActive,
            trackInventory: trackInventory,
            image: localItemImg,
            rawMaterials: rawMaterials,
            modifiers: modifiers,
            createdAt: editingProduct ? editingProduct.createdAt : Date.now()
        };

        // Call IPC to save into pos_database.json AND trigger network db_changed
        try {
            await ipcRenderer.invoke('db-save-product', newItem);
        } catch(err) {
            console.error('Failed to save product to DB via IPC:', err);
        }

        // Keep localStorage as fallback
        const prodStr = localStorage.getItem('pos_products');
        let products = prodStr ? JSON.parse(prodStr) : [];
        if (editingProduct) {
            const index = products.findIndex(p => p.id === editId);
            if(index > -1) products[index] = newItem;
        } else {
            products.push(newItem);
        }
        localStorage.setItem('pos_products', JSON.stringify(products));

        const btnSave = document.querySelector('.btn-save-publish');
        btnSave.innerHTML = '<i class="ph-bold ph-check-circle"></i> تم ربط الصنف بالكاشير!';
        btnSave.style.background = 'var(--accent-green)';
        btnSave.style.borderColor = 'var(--accent-green)';
        
        setTimeout(() => {
            window.location.href = 'menu.html';
        }, 1000);

    });

});
