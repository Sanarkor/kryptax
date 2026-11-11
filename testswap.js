// node testswap.js — v2.62 : rapprochements vente/achat (échange crypto→crypto) : preuve, confirmation, refus, ambiguïtés. Données FICTIVES, attendus calculés à la main.
const E = require('./engine.js'), fs = require('fs'); let ok = true, n = 0;
const chk = (c, m) => { n++; ok = ok && !!c; console.log((c ? 'OK  ' : 'ÉCHEC ') + m); };
const T0 = Date.UTC(2025, 3, 10, 12, 0, 0), P = a => ({ BTC: 100000, ETH: 2350, SOL: 100, USDC: 0.92 })[a];
const base = () => [{ id: 'b0', date: Date.UTC(2025, 0, 2), type: 'BUY', asset: 'BTC', qty: 0.1, eur: 3000, fee: 0, source: 'f.csv' },
  { id: 's', date: T0, type: 'SELL', asset: 'BTC', qty: 0.05, eur: 5000, fee: 0, source: 'f.csv' },
  { id: 'b', date: T0 + 4000, type: 'BUY', asset: 'ETH', qty: 2, eur: 4700, fee: 0, source: 'f.csv' }];
const key = T => E.swapKey(T[1], T[2]);
// 1) Vraie vente € + achat proche (4 s, −6 %) : AVANT v2.62 fusionnée en échange (PV 3 500 cachée). Maintenant : à confirmer, calcul provisoire imposable.
{ const T = base(), p = E.detectSwaps(T, { choices: {} }), r = E.compute(T, P);
  chk(p.length === 0 && p.pending.length === 1 && T[1].type === 'SELL' && T[1].swapPending && T[2].swapPending, 'Vente € + achat à 4 s : rapprochement À CONFIRMER, rien appliqué');
  chk(r.cessions.length === 1 && r.cessions[0].l212 === 10000 && +r.cessions[0].l224.toFixed(2) === 3500, 'Calcul provisoire : 212 = 10 000, PV = 5 000 − 3 000 × 5 000 / 10 000 = 3 500 (pas masquée)'); }
// 2) Échange confirmé (sans soulte) : aucune cession, 220 = 3 000 (l’ETH reçu n’ajoute rien)
{ const T = base(), c = { [key(base())]: 'swap' }, p = E.detectSwaps(T, { choices: c }), r = E.compute(T, P);
  chk(p.length === 1 && p[0].how === 'confirmed' && p.pending.length === 0 && r.cessions.length === 0 && r.total220 === 3000, 'Échange confirmé : 0 cession, 220 = 3 000'); }
// 3) Refus : vente + achat distincts, 220 = 3 000 + 4 700 = 7 700, PV 3 500, plus rien à confirmer
{ const T = base(), p = E.detectSwaps(T, { choices: { [key(base())]: 'separate' } }), r = E.compute(T, P);
  chk(p.pending.length === 0 && p.refused.length === 1 && r.cessions.length === 1 && +r.cessions[0].l224.toFixed(2) === 3500 && r.total220 === 7700, 'Refus : vente imposable PV 3 500, 220 = 7 700'); }
// 4) Plusieurs candidats (2 ventes, 1 achat) : jamais apparié arbitrairement ; choix d’une paire -> l’autre vente reste imposable, plus rien en attente
{ const mk = () => [{ id: 'x', date: Date.UTC(2025, 0, 2), type: 'BUY', asset: 'BTC', qty: 1, eur: 30000, fee: 0, source: 'g' }, { id: 'y', date: Date.UTC(2025, 0, 2), type: 'BUY', asset: 'SOL', qty: 100, eur: 3000, fee: 0, source: 'g' },
    { id: 's1', date: T0, type: 'SELL', asset: 'BTC', qty: 0.05, eur: 5000, fee: 0, source: 'g' }, { id: 's2', date: T0, type: 'SELL', asset: 'SOL', qty: 50, eur: 5000, fee: 0, source: 'g' }, { id: 'b', date: T0 + 1000, type: 'BUY', asset: 'ETH', qty: 2, eur: 4900, fee: 0, source: 'g' }];
  const T = mk(), p = E.detectSwaps(T, { choices: {} });
  chk(p.length === 0 && p.pending.length === 2 && p.pending.every(x => x.multi), 'Deux ventes pour un achat : 2 candidats « plusieurs correspondances », aucun appliqué');
  const U = mk(), q = E.detectSwaps(U, { choices: { [E.swapKey(mk()[3], mk()[4])]: 'swap' } });
  chk(q.length === 1 && q[0].out.id === 's2' && q.pending.length === 0 && U[2].type === 'SELL', 'Choix SOL→ETH : échange ; vente BTC imposable, plus rien en attente'); }
// 5) Même CSV, lignes identiques (mêmes horodatages) : 2 ventes + 2 achats identiques -> candidats multiples, rien d’arbitraire sans choix
{ const L = () => [0, 1].flatMap(i => [{ id: 's' + i, date: T0, type: 'SELL', asset: 'BTC', qty: 0.01, eur: 1000, fee: 0, source: 'h' }, { id: 'b' + i, date: T0, type: 'BUY', asset: 'ETH', qty: 0.4, eur: 990, fee: 0, source: 'h' }]);
  const p = E.detectSwaps(L(), { choices: {} }); chk(p.length === 0 && p.pending.length >= 2 && p.pending.every(x => x.multi), 'Lignes identiques : candidats multiples signalés, aucun appliqué'); }
