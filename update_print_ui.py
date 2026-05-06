import os
import re

file_path = r'e:\baraaq\dashboard.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update openShiftReport modal rendering
old_shift_modal_hs = "document.getElementById('shift-hungerstation').innerText = curPlain(d.shiftHungerStationUnpaid || 0);"
new_shift_modal_hs = """const shiftDeliveryContainer = document.getElementById('shift-delivery-breakdown-container');
        if (shiftDeliveryContainer) {
            shiftDeliveryContainer.innerHTML = '';
            if (d.shiftDeliveryBreakdown && Object.keys(d.shiftDeliveryBreakdown).length > 0) {
                for (const [comp, amt] of Object.entries(d.shiftDeliveryBreakdown)) {
                    shiftDeliveryContainer.insertAdjacentHTML('beforeend', `
                    <div class="receipt-row">
                        <span>إجمالي ${comp}:</span>
                        <span style="color:#ff6b00;">${curPlain(amt)}</span>
                    </div>
                    `);
                }
            } else {
                shiftDeliveryContainer.insertAdjacentHTML('beforeend', `
                <div class="receipt-row">
                    <span>إجمالي التوصيل:</span>
                    <span style="color:#ff6b00;">${curPlain(d.shiftHungerStationUnpaid || 0)}</span>
                </div>
                `);
            }
        }"""
content = content.replace(old_shift_modal_hs, new_shift_modal_hs)

# 2. Update printShiftReport reading and rendering
old_print_shift_read = "const hungerStation = document.getElementById('shift-hungerstation').innerText;"
new_print_shift_read = """// Read delivery breakdown from container
        let deliveryPrintRows = '';
        const shiftDeliveryContainer = document.getElementById('shift-delivery-breakdown-container');
        if (shiftDeliveryContainer && shiftDeliveryContainer.children.length > 0) {
            for (let child of shiftDeliveryContainer.children) {
                const spans = child.querySelectorAll('span');
                if (spans.length >= 2) {
                    deliveryPrintRows += `<tr class="row-light"><td>${spans[0].innerText}</td><td>${spans[1].innerText}</td></tr>`;
                }
            }
        }"""
content = content.replace(old_print_shift_read, new_print_shift_read)

old_print_shift_html = """                <tr class="row-light"><td>إجمالي هنقرستيشن</td><td>${hungerStation}</td></tr>"""
new_print_shift_html = """                ${deliveryPrintRows}"""
content = content.replace(old_print_shift_html, new_print_shift_html)


# 3. Update openDayCloseReport modal rendering
old_day_modal_hs = "document.getElementById('day-total-hs-unpaid').innerText = curPlain(dayTotalHSUnpaid);"
new_day_modal_hs = """const dayDeliveryContainer = document.getElementById('day-delivery-breakdown-container');
        if (dayDeliveryContainer) {
            dayDeliveryContainer.innerHTML = '';
            if (dayDeliveryBreakdown && Object.keys(dayDeliveryBreakdown).length > 0) {
                for (const [comp, amt] of Object.entries(dayDeliveryBreakdown)) {
                    dayDeliveryContainer.insertAdjacentHTML('beforeend', `
                    <div class="receipt-row">
                        <span>إجمالي ${comp}:</span>
                        <span style="color:#ff6b00;">${curPlain(amt)}</span>
                    </div>
                    `);
                }
            } else {
                dayDeliveryContainer.insertAdjacentHTML('beforeend', `
                <div class="receipt-row">
                    <span>إجمالي التوصيل:</span>
                    <span style="color:#ff6b00;">${curPlain(dayTotalHSUnpaid)}</span>
                </div>
                `);
            }
        }"""
content = content.replace(old_day_modal_hs, new_day_modal_hs)

