import os
import re

# 1. Update dashboard.js for breakdown
fp = 'e:/baraaq/dashboard.js'
if os.path.exists(fp):
    with open(fp, 'r', encoding='utf8') as f:
        content = f.read()
    
    # Add breakdown logic to splitOrderAmounts
    content = content.replace(
        "return { cash: 0, network: 0, hungerstation: 0 };",
        "return { cash: 0, network: 0, hungerstation: 0, deliveryBreakdown: {} };"
    )
    
    content = content.replace(
        "if (o.orderType === 'كاش') amounts.cash += total;",
        "if (o.orderType === 'كاش') amounts.cash += total;\n        else if (o.orderType !== 'شبكة / بطاقة' && o.orderType !== 'مجزأ') {\n            const co = o.deliveryCompany || o.orderType || 'توصيل';\n            amounts.deliveryBreakdown[co] = (amounts.deliveryBreakdown[co] || 0) + total;\n        }"
    )

    # Update print logic
    if 'function printDayReport' in content:
        content = re.sub(
            r"(let deliveryPrintRows = '';)",
            r"let deliveryPrintRows = '';\n    if (amounts.deliveryBreakdown) {\n        for (const [co, amt] of Object.entries(amounts.deliveryBreakdown)) {\n            deliveryPrintRows += `<tr><td>${co} (غير مدفوع)</td><td>${amt.toFixed(2)} ر.س</td></tr>`;\n        }\n    }",
            content
        )

    with open(fp, 'w', encoding='utf8') as f:
        f.write(content)

# 2. Create top-items files
with open('e:/baraaq/top-items.html', 'w', encoding='utf8') as f:
    f.write("""<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>الأصناف الأكثر مبيعاً</title>
    <link rel="stylesheet" href="top-items.css">
</head>
<body>
    <div class="top-items-container">
        <h1>الأصناف الأكثر مبيعاً</h1>
        <div id="top-items-grid"></div>
    </div>
    <script src="top-items.js"></script>
</body>
</html>""")

with open('e:/baraaq/top-items.js', 'w', encoding='utf8') as f:
    f.write("""const { ipcRenderer } = require('electron');
document.addEventListener('DOMContentLoaded', async () => {
    const orders = await ipcRenderer.invoke('db-get-orders');
    console.log('Orders loaded:', orders.length);
});""")

with open('e:/baraaq/top-items.css', 'w', encoding='utf8') as f:
    f.write(".top-items-container { padding: 20px; }")

# 3. Update index.html link
fp_idx = 'e:/baraaq/index.html'
if os.path.exists(fp_idx):
    with open(fp_idx, 'r', encoding='utf8') as f:
        content = f.read()
    content = content.replace('href="sales.html" class="btn-text" style="text-decoration:none', 'href="top-items.html" class="btn-text" style="text-decoration:none')
    with open(fp_idx, 'w', encoding='utf8') as f:
        f.write(content)
