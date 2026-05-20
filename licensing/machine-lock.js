/**
 * Machine Lock — يحفظ بصمة الجهاز في مواقع تبقى حتى بعد إلغاء التثبيت
 * المواقع:
 *   1. C:\ProgramData\MisterCasher\device.lock  (مجلد نظام، لا يُحذف مع AppData)
 *   2. HKLM\SOFTWARE\MisterCasher\DeviceLock    (Registry على مستوى الجهاز)
 */
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const PROGRAM_DATA_DIR  = path.join('C:\\ProgramData', 'MisterCasher');
const LOCK_FILE_PATH    = path.join(PROGRAM_DATA_DIR, 'device.lock');
const HKLM_KEY          = 'HKLM\\SOFTWARE\\MisterCasher';
const HKLM_VALUE        = 'DeviceLock';
const SECRET            = 'MC-MACHINE-LOCK-v1';

// تشفير بسيط للبيانات المحفوظة
function encrypt(text) {
  const key  = crypto.createHash('sha256').update(SECRET).digest();
  const iv   = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const enc  = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + enc.toString('hex');
}

function decrypt(raw) {
  try {
    const [ivHex, encHex] = raw.split(':');
    const key = crypto.createHash('sha256').update(SECRET).digest();
    const iv  = Buffer.from(ivHex, 'hex');
    const enc = Buffer.from(encHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch (_) { return null; }
}

// ─── الكتابة ───────────────────────────────────────────────────────────────

function writeToProgramData(payload) {
  try {
    if (!fs.existsSync(PROGRAM_DATA_DIR)) {
      fs.mkdirSync(PROGRAM_DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCK_FILE_PATH, encrypt(JSON.stringify(payload)), 'utf8');
    return true;
  } catch (e) {
    console.warn('[MachineLock] ProgramData write failed:', e.message);
    return false;
  }
}

function writeToHKLM(payload) {
  if (process.platform !== 'win32') return false;
  try {
    const escaped = encrypt(JSON.stringify(payload)).replace(/"/g, '\\"');
    execSync(`reg add "${HKLM_KEY}" /v ${HKLM_VALUE} /t REG_SZ /d "${escaped}" /f`, {
      windowsHide: true, timeout: 8000,
    });
    return true;
  } catch (e) {
    console.warn('[MachineLock] HKLM write failed (need admin?):', e.message);
    return false;
  }
}

// ─── القراءة ───────────────────────────────────────────────────────────────

function readFromProgramData() {
  try {
    if (!fs.existsSync(LOCK_FILE_PATH)) return null;
    const raw = fs.readFileSync(LOCK_FILE_PATH, 'utf8');
    const dec = decrypt(raw);
    return dec ? JSON.parse(dec) : null;
  } catch (_) { return null; }
}

function readFromHKLM() {
  if (process.platform !== 'win32') return null;
  try {
    const out = execSync(`reg query "${HKLM_KEY}" /v ${HKLM_VALUE}`, {
      encoding: 'utf8', windowsHide: true, timeout: 8000,
    });
    const m = out.match(/REG_SZ\s+(.+)$/m);
    if (!m) return null;
    const dec = decrypt(m[1].trim());
    return dec ? JSON.parse(dec) : null;
  } catch (_) { return null; }
}

// ─── الواجهة العامة ────────────────────────────────────────────────────────

/**
 * يسجّل الجهاز عند أول تجربة
 * @param {string} deviceId
 * @param {number} trialEndsAt  timestamp ms
 */
function recordDeviceTrial(deviceId, trialEndsAt) {
  const payload = { deviceId, trialEndsAt, recordedAt: Date.now() };
  writeToProgramData(payload);
  writeToHKLM(payload);
}

/**
 * يتحقق هل انتهت تجربة هذا الجهاز محلياً (حتى بدون إنترنت)
 * @param {string} deviceId
 * @returns {{ expired: boolean, blocked: boolean, reason: string|null }}
 */
function checkMachineLock(deviceId) {
  // اقرأ من المصدرين
  const pd   = readFromProgramData();
  const hklm = readFromHKLM();

  // خذ أقدم سجل (الأصغر trialEndsAt = الأشد تقييداً)
  const candidates = [pd, hklm].filter(Boolean).filter(r => r.deviceId === deviceId);
  if (candidates.length === 0) return { expired: false, blocked: false, reason: null };

  // تحقق من أن البيانات تخص نفس الجهاز
  const record = candidates.sort((a, b) => a.trialEndsAt - b.trialEndsAt)[0];

  if (Date.now() > record.trialEndsAt) {
    return {
      expired: true,
      blocked: false,
      reason: 'انتهت الفترة التجريبية لهذا الجهاز. يُرجى التفعيل الدائم أو التواصل مع الدعم.',
    };
  }

  return { expired: false, blocked: false, reason: null };
}

module.exports = { recordDeviceTrial, checkMachineLock };
