'use strict';
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { Transform } = require('stream');
const { pipeline } = require('stream');
const { spawn } = require('child_process');
const extract = require('extract-zip');
const cfg = require('../config');
const { ApiError } = require('./api');

// Les jeux Electron contiennent des fichiers .asar : sans ça, le fs patché d'Electron les traite
// comme des dossiers et écrit/lit/supprime ces fichiers de travers ("Invalid package ... app.asar").
let asarDepth = 0;
async function noAsar(fn) {
  if (asarDepth++ === 0) process.noAsar = true;
  try { return await fn(); } finally { if (--asarDepth === 0) process.noAsar = false; }
}

async function readManifest() {
  try { return JSON.parse(await fsp.readFile(cfg.MANIFEST_FILE, 'utf8')); } catch (_) { return {}; }
}
// Migration unique : %LOCALAPPDATA%\AlienLive\Games -> %LOCALAPPDATA%\Papouth\Games (manifeste inclus).
async function migrateLegacy() {
  try {
    if (!fs.existsSync(cfg.LEGACY_GAMES_DIR) || fs.existsSync(cfg.GAMES_DIR)) return;
    await fsp.mkdir(path.dirname(cfg.GAMES_DIR), { recursive: true });
    try { await fsp.rename(cfg.LEGACY_GAMES_DIR, cfg.GAMES_DIR); }
    catch (_) { await fsp.cp(cfg.LEGACY_GAMES_DIR, cfg.GAMES_DIR, { recursive: true }); await fsp.rm(cfg.LEGACY_GAMES_DIR, { recursive: true, force: true }); }
    const m = await readManifest();
    for (const [slug, e] of Object.entries(m)) if (e && e.path) e.path = path.join(cfg.GAMES_DIR, slug);
    await writeManifest(m);
    try { await fsp.rmdir(path.dirname(cfg.LEGACY_GAMES_DIR)); } catch (_) { /* dossier non vide */ }
  } catch (_) { /* non bloquant */ }
}

async function writeManifest(m) {
  await fsp.mkdir(path.dirname(cfg.MANIFEST_FILE), { recursive: true });
  await fsp.writeFile(cfg.MANIFEST_FILE, JSON.stringify(m, null, 2));
}

// ---------- Résolution de l'exécutable ----------
const HELPER = /unins|uninstall|crash|UnityCrashHandler|vc_redist|dxsetup/i;
const EXCLUDE = new RegExp(HELPER.source + '|setup|install', 'i');
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const baseName = (p) => p.split('/').pop();
const depthOf = (p) => p.split('/').length;

