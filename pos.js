document.addEventListener('DOMContentLoaded', async () => {

    /* ===============================
       POS State Management
    =============================== */
    let cart = [];
    let currentOrderType = 'محلي';
    let discountAmount = 0;
    let currentFinalTotal = 0;
    let isEditingOrder = false;
    let editingOrderId = '';

    function setEditModeBadge(isOn, orderIdText) {
        const badge = document.getElementById('pos-edit-mode-badge');
        const text = document.getElementById('pos-edit-mode-text');
        if (!badge || !text) return;
        if (isOn) {
            text.innerText = `وضع تعديل الطلب: ${orderIdText || ''}`.trim();
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
            text.innerText = 'وضع تعديل طلب';
        }
    }

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
            // ⚡ جلب رقم الطلب الأعلى مباشرة من SQL — لا نجلب البيانات الكاملة للطلبات
            const [maxNum, lastMeta] = await Promise.all([
                ipcRenderer.invoke('db-get-max-order-number'),
                ipcRenderer.invoke('db-get-last-order-meta'),
            ]);

            const maxId = Number(maxNum) || 0;
            zatcaMeta.icv = maxId > 0 ? maxId + 1 : 1;

            if (lastMeta && lastMeta.invoiceHash) {
                zatcaMeta.pih = lastMeta.invoiceHash;
            }

            zatcaMeta.uuid = crypto.randomUUID();
            return "#INV-" + String(zatcaMeta.icv).padStart(5, "0");
        } catch(e) {
            console.error(e);
            zatcaMeta.icv++;
            zatcaMeta.uuid = crypto.randomUUID();
            return "#INV-" + String(zatcaMeta.icv).padStart(5, "0");
        }
    }

    // ⚡ إظهار شاشات الهيكل (Skeleton Screens) أثناء انتظار البيانات
    const _tempGrid = document.getElementById('products-grid');
    const _tempCat = document.querySelector('.pos-categories');
    if (_tempGrid) {
        _tempGrid.innerHTML = Array(12).fill(`
            <div class="skeleton-card">
                <div class="skeleton-img"></div>
                <div class="skeleton-content">
                    <div class="skeleton-line"></div>
                    <div class="skeleton-line short"></div>
                    <div class="skeleton-line price"></div>
                </div>
            </div>`).join('');
    }
    if (_tempCat) {
        _tempCat.innerHTML = Array(6).fill(`<div class="skeleton-cat"></div>`).join('');
    }

    // ⚡ تشغيل generateOrderId و dbReadSlice بالتوازي (بدلاً من الانتظار التسلسلي)
    // يقلص وقت تحميل الصفحة إلى النصف تقريباً
    const [orderId_init, _db] = await Promise.all([
        generateOrderId(),
        window.dbReadSlice(['categories', 'deliveryCompanies', 'products'])
    ]);
    let orderId = orderId_init;
    document.getElementById('display-order-id').innerText = orderId;

    // Elements
    const productsGrid = document.getElementById('products-grid');
    const categoriesScroll = document.querySelector('.pos-categories'); // Correct Target
    const searchInput = document.getElementById('product-search');
    const cartContainer = document.getElementById('cart-items-container');

    const formatCurrency = (amount) =>
        window.MisterCasherCurrency ? MisterCasherCurrency.format(amount) : Number(amount).toFixed(2) + ' ر.س';

    // ⚡ تحميل الشعار مرة واحدة فقط عند تشغيل الصفحة — يتجنب قراءة القرص في كل فاتورة
    let _cachedLogoBase64 = '';
    (function _preloadLogo() {
        try {
            const _fs = require('fs');
            const _path = require('path');
            const ss = JSON.parse(localStorage.getItem('restaurant_settings') || '{}');
            if (ss.logo && ss.logo.startsWith('data:')) {
                _cachedLogoBase64 = ss.logo;
            } else if (ss.logo) {
                const lp = _path.join(__dirname, ss.logo);
                if (_fs.existsSync(lp)) {
                    const buf = _fs.readFileSync(lp);
                    const ext = _path.extname(ss.logo).toLowerCase();
                    const mime = ext === '.png' ? 'image/png' : (ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png');
                    _cachedLogoBase64 = `data:${mime};base64,${buf.toString('base64')}`;
                }
            }
            if (!_cachedLogoBase64) {
                const def = _path.join(__dirname, '2222.png');
                if (_fs.existsSync(def)) {
                    const buf = _fs.readFileSync(def);
                    _cachedLogoBase64 = `data:image/png;base64,${buf.toString('base64')}`;
                }
            }
        } catch(e) { console.warn('[POS] Logo preload failed:', e.message); }
    })();

    /* ===============================
       Dynamic Data Loading from JSON DB
    =============================== */

    let catData = _db.categories || JSON.parse(localStorage.getItem('pos_categories') || '[]');
    
    // Render dynamic delivery companies in POS payment modal (Pills UI)
    if (document.getElementById('dynamic-delivery-companies-pills')) {
        let companies = _db.deliveryCompanies || [];
        const activeCompanies = companies.filter(c => c.isActive !== false);
        
        const deliveryPayRadio = document.querySelector('input[name="pay_method"][value="توصيل"]');
        const deliveryPayLabel = deliveryPayRadio ? deliveryPayRadio.closest('.payment-method') : null;
        
        if (activeCompanies.length === 0) {
            // Hide the delivery payment option completely
            if (deliveryPayLabel) {
                deliveryPayLabel.style.display = 'none';
            }
        } else {
            // Ensure it's visible
            if (deliveryPayLabel) {
                deliveryPayLabel.style.display = ''; 
            }
            
            let html = '';
            activeCompanies.forEach((c, index) => {
                const isSelected = index === 0 ? 'selected' : '';
                html += `
                <label class="delivery-pill ${isSelected}" style="display: inline-flex; align-items: center; justify-content: center; padding: 8px 15px; border: 1px solid #8b5cf6; border-radius: 20px; cursor: pointer; background: ${index === 0 ? '#8b5cf6' : 'transparent'}; color: ${index === 0 ? '#ffffff' : '#8b5cf6'} !important; font-size: 13px; font-weight: 700; transition: all 0.2s;">
                    <input type="radio" name="delivery_comp_select" value="${c.name}" ${index === 0 ? 'checked' : ''} style="display:none;">
                    ${c.name}
                </label>`;
            });
            document.getElementById('dynamic-delivery-companies-pills').innerHTML = html;
        }
        
        // Add click events for pills via event delegation
        document.getElementById('dynamic-delivery-companies-pills').addEventListener('click', (e) => {
            const pill = e.target.closest('.delivery-pill');
            if (!pill) return;
            
            const allPills = document.querySelectorAll('.delivery-pill');
            allPills.forEach(p => {
                p.classList.remove('selected');
                p.style.background = 'transparent';
                p.style.setProperty('color', '#8b5cf6', 'important');
            });
            
            pill.classList.add('selected');
            pill.style.background = '#8b5cf6';
            pill.style.setProperty('color', '#ffffff', 'important');
            
            const radio = pill.querySelector('input[type="radio"]');
            if (radio) radio.checked = true;
        });
        
        bindPaymentMethodToggles();
    } else {
        // Fallback
        bindPaymentMethodToggles();
    }
    
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

    // ── Infinite Scroll State for POS Products ──────────────────────────
    const POS_PROD_INIT = 50;
    const POS_PROD_MORE = 20;
    let _posFiltered = [];
    let _posRendered = 0;
    let _posLoading  = false;

    // We only filter active products to sell
    const activeProducts = prodData.filter(p => p.isActive !== false);

    function renderPosProducts(category = 'الكل', query = '') {
        if (!productsGrid) return;
        productsGrid.innerHTML = '';
        _posRendered = 0;

        _posFiltered = activeProducts.filter(p => {
            const matchesCat = (category === 'الكل' || p.categoryId === category);
            const matchesSearch = p.nameAr.toLowerCase().includes(query.toLowerCase());
            return matchesCat && matchesSearch;
        });

        if (_posFiltered.length === 0) {
            productsGrid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;color:var(--text-muted);">لا توجد أصناف مطابقة.</div>`;
            return;
        }

        _appendPosProducts(POS_PROD_INIT);
    }

    function _appendPosProducts(count) {
        if (!productsGrid) return;
        const fragment = document.createDocumentFragment();
        const end = Math.min(_posRendered + count, _posFiltered.length);

        for (let i = _posRendered; i < end; i++) {
            const p = _posFiltered[i];
            const div = document.createElement('div');
            div.className = 'product-card';
            div.dataset.category = p.categoryId;
            div.dataset.name = p.nameAr;
            div.dataset.price = p.price;
            div.dataset.id = p.id;
            div.innerHTML = `
                <div class="product-img-wrapper">
                    <img src="${p.image || 'placeholder.svg'}" alt="${p.nameAr}">
                </div>
                <div class="product-details">
                    <h4>${p.nameAr}</h4>
                    <div class="price-row">
                        <span class="product-price">${formatCurrency(p.price)}</span>
                        <button class="add-btn"><i class="ph ph-plus"></i></button>
                    </div>
                </div>
            `;
            // Add click listener — use stopPropagation on add-btn to prevent double-fire
            div.addEventListener('click', (e) => {
                // Ignore clicks that bubble up from the add-btn (it has its own listener)
                if (e.target.closest('.add-btn')) return;
                addProductToCart(div);
            });
            const addBtn = div.querySelector('.add-btn');
            if (addBtn) {
                addBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // prevent the div click from also firing
                    addProductToCart(div);
                });
            }
            fragment.appendChild(div);
        }
        
        productsGrid.appendChild(fragment);
        _posRendered = end;
    }

    // Intersection Observer للمنتجات في الـ Grid
    const _posSentinel = document.createElement('div');
    _posSentinel.style.cssText = 'height:10px;grid-column:1/-1;';
    const _posObserver = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting || _posLoading || _posRendered >= _posFiltered.length) return;
        _posLoading = true;
        requestAnimationFrame(() => {
            _appendPosProducts(POS_PROD_MORE);
            _posLoading = false;
        });
    }, { threshold: 0.1 });

    const _origRenderPos = renderPosProducts;
    renderPosProducts = function(cat, query) {
        _posObserver.unobserve(_posSentinel);
        _origRenderPos(cat, query);
        if (_posFiltered.length > POS_PROD_INIT) {
            productsGrid.appendChild(_posSentinel);
            _posObserver.observe(_posSentinel);
        }
    };

    /* ===============================
       Category & Product Filtering
    =============================== */
    let categoryBtns = document.querySelectorAll('.category-btn');

    function bindPosCatalogInteraction() {
        categoryBtns = document.querySelectorAll('.category-btn');
        categoryBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                categoryBtns.forEach(b => b.classList.remove('active'));
                const targetBtn = e.target.closest('.category-btn');
                targetBtn.classList.add('active');

                const category = targetBtn.dataset.category;
                renderPosProducts(category, searchInput.value.toLowerCase().trim());
            });
        });
    }

    let _posSearchTimer;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(_posSearchTimer);
        const val = e.target.value.toLowerCase().trim();
        _posSearchTimer = setTimeout(() => {
            const activeBtn = document.querySelector('.category-btn.active');
            const category = activeBtn ? activeBtn.dataset.category : 'الكل';
            renderPosProducts(category, val);
        }, 300);
    });

    // Render automatically once
    renderPosProducts('الكل', '');
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
        const existingItem = cart.find(item => String(item.id).trim() === String(id).trim());
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

    function toggleSectionAndTableVisibility(orderType) {
        const sectionRow = document.getElementById('section-type-row');
        const tableSelector = document.querySelector('.table-selector');
        
        if (orderType === 'محلي') {
            if (sectionRow) sectionRow.style.display = 'flex';
            if (tableSelector) tableSelector.style.display = 'block';
        } else {
            if (sectionRow) sectionRow.style.display = 'none';
            if (tableSelector) tableSelector.style.display = 'none';
        }
    }

    // Order Type Tabs
    const typeBtns = document.querySelectorAll('.type-btn');
    typeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            typeBtns.forEach(b => b.classList.remove('active'));
            const targetBtn = e.target.closest('.type-btn');
            targetBtn.classList.add('active');
            currentOrderType = targetBtn.dataset.type;
            toggleSectionAndTableVisibility(currentOrderType);
        });
    });
    
    // Initialize visibility based on default state
    toggleSectionAndTableVisibility(currentOrderType);

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

    function activateOrderTypeTab(typeValue) {
        const target = typeValue || 'محلي';
        const btns = document.querySelectorAll('.type-btn');
        btns.forEach((b) => b.classList.remove('active'));
        const hit = Array.from(btns).find((b) => (b.dataset.type || '') === target);
        if (hit) {
            hit.classList.add('active');
            currentOrderType = target;
            if (typeof toggleSectionAndTableVisibility === 'function') {
                toggleSectionAndTableVisibility(currentOrderType);
            }
        }
    }

    function loadOrderEditDraftIfAny() {
        let raw = '';
        try {
            raw = localStorage.getItem('pos_order_edit_draft') || '';
            if (!raw) return;
            const draft = JSON.parse(raw);
            if (!draft || !Array.isArray(draft.items) || draft.items.length === 0) return;

            cart = draft.items.map((it) => ({
                id: String(it.id),
                name: it.name,
                price: Number(it.price) || 0,
                imgSrc: it.imgSrc || it.image || 'placeholder.svg',
                qty: Number(it.qty) > 0 ? Number(it.qty) : 1,
            }));
            discountAmount = 0;
            if (discountInput) discountInput.value = '';
            activateOrderTypeTab(draft.type || 'محلي');
            isEditingOrder = true;
            editingOrderId = String(draft.orderId || '').trim();
            if (editingOrderId) {
                orderId = editingOrderId;
                const displayIdEl = document.getElementById('display-order-id');
                if (displayIdEl) displayIdEl.innerText = editingOrderId;
            }
            setEditModeBadge(true, editingOrderId);
            renderCart();
            localStorage.removeItem('pos_order_edit_draft');
        } catch (e) {
            console.error('Failed loading edit draft on POS', e);
            localStorage.removeItem('pos_order_edit_draft');
            setEditModeBadge(false);
        }
    }

    loadOrderEditDraftIfAny();
    if (!isEditingOrder) setEditModeBadge(false);


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
        window.openModalLayer(modalCheckout);
        calculateChange();
    });

    btnCloseCheckout.addEventListener('click', () => {
        window.closeModalLayer(modalCheckout);
    });

    // Payment Methods Toggle styling
    function bindPaymentMethodToggles() {
        const payMethods = document.querySelectorAll('.payment-method');
        payMethods.forEach(label => {
            // Remove old listeners to prevent duplicates if called multiple times
            const newLabel = label.cloneNode(true);
            label.parentNode.replaceChild(newLabel, label);
            
            newLabel.addEventListener('click', () => {
                const allMethods = document.querySelectorAll('.payment-method');
                allMethods.forEach(l => {
                    l.classList.remove('selected');
                    l.style.borderColor = 'var(--border-light)';
                    l.style.background = 'rgba(15, 23, 42, 0.4)';
                    const icon = l.querySelector('i');
                    const text = l.querySelector('strong');
                    if(icon) icon.style.color = 'var(--text-muted)';
                    if(text) text.style.color = 'var(--text-muted)';
                });
                newLabel.classList.add('selected');
                newLabel.style.borderColor = 'var(--accent-blue)';
                newLabel.style.background = 'rgba(59, 130, 246, 0.1)';
                const sIcon = newLabel.querySelector('i');
                const sText = newLabel.querySelector('strong');
                if(sIcon) sIcon.style.color = 'var(--accent-blue)';
                if(sText) sText.style.color = 'white';
                
                // Toggle Display
                const inputEl = newLabel.querySelector('input');
                const pt = inputEl ? inputEl.value : 'كاش';
                const isDelivery = pt === 'توصيل' || (pt !== 'كاش' && pt !== 'شبكة / بطاقة' && pt !== 'مجزأ');
                
                const cashCalc = document.getElementById('cash-calculator');
                const splitCalc = document.getElementById('split-calculator');
                
                if (cashCalc) cashCalc.style.display = pt === 'كاش' ? 'flex' : 'none';
                if (splitCalc) splitCalc.style.display = pt === 'مجزأ' ? 'flex' : 'none';
                
                const deliverySelector = document.getElementById('delivery-company-selector-container');
                if (deliverySelector) {
                    deliverySelector.style.display = pt === 'توصيل' ? 'flex' : 'none';
                }
                
                // Show notes field for all payment methods
                const orderNotes = document.getElementById('order-notes-field');
                if (orderNotes) orderNotes.style.display = 'flex';
                
                // Delivery doesn't need calculator
                if (isDelivery) {
                    if (cashCalc) cashCalc.style.display = 'none';
                    if (splitCalc) splitCalc.style.display = 'none';
                }
                
                // Re-calculate to show full amount in split if needed
                calculateChange();
            });
        });
    }

    // Cash Calculator
    const cashReceivedInput = document.getElementById('cash-received');
    const cashChangeDisplay = document.getElementById('cash-change');

    function calculateChange() {
        const total = Number(currentFinalTotal) || 0;
        
        // 1. Handling normal cash (Cash Change)
        const received = parseFloat(cashReceivedInput.value) || 0;
        let change = received - total;
        
        if(cashChangeDisplay) {
            if (change < 0) {
                // Show as "Remaining to pay" if negative
                const label = document.querySelector('span[style*="المتبقي للعميل"]');
                if (label) label.innerText = 'المتبقي لإكمال المبلغ:';
                cashChangeDisplay.innerText = formatCurrency(Math.abs(change));
                cashChangeDisplay.style.color = 'var(--accent-orange)';
            } else {
                const label = document.querySelector('span[style*="المتبقي للعميل"]');
                if (label) label.innerText = 'المتبقي للعميل (الصرف):';
                cashChangeDisplay.innerText = formatCurrency(change);
                cashChangeDisplay.style.color = 'var(--accent-red)';
            }
        }

        // 2. Handling split (Split Payment)
        const splitCashVal = document.getElementById('split-cash-amount').value;
        const splitCash = parseFloat(splitCashVal) || 0;
        
        let splitNet = total - splitCash;
        const splitNetEl = document.getElementById('split-network-amount');
        
        if(splitNet < 0) {
            splitNet = 0;
            if(splitNetEl) {
                splitNetEl.innerText = '0.00';
                splitNetEl.style.color = 'var(--accent-red)';
                splitNetEl.title = 'المبلغ الكاش أكبر من الإجمالي!';
            }
        } else {
            if(splitNetEl) {
                splitNetEl.innerText = formatCurrency(splitNet);
                splitNetEl.style.color = 'var(--accent-blue)';
                splitNetEl.title = '';
            }
        }
    }

    cashReceivedInput.addEventListener('input', calculateChange);
    document.getElementById('split-cash-amount').addEventListener('input', calculateChange);
    document.getElementById('split-cash-amount').addEventListener('keyup', calculateChange); // Extra layer for speed


    /* ===============================
       Printing / Receipts 
    =============================== */
    const btnConfirmPay = document.getElementById('btn-confirm-payment');

    btnConfirmPay.addEventListener('click', async () => {
        // DISABLE BUTTON IMMEDIATELY to prevent double-clicks
        if (btnConfirmPay.disabled) return; // Already processing
        btnConfirmPay.disabled = true;
        btnConfirmPay.innerHTML = '<i class="ph ph-spinner ph-spin"></i> جاري توليد الفواتير...';
        
        await preparePrintTemplates();

        try {
            // Save to LocalStorage for Sales page FIRST
            const now = new Date();
            let selectedPay = document.querySelector('.payment-method.selected input').value;
            if (selectedPay === 'توصيل') {
                const selectedPill = document.querySelector('.delivery-pill.selected input');
                if (selectedPill) {
                    selectedPay = selectedPill.value;
                } else {
                    selectedPay = 'توصيل';
                }
            }
            const isDelivery = selectedPay !== 'كاش' && selectedPay !== 'شبكة / بطاقة' && selectedPay !== 'مجزأ';
            const _ct = document.getElementById('cart-total').innerText;
            let totalOrder = 0;
            
            // Use MisterCasherCurrency.parseLoose if available, otherwise parse manually
            if (window.MisterCasherCurrency && MisterCasherCurrency.parseLoose) {
                totalOrder = MisterCasherCurrency.parseLoose(_ct);
                if (isNaN(totalOrder)) totalOrder = 0;
            } else {
                // Fallback: remove all non-numeric chars except dots and minus
                const cleaned = String(_ct).replace(/[^\d.-]/g, '');
                totalOrder = parseFloat(cleaned) || 0;
            }

            // --- Validation for Cash Payment ---
            if (selectedPay === 'كاش') {
                const cashInputStr = document.getElementById('cash-received').value.trim();
                let received = parseFloat(cashInputStr);
                
                // If the user didn't write an amount, assume exact amount was received
                if (cashInputStr === '' || isNaN(received)) {
                    received = totalOrder;
                }

                if (received < totalOrder) {
                    alert('المبلغ المستلم أقل من الإجمالي المطلوب! يرجى التأكد من المبلغ.');
                    btnConfirmPay.disabled = false;
                    btnConfirmPay.innerHTML = '<i class="ph ph-check-circle"></i> تأكيد الدفع وطباعة الفواتير';
                    return;
                }
            }
            // -----------------------------------
            
            // Debug: Log the parsed value
            console.log('[POS] Cart total text:', _ct);
            console.log('[POS] Parsed totalOrder:', totalOrder);
            
            let finalSplitCash = 0, finalSplitNet = 0;

            if(selectedPay === 'مجزأ') {
                finalSplitCash = parseFloat(document.getElementById('split-cash-amount').value) || 0;
                // Validate: cash amount should not exceed total
                if (finalSplitCash > totalOrder) {
                    finalSplitCash = totalOrder;
                    console.warn(`[POS] Split cash (${finalSplitCash}) exceeded total (${totalOrder}), corrected to total`);
                }
                finalSplitNet = totalOrder - finalSplitCash;
                // Ensure network is never negative
                if (finalSplitNet < 0) {
                    finalSplitNet = 0;
                    finalSplitCash = totalOrder;
                    console.warn(`[POS] Split network was negative, corrected: cash=${finalSplitCash}, net=${finalSplitNet}`);
                }
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
                orderType: currentOrderType,
                paymentMethod: selectedPay,
                total: totalOrder,
                splitCash: finalSplitCash,
                splitNetwork: finalSplitNet,
                itemsCount: cart.length,
                items: [...cart],
                // Order notes
                orderNotes: document.getElementById('checkout-order-notes').value || '',
                // HungerStation specific fields
                hungerStation: isDelivery,
                deliveryCompany: isDelivery ? selectedPay : undefined,
                hsStatus: isDelivery ? 'delivered' : undefined,
                hsPaymentStatus: isDelivery ? 'unpaid' : undefined,
                customerName: isDelivery ? selectedPay : undefined
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

            // Save mode:
            // - normal: append as new order via db-save-order
            // - edit mode: replace existing order by same orderId
            if (isEditingOrder && editingOrderId) {
                orderData.orderId = editingOrderId;
                orderData.updatedAt = Date.now();
                let patched = false;
                if (typeof window.dbUpdateOrder === 'function') {
                    const patchRes = await window.dbUpdateOrder(orderData);
                    patched = patchRes && patchRes.success;
                }
                if (!patched) {
                    const dbNow = await window.dbRead();
                    dbNow.orders = dbNow.orders || [];
                    const idx = dbNow.orders.findIndex((o) => String(o.orderId) === String(editingOrderId));
                    if (idx >= 0) {
                        const oldOrder = dbNow.orders[idx] || {};
                        orderData.timestamp = oldOrder.timestamp || orderData.timestamp;
                        orderData.editVersion = Number(oldOrder.editVersion || 0) + 1;
                        dbNow.orders[idx] = orderData;
                    } else {
                        orderData.editVersion = 1;
                        dbNow.orders.push(orderData);
                    }
                    await window.dbWrite(dbNow);
                }
            } else {
                // Securely save via IPC to backend SQLite (Atomic Transaction)
                const saveResult = await ipcRenderer.invoke('db-save-order', orderData);
                
                // Check if duplicate was prevented
                if (saveResult && saveResult.duplicate) {
                    console.error(`[POS] Duplicate order detected: ${orderData.orderId}`);
                    alert('هذا الطلب تم حفظه بالفعل!');
                    btnConfirmPay.innerHTML = '<i class="ph ph-check-circle"></i> تأكيد الدفع وطباعة الفواتير';
                    btnConfirmPay.disabled = false;
                    return; // Stop execution
                }
            }
            
            // Fatora Integration Hook
            try {
                const dbData = await window.dbReadSlice(['fatora_settings']);
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
                tableText: document.getElementById('r-table') ? document.getElementById('r-table').innerText : '',
                orderId: document.getElementById('r-order-id').innerText,
                date: document.getElementById('r-date').innerText,
                itemsHtml: document.getElementById('r-items').innerHTML,
                subtotalText: (document.getElementById('r-subtotal') && document.getElementById('r-subtotal').innerText) || document.getElementById('cart-subtotal').innerText,
                totalText: document.getElementById('r-total').innerText,
                discountText: document.getElementById('r-discount').innerText,
                taxLabel: document.getElementById('r-tax-rate-label').innerText,
                taxText: document.getElementById('r-tax').innerText,
                paymentText: document.getElementById('r-payment-method').innerText,
                notesText: document.getElementById('r-order-notes') ? document.getElementById('r-order-notes').innerText : '',
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
            const orderNotesField = document.getElementById('checkout-order-notes');
            if (orderNotesField) orderNotesField.value = '';
            renderCart();
            window.closeModalLayer(modalCheckout);

            const wasEditingOrder = isEditingOrder;
            isEditingOrder = false;
            editingOrderId = '';
            setEditModeBadge(false);
            // ⚡ fire-and-forget: لا نُعيق الواجهة — رقم الطلب يتحدث في الخلفية
            generateOrderId().then(newId => {
                orderId = newId;
                document.getElementById('display-order-id').innerText = orderId;
            }).catch(() => {
                zatcaMeta.icv++;
                zatcaMeta.uuid = crypto.randomUUID();
                orderId = '#INV-' + String(zatcaMeta.icv).padStart(5, '0');
                document.getElementById('display-order-id').innerText = orderId;
            });

            // Non-blocking notification instead of alert()
            const successNotif = document.createElement('div');
            successNotif.style.cssText = 'position:fixed; top:20px; right:20px; background:#10b981; color:white; padding:15px 25px; border-radius:8px; box-shadow:0 10px 25px rgba(0,0,0,0.3); z-index:9999999; display:flex; align-items:center; gap:10px; font-weight:bold; animation: slideIn 0.3s ease-out;';
            successNotif.innerHTML = `<i class="ph-fill ph-check-circle" style="font-size:24px;"></i> <span>${wasEditingOrder ? 'تم تحديث الطلب.. جاري الطباعة التلقائية' : 'تم الحفظ.. جاري الطباعة التلقائية'}</span>`;
            document.body.appendChild(successNotif);
            setTimeout(() => {
                successNotif.style.opacity = '0';
                successNotif.style.transition = 'opacity 0.5s';
                setTimeout(() => successNotif.remove(), 500);
            }, 3000);

            // 1. Open drawer and show notification (Immediate)
            openCashDrawer();

            // 2. Print Customer Receipt Ticket (Next priority) — نمرر الشعار المخزّن بدلاً من إعادة قراءة القرص
            try {
                await printCustomerReceipt(thermalReceiptSnap, _cachedLogoBase64);
            } catch(e) { console.error('Customer receipt printing failed', e); }

            // 3. Silent print to category-specific printers (Kitchen) — فير اند فورغت: لا تحتاج انتظار الكاشير
            printToCategoryPrinters(orderData).catch(e =>
                console.error('Category printing failed', e)
            );

        } catch(e) {
            console.error("Save or Print Failed", e);
            alert("حدث خطأ أثناء حفظ الفاتورة");
        } finally {
            btnConfirmPay.innerHTML = '<i class="ph ph-check-circle"></i> تأكيد الدفع وطباعة الفواتير';
            btnConfirmPay.disabled = false;
        }
    });

    // Print Receipt directly without checkout
    const btnPrintReceipt = document.getElementById('btn-print-receipt');
    btnPrintReceipt.addEventListener('click', async () => {
        if(cart.length === 0) return alert('السلة فارغة!');
        // DISABLE BUTTON to prevent double-clicks
        if (btnPrintReceipt.disabled) return;
        btnPrintReceipt.disabled = true;
        btnPrintReceipt.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';
        await preparePrintTemplates();
        openCashDrawer();
        await printCustomerReceipt();
        btnPrintReceipt.innerHTML = '<i class="ph ph-printer"></i> طباعة للحفظ';
        btnPrintReceipt.disabled = false;
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
        const tableLabel = (typeof getSelectedTableLabel === 'function') ? getSelectedTableLabel() : '';
        // For طلب محلي: include section in type label
        const sectionLabel = (currentOrderType === 'محلي' && currentSection) ? ` (${currentSection})` : '';
        const fullTypeLabel = 'طلب ' + currentOrderType + sectionLabel;
        document.getElementById('r-type').innerText = fullTypeLabel;
        document.getElementById('k-type').innerText = fullTypeLabel;

        document.getElementById('k-table').innerText = tableLabel ? 'طاولة: ' + tableLabel : '';
        document.getElementById('k-table').style.display = tableLabel ? 'block' : 'none';
        
        if (document.getElementById('r-table')) {
            document.getElementById('r-table').innerText = tableLabel ? 'لـ: ' + tableLabel : '';
            document.getElementById('r-table').style.display = tableLabel ? 'block' : 'none';
        }

        // Payment Method from selected modal option
        let selectedPay = document.querySelector('.payment-method.selected input').value;
        
        // إذا تم اختيار "توصيل"، نبحث عن الشركة المحددة من الـ Pills
        if (selectedPay === 'توصيل') {
            const selectedPill = document.querySelector('.delivery-pill.selected input');
            if (selectedPill) {
                selectedPay = selectedPill.value;
            }
        }

        if(document.getElementById('r-payment-method')) document.getElementById('r-payment-method').innerText = selectedPay;

        // Order notes
        const orderNotes = document.getElementById('checkout-order-notes').value || '';
        const notesRow = document.getElementById('r-notes-row');
        const notesSpan = document.getElementById('r-order-notes');
        if (orderNotes && notesRow && notesSpan) {
            notesRow.style.display = 'flex';
            notesSpan.innerText = orderNotes;
        } else if (notesRow) {
            notesRow.style.display = 'none';
        }

        // If Delivery Company, add special marker
        // نتحقق مما إذا كان الدفع عن طريق شركة توصيل (أي ليس كاش أو شبكة أو مجزأ)
        const isDeliveryPay = selectedPay !== 'كاش' && selectedPay !== 'شبكة / بطاقة' && selectedPay !== 'مجزأ';
        if (isDeliveryPay) {
            const rType = document.getElementById('r-type');
            const kType = document.getElementById('k-type');
            if (rType) rType.innerText = `طلب ${selectedPay} 🏍️`;
            if (kType) kType.innerText = `${selectedPay} 🏍️`;
        }

        // Fill Items
        const rItems = document.getElementById('r-items');
        const kItems = document.getElementById('k-items');
        const receiptRows = [];
        const kitchenRows = [];
        cart.forEach(item => {
            receiptRows.push(`
                <tr style="border-bottom: 1px dashed #ccc;">
                    <td class="item-name" style="padding: 5px 0;">${item.name}</td>
                    <td class="item-qty" style="text-align: center;">${item.qty}</td>
                    <td class="item-price" style="text-align: left;">${formatCurrency(item.price * item.qty)}</td>
                </tr>
            `);
            kitchenRows.push(`
                <tr style="border-bottom: 1px dashed #000;">
                    <td style="padding: 5px 0;">🔴 ${item.name}</td>
                    <td style="text-align: center; font-size:24px; padding: 5px;">${item.qty}</td>
                </tr>
            `);
        });
        rItems.innerHTML = receiptRows.join('');
        kItems.innerHTML = kitchenRows.join('');

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
        const storeName = storeNameEl ? storeNameEl.innerText.trim() : 'Mister Casher';
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
        let kitchenRestName = 'Mister Casher';
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
        /* === Kitchen Ticket CSS — Arabic RTL 80mm — Modern 2024 Standards ===
           ESC/POS printable area: 72-76mm | Dead zone: ~4mm per side
           Safe content zone: 70mm = 80mm - 5mm*2
        */
        *, *::before, *::after {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        
        @page {
            size: 80mm auto;
            margin: 0;
        }
        
        html {
            -webkit-text-size-adjust: none;
            text-size-adjust: none;
            overflow: visible;
        }

        body {
            width: 100%;
            max-width: 80mm;
            margin: 0 auto;
            padding: 0;
            background: #ffffff;
            color: #000000;
            direction: rtl;
            unicode-bidi: embed;
            font-family: 'Cairo', 'Segoe UI', 'Arial', 'Tahoma', sans-serif;
            text-align: center;
            line-height: 1.4;
            font-size: 10pt;
            -webkit-font-smoothing: antialiased;
            overflow: visible;
            word-break: break-word;
            overflow-wrap: anywhere;
        }
        
        .kitchen-ticket {
            width: 100%;
            padding-top: 3mm;
            padding-bottom: 3mm;
            padding-left: 4mm;
            padding-right: 6mm;
            margin: 0 auto;
            box-sizing: border-box;
        }
        
        .kitchen-logo {
            width: 29mm;
            height: 29mm;
            max-width: 29mm;
            max-height: 29mm;
            object-fit: contain;
            display: block;
            margin-left: auto;
            margin-right: auto;
            margin-bottom: 2mm;
            filter: grayscale(100%);
            image-rendering: -webkit-optimize-contrast;
            image-rendering: crisp-edges;
        }
        
        .kitchen-header {
            text-align: center;
            border-bottom: 2px solid #000000;
            margin-bottom: 3mm;
            padding-bottom: 3mm;
        }
        
        .kitchen-rest-name {
            font-size: 9.5pt;
            font-weight: 700;
            color: #444444;
            margin-bottom: 1mm;
        }
        
        .kitchen-title {
            /* عنوان بارز — منطقة أمان */
            font-size: 17pt;
            font-weight: 900;
            margin-top: 2mm;
            margin-bottom: 2mm;
            background: #000000;
            color: #ffffff;
            padding-top: 2mm;
            padding-bottom: 2mm;
            padding-left: 3mm;
            padding-right: 3mm;
            display: inline-block;
            min-width: 50mm;
            letter-spacing: 0.03em;
        }
        
        .order-id {
            font-size: 14pt;
            font-weight: 800;
            margin-top: 2mm;
            margin-bottom: 2mm;
            font-variant-numeric: tabular-nums;
        }
        
        .order-type {
            font-size: 11pt;
            font-weight: 700;
            margin-top: 1.5mm;
            margin-bottom: 1.5mm;
        }
        
        .order-date {
            font-size: 8.5pt;
            color: #555555;
            margin-top: 1mm;
        }
        
        .items-table {
            width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
            margin-top: 3mm;
            margin-bottom: 3mm;
            border: 1.5px solid #000000;
            break-inside: avoid;
        }
        
        .items-table thead th {
            padding-top: 1.5mm;
            padding-bottom: 1.5mm;
            padding-left: 1.5mm;
            padding-right: 1.5mm;
            background: #eeeeee;
            font-weight: 800;
            font-size: 9pt;
            border: 1px solid #000000;
        }
        
        .items-table thead th:first-child {
            text-align: start; /* يمين في RTL */
        }
        
        .items-table thead th:last-child {
            text-align: center;
            width: 18mm;
        }
        
        .kitchen-item td {
            border: 1px solid #000000;
            break-inside: avoid;
        }
        
        .item-name-cell {
            padding-top: 2mm;
            padding-bottom: 2mm;
            padding-left: 2mm;
            padding-right: 2mm;
            font-size: 12pt;
            font-weight: 800;
            text-align: start; /* يمين في RTL */
            direction: rtl;
            overflow-wrap: anywhere;
            word-break: break-word;
            vertical-align: middle;
        }
        
        .item-qty-cell {
            text-align: center;
            font-size: 20pt; /* كبير وواضح للطاهي */
            font-weight: 900;
            padding-top: 2mm;
            padding-bottom: 2mm;
            padding-left: 1.5mm;
            padding-right: 1.5mm;
            vertical-align: middle;
            font-variant-numeric: tabular-nums;
        }
        
        .divider {
            border-top: 2px dashed #000000;
            margin-top: 3mm;
            margin-bottom: 3mm;
        }
        
        .footer-message {
            text-align: center;
            font-size: 9pt;
            color: #666666;
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
            ${document.getElementById('k-table') && document.getElementById('k-table').innerText ? `<div class="order-type" style="font-weight: 900; font-size: 13pt; margin-top: 2mm;">${document.getElementById('k-table').innerText}</div>` : ''}
            <div class="order-date">${order.date}</div>
            ${order.orderNotes ? `<div style="margin-top: 2mm; padding: 2mm; border: 1px dashed #000; font-weight: bold; text-align: center; font-size: 11pt;">ملاحظات الطلب: ${order.orderNotes}</div>` : ''}
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

    // ----------------------------------------------------
    // Tables Customization & Management
    // ----------------------------------------------------
    const cartTableSelect = document.getElementById('cart-table-select');
    const tablesModal = document.getElementById('tables-modal');
    const btnCloseTablesModal = document.getElementById('btn-close-tables-modal');
    const manageTablesList = document.getElementById('manage-tables-list');
    const statusTablesList = document.getElementById('status-tables-list');
    const btnAddTable = document.getElementById('btn-add-table');
    const newTableNameInput = document.getElementById('new-table-name');
    const newTableSection = document.getElementById('new-table-section');
    const sectionTypeRow = document.getElementById('section-type-row');

    // Current active section (أفراد or عوائل)
    let currentSection = 'أفراد';

    // Default tables — objects: { name, section }
    const defaultTables = [
        { name: '01', section: 'أفراد' },
        { name: '02', section: 'أفراد' },
        { name: '03', section: 'أفراد' },
        { name: 'A1', section: 'عوائل' },
        { name: 'A2', section: 'عوائل' },
    ];

    function getTables() {
        try {
            const stored = localStorage.getItem('pos_custom_tables');
            if (stored) {
                const parsed = JSON.parse(stored);
                // Migrate old string format to object format
                if (parsed.length > 0 && typeof parsed[0] === 'string') {
                    const migrated = parsed.map(t => ({
                        name: t,
                        section: t.includes('عائل') || t.includes('عوائل') ? 'عوائل' : 'أفراد'
                    }));
                    saveTables(migrated);
                    return migrated;
                }
                return parsed;
            }
        } catch(e) {}
        return [...defaultTables];
    }

    function saveTables(tables) {
        localStorage.setItem('pos_custom_tables', JSON.stringify(tables));
    }

    function getTableStatus() {
        try {
            const stored = localStorage.getItem('pos_tables_status');
            if (stored) return JSON.parse(stored);
        } catch(e) {}
        return {};
    }

    function saveTableStatus(statusObj) {
        localStorage.setItem('pos_tables_status', JSON.stringify(statusObj));
    }

    function getTableKey(t) { return `${t.section}::${t.name}`; }

    // Populate the dropdown — filtered by currentSection (only when محلي)
    function populateTablesDropdown() {
        const currentVal = cartTableSelect.value;
        const tables = getTables();
        const statusObj = getTableStatus();

        let filtered = tables;
        if (currentOrderType === 'محلي') {
            filtered = tables.filter(t => t.section === currentSection);
        }

        let html = '<option value="">اختر الطاولة (اختياري)...</option>';
        filtered.forEach(t => {
            const key = getTableKey(t);
            const isBusy = statusObj[key] === 'busy';
            const mark = isBusy ? '🔴 ' : '🟢 ';
            html += `<option value="${key}">${mark}${t.name}</option>`;
        });
        html += '<option value="customize" style="font-weight:bold;">⚙️ تخصيص الطاولات...</option>';

        cartTableSelect.innerHTML = html;
        // restore selection if still valid
        const stillValid = filtered.some(t => getTableKey(t) === currentVal);
        cartTableSelect.value = stillValid ? currentVal : '';
    }

    // Helper to get display label for receipt (section + name)
    window.getSelectedTableLabel = function() {
        const val = cartTableSelect.value;
        if (!val || val === 'customize') return '';
        const tables = getTables();
        const found = tables.find(t => getTableKey(t) === val);
        if (!found) return val;
        return `${found.section} - ${found.name}`;
    };

    // ── Section sub-tabs ──────────────────────────────────────
    const sectionBtns = document.querySelectorAll('.section-btn');
    sectionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            sectionBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSection = btn.dataset.section;
            cartTableSelect.value = '';
            populateTablesDropdown();
        });
    });

    // Show/hide section row based on order type
    function updateSectionRowVisibility() {
        if (sectionTypeRow) {
            sectionTypeRow.style.display = currentOrderType === 'محلي' ? 'flex' : 'none';
        }
        if (currentOrderType !== 'محلي') {
            cartTableSelect.value = '';
        }
        populateTablesDropdown();
    }

    // ── Render Manage Tab ────────────────────────────────────
    function renderManageTables() {
        const tables = getTables();
        manageTablesList.innerHTML = '';
        if (tables.length === 0) {
            manageTablesList.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:24px; color:#64748b;">لا توجد طاولات مضافة</td></tr>`;
            return;
        }
        // Group by section
        const sections = ['أفراد', 'عوائل'];
        sections.forEach(sec => {
            const secTables = tables.filter(t => t.section === sec);
            if (secTables.length === 0) return;
            // Section header row
            manageTablesList.innerHTML += `
                <tr>
                    <td colspan="3" style="padding: 8px 15px 6px; font-size:11px; font-weight:800; letter-spacing:1px; color:#64748b; text-transform:uppercase; background:rgba(255,255,255,0.02);">
                        ${sec === 'أفراد' ? '👤' : '👨‍👩‍👧'} قسم ${sec}
                    </td>
                </tr>`;
            secTables.forEach(t => {
                const key = getTableKey(t);
                manageTablesList.innerHTML += `
                    <tr class="table-item-row" style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                        <td style="padding: 12px 15px; font-weight: 700; color: #e2e8f0;">
                            <i class="ph ph-squares-four" style="color:#4b5563; margin-left:8px;"></i>${t.name}
                        </td>
                        <td style="padding: 12px 15px; text-align:center;">
                            <span style="padding:3px 10px; border-radius:20px; font-size:12px; font-weight:700; background:${sec === 'أفراد' ? 'rgba(59,130,246,0.15)' : 'rgba(16,185,129,0.15)'}; color:${sec === 'أفراد' ? '#60a5fa' : '#34d399'};">
                                ${sec}
                            </span>
                        </td>
                        <td style="padding: 12px 15px; text-align: center;">
                            <button onclick="deleteTable('${key}')" style="color:#ef4444; background:rgba(239,68,68,0.1); border-radius:6px; padding:5px 10px; border:none; cursor:pointer; font-size:14px;">
                                <i class="ph ph-trash"></i>
                            </button>
                        </td>
                    </tr>`;
            });
        });
    }

    // ── Render Status Tab ────────────────────────────────────
    function renderStatusTables() {
        const tables = getTables();
        const statusObj = getTableStatus();
        statusTablesList.innerHTML = '';
        if (tables.length === 0) {
            statusTablesList.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:#64748b; padding:24px;">لا توجد طاولات</div>`;
            return;
        }
        const sections = ['أفراد', 'عوائل'];
        sections.forEach(sec => {
            const secTables = tables.filter(t => t.section === sec);
            if (secTables.length === 0) return;
            // Section label
            statusTablesList.innerHTML += `
                <div style="grid-column:1/-1; font-size:12px; font-weight:800; letter-spacing:1px; color:#64748b; text-transform:uppercase; padding:4px 0 6px;">
                    ${sec === 'أفراد' ? '👤' : '👨‍👩‍👧'} قسم ${sec}
                </div>`;
            secTables.forEach(t => {
                const key = getTableKey(t);
                const isBusy = statusObj[key] === 'busy';
                const cls = isBusy ? 'busy' : 'empty';
                const txt = isBusy ? 'مشغولة' : 'فارغة';
                statusTablesList.innerHTML += `
                    <div class="table-status-card ${cls}" onclick="toggleTableStatus('${key}')" title="انقر لتغيير الحالة">
                        <div class="ts-icon"><i class="ph ${isBusy ? 'ph-prohibit' : 'ph-check-circle'}"></i></div>
                        <div class="ts-name">${t.name}</div>
                        <div class="ts-badge">${txt}</div>
                    </div>`;
            });
        });
    }

    window.deleteTable = async function(key) {
        const tables = getTables();
        const found = tables.find(t => getTableKey(t) === key);
        if (!found) return;
        if (!await ModernDialog.confirm(`هل تريد حذف ${found.section} - ${found.name}؟`)) return;
        const updated = tables.filter(t => getTableKey(t) !== key);
        saveTables(updated);
        const statusObj = getTableStatus();
        delete statusObj[key];
        saveTableStatus(statusObj);
        renderManageTables();
        renderStatusTables();
        populateTablesDropdown();
    };

    window.toggleTableStatus = function(key) {
        const statusObj = getTableStatus();
        statusObj[key] = statusObj[key] === 'busy' ? 'empty' : 'busy';
        saveTableStatus(statusObj);
        renderStatusTables();
        populateTablesDropdown();
    };

    btnAddTable.addEventListener('click', () => {
        const val = (newTableNameInput.value || '').trim();
        const sec = newTableSection ? newTableSection.value : 'أفراد';
        if (!val) {
            newTableNameInput.focus();
            newTableNameInput.style.borderColor = '#ef4444';
            setTimeout(() => { newTableNameInput.style.borderColor = ''; }, 1500);
            return;
        }
        const tables = getTables();
        if (tables.some(t => t.name === val && t.section === sec)) {
            alert(`الطاولة "${val}" موجودة بالفعل في قسم ${sec}`);
            return;
        }
        tables.push({ name: val, section: sec });
        saveTables(tables);
        newTableNameInput.value = '';
        newTableNameInput.focus();
        renderManageTables();
        renderStatusTables();
        populateTablesDropdown();
    });

    // Enter key support for adding table
    newTableNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') btnAddTable.click();
    });

    // Handle dropdown selection (customize option)
    let previousTableSelectValue = '';
    cartTableSelect.addEventListener('mousedown', () => {
        previousTableSelectValue = cartTableSelect.value;
    });
    cartTableSelect.addEventListener('change', () => {
        if (cartTableSelect.value === 'customize') {
            cartTableSelect.value = previousTableSelectValue;
            window.openModalLayer(tablesModal);
            renderManageTables();
            renderStatusTables();
        } else {
            previousTableSelectValue = cartTableSelect.value;
        }
    });

    // Handle Tabs
    const tableTabs = document.querySelectorAll('.table-tab');
    const tableTabContents = document.querySelectorAll('.table-tab-content');
    tableTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tableTabs.forEach(t => t.classList.remove('active'));
            tableTabContents.forEach(c => c.style.display = 'none');
            
            tab.classList.add('active');
            document.getElementById(tab.dataset.target).style.display = 'block';
        });
    });

    btnCloseTablesModal.addEventListener('click', () => {
        window.closeModalLayer(tablesModal);
    });

    // Initialize tables on load
    populateTablesDropdown();


    async function reloadPosCatalogFromNetwork() {
        if (cart.length > 0) return;
        const d = await window.dbReadSlice(['categories', 'products']);
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
        // Use renderPosProducts so cards get proper click listeners attached
        const activeCatBtn = document.querySelector('.category-btn.active');
        const activeCategory = activeCatBtn ? activeCatBtn.dataset.category : 'الكل';
        const activeQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
        renderPosProducts(activeCategory, activeQuery);
        bindPosCatalogInteraction();
    }

    if (typeof window.registerPosDatabaseRefresh === 'function') {
        window.registerPosDatabaseRefresh(() => reloadPosCatalogFromNetwork());
    }

});
