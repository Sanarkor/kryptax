// Pub vidéo FICTIVE avant l’aperçu du PDF : visuels neutres (dégradés + texte, aucune photo). Aucune régie : à remplacer plus tard.
var AD_VIDEO_S = 15; // durée totale de la pub, en secondes
var AD_SKIP_S = 5;   // délai avant « Passer la pub », en secondes
(function () {
  'use strict';
  function slide(a, b, t1, t2) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 960"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient></defs>' +
      '<rect width="540" height="960" fill="#070b14"/><rect x="30" y="30" width="480" height="900" rx="36" fill="url(#g)" opacity=".9"/>' +
      '<text x="270" y="450" text-anchor="middle" font-family="system-ui,sans-serif" font-size="52" font-weight="800" fill="#fff">' + t1 + '</text>' +
      '<text x="270" y="520" text-anchor="middle" font-family="system-ui,sans-serif" font-size="28" fill="#e0f2fe">' + t2 + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  window.KryptaxAd = { videoS: AD_VIDEO_S, skipS: AD_SKIP_S,
    slides: [slide('#1d4ed8', '#0891b2', 'Espace publicitaire', 'Exemple fictif'), slide('#0f766e', '#2563eb', 'Votre annonce ici', 'Exemple fictif')] };
})();