old_day_with_hs_label = "document.getElementById('day-total-with-hs').innerText = curPlain(dayTotalIncome + dayTotalHSUnpaid);"
new_day_with_hs_label = """document.getElementById('day-total-with-hs').innerText = curPlain(dayTotalIncome + dayTotalHSUnpaid);
        const dayTotalWithDeliveryLabel = document.getElementById('day-total-with-delivery-label');
        if (dayTotalWithDeliveryLabel) {
            const compNames = Object.keys(dayDeliveryBreakdown || {});
            if (compNames.length === 1) {
                dayTotalWithDeliveryLabel.innerText = 'الإجمالي مع ' + compNames[0] + ':';
            } else if (compNames.length > 1) {
                dayTotalWithDeliveryLabel.innerText = 'الإجمالي مع شركات التوصيل:';
            } else {
                dayTotalWithDeliveryLabel.innerText = 'الإجمالي مع التوصيل:';
            }
        }"""
content = content.replace(old_day_with_hs_label, new_day_with_hs_label)

old_day_shift_sDelivery = "${s.hungerStationUnpaid > 0 ? `<div class=\"receipt-row\"><span>توصيل غير مدفوع:</span><span style=\"color:#ff6b00;\">${curPlain(s.hungerStationUnpaid||0)}</span></div>` : ''}"
new_day_shift_sDelivery = """${(function(){
                        let sDeliveryHtml = '';
                        if (s.deliveryBreakdown && Object.keys(s.deliveryBreakdown).length > 0) {
                            for (const [comp, amt] of Object.entries(s.deliveryBreakdown)) {
                                sDeliveryHtml += `<div class="receipt-row"><span>توصيل ${comp}:</span><span style="color:#ff6b00;">${curPlain(amt)}</span></div>`;
                            }
                        } else if (s.hungerStationUnpaid > 0) {
                            sDeliveryHtml = `<div class="receipt-row"><span>توصيل غير مدفوع:</span><span style="color:#ff6b00;">${curPlain(s.hungerStationUnpaid||0)}</span></div>`;
                        }
                        return sDeliveryHtml;
                    })()}"""
content = content.replace(old_day_shift_sDelivery, new_day_shift_sDelivery)

# 4. Update printDayReport reading and rendering
old_print_day_read = "const hungerStation = document.getElementById('day-total-hs-unpaid').innerText;"
new_print_day_read = """// Read delivery breakdown from container
        let deliveryPrintRowsDay = '';
        const dayDeliveryContainer = document.getElementById('day-delivery-breakdown-container');
        if (dayDeliveryContainer && dayDeliveryContainer.children.length > 0) {
            for (let child of dayDeliveryContainer.children) {
                const spans = child.querySelectorAll('span');
                if (spans.length >= 2) {
                    deliveryPrintRowsDay += `<tr class="row-light"><td>${spans[0].innerText}</td><td>${spans[1].innerText}</td></tr>`;
                }
            }
        }"""
content = content.replace(old_print_day_read, new_print_day_read)

old_print_day_html = """                <tr class="row-light"><td>إجمالي هنقرستيشن</td><td>${hungerStation}</td></tr>"""
new_print_day_html = """                ${deliveryPrintRowsDay}"""
content = content.replace(old_print_day_html, new_print_day_html)

old_print_day_with_hs = "const totalWithHS = document.getElementById('day-total-with-hs').innerText;"
new_print_day_with_hs = """const totalWithHS = document.getElementById('day-total-with-hs').innerText;
        const totalWithHSLabel = document.getElementById('day-total-with-delivery-label') ? document.getElementById('day-total-with-delivery-label').innerText.replace(':', '') : 'الإجمالي مع التوصيل';"""
content = content.replace(old_print_day_with_hs, new_print_day_with_hs)

old_print_day_with_hs_tr = """<tr class="row-strong"><td>الإجمالي مع توصيل</td><td>${totalWithHS}</td></tr>"""
new_print_day_with_hs_tr = """<tr class="row-strong"><td>${totalWithHSLabel}</td><td>${totalWithHS}</td></tr>"""
content = content.replace(old_print_day_with_hs_tr, new_print_day_with_hs_tr)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("UI changes applied to dashboard.js successfully.")
