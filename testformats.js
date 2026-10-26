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
// 5) Audit CSV/Excel génériques : fichiers FICTIFS variés, lus correctement ou refusés avec un message clair
{ const imp = (text, o) => { let rows = typeof text === 'string' ? F.parseCSV(text) : text; const hi = F.headerRow(rows); rows = rows.slice(hi); const m = F.guessMap(rows[0].map(String));
    return P.importRows(rows.slice(1), m, Object.assign({ strict: true, tz: 'UTC', cur: m.cur, head: rows[0] }, o || {}), uid); };
  const iso = t => new Date(t).toISOString().slice(0, 16);
  let r = imp('\ufeffDate;Type;Crypto;Quantité;Montant (€);Frais\n05/03/2025 10:00;Achat;BTC;0,015;1 234,50;1,20\n06/03/2025;Vente;BTC;0,005;450,00;0,50\n');
  chk(r.txs.length === 2 && r.txs[0].qty === 0.015 && r.txs[0].eur === 1234.5 && r.txs[0].fee === 1.2 && iso(r.txs[0].date) === '2025-03-05T10:00' && r.txs[1].type === 'SELL', 'CSV français (; , BOM, milliers espacés, JJ/MM)');
  r = imp('Date,Type,Asset,Quantity,Total\n"03/05/2025 10:00",Buy,ETH,1.5,"1,234.56"\n"03/15/2025 09:00",Sell,ETH,0.5,"1,000.00"\n');
  chk(r.txs.length === 2 && r.txs[0].eur === 1234.56 && iso(r.txs[0].date) === '2025-03-05T10:00' && iso(r.txs[1].date) === '2025-03-15T09:00', 'CSV américain : MM/JJ déduit de la colonne entière (03/05 = 5 mars), milliers 1,234.56');
  r = imp('Date\tType\tCrypto\tQuantité\tMontant\n2025-01-02 08:30:15\tAchat\tSOL\t3\t300\n2025-01-03T09:00:00\tVendre\tSOL\t1\t120\n');
  chk(r.txs.length === 2 && iso(r.txs[0].date) === '2025-01-02T08:30', 'TSV, dates ISO avec/sans T');
  r = imp('Date;Type;Crypto;Quantité;Montant\n13/02/2025;Achat;BTC;1;100\n02/13/2025;Vente;BTC;1;200\n');
  chk(r.fatal && /jour\/mois/.test(r.fatal) && !r.txs.length, 'Refus : dates JJ/MM et MM/JJ mélangées');
  r = imp('Date;Type;Crypto;Quantité;Montant\n01/02/2025;Achat;BTC;0,5;1.234,50\n02/02/2025;Vente;BTC;0.25;1,234.50\n');
  chk(r.fatal && /deux façons/.test(r.fatal), 'Refus : nombres écrits de deux façons dans une colonne');
  r = imp('Date;Crypto;Quantité;Montant\n01/02/2025;BTC;0,5;100\n02/02/2025;BTC;0,2;50\n');
  chk(r.fatal && /Type/.test(r.fatal), 'Refus : colonne Type absente et quantités sans signe');
  r = imp('Date;Crypto;Quantité;Montant\n01/02/2025;BTC;0,5;100\n02/02/2025;BTC;-0,2;50\n');
  chk(!r.fatal && r.txs[0].type === 'BUY' && r.txs[1].type === 'SELL', 'Sans colonne Type : signe de la quantité (+ achat, − vente)');
  r = imp('Date;Type;Crypto;Quantité;Montant\n01/02/2025;Achat;BTC;0,5;100\n02/02/2025;Truc bizarre;BTC;0,2;50\n03/02/2025;Envoyer;BTC;0,1;0\n;Total;;0,8;150\n\n');
  chk(r.txs.length === 2 && r.txs[1].type === 'SEND' && r.bad.length === 1 && /type inconnu « Truc bizarre »/.test(P.badSummary(r)) && /ligne 3/.test(P.badSummary(r)), 'Type inconnu refusé (ligne citée), « Envoyer » = envoi, ligne Total et ligne vide ignorées : ' + P.badSummary(r));
  r = imp('Date;Type;Crypto;Quantité;Montant\n01/02/2025;Vente;BTC;0,5;\n');
  chk(r.bad.length === 0 && r.txs[0].eurMissing === true, 'Vente sans montant : gardée, montant à reconstruire au cours historique (signalé, sinon à confirmer : jamais de vente à 0 € en silence)');
  r = imp([['Relevé fictif', '', '', '', ''], ['Généré le 01/01/2026', '', '', '', ''], ['Date', 'Type', 'Crypto', 'Quantité', 'Montant'], [45658.5, 'Achat', 'BTC', 0.01, 900], [new Date(2025, 0, 3, 14, 5, 7), 'Vente', 'BTC', 0.005, 480], ['', '', '', '', ''], ['Total', '', '', 0.015, 1380]]);
  chk(r.txs.length === 2 && !r.bad.length && iso(r.txs[0].date) === '2025-01-01T12:00' && new Date(r.txs[1].date).toISOString() === '2025-01-03T14:05:07.000Z', 'Excel : titres avant l’en-tête, date en n° de série, date typée (heure de la cellule), ligne Total ignorée');
  chk(P.numMode(['1,234', '12']) === '' && P.numMode(['0,5']) === 'FR' && P.numMode(['1,234.5']) === 'EN' && P.dateMode(['01/02/2025']) === '', 'Formats indécidables laissés au choix manuel / par défaut');
  const A = fs.readFileSync(__dirname + '/app.js', 'utf8');
  chk(/colonnes décalées/.test(A) && /feuilles lisibles, seule la première/.test(A) && /o\.strict = true/.test(A) && /res\.fatal/.test(A), 'Appli : colonnes décalées refusées, feuille utile choisie, refus clair'); }
