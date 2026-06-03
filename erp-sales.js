
// erp-sales.js
let currentDb = null;
let currentDocId = null;

document.addEventListener('DOMContentLoaded', async () => {
    currentDb = await window.dbRead();
    if (!currentDb.erpSalesDocs) {
        currentDb.erpSalesDocs = [];
        await window.dbWrite(currentDb);
    }
    renderDocList();
});

function renderDocList() {
    const listDiv = document.getElementById('doc-list-container');
    const docs = currentDb.erpSalesDocs || [];

    if (docs.length === 0) {
        listDiv.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:20px;">لا توجد مستندات.</p>';
        return;
    }

    let html = '';
    docs.sort((a,b) => b.timestamp - a.timestamp).forEach(d => {
        let badgeClass = '';
        let typeName = '';
        if (d.type === 'quotation') { badgeClass = 'quotation'; typeName = 'عرض سعر'; }
        if (d.type === 'order') { badgeClass = 'order'; typeName = 'أمر بيع'; }
        if (d.type === 'delivery') { badgeClass = 'delivery'; typeName = 'إذن تسليم'; }
        if (d.type === 'invoice') { badgeClass = 'invoice'; typeName = 'فاتورة مالية'; }

        html += `
            <div class="doc-item ${currentDocId === d.id ? 'active' : ''}" onclick="viewDoc('${d.id}')">
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <strong>${d.id}</strong>
                    <span class="doc-badge ${badgeClass}">${typeName}</span>
                </div>
                <div style="font-size:13px; color:var(--text-muted); margin-bottom:5px;">العميل: ${d.customerName || 'عميل نقدي'}</div>
                <div style="font-size:12px; color:#888;">${d.date}</div>
            </div>
        `;
    });
    listDiv.innerHTML = html;
}

window.createNewDoc = function(type) {
    currentDocId = 'NEW';
    const detailDiv = document.getElementById('doc-detail-container');
    const typeLabel = type === 'quotation' ? 'عرض سعر جديد' : (type === 'order' ? 'أمر بيع جديد' : 'فاتورة جديدة');

    // Customers list
    const customers = currentDb.customers || [];
    const custOptions = customers.map(c => `<option value="${c.name}">${c.name}</option>`).join('');

    detailDiv.innerHTML = `
        <div class="doc-actions-top">
            <button class="btn btn-primary" onclick="saveDoc('${type}')"><i class="ph ph-floppy-disk"></i> حفظ المستند</button>
            <button class="btn btn-outline" onclick="renderDocList(); document.getElementById('doc-detail-container').innerHTML=''">إلغاء</button>
        </div>

        <h3 style="margin-bottom:20px;">${typeLabel}</h3>

        <div class="form-grid">
            <div>
                <label style="display:block; margin-bottom:5px; font-size:13px; color:var(--text-muted);">العميل</label>
                <select id="doc-cust" class="form-control">
                    <option value="عميل نقدي">عميل نقدي</option>
                    ${custOptions}
                </select>
            </div>
            <div>
                <label style="display:block; margin-bottom:5px; font-size:13px; color:var(--text-muted);">التاريخ</label>
                <input type="date" id="doc-date" class="form-control" value="${new Date().toISOString().slice(0,10)}">
            </div>
            <div>
                <label style="display:block; margin-bottom:5px; font-size:13px; color:var(--text-muted);">شروط الدفع</label>
                <select id="doc-terms" class="form-control">
                    <option value="نقدي">نقدي فوراً</option>
                    <option value="آجل 15 يوم">آجل 15 يوم</option>
                    <option value="آجل 30 يوم">آجل 30 يوم</option>
                </select>
            </div>
            <div>
                <label style="display:block; margin-bottom:5px; font-size:13px; color:var(--text-muted);">المستودع (للخصم)</label>
                <select id="doc-wh" class="form-control">
                    <option value="main">المستودع الرئيسي</option>
                    <option value="restaurant">مخزن المطعم الداخلي</option>
                </select>
            </div>
        </div>

        <div style="margin-bottom:20px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <h4>الأصناف</h4>
                <button class="btn btn-outline btn-sm" onclick="addDocLine()"><i class="ph ph-plus"></i> إضافة سطر</button>
            </div>
            <table style="width:100%; border-collapse:collapse; text-align:right;">
                <thead style="background:rgba(255,255,255,0.05); border-bottom:1px solid var(--border-color);">
                    <tr>
                        <th style="padding:10px;">الصنف</th>
                        <th style="padding:10px; width:80px;">الكمية</th>
                        <th style="padding:10px; width:100px;">السعر</th>
                        <th style="padding:10px; width:100px;">الإجمالي</th>
                        <th style="padding:10px; width:40px;"></th>
                    </tr>
                </thead>
                <tbody id="doc-lines-tbody">
                    <!-- Line 1 -->
                    ${generateEmptyLineHtml()}
                </tbody>
            </table>
        </div>

        <div style="display:flex; justify-content:flex-end; padding-top:20px; border-top:1px solid var(--border-color);">
            <div style="width:300px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <span>الإجمالي الفرعي:</span>
                    <strong id="doc-subtotal">0.00</strong>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <span>الضريبة (15%):</span>
                    <strong id="doc-tax">0.00</strong>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:18px; font-weight:bold; color:var(--accent-blue);">
                    <span>الإجمالي النهائي:</span>
                    <strong id="doc-total">0.00</strong>
                </div>
            </div>
        </div>
    `;
    renderDocList();
};

