/**
 * أداة تشخيص مشكلة الاستعادة
 * تشغيل: node diagnose-restore.js
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

console.log('🔍 أداة تشخيص استعادة النسخ الاحتياطية\n');
console.log('=' .repeat(60));

// 1. فحص مسار قاعدة البيانات
const dbPath = path.join(app.getPath('userData'), 'pos_database.json');
console.log('\n📂 قاعدة البيانات الرئيسية:');
console.log('   المسار:', dbPath);
console.log('   موجود:', fs.existsSync(dbPath) ? '✅ نعم' : '❌ لا');

if (fs.existsSync(dbPath)) {
  try {
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    console.log('   صالح:', '✅ نعم');
    console.log('   الطلبات:', db.orders?.length || 0);
    console.log('   المنتجات:', db.products?.length || 0);
  } catch (e) {
    console.log('   صالح:', '❌ لا -', e.message);
  }
}

// 2. فحص مجلد النسخ الاحتياطية التلقائية
const backupFiles = fs.readdirSync(path.dirname(dbPath))
  .filter(f => f.startsWith('pos_database.json.backup.'));

console.log('\n💾 النسخ الاحتياطية التلقائية:');
console.log('   العدد:', backupFiles.length);
if (backupFiles.length > 0) {
  backupFiles.slice(-3).forEach(f => {
    const fullPath = path.join(path.dirname(dbPath), f);
    const stats = fs.statSync(fullPath);
    console.log('   -', f, `(${(stats.size / 1024).toFixed(1)} KB)`);
  });
}

// 3. فحص ملفات الاستعادة (pre-restore)
const restoreFiles = fs.readdirSync(path.dirname(dbPath))
  .filter(f => f.startsWith('pos_database.json.pre-restore.'));

console.log('\n🔄 نسخ ما قبل الاستعادة:');
console.log('   العدد:', restoreFiles.length);
if (restoreFiles.length > 0) {
  restoreFiles.forEach(f => {
    const fullPath = path.join(path.dirname(dbPath), f);
    const stats = fs.statSync(fullPath);
    console.log('   -', f, `(${(stats.size / 1024).toFixed(1)} KB)`);
  });
}

// 4. فحص ملف السجل (Audit Log)
const auditPath = path.join(app.getPath('userData'), 'pos_database_audit.log');
console.log('\n📝 سجل العمليات:');
console.log('   المسار:', auditPath);
console.log('   موجود:', fs.existsSync(auditPath) ? '✅ نعم' : '❌ لا');

if (fs.existsSync(auditPath)) {
  const stats = fs.statSync(auditPath);
  console.log('   الحجم:', (stats.size / 1024).toFixed(1), 'KB');
  
  // قراءة آخر 10 أحداث
  try {
    const lines = fs.readFileSync(auditPath, 'utf8').split('\n').filter(l => l.trim());
    const last10 = lines.slice(-10);
    console.log('\n   آخر 10 أحداث:');
    last10.forEach(line => {
      try {
        const event = JSON.parse(line);
        const icon = event.action.includes('ERROR') ? '❌' : 
                     event.action.includes('SUCCESS') ? '✅' : 'ℹ️';
        console.log(`   ${icon} ${event.timestamp} - ${event.action}`);
        if (event.details && event.details.error) {
          console.log(`      الخطأ: ${event.details.error}`);
        }
      } catch (e) {
        console.log('   ⚠️ سطر غير صالح');
      }
    });
  } catch (e) {
    console.log('   ⚠️ لا يمكن قراءة السجل');
  }
}

// 5. فحص الصلاحيات
console.log('\n🔐 الصلاحيات:');
try {
  const testFile = path.join(path.dirname(dbPath), 'test_write_' + Date.now() + '.txt');
  fs.writeFileSync(testFile, 'test');
  fs.unlinkSync(testFile);
  console.log('   الكتابة:', '✅ مسموحة');
} catch (e) {
  console.log('   الكتابة:', '❌ ممنوعة -', e.message);
}

// 6. المساحة المتاحة
console.log('\n💿 المساحة المتاحة:');
try {
  // ملاحظة: هذه المعلومة تقريبية
  console.log('   المسار:', path.dirname(dbPath));
  console.log('   ⚠️ يرجى التحقق يدوياً من مساحة القرص');
} catch (e) {
  console.log('   ⚠️ لا يمكن التحقق');
}

console.log('\n' + '=' .repeat(60));
console.log('\n📋 ملخص التشخيص:');
console.log('1. إذا كانت قاعدة البيانات تالفة، استخدم نسخة احتياطية');
console.log('2. إذا كانت الصلاحيات ممنوعة، شغل التطبيق كمسؤول');
console.log('3. إذا كان هناك أخطاء في السجل، راجع التفاصيل أعلاه');
console.log('4. يمكنك استعادة يدوياً من ملفات .backup أو .pre-restore');
console.log('\n✅ انتهى التشخيص\n');
