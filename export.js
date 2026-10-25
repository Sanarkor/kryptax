/* Export du formulaire 2086 (PDF via jsPDF embarqué) : uniquement les cessions imposables,
   un tableau avec une ligne par cession et les colonnes 211 à 224 de la déclaration 2086, synthèse courte et ligne GLOBAL.
   exportData() est pur (testé dans test.js) ; makePdf utilise jsPDF embarqué. */
(function (root) {
  const d = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'medium' });
  const ascii = s => String(s).replace(/→/g, '->').replace(/≈/g, '~').replace(/’/g, "'").replace(/−/g, '-').replace(/—/g, '-').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/×/g, 'x').replace(/[^\x00-\xff€]/g, '');
  const e2 = v => v == null || !isFinite(v) ? 'À RENSEIGNER' : (+v).toFixed(2);
  /* Lignes et libellés de la déclaration n° 2086 (cadre 2, déclarant 1) */
  const FORM = [
    ['211', 'Date de la cession (heure de Paris)'],
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
  /* Opérations particulières (hors cessions) : détectées d'après le type reconnu et le libellé d'origine du relevé.
     Exclues du calcul de cession (sauf PAY : un paiement en crypto est une cession, signalé « à vérifier »). */
  const SPECIAL = [['staking', 'staking'], ['airdrop', 'airdrops'], ['interets', 'intérêts et récompenses'], ['minage', 'minage'], ['cadeaux', 'cadeaux et dons'],
    ['frais', 'frais payés en crypto'], ['transferts', 'dépôts et retraits entre comptes'], ['paiements', 'paiements en crypto d\'un bien ou service']];
  function specialKind(t) {
    if (!t || t.adjust) return null;
    const s = String(t.rawType || '').toLowerCase();
    if (t.type === 'PAY') return 'paiements';
    if (!['STAKING', 'AIRDROP', 'INTEREST', 'FEE', 'RECEIVE', 'SEND', 'IGNORE'].includes(t.type)) return null;
    if (/\bmin(ing|age|ed)\b|mineur|miner/.test(s)) return 'minage';
    if (/gift|crypto box|cadeau|\bdons?\b|donation|offert/.test(s)) return 'cadeaux';
    return { STAKING: 'staking', AIRDROP: 'airdrop', INTEREST: 'interets', FEE: 'frais' }[t.type] || 'transferts';
  }
  function special(txs, year) {
    const c = {};
    (txs || []).forEach(t => { if (year && +new Intl.DateTimeFormat('en', { timeZone: 'Europe/Paris', year: 'numeric' }).format(t.date) !== year) return; const k = specialKind(t); if (k) c[k] = (c[k] || 0) + 1; });
    const cats = SPECIAL.filter(([k]) => c[k]).map(([k, label]) => ({ key: k, label, n: c[k] }));
    const pay = c.paiements || 0;
    return { cats, pay, n: cats.reduce((a, x) => a + x.n, 0) - pay };
  }
  function specialText(sp, year) {
    if (!sp || (!sp.n && !sp.pay)) return '';
    const ex = sp.cats.filter(x => x.key !== 'paiements');
    let s = '';
    if (sp.n) s += `Opérations particulières${year ? ' en ' + year : ''}, non traitées comme des cessions : ` + ex.map(x => `${x.label} ${x.n}`).join(' ; ') +
      `. Leur régime fiscal propre (revenus, BNC, BIC…) n'est pas calculé par Kryptax.`;
    if (sp.pay) s += (s ? ' ' : '') + `À vérifier : ${sp.pay} paiement${sp.pay > 1 ? 's' : ''} en crypto d'un bien ou service. Un tel paiement est une cession imposable : il est compté dans le tableau ci-dessus.`;
    return s;
  }
  function exportData(years, sums, summaryRows, txs, year) {
    const out = { cessions: [], totals: [], year: year || null, swapCount: (txs || []).filter(t => t.type === 'EXCH_OUT').length, special: special(txs, year) };
    // year : seules les cessions de cette année (le calcul 2086 reste cumulatif depuis le premier achat : l. 220/221/212 viennent de tout l'historique)
    const list = year ? [years[year] || { year, cessions: [] }] : Object.values(years).sort((a, b) => a.year - b.year);
    for (const y of list) {
      y.cessions.forEach((c, i) => { const o = { year: y.year, n: i + 1, date: d(c.date), asset: c.asset, qty: +c.qty.toPrecision(10), status: c.status };
        NUM.forEach(k => o[k] = c[k] == null || !isFinite(c[k]) ? null : +c[k].toFixed(2)); o.calc = calc224(c); o.frac = frac(c); out.cessions.push(o); });
      const sum = k => +y.cessions.reduce((a, c) => a + (c[k] || 0), 0).toFixed(2), net = sum('l224'), l213 = sum('l213');
      out.totals.push({ year: y.year, n: y.cessions.length, l213, l214: sum('l214'), l218: sum('l218'), l224: net, incomplete: y.cessions.some(c => c.l224 == null),
        exonere: l213 <= 305, box: l213 <= 305 ? 'aucune (≤ 305 €)' : net >= 0 ? '3AN' : '3BN', report: l213 <= 305 ? 0 : Math.round(Math.abs(net)) });
    }
    return out;
  }
  const globalText = t => `${t.year} : total des cessions (213) ${t.l213.toFixed(2)} € ; frais (214) ${t.l214.toFixed(2)} € ; prix nets (218) ${t.l218.toFixed(2)} € ; plus-value nette globale (224) ${t.l224 >= 0 ? '+' : ''}${t.l224.toFixed(2)} €${t.incomplete ? ' (incomplet)' : ''}. ` +
    (t.exonere ? `Total des cessions ≤ 305 € : exonéré, rien à reporter.` : `Total des cessions > 305 € : imposable. À reporter case ${t.box} de la 2042-C : ${t.report} €. Les prélèvements sociaux s\'ajoutent à l\'impôt (17,2 % ou 18,6 % selon l\'année, soit 30 % ou 31,4 % au total). Taux à vérifier sur impots.gouv.fr.`);
  const SHORT = ['211 Date de la cession (heure de Paris)', '212 Valeur globale du portefeuille', '213 Prix de cession', '214 Frais de cession', '215 Prix net des frais (213-214)', '216 Soulte', '217 Prix net des soultes (213-216)', '218 Prix net frais et soultes', '220 Prix total d\'acquisition', '221 Fractions de capital initial', '222 Soultes antérieures', '223 Prix total d\'acquisition net (220-221-222)', '224 Plus ou moins-value'];
  // Montant à la française : séparateur de milliers (espace), 2 décimales, virgule
  const fr = v => v == null || !isFinite(v) ? 'À RENSEIGNER' : (v < 0 ? '-' : '') + Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ').replace('.', ',');
  const frs = v => v == null || !isFinite(v) ? 'À RENSEIGNER' : (v > 0 ? '+' : '') + fr(v);
  const qfmt = q => String(q).replace('.', ',');
    /* Logo 100 % vectoriel, sans icône : mot « Kryptax » noir, fin contour gris métallique (trait gris foncé puis liseré gris clair), aligné sur la marge gauche. */
  function logo(doc, x0, y0, size) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(size); const cs = size * 0.012;
    doc.setTextColor(10, 12, 16); doc.setDrawColor(95, 103, 112); doc.setLineWidth(0.45); doc.setLineJoin && doc.setLineJoin('round');
    doc.text('Kryptax', x0, y0, { renderingMode: 'fillThenStroke', charSpace: cs });
    doc.setDrawColor(201, 206, 212); doc.setLineWidth(0.14); doc.text('Kryptax', x0, y0, { renderingMode: 'stroke', charSpace: cs });
    doc.setLineWidth(0.2); doc.setDrawColor(0, 0, 0); doc.setTextColor(20, 40, 70);
    return doc.getTextWidth('Kryptax') + cs * 6;
  }
  const LAW = 'Art. 150 VH bis CGI (plus-values sur crypto-actifs, seuil 305 €) · art. 200 C CGI (taux 12,8 %) · BOI-RPPM-PVBMC-30';
  function makePdf(jsPDF, x, title, img) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }), A = r => r.map(v => ascii(v)), W = 297, H = 210, M = 8;
    const n = x.cessions.length, multi = x.totals.length > 1, fs = n <= 10 ? 8.4 : n <= 16 ? 7.6 : 7;
    // En-tête : logo à gauche, sous-titre et année
    logo(doc, M, 15, 24);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60, 70, 90);
    doc.text(ascii('Formulaire 2086 pour la fiscalité française'), M, 21);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(20, 40, 70);
    doc.text(ascii(title || (x.year ? `Année ${x.year} — déclaration ${x.year + 1}` : 'Déclaration 2086')), M, 27);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(110, 110, 110);
    doc.text(ascii('Cessions imposables d\'actifs numériques (cadre 2, lignes 211 à 224). Montants en euros. Outil d\'aide au calcul, pas un conseil fiscal.'), W - M, 27, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    // 1) Tableau des cessions
    const head = [A(['N°', 'Actif', 'Quantité', ...SHORT])];
    const body = x.cessions.map(c => A([c.n + (multi ? ' (' + c.year + ')' : ''), c.asset, qfmt(c.qty), c.date.slice(0, 16) + (c.prec ? '\n' + c.prec : ''), ...NUM.map(k => fr(c[k]))]));
    const gl = x.totals.map(t => A(['GLOBAL', multi ? String(t.year) : '', t.n + ' cession' + (t.n > 1 ? 's' : ''), '', '', fr(t.l213), fr(t.l214), '', '', '', fr(t.l218), '', '', '', '', frs(t.l224)]));
    const center = { halign: 'center' };
    doc.autoTable({ startY: 31, head, body: body.concat(gl), theme: 'grid', margin: { left: M, right: M, top: 12, bottom: 10 }, showHead: 'everyPage', rowPageBreak: 'avoid',
      styles: { font: 'helvetica', fontSize: fs, cellPadding: { top: 1, bottom: 1, left: 1, right: 1 }, halign: 'right', valign: 'middle', overflow: 'linebreak', lineColor: [205, 212, 225], lineWidth: .15, textColor: [20, 20, 30] },
      headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: 'bold', fontSize: fs - .9, halign: 'center', valign: 'middle' },
      alternateRowStyles: { fillColor: [243, 246, 251] },
      columnStyles: { 0: { halign: 'center', cellWidth: multi ? 17 : 15 }, 1: { halign: 'center', fontStyle: 'bold', cellWidth: 13 }, 2: { halign: 'center', cellWidth: 18 }, 3: { halign: 'center', cellWidth: 25 }, 15: { fontStyle: 'bold' } },
      didParseCell: h => { if (h.section === 'body' && h.row.raw && h.row.raw[0] === 'GLOBAL') { h.cell.styles.fontStyle = 'bold'; h.cell.styles.fillColor = [214, 228, 248]; h.cell.styles.fontSize = fs + .3; if (h.column.index < 3) h.cell.styles.halign = 'center'; } } });
    // 2) Résumé court sous le tableau (nouvelle page seulement si la place manque)
    const lines = [];
    for (const t of x.totals) {
      lines.push([`Total global plus-value nette${multi ? ' ' + t.year : ''}`, frs(t.l224) + ' €' + (t.incomplete ? ' (incomplet)' : '')]);
      lines.push(['Total des prix de cession (213)', fr(t.l213) + ' €' + (t.exonere ? ' : ≤ 305 €, cessions exonérées' : ' : > 305 €, imposable')]);
      lines.push(['Case 2042-C', t.exonere ? 'aucune (seuil de 305 € non dépassé)' : `${t.box} = ${t.report} €`]);
      if (!t.exonere) lines.push(['Prélèvements sociaux', 'Les prélèvements sociaux s\'ajoutent à l\'impôt (17,2 % ou 18,6 % selon l\'année, soit 30 % ou 31,4 % au total). Taux à vérifier sur impots.gouv.fr.']);
    }
    if (!n) lines.unshift(['Cessions', `Aucune cession imposable${x.year ? ' en ' + x.year : ''} : rien a reporter sur la 2086.`]);
    if (x.prec) lines.push(['Précision des cours', x.prec]);
    lines.push(['Échanges crypto -> crypto exclus', `${x.swapCount} (non imposables)`]);
    let y = doc.lastAutoTable.finalY + 4; const need = lines.length * 5.2 + 4;
    if (y + need > H - 10) { doc.addPage(); y = 14; }
    doc.autoTable({ startY: y, body: lines.map(A), theme: 'plain', tableWidth: 170, margin: { left: M },
      styles: { fontSize: 9.5, cellPadding: .9, textColor: [20, 20, 30] }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 }, 1: { halign: 'left' } },
      didParseCell: h => { if (h.row.index === (n ? 0 : 1)) { h.cell.styles.fontSize = 11; h.cell.styles.fontStyle = 'bold'; } } });
    // 3) Libellés officiels en note de bas de page, seulement s'il reste de la place
    doc.setFontSize(5.8); doc.setFont('helvetica', 'normal'); doc.setTextColor(110, 110, 110);
    const note = doc.splitTextToSize(ascii('L\'utilisateur reste seul responsable de sa déclaration auprès de l\'administration fiscale. Libellés officiels : ' + FORM.map(f => f[0] + ' ' + f[1]).join(' ; ') + '. La ligne 221 de chaque cession cumule les fractions l. 223 x l. 217 / l. 212 des cessions antérieures (calcul depuis le premier achat).'), W - 2 * M);
    let yn = doc.lastAutoTable.finalY + 3;
    // 3) Opérations particulières : courte note, prioritaire sur les libellés officiels (reste sur la même page)
    const st = specialText(x.special, x.year);
    if (st) { doc.setFontSize(7.4); doc.setFont('helvetica', 'bold'); doc.setTextColor(60, 70, 90); const sl = doc.splitTextToSize(ascii(st), W - 2 * M);
      if (yn + sl.length * 3 + 2 > H - 8) { doc.addPage(); yn = 14; } doc.text(sl, M, yn + 2); doc.setFont('helvetica', 'normal'); yn += sl.length * 3 + 1.5;
      doc.setFontSize(5.8); doc.setTextColor(110, 110, 110); }
    if (yn + note.length * 2.4 < H - 8) doc.text(note, M, yn + 2);
    const np = doc.getNumberOfPages(); for (let i = 1; i <= np; i++) { doc.setPage(i); doc.setFontSize(7); doc.setTextColor(120, 120, 120); doc.text('Kryptax - page ' + i + ' / ' + np, W - M, H - 5, { align: 'right' }); doc.text(ascii(LAW), M, H - 5); }
    doc.setTextColor(0, 0, 0);
    return doc;
  }
  const PAST = 5, FUTURE = 0;
  // Années fiscales proposées : de l'année en cours − 5 à l'année en cours (6 années, aucune année future)
  function yearOptions(years, now) { const r = []; for (let y = now - PAST; y <= now + FUTURE; y++) r.push(y); return r; }
  const selectable = (y, now) => y >= now - PAST && y <= now;
  function defaultYear(years, now) { const ks = Object.values(years || {}).filter(y => selectable(y.year, now) && y.cessions.length).map(y => y.year); return ks.length ? Math.max(...ks) : now; }
  const title = y => `Année ${y} — déclaration ${y + 1}`;
  // Nom du PDF : kryptax-formulaire-2086-{année}-sur-{année+1}-JJ-MM-AAAA-HH-mm.pdf, date/heure réelles de l’export à Paris
  function pdfName(y, now) {
    const p = {}; for (const x of new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now || new Date())) p[x.type] = x.value;
    return `kryptax-formulaire-2086-${y}-sur-${y + 1}-${p.day}-${p.month}-${p.year}-${p.hour}-${p.minute}.pdf`;
  }
  const api = { pdfName, fr, FORM, PAST, FUTURE, selectable, yearOptions, defaultYear, title, globalText, exportData, special, specialKind, specialText, makePdf };
  if (typeof module !== 'undefined') module.exports = api; else root.KryptaxExport = api;
})(this);
