'use strict';
// Client HTTP du backend boutique (contrat : CONTRACT.md). Appelé uniquement depuis le process principal.

const fs = require('fs');

class ApiError extends Error {
  constructor(code, message, status, extra) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

class StoreApi {
  constructor(getBaseUrl) {
    this.getBaseUrl = getBaseUrl;
    this.token = null;
  }

  setToken(t) { this.token = t || null; }

  async request(method, route, body, { auth = true, lang } = {}) {
    const url = this.getBaseUrl().replace(/\/+$/, '') + route;
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (lang) headers['Accept-Language'] = lang;
    if (auth && this.token) headers.Authorization = 'Bearer ' + this.token;
    let res;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20000)
      });
    } catch (e) {
      throw new ApiError('network', 'Impossible de joindre le serveur. Vérifiez votre connexion.', 0);
    }
    let data = null;
    try { data = await res.json(); } catch (_) { /* corps vide */ }
    if (!res.ok) {
      const code = (data && data.error) || 'http_' + res.status;
      const message = (data && data.message) || 'Erreur serveur (' + res.status + ').';
      const extra = data && (data.canTransfer !== undefined || data.nextTransferAt !== undefined) ? { canTransfer: data.canTransfer, nextTransferAt: data.nextTransferAt || null } : undefined;
      throw new ApiError(code, message, res.status, extra);
    }
    return data;
  }

  // Envoi d'un fichier local en corps brut (flux disque -> réseau, jamais chargé en mémoire). onProgress(0..1).
  upload(route, filePath, contentType, onProgress) {
    const url = new URL(this.getBaseUrl().replace(/\/+$/, '') + route);
    const lib = url.protocol === 'https:' ? require('https') : require('http');
    const size = fs.statSync(filePath).size;
    const token = this.token;
    return new Promise((resolve, reject) => {
      const net = () => reject(new ApiError('network', 'Impossible de joindre le serveur. Vérifiez votre connexion.', 0));
      const req = lib.request(url, { method: 'POST', headers: { 'Content-Type': contentType, 'Content-Length': size, Accept: 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) } }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let data = null;
          try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) { /* corps vide */ }
          if (res.statusCode >= 200 && res.statusCode < 300) return resolve(data);
          reject(new ApiError((data && data.error) || 'http_' + res.statusCode, (data && data.message) || 'Erreur serveur (' + res.statusCode + ').', res.statusCode));
        });
      });
      req.on('error', net);
      const rs = fs.createReadStream(filePath);
      let sent = 0;
      rs.on('data', (c) => { sent += c.length; if (onProgress) onProgress(size ? sent / size : 1); });
      rs.on('error', () => req.destroy());
      rs.pipe(req);
    });
  }

  register(email, password, tiktok) {
    return this.request('POST', '/auth/register', { email, password, tiktok: String(tiktok || '').replace(/^@/, '').toLowerCase() }, { auth: false });
  }
  login(email, password) { return this.request('POST', '/auth/login', { email, password }, { auth: false }); }
  me() { return this.request('GET', '/me'); }
  games(lang) { return this.request('GET', '/games' + (lang ? '?lang=' + encodeURIComponent(lang) : ''), undefined, { auth: false, lang }); }
  entitlements() { return this.request('GET', '/entitlements'); }
  checkout(provider, product, slug, lang) {
    const body = { provider, product };
    if (slug) body.slug = slug;
    if (lang) body.lang = lang;
    return this.request('POST', '/checkout', body);
  }
  billingPortal(lang) { return this.request('POST', '/billing/portal', lang ? { lang } : {}); }
  cancelSubscription() { return this.request('POST', '/billing/cancel', {}); }
  resumeSubscription() { return this.request('POST', '/billing/resume', {}); }
  registerDevice(hwid, name) { return this.request('POST', '/devices/register', { hwid, name }); }
  devices() { return this.request('GET', '/devices'); }
  transferDevice(hwid, name) { return this.request('POST', '/devices/transfer', { hwid, name }); }
  download(slug, hwid) { return this.request('GET', '/download/' + encodeURIComponent(slug) + '?hwid=' + encodeURIComponent(hwid)); }
  heartbeat(token) { return this.request('POST', '/license/heartbeat', { token }, { auth: false }); }
  launchToken(slug, hwid) { return this.request('POST', '/launch-token', { slug, hwid }); }
}

module.exports = { StoreApi, ApiError };
