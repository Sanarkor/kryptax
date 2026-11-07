/* Kryptax - U.K. module v1 (separate from the French and U.S. engines; engine.js / formats.js / us-engine.js are only READ, never changed).
   Estimate of Capital Gains Tax figures on cryptoasset exchange tokens for a U.K. individual, from a CSV, Excel or PDF file; values in another currency are converted to GBP (ECB rates, CG78310).
   Not tax advice. Rules used, with their sources (read on gov.uk on 2026-11-03, see docs/UK-RULES.md):
   - Disposals: selling tokens, exchanging them for another token, using them to pay for goods or services, giving them away
     (gift: market value in GBP). Moving tokens between your own wallets is not a disposal. HMRC Cryptoassets Manual CRYPTO22100.
   - Matching, per type of token: same day rule (TCGA92/S105), then tokens acquired in the next 30 days (TCGA92/S106A, earliest
     acquisition first, earliest disposal first), then the section 104 pool (TCGA92/S104, pooled allowable cost). CRYPTO22200, examples CRYPTO22251-22256.
   - Allowable costs: GBP cost, transaction fees; a token-to-token swap fee may be split 50/50 between disposal and acquisition. CRYPTO22150.
   - Staking / mining (not a trade): GBP value at receipt is miscellaneous income (CRYPTO21150, CRYPTO21200); the tokens join the pool at that value
     ("Check if you need to pay tax when you sell cryptoassets": no CGT on the part already charged to Income Tax).
   - Airdrops: tokens go into the pool (CRYPTO22350); income status and allowable cost depend on the case (CRYPTO21250): to verify, pooled at GBP 0.
   - Tax year 6 April - 5 April; annual exempt amount by tax year ("Capital Gains Tax rates and allowances"); SA108 boxes 13.1-13.5 (SA108 2026 and its notes).
   No tax rate is applied (the rate depends on taxable income). */
