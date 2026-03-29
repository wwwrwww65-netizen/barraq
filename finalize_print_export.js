const fs = require('fs');

// Fix accounting.html - add export button (CRLF safe)
const accPath = 'e:/baraaq/accounting.html';
let acc = fs.readFileSync(accPath, 'utf8');
acc = acc.replace(
    /(<button class="btn-text">مراجعة الكل<\/button>)/,
    '<button class="btn-text" onclick="window.exportTableToCSV(\'recent_expenses.csv\')"><i class="ph ph-export"><\/i> تصدير (Excel)<\/button>\r\n                            $1'
);
fs.writeFileSync(accPath, acc);
console.log('Fixed accounting.html');

// Fix acc-expenses.html - add export+print buttons
const expPath = 'e:/baraaq/acc-expenses.html';
if (fs.existsSync(expPath)) {
    let exp = fs.readFileSync(expPath, 'utf8');
    if (!exp.includes('exportTableToCSV') && exp.includes('<table') ) {
        // Find the first toolbar or header section and inject
        exp = exp.replace(
            /(<\/th>\s*<\/tr>\s*<\/thead>)/,
            '$1'
        );
        // Add print & export near the top action area
        exp = exp.replace(
            /(<h2[^>]*>سجل المصروفات[^<]*<\/h2>)/,
            '$1\n                            <div style="display:flex;gap:10px;">' +
            '<button class="btn btn-primary" style="font-size:13px" onclick="window.exportTableToCSV(\'expenses.csv\')"><i class="ph ph-export"><\/i> تصدير (Excel)</button>' +
            '<button class="btn btn-outline" style="font-size:13px" onclick="window.print()"><i class="ph ph-printer"><\/i> طباعة<\/button><\/div>'
        );
        fs.writeFileSync(expPath, exp);
        console.log('Fixed acc-expenses.html');
    }
}

// Fix acc-reports.html - make sure print button has logo header for print
const repPath = 'e:/baraaq/acc-reports.html';
if (fs.existsSync(repPath)) {
    let rep = fs.readFileSync(repPath, 'utf8');
    if (!rep.includes('exportTableToCSV')) {
        rep = rep.replace(
            /(<button class="btn btn-primary" onclick="window\.print\(\)"><i class="ph ph-printer"><\/i> طباعة التقرير \/ PDF<\/button>)/,
            '<button class="btn btn-primary" onclick="window.exportTableToCSV(\'financial_report.csv\')"><i class="ph ph-export"><\/i> تصدير (Excel)<\/button>\n                    $1'
        );
        fs.writeFileSync(repPath, rep);
        console.log('Fixed acc-reports.html');
    }
}

// Fix returns.html
const retPath = 'e:/baraaq/returns.html';
if (fs.existsSync(retPath)) {
    let ret = fs.readFileSync(retPath, 'utf8');
    if (!ret.includes('exportTableToCSV')) {
        ret = ret.replace(
            /(<h2[^>]*>[^<]*مرتجع[^<]*<\/h2>)/,
            '$1<div style="display:flex;gap:10px;margin-top:10px;">' +
            '<button class="btn btn-outline" onclick="window.exportTableToCSV(\'returns.csv\')"><i class="ph ph-export"><\/i> تصدير (Excel)<\/button>' +
            '<button class="btn btn-outline" onclick="window.print()"><i class="ph ph-printer"><\/i> طباعة<\/button><\/div>'
        );
        fs.writeFileSync(retPath, ret);
        console.log('Fixed returns.html');
    }
}

