'use strict';
const { app, BrowserWindow, ipcMain, shell, safeStorage, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const cfg = require('./config');
const { StoreApi, ApiError } = require('./src/api');
const installer = require('./src/installer');
const demo = require('./src/demo');
const { Realtime } = require('./src/realtime');

let win = null;
let demoMode = cfg.DEMO;
let demoAdminCore = null; // faux backend admin en mémoire (mode démo)
let demoState = { pass: null, owned: [], obtained: [] };
let session = { user: null };
const running = new Map(); // slug -> child
const launchTokens = new Map(); // slug -> jeton de lancement en cours (vérifié par /license/heartbeat)
let catalogCache = [];
let hwidCache = null;

const userData = () => app.getPath('userData');
const settingsFile = () => path.join(userData(), 'settings.json');
const sessionFile = () => path.join(userData(), 'session.bin');

function readSettings() { try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch (_) { return {}; } }
function apiUrl() { return readSettings().apiUrl || cfg.envApiUrl() || cfg.DEFAULT_STORE_API_URL; }
const api = new StoreApi(apiUrl);

// ---------- Jeton chiffré (safeStorage) ----------
function saveToken(token) {
  try {
    if (!safeStorage.isEncryptionAvailable()) return;
    fs.writeFileSync(sessionFile(), safeStorage.encryptString(token));
  } catch (_) { /* non bloquant */ }
}
function loadToken() {
  try {
    if (!safeStorage.isEncryptionAvailable() || !fs.existsSync(sessionFile())) return null;
    return safeStorage.decryptString(fs.readFileSync(sessionFile()));
  } catch (_) { return null; }
}
function clearToken() { try { fs.rmSync(sessionFile(), { force: true }); } catch (_) {} }

async function getHwid() {
  if (hwidCache) return hwidCache;
  try { hwidCache = require('node-machine-id').machineIdSync(); } catch (_) {
    hwidCache = require('crypto').createHash('sha256').update(os.hostname() + os.userInfo().username).digest('hex');
  }
  return hwidCache;
}

// ---------- Helpers IPC ----------
const ok = (data) => ({ ok: true, data });
const fail = (e) => ({ ok: false, error: { code: e.code || 'error', message: e.message || 'Erreur inconnue.', extra: e.extra } });
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, arg) => {
    try { return ok(await fn(arg)); } catch (e) { return fail(e); }
  });
}
const send = (ch, payload) => { if (win && !win.isDestroyed()) win.webContents.send(ch, payload); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Révocation instantanée ----------
// Flux SSE (/events) tant que le joueur est connecté ; repli : sondage de /entitlements toutes les 60 s tant qu'un jeu tourne.
function killTree(child) {
  try {
    const pid = child && child.pid;
    if (!pid) return;
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {});
    else { try { process.kill(-pid, 'SIGKILL'); } catch (_) { child.kill('SIGKILL'); } }
  } catch (_) { /* déjà terminé */ }
}
let checking = false;
async function checkAccess() {
  if (demoMode || !session.user || checking) return;
  checking = true;
  try {
    let ent;
    try { ent = await api.entitlements(); } catch (e) { return; } // réseau coupé : on ne coupe rien sur une erreur transitoire
    send('access:changed', ent);
    for (const [slug, child] of [...running]) {
      let allowed = Array.isArray(ent.access) && ent.access.includes(slug);
      if (allowed && launchTokens.has(slug)) { // jeton périmé (ex. changement d'appareil) : le serveur tranche
        try {
          const hb = await api.heartbeat(launchTokens.get(slug));
          if (hb && hb.valid === false) allowed = false;
          else if (hb && hb.token) launchTokens.set(slug, hb.token);
        } catch (_) { /* réseau : on garde */ }
      }
      if (!allowed) { running.delete(slug); launchTokens.delete(slug); killTree(child); send('games:state', { slug, running: false }); send('access:revoked', { slug }); }
    }
  } finally { checking = false; }
}
let pollTimer = null;
function syncPoll() {
  if (running.size && !pollTimer) pollTimer = setInterval(checkAccess, 60000);
  else if (!running.size && pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}
const realtime = new Realtime({
  getUrl: apiUrl, getToken: () => api.token,
  onEvent: (ev) => { if (ev === 'entitlements' || ev === 'revoked') checkAccess(); },
  onState: (up) => { if (up) checkAccess(); } // (re)connexion : rattrape ce qui a pu être manqué
});
const startRealtime = () => { if (!demoMode && api.token) realtime.start(); };

// ---------- Auth ----------
async function autoLogin() {
  if (demoMode) { session.user = demo.user; return true; }
  const t = loadToken();
  if (!t) return false;
  api.setToken(t);
  try {
    const r = await api.me();
    session.user = r.user;
    startRealtime();
    return true;
  } catch (e) {
    if (e.status === 401 || e.status === 403) { clearToken(); api.setToken(null); }
    else if (e.code === 'network') { /* garde le token, utilisateur inconnu */ }
    return false;
  }
}

handle('state:get', async () => {
  let reachable = true;
  let loggedIn = false;
  if (demoMode) loggedIn = true;
  else {
    loggedIn = await autoLogin();
    if (!loggedIn) { try { await api.games(); } catch (e) { reachable = e.code !== 'network'; } }
  }
  return {
    loggedIn, user: session.user, demo: demoMode, reachable,
    demoAvailable: cfg.DEMO || !reachable, apiUrl: apiUrl(), dev: process.env.PAPOUTH_DEV === '1',
    version: app.getVersion(), platform: process.platform
  };
});

async function authDone(r) {
  api.setToken(r.token);
  saveToken(r.token);
  session.user = r.user;
  startRealtime();
  return { user: r.user };
}
handle('auth:login', async ({ email, password }) => authDone(await api.login(email, password)));
handle('auth:register', async ({ email, password, tiktok }) => authDone(await api.register(email, password, tiktok)));
// « Mot de passe oublié ? » : la page du site gère le cas (formulaire e-mail ou contact support)
handle('auth:forgot', async () => {
  let origin; try { origin = new URL(apiUrl()).origin; } catch (_) { throw new ApiError('bad_api_url', 'URL du serveur invalide.'); }
  await shell.openExternal(origin + '/compte.html#oubli');
  return true;
});
handle('auth:changePassword', async ({ current, newPassword, lang }) => {
  if (demoMode) return { ok: true };
  const r = await api.changePassword(String(current || ''), String(newPassword || ''), lang);
  if (r && r.token) { api.setToken(r.token); saveToken(r.token); } // la session courante reste ouverte (les autres appareils sont déconnectés)
  return { ok: true };
});
handle('auth:logout', async () => {
  realtime.stop(); clearToken(); api.setToken(null); session.user = null; demoMode = false;
  return true;
});
handle('demo:start', async () => { realtime.stop(); demoMode = true; demoAdminCore = null; demoState = { pass: null, owned: [], obtained: [] }; session.user = demo.user; return { user: demo.user }; });

// ---------- Mode administrateur ----------
const isAdmin = () => !!(session.user && session.user.role === 'admin');
const requireAdmin = () => { if (!isAdmin()) throw new ApiError('forbidden', 'Accès réservé aux administrateurs.', 403); };
const MEDIA_MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4' };
const picked = new Set(); // seuls les fichiers choisis via la boîte de dialogue / le glisser-déposer peuvent être envoyés
function fileInfo(p) {
  try {
    const st = fs.statSync(p);
    if (!st.isFile()) return null;
    const ext = path.extname(p).toLowerCase();
    picked.add(p);
    const mime = MEDIA_MIME[ext] || (ext === '.zip' ? 'application/zip' : ext === '.exe' ? 'application/octet-stream' : '');
    return { path: p, name: path.basename(p), size: st.size, mime, kind: mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'image' : ext === '.zip' ? 'zip' : ext === '.exe' ? 'exe' : ext === '.json' ? 'json' : 'other' };
  } catch (_) { return null; }
}
function demoAdmin() {
  if (!demoAdminCore) demoAdminCore = require('./renderer/admin-demo').create({ gamesFor: demo.gamesFor, langs: ['fr', 'en', 'es', 'th', 'ms'] });
  return demoAdminCore;
}
// Les URLs relatives renvoyées par /admin/* (couverture, médias) deviennent absolues comme pour le catalogue public.
function absolutizeAdmin(data) {
  let origin = '';
  try { origin = new URL(apiUrl()).origin; } catch (_) { return data; }
  const fix = (u) => (typeof u === 'string' && u.startsWith('/') ? origin + u : u);
  const one = (g) => {
    if (!g || typeof g !== 'object') return;
    if ('image' in g) g.image = fix(g.image);
    if ('coverUrl' in g) g.coverUrl = fix(g.coverUrl);
    for (const m of g.media || []) { m.url = fix(m.url); if (m.thumb) m.thumb = fix(m.thumb); }
  };
  if (data) { (data.games || []).forEach(one); one(data.game); if (data.item) one({ media: [data.item] }); }
  return data;
}
const ADMIN_ROUTE = /^\/admin\/[A-Za-z0-9_\-/?=&%.@+]*$/;
handle('admin:call', async ({ method, path: route, body }) => {
  requireAdmin();
  if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method) || typeof route !== 'string' || !ADMIN_ROUTE.test(route) || route.includes('..')) throw new ApiError('bad_request', 'Requête invalide.');
  if (demoMode) return demoAdmin().handle(method, route, body);
  return absolutizeAdmin(await api.request(method, route, body));
});
handle('admin:pick', async ({ kind }) => {
  requireAdmin();
  const media = kind === 'media';
  const r = await dialog.showOpenDialog(win, {
    properties: media ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: media ? [{ name: 'Images / MP4', extensions: ['jpg', 'jpeg', 'png', 'webp', 'mp4'] }] : kind === 'json' ? [{ name: 'JSON', extensions: ['json'] }] : [{ name: 'ZIP / EXE', extensions: ['zip', 'exe'] }]
  });
  return r.canceled ? [] : r.filePaths.map(fileInfo).filter(Boolean);
});
handle('admin:fileInfo', async (paths) => { requireAdmin(); return (Array.isArray(paths) ? paths : []).slice(0, 50).map((p) => (typeof p === 'string' && p ? fileInfo(p) : null)).filter(Boolean); });
// Clé de compte de service Firestore : lue ICI (process principal), envoyée au serveur, jamais stockée ni renvoyée au renderer.
handle('admin:firestoreKey', async ({ slug, path: fp, collection, enabled }) => {
  requireAdmin();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(slug)) || !picked.has(fp)) throw new ApiError('bad_request', 'Fichier ou jeu invalide.');
  const info = fileInfo(fp);
  if (!info || info.kind !== 'json' || info.size > 65536) throw new ApiError('invalid_service_account', 'Choisissez le fichier .json de la clé du compte de service.', 400);
  let key;
  try { key = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (_) { throw new ApiError('invalid_service_account', 'Ce fichier n\'est pas un JSON valide.', 400); }
  const body = { serviceAccount: key, ...(collection ? { collection } : {}), ...(typeof enabled === 'boolean' ? { enabled } : {}) };
  const route = `/admin/games/${slug}/firestore`;
  return demoMode ? demoAdmin().handle('PUT', route, body) : absolutizeAdmin(await api.request('PUT', route, body));
});
handle('admin:upload', async ({ slug, kind, path: fp, id, version, exe }) => {
  requireAdmin();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(slug)) || !picked.has(fp)) throw new ApiError('bad_request', 'Fichier ou jeu invalide.');
  const info = fileInfo(fp);
  if (!info) throw new ApiError('bad_request', 'Fichier introuvable.');
  const isBuild = kind === 'build';
  const mime = isBuild ? (info.kind === 'exe' ? 'application/octet-stream' : 'application/zip') : info.mime;
  if (!mime || (isBuild && info.kind !== 'zip' && info.kind !== 'exe')) throw new ApiError('unsupported_type', 'Format non accepté.');
  let last = 0;
  const onProgress = (pct) => { const now = Date.now(); if (pct >= 1 || now - last > 120) { last = now; send('admin:progress', { id, pct }); } };
  if (demoMode) {
    for (let i = 1; i <= 10; i++) { onProgress(i / 10); await sleep(80); }
    return isBuild ? demoAdmin().setBuild(slug, { name: info.name, size: info.size, version, exe }) : demoAdmin().addMedia(slug, { name: info.name, type: info.kind, url: require('url').pathToFileURL(fp).href });
  }
  const q = new URLSearchParams();
  if (isBuild) { if (version) q.set('version', version); if (exe) q.set('exe', exe); }
  q.set('filename', info.name);
  const route = `/admin/games/${slug}/${isBuild ? 'build' : 'media'}?${q}`;
  return absolutizeAdmin(await api.upload(route, fp, mime, onProgress));
});

