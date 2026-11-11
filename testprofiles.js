// node testprofiles.js — v2.63 : profils de plateformes (profiles.js), un bloc de tests indépendant par profil. Données FICTIVES uniquement.
const R = require('./profiles.js'), F = require('./formats.js'), P = require('./pipeline.js'), E = require('./engine.js'), fs = require('fs');
let ok = true, n = 0; const chk = (c, m) => { n++; ok = ok && !!c; console.log((c ? 'OK  ' : 'ÉCHEC ') + m); };
let u = 0; const uid = () => 'p' + (++u), DOC = fs.readFileSync(__dirname + '/docs/PROFILS-PLATEFORMES.md', 'utf8');
const MP = { asset: 0, type: 1, qty: 2, price: 3, eur: 4, fee: 5, date: 6 };
// 0) Déclarations : statut connu, hypothèses sourcées ou marquées, chaque profil et règle documentés, chaque format reconnu rattaché à un profil
chk(R.PROFILES.every(p => p.id && p.platform && p.rules.length && p.rules.every(r => R.STATUS[r.status] && r.key && r.text)), 'Chaque règle a un statut (source / hypothèse / convention)');
chk(R.hypotheses().length >= 3 && R.hypotheses().every(h => h.source || h.key === 'echange-meme-seconde'), 'Hypothèses : texte de source ou de non-confirmation');
chk(R.PROFILES.every(p => DOC.includes('`' + p.id + '`') && p.rules.every(r => DOC.includes('`' + r.key + '`'))), 'docs/PROFILS-PLATEFORMES.md : tous les profils et règles documentés');
chk([...new Set(F.FORMATS.map(f => f.id))].every(id => R.forFormat(id)), 'Chaque format d’import reconnu est rattaché à un profil');
chk(R.importOpts('revolut-releve', { source: 'x' }).source === 'x' && R.byId('revolut-releve').import.source === undefined, 'importOpts : copie, le profil n’est jamais modifié');
// 1) revolut-releve : hypothèse « Valeur hors frais » (lignes €) ; lignes en $ : frais à part
{ const L = ['Transactions', 'Symbole Type Quantité Prix Valeur Frais Date', 'BTC Achat 0,001 100000,00€ 100,00€ 2,00€ 10 mars 2025, 10:00:00', 'BTC Vente 0,001 120000,00€ 120,00€ 2,00€ 10 juin 2025, 10:00:00'];
  const r = P.parsePdfLines(L), T = P.importRows(r.rows, MP, R.importOpts('revolut-releve', { source: 'fictif.pdf' }), uid).txs, c = E.compute(T, () => null).cessions[0];
  chk(T.length === 2 && T.every(t => t.feeInKind && t.feeExcl) && [c.l220, c.l213, c.l214, c.l218, +c.l224.toFixed(2)].join() === '102,120,2,118,16', 'revolut-releve : 100 + 2 / 120 − 2, tout vendu : 220 = 102, 214 = 2, PV = 16');
  const D = P.importRows([['BTC', 'Vente', '0,001', '120000,00$', '120,00$', '2,00$', '10 juin 2025, 10:00:00']], MP, R.importOpts('revolut-releve', { source: 'f' }), uid).txs[0];
  chk(D && !D.feeInKind, 'revolut-releve : ligne en $ = frais à part (pas en nature)'); }
// 2) revolut-x : 0,09 % en nature, seulement pour les libellés « … X »
chk(R.xTaker('Acheter - Plateforme X') === 0.0009 && R.xTaker('Vendre - Plateforme X') === 0.0009 && R.xTaker('Acheter') === null && R.xTaker('Achat Xtra') === null, 'revolut-x : taux reconnu sur « Acheter/Vendre - … X » uniquement');
{ const B = (id, d, type, qty, eur, raw) => ({ id, date: Date.UTC(2026, 0, d), type, asset: 'XXX', qty, eur, fee: 0, feeInKind: true, feeExcl: true, platform: 'Relevé', rawType: raw });
  const c = E.compute([B(1, 5, 'BUY', 1, 100, 'Acheter - Plateforme X'), B(2, 9, 'SELL', 0.5, 200, 'Vendre - Plateforme X')], () => null).cessions[0];
  chk(+c.l212.toFixed(2) === 399.64, 'revolut-x : 0,9991 XXX détenu × 400 = 399,64 (identique à v2.62)'); }
// 3) revolut-tableaux : frais en colonne séparée comptés comme un CSV
{ const T = P.importRows([['AAA', 'Achat', '10', '10,00', '100,00', '1,00', '10 mars 2026, 10:00:00'], ['AAA', 'Vente', '10', '40,00', '400,00', '2,00', '10 juin 2026, 10:00:00']], MP, R.importOpts('revolut-tableaux', { source: 't', cur: 'EUR' }), uid).txs, c = E.compute(T, () => null).cessions[0];
  chk(T.every(t => !t.feeInKind) && c.l214 === 2 && c.l220 === 101 && c.l224 === 297, 'revolut-tableaux : 214 = 2, 220 = 101, PV = 297'); }
// 4) csv-generique : colonne de frais comptée (220 = 100 + 1)
{ const T = P.importRows([['AAA', 'Achat', '10', '10', '100', '1', '2026-03-10 10:00:00'], ['AAA', 'Vente', '10', '40', '400', '2', '2026-06-10 10:00:00']], MP, { source: 'g.csv', cur: 'EUR' }, uid).txs, c = E.compute(T, () => null).cessions[0];
  chk(T.every(t => !t.feeInKind) && c.l220 === 101 && c.l218 === 398, 'csv-generique : 220 = 101, 218 = 398'); }
// 5) Plateformes CSV (fichiers fictifs de testdata/formats) : format détecté -> profil, frais jamais en nature
for (const [f, pid] of [['binance_transactions_fictif.csv', 'binance'], ['binance_trades_fictif.csv', 'binance'], ['binance_convert_fictif.csv', 'binance'], ['kraken_ledgers_fictif.csv', 'kraken'], ['kraken_trades_fictif.csv', 'kraken'], ['coinbase_fictif.csv', 'coinbase'], ['bitpanda_fictif.csv', 'bitpanda']]) {
  const rows = F.parseCSV(fs.readFileSync(__dirname + '/testdata/formats/' + f, 'utf8')), fmt = F.detect(rows), pr = fmt && R.forFormat(fmt.id), res = fmt && F.parse(rows, fmt, { source: f }, uid);
  chk(pr && pr.id === pid && res && res.txs.length > 0 && res.txs.every(t => t.feeInKind === pr.import.feeInKind), f + ' : profil « ' + pid + ' », ' + (res ? res.txs.length : 0) + ' opérations, frais explicites'); }
console.log(ok ? 'testprofiles : tout est OK (' + n + ')' : 'testprofiles : ÉCHEC'); process.exit(ok ? 0 : 1);