function generateEmptyLineHtml() {
    const products = currentDb.products || [];
    const prodOptions = products.map(p => `<option value="${p.id}" data-price="${p.price}">${p.nameAr}</option>`).join('');

    return `
        <tr class="doc-line-row" style="border-bottom:1px solid rgba(255,255,255,0.05);">
            <td style="padding:5px;">
                <select class="table-input line-prod" onchange="updateLinePrice(this)">
                    <option value="">اختر صنف...</option>
                    ${prodOptions}
                </select>
            </td>
            <td style="padding:5px;"><input type="number" class="table-input line-qty" value="1" min="1" oninput="calcDocTotals()"></td>
            <td style="padding:5px;"><input type="number" class="table-input line-price" value="0" min="0" step="any" oninput="calcDocTotals()"></td>
            <td style="padding:5px;"><input type="text" class="table-input line-total" value="0.00" readonly style="color:var(--accent-green); font-weight:bold;"></td>
            <td style="padding:5px;"><button class="btn-icon remove-line" onclick="this.closest('tr').remove(); calcDocTotals();"><i class="ph ph-trash"></i></button></td>
        </tr>
    `;
}

window.addDocLine = function() {
    document.getElementById('doc-lines-tbody').insertAdjacentHTML('beforeend', generateEmptyLineHtml());
};

window.updateLinePrice = function(sel) {
    const opt = sel.options[sel.selectedIndex];
    const price = opt.dataset.price || 0;
    const row = sel.closest('tr');
    row.querySelector('.line-price').value = price;
    calcDocTotals();
};

window.calcDocTotals = function() {
    let sub = 0;
    document.querySelectorAll('.doc-line-row').forEach(row => {
        const q = parseFloat(row.querySelector('.line-qty').value) || 0;
        const p = parseFloat(row.querySelector('.line-price').value) || 0;
        const tot = q * p;
        row.querySelector('.line-total').value = tot.toFixed(2);
        sub += tot;
    });

    const tax = sub * 0.15; // default tax
    const total = sub + tax;

    document.getElementById('doc-subtotal').innerText = sub.toFixed(2);
    document.getElementById('doc-tax').innerText = tax.toFixed(2);
    document.getElementById('doc-total').innerText = total.toFixed(2);
};

