// Updated thermal receipt printing function with international 80mm standards
// This file contains the improved printCustomerReceipt function

/** أسماء افتراضية في الإعدادات = يُعتبر المستخدم لم يُخصّص هوية المنشأة بعد */
const DEFAULT_RESTAURANT_NAMES = new Set([
  'هش HASH',
  'هـــش HASH',
  'مطابخ ومحائذ هـــش HASH',
]);

/**
 * تذييل الطباعة: اسم المنشأة عند التخصيص (اسم غير افتراضي أو شعار ليس 1111.png / base64)، وإلا اسم البرنامج.
 * @param {string|null} settingsRaw — JSON من localStorage restaurant_settings
 * @param {string} displayRestName — الاسم المعروض أعلى الإيصال
 * @param {string|null} reportSuffix — مثل «تقرير وردية» للتقارير؛ null للإيصال العادي
 */
function getReceiptFooterLine(settingsRaw, displayRestName, reportSuffix) {
  let personalized = false;
  if (settingsRaw) {
    try {
      const s = JSON.parse(settingsRaw);
      const name = (s.name || '').trim();
      if (name && !DEFAULT_RESTAURANT_NAMES.has(name)) personalized = true;
      const lg = s.logo;
      if (typeof lg === 'string') {
        if (lg.startsWith('data:')) personalized = true;
        else if (lg && lg !== '1111.png') personalized = true;
      }
    } catch (e) { /* ignore */ }
  }
  const dn = (displayRestName || '').trim();
  if (reportSuffix) {
    if (personalized) return `${dn || 'منشأة'} — ${reportSuffix}`;
    return `Hash POS — ${reportSuffix}`;
  }
  if (personalized) return dn || 'منشأة';
  return 'Hash POS — نظام نقاط البيع';
}

