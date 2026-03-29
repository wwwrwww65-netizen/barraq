const fs = require('fs');
const path = require('path');
const dir = '.';

function replaceInFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    
    // Replace Logo
    content = content.replace(/logo\.jpg/g, '1(1).png');
    
    // Replace Name
    content = content.replace(/هـــش HASH/g, 'هـــش HASH');
    
    if(content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Updated: ' + filePath);
    }
}

fs.readdirSync(dir).forEach(file => {
    if(file.endsWith('.html') || file.endsWith('.js') || file.endsWith('.json')) {
        replaceInFile(path.join(dir, file));
    }
});
