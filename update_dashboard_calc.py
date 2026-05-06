import os

file_path = r'e:\baraaq\dashboard.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update splitOrderAmountsGlobal
old_split_global = """    function splitOrderAmountsGlobal(o) {
        const pm = String(o?.paymentMethod || '').trim();
        const total = Number(o?.total) || 0;
        const isHS = o?.hungerStation === true || o?.orderType === 'توصيل';
        const isHSPaid = o?.hsPaymentStatus === 'paid';
        
        // HungerStation unpaid orders should NOT affect drawer balance
        if (isHS && !isHSPaid) {
            return { cash: 0, network: 0, hungerStation: total };
        }
        
        // HungerStation paid - check payment method
        if (isHS && isHSPaid) {
            const hsMethod = (o?.hsPaymentMethod || '').trim();
            if (hsMethod.includes('كاش') || hsMethod === 'cash') {
                return { cash: total, network: 0, hungerStation: 0 };
            } else {
                return { cash: 0, network: total, hungerStation: 0 };
            }
        }
        
        if (pm === 'مجزأ') {
            const c = Number(o?.splitCash) || 0;
            const n = Number(o?.splitNetwork) || 0;
            
            // Validation: if split values are invalid, use total as cash
            if (c < 0 || n < 0) {
                console.warn(`[Dashboard Global] Order ${o?.orderId}: Invalid split values (cash=${c}, net=${n}), using total as cash`);
                return { cash: total, network: 0, hungerStation: 0 };
            }
            
            if (c || n) return { cash: c, network: n, hungerStation: 0 };
            // If no split values stored, assume all cash
            return { cash: total, network: 0, hungerStation: 0 };
        }
        if (pm.includes('كاش') || pm === 'cash') return { cash: total, network: 0, hungerStation: 0 };
        return { cash: 0, network: total, hungerStation: 0 };
    }"""

new_split_global = """    function splitOrderAmountsGlobal(o) {
        const pm = String(o?.paymentMethod || '').trim();
        const total = Number(o?.total) || 0;
        const isHS = o?.hungerStation === true || o?.orderType === 'توصيل';
        const isHSPaid = o?.hsPaymentStatus === 'paid';
        
        let deliveryCompany = o?.deliveryCompany || 'توصيل';
        if (o?.hungerStation === true && !o?.deliveryCompany) deliveryCompany = 'هنقرستيشن';

        // HungerStation unpaid orders should NOT affect drawer balance
        if (isHS && !isHSPaid) {
            let db = {}; db[deliveryCompany] = total;
            return { cash: 0, network: 0, hungerStation: total, deliveryBreakdown: db };
        }
        
        // HungerStation paid - check payment method
        if (isHS && isHSPaid) {
            const hsMethod = (o?.hsPaymentMethod || '').trim();
            if (hsMethod.includes('كاش') || hsMethod === 'cash') {
                return { cash: total, network: 0, hungerStation: 0, deliveryBreakdown: {} };
            } else {
                return { cash: 0, network: total, hungerStation: 0, deliveryBreakdown: {} };
            }
        }
        
        if (pm === 'مجزأ') {
            const c = Number(o?.splitCash) || 0;
            const n = Number(o?.splitNetwork) || 0;
            
            // Validation: if split values are invalid, use total as cash
            if (c < 0 || n < 0) {
                console.warn(`[Dashboard Global] Order ${o?.orderId}: Invalid split values (cash=${c}, net=${n}), using total as cash`);
                return { cash: total, network: 0, hungerStation: 0, deliveryBreakdown: {} };
            }
            
            if (c || n) return { cash: c, network: n, hungerStation: 0, deliveryBreakdown: {} };
            // If no split values stored, assume all cash
            return { cash: total, network: 0, hungerStation: 0, deliveryBreakdown: {} };
        }
        if (pm.includes('كاش') || pm === 'cash') return { cash: total, network: 0, hungerStation: 0, deliveryBreakdown: {} };
        return { cash: 0, network: total, hungerStation: 0, deliveryBreakdown: {} };
    }"""
content = content.replace(old_split_global, new_split_global)

