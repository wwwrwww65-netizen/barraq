
// erp-purchases.js
let currentDb = null;
let currentDocId = null;

document.addEventListener('DOMContentLoaded', async () => {
    currentDb = await window.dbRead();
    if (!currentDb.erpPurchasesDocs) {
        currentDb.erpPurchasesDocs = [];
        await window.dbWrite(currentDb);
    }
    renderDocList();
});

function renderDocList() {
    const listDiv = document.getElementById('doc-list-container');
    const docs = currentDb.erpPurchasesDocs || [];

    if (docs.length === 0) {
        listDiv.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:20px;">لا توجد مستندات.</p>';
        return;
    }

    let html = '';
    docs.sort((a,b) => b.timestamp - a.timestamp).forEach(d => {
        let badgeClass = '';
        let typeName = '';
        if (d.type === 'order') { badgeClass = 'order'; typeName = 'أمر شراء'; }
        if (d.type === 'delivery') { badgeClass = 'delivery'; typeName = 'إذن استلام'; }
        if (d.type === 'invoice') { badgeClass = 'invoice'; typeName = 'فاتورة مشتريات'; }

        html += `
            <div class="doc-item ${currentDocId === d.id ? 'active' : ''}" onclick="viewDoc('${d.id}')">
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <strong>${d.id}</strong>
                    <span class="doc-badge ${badgeClass}">${typeName}</span>
                </div>
                <div style="font-size:13px; color:var(--text-muted); margin-bottom:5px;">المورد: ${d.supplierName || 'مورد نقدي'}</div>
                <div style="font-size:12px; color:#888;">${d.date}</div>
            </div>
        `;
    });
    listDiv.innerHTML = html;
}

window.createNewDoc = function(type) {
    currentDocId = 'NEW';
    const detailDiv = document.getElementById('doc-detail-container');
    const typeLabel = type === 'order' ? 'أمر شراء جديد' : 'فاتورة مشتريات جديدة';

    // Suppliers list
    const suppliers = currentDb.suppliers || [];
    const supOptions = suppliers.map(c => `<option value="${c.name}">${c.name}</option>`).join('');

    detailDiv.innerHTML = `
        <div class="doc-actions-top">
            <button class="btn btn-primary" onclick="saveDoc('${type}')"><i class="ph ph-floppy-disk"></i> حفظ المستند</button>
            <button class="btn btn-outline" onclick="renderDocList(); document.getElementById('doc-detail-container').innerHTML=''">إلغاء</button>
        </div>

        <h3 style="margin-bottom:20px;">${typeLabel}</h3>

        <div class="form-grid">
            <div>
                <label style="display:block; margin-bottom:5px; font-size:13px; color:var(--text-muted);">المورد</label>
                <select id="doc-sup" class="form-control">
                    <option value="مورد نقدي">مورد نقدي</option>
                    ${supOptions}
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
                <label style="display:block; margin-bottom:5px; font-size:13px; color:var(--text-muted);">مستودع الاستلام</label>
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
                        <th style="padding:10px; width:100px;">التكلفة</th>
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
                <div style="display:flex; justify-content:space-between; font-size:18px; font-weight:bold; color:var(--accent-blue);">
                    <span>الإجمالي النهائي (مع الضريبة):</span>
                    <strong id="doc-total">0.00</strong>
                </div>
            </div>
        </div>
    `;
    renderDocList();
};

