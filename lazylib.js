/* Kryptax — bibliothèques lourdes chargées à la demande (v2.68) : lecteur Excel, lecteur PDF, générateur PDF.
   Avant : ~1 Mo de JavaScript lu à chaque visite. Mode France : chaque bibliothèque n'est chargée qu'au premier import
   ou export qui en a besoin. Pages U.S.A., U.K., Allemagne, Canada, Australie : tout est préchargé dès que la page
   s'affiche (leurs moteurs testent la présence des bibliothèques de façon synchrone). Fichiers locaux (script-src 'self'). */
(function (root) {
  'use strict';
  const SRC = { xlsx: ['xlsx.mini.min.js'], pdfjs: ['pdf.min.js'], jspdf: ['jspdf.umd.min.js', 'jspdf.plugin.autotable.min.js'] };
  const P = {};
  const one = src => new Promise((res, rej) => {
    const s = root.document.createElement('script'); s.src = src; s.async = false;
    s.onload = () => res(); s.onerror = () => { s.remove(); rej(new Error('Chargement impossible : ' + src)); };
    root.document.head.appendChild(s);
  });
  /* Promesse résolue quand la bibliothèque est utilisable ; un échec (réseau) peut être retenté. */
  function load(name) {
    if (!SRC[name]) return Promise.reject(new Error('Bibliothèque inconnue : ' + name));
    if (!P[name]) P[name] = SRC[name].reduce((p, s) => p.then(() => one(s)), Promise.resolve()).catch(e => { delete P[name]; throw e; });
    return P[name];
  }
  const preload = () => Promise.all(Object.keys(SRC).map(n => load(n).catch(() => {})));
  /* Pages étrangères : préchargement dès qu'une section .usmode est visible (au démarrage ou au changement de pays). */
  function watch() {
    const S = [...root.document.querySelectorAll('section.usmode')], vis = () => S.some(s => !s.hidden);
    if (vis()) return preload();
    const mo = new root.MutationObserver(() => { if (vis()) { mo.disconnect(); preload(); } });
    S.forEach(s => mo.observe(s, { attributes: true, attributeFilter: ['hidden'] }));
  }
  if (root.document) { if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', watch); else watch(); }
  root.KxLib = { load, preload };
})(this);
