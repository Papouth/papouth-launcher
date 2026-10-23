'use strict';
// Simule window.alien dans un navigateur ordinaire (captures d'écran, dev UI).
(function () {
  const q = new URLSearchParams(location.search);
  const L = (fr, en, es, th, ms) => ({ fr, en, es, th, ms });
  const BASE = [
    { slug: 'paintball-master', name: 'Paintball Master', accent: '#FF3D7F', price: 40, version: '1.2.0', sizeMb: 180,
      tagline: L('Vos viewers repeignent l\'écran à coups de cadeaux.', 'Your viewers repaint the screen, gift after gift.', 'Tus espectadores repintan la pantalla a golpe de regalos.', 'ผู้ชมสาดสีทั่วหน้าจอด้วยของขวัญ', 'Penonton anda mengecat semula skrin dengan hadiah.'),
      description: L('Un jeu de peinture interactif pour TikTok LIVE.', 'An interactive paint game for TikTok LIVE.', 'Un juego de pintura interactivo para TikTok LIVE.', 'เกมสาดสีแบบอินเตอร์แอคทีฟสำหรับ TikTok LIVE', 'Permainan cat interaktif untuk TikTok LIVE.') },
    { slug: 'pop-riot', name: 'Pop Riot', accent: '#FFC400', price: 40, version: '1.0.3', sizeMb: 120,
      tagline: L('Des ballons à faire éclater en direct.', 'Balloons to pop live.', 'Globos para reventar en directo.', 'ลูกโป่งให้ยิงแตกสด ๆ', 'Belon untuk dipecahkan secara langsung.'),
      description: L('Chaque cadeau lance une vague de ballons.', 'Every gift launches a wave of balloons.', 'Cada regalo lanza una oleada de globos.', 'ของขวัญทุกชิ้นปล่อยลูกโป่งออกมาเป็นระลอก', 'Setiap hadiah melancarkan gelombang belon.') },
    { slug: 'boys-girls-ultimate', name: 'Boys&Girls Ultimate', accent: '#2E6BFF', price: 40, version: '2.0.0', sizeMb: 210,
      tagline: L('Garçons contre filles, le chat décide.', 'Boys vs girls, the chat decides.', 'Chicos contra chicas, el chat decide.', 'ชายปะทะหญิง แชตเป็นผู้ตัดสิน', 'Lelaki lawan perempuan, sembang yang menentukan.'),
      description: L('Plusieurs modes de duel entre les deux camps.', 'Several duel modes between the two sides.', 'Varios modos de duelo entre los dos bandos.', 'หลายโหมดดวลกันระหว่างสองฝ่าย', 'Beberapa mod duel antara kedua-dua pihak.') }
  ];
  BASE.push({ slug: 'overlay-forge', name: 'Overlay Forge', kind: 'software', free: true, accent: '#19B38A', price: 0, version: '1.0.0', sizeMb: 60,
    tagline: L('Créez vos overlays TikTok LIVE, gratuitement.', 'Build your TikTok LIVE overlays, for free.', 'Crea tus overlays de TikTok LIVE, gratis.', 'สร้างโอเวอร์เลย์ TikTok LIVE ได้ฟรี', 'Cipta overlay TikTok LIVE anda, percuma.'),
    description: L('Un outil gratuit pour fabriquer des overlays de cadeaux et d\'actions pour vos jeux.', 'A free tool to build gift and action overlays for your games.', 'Una herramienta gratuita para crear overlays de regalos y acciones para tus juegos.', 'เครื่องมือฟรีสำหรับสร้างโอเวอร์เลย์ของขวัญและแอ็กชันสำหรับเกมของคุณ', 'Alat percuma untuk mencipta overlay hadiah dan tindakan untuk permainan anda.') });
  const EXTRA = {
    needs: L('TikFinity (gratuit)', 'TikFinity (free)', 'TikFinity (gratis)', 'TikFinity (ฟรี)', 'TikFinity (percuma)'),
    features: [
      L('Les cadeaux déclenchent des actions via les webhooks TikFinity', 'Gifts trigger actions through TikFinity webhooks', 'Los regalos activan acciones mediante los webhooks de TikFinity', 'ของขวัญสั่งการแอ็กชันผ่านเว็บฮุคของ TikFinity', 'Hadiah mencetuskan tindakan melalui webhook TikFinity'),
      L('Versus 1 contre 1 entre deux streamers', '1v1 Versus between two streamers', 'Versus 1 contra 1 entre dos streamers', 'โหมดแข่งตัวต่อตัวระหว่างสตรีมเมอร์สองคน', 'Versus 1 lawan 1 antara dua penstrim'),
      L('Noms des donateurs affichés à l\'écran', 'Donor names displayed on screen', 'Nombres de los donantes en pantalla', 'แสดงชื่อผู้ส่งของขวัญบนหน้าจอ', 'Nama penderma dipaparkan pada skrin'),
      L('Interface multilingue : FR, EN, ES, TH, MS', 'Multilingual interface: FR, EN, ES, TH, MS', 'Interfaz multilingüe: FR, EN, ES, TH, MS', 'อินเทอร์เฟซหลายภาษา: FR, EN, ES, TH, MS', 'Antara muka berbilang bahasa: FR, EN, ES, TH, MS'),
      L('Mises à jour automatiques via le launcher', 'Automatic updates through the launcher', 'Actualizaciones automáticas desde el launcher', 'อัปเดตอัตโนมัติผ่านแลนเชอร์', 'Kemas kini automatik melalui pelancar')],
    howItWorks: [
      L('Lancez le jeu depuis le launcher.', 'Launch the game from the launcher.', 'Inicia el juego desde el launcher.', 'เปิดเกมจากแลนเชอร์', 'Lancarkan permainan dari pelancar.'),
      L('Connectez TikFinity et associez vos cadeaux.', 'Connect TikFinity and link your gifts.', 'Conecta TikFinity y asocia tus regalos.', 'เชื่อมต่อ TikFinity แล้วผูกของขวัญของคุณ', 'Sambungkan TikFinity dan kaitkan hadiah anda.'),
      L('Passez en direct, les cadeaux jouent pour vous.', 'Go live and let the gifts play for you.', 'Empieza el directo y deja que los regalos jueguen por ti.', 'เริ่มไลฟ์ แล้วให้ของขวัญเล่นแทนคุณ', 'Mulakan siaran langsung, hadiah bermain untuk anda.')]
  };
  const pick = (v, lang) => v[lang] || v.fr;
  function gamesFor(lang) {
    return BASE.map((g) => ({
      kind: 'game', free: false, inPass: !g.free, ...g, tagline: pick(g.tagline, lang), description: pick(g.description, lang), image: '', media: [],
      requirements: { os: 'Windows 10/11', needs: pick(EXTRA.needs, lang) },
      languages: ['Français', 'English', 'Español', 'ไทย', 'Bahasa Melayu'],
      features: EXTRA.features.map((x) => pick(x, lang)), howItWorks: EXTRA.howItWorks.map((x) => pick(x, lang))
    }));
  }
  
  const games = gamesFor(window.I18N.lang());
  // Médias de démo : fichiers locaux demo-media/<slug>/01.jpg… (+ trailer.mp4) s'ils existent, sinon vide.
  const probe = (u) => new Promise((res) => { const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = u; });
  const DEMO_MEDIA = { 'paintball-master': [{ type: 'video', url: 'trailer.mp4', thumb: 'trailer-poster.jpg' }, { type: 'image', url: '00-cover.jpg' }, { type: 'image', url: '01.jpg' }, { type: 'image', url: '02.jpg' }, { type: 'image', url: '03.jpg' }, { type: 'image', url: '04.jpg' }], 'pop-riot': [{ type: 'video', url: 'trailer.mp4', thumb: 'trailer-poster.jpg' }, { type: 'image', url: '00-cover.jpg' }, { type: 'image', url: '01.jpg' }, { type: 'image', url: '02.jpg' }, { type: 'image', url: '03.jpg' }, { type: 'image', url: '04.jpg' }], 'boys-girls-ultimate': [{ type: 'image', url: '00-cover.jpg' }] };
  async function loadMedia() {
    for (const g of games) {
      const list = DEMO_MEDIA[g.slug] || [];
      g.media = list.map((m) => ({ ...m, url: 'demo-media/' + g.slug + '/' + m.url, ...(m.thumb ? { thumb: 'demo-media/' + g.slug + '/' + m.thumb } : {}) }));
      if (list.length) g.image = 'demo-media/' + g.slug + '/00-cover.jpg';
    }
  }
  const hasPass = q.get('pass') === '1';
  let ent = {
    pass: hasPass ? { active: true, plan: 'yearly', provider: q.get('provider') || 'stripe', renewsAt: '2027-03-14T00:00:00Z', cancelAtPeriodEnd: q.get('cancelled') === '1' } : { active: false, plan: null, provider: null, renewsAt: null, cancelAtPeriodEnd: false },
    owned: hasPass ? [] : ['pop-riot'],
    access: hasPass ? games.map((g) => g.slug) : ['pop-riot', 'overlay-forge']
  };
  let obtained = q.get('obtained') === '1' ? ['overlay-forge'] : [];
  let installed = hasPass ? { 'paintball-master': { version: '1.0.0', exe: 'a.exe', path: 'C:\\Papouth\\Games\\paintball-master' }, 'pop-riot': { version: '1.0.3', exe: 'a.exe', path: 'C:\\x' } } : { 'pop-riot': { version: '1.0.3', exe: 'a.exe', path: 'C:\\x' } };
  const listeners = { p: [], g: [], u: [], a: [], d: [] };
  const jobsMock = {}; let jobN = 0;
  const R = (d) => Promise.resolve({ ok: true, data: d });
  const user = { id: '1', email: 'demo@papouth.com', tiktok: 'papouth_demo', role: q.get('admin') === '1' ? 'admin' : 'player' };
  // Faux backend admin en mémoire (admin-demo.js) ; les fichiers « envoyés » deviennent des object URLs.
  const withMedia = (gs) => gs.map((g) => { const list = DEMO_MEDIA[g.slug] || []; return { ...g, media: list.map((x) => ({ ...x, url: 'demo-media/' + g.slug + '/' + x.url, ...(x.thumb ? { thumb: 'demo-media/' + g.slug + '/' + x.thumb } : {}) })), image: list.length ? 'demo-media/' + g.slug + '/00-cover.jpg' : '' }; });
  let demoAdmin = null;
  const da = () => demoAdmin || (demoAdmin = window.PapouthAdminDemo.create({ gamesFor: (l) => withMedia(gamesFor(l)), langs: ['fr', 'en', 'es', 'th', 'ms'] }));
  const wrapE = (fn) => { try { return R(fn()); } catch (e) { return Promise.resolve({ ok: false, error: { code: e.code || 'error', message: e.message } }); } };
  const files = new Map(); let fseq = 0;
  const infoOf = (p) => { const f = files.get(p); if (!f) return null; const ext = (f.name.split('.').pop() || '').toLowerCase(); const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4', zip: 'application/zip', exe: 'application/octet-stream' }[ext] || ''; return { path: p, name: f.name, size: f.size, mime, kind: mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'image' : ext === 'zip' ? 'zip' : ext === 'exe' ? 'exe' : ext === 'json' ? 'json' : 'other' }; };
  const regFile = (f) => { const p = 'mock:' + (++fseq); files.set(p, f); return p; };
  const adminApi = {
    call: (method, path, body) => wrapE(() => da().handle(method, path, body)),
    pick: (kind) => new Promise((res) => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = kind === 'media'; inp.accept = kind === 'media' ? '.jpg,.jpeg,.png,.webp,.mp4' : kind === 'json' ? '.json' : '.zip,.exe';
      inp.onchange = () => res({ ok: true, data: [...inp.files].map((f) => infoOf(regFile(f))) }); inp.click();
    }),
    fileInfo: (paths) => R(paths.map(infoOf).filter(Boolean)),
    pathFor: (f) => regFile(f),
    upload: async ({ slug, kind, path, id, version, exe }) => {
      const f = files.get(path), info = infoOf(path);
      for (let i = 1; i <= 8; i++) { listeners.a.forEach((fn) => fn({ id, pct: i / 8 })); await new Promise((r) => setTimeout(r, 90)); }
      if (kind === 'build') return wrapE(() => da().setBuild(slug, { name: info.name, size: info.size, version, exe }));
      // Images : data: URL (autorisé par la CSP) ; vidéos : object URL
      const url = info.kind === 'image' ? await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); }) : URL.createObjectURL(f);
      return wrapE(() => da().addMedia(slug, { name: info.name, type: info.kind, url }));
    },
    firestoreKey: async ({ slug, path, collection, enabled }) => {
      let key; try { key = JSON.parse(await files.get(path).text()); } catch (_) { return { ok: false, error: { code: 'invalid_service_account', message: 'JSON invalide' } }; }
      return wrapE(() => da().handle('PUT', '/admin/games/' + slug + '/firestore', { serviceAccount: key, ...(collection ? { collection } : {}), ...(typeof enabled === 'boolean' ? { enabled } : {}) }));
    },
    onProgress: (fn) => { listeners.a.push(fn); return () => {}; }
  };
  window.alien = {
    admin: adminApi,
    getState: () => R({ loggedIn: q.get('view') !== 'auth', user, demo: true, reachable: true, demoAvailable: true, dev: q.get('dev') === '1', apiUrl: 'https://papouth.dupas.pro/api/store', version: '1.0.0' }),
    login: () => R({ user }), register: () => R({ user }), logout: () => R(true), startDemo: () => R({ user }),
    catalog: async (lang) => {
      const gs = gamesFor(lang || 'fr'); games.splice(0, games.length, ...gs); await loadMedia();
      const fs = q.get('featured'); // ?featured=<slug> : ce jeu est « à la une » (placé en premier, comme l'API)
      const fi = games.findIndex((g) => g.slug === fs);
      if (fi >= 0) { games[fi].featured = true; games[fi].featuredText = q.get('ftext') || games[fi].tagline; games.unshift(...games.splice(fi, 1)); }
      return { ok: true, data: { games } };
    }, entitlements: () => R(ent),
    library: () => R({ obtained }), libraryAdd: (slug) => { if (!obtained.includes(slug)) obtained = [...obtained, slug]; return R({ ok: true, obtained }); },
    checkout: () => R({ url: null }),
    promoCheck: (code, product) => {
      if (String(code).toUpperCase() !== 'BIENVENUE20') return Promise.resolve({ ok: false, error: { code: 'promo_unknown', message: 'Code inconnu' } });
      const o = product === 'pass_monthly' ? 30 : product === 'pass_yearly' ? 240 : 40;
      return R({ ok: true, code: 'BIENVENUE20', label: '-20 %', product, originalPrice: o, finalPrice: o * 0.8, free: false, firstPaymentOnly: product !== 'game', regularPrice: o });
    },
    billingPortal: () => R({ url: null }),
    cancelSubscription: () => { ent = { ...ent, pass: { ...ent.pass, cancelAtPeriodEnd: true } }; return R({ pass: ent.pass }); },
    resumeSubscription: () => {
      if (ent.pass.provider === 'paypal') return Promise.resolve({ ok: false, error: { code: 'resume_requires_new_subscription', message: 'PayPal' } });
      ent = { ...ent, pass: { ...ent.pass, cancelAtPeriodEnd: false } }; return R({ pass: ent.pass });
    },
    device: () => R({ device: { id: 'd1', name: 'DESKTOP-PAPOUTH', registeredAt: new Date(Date.now() - 12 * 864e5).toISOString(), lastSeenAt: new Date().toISOString() }, canTransfer: true, nextTransferAt: null }),
    transferDevice: () => R({ ok: true, nextTransferAt: new Date(Date.now() + 30 * 864e5).toISOString() }),
    installed: () => R(installed), running: () => R([]),
    install: async (slug) => {
      const g = games.find((x) => x.slug === slug);
      if (jobsMock[slug]) return R({ jobId: jobsMock[slug].id, already: true });
      const job = jobsMock[slug] = { id: ++jobN, cancelled: false };
      (async () => {
        const total = (g.sizeMb || 100) * 1048576;
        const ev = (o) => listeners.p.forEach((f) => f({ slug, jobId: job.id, ...o }));
        ev({ stage: 'prepare', pct: null }); await new Promise((r) => setTimeout(r, 400));
        ev({ stage: 'download', pct: 0, bytes: 0, total });
        let bytes = 0;
        while (bytes < total && !job.cancelled) {
          await new Promise((r) => setTimeout(r, 250)); bytes = Math.min(total, bytes + 3 * 1048576);
          ev({ stage: 'download', bytes, total, pct: bytes / total, speed: 12 * 1048576, eta: Math.round((total - bytes) / (12 * 1048576)) });
        }
        if (!job.cancelled) { ev({ stage: 'extract', pct: null }); await new Promise((r) => setTimeout(r, 1500)); }
        delete jobsMock[slug];
        if (job.cancelled) return listeners.d.forEach((f) => f({ slug, jobId: job.id, ok: false, error: { code: 'cancelled', message: 'annulé' } }));
        installed[slug] = { version: g.version, exe: 'a.exe', path: 'C:\\x' };
        listeners.d.forEach((f) => f({ slug, jobId: job.id, ok: true, entry: installed[slug] }));
      })();
      return R({ jobId: job.id });
    },
    cancelInstall: (slug) => { if (jobsMock[slug]) jobsMock[slug].cancelled = true; return R(true); },
    onDone: (f) => { listeners.d.push(f); return () => {}; },
    onAccessChanged: () => () => {}, onAccessRevoked: () => () => {},
    uninstall: (s) => { delete installed[s]; return R(true); },
    play: (slug) => { listeners.g.forEach((f) => f({ slug, running: true })); setTimeout(() => listeners.g.forEach((f) => f({ slug, running: false })), 5000); return R(true); },
    openFolder: () => R(true),
    getSettings: () => R({ apiUrl: 'https://papouth.dupas.pro/api/store', defaultApiUrl: 'https://papouth.dupas.pro/api/store', version: '1.0.0' }),
    setApiUrl: () => R({}), restartToUpdate: () => R(true),
    onProgress: (f) => { listeners.p.push(f); return () => {}; },
    onGameState: (f) => { listeners.g.push(f); return () => {}; },
    onUpdate: (f) => { listeners.u.push(f); if (q.get('update')) setTimeout(() => f({ state: 'ready', version: '1.1.0' }), 500); return () => {}; }
  };
})();
