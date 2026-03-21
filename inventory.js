document.addEventListener('DOMContentLoaded', () => {

    const tbody = document.querySelector('.inv-table tbody');
    if(!tbody) return;

    // --- State Management ---
    let erpItems = [];
    const storedItems = localStorage.getItem('erp_inventory_items');
    if (storedItems) {
        erpItems = JSON.parse(storedItems);
    } else {
        // Initial Dummy Data
        erpItems = [
            { sku: 'SKU-2001', name: 'أرز بسمتي هندي', category: 'المواد التموينية', unit: 'كيس 40كج', cost: 320, qty: 14, minQty: 15 },
            { sku: 'SKU-2002', name: 'لحم حري طازج', category: 'اللحوم', unit: 'ذبيحة', cost: 1200, qty: 35, minQty: 10 },
            { sku: 'SKU-2005', name: 'دجاج مبرد', category: 'الدواجن', unit: 'كرتون', cost: 145, qty: 80, minQty: 30 },
            { sku: 'SKU-2012', name: 'زيت قلي نباتي', category: 'الزيوت', unit: 'تنكة', cost: 160, qty: 0, minQty: 10 }
        ];
        localStorage.setItem('erp_inventory_items', JSON.stringify(erpItems));
    }

    let erpTx = [];
    const storedTx = localStorage.getItem('erp_inventory_tx');
    if (storedTx) {
        erpTx = JSON.parse(storedTx);
    } else {
        erpTx = [
            { id: 'TX01', type: 'in', total: 24500, date: Date.now() - 86400000 },
            { id: 'TX02', type: 'out', total: 18350, date: Date.now() - 400000 }
        ];
        localStorage.setItem('erp_inventory_tx', JSON.stringify(erpTx));
    }

    // --- Render Functions ---
    function renderKPIs() {
        const totalVal = erpItems.reduce((sum, it) => sum + (it.qty * it.cost), 0);
        const inVal = erpTx.filter(t => t.type === 'in').reduce((sum, t) => sum + t.total, 0);
        const outVal = erpTx.filter(t => t.type === 'out').reduce((sum, t) => sum + t.total, 0);
        const lowStockCount = erpItems.filter(it => it.qty <= it.minQty).length;

        const kpis = document.querySelectorAll('.kpi-value');
        if (kpis.length >= 4) {
            kpis[0].innerHTML = `${totalVal.toLocaleString()}<span class="currency">ر.س</span>`;
            kpis[1].innerHTML = `${inVal.toLocaleString()}<span class="currency">ر.س</span>`;
            kpis[2].innerHTML = `${outVal.toLocaleString()}<span class="currency">ر.س</span>`;
            kpis[3].innerHTML = `${lowStockCount} <span class="currency" style="font-size:14px">أصناف</span>`;
        }
    }

    function renderTable() {
        tbody.innerHTML = '';
        erpItems.forEach(item => {
            let rowClass = '';
            let statusTag = '';

            if (item.qty === 0) {
                rowClass = 'stock-row-danger';
                statusTag = '<span class="inv-tag tag-empty"><i class="ph-fill ph-x-circle"></i> رصيد صفري</span>';
            } else if (item.qty <= item.minQty) {
                rowClass = 'stock-row-warning';
                statusTag = '<span class="inv-tag tag-low"><i class="ph-fill ph-warning"></i> تحت الحد الأدنى</span>';
            } else {
                statusTag = '<span class="inv-tag tag-safe">رصيد كافي</span>';
            }

            const tr = document.createElement('tr');
            if (rowClass) tr.className = rowClass;

            tr.innerHTML = `
                <td><span class="badge-barcode">${item.sku}</span></td>
                <td><strong>${item.name}</strong></td>
                <td>${item.category}</td>
                <td>${item.unit}</td>
                <td>${item.cost.toFixed(2)} ر.س</td>
                <td class="qty-col ${item.qty === 0 ? 'empty' : (item.qty <= item.minQty ? 'low' : 'safe')}">${item.qty}</td>
                <td>${(item.qty * item.cost).toLocaleString()} ر.س</td>
                <td>${statusTag}</td>
                <td>
                    <div class="tbl-actions">
                        <button class="action-btn" title="تعديل"><i class="ph ph-pencil-simple"></i></button>
                        <button class="action-btn text-green btn-quick-in" data-sku="${item.sku}" title="إصدار استلام"><i class="ph ph-plus-circle"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Re-attach quick receive
        document.querySelectorAll('.btn-quick-in').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const sku = e.currentTarget.dataset.sku;
                document.getElementById('tx-sku').value = sku;
                document.getElementById('tx-type').value = 'in';
                openModal('txModal');
            });
        });
    }

    renderTable();
    renderKPIs();


    // --- Modals Logic ---
    const modals = document.querySelectorAll('.modal-overlay');
    function openModal(id) {
        document.getElementById(id).classList.add('active');
    }
    function closeModal(id) {
        document.getElementById(id).classList.remove('active');
    }

    // Attach open buttons
    const btnAddProduct = document.querySelector('.bg-blue'); // تعريف منتج جديد
    if(btnAddProduct) btnAddProduct.addEventListener('click', () => openModal('itemModal'));

    const btnReceive = document.querySelector('.bg-green'); // استلام
    if(btnReceive) btnReceive.addEventListener('click', () => {
        document.getElementById('tx-type').value = 'in';
        openModal('txModal');
    });

    const btnIssue = document.querySelector('.bg-red'); // صرف
    if(btnIssue) btnIssue.addEventListener('click', () => {
        document.getElementById('tx-type').value = 'out';
        openModal('txModal');
    });

    // Attach close buttons
    document.querySelectorAll('.btn-cancel-modal').forEach(b => b.addEventListener('click', (e) => {
        closeModal(e.currentTarget.closest('.modal-overlay').id);
    }));

    // Save Item
    const formItem = document.getElementById('form-item');
    if(formItem) {
        formItem.addEventListener('submit', (e) => {
            e.preventDefault();
            const newItem = {
                sku: 'SKU-' + Math.floor(1000 + Math.random() * 9000),
                name: document.getElementById('item-name').value,
                category: document.getElementById('item-cat').value,
                unit: document.getElementById('item-unit').value,
                cost: Number(document.getElementById('item-cost').value),
                qty: Number(document.getElementById('item-qty').value),
                minQty: Number(document.getElementById('item-min').value)
            };
            erpItems.push(newItem);
            localStorage.setItem('erp_inventory_items', JSON.stringify(erpItems));
            
            closeModal('itemModal');
            renderTable();
            renderKPIs();
            formItem.reset();
        });
    }

    // Save Transaction (In/Out)
    const formTx = document.getElementById('form-tx');
    if(formTx) {
        // Populate SKUs
        const skuSelect = document.getElementById('tx-sku');
        skuSelect.innerHTML = erpItems.map(it => `<option value="${it.sku}">${it.name} (${it.sku})</option>`).join('');

        formTx.addEventListener('submit', (e) => {
            e.preventDefault();
            const bSku = document.getElementById('tx-sku').value;
            const bType = document.getElementById('tx-type').value;
            const bQty = Number(document.getElementById('tx-qty').value);

            // Find Item
            const idx = erpItems.findIndex(it => it.sku === bSku);
            if(idx === -1) return;

            if(bType === 'in') {
                erpItems[idx].qty += bQty;
            } else {
                if(erpItems[idx].qty < bQty) {
                    alert('الكمية المتوفرة لا تكفي للصرف!');
                    return;
                }
                erpItems[idx].qty -= bQty;
            }

            // Record Tx
            const totalCost = bQty * erpItems[idx].cost;
            erpTx.push({
                id: 'TX-' + Math.floor(Math.random() * 10000),
                type: bType,
                total: totalCost,
                date: Date.now()
            });

            localStorage.setItem('erp_inventory_items', JSON.stringify(erpItems));
            localStorage.setItem('erp_inventory_tx', JSON.stringify(erpTx));

            closeModal('txModal');
            renderTable();
            renderKPIs();
            formTx.reset();
        });
    }

});
