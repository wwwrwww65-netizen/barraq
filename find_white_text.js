const fs = require('fs');
const path = require('path');

const dir = 'e:/baraaq';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.css'));

const buttonOrBadgeRegex = /\.btn|button|\.badge|\.kpi-icon|\.theme-toggle|\.active-cat|\.status|\.role-|\.k-qty|\.tbl-actions button/i;

let overrides = [];

files.forEach(f => {
    const content = fs.readFileSync(path.join(dir, f), 'utf8');
    
    // Simple regex to match CSS rules: selector { ... }
    const ruleRegex = /([^{}]+)\s*\{([^{}]*)\}/g;
    let match;
    
    while ((match = ruleRegex.exec(content)) !== null) {
        let selector = match[1].trim();
        let body = match[2];
        
        // Skip media queries or keyframes for simplicity if they matched weirdly
        if (selector.startsWith('@')) continue;
        
        // If body has color: white or #fff or #ffffff
        if (/color\s*:\s*(white|#fff|#ffffff)(?:\s*!important)?\s*[;}]/i.test(body)) {
            // Split multiple selectors like .a, .b
            const subSelectors = selector.split(',').map(s => s.trim());
            
            subSelectors.forEach(sel => {
                // Ignore if it's already a body.light-theme rule
                if (sel.includes('body.light-theme')) return;
                
                // Ignore if it's obviously a button or badge
                if (buttonOrBadgeRegex.test(sel)) return;
                
                overrides.push(`body.light-theme ${sel} {\n    color: var(--text-primary) !important;\n}`);
            });
        }
    }
});

fs.writeFileSync(path.join(dir, 'generated_fixes.css'), overrides.join('\n\n'));
console.log('Found ' + overrides.length + ' selectors to override.');
