/* Kryptax U.S.A. — PDF summary (estimate). Uses the jsPDF + autoTable libraries already shipped (jspdf.umd.min.js,
   jspdf.plugin.autotable.min.js); independent from export.js. No tax rule here: it only lays out the result of us-engine.js.
   Box letters (G/H/I short term, J/K/L long term; I or L without a Form 1099-DA) come from the Instructions for Form 8949 (2025),
   https://www.irs.gov/instructions/i8949 — shown only as an indication, to verify (Form 1099-DA not read). */
(function (root) {
  'use strict';
  const FOOT = 'Estimate - not tax advice - to be verified - state taxes not included';
  const BOXNOTE = 'Digital assets: Part I uses box G, H or I and Part II box J, K or L (never A-F). G/J: Form 1099-DA with basis reported to the IRS; H/K: Form 1099-DA without basis or basis not reported; I/L: no Form 1099-DA. Columns (f) and (g) left blank. Source: IRS Instructions for Form 8949 (2025). To verify.';
  const eng = () => typeof module !== 'undefined' ? require('./us-engine.js') : root.KryptaxUS;
  const ascii = s => String(s == null ? '' : s).replace(/[\u2013\u2014]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\u2192/g, '->').replace(/[^\x20-\x7e]/g, '?');
  const pad = n => String(n).padStart(2, '0');
  const mdy = t => { if (t == null) return 'unknown'; const d = new Date(t); return isNaN(d) ? 'unknown' : pad(d.getUTCMonth() + 1) + '/' + pad(d.getUTCDate()) + '/' + d.getUTCFullYear(); };
  const usd = v => v == null || !isFinite(v) ? 'to verify' : (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const usd0 = v => v == null ? '' : usd(v);
  const METHOD = { FIFO: 'FIFO (first in, first out)', HIFO: 'HIFO (highest cost first)', MANUAL: 'Manual choice per sale (specific identification - adequate records at the time of sale, to verify)' };

  /* Pure: everything printed in the PDF (tested in testus.js). */
  function summaryData(res, opts) {
    opts = opts || {}; const T = res.totals, now = opts.now || new Date(), hasW = res.rows.some(r => r.wallet);
    const F = eng().form8949(res, opts.cat), head = ['(a) Description', '(b) Acquired', '(c) Sold', '(d) Proceeds', '(e) Cost or basis', '(f) Code', '(g) Adj.', '(h) Gain/(loss)'].concat(hasW ? ['Wallet'] : []);
    const cells = (r, extra) => [r.desc + (extra || ''), mdy(r.acquired), mdy(r.sold), usd(r.proceeds), usd(r.cost), '', '', usd(r.gain)].concat(hasW ? [r.wallet || '?'] : []).map(ascii);
    const parts = F.parts.map(P => ({ title: ascii(P.title + ' - Box ' + P.boxText), head, rows: P.lines.map(r => ({ tv: false, cells: cells(r, r.user ? ' - COST AND DATE ENTERED BY YOU (to verify)' : '') })),
      total: ['Totals (' + P.scheduleD + ')', '', '', usd(P.totals.d), usd(P.totals.e), '', '', usd(P.totals.h)].concat(hasW ? [''] : []).map(ascii) }));
    const tv = F.toVerify.map(r => ({ tv: true, cells: cells(r, ' - TO VERIFY: ' + r.status.replace(/^to verify:\s*/, '')) }));
    const rows = parts.reduce((a, P) => a.concat(P.rows), []).concat(tv);
    const info = [
      'Generated: ' + now.getUTCFullYear() + '-' + pad(now.getUTCMonth() + 1) + '-' + pad(now.getUTCDate()) + ' ' + pad(now.getUTCHours()) + ':' + pad(now.getUTCMinutes()) + ' UTC',
      'Lot method: ' + (METHOD[T.method] || METHOD.FIFO),
      'Network fees on transfers: ' + (eng().FEE_MODES[(T.fees || {}).mode] || eng().FEE_MODES.IGNORE) + ' - tax treatment not settled, to verify',
      'Wallets: ' + (T.wallets && T.wallets.length ? T.wallets.join(', ') : 'one (no wallet column)'),
      'Form 8949 situation: ' + (eng().CATNOTE[F.cat] || 'not chosen - to verify'),
      'Tax year: ' + (T.year || 'all years') + (T.tz ? ' (times in file: ' + T.tz.file + '; tax dates: ' + T.tz.tax + ', to verify)' : ' (sale dates in UTC, to verify)'),
      'Sales: ' + T.sales + ' (' + T.rows + ' lines' + (T.toVerify ? ', ' + T.toVerify + ' to verify, not in the totals' : '') + ')',
      'Short term: proceeds ' + usd(T.short.proceeds) + ', cost ' + usd(T.short.cost) + ', gain/loss ' + usd(T.short.gain),
      'Long term: proceeds ' + usd(T.long.proceeds) + ', cost ' + usd(T.long.cost) + ', gain/loss ' + usd(T.long.gain),
      'Total gain or loss: ' + usd(T.gain)
    ];
    if (T.income && T.income.count) info.push('Income (staking / airdrops / interest): ' + usd(T.income.usd) + ' (' + (T.income.count - T.income.unknown) + ' of ' + T.income.count + ' lines' + (T.income.unknown ? '; ' + T.income.unknown + ' without USD value, to verify' : '') + ') - ordinary income, to verify; no tax rates applied');
    if (T.fees && eng().feeLine(T.fees)) info.push('Network fees: ' + eng().feeLine(T.fees).replace(/ — /g, ' - '));
    { const L21 = eng().scheduleD(res, opts.cat, opts.carry, opts.fstat).lossLimit;
      if (L21) info.push('Filing status (Schedule D line 21): ' + eng().FSTAT[opts.fstat || ''] + '. ' + (L21.h != null ? 'Capital loss allowed ' + usd(L21.h) + (L21.rest > 0 ? ', ' + usd(L21.rest) + ' to carry over' : '') + ' (IRS Topic no. 409) - from this file only, to verify.' : 'Net capital loss: limit not applied - to verify.')); }
    const K = eng().carryLines(res, opts.carry);
    if (K) info.push('Capital loss carryover you entered: short-term ' + usd(-K.s) + ' (Schedule D line 6), long-term ' + usd(-K.l) + ' (line 14). Net with this file: short-term ' + usd(K.net7) + ', long-term ' + usd(K.net15) + '. ' + K.note);
    const DA = eng().daLines(res, opts.da);
    if (DA) { for (const l of DA.lines) info.push('Form 1099-DA ' + l.label + ': ' + usd(l.form) + ' vs Kryptax ' + usd(l.mine) + ' - difference ' + usd(l.diff) + (l.flag ? ' (TO VERIFY)' : ' (matches)')); info.push(DA.note); }
    const checks = eng().checks(res, opts).map(c => ascii(c.msg.replace(/ — /g, ' - ')));
    /* v2.16 "What to copy and where" at the top of page 1: same data as the screen (guide()), nothing new computed */
    const G = eng().guide(res, opts), copy = [], txt = t => copy.push({ label: ascii(t), d: '', e: '', h: '', text: true });
    if (!G.chosen && T.sales) txt('Form 8949 box not chosen: choose it in Options at the top.');
    for (const P of G.parts) if (P.n) copy.push({ label: ascii('Form 8949 Part ' + P.part + ' (' + P.term + '), box ' + P.boxText + ' -> Schedule D line ' + P.sdLine), d: usd(P.d), e: usd(P.e), h: usd(P.h) });
    if (T.sales) [['7', G.n7], ['15', G.n15], ['16', G.n16]].forEach(([l, v]) => copy.push({ label: 'Schedule D line ' + l, d: '', e: '', h: usd(v) }));
    if (G.loss) { if (G.l21) copy.push({ label: 'Schedule D line 21' + (G.l21.rest > 0 ? ' (' + usd(G.l21.rest) + ' to carry over)' : ''), d: '', e: '', h: usd(G.l21.h) }); else txt('Schedule D line 21: choose the filing status in Options at the top.'); }
    if (G.income) txt('Staking / airdrop / interest income: ' + usd(G.income.usd) + ' -> report as ordinary income (no tax computed; where to report: to verify)');
    if (!copy.length) txt('No sale or income in this year: nothing to copy.');
    return { title: 'Kryptax - U.S. summary (estimate)', copyTitle: 'What to copy and where' + (T.year ? ' (' + T.year + ')' : ''), copy, copyNote: 'Only the sales in this file - to verify.', checks, info: info.map(ascii), boxNote: ascii(BOXNOTE), foot: FOOT, head, rows, parts, tv };
  }

  /* v2.14 amounts to copy (Form 8949 Part totals, Schedule D lines 7, 15, 16, 21) in dark amber #A16207; text stays black */
  const COPY = [161, 98, 7];
  function makePdf(jsPDF, res, opts) {
    const D = summaryData(res, opts), doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' }), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 10;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('Kryptax \u2014 U.S. summary (estimate)', M, 16);
    let y = 22; doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(D.copyTitle, M, y); doc.setFont('helvetica', 'normal');
    doc.autoTable({ startY: y + 2, head: [['', '(d) Proceeds', '(e) Cost', '(h) Gain or (loss)']], body: D.copy.map(r => r.text ? [{ content: r.label, colSpan: 4 }] : [r.label, r.d, r.e, r.h]), margin: { left: M, right: M, bottom: 16, top: 12 },
      styles: { fontSize: 8, cellPadding: 1.2, overflow: 'linebreak' }, headStyles: { fillColor: [40, 40, 40] }, columnStyles: { 1: { halign: 'right', cellWidth: 30 }, 2: { halign: 'right', cellWidth: 30 }, 3: { halign: 'right', cellWidth: 34 } }, tableLineColor: [161, 98, 7], tableLineWidth: 0.4,
      didParseCell: c => { if (c.section === 'head' && c.column.index) c.cell.styles.halign = 'right'; if (c.section === 'body' && c.column.index) { c.cell.styles.textColor = api.COPY; c.cell.styles.fontStyle = 'bold'; } } });
    y = doc.lastAutoTable.finalY + 4; doc.setFontSize(8); doc.setTextColor(90); doc.text(D.copyNote, M, y); doc.setTextColor(0); y += 6;
    if (D.checks.length) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('To verify (' + D.checks.length + ')', M, y); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); y += 5;
      for (const c of D.checks) for (const s of doc.splitTextToSize('- ' + c, W - 2 * M)) { if (y > H - 18) { doc.addPage(); y = 16; } doc.text(s, M, y); y += 4.2; } y += 3; }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); y += 2;
    for (const l of D.info) { for (const s of doc.splitTextToSize(l, W - 2 * M)) { doc.text(s, M, y); y += 5; } }
    doc.setFontSize(8); doc.setTextColor(90); for (const s of doc.splitTextToSize(D.boxNote, W - 2 * M)) { doc.text(s, M, y); y += 4; } doc.setTextColor(0);
    const hasW = D.head.length === 9, cs = { 0: { cellWidth: hasW ? 40 : 52 } }; [3, 4, 7].forEach(i => cs[i] = { halign: 'right' }); [5, 6].forEach(i => cs[i] = { cellWidth: 9 }); if (hasW) cs[8] = { cellWidth: 22 };
    const tbl = (title, body, foot, hl) => {
      if (y > H - 40) { doc.addPage(); y = 16; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(title, M, y + 4); doc.setFont('helvetica', 'normal');
      doc.autoTable({ startY: y + 6, head: [D.head], body, foot: foot ? [foot] : undefined, showFoot: 'lastPage', margin: { left: M, right: M, bottom: 16, top: 12 },
        styles: { fontSize: 7, cellPadding: 1, overflow: 'linebreak' }, headStyles: { fillColor: [40, 40, 40] }, footStyles: { fillColor: [225, 225, 225], textColor: 0 }, columnStyles: cs, rowPageBreak: 'avoid',
        didParseCell: c => { if (c.section !== 'body' && [3, 4, 7].includes(c.column.index)) c.cell.styles.halign = 'right'; // v2.16 head and totals aligned like the amounts
          if (c.section === 'foot' && [3, 4, 7].includes(c.column.index)) c.cell.styles.textColor = api.COPY;
          if (hl && c.section === 'body') { c.cell.styles.fillColor = [255, 236, 200]; c.cell.styles.fontStyle = 'bold'; } } });
      y = doc.lastAutoTable.finalY + 6;
    };
    for (const P of D.parts) tbl(P.title, P.rows.length ? P.rows.map(r => r.cells) : [['No sale in this part'].concat(D.head.slice(1).map(() => ''))], P.total, false);
    if (D.tv.length) tbl('Not on Form 8949 - not in the totals (details)', D.tv.map(r => r.cells), null, true);
    const SD = eng().scheduleD(res, (opts || {}).cat, (opts || {}).carry, (opts || {}).fstat); doc.addPage(); y = 16;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(ascii(SD.title), M, y); doc.setFontSize(10); doc.setTextColor(170, 0, 0); doc.text(ascii(SD.warn), M, y + 6); doc.setTextColor(0); doc.setFont('helvetica', 'normal');
    doc.autoTable({ startY: y + 10, head: [['Line', 'Description', '(d) Proceeds', '(e) Cost', '(g) Adjustments', '(h) Gain or (loss)', 'Note']],
      body: SD.lines.map(l => [l.line, l.desc, l.nc ? '' : usd0(l.d), l.nc ? '' : usd0(l.e), l.nc ? '' : usd0(l.g), l.nc ? '' : (l.answer || usd0(l.h)), l.note].map(ascii)), margin: { left: M, right: M, bottom: 16, top: 12 },
      styles: { fontSize: 7.5, cellPadding: 1.2, overflow: 'linebreak' }, headStyles: { fillColor: [40, 40, 40] }, columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 58 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      didParseCell: c => { if (c.section === 'head' && c.column.index >= 2 && c.column.index <= 5) c.cell.styles.halign = 'right';
        if (c.section === 'body' && ['7', '15', '16', '21'].includes(SD.lines[c.row.index].line) && !SD.lines[c.row.index].nc && c.column.index === 5) c.cell.styles.textColor = api.COPY;
        if (c.section === 'body' && SD.lines[c.row.index].nc) { c.cell.styles.textColor = 150; c.cell.styles.fillColor = [240, 240, 240]; } } });
    const n = doc.internal.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(80); doc.text(D.foot, M, H - 7); doc.text('Page ' + i + ' / ' + n, W - M, H - 7, { align: 'right' }); doc.setTextColor(0); }
    return doc;
  }
  function download(jsPDF, res, doc0, opts) {
    const d = (doc0 || root.document), blob = makePdf(jsPDF, res, opts).output('blob'), a = d.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = eng().stampName('kryptax-us-summary', 'pdf'); d.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const api = { summaryData, makePdf, download, FOOT, COPY };
  if (typeof module !== 'undefined') module.exports = api; else root.KryptaxUSExport = api;
})(this);
