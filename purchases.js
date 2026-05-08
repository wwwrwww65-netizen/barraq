const { ipcRenderer } = require('electron');

async function saveDB(db) {
    await window.dbWrite(db);
    try { ipcRenderer.send('notify-db-changed'); } catch(e) {}
}

document.addEventListener('DOMContentLoaded', async () => {

    const xf = (n) => (window.MisterCasherCurrency ? MisterCasherCurrency.format(n) : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ر.س');

    let db = await window.dbRead();
    if(!db.purchases) db.purchases = [];
    if(!db.suppliers) db.suppliers = [];
    if(!db.inventory) db.inventory = [];
    if(!db.inventoryTx) db.inventoryTx = [];

    let purchases = db.purchases;
    let suppliers = db.suppliers;
    let inventory = db.inventory;
    let inventoryTx = db.inventoryTx;

    function isThisMonth(dateStr) {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;
        const now = new Date();
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }

    // --- KPIs ---
    function renderKPIs() {
        const thisMonth = purchases.filter(p => isThisMonth(p.date));
        document.getElementById('kpi-count').innerText = thisMonth.length + ' فاتورة';

        const paid = purchases.filter(p => ['cash', 'bank'].includes(p.payMethod)).reduce((s, p) => s + p.total, 0);
        document.getElementById('kpi-paid').innerText = xf(paid);

        const credit = purchases.filter(p => p.payMethod === 'credit').reduce((s, p) => s + p.total, 0);
        document.getElementById('kpi-credit').innerText = xf(credit);

        // Top Supplier
        const supCounts = {};
        purchases.forEach(p => supCounts[p.supName] = (supCounts[p.supName] || 0) + 1);
        let topSup = '-'; let max = 0;
        for(let s in supCounts) {
            if(supCounts[s] > max) { max = supCounts[s]; topSup = s; }
        }
        document.getElementById('kpi-top-sup').innerText = topSup;
    }

    // ── Pagination State ───────────────────────────────
    const PUR_PAGE_SIZE = 25;
    let purCurrentPage = 1;

    // --- Table Render with Pagination ---
    function renderTable() {
        const tbody = document.getElementById('pur-tbody');
        if (!tbody) return;

        tbody.innerHTML = '';
        const search = document.getElementById('search-inv')?.value.toLowerCase() || '';

        let filtered = purchases.filter(p =>
            String(p.id      || '').toLowerCase().includes(search) ||
            String(p.supName || '').toLowerCase().includes(search) ||
            String(p.ref     || '').toLowerCase().includes(search)
        );
        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

        const total      = filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / PUR_PAGE_SIZE));
        if (purCurrentPage > totalPages) purCurrentPage = totalPages;

        const start     = (purCurrentPage - 1) * PUR_PAGE_SIZE;
        const pageItems = filtered.slice(start, start + PUR_PAGE_SIZE);

        if (total === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#666">لا توجد فواتير.</td></tr>';
            _renderPurPagination(0, 0, 0, tbody);
            return;
        }

        const fragment = document.createDocumentFragment();
        pageItems.forEach(p => {
            let pLabel = p.payMethod === 'cash' ? 'كاش من الخزينة' : (p.payMethod === 'bank' ? 'حوالة بنكية' : 'دفع آجل (ذمم)');
            let pColor = p.payMethod === 'credit' ? 'color:var(--accent-red)' : 'color:var(--accent-green)';

            const isReceived  = p.status === 'مستلمة بالمخزن';
            const isPendingWh = p.status === 'قيد الاستلام';
            const isCancelled = p.status === 'ملغاة';

            let statusTag;
            if (isReceived)       statusTag = `<span class="inv-tag tag-safe"><i class="ph-fill ph-check-circle"></i> مُستلمة بالمخزن</span>`;
            else if (isCancelled) statusTag = `<span class="inv-tag" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid #ef4444;"><i class="ph-fill ph-x-circle"></i> ملغاة</span>`;
            else if (isPendingWh) statusTag = `<span class="inv-tag tag-low" style="background:rgba(234,179,8,0.15); color:#d97706; border-color:#fbbf24;"><i class="ph ph-hourglass"></i> بانتظار تأكيد المخزن</span>`;
            else                  statusTag = `<span class="inv-tag tag-low"><i class="ph ph-clock"></i> بانتظار التوريد</span>`;

            const tr = document.createElement('tr');
            if (isCancelled) tr.style.opacity = '0.5';
            tr.innerHTML = `
                <td>
                    <div class="inv-id-cell">
                        <strong>${p.id}</strong>
                        <span class="inv-ref-label">مرجع: ${p.ref}</span>
                    </div>
                </td>
                <td style="font-weight:600;">${p.supName}</td>
                <td style="color:var(--text-secondary);">${p.date}</td>
                <td style="font-weight:800; font-size:16px;">${xf(p.total)}</td>
                <td style="${pColor}; font-weight:700;">${pLabel}</td>
                <td>${statusTag}</td>
                <td>
                    <div class="pur-btn-group">
                        ${!isReceived && !isCancelled && !isPendingWh ? `<button class="pur-btn pur-btn-receive btn-receive-pur" data-id="${p.id}" title="إبلاغ المخازن بالوصول"><i class="ph ph-truck"></i> استلام</button>` : ''}
                        ${!isReceived && !isCancelled ? `<button class="pur-btn pur-btn-edit btn-edit-pur" data-id="${p.id}" title="تعديل"><i class="ph ph-pencil"></i></button>` : ''}
                        ${!isReceived && !isCancelled ? `<button class="pur-btn pur-btn-delete btn-delete-pur" data-id="${p.id}" title="حذف"><i class="ph ph-trash"></i></button>` : ''}
                        ${isReceived  ? `<button class="pur-btn pur-btn-cancel btn-cancel-pur" data-id="${p.id}" title="إلغاء"><i class="ph ph-arrow-u-up-left"></i> إلغاء</button>` : ''}
                        <button class="pur-btn pur-btn-print print-pur" data-id="${p.id}" title="طباعة"><i class="ph ph-printer"></i></button>
                    </div>
                </td>
            `;
            fragment.appendChild(tr);
        });
        tbody.appendChild(fragment);
        
        const tfoot = document.getElementById('pur-tfoot');
        if (tfoot) {
            const sumTotal = filtered.reduce((s, p) => s + (p.total || 0), 0);
            tfoot.innerHTML = `
                <tr style="background:#f8fafc; border-top:2px solid #94a3b8; font-weight:bold;">
                    <td colspan="3" style="text-align:left; padding:12px;">الإجمالي الكلي للفواتير المحددة بالبحث:</td>
                    <td colspan="4" style="font-size:16px; color:#10b981; padding:12px;">${xf(sumTotal)}</td>
                </tr>
            `;
        }

        _renderPurPagination(purCurrentPage, totalPages, total, tbody);

        // ربط الأحداث
        tbody.querySelectorAll('.print-pur').forEach(btn => {
            btn.addEventListener('click', e => {
                const activePur = purchases.find(x => x.id === e.currentTarget.dataset.id);
                if (activePur) printPurchaseInvoice(activePur);
            });
        });
        tbody.querySelectorAll('.btn-receive-pur').forEach(btn => {
            btn.addEventListener('click', async e => {
                const pur = purchases.find(x => x.id === e.currentTarget.dataset.id);
                if (!pur) return;
                if (!confirm(`هل تريد إبلاغ المستودع بوصول الفاتورة ${pur.id} لبدء إجراءات الفحص والاستلام؟`)) return;
                await notifyWarehouseOfArrival(pur);
            });
        });
        tbody.querySelectorAll('.btn-edit-pur').forEach(btn => {
            btn.addEventListener('click', e => {
                const pur = purchases.find(x => x.id === e.currentTarget.dataset.id);
                if (pur) openEditModal(pur);
            });
        });
        tbody.querySelectorAll('.btn-delete-pur').forEach(btn => {
            btn.addEventListener('click', async e => {
                const pur = purchases.find(x => x.id === e.currentTarget.dataset.id);
                if (pur) await deletePurchase(pur);
            });
        });
        tbody.querySelectorAll('.btn-cancel-pur').forEach(btn => {
            btn.addEventListener('click', async e => {
                const pur = purchases.find(x => x.id === e.currentTarget.dataset.id);
                if (pur) await cancelReceivedPurchase(pur);
            });
        });
    }

    function _renderPurPagination(page, totalPages, total, tbody) {
        let bar = document.getElementById('pur-pagination-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'pur-pagination-bar';
            bar.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;padding:16px 0;flex-wrap:wrap;';
            tbody.closest('table')?.parentElement?.appendChild(bar);
        }
        if (totalPages <= 1) { bar.innerHTML = ''; return; }

        const start = (page - 1) * PUR_PAGE_SIZE + 1;
        const end   = Math.min(page * PUR_PAGE_SIZE, total);
        const bs = (active) => `
            background: ${active ? 'linear-gradient(135deg, var(--pur-accent-blue), #1e40af)' : 'rgba(255,255,255,0.05)'};
            color: ${active ? '#fff' : 'var(--text-secondary)'};
            border: 1px solid ${active ? 'transparent' : 'rgba(255,255,255,0.1)'};
            border-radius: 12px;
            padding: 8px 16px;
            cursor: pointer;
            font-family: inherit;
            font-weight: 700;
            font-size: 14px;
            transition: all 0.2s ease;
            box-shadow: ${active ? '0 4px 10px rgba(59, 130, 246, 0.3)' : 'none'};
        `;

        let html = `<span style="color:var(--text-muted);font-size:13px">صفحة ${page}/${totalPages} (فاتورة ${start}–${end} من ${total})</span>`;
        html += `<button style="${bs(false)}" id="pp-first" ${page===1?'disabled':''}>«</button>`;
        html += `<button style="${bs(false)}" id="pp-prev"  ${page===1?'disabled':''}>‹</button>`;
        for (let i = Math.max(1, page-2); i <= Math.min(totalPages, page+2); i++)
            html += `<button style="${bs(i===page)}" class="pp-num" data-p="${i}">${i}</button>`;
        html += `<button style="${bs(false)}" id="pp-next" ${page===totalPages?'disabled':''}>›</button>`;
        html += `<button style="${bs(false)}" id="pp-last" ${page===totalPages?'disabled':''}>»</button>`;

        bar.innerHTML = html;
        bar.querySelector('#pp-first')?.addEventListener('click', () => { purCurrentPage = 1; renderTable(); });
        bar.querySelector('#pp-prev' )?.addEventListener('click', () => { purCurrentPage--; renderTable(); });
        bar.querySelector('#pp-next' )?.addEventListener('click', () => { purCurrentPage++; renderTable(); });
        bar.querySelector('#pp-last' )?.addEventListener('click', () => { purCurrentPage = totalPages; renderTable(); });
        bar.querySelectorAll('.pp-num').forEach(b =>
            b.addEventListener('click', () => { purCurrentPage = Number(b.dataset.p); renderTable(); })
        );
    }

    // Debounce على البحث
    let _purSearchTimer;
    document.getElementById('search-inv')?.addEventListener('input', () => {
        clearTimeout(_purSearchTimer);
        _purSearchTimer = setTimeout(() => { purCurrentPage = 1; renderTable(); }, 300);
    });

    renderKPIs();
    renderTable();

    if (typeof window.registerPosDatabaseRefresh === 'function') {
        window.registerPosDatabaseRefresh(async () => {
            db = await window.dbRead();
            purchases = db.purchases || [];
            suppliers = db.suppliers || [];
            inventory = db.inventory || [];
            inventoryTx = db.inventoryTx || [];
            renderKPIs();
            renderTable();
            console.log('[Sync] 🔄 Purchases reloaded from network update.');
        });
    }

    // --- Modal Logic ---
    const modal = document.getElementById('invoiceModal');
    const form = document.getElementById('form-invoice');
    const itemsContainer = document.getElementById('items-container');
    const tpl = document.getElementById('item-row-tpl');

    // Caching SKU options for performance
    let cachedSkuOptionsHtml = '';
    function updateSkuCache() {
        const uniqueSkus = [];
        const seenNames = new Set();
        inventory.forEach(i => {
            if(!seenNames.has(i.name)) {
                seenNames.add(i.name);
                uniqueSkus.push(i);
            }
        });
        if (!uniqueSkus.length) {
            cachedSkuOptionsHtml = '<option value="">— لا توجد أصناف في المخزون —</option>';
        } else {
            cachedSkuOptionsHtml = uniqueSkus.map(i => `<option value="${i.sku}" data-name="${i.name}">${i.name} (${i.unit})</option>`).join('');
        }
    }

    // Setup Modals
    document.getElementById('btn-new-invoice').addEventListener('click', () => {
        const supSel = document.getElementById('inv-supplier');
        supSel.innerHTML = suppliers.filter(s => s.active).map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        if (!supSel.options.length) {
            alert('لا يوجد مورد نشط. أضف مورداً من صفحة «دليل الموردين» أو فعّل مورداً موقوفاً.');
            return;
        }

        document.getElementById('inv-date').valueAsDate = new Date();
        updateSkuCache(); // Refresh cache when opening modal

        itemsContainer.innerHTML = '';
        addRow();

        // Apply VAT preference
        const vatCheckbox = document.getElementById('inv-apply-vat');
        if (vatCheckbox) {
            const savedVatPref = localStorage.getItem('pur_apply_tax_default');
            if (savedVatPref !== null) {
                vatCheckbox.checked = savedVatPref === 'true';
            }
        }

        calculateTotals();
        modal.classList.add('active');
    });

    document.querySelectorAll('.btn-close-modal').forEach(b => b.addEventListener('click', () => {
        modal.classList.remove('active');
        form.reset();
    }));

    // --- VAT Persistence Logic ---
    const vatCheckbox = document.getElementById('inv-apply-vat');
    if (vatCheckbox) {
        // Load preference
        const savedVatPref = localStorage.getItem('pur_apply_tax_default');
        if (savedVatPref !== null) {
            vatCheckbox.checked = savedVatPref === 'true';
        }

        // Save preference and recalculate
        vatCheckbox.addEventListener('change', () => {
            localStorage.setItem('pur_apply_tax_default', vatCheckbox.checked);
            calculateTotals();
        });
    }

    const editVatCheckbox = document.getElementById('edit-inv-apply-vat');
    if (editVatCheckbox) {
        editVatCheckbox.addEventListener('change', () => {
            calculateEditTotals();
        });
    }

    // Row Logic
    function addRow() {
        const clone = tpl.content.cloneNode(true);
        const row = clone.querySelector('.item-row');
        
        const skuSel = row.querySelector('.item-sku');
        skuSel.innerHTML = cachedSkuOptionsHtml;
        
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

    // Helper: read tax rate from settings
    function getSystemTaxRate() {
        try {
            const s = JSON.parse(localStorage.getItem('restaurant_settings') || '{}');
            const rate = parseFloat(s.taxRate);
            return isNaN(rate) ? 15 : rate;
        } catch(e) { return 15; }
    }

    function calculateTotals() {
        let sub = 0;
        document.querySelectorAll('.item-row').forEach(row => {
            const q = Number(row.querySelector('.item-qty').value) || 0;
            const p = Number(row.querySelector('.item-price').value) || 0;
            const t = q * p;
            row.querySelector('.item-row-total').value = t.toFixed(2);
            sub += t;
        });

        const vatCheckbox = document.getElementById('inv-apply-vat');
        const applyTax = vatCheckbox ? vatCheckbox.checked : true;
        const taxPct = getSystemTaxRate(); 
        const tax = applyTax ? (sub * (taxPct / 100)) : 0;
        const grand = sub + tax;

        document.getElementById('subtotal').innerText = sub.toFixed(2);
        document.getElementById('tax').innerText = tax.toFixed(2);
        document.getElementById('grandtotal').innerText = xf(grand);

        // Show/Hide tax line
        const taxLine = document.getElementById('tax-line');
        if (taxLine) taxLine.style.display = applyTax ? 'flex' : 'none';

        // Update label text to show current rate
        const purTaxLabel = document.getElementById('pur-tax-label');
        if (purTaxLabel) purTaxLabel.innerText = `ضريبة القيمة المضافة (${taxPct}%):`;
    }


    // --- Save Logic (The Core ERP Integration) ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // منع الإرسال المزدوج
        const submitBtn = e.target.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> جاري الحفظ...';
        }
        
        try {
            // 1. Gather Items
            const purItems = [];
            const rows = document.querySelectorAll('.item-row');
            if(rows.length === 0) { alert('يجب إضافة صنف واحد على الأقل للفاتورة!'); return; }

            let badLine = false;
            let isQtyMissing = false;
            rows.forEach(r => {
                const skuSelect = r.querySelector('.item-sku');
                const sku = skuSelect.value;
                const opt = skuSelect.options[skuSelect.selectedIndex];
                const name = opt && opt.dataset ? opt.dataset.name : '';
                if (!sku || !name) {
                    badLine = true;
                    return;
                }
                const qty = Number(r.querySelector('.item-qty').value);
                const price = Number(r.querySelector('.item-price').value);
                const yieldVal = Number(r.querySelector('.item-yield').value) || 0;
                if (qty <= 0) isQtyMissing = true;

                purItems.push({ sku, name, qty, price, yield: yieldVal });
            });

            if (badLine) {
                alert('يرجى اختيار صنف صالح في كل السطور. عرّف الأصناف أولاً من صفحة المخازن إن لم تكن موجودة.');
                return;
            }
            if (isQtyMissing) {
                alert('يرجى التحقق من صحة الكميات والأسعار!');
                return;
            }

            // 2. Build Purchase Record
            const supId = document.getElementById('inv-supplier').value;
            const supObj = suppliers.find(s => s.id === supId);
            const pMethod = document.getElementById('inv-payment').value;
            const destWh = document.getElementById('inv-warehouse').value;
            const grandTotalRaw = document.getElementById('grandtotal').innerText;
            const grandTot =
                window.MisterCasherCurrency && MisterCasherCurrency.parseLoose
                    ? MisterCasherCurrency.parseLoose(grandTotalRaw) || 0
                    : Number(String(grandTotalRaw).replace(/[^\d.]/g, '')) || 0;

            const newPurchase = {
                id: 'PUR-' + Math.floor(Math.random() * 90000 + 10000),
                ref: document.getElementById('inv-ref').value,
                supId: supId,
                supName: supObj ? supObj.name : 'مورد غير معروف',
                date: document.getElementById('inv-date').value,
                total: grandTot,
                payMethod: pMethod,
                items: purItems,
                status: 'بانتظار التوريد',
                destWh: document.getElementById('inv-warehouse').value
            };

            // 3. Integrate with Database
            if(pMethod === 'credit' && supObj) {
                supObj.balance = (supObj.balance || 0) + grandTot;
            }

            // 4. Save purchase to DB only
            purchases.push(newPurchase);
            db.purchases = purchases;
            db.suppliers = suppliers;
            db.inventory = inventory;
            db.inventoryTx = inventoryTx;
            await saveDB(db);

            // 5. Cleanup
            modal.classList.remove('active');
            form.reset();
            
            // تأجيل إعادة التحميل لمنع الشاشة السوداء
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    renderKPIs();
                    renderTable();
                    printPurchaseInvoice(newPurchase);
                    alert('✅ تم حفظ فاتورة المشتريات بنجاح.\n\nملاحظة: الفاتورة الآن في حالة "بانتظار التوريد". يرجى النقر على زر "استلام" عند وصول البضاعة لإرسال إشعار للمخازن.');
                });
            });
        } catch (error) {
            console.error('Error saving purchase:', error);
            alert('حدث خطأ أثناء حفظ الفاتورة');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="ph ph-check-circle"></i> حفظ الفاتورة';
            }
        }
    });

    // --- Notify Warehouse: Change status only, warehouse confirms later ---
    async function notifyWarehouseOfArrival(pur) {
        // Mark the purchase as pending warehouse confirmation
        pur.status = 'قيد الاستلام';

        db.purchases = purchases;
        await saveDB(db);

        renderKPIs();
        renderTable();

        alert(`✅ تم إرسال إشعار للمستودع (${pur.destWh}) بخصوص الفاتورة ${pur.id}.\n\nالآن يجب على أمين المستودع تأكيد الاستلام الفعلي من صفحة المخازن لتحديث الكميات.`);
    }

    // ═══════════════════════════════════════════════════
    // ❌ DELETE PURCHASE (قيد الاستلام فقط)
    // ═══════════════════════════════════════════════════
    async function deletePurchase(pur) {
        const confirmed = confirm(
            `⚠️ تأكيد الحذف\n\nهل أنت متأكد من حذف الفاتورة؟\n\nرقم الفاتورة: ${pur.id}\nالمورد: ${pur.supName}\nالإجمالي: ${xf(pur.total)}\n\n✅ هذه الفاتورة لم تُستلم بعد، لذا لن يتأثر المخزون.\n\nسيتم عكس مديونية المورد إن وُجدت.`
        );
        if (!confirmed) return;

        // عكس رصيد المورد إن كانت آجلة
        if (pur.payMethod === 'credit') {
            const supObj = suppliers.find(s => s.id === pur.supId);
            if (supObj) {
                supObj.balance = Math.max(0, (supObj.balance || 0) - pur.total);
            }
        }

        // حذف الفاتورة من السجل
        const idx = purchases.findIndex(x => x.id === pur.id);
        if (idx > -1) purchases.splice(idx, 1);

        db.purchases = purchases;
        db.suppliers = suppliers;
        await saveDB(db);

        renderKPIs();
        renderTable();
        alert(`✅ تم حذف الفاتورة ${pur.id} بنجاح.\n${pur.payMethod === 'credit' ? 'تم عكس مديونية المورد تلقائياً.' : ''}`);
    }

    // ═══════════════════════════════════════════════════
    // 🔄 CANCEL RECEIVED PURCHASE (عكس كامل للمخزون والرصيد)
    // ═══════════════════════════════════════════════════
    async function cancelReceivedPurchase(pur) {
        const seeItems = pur.items ? pur.items.map(i => `• ${i.name}: ${i.qty}`).join('\n') : '';
        const confirmed = confirm(
            `⚠️ تأكيد إلغاء الفاتورة المُستلمة\n\nرقم الفاتورة: ${pur.id}\nالمورد: ${pur.supName}\nالإجمالي: ${xf(pur.total)}\n\nالأصناف التي ستُخصم من المخزون:\n${seeItems}\n\n⚠️ تحذير: سيتم حذف الكميات من المخزون وعكس جميع التأثيرات المالية.\n\nهل تريد المتابعة؟`
        );
        if (!confirmed) return;

        const taxPct = getSystemTaxRate();
        const destWh = pur.destWh || 'main';
        let warnings = [];

        // عكس الكميات من المخزون
        pur.items.forEach(buyItem => {
            const unitCostBeforeTax = buyItem.price / (1 + taxPct / 100);
            let invItem = inventory.find(i => i.sku === buyItem.sku && (i.warehouseId || 'main') === destWh);
            if (invItem) {
                const standardYield = invItem.standardYield || 1;
                const actualYield = Number(buyItem.yield) || 0;
                const qtyToRemove = actualYield > 0 ? (actualYield / standardYield) : buyItem.qty;

                const newQty = (Number(invItem.qty) || 0) - qtyToRemove;
                if (newQty < 0) {
                    warnings.push(`${buyItem.name}: الكمية الحالية (${invItem.qty.toFixed(2)}) أقل من المطلوب خصمه (${qtyToRemove.toFixed(2)})`);
                }
                invItem.qty = Math.max(0, newQty);
            }

            // حذف سجلات حركات المخزون الخاصة بهذه الفاتورة
            db.inventoryTx = (db.inventoryTx || []).filter(
                tx => !(tx.refInvoice === pur.id && tx.type === 'in')
            );
            inventoryTx.length = 0;
            (db.inventoryTx || []).forEach(t => inventoryTx.push(t));
        });

        // عكس رصيد المورد إن كانت آجلة
        if (pur.payMethod === 'credit') {
            const supObj = suppliers.find(s => s.id === pur.supId);
            if (supObj) {
                supObj.balance = Math.max(0, (supObj.balance || 0) - pur.total);
            }
        }

        // تعليم الفاتورة كملغاة (لا تُحذف لضمان المراجعة)
        pur.status = 'ملغاة';
        pur.cancelledAt = new Date().toISOString();
        pur.cancelledReason = 'إلغاء يدوي';

        db.purchases = purchases;
        db.suppliers = suppliers;
        db.inventory = inventory;
        db.inventoryTx = inventoryTx;
        await saveDB(db);

        renderKPIs();
        renderTable();

        let msg = `✅ تم إلغاء الفاتورة ${pur.id} بنجاح.\n\nتم عكس الكميات من المخزون.`;
        if (pur.payMethod === 'credit') msg += '\nتم عكس مديونية المورد.';
        if (warnings.length) msg += '\n\n⚠️ تنبيهات:\n' + warnings.join('\n');
        alert(msg);
    }

    // ═══════════════════════════════════════════════════
    // ✏️ EDIT PURCHASE (قيد الاستلام فقط)
    // ═══════════════════════════════════════════════════
    let editingPurchase = null;

    function openEditModal(pur) {
        editingPurchase = pur;
        const editModal = document.getElementById('editPurchaseModal');

        // ملء بيانات المورد
        const supSel = document.getElementById('edit-inv-supplier');
        supSel.innerHTML = suppliers.filter(s => s.active).map(s =>
            `<option value="${s.id}" ${s.id === pur.supId ? 'selected' : ''}>${s.name}</option>`
        ).join('');

        document.getElementById('edit-inv-ref').value = pur.ref || '';
        document.getElementById('edit-inv-date').value = pur.date || '';
        document.getElementById('edit-inv-payment').value = pur.payMethod || 'cash';
        document.getElementById('edit-inv-warehouse').value = pur.destWh || 'main';

        // ملء الأصناف
        const editItemsContainer = document.getElementById('edit-items-container');
        editItemsContainer.innerHTML = '';
        (pur.items || []).forEach(item => addEditRow(item));

        // Determine if VAT was applied (if tax > 0 or based on total vs subtotal)
        // Since we don't store tax boolean in DB, we guess or check if tax > 0
        const taxPct = getSystemTaxRate();
        const editVatCheckbox = document.getElementById('edit-inv-apply-vat');
        if (editVatCheckbox) {
            // If the saved total matches subtotal + tax, then it was applied.
            // But usually we just default to the current system setting or true.
            // Better: if it's an existing invoice, we can see if it had tax.
            // For now, let's just make it toggleable.
            editVatCheckbox.checked = pur.taxAmount > 0 || (pur.total > (pur.total / (1 + taxPct/100)));
        }

        calculateEditTotals();
        editModal.classList.add('active');
    }

    function addEditRow(item = null) {
        const editItemsContainer = document.getElementById('edit-items-container');
        const div = document.createElement('div');
        div.className = 'item-row';

        const uniqueSkus = [];
        const seenNames = new Set();
        inventory.forEach(i => {
            if (!seenNames.has(i.name)) { seenNames.add(i.name); uniqueSkus.push(i); }
        });

        const skuOptions = uniqueSkus.map(i =>
            `<option value="${i.sku}" data-name="${i.name}" ${item && i.sku === item.sku ? 'selected' : ''}>${i.name} (${i.unit})</option>`
        ).join('');

        div.innerHTML = `
            <div class="form-group">
                <label>الصنف (الخامة)</label>
                <select class="input-modern item-sku" required>${skuOptions}</select>
            </div>
            <div class="form-group">
                <label>الكمية</label>
                <input type="number" step="0.01" min="0.01" class="input-modern item-qty" value="${item ? item.qty : ''}" placeholder="0" required>
            </div>
            <div class="form-group">
                <label>سعر شراء الوحدة</label>
                <input type="number" step="0.01" min="0.01" class="input-modern item-price" value="${item ? item.price : ''}" placeholder="0.00" required>
            </div>
            <div class="form-group">
                <label>الإجمالي</label>
                <input type="text" class="input-modern item-row-total" value="${item ? (item.qty * item.price).toFixed(2) : '0.00'}" readonly style="background:rgba(0,0,0,0.3); color:var(--accent-green); font-weight:700;">
            </div>
            <button type="button" class="btn-remove-row" title="حذف الصنف"><i class="ph ph-trash"></i></button>
        `;

        div.querySelector('.btn-remove-row').addEventListener('click', () => { div.remove(); calculateEditTotals(); });
        div.querySelector('.item-qty').addEventListener('input', calculateEditTotals);
        div.querySelector('.item-price').addEventListener('input', calculateEditTotals);

        editItemsContainer.appendChild(div);
        return div;
    }

    function calculateEditTotals() {
        let sub = 0;
        document.querySelectorAll('#edit-items-container .item-row').forEach(row => {
            const q = Number(row.querySelector('.item-qty').value) || 0;
            const p = Number(row.querySelector('.item-price').value) || 0;
            const t = q * p;
            row.querySelector('.item-row-total').value = t.toFixed(2);
            sub += t;
        });

        const editVatCheckbox = document.getElementById('edit-inv-apply-vat');
        const applyTax = editVatCheckbox ? editVatCheckbox.checked : true;
        const taxPct = getSystemTaxRate();
        const tax = applyTax ? (sub * (taxPct / 100)) : 0;
        const grand = sub + tax;

        const el = document.getElementById('edit-grandtotal');
        if (el) el.innerText = xf(grand);
        const taxEl = document.getElementById('edit-tax');
        if (taxEl) taxEl.innerText = tax.toFixed(2);
        const subEl = document.getElementById('edit-subtotal');
        if (subEl) subEl.innerText = sub.toFixed(2);

        const taxLine = document.getElementById('edit-tax-line');
        if (taxLine) taxLine.style.display = applyTax ? 'flex' : 'none';
    }

    // أزرار إضافة صنف وإغلاق modal التعديل
    document.getElementById('btn-edit-add-row')?.addEventListener('click', () => addEditRow());
    document.querySelectorAll('.btn-close-edit-modal').forEach(b => b.addEventListener('click', () => {
        document.getElementById('editPurchaseModal').classList.remove('active');
        editingPurchase = null;
    }));

    // حفظ التعديلات
    document.getElementById('form-edit-invoice')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!editingPurchase) return;

        const editItemsContainer = document.getElementById('edit-items-container');
        const rows = editItemsContainer.querySelectorAll('.item-row');
        if (rows.length === 0) { alert('يجب إضافة صنف واحد على الأقل!'); return; }

        const purItems = [];
        let valid = true;
        rows.forEach(r => {
            const skuSelect = r.querySelector('.item-sku');
            const sku = skuSelect.value;
            const opt = skuSelect.options[skuSelect.selectedIndex];
            const name = opt && opt.dataset ? opt.dataset.name : '';
            const qty = Number(r.querySelector('.item-qty').value);
            const price = Number(r.querySelector('.item-price').value);
            if (!sku || qty <= 0 || price <= 0) { valid = false; return; }
            purItems.push({ sku, name, qty, price });
        });

        if (!valid) { alert('يرجى التحقق من صحة جميع الأصناف والكميات والأسعار!'); return; }

        const supId = document.getElementById('edit-inv-supplier').value;
        const supObj = suppliers.find(s => s.id === supId);
        const newPayMethod = document.getElementById('edit-inv-payment').value;
        const grandTotalRaw = document.getElementById('edit-grandtotal').innerText;
        const grandTot = window.MisterCasherCurrency && MisterCasherCurrency.parseLoose
            ? MisterCasherCurrency.parseLoose(grandTotalRaw) || 0
            : Number(String(grandTotalRaw).replace(/[^\d.]/g, '')) || 0;

        // عكس مديونية المورد القديمة إن كانت آجلة
        if (editingPurchase.payMethod === 'credit') {
            const oldSup = suppliers.find(s => s.id === editingPurchase.supId);
            if (oldSup) oldSup.balance = Math.max(0, (oldSup.balance || 0) - editingPurchase.total);
        }

        // تطبيق مديونية المورد الجديدة إن كانت آجلة
        if (newPayMethod === 'credit' && supObj) {
            supObj.balance = (supObj.balance || 0) + grandTot;
        }

        // تحديث بيانات الفاتورة
        editingPurchase.supId = supId;
        editingPurchase.supName = supObj ? supObj.name : editingPurchase.supName;
        editingPurchase.ref = document.getElementById('edit-inv-ref').value;
        editingPurchase.date = document.getElementById('edit-inv-date').value;
        editingPurchase.payMethod = newPayMethod;
        editingPurchase.destWh = document.getElementById('edit-inv-warehouse').value;
        editingPurchase.total = grandTot;
        editingPurchase.items = purItems;
        editingPurchase.lastModified = new Date().toISOString();

        db.purchases = purchases;
        db.suppliers = suppliers;
        await saveDB(db);

        document.getElementById('editPurchaseModal').classList.remove('active');
        editingPurchase = null;
        renderKPIs();
        renderTable();
        alert('✅ تم تعديل الفاتورة بنجاح وتحديث جميع البيانات المرتبطة.');
    });

    // --- Print Goods Received Note (أمر استلام بضاعة) ---
    function printReceiveNote(pur) {
        const taxPct = getSystemTaxRate();
        const whNames = { main: 'المستودع الرئيسي', restaurant: 'مخزن المطعم الداخلي', beverages: 'مخزن المشروبات' };
        const destWhName = whNames[pur.destWh || 'main'] || pur.destWh || 'المستودع الرئيسي';
        const dateStr = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });

        let itemsHtml = '';
        let subTotal = 0;
        if (pur.items) {
            pur.items.forEach((it, idx) => {
                const unitCost = it.price / (1 + taxPct / 100);
                const lineTotal = it.qty * unitCost;
                subTotal += lineTotal;
                itemsHtml += `
                <tr>
                    <td style="text-align:center">${idx + 1}</td>
                    <td>${it.name}</td>
                    <td style="text-align:center">${it.qty}</td>
                    <td style="text-align:center">${unitCost.toFixed(2)}</td>
                    <td style="text-align:center">${lineTotal.toFixed(2)}</td>
                    <td style="text-align:center">✓</td>
                </tr>`;
            });
        }

        const w = window.open('', '_blank', 'width=800,height=700');
        w.document.write(`
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <title>أمر استلام بضاعة - ${pur.id}</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 25px; color: #1a1a1a; font-size: 13px; }
                    .doc-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1e293b; padding-bottom: 18px; margin-bottom: 20px; }
                    .doc-title { font-size: 22px; font-weight: bold; color: #0f172a; margin: 0 0 5px 0; }
                    .doc-subtitle { font-size: 14px; color: #10b981; font-weight: 600; }
                    .doc-meta { background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 14px; text-align: right; min-width: 240px; }
                    .doc-meta p { margin: 4px 0; font-size: 13px; }
                    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
                    .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; }
                    .info-box label { font-size: 11px; color: #64748b; display: block; margin-bottom: 2px; }
                    .info-box span { font-weight: 700; color: #0f172a; font-size: 14px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                    th { background: #1e293b; color: white; padding: 10px 8px; text-align: center; font-size: 12px; }
                    td { padding: 9px 8px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
                    tr:nth-child(even) td { background: #f8fafc; }
                    .summary { display: flex; justify-content: flex-end; margin-top: 20px; }
                    .summary-box { background: #1e293b; color: white; border-radius: 10px; padding: 16px 24px; min-width: 260px; }
                    .sum-line { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; }
                    .sum-line.total { font-size: 16px; font-weight: bold; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 10px; margin-top: 5px; }
                    .sigs { display: flex; justify-content: space-around; margin-top: 50px; text-align: center; }
                    .sig-box { border-top: 1.5px solid #1e293b; padding-top: 8px; width: 160px; font-size: 12px; color: #334155; }
                    .notice { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px; padding: 10px 14px; font-size: 12px; color: #92400e; margin-top: 15px; }
                    @media print { body { padding: 10px; } }
                </style>
            </head>
            <body>
                <div class="doc-header">
                    <div>
                        <p class="doc-title">أمر استلام بضاعة</p>
                        <p class="doc-subtitle">Goods Received Note (GRN)</p>
                        <p style="margin-top:8px; font-size:12px; color:#64748b;">إدارة المشتريات والمخازن</p>
                    </div>
                    <div class="doc-meta">
                        <p><strong>رقم أمر الاستلام:</strong> GRN-${pur.id}</p>
                        <p><strong>مرجع فاتورة المورد:</strong> ${pur.ref || '-'}</p>
                        <p><strong>تاريخ الاستلام:</strong> ${dateStr}</p>
                        <p><strong>تاريخ الفاتورة الأصلية:</strong> ${pur.date}</p>
                    </div>
                </div>

                <div class="info-grid">
                    <div class="info-box">
                        <label>المورد (الشركة)</label>
                        <span>${pur.supName}</span>
                    </div>
                    <div class="info-box">
                        <label>المستودع المستلِم</label>
                        <span>${destWhName}</span>
                    </div>
                    <div class="info-box">
                        <label>طريقة الدفع</label>
                        <span>${pur.payMethod === 'cash' ? 'نقداً' : pur.payMethod === 'bank' ? 'حوالة بنكية' : 'آجل (ذمة)'}</span>
                    </div>
                    <div class="info-box">
                        <label>حالة الاستلام</label>
                        <span style="color:#10b981">✓ مستلمة وتم إدخالها للمخزون</span>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>الصنف</th>
                            <th>الكمية المستلمة</th>
                            <th>سعر الوحدة (قبل ض.ق.م)</th>
                            <th>الإجمالي</th>
                            <th>تم الإدخال</th>
                        </tr>
                    </thead>
                    <tbody>${itemsHtml}</tbody>
                </table>

                <div class="summary">
                    <div class="summary-box">
                        <div class="sum-line"><span>إجمالي قيمة البضاعة (قبل الضريبة):</span><span>${subTotal.toFixed(2)} ر.س</span></div>
                        <div class="sum-line"><span>ضريبة القيمة المضافة (${taxPct}%):</span><span>${(subTotal * taxPct / 100).toFixed(2)} ر.س</span></div>
                        <div class="sum-line total"><span>إجمالي الفاتورة الكلي:</span><span>${xf(pur.total)}</span></div>
                    </div>
                </div>

                <div class="notice">
                    ⚠️ هذا السند يُثبت استلام البضاعة المذكورة وإدخالها في المخزون الإلكتروني. يُعتمد توقيع أمين المستودع والمستلم.
                </div>

                <div class="sigs">
                    <div class="sig-box">أمين المستودع<br><br>.........................</div>
                    <div class="sig-box">مسؤول المشتريات<br><br>.........................</div>
                    <div class="sig-box">مدير العمليات<br><br>.........................</div>
                </div>
            </body>
            </html>
        `);
        w.document.close();
        w.focus();
        setTimeout(() => { w.print(); }, 600);
    }

    // --- HTML Printer Helper ---
    function printPurchaseInvoice(pur) {
        let itemsHtml = '';
        if(pur.items) {
            pur.items.forEach(it => {
                itemsHtml += `
                <tr>
                    <td>${it.name || it.sku}</td>
                    <td>${it.qty}</td>
                    <td>${it.price.toFixed(2)}</td>
                    <td>${(it.qty * it.price).toFixed(2)}</td>
                </tr>`;
            });
        }

        const methodStr = pur.payMethod === 'cash' ? 'نقداً' : (pur.payMethod === 'bank' ? 'حوالة بنكية' : 'آجل (ذمة)');
        const taxPct = getSystemTaxRate();
        const sub = pur.total / (1 + taxPct / 100);
        const tax = pur.total - sub;

        const w = window.open('', '_blank', 'width=800,height=600');
        w.document.write(`
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <title>فاتورة مشتريات وتوريد بضاعة</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Verdana, sans-serif; padding: 20px; color: #333; }
                    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #334155; padding-bottom: 20px; margin-bottom: 20px; }
                    .header-left h1 { margin: 0 0 5px 0; color: #0f172a; }
                    .header-left p { margin: 0; color: #64748b; }
                    .invoice-info { text-align: right; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; }
                    .invoice-info p { margin: 5px 0; font-size: 14px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th { background: #1e293b; color: white; padding: 12px; text-align: right; }
                    td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
                    .totals { width: 300px; margin-right: auto; margin-top:20px; text-align:left;}
                    .tot-line { display:flex; justify-content:space-between; margin-bottom:8px;}
                    .tot-line.grand { font-size: 18px; font-weight: bold; border-top: 2px solid #333; padding-top:10px;}
                    .footer { margin-top: 50px; font-size: 14px; text-align: center; color: #64748b; border-top: 1px solid #cbd5e1; padding-top: 20px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="header-left">
                        <h1>Mister Casher للمطاعم</h1>
                        <p>إدارة المشتريات والمخازن</p>
                        <h2 style="margin-top:15px; color:#10b981;">فاتورة مشتريات / توريد بضاعة</h2>
                    </div>
                    <div class="invoice-info">
                        <p><strong>رقم الفاتورة الآلي:</strong> ${pur.id}</p>
                        <p><strong>رقم الفاتورة المرجعي:</strong> ${pur.ref}</p>
                        <p><strong>التاريخ:</strong> ${pur.date}</p>
                        <p><strong>المورد (الشركة):</strong> ${pur.supName}</p>
                        <p><strong>طريقة الدفع:</strong> ${methodStr}</p>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>الصنف (وصف البضاعة الموردة)</th>
                            <th>الكمية</th>
                            <th>سعر الوحدة</th>
                            <th>الإجمالي الفرعي</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>

                <div class="totals" style="margin-right:0; margin-left:auto; text-align:right;">
                    <div class="tot-line"><span>الإجمالي قبل الضريبة:</span> <span>${xf(sub)}</span></div>
                    <div class="tot-line"><span>(${taxPct}%) ضريبة القيمة المضافة:</span> <span>${xf(tax)}</span></div>
                    <div class="tot-line grand"><span>الإجمالي النهائي المستحق:</span> <span>${xf(pur.total)}</span></div>
                </div>

                <div class="footer">
                    <div style="display:flex; justify-content:space-around; margin-bottom:40px;">
                        <span>توقيع المشتري / مسؤول المخزن</span>
                        <span>توقيع ممثل المورد / المحاسب</span>
                    </div>
                    <p>هذا السند يعتبر إثبات توريد معتمد في النظام الإلكتروني.</p>
                </div>
            </body>
            </html>
        `);
        w.document.close();
        w.focus();
        setTimeout(() => { w.print(); w.close(); }, 500);
    }

});
