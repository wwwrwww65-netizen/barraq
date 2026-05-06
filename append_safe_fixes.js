const fs = require('fs');
const path = require('path');
const dir = 'e:/baraaq';

let generated = fs.readFileSync(path.join(dir, 'generated_fixes.css'), 'utf8');

const toRemove = [
    ':hover', '.active', 'btn', '-btn', 'action', 'badge', 'kds-nav', 'factory-btn', 'icon-box', 'cat-box'
];

let blocks = generated.split('\n\n');
let safeBlocks = blocks.filter(b => {
    let selector = b.split('{')[0].trim();
    for (let r of toRemove) {
        if (selector.includes(r)) return false;
    }
    return true;
});

let cssToAdd = `
/* ============================================
   SPECIFIC TEXT COLOR FIXES FOR LIGHT THEME
   Generated to catch white text elements
   ============================================ */
${safeBlocks.join('\n\n')}
`;

let targetFile = path.join(dir, 'light-theme-fixes.css');
let existing = fs.readFileSync(targetFile, 'utf8');

if (!existing.includes('SPECIFIC TEXT COLOR FIXES')) {
    fs.writeFileSync(targetFile, existing + '\n' + cssToAdd);
    console.log('Appended to light-theme-fixes.css');
} else {
    console.log('Already appended');
}