// ---------- Boutique ----------
// Les URLs d'image/média relatives du backend ("/api/store/assets/...") sont rendues absolues (origine de STORE_API).
function absolutize(data) {
  let origin = '';
  try { origin = new URL(apiUrl()).origin; } catch (_) { return data; }
  const fix = (u) => (typeof u === 'string' && u.startsWith('/') ? origin + u : u);
  for (const g of (data && data.games) || []) {
    g.image = fix(g.image);
    for (const m of g.media || []) { m.url = fix(m.url); if (m.thumb) m.thumb = fix(m.thumb); }
  }
  return data;
}
handle('store:catalog', async (lang) => { const r = demoMode ? { games: demo.gamesFor(lang) } : absolutize(await api.games(lang)); catalogCache = (r && r.games) || []; return r; });
handle('store:entitlements', async () => (demoMode ? demo.entitlements(demoState) : api.entitlements()));
handle('store:library', async () => (demoMode ? { obtained: demoState.obtained.slice() } : api.library()));
handle('store:libraryAdd', async (slug) => {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(slug))) throw new ApiError('bad_request', 'Jeu invalide.');
  if (demoMode) { if (!demoState.obtained.includes(slug)) demoState.obtained.push(slug); return { ok: true, obtained: demoState.obtained.slice() }; }
  return api.libraryAdd(slug);
});
handle('store:checkout', async ({ provider, product, slug, lang }) => {
  if (demoMode) {
    // Simule un paiement validé après quelques secondes.
    setTimeout(() => {
      if (product === 'game') { if (!demoState.owned.includes(slug)) demoState.owned.push(slug); }
      else demoState.pass = { active: true, plan: product === 'pass_yearly' ? 'yearly' : 'monthly', provider, renewsAt: new Date(Date.now() + 30 * 864e5).toISOString(), cancelAtPeriodEnd: false };
    }, 4000);
    return { url: null };
  }
  const r = await api.checkout(provider, product, slug, lang);
  if (!r || !/^https?:\/\//i.test(r.url || '')) throw new ApiError('bad_url', 'URL de paiement invalide.');
  await shell.openExternal(r.url);
  return { url: r.url };
});
handle('store:portal', async (lang) => {
  if (demoMode) return { url: null };
  const r = await api.billingPortal(lang);
  if (!r || !/^https?:\/\//i.test(r.url || '')) throw new ApiError('bad_url', 'URL de gestion invalide.');
  await shell.openExternal(r.url);
  return { url: r.url };
});

handle('store:cancel', async () => {
  if (demoMode) {
    if (!demoState.pass || !demoState.pass.active) throw new ApiError('no_subscription', 'Aucun Game Pass actif à résilier.');
    demoState.pass = { ...demoState.pass, cancelAtPeriodEnd: true };
    return { pass: demoState.pass };
  }
  return api.cancelSubscription();
});
handle('store:resume', async () => {
  if (demoMode) {
    if (!demoState.pass || !demoState.pass.cancelAtPeriodEnd) throw new ApiError('not_cancelled', "Votre abonnement n'est pas résilié.");
    if (demoState.pass.provider === 'paypal') throw new ApiError('resume_requires_new_subscription', 'PayPal ne permet pas de réactiver un abonnement résilié.');
    demoState.pass = { ...demoState.pass, cancelAtPeriodEnd: false };
    return { pass: demoState.pass };
  }
  return api.resumeSubscription();
});

// ---------- Jeux ----------
handle('games:installed', async () => installer.readManifest());
handle('games:running', async () => [...running.keys()]);

// Téléchargement/installation : tâche de fond. Le handler répond tout de suite avec un jobId ;
// la progression (≈4/s) et la fin arrivent par 'games:progress' / 'games:done'. Aucune écriture synchrone.
const jobs = new Map(); // slug -> { id, ac }
let jobSeq = 0;
function makeProgress(slug, jobId, total0) {
  let last = 0, lastBytes = 0, lastT = Date.now(), speed = 0, stage = 'prepare';
  const emit = (extra) => send('games:progress', { slug, jobId, stage, ...extra });
  return {
    stage: (s) => { stage = s; lastBytes = 0; lastT = Date.now(); speed = 0; emit({ pct: null }); },
    tick: (bytes, total) => {
      const now = Date.now();
      if (now - last < 250 && !(total && bytes >= total)) return;
      const dt = (now - lastT) / 1000;
      if (dt > 0) { const inst = (bytes - lastBytes) / dt; speed = speed ? speed * 0.7 + inst * 0.3 : inst; }
      last = now; lastT = now; lastBytes = bytes;
      const tot = total || total0 || 0;
      emit({ bytes, total: tot, pct: tot ? Math.min(1, bytes / tot) : null, speed: Math.round(speed), eta: tot && speed > 1 ? Math.round((tot - bytes) / speed) : null });
    }
  };
}
async function runInstallJob(slug, job) {
  const pr = makeProgress(slug, job.id);
  const signal = job.ac.signal;
  try {
    pr.stage('prepare');
    let entry;
    if (demoMode) {
      const g = demo.gamesFor('fr').find((x) => x.slug === slug);
      const total = (g.sizeMb || 100) * 1048576;
      pr.stage('download');
      for (let bytes = 0; bytes < total; bytes += 12 * 1048576 / 4) {
        if (signal.aborted) throw new ApiError('cancelled', 'Téléchargement annulé.');
        pr.tick(Math.min(bytes, total), total); await sleep(250);
      }
      pr.tick(total, total);
      pr.stage('extract'); await sleep(1500);
      if (signal.aborted) throw new ApiError('cancelled', 'Annulé.');
      const m = await installer.readManifest();
      m[slug] = { version: g.version, exe: slug + '.exe', path: path.join(cfg.GAMES_DIR, slug), demo: true };
      await installer.writeManifest(m);
      entry = m[slug];
    } else {
      const hwid = await getHwid();
      try { await api.registerDevice(hwid, os.hostname()); }
      catch (e) {
        if (e.code === 'device_limit') throw new ApiError('device_limit', 'Ce compte est déjà utilisé sur un autre PC.', 403, e.extra);
        throw e;
      }
      const info = await api.download(slug, hwid);
      if (!info || !info.url) throw new ApiError('no_download', 'Aucun téléchargement disponible pour ce jeu.');
      entry = await installer.install(slug, { ...info, name: job.name }, { signal, onProgress: pr.tick, onStage: (s) => pr.stage(s) });
    }
    send('games:done', { slug, jobId: job.id, ok: true, entry });
  } catch (e) {
    send('games:done', { slug, jobId: job.id, ok: false, error: { code: e.code || 'error', message: e.message || 'Erreur inconnue.', extra: e.extra } });
  } finally {
    jobs.delete(slug);
  }
}
handle('games:install', async (slug) => {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(slug))) throw new ApiError('bad_request', 'Jeu invalide.');
  if (jobs.has(slug)) return { jobId: jobs.get(slug).id, already: true };
  const g = catalogCache.find((x) => x.slug === slug);
  const job = { id: ++jobSeq, ac: new AbortController(), name: g ? g.name : '' };
  jobs.set(slug, job);
  setImmediate(() => runInstallJob(slug, job));
  return { jobId: job.id };
});
handle('games:cancel', async (slug) => { const j = jobs.get(slug); if (j) j.ac.abort(); return !!j; });
handle('games:jobs', async () => [...jobs.entries()].map(([slug, j]) => ({ slug, jobId: j.id })));

