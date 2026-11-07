/* Kryptax - Germany (Deutschland) module v1 (separate from the French, U.S. and U.K. engines; engine.js / formats.js / pipeline.js are only READ, never changed).
   Estimate of the figures for the German "Anlage SO" (private sales of crypto assets and income from services) for an individual, from CSV, Excel or PDF files, in EUR.
   Not tax advice. Rules used, with their sources (read on 2026-11-03, see docs/DE-RULES.md):
   - BMF letter of 6 March 2025 "Einzelfragen zur ertragsteuerrechtlichen Behandlung bestimmter Kryptowerte" (BStBl I S. 658), Rn. 43, 48, 48a, 53-63, 65, 70-75, 91.
   - EStG s. 23 (1) no. 2 (holding period of one year), s. 23 (3) (gain, EUR 1,000 limit from 2024, EUR 600 before, losses), s. 22 no. 3 (income from services, EUR 256 limit), s. 2 (7) (calendar year).
   - Private sales: disposals within one year of acquisition, FIFO per wallet and per token (Rn. 61-62); a token-to-token exchange is a disposal at the market value of the
     token received, which becomes the cost of that token (Rn. 54, 58, 59). No 10-year period for currency tokens (Rn. 63).
   - Staking, lending, mining, airdrops with a service: income under s. 22 no. 3 at the market value when received; the tokens received are an acquisition (Rn. 48, 54, 65, 75).
   No tax is computed (progressive income tax, s. 32a EStG, depends on the whole income). */
