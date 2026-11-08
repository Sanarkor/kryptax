/* node testustz.js — U.S.A. v2.51: tax-date time zone (fictitious data, expected values worked out by hand, independent of the browser zone).
   Convention (to verify, no IRS time-zone rule found for individuals): file times are read in the file zone (or the explicit UTC offset of the
   line); dates (b)/(c), tax year and the 1-year test use the chosen U.S. "tax dates" zone; automatic = file zone if U.S., else browser if U.S., else Eastern. */
const U = require('./us-engine.js');
let ko = 0; const eq = (a, b, n) => { const s = JSON.stringify(a) === JSON.stringify(b); if (!s) ko++; console.log((s ? 'OK    ' : 'ÉCHEC ') + n + (s ? '' : ' → ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b))); };
const ymd = t => new Date(t).toISOString().slice(0, 10), NY = 'America/New_York';
const H = 'Date,Type,Asset,Quantity,Total (USD),Fee (USD)\n';
const rows = (csv, fileTz, taxTz) => U.compute(U.fromCSVText(H + csv).txs, { fileTz, taxTz }).rows.map(r => [ymd(r.acquired), ymd(r.sold), r.term, new Date(r.sold).getUTCFullYear()]);
// 1) Automatic tax zone never takes a non-U.S. browser zone
eq([U.resolveTaxTz('', NY, 'Europe/Paris'), U.resolveTaxTz('', 'Europe/Paris', 'Europe/Paris'), U.resolveTaxTz('', 'UTC', 'America/Chicago'), U.resolveTaxTz('America/Denver', NY, 'Europe/Paris').tz, U.resolveTaxTz('Europe/Paris', NY, 'x').tz],
  [{ tz: NY, how: 'same as the file' }, { tz: NY, how: 'default (Eastern)' }, { tz: 'America/Chicago', how: 'this browser' }, 'America/Denver', NY], 'Automatic tax zone: file (U.S.) > browser (U.S.) > Eastern; Paris never used');
// 2) Year boundary: Eastern file, sale 12/31/2025 23:59 Eastern (= 01/01/2026 04:59 UTC, 05:59 Paris)
const B = '2025-01-02 10:00,Buy,BTC,1,100,0\n2025-12-31 23:59,Sell,BTC,1,150,0\n';
eq(rows(B, NY, NY), [['2025-01-02', '2025-12-31', 'short', 2025]], 'Eastern file + Eastern tax dates: sale on 12/31/2025, tax year 2025');
eq(rows(B, NY, 'Europe/Paris'), [['2025-01-02', '2026-01-01', 'short', 2026]], 'Before v2.51 (tax dates = Paris browser): same sale moved to 01/01/2026, year 2026 (the reported bug)');
eq(rows(B, NY, U.resolveTaxTz('', NY, 'Europe/Paris').tz), [['2025-01-02', '2025-12-31', 'short', 2025]], 'v2.51 automatic zone in a Paris browser: 2025');
// 3) Explicit UTC offset (Binance "UTC+1"): instant kept, then Eastern calendar
{ const t = [{ line: 2, date: Date.UTC(2025, 0, 2, 9), tz: 'UTC', type: 'BUY', asset: 'ETH', qty: 1, usd: 100, fee: 0 }, { line: 3, date: Date.UTC(2025, 11, 31, 23, 30), tz: 'UTC', type: 'SELL', asset: 'ETH', qty: 1, usd: 120, fee: 0 }];
  const r = U.compute(t, { fileTz: 'Europe/Paris', taxTz: NY }).rows[0]; // 01/01/2026 00:30 UTC+1 = 12/31/2025 23:30 UTC = 18:30 Eastern
  eq([ymd(r.sold), new Date(r.sold).getUTCHours(), new Date(r.sold).getUTCFullYear()], ['2025-12-31', 18, 2025], 'Binance line 01/01/2026 00:30 (UTC+1): offset respected -> 12/31/2025 18:30 Eastern, year 2025'); }
// 4) The 1-year test follows the tax zone: bought 06/01/2024 22:00 Eastern (06/02 02:00 UTC), sold 06/02/2025 10:00 Eastern
const L = '2024-06-01 22:00,Buy,SOL,1,100,0\n2025-06-02 10:00,Sell,SOL,1,150,0\n';
eq([rows(L, NY, NY)[0].slice(0, 3), rows(L, NY, 'UTC')[0].slice(0, 3)], [['2024-06-01', '2025-06-02', 'long'], ['2024-06-02', '2025-06-02', 'short']], 'Anniversary depends on the tax zone: Eastern = long (day after the anniversary), UTC = short (same day)');
// 5) Daylight saving: bought 03/09/2024 23:30 EST, sold 03/09/2025 23:30 EST and 03/10/2025 00:30 EDT
eq([rows('2024-03-09 23:30,Buy,ADA,2,10,0\n2025-03-09 23:30,Sell,ADA,1,8,0\n2025-03-10 00:30,Sell,ADA,1,8,0\n', NY, NY).map(r => r[2])], [['short', 'long']], 'DST change: same date = short, next day = long');
// 6) Leap day (convention: anniversary of 02/29 = 03/01)
eq(rows('2024-02-29 12:00,Buy,DOT,2,10,0\n2025-03-01 12:00,Sell,DOT,1,8,0\n2025-03-02 12:00,Sell,DOT,1,8,0\n', NY, NY).map(r => r[2]), ['short', 'long'], 'Leap day 02/29/2024: sold 03/01/2025 short, 03/02/2025 long (to verify)');
// 7) Date-only rows are calendar days: never shifted, whatever the zones
eq([rows('2025-01-02,Buy,BTC,1,100,0\n2025-12-31,Sell,BTC,1,150,0\n', 'UTC', NY), rows('2025-01-02,Buy,BTC,1,100,0\n2025-12-31,Sell,BTC,1,150,0\n', NY, 'Pacific/Honolulu')], [[['2025-01-02', '2025-12-31', 'short', 2025]], [['2025-01-02', '2025-12-31', 'short', 2025]]], 'Date without time: stays 12/31/2025 (no move to 12/30)');
// 8) Amounts never change with the zone
eq(U.compute(U.fromCSVText(H + B).txs, { fileTz: NY, taxTz: NY }).rows.map(r => [r.proceeds, r.cost, r.gain]), [[150, 100, 50]], 'Amounts unchanged by the zone');
// 9) Labels: zone shown by name in the CSV, tab title in English for U.S.A.
{ const r = U.compute(U.fromCSVText(H + B).txs, { fileTz: NY, taxTz: NY }), fs = require('fs'), A = fs.readFileSync(__dirname + '/app.js', 'utf8');
  eq([/Tax dates \(b\), \(c\), tax year and 1-year test: Eastern \(America\/New_York\)/.test(U.toCSV(r)), /us0 \? 'Kryptax – Form 8949 & Schedule D for U\.S\. crypto taxes \(estimate\)' : (?:c \? \(?(?:ce \? 'Kryptax – Crypto capital gains in Canada[^']*' : )?'Kryptax – Gains en capital crypto au Canada[^']*'\)? : )?TITLE0/.test(A)], [true, true], 'CSV names the tax zone; U.S. tab title in English, France and U.K. keep the original title'); }
// 10) v2.52: no code hidden after a // comment in the region switch (the zzp comment had swallowed lang + tr(), so the U.S. header stayed French)
{ const A = require('fs').readFileSync(__dirname + '/app.js', 'utf8'), L = A.split('\n');
  eq([L.some(l => /\/\/.*tr\(u(?: \|\| ce)?, gl\)/.test(l)), L.some(l => /^\s*document\.documentElement\.lang = gl \? 'de' : u(?: \|\| ce)? \? 'en' : 'fr'; tr\(u(?: \|\| ce)?, gl\);/.test(l)), /\['header \.sub', 'Form 8949 & Schedule D for U\.S\. crypto taxes \(estimate\)'\]/.test(A)], [false, true, true], 'Region switch really calls tr() (U.S. header in English, France/Germany restored)'); }
console.log(ko ? ko + ' ÉCHEC(S)' : 'testustz : tout est OK'); process.exit(ko ? 1 : 0);
