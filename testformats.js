// node testformats.js — lecture des CSV : colonnes génériques (Montant, Montant EUR, Total, Valeur…) et formats de plateformes.
// Tous les fichiers de testdata/formats sont ENTIÈREMENT FICTIFS (en-têtes publiés, valeurs inventées).
const F = require('./formats.js'), P = require('./pipeline.js'), E = require('./engine.js'), X = require('./export.js'), fs = require('fs');
let ok = true; const chk = (c, m) => { ok = ok && !!c; console.log((c ? 'OK  ' : 'ÉCHEC ') + m); };
const rd = f => F.parseCSV(fs.readFileSync(__dirname + '/testdata/formats/' + f, 'utf8'));
let n = 0; const uid = () => 'u' + (++n);
// 1) En-têtes génériques
const G = h => F.guessMap(h);
for (const [h, col] of [[['Date', 'Type', 'Crypto', 'Quantité', 'Montant'], 4], [['date', 'type', 'crypto', 'quantite', 'Montant EUR'], 4], [['Date', 'Crypto', 'Quantity', 'Total'], 3],
  [['Date', 'Crypto', 'Quantité', 'Valeur (€)'], 3], [['Date', 'Coin', 'Qty', 'Value'], 3], [['DATE', 'ACTIF', 'QUANTITÉ', 'MONTANT €'], 3], [['Date', 'Coin', 'Amount', 'Value'], 3],
  [['Date', 'Coin', 'Quantity', 'Amount'], 3], [['\ufeffDate', 'Crypto', 'Quantité', 'Montant (EUR)', 'Frais'], 3], [['Date', 'Asset', 'Quantité', 'Montant total'], 3]])
  chk(G(h).eur === col && G(h).date === 0 && G(h).qty != null && G(h).qty !== col, 'En-têtes ' + JSON.stringify(h) + ' : montant colonne ' + col);
chk(G(['Date', 'Crypto', 'Quantité', 'Prix']).price === 3 && G(['Date', 'Crypto', 'Quantité', 'Prix']).eur == null, '« Prix » seul = prix unitaire (valeur = prix × quantité)');
chk(G(['Date', 'Crypto', 'Quantité', 'Montant USD']).cur === 'USD' && G(['Date', 'Crypto', 'Quantité', 'Total ($)']).cur === 'USD', 'Devise lue dans l’en-tête (USD)');
// 2) Séparateurs, BOM, guillemets, virgule décimale, symbole €, espaces
for (const [f, sale] of [['generique_fr_fictif.csv', 1170.5], ['generique_tab_fictif.csv', 170]]) {
  const rows = rd(f), m = G(rows[0]); chk(F.detect(rows) == null && m.eur === 4 && m.qty === 3, f + ' : colonnes reconnues (séparateur, BOM, guillemets)');
  const r = P.importRows(rows.slice(1), m, { source: f, cur: m.cur }, uid), s = r.txs.find(t => t.type === 'SELL');
  chk(!r.bad.length && s && Math.abs(s.eur - sale) < 1e-9 && !s.fxPending, f + ' : vente à ' + (s && s.eur) + ' € (attendu ' + sale + ')');
}
{ const rows = F.parseCSV('Date,Type,Crypto,Quantité,Montant\n2026-01-05 10:00,Buy,BTC,0.01,800\n2026-05-01 10:00,Sell,BTC,0.002,170\n'), m = G(rows[0]);
  const r = P.importRows(rows.slice(1), m, { cur: m.cur }, uid), res = E.compute(r.txs, () => 60000), Y = E.byYear(res), x = X.exportData(Y, {}, () => [], r.txs, 2026);
  chk(x.cessions.length === 1 && x.cessions[0].l213 === 170 && x.cessions[0].l220 === 800, 'CSV Date,Type,Crypto,Quantité,Montant : case 213 = 170 €, 220 = 800 € (bug corrigé)'); }
{ // BOM + fins de ligne Windows + guillemets + « 1 234,56 € » construits ici (l'outil de publication retire BOM et CRLF des fichiers)
  const rows = F.parseCSV('\ufeff"Date";"Type";"Crypto";"Quantité";"Montant"\r\n"05/01/2026";"Achat";"BTC";"0,01";"500,00 €"\r\n"01/05/2026";"Vente";"BTC";"0,002";"1 234,56 €"\r\n'), m = G(rows[0]);
  const r = P.importRows(rows.slice(1), m, { cur: m.cur }, uid), s = r.txs.find(t => t.type === 'SELL');
  chk(m.date === 0 && m.eur === 4 && s && Math.abs(s.eur - 1234.56) < 1e-9, 'BOM + CRLF + « ; » + « 1 234,56 € » : vente à 1234,56 €');
  const c = F.parseCSV('\r\nTransactions\r\nUser,x\r\n' + fs.readFileSync(__dirname + '/testdata/formats/coinbase_fictif.csv', 'utf8').split(/\r?\n/).slice(3).join('\r\n'));
  chk(F.detect(c) && F.detect(c).id === 'coinbase', 'Coinbase avec préambule et CRLF détecté'); }
