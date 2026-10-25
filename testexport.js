// node testexport.js — génère le PDF (jeu FICTIF, 18 cessions) et vérifie par pdftotext : synthèse, récapitulatif + GLOBAL,
// un cadre détaillé par cession avec les lignes 211 à 224 et leurs valeurs, pas d'échanges/soldes/revenus, aucune mention de plateforme
global.window = global; global.navigator = { userAgent: 'node' };
const { jsPDF } = require('./jspdf.umd.min.js'); const at = require('./jspdf.plugin.autotable.min.js'); if (at.applyPlugin) at.applyPlugin(jsPDF);
const E = require('./engine.js'), X = require('./export.js'), fs = require('fs'), T = require('./testdata/fake_many.js')();
const P = (a) => ({ AAA: 6, BBB: 7, CCC: 8, DDD: 9, EEE: 10 })[a];
const r = E.compute(T, P), Y = E.byYear(r), S = {}; for (const y in Y) S[y] = E.summary(T, r, P, +y);
const x = X.exportData(Y, S, () => [], T);
fs.writeFileSync('/tmp/kryptax-test.pdf', Buffer.from(X.makePdf(jsPDF, x, X.title(2026)).output('arraybuffer')));
const txt = require('child_process').execSync('pdftotext -layout /tmp/kryptax-test.pdf -').toString(), pages = txt.split('\f');
let ok = true; const chk = (c, m) => { ok = ok && c; console.log((c ? 'OK  ' : 'ÉCHEC ') + m); };
const t = x.totals[0];
chk(pages.filter(p => p.trim()).length === 1, 'PDF 18 cessions : une seule page A4 paysage');
chk(/Kryptax/.test(pages[0]) && /Formulaire 2086 pour la fiscalit/.test(pages[0]), 'En-tête : logo Kryptax et sous-titre');
chk(/Total global plus-value nette/.test(pages[0]) && /3AN|3BN/.test(pages[0]) && /305/.test(pages[0]) && txt.indexOf('GLOBAL') < txt.indexOf('Total global plus-value'), 'Résumé (total, 3AN/3BN, 305 €) sous le tableau');
chk(/GLOBAL/.test(txt) && txt.includes(X.fr(t.l213)) && txt.includes(X.fr(t.l218)) && txt.includes(X.fr(t.l224)), 'Récapitulatif : ligne GLOBAL (213, 218, 224)');
const tab = txt, rows = tab.split('\n').filter(l => /^\s*\d+\s+[A-Z]{3}\s+[\d,]+\s+\d\d\/\d\d\/2026/.test(l));
chk(rows.length === 18, 'Tableau 2086 : ' + rows.length + ' lignes de cession (attendu 18)');
chk(['211', '212', '213', '214', '215', '216', '217', '218', '220', '221', '222', '223', '224'].every(n => tab.includes(n + ' ')), 'Tableau 2086 : colonnes 211 à 224 présentes');
const bad = x.cessions.filter((c, i) => !['l212', 'l213', 'l214', 'l215', 'l216', 'l217', 'l218', 'l220', 'l221', 'l222', 'l223', 'l224'].every(k => (rows[i] || '').includes(X.fr(c[k]))));
chk(!bad.length, 'Tableau 2086 : chaque ligne porte les 12 valeurs 212-224' + (bad.length ? ' (KO: ' + bad.map(c => c.n) + ')' : ''));
chk(/GLOBAL.*\d/.test(tab) && !/Cession 1 \(/.test(txt), 'Tableau 2086 : ligne GLOBAL en bas, pas de fiche par cession');
chk(!/RENSEIGNER/.test(txt), 'Aucune ligne « À RENSEIGNER » (jeu fictif complet)');
chk(!/Soldes|Revenus/.test(txt) && /exclus\s+4 \(non imposables\)/.test(txt), 'Pas de liste d’échanges, soldes ni revenus (simple compteur)');
const csv = X.makeCsv(x);
chk(/GLOBAL/.test(csv) && /TOTAL GLOBAL/.test(csv), 'CSV : ligne GLOBAL et total global');
chk(!/revolut/i.test(txt + csv), 'PDF/CSV : aucune mention de la plateforme');
// Année choisie : titre et année vide (fictif)
{ const xy = X.exportData(Y, S, () => [], T, 2026), ty = require('child_process').execSync('pdftotext -layout - -', { input: Buffer.from(X.makePdf(jsPDF, xy, X.title(2026)).output('arraybuffer')) }).toString();
  chk(/Annee 2026 - declaration 2027|Année 2026 - déclaration 2027/.test(ty), 'PDF : titre « Année 2026 — déclaration 2027 »');
  const xe = X.exportData(Y, S, () => [], T, 2027), te = require('child_process').execSync('pdftotext -layout - -', { input: Buffer.from(X.makePdf(jsPDF, xe, X.title(2027)).output('arraybuffer')) }).toString();
  chk(/Aucune cession imposable en 2027/.test(te) && /GLOBAL/.test(te) && /0 cession/.test(te) && /2027 - d.claration 2028/.test(te), 'PDF année sans cession : message et GLOBAL à 0'); }
// Beaucoup de cessions (fictif) : plusieurs pages, en-têtes répétés, GLOBAL sur la dernière
{ const TT = [{ id: 0, date: Date.UTC(2026, 0, 2), type: 'BUY', asset: 'AAA', qty: 100, eur: 1000, fee: 0 }];
  for (let i = 1; i <= 45; i++) TT.push({ id: i, date: Date.UTC(2026, 0, 3 + i * 6), type: 'SELL', asset: 'AAA', qty: 1, eur: 20 + i, fee: 0.1 });
  const rr = E.compute(TT, () => 20), YY = E.byYear(rr), xm = X.exportData(YY, {}, () => [], TT, 2026);
  const tm = require('child_process').execSync('pdftotext -layout - -', { input: Buffer.from(X.makePdf(jsPDF, xm, X.title(2026)).output('arraybuffer')) }).toString(), pg = tm.split('\f').filter(p => p.trim());
  chk(xm.cessions.length === 45 && pg.length > 1, 'PDF 45 cessions : ' + pg.length + ' pages (> 1)');
  chk(pg.every(p => /224 Plus ou/.test(p) || !/^\s*\d+\s+AAA/m.test(p)), 'PDF multi-pages : en-têtes de colonnes répétés');
  const lastTab = pg.map((p, i) => /^\s*GLOBAL/m.test(p) ? i : -1).filter(i => i >= 0); chk(lastTab.length === 1 && !pg.slice(lastTab[0] + 1).some(p => /^\s*\d+\s+AAA/m.test(p)), 'PDF multi-pages : GLOBAL après la dernière cession'); }
/* Logo : image embarquée (jamais noire), et repli texte coloré lettre par lettre ; analyse des pixels de la zone du logo (pdftoppm) */
{ const cp = require('child_process'), zone = buf => { require('fs').writeFileSync('/tmp/kx-logo.pdf', buf); cp.execSync('pdftoppm -r 72 -f 1 -l 1 -x 0 -y 0 -W 170 -H 50 -singlefile /tmp/kx-logo.pdf /tmp/kx-logo'); const ppm = require('fs').readFileSync('/tmp/kx-logo.ppm'); let i = 0, nl = 0; while (nl < 3) if (ppm[i++] === 10) nl++;
    let col = 0, dark = 0; for (; i + 2 < ppm.length; i += 3) { const r = ppm[i], g = ppm[i + 1], b = ppm[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx - mn > 80) col++; else if (mx < 90) dark++; } return { col, dark }; };
  const img = { data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAeAFoDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD78X9qb4Xv08T5/wC4fdf/ABqpl/ac+Gj9PEuf+3C5/wDjdfntbdRWrbda/SM04bwmBv7OUn6tf5I+QwWb18Tbnivlf/M++V/aS+HL9PEWf+3G5/8AjdSr+0P8Pn6eIM/9uVx/8br4Xtu1att2r8hzTF1MFf2aT9f6R95gqEcTbn/A+2V+PvgN+mu5/wC3Of8A+N1IPjp4HYZGt/8AkpP/APEV8cW3atOL7lfkWZcdZlg5Wp04P1Uv/kj7rCcN4SvG8pS+9f5H1m3x38DL11z/AMlJ/wD4io2+P3gJeuvf+Sdx/wDG6+SJupqjN3rLD8eZnW+KnT+6X/yR8/mGV0cJfkb+dv8AI+wW/aF+H69df/8AJK4/+N0xv2jfh2vXxD/5JXH/AMbr4ym6mqE3evpsPxTja3xQj9z/APkj8zzDM62EvyJfO/8AmfbB/aU+HC9fEf8A5I3P/wAbpv8Aw0v8Nv8AoY//ACRuf/jdfDU1QV9HSzevNXcV+P8AmfnGK42zGhPljTh90v8A5IwLbqK1bbrX3cv7LPwvTp4Yx/3ELr/47Uy/sx/DROnhrH/b/c//AByv3fNOJMJjr+zjJeqX+bPvcFlFfDW55L5X/wAj4htu1att2r7OX9m34cp08O4/7frn/wCOVKv7PHw+Tp4fx/2+3H/xyvyHNMJUxt/ZtL1/pn3mCrxw1uf8D5Ctu1acX3K+sF+AXgNOmhY/7fJ//jlSD4F+B1GBon/k3P8A/F1+RZlwLmWMlenUgvVy/wDkT7rCcSYShG0oy+5f5nyHN1NUZu9fZLfAjwM3XQ//ACbn/wDi6jb4A+Am66D/AOTlx/8AHKyw/AeZ0fiqU/vl/wDInz+YZpRxd+RP52/zPiubqaoTd6+32/Z6+H7ddA/8nbj/AOOUxv2cvh23Xw9/5O3H/wAcr6bD8LY2j8U4/e//AJE/M8wyyti78jXzv/kfCk1QV93H9mv4cN18Of8Ak9c//HKb/wAM0fDb/oXP/J65/wDjlfR0sorwVnJfj/kfnGK4JzGvPmjUh98v/kT/2Q==', fmt: 'JPEG', ratio: 3 };
  const pi = Buffer.from(X.makePdf(jsPDF, x, X.title(2026), img).output('arraybuffer')), zi = zone(pi);
  chk(/\/Subtype \/Image/.test(pi.toString('latin1')), 'Logo intégré comme image dans le PDF');
  chk(zi.col > 200 && zi.dark < 20, 'Logo image : zone colorée, aucun noir (' + zi.col + ' px couleur, ' + zi.dark + ' px sombres)');
  const pt = Buffer.from(X.makePdf(jsPDF, x, X.title(2026), null).output('arraybuffer')), zt = zone(pt);
  chk(zt.col > 100 && zt.dark < 20, 'Repli texte : lettres colorées, jamais noires (' + zt.col + ' px couleur, ' + zt.dark + ' px sombres)');
  const bad = Buffer.from(X.makePdf(jsPDF, x, X.title(2026), { data: 'data:image/png;base64,AAAA', ratio: 3 }).output('arraybuffer')), zb = zone(bad);
  chk(zb.col > 100 && zb.dark < 20, 'Image illisible : repli texte coloré');
}
process.exit(ok ? 0 : 1);
