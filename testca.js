/* Tests du module Canada v1 (données FICTIVES uniquement ; attendus calculés à la main, voir docs/CA-RULES.md). Lancer : node testca.js */
const fs = require('fs'), C = require('./ca-engine.js');
let ok = 0, ko = 0;
const eq = (a, b, n) => { const s = JSON.stringify(a) === JSON.stringify(b); s ? ok++ : ko++; console.log((s ? 'OK    ' : 'ÉCHEC ') + n + (s ? '' : ' -> ' + JSON.stringify(a) + ' != ' + JSON.stringify(b))); };
const H = 'Date,Type,Asset,Quantity,Total (CAD),Fee (CAD),Received Asset,Received Quantity\n';
const csv = rows => H + rows.map(r => r.join(',')).join('\n');
const TO = 'America/Toronto', run = (rows, o) => C.compute(C.fromCSVText(csv(rows)).txs, o || { fileTz: TO, taxTz: TO });
const D = (r, d, a) => r.disposals.find(x => C.dmy(x.date) === d && (!a || x.asset === a));

// 1) PBR moyen global, frais d'achat dans le coût, frais de vente en dépense, transfert propre sans effet, échange = disposition + acquisition à la même valeur
//    Achats : 1 BTC 10 000 + 50 frais, 1 BTC 20 000 -> PBR 30 050 / 2 = 15 025 par BTC.
//    Vente 0,5 BTC 12 000, frais 20 : PBR 7 512,50 ; gain 12 000 - 7 512,50 - 20 = 4 467,50.
//    Échange 0,5 BTC -> 10 ETH valeur 9 000, frais 10 : PBR 7 512,50 ; gain 1 477,50 ; ETH coût 9 000.
//    Vente 5 ETH 3 000 : PBR 4 500 ; perte 1 500 (aucun ETH acquis du 02/10 au 01/12, données jusqu'au 15/12 : perte définitive).
//    Totaux 2025 : gains 5 945 ; pertes 1 500 ; net 4 445 ; imposable (1/2) 2 222,50.
const BASE = [['2025-01-10 10:00', 'Buy', 'BTC', 1, 10000, 50], ['2025-03-01 10:00', 'Buy', 'BTC', 1, 20000, 0], ['2025-06-01 10:00', 'Sell', 'BTC', 0.5, 12000, 20],
  ['2025-07-01 10:00', 'Send', 'BTC', 1, '', ''], ['2025-07-02 10:00', 'Receive', 'BTC', 1, '', ''], ['2025-08-01 10:00', 'Convert', 'BTC', 0.5, 9000, 10, 'ETH', 10],
  ['2025-11-01 10:00', 'Sell', 'ETH', 5, 3000, 0], ['2025-12-15 10:00', 'Buy', 'SOL', 1, 200, 0]];
{ const r = run(BASE), Y = C.yearSummary(r, 2025);
  eq([D(r, '01/06/2025').acb, D(r, '01/06/2025').gain, D(r, '01/08/2025').gain, D(r, '01/11/2025').gain, D(r, '01/11/2025').status], [7512.5, 4467.5, 1477.5, -1500, 'ok'], 'PBR moyen : vente, échange, perte définitive (calcul à la main)');
  eq([Y.gains, Y.losses, Y.net, Y.rate, Y.taxable, Y.allowableLoss, Y.count], [5945, 1500, 4445, 0.5, 2222.5, 0, 3], 'Totaux 2025 et inclusion 1/2');
  eq(r.pools, { BTC: { qty: 1, acb: 15025 }, ETH: { qty: 5, acb: 4500 }, SOL: { qty: 1, acb: 200 } }, 'Soldes : transferts propres sans effet sur le PBR'); }
// 2) Plusieurs plateformes : un seul PBR par actif (pas par portefeuille, pas FIFO). Achat 1 A à 100 (plateforme 1) puis 1 A à 300 (plateforme 2) ; vente 1 A à 250 -> PBR 200, gain 50 (FIFO aurait donné 150).
{ const p1 = C.fromCSVText(csv([['2025-02-01', 'Buy', 'AAA', 1, 100, 0]])), p2 = C.fromCSVText(csv([['2025-03-01', 'Buy', 'AAA', 1, 300, 0], ['2025-04-01', 'Sell', 'AAA', 1, 250, 0], ['2025-06-01', 'Buy', 'ZZZ', 1, 1, 0]]));
  const m = C.mergeFiles([{ name: 'a', p: p1 }, { name: 'b', p: p2 }]), r = C.compute(m.txs, { fileTz: TO, taxTz: TO });
  eq([D(r, '01/04/2025').acb, D(r, '01/04/2025').gain], [200, 50], 'PBR global sur deux fichiers (pas FIFO, pas par portefeuille)'); }
// 3) Coûts manquants : récompense sans valeur puis vente -> à vérifier (jamais un coût de 0) ; vente sans acquisition -> à vérifier.
{ const r = run([['2025-01-05', 'Staking reward', 'DOT', 2, '', ''], ['2025-02-05', 'Sell', 'DOT', 1, 20, 0], ['2025-03-05', 'Sell', 'XRP', 10, 5, 0]]), Y = C.yearSummary(r, 2025);
  eq([D(r, '05/02/2025').gain, /PBR\) inconnu/.test(D(r, '05/02/2025').status), /aucune acquisition/.test(D(r, '05/03/2025').status), Y.count, Y.toVerify.length, r.income[0].cad, Y.incomeUnknown], [null, true, true, 0, 2, null, 1], 'Coût inconnu et acquisition manquante : à vérifier, hors totaux'); }
// 4) Récompense avec valeur : ajoutée au PBR à sa valeur ; listée à part (revenu ou capital à examiner).
{ const r = run([['2025-01-05', 'Staking reward', 'DOT', 2, 30, ''], ['2025-02-05', 'Sell', 'DOT', 1, 20, 0], ['2025-04-01', 'Buy', 'ZZZ', 1, 1, 0]]);
  eq([D(r, '05/02/2025').acb, D(r, '05/02/2025').gain, C.yearSummary(r, 2025).incomeCad], [15, 5, 30], 'Récompense valorisée : coût = valeur reçue'); }
