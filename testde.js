/* Tests of the Germany module v1 (fictitious data only). Run: node testde.js */
const fs = require('fs'), K = require('./de-engine.js');
let ok = 0, ko = 0;
const eq = (a, b, n) => { const s = JSON.stringify(a) === JSON.stringify(b); s ? ok++ : ko++; console.log((s ? 'OK    ' : 'ÉCHEC ') + n + (s ? '' : ' -> ' + JSON.stringify(a) + ' != ' + JSON.stringify(b))); };
const csv = (rows, w) => 'Date,Type,Asset,Quantity,Total EUR,Fee EUR,Received Asset,Received Quantity' + (w ? ',Wallet' : '') + '\n' + rows.map(r => r.join(',')).join('\n');
const parse = (rows, w) => K.fromCSVText(Buffer.from(csv(rows, w)));
const run = (rows, w) => { const p = parse(rows, w); return K.compute(p.txs, { fileTz: 'UTC', hasWallet: p.hasWallet }); };
// FIFO, holding period, partly after one year
{ const r = run([['2023-03-01', 'Buy', 'AA', 1, 1000, 0], ['2024-06-01', 'Buy', 'AA', 1, 2000, 0], ['2024-09-01', 'Sell', 'AA', 1.5, 4500, 30]]), d = r.disposals[0];
  eq([d.taxQty, d.exQty, d.taxProceeds, d.taxCost, d.taxFees, d.gain, d.exProceeds], [0.5, 1, 1500, 1000, 10, 490, 3000], 'FIFO: first lot > 1 year not taxable, rest taxable, fee split by quantity'); }
eq([K.withinYear(Date.UTC(2024, 0, 10) / 864e5, Date.UTC(2025, 0, 10) / 864e5), K.withinYear(Date.UTC(2024, 0, 10) / 864e5, Date.UTC(2025, 0, 11) / 864e5)], [true, false], 'one year: anniversary day within, next day after');
// buy fee in cost, exchange = disposal at value received, new lot at that value
{ const r = run([['2025-01-01', 'Buy', 'AA', 1, 1000, 10], ['2025-02-01', 'Convert', 'AA', 1, 1500, 0, 'BB', 3], ['2025-03-01', 'Sell', 'BB', 3, 1800, 0]]);
  eq(r.disposals.map(x => x.gain), [490, 300], 'exchange: disposal at value received, cost of received token = that value'); }
// exemption limit all or nothing: 999.99 / 1000 (2024+), 599.99 / 600 (2023)
const lim = (y, g) => K.yearSummary(run([[y + '-01-01', 'Buy', 'AA', 1, 1000], [y + '-02-01', 'Sell', 'AA', 1, 1000 + g]]), y);
eq([lim('2024', 999.99).exempt, lim('2024', 1000).exempt, lim('2024', 1000).taxableSales, lim('2023', 599.99).exempt, lim('2023', 600).exempt, lim('2023', 999).limit], [true, false, 1000, true, false, 600], 'limit EUR 1,000 from 2024, EUR 600 up to 2023, all or nothing');
eq(K.limitSales('2008'), null, 'limit before 2009: to verify');
// losses shown, net
{ const Y = K.yearSummary(run([['2025-01-01', 'Buy', 'AA', 1, 1000], ['2025-02-01', 'Sell', 'AA', 1, 400], ['2025-01-01', 'Buy', 'BB', 1, 100], ['2025-03-01', 'Sell', 'BB', 1, 300]]), '2025');
  eq([Y.gains, Y.losses, Y.net, Y.exempt], [200, 600, -400, true], 'losses and net result'); }
// income from services: 256 limit
const inc = v => K.yearSummary(run([['2025-01-01', 'Staking reward', 'AA', 1, v], ['2025-05-01', 'Lending interest', 'AA', 1, 1]]), '2025');
eq([inc(254.99).incExempt, inc(255).incExempt, inc(255).incomeTaxable, inc(255).byKind], [true, false, 256, { staking: 255, lending: 1 }], 'income: below EUR 256 not taxable, all or nothing');
// income tokens become a lot at that value; airdrop flagged
{ const r = run([['2025-01-01', 'Staking reward', 'AA', 1, 100], ['2025-02-01', 'Airdrop', 'CC', 5, 50], ['2025-03-01', 'Sell', 'AA', 1, 150]]), Y = K.yearSummary(r, '2025');
  eq([r.disposals[0].gain, Y.incomeEur, Y.incomeOpenEur, Y.incExempt, K.checks(r, Y, '2025').some(c => /airdrop: income only if/.test(c))], [50, 100, 50, null, true], 'income lots at value received; airdrop listed apart (not in the total), limit status to verify'); }
// v2.40: holding period ss. 187-188 BGB: anniversary day within, 29 February -> 28 February
{ const D = (y, m, d) => Date.UTC(y, m - 1, d) / 864e5;
  eq([K.withinYear(D(2024, 2, 29), D(2025, 2, 28)), K.withinYear(D(2024, 2, 29), D(2025, 3, 1)), K.withinYear(D(2024, 12, 31), D(2025, 12, 31)), K.withinYear(D(2024, 12, 31), D(2026, 1, 1))], [true, false, true, false], 'holding period: 29.02 ends 28.02 next year; 31.12 ends 31.12'); }
