import sys

def main():
    try:
        # Patch pos.html
        with open('pos.html', 'r', encoding='utf-8') as f:
            pos_html = f.read()

        pos_html = pos_html.replace(
            '<input type="text" id="product-search" placeholder="ابحث عن وجبة أو مشروب أو رمز الشريطي...">',
            '<input type="text" id="product-search" autofocus placeholder="ابحث عن منتج أو اقرأ الباركود...">'
        )
        pos_html = pos_html.replace('السوبر ماركت', 'السوبر ماركت') # just in case, already done globally? wait I didn't replace in pos.html, let's do it here:
        pos_html = pos_html.replace('المطعم', 'السوبر ماركت')
        pos_html = pos_html.replace('ابحث عن وجبة أو مشروب أو رمز الشريطي...', 'ابحث عن منتج أو اقرأ الباركود...') # in case the first replacement failed

        with open('pos.html', 'w', encoding='utf-8') as f:
            f.write(pos_html)

        print("Successfully patched pos.html")

        # Patch pos.js
        with open('pos.js', 'r', encoding='utf-8') as f:
            pos_js = f.read()

        # Update dbReadSlice for promos
        pos_js = pos_js.replace(
            "window.dbReadSlice(['categories', 'deliveryCompanies', 'products'])",
            "window.dbReadSlice(['categories', 'deliveryCompanies', 'products', 'promotions'])"
        )

        # Add promotions to catData/prodData assignments (just above it)
        pos_js = pos_js.replace(
            "const [orderId_init, _db] = await Promise.all([",
            "let activePromotions = [];\n    const [orderId_init, _db] = await Promise.all(["
        )
        pos_js = pos_js.replace(
            "catData = _db.categories ||",
            "activePromotions = _db.promotions || [];\n    catData = _db.categories ||"
        )

        pos_js = pos_js.replace(
            "const d = await window.dbReadSlice(['categories', 'products']);",
            "const d = await window.dbReadSlice(['categories', 'products', 'promotions']);\n        activePromotions = d.promotions || [];"
        )


        # Add keypress logic to searchInput
        keypress_logic = """
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = e.target.value.toLowerCase().trim();

            // Barcode Scale Parser
            if (val.startsWith('2') && val.length >= 12) {
                const itemCode = val.substring(1, 6); // 5 digit code
                const priceWeightPart = val.substring(6, 12); // next 6 digits
                // Logic depends on scale setup: assume priceWeight is price in fils/halalas
                const scalePrice = parseInt(priceWeightPart, 10) / 100;

                const product = activeProducts.find(p => p.sku && p.sku.endsWith(itemCode));
                if (product) {
                    const price = scalePrice > 0 ? scalePrice : product.price; // use scale price if valid

                    const existingItem = cart.find(item => String(item.id).trim() === String(product.id).trim());
                    if (existingItem) {
                        existingItem.qty++;
                        // For scales, usually each barcode scan is a new unique weight, so we might want to update price or treat as separate lines, but for simplicity we increase qty or we can just push a new line. Let's push a new line or override price. Actually, standard is to increase qty if price is the same, but for scale items price varies.
                        // To be safe, add as new item by giving it a unique ID variant
                        cart.push({ id: product.id + '-' + Date.now(), name: product.nameAr, price: price, imgSrc: product.image || 'placeholder.svg', qty: 1 });
                    } else {
                        cart.push({ id: product.id, name: product.nameAr, price: price, imgSrc: product.image || 'placeholder.svg', qty: 1 });
                    }
                    renderCart();
                    searchInput.value = '';
                    renderPosProducts('الكل', '');
                    return;
                }
            }

            // Regular Barcode / Exact Match
            const product = activeProducts.find(p => (p.sku && p.sku.toLowerCase() === val) || p.nameAr.toLowerCase() === val);
            if (product) {
                const existingItem = cart.find(item => String(item.id).trim() === String(product.id).trim());
                if (existingItem) {
                    existingItem.qty++;
                } else {
                    cart.push({ id: product.id, name: product.nameAr, price: parseFloat(product.price), imgSrc: product.image || 'placeholder.svg', qty: 1 });
                }
                renderCart();
                searchInput.value = '';
                renderPosProducts('الكل', '');
            }
        }
    });
"""
        pos_js = pos_js.replace(
            "searchInput.addEventListener('input', (e) => {",
            keypress_logic + "\n    searchInput.addEventListener('input', (e) => {"
        )


        # Integrate Promo Engine
        promo_logic = """
        // Apply Promotions
        let promoDiscount = 0;
        if (activePromotions && activePromotions.length > 0) {
            cart.forEach(item => {
                const matchedPromo = activePromotions.find(p => p.productId === item.id || p.productId === item.id.split('-')[0]);
                if (matchedPromo && matchedPromo.percent) {
                    promoDiscount += (item.price * item.qty) * (Number(matchedPromo.percent) / 100);
                } else if (matchedPromo && matchedPromo.fixedDiscount) {
                    promoDiscount += Number(matchedPromo.fixedDiscount) * item.qty;
                }
            });
        }

        let grossAmount = subtotal;
        let finalTotal = grossAmount - discountAmount - promoDiscount;
        if (finalTotal < 0) finalTotal = 0;
"""

        pos_js = pos_js.replace(
            """        let grossAmount = subtotal;
        let finalTotal = grossAmount - discountAmount;
        if (finalTotal < 0) finalTotal = 0;""",
            promo_logic
        )

        savings_ui = """
        const savingsAmount = promoDiscount + discountAmount;
        let savingsEl = document.getElementById('cart-savings-display');
        if (!savingsEl) {
            savingsEl = document.createElement('div');
            savingsEl.id = 'cart-savings-display';
            savingsEl.style.color = '#10b981';
            savingsEl.style.fontWeight = 'bold';
            savingsEl.style.padding = '10px 20px';
            document.querySelector('.cart-summary').insertBefore(savingsEl, document.querySelector('.summary-line.tax'));
        }
        if (savingsAmount > 0) {
            savingsEl.innerText = `إجمالي التوفير: ${formatCurrency(savingsAmount)}`;
            savingsEl.style.display = 'block';
        } else {
            savingsEl.innerText = '';
            savingsEl.style.display = 'none';
        }
"""
        pos_js = pos_js.replace(
            "currentFinalTotal = finalTotal; // Keep track for calculations",
            "currentFinalTotal = finalTotal; // Keep track for calculations\n" + savings_ui
        )

        with open('pos.js', 'w', encoding='utf-8') as f:
            f.write(pos_js)

        print("Successfully patched pos.js")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