// Liste récursive (profondeur <= maxDepth, asynchrone) des fichiers .exe : chemins relatifs avec "/".
async function listExes(dir, maxDepth = 4) {
  const out = [], others = [];
  async function walk(rel, depth) {
    let ents;
    try { ents = await fsp.readdir(path.join(dir, rel), { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { if (depth < maxDepth) await walk(r, depth + 1); }
      else if (/\.exe$/i.test(e.name)) out.push(r);
      else if (others.length < 30) others.push(r);
    }
  }
  await walk('', 1);
  return { exes: out, others };
}

// cfg = { exe, slug, name }. Retourne le chemin relatif ("sous/dossier/Jeu.exe") ou lève exe_not_found.
async function resolveExe(dir, want) {
  const { exes, others } = await listExes(dir);
  const sorted = [...exes].sort((a, b) => depthOf(a) - depthOf(b) || (a < b ? -1 : 1));
  if (want.exe) {
    const lw = String(want.exe).replace(/\\/g, '/').split('/').pop().toLowerCase();
    const hit = sorted.find((p) => baseName(p).toLowerCase() === lw);
    if (hit) return hit;
  }
  const ok = sorted.filter((p) => !EXCLUDE.test(baseName(p)));
  if (ok.length === 1) return ok[0];
  if (ok.length > 1) {
    const keys = [norm(want.name), norm(want.slug)].filter(Boolean);
    const sim = ok.find((p) => { const b = norm(baseName(p).replace(/\.exe$/i, '')); return b && keys.some((k) => k === b || k.includes(b) || b.includes(k)); });
    return sim || ok[0];
  }
  const found = [...sorted, ...others].slice(0, 15);
  throw new ApiError('exe_not_found', 'Aucun exécutable (.exe) trouvé après l\'installation. Contenu : ' + (found.join(', ') || 'dossier vide') + '.', 500, { found: found.join(', ') });
}

// ---------- Téléchargement ----------
// Flux réseau -> fichier .part (contre-pression via pipeline), SHA-256 incrémental, annulable (signal).
function downloadFile(url, dest, { onProgress, signal }, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) return reject(new ApiError('too_many_redirects', 'Trop de redirections.'));
    if (signal && signal.aborted) return reject(new ApiError('cancelled', 'Téléchargement annulé.'));
    const lib = url.startsWith('https:') ? https : http;
    let req;
    const onAbort = () => { if (req) req.destroy(new ApiError('cancelled', 'Téléchargement annulé.')); };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    const done = (fn, v) => { if (signal) signal.removeEventListener('abort', onAbort); fn(v); };
    req = lib.get(url, { headers: { 'User-Agent': 'PapouthGameLauncher', Accept: 'application/octet-stream' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        if (signal) signal.removeEventListener('abort', onAbort);
        return resolve(downloadFile(next, dest, { onProgress, signal }, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return done(reject, new ApiError('download_http', 'Téléchargement impossible (HTTP ' + res.statusCode + ').', res.statusCode));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let got = 0;
      const hash = crypto.createHash('sha256');
      const tap = new Transform({
        transform(chunk, _enc, cb) { got += chunk.length; hash.update(chunk); onProgress(got, total); cb(null, chunk); }
      });
      pipeline(res, tap, fs.createWriteStream(dest), (err) => {
        if (err) return done(reject, err.code === 'cancelled' || (signal && signal.aborted) ? new ApiError('cancelled', 'Téléchargement annulé.') : err instanceof ApiError ? err : new ApiError('download_network', 'Erreur pendant le téléchargement : ' + err.message));
        onProgress(got, total || got);
        done(resolve, hash.digest('hex'));
      });
    });
    req.on('error', (e) => done(reject, e instanceof ApiError ? e : new ApiError('download_network', 'Erreur réseau pendant le téléchargement : ' + e.message)));
    req.setTimeout(30000, () => req.destroy(new ApiError('download_timeout', 'Délai dépassé pendant le téléchargement.')));
  });
}

async function readHead(file, n) {
  const fh = await fsp.open(file, 'r');
  try { const b = Buffer.alloc(n); const { bytesRead } = await fh.read(b, 0, n, 0); return b.subarray(0, bytesRead); } finally { await fh.close(); }
}
// Signature de l'installeur : 'nsis' | 'inno' | 'unknown' (recherche de chaînes dans les premiers Mo).
async function installerFlavor(file) {
  const head = (await readHead(file, 4 * 1024 * 1024)).toString('latin1');
  if (/Nullsoft/.test(head)) return 'nsis';
  if (/Inno Setup/.test(head)) return 'inno';
  return 'unknown';
}

// Lance un exécutable et attend sa fin (timeout, annulation). Sous Windows, passe par cmd pour garder /D=… sans guillemets.
function runAndWait(exe, switches, { cwd, timeoutMs, signal }) {
  return new Promise((resolve, reject) => {
    const win = process.platform === 'win32';
    const child = win
      ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', '"' + '"' + exe + '" ' + switches.join(' ') + '"'], { cwd, windowsHide: true, windowsVerbatimArguments: true, stdio: 'ignore' })
      : spawn(exe, switches, { cwd, stdio: 'ignore' });
    let finished = false;
    const kill = () => { try { if (win) spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); else child.kill('SIGKILL'); } catch (_) { /* déjà terminé */ } };
    const end = (fn, v) => { if (finished) return; finished = true; clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); fn(v); };
    const timer = setTimeout(() => { kill(); end(reject, new ApiError('installer_timeout', 'L\'installation a pris trop de temps (10 minutes).')); }, timeoutMs);
    const onAbort = () => { kill(); end(reject, new ApiError('cancelled', 'Installation annulée.')); };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    child.on('error', (e) => end(reject, new ApiError('installer_failed', 'Impossible de lancer l\'installeur : ' + e.message)));
    child.on('exit', (code) => end(resolve, code));
  });
}

const fileKind = async (f) => { const h = await readHead(f, 4); return h[0] === 0x50 && h[1] === 0x4b ? 'zip' : h[0] === 0x4d && h[1] === 0x5a ? 'exe' : 'other'; };

