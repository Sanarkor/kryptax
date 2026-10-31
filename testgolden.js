// node testgolden.js — tests « golden » du moteur français : fige les résultats actuels sur des jeux 100 % FICTIFS.
// Toute évolution (étapes suivantes, module U.S.A.) doit laisser ces résultats identiques.
// Régénérer volontairement (après validation d'un changement voulu) : UPDATE_GOLDEN=1 node testgolden.js
// Cours : fonction déterministe hors ligne (dernier prix unitaire vu dans le jeu lui-même), taux USD fictif fixe 0,86 :
// aucun appel réseau, résultats identiques quel que soit le fuseau (TZ) de la machine.
const fs = require('fs'), path = require('path');
const E = require('./engine.js'), KP = require('./pipeline.js'), KF = require('./formats.js');
const DIR = path.join(__dirname, 'testdata', 'golden'), UPDATE = process.env.UPDATE_GOLDEN === '1';
let ok = true; const chk = (c, m) => { ok = ok && c; console.log((c ? 'OK  ' : 'ÉCHEC ') + m); };
const r2 = v => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
let uid = 0; const id = () => 'g' + (++uid);

// Prix déterministe : dernier prix unitaire (€/unité) connu dans le jeu à la date ts, sinon le premier connu.
function priceFrom(txs) {
  const by = {}; for (const t of E.sortTx(txs)) if (t.qty && t.eur > 0) (by[t.asset] = by[t.asset] || []).push([t.date, Math.abs(t.eur / t.qty)]);
  return (a, ts) => { const L = by[a]; if (!L) return null; let p = L[0][1]; for (const [d, v] of L) { if (d <= ts) p = v; else break; } return p; };
}
// Même conversion que pipeline.prepare (étape « devises »), avec un taux fictif fixe.
function fxFixed(txs, r) {
  for (const t of txs) if (t.fxPending) { t.fx = r; t.eur = t.valCur * r + (t.eurKeep || 0); t.fee = t.feeCur * r + (t.feeEur || 0); if (t.unitPriceCur) t.unitPrice = t.unitPriceCur * r; delete t.fxPending; }
  return txs;
}
// Résumé figé : par année, nombre de cessions, totaux 213/214/218/224, exonération 305 €, case 3AN/3BN et base, prélèvement estimé (même formule que l'écran).
function snap(txs, priceFn) {
  const res = E.compute(E.sortTx(txs), priceFn), Y = E.byYear(res), out = { nTx: txs.length, types: {}, years: {} };
  for (const t of txs) out.types[t.type] = (out.types[t.type] || 0) + 1;
  for (const k of Object.keys(Y).sort()) {
    const y = Y[k], s = f => r2(y.cessions.reduce((a, c) => a + (c[f] || 0), 0)), l224 = r2(y.total224);
    const box = y.exonere ? null : l224 >= 0 ? '3AN' : '3BN', base = y.exonere ? 0 : Math.round(Math.abs(l224));
    out.years[k] = { cessions: y.cessions.length, incomplete: y.incomplete, l213: s('l213'), l214: s('l214'), l218: r2(y.total218), l224, exonere: y.exonere, box, base,
      prelevement: r2(y.exonere || l224 <= 0 ? 0 : base * (+k >= 2025 ? 0.314 : 0.30)), detail: y.cessions.map(c => [c.asset, r2(c.l212), r2(c.l218), r2(c.l223), r2(c.l224)]) };
  }
  return out;
}
const cases = {
  notice2086: () => snap([
    { id: 1, date: Date.UTC(2025, 0, 10), type: 'BUY', asset: 'BTC', qty: 1, eur: 1000, fee: 0 },
    { id: 2, date: Date.UTC(2025, 2, 10), type: 'SELL', asset: 'BTC', qty: 0.375, eur: 450, fee: 0 },
    { id: 3, date: Date.UTC(2025, 7, 10), type: 'SELL', asset: 'BTC', qty: 0.625, eur: 1300, fee: 0 }], () => null),
  fake_many: () => snap(require('./testdata/fake_many.js')(), a => ({ AAA: 6, BBB: 7, CCC: 8, DDD: 9, EEE: 10 })[a]),
  releve_fictif_pdf: () => { // lignes de texte extraites (pdf.js + itemsToLines) du relevé PDF fictif, puis même chemin que l'appli (app.js importPdf)
    const lines = JSON.parse(fs.readFileSync(path.join(DIR, 'releve_fictif_lignes.json'), 'utf8')), r = KP.parsePdfLines(lines);
    const txs = fxFixed(KP.importRows(r.rows, { asset: 0, type: 1, qty: 2, price: 3, eur: 4, fee: 5, date: 6 }, { platform: 'Relevé', feeInKind: true, source: 'releve_fictif.pdf', dmode: 'DMY', nmode: 'FR', tz: 'UTC' }, id).txs, 0.86);
    const sw = E.detectSwaps(txs).length, o = snap(txs, priceFrom(txs)); o.swaps = sw; o.fiatLines = r.fiat.length; return o; },
  plusvalue_fictif_csv: () => { // CSV générique fictif, mappage automatique (guessMap) et options par défaut du dialogue d'import
    const rows = Array.from(KF.parseCSV(new Uint8Array(fs.readFileSync(path.join(DIR, 'plusvalue_fictif.csv'))))), head = rows[0], m = KF.guessMap(head), mp = {};
    for (const k in m) if (typeof m[k] === 'number') mp[k] = m[k]; // comme les listes déroulantes du dialogue (colonnes uniquement)
    const o = { dmode: '', tz: 'UTC', nmode: '', platform: 'Relevé', cur: mp.eur != null ? KF.headCur(head[mp.eur]) : 'EUR', source: 'plusvalue_fictif.csv', strict: true, head, line0: 2 };
    if (mp.fee != null) o.feeInKind = false; // comme app.js (dialogue d'import) : colonne de frais explicite prise en compte
    const txs = KP.importRows(rows.slice(1), mp, o, id).txs; E.detectSwaps(txs); return snap(txs, priceFrom(txs)); }
  ,seuil_305_fictif: () => snap([ // 310 € de prix de cession, 10 € de frais : ligne 218 = 300 € -> exonéré (≤ 305 €)
    { id: 1, date: Date.UTC(2025, 0, 10, 12), type: 'BUY', asset: 'AAA', qty: 1, eur: 100, fee: 0 },
    { id: 2, date: Date.UTC(2025, 5, 10, 12), type: 'SELL', asset: 'AAA', qty: 1, eur: 310, fee: 10 }], () => null)
};
const diff = (a, b, p, out) => { if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], p + '.' + k, out); }
  else out.push(p + ' : attendu ' + JSON.stringify(a) + ', obtenu ' + JSON.stringify(b)); return out; };
