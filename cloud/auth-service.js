/**
 * Cloud username/password authentication and employee provisioning.
 * Employee accounts use a secondary in-memory Firebase Auth instance so
 * creating an employee never replaces the manager's active session.
 */
'use strict';

const {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} = require('@firebase/firestore');
const {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  deleteUser,
} = require('@firebase/auth');
const { getFirebaseServices, getEmployeeProvisioningAuth } = require('./firebase-client');
const { normalizeUsername, buildFirebaseEmail } = require('./username-identity');

function sanitizeEmployeePermissions(value) {
  const permissions = value && typeof value === 'object' && !Array.isArray(value)
    ? { ...value }
    : {};
  // System administration and license ownership are never employee permissions.
  delete permissions.sys_admin;
  delete permissions.manager_grant;
  delete permissions.license_manage;
  return permissions;
}

async function signInWithUsername({ username, password, tenantId }) {
  const cleanTenantId = String(tenantId ?? '').trim();
  if (!cleanTenantId) throw new Error('لم يتم تحديد المنشأة لهذا الجهاز.');
  if (typeof password !== 'string' || !password) throw new Error('أدخل كلمة المرور.');

  const normalizedUsername = normalizeUsername(username);
  const email = buildFirebaseEmail(cleanTenantId, normalizedUsername);
  const { auth, db } = getFirebaseServices();

  const credential = await signInWithEmailAndPassword(auth, email, password);
  const profileRef = doc(db, 'userProfiles', credential.user.uid);

  try {
    const profileSnapshot = await getDoc(profileRef);
    if (!profileSnapshot.exists()) {
      throw new Error('الحساب غير مرتبط بملف مستخدم معتمد.');
    }

    const profile = profileSnapshot.data();
    if (
      profile.tenantId !== cleanTenantId ||
      profile.status !== 'active' ||
      !['manager', 'employee'].includes(profile.role)
    ) {
      throw new Error('هذا الحساب موقوف أو لا ينتمي إلى هذه المنشأة.');
    }

    return {
      uid: credential.user.uid,
      tenantId: profile.tenantId,
      username: profile.username || normalizedUsername,
      displayName: profile.displayName || normalizedUsername,
      role: profile.role,
      status: profile.status,
      jobRole: profile.jobRole || '',
      permissions: profile.permissions || {},
      employeeId: profile.employeeId || '',
      avatar: profile.avatar || '',
    };
  } catch (error) {
    await signOut(auth).catch(() => {});
    throw error;
  }
}

async function createEmployeeAccount({
  username,
  password,
  displayName,
  employeeId,
  jobRole,
  permissions,
}) {
  const normalizedUsername = normalizeUsername(username);
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new Error('كلمة مرور الموظف يجب أن تكون من 8 إلى 128 خانة.');
  }

  const { auth: managerAuth, db } = getFirebaseServices();
  const manager = managerAuth.currentUser;
  if (!manager) throw new Error('يجب تسجيل دخول المدير قبل إنشاء حساب موظف.');

  const managerSnapshot = await getDoc(doc(db, 'userProfiles', manager.uid));
  if (!managerSnapshot.exists()) throw new Error('ملف المدير غير موجود في السحابة.');

  const managerProfile = managerSnapshot.data();
  if (managerProfile.role !== 'manager' || managerProfile.status !== 'active') {
    throw new Error('هذه العملية متاحة لمدير المنشأة فقط.');
  }

  const tenantId = String(managerProfile.tenantId || '').trim();
  if (!tenantId) throw new Error('ملف المدير لا يحتوي معرّف المنشأة.');

  const email = buildFirebaseEmail(tenantId, normalizedUsername);
  const secondary = getEmployeeProvisioningAuth();
  let employeeCredential = null;
  let createdNewAccount = false;

  try {
    try {
      employeeCredential = await createUserWithEmailAndPassword(
        secondary.auth,
        email,
        password
      );
      createdNewAccount = true;
    } catch (error) {
      if (!error || error.code !== 'auth/email-already-in-use') throw error;
      employeeCredential = await signInWithEmailAndPassword(
        secondary.auth,
        email,
        password
      );
    }

    const uid = employeeCredential.user.uid;
    const employeeRef = doc(db, 'userProfiles', uid);
    const profilePatch = {
      uid,
      tenantId,
      username: normalizedUsername,
      employeeId: String(employeeId ?? '').trim().slice(0, 80),
      role: 'employee',
      createdBy: manager.uid,
      displayName: String(displayName ?? '').trim().slice(0, 100) || normalizedUsername,
      jobRole: String(jobRole ?? '').trim().slice(0, 80),
      permissions: sanitizeEmployeePermissions(permissions),
      status: 'active',
      updatedAt: serverTimestamp(),
    };

    // Merge makes retries idempotent: immutable identity fields stay unchanged,
    // while Firestore Rules permit only the employee profile fields to update.
    await setDoc(employeeRef, profilePatch, { merge: true });

    await signOut(secondary.auth).catch(() => {});
    return { uid, tenantId, username: normalizedUsername };
  } catch (error) {
    if (createdNewAccount && employeeCredential && employeeCredential.user) {
      await deleteUser(employeeCredential.user).catch(() => {});
    }
    await signOut(secondary.auth).catch(() => {});
    throw error;
  }
}

async function updateEmployeeAccount({
  uid,
  displayName,
  jobRole,
  permissions,
  status,
}) {
  const { auth, db } = getFirebaseServices();
  const manager = auth.currentUser;
  if (!manager) throw new Error('يجب تسجيل دخول المدير قبل تعديل حساب الموظف.');

  const managerSnapshot = await getDoc(doc(db, 'userProfiles', manager.uid));
  if (!managerSnapshot.exists()) throw new Error('ملف المدير غير موجود في السحابة.');
  const managerProfile = managerSnapshot.data();
  if (managerProfile.role !== 'manager' || managerProfile.status !== 'active') {
    throw new Error('هذه العملية متاحة لمدير المنشأة فقط.');
  }

  const employeeRef = doc(db, 'userProfiles', String(uid || ''));
  const employeeSnapshot = await getDoc(employeeRef);
  if (!employeeSnapshot.exists()) throw new Error('حساب الموظف غير موجود في السحابة.');

  const employee = employeeSnapshot.data();
  if (employee.role !== 'employee' || employee.tenantId !== managerProfile.tenantId) {
    throw new Error('لا يمكن تعديل حساب خارج منشأتك أو حساب مدير.');
  }

  await updateDoc(employeeRef, {
    displayName: String(displayName ?? '').trim().slice(0, 100) || employee.username,
    jobRole: String(jobRole ?? '').trim().slice(0, 80),
    permissions: sanitizeEmployeePermissions(permissions),
    status: status === 'end' ? 'disabled' : 'active',
    updatedAt: serverTimestamp(),
  });

  return { uid: employee.uid, tenantId: employee.tenantId };
}

module.exports = {
  signInWithUsername,
  createEmployeeAccount,
  updateEmployeeAccount,
};
