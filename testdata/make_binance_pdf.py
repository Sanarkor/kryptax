# Génère testdata/binance_fictif.pdf (données ENTIÈREMENT FICTIVES, même contenu que testdata/formats/binance_history_fictif.csv) :
#   python3 testdata/make_binance_pdf.py   puis (pdfjs-dist en Node, hors repo)   PDFJS=... node testdata/extract_pdf_lines.js
# Mise en page « Transaction History » : bandeau avec Period(UTC+1), un texte par colonne, en-têtes répétés à chaque page, numéro de page.
from reportlab.pdfgen import canvas
import csv
rows=list(csv.reader(open('testdata/formats/binance_history_fictif.csv')))
head,body=rows[0],[r for r in rows[1:] if r]
X=[30,110,240,300,470,520,570]
c=canvas.Canvas('testdata/binance_fictif.pdf',pageCompression=0,invariant=1,pagesize=(842,595))
per=7; pages=[body[i:i+per] for i in range(0,len(body),per)]
for n,pg in enumerate(pages):
    c.setFont('Helvetica',8); c.drawString(700,575,'www.binance.com'); c.drawString(760,565,'Page %d/%d'%(n+1,len(pages)))
    y=540
    if n==0:
        c.setFont('Helvetica',14); c.drawString(30,y,'Transaction History'); y-=24; c.setFont('Helvetica',8)
        c.drawString(30,y,'Name:'); c.drawString(300,y,'Address:'); y-=14
        c.drawString(30,y,'User ID: 1'); c.drawString(300,y,'Period(UTC+1): 2025-01-01 to 2025-12-31'); y-=14
        c.drawString(30,y,'Email: test@example.invalid'); y-=24
    for x,h in zip(X,head): c.drawString(x,y,h)
    y-=16
    for r in pg:
        for x,v in zip(X,r):
            if v: c.drawString(x,y,v)
        y-=16
    c.showPage()
c.save()
