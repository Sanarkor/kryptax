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
eq(K.fromCSVText('Date,Type,Asset,Quantity,Total (USD)\n2025-05-01,Buy,A,1,10').currency, true, 'USD file refused');
eq(K.fromCSVText(csv([['2025-05-01', 'Buy', 'A', 1, '$10']])).skipped[0].why, 'value not in GBP', 'line with $ skipped');
eq(K.dmy(K.ukDate('05/04/2025')), '05/04/2025', 'U.K. dates are day/month/year');
// exports: CSV boxes, PDF ASCII only, English only
{ const r = run([['2025-05-01', 'Buy', 'A', 10, 1000], ['2025-06-01', 'Sell', 'A', 5, 800]]), C = K.toCSV(r, '2025-26'), P = K.pdfData(r, '2025-26', new Date(Date.UTC(2026, 0, 1)));
  eq([/13\.2,Disposal proceeds,800\.00/.test(C), /13\.3,Allowable costs \(including purchase price\),500\.00/.test(C)], [true, true], 'CSV SA108 boxes');
  const all = [P.title, P.foot].concat(P.info, P.head, ...P.rows).join('\n'); eq([/^[\x20-\x7e\n]*$/.test(all), /GBP 300\.00/.test(all)], [true, true], 'PDF text ASCII only'); }
{ const H = fs.readFileSync(__dirname + '/index.html', 'utf8'), m = H.match(/<section id="ukmode"[\s\S]*?<\/section><\/section>|<section id="ukmode"[\s\S]*?<div id="ukresult"/), L = H.match(/<span class="law uklaw" lang="en" hidden>([^<]*)<\/span>/);
  eq([!!m, m && /[àâçéèêëîïôûùüÿœ]/.test(m[0]), !!L, L && /CRYPTO22200/.test(L[1]), L && /[àâçéèêëîïôûùüÿœ]|CGI/.test(L[1])], [true, false, true, true, false], 'U.K. page in English, footer sources line'); }
console.log(`\n${ok} OK, ${ko} KO`); if (ko) process.exitCode = 1;
