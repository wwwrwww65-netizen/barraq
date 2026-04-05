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
    const tbody = document.getElementById('sup-tbody');
    const searchInput = document.getElementById('search-sup');
    const modal = document.getElementById('supModal');
    if (!tbody || !searchInput || !modal) return;

    let db = await window.dbRead();
    if (!db.suppliers) db.suppliers = [];
    let suppliers = db.suppliers;

    if (suppliers.length === 0) {
        suppliers = [
            {
                id: 'SUP-01',
                name: 'شركة المراعي',
                cat: 'ألبان ومنتجات',
                phone: '0551234567',
                balance: 4500,
                active: true,
                createdAt: new Date().toISOString()
            },
            {
                id: 'SUP-02',
                name: 'مؤسسة الثقة للحوم',
                cat: 'لحوم طازجة',
                phone: '0501112223',
                balance: 12400,
                active: true,
                createdAt: new Date().toISOString()
            }
        ];
        db.suppliers = suppliers;
        await saveDB(db);
    }

    function renderKPIs() {
        const activeCount = suppliers.filter((s) => s.active).length;
        const totalBalance = suppliers.reduce((s, sup) => s + (sup.balance || 0), 0);
        const zeroBalance = suppliers.filter((s) => (s.balance || 0) === 0).length;
        document.getElementById('kpi-count').innerText = String(activeCount);
        document.getElementById('kpi-total-balance').innerText = fmt(totalBalance) + ' ر.س';
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

        filtered.forEach((s) => {
            const bal = Number(s.balance) || 0;
            const balColor = bal > 0 ? 'var(--accent-red)' : 'var(--accent-green)';
            const balText = bal === 0 ? 'لا يوجد مستحقات' : fmt(bal) + ' ر.س';
            const statusTag = s.active
                ? '<span class="inv-tag tag-safe">مورد نشط</span>'
                : '<span class="inv-tag tag-empty">موقوف</span>';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <strong>${s.name}</strong>
                    <div style="font-size:11px;color:var(--text-muted);font-family:monospace;">${s.id}</div>
                </td>
                <td><span style="background:rgba(255,255,255,0.08);padding:3px 8px;border-radius:6px;">${s.cat || ''}</span></td>
                <td dir="ltr" style="text-align:right;font-family:monospace;">${s.phone || ''}</td>
                <td style="color:${balColor}; font-weight:800; font-size:16px;">${balText}</td>
                <td>${statusTag}</td>
                <td>
                    <button type="button" class="action-btn text-blue pay-btn" data-id="${s.id}" title="تسجيل دفعة سداد">
                        <i class="ph ph-money"></i> سداد
                    </button>
                    <button type="button" class="action-btn ${s.active ? 'text-orange' : 'text-green'} toggle-btn" data-id="${s.id}">
                        <i class="ph ${s.active ? 'ph-pause-circle' : 'ph-play-circle'}"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        document.querySelectorAll('.pay-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const sup = suppliers.find((x) => x.id === btn.dataset.id);
                if (!sup) return;
                const amtStr = prompt(
                    `دفعة سداد للمورد: "${sup.name}"\nالرصيد الحالي المستحق: ${fmt(sup.balance || 0)} ر.س\n\nأدخل مبلغ الدفعة:`
                );
                const amt = parseFloat(amtStr);
                if (isNaN(amt) || amt <= 0) return;
                if (amt > (sup.balance || 0)) {
                    alert('المبلغ المدخل أكبر من الرصيد المستحق!');
                    return;
                }
                sup.balance = Math.max(0, parseFloat(((sup.balance || 0) - amt).toFixed(2)));
                db.suppliers = suppliers;
                await saveDB(db);
                await render();
                alert(`تم تسجيل الدفعة بمبلغ ${fmt(amt)} ر.س\nالرصيد المتبقي: ${fmt(sup.balance)} ر.س`);
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
    }

    if (typeof window.registerPosDatabaseRefresh === 'function') {
        window.registerPosDatabaseRefresh(async () => {
            db = await window.dbRead();
            suppliers = db.suppliers || [];
            await render();
        });
    }

    await render();
    searchInput.addEventListener('input', () => render());

    document.getElementById('btn-add-supplier').addEventListener('click', () => modal.classList.add('active'));
    document.querySelectorAll('.btn-cancel-modal').forEach((b) =>
        b.addEventListener('click', () => {
            modal.classList.remove('active');
            document.getElementById('form-sup').reset();
        })
    );

    document.getElementById('form-sup').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newSup = {
            id: 'SUP-' + Date.now(),
            name: document.getElementById('sup-name').value.trim(),
            cat: document.getElementById('sup-cat').value.trim(),
            phone: document.getElementById('sup-phone').value.trim(),
            balance: Number(document.getElementById('sup-balance').value) || 0,
            active: true,
            createdAt: new Date().toISOString()
        };
        suppliers.push(newSup);
        db.suppliers = suppliers;
        await saveDB(db);
        modal.classList.remove('active');
        e.target.reset();
        await render();
        alert(`تم حفظ المورد "${newSup.name}" في قاعدة البيانات!`);
    });
});
