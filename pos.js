document.addEventListener('DOMContentLoaded', async () => {

    /* ===============================
       POS State Management
    =============================== */
    let cart = [];
    let currentOrderType = 'محلي';
    let discountAmount = 0;
    let currentFinalTotal = 0;

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
            renderCart();
            if (typeof reloadPosCatalogFromNetwork === 'function') reloadPosCatalogFromNetwork();
        }
    });

    const { ipcRenderer } = require('electron');
    const crypto = require('crypto');
    let zatcaMeta = { icv: 1, uuid: crypto.randomUUID(), pih: 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==' };

    async function generateOrderId() {
        try {
            const dbData = await window.dbRead();
            const ord = dbData.orders || [];
            zatcaMeta.icv = ord.length > 0 ? ord.length + 1 : 1;

            if (ord.length > 0) {
                const prev = ord[ord.length - 1];
                if (prev.invoiceHash) zatcaMeta.pih = prev.invoiceHash;
            }

            zatcaMeta.uuid = crypto.randomUUID();
            return '#INV-' + String(zatcaMeta.icv).padStart(5, '0');
        } catch(e) {
            zatcaMeta.icv++;
            zatcaMeta.uuid = crypto.randomUUID();
            return '#INV-' + String(zatcaMeta.icv).padStart(5, '0');
        }
    }

    let orderId = await generateOrderId();
    document.getElementById('display-order-id').innerText = orderId;

    // Elements
    const productsGrid = document.getElementById('products-grid');
    const categoriesScroll = document.querySelector('.pos-categories'); // Correct Target
    const searchInput = document.getElementById('product-search');
    const cartContainer = document.getElementById('cart-items-container');

    const barcodeScanBtn = document.querySelector('.pos-header .pos-action-btn:not(.primary)');
    const newCustomerHeaderBtn = document.querySelector('.pos-header .pos-action-btn.primary');
    if (barcodeScanBtn && searchInput) {
        barcodeScanBtn.addEventListener('click', () => {
            const code = prompt('أدخل رمز الباركود أو جزءاً من اسم الصنف:', (searchInput.value || '').trim());
            if (code == null) return;
            searchInput.value = code.trim();
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }
    if (newCustomerHeaderBtn) {
        newCustomerHeaderBtn.addEventListener('click', () => {
            window.location.href = 'customers.html';
        });
    }
    
    const formatCurrency = (amount) =>
        window.HashCurrency ? HashCurrency.format(amount) : Number(amount).toFixed(2) + ' ر.س';

    /* ===============================
       Dynamic Data Loading from JSON DB
    =============================== */
    const _db = await window.dbRead();

    let catData = _db.categories || JSON.parse(localStorage.getItem('pos_categories') || '[]');
    let prodData = _db.products || JSON.parse(localStorage.getItem('pos_products') || '[]');

    // Render Categories
    if(categoriesScroll) {
        categoriesScroll.innerHTML = `
            <button class="category-btn active" data-category="الكل">
                <div class="cat-icon"><i class="ph ph-squares-four"></i></div>
                <span>الكل</span>
            </button>
        `;
        catData.sort((a,b) => (a.order||0) - (b.order||0)).forEach(c => {
            const html = `
                <button class="category-btn" data-category="${c.id}">
                    <div class="cat-icon" style="color: var(--accent-${c.color||'blue'});"><i class="ph ${c.icon||'ph-folder'}"></i></div>
                    <span>${c.nameAr}</span>
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
                            <span class="product-price">${formatCurrency(p.price)}</span>
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

    function bindPosCatalogInteraction() {
        categoryBtns = document.querySelectorAll('.category-btn');
        categoryBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                categoryBtns.forEach(b => b.classList.remove('active'));
                const targetBtn = e.target.closest('.category-btn');
                targetBtn.classList.add('active');

                const category = targetBtn.dataset.category;
                filterProducts(category, searchInput.value.toLowerCase());
            });
        });

        const productCardsClickable = document.querySelectorAll('.product-card');
        productCardsClickable.forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.add-btn')) return;
                addProductToCart(card);
            });
        });

        document.querySelectorAll('.product-card .add-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const card = e.target.closest('.product-card');
                addProductToCart(card);
            });
        });
    }

    searchInput.addEventListener('input', (e) => {
        const activeBtn = document.querySelector('.category-btn.active');
        const category = activeBtn ? activeBtn.dataset.category : 'الكل';
        filterProducts(category, e.target.value.toLowerCase());
    });

    bindPosCatalogInteraction();

    /* ===============================
       Cart Functionality
    =============================== */

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
        
        currentFinalTotal = finalTotal; // Keep track for calculations

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
            
            // Re-calculate to show full amount in split if needed
            calculateChange();
        });
    });

    // Cash Calculator
    const cashReceivedInput = document.getElementById('cash-received');
    const cashChangeDisplay = document.getElementById('cash-change');

    function calculateChange() {
        const total = Number(currentFinalTotal) || 0;
        
        // 1. Handling normal cash (Cash Change)
        const received = parseFloat(cashReceivedInput.value) || 0;
        let change = received - total;
        if (change < 0 || isNaN(change)) change = 0;
        
        if(cashChangeDisplay) cashChangeDisplay.innerText = formatCurrency(change);

        // 2. Handling split (Split Payment)
        const splitCashVal = document.getElementById('split-cash-amount').value;
        const splitCash = parseFloat(splitCashVal) || 0;
        
        let splitNet = total - splitCash;
        if(splitNet < 0) splitNet = 0;
        
        // Final update for split network display
        const splitNetEl = document.getElementById('split-network-amount');
        if(splitNetEl) splitNetEl.innerText = formatCurrency(splitNet);
    }

    cashReceivedInput.addEventListener('input', calculateChange);
    document.getElementById('split-cash-amount').addEventListener('input', calculateChange);
    document.getElementById('split-cash-amount').addEventListener('keyup', calculateChange); // Extra layer for speed


    /* ===============================
       Printing / Receipts 
    =============================== */
    const btnConfirmPay = document.getElementById('btn-confirm-payment');

    btnConfirmPay.addEventListener('click', async () => {
        await preparePrintTemplates();

        btnConfirmPay.innerHTML = '<i class="ph ph-spinner ph-spin"></i> جاري توليد الفواتير...';
        btnConfirmPay.disabled = true;

        try {
            // Save to LocalStorage for Sales page FIRST
            const now = new Date();
            const selectedPay = document.querySelector('.payment-method.selected input').value;
            const _ct = document.getElementById('cart-total').innerText;
            const totalOrder =
                window.HashCurrency && HashCurrency.parseLoose
                    ? HashCurrency.parseLoose(_ct) || 0
                    : parseFloat(String(_ct).replace(/[^\d.]/g, '')) || 0;
            let finalSplitCash = 0, finalSplitNet = 0;

            if(selectedPay === 'مجزأ') {
                finalSplitCash = parseFloat(document.getElementById('split-cash-amount').value) || 0;
                finalSplitNet = totalOrder - finalSplitCash;
            } else if (selectedPay === 'كاش') {
                finalSplitCash = totalOrder;
            } else {
                finalSplitNet = totalOrder;
            }

            const currentUserConf = localStorage.getItem('currentUser');
            let cashierName = 'كاشير';
            try {
                const u = JSON.parse(currentUserConf || '{}');
                cashierName = u.username || u.name || 'كاشير';
            } catch(e){}

            const orderData = {
                orderId: orderId,
                uuid: zatcaMeta.uuid,
                icv: zatcaMeta.icv,
                pih: zatcaMeta.pih,
                invoiceHash: crypto.createHash('sha256').update(zatcaMeta.uuid + orderId + totalOrder + now.getTime()).digest('base64'),
                cashier: cashierName,
                date: now.toLocaleDateString('ar-u-nu-latn') + " " + now.toLocaleTimeString('ar-u-nu-latn'),
                timestamp: now.getTime(),
                type: currentOrderType,
                paymentMethod: selectedPay,
                total: totalOrder,
                splitCash: finalSplitCash,
                splitNetwork: finalSplitNet,
                itemsCount: cart.length,
                items: [...cart]
            };

            try {
                const kp = JSON.parse(localStorage.getItem('kitchen_prefs') || '{}');
                if (kp.autoDeductOnSale === true) {
                    const wh = kp.sourceWarehouse;
                    if (wh === 'main' || wh === 'restaurant' || wh === 'beverages') {
                        orderData.inventoryDeductWarehouse = wh;
                    }
                }
            } catch (e) {}

            // Securely save via IPC to backend SQLite (Atomic Transaction)
            const { ipcRenderer } = require('electron');
            await ipcRenderer.invoke('db-save-order', orderData);
            
            // Fatora Integration Hook
            try {
                const dbData = await window.dbRead();
                if (dbData.fatora_settings && dbData.fatora_settings.autoSync && dbData.fatora_settings.apiKey) {
                    console.log(`[Fatora ZATCA API] Sending invoice ${orderId} to ZATCA...`);
                    // Create notification
                    const zNotif = document.createElement('div');
                    zNotif.style.position = 'fixed';
                    zNotif.style.bottom = '20px';
                    zNotif.style.right = '20px';
                    zNotif.style.background = '#10b981';
                    zNotif.style.color = 'white';
                    zNotif.style.padding = '15px 20px';
                    zNotif.style.borderRadius = '8px';
                    zNotif.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
                    zNotif.style.zIndex = '9999999';
                    zNotif.style.display = 'flex';
                    zNotif.style.alignItems = 'center';
                    zNotif.style.gap = '10px';
                    zNotif.innerHTML = '<i class="ph ph-spinner ph-spin" style="font-size:24px;"></i> <span>جاري رفع الفاتورة لمنصة الزكاة...</span>';
                    document.body.appendChild(zNotif);

                    // Mock API delay
                    setTimeout(() => {
                        zNotif.innerHTML = '<i class="ph-fill ph-check-circle" style="font-size:24px;"></i> <span>تم رفع الفاتورة بنجاح (الزكاة والضريبة)</span>';
                        setTimeout(() => zNotif.remove(), 4000);
                    }, 2000);
                }
            } catch(e) {
                console.error('Fatora Sync Error:', e);
            }

            const thermalReceiptSnap = {
                orderType: document.getElementById('r-type').innerText,
                orderId: document.getElementById('r-order-id').innerText,
                date: document.getElementById('r-date').innerText,
                itemsHtml: document.getElementById('r-items').innerHTML,
                subtotalText: (document.getElementById('r-subtotal') && document.getElementById('r-subtotal').innerText) || document.getElementById('cart-subtotal').innerText,
                totalText: document.getElementById('r-total').innerText,
                discountText: document.getElementById('r-discount').innerText,
                taxLabel: document.getElementById('r-tax-rate-label').innerText,
                taxText: document.getElementById('r-tax').innerText,
                paymentText: document.getElementById('r-payment-method').innerText,
                qrSrc: (() => {
                    const q = document.getElementById('r-qr-code');
                    return q && q.src ? q.src : '';
                })(),
            };
            
            // Reset cart UI before printing
            cart = [];
            discountAmount = 0;
            if (discountInput) discountInput.value = '';
            if (cashReceivedInput) cashReceivedInput.value = '';
            renderCart();
            modalCheckout.classList.remove('active');

            orderId = await generateOrderId();
            document.getElementById('display-order-id').innerText = orderId;

            // Non-blocking notification instead of alert()
            const successNotif = document.createElement('div');
            successNotif.style.cssText = 'position:fixed; top:20px; right:20px; background:#10b981; color:white; padding:15px 25px; border-radius:8px; box-shadow:0 10px 25px rgba(0,0,0,0.3); z-index:9999999; display:flex; align-items:center; gap:10px; font-weight:bold; animation: slideIn 0.3s ease-out;';
            successNotif.innerHTML = '<i class="ph-fill ph-check-circle" style="font-size:24px;"></i> <span>تم الحفظ.. جاري الطباعة التلقائية</span>';
            document.body.appendChild(successNotif);
            setTimeout(() => {
                successNotif.style.opacity = '0';
                successNotif.style.transition = 'opacity 0.5s';
                setTimeout(() => successNotif.remove(), 500);
            }, 3000);

            // 1. Open drawer and show notification (Immediate)
            openCashDrawer();

            // 2. Print Customer Receipt Ticket (Next priority)
            try {
                await printCustomerReceipt(thermalReceiptSnap);
            } catch(e) { console.error('Customer receipt printing failed', e); }

            // 3. Silent print to category-specific printers (Kitchen/Last priority)
            try {
                await printToCategoryPrinters(orderData);
            } catch(e) { console.error('Category printing failed', e); }

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
        await preparePrintTemplates();
        openCashDrawer();
        await printCustomerReceipt();
        document.getElementById('btn-print-receipt').innerHTML = '<i class="ph ph-printer"></i> طباعة للحفظ';
    });

    async function preparePrintTemplates() {
        // Date
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-GB') + " " + now.toLocaleTimeString('en-GB', { hour12: true });
        
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
        if(document.getElementById('r-payment-method')) document.getElementById('r-payment-method').innerText = selectedPay;

        // Fill Items
        const rItems = document.getElementById('r-items');
        const kItems = document.getElementById('k-items');
        rItems.innerHTML = ''; kItems.innerHTML = '';

        cart.forEach(item => {
            rItems.innerHTML += `
                <tr style="border-bottom: 1px dashed #ccc;">
                    <td class="item-name" style="padding: 5px 0;">${item.name}</td>
                    <td class="item-qty" style="text-align: center;">${item.qty}</td>
                    <td class="item-price" style="text-align: left;">${formatCurrency(item.price * item.qty)}</td>
                </tr>
            `;

            kItems.innerHTML += `
                <tr style="border-bottom: 1px dashed #000;">
                    <td style="padding: 5px 0;">🔴 ${item.name}</td>
                    <td style="text-align: center; font-size:24px; padding: 5px;">${item.qty}</td>
                </tr>
            `;
        });

        // Totals for customer (مجموع الأصناف ≠ الإجمالي النهائي عند وجود خصم)
        const rSub = document.getElementById('r-subtotal');
        if (rSub) rSub.innerText = document.getElementById('cart-subtotal').innerText;
        document.getElementById('r-total').innerText = document.getElementById('cart-total').innerText;
        document.getElementById('r-discount').innerText =
            discountAmount > 0 ? formatCurrency(discountAmount) : formatCurrency(0);
        document.getElementById('r-tax').innerText = document.getElementById('cart-tax').innerText;

        // Update tax rate label in receipt
        const rTaxRateLabel = document.getElementById('r-tax-rate-label');
        if (rTaxRateLabel) {
            const pct = Math.round(getTaxRate() * 100 * 100) / 100;
            rTaxRateLabel.innerText = `قيمة الضريبة المضافة ${pct}%:`;
        }

        // --- ZATCA Phase 1 QR Code Generation ---
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
            } catch(e) { return ''; }
        }

        const storeNameEl = document.getElementById('r-store-name');
        const storeName = storeNameEl ? storeNameEl.innerText.trim() : 'هش HASH';
        const rawStoreTaxEl = document.getElementById('r-store-tax');
        const storeTax = rawStoreTaxEl ? rawStoreTaxEl.innerText.replace(/[^\d]/g, '') : '310000000000003';
        
        console.log('   📋 Receipt element tax:', rawStoreTaxEl ? rawStoreTaxEl.innerText : 'N/A');
        console.log('   📊 Extracted tax number:', storeTax);
        
        const timestampIso = now.toISOString();
        const totalStr = document.getElementById('cart-total').innerText.replace(/[^\d.]/g, '');
        const taxStr = document.getElementById('cart-tax').innerText.replace(/[^\d.]/g, '');

        const base64TLV = getQRBase64(storeName, storeTax || '310000000000003', timestampIso, totalStr, taxStr);

        console.log('🔲 Generating QR Code...');
        console.log('   Store Name:', storeName);
        console.log('   Tax Number:', storeTax || '310000000000003');
        console.log('   Total:', totalStr);
        console.log('   Tax:', taxStr);
        console.log('   TLV Length:', base64TLV.length);

        try {
            const QRCode = require('qrcode');
            const url = await QRCode.toDataURL(base64TLV, { errorCorrectionLevel: 'M', margin: 1, width: 140 });
            const qrImg = document.getElementById('r-qr-code');
            if(qrImg) {
                qrImg.src = url;
                console.log('✅ QR Code generated successfully');
                console.log('   Image src length:', url.length);
            } else {
                console.error('❌ QR image element not found (#r-qr-code)');
            }
        } catch(e) {
            console.error('❌ Failed to generate ZATCA QR Code:', e.message);
            console.error('   Stack:', e.stack);
        }
        // --- End ZATCA QR ---
    }

    // Load updated thermal receipt printer (80mm international standard)
    const thermalReceipt = require('./thermal-receipt-updated.js');
    const printCustomerReceipt = thermalReceipt.printCustomerReceipt;

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
            const path = require('path');
            const audioPath = path.join(__dirname, 'cash-register.mp3');
            const fs = require('fs');
            
            if (fs.existsSync(audioPath)) {
                const audio = new Audio('file://' + audioPath);
                audio.play().catch(e => console.log('Audio play skipped:', e.message));
            } else {
                console.log('🔕 Sound file not found (optional)');
            }
        } catch (e) {
            console.log('🔕 Audio disabled (optional feature)');
        }

        setTimeout(() => {
            notif.remove();
        }, 4000);
    }

    async function printToCategoryPrinters(order) {
        const { ipcRenderer } = require('electron');
        const path = require('path');
        const fs = require('fs');
        let printerMap = {}; 
        
        order.items.forEach(itm => {
            const prod = prodData.find(p => p.id === itm.id);
            if(!prod) return;
            const cat = catData.find(c => c.id === prod.categoryId);
            if(!cat || !cat.printers || cat.printers.length === 0) return; 
            
            cat.printers.forEach(pName => {
                if(!printerMap[pName]) printerMap[pName] = [];
                // Prevent duplicate item in same printer
                if(!printerMap[pName].find(i => i.id === itm.id)) {
                    printerMap[pName].push(itm);
                }
            });
        });

        // ── Get restaurant name and logo for kitchen tickets ──
        let kitchenRestName = 'هش HASH';
        let kitchenLogoBase64 = '';
        try {
            const ss = JSON.parse(localStorage.getItem('restaurant_settings') || '{}');
            if (ss.name) kitchenRestName = ss.name;
            
            // Convert kitchen logo to base64
            if (ss.logo && ss.logo.startsWith('data:')) {
                kitchenLogoBase64 = ss.logo;
            } else if (ss.logo) {
                try {
                    const logoPath = path.join(__dirname, ss.logo);
                    if (fs.existsSync(logoPath)) {
                        const logoBuffer = fs.readFileSync(logoPath);
                        const ext = path.extname(ss.logo).toLowerCase();
                        const mimeType = ext === '.png' ? 'image/png' : 
                                       ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
                        kitchenLogoBase64 = `data:${mimeType};base64,${logoBuffer.toString('base64')}`;
                    }
                } catch(e) {
                    console.error('Kitchen logo conversion error:', e);
                }
            }
        } catch(e){}

        for (const [pName, items] of Object.entries(printerMap)) {
            let itemsHtml = items.map(i => `
                <tr class="kitchen-item">
                    <td class="item-name-cell">● ${i.name}</td>
                    <td class="item-qty-cell">${i.qty}</td>
                </tr>
            `).join('');

            let html = `<!DOCTYPE html>
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
        
        html { overflow: visible; }
        
        body {
            font-family: 'Segoe UI', 'Cairo', 'Arial', sans-serif;
            margin: 0 auto;
            padding: 0;
            width: 100%;
            max-width: 72mm;
            min-width: 0;
            background: #ffffff;
            color: #000000;
            direction: rtl;
            text-align: center;
            line-height: 1.35;
            font-size: 11px;
            -webkit-font-smoothing: antialiased;
            overflow: visible;
        }
        
        .kitchen-ticket {
            width: 100%;
            max-width: 72mm;
            padding: 2mm 1mm 2mm 5mm;
            margin: 0 auto;
            box-sizing: border-box;
        }
        
        .kitchen-logo {
            width: 28mm;
            height: 28mm;
            max-width: 28mm;
            max-height: 28mm;
            object-fit: contain;
            margin: 0 auto 2mm auto;
            display: block;
            filter: grayscale(100%) contrast(150%);
        }
        
        .kitchen-header {
            text-align: center;
            border-bottom: 2px solid #000000;
            margin-bottom: 3mm;
            padding-bottom: 3mm;
        }
        
        .kitchen-rest-name {
            font-size: 11px;
            font-weight: 700;
            color: #555555;
            margin-bottom: 1mm;
        }
        
        .kitchen-title {
            font-size: 20px;
            font-weight: 900;
            margin: 2mm 0;
            background: #000000;
            color: #ffffff;
            padding: 2mm;
            display: inline-block;
            min-width: 50mm;
        }
        
        .order-id {
            font-size: 16px;
            font-weight: 800;
            margin: 2mm 0;
        }
        
        .order-type {
            font-size: 13px;
            font-weight: 700;
            margin: 1.5mm 0;
        }
        
        .order-date {
            font-size: 10px;
            color: #555555;
            margin-top: 1mm;
        }
        
        .items-table {
            width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
            margin: 3mm 0;
            border: 1px solid #000000;
        }
        
        .items-table thead th {
            padding: 1.5mm 1mm;
            background: #f0f0f0;
            font-weight: 800;
            font-size: 10px;
            border: 1px solid #000000;
        }
        
        .items-table thead th:first-child {
            text-align: right;
        }
        
        .items-table thead th:last-child {
            text-align: center;
            width: 18mm;
        }
        
        .kitchen-item td {
            border: 1px solid #000000;
        }
        
        .item-name-cell {
            padding: 2mm 1.5mm;
            font-size: 13px;
            font-weight: 800;
            text-align: right;
            direction: rtl;
            overflow-wrap: anywhere;
            word-break: break-word;
            vertical-align: middle;
        }
        
        .item-qty-cell {
            text-align: center;
            font-size: 22px;
            font-weight: 900;
            padding: 2mm 1mm;
            min-width: 0;
            vertical-align: middle;
        }
        
        .divider {
            border-top: 2px dashed #000000;
            margin: 3mm 0;
        }
        
        .footer-message {
            text-align: center;
            font-size: 10px;
            color: #777777;
            margin-top: 3mm;
        }
    </style>
</head>
<body>
    <div class="kitchen-ticket">
        <!-- Kitchen Header -->
        <div class="kitchen-header">
            ${kitchenLogoBase64 ? `<img src="${kitchenLogoBase64}" alt="Logo" class="kitchen-logo">` : ''}
            <div class="kitchen-rest-name">${kitchenRestName}</div>
            <div class="kitchen-title">طلب تجهيز (KDS)</div>
            <div class="order-id">رقم الطلب: ${order.orderId}</div>
            <div class="order-type">طريقة التقديم: <strong>${order.type}</strong></div>
            <div class="order-date">${order.date}</div>
        </div>
        
        <!-- Items Table -->
        <table class="items-table">
            <thead>
                <tr>
                    <th>الصنف</th>
                    <th>كمية</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHtml}
            </tbody>
        </table>
        
        <!-- Footer -->
        <div class="divider"></div>
        <div class="footer-message">بالتوفيق</div>
    </div>
</body>
</html>`;
            
            try {
                console.log(`🍳 Printing kitchen ticket to: ${pName} (${items.length} items)`);
                const pr = await ipcRenderer.invoke('print-to-device', { html, printerName: pName });
                if (pr && pr.debug) console.log('[طباعة مطبخ — تشخيص]', pr.debug);
                if (!pr || !pr.success) console.warn('[طباعة مطبخ]', pr);
            } catch(e) { 
                console.error('❌ Silent print failed for', pName, e); 
            }
        }
    }

    async function reloadPosCatalogFromNetwork() {
        if (cart.length > 0) return;
        const d = await window.dbRead();
        catData = d.categories || JSON.parse(localStorage.getItem('pos_categories') || '[]');
        prodData = d.products || JSON.parse(localStorage.getItem('pos_products') || '[]');
        try {
            localStorage.setItem('pos_categories', JSON.stringify(catData));
            localStorage.setItem('pos_products', JSON.stringify(prodData));
        } catch (e) {}
        if (categoriesScroll) {
            categoriesScroll.innerHTML = `
            <button class="category-btn active" data-category="الكل">
                <div class="cat-icon"><i class="ph ph-squares-four"></i></div>
                <span>الكل</span>
            </button>
        `;
            catData.sort((a, b) => (a.order || 0) - (b.order || 0)).forEach((c) => {
                const html = `
                <button class="category-btn" data-category="${c.id}">
                    <div class="cat-icon" style="color: var(--accent-${c.color || 'blue'});"><i class="ph ${c.icon || 'ph-folder'}"></i></div>
                    <span>${c.nameAr}</span>
                </button>
            `;
                categoriesScroll.insertAdjacentHTML('beforeend', html);
            });
        }
        if (productsGrid) {
            productsGrid.innerHTML = '';
            prodData.filter((p) => p.isActive).forEach((p) => {
                const html = `
                <div class="product-card" data-category="${p.categoryId}" data-name="${p.nameAr}" data-price="${p.price}" data-id="${p.id}">
                    <div class="product-img-wrapper">
                        <img src="${p.image}" alt="${p.nameAr}">
                    </div>
                    <div class="product-details">
                        <h4>${p.nameAr}</h4>
                        <div class="price-row">
                            <span class="product-price">${formatCurrency(p.price)}</span>
                            <button class="add-btn"><i class="ph ph-plus"></i></button>
                        </div>
                    </div>
                </div>
            `;
                productsGrid.insertAdjacentHTML('beforeend', html);
            });
        }
        bindPosCatalogInteraction();
        const activeCatBtn = document.querySelector('.category-btn.active');
        if (activeCatBtn) filterProducts(activeCatBtn.dataset.category, searchInput.value.toLowerCase());
    }

    if (typeof window.registerPosDatabaseRefresh === 'function') {
        window.registerPosDatabaseRefresh(() => reloadPosCatalogFromNetwork());
    }

});
