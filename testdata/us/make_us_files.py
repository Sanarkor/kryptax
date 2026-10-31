# Generates FICTITIOUS U.S.A. test files: python3 testdata/us/make_us_files.py
import datetime, openpyxl
from reportlab.pdfgen import canvas
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Notes'; ws.append(['Fictitious account export (test data)'])
s = wb.create_sheet('History'); s.append(['Fictitious statement']); s.append([])
s.append(['Date', 'Type', 'Asset', 'Quantity', 'Price (USD)', 'Total (USD)', 'Fee (USD)', 'Received Asset', 'Received Quantity'])
D = datetime.datetime
for r in [[D(2024,1,10), 'Buy', 'BTC', 1, None, 30000, 50, None, None], [D(2025,1,11), 'Sell', 'BTC', 0.5, None, 35000, 25, None, None],
          ['06/01/2025', 'Buy', 'ETH', 10, 2000, None, 10, None, None], [D(2025,7,1,14,30), 'Convert', 'ETH', 5, None, 12000, 12, 'SOL', 80]]: s.append(r)
import base64, io
buf = io.BytesIO(); wb.save(buf)  # stored as base64 text (the repo is pushed as text only)
open('testdata/us/us_fictif.xlsx.b64', 'w').write(base64.encodebytes(buf.getvalue()).decode())
c = canvas.Canvas('testdata/us/us_fictif.pdf', pageCompression=0, invariant=1)
L = ['Fictitious Exchange - Account statement (TEST DATA)', 'Period 01/01/2024 - 12/31/2025', 'Date Type Asset Quantity Total Fee',
     '01/10/2024 Buy BTC 1 $30,000.00 $50.00', '01/11/2025 Sell BTC 0.5 $35,000.00 $25.00', '07/01/2025 Convert BTC 0.25 $15,000.00 $10.00 -> 4 ETH', 'Page 1 of 2']
y = 800
for l in L: c.drawString(40, y, l); y -= 20
c.showPage(); c.drawString(40, 800, '11/01/2025 Staking reward ETH 0.1 $250.00'); c.drawString(40, 780, '12/01/2025 Sell ETH 2 7000,00 EUR'); c.save()
c = canvas.Canvas('testdata/us/us_inconnu_fictif.pdf', pageCompression=0, invariant=1); c.drawString(40, 800, 'Fictitious letter - nothing to import'); c.save()
# keep the PDFs pure ASCII (same length, offsets unchanged): the binary comment line becomes 'x'
for f in ['testdata/us/us_fictif.pdf', 'testdata/us/us_inconnu_fictif.pdf']:
    b = open(f, 'rb').read(); open(f, 'wb').write(bytes(c if c < 128 else 120 for c in b))
# the connector pushes text files only: keep them as .pdf.txt (still valid PDFs)
import os
for f in ['testdata/us/us_fictif.pdf', 'testdata/us/us_inconnu_fictif.pdf']: os.replace(f, f + '.txt')
