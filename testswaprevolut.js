// node testswaprevolut.js — v2.65 : relevé Revolut, échanges crypto→crypto reconnus sans question quand la preuve est forte
// (même seconde, même relevé, correspondance unique, journal en devises présent sans ligne « Vente de / Achat de »). Données FICTIVES.
const E = require('./engine.js'); let ok = true, n = 0;
const chk = (c, m) => { n++; ok = ok && !!c; console.log((c ? 'OK  ' : 'ÉCHEC ') + m); };
const P = a => ({ BTC: 50000, ETH: 2500, SOL: 100, USDC: 0.9, XRP: 2 })[a], F = 'releve_fictif.pdf';
const T0 = Date.UTC(2026, 4, 20, 10, 17, 42), T1 = Date.UTC(2026, 4, 22, 8, 5, 9), T2 = Date.UTC(2026, 5, 3, 14, 0, 1);
const tx = (id, date, type, asset, qty, eur, x) => Object.assign({ id, date, type, asset, qty, eur, fee: 0, platform: 'Relevé', source: F }, x || {});
// Journal en devises du relevé (format du relevé : « JJ mois AAAA, hh:mm:ss … - Achat de X »), heures UTC
const LEDGER = ['2 mai 2026, 09:00:00 Transfer to Revolut Digital Assets Europe Ltd - Achat de BTC 3 000,00€ 3 000,00€',
  '3 mai 2026, 09:00:00 Transfer to Revolut Digital Assets Europe Ltd - Achat de ETH 4 000,00€ 0,00€',
  '22 mai 2026, 08:05:09 Transfer from Revolut Digital Assets Europe Ltd - Vente de ETH 2 500,00€ 2 500,00€',
  '22 mai 2026, 08:05:09 Transfer to Revolut Digital Assets Europe Ltd - Achat de XRP 2 450,00€ 50,00€',
  '3 juin 2026, 14:00:01 Transfer from Revolut Digital Assets Europe Ltd - Vente de BTC 500,00€ 550,00€'].join('\n');
// Cas de Damien reproduit : 2 échanges à la même seconde (Revolut X via USDC, et Vente/Achat), 1 vraie vente € + achat € à la même seconde, 1 vente € seule.
const base = () => [tx('b0', Date.UTC(2026, 4, 2, 9), 'BUY', 'BTC', 0.06, 3000), tx('b1', Date.UTC(2026, 4, 3, 9), 'BUY', 'ETH', 1.6, 4000),
  tx('s1', T0, 'SELL', 'BTC', 0.02, 1000, { rawType: 'Vente' }), tx('i1', T0, 'BUY', 'SOL', 9.5, 942, { rawType: 'Achat' }), // −5,8 %, même seconde, pas de ligne fiat
  tx('s2', T0 + 3600e3, 'SELL', 'SOL', 4, 400, { rawType: 'Vendre - Revolut X' }), tx('i2', T0 + 3600e3, 'BUY', 'USDC', 441, 396, { rawType: 'Acheter - Revolut X' }), // −1 %
  tx('s3', T1, 'SELL', 'ETH', 1, 2500), tx('i3', T1, 'BUY', 'XRP', 1220, 2450), // vraie vente € + achat € (lignes fiat)
  tx('s4', T2, 'SELL', 'BTC', 0.01, 500)];
const cnt = T => T.filter(t => E.isCess(t)).length;
// 1) parseFiatLegs : ventes et achats, heure à la seconde, mois en français
{ const L = E.parseFiatLegs(LEDGER); chk(L.length === 5 && L[2].side === 'SELL' && L[2].asset === 'ETH' && L[2].date === T1 && L[3].side === 'BUY' && L[4].date === T2, 'Journal en devises : 5 lignes (2 ventes, 3 achats), date à la seconde en UTC'); }
// 2) Avant v2.65 (relevé non marqué) : 3 rapprochements à confirmer -> 3 cessions provisoires en plus (le bug signalé)
{ const T = base(), p = E.detectSwaps(T, { choices: {} }); chk(p.length === 0 && p.pending.length === 3 && cnt(T) === 4, 'Sans journal : 3 rapprochements à confirmer, 4 cessions dont 3 provisoires (comportement v2.62–v2.64)'); }
// 3) v2.65 : relevé marqué -> 2 échanges prouvés sans question, la vraie vente reste une cession, aucun rapprochement à confirmer
{ const T = base(), m = E.markStatementLegs(T, LEDGER), p = E.detectSwaps(T, { choices: {} }), by = id => T.find(t => t.id === id);
  chk(m === 9 && by('s3').fiatLeg === 1 && by('i3').fiatLeg === 1 && by('s1').fiatLeg === 0 && by('s1').stmtLedger === 1, 'Marquage : 9 lignes couvertes par le journal ; vente ETH et achat XRP ont leur ligne fiat');
  chk(p.length === 2 && p.pending.length === 0 && p.every(x => x.how === 'proof' && x.kind === 'releve') && by('s1').swapProof === 'releve' && by('i2').type === 'EXCH_IN', 'Relevé : 2 échanges prouvés (même seconde, sans ligne fiat), 0 question');
  chk(by('s3').type === 'SELL' && by('i3').type === 'BUY' && !by('s3').swapPending && by('s4').type === 'SELL' && cnt(T) === 2, 'Vente € (ligne « Vente de ») : cession, jamais appariée ; 2 cessions au lieu de 4');
  // résultat identique à « tout confirmé comme échanges » à la main (v2.61), et mêmes cours demandés
  const U = base(); E.detectSwaps(U, { choices: {} }); const ch = {}; E.detectSwaps(U, { choices: {} }).pending.filter(x => x.out.id !== 's3').forEach(x => ch[x.key] = 'swap'); E.detectSwaps(U, { choices: ch });
  const r = E.compute(T, P), u = E.compute(U, P), f = R => R.cessions.map(c => c.asset + ':' + c.l212.toFixed(2) + ':' + c.l224.toFixed(2)).join('|');
  chk(f(r) === f(u) && r.cessions.length === 2, 'Résultat identique aux échanges confirmés à la main : ' + f(r));
  const need = R => JSON.stringify(E.neededPrices(R).map(x => x.asset + '@' + x.ts));
  chk(need(T) === need(U), 'Cours demandés : exactement les mêmes que si les échanges étaient confirmés (aucun cours en plus pour les jambes d’échange)'); }
