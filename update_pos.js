const fs = require('fs');
let content = fs.readFileSync('pos.js', 'utf8');

// 1. Update bindPaymentMethodToggles
content = content.replace(
    /const payMethods = document\.querySelectorAll\('\.payment-method'\);[\s\S]*?document\.getElementById\('split-calculator'\)\.style\.display = pt === 'مجزأ' \? 'flex' : 'none';\n            }\n        \);\n    }\);/m,
    `function bindPaymentMethodToggles() {
        const payMethods = document.querySelectorAll('.payment-method');
        payMethods.forEach(label => {
            label.addEventListener('click', () => {
                payMethods.forEach(l => {
                    l.classList.remove('selected');
                    l.style.borderColor = 'var(--border-light)';
                    l.style.background = 'rgba(15, 23, 42, 0.4)';
                    const iTag = l.querySelector('i');
                    if(iTag) iTag.style.color = 'var(--text-muted)';
                    const strongTag = l.querySelector('strong');
                    if(strongTag) strongTag.style.color = 'var(--text-muted)';
                });
                label.classList.add('selected');
                label.style.borderColor = 'var(--accent-blue)';
                label.style.background = 'rgba(59, 130, 246, 0.1)';
                const iTag = label.querySelector('i');
                if(iTag) iTag.style.color = 'var(--accent-blue)';
                const strongTag = label.querySelector('strong');
                if(strongTag) strongTag.style.color = 'white';
                
                // Toggle Display
                const pt = label.querySelector('input').value;
                const isDelivery = pt !== 'كاش' && pt !== 'شبكة / بطاقة' && pt !== 'مجزأ';
                document.getElementById('cash-calculator').style.display = pt === 'كاش' ? 'flex' : 'none';
                document.getElementById('split-calculator').style.display = pt === 'مجزأ' ? 'flex' : 'none';`
);

// 2. update selectedPay to isDelivery
content = content.replace(
    /const selectedPay = document\.querySelector\('\.payment-method\.selected input'\)\.value;\n            const _ct = document\.getElementById\('cart-total'\)\.innerText;/g,
    `const selectedPay = document.querySelector('.payment-method.selected input').value;
            const isDelivery = selectedPay !== 'كاش' && selectedPay !== 'شبكة / بطاقة' && selectedPay !== 'مجزأ';
            const _ct = document.getElementById('cart-total').innerText;`
);

// 3. update hungerstation logic
content = content.replace(
    /\/\/ HungerStation specific fields\n                hungerStation: selectedPay === 'هنقرستيشن',\n                hsStatus: selectedPay === 'هنقرستيشن' \? 'delivered' : undefined,\n                hsPaymentStatus: selectedPay === 'هنقرستيشن' \? 'unpaid' : undefined,\n                customerName: selectedPay === 'هنقرستيشن' \? 'هنقرستيشن' : undefined/g,
    `// Delivery Company specific fields (we use hungerStation flag for all delivery companies to maintain report compatibility)
                hungerStation: isDelivery,
                hsStatus: isDelivery ? 'delivered' : undefined,
                hsPaymentStatus: isDelivery ? 'unpaid' : undefined,
                customerName: isDelivery ? selectedPay : undefined,
                deliveryCompany: isDelivery ? selectedPay : undefined`
);

// 4. Update showNotes
content = content.replace(
    /\/\/ Show notes field for HungerStation, Network, and Bank Transfer\n            const showNotes = \(pt === 'هنقرستيشن' \|\| pt === 'شبكة \/ بطاقة'\);\n            document\.getElementById\('order-notes-field'\)\.style\.display = showNotes \? 'flex' : 'none';\n            \n            \/\/ HungerStation doesn't need calculator\n            if \(pt === 'هنقرستيشن'\) {\n                document\.getElementById\('cash-calculator'\)\.style\.display = 'none';\n                document\.getElementById\('split-calculator'\)\.style\.display = 'none';\n            }/g,
    `// Show notes field for Delivery, Network, and Bank Transfer
            const showNotes = (isDelivery || pt === 'شبكة / بطاقة');
            document.getElementById('order-notes-field').style.display = showNotes ? 'flex' : 'none';
            
            // Delivery doesn't need calculator
            if (isDelivery) {
                document.getElementById('cash-calculator').style.display = 'none';
                document.getElementById('split-calculator').style.display = 'none';
            }
        });
    });
    }`
);

// 5. Update Receipt Delivery print logic
content = content.replace(
    /if \(selectedPay === 'هنقرستيشن'\) {\n                if \(rPayment\) rPayment\.innerText = 'هنقرستيشن';\n                if \(rType\) rType\.innerText = 'طلب هنقرستيشن 🏍️';\n                if \(kType\) kType\.innerText = 'هنقرستيشن 🏍️';\n            }/g,
    `const isDeliveryLocal = selectedPay !== 'كاش' && selectedPay !== 'شبكة / بطاقة' && selectedPay !== 'مجزأ';
            if (isDeliveryLocal) {
                if (rPayment) rPayment.innerText = selectedPay;
                if (rType) rType.innerText = \`طلب \${selectedPay} 🏍️\`;
                if (kType) kType.innerText = \`\${selectedPay} 🏍️\`;
            }`
);

// 6. Insert the dynamic delivery loader and bindPaymentMethodToggles call
content = content.replace(
    /let catData = _db\.categories \|\| JSON\.parse\(localStorage\.getItem\('pos_categories'\) \|\| '\[\]'\);/g,
    `let catData = _db.categories || JSON.parse(localStorage.getItem('pos_categories') || '[]');
    
    // Render dynamic delivery companies in POS payment modal
    if (document.getElementById('dynamic-delivery-methods')) {
        let companies = _db.deliveryCompanies || [];
        if (companies.length === 0) {
            companies = [{ name: 'هنقرستيشن', isActive: true }];
        }
        let html = '';
        companies.forEach(c => {
            if (c.isActive !== false) {
                html += \`
                <label class="payment-method" style="flex:1; padding: 15px; border: 2px solid var(--border-light); border-radius: 8px; cursor: pointer; background: rgba(15, 23, 42, 0.4);">
                    <input type="radio" name="pay_method" value="\${c.name}" style="display:none;">
                    <i class="ph ph-motorcycle" style="font-size: 32px; color: var(--text-muted); display: block; margin-bottom: 8px;"></i>
                    <strong style="color: var(--text-muted)">\${c.name}</strong>
                </label>\`;
            }
        });
        const defaultHs = document.querySelector('input[value="هنقرستيشن"]')?.closest('.payment-method');
        if (defaultHs) defaultHs.remove();
        document.getElementById('dynamic-delivery-methods').innerHTML = html;
        bindPaymentMethodToggles();
    } else {
        // Fallback if not injected properly, though we expect it to be
        bindPaymentMethodToggles();
    }
    `
);

fs.writeFileSync('pos.js', content);
