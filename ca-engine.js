/* Kryptax - module Canada v1 (séparé des modes France, U.S.A., U.K. et Allemagne : engine.js / formats.js / pipeline.js sont seulement LUS).
   Estimation des gains et pertes en capital sur crypto-actifs pour un PARTICULIER qui investit (compte de capital), en dollars canadiens (CAD),
   par année civile. Pas une activité d'entreprise, pas l'impôt final fédéral ou provincial. Pas un conseil fiscal. Sources lues : docs/CA-RULES.md.
   - Disposition : vente, échange contre une autre crypto, achat d'un bien, don (ARC, « Understanding crypto-assets and your tax obligations » ;
     conseil fiscal ARC du 22/10/2024). Transfert entre vos propres portefeuilles : pas une disposition (aucun changement de propriétaire).
   - Gain = produit de disposition - PBR (prix de base rajusté) - dépenses de disposition. PBR = coût moyen pondéré de TOUS les biens identiques
     (même actif), tous portefeuilles confondus (« usually the weighted average cost », ARC 2024).
   - Taux d'inclusion : 1/2 (Loi de l'impôt sur le revenu, art. 38 a), lois-justice à jour au 19/10/2026 ; ARC « Capital losses » : « The inclusion
     rate for 2025 is 50% », tableau « From 2001 to 2025 | 1/2 »). La hausse à 2/3 a été annulée le 21/03/2025 : jamais appliquée ici.
   - Perte apparente (« superficial loss ») : une perte est seulement SIGNALÉE « à examiner » (exclue du total définitif) si le même actif est acquis
     dans les 30 jours avant ou après et encore détenu 30 jours après, ou si le fichier ne couvre pas ces 30 jours. Aucun refus ni ajout au PBR
     n'est calculé automatiquement (ajout au PBR seulement si c'est VOUS qui acquérez le bien substitué ; achats d'une personne affiliée invisibles).
   - Conversion en CAD : taux de la Banque du Canada du jour, ou du jour coté précédent le plus proche (Folio S5-F4-C1, ¶1.4). Sinon : exclu, à vérifier.
   - Récompenses (staking, minage, airdrops) : listées à part, revenu ou capital selon votre situation, à examiner ; jamais un coût de 0 inventé. */