// Fix orders.html - add export button to toolbar
const ordPath = 'e:/baraaq/orders.html';
if (fs.existsSync(ordPath)) {
    let ord = fs.readFileSync(ordPath, 'utf8');
    if (!ord.includes('exportTableToCSV')) {
        ord = ord.replace(
            /(id="order-date-filter">)/,
            '$1\n                        <button class="btn btn-outline" onclick="window.exportTableToCSV(\'orders.csv\')"><i class="ph ph-export"><\/i> تصدير (Excel)<\/button>' +
            '\n                        <button class="btn btn-outline" onclick="window.print()"><i class="ph ph-printer"><\/i> طباعة<\/button>'
        );
        fs.writeFileSync(ordPath, ord);
        console.log('Fixed orders.html');
    }
}

// Fix acc-banks.html
const banksPath = 'e:/baraaq/acc-banks.html';
if (fs.existsSync(banksPath)) {
    let banks = fs.readFileSync(banksPath, 'utf8');
    if (!banks.includes('exportTableToCSV')) {
        banks = banks.replace(
            /(class="card-title">[^<]*<\/h2>)/,
            '$1\n                            <button class="btn-text" onclick="window.exportTableToCSV(\'bank_accounts.csv\')"><i class="ph ph-export"><\/i> تصدير<\/button>'
        );
        fs.writeFileSync(banksPath, banks);
        console.log('Fixed acc-banks.html');
    }
}

// Append CSS print & export styles to styles.css (CRLF safe)
const cssPath = 'e:/baraaq/styles.css';
let css = fs.readFileSync(cssPath, 'utf8');
if (!css.includes('@media print')) {
    css += `\n\n/* ============== PRINT STYLES ============== */
@media print {
    .sidebar, .top-header, .header-actions, .filter-box, 
    .orders-toolbar, .sales-filters, .inv-toolbar,
    .time-filters, .filter-bar, .acc-actions-bar,
    .btn-suspend, .btn-print, button, .nav-menu,
    .cart-actions-grid, .pos-panel, .badge { display: none !important; }

    body, body.dark-theme { background: #fff !important; color: #000 !important; }
    .main-content, .app-container { margin: 0 !important; padding: 0 !important; }
    
    .card, .acc-transactions, .pl-report-panel, .sales-table-card, 
    .orders-grid, .inv-main-table-card, .pur-table {
        background: #fff !important; border: 1px solid #ccc !important;
        box-shadow: none !important; color: #000 !important;
    }

    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #333; padding: 8px; color: #000 !important; font-size: 12px; }
    h1, h2, h3, p, span, td, th, li { color: #000 !important; }
    canvas { max-width: 100%; }

    @page { margin: 1cm; }

    body::before {
        content: "مطابخ ومحائذ هـــش HASH — تقرير رسمي معتمد";
        display: block; text-align: center; font-size: 20px;
        font-weight: 900; padding-bottom: 12px;
        border-bottom: 2px solid #000; margin-bottom: 18px;
        color: #000 !important;
    }
}`;
    fs.writeFileSync(cssPath, css);
    console.log('Added print CSS to styles.css');
}

// Append exportTableToCSV to script.js
const scriptPath = 'e:/baraaq/script.js';
let script = fs.readFileSync(scriptPath, 'utf8');
if (!script.includes('exportTableToCSV')) {
    script += `

// ============== GLOBAL EXPORT TO CSV ==============
window.exportTableToCSV = function(filename = 'export.csv') {
    const tables = document.querySelectorAll('table');
    if (!tables.length) { alert('لا يوجد جدول بيانات في هذه الصفحة!'); return; }
    const table = tables[0];
    const rows = table.querySelectorAll('tr');
    const csv = [];
    rows.forEach(row => {
        const cols = row.querySelectorAll('td, th');
        const rowData = [];
        cols.forEach(col => rowData.push('"' + col.innerText.trim().replace(/"/g, '""') + '"'));
        csv.push(rowData.join(','));
    });
    const BOM = '\\uFEFF';
    const blob = new Blob([BOM + csv.join('\\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
};`;
    fs.writeFileSync(scriptPath, script);
    console.log('Added exportTableToCSV to script.js');
}

console.log('\\n✅ All done! Print & Export fully hooked up.');
