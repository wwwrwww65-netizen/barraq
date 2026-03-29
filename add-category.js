document.addEventListener('DOMContentLoaded', async () => {
    const { ipcRenderer } = require('electron');

    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');
    let editingCategory = null;

    let selectedPrinters = [];
    let printerAliases = JSON.parse(localStorage.getItem('printer_aliases')) || {};

    let allCats = await ipcRenderer.invoke('db-get-categories') || [];
    if(allCats.length === 0) {
        const catsStr = localStorage.getItem('pos_categories');
        if(catsStr) allCats = JSON.parse(catsStr);
    }

    if(editId) {
        editingCategory = allCats.find(c => c.id === editId);
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

        if(editingCategory.printers) {
            selectedPrinters = editingCategory.printers;
        }
    }

    updateSelectedPrintersText();

    const form = document.querySelector('.add-item-form');
    if(!form) return;

    form.addEventListener('submit', async (e) => {
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
            printers: selectedPrinters,
            createdAt: editingCategory ? editingCategory.createdAt : Date.now()
        };

        try {
            await ipcRenderer.invoke('db-save-category', newCat);
        } catch(err) {
            console.error('Failed to save category via IPC:', err);
        }

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

    // Printer Modal Logic
    window.openPrinterSelection = async function() {
        const listContainer = document.getElementById('printers-list-container');
        document.getElementById('printersModal').style.display = 'flex';
        
        listContainer.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);"><i class="ph ph-spinner ph-spin" style="font-size:24px;"></i> فحص طابعات النظام...</div>';
        
        let allSystemPrinters = [];
        try {
            allSystemPrinters = await ipcRenderer.invoke('get-printers');
        } catch(e) { console.error(e); }
        
        listContainer.innerHTML = '';
        
        if(!allSystemPrinters || allSystemPrinters.length === 0) {
            listContainer.innerHTML = '<p style="text-align:center;color:var(--text-muted)">لا توجد طابعات مثبّتة في هذا الجهاز.</p>';
            return;
        }
        
        allSystemPrinters.forEach(p => {
            // Electron p.name
            const alias = printerAliases[p.name] || p.name;
            const isChecked = selectedPrinters.includes(p.name) ? 'checked' : '';
            const statusLabel = p.status === 0 ? 'متاحة' : 'غير جاهزة';
            const html = `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:rgba(255,255,255,0.02); border-bottom:1px solid var(--border-color); margin-bottom:5px; border-radius:8px;">
                    <label style="display:flex; align-items:center; gap:10px; cursor:pointer; flex:1;">
                        <input type="checkbox" class="printer-checkbox" value="${p.name}" ${isChecked} style="width:20px; height:20px;">
                        <div>
                            <div style="font-weight:700; color:var(--text-primary); font-size:15px;">${alias}</div>
                            <div style="font-size:11px; color:var(--text-muted)">[${p.name}] - ${statusLabel}</div>
                        </div>
                    </label>
                    <button type="button" onclick="renamePrinter('${p.name.replace(/'/g, "\\'")}')" style="background:none; border:1px solid var(--border-color); color:var(--text-secondary); padding:5px 10px; border-radius:6px; font-size:12px; cursor:pointer;">
                        <i class="ph ph-pencil-simple"></i> إعادة تسمية
                    </button>
                </div>
            `;
            listContainer.insertAdjacentHTML('beforeend', html);
        });
    };

    window.renamePrinter = function(printerName) {
        const defaultName = printerAliases[printerName] || printerName;
        const newName = prompt('أدخل الاسم الجديد المفهوم للطابعة (مثلاً: طابعة المطبخ، طابعة العصائر):', defaultName);
        if(newName !== null && newName.trim() !== '') {
            printerAliases[printerName] = newName.trim();
            localStorage.setItem('printer_aliases', JSON.stringify(printerAliases));
            openPrinterSelection(); // refresh list
            updateSelectedPrintersText(); // refresh label
        }
    };

    window.closePrinterSelection = function() {
        document.getElementById('printersModal').style.display = 'none';
    };

    window.savePrinterSelection = function() {
        selectedPrinters = [];
        const checkboxes = document.querySelectorAll('.printer-checkbox');
        checkboxes.forEach(cb => {
            if(cb.checked) selectedPrinters.push(cb.value);
        });
        updateSelectedPrintersText();
        closePrinterSelection();
    };

    function updateSelectedPrintersText() {
        const el = document.getElementById('selected-printers-names');
        if(!el) return;
        if(selectedPrinters.length === 0) {
            el.innerText = 'الطباعة متوقفة (لا يوجد طابعة محددة)';
            el.style.color = 'var(--text-muted)';
        } else {
            const names = selectedPrinters.map(p => printerAliases[p] || p).join('، ');
            el.innerText = 'تتم طباعة الفواتير في: ' + names;
            el.style.color = 'var(--accent-blue)';
        }
    }

});