(function (root) {
  'use strict';
  const node = typeof require !== 'undefined' && typeof module !== 'undefined';
  const E = node ? require('./engine.js') : root.KryptaxEngine;
  const KF = node ? require('./formats.js') : root.KryptaxFormats;
  const KP = node ? require('./pipeline.js') : root.KryptaxPipeline;
  const DAY = 864e5, TORONTO = 'America/Toronto';
  /* v2.54 : page Canada en français (défaut) ou en anglais. T = texte affiché ; B = texte gardé avec les données (les deux langues, choisies à l'affichage :
     changer de langue ne relit ni ne recalcule rien). */
  let LANG = 'fr'; const setLang = l => (LANG = l === 'en' ? 'en' : 'fr'), getLang = () => LANG;
  const T = (fr, en) => LANG === 'en' ? en : fr, B = (fr, en) => fr + '\u0001' + en;
  const Lx = v => { const t = String(v == null ? '' : v), i = t.indexOf('\u0001'); return i < 0 ? t : LANG === 'en' ? t.slice(i + 1) : t.slice(0, i); };
  /* Fuseaux du Canada (heure locale pour les dates fiscales). */
  const CA_TZ_EN = { 'America/St_Johns': 'Newfoundland', 'America/Halifax': 'Atlantic', [TORONTO]: 'Eastern (Toronto, Montréal)', 'America/Winnipeg': 'Central (Winnipeg)', 'America/Regina': 'Saskatchewan', 'America/Edmonton': 'Mountain (Edmonton, Calgary)', 'America/Vancouver': 'Pacific (Vancouver)', 'America/Whitehorse': 'Yukon' };
  const CA_TZ = [['America/St_Johns', 'Terre-Neuve'], ['America/Halifax', 'Atlantique'], [TORONTO, "Est (Toronto, Montréal)"], ['America/Winnipeg', 'Centre (Winnipeg)'], ['America/Regina', 'Saskatchewan'], ['America/Edmonton', 'Rocheuses (Edmonton, Calgary)'], ['America/Vancouver', 'Pacifique (Vancouver)'], ['America/Whitehorse', 'Yukon']];
  const CA_ZONES = CA_TZ.map(z => z[0]).concat(['America/Montreal', 'America/Moncton', 'America/Glace_Bay', 'America/Goose_Bay', 'America/Iqaluit', 'America/Rankin_Inlet', 'America/Swift_Current', 'America/Yellowknife', 'America/Dawson_Creek', 'America/Fort_Nelson', 'America/Cambridge_Bay', 'America/Inuvik', 'America/Dawson', 'America/Atikokan', 'America/Creston', 'America/Resolute', 'America/Nipigon', 'America/Thunder_Bay', 'America/Rainy_River', 'America/Pangnirtung', 'America/Blanc-Sablon']);
  const zLabel = z => { const f = CA_TZ.find(x => x[0] === z); return f ? (LANG === 'en' && CA_TZ_EN[z] ? CA_TZ_EN[z] : f[1]) : ''; };
  const tzName = z => { const n = zLabel(z); return (n ? n + ' ' : '') + '(' + z + ')'; };
  /* Zone des dates fiscales : choisie > zone du fichier si canadienne > zone du navigateur si canadienne > Est (Toronto) par défaut. */
  function resolveTaxTz(choice, fileTz, browserTz) {
    if (choice && choice !== 'auto' && CA_ZONES.includes(choice)) return { tz: choice, how: B('choisie', 'chosen') };
    if (CA_ZONES.includes(fileTz)) return { tz: fileTz, how: B('même zone que le fichier', 'same zone as the file') };
    if (CA_ZONES.includes(browserTz)) return { tz: browserTz, how: B('zone de ce navigateur', 'this browser\'s zone') };
    return { tz: TORONTO, how: B('par défaut (Est)', 'default (Eastern)') };
  }
  const COLS = {
    date: ['date', 'time', 'timestamp', 'date (utc)', 'datetime', 'date & time', 'date and time', 'date et heure', 'horodatage'],
    type: ['type', 'side', 'transaction type', 'action', 'opération', 'operation', 'type de transaction'],
    asset: ['asset', 'symbol', 'coin', 'currency', 'crypto', 'token', 'actif', 'jeton', 'symbole', 'cryptomonnaie'],
    qty: ['quantity', 'qty', 'amount', 'units', 'quantité', 'quantite', 'montant crypto', 'unités'],
    price: ['price', 'unit price', 'spot price', 'prix', 'prix unitaire', 'price cad', 'price (cad)', 'prix (cad)'],
    total: ['total', 'value', 'subtotal', 'proceeds', 'total value', 'valeur', 'montant', 'total cad', 'total (cad)', 'valeur (cad)', 'montant (cad)'],
    fee: ['fee', 'fees', 'commission', 'frais', 'fee cad', 'fee (cad)', 'frais (cad)'],
    toAsset: ['received asset', 'to asset', 'asset received', 'buy asset', 'actif reçu', 'actif recu'],
    toQty: ['received quantity', 'to quantity', 'quantity received', 'buy quantity', 'quantité reçue', 'quantite recue']
  };
  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
  const CURS = 'CAD|USD|EUR|GBP|CHF|JPY|AUD|NZD|SEK|NOK|HKD|SGD|CNY|INR|MXN|BRL|ZAR|KRW|TRY|TWD|THB|IDR|MYR|PEN|SAR|VND|RUB';
  const strip = n => n.replace(new RegExp('\\s*\\((?:' + CURS.toLowerCase() + '|\\$|c\\$|ca\\$|us\\$|\u20ac|\u00a3)\\)$|\\s+(?:' + CURS.toLowerCase() + ')$'), '');
  function mapHeader(head) { const h = head.map(x => { const n = norm(x); return Object.values(COLS).some(L => L.includes(n)) ? n : strip(n); }), m = {};
    for (const k in COLS) { const i = h.findIndex(x => COLS[k].includes(x)); if (i > -1) m[k] = i; } return m; }
  /* Devise d'une cellule ou d'un en-tête. « $ » seul est AMBIGU au Canada (CAD ou USD) : jamais deviné. */
  const curOf = v => { const s = String(v == null ? '' : v); if (/\bCAD\b|CA\$|C\$/i.test(s)) return 'CAD'; if (/US\$|\bUSD\b/i.test(s)) return 'USD';
    if (/\u20ac|\bEUR\b/i.test(s)) return 'EUR'; if (/\u00a3|\bGBP\b/i.test(s)) return 'GBP'; const m = new RegExp('\\b(' + CURS + ')\\b', 'i').exec(s); if (m) return m[1].toUpperCase(); if (/\$/.test(s)) return 'AMBIG'; return null; };
  function headCurrency(head) { for (const x of head.map(norm)) if (/^(price|total|value|fee|fees|subtotal|proceeds|prix|valeur|montant|frais)\b/.test(x)) { const c = curOf(x); if (c) return c; } return null; }
  function kind(t) {
    t = norm(t);
    if (/^(purchase of goods|paiement|achat de bien)/.test(t)) return 'SPEND';
    if (/^(buy|purchase|bought|achat|achet)/.test(t)) return 'BUY';
    if (/^(sell|sold|sale|vente|vendu)/.test(t)) return 'SELL';
    if (/airdrop|largage/.test(t)) return 'AIRDROP';
    if (/gift|donat|don\b/.test(t)) return 'GIFT';
    if (/spend|payment|pay /.test(t)) return 'SPEND';
    if (/convert|exchange|swap|trade|échange|echange|conversion/.test(t)) return 'CONVERT';
    if (/mining|minage/.test(t)) return 'MINING';
    if (/stak|reward|interest|income|earn|learn|lending|récompense|recompense|intérêt|interet|jalonnement/.test(t)) return 'INCOME';
    if (/send|sent|withdraw|transfer|receive|deposit|envoi|retrait|transfert|réception|reception|dépôt|depot/.test(t)) return 'TRANSFER';
    return null;
  }
  const num = v => { if (v == null || String(v).trim() === '') return NaN; if (typeof v === 'number') return Math.abs(v);
    const n = E.parseNum(String(v).replace(/US\$|CA\$|C\$|[\u00a3$\u20ac]/g, '').replace(new RegExp('\\b(?:' + CURS + ')\\b', 'gi'), '')); return isFinite(n) ? Math.abs(n) : NaN; };
  /* Dates : ISO (AAAA-MM-JJ) lues directement ; JJ/MM ou MM/JJ décidé pour TOUT le fichier (un jour > 12 tranche), sinon la ligne est écartée (jamais devinée).
     Un décalage explicite (Z, UTC, +01:00, -05:00) donne l'instant exact (tz = 'UTC'). Une date sans heure reste un jour civil (non décalée). */
  const OFF = /(?:\s*(?:UTC|GMT|Z)|\s*(?:UTC|GMT)?\s*([+-])(\d{2}):?(\d{2}))$/i;
  function slashOrder(vals) { let dmy = false, mdy = false; for (const v of vals) { const m = /^\s*(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/.exec(String(v == null ? '' : v)); if (!m) continue; if (+m[1] > 12) dmy = true; if (+m[2] > 12) mdy = true; } return dmy && mdy ? 'BAD' : dmy ? 'DMY' : mdy ? 'MDY' : 'AMB'; }
  function caDate(v, order) {
    if (v instanceof Date) { const w = Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), v.getHours(), v.getMinutes(), v.getSeconds()); return { date: w, dateOnly: !v.getHours() && !v.getMinutes() && !v.getSeconds() }; }
    if (typeof v === 'string' && /^XLSERIAL:/.test(v)) { const w = Math.round((+v.slice(9) - 25569) * 86400) * 1000; return isFinite(w) ? { date: w, dateOnly: w % 86400000 === 0 } : { date: NaN }; } // v2.54 : cellule date Excel = heure murale du fichier, sans le fuseau du navigateur
    if (typeof v === 'number') return { date: NaN };
    let s = String(v == null ? '' : v).trim(); if (!s) return { date: NaN };
    const o = OFF.exec(s); let off = null; if (o) { off = o[1] ? (o[1] === '-' ? -1 : 1) * ((+o[2]) * 60 + (+o[3])) : 0; s = s.slice(0, o.index).trim(); }
    if (/^\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}/.test(s)) { if (order !== 'DMY' && order !== 'MDY') return { date: NaN, amb: true }; }
    const w = E.parseDate(s.replace('T', ' '), order === 'MDY' ? 'MDY' : 'DMY', 'UTC'); if (!isFinite(w)) return { date: NaN };
    const dateOnly = !/\d{1,2}:\d{2}/.test(s);
    if (off != null) return { date: w - off * 6e4, tz: 'UTC', dateOnly: false };
    return { date: w, dateOnly };
  }
  function headerIndex(rows) { for (let i = 0; i < Math.min(25, rows.length); i++) { const m = mapHeader(rows[i] || []); if (['date', 'type', 'asset', 'qty'].every(k => m[k] != null)) return i; } return 0; }
  /* Binance « Transaction History » (lecteur partagé formats.js) : montants dans leur devise d'origine (convertis en CAD avec la Banque du Canada),
     échanges entre jetons et récompenses sans valeur dans le fichier : valeur manquante, à vérifier (jamais devinée). Heures : instant UTC si le fichier donne son décalage. */
  function fromBinance(BL) {
    const out = { txs: [], skipped: BL.skipped.slice(), missingCols: [], currency: null, platform: BL.platform, tzNote: BL.tzNote, binance: true }, noVal = [];
    for (const e of BL.events) {
      const t = { line: e.line, date: e.date, type: e.type, rawType: e.rawType, asset: e.asset, qty: e.qty, amt: NaN, feeAmt: 0, cur: 'CAD', toAsset: e.toAsset || '', toQty: e.toQty || NaN };
      if (e.tz) t.tz = e.tz;
      if (e.type === 'BUY' || e.type === 'SELL' || e.type === 'SPEND') { t.amt = e.amt; t.cur = e.cur; t.feeAmt = e.feeAmt || e.feeCurAmt || 0;
        if (e.type === 'BUY' && e.feeQty > 0) { t.qty = Math.max(0, e.qty - e.feeQty); out.skipped.push({ line: e.line, why: B('frais payés dans le jeton acheté : quantité reçue nette des frais, frais non ajoutés au coût', 'fee paid in the token bought: quantity received net of the fee, fee not added to the cost'), kept: true }); } }
      else if (e.type !== 'TRANSFER') noVal.push(e.line);
      if (t.qty > 0) push(out, t);
    }
    noVal.forEach(l => out.skipped.push({ line: l, why: B('pas de valeur dans le fichier Binance (échange entre jetons ou récompense) : valeur manquante, à vérifier', 'no value in the Binance file (token swap or reward): value missing, to verify'), kept: true }));
    if (!BL.tz) out.skipped.push({ line: 'fichier', why: B('fuseau non indiqué dans le fichier Binance : heures lues dans la zone choisie pour le fichier', 'time zone not stated in the Binance file: times read in the zone chosen for the file'), kept: true });
    out.txs.sort((a, b) => a.date - b.date || String(a.line).localeCompare(String(b.line), undefined, { numeric: true }));
    return out;
  }
  function parseRows(rows, name) {
    { const B = KF.binanceLedger && KF.binanceLedger(rows, name); if (B) return fromBinance(B); }
    const hi = headerIndex(rows), head = rows[hi] || [], m = mapHeader(head), out = { txs: [], skipped: [], missingCols: ['date', 'type', 'asset', 'qty'].filter(k => m[k] == null), currency: headCurrency(head) };
    if (out.missingCols.length) return out;
    const body = rows.slice(hi + 1), order = slashOrder(body.map(r => r[m.date])); out.dateOrder = order;
    // v2.54 : colonne séparée « Currency / Devise » (monnaie du montant) quand l'actif a sa propre colonne ; code inconnu = ligne écartée
    const fc = head.findIndex((x, i) => i !== m.asset && ['currency', 'devise', 'fiat', 'fiat currency', 'quote currency', 'native currency', 'monnaie'].includes(norm(x)));
    let assumed = 0;
    body.forEach((r, i) => {
      const g = k => m[k] == null ? '' : r[m[k]], line = hi + i + 2;
      if (!r.some(x => String(x).trim() !== '')) return;
      const type = kind(g('type')), D = caDate(g('date'), order), asset = String(g('asset') || '').trim().toUpperCase(), qty = num(g('qty'));
      if (!type || !isFinite(D.date) || !asset || !(qty > 0)) { out.skipped.push({ line, why: !type ? B('type inconnu', 'unknown type') : D.amb ? B('date ambiguë (JJ/MM ou MM/JJ) : indiquez la date au format AAAA-MM-JJ', 'ambiguous date (DD/MM or MM/DD): use the YYYY-MM-DD format') : !isFinite(D.date) ? B('date illisible', 'unreadable date') : B('actif ou quantité manquant', 'missing asset or quantity') }); return; }
      const cs = [...new Set(['price', 'total', 'fee'].map(k => curOf(g(k))).filter(Boolean))];
      if (cs.length > 1) { out.skipped.push({ line, why: B('devises différentes dans la ligne, à vérifier', 'different currencies in the line, to verify') }); return; }
      let fcur = ''; if (fc >= 0) { const v = String(r[fc] == null ? '' : r[fc]).trim().toUpperCase(); if (v) { fcur = new RegExp('^(?:' + CURS + ')$').test(v) ? v : curOf(v) || ''; if (!fcur) { out.skipped.push({ line, why: B('devise « ' + v.slice(0, 12) + ' » non reconnue, à vérifier', 'currency "' + v.slice(0, 12) + '" not recognised, to verify') }); return; } } }
      if (fcur && cs.length && cs[0] !== fcur) { out.skipped.push({ line, why: B('devises différentes dans la ligne, à vérifier', 'different currencies in the line, to verify') }); return; }
      let cur = cs[0] || fcur || out.currency; if (!cur) { cur = 'CAD'; assumed++; }
      if (cur === 'AMBIG') { out.skipped.push({ line, why: B('symbole « $ » seul : CAD ou USD ? Précisez la devise dans l\'en-tête (ex. Total (CAD))', '"$" alone: CAD or USD? State the currency in the header (e.g. Total (CAD))') }); return; }
      const price = num(g('price')), total0 = num(g('total')), fee = num(g('fee'));
      const t = { line, date: D.date, type, rawType: String(g('type') || ''), asset, qty, amt: isFinite(total0) ? total0 : isFinite(price) ? price * qty : NaN, feeAmt: isFinite(fee) ? fee : 0, cur, toAsset: String(g('toAsset') || '').trim().toUpperCase(), toQty: num(g('toQty')) };
      if (D.tz) t.tz = D.tz; if (D.dateOnly) t.dateOnly = true;
      push(out, t);
    });
    if (assumed) out.assumedCad = assumed;
    out.txs.sort((a, b) => a.date - b.date || a.line - b.line);
    return out;
  }
  /* Ligne en CAD : valeurs gardées ; autre devise : attend convertFx (cad = NaN jusque-là). */
  function push(out, t) { if (t.cur === 'CAD') { t.cad = t.amt; t.fee = t.feeAmt; } else { t.cad = NaN; t.fee = 0; t.needFx = true; } out.txs.push(t); }
  const TYPEMAP = { BUY: 'BUY', SELL: 'SELL', STAKING: 'INCOME', INTEREST: 'INCOME', AIRDROP: 'AIRDROP', PAY: 'SPEND', RECEIVE: 'TRANSFER', SEND: 'TRANSFER', GIFT: 'GIFT' };
  function fromPdfLines(lines) {
    { const B0 = KF.binancePdfRows && KF.binancePdfRows(lines); if (B0) { const o = parseRows(B0, ''); o.pdf = true; if (B0.info.unread) o.skipped.push({ line: 'PDF', why: B(B0.info.unread + ' ligne(s) Binance du PDF illisible(s), à vérifier', B0.info.unread + ' unreadable Binance PDF line(s), to verify') }); return o; } }
    const r = KP.parsePdfLines(lines, { keepCur: true }), out = { txs: [], skipped: [], missingCols: [], currency: null, pdf: true };
    const add = (row, n) => {
      const raw = String(row[1] || ''), g = E.guessType(raw, '', true), type = TYPEMAP[g] || kind(raw), D = caDate(String(row[6] || ''), 'DMY'), asset = String(row[0] || '').toUpperCase(), qty = num(row[2]);
      if (!type || !isFinite(D.date) || !asset || !(qty > 0)) { out.skipped.push({ line: n, why: g === 'EXCH_OUT' ? B('échange sans l\'actif reçu, à vérifier', 'swap without the asset received, to verify') : !type ? B('type inconnu', 'unknown type') : B('ligne illisible', 'unreadable line') }); return; }
      const cs = [...new Set([row[3], row[4], row[5]].map(curOf).filter(Boolean))]; if (cs.length > 1 || cs[0] === 'AMBIG') { out.skipped.push({ line: n, why: cs.length > 1 ? B('devises différentes dans la ligne, à vérifier', 'different currencies in the line, to verify') : B('symbole « $ » seul : devise à préciser', '"$" alone: currency to state') }); return; }
      if (!cs.length) { out.skipped.push({ line: n, why: B('devise non indiquée dans le relevé PDF, à vérifier', 'currency not stated in the PDF statement, to verify') }); return; }
      const price = num(row[3]), val = num(row[4]), fee = num(row[5]);
      const t = { line: n, date: D.date, type, rawType: raw, asset, qty, amt: isFinite(val) ? val : isFinite(price) ? price * qty : NaN, feeAmt: isFinite(fee) && fee > 0 ? fee : 0, cur: cs[0], toAsset: '', toQty: NaN };
      if (D.tz) t.tz = D.tz; if (D.dateOnly) t.dateOnly = true; push(out, t);
    };
    r.rows.forEach((row, i) => add(row, 'PDF ' + (i + 1))); r.rows2.forEach((x, i) => add(x.row, 'PDF ' + (r.rows.length + i + 1)));
    r.amb.forEach(a => out.skipped.push({ line: 'PDF', why: B('quantité × prix différent de la valeur : valeur indiquée utilisée, à vérifier', 'quantity × price differs from the value: stated value used, to verify'), kept: !!a.kept }));
    out.txs.sort((a, b) => a.date - b.date); return out;
  }
  /* Conversion en CAD : taux quotidien de la Banque du Canada (Valet, séries FX<devise>CAD), du jour ou du jour coté précédent le plus proche
     (Folio S5-F4-C1 ¶1.4 ; au plus 7 jours en arrière ici). Devise non cotée ou pas de taux : ligne exclue, à vérifier. Jamais USD = CAD. */
  const BOC = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'NZD', 'SEK', 'NOK', 'HKD', 'SGD', 'CNY', 'INR', 'MXN', 'BRL', 'ZAR', 'KRW', 'TRY', 'TWD', 'THB', 'IDR', 'MYR', 'PEN', 'SAR', 'VND', 'RUB'];
  const FX_SRC = B('Banque du Canada, taux quotidiens (bankofcanada.ca/valet)', 'Bank of Canada daily rates (bankofcanada.ca/valet)');
  const isoDay = t => new Date(t).toISOString().slice(0, 10);
  function rateOn(map, day) { for (let i = 0; i <= 7; i++) { const d = isoDay(Date.parse(day) - i * DAY); if (map[d]) return { rate: map[d], on: d }; } return null; }
  async function convertFx(p, getJson, taxTz) {
    const need = p.txs.filter(t => t.needFx), by = {}; need.forEach(t => (by[t.cur] = by[t.cur] || []).push(t));
    const dayKey = t => t.dateOnly ? isoDay(t.date) : isoDay(shiftTz(t.date, t.tz || p.fileTz || 'UTC', taxTz || TORONTO));
    p.fx = { src: FX_SRC, count: 0, cur: [], missing: 0 };
    for (const c in by) {
      const L = by[c]; let map = {};
      if (BOC.includes(c)) { const ds = L.map(dayKey).sort(), from = isoDay(Date.parse(ds[0]) - 7 * DAY), to = ds[ds.length - 1];
        try { const j = await getJson('https://www.bankofcanada.ca/valet/observations/FX' + c + 'CAD/json?start_date=' + from + '&end_date=' + to);
          (j && j.observations || []).forEach(o => { const v = o && o['FX' + c + 'CAD'] && parseFloat(o['FX' + c + 'CAD'].v); if (o && /^\d{4}-\d{2}-\d{2}$/.test(o.d) && v > 0) map[o.d] = v; }); } catch (x) { map = {}; } }
      for (const t of L) { const day = dayKey(t), r = BOC.includes(c) ? rateOn(map, day) : null;
        if (!r) { t.drop = true; p.skipped.push({ line: t.line, why: BOC.includes(c) ? B('aucun taux ' + c + '/CAD de la Banque du Canada trouvé pour le ' + day + ' : exclue, à vérifier', 'no Bank of Canada ' + c + '/CAD rate found for ' + day + ': excluded, to verify') : B('devise ' + c + ' non cotée par la Banque du Canada : exclue, à vérifier', 'currency ' + c + ' not quoted by the Bank of Canada: excluded, to verify') }); p.fx.missing++; continue; }
        t.cad = t.amt * r.rate; t.fee = t.feeAmt * r.rate; t.fx = { cur: c, rate: r.rate, on: r.on }; delete t.needFx; p.fx.count++; if (!p.fx.cur.includes(c)) p.fx.cur.push(c); }
    }
    p.txs = p.txs.filter(t => !t.drop); return p;
  }
  function fromCSVText(input, name) { return parseRows(Array.from(KF.parseCSV(input)), name); }
  function fromWorkbook(X, data, name) {
    const wb = X.read(data, { cellDates: false, cellNF: true }); let best = null; const d1904 = !!(wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.date1904);
    // v2.54 : numéro de série Excel lu tel quel (pas d'objet Date local), puis converti en heure murale UTC ; 1904 géré
    for (const n of wb.SheetNames) { const sh = wb.Sheets[n]; for (const k in sh) { const c = sh[k]; if (k[0] === '!' || !c || c.t !== 'n' || !c.z || !(X.SSF && X.SSF.is_date(c.z))) continue; c.v = 'XLSERIAL:' + (c.v + (d1904 ? 1462 : 0)); c.t = 's'; delete c.w; delete c.z; } }
    for (const n of wb.SheetNames) { const rows = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }); if (!rows.length) continue; const p = parseRows(rows, name); if (!p.missingCols.length) return p; if (!best) best = p; }
    return best || { txs: [], skipped: [], missingCols: ['date', 'type', 'asset', 'qty'] };
  }
  /* Fuseaux : Intl avec zone explicite, sans réseau ; ne dépend jamais du fuseau de la machine. */
  const tzFmt = {};
  function tzOffset(zone, inst) {
    if (!zone || zone === 'UTC') return 0;
    const f = tzFmt[zone] || (tzFmt[zone] = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    const P = {}; f.formatToParts(new Date(inst)).forEach(x => { P[x.type] = +x.value; });
    return Date.UTC(P.year, P.month - 1, P.day, P.hour % 24, P.minute, P.second) - Math.floor(inst / 1000) * 1000;
  }
  function shiftTz(w, from, to) { if (!isFinite(w) || (from || 'UTC') === (to || 'UTC')) return w; let i = w - tzOffset(from, w); i = w - tzOffset(from, i); return i + tzOffset(to, i); }
  /* Taux d'inclusion par année civile (particulier). 2024 et 2025 : ARC « Capital losses » (année 2025). 2026 : art. 38 a) LIR en vigueur (lois-justice, à jour
     au 19/10/2026) ; guide ARC 2026 pas encore publié. Autre année : non lue, à vérifier (aucun taux appliqué). */
  const INCL = { 2024: 0.5, 2025: 0.5, 2026: 0.5 };
  const INCL_SRC_EN = { 2024: 'CRA, "Capital losses": table "From 2001 to 2025 | 1/2"', 2025: 'CRA, "Capital losses": "The inclusion rate for 2025 is 50%"', 2026: 'Income Tax Act, s. 38(a) ("½"), Justice Laws current to 2026-10-19; CRA 2026 guide not yet published, to verify' };
  const INCL_SRC = { 2024: 'ARC, « Capital losses » : tableau « From 2001 to 2025 | 1/2 »', 2025: 'ARC, « Capital losses » : « The inclusion rate for 2025 is 50% »', 2026: 'Loi de l\'impôt sur le revenu, art. 38 a) (« ½ »), lois-justice à jour au 19/10/2026 ; guide ARC 2026 pas encore publié, à vérifier' };
  /* Formulaire (vérifié) : Annexe 3 2025 = section « Crypto-assets » ; 2024 = section « Bonds, debentures, promissory notes, crypto-assets, and other similar properties ». */
  const FORM_EN = { 2024: 'Schedule 3 (2024): section "Bonds, debentures, promissory notes, crypto-assets, and other similar properties"', 2025: 'Schedule 3 (2025): section "Crypto-assets"' };
  const FORM = { 2024: 'Annexe 3 (2024) : section « Bonds, debentures, promissory notes, crypto-assets, and other similar properties »', 2025: 'Annexe 3 (2025) : section « Crypto-assets »' };
  const r2 = v => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
  const EPS = 1e-12;
  function compute(txs, opts) {
    opts = opts || {}; const fileTz = opts.fileTz || 'UTC', taxTz = opts.taxTz || TORONTO;
    const local = t => t.dateOnly ? t.date : shiftTz(t.date, t.tz || fileTz, taxTz);
    const dayOf = t => Math.floor(local(t) / DAY);
    const yearOf = d => new Date(d * DAY).getUTCFullYear();
    const ev = txs.map((t, i) => ({ t, i, w: local(t) })).sort((a, b) => a.w - b.w || a.i - b.i);
    const P = {}, pool = a => P[a] || (P[a] = { q: 0, c: 0, unknown: false, acq: [], hist: [] });
    const disposals = [], income = [], notes = [], transfers = { count: 0, withFee: 0 };
    let lastDay = -Infinity;
    const acquire = (asset, d, qty, cost, line, how) => { const p = pool(asset); p.q += qty; if (cost == null || !isFinite(cost)) p.unknown = true; else p.c += cost; p.acq.push({ day: d, qty, line, how }); p.hist.push({ day: d, q: p.q }); };
    const dispose = (asset, d, qty, proceeds, fee, line, x) => { const p = pool(asset), have = p.q;
      const base = Object.assign({ asset, day: d, date: d * DAY, year: yearOf(d), qty, proceeds: proceeds == null || !isFinite(proceeds) ? null : r2(proceeds), fees: r2(fee || 0), acb: null, gain: null, lines: [line], status: 'ok', poolBefore: { qty: have, acb: p.unknown ? null : r2(p.c) } }, x || {});
      if (qty > have * (1 + 1e-9) + EPS) { base.status = B('à vérifier : aucune acquisition trouvée pour ' + +(qty - have).toPrecision(10) + ' ' + asset, 'to verify: no acquisition found for ' + +(qty - have).toPrecision(10) + ' ' + asset); p.q = 0; p.c = 0; p.unknown = false; }
      else { const acb = have > 0 ? p.c * Math.min(qty, have) / have : 0; const u = p.unknown; p.q = Math.max(0, have - qty); p.c = p.q <= EPS ? 0 : p.c - acb; if (p.q <= EPS) { p.q = 0; p.unknown = false; }
        if (u) base.status = B('à vérifier : coût (PBR) inconnu pour une partie des unités', 'to verify: cost (ACB) unknown for some units'); else base.acb = r2(acb);
        if (base.proceeds == null) base.status = B('à vérifier : valeur en CAD manquante', 'to verify: CAD value missing');
        if (base.status === 'ok') base.gain = r2(proceeds - acb - (fee || 0)); }
      p.hist.push({ day: d, q: p.q }); disposals.push(base); return base; };
    for (const { t } of ev) {
      const d = dayOf(t), v = isFinite(t.cad) ? t.cad : null; if (d > lastDay) lastDay = d;
      if (t.type === 'BUY') acquire(t.asset, d, t.qty, v == null ? null : v + (t.fee || 0), t.line, 'achat');
      else if (t.type === 'SELL' || t.type === 'SPEND') dispose(t.asset, d, t.qty, v, t.fee, t.line);
      else if (t.type === 'GIFT') dispose(t.asset, d, t.qty, v, t.fee, t.line, { gift: true });
      else if (t.type === 'CONVERT') {
        if (!t.toAsset || !(t.toQty > 0)) { notes.push({ line: t.line, why: B('échange sans actif ou quantité reçus : non calculé', 'swap without asset or quantity received: not computed') }); continue; }
        dispose(t.asset, d, t.qty, v, t.fee, t.line, { swap: t.toAsset }); acquire(t.toAsset, d, t.toQty, v, t.line, 'échange');
      } else if (t.type === 'INCOME' || t.type === 'MINING' || t.type === 'AIRDROP') {
        acquire(t.asset, d, t.qty, v, t.line, 'récompense'); income.push({ line: t.line, day: d, year: yearOf(d), asset: t.asset, qty: t.qty, cad: v, type: t.rawType, kind: t.type });
      } else if (t.type === 'TRANSFER') { transfers.count++; if (t.fee > 0 || t.feeAmt > 0) transfers.withFee++; }
    }
    const cover = opts.coverEnd != null ? opts.coverEnd : lastDay;
    /* Perte apparente possible : acquisition du même actif entre J-30 et J+30, et unités encore détenues à la fin de J+30 ; ou données ne couvrant pas J+30. */
    const heldAt = (p, day) => { let q = 0; for (const h of p.hist) { if (h.day <= day) q = h.q; else break; } return q; };
    for (const x of disposals) {
      if (x.status !== 'ok' || !(x.gain < 0)) continue;
      const p = pool(x.asset), win = p.acq.filter(a => a.day >= x.day - 30 && a.day <= x.day + 30);
      const acqQty = win.reduce((s, a) => s + a.qty, 0), held = heldAt(p, x.day + 30), incomplete = cover < x.day + 30;
      if ((acqQty > EPS && held > EPS) || incomplete) {
        x.superficial = { acqQty: +acqQty.toPrecision(10), held: +held.toPrecision(10), incomplete, until: (x.day + 30) * DAY };
        x.status = B('perte à examiner : perte apparente possible' + (incomplete ? ' (données à compléter jusqu\'au ' + dmyF((x.day + 30) * DAY) + ')' : ''), 'loss to review: possible superficial loss' + (incomplete ? ' (data to complete up to ' + isoDay((x.day + 30) * DAY) + ')' : '')); }
    }
    const pools = {}; for (const a of Object.keys(P).sort()) pools[a] = { qty: P[a].q, acb: P[a].unknown ? null : r2(P[a].c) };
    disposals.sort((a, b) => a.day - b.day || (a.asset < b.asset ? -1 : 1));
    return { disposals, income, pools, notes, transfers, fileTz, taxTz, coverEnd: cover, years: [...new Set(disposals.map(x => x.year).concat(income.map(x => x.year)))].sort() };
  }
  function yearSummary(res, y) {
    y = +y; const D = res.disposals.filter(x => x.year === y), ok = D.filter(x => x.status === 'ok'), sum = (L, f) => r2(L.reduce((a, x) => a + f(x), 0)) || 0;
    const cand = D.filter(x => x.superficial), tv = D.filter(x => x.status !== 'ok' && !x.superficial);
    const gains = sum(ok, x => Math.max(0, x.gain)), losses = sum(ok, x => Math.max(0, -x.gain)), net = r2(gains - losses), rate = INCL[y] != null ? INCL[y] : null;
    const inc = res.income.filter(x => x.year === y);
    return { year: y, count: ok.length, proceeds: sum(ok, x => x.proceeds), acb: sum(ok, x => x.acb), fees: sum(ok, x => x.fees), gains, losses, net, rate, rateSrc: INCL_SRC[y] ? B(INCL_SRC[y], INCL_SRC_EN[y]) : null, form: FORM[y] ? B(FORM[y], FORM_EN[y]) : null,
      taxable: rate == null ? null : net > 0 ? r2(net * rate) : 0, allowableLoss: rate == null ? null : net < 0 ? r2(-net * rate) : 0,
      candidates: cand, candidateLoss: sum(cand, x => -x.gain), toVerify: tv, disposals: D, income: inc, incomeCad: sum(inc.filter(x => x.cad != null), x => x.cad), incomeUnknown: inc.filter(x => x.cad == null).length };
  }
  const p2 = n => String(n).padStart(2, '0');
  const amt = v => LANG === 'en' ? (v < 0 ? '-' : '') + Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : (v < 0 ? '-' : '') + Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0').replace('.', ',');
  const cad = v => v == null || !isFinite(v) ? T('à vérifier', 'to verify') : amt(v) + (LANG === 'en' ? '\u00a0CAD' : '\u00a0$'); // anglais : « CAD » écrit (pas de « $ » ambigu)
  const dmyF = t => { if (t == null) return 'inconnue'; const d = new Date(t); return p2(d.getUTCDate()) + '/' + p2(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear(); };
  const isoDay0 = t => new Date(t).toISOString().slice(0, 10);
  const dmy = t => t == null ? T('inconnue', 'unknown') : LANG === 'en' ? isoDay0(t) : dmyF(t); // anglais : AAAA-MM-JJ (sans ambiguïté)
  const LEGAL_FR = 'Estimation à vérifier, pas un conseil fiscal ni une déclaration. Règles : ARC (crypto-actifs, gains et pertes en capital, perte apparente), Loi de l\'impôt sur le revenu art. 38 a), Folio S5-F4-C1 (taux Banque du Canada). Détail : docs/CA-RULES.md.';
  const LEGAL_EN = 'Estimate to verify, not tax advice or a return. Rules: CRA (crypto-assets, capital gains and losses, superficial loss), Income Tax Act s. 38(a), Folio S5-F4-C1 (Bank of Canada rates). Details: docs/CA-RULES.md.';
  const legal = () => T(LEGAL_FR, LEGAL_EN), LEGAL = LEGAL_FR;
  function ranges(ns) { ns = [...new Set(ns)].sort((a, b) => a - b); const o = []; for (let i = 0; i < ns.length; i++) { let j = i; while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++; o.push(j > i ? ns[i] + '-' + ns[j] : String(ns[i])); i = j; } return o.join(', '); }
  function groupLines(items, max) { const G = new Map(); items.forEach(x => { if (!G.has(x.why)) G.set(x.why, []); G.get(x.why).push(x.line); }); const out = [];
    G.forEach((ls, why) => { if (ls.length <= (max || 1)) { ls.forEach(l => out.push({ text: (/^\d+$/.test(String(l)) ? T('Ligne ', 'Line ') + l : String(l)) + T(' : ', ': ') + Lx(why), n: 1 })); return; }
      const num = ls.filter(l => /^\d+$/.test(String(l))).map(Number), other = ls.filter(l => !/^\d+$/.test(String(l)));
      out.push({ text: [num.length ? T('lignes ', 'lines ') + ranges(num) : '', other.length ? [...new Set(other)].slice(0, 12).join(', ') + (new Set(other).size > 12 ? '…' : '') : ''].filter(Boolean).join(' ; ') + T(' : ', ': ') + Lx(why) + ' (' + ls.length + T(' lignes)', ' lines)'), n: ls.length }); });
    return out; }
  function checks(res, Y) { const chk = [];
    Y.toVerify.slice(0, 30).forEach(x => chk.push(dmy(x.date) + ' ' + x.asset + T(' : ', ': ') + Lx(x.status).replace(/^(?:à vérifier : |to verify: )/, '') + T(' (hors totaux).', ' (outside the totals).')));
    if (Y.toVerify.length > 30) chk.push((Y.toVerify.length - 30) + T(' autre(s) disposition(s) à vérifier (hors totaux).', ' other disposition(s) to verify (outside the totals).'));
    if (Y.candidates.length) chk.push(Y.candidates.length + T(' perte(s) à examiner (perte apparente possible, ' + cad(-Y.candidateLoss) + ') : exclue(s) du total définitif. Si la perte est apparente, elle n\'est pas déductible ; elle s\'ajoute « usually » au PBR du bien substitué seulement si c\'est vous qui l\'avez acquis (ARC). Aucun ajustement n\'est calculé ici.', ' loss(es) to review (possible superficial loss, ' + cad(-Y.candidateLoss) + '): left out of the definitive total. A superficial loss is not deductible; it is \"usually\" added to the ACB of the substituted property only if you acquired it (CRA). No adjustment is computed here.'));
    chk.push(T('Achats du même actif par votre conjoint, une société que vous contrôlez ou une autre personne affiliée dans les 30 jours : invisibles ici, ils peuvent rendre une perte apparente.', 'Purchases of the same asset within 30 days by your spouse, a corporation you control or another affiliated person: not visible here, they can make a loss superficial.'));
    if (Y.disposals.some(x => x.gift)) chk.push(T('Dons : disposition à la juste valeur marchande, règles particulières (conjoint, organisme de bienfaisance) non traitées, à vérifier.', 'Gifts: disposition at fair market value; special rules (spouse, charity) not handled, to verify.'));
    if (Y.income.length) chk.push(Y.income.length + T(' récompense(s) (staking, minage, airdrop…) : revenu ou capital selon votre situation, à examiner ; l\'ARC traite généralement le staking sur une plateforme centralisée comme un revenu au moment du crédit. ', ' reward(s) (staking, mining, airdrop…): income or capital depending on your situation, to review; the CRA generally treats staking on a centralised platform as income when credited. ') + (Y.incomeUnknown ? Y.incomeUnknown + T(' sans valeur : coût inconnu, les ventes suivantes de cet actif sont à vérifier.', ' without value: unknown cost, later sales of this asset are to verify.') : ''));
    if (res.transfers && res.transfers.withFee) chk.push(res.transfers.withFee + T(' transfert(s) avec frais : frais réseau non traités, à vérifier.', ' transfer(s) with fees: network fees not handled, to verify.'));
    if (res.fx && res.fx.count) chk.push(res.fx.count + T(' ligne(s) converties en CAD (', ' line(s) converted to CAD (') + res.fx.cur.join(', ') + T(') au taux ', ') at the ') + Lx(FX_SRC) + T(' : du jour ou du jour coté précédent (Folio S5-F4-C1 ¶1.4).', ': rate of the day or of the previous quoted day (Folio S5-F4-C1 ¶1.4).'));
    if (res.fx && res.fx.missing) chk.push(res.fx.missing + T(' ligne(s) sans taux de change : exclues, à vérifier.', ' line(s) without an exchange rate: excluded, to verify.'));
    if (res.assumedCad) chk.push(res.assumedCad + T(' ligne(s) sans devise indiquée : montants supposés en CAD, à vérifier.', ' line(s) without a stated currency: amounts assumed in CAD, to verify.'));
    { const K = (res.skipped || []).filter(x => x.kept); groupLines(K, 1).forEach(g => chk.push(g.text + '.')); }
    groupLines(res.notes || [], 5).forEach(g => chk.push(g.text + '.'));
    if (Y.rate == null) chk.push(T('Taux d\'inclusion ' + Y.year + ' : non vérifié, aucun gain imposable calculé.', Y.year + ' inclusion rate: not verified, no taxable gain computed.'));
    chk.push(T('Pertes en capital d\'autres années, autres biens, activité d\'entreprise et impôt fédéral ou provincial : non inclus.', 'Capital losses of other years, other property, business activity and federal or provincial tax: not included.'));
    return chk; }
  const csvSafe = (s => /^(?:[=+@\t\r]|-(?![\d.]|$))/.test(s) ? "'" + s : s);
  function toCSV(res, y) {
    const Y = yearSummary(res, y), q = v => { const s = csvSafe(String(v == null ? '' : v)); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }, tv = T('à vérifier', 'to verify'), n = v => v == null ? tv : v.toFixed(2);
    const L = [[T('Kryptax Canada - feuille de calcul des gains en capital crypto (estimation, à vérifier ; pas un formulaire officiel)', 'Kryptax Canada - crypto capital gains worksheet (estimate, to verify; not an official form)')], [T('Année civile', 'Calendar year'), Y.year + T(' (1er janvier au 31 décembre)', ' (January 1 to December 31)')],
      [T('Dates fiscales', 'Tax dates'), tzName(res.taxTz) + T(' ; heures du fichier : ', '; file times: ') + res.fileTz + T(' (décalages explicites respectés)', ' (explicit offsets kept)')], [T('Formulaire', 'Form'), Y.form ? Lx(Y.form) : T('Annexe 3 ' + Y.year + ' : non lue, à vérifier', 'Schedule 3 ' + Y.year + ': not read, to verify')], [],
      [T('Rubrique', 'Item'), T('Montant (CAD)', 'Amount (CAD)')], [T('Nombre de dispositions (total définitif)', 'Number of dispositions (definitive total)'), Y.count], [T('Produit de disposition', 'Proceeds of disposition'), n(Y.proceeds)], [T('PBR (prix de base rajusté)', 'ACB (adjusted cost base)'), n(Y.acb)], [T('Dépenses de disposition', 'Outlays and expenses'), n(Y.fees)],
      [T('Gains', 'Gains'), n(Y.gains)], [T('Pertes (définitives)', 'Losses (definitive)'), n(Y.losses)], [T('Gain ou perte net', 'Net gain or loss'), n(Y.net)], [T('Taux d\'inclusion', 'Inclusion rate'), Y.rate == null ? tv : '1/2'], [T('Source du taux', 'Rate source'), Y.rateSrc ? Lx(Y.rateSrc) : T('non lue', 'not read')],
      [T('Gain en capital imposable (ligne 12700 si positif)', 'Taxable capital gain (line 12700 if positive)'), Y.taxable == null ? tv : n(Y.taxable)], [T('Perte en capital déductible (reportable)', 'Allowable capital loss (carry-forward)'), Y.allowableLoss == null ? tv : n(Y.allowableLoss)],
      [T('Pertes à examiner (perte apparente possible, hors totaux)', 'Losses to review (possible superficial loss, outside the totals)'), n(Y.candidateLoss)], [],
      [T('Date', 'Date'), T('Actif', 'Asset'), T('Quantité', 'Quantity'), T('Produit (CAD)', 'Proceeds (CAD)'), T('PBR (CAD)', 'ACB (CAD)'), T('Dépenses (CAD)', 'Outlays (CAD)'), T('Gain ou perte (CAD)', 'Gain or loss (CAD)'), T('Statut', 'Status')]];
    Y.disposals.forEach(x => L.push([dmy(x.date), x.asset, +x.qty.toPrecision(10), n(x.proceeds), n(x.acb), n(x.fees), x.gain == null ? (x.superficial ? '' : tv) : n(x.gain), Lx(x.status) + (x.superficial ? T(' ; acquis dans la fenêtre : ', '; acquired in the window: ') + x.superficial.acqQty + T(' ; détenu à J+30 : ', '; held at day+30: ') + (x.superficial.incomplete ? T('inconnu', 'unknown') : x.superficial.held) : '') + (x.swap ? T(' ; échange contre ', '; swapped for ') + x.swap : '') + (x.gift ? T(' ; don', '; gift') : '')]));
    Y.candidates.forEach(x => { const r = L.find(l => l[0] === dmy(x.date) && l[1] === x.asset && l[6] === ''); if (r) r[6] = n(x.gain) + T(' (à examiner)', ' (to review)'); });
    if (Y.income.length) { L.push([], [T('Récompenses (revenu ou capital selon votre situation, à examiner)', 'Rewards (income or capital depending on your situation, to review)')], [T('Date', 'Date'), T('Actif', 'Asset'), T('Quantité', 'Quantity'), T('Valeur (CAD)', 'Value (CAD)'), T('Type', 'Type')]); Y.income.forEach(x => L.push([dmy(x.day * DAY), x.asset, +x.qty.toPrecision(10), x.cad == null ? T('valeur manquante - à vérifier', 'value missing - to verify') : n(x.cad), x.type])); }
    L.push([], [T('À vérifier', 'To verify')]); checks(res, Y).forEach(c => L.push([c])); L.push([], [legal()]);
    return L.map(r => r.map(q).join(',')).join('\r\n') + '\r\n';
  }
  const ascii = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u00ab\u00bb\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'").replace(/[\u2013\u2014\u2212]/g, '-').replace(/[\u00a0\u2007\u2009\u202f]/g, ' ').replace(/\u2026/g, '...').replace(/\u00d7/g, 'x').replace(/\u00bd/g, '1/2').replace(/\u0153/g, 'oe').replace(/\u20ac/g, 'EUR ').replace(/[^\x20-\x7e]/g, '?');
  function pdfData(res, y, now) {
    const Y = yearSummary(res, y), C = v => v == null || !isFinite(v) ? T('a verifier', 'to verify') : amt(v) + ' CAD'; now = now || new Date(); // v2.54 : devise écrite CAD (pas « $ » seul)
    const tv = T('a verifier', 'to verify'), gen = now.getUTCFullYear() + '-' + p2(now.getUTCMonth() + 1) + '-' + p2(now.getUTCDate());
    const info = [T('Montants en dollars canadiens (CAD). Annee civile ' + Y.year + '. Generee le ' + gen + ' UTC. Feuille de calcul, pas un formulaire officiel.', 'Amounts in Canadian dollars (CAD). Calendar year ' + Y.year + '. Generated on ' + gen + ' UTC. Worksheet, not an official form.'),
      T('PBR : cout moyen pondere par actif identique, tous portefeuilles. Dates fiscales : ', 'ACB: weighted average cost per identical asset, all wallets. Tax dates: ') + tzName(res.taxTz) + T(' ; heures du fichier : ', '; file times: ') + res.fileTz + '.',
      (Y.form ? Lx(Y.form) : T('Annexe 3 ' + Y.year + ' : non lue, a verifier', 'Schedule 3 ' + Y.year + ': not read, to verify')) + '.',
      T('Dispositions ', 'Dispositions ') + Y.count + T(' | produit ', ' | proceeds ') + C(Y.proceeds) + T(' | PBR ', ' | ACB ') + C(Y.acb) + T(' | depenses ', ' | outlays ') + C(Y.fees) + T(' | gains ', ' | gains ') + C(Y.gains) + T(' | pertes ', ' | losses ') + C(Y.losses) + ' | net ' + C(Y.net),
      T('Inclusion ', 'Inclusion ') + (Y.rate == null ? tv : '1/2 (' + Lx(Y.rateSrc) + ')') + T(' | gain imposable ', ' | taxable gain ') + (Y.taxable == null ? tv : C(Y.taxable)) + T(' | perte deductible ', ' | allowable loss ') + (Y.allowableLoss == null ? tv : C(Y.allowableLoss)) + T('. Aucun impot calcule.', '. No tax computed.'),
      (Y.candidates.length ? Y.candidates.length + T(' perte(s) a examiner (perte apparente possible) : ', ' loss(es) to review (possible superficial loss): ') + C(-Y.candidateLoss) + T(', hors totaux. ', ', outside the totals. ') : '') + (Y.toVerify.length ? Y.toVerify.length + T(' disposition(s) a verifier, hors totaux.', ' disposition(s) to verify, outside the totals.') : '')];
    if (Y.income.length) info.push(T('Recompenses : ', 'Rewards: ') + C(Y.incomeCad) + (Y.incomeUnknown ? ' + ' + Y.incomeUnknown + T(' sans valeur', ' without value') : '') + T(' (revenu ou capital selon votre situation, a examiner).', ' (income or capital depending on your situation, to review).'));
    checks(res, Y).forEach(c => info.push(T('A verifier : ', 'To verify: ') + c));
    const rows = Y.disposals.map(x => [dmy(x.date), x.asset, String(+x.qty.toPrecision(10)), C(x.proceeds), C(x.acb), C(x.fees), x.gain == null ? tv : C(x.gain), x.status === 'ok' ? '' : Lx(x.status)].map(ascii));
    return { title: ascii(T('Kryptax Canada - gains en capital crypto ' + Y.year + ' (estimation, montants en CAD)', 'Kryptax Canada - crypto capital gains ' + Y.year + ' (estimate, amounts in CAD)')), info: info.map(ascii), head: T(['Date', 'Actif', 'Qte', 'Produit (CAD)', 'PBR (CAD)', 'Depenses (CAD)', 'Gain/perte (CAD)', 'Statut'], ['Date', 'Asset', 'Qty', 'Proceeds (CAD)', 'ACB (CAD)', 'Outlays (CAD)', 'Gain/loss (CAD)', 'Status']), rows, foot: ascii(legal()) };
  }
  function pdf(jsPDF, res, y) {
    const D = pdfData(res, y), doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' }); let yy = 40;
    const t0 = doc.text.bind(doc); doc.text = (s, ...a) => t0(Array.isArray(s) ? s.map(ascii) : ascii(s), ...a);
    doc.setFontSize(14); doc.text(D.title, 40, yy); yy += 20; doc.setFontSize(9);
    D.info.forEach(l => { doc.splitTextToSize(l, 760).forEach(s => { doc.text(s, 40, yy); yy += 12; }); });
    if (doc.autoTable) doc.autoTable({ head: [D.head], body: D.rows, startY: yy + 6, styles: { fontSize: 8 }, margin: { left: 40, right: 40 } });
    const n = doc.getNumberOfPages(); for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.text(D.foot, 40, doc.internal.pageSize.getHeight() - 20); }
    return doc;
  }
  /* Nom de fichier : kryptax-canada-<année>_<AAAA-MM-JJ>_<HHhMM>.<ext> (heure locale de l'appareil au moment de l'export). */
  const fileName = (y, ext, d) => { d = d || new Date(); return 'kryptax-canada-' + y + '_' + d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + '_' + p2(d.getHours()) + 'h' + p2(d.getMinutes()) + '.' + ext; };
  function mergeFiles(L) {
    if (L.length === 1) return Object.assign({}, L[0].p, { dupes: 0, tzMix: false });
    const K = t => [t.date, t.tz || '', t.type, t.asset, t.qty, t.amt, t.cur, t.toAsset || '', t.toQty || ''].join('|'), seen = new Set(), out = Object.assign({}, L[0].p, { txs: [], skipped: [], dupes: 0, tzMix: false, assumedCad: 0, fx: null });
    L.forEach((f, i) => { const mine = new Set(), pre = 'F' + (i + 1) + ':';
      f.p.txs.forEach(t => { const k = K(t); if (seen.has(k)) { out.dupes++; return; } mine.add(k); out.txs.push(Object.assign({}, t, { line: pre + t.line })); });
      mine.forEach(k => seen.add(k)); (f.p.skipped || []).forEach(s => out.skipped.push(Object.assign({}, s, { line: pre + s.line })));
      out.assumedCad += f.p.assumedCad || 0;
      if (f.p.fx) { out.fx = out.fx || { src: f.p.fx.src, count: 0, cur: [], missing: 0 }; out.fx.count += f.p.fx.count; out.fx.missing += f.p.fx.missing || 0; f.p.fx.cur.forEach(c => { if (!out.fx.cur.includes(c)) out.fx.cur.push(c); }); } });
    out.txs.sort((a, b) => a.date - b.date); return out;
  }
  const api = { setLang, getLang, Lx, B, CA_TZ, CA_ZONES, tzName, resolveTaxTz, COLS, mapHeader, curOf, kind, caDate, slashOrder, parseRows, fromCSVText, fromWorkbook, fromPdfLines, convertFx, rateOn, BOC, FX_SRC, shiftTz, INCL, INCL_SRC, FORM, compute, yearSummary, checks, toCSV, pdfData, pdf, cad, dmy, csvSafe, ascii, fileName, mergeFiles, LEGAL };
  /* ---------- page (navigateur seulement) ---------- */
  function mount(doc) {
    const box = doc.getElementById('camode'); if (!box || box.dataset.ready) return; box.dataset.ready = '1';
    const inp = doc.getElementById('cafile'), out = doc.getElementById('caresult'), tzSel = doc.getElementById('catz'), taxSel = doc.getElementById('cataxtz'); if (!inp || !out) return;
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]), W = typeof window !== 'undefined' ? window : root;
    let cur = null, full = null, year = null, name = '', taxChoice = 'auto';
    let browserTz = 'UTC'; try { browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (x) {}
    let fileTz = CA_ZONES.includes(browserTz) ? browserTz : 'UTC';
    const taxNow = () => resolveTaxTz(taxChoice, fileTz, browserTz);
    const drawTax = () => { if (!taxSel) return; const a = resolveTaxTz('auto', fileTz, browserTz);
      taxSel.innerHTML = `<option value="auto">${T('Automatique : ', 'Automatic: ')}${esc(tzName(a.tz))} — ${esc(Lx(a.how))}</option>` + CA_TZ.map(z => `<option value="${esc(z[0])}">${esc(tzName(z[0]))}</option>`).join(''); taxSel.value = taxChoice; };
    const drawFileTz = () => { if (!tzSel) return; const L = [['UTC', 'UTC']].concat(CA_TZ.map(z => [z[0], tzName(z[0])])); if (!L.some(z => z[0] === browserTz)) L.push([browserTz, T('Ce navigateur (', 'This browser (') + browserTz + ')']);
      tzSel.innerHTML = L.map(z => `<option value="${esc(z[0])}">${esc(z[1])}</option>`).join(''); tzSel.value = fileTz; };
    if (tzSel) { drawFileTz();
      tzSel.addEventListener('change', () => { fileTz = tzSel.value; drawTax(); staleTz(); }); }
    if (taxSel) { drawTax(); taxSel.addEventListener('change', () => { taxChoice = taxSel.value; staleTz(); }); }
    /* v2.54 : textes fixes de la page Canada en anglais (le français d'origine est gardé et remis). Bascule = réaffichage seulement, sans relire ni recalculer. */
    const STATIC_EN = [
      ['#camode .usbeta', '', '<b class="betatag">Beta</b> <span class="betanote">Less tested than the French version: check every figure.</span> Crypto capital gains estimate (v1) for an individual investor: ACB at weighted average cost, in CAD, by calendar year.'],
      ['#caimp h2', '', '1. Import'], ['#cahelpbtn', '', 'How to use'], ['#careset', '', '↺ Reset'], ['#careset', 'title', 'Clear the data imported on this page'],
      ['#cahelppanel', '', '<ol><li><b>Export</b> the full history of each platform or wallet as CSV or Excel (values in CAD, or in another currency converted to CAD with Bank of Canada rates), or a PDF statement.</li><li><b>Columns</b>: Date (YYYY-MM-DD preferred), Type (Buy, Sell, Swap, Send, Receive, Staking, Mining, Airdrop, Gift…), Asset, Quantity, Total or Price, Fee. Swap: add Received asset and Received quantity.</li><li><b>Rules</b>: ACB = weighted average cost of all your units of the same asset, across all wallets; a crypto-to-crypto swap is a disposition; a transfer between your own wallets is not. A loss with a repurchase of the same asset within 30 days is flagged "to review" (possible superficial loss).</li><li><b>Result</b>: worksheet for Schedule 3, by calendar year, with the 1/2 inclusion rate when verified. No tax is computed.</li><li><b>Download</b> the CSV or the PDF.</li></ol><p class="hint">Estimate only, to be checked by you or a tax professional. Not tax advice. Business activity not covered.</p>'],
      ['#caimp > p.hint', '', 'Import one or more files (CSV, Excel or PDF) with <b>your full history</b>, including January of the following year if possible (30-day rule).'],
      ['#caimp label.btn .lbl-l', '', 'Choose files or drop them here (CSV, Excel or PDF)'], ['#caimp label.btn .lbl-s', '', 'Choose files (CSV, Excel or PDF)'],
      ['#catzl', '', 'Time zone of the file times'], ['#cataxtzl', '', 'Tax dates (your time zone in Canada)'],
      ['#camode .fhelp', '', '<p><b>Columns</b>: Date, Type, Asset, Quantity, Total or Price, Fee (in CAD, or another currency converted with the Bank of Canada — to verify). "$" alone is ambiguous: write CAD or USD in the header. Buy: cost = Total + Fee; Sell: proceeds = Total, fees are outlays and expenses.</p><p>Your files stay in this browser; only exchange rates are requested from the Bank of Canada.</p>']];
    const keep = new Map(), LANG_KEY = 'kx-ca-lang';
    const applyStatic = () => { STATIC_EN.forEach(([sel, attr, en]) => { const el = doc.querySelector(sel); if (!el) return; const k = sel + '|' + attr;
        if (!keep.has(k)) keep.set(k, attr ? el.getAttribute(attr) : el.innerHTML); const v = LANG === 'en' ? en : keep.get(k); if (attr) el.setAttribute(attr, v); else el.innerHTML = v; });
      box.lang = LANG; const sw = doc.getElementById('calang'); if (sw) { sw.setAttribute('aria-label', T('Langue', 'Language')); sw.querySelectorAll('button[data-lang]').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === LANG ? 'true' : 'false')); } };
    { let l = 'fr'; try { l = W.localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'fr'; } catch (x) {} setLang(l); } // français par défaut ; anglais seulement si choisi (clé propre au Canada)
    const save = (blob, fn) => { const a = doc.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fn; doc.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
    // v2.54 : un changement de fuseau après validation efface résultats, années et taux ; revalidation explicite exigée
    let stale = false, dupNote = 0;
    const staleHtml = () => '<p class="warn" id="castale">' + T('Fuseau modifié : les résultats, les années et les taux de change précédents sont effacés. Cliquez sur « Valider les imports » pour recalculer avec le nouveau fuseau.', 'Time zone changed: the previous results, years and exchange rates are cleared. Click "Confirm imports" to recompute with the new time zone.') + '</p>';
    function staleTz() { if (!cur) return; cur = full = null; year = null; stale = true; const b = doc.getElementById('cavalidate'); if (b) b.disabled = false; out.innerHTML = staleHtml(); }
    let calcTz = null;
    function calc() { const tx = taxNow(); calcTz = tx; full = compute(cur.txs, { fileTz, taxTz: tx.tz }); full.fx = cur.fx; full.skipped = cur.skipped; full.assumedCad = cur.assumedCad; api.computeCount = (api.computeCount || 0) + 1; }
    function render() { calc(); draw(); }
    function draw() {
      if (!cur) { out.innerHTML = stale ? staleHtml() : ''; return; }
      const tx = calcTz, Ys = full.years.map(String);
      if (!year || !Ys.includes(String(year))) year = Ys.length ? Ys[Ys.length - 1] : null;
      const dn = dupNote ? '<p class="warn">' + dupNote + T(' ligne' + (dupNote > 1 ? 's' : '') + ' déjà présente' + (dupNote > 1 ? 's' : '') + ' dans un fichier précédent : comptée' + (dupNote > 1 ? 's' : '') + ' une fois (à vérifier).', ' line' + (dupNote > 1 ? 's' : '') + ' already found in an earlier file: counted once (to verify).') + '</p>' : '';
      if (!year) { out.innerHTML = dn + '<p class="warn">' + esc(name) + T(' : aucune disposition ni récompense trouvée. Rien à déclarer.', ': no disposition or reward found. Nothing to report.') + '</p>' + skippedHtml(); return; }
      const Y = yearSummary(full, year), c = (l, v, k) => `<div><span>${l}</span><b class="${k || ''}">${v}</b></div>`, tv = T('à vérifier', 'to verify');
      const sel = Ys.length > 1 ? `<div class="grid"><label>${T('Année', 'Year')} <select id="cayear">${Ys.map(y => `<option value="${y}"${y === String(year) ? ' selected' : ''}>${y}</option>`).join('')}</select></label></div>` : '';
      const tr = Y.disposals.map(x => `<tr class="${x.status === 'ok' ? '' : 'tv'}"><td>${dmy(x.date)}</td><td>${esc(x.asset)}${x.gift ? ' <span class="hint">(' + T('don', 'gift') + ')</span>' : ''}${x.swap ? ' <span class="hint">→ ' + esc(x.swap) + '</span>' : ''}</td><td>${+x.qty.toPrecision(10)}</td><td>${cad(x.proceeds)}</td><td>${cad(x.acb)}</td><td>${cad(x.fees)}</td><td>${x.gain == null ? tv : cad(x.gain)}${x.status === 'ok' ? '' : '<br><b>' + esc(Lx(x.status)) + '</b>'}</td></tr>`).join('');
      const chk = checks(full, Y).map(esc);
      out.innerHTML = dn + `<h2 class="usreshead">${T('2. Résultat ', '2. Result ')}${esc(year)}</h2>` + sel
        + '<div class="kxkpi halo" aria-hidden="true">' + c(T('Gain ou perte net', 'Net gain or loss'), cad(Y.net), Y.net < 0 ? 'neg' : 'pos') + c(T('Gains', 'Gains'), cad(Y.gains)) + c(T('Pertes', 'Losses'), cad(Y.losses)) + (Y.taxable != null ? c(T('Gain imposable (1/2)', 'Taxable gain (1/2)'), cad(Y.taxable)) : '') + '</div>'
        + `<div class="note usguide"><b>${T('Feuille de calcul pour l\'Annexe 3', 'Worksheet for Schedule 3')} (${esc(year)})</b><div class="scroll"><table class="us8949 uksa"><tr><th>${T('Rubrique', 'Item')}</th><th>${T('Montant (CAD)', 'Amount (CAD)')}</th></tr>`
        + [[T('Dispositions (total définitif)', 'Dispositions (definitive total)'), String(Y.count)], [T('Produit de disposition', 'Proceeds of disposition'), cad(Y.proceeds)], [T('PBR (prix de base rajusté)', 'ACB (adjusted cost base)'), cad(Y.acb)], [T('Dépenses de disposition', 'Outlays and expenses'), cad(Y.fees)], [T('Gain ou perte net', 'Net gain or loss'), cad(Y.net)], [T('Taux d\'inclusion', 'Inclusion rate'), Y.rate == null ? tv : '1/2'], [T('Gain en capital imposable (ligne 12700)', 'Taxable capital gain (line 12700)'), Y.taxable == null ? tv : cad(Y.taxable)], [T('Perte en capital déductible (reportable)', 'Allowable capital loss (carry-forward)'), Y.allowableLoss == null ? tv : cad(Y.allowableLoss)]].map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')
        + `</table></div><span class="hint">${esc(Y.form ? Lx(Y.form) : T('Annexe 3 ' + year + ' : formulaire non lu, à vérifier', 'Schedule 3 ' + year + ': form not read, to verify'))}. ${T('Taux : ', 'Rate: ')}${esc(Y.rateSrc ? Lx(Y.rateSrc) : T('non vérifié', 'not verified'))}. ${T('Seulement les dispositions de ces fichiers — à vérifier.', 'Only the dispositions in these files — to verify.')}</span></div>`
        + (Y.candidates.length ? `<div class="note warn" role="status"><b>${T('Pertes à examiner : ', 'Losses to review: ')}${cad(-Y.candidateLoss)}</b> (${Y.candidates.length}) — ${T('perte apparente possible, hors du total définitif.', 'possible superficial loss, outside the definitive total.')} <span class="hint">${T('Même actif acquis dans les 30 jours avant ou après et encore détenu 30 jours après, ou fichier qui ne couvre pas ces 30 jours. Aucun refus ni ajout au PBR calculé : à examiner.', 'Same asset acquired within 30 days before or after and still held 30 days after, or a file that does not cover those 30 days. No denial or ACB addition computed: to review.')}</span></div>` : '')
        + `<div class="note total-global" role="status">${T('Gain ou perte net ', 'Net gain or loss ')}${esc(year)}${T(' : ', ': ')}<b>${cad(Y.net)}</b><br><span class="hint">${T('Dates fiscales : ', 'Tax dates: ')}<b>${esc(tzName(tx.tz))}</b>, ${esc(Lx(tx.how))}${T(' ; heures du fichier : ', '; file times: ')}${esc(fileTz)} ${T('(décalages explicites respectés). Année civile. Aucun impôt calculé (fédéral et provincial selon vos revenus). Estimation, pas un conseil fiscal.', '(explicit offsets kept). Calendar year. No tax computed (federal and provincial depend on your income). Estimate, not tax advice.')}</span></div>`
        + `<div class="note"><b>${T('À vérifier', 'To verify')} (${chk.length})</b><ul>${chk.map(x => '<li>' + x + '</li>').join('')}</ul></div>`
        + (Y.income.length ? `<div class="note"><b>${T('Récompenses : ', 'Rewards: ')}${cad(Y.incomeCad)}${Y.incomeUnknown ? ' + ' + Y.incomeUnknown + T(' sans valeur', ' without value') : ''}</b><br><span class="hint">${T('Revenu ou capital selon votre situation — à examiner. Ajoutées au PBR à leur valeur en CAD quand elle est connue.', 'Income or capital depending on your situation — to review. Added to the ACB at their CAD value when known.')}</span></div>`
          + `<div class="scroll"><table class="us8949"><tr><th>Date</th><th>${T('Actif', 'Asset')}</th><th>${T('Quantité', 'Quantity')}</th><th>${T('Valeur (CAD)', 'Value (CAD)')}</th><th>Type</th></tr>${Y.income.map(x => `<tr class="${x.cad == null ? 'tv' : ''}"><td>${dmy(x.day * DAY)}</td><td>${esc(x.asset)}</td><td>${+x.qty.toPrecision(10)}</td><td>${x.cad == null ? T('valeur manquante - à vérifier', 'value missing - to verify') : cad(x.cad)}</td><td>${esc(x.type)}</td></tr>`).join('')}</table></div>` : '')
        + `<details class="usdet" open><summary>${T('Dispositions', 'Dispositions')} (${Y.disposals.length})</summary><div class="scroll"><table class="us8949"><tr><th>Date</th><th>${T('Actif', 'Asset')}</th><th>${T('Quantité', 'Quantity')}</th><th>${T('Produit (CAD)', 'Proceeds (CAD)')}</th><th>${T('PBR (CAD)', 'ACB (CAD)')}</th><th>${T('Dépenses (CAD)', 'Outlays (CAD)')}</th><th>${T('Gain/perte (CAD)', 'Gain/loss (CAD)')}</th></tr>${tr}</table></div></details>`
        + skippedHtml() + (cur.platform ? `<p class="hint" id="caplatform">${T('Format reconnu : ', 'Recognised format: ')}${esc(cur.platform)}. ${T('Montants dans leur devise, convertis en CAD ; échanges entre jetons et récompenses sans valeur dans le fichier — à vérifier.', 'Amounts in their own currency, converted to CAD; token swaps and rewards without a value in the file — to verify.')}</p>` : '')
        + `<p class="usexp"><button type="button" id="capdf" class="btn"${W.jspdf ? '' : ' hidden'}>${T('Télécharger le PDF', 'Download PDF')}</button> <button type="button" id="cacsv" class="btn ghost">${T('Télécharger le CSV', 'Download CSV')}</button></p>`;
    }
    const skippedHtml = () => { const S = cur ? cur.skipped.filter(x => !x.kept) : []; return S.length ? `<p class="hint">${S.length}${T(' ligne' + (S.length > 1 ? 's' : '') + ' ignorée' + (S.length > 1 ? 's' : '') + ' : ', ' line' + (S.length > 1 ? 's' : '') + ' ignored: ')}${esc(groupLines(S, 5).map(g => g.text).join(' ; '))}.</p>` : ''; };
    out.addEventListener('change', e => { if (e.target.id === 'cayear') { year = e.target.value; draw(); } });
    out.addEventListener('click', e => { if (!full || !year) return;
      if (e.target.id === 'cacsv') save(new Blob(['\uFEFF', toCSV(full, year)], { type: 'text/csv;charset=utf-8' }), fileName(year, 'csv'));
      if (e.target.id === 'capdf' && W.jspdf) pdf(W.jspdf.jsPDF, full, year).save(fileName(year, 'pdf')); });
    { const hb = doc.getElementById('cahelpbtn'), hp = doc.getElementById('cahelppanel'); if (hb && hp) hb.addEventListener('click', () => { const op = hp.hidden; hp.hidden = !op; hb.setAttribute('aria-expanded', String(op)); }); }
    { const rb = doc.getElementById('careset'); if (rb) rb.addEventListener('click', () => { if (!W.confirm(T('Tout réinitialiser ? Les fichiers importés et les résultats de cette page seront effacés.', 'Reset everything? The imported files and the results on this page will be cleared.'))) return; cur = full = null; year = null; stale = false; dupNote = 0; notes0 = []; inp.value = ''; out.innerHTML = ''; files.length = 0; fmsg.innerHTML = ''; dirtyFiles(); }); }
    const zone = doc.getElementById('caimp');
    if (zone) { const has = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
      zone.addEventListener('dragover', e => { if (has(e)) { e.preventDefault(); zone.classList.add('dropover'); } });
      zone.addEventListener('dragleave', () => zone.classList.remove('dropover'));
      zone.addEventListener('drop', e => { zone.classList.remove('dropover'); if (!has(e)) return; e.preventDefault(); try { inp.files = e.dataTransfer.files; inp.dispatchEvent(new Event('change')); } catch (x) {} }); }
    inp.multiple = true; const files = [], flist = doc.createElement('ul'), vbtn = doc.createElement('button'), fmsg = doc.createElement('div');
    flist.className = 'flist'; flist.id = 'caflist'; flist.hidden = true; vbtn.type = 'button'; vbtn.className = 'btn validate'; vbtn.id = 'cavalidate'; vbtn.textContent = T('Valider les imports', 'Confirm imports'); vbtn.disabled = true; fmsg.id = 'cafmsg';
    { const ib = doc.getElementById('caimp'); if (ib) { ib.appendChild(flist); ib.appendChild(vbtn); ib.appendChild(fmsg); } }
    const drawFiles = () => { flist.innerHTML = files.map((x, i) => `<li><span>${esc(x.name)} (${x.p.txs.length}${T(' ligne', ' line')}${x.p.txs.length > 1 ? 's' : ''})</span> <button type="button" class="small ghost" data-rmi="${i}" aria-label="${T('Retirer ', 'Remove ')}${esc(x.name)}">✕</button></li>`).join(''); flist.hidden = !files.length; };
    const dirtyFiles = () => { drawFiles(); vbtn.disabled = !files.length; cur = full = null; year = null; stale = false; dupNote = 0; out.innerHTML = ''; };
    let notes0 = []; const drawNotes = () => { fmsg.innerHTML = notes0.map(f => f()).join(''); };
    flist.addEventListener('click', e => { const b = e.target.closest('[data-rmi]'); if (!b) return; files.splice(+b.dataset.rmi, 1); notes0 = []; drawNotes(); dirtyFiles(); });
    inp.addEventListener('change', async () => {
      const F = Array.from(inp.files || []); if (!F.length) return; const notes = [];
      for (const f of F) { if (files.some(x => x.name === f.name && x.size === f.size)) { notes.push(() => '<p class="warn">' + esc(f.name) + T(' : déjà importé, ignoré.', ': already imported, ignored.') + '</p>'); continue; }
        const r = await readOne(f); if (r.err) notes.push(r.err); else files.push({ name: f.name, size: f.size, p: r.p }); }
      inp.value = ''; dirtyFiles(); notes0 = notes; drawNotes();
    });
    // v2.54 : la conversion travaille sur une copie des lignes brutes (jamais deux fois sur les mêmes lignes), avec les fuseaux du moment de la validation
    const fresh = p => ({ ...p, txs: p.txs.map(t => ({ ...t })), skipped: (p.skipped || []).slice() });
    vbtn.addEventListener('click', async () => { if (!files.length) return; vbtn.disabled = true; const P = files.map(x => ({ name: x.name, p: fresh(x.p) }));
      for (const f of P) if (f.p.txs.some(t => t.needFx)) { f.p.fileTz = fileTz; out.innerHTML = '<p class="hint">' + T('Conversion en CAD (taux de la Banque du Canada)…', 'Converting to CAD (Bank of Canada rates)…') + '</p>';
        await convertFx(f.p, async u => { const r = await fetch(u); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }, taxNow().tz); }
      const m = mergeFiles(P); notes0 = []; drawNotes(); dupNote = m.dupes || 0; stale = false;
      name = files.map(x => x.name).join(', '); cur = m; year = null; render(); });
    applyStatic(); drawFileTz(); drawTax(); vbtn.textContent = T('Valider les imports', 'Confirm imports');
    { const sw = doc.getElementById('calang'); if (sw) sw.addEventListener('click', e => { const b = e.target.closest('button[data-lang]'); if (!b || b.dataset.lang === LANG) return;
      setLang(b.dataset.lang); try { W.localStorage.setItem(LANG_KEY, LANG); } catch (x) {} applyStatic(); drawFileTz(); drawTax(); vbtn.textContent = T('Valider les imports', 'Confirm imports'); drawFiles(); drawNotes(); draw();
      try { doc.dispatchEvent(new (W.CustomEvent || CustomEvent)('kx-ca-lang', { detail: LANG })); } catch (x) {} }); }
    async function readOne(f) {
      const data = new Uint8Array(await f.arrayBuffer()); let p;
      try { if (/\.(xlsx|xls)$/i.test(f.name)) { if (!W.XLSX) return { err: () => '<p class="warn">' + T('Lecture Excel indisponible. Rechargez la page.', 'Excel reading unavailable. Reload the page.') + '</p>' }; p = fromWorkbook(W.XLSX, data, f.name); }
        else if (/\.pdf$/i.test(f.name)) { if (!W.pdfjsLib || !KP) return { err: () => '<p class="warn">' + T('Lecture PDF indisponible. Rechargez la page.', 'PDF reading unavailable. Reload the page.') + '</p>' };
          W.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js'; out.innerHTML = '<p class="hint">' + T('Lecture du PDF…', 'Reading the PDF…') + '</p>';
          const d = await W.pdfjsLib.getDocument({ data, isEvalSupported: false }).promise; let lines = [];
          for (let i = 1; i <= d.numPages; i++) { const c = await (await d.getPage(i)).getTextContent(); lines = lines.concat(KP.itemsToLines(c.items)); }
          p = fromPdfLines(lines); if (!p.txs.length) return { err: () => '<p class="warn">' + esc(f.name) + T(' : aucune transaction crypto trouvée dans ce PDF. Rien n\'a été calculé.', ': no crypto transaction found in this PDF. Nothing was computed.') + '</p>' }; }
        else p = fromCSVText(data, f.name); }
      catch (x) { return { err: () => '<p class="warn">' + esc(f.name) + T(' : fichier illisible. Rien n\'a été calculé.', ': unreadable file. Nothing was computed.') + '</p>' }; }
      if (p.missingCols.length) return { err: () => '<p class="warn">' + esc(f.name) + T(' : colonnes introuvables : ', ': columns not found: ') + esc(p.missingCols.join(', ')) + T('. Attendu au moins Date, Type, Actif, Quantité, et Total ou Prix.', '. Expected at least Date, Type, Asset, Quantity, and Total or Price.') + '</p>' };
      return { p };
    }
  }
  api.mount = mount;
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount(document)); else mount(document); }
  if (node) module.exports = api; else root.KryptaxCA = api;
})(typeof window !== 'undefined' ? window : this);