# 2. Update splitOrderAmounts
old_split = """    function splitOrderAmounts(o) {
        const pm = String(o.paymentMethod || '').trim();
        const total = Number(o.total) || 0;
        const isHS = o.hungerStation === true || o.orderType === 'توصيل';
        const isHSPaid = o.hsPaymentStatus === 'paid';
        
        // HungerStation unpaid orders should NOT affect drawer balance
        if (isHS && !isHSPaid) {
            return { cash: 0, network: 0, hungerStation: total };
        }
        
        // HungerStation paid - check payment method
        if (isHS && isHSPaid) {
            const hsMethod = (o.hsPaymentMethod || '').trim();
            if (hsMethod.includes('كاش') || hsMethod === 'cash') {
                return { cash: total, network: 0, hungerStation: 0 };
            } else {
                return { cash: 0, network: total, hungerStation: 0 };
            }
        }
        
        if (pm === 'مجزأ') {
            const c = Number(o.splitCash) || 0;
            const n = Number(o.splitNetwork) || 0;
            
            // Validation: if split values are invalid, use total as cash
            if (c < 0 || n < 0) {
                console.warn(`[Dashboard] Order ${o.orderId}: Invalid split values (cash=${c}, net=${n}), using total as cash`);
                return { cash: total, network: 0, hungerStation: 0 };
            }
            
            if (c || n) return { cash: c, network: n, hungerStation: 0 };
            // If no split values stored, assume all cash
            return { cash: total, network: 0, hungerStation: 0 };
        }
        if (pm.includes('كاش') || pm === 'cash') return { cash: total, network: 0, hungerStation: 0 };
        return { cash: 0, network: total, hungerStation: 0 };
    }"""

new_split = """    function splitOrderAmounts(o) {
        const pm = String(o.paymentMethod || '').trim();
        const total = Number(o.total) || 0;
        const isHS = o.hungerStation === true || o.orderType === 'توصيل';
        const isHSPaid = o.hsPaymentStatus === 'paid';
        
        let deliveryCompany = o.deliveryCompany || 'توصيل';
        if (o.hungerStation === true && !o.deliveryCompany) deliveryCompany = 'هنقرستيشن';

        // HungerStation unpaid orders should NOT affect drawer balance
        if (isHS && !isHSPaid) {
            let db = {}; db[deliveryCompany] = total;
            return { cash: 0, network: 0, hungerStation: total, deliveryBreakdown: db };
        }
        
        // HungerStation paid - check payment method
        if (isHS && isHSPaid) {
            const hsMethod = (o.hsPaymentMethod || '').trim();
            if (hsMethod.includes('كاش') || hsMethod === 'cash') {
                return { cash: total, network: 0, hungerStation: 0, deliveryBreakdown: {} };
            } else {
                return { cash: 0, network: total, hungerStation: 0, deliveryBreakdown: {} };
            }
        }
        
        if (pm === 'مجزأ') {
            const c = Number(o.splitCash) || 0;
            const n = Number(o.splitNetwork) || 0;
            
            // Validation: if split values are invalid, use total as cash
            if (c < 0 || n < 0) {
                console.warn(`[Dashboard] Order ${o.orderId}: Invalid split values (cash=${c}, net=${n}), using total as cash`);
                return { cash: total, network: 0, hungerStation: 0, deliveryBreakdown: {} };
            }
            
            if (c || n) return { cash: c, network: n, hungerStation: 0, deliveryBreakdown: {} };
            // If no split values stored, assume all cash
            return { cash: total, network: 0, hungerStation: 0, deliveryBreakdown: {} };
        }
        if (pm.includes('كاش') || pm === 'cash') return { cash: total, network: 0, hungerStation: 0, deliveryBreakdown: {} };
        return { cash: 0, network: total, hungerStation: 0, deliveryBreakdown: {} };
    }"""
content = content.replace(old_split, new_split)

# 3. Update shift calculation variables
content = content.replace("let shiftCashSales = 0;\n    let shiftHungerStationUnpaid = 0;", "let shiftCashSales = 0;\n    let shiftHungerStationUnpaid = 0;\n    let shiftDeliveryBreakdown = {};")