function escapeHtmlPrint(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** هل يعرض السطر مبلغاً غير صفري؟ (يعمل بدون HashCurrency في اختبارات Node) */
function isNonZeroMoneyDisplay(s) {
  if (!s) return false;
  if (typeof globalThis.HashCurrency !== 'undefined' && HashCurrency.parseLoose) {
    const v = HashCurrency.parseLoose(s);
    return Number.isFinite(v) && Math.abs(v) > 0.0001;
  }
  const m = String(s).match(/-?\d+(?:\.\d+)?/);
  return !!(m && parseFloat(m[0]) > 0.0001);
}

/**
 * @param {object} [receiptSnap] — إن وُجد يُبنى HTML منه (أمثل قبل مسح السلة/بعد IPC طويل). وإلا يُقرأ من عناصر #r-* في الصفحة.
 */
async function printCustomerReceipt(receiptSnap) {
    const { ipcRenderer } = require('electron');
    const path = require('path');
    const fs = require('fs');
    
    // Get restaurant settings for logo and info
    const sysSet = localStorage.getItem('restaurant_settings');
    let restName = 'مطابخ ومحائذ هـــش HASH';
    let restTax = '310000000000003';
    let restBranch = 'شارع المعارض جوار محطة مزايا';
    let restPhone = '';
    let logoBase64 = '';
    
    if (sysSet) {
        try {
            const s = JSON.parse(sysSet);
            if (s.name) restName = s.name;
            if (s.taxNumber) {
                restTax = s.taxNumber;
                console.log('   ✓ Tax number loaded from settings:', restTax);
            } else {
                console.warn('   ⚠️ No tax number in settings, using default:', restTax);
            }
            if (s.branch) restBranch = s.branch;
            if (s.phone) restPhone = s.phone;
            
            // Handle logo - convert to base64 if needed
            if (s.logo && s.logo.startsWith('data:')) {
                logoBase64 = s.logo; // Already base64
            } else if (s.logo) {
                // Convert image file to base64
                try {
                    const logoPath = path.join(__dirname, s.logo);
                    if (fs.existsSync(logoPath)) {
                        const logoBuffer = fs.readFileSync(logoPath);
                        const ext = path.extname(s.logo).toLowerCase();
                        const mimeType = ext === '.png' ? 'image/png' : 
                                       ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
                        logoBase64 = `data:${mimeType};base64,${logoBuffer.toString('base64')}`;
                    }
                } catch(e) {
                    console.error('Logo conversion error:', e);
                }
            }
        } catch(e){}
    }
    
    // If no logo from settings, use default and convert to base64
    if (!logoBase64) {
        try {
            const defaultLogo = path.join(__dirname, '1111.png');
            if (fs.existsSync(defaultLogo)) {
                const logoBuffer = fs.readFileSync(defaultLogo);
                logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
            }
        } catch(e) {
            console.error('Default logo error:', e);
        }
    }

    console.log('🖨️  Preparing thermal receipt...');
    console.log('   Logo:', logoBase64 ? '✓ Base64 encoded (' + logoBase64.length + ' bytes)' : '✗ No logo');
    console.log('   Restaurant:', restName);
    console.log('   Tax:', restTax);

    const footerLine = getReceiptFooterLine(sysSet, restName, null);

    // Build complete HTML for thermal printer (80mm width)
    // Following international thermal receipt standards
    const html = buildThermalReceiptHTML(logoBase64, restName, restTax, restBranch, restPhone, receiptSnap, footerLine);

    try {
        const cashierPrinter = localStorage.getItem('cashier_printer') || '';
        console.log('📤 Sending to printer:', cashierPrinter || 'Default');
        
        await ipcRenderer.invoke('print-to-device', { html: html, printerName: cashierPrinter });
        
        console.log('✅ Print job sent successfully');
    } catch(e) { 
        console.error('❌ Customer receipt print failed:', e); 
        alert('حدث خطأ في الطباعة: ' + e.message);
    }
}

function buildThermalReceiptHTML(logoBase64, restName, restTax, restBranch, restPhone, snap, footerLine) {
    const footerText = footerLine != null
      ? footerLine
      : getReceiptFooterLine(
          typeof localStorage !== 'undefined' ? localStorage.getItem('restaurant_settings') : null,
          restName,
          null
        );
    const el = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
    const rType = snap ? snap.orderType : (el('r-type') ? el('r-type').innerText : '');
    const rOrderId = snap ? snap.orderId : (el('r-order-id') ? el('r-order-id').innerText : '');
    const rDate = snap ? snap.date : (el('r-date') ? el('r-date').innerText : '');
    const rItemsHtml = snap ? snap.itemsHtml : (el('r-items') ? el('r-items').innerHTML : '');
    const rSubtotal = snap && snap.subtotalText
        ? snap.subtotalText
        : (el('r-subtotal') ? el('r-subtotal').innerText : (el('cart-subtotal') ? el('cart-subtotal').innerText : ''));
    const rTotal = snap ? snap.totalText : (el('r-total') ? el('r-total').innerText : '');
    const rDiscount = snap ? snap.discountText : (el('r-discount') ? el('r-discount').innerText : '');
    const rTaxLabel = snap ? snap.taxLabel : (el('r-tax-rate-label') ? el('r-tax-rate-label').innerText : '');
    const rTax = snap ? snap.taxText : (el('r-tax') ? el('r-tax').innerText : '');
    const rPay = snap ? snap.paymentText : (el('r-payment-method') ? el('r-payment-method').innerText : '');
    let qrSrc = '';
    if (snap && snap.qrSrc) qrSrc = snap.qrSrc;
    else {
        const qrEl = el('r-qr-code');
        qrSrc = qrEl ? qrEl.src : '';
    }
    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        
        @page {
            size: 80mm auto;
            margin: 0;
            padding: 0;
        }
        
        body {
            font-family: 'Segoe UI', 'Cairo', 'Arial', sans-serif;
            margin: 0;
            padding: 0;
            width: 80mm;
            max-width: 80mm;
            min-width: 72mm;
            background: #ffffff;
            color: #000000;
            direction: rtl;
            text-align: center;
            line-height: 1.35;
            font-size: 12px;
            -webkit-font-smoothing: antialiased;
        }
        
        .receipt-wrapper {
            width: 80mm;
            max-width: 80mm;
            padding: 3mm 2mm;
            margin: 0 auto;
        }
        
        .store-logo {
            width: 15mm;
            height: 15mm;
            max-width: 15mm;
            max-height: 15mm;
            object-fit: contain;
            margin: 0 auto 2mm auto;
            display: block;
            filter: grayscale(100%) contrast(120%);
        }
        
        .store-name {
            font-size: 16px;
            font-weight: 900;
            margin: 2mm 0 1mm 0;
            line-height: 1.2;
        }
        
        .store-info {
            font-size: 10px;
            margin: 0.5mm 0;
            line-height: 1.4;
        }
        
        .tax-number {
            font-size: 10px;
            font-weight: 700;
            margin: 1mm 0;
        }
        
        .divider {
            border-top: 1.5px dashed #000000;
            margin: 3mm 0;
            width: 100%;
        }
        
        .divider-thick {
            border-top: 2px solid #000000;
            margin: 3mm 0;
            width: 100%;
        }
        
        .order-type {
            font-size: 14px;
            font-weight: 800;
            margin: 2mm 0 1mm 0;
        }
        
        .order-number {
            font-size: 13px;
            font-weight: 700;
            margin: 1mm 0;
        }
        
        .order-date {
            font-size: 9px;
            margin: 1mm 0;
            text-align: right;
        }
        
        .items-table {
            width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
            margin: 2mm 0;
            font-size: 11px;
        }
        
        .items-table thead th {
            padding: 2mm 1mm;
            border-bottom: 1.5px solid #000000;
            font-weight: 800;
            font-size: 10px;
            text-align: center;
        }
        
        .items-table tbody td {
            padding: 1.5mm 1mm;
            text-align: center;
            vertical-align: top;
            overflow-wrap: anywhere;
            word-break: break-word;
        }
        
        .items-table tbody tr {
            border-bottom: 0.5px dotted #cccccc;
        }
        
        .item-name {
            text-align: right !important;
            font-weight: 600;
            word-wrap: break-word;
            max-width: 35mm;
        }
        
        .item-qty {
            text-align: center !important;
            font-weight: 700;
            min-width: 10mm;
        }
        
        .item-price {
            text-align: left !important;
            font-weight: 600;
            min-width: 15mm;
        }
        
        .totals-section {
            margin: 2mm 0;
            font-size: 11px;
        }
        
        .total-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1mm 0;
            gap: 2mm;
        }
        
        .total-label {
            text-align: right;
            flex: 1;
        }
        
        .total-value {
            text-align: left;
            font-weight: 600;
            min-width: 20mm;
        }
        
        .grand-total {
            font-size: 14px;
            font-weight: 900;
            border-top: 1.5px solid #000000;
            padding-top: 2mm;
            margin-top: 1mm;
        }
        
        .payment-method {
            font-size: 12px;
            font-weight: 700;
            margin: 2mm 0;
            padding: 1.5mm;
            border: 1px solid #000000;
            display: inline-block;
            min-width: 40mm;
        }
        
        .qr-container {
            margin: 3mm auto;
            text-align: center;
        }
        
        .qr-code {
            width: 25mm;
            height: 25mm;
            max-width: 25mm;
            max-height: 25mm;
            margin: 0 auto;
            display: block;
            image-rendering: -webkit-optimize-contrast;
            image-rendering: crisp-edges;
        }
        
        .footer-message {
            font-size: 11px;
            font-weight: 700;
            margin: 3mm 0 1mm 0;
            line-height: 1.4;
        }
        
        .powered-by {
            font-size: 8px;
            color: #666666;
            margin: 1mm 0;
        }
    </style>
</head>
<body>
    <div class="receipt-wrapper">
        ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" class="store-logo">` : ''}
        
        <div class="store-name">${restName}</div>
        <div class="tax-number">الرقم الضريبي: ${restTax}</div>
        <div class="store-info">${restBranch}</div>
        ${restPhone ? `<div class="store-info">هاتف: ${restPhone}</div>` : ''}
        
        <div class="divider"></div>
        
        <div class="order-type">${rType}</div>
        <div class="order-number">رقم الطلب: ${rOrderId}</div>
        <div class="order-date">${rDate}</div>
        
        <div class="divider-thick"></div>
        
        <table class="items-table">
            <thead>
                <tr>
                    <th style="text-align: right;">الصنف</th>
                    <th style="width: 12mm;">كمية</th>
                    <th style="width: 18mm;">السعر</th>
                </tr>
            </thead>
            <tbody>
                ${rItemsHtml}
            </tbody>
        </table>
        
        <div class="divider-thick"></div>
        
        <div class="totals-section">
            <div class="total-row">
                <span class="total-label">مجموع الأصناف:</span>
                <span class="total-value">${rSubtotal || rTotal}</span>
            </div>
            ${(() => {
                if (isNonZeroMoneyDisplay(rDiscount)) {
                    return `
                    <div class="total-row">
                        <span class="total-label">الخصم:</span>
                        <span class="total-value">${rDiscount}</span>
                    </div>`;
                }
                return '';
            })()}
            <div class="total-row">
                <span class="total-label">${rTaxLabel}</span>
                <span class="total-value">${rTax}</span>
            </div>
            <div class="total-row grand-total">
                <span class="total-label">الإجمالي النهائي (شامل الضريبة):</span>
                <span class="total-value">${rTotal}</span>
            </div>
        </div>
        
        <div class="divider"></div>
        
        <div class="payment-method">
            ${rPay}
        </div>
        
        <div class="qr-container">
            ${(() => {
                if (qrSrc && qrSrc.length > 100) {
                    console.log('✅ Thermal receipt: QR Code found, length:', qrSrc.length);
                    return `<img id="thermal-qr" src="${qrSrc}" class="qr-code" alt="QR">`;
                }
                console.warn('⚠️ Thermal receipt: QR Code not found or empty, src length:', qrSrc ? qrSrc.length : 0);
                return '<div style="color:red; font-size:10px; margin:3mm 0;">QR Code غير متوفر</div>';
            })()}
        </div>
        
        <div class="footer-message">
            شكراً لزيارتكم!<br>
            بالهناء والشفاء
        </div>
        
        <div class="powered-by">${escapeHtmlPrint(footerText)}</div>
    </div>
</body>
</html>`;
}

// Export for use in pos.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { printCustomerReceipt, buildThermalReceiptHTML, getReceiptFooterLine, escapeHtmlPrint };
}
