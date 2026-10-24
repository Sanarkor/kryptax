/* Export complet (PDF via jsPDF embarqué, tableur xlsx/CSV) : toutes les cessions, synthèse, échanges exclus, soldes.
   exportData() est pur (testé dans test.js) ; makePdf/makeXlsx/makeCsv utilisent les bibliothèques locales. */
(function (root) {
  const f2 = v => v == null || !isFinite(v) ? '' : (+v).toFixed(2);
  const d = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'medium' });
  const ascii = s => String(s).replace(/→/g, '->').replace(/≈/g, '~').replace(/’/g, "'").replace(/[^\x00-\xff€]/g, '');
  const LINES = ['l212', 'l213', 'l214', 'l215', 'l216', 'l217', 'l218', 'l220', 'l221', 'l222', 'l223', 'l224'];
  /* years: E.byYear(res) ; sums: {année: summary} ; summaryRows(S) -> [section, libellé, texte, nombre] ; txs pour les échanges */
  function exportData(years, sums, summaryRows, txs) {
    const out = { summary: [], cessions: [], swaps: [], totals: [] };
    for (const y of Object.values(years).sort((a, b) => a.year - b.year)) {
      if (sums[y.year]) for (const r of summaryRows(sums[y.year])) out.summary.push([y.year, r[0], r[1], r[3] == null ? '' : +(+r[3]).toFixed(2), r[2]]);
      y.cessions.forEach((c, i) => out.cessions.push([y.year, i + 1, d(c.date), c.asset, +c.qty.toPrecision(10), ...LINES.map(k => c[k] == null ? 'À RENSEIGNER' : +c[k].toFixed(2)), c.status]));
      const sum = k => +y.cessions.reduce((a, c) => a + (c[k] || 0), 0).toFixed(2), net = sum('l224'), l213 = sum('l213');
      out.totals.push({ year: y.year, n: y.cessions.length, l213, l214: sum('l214'), l218: sum('l218'), l224: net, incomplete: y.cessions.some(c => c.l224 == null),
        exonere: l213 <= 305, box: l213 <= 305 ? 'aucune (≤ 305 €)' : net >= 0 ? '3AN' : '3BN', report: l213 <= 305 ? 0 : Math.round(Math.abs(net)) });
    }
    const byId = {}; (txs || []).forEach(t => byId[t.id] = t);
    for (const t of (txs || []).filter(t => t.type === 'EXCH_OUT' && t.swapAuto).sort((a, b) => a.date - b.date)) {
      const b = byId[t.swapWith]; out.swaps.push([d(t.date), t.asset, +(+t.qty).toPrecision(10), b ? b.asset : '', b ? +(+b.qty).toPrecision(10) : '', f2(t.eur)]);
    }
    return out;
  }
  /* Ligne GLOBAL (même colonnes que les cessions) */
  const globalRow = t => [t.year, 'GLOBAL', t.n + ' cessions', '', '', '', t.l213, t.l214, '', '', '', t.l218, '', '', '', '', t.l224, t.incomplete ? 'incomplet' : 'ok'];
  const globalText = t => `${t.year} : total des cessions (213) ${t.l213.toFixed(2)} € ; frais (214) ${t.l214.toFixed(2)} € ; prix nets (218) ${t.l218.toFixed(2)} € ; plus-value nette globale (224) ${t.l224 >= 0 ? '+' : ''}${t.l224.toFixed(2)} €${t.incomplete ? ' (incomplet)' : ''}. ` +
    (t.exonere ? `Total des cessions ≤ 305 € : exonéré, rien à reporter.` : `Total des cessions > 305 € : imposable. À reporter case ${t.box} de la 2042-C : ${t.report} €.`);
  const HEAD = { summary: ['Année', 'Section', 'Libellé', 'Valeur €', 'Affiché'], cessions: ['Année', 'N°', 'Date (Paris)', 'Actif', 'Quantité', '212 Valeur portefeuille', '213 Prix de cession', '214 Frais', '215', '216 Soulte', '217', '218 Prix net', '220 Prix acquisition total', '221 Fractions déjà cédées', '222', '223', '224 Plus/moins-value', 'Statut'], swaps: ['Date', 'Vendu', 'Qté vendue', 'Reçu', 'Qté reçue', 'Valeur €'] };
  function makeCsv(x) {
    const q = v => { const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const blk = (t, k) => [t, HEAD[k].join(';'), ...x[k].map(r => r.map(q).join(';')), ''];
    const ces = blk('CESSIONS (2086)', 'cessions'); ces.pop(); x.totals.forEach(t => ces.push(globalRow(t).map(q).join(';')));
    const glob = ['TOTAL GLOBAL', ...x.totals.map(t => q(globalText(t))), ''];
    return '\ufeff' + [].concat(glob, blk('SYNTHESE', 'summary'), ces, [''], blk('ECHANGES CRYPTO-CRYPTO EXCLUS', 'swaps')).join('\n');
  }
  function makeXlsx(XLSX, x) {
    const wb = XLSX.utils.book_new();
    for (const [k, n] of [['summary', 'Synthèse'], ['cessions', 'Cessions 2086'], ['swaps', 'Échanges exclus']]) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEAD[k], ...x[k], ...(k === 'cessions' ? x.totals.map(globalRow) : [])]), n);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Total global'], ...x.totals.map(t => [globalText(t)])]), 'Global');
    return wb;
  }
  function makePdf(jsPDF, x, title) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }), A = r => r.map(v => ascii(v));
    const opt = { styles: { fontSize: 7, cellPadding: 1.2, overflow: 'linebreak' }, headStyles: { fillColor: [20, 40, 70], fontSize: 6.5 }, margin: { left: 8, right: 8 }, tableWidth: 'auto' };
    const bold = { didParseCell: h => { if (h.section === 'body' && h.row.raw && h.row.raw[1] === 'GLOBAL') { h.cell.styles.fontStyle = 'bold'; h.cell.styles.fillColor = [225, 235, 250]; } } };
    doc.setFontSize(14); doc.text(ascii(title || 'Kryptax - formulaire 2086'), 10, 12); doc.setFontSize(8);
    doc.text('Outil d\'aide au calcul, pas un conseil fiscal. Valeurs en euros ; ~ = cours estimé.', 10, 17);
    let y = 24; doc.setFontSize(10); doc.setFont(undefined, 'bold');
    for (const t of x.totals) { const L = doc.splitTextToSize(ascii('TOTAL GLOBAL ' + globalText(t)), 275); doc.text(L, 10, y); y += 5 * L.length + 1; }
    doc.setFont(undefined, 'normal');
    doc.autoTable(Object.assign({ startY: y + 2, head: [['Année', 'Section', 'Libellé', 'Valeur']], body: x.summary.map(r => A([r[0], r[1], r[2], r[4]])) }, opt));
    // Cessions : deux sous-tableaux pour tenir en largeur (A = 211-218, B = 220-224), avec ligne GLOBAL
    const rows = x.cessions.concat(x.totals.map(globalRow));
    const IA = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], IB = [0, 1, 3, 12, 13, 14, 15, 16, 17];
    const HA = ['Année', 'N°', '211 Date', 'Actif', 'Quantité', '212 Valeur portefeuille', '213 Prix cession', '214 Frais', '215 (213-214)', '216 Soulte', '217 (213-216)', '218 Prix net'];
    const HB = ['Année', 'N°', 'Actif', '220 Prix acquisition total', '221 Fractions déjà cédées', '222 Soultes reçues', '223 (220-221-222)', '224 Plus/moins-value', 'Statut'];
    doc.addPage(); doc.setFontSize(11); doc.text(ascii('Cessions - formulaire 2086, partie A : lignes 211 à 218 (' + x.cessions.length + ' cessions)'), 10, 12);
    doc.autoTable(Object.assign({ startY: 16, head: [A(HA)], body: rows.map(r => A(IA.map(i => i >= 5 && typeof r[i] === 'number' ? r[i].toFixed(2) : r[i]))) }, opt, bold));
    doc.addPage(); doc.setFontSize(11); doc.text(ascii('Cessions - formulaire 2086, partie B : lignes 220 à 224'), 10, 12);
    doc.autoTable(Object.assign({ startY: 16, head: [A(HB)], body: rows.map(r => A(IB.map(i => i >= 12 && typeof r[i] === 'number' ? r[i].toFixed(2) : r[i]))) }, opt, bold));
    doc.addPage(); doc.setFontSize(11); doc.text(ascii('Échanges crypto->crypto exclus (non imposables) : ' + x.swaps.length), 10, 12);
    if (x.swaps.length) doc.autoTable(Object.assign({ startY: 16, head: [A(HEAD.swaps)], body: x.swaps.map(A) }, opt));
    const n = doc.getNumberOfPages(); for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7); doc.text('Page ' + i + ' / ' + n, 287, 205, { align: 'right' }); }
    return doc;
  }
  const api = { globalRow, globalText, exportData, makeCsv, makeXlsx, makePdf, HEAD };
  if (typeof module !== 'undefined') module.exports = api; else root.KryptaxExport = api;
})(this);
