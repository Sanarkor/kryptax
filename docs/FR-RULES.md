# Kryptax France : taux, origine des cours et limites (v2.49, zzn)

Document d'aide au calcul, pas un conseil fiscal ni un justificatif officiel.

## Taux indicatif du PFU par année de cession (table unique `FR_RATES` dans `export.js`)

| Année de cession | Impôt (art. 200 A CGI) | Prélèvements sociaux | Total |
|---|---|---|---|
| 2024 et avant | 12,8 % | 17,2 % (CSG 9,2 %) | 30 % |
| 2025 | 12,8 % | 18,6 % (CSG 10,6 %) | 31,4 % |
| 2026 | 12,8 % | 18,6 % | 31,4 % |

L'écran (`app.js`) et le PDF lisent tous les deux `X.frRate(année)` / `X.impot()` : plus de taux écrit en dur à deux endroits.
Sources consultées le 07/11/2026 :
- Loi n° 2025-1403 du 30 décembre 2025 (LFSS 2026), art. 12-II-1° : CSG 10,6 % « à compter de l'imposition des revenus de l'année 2025 » pour les revenus du patrimoine (art. L136-6 CSS).
- Brochure IR 2026, Nouveautés : https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/nouveautes.pdf
- https://www.impots.gouv.fr/particulier/questions/comment-declarer-les-plus-ou-moins-values-sur-cessions-dactifs-numeriques (PFU 31,4 % = 12,8 % + 18,6 %).
- https://www.service-public.gouv.fr/particuliers/vosdroits/F2329 (vérifié le 30 juin 2026 selon la page).
- BOI-RPPM-PVBMC-30-30-20240423 (30 %, antérieur à la LFSS 2026).

Non calculés : CEHR / CDHR, option pour le barème progressif (case 3CN). Une nouvelle loi = une ligne `{ from: année, ... }` dans `FR_RATES` ; `test.js` et `testsecu.js` figent 2024, 2025 et 2026.

## Récompenses (staking, airdrops, intérêts)

Aucune règle modifiée. Quand des récompenses sont valorisées 0 € (aucun cours connu) ou quand l'option « coût 0 € » est choisie, un avertissement court et visible apparaît sous le résultat, et une phrase est ajoutée au PDF : leur éventuelle imposition à la réception n'est pas calculée par Kryptax, à examiner. Kryptax n'affirme pas de régime (BNC ou autre).

## Annexe « origine des cours (ligne 212) » du PDF

Une ligne par actif, avec le nombre de valorisations par méthode, en fin de PDF (nouvelle page seulement si la place manque, 40 actifs au plus) :
- prix de la cession elle-même (relevé) pour l'actif vendu ;
- cours saisi par vous, ou valeur globale 212 saisie ;
- cours à la seconde / minute / horaire / journalier avec la source enregistrée (Binance, OKX, Bitget, Coinbase, Bitstamp, CoinGecko…), l'écart « ±N min » quand le cours minute vient d'une minute voisine, et « à N h de l'heure demandée » pour un cours horaire voisin ;
- estimé : prix d'une de vos opérations (moins ou plus de 30 jours), ou cours déjà téléchargé le plus proche ;
- aucun cours trouvé, compté 0 € ;
- « origine non enregistrée » quand la métadonnée manque (ancien cache, etc.) : rien n'est inventé.

La date demandée est celle de la cession (heure de Paris). L'heure exacte du cours renvoyé n'est connue que par ces écarts ; elle n'est pas reconstituée. Ces métadonnées n'ont aucun effet sur les montants (`testsecu.js` le vérifie).

## Sécurité des imports

`esc()` échappe `& < > " '` (FR, US, UK, DE). Les CSV exportés (US, UK, DE) préfixent d'une apostrophe un texte commençant par `=`, `+`, `@` ou `-` non numérique (formule tableur), montants inchangés. Tests : `node testsecu.js` (fixtures fictives), `node testpdf.mjs` (relevé PDF fictif lu avec le pdf.js embarqué, sans dépendance npm), tous deux dans `npm test`.
