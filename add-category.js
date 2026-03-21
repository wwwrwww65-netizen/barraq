document.addEventListener('DOMContentLoaded', () => {

    const form = document.querySelector('.add-item-form');
    if(!form) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const inputs = document.querySelectorAll('.input-modern');
        const nameAr = inputs[0].value.trim();
        const nameEn = inputs[1] ? inputs[1].value.trim() : '';
        const desc = document.querySelector('textarea').value.trim();

        if(!nameAr) {
            alert('الرجاء إدخال اسم القسم بالعربي.');
            return;
        }

        // Selected Icon
        let selectedIcon = 'ph-bowl-food'; // fallback
        const iconRadio = document.querySelector('input[name="cat_icon"]:checked');
        if(iconRadio) {
            const iTag = iconRadio.nextElementSibling.querySelector('i');
            if(iTag) {
                // Extract last class 
                const cls = iTag.className.split(' ');
                selectedIcon = cls[cls.length-1];
            }
        }

        // Selected Color
        let selectedColor = 'blue';
        const colorRadio = document.querySelector('input[name="cat_color"]:checked');
        if(colorRadio) selectedColor = colorRadio.value;

        // Switches
        const switches = document.querySelectorAll('.switch input[type="checkbox"]');
        const showPos = switches[0] ? switches[0].checked : true;
        const showApp = switches[1] ? switches[1].checked : true;

        // Order
        const orderInp = document.querySelectorAll('.input-modern')[2]; // Wait, let's just find input[type=number]
        const numInp = document.querySelector('input[type="number"]');
        const orderNum = numInp ? Number(numInp.value) : 1;

        // Save Category
        const newCat = {
            id: 'CAT_' + Date.now(),
            nameAr: nameAr,
            nameEn: nameEn,
            desc: desc,
            icon: selectedIcon,
            color: selectedColor,
            showPos: showPos,
            showApp: showApp,
            order: orderNum,
            createdAt: Date.now()
        };

        const catsStr = localStorage.getItem('pos_categories');
        let cats = catsStr ? JSON.parse(catsStr) : [];
        cats.push(newCat);
        localStorage.setItem('pos_categories', JSON.stringify(cats));

        // UI Feedback
        const btnSave = document.querySelector('.cat-btn-save');
        const origText = btnSave.innerHTML;
        btnSave.innerHTML = '<i class="ph-bold ph-check"></i> تم الحفظ بنجاح';
        btnSave.style.background = 'var(--accent-green)';
        btnSave.style.color = 'white';

        setTimeout(() => {
            window.location.href = 'menu.html';
        }, 1000);
    });

});
