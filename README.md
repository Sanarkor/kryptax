# Kryptax

Aide au calcul des plus-values crypto, **100 % dans le navigateur**. Le pays se choisit en haut de la page.

| Pays | Statut | Langues | Ce que Kryptax prépare | Règles et sources |
|---|---|---|---|---|
| France | version principale | français | formulaire **2086** (art. 150 VH bis CGI), report 2042-C | [docs/FR-RULES.md](docs/FR-RULES.md) |
| U.S.A. | **bêta** | anglais | Form 8949 / Schedule D (estimation) | [docs/US-RULES.md](docs/US-RULES.md) |
| Royaume-Uni | **bêta** | anglais | gains (pooling, règles same-day / 30 jours) | [docs/UK-RULES.md](docs/UK-RULES.md) |
| Allemagne | **bêta** | allemand, anglais | § 23 EStG (délai d'un an, FIFO) | [docs/DE-RULES.md](docs/DE-RULES.md) |
| Canada | **bêta** | français, anglais | gains en capital (PBR moyen, perte apparente) | [docs/CA-RULES.md](docs/CA-RULES.md) |
| Australie | **bêta** | anglais | CGT (estimation) | [docs/AU-RULES.md](docs/AU-RULES.md) |

En bêta, les modes sont moins testés que la version française et chaque chiffre doit être vérifié (un bandeau « Bêta » le rappelle).

En ligne : https://sanarkor.github.io/kryptax/

> ⚠️ **Kryptax est un outil gratuit, à code source disponible, d'aide au calcul. Il ne constitue en aucun cas, dans aucun pays, un conseil fiscal, financier ou juridique officiel. L'utilisateur demeure seul responsable de la vérification de ses données et de sa déclaration auprès de l'administration fiscale.**

Licence : [PolyForm Noncommercial 1.0.0](LICENSE). Logiciel fourni « tel quel », sans garantie.

## Fonctionnement 100 % dans le navigateur
- Page statique hébergée sur GitHub Pages : **aucun compte, aucune clé API, aucun serveur Kryptax**.
- Vos relevés sont lus dans le navigateur, et **leur contenu n'est jamais envoyé** (ni montants, ni quantités, ni nom).
- Seules des requêtes de **cours ou de taux publics** sortent (symbole et horodatage), vers les hôtes autorisés par la CSP (`connect-src` dans `index.html`) : plateformes publiques de cours en mode France, taux de change officiels pour les autres pays (Banque du Canada, BCE, etc. ; voir les docs de chaque pays).
- Les bibliothèques sont incluses localement, sans CDN. Versions et empreintes SHA-256 : [docs/BIBLIOTHEQUES.md](docs/BIBLIOTHEQUES.md), vérifiées par la CI (`testlibs.js`). Pas d'outil de mesure d'audience.

## Hypothèses et profils de plateformes
Les conventions propres à chaque plateforme (formats d'import, frais, hypothèses non confirmées comme la « Valeur hors frais » du relevé Revolut ou les frais de 0,09 % de Revolut X) sont déclarées avec leur statut dans [docs/PROFILS-PLATEFORMES.md](docs/PROFILS-PLATEFORMES.md) (`profiles.js`). Les échanges crypto→crypto détectés seulement par l'heure et la valeur sont **à confirmer** par l'utilisateur ; un rapprochement n'est jamais considéré comme non imposable sans preuve ou confirmation.

## Mode FRANCE

### Formats d'import
- **PDF** (relevé de compte, lu avec pdf.js), **CSV** et **Excel .xlsx**.
- Les colonnes sont devinées (date, type, crypto, quantité, prix, valeur, frais) et vérifiables dans un aperçu ; formats de date (JJ/MM ou MM/JJ) et de nombre réglables.
- Un CSV « Envoyé / Reçu » de type outil de suivi est aussi reconnu. Un fichier dont les colonnes sont incohérentes est refusé avec un message clair.
- Plusieurs fichiers peuvent être importés ; on peut aussi ajouter des opérations à la main.

### Calcul
- Pour chaque cession : **224 = 218 − 223 × 217 / 212**, avec 223 = 220 − 221 − 222. Le prix total d'acquisition (220) cumule les achats en euros, frais inclus ; après chaque cession, la fraction de capital initial s'ajoute à la ligne 221.
- La valeur globale du portefeuille (212) est reconstruite à la date de chaque cession à partir des quantités détenues et des cours.
- **Seuil de 305 €** : si le total des cessions de l'année ne dépasse pas 305 €, rien n'est imposable.
- **Échanges crypto→crypto non imposables** : une vente et un achat d'une autre crypto à 5 s près et de valeur proche (±8 %) sont proposés comme rapprochement **à confirmer**. Sans confirmation ni preuve (même identifiant d'ordre), le calcul les compte comme vente + achat et l'export PDF est bloqué.
- Cours à la minute (bougies 1 min), à la seconde quand c'est disponible, mis en cache. Un cours approché est marqué **≈**. Un cours introuvable laisse la cession « à renseigner ».
- Récompenses (staking, airdrop, intérêts) sans cours : comptées à **0 €**, signalées discrètement.
- Dates des relevés en UTC ; affichage et année fiscale en heure de Paris.

### Export PDF
- Export **uniquement en PDF** : une synthèse, un tableau des cessions avec les colonnes 211 à 224 et une ligne GLOBAL, et le report sur la 2042-C.
- Après le calcul : « Voir mon formulaire », puis directement un **aperçu plein écran** et le bouton « Enregistrer le PDF ».
- Nom du fichier : `kryptax-formulaire-2086-<année>-sur-<année de déclaration>-<JJ>-<MM>-<AAAA>-<HH>-<MM>.pdf` (heure de Paris).
- État au 31/12 (.json) : `kryptax-etat-<date de l’état>_<AAAA>-<MM>-<JJ>_<HH>-<mm>.json` (date et heure locales de l’export, à la minute).

## Mode U.S.A.
- **Import** : CSV, Excel .xlsx ou PDF (au mieux). Colonnes : Date, Type (Buy, Sell, Convert, Send / Receive), Asset, Quantity, Total ou Price, Fee (USD) ; colonne Wallet facultative. Export « Trades » d'une plateforme reconnu. Fuseau horaire du fichier réglable ; les dates suffixées UTC, GMT, Z ou +00:00 sont lues en UTC.
- **Convention Total / frais** : Total = montant hors frais. Achat : coût = Total + Fee ; vente : produit = Total − Fee.
- **Calcul** : court terme si détenu 1 an ou moins, long terme au-delà ; revenus (staking, airdrops, intérêts) listés à part ; lignes sans coût ou sans valeur « à vérifier », hors totaux. Pas de calcul d'impôt, pas de wash sale, pas d'impôts d'État.
- **Exports** : PDF (tableaux Form 8949 et Schedule D sur une page à part), CSV lisible par un tableur et Excel (.xlsx).

## Confidentialité et stockage local
Rien n'est envoyé. Par défaut, le navigateur **conserve en localStorage, sans limite de durée** les données qui évitent de tout réimporter :
- transactions, saisies, choix d'échanges, soldes et états (`kryptax.*`) ;
- **le nom du titulaire** lu dans les relevés (`kryptax.holders`) ;
- le cache des cours ;
- les préférences : pays, langue, thème (`kx-*`).

En haut de page, dans les 6 pays (FR / EN / DE) :
- **« Ne rien mémoriser »** : pendant la session, rien n'est écrit dans localStorage, sessionStorage ou IndexedDB. Tout reste en mémoire vive et disparaît à la fermeture de la page. Seule la préférence elle-même (`kx-nostore`) est enregistrée. À l'activation, Kryptax propose d'effacer ce qui est déjà stocké (confirmation demandée).
- **« Effacer mes données »** : supprime toutes les clés Kryptax (`kryptax.*`, `kx-*`) de ce navigateur, sans toucher aux données d'autres sites. Pensez-y sur un ordinateur partagé.

Les fournisseurs de cours voient, comme pour tout site, votre **adresse IP**, l'origine de la page, ainsi que les symboles et horodatages demandés. Ils peuvent donc déduire quelles cryptos vous détenez et quand vous avez vendu, mais pas les montants.

## Limites
- Outil d'aide : vérifiez les résultats.
- Soultes (216, 222) non gérées automatiquement (0 par défaut).
- Fiscalité des récompenses (BNC, BIC…) non calculée.
- La ligne 212 doit inclure tous vos portefeuilles : importez tous vos relevés.
- N'oubliez pas le formulaire **3916-bis** pour chaque compte ouvert à l'étranger.
- Mode U.S.A. : estimation à vérifier, non couverte par les points ci-dessus propres au 2086 ; voir les limites dans [docs/US-RULES.md](docs/US-RULES.md).
- Pas de mode hors ligne.

## Structure du code
| Fichier | Rôle |
|---|---|
| `index.html`, `style.css` | Page, CSP, interface (largeur mobile 360 px) |
| `app.js` | Interface, import, progression, popup et aperçu |
| `formats.js`, `ids.js` | Reconnaissance des formats et des colonnes |
| `pipeline.js` | Récupération des cours (cascade de fournisseurs, cache) |
| `engine.js` | Calcul 2086 (lignes 211 à 224, seuil, totaux) |
| `export.js` | Génération du PDF |
| `us-engine.js` | Mode U.S.A. : import, lots FIFO/HIFO, Form 8949, Schedule D, CSV et Excel, interface |
| `us-export.js` | Mode U.S.A. : PDF Form 8949 et Schedule D |
| `uk-engine.js`, `de-engine.js`, `ca-engine.js`, `au-engine.js` | Modes Royaume-Uni, Allemagne, Canada, Australie (bêta) |
| `profiles.js` | Profils de plateformes (frais, hypothèses) |
| `privacy.js` | « Ne rien mémoriser » et « Effacer mes données » |
| `docs/*-RULES.md` | Règles appliquées et sources, par pays |
| `testdata/` | Jeux de données **fictifs** |

## Tests
```
npm test
```
Tous les tests (6 pays, profils, échanges, confidentialité, empreintes des bibliothèques). `testprivacy.js` utilise jsdom (installé à part : `npm i -g jsdom`, ou `JSDOM_PATH`).
`npm run test:tz` lance les tests sous 4 fuseaux horaires.
`testexport.js` utilise `pdftotext` et `pdftoppm` (poppler-utils).

## Contribuer
Ouvrez une issue ou une pull request sur https://github.com/Sanarkor/kryptax. N'ajoutez **jamais de données réelles** (relevés, noms, montants) : uniquement des jeux fictifs. Lancez les tests avant de proposer une modification.

## Licence
Code source disponible sous licence PolyForm Noncommercial 1.0.0 (voir [LICENSE](LICENSE)) : utilisation, copie et modification gratuites pour un usage non commercial ; tout usage commercial est exclu sans accord écrit de l'auteur. Droits d'auteur conservés par Damien K. Metzler (Copyright 2026). Les bibliothèques incluses gardent leur propre licence (pdf.js et SheetJS : Apache 2.0 ; jsPDF : MIT).
