const fs = require('fs');
const path = require('path');
const dir = 'e:/baraaq';

const fixes = `
/* ============================================
   ADD ITEM & ADD CATEGORY PAGES LIGHT THEME FIXES
   ============================================ */
body.light-theme .form-actions-bar {
    background: #ffffff !important;
    border-top-color: #e2e8f0 !important;
    box-shadow: 0 -5px 25px rgba(0,0,0,0.05) !important;
}

body.light-theme .btn-cancel {
    color: #475569 !important;
}

body.light-theme .btn-cancel:hover {
    color: #ef4444 !important;
}

body.light-theme .btn-save-draft {
    background: #f8fafc !important;
    color: #0f172a !important;
    border-color: #cbd5e1 !important;
}

body.light-theme .btn-save-draft:hover {
    background: #f1f5f9 !important;
    border-color: #94a3b8 !important;
}

body.light-theme .recipe-item-li:hover {
    background: #f1f5f9 !important;
}

body.light-theme .recipe-qty-input {
    background: #ffffff !important;
    border-color: #cbd5e1 !important;
}

body.light-theme .recipe-dropdown {
    background: #ffffff !important;
    border-color: #cbd5e1 !important;
    box-shadow: 0 10px 25px rgba(0,0,0,0.1) !important;
}

body.light-theme .recipe-search-box input {
    background: #f8fafc !important;
    border-color: #e2e8f0 !important;
    color: #0f172a !important;
}
`;

let targetFile = path.join(dir, 'light-theme-fixes.css');
let existing = fs.readFileSync(targetFile, 'utf8');

if (!existing.includes('ADD ITEM & ADD CATEGORY PAGES LIGHT THEME FIXES')) {
    fs.writeFileSync(targetFile, existing + '\n' + fixes);
    console.log('Appended add-item/add-category fixes to light-theme-fixes.css');
} else {
    console.log('Already appended');
}
