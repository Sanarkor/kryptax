# Canada — règles appliquées (v2.53, bêta)

Feuille de calcul **estimative** pour un particulier canadien, crypto détenue **à titre de capital**. Ce n'est pas un formulaire officiel ni un conseil fiscal. Aucun impôt fédéral ou provincial n'est calculé.

## Sources lues (le 08/11/2026, heure de Paris)
- Loi de l'impôt sur le revenu, al. 38a) : taux d'inclusion « ½ » (Justice Laws, à jour au 2026-10-19, dernière modification 2026-06-18).
- ARC, « Capital losses » : « The inclusion rate for 2025 is 50% » ; tableau « From 2001 to 2025 | 1/2 ». La hausse à 2/3 a été annulée le 21/03/2025.
- ARC, Annexe 3 2025 : section « Crypto-assets ». 2024 : rubrique « Bonds, debentures, promissory notes, crypto-assets… » (conseil fiscal ARC du 22/10/2024). Ligne 12700 = gain en capital imposable.
- ARC, Folio S5-F4-C1 ¶1.4 : conversion au taux de la Banque du Canada du jour (ou du jour coté précédent).
- ARC, guide sur la crypto et pages sur les pertes apparentes (fenêtre de 30 jours avant et après, bien encore détenu le 30e jour, personnes affiliées).
- API Valet de la Banque du Canada : `https://www.bankofcanada.ca/valet/observations/FX{DEV}CAD/json`.

## Ce que le calcul fait
- PBR = **moyenne pondérée globale** par actif identique, tous fichiers et plateformes confondus, en CAD, ordre chronologique.
- Gain = produit − PBR − dépenses de disposition. Un échange crypto→crypto = disposition + acquisition à la même valeur.
- Taux d'inclusion 1/2 pour 2024 et 2025. Pour 2026, 1/2 selon l'al. 38a) en vigueur, avec la mention « à vérifier ».
- Année civile, dates dans le fuseau canadien choisi (automatique : fuseau du fichier s'il est canadien, sinon celui du navigateur s'il est canadien, sinon Toronto). Le fuseau du fichier (ex. Binance UTC+1) est distinct du fuseau fiscal. Les décalages explicites sont respectés. Les dates sans heure ne sont pas décalées.
- Devises : USD, EUR… convertis au taux de la Banque du Canada (au plus 7 jours avant). Sans taux : ligne exclue et listée. On ne suppose jamais USD = CAD ni stablecoin = monnaie. Un « $ » seul est ambigu : ligne exclue. Une colonne sans devise est supposée en CAD, avec un avertissement.
- Coût ou acquisition manquant : jamais mis à 0. La disposition est « à vérifier » et sort des totaux.
- Récompenses (staking, minage, airdrop) : ajoutées au PBR à leur valeur si elle est connue, sinon coût inconnu. Revenu ou capital : **à examiner**.

## Pertes apparentes (limite volontaire)
Une perte est **« à examiner »** et sortie du total définitif quand le même actif a été acquis dans les 30 jours avant ou après et est encore détenu au 30e jour, ou quand le fichier ne couvre pas ces 30 jours. On ne calcule **ni refus partiel ni ajout au PBR**. Les achats du conjoint ou de sociétés affiliées sont invisibles : un avertissement est affiché.

## Non couvert
Activité d'entreprise, revenu de minage ou de staking professionnel, pertes d'autres années, report rétrospectif, autres biens, impôt fédéral et provincial, règles du Québec (TP-1), cours de crypto manquants (non recherchés). Si le fuseau est changé après validation, il faut revalider pour recalculer les jours de change.

## Exemple calculé à la main (testca.js, test 1)
- Achats : 1 BTC à 10 000 $ + 50 $ de frais, puis 1 BTC à 20 000 $. PBR = 30 050 / 2 = 15 025 $/BTC.
- Vente de 0,5 BTC pour 12 000 $ avec 20 $ de frais : PBR 7 512,50 $, gain 4 467,50 $.
- Échange de 0,5 BTC contre 10 ETH, valeur 9 000 $, frais 10 $ : gain 1 477,50 $. Les ETH coûtent 9 000 $.
- Vente de 5 ETH pour 3 000 $ : PBR 4 500 $, perte 1 500 $.
- Totaux 2025 : gains 5 945 $, pertes 1 500 $, net 4 445 $, imposable (1/2) 2 222,50 $.
