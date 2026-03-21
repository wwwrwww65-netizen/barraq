const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

const replacements = [
    // Append the Permissions linking next to settings
    { 
        from: /<a href="settings.html" class="nav-item"><i class="ph ph-gear"><\/i><span>الإعدادات<\/span><\/a>/g, 
        to: '<a href="settings.html" class="nav-item"><i class="ph ph-gear"></i><span>الإعدادات</span></a>\n                    <a href="permissions.html" class="nav-item"><i class="ph ph-shield-check"></i><span>الصلاحيات</span></a>' 
    }
];

files.forEach(file => {
    let content = fs.readFileSync(path.join(dir, file), 'utf8');
    let changed = false;
    
    // Prevent double injection if permissions.html already added
    if(content.indexOf('permissions.html') > -1) {
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
        console.log('Added Permissions link to:', file);
    }
});
