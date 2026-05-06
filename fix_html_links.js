const fs = require('fs');
const path = require('path');
const dir = 'e:/baraaq';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

files.forEach(f => {
    let p = path.join(dir, f);
    let content = fs.readFileSync(p, 'utf8');
    if (!content.includes('light-theme-fixes.css')) {
        content = content.replace('</head>', '    <link rel="stylesheet" href="light-theme-fixes.css">\n</head>');
        fs.writeFileSync(p, content);
        console.log('Added to ' + f);
    }
});
