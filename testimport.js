// node testimport.js — v2.33 : import général (relevés PDF à date en tête, CSV à plusieurs tableaux, types FR/EN, mois FR/EN, nombres FR/EN).
// Textes ENTIÈREMENT INVENTÉS, dérivés seulement d'une structure de tableau : aucune donnée réelle, aucun nom, adresse, identifiant ni nom d'établissement.
const F = require('./formats.js'), P = require('./pipeline.js'), E = require('./engine.js');
let ok = 0, ko = 0; const chk = (c, m) => { c ? ok++ : ko++; console.log((c ? 'OK    ' : 'KO    ') + m); };
let n = 0; const uid = () => 'u' + (++n); const iso = t => new Date(t).toISOString();
// 1) Types FR/EN
const T = { 'Achat': 'BUY', 'Achat (X)': 'BUY', 'Buy': 'BUY', 'Purchase': 'BUY', 'Vente': 'SELL', 'Vente (X)': 'SELL', 'Cession': 'SELL', 'Sell': 'SELL', 'Sale': 'SELL', 'Disposal': 'SELL',
  'Swap': 'EXCH_OUT', 'Échange': 'EXCH_OUT', 'Staking Payout': 'STAKING', 'Staking reward': 'STAKING', 'ETH2 Staking Reward': 'STAKING', 'Apprendre & Gagner': 'INTEREST', 'Learn & Earn': 'INTEREST', 'Frais': 'FEE', 'Fee': 'FEE' };
for (const [k, v] of Object.entries(T)) chk(E.guessType(k, '', true) === v, 'type « ' + k + ' » -> ' + v);
// 2) Dates FR/EN (mois abrégés ou en toutes lettres)
for (const [d, x] of [['17 mai 2026, 00:09:10', '2026-05-17T00:09:10'], ['5 sept. 2026, 08:00:00', '2026-09-05T08:00:00'], ['1 juil. 2026, 08:00', '2026-07-01T08:00:00'], ['3 oct. 2026, 11:55:54', '2026-10-03T11:55:54'],
  ['3 octobre 2026, 11:55', '2026-10-03T11:55:00'], ['12 Oct 2026 11:55', '2026-10-12T11:55:00'], ['Oct 12, 2026, 11:55:54', '2026-10-12T11:55:54'], ['September 3, 2026 10:00 PM', '2026-09-03T22:00:00'], ['3 décembre 2026 10:00', '2026-12-03T10:00:00']])
  chk(iso(E.parseDate(d, 'DMY', 'UTC')) === x + '.000Z', 'date « ' + d + ' »');
// 3) PDF : lignes de texte (structure seule, valeurs inventées)
const L = ['RELEVÉ FICTIF', 'RÉSUMÉ DES ACTIFS', 'Symbole Actif Solde clôture', '0,00000000 1 250,5000 1 250,5000', 'AAA Actif A 0,00 € 10,00 €', 'AAA AAA AAA',
  'Libellé (long 0,00000000 0,50000000 0,50000000', 'BBB 0,00 € 5,00 €', 'suite) BBB BBB BBB',
  'RÉCOMPENSES', 'Date Symbole Type Quantité Cours Valeur',
  '15 juin 2026, 08:00:00 BBB Staking Payout 0,12000000 BBB 5,00 € 0,60 €', '15 juil. 2026, 12:15:37 CCC Apprendre & Gagner 4,00000000 CCC 0,02 € 0,08 €',
  'HISTORIQUE', 'Date & Heure Symbole Type Quantité Prix Unitaire Valeur Totale Frais',
  '17 mai 2026, 00:09:10 AAA Achat 1 000,00000000 1,00 € 1 000,00 € 2,00 €', '22 mai 2026, 17:38:52 AAA Vente (X) 400,00000000 1,10 € 440,00 € 0,50 €',
  '23 mai 2026, 10:00:00 AAA Cession 10,00000000 1,00 € 50,00 € 0,10 €', '12 oct. 2026, 11:55:54 DDD Achat (X) 11,00000000 2,00 $ 22,00 $ 0,02 $', 'Page 1 de 1'];
