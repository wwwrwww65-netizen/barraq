const { ipcRenderer } = require('electron');

async function saveDB(db) {
    await window.dbWrite(db);
    try {
        ipcRenderer.send('notify-db-changed');
    } catch (e) {}
}

function fmt(n) {
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

document.addEventListener('DOMContentLoaded', async () => {
    const xf = (n) => (window.MisterCasherCurrency ? MisterCasherCurrency.format(n) : fmt(n) + ' ر.س');
    const tbody = document.getElementById('sup-tbody');
    const searchInput = document.getElementById('search-sup');
    const modal = document.getElementById('supModal');
    if (!tbody || !searchInput || !modal) return;

    let db = await window.dbRead();
    if (!db.suppliers) db.suppliers = [];
    if (!db.supplierPayments) db.supplierPayments = [];
    let suppliers = db.suppliers;

    function renderKPIs() {
        const activeCount = suppliers.filter((s) => s.active).length;
        const totalBalance = suppliers.reduce((s, sup) => s + (sup.balance || 0), 0);
        const zeroBalance = suppliers.filter((s) => (s.balance || 0) === 0).length;
        document.getElementById('kpi-count').innerText = String(activeCount);
        document.getElementById('kpi-total-balance').innerText = xf(totalBalance);
        document.getElementById('kpi-zero-balance').innerText = String(zeroBalance);
    }

    async function render() {
        tbody.innerHTML = '';
        renderKPIs();
        const q = searchInput.value.toLowerCase().trim();
        const filtered = suppliers.filter(
            (s) =>
                (s.name || '').toLowerCase().includes(q) ||
                (s.phone || '').includes(q) ||
                (s.cat || '').toLowerCase().includes(q)
        );

        if (filtered.length === 0) {
            tbody.innerHTML =
                '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted)">لا يوجد موردون مطابقون.</td></tr>';
            return;
        }

        const fragment = document.createDocumentFragment();
        filtered.forEach((s) => {
            const bal = Number(s.balance) || 0;
            const balColor = bal > 0 ? 'var(--sup-accent-red)' : 'var(--sup-accent-green)';
            const balText = bal === 0 ? 'لا يوجد مستحقات' : xf(bal);
            const statusTag = s.active
                ? '<span class="inv-tag tag-safe">مورد نشط</span>'
                : '<span class="inv-tag tag-empty">موقوف</span>';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="sup-name-cell">
                        <strong>${s.name}</strong>
                        <span class="sup-id-label">${s.id}</span>
                    </div>
                </td>
                <td><span class="sup-cat-tag">${s.cat || ''}</span></td>
                <td dir="ltr" style="text-align:right;font-family:monospace;font-weight:600;">${s.phone || ''}</td>
                <td style="color:${balColor};">
                    <span class="balance-val">${balText}</span>
                </td>
                <td>${statusTag}</td>
                <td>
                    <div class="premium-btn-group">
                        <button type="button" class="p-btn p-btn-pay pay-btn" data-id="${s.id}" title="تسجيل دفعة سداد">
                            <i class="ph ph-money"></i> سداد
                        </button>
                        <button type="button" class="p-btn p-btn-profile profile-btn" data-id="${s.id}" title="عرض السجل المالي">
                            <i class="ph ph-article"></i> السجل
                        </button>
                        <button type="button" class="p-btn p-btn-icon p-btn-edit edit-btn" data-id="${s.id}" title="تعديل">
                            <i class="ph ph-pencil-simple"></i>
                        </button>
                        <button type="button" class="p-btn p-btn-icon p-btn-toggle toggle-btn" data-id="${s.id}" title="${s.active ? 'إيقاف' : 'تفعيل'}">
                            <i class="ph ${s.active ? 'ph-pause-circle' : 'ph-play-circle'}"></i>
                        </button>
                        <button type="button" class="p-btn p-btn-icon p-btn-delete delete-btn" data-id="${s.id}" title="حذف">
                            <i class="ph ph-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            fragment.appendChild(tr);
        });
        tbody.appendChild(fragment);

        document.querySelectorAll('.pay-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const sup = suppliers.find((x) => x.id === btn.dataset.id);
                if (!sup) return;
                
                document.getElementById('pay-sup-id').value = sup.id;
                document.getElementById('pay-current-balance').innerText = xf(sup.balance || 0);
                document.getElementById('pay-amount').value = '';
                document.getElementById('pay-date').valueAsDate = new Date();
                document.getElementById('pay-notes').value = '';
                
                window.openModalLayer(document.getElementById('paymentModal'));
            });
        });

        document.querySelectorAll('.profile-btn').forEach((btn) => {
            btn.addEventListener('click', () => openSupplierProfile(btn.dataset.id));
        });

        document.querySelectorAll('.edit-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const sup = suppliers.find((x) => x.id === btn.dataset.id);
                if (sup) {
                    document.getElementById('sup-id').value = sup.id;
                    document.getElementById('sup-name').value = sup.name;
                    document.getElementById('sup-cat').value = sup.cat || '';
                    document.getElementById('sup-phone').value = sup.phone || '';
                    document.getElementById('sup-balance').value = sup.balance || 0;
                    
                    document.getElementById('supModalTitle').innerText = 'تعديل بيانات مورد';
                    window.openModalLayer(modal);
                }
            });
        });

        document.querySelectorAll('.toggle-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const sup = suppliers.find((x) => x.id === btn.dataset.id);
                if (sup) {
                    sup.active = !sup.active;
                    db.suppliers = suppliers;
                    await saveDB(db);
                    await render();
                }
            });
        });

        document.querySelectorAll('.delete-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const sup = suppliers.find((x) => x.id === btn.dataset.id);
                if (!sup) return;
                
                if (await window.mcasherConfirm(`هل أنت متأكد من حذف المورد "${sup.name}"؟\nسيتم حذف جميع بياناته نهائياً.`)) {
                    suppliers = suppliers.filter(x => x.id !== btn.dataset.id);
                    db.suppliers = suppliers;
                    await saveDB(db);
                    await render();
                    await window.mcasherAlert('تم حذف المورد بنجاح');
                }
            });
        });
    }

    // --- Payment Modal Submission ---
    const payForm = document.getElementById('form-payment');
    const payModal = document.getElementById('paymentModal');
    
    document.querySelectorAll('.btn-close-payment').forEach(b => b.addEventListener('click', () => window.closeModalLayer(payModal)));

    payForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const supId = document.getElementById('pay-sup-id').value;
        const amt = parseFloat(document.getElementById('pay-amount').value);
        const sup = suppliers.find(s => s.id === supId);
        if (!sup || isNaN(amt) || amt <= 0) return;

        const pMethod = document.getElementById('pay-method').value;
        const pDate = document.getElementById('pay-date').value;
        const pNotes = document.getElementById('pay-notes').value;

        // Record payment
        if (!db.supplierPayments) db.supplierPayments = [];
        db.supplierPayments.push({
            id: 'PAY-' + Date.now(),
            supId: sup.id,
            supName: sup.name,
            amount: amt,
            pMethod: pMethod,
            date: pDate,
            timestamp: new Date(pDate).getTime(),
            notes: pNotes || 'دفعة سداد يدوية'
        });

        // Update balance
        sup.balance = Math.max(0, parseFloat(((sup.balance || 0) - amt).toFixed(2)));
        db.suppliers = suppliers;
        await saveDB(db);
        
        window.closeModalLayer(payModal);
        await render();
        await window.mcasherAlert(`✅ تم تسجيل دفعة السداد بمبلغ ${xf(amt)} بنجاح.`);
    });

    // --- Profile Logic (Advanced) ---
    let activeSupId = null;

    async function openSupplierProfile(id) {
        // Refresh DB to ensure we have latest purchases/payments
        db = await window.dbRead();
        
        activeSupId = id;
        const sup = (db.suppliers || []).find(s => s.id === id);
        if (!sup) {
            await window.mcasherAlert('لم يتم العثور على بيانات المورد!');
            return;
        }

        const mainList = document.querySelector('.inv-dashboard-grid');
        const headerActions = document.querySelector('.header-actions');
        const headerTitle = document.querySelector('.header-left-title h2');
        const headerSub = document.querySelector('.header-left-title p');
        const profileView = document.getElementById('supplier-profile-view');

        if (!mainList || !profileView) return;

        // Hide main list
        mainList.style.display = 'none';
        headerActions.style.display = 'none';
        
        // Show profile
        profileView.style.display = 'block';
        headerTitle.innerText = `السجل المالي للمورد: ${sup.name}`;
        headerSub.innerHTML = `<div style="display:flex; align-items:center; gap:15px; margin-top:10px;">
            <button onclick="window.closeSupplierProfile()" class="profile-btn-back">
                <i class="ph ph-arrow-right"></i> العودة للقائمة
            </button> 
            <span style="color:var(--text-secondary); font-size:14px;">تفاصيل المديونية والمشتريات والمدفوعات لهذا المورد.</span>
        </div>`;

        // Gather all transactions with robust filtering
        // We match by ID OR by Name (as fallback for old data)
        const myPurchases = (db.purchases || []).filter(p => 
            p.supId === id || (p.supName && p.supName === sup.name)
        );
        const myPayments = (db.supplierPayments || []).filter(p => 
            p.supId === id || (p.supName && p.supName === sup.name)
        );

        // Calculate reconciliation for consistency
        const totalCreditPurchases = myPurchases
            .filter(p => p.payMethod === 'credit')
            .reduce((s, p) => s + (Number(p.total) || 0), 0);
        const totalPayments = myPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
        
        // Derived Opening Balance = Current Stored Balance - (System recorded Credit Purchases - System recorded Payments)
        const currentBalance = Number(sup.balance) || 0;
        const derivedOpeningBalance = Number((currentBalance - (totalCreditPurchases - totalPayments)).toFixed(2));

        // Render Profile KPIs
        const totalPurchasedAll = myPurchases.reduce((s, p) => s + (Number(p.total) || 0), 0);
        const totalPaidAll = myPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
        
        const kpiGrid = document.getElementById('profile-kpis');
        if (kpiGrid) {
            kpiGrid.innerHTML = `
                <div class="card kpi-card">
                    <div class="kpi-icon blue"><i class="ph-fill ph-shopping-cart"></i></div>
                    <div class="kpi-details">
                        <p class="kpi-title">إجمالي المشتريات</p>
                        <h3 class="kpi-value">${xf(totalPurchasedAll)}</h3>
                        <p class="kpi-trend">مجموع الفواتير المسجلة</p>
                    </div>
                </div>
                <div class="card kpi-card">
                    <div class="kpi-icon green"><i class="ph-fill ph-hand-coins"></i></div>
                    <div class="kpi-details">
                        <p class="kpi-title">إجمالي المدفوعات</p>
                        <h3 class="kpi-value">${xf(totalPaidAll)}</h3>
                        <p class="kpi-trend">مجموع سندات الصرف</p>
                    </div>
                </div>
                <div class="card kpi-card">
                    <div class="kpi-icon red"><i class="ph-fill ph-warning-circle"></i></div>
                    <div class="kpi-details">
                        <p class="kpi-title">الرصيد المتبقي (الدين)</p>
                        <h3 class="kpi-value">${xf(currentBalance)}</h3>
                        <p class="kpi-trend">ذمة مالية جارية</p>
                    </div>
                </div>
            `;
        }

        let allTx = [
            ...myPurchases.map(p => ({
                date: p.date || '',
                timestamp: p.date ? new Date(p.date).getTime() : 0,
                desc: `شراء فاتورة رقم: ${p.id}`,
                amount: Number(p.total) || 0,
                type: 'purchase',
                method: p.payMethod === 'credit' ? 'آجل (ذمة)' : (p.payMethod === 'cash' ? 'نقدي' : 'بنكي'),
                ref: p.id
            })),
            ...myPayments.map(p => ({
                date: p.date || '',
                timestamp: p.timestamp || (p.date ? new Date(p.date).getTime() : 0),
                desc: p.notes || 'دفعة سداد مسجلة',
                amount: Number(p.amount) || 0,
                type: 'payment',
                method: p.pMethod === 'cash' ? 'نقدي' : 'بنكي',
                ref: p.id
            }))
        ];

        // Add opening balance as a starting point if it's non-zero
        if (Math.abs(derivedOpeningBalance) > 0.001) {
            allTx.push({
                date: 'سجل سابق',
                timestamp: -1, // Ensure it's the very first
                desc: 'رصيد سابق / افتتاحي عند التأسيس',
                amount: Math.abs(derivedOpeningBalance),
                type: derivedOpeningBalance > 0 ? 'opening_debt' : 'opening_credit',
                method: 'رصيد أساسي',
                ref: 'START',
                runningBal: derivedOpeningBalance
            });
        }

        // Sort ASC for running balance calculation
        allTx.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        let runningBal = 0;
        allTx.forEach(tx => {
            if (tx.type === 'opening_debt' || tx.type === 'opening_credit') {
                runningBal = tx.amount * (tx.type === 'opening_debt' ? 1 : -1);
            } else if (tx.type === 'purchase') {
                // Only credit purchases increase the balance/debt
                if (tx.method === 'آجل (ذمة)') {
                    runningBal += tx.amount;
                }
            } else {
                runningBal -= tx.amount;
            }
            tx.runningBal = Number(runningBal.toFixed(2));
        });

        // Sort DESC for display
        allTx.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        const txBody = document.getElementById('profile-tx-tbody');
        if (txBody) {
            txBody.innerHTML = '';
            allTx.forEach(tx => {
                const isOpening = tx.type && tx.type.startsWith('opening');
                const isPur = tx.type === 'purchase';
                
                let typeTag = '';
                let typeColor = '';
                let typeBg = '';
                let amountPrefix = '';

                if (isOpening) {
                    typeTag = 'رصيد افتتاحي';
                    typeColor = 'var(--sup-accent-orange)';
                    typeBg = 'rgba(245, 158, 11, 0.15)';
                    amountPrefix = '';
                } else if (isPur) {
                    typeTag = 'مشتريات';
                    typeColor = 'var(--sup-accent-red)';
                    typeBg = 'rgba(239, 68, 68, 0.15)';
                    amountPrefix = '+';
                } else {
                    typeTag = 'دفعة سداد';
                    typeColor = 'var(--sup-accent-green)';
                    typeBg = 'rgba(16, 185, 129, 0.15)';
                    amountPrefix = '-';
                }

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="font-weight:600; color:var(--text-secondary);">${tx.date}</td>
                    <td style="font-weight:700;">${tx.desc}</td>
                    <td><span class="inv-tag" style="background:${typeBg}; color:${typeColor}; padding:6px 12px; border-radius:10px; font-weight:800;">${typeTag}</span></td>
                    <td style="font-weight:600; color:var(--text-muted);">${tx.method}</td>
                    <td style="font-weight:800; font-size:16px; color:${typeColor}">${amountPrefix}${xf(tx.amount)}</td>
                    <td style="font-weight:900; font-size:16px; color:white;">${xf(tx.runningBal)}</td>
                    <td style="font-family:monospace; color:var(--text-muted); font-size:11px; opacity:0.6;">${tx.ref}</td>
                    <td class="no-print">
                        <div style="display:flex; gap:5px;">
                            ${tx.type === 'purchase' ? `
                                <button class="p-btn p-btn-icon edit-tx-pur" data-id="${tx.ref}" title="تعديل في صفحة المشتريات" style="background:rgba(59,130,246,0.1); color:#3b82f6;">
                                    <i class="ph ph-pencil"></i>
                                </button>
                                <button class="p-btn p-btn-icon delete-tx-pur" data-id="${tx.ref}" title="حذف الفاتورة" style="background:rgba(239,68,68,0.1); color:#ef4444;">
                                    <i class="ph ph-trash"></i>
                                </button>
                            ` : (tx.type === 'payment' ? `
                                <button class="p-btn p-btn-icon delete-tx-pay" data-id="${tx.ref}" title="حذف سند السداد" style="background:rgba(239,68,68,0.1); color:#ef4444;">
                                    <i class="ph ph-trash"></i>
                                </button>
                            ` : '')}
                        </div>
                    </td>
                `;
                txBody.appendChild(tr);
            });

            // --- Transaction Actions Events ---
            txBody.querySelectorAll('.edit-tx-pur').forEach(btn => {
                btn.addEventListener('click', () => {
                    window.location.href = `purchases.html?edit=${btn.dataset.id}`;
                });
            });

            txBody.querySelectorAll('.delete-tx-pur').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.dataset.id;
                    const pur = (db.purchases || []).find(p => p.id === id);
                    if (!pur) return;

                    if (pur.status === 'مستلمة بالمخزن') {
                        await window.mcasherAlert('⚠️ لا يمكن حذف فاتورة مستلمة من هنا مباشرة.\nيرجى الذهاب لصفحة «المشتريات» واستخدام زر «إلغاء الاستلام» أولاً لعكس المخزون.');
                        return;
                    }

                    if (!(await window.mcasherConfirm(`هل أنت متأكد من حذف فاتورة المشتريات ${id}؟`))) return;

                    // Reverse credit if applicable
                    if (pur.payMethod === 'credit') {
                        const s = (db.suppliers || []).find(x => x.id === pur.supId);
                        if (s) s.balance = Math.max(0, (s.balance || 0) - pur.total);
                    }

                    db.purchases = db.purchases.filter(p => p.id !== id);
                    await saveDB(db);
                    openSupplierProfile(activeSupId); // Refresh view
                });
            });

            txBody.querySelectorAll('.delete-tx-pay').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.dataset.id;
                    const pay = (db.supplierPayments || []).find(p => p.id === id);
                    if (!pay) return;

                    if (!(await window.mcasherConfirm(`هل أنت متأكد من حذف سند السداد بقيمة ${xf(pay.amount)}؟\nسيتم إعادة المبلغ لمديونية المورد.`))) return;

                    const s = (db.suppliers || []).find(x => x.id === pay.supId);
                    if (s) s.balance = (s.balance || 0) + pay.amount;

                    db.supplierPayments = db.supplierPayments.filter(p => p.id !== id);
                    await saveDB(db);
                    openSupplierProfile(activeSupId); // Refresh view
                });
            });

            if (allTx.length === 0) {
                txBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px; color:var(--text-muted);">لا توجد حركات مالية مسجلة لهذا المورد حتى الآن.</td></tr>';
            }
        }
    }

    window.closeSupplierProfile = () => {
        document.getElementById('supplier-profile-view').style.display = 'none';
        document.querySelector('.inv-dashboard-grid').style.display = 'grid';
        document.querySelector('.header-actions').style.display = 'flex';
        document.querySelector('.header-left-title h2').innerText = 'دليل الموردين والشركات';
        document.querySelector('.header-left-title p').innerText = 'تتبع حسابات ومطالبات الشركات الموردة للمطعم، تسجيل السداد، وفتح حساب جديد.';
        activeSupId = null;
    };

    window.printSupplierStatement = () => {
        const sup = suppliers.find(s => s.id === activeSupId);
        if (!sup) return;
        
        // 1. Fill print header details
        const printName = document.getElementById('print-sup-name');
        const printPhone = document.getElementById('print-sup-phone');
        const printDate = document.getElementById('print-sup-date');
        
        if (printName) printName.innerText = sup.name;
        if (printPhone) printPhone.innerText = sup.phone || 'غير مسجل';
        if (printDate) printDate.innerText = new Date().toLocaleDateString('ar-SA') + ' ' + new Date().toLocaleTimeString('ar-SA');

        // 2. Add totals to tfoot
        const tfoot = document.getElementById('profile-tx-tfoot');
        if (tfoot) {
            tfoot.innerHTML = `
                <tr style="background:#f8fafc; border-top:2px solid #94a3b8; font-weight:bold;">
                    <td colspan="4" style="text-align:left; padding:12px;">الرصيد المتبقي (المديونية الحالية):</td>
                    <td colspan="3" style="font-size:18px; color:#ef4444; padding:12px;">${xf(sup.balance || 0)}</td>
                </tr>
            `;
        }

        // 3. Print
        document.body.classList.add('print-mode-supplier');
        
        // Ensure printing works smoothly by giving UI time to update
        setTimeout(() => {
            window.print();
            document.body.classList.remove('print-mode-supplier');
        }, 100);
    };

    window.exportSupplierPDF = () => {
        const sup = suppliers.find(s => s.id === activeSupId);
        if (!sup) return;

        // 1. Fill print header details
        const printName = document.getElementById('print-sup-name');
        const printPhone = document.getElementById('print-sup-phone');
        const printDate = document.getElementById('print-sup-date');
        
        if (printName) printName.innerText = sup.name;
        if (printPhone) printPhone.innerText = sup.phone || 'غير مسجل';
        if (printDate) printDate.innerText = new Date().toLocaleDateString('ar-SA') + ' ' + new Date().toLocaleTimeString('ar-SA');

        // 2. Add totals to tfoot
        const tfoot = document.getElementById('profile-tx-tfoot');
        if (tfoot) {
            tfoot.innerHTML = `
                <tr style="background:#f8fafc; border-top:2px solid #94a3b8; font-weight:bold;">
                    <td colspan="4" style="text-align:left; padding:12px;">الرصيد المتبقي (المديونية الحالية):</td>
                    <td colspan="3" style="font-size:18px; color:#ef4444; padding:12px;">${xf(sup.balance || 0)}</td>
                </tr>
            `;
        }

        document.body.classList.add('print-mode-supplier');
        if (typeof window.exportPageToPDF === 'function') {
            const fileName = 'كشف_حساب_مورد_' + sup.name.replace(/\s+/g, '_') + '.pdf';
            window.exportPageToPDF(fileName).finally(() => {
                document.body.classList.remove('print-mode-supplier');
            });
        } else {
            // Fallback if export logic is missing
            window.print();
            document.body.classList.remove('print-mode-supplier');
        }
    };

    if (typeof window.registerPosDatabaseRefresh === 'function') {
        window.registerPosDatabaseRefresh(async () => {
            db = await window.dbRead();
            suppliers = db.suppliers || [];
            await render();
        });
    }

    await render();
    // Performance Optimization: Debounced Search
    let searchTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            render();
        }, 150); // 150ms delay is enough to feel instant but prevent lag
    });

    document.getElementById('btn-add-supplier').addEventListener('click', () => {
        document.getElementById('sup-id').value = '';
        document.getElementById('supModalTitle').innerText = 'إضافة مورد جديد';
        window.openModalLayer(modal);
    });

    document.querySelectorAll('.btn-cancel-modal').forEach((b) =>
        b.addEventListener('click', () => {
            window.closeModalLayer(modal);
            document.getElementById('form-sup').reset();
        })
    );

    document.getElementById('form-sup').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = e.target.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> جاري الحفظ...';
        }
        
        try {
            const id = document.getElementById('sup-id').value;
            const name = document.getElementById('sup-name').value.trim();
            const cat = document.getElementById('sup-cat').value.trim();
            const phone = document.getElementById('sup-phone').value.trim();
            const balance = Number(document.getElementById('sup-balance').value) || 0;

            if (id) {
                // Update existing
                const idx = suppliers.findIndex(x => x.id === id);
                if (idx !== -1) {
                    suppliers[idx].name = name;
                    suppliers[idx].cat = cat;
                    suppliers[idx].phone = phone;
                    suppliers[idx].balance = balance;
                }
            } else {
                // Add new
                const newSup = {
                    id: 'SUP-' + Date.now(),
                    name: name,
                    cat: cat,
                    phone: phone,
                    balance: balance,
                    active: true,
                    createdAt: new Date().toISOString()
                };
                suppliers.push(newSup);
            }

            db.suppliers = suppliers;
            await saveDB(db);
            
            window.closeModalLayer(modal);
            e.target.reset();
            
            requestAnimationFrame(() => {
                requestAnimationFrame(async () => {
                    await render();
                    alert(id ? 'تم تحديث بيانات المورد!' : 'تم إضافة المورد الجديد!');
                });
            });
        } catch (error) {
            console.error('Error saving supplier:', error);
            alert('حدث خطأ أثناء حفظ المورد');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="ph ph-check-circle"></i> حفظ المورد في دليل الحسابات';
            }
        }
    });
});