window.saveDoc = async function(type) {
    const cust = document.getElementById('doc-cust').value;
    const date = document.getElementById('doc-date').value;
    const terms = document.getElementById('doc-terms').value;
    const wh = document.getElementById('doc-wh').value;
    const totalAmt = parseFloat(document.getElementById('doc-total').innerText);

    const lines = [];
    document.querySelectorAll('.doc-line-row').forEach(row => {
        const sel = row.querySelector('.line-prod');
        if (!sel.value) return;
        lines.push({
            prodId: sel.value,
            prodName: sel.options[sel.selectedIndex].text,
            qty: parseFloat(row.querySelector('.line-qty').value) || 0,
            price: parseFloat(row.querySelector('.line-price').value) || 0,
            total: parseFloat(row.querySelector('.line-total').value) || 0
        });
    });

    if(lines.length === 0) { alert('يجب إضافة سطر واحد على الأقل.'); return; }

    const prefix = type === 'quotation' ? 'QT' : (type === 'order' ? 'SO' : 'INV');
    const docId = prefix + '-' + Date.now().toString().slice(-6);

    const newDoc = {
        id: docId,
        type: type,
        customerName: cust,
        date: date,
        paymentTerms: terms,
        warehouse: wh,
        total: totalAmt,
        lines: lines,
        timestamp: Date.now(),
        status: 'draft' // Draft by default until confirmed
    };

    currentDb.erpSalesDocs.push(newDoc);

    if (type === 'invoice') {
        if (!currentDb.journalEntries) currentDb.journalEntries = [];
        const isCash = terms === 'نقدي';
        const assetAcc = isCash ? '1110' : '1130';
        currentDb.journalEntries.push({
            id: 'JE-ERPSALE-' + docId,
            date: date,
            timestamp: Date.now(),
            memo: `فاتورة مبيعات إدارية #${docId}`,
            sourceType: 'erp_invoice',
            sourceId: docId,
            lines: [
                { accountCode: assetAcc, accountName: isCash ? 'الصندوق' : 'ذمم عملاء', debit: totalAmt, credit: 0 },
                { accountCode: '4110', accountName: 'إيرادات مبيعات', debit: 0, credit: totalAmt / 1.15 },
                { accountCode: '2110', accountName: 'ضريبة مبيعات', debit: 0, credit: totalAmt - (totalAmt / 1.15) }
            ]
        });
    }

    await window.dbWrite(currentDb);

    currentDocId = docId;
    renderDocList();
    viewDoc(docId);
};

