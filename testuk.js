/* Tests of the U.K. module v1 (fictitious data only; HMRC Cryptoassets Manual worked examples CRYPTO22251-22256). Run: node testuk.js */
const fs = require('fs'), K = require('./uk-engine.js');
let ok = 0, ko = 0;
const eq = (a, b, n) => { const s = JSON.stringify(a) === JSON.stringify(b); s ? ok++ : ko++; console.log((s ? 'OK    ' : 'FAIL  ') + n + (s ? '' : ' -> ' + JSON.stringify(a) + ' != ' + JSON.stringify(b))); };
const csv = rows => 'Date,Type,Asset,Quantity,Total (GBP),Fee (GBP),Received Asset,Received Quantity\n' + rows.map(r => r.join(',')).join('\n');
const run = (rows, o) => K.compute(K.fromCSVText(csv(rows)).txs, o || { fileTz: 'UTC' });
const g = (res, d) => res.disposals.filter(x => K.dmy(x.date) === d).map(x => x.gain);

// tax year 6 April - 5 April
eq([K.taxYear(Date.UTC(2025, 3, 5) / 864e5), K.taxYear(Date.UTC(2025, 3, 6) / 864e5), K.taxYear(Date.UTC(2026, 0, 31) / 864e5)], ['2024-25', '2025-26', '2025-26'], 'tax year boundary 5/6 April');
// basic S104 pool (gov.uk example: 100 at 2 + 300 at 1, sell 200 -> cost 250)
{ const r = run([['2025-05-01', 'Buy', 'XY', 100, 200], ['2025-05-02', 'Buy', 'XY', 300, 300], ['2025-06-01', 'Sell', 'XY', 200, 400]]);
  eq([r.disposals[0].cost, r.disposals[0].gain, r.pools.XY], [250, 150, { qty: 200, cost: 250 }], 'S104 pool average cost'); }
// CRYPTO22254 example 4: same day rule + S104
{ const r = run([['2025-01-01', 'Buy', 'D', 8000, 1000], ['2026-01-31 09:00', 'Sell', 'D', 5000, 500], ['2026-01-31 10:00', 'Buy', 'D', 4000, 320], ['2026-01-31 11:00', 'Buy', 'D', 1000, 75], ['2026-01-31 12:00', 'Buy', 'D', 1000, 70], ['2026-01-31 13:00', 'Sell', 'D', 2000, 142], ['2026-01-31 14:00', 'Buy', 'D', 500, 35]]);
  const d = r.disposals.find(x => x.asset === 'D'); eq([r.disposals.length, d.qty, d.proceeds, d.gain, r.pools.D.cost, r.pools.D.qty], [1, 7000, 642, 79.5, 937.5, 7500], 'same day rule (example 4: one disposal, gain 79.50 - HMRC rounds to 79 - pool 7,500)'); }
// CRYPTO22253 example 3: 30 day rule
{ const r = run([['2024-01-01', 'Buy', 'C', 2000, 1000], ['2025-03-31', 'Sell', 'C', 1000, 400], ['2025-04-20', 'Sell', 'C', 500, 150], ['2025-04-21', 'Buy', 'C', 700, 175], ['2025-04-28', 'Buy', 'C', 500, 100], ['2025-05-01', 'Buy', 'C', 500, 150]]);
  eq([g(r, '31/03/2025'), g(r, '20/04/2025'), r.pools.C], [[165], [20], { qty: 2200, cost: 1060 }], '30 day rule (example 3: gains 165 and 20, pool 2,200 / 1,060)');
  eq([r.disposals[0].year, r.disposals[1].year], ['2024-25', '2025-26'], '30 day rule across tax years'); }
