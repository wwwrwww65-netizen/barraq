const fs = require('fs');
const path = require('path');
const dir = 'e:/baraaq';

const inlineOverrides = `
/* ============================================
   INLINE STYLE TEXT COLOR FIXES
   Overrides inline color: white on standard elements
   ============================================ */
body.light-theme *:not(button):not(.btn):not([class*="btn"]):not(.badge):not([class*="badge"]):not(.kpi-icon):not([style*="background"]):not(a)[style*="color: white"],
body.light-theme *:not(button):not(.btn):not([class*="btn"]):not(.badge):not([class*="badge"]):not(.kpi-icon):not([style*="background"]):not(a)[style*="color:white"],
body.light-theme *:not(button):not(.btn):not([class*="btn"]):not(.badge):not([class*="badge"]):not(.kpi-icon):not([style*="background"]):not(a)[style*="color: #fff"],
body.light-theme *:not(button):not(.btn):not([class*="btn"]):not(.badge):not([class*="badge"]):not(.kpi-icon):not([style*="background"]):not(a)[style*="color:#fff"] {
    color: var(--text-primary) !important;
}

body.light-theme strong[style*="color"], 
body.light-theme b[style*="color"], 
body.light-theme div[style*="color:white"], 
body.light-theme div[style*="color: white"] {
    color: var(--text-primary) !important;
}
`;

let targetFile = path.join(dir, 'light-theme-fixes.css');
let existing = fs.readFileSync(targetFile, 'utf8');

if (!existing.includes('INLINE STYLE TEXT COLOR FIXES')) {
    fs.writeFileSync(targetFile, existing + '\n' + inlineOverrides);
    console.log('Appended inline overrides to light-theme-fixes.css');
} else {
    console.log('Already appended inline overrides');
}
