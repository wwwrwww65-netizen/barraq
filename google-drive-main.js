'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const { Readable } = require('stream');

/** يجب إضافة هذا العنوان في Google Cloud → Credentials → OAuth client → Authorized redirect URIs */
const OAUTH_PORT = 45231;
const REDIRECT_PATH = '/oauth2callback';
const DRIVE_SCOPE = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
];

function loadOAuthConfig() {
  const envId = process.env.GOOGLE_CLIENT_ID;
  const envSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (envId && envSecret) {
    return { clientId: envId.trim(), clientSecret: envSecret.trim() };
  }
  const candidates = [
    path.join(__dirname, 'google-oauth.json'),
    path.join(process.resourcesPath || __dirname, 'google-oauth.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const j = JSON.parse(fs.readFileSync(p, 'utf8'));
        let clientId = j.clientId;
        let clientSecret = j.clientSecret;
        const inst = j.installed || j.web;
        if (inst && (!clientId || !clientSecret)) {
          clientId = clientId || inst.client_id;
          clientSecret = clientSecret || inst.client_secret;
        }
        if (clientId && clientSecret) {
          return { clientId: String(clientId).trim(), clientSecret: String(clientSecret).trim() };
        }
      }
    } catch (e) {
      console.error('[Google Drive] config read error', p, e.message);
    }
  }
  return null;
}

function tokenPath(app) {
  return path.join(app.getPath('userData'), 'google-drive-tokens.json');
}

function metaPath(app) {
  return path.join(app.getPath('userData'), 'google-drive-meta.json');
}

function saveTokens(app, tokens, email) {
  const data = {
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    expiry_date: tokens.expiry_date,
    email: email || '',
    savedAt: new Date().toISOString(),
  };
  fs.writeFileSync(tokenPath(app), JSON.stringify(data, null, 2), 'utf8');
}

