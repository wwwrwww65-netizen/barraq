/**
 * Firebase client services for the Electron renderer.
 *
 * Uses the public Web SDK only. Never load firebase-admin or a service-account
 * key in a customer installation. Authentication persistence is local to this
 * installation; Firestore attempts durable IndexedDB caching and falls back
 * to the SDK's default cache if the platform cannot provide it.
 */
'use strict';

const firebaseConfig = require('../firebase-config');
const {
  getApps,
  initializeApp,
} = require('@firebase/app');
const {
  initializeAuth,
  getAuth,
  browserLocalPersistence,
  inMemoryPersistence,
} = require('@firebase/auth');
const {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
} = require('@firebase/firestore');

const MAIN_APP_NAME = 'mister-casher-desktop';
const EMPLOYEE_APP_NAME = 'mister-casher-employee-provisioner';

let services = null;
let employeeProvisioning = null;

function getOrCreateApp(name) {
  const existing = getApps().find((item) => item.name === name);
  return existing || initializeApp(firebaseConfig, name);
}

function getFirebaseServices() {
  if (services) return services;

  const app = getOrCreateApp(MAIN_APP_NAME);
  let auth;

  try {
    auth = initializeAuth(app, {
      persistence: browserLocalPersistence,
    });
  } catch (error) {
    if (error && error.code === 'auth/already-initialized') {
      auth = getAuth(app);
    } else {
      throw new Error(
        'تعذر تهيئة تسجيل الدخول السحابي. تأكد من تشغيل النظام داخل نافذته الرئيسية.',
        { cause: error }
      );
    }
  }

  let db;
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager(),
      }),
    });
  } catch (error) {
    if (error && error.code === 'firestore/already-initialized') {
      db = getFirestore(app);
    } else {
      console.warn('[Firebase] Durable cache unavailable; using default cache:', error.message);
      db = getFirestore(app);
    }
  }

  services = Object.freeze({ app, auth, db });
  return services;
}

/**
 * A separate in-memory Auth instance is used when a manager creates an
 * employee. It prevents createUserWithEmailAndPassword from replacing the
 * manager's active session in the primary Firebase Auth instance.
 */
function getEmployeeProvisioningAuth() {
  if (employeeProvisioning) return employeeProvisioning;

  const app = getOrCreateApp(EMPLOYEE_APP_NAME);
  let auth;

  try {
    auth = initializeAuth(app, {
      persistence: inMemoryPersistence,
    });
  } catch (error) {
    if (error && error.code === 'auth/already-initialized') {
      auth = getAuth(app);
    } else {
      throw error;
    }
  }

  employeeProvisioning = Object.freeze({ app, auth });
  return employeeProvisioning;
}

module.exports = {
  getFirebaseServices,
  getEmployeeProvisioningAuth,
};
