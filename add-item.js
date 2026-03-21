document.addEventListener('DOMContentLoaded', () => {

    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');
    let editingProduct = null;
    let localItemImg = 'https://images.unsplash.com/photo-1544025162-8315ea07edca?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'; // default fallback

    if(editId) {
        const prodStr = localStorage.getItem('pos_products');
        if(prodStr) {
            const allProducts = JSON.parse(prodStr);
            editingProduct = allProducts.find(p => p.id === editId);
        }
        if(editingProduct) {
            localItemImg = editingProduct.image || localItemImg;
        }
    }

    // --- 1. Load Categories ---
    const catSelector = document.getElementById('dynamic-category-selector');
    let cats = [];
    const catsStr = localStorage.getItem('pos_categories');
    if(catsStr) cats = JSON.parse(catsStr);

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


    // --- 3. Handle Form Submission ---
    const form = document.querySelector('.add-item-form');
    if(!form) return;

    form.addEventListener('submit', (e) => {
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
        
        const newItem = {
            id: editingProduct ? editingProduct.id : ('ITM_' + Date.now()),
            categoryId: catId,
            nameAr: nameAr,
            nameEn: nameEn,
            desc: desc,
            price: price,
            cost: cost,
            isActive: isActive,
            image: localItemImg,
            createdAt: editingProduct ? editingProduct.createdAt : Date.now()
        };

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
