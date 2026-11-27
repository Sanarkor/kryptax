# France : frais du relevé PDF Revolut (v2.66)

Document d'aide au calcul, pas un conseil fiscal.

## v2.66 : l'achat est vérifié sur un relevé réel
Le relevé PDF commence par un **« Résumé du compte »** : pour chaque actif, quantité à l'ouverture, **montant sortant, montant entrant** et quantité à la fermeture. Kryptax compare déjà ces soldes aux siens (« Soldes de clôture : relevé PDF vs calculés »).

Sur un relevé réel, l'hypothèse v2.59 (« Valeur hors frais », quantité non réduite) laissait **20 actifs sur 25 en écart**. Exemple (montants fictifs, même forme que le relevé réel, vérifiée au huitième chiffre) :
- ligne `Achat` : 1 000 jetons, Valeur 40,00 €, Frais 4,00 € ;
- montant entrant du résumé : **900** = 1 000 × (1 − 4 / 40).

La quantité affichée est donc brute (Valeur ÷ Prix) et les frais sont prélevés **sur la crypto** : vous payez la Valeur (40 €), frais compris. Le journal en devises du même relevé le confirme pour les lignes « … X » : « Achat de … » débité exactement la Valeur de la ligne, et non Valeur + Frais.

Règles depuis la v2.66 (relevé PDF uniquement) :
- **Achat** : prix d'acquisition (l. 220) = **Valeur** ; quantité = quantité affichée × (1 − Frais / Valeur). C'était déjà la règle avant la v2.59.
- **Lignes « … X »** (en € **et en $**) : 0,09 % prélevés en nature (`revolut-x`), montant payé ou reçu = Valeur, aucun frais ajouté ou déduit en plus. Avant, les lignes en $ ajoutaient les frais au coût sans réduire la quantité. Les 5 achats d'un même jeton puis sa vente totale ne retombaient à 0 qu'avec ces 0,09 %.
- **Vente (hors « … X »)** : prix de cession (l. 213) = Valeur, frais déduits une fois (l. 214). **C'est toujours une hypothèse** (v2.59) : aucun relevé lu ne contient de vente en € avec sa ligne « Vente de » qui permettrait de la vérifier.
- Échanges (même seconde, types EXCH) : la jambe d'entrée est créditée nette des frais, comme un achat (soldes du résumé retrouvés).

Avec ces règles, les écarts de soldes du relevé réel ne sont plus que des arrondis (frais affichés au centime), que le bouton « Ajouter des lignes d'ajustement » aligne.

Effet : la ligne 220 ne compte plus deux fois les frais d'achat (environ 2 à 6 % des petits achats dans l'application), et les quantités détenues (ligne 212) ne sont plus surestimées.

## Sources
- CGI art. 150 VH bis, III-A : « Le prix de cession est réduit, sur justificatifs, des frais supportés par le cédant à l'occasion de cette cession. »
- CGI art. 150 VH bis, III-B : « somme des prix effectivement acquittés » ; ici, la Valeur débitée.
- BOFiP BOI-RPPM-PVBMC-30-20-20190902 §50 et notice 2086 : les frais « ne viennent pas en diminution du prix de cession pour la détermination du quotient ».

Tests : `node testprofiles.js` (relevé fictif de même forme : résumé du compte retrouvé), `node test.js` (cas calculés à la main).
