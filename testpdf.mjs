// node testpdf.mjs — lit le PDF FICTIF testdata/releve_fictif.pdf avec le pdf.js embarqué (pdf.min.js + worker), sans dépendance npm. PDFJS=... pour un autre build.
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const pdfjs = require(process.env.PDFJS || './pdf.min.js'); const fs = require('fs');
if (!process.env.PDFJS) pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.js', import.meta.url).pathname;
const E = require('./engine.js'), P = require('./pipeline.js');
const doc = await pdfjs.getDocument({ verbosity: 0, isEvalSupported: false, data: new Uint8Array(fs.readFileSync(new URL('./testdata/releve_fictif.pdf', import.meta.url))) }).promise;
let lines = []; for (let i = 1; i <= doc.numPages; i++) lines = lines.concat(P.itemsToLines((await (await doc.getPage(i)).getTextContent()).items));
const r = P.parsePdfLines(lines); let n = 0;
const { txs } = P.importRows(r.rows, { asset: 0, type: 1, qty: 2, price: 3, eur: 4, fee: 5, date: 6 }, { platform: 'Relevé', feeInKind: true, feeInKindEurOnly: true, dmode: 'DMY', nmode: 'FR', tz: 'UTC' } /* mêmes options que app.js */, () => 'p' + n++);
const ok = r.rows.length === 5 && r.fiat.length === 1 && txs[0].qty === 100.5 && txs[1].fxPending && txs[4].type === 'INTEREST' && E.detectSwaps(txs).pending.length === 1 && E.crossCheck(txs, E.parseFiatSales(r.fiat.join('\n'))).confirmed.length === 1;
console.log(ok ? 'OK  PDF fictif (5 lignes, 1 ligne fiat, 1 échange à confirmer, contre-vérification)' : 'ÉCHEC PDF fictif ' + JSON.stringify(r).slice(0, 400), ok ? '' : txs.map(t => t.asset + ' ' + t.type + ' ' + t.qty)); process.exit(ok ? 0 : 1);