// CRYPTO22256 example 6: same day + 30 day + S104 (loss)
{ const r = run([['2020-01-01', 'Buy', 'F', 100000, 300000], ['2025-07-31', 'Buy', 'F', 10000, 45000], ['2025-07-31', 'Sell', 'F', 30000, 150000], ['2025-08-05', 'Sell', 'F', 20000, 100000], ['2025-08-06', 'Buy', 'F', 50000, 225000], ['2025-08-07', 'Sell', 'F', 100000, 150000]]);
  eq([g(r, '31/07/2025'), g(r, '05/08/2025'), g(r, '07/08/2025'), r.pools.F.qty, Math.round(r.pools.F.cost)], [[15000], [10000], [-163636.36], 10000, 31364], 'example 6: gains 15,000 / 10,000, loss (163,636), pool 10,000');
  const Y = K.yearSummary(r, '2025-26'); eq([Y.count, Y.gains, Y.losses, Y.net, Y.aea, Y.taxable], [3, 25000, 163636.36, -138636.36, 3000, 0], 'SA108 13.1-13.5 with a net loss, no exempt amount used'); }
// 30 day window: day 30 matched, day 31 not
{ const r = run([['2025-05-01', 'Buy', 'Z', 10, 100], ['2025-06-01', 'Sell', 'Z', 1, 50], ['2025-07-01', 'Buy', 'Z', 1, 20]]), r2 = run([['2025-05-01', 'Buy', 'Z', 10, 100], ['2025-06-01', 'Sell', 'Z', 1, 50], ['2025-07-02', 'Buy', 'Z', 1, 20]]);
  eq([r.disposals[0].parts[0].rule, r2.disposals[0].parts[0].rule], ['30 day', 'S104'], '30 days after = matched, 31 days = pool'); }
// fees: buy fee added to cost, sell fee in allowable costs, swap fee split 50/50 (CRYPTO22150)
{ const r = run([['2025-05-01', 'Buy', 'A', 10, 1000, 10], ['2025-06-01', 'Sell', 'A', 5, 800, 4]]);
  eq([r.disposals[0].proceeds, r.disposals[0].cost, r.disposals[0].gain], [800, 509, 291], 'fees: buy fee in cost, sell fee allowable');
  const s = run([['2025-05-01', 'Buy', 'A', 10, 1000], ['2025-06-01', 'Convert', 'A', 10, 1500, 10, 'B', 3], ['2025-07-15', 'Sell', 'B', 3, 1600]]);
  eq([s.disposals[0].cost, s.disposals[0].gain, s.disposals[1].cost, s.disposals[1].gain], [1005, 495, 1505, 95], 'swap: disposal of A, B acquired at value, fee 50/50'); }
// exempt amount and loss
{ const r = run([['2025-05-01', 'Buy', 'E', 1, 1000], ['2025-06-01', 'Sell', 'E', 1, 6000], ['2025-05-01', 'Buy', 'L', 1, 1000], ['2025-09-01', 'Sell', 'L', 1, 500]]), Y = K.yearSummary(r, '2025-26');
  eq([Y.gains, Y.losses, Y.net, Y.aea, Y.taxable, Y.mustReport], [5000, 500, 4500, 3000, 1500, true], 'loss deducted, annual exempt amount 3,000 (2025-26)');
  eq([K.AEA['2023-24'], K.AEA['2019-20']], [6000, undefined], 'exempt amount table (older year unknown = to verify)'); }
// income, airdrop, transfers, missing acquisition, foreign currency
{ const r = run([['2025-05-01', 'Staking reward', 'S', 2, 20], ['2025-05-02', 'Airdrop', 'S', 1, 30], ['2025-05-03', 'Send', 'S', 1, ''], ['2025-06-01', 'Sell', 'S', 3, 90], ['2025-06-02', 'Sell', 'Q', 1, 10]]);
  eq([r.income.length, r.income[0].gbp, r.disposals.find(x => x.asset === 'S').cost, r.disposals.find(x => x.asset === 'S').gain, r.transfers.count], [2, 20, 20, 70, 1], 'staking at value, airdrop at 0 (to verify), transfer not a disposal');
  eq(r.disposals.find(x => x.asset === 'Q').status.startsWith('to verify: no acquisition found'), true, 'sale without acquisition = to verify'); }
