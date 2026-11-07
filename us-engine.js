/* Kryptax — U.S.A. module v1 (separate from the French engine; engine.js / formats.js are only READ, never changed).
   Estimate of capital gains on digital assets for a U.S. individual, from a generic USD CSV, one wallet/account.
   Not tax advice. Rules used, with their sources (checked on irs.gov, see docs/US-RULES.md):
   - Digital assets are property; selling or exchanging them (including for another digital asset) is a taxable disposal:
     IRS Virtual Currency FAQs Q4, Q16-Q17 (https://www.irs.gov/individuals/international-taxpayers/frequently-asked-questions-on-virtual-currency-transactions)
     and Form 8949 instructions, Example 5 (https://www.irs.gov/instructions/i8949).
   - Basis = cost including fees, commissions and other acquisition costs: FAQ Q8; i8949 "Basis and Recordkeeping".
   - Net proceeds = gross proceeds minus selling expenses (no Form 1099-DA case): i8949 "Column (d)".
   - Basis of property received in an exchange = its fair market value: FAQ Q18 / Q21.
   - Holding period starts the day after acquisition and includes the disposal day; more than 1 year = long term: FAQ Q6, i8949 "Short-Term or Long-Term".
   - FIFO when units are not specifically identified: FAQ Q41; Treas. Reg. 1.1012-1(j)(3)(i) (quoted in Notice 2026-20, https://www.irs.gov/pub/irs-drop/n-26-20.pdf).
   - Digital asset rows go to Form 8949 boxes G/H/I (short) and J/K/L (long), not C/F: i8949 2025 "What's New".
   Lot methods: FIFO (default), HIFO, manual choice per sale (specific identification) — Treas. Reg. 1.1012-1(j), Notice 2026-20.
   Income (staking, rewards, airdrops, interest): USD value when received = ordinary income and cost basis of the new lot
   (Rev. Rul. 2023-14, FAQ Q24-Q25). No tax rate is applied. Not coded (shown as "to verify"): wash sales. */
