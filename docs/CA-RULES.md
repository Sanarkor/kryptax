# Canada — règles appliquées (v2.56, bêta)

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

## Pertes apparentes (v2.56)
Sources relues le 08/11/2026 : LIR art. 54 « superficial loss », 40(2)g)(i) (perte refusée), 53(1)f) (ajout au PBR du bien substitué) — Justice Laws, à jour au 2026-10-19 ; ARC « Capital losses » ; méthode administrative de l'ARC pour un rachat partiel (interprétation technique 2004-0073011E5 : perte refusée = min(S, P, B) / S × L ; S vendu, P acquis dans les 61 jours, B détenu à la fin de la période, L perte).
- **Cas simple, calculé** : vos achats visibles dans les fichiers, aucune autre disposition du même actif dans la fenêtre de 61 jours, coûts connus, données couvrant J+30. Part refusée = min(S, P, B) / S × L, non déductible, ajoutée au PBR des unités restantes (ou des unités rachetées après la vente, au moment du rachat, même l'année suivante).
- **Données jusqu'à J+30 absentes** : perte « en attente » (pas perdue), hors totaux ; totaux partiels.
- **Cas complexe** (autre vente dans la fenêtre, coût inconnu) : perte « à examiner », hors totaux, et PBR de l'actif **incertain** ensuite : les ventes suivantes sortent des totaux jusqu'à ce que le solde revienne à zéro. Aucune simulation inventée.
- Achats du conjoint ou de sociétés affiliées : invisibles, avertissement affiché.

## Non couvert
Activité d'entreprise, revenu de minage ou de staking professionnel, pertes d'autres années, report rétrospectif, autres biens, impôt fédéral et provincial, règles du Québec (TP-1), cours de crypto manquants (non recherchés). 

## Exemple calculé à la main (testca.js, test 1)
- Achats : 1 BTC à 10 000 $ + 50 $ de frais, puis 1 BTC à 20 000 $. PBR = 30 050 / 2 = 15 025 $/BTC.
- Vente de 0,5 BTC pour 12 000 $ avec 20 $ de frais : PBR 7 512,50 $, gain 4 467,50 $.
- Échange de 0,5 BTC contre 10 ETH, valeur 9 000 $, frais 10 $ : gain 1 477,50 $. Les ETH coûtent 9 000 $.
- Vente de 5 ETH pour 3 000 $ : PBR 4 500 $, perte 1 500 $.
- Totaux 2025 : gains 5 945 $, pertes 1 500 $, net 4 445 $, imposable (1/2) 2 222,50 $.

## v2.54
- **Langue** : page Canada en français (par défaut) ou en anglais, avec un choix mémorisé dans `kx-ca-lang`, séparé de l'Allemagne. Changer de langue réaffiche seulement : rien n'est relu, recalculé ni redemandé à la Banque du Canada. Les montants sont écrits « CAD » en anglais et dans le PDF ; les dates sont en AAAA-MM-JJ en anglais.
- **CSP** : `connect-src` contient l'origine exacte `https://www.bankofcanada.ca` (sans joker). Le test vérifie désormais aussi les appels des moteurs pays.
- **Fuseaux** : un changement de fuseau (fichier ou fiscal) après validation efface les résultats, les années et les taux, et exige « Valider les imports ». La conversion repart toujours des lignes brutes (pas de double conversion).
- **Excel** : une cellule date est lue comme numéro de série (heure murale du fichier), sans dépendre du fuseau du navigateur. Les calendriers 1904 sont gérés.
- **Colonne « Currency / Devise »** séparée : lue. Un code inconnu fait écarter la ligne.

## Limites restantes
- Les raisons d'exclusion produites par le lecteur Binance partagé (formats.js) sont en anglais dans les deux langues, comme pour les autres pays.
- Le test sur un vrai PDF Binance passe par le texte extrait (fixture partagée), pas par un fichier PDF réel ouvert dans le navigateur.

## v2.56 (audit Canada)
- **Staking / épargne** : Stake, Unstake, Staking lock/unlock/subscription/redemption, Simple Earn subscription/redemption, wrap, bridge = mouvement de vos propres fonds (ni récompense ni vente, pas de double quantité). Ce n'est pas une neutralité fiscale universelle : si le jeton ou le propriétaire change, c'est une disposition à examiner ; les ventes suivantes sont signalées et les totaux marqués partiels. « Staking Rewards » et « Staking » seul (vocabulaire de l'aide) restent des récompenses.
- **Reçu ≠ envoyé** : Gift/Don/Payment/Paiement **reçu** = acquisition (coût = valeur indiquée, sinon inconnu ; revenu possible, à examiner), jamais une disposition. Don envoyé = disposition.
- **Échange avec une monnaie** (Convert CAD → BTC) = achat ; BTC → CAD = vente. Plus de « vente de CAD ».
- **Frais réseau** payés en crypto (Withdrawal fee, Network fee…) : quantité retirée du solde avec sa part de PBR (disposition possible, à examiner). Transfert avec frais en monnaie seulement (quantité crypto inconnue) : PBR incertain ensuite.
- **Date sans heure** : achat et vente du même actif le même jour → ordre inconnu, ventes du jour hors totaux.
- **Doublons entre fichiers** : même ID de transaction = vrai doublon (compté une fois) ; sans ID, lignes identiques gardées et signalées jusqu'au choix « Doublons » / « Opérations distinctes » ; même relevé importé sous un autre nom : ignoré.
- **Excel** : « date seule » décidé par le format de la cellule (sans heure) et une valeur entière ; un format avec heure garde l'heure même à minuit (converti du fuseau du fichier) ; calendrier 1904 géré.
- **Totaux partiels** : écran, CSV et PDF disent « partiels » (ils peuvent monter ou baisser) dès qu'une ligne utile est hors calcul. Le mot « définitif » n'est plus utilisé.
- **CSV** : tout texte commençant par = + - @ (même après des espaces) est préfixé d'une apostrophe ; les vrais nombres restent intacts.
- **Taux 2026** : 1/2 selon l'al. 38a) en vigueur (Justice Laws, à jour au 2026-10-19) ; guide et Annexe 3 2026 de l'ARC non vérifiés : mention « à vérifier » conservée.
- **« $ » seul** (relevés CSV ou PDF) : lignes mises de côté, jamais devinées ; l'utilisateur choisit USD ou CAD si le relevé le précise (ex. section ou compte USD). Sans choix : hors calcul, totaux partiels.
- **Relevé PDF (ancien format, frais à part)** : vente et achat à la même seconde avec les mêmes frais = échange ; frais comptés une fois (moitié vente, moitié achat), comme le mode U.K.
- **Récompense sans aucun montant** dans un relevé PDF (ex. récompenses « Apprendre ») : gardée comme récompense **sans valeur** (coût inconnu, signalé), au lieu d'être écartée.
- Limite connue : la France considère que, dans un relevé en €, la valeur d'un achat inclut déjà les frais ; le Canada (comme le U.K.) ajoute les frais au coût. À confirmer sur un relevé réel avant de changer.
