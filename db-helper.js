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
        expenses:[], bankTransfers:[], hrExpenses:[],
        employees:[], attendance:[], penaltyRules:[]
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

    /**
     * حفظ كامل لقاعدة البيانات — async ويُرسل broadcast تلقائياً
     * الاستخدام: await window.dbWrite(db);
     */
    window.dbWrite = async function(data) {
        try {
            return await ipcRenderer.invoke('db-write-full', data);
        } catch(e) {
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

    console.log('[db-helper] ✅ Async DB helpers ready: dbRead(), dbWrite(), dbUpdate()');
})();
