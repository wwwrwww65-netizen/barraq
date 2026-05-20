/** ثوابت نظام الترخيص — Mister Casher */
module.exports = {
  TRIAL_DAYS: 7,
  OFFLINE_GRACE_DAYS: 3,
  COL_LICENSES: 'Licenses',
  COL_ACTIVATION_REQUESTS: 'Activation_Requests',
  REGISTRY_KEY: 'HKCU\\Software\\MisterCasher\\License',
  REGISTRY_VALUE_TRIAL: 'TrialBlob',
  DB_HIDDEN_KEY: '_mcLicense',
  LOCAL_CACHE_FILE: 'license-cache.json',
  SETUP_STATE_FILE: 'app-setup.json',
  TIME_TAMPER_TOLERANCE_MS: 5 * 60 * 1000,
  BACKGROUND_SYNC_INTERVAL_MS: 5 * 60 * 1000,
  LICENSE_KICK_UDP_TYPE: 'license_kick',
};