eq(K.fromCSVText('Date,Type,Asset,Quantity,Total (USD)\n2025-05-01,Buy,A,1,10').txs.map(t => [t.cur, t.needFx]), [['USD', true]], 'USD column: line kept, waiting for conversion (v2.34)');
eq(K.fromCSVText(csv([['2025-05-01', 'Buy', 'A', 1, '$10']])).txs[0].cur, 'USD', 'line with $ kept for conversion');
eq(K.fromCSVText(csv([['2025-05-01', 'Buy', 'A', 1, '$10', '\u20ac1']])).skipped[0].why, 'mixed currencies in the line, to verify', 'mixed currencies in a line: skipped');
eq(K.dmy(K.ukDate('05/04/2025')), '05/04/2025', 'U.K. dates are day/month/year');
// v2.34: conversion to GBP, mocked rates (no network). Rate of the day, else previous working day (weekend), else excluded.
// v2.41: Binance "Transaction History" (ENTIRELY FICTITIOUS data): Time column, fixed UTC offset, banner and empty columns (Excel), pairs, internal moves
const BN_H = 'User ID,Time,Account,Operation,Coin,Change,Remark';
const BN_L = ['1,2025-03-01 10:00:00,Spot,Deposit,EUR,500,', '1,2025-03-01 10:00:05,Spot,Transaction Buy,AAA,2,', '1,2025-03-01 10:00:05,Spot,Transaction Spend,EUR,-400,', '1,2025-03-01 10:00:05,Spot,Transaction Fee,AAA,-0.01,',
  '1,2025-03-02 09:00:00,Funding,Gift Card Redemption,BBB,1,Gift Card', '1,2025-03-02 09:01:00,Funding,Transfer Between Spot and Funding,BBB,-1,', '1,2025-03-02 09:01:00,Spot,Transfer Between Spot and Funding,BBB,1,',
  '1,2025-03-03 00:30:00,Spot,Staking Rewards,BBB,0.01,', '1,2025-03-05 12:00:00,Spot,Binance Convert,AAA,-0.5,', '1,2025-03-05 12:00:00,Spot,Binance Convert,CCC,10,',
  '1,2025-04-06 00:30:00,Spot,Sell Crypto to Fiat,EUR,300,', '1,2025-04-06 00:30:01,Spot,Sell Crypto to Fiat,AAA,-1,', '1,2025-04-07 12:00:00,Spot,Sell Crypto to Fiat,USD,120,', '1,2025-04-07 12:00:01,Spot,Sell Crypto to Fiat,CCC,-5,',
  '1,2025-05-01 08:00:00,Spot,Withdraw,BBB,-0.5,', '1,2025-05-02 08:00:00,Spot,Fiat Withdraw,EUR,-300,'];