chk(!fs.readdirSync(__dirname + '/testdata/formats').some(f => new RegExp(['rev', 'olut'].join(''), 'i').test(fs.readFileSync(__dirname + '/testdata/formats/' + f, 'utf8'))), 'Fichiers de test fictifs, sans nom de plateforme');
{ const f1 = { name: 'a.csv' }, f2 = { name: 'b.pdf' };
  const dt = { types: ['Files', 'text/plain'], items: [{ kind: 'file', getAsFile: () => f1 }, { kind: 'string', getAsFile: () => null }, { kind: 'file', getAsFile: () => f2 }] };
  const d = P.droppedFiles(dt);
  chk(P.hasFileDrag(dt) && !P.hasFileDrag({ types: ['text/plain'] }) && !P.hasFileDrag(null) && d.length === 2 && d[0] === f1 && d[1] === f2 && P.droppedFiles({ files: [f1] })[0] === f1 && P.droppedFiles(null).length === 0, 'Glisser-déposer : seuls les fichiers sont gardés');
  const A = fs.readFileSync(__dirname + '/app.js', 'utf8');
  chk(/async function handleFiles/.test(A) && /handleFiles\(Array\.from\(e\.target\.files\)\)/.test(A) && /handleFiles\(f\)/.test(A) && /\['dragover', 'drop'\]\.forEach\(t => window\.addEventListener/.test(A), 'Glisser-déposer : même chemin que « Choisir des fichiers », page protégée'); }
{ /* Décodage CSV : mêmes données (fictives) en UTF-8, UTF-8 BOM, UTF-16 LE/BE, windows-1252, séparateurs ; , tab | */
  const KF = require('./formats.js'), KP = require('./pipeline.js'); let n = 0; const u = () => 'e' + n++;
  const L = ['Relevé fictif', '', 'Symbol;Type;Quantity;Price;Value;Fees;Date', 'AAA;Achat;"1 234,5";2,00€;"2 469,00€";1,00€;"3 mars 2026, 10:00:00"', 'BBB;Vente;"12,5";"0,02€";"0,25€";"0,01€";"5 févr. 2026, 12:00:00"', '"CCC ""x""";Achat;3;10,00€;30,00€;0,10€;"7 mars 2026, 14:00:00"'];
  const run = rows => { const hi = KF.headerRow(rows), h = rows[hi], m = { asset: 0, type: 1, qty: 2, price: 3, eur: 4, fee: 5, date: 6 }; return KP.importRows(rows.slice(hi + 1), m, { strict: true, head: h, source: 'x.csv' }, u).txs.map(t => [t.asset, t.type, t.qty, t.eur, t.fee, t.date].join('|')).join('\n'); };
  const ref = run(KF.parseCSV(L.join('\n'))), cp = s => Buffer.from([...s].map(c => c === '€' ? 0x80 : c.charCodeAt(0)));
  const be = s => { const b = Buffer.from(s, 'utf16le'); for (let i = 0; i < b.length; i += 2) { const x = b[i]; b[i] = b[i + 1]; b[i + 1] = x; } return b; };
  const sep = d => Buffer.from(L.map(l => l === '' ? '' : KF.parseCSV(l + '\n' + l)[0].map(f => /[",\t|]/.test(f) ? '"' + f.replace(/"/g, '""') + '"' : f).join(d)).join('\n'));
  const V = { 'UTF-8 CRLF': Buffer.from(L.join('\r\n')), 'UTF-8 BOM': Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(L.join('\n'))]), 'UTF-16 LE': Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(L.join('\r\n'), 'utf16le')]),
    'UTF-16 BE': Buffer.concat([Buffer.from([0xFE, 0xFF]), be(L.join('\n'))]), 'windows-1252 CR': cp(L.join('\r')),
    'séparateur ,': sep(','), 'tabulation': sep('\t'), 'séparateur |': sep('|'), 'espaces fines': Buffer.from(L.join('\n').replace('1 234', '1\u202f234').replace('2 469', '2\u00a0469')) };
  chk(ref.split('\n').length === 3 && /^AAA\|BUY\|1234\.5\|2469\|1\|/.test(ref) && /CCC "X"/.test(ref), 'CSV de référence lu (titre avant l’en-tête, guillemets doublés, milliers, € collé) : ' + ref.split('\n')[0]);
  for (const k in V) { const r = KF.parseCSV(new Uint8Array(V[k])); chk(run(r) === ref && !r.info.repl, 'CSV ' + k + ' : mêmes opérations (' + r.info.enc + ', séparateur ' + JSON.stringify(r.info.delim) + ')'); }
  const q = KF.parseCSV('A;B;Date;Crypto;Quantité\n1;"ligne\nsur deux";01/02/2025;BTC;"0,5"\n2;x;02/02/2025;BTC\n');
  chk(q.length === 3 && q[1][1] === 'ligne\nsur deux' && q[2].length === 5 && q[2][4] === '' && q.info.short[0] === 3, 'Guillemets avec retour ligne ; ligne courte complétée par un champ vide et signalée');
  chk(KF.decodeCSV(new Uint8Array([0x41, 0xC3, 0x28, 0x0A])).enc === 'windows-1252', 'UTF-8 invalide → repli windows-1252');
  chk(KF.decodeCSV(new TextEncoder().encode('A;\ufffd\n')).repl === 1, 'caractère « � » compté (signalé à l’import)');
  chk(KF.parseCSV('Date;Qté\n01/02/2025;\u22122,5\n')[1][1] === '-2,5', 'signe moins unicode normalisé');
}
{ /* Cas calqués sur un export réel (données fictives) : quantité entière sans guillemets, prix arrondi à 0, frais dans une autre devise, swap */
  const KF = require('./formats.js'), KP = require('./pipeline.js'); let n = 0; const u = () => 's' + n++;
  const csv = ['Symbol,Type,Quantity,Price,Value,Fees,Date',
    'USD,Autre,,,"100,00$","0,00$","1 mai 2026, 08:00:00"',
    'AAA,Achat,"2 438,77053819","0,00€","10,00€","1,48€","17 mai 2026, 00:09:10"',
    'ZZZ,Acheter - Plateforme Y,104 190,"0,00$","5,76$","0,00$","19 mai 2026, 23:38:11"',
    'BBB,Vendre - Autre Nom,"12,5","1,40$","17,34$","0,10€","19 mai 2026,\n 23:40:00"',
    'CCC,Acheter - Plateforme Y,104 190,5,"1,00$","104 190,50$","0,00$","20 mai 2026, 10:00:00"',
    'DDD,Achat,"3","2,00€","6,00€","0,00€","21 mai 2026, 10:00:00"', 'EEE,Vente,"1","6,00€","6,00€","0,00€","21 mai 2026, 10:00:00"'].join('\n');
  const rows = KF.parseCSV(csv), m = { asset: 0, type: 1, qty: 2, price: 3, eur: 4, fee: 5, date: 6 };
  const r = KP.importRows(rows.slice(1), m, { strict: true, head: rows[0], source: 'y.csv' }, u), T = a => r.txs.find(t => t.asset === a);
  chk(r.txs.length === 7 && !r.bad.length && T('USD').type === 'IGNORE', 'export type : 7 lignes lues, dépôt fiat « Autre » ignoré');
  chk(T('ZZZ').type === 'BUY' && T('BBB').type === 'SELL', '« Acheter - … » / « Vendre - … » reconnus quel que soit le suffixe');
  chk(T('ZZZ').qtyStatus === 'à reconstruire' && T('ZZZ').qtyRaw === 104190, 'quantité entière sans guillemets + prix arrondi à 0,00 : invérifiable → à reconstruire');
  chk(rows[5].length === 7 && rows[5][2] === '104 190,5' && rows.info.merged[0] === 6 && T('CCC').qty === 104190.5, 'décimale sans guillemets (champ coupé en deux) recollée et signalée');
  chk(rows[4][6] === '19 mai 2026,\n 23:40:00' && isFinite(T('BBB').date), 'saut de ligne dans une date entre guillemets toléré');
  chk(T('BBB').cur === 'USD' && T('BBB').valCur === 17.34 && T('BBB').feeCur === 0 && T('BBB').feeEur === 0.1, 'frais en € sur un montant en $ : frais gardés en €, montant converti');
  chk(T('AAA').recon && T('AAA').recon[0].field === 'prix' && Math.abs(T('AAA').unitPrice - 10 / 2438.77053819) < 1e-12, 'prix 0,00€ reconstruit (montant ÷ quantité)');
  chk(T('DDD').date === T('EEE').date && T('DDD').type === 'BUY' && T('EEE').type === 'SELL', 'swap : 2 lignes de même horodatage (achat + vente)');
  const z = T('ZZZ'); z.eur = 5; KP.resolveRecon(r.txs, [z], (a) => a === 'ZZZ' ? 0.000048 : 0);
  chk(z.qty === 104190 && z.qtyStatus === 'reconstruite' && z.recon.some(x => x.method === 'montant ÷ cours historique'), 'quantité confirmée par le cours historique du jour');
  const z2 = KP.importRows(rows.slice(3, 4), m, { strict: true, head: rows[0], source: 'y.csv' }, u).txs[0]; z2.eur = 5; KP.resolveRecon([z2], [z2], () => 0);
  chk(z2.qtyStatus === 'à confirmer' && z2.reconPending && z2.reconPending.choices.length > 1 && z2.qty === 104190 && z2.reconPending.choices[0] === 104190, 'sans cours : « à confirmer » (bloque le PDF)');
}
process.exit(ok ? 0 : 1);
