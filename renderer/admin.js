'use strict';
// Mode administrateur du launcher : jeux (éditeur + médias + build), joueurs, statistiques, journal.
// Chargé avant app.js ; app.js appelle PapouthAdmin.create(ctx) uniquement si le compte a le rôle « admin ».
// Aucun style inline (CSP stricte) : classes CSS + CSSOM via h({style}).
(function () {
  const LANGS = ['fr', 'en', 'es', 'th', 'ms'];
  const LANG_NAMES = { fr: 'FR', en: 'EN', es: 'ES', th: 'TH', ms: 'MS' };
  const PRESETS = ['#ff4d8d', '#ffb020', '#4da3ff'];
  const MEDIA_MAX = { image: 15 * 1048576, video: 300 * 1048576 };

  const slugify = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const pad3 = (a) => { const r = (a || []).slice(0, 6); while (r.length < 3) r.push(''); return r; };

  function create(ctx) {
    const { A, h, t, svg, S, render, call, toast, errText, money, fmtDate, saleView } = ctx;
    const adm = (method, path, body) => call(A.admin.call(method, path, body));
    const M = { tab: 'games', games: null, edit: null, users: null, q: '', stats: null, resetArmed: false, log: null, pay: null, paying: false, preview: null, busy: false };
    let upSeq = 0;

    const ICONS = {
      games: 'M6 11h4M8 9v4M15 12h.01M18 10h.01M7 6h10a4 4 0 014 4v4a4 4 0 01-4 4h-1.5L14 16h-4l-1.5 2H7a4 4 0 01-4-4v-4a4 4 0 014-4z',
      users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5M16 4.5a3.5 3.5 0 010 6.5M18 14.8c2.2.6 3.5 2.3 3.5 5.2',
      stats: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
      payments: 'M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2zM3 10h18M7 15h4',
      log: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7',
      admin: 'M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z'
    };
    const tabs = ['games', 'users', 'stats', 'payments', 'log'];

    // ---------- navigation ----------
    const canLeave = () => !M.edit || !M.edit.dirty || confirm(t('adm.unsaved'));
    function leaveEditor() { M.edit = null; M.preview = null; }
    function keepScroll(fn) {
      const m = document.querySelector('.main'); const y = m ? m.scrollTop : 0;
      fn();
      const m2 = document.querySelector('.main'); if (m2) m2.scrollTop = y;
    }
    async function open(tab) {
      if (!canLeave()) return;
      leaveEditor();
      M.tab = tab; S.tab = 'admin'; S.sale = null;
      render();
      await load(tab);
    }
    async function load(tab) {
      M.busy = true;
      try {
        if (tab === 'games') M.games = (await adm('GET', '/admin/games')).games;
        else if (tab === 'users') M.users = (await adm('GET', '/admin/users?q=' + encodeURIComponent(M.q))).users;
        else if (tab === 'stats') { M.resetArmed = false; M.stats = await adm('GET', '/admin/stats'); }
        else if (tab === 'payments') M.pay = await adm('GET', '/admin/payments/status');
        else if (tab === 'log') M.log = (await adm('GET', '/admin/log?limit=200')).log;
      } catch (e) { toast(errText(e), 'error'); }
      M.busy = false;
      if (S.tab === 'admin' && M.tab === tab) keepScroll(render);
    }
    const nav = () => tabs.map((id) => ({ id, label: t('adm.tab.' + id), icon: svg(ICONS[id]), on: S.tab === 'admin' && M.tab === id, go: () => open(id) }));

    // ---------- composants ----------
    const chip = (status) => h('span', { class: 'chip st ' + (status === 'published' ? 'pub' : 'draft') }, status === 'published' ? t('adm.published') : t('adm.draft'));
    const fld = (label, input, hint) => h('label', { class: 'fld' }, h('span', {}, label), input, hint ? h('small', {}, hint) : null);
    const head = (title, sub, ...actions) => h('div', { class: 'adm-head' }, h('div', {}, h('h1', {}, title), sub ? h('p', { class: 'sub' }, sub) : null), h('div', { class: 'row' }, actions));
    const modal = (title, body, actions) => {
      document.getElementById('modal')?.remove();
      const box = h('div', { class: 'modal' }, h('h3', {}, title), body, h('div', { class: 'row' }, actions));
      const ov = h('div', { class: 'overlay', id: 'modal', role: 'dialog', 'aria-modal': 'true', onclick: (e) => { if (e.target === ov) ov.remove(); } }, box);
      document.body.append(ov);
      return ov;
    };
    const closeModal = () => document.getElementById('modal')?.remove();

    // ---------- liste des jeux ----------
    function gamesView() {
      if (M.edit) return M.preview ? previewView() : editorView();
      const list = M.games;
      const move = async (i, d) => {
        const j = i + d; if (j < 0 || j >= list.length) return;
        const next = list.slice(); [next[i], next[j]] = [next[j], next[i]];
        await reorder(next);
      };
      let dragFrom = null;
      const rows = (list || []).map((g, i) => h('div', {
        class: 'grow', draggable: 'true', 'data-slug': g.slug,
        ondragstart: (ev) => { dragFrom = i; ev.dataTransfer.effectAllowed = 'move'; ev.currentTarget.classList.add('drag'); },
        ondragend: (ev) => ev.currentTarget.classList.remove('drag'),
        ondragover: (ev) => { ev.preventDefault(); ev.currentTarget.classList.add('over'); },
        ondragleave: (ev) => ev.currentTarget.classList.remove('over'),
        ondrop: async (ev) => {
          ev.preventDefault(); ev.currentTarget.classList.remove('over');
          if (dragFrom == null || dragFrom === i) return;
          const next = list.slice(); const [m] = next.splice(dragFrom, 1); next.splice(i, 0, m); dragFrom = null;
          await reorder(next);
        }
      },
      h('span', { class: 'grip', 'aria-hidden': 'true' }, '⋮⋮'),
      h('div', { class: 'gthumb', style: g.coverUrl ? 'background-image:url("' + g.coverUrl.replace(/["\\()]/g, '') + '")' : 'background-color:' + g.accent }),
      h('div', { class: 'ginfo' }, h('b', {}, g.name), h('small', {}, g.slug + ' · v' + g.version + ' · ' + (g.free ? t('tag.free') : money(g.priceCents / 100)) + (g.kind === 'software' ? ' · ' + t('tag.software') : ''))),
      chip(g.status), g.hasBuild === false && !(g.download && (g.download.mode === 'url' ? g.download.url : g.download.mode === 'github' ? g.download.github : false)) ? h('span', { class: 'chip st draft' }, t('adm.badge.nobuild')) : null,
      h('div', { class: 'row' },
        g.status === 'published' ? h('button', { class: 'btn sm ghost star' + (g.featured ? ' on' : ''), type: 'button', 'data-star': g.slug, 'aria-pressed': g.featured ? 'true' : 'false', 'aria-label': g.featured ? t('adm.feat.unset') : t('adm.feat.set'), title: g.featured ? t('adm.feat.unset') : t('adm.feat.set'), onclick: () => toggleFeature(g) }, g.featured ? '\u2605' : '\u2606') : null,
        h('button', { class: 'btn sm ghost', type: 'button', 'aria-label': t('adm.moveUp'), title: t('adm.moveUp'), disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
        h('button', { class: 'btn sm ghost', type: 'button', 'aria-label': t('adm.moveDown'), title: t('adm.moveDown'), disabled: i === list.length - 1, onclick: () => move(i, 1) }, '↓'),
        h('button', { class: 'btn sm', type: 'button', onclick: () => openEditor(g.slug) }, t('adm.edit')))));
      return h('div', { class: 'adm' },
        head(t('adm.games.title'), t('adm.games.sub'), h('button', { class: 'btn primary', type: 'button', id: 'new-game', onclick: newGameModal }, '+ ' + t('adm.newGame'))),
        list == null ? h('div', { class: 'empty' }, t('adm.loading')) : list.length ? h('div', { class: 'glist' }, rows) : h('div', { class: 'empty' }, t('adm.games.none')));
    }
    async function toggleFeature(g) {
      try {
        if (g.featured) await adm('DELETE', '/admin/games/' + encodeURIComponent(g.slug) + '/feature');
        else await adm('POST', '/admin/games/' + encodeURIComponent(g.slug) + '/feature', {});
        toast(g.featured ? t('adm.feat.unsetOk') : t('adm.feat.setOk'));
        M.games = (await adm('GET', '/admin/games')).games; keepScroll(render);
      } catch (e) { toast(errText(e), 'error'); }
    }
    async function reorder(next) {
      M.games = next; keepScroll(render);
      try { M.games = (await adm('PUT', '/admin/games/order', { slugs: next.map((g) => g.slug) })).games; } catch (e) { toast(errText(e), 'error'); await load('games'); }
      keepScroll(render);
    }
    function newGameModal() {
      let slugTouched = false;
      const name = h('input', { type: 'text', maxlength: 80, placeholder: t('adm.newGame.namePh'), oninput: () => { if (!slugTouched) slug.value = slugify(name.value); } });
      const slug = h('input', { type: 'text', maxlength: 40, placeholder: 'mon-jeu', oninput: () => { slugTouched = true; } });
      const err = h('div', { class: 'err' });
      const ok = h('button', { class: 'btn primary', type: 'button', id: 'new-game-ok', onclick: async () => {
        if (!name.value.trim()) { err.textContent = t('adm.err.name'); return; }
        ok.disabled = true;
        try {
          const r = await adm('POST', '/admin/games', { name: name.value.trim(), slug: slug.value.trim() || undefined });
          closeModal(); M.games = (await adm('GET', '/admin/games')).games; toast(t('adm.created'));
          openEditor(r.game.slug);
        } catch (e) { ok.disabled = false; err.textContent = errText(e); }
      } }, t('adm.create'));
      modal(t('adm.newGame'), h('div', { class: 'stack' }, fld(t('adm.f.name'), name), fld(t('adm.f.slug'), slug, t('adm.f.slugHint')), err), [ok, h('button', { class: 'btn ghost', type: 'button', onclick: closeModal }, t('adm.cancel'))]);
      name.focus();
    }

    // ---------- éditeur ----------
    function formOf(g) {
      const i18n = {};
      for (const l of LANGS) {
        const d = g.i18n[l] || {};
        i18n[l] = { tagline: d.tagline || '', description: d.description || '', features: [...(d.features || [])], howItWorks: pad3(d.howItWorks), needs: (g.requirements.needs && g.requirements.needs[l]) || '' };
      }
      return { name: g.name, slug: g.slug, accent: g.accent, kind: g.kind === 'software' ? 'software' : 'game', free: !!g.free, price: g.free ? '0' : String(g.priceCents / 100).replace('.', ','), version: g.version, sizeMb: String(g.sizeMb || 0), languages: (g.languages || []).join(', '), os: g.requirements.os || '', exe: (g.download && g.download.exe) || '', gamehubId: g.gamehubId || '', i18n };
    }
    function featState(g) {
      const text = {};
      for (const l of LANGS) text[l] = (g.featuredText && g.featuredText[l]) || '';
      return { lang: 'fr', text, until: g.featuredUntil ? String(g.featuredUntil).slice(0, 10) : '' };
    }
    async function openEditor(slug) {
      if (!canLeave()) return;
      try {
        const g = (await adm('GET', '/admin/games/' + encodeURIComponent(slug))).game;
        const f = formOf(g);
        let fsStatus = g.firestore || { configured: false, enabled: false };
        try { fsStatus = (await adm('GET', '/admin/games/' + encodeURIComponent(slug) + '/firestore')).firestore; } catch (_) { /* statut détaillé facultatif */ }
        M.edit = { game: g, f, feat: featState(g), lang: 'fr', dirty: false, uploads: [], buildUp: null, slugTouched: f.slug !== slugify(f.name), fs: { st: fsStatus, msg: null, busy: false }, gh: { loading: true } };
        M.preview = null; M.tab = 'games'; S.tab = 'admin';
        render(); const m = document.querySelector('.main'); if (m) m.scrollTop = 0;
        loadGamehub(M.edit, false);
      } catch (e) { toast(errText(e), 'error'); }
    }
    // Jeux du GameHub (menu « ID du jeu dans GameHub ») : chargé après l'ouverture pour ne pas retarder l'éditeur
    async function loadGamehub(E, refresh) {
      E.gh = { ...(E.gh || {}), loading: true };
      if (refresh && M.edit === E) keepScroll(render);
      try { const r = await adm('GET', '/admin/gamehub/games' + (refresh ? '?refresh=1' : '')); E.gh = { loading: false, configured: !!r.configured, games: r.games || [], mapping: r.mapping || {}, error: r.error || null }; }
      catch (e) { E.gh = { loading: false, configured: true, games: [], mapping: {}, error: errText(e) }; }
      if (M.edit === E) keepScroll(render);
    }
    async function closeEditor() {
      if (!canLeave()) return;
      leaveEditor(); render(); await load('games');
    }
    const missing = (f, l) => { const d = f.i18n[l]; return !d.tagline.trim() || !d.description.trim() || !d.features.some((x) => x.trim()) || d.howItWorks.filter((x) => x.trim()).length < 3; };
    function payloadOf(E) {
      const f = E.f, g = E.game;
      const price = f.free ? 0 : Math.round(parseFloat(String(f.price).replace(',', '.')) * 100);
      if (!f.name.trim()) throw Object.assign(new Error(t('adm.err.name')), { code: 'invalid_field' });
      if (!f.free && (!Number.isFinite(price) || price < 50 || price > 1000000)) throw Object.assign(new Error(t('adm.err.price')), { code: 'invalid_price' });
      const i18n = {}, needs = {};
      for (const l of LANGS) {
        const d = f.i18n[l];
        i18n[l] = { tagline: d.tagline.trim(), description: d.description.trim(), features: d.features.map((x) => x.trim()).filter(Boolean), howItWorks: d.howItWorks.map((x) => x.trim()).filter(Boolean) };
        needs[l] = d.needs.trim();
      }
      return {
        name: f.name.trim(), ...(g.status === 'draft' && f.slug !== g.slug ? { slug: f.slug.trim() } : {}), accent: f.accent, kind: f.kind, free: !!f.free, priceCents: price, version: f.version.trim(),
        sizeMb: Number(f.sizeMb) || 0, languages: f.languages.split(',').map((x) => x.trim()).filter(Boolean),
        requirements: { os: f.os.trim(), needs }, i18n, gamehubId: f.gamehubId || null, ...(f.exe.trim() ? { download: { exe: f.exe.trim() } } : {})
      };
    }
    async function save() {
      const E = M.edit; if (!E) return false;
      try {
        const r = await adm('PATCH', '/admin/games/' + encodeURIComponent(E.game.slug), payloadOf(E));
        E.game = r.game; E.dirty = false; E.slugTouched = E.f.slug !== slugify(E.f.name) || E.slugTouched;
        toast(t('adm.saved')); keepScroll(render); return true;
      } catch (e) { toast(errText(e), 'error'); return false; }
    }
    const touch = () => { const E = M.edit; if (!E.dirty) { E.dirty = true; syncBar(); } };
    function syncBar() {
      const E = M.edit; if (!E) return;
      const b = document.getElementById('adm-save'); if (b) b.disabled = !E.dirty;
      const d = document.getElementById('adm-dirty'); if (d) d.hidden = !E.dirty;
    }
    async function setStatus(action) {
      const E = M.edit, g = E.game;
      if (action === 'publish') {
        if (E.dirty && !(await save())) return;
        if (!confirm(t('adm.confirm.publish', { name: g.name }))) return;
      } else if (!confirm(t('adm.confirm.unpublish', { name: g.name }))) return;
      try {
        const r = await adm('POST', '/admin/games/' + encodeURIComponent(M.edit.game.slug) + '/' + action);
        M.edit.game = r.game; toast(action === 'publish' ? t('adm.publishedOk') : t('adm.unpublishedOk'));
        if (r.warning) toast(r.warning, 'error');
        keepScroll(render);
      } catch (e) { toast(errText(e), 'error'); }
    }
    async function deleteGame() {
      const g = M.edit.game;
      if (!confirm(t('adm.confirm.delete', { name: g.name }))) return;
      try { await adm('DELETE', '/admin/games/' + encodeURIComponent(g.slug)); toast(t('adm.deleted')); leaveEditor(); render(); await load('games'); } catch (e) { toast(errText(e), 'error'); }
    }
    // Aperçu : même forme que GET /games, construit depuis le formulaire (non enregistré compris)
    function previewGame() {
      const E = M.edit, f = E.f, g = E.game, l = window.I18N.lang();
      const d = f.i18n[l], fr = f.i18n.fr;
      const pick = (k) => (Array.isArray(fr[k]) ? ((d[k] || []).filter((x) => x.trim()).length ? d[k] : fr[k]).filter((x) => x.trim()) : (d[k] || fr[k]));
      const price = parseFloat(String(f.price).replace(',', '.'));
      return {
        slug: g.slug, name: f.name || g.name, tagline: pick('tagline'), description: pick('description'), image: g.coverUrl || '', accent: f.accent, kind: f.kind, free: !!f.free, price: f.free || !Number.isFinite(price) ? 0 : price,
        version: f.version, sizeMb: Number(f.sizeMb) || 0, media: g.media.map((m) => ({ type: m.type, url: m.url, thumb: m.thumb, caption: m.caption })),
        features: pick('features'), howItWorks: pick('howItWorks'), requirements: { os: f.os, needs: d.needs || fr.needs }, languages: f.languages.split(',').map((x) => x.trim()).filter(Boolean)
      };
    }
    function previewView() {
      return h('div', {},
        h('div', { class: 'previewbar' }, h('b', {}, t('adm.preview.title')), h('span', { class: 'sub' }, t('adm.preview.note')),
          h('button', { class: 'btn sm', type: 'button', id: 'preview-close', onclick: () => { M.preview = null; S.mi = 0; render(); } }, t('adm.preview.close'))),
        saleView(M.preview, { preview: true, onBack: () => { M.preview = null; render(); } }));
    }

    function editorView() {
      const E = M.edit, g = E.game, f = E.f;
      const isDraft = g.status === 'draft';
      const bind = (key, extra) => ({ value: f[key], oninput: (ev) => { f[key] = ev.target.value; touch(); if (extra) extra(ev); } });
      const slugIn = h('input', { type: 'text', maxlength: 40, ...bind('slug', () => { E.slugTouched = true; }), disabled: !isDraft });
      const nameIn = h('input', { type: 'text', maxlength: 80, ...bind('name', () => { if (isDraft && !E.slugTouched) { f.slug = slugify(f.name); slugIn.value = f.slug; } }) });
      const colorIn = h('input', { type: 'color', value: f.accent, 'aria-label': t('adm.f.accent'), oninput: (ev) => { f.accent = ev.target.value; hex.value = f.accent; touch(); } });
      const hex = h('input', { type: 'text', class: 'hex', maxlength: 7, value: f.accent, oninput: (ev) => { if (/^#[0-9a-fA-F]{6}$/.test(ev.target.value)) { f.accent = ev.target.value.toLowerCase(); colorIn.value = f.accent; touch(); } } });
      const presets = PRESETS.map((c) => h('button', { type: 'button', class: 'swatch', 'aria-label': c, onclick: () => { f.accent = c; colorIn.value = c; hex.value = c; touch(); }, style: 'background-color:' + c }));

      const bar = head(g.name, null,
        h('button', { class: 'btn ghost', type: 'button', onclick: closeEditor }, '‹ ' + t('adm.back')),
        h('button', { class: 'btn', type: 'button', id: 'preview-open', onclick: () => { M.preview = previewGame(); S.mi = 0; render(); } }, t('adm.preview')),
        h('button', { class: 'btn primary', type: 'button', id: 'adm-save', disabled: !E.dirty, onclick: save }, t('adm.save')),
        isDraft ? h('button', { class: 'btn play', type: 'button', id: 'adm-publish', onclick: () => setStatus('publish') }, t('adm.publish'))
          : h('button', { class: 'btn', type: 'button', id: 'adm-unpublish', onclick: () => setStatus('unpublish') }, t('adm.unpublish')),
        isDraft ? h('button', { class: 'btn outline-danger', type: 'button', onclick: deleteGame }, t('adm.delete')) : null);

      return h('div', { class: 'adm editor' },
        bar,
        h('div', { class: 'row statusrow' }, chip(g.status), h('span', { class: 'dirty', id: 'adm-dirty', hidden: !E.dirty }, t('adm.unsavedShort'))),
        h('section', { class: 'panel wide' }, h('h2', { class: 'ptitle' }, t('adm.sec.general')),
          h('div', { class: 'fgrid' },
            fld(t('adm.f.name'), nameIn),
            fld(t('adm.f.slug'), slugIn, isDraft ? t('adm.f.slugHint') : t('adm.f.slugLocked')),
            fld(t('adm.f.accent'), h('div', { class: 'row accent' }, colorIn, hex, presets)),
            fld(t('adm.f.type'), h('select', { id: 'f-kind', onchange: (ev) => { f.kind = ev.target.value; touch(); } },
              ['game', 'software'].map((k) => h('option', { value: k, selected: f.kind === k }, t('adm.f.type.' + k))))),
            h('div', { class: 'fld' }, h('span', {}, t('adm.f.price')),
              h('div', { class: 'row' },
                h('input', { type: 'text', inputmode: 'decimal', id: 'f-price', 'aria-label': t('adm.f.price'), ...bind('price'), disabled: !!f.free, value: f.free ? '0' : f.price }),
                h('label', { class: 'tog' }, h('input', { type: 'checkbox', id: 'f-free', checked: !!f.free, onchange: (ev) => { f.free = ev.target.checked; if (f.free) f.price = '0'; else if (f.price === '0') f.price = ''; touch(); keepScroll(render); } }), t('adm.f.free'))),
              f.free ? h('small', {}, t('adm.f.freeHint')) : null),
            fld(t('adm.f.version'), h('input', { type: 'text', maxlength: 32, ...bind('version') })),
            fld(t('adm.f.size'), h('input', { type: 'text', inputmode: 'numeric', ...bind('sizeMb') })),
            fld(t('adm.f.os'), h('input', { type: 'text', maxlength: 80, ...bind('os') })),
            fld(t('adm.f.languages'), h('input', { type: 'text', ...bind('languages') }), t('adm.f.languagesHint')))),
        textsPanel(E),
        featuredPanel(E),
        mediaPanel(E),
        buildPanel(E, bind),
        gamehubPanel(E),
        firestorePanel(E));
    }

    function textsPanel(E) {
      const f = E.f, d = f.i18n[E.lang];
      const redraw = () => { keepScroll(render); };
      const tabsEl = h('div', { class: 'ltabs', role: 'tablist' }, LANGS.map((l) => h('button', { type: 'button', role: 'tab', class: 'ltab' + (E.lang === l ? ' on' : ''), 'aria-selected': String(E.lang === l), 'data-lang': l, onclick: () => { E.lang = l; redraw(); } },
        LANG_NAMES[l], missing(f, l) ? h('i', { class: 'wdot', title: t('adm.missing'), 'aria-label': t('adm.missing') }) : null)));
      const list = (key, label, max, hint) => {
        const items = d[key];
        return h('div', { class: 'fld' }, h('span', {}, label), hint ? h('small', {}, hint) : null,
          items.map((v, i) => h('div', { class: 'linerow' },
            h('input', { type: 'text', maxlength: 300, value: v, 'aria-label': label + ' ' + (i + 1), oninput: (ev) => { items[i] = ev.target.value; touch(); } }),
            key === 'features' ? h('button', { class: 'btn sm ghost', type: 'button', 'aria-label': t('adm.remove'), title: t('adm.remove'), onclick: () => { items.splice(i, 1); touch(); redraw(); } }, '×') : null)),
          key === 'features' && items.length < max ? h('button', { class: 'btn sm ghost addline', type: 'button', onclick: () => { items.push(''); touch(); redraw(); } }, '+ ' + t('adm.addLine')) : null);
      };
      return h('section', { class: 'panel wide' }, h('h2', { class: 'ptitle' }, t('adm.sec.texts')), tabsEl,
        missing(f, E.lang) ? h('div', { class: 'warn' }, t('adm.missingHint')) : null,
        h('div', { class: 'stack' },
          fld(t('adm.f.tagline'), h('input', { type: 'text', maxlength: 200, value: d.tagline, oninput: (ev) => { d.tagline = ev.target.value; touch(); } })),
          fld(t('adm.f.description'), h('textarea', { rows: 5, maxlength: 3000, value: d.description, oninput: (ev) => { d.description = ev.target.value; touch(); } })),
          list('features', t('adm.f.features'), 12),
          list('howItWorks', t('adm.f.howItWorks'), 6, t('adm.f.howHint')),
          fld(t('adm.f.needs'), h('input', { type: 'text', maxlength: 200, value: d.needs, oninput: (ev) => { d.needs = ev.target.value; touch(); } }))));
    }

    // ---------- Jeu à la une ----------
    function featuredPanel(E) {
      const g = E.game, F = E.feat, base = '/admin/games/' + encodeURIComponent(g.slug) + '/feature';
      const redraw = () => keepScroll(render);
      const run = async (fn, okMsg) => {
        try { const r = await fn(); E.game = r.game; E.feat = featState(r.game); toast(okMsg); redraw(); } catch (e) { toast(errText(e), 'error'); }
      };
      const published = g.status === 'published';
      const tabsEl = h('div', { class: 'ltabs', role: 'tablist' }, LANGS.map((l) => h('button', { type: 'button', role: 'tab', class: 'ltab' + (F.lang === l ? ' on' : ''), 'aria-selected': String(F.lang === l), 'data-flang': l, onclick: () => { F.lang = l; redraw(); } }, LANG_NAMES[l])));
      const apply = () => {
        const text = {};
        for (const l of LANGS) { const v = F.text[l].trim(); if (v) text[l] = v; }
        return run(() => adm('POST', base, { featuredText: text, until: F.until || null }), t('adm.feat.setOk'));
      };
      return h('section', { class: 'panel wide', id: 'feat-panel' }, h('h2', { class: 'ptitle' }, t('adm.feat.title')),
        h('p', { class: 'sub' }, t('adm.feat.hint')),
        !published ? h('div', { class: 'warn' }, t('adm.feat.needPublish')) : [
          g.featured ? h('div', { class: 'featnote' }, h('span', { class: 'chip st pub' }, '\u2605 ' + t('adm.feat.on')), g.featuredUntil ? h('small', {}, t('adm.feat.until.on', { date: fmtDate(String(g.featuredUntil).slice(0, 10) + 'T12:00:00') })) : null) : null,
          tabsEl,
          h('div', { class: 'stack' },
            fld(t('adm.feat.text') + ' · ' + LANG_NAMES[F.lang], h('input', { type: 'text', id: 'feat-text', maxlength: 90, value: F.text[F.lang], placeholder: ((E.f.i18n[F.lang] || {}).tagline || '').slice(0, 90), oninput: (ev) => { F.text[F.lang] = ev.target.value; } })),
            fld(t('adm.feat.until'), h('input', { type: 'date', id: 'feat-until', value: F.until, oninput: (ev) => { F.until = ev.target.value; } })),
            h('div', { class: 'row' },
              h('button', { class: 'btn primary', type: 'button', id: 'feat-apply', onclick: apply }, g.featured ? t('adm.feat.apply') : t('adm.feat.set')),
              g.featured ? h('button', { class: 'btn', type: 'button', id: 'feat-remove', onclick: () => run(() => adm('DELETE', base), t('adm.feat.unsetOk')) }, t('adm.feat.unset')) : null))]);
    }

    // ---------- GameHub : licences automatiques ----------
    function gamehubPanel(E) {
      const g = E.game, f = E.f, G = E.gh || { loading: true };
      const list = G.games || [];
      const resolved = G.mapping && G.mapping[g.slug];
      const sel = h('select', { id: 'gh-select', 'aria-label': t('gh.field'), disabled: !!G.loading || G.configured === false, onchange: (ev) => { f.gamehubId = ev.target.value; touch(); keepScroll(render); } },
        h('option', { value: '' }, t('gh.auto')), h('option', { value: '-' }, t('gh.none')),
        list.map((x) => h('option', { value: x.id }, x.name + ' (' + x.id + ')')),
        f.gamehubId && f.gamehubId !== '-' && !list.some((x) => x.id === f.gamehubId) ? h('option', { value: f.gamehubId }, f.gamehubId + ' ' + t('gh.unknownId')) : null);
      sel.value = f.gamehubId || '';
      const note = G.loading ? t('gh.loading') : G.configured === false ? t('gh.notConfigured')
        : f.gamehubId === '-' ? t('gh.noneNote')
        : f.gamehubId ? null
        : resolved ? t('gh.resolved', { id: resolved }) : t('gh.unresolved');
      return h('section', { class: 'panel wide', id: 'gh-panel' }, h('h2', { class: 'ptitle' }, t('gh.title')), h('p', { class: 'sub' }, t('gh.hint')),
        fld(t('gh.field'), h('div', { class: 'row' }, sel,
          G.configured === false ? null : h('button', { class: 'btn sm ghost', type: 'button', id: 'gh-refresh', disabled: !!G.loading, onclick: () => loadGamehub(E, true) }, t('gh.refresh')))),
        note ? h('p', { class: 'fsline', id: 'gh-note' }, note) : null,
        G.error ? h('div', { class: 'fsmsg bad', id: 'gh-error', role: 'status' }, t('gh.error', { msg: G.error })) : null);
    }

    // ---------- ancien système de licences (Firestore) ----------
    function firestorePanel(E) {
      const g = E.game, F = E.fs, st = F.st || { configured: false, enabled: false };
      const base = '/admin/games/' + encodeURIComponent(g.slug) + '/firestore';
      const done = (r) => { if (M.edit !== E) return; if (r.firestore) F.st = r.firestore; if (r.game) E.game = r.game; keepScroll(render); };
      const run = async (fn, okMsg) => {
        F.busy = true; F.msg = null; keepScroll(render);
        try { const r = await fn(); F.busy = false; if (okMsg) toast(okMsg); done(r); return r; }
        catch (e) { F.busy = false; F.msg = { bad: true, text: errText(e) }; done({}); }
      };
      const sendKey = (info) => {
        if (!info) return;
        if (info.kind !== 'json') { toast(t('adm.err.json'), 'error'); return; }
        return run(() => call(A.admin.firestoreKey({ slug: g.slug, path: info.path, collection: st.configured ? undefined : 'streamers', enabled: st.configured ? undefined : false })), t('fs.keySaved'));
      };
      const pick = async () => { try { sendKey((await call(A.admin.pick('json')))[0]); } catch (e) { toast(errText(e), 'error'); } };
      const zone = h('div', { class: 'dropzone', id: 'fs-dropzone', tabindex: '0', onclick: (ev) => { if (!ev.target.closest('button')) pick(); }, onkeydown: (ev) => { if (ev.key === 'Enter') pick(); },
        ondragover: (ev) => { ev.preventDefault(); zone.classList.add('over'); }, ondragleave: () => zone.classList.remove('over'),
        ondrop: async (ev) => {
          ev.preventDefault(); zone.classList.remove('over');
          const p = [...ev.dataTransfer.files].map((fl) => A.admin.pathFor(fl)).filter(Boolean)[0];
          if (!p) return;
          try { sendKey((await call(A.admin.fileInfo([p])))[0]); } catch (e) { toast(errText(e), 'error'); }
        } },
      h('b', {}, t('fs.drop')), h('span', { class: 'sub' }, t('fs.keyNote')),
      h('button', { class: 'btn sm', type: 'button', id: 'fs-pick', disabled: F.busy, onclick: pick }, t('fs.choose')));
      const coll = h('input', { type: 'text', id: 'fs-collection', maxlength: 100, value: st.collection || 'streamers', 'aria-label': t('fs.collection') });
      const lg = st.legacy || { count: 0, manual: 0, importedAt: null }, ct = st.counts || { synced: 0, external: 0, error: 0 };
      const row = (k, v) => [h('dt', {}, k), h('dd', {}, v)];
      const details = st.configured ? [
        h('dl', { class: 'kv sm' }, row(t('fs.project'), h('code', {}, st.projectId)), row(t('fs.account'), h('code', {}, st.clientEmail)),
          row(t('fs.collection'), h('div', { class: 'row' }, coll, h('button', { class: 'btn sm', type: 'button', id: 'fs-collection-save', disabled: F.busy, onclick: () => run(() => adm('PUT', base, { collection: coll.value.trim() }), t('adm.saved')) }, t('fs.collectionSave'))))),
        h('small', { class: 'fsline' }, t('fs.collectionHint')),
        h('p', { class: 'fsline', id: 'fs-counts' }, t('fs.counts', { synced: ct.synced, external: ct.external, error: ct.error })),
        h('p', { class: 'fsline', id: 'fs-import-info' }, lg.importedAt ? t('fs.importInfo', { count: lg.count, manual: lg.manual, date: fmtDate(lg.importedAt) }) : t('fs.importNone')),
        h('div', { class: 'fsrow' },
          h('label', { class: 'tog' }, h('input', { type: 'checkbox', id: 'fs-enabled', checked: !!st.enabled, disabled: F.busy, onchange: (ev) => run(() => adm('PUT', base, { enabled: ev.target.checked }), t('adm.saved')) }), t('fs.enable')),
          h('button', { class: 'btn', type: 'button', id: 'fs-test', disabled: F.busy, onclick: async () => {
            F.busy = true; F.msg = null; keepScroll(render);
            try { const r = await adm('POST', base + '/test'); F.msg = r.ok ? { bad: false, text: t('fs.test.ok') } : { bad: true, text: t('fs.test.fail') + ' ' + (r.message || '') }; }
            catch (e) { F.msg = { bad: true, text: errText(e) }; }
            F.busy = false; if (M.edit === E) keepScroll(render);
          } }, t('fs.test')),
          h('button', { class: 'btn', type: 'button', id: 'fs-import', disabled: F.busy, onclick: async () => {
            const r = await run(() => adm('POST', base + '/import'));
            if (r) { F.msg = { bad: false, text: t('fs.imported', { count: r.count, manual: r.manual }) }; if (M.edit === E) keepScroll(render); }
          } }, t('fs.import')),
          h('button', { class: 'btn outline-danger', type: 'button', id: 'fs-remove', disabled: F.busy, onclick: () => { if (confirm(t('fs.confirmRemove'))) run(() => adm('DELETE', base), t('fs.removed')); } }, t('fs.remove')))
      ] : null;
      return h('section', { class: 'panel wide', id: 'fs-panel' }, h('h2', { class: 'ptitle' }, t('fs.title')), h('p', { class: 'sub' }, t('fs.hint')),
        h('div', { class: 'row statusrow' }, h('span', { class: 'chip st ' + (st.configured && st.enabled ? 'pub' : 'draft'), id: 'fs-status' }, !st.configured ? t('fs.status.off') : st.enabled ? t('fs.status.on') : t('fs.status.paused'))),
        details, zone,
        F.msg ? h('div', { class: 'fsmsg' + (F.msg.bad ? ' bad' : ''), id: 'fs-msg', role: 'status' }, F.msg.text) : null);
    }

    // ---------- médias ----------
    function applyGame(g) { const E = M.edit; if (E) { E.game = g; } }
    function mediaPanel(E) {
      const g = E.game;
      const zone = h('div', { class: 'dropzone', id: 'dropzone', tabindex: '0', onclick: (ev) => { if (!ev.target.closest('button')) pickMedia(); }, onkeydown: (ev) => { if (ev.key === 'Enter') pickMedia(); },
        ondragover: (ev) => { ev.preventDefault(); zone.classList.add('over'); }, ondragleave: () => zone.classList.remove('over'),
        ondrop: async (ev) => {
          ev.preventDefault(); zone.classList.remove('over');
          const paths = [...ev.dataTransfer.files].map((fl) => A.admin.pathFor(fl)).filter(Boolean);
          if (!paths.length) return;
          const infos = (await call(A.admin.fileInfo(paths)).catch((e) => { toast(errText(e), 'error'); return []; }));
          queueMedia(infos);
        } },
      h('b', {}, t('adm.media.drop')), h('span', { class: 'sub' }, t('adm.media.formats')),
      h('button', { class: 'btn sm', type: 'button', id: 'media-pick', onclick: pickMedia }, t('adm.media.choose')));
      const ups = E.uploads.map((u) => h('div', { class: 'upl' + (u.error ? ' bad' : ''), 'data-up': u.id },
        h('span', { class: 'un' }, u.name), u.error ? h('span', { class: 'err' }, u.error) : h('span', { class: 'pct' }, Math.round(u.pct * 100) + '%'),
        u.error ? h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { E.uploads = E.uploads.filter((x) => x !== u); keepScroll(render); } }, '×')
          : h('div', { class: 'progress' }, h('i', { style: 'width:' + Math.round(u.pct * 100) + '%' }))));
      const tiles = g.media.map((m, i) => {
        const isCover = g.coverPath === m.path;
        return h('div', { class: 'mtile' + (isCover ? ' iscover' : ''), 'data-id': m.id },
          h('div', { class: 'mthumb' }, m.type === 'video' ? (m.thumb ? h('img', { src: m.thumb, alt: '' }) : h('video', { src: m.url, muted: true, preload: 'metadata' })) : h('img', { src: m.url, alt: m.caption || '' }),
            m.type === 'video' ? h('span', { class: 'tbadge' }, 'MP4') : null, isCover ? h('span', { class: 'tbadge cov' }, t('adm.media.cover')) : null),
          h('input', { type: 'text', class: 'cap', maxlength: 200, placeholder: t('adm.media.caption'), value: m.caption || '', 'aria-label': t('adm.media.caption'), onchange: async (ev) => {
            try { applyGame((await adm('PATCH', '/admin/games/' + encodeURIComponent(g.slug) + '/media', { captions: { [m.id]: ev.target.value } })).game); toast(t('adm.saved')); } catch (e) { toast(errText(e), 'error'); }
          } }),
          h('div', { class: 'row mact' },
            m.type === 'image' && !isCover ? h('button', { class: 'btn sm', type: 'button', onclick: () => mediaOp(() => adm('POST', '/admin/games/' + encodeURIComponent(g.slug) + '/cover', { id: m.id })) }, t('adm.media.setCover')) : null,
            h('button', { class: 'btn sm ghost', type: 'button', disabled: i === 0, 'aria-label': t('adm.moveLeft'), title: t('adm.moveLeft'), onclick: () => moveMediaTile(i, -1) }, '←'),
            h('button', { class: 'btn sm ghost', type: 'button', disabled: i === g.media.length - 1, 'aria-label': t('adm.moveRight'), title: t('adm.moveRight'), onclick: () => moveMediaTile(i, 1) }, '→'),
            h('button', { class: 'btn sm outline-danger', type: 'button', 'aria-label': t('adm.delete'), title: t('adm.delete'), onclick: () => { if (confirm(t('adm.media.confirmDelete'))) mediaOp(() => adm('DELETE', '/admin/games/' + encodeURIComponent(g.slug) + '/media/' + encodeURIComponent(m.id))); } }, '×')));
      });
      return h('section', { class: 'panel wide' }, h('h2', { class: 'ptitle' }, t('adm.sec.media') + ' (' + g.media.length + ')'), zone, ups.length ? h('div', { class: 'uplist' }, ups) : null,
        tiles.length ? h('div', { class: 'mgrid' }, tiles) : h('div', { class: 'empty small' }, t('adm.media.none')));
    }
    async function mediaOp(fn) { try { applyGame((await fn()).game); keepScroll(render); } catch (e) { toast(errText(e), 'error'); } }
    function moveMediaTile(i, d) {
      const ids = M.edit.game.media.map((m) => m.id); const j = i + d; if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      mediaOp(() => adm('PATCH', '/admin/games/' + encodeURIComponent(M.edit.game.slug) + '/media', { order: ids }));
    }
    async function pickMedia() {
      try { queueMedia(await call(A.admin.pick('media'))); } catch (e) { toast(errText(e), 'error'); }
    }
    let uploading = false;
    async function queueMedia(infos) {
      const E = M.edit; if (!E || !infos || !infos.length) return;
      for (const info of infos) {
        const u = { id: 'u' + (++upSeq), name: info.name, pct: 0, error: null, info };
        if (info.kind !== 'image' && info.kind !== 'video') u.error = t('adm.err.type');
        else if (info.size > MEDIA_MAX[info.kind]) u.error = t('adm.err.size', { max: info.kind === 'image' ? '15' : '300' });
        else if (E.game.media.length + E.uploads.filter((x) => !x.error).length >= 40) u.error = t('adm.err.tooMany');
        E.uploads.push(u);
      }
      keepScroll(render);
      if (uploading) return;
      uploading = true;
      try {
        for (;;) {
          const E2 = M.edit; if (!E2) break;
          const u = E2.uploads.find((x) => !x.error && !x.started); if (!u) break;
          u.started = true;
          try {
            const r = await call(A.admin.upload({ slug: E2.game.slug, kind: 'media', path: u.info.path, id: u.id }));
            E2.uploads = E2.uploads.filter((x) => x !== u);
            if (M.edit === E2) { E2.game = r.game; }
          } catch (e) { u.error = errText(e); }
          if (M.edit === E2) keepScroll(render);
        }
      } finally { uploading = false; }
    }

    // ---------- build ----------
    function buildPanel(E, bind) {
      const g = E.game, d = g.download || {};
      const row = (k, v) => v ? [h('dt', {}, k), h('dd', {}, v)] : null;
      const sent = d.hasBuild ? h('p', { class: 'sub' }, t('adm.build.sent', { version: g.version, date: d.uploadedAt ? fmtDate(d.uploadedAt) : '—', size: d.size ? t('card.size', { size: window.I18N.num(Math.round(d.size / 1048576)) }) : '—' })) : null;
      const info = d.hasBuild
        ? h('dl', { class: 'kv sm' }, row(t('adm.build.version'), 'v' + g.version), row(t('adm.build.sha'), h('code', { title: d.sha256 }, (d.sha256 || '').slice(0, 24) + '…')),
          row(t('adm.build.date'), d.uploadedAt ? fmtDate(d.uploadedAt) : null), row(t('adm.build.size'), d.size ? t('card.size', { size: window.I18N.num(Math.round(d.size / 1048576)) }) : null), row(t('adm.build.file'), d.originalName))
        : h('div', { class: 'warn' }, d.mode === 'github' ? t('adm.build.github', { repo: d.github || '—' }) : d.mode === 'url' ? t('adm.build.url') : t('adm.build.nobuild'));
      const bu = E.buildUp;
      const names = [...new Set((d.exeCandidates || []).map((c) => c.split('/').pop()))];
      const kindRow = d.hasBuild && d.kind ? h('dl', { class: 'kv sm' }, row(t('adm.build.kind'), t('adm.build.kind.' + (d.kind === 'installer' ? 'installer' : 'portable'))),
        d.kind === 'installer' ? row(t('adm.build.exeDetected'), names[0] || '—') : row(t('adm.build.exeDetected'), d.exe || '—')) : null;
      const nf = d.hasBuild && d.kind !== 'installer' && !names.length ? h('div', { class: 'warn' }, t('adm.build.notFound')) : null;
      const pickExe = d.kind !== 'installer' && names.length > 1
        ? fld(t('adm.build.exePick'), h('select', { onchange: (ev) => { E.f.exe = ev.target.value; touch(); keepScroll(render); } }, names.map((n) => h('option', { value: n, selected: n.toLowerCase() === String(E.f.exe).toLowerCase() }, n)))) : null;
      return h('section', { class: 'panel wide' }, h('h2', { class: 'ptitle' }, t('adm.sec.build')), h('p', { class: 'sub' }, t('adm.build.hint')), h('p', { class: 'sub' }, t('adm.build.tip')), sent, info, kindRow, nf,
        h('div', { class: 'fgrid' }, fld(t('adm.f.exe'), h('input', { type: 'text', maxlength: 80, ...bind('exe') }), t('adm.f.exeHint')), pickExe),
        bu ? h('div', { class: 'upl', 'data-up': bu.id }, h('span', { class: 'un' }, bu.name), bu.error ? h('span', { class: 'err' }, bu.error) : h('span', { class: 'pct' }, Math.round(bu.pct * 100) + '%'),
          bu.error ? h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { E.buildUp = null; keepScroll(render); } }, '×') : h('div', { class: 'progress' }, h('i', { style: 'width:' + Math.round(bu.pct * 100) + '%' }))) : null,
        h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', id: 'build-pick', disabled: !!(bu && !bu.error), onclick: sendBuild }, t('adm.build.send'))));
    }
    async function sendBuild() {
      const E = M.edit; if (!E) return;
      let infos;
      try { infos = await call(A.admin.pick('build')); } catch (e) { toast(errText(e), 'error'); return; }
      const info = infos && infos[0]; if (!info) return;
      if (info.kind !== 'zip' && info.kind !== 'exe') { toast(t('adm.err.zip'), 'error'); return; }
      const bu = { id: 'u' + (++upSeq), name: info.name, pct: 0, error: null }; E.buildUp = bu; keepScroll(render);
      try {
        const r = await call(A.admin.upload({ slug: E.game.slug, kind: 'build', path: info.path, id: bu.id, version: E.f.version.trim(), exe: E.f.exe.trim() || undefined }));
        E.buildUp = null; E.game = r.game; if (r.game.download && r.game.download.exe) E.f.exe = r.game.download.exe; E.f.version = r.game.version; E.f.sizeMb = String(r.game.sizeMb);
        toast(t('adm.build.done'));
      } catch (e) { bu.error = errText(e); }
      if (M.edit === E) keepScroll(render);
    }

    A.admin.onProgress(({ id, pct }) => {
      const E = M.edit; if (!E) return;
      const u = E.uploads.find((x) => x.id === id) || (E.buildUp && E.buildUp.id === id ? E.buildUp : null);
      if (!u) return;
      u.pct = pct;
      const el = document.querySelector('[data-up="' + id + '"]');
      if (el) { const i = el.querySelector('.progress i'); if (i) i.style.width = Math.round(pct * 100) + '%'; const p = el.querySelector('.pct'); if (p) p.textContent = Math.round(pct * 100) + '%'; }
    });

    // ---------- joueurs ----------
    // Menu « Plus ⋯ » : actions secondaires d'un joueur (clavier : flèches, Début/Fin, Échap ; fermeture au clic extérieur).
    let closeMenu = null;
    const hasSync = (u) => (u.firestore || []).length || (u.legacy || []).length || (u.gamehub || []).length;
    function moreMenu(u) {
      const items = [];
      if (hasSync(u)) items.push({ label: t('fs.sync.resync'), run: () => resyncUser(u) });
      if ((u.legacy || []).some((l) => !l.claimed)) items.push({ label: t('fs.users.claim'), run: () => claimModal(u) });
      items.push({ label: t('adm.users.resetDevice'), run: () => resetDeviceModal(u) });
      items.push({ label: u.isTest ? t('adm.users.testUnmark') : t('adm.users.testMark'), run: () => toggleTest(u), id: 'test-flag-' + u.id });
      items.push({ label: t('adm.users.resetLink'), run: () => resetLinkModal(u), id: 'reset-link-' + u.id });
      items.push({ label: t('adm.rv.menu'), run: () => revokeModal(u), danger: true, id: 'revoke-menu-' + u.id });
      const menuId = 'umenu-' + u.id;
      const btns = items.map((it) => h('button', { class: 'umi' + (it.danger ? ' danger' : ''), type: 'button', role: 'menuitem', tabindex: '-1', id: it.id, onclick: () => { close(true); it.run(); } }, it.label));
      const menu = h('div', { class: 'umenu', role: 'menu', id: menuId, hidden: true, 'aria-label': t('adm.users.moreLabel') }, btns);
      const trigger = h('button', { class: 'btn sm ghost umore', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': menuId, 'aria-label': t('adm.users.moreLabel') }, t('adm.users.more') + ' \u22EF');
      const wrap = h('div', { class: 'umorewrap' }, trigger, menu);
      function close(focus) {
        if (menu.hidden) return;
        menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); wrap.classList.remove('on');
        menu.classList.remove('up', 'start');
        document.removeEventListener('pointerdown', outside, true);
        if (closeMenu === close) closeMenu = null;
        if (focus) trigger.focus();
      }
      const outside = (ev) => { if (!wrap.contains(ev.target)) close(false); };
      function open(focusIdx) {
        if (closeMenu) closeMenu(false);
        menu.hidden = false; trigger.setAttribute('aria-expanded', 'true'); wrap.classList.add('on');
        const r = menu.getBoundingClientRect(), tr = trigger.getBoundingClientRect();
        if (tr.right - r.width < 8) menu.classList.add('start'); // pas assez de place à gauche : alignement sur le bord gauche
        if (tr.bottom + r.height > window.innerHeight - 8 && tr.top > r.height + 8) menu.classList.add('up');
        document.addEventListener('pointerdown', outside, true);
        closeMenu = close;
        if (focusIdx != null) btns[focusIdx < 0 ? btns.length - 1 : focusIdx].focus();
      }
      trigger.addEventListener('click', () => (menu.hidden ? open(null) : close(false)));
      trigger.addEventListener('keydown', (ev) => {
        if (ev.key === 'ArrowDown') { ev.preventDefault(); if (menu.hidden) open(0); else btns[0].focus(); }
        else if (ev.key === 'ArrowUp') { ev.preventDefault(); if (menu.hidden) open(-1); else btns[btns.length - 1].focus(); }
        else if (ev.key === 'Escape' && !menu.hidden) { ev.preventDefault(); close(true); }
      });
      menu.addEventListener('keydown', (ev) => {
        const i = btns.indexOf(document.activeElement);
        if (ev.key === 'Escape') { ev.preventDefault(); close(true); }
        else if (ev.key === 'Tab') close(false);
        else if (ev.key === 'ArrowDown') { ev.preventDefault(); btns[(i + 1) % btns.length].focus(); }
        else if (ev.key === 'ArrowUp') { ev.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
        else if (ev.key === 'Home') { ev.preventDefault(); btns[0].focus(); }
        else if (ev.key === 'End') { ev.preventDefault(); btns[btns.length - 1].focus(); }
      });
      return wrap;
    }
    function usersView() {
      const q = h('input', { type: 'search', id: 'user-q', placeholder: t('adm.users.search'), value: M.q, 'aria-label': t('adm.users.search'), onkeydown: (ev) => { if (ev.key === 'Enter') go(); } });
      const go = () => { M.q = q.value.trim(); load('users'); };
      const rows = (M.users || []).map((u) => h('div', { class: 'urow' },
        h('div', { class: 'uinfo' }, h('b', {}, u.email || '—'), h('small', {}, '@' + u.tiktok + (u.role === 'admin' ? ' · ' + t('adm.role.admin') : ''), u.isTest ? [' ', h('span', { class: 'chip st alt', 'data-test-badge': u.id }, t('adm.users.testBadge'))] : null)),
        h('div', { class: 'uown' }, u.pass && u.pass.active ? h('span', { class: 'chip' }, t('adm.users.pass') + ' · ' + (u.pass.provider === 'admin' ? t('adm.users.gifted') : u.pass.plan === 'yearly' ? t('plan.yearly') : t('plan.monthly'))) : null,
          (u.owned || []).map((s) => h('span', { class: 'chip alt' }, gameName(s))), !(u.pass && u.pass.active) && !(u.owned || []).length ? h('small', {}, t('adm.users.nothing')) : null,
          legacyBadge(u), (u.firestore || []).map((r) => h('span', { class: 'chip st fs-' + r.state, title: r.lastError || '', 'data-fs': r.slug }, 'Firestore · ' + gameName(r.slug) + ' · ' + t('fs.sync.state.' + r.state))),
          (u.gamehub || []).map((r) => h('span', { class: 'chip st fs-' + r.state, title: r.lastError || '', 'data-gh': r.slug }, 'GameHub · ' + gameName(r.slug) + ' · ' + t('gh.state.' + r.state)))),
        h('div', { class: 'uact' },
          h('button', { class: 'btn sm', type: 'button', onclick: () => grantGameModal(u) }, t('adm.users.giveGame')),
          h('button', { class: 'btn sm', type: 'button', onclick: () => grantPassModal(u) }, t('adm.users.givePass')),
          moreMenu(u))));
      return h('div', { class: 'adm' }, head(t('adm.users.title'), t('adm.users.sub')),
        h('div', { class: 'row searchrow' }, q, h('button', { class: 'btn', type: 'button', onclick: go }, t('adm.search')),
          h('button', { class: 'btn ghost', type: 'button', id: 'gh-resync-all', onclick: resyncAllGamehub }, t('gh.resyncAll'))),
        M.users == null ? h('div', { class: 'empty' }, t('adm.loading')) : rows.length ? h('div', { class: 'ulist' }, rows) : h('div', { class: 'empty' }, t('adm.users.none')));
    }
    const legacyBadge = (u) => ((u.legacy || []).length
      ? h('span', { class: 'chip alt legacy', title: t('fs.claim.hint') }, t('fs.users.legacy', { games: u.legacy.map((l) => gameName(l.slug) + (l.claimed ? ' (' + t('fs.claim.linked') + ')' : '')).join(', ') })) : null);
    async function resyncUser(u) {
      try {
        if ((u.firestore || []).length || (u.legacy || []).length) await adm('POST', '/admin/users/' + encodeURIComponent(u.id) + '/firestore/sync');
        if ((u.gamehub || []).length) await adm('POST', '/admin/users/' + encodeURIComponent(u.id) + '/gamehub/sync');
        toast(t('fs.sync.done')); await load('users');
      } catch (e) { toast(errText(e), 'error'); }
    }
    async function toggleTest(u) {
      try { await adm('POST', '/admin/users/' + encodeURIComponent(u.id) + '/test-flag', { isTest: !u.isTest }); toast(u.isTest ? t('adm.users.testUnmarked') : t('adm.users.testMarked')); await load('users'); }
      catch (e) { toast(errText(e), 'error'); }
    }
    async function resyncAllGamehub() {
      try { const r = await adm('POST', '/admin/gamehub/resync-all'); toast(t('gh.resyncAllDone', { n: r.users })); await load('users'); } catch (e) { toast(errText(e), 'error'); }
    }
    async function claimModal(u) {
      await ensureGames();
      const open = (u.legacy || []).filter((l) => !l.claimed);
      const sel = h('select', {}, open.map((l) => h('option', { value: l.slug }, gameName(l.slug))));
      const grant = h('input', { type: 'checkbox', id: 'claim-grant', checked: true });
      modal(t('fs.claim.title'), h('div', { class: 'stack' }, h('small', {}, '@' + u.tiktok), sel, h('label', { class: 'tog' }, grant, t('fs.claim.grant')), h('div', { class: 'warn' }, t('fs.claim.hint')), h('div', { class: 'err' })),
        [h('button', { class: 'btn primary', type: 'button', id: 'claim-ok', onclick: () => act(() => adm('POST', '/admin/legacy/claim', { slug: sel.value, handle: u.tiktok, userId: u.id, grant: grant.checked ? 'lifetime' : 'none' }), t('fs.claim.done')) }, t('fs.users.claim')), h('button', { class: 'btn ghost', type: 'button', onclick: closeModal }, t('adm.cancel'))]);
    }
    const gameName = (slug) => { const g = (M.games || []).find((x) => x.slug === slug); return g ? g.name : slug; };
    async function ensureGames() { if (!M.games) { try { M.games = (await adm('GET', '/admin/games')).games; } catch (_) { M.games = []; } } }
    async function act(fn, okMsg) {
      try { const r = await fn(); closeModal(); toast(okMsg); await load('users'); return r; } catch (e) { const el = document.querySelector('#modal .err'); if (el) el.textContent = errText(e); else toast(errText(e), 'error'); }
    }
    function resetLinkModal(u) {
      const hours = h('select', {}, h('option', { value: '24' }, t('adm.rl.h24')), h('option', { value: '1' }, t('adm.rl.h1')));
      const err = h('div', { class: 'err' });
      const body = h('div', { class: 'stack' }, h('small', {}, '@' + u.tiktok),
        h('div', {}, t('adm.rl.check')), h('ul', {}, [t('adm.rl.c1'), t('adm.rl.c2'), t('adm.rl.c3')].map((x) => h('li', {}, x))),
        h('div', {}, t('adm.rl.compare')), fld(t('adm.rl.duration'), hours), err);
      const gen = h('button', { class: 'btn primary', type: 'button', id: 'reset-link-gen', onclick: async () => {
        gen.disabled = true; err.textContent = '';
        try {
          const r = await adm('POST', '/admin/users/' + encodeURIComponent(u.id) + '/reset-link', { hours: Number(hours.value) });
          const out = h('input', { type: 'text', readonly: true, id: 'reset-link-out', value: r.link, onfocus: (e) => e.target.select() });
          const copy = h('button', { class: 'btn primary', type: 'button', id: 'reset-link-copy', onclick: async () => {
            out.select();
            try { await navigator.clipboard.writeText(r.link); } catch (_) { try { document.execCommand('copy'); } catch (__) { /* sélection manuelle possible */ } }
            toast(t('adm.rl.copied'));
          } }, t('adm.rl.copy'));
          body.replaceChildren(h('small', {}, '@' + u.tiktok), out, h('small', {}, t('adm.rl.expires', { date: new Date(r.expiresAt).toLocaleString(window.I18N.lang()) })), h('div', { class: 'warn' }, t('adm.rl.warn')));
          gen.replaceWith(copy);
          out.select();
        } catch (e) { err.textContent = errText(e); gen.disabled = false; }
      } }, t('adm.rl.generate'));
      modal(t('adm.rl.title'), body, [gen, h('button', { class: 'btn ghost', type: 'button', onclick: closeModal }, t('adm.cancel'))]);
    }
    function resetDeviceModal(u) {
      modal(t('adm.users.resetDevice'), h('div', { class: 'stack' }, h('small', {}, '@' + u.tiktok), h('div', {}, t('adm.users.resetDeviceHint')), h('div', { class: 'err' })),
        [h('button', { class: 'btn primary', type: 'button', id: 'reset-device-ok', onclick: () => act(() => adm('POST', '/admin/users/' + encodeURIComponent(u.id) + '/devices/reset', {}), t('adm.users.resetDeviceDone')) }, t('adm.users.resetDevice')), h('button', { class: 'btn ghost', type: 'button', onclick: closeModal }, t('adm.cancel'))]);
    }
    async function grantGameModal(u) {
      await ensureGames();
      const sel = h('select', {}, M.games.map((g) => h('option', { value: g.slug }, g.name + (g.status === 'draft' ? ' (' + t('adm.draft').toLowerCase() + ')' : ''))));
      modal(t('adm.users.giveGame'), h('div', { class: 'stack' }, h('small', {}, '@' + u.tiktok), sel, h('div', { class: 'err' })),
        [h('button', { class: 'btn primary', type: 'button', onclick: () => act(() => adm('POST', '/admin/grant', { userId: u.id, slug: sel.value }), t('adm.users.granted')) }, t('adm.users.giveGame')), h('button', { class: 'btn ghost', type: 'button', onclick: closeModal }, t('adm.cancel'))]);
    }
    function grantPassModal(u) {
      const days = h('input', { type: 'text', inputmode: 'numeric', value: '30' });
      modal(t('adm.users.givePass'), h('div', { class: 'stack' }, h('small', {}, '@' + u.tiktok), fld(t('adm.users.days'), days), h('div', { class: 'err' })),
        [h('button', { class: 'btn primary', type: 'button', onclick: () => act(() => adm('POST', '/admin/grant', { userId: u.id, slug: 'pass', days: Number(days.value) || 30 }), t('adm.users.granted')) }, t('adm.users.givePass')), h('button', { class: 'btn ghost', type: 'button', onclick: closeModal }, t('adm.cancel'))]);
    }
    // « Retirer un accès… » : liste les accès ACTUELS du joueur avec leur origine, un bouton « Retirer » par ligne (confirmation en deux clics, sans boîte de dialogue système).
    // Game Pass payant : « fin de période » (1 clic) ou « maintenant » (2 clics) ; aucun remboursement automatique (à faire dans Stripe / PayPal). Après chaque retrait la liste est rechargée depuis le serveur.
    async function revokeModal(u) {
      await ensureGames();
      let cur = u, armed = null; // armed : ligne en attente de confirmation
      const lines = (x) => {
        const out = [];
        const acc = Array.isArray(x.accesses) ? x.accesses : (x.owned || []).map((s) => ({ slug: s, origin: 'purchase' }));
        for (const a of acc) out.push({ key: 'g:' + a.slug, slug: a.slug, name: gameName(a.slug), origin: t('adm.rv.origin.' + a.origin), can: true });
        if (x.pass && x.pass.active) {
          const gift = x.pass.provider === 'admin';
          out.push({ key: 'pass', slug: 'pass', name: t('adm.users.pass'), origin: gift ? t('adm.rv.pass.gift') : t('adm.rv.pass.paid') + (x.pass.provider ? ' · ' + (x.pass.provider === 'paypal' ? 'PayPal' : 'Stripe') : ''),
            note: gift ? t('adm.rv.pass.all') : t('adm.rv.pass.hint'), can: gift, paid: !gift });
        }
        return out;
      };
      const body = h('div', { class: 'stack', id: 'revoke-list' });
      const err = h('div', { class: 'err', role: 'alert' });
      async function reload() {
        await load('users');
        const f = (M.users || []).find((y) => y.id === u.id);
        if (f) cur = f; // le joueur reste affiché même si la recherche ne le renvoie plus
      }
      async function remove(l, mode) {
        err.textContent = '';
        try {
          const r = await adm('POST', '/admin/revoke', { userId: u.id, slug: l.slug, ...(mode ? { mode } : {}) });
          toast(mode ? t(mode === 'now' ? 'adm.rv.pass.doneNow' : 'adm.rv.pass.doneEnd') : r && r.stillViaPass ? t('adm.rv.stillPass') : t('adm.users.revoked'), !mode && r && r.stillViaPass ? 'error' : undefined);
          armed = null; await reload(); draw();
        } catch (e) { armed = null; err.textContent = errText(e); toast(errText(e), 'error'); draw(); }
      }
      function draw() {
        const ls = lines(cur);
        body.replaceChildren(h('small', {}, '@' + cur.tiktok), h('div', { class: 'sub' }, t('adm.rv.hint')),
          ls.length ? h('div', { class: 'accs' }, ls.map((l) => h('div', { class: 'accrow', 'data-acc': l.slug },
            h('div', { class: 'accinfo' }, h('b', {}, l.name), h('small', {}, l.origin), l.note ? h('small', { class: 'accnote' }, l.note) : null),
            l.paid ? (armed === 'pass:now'
              ? h('div', { class: 'row' }, h('button', { class: 'btn sm danger', type: 'button', 'data-confirm': 'pass-now', onclick: () => remove(l, 'now') }, t('adm.rv.confirm')), h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { armed = null; draw(); } }, t('adm.cancel')))
              : h('div', { class: 'row' }, h('button', { class: 'btn sm outline-danger', type: 'button', 'data-revoke': 'pass-period-end', onclick: () => remove(l, 'period_end') }, t('adm.rv.pass.periodEnd')), h('button', { class: 'btn sm danger', type: 'button', 'data-revoke': 'pass-now', onclick: () => { armed = 'pass:now'; err.textContent = ''; draw(); } }, t('adm.rv.pass.now'))))
            : l.can ? (armed === l.key
              ? h('div', { class: 'row' }, h('button', { class: 'btn sm danger', type: 'button', 'data-confirm': l.slug, onclick: () => remove(l) }, t('adm.rv.confirm')), h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { armed = null; draw(); } }, t('adm.cancel')))
              : h('button', { class: 'btn sm outline-danger', type: 'button', 'data-revoke': l.slug, onclick: () => { armed = l.key; err.textContent = ''; draw(); } }, t('adm.users.revoke'))) : null)))
            : h('div', { class: 'empty' }, t('adm.users.nothing')), err);
      }
      draw();
      modal(t('adm.rv.title'), body, [h('button', { class: 'btn ghost', type: 'button', id: 'revoke-close', onclick: closeModal }, t('adm.rv.close'))]);
      reload().then(draw).catch(() => {}); // données fraîches du serveur (accès + origines)
    }
    // ---------- statistiques ----------
    async function resetStats() {
      if (!M.resetArmed) { M.resetArmed = true; keepScroll(render); return; } // deuxième clic = confirmation
      M.resetArmed = false;
      try { await adm('POST', '/admin/stats/reset'); toast(t('adm.stats.resetDone')); await load('stats'); } catch (e) { toast(errText(e), 'error'); keepScroll(render); }
    }
    function statsView() {
      const s = M.stats;
      const tile = (label, value) => h('div', { class: 'stat' }, h('small', {}, label), h('b', {}, value));
      const num = window.I18N.num;
      const pm = (s && s.currentPaymentMode) || {};
      const testing = ['stripe', 'paypal'].filter((p) => pm[p] === 'test').map((p) => (p === 'stripe' ? 'Stripe' : 'PayPal'));
      const resetBtn = M.resetArmed
        ? h('div', { class: 'row' }, h('button', { class: 'btn sm danger', type: 'button', id: 'stats-reset-confirm', onclick: resetStats }, t('adm.stats.resetConfirm')), h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { M.resetArmed = false; keepScroll(render); } }, t('adm.cancel')))
        : h('button', { class: 'btn sm outline-danger', type: 'button', id: 'stats-reset', onclick: resetStats }, t('adm.stats.reset'));
      return h('div', { class: 'adm' }, head(t('adm.stats.title'), t('adm.stats.sub'), h('button', { class: 'btn ghost sm', type: 'button', onclick: () => load('stats') }, t('adm.refresh'))),
        !s ? h('div', { class: 'empty' }, t('adm.loading')) : [
          testing.length ? h('div', { class: 'warn', id: 'stats-test-notice', role: 'status' }, t('adm.stats.testMode', { providers: testing.join(', ') })) : null,
          h('div', { class: 'row statusrow' }, h('small', { id: 'stats-since' }, s.statsSince ? t('adm.stats.since', { date: fmtDate(s.statsSince) }) : t('adm.stats.sinceAll')), resetBtn),
          M.resetArmed ? h('small', { id: 'stats-reset-hint' }, t('adm.stats.resetHint')) : null,
          h('div', { class: 'stats' }, tile(t('adm.stats.users'), num(s.users)), tile(t('adm.stats.passes'), num((s.passesTotal != null ? s.passesTotal : s.activePasses.monthly + s.activePasses.yearly))),
            tile(t('adm.stats.monthly'), num(s.activePasses.monthly)), tile(t('adm.stats.yearly'), num(s.activePasses.yearly)), tile(t('adm.stats.revenue'), money(s.revenueMonthEur)),
            s.revenueTotalEur != null ? tile(t('adm.stats.revenueTotal'), money(s.revenueTotalEur)) : null,
            s.gifts ? tile(t('adm.stats.granted'), num((s.gifts.games || 0) + (s.gifts.passes || 0))) : null),
          h('h2', {}, t('adm.stats.perGame')),
          h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, [t('adm.f.name'), t('adm.status'), t('adm.f.price'), t('adm.stats.sales'), t('adm.stats.granted'), t('adm.stats.downloads')].map((c) => h('th', {}, c)))),
            h('tbody', {}, (s.games || []).map((g) => h('tr', {}, h('td', {}, g.name + (g.kind === 'software' ? ' · ' + t('tag.software') : '')), h('td', {}, chip(g.status)), h('td', {}, g.free ? t('tag.free') : money(g.priceCents / 100)), h('td', {}, g.free ? '—' : num(g.sales)), h('td', {}, g.free ? '—' : num(g.granted || 0)), h('td', {}, g.free ? num(g.downloads || 0) : '—')))))]);
    }

    // ---------- paiements (Stripe / PayPal : état de la configuration automatique) ----------
    async function runPaySetup() {
      if (M.paying) return;
      M.paying = true; keepScroll(render);
      try { M.pay = await adm('POST', '/admin/payments/setup'); toast(t('adm.pay.setupDone')); }
      catch (e) { toast(errText(e), 'error'); }
      M.paying = false;
      if (S.tab === 'admin' && M.tab === 'payments') keepScroll(render);
    }
    function paymentsView() {
      const P = M.pay;
      const running = M.paying || !!(P && P.running);
      const chipFor = (state) => h('span', { class: 'pchip ' + state }, t('adm.pay.st.' + (state === 'ok' ? 'ok' : state === 'bad' ? 'err' : 'todo')));
      const card = (id, name, p, rows) => {
        const mode = p.configured && p.mode ? (p.mode === 'live' ? 'live' : 'test') : 'none';
        const stateOf = (ok) => (ok ? 'ok' : p.configured && p.lastError ? 'bad' : 'warn');
        const all = p.configured && rows.every((r) => r[2]);
        const overall = p.configured && p.lastError ? 'bad' : all ? 'ok' : 'warn';
        return h('section', { class: 'panel pcard ' + overall, id: 'pay-' + id, 'data-state': overall },
          h('div', { class: 'pcard-head' }, h('h2', { class: 'ptitle' }, name),
            h('span', { class: 'pmode ' + mode, 'data-mode': mode }, t('adm.pay.mode.' + mode)),
            h('span', { class: 'pchip pstate ' + overall }, t('adm.pay.status.' + (overall === 'ok' ? 'ok' : overall === 'bad' ? 'err' : 'todo')))),
          h('p', { class: 'pcard-hint' }, t('adm.pay.modeHint.' + mode)),
          h('div', { class: 'prows' }, rows.map(([key, label, ok, detail]) => h('div', { class: 'prow', 'data-row': key }, h('span', { class: 'plab' }, label, detail ? h('small', {}, ' ' + detail) : null), chipFor(stateOf(ok))))),
          p.lastError ? h('div', { class: 'perr', role: 'alert' }, h('b', { class: 'perr-lab' }, t('adm.pay.lastError')), h('pre', { class: 'perr-msg' }, String(p.lastError))) : null,
          h('small', { class: 'pcard-foot' }, t('adm.pay.lastRun') + ' : ' + (p.lastRun ? new Date(p.lastRun).toLocaleString(window.I18N.lang()) : t('adm.pay.never'))));
      };
      const cards = !P ? h('div', { class: 'empty' }, t('adm.loading')) : h('div', { class: 'pay-wrap' }, h('div', { class: 'pay-grid' },
        card('stripe', 'Stripe', P.stripe, [
          ['key', t('adm.pay.row.key'), !!(P.stripe.keys && P.stripe.keys.secretKey)],
          ['prices', t('adm.pay.row.prices'), !!(P.stripe.prices && P.stripe.prices.ok), P.stripe.prices && P.stripe.configured ? t('adm.pay.prices.n', { done: P.stripe.prices.done, total: P.stripe.prices.total }) : ''],
          ['webhook', t('adm.pay.row.webhook'), !!(P.stripe.webhook && P.stripe.webhook.ok)],
          ['portal', t('adm.pay.row.portal'), !!(P.stripe.portal && P.stripe.portal.ok)]]),
        card('paypal', 'PayPal', P.paypal, [
          ['key', t('adm.pay.row.key'), !!(P.paypal.keys && P.paypal.keys.clientId && P.paypal.keys.clientSecret)],
          ['plans', t('adm.pay.row.plans'), !!(P.paypal.plans && P.paypal.plans.ok), P.paypal.plans && P.paypal.configured ? t('adm.pay.plans.n', { done: P.paypal.plans.done, total: P.paypal.plans.total }) : ''],
          ['webhook', t('adm.pay.row.webhook'), !!(P.paypal.webhook && P.paypal.webhook.ok)]])));
      const help = h('section', { class: 'panel wide pay-help', id: 'pay-help' }, h('h2', { class: 'ptitle' }, t('adm.pay.help.title')),
        h('ol', {}, ['stripe', 'paypal', 'after', 'live'].map((k) => h('li', {}, t('adm.pay.help.' + k)))));
      return h('div', { class: 'adm' },
        head(t('adm.pay.title'), t('adm.pay.sub'),
          h('button', { class: 'btn ghost sm', type: 'button', onclick: () => load('payments') }, t('adm.refresh')),
          h('button', { class: 'btn primary sm', type: 'button', id: 'pay-setup', disabled: running, onclick: runPaySetup }, running ? t('adm.pay.running') : t('adm.pay.setup'))),
        cards, help);
    }

    // ---------- journal ----------
    function logView() {
      const label = (a) => (window.I18N.has('adm.act.' + a) ? t('adm.act.' + a) : a);
      return h('div', { class: 'adm' }, head(t('adm.log.title'), t('adm.log.sub'), h('button', { class: 'btn ghost sm', type: 'button', onclick: () => load('log') }, t('adm.refresh'))),
        M.log == null ? h('div', { class: 'empty' }, t('adm.loading')) : M.log.length ? h('table', { class: 'tbl' },
          h('thead', {}, h('tr', {}, [t('adm.log.date'), t('adm.log.actor'), t('adm.log.action'), t('adm.log.target')].map((c) => h('th', {}, c)))),
          h('tbody', {}, M.log.map((l) => h('tr', {}, h('td', {}, new Date(l.at).toLocaleString(window.I18N.lang())), h('td', {}, l.actor), h('td', {}, label(l.action)), h('td', {}, [l.target, l.detail].filter(Boolean).join(' · ') || '—'))))) : h('div', { class: 'empty' }, t('adm.log.none')));
    }

    function view() {
      if (M.tab === 'games') return gamesView();
      return M.tab === 'users' ? usersView() : M.tab === 'stats' ? statsView() : M.tab === 'payments' ? paymentsView() : logView();
    }
    // Entrée directe (aperçu navigateur : ?view=admin&adm=users&edit=slug)
    async function boot(tab, slug) {
      M.tab = tabs.includes(tab) ? tab : 'games'; S.tab = 'admin';
      await load(M.tab);
      if (slug && M.tab === 'games') await openEditor(slug);
    }
    return { nav, view, open, canLeave, boot, leave: leaveEditor, icon: svg(ICONS.admin), isEditing: () => !!M.edit };
  }

  window.PapouthAdmin = { create };
})();
