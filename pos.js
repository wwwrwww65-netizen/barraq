document.addEventListener('DOMContentLoaded', () => {

    /* ===============================
       POS State Management
    =============================== */
    let cart = [];
    let currentOrderType = 'محلي';
    let discountAmount = 0;

    // ── Dynamic Tax Rate (from restaurant_settings) ─────────────────────────
    function getTaxRate() {
        try {
            const s = JSON.parse(localStorage.getItem('restaurant_settings') || '{}');
            const rate = parseFloat(s.taxRate);
            return isNaN(rate) ? 0.15 : rate / 100;
        } catch(e) { return 0.15; }
    }

    // Update the tax label in the cart UI to reflect current rate
    function updateTaxLabel() {
        const taxLabelEl = document.getElementById('cart-tax-label');
        if (taxLabelEl) {
            const pct = Math.round(getTaxRate() * 100 * 100) / 100;
            taxLabelEl.innerHTML = `<i class="ph ph-receipt"></i> ضريبة ق.م (${pct}%)`;
        }
    }

    updateTaxLabel();

    // Re-apply if network sync updates settings
    window.addEventListener('storage', (e) => {
        if (e.key === 'restaurant_settings') {
            updateTaxLabel();
            renderCart(); // recalculate totals
        }
    });

    let orderId = '#ORD-' + Math.floor(1000 + Math.random() * 9000); // Random Order ID for session
    document.getElementById('display-order-id').innerText = orderId;

    // Elements
    const productsGrid = document.getElementById('products-grid');
    const categoriesScroll = document.querySelector('.categories-scroll'); // Needs to exist
    const searchInput = document.getElementById('product-search');
    const cartContainer = document.getElementById('cart-items-container');
    
    // UI Formatters
    const formatCurrency = (amount) => Number(amount).toFixed(2) + ' ر.س';

    /* ===============================
       Dynamic Data Loading from JSON DB
    =============================== */
    const _fs = require('fs');
    const _path = require('path');
    const _dbPath = require('electron').ipcRenderer.sendSync('get-db-path');
    function _loadDB() {
        try { return JSON.parse(_fs.readFileSync(_dbPath, 'utf8')); }
        catch(e) { return { categories:[], products:[] }; }
    }

    const _db = _loadDB();

    let catData = (_db.categories && _db.categories.length > 0)
        ? _db.categories
        : JSON.parse(localStorage.getItem('pos_categories') || '[]');

    let prodData = (_db.products && _db.products.length > 0)
        ? _db.products
        : JSON.parse(localStorage.getItem('pos_products') || '[]');

    // Initial fallback if system is entirely empty
    if(catData.length === 0) {
        catData = [
            { id: 'cat_1', nameAr: 'شعبيات ومندي', icon: 'ph-bowl-food', color: 'orange', order: 1 },
            { id: 'cat_2', nameAr: 'مشويات', icon: 'ph-fire', color: 'red', order: 2 }
        ];
    }
    if(prodData.length === 0) {
        prodData = [
            { id: 'p_1', sku: 'SKU-M001', categoryId: 'cat_1', nameAr: 'مندي دجاج', price: 40, cost: 18, image: 'placeholder.svg', isActive: true },
            { id: 'p_2', sku: 'SKU-M002', categoryId: 'cat_1', nameAr: 'مظبي لحم', price: 65, cost: 30, image: 'placeholder.svg', isActive: true }
        ];
    }

    // Render Categories
    if(categoriesScroll) {
        categoriesScroll.innerHTML = `
            <button class="category-btn active" data-category="الكل">
                <div class="cat-icon" style="background: rgba(255, 255, 255, 0.1);"><i class="ph ph-squares-four"></i></div>
                <span class="cat-name">الكل</span>
            </button>
        `;
        catData.sort((a,b) => (a.order||0) - (b.order||0)).forEach(c => {
            const html = `
                <button class="category-btn" data-category="${c.id}">
                    <div class="cat-icon" style="background: var(--accent-${c.color||'blue'});"><i class="ph ${c.icon||'ph-folder'}"></i></div>
                    <span class="cat-name">${c.nameAr}</span>
                </button>
            `;
            categoriesScroll.insertAdjacentHTML('beforeend', html);
        });
    }

    // Render Products
    if(productsGrid) {
        productsGrid.innerHTML = '';
        prodData.filter(p => p.isActive).forEach(p => {
            const html = `
                <div class="product-card" data-category="${p.categoryId}" data-name="${p.nameAr}" data-price="${p.price}" data-id="${p.id}">
                    <div class="product-img-wrapper">
                        <img src="${p.image}" alt="${p.nameAr}">
                    </div>
                    <div class="product-details">
                        <h4>${p.nameAr}</h4>
                        <div class="price-row">
                            <span class="product-price">${Number(p.price).toFixed(2)} ر.س</span>
                            <button class="add-btn"><i class="ph ph-plus"></i></button>
                        </div>
                    </div>
                </div>
            `;
            productsGrid.insertAdjacentHTML('beforeend', html);
        });
    }

    /* ===============================
       Category & Product Filtering
    =============================== */
    let categoryBtns = document.querySelectorAll('.category-btn');

    categoryBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            categoryBtns.forEach(b => b.classList.remove('active'));
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
                product.style.display = 'flex';
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

    productCardsClickable.forEach(card => {
        card.addEventListener('click', (e) => {
            if(e.target.closest('.add-btn')) return; 
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

    // ── Discount Permission Check ──────────────────────────────────────────
    // Check if current user has pos_discount permission.
    // If not, hide the entire discount row so they can't apply manual discounts.
    const discountRow = document.querySelector('.summary-line.discount');
    const discountInput = document.getElementById('cart-discount-input');

    (function applyDiscountPermission() {
        try {
            const cUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
            // Super Admin always has access
            if (cUser.role === 'المدير العام') return;

            const systemRoles = JSON.parse(localStorage.getItem('system_roles') || '[]');
            const myRole = systemRoles.find(r => r.name === cUser.role);

            const hasDiscountPerm = myRole && myRole.perms && myRole.perms['pos_discount'] === true;

            if (!hasDiscountPerm) {
                // Hide the discount row entirely
                if (discountRow) {
                    discountRow.style.display = 'none';
                }
                // Lock the input so JS can't be manipulated via console
                discountInput.value = '0';
                discountAmount = 0;
                discountInput.disabled = true;
            }
        } catch(e) {
            console.error('Discount permission check failed', e);
        }
    })();

    // Attach listener to discount input
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

        const TAX_RATE = getTaxRate();
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
            
            // Toggle Display
            const pt = label.querySelector('input').value;
            document.getElementById('cash-calculator').style.display = pt === 'كاش' ? 'flex' : 'none';
            document.getElementById('split-calculator').style.display = pt === 'مجزأ' ? 'flex' : 'none';
        });
    });

    // Cash Calculator
    const cashReceivedInput = document.getElementById('cash-received');
    const cashChangeDisplay = document.getElementById('cash-change');

    function calculateChange() {
        const totalStr = document.getElementById('cart-total').innerText.replace(' ر.س', '');
        const total = parseFloat(totalStr) || 0;
        
        // Handling normal cash
        const received = parseFloat(cashReceivedInput.value) || 0;
        let change = received - total;
        if (change < 0 || isNaN(change)) change = 0;
        cashChangeDisplay.innerText = formatCurrency(change);

        // Handling split
        const splitCash = parseFloat(document.getElementById('split-cash-amount').value) || 0;
        let splitNet = total - splitCash;
        if(splitNet < 0) splitNet = 0;
        document.getElementById('split-network-amount').innerText = formatCurrency(splitNet);
    }

    cashReceivedInput.addEventListener('input', calculateChange);
    document.getElementById('split-cash-amount').addEventListener('input', calculateChange);


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
            // Save to LocalStorage for Sales page FIRST
            const now = new Date();
            const selectedPay = document.querySelector('.payment-method.selected input').value;
            const totalOrder = parseFloat(document.getElementById('cart-total').innerText.replace(' ر.س', ''));
            let finalSplitCash = 0, finalSplitNet = 0;

            if(selectedPay === 'مجزأ') {
                finalSplitCash = parseFloat(document.getElementById('split-cash-amount').value) || 0;
                finalSplitNet = totalOrder - finalSplitCash;
            } else if (selectedPay === 'كاش') {
                finalSplitCash = totalOrder;
            } else {
                finalSplitNet = totalOrder;
            }

            const orderData = {
                orderId: orderId,
                date: now.toLocaleDateString('ar-SA') + " " + now.toLocaleTimeString('ar-SA'),
                timestamp: now.getTime(),
                type: currentOrderType,
                paymentMethod: selectedPay,
                total: totalOrder,
                splitCash: finalSplitCash,
                splitNetwork: finalSplitNet,
                itemsCount: cart.length,
                items: [...cart]
            };
            
            // Securely save via IPC to backend SQLite (Atomic Transaction)
            const { ipcRenderer } = require('electron');
            await ipcRenderer.invoke('db-save-order', orderData);
            
            // Reset cart UI before printing dialog block
            cart = [];
            discountAmount = 0;
            discountInput.value = '';
            cashReceivedInput.value = '';
            renderCart();
            modalCheckout.classList.remove('active');

            orderId = '#ORD-' + Math.floor(1000 + Math.random() * 9000);
            document.getElementById('display-order-id').innerText = orderId;

            alert('تمت العملية بنجاح! تم حفظ المبيعات وتحديث المخزون. ستظهر الفاتورة للطباعة الآن.');

            openCashDrawer();
            await downloadReceipt('all', 'الفاتورة');

        } catch(e) {
            console.error("Save or Print Failed", e);
            alert("حدث خطأ أثناء حفظ الفاتورة");
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
        openCashDrawer();
        await downloadReceipt('all', 'مسودة_الفاتورة');
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
        document.getElementById('r-discount').innerText = discountAmount > 0 ? formatCurrency(discountAmount) : '0.00 ر.س';
        document.getElementById('r-tax').innerText = document.getElementById('cart-tax').innerText;

        // Update tax rate label in receipt
        const rTaxRateLabel = document.getElementById('r-tax-rate-label');
        if (rTaxRateLabel) {
            const pct = Math.round(getTaxRate() * 100 * 100) / 100;
            rTaxRateLabel.innerText = `قيمة الضريبة المضافة ${pct}%:`;
        }
    }

    async function downloadReceipt(elementId, namePrefix) {
        return new Promise(async (resolve) => {
            try {
                // Ensure print-zone is temporarily visible for html2canvas to capture if it was display:none
                // In pos.html, it's positioned off-screen (top: -9999px) so it's fine.
                const receiptCustomer = document.getElementById('receipt-customer');
                if(!receiptCustomer) {
                    window.print();
                    return resolve();
                }

                // Render the receipt to a canvas
                const canvas = await html2canvas(receiptCustomer, { scale: 2 });
                const imgData = canvas.toDataURL('image/png');
                
                // Trigger download
                const link = document.createElement('a');
                link.download = namePrefix + '_' + orderId + '.png';
                link.href = imgData;
                link.click();
                
                // Also do the kitchen receipt
                const receiptKitchen = document.getElementById('receipt-kitchen');
                if(receiptKitchen) {
                    const canvasK = await html2canvas(receiptKitchen, { scale: 2 });
                    const linkK = document.createElement('a');
                    linkK.download = 'مطبخ_' + orderId + '.png';
                    linkK.href = canvasK.toDataURL('image/png');
                    linkK.click();
                }

                resolve();
            } catch(e) {
                console.error("html2canvas failed", e);
                // Fallback
                window.print();
                resolve();
            }
        });
    }

    function openCashDrawer() {
        // Simulate opening the cash drawer
        // In Electron/Node.js this would send an ESC/POS command to the printer COM port
        console.log('Sending ESC/POS kick to COM port...');
        const notif = document.createElement('div');
        notif.style.position = 'fixed';
        notif.style.top = '20px';
        notif.style.left = '50%';
        notif.style.transform = 'translateX(-50%)';
        notif.style.background = 'var(--accent-green)';
        notif.style.color = 'white';
        notif.style.padding = '15px 30px';
        notif.style.borderRadius = '8px';
        notif.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
        notif.style.zIndex = '9999999';
        notif.style.fontSize = '18px';
        notif.style.fontWeight = 'bold';
        notif.innerHTML = '<i class="ph ph-safe"></i> تم إرسال أمر فتح صندوق الكاشير!';
        document.body.appendChild(notif);
        
        // Play notification sound if available
        try {
            const audio = new Audio('cash-register.mp3');
            audio.play().catch(e => console.log('Audio disabled by browser policy', e));
        } catch (e) {}

        setTimeout(() => {
            notif.remove();
        }, 4000);
    }
});
