/**
 * مدير الترخيص — تجربة 7 أيام، مهلة أوفلاين 3 أيام، Kill Switch، مزامنة LAN
 */
const fs = require('fs');
const path = require('path');
const { BrowserWindow } = require('electron');
const { getDeviceId, setCachedDeviceId } = require('./device-id');
const { invalidateRegCache } = require('./registry-win');
const { encryptTrialPayload, decryptTrialPayload } = require('./trial-crypto');
const { regSet, regGet } = require('./registry-win');
const firebase = require('./firebase-licensing');
const { recordDeviceTrial, checkMachineLock } = require('./machine-lock');
const {
  TRIAL_DAYS,
  OFFLINE_GRACE_DAYS,
  LOCAL_CACHE_FILE,
  SETUP_STATE_FILE,
  DB_HIDDEN_KEY,
  TIME_TAMPER_TOLERANCE_MS,
  BACKGROUND_SYNC_INTERVAL_MS,
  LICENSE_KICK_UDP_TYPE,
} = require('./constants');

const MS_DAY = 24 * 60 * 60 * 1000;

class LicenseManager {
  constructor() {
    this.app = null;
    this.getDbPath = null;
    this.cachePath = null;
    this.setupPath = null;
    this.cache = {};
    this.lanClients = new Map();
    this.backgroundTimer = null;
    this.killed = false;
    this._trialReadCache = null;
    this._trialReadCacheAt = 0;
    this._setupCompleteCache = null;
    this._httpServerRef = null;
    this._udpSend = null;
    this._udpPort = 41234;
    this._broadcastAddr = '255.255.255.255';
  }

  init(app, getDbPathFn) {
    this.app = app;
    this.getDbPath = getDbPathFn;
    this.cachePath = path.join(app.getPath('userData'), LOCAL_CACHE_FILE);
    this.setupPath = path.join(app.getPath('userData'), SETUP_STATE_FILE);
    this.loadCache();
    if (this.cache.deviceId) {
      setCachedDeviceId(this.cache.deviceId);
    } else {
      const deviceId = getDeviceId();
      this.cache.deviceId = deviceId;
    }
    this.recordBootTime();
    this.saveCache();
  }

  invalidateTrialCache() {
    this._trialReadCache = null;
    this._trialReadCacheAt = 0;
    invalidateRegCache();
  }

  setNetworkRefs(udpSendFn, port, broadcastAddr) {
    this._udpSend = udpSendFn;
    this._udpPort = port;
    this._broadcastAddr = broadcastAddr;
  }

  setHttpServer(server) {
    this._httpServerRef = server;
  }

  loadCache() {
    try {
      if (fs.existsSync(this.cachePath)) {
        this.cache = JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
      }
    } catch (_) {
      this.cache = {};
    }
    if (!this.cache || typeof this.cache !== 'object') this.cache = {};
  }

