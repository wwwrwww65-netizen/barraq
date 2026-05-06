import os

file_path = r'e:\baraaq\index.html'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update shift modal hungerstation row
old_shift_hs = """                    <div class="receipt-row">
                        <span>إجمالي هنقرستيشن:</span>
                        <span id="shift-hungerstation" style="color:#ff6b00;">0.00 <span class="js-cur-sym">ر.س</span></span>
                    </div>"""
new_shift_hs = """                    <div id="shift-delivery-breakdown-container"></div>"""
content = content.replace(old_shift_hs, new_shift_hs)

# 2. Update day modal hungerstation row
old_day_hs = """                    <div class="receipt-row">
                        <span>إجمالي هنقرستيشن:</span>
                        <span id="day-total-hs-unpaid">0.00 <span class="js-cur-sym">ر.س</span></span>
                    </div>"""
new_day_hs = """                    <div id="day-delivery-breakdown-container"></div>"""
content = content.replace(old_day_hs, new_day_hs)

# 3. Update day modal grand total with hs label
old_day_with_hs = """                    <div class="receipt-row bold" style="background:#f8fafc; padding:8px; border-radius:4px; margin-top:4px; border:1px solid #e2e8f0; color:#1e293b;">
                        <span>الإجمالي مع هنقرستيشن:</span>
                        <span id="day-total-with-hs">0.00 <span class="js-cur-sym">ر.س</span></span>
                    </div>"""
new_day_with_hs = """                    <div class="receipt-row bold" style="background:#f8fafc; padding:8px; border-radius:4px; margin-top:4px; border:1px solid #e2e8f0; color:#1e293b;">
                        <span id="day-total-with-delivery-label">الإجمالي مع التوصيل:</span>
                        <span id="day-total-with-hs">0.00 <span class="js-cur-sym">ر.س</span></span>
                    </div>"""
content = content.replace(old_day_with_hs, new_day_with_hs)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("index.html updated successfully.")
