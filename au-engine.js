/* Kryptax - Australia module v1 (beta; separate from the France, U.S.A., U.K., Germany and Canada modes: engine.js / formats.js / pipeline.js are only READ).
   Capital gains tax (CGT) estimate on crypto assets for an Australian-resident INDIVIDUAL investor (capital account), in AUD, by income year (1 July to 30 June).
   Not a trader or a business, not the progressive income tax. Not tax advice. Sources and statuses: docs/AU-RULES.md.
   - CGT events (ATO "Crypto asset transactions", updated 22 June 2026): sell, gift, swap for another crypto, convert to AUD or foreign currency, buy goods or services.
     A transfer between your own wallets is not listed as a disposal (no change of ownership): no CGT event here, the parcel keeps its date and cost base.
   - Parcels: each crypto asset is a separate CGT asset; units are matched FIRST-IN FIRST-OUT (FIFO) per token, across all files (ATO shares/units guidance lists FIFO as a
     common method). Other identification (specific, HIFO...) is possible only with records proving it: not computed, flagged.
   - Net capital gain (ITAA 1997 s 102-5 / s 100-50; ATO myTax 2026 "Net capital gain"): current-year losses, then unapplied prior-year net capital losses, then the 50% CGT discount
     (Division 115) on remaining discount capital gains. Losses go first against gains NOT eligible for the discount (ATO "usual best order").
   - CGT discount 50%: parcel owned at least 12 months before the CGT event, excluding the day of acquisition and the day of the event (ATO "CGT discount"), AND Australian resident
     for tax purposes (confirmed by the user; never assumed). 2027-28 and later: CGT reform (Treasury Laws Amendment (Tax Reform No. 1) Act 2026, No. 49) not implemented: blocked.
   - Staking rewards: ordinary income when received, cost base = market value then (ATO "Staking rewards and airdrops", 19 Aug 2026). Airdrops: depends on the facts
     (draft ruling TR 2026/D1): listed to review, cost base = market value if given in the file, otherwise unknown (never a zero cost invented).
   - Personal use asset exemption: never applied (ATO: crypto held as an investment is not a personal use asset). Wash sales: no automatic 30-day rule in Australia;
     a loss with a repurchase nearby is only flagged (ATO TR 2008/1, Part IVA).
   - AUD conversion: RBA daily rates (table F11.1, "A$1 = x") when the user imports the RBA file; otherwise ECB reference rates via Frankfurter (not the RBA): flagged.
     Rate of the day (tax-zone date) or of the closest previous published day (at most 7 days back). Stablecoins are crypto assets, never USD. */
