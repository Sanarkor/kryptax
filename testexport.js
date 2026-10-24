// node testexport.js — génère le PDF avec les bibliothèques embarquées (jeu FICTIF) et compte les cessions (pdftotext requis)
global.window = global; global.navigator = { userAgent: 'node' };
const { jsPDF } = require('./jspdf.umd.min.js'); const at = require('./jspdf.plugin.autotable.min.js'); if (at.applyPlugin) at.applyPlugin(jsPDF);
const E = require('./engine.js'), X = require('./export.js'), fs = require('fs'), T = require('./testdata/fake_many.js')();
const P = (a) => ({ AAA: 6, BBB: 7, CCC: 8, DDD: 9, EEE: 10 })[a];
const r = E.compute(T, P), Y = E.byYear(r), S = {}; for (const y in Y) S[y] = E.summary(T, r, P, +y);
const x = X.exportData(Y, S, s => [['Plus-values', 'Net', '', s.net]], T);
fs.writeFileSync('/tmp/kryptax-test.pdf', Buffer.from(X.makePdf(jsPDF, x, 'Test').output('arraybuffer')));
const txt = require('child_process').execSync('pdftotext -layout /tmp/kryptax-test.pdf -').toString();
const n = txt.split('\n').filter(l => /^\s*2026\s+\d+\s+\d\d\/\d\d\/2026/.test(l)).length;
console.log((n === 18 ? 'OK  ' : 'ÉCHEC ') + 'PDF : ' + n + ' lignes de cession (attendu 18), pages ' + (txt.match(/Page \d+ \/ \d+/g) || []).length);
process.exit(n === 18 ? 0 : 1);
