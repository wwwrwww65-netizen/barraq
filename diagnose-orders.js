/**
 * أداة تشخيص وإصلاح الطلبات ذات القيم الخاطئة
 * تشغيل من Console (F12)
 */

(async function diagnoseOrders() {
    console.log('🔍 جاري فحص جميع الطلبات...');
    
    const db = await window.dbRead();
    const orders = db.orders || [];
    
    let issues = [];
    let fixed = [];
    
    orders.forEach((order, index) => {
        const total = Number(order.total) || 0;
        const splitCash = Number(order.splitCash) || 0;
        const splitNetwork = Number(order.splitNetwork) || 0;
        const pm = order.paymentMethod || '';
        
        // التحقق من القيم السالبة
        if (total < 0) {
            issues.push({
                index,
                orderId: order.orderId,
                issue: 'TOTAL_NEGATIVE',
                total,
                splitCash,
                splitNetwork,
                paymentMethod: pm
            });
        }
        
        // التحقق من الدفع المجزأ
        if (pm === 'مجزأ') {
            // قيم سالبة
            if (splitCash < 0 || splitNetwork < 0) {
                issues.push({
                    index,
                    orderId: order.orderId,
                    issue: 'SPLIT_NEGATIVE',
                    total,
                    splitCash,
                    splitNetwork,
                    paymentMethod: pm
                });
            }
            
            // مجموع المجزأ لا يساوي الإجمالي
            if (Math.abs((splitCash + splitNetwork) - total) > 0.01) {
                issues.push({
                    index,
                    orderId: order.orderId,
                    issue: 'SPLIT_MISMATCH',
                    total,
                    splitCash,
                    splitNetwork,
                    difference: (splitCash + splitNetwork) - total,
                    paymentMethod: pm
                });
            }
            
            // لا توجد قيم مجزأة
            if (splitCash === 0 && splitNetwork === 0 && total > 0) {
                issues.push({
                    index,
                    orderId: order.orderId,
                    issue: 'SPLIT_MISSING',
                    total,
                    splitCash,
                    splitNetwork,
                    paymentMethod: pm
                });
            }
        }
    });
    
    console.log(`\n📊 نتيجة الفحص:`);
    console.log(`- إجمالي الطلبات: ${orders.length}`);
    console.log(`- مشاكل موجودة: ${issues.length}`);
    
    if (issues.length > 0) {
        console.table(issues);
        
        console.log('\n💡 للإصلاح التلقائي، نفذ في Console:');
        console.log('await fixSplitOrders();');
    } else {
        console.log('\n✅ لا توجد مشاكل!');
    }
    
    return issues;
})();

/**
 * إصلاح الطلبات ذات القيم الخاطئة
 */
async function fixSplitOrders() {
    console.log('🔧 جاري إصلاح الطلبات...');
    
    const db = await window.dbRead();
    const orders = db.orders || [];
    
    let fixedCount = 0;
    
    orders.forEach((order) => {
        const total = Number(order.total) || 0;
        const pm = order.paymentMethod || '';
        
        if (pm === 'مجزأ') {
            let splitCash = Number(order.splitCash) || 0;
            let splitNetwork = Number(order.splitNetwork) || 0;
            let changed = false;
            
            // إصلاح القيم السالبة
            if (splitCash < 0) {
                console.warn(`  ⚠️ ${order.orderId}: splitCash سالب (${splitCash}) → 0`);
                splitCash = 0;
                changed = true;
            }
            
            if (splitNetwork < 0) {
                console.warn(`  ⚠️ ${order.orderId}: splitNetwork سالب (${splitNetwork}) → 0`);
                splitNetwork = 0;
                changed = true;
            }
            
            // إذا لم توجد قيم، افترض كاش كامل
            if (splitCash === 0 && splitNetwork === 0 && total > 0) {
                console.warn(`  ⚠️ ${order.orderId}: لا توجد قيم مجزأة → افتراض كاش كامل`);
                splitCash = total;
                splitNetwork = 0;
                changed = true;
            }
            
            // إذا المجموع لا يساوي الإجمالي، عدّل الشبكة
            if (Math.abs((splitCash + splitNetwork) - total) > 0.01) {
                console.warn(`  ⚠️ ${order.orderId}: مجموع المجزأ (${splitCash + splitNetwork}) ≠ الإجمالي (${total})`);
                splitNetwork = total - splitCash;
                if (splitNetwork < 0) {
                    splitNetwork = 0;
                    splitCash = total;
                }
                changed = true;
            }
            
            if (changed) {
                order.splitCash = splitCash;
                order.splitNetwork = splitNetwork;
                fixedCount++;
            }
        }
    });
    
    if (fixedCount > 0) {
        await window.dbWrite(db);
        console.log(`\n✅ تم إصلاح ${fixedCount} طلب`);
        console.log('⚠️ يرجى إعادة تحميل الصفحة');
    } else {
        console.log('\n✅ لا توجد طلبات تحتاج إصلاح');
    }
    
    return fixedCount;
}
