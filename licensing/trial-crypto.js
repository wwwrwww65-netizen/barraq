/**
 * تشفير تواريخ التجربة — مفتاح مشتق من DeviceID
 */
const crypto = require('crypto');

function deriveKey(deviceId) {
  return crypto.createHash('sha256').update(`MC-TRIAL-v1|${deviceId}`, 'utf8').digest();
}

function encryptTrialPayload(deviceId, payloadObj) {
  const key = deriveKey(deviceId);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plain = JSON.stringify(payloadObj);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptTrialPayload(deviceId, blob) {
  if (!blob || typeof blob !== 'string') return null;
  try {
    const buf = Buffer.from(blob, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const key = deriveKey(deviceId);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    return JSON.parse(plain);
  } catch (_) {
    return null;
  }
}

module.exports = { encryptTrialPayload, decryptTrialPayload };
