const fs = require('fs');
const path = require('path');
const dir = 'e:/baraaq';

const hoverFixes = `
/* ============================================
   HOVER & ACTIVE STATE FIXES FOR LIGHT THEME
   Fixes buttons that turn white on hover
   ============================================ */
body.light-theme .acc-tab-btn:hover,
body.light-theme .cust-btn:hover,
body.light-theme .btn-kds-act.to-done:hover,
body.light-theme .icon-btn-subtle:hover,
body.light-theme .view-btn.active {
    color: var(--text-primary) !important;
}

/* For buttons with borders that turn white on hover */
body.light-theme .inv-btn-outline:hover {
    color: var(--text-primary) !important;
    border-color: var(--text-primary) !important;
    background: rgba(0, 0, 0, 0.05) !important;
}

body.light-theme .overlay-btn:hover {
    color: var(--text-primary) !important;
    border-color: var(--text-primary) !important;
    background: rgba(255, 255, 255, 0.8) !important;
}

/* Ensure background of cust-btn is light so dark text is visible */
body.light-theme .cust-btn:hover {
    background: #f1f5f9 !important;
}

body.light-theme .view-btn.active {
    color: var(--accent-blue) !important;
}
`;

let targetFile = path.join(dir, 'light-theme-fixes.css');
let existing = fs.readFileSync(targetFile, 'utf8');

if (!existing.includes('HOVER & ACTIVE STATE FIXES FOR LIGHT THEME')) {
    fs.writeFileSync(targetFile, existing + '\n' + hoverFixes);
    console.log('Appended hover/active fixes to light-theme-fixes.css');
} else {
    console.log('Already appended');
}
