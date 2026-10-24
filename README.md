# Kryptax

Page web (GitHub Pages) qui aide à remplir le **formulaire 2086** (plus-values sur actifs numériques) à partir de vos transactions crypto Revolut et d'autres plateformes.

> ⚠️ Outil d'aide au calcul, **pas un conseil fiscal** : vérifiez avec la notice officielle 2086 (impots.gouv.fr).
> 🔒 **Vos données restent dans votre navigateur** : rien n'est envoyé à un serveur. Seuls des cours publics sont demandés : Binance (cours à l'heure), BCE via Frankfurter (taux USD→EUR pour Revolut X), CryptoCompare si vous saisissez une clé gratuite. Les données sont gardées dans le `localStorage` de votre navigateur (bouton « Tout effacer »).

En ligne : https://sanarkor.github.io/kryptax/

## Import PDF (recommandé)
Kryptax lit le **relevé PDF complet** de Revolut directement dans le navigateur avec pdf.js (`pdf.min.js` / `pdf.worker.min.js`, Apache 2.0, inclus localement, aucun CDN, rien n'est envoyé). Il reconnaît les lignes de transactions (`Symbole Type Quantité Prix Valeur Frais Date`, Achat / Vente / Acheter – Revolut X / Vendre – Revolut X, montants en € ou $), les **récompenses** (staking, « Apprendre ») et, dans les relevés EUR/USD/GBP, les lignes « Transfer from Revolut Digital Assets… – **Vente de X** » / « Achat de X ». Les quantités du PDF sont exactes (pas de troncature comme dans l'Excel). Les lignes « Vente de X » servent à la **contre-vérification** : une vente qui y figure est une vraie vente en devise (imposable) ; un échange crypto→crypto n'y figure pas. Les en-têtes et pieds de page sont ignorés. Le type de fichier (PDF, Excel, CSV) est détecté automatiquement.