const BN_CSV = BN_H + '\n' + BN_L.join('\n'), BN_NAME = 'Binance-Transaction-History-202601011200(UTC+1)-part1-of1.csv';
const BN_XLSX = (off) => [[], ['', '', 'Transaction History'], ['', '', 'User ID', '1', 'Period(' + off + ')', 'x'], [], ['', '', ...BN_H.split(',').flatMap(h => [h, ''])]].concat(BN_L.map(l => ['', '', ...l.split(',').flatMap(v => [v, ''])]));
{ const p = K.fromCSVText(BN_CSV, BN_NAME), T = p.txs, ty = T.map(t => t.type).join(' ');
  eq([p.platform, ty, p.skipped.filter(s => !s.kept).length], ['Binance Transaction History', 'BUY TRANSFER INCOME CONVERT SELL SELL TRANSFER', 0], 'Binance (U.K.): Time column read, internal moves ignored, pairs read');
  const buy = T[0], sEur = T.find(t => t.type === 'SELL' && t.asset === 'AAA'), sUsd = T.find(t => t.type === 'SELL' && t.asset === 'CCC'), cv = T.find(t => t.type === 'CONVERT');
  eq([buy.qty, buy.cur, buy.amt, buy.needFx, sEur.cur, sEur.amt, sEur.needFx, isNaN(sEur.gbp), sUsd.cur, sUsd.amt, cv.toAsset, cv.toQty, isNaN(cv.gbp), !!cv.needFx], [1.99, 'EUR', 400, true, 'EUR', 300, true, true, 'USD', 120, 'CCC', 10, true, false], 'Binance (U.K.): source amount and currency kept (EUR, USD), never taken as GBP; token exchange without value');
  eq([new Date(sEur.date).toISOString(), sEur.tz], ['2025-04-05T23:30:00.000Z', 'UTC'], 'Binance (U.K.): fixed UTC+1 offset from the file name -> UTC instant');
  const r = K.compute(T.map(t => Object.assign({}, t, t.needFx ? { gbp: t.amt * 0.8, fee: 0 } : {})), { fileTz: 'Asia/Tokyo' }), d = r.disposals.find(x => x.asset === 'AAA' && x.proceeds === 240);
  eq([d && d.year, r.income[0].day * 864e5 === Date.UTC(2025, 2, 2), r.income[0].gbp], ['2025-26', true, null], 'Binance (U.K.): 00:30 UTC+1 on 6 April = 6 April in London (BST) -> 2025-26; page time zone ignored for these lines; reward value missing');
  const cvd = r.disposals.find(x => x.asset === 'AAA' && x.proceeds == null);
  eq([!!cvd, cvd && /missing GBP value/.test(cvd.status)], [true, true], 'Binance (U.K.): exchange between tokens = disposal to verify (no invented value)');
  const ck = K.checks(Object.assign(r, { skipped: p.skipped }), K.yearSummary(r, '2024-25'), '2024-25').join(' ');
  eq([/no GBP value in the Binance file/.test(ck), /fee paid in the token bought/.test(ck)], [true, true], 'Binance (U.K.): missing values and fee in tokens listed to verify');
  const x = K.parseRows(BN_XLSX('UTC-05:00'), 'export.xlsx'), xs = x.txs.find(t => t.type === 'SELL' && t.asset === 'AAA');
  eq([x.txs.length, new Date(xs.date).toISOString()], [T.length, '2025-04-06T05:30:00.000Z'], 'Binance (U.K.) Excel: banner, empty columns, offset from the banner');
  const n = K.fromCSVText(BN_CSV, 'no-offset.csv'), ns = n.txs.find(t => t.type === 'SELL' && t.asset === 'AAA');
  eq([ns.tz, new Date(ns.date).toISOString(), n.skipped.some(s => /time zone not given/.test(s.why))], [undefined, '2025-04-06T00:30:00.000Z', true], 'Binance (U.K.): no offset -> page time zone applies, flagged');
  const m = K.mergeFiles([{ name: 'a.csv', p }, { name: 'b.xlsx', p: K.parseRows(BN_XLSX('UTC+1'), 'b.xlsx') }]);
  eq([m.txs.length, m.dupes], [T.length, T.length], 'Binance (U.K.): same history as CSV and Excel counted once'); }
{ let asked = ''; const p = K.fromCSVText(BN_CSV, BN_NAME);
  K.convertFx(p, async u => { asked = u; return { rates: { '2025-03-01': { GBP: 0.83 }, '2025-04-04': { GBP: 0.84 }, '2025-04-07': { GBP: 0.85 } } }; }).then(() => {
    const s = p.txs.find(t => t.type === 'SELL' && t.asset === 'AAA'); eq([Math.round(s.gbp * 100) / 100, s.fx.on], [252, '2025-04-04'], 'Binance (U.K.): EUR sale converted with the ECB rate of the day or the previous working day'); }); }
