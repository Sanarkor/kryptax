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
eq(E.guessType('RÃ©compenseÂ\u00a0Apprendre') === 'INTEREST' ? 1 : 0, 1, 'récompense Learn'); eq(E.guessType('Vendre - Plateforme X') === 'SELL' ? 1 : 0, 1, 'Vendre (plateforme X)');
eq(new Date(E.parseDate('15 juil. 2026, 12:30:25')).getMonth(), 6, 'date FR juil.'); eq(E.parisParts(E.parseDate('17 mai 2026, 00:09:10')).day, 17, 'date FR mai');
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
const fz = E.parseFiatSales('Transfer from Exchange Digital Assets Ltd - Vente de BBB;21/05/2026 11:00:01;80,00\nautre ligne\n21/05/2026 12:00:00 Vente de ZZZ 5');
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
  eq(X.pdfName(2026, new Date(Date.UTC(2026, 9, 25, 18, 48))) === 'kryptax-formulaire-2086-2026-sur-2027-25-10-2026-19-48.pdf' ? 1 : 0, 1, 'Nom du PDF : année, déclaration, date/heure de Paris (hiver)');
  eq(X.pdfName(2025, new Date(Date.UTC(2026, 6, 3, 22, 5))) === 'kryptax-formulaire-2086-2025-sur-2026-04-07-2026-00-05.pdf' ? 1 : 0, 1, 'Nom du PDF : heure d’été de Paris, sans accents ni espaces');
  eq(/X\.pdfName\(fyear, new Date\(\)\)/.test(require('fs').readFileSync(__dirname + '/app.js', 'utf8')) && !/kryptax-2086-/.test(require('fs').readFileSync(__dirname + '/app.js', 'utf8')) ? 1 : 0, 1, 'Nom du PDF appliqué partout (téléchargement, partage, ouverture)');
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
// Page : plus de bandeau « conseil fiscal », pas d'icône ℹ️, pas d'icône œil
{ const fs = require('fs'), H = fs.readFileSync(__dirname + '/index.html', 'utf8'), A = fs.readFileSync(__dirname + '/app.js', 'utf8');
  eq(/id="helpbtn" class="small ghost" aria-expanded="false" aria-controls="helppanel">Mode d’emploi<\/button><button id="reset" class="small ghost"/.test(H) && !/Mode d'emploi et aide|details class="help"/.test(H) ? 1 : 0, 1, 'Mode d’emploi : bouton à gauche de Réinitialiser, même style');
  eq(/pas un conseil fiscal|class="banner/.test(H.replace(/<dialog id="privacy"[\s\S]*?<\/dialog>/, '').replace(/<span class="disclaim">[^<]*<\/span>/, '')) ? 1 : 0, 0, 'Bandeau « Outil d’aide… » retiré de la page'); eq(H.includes('ℹ️') ? 1 : 0, 0, 'Icône ℹ️ retirée'); { const C = fs.readFileSync(__dirname + '/style.css', 'utf8'); eq(/summary\{list-style:none\}/.test(C) && /-webkit-details-marker\{display:none\}/.test(C) && /::marker\{content:""\}/.test(C) ? 1 : 0, 1, 'Triangle des <summary> masqué'); } eq(H.includes('id="helppanel" class="help" hidden') ? 1 : 0, 1, 'Mode d’emploi conservé (replié)');
  eq(/peek|showPeek|👁/.test(A + fs.readFileSync(__dirname + '/style.css', 'utf8') + H) ? 1 : 0, 0, 'Icône œil (aperçu flouté) supprimée avec sa logique'); }
// Multi-import (fictif) : cumul, remplacement du même fichier, dédoublonnage des relevés qui se chevauchent
{ /* Lecture CSV/Excel : valeurs absentes, virgules perdues, ambiguïtés (données synthétiques) */
  const KP = require('./pipeline.js'); let n = 0; const u = () => 'r' + n++, mp = { asset: 0, type: 1, qty: 2, price: 3, eur: 4, fee: 5, date: 6 }, H = ['Symbol', 'Type', 'Quantity', 'Price', 'Value', 'Fees', 'Date'];
  const rows = [['AAA', 'Achat', '1\u202f234,5', '2,00€', '2\u00a0469,00€', '1,00€', '3 mars 2026, 10:00:00'], ['BBB', 'Acheter - Plateforme X', '#######', '0,50$', '10,00$', '0,01$', '4 mars 2026, 11:00:00'],
    ['CCC', 'Vente', '12,5', '0,00€', '0,25€', '0,01€', '5 mars 2026, 12:00:00'], ['DDD', 'Achat', 12345, '10,00€', '12,35€', '0,10€', '6 mars 2026, 13:00:00'],
    ['EEE', 'Achat', '3', '', '30,00€', '0,10€', '7 mars 2026, 14:00:00'], ['FFF', 'Achat', '2', '5,00€', '', '0,10€', '8 mars 2026, 15:00:00'], ['USD', 'Autre', '100,00$', '', '100,00$', '0,00$', '9 mars 2026, 16:00:00'],
    ['GGG', 'Achat', 77777, '1,00€', '50,00€', '0,10€', '10 mars 2026, 10:00:00']];
  const r = KP.importRows(rows, mp, { xlsx: true, strict: true, source: 'f.xlsx', head: H }, u), T = Object.fromEntries(r.txs.map(x => [x.asset, x]));
  eq(r.bad.length, 0, 'CSV/Excel : aucune ligne refusée (symboles € $, espaces fines, #######, prix vide ou arrondi à 0)');
  eq(T.AAA.qty, 1234.5, 'espace fine de milliers + virgule décimale'); eq(T.BBB.qty, 20, '####### : quantité reconstruite par valeur ÷ prix'); eq(T.BBB.recon[0].method === 'valeur ÷ prix' ? 1 : 0, 1, 'reconstruction signalée');
  eq(T.CCC.unitPrice, 0.02, 'prix arrondi à 0 → montant ÷ quantité'); eq(T.DDD.qty, 1.2345, 'virgule perdue 12345 → 1,2345'); eq(T.DDD.recon[0].raw === '12345' ? 1 : 0, 1, 'valeur d’origine gardée');
  eq(T.EEE.unitPrice, 10, 'prix vide reconstruit'); eq(T.FFF.eur, 10, 'montant vide = quantité × prix'); eq(T.USD.type === 'IGNORE' ? 1 : 0, 1, 'ligne « Autre » en devise ignorée');
  eq(!!T.GGG.reconPending && T.GGG.reconPending.choices.length > 1, true, 'hypothèse peu sûre → à confirmer, plusieurs choix');
  const c = KP.importRows([['HHH', 'Achat', '12345', '10,00', '123450,00', '0', '2026-03-06 13:00']], mp, { strict: true, source: 'f.csv', head: H }, u).txs[0];
  eq(c.qty, 12345, 'CSV : entier court cohérent non modifié');
  const c2 = KP.importRows([['HHH', 'Achat', '123450', '10,00', '12,35', '0', '2026-03-06 13:00']], mp, { strict: true, source: 'f.csv', head: H }, u).txs[0];
  eq(c2.qty, 1.2345, 'CSV : virgule perdue corrigée'); eq(c2.recon && c2.recon[0].conf === 'élevée' ? 1 : 0, 1, 'CSV : correction signalée');
  // récompenses sans valeur : ambiguïté → à confirmer ; ligne jumelle d'un relevé PDF → reprise
  const R = [['KKK', 'Autre', 1234567891, '', '', '', '11 mars 2026, 09:00:00']].map(x => (x[1] = 'Récompense', x));
  const rw = KP.importRows(R, mp, { xlsx: true, strict: true, source: 'g.xlsx', head: H }, u).txs;
  KP.resolveRecon(rw, rw.filter(x => x.qtyStatus === 'à reconstruire'), () => 0.01);
  eq(!!rw[0].reconPending, true, 'récompense sans valeur ni ligne jumelle : à confirmer'); eq(rw[0].reconPending.choices[0], 12.34567891, 'hypothèse de tête : 8 décimales');
  const pdf = { id: 'p', source: 'r.pdf', asset: 'KKK', type: rw[0].type, date: rw[0].date + 7200e3, qty: 12.34567891, eur: 0 };
  const m = KP.mergeImport([pdf], rw); eq(rw[0].qty, 12.34567891, 'ligne jumelle du relevé PDF : quantité reprise'); eq(rw[0].reconPending === undefined ? 1 : 0, 1, 'plus rien à confirmer'); eq(rw[0].recon[0].conf === 'élevée' ? 1 : 0, 1, 'méthode jumelle, confiance élevée');
  eq(KP.reconList(r.txs).length >= 6, true, 'liste des valeurs reconstruites (affichage + PDF)');
}
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
  { const A9 = require('fs').readFileSync(__dirname + '/app.js', 'utf8'), H9 = require('fs').readFileSync(__dirname + '/index.html', 'utf8'), C9 = require('fs').readFileSync(__dirname + '/style.css', 'utf8');
    eq(/role="progressbar"[^>]*aria-valuenow/.test(H9) && /id="progress" aria-live="polite"/.test(H9) && !/<progress id="bar"/.test(H9) ? 1 : 0, 1, 'Progression : barre pleine largeur accessible, texte annoncé');
    eq(!/sur \$\{tot\}|Cours récupérés/.test(A9) && /Lecture de vos fichiers…/.test(A9) && /Récupération des cours…/.test(A9) && /Génération du formulaire 2086…/.test(A9) && !/Calcul de vos plus-values/.test(A9) && /lecture: \[0, 25\], cours: \[25, 90\], fin: \[90, 100\]/.test(A9) && /bar\.at\(98\); await breathe\(\); renderResults\(\); bar\.end\(!failed\)/.test(A9) && !/Math\.min\(97/.test(A9) && /if \(v > val\)/.test(A9) && /if \(tot !== lastT\) \{ lo = val;/.test(A9) && !/kxshine/.test(C9) ? 1 : 0, 1, 'Progression : réelle pondérée, sans numéros, jamais de recul, pas de plafond arbitraire');
    eq(/requestAnimationFrame\(tick\)/.test(A9) && !/setInterval\(/.test(A9.slice(A9.indexOf('function progBar'), A9.indexOf("$('#run').onclick"))) ? 1 : 0, 1, 'Progression : animation requestAnimationFrame, sans minuterie à paliers');
    { /* Simulation : rAF factice, réponses de cours irrégulières (rafale puis attente) */
      const src = A9.slice(A9.indexOf('  const SEG ='), A9.indexOf('  const PLABEL')) + A9.slice(A9.indexOf('  function progBar'), A9.indexOf("  $('#run').onclick"));
      let now = 0, q = []; const el = () => ({ style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, hidden: true, textContent: '', className: '' });
      const els = { '#barwrap': el(), '#bar': el(), '#barfill': el(), '#progress': el() };
      const sb = { $: s => els[s], Date: { now: () => now }, window: {}, requestAnimationFrame: f => { q.push(f); return q.length; }, performance: { now: () => now }, cancelAnimationFrame() {}, setTimeout: (f) => 1, clearTimeout() {}, clearInterval() {}, PLABEL: () => '' };
      const pb = new Function(...Object.keys(sb), src + '; return progBar;')(...Object.values(sb))();
      const vals = []; const run = ms => { for (let i = 0; i < ms / 16; i++) { now += 16; const f = q; q = []; f.forEach(g => g(now)); vals.push(parseFloat((els['#barfill'].style.transform || 'scaleX(0)').slice(7)) * 100); } };
      pb.start(false); pb.unit('lecture', 1, 1); run(2100); pb.unit('cours', 0, 10);
      pb.unit('cours', 5, 10); run(300); const afterBurst = vals[vals.length - 1]; run(4000); const afterWait = vals[vals.length - 1];
      let back = 0, maxJump = 0; for (let i = 1; i < vals.length; i++) { if (vals[i] < vals[i - 1] - 1e-9) back++; maxJump = Math.max(maxJump, vals[i] - vals[i - 1]); }
      eq(back, 0, 'Progression fluide : jamais de recul');
      eq(afterBurst < 25 + 65 * 5 / 10 + 0.01 && afterWait > afterBurst + 1 && afterWait < 25 + 65 * 6 / 10 ? 1 : 0, 1, 'Progression fluide : avance douce pendant l’attente, sans dépasser la prochaine réponse');
      eq(maxJump < 6 ? 1 : 0, 1, 'Progression fluide : pas de saut brutal (' + maxJump.toFixed(2) + ')');
      pb.unit('cours', 10, 10); pb.at(90); run(200); const g0 = vals[vals.length - 1]; run(3000); const g1 = vals[vals.length - 1];
      eq(g1 > g0 + 1 && g1 < 98 ? 1 : 0, 1, 'Génération : avance continue vers 98 % sans se figer (' + g0.toFixed(1) + ' → ' + g1.toFixed(1) + ')');
      pb.end(true); const e0 = vals.length; run(32); const firstAfter = vals[vals.length - 1]; run(500);
      let jEnd = 0; for (let i = e0; i < vals.length; i++) jEnd = Math.max(jEnd, vals[i] - vals[i - 1]);
      eq(firstAfter < 100 && jEnd < 2 && els['#barfill'].style.transform === 'scaleX(1.0000)' ? 1 : 0, 1, 'Progression : fin en glissement (~400 ms) jusqu’à 100 %, sans saut');
      eq(/const breathe = \(\) => new Promise\(r => requestAnimationFrame\(\(\) => setTimeout\(r, 0\)\)\)/.test(A9) && (A9.match(/await breathe\(\)/g) || []).length >= 5 ? 1 : 0, 1, 'Génération : l’interface respire entre les gros calculs'); }
    eq(/READ_MIN_MS = 2000/.test(A9) && /25 \* el \/ READ_MIN_MS/.test(A9) && /prefers-reduced-motion/.test(A9) && /setTimeout\(fin, rest\)/.test(A9) ? 1 : 0, 1, 'Progression : « Lecture de vos fichiers… » affichée au moins 2 s, montée fluide 0 → 25 %');
    eq(/linear-gradient\(90deg,#22d3ee,#10b981\);box-shadow:[^;]*;transition:transform \.12s linear/.test(C9) && /prefers-reduced-motion:reduce\)\{\.kxfill\{transition:none\}/.test(C9) ? 1 : 0, 1, 'Progression : bleu-vert avec halo, fluide, mouvement réduit respecté');
    eq(/header \.sub\{font-size:1\.04em;font-weight:700[^}]*color:#fff[^}]*text-shadow/.test(C9) && !/header \.sub\{[^}]*animation/.test(C9) && !/#f59e0b\)?;box-shadow|kxfill\{[^}]*#f59e0b/.test(C9) ? 1 : 0, 1, 'Sous-titre blanc sobre, contour gris, sans animation ; barre sans orange'); }
  const A = require('fs').readFileSync(__dirname + '/app.js', 'utf8'); eq(/function autoRun\(\)[^]*?\$\('#run'\)\.click\(\)[^]*?function renderFiles/.test(A) ? 1 : 0, 0, 'L’import ne lance plus le calcul'); }
// CSP : chaque hôte appelé par le code doit figurer dans connect-src
{
  const fs = require('fs'), html = fs.readFileSync(__dirname + '/index.html', 'utf8'), csp = (html.match(/connect-src ([^;"]*)/) || [])[1] || '';
  const hosts = [...new Set((fs.readFileSync(__dirname + '/pipeline.js', 'utf8') + fs.readFileSync(__dirname + '/app.js', 'utf8')).match(/https:\/\/[a-z0-9.-]+/g))].filter(h => !/impots|github|ko-fi\.com/.test(h)); // ko-fi.com : simple lien de navigation, jamais appelé
  { const H = fs.readFileSync(__dirname + '/index.html', 'utf8'), D = (H.match(/<dialog id="privacy"[\s\S]*?<\/dialog>/) || [''])[0], A = fs.readFileSync(__dirname + '/app.js', 'utf8'), P = fs.readFileSync(__dirname + '/pipeline.js', 'utf8');
    eq(D ? 1 : 0, 1, 'Panneau vie privée présent');
    eq(H.includes('<footer><span class="law">Art. 150 VH bis CGI') && !/footline|Fiscalité Française<\/span>/.test(H) ? 1 : 0, 1, 'Pied de page sans répétition du titre');
    eq(/<\/footer>\s*(<p class="kofifoot">[\s\S]*?<\/p>\s*)?(<dialog id="why"[\s\S]*?<\/dialog>\s*)?<p class="privlink"><a href="#vie-privee" id="privopen">/.test(H) ? 1 : 0, 1, 'Lien discret sous le pied de page'); eq(!/class="signature"/.test(H) ? 1 : 0, 1, 'Plus de signature en pied de page (seulement sous le logo)'); eq(/<h1>Kry<span class="ptax">ptax<\/span><span class="hsig" aria-hidden="true">Made by Damien M\. with Grok Bot<\/span><\/h1>/.test(H) ? 1 : 0, 1, 'Signature fine sous « ptax » du logo'); { const AP = require('fs').readFileSync(__dirname + '/app.js', 'utf8'); eq(/addEventListener\('resize', run\)/.test(AP) && /fonts\.ready\.then\(run\)/.test(AP) && /new ResizeObserver\(run\)/.test(AP) && /addEventListener\('load', run\)/.test(AP) && /getImageData/.test(AP) && /setTimeout\(run, 300\); setTimeout\(run, 1000\)/.test(AP) && /canvasFont\(h, 'ptax'/.test(AP) && /const L = L0 \+ \(PC \? 0\.16 \* px : 0\);/.test(AP) && /a0\[0\] \* k \+ \(PC \? 38 : 0\)/.test(AP) && /matchMedia\('\(min-width: 768px\)'\)\.matches && !matchMedia\('\(pointer: coarse\)'\)/.test(AP) ? 1 : 0, 1, 'Signature : de la hampe du p au bord du x, mesurée (encre réelle), recalculée au resize et après les polices'); } eq((H.match(/seul responsable de la vérification de ses données et de sa déclaration auprès de l'administration fiscale/g) || []).length, 2, 'Avertissement de non-responsabilité : pied de page + mentions légales');
    eq(new RegExp(['rev', 'olut'].join(''), 'i').test(D + H.replace(/<[^>]*>/g, '')) || /code ouvert/i.test(D + H.replace(/<[^>]*>/g, '')) ? 1 : 0, 0, 'Ni nom de plateforme ni « code ouvert »');
    eq(/style="/.test(H + A) ? 1 : 0, 0, 'Aucun style inline (CSP)');
    eq(/goatcounter|gtag|plausible|analytics|document\.cookie|cryptocompare|cckey/i.test(H + A + P) ? 1 : 0, 0, 'Pas de mesure d’audience, cookie ni clé API');
    const names = {'api.binance.com':'Binance','data-api.binance.vision':'Binance','api.gateio.ws':'Gate.io','www.okx.com':'OKX','coins.llama.fi':'DefiLlama','api.bitget.com':'Bitget','www.bitstamp.net':'Bitstamp','api.crypto.com':'Crypto.com','api.exchange.coinbase.com':'Coinbase','api.kraken.com':'Kraken','api.coingecko.com':'CoinGecko','api.geckoterminal.com':'GeckoTerminal','api.frankfurter.dev':'Frankfurter'};
    const used = [...new Set((P + A).match(/https:\/\/[a-z0-9.-]+/g).map(u => u.slice(8)))].filter(h => h !== 'ko-fi.com'); // lien de don (navigation), pas une source de cours
    eq(used.filter(h => !names[h] || !D.includes(names[h])).length, 0, 'Chaque source appelée est citée');
    eq(Object.keys(names).filter(h => !used.includes(h)).length, 0, 'Aucune source citée non appelée');
    eq(D.includes('Réinitialiser') && D.includes('un conseil fiscal') ? 1 : 0, 1, 'Réinitialiser + aide au calcul cités'); }
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
  f = mock(100, 105); S = P.makeSources(f, { gap: 0 }); r = await S.series('XMR', t0 - 48 * H, t0);
  eq(r && r.partial && S.assetDiag.XMR.some(x => /partiel, complété/.test(x)) && r.s[Math.floor(t0 / H)] > 0 ? 1 : 0, 1, 'Série partielle (paire listée tard) : complétée par les sources suivantes, pas acceptée telle quelle');
  { // cours à la minute / à la seconde (sources simulées, aucune donnée réelle)
    const M0 = Date.UTC(2025, 2, 3, 14, 27), calls = [];
    const fm = async u => { calls.push(u); const R = (j, st = 200) => ({ status: st, json: async () => j }), st = +((u.match(/startTime=(\d+)/) || [])[1] || 0);
      if (/ticker\/price/.test(u)) return R(['AAAEUR', 'EURUSDT', 'BBBUSDT'].concat(Array.from({ length: 60 }, (_, i) => 'PAD' + i + 'USDT')).map(symbol => ({ symbol, price: '1' })));
      if (/aggTrades\?symbol=AAAEUR/.test(u)) return R([{ p: '12.5', T: st + 300 }]);
      if (/klines\?symbol=AAAEUR&interval=1m/.test(u)) return R([[st, '12', '12', '12', '12']]);
      if (/klines\?symbol=EURUSDT&interval=1m/.test(u)) return R([[st, '1.25']]);
      if (/klines\?symbol=BBBUSDT&interval=1m/.test(u)) return R([[st + 86400e3, '9']]); // paire listée plus tard : bougie d'une autre minute, refusée
      if (/klines|aggTrades/.test(u)) return R({ code: -1121 }, 400);
      if (/okx\.com.*BBB-USDT&bar=1m/.test(u)) return R({ code: '0', data: [[String(M0), '5']] });
      return R({ code: '51001', data: [] });
    };
    const S2 = P.makeSources(fm, { gap: 0 });
    let q = await S2.minute('AAA', M0 + 7000); eq(q && q.k === 'seconde' && q.p === 12.5 && q.src === 'Binance' ? 1 : 0, 1, 'Minute : relevé avec secondes → cours à la seconde (Binance aggTrades)');
    q = await S2.minute('AAA', M0); eq(q && q.k === 'minute' && q.p === 12 ? 1 : 0, 1, 'Minute : bougie Binance 1 min de la minute exacte');
    q = await S2.minute('BBB', M0 + 20e3); eq(q && q.k === 'minute' && q.src === 'OKX' && q.p === 4 ? 1 : 0, 1, 'Minute : bougie d’une autre minute refusée, repli OKX 1 min converti en € (USDT → €)');
    q = await S2.minute('CCC', M0); eq(q, null, 'Minute : aucune source → null (repli sur le cours horaire)');
    eq(calls.filter(u => /binance/.test(u) && /symbol=(CCC|AAAUSDT|BBBEUR)/.test(u)).length + calls.filter(u => /ticker\/price/.test(u)).length, 1, 'Paires Binance inexistantes jamais demandées (liste des paires chargée une seule fois)');
    eq(P.hasTime(M0 + 7000) && !P.hasTime(Date.UTC(2025, 2, 3)) ? 1 : 0, 1, 'Heure présente détectée ; date seule → cours journalier');
    const cache = { ['AAA|m' + Math.floor(M0 / 60e3)]: 12, ['AAA|m' + Math.floor(M0 / 60e3) + 's']: 'minute|Binance', ['BBB|h' + Math.floor(M0 / 36e5)]: 4, 'BBB|src': 'OKX' };
    const fn = P.priceLookup([], cache, {}, { zeroIfUnknown: true }); fn('AAA', M0); fn('BBB', M0); fn('ZZZ', M0);
    const cp = P.cessionPrec(fn, { date: M0, detail212: [{ asset: 'AAA' }, { asset: 'BBB' }] });
    eq(cp.n === 2 && cp.nMin === 1 && cp.k === 'horaire' && P.precLabel(cp) === 'cours horaire (OKX)' && P.precLabel(fn.prec.get('AAA|' + M0)) === 'cours à la minute (Binance)' ? 1 : 0, 1, 'Précision par cession : la moins précise l’emporte, 1 opération à la minute sur 2');
    eq(P.cessionPrec(fn, { date: M0, detail212: [{ asset: 'ZZZ' }] }).k === 'estimé' ? 1 : 0, 1, 'Précision : cours introuvable → « cours estimé »');
  }
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
    { // périmètre : seulement les cryptos identifiées des imports, aux dates utiles (données fictives)
      const D = 86400e3, T1 = Date.UTC(2025, 5, 10, 9, 14), T2 = Date.UTC(2026, 2, 5, 15, 2), asked = [];
      const tx = [{ id: 'p1', date: T1 - 9 * D, type: 'BUY', asset: 'AAA', qty: 3, eur: 30, fee: 0 }, { id: 'p2', date: T1 - 8 * D, type: 'BUY', asset: 'BBB', qty: 1, eur: 10, fee: 0 }, { id: 'p3', date: T1 - 7 * D, type: 'BUY', asset: 'QQQ', qty: 1, eur: 4, fee: 0 },
        { id: 'p4', date: T1 - 5 * D, type: 'STAKING', asset: 'CCC', qty: 1, eur: 0, fee: 0 }, { id: 'p5', date: T1, type: 'SELL', asset: 'AAA', qty: 1, eur: 12, fee: 0 }, { id: 'p6', date: T2, type: 'SELL', asset: 'AAA', qty: 1, eur: 15, fee: 0 }];
      const src = { known: async a => a !== 'QQQ', series: async (a, f, t) => { asked.push(['h', a, f, t]); const o = {}; for (let h = Math.floor(f / 36e5) - 3; h <= Math.floor(t / 36e5) + 3; h++) o[h] = 7; return { s: o, src: 'Test' }; },
        minute: async (a, ts) => { asked.push(['m', a, ts]); return a === 'BBB' ? { p: 9, src: 'Test', k: 'minute' } : null; }, fxRange: async () => ({}), stats: {}, assetDiag: {} };
      const c2 = {}, fz = await P.prepare(tx, src, c2, () => {}, { until: Date.UTC(2026, 0, 1), check: false });
      eq(asked.some(x => x[1] === 'QQQ') ? 1 : 0, 0, 'Périmètre : aucune requête pour un symbole non identifié (signalé)');
      eq(fz.unknown.join() === 'QQQ' ? 1 : 0, 1, 'Périmètre : symbole non identifié remonté à l’interface');
      eq(asked.some(x => x[1] === 'CCC' && (x[2] === T1 - 5 * D)) ? 1 : 0, 0, 'Périmètre : aucun cours demandé à la date d’un revenu (staking)');
      eq(asked.some(x => x[1] === 'CCC' && x[2] === T1) ? 1 : 0, 1, 'Crypto reçue en staking puis détenue : valorisée à la cession');
      eq(asked.some(x => (x[2] || 0) >= Date.UTC(2026, 0, 1) || (x[3] || 0) >= Date.UTC(2026, 0, 1)) ? 1 : 0, 0, 'Périmètre : aucune requête pour une date hors de l’année choisie');
      eq(asked.every(x => tx.some(t => t.asset === x[1])) ? 1 : 0, 1, 'Journal des requêtes : seulement des symboles présents dans le fichier importé');
      eq(asked.filter(x => x[0] === 'h' && x[1] === 'BBB').length, 0, 'Cours horaire inutile quand le cours à la minute est trouvé');
      eq(asked.some(x => x[0] === 'm' && x[1] === 'BBB' && x[2] === T1) ? 1 : 0, 1, 'Valeur du portefeuille à la cession : crypto détenue (non vendue) bien demandée');
    }
    { // alerte ≈ / relance : seulement les cryptos qui comptent (données fictives)
      const D = 86400e3, T1 = Date.UTC(2026, 5, 10, 9, 14);
      const tx = [{ id: 'q1', date: T1 - 9 * D, type: 'BUY', asset: 'AAA', qty: 3, eur: 30, fee: 0 }, { id: 'q2', date: T1 - 8 * D, type: 'INTEREST', asset: 'RWD', qty: 5, eur: 0, fee: 0 },
        { id: 'q3', date: T1 - 7 * D, type: 'BUY', asset: 'HLD', qty: 1, eur: 4, fee: 0 }, { id: 'q4', date: T1, type: 'SELL', asset: 'AAA', qty: 1, eur: 12, fee: 0 }];
      const c3 = { ['AAA|h' + Math.floor(T1 / 36e5)]: 10 }, fq = P.priceLookup(tx, c3, {}, { zeroIfUnknown: true }), rq = E.compute(tx, fq), yq = E.byYear(rq)[2026].cessions;
      const A1 = P.alertAssets(tx, yq, fq, c3, {});
      eq(rq.cessions.length === 1 && isFinite(yq[0].l224) ? 1 : 0, 1, 'Récompense sans cours : résultat calculé');
      eq(A1.ign.join() === 'RWD' && !A1.est.includes('RWD') && !A1.retry.includes('RWD') ? 1 : 0, 1, 'Récompense seule sans cours : pas d’alerte ≈ ni de relance, signalée à part');
      eq(A1.est.includes('HLD') && A1.retry.includes('HLD') ? 1 : 0, 1, 'Crypto détenue (achetée) sans cours, nécessaire à la 212 : alerte et relance');
      const tx2 = tx.concat([{ id: 'q5', date: T1 + D, type: 'SELL', asset: 'HLD', qty: 1, eur: 5, fee: 0 }]), f2 = P.priceLookup(tx2, c3, {}, { zeroIfUnknown: true }), y2 = E.byYear(E.compute(tx2, f2))[2026].cessions;
      const A2 = P.alertAssets(tx2, y2, f2, c3, {}); eq(A2.est.includes('HLD') && A2.retry.includes('HLD') ? 1 : 0, 1, 'Crypto cédée sans cours : alerte et relance');
      const A3 = P.alertAssets(tx2, y2, f2, Object.assign({ 'HLD|none': 1 }, c3), {}); eq(A3.est.includes('HLD') && !A3.retry.includes('HLD') ? 1 : 0, 1, 'Cours inexistant (aucune source) : alerte mais pas de relance');
      const c4 = Object.assign({ [P.minKey('RWD', T1 - 30 * 60e3)]: 2 }, c3), f4 = P.priceLookup(tx, c4, {}, { zeroIfUnknown: true }); E.byYear(E.compute(tx, f4));
      eq(f4('RWD', T1) === 2 && !f4.unvalued.has('RWD') ? 1 : 0, 1, 'Récompense : cours à la minute proche réutilisé (valeur incluse à la 212)');
    }
    let n2 = 0; const mkFail = () => ({ series: async () => { n2++; return undefined; }, fxRange: async () => ({}), stats: {}, assetDiag: {} });
    const r2 = await P.prepareRetry(txr.slice(0, 2).concat([{ id: 'r9', date: T - 86400e3, type: 'BUY', asset: 'BBB', qty: 1, eur: 5, fee: 0 }]), mkFail, {}, () => {}, { unit: 1, maxTries: 4 });
    eq(r2.tries === 4 && r2.failed.length === 1 ? 1 : 0, 1, 'Plafond de tentatives : arrêt puis cours ≈ et « Relancer »');
  }
  { const A = require('fs').readFileSync(__dirname + '/app.js', 'utf8'), C = require('fs').readFileSync(__dirname + '/style.css', 'utf8');
    eq((A.match(/makePdf\(/g) || []).length, 1, 'PDF : un seul point de génération');
    const d = A.slice(A.indexOf('function downloadPdf'), A.indexOf('makePdf('));
    eq(/currentBlockers\(\)[\s\S]*if \(b\.length\) \{ pdfRefused\(b\); return false; \}[\s\S]*if \(pdfBusy\) return false/.test(d) ? 1 : 0, 1, 'PDF : blocage imposé dans la génération (erreur, double clic)');
    { const dd = A.slice(A.indexOf('function downloadPdf'), A.indexOf('function specialNote')), ih = require('fs').readFileSync(__dirname + '/index.html', 'utf8');
      eq(/showPdf\(/.test(dd) && !/\.download\s*=/.test(dd) ? 1 : 0, 1, 'PDF : affiché d’abord (aperçu), pas de téléchargement direct');
      eq(/id="pdfview"/.test(ih) && /id="pvsave"[^>]*>Enregistrer le PDF</.test(ih) ? 1 : 0, 1, 'Aperçu : bouton « Enregistrer le PDF » dans l’aperçu');
      eq(/a\.download = pvName/.test(A) && /getDocument\(/.test(A.slice(A.indexOf('async function showPdf'))) ? 1 : 0, 1, 'Aperçu rendu en images (pdf.js), enregistrement seulement sur demande'); }
    eq(/if \(e\.target\.id === 'pdfx'\) downloadPdf\(\);/.test(A) && !/alert\(/.test(d) ? 1 : 0, 1, 'PDF : le bouton lance directement la génération, message non bloquant');
    eq(/const RETRY_DELAY_MS = 1000, AUTO_MAX = 10;/.test(A) && /k <= 5 \? RETRY_DELAY_MS : RETRY_DELAY_MS \* Math\.min\(2 \*\* \(k - 5\), 10\)/.test(A) && !/Nouvelle tentative \$\{k\}/.test(A) && /après \$\{AUTO_MAX\} tentatives automatiques/.test(A) ? 1 : 0, 1, 'Relance auto : 1 s, plafond 10, backoff après la 5e, message final');
    eq(['fyear = +e.target.value', 'dirty = true; window.__kxDone', "data-del')) return; cancelAuto()", 'cancelAuto(); txs = []', 'cancelAuto(); save(); dirty = !!txs.length', 'seront effacés.\')) return; cancelAuto();'].filter(x => { const i = A.indexOf(x); return i > 0 && A.slice(Math.max(0, i - 60), i + x.length + 20).includes('cancelAuto()'); }).length, 6, 'Relance auto annulée : année, import, retrait de fichier, effacement, réinitialisation');
    eq(/renderResults\(\); bar\.end\(!failed\); scheduleAuto\(failed\);/.test(A) && /lastEst = new Set\(AA\.retry\.filter\(x => !unk\.includes\(x\)\)\)/.test(A) ? 1 : 0, 1, 'Relance auto : déclenchée après chaque calcul tant qu’un cours est estimé');
    const XP = require('fs').readFileSync(__dirname + '/export.js', 'utf8');
    eq(/id="precsum">\$\{esc\(precText\(PP\)\)\}<\/p>/.test(A) && !/`C\$\{i \+ 1\} \(/.test(A) ? 1 : 0, 1, 'Interface : résumé de précision seul, sans liste C1…Cn');
    eq(/c\.date\.slice\(0, 16\) \+ \(c\.prec \? '\\n' \+ c\.prec : ''\)/.test(XP) && /\['Précision des cours', x\.prec\]/.test(XP) && /Cours pris à la minute pour \$\{P\.m\} opération/.test(A) && /withPrec\(X\.exportData/.test(A) ? 1 : 0, 1, 'PDF et interface : précision par cession + « Cours pris à la minute pour X opérations sur Y »');
    eq(['calc', 'imports', 'holders', 'import', 'cours', 'estime'].every(k => A.includes("k: '" + k + "'")) ? 1 : 0, 1, 'PDF : 6 causes bloquantes');
    eq(/#pdfx\.off\{/.test(C) && /aria-disabled/.test(A) ? 1 : 0, 1, 'PDF : bouton grisé + aria-disabled');
    }
  { const pv = (require('fs').readFileSync(__dirname + '/index.html', 'utf8').match(/<dialog id="privacy"[\s\S]*?<\/dialog>/) || [''])[0];
    eq(!/<h3>Publicit|pub vidéo|régie|fictive/i.test(pv) && /pas de publicité/.test(pv) && !new RegExp(['rev', 'olut'].join(''), 'i').test(pv) ? 1 : 0, 1, 'Vie privée : aucune publicité, décrit honnêtement'); }
  { const ih = require('fs').readFileSync(__dirname + '/index.html', 'utf8'), C = require('fs').readFileSync(__dirname + '/style.css', 'utf8'), AP = require('fs').readFileSync(__dirname + '/app.js', 'utf8');
    eq(!/adslot|adrail|adimg|adhit|admsg|adrimg|emplacement réservé/.test(ih + C) && !/CHOC|Barthyl/.test(ih + AP) ? 1 : 0, 1, 'Pub : plus aucun encart (latéraux, bas, mobile), ni CSS associé');
    eq(!/ad\.js|adgate|av-slide|av-skip|KryptaxAd|adDone|adSeen|openAdGate|Passer la pub|Espace publicitaire|Votre annonce ici/.test(ih + C + AP) && !require('fs').existsSync(__dirname + '/ad.js') && /header,main\{max-width:768px;/.test(C) ? 1 : 0, 1, 'Pub : aucune publicité (ni vidéo, ni ad.js, ni CSS/JS associé)'); }
  { const ih = require('fs').readFileSync(__dirname + '/index.html', 'utf8'); eq(/<footer><span class="law">Art\. 150 VH bis CGI[^<]*art\. 200 C CGI[^<]*<\/span>(<span class="disclaim">[^<]*<\/span>)?<\/footer>/.test(ih) && !(/code ouvert/i.test(ih.match(/<footer>[\s\S]*<\/footer>/)[0]) || new RegExp(['rev', 'olut'].join(''), 'i').test(ih.match(/<footer>[\s\S]*<\/footer>/)[0])) ? 1 : 0, 1, 'Pied de page : articles de loi (150 VH bis, 200 C)'); }
  { // Fuseaux (données fictives) : relevés en UTC, affichage et année fiscale en heure de Paris
    const u = (s, tz) => E.parseDate(s, 'DMY', tz);
    eq(E.fmtParis(u('27 sept. 2026, 00:13:00', 'UTC')) === '27/09/2026 02:13' ? 1 : 0, 1, 'Relevé UTC 27/09 00:13 → 02:13 heure de Paris (été, UTC+2)');
    eq(E.fmtParis(u('03/06/2026 09:14', 'UTC')) === '03/06/2026 11:14' ? 1 : 0, 1, 'Relevé UTC 03/06 09:14 → 11:14 heure de Paris');
    eq(E.fmtParis(u('15/01/2026 09:14', 'UTC')) === '15/01/2026 10:14' ? 1 : 0, 1, 'Hiver : UTC+1');
    eq(u('03/06/2026 09:14', 'UTC') === Date.UTC(2026, 5, 3, 9, 14) ? 1 : 0, 1, 'Instant UTC exact pour les cours (pas 2 h trop tôt)');
    eq(u('03/06/2026 11:14', 'Paris') === Date.UTC(2026, 5, 3, 9, 14) ? 1 : 0, 1, 'Heure de Paris saisie → même instant UTC');
    eq(E.fmtParis(Date.UTC(2026, 2, 29, 0, 59)) === '29/03/2026 01:59' && E.fmtParis(Date.UTC(2026, 2, 29, 1, 0)) === '29/03/2026 03:00' ? 1 : 0, 1, 'Bascule été (29/03/2026) : 01:59 → 03:00');
    eq(E.fmtParis(Date.UTC(2026, 9, 25, 0, 30)) === '25/10/2026 02:30' && E.fmtParis(Date.UTC(2026, 9, 25, 1, 30)) === '25/10/2026 02:30' ? 1 : 0, 1, 'Bascule hiver (25/10/2026) : 02:30 deux fois');
    eq(u('25/10/2026 04:00', 'Paris') === Date.UTC(2026, 9, 25, 3) && u('24/10/2026 23:00', 'Paris') === Date.UTC(2026, 9, 24, 21) ? 1 : 0, 1, 'Jour de bascule : Paris → UTC correct de part et d’autre');
    eq(E.fmtParis(u('05/07/2026 22:41', 'UTC')) === '06/07/2026 00:41' ? 1 : 0, 1, 'Changement de jour : 22:41 UTC → lendemain 00:41 à Paris');
    const tY = u('31/12/2025 23:30', 'UTC');
    eq(E.parisYear(tY) === 2026 && new Date(tY).getUTCFullYear() === 2025 ? 1 : 0, 1, 'Frontière du 31/12 : 23:30 UTC = 01/01 00:30 à Paris → année fiscale 2026');
    const TY = [{ id: 'y1', date: Date.UTC(2025, 0, 2), type: 'BUY', asset: 'AAA', qty: 2, eur: 20, fee: 0 }, { id: 'y2', date: tY, type: 'SELL', asset: 'AAA', qty: 1, eur: 30, fee: 0 }];
    const BY = E.byYear(E.compute(TY, () => 30)); eq(BY[2026] && !BY[2025] ? 1 : 0, 1, 'Cession 31/12 23:30 UTC rangée en 2026 (date de cession en heure de Paris)');
  }
  const app = require('fs').readFileSync(__dirname + '/app.js', 'utf8');
  eq(/id="csv"|id="xlsx"/.test(app) ? 1 : 0, 0, 'Interface : export PDF seul (CSV et xlsx retirés)');
  eq(/isUnlocked|cadenas|🔒/.test(app) ? 1 : 0, 0, 'PDF sans verrou');
  { const ih = require('fs').readFileSync(__dirname + '/index.html', 'utf8'), d = (ih.match(/<dialog id="donepop"[\s\S]*?<\/dialog>/) || [''])[0];
    eq(/Formulaire 2086 généré avec succès/.test(d) && /id="donego"[^>]*>Voir mon formulaire/.test(d) && /aria-live="polite"/.test(d) && /id="doneclose"/.test(d) && !/style=|<script/.test(d) ? 1 : 0, 1, 'Popup de fin : titre, bouton résultats, croix, aria-live, sans inline');
    eq(/scheduleAuto\(failed\); if \(!failed\) showDone\(\);/.test(app) && /end\(ok\) \{ clearInterval\(timer\); if \(!ok\) \{ live = false;/.test(app) && /const fin = \(\) => \{ fin0 = performance\.now\(\);/.test(app) && /if \(live && /.test(app) ? 1 : 0, 1, 'Fin de calcul : cadre de chargement retiré, popup seulement si réussi'); }
  eq(!/Nouvelle tentative \$\{k\}/.test(app) && /const quiet = autoTry > 0;/.test(app) && /if \(!quiet\) w\.hidden = false/.test(app) && /autoInd\(true\)/.test(require('fs').readFileSync(__dirname + '/app.js', 'utf8')) && /id="autoind"[^>]*aria-live="polite"[^>]*hidden>/.test(require('fs').readFileSync(__dirname + '/index.html', 'utf8')) ? 1 : 0, 1, 'Relance auto discrète : ni barre ni compte à rebours, petit indicateur');
  eq(/if \(btn && !b\.length && !runCtl\) \{ btn\.click\(\); return; \}/.test(app) && /if \(btn && b\.length\) pdfRefused\(b\);/.test(app) ? 1 : 0, 1, 'Popup : « Voir mon formulaire » = parcours Voir le PDF (pub puis aperçu), sinon explique pourquoi');
  // Transferts entre mes comptes (données FICTIVES) : jamais une cession, PRU et 212 corrects
  { const D = (m, d) => Date.UTC(2025, m, d, 10), P = a => a === 'BTC' ? 40000 : null, H = 3600e3;
    const base = () => [{ id: 'b1', date: D(0, 5), type: 'BUY', asset: 'BTC', qty: 1, eur: 30000, fee: 100 }], sell = () => ({ id: 's9', date: D(5, 1), type: 'SELL', asset: 'BTC', qty: 0.1, eur: 4000, fee: 0 });
    const ref = E.compute([...base(), sell()], P).cessions[0];
    let T = [...base(), { id: 'w1', date: D(1, 1), type: 'SEND', asset: 'BTC', qty: 0.9995, feeQty: 0.0005, eur: 0, source: 'A.csv' }, { id: 'd1', date: D(1, 1) + 10 * 60e3, type: 'RECEIVE', asset: 'BTC', qty: 0.9995, eur: 0, source: 'B.csv' }, sell()];
    E.detectSwaps(T); let r = E.compute(T, P);
    eq(T[1].xferWith === 'd1' && T[2].xferWith === 'w1' && !E.openSends(T).length ? 1 : 0, 1, 'Transfert : retrait A + dépôt B appariés');
    eq(r.cessions.length, 1, 'Transfert : seule la vente est une cession'); eq(r.cessions[0].l212, 0.9995 * 40000, 'Transfert : 212 = solde réel (frais réseau déduits)');
    eq(r.cessions[0].l220, 30100, 'Transfert : 220 inchangé'); eq(r.cessions[0].l221, 0, 'Transfert : 221'); eq(r.cessions[0].l224, 4000 - 30100 * 4000 / (0.9995 * 40000), 'Transfert : 224');
    T = [...base(), { id: 'w2', date: D(1, 1), type: 'SEND', asset: 'BTC', qty: 1, eur: 0 }, { id: 'f2', date: D(1, 1), type: 'FEE', asset: 'BTC', qty: 0.0005, eur: 0 }, { id: 'd2', date: D(1, 1) + 2 * H, type: 'RECEIVE', asset: 'BTC', qty: 0.9995, eur: 0 }, sell()];
    E.detectSwaps(T); r = E.compute(T, P); eq(T[1].xferWith === 'd2' && r.cessions.length === 1 ? 1 : 0, 1, 'Transfert : frais réseau en ligne séparée, apparié, non imposable');
    T = [...base(), { id: 'w3', date: D(1, 1), type: 'SEND', asset: 'BTC', qty: 1, eur: 35000 }, { id: 'd3', date: D(1, 1) + 1, type: 'RECEIVE', asset: 'BTC', qty: 1, eur: 35000 }, sell()];
    E.detectSwaps(T); r = E.compute(T, P); eq(r.cessions.length === 1 && r.cessions[0].l220 === 30100 ? 1 : 0, 1, 'Transfert valorisé : ni cession ni 220 gonflé');
    T = [...base(), { id: 'w4', date: D(1, 1), type: 'SEND', asset: 'BTC', qty: 1 }, { id: 'd4', date: D(1, 1) + 49 * H, type: 'RECEIVE', asset: 'BTC', qty: 1 }, { id: 'w5', date: D(2, 1), type: 'SEND', asset: 'BTC', qty: 0.5 }, { id: 'd5', date: D(2, 1) + H, type: 'RECEIVE', asset: 'BTC', qty: 0.6 }];
    E.detectSwaps(T); eq(E.openSends(T).length, 2, 'Transfert : dépôt après 48 h ou supérieur au retrait non apparié');
    for (const s of ['Withdrawal', 'Deposit', 'Transfer out', 'Transfer in', 'Retrait', 'Dépôt']) eq(['SEND', 'RECEIVE'].includes(E.guessType(s, true)) ? 1 : 0, 1, 'Type transfert reconnu : ' + s);
    // Retrait seul (portefeuille B non importé) : à qualifier ; sans choix, 212 serait sous-évalué
    const one = c => { const L = [{ id: 'b1', date: D(0, 5), type: 'BUY', asset: 'BTC', qty: 1, eur: 30000, fee: 0 }, { id: 'w6', date: D(1, 1), type: 'SEND', asset: 'BTC', qty: 0.9, feeQty: 0.001, eur: 0 }, { id: 's6', date: D(5, 1), type: 'SELL', asset: 'BTC', qty: 0.1, eur: 4000, fee: 0 }]; if (c) L[1].sendChoice = c; E.detectSwaps(L); return { L, r: E.compute(L, () => 40000).cessions[0] }; };
    eq(E.openSends(one().L).length, 1, 'Retrait sans dépôt : signalé, à qualifier'); eq(E.openSends(one('own').L).length, 0, 'Retrait qualifié : plus bloquant');
    eq(one('own').r.l212, 0.999 * 40000, 'Retrait « vers mon portefeuille non importé » : reste dans 212 (hors frais)'); eq(one('own').r.l224, 4000 - 30000 * 4000 / 39960, 'Retrait « mon portefeuille » : 224 correct');
    { const g = one('gift'), rg = E.compute(g.L, () => 40000); eq(g.r.l212, 0.099 * 40000, 'Retrait « Frais, perte ou don » : retiré du solde'); eq(rg.cessions.length === 1 && rg.cessions[0].tx.id === 's6' && rg.cessions[0].l220 === 30000 ? 1 : 0, 1, 'Retrait « Frais, perte ou don » : aucune ligne 211+, 220 inchangé'); }
    { const sl = one('sale'), rs = E.compute(sl.L, () => 40000), c0 = rs.cessions[0], need = E.neededPrices(sl.L);
      eq(rs.cessions.length, 2, 'Retrait « Paiement ou vente oubliée » : devient une cession (211+)'); eq(c0.tx.id === 'w6' && c0.fromSend ? 1 : 0, 1, 'Retrait « Paiement ou vente oubliée » : cession à la date du retrait');
      eq(c0.l213, 0.9 * 40000, 'Retrait « Paiement ou vente oubliée » : 213 = quantité × cours du moment'); eq(c0.l212, 40000, 'Retrait « Paiement ou vente oubliée » : 212 = portefeuille avant la sortie');
      eq(c0.l224, 36000 - 30000 * 36000 / 40000, 'Retrait « Paiement ou vente oubliée » : 224'); eq(need.some(n => n.asset === 'BTC' && n.txId === 'w6') ? 1 : 0, 1, 'Retrait « Paiement ou vente oubliée » : cours du moment demandé aux fournisseurs');
      const rn = E.compute(sl.L, () => null).cessions[0]; eq(rn.l224 === null && rn.missing.includes('BTC') ? 1 : 0, 1, 'Retrait « Paiement ou vente oubliée » sans cours : à renseigner, jamais 0 €'); } eq(one('ignore').r.l212, 40000, 'Retrait « Ignorer » : aucun effet');
    const AP = require('fs').readFileSync(__dirname + '/app.js', 'utf8'), IH = require('fs').readFileSync(__dirname + '/index.html', 'utf8');
    eq(/E\.openSends\(txs\)\.length; if \(n\) b\.push\(\{ k: 'xfer'/.test(AP) && /Vers mon portefeuille non importé/.test(AP) && /Frais, perte ou don/.test(AP) && /'sale', 'Paiement ou vente oubliée'/.test(AP) && /'ignore', 'Ignorer'/.test(AP) && /id="xfers"/.test(IH) ? 1 : 0, 1, 'Retraits sans dépôt : choix obligatoire avant l’export PDF'); }
  { const AP = require('fs').readFileSync(__dirname + '/app.js', 'utf8'), IH = require('fs').readFileSync(__dirname + '/index.html', 'utf8');
    eq(/<p class="kofifoot"><button type="button" id="whyopen"[^>]*>.*Pourquoi Kryptax \?.*<\/button><a id="kofi2"[^>]*target="_blank" rel="noopener noreferrer" aria-label="Soutenir Kryptax, merci" hidden><span aria-hidden="true">☕ Soutenir Kryptax 🙏<\/span><\/a><\/p>/.test(IH) && /<dialog id="why" aria-labelledby="whytitle">[\s\S]*Pourquoi j'ai créé Kryptax[\s\S]*plus de 40 € rien que pour un PDF\.[\s\S]*un petit café fait toujours plaisir ☕<\/p>/.test(IH) && !new RegExp(['rev', 'olut'].join(''), 'i').test(IH) && !/srcbtn|Code source/.test(IH+AP) && /k2\.href = KOFI_URL; k2\.hidden = false;/.test(AP) && /const KOFI_URL = 'https:\/\/ko-fi\.com\/sanarkor';/.test(AP) && /const KOFI_NOTE = false;/.test(AP) && /n\.hidden = !\(kofiReal && KOFI_NOTE\)/.test(AP) && !/fetch\(KOFI_URL/.test(AP) && /Page de test — le lien Ko-fi de Kryptax arrivera ici/.test(require('fs').readFileSync(__dirname+'/don-test.html','utf8')) && !/<script|https?:\/\//.test(require('fs').readFileSync(__dirname+'/don-test.html','utf8')) && /<a id="kofi" class="btn kofi" target="_blank" rel="noopener noreferrer" aria-label="Soutenir Kryptax, merci" hidden>☕ Soutenir Kryptax 🙏<\/a>/.test(IH) && /<div id="kofinote" hidden>/.test(IH) ? 1 : 0, 1, 'Ko-fi : boutons vers ko-fi.com/sanarkor, page de test gardée (sans script externe), mention « Dons » masquée tant que le paiement n’est pas connecté');
    eq(/function savePdf\(\) \{ showKofi\(\);/.test(AP) && /u\.hostname === 'ko-fi\.com'/.test(AP) && /aucune donnée à Ko-fi/.test(IH) ? 1 : 0, 1, 'Ko-fi : affiché après l’enregistrement du PDF, URL Ko-fi vérifiée, mention vie privée'); }
  eq(require('fs').readFileSync(__dirname + '/index.html', 'utf8').includes('<p>Éditeur : Damien M. alias « Sanarkor ». Hébergement : GitHub Pages (GitHub, Inc.).</p>') ? 1 : 0, 1, 'Mentions : éditeur Damien M. alias « Sanarkor »');
  process.exit(ok ? 0 : 1);
})();
{const h=require('fs').readFileSync(__dirname+'/index.html','utf8');if(!/<p class="sub2">Gratuit, open-source et anonyme : gardez le contrôle total de vos données\.<\/p>/.test(h))throw new Error('sub2 manquant');if(/gardez le contrôle total/.test(require('fs').readFileSync(__dirname+'/export.js','utf8')))throw new Error('sub2 dans PDF');console.log('sub2 ok');}
{const C=require('fs').readFileSync(__dirname+'/style.css','utf8');const h=/0 0 6px rgba\(255,255,255,\.35\)/;const a=(C.match(/header \.sub\{font-size:1\.04em[^}]*\}/)||[''])[0],b=(C.match(/header \.sub2\{[^}]*\}/)||[''])[0];if(!h.test(a)||!h.test(b))throw new Error('halo sous-titres');console.log('halo ok');}