// 5) v2.56 Perte apparente (cas simple, vos achats) : rachat 1 ETH dans les 30 jours, détenu à J+30 -> S=1, P=1, B=1 : perte de 1 000 refusée en entier
//    (LIR art. 54, 40(2)g)(i)) et ajoutée au PBR du rachat (art. 53(1)f)) : PBR ETH = 2 100 + 1 000 = 3 100. Perte déductible 2025 = 0.
{ const r = run([['2025-09-01', 'Buy', 'ETH', 1, 3000, 0], ['2025-12-20', 'Sell', 'ETH', 1, 2000, 0], ['2026-01-05', 'Buy', 'ETH', 1, 2100, 0], ['2026-01-25', 'Buy', 'ZZZ', 1, 1, 0]]), Y = C.yearSummary(r, 2025), x = D(r, '20/12/2025');
  eq([x.gain, x.denied, x.status, Y.losses, Y.denied, Y.count, Y.partial, r.pools.ETH.acb], [-1000, 1000, 'ok', 0, 1000, 1, false, 3100], 'Perte apparente simple : refusée (S/P/B) et ajoutée au PBR du rachat (année suivante)'); }
// 5b) Données qui s'arrêtent avant J+30 -> perte en attente (pas perdue), hors totaux, totaux partiels.
{ const r = run([['2025-09-01', 'Buy', 'ETH', 1, 3000, 0], ['2025-12-20', 'Sell', 'ETH', 1, 2000, 0]]), x = D(r, '20/12/2025'), Y = C.yearSummary(r, 2025);
  eq([!!x.superficial, x.superficial.incomplete, /19\/01\/2026/.test(x.status), /pas perdue/.test(x.status), Y.losses, Y.partial], [true, true, true, true, 0, true], 'Fenêtre J+30 non couverte : perte en attente, totaux partiels'); }
// 5c) Rachat dans la fenêtre mais plus rien détenu à J+30 -> perte définitive.
{ const r = run([['2025-09-01', 'Buy', 'ETH', 1, 3000, 0], ['2025-12-20', 'Sell', 'ETH', 1, 2000, 0], ['2026-01-02', 'Buy', 'ETH', 1, 2100, 0], ['2026-01-10', 'Sell', 'ETH', 1, 2200, 0], ['2026-02-01', 'Buy', 'ZZZ', 1, 1, 0]]), x = D(r, '20/12/2025');
  eq([x.status, x.gain, C.yearSummary(r, 2025).losses], ['ok', -1000, 1000], 'Rachat revendu avant J+30 : perte définitive'); }
// 5d) Achat 10 ADA 20 jours AVANT la vente de 10 ADA à perte (-30), encore détenus à J+30 : S=10, P=10, B=10 -> 30 refusés, PBR restant 80 + 30 = 110.
{ const r = run([['2025-03-01', 'Buy', 'ADA', 10, 100, 0], ['2025-05-10', 'Buy', 'ADA', 10, 60, 0], ['2025-05-30', 'Sell', 'ADA', 10, 50, 0], ['2025-08-01', 'Buy', 'ZZZ', 1, 1, 0]]), x = D(r, '30/05/2025');
  eq([x.acb, x.gain, x.denied, r.pools.ADA.acb], [80, -30, 30, 110], 'Achat dans les 30 jours avant, unités détenues : perte refusée, ajoutée au PBR'); }
// 6) Taux d'inclusion : 2024, 2025, 2026 = 1/2 avec source ; 2023 non vérifié -> pas de gain imposable.
{ const r = run([['2023-01-01', 'Buy', 'BTC', 1, 100, 0], ['2023-06-01', 'Sell', 'BTC', 0.5, 100, 0], ['2024-06-01', 'Sell', 'BTC', 0.25, 50, 0], ['2026-02-01', 'Sell', 'BTC', 0.25, 60, 0]]);
  const Y3 = C.yearSummary(r, 2023), Y4 = C.yearSummary(r, 2024), Y6 = C.yearSummary(r, 2026);
  eq([Y3.rate, Y3.taxable, Y4.rate, Y4.taxable, Y6.rate, Y6.taxable, /art\. 38/.test(Y6.rateSrc), /Bonds, debentures/.test(Y4.form), Y6.form], [null, null, 0.5, 12.5, 0.5, 17.5, true, true, null], 'Inclusion par année et formulaire 2024/2025 distincts'); }
