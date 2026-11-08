/* Kryptax Australia (beta) — tests with expected values computed BY HAND (ENTIRELY FICTITIOUS data). Run under several TZ (npm run test:tz). */
const fs = require('fs'), A = require('./au-engine.js');
let ok = 0, ko = 0;
const eq = (a, b, n) => { const s = JSON.stringify(a) === JSON.stringify(b); s ? ok++ : ko++; console.log((s ? 'OK    ' : 'ÉCHEC ') + n + (s ? '' : ' -> ' + JSON.stringify(a) + ' != ' + JSON.stringify(b))); };
const H = 'Date,Type,Asset,Quantity,Total (AUD),Fee (AUD),Received Asset,Received Quantity\n';
const csv = rows => H + rows.map(r => r.join(',')).join('\n');
const SYD = 'Australia/Sydney', run = (rows, o) => A.compute(A.fromCSVText(csv(rows)).txs, o || { fileTz: SYD, taxTz: SYD });
(async () => {
  // 1) FIFO parcels, 12 months, losses BEFORE the discount, prior-year losses, 50% discount only for a confirmed resident.
  //    Lot A: 1 BTC 2024-01-10, 40,000 + 100 fee = 40,100. Lot B: 1 BTC 2025-03-01, 90,000. 10 ETH 2025-03-05, 50,000 (5,000 each).
  //    Sell 1.5 BTC 2025-08-01 for 165,000, fee 150 -> parcel A (1 BTC): proceeds 110,000, cost 40,100, costs 100, gain 69,800, held > 12 months (discount);
  //                                                   parcel B (0.5 BTC): proceeds 55,000, cost 45,000, costs 50, gain 9,950, < 12 months.
  //    Sell 4 ETH 2025-09-01 for 12,000: cost 20,000, loss 8,000.
  //    FY 2025-26: losses 8,000 against the non-discount gain 9,950 -> 1,950; prior-year loss 1,000 -> 950; discount gains 69,800 -> discount 34,900;
  //    net capital gain = 950 + 69,800 - 34,900 = 35,850; nothing to carry forward.
  const BASE = [['2024-01-10 10:00', 'Buy', 'BTC', 1, 40000, 100], ['2025-03-01 10:00', 'Buy', 'BTC', 1, 90000, 0], ['2025-03-05 10:00', 'Buy', 'ETH', 10, 50000, 0],
    ['2025-08-01 10:00', 'Sell', 'BTC', 1.5, 165000, 150], ['2025-09-01 10:00', 'Sell', 'ETH', 4, 12000, 0]];
  { const r = run(BASE), P = r.parcels;
    eq(P.map(p => [p.asset, p.qty, p.proceeds, p.cost, p.fees, p.gain, p.discount]), [['BTC', 1, 110000, 40100, 100, 69800, true], ['BTC', 0.5, 55000, 45000, 50, 9950, false], ['ETH', 4, 12000, 20000, 0, -8000, false]], 'FIFO: 1.5 BTC split into 2 parcels (old one discounted, new one not), ETH loss');
    const Y = A.yearSummary(r, 2025, { resident: 'yes', prior: 1000 });
    eq([Y.label, Y.grossGains, Y.disc, Y.nonDisc, Y.losses, Y.lossesAppliedNonDisc, Y.priorApplied, Y.afterLosses, Y.discount, Y.net, Y.carryForward], ['2025-26', 79750, 69800, 9950, 8000, 8000, 1000, 70750, 34900, 35850, 0], 'Net capital gain 2025-26: losses first against gains under 12 months, prior loss, then 50% discount = 35,850');
    const N = A.yearSummary(r, 2025, { resident: '', prior: 1000 }), F = A.yearSummary(r, 2025, { resident: 'no' });
    eq([N.discount, N.net, N.afterLosses, F.discount, F.net, F.afterLosses], [null, null, 70750, null, null, 71750], 'Residency not confirmed or non-resident: no discount applied automatically');
    // Big losses: carry forward. Gains 1,000 (non-disc) ; loss 5,000 ; prior 2,000 -> carry 4,000 + 2,000 = 6,000
    const r2 = run([['2025-07-01', 'Buy', 'AAA', 2, 2000, 0], ['2025-07-10', 'Sell', 'AAA', 1, 2000, 0], ['2025-07-11', 'Buy', 'BBB', 1, 6000, 0], ['2025-08-11', 'Sell', 'BBB', 1, 1000, 0]]), Y2 = A.yearSummary(r2, 2025, { resident: 'yes', prior: 2000 });
    eq([Y2.grossGains, Y2.losses, Y2.net, Y2.carryForward], [1000, 5000, 0, 6000], 'Losses larger than gains: net 0, 6,000 to carry forward (4,000 current + 2,000 prior)');
    const inv = A.inventory(r, 2025); eq(inv.map(x => [x.asset, x.qty, x.cost, x.parcels]), [['BTC', 0.5, 45000, 1], ['ETH', 6, 30000, 1]], 'Holdings at 30 June 2026: 0.5 BTC (45,000), 6 ETH (30,000)'); }
  // 2) 12 months excluding both days (ATO): bought 1 Jul 2024 -> sold 1 Jul 2025 NOT eligible, 2 Jul 2025 eligible. Bought 29 Feb 2024 -> 1 Mar 2025 not, 2 Mar 2025 eligible.
  { const D = s => Date.parse(s + 'T00:00:00Z') / 864e5;
    eq([A.held12(D('2024-07-01'), D('2025-07-01')), A.held12(D('2024-07-01'), D('2025-07-02')), A.held12(D('2024-02-29'), D('2025-03-01')), A.held12(D('2024-02-29'), D('2025-03-02')), A.held12(D('2023-03-01'), D('2024-03-01')), A.held12(D('2023-03-01'), D('2024-03-02'))],
      [false, true, false, true, false, true], '12 months: day after the anniversary; 29 Feb anniversary = 1 Mar; leap year 2024 handled');
    const r = run([['2024-07-01', 'Buy', 'X', 2, 200, 0], ['2025-07-01', 'Sell', 'X', 1, 300, 0], ['2025-07-02', 'Sell', 'X', 1, 300, 0]]);
    eq(r.parcels.map(p => [p.gain, p.discount, p.fy]), [[200, false, 2025], [200, true, 2025]], 'Date-only rows: sold on the anniversary = no discount; the day after = discount'); }
  // 3) Income-year boundary 30 June / 1 July by tax zone (explicit UTC instants). 2025-06-30T14:30Z: Sydney/Melbourne/Brisbane/Hobart 00:30 1 Jul (UTC+10) -> 2025-26;
  //    Adelaide/Darwin 00:00 1 Jul (UTC+9:30) -> 2025-26; Perth 22:30 30 Jun (UTC+8) -> 2024-25; Lord Howe 01:00 1 Jul (UTC+10:30 in winter) -> 2025-26.
  //    2025-06-30T14:00Z: Adelaide/Darwin 23:30 30 Jun -> 2024-25. A date without time (2025-07-01) is 1 July everywhere.
  { const rows = t => [['2025-01-01T00:00:00Z', 'Buy', 'X', 1, 100, 0], [t, 'Sell', 'X', 1, 150, 0]], fy = (t, z) => A.compute(A.fromCSVText(csv(rows(t))).txs, { fileTz: 'UTC', taxTz: z }).parcels[0].fy;
    const Z = ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Hobart', 'Australia/Adelaide', 'Australia/Darwin', 'Australia/Perth', 'Australia/Lord_Howe'];
    eq(Z.map(z => fy('2025-06-30T14:30:00Z', z)), [2025, 2025, 2025, 2025, 2025, 2025, 2024, 2025], '30 Jun 14:30 UTC: 2025-26 everywhere except Perth (2024-25)');
    eq([fy('2025-06-30T14:00:00Z', 'Australia/Adelaide'), fy('2025-06-30T14:00:00Z', 'Australia/Darwin'), fy('2025-07-01', 'Australia/Perth'), fy('2025-06-30', 'Australia/Lord_Howe')], [2024, 2024, 2025, 2024], 'Half-hour zones at 14:00 UTC = 23:30 30 June; date-only rows never shifted');
    // Daylight saving: 2025-12-31T13:30Z = 00:30 1 Jan in Sydney (UTC+11) but 23:30 31 Dec in Brisbane (UTC+10); Lord Howe summer UTC+11 -> 00:30; Adelaide summer +10:30 -> 00:00.
    const day = (t, z) => A.dmy(A.compute(A.fromCSVText(csv(rows(t))).txs, { fileTz: 'UTC', taxTz: z }).parcels[0].date);
    eq(['Australia/Sydney', 'Australia/Brisbane', 'Australia/Lord_Howe', 'Australia/Adelaide', 'Australia/Darwin'].map(z => day('2025-12-31T13:30:00Z', z)), ['1 Jan 2026', '31 Dec 2025', '1 Jan 2026', '1 Jan 2026', '31 Dec 2025'], 'Daylight saving (summer): Sydney/Lord Howe/Adelaide vs Brisbane/Darwin');
    eq(A.compute(A.fromCSVText(csv(rows('2025-06-30 23:30'))).txs, { fileTz: 'Australia/Perth', taxTz: SYD }).parcels[0].fy, 2025, 'File in Perth time, tax dates in Sydney: 23:30 Perth = 01:30 Sydney 1 July -> 2025-26'); }
  // 4) Own transfers: no CGT event, parcel keeps date and cost base. Buy 1 ETH 2024-01-01 3,000; send + receive 2024-06-01; sell 2025-02-01 5,000 -> gain 2,000 with discount.
  { const r = run([['2024-01-01', 'Buy', 'ETH', 1, 3000, 0], ['2024-06-01', 'Send', 'ETH', 1, '', ''], ['2024-06-01', 'Receive', 'ETH', 1, '', ''], ['2025-02-01', 'Sell', 'ETH', 1, 5000, 0]]);
    eq([r.parcels.length, r.parcels[0].gain, r.parcels[0].discount, A.dmy(r.parcels[0].acqDate), r.transfers.count], [1, 2000, true, '1 Jan 2024', 2], 'Transfers between own wallets: not a disposal, acquisition date and cost kept'); }
  // 5) Swap with fee: 1,000 USDT bought 1 Jul 2025 for 1,500; swapped for 0.01 BTC worth 1,520 (fee 2) on 1 Aug 2025 -> USDT gain 1,520 - 1,500 - 2 = 18; BTC cost base 1,520.
  //    Sold 0.01 BTC 1 Sep 2025 for 1,600 -> gain 80. A row valued in USDT is never treated as USD: value missing, to verify.
  { const r = run([['2025-07-01', 'Buy', 'USDT', 1000, 1500, 0], ['2025-08-01', 'Swap', 'USDT', 1000, 1520, 2, 'BTC', 0.01], ['2025-09-01', 'Sell', 'BTC', 0.01, 1600, 0]]);
    eq(r.parcels.map(p => [p.asset, p.gain, p.swap || '']), [['USDT', 18, 'BTC'], ['BTC', 80, '']], 'Stablecoin swap = disposal; fee in the disposal; new parcel at the value received');
    const q = A.fromCSVText('Date,Type,Asset,Quantity,Total (USDT)\n2025-08-01,Sell,BTC,1,60000\n'); eq([q.txs[0].stable, isFinite(q.txs[0].aud), q.txs[0].needFx || false], [true, false, false], 'Value in USDT: not converted as USD, AUD value missing');
    const r3 = A.compute(q.txs, { fileTz: SYD, taxTz: SYD }); eq(/AUD value of the disposal missing|no acquisition/.test(r3.parcels[0].status), true, 'USDT-valued sale excluded (to verify)'); }
  // 6) Rewards: staking 1 SOL worth 200 on 1 Aug 2025 = ordinary income 200, cost base 200; sold 1 Sep 2025 for 250 -> gain 50.
  //    Reward without value: income unknown, sale of those units to verify. Airdrop without value: listed, cost unknown (never zero), sale to verify.
  { const r = run([['2025-08-01', 'Staking reward', 'SOL', 1, 200, 0], ['2025-09-01', 'Sell', 'SOL', 1, 250, 0], ['2025-08-02', 'Staking reward', 'DOT', 2, '', ''], ['2025-09-02', 'Sell', 'DOT', 2, 40, 0], ['2025-08-03', 'Airdrop', 'NEW', 100, '', ''], ['2025-09-03', 'Sell', 'NEW', 100, 30, 0]]), Y = A.yearSummary(r, 2025, { resident: 'yes' });
    eq([Y.incomeAud, Y.incomeUnknown, Y.airdrops.length, r.parcels.find(p => p.asset === 'SOL').gain, /cost base unknown/.test(r.parcels.find(p => p.asset === 'DOT').status), /cost base unknown/.test(r.parcels.find(p => p.asset === 'NEW').status), Y.grossGains], [200, 1, 1, 50, true, true, 50], 'Staking = income at value, cost base = value; unknown value / airdrop: cost unknown, excluded'); }
  // 7) Missing history: sell more than bought -> the missing part is a separate parcel to verify; the known part is computed.
  { const r = run([['2025-07-01', 'Buy', 'ADA', 100, 100, 0], ['2025-08-01', 'Sell', 'ADA', 150, 300, 0]]);
    eq(r.parcels.map(p => [p.qty, p.gain, /no acquisition/.test(p.status)]), [[100, 100, false], [50, null, true]], 'Missing acquisition: 100 ADA computed (gain 100), 50 ADA to verify'); }
  // 8) Fee paid in a crypto token: separate disposal of that token, value unknown -> to verify; the trade itself is computed.
  { const q = A.fromCSVText('Date,Type,Asset,Quantity,Total (AUD),Fee,Fee Asset\n2025-07-01,Buy,BNB,1,900,0,\n2025-08-01,Buy,BTC,0.01,1500,0.001,BNB\n2025-08-02,Sell,BTC,0.01,1600,5,AUD\n'), r = A.compute(q.txs, { fileTz: SYD, taxTz: SYD });
    const f = r.parcels.find(p => p.feeDisp), s = r.parcels.find(p => p.asset === 'BTC');
    eq([!!f, f && f.asset, f && f.qty, f && /fee paid in BNB/.test(f.status), s.gain], [true, 'BNB', 0.001, true, 95], 'Fee in BNB = separate disposal to verify; AUD fee counted (1,600 - 1,500 - 5 = 95)'); }
  // 9) 2027-28 and later: blocked (CGT reform, Act No. 49 of 2026), no old 50% discount applied.
  { const r = run([['2025-01-01', 'Buy', 'X', 1, 100, 0], ['2027-07-01', 'Sell', 'X', 1, 500, 0]]), Y = A.yearSummary(r, 2027, { resident: 'yes' });
    eq([r.parcels[0].blocked, Y.blocked, Y.count, Y.discount, Y.net, A.checks(r, Y).some(x => /No\. 49/.test(x) && /1 July 2027/.test(x))], [true, true, 0, null, null, true], '2027-28: blocked, nothing computed, no discount');
    const r2 = run([['2025-01-01', 'Buy', 'X', 1, 100, 0], ['2027-06-30', 'Sell', 'X', 1, 500, 0]]); eq([r2.parcels[0].fy, r2.parcels[0].blocked || false, A.yearSummary(r2, 2026, { resident: 'yes' }).net], [2026, false, 200], '30 June 2027 (2026-27): computed under the current rules, gain 400, discount -> 200'); }
  // 10) AUD conversion. RBA table F11.1 (real values of the official file, A$1 = USD): 27 Jun 2025 0.6543, 30 Jun 0.6550, 1 Jul 0.6579.
  //     Sale 1,000 USD on Sunday 29 Jun 2025 -> previous published day 27 Jun: 1,000 / 0.6543 = 1,528.35 AUD. Purchase 1 Jul 2025 for 655 USD -> 655 / 0.6579 = 995.59.
  { const RBA = 'F11.1  EXCHANGE RATES\nTitle,A$1=USD,Trade-weighted Index May 1970 = 100,A$1=EUR\nDescription,x,y,z\nUnits,USD,Index,EUR\n\nSource,WM/Reuters,RBA,RBA\nSeries ID,FXRUSD,FXRTWI,FXREUR\n27-Jun-2025,0.6543,60.20,0.5598\n30-Jun-2025,0.6550,60.10,0.5586\n01-Jul-2025,0.6579,60.40,0.5582\n';
    const R = A.fromCSVText(RBA); eq([!!R.rba, R.rba.from, R.rba.to, R.rba.rates.USD['2025-06-27']], [true, '2025-06-27', '2025-07-01', 0.6543], 'RBA F11.1 file recognised as an exchange-rate table (not transactions)');
    const p = A.fromCSVText('Date,Type,Asset,Quantity,Total (USD)\n2025-06-01,Buy,BTC,1,500\n2025-06-29 12:00,Sell,BTC,1,1000\n2025-07-01 12:00,Buy,ETH,1,655\n'); p.fileTz = SYD; let calls = 0;
    await A.convertFx(p, { rba: R.rba, getJson: async () => { calls++; return { rates: {} }; } }, SYD);
    eq([p.txs.length, +p.txs[0].aud.toFixed(2), p.txs[0].fx.on, p.txs[0].fx.src, +p.txs[1].aud.toFixed(2), p.skipped.length, calls], [2, 1528.35, '2025-06-27', 'RBA', 995.59, 1, 1], 'RBA: Sunday -> Friday rate; division A$1 = x; line outside the RBA file -> ECB fallback (none here) -> excluded');
    const q = A.fromCSVText('Date,Type,Asset,Quantity,Total (EUR)\n2025-06-30,Sell,BTC,1,1000\n'); q.fileTz = SYD; let url = '';
    await A.convertFx(q, { getJson: async u => { url = u; return { rates: { '2025-06-30': { AUD: 1.7905 } } }; } }, SYD);
    eq([+q.txs[0].aud.toFixed(2), q.txs[0].fx.src, /^https:\/\/api\.frankfurter\.dev\/v1\/2025-06-23\.\.2025-06-30\?from=EUR&to=AUD$/.test(url)], [1790.5, 'ECB', true], 'Without the RBA file: ECB via Frankfurter (labelled not RBA), 1 EUR = y AUD'); }
  // 11) Formats: "$" alone ambiguous; slash dates decided per file; dedup across files; security; PDF ASCII; file name.
  { eq(/"\$" alone/.test(A.fromCSVText('Date,Type,Asset,Quantity,Total ($)\n2025-01-06,Buy,BTC,1,1000\n').skipped[0].why), true, '"$" alone: line rejected (AUD or USD?)');
    eq(A.fromCSVText(H + '03/04/2025,Buy,BTC,1,100,0\n').txs.length, 0, 'Ambiguous 03/04/2025 rejected; ' + A.dmy(A.fromCSVText(H + '13/04/2025,Buy,BTC,1,100,0\n03/04/2025,Buy,BTC,1,100,0\n').txs[0].date) + ' decided as DD/MM');
    const a = A.fromCSVText(csv([['2025-07-01', 'Buy', 'BTC', 1, 100, 0]])), b = A.fromCSVText(csv([['2025-07-01', 'Buy', 'BTC', 1, 100, 0], ['2025-08-01', 'Sell', 'BTC', 1, 150, 0]])), m = A.mergeFiles([{ name: 'a', p: a }, { name: 'b', p: b }]);
    eq([m.dupes, m.txs.length, A.compute(m.txs, { fileTz: SYD, taxTz: SYD }).parcels[0].gain], [1, 2, 50], 'Same line in two files counted once');
    const s = A.fromCSVText(H + '2025-07-01,Buy,=HYPERLINK(1),1,100,0\n2025-08-01,Sell,=HYPERLINK(1),1,150,0\n'), r = A.compute(s.txs, { fileTz: SYD, taxTz: SYD }), out = A.toCSV(r, 2025, { resident: 'yes' });
    eq([/,'=HYPERLINK/.test(out), /(^|,)=HYPERLINK/m.test(out), /Net capital gain,50\.00/.test(out) || /Net capital gain,/.test(out)], [true, false, true], 'CSV: cell starting with = neutralised');
    const pd = A.pdfData(r, 2025, { resident: 'yes' }, new Date(Date.UTC(2026, 0, 2))), all = [pd.title, pd.foot].concat(pd.info, ...pd.rows, pd.head).join('\n');
    eq([/^[\x20-\x7e\n]*$/.test(all), /amounts in AUD/.test(pd.title), /\$/.test(all), /not an ATO form/.test(all), pd.head.filter(h => /\(AUD\)/.test(h)).length], [true, true, false, true, 4], 'PDF: ASCII, AUD written, no "$", not an ATO form');
    eq(A.fileName(2025, 'pdf', new Date(2026, 3, 9, 7, 5)), 'kryptax-australia-2025-26_2026-04-09_07h05.pdf', 'File name: country, income year, date and time'); }
  // 12) Excel date cells (real workbook) independent of the process TZ; Binance UTC+1 (shared fixtures), Excel and PDF read like the CSV.
  { const X = require('./xlsx.mini.min.js'), mk = rows => { const ws = X.utils.aoa_to_sheet(rows, { cellDates: true }), wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'S'); return new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx' })); };
    const q = A.fromWorkbook(X, mk([['Date', 'Type', 'Asset', 'Quantity', 'Total (AUD)'], [new Date(2025, 5, 30, 23, 59), 'Buy', 'BTC', 1, 100], [new Date(2025, 6, 1), 'Sell', 'BTC', 1, 150]]), 'x.xlsx');
    eq(q.txs.map(t => new Date(t.date).toISOString().slice(0, 16) + (t.dateOnly ? ' D' : '')), ['2025-06-30T23:59', '2025-07-01T00:00 D'], 'Excel: wall-clock time kept, date-only cell kept (TZ=' + (process.env.TZ || 'local') + ')');
    const src = fs.readFileSync(__dirname + '/testuk.js', 'utf8'), BN = new Function(src.slice(src.indexOf('const BN_H'), src.indexOf('const BN_CSV')) + 'return [BN_H, BN_L];')(), NAME = 'Binance-Transaction-History-202601011200(UTC+1)-part1-of1.csv';
    const p = A.fromCSVText(Buffer.from(BN[0] + '\n' + BN[1].join('\n')), NAME), k = t => [t.type, t.asset, t.date, t.qty, t.amt, t.cur, t.tz, t.toAsset, t.toQty].join('|');
    const XL = [[], ['', '', 'Transaction History'], ['', '', 'User ID', '1', 'Period(UTC+1)', 'x'], [], ['', '', ...BN[0].split(',').flatMap(h => [h, ''])]].concat(BN[1].map(l => ['', '', ...l.split(',').flatMap(v => [v, ''])]));
    const x = A.parseRows(XL, 'export.xlsx'), pd = A.fromPdfLines(fs.readFileSync(__dirname + '/testdata/binance_fictif.pdf.txt', 'utf8').split('\n'));
    eq([p.binance, JSON.stringify(x.txs.map(k)) === JSON.stringify(p.txs.map(k)), pd.txs.length > 0 && JSON.stringify(pd.txs.map(k)) === JSON.stringify(p.txs.slice(0, pd.txs.length).map(k)), p.txs.every(t => t.tz === 'UTC')], [true, true, true, true], 'Binance: Excel and PDF = CSV, UTC+1 offset applied');
    const b = A.fromCSVText(Buffer.from(BN[0] + '\n1,2025-06-01 10:00:00,Spot,Transaction Buy,ZZZ,1,\n1,2025-06-01 10:00:00,Spot,Transaction Spend,AUD,-100,\n1,2025-06-30 15:30:00,Spot,Transaction Sold,ZZZ,-1,\n1,2025-06-30 15:30:00,Spot,Transaction Revenue,AUD,150,'), NAME);
    const fyz = z => A.compute(b.txs, { fileTz: 'UTC', taxTz: z }).parcels.map(pp => pp.fy);
    eq([b.txs.map(t => t.cur).join(), fyz(SYD), fyz('Australia/Perth')], ['AUD,AUD', [2025], [2024]], 'Binance 30 Jun 15:30 UTC+1 (14:30 UTC): Sydney 2025-26, Perth 2024-25'); }
  // 13) Possible wash sale: loss with a repurchase 10 days later -> flagged only (loss kept in the totals).
  { const r = run([['2025-07-01', 'Buy', 'X', 1, 1000, 0], ['2025-08-01', 'Sell', 'X', 1, 600, 0], ['2025-08-11', 'Buy', 'X', 1, 610, 0]]), Y = A.yearSummary(r, 2025, { resident: 'yes' });
    eq([r.parcels[0].wash, Y.losses, Y.carryForward, Y.wash.length], [true, 400, 400, 1], 'Wash sale: warning only, the 400 loss stays and is carried forward'); }
  // 14) Page integration (static): menu entry, English section, beta banner, sources footer, script loaded, CSP unchanged for AU (Frankfurter already allowed, RBA via file).
  { const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
    eq([/id="regau"[^>]*lang="en"[^>]*><svg class="flag"/.test(html), /<section id="aumode"[^>]*lang="en"/.test(html), /id="aumode"[\s\S]*?Beta/.test(html), /class="law aulaw"/.test(html), /<script src="au-engine\.js\?v=/.test(html), /connect-src [^;"]*https:\/\/api\.frankfurter\.dev/.test(html), /rba\.gov\.au/.test((html.match(/connect-src [^;"]*/) || [''])[0])],
      [true, true, true, true, true, true, false], 'Page: Australia menu entry, English section, beta, footer sources, script; Frankfurter allowed, no RBA origin needed'); }
  console.log(ko ? ko + ' ÉCHEC(S)' : 'testau : tout est OK (' + ok + ')'); process.exit(ko ? 1 : 0);
})();
