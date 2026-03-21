const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

const replacements = [
    // Append the Permissions linking next to settings (already done)
    { 
        from: /<a href="pos.html" class="nav-item"><i class="ph ph-monitor"><\/i><span>نقطة البيع \(الكاشير\)<\/span><\/a>/g, 
        to: '<a href="pos.html" class="nav-item"><i class="ph ph-monitor"></i><span>نقطة البيع (الكاشير)</span></a>\n                <a href="kitchen.html" class="nav-item"><i class="ph ph-cooking-pot"></i><span>شاشة المطبخ (KDS)</span></a>' 
    }
];

files.forEach(file => {
    let content = fs.readFileSync(path.join(dir, file), 'utf8');
    let changed = false;
    
    // Prevent double injection if kitchen.html already added
    if(content.indexOf('kitchen.html') > -1) {
        return; 
    }

    replacements.forEach(r => {
        if (content.match(r.from)) {
            content = content.replace(r.from, r.to);
            changed = true;
        }
    });

    if (changed) {
        fs.writeFileSync(path.join(dir, file), content, 'utf8');
        console.log('Added Kitchen link to:', file);
    }
});
