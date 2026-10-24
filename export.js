/* Export du formulaire 2086 (PDF via jsPDF embarqué, tableur xlsx/CSV) : uniquement les cessions imposables,
   un tableau avec une ligne par cession et les colonnes 211 à 224 de la déclaration 2086, synthèse courte et ligne GLOBAL.
   exportData() est pur (testé dans test.js) ; makePdf/makeXlsx/makeCsv utilisent les bibliothèques locales. */
(function (root) {
  const d = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'medium' });
  const ascii = s => String(s).replace(/→/g, '->').replace(/≈/g, '~').replace(/’/g, "'").replace(/−/g, '-').replace(/×/g, 'x').replace(/[^\x00-\xff€]/g, '');
  const e2 = v => v == null || !isFinite(v) ? 'À RENSEIGNER' : (+v).toFixed(2);
  /* Lignes et libellés de la déclaration n° 2086 (cadre 2, déclarant 1) */
  const FORM = [
    ['211', 'Date de la cession'],
    ['212', 'Valeur globale du portefeuille au moment de la cession'],
    ['213', 'Prix de cession'],
    ['214', 'Frais de cession'],
    ['215', 'Prix de cession net des frais (l. 213 - l. 214)'],
    ['216', 'Soulte reçue ou versée lors de la cession'],
    ['217', 'Prix de cession net des soultes (l. 213 - l. 216) ou (l. 213 + l. 216)'],
    ['218', 'Prix de cession net des frais et soultes (l. 213 - l. 214 - l. 216) ou (l. 213 - l. 214 + l. 216)'],
    ['220', 'Prix total d\'acquisition'],
    ['221', 'Fractions de capital initial contenues dans le prix total d\'acquisition'],
    ['222', 'Soultes reçues en cas d\'échanges antérieurs à la cession'],
    ['223', 'Prix total d\'acquisition net (l. 220 - l. 221 - l. 222)'],
    ['224', 'Plus-value ou moins-value : l. 218 - [l. 223 x (l. 217 / l. 212)]']];
  const NUM = ['l212', 'l213', 'l214', 'l215', 'l216', 'l217', 'l218', 'l220', 'l221', 'l222', 'l223', 'l224'];
  const calc224 = c => c.l224 == null ? 'à renseigner (cours manquant)' :
    `${e2(c.l218)} - [${e2(c.l223)} x (${e2(c.l217)} / ${e2(c.l212)})] = ${e2(c.l218)} - ${e2(c.l223 * c.l217 / c.l212)} = ${c.l224 >= 0 ? '+' : ''}${e2(c.l224)}`;
  const frac = c => c.l224 == null ? '' : `Fraction de capital initial cédée (ajoutée à la l. 221 des cessions suivantes) : l. 223 x l. 217 / l. 212 = ${e2(c.l223 * c.l217 / c.l212)}`;
  /* years: E.byYear(res) ; sums/summaryRows : conservés pour compatibilité (non exportés) ; txs : seulement pour compter les échanges exclus */
  function exportData(years, sums, summaryRows, txs) {
    const out = { cessions: [], totals: [], swapCount: (txs || []).filter(t => t.type === 'EXCH_OUT').length };
    for (const y of Object.values(years).sort((a, b) => a.year - b.year)) {
      y.cessions.forEach((c, i) => { const o = { year: y.year, n: i + 1, date: d(c.date), asset: c.asset, qty: +c.qty.toPrecision(10), status: c.status };
        NUM.forEach(k => o[k] = c[k] == null || !isFinite(c[k]) ? null : +c[k].toFixed(2)); o.calc = calc224(c); o.frac = frac(c); out.cessions.push(o); });
      const sum = k => +y.cessions.reduce((a, c) => a + (c[k] || 0), 0).toFixed(2), net = sum('l224'), l213 = sum('l213');
      out.totals.push({ year: y.year, n: y.cessions.length, l213, l214: sum('l214'), l218: sum('l218'), l224: net, incomplete: y.cessions.some(c => c.l224 == null),
        exonere: l213 <= 305, box: l213 <= 305 ? 'aucune (≤ 305 €)' : net >= 0 ? '3AN' : '3BN', report: l213 <= 305 ? 0 : Math.round(Math.abs(net)) });
    }
    return out;
  }
  const HEAD = ['Année', 'N°', '211 Date de la cession', 'Actif', 'Quantité', ...FORM.slice(1).map(f => f[0] + ' ' + f[1]), 'Calcul de la ligne 224'];
  const row = c => [c.year, c.n, c.date, c.asset, c.qty, ...NUM.map(k => c[k] == null ? 'À RENSEIGNER' : c[k]), c.calc];
  const globalRow = t => [t.year, 'GLOBAL', t.n + ' cessions', '', '', '', t.l213, t.l214, '', '', '', t.l218, '', '', '', '', t.l224, t.incomplete ? 'incomplet' : 'Somme des lignes 224'];
  const globalText = t => `${t.year} : total des cessions (213) ${t.l213.toFixed(2)} € ; frais (214) ${t.l214.toFixed(2)} € ; prix nets (218) ${t.l218.toFixed(2)} € ; plus-value nette globale (224) ${t.l224 >= 0 ? '+' : ''}${t.l224.toFixed(2)} €${t.incomplete ? ' (incomplet)' : ''}. ` +
    (t.exonere ? `Total des cessions ≤ 305 € : exonéré, rien à reporter.` : `Total des cessions > 305 € : imposable. À reporter case ${t.box} de la 2042-C : ${t.report} €.`);
  const synth = x => x.totals.flatMap(t => [
    [t.year, 'Nombre de cessions imposables', t.n], [t.year, 'Total des prix de cession (213)', t.l213], [t.year, 'Total des frais (214)', t.l214],
    [t.year, 'Total des prix nets (218)', t.l218], [t.year, 'Plus-value nette globale (somme des 224)', t.l224],
    [t.year, 'Seuil de 305 €', t.exonere ? 'non dépassé : cessions exonérées' : 'dépassé : imposable'],
    [t.year, 'Case 2042-C', t.exonere ? 'aucune' : t.box + ' = ' + t.report + ' €']]).concat([['', 'Échanges crypto -> crypto exclus (non imposables)', x.swapCount]]);
  function makeCsv(x) {
    const q = v => { const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const L = r => r.map(q).join(';');
    return '\ufeff' + ['SYNTHESE 2086', L(['Année', 'Rubrique', 'Valeur']), ...synth(x).map(L), ...x.totals.map(t => q('TOTAL GLOBAL ' + globalText(t))), '',
      'CESSIONS (2086)', L(HEAD), ...x.cessions.map(c => L(row(c))), ...x.totals.map(t => L(globalRow(t))), ''].join('\n');
  }
  /* Détail type formulaire : une colonne par cession, une ligne par numéro de la 2086 */
  const formSheet = x => [['Ligne', 'Libellé', ...x.cessions.map(c => `Cession ${c.n} (${c.year})`)], ['', 'Actif', ...x.cessions.map(c => c.asset)], ['', 'Quantité cédée', ...x.cessions.map(c => c.qty)],
    ['211', FORM[0][1], ...x.cessions.map(c => c.date)], ...FORM.slice(1).map((f, i) => [f[0], f[1], ...x.cessions.map(c => c[NUM[i]] == null ? 'À RENSEIGNER' : c[NUM[i]])]), ['', 'Calcul de la ligne 224', ...x.cessions.map(c => c.calc)]];
  function makeXlsx(XLSX, x) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Année', 'Rubrique', 'Valeur'], ...synth(x), [], ...x.totals.map(t => ['TOTAL GLOBAL', globalText(t)])]), 'Synthèse');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEAD, ...x.cessions.map(row), ...x.totals.map(globalRow)]), 'Cessions 2086');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(formSheet(x)), 'Formulaire 2086');
    return wb;
  }
  const SHORT = ['211 Date de la cession', '212 Valeur globale du portefeuille', '213 Prix de cession', '214 Frais de cession', '215 Prix net des frais (213-214)', '216 Soulte', '217 Prix net des soultes (213-216)', '218 Prix net frais et soultes', '220 Prix total d\'acquisition', '221 Fractions de capital initial', '222 Soultes antérieures', '223 Prix total d\'acquisition net (220-221-222)', '224 Plus ou moins-value'];
  function makePdf(jsPDF, x, title) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }), A = r => r.map(v => ascii(v));
    const opt = { styles: { fontSize: 6.8, cellPadding: 1, overflow: 'linebreak', halign: 'right' }, headStyles: { fillColor: [20, 40, 70], fontSize: 6.3, halign: 'center', valign: 'middle' }, margin: { left: 6, right: 6 } };
    const boldG = { didParseCell: h => { if (h.section === 'body' && h.row.raw && h.row.raw[0] === 'GLOBAL') { h.cell.styles.fontStyle = 'bold'; h.cell.styles.fillColor = [225, 235, 250]; } } };
    doc.setFontSize(15); doc.text(ascii(title || 'Kryptax - déclaration 2086'), 8, 13); doc.setFontSize(8);
    doc.text(ascii('Plus ou moins-values de cessions d\'actifs numériques (déclaration 2086, cadre 2). Outil d\'aide au calcul, pas un conseil fiscal. Montants en euros.'), 8, 18);
    let y = 26;
    for (const t of x.totals) {
      doc.setFontSize(12); doc.setFont(undefined, 'bold');
      doc.text(ascii(`Total global plus-value nette ${t.year} : ${t.l224 >= 0 ? '+' : ''}${t.l224.toFixed(2)} €${t.incomplete ? ' (incomplet)' : ''}`), 8, y); y += 6;
      doc.setFontSize(9); doc.setFont(undefined, 'normal');
      const L = doc.splitTextToSize(ascii(globalText(t)), 280); doc.text(L, 8, y); y += 4.5 * L.length + 2;
    }
    doc.autoTable(Object.assign({}, opt, { startY: y, tableWidth: 150, styles: { fontSize: 8, cellPadding: 1.2 }, head: [['Année', 'Synthèse', 'Valeur']],
      body: synth(x).map(r => A([r[0], r[1], typeof r[2] === 'number' && !Number.isInteger(r[2]) ? r[2].toFixed(2) : r[2]])) }));
    // Tableau 2086 : une ligne par cession imposable, colonnes 211 à 224 dans l'ordre de la déclaration, ligne GLOBAL en bas
    doc.addPage(); doc.setFontSize(11); doc.text(ascii(`Cessions imposables - déclaration 2086, lignes 211 à 224 (${x.cessions.length} cessions)`), 8, 11);
    const head = [A(['N°', 'Actif', 'Quantité', ...SHORT])];
    const body = x.cessions.map(c => A([c.n + (x.totals.length > 1 ? ' (' + c.year + ')' : ''), c.asset, c.qty, c.date, ...NUM.map(k => e2(c[k]))]))
      .concat(x.totals.map(t => A(['GLOBAL', t.year, t.n + ' cessions', '', '', t.l213.toFixed(2), t.l214.toFixed(2), '', '', '', t.l218.toFixed(2), '', '', '', '', (t.l224 >= 0 ? '+' : '') + t.l224.toFixed(2)])));
    doc.autoTable(Object.assign({}, opt, boldG, { startY: 14, head, body, columnStyles: { 0: { halign: 'left', cellWidth: 14 }, 1: { halign: 'left', cellWidth: 12 }, 3: { halign: 'left', cellWidth: 25 }, 15: { fontStyle: 'bold' } } }));
    y = doc.lastAutoTable.finalY + 5; if (y > 185) { doc.addPage(); y = 12; }
    doc.setFontSize(7); doc.text(doc.splitTextToSize(ascii('Libellés officiels : ' + FORM.map(f => f[0] + ' ' + f[1]).join(' ; ') + '. La ligne 221 de chaque cession cumule les fractions l. 223 x l. 217 / l. 212 des cessions antérieures. Les échanges crypto -> crypto sans soulte ne sont pas des cessions imposables et ne figurent pas dans ce tableau.'), 282), 8, y);
    const n = doc.getNumberOfPages(); for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7); doc.text('Page ' + i + ' / ' + n, 289, 205, { align: 'right' }); }
    return doc;
  }
  const api = { FORM, globalRow, globalText, exportData, makeCsv, makeXlsx, makePdf, HEAD };
  if (typeof module !== 'undefined') module.exports = api; else root.KryptaxExport = api;
})(this);
