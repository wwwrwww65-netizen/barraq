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
            
            // Match transition: opacity [duration], transform [duration], background-color [duration], border-color [duration], box-shadow [duration];
            const regex = /transition:\s*opacity\s+([^,]+),\s*transform\s+([^,]+),\s*background-color\s+([^,]+),\s*border-color\s+([^,]+),\s*box-shadow\s+([^;]+);/g;
            
            let changed = false;
            let newContent = content.replace(regex, (match, p1) => {
                changed = true;
                return `transition: opacity ${p1}, visibility ${p1}, transform ${p1}, background-color ${p1}, border-color ${p1}, box-shadow ${p1};`;
            });
            
            if (changed) {
                fs.writeFileSync(fullPath, newContent, 'utf8');
                console.log(`Added visibility to transitions in: ${fullPath}`);
            }
        }
    }
}

processDir(__dirname);
console.log('Visibility Addition Complete.');
