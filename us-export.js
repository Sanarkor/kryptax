/* Kryptax U.S.A. — PDF summary (estimate). Uses the jsPDF + autoTable libraries already shipped (jspdf.umd.min.js,
   jspdf.plugin.autotable.min.js); independent from export.js. No tax rule here: it only lays out the result of us-engine.js.
   Box letters (G/H/I short term, J/K/L long term; I or L without a Form 1099-DA) come from the Instructions for Form 8949 (2025),
   https://www.irs.gov/instructions/i8949 — shown only as an indication, to verify (Form 1099-DA not read). */
(function (root) {
  'use strict';
  const FOOT = 'Estimate - not tax advice - to be verified - state taxes not included';
  const BOXNOTE = 'Form 8949 box: indication only, to verify (Form 1099-DA not read). Short term: G/H/I, long term: J/K/L; without a 1099-DA usually I (short) or L (long).';
  const ascii = s => String(s == null ? '' : s).replace(/[\u2013\u2014]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\u2192/g, '->').replace(/[^\x20-\x7e]/g, '?');
  const pad = n => String(n).padStart(2, '0');
  const mdy = t => { if (t == null) return 'unknown'; const d = new Date(t); return isNaN(d) ? 'unknown' : pad(d.getUTCMonth() + 1) + '/' + pad(d.getUTCDate()) + '/' + d.getUTCFullYear(); };
  const usd = v => v == null || !isFinite(v) ? 'to verify' : (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const METHOD = { FIFO: 'FIFO (first in, first out)', HIFO: 'HIFO (highest cost first)', MANUAL: 'Manual choice per sale (specific identification - adequate records at the time of sale, to verify)' };

  /* Pure: everything printed in the PDF (tested in testus.js). */
  function summaryData(res, opts) {
    opts = opts || {}; const T = res.totals, now = opts.now || new Date(), hasW = res.rows.some(r => r.wallet);
    const head = ['(a) Description', '(b) Acquired', '(c) Sold', '(d) Proceeds', '(e) Cost', '(h) Gain/loss', 'Term'].concat(hasW ? ['Wallet'] : []).concat(['Box*']);
    const rows = res.rows.map(r => {
      const tv = r.status !== 'ok';
      return { tv, cells: [r.desc + (tv ? ' - TO VERIFY: ' + r.status.replace(/^to verify:\s*/, '') : ''), mdy(r.acquired), mdy(r.sold), usd(r.proceeds), usd(r.cost), usd(r.gain),
        r.term === 'long' ? 'Long' : r.term === 'short' ? 'Short' : '?'].concat(hasW ? [r.wallet || '?'] : []).concat([r.term === 'long' ? 'L?' : r.term === 'short' ? 'I?' : '?']).map(ascii) };
    });
    const info = [
      'Generated: ' + now.getUTCFullYear() + '-' + pad(now.getUTCMonth() + 1) + '-' + pad(now.getUTCDate()) + ' ' + pad(now.getUTCHours()) + ':' + pad(now.getUTCMinutes()) + ' UTC',
      'Lot method: ' + (METHOD[T.method] || METHOD.FIFO),
      'Wallets: ' + (T.wallets && T.wallets.length ? T.wallets.join(', ') : 'one (no wallet column)'),
      'Sales: ' + T.sales + ' (' + T.rows + ' lines' + (T.toVerify ? ', ' + T.toVerify + ' to verify, not in the totals' : '') + ')',
      'Short term: proceeds ' + usd(T.short.proceeds) + ', cost ' + usd(T.short.cost) + ', gain/loss ' + usd(T.short.gain),
      'Long term: proceeds ' + usd(T.long.proceeds) + ', cost ' + usd(T.long.cost) + ', gain/loss ' + usd(T.long.gain),
      'Total gain or loss: ' + usd(T.gain)
    ];
    if (T.income && T.income.count) info.push('Income (staking / airdrops / interest): ' + usd(T.income.usd) + ' (' + (T.income.count - T.income.unknown) + ' of ' + T.income.count + ' lines' + (T.income.unknown ? '; ' + T.income.unknown + ' without USD value, to verify' : '') + ') - ordinary income, to verify; no tax rates applied');
    return { title: 'Kryptax - U.S. summary (estimate)', info: info.map(ascii), boxNote: ascii(BOXNOTE), foot: FOOT, head, rows };
  }

  function makePdf(jsPDF, res, opts) {
    const D = summaryData(res, opts), doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' }), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 10;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('Kryptax \u2014 U.S. summary (estimate)', M, 16);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); let y = 24;
    for (const l of D.info) { for (const s of doc.splitTextToSize(l, W - 2 * M)) { doc.text(s, M, y); y += 5; } }
    doc.setFontSize(8); doc.setTextColor(90); for (const s of doc.splitTextToSize(D.boxNote, W - 2 * M)) { doc.text(s, M, y); y += 4; } doc.setTextColor(0);
    const hasW = D.head.length === 9, desc = hasW ? 40 : 54;
    const cs = { 0: { cellWidth: desc } }; [3, 4, 5].forEach(i => cs[i] = { halign: 'right' }); if (hasW) cs[7] = { cellWidth: 24 };
    doc.autoTable({ startY: y + 2, head: [D.head], body: D.rows.map(r => r.cells), margin: { left: M, right: M, bottom: 16, top: 12 }, 
      styles: { fontSize: 7, cellPadding: 1, overflow: 'linebreak' }, headStyles: { fillColor: [40, 40, 40] }, columnStyles: cs, rowPageBreak: 'avoid',
      didParseCell: c => { if (c.section === 'body' && D.rows[c.row.index].tv) { c.cell.styles.fillColor = [255, 236, 200]; c.cell.styles.fontStyle = 'bold'; } } });
    const n = doc.internal.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(80); doc.text(D.foot, M, H - 7); doc.text('Page ' + i + ' / ' + n, W - M, H - 7, { align: 'right' }); doc.setTextColor(0); }
    return doc;
  }
  function download(jsPDF, res, doc0) {
    const d = (doc0 || root.document), blob = makePdf(jsPDF, res).output('blob'), a = d.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'kryptax-us-summary.pdf'; d.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const api = { summaryData, makePdf, download, FOOT };
  if (typeof module !== 'undefined') module.exports = api; else root.KryptaxUSExport = api;
})(this);