## Obtenir le relevé Revolut
Application Revolut → onglet **Crypto** → **⋯ / Plus** → **Relevés / Documents** → **Relevé de compte (Account statement)** → période « depuis le début » → format **CSV** de préférence (Kryptax lit aussi l'**Excel .xlsx**, mais Revolut y tronque la colonne Quantité : Kryptax la reconstruit avec Valeur / Prix et signale les lignes douteuses). Prenez l'historique **complet depuis votre premier achat**. (Le chemin exact peut changer selon la version de l'appli.)

Faites de même pour vos **autres plateformes et portefeuilles** : la ligne 212 (valeur globale du portefeuille) doit inclure **tout** ce que vous détenez, où que ce soit.

## Échanges crypto→crypto (détection automatique)
Le relevé Revolut ne dit pas contre quoi une vente a été faite. Mais un échange crypto→crypto (ex. VVV → HYPE) y apparaît comme **deux lignes à la même seconde** : une vente de la crypto donnée et un achat de la crypto reçue, pour une valeur en € presque identique (l'achat est un peu plus bas à cause des frais). Une vente vers des euros n'a pas d'achat simultané.

Kryptax apparie donc, à l'import, chaque vente avec un achat d'une autre crypto **à ≤ 5 secondes** et de **valeur à ±8 %** (un achat ne sert qu'une fois ; la paire la plus proche dans le temps puis en valeur l'emporte). La paire devient « Échange : sortie » + « Échange : entrée » : non imposable, et l'achat ne s'ajoute pas au prix total d'acquisition (220). Un achat quelques dizaines de secondes plus tard reste un achat distinct. Le tableau « Échanges crypto→crypto détectés » permet de **forcer** une paire en vente imposable ; changer le type d'une ligne à la main l'exclut aussi de la détection. Les lignes « Autre » (euros, dollars) restent ignorées.

## Réutiliser un export Coinly
Si vous avez déjà un compte Coinly : exportez l'historique des transactions en CSV (colonnes Date, Sent Amount/Currency, Received Amount/Currency, Fee, Net Worth, Label…). Kryptax reconnaît ce format « Envoyé / Reçu », vous laisse vérifier les colonnes, transforme chaque ligne en achat, vente, échange ou réception, et **reprend les valeurs en € de Coinly comme cours** (moins d'appels d'API). Dans les résultats, la rubrique « Comparer avec le rapport 2086 de Coinly » permet de saisir (ou d'importer en CSV `année;prix de cession;plus-value`) les totaux de votre rapport Coinly et d'afficher les écarts.

## Utilisation
1. **Importer** un ou plusieurs CSV. Kryptax devine les colonnes (Symbol, Type, Quantity, Price, Value, Fees, Date…) : vérifiez-les dans l'aperçu, choisissez le format des dates (JJ/MM ou MM/JJ) et des nombres (1 234,56 ou 1,234.56).
2. **Vérifier les types** ligne par ligne : Achat, Vente (imposable), Paiement en crypto (imposable), Échange crypto→crypto sortie/entrée (non imposable), Staking/Airdrop/Intérêts (à vérifier), Réception/Envoi, Frais, Ignorer. Un échange BTC→ETH = une ligne « sortie » BTC + une ligne « entrée » ETH.
3. **Ajouter à la main** les opérations d'autres plateformes ou portefeuilles.
4. **Calculer** : Kryptax reconstruit vos quantités à chaque cession, récupère les cours historiques (à l'heure, ou à la minute pour les 7 derniers jours), puis remplit les lignes 211 à 224 par cession, la ligne 51 (total des prix de cession, exonération si ≤ 305 €) et la ligne 52 (total), à reporter en **3AN** (plus-value) ou **3BN** (moins-value) de la 2042-C.
5. Si un cours est introuvable (petit jeton), la cession est **« à renseigner »** : saisissez le cours ou directement la valeur globale (ligne 212).
6. **Exporter en CSV** ou **Imprimer / PDF**.

N'oubliez pas le formulaire **3916-bis** pour chaque compte d'actifs numériques ouvert à l'étranger (Revolut, Binance…).

## Méthode (art. 150 VH bis du CGI)
Plus-value = 218 − [223 × (217 / 212)], avec 223 = 220 − 221 − 222. Le prix total d'acquisition (220) cumule les achats en euros (frais inclus) ; après chaque cession, la fraction de capital initial `223 × 217 / 212` s'ajoute à la ligne 221. Les frais réduisent le prix de cession (218) mais pas le quotient 217/212.

Test : `node test.js` reproduit l'exemple de la notice officielle (1 000 € investis ; cession de 450 € pour un portefeuille de 1 200 € → +75 € ; puis cession de 1 300 € → +675 €).

## Limites
- Staking, airdrops, intérêts : comptés à 0 € de coût et signalés « à vérifier », sans trancher leur fiscalité.
- Soultes (216, 222) non gérées automatiquement (0 par défaut).
- Petits jetons absents de Binance : cours le plus proche de vos relevés (±30 j, marqué ≈) ou saisie manuelle.
- Récompenses « Apprendre » sans prix ni valeur : quantité impossible à reconstruire depuis un .xlsx, à corriger à la main (ou valeur 0 si négligeable).
- Lecture Excel : SheetJS (`xlsx.mini.min.js`, Apache 2.0) inclus localement, aucun CDN.

Test PDF : `python3 testdata/make_pdf.py && node testpdf.mjs` (relevé **fictif**, nécessite `reportlab` et `pdfjs-dist@3` en local). Interface : thème sombre ; l'impression du 2086 reste sur fond blanc.

## Cours et robustesse (oct. 2026)
- Une série horaire par actif sur toute la période (Binance data-api → api.binance.com → Coinbase → CoinGecko), un seul appel Frankfurter pour les taux $ (repli Binance EURUSDT). Délai 8 s par requête, 4 en parallèle, bouton Annuler, barre de progression.
- Une erreur réseau n'est jamais mémorisée comme « pas de cours » ; les anciens « NA » du cache sont purgés au chargement.
- Panneau « Sources de prix » : état, nombre d'appels et dernière erreur par source. Sans source joignable : cours observé le plus proche dans vos relevés (≈).
- Frais Revolut prélevés en nature : quantité nette = quantité affichée × (1 − frais/valeur), 0,09 % sur Revolut X ; le prix d'acquisition (220) est la valeur payée, frais inclus.
- Bouton « Tout réinitialiser » : efface toutes les données Kryptax de ce navigateur (transactions, saisies, cache de prix) et recharge la page.