// v2.40: mining and other rewards not in the s. 22 no. 3 total; staking + lending exactly 256 = limit reached
{ const Y = K.yearSummary(run([['2025-01-01', 'Mining reward', 'AA', 1, 300], ['2025-02-01', 'Staking reward', 'AA', 1, 100]]), '2025');
  eq([Y.incomeEur, Y.incomeOpenEur, Y.incExempt, Y.incomeTaxable], [100, 300, null, null], 'mining listed apart, to verify: no "below the limit" claim'); }
// v2.40: disposal to verify makes "below EUR 1,000" uncertain; reaching the limit stays certain
{ const Y = K.yearSummary(run([['2025-01-01', 'Buy', 'AA', 1, 100], ['2025-02-01', 'Sell', 'AA', 1, 600], ['2025-03-01', 'Sell', 'ZZ', 1, 50]]), '2025');
  const Y2 = K.yearSummary(run([['2025-01-01', 'Buy', 'AA', 1, 100], ['2025-02-01', 'Sell', 'AA', 1, 1100], ['2025-03-01', 'Sell', 'ZZ', 1, 50]]), '2025');
  eq([Y.exempt, Y.taxableSales, Y2.exempt, Y2.taxableSales, K.checks(run([['2025-01-01', 'Buy', 'AA', 1, 100], ['2025-02-01', 'Sell', 'AA', 1, 600]]), Y, '2025').some(c => /ALL your private sales/.test(c))], [null, null, false, 1000, true], 'limit: uncertain with lines to verify; other private sales reminder'); }
// wallets: FIFO per wallet when a wallet column exists, single wallet otherwise (flagged)
{ const rows = [['2025-01-01', 'Buy', 'AA', 1, 100, 0, '', '', 'W1'], ['2025-01-02', 'Buy', 'AA', 1, 500, 0, '', '', 'W2'], ['2025-03-01', 'Sell', 'AA', 1, 600, 0, '', '', 'W2']];
  const r = run(rows, true), r1 = run(rows.map(x => x.slice(0, 8)));
  eq([r.oneWallet, r.disposals[0].gain, r1.oneWallet, r1.disposals[0].gain, K.checks(r1, K.yearSummary(r1, '2025'), '2025').some(c => /one single wallet/.test(c))], [false, 100, true, 500, true], 'FIFO per wallet, single wallet flagged'); }
// no acquisition: to verify, out of totals
{ const r = run([['2025-03-01', 'Sell', 'ZZ', 1, 600]]), Y = K.yearSummary(r, '2025'); eq([Y.count, Y.toVerify.length], [0, 1], 'disposal without acquisition: to verify'); }
// open points always listed, no tax rate
{ const r = run([['2025-01-01', 'Buy', 'AA', 1, 1000], ['2025-02-01', 'Sell', 'AA', 1, 1200]]), C = K.checks(r, K.yearSummary(r, '2025'), '2025').join(' ');
  eq(['Anlage SO line', 'Fees', 'order between the limit and losses', 'NFT', 'Commercial activity', 'ELSTER'].every(s => C.includes(s)), true, 'open points listed');
  const P = K.pdfData(r, '2025', new Date(Date.UTC(2026, 0, 1))), all = [P.title, P.foot].concat(P.info, P.head, ...P.rows).join('\n'), S = K.toCSV(r, '2025');
  eq([/^[\x20-\x7e\n]*$/.test(all), /EUR 200\.00/.test(all), /Net result,200\.00/.test(S), /\d+(\.\d+)? ?% tax/i.test(all + S)], [true, true, true, false], 'PDF ASCII only, CSV totals, no tax rate'); }
// other currency waits for conversion
{ const p = K.fromCSVText(Buffer.from('Date,Type,Asset,Quantity,Total (USD)\n2025-01-01,Buy,AA,1,100')); eq([p.txs[0].needFx, isNaN(p.txs[0].eur)], [true, true], 'USD line waits for EUR conversion'); }
// page: English only, title, legal footer
{ const H = fs.readFileSync(__dirname + '/index.html', 'utf8'), m = H.match(/<section id="demode"[\s\S]*?<div id="deresult"/), L = H.match(/<span class="law delaw"[^>]*>([\s\S]*?)<\/span>/);
  eq([!!m, m && /[àâçéèêëîïôûùÿœ]|\b(le|la|les|des|vos)\b/.test(m[0]), /Anlage SO summary for German crypto taxes \(estimate\)/.test(fs.readFileSync(__dirname + '/app.js', 'utf8')), !!L, L && /BMF/.test(L[1])], [true, false, true, true, true], 'Germany page in English, title, legal footer'); }
// missing EUR values: market price of the minute (test double)
const asyncT = (async () => {
  const p = parse([['2025-01-01 10:00', 'Buy', 'AA', 2, 200], ['2025-02-01 10:00', 'Convert', 'AA', 1, '', '', 'BB', 4], ['2025-03-01', 'Staking reward', 'BB', 1, '']]);
  await K.priceMissing(p, { minute: async (a) => a === 'BB' ? { p: 50, src: 'test', k: 'm' } : null }, 'UTC');
  const r = K.compute(p.txs, { fileTz: 'UTC' }); r.priced = p.priced;
  eq([p.priced.count, r.disposals[0].proceeds, r.disposals[0].gain, r.income[0].eur], [2, 200, 100, 50], 'missing values: market price of the received token');
  console.log('\n' + ok + ' OK, ' + ko + ' KO'); if (ko) process.exit(1);
})();
asyncT.catch(e => { console.log('ÉCHEC async: ' + e.message); process.exit(1); });
