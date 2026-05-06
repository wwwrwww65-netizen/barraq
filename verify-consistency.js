/**
 * أداة التحقق من تطابق المبيعات والرصيد في جميع الصفحات
 * تشغيل من Console (F12)
 */

(async function verifyAllPages() {
    console.log('🔍 جاري التحقق من تطابق البيانات في جميع الصفحات...\n');
    
    const db = await window.dbRead();
    const orders = db.orders || [];
    const returns = db.returns || [];
    const expenses = (db.hrExpenses || []).concat(db.expenses || []);
    
    const lastZReport = parseInt(localStorage.getItem('last_z_report_time')) || 0;
    const shiftCashFloat = parseFloat(localStorage.getItem('shift_cash_float')) || 0;
    
    // تصفية طلبات اليوم (بعد آخر إقفال)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const shiftOrders = orders.filter(o => 
        (o.timestamp || o.createdAt || 0) >= lastZReport &&
        (o.timestamp || o.createdAt || 0) >= todayStart.getTime()
    );
    
    const shiftReturns = returns.filter(r =>
        (r.timestamp || 0) >= lastZReport &&
        (r.timestamp || 0) >= todayStart.getTime()
    );
    
    const shiftExpenses = expenses.filter(e =>
        (e.timestamp || 0) >= lastZReport &&
        (e.timestamp || 0) >= todayStart.getTime()
    );
    
    console.log('📊 بيانات الفترة الحالية:');
    console.log(`- رصيد افتتاحي: ${shiftCashFloat.toFixed(2)} ر.س`);
    console.log(`- عدد الطلبات: ${shiftOrders.length}`);
    console.log(`- عدد المرتجعات: ${shiftReturns.length}`);
    console.log(`- عدد المصروفات: ${shiftExpenses.length}`);
    
    // حساب المبيعات
    let totalSales = 0;
    let cashSales = 0;
    let networkSales = 0;
    let hungerStationUnpaid = 0;
    let splitIssues = [];
    
    shiftOrders.forEach(order => {
        totalSales += order.total || 0;
        const pm = (order.paymentMethod || '').trim();
        
        if (pm === 'مجزأ') {
            const cash = Number(order.splitCash) || 0;
            const net = Number(order.splitNetwork) || 0;
            
            if (cash < 0 || net < 0) {
                splitIssues.push({
                    orderId: order.orderId,
                    issue: 'قيم سالبة',
                    cash,
                    net,
                    total: order.total
                });
            }
            
            if (cash + net === 0 && order.total > 0) {
                splitIssues.push({
                    orderId: order.orderId,
                    issue: 'قيم مفقودة',
                    cash,
                    net,
                    total: order.total
                });
                cashSales += order.total;
            } else if (cash < 0 || net < 0) {
                cashSales += order.total;
            } else {
                cashSales += cash;
                networkSales += net;
            }
        } else if (pm.includes('كاش')) {
            cashSales += order.total;
        } else if (pm.includes('شبكة') || pm.includes('بطاقة')) {
            networkSales += order.total;
        } else if (pm === 'توصيل' && order.hsPaymentStatus !== 'paid') {
            hungerStationUnpaid += order.total;
        } else {
            networkSales += order.total;
        }
    });
    
    // حساب المرتجعات
    let totalReturns = 0;
    let returnCash = 0;
    let returnNetwork = 0;
    
    shiftReturns.forEach(r => {
        totalReturns += r.amount || 0;
        const pm = (r.method || '').trim();
        if (pm.includes('كاش')) {
            returnCash += r.amount;
        } else {
            returnNetwork += r.amount;
        }
    });
    
    // حساب المصروفات
    let totalExpenses = 0;
    shiftExpenses.forEach(e => {
        totalExpenses += e.amount || 0;
    });
    
    // حساب رصيد الدرج
    const calculatedDrawerBalance = shiftCashFloat + cashSales - returnCash - totalExpenses;
    
    console.log('\n💰 المبيعات:');
    console.log(`- إجمالي المبيعات: ${totalSales.toFixed(2)} ر.س`);
    console.log(`- مبيعات كاش: ${cashSales.toFixed(2)} ر.س`);
    console.log(`- مبيعات شبكة: ${networkSales.toFixed(2)} ر.س`);
    console.log(`- توصيل غير مدفوع: ${hungerStationUnpaid.toFixed(2)} ر.س`);
    
    console.log('\n🔄 المرتجعات:');
    console.log(`- إجمالي المرتجعات: ${totalReturns.toFixed(2)} ر.س`);
    console.log(`- مرتجعات كاش: ${returnCash.toFixed(2)} ر.س`);
    console.log(`- مرتجعات شبكة: ${returnNetwork.toFixed(2)} ر.س`);
    
    console.log('\n💸 المصروفات:');
    console.log(`- إجمالي المصروفات: ${totalExpenses.toFixed(2)} ر.س`);
    
    console.log('\n💵 رصيد الدرج:');
    console.log(`- الرصيد الافتتاحي: ${shiftCashFloat.toFixed(2)} ر.س`);
    console.log(`- + مبيعات كاش: ${cashSales.toFixed(2)} ر.س`);
    console.log(`- - مرتجعات كاش: ${returnCash.toFixed(2)} ر.س`);
    console.log(`- - المصروفات: ${totalExpenses.toFixed(2)} ر.س`);
    console.log(`- = الرصيد المتوقع: ${calculatedDrawerBalance.toFixed(2)} ر.س`);
    
    // مقارنة مع صفحة المصروفات إذا كانت متوفرة
    if (window.__dashboardData) {
        const dashDrawer = window.__dashboardData.drawerBalance || 0;
        const diff = Math.abs(calculatedDrawerBalance - dashDrawer);
        console.log('\n🔍 مقارنة مع الرئيسية:');
        console.log(`- الرصيد في verify: ${calculatedDrawerBalance.toFixed(2)} ر.س`);
        console.log(`- الرصيد في Dashboard: ${dashDrawer.toFixed(2)} ر.س`);
        console.log(`- الفرق: ${diff.toFixed(2)} ر.س`);
        if (diff > 0.01) {
            console.warn(`⚠️ يوجد فرق في رصيد الدرج!`);
        } else {
            console.log(`✅ رصيد الدرج متطابق!`);
        }
    }
    
    // التحقق من المشاكل
    console.log('\n' + '='.repeat(60));
    console.log('🔍 نتائج التحقق:');
    console.log('='.repeat(60));
    
    let hasIssues = false;
    
    // 1. التحقق من المجزأ
    if (splitIssues.length > 0) {
        hasIssues = true;
        console.log('\n❌ مشاكل في الدفع المجزأ:');
        console.table(splitIssues);
    } else {
        console.log('\n✅ الدفع المجزأ: صحيح');
    }
    
    // 2. التحقق من المعادلة
    const expectedTotal = cashSales + networkSales + hungerStationUnpaid;
    if (Math.abs(expectedTotal - totalSales) > 0.01) {
        hasIssues = true;
        console.log(`\n❌ خطأ في حساب المبيعات:`);
        console.log(`   الإجمالي: ${totalSales.toFixed(2)}`);
        console.log(`   كاش + شبكة + توصيل: ${expectedTotal.toFixed(2)}`);
        console.log(`   الفرق: ${(expectedTotal - totalSales).toFixed(2)}`);
    } else {
        console.log('\n✅ معادلة المبيعات: صحيحة');
    }
    
    // 3. التحقق من الرصيد
    const storedDrawerBalance = parseFloat(localStorage.getItem('shift_cash_float') || '0');
    const actualDrawerBalance = storedDrawerBalance; // This is the current value
    
    console.log(`\n💵 رصيد الدرج:`);
    console.log(`   الرصيد المخزون: ${storedDrawerBalance.toFixed(2)} ر.س`);
    console.log(`   الرصيد المحسوب: ${calculatedDrawerBalance.toFixed(2)} ر.س`);
    
    // 4. ملخص شامل
    console.log('\n' + '='.repeat(60));
    console.log('📋 الملخص الشامل:');
    console.log('='.repeat(60));
    console.log(`إجمالي المبيعات: ${totalSales.toFixed(2)} ر.س`);
    console.log(`  ├── كاش: ${cashSales.toFixed(2)} ر.س`);
    console.log(`  ├── شبكة: ${networkSales.toFixed(2)} ر.س`);
    console.log(`  └── توصيل (غير مدفوع): ${hungerStationUnpaid.toFixed(2)} ر.س`);
    console.log(`المرتجعات: ${totalReturns.toFixed(2)} ر.س`);
    console.log(`المصروفات: ${totalExpenses.toFixed(2)} ر.س`);
    console.log(`رصيد الدرج المتوقع: ${calculatedDrawerBalance.toFixed(2)} ر.س`);
    
    if (!hasIssues) {
        console.log('\n✅ جميع البيانات صحيحة ومتطابقة!');
    } else {
        console.log('\n⚠️ توجد مشاكل - راجع التفاصيل أعلاه');
        console.log('💡 للإصلاح، نفذ: await fixSplitOrders();');
    }
    
    return {
        totalSales,
        cashSales,
        networkSales,
        hungerStationUnpaid,
        totalReturns,
        totalExpenses,
        calculatedDrawerBalance,
        hasIssues,
        splitIssues
    };
})();
