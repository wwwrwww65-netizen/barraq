document.addEventListener('DOMContentLoaded', () => {

    /* ===============================
       POS State Management
    =============================== */
    let cart = [];
    let currentOrderType = 'محلي';
    let discountAmount = 0;
    const TAX_RATE = 0.15;
    let orderId = '#ORD-' + Math.floor(1000 + Math.random() * 9000); // Random Order ID for session
    document.getElementById('display-order-id').innerText = orderId;

    // Elements
    const productsGrid = document.getElementById('products-grid');
    const categoryBtns = document.querySelectorAll('.category-btn');
    const searchInput = document.getElementById('product-search');
    const cartContainer = document.getElementById('cart-items-container');
    
    // UI Formatters
    const formatCurrency = (amount) => Number(amount).toFixed(2) + ' ر.س';

    /* ===============================
       Category & Product Filtering
    =============================== */
    categoryBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Remove active class from all
            categoryBtns.forEach(b => b.classList.remove('active'));
            // Add to clicked
            const targetBtn = e.target.closest('.category-btn');
            targetBtn.classList.add('active');
            
            const category = targetBtn.dataset.category;
            filterProducts(category, searchInput.value.toLowerCase());
        });
    });

    searchInput.addEventListener('input', (e) => {
        const activeCategory = document.querySelector('.category-btn.active').dataset.category;
        filterProducts(activeCategory, e.target.value.toLowerCase());
    });

    function filterProducts(category, searchQuery) {
        const products = document.querySelectorAll('.product-card');
        products.forEach(product => {
            const pCat = product.dataset.category;
            const pName = product.dataset.name.toLowerCase();

            const matchesCategory = (category === 'الكل' || pCat === category);
            const matchesSearch = (pName.includes(searchQuery));

            if (matchesCategory && matchesSearch) {
                product.style.display = 'flex'; // It's flex column
            } else {
                product.style.display = 'none';
            }
        });
    }

    /* ===============================
       Cart Functionality
    =============================== */
    const addToCartBtns = document.querySelectorAll('.product-card .add-btn');
    const productCardsClickable = document.querySelectorAll('.product-card');

    // Make the entire card clickable, except prevent double ticking if they click the button directly
    productCardsClickable.forEach(card => {
        card.addEventListener('click', (e) => {
            if(e.target.closest('.add-btn')) return; // handled below
            addProductToCart(card);
        });
    });

    addToCartBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const card = e.target.closest('.product-card');
            addProductToCart(card);
        });
    });

    function addProductToCart(productCard) {
        const id = productCard.dataset.id;
        const name = productCard.dataset.name;
        const price = parseFloat(productCard.dataset.price);
        const imgSrc = productCard.querySelector('img').src;

        // Check if exists
        const existingItem = cart.find(item => item.id === id);
        if (existingItem) {
            existingItem.qty++;
        } else {
            cart.push({ id, name, price, imgSrc, qty: 1 });
        }
        renderCart();
    }

    // Attach listener to discount input
    const discountInput = document.getElementById('cart-discount-input');
    discountInput.addEventListener('input', (e) => {
        discountAmount = parseFloat(e.target.value) || 0;
        renderCart();
    });

    // Order Type Tabs
    const typeBtns = document.querySelectorAll('.type-btn');
    typeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            typeBtns.forEach(b => b.classList.remove('active'));
            const targetBtn = e.target.closest('.type-btn');
            targetBtn.classList.add('active');
            currentOrderType = targetBtn.dataset.type;
        });
    });

    window.updateItemQty = function(id, delta) {
        const item = cart.find(i => i.id === id.toString());
        if (item) {
            item.qty += delta;
            if (item.qty <= 0) {
                cart = cart.filter(i => i.id !== id.toString());
            }
            renderCart();
        }
    };

    window.removeItem = function(id) {
        cart = cart.filter(i => i.id !== id.toString());
        renderCart();
    };

    function renderCart() {
        cartContainer.innerHTML = '';

        if (cart.length === 0) {
            cartContainer.innerHTML = `
                <div class="empty-cart-msg" style="text-align:center; padding: 40px 20px; color: var(--text-muted);">
                    <i class="ph ph-shopping-cart" style="font-size: 48px; opacity:0.5; margin-bottom:10px;"></i>
                    <p>السلة فارغة، قم بإضافة منتجات</p>
                </div>
            `;
            updateTotals(0);
            return;
        }

        let subtotal = 0;

        cart.forEach(item => {
            const itemTotal = item.price * item.qty;
            subtotal += itemTotal;

            const itemHTML = `
                <div class="cart-item">
                    <img src="${item.imgSrc}" alt="${item.name}" class="cart-item-img">
                    <div class="item-info">
                        <h4>${item.name}</h4>
                        <span class="item-price">${formatCurrency(item.price)}</span>
                    </div>
                    <div class="item-qty">
                        <button class="qty-btn" onclick="updateItemQty('${item.id}', -1)"><i class="ph ph-minus"></i></button>
                        <span class="qty-val">${item.qty}</span>
                        <button class="qty-btn" onclick="updateItemQty('${item.id}', 1)"><i class="ph ph-plus"></i></button>
                    </div>
                    <div class="item-total">
                        ${formatCurrency(itemTotal)}
                    </div>
                    <button class="remove-btn" onclick="removeItem('${item.id}')"><i class="ph ph-trash"></i></button>
                </div>
            `;
            cartContainer.insertAdjacentHTML('beforeend', itemHTML);
        });

        // Ensure scrolling to bottom if many items (optional UX improvement)
        cartContainer.scrollTop = cartContainer.scrollHeight;

        updateTotals(subtotal);
    }

    function updateTotals(subtotal) {
        // Reverse calculation for tax: if the item price *Includes* 15% VAT
        // Total = sum of items (Subtotal matches total without discount)
        // Let's assume the POS items prices ARE final prices including VAT.
        // So Subtotal = Total before discount. Tax = Total / 1.15 * 0.15
        
        let grossAmount = subtotal;
        let finalTotal = grossAmount - discountAmount;
        if (finalTotal < 0) finalTotal = 0;

        let taxAmount = finalTotal - (finalTotal / (1 + TAX_RATE));

        document.getElementById('cart-subtotal').innerText = formatCurrency(grossAmount);
        document.getElementById('cart-tax').innerText = formatCurrency(taxAmount);
        document.getElementById('cart-total').innerText = formatCurrency(finalTotal);
        document.getElementById('btn-checkout-total').innerText = Number(finalTotal).toFixed(0); 
        // Sync with checkout modal
        document.getElementById('checkout-total-display').innerText = formatCurrency(finalTotal);
        
        calculateChange();
    }


    /* ===============================
       Checkout Modal & Payment
    =============================== */
    const btnCheckout = document.getElementById('btn-checkout');
    const modalCheckout = document.getElementById('checkout-modal');
    const btnCloseCheckout = document.getElementById('btn-close-checkout');

    btnCheckout.addEventListener('click', () => {
        if (cart.length === 0) {
            alert('السلة فارغة! يجب إضافة منتجات أولاً.');
            return;
        }
        modalCheckout.classList.add('active');
        calculateChange();
    });

    btnCloseCheckout.addEventListener('click', () => {
        modalCheckout.classList.remove('active');
    });

    // Payment Methods Toggle styling
    const payMethods = document.querySelectorAll('.payment-method');
    payMethods.forEach(label => {
        label.addEventListener('click', () => {
            payMethods.forEach(l => {
                l.classList.remove('selected');
                l.style.borderColor = 'var(--border-light)';
                l.style.background = 'rgba(15, 23, 42, 0.4)';
                l.querySelector('i').style.color = 'var(--text-muted)';
                l.querySelector('strong').style.color = 'var(--text-muted)';
            });
            label.classList.add('selected');
            label.style.borderColor = 'var(--accent-blue)';
            label.style.background = 'rgba(59, 130, 246, 0.1)';
            label.querySelector('i').style.color = 'var(--accent-blue)';
            label.querySelector('strong').style.color = 'white';
            
            // Hide cash calculator if network
            const isCash = label.querySelector('input').value === 'كاش';
            document.getElementById('cash-calculator').style.opacity = isCash ? '1' : '0.3';
            document.getElementById('cash-calculator').style.pointerEvents = isCash ? 'auto' : 'none';
        });
    });

    // Cash Calculator
    const cashReceivedInput = document.getElementById('cash-received');
    const cashChangeDisplay = document.getElementById('cash-change');

    function calculateChange() {
        const totalStr = document.getElementById('cart-total').innerText.replace(' ر.س', '');
        const total = parseFloat(totalStr) || 0;
        const received = parseFloat(cashReceivedInput.value) || 0;
        
        let change = received - total;
        if (change < 0 || isNaN(change)) change = 0;

        cashChangeDisplay.innerText = formatCurrency(change);
    }

    cashReceivedInput.addEventListener('input', calculateChange);


    /* ===============================
       Printing / Receipts 
    =============================== */
    const btnConfirmPay = document.getElementById('btn-confirm-payment');

    btnConfirmPay.addEventListener('click', async () => {
        // Prepare Printable Templates
        preparePrintTemplates();

        btnConfirmPay.innerHTML = '<i class="ph ph-spinner ph-spin"></i> جاري توليد الفواتير...';
        btnConfirmPay.disabled = true;

        try {
            await downloadReceipt('receipt-customer', 'فاتورة_العميل');
            await downloadReceipt('receipt-kitchen', 'طلب_المطبخ');
            
            // Save to LocalStorage for Sales page
            const savedOrders = JSON.parse(localStorage.getItem('pos_orders') || '[]');
            const now = new Date();
            const selectedPay = document.querySelector('.payment-method.selected input').value;
            savedOrders.push({
                orderId: orderId,
                date: now.toLocaleDateString('ar-SA') + " " + now.toLocaleTimeString('ar-SA'),
                timestamp: now.getTime(),
                type: currentOrderType,
                paymentMethod: selectedPay,
                total: parseFloat(document.getElementById('cart-total').innerText.replace(' ر.س', '')),
                items: cart.length
            });
            localStorage.setItem('pos_orders', JSON.stringify(savedOrders));
            
            alert('تمت العملية بنجاح! تم حفظ المبيعات وتحميل الفواتير.');
            // Reset
            cart = [];
            discountAmount = 0;
            discountInput.value = '';
            cashReceivedInput.value = '';
            renderCart();
            modalCheckout.classList.remove('active');

            // Generate new order ID for next order
            orderId = '#ORD-' + Math.floor(1000 + Math.random() * 9000);
            document.getElementById('display-order-id').innerText = orderId;

        } catch(e) {
            console.error("Print Failed", e);
            alert("فشلت عملية حفظ الفاتورة");
        } finally {
            btnConfirmPay.innerHTML = '<i class="ph ph-check-circle"></i> تأكيد الدفع وطباعة الفواتير';
            btnConfirmPay.disabled = false;
        }
    });

    // Print Receipt directly without checkout
    document.getElementById('btn-print-receipt').addEventListener('click', async () => {
        if(cart.length === 0) return alert('السلة فارغة!');
        document.getElementById('btn-print-receipt').innerHTML = '<i class="ph ph-spinner ph-spin"></i>';
        preparePrintTemplates();
        await downloadReceipt('receipt-customer', 'مسودة_فاتورة_العميل');
        await downloadReceipt('receipt-kitchen', 'طلب_المطبخ');
        document.getElementById('btn-print-receipt').innerHTML = '<i class="ph ph-printer"></i> طباعة للحفظ';
    });

    function preparePrintTemplates() {
        // Date
        const now = new Date();
        const dateStr = now.toLocaleDateString('ar-SA') + " " + now.toLocaleTimeString('ar-SA');
        
        // Common
        document.getElementById('r-date').innerText = dateStr;
        document.getElementById('k-date').innerText = dateStr;
        document.getElementById('r-order-id').innerText = orderId;
        document.getElementById('k-order-id').innerText = orderId;
        document.getElementById('r-type').innerText = "طلب " + currentOrderType;
        document.getElementById('k-type').innerText = "طلب " + currentOrderType;

        const tableVal = document.getElementById('cart-table-select').value;
        document.getElementById('k-table').innerText = tableVal ? 'لـ: ' + tableVal : '';
        document.getElementById('k-table').style.display = tableVal ? 'block' : 'none';

        // Payment Method from selected modal option
        const selectedPay = document.querySelector('.payment-method.selected input').value;
        document.getElementById('r-payment-method').innerText = selectedPay;

        // Fill Items
        const rItems = document.getElementById('r-items');
        const kItems = document.getElementById('k-items');
        rItems.innerHTML = ''; kItems.innerHTML = '';

        cart.forEach(item => {
            rItems.innerHTML += `
                <tr style="border-bottom: 1px dashed #ccc;">
                    <td style="padding: 5px 0;">${item.name}</td>
                    <td style="text-align: center;">${item.qty}x</td>
                    <td>${formatCurrency(item.price * item.qty)}</td>
                </tr>
            `;

            kItems.innerHTML += `
                <tr style="border-bottom: 1px dashed #000;">
                    <td style="padding: 5px 0;">🔴 ${item.name}</td>
                    <td style="text-align: center; font-size:24px; padding: 5px;">${item.qty}</td>
                </tr>
            `;
        });

        // Totals for customer
        document.getElementById('r-total').innerText = document.getElementById('cart-total').innerText;
        document.getElementById('r-discount').innerText = discountAmount > 0 ? formatCurrency(discountAmount) : '0.00 ר.س';
        document.getElementById('r-tax').innerText = document.getElementById('cart-tax').innerText;
    }

    async function downloadReceipt(elementId, namePrefix) {
        const el = document.getElementById(elementId);
        
        // Temporarily make container fully opaque unclipped
        const printZone = document.getElementById('print-zone');
        printZone.style.top = '0';
        printZone.style.left = '0';
        printZone.style.opacity = '1';
        printZone.style.zIndex = '-999'; 

        const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
        
        // Hide again
        printZone.style.top = '-9999px';
        printZone.style.left = '-9999px';
        
        const imgData = canvas.toDataURL('image/jpeg', 1.0);
        const link = document.createElement('a');
        link.download = `${namePrefix}_${orderId}_${Date.now()}.jpg`;
        link.href = imgData;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
});
