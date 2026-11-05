/**
 * Username-only Firebase identity mapping.
 *
 * Firebase Authentication requires an email-shaped identifier for the
 * Email/Password provider. This module derives a stable, non-reversible
 * internal address from the restaurant tenant and username. The address is
 * never shown in the UI and no password is stored here.
 */
'use strict';

const crypto = require('node:crypto');

const INTERNAL_AUTH_DOMAIN = 'accounts.mistercasher.invalid';
const USERNAME_PATTERN = /^[\p{L}\p{N}._-]{3,32}$/u;

function normalizeUsername(value) {
  const username = String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, '')
    .toLowerCase();

  if (!USERNAME_PATTERN.test(username)) {
    throw new Error('اسم المستخدم يجب أن يكون من 3 إلى 32 حرفاً أو رقماً، ويمكن استخدام النقطة والشرطة فقط.');
  }

  return username;
}

function buildFirebaseEmail(tenantId, username) {
  const tenant = String(tenantId ?? '').trim();
  if (!tenant || tenant.length > 128) {
    throw new Error('معرّف المنشأة غير صالح.');
  }

  const normalizedUsername = normalizeUsername(username);
  const digest = crypto
    .createHash('sha256')
    .update('mister-casher:username:v1:')
    .update(tenant)
    .update(':')
    .update(normalizedUsername)
    .digest('hex');

  return `u${digest}@${INTERNAL_AUTH_DOMAIN}`;
}

module.exports = {
  normalizeUsername,
  buildFirebaseEmail,
  INTERNAL_AUTH_DOMAIN,
};
