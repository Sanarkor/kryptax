/* node testusref.js — U.S.A.: reference cases computed BY HAND (independent of the engine), fictitious data only.
   Expected values below were worked out on paper from the IRS rules cited in docs/US-RULES.md (v2.50 section):
   basis = cost + acquisition fees; (d) = net proceeds (gross - selling costs) without a Form 1099-DA; crypto-to-crypto = disposal, fees allocated
   to the disposition (Treas. Reg. 1.1001-7(b)(2)(ii)(A)), new lot at fair market value; holding period counted from the day after acquisition,
   disposal day included, more than 1 year = long; income at USD value when received = basis; self-transfers keep date and basis. */
const U = require('./us-engine.js');
let ko = 0; const eq = (a, b, n) => { const s = JSON.stringify(a) === JSON.stringify(b); if (!s) ko++; console.log((s ? 'OK    ' : 'ÉCHEC ') + n + (s ? '' : ' → ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b))); };
const run = (csv, o) => U.compute(U.fromCSVText(csv).txs, o);
const R = r => [r.desc, new Date(r.acquired || 0).toISOString().slice(0, 10), r.proceeds, r.cost, r.gain, r.term, r.status === 'ok' ? 'ok' : 'tv'];
const H = 'Date,Type,Asset,Quantity,Total (USD),Fee (USD),Received Asset,Received Quantity,Wallet,Transaction ID\n';
const csv = H + [
  '2023-03-15,Buy,BTC,1,20000,100,,,A,',            // basis 20 100
  '2024-03-15,Sell,BTC,0.4,28000,40,,,A,S-1',        // exactly 1 year -> short: 27 960 - 8 040 = 19 920
  '2024-03-16,Sell,BTC,0.6,42000,60,,,A,S-2',        // 1 year + 1 day -> long: 41 940 - 12 060 = 29 880
  '2025-01-10,Buy,ETH,2,6000,0,,,A,',
  '2025-02-01,Send,ETH,2,,,,,A,', '2025-02-01,Receive,ETH,2,,,,,B,', // own transfer: date 2025-01-10 and basis 3 000 / ETH kept
  '2025-06-01,Convert,ETH,1,3500,10,SOL,50,B,C-1',  // disposal: 3 490 - 3 000 = 490 short; SOL lot basis 3 500 (FMV)
  '2025-07-01,Staking,SOL,1,150,,,,B,',              // income 150 = basis
  '2025-08-01,Airdrop,ZZT,10,,,,,B,',                // income value unknown -> not in totals, lot basis unknown
  '2025-12-01,Sell,SOL,51,5100,0,,,B,S-3',           // FIFO: 50 SOL 5 000 - 3 500 = 1 500; 1 SOL 100 - 150 = -50
  '2025-12-02,Sell,ZZT,10,40,0,,,B,',                // basis unknown -> to verify, never $0
  '2025-12-03,Sell,ADA,5,20,0,,,B,',                 // no purchase -> to verify
  '2025-12-04,Convert,ETH,0.5,1600,0,USDC,1600,B,',  // stablecoin is a token: 1 600 - 1 500 = 100 short; USDC lot basis 1 600
  '2026-01-20,Sell,USDC,1600,1598,0,,,B,',           // USDC sold: 1 598 - 1 600 = -2 short (not treated as cash)
  '2026-02-01,Sell,ETH,0.5,1000,0,,,B,'              // acquired 2025-01-10: long, 1 000 - 1 500 = -500
].join('\n') + '\n';
const r = run(csv);
eq(r.rows.map(R), [
  ['0.4 BTC (ID S-1)', '2023-03-15', 27960, 8040, 19920, 'short', 'ok'],
  ['0.6 BTC (ID S-2)', '2023-03-15', 41940, 12060, 29880, 'long', 'ok'],
  ['1 ETH (ID C-1)', '2025-01-10', 3490, 3000, 490, 'short', 'ok'],
  ['50 SOL (ID S-3)', '2025-06-01', 5000, 3500, 1500, 'short', 'ok'],
  ['1 SOL (ID S-3)', '2025-07-01', 100, 150, -50, 'short', 'ok'],
  ['10 ZZT', '2025-08-01', 40, null, null, 'short', 'tv'],
  ['5 ADA', '1970-01-01', 20, null, null, null, 'tv'],
  ['0.5 ETH', '2025-01-10', 1600, 1500, 100, 'short', 'ok'],
  ['1600 USDC', '2025-12-04', 1598, 1600, -2, 'short', 'ok'],
  ['0.5 ETH', '2025-01-10', 1000, 1500, -500, 'long', 'ok']], 'Reference lines (a)-(h): fees, anniversary, transfer, convert, income, stablecoin, unknown basis');
const T = y => { const t = U.forYear(r, y).totals; return [t.short.proceeds, t.short.cost, t.short.gain, t.long.proceeds, t.long.cost, t.long.gain, t.toVerify]; };
eq(T(2024), [27960, 8040, 19920, 41940, 12060, 29880, 0], '2024 totals');
eq(T(2025), [10190, 8150, 2040, 0, 0, 0, 2], '2025 totals (2 lines to verify left out)');
eq(T(2026), [1598, 1600, -2, 1000, 1500, -500, 0], '2026 totals');
eq([r.income.map(i => [i.asset, i.usd, i.status === 'ok']), U.forYear(r, 2025).totals.income], [[['SOL', 150, true], ['ZZT', null, false]], { count: 2, usd: 150, unknown: 1 }], 'Income: known value counted, unknown value not counted as $0');
// Form 8949 boxes by edition (tax year)
const box = (y, c) => U.form8949(U.forYear(r, y), c).parts.map(p => p.box + '>' + p.scheduleD.replace('Schedule D line ', ''));
eq([box(2024, 'none'), box(2024, 'basis'), box(2024, 'nobasis')], [['C>3', 'F>10'], ['A>1b', 'D>8b'], ['B>2', 'E>9']], '2024 sales: Form 8949 (2024) boxes A-F only (C/F without a 1099)');
eq([box(2025, 'none'), box(2026, 'basis'), box(2025, 'nobasis')], [['I>3', 'L>10'], ['G>1b', 'J>8b'], ['H>2', 'K>9']], '2025 (final) and 2026 (draft) sales: boxes G-L');
{ const F = U.form8949(r, 'none'); eq([F.edition, F.cat, F.parts[0].box, /choose one tax year/.test(F.editionNote)], ['mixed', null, null, true], 'All years mixing 2024 and 2025+: no single box, choose a year'); }
eq(U.form8949(U.forYear(r, 2024), 'none').parts.map(p => p.totals), [{ d: 27960, e: 8040, g: null, h: 19920 }, { d: 41940, e: 12060, g: null, h: 29880 }], 'Part totals = line totals (d, e, h)');
// Schedule D lines 7 / 15 / 16 and line 21 limit (draft 2026 Schedule D keeps $3,000 / $1,500)
{ const S = U.scheduleD(U.forYear(r, 2026), 'none', null, 'mfs'), g = l => (S.lines.find(x => x.line === l && !x.nc) || {}).h;
  eq([S.n7, S.n15, S.n16, g('21')], [-2, -500, -502, -502], 'Schedule D 2026: 7 = -2, 15 = -500, 16 = -502, 21 = -502 (above the $1,500 MFS limit)'); }
{ const big = run(H + '2025-01-02,Buy,BTC,1,10000,0,,,,\n2025-05-02,Sell,BTC,1,5000,0,,,,\n'), S = U.scheduleD(big, 'none', null, 'mfs'), S2 = U.scheduleD(big, 'none', null, 'other');
  eq([(S.lines.find(x => x.line === '21' && !x.nc) || {}).h, (S2.lines.find(x => x.line === '21' && !x.nc) || {}).h], [-1500, -3000], 'Line 21: loss 5 000 limited to 1 500 (MFS) / 3 000 (other statuses)'); }
// Leap day and anniversary edges (holding period: day after acquisition, disposal day included)
eq([U.isLong(Date.UTC(2024, 0, 31), Date.UTC(2025, 0, 31)), U.isLong(Date.UTC(2024, 0, 31), Date.UTC(2025, 1, 1)), U.isLong(Date.UTC(2023, 11, 31), Date.UTC(2024, 11, 31)), U.isLong(Date.UTC(2023, 11, 31), Date.UTC(2025, 0, 1))], [false, true, false, true], 'Anniversary: same date = short, next day = long (incl. year end)');
// HIFO and duplicates across two files
{ const h = run(H + '2025-01-01,Buy,ETH,1,1000,0,,,,\n2025-02-01,Buy,ETH,1,3000,0,,,,\n2025-03-01,Sell,ETH,1,2500,0,,,,\n', { method: 'HIFO' });
  eq(h.rows.map(x => [x.cost, x.gain]), [[3000, -500]], 'HIFO: highest unit cost lot first'); }
{ const f = U.fromCSVText(H + '2025-01-01,Buy,ETH,1,1000,0,,,,\n'), m = U.mergeFiles([{ p: f }, { p: U.fromCSVText(H + '2025-01-01,Buy,ETH,1,1000,0,,,,\n2025-03-01,Sell,ETH,1,1500,0,,,,\n') }]);
  eq([m.dupes, m.txs.length, U.compute(m.txs).rows.map(x => x.gain)], [1, 2, [500]], 'Same line in two files: counted once (1 duplicate)'); }
// No silent currency: a "Total" column without currency is flagged, a "Total (EUR)" column is not read as USD
{ const a = U.fromCSVText('Date,Type,Asset,Quantity,Total\n2025-01-01,Buy,ETH,1,1000\n'), b = U.fromCSVText('Date,Type,Asset,Quantity,Total (EUR)\n2025-01-01,Buy,ETH,1,1000\n');
  eq([a.skipped.some(s => /no currency in its name: amounts read as USD - to verify/.test(s.why)), isNaN(b.txs[0].usd)], [true, true], 'Currency: unnamed amount flagged, EUR column never taken as USD'); }
// Exports follow the edition (CSV and PDF data)
{ const c24 = U.toCSV(U.forYear(r, 2024), { cat: 'none' }), c25 = U.toCSV(U.forYear(r, 2025), { cat: 'none' });
  eq([/BOX C\b/.test(c24) && /BOX F\b/.test(c24) && !/BOX [IL]\b/.test(c24), /BOX I\b/.test(c25) && /BOX L\b/.test(c25), /Form 8949 edition,"?Form 8949 for 2024 and earlier/.test(c24), /No Form 1099-B received/.test(c24)], [true, true, true, true], 'CSV: 2024 -> boxes C/F + edition note, 2025 -> I/L');
  const X = require('./us-export.js'), d24 = X.summaryData(U.forYear(r, 2024), { cat: 'none' }), d25 = X.summaryData(U.forYear(r, 2025), { cat: 'none' });
  eq([d24.parts.map(p => / - Box ([A-L])/.exec(p.title)[1]), /boxes A-F only/.test(d24.boxNote), d25.parts.map(p => / - Box ([A-L])/.exec(p.title)[1]), /never A-F/.test(d25.boxNote)], [['C', 'F'], true, ['I', 'L'], true], 'PDF data: 2024 -> C/F, 2025 -> I/L, matching box note'); }
console.log(ko ? ko + ' ÉCHEC(S)' : 'testusref : tout est OK'); process.exit(ko ? 1 : 0);
