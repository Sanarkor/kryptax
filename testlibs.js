// node testlibs.js — v2.64 : bibliothèques embarquées = fichiers déclarés (version + SHA-256) dans testdata/libs.json et docs/BIBLIOTHEQUES.md.
const fs = require('fs'), crypto = require('crypto'), D = JSON.parse(fs.readFileSync(__dirname + '/testdata/libs.json', 'utf8')).libs, MD = fs.readFileSync(__dirname + '/docs/BIBLIOTHEQUES.md', 'utf8');
let ok = true, n = 0; const chk = (c, m) => { n++; ok = ok && !!c; console.log((c ? 'OK  ' : 'ÉCHEC ') + m); };
const VER = { 'jspdf.umd.min.js': /\.version="([\d.]+)"/, 'jspdf.plugin.autotable.min.js': /AutoTable plugin v([\d.]+)/, 'pdf.min.js': /const version="([\d.]+)"/, 'pdf.worker.min.js': /"(3\.\d+\.\d+)"/, 'xlsx.mini.min.js': /e\.version="([\d.]+)"/ };
for (const l of D) {
  const p = __dirname + '/' + l.file, ex = fs.existsSync(p), b = ex ? fs.readFileSync(p) : Buffer.alloc(0), h = crypto.createHash('sha256').update(b).digest('hex'), v = ex && VER[l.file] && (b.toString('latin1').match(VER[l.file]) || [])[1];
  chk(ex && h === l.sha256 && b.length === l.bytes, l.file + ' : SHA-256 ' + (h === l.sha256 ? 'conforme' : 'DIFFÉRENTE (' + h + ')'));
  chk(v === l.version, l.file + ' : version lue ' + v + ' = déclarée ' + l.version);
  chk(MD.includes('`' + l.file + '`') && MD.includes(l.sha256) && MD.includes('| ' + l.version + ' |'), l.file + ' : documentée dans docs/BIBLIOTHEQUES.md');
}
const mins = fs.readdirSync(__dirname).filter(f => /\.min\.js$/.test(f)).sort(), decl = D.map(l => l.file).sort();
chk(JSON.stringify(mins) === JSON.stringify(decl), 'Aucune bibliothèque .min.js non déclarée (' + mins.length + ' fichiers)');
const I = fs.readFileSync(__dirname + '/index.html', 'utf8'); chk(!/<script[^>]+src="https?:/.test(I), 'Aucun script chargé depuis un CDN');
console.log(ok ? 'testlibs : tout est OK (' + n + ')' : 'testlibs : ÉCHEC'); process.exit(ok ? 0 : 1);
