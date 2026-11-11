// node testswapui.js — v2.65 : interface des rapprochements (jsdom, sans navigateur). Données FICTIVES.
// Bandeau « Résultat provisoire », compteur de cessions provisoires, « Tout confirmer comme échanges » (avec confirmation),
// liste à confirmer visible, relevés déjà importés reconnus sans réimport.
const fs = require('fs'), R = __dirname + '/';
let JSDOM; try { JSDOM = require(process.env.JSDOM_PATH || 'jsdom').JSDOM; } catch (e) { JSDOM = require(require('child_process').execSync('npm root -g').toString().trim() + '/jsdom').JSDOM; }
let ok = true, n = 0; const chk = (c, m) => { n++; ok = ok && !!c; console.log((c ? 'OK  ' : 'ÉCHEC ') + m); };
const SCRIPTS = (fs.readFileSync(R + 'index.html', 'utf8').match(/<script src="([^"?]+)/g) || []).map(s => s.slice(13)).filter(f => !/\.min\.js$/.test(f));
function boot(pre, o) {
  o = o || {}; const html = fs.readFileSync(R + 'index.html', 'utf8').replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.invalid/kryptax/', pretendToBeVisual: true }), w = dom.window;
  w.matchMedia = q => ({ matches: false, media: q, addEventListener() {}, addListener() {} }); w.TextDecoder = TextDecoder; w.requestAnimationFrame = f => setTimeout(f, 0);
  const B = { asked: 0, answer: true }; w.confirm = () => { B.asked++; return B.answer; }; w.fetch = async () => { throw new Error('hors ligne'); }; w.addEventListener('error', e => e.preventDefault());
  w.HTMLCanvasElement.prototype.getContext = () => ({ measureText: () => ({ width: 10 }), getImageData: () => ({ data: [] }), fillText() {}, clearRect() {} });
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; }; w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.Range.prototype.getClientRects = () => []; w.Range.prototype.getBoundingClientRect = () => ({ width: 0, left: 0, right: 0 });
  for (const [k, v] of Object.entries(pre || {})) w.localStorage.setItem(k, v);
  for (const f of SCRIPTS) { try { w.eval(fs.readFileSync(R + f, 'utf8')); } catch (e) { if (o.log) console.log('chargement', f, e.message); } }
  const run = () => w.document.querySelector('#run').click(); // calcul comme « Valider mes imports »
  return Object.assign(B, { w, d: w.document, run, $: s => w.document.querySelector(s) });
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms) => { for (let t = 0; t < (ms || 4000); t += 50) { if (f()) return true; await wait(50); } return false; };
const F = 'releve_fictif.pdf', T0 = Date.UTC(2026, 4, 20, 10, 17, 42);
const tx = (id, date, type, asset, qty, eur) => ({ id, date, type, asset, qty, eur, fee: 0, platform: 'Relevé', source: F, line: 1 });
// À la date de la vente, seul le BTC est détenu : ligne 212 = prix de la vente, aucun cours externe nécessaire (calcul hors ligne).
const TXS = [tx('b0', Date.UTC(2026, 4, 2, 9), 'BUY', 'BTC', 0.06, 3000), tx('s1', T0, 'SELL', 'BTC', 0.02, 1000), tx('i1', T0, 'BUY', 'SOL', 9.5, 942)];
const LEDGER = '2 mai 2026, 09:00:00 Transfer to Revolut Digital Assets Europe Ltd - Achat de BTC 3 000,00€ 3 000,00€\n25 mai 2026, 09:00:00 Transfer from Revolut Digital Assets Europe Ltd - Vente de ETH 10,00€ 10,00€';
const res = b => (b.$('#results') || {}).textContent || '';
(async () => {
  // 1) Relevé importé avant v2.65 + journal en devises déjà conservé : échange reconnu au chargement, sans réimport ni question
  { const b = boot({ 'kryptax.tx': JSON.stringify(TXS), 'kryptax.fiat': LEDGER }); b.run(); await until(() => /Total global|Aucune cession/.test(res(b)));
    const T = JSON.parse(b.w.localStorage.getItem('kryptax.tx'));
    chk(T.find(t => t.id === 's1').stmtLedger === 1 && T.find(t => t.id === 's1').type === 'EXCH_OUT' && T.find(t => t.id === 's1').swapProof === 'releve', 'Données déjà importées : échange prouvé par le relevé au chargement (pas besoin de réimporter)');
    chk(!b.$('#swpend') && b.$('#swaps').hidden && !b.$('#swprov') && /Aucune cession/.test(res(b)), 'Aucune question, aucun bandeau provisoire, 0 cession'); }
  // 2) Sans journal en devises : rapprochement à confirmer, bien visible
  { const b = boot({ 'kryptax.tx': JSON.stringify(TXS) }); b.run(); await until(() => b.$('#swprov'));
    chk(!b.$('#swaps').hidden && b.$('#swpend') && b.$('#swall'), 'Liste « à confirmer » visible dans « 1. Importer » (elle était masquée en v2.62–v2.64) avec « Tout confirmer comme échanges »');
    chk(b.$('#swprov') && /1 cession sur 1 est provisoire/.test(b.$('#swprov').textContent) && b.$('#swprov [data-swall]') && /dont 1 provisoire/.test(res(b)) && !b.$('#noerr'), 'Résultat : bandeau « Résultat provisoire », compteur « dont 1 provisoire », pas de « Aucune erreur »');
    b.answer = false; b.$('#swprov [data-swall]').click(); await wait(100);
    chk(b.asked === 1 && !b.w.localStorage.getItem('kryptax.swapChoices') && b.$('#swpend'), 'Tout confirmer, annulé à la confirmation : rien ne change');
    b.answer = true; b.$('#swprov [data-swall]').click(); await until(() => /Aucune cession/.test(res(b)) && !b.$('#swprov'));
    const C = JSON.parse(b.w.localStorage.getItem('kryptax.swapChoices') || '{}');
    chk(b.asked === 2 && Object.values(C).join() === 'swap' && !b.$('#swpend') && !b.$('#swprov') && /Aucune cession/.test(res(b)), 'Tout confirmer, accepté : échange enregistré, recalcul automatique, 0 cession'); }
  console.log(ok ? 'testswapui : tout est OK (' + n + ')' : 'testswapui : ÉCHEC'); process.exit(ok ? 0 : 1);
})();
