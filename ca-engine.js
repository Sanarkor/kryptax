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
  /* Fuseaux du Canada (heure locale pour les dates fiscales). */
  const CA_TZ = [['America/St_Johns', 'Terre-Neuve'], ['America/Halifax', 'Atlantique'], [TORONTO, "Est (Toronto, Montréal)"], ['America/Winnipeg', 'Centre (Winnipeg)'], ['America/Regina', 'Saskatchewan'], ['America/Edmonton', 'Rocheuses (Edmonton, Calgary)'], ['America/Vancouver', 'Pacifique (Vancouver)'], ['America/Whitehorse', 'Yukon']];
  const CA_ZONES = CA_TZ.map(z => z[0]).concat(['America/Montreal', 'America/Moncton', 'America/Glace_Bay', 'America/Goose_Bay', 'America/Iqaluit', 'America/Rankin_Inlet', 'America/Swift_Current', 'America/Yellowknife', 'America/Dawson_Creek', 'America/Fort_Nelson', 'America/Cambridge_Bay', 'America/Inuvik', 'America/Dawson', 'America/Atikokan', 'America/Creston', 'America/Resolute', 'America/Nipigon', 'America/Thunder_Bay', 'America/Rainy_River', 'America/Pangnirtung', 'America/Blanc-Sablon']);
  const tzName = z => { const f = CA_TZ.find(x => x[0] === z); return (f ? f[1] + ' ' : '') + '(' + z + ')'; };
  /* Zone des dates fiscales : choisie > zone du fichier si canadienne > zone du navigateur si canadienne > Est (Toronto) par défaut. */
  function resolveTaxTz(choice, fileTz, browserTz) {
    if (choice && choice !== 'auto' && CA_ZONES.includes(choice)) return { tz: choice, how: 'choisie' };
    if (CA_ZONES.includes(fileTz)) return { tz: fileTz, how: 'même zone que le fichier' };
    if (CA_ZONES.includes(browserTz)) return { tz: browserTz, how: 'zone de ce navigateur' };
    return { tz: TORONTO, how: 'par défaut (Est)' };
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
  function fromBinance(B) {
    const out = { txs: [], skipped: B.skipped.slice(), missingCols: [], currency: null, platform: B.platform, tzNote: B.tzNote, binance: true }, noVal = [];
    for (const e of B.events) {
      const t = { line: e.line, date: e.date, type: e.type, rawType: e.rawType, asset: e.asset, qty: e.qty, amt: NaN, feeAmt: 0, cur: 'CAD', toAsset: e.toAsset || '', toQty: e.toQty || NaN };
      if (e.tz) t.tz = e.tz;
      if (e.type === 'BUY' || e.type === 'SELL' || e.type === 'SPEND') { t.amt = e.amt; t.cur = e.cur; t.feeAmt = e.feeAmt || e.feeCurAmt || 0;
        if (e.type === 'BUY' && e.feeQty > 0) { t.qty = Math.max(0, e.qty - e.feeQty); out.skipped.push({ line: e.line, why: 'frais payés dans le jeton acheté : quantité reçue nette des frais, frais non ajoutés au coût', kept: true }); } }
      else if (e.type !== 'TRANSFER') noVal.push(e.line);
      if (t.qty > 0) push(out, t);
    }
    noVal.forEach(l => out.skipped.push({ line: l, why: 'pas de valeur dans le fichier Binance (échange entre jetons ou récompense) : valeur manquante, à vérifier', kept: true }));
    if (!B.tz) out.skipped.push({ line: 'fichier', why: 'fuseau non indiqué dans le fichier Binance : heures lues dans la zone choisie pour le fichier', kept: true });
    out.txs.sort((a, b) => a.date - b.date || String(a.line).localeCompare(String(b.line), undefined, { numeric: true }));
    return out;
  }
  function parseRows(rows, name) {
    { const B = KF.binanceLedger && KF.binanceLedger(rows, name); if (B) return fromBinance(B); }
    const hi = headerIndex(rows), head = rows[hi] || [], m = mapHeader(head), out = { txs: [], skipped: [], missingCols: ['date', 'type', 'asset', 'qty'].filter(k => m[k] == null), currency: headCurrency(head) };
    if (out.missingCols.length) return out;
    const body = rows.slice(hi + 1), order = slashOrder(body.map(r => r[m.date])); out.dateOrder = order;
    let assumed = 0;
    body.forEach((r, i) => {
      const g = k => m[k] == null ? '' : r[m[k]], line = hi + i + 2;
      if (!r.some(x => String(x).trim() !== '')) return;
      const type = kind(g('type')), D = caDate(g('date'), order), asset = String(g('asset') || '').trim().toUpperCase(), qty = num(g('qty'));
      if (!type || !isFinite(D.date) || !asset || !(qty > 0)) { out.skipped.push({ line, why: !type ? 'type inconnu' : D.amb ? 'date ambiguë (JJ/MM ou MM/JJ) : indiquez la date au format AAAA-MM-JJ' : !isFinite(D.date) ? 'date illisible' : 'actif ou quantité manquant' }); return; }
      const cs = [...new Set(['price', 'total', 'fee'].map(k => curOf(g(k))).filter(Boolean))];
      if (cs.length > 1) { out.skipped.push({ line, why: 'devises différentes dans la ligne, à vérifier' }); return; }
      let cur = cs[0] || out.currency; if (!cur) { cur = 'CAD'; assumed++; }
      if (cur === 'AMBIG') { out.skipped.push({ line, why: 'symbole « $ » seul : CAD ou USD ? Précisez la devise dans l\'en-tête (ex. Total (CAD))' }); return; }
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
    { const B = KF.binancePdfRows && KF.binancePdfRows(lines); if (B) { const o = parseRows(B, ''); o.pdf = true; if (B.info.unread) o.skipped.push({ line: 'PDF', why: B.info.unread + ' ligne(s) Binance du PDF illisible(s), à vérifier' }); return o; } }
    const r = KP.parsePdfLines(lines, { keepCur: true }), out = { txs: [], skipped: [], missingCols: [], currency: null, pdf: true };
    const add = (row, n) => {
      const raw = String(row[1] || ''), g = E.guessType(raw, '', true), type = TYPEMAP[g] || kind(raw), D = caDate(String(row[6] || ''), 'DMY'), asset = String(row[0] || '').toUpperCase(), qty = num(row[2]);
      if (!type || !isFinite(D.date) || !asset || !(qty > 0)) { out.skipped.push({ line: n, why: g === 'EXCH_OUT' ? 'échange sans l\'actif reçu, à vérifier' : !type ? 'type inconnu' : 'ligne illisible' }); return; }
      const cs = [...new Set([row[3], row[4], row[5]].map(curOf).filter(Boolean))]; if (cs.length > 1 || cs[0] === 'AMBIG') { out.skipped.push({ line: n, why: cs.length > 1 ? 'devises différentes dans la ligne, à vérifier' : 'symbole « $ » seul : devise à préciser' }); return; }
      if (!cs.length) { out.skipped.push({ line: n, why: 'devise non indiquée dans le relevé PDF, à vérifier' }); return; }
      const price = num(row[3]), val = num(row[4]), fee = num(row[5]);
      const t = { line: n, date: D.date, type, rawType: raw, asset, qty, amt: isFinite(val) ? val : isFinite(price) ? price * qty : NaN, feeAmt: isFinite(fee) && fee > 0 ? fee : 0, cur: cs[0], toAsset: '', toQty: NaN };
      if (D.tz) t.tz = D.tz; if (D.dateOnly) t.dateOnly = true; push(out, t);
    };
    r.rows.forEach((row, i) => add(row, 'PDF ' + (i + 1))); r.rows2.forEach((x, i) => add(x.row, 'PDF ' + (r.rows.length + i + 1)));
    r.amb.forEach(a => out.skipped.push({ line: 'PDF', why: 'quantité × prix différent de la valeur : valeur indiquée utilisée, à vérifier', kept: !!a.kept }));
    out.txs.sort((a, b) => a.date - b.date); return out;
  }
  /* Conversion en CAD : taux quotidien de la Banque du Canada (Valet, séries FX<devise>CAD), du jour ou du jour coté précédent le plus proche
     (Folio S5-F4-C1 ¶1.4 ; au plus 7 jours en arrière ici). Devise non cotée ou pas de taux : ligne exclue, à vérifier. Jamais USD = CAD. */
  const BOC = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'NZD', 'SEK', 'NOK', 'HKD', 'SGD', 'CNY', 'INR', 'MXN', 'BRL', 'ZAR', 'KRW', 'TRY', 'TWD', 'THB', 'IDR', 'MYR', 'PEN', 'SAR', 'VND', 'RUB'];
  const FX_SRC = 'Banque du Canada, taux quotidiens (bankofcanada.ca/valet)';
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
        if (!r) { t.drop = true; p.skipped.push({ line: t.line, why: (BOC.includes(c) ? 'aucun taux ' + c + '/CAD de la Banque du Canada trouvé pour le ' + day : 'devise ' + c + ' non cotée par la Banque du Canada') + ' : exclue, à vérifier' }); p.fx.missing++; continue; }
        t.cad = t.amt * r.rate; t.fee = t.feeAmt * r.rate; t.fx = { cur: c, rate: r.rate, on: r.on }; delete t.needFx; p.fx.count++; if (!p.fx.cur.includes(c)) p.fx.cur.push(c); }
    }
    p.txs = p.txs.filter(t => !t.drop); return p;
  }
  function fromCSVText(input, name) { return parseRows(Array.from(KF.parseCSV(input)), name); }
  function fromWorkbook(X, data, name) {
    const wb = X.read(data, { cellDates: true }); let best = null;
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
  const INCL_SRC = { 2024: 'ARC, « Capital losses » : tableau « From 2001 to 2025 | 1/2 »', 2025: 'ARC, « Capital losses » : « The inclusion rate for 2025 is 50% »', 2026: 'Loi de l\'impôt sur le revenu, art. 38 a) (« ½ »), lois-justice à jour au 19/10/2026 ; guide ARC 2026 pas encore publié, à vérifier' };
  /* Formulaire (vérifié) : Annexe 3 2025 = section « Crypto-assets » ; 2024 = section « Bonds, debentures, promissory notes, crypto-assets, and other similar properties ». */
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
      if (qty > have * (1 + 1e-9) + EPS) { base.status = 'à vérifier : aucune acquisition trouvée pour ' + +(qty - have).toPrecision(10) + ' ' + asset; p.q = 0; p.c = 0; p.unknown = false; }
      else { const acb = have > 0 ? p.c * Math.min(qty, have) / have : 0; const u = p.unknown; p.q = Math.max(0, have - qty); p.c = p.q <= EPS ? 0 : p.c - acb; if (p.q <= EPS) { p.q = 0; p.unknown = false; }
        if (u) base.status = 'à vérifier : coût (PBR) inconnu pour une partie des unités'; else base.acb = r2(acb);
        if (base.proceeds == null) base.status = 'à vérifier : valeur en CAD manquante';
        if (base.status === 'ok') base.gain = r2(proceeds - acb - (fee || 0)); }
      p.hist.push({ day: d, q: p.q }); disposals.push(base); return base; };
    for (const { t } of ev) {
      const d = dayOf(t), v = isFinite(t.cad) ? t.cad : null; if (d > lastDay) lastDay = d;
      if (t.type === 'BUY') acquire(t.asset, d, t.qty, v == null ? null : v + (t.fee || 0), t.line, 'achat');
      else if (t.type === 'SELL' || t.type === 'SPEND') dispose(t.asset, d, t.qty, v, t.fee, t.line);
      else if (t.type === 'GIFT') dispose(t.asset, d, t.qty, v, t.fee, t.line, { gift: true });
      else if (t.type === 'CONVERT') {
        if (!t.toAsset || !(t.toQty > 0)) { notes.push({ line: t.line, why: 'échange sans actif ou quantité reçus : non calculé' }); continue; }
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
        x.status = 'perte à examiner : perte apparente possible' + (incomplete ? ' (données à compléter jusqu\'au ' + dmy((x.day + 30) * DAY) + ')' : ''); }
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
    return { year: y, count: ok.length, proceeds: sum(ok, x => x.proceeds), acb: sum(ok, x => x.acb), fees: sum(ok, x => x.fees), gains, losses, net, rate, rateSrc: INCL_SRC[y] || null, form: FORM[y] || null,
      taxable: rate == null ? null : net > 0 ? r2(net * rate) : 0, allowableLoss: rate == null ? null : net < 0 ? r2(-net * rate) : 0,
      candidates: cand, candidateLoss: sum(cand, x => -x.gain), toVerify: tv, disposals: D, income: inc, incomeCad: sum(inc.filter(x => x.cad != null), x => x.cad), incomeUnknown: inc.filter(x => x.cad == null).length };
  }
  const p2 = n => String(n).padStart(2, '0');
  const cad = v => v == null || !isFinite(v) ? 'à vérifier' : (v < 0 ? '-' : '') + Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0').replace('.', ',') + '\u00a0$';
  const dmy = t => { if (t == null) return 'inconnue'; const d = new Date(t); return p2(d.getUTCDate()) + '/' + p2(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear(); };
  const LEGAL = 'Estimation à vérifier, pas un conseil fiscal ni une déclaration. Règles : ARC (crypto-actifs, gains et pertes en capital, perte apparente), Loi de l\'impôt sur le revenu art. 38 a), Folio S5-F4-C1 (taux Banque du Canada). Détail : docs/CA-RULES.md.';
  function ranges(ns) { ns = [...new Set(ns)].sort((a, b) => a - b); const o = []; for (let i = 0; i < ns.length; i++) { let j = i; while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++; o.push(j > i ? ns[i] + '-' + ns[j] : String(ns[i])); i = j; } return o.join(', '); }
  function groupLines(items, max) { const G = new Map(); items.forEach(x => { if (!G.has(x.why)) G.set(x.why, []); G.get(x.why).push(x.line); }); const out = [];
    G.forEach((ls, why) => { if (ls.length <= (max || 1)) { ls.forEach(l => out.push({ text: (/^\d+$/.test(String(l)) ? 'Ligne ' + l : String(l)) + ' : ' + why, n: 1 })); return; }
      const num = ls.filter(l => /^\d+$/.test(String(l))).map(Number), other = ls.filter(l => !/^\d+$/.test(String(l)));
      out.push({ text: [num.length ? 'lignes ' + ranges(num) : '', other.length ? [...new Set(other)].slice(0, 12).join(', ') + (new Set(other).size > 12 ? '…' : '') : ''].filter(Boolean).join(' ; ') + ' : ' + why + ' (' + ls.length + ' lignes)', n: ls.length }); });
    return out; }
  function checks(res, Y) { const chk = [];
    Y.toVerify.slice(0, 30).forEach(x => chk.push(dmy(x.date) + ' ' + x.asset + ' : ' + x.status.replace(/^à vérifier : /, '') + ' (hors totaux).'));
    if (Y.toVerify.length > 30) chk.push((Y.toVerify.length - 30) + ' autre(s) disposition(s) à vérifier (hors totaux).');
    if (Y.candidates.length) chk.push(Y.candidates.length + ' perte(s) à examiner (perte apparente possible, ' + cad(-Y.candidateLoss) + ') : exclue(s) du total définitif. Si la perte est apparente, elle n\'est pas déductible ; elle s\'ajoute « usually » au PBR du bien substitué seulement si c\'est vous qui l\'avez acquis (ARC). Aucun ajustement n\'est calculé ici.');
    chk.push('Achats du même actif par votre conjoint, une société que vous contrôlez ou une autre personne affiliée dans les 30 jours : invisibles ici, ils peuvent rendre une perte apparente.');
    if (Y.disposals.some(x => x.gift)) chk.push('Dons : disposition à la juste valeur marchande, règles particulières (conjoint, organisme de bienfaisance) non traitées, à vérifier.');
    if (Y.income.length) chk.push(Y.income.length + ' récompense(s) (staking, minage, airdrop…) : revenu ou capital selon votre situation, à examiner ; l\'ARC traite généralement le staking sur une plateforme centralisée comme un revenu au moment du crédit. ' + (Y.incomeUnknown ? Y.incomeUnknown + ' sans valeur : coût inconnu, les ventes suivantes de cet actif sont à vérifier.' : ''));
    if (res.transfers && res.transfers.withFee) chk.push(res.transfers.withFee + ' transfert(s) avec frais : frais réseau non traités, à vérifier.');
    if (res.fx && res.fx.count) chk.push(res.fx.count + ' ligne(s) converties en CAD (' + res.fx.cur.join(', ') + ') au taux ' + FX_SRC + ' : du jour ou du jour coté précédent (Folio S5-F4-C1 ¶1.4).');
    if (res.fx && res.fx.missing) chk.push(res.fx.missing + ' ligne(s) sans taux de change : exclues, à vérifier.');
    if (res.assumedCad) chk.push(res.assumedCad + ' ligne(s) sans devise indiquée : montants supposés en CAD, à vérifier.');
    { const K = (res.skipped || []).filter(x => x.kept); groupLines(K, 1).forEach(g => chk.push(g.text + '.')); }
    groupLines(res.notes || [], 5).forEach(g => chk.push(g.text + '.'));
    if (Y.rate == null) chk.push('Taux d\'inclusion ' + Y.year + ' : non vérifié, aucun gain imposable calculé.');
    chk.push('Pertes en capital d\'autres années, autres biens, activité d\'entreprise et impôt fédéral ou provincial : non inclus.');
    return chk; }
  const csvSafe = (s => /^(?:[=+@\t\r]|-(?![\d.]|$))/.test(s) ? "'" + s : s);
  function toCSV(res, y) {
    const Y = yearSummary(res, y), q = v => { const s = csvSafe(String(v == null ? '' : v)); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }, n = v => v == null ? 'à vérifier' : v.toFixed(2);
    const L = [['Kryptax Canada - feuille de calcul des gains en capital crypto (estimation, à vérifier ; pas un formulaire officiel)'], ['Année civile', Y.year + ' (1er janvier au 31 décembre)'],
      ['Dates fiscales', tzName(res.taxTz) + ' ; heures du fichier : ' + res.fileTz + ' (décalages explicites respectés)'], ['Formulaire', Y.form || 'Annexe 3 ' + Y.year + ' : non lue, à vérifier'], [],
      ['Rubrique', 'Montant (CAD)'], ['Nombre de dispositions (total définitif)', Y.count], ['Produit de disposition', n(Y.proceeds)], ['PBR (prix de base rajusté)', n(Y.acb)], ['Dépenses de disposition', n(Y.fees)],
      ['Gains', n(Y.gains)], ['Pertes (définitives)', n(Y.losses)], ['Gain ou perte net', n(Y.net)], ['Taux d\'inclusion', Y.rate == null ? 'à vérifier' : '1/2'], ['Source du taux', Y.rateSrc || 'non lue'],
      ['Gain en capital imposable (ligne 12700 si positif)', Y.taxable == null ? 'à vérifier' : n(Y.taxable)], ['Perte en capital déductible (reportable)', Y.allowableLoss == null ? 'à vérifier' : n(Y.allowableLoss)],
      ['Pertes à examiner (perte apparente possible, hors totaux)', n(Y.candidateLoss)], [],
      ['Date', 'Actif', 'Quantité', 'Produit', 'PBR', 'Dépenses', 'Gain ou perte', 'Statut']];
    Y.disposals.forEach(x => L.push([dmy(x.date), x.asset, +x.qty.toPrecision(10), n(x.proceeds), n(x.acb), n(x.fees), x.gain == null ? (x.superficial ? '' : 'à vérifier') : n(x.gain), x.status + (x.superficial ? ' ; acquis dans la fenêtre : ' + x.superficial.acqQty + ' ; détenu à J+30 : ' + (x.superficial.incomplete ? 'inconnu' : x.superficial.held) : '') + (x.swap ? ' ; échange contre ' + x.swap : '')]));
    Y.candidates.forEach(x => { const r = L.find(l => l[0] === dmy(x.date) && l[1] === x.asset && l[6] === ''); if (r) r[6] = n(x.gain) + ' (à examiner)'; });
    if (Y.income.length) { L.push([], ['Récompenses (revenu ou capital selon votre situation, à examiner)'], ['Date', 'Actif', 'Quantité', 'Valeur (CAD)', 'Type']); Y.income.forEach(x => L.push([dmy(x.day * DAY), x.asset, +x.qty.toPrecision(10), x.cad == null ? 'valeur manquante - à vérifier' : n(x.cad), x.type])); }
    L.push([], ['À vérifier']); checks(res, Y).forEach(c => L.push([c])); L.push([], [LEGAL]);
    return L.map(r => r.map(q).join(',')).join('\r\n') + '\r\n';
  }
  const ascii = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u00ab\u00bb\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'").replace(/[\u2013\u2014\u2212]/g, '-').replace(/[\u00a0\u2007\u2009\u202f]/g, ' ').replace(/\u2026/g, '...').replace(/\u00d7/g, 'x').replace(/\u00bd/g, '1/2').replace(/\u0153/g, 'oe').replace(/\u20ac/g, 'EUR ').replace(/[^\x20-\x7e]/g, '?');
  function pdfData(res, y, now) {
    const Y = yearSummary(res, y); now = now || new Date();
    const info = ['Annee civile ' + Y.year + '. Generee le ' + now.getUTCFullYear() + '-' + p2(now.getUTCMonth() + 1) + '-' + p2(now.getUTCDate()) + ' UTC. Feuille de calcul, pas un formulaire officiel.',
      'PBR : cout moyen pondere par actif identique, tous portefeuilles. Dates fiscales : ' + tzName(res.taxTz) + ' ; heures du fichier : ' + res.fileTz + '.',
      (Y.form || 'Annexe 3 ' + Y.year + ' : non lue, a verifier') + '.',
      'Dispositions ' + Y.count + ' | produit ' + cad(Y.proceeds) + ' | PBR ' + cad(Y.acb) + ' | depenses ' + cad(Y.fees) + ' | gains ' + cad(Y.gains) + ' | pertes ' + cad(Y.losses) + ' | net ' + cad(Y.net),
      'Inclusion ' + (Y.rate == null ? 'a verifier' : '1/2 (' + Y.rateSrc + ')') + ' | gain imposable ' + (Y.taxable == null ? 'a verifier' : cad(Y.taxable)) + ' | perte deductible ' + (Y.allowableLoss == null ? 'a verifier' : cad(Y.allowableLoss)) + '. Aucun impot calcule.',
      (Y.candidates.length ? Y.candidates.length + ' perte(s) a examiner (perte apparente possible) : ' + cad(-Y.candidateLoss) + ', hors totaux. ' : '') + (Y.toVerify.length ? Y.toVerify.length + ' disposition(s) a verifier, hors totaux.' : '')];
    if (Y.income.length) info.push('Recompenses : ' + cad(Y.incomeCad) + (Y.incomeUnknown ? ' + ' + Y.incomeUnknown + ' sans valeur' : '') + ' (revenu ou capital selon votre situation, a examiner).');
    checks(res, Y).forEach(c => info.push('A verifier : ' + c));
    const rows = Y.disposals.map(x => [dmy(x.date), x.asset, String(+x.qty.toPrecision(10)), cad(x.proceeds), cad(x.acb), cad(x.fees), x.gain == null ? 'a verifier' : cad(x.gain), x.status === 'ok' ? '' : x.status].map(ascii));
    return { title: ascii('Kryptax Canada - gains en capital crypto ' + Y.year + ' (estimation)'), info: info.map(ascii), head: ['Date', 'Actif', 'Qte', 'Produit', 'PBR', 'Depenses', 'Gain/perte', 'Statut'], rows, foot: ascii(LEGAL) };
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
  const api = { CA_TZ, CA_ZONES, tzName, resolveTaxTz, COLS, mapHeader, curOf, kind, caDate, slashOrder, parseRows, fromCSVText, fromWorkbook, fromPdfLines, convertFx, rateOn, BOC, FX_SRC, shiftTz, INCL, INCL_SRC, FORM, compute, yearSummary, checks, toCSV, pdfData, pdf, cad, dmy, csvSafe, ascii, fileName, mergeFiles, LEGAL };
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
      taxSel.innerHTML = `<option value="auto">Automatique : ${esc(tzName(a.tz))} — ${esc(a.how)}</option>` + CA_TZ.map(z => `<option value="${esc(z[0])}">${esc(z[1] + ' (' + z[0] + ')')}</option>`).join(''); taxSel.value = taxChoice; };
    if (tzSel) { const L = [['UTC', 'UTC']].concat(CA_TZ.map(z => [z[0], z[1] + ' (' + z[0] + ')'])); if (!L.some(z => z[0] === browserTz)) L.push([browserTz, 'Ce navigateur (' + browserTz + ')']);
      tzSel.innerHTML = L.map(z => `<option value="${esc(z[0])}">${esc(z[1])}</option>`).join(''); tzSel.value = fileTz;
      tzSel.addEventListener('change', () => { fileTz = tzSel.value; drawTax(); if (cur) render(); }); }
    if (taxSel) { drawTax(); taxSel.addEventListener('change', () => { taxChoice = taxSel.value; if (cur) render(); }); }
    const save = (blob, fn) => { const a = doc.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fn; doc.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
    function render() {
      const tx = taxNow(); full = compute(cur.txs, { fileTz, taxTz: tx.tz }); full.fx = cur.fx; full.skipped = cur.skipped; full.assumedCad = cur.assumedCad; const Ys = full.years.map(String);
      if (!year || !Ys.includes(String(year))) year = Ys.length ? Ys[Ys.length - 1] : null;
      if (!year) { out.innerHTML = '<p class="warn">' + esc(name) + ' : aucune disposition ni récompense trouvée. Rien à déclarer.</p>' + skippedHtml(); return; }
      const Y = yearSummary(full, year), c = (l, v, k) => `<div><span>${l}</span><b class="${k || ''}">${v}</b></div>`;
      const sel = Ys.length > 1 ? `<div class="grid"><label>Année <select id="cayear">${Ys.map(y => `<option value="${y}"${y === String(year) ? ' selected' : ''}>${y}</option>`).join('')}</select></label></div>` : '';
      const tr = Y.disposals.map(x => `<tr class="${x.status === 'ok' ? '' : 'tv'}"><td>${dmy(x.date)}</td><td>${esc(x.asset)}${x.gift ? ' <span class="hint">(don)</span>' : ''}${x.swap ? ' <span class="hint">→ ' + esc(x.swap) + '</span>' : ''}</td><td>${+x.qty.toPrecision(10)}</td><td>${cad(x.proceeds)}</td><td>${cad(x.acb)}</td><td>${cad(x.fees)}</td><td>${x.gain == null ? 'à vérifier' : cad(x.gain)}${x.status === 'ok' ? '' : '<br><b>' + esc(x.status) + '</b>'}</td></tr>`).join('');
      const chk = checks(full, Y).map(esc);
      out.innerHTML = `<h2 class="usreshead">2. Résultat ${esc(year)}</h2>` + sel
        + '<div class="kxkpi halo" aria-hidden="true">' + c('Gain ou perte net', cad(Y.net), Y.net < 0 ? 'neg' : 'pos') + c('Gains', cad(Y.gains)) + c('Pertes', cad(Y.losses)) + (Y.taxable != null ? c('Gain imposable (1/2)', cad(Y.taxable)) : '') + '</div>'
        + `<div class="note usguide"><b>Feuille de calcul pour l'Annexe 3 (${esc(year)})</b><div class="scroll"><table class="us8949 uksa"><tr><th>Rubrique</th><th>Montant</th></tr>`
        + [['Dispositions (total définitif)', String(Y.count)], ['Produit de disposition', cad(Y.proceeds)], ['PBR (prix de base rajusté)', cad(Y.acb)], ['Dépenses de disposition', cad(Y.fees)], ['Gain ou perte net', cad(Y.net)], ['Taux d\'inclusion', Y.rate == null ? 'à vérifier' : '1/2'], ['Gain en capital imposable (ligne 12700)', Y.taxable == null ? 'à vérifier' : cad(Y.taxable)], ['Perte en capital déductible (reportable)', Y.allowableLoss == null ? 'à vérifier' : cad(Y.allowableLoss)]].map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')
        + `</table></div><span class="hint">${esc(Y.form || 'Annexe 3 ' + year + ' : formulaire non lu, à vérifier')}. Taux : ${esc(Y.rateSrc || 'non vérifié')}. Seulement les dispositions de ces fichiers — à vérifier.</span></div>`
        + (Y.candidates.length ? `<div class="note warn" role="status"><b>Pertes à examiner : ${cad(-Y.candidateLoss)}</b> (${Y.candidates.length}) — perte apparente possible, hors du total définitif. <span class="hint">Même actif acquis dans les 30 jours avant ou après et encore détenu 30 jours après, ou fichier qui ne couvre pas ces 30 jours. Aucun refus ni ajout au PBR calculé : à examiner.</span></div>` : '')
        + `<div class="note total-global" role="status">Gain ou perte net ${esc(year)} : <b>${cad(Y.net)}</b><br><span class="hint">Dates fiscales : <b>${esc(tzName(tx.tz))}</b>, ${esc(tx.how)} ; heures du fichier : ${esc(fileTz)} (décalages explicites respectés). Année civile. Aucun impôt calculé (fédéral et provincial selon vos revenus). Estimation, pas un conseil fiscal.</span></div>`
        + `<div class="note"><b>À vérifier (${chk.length})</b><ul>${chk.map(x => '<li>' + x + '</li>').join('')}</ul></div>`
        + (Y.income.length ? `<div class="note"><b>Récompenses : ${cad(Y.incomeCad)}${Y.incomeUnknown ? ' + ' + Y.incomeUnknown + ' sans valeur' : ''}</b><br><span class="hint">Revenu ou capital selon votre situation — à examiner. Ajoutées au PBR à leur valeur en CAD quand elle est connue.</span></div>`
          + `<div class="scroll"><table class="us8949"><tr><th>Date</th><th>Actif</th><th>Quantité</th><th>Valeur CAD</th><th>Type</th></tr>${Y.income.map(x => `<tr class="${x.cad == null ? 'tv' : ''}"><td>${dmy(x.day * DAY)}</td><td>${esc(x.asset)}</td><td>${+x.qty.toPrecision(10)}</td><td>${x.cad == null ? 'valeur manquante - à vérifier' : cad(x.cad)}</td><td>${esc(x.type)}</td></tr>`).join('')}</table></div>` : '')
        + `<details class="usdet" open><summary>Dispositions (${Y.disposals.length})</summary><div class="scroll"><table class="us8949"><tr><th>Date</th><th>Actif</th><th>Quantité</th><th>Produit</th><th>PBR</th><th>Dépenses</th><th>Gain/perte</th></tr>${tr}</table></div></details>`
        + skippedHtml() + (cur.platform ? `<p class="hint" id="caplatform">Format reconnu : ${esc(cur.platform)}. Montants dans leur devise, convertis en CAD ; échanges entre jetons et récompenses sans valeur dans le fichier — à vérifier.</p>` : '')
        + `<p class="usexp"><button type="button" id="capdf" class="btn"${W.jspdf ? '' : ' hidden'}>Télécharger le PDF</button> <button type="button" id="cacsv" class="btn ghost">Télécharger le CSV</button></p>`;
    }
    const skippedHtml = () => { const S = cur ? cur.skipped.filter(x => !x.kept) : []; return S.length ? `<p class="hint">${S.length} ligne${S.length > 1 ? 's' : ''} ignorée${S.length > 1 ? 's' : ''} : ${esc(groupLines(S, 5).map(g => g.text).join(' ; '))}.</p>` : ''; };
    out.addEventListener('change', e => { if (e.target.id === 'cayear') { year = e.target.value; render(); } });
    out.addEventListener('click', e => { if (!full || !year) return;
      if (e.target.id === 'cacsv') save(new Blob(['\uFEFF', toCSV(full, year)], { type: 'text/csv;charset=utf-8' }), fileName(year, 'csv'));
      if (e.target.id === 'capdf' && W.jspdf) pdf(W.jspdf.jsPDF, full, year).save(fileName(year, 'pdf')); });
    { const hb = doc.getElementById('cahelpbtn'), hp = doc.getElementById('cahelppanel'); if (hb && hp) hb.addEventListener('click', () => { const op = hp.hidden; hp.hidden = !op; hb.setAttribute('aria-expanded', String(op)); }); }
    { const rb = doc.getElementById('careset'); if (rb) rb.addEventListener('click', () => { if (!W.confirm('Tout réinitialiser ? Les fichiers importés et les résultats de cette page seront effacés.')) return; cur = full = null; year = null; inp.value = ''; out.innerHTML = ''; files.length = 0; fmsg.innerHTML = ''; dirtyFiles(); }); }
    const zone = doc.getElementById('caimp');
    if (zone) { const has = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
      zone.addEventListener('dragover', e => { if (has(e)) { e.preventDefault(); zone.classList.add('dropover'); } });
      zone.addEventListener('dragleave', () => zone.classList.remove('dropover'));
      zone.addEventListener('drop', e => { zone.classList.remove('dropover'); if (!has(e)) return; e.preventDefault(); try { inp.files = e.dataTransfer.files; inp.dispatchEvent(new Event('change')); } catch (x) {} }); }
    inp.multiple = true; const files = [], flist = doc.createElement('ul'), vbtn = doc.createElement('button'), fmsg = doc.createElement('div');
    flist.className = 'flist'; flist.id = 'caflist'; flist.hidden = true; vbtn.type = 'button'; vbtn.className = 'btn validate'; vbtn.id = 'cavalidate'; vbtn.textContent = 'Valider les imports'; vbtn.disabled = true; fmsg.id = 'cafmsg';
    { const ib = doc.getElementById('caimp'); if (ib) { ib.appendChild(flist); ib.appendChild(vbtn); ib.appendChild(fmsg); } }
    const drawFiles = () => { flist.innerHTML = files.map((x, i) => `<li><span>${esc(x.name)} (${x.p.txs.length} ligne${x.p.txs.length > 1 ? 's' : ''})</span> <button type="button" class="small ghost" data-rmi="${i}" aria-label="Retirer ${esc(x.name)}">✕</button></li>`).join(''); flist.hidden = !files.length; };
    const dirtyFiles = () => { drawFiles(); vbtn.disabled = !files.length; cur = full = null; year = null; out.innerHTML = ''; };
    flist.addEventListener('click', e => { const b = e.target.closest('[data-rmi]'); if (!b) return; files.splice(+b.dataset.rmi, 1); fmsg.innerHTML = ''; dirtyFiles(); });
    inp.addEventListener('change', async () => {
      const F = Array.from(inp.files || []); if (!F.length) return; const notes = [];
      for (const f of F) { if (files.some(x => x.name === f.name && x.size === f.size)) { notes.push('<p class="warn">' + esc(f.name) + ' : déjà importé, ignoré.</p>'); continue; }
        const r = await readOne(f); if (r.err) notes.push(r.err); else files.push({ name: f.name, size: f.size, p: r.p }); }
      inp.value = ''; dirtyFiles(); fmsg.innerHTML = notes.join('');
    });
    vbtn.addEventListener('click', async () => { if (!files.length) return; vbtn.disabled = true;
      for (const f of files) if (f.p.txs.some(t => t.needFx)) { f.p.fileTz = fileTz; out.innerHTML = '<p class="hint">Conversion en CAD (taux de la Banque du Canada)…</p>';
        await convertFx(f.p, async u => { const r = await fetch(u); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }, taxNow().tz); }
      const m = mergeFiles(files.map(x => ({ name: x.name, p: x.p }))); fmsg.innerHTML = '';
      const note = (m.dupes ? '<p class="warn">' + m.dupes + ' ligne' + (m.dupes > 1 ? 's' : '') + ' déjà présente' + (m.dupes > 1 ? 's' : '') + ' dans un fichier précédent : comptée' + (m.dupes > 1 ? 's' : '') + ' une fois (à vérifier).</p>' : '');
      name = files.map(x => x.name).join(', '); cur = m; year = null; render(); if (note) out.insertAdjacentHTML('afterbegin', note); });
    async function readOne(f) {
      const data = new Uint8Array(await f.arrayBuffer()); let p;
      try { if (/\.(xlsx|xls)$/i.test(f.name)) { if (!W.XLSX) return { err: '<p class="warn">Lecture Excel indisponible. Rechargez la page.</p>' }; p = fromWorkbook(W.XLSX, data, f.name); }
        else if (/\.pdf$/i.test(f.name)) { if (!W.pdfjsLib || !KP) return { err: '<p class="warn">Lecture PDF indisponible. Rechargez la page.</p>' };
          W.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js'; out.innerHTML = '<p class="hint">Lecture du PDF…</p>';
          const d = await W.pdfjsLib.getDocument({ data, isEvalSupported: false }).promise; let lines = [];
          for (let i = 1; i <= d.numPages; i++) { const c = await (await d.getPage(i)).getTextContent(); lines = lines.concat(KP.itemsToLines(c.items)); }
          p = fromPdfLines(lines); if (!p.txs.length) return { err: '<p class="warn">' + esc(f.name) + ' : aucune transaction crypto trouvée dans ce PDF. Rien n\'a été calculé.</p>' }; }
        else p = fromCSVText(data, f.name); }
      catch (x) { return { err: '<p class="warn">' + esc(f.name) + ' : fichier illisible. Rien n\'a été calculé.</p>' }; }
      if (p.missingCols.length) return { err: '<p class="warn">' + esc(f.name) + ' : colonnes introuvables : ' + esc(p.missingCols.join(', ')) + '. Attendu au moins Date, Type, Actif, Quantité, et Total ou Prix.</p>' };
      return { p };
    }
  }
  api.mount = mount;
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount(document)); else mount(document); }
  if (node) module.exports = api; else root.KryptaxCA = api;
})(typeof window !== 'undefined' ? window : this);
