const fs = require('fs');

const content = fs.readFileSync('e:/baraaq/pos.js', 'utf8');
const lines = content.split('\r\n');

const newFunc = [
'    async function generateOrderId() {',
'        try {',
'            const dbData = await window.dbRead();',
'            const ord = dbData.orders || [];',
'            ',
'            let maxId = 0;',
'            let newestOrder = null;',
'            ',
'            for (let o of ord) {',
'                if (!newestOrder || o.timestamp > newestOrder.timestamp) {',
'                    newestOrder = o;',
'                }',
'                if (o.orderId) {',
'                    const numMatch = String(o.orderId).match(/\\d+/);',
'                    if (numMatch) {',
'                        const num = parseInt(numMatch[0], 10);',
'                        if (num > maxId) maxId = num;',
'                    }',
'                }',
'            }',
'            ',
'            zatcaMeta.icv = maxId > 0 ? maxId + 1 : 1;',
'',
'            if (newestOrder && newestOrder.invoiceHash) {',
'                zatcaMeta.pih = newestOrder.invoiceHash;',
'            }',
'',
'            zatcaMeta.uuid = crypto.randomUUID();',
'            return "#INV-" + String(zatcaMeta.icv).padStart(5, "0");',
'        } catch(e) {',
'            console.error(e);',
'            zatcaMeta.icv++;',
'            zatcaMeta.uuid = crypto.randomUUID();',
'            return "#INV-" + String(zatcaMeta.icv).padStart(5, "0");',
'        }',
'    }'
];

// Replace lines 60 to 78 (indices 59 to 77)
lines.splice(59, 19, ...newFunc);

fs.writeFileSync('e:/baraaq/pos.js', lines.join('\r\n'));
console.log('pos.js generateOrderId fixed!');