for (const [name, fn] of Object.entries(cases)) {
  const f = path.join(DIR, name + '.json'), got = JSON.parse(JSON.stringify(fn()));
  if (UPDATE || !fs.existsSync(f)) { fs.writeFileSync(f, JSON.stringify(got, null, 1) + '\n'); console.log('ÉCRIT  ' + name + '.json (instantané régénéré)'); continue; }
  const d = diff(JSON.parse(fs.readFileSync(f, 'utf8')), got, name, []);
  chk(!d.length, 'Golden ' + name + (d.length ? ' — ÉCART (' + d.length + ') :\n    ' + d.slice(0, 15).join('\n    ') + '\n    Si le changement est voulu et validé : UPDATE_GOLDEN=1 node testgolden.js' : ''));
}
// Garde-fous de langue (sans navigateur) : mode U.S.A. sans texte légal français, mode FRANCE inchangé.
{ const AP = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8'), IH = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const i0 = AP.indexOf('const EN = ['), i1 = AP.indexOf("const fr = $('#regfr')");
  chk(i0 > 0 && i1 > i0, 'Mode U.S.A. : dictionnaire anglais EN trouvé dans app.js');
  const en = [...AP.slice(i0, i1).matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(m => m[1]).filter(x => !/^[#.\[]|^(header|footer|main)\b/.test(x) && / /.test(x));
  const us = (IH.match(/<section id="usmode"[\s\S]*?<\/section>/) || [''])[0] + (IH.match(/<div class="regions"[\s\S]*?<\/div>/) || [''])[0];
  const visUS = en.join('\n') + '\n' + us.replace(/<[^>]+>/g, ' ');
  const BAD = /2086|2042|3AN|3BN|305|CGI|impots|prélèvements? sociaux|France only|BOI-|L136/i, hit = visUS.match(BAD);
  chk(en.length >= 8 && !hit, 'Mode U.S.A. : aucun texte légal français (2086, 2042, 3AN, 3BN, 305, CGI, impots, prélèvements sociaux, France only)' + (hit ? ' — trouvé : « ' + hit[0] + ' »' : ''));
  // Mode FRANCE : textes visibles de index.html figés (hors numéros de version ?v=)
  const fr = IH.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<section id="usmode"[\s\S]*?<\/section>/, '').replace(/<[^>]+>/g, '\n').split('\n').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const f = path.join(DIR, 'textes_france.json');
  if (UPDATE || !fs.existsSync(f)) { fs.writeFileSync(f, JSON.stringify(fr, null, 1) + '\n'); console.log('ÉCRIT  textes_france.json (instantané régénéré)'); }
  else { const exp = JSON.parse(fs.readFileSync(f, 'utf8')), d = []; for (let k = 0; k < Math.max(exp.length, fr.length); k++) if (exp[k] !== fr[k]) d.push('texte ' + (k + 1) + ' : attendu ' + JSON.stringify(exp[k]) + ', obtenu ' + JSON.stringify(fr[k]));
    chk(!d.length, 'Mode FRANCE : textes visibles de index.html inchangés' + (d.length ? ' — ÉCART (' + d.length + ') :\n    ' + d.slice(0, 10).join('\n    ') + '\n    Si le changement est voulu et validé : UPDATE_GOLDEN=1 node testgolden.js' : '')); } }
process.exit(ok ? 0 : 1);
