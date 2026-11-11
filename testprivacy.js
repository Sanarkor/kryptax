// node testprivacy.js — v2.64 : « Ne rien mémoriser » / « Effacer mes données » (jsdom, sans navigateur). Données FICTIVES.
// jsdom : JSDOM_PATH, sinon require('jsdom'), sinon installation globale (npm root -g).
const fs = require('fs'), R = __dirname + '/';
let JSDOM; try { JSDOM = require(process.env.JSDOM_PATH || 'jsdom').JSDOM; } catch (e) { JSDOM = require(require('child_process').execSync('npm root -g').toString().trim() + '/jsdom').JSDOM; }
let ok = true, n = 0; const chk = (c, m) => { n++; ok = ok && !!c; console.log((c ? 'OK  ' : 'ÉCHEC ') + m); };
const SCRIPTS = (fs.readFileSync(R + 'index.html', 'utf8').match(/<script src="([^"?]+)/g) || []).map(s => s.slice(13)).filter(f => !/\.min\.js$/.test(f));
function boot(pre, o) {
  o = o || {}; const html = fs.readFileSync(R + 'index.html', 'utf8').replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.invalid/kryptax/', pretendToBeVisual: true }), w = dom.window;
  w.matchMedia = q => ({ matches: false, media: q, addEventListener() {}, addListener() {} }); w.TextDecoder = TextDecoder; w.requestAnimationFrame = f => setTimeout(f, 0);
  w.confirm = () => o.confirm != null ? o.confirm : true; w.fetch = async () => { throw new Error('hors ligne'); }; w.addEventListener('error', e => e.preventDefault());
  w.HTMLCanvasElement.prototype.getContext = () => ({ measureText: () => ({ width: 10 }), getImageData: () => ({ data: [] }), fillText() {}, clearRect() {} });
  w.Range.prototype.getClientRects = () => []; w.Range.prototype.getBoundingClientRect = () => ({ width: 0, left: 0, right: 0 });
  const real = w.localStorage, realS = w.sessionStorage; for (const [k, v] of Object.entries(pre || {})) real.setItem(k, v);
  for (const f of SCRIPTS) { try { w.eval(fs.readFileSync(R + f, 'utf8')); } catch (e) { if (o.log) console.log('chargement', f, e.message); } }
  return { w, real, realS, d: w.document, snap: () => JSON.stringify(Object.fromEntries(Object.keys(real).sort().map(k => [k, real.getItem(k)]))) };
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const T0 = Date.UTC(2025, 3, 10, 12), TX = JSON.stringify([{ id: 'b0', date: Date.UTC(2025, 0, 2), type: 'BUY', asset: 'BTC', qty: 0.1, eur: 3000, fee: 0, source: 'f.csv' }, { id: 's', date: T0, type: 'SELL', asset: 'BTC', qty: 0.05, eur: 5000, fee: 0, source: 'f.csv' }, { id: 'b', date: T0 + 4000, type: 'BUY', asset: 'ETH', qty: 2, eur: 4700, fee: 0, source: 'f.csv' }]);
const act = async b => { // actions qui écrivent normalement : choix d'échange, thème, pays, langue DE/CA
  const s = b.d.querySelector('#swpend [data-swc="separate"]'); if (s) s.click(); await wait(50);
  const th = b.d.getElementById('themebtn'); if (th) th.click();
  for (const id of ['regus', 'reguk', 'regde', 'regca', 'regau', 'regfr']) { const r = b.d.getElementById(id); if (r) r.click(); await wait(20); b.d.querySelectorAll('[data-lang]').forEach(x => { if (x.offsetParent !== undefined) try { x.click(); } catch (e) {} }); await wait(20); }
  b.w.sessionStorage.setItem('kx-test', '1'); await wait(100); return !!s; };
(async () => {
  // 1) Option inactive (témoin) : les actions écrivent bien dans le vrai localStorage
  { const b = boot({ 'kryptax.tx': TX }); await wait(700); const before = b.snap(), clicked = await act(b);
    chk(clicked && before !== b.snap() && b.real.getItem('kryptax.swapChoices') && b.real.getItem('kx-region') && (b.real.getItem('kx-de-lang') || b.real.getItem('kx-ca-lang')), 'Témoin (option inactive) : les choix sont bien écrits dans localStorage');
    chk(b.d.getElementById('kxnostore') && !b.d.getElementById('kxnostore').checked && b.d.getElementById('kxclear'), 'Case « Ne rien mémoriser » et bouton « Effacer mes données » visibles'); }
  // 2) Option active : RIEN n'est écrit (localStorage, sessionStorage), indexedDB masqué ; l'appli fonctionne en mémoire vive
  { const b = boot({ 'kx-nostore': '1', 'kryptax.tx': TX, 'autre.site': 'x' }); await wait(700); const before = b.snap(), clicked = await act(b);
    chk(clicked && b.snap() === before, 'Option active : vrai localStorage strictement inchangé après choix, thème, 6 pays, langues');
    chk(b.realS.length === 0 && b.w.indexedDB === undefined, 'Option active : sessionStorage vide, indexedDB indisponible');
    chk(b.w.localStorage.getItem('kryptax.swapChoices') && b.w.localStorage.getItem('kx-region') === 'FR', 'Option active : l’appli garde ses choix en mémoire vive pendant la session');
    chk(b.d.getElementById('kxnostore').checked && !b.d.querySelector('.kxpn').hidden, 'Option active : case cochée et mention affichée'); }
  // 3) Activation avec purge acceptée : tout Kryptax effacé sauf la préférence ; autre site du même domaine intact
  { const b = boot({ 'kryptax.tx': TX, 'kx-theme': 'dark', 'kryptax.us.settings': '{}', 'autre.site': 'x' }); await wait(500); const c = b.d.getElementById('kxnostore'); c.checked = true; c.dispatchEvent(new b.w.Event('change'));
    chk(Object.keys(b.real).sort().join() === 'autre.site,kx-nostore' && b.real.getItem('kx-nostore') === '1', 'Activation + purge confirmée : seules « kx-nostore » et la clé d’un autre site restent'); }
  // 4) Activation, purge refusée : données gardées, préférence écrite
  { const b = boot({ 'kryptax.tx': TX }, { confirm: false }); await wait(500); const c = b.d.getElementById('kxnostore'); c.checked = true; c.dispatchEvent(new b.w.Event('change'));
    chk(b.real.getItem('kryptax.tx') === TX && b.real.getItem('kx-nostore') === '1', 'Activation, purge refusée : données conservées, préférence écrite'); }
  // 5) « Effacer mes données » : confirmé -> clés Kryptax supprimées (autre site gardé) ; refusé -> rien
  { const b = boot({ 'kryptax.tx': TX, 'kx-ca-lang': 'en', 'autre.site': 'x' }); await wait(500); b.d.getElementById('kxclear').click();
    chk(Object.keys(b.real).join() === 'autre.site', 'Effacer mes données (confirmé) : toutes les clés kryptax.* / kx-* supprimées, autre site intact');
    const c = boot({ 'kryptax.tx': TX }, { confirm: false }); await wait(500); c.d.getElementById('kxclear').click(); chk(c.real.getItem('kryptax.tx') === TX, 'Effacer mes données (annulé) : rien supprimé'); }
  // 6) Désactivation : les données de la session sont enregistrées, la préférence est retirée
  { const b = boot({ 'kx-nostore': '1' }); await wait(500); b.w.localStorage.setItem('kryptax.manual', '{"A":1}'); const c = b.d.getElementById('kxnostore'); c.checked = false; c.dispatchEvent(new b.w.Event('change'));
    chk(b.real.getItem('kx-nostore') === null && b.real.getItem('kryptax.manual') === '{"A":1}', 'Désactivation : préférence retirée, données de session enregistrées'); }
  // 7) Langues : FR / EN (U.S., U.K., Australie, Canada EN) / DE, libellés suivant le sélecteur de langue existant
  { const b = boot({}); await wait(500); const lab = () => b.d.querySelector('#kxpriv .kxpo').textContent + ' | ' + b.d.getElementById('kxclear').textContent, out = {};
    for (const id of ['regfr', 'regus', 'reguk', 'regau', 'regde', 'regca']) { b.d.getElementById(id).click(); await wait(30); out[id] = b.d.documentElement.lang + ':' + lab(); }
    chk(/^fr:Ne rien mémoriser \| Effacer mes données$/.test(out.regfr) && /^en:Don’t remember anything \| Clear my data$/.test(out.regus) && /^en:/.test(out.reguk) && /^en:/.test(out.regau) && /^de:Nichts speichern \| Meine Daten löschen$/.test(out.regde) && /^fr:Ne rien/.test(out.regca), '6 pays : libellés FR / EN / DE [' + Object.values(out).join(' ; ') + ']');
    b.d.documentElement.lang = 'en'; await wait(30); chk(/Clear my data/.test(lab()), 'Bascule de langue : libellés mis à jour'); }
  console.log(ok ? 'testprivacy : tout est OK (' + n + ')' : 'testprivacy : ÉCHEC'); process.exit(ok ? 0 : 1);
})();
