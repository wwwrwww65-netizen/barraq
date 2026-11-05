/**
 * First-manager bootstrap for the owner-approved activation flow.
 * The owner creates managerBootstrap/{randomToken}; the token is the document ID.
 */
'use strict';

const {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} = require('@firebase/firestore');
const {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} = require('@firebase/auth');
const { getFirebaseServices } = require('./firebase-client');
const { normalizeUsername, buildFirebaseEmail } = require('./username-identity');

function validateClaimToken(value) {
  const token = String(value ?? '').trim();
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) {
    throw new Error('رمز اعتماد المدير غير صالح.');
  }
  return token;
}

function timestampMillis(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return Number(value) || 0;
}

function validateApproval(claim, license, expectedDeviceId) {
  const tenantId = String(claim.tenantId ?? '').trim();
  const claimDeviceId = String(claim.deviceId ?? '').trim();

  if (
    claim.status !== 'approved' ||
    !tenantId ||
    tenantId.length > 128 ||
    !claimDeviceId ||
    claimDeviceId !== expectedDeviceId ||
    claim.claimedBy !== null ||
    !claim.expiresAt ||
    timestampMillis(claim.expiresAt) <= Date.now()
  ) {
    throw new Error('رمز الاعتماد منتهي أو مستخدم أو غير مخصص لهذا الجهاز.');
  }

  if (
    !license ||
    license.deviceId !== claimDeviceId ||
    license.tenantId !== tenantId ||
    !['active', 'trial'].includes(license.status) ||
    license.managerProvisioned !== false
  ) {
    throw new Error('ترخيص الجهاز غير معتمد لإنشاء أول مدير، أو أن حساب المدير أُنشئ مسبقاً.');
  }

  return { tenantId, deviceId: claimDeviceId };
}

async function createFirstManagerAccount({
  claimToken,
  deviceId,
  username,
  password,
  displayName,
}) {
  const token = validateClaimToken(claimToken);
  const expectedDeviceId = String(deviceId ?? '').trim();
  if (!expectedDeviceId) throw new Error('تعذر قراءة معرّف هذا الجهاز.');

  const normalizedUsername = normalizeUsername(username);
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new Error('كلمة المرور يجب أن تكون من 8 إلى 128 خانة.');
  }

  const { auth, db } = getFirebaseServices();
  const claimRef = doc(db, 'managerBootstrap', token);
  const claimSnapshot = await getDoc(claimRef);

  if (!claimSnapshot.exists()) {
    throw new Error('لم يتم العثور على رمز الاعتماد. تحقق من الرمز الذي أرسلته الإدارة.');
  }

  const claim = claimSnapshot.data();
  const claimDeviceId = String(claim.deviceId ?? '').trim();
  if (claimDeviceId !== expectedDeviceId) {
    throw new Error('هذا الرمز مخصص لجهاز آخر.');
  }

  const licenseRef = doc(db, 'DeviceLicenses', claimDeviceId);
  const licenseSnapshot = await getDoc(licenseRef);
  const { tenantId } = validateApproval(
    claim,
    licenseSnapshot.exists() ? licenseSnapshot.data() : null,
    expectedDeviceId
  );

  const email = buildFirebaseEmail(tenantId, normalizedUsername);
  let userCredential;

  try {
    userCredential = await createUserWithEmailAndPassword(auth, email, password);
  } catch (error) {
    // Safe retry if Auth creation succeeded but the Firestore claim was
    // interrupted before completion.
    if (error && error.code === 'auth/email-already-in-use') {
      userCredential = await signInWithEmailAndPassword(auth, email, password);
    } else {
      throw error;
    }
  }

  const user = userCredential.user;
  const profileRef = doc(db, 'userProfiles', user.uid);

  await runTransaction(db, async (transaction) => {
    const [freshClaim, freshLicense] = await Promise.all([
      transaction.get(claimRef),
      transaction.get(licenseRef),
    ]);

    if (!freshClaim.exists() || !freshLicense.exists()) {
      throw new Error('تعذر التحقق من موافقة المالك وترخيص الجهاز.');
    }

    const validated = validateApproval(
      freshClaim.data(),
      freshLicense.data(),
      expectedDeviceId
    );

    if (validated.tenantId !== tenantId || validated.deviceId !== claimDeviceId) {
      throw new Error('بيانات الاعتماد لا تطابق هذا الجهاز.');
    }

    transaction.update(claimRef, {
      status: 'claimed',
      claimedBy: user.uid,
      claimedAt: serverTimestamp(),
    });

    transaction.update(licenseRef, {
      managerProvisioned: true,
      managerUid: user.uid,
      managerProvisionedAt: serverTimestamp(),
    });

    transaction.set(profileRef, {
      uid: user.uid,
      tenantId,
      deviceId: claimDeviceId,
      username: normalizedUsername,
      bootstrapId: token,
      displayName: String(displayName ?? '').trim().slice(0, 100) || normalizedUsername,
      role: 'manager',
      status: 'active',
      createdAt: serverTimestamp(),
    });
  });

  try {
    localStorage.setItem('mc_tenant_id', tenantId);
    localStorage.setItem('mc_cloud_identity_ready', '1');
    localStorage.removeItem('admin_pwd');
    localStorage.removeItem('admin_username');
    localStorage.removeItem('employees_data');
    localStorage.removeItem('currentUser');
  } catch (_) {}

  return {
    uid: user.uid,
    tenantId,
    deviceId: claimDeviceId,
    username: normalizedUsername,
    role: 'manager',
  };
}

module.exports = {
  validateClaimToken,
  createFirstManagerAccount,
};
