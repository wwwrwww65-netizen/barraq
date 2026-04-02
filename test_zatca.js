const crypto = require('crypto');
function getQRBase64(sellerName, vatReg, timestamp, total, vat) {
    function tlv(tag, val) {
        const buf = Buffer.from(String(val), 'utf8');
        return Buffer.concat([Buffer.from([tag, buf.length]), buf]);
    }
    try {
        const tlvs = Buffer.concat([
            tlv(1, sellerName),
            tlv(2, vatReg),
            tlv(3, timestamp),
            tlv(4, total),
            tlv(5, vat)
        ]);
        return tlvs.toString('base64');
    } catch(e) { return e.toString(); }
}
console.log('Test QR TLV:', getQRBase64('هش HASH', '310000000000003', new Date().toISOString(), '115.00', '15.00'));

let zatcaMeta = { icv: 1, uuid: crypto.randomUUID(), pih: 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==' };
const orderId = '#INV-00001';
const totalOrder = 115.00;
const now = new Date();
const invoiceHash = crypto.createHash('sha256').update(zatcaMeta.uuid + orderId + totalOrder + now.getTime()).digest('base64');
console.log('Test Hash:', invoiceHash);