const asyncT = (async () => {
  const urls = [], mock = async u => { urls.push(u); return { rates: { '2025-05-02': { GBP: 0.85 }, '2025-06-02': { GBP: 0.84 } } }; };
  const p = K.fromCSVText('Date,Type,Asset,Quantity,Total (EUR),Fee (EUR)\n2025-05-02,Buy,A,10,100,2\n2025-05-04,Buy,A,10,100,0\n2025-06-02,Sell,A,5,80,1\n2025-07-20,Sell,A,1,10,0');
  await K.convertFx(p, mock);
  eq(urls, ['https://api.frankfurter.dev/v1/2025-04-25..2025-07-20?from=EUR&to=GBP'], 'one Frankfurter call per currency (from EUR to GBP)');
  eq(p.txs.map(t => [+t.gbp.toFixed(4), +t.fee.toFixed(4), t.fx.on]), [[85, 1.7, '2025-05-02'], [85, 0, '2025-05-02'], [67.2, 0.84, '2025-06-02']], 'EUR to GBP at the rate of the day, Sunday uses the previous working day');
  eq([p.txs.length, p.fx.missing, p.skipped[0].why], [3, 1, 'no EUR to GBP rate found for 2025-07-20, excluded, to verify'], 'no rate within 7 days: line listed and excluded');
  const r = K.compute(p.txs, { fileTz: 'UTC' }); r.fx = p.fx;
  eq(/converted to GBP \(EUR\).*Frankfurter.*CG78310/.test(K.toCSV(r, '2025-26')) && /CG78310/.test(K.pdfData(r, '2025-26').info.join(' ')), true, 'conversion source and HMRC CG78310 named in CSV and PDF');
  const q = K.fromCSVText(csv([['2025-05-01', 'Buy', 'A', 1, '10']])); await K.convertFx(q, async () => { throw new Error('no call expected'); }); eq(q.txs[0].gbp, 10, 'GBP lines: no conversion, no call');
  const z = K.fromCSVText('Date,Type,Asset,Quantity,Total (USD)\n2025-05-01,Buy,A,1,10'); await K.convertFx(z, async () => { throw new Error('offline'); }); eq([z.txs.length, z.fx.missing], [0, 1], 'network failure: line excluded and listed, nothing guessed');
  // PDF statement lines (invented structure, no real data)
  const P = K.fromPdfLines(['HISTORY', 'Date Symbol Type Quantity Price Value Fee', '2 mai 2025, 10:00:00 AAA Achat 10,00000000 10,00 \u20ac 100,00 \u20ac 2,00 \u20ac', '4 June 2025, 09:00:00 AAA Staking reward 1,00000000 10,00 \u20ac 10,00 \u20ac', '2 juin 2025, 11:00:00 AAA Vente 5,00000000 16,00 \u20ac 80,00 \u20ac 1,00 \u20ac', '3 juin 2025, 11:00:00 BBB Achat (X) 2,00000000 5,00 $ 10,00 $ 0,01 $']);
  eq(P.txs.map(t => [t.type, t.asset, t.qty, t.amt, t.feeAmt, t.cur]), [['BUY', 'AAA', 10, 100, 2, 'EUR'], ['SELL', 'AAA', 5, 80, 1, 'EUR'], ['BUY', 'BBB', 2, 10, 0.01, 'USD'], ['INCOME', 'AAA', 1, 10, 0, 'EUR']], 'PDF: buy, sell, reward and a $ line read (FR/EN words and dates)');
  await K.convertFx(P, async u => /from=USD/.test(u) ? { rates: { '2025-06-03': { GBP: 0.8 } } } : { rates: { '2025-05-02': { GBP: 0.85 }, '2025-06-02': { GBP: 0.84 }, '2025-06-04': { GBP: 0.84 } } });
  eq(P.txs.map(t => +t.gbp.toFixed(2)), [85, 67.2, 8, 8.4], 'PDF: EUR and USD lines converted to GBP');
  console.log(ok + ' OK, ' + ko + ' KO'); process.exit(ko ? 1 : 0);
})();
// v2.35: repeated warnings grouped (one line per message, ranges)
eq(K.ranges([1, 2, 3, 5, 7, 8, 3]), '1-3, 5, 7-8', 'line numbers condensed into ranges');
{ const ns = [...Array(14)].map((_, i) => i + 1).concat([...Array(14)].map((_, i) => i + 20), [40]), W = 'fee shown in the statement is taken as included in the value, to verify';
  const sk = ns.map(n => ({ line: 'PDF ' + n, why: W, kept: true })).concat([{ line: 'PDF 50', why: 'mixed currencies in the line, to verify' }]);
  const r = K.compute(K.fromCSVText(csv([['2025-05-01', 'Buy', 'A', 2, '10'], ['2025-06-01', 'Sell', 'A', 1, '8']])).txs, { fileTz: 'UTC' }); r.skipped = sk;
  const Y = K.yearSummary(r, '2025-26'), C = K.checks(r, Y, '2025-26');
  const F = /fees? shown in the (PDF )?statement/i;
  eq([C.filter(c => F.test(c)), C.length], [['Fees shown in the PDF statement are taken as included in the value — to verify.'], 2], 'screen: 29 per-line fee notes replaced by one method sentence, counter reflects it');
  eq([K.toCSV(r, '2025-26').split('\n').filter(l => F.test(l)).length, K.pdfData(r, '2025-26').info.filter(l => F.test(l)).length, /PDF \d/.test(K.toCSV(r, '2025-26'))], [1, 1, false], 'CSV and PDF: one sentence, no per-line list');
  eq(K.pdfData(r, '2025-26').info.every(l => /^[\x20-\x7e]*$/.test(l)), true, 'PDF info lines stay ASCII');
  eq(K.groupLines([{ line: 3, why: 'unknown type' }, { line: 4, why: 'unknown type' }], 5).map(g => g.text), ['Line 3: unknown type', 'Line 4: unknown type'], 'few important lines: still detailed one by one');
  eq(K.groupLines([3, 4, 5, 6, 7, 9].map(l => ({ line: l, why: 'unknown type' })), 5).map(g => g.text), ['lines 3-7, 9: unknown type (6 lines)'], 'many of the same type: grouped by type with every line number'); }
