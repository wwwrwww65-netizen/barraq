import re

with open('e:/baraaq/pos.js', 'r', encoding='utf8') as f:
    content = f.read()

# 1. Update the delivery methods rendering logic
old_render_logic = """        let html = '';
        companies.forEach(c => {
            if (c.isActive !== false) {
                html += `
                <label class="payment-method" style="flex:1; padding: 15px; border: 2px solid var(--border-light); border-radius: 8px; cursor: pointer; background: rgba(15, 23, 42, 0.4);">
                    <input type="radio" name="pay_method" value="${c.name}" style="display:none;">
                    <i class="ph ph-motorcycle" style="font-size: 32px; color: var(--text-muted); display: block; margin-bottom: 8px;"></i>
                    <strong style="color: var(--text-muted)">${c.name}</strong>
                </label>`;
            }
        });"""

new_render_logic = """        let activeCompanies = companies.filter(c => c.isActive !== false);
        if (activeCompanies.length === 0) {
            activeCompanies = [{ name: 'هنقرستيشن' }];
        }

        let html = '';
        if (activeCompanies.length === 1) {
            html += `
            <label class="payment-method" style="flex:1; padding: 15px; border: 2px solid var(--border-light); border-radius: 8px; cursor: pointer; background: rgba(15, 23, 42, 0.4);">
                <input type="radio" name="pay_method" value="${activeCompanies[0].name}" style="display:none;">
                <i class="ph ph-motorcycle" style="font-size: 32px; color: var(--text-muted); display: block; margin-bottom: 8px;"></i>
                <strong style="color: var(--text-muted)">${activeCompanies[0].name}</strong>
            </label>`;
        } else {
            html += `
            <label class="payment-method" style="flex:1; padding: 15px; border: 2px solid var(--border-light); border-radius: 8px; cursor: pointer; background: rgba(15, 23, 42, 0.4);">
                <input type="radio" name="pay_method" value="توصيل" style="display:none;">
                <i class="ph ph-motorcycle" style="font-size: 32px; color: var(--text-muted); display: block; margin-bottom: 8px;"></i>
                <strong style="color: var(--text-muted)">شركات التوصيل</strong>
            </label>`;
            
            let selectorContainer = document.getElementById('delivery-company-selector-container');
            if (!selectorContainer) {
                selectorContainer = document.createElement('div');
                selectorContainer.id = 'delivery-company-selector-container';
                selectorContainer.style.cssText = 'display:none; flex-direction: column; gap: 10px; margin-bottom: 20px; text-align:right; border: 1px dashed var(--accent-blue); padding:10px; border-radius:8px; background: rgba(59, 130, 246, 0.05);';
                
                const splitCalc = document.getElementById('split-calculator');
                splitCalc.parentNode.insertBefore(selectorContainer, splitCalc);
            }
            selectorContainer.innerHTML = `
                <label style="color: var(--accent-blue); font-size:14px; font-weight:700;">اختر شركة التوصيل:</label>
                <div style="display:flex; gap:10px; flex-wrap:wrap;" id="delivery-company-pills">
                    ${activeCompanies.map((c, i) => `
                        <label class="delivery-pill ${i===0?'selected':''}" style="flex:1; padding:10px; border: 2px solid ${i===0?'var(--accent-blue)':'var(--border-light)'}; border-radius:8px; cursor:pointer; text-align:center; background: ${i===0?'rgba(59, 130, 246, 0.1)':'rgba(15, 23, 42, 0.4)'}; transition:all 0.2s;">
                            <input type="radio" name="specific_delivery_company" value="${c.name}" ${i===0?'checked':''} style="display:none;">
                            <strong style="color: ${i===0?'white':'var(--text-muted)'}; font-size: 14px;">${c.name}</strong>
                        </label>
                    `).join('')}
                </div>
            `;

            setTimeout(() => {
                const pills = document.querySelectorAll('.delivery-pill');
                pills.forEach(p => {
                    p.addEventListener('click', () => {
                        pills.forEach(x => {
                            x.classList.remove('selected');
                            x.style.borderColor = 'var(--border-light)';
                            x.style.background = 'rgba(15, 23, 42, 0.4)';
                            x.querySelector('strong').style.color = 'var(--text-muted)';
                        });
                        p.classList.add('selected');
                        p.style.borderColor = 'var(--accent-blue)';
                        p.style.background = 'rgba(59, 130, 246, 0.1)';
                        p.querySelector('strong').style.color = 'white';
                    });
                });
            }, 50);
        }"""
content = content.replace(old_render_logic, new_render_logic)


# 2. Update toggle UI logic
old_toggle_logic = """            // Toggle Display
            const pt = label.querySelector('input').value;
            const isDelivery = pt !== 'كاش' && pt !== 'شبكة / بطاقة' && pt !== 'مجزأ';
            document.getElementById('cash-calculator').style.display = pt === 'كاش' ? 'flex' : 'none';
            document.getElementById('split-calculator').style.display = pt === 'مجزأ' ? 'flex' : 'none';"""

new_toggle_logic = """            // Toggle Display
            const pt = label.querySelector('input').value;
            const isDelivery = pt === 'توصيل' || (pt !== 'كاش' && pt !== 'شبكة / بطاقة' && pt !== 'مجزأ');
            
            document.getElementById('cash-calculator').style.display = pt === 'كاش' ? 'flex' : 'none';
            document.getElementById('split-calculator').style.display = pt === 'مجزأ' ? 'flex' : 'none';
            
            const deliverySelector = document.getElementById('delivery-company-selector-container');
            if (deliverySelector) {
                deliverySelector.style.display = pt === 'توصيل' ? 'flex' : 'none';
            }"""
content = content.replace(old_toggle_logic, new_toggle_logic)


# 3. Update Order Saving variable extraction
old_save_logic = """            const selectedPay = document.querySelector('.payment-method.selected input').value;
            const isDelivery = selectedPay !== 'كاش' && selectedPay !== 'شبكة / بطاقة' && selectedPay !== 'مجزأ';
            const _ct = document.getElementById('cart-total').innerText;"""

new_save_logic = """            let selectedPay = document.querySelector('.payment-method.selected input').value;
            if (selectedPay === 'توصيل') {
                const selectedPill = document.querySelector('.delivery-pill.selected input');
                if (selectedPill) selectedPay = selectedPill.value;
            }
            const isDelivery = selectedPay !== 'كاش' && selectedPay !== 'شبكة / بطاقة' && selectedPay !== 'مجزأ';
            const _ct = document.getElementById('cart-total').innerText;"""
content = content.replace(old_save_logic, new_save_logic)


with open('e:/baraaq/pos.js', 'w', encoding='utf8') as f:
    f.write(content)

print("Modifications applied successfully.")