// 6) Preuve explicite : même identifiant d’ordre, même fichier -> échange sans confirmation ; identifiants différents -> aucun rapprochement
{ const T = base(); T[1].ref = T[2].ref = 'ORD-1'; const p = E.detectSwaps(T, { choices: {} });
  chk(p.length === 1 && p[0].how === 'proof' && T[1].swapProof && p.pending.length === 0, 'Même Order ID : échange prouvé, pas de confirmation');
  const U = base(); U[1].ref = 'ORD-1'; U[2].ref = 'ORD-2'; const q = E.detectSwaps(U, { choices: {} });
  chk(q.length === 0 && q.pending.length === 0 && U[1].type === 'SELL', 'Order ID différents : vente et achat distincts, rien à confirmer');
  const V = base(); V[1].ref = 'ORD-1'; V[2].ref = 'ORD-1'; V[2].source = 'autre.csv'; const v = E.detectSwaps(V, { choices: {} });
  chk(v.length === 0 && v.pending.length === 1, 'Même Order ID mais fichiers différents : pas une preuve, à confirmer'); }
// 7) Stablecoin = crypto (USDC jambe possible) ; devise (EUR/USD) jamais jambe d’échange
{ const T = base(); Object.assign(T[2], { asset: 'USDC', qty: 5400, eur: 4968 }); const p = E.detectSwaps(T, { choices: {} });
  chk(p.pending.length === 1 && p.pending[0].in.asset === 'USDC', 'BTC→USDC : candidat crypto→crypto (à confirmer)');
  const U = base(); Object.assign(U[2], { asset: 'USD', qty: 5400, eur: 4968 }); chk(E.detectSwaps(U, { choices: {} }).pending.length === 0, 'Achat de USD (devise) : jamais un échange crypto'); }
// 8) Choix périmé : ligne modifiée (quantité) -> choix ignoré, à reconfirmer ; ordre des lignes indifférent (identité, pas index)
{ const c = { [key(base())]: 'swap' }, T = base(); T[1].qty = 0.051; const p = E.detectSwaps(T, { choices: c });
  chk(p.length === 0 && p.pending.length === 1, 'Fichier modifié : ancien choix non réutilisé, à reconfirmer');
  const U = base().reverse(); chk(E.detectSwaps(U, { choices: c }).length === 1, 'Lignes réordonnées : choix retrouvé par identité'); }
// 9) Fin d’année (31/12 23:59:58 → 01/01 00:00:01, heure de Paris) : à confirmer, rien d’appliqué ; si refusé la vente reste en 2025
{ const D = Date.UTC(2025, 11, 31, 22, 59, 58), T = base(); T[1].date = D; T[2].date = D + 3000; const p = E.detectSwaps(T, { choices: {} });
  chk(p.pending.length === 1 && E.parisYear(T[1].date) === 2025 && E.parisYear(T[2].date) === 2026, 'Rapprochement à cheval sur deux années : à confirmer'); }
// 10) Ancien forçage « imposable » respecté ; Revolut même seconde (relevé) : à confirmer, jamais prouvé par l’horodatage
{ const T = base(); T[1].swapForce = T[2].swapForce = 'taxable'; chk(E.detectSwaps(T, { choices: {} }).pending.length === 0 && T[1].type === 'SELL', 'Ancien « Forcer imposable » : pas de rapprochement');
  const U = base(); U[2].date = U[1].date; U.forEach(t => { t.platform = 'Relevé'; t.feeInKind = true; t.feeExcl = true; }); const p = E.detectSwaps(U, { choices: {} });
  chk(p.length === 0 && p.pending.length === 1 && !U[1].swapProof, 'Relevé Revolut, même seconde : à confirmer, pas une preuve'); }
// 12) Règle 5 s / 8 % (bornes incluses) : 5 000 ms et ±8,0 % -> candidat ; 5 001 ms ou 8,1 % -> rien
{ const at = (dt, vb) => { const T = base(); T[2].date = T[1].date + dt; T[2].eur = vb; return E.detectSwaps(T, { choices: {} }).pending.length; };
  chk(at(5000, 4600) === 1 && at(-5000, 5400) === 1 && at(5001, 5000) === 0 && at(1000, 4595) === 0 && at(1000, 5405) === 0, 'Bornes : ≤ 5 s et écart de valeur ≤ 8 % (5 000 ms et 4 600/5 400 € inclus ; 5 001 ms, 4 595 € et 5 405 € exclus)'); }
// 11) Interface : rapprochement à confirmer = export bloqué, résultat provisoire ; choix stockés par identité ; échappement HTML
{ const A = fs.readFileSync(__dirname + '/app.js', 'utf8');
  chk(/k: 'swap', msg: `\$\{n\} rapprochement/.test(A) && /Résultat provisoire/.test(A), 'Export PDF bloqué tant qu’un rapprochement est à confirmer');
  chk(/swapChoices\[p\.key\] = v/.test(A) && /kryptax\.swapChoices/.test(A) && !/swapChoices\[\+li/.test(A), 'Choix persistés par clé d’identité (pas par index)');
  chk(/const leg = t => `\$\{num\(t\.qty\)\} \$\{esc\(t\.asset\)\}[^`]*\$\{esc\(t\.source \|\| 'saisie'\)\}`/.test(A), 'Actif et fichier échappés dans la liste (HTML)'); }
console.log(ok ? 'testswap : tout est OK (' + n + ')' : 'testswap : ÉCHEC'); process.exit(ok ? 0 : 1);
