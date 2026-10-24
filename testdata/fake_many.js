// Jeu FICTIF : 18 cessions, 5 actifs, échanges, revenus, frais — utilisé par test.js et testexport.js
module.exports = function () {
  const T = [], A = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE'], D = (m, d, h) => Date.UTC(2026, m, d, h || 10);
  let id = 0; const add = o => T.push(Object.assign({ id: 'f' + (++id), fee: 0 }, o));
  A.forEach((a, i) => add({ date: D(0, 2 + i), type: 'BUY', asset: a, qty: 100, eur: 500 + 100 * i, fee: 2, feeInKind: true, rawType: 'Achat' }));
  for (let k = 0; k < 18; k++) add({ date: D(1 + (k % 10), 3 + k, 12), type: 'SELL', asset: A[k % 5], qty: 3, eur: 30 + k, fee: 0.2 });
  for (let k = 0; k < 4; k++) { const t = D(2, 20 + k, 15); add({ date: t, type: 'EXCH_OUT', asset: 'AAA', qty: 2, eur: 12, swapAuto: true, swapWith: 'f' + (id + 2) }); add({ date: t, type: 'EXCH_IN', asset: 'BBB', qty: 2, eur: 12, swapAuto: true }); }
  for (let k = 0; k < 3; k++) add({ date: D(4, 1 + k), type: 'INTEREST', asset: 'EEE', qty: 1, eur: 0, rawType: 'Récompense Apprendre' });
  return T;
};
