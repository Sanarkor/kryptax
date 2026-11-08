# France : frais du relevé PDF Revolut (v2.59, zzx)

**C'est une hypothèse, pas une confirmation.** Revolut publie seulement « rate + fee = total cost » (grille de frais crypto). Il ne dit pas si la colonne « Valeur » du relevé est brute ou nette des frais. Kryptax retient désormais « Valeur hors frais » pour les achats et les ventes EUR du relevé PDF (`feeExcl`). Pour revenir en arrière, il suffit de faire un revert du commit.

## Ce qui change (lignes Achat/Vente EUR du relevé PDF uniquement)
- **Achat** : le prix d'acquisition (l. 220) devient Valeur + Frais. La quantité n'est plus réduite des frais.
- **Vente** : prix de cession (l. 213) = Valeur brute ; frais (l. 214) déduits une fois ; l. 218 = 213 − 214.
- **Quotient** : prix de cession brut (l. 213, ou 217 s'il y a une soulte) divisé par la valeur globale (l. 212). La formule globale est inchangée.

## Ce qui ne change pas
- Plateforme X : frais taker de 0,09 % prélevés en nature.
- Échanges détectés (une vente et un achat dans la même seconde, types EXCH) : traitement inchangé, aucun frais ajouté deux fois, aucune cession.
- Relevé en $ : déjà compté à part.
- CSV et Excel avec une colonne de frais, Binance, et autres sources « en nature » : inchangés.
- Autres pays : inchangés.

## Sources
- CGI art. 150 VH bis, III-A : « Le prix de cession est réduit, sur justificatifs, des frais supportés par le cédant à l'occasion de cette cession. »
- CGI art. 150 VH bis, III-B : « somme des prix effectivement acquittés ». Les frais d'achat n'y sont pas cités : on les compte généralement dans le prix acquitté, sans texte explicite.
- BOFiP BOI-RPPM-PVBMC-30-20-20190902 §50 et notice 2086 : les frais « ne viennent pas en diminution du prix de cession pour la détermination du quotient ».

## Message affiché à l'utilisateur
Un seul avertissement (« Relevé Revolut : hypothèse… ») s'affiche dans « points à vérifier », plus une ligne de convention dans le PDF exporté.
