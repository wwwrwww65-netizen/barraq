/**
 * منطق موحّد لتقسيم المبيعات والمرتجعات (كاش / شبكة / توصيل).
 * يُستخدم في لوحة التحكم، المحاسبة، التقارير، والقيود.
 */
(function (root) {
    'use strict';

    function round2(n) {
        return Math.round((Number(n) || 0) * 100) / 100;
    }

    function isDeliveryOrder(o) {
        return o?.hungerStation === true || o?.orderType === 'توصيل' || o?.orderType === 'هنقرستيشن';
    }

    function isDeliveryPaid(o) {
        return o?.hsPaymentStatus === 'paid';
    }

    /** تقسيم للدرج والجلسة — يطابق dashboard.js */
    function splitOrderAmounts(o) {
        const pm = String(o?.paymentMethod || '').trim();
        const total = round2(o?.total);
        const isHS = isDeliveryOrder(o);
        const isHSPaid = isDeliveryPaid(o);

        let deliveryCompany = o?.deliveryCompany || 'توصيل';
        if (o?.hungerStation === true && !o?.deliveryCompany) deliveryCompany = 'هنقرستيشن';

        if (isHS && !isHSPaid) {
            const breakdown = {};
            breakdown[deliveryCompany] = total;
            return { cash: 0, network: 0, hungerStation: total, deliveryBreakdown: breakdown };
        }

        if (isHS && isHSPaid) {
            const hsMethod = String(o?.hsPaymentMethod || '').trim();
            if (hsMethod.includes('كاش') || hsMethod === 'cash') {
                return { cash: total, network: 0, hungerStation: 0, deliveryBreakdown: {} };
            }
            return { cash: 0, network: total, hungerStation: 0, deliveryBreakdown: {} };
        }

        if (pm === 'مجزأ') {
            const c = round2(o?.splitCash);
            const n = round2(o?.splitNetwork);
            if (c < 0 || n < 0) {
                return { cash: total, network: 0, hungerStation: 0, deliveryBreakdown: {} };
            }
            if (c || n) return { cash: c, network: n, hungerStation: 0, deliveryBreakdown: {} };
            return { cash: total, network: 0, hungerStation: 0, deliveryBreakdown: {} };
        }
        if (pm.includes('كاش') || pm === 'cash' || pm === 'نقد') {
            return { cash: total, network: 0, hungerStation: 0, deliveryBreakdown: {} };
        }
        return { cash: 0, network: total, hungerStation: 0, deliveryBreakdown: {} };
    }

    /** سيولة محاسبية (خزينة/بنك) — يستبعد التوصيل غير المدفوع والطلبات المرتجعة */
    function orderToCashBank(o) {
        if (o?.status === 'returned') return { c: 0, b: 0 };
        const pay = splitOrderAmounts(o);
        return { c: pay.cash, b: pay.network };
    }

    function splitReturnAmounts(r) {
        const pm = String(r?.method || '').trim();
        const amount = round2(r?.amount);
        if (pm === 'مجزأ') {
            const c = round2(r?.splitCash);
            const n = round2(r?.splitNetwork);
            if (c || n) return { cash: c, network: n };
            return { cash: 0, network: amount };
        }
        if (pm.includes('كاش') || pm === 'cash' || pm === 'نقد') return { cash: amount, network: 0 };
        return { cash: 0, network: amount };
    }

    function returnRefundCashBank(r) {
        const amt = round2(r?.amount);
        const pm = String(r?.method || '').trim();
        if (pm === 'cash' || pm === 'كاش' || pm === 'نقد') return { c: amt, b: 0 };
        if (['card', 'bank', 'شبكة / بطاقة', 'شبكة', 'مدى', 'فيزا'].includes(pm)) return { c: 0, b: amt };
        if (pm === 'مجزأ') {
            const c = round2(r?.splitCash);
            const b = round2(r?.splitNetwork);
            return c || b ? { c, b } : { c: 0, b: amt };
        }
        return { c: 0, b: amt };
    }

    /** لا نخصم المرتجع مرتين إذا الطلب مُعلَّم returned (مُستبعد من المبيعات) */
    function returnAffectsLiquidity(r, orders) {
        const list = orders || [];
        const order = list.find((o) => String(o.orderId) === String(r.orderId));
        if (order && order.status === 'returned') return false;
        return true;
    }

    function hrAffectsLiquidity(h) {
        const t = String(h?.type || '');
        if (t.includes('سلفة')) return true;
        return !t.includes('خصم / جزاء') && !t.includes('جزاء');
    }

    function isCashPaymentMethod(pMethod) {
        const pm = String(pMethod || 'cash').trim();
        return pm !== 'bank' && pm !== 'network' && pm !== 'شبكة';
    }

    function sumCashDrawerExpenses(expenseList) {
        let total = 0;
        (expenseList || []).forEach((ex) => {
            if (isCashPaymentMethod(ex.pMethod)) total += Number(ex.amount) || 0;
        });
        return total;
    }

    function aggregateOrderRevenue(orders) {
        let total = 0;
        let cash = 0;
        let bank = 0;
        (orders || []).forEach((o) => {
            if (o?.status === 'returned') return;
            total += round2(o?.total);
            const x = orderToCashBank(o);
            cash += x.c;
            bank += x.b;
        });
        return { total, cash, bank };
    }

    const api = {
        round2,
        isDeliveryOrder,
        isDeliveryPaid,
        splitOrderAmounts,
        orderToCashBank,
        splitReturnAmounts,
        returnRefundCashBank,
        returnAffectsLiquidity,
        hrAffectsLiquidity,
        isCashPaymentMethod,
        sumCashDrawerExpenses,
        aggregateOrderRevenue,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.PaymentSplit = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
