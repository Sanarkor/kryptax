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
const csv = U.toCSV(r).split('\n');
eq(csv[0].startsWith('(a) Description,(b) Date acquired,(c) Date sold,(d) Proceeds USD'), true, 'CSV header');
eq(csv[1], '0.5 BTC,01/10/2024,01/10/2025,34975.00,15025.00,19950.00,short,I,ok', 'CSV first line');

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
eq(U.toCSV(w).split('\n')[0].endsWith(',Status,Wallet'), true, 'CSV has a Wallet column');
// no wallet column → one wallet, unchanged
eq(U.toCSV(r).split('\n')[0].endsWith(',Status'), true, 'no Wallet column when the file has none');
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
// English only, no French legal words in the module texts
const src = fs.readFileSync(__dirname + '/us-engine.js', 'utf8');
eq(/\b(2086|2042|3AN|3BN|CGI|impots|BOI|L136)\b|prélèvements|France/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), false, 'no French legal text in the U.S.A. module');
console.log(`\n${ok} OK, ${ko} KO`); if (ko) process.exitCode = 1;
