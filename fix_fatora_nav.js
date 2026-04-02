const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

const zatcaGroup = `
                <div class="nav-divider" style="margin: 15px 0; border-top: 1px solid var(--border-color); width: 80%; align-self: center;"></div>
                <p class="nav-label">مؤسسة الزكاة والضريبة</p>
                <a href="fatora.html" class="nav-item"><i class="ph ph-link"></i><span>الربط مع منصة فوترة (الزكاة)</span></a>`;

files.forEach(file => {
    if(file === 'fatora.html') return;
    
    let content = fs.readFileSync(path.join(dir, file), 'utf8');
    
    // Prevent double injection
    if(content.includes('fatora.html')) return;

    if(content.includes('<a href="permissions.html" class="nav-item"><i class="ph ph-shield-check"></i><span>الصلاحيات</span></a>')) {
        content = content.replace(
            '<a href="permissions.html" class="nav-item"><i class="ph ph-shield-check"></i><span>الصلاحيات</span></a>',
            '<a href="permissions.html" class="nav-item"><i class="ph ph-shield-check"></i><span>الصلاحيات</span></a>' + zatcaGroup
        );
        fs.writeFileSync(path.join(dir, file), content, 'utf8');
        console.log('Patched', file);
    } else if(content.includes('<a href="settings.html" class="nav-item"><i class="ph ph-gear"></i><span>الإعدادات</span></a>')) {
        let lastSettings = content.lastIndexOf('<a href="settings.html" class="nav-item"><i class="ph ph-gear"></i><span>الإعدادات</span></a>');
        if (lastSettings !== -1) {
            content = content.substring(0, lastSettings + 95) + zatcaGroup + content.substring(lastSettings + 95);
            fs.writeFileSync(path.join(dir, file), content, 'utf8');
            console.log('Patched via settings', file);
        }
    }
});
