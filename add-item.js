document.addEventListener('DOMContentLoaded', () => {

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
            const lbl = document.createElement('label');
            lbl.className = 'cat-radio';
            lbl.innerHTML = `
                <input type="radio" name="item_categoryId" value="${c.id}" ${idx===0 ? 'checked' : ''}>
                <div class="cat-box">
                    <i class="ph ${c.icon}"></i>
                    <span>${c.nameAr}</span>
                </div>
            `;
            catSelector.appendChild(lbl);
        });
    }

    // --- 2. Handle Form Submission ---
    const form = document.querySelector('.add-item-form');
    if(!form) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        if(cats.length === 0) {
            alert('لا يمكنك حفظ الصنف بدون اختيار الفئة. يرجى إضافة فئة أولاً.');
            return;
        }

        // Gather basic texts
        const inputs = document.querySelectorAll('.input-modern:not([type="number"])');
        // Because of the modifier section which has inputs too, let's be careful.
        // Or simply query by explicit structure:
        const formTbody = document.querySelector('.form-column'); // Right side main
        const nameAr = formTbody.querySelectorAll('input[type="text"]')[0].value.trim();
        const nameEn = formTbody.querySelectorAll('input[type="text"]')[1].value.trim();
        const desc = document.querySelector('textarea') ? document.querySelector('textarea').value.trim() : '';

        if(!nameAr) return alert('الرجاء كتابة اسم الصنف.');

        // Category ID
        const selectedCatEl = document.querySelector('input[name="item_categoryId"]:checked');
        const catId = selectedCatEl ? selectedCatEl.value : null;

        if(!catId) return alert('خطأ في تحديد الفئة.');

        // Prices
        const numInputs = document.querySelectorAll('input[type="number"]');
        const price = Number(numInputs[0].value) || 0;
        const cost = Number(numInputs[1].value) || 0;

        if(price <= 0) return alert('الرجاء تحديد السعر.');

        // Toggles
        const toggles = document.querySelectorAll('.switch input[type="checkbox"]');
        const isActive = toggles[0] ? toggles[0].checked : true;
        
        // Image processing (in a real app we'd convert Blob to base64 or upload, here just placeholder or read dataURL)
        // For local demo, we'll assign a placeholder based on category icon if no image
        let itemImg = 'https://images.unsplash.com/photo-1544025162-8315ea07edca?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80'; // fallback
        
        // Save
        const newItem = {
            id: 'ITM_' + Date.now(),
            categoryId: catId,
            nameAr: nameAr,
            nameEn: nameEn,
            desc: desc,
            price: price,
            cost: cost,
            isActive: isActive,
            image: itemImg,
            createdAt: Date.now()
        };

        const prodStr = localStorage.getItem('pos_products');
        let products = prodStr ? JSON.parse(prodStr) : [];
        products.push(newItem);
        localStorage.setItem('pos_products', JSON.stringify(products));

        // Submit Button animation
        const btnSave = document.querySelector('.btn-save-publish');
        const origHtml = btnSave.innerHTML;
        btnSave.innerHTML = '<i class="ph-bold ph-check-circle"></i> تم ربط الصنف بالكاشير!';
        btnSave.style.background = 'var(--accent-green)';
        btnSave.style.borderColor = 'var(--accent-green)';
        
        setTimeout(() => {
            window.location.href = 'menu.html';
        }, 1000);

    });

});
