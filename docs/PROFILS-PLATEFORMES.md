# Profils de plateformes (mode France), v2.63

Les formats d'import, conventions de frais et hypothèses propres à chaque plateforme sont déclarés dans `profiles.js`. Chaque règle porte un statut :
- **source** : écrit par la plateforme dans un document public ;
- **constat** : vérifié sur les soldes d'un relevé réel (pas une source publiée) ;
- **hypothèse** : non confirmée par la plateforme, choisie par Kryptax ;
- **convention** : choix de lecture de Kryptax.

La v2.63 se contente de déplacer des constantes déjà codées en dur : aucun résultat ne change (tests existants et golden identiques). Les modules U.S., U.K., Allemagne, Canada et Australie gardent leurs propres règles.

| Profil | Règle | Statut | Résumé |
|---|---|---|---|
| `revolut-releve` | `achat-frais-inclus` | constat | v2.66 : à l'achat, « Valeur » frais inclus (220 = Valeur) ; quantité créditée = quantité affichée × (1 − Frais / Valeur). Seule lecture qui retrouve les quantités entrantes du « Résumé du compte » d'un relevé réel. Remplace l'hypothèse v2.59 « Valeur hors frais » pour l'achat. |
| `revolut-releve` | `vente-frais-deduits` | hypothèse | Vente (hors « … X ») : 213 = Valeur, frais déduits une fois (214). Pas encore vérifiable : aucune vente en € avec sa ligne « Vente de » dans un relevé lu. |
| `revolut-releve` | `frais-eur-seulement` | convention | Lignes en $ (hors « … X ») : frais comptés à part. |
| `revolut-releve` | `heures-utc` | convention | Heures du relevé lues en UTC. |
| `revolut-releve` | `echange-meme-seconde` | hypothèse | v2.65 : même seconde, même relevé, correspondance unique, valeur ±8 % et journal en devises présent **sans** ligne « Vente de / Achat de » pour les deux jambes : échange reconnu sans question. Ligne « Vente de / Achat de » à ±2 s : vente ou achat en €, pas un échange. Autres cas (pas de journal, 1–5 s, plusieurs correspondances) : à confirmer. (v2.62 demandait toujours confirmation : 19 échanges d'un relevé réel devenaient des cessions provisoires.) |
| `revolut-x` | `taker-0-09` | hypothèse | 0,09 % prélevés en nature sur l'actif reçu, lignes en € **et en $** (v2.66) ; montant payé ou reçu = Valeur (journal en devises). Taux non publié sur une grille lue ; cohérent avec les soldes d'un relevé réel. |
| `revolut-tableaux` | `frais-colonne` | convention | Tableaux à date en tête : frais comptés comme un CSV. |
| `csv-generique` | `colonne-frais` | convention | Colonne de frais présente : comptée (l. 220 / l. 214). |
| `csv-generique` | `releve-sans-frais` | convention | « Relevé » sans colonne de frais : frais en nature. |
| `binance` | `heure-locale` | convention | « Time » dans le fuseau indiqué, converti en UTC, sinon UTC signalé. |
| `binance` | `jambes-1-2-s` | convention | Jambes d'une même opération à 1-2 s regroupées. |
| `binance` | `frais-explicites` | convention | Frais comptés explicitement. |
| `kraken` | `codes-actifs` | convention | XXBT → BTC, XETH → ETH, ZEUR → EUR ; suffixes .S/.M/.F/.P. |
| `kraken` | `frais-explicites` | convention | Frais comptés explicitement. |
| `coinbase` | `frais-explicites` | convention | Frais comptés explicitement. |
| `bitpanda` | `frais-explicites` | convention | Frais comptés explicitement. |

Tests : `node testprofiles.js` (un bloc par profil, fichiers fictifs).
