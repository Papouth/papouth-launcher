'use strict';
// Connexion temps réel au backend (Server-Sent Events, GET /events) depuis le process principal.
// fetch en flux (Electron/Node), sans dépendance. Reconnexion automatique avec attente croissante.

class Realtime {
  constructor({ getUrl, getToken, onEvent, onState }) {
    this.getUrl = getUrl; this.getToken = getToken; this.onEvent = onEvent; this.onState = onState || (() => {});
    this.ac = null; this.timer = null; this.running = false; this.attempt = 0; this.connected = false;
  }

  start() {
    if (this.running) return;
    this.running = true; this.attempt = 0;
    this._loop();
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer); this.timer = null;
    if (this.ac) { try { this.ac.abort(); } catch (_) { /* ignoré */ } this.ac = null; }
    this._set(false);
  }

  _set(v) { if (this.connected !== v) { this.connected = v; try { this.onState(v); } catch (_) { /* ignoré */ } } }

  async _loop() {
    while (this.running) {
      try { await this._connect(); } catch (_) { /* coupure : on retente */ }
      this._set(false);
      if (!this.running) return;
      // 1 s, 2 s, 4 s ... 30 s max, avec un peu d'aléa
      const wait = Math.min(30000, 1000 * 2 ** Math.min(this.attempt, 5)) + Math.floor(Math.random() * 500);
      this.attempt++;
      await new Promise((r) => { this.timer = setTimeout(r, wait); });
    }
  }

  async _connect() {
    const token = this.getToken();
    if (!token) throw new Error('no token');
    const ac = new AbortController();
    this.ac = ac;
    const res = await fetch(this.getUrl().replace(/\/+$/, '') + '/events', { headers: { Accept: 'text/event-stream', Authorization: 'Bearer ' + token }, signal: ac.signal });
    if (!res.ok || !res.body) throw new Error('http ' + res.status);
    this.attempt = 0; this._set(true);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let idle = null;
    const arm = () => { clearTimeout(idle); idle = setTimeout(() => ac.abort(), 70000); }; // le serveur envoie un battement toutes les 25 s
    arm();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        arm();
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = /^event: (.+)$/m.exec(block), d = /^data: (.*)$/m.exec(block);
          if (!ev) continue; // commentaire / battement
          let data = {};
          try { data = d ? JSON.parse(d[1]) : {}; } catch (_) { /* ignoré */ }
          try { this.onEvent(ev[1].trim(), data); } catch (_) { /* ignoré */ }
        }
      }
    } finally { clearTimeout(idle); }
  }
}

module.exports = { Realtime };
