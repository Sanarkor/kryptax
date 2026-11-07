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
let return_p = null;
// v2.46: Binance "Transaction History" in the Germany mode and German / English language (ENTIRELY FICTITIOUS data)
{ const BN_H = 'User ID,Time,Account,Operation,Coin,Change,Remark';
  const BN_L = ['1,2025-03-01 10:00:00,Spot,Deposit,EUR,500,', '1,2025-03-01 10:00:05,Spot,Transaction Buy,AAA,2,', '1,2025-03-01 10:00:05,Spot,Transaction Spend,EUR,-400,', '1,2025-03-01 10:00:05,Spot,Transaction Fee,AAA,-0.01,',
    '1,2025-03-02 09:00:00,Funding,Gift Card Redemption,BBB,1,Gift Card', '1,2025-03-02 09:01:00,Funding,Transfer Between Spot and Funding,BBB,-1,', '1,2025-03-02 09:01:00,Spot,Transfer Between Spot and Funding,BBB,1,',
    '1,2025-03-03 00:30:00,Spot,Staking Rewards,BBB,0.01,', '1,2025-03-05 12:00:00,Spot,Binance Convert,AAA,-0.5,', '1,2025-03-05 12:00:00,Spot,Binance Convert,CCC,10,',
    '1,2025-04-06 00:30:00,Spot,Sell Crypto to Fiat,EUR,300,', '1,2025-04-06 00:30:01,Spot,Sell Crypto to Fiat,AAA,-1,', '1,2025-04-07 12:00:00,Spot,Sell Crypto to Fiat,USD,120,', '1,2025-04-07 12:00:01,Spot,Sell Crypto to Fiat,CCC,-5,',
    '1,2025-05-01 08:00:00,Spot,Withdraw,BBB,-0.5,', '1,2025-05-02 08:00:00,Spot,Fiat Withdraw,EUR,-300,', '1,2025-12-31 23:30:00,Spot,Sell Crypto to Fiat,EUR,10,', '1,2025-12-31 23:30:01,Spot,Sell Crypto to Fiat,AAA,-0.05,'];
  const CSV = BN_H + '\n' + BN_L.join('\n'), NAME = 'Binance-Transaction-History-202601011200(UTC+1)-part1-of1.csv';
  const XL = [[], ['', '', 'Transaction History'], ['', '', 'User ID', '1', 'Period(UTC+1)', 'x'], [], ['', '', ...BN_H.split(',').flatMap(h => [h, ''])]].concat(BN_L.map(l => ['', '', ...l.split(',').flatMap(v => [v, ''])]));
  const p = K.fromCSVText(Buffer.from(CSV), NAME), T = p.txs, k = t => [t.type, t.asset, t.date, t.qty, t.amt, t.cur, t.tz, t.toAsset, t.toQty].join('|');
  eq([p.binance, T.map(t => t.type).join(' '), p.skipped.filter(s => !s.kept).length], [true, 'BUY TRANSFER INCOME CONVERT SELL SELL TRANSFER SELL', 0], 'Binance (DE): Time column, internal moves ignored, legs paired, deposits and withdrawals = transfers');
  const buy = T[0], sEur = T.find(t => t.type === 'SELL' && t.asset === 'AAA'), sUsd = T.find(t => t.type === 'SELL' && t.asset === 'CCC'), cv = T.find(t => t.type === 'CONVERT');
  eq([buy.qty, buy.eur, sEur.eur, sEur.tz, new Date(sEur.date).toISOString(), sUsd.cur, sUsd.needFx, isNaN(sUsd.eur), cv.toAsset, cv.toQty, isNaN(cv.eur), !!cv.needFx], [1.99, 400, 300, 'UTC', '2025-04-05T23:30:00.000Z', 'USD', true, true, 'CCC', 10, true, false], 'Binance (DE): EUR kept, USD waits for ECB conversion, token exchange without value, UTC+1 from the file name');
  const x = K.parseRows(XL, 'export.xlsx'), L = fs.readFileSync(__dirname + '/testdata/binance_fictif.pdf.txt', 'utf8').split('\n'), pd = K.fromPdfLines(L);
  eq([JSON.stringify(x.txs.map(k)) === JSON.stringify(T.map(k)), JSON.stringify(pd.txs.map(k)) === JSON.stringify(T.slice(0, pd.txs.length).map(k)), pd.txs.length], [true, true, 7], 'Binance (DE): Excel and PDF read like the CSV (same lines, offset from the banner)');
  const r = K.compute(T.filter(t => !t.needFx), { fileTz: 'Asia/Tokyo' }), last = r.disposals.find(d => d.proceeds === 10);
  eq([last.year, last.date === Date.UTC(2025, 11, 31)], ['2025', true], 'Binance (DE): 23:30 UTC+1 on 31 Dec = 31 Dec in German time; page time zone ignored for these lines');
  const cvd = r.disposals.find(d => d.to === 'CCC'), inc = r.income[0], bbb = r.disposals.find(d => d.asset === 'BBB');
  eq([cvd.stK, cvd.proceeds, inc.eur, inc.kind, inc.counted, !!bbb], ['noval', null, null, 'staking', true, false], 'Binance (DE): exchange and reward without price stay to verify (no invented value); staking = passive income; withdrawal is not a sale');
  const sold = K.compute(K.fromCSVText(Buffer.from(BN_H + '\n1,2025-03-02 09:00:00,Funding,Gift Card Redemption,BBB,1,Gift Card\n1,2025-06-01 10:00:00,Spot,Sell Crypto to Fiat,EUR,50,\n1,2025-06-01 10:00:01,Spot,Sell Crypto to Fiat,BBB,-1,'), NAME).txs, { fileTz: 'UTC' }).disposals[0];
  eq([sold.stK, sold.gain], ['noacq', null], 'Binance (DE): token received from outside, then sold: no acquisition found, to verify (transfer is not a purchase)');
  return_p = { p, r }; }
{ const { p, r } = return_p, Y = K.yearSummary(Object.assign(r, { skipped: p.skipped, binance: true }), '2025'), res = Object.assign(r, { skipped: p.skipped, binance: true });
  const en = { chk: K.checks(res, Y, '2025').join('\n'), csv: K.toCSV(res, '2025'), pdf: JSON.stringify(K.pdfData(res, '2025', new Date(Date.UTC(2026, 0, 2)))) };
  K.setLang('de'); K.misses.clear();
  const de = { chk: K.checks(res, Y, '2025').join('\n'), csv: K.toCSV(res, '2025'), pdfD: K.pdfData(res, '2025', new Date(Date.UTC(2026, 0, 2))) }; de.pdf = JSON.stringify(de.pdfD);
  const Y2 = K.yearSummary(res, '2025');
  K.setLang('en');
  eq([JSON.stringify(Y2) === JSON.stringify(Y), K.checks(res, Y, '2025').join('\n') === en.chk, K.toCSV(res, '2025') === en.csv], [true, true, true], 'Language: same figures in German and English; back to English gives the same texts');
  const EN_WORDS = /\b(to verify|disposals?|proceeds|gains?|losses|income|limit|line\(s\)|not in the|Net result|Year|Status of|missing|exchange|wallet or platform|lines skipped)\b/i;
  eq([EN_WORDS.test(de.chk), EN_WORDS.test(de.csv.replace(/Binance Transaction History|Gift Card|Staking Rewards|Transfer Between Spot and Funding/g, '')), [...K.misses]], [false, false, []], 'Deutsch: no English left in checks and CSV (Binance operation names from the file kept as such), every reason translated');
  eq([/[^\x20-\x7e]/.test(de.pdf.replace(/\\[nrtu"\\]/g, '')), /Veraeusserung/.test(de.pdf), /zu pruefen/.test(de.pdf), /Pruefen|\?/.test(de.pdfD.title), /BMF-Schreiben vom 6\. Maerz 2025/.test(de.pdfD.foot)], [false, true, true, false, true], 'Deutsch PDF: ASCII only, umlauts written ae/oe/ue/ss, legal sources in German');
  eq([/Zu prüfen: /.test(K.setLang('de') && K.pdfData(res, '2025').info.join('')), K.setLang('en')], [false, 'en'], 'Deutsch PDF: no non-ASCII letters in the info lines');
  eq([K.OPEN.length === K.OPEN_DE.length, K.OPEN_DE.every(s => /zu prüfen\.$/.test(s)), K.OPEN.every(s => /to verify\.$/.test(s))], [true, true, true], 'Open points: same list in English and German, all "to verify" / "zu prüfen"');
  const IH = fs.readFileSync(__dirname + '/index.html', 'utf8'), AP = fs.readFileSync(__dirname + '/app.js', 'utf8'), SR = fs.readFileSync(__dirname + '/de-engine.js', 'utf8');
  eq([(IH.match(/id="delang"/g) || []).length, /<section id="demode"[^>]*><div id="delang"/.test(IH), /localStorage\.getItem\('kx-de-lang'\) !== 'en'/.test(AP), /const gl = !!d && deLang\(\)/.test(AP), /LANG_KEY = 'kx-de-lang'/.test(SR), /let l = 'de'; try \{ l = W\.localStorage\.getItem\(LANG_KEY\) === 'en' \? 'en' : 'de'/.test(SR) && !/setItem\(LANG_KEY[^)]*\);[^}]*applyStatic\(\);\s*\n?\s*api\._state/.test(SR)], [1, true, true, true, true, true], 'Switch only on the Germany page; German by default, English only when chosen; choice kept in this browser (kx-de-lang); other countries do not read it');
  eq([K.STATIC_DE.every(([s]) => s === 'footer .delaw' || s === '#detzl' || /^#de|^#demode/.test(s) || /^#deimp/.test(s))], [true], 'German static texts only target the Germany page and its footer line'); }
{ const SR = fs.readFileSync(__dirname + '/de-engine.js', 'utf8'), CS = fs.readFileSync(__dirname + '/style.css', 'utf8'), AP = fs.readFileSync(__dirname + '/app.js', 'utf8');
  const p = K.fromPdfLines(['Date Type Crypto Quantité Prix Valeur Frais', 'x']); K.setLang('de'); K.misses.clear();
  const tr = ['mixed currencies in the line, to verify', 'amounts in USD in a statement in EUR: line not imported, to verify', 'quantity x price differs from the value; the value shown is used, to verify'].map(K.whyT); K.setLang('en');
  eq([tr.every(s => !/[a-z] (in the|to verify|line)/.test(s)), [...K.misses], /devises mélangées dans la ligne\$\/, 'mixed currencies in the line, to verify'/.test(SR)], [true, [], true], 'v2.48: French reasons of the shared PDF reader shown in English, then German (Germany page only)');
  eq([/#demode\[lang="de"\]>#deresult:empty::before\{content:"Ihre Ergebnisse erscheinen hier nach der Berechnung\."\}/.test(CS), /#demode\[lang="de"\] section\.dropover::after/.test(CS), /#ukresult:empty::before\{content:"Your results will appear here after the calculation\."\}/.test(CS)], [true, true, true], 'v2.48: empty result and drop hint in German on the Germany page; U.K. unchanged');
  eq([/document\.title = d \? \(gl \? 'Kryptax – Anlage SO für Krypto-Steuern in Deutschland \(Schätzung\)'/.test(AP), /: TITLE0;/.test(AP), /deP \? 'Dunkler Modus'/.test(AP)], [true, true, true], 'v2.48: tab title and theme button in the Germany page language; other countries keep the original title'); }
const asyncT = (async () => {
  const p = parse([['2025-01-01 10:00', 'Buy', 'AA', 2, 200], ['2025-02-01 10:00', 'Convert', 'AA', 1, '', '', 'BB', 4], ['2025-03-01', 'Staking reward', 'BB', 1, '']]);
  await K.priceMissing(p, { minute: async (a) => a === 'BB' ? { p: 50, src: 'test', k: 'm' } : null }, 'UTC');
  const r = K.compute(p.txs, { fileTz: 'UTC' }); r.priced = p.priced;
  eq([p.priced.count, r.disposals[0].proceeds, r.disposals[0].gain, r.income[0].eur], [2, 200, 100, 50], 'missing values: market price of the received token');
  console.log('\n' + ok + ' OK, ' + ko + ' KO'); if (ko) process.exit(1);
})();
asyncT.catch(e => { console.log('ÉCHEC async: ' + e.message); process.exit(1); });
