/**
 * db-helper.js — مساعد قراءة/كتابة قاعدة البيانات بشكل غير متزامن (Non-blocking)
 * يُستخدم بدلاً من fs.readFileSync في كل ملفات الـ renderer
 * الهدف: منع تجميد الواجهة عند قراءة قاعدة البيانات
 */
(function() {
    const { ipcRenderer } = require('electron');

    const _empty = {
        orders:[], products:[], categories:[], inventory:[],
        purchases:[], suppliers:[], inventoryTx:[], returns:[],
        expenses:[], bankTransfers:[], hrExpenses:[], otherIncome:[],
        employees:[], attendance:[], penaltyRules:[],
        chartOfAccounts:[], journalEntries:[],
        customers:[],
        systemNotifications:[], inventoryAlertState:{}, deliveryCompanies:[]
    };

    /**
     * قراءة كاملة لقاعدة البيانات — async (لا تعلّق الواجهة)
     * الاستخدام: const db = await window.dbRead();
     */
    window.dbRead = async function() {
        try {
            const result = await ipcRenderer.invoke('db-read-full');
            return result || _empty;
        } catch(e) {
            console.warn('[db-helper] dbRead error:', e);
            return _empty;
        }
    };

    /** قراءة سجلات إقفال اليوم فقط — بدون orders/inventory (أسرع بكثير) */
    window.dbReadDayClosures = async function() {
        try {
            const list = await ipcRenderer.invoke('db-read-day-closures');
            return Array.isArray(list) ? list : [];
        } catch (e) {
            console.warn('[db-helper] dbReadDayClosures error:', e);
            return [];
        }
    };

    /** تفاصيل إقفال واحد (مع الورديات) عند فتح نافذة العرض */
    window.dbReadDayClosureDetail = async function(closureId) {
        try {
            return await ipcRenderer.invoke('db-read-day-closure-detail', closureId);
        } catch (e) {
            console.warn('[db-helper] dbReadDayClosureDetail error:', e);
            return null;
        }
    };

    /** قراءة مفاتيح محددة فقط — أسرع من dbRead() على قواعد بيانات كبيرة */
    window.dbReadSlice = async function(keys) {
        try {
            const slice = await ipcRenderer.invoke('db-read-slice', keys);
            return slice && typeof slice === 'object' ? slice : {};
        } catch (e) {
            console.warn('[db-helper] dbReadSlice error:', e);
            return {};
        }
    };

    window.dbUpdateOrder = async function(orderData) {
        try {
            return await ipcRenderer.invoke('db-update-order', orderData);
        } catch (e) {
            console.warn('[db-helper] dbUpdateOrder error:', e);
            return { success: false, error: e.message };
        }
    };

    window.dbAppendDayClosure = async function(summary, shifts) {
        try {
            return await ipcRenderer.invoke('db-append-day-closure', { summary, shifts });
        } catch (e) {
            console.warn('[db-helper] dbAppendDayClosure error:', e);
            return { success: false, error: e.message };
        }
    };

    /**
     * حفظ كامل لقاعدة البيانات — async ويُرسل broadcast تلقائياً ما لم يُمرَّر { broadcast: false }
     * الاستخدام: await window.dbWrite(db) أو await window.dbWrite(db, { broadcast: false })
     */
    window.dbWrite = async function(data, opts) {
        try {
            return await ipcRenderer.invoke('db-write-full', data, opts || {});
        } catch (e) {
            console.warn('[db-helper] dbWrite error:', e);
            return false;
        }
    };

    /**
     * قراءة + تعديل + حفظ في خطوة واحدة
     * الاستخدام: await window.dbUpdate(db => { db.orders.push(order); });
     */
    window.dbUpdate = async function(updaterFn) {
        const db = await window.dbRead();
        updaterFn(db);
        return await window.dbWrite(db);
    };

    /** مفتاح فريد لسجل إقفال يوم (للدمج بدون تكرار) */
    function dayClosureRecordKey(c) {
        const t = window.normalizeDayClosureClosedAt(c);
        if (t > 0) return 't:' + t;
        if (c && c.id) return 'id:' + c.id;
        return '';
    }

    /** توحيد وقت الإقفال — لا يُستبدل بوقت «الآن» عند غياب الحقل */
    window.normalizeDayClosureClosedAt = function(c) {
        if (!c || typeof c !== 'object') return 0;
        let closedAt = c.closedAt;
        if (typeof closedAt === 'string') {
            const parsed = Date.parse(closedAt);
            closedAt = isNaN(parsed) ? 0 : parsed;
        }
        if (!closedAt && c.id && String(c.id).startsWith('DAY-')) {
            const fromId = parseInt(String(c.id).slice(4), 10);
            if (Number.isFinite(fromId) && fromId > 1e11) closedAt = fromId;
        }
        return Number(closedAt) || 0;
    };

    /** دمج سجلات الإقفال من القاعدة و day_history ومصادر أخرى */
    window.mergeDayClosureRecords = function(...lists) {
        const byKey = new Map();
        for (const list of lists) {
            if (!Array.isArray(list)) continue;
            for (const raw of list) {
                if (!raw || typeof raw !== 'object') continue;
                const closedAt = window.normalizeDayClosureClosedAt(raw);
                const id = raw.id || (closedAt > 0 ? 'DAY-' + closedAt : '');
                const c = { ...raw, closedAt: closedAt || raw.closedAt, id };
                const key = dayClosureRecordKey(c);
                if (!key) continue;
                const prev = byKey.get(key);
                if (!prev || window.normalizeDayClosureClosedAt(c) >= window.normalizeDayClosureClosedAt(prev)) {
                    byKey.set(key, c);
                }
            }
        }
        return Array.from(byKey.values());
    };

    console.log('[db-helper] ✅ Async DB helpers ready: dbRead(), dbWrite(), dbUpdate()');
})();
