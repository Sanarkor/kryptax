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
        const out = [['Date', 'Type', 'Asset', 'Quantity', 'Total (USD)', 'Fee (USD)']], skipped = [];
        rows.slice(i + 1).forEach((r, j) => {
          const line = i + j + 2, g = k => r[ix(k)], a = krakenPair(g('pair')), mg = ix('margin') > -1 ? num(g('margin')) : 0;
          if (!r.some(x => String(x).trim() !== '')) return;
          if (!a) { skipped.push({ line, why: 'pair not quoted in USD (' + String(g('pair')) + ')' }); out.push(['', '', '', '', '', '']); return; }
          if (mg > 0) { skipped.push({ line, why: 'margin trade (not handled)' }); out.push(['', '', '', '', '', '']); return; }
          out.push([String(g('time') || '').replace(/\.\d+$/, ''), g('type'), a, g('vol'), g('cost'), g('fee')]);
        });
        return { rows: out, skipped, platform: 'Kraken trades export', fileTz: 'UTC' };
      }
    }
    return null;
  }
  function parseRows(rows) {
    const P = platformRows(rows); if (P) { const o = parseRows(P.rows); o.skipped = P.skipped.concat(o.skipped.filter(x => !P.skipped.some(y => y.line === x.line))); o.platform = P.platform; o.fileTz = P.fileTz; return o; }
    const hi = headerIndex(rows), head = rows[hi] || [], m = mapHeader(head), out = { txs: [], skipped: [], missingCols: ['date', 'type', 'asset', 'qty'].filter(k => m[k] == null) };
    if (out.missingCols.length) return out;
    rows.slice(hi + 1).forEach((r, i) => {
      const g = k => m[k] == null ? '' : r[m[k]];
      const line = hi + i + 2, type = kind(g('type')), date = usDate(g('date'));
      const asset = String(g('asset') || '').trim().toUpperCase(), qty = num(g('qty'));
      if (!type || !isFinite(date) || !asset || !(qty > 0)) { if (r.some(x => String(x).trim() !== '')) out.skipped.push({ line, why: !type ? 'unknown type' : !isFinite(date) ? 'unreadable date' : 'missing asset or quantity' }); return; }
      const price = num(g('price')), total0 = num(g('total')), fee = num(g('fee'));
      const total = isFinite(total0) ? total0 : isFinite(price) ? price * qty : NaN;
      out.txs.push({ line, date, type, rawType: String(g('type') || ''), asset, qty, usd: total, fee: isFinite(fee) ? fee : 0, toAsset: String(g('toAsset') || '').trim().toUpperCase(), toQty: num(g('toQty')), wallet: String(g('wallet') || '').trim(), toWallet: String(g('toWallet') || '').trim() });
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
  /* Time zones (v1.8): file times are wall-clock times in the file's zone; tax dates are calendar days in the taxpayer's zone (this browser). No network: Intl only. */
  const US_TZ = [['America/New_York', 'Eastern'], ['America/Chicago', 'Central'], ['America/Denver', 'Mountain'], ['America/Los_Angeles', 'Pacific'], ['America/Anchorage', 'Alaska'], ['Pacific/Honolulu', 'Hawaii'], ['UTC', 'UTC']];
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
  function compute(txs, opts) {
    opts = opts || {};
    if (opts.fileTz || opts.taxTz) txs = txs.map(t => Object.assign({}, t, { date: shiftTz(t.date, opts.fileTz || 'UTC', opts.taxTz || 'UTC') }));
    const manualCost = opts.manualCost || {}, method = opts.method === 'HIFO' ? 'HIFO' : opts.method === 'MANUAL' ? 'MANUAL' : 'FIFO', picks = opts.picks || {}, sales = [];
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
    const incomeRows = income.map(t => ({ line: t.line, date: t.date, asset: t.asset, qty: t.qty, usd: isFinite(t.usd) ? r2(t.usd) : null, type: incomeType(t.rawType), wallet: t.wallet || '',
      status: isFinite(t.usd) ? 'ok' : 'to verify: USD value when received is missing (not in the total)' }));
    if (opts.fileTz || opts.taxTz) totals.tz = { file: opts.fileTz || 'UTC', tax: opts.taxTz || 'UTC' };
    totals.transfers = transfers; totals.method = method; wallets.delete(''); totals.wallets = [...wallets];
    return { rows, totals, notes, sales, income: incomeRows };
  }
  /* Tax year view: sales by the year of the sale date, income by the year received (UTC dates, like mdy; your local date may differ — to verify). */
  function years(res) { return [...new Set(res.rows.map(r => new Date(r.sold).getUTCFullYear()).concat(res.income.map(r => new Date(r.date).getUTCFullYear())))].filter(isFinite).sort(); }
  function forYear(res, y) {
    if (!y) return res;
    const inY = t => t != null && new Date(t).getUTCFullYear() === y, rows = res.rows.filter(r => inY(r.sold)), income = res.income.filter(r => inY(r.date));
    const ok = rows.filter(r => r.status === 'ok'), sum = (L, k) => r2(L.reduce((a, r) => a + r[k], 0)), S = ok.filter(r => r.term === 'short'), Lg = ok.filter(r => r.term === 'long');
    const totals = Object.assign({}, res.totals, { year: y, sales: new Set(rows.map(r => r.line)).size, rows: rows.length, toVerify: rows.length - ok.length,
      short: { proceeds: sum(S, 'proceeds'), cost: sum(S, 'cost'), gain: sum(S, 'gain') }, long: { proceeds: sum(Lg, 'proceeds'), cost: sum(Lg, 'cost'), gain: sum(Lg, 'gain') },
      income: { count: income.length, usd: r2(income.reduce((a, r) => a + (r.usd == null ? 0 : r.usd), 0)), unknown: income.filter(r => r.usd == null).length } });
    totals.gain = r2(totals.short.gain + totals.long.gain);
    const lines = new Set(rows.map(r => r.line));
    return Object.assign({}, res, { rows, income, totals, sales: res.sales.filter(x => lines.has(x.line)) });
  }
  const mdy = t => { if (t == null) return 'unknown'; const d = new Date(t); return String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + String(d.getUTCDate()).padStart(2, '0') + '/' + d.getUTCFullYear(); };
  const usd = v => v == null ? 'to verify' : (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  /* CSV of 8949-style lines (columns a, b, c, d, e, h + term/box hint + status) */
  /* v2.2 Form 8949 layout (IRS Instructions for Form 8949, 2025; Schedule D (Form 1040) 2025). Digital assets use boxes G/H/I (Part I, short term)
     and J/K/L (Part II, long term), never A-F. G/J: Form 1099-DA with basis reported to the IRS; H/K: Form 1099-DA without basis or basis not
     reported; I/L: no Form 1099-DA. Totals go to Schedule D lines 1b/2/3 (Part I) and 8b/9/10 (Part II). Columns (f) and (g) are left blank. */
  const CAT = { basis: ['G', 'J'], nobasis: ['H', 'K'], none: ['I', 'L'] }, SCHD = { G: '1b', H: '2', I: '3', J: '8b', K: '9', L: '10' };
  function form8949(res, cat) {
    const bx = CAT[cat] || null, ok = res.rows.filter(r => r.status === 'ok' && r.term);
    const part = (term, i) => {
      const box = bx ? bx[i] : null, lines = ok.filter(r => r.term === term), sum = k => r2(lines.reduce((t, r) => t + (r[k] || 0), 0));
      return { part: i ? 'II' : 'I', title: i ? 'Part II - Long-term (held more than 1 year)' : 'Part I - Short-term (held 1 year or less)', box,
        boxText: box || (i ? 'J, K or L - to verify' : 'G, H or I - to verify'), scheduleD: box ? 'Schedule D line ' + SCHD[box] : (i ? 'Schedule D line 8b, 9 or 10 - to verify' : 'Schedule D line 1b, 2 or 3 - to verify'),
        lines, totals: { d: sum('proceeds'), e: sum('cost'), g: null, h: sum('gain') } };
    };
    return { cat: bx ? cat : null, parts: [part('short', 0), part('long', 1)], toVerify: res.rows.filter(r => r.status !== 'ok' || !r.term) };
  }
  const CATNOTE = { basis: 'Form 1099-DA received, basis reported to the IRS', nobasis: 'Form 1099-DA received, basis not shown or not reported to the IRS', none: 'No Form 1099-DA received' };
  function toCSV(res, opts) {
    opts = opts || {};
    const q = v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v), m = v => v == null ? '' : v.toFixed(2);
    const F = form8949(res, opts.cat), hasW = res.rows.some(r => r.wallet), out = [];
    const head = ['(a) Description of property', '(b) Date acquired', '(c) Date sold or disposed of', '(d) Proceeds (sales price)', '(e) Cost or other basis', '(f) Code(s)', '(g) Amount of adjustment', '(h) Gain or (loss)'].concat(hasW ? ['Wallet'] : []).concat(['Note']);
    out.push(['# Form 8949 - digital assets - estimate, to verify. Situation: ' + (CATNOTE[F.cat] || 'not chosen - to verify')]);
    if (res.totals.tz) out.push(['# Times in file: ' + res.totals.tz.file + '; tax dates: ' + res.totals.tz.tax + ' (to verify)']);
    if (F.cat && F.cat !== 'none') out.push(['# With a Form 1099-DA: column (d) and (e) should show the amounts on the form; any correction goes in (f) and (g) - to verify']);
    for (const P of F.parts) {
      out.push([]); out.push([P.title + ' - Box ' + P.boxText]); out.push(head);
      for (const r of P.lines) out.push([r.desc, mdy(r.acquired), mdy(r.sold), m(r.proceeds), m(r.cost), '', '', m(r.gain)].concat(hasW ? [r.wallet || ''] : []).concat([r.user ? 'cost and date acquired entered by you (to verify)' : '']));
      out.push(['Totals (' + P.scheduleD + ')', '', '', m(P.totals.d), m(P.totals.e), '', '', m(P.totals.h)]);
    }
    if (F.toVerify.length) {
      out.push([]); out.push(['Not on Form 8949 - to verify (missing cost or value; not in the totals)']); out.push(head);
      for (const r of F.toVerify) out.push([r.desc, mdy(r.acquired), mdy(r.sold), m(r.proceeds), m(r.cost), '', '', m(r.gain)].concat(hasW ? [r.wallet || ''] : []).concat([r.status]));
    }
    const K = carryLines(res, opts.carry);
    if (K) { out.push([]); out.push(['Capital loss carryover (amounts you entered) - to verify']); out.push(['Item', 'Amount']);
      out.push(['Schedule D line 6 - short-term carryover', m(-K.s)]); out.push(['Net short-term, this file + carryover (Schedule D line 7 if no other items)', m(K.net7)]);
      out.push(['Schedule D line 14 - long-term carryover', m(-K.l)]); out.push(['Net long-term, this file + carryover (Schedule D line 15 if no other items)', m(K.net15)]); out.push([K.note]); }
    const D = daLines(res, opts.da);
    if (D) { out.push([]); out.push(['Form 1099-DA comparison (totals you entered) - to verify']); out.push(['Item', 'Form 1099-DA', 'Kryptax', 'Difference', 'Note']);
      for (const l of D.lines) out.push([l.label, m(l.form), m(l.mine), m(l.diff), l.flag ? 'to verify' : 'matches']); out.push([D.note]); }
    return out.map(r => r.map(q).join(',')).join('\n') + '\n';
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
  function daLines(res, d) {
    if (!d || (!isFinite(d.p) && !isFinite(d.b))) return null;
    const o = daCompare(res.totals, d.p, d.b), lines = [];
    if (isFinite(d.p)) lines.push({ label: 'Proceeds (box 1f)', form: d.p, mine: o.proceeds, diff: o.dProceeds, flag: Math.abs(o.dProceeds) >= 0.01 });
    if (isFinite(d.b)) lines.push({ label: 'Cost basis (box 1g)', form: d.b, mine: o.cost, diff: o.dCost, flag: Math.abs(o.dCost) >= 0.01 });
    return { lines, flag: o.flag, note: DANOTE };
  }
  function incomeCSV(res) {
    const q = v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v), hasW = res.income.some(r => r.wallet);
    const head = ['Date received', 'Asset', 'Quantity', 'Value USD (ordinary income - to verify)', 'Type', 'Status'].concat(hasW ? ['Wallet'] : []);
    const L = res.income.map(r => [mdy(r.date), r.asset, +r.qty.toPrecision(12), r.usd == null ? '' : r.usd.toFixed(2), r.type, r.status].concat(hasW ? [r.wallet] : []));
    return [head].concat(L).map(r => r.map(q).join(',')).join('\n') + '\n';
  }
  function fromCSVText(input) { const rows = Array.from(KF.parseCSV(input)); return parseRows(rows); }
  const api = { US_TZ, tzOffset, shiftTz, years, forYear, pairTransfers, mapHeader, kind, headerIndex, parseRows, fromCSVText, fromWorkbook, fromPdfLines, compute, isLong, toCSV, incomeCSV, incomeType, mdy, usd, daCompare, form8949, CATNOTE, daLines, carryLines };

  /* ---------- U.S.A. page (browser only) ---------- */
  function mount(doc) {
    const box = doc.getElementById('usmode'); if (!box || box.dataset.ready) return; box.dataset.ready = '1';
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const inp = doc.getElementById('usfile'), out = doc.getElementById('usresult'); if (!inp || !out) return;
    const W0 = typeof window !== 'undefined' ? window : root;
    let last = null, cur = null, pdfN = '', method = 'FIFO', picks = {}, year = null, mcost = {}, da = {}, cat = '', carry = {};
    let taxTz = 'UTC'; try { taxTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (x) {}
    let fileTz = taxTz; const tzSel = doc.getElementById('ustz');
    if (tzSel) { const L = US_TZ.some(z => z[0] === taxTz) ? US_TZ : [[taxTz, 'This browser']].concat(US_TZ);
      tzSel.innerHTML = L.map(z => `<option value="${esc(z[0])}"${z[0] === fileTz ? ' selected' : ''}>${esc(z[1] === 'UTC' ? 'UTC' : z[1] + ' (' + z[0] + ')')}</option>`).join('');
      tzSel.addEventListener('change', () => { fileTz = tzSel.value; if (cur) render(); }); }
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
      if (t.id === 'uscat') { cat = t.value; render(); return; }
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
      if (!w.confirm('Reset everything? The imported file and the results on this page will be cleared.')) return; cur = last = null; picks = {}; mcost = {}; da = {}; year = null; method = 'FIFO'; pdfN = ''; inp.value = ''; out.innerHTML = ''; }); }
    const zone = doc.getElementById('usimp'); let depth = 0; // drag & drop: same path as « Choose a file »
    if (zone) { const off = () => { depth = 0; zone.classList.remove('dropover'); }, has = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
      zone.addEventListener('dragenter', e => { if (has(e)) { depth++; zone.classList.add('dropover'); } });
      zone.addEventListener('dragover', e => { if (has(e)) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; } });
      zone.addEventListener('dragleave', () => { if (--depth <= 0) off(); });
      zone.addEventListener('drop', e => { off(); if (!has(e)) return; e.preventDefault(); e.stopPropagation(); try { inp.files = e.dataTransfer.files; inp.dispatchEvent(new Event('change')); } catch (x) {} }); }
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
      cur = p; pdfN = pdfNote; picks = {}; year = null; mcost = {}; da = {}; carry = {}; if (p.fileTz && tzSel) { fileTz = p.fileTz; tzSel.value = p.fileTz; } render();
    });
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
    const daNow = () => ({ p: da[(year || 'all') + 'p'], b: da[(year || 'all') + 'b'] });
    function catSel() {
      const F = form8949(last, cat), o = (v, l) => `<option value="${v}"${cat === v ? ' selected' : ''}>${l}</option>`;
      return `<div class="grid uscat"><label>Form 8949 box (from your Form 1099-DA) <select id="uscat">${o('', 'Not chosen — to verify')}${o('none', 'No Form 1099-DA → box I / L')}${o('nobasis', 'Form 1099-DA, basis not reported to the IRS → box H / K')}${o('basis', 'Form 1099-DA, basis reported to the IRS → box G / J')}</select></label></div>`
        + `<p class="hint">Part I (short term): box ${esc(F.parts[0].boxText)}, totals to ${esc(F.parts[0].scheduleD)}. Part II (long term): box ${esc(F.parts[1].boxText)}, totals to ${esc(F.parts[1].scheduleD)}. If only some sales are on a Form 1099-DA, each kind needs its own Part — to verify.</p>`;
    }
    function render() {
      const p = cur, pdfNote = pdfN, full = compute(p.txs, { method, picks, fileTz, taxTz, manualCost: mcost }), Ys = years(full); if (year == null) year = Ys.length ? Ys[Ys.length - 1] : 0;
      const res = last = forYear(full, year), T = res.totals, M = { FIFO: 'FIFO', HIFO: 'HIFO', MANUAL: 'manual choice' }[method];
      const hasW = res.rows.some(r => r.wallet), tvN = res.notes.filter(n => !n.ok);
      const trs = res.rows.map(r => `<tr class="${r.status === 'ok' ? (r.user ? 'ususer' : '') : 'tv'}"><td>${esc(r.desc)}${r.user ? ' <span class="hint">(cost entered by you)</span>' : ''}</td>${hasW ? `<td>${esc(r.wallet || '?')}</td>` : ''}<td>${mdy(r.acquired)}</td><td>${mdy(r.sold)}</td><td>${usd(r.proceeds)}</td><td>${usd(r.cost)}</td><td>${usd(r.gain)}</td><td>${r.term || '?'}</td></tr>`).join('');
      const sel = Ys.length > 1 ? `<div class="grid"><label>Tax year <select id="usyear">${Ys.map(y => `<option value="${y}"${y === year ? ' selected' : ''}>${y}</option>`).join('')}<option value="0"${!year ? ' selected' : ''}>All years</option></select></label></div>` : '';
      const exp = `<p class="usexp"><button type="button" id="uspdfmain" class="btn"${W0.KryptaxUSExport && W0.jspdf ? '' : ' hidden'}>Download PDF summary</button> <button type="button" id="uscsvmain" class="btn ghost">Download CSV (Form 8949 lines)</button></p>`;
      out.innerHTML = pdfNote + `<h2 class="usreshead">2. Result${year ? ' ' + year : ' (all years)'}</h2>` + sel + `<div class="note total-global" role="status"><b>${T.sales} sale${T.sales === 1 ? '' : 's'}</b> (${T.rows} line${T.rows === 1 ? '' : 's'}, ${M})<br>Short term: <b>${usd(T.short.gain)}</b> · Long term: <b>${usd(T.long.gain)}</b><br>Total gain or loss: <b>${usd(T.gain)}</b>${T.sales ? '' : '<br>No sale in this year.'}<br><span class="hint">Times in file: ${esc(fileTz)} · tax dates: ${esc(taxTz)} (to verify). Estimate, to verify — no tax computed.</span></div>` + (T.sales ? exp : '')
        + (T.toVerify ? `<p class="warn">${T.toVerify} line${T.toVerify > 1 ? 's' : ''} to verify (missing cost or value), not included in the totals.</p>` : '')
        + (T.income.count ? `<div class="note"><b>Income (staking / airdrops / interest): ${usd(T.income.usd)}</b> (${T.income.count - T.income.unknown} of ${T.income.count} line${T.income.count > 1 ? 's' : ''})<br>Ordinary income, to verify — not tax advice; no tax rates applied. Each amount is also the cost basis of the new lot.</div>`
          + (T.income.unknown ? `<p class="warn">${T.income.unknown} income line${T.income.unknown > 1 ? 's' : ''} without a USD value: to verify, not included in the income total.</p>` : '')
          + `<div class="scroll"><table class="us8949 usincome"><tr><th>Date</th><th>Asset</th><th>Quantity</th><th>Value USD</th><th>Type</th></tr>${res.income.map(r => `<tr class="${r.status === 'ok' ? '' : 'tv'}"><td>${mdy(r.date)}</td><td>${esc(r.asset)}</td><td>${+r.qty.toPrecision(10)}</td><td>${r.usd == null ? 'to verify' : usd(r.usd)}</td><td>${r.type}</td></tr>`).join('')}</table></div>`
          + `<p><button type="button" id="usinccsv" class="small">Download CSV (income)</button></p>` : '')
        + (T.wallets.length > 1 ? `<p class="hint">${T.wallets.length} wallets (lots tracked in each wallet): ${esc(T.wallets.join(', '))}.</p>` : '')
        + (T.transfers.paired ? `<p class="hint">${T.transfers.paired} transfer${T.transfers.paired > 1 ? 's' : ''} between your own wallets: not taxable, original dates and cost kept.</p>` : '')
        + (tvN.length ? `<div class="warn"><p>${tvN.length} item${tvN.length > 1 ? 's' : ''} to verify:</p><ul>${tvN.slice(0, 20).map(n => '<li>' + esc(n.msg) + '</li>').join('')}</ul></div>` : '')
        + (()=>{ const M = full.rows.filter(r => r.status.startsWith('to verify: no purchase found') || r.user); if (!M.length) return '';
          const iso = v => { if (v == null) return ''; const d = new Date(v); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); };
          return `<details class="note usmiss"${M.some(r => !r.user) ? ' open' : ''}><summary>Missing purchases: enter the cost (optional)</summary><p class="hint">Units sold with no purchase in your file are left out of the totals. If you know them, enter the total cost in USD and the date acquired; the line is then included and marked “entered by you” (to verify).</p>`
            + M.map(r => { const mc = mcost[r.line] || {}; return `<div class="grid"><p><b>Sale line ${r.line}</b>: ${esc(r.desc)} sold ${mdy(r.sold)}${r.wallet ? ' (' + esc(r.wallet) + ')' : ''}</p><label>Total cost (USD)<input class="usmc" data-line="${r.line}" inputmode="decimal" value="${mc.cost != null ? esc(String(mc.cost)) : ''}" placeholder="e.g. 250.00"></label><label>Date acquired<input type="date" class="usmd" data-line="${r.line}" value="${esc(iso(mc.date))}" max="${iso(r.sold)}"></label></div>`; }).join('') + '</details>'; })()
        + daBlock(T, year)
        + carryBlock(res)
        + (p.platform ? `<p class="hint" id="usplatform">Format recognised: ${esc(p.platform)}${p.fileTz ? ' (times in ' + esc(p.fileTz) + ')' : ''}. Only USD-quoted, non-margin trades are read — to verify.</p>` : '')
        + (p.skipped.length ? `<p class="hint">${p.skipped.length} line${p.skipped.length > 1 ? 's' : ''} skipped: ${esc(p.skipped.slice(0, 5).map(s => 'line ' + s.line + ' (' + s.why + ')').join(', '))}.</p>` : '')
        + `<div class="grid"><label>Lot method <select id="usmethod"><option value="FIFO"${method === 'FIFO' ? ' selected' : ''}>FIFO (first in, first out)</option><option value="HIFO"${method === 'HIFO' ? ' selected' : ''}>HIFO (highest cost first)</option><option value="MANUAL"${method === 'MANUAL' ? ' selected' : ''}>Manual choice per sale</option></select></label></div>`
        + (method !== 'FIFO' ? '<p class="hint">Specific identification requires adequate records at the time of sale — to verify.</p>' : '')
        + (method === 'MANUAL' ? manualHtml(res) : '')
        + catSel()
        + `<div class="scroll"><table class="us8949"><tr><th>(a) Description</th>${hasW ? '<th>Wallet</th>' : ''}<th>(b) Acquired</th><th>(c) Sold</th><th>(d) Proceeds</th><th>(e) Cost</th><th>(h) Gain/loss</th><th>Term</th></tr>${trs}</table></div>`
        + `<p><button type="button" id="uscsv" class="small">Download CSV (Form 8949 lines)</button>${W0.KryptaxUSExport && W0.jspdf ? ' <button type="button" id="uspdf" class="small">Download PDF</button>' : ''}</p>`;
    }
    out.addEventListener('click', e => {
      if (e.target.id === 'uspdfmain' || e.target.id === 'uscsvmain') { const b = out.querySelector('#' + e.target.id.replace('main', '')); if (b) b.click(); return; }
      if (last && e.target.id === 'uspdf' && W0.KryptaxUSExport && W0.jspdf) { W0.KryptaxUSExport.download(W0.jspdf.jsPDF, last, doc, { cat, da: daNow(), carry: clNow() }); return; }
      if (!last || (e.target.id !== 'uscsv' && e.target.id !== 'usinccsv')) return;
      const inc = e.target.id === 'usinccsv', a = doc.createElement('a'); a.href = URL.createObjectURL(new Blob([inc ? incomeCSV(last) : toCSV(last, { cat, da: daNow(), carry: clNow() })], { type: 'text/csv' })); a.download = inc ? 'kryptax-income.csv' : 'kryptax-form8949-lines.csv'; doc.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    });
  }
  if (typeof module !== 'undefined') module.exports = api;
  else { root.KryptaxUS = api; if (root.document) { if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', () => mount(root.document)); else mount(root.document); } }
})(this);
