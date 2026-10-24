/* Export complet (PDF via jsPDF embarqué, tableur xlsx/CSV) : toutes les cessions, synthèse, échanges exclus, soldes.
   exportData() est pur (testé dans test.js) ; makePdf/makeXlsx/makeCsv utilisent les bibliothèques locales. */
(function (root) {
  const f2 = v => v == null || !isFinite(v) ? '' : (+v).toFixed(2);
  const d = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'medium' });
  const ascii = s => String(s).replace(/→/g, '->').replace(/≈/g, '~').replace(/’/g, "'").replace(/[^\x00-\xff€]/g, '');
  const LINES = ['l212', 'l213', 'l214', 'l215', 'l216', 'l217', 'l218', 'l220', 'l221', 'l222', 'l223', 'l224'];
  /* years: E.byYear(res) ; sums: {année: summary} ; summaryRows(S) -> [section, libellé, texte, nombre] ; txs pour les échanges */
  function exportData(years, sums, summaryRows, txs) {
    const out = { summary: [], cessions: [], swaps: [] };
    for (const y of Object.values(years).sort((a, b) => a.year - b.year)) {
      if (sums[y.year]) for (const r of summaryRows(sums[y.year])) out.summary.push([y.year, r[0], r[1], r[3] == null ? '' : +(+r[3]).toFixed(2), r[2]]);
      y.cessions.forEach((c, i) => out.cessions.push([y.year, i + 1, d(c.date), c.asset, +c.qty.toPrecision(10), ...LINES.map(k => c[k] == null ? 'À RENSEIGNER' : +c[k].toFixed(2)), c.status]));
    }
    const byId = {}; (txs || []).forEach(t => byId[t.id] = t);
    for (const t of (txs || []).filter(t => t.type === 'EXCH_OUT' && t.swapAuto).sort((a, b) => a.date - b.date)) {
      const b = byId[t.swapWith]; out.swaps.push([d(t.date), t.asset, +(+t.qty).toPrecision(10), b ? b.asset : '', b ? +(+b.qty).toPrecision(10) : '', f2(t.eur)]);
    }
    return out;
  }
  const HEAD = { summary: ['Année', 'Section', 'Libellé', 'Valeur €', 'Affiché'], cessions: ['Année', 'N°', 'Date (Paris)', 'Actif', 'Quantité', '212 Valeur portefeuille', '213 Prix de cession', '214 Frais', '215', '216 Soulte', '217', '218 Prix net', '220 Prix acquisition total', '221 Fractions déjà cédées', '222', '223', '224 Plus/moins-value', 'Statut'], swaps: ['Date', 'Vendu', 'Qté vendue', 'Reçu', 'Qté reçue', 'Valeur €'] };
  function makeCsv(x) {
    const q = v => { const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const blk = (t, k) => [t, HEAD[k].join(';'), ...x[k].map(r => r.map(q).join(';')), ''];
    return '\ufeff' + [].concat(blk('SYNTHESE', 'summary'), blk('CESSIONS (2086)', 'cessions'), blk('ECHANGES CRYPTO-CRYPTO EXCLUS', 'swaps')).join('\n');
  }
  function makeXlsx(XLSX, x) {
    const wb = XLSX.utils.book_new();
    for (const [k, n] of [['summary', 'Synthèse'], ['cessions', 'Cessions 2086'], ['swaps', 'Échanges exclus']]) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEAD[k], ...x[k]]), n);
    return wb;
  }
  function makePdf(jsPDF, x, title) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }), A = r => r.map(v => ascii(v));
    doc.setFontSize(14); doc.text(ascii(title || 'Kryptax - formulaire 2086'), 10, 12); doc.setFontSize(8);
    doc.text('Outil d\'aide au calcul, pas un conseil fiscal. Valeurs en euros ; ~ = cours estimé.', 10, 17);
    const opt = { styles: { fontSize: 7, cellPadding: 1.2, overflow: 'linebreak' }, headStyles: { fillColor: [20, 40, 70] }, margin: { left: 8, right: 8 } };
    doc.autoTable(Object.assign({ startY: 21, head: [['Année', 'Section', 'Libellé', 'Valeur']], body: x.summary.map(r => A([r[0], r[1], r[2], r[4]])) }, opt));
    doc.addPage(); doc.setFontSize(11); doc.text('Cessions - lignes du formulaire 2086 (' + x.cessions.length + ')', 10, 12);
    doc.autoTable(Object.assign({ startY: 16, head: [A(HEAD.cessions)], body: x.cessions.map(A) }, opt, { styles: { fontSize: 6, cellPadding: 0.8 } }));
    doc.addPage(); doc.setFontSize(11); doc.text('Échanges crypto->crypto exclus (non imposables) : ' + x.swaps.length, 10, 12);
    if (x.swaps.length) doc.autoTable(Object.assign({ startY: 16, head: [A(HEAD.swaps)], body: x.swaps.map(A) }, opt));
    const n = doc.getNumberOfPages(); for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7); doc.text('Page ' + i + ' / ' + n, 280, 205, { align: 'right' }); }
    return doc;
  }
  const api = { exportData, makeCsv, makeXlsx, makePdf, HEAD };
  if (typeof module !== 'undefined') module.exports = api; else root.KryptaxExport = api;
})(this);