const r = P.parsePdfLines(L);
chk(r.rows.length === 0 && r.rows2.length === 5, 'PDF : 5 lignes lues (2 récompenses, 3 opérations), ancien format non concerné');
chk(r.rows2.cur === '€', 'PDF : devise principale €');
chk(r.amb.some(a => /\$ dans un relevé en €.*non importée/.test(a.why)), 'PDF : ligne en $ dans un relevé en € signalée et NON importée');
chk(r.amb.some(a => a.kept && /quantité × prix/.test(a.why)), 'PDF : quantité × prix ≠ valeur signalé (ligne gardée)');
chk(r.balances && r.balances.closing.AAA === 1250.5 && r.balances.closing.BBB === 0.5, 'PDF : soldes de clôture sur 3 lignes (espaces de milliers, libellé sur 2 lignes)');
const im = P.importRows(r.rows2.map(x => x.row), { asset: 0, type: 1, qty: 2, price: 3, eur: 4, fee: 5, date: 6 }, { feeInKind: false, dmode: 'DMY', tz: 'UTC', strict: true, cur: 'EUR', source: 'x' }, uid);
const ty = im.txs.map(t => t.type + ':' + t.asset + ':' + t.qty + ':' + t.eur + ':' + t.fee).join(' ');
chk(!im.bad.length && ty === 'STAKING:BBB:0.12:0.6:0 INTEREST:CCC:4:0.08:0 BUY:AAA:1000:1000:2 SELL:AAA:400:440:0.5 SELL:AAA:10:50:0.1', 'PDF : types, quantités (1 000,0), valeurs et frais lus : ' + ty);
chk(im.txs.every(t => !t.feeInKind) && iso(im.txs[2].date) === '2026-05-17T00:09:10.000Z', 'PDF : frais en colonne séparée (comptés comme un CSV), date « 17 mai 2026 » lue');
// Anglais, nombres 1,234.56
const r2 = P.parsePdfLines(['Oct 12, 2026, 11:55:54 EEE Buy 1,500.25 €2.00 €3,000.50 €1.00', '2026-10-13 09:00 EEE Sale 0.5 2.10 € 1.05 € 0.01 €']);
const i2 = P.importRows(r2.rows2.map(x => x.row), { asset: 0, type: 1, qty: 2, price: 3, eur: 4, fee: 5, date: 6 }, { feeInKind: false, dmode: 'DMY', tz: 'UTC', strict: true, cur: 'EUR', source: 'y' }, uid);
chk(i2.txs.length === 2 && i2.txs[0].qty === 1500.25 && i2.txs[0].eur === 3000.5 && i2.txs[1].type === 'SELL' && i2.txs[1].qty === 0.5, 'PDF : lignes en anglais (Oct 12, 2026 ; 1,500.25 ; €2.00 ; ISO ; Sale)');
// Lignes « Vente de X » des relevés en devises : toujours rangées à part
chk(P.parsePdfLines(['12 mars 2026, 10:00 Vente de AAA 10,00 €']).fiat.length === 1, 'PDF : « Vente de X » reste une ligne de contre-vérification');
// 4) CSV à plusieurs tableaux, colonnes différentes
const csv = 'RELEVE FICTIF\nRÉCOMPENSES\nDate;Symbole;Type d\'opération;Quantité attribuée;Cours unit. (€);Valeur brute (€)\n"3 juin 2026, 08:00:00";AAA;Staking Payout;"0,5 AAA";"2,00 €";"1,00 €"\n"4 sept. 2026, 09:00:00";BBB;Learn & Earn;"10 BBB";"0,01 €";"0,10 €"\n\nHISTORIQUE\nDate & Heure;Symbole;Type;Quantité;Prix Unitaire;Valeur Totale;Frais\n"5 mai 2026, 10:00:00";AAA;Achat;"2,5";"1 000,00 €";"2 500,00 €";"1,00 €"\n"6 juil. 2026, 10:00:00";AAA;Cession;"1";"1 100,00 €";"1 100,00 €";"1,00 €"\n';
const sec = P.sections(F.parseCSV(csv), F.guessMap);
chk(sec.length === 2 && sec[0].rows.length === 2 && sec[1].rows.length === 2 && sec[1].map.fee === 6 && sec[0].map.fee == null, 'CSV : 2 tableaux détectés, chacun avec ses colonnes (titres ignorés)');
const all = [].concat(...sec.map(x => { const mp = Object.assign({}, x.map); delete mp.cur; return P.importRows(x.rows, mp, { strict: true, tz: 'UTC', feeInKind: mp.fee == null ? undefined : false, source: 'z', line0: x.line0 }, uid).txs; }));
chk(all.map(t => t.type + ':' + t.qty + ':' + t.eur + ':' + t.fee).join(' ') === 'STAKING:0.5:1:0 INTEREST:10:0.1:0 BUY:2.5:2500:1 SELL:1:1100:1', 'CSV : récompenses, achat et « Cession » lus');
chk(P.sections(F.parseCSV('Date;Crypto;Quantité;Montant\n01/02/2026;AAA;1;10\n'), F.guessMap).length === 1, 'CSV à un seul tableau : inchangé (une section)');
// v2.36 : relevé PDF, frais d'une vente en dollars reportés (ligne 214) ; frais en nature gardés pour les lignes en euros
{ const R = [['AAA', 'Vente', '1', '10', '10', '0.5', '2026-05-01 10:00:00'], ['AAA', 'Vente', '1', '10', '10', '0.5', '2026-05-02 10:00:00']]; const f = c => P.importRows([R[0]], { asset: 0, type: 1, qty: 2, price: 3, eur: 4, fee: 5, date: 6 }, { feeInKind: true, feeInKindEurOnly: true, tz: 'UTC', strict: true, cur: c, source: 'w' }, uid).txs[0];
  chk(f('USD').feeInKind === false && f('EUR').feeInKind === true, 'Relevé : frais en dollars comptés à part (l.214), frais en euros en nature (inchangé)'); }
console.log(ok + ' OK, ' + ko + ' KO'); process.exit(ko ? 1 : 0);