// ---------- Appareil autorisé (1 par compte) ----------
let demoDevice = { id: 'demo-device', name: os.hostname(), registeredAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() };
handle('device:get', async () => {
  if (demoMode) return { device: demoDevice, canTransfer: true, nextTransferAt: null };
  const r = await api.devices();
  return { device: (r.devices || [])[0] || null, canTransfer: r.canTransfer, nextTransferAt: r.nextTransferAt || null };
});
handle('device:transfer', async () => {
  if (demoMode) { demoDevice = { ...demoDevice, registeredAt: new Date().toISOString() }; return { ok: true, nextTransferAt: new Date(Date.now() + 30 * 864e5).toISOString() }; }
  return await api.transferDevice(await getHwid(), os.hostname());
});

handle('games:uninstall', async (slug) => {
  if (running.has(slug)) throw new ApiError('running', 'Fermez le jeu avant de le désinstaller.');
  await installer.uninstall(slug);
  return true;
});

handle('games:openFolder', async (slug) => {
  const m = await installer.readManifest();
  const dir = (m[slug] && m[slug].path) || path.join(cfg.GAMES_DIR, slug);
  if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
  const err = await shell.openPath(dir);
  if (err) throw new Error(err);
  return true;
});

handle('games:play', async (slug) => {
  if (running.has(slug)) throw new ApiError('already_running', 'Le jeu est déjà lancé.');
  const m = await installer.readManifest();
  const entry = m[slug];
  if (!entry) throw new ApiError('not_installed', "Ce jeu n'est pas installé.");
  if (demoMode) {
    running.set(slug, { demo: true });
    send('games:state', { slug, running: true });
    setTimeout(() => { running.delete(slug); send('games:state', { slug, running: false }); }, 6000);
    return true;
  }
  const hwid = await getHwid();
  const { token } = await api.launchToken(slug, hwid);
  let exePath = path.join(entry.path, entry.exe);
  if (!fs.existsSync(exePath)) { // installation ancienne ou exe déplacé : on le retrouve (récursif) et on corrige installed.json
    try {
      const g = (catalogCache || []).find((x) => x.slug === slug);
      entry.exe = await installer.resolveExe(entry.path, { exe: entry.exe, slug, name: g && g.name });
      m[slug] = entry; await installer.writeManifest(m);
      exePath = path.join(entry.path, entry.exe);
    } catch (_) { throw new ApiError('missing_exe', "Exécutable introuvable. Réinstallez le jeu."); }
  }
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^ELECTRON_|^NODE_OPTIONS$/i.test(k)) delete env[k]; // le jeu (souvent Electron lui aussi) ne doit pas hériter de l'environnement du launcher
  const child = spawn(exePath, ['--alien-token=' + token, '--papouth-token=' + token], { cwd: path.dirname(exePath), detached: true, stdio: 'ignore', windowsHide: false, env });
  launchTokens.set(slug, token);
  child.on('error', (e) => { running.delete(slug); launchTokens.delete(slug); syncPoll(); send('games:state', { slug, running: false, error: e.message }); });
  child.on('exit', () => { if (running.get(slug) === child) running.delete(slug); launchTokens.delete(slug); syncPoll(); send('games:state', { slug, running: false }); });
  child.unref();
  running.set(slug, child);
  syncPoll();
  send('games:state', { slug, running: true });
  return true;
});