(function (root) {
  'use strict';
  const node = typeof require !== 'undefined' && typeof module !== 'undefined';
  const E = node ? require('./engine.js') : root.KryptaxEngine;
  const KF = node ? require('./formats.js') : root.KryptaxFormats;
  const KP = node ? require('./pipeline.js') : root.KryptaxPipeline;
  const DAY = 864e5, LONDON = 'Europe/London';
  const COLS = {
    date: ['date', 'time', 'timestamp', 'date (utc)', 'datetime', 'date & time', 'date and time'],
    type: ['type', 'side', 'transaction type', 'action'],
    asset: ['asset', 'symbol', 'coin', 'currency', 'crypto', 'token'],
    qty: ['quantity', 'qty', 'amount', 'units'],
    price: ['price', 'price gbp', 'price (gbp)', 'gbp price', 'unit price', 'unit price (gbp)', 'spot price'],
    total: ['total', 'total gbp', 'total (gbp)', 'value', 'value gbp', 'value (gbp)', 'gbp value', 'subtotal', 'proceeds', 'total value'],
    fee: ['fee', 'fees', 'fee gbp', 'fee (gbp)', 'fees (gbp)', 'commission'],
    toAsset: ['received asset', 'to asset', 'asset received', 'buy asset'],
    toQty: ['received quantity', 'to quantity', 'quantity received', 'buy quantity']
  };
  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
  function mapHeader(head) { const h = head.map(x => { const n = norm(x), b = n.replace(/\s*\((?:usd|eur|chf|\$|\u20ac)\)$|\s+(?:usd|eur|chf)$/, ''); return Object.values(COLS).some(L => L.includes(n)) ? n : b; }), m = {}; for (const k in COLS) { const i = h.findIndex(x => COLS[k].includes(x)); if (i > -1) m[k] = i; } return m; }
  /* v2.34: currency of a cell or of a value column header (GBP, EUR, USD or another ISO code); other currencies are converted to GBP with ECB reference rates. */
  const curOf = v => { const s = String(v == null ? '' : v); if (/\u00a3|\bgbp\b/i.test(s)) return 'GBP'; if (/\$|\busd\b/i.test(s)) return 'USD'; if (/\u20ac|\beur\b/i.test(s)) return 'EUR'; const m = /\b(CHF|JPY|CAD|AUD|SEK|NOK|DKK|PLN|CZK|HUF|NZD|SGD|HKD)\b/i.exec(s); return m ? m[1].toUpperCase() : null; };
  function otherCurrency(head) { for (const x of head.map(norm)) if (/^(price|total|value|fee|fees|subtotal|proceeds)\b/.test(x)) { const c = curOf(x); if (c && c !== 'GBP') return c; } return null; }
  function kind(t) {
    t = norm(t);
    if (/^purchase of goods/.test(t)) return 'SPEND'; // before BUY: spending tokens on goods is a disposal, not an acquisition
    if (/^(buy|purchase|bought)/.test(t)) return 'BUY';
    if (/^(sell|sold|sale)/.test(t)) return 'SELL';
    if (/airdrop/.test(t)) return 'AIRDROP';
    if (/gift|donat/.test(t)) return 'GIFT';
    if (/spend|payment|purchase of goods|pay /.test(t)) return 'SPEND';
    if (/convert|exchange|swap|trade/.test(t)) return 'CONVERT';
    if (/stak|reward|interest|income|earn|mining|learn|lending/.test(t)) return 'INCOME';
    if (/send|sent|withdraw|transfer|receive|deposit/.test(t)) return 'TRANSFER';
    return null;
  }
  const num = v => { if (v == null || String(v).trim() === '') return NaN; if (typeof v === 'number') return Math.abs(v); const n = E.parseNum(String(v).replace(/[\u00a3$\u20ac]|\b(?:GBP|USD|EUR|CHF|JPY|CAD|AUD|SEK|NOK|DKK|PLN|CZK|HUF|NZD|SGD|HKD)\b/gi, '').trim()); return isFinite(n) ? Math.abs(n) : NaN; };
  const UTC_SUFFIX = /\s*(?:UTC|GMT|Z|[+-]00:?00)$/i;
  const ukDate = v => v instanceof Date ? Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), v.getHours(), v.getMinutes(), v.getSeconds())
    : typeof v === 'number' ? NaN : E.parseDate(String(v == null ? '' : v).trim().replace(UTC_SUFFIX, ''), 'DMY', 'UTC');
  function headerIndex(rows) {
    for (let i = 0; i < Math.min(25, rows.length); i++) { const m = mapHeader(rows[i] || []); if (['date', 'type', 'asset', 'qty'].every(k => m[k] != null)) return i; }
    return 0;
  }
  /* v2.41: Binance "Transaction History" (Operation / Coin / Change), read by the shared reader (formats.js binanceLedger), then mapped here.
     Amounts keep their SOURCE currency: a line in EUR waits for convertFx like any other non-GBP line. Exchanges between tokens and rewards have no
     amount in the file: their GBP value stays missing (to verify), they are never valued by guess. Times: UTC instant when the file gives its offset. */
  function fromBinance(B) {
    const out = { txs: [], skipped: B.skipped.slice(), missingCols: [], currency: null, platform: B.platform, tzNote: B.tzNote, binance: true };
    const noVal = [];
    for (const e of B.events) {
      const t = { line: e.line, date: e.date, type: e.type, rawType: e.rawType, asset: e.asset, qty: e.qty, amt: NaN, feeAmt: 0, cur: 'GBP', toAsset: e.toAsset || '', toQty: e.toQty || NaN };
      if (e.tz) t.tz = e.tz;
      if (e.type === 'BUY' || e.type === 'SELL' || e.type === 'SPEND') { t.amt = e.amt; t.cur = e.cur; t.feeAmt = e.feeAmt || e.feeCurAmt || 0;
        if (e.type === 'BUY' && e.feeQty > 0) { t.qty = Math.max(0, e.qty - e.feeQty); out.skipped.push({ line: e.line, why: 'fee paid in the token bought: quantity received net of the fee, fee not added to the cost', kept: true }); } }
      else if (e.type !== 'TRANSFER') noVal.push(e.line);
      if (t.qty > 0) push(out, t);
    }
    if (noVal.length) noVal.forEach(l => out.skipped.push({ line: l, why: 'no GBP value in the Binance file (exchange between tokens or reward): value missing, not in the totals', kept: true }));
    if (!B.tz) out.skipped.push({ line: 'file', why: 'time zone not given in the Binance file: times read in the zone chosen on this page', kept: true });
    out.txs.sort((a, b) => a.date - b.date || a.line - b.line);
    return out;
  }
  function parseRows(rows, name) {
    { const B = KF.binanceLedger && KF.binanceLedger(rows, name); if (B) return fromBinance(B); }
    const hi = headerIndex(rows), head = rows[hi] || [], m = mapHeader(head), out = { txs: [], skipped: [], missingCols: ['date', 'type', 'asset', 'qty'].filter(k => m[k] == null), currency: otherCurrency(head) };
    if (out.missingCols.length) return out;
    rows.slice(hi + 1).forEach((r, i) => {
      const g = k => m[k] == null ? '' : r[m[k]], line = hi + i + 2;
      if (!r.some(x => String(x).trim() !== '')) return;
      const type = kind(g('type')), date = ukDate(g('date')), asset = String(g('asset') || '').trim().toUpperCase(), qty = num(g('qty'));
      if (!type || !isFinite(date) || !asset || !(qty > 0)) { out.skipped.push({ line, why: !type ? 'unknown type' : !isFinite(date) ? 'unreadable date' : 'missing asset or quantity' }); return; }
      const cs = [...new Set(['price', 'total', 'fee'].map(k => curOf(g(k))).filter(Boolean))];
      if (cs.length > 1) { out.skipped.push({ line, why: 'mixed currencies in the line, to verify' }); return; }
      const price = num(g('price')), total0 = num(g('total')), fee = num(g('fee'));
      push(out, { line, date, type, rawType: String(g('type') || ''), asset, qty, amt: isFinite(total0) ? total0 : isFinite(price) ? price * qty : NaN, feeAmt: isFinite(fee) ? fee : 0, cur: cs[0] || out.currency || 'GBP', toAsset: String(g('toAsset') || '').trim().toUpperCase(), toQty: num(g('toQty')) });
    });
    out.txs.sort((a, b) => a.date - b.date || a.line - b.line);
    return out;
  }
  /* A line in GBP keeps its values; another currency waits for convertFx (gbp = NaN until then). */
  function push(out, t) { if (t.cur === 'GBP') { t.gbp = t.amt; t.fee = t.feeAmt; } else { t.gbp = NaN; t.fee = 0; t.needFx = true; } out.txs.push(t); }
  /* PDF statement (v2.34): text lines read by the same PDF reader as the other modes; FR or EN words, dates and numbers. */
  const TYPEMAP = { BUY: 'BUY', SELL: 'SELL', STAKING: 'INCOME', INTEREST: 'INCOME', AIRDROP: 'AIRDROP', PAY: 'SPEND', RECEIVE: 'TRANSFER', SEND: 'TRANSFER', GIFT: 'GIFT' };
  function fromPdfLines(lines) {
    { const B = KF.binancePdfRows && KF.binancePdfRows(lines); if (B) { const o = parseRows(B, ''); o.pdf = true; if (B.info.unread) o.skipped.push({ line: 'PDF', why: B.info.unread + ' Binance operation line(s) in the PDF could not be read, to verify' }); return o; } } /* v2.42: Binance PDF statement = same reading as its CSV */
    const r = KP.parsePdfLines(lines, { keepCur: true }), out = { txs: [], skipped: [], missingCols: [], currency: null, pdf: true };
    const add = (row, n, feeSeparate) => {
      const raw = String(row[1] || ''), g = E.guessType(raw, '', true), type = TYPEMAP[g] || kind(raw), date = E.parseDate(String(row[6] || ''), 'DMY', 'UTC'), asset = String(row[0] || '').toUpperCase(), qty = num(row[2]);
      if (!type || !isFinite(date) || !asset || !(qty > 0)) { out.skipped.push({ line: n, why: g === 'EXCH_OUT' ? 'exchange without the received asset, to verify' : !type ? 'unknown type' : 'unreadable line' }); return; }
      const cs = [...new Set([row[3], row[4], row[5]].map(curOf).filter(Boolean))]; if (cs.length > 1) { out.skipped.push({ line: n, why: 'mixed currencies in the line, to verify' }); return; }
      const price = num(row[3]), val = num(row[4]), fee = num(row[5]);
      push(out, { line: n, date, type, rawType: raw, asset, qty, amt: isFinite(val) ? val : isFinite(price) ? price * qty : NaN, feeAmt: isFinite(fee) && fee > 0 ? fee : 0, cur: cs[0] || 'EUR', toAsset: '', toQty: NaN, rawDate: String(row[6] || ''), oldFmt: !feeSeparate });
    };
    r.rows.forEach((row, i) => add(row, 'PDF ' + (i + 1), false));
    /* v2.36: old format, fee shown apart from the value (value = quantity x price). Allowable cost (CRYPTO22150, TCGA92/S38). A sale and a buy at the same second
       with the same fee are one exchange of token A for token B: the fee is counted once, split 50/50 between the disposal and the acquisition (CRYPTO22150, TCGA92/S52). */
    { const G = {}; out.txs.forEach(t => { if (t.oldFmt && t.feeAmt > 0) (G[t.rawDate + '|' + t.cur + '|' + t.feeAmt] = G[t.rawDate + '|' + t.cur + '|' + t.feeAmt] || []).push(t); });
      Object.values(G).forEach(L => { const s = L.filter(t => t.type === 'SELL'), b = L.filter(t => t.type === 'BUY'); if (s.length === 1 && b.length === 1) { s[0].feeAmt /= 2; b[0].feeAmt /= 2; s[0].pairFee = b[0].pairFee = true; out.pairs = (out.pairs || 0) + 1; } });
      if (out.txs.some(t => t.oldFmt && t.feeAmt > 0)) out.feeNote = true; out.txs.forEach(t => { delete t.rawDate; delete t.oldFmt; }); }
    r.rows2.forEach((x, i) => add(x.row, 'PDF ' + (r.rows.length + i + 1), true));
    r.amb.forEach(a => out.skipped.push({ line: 'PDF', why: a.why.replace(/quantité × prix ≠ valeur : importée avec la valeur indiquée, à vérifier/, 'quantity x price differs from the value; the value shown is used, to verify'), kept: !!a.kept }));
    out.txs.sort((a, b) => a.date - b.date); return out;
  }
  /* Conversion to GBP (v2.34): ECB reference rates (Frankfurter), rate of the day or of the previous working day (up to 7 days back).
     HMRC does not prescribe the source; a reasonable and consistent method is expected (Capital Gains Manual CG78310). No rate: line listed and excluded. */
  const FX_SRC = 'ECB reference rates via Frankfurter (api.frankfurter.dev)';
  const isoDay = t => new Date(t).toISOString().slice(0, 10);
  function rateOn(map, day) { for (let i = 0; i <= 7; i++) { const d = isoDay(Date.parse(day) - i * DAY); if (map[d]) return { rate: map[d], on: d }; } return null; }
  async function convertFx(p, getJson) {
    const need = p.txs.filter(t => t.needFx), by = {}; need.forEach(t => (by[t.cur] = by[t.cur] || []).push(t));
    p.fx = { src: FX_SRC, count: 0, cur: Object.keys(by), missing: 0 };
    for (const c in by) {
      const L = by[c], from = isoDay(Math.min(...L.map(t => t.date)) - 7 * DAY), to = isoDay(Math.max(...L.map(t => t.date))); let map = {};
      try { const j = await getJson('https://api.frankfurter.dev/v1/' + from + '..' + to + '?from=' + c + '&to=GBP'); if (j && j.rates) for (const k in j.rates) if (j.rates[k].GBP) map[k] = j.rates[k].GBP; } catch (x) { map = {}; }
      for (const t of L) { const r = rateOn(map, isoDay(t.date));
        if (!r) { t.drop = true; p.skipped.push({ line: t.line, why: 'no ' + c + ' to GBP rate found for ' + isoDay(t.date) + ', excluded, to verify' }); p.fx.missing++; continue; }
        t.gbp = t.amt * r.rate; t.fee = t.feeAmt * r.rate; t.fx = { cur: c, rate: r.rate, on: r.on }; delete t.needFx; p.fx.count++; }
    }
    p.txs = p.txs.filter(t => !t.drop); return p;
  }
  function fromCSVText(input, name) { return parseRows(Array.from(KF.parseCSV(input)), name); }
  function fromWorkbook(X, data, name) {
    const wb = X.read(data, { cellDates: true }); let best = null;
    for (const n of wb.SheetNames) { const rows = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }); if (!rows.length) continue; const p = parseRows(rows, name); if (!p.missingCols.length) return p; if (!best) best = p; }
    return best || { txs: [], skipped: [], missingCols: ['date', 'type', 'asset', 'qty'] };
  }
  /* Time zones: file times are wall-clock times in the file's zone; days and tax years are U.K. calendar days (Europe/London). Intl only, no network. */
  const tzFmt = {};
  function tzOffset(zone, inst) {
    if (!zone || zone === 'UTC') return 0;
    const f = tzFmt[zone] || (tzFmt[zone] = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    const P = {}; f.formatToParts(new Date(inst)).forEach(x => { P[x.type] = +x.value; });
    return Date.UTC(P.year, P.month - 1, P.day, P.hour % 24, P.minute, P.second) - Math.floor(inst / 1000) * 1000;
  }
  function shiftTz(w, from, to) { if (!isFinite(w) || (from || 'UTC') === (to || 'UTC')) return w; let i = w - tzOffset(from, w); i = w - tzOffset(from, i); return i + tzOffset(to, i); }
  /* U.K. tax year: 6 April to 5 April ("2025-26" = 6 April 2025 to 5 April 2026). Input: a day index (UTC midnight / DAY). */
  function taxYear(day) { const d = new Date(day * DAY), y = d.getUTCFullYear(), mo = d.getUTCMonth(), da = d.getUTCDate(), s = mo > 3 || (mo === 3 && da >= 6) ? y : y - 1; return s + '-' + String((s + 1) % 100).padStart(2, '0'); }
  /* Annual exempt amount for individuals ("Capital Gains Tax rates and allowances", gov.uk, last updated 13 April 2026). Other years: unknown (to verify). */
  const AEA = { '2021-22': 12300, '2022-23': 12300, '2023-24': 6000, '2024-25': 3000, '2025-26': 3000, '2026-27': 3000 };
  const r2 = v => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
  const EPS = 1e-12;
  function compute(txs, opts) {
    opts = opts || {}; const fileTz = opts.fileTz || LONDON;
    const dayOf = t => Math.floor(shiftTz(t.date, t.tz || fileTz, LONDON) / DAY); /* v2.41: t.tz = 'UTC' for a line whose instant is known (Binance offset) */
    const A = {}, notes = [], income = [], transfers = { count: 0, withFee: 0 };
    const slot = (asset, day) => { const a = A[asset] || (A[asset] = {}); return a[day] || (a[day] = { aq: 0, ac: 0, aUnknown: false, aLines: [], dq: 0, dp: 0, df: 0, dUnknown: false, dLines: [], gift: false, airdrop: false }); };
    const acq = (asset, day, qty, cost, line) => { const s = slot(asset, day); s.aq += qty; if (cost == null || !isFinite(cost)) s.aUnknown = true; else s.ac += cost; s.aLines.push(line); return s; };
    const disp = (asset, day, qty, proceeds, fee, line) => { const s = slot(asset, day); s.dq += qty; if (proceeds == null || !isFinite(proceeds)) s.dUnknown = true; else s.dp += proceeds; s.df += fee || 0; s.dLines.push(line); return s; };
    for (const t of txs) {
      const d = dayOf(t), v = isFinite(t.gbp) ? t.gbp : null;
      if (t.type === 'BUY') acq(t.asset, d, t.qty, v == null ? null : v + t.fee, t.line);
      else if (t.type === 'SELL' || t.type === 'SPEND') disp(t.asset, d, t.qty, v, t.fee, t.line);
      else if (t.type === 'GIFT') disp(t.asset, d, t.qty, v, t.fee, t.line).gift = true;
      else if (t.type === 'CONVERT') {
        if (!t.toAsset || !(t.toQty > 0)) { notes.push({ line: t.line, why: 'exchange without received asset or quantity: not computed' }); continue; }
        disp(t.asset, d, t.qty, v, t.fee / 2, t.line); acq(t.toAsset, d, t.toQty, v == null ? null : v + t.fee / 2, t.line);
      } else if (t.type === 'INCOME') { acq(t.asset, d, t.qty, v, t.line); income.push({ line: t.line, day: d, year: taxYear(d), asset: t.asset, qty: t.qty, gbp: v, type: t.rawType }); }
      else if (t.type === 'AIRDROP') { acq(t.asset, d, t.qty, 0, t.line).airdrop = true; income.push({ line: t.line, day: d, year: taxYear(d), asset: t.asset, qty: t.qty, gbp: v, type: t.rawType, airdrop: true }); }
      else if (t.type === 'TRANSFER') { transfers.count++; if (t.fee > 0) transfers.withFee++; }
    }
    const disposals = [], pools = {};
    for (const asset of Object.keys(A).sort()) {
      const S = A[asset], days = Object.keys(S).map(Number).sort((a, b) => a - b);
      const aRem = {}, dRem = {}, parts = {};
      for (const d of days) { aRem[d] = S[d].aq; dRem[d] = S[d].dq; parts[d] = []; }
      const unit = d => S[d].aq > 0 ? S[d].ac / S[d].aq : 0;
      // 1. same day rule (TCGA92/S105)
      for (const d of days) { const m = Math.min(aRem[d], dRem[d]); if (m > EPS) { parts[d].push({ rule: 'same day', qty: m, cost: unit(d) * m, unknown: S[d].aUnknown, from: d }); aRem[d] -= m; dRem[d] -= m; } }
      // 2. 30 day rule (TCGA92/S106A): acquisitions in the next 30 days, earliest disposal first, earliest acquisition first
      for (const d of days) { if (dRem[d] <= EPS) continue;
        for (const a of days) { if (a <= d || a > d + 30 || aRem[a] <= EPS) continue; const m = Math.min(aRem[a], dRem[d]);
          parts[d].push({ rule: '30 day', qty: m, cost: unit(a) * m, unknown: S[a].aUnknown, from: a }); aRem[a] -= m; dRem[d] -= m; if (dRem[d] <= EPS) break; } }
      // 3. section 104 pool (TCGA92/S104)
      let pq = 0, pc = 0, pUnknown = false;
      for (const d of days) {
        if (dRem[d] > EPS) { const m = Math.min(dRem[d], pq); if (m > EPS) { const c = pq > 0 ? pc * m / pq : 0; parts[d].push({ rule: 'S104', qty: m, cost: c, unknown: pUnknown, pool: { qty: pq, cost: pc } }); pq -= m; pc -= c; dRem[d] -= m; if (pq <= EPS) { pq = 0; pc = 0; } } }
        if (aRem[d] > EPS) { pq += aRem[d]; pc += unit(d) * aRem[d]; if (S[d].aUnknown) pUnknown = true; }
        const s = S[d]; if (!(s.dq > 0)) continue;
        const missing = dRem[d] > EPS ? dRem[d] : 0, cost = parts[d].reduce((x, p) => x + p.cost, 0) + s.df, unknown = s.dUnknown || parts[d].some(p => p.unknown);
        const status = missing ? 'to verify: no acquisition found for ' + +missing.toPrecision(10) + ' ' + asset : unknown ? 'to verify: missing GBP value' : 'ok';
        disposals.push({ asset, day: d, date: d * DAY, year: taxYear(d), qty: s.dq, proceeds: s.dUnknown ? null : r2(s.dp), fees: r2(s.df), cost: unknown ? null : r2(cost), gain: status === 'ok' ? r2(s.dp - cost) : null, parts: parts[d], lines: s.dLines, gift: s.gift, status });
      }
      pools[asset] = { qty: pq, cost: pUnknown ? null : r2(pc) };
    }
    disposals.sort((a, b) => a.day - b.day || (a.asset < b.asset ? -1 : 1));
    return { disposals, income, pools, notes, transfers, fileTz, years: [...new Set(disposals.map(x => x.year).concat(income.map(x => x.year)))].sort() };
  }
  /* SA108 "Cryptoassets" boxes 13.1 to 13.5 for one tax year (lines "to verify" are listed apart and left out). Annual exempt amount applied to the net gain, only for the years listed in AEA. */
  function yearSummary(res, y) {
    const D = res.disposals.filter(x => x.year === y), ok = D.filter(x => x.status === 'ok'), sum = f => r2(ok.reduce((a, x) => a + f(x), 0)) || 0;
    const gains = sum(x => Math.max(0, x.gain)), losses = sum(x => Math.max(0, -x.gain)), net = r2(gains - losses), aea = AEA[y] != null ? AEA[y] : null;
    const inc = res.income.filter(x => x.year === y && !x.airdrop), incGbp = r2(inc.reduce((a, x) => a + (x.gbp || 0), 0)) || 0;
    const proceeds = sum(x => x.proceeds);
    return { year: y, count: ok.length, proceeds, costs: sum(x => x.cost), gains, losses, net, aea, taxable: aea == null ? null : r2(Math.max(0, net - aea)),
      toVerify: D.filter(x => x.status !== 'ok'), disposals: D, income: res.income.filter(x => x.year === y), incomeGbp: incGbp, incomeUnknown: inc.filter(x => x.gbp == null).length,
      mustReport: proceeds > 50000 || (aea != null && gains > aea), rate: y >= '2025-26' && y <= '2026-27' ? '18% and 24% for individuals' : null };
  }
  const gbp = v => v == null || !isFinite(v) ? 'to verify' : (v < 0 ? '-' : '') + '\u00a3' + Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const p2 = n => String(n).padStart(2, '0');
  const dmy = t => { if (t == null) return 'unknown'; const d = new Date(t); return p2(d.getUTCDate()) + '/' + p2(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear(); };
  const ruleText = p => p.rule === 'same day' ? 'same day' : p.rule === '30 day' ? '30 day (' + dmy(p.from * DAY) + ')' : 'S104 pool';
  const LEGAL = 'Not tax advice - estimate to verify. Rules: HMRC Cryptoassets Manual CRYPTO22100, CRYPTO22150, CRYPTO22200 (TCGA92/S104, S105, S106A); Capital Gains Manual CG78310 (currency conversion); Capital Gains Tax rates and allowances; SA108 notes 2026.';
  /* v2.35: repeated warnings grouped, one line per message, line numbers condensed into ranges (ex. PDF lines 1-14, 20-33). */
  function ranges(ns) { ns = [...new Set(ns)].sort((a, b) => a - b); const o = []; for (let i = 0; i < ns.length; i++) { let j = i; while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++; o.push(j > i ? ns[i] + '-' + ns[j] : String(ns[i])); i = j; } return o.join(', '); }
  function groupLines(items, max) { const G = new Map(); items.forEach(x => { const k = x.why; if (!G.has(k)) G.set(k, []); G.get(k).push(x.line); }); const out = [];
    G.forEach((ls, why) => { if (ls.length <= (max || 1)) { ls.forEach(l => out.push({ text: (/^\d+$/.test(String(l)) ? 'Line ' + l : String(l)) + ': ' + why, n: 1 })); return; }
      const pdf = [], csv = [], other = []; ls.forEach(l => { const m = /^PDF (\d+)$/.exec(String(l)); if (m) pdf.push(+m[1]); else if (/^\d+$/.test(String(l))) csv.push(+l); else other.push(l); });
      const parts = []; if (pdf.length) parts.push('PDF line' + (pdf.length > 1 ? 's ' : ' ') + ranges(pdf)); if (csv.length) parts.push('line' + (csv.length > 1 ? 's ' : ' ') + ranges(csv)); if (other.length) parts.push(other.length > 1 && new Set(other).size === 1 ? other[0] + ' (' + other.length + ' times)' : [...new Set(other)].join(', '));
      out.push({ text: parts.join('; ') + ': ' + why + ' (' + ls.length + ' lines)', n: ls.length }); });
    return out; }
  function checks(res, Y, y) { const chk = [], tv = Y.toVerify;
    if (tv.length > 10) { const G = new Map(); tv.forEach(x => { if (!G.has(x.status)) G.set(x.status, []); G.get(x.status).push(dmy(x.date) + ' ' + x.asset); }); G.forEach((L, st) => chk.push(L.length + ' disposals: ' + st.replace(/^to verify: /, '') + ' — to verify (not in the totals): ' + L.join(', ') + '.')); }
    else tv.forEach(x => chk.push(`${dmy(x.date)} ${x.asset}: ${x.status.replace(/^to verify: /, '')} (not in the totals) — to verify.`));
    if (Y.disposals.some(x => x.gift)) chk.push('Gifts are disposals at market value, except to a spouse, civil partner or charity (remove those lines) — to verify.');
    if (Y.income.some(x => x.airdrop)) chk.push('Airdrops: pooled with a GBP 0 cost; Income Tax may or may not apply (CRYPTO21250) — to verify.');
    if (res.transfers && res.transfers.withFee) chk.push(res.transfers.withFee + ' transfer(s) with a fee: network fees paid in tokens are not handled — to verify.');
    if (res.fx && res.fx.count) chk.push(res.fx.count + ' line(s) converted to GBP (' + res.fx.cur.join(', ') + ') with ' + FX_SRC + ', using the rate of the day or of the previous working day. HMRC does not prescribe the rate source but expects a reasonable and consistent method (CG78310) — to verify.');
    if (res.fx && res.fx.missing) chk.push(res.fx.missing + ' line(s) without an exchange rate: excluded from the totals — to verify.');
    { const K = (res.skipped || []).filter(x => x.kept), FEE = /^fee shown in the statement is taken as included/; /* v2.35: one method sentence, not one line per operation */
      if (K.some(x => FEE.test(x.why))) chk.push('Fees shown in the PDF statement are taken as included in the value — to verify.');
      if (res.feeNote) chk.push('Fees shown in the PDF statement are deducted as allowable costs (CRYPTO22150); for an exchange of one token for another, the fee is counted once and split 50/50 between the disposal and the acquisition (CRYPTO22150) — to verify.');
      groupLines(K.filter(x => !FEE.test(x.why)), 1).forEach(g => chk.push(g.text + '.')); }
    groupLines(res.notes || [], 5).forEach(g => chk.push(g.text + '.'));
    { const m = Y.income.filter(x => !x.airdrop && x.gbp == null).length; if (m) chk.push(m + ' reward(s) without a value in the statement: value missing — to verify (taxable at the GBP value when received, CRYPTO21200); their cost in the pool is unknown.'); }
    if (Y.aea == null) chk.push('Annual exempt amount for ' + y + ': not in the table read on gov.uk — to verify.');
    chk.push('Losses brought forward, other assets and the Capital Gains Tax rate are not included — to verify.');
    return chk; }
  /* Cellule CSV : un texte importé commençant par = + @ (ou - non numérique) est préfixé d'une apostrophe (pas de formule tableur). Montants inchangés. */
  const csvSafe = (s => /^(?:[=+@\t\r]|-(?![\d.]|$))/.test(s) ? "'" + s : s);
  function toCSV(res, y) {
    const Y = yearSummary(res, y), q = v => { const s = csvSafe(String(v == null ? '' : v)); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }, n = v => v == null ? 'to verify' : v.toFixed(2);
    const L = [['Kryptax U.K. - Capital gains summary (estimate, to verify)'], ['Tax year', y + ' (6 April to 5 April)'], [],
      ['SA108 box', 'Description', 'Amount (GBP)'], ['13.1', 'Number of disposals', Y.count], ['13.2', 'Disposal proceeds', n(Y.proceeds)], ['13.3', 'Allowable costs (including purchase price)', n(Y.costs)],
      ['13.4', 'Gains in the year, before losses', n(Y.gains)], ['13.5', 'Losses in the year', n(Y.losses)], ['', 'Net gain or loss', n(Y.net)],
      ['', 'Annual exempt amount', Y.aea == null ? 'to verify' : n(Y.aea)], ['', 'Net gain above the annual exempt amount', Y.taxable == null ? 'to verify' : n(Y.taxable)], [],
      ['Date', 'Asset', 'Quantity', 'Proceeds', 'Allowable costs', 'Gain or loss', 'Matching', 'Status']];
    Y.disposals.forEach(x => L.push([dmy(x.date), x.asset, +x.qty.toPrecision(10), n(x.proceeds), n(x.cost), n(x.gain), x.parts.map(ruleText).join(' + '), x.status]));
    if (Y.income.length) { L.push([], ['Income (staking, mining, rewards, airdrops)'], ['Date', 'Asset', 'Quantity', 'Value (GBP)', 'Type']); Y.income.forEach(x => L.push([dmy(x.day * DAY), x.asset, +x.qty.toPrecision(10), x.airdrop ? 'to verify (airdrop)' : x.gbp == null ? 'value missing - to verify' : n(x.gbp), x.type])); }
    if (res.fx && res.fx.count) L.push([], ['Currency conversion', res.fx.count + ' line(s) converted to GBP (' + res.fx.cur.join(', ') + '), ' + FX_SRC + ', rate of the day or previous working day - to verify (HMRC CG78310: reasonable and consistent method)']);
    L.push([], ['To verify']); checks(res, Y, y).forEach(c => L.push([c]));
    L.push([], [LEGAL]);
    return L.map(r => r.map(q).join(',')).join('\r\n') + '\r\n';
  }
  const ascii = s => String(s == null ? '' : s).replace(/\u00a3/g, 'GBP ').replace(/[\u2013\u2014]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u00a0\u2007\u2009\u202f]/g, ' ').replace(/\u2026/g, '...').replace(/\u2212/g, '-').replace(/\u00d7/g, 'x').replace(/\u2264/g, '<=').replace(/\u2265/g, '>=').replace(/\u20ac/g, 'EUR ').replace(/[^\x20-\x7e]/g, '?');
  /* PDF lines, ASCII only (tested). */
  function pdfData(res, y, now) {
    const Y = yearSummary(res, y); now = now || new Date();
    const info = ['Tax year ' + y + ' (6 April to 5 April). Generated ' + now.getUTCFullYear() + '-' + p2(now.getUTCMonth() + 1) + '-' + p2(now.getUTCDate()) + ' UTC.',
      'Matching: same day rule, then 30 day rule, then section 104 pool, for each type of token. Days in U.K. time (Europe/London); times in file: ' + res.fileTz + '.',
      'SA108 Cryptoassets: 13.1 disposals ' + Y.count + ' | 13.2 proceeds ' + gbp(Y.proceeds) + ' | 13.3 allowable costs ' + gbp(Y.costs) + ' | 13.4 gains ' + gbp(Y.gains) + ' | 13.5 losses ' + gbp(Y.losses),
      'Net gain or loss ' + gbp(Y.net) + ' | annual exempt amount ' + (Y.aea == null ? 'to verify' : gbp(Y.aea)) + ' | above it ' + (Y.taxable == null ? 'to verify' : gbp(Y.taxable)) + '. No tax computed (rate depends on your taxable income).',
      (Y.toVerify.length ? Y.toVerify.length + ' disposal(s) to verify, not in the totals. ' : '') + 'Only the disposals in this file; losses of other years and other assets not included.'];
    if (res.fx && res.fx.count) info.push(res.fx.count + ' line(s) converted to GBP (' + res.fx.cur.join(', ') + ') with ' + FX_SRC + ', rate of the day or previous working day - to verify (HMRC CG78310).');
    if (Y.income.length) info.push('Income (staking, mining, rewards): ' + gbp(Y.incomeGbp) + ' (miscellaneous income, to verify; airdrops listed apart, to verify).');
    checks(res, Y, y).forEach(c => info.push('To verify: ' + c.replace(/ \u2014 to verify\b/g, '')));
    const rows = Y.disposals.map(x => [dmy(x.date), x.asset, String(+x.qty.toPrecision(10)), gbp(x.proceeds), gbp(x.cost), gbp(x.gain), x.parts.map(ruleText).join(' + '), x.status === 'ok' ? '' : x.status].map(ascii));
    return { title: 'Kryptax U.K. - Capital gains summary (estimate)', info: info.map(ascii), head: ['Date', 'Asset', 'Qty', 'Proceeds', 'Costs', 'Gain/loss', 'Matching', 'Status'], rows, foot: ascii(LEGAL) };
  }
  function pdf(jsPDF, res, y) {
    const D = pdfData(res, y), doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' }); let yy = 40;
    const t0 = doc.text.bind(doc); doc.text = (s, ...a) => t0(Array.isArray(s) ? s.map(ascii) : ascii(s), ...a); /* v2.36a: every PDF text line ASCII (tested) */ 
    doc.setFontSize(14); doc.text(D.title, 40, yy); yy += 20; doc.setFontSize(9);
    D.info.forEach(l => { doc.splitTextToSize(l, 760).forEach(s => { doc.text(s, 40, yy); yy += 12; }); });
    if (doc.autoTable) doc.autoTable({ head: [D.head], body: D.rows, startY: yy + 6, styles: { fontSize: 8 }, margin: { left: 40, right: 40 } });
    const n = doc.getNumberOfPages(); for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.text(D.foot, 40, doc.internal.pageSize.getHeight() - 20); }
    return doc;
  }
  const api = { csvSafe, ranges, groupLines, checks, curOf, fromPdfLines, convertFx, rateOn, FX_SRC, COLS, mapHeader, kind, parseRows, fromCSVText, fromWorkbook, ukDate, taxYear, AEA, compute, yearSummary, toCSV, pdfData, pdf, gbp, dmy, shiftTz, LEGAL };
  /* ---------- page (browser only) ---------- */
  function mount(doc) {
    const box = doc.getElementById('ukmode'); if (!box || box.dataset.ready) return; box.dataset.ready = '1';
    const inp = doc.getElementById('ukfile'), out = doc.getElementById('ukresult'), tzSel = doc.getElementById('uktz'); if (!inp || !out) return;
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]), W = typeof window !== 'undefined' ? window : root;
    let cur = null, full = null, year = null, fileTz = LONDON, name = '';
    let browserTz = 'UTC'; try { browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (x) {}
    if (tzSel) { const L = [[LONDON, 'U.K. time (Europe/London)'], ['UTC', 'UTC']]; if (browserTz !== LONDON && browserTz !== 'UTC') L.push([browserTz, 'This browser (' + browserTz + ')']);
      tzSel.innerHTML = L.map(z => `<option value="${esc(z[0])}">${esc(z[1])}</option>`).join(''); tzSel.addEventListener('change', () => { fileTz = tzSel.value; if (cur) render(); }); }
    const stamp = (p, ext) => { const d = new Date(); return p + '_' + d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '.' + ext; };
    const save = (blob, fn) => { const a = doc.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fn; doc.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
    function render() {
      full = compute(cur.txs, { fileTz }); full.fx = cur.fx; full.skipped = cur.skipped; full.feeNote = cur.feeNote; const Ys = full.years; if (!year || !Ys.includes(year)) year = Ys.length ? Ys[Ys.length - 1] : null;
      if (!year) { out.innerHTML = '<p class="warn">' + esc(name) + ': no disposal or income found. Nothing to report.</p>' + skippedHtml(); return; }
      const Y = yearSummary(full, year), c = (l, v, k) => `<div><span>${l}</span><b class="${k || ''}">${v}</b></div>`;
      const sel = Ys.length > 1 ? `<div class="grid"><label>Tax year <select id="ukyear">${Ys.map(y => `<option value="${y}"${y === year ? ' selected' : ''}>${y}</option>`).join('')}</select></label></div>` : '';
      const tr = Y.disposals.map(x => `<tr class="${x.status === 'ok' ? '' : 'tv'}"><td>${dmy(x.date)}</td><td>${esc(x.asset)}${x.gift ? ' <span class="hint">(gift)</span>' : ''}</td><td>${+x.qty.toPrecision(10)}</td><td>${gbp(x.proceeds)}</td><td>${gbp(x.cost)}</td><td>${gbp(x.gain)}</td><td>${esc(x.parts.map(ruleText).join(' + ') || '-')}${x.status === 'ok' ? '' : '<br><b>' + esc(x.status) + '</b>'}</td></tr>`).join('');
      const chk = checks(full, Y, year).map(esc);
      out.innerHTML = `<h2 class="usreshead">2. Result ${esc(year)}</h2>` + sel
        + '<div class="kxkpi halo" aria-hidden="true">' + c('Net gain or loss', gbp(Y.net), Y.net < 0 ? 'neg' : 'pos') + c('Gains', gbp(Y.gains)) + c('Losses', gbp(Y.losses)) + (Y.taxable != null ? c('Above tax-free allowance', gbp(Y.taxable)) : '') + '</div>'
        + `<div class="note usguide"><b>What to copy on SA108 (Cryptoassets, ${esc(year)})</b><div class="scroll"><table class="us8949 uksa"><tr><th>Box</th><th>Description</th><th>Amount</th></tr>`
        + [['13.1', 'Number of disposals', String(Y.count)], ['13.2', 'Disposal proceeds', gbp(Y.proceeds)], ['13.3', 'Allowable costs (including purchase price)', gbp(Y.costs)], ['13.4', 'Gains in the year, before losses', gbp(Y.gains)], ['13.5', 'Losses in the year', gbp(Y.losses)]].map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')
        + `</table></div><span class="hint">Only the disposals in this file — to verify. Do not deduct the annual exempt amount on SA108 (SA108 notes).</span></div>`
        + `<div class="note total-global" role="status">Net gain or loss: <b>${gbp(Y.net)}</b><br>Annual exempt amount ${esc(year)}: <b>${Y.aea == null ? 'to verify' : gbp(Y.aea)}</b> · above it: <b>${Y.taxable == null ? 'to verify' : gbp(Y.taxable)}</b><br>`
        + (Y.mustReport ? 'Proceeds over £50,000 or gains over the allowance: report on a Self Assessment return (SA108) — to verify.<br>' : '')
        + `<span class="hint">No tax computed: the rate${Y.rate ? ' (' + Y.rate + ')' : ''} depends on your taxable income. Tax year 6 April to 5 April; days in U.K. time. Estimate, not tax advice.</span></div>`
        + `<div class="note"><b>To verify (${chk.length})</b><ul>${chk.map(x => '<li>' + x + '</li>').join('')}</ul></div>`
        + (Y.income.length ? `<div class="note"><b>Income (staking, mining, rewards): ${gbp(Y.incomeGbp)}</b><br><span class="hint">Miscellaneous income at the GBP value when received (not a trade) — to verify. Not on SA108; the tokens join the pool at that value. Trading and miscellaneous income allowance: up to £1,000 a year.</span></div>`
          + `<div class="scroll"><table class="us8949"><tr><th>Date</th><th>Asset</th><th>Quantity</th><th>Value GBP</th><th>Type</th></tr>${Y.income.map(x => `<tr class="${x.airdrop || x.gbp == null ? 'tv' : ''}"><td>${dmy(x.day * DAY)}</td><td>${esc(x.asset)}</td><td>${+x.qty.toPrecision(10)}</td><td>${x.airdrop ? 'airdrop, to verify' : x.gbp == null ? 'value missing - to verify' : gbp(x.gbp)}</td><td>${esc(x.type)}</td></tr>`).join('')}</table></div>` : '')
        + `<details class="usdet" open><summary>Disposals (${Y.disposals.length})</summary><div class="scroll"><table class="us8949"><tr><th>Date</th><th>Asset</th><th>Quantity</th><th>Proceeds</th><th>Allowable costs</th><th>Gain/loss</th><th>Matching</th></tr>${tr}</table></div></details>`
        + skippedHtml() + (cur.platform ? `<p class="hint" id="ukplatform">Format recognised: ${esc(cur.platform)}${cur.tzNote ? ' (' + esc(/converties en UTC/.test(cur.tzNote) ? 'times converted from the fixed UTC offset given in the file' : /non indiqu/.test(cur.tzNote) ? 'time zone not given in the file' : 'times in UTC') + ')' : ''}. Amounts in their own currency, converted to GBP; exchanges between tokens and rewards have no GBP value in the file — to verify.</p>` : '')
        + `<p class="usexp"><button type="button" id="ukpdf" class="btn"${W.jspdf ? '' : ' hidden'}>Download PDF summary</button> <button type="button" id="ukcsv" class="btn ghost">Download CSV (summary)</button></p>`;
    }
    const skippedHtml = () => { const S = cur ? cur.skipped.filter(x => !x.kept) : []; return S.length ? `<p class="hint">${S.length} line${S.length > 1 ? 's' : ''} skipped: ${esc(groupLines(S, 5).map(g => g.text).join('; '))}.</p>` : ''; };
    out.addEventListener('change', e => { if (e.target.id === 'ukyear') { year = e.target.value; render(); } });
    out.addEventListener('click', e => {
      if (!full || !year) return;
      if (e.target.id === 'ukcsv') save(new Blob(['\uFEFF', toCSV(full, year)], { type: 'text/csv;charset=utf-8' }), stamp('kryptax-uk-summary', 'csv'));
      if (e.target.id === 'ukpdf' && W.jspdf) pdf(W.jspdf.jsPDF, full, year).save(stamp('kryptax-uk-summary', 'pdf'));
    });
    { const hb = doc.getElementById('ukhelpbtn'), hp = doc.getElementById('ukhelppanel'); if (hb && hp) hb.addEventListener('click', () => { const op = hp.hidden; hp.hidden = !op; hb.setAttribute('aria-expanded', String(op)); }); }
    { const rb = doc.getElementById('ukreset'); if (rb) rb.addEventListener('click', () => { if (!W.confirm('Reset everything? The imported files and the results on this page will be cleared.')) return; cur = full = null; year = null; inp.value = ''; out.innerHTML = ''; files.length = 0; fmsg.innerHTML = ''; dirtyFiles(); }); }
    const zone = doc.getElementById('ukimp');
    if (zone) { const has = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
      zone.addEventListener('dragover', e => { if (has(e)) { e.preventDefault(); zone.classList.add('dropover'); } });
      zone.addEventListener('dragleave', () => zone.classList.remove('dropover'));
      zone.addEventListener('drop', e => { zone.classList.remove('dropover'); if (!has(e)) return; e.preventDefault(); try { inp.files = e.dataTransfer.files; inp.dispatchEvent(new Event('change')); } catch (x) {} }); }

    /* v2.37: several files, like the French mode: each import is added to the list, then "Confirm imports" computes one result on all of them. */
    inp.multiple = true; const files = [], flist = doc.createElement('ul'), vbtn = doc.createElement('button'), fmsg = doc.createElement('div');
    flist.className = 'flist'; flist.id = 'ukflist'; flist.hidden = true; vbtn.type = 'button'; vbtn.className = 'btn validate'; vbtn.id = 'ukvalidate'; vbtn.textContent = 'Confirm imports'; vbtn.disabled = true; fmsg.id = 'ukfmsg';
    { const ib = doc.getElementById('ukimp'); if (ib) { ib.appendChild(flist); ib.appendChild(vbtn); ib.appendChild(fmsg); } else { out.parentNode.insertBefore(flist, out); out.parentNode.insertBefore(vbtn, out); out.parentNode.insertBefore(fmsg, out); } }
    const drawFiles = () => { flist.innerHTML = files.map((x, i) => `<li><span>${esc(x.name)} (${x.p.txs.length} line${x.p.txs.length > 1 ? 's' : ''})</span> <button type="button" class="small ghost" data-rmi="${i}" aria-label="Remove ${esc(x.name)}">✕</button></li>`).join(''); flist.hidden = !files.length; };
    const dirtyFiles = () => { drawFiles(); vbtn.disabled = !files.length; cur = full = null; year = null; out.innerHTML = ''; };
    flist.addEventListener('click', e => { const b = e.target.closest('[data-rmi]'); if (!b) return; files.splice(+b.dataset.rmi, 1); fmsg.innerHTML = ''; dirtyFiles(); });
    inp.addEventListener('change', async () => {
      const F = Array.from(inp.files || []); if (!F.length) return; const notes = [];
      for (const f of F) { if (files.some(x => x.name === f.name && x.size === f.size)) { notes.push('<p class="warn">' + esc(f.name) + ': already imported, skipped.</p>'); continue; }
        const r = await readOne(f); if (r.err) notes.push(r.err); else files.push({ name: f.name, size: f.size, p: r.p, note: r.note || '' }); }
      inp.value = ''; dirtyFiles(); fmsg.innerHTML = notes.join('');
    });
    vbtn.addEventListener('click', () => { if (!files.length) return; const m = mergeFiles(files.map(x => ({ name: x.name, p: x.p }))); fmsg.innerHTML = '';
      const note = files.map(x => x.note).join('') + (m.dupes ? '<p class="warn">' + m.dupes + ' line' + (m.dupes > 1 ? 's' : '') + ' already found in an earlier file: counted once (to verify).</p>' : '') + (m.tzMix ? '<p class="warn">The files do not use the same time zone; the time zone of the first file is used (to verify).</p>' : '');
      vbtn.disabled = true; name = files.map(x => x.name).join(', '); cur = m; year = null; render(); if (note) out.insertAdjacentHTML('afterbegin', note); });
    async function readOne(f) {
      const data = new Uint8Array(await f.arrayBuffer()); let p;
      try { if (/\.(xlsx|xls)$/i.test(f.name)) { if (!W.XLSX) { return { err: '<p class="warn">Excel reading is not available. Please reload the page.</p>' }; } p = fromWorkbook(W.XLSX, data, f.name); }
        else if (/\.pdf$/i.test(f.name)) { if (!W.pdfjsLib || !KP) { return { err: '<p class="warn">PDF reading is not available. Please reload the page.</p>' }; }
          W.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js'; out.innerHTML = '<p class="hint">Reading the PDF…</p>';
          const d = await W.pdfjsLib.getDocument({ data, isEvalSupported: false }).promise; let lines = [];
          for (let i = 1; i <= d.numPages; i++) { const c = await (await d.getPage(i)).getTextContent(); lines = lines.concat(KP.itemsToLines(c.items)); }
          p = fromPdfLines(lines); if (!p.txs.length) { return { err: '<p class="warn">' + esc(f.name) + ': no crypto transaction found in this PDF. Nothing was computed.</p>' }; } }
        else p = fromCSVText(data, f.name); }
      catch (x) { return { err: '<p class="warn">' + esc(f.name) + ': this file could not be read. Nothing was computed.</p>' }; }
      if (p.missingCols.length) { return { err: '<p class="warn">' + esc(f.name) + ': columns not found: ' + esc(p.missingCols.join(', ')) + '. Expected at least Date, Type, Asset, Quantity, plus Total or Price.</p>' }; }
      if (p.txs.some(t => t.needFx)) { out.innerHTML = '<p class="hint">Converting to GBP (ECB reference rates)…</p>';
        await convertFx(p, async u => { const r = await fetch(u); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
      return { p };
    }
  }

  /* v2.37: merge several imported files. Lines are renamed "F<n>:<line>" when there is more than one file; a line identical to one of an earlier file is counted once. */
  function mergeFiles(L) {
    if (L.length === 1) return Object.assign({}, L[0].p, { dupes: 0, tzMix: false });
    const K = t => [t.date, t.type, t.asset, t.qty, t.amt, t.toAsset || '', t.toQty || ''].join('|'), seen = new Set(), out = Object.assign({}, L[0].p, { txs: [], skipped: [], dupes: 0, tzMix: false });
    L.forEach((f, i) => { const mine = new Set(), pre = 'F' + (i + 1) + ':';
      f.p.txs.forEach(t => { const k = K(t); if (seen.has(k)) { out.dupes++; return; } mine.add(k); out.txs.push(Object.assign({}, t, { line: pre + t.line })); });
      mine.forEach(k => seen.add(k)); (f.p.skipped || []).forEach(s => out.skipped.push(Object.assign({}, s, { line: pre + s.line })));
      if (i && (f.p.fileTz || '') !== (L[0].p.fileTz || '')) out.tzMix = true; if (f.p.fx) { out.fx = out.fx || { src: f.p.fx.src, count: 0, cur: [], missing: 0 }; if (i) { out.fx.count += f.p.fx.count; out.fx.missing += f.p.fx.missing || 0; f.p.fx.cur.forEach(c => { if (!out.fx.cur.includes(c)) out.fx.cur.push(c); }); } } if (f.p.feeNote) out.feeNote = true; });
    out.txs.sort((a, b) => a.date - b.date); return out;
  }
  api.mergeFiles = mergeFiles;
  api.mount = mount;
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount(document)); else mount(document); }
  if (node) module.exports = api; else root.KryptaxUK = api;
})(typeof window !== 'undefined' ? window : this);
