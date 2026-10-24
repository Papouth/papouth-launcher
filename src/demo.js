'use strict';
// Données factices pour le mode démo (sans backend), localisées { fr, en, es, th, ms, de } (de ajouté plus bas ; repli fr).
const L = (fr, en, es, th, ms, de) => (de === undefined ? { fr, en, es, th, ms } : { fr, en, es, th, ms, de });
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
// Logiciel gratuit de démonstration (accessible à tous, hors Game Pass)
BASE.push({ slug: 'overlay-forge', name: 'Overlay Forge', kind: 'software', free: true, accent: '#19B38A', price: 0, version: '1.0.0', sizeMb: 60,
  tagline: L('Créez vos overlays TikTok LIVE, gratuitement.', 'Build your TikTok LIVE overlays, for free.', 'Crea tus overlays de TikTok LIVE, gratis.', 'สร้างโอเวอร์เลย์ TikTok LIVE ได้ฟรี', 'Cipta overlay TikTok LIVE anda, percuma.'),
  description: L('Un outil gratuit pour fabriquer des overlays de cadeaux et d\'actions pour vos jeux.', 'A free tool to build gift and action overlays for your games.', 'Una herramienta gratuita para crear overlays de regalos y acciones para tus juegos.', 'เครื่องมือฟรีสำหรับสร้างโอเวอร์เลย์ของขวัญและแอ็กชันสำหรับเกมของคุณ', 'Alat percuma untuk mencipta overlay hadiah dan tindakan untuk permainan anda.') });