old_shift_acc = """    shiftOrders.forEach(o => {
        const pay = splitOrderAmounts(o);
        shiftCashSales += pay.cash;
        shiftHungerStationUnpaid += (pay.hungerStation || 0);
    });"""

new_shift_acc = """    shiftOrders.forEach(o => {
        const pay = splitOrderAmounts(o);
        shiftCashSales += pay.cash;
        shiftHungerStationUnpaid += (pay.hungerStation || 0);
        if (pay.deliveryBreakdown) {
            for (const [comp, amt] of Object.entries(pay.deliveryBreakdown)) {
                shiftDeliveryBreakdown[comp] = (shiftDeliveryBreakdown[comp] || 0) + amt;
            }
        }
    });"""
content = content.replace(old_shift_acc, new_shift_acc)

content = content.replace("window.__dashboardData = { dailySales, cashSales, networkSales, totalTax, totalReturnsAmt, totalExp, shiftCashFloat, drawerBalance, shiftHungerStationUnpaid };", "window.__dashboardData = { dailySales, cashSales, networkSales, totalTax, totalReturnsAmt, totalExp, shiftCashFloat, drawerBalance, shiftHungerStationUnpaid, shiftDeliveryBreakdown };")

# 4. update confirmCloseShift calculations
old_close_shift_vars = "let shiftCash = 0, shiftNetwork = 0, shiftTotal = 0, shiftHSUnpaid = 0;"
new_close_shift_vars = "let shiftCash = 0, shiftNetwork = 0, shiftTotal = 0, shiftHSUnpaid = 0, shiftDeliveryBreakdown = {};"
content = content.replace(old_close_shift_vars, new_close_shift_vars)

old_close_shift_loop = """        shiftOrders.forEach(o => {
            const pay = splitOrderAmountsGlobal(o);
            shiftCash += pay.cash;
            shiftNetwork += pay.network;
            shiftTotal += o.total || 0;
            shiftHSUnpaid += (pay.hungerStation || 0);
        });"""

new_close_shift_loop = """        shiftOrders.forEach(o => {
            const pay = splitOrderAmountsGlobal(o);
            shiftCash += pay.cash;
            shiftNetwork += pay.network;
            shiftTotal += o.total || 0;
            shiftHSUnpaid += (pay.hungerStation || 0);
            if (pay.deliveryBreakdown) {
                for (const [comp, amt] of Object.entries(pay.deliveryBreakdown)) {
                    shiftDeliveryBreakdown[comp] = (shiftDeliveryBreakdown[comp] || 0) + amt;
                }
            }
        });"""
content = content.replace(old_close_shift_loop, new_close_shift_loop)

# 5. Update shift_history push
old_shift_push = """            hungerStationUnpaid: shiftHSUnpaid,
            drawerBalance: shiftDrawerBalance,"""
new_shift_push = """            hungerStationUnpaid: shiftHSUnpaid,
            deliveryBreakdown: shiftDeliveryBreakdown,
            drawerBalance: shiftDrawerBalance,"""
content = content.replace(old_shift_push, new_shift_push)

# 6. Update openDayCloseReport processing
old_day_shift_loop = """            // Only include non-returned orders in totals
            rOrders.forEach(o => {
                // Skip returned orders - they're tracked via returns instead
                if (o.status === 'returned') return;
                
                tax += o.total - (o.total / (1 + TAX_RATE));
                const pay = splitOrderAmountsGlobal(o);
                cash += pay.cash;
                net += pay.network;
                hsUnpaid += (pay.hungerStation || 0);
            });"""

new_day_shift_loop = """            let sDeliveryBreakdown = {};
            // Only include non-returned orders in totals
            rOrders.forEach(o => {
                // Skip returned orders - they're tracked via returns instead
                if (o.status === 'returned') return;
                
                tax += o.total - (o.total / (1 + TAX_RATE));
                const pay = splitOrderAmountsGlobal(o);
                cash += pay.cash;
                net += pay.network;
                hsUnpaid += (pay.hungerStation || 0);
                if (pay.deliveryBreakdown) {
                    for (const [comp, amt] of Object.entries(pay.deliveryBreakdown)) {
                        sDeliveryBreakdown[comp] = (sDeliveryBreakdown[comp] || 0) + amt;
                    }
                }
            });"""
