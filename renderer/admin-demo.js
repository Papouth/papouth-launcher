'use strict';
// Faux backend /admin/* en mémoire (mode démo et aperçu navigateur). Même forme de réponses que store-api/admin.js.
// Chargé par le process principal (require) et par preview.html (balise script) : aucune dépendance.
(function (root) {
  const err = (code, message) => Object.assign(new Error(message), { code });
  const rid = () => Math.random().toString(16).slice(2, 10);
  const slugify = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

  function create({ gamesFor, langs }) {
    const now = () => new Date().toISOString();
    const games = [];
    const seed = Object.fromEntries(langs.map((l) => [l, gamesFor(l)]));
    seed.fr.forEach((g, i) => {
      const i18n = {}, needs = {};
      for (const l of langs) {
        const x = seed[l][i];
        i18n[l] = { tagline: x.tagline, description: x.description, features: x.features, howItWorks: x.howItWorks };
        needs[l] = x.requirements.needs;
      }
      const media = (g.media || []).map((m) => ({ id: rid(), type: m.type, url: m.url, path: m.url, ...(m.thumb ? { thumb: m.thumb } : {}), caption: '' }));
      games.push({
        slug: g.slug, name: g.name, accent: String(g.accent).toLowerCase(), kind: g.kind === 'software' ? 'software' : 'game', free: !!g.free, priceCents: g.free ? 0 : Math.round(g.price * 100), version: g.version, sizeMb: g.sizeMb, status: 'published', sortOrder: i,
        i18n, languages: g.languages, requirements: { os: g.requirements.os, needs }, coverUrl: g.image || '', coverPath: g.image || '', media,
        download: { mode: 'upload', exe: g.name.replace(/[^A-Za-z0-9]/g, '') + '.exe', hasBuild: true, sha256: rid() + rid() + rid() + rid() + rid() + rid() + rid() + rid(), size: g.sizeMb * 1048576, uploadedAt: Date.now() - 864e5 * (i + 3), originalName: g.slug + '.zip' },
        firestore: { configured: false, enabled: false }, gamehubId: null, featured: false, featuredText: {}, featuredUntil: null,
        stripeProductId: null, stripePriceId: null, createdAt: now(), updatedAt: now()
      });
    });
    const fsMeta = {}; // slug -> { importedAt, count, manual }
    const fsCounts = (slug) => {
      const g = find(slug), m = fsMeta[slug];
      const n = users.reduce((a, u) => { for (const r of u.firestore || []) if (r.slug === slug) a[r.state] = (a[r.state] || 0) + 1; return a; }, {});
      return { ...g.firestore, counts: { synced: n.synced || 0, external: n.external || 0, error: n.error || 0 }, legacy: { count: m ? m.count : 0, manual: m ? m.manual : 0, importedAt: m ? m.importedAt : null } };
    };
    const users = [
      { id: 'u1', email: 'de***@papouth.com', tiktok: 'papouth_demo', role: 'admin', createdAt: now(), pass: { active: false, plan: null, provider: null, renewsAt: null, cancelAtPeriodEnd: false }, owned: [], devices: 1 },
      { id: 'u2', email: 'li***@gmail.com', tiktok: 'lisa_live', role: 'player', createdAt: now(), pass: { active: true, plan: 'monthly', provider: 'stripe', renewsAt: new Date(Date.now() + 18 * 864e5).toISOString(), cancelAtPeriodEnd: false }, owned: [], devices: 2 },
      { id: 'u3', email: 'ma***@outlook.fr', tiktok: 'max_gaming', role: 'player', createdAt: now(), pass: { active: false, plan: null, provider: null, renewsAt: null, cancelAtPeriodEnd: false }, owned: ['pop-riot'], devices: 1 },
      { id: 'u4', email: 'th***@hotmail.com', tiktok: 'thai_streamer', role: 'player', createdAt: now(), pass: { active: true, plan: 'yearly', provider: 'paypal', renewsAt: new Date(Date.now() + 200 * 864e5).toISOString(), cancelAtPeriodEnd: false }, owned: ['paintball-master'], devices: 1 }
    ];
    users.forEach((u) => { u.legacy = []; u.firestore = []; u.gamehub = []; u.origins = {}; });
    users[2].origins = { 'pop-riot': 'purchase' }; users[3].origins = { 'paintball-master': 'admin' }; // origine de chaque accès à vie
    users[2].legacy = [{ slug: games[0].slug, claimed: false }];
    users[1].firestore = [{ slug: games[1].slug, docId: users[1].tiktok, state: 'synced', lastError: null, syncedAt: now() }, { slug: games[0].slug, docId: users[1].tiktok, state: 'external', lastError: null, syncedAt: now() }];
    users[1].gamehub = [{ slug: games[1].slug, gamehubId: games[1].slug, handle: users[1].tiktok, state: 'synced', retries: 0, lastError: null, syncedAt: now() }, { slug: games[0].slug, gamehubId: games[0].slug, handle: users[1].tiktok, state: 'external', retries: 0, lastError: null, syncedAt: now() }];
    const log = [];
    let statsSince = null;
    const audit = (action, target, detail) => log.unshift({ id: rid(), actor: 'de***@papouth.com', action, target: target || null, detail: detail || null, at: now() });
    const find = (slug) => { const g = games.find((x) => x.slug === slug); if (!g) throw err('unknown_game', 'Jeu introuvable.'); return g; };
    const sorted = () => games.slice().sort((a, b) => a.sortOrder - b.sortOrder);
    const out = (g) => JSON.parse(JSON.stringify(g));
    const touch = (g) => { g.updatedAt = now(); return g; };

    function patch(g, b) {
      if (b.name !== undefined) { if (!String(b.name).trim()) throw err('invalid_field', 'Le nom du jeu est obligatoire.'); g.name = String(b.name).trim().slice(0, 80); }
      if (b.accent !== undefined) { if (!/^#[0-9a-f]{6}$/i.test(b.accent)) throw err('invalid_field', 'Couleur d\'accent invalide (format #rrggbb).'); g.accent = b.accent.toLowerCase(); }
      if (b.kind !== undefined) { if (b.kind !== 'game' && b.kind !== 'software') throw err('invalid_field', 'Type invalide (jeu ou logiciel).'); g.kind = b.kind; }
      if (b.free !== undefined) g.free = !!b.free;
      if (b.priceCents !== undefined) {
        if (g.free) { if (b.priceCents !== 0) throw err('invalid_price', 'Un élément gratuit a un prix de 0 €.'); }
        else { if (!Number.isInteger(b.priceCents) || b.priceCents < 50 || b.priceCents > 1000000) throw err('invalid_price', 'Prix invalide (entre 0,50 € et 10 000 €).'); g.priceCents = b.priceCents; }
      }
      if (g.free) g.priceCents = 0; else if (g.priceCents < 50) throw err('invalid_price', 'Prix invalide (entre 0,50 € et 10 000 €).');
      if (b.version !== undefined) { if (!/^[0-9A-Za-z][0-9A-Za-z.+_-]{0,31}$/.test(b.version)) throw err('invalid_field', 'Version invalide (ex. 1.2.0).'); g.version = b.version; }
      if (b.sizeMb !== undefined) g.sizeMb = Math.max(0, Math.round(Number(b.sizeMb) || 0));
      if (b.languages !== undefined) g.languages = b.languages;
      if (b.gamehubId !== undefined) { if (b.gamehubId && b.gamehubId !== '-' && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(b.gamehubId)) throw err('invalid_field', 'ID du jeu dans GameHub invalide.'); g.gamehubId = b.gamehubId || null; }
      if (b.i18n) for (const [l, d] of Object.entries(b.i18n)) g.i18n[l] = { ...(g.i18n[l] || {}), ...d };
      if (b.requirements) {
        if (b.requirements.os !== undefined) g.requirements.os = b.requirements.os;
        if (b.requirements.needs) g.requirements.needs = { ...g.requirements.needs, ...b.requirements.needs };
      }
      if (b.download && b.download.exe !== undefined) {
        if (!/^[A-Za-z0-9 _.\-()]{1,80}\.exe$/i.test(b.download.exe)) throw err('invalid_field', 'Nom de l\'exécutable invalide (ex. MonJeu.exe, sans dossier).');
        g.download.exe = b.download.exe;
      }
    }

    // État des paiements (démo) : Stripe en test à moitié configuré tant que « Reconfigurer » n'a pas été cliqué
    const pay = { done: false, lastRun: null };
    const payStatus = () => {
      const d = pay.done, total = 2 + games.filter((g) => g.status === 'published').length;
      return {
        running: false, lastRunAt: pay.lastRun,
        stripe: { provider: 'stripe', mode: 'test', configured: true, keys: { secretKey: true }, prices: { ok: d, total, done: d ? total : 2, missing: [] }, webhook: { ok: d }, portal: { ok: d }, ok: d, lastError: d ? null : 'webhook: PUBLIC_URL doit commencer par https://', lastRun: pay.lastRun },
        paypal: { provider: 'paypal', mode: null, configured: false, keys: { clientId: false, clientSecret: false }, plans: { ok: false, done: 0, total: 2 }, webhook: { ok: false }, ok: false, lastError: null, lastRun: null },
      };
    };

    // ---- codes promo (démo, en mémoire) ----
    const promos = [{ id: 'pr1', code: 'BIENVENUE20', type: 'percent', value: 20, appliesTo: { passMonthly: true, passYearly: true, allGames: true, games: [] }, passScope: 'first', startsAt: null, endsAt: null, maxUses: 100, onePerUser: true, note: 'Lancement', paused: false, uses: 12, revenueCents: 28800, refunded: 0 }];
    const promoBody = (p) => ({ code: p.code, type: p.type, value: p.value, appliesTo: p.appliesTo, passScope: p.passScope, startsAt: p.startsAt, endsAt: p.endsAt, maxUses: p.maxUses, onePerUser: p.onePerUser, note: p.note });
    function promoIn(b, cur) {
      const code = String(b.code || '').trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw err('invalid_code', 'Code invalide : 3 à 30 caractères (A-Z, 0-9, - et _).');
      if (promos.some((x) => x.code === code && x !== cur)) throw err('code_taken', 'Ce code existe déjà.');
      const value = Number(b.value);
      if (!Number.isInteger(value) || value < 1 || (b.type === 'percent' && value > 100)) throw err('invalid_value', 'Valeur de remise invalide.');
      const ap = b.appliesTo || {};
      if (!ap.passMonthly && !ap.passYearly && !ap.allGames && !(ap.games || []).length) throw err('invalid_applies', 'Choisissez au moins un produit.');
      return { id: cur ? cur.id : 'pr' + rid(), code, type: b.type === 'amount' ? 'amount' : 'percent', value, appliesTo: { passMonthly: !!ap.passMonthly, passYearly: !!ap.passYearly, allGames: !!ap.allGames, games: ap.allGames ? [] : (ap.games || []) },
        passScope: b.passScope === 'all' ? 'all' : 'first', startsAt: b.startsAt || null, endsAt: b.endsAt || null, maxUses: b.maxUses == null ? null : Number(b.maxUses), onePerUser: b.onePerUser !== false, note: String(b.note || ''),
        paused: cur ? cur.paused : false, uses: cur ? cur.uses : 0, revenueCents: cur ? cur.revenueCents : 0, refunded: cur ? cur.refunded : 0 };
    }
    function promoOut(p) {
      const t = Date.now(), end = p.endsAt ? Date.parse(p.endsAt + 'T23:59:59Z') : null, start = p.startsAt ? Date.parse(p.startsAt) : null;
      const status = p.paused ? 'paused' : end && end < t ? 'expired' : p.maxUses != null && p.uses >= p.maxUses ? 'exhausted' : start && start > t ? 'scheduled' : 'active';
      const label = p.type === 'percent' ? '-' + p.value + ' %' : '-' + String(p.value / 100).replace('.', ',') + ' €';
      return { ...p, label, status, usesLive: 0, usesTest: p.uses, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    }

    function handle(method, route, body) {
      const u = new URL(route, 'http://x');
      const seg = u.pathname.split('/').filter(Boolean).slice(1); // sans "admin"
      const b = body || {};
      const key = method + ' ' + seg[0] + (seg[1] ? ' :slug' : '') + (seg[2] ? ' ' + seg[2] : '') + (seg[3] ? ' :id' : '');
      switch (key) {
        case 'GET games': return { games: sorted().map(out) };
        case 'GET promos': return { promos: promos.map(promoOut), mode: 'test', games: sorted().filter((g) => !g.free).map((g) => ({ slug: g.slug, name: g.name, status: g.status })) };
        case 'POST promos': {
          const p = promoIn(b, null); promos.unshift(p); audit('promo.create', p.code, promoOut(p).label);
          return { promo: promoOut(p) };
        }
        case 'PATCH promos :slug': {
          const p = promos.find((x) => x.id === seg[1]); if (!p) throw err('not_found', 'Code promo introuvable.');
          if (Object.keys(b).length === 1 && typeof b.paused === 'boolean') { p.paused = b.paused; audit(b.paused ? 'promo.pause' : 'promo.resume', p.code); }
          else { Object.assign(p, promoIn({ ...promoBody(p), ...b }, p)); audit('promo.update', p.code); }
          return { promo: promoOut(p) };
        }
        case 'DELETE promos :slug': {
          const i = promos.findIndex((x) => x.id === seg[1]); if (i < 0) throw err('not_found', 'Code promo introuvable.');
          const [p] = promos.splice(i, 1); audit('promo.delete', p.code); return { ok: true };
        }
        case 'PUT games :slug': { // /admin/games/order
          if (seg[1] !== 'order') break;
          (b.slugs || []).forEach((s, i) => { const g = games.find((x) => x.slug === s); if (g) g.sortOrder = i; });
          audit('games.reorder', null, (b.slugs || []).join(','));
          return { games: sorted().map(out) };
        }
        case 'POST games': {
          const name = String(b.name || '').trim();
          if (!name) throw err('invalid_field', 'Le nom du jeu est obligatoire.');
          const slug = (b.slug || slugify(name)).trim();
          if (slug.length < 2 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw err('invalid_slug', 'Identifiant invalide : 2 à 40 caractères, minuscules, chiffres et tirets.');
          if (games.some((g) => g.slug === slug)) throw err('slug_taken', 'Un jeu utilise déjà cet identifiant.');
          const g = {
            slug, name, kind: 'game', free: false, accent: '#8a8f98', priceCents: 4000, version: '1.0.0', sizeMb: 0, status: 'draft', sortOrder: games.length,
            i18n: Object.fromEntries(langs.map((l) => [l, { tagline: '', description: '', features: [], howItWorks: [] }])),
            languages: ['Français', 'English', 'Español', 'ไทย', 'Bahasa Melayu', 'Deutsch'], requirements: { os: 'Windows 10/11', needs: {} }, coverUrl: '', coverPath: '', media: [],
            download: { mode: 'upload', exe: name.replace(/[^A-Za-z0-9]/g, '') + '.exe', hasBuild: false }, stripeProductId: null, stripePriceId: null, createdAt: now(), updatedAt: now()
          };
          patch(g, { ...(b.kind !== undefined ? { kind: b.kind } : {}), ...(b.free !== undefined ? { free: b.free } : {}), ...(b.free ? { priceCents: 0 } : {}) });
          games.push(g); audit('game.create', slug, name);
          return { game: out(g) };
        }
        case 'GET games :slug': return { game: out(find(seg[1])) };
        case 'PATCH games :slug': {
          const g = find(seg[1]);
          patch(g, b);
          if (b.slug !== undefined && b.slug !== g.slug) {
            if (g.status !== 'draft') throw err('slug_locked', 'L\'identifiant d\'un jeu publié ne peut pas changer : repassez-le en brouillon.');
            if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(b.slug) || b.slug.length < 2) throw err('invalid_slug', 'Identifiant invalide : 2 à 40 caractères, minuscules, chiffres et tirets.');
            if (games.some((x) => x.slug === b.slug)) throw err('slug_taken', 'Un jeu utilise déjà cet identifiant.');
            g.slug = b.slug;
          }
          audit('game.update', g.slug, Object.keys(b).join(','));
          return { game: out(touch(g)) };
        }
        case 'DELETE games :slug': {
          const g = find(seg[1]);
          if (g.status === 'published') { g.status = 'draft'; g.featured = false; g.featuredText = {}; g.featuredUntil = null; audit('game.unpublish', g.slug, 'via suppression'); return { game: out(g), unpublished: true }; }
          games.splice(games.indexOf(g), 1); audit('game.delete', g.slug, g.name);
          return { ok: true };
        }
        case 'POST games :slug publish': {
          const g = find(seg[1]);
          const miss = [];
          if (!g.i18n.fr.tagline) miss.push('accroche en français');
          if (!g.i18n.fr.description) miss.push('description en français');
          if (!g.download.hasBuild) miss.push('fichier du jeu (.zip)');
          if (miss.length) throw err('incomplete', 'Impossible de publier, il manque : ' + miss.join(', ') + '.');
          g.status = 'published'; audit('game.publish', g.slug);
          return { game: out(touch(g)) };
        }
        case 'POST games :slug unpublish': { const g = find(seg[1]); g.status = 'draft'; g.featured = false; g.featuredText = {}; g.featuredUntil = null; audit('game.unpublish', g.slug); return { game: out(touch(g)) }; }
        case 'POST games :slug feature': {
          const g = find(seg[1]);
          if (g.status !== 'published') throw err('not_published', 'Seul un jeu publié peut être mis à la une.');
          const text = {};
          for (const [l, v] of Object.entries(b.featuredText || {})) { const x = String(v || '').trim(); if (x.length > 90) throw err('invalid_field', 'Texte à la une : 90 caractères maximum.'); if (x && langs.includes(l)) text[l] = x; }
          let until = null;
          if (b.until) { until = /^\d{4}-\d{2}-\d{2}$/.test(b.until) ? Date.parse(b.until + 'T23:59:59Z') : Date.parse(b.until); if (!Number.isFinite(until) || until <= Date.now()) throw err('invalid_field', 'La date de fin doit être dans le futur.'); }
          for (const x of games) if (x !== g) { x.featured = false; x.featuredText = {}; x.featuredUntil = null; }
          g.featured = true; g.featuredText = text; g.featuredUntil = until ? new Date(until).toISOString() : null; audit('game.feature', g.slug);
          return { game: out(touch(g)) };
        }
        case 'DELETE games :slug feature': { const g = find(seg[1]); g.featured = false; g.featuredText = {}; g.featuredUntil = null; audit('game.unfeature', g.slug); return { game: out(touch(g)) }; }
        case 'PATCH games :slug media': {
          const g = find(seg[1]);
          if (b.captions) for (const m of g.media) if (typeof b.captions[m.id] === 'string') m.caption = b.captions[m.id].slice(0, 200);
          if (Array.isArray(b.order)) {
            const seq = b.order.map((id) => g.media.find((m) => m.id === id)).filter(Boolean);
            g.media = [...seq, ...g.media.filter((m) => !seq.includes(m))];
          }
          audit('media.update', g.slug);
          return { game: out(touch(g)) };
        }
        case 'DELETE games :slug media :id': {
          const g = find(seg[1]);
          const m = g.media.find((x) => x.id === seg[3]);
          if (!m) throw err('unknown_media', 'Média introuvable.');
          g.media = g.media.filter((x) => x !== m);
          if (g.coverPath === m.path) { const n = g.media.find((x) => x.type === 'image'); g.coverUrl = n ? n.url : ''; g.coverPath = n ? n.path : ''; }
          audit('media.delete', g.slug, m.type);
          return { game: out(touch(g)) };
        }
        case 'POST games :slug cover': {
          const g = find(seg[1]);
          if (b.id === null) { g.coverUrl = ''; g.coverPath = ''; } else {
            const m = g.media.find((x) => x.id === b.id);
            if (!m) throw err('unknown_media', 'Média introuvable.');
            if (m.type !== 'image') throw err('invalid_field', 'La couverture doit être une image.');
            g.coverUrl = m.url; g.coverPath = m.path;
          }
          audit('game.cover', g.slug);
          return { game: out(touch(g)) };
        }
        case 'GET users': {
          const q = (u.searchParams.get('q') || '').toLowerCase();
          return { users: users.filter((x) => !q || x.tiktok.includes(q) || x.email === q).map((x) => {
            const c = JSON.parse(JSON.stringify(x));
            c.accesses = x.owned.map((slug) => ({ slug, origin: (x.origins || {})[slug] || 'purchase', since: now() }));
            delete c.origins; return c;
          }) };
        }
        case 'POST grant': {
          const x = users.find((y) => y.id === b.userId);
          if (!x) throw err('user_not_found', 'Utilisateur introuvable.');
          if (b.slug === 'pass') {
            x.pass = { active: true, plan: 'monthly', provider: 'admin', renewsAt: new Date(Date.now() + (b.days || 30) * 864e5).toISOString(), cancelAtPeriodEnd: false };
            audit('grant.pass', x.email, (b.days || 30) + ' j');
          } else {
            find(b.slug);
            if (!x.owned.includes(b.slug)) x.owned.push(b.slug);
            x.origins[b.slug] = 'admin';
            audit('grant.game', x.email, b.slug);
          }
          return { ok: true, pass: x.pass, owned: x.owned };
        }
        case 'POST revoke': {
          const x = users.find((y) => y.id === b.userId);
          if (!x) throw err('user_not_found', 'Utilisateur introuvable.');
          if (b.slug === 'pass') {
            const paid = x.pass.provider && x.pass.provider !== 'admin';
            if (paid && b.mode !== 'period_end' && b.mode !== 'now') throw err('paid_subscription', 'Ce Game Pass est un abonnement payant : choisissez « fin de période » ou « maintenant » (mode), ou résiliez-le depuis Stripe ou PayPal.');
            if (paid && b.mode === 'period_end') { x.pass.cancelAtPeriodEnd = true; audit('revoke.pass.paid.period_end', x.email, x.pass.provider); }
            else { x.pass = { active: false, plan: null, provider: null, renewsAt: null, cancelAtPeriodEnd: false }; audit(paid ? 'revoke.pass.paid.now' : 'revoke.pass', x.email, paid ? b.provider : undefined); }
          } else {
            if (!x.owned.includes(b.slug)) {
              if (x.pass.active) throw err('access_from_pass', 'Ce joueur accède à ce jeu via son Game Pass, pas via un achat : retirez ou résiliez son Game Pass (Stripe / PayPal s\'il est payant) pour couper l\'accès.');
              throw err('not_owned', 'Ce joueur ne possède pas ce jeu.');
            }
            x.owned = x.owned.filter((s) => s !== b.slug); delete x.origins[b.slug]; audit('revoke.game', x.email, b.slug);
            if (x.pass.active) return { ok: true, pass: x.pass, owned: x.owned, stillViaPass: true };
          }
          return { ok: true, pass: x.pass, owned: x.owned };
        }
        case 'POST users :slug devices :id': {
          const x = users.find((y) => y.id === seg[1]);
          if (!x) throw err('user_not_found', 'Utilisateur introuvable.');
          const n = x.devices; x.devices = 0; audit('user.devices.reset', x.email, n + ' appareil(s)');
          return { ok: true, removed: n };
        }
        case 'GET stats': {
          // Démo : toutes les données sont « avant » une remise à zéro éventuelle ; les paiements sont encore en mode test (bandeau affiché)
          const on = !statsSince;
          const pool = users.filter((x) => x.role !== 'admin' && !x.isTest);
          const sales = Object.fromEntries(games.map((g) => [g.slug, on ? users.filter((x) => x.owned.includes(g.slug) && (x.origins || {})[g.slug] !== 'admin').length : 0]));
          const plan = (p) => (on ? pool.filter((x) => x.pass.active && x.pass.plan === p).length : 0);
          const revenue = 30 * plan('monthly') + 40 * Object.values(sales).reduce((a, c) => a + c, 0);
          const gifted = Object.fromEntries(games.map((g) => [g.slug, on ? users.filter((x) => (x.origins || {})[g.slug] === 'admin').length : 0]));
          return {
            users: on ? pool.length : 0, activePasses: { monthly: plan('monthly'), yearly: plan('yearly') }, passesTotal: plan('monthly') + plan('yearly'), giftedPasses: 0,
            lifetimeSales: Object.fromEntries(games.filter((g) => !g.free).map((g) => [g.slug, sales[g.slug]])), lifetimeDownloads: Object.fromEntries(games.filter((g) => g.free).map((g) => [g.slug, on ? 42 : 0])), revenueMonthEur: revenue, revenueTotalEur: revenue, gifts: { passes: 0, games: Object.values(gifted).reduce((a, c) => a + c, 0) },
            statsSince, currentPaymentMode: { stripe: 'test', paypal: 'test' },
            games: sorted().map((g) => (g.free ? { slug: g.slug, name: g.name, status: g.status, kind: g.kind, free: true, priceCents: 0, downloads: on ? 42 : 0 } : { slug: g.slug, name: g.name, status: g.status, kind: g.kind, free: false, priceCents: g.priceCents, sales: sales[g.slug], granted: gifted[g.slug] }))
          };
        }
        case 'POST stats :slug': {
          if (seg[1] !== 'reset') break;
          statsSince = new Date().toISOString(); audit('stats.reset', null, statsSince);
          return { ok: true, statsSince };
        }
        case 'POST users :slug test-flag': {
          const x = users.find((y) => y.id === seg[1]);
          if (!x) throw err('user_not_found', 'Utilisateur introuvable.');
          if (typeof b.isTest !== 'boolean') throw err('invalid_flag', 'isTest doit être vrai ou faux.');
          x.isTest = b.isTest; audit(b.isTest ? 'user.test-flag.on' : 'user.test-flag.off', x.email);
          return { ok: true, isTest: x.isTest };
        }
        case 'GET games :slug firestore': return { firestore: fsCounts(find(seg[1]).slug) };
        case 'PUT games :slug firestore': {
          const g = find(seg[1]);
          const k = b.serviceAccount;
          if (k !== undefined) {
            if (!k || typeof k !== 'object' || typeof k.client_email !== 'string' || typeof k.private_key !== 'string' || typeof k.project_id !== 'string') throw err('invalid_service_account', 'Clé invalide : « client_email », « project_id » et « private_key » sont attendus.');
            g.firestore = { configured: true, enabled: g.firestore.enabled, projectId: k.project_id, collection: g.firestore.collection || 'streamers', clientEmail: k.client_email };
          }
          if (!g.firestore.configured) throw err('invalid_service_account', 'Choisissez d\'abord le fichier .json de la clé du compte de service.');
          if (b.collection !== undefined) { if (!/^[A-Za-z0-9_-]{1,100}$/.test(b.collection)) throw err('invalid_field', 'Nom de collection invalide (lettres, chiffres, _ et -).'); g.firestore.collection = b.collection; }
          if (b.enabled !== undefined) g.firestore.enabled = b.enabled === true;
          audit('firestore.set', g.slug, g.firestore.projectId + '/' + g.firestore.collection);
          return { firestore: fsCounts(g.slug), game: out(g) };
        }
        case 'DELETE games :slug firestore': {
          const g = find(seg[1]);
          g.firestore = { configured: false, enabled: false }; delete fsMeta[g.slug];
          users.forEach((u) => { u.firestore = u.firestore.filter((r) => r.slug !== g.slug); });
          audit('firestore.remove', g.slug);
          return { ok: true, firestore: fsCounts(g.slug), game: out(g) };
        }
        case 'POST games :slug firestore :id': {
          const g = find(seg[1]);
          if (!g.firestore.configured) throw err('firestore_not_configured', 'Firestore n\'est pas configuré pour ce jeu.');
          if (seg[3] === 'test') { audit('firestore.test', g.slug, 'ok'); return { ok: true, message: 'Connexion réussie : la collection « ' + g.firestore.collection + ' » est accessible.' }; }
          if (seg[3] === 'import') {
            const count = 120 + g.slug.length * 7, manual = count - 6;
            fsMeta[g.slug] = { importedAt: now(), count, manual };
            audit('firestore.import', g.slug, count + ' accès');
            return { count, manual, store: count - manual, importedAt: Date.now(), firestore: fsCounts(g.slug) };
          }
          break;
        }
        case 'POST legacy :slug': {
          if (seg[1] !== 'claim') break;
          const x = users.find((y) => y.id === b.userId);
          if (!x) throw err('user_not_found', 'Utilisateur introuvable.');
          find(b.slug);
          const l = x.legacy.find((r) => r.slug === b.slug);
          if (!l) throw err('unknown_legacy', 'Cet accès n\'a pas été importé : lancez d\'abord « Importer les accès existants ».');
          l.claimed = true;
          if (b.grant === 'lifetime' && !x.owned.includes(b.slug)) { x.owned.push(b.slug); x.origins[b.slug] = 'legacy'; }
          audit('legacy.claim', x.email, b.slug + ' @' + x.tiktok);
          return { ok: true, pass: x.pass, owned: x.owned };
        }
        case 'GET gamehub :slug': { // /admin/gamehub/games
          const list = [{ id: 'pop-riot', name: 'Pop Riot' }, { id: 'paintball-master', name: 'Paintball Master' }, { id: 'bgu', name: 'Boys & Girls Ultimate' }];
          return { configured: true, url: 'https://hub.dupas.pro', games: list, mapping: Object.fromEntries(games.map((g) => [g.slug, g.gamehubId === '-' ? null : g.gamehubId || (list.find((x) => x.id === g.slug) || {}).id || null])), error: null };
        }
        case 'POST gamehub :slug': { // /admin/gamehub/resync-all
          if (seg[1] !== 'resync-all') break;
          users.forEach((x) => (x.gamehub || []).forEach((r) => { r.state = r.state === 'error' ? 'synced' : r.state; r.lastError = null; r.syncedAt = now(); }));
          audit('gamehub.resync-all', null, users.length + ' joueur(s)');
          return { ok: true, users: users.length, errors: 0 };
        }
        case 'POST users :slug gamehub :id': {
          const x = users.find((y) => y.id === seg[1]);
          if (!x) throw err('user_not_found', 'Utilisateur introuvable.');
          (x.gamehub || []).forEach((r) => { r.state = r.state === 'error' ? 'synced' : r.state; r.lastError = null; r.syncedAt = now(); });
          audit('gamehub.resync', x.email);
          return { ok: true, gamehub: JSON.parse(JSON.stringify(x.gamehub || [])) };
        }
        case 'POST users :slug firestore :id': {
          const x = users.find((y) => y.id === seg[1]);
          if (!x) throw err('user_not_found', 'Utilisateur introuvable.');
          x.firestore.forEach((r) => { r.state = r.state === 'error' ? 'synced' : r.state; r.lastError = null; r.syncedAt = now(); });
          audit('firestore.resync', x.email);
          return { ok: true, firestore: JSON.parse(JSON.stringify(x.firestore)) };
        }
        case 'GET payments :slug': return payStatus(); // /admin/payments/status
        case 'POST payments :slug': { // /admin/payments/setup
          pay.done = true; pay.lastRun = new Date().toISOString();
          audit('payments.setup');
          return payStatus();
        }
        case 'GET log': return { log: log.slice(0, 200) };
        default: break;
      }
      throw err('not_found', 'Route introuvable.');
    }

    // Fichiers « envoyés » : on garde l'URL locale (file:// ou blob:) sans rien téléverser.
    function addMedia(slug, { name, type, url }) {
      const g = find(slug);
      if (g.media.length >= 40) throw err('too_many_media', '40 médias maximum par jeu.');
      const item = { id: rid(), type: type === 'video' ? 'video' : 'image', url, path: url, caption: '' };
      g.media.push(item);
      if (item.type === 'image' && !g.coverUrl) { g.coverUrl = url; g.coverPath = url; }
      audit('media.add', slug, item.type + ' ' + name);
      return { item: out(item), game: out(touch(g)) };
    }
    function setBuild(slug, { name, size, version, exe }) {
      const g = find(slug);
      if (version) g.version = version;
      g.sizeMb = Math.max(1, Math.ceil(size / 1048576));
      const isExe = /\.exe$/i.test(name);
      g.download = { ...g.download, kind: isExe ? 'installer' : 'portable', exeCandidates: isExe ? [name] : [g.download.exe || 'Jeu.exe', 'Launcher.exe'], mode: 'upload', hasBuild: true, size, uploadedAt: Date.now(), originalName: name, sha256: Array.from({ length: 8 }, rid).join('').slice(0, 64), ...(exe ? { exe } : {}) };
      audit('game.build', slug, g.version);
      return { game: out(touch(g)) };
    }
    return { handle, addMedia, setBuild };
  }

  const api = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PapouthAdminDemo = api;
})(typeof window !== 'undefined' ? window : globalThis);