window.viewDoc = function(docId) {
    currentDocId = docId;
    renderDocList(); // update active state

    const doc = currentDb.erpSalesDocs.find(d => d.id === docId);
    if (!doc) return;

    const detailDiv = document.getElementById('doc-detail-container');

    let convertActions = '';
    if (doc.type === 'quotation') {
        convertActions = `<button class="btn btn-primary" onclick="convertDoc('${doc.id}', 'order')"><i class="ph ph-arrow-fat-lines-right"></i> تحويل إلى أمر بيع</button>`;
    } else if (doc.type === 'order' && doc.status !== 'completed') {
        convertActions = `
            <button class="btn btn-primary" onclick="convertDoc('${doc.id}', 'delivery')"><i class="ph ph-truck"></i> إنشاء إذن تسليم مخزني</button>
            <button class="btn btn-outline" onclick="convertDoc('${doc.id}', 'invoice')"><i class="ph ph-receipt"></i> إنشاء فاتورة مالية</button>
        `;
    }

    let typeName = doc.type === 'quotation' ? 'عرض سعر' : (doc.type === 'order' ? 'أمر بيع' : (doc.type === 'delivery' ? 'إذن تسليم' : 'فاتورة مالية'));

    detailDiv.innerHTML = `
        <div class="doc-actions-top" style="justify-content:space-between;">
            <div style="display:flex; gap:10px;">
                ${convertActions}
            </div>
            <button class="btn btn-outline" onclick="window.print()"><i class="ph ph-printer"></i> طباعة</button>
        </div>

        <div style="background:rgba(255,255,255,0.02); padding:20px; border-radius:8px; border:1px solid var(--border-color);">
            <div style="display:flex; justify-content:space-between; margin-bottom:20px;">
                <h2>${typeName} #${doc.id}</h2>
                <span class="doc-badge ${doc.type}" style="font-size:14px; padding:5px 15px;">${doc.status === 'draft' ? 'مسودة' : 'معتمد'}</span>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:30px; font-size:14px;">
                <div>
                    <div style="color:var(--text-muted); margin-bottom:5px;">العميل:</div>
                    <strong>${doc.customerName}</strong>
                </div>
                <div>
                    <div style="color:var(--text-muted); margin-bottom:5px;">التاريخ:</div>
                    <strong>${doc.date}</strong>
                </div>
                <div>
                    <div style="color:var(--text-muted); margin-bottom:5px;">شروط الدفع:</div>
                    <strong>${doc.paymentTerms}</strong>
                </div>
                <div>
                    <div style="color:var(--text-muted); margin-bottom:5px;">مستودع الصرف:</div>
                    <strong>${doc.warehouse === 'main' ? 'الرئيسي' : 'المطعم'}</strong>
                </div>
            </div>

            <table style="width:100%; border-collapse:collapse; text-align:right; font-size:14px;">
                <thead style="background:rgba(0,0,0,0.2);">
                    <tr>
                        <th style="padding:10px;">الصنف</th>
                        <th style="padding:10px;">الكمية</th>
                        <th style="padding:10px;">السعر</th>
                        <th style="padding:10px;">الإجمالي</th>
                    </tr>
                </thead>
                <tbody>
                    ${doc.lines.map(l => `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                            <td style="padding:10px;">${l.prodName}</td>
                            <td style="padding:10px;">${l.qty}</td>
                            <td style="padding:10px;">${l.price.toFixed(2)}</td>
                            <td style="padding:10px; color:var(--accent-green);">${l.total.toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div style="text-align:left; margin-top:20px; font-size:18px; font-weight:bold; color:var(--accent-blue);">
                الإجمالي النهائي: ${doc.total.toFixed(2)}
            </div>
        </div>
    `;
};

window.convertDoc = async function(docId, newType) {
    const doc = currentDb.erpSalesDocs.find(d => d.id === docId);
    if (!doc) return;

    // Create new doc based on current
    const prefix = newType === 'order' ? 'SO' : (newType === 'delivery' ? 'DL' : 'INV');
    const newId = prefix + '-' + Date.now().toString().slice(-6);

    const newDoc = JSON.parse(JSON.stringify(doc));
    newDoc.id = newId;
    newDoc.type = newType;
    newDoc.timestamp = Date.now();
    newDoc.date = new Date().toISOString().slice(0,10);
    newDoc.refDocId = doc.id; // Linking

    // Mark old doc as completed/processed if it's an order converting to invoice/delivery
    if (doc.type === 'order') doc.status = 'completed';

    currentDb.erpSalesDocs.push(newDoc);

    if (newType === 'invoice') {
        if (!currentDb.journalEntries) currentDb.journalEntries = [];
        const isCash = newDoc.paymentTerms === 'نقدي';
        const assetAcc = isCash ? '1110' : '1130';
        currentDb.journalEntries.push({
            id: 'JE-ERPSALE-' + newId,
            date: newDoc.date,
            timestamp: Date.now(),
            memo: `فاتورة مبيعات إدارية #${newId}`,
            sourceType: 'erp_invoice',
            sourceId: newId,
            lines: [
                { accountCode: assetAcc, accountName: isCash ? 'الصندوق' : 'ذمم عملاء', debit: newDoc.total, credit: 0 },
                { accountCode: '4110', accountName: 'إيرادات مبيعات', debit: 0, credit: newDoc.total / 1.15 },
                { accountCode: '2110', accountName: 'ضريبة مبيعات', debit: 0, credit: newDoc.total - (newDoc.total / 1.15) }
            ]
        });
    }

    await window.dbWrite(currentDb);

    alert(`تم توليد مستند جديد بنجاح: ${newId} (مرتبط بـ ${doc.id})`);
    viewDoc(newId);
};
