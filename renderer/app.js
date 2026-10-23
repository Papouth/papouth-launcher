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
    games: [], ent: { pass: { active: false }, owned: [], access: [] },
    installed: {}, running: new Set(), progress: {}, busy: new Set(), update: null, version: ''
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
  const passActive = () => !!(S.ent.pass && S.ent.pass.active);
  const planLabel = (p) => (p === 'yearly' ? t('plan.yearly') : p === 'monthly' ? t('plan.monthly') : '—');

  async function refreshAll() {
    const [cat, ent, inst, run] = await Promise.all([A.catalog(window.I18N.lang()), A.entitlements(), A.installed(), A.running()]);
    try { S.games = unwrap(cat).games || []; } catch (e) { toast(errText(e), 'error'); }
    try { S.ent = unwrap(ent); } catch (e) { if (e.code === 'network') toast(errText(e), 'error'); }
    try { S.installed = unwrap(inst) || {}; } catch (_) {}
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
  function gameCard(g, ctx) {
    const state = gameState(g);
    const actions = actionsFor(g, ctx);
    const inst = S.installed[g.slug];
    const bg = g.image ? 'url("' + g.image.replace(/["\\()]/g, '') + '")' : 'none';
    const accKey = { 'paintball-master': 'pink', 'pop-riot': 'yellow', 'boys-girls-ultimate': 'blue' }[g.slug];
    return h('article', { class: 'game clickable', tabindex: '0', role: 'link', 'aria-label': t('card.view', { name: g.name }), onclick: (ev) => { if (!ev.target.closest('button,a,input')) openSale(g.slug); }, onkeydown: (ev) => { if (ev.key === 'Enter' && ev.target === ev.currentTarget) openSale(g.slug); }, 'data-accent': accKey, style: '--ac-raw:' + (/^#[0-9a-f]{3,8}$/i.test(g.accent) ? g.accent : '#7A3CFF') },
      h('div', { class: 'cover', style: 'background-image:' + bg },
        g.image ? null : h('span', { class: 'cname' }, g.name),
        h('span', { class: 'tag badge' }, state === 'locked' ? t('tag.notOwned') : isOwned(g) ? t('tag.lifetime') : t('tag.pass'))),
      h('div', { class: 'body' },
        h('div', { class: 'nm' }, g.name), h('div', { class: 'tg' }, g.tagline),
        h('div', { class: 'meta' }, 'v' + g.version + (g.sizeMb ? ' · ' + t('card.size', { size: window.I18N.num(g.sizeMb) }) : '') + (inst ? ' · ' + t('card.installed', { version: inst.version }) : '')),
        actions));
  }
  function actionsFor(g, ctx) {
    const state = gameState(g);
    const prog = S.progress[g.slug];
    const actions = h('div', { class: 'actions' });
    if (prog) {
      const label = prog.stage === 'extract' ? t('prog.extract') : prog.stage === 'prepare' ? t('prog.prepare') : t('prog.download');
      actions.append(
        h('div', { class: 'plabel' }, h('span', {}, label), prog.pct != null && prog.stage === 'download' ? h('span', {}, Math.round(prog.pct * 100) + '%') : null),
        h('div', { class: 'progress' + (prog.pct == null ? ' ind' : '') }, h('i', { style: prog.pct != null ? 'width:' + Math.round(prog.pct * 100) + '%' : '' })));
    } else if (state === 'locked') {
      actions.append(
        h('button', { class: 'btn primary', onclick: () => payModal({ product: 'game', slug: g.slug, title: t('card.buyTitle', { name: g.name }), price: money(g.price || 40) }) }, t('card.buy', { price: money(g.price || 40) })),
        h('button', { class: 'link', onclick: () => { toPass(); } }, t('card.inPass')));
    } else if (state === 'install') actions.append(h('button', { class: 'btn primary', onclick: () => install(g) }, t('act.download')));
    else if (state === 'update') actions.append(h('button', { class: 'btn primary', onclick: () => install(g) }, t('act.update')), h('button', { class: 'btn ghost sm', onclick: () => play(g) }, t('act.playAnyway')));
    else if (state === 'running') actions.append(h('button', { class: 'btn', disabled: true }, t('act.playing')));
    else actions.append(h('button', { class: 'btn play', onclick: () => play(g) }, t('act.play')));

    if (ctx === 'library' && S.installed[g.slug] && !prog) {
      actions.append(h('div', { class: 'row' },
        h('button', { class: 'btn ghost sm', onclick: () => call(A.openFolder(g.slug)).catch((e) => toast(errText(e), 'error')) }, t('act.openFolder')),
        h('button', { class: 'btn ghost sm danger', disabled: S.running.has(g.slug), onclick: () => uninstall(g) }, t('act.uninstall'))));
    }
    return actions;
  }
  function toPass() { S.sale = null; S.tab = 'store'; render(); document.querySelector('.hero')?.scrollIntoView({ behavior: 'smooth' }); }
  function gameState(g) {
    if (!hasAccess(g)) return 'locked';
    if (S.running.has(g.slug)) return 'running';
    const inst = S.installed[g.slug];
    if (!inst) return 'install';
    return cmpVer(inst.version, g.version) < 0 ? 'update' : 'play';
  }

  // ----- Boutique -----
  function storeView() {
    const plan = (id, name, price, unit, note, best) => h('div', { class: 'plan' + (best ? ' best' : '') },
      best ? h('span', { class: 'badge best' }, t('store.best')) : null,
      h('div', { class: 'name' }, name), h('div', { class: 'price' }, price, h('small', {}, unit)),
      h('div', { class: 'note' }, note),
      h('button', { class: 'btn primary', disabled: passActive() && !(S.ent.pass.cancelAtPeriodEnd && S.ent.pass.provider === 'paypal'), onclick: () => payModal({ product: id, title: t('pay.passTitle', { plan: name }), price: price + unit }) }, (passActive() && !(S.ent.pass.cancelAtPeriodEnd && S.ent.pass.provider === 'paypal')) ? t('store.already') : t('store.choose', { plan: name.toLocaleLowerCase(window.I18N.lang()) })));
    return h('div', {},
      !S.reachable && !S.demo ? null : null,
      h('section', { class: 'hero' },
        h('h1', {}, t('store.passTitle')), h('p', { class: 'sub' }, t('store.passSub')),
        h('div', { class: 'plans' },
          plan('pass_monthly', t('plan.monthly'), money(30), t('store.perMonth'), t('store.noCommit'), false),
          plan('pass_yearly', t('plan.yearly'), money(240), t('store.perYear'), t('store.yearNote', { price: money(20) }), true))),
      h('h2', {}, t('store.games')),
      S.games.length ? h('div', { class: 'grid' }, S.games.map((g) => gameCard(g, 'store'))) : h('div', { class: 'empty' }, t('store.none')));
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
    const accKey = { 'paintball-master': 'pink', 'pop-riot': 'yellow', 'boys-girls-ultimate': 'blue' }[g.slug];
    const badge = state === 'locked' ? t('tag.notOwned') : isOwned(g) ? t('tag.lifetime') : t('tag.pass');
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
    return h('div', { class: 'sale', 'data-accent': accKey, style: '--ac-raw:' + (/^#[0-9a-f]{3,8}$/i.test(g.accent) ? g.accent : '#7A3CFF') },
      h('button', { class: 'btn ghost sm back', type: 'button', onclick: () => { if (opts.onBack) return opts.onBack(); S.sale = null; render(); } }, t('sale.back')),
      h('div', { class: 'sale-grid' },
        h('div', { class: 'sale-left' }, hero, strip),
        h('aside', { class: 'sale-side' },
          h('div', { class: 'panel buy' },
            h('div', { class: 'row' }, h('h1', {}, g.name), h('span', { class: 'badge' }, badge)),
            h('p', { class: 'sub' }, g.tagline),
            h('div', { class: 'price-big' }, isOwned(g) ? t('sale.owned') : money(g.price || 40), isOwned(g) ? null : h('small', {}, t('sale.once'))),
            opts.preview ? h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', disabled: true }, t('card.buy', { price: money(g.price || 0) }))) : actionsFor(g, 'store'),
            h('dl', { class: 'kv sm' },
              row(t('sale.version'), 'v' + g.version + (inst ? ' · ' + t('card.installed', { version: inst.version }) : '')),
              row(t('sale.size'), g.sizeMb ? t('card.size', { size: window.I18N.num(g.sizeMb) }) : null),
              row(t('sale.system'), rq.os), row(t('sale.needs'), rq.needs),
              row(t('sale.languages'), (g.languages || []).join(', ')))))),
      h('section', { class: 'sale-sec' }, h('h2', {}, t('sale.what')), h('p', { class: 'desc' }, g.description)),
      (g.features || []).length ? h('section', { class: 'sale-sec' }, h('h2', {}, t('sale.features')), h('ul', { class: 'feat' }, g.features.map((f) => h('li', {}, f)))) : null,
      (g.howItWorks || []).length ? h('section', { class: 'sale-sec' }, h('h2', {}, t('sale.how')), h('ol', { class: 'steps' }, g.howItWorks.map((t, i) => h('li', {}, h('b', {}, String(i + 1)), h('span', {}, t))))) : null,
      h('section', { class: 'sale-sec upsell' }, h('div', {}, h('h2', { style: 'margin-top:0' }, t('sale.upsellTitle')), h('p', { class: 'sub', style: 'margin:0' }, t('sale.upsellText', { price: money(20) }))),
        passActive() ? h('span', { class: 'badge pass' }, t('sale.passActive')) : h('button', { class: 'btn primary', onclick: toPass }, t('sale.seePass'))));
  }

  // ----- Bibliothèque -----
  function libraryView() {
    const mine = S.games.filter(hasAccess);
    return h('div', {}, h('h1', {}, t('lib.title')), h('p', { class: 'sub' }, t('lib.sub')),
      mine.length ? h('div', { class: 'grid' }, mine.map((g) => gameCard(g, 'library')))
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
    if (p.provider === 'paypal') { S.tab = 'store'; S.sale = null; render(); document.querySelector('.hero')?.scrollIntoView({ behavior: 'smooth' }); return; }
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
  async function logout() { await A.logout(); S.admin = null; S.tab = 'store'; S.user = null; S.demo = false; S.ent = { pass: { active: false }, owned: [], access: [] }; const st = unwrap(await A.getState()); S.demoAvailable = st.demoAvailable; S.reachable = st.reachable; render(); }

  // ---------- actions jeux ----------
  async function install(g) {
    S.progress[g.slug] = { stage: 'prepare', pct: null }; render();
    try { await call(A.install(g.slug)); toast(t('toast.ready', { name: g.name })); }
    catch (e) {
      if (e.code === 'device_limit') { delete S.progress[g.slug]; render(); deviceModal(e.extra || {}, () => install(g)); return; }
      toast(errText(e), 'error');
    }
    delete S.progress[g.slug];
    S.installed = unwrap(await A.installed()) || {}; render();
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
  async function play(g) { try { await call(A.play(g.slug)); } catch (e) { toast(errText(e), 'error'); } }

  // ---------- paiement ----------
  function closeModal() { document.getElementById('modal')?.remove(); if (S.pollTimer) { clearInterval(S.pollTimer); S.pollTimer = null; } }
  function payModal({ product, slug, title, price }) {
    closeModal();
    const box = h('div', { class: 'modal' });
    const ov = h('div', { class: 'overlay', id: 'modal', onclick: (e) => { if (e.target === ov) closeModal(); } }, box);
    document.body.append(ov);
    const choose = () => box.replaceChildren(
      h('h3', {}, title), h('div', { class: 'sub', style: 'margin:0' }, price + ' · ' + t('pay.choose')),
      h('button', { class: 'pay', onclick: () => go('stripe') }, t('pay.card'), h('span', {}, '→')),
      h('button', { class: 'pay', onclick: () => go('paypal') }, 'PayPal', h('span', {}, '→')),
      h('button', { class: 'btn ghost', onclick: closeModal }, t('pay.cancel')));
    async function go(provider) {
      box.replaceChildren(h('h3', {}, title), h('div', { class: 'wait' }, h('div', { class: 'spin' }), t('pay.opening')));
      try { await call(A.checkout(provider, product, slug, window.I18N.lang())); } catch (e) { toast(errText(e), 'error'); return choose(); }
      box.replaceChildren(h('h3', {}, title),
        h('div', { class: 'wait' }, h('div', { class: 'spin' }), t('pay.waiting')),
        h('div', { class: 'sub', style: 'margin:0' }, t('pay.finish')),
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
            closeModal(); toast(t('toast.paid')); await refreshAll();
          }
        } catch (_) { /* on réessaie */ }
        inflight = false;
      }, 3000);
    }
    choose();
  }

  // Panneau développeur (URL de l'API) : Ctrl+Shift+D, ou PAPOUTH_DEV=1
  document.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey && ev.shiftKey && (ev.key === 'D' || ev.key === 'd')) { ev.preventDefault(); S.devOpen = !S.devOpen; if (S.user && S.tab === 'account') render(); }
  });

  // ---------- événements du main ----------
  A.onProgress((p) => {
    if (p.stage === 'done') delete S.progress[p.slug]; else S.progress[p.slug] = p;
    render();
  });
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