// Dossiers d'installation usuels pour un installeur inconnu (NSIS/Inno non reconnu).
async function findInProgramDirs(want) {
  const roots = [path.join(process.env.LOCALAPPDATA || '', 'Programs'), process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean);
  const keys = [norm(want.name), norm(want.slug), norm(String(want.exe || '').replace(/\.exe$/i, ''))].filter(Boolean);
  for (const r of roots) {
    let ents; try { ents = await fsp.readdir(r, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of ents) {
      if (!e.isDirectory()) continue;
      const n = norm(e.name);
      if (n && keys.some((k) => k === n || k.includes(n) || n.includes(k))) {
        try { const rel = await resolveExe(path.join(r, e.name), want); return { dir: path.join(r, e.name), exe: rel }; } catch (_) { /* suivant */ }
      }
    }
  }
  return null;
}

// info = { url, version, sha256?, exe, kind?, name? }. ctl = { signal, onProgress(bytes,total), onStage(stage) }
async function install(slug, info, ctl) {
  const { signal, onProgress, onStage } = ctl;
  const dir = path.join(cfg.GAMES_DIR, slug);
  const part = path.join(cfg.GAMES_DIR, '.tmp-' + slug + '.part');
  const stage = path.join(cfg.GAMES_DIR, '.tmp-' + slug + '-pkg');
  const want = { exe: info.exe, slug, name: info.name };
  await fsp.mkdir(cfg.GAMES_DIR, { recursive: true });
  try {
    onStage('download');
    const digest = await downloadFile(info.url, part, { onProgress, signal });
    if (info.sha256 && digest.toLowerCase() !== String(info.sha256).toLowerCase()) {
      throw new ApiError('checksum', 'Le fichier téléchargé est corrompu (somme de contrôle invalide). Réessayez.');
    }
    const kind = await fileKind(part);
    const isInstaller = info.kind === 'installer';
    onStage('extract');
    let installerExe = null;
    if (kind === 'zip') {
      const target = isInstaller ? stage : dir;
      await fsp.rm(target, { recursive: true, force: true });
      await fsp.mkdir(target, { recursive: true });
      await extract(part, { dir: target }); // asynchrone, hors du fil principal de l'UI
      if (isInstaller) {
        const { exes } = await listExes(stage);
        const cand = exes.filter((p) => !HELPER.test(baseName(p))).sort((a, b) => depthOf(a) - depthOf(b));
        if (!cand.length) throw new ApiError('exe_not_found', 'Aucun installeur (.exe) trouvé dans l\'archive.', 500);
        installerExe = path.join(stage, cand.find((p) => /setup|install/i.test(baseName(p))) || cand[0]);
      } else {
        // Zip dont tout le contenu est dans un unique dossier racine : on remonte son contenu.
        const entries = await fsp.readdir(dir);
        if (entries.length === 1 && (await fsp.stat(path.join(dir, entries[0]))).isDirectory()) {
          const inner = path.join(dir, entries[0]);
          for (const f of await fsp.readdir(inner)) await fsp.rename(path.join(inner, f), path.join(dir, f));
          await fsp.rmdir(inner);
        }
      }
    } else if (kind === 'exe' && isInstaller) {
      installerExe = part + '.exe';
      await fsp.rename(part, installerExe);
    } else {
      throw new ApiError('bad_package', 'Le fichier téléchargé n\'est pas valide (ni .zip ni installeur).');
    }

    let root = dir, silent = 'none';
    if (installerExe) {
      onStage('install');
      await fsp.mkdir(dir, { recursive: true });
      const flavor = await installerFlavor(installerExe);
      silent = flavor;
      const opts = { cwd: path.dirname(installerExe), timeoutMs: 10 * 60 * 1000, signal };
      if (flavor === 'nsis') await runAndWait(installerExe, ['/S', '/D=' + dir], opts);
      else if (flavor === 'inno') await runAndWait(installerExe, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/DIR="' + dir + '"'], opts);
      else await runAndWait(installerExe, [], { ...opts, timeoutMs: 30 * 60 * 1000 });
    }
    let rel;
    try { rel = await resolveExe(root, want); }
    catch (e) {
      const alt = installerExe && silent === 'unknown' ? await findInProgramDirs(want) : null;
      if (!alt) throw e;
      root = alt.dir; rel = alt.exe;
    }
    const m = await readManifest();
    m[slug] = { version: info.version, exe: rel, path: root, ...(installerExe ? { kind: 'installer', silent } : {}) };
    await writeManifest(m);
    return m[slug];
  } finally {
    fsp.rm(part, { force: true }).catch(() => {});
    fsp.rm(part + '.exe', { force: true }).catch(() => {});
    fsp.rm(stage, { recursive: true, force: true }).catch(() => {});
  }
}

async function uninstall(slug) {
  const m = await readManifest();
  const e = m[slug];
  const dir = (e && e.path) || path.join(cfg.GAMES_DIR, slug);
  if (e && e.kind === 'installer') {
    try {
      const ents = await fsp.readdir(dir);
      const un = ents.find((f) => /^(uninstall|unins\d*).*\.exe$/i.test(f));
      if (un) {
        const exe = path.join(dir, un);
        const opts = { cwd: dir, timeoutMs: 5 * 60 * 1000 };
        if (e.silent === 'inno') await runAndWait(exe, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], opts);
        else await runAndWait(exe, ['/S', '_?=' + dir], opts);
      }
    } catch (_) { /* on supprime le dossier quoi qu'il arrive */ }
  }
  const inside = path.resolve(dir).toLowerCase().startsWith(path.resolve(cfg.GAMES_DIR).toLowerCase() + path.sep);
  if (inside) await fsp.rm(dir, { recursive: true, force: true });
  delete m[slug];
  await writeManifest(m);
}

const _install = install, _uninstall = uninstall, _resolveExe = resolveExe, _migrate = migrateLegacy;
module.exports = {
  migrateLegacy: () => noAsar(_migrate), readManifest, writeManifest,
  install: (...a) => noAsar(() => _install(...a)), uninstall: (...a) => noAsar(() => _uninstall(...a)),
  resolveExe: (...a) => noAsar(() => _resolveExe(...a)), installerFlavor
};