(function (root) {
  'use strict';
  const node = typeof require !== 'undefined' && typeof module !== 'undefined';
  const E = node ? require('./engine.js') : root.KryptaxEngine;
  const KF = node ? require('./formats.js') : root.KryptaxFormats;
  const KP = node ? require('./pipeline.js') : root.KryptaxPipeline;
  const DAY = 864e5, BERLIN = 'Europe/Berlin';
  const COLS = {
    date: ['date', 'time', 'timestamp', 'date (utc)', 'datetime', 'date & time', 'date and time'],
    type: ['type', 'side', 'transaction type', 'action'],
    asset: ['asset', 'symbol', 'coin', 'currency', 'crypto', 'token'],
    qty: ['quantity', 'qty', 'amount', 'units'],
    price: ['price', 'price eur', 'price (eur)', 'eur price', 'unit price', 'unit price (eur)', 'spot price'],
    total: ['total', 'total eur', 'total (eur)', 'value', 'value eur', 'value (eur)', 'eur value', 'subtotal', 'proceeds', 'total value'],
    fee: ['fee', 'fees', 'fee eur', 'fee (eur)', 'fees (eur)', 'commission'],
    toAsset: ['received asset', 'to asset', 'asset received', 'buy asset'],
    toQty: ['received quantity', 'to quantity', 'quantity received', 'buy quantity'],
    wallet: ['wallet', 'platform', 'exchange', 'account', 'portfolio']
  };
  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
  function mapHeader(head) { const h = head.map(x => { const n = norm(x), b = n.replace(/\s*\((?:usd|gbp|chf|\$|\u00a3)\)$|\s+(?:usd|gbp|chf)$/, ''); return Object.values(COLS).some(L => L.includes(n)) ? n : b; }), m = {}; for (const k in COLS) { const i = h.findIndex(x => COLS[k].includes(x)); if (i > -1) m[k] = i; } return m; }
  /* Currency of a cell or of a value column header; other currencies are converted to EUR with ECB reference rates. */
  const curOf = v => { const s = String(v == null ? '' : v); if (/\u00a3|\bgbp\b/i.test(s)) return 'GBP'; if (/\$|\busd\b/i.test(s)) return 'USD'; if (/\u20ac|\beur\b/i.test(s)) return 'EUR'; const m = /\b(CHF|JPY|CAD|AUD|SEK|NOK|DKK|PLN|CZK|HUF|NZD|SGD|HKD)\b/i.exec(s); return m ? m[1].toUpperCase() : null; };
  function otherCurrency(head) { for (const x of head.map(norm)) if (/^(price|total|value|fee|fees|subtotal|proceeds)\b/.test(x)) { const c = curOf(x); if (c && c !== 'EUR') return c; } return null; }
  function kind(t) {
    t = norm(t);
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
  const deDate = v => v instanceof Date ? Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), v.getHours(), v.getMinutes(), v.getSeconds())
    : typeof v === 'number' ? NaN : E.parseDate(String(v == null ? '' : v).trim().replace(UTC_SUFFIX, ''), 'DMY', 'UTC');
  function headerIndex(rows) {
    for (let i = 0; i < Math.min(25, rows.length); i++) { const m = mapHeader(rows[i] || []); if (['date', 'type', 'asset', 'qty'].every(k => m[k] != null)) return i; }
    return 0;
  }
  function parseRows(rows) {
    const hi = headerIndex(rows), head = rows[hi] || [], m = mapHeader(head), out = { txs: [], skipped: [], missingCols: ['date', 'type', 'asset', 'qty'].filter(k => m[k] == null), currency: otherCurrency(head) };
    if (out.missingCols.length) return out; if (m.wallet != null) out.hasWallet = true;
    rows.slice(hi + 1).forEach((r, i) => {
      const g = k => m[k] == null ? '' : r[m[k]], line = hi + i + 2;
      if (!r.some(x => String(x).trim() !== '')) return;
      const type = kind(g('type')), date = deDate(g('date')), asset = String(g('asset') || '').trim().toUpperCase(), qty = num(g('qty'));
      if (!type || !isFinite(date) || !asset || !(qty > 0)) { out.skipped.push({ line, why: !type ? 'unknown type' : !isFinite(date) ? 'unreadable date' : 'missing asset or quantity' }); return; }
      const cs = [...new Set(['price', 'total', 'fee'].map(k => curOf(g(k))).filter(Boolean))];
      if (cs.length > 1) { out.skipped.push({ line, why: 'mixed currencies in the line, to verify' }); return; }
      const price = num(g('price')), total0 = num(g('total')), fee = num(g('fee'));
      push(out, { line, date, type, rawType: String(g('type') || ''), asset, qty, amt: isFinite(total0) ? total0 : isFinite(price) ? price * qty : NaN, feeAmt: isFinite(fee) ? fee : 0, cur: cs[0] || out.currency || 'EUR', toAsset: String(g('toAsset') || '').trim().toUpperCase(), toQty: num(g('toQty')), wallet: String(g('wallet') || '').trim() });
    });
    out.txs.sort((a, b) => a.date - b.date || a.line - b.line);
    return out;
  }
  /* A line in EUR keeps its values; another currency waits for convertFx (eur = NaN until then). */
  function push(out, t) { if (t.cur === 'EUR') { t.eur = t.amt; t.fee = t.feeAmt; } else { t.eur = NaN; t.fee = 0; t.needFx = true; } out.txs.push(t); }
  /* PDF statement: text lines read by the same PDF reader as the other modes; FR or EN words, dates and numbers. */
  const TYPEMAP = { BUY: 'BUY', SELL: 'SELL', STAKING: 'INCOME', INTEREST: 'INCOME', AIRDROP: 'AIRDROP', PAY: 'SPEND', RECEIVE: 'TRANSFER', SEND: 'TRANSFER', GIFT: 'GIFT' };
  function fromPdfLines(lines) {
    const r = KP.parsePdfLines(lines, { keepCur: true }), out = { txs: [], skipped: [], missingCols: [], currency: null, pdf: true };
    const add = (row, n, feeSeparate) => {
      const raw = String(row[1] || ''), g = E.guessType(raw, '', true), type = TYPEMAP[g] || kind(raw), date = E.parseDate(String(row[6] || ''), 'DMY', 'UTC'), asset = String(row[0] || '').toUpperCase(), qty = num(row[2]);
      if (!type || !isFinite(date) || !asset || !(qty > 0)) { out.skipped.push({ line: n, why: g === 'EXCH_OUT' ? 'exchange without the received asset, to verify' : !type ? 'unknown type' : 'unreadable line' }); return; }
      const cs = [...new Set([row[3], row[4], row[5]].map(curOf).filter(Boolean))]; if (cs.length > 1) { out.skipped.push({ line: n, why: 'mixed currencies in the line, to verify' }); return; }
      const price = num(row[3]), val = num(row[4]), fee = num(row[5]);
      push(out, { line: n, date, type, rawType: raw, asset, qty, amt: isFinite(val) ? val : isFinite(price) ? price * qty : NaN, feeAmt: isFinite(fee) && fee > 0 ? fee : 0, cur: cs[0] || 'EUR', toAsset: '', toQty: NaN, rawDate: String(row[6] || ''), oldFmt: !feeSeparate });
    };
    r.rows.forEach((row, i) => add(row, 'PDF ' + (i + 1), false));
    /* Old format, fee shown apart from the value. A sale and a buy at the same second with the same fee are one exchange of token A for token B:
       the fee is counted once, as a cost of the disposal (BMF 06.03.2025 Rn. 59; split between taxable and non-taxable disposals: to verify). */
    { const G = {}; out.txs.forEach(t => { if (t.oldFmt && t.feeAmt > 0) (G[t.rawDate + '|' + t.cur + '|' + t.feeAmt] = G[t.rawDate + '|' + t.cur + '|' + t.feeAmt] || []).push(t); });
      Object.values(G).forEach(L => { const s = L.filter(t => t.type === 'SELL'), b = L.filter(t => t.type === 'BUY'); if (s.length === 1 && b.length === 1) { b[0].feeAmt = 0; s[0].pairFee = b[0].pairFee = true; out.pairs = (out.pairs || 0) + 1; } });
      if (out.txs.some(t => t.oldFmt && t.feeAmt > 0)) out.feeNote = true; out.txs.forEach(t => { delete t.rawDate; delete t.oldFmt; }); }
    r.rows2.forEach((x, i) => add(x.row, 'PDF ' + (r.rows.length + i + 1), true));
    r.amb.forEach(a => out.skipped.push({ line: 'PDF', why: a.why.replace(/quantité × prix ≠ valeur : importée avec la valeur indiquée, à vérifier/, 'quantity x price differs from the value; the value shown is used, to verify'), kept: !!a.kept }));
    out.txs.sort((a, b) => a.date - b.date); return out;
  }
  /* Conversion to EUR: ECB reference rates (Frankfurter), rate of the day or of the previous working day (up to 7 days back); method to verify. No rate: line listed and excluded. */
  const FX_SRC = 'ECB reference rates via Frankfurter (api.frankfurter.dev)';
  const isoDay = t => new Date(t).toISOString().slice(0, 10);
  function rateOn(map, day) { for (let i = 0; i <= 7; i++) { const d = isoDay(Date.parse(day) - i * DAY); if (map[d]) return { rate: map[d], on: d }; } return null; }
  async function convertFx(p, getJson) {
    const need = p.txs.filter(t => t.needFx), by = {}; need.forEach(t => (by[t.cur] = by[t.cur] || []).push(t));
    p.fx = { src: FX_SRC, count: 0, cur: Object.keys(by), missing: 0 };
    for (const c in by) {
      const L = by[c], from = isoDay(Math.min(...L.map(t => t.date)) - 7 * DAY), to = isoDay(Math.max(...L.map(t => t.date))); let map = {};
      try { const j = await getJson('https://api.frankfurter.dev/v1/' + from + '..' + to + '?from=' + c + '&to=EUR'); if (j && j.rates) for (const k in j.rates) if (j.rates[k].EUR) map[k] = j.rates[k].EUR; } catch (x) { map = {}; }
      for (const t of L) { const r = rateOn(map, isoDay(t.date));
        if (!r) { t.drop = true; p.skipped.push({ line: t.line, why: 'no ' + c + ' to EUR rate found for ' + isoDay(t.date) + ', excluded, to verify' }); p.fx.missing++; continue; }
        t.eur = t.amt * r.rate; t.fee = t.feeAmt * r.rate; t.fx = { cur: c, rate: r.rate, on: r.on }; delete t.needFx; p.fx.count++; }
    }
    p.txs = p.txs.filter(t => !t.drop); return p;
  }
  function fromCSVText(input) { return parseRows(Array.from(KF.parseCSV(input))); }
  function fromWorkbook(X, data) {
    const wb = X.read(data, { cellDates: true }); let best = null;
    for (const n of wb.SheetNames) { const rows = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }); if (!rows.length) continue; const p = parseRows(rows); if (!p.missingCols.length) return p; if (!best) best = p; }
    return best || { txs: [], skipped: [], missingCols: ['date', 'type', 'asset', 'qty'] };
  }  /* Time zones: file times are wall-clock times in the file's zone; days and tax years are German calendar days (Europe/Berlin). Intl only, no network. */
  const tzFmt = {};
  function tzOffset(zone, inst) {
    if (!zone || zone === 'UTC') return 0;
    const f = tzFmt[zone] || (tzFmt[zone] = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    const P = {}; f.formatToParts(new Date(inst)).forEach(x => { P[x.type] = +x.value; });
    return Date.UTC(P.year, P.month - 1, P.day, P.hour % 24, P.minute, P.second) - Math.floor(inst / 1000) * 1000;
  }
  function shiftTz(w, from, to) { if (!isFinite(w) || (from || 'UTC') === (to || 'UTC')) return w; let i = w - tzOffset(from, w); i = w - tzOffset(from, i); return i + tzOffset(to, i); }  /* v2.35: repeated warnings grouped, one line per message, line numbers condensed into ranges (ex. PDF lines 1-14, 20-33). */
  function ranges(ns) { ns = [...new Set(ns)].sort((a, b) => a - b); const o = []; for (let i = 0; i < ns.length; i++) { let j = i; while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++; o.push(j > i ? ns[i] + '-' + ns[j] : String(ns[i])); i = j; } return o.join(', '); }
  function groupLines(items, max) { const G = new Map(); items.forEach(x => { const k = x.why; if (!G.has(k)) G.set(k, []); G.get(k).push(x.line); }); const out = [];
    G.forEach((ls, why) => { if (ls.length <= (max || 1)) { ls.forEach(l => out.push({ text: (/^\d+$/.test(String(l)) ? 'Line ' + l : String(l)) + ': ' + why, n: 1 })); return; }
      const pdf = [], csv = [], other = []; ls.forEach(l => { const m = /^PDF (\d+)$/.exec(String(l)); if (m) pdf.push(+m[1]); else if (/^\d+$/.test(String(l))) csv.push(+l); else other.push(l); });
      const parts = []; if (pdf.length) parts.push('PDF line' + (pdf.length > 1 ? 's ' : ' ') + ranges(pdf)); if (csv.length) parts.push('line' + (csv.length > 1 ? 's ' : ' ') + ranges(csv)); if (other.length) parts.push(other.length > 1 && new Set(other).size === 1 ? other[0] + ' (' + other.length + ' times)' : [...new Set(other)].join(', '));
      out.push({ text: parts.join('; ') + ': ' + why + ' (' + ls.length + ' lines)', n: ls.length }); });
    return out; }  /* Missing EUR values (v1): market price of the minute (same price sources as the France mode, pipeline.js), BMF Rn. 43 (market price of a platform or a web list).
     Exchange: value of the token received (Rn. 58), or of the token given if no price is found (Rn. 58, tolerance). src = KP.makeSources(...) in the browser, or a test double. */
  async function priceMissing(p, src, fileTz) {
    const L = p.txs.filter(t => !t.needFx && !isFinite(t.eur) && ['BUY', 'SELL', 'SPEND', 'CONVERT', 'INCOME', 'AIRDROP'].includes(t.type));
    p.priced = { count: 0, missing: 0, srcs: [] };
    for (const t of L) {
      const inst = shiftTz(t.date, fileTz || BERLIN, 'UTC'), tries = t.type === 'CONVERT' && t.toAsset && t.toQty > 0 ? [[t.toAsset, t.toQty, 'received'], [t.asset, t.qty, 'given']] : [[t.asset, t.qty, '']];
      let ok = false;
      for (const [a, q, side] of tries) { let r = null; try { r = await src.minute(a, inst); } catch (x) { r = null; }
        if (r && r.p > 0) { t.eur = r.p * q; t.priced = { src: r.src, k: r.k, side }; if (!p.priced.srcs.includes(r.src)) p.priced.srcs.push(r.src); p.priced.count++; ok = true; break; } }
      if (!ok) p.priced.missing++;
    }
    return p;
  }
  /* Days and calendar years in German time (Europe/Berlin). Input: a day index (UTC midnight / DAY). */
  const yearOf = day => String(new Date(day * DAY).getUTCFullYear());
  /* Holding period: taxable when the time between acquisition and disposal is not more than one year (s. 23 (1) no. 2 EStG). Periods are counted with
     ss. 187 (1) and 188 (2)-(3) BGB (applied through s. 108 (1) AO): the period starts the day after the acquisition and ends at the end of the day of the
     next year with the same date; when that date does not exist (acquired on 29 February), it ends on 28 February. So a disposal on the anniversary day is
     still within one year, the day after is not. The weekend rule of s. 108 (3) AO is not applied (it concerns deadlines) - to verify. */
  function withinYear(aDay, dDay) { const a = new Date(aDay * DAY), y = a.getUTCFullYear() + 1, m = a.getUTCMonth(), last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const lim = Math.floor(Date.UTC(y, m, Math.min(a.getUTCDate(), last)) / DAY); return dDay <= lim; }
  /* Exemption limit for private sales (Freigrenze, s. 23 (3) sentence 5 EStG; BMF Rn. 53): below EUR 1,000 from 2024, below EUR 600 up to 2023. Years before 2009: not read, to verify. */
  const limitSales = y => +y >= 2024 ? 1000 : +y >= 2009 ? 600 : null;
  const LIMIT_INCOME = 256; /* s. 22 no. 3 sentence 2 EStG: income from services below EUR 256 in the calendar year is not taxable. */
  const SO_LINES = { sales: 'lines 43-49 or 45-49, and 56-57 (to verify: the official notes give both)', income: 'lines 14-21 (to verify)' };
  const r2 = v => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
  const EPS = 1e-12;
  const incKind = s => { s = norm(s); return /lend|interest|zins/.test(s) ? 'lending' : /min(e|ing)|forg/.test(s) ? 'mining' : /stak/.test(s) ? 'staking' : 'reward'; };
  /* v2.40: only passive staking and lending are counted in the s. 22 no. 3 total (BMF Rn. 48, 65). Mining (private or commercial, Rn. 34-45),
     airdrops (income only with something given in return, otherwise possibly a gift, Rn. 67-75) and other rewards (nature unknown) are listed
     apart, out of the total, to verify. Nothing is guessed. */
  const COUNTED = { staking: 1, lending: 1 };
  const incWhy = k => k === 'mining' ? 'mining: private (s. 22 no. 3) or commercial activity (BMF Rn. 34-45) - to verify'
    : k === 'airdrop' ? 'airdrop: income only if you gave something in return (BMF Rn. 70-75), otherwise possibly a gift - to verify'
    : k === 'reward' ? 'reward of unknown nature - to verify' : '';
  function compute(txs, opts) {
    opts = opts || {}; const fileTz = opts.fileTz || BERLIN, oneWallet = !opts.hasWallet;
    const dayOf = t => Math.floor(shiftTz(t, fileTz, BERLIN) / DAY);
    const lots = {}, disposals = [], income = [], notes = [], transfers = { count: 0, withFee: 0 }, gifts = [];
    const wal = t => oneWallet ? '' : (t.wallet || '(no wallet)');
    const add = (w, asset, qty, cost, day, line) => { const k = w + '|' + asset; (lots[k] = lots[k] || []).push({ qty, cost: cost == null || !isFinite(cost) ? null : cost, day, line }); };
    const take = (w, asset, qty, day) => { const L = lots[w + '|' + asset] || [], parts = []; let rest = qty;
      while (rest > EPS && L.length) { const l = L[0], m = Math.min(l.qty, rest), c = l.cost == null ? null : l.cost * m / l.qty;
        parts.push({ qty: m, cost: c, from: l.day, within: withinYear(l.day, day) }); l.qty -= m; if (l.cost != null) l.cost -= c; rest -= m; if (l.qty <= EPS) L.shift(); }
      return { parts, missing: rest > EPS ? rest : 0 }; };
    const dispose = (t, d, v, w, to) => {
      const { parts, missing } = take(w, t.asset, t.qty, d), fee = t.fee || 0;
      const P = parts.filter(p => p.within), X = parts.filter(p => !p.within), q = L => L.reduce((a, p) => a + p.qty, 0), cost = L => L.some(p => p.cost == null) ? null : L.reduce((a, p) => a + p.cost, 0);
      const qT = q(P) + missing, qX = q(X), share = qT / t.qty;
      const status = missing ? 'to verify: no acquisition found for ' + +missing.toPrecision(10) + ' ' + t.asset : v == null ? 'to verify: missing EUR value' : (qT > EPS && cost(P) == null) ? 'to verify: missing EUR cost' : 'ok';
      const pT = v == null ? null : v * share, fT = fee * share, cT = cost(P);
      disposals.push({ asset: t.asset, wallet: w, day: d, date: d * DAY, year: yearOf(d), qty: t.qty, line: t.line, to, proceeds: r2(v), fees: r2(fee),
        taxQty: qT, taxProceeds: r2(pT), taxCost: cT == null ? null : r2(cT), taxFees: r2(fT), gain: status === 'ok' && qT > EPS ? r2(pT - cT - fT) : null,
        exQty: qX, exProceeds: v == null ? null : r2(v * qX / t.qty), first: parts.length ? parts[0].from * DAY : null, parts, status, priced: t.priced || null });
    };
    for (const t of txs) {
      const d = dayOf(t.date), v = isFinite(t.eur) ? t.eur : null, w = wal(t);
      if (t.type === 'BUY') add(w, t.asset, t.qty, v == null ? null : v + (t.fee || 0), d, t.line);
      else if (t.type === 'SELL' || t.type === 'SPEND') dispose(t, d, v, w, null);
      else if (t.type === 'CONVERT') {
        if (!t.toAsset || !(t.toQty > 0)) { notes.push({ line: t.line, why: 'exchange without received asset or quantity: not computed' }); continue; }
        dispose(t, d, v, w, t.toAsset); add(w, t.toAsset, t.toQty, v, d, t.line);
      } else if (t.type === 'INCOME') { add(w, t.asset, t.qty, v, d, t.line); { const k = incKind(t.rawType); income.push({ line: t.line, day: d, year: yearOf(d), asset: t.asset, qty: t.qty, eur: r2(v), kind: k, type: t.rawType, counted: !!COUNTED[k], why: incWhy(k), priced: t.priced || null }); } }
      else if (t.type === 'AIRDROP') { add(w, t.asset, t.qty, v == null ? 0 : v, d, t.line); income.push({ line: t.line, day: d, year: yearOf(d), asset: t.asset, qty: t.qty, eur: r2(v), kind: 'airdrop', type: t.rawType, airdrop: true, counted: false, why: incWhy('airdrop'), priced: t.priced || null }); }
      else if (t.type === 'GIFT') { take(w, t.asset, t.qty, d); gifts.push({ line: t.line, day: d, year: yearOf(d), asset: t.asset, qty: t.qty }); }
      else if (t.type === 'TRANSFER') { transfers.count++; if (t.fee > 0) transfers.withFee++; }
    }
    disposals.sort((a, b) => a.day - b.day || (a.asset < b.asset ? -1 : 1));
    const holdings = {}; for (const k in lots) { const qq = lots[k].reduce((a, l) => a + l.qty, 0); if (qq > EPS) holdings[k] = +qq.toPrecision(10); }
    return { disposals, income, notes, transfers, gifts, holdings, fileTz, oneWallet, years: [...new Set(disposals.map(x => x.year).concat(income.map(x => x.year)))].sort() };
  }
  /* One calendar year: private sales within one year (FIFO), exemption limit all or nothing, income from services and its EUR 256 limit (all or nothing). */
  function yearSummary(res, y) {
    const D = res.disposals.filter(x => x.year === y), ok = D.filter(x => x.status === 'ok'), T = ok.filter(x => x.taxQty > EPS), sum = (L, f) => r2(L.reduce((a, x) => a + f(x), 0)) || 0;
    const gains = sum(T, x => Math.max(0, x.gain)), losses = sum(T, x => Math.max(0, -x.gain)), net = r2(gains - losses), limit = limitSales(y);
    /* Strictly below the limit: not taxable; from the limit on: the whole net gain. Lines to verify left out of the totals make "below" uncertain (null). */
    const tvN = D.filter(x => x.status !== 'ok').length;
    const exempt = limit == null ? null : net >= limit ? false : tvN ? null : true, taxableSales = exempt === false ? net : exempt === true ? 0 : null;
    const I = res.income.filter(x => x.year === y), incKnown = I.filter(x => x.eur != null && x.counted), incomeEur = sum(incKnown, x => x.eur);
    const incOpen = I.filter(x => !x.counted || x.eur == null), incomeOpenEur = sum(incOpen.filter(x => x.eur != null), x => x.eur);
    const incExempt = incomeEur >= LIMIT_INCOME ? false : incOpen.length ? null : true;
    const byKind = {}; incKnown.forEach(x => { byKind[x.kind] = r2((byKind[x.kind] || 0) + x.eur); });
    return { year: y, count: T.length, proceeds: sum(T, x => x.taxProceeds), costs: sum(T, x => x.taxCost), fees: sum(T, x => x.taxFees), gains, losses, net, limit, exempt, taxableSales,
      toVerify: D.filter(x => x.status !== 'ok'), disposals: D, taxRows: T, longRows: ok.filter(x => x.exQty > EPS), longProceeds: sum(ok.filter(x => x.exQty > EPS), x => x.exProceeds),
      income: I, incomeEur, incomeUnknown: I.filter(x => x.eur == null).length, incOpen, incomeOpenEur, incExempt, incomeTaxable: incExempt === false ? incomeEur : incExempt === true ? 0 : null, byKind, gifts: (res.gifts || []).filter(x => x.year === y) };
  }
  const eur = v => v == null || !isFinite(v) ? 'to verify' : (v < 0 ? '-' : '') + '\u20ac' + Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const p2 = n => String(n).padStart(2, '0');
  const dmy = t => { if (t == null) return 'unknown'; const d = new Date(t); return p2(d.getUTCDate()) + '.' + p2(d.getUTCMonth() + 1) + '.' + d.getUTCFullYear(); };
  const LEGAL = 'Not tax advice - estimate to verify. Rules: EStG s. 22 no. 2 and no. 3, s. 23 (1) no. 2 and (3), s. 2 (7); BMF letter of 6 March 2025 on crypto assets (BStBl I S. 658), Rn. 34-45, 43, 48, 53-63, 65, 67-75, 91; AO s. 108 with BGB ss. 187-188; ELSTER notes to Anlage SO 2025.';
  /* Open points, always listed (see docs/DE-RULES.md): nothing here is guessed. */
  const OPEN = [
    'Anlage SO line numbers: the official notes give lines 43-49 in one place and 45-49 in another (plus 56-57) for crypto assets; income from services: lines 14-21. The official form itself was not read - to verify.',
    'Fees: deducted from the disposal; for a disposal partly within and partly after one year, the fee is split by quantity (fees are costs of the disposal, BMF Rn. 57 and 59; the split method is not given in the texts read) - to verify.',
    'Exemption limit and losses: the limit is compared with the net result of the year (gains minus losses within one year); the order between the limit and losses is not stated in the texts read - to verify.',
    'Losses from private sales can only be set against gains from private sales; they may be carried back one year or forward (s. 23 (3) EStG with s. 10d EStG) - not computed, to verify.',
    'Utility and security tokens, and NFTs (not covered by the BMF letter, Rn. 5): treated like currency tokens here - to verify.',
    'Commercial activity (for example mining or trading as a business): other rules apply, not covered here - to verify.',
    'Holding period: counted with ss. 187-188 BGB (s. 108 (1) AO): a disposal on the anniversary day is still within one year (acquired on 29 February: until 28 February); the weekend rule of s. 108 (3) AO is not applied - to verify.',
    'Filing through ELSTER, deadlines and the Abgabenordnung (AO): not read - to verify.'
  ];
  function checks(res, Y, y) { const chk = [], tv = Y.toVerify;
    if (tv.length > 10) { const G = new Map(); tv.forEach(x => { if (!G.has(x.status)) G.set(x.status, []); G.get(x.status).push(dmy(x.date) + ' ' + x.asset); }); G.forEach((L, st) => chk.push(L.length + ' disposals: ' + st.replace(/^to verify: /, '') + ' - to verify (not in the totals): ' + L.join(', ') + '.')); }
    else tv.forEach(x => chk.push(`${dmy(x.date)} ${x.asset}: ${x.status.replace(/^to verify: /, '')} (not in the totals) - to verify.`));
    if (res.oneWallet) chk.push('No wallet or platform column in the files: all lines are treated as one single wallet for FIFO (BMF Rn. 61-62 ask for FIFO per wallet) - to verify.');
    else chk.push('FIFO per wallet or platform (column of the file) and per token. Transfers between your own wallets do not move the purchase lots here - to verify.');
    if (Y.limit == null) chk.push('Exemption limit for ' + y + ': not read - to verify.');
    { const G = new Map(); Y.incOpen.filter(x => x.why).forEach(x => { if (!G.has(x.why)) G.set(x.why, { n: 0, v: 0 }); const g = G.get(x.why); g.n++; g.v += x.eur || 0; });
      G.forEach((g, why) => chk.push(g.n + ' income line(s), ' + eur(r2(g.v)) + ': ' + why + ' (not in the income total).')); }
    if (Y.exempt === null && Y.limit != null) chk.push('Exemption limit of private sales: some disposals are to verify and not in the totals, so "below the limit" cannot be confirmed - to verify.');
    if (Y.incExempt === null) chk.push('EUR 256 limit for income from services: some income lines are to verify and not in the total, so "below the limit" cannot be confirmed - to verify.');
    chk.push('The EUR ' + (Y.limit == null ? '1,000 / 600' : Y.limit.toLocaleString('en-US')) + ' limit applies to the total gain of ALL your private sales of the year (s. 23 EStG), not only crypto assets: add gains or losses from other private sales not in these files - to verify.');
    chk.push('The EUR 256 limit applies to ALL your income from services of the year (s. 22 no. 3 EStG), not only staking and lending: add other such income not in these files - to verify.');
    if (Y.income.some(x => x.kind === 'staking')) chk.push('Staking counted as passive income from services (BMF Rn. 48); staking as a business or active forging may follow other rules (BMF Rn. 34-45) - to verify.');
    if (Y.incomeUnknown) chk.push(Y.incomeUnknown + ' income line(s) without an EUR value: not in the income total - to verify.');
    if (Y.gifts.length) chk.push(Y.gifts.length + ' gift(s) sent: removed from the lots, not a sale (no payment received) - to verify.');
    if (res.transfers && res.transfers.withFee) chk.push(res.transfers.withFee + ' transfer(s) with a fee: network fees paid in tokens are not handled - to verify.');
    if (res.priced && res.priced.count) chk.push(res.priced.count + ' missing EUR value(s) taken from the market price of the minute (' + res.priced.srcs.join(', ') + '; BMF Rn. 43 allows a market price from a platform or a price list; for an exchange, the value of the token received, Rn. 58) - to verify.');
    if (res.priced && res.priced.missing) chk.push(res.priced.missing + ' line(s) without an EUR value and without a market price found - to verify.');
    if (res.fx && res.fx.count) chk.push(res.fx.count + ' line(s) converted to EUR (' + res.fx.cur.join(', ') + ') with ' + FX_SRC + ', rate of the day or of the previous working day - to verify.');
    if (res.fx && res.fx.missing) chk.push(res.fx.missing + ' line(s) without an exchange rate: excluded from the totals - to verify.');
    { const K = (res.skipped || []).filter(x => x.kept), FEE = /^fee shown in the statement is taken as included/;
      if (K.some(x => FEE.test(x.why))) chk.push('Fees shown in the PDF statement are taken as included in the value - to verify.');
      if (res.feeNote) chk.push('Fees shown in the PDF statement are deducted from the disposal; for an exchange of one token for another, the fee is counted once, on the disposal (BMF Rn. 59) - to verify.');
      groupLines(K.filter(x => !FEE.test(x.why)), 1).forEach(g => chk.push(g.text + '.')); }
    groupLines(res.notes || [], 5).forEach(g => chk.push(g.text + '.'));
    OPEN.forEach(s => chk.push(s));
    return chk; }
  const st = Y => Y.limit == null ? 'to verify' : Y.net < 0 && Y.exempt !== false ? (Y.exempt === null ? 'loss (lines to verify)' : 'loss') : Y.exempt === true ? 'below the limit: not taxable' : Y.exempt === false ? 'limit reached: the whole gain is taxable' : 'below the limit for the lines read, but lines to verify - to verify';
  const stInc = Y => Y.incExempt === true ? 'below the limit: not taxable' : Y.incExempt === false ? 'limit reached: the whole income is taxable' : 'below the limit for the lines counted, but lines to verify - to verify';
  function toCSV(res, y) {
    const Y = yearSummary(res, y), q = v => { const s = String(v == null ? '' : v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }, n = v => v == null ? 'to verify' : v.toFixed(2);
    const L = [['Kryptax Germany - Anlage SO summary (estimate, to verify)'], ['Year', y + ' (calendar year)'], [],
      ['Private sales within one year (s. 23 EStG)', 'Anlage SO ' + SO_LINES.sales, 'Amount (EUR)'], ['', 'Number of disposals', Y.count], ['', 'Sale proceeds', n(Y.proceeds)], ['', 'Acquisition costs', n(Y.costs)], ['', 'Fees (costs of the disposal)', n(Y.fees)],
      ['', 'Gains', n(Y.gains)], ['', 'Losses', n(Y.losses)], ['', 'Net result', n(Y.net)], ['', 'Exemption limit (below this amount, not taxable)', Y.limit == null ? 'to verify' : n(Y.limit)], ['', 'Status', st(Y)], [],
      ['Income from services (s. 22 no. 3 EStG)', 'Anlage SO ' + SO_LINES.income, 'Amount (EUR)'], ['', 'Total counted (staking, lending)', n(Y.incomeEur)], ['', 'Listed apart, to verify (mining, airdrops, other rewards)', n(Y.incomeOpenEur)], ['', 'Exemption limit (below this amount, not taxable)', n(LIMIT_INCOME)], ['', 'Status', stInc(Y)], [],
      ['Date', 'Wallet', 'Asset', 'Quantity', 'Within one year: quantity', 'Proceeds', 'Cost', 'Fees', 'Gain or loss', 'After one year: quantity (not taxable)', 'After one year: proceeds', 'Status']];
    Y.disposals.forEach(x => L.push([dmy(x.date), x.wallet || 'single wallet', x.asset + (x.to ? ' to ' + x.to : ''), +x.qty.toPrecision(10), +x.taxQty.toPrecision(10), n(x.taxProceeds), n(x.taxCost), n(x.taxFees), n(x.gain), +x.exQty.toPrecision(10), n(x.exProceeds), x.status]));
    if (Y.income.length) { L.push([], ['Income (staking, lending, mining, airdrops)'], ['Date', 'Asset', 'Quantity', 'Value (EUR)', 'Kind', 'Type', 'In total']); Y.income.forEach(x => L.push([dmy(x.day * DAY), x.asset, +x.qty.toPrecision(10), x.eur == null ? 'value missing - to verify' : n(x.eur), x.kind, x.type, x.counted && x.eur != null ? 'yes' : 'no - to verify'])); }
    L.push([], ['No tax computed (progressive rate, s. 32a EStG, depends on your whole income).'], [], ['To verify']); checks(res, Y, y).forEach(c => L.push([c]));
    L.push([], [LEGAL]);
    return L.map(r => r.map(q).join(',')).join('\r\n') + '\r\n';
  }
  const ascii = s => String(s == null ? '' : s).replace(/\u20ac/g, 'EUR ').replace(/\u00a3/g, 'GBP ').replace(/[\u2013\u2014]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u00a0\u2007\u2009\u202f]/g, ' ').replace(/\u2026/g, '...').replace(/\u2212/g, '-').replace(/\u00d7/g, 'x').replace(/\u2264/g, '<=').replace(/\u2265/g, '>=').replace(/\u00a7/g, 's.').replace(/\u00e4/g, 'ae').replace(/\u00f6/g, 'oe').replace(/\u00fc/g, 'ue').replace(/\u00df/g, 'ss').replace(/[^\x20-\x7e]/g, '?');
  /* PDF lines, ASCII only (tested). */
  function pdfData(res, y, now) {
    const Y = yearSummary(res, y); now = now || new Date();
    const info = ['Year ' + y + ' (calendar year). Generated ' + now.getUTCFullYear() + '-' + p2(now.getUTCMonth() + 1) + '-' + p2(now.getUTCDate()) + ' UTC.',
      'FIFO per ' + (res.oneWallet ? 'single wallet (no wallet column, to verify)' : 'wallet or platform') + ' and per token; holding period of one year. Days in German time (Europe/Berlin); times in file: ' + res.fileTz + '.',
      'Private sales within one year (Anlage SO ' + SO_LINES.sales + '): disposals ' + Y.count + ' | proceeds ' + eur(Y.proceeds) + ' | costs ' + eur(Y.costs) + ' | fees ' + eur(Y.fees) + ' | gains ' + eur(Y.gains) + ' | losses ' + eur(Y.losses),
      'Net result ' + eur(Y.net) + ' | exemption limit ' + (Y.limit == null ? 'to verify' : eur(Y.limit)) + ' | ' + st(Y) + '.',
      'Income from services (Anlage SO ' + SO_LINES.income + '): ' + eur(Y.incomeEur) + ' | limit ' + eur(LIMIT_INCOME) + ' | ' + stInc(Y) + '.',
      'Disposals after one year (not taxable): ' + Y.longRows.length + ', proceeds ' + eur(Y.longProceeds) + '. No tax computed (rate depends on your whole income).'];
    checks(res, Y, y).forEach(c => info.push('To verify: ' + c.replace(/ - to verify\.?$/g, '.')));
    const rows = Y.disposals.map(x => [dmy(x.date), x.asset + (x.to ? ' to ' + x.to : ''), String(+x.qty.toPrecision(10)), String(+x.taxQty.toPrecision(10)), eur(x.taxProceeds), eur(x.taxCost), eur(x.taxFees), eur(x.gain), String(+x.exQty.toPrecision(10)), x.status === 'ok' ? '' : x.status].map(ascii));
    return { title: 'Kryptax Germany - Anlage SO summary (estimate)', info: info.map(ascii), head: ['Date', 'Asset', 'Qty', 'Qty <= 1 year', 'Proceeds', 'Cost', 'Fees', 'Gain/loss', 'Qty > 1 year', 'Status'], rows, foot: ascii(LEGAL) };
  }
  function pdf(jsPDF, res, y) {
    const D = pdfData(res, y), doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' }); let yy = 40;
    const t0 = doc.text.bind(doc); doc.text = (s, ...a) => t0(Array.isArray(s) ? s.map(ascii) : ascii(s), ...a);
    doc.setFontSize(14); doc.text(D.title, 40, yy); yy += 20; doc.setFontSize(9);
    D.info.forEach(l => { doc.splitTextToSize(l, 760).forEach(s => { doc.text(s, 40, yy); yy += 12; }); });
    if (doc.autoTable) doc.autoTable({ head: [D.head], body: D.rows, startY: yy + 6, styles: { fontSize: 8 }, margin: { left: 40, right: 40 } });
    const n = doc.getNumberOfPages(); for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.text(D.foot, 40, doc.internal.pageSize.getHeight() - 20); }
    return doc;
  }
  /* Several imported files (same as the U.K. mode). A wallet column in any file switches FIFO to per wallet; files without it use the file name as wallet then. */
  function mergeFiles(L) {
    const hasWallet = L.some(f => f.p.hasWallet);
    if (L.length === 1) return Object.assign({}, L[0].p, { dupes: 0, tzMix: false, hasWallet });
    const K = t => [t.date, t.type, t.asset, t.qty, t.amt, t.toAsset || '', t.toQty || ''].join('|'), seen = new Set(), out = Object.assign({}, L[0].p, { txs: [], skipped: [], dupes: 0, tzMix: false, hasWallet, priced: { count: 0, missing: 0, srcs: [] } });
    L.forEach((f, i) => { const mine = new Set(), pre = 'F' + (i + 1) + ':';
      f.p.txs.forEach(t => { const k = K(t); if (seen.has(k)) { out.dupes++; return; } mine.add(k); out.txs.push(Object.assign({}, t, { line: pre + t.line, wallet: t.wallet || (hasWallet ? f.name : '') })); });
      mine.forEach(k => seen.add(k)); (f.p.skipped || []).forEach(s => out.skipped.push(Object.assign({}, s, { line: pre + s.line })));
      if (i && (f.p.fileTz || '') !== (L[0].p.fileTz || '')) out.tzMix = true; if (f.p.fx) { out.fx = out.fx || { src: f.p.fx.src, count: 0, cur: [], missing: 0 }; if (i) { out.fx.count += f.p.fx.count; out.fx.missing += f.p.fx.missing || 0; f.p.fx.cur.forEach(c => { if (!out.fx.cur.includes(c)) out.fx.cur.push(c); }); } } if (f.p.feeNote) out.feeNote = true;
      if (f.p.priced) { out.priced.count += f.p.priced.count; out.priced.missing += f.p.priced.missing; f.p.priced.srcs.forEach(s => { if (!out.priced.srcs.includes(s)) out.priced.srcs.push(s); }); } });
    out.txs.sort((a, b) => a.date - b.date); return out;
  }
  const api = { ranges, groupLines, checks, curOf, fromPdfLines, convertFx, rateOn, FX_SRC, COLS, mapHeader, kind, parseRows, fromCSVText, fromWorkbook, deDate, compute, yearSummary, toCSV, pdfData, pdf, eur, dmy, shiftTz, withinYear, limitSales, LIMIT_INCOME, SO_LINES, OPEN, priceMissing, mergeFiles, ascii, LEGAL };
  /* ---------- page (browser only) ---------- */
  function mount(doc) {
    const box = doc.getElementById('demode'); if (!box || box.dataset.ready) return; box.dataset.ready = '1';
    const inp = doc.getElementById('defile'), out = doc.getElementById('deresult'), tzSel = doc.getElementById('detz'); if (!inp || !out) return;
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]), W = typeof window !== 'undefined' ? window : root;
    let cur = null, full = null, year = null, fileTz = BERLIN, name = '';
    let browserTz = 'UTC'; try { browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (x) {}
    if (tzSel) { const L = [[BERLIN, 'German time (Europe/Berlin)'], ['UTC', 'UTC']]; if (browserTz !== BERLIN && browserTz !== 'UTC') L.push([browserTz, 'This browser (' + browserTz + ')']);
      tzSel.innerHTML = L.map(z => `<option value="${esc(z[0])}">${esc(z[1])}</option>`).join(''); tzSel.addEventListener('change', () => { fileTz = tzSel.value; if (cur) render(); }); }
    const stamp = (p, ext) => { const d = new Date(); return p + '_' + d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '.' + ext; };
    const save = (blob, fn) => { const a = doc.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fn; doc.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
    const num = v => String(+v.toPrecision(10));
    function render() {
      full = compute(cur.txs, { fileTz, hasWallet: cur.hasWallet }); full.fx = cur.fx; full.skipped = cur.skipped; full.feeNote = cur.feeNote; full.priced = cur.priced; const Ys = full.years; if (!year || !Ys.includes(year)) year = Ys.length ? Ys[Ys.length - 1] : null;
      if (!year) { out.innerHTML = '<p class="warn">' + esc(name) + ': no disposal or income found. Nothing to report.</p>' + skippedHtml(); return; }
      const Y = yearSummary(full, year), c = (l, v, k) => `<div><span>${l}</span><b class="${k || ''}">${v}</b></div>`;
      const sel = Ys.length > 1 ? `<div class="grid"><label>Year <select id="deyear">${Ys.map(y => `<option value="${y}"${y === year ? ' selected' : ''}>${y}</option>`).join('')}</select></label></div>` : '';
      const tr = Y.disposals.map(x => `<tr class="${x.status === 'ok' ? '' : 'tv'}"><td>${dmy(x.date)}</td><td>${esc(x.asset)}${x.to ? ' <span class="hint">to ' + esc(x.to) + '</span>' : ''}${full.oneWallet ? '' : '<br><span class="hint">' + esc(x.wallet) + '</span>'}</td><td>${num(x.qty)}</td><td>${num(x.taxQty)}</td><td>${eur(x.taxProceeds)}</td><td>${eur(x.taxCost)}</td><td>${eur(x.taxFees)}</td><td>${x.taxQty > EPS ? eur(x.gain) : '-'}</td><td>${num(x.exQty)}</td></tr>`
        + (x.status === 'ok' ? '' : `<tr class="tv"><td colspan="9"><b>${esc(x.status)}</b></td></tr>`)).join('');
      const chk = checks(full, Y, year).map(esc), stt = st(Y);
      out.innerHTML = `<h2 class="usreshead">2. Result ${esc(year)}</h2>` + sel
        + '<div class="kxkpi halo" aria-hidden="true">' + c('Private sales (within one year)', eur(Y.net), Y.net < 0 ? 'neg' : 'pos') + c('Income from services', eur(Y.incomeEur)) + c('Sales after one year (not taxable)', eur(Y.longProceeds)) + '</div>'
        + `<div class="note usguide"><b>Anlage SO ${esc(year)}: private sales of crypto assets (s. 23 EStG)</b><div class="scroll"><table class="us8949 uksa"><tr><th>Item</th><th>Amount</th></tr>`
        + [['Disposals within one year', String(Y.count)], ['Sale proceeds', eur(Y.proceeds)], ['Acquisition costs', eur(Y.costs)], ['Fees', eur(Y.fees)], ['Gains', eur(Y.gains)], ['Losses', eur(Y.losses)], ['Net result', eur(Y.net)]].map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')
        + `</table></div><span class="hint">Anlage SO ${esc(SO_LINES.sales)}. Only the disposals in these files.</span></div>`
        + `<div class="note total-global" role="status">Net result: <b>${eur(Y.net)}</b><br>Exemption limit ${esc(year)}: <b>${Y.limit == null ? 'to verify' : 'below ' + eur(Y.limit)}</b> · <b>${esc(stt)}</b><br>`
        + (Y.net < 0 ? 'Loss: only against gains from private sales; it may be carried back or forward (s. 23 (3) and s. 10d EStG) - to verify.<br>' : '')
        + `<span class="hint">All or nothing: below the limit the gain is not taxable, from the limit on the whole gain is taxable (s. 23 (3) EStG). No tax computed: the rate depends on your whole income. Calendar year; days in German time. Estimate, not tax advice.</span></div>`
        + `<div class="note"><b>Income from services (s. 22 no. 3 EStG): ${eur(Y.incomeEur)}</b><br>Limit: below ${eur(LIMIT_INCOME)} · <b>${stInc(Y)}</b>`
        + (Object.keys(Y.byKind).length ? '<br>' + Object.keys(Y.byKind).map(k => esc(k) + ' ' + eur(Y.byKind[k])).join(' · ') : '') + `<br><span class="hint">Staking and lending counted at the market value when received (BMF Rn. 48, 65); mining, airdrops and other rewards listed apart, to verify (BMF Rn. 34-45, 70-75). Anlage SO ${esc(SO_LINES.income)}.</span></div>`
        + (Y.income.length ? `<details class="usdet"><summary>Income lines (${Y.income.length})</summary><div class="scroll"><table class="us8949"><tr><th>Date</th><th>Asset</th><th>Quantity</th><th>Value EUR</th><th>Kind</th></tr>${Y.income.map(x => `<tr class="${x.eur == null || !x.counted ? 'tv' : ''}"><td>${dmy(x.day * DAY)}</td><td>${esc(x.asset)}</td><td>${num(x.qty)}</td><td>${x.eur == null ? 'value missing - to verify' : eur(x.eur)}${x.priced ? ' <span class="hint">(market price)</span>' : ''}</td><td>${esc(x.kind)}</td></tr>`).join('')}</table></div></details>` : '')
        + `<div class="note"><b>To verify (${chk.length})</b><ul>${chk.map(x => '<li>' + x + '</li>').join('')}</ul></div>`
        + `<details class="usdet" open><summary>Disposals (${Y.disposals.length})</summary><div class="scroll"><table class="us8949"><tr><th>Date</th><th>Asset</th><th>Quantity</th><th>Within 1 year</th><th>Proceeds</th><th>Cost</th><th>Fees</th><th>Gain/loss</th><th>After 1 year (not taxable)</th></tr>${tr}</table></div></details>`
        + skippedHtml()
        + `<p class="usexp"><button type="button" id="depdf" class="btn"${W.jspdf ? '' : ' hidden'}>Download PDF summary</button> <button type="button" id="decsv" class="btn ghost">Download CSV (summary)</button></p>`;
    }
    const skippedHtml = () => { const S = cur ? cur.skipped.filter(x => !x.kept) : []; return S.length ? `<p class="hint">${S.length} line${S.length > 1 ? 's' : ''} skipped: ${esc(groupLines(S, 5).map(g => g.text).join('; '))}.</p>` : ''; };
    out.addEventListener('change', e => { if (e.target.id === 'deyear') { year = e.target.value; render(); } });
    out.addEventListener('click', e => {
      if (!full || !year) return;
      if (e.target.id === 'decsv') save(new Blob(['\uFEFF', toCSV(full, year)], { type: 'text/csv;charset=utf-8' }), stamp('kryptax-de-summary', 'csv'));
      if (e.target.id === 'depdf' && W.jspdf) pdf(W.jspdf.jsPDF, full, year).save(stamp('kryptax-de-summary', 'pdf'));
    });
    { const hb = doc.getElementById('dehelpbtn'), hp = doc.getElementById('dehelppanel'); if (hb && hp) hb.addEventListener('click', () => { const op = hp.hidden; hp.hidden = !op; hb.setAttribute('aria-expanded', String(op)); }); }
    { const rb = doc.getElementById('dereset'); if (rb) rb.addEventListener('click', () => { if (!W.confirm('Reset everything? The imported files and the results on this page will be cleared.')) return; cur = full = null; year = null; inp.value = ''; out.innerHTML = ''; files.length = 0; fmsg.innerHTML = ''; dirtyFiles(); }); }
    const zone = doc.getElementById('deimp');
    if (zone) { const has = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
      zone.addEventListener('dragover', e => { if (has(e)) { e.preventDefault(); zone.classList.add('dropover'); } });
      zone.addEventListener('dragleave', () => zone.classList.remove('dropover'));
      zone.addEventListener('drop', e => { zone.classList.remove('dropover'); if (!has(e)) return; e.preventDefault(); try { inp.files = e.dataTransfer.files; inp.dispatchEvent(new Event('change')); } catch (x) {} }); }
    inp.multiple = true; const files = [], flist = doc.createElement('ul'), vbtn = doc.createElement('button'), fmsg = doc.createElement('div');
    flist.className = 'flist'; flist.id = 'deflist'; flist.hidden = true; vbtn.type = 'button'; vbtn.className = 'btn validate'; vbtn.id = 'devalidate'; vbtn.textContent = 'Confirm imports'; vbtn.disabled = true; fmsg.id = 'defmsg';
    { const ib = doc.getElementById('deimp'); if (ib) { ib.appendChild(flist); ib.appendChild(vbtn); ib.appendChild(fmsg); } else { out.parentNode.insertBefore(flist, out); out.parentNode.insertBefore(vbtn, out); out.parentNode.insertBefore(fmsg, out); } }
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
      const note = (m.dupes ? '<p class="warn">' + m.dupes + ' line' + (m.dupes > 1 ? 's' : '') + ' already found in an earlier file: counted once (to verify).</p>' : '') + (m.tzMix ? '<p class="warn">The files do not use the same time zone; the time zone of the first file is used (to verify).</p>' : '');
      vbtn.disabled = true; name = files.map(x => x.name).join(', '); cur = m; year = null; render(); if (note) out.insertAdjacentHTML('afterbegin', note); });
    async function readOne(f) {
      const data = new Uint8Array(await f.arrayBuffer()); let p;
      try { if (/\.(xlsx|xls)$/i.test(f.name)) { if (!W.XLSX) { return { err: '<p class="warn">Excel reading is not available. Please reload the page.</p>' }; } p = fromWorkbook(W.XLSX, data); }
        else if (/\.pdf$/i.test(f.name)) { if (!W.pdfjsLib || !KP) { return { err: '<p class="warn">PDF reading is not available. Please reload the page.</p>' }; }
          W.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js'; out.innerHTML = '<p class="hint">Reading the PDF…</p>';
          const d = await W.pdfjsLib.getDocument({ data, isEvalSupported: false }).promise; let lines = [];
          for (let i = 1; i <= d.numPages; i++) { const c = await (await d.getPage(i)).getTextContent(); lines = lines.concat(KP.itemsToLines(c.items)); }
          p = fromPdfLines(lines); if (!p.txs.length) { return { err: '<p class="warn">' + esc(f.name) + ': no crypto transaction found in this PDF. Nothing was computed.</p>' }; } }
        else p = fromCSVText(data); }
      catch (x) { return { err: '<p class="warn">' + esc(f.name) + ': this file could not be read. Nothing was computed.</p>' }; }
      if (p.missingCols.length) { return { err: '<p class="warn">' + esc(f.name) + ': columns not found: ' + esc(p.missingCols.join(', ')) + '. Expected at least Date, Type, Asset, Quantity, plus Total or Price.</p>' }; }
      if (p.txs.some(t => t.needFx)) { out.innerHTML = '<p class="hint">Converting to EUR (ECB reference rates)…</p>';
        await convertFx(p, async u => { const r = await fetch(u); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
      if (KP && KP.makeSources && p.txs.some(t => !t.needFx && !isFinite(t.eur))) { out.innerHTML = '<p class="hint">Looking up missing EUR values (market price of the minute)…</p>';
        try { const ts = p.txs.map(t => shiftTz(t.date, fileTz, 'UTC')); await priceMissing(p, KP.makeSources((u, o) => fetch(u, o), { from: Math.min(...ts) - DAY, to: Math.max(...ts) + DAY }), fileTz); } catch (x) {} out.innerHTML = ''; }
      return { p };
    }
  }
  api.mount = mount;
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount(document)); else mount(document); }
  if (node) module.exports = api; else root.KryptaxDE = api;
})(typeof window !== 'undefined' ? window : this);
