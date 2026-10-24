// node testexport.js — génère le PDF (jeu FICTIF, 18 cessions) et vérifie par pdftotext : synthèse, récapitulatif + GLOBAL,
// un cadre détaillé par cession avec les lignes 211 à 224 et leurs valeurs, pas d'échanges/soldes/revenus, aucune mention de plateforme
global.window = global; global.navigator = { userAgent: 'node' };
const { jsPDF } = require('./jspdf.umd.min.js'); const at = require('./jspdf.plugin.autotable.min.js'); if (at.applyPlugin) at.applyPlugin(jsPDF);
const E = require('./engine.js'), X = require('./export.js'), fs = require('fs'), T = require('./testdata/fake_many.js')();
const P = (a) => ({ AAA: 6, BBB: 7, CCC: 8, DDD: 9, EEE: 10 })[a];
const r = E.compute(T, P), Y = E.byYear(r), S = {}; for (const y in Y) S[y] = E.summary(T, r, P, +y);
const x = X.exportData(Y, S, () => [], T);
fs.writeFileSync('/tmp/kryptax-test.pdf', Buffer.from(X.makePdf(jsPDF, x, 'Test').output('arraybuffer')));
const txt = require('child_process').execSync('pdftotext -layout /tmp/kryptax-test.pdf -').toString(), pages = txt.split('\f');
let ok = true; const chk = (c, m) => { ok = ok && c; console.log((c ? 'OK  ' : 'ÉCHEC ') + m); };
const t = x.totals[0];
chk(/Total global plus-value nette/.test(pages[0]) && /3AN|3BN|305/.test(pages[0]), 'Page 1 : total global, case 3AN/3BN, seuil 305 €');
chk(/GLOBAL/.test(txt) && txt.includes(t.l213.toFixed(2)) && txt.includes(t.l218.toFixed(2)) && txt.includes(t.l224.toFixed(2)), 'Récapitulatif : ligne GLOBAL (213, 218, 224)');
const tab = pages.slice(1).join('\n'), rows = tab.split('\n').filter(l => /^\s*\d+\s+[A-Z]{3}\s+[\d.]+\s+\d\d\/\d\d\/2026/.test(l));
chk(rows.length === 18, 'Tableau 2086 : ' + rows.length + ' lignes de cession (attendu 18)');
chk(['211', '212', '213', '214', '215', '216', '217', '218', '220', '221', '222', '223', '224'].every(n => tab.includes(n + ' ')), 'Tableau 2086 : colonnes 211 à 224 présentes');
const bad = x.cessions.filter((c, i) => !['l212', 'l213', 'l214', 'l215', 'l216', 'l217', 'l218', 'l220', 'l221', 'l222', 'l223', 'l224'].every(k => (rows[i] || '').includes(c[k].toFixed(2))));
chk(!bad.length, 'Tableau 2086 : chaque ligne porte les 12 valeurs 212-224' + (bad.length ? ' (KO: ' + bad.map(c => c.n) + ')' : ''));
chk(/GLOBAL.*\d/.test(tab) && !/Cession 1 \(/.test(txt), 'Tableau 2086 : ligne GLOBAL en bas, pas de fiche par cession');
chk(!/RENSEIGNER/.test(txt), 'Aucune ligne « À RENSEIGNER » (jeu fictif complet)');
chk(!/Soldes|Revenus/.test(txt) && /exclus \(non imposables\)\s+4\s*$/m.test(txt), 'Pas de liste d’échanges, soldes ni revenus (simple compteur)');
const csv = X.makeCsv(x);
chk(/GLOBAL/.test(csv) && /TOTAL GLOBAL/.test(csv), 'CSV : ligne GLOBAL et total global');
chk(!/revolut/i.test(txt + csv), 'PDF/CSV : aucune mention de la plateforme');
process.exit(ok ? 0 : 1);