content = content.replace(old_day_shift_loop, new_day_shift_loop)

old_day_shift_return = """                totalExpenses: exp,
                hungerStationUnpaid: hsUnpaid,
                drawerBalance: floatAmt + cash - exp
            };"""
new_day_shift_return = """                totalExpenses: exp,
                hungerStationUnpaid: hsUnpaid,
                deliveryBreakdown: sDeliveryBreakdown,
                drawerBalance: floatAmt + cash - exp
            };"""
content = content.replace(old_day_shift_return, new_day_shift_return)

old_day_totals = """        // ---- Grand Day Totals ----
        let dayTotalCash = 0, dayTotalNet = 0, dayTotalTax = 0, dayTotalRet = 0, dayTotalExp = 0, dayTotalOrders = 0, dayTotalHSUnpaid = 0;
        allDayShifts.forEach(s => {
            dayTotalCash    += s.cashSales    || 0;
            dayTotalNet     += s.networkSales || 0;
            dayTotalTax     += s.totalTax     || 0;
            dayTotalRet     += s.totalReturns || 0;
            dayTotalExp     += s.totalExpenses|| 0;
            dayTotalOrders  += s.ordersCount  || 0;
            dayTotalHSUnpaid += s.hungerStationUnpaid || 0;
        });"""

new_day_totals = """        // ---- Grand Day Totals ----
        let dayTotalCash = 0, dayTotalNet = 0, dayTotalTax = 0, dayTotalRet = 0, dayTotalExp = 0, dayTotalOrders = 0, dayTotalHSUnpaid = 0;
        let dayDeliveryBreakdown = {};
        allDayShifts.forEach(s => {
            dayTotalCash    += s.cashSales    || 0;
            dayTotalNet     += s.networkSales || 0;
            dayTotalTax     += s.totalTax     || 0;
            dayTotalRet     += s.totalReturns || 0;
            dayTotalExp     += s.totalExpenses|| 0;
            dayTotalOrders  += s.ordersCount  || 0;
            dayTotalHSUnpaid += s.hungerStationUnpaid || 0;
            if (s.deliveryBreakdown) {
                for (const [comp, amt] of Object.entries(s.deliveryBreakdown)) {
                    dayDeliveryBreakdown[comp] = (dayDeliveryBreakdown[comp] || 0) + amt;
                }
            }
        });"""
content = content.replace(old_day_totals, new_day_totals)

old_day_snapshot = "window.__dayCloseSnapshot = { allDayShifts, dayTotalCash, dayTotalNet, dayTotalTax, dayTotalRet, dayTotalExp, dayTotalIncome, dayNetTotal, dayDrawerTotal, dayTotalOrders, dayDate: todayStr, closedAt: now.getTime(), dayTotalHSUnpaid };"
new_day_snapshot = "window.__dayCloseSnapshot = { allDayShifts, dayTotalCash, dayTotalNet, dayTotalTax, dayTotalRet, dayTotalExp, dayTotalIncome, dayNetTotal, dayDrawerTotal, dayTotalOrders, dayDate: todayStr, closedAt: now.getTime(), dayTotalHSUnpaid, dayDeliveryBreakdown };"
content = content.replace(old_day_snapshot, new_day_snapshot)

old_day_history_push = """            netTotal: snap.dayNetTotal || 0,
            hungerStationUnpaid: snap.dayTotalHSUnpaid || 0,
            drawerTotal: snap.dayDrawerTotal || 0,"""
new_day_history_push = """            netTotal: snap.dayNetTotal || 0,
            hungerStationUnpaid: snap.dayTotalHSUnpaid || 0,
            deliveryBreakdown: snap.dayDeliveryBreakdown || {},
            drawerTotal: snap.dayDrawerTotal || 0,"""
content = content.replace(old_day_history_push, new_day_history_push)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Dashboard calc changes applied.")
