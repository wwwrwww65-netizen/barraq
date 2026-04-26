const fs = require('fs');
let mainJs = fs.readFileSync('e:/baraaq/main.js', 'utf8');

const startTag = 'async function deliverWhatsAppMessage(data) {';
const endTag = 'async function teardownWaClient() {';

const startIdx = mainJs.indexOf(startTag);
const endIdx = mainJs.indexOf(endTag);

if (startIdx > -1 && endIdx > -1) {
    const deliverCode = fs.readFileSync('e:/baraaq/deliver.js', 'utf8');
    mainJs = mainJs.substring(0, startIdx) + deliverCode + '\\n' + mainJs.substring(endIdx);
    fs.writeFileSync('e:/baraaq/main.js', mainJs, 'utf8');
    console.log('Fixed!');
} else {
    console.log('Not found!');
}