  saveCache() {
    try {
      fs.writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2), 'utf8');
    } catch (e) {
      console.error('[License] saveCache:', e.message);
    }
  }

  markSetupComplete(meta) {
    this._setupCompleteCache = true;
    try {
      const at = Date.now();
      fs.writeFileSync(
        this.setupPath,
        JSON.stringify({ setupComplete: true, at, ...meta }, null, 2),
        'utf8'
      );
      this.cache.setupCompletedAt = at;
      this.saveCache();
    } catch (e) {
      console.warn('[License] markSetupComplete:', e.message);
    }
  }

  isSetupComplete() {
    if (this._setupCompleteCache !== null) return this._setupCompleteCache;
    try {
      if (fs.existsSync(this.setupPath)) {
        const j = JSON.parse(fs.readFileSync(this.setupPath, 'utf8'));
        this._setupCompleteCache = !!j.setupComplete;
        return this._setupCompleteCache;
      }
    } catch (_) {}
    this._setupCompleteCache = false;
    return false;
  }

  getSetupData() {
    try {
      if (fs.existsSync(this.setupPath)) {
        return JSON.parse(fs.readFileSync(this.setupPath, 'utf8'));
      }
    } catch (_) {}
    return null;
  }

  getDeviceId() {
    return getDeviceId();
  }

  buildTrialPayload(startedAt) {
    return {
      startedAt,
      trialEndsAt: startedAt + TRIAL_DAYS * MS_DAY,
      v: 1,
    };
  }

  writeTrialTriple(deviceId, startedAt) {
    this.invalidateTrialCache();
    const payload = this.buildTrialPayload(startedAt);
    const blob = encryptTrialPayload(deviceId, payload);

    this.cache.trialBlob = blob;
    this.cache.trialStartedAt = startedAt;
    this.cache.trialEndsAt = payload.trialEndsAt;
    this.cache.status = 'trial';
    this.cache.isHub = true;
    this.cache.hubDeviceId = deviceId;
    this.saveCache();

    regSet(blob);
    this.writeTrialToDatabase(blob);
    try {
      const lsPath = path.join(this.app.getPath('userData'), 'license-ls-trial.json');
      fs.writeFileSync(lsPath, JSON.stringify({ blob }), 'utf8');
    } catch (_) {}
  }

  async updateRestaurantInfo(info) {
    if (!info) return;
    let changed = false;
    // نقبل أي قيمة حتى لو كانت فارغة (ما عدا undefined)
    if (info.restaurantName !== undefined && this.cache.restaurantName !== info.restaurantName) {
      this.cache.restaurantName = info.restaurantName; changed = true;
    }
    if (info.phone !== undefined && this.cache.phone !== info.phone) {
      this.cache.phone = info.phone; changed = true;
    }
    if (info.adminUsername !== undefined && this.cache.adminUsername !== info.adminUsername) {
      this.cache.adminUsername = info.adminUsername; changed = true;
    }

    if (changed) {
      this.saveCache();
    }
    // نرسل للفايربيس دائماً إذا كان Hub (حتى لو لم يتغير الكاش)
    // لأن السبب قد يكون أن الفايربيس ليس فيه البيانات بعد
    if (this.isThisDeviceHub()) {
      const hubId = this.cache.hubDeviceId || getDeviceId();
      const patch = {};
      if (this.cache.restaurantName) patch.restaurantName = this.cache.restaurantName;
      if (this.cache.phone) patch.phone = this.cache.phone;
      if (this.cache.adminUsername) patch.adminUsername = this.cache.adminUsername;
      if (Object.keys(patch).length > 0) {
        try {
          await firebase.upsertLicenseForHub(this.app, hubId, patch);
        } catch (_) {}
      }
    }
  }

  writeTrialToDatabase(blob) {
    try {
      const dbPath = this.getDbPath();
      let db = {};
      if (fs.existsSync(dbPath)) {
        db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      }
      if (!db[DB_HIDDEN_KEY]) db[DB_HIDDEN_KEY] = {};
      db[DB_HIDDEN_KEY].trialBlob = blob;
      db[DB_HIDDEN_KEY].deviceId = getDeviceId();
      fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
      console.warn('[License] writeTrialToDatabase:', e.message);
    }
  }

  readTrialFromDatabase(deviceId) {
    try {
      const dbPath = this.getDbPath();
      if (!fs.existsSync(dbPath)) return null;
      const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      const blob = db[DB_HIDDEN_KEY] && db[DB_HIDDEN_KEY].trialBlob;
      return decryptTrialPayload(deviceId, blob);
    } catch (_) {
      return null;
    }
  }

  readTrialStartedAt(deviceId) {
    const dev = deviceId || getDeviceId();
    if (
      this._trialReadCache &&
      this._trialReadCache.deviceId === dev &&
      Date.now() - this._trialReadCacheAt < 15000
    ) {
      return this._trialReadCache.result;
    }

    const sources = [];
    if (this.cache.trialBlob) {
      const p = decryptTrialPayload(dev, this.cache.trialBlob);
      if (p && p.startedAt) sources.push(p.startedAt);
    }
    const reg = regGet();
    if (reg) {
      const p = decryptTrialPayload(dev, reg);
      if (p && p.startedAt) sources.push(p.startedAt);
    }
    try {
      const cachePath = path.join(this.app.getPath('userData'), 'license-ls-trial.json');
      if (fs.existsSync(cachePath)) {
        const lsBlob = JSON.parse(fs.readFileSync(cachePath, 'utf8')).blob;
        const p = decryptTrialPayload(dev, lsBlob);
        if (p && p.startedAt) sources.push(p.startedAt);
      }
    } catch (_) {}
    const dbp = this.readTrialFromDatabase(dev);
    if (dbp && dbp.startedAt) sources.push(dbp.startedAt);

    let result = null;
    if (sources.length === 0) {
      result = null;
    } else {
      const min = Math.min(...sources);
      const max = Math.max(...sources);
      if (max - min > MS_DAY) {
        result = { tamper: true, startedAt: max };
      } else {
        result = { tamper: false, startedAt: min, trialEndsAt: min + TRIAL_DAYS * MS_DAY };
      }
    }
    this._trialReadCache = { deviceId: dev, result };
    this._trialReadCacheAt = Date.now();
    return result;
  }

  recordBootTime() {
    const now = Date.now();
    if (this.cache.lastShutdownAt && now + TIME_TAMPER_TOLERANCE_MS < this.cache.lastShutdownAt) {
      this.cache.timeTamperDetected = true;
      this.saveCache();
    }
    this.cache.lastBootAt = now;
    this.saveCache();
  }

  recordShutdown() {
    this.cache.lastShutdownAt = Date.now();
    this.saveCache();
  }

  markFirebaseSyncOk(patch) {
    this.cache.lastFirebaseSyncAt = Date.now();
    if (patch) Object.assign(this.cache, patch);
    this.saveCache();
  }

  isTrialActive() {
    if (this.cache.status === 'active') return true;
    const deviceId = getDeviceId();
    const trial = this.readTrialStartedAt(deviceId);
    if (!trial || trial.tamper) return false;
    if (Date.now() > trial.trialEndsAt) return false;
    return this.cache.status === 'trial' || !!trial.startedAt;
  }

  isLicenseActive() {
    if (this.killed) return false;
    if (this.cache.timeTamperDetected) return false;
    const st = this.cache.status;
    if (st === 'blocked' || st === 'expired') return false;
    if (st === 'active') return true;
    return this.isTrialActive();
  }

  offlineGraceExceeded() {
    const anchor =
      this.cache.trialStartedAt ||
      this.cache.firstActivationAt ||
      this.cache.setupCompletedAt;
    if (!anchor) return false;
    const last = this.cache.lastFirebaseSyncAt;
    const ref = last || anchor;
    return Date.now() - ref > OFFLINE_GRACE_DAYS * MS_DAY;
  }

  evaluateAccess(precomputedTrial) {
    const deviceId = getDeviceId();
    if (this.cache.timeTamperDetected) {
      return { ok: false, page: 'activation.html', lock: 'time_tamper', message: 'تم اكتشاف تلاعب بساعة النظام.' };
    }
    const trial = precomputedTrial !== undefined ? precomputedTrial : this.readTrialStartedAt(deviceId);
    if (trial && trial.tamper) {
      return { ok: false, page: 'activation.html', lock: 'trial_tamper', message: 'بيانات التجربة غير متطابقة.' };
    }
    if (this.offlineGraceExceeded()) {
      return {
        ok: false,
        page: 'activation.html',
        lock: 'offline',
        message: 'يجب الاتصال بالإنترنت لتوثيق الجهاز (مرت أكثر من 3 أيام دون مزامنة).',
      };
    }
    if (this.cache.status === 'expired' || this.cache.status === 'blocked') {
      return {
        ok: false,
        page: 'activation.html',
        lock: this.cache.status,
        message: 'انتهى الترخيص أو تم إيقافه من الإدارة.',
      };
    }
    if (trial && Date.now() > trial.trialEndsAt && this.cache.status !== 'active') {
      return { ok: false, page: 'activation.html', lock: 'expired', message: 'انتهت الفترة التجريبية (7 أيام).' };
    }
    if (this.isLicenseActive()) {
      return { ok: true, page: 'login.html' };
    }
    if (this.isSetupComplete()) {
      return { ok: false, page: 'activation.html', lock: null, message: null };
    }
    // لا يوجد إعداد ولا ترخيص → صفحة الإعداد (وليس login مباشرة)
    // يمنع حالة: حذف app-setup.json → الدخول لـ login بدون تحقق
    const hasAnyLicenseData = !!(
      this.cache.trialBlob ||
      this.cache.trialStartedAt ||
      this.cache.status
    );
    if (!hasAnyLicenseData) {
      return { ok: true, page: 'setup.html' };
    }
    return { ok: false, page: 'activation.html', lock: null, message: null };
  }

  async resolveStartupPage() {
    return new Promise((resolve) => {
      setImmediate(() => {
        try {
          const access = this.evaluateAccess();
          if (access.lock) {
            resolve(`activation.html?lock=${encodeURIComponent(access.lock)}`);
            return;
          }
          resolve(access.page);
        } catch (e) {
          resolve('login.html');
        }
      });
    });
  }

  packRestaurantFromRenderer(lsSnapshot) {
    let settings = {};
    try {
      settings = JSON.parse(lsSnapshot.restaurant_settings || '{}');
    } catch (_) {}
    return {
      restaurantName: settings.name || lsSnapshot.restaurantName || '',
      branch: settings.branch || '',
      phone: settings.phone || '',
      tax: settings.tax || '',
      adminUsername: lsSnapshot.admin_username || '',
      adminFullName: lsSnapshot.admin_fullname || lsSnapshot.setup_admin || '',
      restaurantSettings: lsSnapshot.restaurant_settings || '',
    };
  }

  async startTrial(restaurantPackage) {
    const deviceId = getDeviceId();
    const startedAt = Date.now();

    // ─── 1. فحص machine-lock المحلي (يعمل بدون إنترنت) ───────────
    const localLock = checkMachineLock(deviceId);
    if (localLock.expired) {
      return { success: false, error: localLock.reason };
    }

    // ─── 2. فحص Firebase (إذا توفر إنترنت) ───────────────────────
    try {
      const existingLic = await firebase.refreshLicenseFromCloud(this.app, deviceId);
      if (existingLic) {
        const st = existingLic.status;
        if (st === 'expired' || st === 'blocked') {
          return { success: false, error: 'هذا الجهاز استنفذ الفترة التجريبية أو تم حظره. تواصل مع الدعم للتفعيل الدائم.' };
        }
        if (st === 'trial' && existingLic.trialEndsAt) {
          const endsAt = existingLic.trialEndsAt.toDate ? existingLic.trialEndsAt.toDate() : new Date(existingLic.trialEndsAt);
          if (Date.now() > endsAt.getTime()) {
            return { success: false, error: 'انتهت الفترة التجريبية لهذا الجهاز. تواصل مع الدعم للتفعيل الدائم.' };
          }
        }
      }
    } catch (_) {
      // بدون إنترنت → نكمل، المراقبة المحلية تكفي
    }

    this.writeTrialTriple(deviceId, startedAt);
    this.cache.firstActivationAt = startedAt;
    this.saveCache();

    // ─── 3. تسجيل بصمة الجهاز في مواقع النظام ────────────────────
    const trialEndsAt = startedAt + TRIAL_DAYS * MS_DAY;
    recordDeviceTrial(deviceId, trialEndsAt);

    const req = {
      type: 'trial_start',
      deviceId,
      hubDeviceId: deviceId,
      clientDeviceId: deviceId,
      status: 'pending',
      ...restaurantPackage,
    };

    try {
      await firebase.upsertLicenseForHub(this.app, deviceId, {
        status: 'trial',
        allowedClients: 2,
        trialStartedAt: new Date(startedAt),
        trialEndsAt: new Date(trialEndsAt),
        restaurantName: restaurantPackage.restaurantName || '',
        adminUsername: restaurantPackage.adminUsername || '',
      });
      await firebase.createActivationRequest(this.app, req);
      this.markFirebaseSyncOk({
        licenseDocId: this.cache.licenseDocId,
        allowedClients: 2,
        status: 'trial',
        hubDeviceId: deviceId,
        isHub: true,
      });
      return { success: true };
    } catch (e) {
      this.markFirebaseSyncOk({ status: 'trial', allowedClients: 2, hubDeviceId: deviceId, isHub: true });
      return { success: true, offline: true, warning: e.message };
    }
  }

  async requestPermanentActivation(restaurantPackage) {
    const deviceId = getDeviceId();
    const req = {
      type: 'permanent_activate',
      deviceId,
      hubDeviceId: this.cache.hubDeviceId || deviceId,
      clientDeviceId: deviceId,
      status: 'pending',
      ...restaurantPackage,
    };
    try {
      await firebase.createActivationRequest(this.app, req);
      this.markFirebaseSyncOk();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async requestExtraDevices(restaurantPackage) {
    const deviceId = getDeviceId();
    const req = {
      type: 'extra_devices',
      deviceId,
      hubDeviceId: this.cache.hubDeviceId || deviceId,
      clientDeviceId: deviceId,
      status: 'pending',
      currentAllowed: this.cache.allowedClients || 1,
      ...restaurantPackage, // contains requestedDevicesCount
    };
    try {
      await firebase.createActivationRequest(this.app, req);
      this.markFirebaseSyncOk();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async checkStatusFromCloud() {
    const deviceId = this.cache.hubDeviceId || getDeviceId();
    try {
      let lic = await firebase.refreshLicenseFromCloud(this.app, deviceId);
      
      // ─── رفع الأجهزة القديمة (Migration) ───
      if (!lic && (this.cache.status === 'active' || this.cache.status === 'trial')) {
        const setupData = this.getSetupData() || {};
        await firebase.upsertLicenseForHub(this.app, deviceId, {
          status: this.cache.status,
          allowedClients: this.cache.allowedClients || 1,
          restaurantName: this.cache.restaurantName || setupData.restaurantName || 'عميل قديم (تم ترقيته لفايربيس)',
          adminUsername: setupData.adminUsername || '',
          phone: setupData.phone || '',
          createdAt: new Date(),
          updatedAt: new Date()
        });
        lic = await firebase.refreshLicenseFromCloud(this.app, deviceId);
      }

      if (!lic) {
        return { success: true, found: false };
      }
      const allowed = Number(lic.allowedClients) || 1;
      const status = lic.status || 'trial';

      // إذا رجعت الحالة إلى active أو trial — ارفع الحظر المحلي
      if (status === 'active' || status === 'trial') {
        if (this.killed) {
          console.log('[License] Kill switch lifted — status restored to:', status);
        }
        this.killed = false;
        this.cache.timeTamperDetected = false;
      }

      this.markFirebaseSyncOk({
        licenseDocId: lic.id,
        allowedClients: allowed,
        status,
        hubDeviceId: lic.hubDeviceId || deviceId,
      });

      if (status === 'expired' || status === 'blocked') {
        this.executeKillSwitch(status);
      }
      return { success: true, found: true, status, allowedClients: allowed };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async refreshLicenseManual() {
    return this.checkStatusFromCloud();
  }

  async requestUpgrade(clientDeviceId, hubDeviceId) {
    try {
      await firebase.createActivationRequest(this.app, {
        type: 'upgrade_request',
        deviceId: clientDeviceId,
        hubDeviceId: hubDeviceId || this.cache.hubDeviceId || getDeviceId(),
        clientDeviceId,
        status: 'pending',
        message: 'طلب ترقية عدد الأجهزة',
      });
      this.markFirebaseSyncOk();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  isThisDeviceHub() {
    const id = getDeviceId();
    return (
      this.cache.isHub === true ||
      this.cache.hubDeviceId === id ||
      (this.isSetupComplete() && !this.cache.hubDeviceId)
    );
  }

  countLanClients() {
    const now = Date.now();
    const windowMs = 30 * 60 * 1000;
    let n = 0;
    for (const [, v] of this.lanClients) {
      if (now - v.lastSeen < windowMs) n++;
    }
    return n;
  }

  handlePeerPingLicense(data, rinfo, instanceId, server) {
    if (!this.isThisDeviceHub() || !this.isLicenseActive()) return null;

    const clientDeviceId = data.deviceId;
    if (!clientDeviceId) return null;

    const allowed = Number(this.cache.allowedClients) || 1;
    const hubId = getDeviceId();

    this.lanClients.set(clientDeviceId, {
      ip: rinfo.address,
      lastSeen: Date.now(),
      hostname: data.hostname || '',
    });

    const activeIds = new Set([hubId]);
    const now = Date.now();
    for (const [id, v] of this.lanClients) {
      if (now - v.lastSeen < 30 * 60 * 1000) activeIds.add(id);
    }

    const total = activeIds.size;
    const send = (payload) => {
      try {
        const msg = Buffer.from(JSON.stringify({ ...payload, instanceId }));
        server.send(msg, 0, msg.length, this._udpPort, this._broadcastAddr);
      } catch (e) {
        console.error('[License] UDP send:', e.message);
      }
    };

    if (total > allowed) {
      send({
        type: 'peer_rejected',
        hubDeviceId: hubId,
        clientDeviceId,
        reason: 'max_clients',
        allowedClients: allowed,
      });
      return { rejected: true };
    }

    send({
      type: 'peer_pong',
      hostname: require('os').hostname(),
      hasData: true,
      hubDeviceId: hubId,
      accepted: true,
    });
    return { accepted: true };
  }

  getLinkedDevicesList() {
    const list = [];
    const hubId = getDeviceId();
    list.push({ deviceId: hubId, role: 'hub', lastSeen: Date.now() });
    const now = Date.now();
    for (const [id, v] of this.lanClients) {
      if (now - v.lastSeen < 30 * 60 * 1000) {
        list.push({ deviceId: id, ip: v.ip, hostname: v.hostname, lastSeen: v.lastSeen });
      }
    }
    return list;
  }

  async backgroundSyncTick() {
    // لا نوقف المزامنة حتى لو الحالة المحلية blocked/expired
    // حتى نتمكن من اكتشاف أي تغيير في Firebase (رفع الحظر أو تأكيده)
    const isHub = this.isThisDeviceHub();
    try {
      const hubId = this.cache.hubDeviceId || getDeviceId();
      // لا نزامن الأجهزة المرتبطة إلا إذا كان النظام Hub ونشطاً
      if (isHub && this.isLicenseActive()) {
        const linked = this.getLinkedDevicesList();
        await firebase.syncLinkedDevicesToLicense(this.app, hubId, linked);
      }
      let lic = await firebase.refreshLicenseFromCloud(this.app, hubId);
      
      // ─── رفع الأجهزة القديمة (Migration) ───
      const isExistingCustomer = this.isSetupComplete() && !this.cache.status;
      const hasLocalStatus = this.cache.status === 'active' || this.cache.status === 'trial';

      if (!lic && (hasLocalStatus || isExistingCustomer)) {
        // إنشاء سجل جديد في فايربيس للعميل القديم
        const uploadStatus = this.cache.status || 'trial';
        const setupData = this.getSetupData() || {};
        await firebase.upsertLicenseForHub(this.app, hubId, {
          status: uploadStatus,
          allowedClients: this.cache.allowedClients || 1,
          restaurantName: this.cache.restaurantName || setupData.restaurantName || '',
          adminUsername: this.cache.adminUsername || setupData.adminUsername || '',
          phone: this.cache.phone || setupData.phone || '',
          createdAt: new Date(),
          updatedAt: new Date()
        });
        lic = await firebase.refreshLicenseFromCloud(this.app, hubId);
      } else if (lic) {
        // السجل موجود — نحدّث فقط الحقول الناقصة (phone, restaurantName, adminUsername)
        const patch = {};
        if (!lic.phone && this.cache.phone) patch.phone = this.cache.phone;
        if (!lic.restaurantName && this.cache.restaurantName) patch.restaurantName = this.cache.restaurantName;
        if (!lic.adminUsername && this.cache.adminUsername) patch.adminUsername = this.cache.adminUsername;
        if (Object.keys(patch).length > 0) {
          await firebase.upsertLicenseForHub(this.app, hubId, patch);
        }
      }

      if (lic) {
        const newStatus = lic.status || this.cache.status;
        this.markFirebaseSyncOk({
          allowedClients: Number(lic.allowedClients) || this.cache.allowedClients || 1,
          status: newStatus,
          licenseDocId: lic.id,
        });
        if (newStatus === 'expired' || newStatus === 'blocked') {
          this.executeKillSwitch(newStatus);
        }
      }
    } catch (e) {
      console.warn('[License] backgroundSync:', e.message);
    }
  }

  startBackgroundWorker() {
    if (this.backgroundTimer) clearInterval(this.backgroundTimer);
    this.backgroundTimer = setInterval(() => {
      this.backgroundSyncTick().catch(() => {});
    }, BACKGROUND_SYNC_INTERVAL_MS);
    const firstDelay = global._mcWeakHost ? 45000 : 20000;
    setTimeout(() => this.backgroundSyncTick().catch(() => {}), firstDelay);
  }

  stopBackgroundWorker() {
    if (this.backgroundTimer) clearInterval(this.backgroundTimer);
    this.backgroundTimer = null;
  }

  executeKillSwitch(reason) {
    if (this.killed) return;
    this.killed = true;
    this.cache.status = reason === 'blocked' ? 'blocked' : 'expired';
    this.saveCache();

    try {
      if (this._httpServerRef) {
        this._httpServerRef.close();
        this._httpServerRef = null;
        console.warn('[License] HTTP server stopped (kill switch)');
      }
    } catch (_) {}

    try {
      if (this._udpSend) {
        const msg = Buffer.from(
          JSON.stringify({
            type: LICENSE_KICK_UDP_TYPE,
            reason,
            hubDeviceId: this.cache.hubDeviceId || getDeviceId(),
          })
        );
        this._udpSend(msg, 0, msg.length, this._udpPort, this._broadcastAddr);
      }
    } catch (_) {}

    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('license-killed', { reason });
      }
    });
  }

  broadcastToRenderers(channel, payload) {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    });
  }

  getPublicInfo() {
    const deviceId = this.cache.deviceId || getDeviceId();
    const trial = this.readTrialStartedAt(deviceId);
    const access = this.evaluateAccess(trial);
    const status = this.cache.status || 'none';
    const labels = {
      none: 'غير مفعّل',
      trial: 'تجربة مجانية',
      active: 'نسخة دائمة',
      expired: 'منتهي',
      blocked: 'موقوف',
    };
    let trialEndsAtLabel = '—';
    if (trial && !trial.tamper && trial.trialEndsAt) {
      trialEndsAtLabel = new Date(trial.trialEndsAt).toLocaleString('ar-SA');
    }
    return {
      deviceId,
      status,
      statusLabel: labels[status] || status,
      allowedClients: this.cache.allowedClients ?? 1,
      trialEndsAt: trial ? trial.trialEndsAt : null,
      trialEndsAtLabel,
      canLogin: access.ok,
      lastFirebaseSyncAt: this.cache.lastFirebaseSyncAt || null,
    };
  }
}

module.exports = new LicenseManager();