// 7) Conversion Banque du Canada : taux du jour, ou jour coté précédent (week-end) ; devise non cotée/taux absent -> exclue ; jamais USD = CAD.
(async () => {
  const HU = 'Date,Type,Asset,Quantity,Total (USD),Fee (USD)\n';
  const p = C.fromCSVText(HU + '2025-01-06 12:00,Buy,BTC,1,1000,10\n2025-01-11 12:00,Sell,BTC,0.5,800,0\n2025-02-03 12:00,Sell,BTC,0.1,100,0\n'); p.fileTz = TO;
  const urls = []; await C.convertFx(p, async u => { urls.push(u); return { observations: [{ d: '2025-01-06', FXUSDCAD: { v: '1.4300' } }, { d: '2025-01-10', FXUSDCAD: { v: '1.4400' } }] }; }, TO);
  const r = C.compute(p.txs, { fileTz: TO, taxTz: TO });
  eq([p.txs.length, p.fx.count, p.fx.missing, p.txs[0].cad, Math.round(p.txs[0].fee * 100) / 100, p.txs[1].fx.on, p.txs[1].cad, /FXUSDCAD\/json\?start_date=2024-12-30&end_date=2025-02-03/.test(urls[0])], [2, 2, 1, 1430, 14.3, '2025-01-10', 1152, true], 'Banque du Canada : taux du jour, du vendredi pour un samedi, ligne sans taux exclue');
  eq(D(r, '11/01/2025').gain, 1152 - 722.15, 'Gain en CAD après conversion (1 152 - (1 430 + 14,30) / 2)');
  { const q = C.fromCSVText('Date,Type,Asset,Quantity,Total ($)\n2025-01-06,Buy,BTC,1,1000\n'); eq([q.txs.length, /\$/.test(q.skipped[0].why)], [0, true], '« $ » seul : ligne écartée (CAD ou USD jamais deviné)'); }
  { const q = C.fromCSVText('Date,Type,Asset,Quantity,Total\n2025-01-06,Buy,BTC,1,1000\n'); eq([q.txs[0].cur, q.assumedCad], ['CAD', 1], 'Aucune devise indiquée : CAD supposé et signalé'); }
  // 8) Dates et fuseaux : 31/12 23:59 heure de l'Est = 2025 ; même instant en UTC = 2026 ; décalages explicites ; dates seules non décalées ; Binance UTC+1.
  { const q = C.fromCSVText(H + '2025-01-01,Buy,BTC,1,100,0\n2026-01-01T04:30:00Z,Sell,BTC,0.5,100,0\n2026-01-01,Sell,BTC,0.25,100,0\n2026-02-01,Buy,ZZZ,1,1,0\n');
    const rT = C.compute(q.txs, { fileTz: 'UTC', taxTz: TO }), rH = C.compute(q.txs, { fileTz: 'UTC', taxTz: 'America/Halifax' });
    eq([rT.disposals.map(x => x.year), rH.disposals.map(x => x.year), q.txs.find(t => t.tz) && q.txs.find(t => t.tz).tz, q.txs.filter(t => t.dateOnly).length], [[2025, 2026], [2026, 2026], 'UTC', 3], '04:30Z le 1er janvier : 2025 à Toronto, 2026 à Halifax ; date seule = 1er janvier partout'); }
  { const q = C.fromCSVText(H + '2025-12-31 23:59,Sell,BTC,1,100,0\n'); eq([C.compute(q.txs, { fileTz: TO, taxTz: TO }).disposals[0].year, C.compute(q.txs, { fileTz: TO, taxTz: 'UTC' }).disposals[0].year], [2025, 2026], '31/12 23:59 heure de l\'Est : 2025 avec dates de l\'Est (2026 si UTC)'); }
  { const q = C.fromCSVText(H + '2024-02-29 12:00,Buy,BTC,1,100,0\n2024-03-10 06:30,Buy,BTC,1,100,0\n'); const r2 = C.compute(q.txs, { fileTz: 'UTC', taxTz: TO }); eq([C.dmy(q.txs[0].date), r2.pools.BTC.qty], ['29/02/2024', 2], 'Année bissextile et changement d\'heure lus'); }
  { const BN = 'User ID,Time,Account,Operation,Coin,Change,Remark\n1,2025-03-01 10:00:00,Spot,Transaction Buy,AAA,2,\n1,2025-03-01 10:00:00,Spot,Transaction Spend,EUR,-400,\n1,2026-01-01 03:00:00,Spot,Transaction Sold,AAA,-1,\n1,2026-01-01 03:00:00,Spot,Transaction Revenue,EUR,300,\n';
    const b = C.fromCSVText(BN, 'Binance-Transaction-History-202601011200(UTC+1)-part1-of1.csv'), s = b.txs.find(t => t.type === 'SELL');
    eq([b.binance, s && s.tz, s && new Date(s.date).toISOString(), s && s.cur], [true, 'UTC', '2026-01-01T02:00:00.000Z', 'EUR'], 'Binance UTC+1 : instant exact (02:00 UTC), montant en EUR à convertir');
    if (s) { s.cad = 450; delete s.needFx; const bb = b.txs.find(t => t.type === 'BUY'); bb.cad = 600; bb.fee = 0; delete bb.needFx; eq(C.compute(b.txs, { fileTz: 'UTC', taxTz: TO }).disposals[0].year, 2025, 'Binance 01/01/2026 03:00 UTC+1 = 31/12/2025 21:00 à Toronto -> 2025'); } }
  { eq([C.slashOrder(['03/04/2025']), C.slashOrder(['25/04/2025', '03/04/2025']), C.slashOrder(['04/25/2025'])], ['AMB', 'DMY', 'MDY'], 'JJ/MM ou MM/JJ décidé pour tout le fichier');
    const q = C.fromCSVText(H + '03/04/2025,Buy,BTC,1,100,0\n'); eq([q.txs.length, /ambiguë/.test(q.skipped[0].why)], [0, true], 'Date ambiguë 03/04/2025 : écartée, jamais devinée'); }
  { eq([C.resolveTaxTz('auto', 'UTC', 'Europe/Paris').tz, C.resolveTaxTz('auto', 'America/Vancouver', 'Europe/Paris').tz, C.resolveTaxTz('America/Halifax', 'America/Vancouver', 'x').tz, C.Lx(C.resolveTaxTz('auto', 'UTC', 'America/Edmonton').how)], [TO, 'America/Vancouver', 'America/Halifax', 'zone de ce navigateur'], 'Zone des dates fiscales : choix > fichier canadien > navigateur canadien > Est'); }
  // 9) v2.56 Doublons : sans identifiant, jamais fusionnés en silence (gardés + totaux partiels) ; choix « doublons » = une fois ; même ID = vrai doublon
  { const a = C.fromCSVText(csv([['2025-01-01', 'Buy', 'BTC', 1, 100, 0]])), b = C.fromCSVText(csv([['2025-01-01', 'Buy', 'BTC', 1, 100, 0], ['2025-02-01', 'Sell', 'BTC', 1, 150, 0]])), L = [{ name: 'a', p: a }, { name: 'b', p: b }];
    const m0 = C.mergeFiles(L), m1 = C.mergeFiles(L, 'same'), m2 = C.mergeFiles(L, 'distinct'), r0 = C.compute(m0.txs, { fileTz: TO, taxTz: TO }); r0.dupPending = m0.dupPending;
    eq([m0.txs.length, m0.dupPending, m0.dupCand.length, C.yearSummary(r0, 2025).partial, m1.txs.length, m1.dupes, m2.txs.length, m2.dupPending], [3, 1, 1, true, 2, 1, 3, 0], 'Doublon sans ID : gardé et signalé (partiel) ; « doublons » = une fois ; « distinctes » = tout gardé');
    const HI = 'Date,Type,Asset,Quantity,Total (CAD),Transaction ID\n', i1 = C.fromCSVText(HI + '2025-01-01,Buy,BTC,1,100,T-1\n'), i2 = C.fromCSVText(HI + '2025-01-01,Buy,BTC,1,100,T-1\n2025-01-01,Buy,BTC,1,100,T-2\n'), mi = C.mergeFiles([{ p: i1 }, { p: i2 }]);
    eq([mi.txs.length, mi.dupes, mi.dupPending, C.fileSig(i1) === C.fileSig(C.fromCSVText(HI + '2025-01-01,Buy,BTC,1,100,T-1\n'))], [2, 1, 0, true], 'Même ID = vrai doublon ; ID différents = deux achats ; même contenu reconnu'); }
  // 10) Sécurité : formules CSV neutralisées, PDF ASCII, noms de fichier
  { const q = C.fromCSVText(H + '2025-01-01,Buy,=HYPERLINK(1),1,100,0\n2025-02-01,Sell,=HYPERLINK(1),1,150,0\n'), r = C.compute(q.txs, { fileTz: TO, taxTz: TO }), out = C.toCSV(r, 2025);
    eq([/,'=HYPERLINK/.test(out), /(^|,)=HYPERLINK/m.test(out)], [true, false], 'CSV : cellule commençant par = neutralisée');
    const pd = C.pdfData(r, 2025, new Date(Date.UTC(2026, 0, 2))), all = [pd.title, pd.foot].concat(pd.info, ...pd.rows, pd.head).join('\n');
    eq([/^[\x20-\x7e\n]*$/.test(all), /Annexe 3 \(2025\)/.test(all), /1\/2/.test(all)], [true, true, true], 'PDF : texte ASCII, année et formulaire 2025, inclusion 1/2');
    eq(C.fileName(2025, 'csv', new Date(2026, 3, 9, 7, 5)), 'kryptax-canada-2025_2026-04-09_07h05.csv', 'Nom de fichier : pays, année, date et heure'); }
  // 11) Intégration page : bouton Canada, section en français, bêta, sources, script chargé ; anciens pays présents
  { const html = fs.readFileSync(__dirname + '/index.html', 'utf8'), app = fs.readFileSync(__dirname + '/app.js', 'utf8');
    eq([/id="regca"[^>]*lang="fr"[^>]*><svg class="flag"/.test(html), /<section id="camode"[^>]*lang="fr"/.test(html), /id="camode"[\s\S]*?Bêta/.test(html), /class="law calaw"/.test(html), /ca-engine\.js\?v=/.test(html), ['regfr', 'regus', 'reguk', 'regde'].every(i => html.includes('id="' + i + '"')), /set\('CA', true\)/.test(app)], [true, true, true, true, true, true, true], 'Page : Canada dans le menu (drapeau), section française bêta, sources, FR/US/UK/DE conservés'); }
  // 12) v2.54 Excel : cellules date réelles (classeur SheetJS), heure murale du fichier quel que soit le fuseau du processus (test:tz) ; dates seules non décalées ; 1904
  { const X = require('./xlsx.mini.min.js'), mk = (rows, o) => { const ws = X.utils.aoa_to_sheet(rows, { cellDates: true }), wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'S'); if (o) wb.Workbook = { WBProps: { date1904: true } }; return new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx' })); };
    const loc = (y, m, d, h, mi) => new Date(y, m - 1, d, h || 0, mi || 0); // SheetJS écrit l'heure murale locale de l'objet Date
    const R = [['Date', 'Type', 'Asset', 'Quantity', 'Total (CAD)'], [loc(2025, 3, 9, 1, 30), 'Buy', 'BTC', 1, 100], [loc(2025, 12, 31, 23, 59), 'Sell', 'BTC', 0.5, 80], [loc(2025, 11, 2), 'Buy', 'ETH', 1, 10]];
    const q = C.fromWorkbook(X, mk(R), 'x.xlsx'), iso = q.txs.map(t => new Date(t.date).toISOString().slice(0, 16) + (t.dateOnly ? ' J' : ''));
    eq(iso, ['2025-03-09T01:30', '2025-11-02T00:00 J', '2025-12-31T23:59'], 'Excel : cellules date = heure murale exacte (changement d\'heure, 31/12 23:59), date seule gardée, processus TZ=' + (process.env.TZ || 'local'));
    const r = C.compute(q.txs, { fileTz: TO, taxTz: TO }); eq(r.disposals.map(d => d.year), [2025], 'Excel : vente 31/12 23:59 heure de l\'Est en 2025');
    const q2 = C.fromWorkbook(X, mk(R, true), 'y.xlsx'); eq(q2.txs.map(t => new Date(t.date).toISOString().slice(0, 16)).join(), iso.map(s => s.slice(0, 16)).join(), 'Excel calendrier 1904 : mêmes dates'); }
  // 13) v2.54 Binance : Excel et PDF lus comme le CSV (fixtures fictives des tests UK/DE)
  { const src = fs.readFileSync(__dirname + '/testuk.js', 'utf8'), BN = new Function(src.slice(src.indexOf('const BN_H'), src.indexOf('const BN_CSV')) + 'return [BN_H, BN_L];')(), NAME = 'Binance-Transaction-History-202601011200(UTC+1)-part1-of1.csv';
    const p = C.fromCSVText(Buffer.from(BN[0] + '\n' + BN[1].join('\n')), NAME), k = t => [t.type, t.asset, t.date, t.qty, t.amt, t.cur, t.tz, t.toAsset, t.toQty].join('|');
    const XL = [[], ['', '', 'Transaction History'], ['', '', 'User ID', '1', 'Period(UTC+1)', 'x'], [], ['', '', ...BN[0].split(',').flatMap(h => [h, ''])]].concat(BN[1].map(l => ['', '', ...l.split(',').flatMap(v => [v, ''])]));
    const x = C.parseRows(XL, 'export.xlsx'), pd = C.fromPdfLines(fs.readFileSync(__dirname + '/testdata/binance_fictif.pdf.txt', 'utf8').split('\n'));
    eq([p.txs.length > 5, JSON.stringify(x.txs.map(k)) === JSON.stringify(p.txs.map(k)), pd.txs.length > 0 && JSON.stringify(pd.txs.map(k)) === JSON.stringify(p.txs.slice(0, pd.txs.length).map(k)), p.txs.every(t => t.tz === 'UTC')], [true, true, true, true], 'Binance : Excel et PDF = CSV (mêmes lignes, UTC+1 appliqué)'); }
  // 14) v2.54 Changement de fuseau fiscal : conversion refaite depuis les lignes brutes (pas de double conversion), bon jour de taux et bonne année
  { const raw = C.fromCSVText('Date,Type,Asset,Quantity,Total,Currency\n2025-12-01T10:00:00Z,Buy,LTC,5,500,USD\n2026-01-01T04:30:00Z,Sell,LTC,5,800,USD\n'), seen = [];
    const gj = async u => { seen.push(u); return { observations: [{ d: '2025-12-01', FXUSDCAD: { v: '1.4000' } }, { d: '2025-12-31', FXUSDCAD: { v: '1.3706' } }, { d: '2026-01-02', FXUSDCAD: { v: '1.3737' } }] }; };
    const fresh = p => ({ ...p, txs: p.txs.map(t => ({ ...t })), skipped: p.skipped.slice() }), res = {};
    for (const z of ['America/Toronto', 'America/Halifax', 'America/Toronto']) { const p = await C.convertFx(fresh(raw), gj, z), r = C.compute(p.txs, { fileTz: 'UTC', taxTz: z }), d = r.disposals[0]; res[z] = [d.year, C.dmy(d.date), d.fx ? d.fx.on : p.txs[1].fx.on, +p.txs[1].cad.toFixed(2)]; }
    eq([res['America/Toronto'], res['America/Halifax'], raw.txs.every(t => t.needFx && !t.fx && !isFinite(t.cad))], [[2025, '31/12/2025', '2025-12-31', 1096.48], [2026, '01/01/2026', '2025-12-31', 1096.48], true], 'Fuseau : Toronto 31/12/2025, Halifax 01/01/2026 (taux du 31/12, 1er janvier férié), lignes brutes intactes'); }
  // 15) v2.54 PDF : CAD écrit en clair (titre, colonnes, montants), jamais « $ » seul ; colonne Currency séparée lue
  { const r = run(BASE), pd = C.pdfData(r, 2025, new Date(Date.UTC(2026, 0, 2))), all = [pd.title].concat(pd.info, ...pd.rows, pd.head).join('\n');
    eq([/montants en CAD/.test(pd.title), pd.head.filter(h => /\(CAD\)/.test(h)).length, /\$/.test(all), /4 445,00 CAD/.test(all)], [true, 4, false, true], 'PDF : « CAD » dans le titre, 4 colonnes et les montants ; aucun « $ »');
    const q = C.fromCSVText('Date,Type,Asset,Quantity,Total,Currency\n2025-01-01,Buy,BTC,1,100,USD\n2025-01-02,Buy,BTC,1,100,XYZ\n2025-01-03,Buy,BTC,1,100,\n');
    eq([q.txs.map(t => t.cur).join(), q.txs[0].needFx, /XYZ/.test(q.skipped[0] && q.skipped[0].why), q.assumedCad], ['USD,CAD', true, true, 1], 'Colonne Currency séparée : USD à convertir, code inconnu écarté, vide = CAD supposé signalé'); }
  // 16) v2.54 Français / anglais : mêmes chiffres et mêmes alertes ; exports anglais sans français ; CAD écrit ; langue remise en français
  { const r = run(BASE.concat([['2025-12-20 10:00', 'Sell', 'SOL', 1, 100, 0], ['2026-01-05 10:00', 'Buy', 'SOL', 1, 90, 0]])), num = t => (t.split(/\r\n(?:À vérifier|To verify)\r\n/)[0].match(/-?\d[\d.]*\.\d\d/g) || []).join(' '); // montants du tableau (les alertes écrivent les montants au format de la langue)
    C.setLang('fr'); const cf = C.toCSV(r, 2025), pf = C.pdfData(r, 2025, new Date(Date.UTC(2026, 0, 2))), kf = C.checks(r, C.yearSummary(r, 2025)).length;
    C.setLang('en'); const ce = C.toCSV(r, 2025), pe = C.pdfData(r, 2025, new Date(Date.UTC(2026, 0, 2))), ke = C.checks(r, C.yearSummary(r, 2025)), allE = [pe.title, pe.foot].concat(pe.info, ...pe.rows, pe.head).join('\n');
    eq([num(cf) === num(ce), kf === ke.length, /2,222\.50 CAD/.test(allE) && /Proceeds \(CAD\)/.test(allE), /\$/.test(allE), /à vérifier|Montant|Résultat|Pertes|perte|a verifier|Annee|Recompenses/.test(ce + allE), /2025-12-20 SOL|loss\(es\) (?:to review|pending)/.test(ke.join(' ') + allE)], [true, true, true, false, false, true], 'Anglais : mêmes nombres CSV, même nombre d\'alertes, PDF en CAD, aucun texte français, perte à examiner signalée');
    C.setLang('fr'); eq(C.cad(1234.5), '1\u00a0234,50\u00a0$', 'Retour au français : format inchangé'); }
  // ---------- v2.56 : corrections de l'audit Canada (attendus calculés à la main, données fictives) ----------
  // 17) Staking : blocage / déblocage = vos propres fonds (pas de récompense inventée, pas de double inventaire) ; seule la récompense est un revenu.
  //     10 ETH 20 000 ; Stake 10 ; Unstake 10 ; récompense 0,1 ETH = 300 ; vente 10 ETH 30 000 : PBR 20 300 × 10 / 10,1 = 20 099,01 ; gain 9 900,99. Totaux « partiels » (mouvement à confirmer).
  { const r = run([['2025-01-10 10:00', 'Buy', 'ETH', 10, 20000, 0], ['2025-02-01 10:00', 'Stake', 'ETH', 10, '', ''], ['2025-03-01 10:00', 'Unstake', 'ETH', 10, '', ''], ['2025-03-01 11:00', 'Staking Rewards', 'ETH', 0.1, 300, ''], ['2025-06-01 10:00', 'Sell', 'ETH', 10, 30000, 0], ['2025-08-01 10:00', 'Buy', 'ZZZ', 1, 1, 0]]), Y = C.yearSummary(r, 2025), x = D(r, '01/06/2025');
    eq([x.acb, x.gain, r.income.length, r.moves.length, +r.pools.ETH.qty.toFixed(6), Y.partial, ['Unstake', 'Staking unlock', 'Simple Earn redemption', 'Staking subscription', 'Staking Rewards', 'Staking'].map(C.kind).join()], [20099.01, 9900.99, 1, 2, 0.1, true, 'MOVE,MOVE,MOVE,MOVE,INCOME,STAKEAMB'], 'Staking : déblocage sans récompense ni double quantité ; récompense seule au revenu ; totaux à confirmer'); }
  // 18) Reçu ≠ envoyé : don reçu = acquisition (coût = valeur indiquée), paiement reçu = acquisition (revenu possible), jamais une vente.
  { const r = run([['2025-01-10 10:00', 'Gift received', 'ETH', 2, 6000, 0], ['2025-01-11 10:00', 'Payment received', 'BTC', 0.5, 60, 0], ['2025-01-12 10:00', 'Paiement reçu', 'BTC', 0.5, 40, 0], ['2025-03-10 10:00', 'Sell', 'ETH', 2, 7000, 0], ['2025-06-01 10:00', 'Gift sent', 'BTC', 0.1, 20, 0]]);
    eq([r.disposals.length, D(r, '10/03/2025').gain, r.income.map(x => x.kind).join(), D(r, '01/06/2025').gift, D(r, '01/06/2025').acb], [2, 1000, 'RECV,RECV,RECV', true, 10], 'Don/paiement reçu : acquisition ; don envoyé : disposition (PBR 100/1 × 0,1 = 10)'); }
  // 19) Échange avec une monnaie : Convert CAD -> BTC = achat (pas de « vente de CAD ») ; Convert BTC -> CAD = vente.
  { const r = run([['2025-01-10 10:00', 'Convert', 'CAD', 1000, '', 0, 'BTC', 0.01], ['2025-02-10 10:00', 'Convert', 'BTC', 0.005, '', 0, 'CAD', 650], ['2025-03-10 10:00', 'Sell', 'BTC', 0.005, 600, 0], ['2025-05-01 10:00', 'Buy', 'ZZZ', 1, 1, 0]]);
    eq([r.disposals.map(x => x.asset).join(), r.disposals.map(x => x.gain).join(), !r.pools.CAD], ['BTC,BTC', '150,100', true], 'Convert CAD->BTC = achat 1 000 ; BTC->CAD = vente 650 (gain 150), puis vente 600 (gain 100)'); }
  // 20) Excel : « date seule » selon le FORMAT de la cellule. 2026-01-01 00:00:00 au format date+heure, fichier UTC -> 31/12/2025 19:00 à Toronto (2025) ;
  //     même valeur au format date seule -> jour civil 2026 ; format date seule avec une heure cachée (12:00) -> heure gardée ; calendrier 1904 identique.
  { const X = require('./xlsx.mini.min.js'), ser = Date.UTC(2026, 0, 1) / 864e5 + 25569;
    const wb = (z, v, w1904) => { const ws = X.utils.aoa_to_sheet([['Date', 'Type', 'Asset', 'Quantity', 'Total (CAD)'], [45000, 'Buy', 'X', 1, 100], [v, 'Sell', 'X', 1, 150]]); ['A2', 'A3'].forEach(a => { ws[a].t = 'n'; ws[a].z = z; }); if (w1904) { ws.A2.v -= 1462; ws.A3.v -= 1462; } const b = X.utils.book_new(); X.utils.book_append_sheet(b, ws, 'S'); if (w1904) b.Workbook = { WBProps: { date1904: true } }; return new Uint8Array(X.write(b, { type: 'array', bookType: 'xlsx' })); };
    const yr = (z, v, w) => { const q = C.fromWorkbook(X, wb(z, v, w), 'x.xlsx'), t = q.txs.find(t => t.type === 'SELL'); return [t.dateOnly ? 'J' : 'H', C.compute(q.txs, { fileTz: 'UTC', taxTz: TO }).disposals[0].year]; };
    eq([yr('yyyy-mm-dd hh:mm:ss', ser), yr('yyyy-mm-dd', ser), yr('yyyy-mm-dd', ser + 0.5), yr('yyyy-mm-dd hh:mm:ss', ser, true), yr('[$-409]m/d/yy h:mm AM/PM;@', ser)], [['H', 2025], ['J', 2026], ['H', 2026], ['H', 2025], ['H', 2025]], 'Excel : minuit au format date+heure converti (2025 à Toronto), date seule = jour civil, heure cachée gardée, 1904, format AM/PM (TZ=' + (process.env.TZ || 'local') + ')'); }
  // 21) CSV : tout texte commençant par = + - @ (même après des espaces) neutralisé ; nombres négatifs gardés.
  eq(['-1+HYPERLINK("http://exemple.invalid")', ' =1+1', '\t@SUM(A1)', '+33', '-1500.00', '-2,5', '12'].map(C.csvSafe), ['\'-1+HYPERLINK("http://exemple.invalid")', '\' =1+1', '\'\t@SUM(A1)', '\'+33', '-1500.00', '-2,5', '12'], 'CSV : formules neutralisées (y compris -1+...), vrais nombres intacts');
  { const q = C.fromCSVText(H + '2025-01-01,Buy,"-1+HYPERLINK(""http://exemple.invalid"")",1,100,0\n2025-02-01,Sell,"-1+HYPERLINK(""http://exemple.invalid"")",1,150,0\n'), out = C.toCSV(C.compute(q.txs, { fileTz: TO, taxTz: TO }), 2025);
    eq([/(^|,)"?-1\+HYPERLINK/mi.test(out), /'-1\+HYPERLINK/i.test(out), /,-?50\.00,/.test(out)], [false, true, true], 'CSV exporté : actif « -1+HYPERLINK » neutralisé, montants intacts'); }
  // 22) Perte apparente PARTIELLE (vos achats) : 10 ETH 40 000 vendus 20 000 (perte 20 000) ; rachat 1 ETH 2 000 détenu à J+30.
  //     S=10, P=1, B=1 : refusée 1/10 × 20 000 = 2 000 ; déductible 18 000 ; PBR du rachat 2 000 + 2 000 = 4 000.
  { const r = run([['2025-03-01 10:00', 'Buy', 'ETH', 10, 40000, 0], ['2025-06-01 10:00', 'Sell', 'ETH', 10, 20000, 0], ['2025-06-15 10:00', 'Buy', 'ETH', 1, 2000, 0], ['2025-08-01 10:00', 'Buy', 'ZZZ', 1, 1, 0]]), Y = C.yearSummary(r, 2025), x = D(r, '01/06/2025');
    eq([x.gain, x.denied, x.sl.S, x.sl.P, x.sl.B, Y.losses, Y.denied, Y.net, Y.allowableLoss, r.pools.ETH.acb, Y.partial], [-20000, 2000, 10, 1, 1, 18000, 2000, -18000, 9000, 4000, false], 'Perte apparente partielle : 2 000 refusés, 18 000 déductibles, PBR rachat 4 000'); }
  // 23) Cas complexe (autre vente dans la fenêtre) : perte à examiner, PBR incertain -> vente suivante hors totaux (pas de simulation inventée).
  { const r = run([['2025-01-01 10:00', 'Buy', 'SOL', 10, 10000, 0], ['2025-03-01 10:00', 'Sell', 'SOL', 5, 3000, 0], ['2025-03-10 10:00', 'Buy', 'SOL', 5, 2500, 0], ['2025-03-20 10:00', 'Sell', 'SOL', 2, 1000, 0], ['2025-06-01 10:00', 'Buy', 'ZZZ', 1, 1, 0]]), Y = C.yearSummary(r, 2025);
    eq([!!D(r, '01/03/2025').superficial, D(r, '01/03/2025').superficial.complex, /PBR incertain/.test(D(r, '20/03/2025').status), Y.count, Y.partial, r.pools.SOL.acb], [true, true, true, 0, true, null], 'Perte apparente complexe : à examiner, PBR incertain propagé, totaux partiels'); }
  // 24) Date sans heure : achat et vente du même actif le même jour -> ordre inconnu, vente hors totaux (pas d'avantage « minuit » inventé).
  { const r = run([['2025-03-01', 'Buy', 'BTC', 1, 100, 0], ['2025-03-01', 'Sell', 'BTC', 1, 150, 0], ['2025-06-01', 'Buy', 'ZZZ', 1, 1, 0]]), Y = C.yearSummary(r, 2025);
    eq([/ordre dans la journée inconnu/.test(D(r, '01/03/2025').status), Y.count, Y.partial, r.sameDay], [true, 0, true, 1], 'Même jour sans heure : ordre inconnu signalé, totaux partiels'); }
  // 25) Frais réseau : en crypto (quantité connue) -> retirés du solde avec leur part de PBR ; en CAD seulement (quantité inconnue) -> PBR incertain ensuite.
  { const a = run([['2025-01-01 10:00', 'Buy', 'BTC', 1, 100, 0], ['2025-02-01 10:00', 'Withdrawal fee', 'BTC', 0.01, '', ''], ['2025-03-01 10:00', 'Sell', 'BTC', 0.99, 200, 0], ['2025-06-01 10:00', 'Buy', 'ZZZ', 1, 1, 0]]);
    const b = run([['2025-01-01 10:00', 'Buy', 'BTC', 1, 100, 0], ['2025-02-01 10:00', 'Send', 'BTC', 1, '', 5], ['2025-03-01 10:00', 'Sell', 'BTC', 1, 200, 0], ['2025-06-01 10:00', 'Buy', 'ZZZ', 1, 1, 0]]);
    eq([D(a, '01/03/2025').acb, D(a, '01/03/2025').gain, a.pools.BTC.qty, /frais de transfert/.test(D(b, '01/03/2025').status), C.yearSummary(b, 2025).partial], [99, 101, 0, true, true], 'Frais réseau : 0,01 BTC retiré (PBR 99, gain 101) ; frais en CAD seulement -> vente à vérifier'); }
  // 26) Relevé PDF (lignes FICTIVES au format « Symbole Type Quantité Prix Valeur Frais Date ») : « $ » seul mis de côté jusqu'au choix USD/CAD (jamais deviné) ;
  //     vente + achat à la même seconde avec les mêmes frais = échange, frais comptés une fois (2 $ -> 1 + 1) ; récompense sans montant = récompense sans valeur (pas écartée, pas de coût 0).
  { const L = ['BTC Acheter - Plateforme X 0,01 50000,00$ 500,00$ 2,00$ 10 mai 2025, 10:00:00', 'BTC Vendre - Plateforme X 0,005 60000,00$ 300,00$ 2,00$ 12 mai 2025, 10:00:00', 'ETH Acheter - Plateforme X 0,1 3000,00$ 300,00$ 2,00$ 12 mai 2025, 10:00:00', 'ADA Récompense Apprendre 5,0 15 juil. 2025, 12:15:37'];
    const p = C.fromPdfLines(L), q = C.applyDollar(p, 'USD'), rw = p.txs.find(t => t.asset === 'ADA');
    eq([p.txs.length, p.dollar.length, p.skipped.filter(x => x.dollar).length, p.pairs, q.txs.length, q.txs.filter(t => t.cur === 'USD' && t.needFx).length, q.txs.find(t => t.type === 'SELL').feeAmt, q.txs.find(t => t.asset === 'ETH').feeAmt, q.skipped.length, rw && rw.type, rw && isFinite(rw.cad)], [1, 3, 3, 1, 4, 3, 1, 1, 0, 'INCOME', false], 'Relevé : « $ » en attente du choix USD/CAD ; échange à la même seconde = frais une fois ; récompense sans montant gardée sans valeur'); }
  // 27) Bêta bien visible : ambre (sombre) / rouge vif (clair), contraste AA du badge et de la note ; France sans badge bêta.
  { const css = fs.readFileSync(__dirname + '/style.css', 'utf8'), html = fs.readFileSync(__dirname + '/index.html', 'utf8');
    const L = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }, cr = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const fr = html.replace(/<section id="(?:us|de|uk|ca|au)mode"[\s\S]*?<\/section>/g, ''); // reste de la page = France
    eq([/\.betatag\{background:#fbbf24;color:#111827/.test(css), /\[data-theme="light"\] \.betatag\{background:#dc2626;color:#fff/.test(css), cr('#fbbf24', '#111827') >= 4.5, cr('#dc2626', '#ffffff') >= 4.5, cr('#fbbf24', '#0f1626') >= 4.5, cr('#b91c1c', '#ffffff') >= 4.5, /betatag/.test(fr)], [true, true, true, true, true, true, false], 'Bêta : ambre/sombre et rouge vif/clair, contrastes AA, aucun badge bêta côté France'); }
  // 28) Récompenses gratuites sans valeur : regroupées par actif, « gratuit » ≠ valeur nulle (jamais un coût de 0).
  { const r = run([['2025-01-05', 'Learn reward', 'ADA', 5, '', ''], ['2025-02-05', 'Learn reward', 'ADA', 3, '', ''], ['2025-03-05', 'Learn reward', 'DOT', 1, '', ''], ['2025-06-01', 'Buy', 'ZZZ', 1, 1, 0]]), k = C.checks(r, C.yearSummary(r, 2025)).join(' ');
    eq([/ADA \(2\), DOT \(1\)/.test(k), /pas dire valeur nulle/.test(k), r.pools.ADA.acb], [true, true, null], 'Récompenses sans valeur regroupées par actif ; coût inconnu (pas 0)'); }
  // 29) v2.58 « Staking » seul = ambigu : ni revenu, ni stock, ni coût inventés ; vente suivante hors totaux. « Staking reward » (EN) / « Récompense de staking » (FR) = récompense.
  { const amb = run([['2025-01-01 10:00', 'Buy', 'ETH', 1, 1000, 0], ['2025-02-01 10:00', 'Staking', 'ETH', 0.1, '', ''], ['2025-03-01 10:00', 'Sell', 'ETH', 0.5, 800, 0], ['2025-06-01 10:00', 'Buy', 'ZZZ', 1, 1, 0]]), Ya = C.yearSummary(amb, 2025), ka = C.checks(amb, Ya).join(' ');
    const amb2 = run([['2025-01-01 10:00', 'Buy', 'ETH', 1, 1000, 0], ['2025-02-01 10:00', 'Jalonnement', 'ETH', 0.1, '', ''], ['2025-03-01 10:00', 'Sell', 'ETH', 1.1, 1500, 0], ['2025-06-01 10:00', 'Buy', 'ZZZ', 1, 1, 0]]);
    const rwE = run([['2025-01-01 10:00', 'Buy', 'ETH', 1, 1000, 0], ['2025-02-01 10:00', 'Staking reward', 'ETH', 0.1, 200, ''], ['2025-03-01 10:00', 'Sell', 'ETH', 1.1, 1500, 0], ['2025-06-01 10:00', 'Buy', 'ZZZ', 1, 1, 0]]);
    const rwF = run([['2025-01-01 10:00', 'Buy', 'ETH', 1, 1000, 0], ['2025-02-01 10:00', 'Récompense de staking', 'ETH', 0.1, 200, ''], ['2025-03-01 10:00', 'Sell', 'ETH', 1.1, 1500, 0], ['2025-06-01 10:00', 'Buy', 'ZZZ', 1, 1, 0]]);
    eq([amb.income.length, amb.stakeAmb.length, /PBR incertain \(staking ambigu/.test(D(amb, '01/03/2025').status), Ya.count, Ya.partial, /sans précision/.test(ka), /aucune acquisition/.test(D(amb2, '01/03/2025').status), amb2.income.length,
        rwE.income.length, D(rwE, '01/03/2025').gain, rwF.income.length, D(rwF, '01/03/2025').gain, C.yearSummary(rwE, 2025).partial],
       [0, 1, true, 0, true, true, true, 0, 1, 300, 1, 300, false], 'Staking ambigu : à examiner, aucun revenu/stock/coût inventé, vente suivante hors totaux ; Staking reward FR/EN : revenu 200, gain 300'); }
  // 30) Même jour sans heure : la vente reste hors totaux ET le reste du stock devient incertain (vente suivante datée aussi hors totaux), pas de calcul définitif silencieux.
  { const r = run([['2025-03-01', 'Buy', 'BTC', 2, 200, 0], ['2025-03-01', 'Sell', 'BTC', 1, 150, 0], ['2025-04-01', 'Sell', 'BTC', 1, 150, 0], ['2025-06-01', 'Buy', 'ZZZ', 1, 1, 0]]), Y = C.yearSummary(r, 2025);
    eq([D(r, '01/03/2025').gain, /PBR incertain \(ordre inconnu/.test(D(r, '01/04/2025').status), Y.count, Y.partial], [null, true, 0, true], 'Même jour : achats d\'abord seulement provisoire ; ventes du jour et suivantes hors totaux'); }
  console.log(ko ? ko + ' ÉCHEC(S)' : 'testca : tout est OK (' + ok + ')'); process.exit(ko ? 1 : 0);
})();
