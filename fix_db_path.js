const fs = require('fs');
const path = require('path');
const dir = '.';

function fixRenderer(content) {
  let modified = content;
  // Account for different var names
  modified = modified.replace(/nodePath\.join\(__dirname,\s*'pos_database\.json'\)/g, "require('electron').ipcRenderer.sendSync('get-db-path')");
  modified = modified.replace(/_path\.join\(__dirname,\s*'pos_database\.json'\)/g, "require('electron').ipcRenderer.sendSync('get-db-path')");
  modified = modified.replace(/path\.join\(__dirname,\s*'pos_database\.json'\)/g, "require('electron').ipcRenderer.sendSync('get-db-path')");
  
  // Login.js fetch
  modified = modified.replace(/await\s+fetch\(\s*'pos_database\.json'\s*\)/g, "{ json: async () => JSON.parse(require('fs').readFileSync(require('electron').ipcRenderer.sendSync('get-db-path'),'utf8')) }");
  return modified;
}

fs.readdirSync(dir).forEach(file => {
  if((file.endsWith('.js') || file.endsWith('.html')) && file !== 'main.js' && file !== 'database.js' && file !== 'fix_db_path.js') {
    let original = fs.readFileSync(file, 'utf8');
    let content = fixRenderer(original);
    if(original !== content) {
      fs.writeFileSync(file, content, 'utf8');
      console.log('Fixed:', file);
    }
  }
});