(function (root) {
  'use strict';
  const E = typeof require !== 'undefined' && typeof module !== 'undefined' ? require('./engine.js') : root.KryptaxEngine;
  const KF = typeof require !== 'undefined' && typeof module !== 'undefined' ? require('./formats.js') : root.KryptaxFormats;
  const COLS = { // header synonyms (lower case, trimmed)
    date: ['date', 'time', 'timestamp', 'date (utc)', 'datetime'],
    type: ['type', 'side', 'transaction type', 'action'],
    asset: ['asset', 'symbol', 'coin', 'currency', 'crypto'],
    qty: ['quantity', 'qty', 'amount', 'units'],
    price: ['price', 'price usd', 'price (usd)', 'spot price', 'unit price', 'usd price'],
    total: ['total', 'total usd', 'total (usd)', 'value', 'value usd', 'value (usd)', 'subtotal', 'usd value', 'proceeds'],
    fee: ['fee', 'fees', 'fee usd', 'fee (usd)', 'fees (usd)', 'commission'],
    toAsset: ['received asset', 'to asset', 'asset received', 'buy asset'],
    toQty: ['received quantity', 'to quantity', 'quantity received', 'buy quantity'],
    wallet: ['wallet', 'platform', 'source', 'exchange', 'account', 'wallet / platform', 'from wallet'],
    toWallet: ['to wallet', 'destination', 'destination wallet', 'to account'],
    txid: ['txid', 'transaction id', 'tx id', 'trade id'] // v2.50: i8949 2025 column (a): include the sale transaction ID number, if available
  };
  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
  function mapHeader(head) {
    const h = head.map(norm), m = {};
    for (const k in COLS) { const i = h.findIndex(x => COLS[k].includes(x)); if (i > -1) m[k] = i; }
    return m;
  }
  function kind(t) {
    t = norm(t);
    if (/^(buy|purchase|bought|advanced trade buy)/.test(t)) return 'BUY';
    if (/^(sell|sold|sale|advanced trade sell)/.test(t)) return 'SELL';
    if (/convert|exchange|swap|trade/.test(t)) return 'CONVERT';
    if (/stak|reward|airdrop|interest|income|earn|mining|learn/.test(t)) return 'INCOME';
    if (/send|sent|withdraw|transfer out/.test(t)) return 'OUT';
    if (/receive|deposit|transfer in/.test(t)) return 'IN';
    if (/transfer/.test(t)) return 'TRANSFER';
    return null;
  }
  const num = v => { if (v == null || String(v).trim() === '') return NaN; const n = E.parseNum(String(v)); return isFinite(n) ? Math.abs(n) : NaN; };
  /* Header row = first of the first 25 rows where Date, Type, Asset and Quantity are recognised (CSV or Excel). */
  function headerIndex(rows) {
    for (let i = 0; i < Math.min(25, rows.length); i++) { const m = mapHeader(rows[i] || []); if (['date', 'type', 'asset', 'qty'].every(k => m[k] != null)) return i; }
    return 0;
  }
  /* v2.7: an explicit UTC marker at the end ("2025-01-10 14:00:00 UTC", "GMT", "Z", "+00:00", "+0000") is accepted and the time is read as written (UTC). */
  const UTC_SUFFIX = /\s*(?:UTC|GMT|Z|[+-]00:?00)$/i;
  /* Excel dates come as JS Date in local time (SheetJS cellDates): keep the calendar date/time as written, read as UTC. */
  const usDate = v => v instanceof Date ? Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), v.getHours(), v.getMinutes(), v.getSeconds())
    : typeof v === 'number' ? NaN : E.parseDate(String(v == null ? '' : v).trim().replace(UTC_SUFFIX, ''), 'MDY', 'UTC');
  /* rows: array of arrays (header found in the first 25 rows). Returns { txs, skipped, missingCols } */
  /* v2.0 platform exports, recognised only when the header matches a structure documented on the platform's official help pages:
     Kraken "Trades" export (support.kraken.com, "How to interpret Trades history fields"): txid, ordertxid, pair, time (UTC), type (buy/sell), price, cost (quote currency, fees NOT included), fee (quote currency), vol (base currency), margin.
     Only pairs quoted in USD and non-margin trades are converted; other rows are skipped and listed (to verify). */
  const KR_BASE = { XXBT: 'BTC', XBT: 'BTC', XXDG: 'DOGE', XDG: 'DOGE' };
  function krakenPair(p) {
    p = String(p || '').toUpperCase().replace(/[\/\s-]/g, ''); const m = /^(.+?)(ZUSD|USD)$/.exec(p); if (!m) return null;
    let b = m[1]; if (KR_BASE[b]) return KR_BASE[b]; if (m[2] === 'ZUSD' && b.length === 4 && b[0] === 'X') b = b.slice(1); return b || null;
  }
  /* v2.1 Form 1099-DA check (IRS Instructions for Form 1099-DA): box 1f = gross proceeds reduced by transaction costs; box 1g = cost basis (required only for covered securities, i.e. acquired after 2025 in the same custodial account); rewards and staking payments are not reported on it. */
  function daCompare(T, f1, g1) {
    const P = r2((T.short.proceeds || 0) + (T.long.proceeds || 0)), C = r2((T.short.cost || 0) + (T.long.cost || 0)), o = { proceeds: P, cost: C };
    if (isFinite(f1)) o.dProceeds = r2(P - f1); if (isFinite(g1)) o.dCost = r2(C - g1);
    o.flag = (isFinite(o.dProceeds) && Math.abs(o.dProceeds) >= 0.01) || (isFinite(o.dCost) && Math.abs(o.dCost) >= 0.01);
    return o;
  }
  function platformRows(rows) {
    for (let i = 0; i < Math.min(25, rows.length); i++) {
      const h = (rows[i] || []).map(norm), ix = k => h.indexOf(k);
      if (['txid', 'ordertxid', 'pair', 'time', 'type', 'price', 'cost', 'fee', 'vol'].every(k => ix(k) > -1)) {
        const out = [['Date', 'Type', 'Asset', 'Quantity', 'Total (USD)', 'Fee (USD)', 'Transaction ID']], skipped = [];
        rows.slice(i + 1).forEach((r, j) => {
          const line = i + j + 2, g = k => r[ix(k)], a = krakenPair(g('pair')), mg = ix('margin') > -1 ? num(g('margin')) : 0;
          if (!r.some(x => String(x).trim() !== '')) return;
          if (!a) { skipped.push({ line, why: 'pair not quoted in USD (' + String(g('pair')) + ')' }); out.push(['', '', '', '', '', '', '']); return; }
          if (mg > 0) { skipped.push({ line, why: 'margin trade (not handled)' }); out.push(['', '', '', '', '', '', '']); return; }
          out.push([String(g('time') || '').replace(/\.\d+$/, ''), g('type'), a, g('vol'), g('cost'), g('fee'), g('txid')]);
        });
        return { rows: out, skipped, platform: 'Kraken trades export', fileTz: 'UTC' };
      }
    }
    return null;
  }
  /* v2.41: Binance "Transaction History" (Operation / Coin / Change), read by the shared reader (formats.js binanceLedger), then mapped here.
     Only amounts in USD are used as USD. An amount in another currency (EUR, GBP...) is NOT converted in this mode: the USD value stays missing
     (to verify) and the original amount is quoted. USDT and other stablecoins are tokens, never taken as USD. Exchanges between tokens and rewards
     have no amount in the file: USD value missing, to verify. Times: UTC instant when the file gives its offset (tz: 'UTC'). */
  function fromBinance(B) {
    const out = { txs: [], skipped: B.skipped.slice(), missingCols: [], platform: B.platform, platformNote: 'binance', tzNote: B.tzNote };
    for (const e of B.events) {
      const t = { line: e.line, date: e.date, type: e.type, rawType: e.rawType, asset: e.asset, qty: e.qty, usd: NaN, fee: 0, toAsset: e.toAsset || '', toQty: e.toQty || NaN, wallet: '', toWallet: '' };
      if (e.tz) t.tz = e.tz;
      if (e.type === 'SPEND') t.type = 'SELL';
      if (e.type === 'AIRDROP') t.type = 'INCOME';
      if (e.type === 'TRANSFER') t.type = e.dir === 'in' ? 'IN' : 'OUT';
      if (e.type === 'BUY' || e.type === 'SELL' || e.type === 'SPEND') {
        if (e.cur === 'USD') { t.usd = e.amt; t.fee = e.feeAmt || e.feeCurAmt || 0; }
        else out.skipped.push({ line: e.line, why: 'amount of ' + (+e.amt).toFixed(2) + ' ' + e.cur + ' not converted to USD in this mode: USD value missing, to verify', kept: true });
        if (e.type === 'BUY' && e.feeQty > 0) { t.qty = Math.max(0, e.qty - e.feeQty); out.skipped.push({ line: e.line, why: 'fee paid in the token bought: quantity received net of the fee, fee not added to the basis - to verify', kept: true }); } }
      else if (e.type !== 'TRANSFER') out.skipped.push({ line: e.line, why: 'no USD value in the Binance file (exchange between tokens or reward): value missing, to verify', kept: true });
      if (t.qty > 0) out.txs.push(t);
    }
    if (!B.tz) out.skipped.push({ line: 'file', why: 'time zone not given in the Binance file: times read in the zone chosen in Options', kept: true });
    out.txs.sort((a, b) => a.date - b.date || String(a.line).localeCompare(String(b.line), 'en', { numeric: true }));
    return out;
  }
  function parseRows(rows, name) {
    { const B = KF.binanceLedger && KF.binanceLedger(rows, name); if (B) return fromBinance(B); }
    const P = platformRows(rows); if (P) { const o = parseRows(P.rows); o.skipped = P.skipped.concat(o.skipped.filter(x => !P.skipped.some(y => y.line === x.line))); o.platform = P.platform; o.fileTz = P.fileTz; return o; }
    const hi = headerIndex(rows), head = rows[hi] || [], m = mapHeader(head), out = { txs: [], skipped: [], missingCols: ['date', 'type', 'asset', 'qty'].filter(k => m[k] == null) };
    if (out.missingCols.length) return out;
    { const amt = ['total', 'price', 'fee'].filter(k => m[k] != null && !/usd|\$/.test(norm(head[m[k]]))); // v2.50: no silent currency assumption
      if (amt.length) out.skipped.push({ line: 'file', why: 'column ' + amt.map(k => '"' + String(head[m[k]]).trim() + '"').join(', ') + ' has no currency in its name: amounts read as USD - to verify (convert any other currency to USD yourself, with the rate of each date)', kept: true }); }
    rows.slice(hi + 1).forEach((r, i) => {
      const g = k => m[k] == null ? '' : r[m[k]];
      const line = hi + i + 2, type = kind(g('type')), date = usDate(g('date'));
      const asset = String(g('asset') || '').trim().toUpperCase(), qty = num(g('qty'));
      if (!type || !isFinite(date) || !asset || !(qty > 0)) { if (r.some(x => String(x).trim() !== '')) out.skipped.push({ line, why: !type ? 'unknown type' : !isFinite(date) ? 'unreadable date' : 'missing asset or quantity' }); return; }
      const price = num(g('price')), total0 = num(g('total')), fee = num(g('fee'));
      const total = isFinite(total0) ? total0 : isFinite(price) ? price * qty : NaN;
      out.txs.push({ line, date, type, rawType: String(g('type') || ''), asset, qty, usd: total, fee: isFinite(fee) ? fee : 0, toAsset: String(g('toAsset') || '').trim().toUpperCase(), toQty: num(g('toQty')), wallet: String(g('wallet') || '').trim(), toWallet: String(g('toWallet') || '').trim(), txid: String(g('txid') || '').trim().slice(0, 64) });
    });
    out.txs.sort((a, b) => a.date - b.date || a.line - b.line);
    return out;
  }
  /* Excel (.xlsx/.xls) through the SheetJS already shipped (xlsx.mini.min.js): first sheet that has a recognised header. */
  function fromWorkbook(X, data, name) {
    const wb = X.read(data, { cellDates: true });
    let best = null;
    for (const n of wb.SheetNames) {
      const rows = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }); if (!rows.length) continue;
      const p = parseRows(rows, name); if (!p.missingCols.length) return p; if (!best) best = p;
    }
    return best || { txs: [], skipped: [], missingCols: ['date', 'type', 'asset', 'qty'] };
  }
  /* PDF statement in USD — BEST EFFORT, to verify. Text lines (same pdf.js, isEvalSupported:false) of the form:
     DATE TYPE ASSET QUANTITY $TOTAL [$FEE] [-> QTY ASSET]   e.g. "01/10/2025 Sell BTC 0.5 $35,000.00 $25.00"
     Lines that do not match are ignored; if no line matches, nothing is computed (never an invented result). */
  const PDF_RX = /^(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})(?:[ ,]+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)?\s+(buy|purchase|sell|sale|convert|exchange|swap|staking reward|reward|airdrop|interest|send|receive|deposit|withdrawal)\s+([A-Z0-9]{2,10})\s+([\d,]*\.?\d+)\s+\$\s?([\d,]*\.?\d+)(?:\s+\$\s?([\d,]*\.?\d+))?(?:\s+(?:→|->|to)\s+([\d,]*\.?\d+)\s+([A-Z0-9]{2,10}))?\s*$/i;
  function fromPdfLines(lines) {
    { const B = KF.binancePdfRows && KF.binancePdfRows(lines); if (B) { const o = parseRows(B, ''); o.pdf = true; if (B.info.unread) o.skipped.push({ line: 'PDF', why: B.info.unread + ' Binance operation line(s) in the PDF could not be read, to verify' }); return o; } } /* v2.42: Binance PDF statement = same reading as its CSV */
    const rows = [['Date', 'Type', 'Asset', 'Quantity', 'Total (USD)', 'Fee (USD)', 'Received Asset', 'Received Quantity']];
    for (const l of lines) { const m = String(l).replace(/\s+/g, ' ').trim().match(PDF_RX); if (m) rows.push([m[1], m[2], m[3], m[4], m[5], m[6] || '', m[8] || '', m[7] || '']); }
    const p = parseRows(rows); p.matched = rows.length - 1; return p;
  }
  /* Time zones (v1.8): file times are wall-clock times in the file's zone; tax dates are calendar days in the taxpayer's zone (this browser). No network: Intl only. */
  const US_TZ = [['America/New_York', 'Eastern'], ['America/Chicago', 'Central'], ['America/Denver', 'Mountain'], ['America/Los_Angeles', 'Pacific'], ['America/Anchorage', 'Alaska'], ['Pacific/Honolulu', 'Hawaii'], ['UTC', 'UTC']];
  /* v2.51 tax calendar zone (dates (b)/(c), tax year, 1-year holding test) — never the browser zone by default.
     IRS texts give calendar dates ("begin counting on the day after you received the property", i8949) but no time-zone rule for an
     individual: Kryptax uses the U.S. zone you choose ("Tax dates"), by default the zone of the file when it is a U.S. zone, else the
     browser zone when it is a U.S. zone, else Eastern (America/New_York). Shown on screen and in every export, to verify. */
  const US_ZONES = US_TZ.map(z => z[0]).filter(z => z !== 'UTC');
  function resolveTaxTz(choice, fileTz, browserTz) {
    if (choice && US_TZ.some(z => z[0] === choice)) return { tz: choice, how: 'chosen' };
    if (US_ZONES.includes(fileTz)) return { tz: fileTz, how: 'same as the file' };
    if (US_ZONES.includes(browserTz)) return { tz: browserTz, how: 'this browser' };
    return { tz: 'America/New_York', how: 'default (Eastern)' };
  }
  const tzName = z => { const f = US_TZ.find(x => x[0] === z); return f ? (z === 'UTC' ? 'UTC' : f[1] + ' (' + z + ')') : z; };
  const tzFmt = {};
  function tzOffset(zone, inst) { // wall-clock (as UTC ms) minus instant, in ms
    if (!zone || zone === 'UTC') return 0;
    const f = tzFmt[zone] || (tzFmt[zone] = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    const P = {}; f.formatToParts(new Date(inst)).forEach(x => { P[x.type] = +x.value; });
    return Date.UTC(P.year, P.month - 1, P.day, P.hour % 24, P.minute, P.second) - Math.floor(inst / 1000) * 1000;
  }
  function shiftTz(w, from, to) { // wall time in `from` -> wall time in `to`
    if (!isFinite(w) || (from || 'UTC') === (to || 'UTC')) return w;
    let i = w - tzOffset(from, w); i = w - tzOffset(from, i);
    return i + tzOffset(to, i);
  }
  /* Long term = sold strictly after the 1-year anniversary of the acquisition date (calendar days, UTC). */
  function isLong(acq, sold) {
    const a = new Date(acq), s = new Date(sold), anniv = Date.UTC(a.getUTCFullYear() + 1, a.getUTCMonth(), a.getUTCDate());
    const sd = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
    return sd > anniv;
  }
  const r2 = v => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
  /* FIFO per wallet (Rev. Proc. 2024-28 and Treas. Reg. 1.1012-1(j): units are tracked wallet by wallet / account by account;
     https://www.irs.gov/pub/irs-drop/rp-24-28.pdf). Without a Wallet column, everything is one wallet (same as before).
     Transfers between your own wallets are not taxable (FAQ Q38): the lots move with their original acquisition date and cost.
     A send (OUT) is paired with a receive (IN) of the same asset, within 3 days, received quantity between 98% and 100%.
     Unpaired transfers are never ignored: they are listed "to verify".
     A row whose basis or proceeds is unknown is flagged "to verify" and left out of the totals. */
  const PAIR_MS = 3 * 864e5, PAIR_MIN = 0.98;
  function pairTransfers(txs) {
    const ins = txs.filter(t => t.type === 'IN'), used = new Set(), pairs = new Map();
    for (const o of txs.filter(t => t.type === 'OUT')) {
      let best = null;
      for (const i of ins) {
        if (used.has(i) || i.asset !== o.asset || Math.abs(i.date - o.date) > PAIR_MS || i.qty > o.qty * (1 + 1e-9) || i.qty < o.qty * PAIR_MIN) continue;
        if (o.wallet && i.wallet && o.wallet === i.wallet) continue;
        if (!best || Math.abs(i.date - o.date) < Math.abs(best.date - o.date)) best = i;
      }
      if (best) { used.add(best); pairs.set(o, best); }
    }
    return { pairs, used };
  }
  /* Lot methods (Treas. Reg. 1.1012-1(j)(3), cited in Notice 2026-20, https://www.irs.gov/pub/irs-drop/n-26-20.pdf):
     - FIFO: default when units are not adequately identified (1.1012-1(j)(3)(i)).
     - HIFO: highest unit cost first; the regulation treats such a method as a standing order (1.1012-1(j)(3)(ii)).
     - MANUAL: the user picks a lot (specific identification) per sale; the rest of the sale uses FIFO.
     Adequate identification must exist no later than the time of sale (records) — to verify; Kryptax cannot check it.
     Notice 2026-20 extends the Notice 2025-7 relief for making an adequate identification through December 31, 2026. */
  /* Income label. Sources (irs.gov):
     - Rev. Rul. 2023-14 (https://www.irs.gov/pub/irs-drop/rr-23-14.pdf): staking rewards = fair market value included in gross income
       in the year the taxpayer gains dominion and control; value determined at that date and time.
     - FAQ Q24-Q25 (https://www.irs.gov/individuals/international-taxpayers/frequently-asked-questions-on-virtual-currency-transactions):
       airdrop after a hard fork = ordinary income at fair market value when received; basis = that income.
     - Interest / other rewards: no specific IRS text checked here — to verify. */
  function incomeType(raw) {
    const t = String(raw || '').toLowerCase();
    return /stak/.test(t) ? 'Staking' : /airdrop/.test(t) ? 'Airdrop' : /reward|mining|learn/.test(t) ? 'Reward' : /interest|earn/.test(t) ? 'Interest' : 'Income';
  }
  /* v2.8 network fees paid in the transferred asset (sent quantity above received quantity). Tax treatment not settled — to verify.
     IGNORE (default, same results as before v2.8): the fee units leave the wallet, their cost basis is removed (shown in the result).
     DISPOSE: the fee units are a sale: one Form 8949 line, proceeds = USD value of the fee from the file (Fee column, else the line's Total
       pro rata), basis = actual lots taken by the lot method, term by holding period. No USD value in the file: line "to verify", out of the totals.
     CAPITALIZE: the cost basis of the fee units is added to the units received, pro rata, original acquisition dates kept; no Form 8949 line. */
  const FEE_MODES = { IGNORE: 'Ignore (fee units removed, basis not used)', DISPOSE: 'Dispose (fee units treated as a sale)', CAPITALIZE: 'Capitalize (fee basis added to the units received)' };
  /* result block (also used to explain the option in the exports) */
  function feeLine(F) {
    if (!F || !(F.count || F.usdOnly)) return '';
    const n = F.count + ' transfer' + (F.count === 1 ? '' : 's') + ' with network fee units';
    const what = F.mode === 'DISPOSE' ? 'cost basis ' + usd(F.basis) + ' used in the network fee lines (Form 8949, to verify)'
      : F.mode === 'CAPITALIZE' ? 'cost basis ' + usd(F.capitalized) + ' added to the units received' + (F.removed ? '; ' + usd(F.removed) + ' removed (no received lot with a known basis)' : '')
      : 'cost basis removed: ' + usd(F.removed) + ' (not used anywhere)';
    return (F.count ? n + ' (option ' + F.mode + '): ' + what + (F.unknown ? '; ' + F.unknown + ' with units of unknown basis' : '') + (F.mode === 'DISPOSE' && F.noUsd ? '; ' + F.noUsd + ' without a USD value in the file (to verify, not in the totals)' : '') : 'Network fees (option ' + F.mode + ')')
      + (F.usdOnly ? '. ' + F.usdOnly + ' fee' + (F.usdOnly > 1 ? 's' : '') + ' in USD without a fee quantity: not computed, to verify' : '') + '. Tax treatment not settled — to verify.';
  }
  const feeBlock = F => { const l = feeLine(F); return l ? `<p class="warn usfees">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>` : ''; };
  /* v2.13 wording: 26 U.S.C. 1091(a) covers losses on "shares of stock or securities" (30 days before/after, substantially identical);
     the text neither names nor excludes crypto (uscode.house.gov, law.cornell.edu, checked 2026-11-01). No IRS crypto source cited (not verified).
     v2.10 possible wash sales: a flag only, no amount changed. A sale line with a loss and an acquisition of the same asset
     (Buy, or asset received in an exchange) dated within 30 days before or after the sale date (tax dates). The lot sold itself
     (same acquisition date as a loss part of that sale) is not counted. Whether the rule applies to crypto is to verify. */
  const WASH_DAYS = 30;
  function washFlags(rows, txs) {
    const out = [], by = new Map();
    for (const r of rows) if (!r.fee && r.gain != null && r.gain < 0) { const o = by.get(r.line) || { line: r.line, asset: r.asset, sold: r.sold, loss: 0, acq: new Set() }; o.loss = r2(o.loss + r.gain); o.acq.add(r.acquired); by.set(r.line, o); }
    for (const o of by.values()) {
      const buys = txs.filter(t => t.line !== o.line && isFinite(t.date) && ((t.type === 'BUY' && t.asset === o.asset) || (t.type === 'CONVERT' && t.toAsset === o.asset && t.toQty > 0))
        && Math.abs(Math.round((t.date - o.sold) / 86400000)) <= WASH_DAYS && !o.acq.has(t.date)).map(t => ({ line: t.line, date: t.date }));
      if (buys.length) out.push({ line: o.line, asset: o.asset, sold: o.sold, loss: o.loss, buys,
        msg: `Possible wash sale pattern, line ${o.line}: ${o.asset} sold at a loss (${usd(o.loss)}) and the same asset bought within ${WASH_DAYS} days before or after (line${buys.length > 1 ? 's' : ''} ${buys.map(b => b.line).join(', ')}). 26 U.S.C. section 1091 applies to stock or securities; no verified IRS rule extends it to regular crypto assets, and a token that is legally a security could be covered. Not applied in the totals — to verify.` });
    }
    return out;
  }
  function feeTotals(ev, mode, usdOnly) {
    return { mode, count: ev.length, basis: r2(ev.reduce((a, e) => a + e.basis, 0)), capitalized: r2(ev.reduce((a, e) => a + e.capitalized, 0)),
      removed: r2(ev.reduce((a, e) => a + (mode === 'IGNORE' || e.lost ? e.basis : 0), 0)), unknown: ev.filter(e => e.unknown).length, noUsd: ev.filter(e => e.usd == null).length, usdOnly: usdOnly || 0 };
  }
  function compute(txs, opts) {
    opts = opts || {};
    if (opts.fileTz || opts.taxTz) txs = txs.map(t => Object.assign({}, t, { date: !t.tz && t.date % 864e5 === 0 ? t.date : shiftTz(t.date, t.tz || opts.fileTz || 'UTC', opts.taxTz || 'UTC') })); /* v2.51: a date without a time (00:00:00) is a calendar day: kept as is, never moved to the previous/next day */ /* v2.41: t.tz = 'UTC' when the instant is known (Binance offset) */
    const manualCost = opts.manualCost || {}, method = opts.method === 'HIFO' ? 'HIFO' : opts.method === 'MANUAL' ? 'MANUAL' : 'FIFO', picks = opts.picks || {}, sales = [];
    const unit = l => isFinite(l.cost) && l.qty > 0 ? l.cost / l.qty : -Infinity;
    const nextIdx = L => { if (method !== 'HIFO') return 0; let b = 0; for (let i = 1; i < L.length; i++) if (unit(L[i]) > unit(L[b]) + 1e-9) b = i; return b; };
    const lots = {}, rows = [], notes = [], income = [], key = (w, a) => (w || '') + '|' + a, wallets = new Set();
    const add = (w, asset, qty, cost, date, line) => { wallets.add(w || ''); const lot = { qty, cost, date, line }; (lots[key(w, asset)] = lots[key(w, asset)] || []).push(lot); return lot; };
    /* v2.8 cost-basis ledger (finite amounts only): in = sold + remaining + removed. Capitalized basis stays in "remaining" (it moved into other lots). */
    const feeMode = FEE_MODES[opts.fees] ? opts.fees : 'IGNORE', fin = v => isFinite(v) ? v : 0;
    const basis = { in: 0, sold: 0, remaining: 0, removedFees: 0, removedUnpaired: 0, capitalized: 0 }, feeEvents = [];
    const addNew = (w, asset, qty, cost, date, line) => { basis.in += fin(cost); return add(w, asset, qty, cost, date, line); };
    /* Units that leave a wallet in a transfer without arriving (network fee paid in the asset): handled by the chosen option.
       pieces = the fee units with their own lot cost/date (lot method order); recv = lots created at the destination. */
    const feeUnits = (t, feeQty, pieces, recv) => {
      const known = pieces.reduce((a, p) => a + fin(p.cost), 0), unknown = pieces.some(p => !isFinite(p.cost));
      const feeUsd = t.fee > 0 ? t.fee : isFinite(t.usd) ? t.usd * feeQty / t.qty : NaN, ev = { line: t.line, date: t.date, asset: t.asset, qty: feeQty, basis: known, unknown, usd: isFinite(feeUsd) ? feeUsd : null, mode: feeMode, capitalized: 0 };
      if (feeMode === 'DISPOSE') {
        for (const p of pieces) {
          const pr = isFinite(feeUsd) ? feeUsd * p.qty / feeQty : NaN;
          const row = { line: t.line, desc: (+p.qty.toPrecision(10)) + ' ' + t.asset + ' network fee (to verify)', asset: t.asset, wallet: t.wallet || '', qty: p.qty, acquired: p.none ? null : p.date, sold: t.date,
            proceeds: r2(pr), cost: r2(p.cost), gain: isFinite(pr) && isFinite(p.cost) ? r2(pr - p.cost) : null, term: p.none ? null : (isLong(p.date, t.date) ? 'long' : 'short'), convert: false, fee: true, status: 'ok' };
          if (p.none) row.status = 'to verify: network fee units not found in the wallet (missing cost basis)';
          else if (!isFinite(p.cost)) row.status = 'to verify: purchase price unknown (missing cost basis)';
          else if (!isFinite(pr)) row.status = 'to verify: USD value of the network fee not in the file';
          basis.sold += fin(p.cost); rows.push(row);
        }
      } else if (feeMode === 'CAPITALIZE') {
        const R0 = recv.filter(l => isFinite(l.cost)), q = R0.reduce((a, l) => a + l.qty, 0);
        if (q > 0 && known) { for (const l of R0) l.cost += known * l.qty / q; basis.capitalized += known; ev.capitalized = known; }
        else if (known) { basis.removedFees += known; ev.lost = true; }
      } else basis.removedFees += known;
      feeEvents.push(ev);
      return ev;
    };
    const feeNote = (t, gap) => feeMode === 'DISPOSE' ? ` — option DISPOSE: the ${+gap.toPrecision(10)} ${t.asset} are treated as a sale (network fee, to verify)` : feeMode === 'CAPITALIZE' ? ` — option CAPITALIZE: their cost basis is added to the units received (to verify)` : '';
    /* splits the pieces taken from the sending wallet: first `moved` units go to the destination, the rest are fee units */
    const moveAndFee = (t, r, toW, moved, dateIn, lineIn) => {
      const recv = [], feeP = []; let m = moved;
      for (const p of r.pieces) { const q = Math.min(p.qty, m); if (q > 1e-12) recv.push(add(toW, t.asset, q, isFinite(p.cost) ? p.cost * q / p.qty : NaN, p.date, p.line)); m -= q;
        const rest = p.qty - Math.max(q, 0); if (rest > 1e-12) feeP.push({ qty: rest, cost: isFinite(p.cost) ? p.cost * rest / p.qty : NaN, date: p.date, line: p.line }); }
      if (m > 1e-12) add(toW, t.asset, m, NaN, dateIn, lineIn);
      const gap = t.qty - moved, found = feeP.reduce((a, p) => a + p.qty, 0);
      if (gap > 1e-12 && gap - found > 1e-12) feeP.push({ qty: gap - found, cost: NaN, date: null, none: true });
      return gap > 1e-12 ? feeUnits(t, gap, feeP, recv) : null;
    };
    /* takes qty units FIFO from a wallet; returns the pieces [{qty, cost, date}] and the quantity not found */
    const take = (w, asset, qty) => {
      const L = lots[key(w, asset)] || [], out = []; let left = qty;
      while (left > 1e-12 && L.length) {
        const ix = nextIdx(L), lot = L[ix], q = Math.min(lot.qty, left), c = isFinite(lot.cost) ? lot.cost * q / lot.qty : NaN;
        out.push({ qty: q, cost: c, date: lot.date, line: lot.line });
        lot.cost = isFinite(lot.cost) ? lot.cost - c : lot.cost; lot.qty -= q; if (lot.qty <= 1e-12) L.splice(ix, 1); left -= q;
      }
      return { pieces: out, missing: left > 1e-12 ? left : 0 };
    };
    const { pairs, used } = pairTransfers(txs), transfers = { paired: 0, toVerify: 0 }, feeUsdOnly = [];
    for (const t of txs) {
      if (t.wallet) wallets.add(t.wallet);
      if (t.type === 'BUY') addNew(t.wallet, t.asset, t.qty, isFinite(t.usd) ? t.usd + t.fee : NaN, t.date, t.line);
      else if (t.type === 'INCOME') { income.push(t); addNew(t.wallet, t.asset, t.qty, isFinite(t.usd) ? t.usd : NaN, t.date, t.line); }
      else if (t.type === 'OUT' && pairs.has(t)) {
        const i = pairs.get(t), r = take(t.wallet, t.asset, t.qty), gap = t.qty - i.qty; transfers.paired++;
        moveAndFee(t, r, i.wallet, i.qty, i.date, i.line); // received units keep their original date and cost; the rest = network fee units (v2.8 option)
        notes.push({ line: t.line, kind: 'transfer', ok: true, msg: `Transfer ${+t.qty.toPrecision(10)} ${t.asset}${t.wallet || i.wallet ? ' from ' + (t.wallet || '?') + ' to ' + (i.wallet || '?') : ''} (lines ${t.line} → ${i.line}): not taxable, original dates and cost kept.` });
        if (r.missing > 1e-12) notes.push({ line: t.line, kind: 'transfer', msg: `Transfer line ${t.line}: ${+r.missing.toPrecision(10)} ${t.asset} sent but not found in ${t.wallet || 'the wallet'} (missing cost basis, to verify).` });
        if (gap <= 1e-12 && t.fee > 0) feeUsdOnly.push(t.line);
        if (gap > 1e-12 || t.fee > 0) notes.push({ line: t.line, kind: 'transfer', msg: `Network fee on transfer line ${t.line}${gap > 1e-12 ? ': ' + (+gap.toPrecision(10)) + ' ' + t.asset + ' not received' : ''}${t.fee > 0 ? ' ($' + t.fee.toFixed(2) + ')' : ''} — tax treatment to verify${feeMode === 'IGNORE' ? ' (not counted as a sale here)' : feeNote(t, gap)}.` });
      } else if (t.type === 'OUT' || t.type === 'TRANSFER') {
        if (t.type === 'TRANSFER' && t.toWallet && t.toWallet !== t.wallet) { // one-line transfer with a destination wallet
          const r = take(t.wallet, t.asset, t.qty), gap1 = t.toQty > 0 && t.toQty < t.qty * (1 - 1e-9) ? t.qty - t.toQty : 0; transfers.paired++;
          if (!gap1) { for (const p of r.pieces) add(t.toWallet, t.asset, p.qty, p.cost, p.date, p.line);
            if (r.missing > 1e-12) add(t.toWallet, t.asset, r.missing, NaN, t.date, t.line); }
          else { moveAndFee(t, r, t.toWallet, t.qty - gap1, t.date, t.line); // v2.8: Received Quantity below Quantity = network fee units
            notes.push({ line: t.line, kind: 'transfer', msg: `Network fee on transfer line ${t.line}: ${+gap1.toPrecision(10)} ${t.asset} not received — tax treatment to verify${feeMode === 'IGNORE' ? ' (not counted as a sale here)' : feeNote(t, gap1)}.` }); }
          notes.push({ line: t.line, kind: 'transfer', ok: true, msg: `Transfer ${+t.qty.toPrecision(10)} ${t.asset} from ${t.wallet || '?'} to ${t.toWallet} (line ${t.line}): not taxable, original dates and cost kept.` });
          if (t.fee > 0 && !gap1) notes.push({ line: t.line, kind: 'transfer', msg: `Network fee on transfer line ${t.line} ($${t.fee.toFixed(2)}) — tax treatment to verify.${feeMode === 'IGNORE' ? '' : ' Fee in USD without a fee quantity: not computed.'}` });
        } else { // unpaired send: units leave the wallet, no gain computed, flagged
          const r = take(t.wallet, t.asset, t.qty); transfers.toVerify++; basis.removedUnpaired += r.pieces.reduce((a, p) => a + fin(p.cost), 0);
          notes.push({ line: t.line, kind: 'transfer', msg: `Line ${t.line}: ${+t.qty.toPrecision(10)} ${t.asset} sent${t.wallet ? ' from ' + t.wallet : ''} with no matching receive — own wallet, gift or payment? To verify (no gain computed).` });
        }
      } else if (t.type === 'IN') {
        if (used.has(t)) continue; // handled with its send
        transfers.toVerify++; add(t.wallet, t.asset, t.qty, NaN, t.date, t.line);
        notes.push({ line: t.line, kind: 'transfer', msg: `Line ${t.line}: ${+t.qty.toPrecision(10)} ${t.asset} received${t.wallet ? ' in ' + t.wallet : ''} with no matching send — original date and cost unknown, to verify.` });
      }
      else if (t.type === 'SELL' || t.type === 'CONVERT') {
        const proceeds = isFinite(t.usd) ? t.usd - t.fee : NaN, avail = (lots[key(t.wallet, t.asset)] || []).map(l => ({ line: l.line, date: l.date, qty: l.qty, unit: isFinite(l.cost) ? l.cost / l.qty : NaN }));
        sales.push({ line: t.line, wallet: t.wallet || '', asset: t.asset, qty: t.qty, date: t.date, lots: avail });
        let r = { pieces: [], missing: t.qty }, short = 0; const pk = method === 'MANUAL' && picks[t.line];
        if (pk && pk.qty > 0) { // specific identification: take from the chosen lot(s) first
          const L = lots[key(t.wallet, t.asset)] || []; let want = Math.min(pk.qty, t.qty), got = 0;
          for (let i = 0; i < L.length && want - got > 1e-12; i++) { const lot = L[i]; if (lot.line !== pk.lot) continue;
            const q = Math.min(lot.qty, want - got), c = isFinite(lot.cost) ? lot.cost * q / lot.qty : NaN;
            r.pieces.push({ qty: q, cost: c, date: lot.date, line: lot.line, picked: true }); lot.cost = isFinite(lot.cost) ? lot.cost - c : lot.cost; lot.qty -= q; got += q; if (lot.qty <= 1e-12) { L.splice(i, 1); i--; } }
          short = want - got > 1e-12 ? want - got : 0;
          const rest = take(t.wallet, t.asset, t.qty - got); r.pieces = r.pieces.concat(rest.pieces.map(x => Object.assign(x, { fallback: short > 0 }))); r.missing = rest.missing;
          if (short) notes.push({ line: t.line, kind: 'lots', msg: `Sale line ${t.line}: the chosen lot (line ${pk.lot}) has only ${+(want - short).toPrecision(10)} ${t.asset} left in this wallet; ${+short.toPrecision(10)} taken by FIFO instead — to verify.` });
        } else r = take(t.wallet, t.asset, t.qty);
        basis.sold += r.pieces.reduce((a, p) => a + fin(p.cost), 0);
        const pieces = r.pieces.concat(r.missing > 1e-12 ? [{ qty: r.missing, cost: NaN, date: null, none: true }] : []);
        for (const p of pieces) {
          const q = p.qty, pr = isFinite(proceeds) ? proceeds * q / t.qty : NaN, cost = p.cost;
          const row = { line: t.line, desc: (+q.toPrecision(10)) + ' ' + t.asset + (t.txid ? ' (ID ' + t.txid + ')' : ''), asset: t.asset, wallet: t.wallet || '', qty: q, acquired: p.none ? null : p.date, sold: t.date,
            proceeds: r2(pr), cost: r2(cost), gain: isFinite(pr) && isFinite(cost) ? r2(pr - cost) : null, term: p.none ? null : (isLong(p.date, t.date) ? 'long' : 'short'),
            convert: t.type === 'CONVERT', status: 'ok' };
          if (p.fallback) row.status = 'to verify: not enough units in the chosen lot (FIFO used for the rest)';
          const mc = p.none && manualCost[t.line];
          if (mc && isFinite(mc.cost) && mc.cost >= 0 && isFinite(mc.date) && mc.date <= t.date) { // v1.9: cost and date acquired entered by the user for the missing units
            row.acquired = mc.date; row.cost = r2(mc.cost); row.gain = isFinite(pr) ? r2(pr - mc.cost) : null; row.term = isLong(mc.date, t.date) ? 'long' : 'short'; row.user = true;
            if (!isFinite(pr)) row.status = 'to verify: USD value of the sale unknown';
          } else if (p.none) row.status = 'to verify: no purchase found for these units (missing cost basis)';
          else if (!isFinite(cost)) row.status = 'to verify: purchase price unknown (missing cost basis)';
          else if (!isFinite(pr)) row.status = 'to verify: USD value of the sale unknown';
          rows.push(row);
        }
        if (t.type === 'CONVERT') { // the asset received is acquired at its fair market value = USD value of the exchange (FAQ Q18)
          if (t.toAsset && t.toQty > 0) addNew(t.wallet, t.toAsset, t.toQty, isFinite(t.usd) ? t.usd : NaN, t.date, t.line);
          else notes.push({ line: t.line, msg: 'Exchange without received asset/quantity: the new lot is missing (to verify).' });
        }
      }
    }
    const ok = rows.filter(r => r.status === 'ok'), sum = (L, k) => r2(L.reduce((a, r) => a + r[k], 0));
    const S = ok.filter(r => r.term === 'short'), Lg = ok.filter(r => r.term === 'long');
    const totals = { sales: new Set(rows.map(r => r.line)).size, rows: rows.length, toVerify: rows.length - ok.length,
      short: { proceeds: sum(S, 'proceeds'), cost: sum(S, 'cost'), gain: sum(S, 'gain') }, long: { proceeds: sum(Lg, 'proceeds'), cost: sum(Lg, 'cost'), gain: sum(Lg, 'gain') } };
    totals.gain = r2(totals.short.gain + totals.long.gain);
    totals.income = { count: income.length, usd: r2(income.reduce((a, t) => a + (isFinite(t.usd) ? t.usd : 0), 0)), unknown: income.filter(t => !isFinite(t.usd)).length };
    const incomeRows = income.map(t => ({ line: t.line, date: t.date, asset: t.asset, qty: t.qty, usd: isFinite(t.usd) ? r2(t.usd) : null, type: incomeType(t.rawType), wallet: t.wallet || '',
      status: isFinite(t.usd) ? 'ok' : 'to verify: USD value when received is missing (not in the total)' }));
    if (opts.fileTz || opts.taxTz) totals.tz = { file: opts.fileTz || 'UTC', tax: opts.taxTz || 'UTC' };
    totals.transfers = transfers; totals.method = method; wallets.delete(''); totals.wallets = [...wallets];
    for (const k in lots) for (const l of lots[k]) basis.remaining += fin(l.cost);
    totals.basis = basis; totals.fees = feeTotals(feeEvents, feeMode, feeUsdOnly.length + txs.filter(t => t.type === 'TRANSFER' && t.toWallet && t.toWallet !== t.wallet && t.fee > 0 && !(t.toQty > 0 && t.toQty < t.qty * (1 - 1e-9))).length);
    return { rows, totals, notes, sales, income: incomeRows, feeEvents, wash: washFlags(rows, txs) };
  }
  /* Tax year view: sales by the year of the sale date, income by the year received (UTC dates, like mdy; your local date may differ — to verify). */
  function years(res) { return [...new Set(res.rows.map(r => new Date(r.sold).getUTCFullYear()).concat(res.income.map(r => new Date(r.date).getUTCFullYear())))].filter(isFinite).sort(); }
  function barData(full, res) { // v2.19: per year = forYear(...).totals.gain; per asset = sum of the gain of the "ok" lines (same lines as the totals)
    const years = full ? [...new Set(full.rows.map(r => new Date(r.sold).getUTCFullYear()))].filter(isFinite).sort().map(y => ({ k: String(y), v: forYear(full, y).totals.gain })) : [], g = new Map();
    res.rows.filter(r => r.status === 'ok').forEach(r => g.set(r.asset, (g.get(r.asset) || 0) + r.gain));
    return { years, assets: [...g].map(([k, v]) => ({ k, v: r2(v) })).sort((a, b) => b.v - a.v) };
  }
  function forYear(res, y) {
    if (!y) return res;
    const inY = t => t != null && new Date(t).getUTCFullYear() === y, rows = res.rows.filter(r => inY(r.sold)), income = res.income.filter(r => inY(r.date));
    const ok = rows.filter(r => r.status === 'ok'), sum = (L, k) => r2(L.reduce((a, r) => a + r[k], 0)), S = ok.filter(r => r.term === 'short'), Lg = ok.filter(r => r.term === 'long');
    const totals = Object.assign({}, res.totals, { year: y, sales: new Set(rows.map(r => r.line)).size, rows: rows.length, toVerify: rows.length - ok.length,
      short: { proceeds: sum(S, 'proceeds'), cost: sum(S, 'cost'), gain: sum(S, 'gain') }, long: { proceeds: sum(Lg, 'proceeds'), cost: sum(Lg, 'cost'), gain: sum(Lg, 'gain') },
      income: { count: income.length, usd: r2(income.reduce((a, r) => a + (r.usd == null ? 0 : r.usd), 0)), unknown: income.filter(r => r.usd == null).length } });
    totals.gain = r2(totals.short.gain + totals.long.gain);
    const lines = new Set(rows.map(r => r.line)), fe = (res.feeEvents || []).filter(e => inY(e.date));
    if (res.totals.fees) totals.fees = feeTotals(fe, res.totals.fees.mode, res.totals.fees.usdOnly);
    return Object.assign({}, res, { rows, income, totals, feeEvents: fe, wash: (res.wash || []).filter(w => inY(w.sold)), sales: res.sales.filter(x => lines.has(x.line)) });
  }
  /* v2.15 export file names: prefix_YYYY-MM-DD_HH-MM.ext (local time of the browser, to the minute, like the France mode).
     A name already given in this session gets a short suffix (_2, _3...), only in that case: never the same name twice. */
  const p2 = n => String(n).padStart(2, '0'), usedNames = new Set();
  const stampName = (prefix, ext, d) => { d = d || new Date(); const b = prefix + '_' + d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '_' + p2(d.getHours()) + '-' + p2(d.getMinutes());
    let n = b + '.' + ext, k = 2; while (usedNames.has(n)) n = b + '_' + (k++) + '.' + ext; usedNames.add(n); return n; };
  const mdy = t => { if (t == null) return 'unknown'; const d = new Date(t); return String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + String(d.getUTCDate()).padStart(2, '0') + '/' + d.getUTCFullYear(); };
  const usd = v => v == null ? 'to verify' : (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  /* CSV of 8949-style lines (columns a, b, c, d, e, h + term/box hint + status) */
  /* v2.2 Form 8949 layout (IRS Instructions for Form 8949, 2025; Schedule D (Form 1040) 2025). Digital assets use boxes G/H/I (Part I, short term)
     and J/K/L (Part II, long term), never A-F. G/J: Form 1099-DA with basis reported to the IRS; H/K: Form 1099-DA without basis or basis not
     reported; I/L: no Form 1099-DA. Totals go to Schedule D lines 1b/2/3 (Part I) and 8b/9/10 (Part II). Columns (f) and (g) are left blank. */
  const CAT = { basis: ['G', 'J'], nobasis: ['H', 'K'], none: ['I', 'L'] }, SCHD = { G: '1b', H: '2', I: '3', J: '8b', K: '9', L: '10', A: '1b', B: '2', C: '3', D: '8b', E: '9', F: '10' };
  /* v2.50 boxes by FORM EDITION (tax year of the sale), checked 2026-11-07 on irs.gov:
     - 2024 and earlier: Form 8949 (2024) has only boxes A/B/C (Part I) and D/E/F (Part II); there is no Form 1099-DA. A digital asset sale not
       reported on a Form 1099-B goes in box C / F (https://www.irs.gov/pub/irs-prior/f8949--2024.pdf, https://www.irs.gov/pub/irs-prior/i8949--2024.pdf).
       Kryptax maps "basis reported" -> A/D and "basis not reported" -> B/E only as Form 1099-B situations (to verify).
     - 2025 (final form) and 2026 (DRAFT, not for filing, created 4/1/26): boxes G/H/I and J/K/L for digital assets, never C/F
       (https://www.irs.gov/instructions/i8949, https://www.irs.gov/pub/irs-dft/f8949--dft.pdf). Schedule D lines are the same (1b/2/3, 8b/9/10).
     "All years" mixing both editions: no single box, choose a tax year (to verify). */
  const CAT24 = { basis: ['A', 'D'], nobasis: ['B', 'E'], none: ['C', 'F'] };
  const yearOf = t => t == null ? NaN : new Date(t).getUTCFullYear();
  function edition(res) { // '2024' (A-F) | '2025' (G-L) | 'mixed'
    const y = res.totals && res.totals.year; if (y) return y <= 2024 ? '2024' : '2025';
    const Y = res.rows.map(r => yearOf(r.sold)).filter(isFinite); if (!Y.length) return '2025';
    const a = Y.some(v => v <= 2024), b = Y.some(v => v >= 2025); return a && b ? 'mixed' : a ? '2024' : '2025';
  }
  const ED_NOTE = { '2024': 'Form 8949 for 2024 and earlier: boxes A-F only (no Form 1099-DA before 2025); digital assets without a Form 1099-B: box C (short) / F (long).',
    '2025': 'Form 8949 for 2025 (final) and 2026 (IRS draft, not final): digital assets use boxes G/H/I (short) and J/K/L (long), never C/F.',
    mixed: 'This view mixes sales up to 2024 (Form 8949 boxes A-F) and from 2025 (boxes G-L): choose one tax year to get the box letters.' };
  function form8949(res, cat) {
    const ed = edition(res), tbl = ed === '2024' ? CAT24 : CAT, bx = ed !== 'mixed' && tbl[cat] || null, ok = res.rows.filter(r => r.status === 'ok' && r.term);
    const ask = ed === '2024' ? ['A, B or C', 'D, E or F'] : ed === 'mixed' ? ['A-C (to 2024) or G-I (from 2025)', 'D-F (to 2024) or J-L (from 2025)'] : ['G, H or I', 'J, K or L'];
    const part = (term, i) => {
      const box = bx ? bx[i] : null, lines = ok.filter(r => r.term === term), sum = k => r2(lines.reduce((t, r) => t + (r[k] || 0), 0));
      return { part: i ? 'II' : 'I', title: i ? 'Part II - Long-term (held more than 1 year)' : 'Part I - Short-term (held 1 year or less)', box, ask: ask[i],
        boxText: box || (ask[i] + ' - to verify'), scheduleD: box ? 'Schedule D line ' + SCHD[box] : (i ? 'Schedule D line 8b, 9 or 10 - to verify' : 'Schedule D line 1b, 2 or 3 - to verify'),
        lines, totals: { d: sum('proceeds'), e: sum('cost'), g: null, h: sum('gain') } };
    };
    return { cat: bx ? cat : null, edition: ed, editionNote: ED_NOTE[ed], parts: [part('short', 0), part('long', 1)], toVerify: res.rows.filter(r => r.status !== 'ok' || !r.term) };
  }
  const CATNOTE = { basis: 'Form 1099-DA received, basis reported to the IRS', nobasis: 'Form 1099-DA received, basis not shown or not reported to the IRS', none: 'No Form 1099-DA received' };
  const CATNOTE24 = { basis: 'Form 1099-B received, basis reported to the IRS (no Form 1099-DA before 2025) - to verify', nobasis: 'Form 1099-B received, basis not shown or not reported to the IRS (no Form 1099-DA before 2025) - to verify', none: 'No Form 1099-B received (no Form 1099-DA before 2025)' };
  const catNote = F => (F.edition === '2024' ? CATNOTE24 : CATNOTE)[F.cat];
  /* v2.6 report layout shared by the CSV and the .xlsx export: one grid, money in the same columns everywhere
     ((d) col 3, (e) col 4, (f) col 5, (g) col 6, (h) col 7, note col 8, wallet col 9). Rows: {k: kind, c: cells}; money cells are numbers. */
  const METHOD_TXT = { FIFO: 'FIFO (first in, first out)', HIFO: 'HIFO (highest cost first)', MANUAL: 'Manual choice per sale (to verify)' };
  function usReport(res, opts) {
    opts = opts || {};
    const F = form8949(res, opts.cat), T = res.totals, hasW = res.rows.some(r => r.wallet), W = hasW ? 10 : 9, out = [];
    const row = (k, c) => { c = c.slice(); while (c.length < W) c.push(''); out.push({ k, c }); }, blank = () => out.push({ k: 'blank', c: Array(W).fill('') });
    const head = ['(a) Description of property', '(b) Date acquired', '(c) Date sold or disposed of', '(d) Proceeds (sales price)', '(e) Cost or other basis', '(f) Code(s)', '(g) Amount of adjustment', '(h) Gain or (loss)', 'Note'].concat(hasW ? ['Wallet'] : []);
    const line = (r, note) => [r.desc, mdy(r.acquired), mdy(r.sold), r.proceeds, r.cost, '', null, r.gain, note].concat(hasW ? [r.wallet || ''] : []);
    row('title', ['Kryptax - U.S. summary (estimate) - Draft to verify - not tax advice']);
    row('kv', ['Tax year', T.year ? String(T.year) : 'All years']);
    if (T.tz) row('kv', ['Time zones', 'File: ' + T.tz.file, 'Tax dates (b), (c), tax year and 1-year test: ' + tzName(T.tz.tax) + ' (to verify)']);
    row('kv', ['Lot method', METHOD_TXT[T.method] || METHOD_TXT.FIFO]);
    row('kv', ['Network fees on transfers', FEE_MODES[(T.fees || {}).mode] || FEE_MODES.IGNORE, 'Tax treatment not settled - to verify']);
    if (T.fees && feeLine(T.fees)) row('kv', ['Network fees', feeLine(T.fees).replace(/ — /g, ' - ')]);
    row('kv', ['Form 8949 situation', catNote(F) || 'not chosen - to verify']);
    row('kv', ['Form 8949 edition', F.editionNote]);
    row('kv', ['Sales', T.sales + ' (' + T.rows + ' lines' + (T.toVerify ? ', ' + T.toVerify + ' to verify' : '') + ')']);
    if (F.cat && F.cat !== 'none') row('kv', ['With a Form 1099-DA', 'Columns (d) and (e) should match the form; corrections go in (f) and (g) - to verify']);
    for (const P of F.parts) {
      blank(); row('section', ['FORM 8949 ' + P.title.toUpperCase() + ' - BOX ' + P.boxText]); row('head', head);
      for (const r of P.lines) row('row', line(r, r.user ? 'cost and date acquired entered by you (to verify)' : ''));
      if (!P.lines.length) row('row', ['No sale in this part']);
      row('total', ['TOTAL ' + (P.part === 'I' ? 'PART I' : 'PART II') + ' -> ' + P.scheduleD, '', '', P.totals.d, P.totals.e, '', null, P.totals.h]);
    }
    const CK = checks(res, opts);
    if (CK.length) {
      blank(); row('section', ['TO VERIFY (' + CK.length + ')']); for (const c of CK) row('tv', [c.msg.replace(/ — /g, ' - ')]);
      if (F.toVerify.length) { row('head', head); for (const r of F.toVerify) row('tv', line(r, r.status)); }
    }
    const SD = scheduleD(res, opts.cat, opts.carry, opts.fstat);
    if (opts.fstat !== undefined || SD.n16 < 0) row('kv', ['Filing status (line 21)', FSTAT[opts.fstat || ''] || FSTAT[''], 'to verify']);
    blank(); row('section', ['SCHEDULE D (FORM 1040) - DRAFT - ' + SD.warn]);
    row('head', ['Line', 'Description', '', '(d) Proceeds', '(e) Cost', '', '(g) Adjustments', '(h) Gain or (loss)', 'Note']);
    for (const l of SD.lines) row(l.nc ? 'nc' : (['7', '15', '16'].includes(l.line) ? 'total' : 'row'), ['Line ' + l.line, l.desc, '', l.d, l.e, '', l.g, l.answer || l.h, l.note]);
    const D = daLines(res, opts.da);
    if (D) { blank(); row('section', ['FORM 1099-DA COMPARISON (totals you entered) - to verify']); row('head', ['Item', '', '', 'Form 1099-DA', 'Kryptax', '', '', 'Difference', 'Note']);
      for (const l of D.lines) row(l.flag ? 'tv' : 'row', [l.label, '', '', l.form, l.mine, '', null, l.diff, l.flag ? 'to verify' : 'matches']); row('note', [D.note]); }
    const K = carryLines(res, opts.carry);
    if (K) { blank(); row('section', ['CAPITAL LOSS CARRYOVER (amounts you entered) - to verify']); row('head', ['Item', '', '', '', '', '', '', 'Amount', '']);
      row('row', ['Schedule D line 6 - short-term carryover', '', '', null, null, '', null, -K.s]); row('total', ['Net short-term, this file + carryover', '', '', null, null, '', null, K.net7, 'Schedule D line 7 if no other items']);
      row('row', ['Schedule D line 14 - long-term carryover', '', '', null, null, '', null, -K.l]); row('total', ['Net long-term, this file + carryover', '', '', null, null, '', null, K.net15, 'Schedule D line 15 if no other items']); row('note', [K.note]); }
    blank(); row('note', ['Estimate - not tax advice - to be verified - state taxes not included. Sources: IRS Instructions for Form 8949 and for Schedule D (Form 1040).']);
    return { rows: out, width: W, money: [3, 4, 6, 7] };
  }
  /* Cellule CSV : un texte importé commençant par = + @ (ou - non numérique) est préfixé d'une apostrophe (pas de formule tableur). Montants inchangés. */
  const csvSafe = (s => /^(?:[=+@\t\r]|-(?![\d.]|$))/.test(s) ? "'" + s : s);
  function toCSV(res, opts) {
    const R = usReport(res, opts), q = v => { const s = csvSafe(String(v)); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const cell = (v, i) => typeof v === 'number' ? v.toFixed(2) : v == null ? '' : String(v);
    return R.rows.map(r => r.c.map((v, i) => q(cell(v, i))).join(',')).join('\n') + '\n';
  }
  /* .xlsx with the SheetJS build already shipped (xlsx.mini.min.js, Community edition): column widths and $ number formats.
     That edition does not write bold or colours. Sheet 1 = same layout as the CSV, sheet 2 = flat Form 8949 data. */
  function toXLSX(XL, res, opts) {
    const R = usReport(res, opts), FMT = '$#,##0.00;-$#,##0.00', ws = XL.utils.aoa_to_sheet(R.rows.map(r => r.c.map(v => v == null ? '' : v)));
    R.rows.forEach((r, y) => r.c.forEach((v, x) => { if (typeof v === 'number') { const a = XL.utils.encode_cell({ r: y, c: x }); if (ws[a]) ws[a].z = FMT; } }));
    ws['!cols'] = [44, 14, 14, 16, 16, 9, 14, 16, 46, 18].slice(0, R.width).map(wch => ({ wch }));
    const F = form8949(res, (opts || {}).cat), hasW = res.rows.some(r => r.wallet);
    const data = [['Part', 'Box', '(a) Description', '(b) Date acquired', '(c) Date sold', '(d) Proceeds', '(e) Cost or other basis', '(f) Code(s)', '(g) Adjustment', '(h) Gain or (loss)', 'Status'].concat(hasW ? ['Wallet'] : [])];
    for (const P of F.parts) for (const r of P.lines) data.push([P.part, P.box || 'to verify', r.desc, mdy(r.acquired), mdy(r.sold), r.proceeds, r.cost, '', '', r.gain, r.user ? 'entered by you (to verify)' : 'ok'].concat(hasW ? [r.wallet || ''] : []));
    for (const r of F.toVerify) data.push(['', '', r.desc, mdy(r.acquired), mdy(r.sold), r.proceeds == null ? '' : r.proceeds, r.cost == null ? '' : r.cost, '', '', r.gain == null ? '' : r.gain, r.status].concat(hasW ? [r.wallet || ''] : []));
    const ws2 = XL.utils.aoa_to_sheet(data);
    data.forEach((r, y) => r.forEach((v, x) => { if (y && typeof v === 'number') ws2[XL.utils.encode_cell({ r: y, c: x })].z = FMT; }));
    ws2['!cols'] = [6, 10, 30, 14, 14, 14, 14, 9, 12, 14, 40, 18].slice(0, data[0].length).map(wch => ({ wch }));
    const wb = XL.utils.book_new(); XL.utils.book_append_sheet(wb, ws, 'Summary'); XL.utils.book_append_sheet(wb, ws2, 'Form 8949 data'); return wb;
  }
  /* 1099-DA comparison lines, only when the user typed a total (box 1f and/or 1g). */
  const DANOTE = 'Box 1f is proceeds after transaction costs. Box 1g may be blank for noncovered assets (bought before 2026 or moved in). Rewards and staking are not on Form 1099-DA. Sales to verify are not in the Kryptax totals. A difference does not mean an error - to verify. Source: IRS Instructions for Form 1099-DA.';
  /* v2.4 capital loss carryover (Instructions for Schedule D (Form 1040) 2025, Capital Loss Carryover Worksheet - Lines 6 and 14):
     the user types the amounts from that worksheet (line 8 -> Schedule D line 6, line 13 -> line 14). Kryptax only adds them to its Part totals;
     no worksheet, no $3,000 limit (line 21) and no tax computed. */
  function carryLines(res, c) {
    if (!c || (!isFinite(c.s) && !isFinite(c.l))) return null;
    const T = res.totals, s = isFinite(c.s) ? Math.abs(c.s) : 0, l = isFinite(c.l) ? Math.abs(c.l) : 0;
    return { s, l, net7: r2((T.short.gain || 0) - s), net15: r2((T.long.gain || 0) - l),
      note: 'Carryover amounts typed by you from the Capital Loss Carryover Worksheet (Instructions for Schedule D). Net amounts include only the sales in this file: if you have other capital gains or losses, Schedule D lines 7 and 15 differ - to verify. No loss limit and no tax computed.' };
  }
  /* v2.5 Schedule D (Form 1040) 2025 draft. Only lines that are plain sums of Kryptax data: 1b/2/3 and 8b/9/10 = Form 8949 Part totals
     (box G/H/I -> 1b/2/3, J/K/L -> 8b/9/10), 6 and 14 = carryover typed by the user, 7 = lines 1a-6, 15 = lines 8a-14, 16 = 7 + 15,
     17 = "are lines 15 and 16 both gains". Lines 1a/8a (Exception 1), 4, 5, 11-13 and 18-22 are not computed. */
  const SD_NC = 'not computed by Kryptax';
  /* v2.9 capital loss limit (Schedule D line 21). IRS Topic no. 409 (irs.gov/taxtopics/tc409, checked 2026-11-01): the loss you can claim is
     the lesser of $3,000 ($1,500 if married filing separately) or the net loss on Schedule D line 16; the rest can be carried forward
     (Capital Loss Carryover Worksheet). Kryptax only sees the sales in this file: to verify. */
  const LOSS_LIMIT = { other: 3000, mfs: 1500 };
  const FSTAT = { '': 'Not chosen - to verify', other: 'Single, married filing jointly, head of household or qualifying surviving spouse ($3,000)', mfs: 'Married filing separately ($1,500)' };
  function lossLimit(n16, fstat) {
    const lim = LOSS_LIMIT[fstat];
    if (!(n16 < 0)) return null;
    if (!lim) return { h: null, rest: null, note: 'choose the filing status - to verify' };
    const h = -Math.min(-n16, lim), rest = r2(-n16 + h);
    return { h, rest, lim, note: 'smaller of the line 16 loss or ' + usd(-lim) + (rest > 0 ? '; ' + usd(rest) + ' left to carry over (Capital Loss Carryover Worksheet)' : '') + ' - from this file only, to verify' };
  }
  function scheduleD(res, cat, carry, fstat) {
    const F = form8949(res, cat), K = carryLines(res, carry), L = [], sh = F.parts[0], lg = F.parts[1];
    const nc = (line, desc, why) => L.push({ line, desc, nc: true, note: why || SD_NC });
    const tot = (line, desc, P) => L.push({ line, desc, d: P.totals.d, e: P.totals.e, g: null, h: P.totals.h, note: P.box ? '' : 'box not chosen - to verify' });
    const pick = (P, lines, descs) => { const i = P.box ? { G: 0, H: 1, I: 2, J: 0, K: 1, L: 2 }[P.box] : -1;
      lines.forEach((ln, j) => { if (i === j) tot(ln, descs[j], P); else if (i < 0 && j === 0) tot(lines.join(' / '), descs[0].replace(/ with box \w\/\w/, '') + ' (choose the box)', P); else if (i >= 0) L.push({ line: ln, desc: descs[j], d: null, e: null, g: null, h: null, note: 'none in this file' }); }); };
    nc('1a', 'Short-term totals reported directly (Exception 1)', 'not used: all sales listed on Form 8949');
    pick(sh, ['1b', '2', '3'], ['Form 8949 totals with box A/G', 'Form 8949 totals with box B/H', 'Form 8949 totals with box C/I']);
    /* v2.10 lines 4, 5, 11, 12, 13 grouped in one line (numbers checked on Schedule D (Form 1040) 2025, irs.gov/pub/irs-pdf/f1040sd.pdf, 2026-11-01) */
    nc('4, 5, 11-13', 'Other gains (Forms 4797, 2439, 6252, 4684, 6781, 8824, Schedule K-1, capital gain distributions)', 'not computed by Kryptax - leave blank if you only have crypto');
    L.push({ line: '6', desc: 'Short-term capital loss carryover', h: K && isFinite(carry.s) ? -K.s : null, note: K && isFinite(carry.s) ? 'entered by you - to verify' : 'none entered' });
    const n7 = r2((sh.totals.h || 0) - (K ? K.s : 0)), n15 = r2((lg.totals.h || 0) - (K ? K.l : 0)), n16 = r2(n7 + n15);
    L.push({ line: '7', desc: 'Net short-term capital gain or (loss)', h: n7, note: 'lines 1a-6 from Kryptax only - to verify' });
    nc('8a', 'Long-term totals reported directly (Exception 1)', 'not used: all sales listed on Form 8949');
    pick(lg, ['8b', '9', '10'], ['Form 8949 totals with box D/J', 'Form 8949 totals with box E/K', 'Form 8949 totals with box F/L']);
    L.push({ line: '14', desc: 'Long-term capital loss carryover', h: K && isFinite(carry.l) ? -K.l : null, note: K && isFinite(carry.l) ? 'entered by you - to verify' : 'none entered' });
    L.push({ line: '15', desc: 'Net long-term capital gain or (loss)', h: n15, note: 'lines 8a-14 from Kryptax only - to verify' });
    L.push({ line: '16', desc: 'Combine lines 7 and 15', h: n16, note: n16 > 0 ? 'gain: Form 1040 line 7a - to verify' : n16 < 0 ? 'loss: skip lines 17-20, see line 21' : 'zero: skip lines 17-21' });
    L.push({ line: '17', desc: 'Are lines 15 and 16 both gains?', answer: n16 > 0 ? (n15 > 0 ? 'Yes' : 'No') : null, note: n16 > 0 ? 'to verify' : 'skipped (line 16 is not a gain)' });
    nc('18', '28% Rate Gain Worksheet amount'); nc('19', 'Unrecaptured Section 1250 Gain Worksheet amount'); nc('20', 'Lines 18 and 19 zero or blank? (tax worksheet)');
    const LL = lossLimit(n16, fstat);
    if (LL && LL.h != null) L.push({ line: '21', desc: 'Capital loss allowed (' + (fstat === 'mfs' ? 'married filing separately' : 'filing status chosen') + ')', h: LL.h, rest: LL.rest, note: LL.note });
    else nc('21', 'Capital loss allowed (limit depends on filing status)', LL ? LL.note : (n16 < 0 ? SD_NC : 'skipped (line 16 is not a loss)')); nc('22', 'Qualified dividends? (tax worksheet)');
    return { lines: L, cat: F.cat, n7, n15, n16, lossLimit: LL, fstat: fstat || '', title: 'Schedule D (Form 1040) - draft', warn: 'Draft to verify - not tax advice' };
  }
  function daLines(res, d) {
    if (!d || (!isFinite(d.p) && !isFinite(d.b))) return null;
    const o = daCompare(res.totals, d.p, d.b), lines = [];
    if (isFinite(d.p)) lines.push({ label: 'Proceeds (box 1f)', form: d.p, mine: o.proceeds, diff: o.dProceeds, flag: Math.abs(o.dProceeds) >= 0.01 });
    if (isFinite(d.b)) lines.push({ label: 'Cost basis (box 1g)', form: d.b, mine: o.cost, diff: o.dCost, flag: Math.abs(o.dCost) >= 0.01 });
    return { lines, flag: o.flag, note: DANOTE };
  }
  function incomeCSV(res) {
    const q = v => { const s = csvSafe(String(v)); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }, hasW = res.income.some(r => r.wallet);
    const head = ['Date received', 'Asset', 'Quantity', 'Value USD (ordinary income - to verify)', 'Type', 'Status'].concat(hasW ? ['Wallet'] : []);
    const L = res.income.map(r => [mdy(r.date), r.asset, +r.qty.toPrecision(12), r.usd == null ? '' : r.usd.toFixed(2), r.type, r.status].concat(hasW ? [r.wallet] : []));
    return [head].concat(L).map(r => r.map(q).join(',')).join('\n') + '\n';
  }
  /* v2.12 guided result: what to copy and where. Only amounts already computed (form8949 + scheduleD + income total), nothing new. */
  function guide(res, opts) {
    opts = opts || {}; const F = form8949(res, opts.cat), SD = scheduleD(res, opts.cat, opts.carry, opts.fstat), T = res.totals, I = T.income || {};
    const l21 = SD.lines.find(l => l.line === '21' && !l.nc);
    return { chosen: !!F.cat, parts: F.parts.map(P => ({ part: P.part, term: P.part === 'I' ? 'short-term' : 'long-term', box: P.box, boxText: P.box || P.ask,
        sdLine: P.box ? SCHD[P.box] : (P.part === 'I' ? '1b, 2 or 3' : '8b, 9 or 10'), n: P.lines.length, d: P.totals.d, e: P.totals.e, h: P.totals.h })),
      edition: F.edition, editionNote: F.editionNote, n7: SD.n7, n15: SD.n15, n16: SD.n16, loss: SD.n16 < 0, fstat: opts.fstat || '', l21: l21 ? { h: l21.h, rest: l21.rest } : null,
      income: I.count ? { usd: I.usd, n: I.count, unknown: I.unknown } : null };
  }
  /* v2.12 single "to verify" list: every point to check, deduplicated, sorted by importance (1 = not in the totals ... 5 = records), each one short with its line. */
  function checks(res, opts) {
    opts = opts || {}; const T = res.totals, L = [], seen = new Set(), add = (rank, line, msg) => { if (!seen.has(msg)) { seen.add(msg); L.push({ rank, line, msg }); } };
    for (const r of res.rows) if (r.status !== 'ok') add(1, r.line, `Line ${r.line}: ${r.status.replace(/^to verify:\s*/, '')} — not in the totals.`);
      else if (!r.term) add(1, r.line, `Line ${r.line}: holding period unknown — not in the totals.`);
    for (const r of res.income || []) if (r.usd == null) add(1, r.line, `Line ${r.line}: income without a USD value — not in the income total.`);
    if (T.sales && !CAT[opts.cat]) add(2, null, 'Form 8949 box not chosen — choose it in Options at the top.');
    if (opts.fstat !== undefined && !LOSS_LIMIT[opts.fstat] && scheduleD(res, opts.cat, opts.carry, opts.fstat).n16 < 0) add(2, null, 'Net loss: filing status not chosen (Schedule D line 21) — choose it in Options at the top.');
    for (const w of res.wash || []) add(3, w.line, w.msg);
    for (const n of res.notes || []) if (!n.ok) add(3, n.line, n.msg);
    if (T.fees && T.fees.usdOnly) add(3, null, `${T.fees.usdOnly} network fee${T.fees.usdOnly > 1 ? 's' : ''} in USD without a fee quantity: not computed — to verify.`);
    for (const r of res.rows) if (r.user) add(4, r.line, `Line ${r.line}: cost and date acquired entered by you — to verify.`);
    if (T.method && T.method !== 'FIFO') add(5, null, 'HIFO or manual choice: specific identification needs records at the time of sale — to verify.');
    return L.map((c, i) => Object.assign(c, { i })).sort((a, b) => a.rank - b.rank || (a.line == null ? -1 : b.line == null ? 1 : a.line - b.line) || a.i - b.i).map(({ rank, line, msg }) => ({ rank, line, msg }));
  }
  function fromCSVText(input, name) { const rows = Array.from(KF.parseCSV(input)); return parseRows(rows, name); }
  /* v2.15 option choices kept in this browser (localStorage only): lot method, Form 8949 box, fee option, filing status, time zone of the file dates.
     Manual lot picks per sale, the year and the amounts entered are not saved (they depend on the file).
     Never file data, transactions or amounts. Invalid or unreadable values are ignored (defaults used). */
  const SET_KEY = 'kryptax.us.settings', SET_OK = { method: ['FIFO', 'HIFO', 'MANUAL'], cat: ['', 'none', 'nobasis', 'basis'], fees: Object.keys(FEE_MODES), fstat: Object.keys(FSTAT), tz: US_TZ.map(z => z[0]), taxTz: US_TZ.map(z => z[0]) };
  const pickSettings = v => { const o = {}; if (v && typeof v === 'object') for (const k in SET_OK) if (typeof v[k] === 'string' && SET_OK[k].includes(v[k])) o[k] = v[k]; return o; };
  const loadSettings = st => { try { return pickSettings(JSON.parse(st.getItem(SET_KEY))); } catch (e) { return {}; } };
  const saveSettings = (st, v) => { try { st.setItem(SET_KEY, JSON.stringify(pickSettings(v))); return true; } catch (e) { return false; } };
  const clearSettings = st => { try { st.removeItem(SET_KEY); return true; } catch (e) { return false; } };
  /* v2.17 "To verify (N)" on screen: same points and order as checks(), grouped by importance under short headings, "Line N" in bold at the start. */
  const CHK_GRP = { 1: 'Not in your totals', 2: 'Choose / confirm', 3: 'Possible issues', 4: 'Entered by you / methods', 5: 'Entered by you / methods' };
  function checksBlock(C) {
    const e = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const li = c => { const m = /^(Line \d+): ([\s\S]*)$/.exec(c.msg); return '<li>' + (m ? '<b>' + e(m[1]) + '</b>: ' + e(m[2]) : e(c.msg)) + '</li>'; };
    let h = '', g = null; for (const c of C) { if (CHK_GRP[c.rank] !== g) { h += (g ? '</ul>' : '') + '<p class="uschk-h">' + e(CHK_GRP[c.rank]) + '</p><ul>'; g = CHK_GRP[c.rank]; } h += li(c); }
    return `<div class="warn uschecks"><b>To verify (${C.length})</b>${h}</ul></div>`;
  }
  const api = { resolveTaxTz, tzName, csvSafe, catNote, edition, CAT24, stampName, checksBlock, CHK_GRP, SET_KEY, loadSettings, saveSettings, clearSettings, LOSS_LIMIT, FSTAT, lossLimit, FEE_MODES, feeLine, US_TZ, tzOffset, shiftTz, years, forYear, barData, pairTransfers, mapHeader, kind, headerIndex, parseRows, fromCSVText, fromWorkbook, fromPdfLines, compute, isLong, toCSV, incomeCSV, incomeType, mdy, usd, daCompare, form8949, CATNOTE, daLines, carryLines, scheduleD, usReport, toXLSX, guide, checks };

  /* ---------- U.S.A. page (browser only) ---------- */
  function mount(doc) {
    const box = doc.getElementById('usmode'); if (!box || box.dataset.ready) return; box.dataset.ready = '1';
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const inp = doc.getElementById('usfile'), out = doc.getElementById('usresult'); if (!inp || !out) return;
    const W0 = typeof window !== 'undefined' ? window : root;
    let last = null, cur = null, pdfN = '', method = 'FIFO', fees = 'IGNORE', picks = {}, year = null, mcost = {}, da = {}, cat = '', fstat = '', carry = {};
    let LS = null; try { LS = W0.localStorage || null; } catch (x) {}
    if (LS) { const S = loadSettings(LS); if (S.method) method = S.method; if (S.fees) fees = S.fees; if (S.cat != null) cat = S.cat; if (S.fstat != null) fstat = S.fstat; }
    let taxChoice = ''; const keepSet = () => { if (LS) saveSettings(LS, { method, fees, cat, fstat, tz: fileTz, taxTz: taxChoice }); };
    let browserTz = 'UTC'; try { browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (x) {}
    const taxTzNow = () => resolveTaxTz(taxChoice, fileTz, browserTz); // v2.51: tax dates no longer follow the browser zone
    let fileTz = browserTz; const taxTz = browserTz; const tzSel = doc.getElementById('ustz');
    if (tzSel) { const L = US_TZ.some(z => z[0] === taxTz) ? US_TZ : [[taxTz, 'This browser']].concat(US_TZ);
      tzSel.innerHTML = L.map(z => `<option value="${esc(z[0])}"${z[0] === fileTz ? ' selected' : ''}>${esc(z[1] === 'UTC' ? 'UTC' : z[1] + ' (' + z[0] + ')')}</option>`).join('');
      tzSel.addEventListener('change', () => { fileTz = tzSel.value; keepSet(); if (cur) render(); }); }
    if (LS) { const z = loadSettings(LS).tz; if (z) { fileTz = z; if (tzSel) tzSel.value = z; } }
    const taxSel = doc.getElementById('ustaxtz');
    if (taxSel) { if (LS) taxChoice = loadSettings(LS).taxTz || '';
      const draw = () => { const r = taxTzNow(); taxSel.innerHTML = `<option value="">Automatic: ${esc(tzName(r.tz))}${taxChoice ? '' : ' — ' + esc(r.how)}</option>` + US_TZ.map(z => `<option value="${esc(z[0])}"${z[0] === taxChoice ? ' selected' : ''}>${esc(tzName(z[0]))}</option>`).join(''); taxSel.value = taxChoice; };
      draw(); taxSel.addEventListener('change', () => { taxChoice = taxSel.value; keepSet(); draw(); if (cur) render(); });
      if (tzSel) tzSel.addEventListener('change', draw); taxSel.__draw = draw; }
    const lotLabel = l => `line ${l.line} · ${mdy(l.date)} · ${+l.qty.toPrecision(8)} left · ${isFinite(l.unit) ? usd(l.unit) + '/unit' : 'cost unknown'}`;
    function manualHtml(res) {
      if (!res.sales.length) return '';
      return '<div class="grid">' + res.sales.map(sl => { const pk = picks[sl.line] || {};
        return `<label>Sale line ${sl.line}: ${esc(+sl.qty.toPrecision(10) + ' ' + sl.asset)} on ${mdy(sl.date)}${sl.wallet ? ' (' + esc(sl.wallet) + ')' : ''}<select class="uspick" data-line="${sl.line}"><option value="">Default (FIFO)</option>${sl.lots.map(l => `<option value="${l.line}"${pk.lot === l.line ? ' selected' : ''}>${esc(lotLabel(l))}</option>`).join('')}</select></label>`
          + `<label>Quantity from this lot<input class="usqty" data-line="${sl.line}" inputmode="decimal" value="${pk.lot ? esc(String(pk.qty)) : ''}" placeholder="${esc(String(+sl.qty.toPrecision(10)))}"></label>`; }).join('') + '</div>';
    }
    out.addEventListener('change', e => {
      const t = e.target; if (!cur) return;
      if (t.classList.contains('uscl')) { const v = parseFloat(String(t.value || '').replace(/[$,()\s-]/g, '')), k = (year || 'all') + t.dataset.k; if (isFinite(v)) carry[k] = v; else delete carry[k]; render(); return; }
      if (t.classList.contains('usda')) { const v = parseFloat(String(t.value || '').replace(/[$,\s]/g, '')), k = (year || 'all') + t.dataset.k; if (isFinite(v)) da[k] = v; else delete da[k]; render(); return; }
      if (t.classList.contains('usmc') || t.classList.contains('usmd')) {
        const line = +t.dataset.line, c = out.querySelector('.usmc[data-line="' + line + '"]'), d = out.querySelector('.usmd[data-line="' + line + '"]');
        const cost = parseFloat(String(c && c.value || '').replace(/[$,\s]/g, '')), dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d && d.value || '');
        if (isFinite(cost) && cost >= 0 && dm) mcost[line] = { cost, date: Date.UTC(+dm[1], +dm[2] - 1, +dm[3], 12) }; else { delete mcost[line]; return; }
        render(); return;
      }
      if (t.id === 'usyear') { year = +t.value || 0; render(); return; }
      if (t.classList.contains('uspick') || t.classList.contains('usqty')) {
        const line = +t.dataset.line, sel = out.querySelector('.uspick[data-line="' + line + '"]'), qi = out.querySelector('.usqty[data-line="' + line + '"]');
        const sale = last.sales.find(x => x.line === line), lot = sel && sel.value ? +sel.value : 0;
        if (!lot) delete picks[line]; else { const q = parseFloat(String(qi && qi.value || '').replace(',', '.')); picks[line] = { lot, qty: q > 0 ? q : sale.qty }; }
        render();
      }
    });
    { const hb = doc.getElementById('ushelpbtn'), hp = doc.getElementById('ushelppanel'); if (hb && hp) hb.addEventListener('click', () => { const op = hp.hidden; hp.hidden = !op; hb.setAttribute('aria-expanded', String(op)); if (op) hp.scrollIntoView({ block: 'nearest' }); }); }
    { const rb = doc.getElementById('usreset'); if (rb) rb.addEventListener('click', () => { const w = typeof window !== 'undefined' ? window : root;
      if (!w.confirm('Reset everything? The imported files and the results on this page will be cleared.')) return; cur = last = null; picks = {}; mcost = {}; da = {}; year = null; method = 'FIFO'; fees = 'IGNORE'; fstat = ''; cat = ''; drawOpts(); if (LS) clearSettings(LS); pdfN = ''; inp.value = ''; out.innerHTML = ''; files.length = 0; fmsg.innerHTML = ''; dirtyFiles(); side.innerHTML = ''; }); }
    const zone = doc.getElementById('usimp'); let depth = 0; // drag & drop: same path as « Choose a file »
    if (zone) { const off = () => { depth = 0; zone.classList.remove('dropover'); }, has = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
      zone.addEventListener('dragenter', e => { if (has(e)) { depth++; zone.classList.add('dropover'); } });
      zone.addEventListener('dragover', e => { if (has(e)) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; } });
      zone.addEventListener('dragleave', () => { if (--depth <= 0) off(); });
      zone.addEventListener('drop', e => { off(); if (!has(e)) return; e.preventDefault(); e.stopPropagation(); try { inp.files = e.dataTransfer.files; inp.dispatchEvent(new Event('change')); } catch (x) {} }); }
    /* v2.37: several files, like the French mode: each import is added to the list, then "Confirm imports" computes one result on all of them. */
    inp.multiple = true; const files = [], flist = doc.createElement('ul'), vbtn = doc.createElement('button'), fmsg = doc.createElement('div');
    flist.className = 'flist'; flist.id = 'usflist'; flist.hidden = true; vbtn.type = 'button'; vbtn.className = 'btn validate'; vbtn.id = 'usvalidate'; vbtn.textContent = 'Confirm imports'; vbtn.disabled = true; fmsg.id = 'usfmsg';
    { const ib = doc.getElementById('usimp'); if (ib) { ib.appendChild(flist); ib.appendChild(vbtn); ib.appendChild(fmsg); } else { out.parentNode.insertBefore(flist, out); out.parentNode.insertBefore(vbtn, out); out.parentNode.insertBefore(fmsg, out); } }
    const drawFiles = () => { flist.innerHTML = files.map((x, i) => `<li><span>${esc(x.name)} (${x.p.txs.length} line${x.p.txs.length > 1 ? 's' : ''})</span> <button type="button" class="small ghost" data-rmi="${i}" aria-label="Remove ${esc(x.name)}">✕</button></li>`).join(''); flist.hidden = !files.length; };
    const dirtyFiles = () => { drawFiles(); vbtn.disabled = !files.length; cur = last = null; out.innerHTML = ''; if (side) side.innerHTML = ''; };
    flist.addEventListener('click', e => { const b = e.target.closest('[data-rmi]'); if (!b) return; files.splice(+b.dataset.rmi, 1); fmsg.innerHTML = ''; dirtyFiles(); });
    inp.addEventListener('change', async () => {
      const F = Array.from(inp.files || []); if (!F.length) return; const notes = [];
      for (const f of F) { if (files.some(x => x.name === f.name && x.size === f.size)) { notes.push('<p class="warn">' + esc(f.name) + ': already imported, skipped.</p>'); continue; }
        const r = await readOne(f); if (r.err) notes.push(r.err); else files.push({ name: f.name, size: f.size, p: r.p, note: r.note || '' }); }
      inp.value = ''; dirtyFiles(); fmsg.innerHTML = notes.join('');
    });
    vbtn.addEventListener('click', () => { if (!files.length) return; const m = mergeFiles(files.map(x => ({ name: x.name, p: x.p }))); fmsg.innerHTML = '';
      const note = files.map(x => x.note).join('') + (m.dupes ? '<p class="warn">' + m.dupes + ' line' + (m.dupes > 1 ? 's' : '') + ' already found in an earlier file: counted once (to verify).</p>' : '') + (m.tzMix ? '<p class="warn">The files do not use the same time zone; the time zone of the first file is used (to verify).</p>' : '');
      vbtn.disabled = true; cur = m; pdfN = note; picks = {}; year = null; mcost = {}; da = {}; carry = {}; if (m.fileTz && tzSel) { fileTz = m.fileTz; tzSel.value = m.fileTz; } if (taxSel && taxSel.__draw) taxSel.__draw(); render(); });
    async function readOne(f) {
      const name = f.name.toLowerCase(), data = new Uint8Array(await f.arrayBuffer()), W = typeof window !== 'undefined' ? window : root;
      let p, pdfNote = '';
      try {
        if (/\.pdf$/.test(name) || (data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46)) {
          if (!W.pdfjsLib) { return { err: '<p class="warn">PDF reading is not available. Please reload the page.</p>' }; }
          W.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
          const doc = await W.pdfjsLib.getDocument({ data, isEvalSupported: false }).promise; let lines = [];
          const toLines = W.KryptaxPipeline && W.KryptaxPipeline.itemsToLines;
          for (let i = 1; i <= doc.numPages; i++) { const c = await (await doc.getPage(i)).getTextContent(); lines = lines.concat(toLines ? toLines(c.items) : c.items.map(x => x.str)); }
          p = fromPdfLines(lines);
          if (!p.txs.length) { return { err: '<p class="warn">' + esc(f.name) + ': this PDF was not recognised. No USD transaction line was found (expected lines like “01/10/2025 Sell BTC 0.5 $35,000.00 $25.00”). Nothing was computed. Please export a CSV or Excel file instead.</p>' }; }
          pdfNote = '<p class="warn">PDF import is best effort: ' + p.txs.length + ' line' + (p.txs.length > 1 ? 's' : '') + ' read. Please check every line against your statement (to verify).</p>';
        } else if (/\.(xlsx|xls)$/.test(name)) {
          if (!W.XLSX) { return { err: '<p class="warn">Excel reading is not available. Please reload the page.</p>' }; }
          p = fromWorkbook(W.XLSX, data, f.name);
        } else p = fromCSVText(data, f.name);
      } catch (e) { return { err: '<p class="warn">' + esc(f.name) + ': this file could not be read. Nothing was computed.</p>' }; }
      if (p.missingCols.length) { return { err: '<p class="warn">' + esc(f.name) + ': columns not found: ' + esc(p.missingCols.join(', ')) + '. Expected at least Date, Type, Asset, Quantity, plus Total (USD) or Price (USD).</p>' }; }
      return { p, note: pdfNote };
    }
    function daBlock(T, y) {
      const k = y || 'all', f = da[k + 'p'], g = da[k + 'b'], o = daCompare(T, f, g);
      const inp = (key, v, lab) => '<label class="usdal">' + lab + ' <input class="usda" data-k="' + key + '" inputmode="decimal" placeholder="$0.00" value="' + (v == null ? '' : esc(v)) + '"></label>';
      const line = (lab, mine, d) => '<li>' + lab + ': Kryptax ' + usd(mine) + (d == null ? '' : ' — difference ' + usd(d) + (Math.abs(d) >= 0.01 ? ' <b>(to verify)</b>' : ' (matches)')) + '</li>';
      return '<details class="usdabox"' + (f != null || g != null ? ' open' : '') + '><summary>Compare with Form 1099-DA (optional)</summary>'
        + '<p>Enter the totals your platform reported' + (y ? ' for ' + esc(y) : '') + '.</p>'
        + inp('p', f, 'Box 1f proceeds') + inp('b', g, 'Box 1g cost basis')
        + '<ul>' + line('Proceeds', o.proceeds, o.dProceeds) + line('Cost basis', o.cost, o.dCost) + '</ul>'
        + '<p class="usnote">Box 1f is proceeds after transaction costs. Box 1g may be blank for assets bought before 2026 or moved in from elsewhere (noncovered). Rewards and staking are not on Form 1099-DA. Sales marked to verify are not in the Kryptax totals. A difference does not mean an error — to verify. Source: IRS Instructions for Form 1099-DA.</p></details>';
    }
    const clNow = () => ({ s: carry[(year || 'all') + 's'], l: carry[(year || 'all') + 'l'] });
    function carryBlock(res) {
      const c = clNow(), K = carryLines(res, c), inp = (k, v, lab) => '<label class="usdal">' + lab + ' <input class="uscl" data-k="' + k + '" inputmode="decimal" placeholder="$0.00" value="' + (v == null ? '' : esc(v)) + '"></label>';
      return '<details class="usdabox"' + (K ? ' open' : '') + '><summary>Capital loss carryover (optional)</summary>'
        + '<p>Only if you have a loss carried over from last year. Enter the amounts from the Capital Loss Carryover Worksheet in the Instructions for Schedule D.</p>'
        + inp('s', c.s, 'Short-term (worksheet line 8 → Schedule D line 6)') + inp('l', c.l, 'Long-term (worksheet line 13 → Schedule D line 14)')
        + (K ? '<ul><li>Net short-term: ' + usd(K.net7) + '</li><li>Net long-term: ' + usd(K.net15) + '</li></ul><p class="usnote">' + esc(K.note) + '</p>' : '') + '</details>';
    }
    function sdBlock(res) {
      const SD = scheduleD(res, cat, clNow(), fstat), v = x => x == null ? '' : usd(x);
      return `<h3 class="ussdh">Schedule D (draft)</h3><p class="warn">${SD.warn}.</p><div class="scroll"><table class="us8949 ussd"><tr class="hdr"><th>Line</th><th>Description</th><th>(d) Proceeds</th><th>(e) Cost</th><th>(g) Adj.</th><th>(h) Gain/(loss)</th></tr>`
        + SD.lines.map(l => l.nc ? `<tr class="usnc"><td data-l="Line">${l.line}</td><td data-l="Description">${esc(l.desc)}</td><td data-l="Status" colspan="4">${esc(l.note)}</td></tr>`
          : `<tr><td data-l="Line">${l.line}</td><td data-l="Description">${esc(l.desc)}${l.note ? ' <span class="hint">(' + esc(l.note) + ')</span>' : ''}</td><td data-l="(d) Proceeds">${v(l.d)}</td><td data-l="(e) Cost">${v(l.e)}</td><td data-l="(g) Adj.">${v(l.g)}</td><td data-l="(h) Gain/(loss)">${l.answer || v(l.h)}</td></tr>`).join('')
        + '</table></div>' + ''
        + '<p class="hint">Net capital loss: the deductible part is limited to $3,000 a year ($1,500 if married filing separately), the rest is carried over (IRS Topic no. 409). Kryptax only sees the sales in this file — to verify.</p><p class="hint">Uses the options at the top (Form 8949 box, filing status) and the carryover entered. Source: Schedule D (Form 1040) 2025 and its instructions.</p>';
    }
    const daNow = () => ({ p: da[(year || 'all') + 'p'], b: da[(year || 'all') + 'b'] });
    // Options U.S. en haut de page (avant l'import) : un seul exemplaire de chaque sélecteur, état partagé avec le calcul et les exports
    function optsHtml() {
      const o = (v, l, c) => `<option value="${v}"${c === v ? ' selected' : ''}>${l}</option>`;
      return '<details class="note usopts" open><summary>Options (set before import)</summary><div class="grid">'
        + `<label>Lot method <select id="usmethod">${o('FIFO', 'FIFO (first in, first out)', method)}${o('HIFO', 'HIFO (highest cost first)', method)}${o('MANUAL', 'Manual choice per sale', method)}</select></label>`
        + `<label>Form 8949 box <select id="uscat">${o('', 'Not chosen — to verify', cat)}${o('none', 'No Form 1099-DA → box I / L', cat)}${o('nobasis', '1099-DA, basis not reported → H / K', cat)}${o('basis', '1099-DA, basis reported → G / J', cat)}</select></label>`
        + `<label>Network fees on transfers <select id="usfees">${Object.keys(FEE_MODES).map(k => o(k, FEE_MODES[k], fees)).join('')}</select></label>`
        + `<label>Filing status (Schedule D line 21) <select id="usfstat">${Object.keys(FSTAT).map(k => o(k, esc(FSTAT[k].replace(' - ', ' — ')), fstat)).join('')}</select></label>`
        + '</div><p class="hint">Specific identification (HIFO, manual) needs records at the time of sale. Fee treatment and box choice: to verify. Default values give the same results as before.</p><p class="hint">These choices and the time zone are kept in this browser only (no file data, no amounts, no manual lot picks). <a href="#" id="ussetreset">Reset saved settings</a></p></details>';
    }
    const opts = doc.createElement('div'); opts.id = 'usopts'; const imp = doc.getElementById('usimp');
    if (imp && imp.parentNode) imp.parentNode.insertBefore(opts, imp); const tips = () => opts.querySelectorAll('select').forEach(x => { const o = x.options[x.selectedIndex]; x.title = o ? o.text : ''; }); /* v2.19 full option text as a tooltip */ const tzLab = tzSel && tzSel.closest ? tzSel.closest('label') : null; /* v2.23 the file time zone sits first, on its own full-width line, inside Options */ const drawOpts = () => { opts.innerHTML = optsHtml(); const g = opts.querySelector('.usopts .grid'); if (tzLab && g) g.insertBefore(tzLab, g.firstChild); { const tl = taxSel && taxSel.closest ? taxSel.closest('label') : null; if (tl && g) g.insertBefore(tl, tzLab && tzLab.parentNode === g ? tzLab.nextSibling : g.firstChild); } /* v2.51 tax dates zone right after the file zone */ tips(); }; drawOpts(); opts.addEventListener('change', tips);
    // v2.18 wide screens (>= 1024px): options + import in a left column, "What to copy and where" + "To verify" in a side panel under them
    const left = doc.createElement('div'); left.id = 'usleft'; const side = doc.createElement('div'); side.id = 'usside';
    if (imp && imp.parentNode) { imp.parentNode.insertBefore(left, opts); left.appendChild(opts); left.appendChild(imp); left.appendChild(side); }
    const MQ = W0.matchMedia ? W0.matchMedia('(min-width: 1024px)') : null, wide = () => !!(MQ && MQ.matches);
    if (MQ) { const f = () => { if (cur) render(); else side.innerHTML = ''; }; if (MQ.addEventListener) MQ.addEventListener('change', f); else if (MQ.addListener) MQ.addListener(f); }
    opts.addEventListener('change', e => { const t = e.target;
      if (t.id === 'usmethod') method = t.value; else if (t.id === 'usfees') fees = FEE_MODES[t.value] ? t.value : 'IGNORE';
      else if (t.id === 'uscat') cat = t.value; else if (t.id === 'usfstat') fstat = FSTAT[t.value] != null ? t.value : ''; else return;
      keepSet(); if (cur) render(); });
    opts.addEventListener('click', e => { if (e.target.id !== 'ussetreset') return; e.preventDefault(); if (LS) clearSettings(LS);
      method = 'FIFO'; fees = 'IGNORE'; cat = ''; fstat = ''; drawOpts(); if (cur) render(); });
    // v2.12 guided result + single to-verify list (same amounts as the tables and exports)
    function guideHtml(res) {
      const G = guide(res, { cat, fstat, carry: clNow() }), li = [];
      if (!G.chosen && res.totals.sales) li.push('<li class="neg">Form 8949 box not chosen: choose it in <a href="#usopts">Options</a> at the top.</li>');
      for (const P of G.parts) if (P.n) li.push(`<li>Form 8949 Part ${P.part} (${P.term}), box <b>${esc(P.boxText)}</b>: proceeds <b>${usd(P.d)}</b> · cost <b>${usd(P.e)}</b> · gain/loss <b>${usd(P.h)}</b> → Schedule D line <b>${esc(P.sdLine)}</b></li>`);
      if (res.totals.sales && G.edition !== '2025') li.push(`<li class="neg">${esc(G.editionNote)}${G.edition === '2024' ? ' The “Form 1099-DA” choice in Options is read as the same situation on a Form 1099-B (to verify).' : ''}</li>`);
      if (res.totals.sales && year >= 2026) li.push('<li>Tax year ' + year + ': the IRS 2026 Form 8949 / Schedule D are still drafts (not for filing) — box letters and lines to verify on the final forms.</li>');
      if (res.totals.sales) li.push(`<li>Schedule D line 7: <b>${usd(G.n7)}</b> · line 15: <b>${usd(G.n15)}</b> · line 16: <b>${usd(G.n16)}</b></li>`);
      if (G.loss) li.push(G.l21 ? `<li>Schedule D line 21: <b>${usd(G.l21.h)}</b>${G.l21.rest > 0 ? ' (' + usd(G.l21.rest) + ' to carry over)' : ''}</li>` : '<li class="neg">Schedule D line 21: choose the filing status in <a href="#usopts">Options</a> at the top.</li>');
      if (G.income) li.push(`<li>Staking / airdrop / interest income: <b>${usd(G.income.usd)}</b> → report as ordinary income (no tax computed; where to report: to verify)</li>`);
      if (!li.length) li.push('<li>No sale or income in this year: nothing to copy.</li>');
      return `<div class="note usguide"><b>What to copy and where${year ? ' (' + year + ')' : ''}</b><ul>${li.join('')}</ul><span class="hint">Only the sales in this file — to verify.</span></div>`;
    }
    function checksHtml(res) {
      const C = checks(res, { cat, fstat, carry: clNow() }); if (!C.length) return '';
      return checksBlock(C);
    }
    // v2.18 key figures strip (wide screens only, hidden below 1024px): amounts already computed, nothing new
    function kpiHtml(res) {
      const T = res.totals, G = guide(res, { cat, fstat, carry: clNow() }), c = (l, v, k) => `<div><span>${l}</span><b class="${k || ''}">${v}</b></div>`;
      return '<div class="kxkpi halo" aria-hidden="true">' + c('Net gain or loss', usd(T.gain), T.gain < 0 ? 'neg' : 'pos') + c('Short term', usd(T.short.gain)) + c('Long term', usd(T.long.gain))
        + (G.loss && G.l21 ? c('Loss allowed (line 21)', usd(G.l21.h)) + (G.l21.rest > 0 ? c('Carryover', usd(G.l21.rest)) : '') : '') + '</div>';
    }
    // v2.19 charts (screen only): HTML/CSS bars, amounts already computed (totals of each year, gain of each "ok" line); lines "to verify" are left out like in the totals
    function usBars(id, title, items, legend) {
      if (!items.length) return ''; const mx = Math.max(...items.map(i => Math.abs(i.v)), 0.01);
      return `<figure class="kxchart" id="${id}" role="group" aria-label="${esc(title)}"><figcaption>${esc(title)}</figcaption>` + items.map(i => `<div class="kxrow" role="img" aria-label="${esc(i.k + ': ' + usd(i.v))}"><span class="kxk">${esc(i.k)}</span><svg class="kxtrack" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true"><rect class="kxb ${i.v < 0 ? 'neg' : 'pos'}" width="${Math.max(1, Math.round(Math.abs(i.v) / mx * 100))}" height="12" rx="3"/></svg><span class="kxv ${i.v < 0 ? 'neg' : 'pos'}" data-v="${i.v}">${usd(i.v)}</span></div>`).join('') + (legend ? `<p class="hint">${esc(legend)}</p>` : '') + '</figure>';
    }
    function usCharts(full, res) {
      const D = barData(full, res), T = res.totals, tv = T.toVerify ? `${T.toVerify} line${T.toVerify > 1 ? 's' : ''} marked "to verify" ${T.toVerify > 1 ? 'are' : 'is'} not included, as in the totals.` : '';
      if (!D.assets.length && !D.years.length) return '';
      return '<div class="kxcharts">' + usBars('kxyears', 'Net gain or loss by tax year', D.years, '')
        + usBars('kxassets', `Net gain or loss by asset${year ? ' (' + year + ')' : ' (all years)'}`, D.assets, ((tv ? tv + ' ' : '') + 'Sum of the bars = net gain or loss above.').trim()) + '</div>';
    }
    function render() {
      const p = cur, pdfNote = pdfN, full = compute(p.txs, { method, fees, picks, fileTz, taxTz: taxTzNow().tz, manualCost: mcost }), Ys = years(full); if (year == null) year = Ys.length ? Ys[Ys.length - 1] : 0;
      const res = last = forYear(full, year), T = res.totals, M = { FIFO: 'FIFO', HIFO: 'HIFO', MANUAL: 'manual choice' }[method];
      const hasW = res.rows.some(r => r.wallet);
      const trs = res.rows.map(r => `<tr class="${r.status === 'ok' ? (r.user ? 'ususer' : '') : 'tv'}"><td>${esc(r.desc)}${r.user ? ' <span class="hint">(cost entered by you)</span>' : ''}</td>${hasW ? `<td>${esc(r.wallet || '?')}</td>` : ''}<td>${mdy(r.acquired)}</td><td>${mdy(r.sold)}</td><td>${usd(r.proceeds)}</td><td>${usd(r.cost)}</td><td>${usd(r.gain)}</td><td>${r.term || '?'}</td></tr>`).join('');
      const sel = Ys.length > 1 ? `<div class="grid"><label>Tax year <select id="usyear">${Ys.map(y => `<option value="${y}"${y === year ? ' selected' : ''}>${y}</option>`).join('')}<option value="0"${!year ? ' selected' : ''}>All years</option></select></label></div>` : '';
      const exp = `<p class="usexp"><button type="button" id="uspdfmain" class="btn"${W0.KryptaxUSExport && W0.jspdf ? '' : ' hidden'}>Download PDF summary</button> <button type="button" id="uscsvmain" class="btn ghost">Download CSV (summary)</button>${W0.XLSX && W0.XLSX.write ? ' <button type="button" id="usxlsxmain" class="btn ghost">Download Excel (.xlsx)</button>' : ''}</p>`;
      out.innerHTML = pdfNote + `<h2 class="usreshead">2. Result${year ? ' ' + year : ' (all years)'}</h2>` + sel + kpiHtml(res) + (wide() ? '' : guideHtml(res) + checksHtml(res)) + `<div class="note total-global" role="status"><b>${T.sales} sale${T.sales === 1 ? '' : 's'}</b> (${T.rows} line${T.rows === 1 ? '' : 's'}, ${M})<br>Short term: <b>${usd(T.short.gain)}</b> · Long term: <b>${usd(T.long.gain)}</b><br>Total gain or loss: <b>${usd(T.gain)}</b>${T.sales ? '' : '<br>No sale in this year.'}<br><span class="hint">Times in file: ${esc(fileTz)}${p.txs.some(t => t.tz) ? ' (lines with an explicit UTC offset use it)' : ''} · tax dates (dates, tax year, 1-year test): <b>${esc(tzName(taxTzNow().tz))}</b>, ${esc(taxTzNow().how)} (to verify). Estimate, to verify — no tax computed.</span></div>` + (T.sales ? exp : '')
        + (T.income.count ? `<div class="note"><b>Income (staking / airdrops / interest): ${usd(T.income.usd)}</b> (${T.income.count - T.income.unknown} of ${T.income.count} line${T.income.count > 1 ? 's' : ''})<br>Ordinary income, to verify — not tax advice; no tax rates applied. Each amount is also the cost basis of the new lot.</div>`
          + `<div class="scroll"><table class="us8949 usincome"><tr><th>Date</th><th>Asset</th><th>Quantity</th><th>Value USD</th><th>Type</th></tr>${res.income.map(r => `<tr class="${r.status === 'ok' ? '' : 'tv'}"><td>${mdy(r.date)}</td><td>${esc(r.asset)}</td><td>${+r.qty.toPrecision(10)}</td><td>${r.usd == null ? 'to verify' : usd(r.usd)}</td><td>${r.type}</td></tr>`).join('')}</table></div>`
          + `<p><button type="button" id="usinccsv" class="small">Download CSV (income)</button></p>` : '')
        + (T.wallets.length > 1 ? `<p class="hint">${T.wallets.length} wallets (lots tracked in each wallet): ${esc(T.wallets.join(', '))}.</p>` : '')
        + usCharts(full, res)
        + feeBlock(T.fees)
        + (T.transfers.paired ? `<p class="hint">${T.transfers.paired} transfer${T.transfers.paired > 1 ? 's' : ''} between your own wallets: not taxable, original dates and cost kept.</p>` : '')
        + (()=>{ const M = full.rows.filter(r => r.status.startsWith('to verify: no purchase found') || r.user); if (!M.length) return '';
          const iso = v => { if (v == null) return ''; const d = new Date(v); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); };
          return `<details class="note usmiss"${M.some(r => !r.user) ? ' open' : ''}><summary>Missing purchases: enter the cost (optional)</summary><p class="hint">Units sold with no purchase in your file are left out of the totals. If you know them, enter the total cost in USD and the date acquired; the line is then included and marked “entered by you” (to verify).</p>`
            + M.map(r => { const mc = mcost[r.line] || {}; return `<div class="grid"><p><b>Sale line ${r.line}</b>: ${esc(r.desc)} sold ${mdy(r.sold)}${r.wallet ? ' (' + esc(r.wallet) + ')' : ''}</p><label>Total cost (USD)<input class="usmc" data-line="${r.line}" inputmode="decimal" value="${mc.cost != null ? esc(String(mc.cost)) : ''}" placeholder="e.g. 250.00"></label><label>Date acquired<input type="date" class="usmd" data-line="${r.line}" value="${esc(iso(mc.date))}" max="${iso(r.sold)}"></label></div>`; }).join('') + '</details>'; })()
        + daBlock(T, year)
        + carryBlock(res)
        + sdBlock(res)
        + (p.platform ? `<p class="hint" id="usplatform">Format recognised: ${esc(p.platform)}${p.fileTz ? ' (times in ' + esc(p.fileTz) + ')' : ''}. ${p.platformNote === 'binance' ? (p.tzNote ? ' ' + esc(/converties en UTC/.test(p.tzNote) ? 'Times converted from the fixed UTC offset given in the file.' : /non indiqu/.test(p.tzNote) ? 'Time zone not given in the file.' : 'Times in UTC.') : '') + ' Only amounts in USD are used; other currencies, exchanges between tokens and rewards have no USD value here' : ' Only USD-quoted, non-margin trades are read'} — to verify.</p>` : '')
        + (() => { const S = p.skipped.filter(s => !s.kept), K = p.skipped.filter(s => s.kept), G = new Map(); K.forEach(s => { if (!G.has(s.why)) G.set(s.why, []); G.get(s.why).push(s.line); }); /* v2.41: lines kept with a missing value are not "skipped" */
          return (S.length ? `<p class="hint">${S.length} line${S.length > 1 ? 's' : ''} skipped: ${esc(S.slice(0, 5).map(s => 'line ' + s.line + ' (' + s.why + ')').join(', '))}.</p>` : '')
            + (G.size ? `<div class="note" id="uskept"><b>Imported, to verify</b><ul>${[...G].map(([why, L]) => '<li>' + esc((L.length > 1 ? L.length + ' lines (' + L.slice(0, 6).join(', ') + (L.length > 6 ? '…' : '') + ')' : 'Line ' + L[0]) + ': ' + why) + '</li>').join('')}</ul></div>` : ''); })()
        + (method === 'MANUAL' ? manualHtml(res) : '')
        + `<details class="usdet" open><summary>Detailed table (Form 8949 lines)</summary><div class="scroll"><table class="us8949"><tr><th>(a) Description</th>${hasW ? '<th>Wallet</th>' : ''}<th>(b) Acquired</th><th>(c) Sold</th><th>(d) Proceeds</th><th>(e) Cost</th><th>(h) Gain/loss</th><th>Term</th></tr>${trs}</table></div></details>`
        + `<p><button type="button" id="uscsv" class="small">Download CSV (summary)</button>${W0.XLSX && W0.XLSX.write ? ' <button type="button" id="usxlsx" class="small">Download Excel (.xlsx)</button>' : ''}${W0.KryptaxUSExport && W0.jspdf ? ' <button type="button" id="uspdf" class="small">Download PDF</button>' : ''}</p>`;
      side.innerHTML = wide() ? guideHtml(res) + checksHtml(res) : '';
    }
    out.addEventListener('click', e => {
      if (/^us(pdf|csv|xlsx)main$/.test(e.target.id)) { const b = out.querySelector('#' + e.target.id.replace('main', '')); if (b) b.click(); return; }
      if (last && e.target.id === 'uspdf' && W0.KryptaxUSExport && W0.jspdf) { W0.KryptaxUSExport.download(W0.jspdf.jsPDF, last, doc, { cat, fstat, da: daNow(), carry: clNow() }); return; }
      if (last && e.target.id === 'usxlsx' && W0.XLSX && W0.XLSX.write) { const a = doc.createElement('a'); a.href = URL.createObjectURL(new Blob([W0.XLSX.write(toXLSX(W0.XLSX, last, { cat, fstat, da: daNow(), carry: clNow() }), { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); a.download = stampName('kryptax-us-summary', 'xlsx'); doc.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); return; }
      if (!last || (e.target.id !== 'uscsv' && e.target.id !== 'usinccsv')) return;
      const inc = e.target.id === 'usinccsv', a = doc.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF', inc ? incomeCSV(last) : toCSV(last, { cat, fstat, da: daNow(), carry: clNow() })], { type: 'text/csv;charset=utf-8' })); a.download = stampName(inc ? 'kryptax-income' : 'kryptax-us-summary', 'csv'); doc.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    });
  }
  /* v2.37: merge several imported files. Lines are renamed "F<n>:<line>" when there is more than one file; a line identical to one of an earlier file is counted once. */
  function mergeFiles(L) {
    if (L.length === 1) return Object.assign({}, L[0].p, { dupes: 0, tzMix: false });
    const K = t => [t.date, t.type, t.asset, t.qty, t.usd, t.toAsset || '', t.toQty || ''].join('|'), seen = new Set(), out = Object.assign({}, L[0].p, { txs: [], skipped: [], dupes: 0, tzMix: false });
    L.forEach((f, i) => { const mine = new Set(), pre = 'F' + (i + 1) + ':';
      f.p.txs.forEach(t => { const k = K(t); if (seen.has(k)) { out.dupes++; return; } mine.add(k); out.txs.push(Object.assign({}, t, { line: pre + t.line })); });
      mine.forEach(k => seen.add(k)); (f.p.skipped || []).forEach(s => out.skipped.push(Object.assign({}, s, { line: pre + s.line })));
      if (i && (f.p.fileTz || '') !== (L[0].p.fileTz || '')) out.tzMix = true; });
    out.txs.sort((a, b) => a.date - b.date); return out;
  }
  api.mergeFiles = mergeFiles;
  if (typeof module !== 'undefined') module.exports = api;
  else { root.KryptaxUS = api; if (root.document) { if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', () => mount(root.document)); else mount(root.document); } }
})(this);