(function (root) {
  'use strict';
  const node = typeof require !== 'undefined' && typeof module !== 'undefined';
  const E = node ? require('./engine.js') : root.KryptaxEngine;
  const KF = node ? require('./formats.js') : root.KryptaxFormats;
  const KP = node ? require('./pipeline.js') : root.KryptaxPipeline;
  const DAY = 864e5, SYD = 'Australia/Sydney';
  /* Australian time zones for tax dates (half-hour offsets and Lord Howe half-hour daylight saving included). */
  const AU_TZ = [[SYD, 'NSW / ACT (Sydney, Canberra)'], ['Australia/Melbourne', 'Victoria (Melbourne)'], ['Australia/Brisbane', 'Queensland (Brisbane, no daylight saving)'], ['Australia/Adelaide', 'South Australia (Adelaide, UTC+9:30 / +10:30)'],
    ['Australia/Darwin', 'Northern Territory (Darwin, UTC+9:30, no daylight saving)'], ['Australia/Perth', 'Western Australia (Perth, UTC+8)'], ['Australia/Hobart', 'Tasmania (Hobart)'], ['Australia/Lord_Howe', 'Lord Howe Island (UTC+10:30 / +11)']];
  const AU_ZONES = AU_TZ.map(z => z[0]).concat(['Australia/Canberra', 'Australia/ACT', 'Australia/NSW', 'Australia/Victoria', 'Australia/Queensland', 'Australia/South', 'Australia/North', 'Australia/West', 'Australia/Tasmania', 'Australia/Broken_Hill', 'Australia/Lindeman', 'Australia/Currie', 'Australia/Yancowinna', 'Australia/LHI']);
  const tzName = z => { const f = AU_TZ.find(x => x[0] === z); return (f ? f[1] + ' ' : '') + '(' + z + ')'; };
  /* Tax-date zone: chosen > file zone if Australian > browser zone if Australian > Sydney. */
  function resolveTaxTz(choice, fileTz, browserTz) {
    if (choice && choice !== 'auto' && AU_ZONES.includes(choice)) return { tz: choice, how: 'chosen' };
    if (AU_ZONES.includes(fileTz)) return { tz: fileTz, how: 'same zone as the file' };
    if (AU_ZONES.includes(browserTz)) return { tz: browserTz, how: 'this browser\'s zone' };
    return { tz: SYD, how: 'default (Sydney)' };
  }
  const COLS = {
    date: ['date', 'time', 'timestamp', 'date (utc)', 'datetime', 'date & time', 'date and time', 'date/time', 'date et heure'],
    type: ['type', 'side', 'transaction type', 'action', 'operation', 'opération', 'type de transaction'],
    asset: ['asset', 'symbol', 'coin', 'crypto', 'token', 'cryptocurrency', 'actif', 'jeton'],
    qty: ['quantity', 'qty', 'amount', 'units', 'volume', 'quantité', 'quantite'],
    price: ['price', 'unit price', 'spot price', 'price aud', 'price (aud)', 'prix'],
    total: ['total', 'value', 'subtotal', 'proceeds', 'total value', 'consideration', 'total aud', 'total (aud)', 'value (aud)', 'valeur', 'montant'],
    fee: ['fee', 'fees', 'commission', 'brokerage', 'fee aud', 'fee (aud)', 'frais'],
    feeAsset: ['fee asset', 'fee currency', 'fee coin', 'fee token', 'fee unit'],
    toAsset: ['received asset', 'to asset', 'asset received', 'buy asset', 'actif reçu'],
    toQty: ['received quantity', 'to quantity', 'quantity received', 'buy quantity', 'quantité reçue']
  };
  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
  const CURS = 'AUD|USD|EUR|GBP|CAD|NZD|JPY|CHF|CNY|SGD|HKD|KRW|INR|THB|TWD|MYR|IDR|VND|AED|PGK|ZAR|PHP|SEK|NOK';
  /* Stablecoins are crypto assets (their own CGT assets), never treated as USD or any currency. */
  const STABLES = ['USDT', 'USDC', 'DAI', 'BUSD', 'FDUSD', 'TUSD', 'USDP', 'PYUSD', 'USDD', 'EURC', 'EURT', 'AUDD', 'GUSD', 'USDE', 'FRAX', 'LUSD'];
  const strip = n => n.replace(new RegExp('\\s*\\((?:' + CURS.toLowerCase() + '|' + STABLES.join('|').toLowerCase() + '|\\$|a\\$|au\\$|us\\$|\u20ac|\u00a3)\\)$|\\s+(?:' + CURS.toLowerCase() + ')$'), '');
  function mapHeader(head) { const h = head.map(x => { const n = norm(x); return Object.values(COLS).some(L => L.includes(n)) ? n : strip(n); }), m = {};
    for (const k in COLS) { const i = h.findIndex(x => COLS[k].includes(x)); if (i > -1) m[k] = i; } return m; }
  /* Currency of a cell or header. Bare "$" is AMBIGUOUS (AUD or USD): never guessed. A stablecoin code means a crypto value, not a currency. */
  const curOf = v => { const s = String(v == null ? '' : v); if (new RegExp('\\b(' + STABLES.join('|') + ')\\b', 'i').test(s)) return 'STABLE';
    if (/\bAUD\b|A\$|AU\$/i.test(s)) return 'AUD'; if (/US\$|\bUSD\b/i.test(s)) return 'USD'; if (/\u20ac|\bEUR\b/i.test(s)) return 'EUR'; if (/\u00a3|\bGBP\b/i.test(s)) return 'GBP';
    const m = new RegExp('\\b(' + CURS + ')\\b', 'i').exec(s); if (m) return m[1].toUpperCase(); if (/\$/.test(s)) return 'AMBIG'; return null; };
  function headCurrency(head) { for (const x of head.map(norm)) if (/^(price|total|value|fee|fees|subtotal|proceeds|consideration|prix|valeur|montant|frais)\b/.test(x)) { const c = curOf(x); if (c) return c; } return null; }
  function kind(t) {
    t = norm(t);
    if (/^(purchase of goods|goods|paiement)/.test(t)) return 'SPEND';
    if (/^(buy|purchase|bought|achat|achet)/.test(t)) return 'BUY';
    if (/^(sell|sold|sale|vente|vendu)/.test(t)) return 'SELL';
    if (/airdrop/.test(t)) return 'AIRDROP';
    if (/gift|donat|\bdon\b/.test(t)) return 'GIFT';
    if (/spend|payment|pay /.test(t)) return 'SPEND';
    if (/convert|exchange|swap|trade|échange|echange|conversion/.test(t)) return 'CONVERT';
    if (/mining|minage/.test(t)) return 'MINING';
    if (/stak|reward|interest|income|earn|learn|lending|récompense|recompense|intérêt|interet/.test(t)) return 'INCOME';
    if (/send|sent|withdraw|transfer|receive|deposit|envoi|retrait|transfert|réception|reception|dépôt|depot/.test(t)) return 'TRANSFER';
    return null;
  }
  const num = v => { if (v == null || String(v).trim() === '') return NaN; if (typeof v === 'number') return Math.abs(v);
    const n = E.parseNum(String(v).replace(/US\$|AU\$|A\$|[\u00a3$\u20ac]/g, '').replace(new RegExp('\\b(?:' + CURS + '|' + STABLES.join('|') + ')\\b', 'gi'), '')); return isFinite(n) ? Math.abs(n) : NaN; };
  /* Dates: ISO (YYYY-MM-DD) read directly; DD/MM or MM/DD decided for the WHOLE file (a day > 12 decides), otherwise the line is rejected (never guessed).
     An explicit offset (Z, UTC, +10:00, -05:00) gives the exact instant (tz = 'UTC'). A date without a time stays a calendar day (never shifted).
     Excel date cells: serial number read as the file's wall-clock time (independent of the browser zone); 1904 calendar handled. */
  const OFF = /(?:\s*(?:UTC|GMT|Z)|\s*(?:UTC|GMT)?\s*([+-])(\d{2}):?(\d{2}))$/i;
  function slashOrder(vals) { let dmy = false, mdy = false; for (const v of vals) { const m = /^\s*(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/.exec(String(v == null ? '' : v)); if (!m) continue; if (+m[1] > 12) dmy = true; if (+m[2] > 12) mdy = true; } return dmy && mdy ? 'BAD' : dmy ? 'DMY' : mdy ? 'MDY' : 'AMB'; }
  function auDate(v, order) {
    if (typeof v === 'string' && /^XLSERIAL:/.test(v)) { const w = Math.round((+v.slice(9) - 25569) * 86400) * 1000; return isFinite(w) ? { date: w, dateOnly: w % DAY === 0 } : { date: NaN }; }
    if (v instanceof Date || typeof v === 'number') return { date: NaN };
    let s = String(v == null ? '' : v).trim(); if (!s) return { date: NaN };
    const o = OFF.exec(s); let off = null; if (o) { off = o[1] ? (o[1] === '-' ? -1 : 1) * ((+o[2]) * 60 + (+o[3])) : 0; s = s.slice(0, o.index).trim(); }
    if (/^\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}/.test(s)) { if (order !== 'DMY' && order !== 'MDY') return { date: NaN, amb: true }; }
    const w = E.parseDate(s.replace('T', ' '), order === 'MDY' ? 'MDY' : 'DMY', 'UTC'); if (!isFinite(w)) return { date: NaN };
    const dateOnly = !/\d{1,2}:\d{2}/.test(s);
    if (off != null) return { date: w - off * 6e4, tz: 'UTC', dateOnly: false };
    return { date: w, dateOnly };
  }
  function headerIndex(rows) { for (let i = 0; i < Math.min(25, rows.length); i++) { const m = mapHeader(rows[i] || []); if (['date', 'type', 'asset', 'qty'].every(k => m[k] != null)) return i; } return 0; }
  /* Binance "Transaction History" (shared reader formats.js): amounts in their own currency (converted to AUD), token swaps and rewards without a value in the file:
     value missing, to verify (never guessed). Times: exact UTC instant when the file states its offset (e.g. UTC+1). */
  function fromBinance(BL) {
    const out = { txs: [], skipped: BL.skipped.slice(), missingCols: [], currency: null, platform: BL.platform, tzNote: BL.tzNote, binance: true }, noVal = [];
    for (const e of BL.events) {
      const t = { line: e.line, date: e.date, type: e.type, rawType: e.rawType, asset: e.asset, qty: e.qty, amt: NaN, feeAmt: 0, cur: 'AUD', toAsset: e.toAsset || '', toQty: e.toQty || NaN };
      if (e.tz) t.tz = e.tz; if (e.dir) t.dir = e.dir;
      if (e.type === 'BUY' || e.type === 'SELL' || e.type === 'SPEND') { t.amt = e.amt; t.cur = e.cur; t.feeAmt = e.feeAmt || e.feeCurAmt || 0;
        if (e.type === 'BUY' && e.feeQty > 0) { t.qty = Math.max(0, e.qty - e.feeQty); out.skipped.push({ line: e.line, why: 'fee paid in the token bought: quantity received net of the fee; the fee is not added to the cost base (to verify)', kept: true }); } }
      else if (e.type !== 'TRANSFER') noVal.push(e.line);
      if (t.qty > 0) push(out, t);
    }
    noVal.forEach(l => out.skipped.push({ line: l, why: 'no AUD value in the Binance file (token swap or reward): value missing, to verify', kept: true }));
    if (!BL.tz) out.skipped.push({ line: 'file', why: 'time zone not stated in the Binance file: times read in the zone chosen for the file', kept: true });
    out.txs.sort((a, b) => a.date - b.date || String(a.line).localeCompare(String(b.line), undefined, { numeric: true }));
    return out;
  }
  /* AUD line: values kept; other currency: waits for convertFx (aud = NaN until then); stablecoin or unknown: value missing. */
  function push(out, t) { if (t.cur === 'AUD') { t.aud = t.amt; t.fee = t.feeAmt; } else { t.aud = NaN; t.fee = 0; t.needFx = true; } out.txs.push(t); }
  function parseRows(rows, name) {
    { const B = KF.binanceLedger && KF.binanceLedger(rows, name); if (B) return fromBinance(B); }
    const hi = headerIndex(rows), head = rows[hi] || [], m = mapHeader(head), out = { txs: [], skipped: [], missingCols: ['date', 'type', 'asset', 'qty'].filter(k => m[k] == null), currency: headCurrency(head) };
    if (out.missingCols.length) return out;
    const body = rows.slice(hi + 1), order = slashOrder(body.map(r => r[m.date])); out.dateOrder = order;
    const fc = head.findIndex((x, i) => i !== m.asset && ['currency', 'fiat', 'fiat currency', 'quote currency', 'native currency', 'devise'].includes(norm(x)));
    let assumed = 0;
    body.forEach((r, i) => {
      const g = k => m[k] == null ? '' : r[m[k]], line = hi + i + 2;
      if (!r.some(x => String(x).trim() !== '')) return;
      const type = kind(g('type')), D = auDate(g('date'), order), asset = String(g('asset') || '').trim().toUpperCase(), qty = num(g('qty'));
      if (!type || !isFinite(D.date) || !asset || !(qty > 0)) { out.skipped.push({ line, why: !type ? 'unknown type' : D.amb ? 'ambiguous date (DD/MM or MM/DD): use the YYYY-MM-DD format' : !isFinite(D.date) ? 'unreadable date' : 'missing asset or quantity' }); return; }
      const cs = [...new Set(['price', 'total'].map(k => curOf(g(k))).filter(Boolean))];
      let fcur = ''; if (fc >= 0) { const v = String(r[fc] == null ? '' : r[fc]).trim().toUpperCase(); if (v) { fcur = STABLES.includes(v) ? 'STABLE' : new RegExp('^(?:' + CURS + ')$').test(v) ? v : curOf(v) || ''; if (!fcur) { out.skipped.push({ line, why: 'currency "' + v.slice(0, 12) + '" not recognised, to verify' }); return; } } }
      if (cs.length > 1 || (fcur && cs.length && cs[0] !== fcur)) { out.skipped.push({ line, why: 'different currencies in the line, to verify' }); return; }
      let cur = cs[0] || fcur || out.currency; if (!cur) { cur = 'AUD'; assumed++; }
      if (cur === 'AMBIG') { out.skipped.push({ line, why: '"$" alone: AUD or USD? State the currency in the header (e.g. Total (AUD))' }); return; }
      const price = num(g('price')), total0 = num(g('total')), feeV = num(g('fee')), feeAsset = String(g('feeAsset') || '').trim().toUpperCase();
      const t = { line, date: D.date, type, rawType: String(g('type') || ''), asset, qty, amt: isFinite(total0) ? total0 : isFinite(price) ? price * qty : NaN, feeAmt: 0, cur, toAsset: String(g('toAsset') || '').trim().toUpperCase(), toQty: num(g('toQty')) };
      if (cur === 'STABLE') { t.amt = NaN; t.cur = 'AUD'; t.stable = true; } // value stated in a stablecoin: not a currency, AUD value missing
      if (D.tz) t.tz = D.tz; if (D.dateOnly) t.dateOnly = true;
      /* Fee: in the line's currency (or a fiat "Fee asset"), it is an incidental cost; paid in a CRYPTO token, it is a separate disposal of that token (value unknown here). */
      let feeTx = null;
      if (isFinite(feeV) && feeV > 0) {
        const fa = feeAsset ? (STABLES.includes(feeAsset) ? 'STABLE' : new RegExp('^(?:' + CURS + ')$').test(feeAsset) ? feeAsset : null) : null;
        if (!feeAsset || fa === t.cur || (fa && fa !== 'STABLE' && !t.stable && fa === cur)) t.feeAmt = feeV;
        else if (fa && fa !== 'STABLE' && fa !== cur) { out.skipped.push({ line, why: 'fee in ' + fa + ' while the line is in ' + cur + ': fee not used, to verify', kept: true }); }
        else feeTx = { line, date: D.date, type: 'FEEDISP', rawType: 'fee paid in ' + feeAsset, asset: feeAsset, qty: feeV, amt: NaN, feeAmt: 0, cur: 'AUD', toAsset: '', toQty: NaN, forLine: line };
      }
      if (D.tz) t.tz = D.tz;
      push(out, t);
      if (feeTx) { if (D.tz) feeTx.tz = D.tz; if (D.dateOnly) feeTx.dateOnly = true; push(out, feeTx); }
    });
    if (assumed) out.assumedAud = assumed;
    out.txs.sort((a, b) => a.date - b.date || a.line - b.line);
    return out;
  }
  const TYPEMAP = { BUY: 'BUY', SELL: 'SELL', STAKING: 'INCOME', INTEREST: 'INCOME', AIRDROP: 'AIRDROP', PAY: 'SPEND', RECEIVE: 'TRANSFER', SEND: 'TRANSFER', GIFT: 'GIFT' };
  function fromPdfLines(lines) {
    { const B0 = KF.binancePdfRows && KF.binancePdfRows(lines); if (B0) { const o = parseRows(B0, ''); o.pdf = true; if (B0.info.unread) o.skipped.push({ line: 'PDF', why: B0.info.unread + ' unreadable Binance PDF line(s), to verify' }); return o; } }
    const r = KP.parsePdfLines(lines, { keepCur: true }), out = { txs: [], skipped: [], missingCols: [], currency: null, pdf: true };
    const add = (row, n) => {
      const raw = String(row[1] || ''), g = E.guessType(raw, '', true), type = TYPEMAP[g] || kind(raw), D = auDate(String(row[6] || ''), 'DMY'), asset = String(row[0] || '').toUpperCase(), qty = num(row[2]);
      if (!type || !isFinite(D.date) || !asset || !(qty > 0)) { out.skipped.push({ line: n, why: g === 'EXCH_OUT' ? 'swap without the asset received, to verify' : !type ? 'unknown type' : 'unreadable line' }); return; }
      const cs = [...new Set([row[3], row[4], row[5]].map(curOf).filter(Boolean))]; if (cs.length > 1 || cs[0] === 'AMBIG' || cs[0] === 'STABLE') { out.skipped.push({ line: n, why: cs.length > 1 ? 'different currencies in the line, to verify' : cs[0] === 'STABLE' ? 'value in a stablecoin (not a currency), to verify' : '"$" alone: currency to state' }); return; }
      if (!cs.length) { out.skipped.push({ line: n, why: 'currency not stated in the PDF statement, to verify' }); return; }
      const price = num(row[3]), val = num(row[4]), fee = num(row[5]);
      const t = { line: n, date: D.date, type, rawType: raw, asset, qty, amt: isFinite(val) ? val : isFinite(price) ? price * qty : NaN, feeAmt: isFinite(fee) && fee > 0 ? fee : 0, cur: cs[0], toAsset: '', toQty: NaN };
      if (D.tz) t.tz = D.tz; if (D.dateOnly) t.dateOnly = true; push(out, t);
    };
    r.rows.forEach((row, i) => add(row, 'PDF ' + (i + 1))); r.rows2.forEach((x, i) => add(x.row, 'PDF ' + (r.rows.length + i + 1)));
    r.amb.forEach(a => out.skipped.push({ line: 'PDF', why: 'quantity × price differs from the value: stated value used, to verify', kept: !!a.kept }));
    out.txs.sort((a, b) => a.date - b.date); return out;
  }
  /* RBA table F11.1 "Exchange rates" (official CSV from rba.gov.au, imported by the user like a transaction file): rows "dd-Mon-yyyy", columns "A$1=USD"...
     Returns { USD: { '2025-06-30': 0.655 }, ... , from, to } or null if the file is not this table. */
  const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  function parseRBA(rows) {
    if (!rows || !rows.length || !/^F11(\.1)?\b/.test(String(rows[0][0] || '').trim()) || !/EXCHANGE RATES/i.test(rows[0].join(' '))) return null;
    const ti = rows.findIndex(r => String(r[0]).trim() === 'Title'); if (ti < 0) return null;
    const cols = rows[ti].map(c => { const m = /^A\$1=([A-Z]{3})$/.exec(String(c).trim()); return m ? m[1] : null; }), out = { rates: {}, from: null, to: null, n: 0 };
    for (const r of rows) { const m = /^(\d{2})-([A-Z][a-z]{2})-(\d{4})$/.exec(String(r[0] || '').trim()); if (!m || MON[m[2]] == null) continue;
      const d = m[3] + '-' + String(MON[m[2]] + 1).padStart(2, '0') + '-' + m[1]; let any = false;
      cols.forEach((c, i) => { if (!c) return; const v = parseFloat(r[i]); if (v > 0) { (out.rates[c] = out.rates[c] || {})[d] = v; any = true; } });
      if (any) { out.n++; if (!out.from || d < out.from) out.from = d; if (!out.to || d > out.to) out.to = d; } }
    return out.n ? out : null;
  }
  /* AUD conversion. RBA (A$1 = x foreign): AUD = amount / x. ECB via Frankfurter (1 foreign = y AUD): AUD = amount × y.
     Rate of the tax-zone day, or of the closest previous published day (at most 7 days back; weekends and holidays); otherwise excluded. Never USD = AUD. */
  const FX_RBA = 'RBA table F11.1 (daily, A$1 = x)', FX_ECB = 'ECB reference rates via Frankfurter (api.frankfurter.dev) — not the RBA rate, to verify';
  const isoDay = t => new Date(t).toISOString().slice(0, 10);
  function rateOn(map, day) { for (let i = 0; i <= 7; i++) { const d = isoDay(Date.parse(day) - i * DAY); if (map && map[d]) return { rate: map[d], on: d }; } return null; }
  async function convertFx(p, opts, taxTz) {
    opts = opts || {}; const rba = opts.rba || null, getJson = opts.getJson || null;
    const need = p.txs.filter(t => t.needFx), by = {}; need.forEach(t => (by[t.cur] = by[t.cur] || []).push(t));
    const dayKey = t => t.dateOnly ? isoDay(t.date) : isoDay(shiftTz(t.date, t.tz || p.fileTz || 'UTC', taxTz || SYD));
    p.fx = { count: 0, cur: [], missing: 0, rba: 0, ecb: 0 };
    for (const c in by) {
      const L = by[c], inR = d => rba && rba.rates[c] && d >= rba.from && d <= isoDay(Date.parse(rba.to) + 7 * DAY) && rateOn(rba.rates[c], d);
      const E = L.filter(t => !inR(dayKey(t))), ds = E.map(dayKey).sort(); let ecb = null;
      if (E.length && getJson && /^[A-Z]{3}$/.test(c)) { ecb = {}; const from = isoDay(Date.parse(ds[0]) - 7 * DAY), to = ds[ds.length - 1];
        try { const j = await getJson('https://api.frankfurter.dev/v1/' + from + '..' + to + '?from=' + c + '&to=AUD'); if (j && j.rates) for (const k in j.rates) if (j.rates[k].AUD > 0 && /^\d{4}-\d{2}-\d{2}$/.test(k)) ecb[k] = j.rates[k].AUD; } catch (x) { ecb = {}; } }
      for (const t of L) { const day = dayKey(t), rr = inR(day), src = rr ? 'RBA' : ecb ? 'ECB' : null, r = rr || (ecb ? rateOn(ecb, day) : null);
        if (!r) { t.drop = true; p.skipped.push({ line: t.line, why: 'no ' + c + '/AUD rate found for ' + day + (src === 'ECB' ? ' (not in the RBA file; ECB via Frankfurter)' : ' (no rate source)') + ': excluded, to verify' }); p.fx.missing++; continue; }
        const k = src === 'RBA' ? 1 / r.rate : r.rate; t.aud = t.amt * k; t.fee = t.feeAmt * k; t.fx = { cur: c, rate: r.rate, on: r.on, src, day }; delete t.needFx; p.fx.count++; p.fx[src === 'RBA' ? 'rba' : 'ecb']++; if (!p.fx.cur.includes(c)) p.fx.cur.push(c); }
    }
    p.txs = p.txs.filter(t => !t.drop); return p;
  }
  function fromCSVText(input, name) { const rows = Array.from(KF.parseCSV(input)), R = parseRBA(rows); if (R) return { rba: R, txs: [], skipped: [], missingCols: [] }; return parseRows(rows, name); }
  function fromWorkbook(X, data, name) {
    const wb = X.read(data, { cellDates: false, cellNF: true }); let best = null; const d1904 = !!(wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.date1904);
    for (const n of wb.SheetNames) { const sh = wb.Sheets[n]; for (const k in sh) { const c = sh[k]; if (k[0] === '!' || !c || c.t !== 'n' || !c.z || !(X.SSF && X.SSF.is_date(c.z))) continue; c.v = 'XLSERIAL:' + (c.v + (d1904 ? 1462 : 0)); c.t = 's'; delete c.w; delete c.z; } }
    for (const n of wb.SheetNames) { const rows = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }); if (!rows.length) continue; const p = parseRows(rows, name); if (!p.missingCols.length) return p; if (!best) best = p; }
    return best || { txs: [], skipped: [], missingCols: ['date', 'type', 'asset', 'qty'] };
  }
  /* Time zones: Intl with an explicit zone, no network; never the machine's zone. */
  const tzFmt = {};
  function tzOffset(zone, inst) {
    if (!zone || zone === 'UTC') return 0;
    const f = tzFmt[zone] || (tzFmt[zone] = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    const P = {}; f.formatToParts(new Date(inst)).forEach(x => { P[x.type] = +x.value; });
    return Date.UTC(P.year, P.month - 1, P.day, P.hour % 24, P.minute, P.second) - Math.floor(inst / 1000) * 1000;
  }
  function shiftTz(w, from, to) { if (!isFinite(w) || (from || 'UTC') === (to || 'UTC')) return w; let i = w - tzOffset(from, w); i = w - tzOffset(from, i); return i + tzOffset(to, i); }
  /* ---------- Income years, 12-month rule ---------- */
  const fyOf = day => { const d = new Date(day * DAY); return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; }; // income year starting 1 July of this year
  const fyLabel = y => y + '-' + String((+y + 1) % 100).padStart(2, '0');
  const fyStart = y => Date.UTC(+y, 6, 1) / DAY, fyEnd = y => Date.UTC(+y + 1, 5, 30) / DAY;
  const LAST_FY = 2026; // 2026-27 is the last income year computed: the CGT reform (Act No. 49 of 2026) applies to CGT events from 1 July 2027 and is not implemented.
  /* 12 months "excluding the day of acquisition and the day of the CGT event" (ATO): eligible when the event day is at least the day AFTER the first anniversary.
     Anniversary of 29 February = 1 March of the next year (conservative: one day later than 28 February). */
  const anniv = day => { const d = new Date(day * DAY), y = d.getUTCFullYear() + 1, m = d.getUTCMonth(), dd = d.getUTCDate(); return (m === 1 && dd === 29 ? Date.UTC(y, 2, 1) : Date.UTC(y, m, dd)) / DAY; };
  const held12 = (acqDay, evDay) => acqDay != null && evDay >= anniv(acqDay) + 1;
  const r2 = v => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
  const EPS = 1e-12;
  /* ---------- Calculation: FIFO parcels per token across all files ---------- */
  function compute(txs, opts) {
    opts = opts || {}; const fileTz = opts.fileTz || 'UTC', taxTz = opts.taxTz || SYD;
    const local = t => t.dateOnly ? t.date : shiftTz(t.date, t.tz || fileTz, taxTz);
    const dayOf = t => Math.floor(local(t) / DAY);
    const ev = txs.map((t, i) => ({ t, i, w: local(t) })).sort((a, b) => a.w - b.w || a.i - b.i);
    const Q = {}, lotsOf = a => Q[a] || (Q[a] = []), allLots = [], acqDays = {};
    const parcels = [], income = [], airdrops = [], notes = [], transfers = { count: 0, withFee: 0 };
    let lastDay = -Infinity, did = 0;
    const acquire = (asset, d, qty, cost, line, how) => { const lot = { asset, day: d, qty, qty0: qty, cost: cost == null || !isFinite(cost) ? null : cost, cost0: cost == null || !isFinite(cost) ? null : cost, line, how, used: [] };
      lotsOf(asset).push(lot); allLots.push(lot); (acqDays[asset] = acqDays[asset] || []).push(d); };
    const dispose = (asset, d, qty, proceeds, fee, line, x) => {
      const L = lotsOf(asset), pieces = []; let rem = qty; const id = ++did;
      while (rem > EPS && L.length) { const lot = L[0], take = Math.min(rem, lot.qty), cs = lot.cost == null ? null : lot.cost * take / lot.qty;
        if (lot.cost != null) lot.cost -= cs; lot.qty -= take; lot.used.push({ day: d, qty: take }); if (lot.qty <= EPS * Math.max(1, lot.qty0)) { lot.qty = 0; L.shift(); }
        pieces.push({ acqDay: lot.day, qty: take, cost: cs, lotLine: lot.line, how: lot.how }); rem -= take; }
      if (rem > EPS * Math.max(1, qty)) pieces.push({ acqDay: null, qty: rem, cost: null, missing: true });
      const fy = fyOf(d);
      for (const pc of pieces) {
        const share = pc.qty / qty, pr = proceeds == null || !isFinite(proceeds) ? null : proceeds * share, fs = (fee || 0) * share;
        const p = Object.assign({ id, asset, day: d, date: d * DAY, fy, qty: +pc.qty.toPrecision(12), acqDay: pc.acqDay, acqDate: pc.acqDay == null ? null : pc.acqDay * DAY, lotLine: pc.lotLine,
          proceeds: r2(pr), cost: r2(pc.cost), fees: r2(fs), gain: null, discount: held12(pc.acqDay, d), line, status: 'ok' }, x || {});
        if (pc.missing) p.status = 'to verify: no acquisition found for ' + +pc.qty.toPrecision(10) + ' ' + asset + ' (missing history)';
        else if (pc.cost == null) p.status = 'to verify: cost base unknown for this parcel (acquired ' + dmy(pc.acqDay * DAY) + ', ' + pc.how + ' without an AUD value)';
        else if (pr == null) p.status = x && x.feeDisp ? 'to verify: fee paid in ' + asset + ': market value of the fee missing' : 'to verify: AUD value of the disposal missing';
        else p.gain = r2(pr - pc.cost - fs);
        if (fy > LAST_FY) { p.blocked = true; p.status = 'blocked: income year ' + fyLabel(fy) + ' (CGT reform from 1 July 2027, Act No. 49 of 2026) not implemented'; }
        parcels.push(p); }
      return id; };
    for (const { t } of ev) {
      const d = dayOf(t), v = isFinite(t.aud) ? t.aud : null; if (d > lastDay) lastDay = d;
      if (t.type === 'BUY') acquire(t.asset, d, t.qty, v == null ? null : v + (t.fee || 0), t.line, 'bought');
      else if (t.type === 'SELL' || t.type === 'SPEND') dispose(t.asset, d, t.qty, v, t.fee, t.line, t.type === 'SPEND' ? { spend: true } : null);
      else if (t.type === 'GIFT') dispose(t.asset, d, t.qty, v, t.fee, t.line, { gift: true });
      else if (t.type === 'FEEDISP') dispose(t.asset, d, t.qty, v, 0, t.line, { feeDisp: true, forLine: t.forLine });
      else if (t.type === 'CONVERT') {
        if (!t.toAsset || !(t.toQty > 0)) { notes.push({ line: t.line, why: 'swap without the asset or quantity received: not computed' }); continue; }
        dispose(t.asset, d, t.qty, v, t.fee, t.line, { swap: t.toAsset }); acquire(t.toAsset, d, t.toQty, v, t.line, 'swap');
      } else if (t.type === 'INCOME' || t.type === 'MINING') {
        acquire(t.asset, d, t.qty, v, t.line, 'reward'); income.push({ line: t.line, day: d, fy: fyOf(d), asset: t.asset, qty: t.qty, aud: v, type: t.rawType, kind: t.type });
      } else if (t.type === 'AIRDROP') {
        acquire(t.asset, d, t.qty, v, t.line, 'airdrop'); airdrops.push({ line: t.line, day: d, fy: fyOf(d), asset: t.asset, qty: t.qty, aud: v, type: t.rawType });
      } else if (t.type === 'TRANSFER') { transfers.count++; if (t.fee > 0 || t.feeAmt > 0) transfers.withFee++; }
    }
    /* Possible wash sale (warning only, no automatic rule): loss parcel and an acquisition of the same token within 30 days before or after. */
    for (const p of parcels) if (p.gain < 0) { const near = (acqDays[p.asset] || []).filter(a => a !== p.acqDay && Math.abs(a - p.day) <= 30); if (near.length) p.wash = true; }
    const ys = new Set(parcels.map(p => p.fy).concat(income.map(x => x.fy), airdrops.map(x => x.fy)));
    return { parcels, income, airdrops, lots: allLots, notes, transfers, fileTz, taxTz, lastDay, years: [...ys].sort((a, b) => a - b) };
  }
  /* Net capital gain for one income year (ITAA 1997 s 102-5, ATO myTax 2026 order): current-year losses (first against gains NOT eligible for the discount),
     then unapplied prior-year net capital losses (user input, same order), then the 50% discount on remaining discount gains — only for a confirmed Australian resident. */
  function yearSummary(res, fy, o) {
    fy = +fy; o = o || {}; const P = res.parcels.filter(p => p.fy === fy), ok = P.filter(p => p.status === 'ok'), sum = (L, f) => r2(L.reduce((a, x) => a + f(x), 0)) || 0;
    const blocked = fy > LAST_FY, nonDisc = sum(ok, p => p.gain > 0 && !p.discount ? p.gain : 0), disc = sum(ok, p => p.gain > 0 && p.discount ? p.gain : 0), losses = sum(ok, p => p.gain < 0 ? -p.gain : 0);
    const a = Math.min(losses, nonDisc), n1 = r2(nonDisc - a), l1 = r2(losses - a), b = Math.min(l1, disc), d1 = r2(disc - b), lossLeft = r2(l1 - b);
    const prior = Math.max(0, +o.prior || 0), c = Math.min(prior, n1), n2 = r2(n1 - c), p1 = r2(prior - c), e = Math.min(p1, d1), d2 = r2(d1 - e), priorLeft = r2(p1 - e);
    const resident = o.resident === 'yes' ? 'yes' : o.resident === 'no' ? 'no' : '';
    const discount = resident === 'yes' && !blocked ? r2(d2 * 0.5) : null;
    const inc = res.income.filter(x => x.fy === fy), air = res.airdrops.filter(x => x.fy === fy);
    return { fy, label: fyLabel(fy), from: fyStart(fy) * DAY, to: fyEnd(fy) * DAY, blocked, resident, count: ok.length, parcels: P, toVerify: P.filter(p => p.status !== 'ok' && !p.blocked), blockedParcels: P.filter(p => p.blocked),
      proceeds: sum(ok, p => p.proceeds), cost: sum(ok, p => p.cost), fees: sum(ok, p => p.fees), grossGains: r2(nonDisc + disc), nonDisc, disc, losses,
      lossesAppliedNonDisc: r2(a), lossesAppliedDisc: r2(b), prior, priorApplied: r2(c + e), afterLosses: r2(n2 + d2), nonDiscAfter: n2, discAfter: d2,
      discount, net: discount == null ? null : r2(n2 + d2 - discount), carryForward: r2(lossLeft + priorLeft), wash: ok.filter(p => p.wash),
      income: inc, incomeAud: sum(inc.filter(x => x.aud != null), x => x.aud), incomeUnknown: inc.filter(x => x.aud == null).length, airdrops: air };
  }
  /* Parcels still held at the end of the income year (FIFO inventory), cost base unknown when any acquisition value is missing. */
  function inventory(res, fy) { const end = fyEnd(fy), out = {};
    for (const l of res.lots) { if (l.day > end) continue; const used = l.used.filter(u => u.day <= end).reduce((s, u) => s + u.qty, 0), q = l.qty0 - used; if (q <= EPS * Math.max(1, l.qty0)) continue;
      const o = out[l.asset] || (out[l.asset] = { asset: l.asset, qty: 0, cost: 0, unknown: false, parcels: 0, oldest: l.day }); o.qty += q; o.parcels++; if (l.cost0 == null) o.unknown = true; else o.cost += l.cost0 * q / l.qty0; if (l.day < o.oldest) o.oldest = l.day; }
    return Object.values(out).sort((a, b) => a.asset < b.asset ? -1 : 1).map(o => ({ asset: o.asset, qty: +o.qty.toPrecision(12), cost: o.unknown ? null : r2(o.cost), parcels: o.parcels, oldest: o.oldest * DAY })); }
  const p2 = n => String(n).padStart(2, '0');
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dmy = t => { if (t == null) return 'unknown'; const d = new Date(t); return d.getUTCDate() + ' ' + MN[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }; // "30 Jun 2025": unambiguous
  const amtS = v => (v < 0 ? '-' : '') + Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const aud = v => v == null || !isFinite(v) ? 'to verify' : amtS(v) + '\u00a0AUD';
  const LEGAL = 'Estimate to verify, not tax advice, not an ATO form and not a lodgment. Rules: ATO crypto asset guidance (transactions, staking and airdrops, CGT discount, net capital gain), ITAA 1997 s 102-5 and Div 115. Details: docs/AU-RULES.md.';
  function ranges(ns) { ns = [...new Set(ns)].sort((a, b) => a - b); const o = []; for (let i = 0; i < ns.length; i++) { let j = i; while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++; o.push(j > i ? ns[i] + '-' + ns[j] : String(ns[i])); i = j; } return o.join(', '); }
  function groupLines(items, max) { const G = new Map(); items.forEach(x => { if (!G.has(x.why)) G.set(x.why, []); G.get(x.why).push(x.line); }); const out = [];
    G.forEach((ls, why) => { if (ls.length <= (max || 1)) { ls.forEach(l => out.push({ text: (/^\d+$/.test(String(l)) ? 'Line ' + l : String(l)) + ': ' + why, n: 1 })); return; }
      const num = ls.filter(l => /^\d+$/.test(String(l))).map(Number), other = ls.filter(l => !/^\d+$/.test(String(l)));
      out.push({ text: [num.length ? 'lines ' + ranges(num) : '', other.length ? [...new Set(other)].slice(0, 12).join(', ') + (new Set(other).size > 12 ? '…' : '') : ''].filter(Boolean).join('; ') + ': ' + why + ' (' + ls.length + ' lines)', n: ls.length }); });
    return out; }
  function checks(res, Y) { const chk = [];
    if (Y.blocked) chk.push('Income year ' + Y.label + ': CGT events from 1 July 2027 fall under the CGT reform (Treasury Laws Amendment (Tax Reform No. 1) Act 2026, No. 49: indexation and a 30% minimum tax). Not implemented here: nothing computed for this year.');
    if (Y.resident !== 'yes') chk.push(Y.resident === 'no' ? 'Not an Australian resident for the whole period: the 50% CGT discount is NOT applied (foreign or temporary residents may get no or a reduced discount; ATO "CGT discount for foreign residents"). To verify.' : 'Tax residency not confirmed: the 50% CGT discount is not applied until you confirm you were an Australian resident for tax purposes.');
    Y.toVerify.slice(0, 30).forEach(p => chk.push(dmy(p.date) + ' ' + p.asset + ' (' + +p.qty.toPrecision(10) + '): ' + p.status.replace(/^to verify: /, '') + ' (outside the totals).'));
    if (Y.toVerify.length > 30) chk.push((Y.toVerify.length - 30) + ' other parcel(s) to verify (outside the totals).');
    chk.push('Parcels are matched first-in first-out (FIFO) per token across all your files. Another identification (specific units) is possible only if your records prove which units were disposed of: not computed here.');
    if (Y.wash.length) chk.push(Y.wash.length + ' loss parcel(s) with an acquisition of the same token within 30 days: possible wash sale. Australia has no automatic 30-day rule, but the ATO can deny a loss from a wash sale (TR 2008/1, Part IVA). Loss kept in the totals, to review.');
    if (Y.parcels.some(p => p.gift)) chk.push('Gifts: disposal at market value (value in the file); special rules (deductible gift recipients) not handled, to verify.');
    if (Y.parcels.some(p => p.feeDisp)) chk.push('Fees paid in a crypto token are separate disposals of that token: their AUD value is missing in the file, to verify.');
    if (Y.income.length) chk.push(Y.income.length + ' staking or other reward(s): ordinary income when received (ATO), shown separately, not in the capital gain; cost base = market value at receipt. ' + (Y.incomeUnknown ? Y.incomeUnknown + ' without an AUD value: income and cost base unknown, later disposals of these units are to verify.' : ''));
    if (Y.airdrops.length) chk.push(Y.airdrops.length + ' airdrop(s): taxed or not depending on the facts (reward for services = income; otherwise generally not income, cost base = market value at receipt; draft ruling TR 2026/D1). Not added to income here, to review.');
    chk.push('Personal use asset exemption: never applied (ATO: crypto held as an investment is not a personal use asset).');
    if (res.transfers && res.transfers.count) chk.push(res.transfers.count + ' transfer(s) treated as moves between your own wallets (no CGT event, parcels keep their date and cost base). If a transfer went to someone else, it may be a disposal: to verify.' + (res.transfers.withFee ? ' ' + res.transfers.withFee + ' with a fee: network fees not handled.' : ''));
    if (res.fx && res.fx.count) chk.push(res.fx.count + ' line(s) converted to AUD (' + res.fx.cur.join(', ') + '): ' + (res.fx.rba ? res.fx.rba + ' with the ' + FX_RBA : '') + (res.fx.rba && res.fx.ecb ? '; ' : '') + (res.fx.ecb ? res.fx.ecb + ' with ' + FX_ECB : '') + '. Rate of the day or of the previous published day.');
    if (res.fx && res.fx.missing) chk.push(res.fx.missing + ' line(s) without an exchange rate: excluded, to verify.');
    if (res.assumedAud) chk.push(res.assumedAud + ' line(s) without a stated currency: amounts assumed in AUD, to verify.');
    if (res.stable) chk.push(res.stable + ' line(s) valued in a stablecoin: a stablecoin is a crypto asset, not USD — AUD value missing, to verify.');
    { const K = (res.skipped || []).filter(x => x.kept); groupLines(K, 1).forEach(g => chk.push(g.text + '.')); }
    groupLines(res.notes || [], 5).forEach(g => chk.push(g.text + '.'));
    chk.push('Not included: business or trader activity, income tax rates, Medicare levy, other CGT assets, collectables, DeFi, wrapping, lending and liquidity pools.');
    return chk; }
  const csvSafe = (s => /^(?:[=+@\t\r]|-(?![\d.]|$))/.test(s) ? "'" + s : s);
  const RES_TXT = r => r === 'yes' ? 'Australian resident for tax purposes for the whole period (confirmed by the user)' : r === 'no' ? 'not an Australian resident for the whole period: discount not applied' : 'not confirmed: discount not applied';
  function toCSV(res, fy, o) {
    const Y = yearSummary(res, fy, o), inv = inventory(res, fy), q = v => { const s = csvSafe(String(v == null ? '' : v)); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }, n = v => v == null ? 'to verify' : v.toFixed(2);
    const L = [['Kryptax Australia - crypto CGT summary (estimate, to verify; not an ATO form and not a lodgment)'], ['Income year', Y.label + ' (1 July ' + Y.fy + ' to 30 June ' + (Y.fy + 1) + ')'],
      ['Tax dates', tzName(res.taxTz) + '; file times: ' + res.fileTz + ' (explicit offsets kept)'], ['Residency', RES_TXT(Y.resident)], ['Parcel method', 'FIFO per token, all files'], [],
      ['Item', 'Amount (AUD)'], ['CGT events counted (parcels)', Y.count], ['Capital proceeds', n(Y.proceeds)], ['Cost base', n(Y.cost)], ['Disposal costs', n(Y.fees)],
      ['Gross capital gains', n(Y.grossGains)], ['  of which eligible for the discount (12 months)', n(Y.disc)], ['  of which not eligible', n(Y.nonDisc)], ['Current-year capital losses', n(Y.losses)],
      ['Prior-year net capital losses entered', n(Y.prior)], ['Prior-year losses applied', n(Y.priorApplied)], ['Gains after losses', n(Y.afterLosses)],
      ['CGT discount (50%)', Y.blocked ? 'blocked' : Y.discount == null ? 'not applied (residency)' : n(Y.discount)], ['Net capital gain', Y.blocked ? 'blocked' : Y.discount == null ? 'to verify (before discount: ' + n(Y.afterLosses) + ')' : n(Y.net)],
      ['Net capital losses to carry forward', n(Y.carryForward)], ['Staking and other rewards (ordinary income, separate)', n(Y.incomeAud) + (Y.incomeUnknown ? ' + ' + Y.incomeUnknown + ' without value' : '')], [],
      ['Disposal date', 'Asset', 'Quantity', 'Acquired', '12 months', 'Proceeds (AUD)', 'Cost base (AUD)', 'Costs (AUD)', 'Gain or loss (AUD)', 'Status']];
    Y.parcels.forEach(p => L.push([dmy(p.date), p.asset, p.qty, p.acqDate == null ? 'unknown' : dmy(p.acqDate), p.discount ? 'yes' : 'no', n(p.proceeds), n(p.cost), n(p.fees), p.gain == null ? 'to verify' : n(p.gain),
      p.status + (p.swap ? '; swapped for ' + p.swap : '') + (p.gift ? '; gift' : '') + (p.feeDisp ? '; fee paid in crypto' : '') + (p.wash ? '; possible wash sale, to review' : '')]));
    if (Y.income.length) { L.push([], ['Staking and other rewards (ordinary income when received)'], ['Date', 'Asset', 'Quantity', 'Value (AUD)', 'Type']); Y.income.forEach(x => L.push([dmy(x.day * DAY), x.asset, +x.qty.toPrecision(10), x.aud == null ? 'value missing - to verify' : n(x.aud), x.type])); }
    if (Y.airdrops.length) { L.push([], ['Airdrops (to review: income or not depending on the facts)'], ['Date', 'Asset', 'Quantity', 'Value (AUD)', 'Type']); Y.airdrops.forEach(x => L.push([dmy(x.day * DAY), x.asset, +x.qty.toPrecision(10), x.aud == null ? 'value missing - to verify' : n(x.aud), x.type])); }
    L.push([], ['Holdings at 30 June ' + (Y.fy + 1) + ' (FIFO parcels)'], ['Asset', 'Quantity', 'Cost base (AUD)', 'Parcels', 'Oldest parcel']); inv.forEach(x => L.push([x.asset, x.qty, x.cost == null ? 'unknown - to verify' : n(x.cost), x.parcels, dmy(x.oldest)]));
    L.push([], ['To verify']); checks(res, Y).forEach(c => L.push([c])); L.push([], ['Price and rate sources: values from your files; exchange rates: ' + FX_RBA + ' if imported, otherwise ' + FX_ECB + '. No crypto price is fetched.']); L.push([LEGAL]);
    return L.map(r => r.map(q).join(',')).join('\r\n') + '\r\n';
  }
  const ascii = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u00ab\u00bb\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'").replace(/[\u2013\u2014\u2212]/g, '-').replace(/[\u00a0\u2007\u2009\u202f]/g, ' ').replace(/\u2026/g, '...').replace(/\u00d7/g, 'x').replace(/\u20ac/g, 'EUR ').replace(/[^\x20-\x7e]/g, '?');
  function pdfData(res, fy, o, now) {
    const Y = yearSummary(res, fy, o); now = now || new Date(); const C = aud, gen = now.getUTCFullYear() + '-' + p2(now.getUTCMonth() + 1) + '-' + p2(now.getUTCDate());
    const info = ['Amounts in Australian dollars (AUD). Income year ' + Y.label + ' (1 July ' + Y.fy + ' to 30 June ' + (Y.fy + 1) + '). Generated on ' + gen + ' UTC. Summary, not an ATO form and not a lodgment.',
      'Parcels: FIFO per token, all files. Tax dates: ' + tzName(res.taxTz) + '; file times: ' + res.fileTz + '. Residency: ' + RES_TXT(Y.resident) + '.',
      Y.blocked ? 'BLOCKED: CGT reform from 1 July 2027 (Act No. 49 of 2026) not implemented. Nothing computed for this year.' :
      'Gross capital gains ' + C(Y.grossGains) + ' (12 months: ' + C(Y.disc) + '; under 12 months: ' + C(Y.nonDisc) + ') | current-year losses ' + C(Y.losses) + ' | prior-year losses applied ' + C(Y.priorApplied) + ' | after losses ' + C(Y.afterLosses),
      Y.blocked ? '' : 'CGT discount 50%: ' + (Y.discount == null ? 'not applied (residency)' : C(Y.discount)) + ' | net capital gain ' + (Y.net == null ? 'to verify' : C(Y.net)) + ' | net capital losses to carry forward ' + C(Y.carryForward) + '.',
      'Staking and other rewards (ordinary income, separate): ' + C(Y.incomeAud) + (Y.incomeUnknown ? ' + ' + Y.incomeUnknown + ' without value' : '') + '. Airdrops to review: ' + Y.airdrops.length + '. No income tax computed.'].filter(Boolean);
    checks(res, Y).forEach(c => info.push('To verify: ' + c));
    const rows = Y.parcels.map(p => [dmy(p.date), p.asset, String(p.qty), p.acqDate == null ? 'unknown' : dmy(p.acqDate), p.discount ? 'yes' : 'no', C(p.proceeds), C(p.cost), C(p.fees), p.gain == null ? 'to verify' : C(p.gain), p.status === 'ok' ? (p.wash ? 'possible wash sale' : '') : p.status].map(ascii));
    return { title: ascii('Kryptax Australia - crypto CGT summary ' + Y.label + ' (estimate, amounts in AUD)'), info: info.map(ascii), head: ['Disposed', 'Asset', 'Qty', 'Acquired', '12 mo', 'Proceeds (AUD)', 'Cost base (AUD)', 'Costs (AUD)', 'Gain/loss (AUD)', 'Status'], rows, foot: ascii(LEGAL) };
  }
  function pdf(jsPDF, res, fy, o) {
    const D = pdfData(res, fy, o), doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' }); let yy = 40;
    const t0 = doc.text.bind(doc); doc.text = (s, ...a) => t0(Array.isArray(s) ? s.map(ascii) : ascii(s), ...a);
    doc.setFontSize(14); doc.text(D.title, 40, yy); yy += 20; doc.setFontSize(9);
    D.info.forEach(l => { doc.splitTextToSize(l, 760).forEach(s => { if (yy > 560) { doc.addPage(); yy = 40; } doc.text(s, 40, yy); yy += 12; }); });
    if (doc.autoTable) doc.autoTable({ head: [D.head], body: D.rows, startY: yy + 6, styles: { fontSize: 7 }, margin: { left: 40, right: 40 } });
    const n = doc.getNumberOfPages(); for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.text(D.foot, 40, doc.internal.pageSize.getHeight() - 20); }
    return doc;
  }
  /* File name: kryptax-australia-<income year>_<YYYY-MM-DD>_<HHhMM>.<ext> (device local time at export). */
  const fileName = (fy, ext, d) => { d = d || new Date(); return 'kryptax-australia-' + fyLabel(fy) + '_' + d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '_' + p2(d.getHours()) + 'h' + p2(d.getMinutes()) + '.' + ext; };
  function mergeFiles(L) {
    const K = t => [t.date, t.tz || '', t.type, t.asset, t.qty, t.amt, t.cur, t.toAsset || '', t.toQty || '', t.forLine ? 'fee' : ''].join('|'), seen = new Set(), out = { txs: [], skipped: [], dupes: 0, assumedAud: 0, stable: 0, fx: null, platform: L.length === 1 ? L[0].p.platform : (L.find(f => f.p.platform) || { p: {} }).p.platform };
    L.forEach((f, i) => { const mine = new Set(), pre = L.length > 1 ? 'F' + (i + 1) + ':' : '';
      f.p.txs.forEach(t => { const k = K(t); if (seen.has(k)) { out.dupes++; return; } mine.add(k); out.txs.push(Object.assign({}, t, { line: pre + t.line })); if (t.stable) out.stable++; });
      mine.forEach(k => seen.add(k)); (f.p.skipped || []).forEach(s => out.skipped.push(Object.assign({}, s, { line: pre + s.line })));
      out.assumedAud += f.p.assumedAud || 0;
      if (f.p.fx) { out.fx = out.fx || { count: 0, cur: [], missing: 0, rba: 0, ecb: 0 }; ['count', 'missing', 'rba', 'ecb'].forEach(k => out.fx[k] += f.p.fx[k] || 0); f.p.fx.cur.forEach(c => { if (!out.fx.cur.includes(c)) out.fx.cur.push(c); }); } });
    out.txs.sort((a, b) => a.date - b.date); return out;
  }
  const api = { AU_TZ, AU_ZONES, tzName, resolveTaxTz, COLS, mapHeader, curOf, kind, auDate, slashOrder, parseRows, parseRBA, fromCSVText, fromWorkbook, fromPdfLines, convertFx, rateOn, FX_RBA, FX_ECB, STABLES,
    shiftTz, fyOf, fyLabel, anniv, held12, LAST_FY, compute, yearSummary, inventory, checks, toCSV, pdfData, pdf, aud, dmy, csvSafe, ascii, fileName, mergeFiles, LEGAL };
  /* ---------- page (browser only) ---------- */
  function mount(doc) {
    const box = doc.getElementById('aumode'); if (!box || box.dataset.ready) return; box.dataset.ready = '1';
    const inp = doc.getElementById('aufile'), out = doc.getElementById('auresult'), tzSel = doc.getElementById('autz'), taxSel = doc.getElementById('autaxtz'), resSel = doc.getElementById('auresid'), priorIn = doc.getElementById('auprior'); if (!inp || !out) return;
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]), W = typeof window !== 'undefined' ? window : root;
    let cur = null, full = null, year = null, name = '', taxChoice = 'auto', stale = false, dupNote = 0, calcTz = null, notes0 = [], rba = null;
    let browserTz = 'UTC'; try { browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (x) {}
    let fileTz = AU_ZONES.includes(browserTz) ? browserTz : 'UTC';
    const taxNow = () => resolveTaxTz(taxChoice, fileTz, browserTz);
    const opts = () => ({ resident: resSel ? resSel.value : '', prior: priorIn ? Math.max(0, parseFloat(String(priorIn.value).replace(',', '.')) || 0) : 0 });
    const drawTax = () => { if (!taxSel) return; const a = resolveTaxTz('auto', fileTz, browserTz);
      taxSel.innerHTML = `<option value="auto">Automatic: ${esc(tzName(a.tz))} — ${esc(a.how)}</option>` + AU_TZ.map(z => `<option value="${esc(z[0])}">${esc(tzName(z[0]))}</option>`).join(''); taxSel.value = taxChoice; };
    const drawFileTz = () => { if (!tzSel) return; const L = [['UTC', 'UTC']].concat(AU_TZ.map(z => [z[0], tzName(z[0])])); if (!L.some(z => z[0] === browserTz)) L.push([browserTz, 'This browser (' + browserTz + ')']);
      tzSel.innerHTML = L.map(z => `<option value="${esc(z[0])}">${esc(z[1])}</option>`).join(''); tzSel.value = fileTz; };
    const staleHtml = () => '<p class="warn" id="austale">Time zone changed: the previous results, income years and exchange rates are cleared. Click "Confirm imports" to recompute from your files with the new time zone.</p>';
    function staleTz() { if (!cur) return; cur = full = null; year = null; stale = true; vbtn.disabled = !files.length; out.innerHTML = staleHtml(); }
    drawFileTz(); drawTax();
    if (tzSel) tzSel.addEventListener('change', () => { fileTz = tzSel.value; drawTax(); staleTz(); });
    if (taxSel) taxSel.addEventListener('change', () => { taxChoice = taxSel.value; staleTz(); });
    if (resSel) resSel.addEventListener('change', () => { if (cur) draw(); });
    if (priorIn) priorIn.addEventListener('input', () => { if (cur) draw(); });
    const save = (blob, fn) => { const a = doc.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fn; doc.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
    function calc() { const tx = taxNow(); calcTz = tx; full = compute(cur.txs, { fileTz, taxTz: tx.tz }); full.fx = cur.fx; full.skipped = cur.skipped; full.assumedAud = cur.assumedAud; full.stable = cur.stable; api.computeCount = (api.computeCount || 0) + 1; }
    function draw() {
      if (!cur) { out.innerHTML = stale ? staleHtml() : ''; return; }
      const tx = calcTz, Ys = full.years.map(String), o = opts();
      if (!year || !Ys.includes(String(year))) year = Ys.length ? Ys.filter(y => +y <= LAST_FY).pop() || Ys[Ys.length - 1] : null;
      const dn = dupNote ? '<p class="warn">' + dupNote + ' line' + (dupNote > 1 ? 's' : '') + ' already found in an earlier file: counted once (to verify).</p>' : '';
      if (!year) { out.innerHTML = dn + '<p class="warn">' + esc(name) + ': no disposal, reward or airdrop found. Nothing to report.</p>' + skippedHtml(); return; }
      const Y = yearSummary(full, year, o), inv = inventory(full, year), c = (l, v, k) => `<div><span>${l}</span><b class="${k || ''}">${v}</b></div>`;
      const sel = Ys.length > 1 ? `<div class="grid"><label>Income year <select id="auyear">${Ys.map(y => `<option value="${y}"${y === String(year) ? ' selected' : ''}>${fyLabel(y)}${+y > LAST_FY ? ' (blocked)' : ''}</option>`).join('')}</select></label></div>` : '';
      const tr = Y.parcels.map(p => `<tr class="${p.status === 'ok' ? '' : 'tv'}"><td>${dmy(p.date)}</td><td>${esc(p.asset)}${p.swap ? ' <span class="hint">→ ' + esc(p.swap) + '</span>' : ''}${p.gift ? ' <span class="hint">(gift)</span>' : ''}${p.feeDisp ? ' <span class="hint">(fee)</span>' : ''}</td><td>${p.qty}</td><td>${p.acqDate == null ? 'unknown' : dmy(p.acqDate)}</td><td>${p.discount ? 'yes' : 'no'}</td><td>${aud(p.proceeds)}</td><td>${aud(p.cost)}</td><td>${aud(p.fees)}</td><td>${p.gain == null ? 'to verify' : aud(p.gain)}${p.status === 'ok' ? (p.wash ? '<br><b>possible wash sale, to review</b>' : '') : '<br><b>' + esc(p.status) + '</b>'}</td></tr>`).join('');
      const chk = checks(full, Y).map(esc);
      out.innerHTML = dn + `<h2 class="usreshead">2. Result ${esc(Y.label)}</h2>` + sel
        + (Y.blocked ? `<div class="note warn" role="status"><b>Income year ${esc(Y.label)} blocked.</b> CGT events from 1 July 2027 fall under the CGT reform (Act No. 49 of 2026: indexation and a 30% minimum tax), not implemented here. The old 50% discount is NOT applied automatically.</div>` :
          '<div class="kxkpi halo" aria-hidden="true">' + c('Net capital gain', Y.net == null ? 'to verify' : aud(Y.net), Y.net != null && Y.net > 0 ? 'pos' : '') + c('Gross gains', aud(Y.grossGains)) + c('Capital losses', aud(Y.losses)) + c('Losses to carry forward', aud(Y.carryForward)) + '</div>'
        + `<div class="note usguide"><b>CGT summary ${esc(Y.label)} (1 July ${Y.fy} to 30 June ${Y.fy + 1})</b><div class="scroll"><table class="us8949 uksa"><tr><th>Item</th><th>Amount (AUD)</th></tr>`
        + [['CGT events counted (parcels)', String(Y.count)], ['Capital proceeds', aud(Y.proceeds)], ['Cost base', aud(Y.cost)], ['Disposal costs', aud(Y.fees)], ['Gross capital gains', aud(Y.grossGains)], ['– eligible for the discount (12 months)', aud(Y.disc)], ['– not eligible (under 12 months)', aud(Y.nonDisc)],
          ['Current-year capital losses', aud(Y.losses)], ['Prior-year net capital losses applied', aud(Y.priorApplied) + (Y.prior ? ' of ' + aud(Y.prior) : '')], ['Gains after losses', aud(Y.afterLosses)],
          ['CGT discount (50%)', Y.discount == null ? 'not applied (residency not confirmed)' : aud(Y.discount)], ['Net capital gain', Y.net == null ? 'to verify (before discount: ' + aud(Y.afterLosses) + ')' : aud(Y.net)], ['Net capital losses to carry forward', aud(Y.carryForward)]].map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')
        + `</table></div><span class="hint">Order: current-year losses (first against gains under 12 months), then prior-year losses, then the 50% discount (ITAA 1997 s 102-5; ATO myTax 2026). Residency: ${esc(RES_TXT(Y.resident))}. Only the parcels in these files — to verify.</span></div>`)
        + `<div class="note total-global" role="status">Tax dates: <b>${esc(tzName(tx.tz))}</b>, ${esc(tx.how)}; file times: ${esc(fileTz)} (explicit offsets kept). <span class="hint">Income year 1 July – 30 June. No income tax computed. Estimate, not tax advice.</span></div>`
        + `<div class="note"><b>To verify (${chk.length})</b><ul>${chk.map(x => '<li>' + x + '</li>').join('')}</ul></div>`
        + (Y.income.length ? `<div class="note"><b>Staking and other rewards (ordinary income, separate): ${aud(Y.incomeAud)}${Y.incomeUnknown ? ' + ' + Y.incomeUnknown + ' without value' : ''}</b></div><div class="scroll"><table class="us8949"><tr><th>Date</th><th>Asset</th><th>Quantity</th><th>Value (AUD)</th><th>Type</th></tr>${Y.income.map(x => `<tr class="${x.aud == null ? 'tv' : ''}"><td>${dmy(x.day * DAY)}</td><td>${esc(x.asset)}</td><td>${+x.qty.toPrecision(10)}</td><td>${x.aud == null ? 'value missing - to verify' : aud(x.aud)}</td><td>${esc(x.type)}</td></tr>`).join('')}</table></div>` : '')
        + (Y.airdrops.length ? `<div class="note"><b>Airdrops to review (${Y.airdrops.length})</b> <span class="hint">Income or not depending on the facts; cost base = market value at receipt when known (draft TR 2026/D1).</span></div><div class="scroll"><table class="us8949"><tr><th>Date</th><th>Asset</th><th>Quantity</th><th>Value (AUD)</th></tr>${Y.airdrops.map(x => `<tr class="tv"><td>${dmy(x.day * DAY)}</td><td>${esc(x.asset)}</td><td>${+x.qty.toPrecision(10)}</td><td>${x.aud == null ? 'value missing - to verify' : aud(x.aud)}</td></tr>`).join('')}</table></div>` : '')
        + `<details class="usdet" open><summary>Parcels disposed (${Y.parcels.length})</summary><div class="scroll"><table class="us8949"><tr><th>Disposed</th><th>Asset</th><th>Quantity</th><th>Acquired</th><th>12 months</th><th>Proceeds (AUD)</th><th>Cost base (AUD)</th><th>Costs (AUD)</th><th>Gain/loss (AUD)</th></tr>${tr}</table></div></details>`
        + `<details class="usdet"><summary>Holdings at 30 June ${Y.fy + 1} (${inv.length})</summary><div class="scroll"><table class="us8949"><tr><th>Asset</th><th>Quantity</th><th>Cost base (AUD)</th><th>Parcels</th><th>Oldest</th></tr>${inv.map(x => `<tr class="${x.cost == null ? 'tv' : ''}"><td>${esc(x.asset)}</td><td>${x.qty}</td><td>${x.cost == null ? 'unknown - to verify' : aud(x.cost)}</td><td>${x.parcels}</td><td>${dmy(x.oldest)}</td></tr>`).join('')}</table></div></details>`
        + skippedHtml() + (cur.platform ? `<p class="hint" id="auplatform">Recognised format: ${esc(cur.platform)}. Amounts in their own currency, converted to AUD; token swaps and rewards without a value in the file — to verify.</p>` : '')
        + `<p class="usexp"><button type="button" id="aupdf" class="btn"${W.jspdf && !Y.blocked ? '' : ' hidden'}>Download PDF</button> <button type="button" id="aucsv" class="btn ghost"${Y.blocked ? ' hidden' : ''}>Download CSV</button></p>`;
    }
    const skippedHtml = () => { const S = cur ? cur.skipped.filter(x => !x.kept) : []; return S.length ? `<p class="hint">${S.length} line${S.length > 1 ? 's' : ''} ignored: ${esc(groupLines(S, 5).map(g => g.text).join('; '))}.</p>` : ''; };
    out.addEventListener('change', e => { if (e.target.id === 'auyear') { year = e.target.value; draw(); } });
    out.addEventListener('click', e => { if (!full || !year) return;
      if (e.target.id === 'aucsv') save(new Blob(['\uFEFF', toCSV(full, year, opts())], { type: 'text/csv;charset=utf-8' }), fileName(year, 'csv'));
      if (e.target.id === 'aupdf' && W.jspdf) pdf(W.jspdf.jsPDF, full, year, opts()).save(fileName(year, 'pdf')); });
    { const hb = doc.getElementById('auhelpbtn'), hp = doc.getElementById('auhelppanel'); if (hb && hp) hb.addEventListener('click', () => { const op = hp.hidden; hp.hidden = !op; hb.setAttribute('aria-expanded', String(op)); }); }
    const zone = doc.getElementById('auimp');
    if (zone) { const has = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
      zone.addEventListener('dragover', e => { if (has(e)) { e.preventDefault(); zone.classList.add('dropover'); } });
      zone.addEventListener('dragleave', () => zone.classList.remove('dropover'));
      zone.addEventListener('drop', e => { zone.classList.remove('dropover'); if (!has(e)) return; e.preventDefault(); try { inp.files = e.dataTransfer.files; inp.dispatchEvent(new Event('change')); } catch (x) {} }); }
    inp.multiple = true; const files = [], flist = doc.createElement('ul'), vbtn = doc.createElement('button'), fmsg = doc.createElement('div');
    flist.className = 'flist'; flist.id = 'auflist'; flist.hidden = true; vbtn.type = 'button'; vbtn.className = 'btn validate'; vbtn.id = 'auvalidate'; vbtn.textContent = 'Confirm imports'; vbtn.disabled = true; fmsg.id = 'aufmsg';
    if (zone) { zone.appendChild(flist); zone.appendChild(vbtn); zone.appendChild(fmsg); }
    const drawFiles = () => { flist.innerHTML = files.map((x, i) => `<li><span>${esc(x.name)} (${x.rba ? 'RBA exchange rates ' + x.rba.from + ' to ' + x.rba.to : x.p.txs.length + ' line' + (x.p.txs.length > 1 ? 's' : '')})</span> <button type="button" class="small ghost" data-rmi="${i}" aria-label="Remove ${esc(x.name)}">✕</button></li>`).join(''); flist.hidden = !files.length; };
    const drawNotes = () => { fmsg.innerHTML = notes0.join(''); };
    const dirtyFiles = () => { drawFiles(); vbtn.disabled = !files.some(x => !x.rba); cur = full = null; year = null; stale = false; dupNote = 0; out.innerHTML = ''; };
    { const rb = doc.getElementById('aureset'); if (rb) rb.addEventListener('click', () => { if (!W.confirm('Reset everything? The imported files and the results on this page will be cleared.')) return; files.length = 0; notes0 = []; drawNotes(); inp.value = ''; dirtyFiles(); }); }
    flist.addEventListener('click', e => { const b = e.target.closest('[data-rmi]'); if (!b) return; files.splice(+b.dataset.rmi, 1); notes0 = []; drawNotes(); dirtyFiles(); });
    inp.addEventListener('change', async () => {
      const F = Array.from(inp.files || []); if (!F.length) return; const notes = [];
      for (const f of F) { if (files.some(x => x.name === f.name && x.size === f.size)) { notes.push('<p class="warn">' + esc(f.name) + ': already imported, ignored.</p>'); continue; }
        const r = await readOne(f); if (r.err) notes.push(r.err); else if (r.p.rba) files.push({ name: f.name, size: f.size, rba: r.p.rba }); else files.push({ name: f.name, size: f.size, p: r.p }); }
      inp.value = ''; dirtyFiles(); notes0 = notes; drawNotes();
    });
    /* Conversion always works on a copy of the raw lines (never twice on the same lines), with the time zones at the time of the confirmation. */
    const fresh = p => ({ ...p, txs: p.txs.map(t => ({ ...t })), skipped: (p.skipped || []).slice() });
    vbtn.addEventListener('click', async () => { const T = files.filter(x => !x.rba); if (!T.length) return; vbtn.disabled = true;
      const R = files.filter(x => x.rba).map(x => x.rba); rba = R.length ? R.reduce((a, b) => { const o = { rates: {}, from: a.from < b.from ? a.from : b.from, to: a.to > b.to ? a.to : b.to, n: a.n + b.n }; [a, b].forEach(x => { for (const c in x.rates) Object.assign(o.rates[c] = o.rates[c] || {}, x.rates[c]); }); return o; }) : null;
      const P = T.map(x => ({ name: x.name, p: fresh(x.p) }));
      for (const f of P) if (f.p.txs.some(t => t.needFx)) { f.p.fileTz = fileTz; out.innerHTML = '<p class="hint">Converting to AUD (' + (rba ? 'RBA table' : 'ECB rates via Frankfurter') + ')…</p>';
        await convertFx(f.p, { rba, getJson: async u => { const r = await fetch(u); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); } }, taxNow().tz); }
      const m = mergeFiles(P); notes0 = []; drawNotes(); dupNote = m.dupes || 0; stale = false;
      name = T.map(x => x.name).join(', '); cur = m; year = null; calc(); draw(); });
    async function readOne(f) {
      const data = new Uint8Array(await f.arrayBuffer()); let p;
      try { if (/\.(xlsx|xls)$/i.test(f.name)) { if (!W.XLSX) return { err: '<p class="warn">Excel reading unavailable. Reload the page.</p>' }; p = fromWorkbook(W.XLSX, data, f.name); }
        else if (/\.pdf$/i.test(f.name)) { if (!W.pdfjsLib || !KP) return { err: '<p class="warn">PDF reading unavailable. Reload the page.</p>' };
          W.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js'; out.innerHTML = '<p class="hint">Reading the PDF…</p>';
          const d = await W.pdfjsLib.getDocument({ data, isEvalSupported: false }).promise; let lines = [];
          for (let i = 1; i <= d.numPages; i++) { const c = await (await d.getPage(i)).getTextContent(); lines = lines.concat(KP.itemsToLines(c.items)); }
          p = fromPdfLines(lines); if (!p.txs.length) return { err: '<p class="warn">' + esc(f.name) + ': no crypto transaction found in this PDF. Nothing was computed.</p>' }; }
        else p = fromCSVText(data, f.name); }
      catch (x) { return { err: '<p class="warn">' + esc(f.name) + ': unreadable file. Nothing was computed.</p>' }; }
      if (p.missingCols.length) return { err: '<p class="warn">' + esc(f.name) + ': columns not found: ' + esc(p.missingCols.join(', ')) + '. Expected at least Date, Type, Asset, Quantity, and Total or Price.</p>' };
      return { p };
    }
  }
  api.mount = mount;
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount(document)); else mount(document); }
  if (node) module.exports = api; else root.KryptaxAU = api;
})(typeof window !== 'undefined' ? window : this);
