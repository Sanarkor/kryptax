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
   Not coded (shown as "to verify"): wash sales, income amounts. */
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
    toWallet: ['to wallet', 'destination', 'destination wallet', 'to account']
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
  /* Excel dates come as JS Date in local time (SheetJS cellDates): keep the calendar date/time as written, read as UTC. */
  const usDate = v => v instanceof Date ? Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), v.getHours(), v.getMinutes(), v.getSeconds())
    : typeof v === 'number' ? NaN : E.parseDate(String(v == null ? '' : v).trim(), 'MDY', 'UTC');
  /* rows: array of arrays (header found in the first 25 rows). Returns { txs, skipped, missingCols } */
  function parseRows(rows) {
    const hi = headerIndex(rows), head = rows[hi] || [], m = mapHeader(head), out = { txs: [], skipped: [], missingCols: ['date', 'type', 'asset', 'qty'].filter(k => m[k] == null) };
    if (out.missingCols.length) return out;
    rows.slice(hi + 1).forEach((r, i) => {
      const g = k => m[k] == null ? '' : r[m[k]];
      const line = hi + i + 2, type = kind(g('type')), date = usDate(g('date'));
      const asset = String(g('asset') || '').trim().toUpperCase(), qty = num(g('qty'));
      if (!type || !isFinite(date) || !asset || !(qty > 0)) { if (r.some(x => String(x).trim() !== '')) out.skipped.push({ line, why: !type ? 'unknown type' : !isFinite(date) ? 'unreadable date' : 'missing asset or quantity' }); return; }
      const price = num(g('price')), total0 = num(g('total')), fee = num(g('fee'));
      const total = isFinite(total0) ? total0 : isFinite(price) ? price * qty : NaN;
      out.txs.push({ line, date, type, asset, qty, usd: total, fee: isFinite(fee) ? fee : 0, toAsset: String(g('toAsset') || '').trim().toUpperCase(), toQty: num(g('toQty')), wallet: String(g('wallet') || '').trim(), toWallet: String(g('toWallet') || '').trim() });
    });
    out.txs.sort((a, b) => a.date - b.date || a.line - b.line);
    return out;
  }
  /* Excel (.xlsx/.xls) through the SheetJS already shipped (xlsx.mini.min.js): first sheet that has a recognised header. */
  function fromWorkbook(X, data) {
    const wb = X.read(data, { cellDates: true });
    let best = null;
    for (const n of wb.SheetNames) {
      const rows = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }); if (!rows.length) continue;
      const p = parseRows(rows); if (!p.missingCols.length) return p; if (!best) best = p;
    }
    return best || { txs: [], skipped: [], missingCols: ['date', 'type', 'asset', 'qty'] };
  }
  /* PDF statement in USD — BEST EFFORT, to verify. Text lines (same pdf.js, isEvalSupported:false) of the form:
     DATE TYPE ASSET QUANTITY $TOTAL [$FEE] [-> QTY ASSET]   e.g. "01/10/2025 Sell BTC 0.5 $35,000.00 $25.00"
     Lines that do not match are ignored; if no line matches, nothing is computed (never an invented result). */
  const PDF_RX = /^(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})(?:[ ,]+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)?\s+(buy|purchase|sell|sale|convert|exchange|swap|staking reward|reward|airdrop|interest|send|receive|deposit|withdrawal)\s+([A-Z0-9]{2,10})\s+([\d,]*\.?\d+)\s+\$\s?([\d,]*\.?\d+)(?:\s+\$\s?([\d,]*\.?\d+))?(?:\s+(?:→|->|to)\s+([\d,]*\.?\d+)\s+([A-Z0-9]{2,10}))?\s*$/i;
  function fromPdfLines(lines) {
    const rows = [['Date', 'Type', 'Asset', 'Quantity', 'Total (USD)', 'Fee (USD)', 'Received Asset', 'Received Quantity']];
    for (const l of lines) { const m = String(l).replace(/\s+/g, ' ').trim().match(PDF_RX); if (m) rows.push([m[1], m[2], m[3], m[4], m[5], m[6] || '', m[8] || '', m[7] || '']); }
    const p = parseRows(rows); p.matched = rows.length - 1; return p;
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
  function compute(txs, opts) {
    opts = opts || {}; const method = opts.method === 'HIFO' ? 'HIFO' : opts.method === 'MANUAL' ? 'MANUAL' : 'FIFO', picks = opts.picks || {}, sales = [];
    const unit = l => isFinite(l.cost) && l.qty > 0 ? l.cost / l.qty : -Infinity;
    const nextIdx = L => { if (method !== 'HIFO') return 0; let b = 0; for (let i = 1; i < L.length; i++) if (unit(L[i]) > unit(L[b]) + 1e-9) b = i; return b; };
    const lots = {}, rows = [], notes = [], income = [], key = (w, a) => (w || '') + '|' + a, wallets = new Set();
    const add = (w, asset, qty, cost, date, line) => { wallets.add(w || ''); (lots[key(w, asset)] = lots[key(w, asset)] || []).push({ qty, cost, date, line }); };
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
    const { pairs, used } = pairTransfers(txs), transfers = { paired: 0, toVerify: 0 };
    for (const t of txs) {
      if (t.wallet) wallets.add(t.wallet);
      if (t.type === 'BUY') add(t.wallet, t.asset, t.qty, isFinite(t.usd) ? t.usd + t.fee : NaN, t.date, t.line);
      else if (t.type === 'INCOME') { income.push(t); add(t.wallet, t.asset, t.qty, isFinite(t.usd) ? t.usd : NaN, t.date, t.line); }
      else if (t.type === 'OUT' && pairs.has(t)) {
        const i = pairs.get(t), r = take(t.wallet, t.asset, t.qty), gap = t.qty - i.qty; transfers.paired++;
        let moved = i.qty; // received units keep their original date and cost (FIFO pieces from the sending wallet)
        for (const p of r.pieces) { const q = Math.min(p.qty, moved); if (q > 1e-12) add(i.wallet, t.asset, q, isFinite(p.cost) ? p.cost * q / p.qty : NaN, p.date, p.line); moved -= q; }
        if (moved > 1e-12) add(i.wallet, t.asset, moved, NaN, i.date, i.line);
        notes.push({ line: t.line, kind: 'transfer', ok: true, msg: `Transfer ${+t.qty.toPrecision(10)} ${t.asset}${t.wallet || i.wallet ? ' from ' + (t.wallet || '?') + ' to ' + (i.wallet || '?') : ''} (lines ${t.line} → ${i.line}): not taxable, original dates and cost kept.` });
        if (r.missing > 1e-12) notes.push({ line: t.line, kind: 'transfer', msg: `Transfer line ${t.line}: ${+r.missing.toPrecision(10)} ${t.asset} sent but not found in ${t.wallet || 'the wallet'} (missing cost basis, to verify).` });
        if (gap > 1e-12 || t.fee > 0) notes.push({ line: t.line, kind: 'transfer', msg: `Network fee on transfer line ${t.line}${gap > 1e-12 ? ': ' + (+gap.toPrecision(10)) + ' ' + t.asset + ' not received' : ''}${t.fee > 0 ? ' ($' + t.fee.toFixed(2) + ')' : ''} — tax treatment to verify (not counted as a sale here).` });
      } else if (t.type === 'OUT' || t.type === 'TRANSFER') {
        if (t.type === 'TRANSFER' && t.toWallet && t.toWallet !== t.wallet) { // one-line transfer with a destination wallet
          const r = take(t.wallet, t.asset, t.qty); transfers.paired++;
          for (const p of r.pieces) add(t.toWallet, t.asset, p.qty, p.cost, p.date, p.line);
          if (r.missing > 1e-12) add(t.toWallet, t.asset, r.missing, NaN, t.date, t.line);
          notes.push({ line: t.line, kind: 'transfer', ok: true, msg: `Transfer ${+t.qty.toPrecision(10)} ${t.asset} from ${t.wallet || '?'} to ${t.toWallet} (line ${t.line}): not taxable, original dates and cost kept.` });
          if (t.fee > 0) notes.push({ line: t.line, kind: 'transfer', msg: `Network fee on transfer line ${t.line} ($${t.fee.toFixed(2)}) — tax treatment to verify.` });
        } else { // unpaired send: units leave the wallet, no gain computed, flagged
          take(t.wallet, t.asset, t.qty); transfers.toVerify++;
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
        const pieces = r.pieces.concat(r.missing > 1e-12 ? [{ qty: r.missing, cost: NaN, date: null, none: true }] : []);
        for (const p of pieces) {
          const q = p.qty, pr = isFinite(proceeds) ? proceeds * q / t.qty : NaN, cost = p.cost;
          const row = { line: t.line, desc: (+q.toPrecision(10)) + ' ' + t.asset, asset: t.asset, wallet: t.wallet || '', qty: q, acquired: p.none ? null : p.date, sold: t.date,
            proceeds: r2(pr), cost: r2(cost), gain: isFinite(pr) && isFinite(cost) ? r2(pr - cost) : null, term: p.none ? null : (isLong(p.date, t.date) ? 'long' : 'short'),
            convert: t.type === 'CONVERT', status: 'ok' };
          if (p.fallback) row.status = 'to verify: not enough units in the chosen lot (FIFO used for the rest)';
          if (p.none) row.status = 'to verify: no purchase found for these units (missing cost basis)';
          else if (!isFinite(cost)) row.status = 'to verify: purchase price unknown (missing cost basis)';
          else if (!isFinite(pr)) row.status = 'to verify: USD value of the sale unknown';
          rows.push(row);
        }
        if (t.type === 'CONVERT') { // the asset received is acquired at its fair market value = USD value of the exchange (FAQ Q18)
          if (t.toAsset && t.toQty > 0) add(t.wallet, t.toAsset, t.toQty, isFinite(t.usd) ? t.usd : NaN, t.date, t.line);
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
    totals.transfers = transfers; totals.method = method; wallets.delete(''); totals.wallets = [...wallets];
    return { rows, totals, notes, sales };
  }
  const mdy = t => { if (t == null) return 'unknown'; const d = new Date(t); return String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + String(d.getUTCDate()).padStart(2, '0') + '/' + d.getUTCFullYear(); };
  const usd = v => v == null ? 'to verify' : (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  /* CSV of 8949-style lines (columns a, b, c, d, e, h + term/box hint + status) */
  function toCSV(res) {
    const q = v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
    const head = ['(a) Description', '(b) Date acquired', '(c) Date sold', '(d) Proceeds USD', '(e) Cost basis USD', '(h) Gain or loss USD', 'Term', 'Form 8949 box (no 1099-DA, to verify)', 'Status'];
    const hasW = res.rows.some(r => r.wallet); if (hasW) head.push('Wallet');
    const L = res.rows.map(r => [r.desc, mdy(r.acquired), mdy(r.sold), r.proceeds == null ? '' : r.proceeds.toFixed(2), r.cost == null ? '' : r.cost.toFixed(2), r.gain == null ? '' : r.gain.toFixed(2), r.term || '', r.term === 'long' ? 'L' : r.term === 'short' ? 'I' : '', r.status].concat(hasW ? [r.wallet] : []));
    return [head].concat(L).map(r => r.map(q).join(',')).join('\n') + '\n';
  }
  function fromCSVText(input) { const rows = Array.from(KF.parseCSV(input)); return parseRows(rows); }
  const api = { pairTransfers, mapHeader, kind, headerIndex, parseRows, fromCSVText, fromWorkbook, fromPdfLines, compute, isLong, toCSV, mdy, usd };

  /* ---------- U.S.A. page (browser only) ---------- */
  function mount(doc) {
    const box = doc.getElementById('usmode'); if (!box || box.dataset.ready) return; box.dataset.ready = '1';
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const inp = doc.getElementById('usfile'), out = doc.getElementById('usresult'); if (!inp || !out) return;
    let last = null, cur = null, pdfN = '', method = 'FIFO', picks = {};
    const lotLabel = l => `line ${l.line} · ${mdy(l.date)} · ${+l.qty.toPrecision(8)} left · ${isFinite(l.unit) ? usd(l.unit) + '/unit' : 'cost unknown'}`;
    function manualHtml(res) {
      if (!res.sales.length) return '';
      return '<div class="grid">' + res.sales.map(sl => { const pk = picks[sl.line] || {};
        return `<label>Sale line ${sl.line}: ${esc(+sl.qty.toPrecision(10) + ' ' + sl.asset)} on ${mdy(sl.date)}${sl.wallet ? ' (' + esc(sl.wallet) + ')' : ''}<select class="uspick" data-line="${sl.line}"><option value="">Default (FIFO)</option>${sl.lots.map(l => `<option value="${l.line}"${pk.lot === l.line ? ' selected' : ''}>${esc(lotLabel(l))}</option>`).join('')}</select></label>`
          + `<label>Quantity from this lot<input class="usqty" data-line="${sl.line}" inputmode="decimal" value="${pk.lot ? esc(String(pk.qty)) : ''}" placeholder="${esc(String(+sl.qty.toPrecision(10)))}"></label>`; }).join('') + '</div>';
    }
    out.addEventListener('change', e => {
      const t = e.target; if (!cur) return;
      if (t.id === 'usmethod') { method = t.value; render(); return; }
      if (t.classList.contains('uspick') || t.classList.contains('usqty')) {
        const line = +t.dataset.line, sel = out.querySelector('.uspick[data-line="' + line + '"]'), qi = out.querySelector('.usqty[data-line="' + line + '"]');
        const sale = last.sales.find(x => x.line === line), lot = sel && sel.value ? +sel.value : 0;
        if (!lot) delete picks[line]; else { const q = parseFloat(String(qi && qi.value || '').replace(',', '.')); picks[line] = { lot, qty: q > 0 ? q : sale.qty }; }
        render();
      }
    });
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      const name = f.name.toLowerCase(), data = new Uint8Array(await f.arrayBuffer()), W = typeof window !== 'undefined' ? window : root;
      let p, pdfNote = '';
      try {
        if (/\.pdf$/.test(name) || (data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46)) {
          if (!W.pdfjsLib) { out.innerHTML = '<p class="warn">PDF reading is not available. Please reload the page.</p>'; return; }
          W.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
          const doc = await W.pdfjsLib.getDocument({ data, isEvalSupported: false }).promise; let lines = [];
          const toLines = W.KryptaxPipeline && W.KryptaxPipeline.itemsToLines;
          for (let i = 1; i <= doc.numPages; i++) { const c = await (await doc.getPage(i)).getTextContent(); lines = lines.concat(toLines ? toLines(c.items) : c.items.map(x => x.str)); }
          p = fromPdfLines(lines);
          if (!p.txs.length) { out.innerHTML = '<p class="warn">' + esc(f.name) + ': this PDF was not recognised. No USD transaction line was found (expected lines like “01/10/2025 Sell BTC 0.5 $35,000.00 $25.00”). Nothing was computed. Please export a CSV or Excel file instead.</p>'; return; }
          pdfNote = '<p class="warn">PDF import is best effort: ' + p.txs.length + ' line' + (p.txs.length > 1 ? 's' : '') + ' read. Please check every line against your statement (to verify).</p>';
        } else if (/\.(xlsx|xls)$/.test(name)) {
          if (!W.XLSX) { out.innerHTML = '<p class="warn">Excel reading is not available. Please reload the page.</p>'; return; }
          p = fromWorkbook(W.XLSX, data);
        } else p = fromCSVText(data);
      } catch (e) { out.innerHTML = '<p class="warn">' + esc(f.name) + ': this file could not be read. Nothing was computed.</p>'; return; }
      if (p.missingCols.length) { out.innerHTML = '<p class="warn">' + esc(f.name) + ': columns not found: ' + esc(p.missingCols.join(', ')) + '. Expected at least Date, Type, Asset, Quantity, plus Total (USD) or Price (USD).</p>'; return; }
      cur = p; pdfN = pdfNote; picks = {}; render();
    });
    function render() {
      const p = cur, pdfNote = pdfN, res = last = compute(p.txs, { method, picks }), T = res.totals, M = { FIFO: 'FIFO', HIFO: 'HIFO', MANUAL: 'manual choice' }[method];
      const hasW = res.rows.some(r => r.wallet), tvN = res.notes.filter(n => !n.ok);
      const trs = res.rows.map(r => `<tr class="${r.status === 'ok' ? '' : 'tv'}"><td>${esc(r.desc)}</td>${hasW ? `<td>${esc(r.wallet || '?')}</td>` : ''}<td>${mdy(r.acquired)}</td><td>${mdy(r.sold)}</td><td>${usd(r.proceeds)}</td><td>${usd(r.cost)}</td><td>${usd(r.gain)}</td><td>${r.term || '?'}</td></tr>`).join('');
      out.innerHTML = pdfNote + `<div class="note total-global"><b>${T.sales} sale${T.sales > 1 ? 's' : ''}</b> (${T.rows} line${T.rows > 1 ? 's' : ''}, ${M})<br>Short term: <b>${usd(T.short.gain)}</b> · Long term: <b>${usd(T.long.gain)}</b><br>Total gain or loss: <b>${usd(T.gain)}</b></div>`
        + (T.toVerify ? `<p class="warn">${T.toVerify} line${T.toVerify > 1 ? 's' : ''} to verify (missing cost or value), not included in the totals.</p>` : '')
        + (T.income.count ? `<p class="hint">${T.income.count} reward/income line${T.income.count > 1 ? 's' : ''} (${usd(T.income.usd)}) added as lots at their USD value; income itself is not computed here (to verify).</p>` : '')
        + (T.wallets.length > 1 ? `<p class="hint">${T.wallets.length} wallets (lots tracked in each wallet): ${esc(T.wallets.join(', '))}.</p>` : '')
        + (T.transfers.paired ? `<p class="hint">${T.transfers.paired} transfer${T.transfers.paired > 1 ? 's' : ''} between your own wallets: not taxable, original dates and cost kept.</p>` : '')
        + (tvN.length ? `<div class="warn"><p>${tvN.length} item${tvN.length > 1 ? 's' : ''} to verify:</p><ul>${tvN.slice(0, 20).map(n => '<li>' + esc(n.msg) + '</li>').join('')}</ul></div>` : '')
        + (p.skipped.length ? `<p class="hint">${p.skipped.length} line${p.skipped.length > 1 ? 's' : ''} skipped: ${esc(p.skipped.slice(0, 5).map(s => 'line ' + s.line + ' (' + s.why + ')').join(', '))}.</p>` : '')
        + `<div class="grid"><label>Lot method <select id="usmethod"><option value="FIFO"${method === 'FIFO' ? ' selected' : ''}>FIFO (first in, first out)</option><option value="HIFO"${method === 'HIFO' ? ' selected' : ''}>HIFO (highest cost first)</option><option value="MANUAL"${method === 'MANUAL' ? ' selected' : ''}>Manual choice per sale</option></select></label></div>`
        + (method !== 'FIFO' ? '<p class="hint">Specific identification requires adequate records at the time of sale — to verify.</p>' : '')
        + (method === 'MANUAL' ? manualHtml(res) : '')
        + `<div class="scroll"><table class="us8949"><tr><th>(a) Description</th>${hasW ? '<th>Wallet</th>' : ''}<th>(b) Acquired</th><th>(c) Sold</th><th>(d) Proceeds</th><th>(e) Cost</th><th>(h) Gain/loss</th><th>Term</th></tr>${trs}</table></div>`
        + `<p><button type="button" id="uscsv" class="small">Download CSV (Form 8949 lines)</button></p>`;
    }
    out.addEventListener('click', e => {
      if (e.target.id !== 'uscsv' || !last) return;
      const a = doc.createElement('a'); a.href = URL.createObjectURL(new Blob([toCSV(last)], { type: 'text/csv' })); a.download = 'kryptax-form8949-lines.csv'; doc.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    });
  }
  if (typeof module !== 'undefined') module.exports = api;
  else { root.KryptaxUS = api; if (root.document) { if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', () => mount(root.document)); else mount(root.document); } }
})(this);