// ---------- Réglages ----------
handle('settings:get', async () => ({ apiUrl: apiUrl(), defaultApiUrl: cfg.DEFAULT_STORE_API_URL, version: app.getVersion() }));
handle('settings:setApiUrl', async (url) => {
  const s = readSettings();
  const v = String(url || '').trim();
  if (v && !/^https?:\/\//i.test(v)) throw new ApiError('bad_api_url', "L'URL doit commencer par http:// ou https://");
  if (v) s.apiUrl = v; else delete s.apiUrl;
  fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2));
  return { apiUrl: apiUrl() };
});

// ---------- Mise à jour du launcher ----------
let autoUpdater = null;
function setupUpdater() {
  if (!app.isPackaged || demoMode) return;
  try {
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.autoDownload = true;
    autoUpdater.setFeedURL({ provider: 'github', owner: cfg.GITHUB.owner, repo: cfg.GITHUB.repo });
    autoUpdater.on('update-available', (i) => send('update:status', { state: 'available', version: i.version }));
    autoUpdater.on('download-progress', (p) => send('update:status', { state: 'downloading', percent: p.percent }));
    autoUpdater.on('update-downloaded', (i) => send('update:status', { state: 'ready', version: i.version }));
    autoUpdater.on('error', () => {});
    autoUpdater.checkForUpdates().catch(() => {});
  } catch (_) { /* module absent en dev */ }
}
handle('update:install', async () => { if (autoUpdater) autoUpdater.quitAndInstall(); return true; });

// ---------- Fenêtre ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1200, height: 760, minWidth: 1000, minHeight: 640,
    backgroundColor: '#0e0f13', title: 'Papouth Game Launcher', autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true
    }
  });
  Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.once('did-finish-load', setupUpdater);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(async () => { await installer.migrateLegacy(); createWindow(); });
  app.on('window-all-closed', () => app.quit());
}
