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
            
            // The sidebar can keep its will-change because it's a single static layout element
            // We want to remove will-change and translateZ(0) mostly from cards and buttons
            
            // Remove will-change: transform; except on .sidebar
            // Using a simple global replace and if there are specific ones we need back we can add them
            
            let newContent = content.replace(/will-change:\s*transform;/g, '/* removed will-change for scroll perf */');
            newContent = newContent.replace(/transform:\s*translateZ\(0\);/g, '/* removed translateZ for scroll perf */');
            newContent = newContent.replace(/transform:\s*translateY\([^)]+\)\s+translateZ\(0\);/g, (match) => {
                return match.replace(' translateZ(0)', '');
            });
            
            if (newContent !== content) {
                changed = true;
                fs.writeFileSync(fullPath, newContent, 'utf8');
                console.log(`Removed excessive GPU layers in: ${fullPath}`);
            }
        }
    }
}

processDir(__dirname);
console.log('GPU Layer Cleanup Complete.');
