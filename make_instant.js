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
            
            // Replace slow durations (0.2s, 0.25s, 0.3s, 0.4s, 0.5s, 0.6s) with 0.1s or 0.05s
            // Specifically looking for transition properties.
            
            const regex = /transition:([^;]+);/g;
            let newContent = content.replace(regex, (match, p1) => {
                let newP1 = p1.replace(/0\.[23456]5?s/g, '0.08s'); // 80ms is extremely snappy but retains a micro-animation
                if (newP1 !== p1) {
                    changed = true;
                }
                return `transition:${newP1};`;
            });
            
            // Also replace animation durations if any
            const animRegex = /animation:([^;]+);/g;
            newContent = newContent.replace(animRegex, (match, p1) => {
                let newP1 = p1.replace(/0\.[23456]5?s/g, '0.1s'); // 100ms for keyframe animations
                if (newP1 !== p1) {
                    changed = true;
                }
                return `animation:${newP1};`;
            });
            
            if (changed) {
                fs.writeFileSync(fullPath, newContent, 'utf8');
                console.log(`Made transitions instant in: ${fullPath}`);
            }
        }
    }
}

processDir(__dirname);
console.log('Instant UI Optimization Complete.');