// 4) Cas ambigus : restent à confirmer
{ const T = base(); T.find(t => t.id === 'i1').date = T0 + 3000; E.markStatementLegs(T, LEDGER); const p = E.detectSwaps(T, { choices: {} });
  chk(p.length === 1 && p.pending.length === 1 && p.pending[0].out.id === 's1', '3 s d’écart : à confirmer (pas une preuve)'); }
{ const T = base().concat([tx('i9', T0, 'BUY', 'XRP', 480, 960)]); E.markStatementLegs(T, LEDGER); const p = E.detectSwaps(T, { choices: {} });
  chk(p.length === 1 && p.pending.length >= 1 && p.pending.every(x => x.out.id === 's1') && p.pending.some(x => x.multi), 'Deux achats possibles à la même seconde : à confirmer (correspondance multiple)'); }
{ const T = base(); T.find(t => t.id === 'i1').source = 'autre.pdf'; E.markStatementLegs(T, LEDGER); const p = E.detectSwaps(T, { choices: {} });
  chk(p.pending.length === 1 && p.pending[0].out.id === 's1', 'Jambes de deux fichiers différents : à confirmer'); }
{ const T = base(); E.markStatementLegs(T, LEDGER.split('\n').slice(0, 2).join('\n')); const p = E.detectSwaps(T, { choices: {} });
  chk(T.find(t => t.id === 'b1').stmtLedger === 1 && ['s1', 's2', 's3', 's4'].every(id => T.find(t => t.id === id).stmtLedger == null), 'Journal ne couvrant que début mai : opérations suivantes non marquées');
  chk(p.length === 0 && p.pending.length === 3, 'Hors de la période du journal : rapprochements à confirmer (pas de preuve)'); }
{ const T = base(); T.find(t => t.id === 'i3').fiatLeg = 0; E.markStatementLegs(T, LEDGER.split('\n').filter(l => !/Achat de XRP/.test(l)).join('\n')); const p = E.detectSwaps(T, { choices: {} });
  chk(!p.some(x => x.out.id === 's3') && !p.pending.some(x => x.out.id === 's3'), 'Une seule jambe avec ligne fiat (vente vers €) : jamais un échange, pas de question'); }
// 5) Choix antérieurs : une preuve « relevé » l'emporte sur un ancien « distincts » ; « Forcer imposable » reste possible
{ const T = base(); const k = E.swapKey(T[2], T[3]); E.markStatementLegs(T, LEDGER); const p = E.detectSwaps(T, { choices: { [k]: 'separate' } });
  chk(p.length === 2 && p.refused.length === 0, 'Ancien choix « distincts » (cliqué en v2.62–v2.64) : remplacé par la preuve du relevé');
  T[2].swapForce = T[3].swapForce = 'taxable'; const q = E.detectSwaps(T, { choices: {} }); chk(q.length === 1 && T[2].type === 'SELL', '« Forcer imposable » sur un échange prouvé : appliqué'); }
// 6) Sans marque (autre format) : comportement v2.62 inchangé
{ const T = base().map(t => Object.assign(t, { platform: 'CSV', source: 'x.csv' })); const p = E.detectSwaps(T, { choices: {} }); chk(p.length === 0 && p.pending.length === 3, 'CSV sans journal : rapprochements toujours à confirmer'); }
console.log(ok ? 'testswaprevolut : tout est OK (' + n + ')' : 'testswaprevolut : ÉCHEC'); process.exit(ok ? 0 : 1);
