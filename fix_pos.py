import re

with open('e:/baraaq/pos.js', 'r', encoding='utf8') as f:
    content = f.read()

# 1. Update UI toggles
content = re.sub(
    r"// Toggle Display.*?if \(pt === 'هنقرستيشن'\) \{\s*document\.getElementById\('cash-calculator'\)\.style\.display = 'none';\s*document\.getElementById\('split-calculator'\)\.style\.display = 'none';\s*\}",
    """// Toggle Display
            const pt = label.querySelector('input').value;
            const isDelivery = pt !== 'كاش' && pt !== 'شبكة / بطاقة' && pt !== 'مجزأ';
            document.getElementById('cash-calculator').style.display = pt === 'كاش' ? 'flex' : 'none';
            document.getElementById('split-calculator').style.display = pt === 'مجزأ' ? 'flex' : 'none';
            
            // Show notes field for Delivery, Network, and Bank Transfer
            const showNotes = (isDelivery || pt === 'شبكة / بطاقة');
            document.getElementById('order-notes-field').style.display = showNotes ? 'flex' : 'none';
            
            // Delivery doesn't need calculator
            if (isDelivery) {
                document.getElementById('cash-calculator').style.display = 'none';
                document.getElementById('split-calculator').style.display = 'none';
            }""",
    content,
    flags=re.DOTALL
)

# 2. Update isDelivery for order creation
content = re.sub(
    r"const selectedPay = document\.querySelector\('\.payment-method\.selected input'\)\.value;\s*const _ct = document\.getElementById\('cart-total'\)\.innerText;",
    """const selectedPay = document.querySelector('.payment-method.selected input').value;
            const isDelivery = selectedPay !== 'كاش' && selectedPay !== 'شبكة / بطاقة' && selectedPay !== 'مجزأ';
            const _ct = document.getElementById('cart-total').innerText;""",
    content
)

# 3. Update order fields
content = re.sub(
    r"// HungerStation specific fields\s*hungerStation: selectedPay === 'هنقرستيشن',\s*hsStatus: selectedPay === 'هنقرستيشن' \? 'delivered' : undefined,\s*hsPaymentStatus: selectedPay === 'هنقرستيشن' \? 'unpaid' : undefined,\s*customerName: selectedPay === 'هنقرستيشن' \? 'هنقرستيشن' : undefined",
    """// Delivery Company specific fields (we use hungerStation flag for all delivery companies to maintain report compatibility)
                hungerStation: isDelivery,
                hsStatus: isDelivery ? 'delivered' : undefined,
                hsPaymentStatus: isDelivery ? 'unpaid' : undefined,
                customerName: isDelivery ? selectedPay : undefined,
                deliveryCompany: isDelivery ? selectedPay : undefined""",
    content
)

# 4. Update receipt print
content = re.sub(
    r"// If HungerStation, add special marker\s*if \(selectedPay === 'هنقرستيشن'\) \{\s*if \(rPayment\) rPayment\.innerText = 'هنقرستيشن';\s*if \(rType\) rType\.innerText = 'طلب هنقرستيشن 🏍️';\s*if \(kType\) kType\.innerText = 'هنقرستيشن 🏍️';\s*\}",
    """// If Delivery, add special marker
        const isDeliveryLocal = selectedPay !== 'كاش' && selectedPay !== 'شبكة / بطاقة' && selectedPay !== 'مجزأ';
        if (isDeliveryLocal) {
            const rPayment = document.getElementById('r-payment-method');
            const rType = document.getElementById('r-type');
            const kType = document.getElementById('k-type');
            if (rPayment) rPayment.innerText = selectedPay;
            if (rType) rType.innerText = `طلب ${selectedPay} 🏍️`;
            if (kType) kType.innerText = `${selectedPay} 🏍️`;
        }""",
    content
)

with open('e:/baraaq/pos.js', 'w', encoding='utf8') as f:
    f.write(content)

print("Done")
