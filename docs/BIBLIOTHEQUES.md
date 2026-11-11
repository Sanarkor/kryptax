# Bibliothèques embarquées (v2.64)

Chargées depuis le dépôt, jamais depuis un CDN. Les empreintes SHA-256 sont vérifiées par `testlibs.js` (CI, 4 fuseaux) : le test échoue si un fichier ne correspond plus à son empreinte, si un fichier est absent, si la version lue dans le fichier change, ou si une bibliothèque `*.min.js` non déclarée apparaît. Référence lisible par machine : `testdata/libs.json`.

| Fichier | Bibliothèque | Version | Licence | Octets | SHA-256 |
|---|---|---|---|---|---|
| `jspdf.umd.min.js` | [jsPDF](https://github.com/parallax/jsPDF) | 2.5.1 | MIT | 364463 | `98ccf17aa10c20bb1301762618fcc9b6ab3a4e7f26b6071d64d0b41154df3875` |
| `jspdf.plugin.autotable.min.js` | [jsPDF-AutoTable](https://github.com/simonbengtsson/jsPDF-AutoTable) | 3.8.2 | MIT | 38976 | `27a9c3b61843c6312b87f142d40fe77c0f0f054c9f3cdeccc4bfd5f3322859c8` |
| `pdf.min.js` | [PDF.js (pdfjs-dist)](https://github.com/mozilla/pdf.js) | 3.11.174 | Apache-2.0 | 320004 | `5b5799e6f8c680663207ac5b42ee14eed2a406fa7af48f50c154f0c0b1566946` |
| `pdf.worker.min.js` | [PDF.js worker (pdfjs-dist)](https://github.com/mozilla/pdf.js) | 3.11.174 | Apache-2.0 | 1087212 | `feabdf309770ed24bba31a5467836cdc8cf639c705af27d52b585b041bb8527b` |
| `xlsx.mini.min.js` | [SheetJS (xlsx, build mini)](https://sheetjs.com) | 0.20.3 | Apache-2.0 | 279523 | `0cb353f830d7288385492c83d277b058ddeac664ca51cf1393aa1fd3e2b70939` |

Pour mettre à jour : remplacer le fichier, recalculer `sha256sum`, puis modifier ce tableau et `testdata/libs.json` dans le même commit.