const EXTRA = {
  needs: L('TikFinity (gratuit)', 'TikFinity (free)', 'TikFinity (gratis)', 'TikFinity (ฟรี)', 'TikFinity (percuma)', 'TikFinity (kostenlos)'),
  features: [
    L('Les cadeaux déclenchent des actions via les webhooks TikFinity', 'Gifts trigger actions through TikFinity webhooks', 'Los regalos activan acciones mediante los webhooks de TikFinity', 'ของขวัญสั่งการแอ็กชันผ่านเว็บฮุคของ TikFinity', 'Hadiah mencetuskan tindakan melalui webhook TikFinity'),
    L('Versus 1 contre 1 entre deux streamers', '1v1 Versus between two streamers', 'Versus 1 contra 1 entre dos streamers', 'โหมดแข่งตัวต่อตัวระหว่างสตรีมเมอร์สองคน', 'Versus 1 lawan 1 antara dua penstrim'),
    L('Noms des donateurs affichés à l\'écran', 'Donor names displayed on screen', 'Nombres de los donantes en pantalla', 'แสดงชื่อผู้ส่งของขวัญบนหน้าจอ', 'Nama penderma dipaparkan pada skrin'),
    L('Interface multilingue : FR, EN, ES, TH, MS, DE', 'Multilingual interface: FR, EN, ES, TH, MS, DE', 'Interfaz multilingüe: FR, EN, ES, TH, MS, DE', 'อินเทอร์เฟซหลายภาษา: FR, EN, ES, TH, MS, DE', 'Antara muka berbilang bahasa: FR, EN, ES, TH, MS, DE'),
    L('Mises à jour automatiques via le launcher', 'Automatic updates through the launcher', 'Actualizaciones automáticas desde el launcher', 'อัปเดตอัตโนมัติผ่านแลนเชอร์', 'Kemas kini automatik melalui pelancar')],
  howItWorks: [
    L('Lancez le jeu depuis le launcher.', 'Launch the game from the launcher.', 'Inicia el juego desde el launcher.', 'เปิดเกมจากแลนเชอร์', 'Lancarkan permainan dari pelancar.'),
    L('Connectez TikFinity et associez vos cadeaux.', 'Connect TikFinity and link your gifts.', 'Conecta TikFinity y asocia tus regalos.', 'เชื่อมต่อ TikFinity แล้วผูกของขวัญของคุณ', 'Sambungkan TikFinity dan kaitkan hadiah anda.'),
    L('Passez en direct, les cadeaux jouent pour vous.', 'Go live and let the gifts play for you.', 'Empieza el directo y deja que los regalos jueguen por ti.', 'เริ่มไลฟ์ แล้วให้ของขวัญเล่นแทนคุณ', 'Mulakan siaran langsung, hadiah bermain untuk anda.')]
};
// Textes allemands de la démo (ajoutés après coup pour ne pas alourdir les appels L ci-dessus).
const DE = {
  'paintball-master': ['Deine Viewer streichen den Bildschirm neu – Geschenk für Geschenk.', 'Ein interaktives Farbspiel für TikTok LIVE.'],
  'pop-riot': ['Ballons, die du live platzen lässt.', 'Jedes Geschenk startet eine Ballonwelle.'],
  'boys-girls-ultimate': ['Jungs gegen Mädels, der Chat entscheidet.', 'Mehrere Duell-Modi zwischen den beiden Teams.'],
  'overlay-forge': ['Erstelle deine TikTok-LIVE-Overlays kostenlos.', 'Ein kostenloses Tool für Geschenke- und Aktions-Overlays für deine Spiele.']
};
for (const g of BASE) { const d = DE[g.slug]; if (d) { g.tagline.de = d[0]; g.description.de = d[1]; } }
EXTRA.features[0].de = 'Geschenke lösen Aktionen über TikFinity-Webhooks aus';
EXTRA.features[1].de = '1v1-Versus zwischen zwei Streamern';
EXTRA.features[2].de = 'Namen der Spender werden auf dem Bildschirm angezeigt';
EXTRA.features[3].de = 'Mehrsprachige Oberfläche: FR, EN, ES, TH, MS, DE';
EXTRA.features[4].de = 'Automatische Updates über den Launcher';
EXTRA.howItWorks[0].de = 'Starte das Spiel im Launcher.';
EXTRA.howItWorks[1].de = 'Verbinde TikFinity und verknüpfe deine Geschenke.';
EXTRA.howItWorks[2].de = 'Geh LIVE und lass die Geschenke für dich spielen.';
// Médias de démo : fichiers dans renderer/demo-media/<slug>/ (chemins relatifs à renderer/index.html).
const shots = (n) => Array.from({ length: n }, (_, i) => ({ type: 'image', url: '0' + (i + 1) + '.jpg' }));
const MEDIA = {
  'paintball-master': [{ type: 'video', url: 'trailer.mp4', thumb: 'trailer-poster.jpg' }, { type: 'image', url: '00-cover.jpg' }, ...shots(4)],
  'pop-riot': [{ type: 'video', url: 'trailer.mp4', thumb: 'trailer-poster.jpg' }, { type: 'image', url: '00-cover.jpg' }, ...shots(4)],
  'boys-girls-ultimate': [{ type: 'image', url: '00-cover.jpg' }]
};
const dm = (slug, f) => 'demo-media/' + slug + '/' + f;
const mediaFor = (slug) => (MEDIA[slug] || []).map((m) => ({ ...m, url: dm(slug, m.url), ...(m.thumb ? { thumb: dm(slug, m.thumb) } : {}) }));
const pick = (v, lang) => v[lang] || v.fr;
function gamesFor(lang) {
  return BASE.map((g) => ({
    kind: 'game', free: false, inPass: !g.free, ...g, tagline: pick(g.tagline, lang), description: pick(g.description, lang), image: MEDIA[g.slug] ? dm(g.slug, '00-cover.jpg') : '', media: mediaFor(g.slug),
    requirements: { os: 'Windows 10/11', needs: pick(EXTRA.needs, lang) },
    languages: ['Français', 'English', 'Español', 'ไทย', 'Bahasa Melayu', 'Deutsch'],
    features: EXTRA.features.map((x) => pick(x, lang)), howItWorks: EXTRA.howItWorks.map((x) => pick(x, lang))
  }));
}
const user = { id: 'demo', email: 'demo@papouth.com', tiktok: 'papouth_demo', createdAt: new Date().toISOString(), role: process.env.PAPOUTH_DEMO_ADMIN === '1' ? 'admin' : 'player' };
function entitlements(state) {
  return {
    pass: state.pass || { active: false, plan: null, provider: null, renewsAt: null, cancelAtPeriodEnd: false },
    owned: state.owned || [],
    access: [...new Set([...(state.pass && state.pass.active ? BASE.filter((g) => !g.free).map((g) => g.slug) : (state.owned || [])), ...BASE.filter((g) => g.free).map((g) => g.slug)])]
  };
}
module.exports = { gamesFor, user, entitlements };
