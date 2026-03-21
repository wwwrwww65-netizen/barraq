document.addEventListener('DOMContentLoaded', () => {

    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');
    let editingCategory = null;

    if(editId) {
        const catsStr = localStorage.getItem('pos_categories');
        if(catsStr) {
            const allCats = JSON.parse(catsStr);
            editingCategory = allCats.find(c => c.id === editId);
        }
    }

    if(editingCategory) {
        // Update Title & Button
        const titleEl = document.querySelector('h2');
        if(titleEl) titleEl.innerText = 'تعديل بيانات القسم';
        const saveBtn = document.querySelector('.cat-btn-save');
        if(saveBtn) saveBtn.innerHTML = '<i class="ph ph-check"></i> حفظ التعديلات';

        const inputs = document.querySelectorAll('.input-modern');
        if(inputs[0]) inputs[0].value = editingCategory.nameAr || '';
        if(inputs[1]) inputs[1].value = editingCategory.nameEn || '';
        
        const descArea = document.querySelector('textarea');
        if(descArea) descArea.value = editingCategory.desc || '';

        const numInp = document.querySelector('input[type="number"]');
        if(numInp) numInp.value = editingCategory.order || '';

        // Switches
        const switches = document.querySelectorAll('.switch input[type="checkbox"]');
        if(switches[0]) switches[0].checked = editingCategory.showPos !== false;
        if(switches[1]) switches[1].checked = editingCategory.showApp !== false;

        // Try to match icon
        if(editingCategory.icon) {
            const iconRadios = document.querySelectorAll('input[name="cat_icon"]');
            iconRadios.forEach(r => {
                const iTag = r.nextElementSibling.querySelector('i');
                if(iTag && iTag.className.includes(editingCategory.icon)) {
                    r.checked = true;
                }
            });
        }

        // Try to match color
        if(editingCategory.color) {
            const colorRadios = document.querySelectorAll('input[name="cat_color"]');
            colorRadios.forEach(r => {
                if(r.value === editingCategory.color) {
                    r.checked = true;
                }
            });
        }
    }

    const form = document.querySelector('.add-item-form');
    if(!form) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const inputs = document.querySelectorAll('.input-modern');
        const nameAr = inputs[0] ? inputs[0].value.trim() : '';
        const nameEn = inputs[1] ? inputs[1].value.trim() : '';
        const descArea = document.querySelector('textarea');
        const desc = descArea ? descArea.value.trim() : '';

        if(!nameAr) {
            alert('الرجاء إدخال اسم القسم بالعربي.');
            return;
        }

        // Selected Icon
        let selectedIcon = editingCategory ? editingCategory.icon : 'ph-bowl-food';
        const iconRadio = document.querySelector('input[name="cat_icon"]:checked');
        if(iconRadio) {
            const iTag = iconRadio.nextElementSibling.querySelector('i');
            if(iTag) {
                const cls = iTag.className.split(' ');
                selectedIcon = cls[cls.length-1];
            }
        }

        // Selected Color
        let selectedColor = editingCategory ? editingCategory.color : 'blue';
        const colorRadio = document.querySelector('input[name="cat_color"]:checked');
        if(colorRadio) selectedColor = colorRadio.value;

        // Switches
        const switches = document.querySelectorAll('.switch input[type="checkbox"]');
        const showPos = switches[0] ? switches[0].checked : true;
        const showApp = switches[1] ? switches[1].checked : true;

        // Order
        const numInp = document.querySelector('input[type="number"]');
        const orderNum = numInp ? Number(numInp.value) : 1;

        // Save Category
        const newCat = {
            id: editingCategory ? editingCategory.id : ('CAT_' + Date.now()),
            nameAr: nameAr,
            nameEn: nameEn,
            desc: desc,
            icon: selectedIcon,
            color: selectedColor,
            showPos: showPos,
            showApp: showApp,
            order: orderNum,
            createdAt: editingCategory ? editingCategory.createdAt : Date.now()
        };

        const catsStr = localStorage.getItem('pos_categories');
        let cats = catsStr ? JSON.parse(catsStr) : [];
        
        if (editingCategory) {
            const index = cats.findIndex(c => c.id === editId);
            if(index > -1) cats[index] = newCat;
        } else {
            cats.push(newCat);
        }
        
        localStorage.setItem('pos_categories', JSON.stringify(cats));

        // UI Feedback
        const btnSave = document.querySelector('.cat-btn-save');
        if (btnSave) {
            btnSave.innerHTML = '<i class="ph-bold ph-check"></i> تم الحفظ بنجاح';
            btnSave.style.background = 'var(--accent-green)';
            btnSave.style.color = 'white';
        }

        setTimeout(() => {
            window.location.href = 'menu.html';
        }, 1000);
    });

});
