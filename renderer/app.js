'use strict';
// Thème appliqué avant le premier rendu (défaut : nuit). Pas de script inline : CSP stricte.
const THEME_KEY = 'papouth-theme';
function getTheme() {
  try { const v = localStorage.getItem(THEME_KEY); if (v === 'day' || v === 'night') return v; } catch (e) { /* ignore */ }
  return 'night';
}
function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); }
(() => {
  const qt = new URLSearchParams(location.search).get('theme');
  applyTheme(qt === 'day' || qt === 'night' ? qt : getTheme());
})();
(() => {
  const A = window.alien;
  const { t } = window.I18N;
  const $app = document.getElementById('app');
  const S = {
    dev: false, devOpen: false, boot: false, user: null, demo: false, demoAvailable: false, reachable: true, apiUrl: '',
    tab: new URLSearchParams(location.search).get('view') || 'store', sale: null, mi: 0,
    games: [], ent: { pass: { active: false }, owned: [], access: [] }, obtained: [], filter: 'games', offer: null, prog: null,
    installed: {}, planSel: 'pass_monthly', running: new Set(), progress: {}, busy: new Set(), update: null, version: ''
  };
  if (S.tab === 'game') { S.sale = new URLSearchParams(location.search).get('slug'); S.tab = 'store'; }
  if (!['store', 'library', 'account', 'admin'].includes(S.tab)) S.tab = 'store';
  const isAdminUser = () => !!(S.user && S.user.role === 'admin');

  // ---------- utilitaires ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v; // CSSOM : autorisé par la CSP, contrairement à l'attribut style
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'disabled' || k === 'value') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  }
  const unwrap = (r) => { if (r && r.ok) return r.data; const e = new Error((r && r.error && r.error.message) || t('err.generic')); e.code = r && r.error && r.error.code; e.extra = r && r.error && r.error.extra; throw e; };
  const call = async (p) => unwrap(await p);
  function toast(msg, type) {
    const t = h('div', { class: 'toast ' + (type || '') }, msg);
    document.getElementById('toasts').append(t);
    setTimeout(() => t.remove(), type === 'error' ? 7000 : 4500);
  }
  const fmtDate = (d) => window.I18N.date(d);
  const money = (n) => window.I18N.price(n);
  // Message d'erreur traduit d'après le code (API ou main) ; repli : message brut.
  function errText(e) {
    const code = e && e.code;
    if (code && window.I18N.has('err.' + code)) return t('err.' + code);
    if (code && /^http_/.test(code)) return t('err.server');
    return (e && e.message) || t('err.generic');
  }
  async function setLang(code) {
    window.I18N.setLang(code);
    render();
    if (S.user) { try { S.games = unwrap(await A.catalog(window.I18N.lang())).games || []; } catch (e) { toast(errText(e), 'error'); } render(); }
  }
  function langSelect(cls, onChange) {
    const cur = window.I18N.lang();
    const sel = h('select', { class: 'langsel ' + (cls || ''), 'aria-label': t('lang.label'), onchange: (ev) => (onChange || setLang)(ev.target.value) },
      window.I18N.langs.map((l) => h('option', { value: l.code, lang: l.code, selected: l.code === cur }, l.name)));
    sel.value = cur;
    return sel;
  }
  function cmpVer(a, b) {
    const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0), pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
    return 0;
  }
  function setTheme(t) {
    applyTheme(t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* ignore */ }
    render();
  }
  const curTheme = () => document.documentElement.getAttribute('data-theme') === 'day' ? 'day' : 'night';
  const SVGNS = 'http://www.w3.org/2000/svg';
  function themeIcon(t) {
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', t === 'day'
      ? 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'
      : 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z');
    s.append(p); return s;
  }
  const hasAccess = (g) => S.ent.access.includes(g.slug);
  const isOwned = (g) => S.ent.owned.includes(g.slug);
  const isFree = (g) => !!g.free;
  const isSoftware = (g) => g.kind === 'software';
  const isTool = (g) => isSoftware(g) || isFree(g); // « Outils gratuits » : logiciels et éléments gratuits
  const FORGE = 'overlay-forge';
  const ACC_KEYS = { 'paintball-master': 'pink', 'pop-riot': 'yellow', 'boys-girls-ultimate': 'blue' };
  // Image d'un élément : couverture, sinon 1re capture image, sinon vignette vidéo (jamais une initiale s'il existe une image)
  function posterOf(g) {
    const m = g.media || [], shot = m.find((x) => x.type === 'image'), vid = m.find((x) => x.type === 'video' && x.thumb);
    return g.image || (shot && shot.url) || (vid && vid.thumb) || '';
  }
  // Couleur d'accent du jeu + couleur de texte à contraste AA dessus (--on-ac)
  function accStyle(g) {
    const key = ACC_KEYS[g.slug], night = document.documentElement.getAttribute('data-theme') !== 'day';
    let hex = /^#[0-9a-f]{3,8}$/i.test(g.accent) ? g.accent : '#7A3CFF';
    if (key) { try { const v = getComputedStyle(document.documentElement).getPropertyValue('--' + key).trim(); if (/^#[0-9a-f]{6}$/i.test(v)) hex = v; } catch (e) { /* ignore */ } }
    let c = hex.replace('#', ''); if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    let rgb = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) || 0);
    if (!key && night) rgb = rgb.map((v, i) => Math.round(v * 0.82 + [0x15, 0x15, 0x1B][i] * 0.18));
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
    const onDark = (L + 0.05) / 0.0575, onWhite = 1.05 / (L + 0.05);
    if (isTool(g)) return '--ac-raw:#3A3A4A;--ac:var(--surface-2);--on-ac:var(--text)';
    return '--ac-raw:' + hex + ';--on-ac:' + (onDark >= onWhite ? '#151515' : '#ffffff');
  }
  const inLibrary = (g) => hasAccess(g) && (!isFree(g) || !!S.installed[g.slug] || S.obtained.includes(g.slug));
  const passActive = () => !!(S.ent.pass && S.ent.pass.active);
  const planLabel = (p) => (p === 'yearly' ? t('plan.yearly') : p === 'monthly' ? t('plan.monthly') : '—');

  async function refreshAll() {
    const [cat, ent, inst, run, lib] = await Promise.all([A.catalog(window.I18N.lang()), A.entitlements(), A.installed(), A.running(), A.library ? A.library() : Promise.resolve({ ok: true, data: { obtained: [] } })]);
    try { S.games = unwrap(cat).games || []; } catch (e) { toast(errText(e), 'error'); }
    try { S.ent = unwrap(ent); } catch (e) { if (e.code === 'network') toast(errText(e), 'error'); }
    try { S.installed = unwrap(inst) || {}; } catch (_) {}
    try { S.obtained = (unwrap(lib) || {}).obtained || []; } catch (_) { /* bibliothèque : facultatif */ }
    seedProg();
    loadOffer();
    loadDevice();
    try { S.running = new Set(unwrap(run)); } catch (_) {}
    render();
  }

  // ---------- icônes ----------
  const svg = (d) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.append(p); return s; };
  const ICONS = { store: 'M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6', library: 'M4 4h4v16H4zM10 4h4v16h-4zM16.5 5l3.5-1 3 15-3.5 1z', account: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6' };

  // ---------- rendu ----------
  function render() {
    $app.replaceChildren(!S.user ? authView() : shell());
  }

  function shell() {
    const nav = (id, label) => h('button', { class: S.tab === id ? 'on' : '', onclick: () => { if (S.admin && !S.admin.canLeave()) return; if (S.admin) S.admin.leave(); S.tab = id; S.sale = null; render(); } }, svg(ICONS[id]), label);
    const adm = adminApi();
    const p = S.ent.pass;
    return h('div', { class: 'shell' },
      h('aside', { class: 'side' },
        h('div', { class: 'logo brand' }, h('i'), h('span', { class: 'bname' }, h('b', {}, 'Papouth'), h('small', {}, t('brand.sub')))),
        h('nav', { class: 'nav' }, nav('store', t('nav.store')), nav('library', t('nav.library')), nav('account', t('nav.account')),
          adm ? [h('div', { class: 'navsec' }, t('adm.section')), ...adm.nav().map((n) => h('button', { class: n.on ? 'on' : '', 'data-admin-tab': n.id, onclick: n.go }, n.icon, n.label))] : null),
        h('div', { class: 'foot' }, 'v' + (S.version || '1.0.0') + (S.demo ? t('foot.demo') : ''))),
      h('header', { class: 'top' },
        dlBar(),
        h('button', { class: 'themebtn', id: 'theme-toggle', type: 'button', title: curTheme() === 'night' ? t('theme.toDay') : t('theme.toNight'), 'aria-label': curTheme() === 'night' ? t('theme.toDay') : t('theme.toNight'), onclick: () => setTheme(curTheme() === 'night' ? 'day' : 'night') }, themeIcon(curTheme() === 'night' ? 'day' : 'night')),
        adm ? h('span', { class: 'badge adminbadge' + (S.tab === 'admin' ? ' on' : ''), id: 'admin-badge' }, t('adm.badge')) : null,
        S.demo ? h('span', { class: 'badge demo' }, t('badge.demo')) : null,
        S.update ? updateBadge() : null,
        h('span', { class: 'who' }, t('top.who') + ' ', h('b', {}, '@' + (S.user.tiktok || '?'))),
        h('span', { class: 'badge ' + (passActive() ? 'pass' : '') }, passActive() ? t('pass.badge', { plan: planLabel(p.plan) }) : t('pass.none'))),
      h('main', { class: 'main' }, S.tab === 'admin' && adm ? adm.view() : S.sale && S.games.some((g) => g.slug === S.sale) ? saleView(S.games.find((g) => g.slug === S.sale)) : S.tab === 'store' ? storeView() : S.tab === 'library' ? libraryView() : accountView()));
  }

  // Mode administrateur : module chargé par admin.js, actif seulement pour un compte au rôle « admin »
  function adminApi() {
    if (!isAdminUser() || !window.PapouthAdmin || !A.admin) return null;
    if (!S.admin) {
      S.admin = window.PapouthAdmin.create({ A, h, t, svg, S, render, call, toast, errText, money, fmtDate, saleView });
    }
    return S.admin;
  }

  function updateBadge() {
    const u = S.update;
    if (u.state === 'ready') return h('button', { class: 'btn sm primary', onclick: () => A.restartToUpdate() }, t('update.restart', { version: u.version }));
    return h('span', { class: 'badge' }, u.state === 'downloading' ? t('update.downloading', { percent: Math.round(u.percent || 0) }) : t('update.available'));
  }

  // ----- Auth -----
  function authView() {
    let mode = 'login', err = null;
    const vals = {};
    const box = h('div', { class: 'authbox' });
    const draw = () => {
      const f = {};
      const field = (key, label, type, ph) => h('label', {}, label, f[key] = h('input', { type, value: vals[key] || '', placeholder: ph || '', oninput: (ev) => { vals[key] = ev.target.value; }, autocomplete: key === 'password' ? (mode === 'login' ? 'current-password' : 'new-password') : 'on' }));
      const submit = async (ev) => {
        ev.preventDefault();
        const btn = ev.target.querySelector('button[type=submit]'); btn.disabled = true;
        try {
          const email = f.email.value.trim(), pw = f.password.value;
          const r = mode === 'login' ? await call(A.login(email, pw)) : await call(A.register(email, pw, f.tiktok.value.trim().replace(/^@/, '')));
          S.user = r.user; S.demo = false; await refreshAll();
        } catch (e) { err = e; draw(); }
      };
      box.replaceChildren(
        h('div', { class: 'logo brand', style: 'padding:0' }, h('i'), h('span', { class: 'bname' }, h('b', {}, 'Papouth'), h('small', {}, t('brand.sub')))),
        h('div', { class: 'tabs' },
          h('button', { class: mode === 'login' ? 'on' : '', onclick: () => { mode = 'login'; err = null; draw(); } }, t('auth.login')),
          h('button', { class: mode === 'register' ? 'on' : '', onclick: () => { mode = 'register'; err = null; draw(); } }, t('auth.register'))),
        h('form', { onsubmit: submit },
          field('email', t('auth.email'), 'email', t('auth.emailPh')),
          field('password', t('auth.password'), 'password', mode === 'register' ? t('auth.passwordPh') : ''),
          mode === 'register' ? field('tiktok', t('auth.tiktok'), 'text', t('auth.tiktokPh')) : null,
          h('div', { class: 'err' }, err ? errText(err) : ''),
          h('button', { class: 'btn primary', type: 'submit' }, mode === 'login' ? t('auth.submitLogin') : t('auth.submitRegister')),
          mode === 'login' ? h('button', { class: 'linkbtn', type: 'button', id: 'forgot-pw', onclick: () => { call(A.forgotPassword()).catch((e) => toast(errText(e), 'error')); } }, t('auth.forgot')) : null,
          S.demoAvailable ? h('button', { class: 'btn ghost', type: 'button', onclick: startDemo }, t('auth.demo')) : null,
          !S.reachable ? h('div', { class: 'err' }, t('auth.unreachable')) : null));
    };
    const authLang = h('div', { class: 'auth-lang' });
    const onLang = (c) => { window.I18N.setLang(c); authLang.replaceChildren(langSelect('', onLang)); draw(); };
    authLang.append(langSelect('', onLang));
    draw();
    return h('div', { class: 'auth' }, authLang, box);
  }
  async function startDemo() { try { const r = await call(A.startDemo()); S.user = r.user; S.demo = true; await refreshAll(); } catch (e) { toast(errText(e), 'error'); } }

  // ----- Cartes de jeux -----
  const tagOf = (g) => (isFree(g) ? t('tag.free') : isOwned(g) ? t('tag.owned') : t('tag.inPass'));
  function gameCard(g, ctx) {
    const state = gameState(g);
    const actions = actionsFor(g, ctx);
    const inst = S.installed[g.slug];
    const pic = posterOf(g);
    const bg = pic ? 'url("' + pic.replace(/["\\()]/g, '') + '")' : 'none';
    const accKey = ACC_KEYS[g.slug];
    return h('article', { class: 'game clickable', tabindex: '0', role: 'link', 'aria-label': t('card.view', { name: g.name }), onclick: (ev) => { if (!ev.target.closest('button,a,input')) openSale(g.slug); }, onkeydown: (ev) => { if (ev.key === 'Enter' && ev.target === ev.currentTarget) openSale(g.slug); }, 'data-accent': accKey, style: accStyle(g), 'data-free': isFree(g) ? '1' : null },
      h('div', { class: 'cover', style: 'background-image:' + bg },
        pic ? null : h('span', { class: 'cname' }, g.name),
        isSoftware(g) ? h('span', { class: 'kind badge' }, t('tag.software')) : null,
        h('span', { class: 'tag badge' + (isFree(g) ? ' free' : '') }, tagOf(g))),
      h('div', { class: 'body' },
        h('div', { class: 'nm' }, g.name), h('div', { class: 'tg' }, g.tagline),
        h('div', { class: 'meta' }, 'v' + g.version + (g.sizeMb ? ' · ' + t('card.size', { size: window.I18N.num(g.sizeMb) }) : '') + (inst ? ' · ' + t('card.installed', { version: inst.version }) : '')),
        inst && isSoftware(g) && getProg().shortcut.includes(g.slug) ? h('div', { class: 'meta ok-short' }, t('card.shortcut')) : null,
        actions));
  }
  // ----- Progression des téléchargements (mise à jour ciblée du DOM, sans re-rendu complet) -----
  const fmtSpeed = (b) => (b ? t('dl.mbps', { n: (b / 1048576).toLocaleString(window.I18N.lang(), { maximumFractionDigits: 1 }) }) : '');
  const fmtEta = (s) => (s == null ? '' : t('dl.left', { time: Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }));
  const progLabel = (p) => (p.stage === 'extract' || p.stage === 'install' ? t('prog.extract') : p.stage === 'prepare' ? t('prog.prepare') : t('prog.download'));
  const progPct = (p) => (p.stage === 'download' && p.pct != null ? Math.round(p.pct * 100) + '%' : '');
  const progMeta = (p) => (p.stage === 'download' ? [fmtSpeed(p.speed), fmtEta(p.eta)].filter(Boolean).join(' · ') : '');
  const gameName = (slug) => { const g = S.games.find((x) => x.slug === slug); return g ? g.name : slug; };
  function progBlock(g, p) {
    return h('div', { class: 'dlprog', 'data-prog': g.slug, 'data-stage': p.stage },
      h('div', { class: 'plabel' }, h('span', { class: 'pl-label' }, progLabel(p)), h('span', { class: 'pl-pct' }, progPct(p))),
      h('div', { class: 'progress' + (p.pct == null || p.stage !== 'download' ? ' ind' : '') }, h('i', { class: 'pb-fill', style: p.pct != null && p.stage === 'download' ? 'width:' + Math.round(p.pct * 100) + '%' : '' })),
      h('div', { class: 'prow' }, h('span', { class: 'pl-meta' }, progMeta(p)),
        p.stage === 'extract' || p.stage === 'install' ? null : h('button', { class: 'btn ghost sm', type: 'button', onclick: () => cancelInstall(g.slug) }, t('dl.cancel'))));
  }
  function dlBar() {
    const list = Object.entries(S.progress);
    if (!list.length) return null;
    return h('div', { class: 'dlbar', role: 'status', 'aria-label': t('dl.title') }, list.map(([slug, p]) =>
      h('div', { class: 'dlchip', 'data-dl': slug, 'data-stage': p.stage },
        h('span', { class: 'dn' }, gameName(slug)),
        h('span', { class: 'pl-label' }, progLabel(p)), h('span', { class: 'pl-pct' }, progPct(p)), h('span', { class: 'pl-meta' }, progMeta(p)),
        h('div', { class: 'progress mini' + (p.pct == null || p.stage !== 'download' ? ' ind' : '') }, h('i', { class: 'pb-fill', style: p.pct != null && p.stage === 'download' ? 'width:' + Math.round(p.pct * 100) + '%' : '' })),
        p.stage === 'extract' || p.stage === 'install' ? null : h('button', { class: 'btn ghost sm', type: 'button', title: t('dl.cancel'), 'aria-label': t('dl.cancel'), onclick: () => cancelInstall(slug) }, '×'))));
  }
  function patchProgress(slug) {
    const p = S.progress[slug]; if (!p) return;
    const els = document.querySelectorAll('[data-prog="' + slug + '"],[data-dl="' + slug + '"]');
    for (const el of els) {
      if (el.dataset.stage !== p.stage) { render(); return; }
      const set = (sel, v) => { const n = el.querySelector(sel); if (n && n.textContent !== v) n.textContent = v; };
      set('.pl-label', progLabel(p)); set('.pl-pct', progPct(p)); set('.pl-meta', progMeta(p));
      const f = el.querySelector('.pb-fill'); if (f && p.pct != null) f.style.width = Math.round(p.pct * 100) + '%';
    }
  }
  function cancelInstall(slug) { call(A.cancelInstall(slug)).catch((e) => toast(errText(e), 'error')); }
  function actionsFor(g, ctx, trial) {
    const state = gameState(g);
    const prog = S.progress[g.slug];
    const actions = h('div', { class: 'actions' });
    if (prog) {
      actions.append(progBlock(g, prog));
    } else if (state === 'locked') {
      actions.append(
        h('button', { class: 'btn primary', 'data-buy': g.slug, onclick: () => payModal({ product: 'game', slug: g.slug, title: g.name, price: money(g.price || 40) }) }, t('buy.game', { price: money(g.price || 40) })),
        h('button', { class: 'link', 'data-pass-link': '1', onclick: () => { toPass(); } }, t('buy.orPass', { price: money(PASS_MONTH) })));
    } else if (state === 'install' && g.available === false) actions.append(h('button', { class: 'btn', disabled: true }, t('act.soon')));
    else if (state === 'install' && isFree(g) && !S.obtained.includes(g.slug)) actions.append(h('button', { class: 'btn primary free', 'data-obtain': g.slug, onclick: () => obtain(g) }, t('act.install')));
    else if (state === 'install') actions.append(h('button', { class: 'btn primary' + (isFree(g) ? ' free' : ''), onclick: () => install(g) }, isFree(g) ? t('act.install') : t('act.download')));
    else if (state === 'update') actions.append(h('button', { class: 'btn primary', onclick: () => install(g) }, t('act.update')), h('button', { class: 'btn ghost sm', onclick: () => play(g) }, t('act.playAnyway')));
    else if (state === 'running') actions.append(h('button', { class: 'btn', disabled: true }, t('act.playing')));
    else actions.append(h('button', { class: 'btn play', onclick: () => play(g) }, isSoftware(g) ? t('act.launch') : t('act.play')));

    if (ctx === 'library' && S.installed[g.slug] && !prog) {
      actions.append(h('div', { class: 'row' },
        h('button', { class: 'btn ghost sm', onclick: () => call(A.openFolder(g.slug)).catch((e) => toast(errText(e), 'error')) }, t('act.openFolder')),
        h('button', { class: 'btn ghost sm danger', disabled: S.running.has(g.slug), onclick: () => uninstall(g) }, t('act.uninstall'))));
    }
    return actions;
  }
  function toPass() { S.sale = null; S.tab = 'store'; render(); document.getElementById('gamepass')?.scrollIntoView({ behavior: 'smooth' }); }
  function gameState(g) {
    if (!hasAccess(g)) return 'locked';
    if (S.running.has(g.slug)) return 'running';
    const inst = S.installed[g.slug];
    if (!inst) return 'install';
    return cmpVer(inst.version, g.version) < 0 ? 'update' : 'play';
  }

  // ----- Jeu à la une : grande bannière au-dessus du bloc Game Pass -----
  const reducedMotion = () => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };
  function featuredBanner() {
    const g = S.games.find((x) => x.featured);
    if (!g) return null;
    const media = g.media || [];
    const shot = media.find((m) => m.type === 'image');
    const trailer = media.find((m) => m.type === 'video');
    const poster = g.image || (shot && shot.url) || (trailer && trailer.thumb) || '';
    const state = gameState(g);
    const accKey = ACC_KEYS[g.slug];
    const bg = poster ? 'url("' + poster.replace(/["\\()]/g, '') + '")' : 'none';
    let video = null;
    if (trailer && !reducedMotion()) {
      video = h('video', { src: trailer.url, poster: poster || trailer.thumb || null, muted: true, loop: true, autoplay: true, playsinline: true, preload: 'metadata', 'aria-hidden': 'true', tabindex: '-1' });
      video.muted = true;
      video.addEventListener('canplay', () => { const pr = video.play(); if (pr && pr.catch) pr.catch(() => {}); }, { once: true });
    }
    const meta = isFree(g)
      ? h('div', { class: 'price-big' }, t('price.free'), h('small', {}, t('sale.freeNote')))
      : state === 'locked'
        ? null
        : h('div', { class: 'spot-state' }, h('span', { class: 'badge' }, tagOf(g)));
    const actions = actionsFor(g, 'store', true);
    actions.append(h('button', { class: 'btn ghost sm spot-view', type: 'button', onclick: () => openSale(g.slug) }, t('feat.view')));
    return h('section', { class: 'spot', id: 'featured-banner', 'data-accent': accKey, 'aria-label': t('feat.badge') + ' : ' + g.name, style: accStyle(g) },
      h('div', { class: 'spot-media', style: 'background-image:' + bg, onclick: (ev) => { if (!ev.target.closest('button,a')) openSale(g.slug); } },
        poster ? null : h('span', { class: 'cname' }, g.name), video),
      h('div', { class: 'spot-body' },
        h('span', { class: 'badge spot-badge' }, '\u2605 ' + t('feat.badge')), isSoftware(g) ? h('span', { class: 'badge kind-inline' }, t('tag.software')) : null,
        h('h2', { class: 'spot-name' }, g.name),
        h('p', { class: 'spot-text' }, g.featuredText || g.tagline),
        meta, actions));
  }

  // ----- Rassurance (boutique, fiche, paiement) -----
  const reassure = () => h('ul', { class: 'safe' }, ['buy.safe', 'buy.instant', 'buy.updates'].map((k) => h('li', {}, t(k))));

  // ----- Offre mise en avant : vraie date de fin, compte à rebours uniquement vers cette date -----
  async function loadOffer() {
    if (!A.offer) return;
    try { const o = unwrap(await A.offer()); S.offer = o && o.code ? o : null; } catch (_) { S.offer = null; }
    if (S.tab === 'store' && !S.sale) render();
  }
  const offerEnd = (o) => { const ms = o && o.endsAt ? Date.parse(o.endsAt) : NaN; return Number.isFinite(ms) ? ms : null; };
  const offerLive = (o) => !!o && (offerEnd(o) == null || offerEnd(o) > Date.now());
  const offerLabel = (o) => o.label || (o.percent != null ? '-' + o.percent + ' %' : o.amountEur != null ? '-' + money(o.amountEur) : o.code);
  function offerApplies(o, product, slug) {
    const a = o.appliesTo; // route publique : { pass: bool, games: bool } ; absent => on laisse le serveur trancher
    if (!a || typeof a !== 'object') return true;
    return product === 'game' ? !!a.games : !!a.pass;
  }
  function fmtLeft(ms) {
    const sec = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(sec / 86400), hh = Math.floor((sec % 86400) / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
    const p = (n) => String(n).padStart(2, '0');
    return (d ? t('offer.days', { n: d }) + ' ' : '') + p(hh) + ':' + p(mm) + ':' + p(ss);
  }
  function offerStrip() {
    const o = S.offer;
    if (!offerLive(o)) return null;
    const end = offerEnd(o);
    return h('section', { class: 'offer', id: 'offer-strip', 'aria-label': t('offer.aria') },
      h('span', { class: 'offer-main' }, h('b', {}, offerLabel(o)), o.text ? ' · ' + o.text : '', ' · ' + t('offer.code', { code: o.code })),
      end != null ? h('span', { class: 'offer-end' }, t('offer.until', { date: fmtDate(o.endsAt) }), ' · ', h('span', { class: 'offer-left', 'data-end': String(end) }, t('offer.left', { time: fmtLeft(end - Date.now()) }))) : null);
  }
  setInterval(() => {
    for (const el of document.querySelectorAll('.offer-left')) {
      const end = Number(el.dataset.end);
      if (end <= Date.now()) { S.offer = null; render(); return; }
      const txt = t('offer.left', { time: fmtLeft(end - Date.now()) });
      if (el.textContent !== txt) el.textContent = txt;
    }
  }, 1000);

  // ----- Boutique -----
  const PASS_MONTH = 30, PASS_YEAR = 240;
  // Sélecteur segmenté Mensuel / Annuel (carte Game Pass et fenêtre d'achat)
  function planSeg(cur, onPick, months) {
    const opt = (id, label, sub) => h('button', { type: 'button', class: cur === id ? 'on' : '', 'data-plan': id, 'aria-pressed': String(cur === id), onclick: () => onPick(id) }, h('b', {}, label), h('small', {}, sub));
    return h('div', { class: 'planseg', id: 'plan-seg', role: 'group', 'aria-label': t('store.passTitle') },
      opt('pass_monthly', t('plan.monthly'), t('pass.subMonthly', { price: money(PASS_MONTH) })),
      opt('pass_yearly', t('plan.yearly'), t('pass.subYearly', { price: money(PASS_YEAR), months })));
  }
  function passCard() {
    const planInfo = (id) => (id === 'pass_yearly'
      ? { id, name: t('plan.yearly'), price: money(PASS_YEAR), unit: t('store.perYear') }
      : { id, name: t('plan.monthly'), price: money(PASS_MONTH), unit: t('store.perMonth') });
    const sel = planInfo(S.planSel === 'pass_yearly' ? 'pass_yearly' : 'pass_monthly');
    const already = passActive() && !(S.ent.pass.cancelAtPeriodEnd && S.ent.pass.provider === 'paypal');
    const buyBtn = () => h('button', { class: 'btn primary big', type: 'button', id: 'buy-pass', disabled: already, onclick: () => payModal({ product: sel.id, title: t('pay.passTitle', { plan: sel.name }), price: sel.price + sel.unit, unit: sel.unit }) },
      already ? t('store.already') : t('pass.cta', { price: sel.price + sel.unit }));
    if (passActive() && !(S.ent.pass.cancelAtPeriodEnd)) {
      return h('section', { class: 'pass-card active', id: 'gamepass' },
        h('div', {}, h('h2', {}, t('store.passTitle')), h('p', { class: 'sub' }, t('pass.activeSub', { plan: planLabel(S.ent.pass.plan), date: fmtDate(S.ent.pass.renewsAt) }))),
        h('span', { class: 'badge' }, t('sale.passActive')));
    }
    const paid = S.games.filter((g) => !isTool(g));
    const n = paid.length, total = paid.reduce((a, g) => a + (Number(g.price) || 40), 0), unit = n ? Number(paid[0].price) || 40 : 40;
    const same = paid.every((g) => (Number(g.price) || 40) === unit);
    const saving = total - PASS_YEAR, monthsFree = Math.round((PASS_MONTH * 12 - PASS_YEAR) / PASS_MONTH);
    return h('section', { class: 'pass-card', id: 'gamepass' },
      h('div', { class: 'pass-info' },
        h('h2', {}, t('store.passTitle')), h('p', { class: 'sub' }, t('store.passSub')),
        n >= 2 ? h('div', { class: 'pass-compare', id: 'pass-compare' },
          h('div', {}, same ? t('pass.units', { n, unit: money(unit), total: money(total) }) : t('pass.unitsMixed', { n, total: money(total) })),
          h('div', {}, h('b', {}, t('pass.yearly', { price: money(PASS_YEAR), months: monthsFree }))),
          saving > 0 ? h('div', { class: 'pass-save' }, t('pass.saving', { amount: money(saving) }), h('span', { class: 'pass-tag' }, t('store.passTitle'))) : null) : null,
        h('div', { class: 'pass-trial', id: 'pass-trial' }, t('pass.trial', { price: money(PASS_MONTH) }))),
      h('div', { class: 'pass-buy' },
        planSeg(sel.id, (id) => { S.planSel = id; render(); }, monthsFree),
        buyBtn(),
        reassure()));
  }
  function storeView() {
    if (S.filter === 'mine' && !S.games.some(inLibrary)) S.filter = 'games';
    const shown = S.games.filter(matchFilter);
    return h('div', { class: 'store' },
      h('header', { class: 'storehead' },
        h('h1', {}, t('store.hookTitle')), h('p', { class: 'sub' }, t('store.hookSub')),
        h('ul', { class: 'benefits' }, ['store.benefit1', 'store.benefit2', 'store.benefit3'].map((k) => h('li', {}, t(k))))),
      offerStrip(),
      featuredBanner(),
      passCard(),
      S.games.length ? filterBar() : null,
      !S.games.length ? h('div', { class: 'empty' }, t('store.none'))
        : shown.length ? h('div', { class: 'grid' }, shown.map((g) => gameCard(g, 'store'))) : h('div', { class: 'empty' }, t('store.noneFiltered')));
  }
  // Onglets : Jeux TikTok LIVE · Outils gratuits · Ma bibliothèque (si non vide)
  const FILTERS = [['games', 'tab.games', (g) => !isTool(g)], ['tools', 'tab.tools', isTool], ['mine', 'tab.mine', inLibrary]];
  const matchFilter = (g) => (FILTERS.find((f) => f[0] === S.filter) || FILTERS[0])[2](g);
  function filterBar() {
    return h('div', { class: 'seg filters cathead', id: 'store-filters', role: 'group', 'aria-label': t('filter.label') },
      FILTERS.map(([id, key, fn]) => ({ id, key, n: S.games.filter(fn).length })).filter((f) => f.id !== 'mine' || f.n > 0).map((f) =>
        h('button', { type: 'button', class: (S.filter === f.id ? 'on' : '') + ' ft-' + f.id, 'data-filter': f.id, 'aria-pressed': String(S.filter === f.id), onclick: () => { S.filter = f.id; render(); } }, t(f.key), h('span', { class: 'cnt' }, String(f.n)))));
  }


  // ----- Page de vente -----
  function openSale(slug) { S.sale = slug; S.mi = 0; render(); const m = document.querySelector('.main'); if (m) m.scrollTop = 0; }
  const isVideo = (m) => m.type === 'video';
  function mediaEl(m, opts) {
    return isVideo(m)
      ? h('video', { src: m.url, poster: m.thumb || null, controls: true, muted: true, playsinline: true, preload: 'metadata', ...(opts || {}) })
      : h('img', { src: m.url, alt: m.caption || '', ...(opts || {}) });
  }
  function moveMedia(g, d) {
    const n = (g.media || []).length; if (n < 2) return;
    S.mi = (S.mi + d + n) % n; render();
    if (S.lightbox) openLightbox(g);
  }
  function openLightbox(g) {
    document.getElementById('lightbox')?.remove();
    const m = g.media[S.mi]; S.lightbox = true;
    const close = () => { S.lightbox = false; document.getElementById('lightbox')?.remove(); };
    const ov = h('div', { class: 'overlay lightbox', id: 'lightbox', role: 'dialog', 'aria-modal': 'true', onclick: (e) => { if (e.target === ov) close(); } },
      h('button', { class: 'lb-x btn sm', type: 'button', 'aria-label': t('sale.close'), onclick: close }, t('sale.close')),
      g.media.length > 1 ? h('button', { class: 'lb-nav prev btn', type: 'button', 'aria-label': t('sale.prev'), onclick: () => moveMedia(g, -1) }, '‹') : null,
      h('div', { class: 'lb-stage' }, mediaEl(m, isVideo(m) ? { autoplay: true } : {}), m.caption ? h('div', { class: 'lb-cap' }, m.caption) : null),
      g.media.length > 1 ? h('button', { class: 'lb-nav next btn', type: 'button', 'aria-label': t('sale.next'), onclick: () => moveMedia(g, 1) }, '›') : null);
    document.body.append(ov);
  }
  document.addEventListener('keydown', (ev) => {
    if (!S.sale) return;
    const g = S.games.find((x) => x.slug === S.sale); if (!g) return;
    if (ev.key === 'Escape') { if (S.lightbox) { S.lightbox = false; document.getElementById('lightbox')?.remove(); } else if (!document.getElementById('modal')) { S.sale = null; render(); } return; }
    if (ev.target && /^(INPUT|TEXTAREA|VIDEO)$/.test(ev.target.tagName)) return;
    if (ev.key === 'ArrowRight') { ev.preventDefault(); moveMedia(g, 1); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); moveMedia(g, -1); }
  });
  function saleView(g, opts) {
    opts = opts || {};
    const media = g.media || [];
    if (S.mi >= media.length) S.mi = 0;
    const cur = media[S.mi];
    const state = gameState(g), inst = S.installed[g.slug];
    const accKey = ACC_KEYS[g.slug];
    const badge = tagOf(g, state);
    const hero = cur
      ? h('div', { class: 'viewer' + (isVideo(cur) ? ' vid' : ''), title: isVideo(cur) ? null : t('sale.zoom') },
          mediaEl(cur), isVideo(cur) ? null : h('button', { class: 'vzoom', type: 'button', 'aria-label': t('sale.zoom'), onclick: () => openLightbox(g) }),
          isVideo(cur) ? h('button', { class: 'btn sm vexp', type: 'button', onclick: () => openLightbox(g) }, t('sale.fullscreen')) : null,
          media.length > 1 ? [h('button', { class: 'vnav prev btn', type: 'button', 'aria-label': t('sale.prev'), onclick: () => moveMedia(g, -1) }, '‹'), h('button', { class: 'vnav next btn', type: 'button', 'aria-label': t('sale.next'), onclick: () => moveMedia(g, 1) }, '›')] : null)
      : h('div', { class: 'viewer empty-media' }, h('span', {}, t('sale.soon')));
    const strip = media.length > 1 ? h('div', { class: 'strip', role: 'tablist' }, media.map((m, i) => h('button', { class: 'thumb' + (i === S.mi ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': String(i === S.mi), 'aria-label': m.caption || t('sale.media', { n: i + 1 }), onclick: () => { S.mi = i; render(); } },
      m.thumb || !isVideo(m) ? h('img', { src: m.thumb || m.url, alt: '' }) : h('span', { class: 'vt' }), isVideo(m) ? h('span', { class: 'play-ic' }, '▶') : null))) : null;
    const row = (k, v) => v ? [h('dt', {}, k), h('dd', {}, v)] : null;
    const rq = g.requirements || {};
    return h('div', { class: 'sale', 'data-accent': accKey, style: accStyle(g) },
      h('button', { class: 'btn ghost sm back', type: 'button', onclick: () => { if (opts.onBack) return opts.onBack(); S.sale = null; render(); } }, t('sale.back')),
      h('div', { class: 'sale-grid' },
        h('div', { class: 'sale-left' }, hero, strip),
        h('aside', { class: 'sale-side' },
          h('div', { class: 'panel buy' },
            h('div', { class: 'row' }, h('h1', {}, g.name), h('span', { class: 'badge' }, badge), isSoftware(g) ? h('span', { class: 'badge kind-inline' }, t('tag.software')) : null),
            h('p', { class: 'sub hook' }, g.tagline),
            isFree(g) ? h('div', { class: 'price-big' }, t('price.free'), h('small', {}, t('sale.freeNote')))
              : isOwned(g) ? h('div', { class: 'price-big' }, t('sale.owned')) : null,
            opts.preview ? h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', disabled: true }, isFree(g) ? t('act.get') : t('buy.game', { price: money(g.price || 0) }))) : actionsFor(g, 'store', true),
            state === 'locked' && !opts.preview ? reassure() : null,
            (g.features || []).length ? h('ul', { class: 'pts', id: 'sale-points', 'aria-label': t('sale.points') }, g.features.slice(0, 3).map((f) => h('li', {}, f))) : null))),
      h('section', { class: 'sale-sec' }, h('h2', {}, t('sale.details')), h('div', { class: 'panel details' }, h('dl', { class: 'kv sm' },
        row(t('sale.version'), 'v' + g.version + (inst ? ' · ' + t('card.installed', { version: inst.version }) : '')),
        row(t('sale.size'), g.sizeMb ? t('card.size', { size: window.I18N.num(g.sizeMb) }) : null),
        row(t('sale.system'), rq.os), row(t('sale.needs'), rq.needs),
        row(t('sale.languages'), (g.languages || []).join(''))))),
      h('section', { class: 'sale-sec' }, h('h2', {}, t('sale.what')), h('p', { class: 'desc' }, g.description)),
      (g.features || []).length ? h('section', { class: 'sale-sec' }, h('h2', {}, t('sale.features')), h('ul', { class: 'feat' }, g.features.map((f) => h('li', {}, f)))) : null,
      (g.howItWorks || []).length ? h('section', { class: 'sale-sec' }, h('h2', {}, t('sale.how')), h('ol', { class: 'steps' }, g.howItWorks.map((t, i) => h('li', {}, h('b', {}, String(i + 1)), h('span', {}, t))))) : null,
      isFree(g) ? null : h('section', { class: 'sale-sec upsell' }, h('div', {}, h('h2', { style: 'margin-top:0' }, t('sale.upsellTitle')), h('p', { class: 'sub', style: 'margin:0' }, t('sale.upsellText', { price: money(20) }))),
        passActive() ? h('span', { class: 'badge pass' }, t('sale.passActive')) : h('button', { class: 'btn primary', onclick: toPass }, t('sale.seePass'))));
  }

  // ----- Prise en main : succès stockés localement (localStorage, try/catch) -----
  const progKey = () => 'papouth-progress:' + ((S.user && (S.user.id || S.user.email)) || 'anon');
  function getProg() {
    if (S.prog) return S.prog;
    let v = null;
    try { v = JSON.parse(localStorage.getItem(progKey()) || 'null'); } catch (e) { /* ignore */ }
    S.prog = { installed: Array.isArray(v && v.installed) ? v.installed : [], played: Array.isArray(v && v.played) ? v.played : [], shortcut: Array.isArray(v && v.shortcut) ? v.shortcut : [] };
    return S.prog;
  }
  function markProg(kind, slug) {
    const p = getProg();
    if (p[kind].includes(slug)) return false;
    p[kind].push(slug);
    try { localStorage.setItem(progKey(), JSON.stringify(p)); } catch (e) { /* ignore */ }
    return true;
  }
  const seedProg = () => { for (const slug of Object.keys(S.installed || {})) markProg('installed', slug); }; // installs déjà présents
  function achievements() {
    const p = getProg(), forge = S.games.find((g) => g.slug === FORGE);
    const games = (list) => list.filter((s) => s !== FORGE);
    const tried = new Set(games(p.played));
    const A5 = [
      { id: 'install', name: t('ach.install'), desc: t('ach.install.d'), done: games(p.installed).length > 0 },
      { id: 'launch', name: t('ach.launch'), desc: t('ach.launch.d'), done: tried.size > 0 },
      { id: 'three', name: t('ach.three'), desc: t('ach.three.d', { n: Math.min(tried.size, 3) }), done: tried.size >= 3 }
    ];
    if (forge) A5.push(
      { id: 'forgeInstall', name: t('ach.forgeInstall', { name: forge.name }), desc: t('ach.forgeInstall.d'), done: p.installed.includes(FORGE) },
      { id: 'forgeLaunch', name: t('ach.forgeLaunch', { name: forge.name }), desc: t('ach.forgeLaunch.d'), done: p.played.includes(FORGE) });
    return A5;
  }
  function achievementsPanel() {
    const list = achievements(), done = list.filter((a) => a.done).length, next = list.find((a) => !a.done);
    return h('section', { class: 'ach', id: 'achievements', 'aria-label': t('ach.title') },
      h('div', { class: 'ach-head' },
        h('h2', {}, t('ach.title')), h('span', { class: 'ach-count' }, t('ach.progress', { done, total: list.length })),
        h('div', { class: 'ach-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(list.length), 'aria-valuenow': String(done) }, h('i', { style: 'width:' + Math.round(done / list.length * 100) + '%' }))),
      h('ul', { class: 'ach-list' }, list.map((a) => h('li', { class: 'ach-chip' + (a.done ? ' done' : ''), title: a.desc }, h('span', { class: 'ach-mark', 'aria-hidden': 'true' }, a.done ? '✓' : ''), a.name))),
      h('p', { class: 'ach-next' }, next ? t('ach.next', { name: next.name, desc: next.desc }) : t('ach.allDone')),
      h('p', { class: 'ach-note' }, t('ach.note')));
  }

  // ----- Bibliothèque -----
  function libraryView() {
    const mine = S.games.filter(inLibrary);
    return h('div', {}, h('h1', {}, t('lib.title')), h('p', { class: 'sub' }, t('lib.sub')),
      mine.length ? [achievementsPanel(), h('div', { class: 'grid' }, mine.map((g) => gameCard(g, 'library')))]
        : h('div', { class: 'empty' }, t('lib.empty') + ' ', h('button', { class: 'link', onclick: () => { S.tab = 'store'; render(); } }, t('lib.discover'))));
  }

  // ----- Compte -----
  function accountView() {
    const p = S.ent.pass || {};
    const owned = S.games.filter(isOwned);
    const advInput = h('input', { type: 'url', placeholder: 'https://…/api/store', value: S.apiUrl });
    const cancelling = passActive() && !!p.cancelAtPeriodEnd;
    return h('div', {}, h('h1', {}, t('acc.title')), h('p', { class: 'sub' }, t('acc.sub')),
      h('div', { class: 'panel' }, h('dl', { class: 'kv' },
        h('dt', {}, t('acc.email')), h('dd', {}, S.user.email || '—'),
        h('dt', {}, t('acc.tiktok')), h('dd', {}, '@' + (S.user.tiktok || '?')),
        h('dt', {}, t('acc.pass')), h('dd', {}, passActive() ? t('acc.active', { plan: planLabel(p.plan) }) : t('acc.inactive')),
        passActive() ? [h('dt', {}, p.cancelAtPeriodEnd ? t('acc.endsOn') : t('acc.renews')), h('dd', {}, fmtDate(p.renewsAt)),
          h('dt', {}, t('acc.cancel')), h('dd', {}, cancelling ? t('acc.cancelledUntil', { date: fmtDate(p.renewsAt) }) : t('acc.notScheduled'))] : null,
        h('dt', {}, t('acc.device')), h('dd', { id: 'acc-device' }, S.device ? S.device.name + ' · ' + t('acc.deviceSince', { date: fmtDate(S.device.registeredAt) }) : t('acc.deviceNone')),
        h('dt', {}, t('lang.label')), h('dd', {}, langSelect('acc-lang')),
        h('dt', {}, t('theme.label')), h('dd', {}, h('div', { class: 'seg', role: 'group', 'aria-label': t('theme.label') },
          h('button', { type: 'button', class: curTheme() === 'night' ? 'on' : '', 'aria-pressed': String(curTheme() === 'night'), onclick: () => setTheme('night') }, themeIcon('night'), t('theme.night')),
          h('button', { type: 'button', class: curTheme() === 'day' ? 'on' : '', 'aria-pressed': String(curTheme() === 'day'), onclick: () => setTheme('day') }, themeIcon('day'), t('theme.day')))),
        h('dt', {}, t('acc.lifetime')), h('dd', {}, owned.length ? h('div', { class: 'chips' }, owned.map((g) => h('span', { class: 'chip' }, g.name))) : t('acc.nolife')))),
      changePasswordPanel(),
      h('div', { class: 'row', style: 'margin-top:18px' },
        passActive() && !cancelling ? h('button', { class: 'btn outline-danger', id: 'cancel-sub', onclick: cancelModal }, t('acc.cancelBtn')) : null,
        cancelling ? h('button', { class: 'btn primary', id: 'resume-sub', onclick: resumeOrResub }, p.provider === 'paypal' ? t('acc.resubscribe') : t('acc.reactivate')) : null,
        h('button', { class: 'btn ghost', onclick: manage }, t('acc.manage')),
        h('button', { class: 'btn ghost', onclick: logout }, t('acc.logout'))),
      S.dev || S.devOpen ? h('details', { class: 'adv', open: true }, h('summary', {}, t('acc.devTitle')),
        h('div', {}, t('acc.apiUrl')), advInput,
        h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn sm', onclick: async () => {
          try { const r = await call(A.setApiUrl(advInput.value)); S.apiUrl = r.apiUrl; toast(t('acc.saved')); } catch (e) { toast(errText(e), 'error'); } } }, t('acc.save')))) : null);
  }
  function changePasswordPanel() {
    const f = {};
    const fld = (key, label, ac) => h('label', {}, label, f[key] = h('input', { type: 'password', required: true, minlength: key === 'cur' ? 1 : 8, maxlength: 128, autocomplete: ac }));
    const err = h('div', { class: 'err' });
    const submit = async (ev) => {
      ev.preventDefault(); err.textContent = '';
      if (f.nw.value !== f.cf.value) { err.textContent = t('acc.chpwMismatch'); return; }
      const btn = ev.target.querySelector('button[type=submit]'); btn.disabled = true;
      try { await call(A.changePassword(f.cur.value, f.nw.value, window.I18N.lang())); ev.target.reset(); toast(t('acc.chpwOk')); }
      catch (e) { err.textContent = errText(e); }
      btn.disabled = false;
    };
    return h('div', { class: 'panel', style: 'margin-top:18px' }, h('h3', { style: 'margin:0 0 10px' }, t('acc.chpwTitle')),
      h('form', { id: 'chpw-form', class: 'stack', onsubmit: submit },
        fld('cur', t('acc.chpwCurrent'), 'current-password'), fld('nw', t('acc.chpwNew'), 'new-password'), fld('cf', t('acc.chpwConfirm'), 'new-password'),
        err, h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit' }, t('acc.chpwBtn')))));
  }
  function cancelModal() {
    closeModal();
    const p = S.ent.pass || {};
    const box = h('div', { class: 'modal' });
    const ov = h('div', { class: 'overlay', id: 'modal', role: 'dialog', 'aria-modal': 'true', onclick: (e) => { if (e.target === ov) closeModal(); } }, box);
    document.body.append(ov);
    const err = h('div', { class: 'err' });
    const ok = h('button', { class: 'btn outline-danger', id: 'cancel-confirm', onclick: async () => {
      ok.disabled = true;
      try {
        const r = await call(A.cancelSubscription());
        if (r && r.pass) S.ent = { ...S.ent, pass: r.pass }; else S.ent.pass = { ...S.ent.pass, cancelAtPeriodEnd: true };
        closeModal(); toast(t('toast.cancelled')); await refreshAll();
      } catch (e) { ok.disabled = false; err.textContent = errText(e); }
    } }, t('acc.cancelConfirm'));
    box.replaceChildren(h('h3', {}, t('acc.cancelTitle')),
      h('div', { class: 'sub', style: 'margin:0' }, t('acc.cancelBody', { date: fmtDate(p.renewsAt) })),
      h('div', { class: 'sub', style: 'margin:0' }, t('acc.cancelNoRefund')),
      err, ok, h('button', { class: 'btn ghost', onclick: closeModal }, t('acc.cancelKeep')));
  }
  async function resumeOrResub() {
    const p = S.ent.pass || {};
    if (p.provider === 'paypal') { S.tab = 'store'; S.sale = null; render(); document.getElementById('gamepass')?.scrollIntoView({ behavior: 'smooth' }); return; }
    try {
      const r = await call(A.resumeSubscription());
      if (r && r.pass) S.ent = { ...S.ent, pass: r.pass };
      toast(t('toast.resumed')); await refreshAll();
    } catch (e) {
      if (e.code === 'resume_requires_new_subscription') { S.tab = 'store'; render(); toast(errText(e), 'error'); } else toast(errText(e), 'error');
    }
  }
  async function manage() {
    try { await call(A.billingPortal(window.I18N.lang())); if (S.demo) toast(t('toast.demoPortal')); } catch (e) { toast(errText(e), 'error'); }
  }
  async function logout() { await A.logout(); S.admin = null; S.tab = 'store'; S.user = null; S.demo = false; S.ent = { pass: { active: false }, owned: [], access: [] }; S.obtained = []; S.prog = null; S.offer = null; const st = unwrap(await A.getState()); S.demoAvailable = st.demoAvailable; S.reachable = st.reachable; render(); }

  // ---------- actions jeux ----------
  async function install(g) {
    if (S.progress[g.slug]) return; // pas de double démarrage
    S.progress[g.slug] = { stage: 'prepare', pct: null }; render();
    toast(t('dl.started', { name: g.name }));
    try { await call(A.install(g.slug)); } // rend la main aussitôt : le travail se fait en tâche de fond
    catch (e) { delete S.progress[g.slug]; render(); toast(errText(e), 'error'); }
  }
  // Élément gratuit : « Obtenir » = marqué comme obtenu (bibliothèque) puis installé, sans paiement
  async function obtain(g) {
    if (S.progress[g.slug]) return;
    try { const r = await call(A.libraryAdd(g.slug)); S.obtained = (r && r.obtained) || [...new Set([...S.obtained, g.slug])]; }
    catch (e) { toast(errText(e), 'error'); return; }
    install(g);
  }
  async function onInstallDone(d) {
    delete S.progress[d.slug];
    const g = S.games.find((x) => x.slug === d.slug) || { slug: d.slug, name: d.slug };
    try { S.installed = unwrap(await A.installed()) || {}; } catch (_) { /* inchangé */ }
    render();
    if (d.ok) { markProg('installed', d.slug); if (d.shortcut) markProg('shortcut', d.slug); render(); return toast(d.shortcut ? t('toast.readyShortcut', { name: g.name }) : t('toast.ready', { name: g.name })); }
    const e = d.error || {};
    if (e.code === 'cancelled') return toast(t('dl.cancelled', { name: g.name }));
    if (e.code === 'device_limit') return deviceModal(e.extra || {}, () => install(g));
    if (e.code === 'exe_not_found') return toast(t('err.exe_not_found') + (e.extra && e.extra.found ? ' (' + e.extra.found + ')' : ''), 'error');
    toast(errText(e), 'error');
  }
  // Compte déjà utilisé sur un autre PC : proposer de basculer sur ce PC (1 changement / 30 jours)
  function deviceModal(info, retry) {
    closeModal();
    const box = h('div', { class: 'modal', id: 'device-modal' });
    const ov = h('div', { class: 'overlay', id: 'modal', role: 'dialog', 'aria-modal': 'true', onclick: (e) => { if (e.target === ov) closeModal(); } }, box);
    document.body.append(ov);
    const cooldown = (iso) => box.replaceChildren(h('h3', {}, t('dev.title')),
      h('div', { class: 'sub', style: 'margin:0' }, t('dev.cooldown', { date: fmtDate(iso) })),
      h('div', { class: 'sub', style: 'margin:0' }, t('dev.support'), ' ', h('b', {}, 'louisdupasdev@gmail.com')),
      h('button', { class: 'btn ghost', onclick: closeModal }, t('dev.close')));
    if (info.canTransfer === false) return cooldown(info.nextTransferAt);
    box.replaceChildren(h('h3', {}, t('dev.title')),
      h('div', { class: 'sub', style: 'margin:0' }, t('dev.explain')),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', id: 'device-transfer', onclick: async () => {
          try { await call(A.transferDevice()); closeModal(); await loadDevice(); toast(t('dev.done')); retry(); }
          catch (e) { if (e.code === 'transfer_cooldown') return cooldown(e.extra && e.extra.nextTransferAt); toast(errText(e), 'error'); }
        } }, t('dev.useThis')),
        h('button', { class: 'btn ghost', onclick: closeModal }, t('pay.cancel'))));
  }
  async function loadDevice() {
    try { S.device = unwrap(await A.device()).device || null; } catch (_) { S.device = S.device || null; }
    if (S.tab === 'account') render();
  }
  async function uninstall(g) {
    if (!confirm(t('toast.confirmUninstall', { name: g.name }))) return;
    try { await call(A.uninstall(g.slug)); delete S.installed[g.slug]; render(); toast(t('toast.uninstalled', { name: g.name })); } catch (e) { toast(errText(e), 'error'); }
  }
  async function play(g) { try { await call(A.play(g.slug)); if (markProg('played', g.slug)) render(); } catch (e) { toast(errText(e), 'error'); } }

  // ---------- paiement ----------
  function closeModal() { document.getElementById('modal')?.remove(); if (S.pollTimer) { clearInterval(S.pollTimer); S.pollTimer = null; } }
  function payModal({ product, slug, title, price, unit = '' }) {
    closeModal();
    const P = { open: false, code: '', applied: null, error: '', busy: false }; // code promo (prix recalculé par le serveur)
    const box = h('div', { class: 'modal' });
    const ov = h('div', { class: 'overlay', id: 'modal', onclick: (e) => { if (e.target === ov) closeModal(); } }, box);
    document.body.append(ov);
    async function applyPromo(silent) {
      const code = P.code.trim().toUpperCase();
      if (!code) return;
      P.busy = true; P.error = ''; choose();
      try { P.applied = unwrap(await A.promoCheck(code, product, slug)); P.code = code; }
      catch (e) { P.applied = null; P.error = silent ? '' : errText(e); if (silent) P.code = ''; }
      P.busy = false; choose();
      const inp = box.querySelector('#promo-input'); if (inp && !silent) inp.focus();
    }
    const promoBlock = () => {
      if (P.applied) {
        const a = P.applied;
        return h('div', { class: 'promo-ok', id: 'promo-ok' },
          h('span', { class: 'promo-tag' }, a.code + ' · ' + a.label),
          h('button', { class: 'linkbtn', type: 'button', id: 'promo-remove', onclick: () => { P.applied = null; P.code = ''; P.error = ''; choose(); } }, t('pay.promo.remove')));
      }
      if (!P.open) return h('button', { class: 'linkbtn promo-link', type: 'button', id: 'promo-open', onclick: () => { P.open = true; choose(); const i = box.querySelector('#promo-input'); if (i) i.focus(); } }, t('pay.promo.have'));
      return h('form', { class: 'promo-form', id: 'promo-form', onsubmit: (ev) => { ev.preventDefault(); applyPromo(); } },
        h('input', { type: 'text', id: 'promo-input', class: 'promo-input', maxlength: 30, autocomplete: 'off', spellcheck: 'false', 'aria-label': t('pay.promo.label'), placeholder: t('pay.promo.label'), value: P.code, disabled: P.busy, oninput: (ev) => { P.code = ev.target.value.toUpperCase(); ev.target.value = P.code; } }),
        h('button', { class: 'btn sm', type: 'submit', id: 'promo-apply', disabled: P.busy }, t('pay.promo.apply')),
        P.error ? h('div', { class: 'promo-err', id: 'promo-err', role: 'alert' }, P.error) : null);
    };
    const priceLine = () => {
      const a = P.applied;
      const isPass = product !== 'game';
      const note = isPass ? t('pay.passNote') : t('pay.lifetimeNote');
      if (!a) return h('div', { class: 'pay-price' }, h('div', { class: 'pay-amount' }, price), h('div', { class: 'sub' }, note));
      return h('div', { class: 'pay-price' },
        h('div', { class: 'pay-amount' }, h('s', { class: 'promo-old' }, money(a.originalPrice) + (isPass ? unit : '')), ' ', h('b', { class: 'promo-new' }, money(a.finalPrice) + (isPass ? unit : ''))),
        a.firstPaymentOnly && a.regularPrice != null ? h('div', { class: 'promo-then' }, t('pay.promo.then', { price: money(a.regularPrice) + unit })) : null,
        h('div', { class: 'sub' }, note));
    };
    const isPassProduct = product !== 'game';
    const setPlan = (id) => {
      const yr = id === 'pass_yearly';
      product = id; unit = yr ? t('store.perYear') : t('store.perMonth'); price = money(yr ? PASS_YEAR : PASS_MONTH) + unit;
      title = t('pay.passTitle', { plan: yr ? t('plan.yearly') : t('plan.monthly') });
      P.applied = null; P.code = ''; P.error = ''; choose(); autoOffer();
    };
    const choose = () => box.replaceChildren(
      h('h3', {}, title), isPassProduct ? planSeg(product, setPlan, Math.round((PASS_MONTH * 12 - PASS_YEAR) / PASS_MONTH)) : null, priceLine(),
      ...(P.applied && P.applied.free && product === 'game'
        ? [h('button', { class: 'btn primary big', type: 'button', id: 'promo-claim', onclick: () => go('stripe') }, t('pay.promo.claim'))]
        : [h('button', { class: 'btn primary big', type: 'button', id: 'pay-card', onclick: () => go('stripe') }, t('pay.cardCta'), h('span', {}, '→')),
          h('button', { class: 'pay', type: 'button', id: 'pay-paypal', onclick: () => go('paypal') }, t('pay.paypalCta'), h('span', {}, '→'))]),
      reassure(), promoBlock(),
      h('button', { class: 'linkbtn', type: 'button', onclick: closeModal }, t('pay.cancel')));
    async function go(provider) {
      box.replaceChildren(h('h3', {}, title), h('div', { class: 'wait' }, h('div', { class: 'spin' }), t('pay.opening')));
      try {
        const r = unwrap(await A.checkout(provider, product, slug, window.I18N.lang(), P.applied ? P.applied.code : undefined));
        if (r && r.granted) { closeModal(); toast(t('pay.promo.granted')); S.sale = slug; S.mi = 0; await refreshAll(); return; } // jeu offert : aucun paiement
      } catch (e) { toast(errText(e), 'error'); if (/^promo_/.test(String(e && e.code))) { P.applied = null; P.error = errText(e); } return choose(); }
      box.replaceChildren(h('h3', {}, title),
        h('div', { class: 'wait' }, h('div', { class: 'spin' }), t('pay.waiting')),
        h('div', { class: 'sub', style: 'margin:0' }, t('pay.finish2')),
        h('button', { class: 'btn ghost', onclick: closeModal }, t('pay.cancel')));
      const before = JSON.stringify([S.ent.pass && S.ent.pass.active, S.ent.pass && S.ent.pass.cancelAtPeriodEnd, S.ent.owned]);
      const t0 = Date.now(); let inflight = false;
      S.pollTimer = setInterval(async () => {
        if (inflight) return;
        if (Date.now() - t0 > 10 * 60 * 1000) { closeModal(); return toast(t('toast.timeout'), 'error'); }
        inflight = true;
        try {
          const ent = unwrap(await A.entitlements());
          const ok = product === 'game' ? ent.owned.includes(slug) : !!(ent.pass && ent.pass.active);
          if (ok && JSON.stringify([ent.pass && ent.pass.active, ent.pass && ent.pass.cancelAtPeriodEnd, ent.owned]) !== before) {
            closeModal(); toast(t('toast.paid')); if (product === 'game') { S.sale = slug; S.mi = 0; } await refreshAll();
          }
        } catch (_) { /* on réessaie */ }
        inflight = false;
      }, 3000);
    }
    choose();
    // Offre mise en avant : appliquée d'office si elle concerne ce produit (le serveur recalcule et valide le prix)
    autoOffer();
    function autoOffer() { if (S.offer && offerLive(S.offer) && offerApplies(S.offer, product, slug)) { P.code = String(S.offer.code).toUpperCase(); applyPromo(true); } }
  }

  // Panneau développeur (URL de l'API) : Ctrl+Shift+D, ou PAPOUTH_DEV=1
  document.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey && ev.shiftKey && (ev.key === 'D' || ev.key === 'd')) { ev.preventDefault(); S.devOpen = !S.devOpen; if (S.user && S.tab === 'account') render(); }
  });

  // ---------- événements du main ----------
  A.onProgress((p) => {
    if (p.stage === 'done' || !S.progress[p.slug]) return;
    S.progress[p.slug] = p;
    patchProgress(p.slug);
  });
  A.onDone(onInstallDone);
  A.onGameState((s) => { if (s.running) S.running.add(s.slug); else S.running.delete(s.slug); if (s.error) toast(t('toast.launchFail', { error: s.error }), 'error'); render(); });
  // Droits modifiés côté serveur (temps réel) : on met à jour sans attendre
  A.onAccessChanged((ent) => { if (ent && S.user) { S.ent = ent; render(); } });
  A.onAccessRevoked(({ slug }) => {
    const g = (S.games || []).find((x) => x.slug === slug);
    const name = g ? g.name : slug;
    S.running.delete(slug);
    closeModal();
    const box = h('div', { class: 'modal' }, h('h3', {}, t('access.revokedTitle')), h('p', {}, t('access.revoked', { name })),
      h('button', { class: 'btn primary', onclick: closeModal }, t('access.ok')));
    document.body.append(h('div', { class: 'overlay', id: 'modal', role: 'alertdialog', 'aria-modal': 'true' }, box));
    render();
  });
  A.onUpdate((u) => { S.update = u; if (u.state === 'ready') toast(t('update.ready')); render(); });

  // ---------- démarrage ----------
  (async () => {
    try {
      const st = unwrap(await A.getState());
      Object.assign(S, { dev: !!st.dev, demo: st.demo, demoAvailable: st.demoAvailable, reachable: st.reachable, apiUrl: st.apiUrl, version: st.version });
      if (st.loggedIn) { S.user = st.user; await refreshAll(); } else render();
      if (st.loggedIn && S.tab === 'admin') { const ad = adminApi(); if (ad) { const q = new URLSearchParams(location.search); await ad.boot(q.get('adm'), q.get('edit')); } else { S.tab = 'store'; render(); } }
      if (st.loggedIn && !st.user) { /* token présent mais serveur injoignable */ }
    } catch (e) { $app.textContent = t('err.startup', { error: e.message }); }
  })();
})();
