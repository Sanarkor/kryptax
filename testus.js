/* Tests of the U.S.A. module v1 (fictitious data only). Run: node testus.js */
const fs = require('fs'), U = require('./us-engine.js');
let ok = 0, ko = 0;
const eq = (a, b, n) => { const s = JSON.stringify(a) === JSON.stringify(b); s ? ok++ : ko++; console.log((s ? 'OK    ' : 'ÉCHEC ') + n + (s ? '' : ' → ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b))); };
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
eq(csv[3], '(a) Description of property,(b) Date acquired,(c) Date sold or disposed of,(d) Proceeds (sales price),(e) Cost or other basis,(f) Code(s),(g) Amount of adjustment,(h) Gain or (loss),Note', 'CSV header = Form 8949 columns (a)-(h)');
eq(csv[4], '0.5 BTC,01/10/2024,01/10/2025,34975.00,15025.00,,,19950.00,', 'CSV first line');
eq([csv[2], csv.includes('Totals (Schedule D line 3),,,53963.00,31030.00,,,22933.00'), csv.includes('Part II - Long-term (held more than 1 year) - Box L'), csv.includes('Totals (Schedule D line 10),,,34975.00,15025.00,,,19950.00')], ['Part I - Short-term (held 1 year or less) - Box I', true, true, true], 'no 1099-DA: Part I box I (Schedule D line 3), Part II box L (line 10)');
eq(/DOGE.*to verify: no purchase/.test(csv.slice(csv.indexOf('Not on Form 8949 - to verify (missing cost or value; not in the totals)')).join('\n')), true, 'lines to verify listed apart, not in the Part totals');
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
eq(U.toCSV(w).split('\n').some(l => l.endsWith(',Wallet,Note')), true, 'CSV has a Wallet column');
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
    eq([/Part I - Short-term \(held 1 year or less\) - Box I/.test(t8), /Totals \(Schedule D line 3\)\s+\$53,963\.00\s+\$31,030\.00\s+\$22,933\.00/.test(t8), /Part II - Long-term \(held more than 1 year\) - Box L/.test(t8), /Totals \(Schedule D line 10\)/.test(t8), /Not on Form 8949 - to verify/.test(t8), /No Form 1099-DA received/.test(t8)], [true, true, true, true, true, true], 'PDF: Parts I/II, boxes, Schedule D totals, lines to verify apart');
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
  eq(/\n# Times in file: UTC; tax dates: America\/Los_Angeles/.test(U.toCSV(b)), true, 'CSV shows the time zones');
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
  eq([c1.includes('Form 1099-DA comparison (totals you entered) - to verify'), c1.includes('Proceeds (box 1f),88900.00,88938.00,38.00,to verify'), c1.some(l => /Cost basis \(box 1g\)/.test(l))], [true, true, false], 'CSV: 1099-DA proceeds gap flagged to verify, basis line only if entered');
  eq(U.toCSV(r, { da: { p: 88938, b: 46055 } }).includes('Cost basis (box 1g),46055.00,46055.00,0.00,matches'), true, 'CSV: matching basis');
  const X = require('./us-export.js'), d0 = X.summaryData(r, {}), d1 = X.summaryData(r, { da: { p: 88900 } });
  eq([d0.info.some(l => /Form 1099-DA Proceeds/.test(l)), d1.info.some(l => l === 'Form 1099-DA Proceeds (box 1f): $88,900.00 vs Kryptax $88,938.00 - difference $38.00 (TO VERIFY)')], [false, true], 'PDF: 1099-DA line only when entered'); }
console.log(`\n${ok} OK, ${ko} KO`); if (ko) process.exitCode = 1;
