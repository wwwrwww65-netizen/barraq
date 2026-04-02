const fs = require('fs');
const path = require('path');

const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));
const searchRegex = /<a href="kitchen\.html" class="nav-item">(.*?)<span>شاشة المطبخ \(KDS\)<\/span><\/a>/g;
const replacement = '<a href="kitchen-production.html" class="nav-item">$1<span>المطبخ والإنتاج</span></a>';

files.forEach(f => {
    let content = fs.readFileSync(f, 'utf8');
    if(content.match(searchRegex) && !content.includes('المطبخ والإنتاج')) {
        content = content.replace(searchRegex, replacement);
        fs.writeFileSync(f, content);
        console.log(`Updated ${f}`);
    }
});
