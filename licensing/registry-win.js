/**
 * تخزين قيمة التجربة في سجل Windows (Registry)
 */
const { execSync } = require('child_process');
const { REGISTRY_KEY, REGISTRY_VALUE_TRIAL } = require('./constants');

let _regTrialCache = undefined;
let _regTrialCacheAt = 0;
const REG_CACHE_MS = 60 * 1000;

function invalidateRegCache() {
  _regTrialCache = undefined;
  _regTrialCacheAt = 0;
}

function regSet(value) {
  if (process.platform !== 'win32') return false;
  try {
    const escaped = String(value).replace(/"/g, '\\"');
    execSync(`reg add "${REGISTRY_KEY}" /v ${REGISTRY_VALUE_TRIAL} /t REG_SZ /d "${escaped}" /f`, {
      windowsHide: true,
      timeout: 8000,
    });
    _regTrialCache = value;
    _regTrialCacheAt = Date.now();
    return true;
  } catch (e) {
    console.warn('[License Registry] write failed:', e.message);
    return false;
  }
}

function regGet() {
  if (process.platform !== 'win32') return null;
  if (_regTrialCache !== undefined && Date.now() - _regTrialCacheAt < REG_CACHE_MS) {
    return _regTrialCache;
  }
  try {
    const out = execSync(`reg query "${REGISTRY_KEY}" /v ${REGISTRY_VALUE_TRIAL}`, {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 8000,
    });
    const m = out.match(/REG_SZ\s+(.+)$/m);
    const val = m ? m[1].trim() : null;
    _regTrialCache = val;
    _regTrialCacheAt = Date.now();
    return val;
  } catch (_) {
    _regTrialCache = null;
    _regTrialCacheAt = Date.now();
    return null;
  }
}

module.exports = { regSet, regGet, invalidateRegCache };
