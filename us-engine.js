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
   Not coded (shown as "to verify"): wash sales, specific identification, several wallets (Rev. Proc. 2024-28), income amounts. */
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
    toQty: ['received quantity', 'to quantity', 'quantity received', 'buy quantity']
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
    if (/send|receive|deposit|withdraw|transfer/.test(t)) return 'TRANSFER';
    return null;
  }
  const num = v => { if (v == null || String(v).trim() === '') return NaN; const n = E.parseNum(String(v)); return isFinite(n) ? Math.abs(n) : NaN; };
  /* rows: array of arrays (first = header). Returns { txs, skipped, missingCols } */
  function parseRows(rows) {
    const head = rows[0] || [], m = mapHeader(head), out = { txs: [], skipped: [], missingCols: ['date', 'type', 'asset', 'qty'].filter(k => m[k] == null) };
    if (out.missingCols.length) return out;
    rows.slice(1).forEach((r, i) => {
      const g = k => m[k] == null ? '' : r[m[k]];
      const line = i + 2, type = kind(g('type')), date = E.parseDate(String(g('date')).trim(), 'MDY', 'UTC');
      const asset = String(g('asset') || '').trim().toUpperCase(), qty = num(g('qty'));
      if (!type || !isFinite(date) || !asset || !(qty > 0)) { if (r.some(x => String(x).trim() !== '')) out.skipped.push({ line, why: !type ? 'unknown type' : !isFinite(date) ? 'unreadable date' : 'missing asset or quantity' }); return; }
      const price = num(g('price')), total0 = num(g('total')), fee = num(g('fee'));
      const total = isFinite(total0) ? total0 : isFinite(price) ? price * qty : NaN;
      out.txs.push({ line, date, type, asset, qty, usd: total, fee: isFinite(fee) ? fee : 0, toAsset: String(g('toAsset') || '').trim().toUpperCase(), toQty: num(g('toQty')) });
    });
    out.txs.sort((a, b) => a.date - b.date || a.line - b.line);
    return out;
  }
  /* Long term = sold strictly after the 1-year anniversary of the acquisition date (calendar days, UTC). */
  function isLong(acq, sold) {
    const a = new Date(acq), s = new Date(sold), anniv = Date.UTC(a.getUTCFullYear() + 1, a.getUTCMonth(), a.getUTCDate());
    const sd = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
    return sd > anniv;
  }
  const r2 = v => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
  /* FIFO, one wallet. Returns 8949-style rows + totals. A row whose basis or proceeds is unknown is flagged "to verify" and left out of the totals. */
  function compute(txs) {
    const lots = {}, rows = [], notes = [], income = [];
    const add = (asset, qty, cost, date, line) => (lots[asset] = lots[asset] || []).push({ qty, cost, date, line });
    for (const t of txs) {
      if (t.type === 'BUY') add(t.asset, t.qty, isFinite(t.usd) ? t.usd + t.fee : NaN, t.date, t.line);
      else if (t.type === 'INCOME') { income.push(t); add(t.asset, t.qty, isFinite(t.usd) ? t.usd : NaN, t.date, t.line); }
      else if (t.type === 'TRANSFER') notes.push({ line: t.line, msg: 'Transfer ignored (v1 assumes one wallet): check it is between your own accounts.' });
      else if (t.type === 'SELL' || t.type === 'CONVERT') {
        const proceeds = isFinite(t.usd) ? t.usd - t.fee : NaN; let left = t.qty; const L = lots[t.asset] || [];
        while (left > 1e-12) {
          const lot = L[0]; const q = lot ? Math.min(lot.qty, left) : left, part = q / t.qty;
          const cost = lot ? (isFinite(lot.cost) ? lot.cost * q / lot.qty : NaN) : NaN;
          const pr = isFinite(proceeds) ? proceeds * part : NaN;
          const row = { line: t.line, desc: (+q.toPrecision(10)) + ' ' + t.asset, asset: t.asset, qty: q, acquired: lot ? lot.date : null, sold: t.date,
            proceeds: r2(pr), cost: r2(cost), gain: isFinite(pr) && isFinite(cost) ? r2(pr - cost) : null, term: lot ? (isLong(lot.date, t.date) ? 'long' : 'short') : null,
            convert: t.type === 'CONVERT', status: 'ok' };
          if (!lot) row.status = 'to verify: no purchase found for these units (missing cost basis)';
          else if (!isFinite(cost)) row.status = 'to verify: purchase price unknown (missing cost basis)';
          else if (!isFinite(pr)) row.status = 'to verify: USD value of the sale unknown';
          rows.push(row);
          if (lot) { lot.cost = isFinite(lot.cost) ? lot.cost - lot.cost * q / lot.qty : lot.cost; lot.qty -= q; if (lot.qty <= 1e-12) L.shift(); }
          left -= q;
        }
        if (t.type === 'CONVERT') { // the asset received is acquired at its fair market value = USD value of the exchange (FAQ Q18)
          if (t.toAsset && t.toQty > 0) add(t.toAsset, t.toQty, isFinite(t.usd) ? t.usd : NaN, t.date, t.line);
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
    return { rows, totals, notes };
  }
  const mdy = t => { if (t == null) return 'unknown'; const d = new Date(t); return String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + String(d.getUTCDate()).padStart(2, '0') + '/' + d.getUTCFullYear(); };
  const usd = v => v == null ? 'to verify' : (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  /* CSV of 8949-style lines (columns a, b, c, d, e, h + term/box hint + status) */
  function toCSV(res) {
    const q = v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
    const head = ['(a) Description', '(b) Date acquired', '(c) Date sold', '(d) Proceeds USD', '(e) Cost basis USD', '(h) Gain or loss USD', 'Term', 'Form 8949 box (no 1099-DA, to verify)', 'Status'];
    const L = res.rows.map(r => [r.desc, mdy(r.acquired), mdy(r.sold), r.proceeds == null ? '' : r.proceeds.toFixed(2), r.cost == null ? '' : r.cost.toFixed(2), r.gain == null ? '' : r.gain.toFixed(2), r.term || '', r.term === 'long' ? 'L' : r.term === 'short' ? 'I' : '', r.status]);
    return [head].concat(L).map(r => r.map(q).join(',')).join('\n') + '\n';
  }
  function fromCSVText(input) { const rows = Array.from(KF.parseCSV(input)); return parseRows(rows); }
  const api = { mapHeader, kind, parseRows, fromCSVText, compute, isLong, toCSV, mdy, usd };

  /* ---------- U.S.A. page (browser only) ---------- */
  function mount(doc) {
    const box = doc.getElementById('usmode'); if (!box || box.dataset.ready) return; box.dataset.ready = '1';
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const inp = doc.getElementById('usfile'), out = doc.getElementById('usresult'); if (!inp || !out) return;
    let last = null;
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      const p = fromCSVText(new Uint8Array(await f.arrayBuffer()));
      if (p.missingCols.length) { out.innerHTML = '<p class="warn">' + esc(f.name) + ': columns not found: ' + esc(p.missingCols.join(', ')) + '. Expected at least Date, Type, Asset, Quantity, plus Total (USD) or Price (USD).</p>'; return; }
      const res = last = compute(p.txs), T = res.totals;
      const trs = res.rows.map(r => `<tr class="${r.status === 'ok' ? '' : 'tv'}"><td>${esc(r.desc)}</td><td>${mdy(r.acquired)}</td><td>${mdy(r.sold)}</td><td>${usd(r.proceeds)}</td><td>${usd(r.cost)}</td><td>${usd(r.gain)}</td><td>${r.term || '?'}</td></tr>`).join('');
      out.innerHTML = `<div class="note total-global"><b>${T.sales} sale${T.sales > 1 ? 's' : ''}</b> (${T.rows} line${T.rows > 1 ? 's' : ''}, FIFO)<br>Short term: <b>${usd(T.short.gain)}</b> · Long term: <b>${usd(T.long.gain)}</b><br>Total gain or loss: <b>${usd(T.gain)}</b></div>`
        + (T.toVerify ? `<p class="warn">${T.toVerify} line${T.toVerify > 1 ? 's' : ''} to verify (missing cost or value), not included in the totals.</p>` : '')
        + (T.income.count ? `<p class="hint">${T.income.count} reward/income line${T.income.count > 1 ? 's' : ''} (${usd(T.income.usd)}) added as lots at their USD value; income itself is not computed here (to verify).</p>` : '')
        + (p.skipped.length ? `<p class="hint">${p.skipped.length} line${p.skipped.length > 1 ? 's' : ''} skipped: ${esc(p.skipped.slice(0, 5).map(s => 'line ' + s.line + ' (' + s.why + ')').join(', '))}.</p>` : '')
        + `<div class="scroll"><table class="us8949"><tr><th>(a) Description</th><th>(b) Acquired</th><th>(c) Sold</th><th>(d) Proceeds</th><th>(e) Cost</th><th>(h) Gain/loss</th><th>Term</th></tr>${trs}</table></div>`
        + `<p><button type="button" id="uscsv" class="small">Download CSV (Form 8949 lines)</button></p>`;
    });
    out.addEventListener('click', e => {
      if (e.target.id !== 'uscsv' || !last) return;
      const a = doc.createElement('a'); a.href = URL.createObjectURL(new Blob([toCSV(last)], { type: 'text/csv' })); a.download = 'kryptax-form8949-lines.csv'; doc.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    });
  }
  if (typeof module !== 'undefined') module.exports = api;
  else { root.KryptaxUS = api; if (root.document) { if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', () => mount(root.document)); else mount(root.document); } }
})(this);
