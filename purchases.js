document.addEventListener('DOMContentLoaded', () => {

    // Databases
    let purchases = JSON.parse(localStorage.getItem('erp_purchases') || '[]');
    let suppliers = JSON.parse(localStorage.getItem('erp_suppliers') || '[]');
    let inventory = JSON.parse(localStorage.getItem('erp_inventory_items') || '[]');
    let inventoryTx = JSON.parse(localStorage.getItem('erp_inventory_tx') || '[]');

    // Fake initial data for purchases if empty
    if(purchases.length === 0) {
        purchases = [
            { id: 'PUR-1001', ref: 'INV-4022', supId: 'SUP-01', supName: 'شركة المراعي', date: '2023-10-01', total: 4500, payMethod: 'credit', status: 'مستلمة بالمخزن' },
            { id: 'PUR-1002', ref: 'INV-9111', supId: 'SUP-02', supName: 'مؤسسة الثقفي', date: '2023-10-02', total: 12400, payMethod: 'bank', status: 'مستلمة بالمخزن' }
        ];
        localStorage.setItem('erp_purchases', JSON.stringify(purchases));
    }

    // --- KPIs ---
    function renderKPIs() {
        document.getElementById('kpi-count').innerText = purchases.length + ' فاتورة';
        
        const paid = purchases.filter(p => ['cash', 'bank'].includes(p.payMethod)).reduce((s, p) => s + p.total, 0);
        document.getElementById('kpi-paid').innerText = paid.toLocaleString() + ' ر.س';

        const credit = purchases.filter(p => p.payMethod === 'credit').reduce((s, p) => s + p.total, 0);
        document.getElementById('kpi-credit').innerText = credit.toLocaleString() + ' ر.س';

        // Top Supplier
        const supCounts = {};
        purchases.forEach(p => supCounts[p.supName] = (supCounts[p.supName] || 0) + 1);
        let topSup = '-'; let max = 0;
        for(let s in supCounts) {
            if(supCounts[s] > max) { max = supCounts[s]; topSup = s; }
        }
        document.getElementById('kpi-top-sup').innerText = topSup;
    }

    // --- Table Render ---
    function renderTable() {
        const tbody = document.getElementById('pur-tbody');
        if(!tbody) return;
        
        tbody.innerHTML = '';
        const search = document.getElementById('search-inv')?.value.toLowerCase() || '';

        const filtered = purchases.filter(p => p.id.toLowerCase().includes(search) || p.supName.toLowerCase().includes(search) || p.ref.toLowerCase().includes(search));
        
        // Sort descending
        filtered.sort((a,b) => new Date(b.date) - new Date(a.date));

        if(filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#666">لا توجد فواتير.</td></tr>';
            return;
        }

        filtered.forEach(p => {
            let pLabel = p.payMethod === 'cash' ? 'كاش من الخزينة' : (p.payMethod === 'bank' ? 'حوالة بنكية' : 'دفع آجل (ذمم)');
            let pColor = p.payMethod === 'credit' ? 'color:var(--accent-red)' : 'color:var(--accent-green)';
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${p.id}</strong> <div style="font-size:11px; color:var(--text-muted)">مرجع: ${p.ref}</div></td>
                <td>${p.supName}</td>
                <td>${p.date}</td>
                <td style="font-weight:700;">${p.total.toLocaleString()} ر.س</td>
                <td style="${pColor}">${pLabel}</td>
                <td><span class="inv-tag tag-safe"><i class="ph-fill ph-check-circle"></i> مُورد للمستودع</span></td>
                <td>
                    <div class="tbl-actions">
                        <button title="طباعة وإيصال"><i class="ph ph-printer"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    document.getElementById('search-inv')?.addEventListener('input', renderTable);
    
    renderKPIs();
    renderTable();

    // --- Modal Logic ---
    const modal = document.getElementById('invoiceModal');
    const form = document.getElementById('form-invoice');
    const itemsContainer = document.getElementById('items-container');
    const tpl = document.getElementById('item-row-tpl');

    // Setup Modals
    document.getElementById('btn-new-invoice').addEventListener('click', () => {
        // Populate Suppliers
        const supSel = document.getElementById('inv-supplier');
        supSel.innerHTML = suppliers.filter(s=>s.active).map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        
        // Default Date
        document.getElementById('inv-date').valueAsDate = new Date();
        
        // Reset rows
        itemsContainer.innerHTML = '';
        addRow(); // Add first mandatory row
        
        calculateTotals();
        modal.classList.add('active');
    });

    document.querySelectorAll('.btn-close-modal').forEach(b => b.addEventListener('click', () => {
        modal.classList.remove('active');
        form.reset();
    }));

    // Row Logic
    function addRow() {
        const clone = tpl.content.cloneNode(true);
        const row = clone.querySelector('.item-row');
        
        // Fill SKUs mapping all available raw items
        const skuSel = row.querySelector('.item-sku');
        // Let's get unique items from inventory ignoring warehouse duplicates for simplicity, just name and category
        const uniqueSkus = [];
        const seenNames = new Set();
        inventory.forEach(i => {
            if(!seenNames.has(i.name)) {
                seenNames.add(i.name);
                uniqueSkus.push(i);
            }
        });

        // Add "New Item" logic ? For now just pick existing
        skuSel.innerHTML = uniqueSkus.map(i => `<option value="${i.sku}" data-name="${i.name}">${i.name} (${i.unit})</option>`).join('');
        // Also add an option to create new? The user should probably create items in inventory section first to keep logic clean.
        
        // Events
        row.querySelector('.btn-remove-row').addEventListener('click', () => {
            row.remove();
            calculateTotals();
        });
        
        row.querySelector('.item-qty').addEventListener('input', calculateTotals);
        row.querySelector('.item-price').addEventListener('input', calculateTotals);
        
        itemsContainer.appendChild(row);
    }

    document.getElementById('btn-add-row').addEventListener('click', addRow);

    function calculateTotals() {
        let sub = 0;
        document.querySelectorAll('.item-row').forEach(row => {
            const q = Number(row.querySelector('.item-qty').value) || 0;
            const p = Number(row.querySelector('.item-price').value) || 0;
            const t = q * p;
            row.querySelector('.item-row-total').value = t.toFixed(2);
            sub += t;
        });

        const tax = sub * 0.15; // Assuming 15% VAT on subtotal
        const grand = sub + tax;

        document.getElementById('subtotal').innerText = sub.toFixed(2);
        document.getElementById('tax').innerText = tax.toFixed(2);
        document.getElementById('grandtotal').innerText = grand.toFixed(2) + ' ر.س';
    }


    // --- Save Logic (The Core ERP Integration) ---
    form.addEventListener('submit', (e) => {
        e.preventDefault();

        // 1. Gather Items
        const purItems = [];
        const rows = document.querySelectorAll('.item-row');
        if(rows.length === 0) { alert('يجب إضافة صنف واحد على الأقل للفاتورة!'); return; }

        let isQtyMissing = false;
        rows.forEach(r => {
            const skuSelect = r.querySelector('.item-sku');
            const sku = skuSelect.value;
            const name = skuSelect.options[skuSelect.selectedIndex].dataset.name;
            const qty = Number(r.querySelector('.item-qty').value);
            const price = Number(r.querySelector('.item-price').value);
            if(qty<=0) isQtyMissing = true;

            purItems.push({ sku, name, qty, price });
        });

        if(isQtyMissing) { alert('يرجى التحقق من صحة الكميات!'); return; }

        // 2. Build Purchase Record
        const supId = document.getElementById('inv-supplier').value;
        const supObj = suppliers.find(s => s.id === supId);
        const pMethod = document.getElementById('inv-payment').value;
        const destWh = document.getElementById('inv-warehouse').value;
        const grandTotalStr = document.getElementById('grandtotal').innerText.replace(' ر.س', '');
        const grandTot = Number(grandTotalStr);

        const newPurchase = {
            id: 'PUR-' + Math.floor(Math.random() * 90000 + 10000), // Random 5-digit
            ref: document.getElementById('inv-ref').value,
            supId: supId,
            supName: supObj ? supObj.name : 'مورد غير معروف',
            date: document.getElementById('inv-date').value,
            total: grandTot,
            payMethod: pMethod,
            items: purItems,
            status: 'مستلمة بالمخزن'
        };

        // 3. Integrate with Database

        // A. Add to Suppliers Balance if Credit
        if(pMethod === 'credit' && supObj) {
            supObj.balance += grandTot; // Supplier owes us? No, we owe supplier. So supplier balance increases.
        }

        // B. Add to Inventory and Log Transactions
        purItems.forEach(buyItem => {
            // Find in destWh
            let invItem = inventory.find(i => i.name === buyItem.name && (i.warehouseId || 'main') === destWh);
            
            if(invItem) {
                invItem.qty += buyItem.qty;
                invItem.cost = buyItem.price; // Update cost to latest purchase price
            } else {
                // If the item doesn't exist in this specific warehouse, clone it from the list
                let sourceItem = inventory.find(i => i.name === buyItem.name);
                if(sourceItem) {
                    let clone = { ...sourceItem };
                    clone.warehouseId = destWh;
                    clone.qty = buyItem.qty;
                    clone.cost = buyItem.price;
                    inventory.push(clone);
                }
            }

            // Log the 'in' transaction
            inventoryTx.push({
                id: 'TX-' + Math.floor(Math.random() * 10000),
                type: 'in',
                total: buyItem.qty * buyItem.price,
                date: new Date(newPurchase.date).getTime(),
                fromWh: 'SUPPLIER',
                toWh: destWh,
                sku: buyItem.sku,
                refInvoice: newPurchase.id
            });
        });

        // 4. Save Everything
        purchases.push(newPurchase);
        localStorage.setItem('erp_purchases', JSON.stringify(purchases));
        localStorage.setItem('erp_suppliers', JSON.stringify(suppliers));
        localStorage.setItem('erp_inventory_items', JSON.stringify(inventory));
        localStorage.setItem('erp_inventory_tx', JSON.stringify(inventoryTx));

        // 5. Cleanup
        modal.classList.remove('active');
        renderKPIs();
        renderTable();
        alert('تم حفظ فاتورة المشتريات وإدخال البضاعة للمخزن وتحديث الأرصدة بنجاح!');
        form.reset();
    });

});
