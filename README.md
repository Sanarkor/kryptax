# Kryptax

Kryptax aide à remplir le **formulaire 2086** (plus-values de cession d'actifs numériques) pour la **fiscalité française uniquement** : art. 150 VH bis du CGI, imposition forfaitaire de **12,8 %** (art. 200 C du CGI), BOI-RPPM-PVBMC-30.

Gratuit, open-source et anonyme : gardez le contrôle total de vos données.

En ligne : https://sanarkor.github.io/kryptax/

> ⚠️ **Kryptax est un outil gratuit et open-source d'aide au calcul du formulaire 2086. Il ne constitue en aucun cas un conseil fiscal, financier ou juridique officiel. L'utilisateur demeure seul responsable de la vérification de ses données et de sa déclaration auprès de l'administration fiscale.**

Licence : [MIT](LICENSE) — logiciel fourni « tel quel », sans garantie.

## Fonctionnement 100 % dans le navigateur
- Page statique hébergée sur GitHub Pages : **aucun compte, aucune clé API, aucun serveur Kryptax**.
- Vos relevés sont lus dans le navigateur ; **leur contenu n'est jamais envoyé** (ni montants, ni quantités, ni nom).
- Les seules requêtes sortantes demandent des **cours publics** (symbole de la crypto + horodatage). La CSP (`connect-src`) les limite à : Binance (api.binance.com, data-api.binance.vision), Gate.io, OKX, DefiLlama (coins.llama.fi), Bitget, Bitstamp, Crypto.com, Coinbase Exchange, Kraken, CoinGecko, GeckoTerminal et Frankfurter (taux BCE USD→EUR).
- Bibliothèques incluses localement, sans CDN : pdf.js, SheetJS (lecture Excel), jsPDF et jspdf-autotable. Pas d'outil de mesure d'audience.

## Formats d'import
- **PDF** (relevé de compte, lu avec pdf.js), **CSV** et **Excel .xlsx**.
- Les colonnes sont devinées (date, type, crypto, quantité, prix, valeur, frais) et vérifiables dans un aperçu ; formats de date (JJ/MM ou MM/JJ) et de nombre réglables.
- Un CSV « Envoyé / Reçu » de type outil de suivi est aussi reconnu. Un fichier dont les colonnes sont incohérentes est refusé avec un message clair.
- Plusieurs fichiers peuvent être importés ; on peut aussi ajouter des opérations à la main.

## Calcul
- Pour chaque cession : **224 = 218 − 223 × 217 / 212**, avec 223 = 220 − 221 − 222. Le prix total d'acquisition (220) cumule les achats en euros, frais inclus ; après chaque cession, la fraction de capital initial s'ajoute à la ligne 221.
- La valeur globale du portefeuille (212) est reconstruite à la date de chaque cession à partir des quantités détenues et des cours.
- **Seuil de 305 €** : si le total des cessions de l'année ne dépasse pas 305 €, rien n'est imposable.
- **Échanges crypto→crypto non imposables** : une vente et un achat d'une autre crypto à quelques secondes d'intervalle et de valeur proche sont appariés en échange. Seules les conversions en euros et les paiements en crypto sont des cessions.
- Cours à la minute (bougies 1 min), à la seconde quand c'est disponible, mis en cache. Un cours approché est marqué **≈**. Un cours introuvable laisse la cession « à renseigner ».
- Récompenses (staking, airdrop, intérêts) sans cours : comptées à **0 €**, signalées discrètement.
- Dates des relevés en UTC ; affichage et année fiscale en heure de Paris.

## Export PDF
- Export **uniquement en PDF** : une synthèse, un tableau des cessions avec les colonnes 211 à 224 et une ligne GLOBAL, et le report sur la 2042-C.
- Après le calcul : « Voir mon formulaire », puis directement un **aperçu plein écran** et le bouton « Enregistrer le PDF ».
- Nom du fichier : `kryptax-formulaire-2086-<année>-sur-<année de déclaration>-<JJ>-<MM>-<AAAA>-<HH>-<MM>.pdf` (heure de Paris).

## Confidentialité et stockage local
Rien n'est envoyé, mais le navigateur **conserve en localStorage, sans limite de durée** :
- les transactions importées et les saisies manuelles (`kryptax.tx`, `kryptax.manual`) ;
- les soldes et états d'ouverture (`kryptax.balances`, `kryptax.opening`), les opérations en monnaie classique (`kryptax.fiat`) ;
- **le nom du titulaire** lu dans les relevés (`kryptax.holders`) ;
- le cache des cours (`kryptax.prices2`, `kryptax.binsyms`).

Le bouton « Tout réinitialiser » efface ces données. Sur un ordinateur partagé, pensez à l'utiliser.

Les fournisseurs de cours voient, comme pour tout site, votre **adresse IP**, l'origine de la page, et les symboles et horodatages demandés : ils peuvent donc déduire quelles cryptos vous détenez et quand vous avez vendu, mais pas les montants.

## Limites
- Outil d'aide : vérifiez les résultats. Un outil comme Koinly peut servir de **repère de comparaison**, pas de vérité absolue.
- Soultes (216, 222) non gérées automatiquement (0 par défaut).
- Fiscalité des récompenses (BNC, BIC…) non calculée.
- La ligne 212 doit inclure tous vos portefeuilles : importez tous vos relevés.
- N'oubliez pas le formulaire **3916-bis** pour chaque compte ouvert à l'étranger.
- France uniquement ; pas de mode hors ligne.

## Structure du code
| Fichier | Rôle |
|---|---|
| `index.html`, `style.css` | Page, CSP, interface (largeur mobile 360 px) |
| `app.js` | Interface, import, progression, popup et aperçu |
| `formats.js`, `ids.js` | Reconnaissance des formats et des colonnes |
| `pipeline.js` | Récupération des cours (cascade de fournisseurs, cache) |
| `engine.js` | Calcul 2086 (lignes 211 à 224, seuil, totaux) |
| `export.js` | Génération du PDF |
| `testdata/` | Jeux de données **fictifs** |

## Tests
```
node test.js && node testformats.js && node testexport.js
```
`testexport.js` utilise `pdftotext` et `pdftoppm` (poppler-utils).

## Contribuer
Ouvrez une issue ou une pull request sur https://github.com/Sanarkor/kryptax. N'ajoutez **jamais de données réelles** (relevés, noms, montants) : uniquement des jeux fictifs. Lancez les tests avant de proposer une modification.

## Licence
Code sous licence MIT (voir [LICENSE](LICENSE)). Les bibliothèques incluses gardent leur propre licence (pdf.js et SheetJS : Apache 2.0 ; jsPDF : MIT).
