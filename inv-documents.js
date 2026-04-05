function whLabel(id) {
    if (id === 'main') return 'المستودع الرئيسي';
    if (id === 'restaurant') return 'مخزن المطعم';
    if (id === 'beverages') return 'مخزن المشروبات';
    if (id === 'SUPPLIER') return 'مورد';
    return id || '-';
}

document.addEventListener('DOMContentLoaded', async () => {
    const xf = (n) => (window.HashCurrency ? HashCurrency.format(n) : Number(n).toFixed(2) + ' ر.س');
    const txBody = document.getElementById('tx-tbody');
    const searchInput = document.getElementById('search-tx');
    const tabs = document.querySelectorAll('.filter-tab');
    if (!txBody || !searchInput) return;

    let currentFilter = 'all';
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('tab')) {
        const t = urlParams.get('tab');
        if (['all', 'in', 'out', 'transfer'].includes(t)) currentFilter = t;
        tabs.forEach((tab) => {
            tab.classList.toggle('active', tab.dataset.filter === currentFilter);
        });
    }

    let db = await window.dbRead();
    if (!db.inventoryTx) db.inventoryTx = [];
    let erpTx = db.inventoryTx;

    function lblNameFor(tx) {
        if (tx.type === 'in') return 'إدخال';
        if (tx.type === 'out') return 'صرف';
        if (tx.type === 'transfer') return 'تحويل';
        return tx.type || '';
    }

    function noteForPrint(tx) {
        if (tx.type === 'transfer') return `من ${whLabel(tx.fromWh)} إلى ${whLabel(tx.toWh)}`;
        if (tx.type === 'in' && tx.toWh) {
            return `إلى ${whLabel(tx.toWh)}` + (tx.refInvoice ? ` — فاتورة ${tx.refInvoice}` : '');
        }
        return tx.sku ? `صنف: ${tx.sku}` : '-';
    }

    function render() {
        txBody.innerHTML = '';
        const q = searchInput.value.toLowerCase().trim();

        let filtered = erpTx.slice();
        if (currentFilter !== 'all') {
            filtered = filtered.filter((t) => t.type === currentFilter);
        }
        if (q) {
            filtered = filtered.filter((t) =>
                String(t.id || '')
                    .toLowerCase()
                    .includes(q) ||
                String(t.refInvoice || '')
                    .toLowerCase()
                    .includes(q) ||
                String(t.sku || '')
                    .toLowerCase()
                    .includes(q)
            );
        }

        filtered.sort((a, b) => (b.date || 0) - (a.date || 0));

        if (filtered.length === 0) {
            txBody.innerHTML =
                '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted)">لا توجد حركات مطابقة.</td></tr>';
            return;
        }

        filtered.forEach((tx) => {
            let lblClass = '';
            let lblName = '';
            let note = '-';
            if (tx.type === 'in') {
                lblClass = 'lbl-in';
                lblName = 'إدخال (استلام)';
                note = tx.toWh ? `إلى ${whLabel(tx.toWh)}` : note;
                if (tx.refInvoice) note += (note === '-' ? '' : ' — ') + `مرجع: ${tx.refInvoice}`;
            } else if (tx.type === 'out') {
                lblClass = 'lbl-out';
                lblName = 'صرف (خروج)';
            } else if (tx.type === 'transfer') {
                lblClass = 'lbl-transfer';
                lblName = 'تحويل داخلي';
                note = `من ${whLabel(tx.fromWh)} إلى ${whLabel(tx.toWh)}`;
            } else {
                lblName = tx.type || '-';
            }

            const dateStr = new Date(tx.date || Date.now()).toLocaleString('ar-SA');
            const total = Number(tx.total) || 0;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${tx.id}</strong></td>
                <td><span class="type-label ${lblClass}">${lblName}</span></td>
                <td>${dateStr}</td>
                <td style="font-weight:700;">${xf(total)}</td>
                <td>${note}</td>
                <td>
                    <button type="button" class="action-btn text-blue print-rx" data-id="${tx.id}" title="طباعة ملخص"><i class="ph ph-printer"></i></button>
                </td>
            `;
            txBody.appendChild(tr);
        });

        document.querySelectorAll('.print-rx').forEach((btn) => {
            btn.addEventListener('click', () => {
                const tId = btn.dataset.id;
                const tx = erpTx.find((x) => x.id === tId);
                if (!tx) return;
                const w = window.open('', '_blank', 'width=420,height=520');
                w.document.write(`
                    <html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>سند ${tx.id}</title>
                    <style>body{font-family:Segoe UI,Tahoma,sans-serif;padding:16px;font-size:14px}</style></head><body>
                    <h2 style="margin:0 0 12px">هـــش HASH</h2>
                    <p><strong>رقم السند:</strong> ${tx.id}</p>
                    <p><strong>النوع:</strong> ${lblNameFor(tx)}</p>
                    <p><strong>التاريخ:</strong> ${new Date(tx.date || Date.now()).toLocaleString('ar-SA')}</p>
                    <p><strong>القيمة:</strong> ${xf(Number(tx.total) || 0)}</p>
                    <p><strong>ملاحظات:</strong> ${noteForPrint(tx)}</p>
                    </body></html>`);
                w.document.close();
                w.focus();
                setTimeout(() => {
                    w.print();
                    w.close();
                }, 300);
            });
        });
    }

    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            tabs.forEach((t) => t.classList.remove('active'));
            tab.classList.add('active');
            currentFilter = tab.dataset.filter || 'all';
            render();
        });
    });

    searchInput.addEventListener('input', render);

    if (typeof window.registerPosDatabaseRefresh === 'function') {
        window.registerPosDatabaseRefresh(async () => {
            db = await window.dbRead();
            erpTx = db.inventoryTx || [];
            render();
        });
    }

    render();
});
