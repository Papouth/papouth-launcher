'use strict';
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const extract = require('extract-zip');
const cfg = require('../config');
const { ApiError } = require('./api');

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

// Télécharge url -> dest en suivant les redirections (assets GitHub), progression via onProgress(pct|null).
function downloadFile(url, dest, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) return reject(new ApiError('too_many_redirects', 'Trop de redirections.'));
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'PapouthGameLauncher', Accept: 'application/octet-stream' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return resolve(downloadFile(next, dest, onProgress, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new ApiError('download_http', 'Téléchargement impossible (HTTP ' + res.statusCode + ').', res.statusCode));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let got = 0;
      let last = 0;
      const hash = crypto.createHash('sha256');
      const out = fs.createWriteStream(dest);
      res.on('data', (chunk) => {
        got += chunk.length;
        hash.update(chunk);
        const now = Date.now();
        if (now - last > 120) { last = now; onProgress(total ? got / total : null); }
      });
      res.pipe(out);
      out.on('finish', () => out.close(() => { onProgress(total ? 1 : null); resolve(hash.digest('hex')); }));
      out.on('error', reject);
      res.on('error', reject);
    });
    req.on('error', (e) => reject(new ApiError('download_network', 'Erreur réseau pendant le téléchargement : ' + e.message)));
    req.setTimeout(30000, () => req.destroy(new ApiError('download_timeout', 'Délai dépassé pendant le téléchargement.')));
  });
}

// info = { url, version, sha256?, exe }. emit(stage, pct)
async function install(slug, info, emit) {
  const dir = path.join(cfg.GAMES_DIR, slug);
  const tmp = path.join(cfg.GAMES_DIR, '.tmp-' + slug + '.zip');
  await fsp.mkdir(cfg.GAMES_DIR, { recursive: true });
  try {
    emit('download', 0);
    const digest = await downloadFile(info.url, tmp, (p) => emit('download', p));
    if (info.sha256 && digest.toLowerCase() !== String(info.sha256).toLowerCase()) {
      throw new ApiError('checksum', 'Le fichier téléchargé est corrompu (somme de contrôle invalide). Réessayez.');
    }
    emit('extract', null);
    await fsp.rm(dir, { recursive: true, force: true });
    await fsp.mkdir(dir, { recursive: true });
    await extract(tmp, { dir });
    // Si le zip contient un unique dossier racine, on remonte son contenu.
    const entries = await fsp.readdir(dir);
    if (entries.length === 1 && (await fsp.stat(path.join(dir, entries[0]))).isDirectory()) {
      const inner = path.join(dir, entries[0]);
      for (const f of await fsp.readdir(inner)) await fsp.rename(path.join(inner, f), path.join(dir, f));
      await fsp.rmdir(inner);
    }
    const exe = info.exe || (await fsp.readdir(dir)).find((f) => f.toLowerCase().endsWith('.exe'));
    if (!exe || !fs.existsSync(path.join(dir, exe))) throw new ApiError('exe_not_found', 'Exécutable du jeu introuvable après extraction (' + (exe || '?') + ').');
    const m = await readManifest();
    m[slug] = { version: info.version, exe, path: dir };
    await writeManifest(m);
    return m[slug];
  } finally {
    fsp.rm(tmp, { force: true }).catch(() => {});
  }
}

async function uninstall(slug) {
  const m = await readManifest();
  await fsp.rm(path.join(cfg.GAMES_DIR, slug), { recursive: true, force: true });
  delete m[slug];
  await writeManifest(m);
}

module.exports = { migrateLegacy, readManifest, writeManifest, install, uninstall };
