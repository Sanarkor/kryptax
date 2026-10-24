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
eq(new Date(E.parseDate('13/01/2024 15:45')).getMonth(), 0, 'date FR'); eq(new Date(E.parseDate('Jan 13, 2024, 3:45:12 PM')).getHours(), 15, 'date EN Revolut');
// Format Revolut .xlsx (valeurs fictives)
eq(E.parseNum('68â_x0080_¯116,39â_x0082_¬'), 68116.39, 'montant mojibake'); eq(E.currencyOf(E.fixText('20,19$')) === 'USD' ? 1 : 0, 1, 'devise USD');
eq(E.guessType('RÃ©compenseÂ\u00a0Apprendre') === 'INTEREST' ? 1 : 0, 1, 'récompense Learn'); eq(E.guessType('Vendre - Revolut X') === 'SELL' ? 1 : 0, 1, 'Vendre Revolut X');
eq(new Date(E.parseDate('15 juil. 2026, 12:30:25')).getMonth(), 6, 'date FR juil.'); eq(new Date(E.parseDate('17 mai 2026, 00:09:10')).getDate(), 17, 'date FR mai');
eq(E.fixQty(81033368, 1.23, 100).qty, 81.033368, 'quantité tronquée XRP'); eq(E.fixQty(73403, 68116.39, 50).qty, 0.00073403, 'quantité tronquée BTC');
process.exit(ok ? 0 : 1);
