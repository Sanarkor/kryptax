/* Kryptax — profils de plateformes (mode France) : formats d'import, conventions de frais et HYPOTHÈSES, déclarés en un seul endroit.
   v2.63 : simple déplacement de constantes déjà codées en dur (aucun résultat changé). Chaque règle porte un statut :
   - 'source'      : écrit par la plateforme (document public cité) ;
   - 'constat'     : vérifié sur les soldes d'un relevé réel (pas une source publiée) ;
   - 'hypothèse'   : hypothèse NON CONFIRMÉE par la plateforme, choisie par Kryptax, réversible ;
   - 'convention'  : choix de lecture de Kryptax (format de fichier), sans enjeu de source externe.
   Les modules U.S., U.K., Allemagne, Canada et Australie ont leurs propres règles (non concernés). Documentation : docs/PROFILS-PLATEFORMES.md. */
(function (root) {
  'use strict';
  const PROFILES = [
    { id: 'revolut-releve', platform: 'Revolut', label: 'Relevé PDF crypto Revolut (lignes Achat/Vente en euros)', files: ['pdf'],
      import: { platform: 'Relevé', feeInKind: true, feeInKindEurOnly: true, feeExcl: true, dmode: 'DMY', nmode: 'FR', tz: 'UTC' },
      rules: [
        { key: 'achat-frais-inclus', status: 'constat', since: 'v2.66', text: 'Achat : la colonne « Valeur » inclut les frais (prix d’acquisition = Valeur) ; quantité créditée = quantité affichée × (1 − Frais / Valeur).', source: 'Constaté sur un relevé réel : les quantités entrantes du « Résumé du compte » ne sont retrouvées qu’ainsi (forme : 1 000 affichés pour 40 € dont 4 € de frais → 900 crédités = 1 000 × (1 − 4 / 40)) ; le journal en devises débite la Valeur, pas Valeur + Frais. Remplace l’hypothèse v2.59 « Valeur hors frais » pour l’achat.' },
        { key: 'vente-frais-deduits', status: 'hypothèse', since: 'v2.59', text: 'Vente (hors lignes « … X ») : prix de cession = Valeur, frais déduits une fois (l. 214).', source: 'Revolut publie seulement « rate + fee = total cost » ; aucun relevé lu par Kryptax ne contient encore de vente en € avec sa ligne « Vente de » pour le vérifier.' },
        { key: 'frais-eur-seulement', status: 'convention', since: 'v2.36', text: 'Lignes en $ (hors « … X ») : frais comptés à part (l. 214 / l. 220) comme un CSV ; seules les lignes en € suivent la convention du relevé.' },
        { key: 'heures-utc', status: 'convention', text: 'Heures du relevé lues en UTC.' },
        { key: 'echange-meme-seconde', status: 'hypothèse', since: 'v2.65', text: 'Vente + achat d’une autre crypto à la même seconde, dans le même relevé, correspondance unique, valeur à ±8 %, et journal en devises du relevé présent SANS ligne « Vente de / Achat de » pour ces deux opérations : échange reconnu sans question (comme avant v2.62). Une ligne « Vente de / Achat de » à ±2 s : vente ou achat en euros, jamais un échange. Sans journal en devises, à 1–5 s d’écart ou avec plusieurs correspondances : à confirmer par l’utilisateur.', source: 'Constat sur relevés Revolut : chaque vente vers € a sa ligne « Vente de » dans le journal en devises ; les conversions crypto→crypto n’en ont pas. Non confirmé par une documentation Revolut.' }] },
    { id: 'revolut-x', platform: 'Revolut X', label: 'Lignes « Acheter/Vendre - … X » du relevé Revolut', files: ['pdf'],
      match: { rawType: /^(acheter|vendre)\s*-\s*\S.*\sx\s*$/i }, takerRate: 0.0009,
      rules: [
        { key: 'taker-0-09', status: 'hypothèse', text: 'Frais « taker » de 0,09 % prélevés en nature sur l’actif reçu, lignes en € et en $ (le relevé affiche 0,00 $ car il arrondit au centime) ; montant payé ou reçu = Valeur.', source: 'Taux non publié sur une grille lue par Kryptax ; cohérent avec un relevé réel (v2.66 : 5 achats en $ puis vente totale soldés à 0 seulement avec 0,09 % en nature ; journal : montant débité ou crédité = Valeur). À confirmer.' }] },
    { id: 'revolut-tableaux', platform: 'Revolut', label: 'Relevé PDF : tableaux à date en tête (frais en colonne séparée)', files: ['pdf'],
      import: { platform: 'Relevé', feeInKind: false, dmode: 'DMY', tz: 'UTC', strict: true },
      rules: [{ key: 'frais-colonne', status: 'convention', since: 'v2.33', text: 'Frais en colonne séparée comptés comme un CSV (ajoutés à l’achat, déduits à la vente).' }] },
    { id: 'csv-generique', platform: 'Autre (CSV / Excel)', label: 'Tableur générique (colonnes choisies à l’import)', files: ['csv', 'xlsx'],
      rules: [
        { key: 'colonne-frais', status: 'convention', text: 'Colonne de frais présente : frais comptés (l. 220 à l’achat, l. 214 à la vente).' },
        { key: 'releve-sans-frais', status: 'convention', text: 'Plateforme « Relevé » sans colonne de frais : règle du relevé inchangée (frais en nature).' }] },
    { id: 'binance', platform: 'Binance', label: 'Binance (historique des transactions, trades, Convert ; CSV, Excel, PDF)', formats: ['binance', 'binance-trades', 'binance-trades-old', 'binance-convert'],
      import: { feeInKind: false },
      rules: [
        { key: 'heure-locale', status: 'convention', since: 'v2.40', text: 'Colonne « Time » : heure du fuseau indiqué dans le fichier (« UTC+1 »), convertie en UTC ; sinon lue en UTC et signalée.' },
        { key: 'jambes-1-2-s', status: 'convention', since: 'v2.40', text: 'Jambes d’une même opération à 1-2 s d’écart regroupées.' },
        { key: 'frais-explicites', status: 'convention', text: 'Frais du fichier comptés explicitement (pas en nature).' }] },
    { id: 'kraken', platform: 'Kraken', label: 'Kraken (ledgers, trades)', formats: ['kraken-ledgers', 'kraken-trades'], import: { feeInKind: false },
      rules: [{ key: 'codes-actifs', status: 'convention', text: 'Codes XXBT → BTC, XETH → ETH, ZEUR → EUR ; suffixes .S/.M/.F/.P gérés.' }, { key: 'frais-explicites', status: 'convention', text: 'Frais du fichier comptés explicitement.' }] },
    { id: 'coinbase', platform: 'Coinbase', label: 'Coinbase (historique des transactions)', formats: ['coinbase'], import: { feeInKind: false },
      rules: [{ key: 'frais-explicites', status: 'convention', text: 'Frais du fichier comptés explicitement.' }] },
    { id: 'bitpanda', platform: 'Bitpanda', label: 'Bitpanda (historique des transactions)', formats: ['bitpanda'], import: { feeInKind: false },
      rules: [{ key: 'frais-explicites', status: 'convention', text: 'Frais du fichier comptés explicitement.' }] }
  ];
  const STATUS = { source: 'source publiée', constat: 'constaté sur un relevé réel (soldes du résumé)', 'hypothèse': 'hypothèse non confirmée', convention: 'convention de lecture Kryptax' };
  const byId = id => PROFILES.find(p => p.id === id) || null;
  const forFormat = fid => PROFILES.find(p => (p.formats || []).includes(fid)) || null;
  /* Options d'import d'un profil (copie : jamais modifiée par l'appelant), complétées par o. */
  const importOpts = (id, o) => Object.assign({}, (byId(id) || {}).import || {}, o || {});
  const X = byId('revolut-x');
  /* Frais en nature de Revolut X : taux du profil si le libellé correspond, sinon null. */
  const xTaker = rawType => X.match.rawType.test(rawType || '') ? X.takerRate : null;
  const hypotheses = () => PROFILES.flatMap(p => p.rules.filter(r => r.status === 'hypothèse').map(r => Object.assign({ profile: p.id, platform: p.platform }, r)));
  const api = { PROFILES, STATUS, byId, forFormat, importOpts, xTaker, hypotheses };
  if (typeof module !== 'undefined') module.exports = api; else root.KryptaxProfiles = api;
})(this);
