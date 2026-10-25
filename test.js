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
  const x = X.exportData(Y, S, rows, T), csv = X.makeCsv(x).split('\n');
  eq(r.cessions.length, 18, 'Export : 18 cessions calculées'); eq(x.cessions.length, 18, 'Export : 18 lignes de cession exportées');
  eq(x.swapCount, 4, 'Export : 4 échanges exclus comptés (non listés)'); eq(csv.some(l => /Soldes|Revenus/.test(l)) ? 1 : 0, 0, 'Export : pas de soldes ni de revenus');
  const i0 = csv.indexOf('CESSIONS (2086)'); eq(csv.slice(i0 + 2).findIndex(l => l === ''), 19, 'CSV : 18 lignes sous CESSIONS + 1 ligne GLOBAL'); eq(csv[i0 + 2 + 18].split(';')[1] === 'GLOBAL' ? 1 : 0, 1, 'CSV : ligne GLOBAL en fin de tableau');
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
  const yo = X.yearOptions(Y, 2026); eq(yo[0], 2026, 'Années : commence en 2026 (2025 non proposée)'); eq(yo[yo.length - 1], 2028, 'Années : jusqu’à la dernière année des données'); eq(X.yearOptions({}, 2026).length, 2, 'Années sans données : 2026 et 2027');
  eq(X.defaultYear(Y, 2026), 2028, 'Année par défaut : la plus récente avec cessions'); eq(X.defaultYear({}, 2026), 2026, 'Année par défaut sans cession : 2026');
  const x26 = X.exportData(Y, {}, () => [], T, 2026), all = X.exportData(Y, {}, () => [], T);
  eq(x26.cessions.length, 2, 'Export 2026 : seulement les 2 cessions de 2026'); eq(x26.totals.length, 1, 'Export 2026 : une seule ligne GLOBAL');
  eq(x26.cessions.every(c => c.year === 2026) ? 1 : 0, 1, 'Export 2026 : aucune cession d’une autre année');
  const c26 = all.cessions.filter(c => c.year === 2026); eq(x26.cessions[0].l221, c26[0].l221, 'Cumulatif : l. 221 de 2026 tient compte de la cession 2025');
  eq(x26.cessions[0].l221 > 0 ? 1 : 0, 1, 'Cumulatif : l. 221 > 0 grâce à 2025'); eq(x26.cessions[0].l220, 500, 'Cumulatif : prix total d’acquisition depuis le premier achat');
  eq(x26.totals[0].l213, 300, 'GLOBAL 2026 : 213 = 300'); eq(x26.totals[0].l224, +(x26.cessions[0].l224 + x26.cessions[1].l224).toFixed(2), 'GLOBAL 2026 = somme des 224 de 2026');
  eq(X.makeCsv(x26).includes('Année 2026 — déclaration 2027') ? 1 : 0, 1, 'CSV : titre « Année 2026 — déclaration 2027 »');
  const x27 = X.exportData(Y, {}, () => [], T, 2027); eq(x27.cessions.length, 0, 'Année sans cession : aucune ligne'); eq(x27.totals[0].n, 0, 'Année sans cession : GLOBAL à 0 cession'); eq(x27.totals[0].l224, 0, 'Année sans cession : total 0');
  eq(X.makeCsv(x27).includes('Année 2027 — déclaration 2028') ? 1 : 0, 1, 'CSV année vide : titre cohérent');
}
// Messages après calcul : « ✅ Aucune erreur » ou erreur courte, pas de compteur ni « Calcul terminé »
{ const A = require('fs').readFileSync(__dirname + '/app.js', 'utf8');
  eq(A.includes('✅ Aucune erreur') ? 1 : 0, 1, 'Message « ✅ Aucune erreur » présent'); eq(/textContent = 'Calcul terminé|transactions importées, dont/.test(A) ? 1 : 0, 0, 'Pas de « Calcul terminé » ni de compteur de transactions'); }
// CSP : chaque hôte appelé par le code doit figurer dans connect-src
{
  const fs = require('fs'), html = fs.readFileSync(__dirname + '/index.html', 'utf8'), csp = (html.match(/connect-src ([^;"]*)/) || [])[1] || '';
  const hosts = [...new Set((fs.readFileSync(__dirname + '/pipeline.js', 'utf8') + fs.readFileSync(__dirname + '/app.js', 'utf8')).match(/https:\/\/[a-z0-9.-]+/g))].filter(h => !/impots|github/.test(h));
  const miss = hosts.filter(h => !csp.split(/\s+/).includes(h)); eq(miss.length, 0, 'CSP connect-src couvre tous les hôtes appelés' + (miss.length ? ' (manque ' + miss.join(', ') + ')' : ''));
}
process.exit(ok ? 0 : 1);
