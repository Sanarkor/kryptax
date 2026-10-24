# Génère testdata/releve_fictif.pdf (données FICTIVES) : python3 testdata/make_pdf.py  puis  node testpdf.mjs
from reportlab.pdfgen import canvas
c=canvas.Canvas('testdata/releve_fictif.pdf')
L=['Relevé crypto (FICTIF)','Période 1 mai 2026 - 31 juil. 2026','Résumé du compte','0 AAA 50,4 AAA','0 BBB 4,991 BBB','0 CCC 4,97512415 CCC','Symbole Type Quantité Prix Valeur Frais Date',
'AAA Achat 100,5 3,00€ 301,50€ 1,00€ 20 mai 2026, 10:00:00',
'AAA Vendre - Revolut X 50 3,20$ 160,00$ 0,10$ 21 mai 2026, 10:00:00',
'BBB Acheter - Revolut X 10 15,80$ 158,00$ 0,10$ 21 mai 2026, 10:00:00',
'BBB Vente 5 16,00€ 80,00€ 0,80€ 21 juil. 2026, 11:00:00',
'CCC Récompense Apprendre 4,97512415 15 juil. 2026, 12:15:37','Page 1 sur 2']
y=800
for l in L: c.drawString(40,y,l); y-=20
c.showPage(); c.drawString(40,800,'Relevé EUR (FICTIF)')
c.drawString(40,780,'21 juil. 2026, 11:00:00 Transfer from Revolut Digital Assets Europe Ltd - Vente de BBB 79,20€ 79,20€'); c.save()
