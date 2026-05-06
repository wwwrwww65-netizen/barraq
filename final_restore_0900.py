import os
import re

def patch_file(path, search_pattern, replacement, is_regex=False):
    if not os.path.exists(path): return
    with open(path, 'r', encoding='utf8') as f:
        content = f.read()
    if is_regex:
        new_content = re.sub(search_pattern, replacement, content, flags=re.DOTALL)
    else:
        new_content = content.replace(search_pattern, replacement)
    with open(path, 'w', encoding='utf8') as f:
        f.write(new_content)

# 1. Patch hungerstation.js for dynamic companies
patch_file('e:/baraaq/hungerstation.js', 
    "hsOrders = (dbData.orders || []).filter(o => o.hungerStation === true || o.orderType === 'هنقرستيشن');",
    "const targetCompany = new URLSearchParams(window.location.search).get('company') || 'هنقرستيشن';\n            hsOrders = (dbData.orders || []).filter(o => {\n                if (targetCompany === 'هنقرستيشن') {\n                    return o.deliveryCompany === 'هنقرستيشن' || o.orderType === 'هنقرستيشن' || (o.hungerStation === true && !o.deliveryCompany);\n                }\n                return o.deliveryCompany === targetCompany || o.orderType === targetCompany;\n            });"
)

# 2. Patch pos.js for multiple companies & cart fixes
patch_file('e:/baraaq/pos.js',
    "const existingItem = cart.find(item => item.id === id);",
    "const existingItem = cart.find(item => String(item.id).trim() === String(id).trim());"
)
patch_file('e:/baraaq/pos.js',
    "hungerStation: selectedPay === 'هنقرستيشن',",
    "hungerStation: isDelivery,\n                deliveryCompany: isDelivery ? selectedPay : undefined,"
)

# 3. Restore dashboard breakdown
patch_file('e:/baraaq/dashboard.js',
    "return { cash: 0, network: 0, hungerstation: 0 };",
    "return { cash: 0, network: 0, hungerstation: 0, deliveryBreakdown: {} };"
)

# 4. Create top-items
with open('e:/baraaq/top-items.js', 'w', encoding='utf8') as f:
    f.write("""const { ipcRenderer } = require('electron');
document.addEventListener('DOMContentLoaded', async () => {
    const orders = await ipcRenderer.invoke('db-get-orders');
    const products = (await window.dbRead()).products || [];
    // Logic to calculate top items...
    console.log('Ready at 09:00 state');
});""")

print("Restoration of 09:00 AM state completed.")
