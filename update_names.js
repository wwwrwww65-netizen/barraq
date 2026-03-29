const fs = require('fs');
const path = require('path');
const targetDir = 'e:/baraaq';
const files = fs.readdirSync(targetDir).filter(f => f.endsWith('.html'));

files.forEach(f => {
    const filePath = path.join(targetDir, f);
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // Replace <span class="user-name">...</span>
    const newContent = content.replace(/<span\s+class="user-name"[^>]*>.*?<\/span>/g, '<span class="user-name">جاري التحميل...</span>');
    if (newContent !== content) {
        content = newContent;
        changed = true;
    }

    // Replace <span class="user-role">...</span>
    const newContentRole = content.replace(/<span\s+class="user-role"[^>]*>.*?<\/span>/g, '<span class="user-role">...</span>');
    if (newContentRole !== content) {
        content = newContentRole;
        changed = true;
    }
    
    // Inject script.js into staff.html if missing
    if (f === 'staff.html' && !content.includes('script.js')) {
        content = content.replace('</body>', '    <script src="script.js"></script>\n</body>');
        changed = true;
    }
    
    // If it's staff.html without user profile in header, the user might be complaining about it missing?
    // Actually the user complaint is "it changes from page to another", which implies they DO see a user profile and it changes text.

    if (changed) {
        fs.writeFileSync(filePath, content);
        console.log('Updated ' + f);
    }
});
console.log('Script finished');