function loadTokens(app) {
  try {
    const p = tokenPath(app);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
}

function saveMeta(app, meta) {
  fs.writeFileSync(metaPath(app), JSON.stringify(meta, null, 2), 'utf8');
}

function loadMeta(app) {
  try {
    const p = metaPath(app);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
}

function autoPath(app) {
  return path.join(app.getPath('userData'), 'google-drive-auto.json');
}

function loadAutoSettings(app) {
  const defaults = {
    enabled: false,
    intervalMinutes: 360,
    lastAutoRunAt: null,
    lastAutoError: '',
  };
  try {
    const p = autoPath(app);
    if (!fs.existsSync(p)) return { ...defaults };
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return { ...defaults, ...j };
  } catch (e) {
    return { ...defaults };
  }
}

function saveAutoSettings(app, data) {
  try {
    fs.writeFileSync(autoPath(app), JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[Google Drive] saveAutoSettings', e);
  }
}

async function collectLocalStorageSnapshot(BrowserWindow) {
  const merged = {};
  const wins = BrowserWindow.getAllWindows();
  for (let i = 0; i < wins.length; i++) {
    const win = wins[i];
    try {
      if (win.isDestroyed()) continue;
      const snap = await win.webContents.executeJavaScript(
        `(function(){try{var o={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);o[k]=localStorage.getItem(k);}return o;}catch(e){return {}}})()`,
        true
      );
      if (snap && typeof snap === 'object') Object.assign(merged, snap);
    } catch (e) {
      /* try next window */
    }
  }
  return merged;
}

/** رفع نسخة كاملة (قاعدة + localStorage) — يُستدعى يدوياً أو من المجدول */
async function runDriveBackup(app, getDbPath, localStorageSnapshot) {
  const config = loadOAuthConfig();
  if (!config) return { success: false, error: 'missing_config' };
  const oauth2Client = await getAuthenticatedClient(app, config);
  if (!oauth2Client) return { success: false, error: 'not_linked' };

  const { google } = require('googleapis');
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  const dbPath = getDbPath();
  let databaseObj = {};
  try {
    if (fs.existsSync(dbPath)) {
      databaseObj = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    }
  } catch (e) {
    console.warn('[Google Drive] db read', e.message);
  }

  const payload = {
    hashPosBackupVersion: 1,
    exportedAt: new Date().toISOString(),
    hostname: os.hostname(),
    localStorage:
      localStorageSnapshot && typeof localStorageSnapshot === 'object' ? localStorageSnapshot : {},
    database: databaseObj,
  };
  const buf = Buffer.from(JSON.stringify(payload), 'utf8');
  const bodyStream = Readable.from(buf);

  let meta = loadMeta(app) || {};
  const existingId = meta.backupFileId;

  if (existingId) {
    try {
      await drive.files.update({
        fileId: existingId,
        media: { mimeType: 'application/json', body: bodyStream },
      });
      meta.lastBackupAt = payload.exportedAt;
      saveMeta(app, meta);
      return {
        success: true,
        fileId: existingId,
        mode: 'update',
        sizeKB: (buf.length / 1024).toFixed(2),
      };
    } catch (e) {
      console.warn('[Google Drive] update failed, creating new file', e.message);
    }
  }

  const fileName = `HashPOS_full_backup_${payload.exportedAt.replace(/[:.]/g, '-').slice(0, 19)}.json`;
  const createRes = await drive.files.create({
    requestBody: { name: fileName, mimeType: 'application/json' },
    media: { mimeType: 'application/json', body: Readable.from(buf) },
    fields: 'id,name',
  });
  const id = createRes.data.id;
  saveMeta(app, {
    backupFileId: id,
    backupFileName: fileName,
    lastBackupAt: payload.exportedAt,
  });
  return {
    success: true,
    fileId: id,
    mode: 'create',
    sizeKB: (buf.length / 1024).toFixed(2),
  };
}

async function getAuthenticatedClient(app, config) {
  const stored = loadTokens(app);
  if (!stored || !stored.refresh_token) return null;
  const { google } = require('googleapis');
  const redirectUri = `http://127.0.0.1:${OAUTH_PORT}${REDIRECT_PATH}`;
  const oauth2Client = new google.auth.OAuth2(config.clientId, config.clientSecret, redirectUri);
  oauth2Client.setCredentials({
    refresh_token: stored.refresh_token,
    access_token: stored.access_token,
    expiry_date: stored.expiry_date,
  });
  try {
    await oauth2Client.getAccessToken();
    const c = oauth2Client.credentials;
    saveTokens(
      app,
      {
        refresh_token: c.refresh_token || stored.refresh_token,
        access_token: c.access_token,
        expiry_date: c.expiry_date,
      },
      stored.email
    );
    return oauth2Client;
  } catch (e) {
    console.error('[Google Drive] token refresh failed', e);
    return null;
  }
}

function setupGoogleDriveIpc(ipcMain, app, getDbPath) {
  ipcMain.handle('google-drive-status', async () => {
    const config = loadOAuthConfig();
    if (!config) {
      return { ok: false, linked: false, configOk: false, error: 'missing_config' };
    }
    const tok = loadTokens(app);
    if (!tok || !tok.refresh_token) {
      return { ok: true, linked: false, configOk: true };
    }
    return { ok: true, linked: true, email: tok.email || '', configOk: true };
  });

  ipcMain.handle('google-drive-auth-start', async () => {
    const config = loadOAuthConfig();
    if (!config) {
      return {
        success: false,
        error: 'missing_config',
        message: 'أنشئ ملف google-oauth.json أو عيّن GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET',
      };
    }

    const { google } = require('googleapis');
    const { shell } = require('electron');
    const redirectUri = `http://127.0.0.1:${OAUTH_PORT}${REDIRECT_PATH}`;
    const oauth2Client = new google.auth.OAuth2(config.clientId, config.clientSecret, redirectUri);

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: DRIVE_SCOPE,
      prompt: 'consent',
      include_granted_scopes: true,
    });

    return new Promise((resolve) => {
      let settled = false;
      const done = (payload) => {
        if (settled) return;
        settled = true;
        resolve(payload);
      };

      const server = http.createServer(async (req, res) => {
        try {
          if (!req.url || !req.url.startsWith(REDIRECT_PATH)) {
            res.writeHead(404);
            res.end();
            return;
          }
          const u = new URL(req.url, `http://127.0.0.1:${OAUTH_PORT}`);
          const code = u.searchParams.get('code');
          const errParam = u.searchParams.get('error');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });

          if (errParam) {
            res.end(
              `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body dir="rtl" style="font-family:sans-serif;padding:24px"><h2>فشل الربط</h2><p>${errParam}</p></body></html>`
            );
            try {
              server.close();
            } catch (e) {}
            done({ success: false, error: errParam });
            return;
          }
          if (!code) {
            res.end('<!DOCTYPE html><html><body>OK</body></html>');
            return;
          }

          const { tokens } = await oauth2Client.getToken(code);
          oauth2Client.setCredentials(tokens);

          let email = '';
          try {
            const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
            const ui = await oauth2.userinfo.get();
            email = (ui.data && ui.data.email) || '';
          } catch (e) {
            console.warn('[Google Drive] userinfo', e.message);
          }

          saveTokens(
            app,
            {
              refresh_token: tokens.refresh_token,
              access_token: tokens.access_token,
              expiry_date: tokens.expiry_date,
            },
            email
          );

          res.end(
            '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body dir="rtl" style="font-family:sans-serif;padding:24px;text-align:center"><h2 style="color:#4285f4">تم الربط بنجاح</h2><p>يمكنك إغلاق هذه النافذة والعودة إلى التطبيق.</p></body></html>'
          );
          try {
            server.close();
          } catch (e) {}
          done({ success: true, email });
        } catch (e) {
          console.error('[Google Drive] callback error', e);
          try {
            res.end('<!DOCTYPE html><html><body>خطأ</body></html>');
          } catch (e2) {}
          try {
            server.close();
          } catch (e3) {}
          done({ success: false, error: e.message });
        }
      });

      const t = setTimeout(() => {
        try {
          if (server.listening) server.close();
        } catch (e) {}
        done({
          success: false,
          error: 'timeout',
          message: 'انتهت مهلة تسجيل الدخول (٥ دقائق). أعد المحاولة.',
        });
      }, 5 * 60 * 1000);

      server.once('close', () => clearTimeout(t));

      server.listen(OAUTH_PORT, '127.0.0.1', () => {
        shell.openExternal(authUrl);
      });

      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          done({
            success: false,
            error: 'port_in_use',
            message: `المنفذ ${OAUTH_PORT} مستخدم. أغلق البرامج الأخرى أو غيّر OAUTH_PORT في google-drive-main.js`,
          });
        } else {
          done({ success: false, error: err.message });
        }
      });
    });
  });

  ipcMain.handle('google-drive-disconnect', async () => {
    try {
      const tp = tokenPath(app);
      const mp = metaPath(app);
      if (fs.existsSync(tp)) fs.unlinkSync(tp);
      if (fs.existsSync(mp)) fs.unlinkSync(mp);
      const auto = loadAutoSettings(app);
      auto.enabled = false;
      auto.lastAutoError = '';
      saveAutoSettings(app, auto);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('google-drive-get-auto', async () => loadAutoSettings(app));

  ipcMain.handle('google-drive-save-auto', async (event, data) => {
    const cur = loadAutoSettings(app);
    const mins = Number(data && data.intervalMinutes);
    const next = {
      ...cur,
      enabled: !!(data && data.enabled),
      intervalMinutes: Number.isFinite(mins) ? Math.max(15, Math.min(10080, mins)) : 360,
    };
    if (data && data.resetSchedule) {
      next.lastAutoRunAt = new Date().toISOString();
    }
    saveAutoSettings(app, next);
    return { success: true, settings: next };
  });

  ipcMain.handle('google-drive-backup', async (event, localStorageSnapshot) => {
    return runDriveBackup(app, getDbPath, localStorageSnapshot);
  });

  ipcMain.handle('google-drive-restore', async () => {
    const config = loadOAuthConfig();
    if (!config) return { success: false, error: 'missing_config' };
    const oauth2Client = await getAuthenticatedClient(app, config);
    if (!oauth2Client) return { success: false, error: 'not_linked' };

    const { google } = require('googleapis');
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    let meta = loadMeta(app) || {};
    let fileId = meta.backupFileId;

    if (!fileId) {
      const list = await drive.files.list({
        pageSize: 15,
        fields: 'files(id,name,modifiedTime)',
        q: "name contains 'HashPOS_full_backup' and mimeType = 'application/json' and trashed = false",
      });
      const files = list.data.files || [];
      if (files.length === 0) {
        return { success: false, error: 'no_backup_found', message: 'لم يُعثر على نسخة في Drive' };
      }
      files.sort((a, b) => (b.modifiedTime || '').localeCompare(a.modifiedTime || ''));
      fileId = files[0].id;
    }

    const dest = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    const text = Buffer.from(dest.data).toString('utf8');
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (e) {
      return { success: false, error: 'invalid_json' };
    }

    if (!payload.database || typeof payload.database !== 'object') {
      return { success: false, error: 'invalid_backup' };
    }

    const dbPath = getDbPath();
    fs.writeFileSync(dbPath, JSON.stringify(payload.database, null, 2), 'utf8');

    saveMeta(app, {
      ...meta,
      backupFileId: fileId,
      lastRestoreAt: new Date().toISOString(),
    });

    return {
      success: true,
      localStorage: payload.localStorage && typeof payload.localStorage === 'object' ? payload.localStorage : {},
      exportedAt: payload.exportedAt || '',
    };
  });
}

const AUTO_CHECK_MS = 60 * 1000;
let autoSchedulerInterval = null;

/**
 * يفحص كل دقيقة: إن كان النسخ التلقائي مفعّلاً ومضى الفاصل منذ آخر رفع ناجح.
 */
function startGoogleDriveAutoScheduler(app, getDbPath, BrowserWindow) {
  if (autoSchedulerInterval) clearInterval(autoSchedulerInterval);
  autoSchedulerInterval = setInterval(async () => {
    try {
      const auto = loadAutoSettings(app);
      if (!auto.enabled) return;
      if (!loadTokens(app)?.refresh_token) return;

      const intervalMs = (auto.intervalMinutes || 360) * 60 * 1000;

      if (!auto.lastAutoRunAt) {
        const cur = loadAutoSettings(app);
        cur.lastAutoRunAt = new Date().toISOString();
        saveAutoSettings(app, cur);
        return;
      }

      const last = new Date(auto.lastAutoRunAt).getTime();
      if (Number.isNaN(last) || Date.now() - last < intervalMs) return;

      const snap = await collectLocalStorageSnapshot(BrowserWindow);
      const res = await runDriveBackup(app, getDbPath, snap);
      const next = loadAutoSettings(app);
      if (res.success) {
        next.lastAutoRunAt = new Date().toISOString();
        next.lastAutoError = '';
        saveAutoSettings(app, next);
        try {
          BrowserWindow.getAllWindows().forEach((win) => {
            if (!win.isDestroyed()) {
              win.webContents.send('google-drive-auto-backup', {
                ok: true,
                sizeKB: res.sizeKB,
                mode: res.mode,
              });
            }
          });
        } catch (e) {}
      } else {
        next.lastAutoError = res.error || 'backup_failed';
        saveAutoSettings(app, next);
        console.warn('[Google Drive] scheduled backup failed:', res);
      }
    } catch (e) {
      console.error('[Google Drive] scheduler', e);
    }
  }, AUTO_CHECK_MS);
}

module.exports = {
  setupGoogleDriveIpc,
  loadOAuthConfig,
  startGoogleDriveAutoScheduler,
  OAUTH_PORT,
  REDIRECT_PATH,
};
