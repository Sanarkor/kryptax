// node testsecu.js — imports malveillants (charges HTML / formules tableur), taux par année, origine des cours (annexe PDF).
// Données ENTIÈREMENT FICTIVES (actifs, montants, noms) : aucune donnée réelle, aucun appel réseau.
const fs = require('fs'), E = require('./engine.js'), P = require('./pipeline.js'), X = require('./export.js');
let ko = 0; const chk = (c, m) => { if (!c) ko++; console.log((c ? 'OK    ' : 'ÉCHEC ') + m); };
const src = f => fs.readFileSync(__dirname + '/' + f, 'utf8');
// 1) Échappement HTML : & < > " ' dans les cinq fonctions esc (FR, US x2, UK, DE)
const ESC = /\.replace\(\/\[&<>"'\]\/g, c => \(\{ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' \}/g;
chk((src('app.js').match(ESC) || []).length === 1 && (src('us-engine.js').match(ESC) || []).length === 2 && (src('uk-engine.js').match(ESC) || []).length === 1 && (src('de-engine.js').match(ESC) || []).length === 1, 'esc() : apostrophe échappée (&#39;) dans app, US, UK, DE');
{ const esc = eval('(' + src('app.js').match(/const esc = (s => [^\n]*?\}\[c\]\)\));/)[1] + ')'), pay = `<img src=x onerror="alert('x')">' "&`;
  chk(esc(pay) === '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&#39; &quot;&amp;' && !/[<>"']/.test(esc(pay)), 'esc() : charge fictive neutralisée'); }
// 2) Aucun innerHTML avec un nom de fichier, d'actif, de titulaire ou un message non échappé (motifs connus)
for (const f of ['app.js', 'de-engine.js', 'us-engine.js', 'uk-engine.js']) {
  const bad = src(f).split('\n').filter(l => /innerHTML|<li|<td|<b>/.test(l) && /\$\{(?:f\.name|file\.name|name|t\.asset|c\.asset|w\.msg|holder)\}/.test(l));
  chk(!bad.length, f + ' : pas d’interpolation brute de nom de fichier, d’actif, de titulaire ou de message dans le HTML' + (bad.length ? ' -> ' + bad.map(l => l.trim().slice(0, 90)).join(' | ') : ''));
}
// 3) Formules tableur dans les CSV US / UK / DE : texte neutralisé, montants intacts
for (const f of ['us-engine.js', 'uk-engine.js', 'de-engine.js']) {
  const M = require('./' + f), s = M.csvSafe;
  chk(typeof s === 'function' && s('=HYPERLINK("x")') === `'=HYPERLINK("x")` && s('+1+1') === "'+1+1" && s('@SUM(A1)') === "'@SUM(A1)" && s('-cmd') === "'-cmd" && s('-12.50') === '-12.50' && s('-.5') === '-.5' && s('-') === '-' && s('BTC') === 'BTC' && s('12.00') === '12.00',
    f + ' : csvSafe neutralise = + @ -texte, laisse -12.50, -.5 et les actifs');
  chk(/q = v => \{ const s = csvSafe\(String\(v/.test(src(f)), f + ' : toutes les cellules CSV passent par csvSafe');
}
// 4) Taux par année (table unique, mêmes valeurs qu'avant)
chk(X.frRate(2024).total === 0.30 && X.frRate(2025).total === 0.314 && X.frRate(2026).total === 0.314 && X.frRate(2026).ps === 0.186 && X.frRate(2024).ps === 0.172, 'Taux : 2024 30 %, 2025 et 2026 31,4 %');
// 5) Origine des cours : une ligne par actif, méthode réelle, rien d'inventé
{ const T0 = Date.UTC(2025, 2, 3, 9, 0), T1 = Date.UTC(2025, 5, 10, 13, 37), H = 3600e3, cache = {};
  cache[P.minKey('ETH', T1)] = 2000; cache[P.minKey('ETH', T1) + 's'] = 'minute|Coinbase ±2 min';
  cache['ADA|h' + (Math.floor(T1 / H) - 1)] = 0.5; cache['ADA|src'] = 'CoinGecko';
  const txs = [
    { id: 'a', date: T0, type: 'BUY', asset: 'BTC', qty: 1, eur: 50000, fee: 0 }, { id: 'b', date: T0, type: 'BUY', asset: 'ETH', qty: 2, eur: 3000, fee: 0 },
    { id: 'c', date: T0, type: 'BUY', asset: 'SOLX', qty: 10, eur: 100, fee: 0 }, { id: 'd', date: T0, type: 'BUY', asset: 'ADA', qty: 100, eur: 40, fee: 0 },
    { id: 'e', date: T1 - 5 * 24 * H, type: 'BUY', asset: 'XRPZ', qty: 10, eur: 5, fee: 0 }, { id: 'f', date: T0, type: 'STAKING', asset: '<b>NOPE</b>', qty: 3, eur: 0, fee: 0 },
    { id: 's', date: T1, type: 'SELL', asset: 'BTC', qty: 0.5, eur: 30000, fee: 0 }];
  const fn = P.priceLookup(txs, cache, { SOLX: 12 }, { zeroIfUnknown: true }), r = E.compute(txs, fn), L = P.priceSources(fn, r.cessions), j = L.join('\n');
  chk(r.cessions.length === 1 && r.cessions[0].l212 > 0, 'Origine des cours : cession fictive calculée');
  chk(L.length === new Set(L.map(l => l.split(' : ')[0])).size, 'Origine des cours : une seule ligne par actif');
  chk(/BTC : prix de la cession elle-même/.test(j), 'BTC vendu : prix implicite de la cession');
  chk(/ETH : cours à la minute \(Coinbase ±2 min\)/.test(j), 'ETH : cours minute avec source et écart réels');
  chk(/ADA : cours horaire \(CoinGecko, à 1 h de l’heure demandée\)/.test(j), 'ADA : cours horaire, décalage d’1 h signalé');
  chk(/SOLX : cours saisi par vous/.test(j), 'SOLX : cours saisi');
  chk(/XRPZ : estimé : prix d’une de vos opérations à moins de 30 jours/.test(j), 'XRPZ : estimé depuis une opération');
  chk(/<b>NOPE<\/b> : aucun cours trouvé, compté 0 €/.test(j), 'Actif inconnu : compté 0 €, pas de source inventée (texte brut, échappé à l’affichage PDF/ascii)');
  const fn2 = P.priceLookup(txs, cache, { SOLX: 12 }, { zeroIfUnknown: true }), r2 = E.compute(JSON.parse(JSON.stringify(txs)), fn2);
  chk(Math.abs(r2.cessions[0].l212 - r.cessions[0].l212) < 1e-9 && fn2.how instanceof Map, 'Justificatif sans effet sur les montants (212 identique)');
  fn.how.clear(); chk(/ETH : origine non enregistrée/.test(P.priceSources(fn, r.cessions).join('\n')), 'Sans métadonnée : « origine non enregistrée » (rien d’inventé)');
  const many = [{ date: T1, detail212: Array.from({ length: 60 }, (_, i) => ({ asset: 'T' + i, value: 1 })) }];
  chk(P.priceSources(fn, many).length === 41, 'Annexe compacte : 40 actifs maximum + 1 ligne de reste');
}
// 6) Récompenses à 0 € : avertissement visible et prudent (pas d'affirmation de régime)
{ const A = src('app.js'); chk(/function rwWarn\(\)/.test(A) && /'<\/div>' \+ rwWarn\(\) \+ cmpBlock/.test(A) && /éventuelle imposition à la réception n’est pas calculée par Kryptax : à examiner/.test(A) && !/sont des BNC|imposées en BNC/.test(A), 'Récompenses 0 € : avertissement visible, sans affirmer de régime'); }
// 7) Bandeaux bêta US / UK / DE (EN + DE), absents de la France
{ const I = src('index.html'), D = src('de-engine.js'); chk((I.match(/<b class="betatag">Beta<\/b>/g) || []).length === 3 && /Weniger getestet als die französische Version/.test(D) && !/betatag/.test((I.match(/<section id="frmode"[\s\S]*?<\/section>/) || [''])[0]), 'Bandeaux bêta US, UK, DE (EN/DE)'); }
console.log(ko ? ko + ' ÉCHEC(S)' : 'testsecu : tout est OK'); process.exit(ko ? 1 : 0);
