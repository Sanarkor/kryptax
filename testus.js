/* Tests of the U.S.A. module v1 (fictitious data only). Run: node testus.js */
const fs = require('fs'), U = require('./us-engine.js');
let ok = 0, ko = 0;
const eq = (a, b, n) => { const s = JSON.stringify(a) === JSON.stringify(b); s ? ok++ : ko++; console.log((s ? 'OK    ' : 'ÉCHEC ') + n + (s ? '' : ' → ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b))); };
const r2s = v => Math.round(v * 100) / 100;
const D = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const run = csv => U.compute(U.fromCSVText(csv).txs);

// holding period: day after acquisition, disposal day included; > 1 year = long (IRS FAQ Q6)
eq(U.isLong(D('2024-01-10'), D('2025-01-10')), false, 'exactly 1 year = short term');
eq(U.isLong(D('2024-01-10'), D('2025-01-11')), true, '1 year + 1 day = long term');
eq(U.isLong(D('2024-02-29'), D('2025-03-02')), true, 'leap day acquisition, sold 03/02 next year = long');

const r = run(fs.readFileSync(__dirname + '/testdata/us/us_fictif.csv'));
const by = l => r.rows.filter(x => x.line === l);
// FIFO + fees: lot 1 cost 30 050 for 1 BTC; sale 0.5 BTC net 34 975
eq([by(4)[0].cost, by(4)[0].proceeds, by(4)[0].gain, by(4)[0].term], [15025, 34975, 19950, 'short'], 'FIFO first lot, buy fee in cost, sell fee off proceeds, short');
eq([by(5)[0].cost, by(5)[0].gain, by(5)[0].term], [15025, 19950, 'long'], 'second half of first lot, long term');
// crypto → crypto: disposal at USD value, new lot at fair market value
eq([by(7)[0].proceeds, by(7)[0].cost, by(7)[0].gain], [11988, 10005, 1983], 'convert ETH→SOL is a disposal (fee off proceeds; ETH basis incl. fee)');
eq([by(8)[0].cost, by(8)[0].gain], [6000, 1000], 'SOL lot basis = FMV of the exchange (12000 × 40/80)');
// missing cost: never a silent $0
eq([by(9)[0].cost, by(9)[0].gain, /to verify/.test(by(9)[0].status)], [null, null, true], 'sale without purchase → to verify, no $0');
eq(r.totals.toVerify, 1, 'one line to verify');
eq(r.totals.sales, 5, '5 sales');
eq([r.totals.short.gain, r.totals.long.gain, r.totals.gain], [22933, 19950, 42883], 'totals short / long / total');
eq([r.totals.income.count, r.totals.income.usd], [1, 250], 'reward kept as lot, income flagged');

// a sale spanning two lots is split into short and long parts
const s = run('Date,Type,Asset,Quantity,Total (USD),Fee (USD)\n2023-01-01,Buy,ETH,1,1000,0\n2024-06-01,Buy,ETH,1,3000,0\n2024-12-01,Sell,ETH,2,8000,0\n');
eq(s.rows.map(x => [x.cost, x.proceeds, x.term]), [[1000, 4000, 'long'], [3000, 4000, 'short']], 'split across lots');
// unknown purchase price
const u = run('Date,Type,Asset,Quantity,Total (USD)\n2024-01-01,Buy,ADA,100,\n2024-02-01,Sell,ADA,100,50\n');
eq([u.rows[0].cost, /purchase price unknown/.test(u.rows[0].status)], [null, true], 'unknown purchase price → to verify');
// sale partly above holdings
const p = run('Date,Type,Asset,Quantity,Total (USD)\n2024-01-01,Buy,XRP,10,10\n2024-02-01,Sell,XRP,15,30\n');
eq(p.rows.map(x => [x.qty, x.cost, x.proceeds]), [[10, 10, 20], [5, null, 10]], 'missing 5 units → separate line to verify');
// missing columns
eq(U.fromCSVText('Foo,Bar\n1,2\n').missingCols, ['date', 'type', 'asset', 'qty'], 'missing columns reported');
// CSV export
const csv = U.toCSV(r, { cat: 'none' }).split('\n');
const hd = csv.indexOf('(a) Description of property,(b) Date acquired,(c) Date sold or disposed of,(d) Proceeds (sales price),(e) Cost or other basis,(f) Code(s),(g) Amount of adjustment,(h) Gain or (loss),Note'); eq([hd > 0, csv[0].startsWith('Kryptax - U.S. summary (estimate) - Draft to verify'), csv[hd - 2], csv[hd - 1].startsWith('FORM 8949 PART I')], [true, true, ',,,,,,,,', true], 'CSV: title, blank line, section, header = Form 8949 columns (a)-(h)');
eq(csv[hd + 1], '0.5 BTC,01/10/2024,01/10/2025,34975.00,15025.00,,,19950.00,', 'CSV first line');
eq([csv.includes('Form 8949 situation,No Form 1099-DA received,,,,,,,'), csv.includes('TOTAL PART I -> Schedule D line 3,,,53963.00,31030.00,,,22933.00,'), csv.includes('FORM 8949 PART II - LONG-TERM (HELD MORE THAN 1 YEAR) - BOX L,,,,,,,,'), csv.includes('TOTAL PART II -> Schedule D line 10,,,34975.00,15025.00,,,19950.00,'), new Set(csv.filter(Boolean).map(l => l.replace(/"[^"]*"/g, 'x').split(',').length)).size], [true, true, true, true, 1], 'no 1099-DA: Part I box I (line 3), Part II box L (line 10), same column count on every row');
eq(/DOGE.*to verify: no purchase/.test(csv.slice(csv.findIndex(l => l.startsWith('TO VERIFY ('))).join('\n')), true, 'lines to verify grouped apart, not in the Part totals');
{ const g = U.form8949(r, 'basis'), h = U.form8949(r, 'nobasis'), n = U.form8949(r, '');
  eq([g.parts.map(P => P.box + P.scheduleD), h.parts.map(P => P.box + P.scheduleD)], [['GSchedule D line 1b', 'JSchedule D line 8b'], ['HSchedule D line 2', 'KSchedule D line 9']], 'boxes G/J and H/K with Schedule D lines');
  eq([n.parts[0].box, n.parts[0].boxText, /to verify/.test(n.parts[1].scheduleD), /not chosen - to verify/.test(U.toCSV(r))], [null, 'G, H or I - to verify', true, true], 'situation not chosen: to verify');
  eq(/,[A-F]\b/.test(U.toCSV(r, { cat: 'none' })), false, 'never box A-F for digital assets'); }

// Excel (SheetJS shipped with the app): header found below a title, 2nd sheet, Date cells and MM/DD/YYYY text
const X = require('./xlsx.mini.min.js');
const xp = U.fromWorkbook(X, Buffer.from(fs.readFileSync(__dirname + '/testdata/us/us_fictif.xlsx.b64', 'utf8'), 'base64'));
eq([xp.missingCols.length, xp.txs.length, xp.txs.map(t => t.type).join()], [0, 4, 'BUY,SELL,BUY,CONVERT'], 'xlsx read (header row 3, sheet 2)');
eq(xp.txs.map(t => U.mdy(t.date)), ['01/10/2024', '01/11/2025', '06/01/2025', '07/01/2025'], 'xlsx dates kept as written in every time zone');
const xr = U.compute(xp.txs);
eq([xr.rows[0].cost, xr.rows[0].proceeds, xr.rows[0].term, xr.rows[1].gain], [15025, 34975, 'long', 1983], 'xlsx → same results as CSV');
// PDF (best effort): text lines as pdf.js / pdftotext give them; unknown lines ignored, EUR line refused
const { execFileSync } = require('child_process');
const pdfLines = f => execFileSync('pdftotext', ['-layout', __dirname + '/testdata/us/' + f, '-'], { encoding: 'utf8' }).split('\n');
const pp = U.fromPdfLines(pdfLines('us_fictif.pdf.txt'));
eq([pp.matched, pp.txs.map(t => t.type + ' ' + t.asset).join()], [4, 'BUY BTC,SELL BTC,CONVERT BTC,INCOME ETH'], 'pdf lines recognised (EUR line ignored)');
const pr = U.compute(pp.txs);
eq(pr.rows.map(r => [r.proceeds, r.cost, r.term]), [[34975, 15025, 'long'], [14990, 7512.5, "long"]], "pdf → FIFO results");
eq(pr.totals.income.usd, 250, 'pdf staking line kept');
eq(U.fromPdfLines(pdfLines('us_inconnu_fictif.pdf.txt')).txs.length, 0, 'unrecognised pdf → nothing computed');
eq(U.fromPdfLines(['21 juil. 2026 Vente BBB 5 80,00€']).txs.length, 0, 'euro statement line not read as USD');

// several wallets (Rev. Proc. 2024-28: per wallet/account); own transfers keep date and cost (FAQ Q38)
const w = run(fs.readFileSync(__dirname + '/testdata/us/us_wallets_fictif.csv'));
const wl = l => w.rows.filter(x => x.line === l);
eq(wl(6).map(x => [x.wallet, x.cost, x.acquired === D('2024-01-05'), x.term, x.gain]), [['Hardware wallet', 9980, true, 'long', 20020]], 'transferred lot keeps date and cost (0.499 of 20000)');
eq(wl(7).map(x => [x.wallet, x.cost, x.gain, x.term]), [['Exchange B', 20000, 10000, 'long']], 'FIFO inside Exchange B only (not the cheaper Exchange A lot)');
eq(w.totals.transfers, { paired: 1, toVerify: 2 }, '1 paired transfer, 2 unpaired to verify');
eq(w.notes.filter(n => /Network fee/.test(n.msg)).length, 1, 'network fee (0.001 BTC) flagged to verify');
eq(w.notes.filter(n => /no matching (send|receive)/.test(n.msg)).length, 2, 'unpaired send and receive listed, never silent');
eq(wl(10).map(x => [x.cost, /to verify/.test(x.status)]), [[null, true]], 'sale of units received without a send → missing basis');
eq(w.totals.wallets, ['Exchange A', 'Exchange B', 'Hardware wallet'], 'wallets listed');
eq(U.toCSV(w).split('\n').some(l => l.endsWith(',Note,Wallet')), true, 'CSV has a Wallet column');
// no wallet column → one wallet, unchanged
eq(U.toCSV(r).split('\n').some(l => l.includes('Wallet')), false, 'no Wallet column when the file has none');
const nw = run('Date,Type,Asset,Quantity,Total (USD)\n2024-01-01,Buy,BTC,1,100\n2024-02-01,Buy,BTC,1,300\n2024-03-01,Sell,BTC,1,500\n');
eq(nw.rows.map(x => [x.wallet, x.cost]), [['', 100]], 'without wallets: single FIFO as before');
// pairing limits: too late or too different → not paired
const lim = run('Date,Type,Asset,Quantity,Total (USD),Wallet\n2024-01-01,Buy,ETH,1,100,A\n2024-02-01,Send,ETH,1,,A\n2024-02-05,Receive,ETH,1,,B\n');
eq(lim.totals.transfers, { paired: 0, toVerify: 2 }, 'receive 4 days later is not paired');
const one = run('Date,Type,Asset,Quantity,Total (USD),Wallet,To wallet\n2024-01-01,Buy,ETH,1,100,A,\n2024-02-01,Transfer,ETH,1,,A,B\n2025-03-01,Sell,ETH,1,400,B,\n');
eq(one.rows.map(x => [x.wallet, x.cost, x.term]), [['B', 100, 'long']], 'one-line transfer with To wallet');

// lot methods (Treas. Reg. 1.1012-1(j)(3); Notice 2026-20)
const lt = U.fromCSVText(fs.readFileSync(__dirname + '/testdata/us/us_lots_fictif.csv')).txs;
const fifo = U.compute(lt), hifo = U.compute(lt, { method: 'HIFO' });
eq([fifo.totals.gain, hifo.totals.gain], [2000, 1500], 'FIFO and HIFO give different gains');
eq(hifo.rows.filter(x => x.line === 5).map(x => x.cost), [3000], 'HIFO takes the highest unit cost first');
eq(fifo.totals.method + hifo.totals.method, 'FIFOHIFO', 'method reported');
eq(fifo.sales[0].lots.map(l => [l.line, l.qty, l.unit]), [[2, 1, 1000], [3, 1, 3000], [4, 1, 2000]], 'available lots listed for a sale');
const man = U.compute(lt, { method: 'MANUAL', picks: { 5: { lot: 4, qty: 1 } } });
eq(man.rows.filter(x => x.line === 5).map(x => [x.cost, x.status]), [[2000, 'ok']], 'manual choice: chosen lot used');
eq(man.rows.filter(x => x.line === 6).map(x => x.cost), [1000, 1500], 'other sale stays FIFO');
const sh = U.compute(lt, { method: 'MANUAL', picks: { 5: { lot: 4, qty: 1 }, 6: { lot: 4, qty: 1 } } });
eq(sh.rows.filter(x => x.line === 6 && /to verify/.test(x.status)).length > 0 && sh.notes.some(n => /chosen lot/.test(n.msg)), true, 'not enough units in the chosen lot → to verify');
eq(U.compute(lt, { picks: { 5: { lot: 4, qty: 1 } } }).totals.gain, 2000, 'picks ignored unless manual');

// income (Rev. Rul. 2023-14; FAQ Q24-Q25): USD value when received, lot at the same cost
const ic = run(fs.readFileSync(__dirname + '/testdata/us/us_income_fictif.csv'));
eq(ic.income.map(x => x.type), ['Staking', 'Airdrop', 'Interest', 'Reward', 'Income'], 'income types recognised');
eq([ic.totals.income.usd, ic.totals.income.unknown], [495, 1], 'income total excludes the missing value (no silent $0)');
eq(ic.income[3].usd === null && /to verify/.test(ic.income[3].status), true, 'missing value → to verify');
eq(ic.rows.map(x => [x.cost, x.gain]), [[300, 100]], 'income lot cost = USD value when received');
const icsv = U.incomeCSV(ic).split('\n');
eq([icsv[0].startsWith('Date received,Asset,Quantity,Value USD'), icsv[1], icsv[4].split(',')[3]], [true, '01/15/2025,ETH,0.1,300.00,Staking,ok', ''], 'separate income CSV');
eq(U.incomeType('Learning reward') + U.incomeType('Earn interest'), 'RewardInterest', 'income type labels');

// PDF summary (us-export.js, jsPDF already shipped; export.js untouched)
{ const X = require('./us-export.js'), { jsPDF } = require('./jspdf.umd.min.js'), at = require('./jspdf.plugin.autotable.min.js'); if (at.applyPlugin) at.applyPlugin(jsPDF);
  const cp = require('child_process'), pdfText = (res, o) => cp.execSync('pdftotext -layout - -', { input: Buffer.from(X.makePdf(jsPDF, res, o).output('arraybuffer')) }).toString();
  const now = new Date(Date.UTC(2026, 9, 31, 21, 0));
  const sd = X.summaryData(w, { now });
  eq([sd.head.includes('Wallet'), sd.rows.filter(x => x.tv).length, sd.info[0], /Lot method: FIFO/.test(sd.info[1])], [true, 1, 'Generated: 2026-10-31 21:00 UTC', true], 'summary data (wallets, to verify, date, method)');
  const t1 = pdfText(w, { now }), p1 = t1.split('\f').filter(p => p.trim());
  eq([/Kryptax . U\.S\. summary \(estimate\)/.test(t1), /Total gain or loss: \$30,020\.00/.test(t1), /TO VERIFY/.test(t1), /never A-F/.test(t1), /Hardware wallet/.test(t1)], [true, true, true, true, true], 'PDF text: title, totals, to verify, box note, wallet');
  eq(p1.every(p => p.includes(X.FOOT)), true, 'footer on every page');
  { const t8 = pdfText(r, { now, cat: 'none' });
    eq([/Part I - Short-term \(held 1 year or less\) - Box I/.test(t8), /Totals \(Schedule D line 3\)\s+\$53,963\.00\s+\$31,030\.00\s+\$22,933\.00/.test(t8), /Part II - Long-term \(held more than 1 year\) - Box L/.test(t8), /Totals \(Schedule D line 10\)/.test(t8), /Not on Form 8949 - not in the totals/.test(t8), /No Form 1099-DA received/.test(t8)], [true, true, true, true, true, true], 'PDF: Parts I/II, boxes, Schedule D totals, lines to verify apart');
    eq(/G, H or I - to verify/.test(pdfText(r, { now })), true, 'PDF: situation not chosen, to verify'); }
  eq(/Income \(staking \/ airdrops \/ interest\): \$495\.00/.test(pdfText(ic, { now })), true, 'PDF shows income total');
  eq(/Lot method: HIFO/.test(pdfText(U.compute(lt, { method: 'HIFO' }), { now })), true, 'PDF shows the lot method');
  // 2000 fictitious sales: clean pagination
  let big = 'Date,Type,Asset,Quantity,Total (USD),Wallet\n2024-01-02,Buy,BTC,2000,2000000,Exchange A\n';
  for (let i = 0; i < 2000; i++) big += '2025-0' + (1 + i % 9) + '-1' + (i % 9) + ',Sell,BTC,1,' + (900 + i % 300) + ',Exchange A\n';
  const B = run(big), tb = pdfText(B, { now }), pb = tb.split('\f').filter(p => p.trim()), lines = tb.split('\n').filter(l => / BTC /.test(l) && /\$/.test(l));
  eq([B.rows.length, pb.length > 20, pb.every(p => p.includes(X.FOOT) && /Page \d+ \/ \d+/.test(p)), lines.length], [2000, true, true, 2000], '2000 lines paginated, footer and page number on each page');
  fs.writeFileSync('/tmp/kryptax-us-big.pdf', Buffer.from(X.makePdf(jsPDF, B, { now }).output('arraybuffer')));
  fs.writeFileSync('/tmp/kryptax-us-wallets.pdf', Buffer.from(X.makePdf(jsPDF, w, { now }).output('arraybuffer')));
}
// English only, no French legal words in the module texts
const src = fs.readFileSync(__dirname + '/us-engine.js', 'utf8') + fs.readFileSync(__dirname + '/us-export.js', 'utf8');
eq(/\b(2086|2042|3AN|3BN|CGI|impots|BOI|L136)\b|prélèvements|France/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), false, 'no French legal text in the U.S.A. module');
{ const h = fs.readFileSync(__dirname + '/index.html', 'utf8'), us = (h.match(/<section id="usmode"[\s\S]*?<div id="usresult"/) || [''])[0];
  eq(/<section id="usimp" class="usimp"><div class="sechead"><h2>1\. Import<\/h2>/.test(us) && /<label class="btn"><span class="lbl-l">/.test(us) && /id="usfile"[^>]*hidden/.test(us) && /class="fhelp"/.test(us), true, 'US import box: same structure as the France box');
  eq(/Date, Type, Asset, Quantity, Total or Price, Fee/.test(us) && /<details class="usdet"><summary>Details<\/summary>/.test(us) && /stays in this browser/.test(us), true, 'US import box: short texts + Details');
  eq(/\b(2086|2042|3AN|CGI|BOI)\b|[àéèùç]/i.test(us), false, 'US import box: English only'); }
{ const T = [{ line: 2, date: Date.UTC(2024, 0, 2), type: 'BUY', asset: 'BTC', qty: 2, usd: 20000, fee: 0, wallet: '' }, { line: 3, date: Date.UTC(2024, 5, 2), type: 'SELL', asset: 'BTC', qty: 0.5, usd: 6000, fee: 0, wallet: '' }, { line: 4, date: Date.UTC(2025, 5, 2), type: 'SELL', asset: 'BTC', qty: 0.5, usd: 8000, fee: 0, wallet: '' }, { line: 5, date: Date.UTC(2025, 6, 2), type: 'INCOME', rawType: 'Staking', asset: 'BTC', qty: 0.01, usd: 300, fee: 0, wallet: '' }];
  const r = U.compute(T), a = U.forYear(r, 2024), b = U.forYear(r, 2025);
  eq(JSON.stringify(U.years(r)), '[2024,2025]', 'tax years listed');
  eq(a.totals.sales + '|' + a.totals.short.gain + '|' + a.totals.income.count, '1|1000|0', 'year 2024: 1 short-term sale, gain $1,000');
  eq(b.totals.sales + '|' + b.totals.long.gain + '|' + b.totals.income.usd, '1|3000|300', 'year 2025: 1 long-term sale, gain $3,000, income $300');
  eq(a.totals.gain + b.totals.gain, r.totals.gain, 'years add up to all years');
  eq(U.forYear(r, 2023).totals.sales, 0, 'year without sale: 0'); eq(U.forYear(r, 0), r, 'all years = unchanged'); }
eq(/\['header \.sub', 'Form 8949 & Schedule D for U\.S\. crypto taxes'\]/.test(fs.readFileSync(__dirname + '/app.js', 'utf8')), true, 'U.S.A. title: Form 8949 & Schedule D');
{ const h = fs.readFileSync(__dirname + '/index.html', 'utf8'), us = (h.match(/<section id="usmode"[\s\S]*?<\/section><\/section>|<section id="usmode"[\s\S]*?<div id="usresult"/) || [''])[0];
  eq(/U\.S\.A\. mode/.test(us) || /Estimate only — not tax advice/.test(us), false, 'no "U.S.A. mode" title, no duplicate warning');
  eq(/<span class="headbtns"><button type="button" id="ushelpbtn" class="small ghost"[^>]*>Instructions<\/button><button type="button" id="usreset" class="small ghost"[^>]*>↺ Reset<\/button>/.test(us) && /id="ushelppanel" class="help" hidden/.test(us), true, 'Instructions + Reset buttons like France');
  eq(/Schedule D/.test(us) && /FIFO/.test(us) && /to verify/.test(us), true, 'US instructions: steps + to verify'); }
{ // v1.8 time zones (fictitious)
  const W = (y, m, d, h, mi) => Date.UTC(y, m - 1, d, h, mi || 0);
  eq(U.shiftTz(W(2025, 1, 1, 3, 30), 'UTC', 'America/Los_Angeles'), W(2024, 12, 31, 19, 30), 'UTC 01/01/2025 03:30 = Pacific 12/31/2024 19:30');
  eq(U.shiftTz(W(2024, 12, 31, 22, 0), 'America/New_York', 'UTC'), W(2025, 1, 1, 3, 0), 'Eastern 12/31 22:00 = UTC 01/01 03:00');
  eq(U.shiftTz(W(2025, 7, 1, 12, 0), 'UTC', 'America/New_York'), W(2025, 7, 1, 8, 0), 'summer (DST): UTC-4');
  eq(U.shiftTz(W(2025, 1, 15, 12, 0), 'UTC', 'America/New_York'), W(2025, 1, 15, 7, 0), 'winter: UTC-5');
  eq(U.shiftTz(W(2025, 3, 9, 7, 30), 'UTC', 'America/New_York'), W(2025, 3, 9, 3, 30), 'DST start day 03/09/2025: 07:30 UTC = 03:30 EDT');
  eq(U.shiftTz(W(2025, 11, 2, 12, 0), 'Pacific/Honolulu', 'Pacific/Honolulu'), W(2025, 11, 2, 12, 0), 'same zone: unchanged');
  const T = [{ line: 2, date: W(2024, 1, 2, 12), type: 'BUY', asset: 'BTC', qty: 1, usd: 10000, fee: 0, wallet: '' }, { line: 3, date: W(2025, 1, 1, 3, 30), type: 'SELL', asset: 'BTC', qty: 0.5, usd: 8000, fee: 0, wallet: '' }];
  const a = U.compute(T, { fileTz: 'UTC', taxTz: 'UTC' }), b = U.compute(T, { fileTz: 'UTC', taxTz: 'America/Los_Angeles' });
  eq(JSON.stringify(U.years(a)) + JSON.stringify(U.years(b)), '[2025][2024]', 'sale near midnight: tax year 2025 in UTC, 2024 in Pacific');
  eq(b.totals.tz.file + '|' + b.totals.tz.tax, 'UTC|America/Los_Angeles', 'time zones kept in the result');
  eq(/\nTime zones,File: UTC,Tax dates: America\/Los_Angeles/.test(U.toCSV(b)), true, 'CSV shows the time zones');
  eq(/Times in file/.test(U.toCSV(U.compute(T))), false, 'CSV without time zone option: no time zone line');
  const H = [{ line: 2, date: W(2024, 6, 17, 20), type: 'BUY', asset: 'ETH', qty: 1, usd: 1000, fee: 0, wallet: '' }, { line: 3, date: W(2025, 6, 18, 2), type: 'SELL', asset: 'ETH', qty: 1, usd: 2000, fee: 0, wallet: '' }];
  eq(U.compute(H, { fileTz: 'UTC', taxTz: 'UTC' }).rows[0].term + '|' + U.compute(H, { fileTz: 'UTC', taxTz: 'America/New_York' }).rows[0].term, 'long|short', 'holding period by calendar day in the tax zone (Pub. 544 example dates)'); }
{ // v1.9: cost and date entered by the user for missing units
  const X = 'Date,Type,Asset,Quantity,Total (USD)\n2024-01-01,Buy,XRP,10,10\n2024-02-01,Sell,XRP,15,30\n', tx = () => U.fromCSVText(X).txs;
  const a = U.compute(tx()), m = a.rows.find(x => !x.acquired);
  eq([m.status.startsWith('to verify: no purchase found'), a.totals.short.gain], [true, 10], 'without input: missing units excluded and flagged (unchanged)');
  const b = U.compute(tx(), { manualCost: { 3: { cost: 4, date: D('2022-05-01') } } }), n = b.rows.find(x => x.user);
  eq([n.status, n.cost, n.gain, n.term, n.acquired === D('2022-05-01'), b.totals.short.gain, b.totals.long.gain], ['ok', 4, 6, 'long', true, 10, 6], 'entered cost and date: included, long term');
  const c = U.compute(tx(), { manualCost: { 3: { cost: 4, date: D('2024-01-15') } } });
  eq(c.rows.find(x => x.user).term + '|' + c.totals.short.gain, 'short|16', 'entered date less than 1 year: short term');
  eq(U.compute(tx(), { manualCost: { 3: { cost: 4, date: D('2025-01-01') } } }).rows.some(x => x.user), false, 'date after the sale: ignored, still flagged');
  eq(U.compute(tx(), { manualCost: { 3: { cost: NaN, date: D('2022-05-01') } } }).rows.some(x => x.user), false, 'no cost: ignored, still flagged');
  eq(/entered by you/.test(U.toCSV(b)), true, 'CSV marks entered data');
  eq(/entered by you/.test(U.toCSV(a)), false, 'CSV without input: no mark'); }
{ // v2.0: Kraken trades export (structure from support.kraken.com, fictitious values)
  const k = U.fromCSVText(fs.readFileSync(__dirname + '/testdata/us/kraken_trades_fictif.csv', 'utf8'));
  eq([k.platform, k.fileTz, k.missingCols.length], ['Kraken trades export', 'UTC', 0], 'Kraken: format recognised, times in UTC');
  eq(k.txs.map(t => t.type + ' ' + t.asset + ' ' + t.qty + ' ' + t.usd + ' ' + t.fee).join('|'), 'BUY BTC 0.01 600 1.56|BUY ETH 0.1 300 0.78|BUY SOL 5 750 1.95|SELL SOL 2 400 1.04|SELL BTC 0.005 400 1.04', 'Kraken: pairs XXBTZUSD/XETHZUSD/SOLUSD, cost and fee in USD');
  eq(k.skipped.map(x => x.line + ':' + x.why).join('|'), '5:pair not quoted in USD (XETHXXBT)|6:margin trade (not handled)', 'Kraken: non-USD pair and margin trade skipped and listed');
  const kr = U.compute(k.txs, { fileTz: 'UTC', taxTz: 'UTC' }), btc = kr.rows.find(r => r.asset === 'BTC');
  eq([btc.proceeds, btc.cost, btc.gain, btc.term], [398.96, 300.78, 98.18, 'long'], 'Kraken: BTC sale, basis includes buy fee, proceeds net of fee');
  const sol = U.compute(k.txs, { fileTz: 'UTC', taxTz: 'America/Los_Angeles' }).rows.find(r => r.asset === 'SOL');
  eq(new Date(sol.sold).getUTCFullYear(), 2024, 'Kraken: UTC time 01/01/2025 02:00 is still 2024 in Pacific time');
  eq(U.fromCSVText('Date,Type,Asset,Quantity,Total (USD)\n2024-01-01,Buy,BTC,1,100\n').platform, undefined, 'Generic file: no platform claimed'); }
// v2.1 Form 1099-DA comparison
{
  const T = { short: { proceeds: 100, cost: 60 }, long: { proceeds: 50.5, cost: null } };
  const o = U.daCompare(T, 150.5, 60);
  eq([o.dProceeds, o.dCost, o.flag], [0, 0, false], '1099-DA totals match');
  const o2 = U.daCompare(T, 140, undefined);
  eq([o2.dProceeds, o2.dCost, o2.flag], [10.5, undefined, true], '1099-DA gap flagged to verify');
}
// v2.3 1099-DA comparison in the CSV and PDF, only when entered
{ const c0 = U.toCSV(r, { cat: 'none' }), c1 = U.toCSV(r, { cat: 'none', da: { p: 88900, b: undefined } }).split('\n');
  eq(/1099-DA/.test(c0.replace(/No Form 1099-DA received/, '')), false, 'CSV: no 1099-DA section when nothing entered');
  eq([c1.includes('FORM 1099-DA COMPARISON (totals you entered) - to verify,,,,,,,,'), c1.includes('Proceeds (box 1f),,,88900.00,88938.00,,,38.00,to verify'), c1.some(l => /Cost basis \(box 1g\)/.test(l))], [true, true, false], 'CSV: 1099-DA proceeds gap flagged to verify, basis line only if entered');
  eq(U.toCSV(r, { da: { p: 88938, b: 46055 } }).includes('Cost basis (box 1g),,,46055.00,46055.00,,,0.00,matches'), true, 'CSV: matching basis');
  const X = require('./us-export.js'), d0 = X.summaryData(r, {}), d1 = X.summaryData(r, { da: { p: 88900 } });
  eq([d0.info.some(l => /Form 1099-DA Proceeds/.test(l)), d1.info.some(l => l === 'Form 1099-DA Proceeds (box 1f): $88,900.00 vs Kryptax $88,938.00 - difference $38.00 (TO VERIFY)')], [false, true], 'PDF: 1099-DA line only when entered'); }
// v2.4 capital loss carryover entry (Schedule D lines 6 and 14), only when entered
{ eq(U.carryLines(r, {}), null, 'carryover: nothing entered, nothing shown');
  const K = U.carryLines(r, { s: 1000, l: -500 });
  eq([K.s, K.l, K.net7, K.net15], [1000, 500, 21933, 19450], 'carryover subtracted from the Part totals (sign typed either way)');
  const c = U.toCSV(r, { carry: { s: 1000 } }).split('\n');
  eq([c.includes('Schedule D line 6 - short-term carryover,,,,,,,-1000.00,'), c.includes('Schedule D line 14 - long-term carryover,,,,,,,0.00,'), /CAPITAL LOSS CARRYOVER/.test(U.toCSV(r))], [true, true, false], 'CSV: carryover section only when entered');
  const X = require('./us-export.js');
  eq([X.summaryData(r, { carry: { l: 500 } }).info.some(l => /long-term -\$500\.00 \(line 14\)/.test(l)), X.summaryData(r, {}).info.some(l => /carryover/.test(l))], [true, false], 'PDF: carryover line only when entered'); }
// v2.5 Schedule D draft
{ const by = (S, l) => S.lines.find(x => x.line === l), F = U.form8949(r, 'none');
  const S = U.scheduleD(r, 'none', {});
  eq([by(S, '3').d, by(S, '3').e, by(S, '3').h, by(S, '10').h], [F.parts[0].totals.d, F.parts[0].totals.e, F.parts[0].totals.h, F.parts[1].totals.h], 'no 1099-DA: line 3 = Part I box I totals, line 10 = Part II box L');
  eq([by(S, '3').h, r2s(by(S, '3').d - by(S, '3').e), by(S, '1b').h, by(S, '2').h], [22933, 22933, null, null], 'line 3 (h) = (d) - (e); lines 1b and 2 empty');
  eq([by(S, '7').h, by(S, '15').h, by(S, '16').h, by(S, '17').answer], [22933, 19950, 42883, 'Yes'], 'lines 7, 15, 16 = sums; line 17 Yes');
  eq(['1a', '4, 5, 11-13', '8a', '18', '19', '20', '21', '22'].every(l => by(S, l).nc), true, 'undocumented or tax lines not computed');
  eq([S.lines.filter(l => /Other gains/.test(l.desc)).length, ['4', '5', '11', '12', '13'].some(n => S.lines.some(l => l.line === n)), /leave blank if you only have crypto/.test(by(S, '4, 5, 11-13').note), /^Line 4\, 5\, 11-13,Other gains/m.test(U.toCSV(r)) || /^"?Line 4, 5, 11-13/m.test(U.toCSV(r))], [1, false, true, true], 'Schedule D lines 4, 5, 11, 12, 13 grouped in one "Other gains" line, not computed');
  const G = U.scheduleD(r, 'basis', {}), H = U.scheduleD(r, 'nobasis', {});
  eq([by(G, '1b').h, by(G, '8b').h, by(H, '2').h, by(H, '9').h], [22933, 19950, 22933, 19950], 'boxes G/J -> 1b/8b, H/K -> 2/9');
  const N = U.scheduleD(r, '', {}); eq([by(N, '1b / 2 / 3').h, /to verify/.test(by(N, '1b / 2 / 3').note)], [22933, true], 'box not chosen: totals shown, to verify');
  const C = U.scheduleD(r, 'none', { s: 30000, l: 1000 });
  eq([by(C, '6').h, by(C, '7').h, by(C, '14').h, by(C, '15').h, by(C, '16').h, by(C, '17').answer], [-30000, -7067, -1000, 18950, 11883, 'Yes'], 'carryover: lines 6/14 negative, 7/15/16 netted');
  const C2 = U.scheduleD(r, 'none', { s: 30000, l: 30000 });
  eq([by(C2, '16').h, by(C2, '17').answer, by(C2, '21').nc], [-17117, null, true], 'line 16 loss: 17 skipped, 21 not computed');
  const c = U.toCSV(r, { cat: 'none' }).split('\n');
  eq([c.includes('SCHEDULE D (FORM 1040) - DRAFT - Draft to verify - not tax advice,,,,,,,,'), c.includes('Line 3,Form 8949 totals with box C/I,,53963.00,31030.00,,,22933.00,'), c.some(l => /^Line 21,.*skipped \(line 16 is not a loss\)/.test(l))], [true, true, true], 'CSV: Schedule D section');
  const X = require('./us-export.js'), { jsPDF } = require('./jspdf.umd.min.js'), at = require('./jspdf.plugin.autotable.min.js'); if (at.applyPlugin) at.applyPlugin(jsPDF);
  const t = require('child_process').execSync('pdftotext -layout - -', { input: Buffer.from(X.makePdf(jsPDF, r, { cat: 'none' }).output('arraybuffer')) }).toString().split('\f').filter(p => p.trim());
  eq([t.length >= 2, /Schedule D \(Form 1040\) - draft/.test(t[t.length - 1]), /Draft to verify - not tax advice/.test(t[t.length - 1]), /Schedule D \(Form 1040\) - draft/.test(t[0])], [true, true, true, false], 'PDF: Schedule D on a separate last page'); }
// v2.6 .xlsx export with the embedded SheetJS build: widths, $ formats, flat data sheet
{ const XL = require('./xlsx.mini.min.js'), wb = U.toXLSX(XL, r, { cat: 'none' }), S = wb.Sheets.Summary, D = wb.Sheets['Form 8949 data'];
  const A = XL.utils.sheet_to_json(S, { header: 1, defval: '' }), i = A.findIndex(x => x[0] === 'TOTAL PART I -> Schedule D line 3'), c = XL.utils.encode_cell({ r: i, c: 7 });
  eq([wb.SheetNames.join('|'), A[i][7], S[c].t, S[c].z, S['!cols'][0].wch > 30, XL.utils.sheet_to_json(D).length], ['Summary|Form 8949 data', 22933, 'n', '$#,##0.00;-$#,##0.00', true, 5], 'xlsx: summary + data sheets, totals as numbers in $ format');
  const back = XL.read(XL.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
  eq(XL.utils.sheet_to_csv(back.Sheets.Summary).split('\n')[0].startsWith('Kryptax - U.S. summary'), true, 'xlsx: written file reads back'); }
// v2.7 dates with an explicit UTC marker; Total = amount before fee
{ const d = s => U.fromCSVText('Date,Type,Asset,Quantity,Total (USD)\n' + s + ',Buy,BTC,1,100\n');
  const want = Date.UTC(2025, 0, 10, 14, 0, 0);
  eq(['2025-01-10 14:00:00 UTC', '2025-01-10 14:00:00 GMT', '2025-01-10T14:00:00+00:00', '2025-01-10T14:00:00Z', '2025-01-10 14:00:00 +0000'].map(x => { const p = d(x); return p.skipped.length === 0 && p.txs[0].date === want; }), [true, true, true, true, true], 'dates with UTC / GMT / +00:00 / Z suffix read as UTC');
  eq(d('2025-01-10 14:00:00 PST').skipped[0].why, 'unreadable date', 'other zone names still reported as unreadable');
  const f = U.compute(U.fromCSVText('Date,Type,Asset,Quantity,Total (USD),Fee (USD)\n2024-01-01,Buy,BTC,1,1000,10\n2025-06-01,Sell,BTC,1,1500,15\n').txs).rows[0];
  eq([f.cost, f.proceeds, f.gain], [1010, 1485, 475], 'Total = amount before fee: Buy cost = Total + Fee, Sell proceeds = Total - Fee');
  const g = U.compute(U.fromCSVText('Date,Type,Asset,Quantity,Price (USD),Fee (USD)\n2024-01-01,Buy,BTC,2,500,4\n2025-06-01,Sell,BTC,2,800,6\n').txs).rows[0];
  eq([g.cost, g.proceeds], [1004, 1594], 'without Total: Total = Price x Quantity, then the same fee rule'); }
// v2.8 network fees on transfers (fee units = sent quantity minus received quantity); fictitious data
{ const H = 'Date,Type,Asset,Quantity,Total (USD),Fee (USD),Wallet,Received Quantity,To Wallet\n';
  const SC = {
    paired: H + '2024-01-01,Buy,ETH,1,1000,,A\n2025-01-01,Buy,ETH,1,3000,,A\n2025-03-01,Send,ETH,1.5,,6,A\n2025-03-01,Receive,ETH,1.48,,,B\n2025-04-01,Sell,ETH,1,2500,,B\n2025-05-01,Sell,ETH,0.4,1200,,A\n',
    chain: H + '2024-01-01,Buy,BTC,0.5,10000,,A\n2024-06-01,Buy,BTC,0.5,30000,,A\n2025-02-01,Send,BTC,0.8,,40,A\n2025-02-01,Receive,BTC,0.79,,,B\n2025-02-05,Send,BTC,0.79,,,B\n2025-02-05,Receive,BTC,0.78,,,C\n2025-06-01,Sell,BTC,0.7,60000,,C\n2025-06-02,Sell,BTC,0.2,15000,,A\n',
    oneLine: H + '2024-01-01,Buy,SOL,10,1000,,A\n2024-02-01,Buy,SOL,10,2000,,A\n2025-03-01,Transfer,SOL,12,,,A,11.5,B\n2025-04-01,Sell,SOL,11.5,2300,,B\n',
    bigFee: H + '2024-01-01,Buy,ETH,0.01,30,,A\n2024-02-01,Buy,ETH,0.01,40,,A\n2024-03-01,Buy,ETH,1,3000,,A\n2025-03-01,Send,ETH,1.02,,50,A\n2025-03-01,Receive,ETH,1.0,,,B\n2025-04-01,Sell,ETH,1,3500,,B\n',
    wallets: H + '2024-01-01,Buy,ETH,2,4000,,A\n2024-01-02,Buy,ETH,1,2500,,C\n2025-03-01,Send,ETH,1,,,A\n2025-03-01,Receive,ETH,0.99,,,B\n2025-03-10,Send,ETH,1,,,C\n2025-03-11,Receive,ETH,0.985,,,B\n2025-05-01,Sell,ETH,1.9,5700,,B\n2025-05-02,Send,ETH,0.5,,,A\n',
  };
  const ledger = r => { const b = r.totals.basis; return Math.abs(b.in - b.sold - b.remaining - b.removedFees - b.removedUnpaired) < 1e-6; };
  const comp = (csv, method, fees, picks) => U.compute(U.fromCSVText(csv).txs, { method, fees, picks: picks || {} });
  const M = ['FIFO', 'HIFO', 'MANUAL'], F = ['IGNORE', 'DISPOSE', 'CAPITALIZE'];
  const res = [];
  for (const k in SC) for (const m of M) for (const f of F) { const r = comp(SC[k], m, f, m === 'MANUAL' ? { 5: { lot: 2, qty: 1 } } : null);
    res.push(ledger(r) && (f === 'IGNORE' ? r.totals.basis.capitalized === 0 : r.totals.basis.removedFees === 0)); }
  eq(res.every(Boolean), true, 'v2.8 basis conservation (in = sold + remaining + removed) for 5 scenarios x FIFO/HIFO/MANUAL x 3 options; nothing silently removed with DISPOSE/CAPITALIZE');
  const pi = comp(SC.paired, 'FIFO', 'IGNORE'), pd = comp(SC.paired, 'FIFO', 'DISPOSE'), pc = comp(SC.paired, 'FIFO', 'CAPITALIZE');
  eq([r2s(pi.totals.basis.removedFees), pi.totals.fees.removed, /\$60\.00/.test(U.feeLine(pi.totals.fees))], [60, 60, true], 'IGNORE: removed basis of the fee units shown (0.02 ETH from the $3000 lot = $60)');
  const fr = pd.rows.find(x => x.fee);
  eq([fr.desc, r2s(fr.qty), fr.cost, fr.proceeds, fr.gain, fr.term, fr.status], ['0.02 ETH network fee (to verify)', 0.02, 60, 6, -54, 'short', 'ok'], 'DISPOSE paired: one 8949 line, proceeds = Fee USD, basis = FIFO lot of the fee units');
  eq([pc.rows.length, pc.rows[0].cost, pc.rows[0].acquired, r2s(pc.totals.basis.capitalized)], [2, 1040.54, Date.UTC(2024, 0, 1), 60], 'CAPITALIZE: fee basis spread pro rata on received units, original date kept, no 8949 line');
  const hd = comp(SC.paired, 'HIFO', 'DISPOSE').rows.find(x => x.fee);
  eq([hd.cost, hd.term], [20, 'long'], 'DISPOSE HIFO: fee units from the 2024 lot (moved units take the highest cost first), long term');
  const md = comp(SC.paired, 'MANUAL', 'DISPOSE', { 5: { lot: 2, qty: 1 } }).rows.find(x => x.fee);
  eq(md.cost, 60, 'DISPOSE MANUAL: transfer pieces follow FIFO (as in v2.7), fee basis from the actual lot');
  // chain A -> B -> C: two fee events, each from its own lots
  const cd = comp(SC.chain, 'FIFO', 'DISPOSE'), cf = cd.rows.filter(x => x.fee);
  eq(cf.map(x => [r2s(x.qty), x.cost, x.proceeds, x.term]), [[0.01, 600, 40, 'short'], [0.01, 600, null, 'short']], 'chain A->B->C: fee of each hop is its own line, second hop basis from the lots carried');
  const cc = comp(SC.chain, 'FIFO', 'CAPITALIZE');
  eq([r2s(cc.totals.basis.capitalized), ledger(cc), cc.rows.filter(x => x.wallet === 'C').reduce((a, x) => a + x.cost, 0) > comp(SC.chain, 'FIFO', 'IGNORE').rows.filter(x => x.wallet === 'C').reduce((a, x) => a + x.cost, 0)], [1207.59, true, true], 'chain CAPITALIZE: both fees added to the units that end in wallet C (second hop fee basis includes the first capitalized fee)');
  // one-line TRANSFER with Received Quantity, fee over two lots, fee larger than a lot
  const od = comp(SC.oneLine, 'FIFO', 'DISPOSE').rows.filter(x => x.fee), oi = comp(SC.oneLine, 'FIFO', 'IGNORE');
  eq([od.length, od[0].qty, od[0].cost, oi.totals.basis.removedFees, oi.rows.reduce((a, x) => a + x.qty, 0)], [1, 0.5, 100, 100, 11.5], 'one-line TRANSFER: Received Quantity below Quantity = 0.5 SOL fee units (v2.8; destination no longer overstated)');
  const bd = comp(SC.bigFee, 'FIFO', 'DISPOSE').rows.filter(x => x.fee);
  eq(bd.map(x => [r2s(x.qty), x.cost]), [[0.02, 60]], 'fee larger than a lot: FIFO moves the two small lots first, fee from the big lot');
  const bh = comp(H + '2024-01-01,Buy,ETH,0.995,995,,A\n2025-01-01,Buy,ETH,1,2000,,A\n2025-03-01,Send,ETH,1,,9,A\n2025-03-01,Receive,ETH,0.99,,,B\n', 'FIFO', 'DISPOSE').rows.filter(x => x.fee);
  eq(bh.map(x => [r2s(x.qty * 1000), x.cost, x.proceeds, x.term]), [[5, 5, 4.5, 'long'], [5, 10, 4.5, 'short']], 'fee spread over two lots: two 8949 lines, each with its own basis, term and prorated proceeds');
  const wd = comp(SC.wallets, 'FIFO', 'DISPOSE');
  eq([wd.rows.filter(x => x.fee).map(x => [x.wallet, r2s(x.qty * 1000) / 1000, x.cost]), wd.totals.basis.removedUnpaired, ledger(wd)], [[['A', 0.01, 20], ['C', 0.015, 37.5]], 1000, true], 'three wallets: fee per sending wallet; unpaired send counted apart (removedUnpaired)');
  // DISPOSE: price equal / above / below basis, short and long lot
  const one = (buy, fee) => comp(H + buy + ',Buy,ETH,1,1000,,A\n2025-03-01,Send,ETH,1,,' + fee + ',A\n2025-03-01,Receive,ETH,0.99,,,B\n', 'FIFO', 'DISPOSE').rows.find(x => x.fee);
  eq([[10, 15, 5].map(f => one('2025-01-01', f).gain), one('2025-01-01', 10).term, [10, 15, 5].map(f => one('2023-01-01', f).gain), one('2023-01-01', 10).term], [[0, 5, -5], 'short', [0, 5, -5], 'long'], 'DISPOSE: fee value equal / above / below basis, short and long lots');
  const tot = comp(H + '2025-01-01,Buy,ETH,1,1000,,A\n2025-03-01,Send,ETH,1,500,,A\n2025-03-01,Receive,ETH,0.99,,,B\n', 'FIFO', 'DISPOSE').rows.find(x => x.fee);
  eq([tot.proceeds, tot.gain], [5, -5], 'DISPOSE without Fee: USD value from the line Total, pro rata (500 x 0.01)');
  // missing USD value: "to verify", never 0, out of the totals
  const nu = comp(H + '2025-01-01,Buy,ETH,1,1000,,A\n2025-03-01,Send,ETH,1,,,A\n2025-03-01,Receive,ETH,0.99,,,B\n', 'FIFO', 'DISPOSE'), nr = nu.rows[0];
  eq([nr.proceeds, nr.gain, /to verify/.test(nr.status), nu.totals.short.proceeds, nu.totals.short.cost, nu.totals.toVerify, nu.totals.fees.noUsd], [null, null, true, 0, 0, 1, 1], 'missing fee USD: line to verify, proceeds/gain not 0, not in the totals');
  const uo = comp(H + '2025-01-01,Buy,ETH,1,1000,,A\n2025-03-01,Send,ETH,1,,5,A\n2025-03-01,Receive,ETH,1,,,B\n', 'FIFO', 'DISPOSE');
  eq([uo.rows.length, uo.totals.fees.usdOnly, /without a fee quantity: not computed/.test(U.feeLine(uo.totals.fees))], [0, 1, true], 'Fee USD without fee quantity: reported, not computed');
  // changing the option only changes fee-related lines
  const strip = r => r.rows.filter(x => !x.fee).map(x => JSON.stringify(x));
  let same = true;
  for (const k in SC) for (const m of M) { const pk = m === 'MANUAL' ? { 5: { lot: 2, qty: 1 } } : null, a = comp(SC[k], m, 'IGNORE', pk), d = comp(SC[k], m, 'DISPOSE', pk), c = comp(SC[k], m, 'CAPITALIZE', pk);
    same = same && JSON.stringify(strip(a)) === JSON.stringify(strip(d)) && JSON.stringify(a.rows.map(x => [x.line, x.qty, x.proceeds, x.acquired])) === JSON.stringify(c.rows.map(x => [x.line, x.qty, x.proceeds, x.acquired]))
      && Math.abs(c.totals.basis.sold + c.totals.basis.remaining - a.totals.basis.sold - a.totals.basis.remaining - a.totals.basis.removedFees) < 1e-6; }
  eq(same, true, 'option change: DISPOSE adds only fee lines; CAPITALIZE changes only the cost of received units (by the basis IGNORE removes)');
  // IGNORE = results before v2.8 (frozen from v2.7 output) and = default
  const fz = r => r.rows.map(x => [x.desc, x.proceeds, x.cost, x.gain, x.term, x.status]);
  eq([fz(pi), fz(comp(SC.chain, 'FIFO', 'IGNORE'))], [[['1 ETH', 2500, 1000, 1500, 'long', 'ok'], ['0.4 ETH', 1200, 1200, 0, 'short', 'ok']], [['0.5 BTC', 42857.14, 10000, 32857.14, 'long', 'ok'], ['0.2 BTC', 17142.86, 12000, 5142.86, 'short', 'ok'], ['0.2 BTC', 15000, 12000, 3000, 'long', 'ok']]], 'IGNORE: same rows as v2.7');
  let def = true;
  for (const f of fs.readdirSync(__dirname + '/testdata/us').filter(f => /\.csv$/.test(f))) for (const m of M) { const t = U.fromCSVText(fs.readFileSync(__dirname + '/testdata/us/' + f)).txs, a = U.compute(t, { method: m }), b = U.compute(t, { method: m, fees: 'IGNORE' });
    def = def && JSON.stringify([a.rows, a.totals, a.notes]) === JSON.stringify([b.rows, b.totals, b.notes]) && b.rows.every(x => !x.fee); }
  eq(def, true, 'IGNORE is the default, no fee lines, on every test file');
  // random fixed-seed test: 3 wallets, variable fees
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const Wn = ['A', 'B', 'C'], hold = { A: 0, B: 0, C: 0 }; let csv = H, day = Date.UTC(2023, 0, 1);
  const ds = () => new Date(day += 86400000 * (1 + Math.floor(rnd() * 20))).toISOString().slice(0, 10);
  for (let i = 0; i < 60; i++) { const w = Wn[Math.floor(rnd() * 3)], x = rnd();
    if (x < 0.35 || hold[w] < 0.1) { const q = +(0.1 + rnd() * 2).toFixed(4); hold[w] += q; csv += `${ds()},Buy,ETH,${q},${(q * (1000 + rnd() * 3000)).toFixed(2)},,${w}\n`; }
    else if (x < 0.75) { const to = Wn[(Wn.indexOf(w) + 1 + Math.floor(rnd() * 2)) % 3], q = +(hold[w] * (0.2 + rnd() * 0.7)).toFixed(4), rq = +(q * (1 - rnd() * 0.019)).toFixed(6), fee = rnd() < 0.3 ? '' : (rnd() * 20).toFixed(2), d = ds();
      hold[w] -= q; hold[to] += rq;
      csv += rnd() < 0.5 ? `${d},Send,ETH,${q},,${fee},${w}\n${d},Receive,ETH,${rq},,,${to}\n` : `${d},Transfer,ETH,${q},,${fee},${w},${rq},${to}\n`; }
    else { const q = +(hold[w] * (0.1 + rnd() * 0.5)).toFixed(4); hold[w] -= q; csv += `${ds()},Sell,ETH,${q},${(q * (1000 + rnd() * 4000)).toFixed(2)},,${w}\n`; } }
  let rok = true, nfee = 0;
  for (const m of M) for (const f of F) { const r = comp(csv, m, f); rok = rok && ledger(r) && r.totals.toVerify === r.rows.filter(x => x.fee && x.proceeds == null).length; if (f === 'DISPOSE') nfee = r.rows.filter(x => x.fee).length; }
  eq([rok, nfee > 5], [true, true], 'random fixed seed (3 wallets, variable fees): basis conserved for every method x option, missing fee USD only lines to verify');
  // exports show the option
  const X = require('./us-export.js'), sd = X.summaryData(pd, {}).info.join('\n'), cs = U.toCSV(pd);
  eq([/Network fees on transfers: Dispose/.test(sd), /Network fees: 1 transfer/.test(sd), /Network fees on transfers,Dispose/.test(cs), /network fee \(to verify\)/.test(cs)], [true, true, true, true], 'PDF summary and CSV header show the option and the Network fees line'); }
// v2.9 capital loss limit (Schedule D line 21), IRS Topic no. 409: $3,000, $1,500 married filing separately, rest carried over
{ const L = (csv, fs) => U.scheduleD(U.compute(U.fromCSVText(csv).txs), 'none', {}, fs).lines.find(l => l.line === '21');
  const loss = n => 'Date,Type,Asset,Quantity,Total (USD)\n2025-01-01,Buy,BTC,1,' + (10000 + n) + '\n2025-06-01,Sell,BTC,1,10000\n';
  eq([L(loss(5000), 'other').h, L(loss(5000), 'other').rest, L(loss(5000), 'mfs').h, L(loss(5000), 'mfs').rest], [-3000, 2000, -1500, 3500], 'line 21: loss above the limit -> $3,000 / $1,500 (married filing separately), rest to carry over');
  eq([L(loss(1000), 'other').h, L(loss(1000), 'other').rest, L(loss(1000), 'mfs').h, L(loss(3000), 'other').rest], [-1000, 0, -1000, 0], 'line 21: loss below or equal to the limit -> whole loss, nothing carried');
  const nc = L(loss(5000), ''), g = L(loss(-500), 'mfs');
  eq([nc.nc, /filing status - to verify/.test(nc.note), g.nc, /not a loss/.test(g.note)], [true, true, true, true], 'line 21: status not chosen -> to verify, no amount; gain -> skipped');
  eq([/to verify/.test(L(loss(5000), 'other').note), U.scheduleD(U.compute(U.fromCSVText(loss(5000)).txs), 'none', { s: 2000 }, 'other').lines.find(l => l.line === '21').rest], [true, 4000], 'line 21: always to verify; carryover entered is part of the line 16 loss');
  const rr = U.compute(U.fromCSVText(loss(5000)).txs), c = U.toCSV(rr, { fstat: 'mfs' }), X = require('./us-export.js'), sd = X.summaryData(rr, { fstat: 'mfs' }).info.join('\n');
  eq([/Filing status \(line 21\),"?Married filing separately/.test(c), /^Line 21,.*,-1500\.00,/m.test(c), /Capital loss allowed -\$1,500\.00, \$3,500\.00 to carry over/.test(sd), /Filing status/.test(U.toCSV(r))], [true, true, true, false], 'exports: filing status and line 21 in CSV and PDF summary; nothing added for a gain without status'); }
// v2.10 possible wash sales: flag only (loss, then same asset acquired within 30 days before/after), no amount changed
{ const H = 'Date,Type,Asset,Quantity,Total (USD)\n', base = H + '2025-01-01,Buy,ETH,1,3000\n2025-03-01,Sell,ETH,1,2000\n';
  const W = extra => U.compute(U.fromCSVText(base + extra).txs);
  eq([W('2025-03-31,Buy,ETH,1,2100\n').wash.length, W('2025-04-01,Buy,ETH,1,2100\n').wash.length, W('2025-01-30,Buy,ETH,0.5,1000\n').wash.length, W('2025-01-29,Buy,ETH,0.5,1000\n').wash.length], [1, 0, 1, 0], 'wash flag: repurchase 30 days after / before flagged, 31 days not');
  eq([W('').wash.length, W('2025-03-10,Buy,BTC,1,100\n').wash.length, U.compute(U.fromCSVText(H + '2025-01-01,Buy,ETH,1,1000\n2025-03-01,Sell,ETH,1,2000\n2025-03-10,Buy,ETH,1,2100\n').txs).wash.length], [0, 0, 0], 'no flag: no repurchase, other asset, or sale at a gain');
  eq(W('2025-03-10,Convert,SOL,10,2100,,,ETH,1\n'.replace(',,,ETH,1', '')).wash.length, 0, 'acquisition of another asset not flagged');
  const a = W(''), b = W('2025-03-10,Buy,ETH,1,2100\n'), w = b.wash[0];
  eq([JSON.stringify(a.rows) === JSON.stringify(b.rows), a.totals.gain === b.totals.gain, JSON.stringify(a.notes) === JSON.stringify(b.notes), w.line, w.loss, w.buys.map(x => x.line), /to verify/.test(w.msg)], [true, true, true, 3, -1000, [4], true], 'wash flag changes no row, total or note; loss and repurchase line listed, to verify');
  eq([U.forYear(b, 2025).wash.length, U.forYear(b, 2024).wash.length], [1, 0], 'wash flags filtered by tax year of the sale');
  const X = require('./us-export.js'), c = U.toCSV(b);
  eq([/^TO VERIFY \(\d+\)/m.test(c), /Possible wash sale, line 3: ETH sold at a loss \(-\$1,000\.00\)/.test(c), X.summaryData(b, {}).checks.some(l => /Possible wash sale, line 3/.test(l)), /wash/i.test(U.toCSV(a))], [true, true, true, false], 'exports: wash sale in the single TO VERIFY list (CSV/XLSX and PDF), only when flagged'); }
// v2.11 export file names with local date and time
{ const a = U.stampName('kryptax-us-summary', 'pdf', new Date(2026, 10, 1, 9, 5, 7)), b = U.stampName('kryptax-us-summary', 'pdf', new Date(2026, 10, 1, 9, 5, 8));
  const ok = /^kryptax-us-summary_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.pdf$/;
  eq([a, ok.test(a), ok.test(U.stampName('kryptax-us-summary', 'pdf')), /[\\/:*?"<>| ]/.test(a), a !== b, /^kryptax-income_.*\.csv$/.test(U.stampName('kryptax-income', 'csv'))], ['kryptax-us-summary_2026-11-01_09-05-07.pdf', true, true, false, true, true], 'export names: prefix kept, local date + time with seconds, no forbidden characters, different instants -> different names'); }
{ const src = require('fs').readFileSync(__dirname + '/us-engine.js', 'utf8'), n = id => (src.match(new RegExp('<select id="' + id + '"', 'g')) || []).length;
  eq([n('usmethod'), n('uscat'), n('usfees'), n('usfstat'), /function optsHtml\(\)[\s\S]*id="usfstat"[\s\S]*insertBefore\(opts, imp\)/.test(src), /fstat = ''; cat = ''; drawOpts\(\)/.test(src), /if \(cur\) render\(\)/.test(src)],
    [1, 1, 1, 1, true, true, true], 'options block at the top: the 4 selects exist once, placed before the import, Reset restores defaults, change re-computes'); }
// v2.12 guided result and single to-verify list
{ const H = 'Date,Type,Asset,Quantity,Total (USD)\n', C = t => U.forYear(U.compute(U.fromCSVText(H + t).txs), 2025), X = require('./us-export.js');
  const gain = C('2024-01-01,Buy,BTC,1,1000\n2025-03-01,Sell,BTC,0.5,3000\n2025-04-01,Buy,ETH,1,2000\n2025-05-01,Sell,ETH,1,2500\n2025-06-01,Sell,DOGE,10,50\n');
  const loss = C('2025-01-01,Buy,ETH,1,3000\n2025-03-01,Sell,ETH,1,2000\n2025-03-10,Buy,ETH,1,2100\n');
  const g = U.guide(gain, { cat: 'none' }), F = U.form8949(gain, 'none'), SD = U.scheduleD(gain, 'none'), csv = U.toCSV(gain, { cat: 'none' });
  eq([g.chosen, g.parts.map(P => [P.box, P.sdLine, P.d, P.e, P.h]), [g.n7, g.n15, g.n16]], [true, F.parts.map(P => [P.box, P.box === 'I' ? '3' : '10', P.totals.d, P.totals.e, P.totals.h]), [SD.n7, SD.n15, SD.n16]], 'guide: Part totals, box, Schedule D line and lines 7/15/16 = the tables');
  eq([g.parts[0].h + g.parts[1].h === gain.totals.gain, g.parts.every(P => csv.includes(`TOTAL PART ${P.part} -> Schedule D line ${P.sdLine},,,${P.d.toFixed(2)},${P.e.toFixed(2)},,,${P.h.toFixed(2)}`)), g.parts[0].h === 500 && g.parts[1].h === 2500, g.loss, g.l21], [true, true, true, false, null], 'guide = CSV export totals; gain: no line 21');
  const g0 = U.guide(gain, {}); eq([g0.chosen, g0.parts[0].boxText, g0.parts[0].sdLine, U.checks(gain, {}).some(c => /Form 8949 box not chosen/.test(c.msg))], [false, 'G, H or I', '1b, 2 or 3', true], 'box not chosen: said in the guide and in the list');
  const gl = U.guide(loss, { cat: 'none', fstat: 'other' }), gl0 = U.guide(loss, { cat: 'none', fstat: '' });
  eq([gl.loss, gl.l21, gl0.l21, U.checks(loss, { cat: 'none', fstat: '' }).some(c => /filing status not chosen/.test(c.msg)), U.checks(loss, { cat: 'none', fstat: 'other' }).some(c => /filing status/.test(c.msg))], [true, { h: -1000, rest: 0 }, null, true, false], 'loss: line 21 with status, asked when not chosen');
  const ck = U.checks(gain, {}), ck2 = U.checks(loss, { fstat: '' }), msgs = ck.concat(ck2).map(c => c.msg);
  eq([ck.length, new Set(ck.map(c => c.msg)).size === ck.length, ck.every((c, i) => !i || ck[i - 1].rank <= c.rank), ck[0].rank, /DOGE|Line 6/.test(ck[0].msg), ck2.some(c => /wash sale, line 3/.test(c.msg)), msgs.every(m => m.length < 260)], [ck.length, true, true, 1, true, true, true], 'list: no duplicate, sorted by importance, not-in-totals first, wash sale included, short');
  const cs = U.toCSV(loss, { fstat: '' }).split('\n'), i = cs.findIndex(l => l.startsWith('TO VERIFY (')), n = +/\((\d+)\)/.exec(cs[i])[1];
  eq([n, cs.slice(i + 1, i + 1 + n).every(l => l.trim().length > 0), X.summaryData(loss, { fstat: '' }).checks.length], [U.checks(loss, { fstat: '' }).length, true, n], 'title count = number of lines, same list in CSV and PDF');
  const e = U.forYear(U.compute(U.fromCSVText(H).txs), 2025), ge = U.guide(e, {});
  eq([U.checks(e, {}).length, ge.parts.every(P => !P.n), ge.income, /TO VERIFY/.test(U.toCSV(e, {}))], [0, true, null, false], 'no data: empty list, nothing to copy'); }
console.log(`\n${ok} OK, ${ko} KO`); if (ko) process.exitCode = 1;

