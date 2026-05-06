const fs = require('fs');
const path = require('path');
const dir = 'e:/baraaq';

const fixes = `
/* ============================================
   URGENT BACKGROUND FIXES FOR LIGHT THEME
   Fixes buttons that become white on white
   ============================================ */
body.light-theme .category-btn.active {
    background: var(--accent-blue) !important;
    color: white !important;
}

body.light-theme .icon-radio:hover input:checked + .icon-box,
body.light-theme .cat-radio:hover input:checked + .cat-box {
    color: white !important;
}

/* Also ensure kds-nav-btn.active doesn't lose its background */
body.light-theme .kds-nav-btn.active {
    background: var(--accent-blue) !important;
    color: white !important;
}
`;

let targetFile = path.join(dir, 'light-theme-fixes.css');
let existing = fs.readFileSync(targetFile, 'utf8');

if (!existing.includes('URGENT BACKGROUND FIXES FOR LIGHT THEME')) {
    fs.writeFileSync(targetFile, existing + '\n' + fixes);
    console.log('Appended active/background fixes to light-theme-fixes.css');
} else {
    console.log('Already appended');
}