chk(JSON.stringify(G(rd('inconnu_fictif.csv')[0])) === '{}' && F.detect(rd('inconnu_fictif.csv')) == null, 'Fichier inconnu : rien de deviné (message « Format non reconnu »)');
// 3) Formats de plateformes
const sum = (r, ty, a) => r.txs.filter(t => t.type === ty && (!a || t.asset === a)).reduce((s, t) => s + t.qty, 0);
const run = (f, id) => { const rows = rd(f), d = F.detect(rows); chk(d && d.id === id, f + ' : format ' + id + ' détecté'); return F.parse(rows, d, { source: f }, uid); };
{ const r = run('binance_transactions_fictif.csv', 'binance');
  const b = r.txs.find(t => t.type === 'BUY'); chk(b && b.asset === 'BTC' && b.qty === 0.01 && b.eur === 500 && b.feeQty === 0.00001, 'Binance : achat 0,01 BTC pour 500 €, frais en BTC');
  chk(sum(r, 'EXCH_OUT', 'BTC') === 0.002 && sum(r, 'EXCH_IN', 'ETH') === 0.05 && sum(r, 'FEE', 'BNB') === 0.0001, 'Binance : échange BTC→ETH + frais BNB');
  const s = r.txs.find(t => t.type === 'SELL'); chk(s && s.eur === 180 && Math.abs(s.fee - 0.18) < 1e-9, 'Binance : vente 180 € (frais 0,18 €)');
  chk(sum(r, 'STAKING') > 0 && sum(r, 'AIRDROP', 'XYZ') === 10 && sum(r, 'SEND', 'ETH') === 0.01, 'Binance : staking, airdrop, retrait');
  chk(r.skipped.length === 3 && r.bad.length === 1, 'Binance : virements internes ignorés, opération inconnue signalée (1 ligne)'); }
{ const r = run('binance_trades_fictif.csv', 'binance-trades');
  chk(r.txs[0].type === 'BUY' && r.txs[0].qty === 0.01 && r.txs[0].eur === 500 && sum(r, 'EXCH_IN', 'BTC') === 0.005 && r.txs.find(t => t.type === 'SELL').eur === 120, 'Binance trades : achat, échange ETH→BTC, vente'); }
{ const r = run('binance_convert_fictif.csv', 'binance-convert');
  chk(sum(r, 'EXCH_OUT', 'ETH') === 0.1 && r.txs.find(t => t.type === 'SELL').eur === 55 && r.skipped.length === 1, 'Binance Convert : échange, conversion en € = vente, échec ignoré'); }
{ const r = run('kraken_ledgers_fictif.csv', 'kraken-ledgers');
  const b = r.txs.find(t => t.type === 'BUY'), s = r.txs.find(t => t.type === 'SELL');
  chk(b && b.asset === 'BTC' && b.eur === 400 && b.fee === 1.04 && s && s.eur === 130, 'Kraken ledgers : XXBT→BTC, ZEUR→€, achat/vente avec frais');
  chk(sum(r, 'STAKING', 'DOT.S') === 0.12 && sum(r, 'SEND', 'BTC') === 0.001 && sum(r, 'FEE', 'BTC') === 0.00002 && !r.bad.length, 'Kraken ledgers : récompense, retrait + frais, allocation ignorée'); }
{ const r = run('kraken_trades_fictif.csv', 'kraken-trades');
  chk(r.txs[0].type === 'BUY' && r.txs[0].eur === 400 && sum(r, 'EXCH_OUT', 'ETH') === 0.1 && r.txs.find(t => t.type === 'SELL').eur === 130, 'Kraken trades : XXBTZEUR, XETHXXBT, BTC/EUR'); }
{ const r = run('coinbase_fictif.csv', 'coinbase');
  const b = r.txs.find(t => t.type === 'BUY'); chk(b && b.eur === 500 && b.fee === 5 && r.txs.find(t => t.type === 'SELL').eur === 180, 'Coinbase : préambule ignoré, achat 500 € + 5 € de frais, vente 180 €');
  chk(sum(r, 'EXCH_OUT', 'BTC') === 0.002 && sum(r, 'EXCH_IN', 'ETH') === 0.04 && sum(r, 'STAKING', 'ETH') === 0.0005 && sum(r, 'INTEREST', 'XYZ') === 3, 'Coinbase : Convert (Notes), staking, Learning Reward'); }
{ const r = run('bitpanda_fictif.csv', 'bitpanda');
  chk(r.txs.find(t => t.type === 'BUY').eur === 300 && r.txs.find(t => t.type === 'SELL').eur === 90 && sum(r, 'SEND', 'ETH') === 0.01 && sum(r, 'INTEREST', 'ETH') === 0.0002, 'Bitpanda : achat, vente, retrait, récompense');
  chk(r.skipped.some(s => /Metal/.test(s)) && !r.txs.some(t => t.asset === 'XAU'), 'Bitpanda : métaux/actions hors crypto exclus'); }
// 4) Les cas particuliers (point 6) sont alimentés par ces formats
{ const r = run('binance_transactions_fictif.csv', 'binance'), sp = X.special(r.txs, 2026), k = Object.fromEntries(sp.cats.map(c => [c.key, c.n]));
  chk(k.staking === 2 && k.airdrop === 1 && k.frais >= 1 && k.transferts === 1, 'Binance → cas particuliers : ' + JSON.stringify(k)); }
chk(!fs.readdirSync(__dirname + '/testdata/formats').some(f => /revolut/i.test(fs.readFileSync(__dirname + '/testdata/formats/' + f, 'utf8'))), 'Fichiers de test fictifs, sans Revolut');
process.exit(ok ? 0 : 1);
