# Profils de plateformes (mode France), v2.63

Les formats d'import, conventions de frais et hypothèses propres à chaque plateforme sont déclarés dans `profiles.js`. Chaque règle porte un statut :
- **source** : écrit par la plateforme dans un document public ;
- **hypothèse** : non confirmée par la plateforme, choisie par Kryptax ;
- **convention** : choix de lecture de Kryptax.

La v2.63 se contente de déplacer des constantes déjà codées en dur : aucun résultat ne change (tests existants et golden identiques). Les modules U.S., U.K., Allemagne, Canada et Australie gardent leurs propres règles.

| Profil | Règle | Statut | Résumé |
|---|---|---|---|
| `revolut-releve` | `valeur-hors-frais` | hypothèse | « Valeur » hors frais : achat = Valeur + Frais ; vente = Valeur, frais déduits une fois. Revolut publie seulement « rate + fee = total cost ». |
| `revolut-releve` | `frais-eur-seulement` | convention | Lignes en $ : frais comptés à part. |
| `revolut-releve` | `heures-utc` | convention | Heures du relevé lues en UTC. |
| `revolut-releve` | `echange-meme-seconde` | hypothèse | Vente + achat à la même seconde : à confirmer (v2.62). |
| `revolut-x` | `taker-0-09` | hypothèse | 0,09 % prélevés en nature sur l'actif reçu (le relevé affiche 0,00 $). Taux non vérifié sur une grille Revolut X. |
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
