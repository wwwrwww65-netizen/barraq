document.addEventListener('DOMContentLoaded', async () => {
    const searchInput = document.getElementById('return-search-input');
    const searchBtn = document.getElementById('btn-search-order');
    const resultCard = document.getElementById('order-result');
    const processBtn = document.getElementById('btn-process-return');
    const modal = document.getElementById('return-modal');
    const cancelModalBtn = document.getElementById('cancel-return-modal');
    const confirmReturnBtn = document.getElementById('confirm-return-final');
    const returnsTbody = document.getElementById('returns-tbody');
    const emptyReturns = document.getElementById('empty-returns');

    let db = await window.dbRead();
    if (!db.orders) db.orders = [];
    if (!db.returns) db.returns = [];

    let selectedOrder = null;

    const xf = (n) =>
        window.HashCurrency
            ? HashCurrency.format(n)
            : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ر.س';

    function currentOperatorName() {
        try {
            const current = JSON.parse(localStorage.getItem('currentUser') || '{}');
            if (current && (current.name || current.username)) return current.name || current.username;
        } catch (_) {}
        return 'المشرف';
    }

    function normalizeDigits(str) {
        const map = {
            '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
            '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
        };
        return String(str || '').replace(/[٠-٩]/g, (d) => map[d] || d);
    }

    function normalizeOrderId(input) {
        let raw = normalizeDigits(String(input || '').trim());
        if (!raw) return '';
        if (raw.startsWith('#')) raw = raw.slice(1);
        // keep letters/numbers/dash only to avoid hidden spaces or symbols
        return raw.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
    }

    function findOrderByQuery(orders, query) {
        const q = normalizeOrderId(query);
        if (!q) return null;

        const normalizedOrders = (orders || []).map((o) => ({
            order: o,
            idNorm: normalizeOrderId(o.orderId),
        }));

        // exact first
        let hit = normalizedOrders.find((x) => x.idNorm === q);
        if (hit) return hit.order;

        // then suffix / contains match for users entering numeric part only
        hit = normalizedOrders.find((x) => x.idNorm.endsWith(q) || x.idNorm.includes(q));
        return hit ? hit.order : null;
    }

    function methodLabel(method) {
        if (method === 'cash' || method === 'نقدي') return 'نقدي (كاش)';
        if (method === 'card' || method === 'شبكة') return 'بطاقة (شبكة)';
        return String(method || '—');
    }

    function closeModal() {
        modal.classList.remove('active');
    }

    function openModalForOrder(order) {
        document.getElementById('modal-order-id').innerText = order.orderId || '—';
        document.getElementById('modal-order-total').innerText = xf(order.total || 0);
        const cashRadio = modal.querySelector('input[name="return-method"][value="نقدي"]');
        if (cashRadio) cashRadio.checked = true;
        modal.classList.add('active');
    }

    function orderAlreadyReturned(orderId) {
        return (db.returns || []).some((r) => String(r.orderId) === String(orderId));
    }

    function renderSearchResult(order) {
        document.getElementById('res-order-id').innerText = `رقم الطلب: #${order.orderId || '—'}`;
        document.getElementById('res-date').innerText = order.date || new Date(order.timestamp || Date.now()).toLocaleString('ar-SA');
        document.getElementById('res-total').innerHTML = `${(window.HashCurrency ? HashCurrency.formatNumber(order.total || 0) : Number(order.total || 0).toFixed(2))} <span class="js-cur-sym">${window.HashCurrency ? HashCurrency.getConfig().symbol : 'ر.س'}</span>`;
        document.getElementById('res-method').innerText = order.paymentMethod || 'غير محدد';
        document.getElementById('res-type').innerText = order.type || 'محلي';

        processBtn.disabled = false;
        processBtn.style.opacity = '';
        processBtn.innerHTML = '<i class="ph ph-warning-circle"></i> إرجاع الأموال وإلغاء الطلب نهائياً';
        if (orderAlreadyReturned(order.orderId)) {
            processBtn.disabled = true;
            processBtn.style.opacity = '0.55';
            processBtn.innerHTML = '<i class="ph ph-check-circle"></i> هذا الطلب مُرتجع مسبقاً';
        }

        resultCard.classList.add('active');
    }

    function renderReturnsTable() {
        const rows = [...(db.returns || [])].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        returnsTbody.innerHTML = '';
        if (rows.length === 0) {
            emptyReturns.style.display = 'block';
            return;
        }
        emptyReturns.style.display = 'none';

        rows.forEach((r) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>#${r.orderId || '—'}</strong></td>
                <td dir="ltr" style="text-align:right">${new Date(r.timestamp || Date.now()).toLocaleString('ar-SA')}</td>
                <td style="font-weight:800;color:var(--accent-red)">${xf(r.amount || 0)}</td>
                <td>${methodLabel(r.method)}</td>
                <td>${r.by || 'المشرف'}</td>
                <td><span class="badge-returned">تم الإرجاع</span></td>
            `;
            returnsTbody.appendChild(tr);
        });
    }

    function renderKpis() {
        const list = db.returns || [];
        const total = list.reduce((s, r) => s + (Number(r.amount) || 0), 0);
        document.getElementById('kpi-total-returns').innerHTML = `${window.HashCurrency ? HashCurrency.formatNumber(total) : total.toFixed(2)} <span class="js-cur-sym">${window.HashCurrency ? HashCurrency.getConfig().symbol : 'ر.س'}</span>`;
        document.getElementById('kpi-return-count').innerText = `${list.length} طلب`;
        if (list.length > 0) {
            const last = [...list].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
            document.getElementById('kpi-last-return').innerText = `#${last.orderId || '—'}`;
        } else {
            document.getElementById('kpi-last-return').innerText = 'لا يوجد';
        }
    }

    async function refreshUi() {
        db = await window.dbRead();
        if (!db.orders) db.orders = [];
        if (!db.returns) db.returns = [];
        renderReturnsTable();
        renderKpis();
    }

    async function doSearch() {
        const q = searchInput.value;
        if (!q) {
            alert('الرجاء إدخال رقم الطلب.');
            return;
        }
        db = await window.dbRead();
        if (!db.orders) db.orders = [];
        if (!db.returns) db.returns = [];

        const order = findOrderByQuery(db.orders, q);
        if (!order) {
            resultCard.classList.remove('active');
            selectedOrder = null;
            alert('لم يتم العثور على الطلب. تأكد من الرقم ثم حاول مرة أخرى.');
            return;
        }
        selectedOrder = order;
        renderSearchResult(order);
    }

    searchBtn?.addEventListener('click', doSearch);
    searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSearch();
    });

    processBtn?.addEventListener('click', () => {
        if (!selectedOrder) return;
        if (orderAlreadyReturned(selectedOrder.orderId)) return;
        openModalForOrder(selectedOrder);
    });

    cancelModalBtn?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    confirmReturnBtn?.addEventListener('click', async () => {
        if (!selectedOrder) return;
        if (orderAlreadyReturned(selectedOrder.orderId)) {
            closeModal();
            return;
        }

        const selectedMethod = modal.querySelector('input[name="return-method"]:checked')?.value || 'نقدي';
        const methodDb = selectedMethod === 'شبكة' ? 'card' : 'cash';

        const row = {
            id: 'RET-' + Math.floor(Math.random() * 90000 + 10000),
            orderId: selectedOrder.orderId,
            amount: Number(selectedOrder.total) || 0,
            method: methodDb,
            reason: 'إلغاء الطلب من شاشة المرتجعات',
            by: currentOperatorName(),
            date: new Date().toISOString().split('T')[0],
            timestamp: Date.now(),
        };

        const writeDb = await window.dbRead();
        if (!writeDb.returns) writeDb.returns = [];
        if (!writeDb.orders) writeDb.orders = [];

        const exists = writeDb.returns.some((r) => String(r.orderId) === String(selectedOrder.orderId));
        if (exists) {
            closeModal();
            await refreshUi();
            return;
        }

        writeDb.returns.push(row);
        const targetOrder = writeDb.orders.find((o) => String(o.orderId) === String(selectedOrder.orderId));
        if (targetOrder) {
            targetOrder.status = 'returned';
            targetOrder.returnedAt = row.timestamp;
            targetOrder.returnMethod = methodDb;
        }

        await window.dbWrite(writeDb);
        closeModal();
        await refreshUi();
        renderSearchResult(selectedOrder);
        alert('تم إرجاع المبلغ وإلغاء الطلب نهائياً بنجاح.');
    });

    await refreshUi();
});
