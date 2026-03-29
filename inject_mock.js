const fs = require('fs');
const path = require('path');
const targetDir = 'e:/baraaq';
const files = fs.readdirSync(targetDir).filter(f => f.endsWith('.html'));

files.forEach(f => {
    const filePath = path.join(targetDir, f);
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // Remove old injections if I did it before by mistake
    content = content.replace(/<script src="demo-mock\.js"><\/script>\n?\s*/g, '');

    // Inject right after <head>
    const injection = '<head>\n    <script src="demo-mock.js"></script>';
    const newContent = content.replace(/<head>/i, injection);
    
    if (newContent !== content) {
        fs.writeFileSync(filePath, newContent);
        console.log('Injected demo-mock into ' + f);
    } else {
        console.warn('Could not find <head> tag in ' + f);
    }
});
console.log('Done injecting demo-mock.js.');