function generateEmptyLineHtml() {
    const products = currentDb.inventory || [];
    const prodOptions = products.map(p => `<option value="${p.id}" data-price="${p.cost}">${p.name}</option>`).join('');

    return `
        <tr class="doc-line-row" style="border-bottom:1px solid rgba(255,255,255,0.05);">
            <td style="padding:5px;">
                <select class="table-input line-prod" onchange="updateLinePrice(this)">
                    <option value="">اختر صنف مخزني...</option>
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
    document.getElementById('doc-total').innerText = total.toFixed(2);
};

window.saveDoc = async function(type) {
    const sup = document.getElementById('doc-sup').value;
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

    const prefix = type === 'order' ? 'PO' : 'PINV';
    const docId = prefix + '-' + Date.now().toString().slice(-6);

    const newDoc = {
        id: docId,
        type: type,
        supplierName: sup,
        date: date,
        paymentTerms: terms,
        warehouse: wh,
        total: totalAmt,
        lines: lines,
        timestamp: Date.now(),
        status: 'draft'
    };

    currentDb.erpPurchasesDocs.push(newDoc);

    if (type === 'invoice') {
        if (!currentDb.journalEntries) currentDb.journalEntries = [];
        const isCash = terms === 'نقدي';
        const liabAcc = isCash ? '1110' : '2110';
        currentDb.journalEntries.push({
            id: 'JE-ERPPUR-' + docId,
            date: date,
            timestamp: Date.now(),
            memo: `فاتورة مشتريات إدارية #${docId}`,
            sourceType: 'erp_purchase',
            sourceId: docId,
            lines: [
                { accountCode: '5110', accountName: 'المشتريات والبضاعة', debit: totalAmt / 1.15, credit: 0 },
                { accountCode: '2110', accountName: 'ضريبة مشتريات', debit: totalAmt - (totalAmt / 1.15), credit: 0 },
                { accountCode: liabAcc, accountName: isCash ? 'الصندوق' : 'ذمم موردين', debit: 0, credit: totalAmt }
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

    const doc = currentDb.erpPurchasesDocs.find(d => d.id === docId);
    if (!doc) return;

    const detailDiv = document.getElementById('doc-detail-container');

    let convertActions = '';
    if (doc.type === 'order' && doc.status !== 'completed') {
        convertActions = `
            <button class="btn btn-primary" onclick="convertDoc('${doc.id}', 'delivery')"><i class="ph ph-truck"></i> إنشاء إذن استلام</button>
            <button class="btn btn-outline" onclick="convertDoc('${doc.id}', 'invoice')"><i class="ph ph-receipt"></i> إنشاء فاتورة مشتريات</button>
        `;
    }

    let typeName = doc.type === 'order' ? 'أمر شراء' : (doc.type === 'delivery' ? 'إذن استلام' : 'فاتورة مشتريات');

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
                    <div style="color:var(--text-muted); margin-bottom:5px;">المورد:</div>
                    <strong>${doc.supplierName}</strong>
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
                    <div style="color:var(--text-muted); margin-bottom:5px;">مستودع الاستلام:</div>
                    <strong>${doc.warehouse === 'main' ? 'الرئيسي' : 'المطعم'}</strong>
                </div>
            </div>

            <table style="width:100%; border-collapse:collapse; text-align:right; font-size:14px;">
                <thead style="background:rgba(0,0,0,0.2);">
                    <tr>
                        <th style="padding:10px;">الصنف</th>
                        <th style="padding:10px;">الكمية</th>
                        <th style="padding:10px;">التكلفة</th>
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
    const doc = currentDb.erpPurchasesDocs.find(d => d.id === docId);
    if (!doc) return;

    // Create new doc based on current
    const prefix = newType === 'delivery' ? 'DL' : 'PINV';
    const newId = prefix + '-' + Date.now().toString().slice(-6);

    const newDoc = JSON.parse(JSON.stringify(doc));
    newDoc.id = newId;
    newDoc.type = newType;
    newDoc.timestamp = Date.now();
    newDoc.date = new Date().toISOString().slice(0,10);
    newDoc.refDocId = doc.id; // Linking

    if (doc.type === 'order') doc.status = 'completed';

    currentDb.erpPurchasesDocs.push(newDoc);

    if (newType === 'invoice') {
        if (!currentDb.journalEntries) currentDb.journalEntries = [];
        const isCash = newDoc.paymentTerms === 'نقدي';
        const liabAcc = isCash ? '1110' : '2110';
        currentDb.journalEntries.push({
            id: 'JE-ERPPUR-' + newId,
            date: newDoc.date,
            timestamp: Date.now(),
            memo: `فاتورة مشتريات إدارية #${newId}`,
            sourceType: 'erp_purchase',
            sourceId: newId,
            lines: [
                { accountCode: '5110', accountName: 'المشتريات والبضاعة', debit: newDoc.total / 1.15, credit: 0 },
                { accountCode: '2110', accountName: 'ضريبة مشتريات', debit: newDoc.total - (newDoc.total / 1.15), credit: 0 },
                { accountCode: liabAcc, accountName: isCash ? 'الصندوق' : 'ذمم موردين', debit: 0, credit: newDoc.total }
            ]
        });
    }

    await window.dbWrite(currentDb);

    alert(`تم توليد مستند جديد بنجاح: ${newId} (مرتبط بـ ${doc.id})`);
    viewDoc(newId);
};
