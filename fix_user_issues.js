const fs = require('fs');
const path = require('path');
const dir = 'e:/baraaq';

// 1. Fix menu.html a tags
let lightThemeFixesPath = path.join(dir, 'light-theme-fixes.css');
let lightThemeFixes = fs.readFileSync(lightThemeFixesPath, 'utf8');

// Replace "body.light-theme a {" with "body.light-theme a:not([class*=\"btn\"]) {"
lightThemeFixes = lightThemeFixes.replace(
    /body\.light-theme a\s*\{\s*color:\s*var\(--accent-blue\);\s*\}/g,
    'body.light-theme a:not([class*="btn"]):not(.menu-item-card) {\n    color: var(--accent-blue);\n}'
);

// 2. Add POS category icon fix
if (!lightThemeFixes.includes('.category-btn.active .cat-icon')) {
    lightThemeFixes += `\n
/* Fix POS category active icons */
body.light-theme .category-btn.active .cat-icon,
body.light-theme .category-btn.active .cat-icon i {
    color: white !important;
}
`;
}

// 3. Add Login Page Light Theme
if (!lightThemeFixes.includes('.login-page-body {')) {
    lightThemeFixes += `\n
/* Login Page Light Theme */
body.light-theme.login-page-body {
    background: #f1f5f9 !important;
}
body.light-theme .login-box {
    background: #ffffff !important;
    border-color: #e2e8f0 !important;
    box-shadow: 0 10px 25px rgba(0,0,0,0.05) !important;
}
body.light-theme .login-title h1 {
    color: #0f172a !important;
}
body.light-theme .login-title p,
body.light-theme .login-form-group label,
body.light-theme .login-footer {
    color: #64748b !important;
}
body.light-theme .login-input {
    background: #f8fafc !important;
    border-color: #cbd5e1 !important;
    color: #0f172a !important;
}
body.light-theme .login-input:focus {
    border-color: var(--accent-blue) !important;
}
body.light-theme .login-input-wrapper i {
    color: #94a3b8 !important;
}
body.light-theme .login-logo {
    border-color: #e2e8f0 !important;
}
`;
}

fs.writeFileSync(lightThemeFixesPath, lightThemeFixes);
console.log('Fixed menu buttons, POS icons, and Login page light theme.');
