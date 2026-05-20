/**
 * Firestore — مجموعتا Licenses و Activation_Requests
 * يتطلب: firebase-service-account.json في userData أو جذر المشروع
 */
const fs = require('fs');
const path = require('path');
const { COL_LICENSES, COL_ACTIVATION_REQUESTS } = require('./constants');

let admin = null;
let db = null;
let initError = null;

function findServiceAccountPath(app) {
  const candidates = [];
  if (app) {
    candidates.push(path.join(app.getPath('userData'), 'firebase-service-account.json'));
  }
  candidates.push(path.join(__dirname, '..', 'firebase-service-account.json'));
  candidates.push(path.join(process.cwd(), 'firebase-service-account.json'));
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function initFirebase(app) {
  if (db) return { ok: true, db };
  if (initError) return { ok: false, error: initError };

  try {
    admin = require('firebase-admin');
  } catch (e) {
    initError = 'firebase-admin غير مثبت. شغّل: npm install firebase-admin';
    return { ok: false, error: initError };
  }

  const saPath = findServiceAccountPath(app);
  if (!saPath) {
    initError =
      'ملف firebase-service-account.json غير موجود. انسخه من Firebase Console إلى AppData/baraaq/';
    return { ok: false, error: initError };
  }

  try {
    const serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf8'));
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    db = admin.firestore();
    return { ok: true, db };
  } catch (e) {
    initError = e.message;
    return { ok: false, error: initError };
  }
}

function ts() {
  return admin.firestore.FieldValue.serverTimestamp();
}

async function createActivationRequest(app, data) {
  const init = initFirebase(app);
  if (!init.ok) throw new Error(init.error);
  const ref = await db.collection(COL_ACTIVATION_REQUESTS).add({
    ...data,
    createdAt: ts(),
    updatedAt: ts(),
  });
  return ref.id;
}

async function getLicenseByDeviceId(app, deviceId) {
  const init = initFirebase(app);
  if (!init.ok) throw new Error(init.error);

  // نبحث أولاً بـ hubDeviceId (الحقل المعياري)
  let snap = await db
    .collection(COL_LICENSES)
    .where('hubDeviceId', '==', deviceId)
    .limit(1)
    .get();

  // إذا لم نجد، نبحث بـ deviceId (الحقل البديل في Firebase)
  if (snap.empty) {
    snap = await db
      .collection(COL_LICENSES)
      .where('deviceId', '==', deviceId)
      .limit(1)
      .get();
  }

  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function getLicenseByDocId(app, docId) {
  const init = initFirebase(app);
  if (!init.ok) throw new Error(init.error);
  const doc = await db.collection(COL_LICENSES).doc(docId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function upsertLicenseForHub(app, hubDeviceId, patch) {
  const init = initFirebase(app);
  if (!init.ok) throw new Error(init.error);

  const existing = await getLicenseByDeviceId(app, hubDeviceId);
  if (existing) {
    await db.collection(COL_LICENSES).doc(existing.id).set(
      { ...patch, hubDeviceId, updatedAt: ts() },
      { merge: true }
    );
    return existing.id;
  }

  const ref = await db.collection(COL_LICENSES).add({
    hubDeviceId,
    status: 'trial',
    allowedClients: 1,
    linkedDevices: [],
    ...patch,
    createdAt: ts(),
    updatedAt: ts(),
  });
  return ref.id;
}

async function syncLinkedDevicesToLicense(app, hubDeviceId, linkedDevices) {
  const init = initFirebase(app);
  if (!init.ok) throw new Error(init.error);
  const lic = await getLicenseByDeviceId(app, hubDeviceId);
  if (!lic) return false;
  await db.collection(COL_LICENSES).doc(lic.id).set(
    {
      linkedDevices,
      lastDevicesSyncAt: ts(),
      updatedAt: ts(),
    },
    { merge: true }
  );
  return true;
}

async function refreshLicenseFromCloud(app, hubDeviceId) {
  return getLicenseByDeviceId(app, hubDeviceId);
}

module.exports = {
  initFirebase,
  findServiceAccountPath,
  createActivationRequest,
  getLicenseByDeviceId,
  getLicenseByDocId,
  upsertLicenseForHub,
  syncLinkedDevicesToLicense,
  refreshLicenseFromCloud,
};