// v2.36: old-format PDF fees = allowable costs; exchange (sale + buy same second, same fee) counted once, 50/50 (CRYPTO22150); reward without value; no doubled 'to verify'
{ const P = K.fromPdfLines(['AAA Achat 10,00000000 10,00 \u20ac 100,00 \u20ac 2,00 \u20ac 1 mai 2025, 10:00:00', 'AAA Vente 10,00000000 12,00 \u20ac 120,00 \u20ac 1,00 \u20ac 2 juin 2025, 10:00:00', 'BBB Achat 5,00000000 23,00 \u20ac 115,00 \u20ac 1,00 \u20ac 2 juin 2025, 10:00:00', 'CCC Récompense Apprendre 3,00000000 4 juin 2025, 10:00:00']);
  eq(P.txs.map(t => [t.type, t.asset, t.feeAmt]), [['BUY', 'AAA', 2], ['SELL', 'AAA', 0.5], ['BUY', 'BBB', 0.5], ['INCOME', 'CCC', 0]], 'old format: buy fee in cost; exchange fee counted once, split 50/50');
  P.txs.forEach(t => { t.gbp = t.amt; t.fee = t.feeAmt; delete t.needFx; });
  const r = K.compute(P.txs, { fileTz: 'UTC' }); r.feeNote = P.feeNote; const Y = K.yearSummary(r, '2025-26'), C = K.checks(r, Y, '2025-26');
  eq([+Y.costs.toFixed(2), +Y.proceeds.toFixed(2), Y.income[0].gbp], [102.5, 120, null], 'cost 100 + 2 + 0.5; reward without value stays unknown, not GBP 0');
  eq([C.some(c => /split 50\/50.*CRYPTO22150/.test(c)), C.some(c => /^1 reward\(s\) without a value.*CRYPTO21200/.test(c)), /value missing - to verify/.test(K.toCSV(r, '2025-26'))], [true, true, true], 'fee method and missing reward value named once');
  const q = K.compute(K.fromCSVText(csv([['2025-06-01', 'Sell', 'A', 1, '8']])).txs, { fileTz: 'UTC' }); const Cq = K.checks(q, K.yearSummary(q, '2025-26'), '2025-26');
  eq([Cq.some(c => /to verify: .*to verify/.test(c)), Cq[0]], [false, '01/06/2025 A: no acquisition found for 1 A (not in the totals) — to verify.'], 'no doubled to verify'); }
