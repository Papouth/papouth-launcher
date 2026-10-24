'use strict';
// Moteur i18n : dictionnaires chargés depuis i18n/<lang>.js (même origine, CSP stricte). API : window.I18N.
(function () {
  const D = window.PAPOUTH_I18N || {};
  const KEY = 'papouth-lang';
  const LANGS = [
    { code: 'fr', name: 'Français', locale: 'fr-FR' },
    { code: 'en', name: 'English', locale: 'en-GB' },
    { code: 'es', name: 'Español', locale: 'es-ES' },
    { code: 'th', name: 'ไทย', locale: 'th-TH' },
    { code: 'ms', name: 'Bahasa Melayu', locale: 'ms-MY' },
    { code: 'de', name: 'Deutsch', locale: 'de-DE' }
  ];
  const codes = LANGS.map((l) => l.code);
  // fr->fr, es->es, th->th, de (de-AT, de-CH...)->de, ms/id->ms, sinon en
  function fromOs(tag) {
    const c = String(tag || '').toLowerCase().split(/[-_]/)[0];
    if (c === 'fr' || c === 'es' || c === 'th' || c === 'de') return c;
    if (c === 'ms' || c === 'id') return 'ms';
    return 'en';
  }
  function initial() {
    const q = new URLSearchParams(location.search).get('lang');
    if (q && codes.includes(q)) return q;
    try { const v = localStorage.getItem(KEY); if (codes.includes(v)) return v; } catch (e) { /* ignore */ }
    return fromOs(navigator.language);
  }
  let cur = initial();
  document.documentElement.lang = cur;
  const meta = () => LANGS.find((l) => l.code === cur);
  function t(key, params) {
    let s = (D[cur] && D[cur][key]);
    if (s == null) s = D.fr && D.fr[key];
    if (s == null) return key;
    return params ? s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? params[k] : m)) : s;
  }
  function setLang(code) {
    if (!codes.includes(code)) return;
    cur = code;
    document.documentElement.lang = code;
    try { localStorage.setItem(KEY, code); } catch (e) { /* ignore */ }
  }
  const has = (key) => !!(D[cur] && D[cur][key]) || !!(D.fr && D.fr[key]);
  function date(d) {
    if (!d) return '—';
    try { return new Intl.DateTimeFormat(meta().locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d)); } catch (e) { return String(d); }
  }
  function price(n) {
    try { return new Intl.NumberFormat(meta().locale, { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n); } catch (e) { return n + ' €'; }
  }
  function num(n) {
    try { return new Intl.NumberFormat(meta().locale, { maximumFractionDigits: 0 }).format(n); } catch (e) { return String(n); }
  }
  window.I18N = { t, setLang, lang: () => cur, langs: LANGS, has, date, price, num };
})();
