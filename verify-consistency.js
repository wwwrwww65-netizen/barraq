/**
 * أداة التحقق من تطابق المبيعات والرصيد في جميع الصفحات
 * تشغيل من Console (F12) — يطابق منطق dashboard.js و payment-split.js
 */

(async function verifyAllPages() {
    console.log('🔍 جاري التحقق من تطابق البيانات في جميع الصفحات...\n');

    const PS = window.PaymentSplit;
    if (!PS) {
        console.warn('⚠️ payment-split.js غير محمّل — النتائج قد لا تطابق لوحة التحكم.');
    }

    const db = await window.dbRead();
    const orders = db.orders || [];
    const returns = db.returns || [];
    const expenses = (db.hrExpenses || []).concat(db.expenses || []);

    const lastZReport = parseInt(localStorage.getItem('last_z_report_time')) || 0;
    const shiftCashFloat = parseFloat(localStorage.getItem('shift_cash_float')) || 0;

    const shiftOrders = orders.filter(
        (o) =>
            o.status !== 'returned' &&
            (o.timestamp || o.createdAt || 0) >= lastZReport,
    );

    const shiftExpenses = expenses.filter((e) => (e.timestamp || 0) >= lastZReport);

    console.log('📊 بيانات الجلسة الحالية (بعد آخر Z):');
    console.log(`- رصيد افتتاحي: ${shiftCashFloat.toFixed(2)} ر.س`);
    console.log(`- عدد الطلبات (غير مرتجعة): ${shiftOrders.length}`);

    let cashSales = 0;
    let networkSales = 0;
    let hungerStationUnpaid = 0;
    let totalSales = 0;

    shiftOrders.forEach((order) => {
        totalSales += Number(order.total) || 0;
        if (PS) {
            const pay = PS.splitOrderAmounts(order);
            cashSales += pay.cash;
            networkSales += pay.network;
            hungerStationUnpaid += pay.hungerStation || 0;
        } else {
            const pm = (order.paymentMethod || '').trim();
            if (pm.includes('كاش')) cashSales += order.total || 0;
            else if (pm.includes('شبكة') || pm.includes('بطاقة')) networkSales += order.total || 0;
            else if (pm === 'مجزأ') {
                cashSales += order.splitCash || 0;
                networkSales += order.splitNetwork || 0;
            } else networkSales += order.total || 0;
        }
    });

    const shiftCashExpenses = PS
        ? PS.sumCashDrawerExpenses(shiftExpenses)
        : shiftExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const calculatedDrawerBalance = shiftCashFloat + cashSales - shiftCashExpenses;

    console.log('\n💰 المبيعات:');
    console.log(`- إجمالي المبيعات: ${totalSales.toFixed(2)} ر.س`);
    console.log(`- مبيعات كاش (للدرج): ${cashSales.toFixed(2)} ر.س`);
    console.log(`- مبيعات شبكة (جلسة): ${networkSales.toFixed(2)} ر.س`);
    console.log(`- توصيل غير مدفوع: ${hungerStationUnpaid.toFixed(2)} ر.س`);

    console.log('\n💸 مصروفات كاش الجلسة:');
    console.log(`- ${shiftCashExpenses.toFixed(2)} ر.س (البنك/الشبكة لا تُخصم من الدرج)`);

    console.log('\n💵 رصيد الدرج:');
    console.log(`- ${shiftCashFloat.toFixed(2)} + ${cashSales.toFixed(2)} - ${shiftCashExpenses.toFixed(2)} = ${calculatedDrawerBalance.toFixed(2)} ر.س`);

    if (window.__dashboardData) {
        const dashDrawer = window.__dashboardData.drawerBalance || 0;
        const diff = Math.abs(calculatedDrawerBalance - dashDrawer);
        console.log('\n🔍 مقارنة مع الرئيسية:');
        console.log(`- verify: ${calculatedDrawerBalance.toFixed(2)} ر.س`);
        console.log(`- Dashboard: ${dashDrawer.toFixed(2)} ر.س`);
        console.log(`- الفرق: ${diff.toFixed(2)} ر.س`);
        if (diff > 0.01) console.warn('⚠️ يوجد فرق في رصيد الدرج!');
        else console.log('✅ رصيد الدرج متطابق!');
    } else {
        console.log('\n💡 افتح الصفحة الرئيسية أولاً لمقارنة رصيد الدرج.');
    }

    if (PS) {
        const agg = PS.aggregateOrderRevenue(orders);
        console.log('\n📒 السيولة التراكمية (تقريبية):');
        console.log(`- كاش من مبيعات نشطة: ${agg.cash.toFixed(2)} ر.س`);
        console.log(`- بنك/شبكة من مبيعات نشطة: ${agg.bank.toFixed(2)} ر.س`);
    }
})();