// v2.37: several files merged like the French mode; a line already in an earlier file counted once; lines renamed F<n>:<line>
{ const a = { txs: [{ line: 2, date: 2, type: 'BUY', asset: 'A', qty: 1, amt: 10 }, { line: 3, date: 5, type: 'SELL', asset: 'A', qty: 1, amt: 12 }], skipped: [{ line: 4, why: 'x' }], missingCols: [] }, b = { txs: [{ line: 2, date: 2, type: 'BUY', asset: 'A', qty: 1, amt: 10 }, { line: 3, date: 3, type: 'BUY', asset: 'B', qty: 2, amt: 5 }], skipped: [], missingCols: [] };
  const m = K.mergeFiles([{ name: 'a', p: a }, { name: 'b', p: b }]), one = K.mergeFiles([{ name: 'a', p: a }]);
  eq([m.txs.map(t => t.line).join(' '), m.dupes, m.skipped[0].line, one.txs === a.txs, one.dupes], ['F1:2 F2:3 F1:3', 1, 'F1:4', true, 0], 'merge: duplicate line counted once, sorted by date, single file unchanged'); }
// exports: CSV boxes, PDF ASCII only, English only
{ const r = run([['2025-05-01', 'Buy', 'A', 10, 1000], ['2025-06-01', 'Sell', 'A', 5, 800]]), C = K.toCSV(r, '2025-26'), P = K.pdfData(r, '2025-26', new Date(Date.UTC(2026, 0, 1)));
  eq([/13\.2,Disposal proceeds,800\.00/.test(C), /13\.3,Allowable costs \(including purchase price\),500\.00/.test(C)], [true, true], 'CSV SA108 boxes');
  const all = [P.title, P.foot].concat(P.info, P.head, ...P.rows).join('\n'); eq([/^[\x20-\x7e\n]*$/.test(all), /GBP 300\.00/.test(all)], [true, true], 'PDF text ASCII only'); }
{ const H = fs.readFileSync(__dirname + '/index.html', 'utf8'), m = H.match(/<section id="ukmode"[\s\S]*?<\/section><\/section>|<section id="ukmode"[\s\S]*?<div id="ukresult"/), L = H.match(/<span class="law uklaw" lang="en" hidden>([^<]*)<\/span>/);
  eq([!!m, m && /[àâçéèêëîïôûùüÿœ]/.test(m[0]), !!L, L && /CRYPTO22200/.test(L[1]), L && /[àâçéèêëîïôûùüÿœ]|CGI/.test(L[1])], [true, false, true, true, false], 'U.K. page in English, footer sources line'); }
// v2.40: "Purchase of goods" is a disposal (SPEND), not a BUY; plain "Purchase" stays a BUY
{ const p = K.fromCSVText('Date,Type,Asset,Quantity,Total (GBP),Fee\n01/06/2025 10:00,Buy,A,1,100,0\n10/06/2025 10:00,Purchase of goods,A,0.5,80,0\n20/08/2025 10:00,Purchase,A,1,90,0\n');
  eq(p.txs.map(t => t.type), ['BUY', 'SPEND', 'BUY'], 'type: "Purchase of goods" = SPEND, "Purchase" = BUY');
  const r = K.compute(p.txs, { fileTz: 'UTC' }), d = r.disposals;
  eq([d.length, d[0] && d[0].proceeds, d[0] && d[0].gain], [1, 80, 30], 'spending 0.5 A for 80 = disposal, pool cost 50, gain 30'); }
asyncT.catch(e => { console.log('FAIL  async: ' + e.message); process.exit(1); });
