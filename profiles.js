/* Kryptax — profils de plateformes (mode France) : formats d'import, conventions de frais et HYPOTHÈSES, déclarés en un seul endroit.
   v2.63 : simple déplacement de constantes déjà codées en dur (aucun résultat changé). Chaque règle porte un statut :
   - 'source'      : écrit par la plateforme (document public cité) ;
   - 'hypothèse'   : hypothèse NON CONFIRMÉE par la plateforme, choisie par Kryptax, réversible ;
   - 'convention'  : choix de lecture de Kryptax (format de fichier), sans enjeu de source externe.
   Les modules U.S., U.K., Allemagne, Canada et Australie ont leurs propres règles (non concernés). Documentation : docs/PROFILS-PLATEFORMES.md. */
(function (root) {
  'use strict';
  const PROFILES = [
    { id: 'revolut-releve', platform: 'Revolut', label: 'Relevé PDF crypto Revolut (lignes Achat/Vente en euros)', files: ['pdf'],
      import: { platform: 'Relevé', feeInKind: true, feeInKindEurOnly: true, feeExcl: true, dmode: 'DMY', nmode: 'FR', tz: 'UTC' },
      rules: [
        { key: 'valeur-hors-frais', status: 'hypothèse', since: 'v2.59', text: 'La colonne « Valeur » est hors frais : à l’achat, prix d’acquisition = Valeur + Frais ; à la vente, prix de cession = Valeur, frais déduits une fois (l. 214). Quantité non réduite.', source: 'Revolut publie seulement « rate + fee = total cost » (grille des frais crypto) ; la colonne Valeur du relevé n’est pas décrite.' },
        { key: 'frais-eur-seulement', status: 'convention', since: 'v2.36', text: 'Lignes en $ : frais comptés à part (l. 214 / l. 220) comme un CSV ; seules les lignes en € suivent la convention du relevé.' },
        { key: 'heures-utc', status: 'convention', text: 'Heures du relevé lues en UTC.' },
        { key: 'echange-meme-seconde', status: 'hypothèse', since: 'v2.62', text: 'Vente + achat à la même seconde : rapprochement à confirmer par l’utilisateur (jamais une preuve).' }] },
    { id: 'revolut-x', platform: 'Revolut X', label: 'Lignes « Acheter/Vendre - … X » du relevé Revolut', files: ['pdf'],
      match: { rawType: /^(acheter|vendre)\s*-\s*\S.*\sx\s*$/i }, takerRate: 0.0009,
      rules: [
        { key: 'taker-0-09', status: 'hypothèse', text: 'Frais « taker » de 0,09 % prélevés en nature sur l’actif reçu (le relevé affiche 0,00 $ car il arrondit au centime).', source: 'Taux non vérifié sur une grille Revolut X lue par Kryptax : à confirmer.' }] },
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
  const STATUS = { source: 'source publiée', 'hypothèse': 'hypothèse non confirmée', convention: 'convention de lecture Kryptax' };
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
