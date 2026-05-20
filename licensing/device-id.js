/**
 * توليد بصمة جهاز (DeviceID) من معرف اللوحة الأم والمعالج — Windows
 */
const crypto = require('crypto');
const os = require('os');
const { execSync } = require('child_process');

let _cachedDeviceId = null;

/** استخدام معرف محفوظ فوراً — يتجنب WMIC البطيء عند كل تشغيل */
function setCachedDeviceId(id) {
  if (id && typeof id === 'string') _cachedDeviceId = id;
}

function runWmic(args) {
  try {
    const out = execSync(`wmic ${args}`, {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 8000,
    });
    const lines = out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !/^[A-Za-z]/i.test(l) === false);
    const vals = lines.filter((l) => !/^(SerialNumber|ProcessorId|UUID)$/i.test(l));
    return (vals[0] || '').trim();
  } catch (_) {
    return '';
  }
}

function getHardwareParts() {
  let boardSerial = '';
  let cpuId = '';
  if (process.platform === 'win32') {
    boardSerial = runWmic('baseboard get serialnumber') || runWmic('csproduct get uuid');
    cpuId = runWmic('cpu get processorid');
  }
  if (!boardSerial && !cpuId) {
    boardSerial = os.hostname();
    cpuId = (os.cpus()[0] && os.cpus()[0].model) || 'cpu';
  }
  return { boardSerial, cpuId, platform: process.platform, arch: os.arch() };
}

function generateDeviceIdRaw() {
  const { boardSerial, cpuId, platform, arch } = getHardwareParts();
  const seed = [boardSerial, cpuId, platform, arch].join('|').toLowerCase();
  return crypto.createHash('sha256').update(seed, 'utf8').digest('hex');
}

function formatDeviceId(hex) {
  const u = hex.toUpperCase();
  return `${u.slice(0, 8)}-${u.slice(8, 16)}-${u.slice(16, 24)}-${u.slice(24, 32)}`;
}

function getDeviceId() {
  if (_cachedDeviceId) return _cachedDeviceId;
  const raw = generateDeviceIdRaw();
  _cachedDeviceId = formatDeviceId(raw);
  return _cachedDeviceId;
}

module.exports = {
  getDeviceId,
  setCachedDeviceId,
  getHardwareParts,
  formatDeviceId,
  generateDeviceIdRaw,
};
