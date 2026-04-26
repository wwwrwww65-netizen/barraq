/**
 * Fix Negative Network Balance in Sales
 * Run from Console (F12) to fix existing orders with negative splitNetwork values
 */

(async function fixNegativeNetworkBalance() {
    console.log('🔧 Fixing negative network balance in sales...\n');
    
    try {
        const db = await window.dbRead();
        const orders = db.orders || [];
        
        console.log(`📊 Total orders in database: ${orders.length}`);
        
        let fixedCount = 0;
        let issues = [];
        
        orders.forEach((order, index) => {
            const total = Number(order.total) || 0;
            const splitCash = Number(order.splitCash) || 0;
            const splitNetwork = Number(order.splitNetwork) || 0;
            const pm = (order.paymentMethod || '').trim();
            
            // Check for split payment orders
            if (pm === 'مجزأ') {
                let needsFix = false;
                let newCash = splitCash;
                let newNetwork = splitNetwork;
                
                // Issue 1: Negative network value
                if (splitNetwork < 0) {
                    issues.push({
                        orderId: order.orderId,
                        issue: 'Negative Network',
                        total,
                        oldCash: splitCash,
                        oldNetwork: splitNetwork
                    });
                    
                    // Fix: Set network to 0, cash to total
                    newNetwork = 0;
                    newCash = total;
                    needsFix = true;
                    
                    console.warn(`❌ ${order.orderId}: Network ${splitNetwork.toFixed(2)} → 0, Cash ${splitCash.toFixed(2)} → ${total.toFixed(2)}`);
                }
                
                // Issue 2: Negative cash value
                if (splitCash < 0) {
                    issues.push({
                        orderId: order.orderId,
                        issue: 'Negative Cash',
                        total,
                        oldCash: splitCash,
                        oldNetwork: splitNetwork
                    });
                    
                    // Fix: Set cash to 0, network to total
                    newCash = 0;
                    newNetwork = total;
                    needsFix = true;
                    
                    console.warn(`❌ ${order.orderId}: Cash ${splitCash.toFixed(2)} → 0, Network ${splitNetwork.toFixed(2)} → ${total.toFixed(2)}`);
                }
                
                // Issue 3: Sum doesn't match total
                if (Math.abs((newCash + newNetwork) - total) > 0.01) {
                    issues.push({
                        orderId: order.orderId,
                        issue: 'Sum Mismatch',
                        total,
                        oldCash: newCash,
                        oldNetwork: newNetwork,
                        sum: newCash + newNetwork
                    });
                    
                    // Recalculate network
                    newNetwork = total - newCash;
                    if (newNetwork < 0) {
                        newNetwork = 0;
                        newCash = total;
                    }
                    needsFix = true;
                    
                    console.warn(`❌ ${order.orderId}: Sum mismatch (${newCash.toFixed(2)} + ${newNetwork.toFixed(2)} ≠ ${total.toFixed(2)})`);
                }
                
                // Issue 4: No split values stored
                if (splitCash === 0 && splitNetwork === 0 && total > 0) {
                    issues.push({
                        orderId: order.orderId,
                        issue: 'Missing Split Values',
                        total,
                        oldCash: 0,
                        oldNetwork: 0
                    });
                    
                    // Assume all cash
                    newCash = total;
                    newNetwork = 0;
                    needsFix = true;
                    
                    console.warn(`⚠️ ${order.orderId}: No split values → Assuming all cash`);
                }
                
                // Apply fix
                if (needsFix) {
                    order.splitCash = Math.round(newCash * 100) / 100;
                    order.splitNetwork = Math.round(newNetwork * 100) / 100;
                    order.fixedAt = new Date().toISOString();
                    fixedCount++;
                }
            }
        });
        
        console.log(`\n📋 Issues Found: ${issues.length}`);
        if (issues.length > 0) {
            console.table(issues);
        }
        
        if (fixedCount > 0) {
            console.log(`\n💾 Saving fixes to database...`);
            await window.dbWrite(db);
            console.log(`✅ Fixed ${fixedCount} orders successfully!`);
            console.log('🔄 Please refresh the sales page to see updated values.');
        } else {
            console.log('\n✅ No orders need fixing. All split payment values are correct.');
        }
        
        // Calculate current sales summary
        console.log('\n💰 Sales Summary (After Fix):');
        let totalRevenue = 0;
        let totalCash = 0;
        let totalNetwork = 0;
        
        orders.forEach(o => {
            totalRevenue += Number(o.total) || 0;
            const pm = (o.paymentMethod || '').trim();
            
            if (pm === 'مجزأ') {
                totalCash += Number(o.splitCash) || 0;
                totalNetwork += Number(o.splitNetwork) || 0;
            } else if (pm.includes('كاش') || pm === 'cash') {
                totalCash += Number(o.total) || 0;
            } else if (pm.includes('شبكة') || pm === 'network' || pm.includes('بطاقة')) {
                totalNetwork += Number(o.total) || 0;
            }
        });
        
        console.log(`   Total Revenue: ${totalRevenue.toFixed(2)} ر.س`);
        console.log(`   Cash Sales: ${totalCash.toFixed(2)} ر.س`);
        console.log(`   Network Sales: ${totalNetwork.toFixed(2)} ر.س`);
        console.log(`   Check: ${totalCash.toFixed(2)} + ${totalNetwork.toFixed(2)} = ${(totalCash + totalNetwork).toFixed(2)}`);
        
        return {
            fixedCount,
            issuesFound: issues.length,
            totalRevenue,
            totalCash,
            totalNetwork
        };
        
    } catch (error) {
        console.error('❌ Error fixing negative network balance:', error);
        throw error;
    }
})();
