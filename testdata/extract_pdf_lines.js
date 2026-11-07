// Extrait les lignes de testdata/binance_fictif.pdf avec pdf.js + itemsToLines (même chemin que l'appli) -> testdata/binance_fictif.pdf.txt
// Nécessite pdfjs-dist (hors repo) : PDFJS=/chemin/pdfjs-dist/legacy/build/pdf.js node testdata/extract_pdf_lines.js
const pdfjs = require(process.env.PDFJS || 'pdfjs-dist/legacy/build/pdf.js'), P = require('../pipeline.js'), fs = require('fs');
(async () => { const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(__dirname + '/binance_fictif.pdf')), isEvalSupported: false }).promise; let L = [];
  for (let i = 1; i <= doc.numPages; i++) L = L.concat(P.itemsToLines((await (await doc.getPage(i)).getTextContent()).items));
  fs.writeFileSync(__dirname + '/binance_fictif.pdf.txt', L.join('\n') + '\n'); console.log(L.length + ' lines, ' + doc.numPages + ' pages'); })();
