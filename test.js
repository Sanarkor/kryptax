// node test.js — vérifie le moteur avec l'exemple officiel de la notice 2086 (revenus 2025)
const E = require('./engine.js'); let ok = true;
const eq = (a, b, m) => { const p = Math.abs(a - b) < 1e-6; ok = ok && p; console.log((p ? 'OK  ' : 'ÉCHEC ') + m + ' : ' + a + ' (attendu ' + b + ')'); };
// Notice : achat 1000 € en janvier ; mars : portefeuille 1200 €, cession 450 € -> PV 75 ; août : portefeuille 1300 €, cession totale 1300 € -> PV 675
const tx = [
  { id: 1, date: Date.UTC(2025, 0, 10), type: 'BUY', asset: 'BTC', qty: 1, eur: 1000, fee: 0 },
  { id: 2, date: Date.UTC(2025, 2, 10), type: 'SELL', asset: 'BTC', qty: 0.375, eur: 450, fee: 0 }, // 0,375 BTC à 1200 €/BTC
  { id: 3, date: Date.UTC(2025, 7, 10), type: 'SELL', asset: 'BTC', qty: 0.625, eur: 1300, fee: 0 } // 0,625 BTC à 2080 €/BTC = 1300 €
];
let r = E.compute(tx, () => null);
eq(r.cessions[0].l212, 1200, 'Cession 1 ligne 212'); eq(r.cessions[0].l224, 75, 'Cession 1 ligne 224');
eq(r.cessions[1].l221, 375, 'Cession 2 ligne 221'); eq(r.cessions[1].l223, 625, 'Cession 2 ligne 223');
eq(r.cessions[1].l212, 1300, 'Cession 2 ligne 212'); eq(r.cessions[1].l224, 675, 'Cession 2 ligne 224');
// Multi-actifs + échange non imposable + frais + cours externe
const tx2 = [
  { id: 1, date: 1, type: 'BUY', asset: 'BTC', qty: 1, eur: 990, fee: 10 },
  { id: 2, date: 2, type: 'EXCH_OUT', asset: 'BTC', qty: 0.5 }, { id: 3, date: 2, seq: 1, type: 'EXCH_IN', asset: 'ETH', qty: 5 },
  { id: 4, date: 3, type: 'SELL', asset: 'ETH', qty: 2, eur: 800, fee: 8 }
];
r = E.compute(tx2, (a) => a === 'BTC' ? 2000 : null);
eq(r.cessions[0].l212, 0.5 * 2000 + 5 * 400, 'Multi 212'); eq(r.cessions[0].l218, 792, 'Multi 218');
eq(r.cessions[0].l224, 792 - 1000 * 800 / 3000, 'Multi 224 (frais hors quotient)');
r = E.compute(tx2, () => null); eq(r.cessions[0].status === 'à renseigner' ? 1 : 0, 1, 'Cours manquant -> à renseigner');
eq(E.parseNum('€1,234.56'), 1234.56, 'nombre EN'); eq(E.parseNum('1 234,56 €'), 1234.56, 'nombre FR'); eq(E.parseNum('0,5'), 0.5, 'virgule décimale');
eq(new Date(E.parseDate('13/01/2024 15:45')).getMonth(), 0, 'date FR'); eq(new Date(E.parseDate('Jan 13, 2024, 3:45:12 PM')).getHours(), 15, 'date EN');
// Format relevé .xlsx (valeurs fictives)
eq(E.parseNum('68â_x0080_¯116,39â_x0082_¬'), 68116.39, 'montant mojibake'); eq(E.currencyOf(E.fixText('20,19$')) === 'USD' ? 1 : 0, 1, 'devise USD');
eq(E.guessType('RÃ©compenseÂ\u00a0Apprendre') === 'INTEREST' ? 1 : 0, 1, 'récompense Learn'); eq(E.guessType('Vendre - Revolut X') === 'SELL' ? 1 : 0, 1, 'Vendre (plateforme X)');
eq(new Date(E.parseDate('15 juil. 2026, 12:30:25')).getMonth(), 6, 'date FR juil.'); eq(new Date(E.parseDate('17 mai 2026, 00:09:10')).getDate(), 17, 'date FR mai');
eq(E.fixQty(81033368, 1.23, 100).qty, 81.033368, 'quantité tronquée XRP'); eq(E.fixQty(73403, 68116.39, 50).qty, 0.00073403, 'quantité tronquée BTC');
// Détection des échanges crypto→crypto (données fictives)
const T0 = Date.UTC(2026, 4, 21, 10, 0, 0);
const sw = [
  { id: 'b0', date: T0 - 86400e3, type: 'BUY', asset: 'AAA', qty: 100, eur: 300, fee: 0 },
  { id: 's1', date: T0, type: 'SELL', asset: 'AAA', qty: 50, eur: 150, fee: 0 },            // échange AAA → BBB (même seconde)
  { id: 'b1', date: T0, type: 'BUY', asset: 'BBB', qty: 10, eur: 148.5, fee: 1.5 },
  { id: 's2', date: T0 + 3600e3, type: 'SELL', asset: 'BBB', qty: 5, eur: 80, fee: 0.8 },   // vraie vente en € (achat CCC à +27 s)
  { id: 'b2', date: T0 + 3600e3 + 27e3, type: 'BUY', asset: 'CCC', qty: 7, eur: 79, fee: 0 },
  { id: 's3', date: T0 + 7200e3, type: 'SELL', asset: 'AAA', qty: 10, eur: 30, fee: 0 },    // deux ventes, un seul achat : un-pour-un
  { id: 's4', date: T0 + 7200e3 + 1e3, type: 'SELL', asset: 'AAA', qty: 10, eur: 40, fee: 0 },
  { id: 'b3', date: T0 + 7200e3 + 1e3, type: 'BUY', asset: 'DDD', qty: 1, eur: 39.6, fee: 0 },
  { id: 'u1', date: T0, type: 'IGNORE', asset: 'USD', qty: 0, eur: 150 }
];
const pairs = E.detectSwaps(sw), ty = id => sw.find(t => t.id === id).type;
eq(pairs.length, 2, 'Échanges détectés');
eq(ty('s1') === 'EXCH_OUT' && ty('b1') === 'EXCH_IN' ? 1 : 0, 1, 'Même seconde -> échange');
eq(ty('s2') === 'SELL' && ty('b2') === 'BUY' ? 1 : 0, 1, 'Achat à +27 s non apparié, vente en € imposable');
eq(ty('s4') === 'EXCH_OUT' && ty('s3') === 'SELL' && ty('u1') === 'IGNORE' ? 1 : 0, 1, 'Appariement un-pour-un (valeur la plus proche)');
r = E.compute(sw, (a) => ({ BBB: 16, CCC: 11, DDD: 40 })[a]);
eq(r.total220, 300 + 79, 'Achat d’un échange hors ligne 220'); eq(r.cessions.length, 2, 'Cessions imposables');
sw.find(t => t.id === 's1').swapForce = 'taxable'; sw.find(t => t.id === 'b1').swapForce = 'taxable'; E.detectSwaps(sw);
eq(ty('s1') === 'SELL' && ty('b1') === 'BUY' ? 1 : 0, 1, 'Forcer imposable');
const fz = E.parseFiatSales('Transfer from Revolut Digital Assets Europe Ltd - Vente de BBB;21/05/2026 11:00:01;80,00\nautre ligne\n21/05/2026 12:00:00 Vente de ZZZ 5');
E.detectSwaps(sw); const cc = E.crossCheck(sw, fz.map(x => Object.assign(x, { date: x.asset === 'BBB' ? T0 + 3600e3 + 1e3 : x.date })));
eq(fz.length, 2, 'Relevé € : lignes Vente de'); eq(cc.confirmed.length, 1, 'Vente confirmée par le relevé €'); eq(cc.sellNoFiat.length, 2, 'Ventes absentes du relevé € signalées (s1 forcée, s3)'); eq(cc.fiatNoSell.length, 1, 'Ligne € sans vente signalée');
// État reporté au 31/12 : historique complet sur 2 ans == calcul 2027 à partir de l'état exporté (données fictives)
{
  const P = (a, ts) => a === 'AAA' ? (ts < Date.UTC(2027, 0, 1) ? 10 : 20) : a === 'BBB' ? 5 : null;
  const full = [
    { id: 'a', date: Date.UTC(2026, 1, 1), type: 'BUY', asset: 'AAA', qty: 100, eur: 800, fee: 0 },
    { id: 'b', date: Date.UTC(2026, 2, 1), type: 'BUY', asset: 'BBB', qty: 50, eur: 200, fee: 0 },
    { id: 'c', date: Date.UTC(2026, 5, 1), type: 'SELL', asset: 'AAA', qty: 10, eur: 100, fee: 0 },
    { id: 'd', date: Date.UTC(2027, 2, 1), type: 'BUY', asset: 'BBB', qty: 10, eur: 50, fee: 0 },
    { id: 'e', date: Date.UTC(2027, 4, 1), type: 'SELL', asset: 'AAA', qty: 20, eur: 400, fee: 0 }];
  const ref = E.compute(full, P), st = E.stateAt(full, P, 2026);
  const back = E.validateState(JSON.parse(JSON.stringify(st)));
  const only27 = full.filter(t => t.date >= Date.UTC(2027, 0, 1)), r27 = E.compute(only27, P, back);
  eq(st.holdings.AAA, 90, 'État 31/12 : solde AAA'); eq(st.l220, 1000, 'État 31/12 : ligne 220'); eq(st.l221, ref.cessions[1].l221, 'État 31/12 : ligne 221');
  eq(r27.cessions[0].l224, ref.cessions[1].l224, 'Plus-value 2027 identique avec l’état reporté');
  eq(r27.cessions[0].l212, ref.cessions[1].l212, 'Ligne 212 2027 identique');
  const ign = E.compute(full, P, back); eq(ign.cessions.length, 1, 'Opérations ≤ 31/12 ignorées si état chargé');
  eq(E.checkBalances(only27, { AAA: 70, BBB: 60 }, Infinity, back).every(b => b.ok) ? 1 : 0, 1, 'Soldes de clôture avec état reporté');
  let err = 0; try { E.validateState({ foo: 1 }); } catch (x) { err = 1; } eq(err, 1, 'État invalide refusé');
}
// Synthèse annuelle (données fictives)
{
  const T = [
    { id: 1, date: Date.UTC(2026, 0, 5), type: 'BUY', asset: 'AAA', qty: 10, eur: 100, fee: 1, feeInKind: true, rawType: 'Achat' },
    { id: 2, date: Date.UTC(2026, 1, 5), type: 'INTEREST', asset: 'CCC', qty: 2, eur: 0, rawType: 'Récompense Apprendre' },
    { id: 3, date: Date.UTC(2026, 2, 5), type: 'EXCH_OUT', asset: 'AAA', qty: 2, eur: 30, swapAuto: true },
    { id: 4, date: Date.UTC(2026, 2, 5), type: 'EXCH_IN', asset: 'BBB', qty: 3, eur: 30 },
    { id: 5, date: Date.UTC(2026, 3, 5), type: 'SELL', asset: 'AAA', qty: 4, eur: 80, fee: 0.5 },
    { id: 6, date: Date.UTC(2026, 4, 5), type: 'SEND', asset: 'BBB', qty: 1 }];
  const P = a => ({ AAA: 20, BBB: 10, CCC: 3 })[a];
  const r = E.compute(T, P), S = E.summary(T, r, P, 2026);
  eq(S.nCessions, 1, 'Synthèse : nombre de cessions'); eq(S.produit, 80, 'Synthèse : produit');
  eq(S.net, r.cessions[0].l224, 'Synthèse : plus-value nette'); eq(S.acquisition, r.cessions[0].fraction, 'Synthèse : prix d’acquisition des actifs cédés');
  eq(S.fees.inKind, 1, 'Synthèse : frais en nature'); eq(S.fees.explicit, 0.5, 'Synthèse : frais explicites');
  eq(S.incomeTotal, 6, 'Synthèse : revenus (2 CCC × 3 €)'); eq(S.swaps, 1, 'Synthèse : échanges exclus');
  eq(S.outcome.SEND.eur, 10, 'Synthèse : sortie transfert'); eq(S.closing.find(c => c.asset === 'BBB').qty, 2, 'Synthèse : solde BBB');
  const S2 = E.summary(T, r, () => null, 2026); eq(S2.incomeUnknown.length, 1, 'Synthèse : revenu sans cours signalé (pas inventé)');
}
// Export : toutes les cessions et toutes les sections (données fictives, 18 cessions)
{
  const X = require('./export.js'), T = require('./testdata/fake_many.js')(), P = (a, ts) => ({ AAA: 6, BBB: 7, CCC: 8, DDD: 9, EEE: 10 })[a];
  const r = E.compute(T, P), Y = E.byYear(r), S = {}; for (const y in Y) S[y] = E.summary(T, r, P, +y);
  const rows = s => [['Plus-values', 'Gains', '', s.gains], ['Frais', 'Frais totaux', '', s.fees.total], ['Revenus (income)', 'Total', '', s.incomeTotal], ['Sorties (outcome)', 'Ventes', '', s.outcome.SELL.eur], ['Soldes', 'Total', '', s.closingTotal]];
  const x = X.exportData(Y, S, rows, T);
  eq(r.cessions.length, 18, 'Export : 18 cessions calculées'); eq(x.cessions.length, 18, 'Export : 18 lignes de cession exportées');
  eq(x.swapCount, 4, 'Export : 4 échanges exclus comptés (non listés)'); eq(Object.keys(x).join(',') === 'cessions,totals,year,swapCount,special' ? 1 : 0, 1, 'Export : pas de soldes ni de revenus (cessions, totaux, compteurs)');
  eq(x.totals[0].n, 18, 'Export : GLOBAL = 18 cessions'); eq(typeof X.makeCsv + typeof X.makeXlsx === 'undefinedundefined' ? 1 : 0, 1, 'Export CSV/xlsx retiré (PDF seul)');
  eq(X.FORM.map(f => f[0]).join(',') === '211,212,213,214,215,216,217,218,220,221,222,223,224' ? 1 : 0, 1, 'Export : lignes 211 à 224 de la 2086 dans l’ordre');
}
// Année fiscale (données fictives sur plusieurs années) : calcul cumulatif, export de la seule année choisie
{
  const X = require('./export.js'), P = (a, ts) => ({ AAA: 100 })[a] || 100;
  const T = [{ id: 1, date: Date.UTC(2025, 0, 5), type: 'BUY', asset: 'AAA', qty: 10, eur: 500, fee: 0 },
    { id: 2, date: Date.UTC(2025, 5, 5), type: 'SELL', asset: 'AAA', qty: 1, eur: 100, fee: 0 },
    { id: 3, date: Date.UTC(2026, 2, 5), type: 'SELL', asset: 'AAA', qty: 2, eur: 200, fee: 0 },
    { id: 4, date: Date.UTC(2026, 8, 5), type: 'SELL', asset: 'AAA', qty: 1, eur: 100, fee: 0 },
    { id: 5, date: Date.UTC(2028, 1, 5), type: 'SELL', asset: 'AAA', qty: 2, eur: 200, fee: 0 }];
  const r = E.compute(T, P), Y = E.byYear(r);
  const NOW = 2026; // date du jour simulée
  for (const [now, a, b] of [[2026, 2021, 2026], [2028, 2023, 2028], [2031, 2026, 2031], [2060, 2055, 2060]]) { const yo = X.yearOptions(Y, now);
    eq(yo.length, 6, `Date simulée ${now} : 6 années`); eq(yo[0], a, `Date simulée ${now} : commence en ${a}`); eq(yo[5], b, `Date simulée ${now} : finit en ${b} (aucune année future)`); eq(yo.every(y => X.selectable(y, now)) ? 1 : 0, 1, `Date simulée ${now} : toutes sélectionnables`); }
  eq(X.selectable(2027, NOW) ? 1 : 0, 0, 'Année future refusée');
  eq(X.defaultYear(Y, NOW), 2026, 'Défaut en 2026 : 2026 (cession 2028 future ignorée)'); eq(X.defaultYear(Y, 2028), 2028, 'Défaut en 2028 : 2028, la plus récente avec cessions'); eq(X.defaultYear(Y, 2031), 2028, 'Défaut en 2031 : 2028'); eq(X.defaultYear(Y, 2060), 2060, 'Défaut en 2060 : année en cours (cessions trop anciennes)'); eq(X.defaultYear({}, NOW), 2026, 'Défaut sans cession : année en cours');
  const x26 = X.exportData(Y, {}, () => [], T, 2026), all = X.exportData(Y, {}, () => [], T);
  eq(x26.cessions.length, 2, 'Export 2026 : seulement les 2 cessions de 2026'); eq(x26.totals.length, 1, 'Export 2026 : une seule ligne GLOBAL');
  eq(x26.cessions.every(c => c.year === 2026) ? 1 : 0, 1, 'Export 2026 : aucune cession d’une autre année');
  const c26 = all.cessions.filter(c => c.year === 2026); eq(x26.cessions[0].l221, c26[0].l221, 'Cumulatif : l. 221 de 2026 tient compte de la cession 2025');
  eq(x26.cessions[0].l221 > 0 ? 1 : 0, 1, 'Cumulatif : l. 221 > 0 grâce à 2025'); eq(x26.cessions[0].l220, 500, 'Cumulatif : prix total d’acquisition depuis le premier achat');
  eq(x26.totals[0].l213, 300, 'GLOBAL 2026 : 213 = 300'); eq(x26.totals[0].l224, +(x26.cessions[0].l224 + x26.cessions[1].l224).toFixed(2), 'GLOBAL 2026 = somme des 224 de 2026');
  eq(X.title(2026) === 'Année 2026 — déclaration 2027' ? 1 : 0, 1, 'Titre « Année 2026 — déclaration 2027 »');
  const x27 = X.exportData(Y, {}, () => [], T, 2027); eq(x27.cessions.length, 0, 'Année sans cession : aucune ligne'); eq(x27.totals[0].n, 0, 'Année sans cession : GLOBAL à 0 cession'); eq(x27.totals[0].l224, 0, 'Année sans cession : total 0');
}
// Messages après calcul : « ✅ Aucune erreur » ou erreur courte, pas de compteur ni « Calcul terminé »
{ const A = require('fs').readFileSync(__dirname + '/app.js', 'utf8');
  eq(A.includes('✅ Aucune erreur') ? 1 : 0, 1, 'Message « ✅ Aucune erreur » présent'); eq(/textContent = 'Calcul terminé|transactions importées, dont/.test(A) ? 1 : 0, 0, 'Pas de « Calcul terminé » ni de compteur de transactions'); }
// Page : plus de bandeau « conseil fiscal », pas d'icône ℹ️, aperçu 👁 sans vraies valeurs
{ const fs = require('fs'), H = fs.readFileSync(__dirname + '/index.html', 'utf8'), A = fs.readFileSync(__dirname + '/app.js', 'utf8');
  eq(/pas un conseil fiscal|class="banner/.test(H.replace(/<dialog id="privacy"[\s\S]*?<\/dialog>/, '')) ? 1 : 0, 0, 'Bandeau « Outil d’aide… » retiré de la page'); eq(H.includes('ℹ️') ? 1 : 0, 0, 'Icône ℹ️ retirée'); { const C = fs.readFileSync(__dirname + '/style.css', 'utf8'); eq(/summary\{list-style:none\}/.test(C) && /-webkit-details-marker\{display:none\}/.test(C) && /::marker\{content:""\}/.test(C) ? 1 : 0, 1, 'Triangle des <summary> masqué'); } eq(H.includes("<summary>Mode d'emploi et aide</summary>") ? 1 : 0, 1, 'Mode d’emploi et aide conservé (replié)');
  const pk = A.slice(A.indexOf('function showPeek'), A.indexOf('function cmpBlock')); eq(/c\.l2\d\d|t\.l2\d\d|c\.qty|fr\(/.test(pk) ? 1 : 0, 0, 'Aperçu 👁 : aucun montant réel injecté (valeurs factices floutées)'); }
// Multi-import (fictif) : cumul, remplacement du même fichier, dédoublonnage des relevés qui se chevauchent
{ const KP = require('./pipeline.js'), D = (m, d) => Date.UTC(2026, m, d, 10);
  const f1 = [{ source: 'a.pdf', type: 'BUY', asset: 'AAA', date: D(0, 5), qty: 2, eur: 100 }, { source: 'a.pdf', type: 'SELL', asset: 'AAA', date: D(1, 5), qty: 1, eur: 70 }];
  const f2 = [{ source: 'b.csv', type: 'SELL', asset: 'AAA', date: D(1, 5), qty: 1, eur: 70 }, { source: 'b.csv', type: 'BUY', asset: 'BBB', date: D(2, 1), qty: 5, eur: 50 }];
  let m = KP.mergeImport([], f1); eq(m.txs.length, 2, 'Import 1 : 2 transactions');
  m = KP.mergeImport(m.txs, f2); eq(m.txs.length, 3, 'Import 2 : cumulé sans écraser (3)'); eq(m.dup, 1, 'Chevauchement : vente commune ignorée (1 doublon)');
  m = KP.mergeImport(m.txs, f1.map(t => Object.assign({}, t))); eq(m.txs.length, 3, 'Même fichier ré-importé : pas de doublon'); eq(m.replaced, 2, 'Même fichier ré-importé : remplace l’ancien');
  const f3 = [{ source: 'c.pdf', type: 'SELL', asset: 'AAA', date: D(3, 1), qty: 1, eur: 80 }, { source: 'c.pdf', type: 'SELL', asset: 'AAA', date: D(3, 1), qty: 1, eur: 80 }];
  m = KP.mergeImport(m.txs, f3); eq(m.txs.length, 5, 'Deux opérations identiques dans un même fichier : conservées');
  const L = KP.fileList(m.txs); eq(L.length, 3, 'Liste des fichiers : 3'); eq(L.map(f => f.name).sort().join(',') === 'a.pdf,b.csv,c.pdf' ? 1 : 0, 1, 'Liste des fichiers : noms');
  const after = m.txs.filter(t => t.source !== 'b.csv'); eq(KP.fileList(after).length, 2, 'Retirer un fichier (✕)');
  const A = require('fs').readFileSync(__dirname + '/app.js', 'utf8'); eq(/function autoRun\(\)[^]*?\$\('#run'\)\.click\(\)[^]*?function renderFiles/.test(A) ? 1 : 0, 0, 'L’import ne lance plus le calcul'); }
// CSP : chaque hôte appelé par le code doit figurer dans connect-src
{
  const fs = require('fs'), html = fs.readFileSync(__dirname + '/index.html', 'utf8'), csp = (html.match(/connect-src ([^;"]*)/) || [])[1] || '';
  const hosts = [...new Set((fs.readFileSync(__dirname + '/pipeline.js', 'utf8') + fs.readFileSync(__dirname + '/app.js', 'utf8')).match(/https:\/\/[a-z0-9.-]+/g))].filter(h => !/impots|github/.test(h));
  { const H = fs.readFileSync(__dirname + '/index.html', 'utf8'), D = (H.match(/<dialog id="privacy"[\s\S]*?<\/dialog>/) || [''])[0], A = fs.readFileSync(__dirname + '/app.js', 'utf8'), P = fs.readFileSync(__dirname + '/pipeline.js', 'utf8');
    eq(D ? 1 : 0, 1, 'Panneau vie privée présent');
    eq(H.includes('<footer><div class="footline"><span>Kryptax — Formulaire 2086</span><span class="fiscfr">Fiscalité Française</span></div><span class="law">Art. 150 VH bis CGI') ? 1 : 0, 1, 'Pied de page inchangé');
    eq(/<\/footer>\s*<p class="privlink"><a href="#vie-privee" id="privopen">/.test(H) ? 1 : 0, 1, 'Lien discret sous le pied de page');
    eq(/revolut|code ouvert/i.test(D + H.replace(/<[^>]*>/g, '')) ? 1 : 0, 0, 'Ni Revolut ni « code ouvert »');
    eq(/style="/.test(H + A) ? 1 : 0, 0, 'Aucun style inline (CSP)');
    eq(/goatcounter|gtag|plausible|analytics|document\.cookie|cryptocompare|cckey/i.test(H + A + P) ? 1 : 0, 0, 'Pas de mesure d’audience, cookie ni clé API');
    const names = {'api.binance.com':'Binance','data-api.binance.vision':'Binance','api.gateio.ws':'Gate.io','www.okx.com':'OKX','coins.llama.fi':'DefiLlama','api.bitget.com':'Bitget','www.bitstamp.net':'Bitstamp','api.crypto.com':'Crypto.com','api.exchange.coinbase.com':'Coinbase','api.kraken.com':'Kraken','api.coingecko.com':'CoinGecko','api.geckoterminal.com':'GeckoTerminal','api.frankfurter.dev':'Frankfurter'};
    const used = [...new Set((P + A).match(/https:\/\/[a-z0-9.-]+/g).map(u => u.slice(8)))];
    eq(used.filter(h => !names[h] || !D.includes(names[h])).length, 0, 'Chaque source appelée est citée');
    eq(Object.keys(names).filter(h => !used.includes(h)).length, 0, 'Aucune source citée non appelée');
    eq(D.includes('Réinitialiser') && D.includes('pas un conseil fiscal') ? 1 : 0, 1, 'Réinitialiser + aide au calcul cités'); }
  { const A2 = fs.readFileSync(__dirname + '/app.js', 'utf8'); eq(/Aucune erreur<\/div>'\)[^\n]*\.join\(''\) \+ specialNote\(X\.special\(txs, fyear\)\) \+ tot/.test(A2) && /<details class="note spec" id="special">/.test(A2) && A2.includes('Voir le PDF') ? 1 : 0, 1, 'Message replié « opérations particulières » sous « Aucune erreur »'); }
  const miss = hosts.filter(h => !csp.split(/\s+/).includes(h)); eq(miss.length, 0, 'CSP connect-src couvre tous les hôtes appelés' + (miss.length ? ' (manque ' + miss.join(', ') + ')' : ''));
}

/* Cours : table d'identifiants, alias, ordre DefiLlama, contrôle croisé > 30 % (sources simulées, données fictives) */
(async () => {
  const P = require('./pipeline.js'), IDS = require('./ids.js'), H = 3600000, t0 = Date.UTC(2025, 0, 10, 12);
  eq(Object.keys(IDS.ids).length > 900 ? 1 : 0, 1, 'Table symbole→id embarquée (top 1000)');
  eq(IDS.ids.BTC === 'bitcoin' ? 1 : 0, 1, 'Table : BTC → bitcoin');
  function mock(binPrice, llamaPrice) {
    const calls = [];
    const f = async u => { calls.push(u); const R = (j, st = 200) => ({ status: st, json: async () => j });
      if (/coingecko\.com\/api\/v3\/search/.test(u)) return R({ coins: [] });
      if (/klines\?symbol=EURUSDT/.test(u)) { const st = +u.match(/startTime=(\d+)/)[1]; return R(st > t0 + 5 * H ? [] : Array.from({ length: 12 }, (_, i) => [t0 - 5 * H + i * H, '1'])); }
      const m = u.match(/klines\?symbol=([A-Z0-9]+)&.*startTime=(\d+)/);
      if (m) { if (!binPrice || !/USDT$/.test(m[1]) || !/^(XMR|ETH|ONE)USDT$/.test(m[1])) return R({ code: -1121 }); const st = +m[2]; return R(st > t0 + 5 * H ? [] : Array.from({ length: 12 }, (_, i) => [t0 - 5 * H + i * H, String(binPrice)])); }
      const l = u.match(/coins\.llama\.fi\/chart\/coingecko:([a-z0-9-]+)/);
      if (l) return R({ coins: llamaPrice ? { ['coingecko:' + l[1]]: { prices: Array.from({ length: 12 }, (_, i) => ({ timestamp: (t0 - 5 * H + i * H) / 1000, price: llamaPrice })) } } : {} });
      return R({ code: '51001', label: 'INVALID', error: 'x' }, 400);
    }; f.calls = calls; return f;
  }
  let f = mock(0, 150), S = P.makeSources(f, { gap: 0 }), r = await S.series('XMR', t0, t0);
  eq(r && r.src === 'DefiLlama' ? 1 : 0, 1, 'XMR (absent de Binance) : DefiLlama via id monero');
  eq(f.calls.some(u => /gateio|okx\.com|bitget/.test(u)) ? 1 : 0, 0, 'Id connu : DefiLlama essayé avant Gate.io / OKX / Bitget');
  eq(f.calls.some(u => /coingecko\.com\/api\/v3\/search/.test(u)) ? 1 : 0, 0, 'Aucune recherche CoinGecko à l’exécution');
  f = mock(100, 105); S = P.makeSources(f, { gap: 0 }); r = await S.series('XMR', t0, t0);
  eq(r && r.src === 'Binance USDT' && !r.suspect ? 1 : 0, 1, 'Écart < 30 % : Binance gardé, pas d’alerte');
  f = mock(100, 300); S = P.makeSources(f, { gap: 0 }); r = await S.series('XMR', t0, t0);
  eq(r && r.src === 'DefiLlama' && r.suspect ? 1 : 0, 1, 'Écart > 30 % : DefiLlama retenu et actif « à vérifier »');
  f = mock(2000, 2000); S = P.makeSources(f, { gap: 0 }); r = await S.series('ETH2.S', t0, t0);
  eq(r && f.calls.some(u => /symbol=ETHUSDT/.test(u)) ? 1 : 0, 1, 'Alias Kraken ETH2.S → ETH');
  f = mock(0, 0.5); S = P.makeSources(f, { gap: 0 }); r = await S.series('MATIC', t0, t0);
  eq(f.calls.some(u => /coingecko:matic-network/.test(u)) ? 1 : 0, 1, 'MATIC → id matic-network (renommé POL)');
  f = mock(0, 0.5); S = P.makeSources(f, { gap: 0 }); await S.series('ONE', t0, t0); await S.series('MKR', t0, t0); await S.series('FXS', t0, t0);
  eq(['coingecko:harmony', 'coingecko:maker', 'coingecko:frax-share'].every(x => f.calls.some(u => u.includes(x))) ? 1 : 0, 1, 'Homonymes corrigés : ONE→harmony, MKR→maker, FXS→frax-share');
  /* Titulaire des relevés (noms fictifs) */
  const hA = P.holderFromLines(['Relevé de compte crypto', 'Nom du compte Alice Martin', 'Période 1 mai 2026']);
  const hB = P.holderFromRows([['Date', 'Crypto', 'Titulaire'], ['2026-01-01', 'AAA', 'MARTIN  Alicé']]);
  const hC = P.holderFromRows([['Date', 'Crypto', 'Account name'], ['2026-01-01', 'AAA', 'Bruno Petit']]);
  const hN = P.holderFromLines(['Relevé crypto (FICTIF)', 'Symbole Type Quantité']);
  eq(hA === 'Alice Martin' ? 1 : 0, 1, 'Titulaire lu dans l’en-tête PDF');
  eq(P.normName(hA) === P.normName(hB) ? 1 : 0, 1, 'Mêmes noms (casse, accents, ordre prénom/nom inversé) : identiques');
  eq(hN, '', 'Relevé sans nom : aucun titulaire');
  let HH = P.checkHolders({ 'a.pdf': hA, 'b.csv': hB, 'n.pdf': hN }, ['a.pdf', 'b.csv', 'n.pdf']);
  eq(HH.status === 'ok' && HH.n === 2 ? 1 : 0, 1, 'Même titulaire sur 2 fichiers (le relevé sans nom ne bloque rien)');
  HH = P.checkHolders({ 'a.pdf': hA, 'b.csv': hB, 'c.csv': hC }, ['a.pdf', 'b.csv', 'c.csv']);
  eq(HH.status === 'conflict' && HH.bad.join() === 'c.csv' && HH.a === 'A. M.' && HH.b === 'B. P.' ? 1 : 0, 1, 'Noms différents : conflit, fichier fautif repéré, noms masqués');
  eq(P.checkHolders({ 'x.pdf': '', 'y.pdf': '' }).status === 'none' ? 1 : 0, 1, 'Aucun nom : pas de message');
  eq(P.checkHolders({ 'a.pdf': 'Alice Martin', 'c.pdf': 'Anna Moreau' }).a.includes('…') ? 1 : 0, 1, 'Mêmes initiales : masque plus long pour distinguer');
  const appS = require('fs').readFileSync(__dirname + '/app.js', 'utf8');
  eq(/Fichier déjà ajouté, ignoré/.test(appS) && /H.status === 'conflict'/.test(appS) ? 1 : 0, 1, 'Doublon de fichier ignoré, Valider bloqué en cas de conflit');
  /* Reprise automatique : sources en échec intermittent (simulées) */
  {
    const T = Date.UTC(2026, 1, 3, 10), txr = [{ id: 'r1', date: T - 86400e3, type: 'BUY', asset: 'AAA', qty: 2, eur: 20, fee: 0 }, { id: 'r2', date: T, type: 'SELL', asset: 'AAA', qty: 1, eur: 0, fee: 0 }, { id: 'r3', date: T, type: 'SELL', asset: 'ZZZ', qty: 1, eur: 0, fee: 0 }, { id: 'r0', date: T - 2 * 86400e3, type: 'BUY', asset: 'ZZZ', qty: 1, eur: 5, fee: 0 }];
    let calls = 0; const rot = [], waits = [];
    const mk = k => { rot.push(k); return { series: async (a, f, t) => { if (a === 'ZZZ') return null; calls++; if (calls < 3) return undefined; const s = {}; for (let h = Math.floor(f / 3600e3) - 3; h <= Math.floor(t / 3600e3) + 3; h++) s[h] = 12; return { s, src: 'Test' }; }, fxRange: async () => ({}), stats: {}, assetDiag: {} }; };
    const c = {}, r = await P.prepareRetry(txr, mk, c, () => {}, { unit: 1, onRetry: k => waits.push(k), concurrency: 1 });
    eq(r.failed.length, 0, 'Échec réseau intermittent : reprise automatique jusqu’au succès');
    eq(r.tries, 2, 'Deux nouvelles tentatives');
    eq(rot.join() === '0,1,2' ? 1 : 0, 1, 'Nouvelles sources (rotation) à chaque tentative');
    eq(c['ZZZ|none'], 1, '« Aucun cours existant » : pas de boucle sur cet actif');
    let n2 = 0; const mkFail = () => ({ series: async () => { n2++; return undefined; }, fxRange: async () => ({}), stats: {}, assetDiag: {} });
    const r2 = await P.prepareRetry(txr.slice(0, 2), mkFail, {}, () => {}, { unit: 1, maxTries: 4 });
    eq(r2.tries === 4 && r2.failed.length === 1 ? 1 : 0, 1, 'Plafond de tentatives : arrêt puis cours ≈ et « Relancer »');
  }
  { const A = require('fs').readFileSync(__dirname + '/app.js', 'utf8'), C = require('fs').readFileSync(__dirname + '/style.css', 'utf8');
    eq((A.match(/makePdf\(/g) || []).length, 1, 'PDF : un seul point de génération');
    const d = A.slice(A.indexOf('function downloadPdf'), A.indexOf('makePdf('));
    eq(/currentBlockers\(\)[\s\S]*if \(b\.length\) \{ pdfRefused\(b\); return false; \}[\s\S]*if \(pdfBusy\) return false/.test(d) ? 1 : 0, 1, 'PDF : blocage imposé dans la génération (erreur, double clic)');
    eq(/if \(e\.target\.id === 'pdfx'\) downloadPdf\(\);/.test(A) && !/alert\(/.test(d) ? 1 : 0, 1, 'PDF : le bouton passe par downloadPdf, message non bloquant');
    eq(['calc', 'imports', 'holders', 'import', 'cours', 'estime'].every(k => A.includes("k: '" + k + "'")) ? 1 : 0, 1, 'PDF : 6 causes bloquantes');
    eq(/#pdfx\.off\{/.test(C) && /aria-disabled/.test(A) ? 1 : 0, 1, 'PDF : bouton grisé + aria-disabled');
    eq(/footer \.footline\{display:flex;flex-wrap:wrap;justify-content:space-between/.test(C) ? 1 : 0, 1, 'Pied de page : Fiscalité Française à droite, retour à la ligne propre'); }
  { const ih = require('fs').readFileSync(__dirname + '/index.html', 'utf8'), C = require('fs').readFileSync(__dirname + '/style.css', 'utf8'), ad = (ih.match(/<aside class="adslot" aria-label="Publicité">[\s\S]*?<\/aside>/) || [''])[0];
    eq((ih.match(/class="adslot"/g) || []).length, 1, 'Pub : un seul encart <aside class="adslot">');
    eq(ad.includes('<p class="adlabel">Publicité</p>') && ad.includes('Exemple de pub fictive — emplacement réservé') ? 1 : 0, 1, 'Pub : étiquette « Publicité » + mention fictive');
    eq(!/style=|<script|href=|https?:/.test(ad) && /<\/aside>\s*<\/main>\s*<footer>/.test(ih) ? 1 : 0, 1, 'Pub : sans style inline, script ni lien, juste avant le pied de page');
    eq(/\.adslot\{[^}]*max-width:100%[^}]*overflow:hidden/.test(C) ? 1 : 0, 1, 'Pub : CSS dans style.css, jamais plus large que l’écran'); }
  { const ih = require('fs').readFileSync(__dirname + '/index.html', 'utf8'); eq(/<footer><div class="footline"><span>Kryptax — Formulaire 2086<\/span><span class="fiscfr">Fiscalité Française<\/span><\/div><span class="law">Art\. 150 VH bis CGI[^<]*art\. 200 C CGI[^<]*<\/span><\/footer>/.test(ih) && !/code ouvert|revolut/i.test(ih.match(/<footer>[\s\S]*<\/footer>/)[0]) ? 1 : 0, 1, 'Pied de page : articles de loi (150 VH bis, 200 C)'); }
  const app = require('fs').readFileSync(__dirname + '/app.js', 'utf8');
  eq(/id="csv"|id="xlsx"/.test(app) ? 1 : 0, 0, 'Interface : export PDF seul (CSV et xlsx retirés)');
  eq(/isUnlocked|cadenas|🔒/.test(app) ? 1 : 0, 0, 'PDF sans verrou');
  process.exit(ok ? 0 : 1);
})();
