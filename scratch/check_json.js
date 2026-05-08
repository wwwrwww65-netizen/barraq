const fs = require('fs');
const path = 'C:\\Users\\lenovo\\AppData\\Roaming\\baraaq\\pos_database.json';
try {
    const content = fs.readFileSync(path, 'utf8');
    JSON.parse(content);
    console.log('JSON is valid');
} catch (e) {
    console.error('JSON Error:', e.message);
    console.log('Error position:', e.message.match(/at position (\d+)/)?.[1]);
}
