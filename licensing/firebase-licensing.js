/**
 * Firebase client-side licensing bridge.
 *
 * Customer installations use only the public Firebase Web SDK. They may
 * submit activation requests and read the single license document addressed
 * to their device ID. They cannot create, edit, list, or delete licenses.
 * The system owner approves requests and manages DeviceLicenses in Firebase
 * Console; no service-account key is distributed with the application.
 */
'use strict';

const { getApps, initializeApp } = require('@firebase/app');
const {
  getFirestore,
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
} = require('@firebase/firestore');
const firebaseConfig = require('../firebase-config');
const { COL_ACTIVATION_REQUESTS } = require('./constants');

const APP_NAME = 'mister-casher-licensing';
const COL_DEVICE_LICENSES = 'DeviceLicenses';

let appInstance = null;
let db = null;
let initError = null;

function initFirebase() {
  if (db) return { ok: true, db };
  if (initError) return { ok: false, error: initError };

  try {
    appInstance = getApps().find((item) => item.name === APP_NAME)
      || initializeApp(firebaseConfig, APP_NAME);
    db = getFirestore(appInstance);
    return { ok: true, db };
  } catch (error) {
    initError = error && error.message ? error.message : 'تعذر تهيئة Firebase.';
    return { ok: false, error: initError };
  }
}

async function createActivationRequest(_electronApp, data) {
  const init = initFirebase();
  if (!init.ok) throw new Error(init.error);

  const ref = await addDoc(collection(db, COL_ACTIVATION_REQUESTS), {
    ...data,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

async function getLicenseByDeviceId(_electronApp, deviceId) {
  const cleanId = String(deviceId ?? '').trim();
  if (!cleanId) throw new Error('معرّف الجهاز غير صالح.');

  const init = initFirebase();
  if (!init.ok) throw new Error(init.error);

  const snapshot = await getDoc(doc(db, COL_DEVICE_LICENSES, cleanId));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
}

async function getLicenseByDocId(_electronApp, docId) {
  return getLicenseByDeviceId(_electronApp, docId);
}

async function upsertLicenseForHub() {
  throw new Error('تعديل أو إصدار التراخيص متاح لمالك النظام فقط من Firebase Console.');
}

async function syncLinkedDevicesToLicense() {
  // Device linking remains local/LAN. Customer clients must not write licenses.
  return false;
}

async function refreshLicenseFromCloud(electronApp, deviceId) {
  return getLicenseByDeviceId(electronApp, deviceId);
}

module.exports = {
  initFirebase,
  createActivationRequest,
  getLicenseByDeviceId,
  getLicenseByDocId,
  upsertLicenseForHub,
  syncLinkedDevicesToLicense,
  refreshLicenseFromCloud,
};
