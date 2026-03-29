const fs = require('fs');
const path = require('path');
const targetDir = 'e:/baraaq';
const files = fs.readdirSync(targetDir).filter(f => f.endsWith('.html'));

files.forEach(f => {
    let html = fs.readFileSync(path.join(targetDir, f), 'utf8');
    let changed = false;

    // We only want to inject in the sidebar, not the button inside main-content of index.html
    // A quick check is looking for statistics inside nav
    // Let's replace the one that has "nav-item" class to be safe.
    const posRegex = /(<a href="statistics\.html" class="nav-item[^"]*">.*?<\/a>)/g;
    const accRegex = /(<a href="acc-reports\.html#balance" class="nav-item[^"]*">.*?<\/a>)/g;

    if (posRegex.test(html)) {
        // avoid double injection if run twice
        if (!html.includes('profit-loss.html')) {
            html = html.replace(posRegex, '$1\n                    <a href="profit-loss.html" class="nav-item"><i class="ph ph-scales"></i><span>الأرباح والخسائر</span></a>');
            changed = true;
        }
    } else if (accRegex.test(html)) {
         if (!html.includes('profit-loss.html')) {
            html = html.replace(accRegex, '$1\n                    <a href="profit-loss.html" class="nav-item"><i class="ph ph-scales"></i><span>الأرباح والخسائر</span></a>');
            changed = true;
        }
    }

    if (changed) {
        fs.writeFileSync(path.join(targetDir, f), html);
        console.log('Injected link into: ' + f);
    }
});
