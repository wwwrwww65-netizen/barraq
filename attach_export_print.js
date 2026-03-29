const fs = require('fs');

// 1. Append Print CSS to styles.css
const cssToAppend = `\n/* --- Global Print Styles --- */
@media print {
    body, body.dark-theme, .app-container, .main-content {
        background: white !important;
        color: black !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
    }
    .sidebar, .top-header, .header-actions, .filter-box, .time-filters, 
    .pos-sidebar, .pos-header, .btn-primary, .btn-outline, .btn-text, .action-btn, .nav-menu,
    .cart-actions-grid, .modal-actions-split, .form-actions-bar,
    .btn-suspend, .btn-print, .btn-pay {
        display: none !important;
    }
    .card, .form-card, .pl-report-panel, .border-container {
        border: 1px solid #ccc !important;
        box-shadow: none !important;
        background: white !important;
        color: black !important;
        break-inside: avoid;
    }
    canvas { max-width: 100% !important; }
    table { width: 100% !important; border-collapse: collapse !important; color: black !important; }
    th, td { border: 1px solid #ccc !important; padding: 8px !important; color: black !important; }
    h1, h2, h3, h4, p, span { color: black !important; }
    
    body::before {
        content: "مطابخ ومحائذ هـــش HASH - تقرير رسمي معتمد";
        display: block;
        text-align: center;
        font-size: 24px;
        font-weight: bold;
        margin-bottom: 20px;
        border-bottom: 2px solid #000;
        padding-bottom: 10px;
        color: black !important;
    }
}\n`;

let cssPath = 'e:/baraaq/styles.css';
let cssData = fs.readFileSync(cssPath, 'utf8');
if (!cssData.includes('/* --- Global Print Styles --- */')) {
    fs.appendFileSync(cssPath, cssToAppend);
    console.log('Appended Print CSS.');
}

// 2. Append CSV Export to script.js
const jsToAppend = `\n// --- Global Export & Print Functionality ---
window.exportTableToCSV = function(filename) {
    const csv = [];
    const tables = document.querySelectorAll('table');
    if(tables.length === 0) { alert('لا يوجد مساحة بيانات لتصديرها في هذه الصفحة!'); return; }
    const table = tables[0];
    const rows = table.querySelectorAll('tr');
    for (let i = 0; i < rows.length; i++) {
        const row = [];
        const cols = rows[i].querySelectorAll('td, th');
        for (let j = 0; j < cols.length; j++) row.push('"' + cols[j].innerText.replace(/"/g, '""') + '"');
        csv.push(row.join(','));
    }
    const csvFile = new Blob(["\\uFEFF"+csv.join('\\n')], {type: 'text/csv;charset=utf-8;'});
    const downloadLink = document.createElement("a");
    downloadLink.download = filename;
    downloadLink.href = window.URL.createObjectURL(csvFile);
    downloadLink.style.display = "none";
    document.body.appendChild(downloadLink);
    downloadLink.click();
};\n`;

let jsPath = 'e:/baraaq/script.js';
let jsData = fs.readFileSync(jsPath, 'utf8');
if (!jsData.includes('window.exportTableToCSV')) {
    fs.appendFileSync(jsPath, jsToAppend);
    console.log('Appended Export JS.');
}

// 3. Fix unhooked buttons in HTML files
function fixHtmlFile(filename, replacements) {
    let htmlPath = 'e:/baraaq/' + filename;
    if (!fs.existsSync(htmlPath)) return;
    let htmlData = fs.readFileSync(htmlPath, 'utf8');
    let changed = false;
    for (const [search, replace] of replacements) {
        if (htmlData.includes(search)) {
            htmlData = htmlData.replaceAll(search, replace);
            changed = true;
        }
    }
    if (changed) {
        fs.writeFileSync(htmlPath, htmlData);
        console.log('Fixed buttons in', filename);
    }
}

fixHtmlFile('statistics.html', [
    ['<button class="btn btn-primary"><i class="ph ph-download-simple"></i> تصدير التقرير (PDF/Excel)</button>', 
     '<button class="btn btn-primary" onclick="window.exportTableToCSV(\\'statistics_report.csv\\')"><i class="ph ph-download-simple"></i> تصدير التقرير (Excel)</button>\n                    <button class="btn btn-outline" style="margin-right:10px" onclick="window.print()"><i class="ph ph-printer"></i> طباعة التقرير / PDF</button>']
]);

fixHtmlFile('inventory.html', [
    ['<button class="inv-btn-outline"><i class="ph ph-printer"></i> جرد المخزن</button>', 
     '<button class="inv-btn-outline" onclick="window.print()"><i class="ph ph-printer"></i> طباعة جرد المخزن</button>'],
    ['<button class="inv-btn-outline" style="border-color:#10b981; color:#10b981;">',
     '<button class="inv-btn-outline" style="border-color:#10b981; color:#10b981;" onclick="window.exportTableToCSV(\\'inventory_report.csv\\')">']
]);

fixHtmlFile('profit-loss.html', [
    ['<button class="btn-text"><i class="ph ph-export"></i> تصدير البيانات</button>',
     '<button class="btn-text" onclick="window.exportTableToCSV(\\'profit_loss_report.csv\\')"><i class="ph ph-export"></i> تصدير (Excel)</button>']
]);

fixHtmlFile('accounting.html', [
    ['<button class="acc-btn acc-btn-report" onclick="window.location.href=\\'acc-reports.html\\'"><i class="ph ph-printer"></i> طباعة كشف دخل واستاذ</button>',
     '<button class="acc-btn acc-btn-report" onclick="window.print()"><i class="ph ph-printer"></i> طباعة هذه الشاشة</button>']
]);

console.log('Finished updating buttons, styles, and scripts.');
