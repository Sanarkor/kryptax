/* Kryptax - U.K. module v1 (separate from the French and U.S. engines; engine.js / formats.js / us-engine.js are only READ, never changed).
   Estimate of Capital Gains Tax figures on cryptoasset exchange tokens for a U.K. individual, from a CSV or Excel file with values in GBP.
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
  function mapHeader(head) { const h = head.map(norm), m = {}; for (const k in COLS) { const i = h.findIndex(x => COLS[k].includes(x)); if (i > -1) m[k] = i; } return m; }
  /* A header naming another currency (USD, EUR, $, EUR sign) for the value columns: refused, values must be in GBP. */
  function otherCurrency(head) { return head.map(norm).some(x => /^(price|total|value|fee|fees|subtotal|proceeds)\b.*(usd|eur|\$|\u20ac)/.test(x)); }
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
  const num = v => { if (v == null || String(v).trim() === '') return NaN; const s = String(v); if (/[$\u20ac]/.test(s)) return NaN; const n = E.parseNum(s.replace(/\u00a3/g, '')); return isFinite(n) ? Math.abs(n) : NaN; };
  const foreign = v => /[$\u20ac]|\b(usd|eur)\b/i.test(String(v == null ? '' : v));
  const UTC_SUFFIX = /\s*(?:UTC|GMT|Z|[+-]00:?00)$/i;
  const ukDate = v => v instanceof Date ? Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), v.getHours(), v.getMinutes(), v.getSeconds())
    : typeof v === 'number' ? NaN : E.parseDate(String(v == null ? '' : v).trim().replace(UTC_SUFFIX, ''), 'DMY', 'UTC');
  function headerIndex(rows) {
    for (let i = 0; i < Math.min(25, rows.length); i++) { const m = mapHeader(rows[i] || []); if (['date', 'type', 'asset', 'qty'].every(k => m[k] != null)) return i; }
    return 0;
  }
  function parseRows(rows) {
    const hi = headerIndex(rows), head = rows[hi] || [], m = mapHeader(head), out = { txs: [], skipped: [], missingCols: ['date', 'type', 'asset', 'qty'].filter(k => m[k] == null), currency: otherCurrency(head) };
    if (out.missingCols.length || out.currency) return out;
    rows.slice(hi + 1).forEach((r, i) => {
      const g = k => m[k] == null ? '' : r[m[k]], line = hi + i + 2;
      if (!r.some(x => String(x).trim() !== '')) return;
      const type = kind(g('type')), date = ukDate(g('date')), asset = String(g('asset') || '').trim().toUpperCase(), qty = num(g('qty'));
      if (!type || !isFinite(date) || !asset || !(qty > 0)) { out.skipped.push({ line, why: !type ? 'unknown type' : !isFinite(date) ? 'unreadable date' : 'missing asset or quantity' }); return; }
      if (['price', 'total', 'fee'].some(k => foreign(g(k)))) { out.skipped.push({ line, why: 'value not in GBP' }); return; }
      const price = num(g('price')), total0 = num(g('total')), fee = num(g('fee'));
      const gbp = isFinite(total0) ? total0 : isFinite(price) ? price * qty : NaN;
      out.txs.push({ line, date, type, rawType: String(g('type') || ''), asset, qty, gbp, fee: isFinite(fee) ? fee : 0, toAsset: String(g('toAsset') || '').trim().toUpperCase(), toQty: num(g('toQty')) });
    });
    out.txs.sort((a, b) => a.date - b.date || a.line - b.line);
    return out;
  }
  function fromCSVText(input) { return parseRows(Array.from(KF.parseCSV(input))); }
  function fromWorkbook(X, data) {
    const wb = X.read(data, { cellDates: true }); let best = null;
    for (const n of wb.SheetNames) { const rows = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }); if (!rows.length) continue; const p = parseRows(rows); if (!p.missingCols.length) return p; if (!best) best = p; }
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
    const dayOf = t => Math.floor(shiftTz(t, fileTz, LONDON) / DAY);
    const A = {}, notes = [], income = [], transfers = { count: 0, withFee: 0 };
    const slot = (asset, day) => { const a = A[asset] || (A[asset] = {}); return a[day] || (a[day] = { aq: 0, ac: 0, aUnknown: false, aLines: [], dq: 0, dp: 0, df: 0, dUnknown: false, dLines: [], gift: false, airdrop: false }); };
    const acq = (asset, day, qty, cost, line) => { const s = slot(asset, day); s.aq += qty; if (cost == null || !isFinite(cost)) s.aUnknown = true; else s.ac += cost; s.aLines.push(line); return s; };
    const disp = (asset, day, qty, proceeds, fee, line) => { const s = slot(asset, day); s.dq += qty; if (proceeds == null || !isFinite(proceeds)) s.dUnknown = true; else s.dp += proceeds; s.df += fee || 0; s.dLines.push(line); return s; };
    for (const t of txs) {
      const d = dayOf(t.date), v = isFinite(t.gbp) ? t.gbp : null;
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
  const LEGAL = 'Not tax advice - estimate to verify. Rules: HMRC Cryptoassets Manual CRYPTO22100, CRYPTO22150, CRYPTO22200 (TCGA92/S104, S105, S106A); Capital Gains Tax rates and allowances; SA108 notes 2026.';
  function toCSV(res, y) {
    const Y = yearSummary(res, y), q = v => { const s = String(v == null ? '' : v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }, n = v => v == null ? 'to verify' : v.toFixed(2);
    const L = [['Kryptax U.K. - Capital gains summary (estimate, to verify)'], ['Tax year', y + ' (6 April to 5 April)'], [],
      ['SA108 box', 'Description', 'Amount (GBP)'], ['13.1', 'Number of disposals', Y.count], ['13.2', 'Disposal proceeds', n(Y.proceeds)], ['13.3', 'Allowable costs (including purchase price)', n(Y.costs)],
      ['13.4', 'Gains in the year, before losses', n(Y.gains)], ['13.5', 'Losses in the year', n(Y.losses)], ['', 'Net gain or loss', n(Y.net)],
      ['', 'Annual exempt amount', Y.aea == null ? 'to verify' : n(Y.aea)], ['', 'Net gain above the annual exempt amount', Y.taxable == null ? 'to verify' : n(Y.taxable)], [],
      ['Date', 'Asset', 'Quantity', 'Proceeds', 'Allowable costs', 'Gain or loss', 'Matching', 'Status']];
    Y.disposals.forEach(x => L.push([dmy(x.date), x.asset, +x.qty.toPrecision(10), n(x.proceeds), n(x.cost), n(x.gain), x.parts.map(ruleText).join(' + '), x.status]));
    if (Y.income.length) { L.push([], ['Income (staking, mining, rewards, airdrops)'], ['Date', 'Asset', 'Quantity', 'Value (GBP)', 'Type']); Y.income.forEach(x => L.push([dmy(x.day * DAY), x.asset, +x.qty.toPrecision(10), x.airdrop ? 'to verify (airdrop)' : n(x.gbp), x.type])); }
    L.push([], [LEGAL]);
    return L.map(r => r.map(q).join(',')).join('\r\n') + '\r\n';
  }
  const ascii = s => String(s == null ? '' : s).replace(/\u00a3/g, 'GBP ').replace(/[\u2013\u2014]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[^\x20-\x7e]/g, '?');
  /* PDF lines, ASCII only (tested). */
  function pdfData(res, y, now) {
    const Y = yearSummary(res, y); now = now || new Date();
    const info = ['Tax year ' + y + ' (6 April to 5 April). Generated ' + now.getUTCFullYear() + '-' + p2(now.getUTCMonth() + 1) + '-' + p2(now.getUTCDate()) + ' UTC.',
      'Matching: same day rule, then 30 day rule, then section 104 pool, for each type of token. Days in U.K. time (Europe/London); times in file: ' + res.fileTz + '.',
      'SA108 Cryptoassets: 13.1 disposals ' + Y.count + ' | 13.2 proceeds ' + gbp(Y.proceeds) + ' | 13.3 allowable costs ' + gbp(Y.costs) + ' | 13.4 gains ' + gbp(Y.gains) + ' | 13.5 losses ' + gbp(Y.losses),
      'Net gain or loss ' + gbp(Y.net) + ' | annual exempt amount ' + (Y.aea == null ? 'to verify' : gbp(Y.aea)) + ' | above it ' + (Y.taxable == null ? 'to verify' : gbp(Y.taxable)) + '. No tax computed (rate depends on your taxable income).',
      (Y.toVerify.length ? Y.toVerify.length + ' disposal(s) to verify, not in the totals. ' : '') + 'Only the disposals in this file; losses of other years and other assets not included.'];
    if (Y.income.length) info.push('Income (staking, mining, rewards): ' + gbp(Y.incomeGbp) + ' (miscellaneous income, to verify; airdrops listed apart, to verify).');
    const rows = Y.disposals.map(x => [dmy(x.date), x.asset, String(+x.qty.toPrecision(10)), gbp(x.proceeds), gbp(x.cost), gbp(x.gain), x.parts.map(ruleText).join(' + '), x.status === 'ok' ? '' : x.status].map(ascii));
    return { title: 'Kryptax U.K. - Capital gains summary (estimate)', info: info.map(ascii), head: ['Date', 'Asset', 'Qty', 'Proceeds', 'Costs', 'Gain/loss', 'Matching', 'Status'], rows, foot: ascii(LEGAL) };
  }
  function pdf(jsPDF, res, y) {
    const D = pdfData(res, y), doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' }); let yy = 40;
    doc.setFontSize(14); doc.text(D.title, 40, yy); yy += 20; doc.setFontSize(9);
    D.info.forEach(l => { doc.splitTextToSize(l, 760).forEach(s => { doc.text(s, 40, yy); yy += 12; }); });
    if (doc.autoTable) doc.autoTable({ head: [D.head], body: D.rows, startY: yy + 6, styles: { fontSize: 8 }, margin: { left: 40, right: 40 } });
    const n = doc.getNumberOfPages(); for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.text(D.foot, 40, doc.internal.pageSize.getHeight() - 20); }
    return doc;
  }
  const api = { COLS, mapHeader, kind, parseRows, fromCSVText, fromWorkbook, ukDate, taxYear, AEA, compute, yearSummary, toCSV, pdfData, pdf, gbp, dmy, shiftTz, LEGAL };
  /* ---------- page (browser only) ---------- */
  function mount(doc) {
    const box = doc.getElementById('ukmode'); if (!box || box.dataset.ready) return; box.dataset.ready = '1';
    const inp = doc.getElementById('ukfile'), out = doc.getElementById('ukresult'), tzSel = doc.getElementById('uktz'); if (!inp || !out) return;
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]), W = typeof window !== 'undefined' ? window : root;
    let cur = null, full = null, year = null, fileTz = LONDON, name = '';
    let browserTz = 'UTC'; try { browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (x) {}
    if (tzSel) { const L = [[LONDON, 'U.K. time (Europe/London)'], ['UTC', 'UTC']]; if (browserTz !== LONDON && browserTz !== 'UTC') L.push([browserTz, 'This browser (' + browserTz + ')']);
      tzSel.innerHTML = L.map(z => `<option value="${esc(z[0])}">${esc(z[1])}</option>`).join(''); tzSel.addEventListener('change', () => { fileTz = tzSel.value; if (cur) render(); }); }
    const stamp = (p, ext) => { const d = new Date(); return p + '_' + d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '.' + ext; };
    const save = (blob, fn) => { const a = doc.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fn; doc.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
    function render() {
      full = compute(cur.txs, { fileTz }); const Ys = full.years; if (!year || !Ys.includes(year)) year = Ys.length ? Ys[Ys.length - 1] : null;
      if (!year) { out.innerHTML = '<p class="warn">' + esc(name) + ': no disposal or income found. Nothing to report.</p>' + skippedHtml(); return; }
      const Y = yearSummary(full, year), c = (l, v, k) => `<div><span>${l}</span><b class="${k || ''}">${v}</b></div>`;
      const sel = Ys.length > 1 ? `<div class="grid"><label>Tax year <select id="ukyear">${Ys.map(y => `<option value="${y}"${y === year ? ' selected' : ''}>${y}</option>`).join('')}</select></label></div>` : '';
      const tr = Y.disposals.map(x => `<tr class="${x.status === 'ok' ? '' : 'tv'}"><td>${dmy(x.date)}</td><td>${esc(x.asset)}${x.gift ? ' <span class="hint">(gift)</span>' : ''}</td><td>${+x.qty.toPrecision(10)}</td><td>${gbp(x.proceeds)}</td><td>${gbp(x.cost)}</td><td>${gbp(x.gain)}</td><td>${esc(x.parts.map(ruleText).join(' + ') || '-')}${x.status === 'ok' ? '' : '<br><b>' + esc(x.status) + '</b>'}</td></tr>`).join('');
      const chk = [];
      Y.toVerify.forEach(x => chk.push(`${dmy(x.date)} ${esc(x.asset)}: ${esc(x.status)} (not in the totals).`));
      if (Y.disposals.some(x => x.gift)) chk.push('Gifts are disposals at market value, except to a spouse, civil partner or charity (remove those lines) — to verify.');
      if (Y.income.some(x => x.airdrop)) chk.push('Airdrops: pooled with a GBP 0 cost; Income Tax may or may not apply (CRYPTO21250) — to verify.');
      if (full.transfers.withFee) chk.push(full.transfers.withFee + ' transfer(s) with a fee: network fees paid in tokens are not handled — to verify.');
      full.notes.forEach(n => chk.push('Line ' + n.line + ': ' + esc(n.why) + '.'));
      if (Y.aea == null) chk.push('Annual exempt amount for ' + esc(year) + ': not in the table read on gov.uk — to verify.');
      chk.push('Losses brought forward, other assets and the Capital Gains Tax rate are not included — to verify.');
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
          + `<div class="scroll"><table class="us8949"><tr><th>Date</th><th>Asset</th><th>Quantity</th><th>Value GBP</th><th>Type</th></tr>${Y.income.map(x => `<tr class="${x.airdrop || x.gbp == null ? 'tv' : ''}"><td>${dmy(x.day * DAY)}</td><td>${esc(x.asset)}</td><td>${+x.qty.toPrecision(10)}</td><td>${x.airdrop ? 'airdrop, to verify' : gbp(x.gbp)}</td><td>${esc(x.type)}</td></tr>`).join('')}</table></div>` : '')
        + `<details class="usdet" open><summary>Disposals (${Y.disposals.length})</summary><div class="scroll"><table class="us8949"><tr><th>Date</th><th>Asset</th><th>Quantity</th><th>Proceeds</th><th>Allowable costs</th><th>Gain/loss</th><th>Matching</th></tr>${tr}</table></div></details>`
        + skippedHtml()
        + `<p class="usexp"><button type="button" id="ukpdf" class="btn"${W.jspdf ? '' : ' hidden'}>Download PDF summary</button> <button type="button" id="ukcsv" class="btn ghost">Download CSV (summary)</button></p>`;
    }
    const skippedHtml = () => cur && cur.skipped.length ? `<p class="hint">${cur.skipped.length} line${cur.skipped.length > 1 ? 's' : ''} skipped: ${esc(cur.skipped.slice(0, 5).map(s => 'line ' + s.line + ' (' + s.why + ')').join(', '))}.</p>` : '';
    out.addEventListener('change', e => { if (e.target.id === 'ukyear') { year = e.target.value; render(); } });
    out.addEventListener('click', e => {
      if (!full || !year) return;
      if (e.target.id === 'ukcsv') save(new Blob(['\uFEFF', toCSV(full, year)], { type: 'text/csv;charset=utf-8' }), stamp('kryptax-uk-summary', 'csv'));
      if (e.target.id === 'ukpdf' && W.jspdf) pdf(W.jspdf.jsPDF, full, year).save(stamp('kryptax-uk-summary', 'pdf'));
    });
    { const hb = doc.getElementById('ukhelpbtn'), hp = doc.getElementById('ukhelppanel'); if (hb && hp) hb.addEventListener('click', () => { const op = hp.hidden; hp.hidden = !op; hb.setAttribute('aria-expanded', String(op)); }); }
    { const rb = doc.getElementById('ukreset'); if (rb) rb.addEventListener('click', () => { if (!W.confirm('Reset everything? The imported file and the results on this page will be cleared.')) return; cur = full = null; year = null; inp.value = ''; out.innerHTML = ''; }); }
    const zone = doc.getElementById('ukimp');
    if (zone) { const has = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
      zone.addEventListener('dragover', e => { if (has(e)) { e.preventDefault(); zone.classList.add('dropover'); } });
      zone.addEventListener('dragleave', () => zone.classList.remove('dropover'));
      zone.addEventListener('drop', e => { zone.classList.remove('dropover'); if (!has(e)) return; e.preventDefault(); try { inp.files = e.dataTransfer.files; inp.dispatchEvent(new Event('change')); } catch (x) {} }); }
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0]; if (!f) return; name = f.name;
      const data = new Uint8Array(await f.arrayBuffer()); let p;
      try { if (/\.(xlsx|xls)$/i.test(f.name)) { if (!W.XLSX) { out.innerHTML = '<p class="warn">Excel reading is not available. Please reload the page.</p>'; return; } p = fromWorkbook(W.XLSX, data); }
        else if (/\.pdf$/i.test(f.name)) { out.innerHTML = '<p class="warn">' + esc(f.name) + ': PDF is not read in the U.K. version yet. Please export a CSV or Excel file.</p>'; return; }
        else p = fromCSVText(data); }
      catch (x) { out.innerHTML = '<p class="warn">' + esc(f.name) + ': this file could not be read. Nothing was computed.</p>'; return; }
      if (p.currency) { out.innerHTML = '<p class="warn">' + esc(f.name) + ': the values are not in GBP (USD or EUR column). Nothing was computed. Please export your history in GBP.</p>'; return; }
      if (p.missingCols.length) { out.innerHTML = '<p class="warn">' + esc(f.name) + ': columns not found: ' + esc(p.missingCols.join(', ')) + '. Expected at least Date, Type, Asset, Quantity, plus Total or Price (GBP).</p>'; return; }
      cur = p; year = null; render();
    });
  }
  api.mount = mount;
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount(document)); else mount(document); }
  if (node) module.exports = api; else root.KryptaxUK = api;
})(typeof window !== 'undefined' ? window : this);
