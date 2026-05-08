const fs = require('fs');
const path = require('path');

function processDir(dir) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !fullPath.includes('node_modules') && !fullPath.includes('.git')) {
            processDir(fullPath);
        } else if (fullPath.endsWith('.css') && !fullPath.includes('vendor') && !fullPath.includes('bootstrap')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            
            let changed = false;
            
            // Remove backdrop-filter properties
            const regex = /backdrop-filter:[^;]+;/g;
            let newContent = content.replace(regex, (match) => {
                changed = true;
                return `/* ${match} (Disabled for Performance) */`;
            });
            
            if (changed) {
                fs.writeFileSync(fullPath, newContent, 'utf8');
                console.log(`Disabled backdrop-filter in: ${fullPath}`);
            }
        }
    }
}

processDir(__dirname);
console.log('Disabled Glassmorphism Blurs Complete.');
