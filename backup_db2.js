const fs = require('fs');
const path = require('path');
const appData = process.env.APPDATA;
['Hash POS', 'baraaq'].forEach(folder => {
    const destDir = path.join(appData, folder); 
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }
    const src = 'pos_database.json';
    const dest = path.join(destDir, 'pos_database.json');
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log('Database backed up to:', dest);
    }
});
