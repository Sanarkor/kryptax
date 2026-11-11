/* Kryptax — lecture des fichiers CSV/xlsx : colonnes génériques (Date, Crypto, Quantité, Montant…) et formats de plateformes
   reconnus d'après leurs en-têtes publiés (aucun fichier réel : voir les tests fictifs). Navigateur et Node. */
(function (root) {
  'use strict';
  const E = root.KryptaxEngine || (typeof require !== 'undefined' ? require('./engine.js') : null);
  const FIAT = ['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY'];
  const QUOTES = ['USDT', 'USDC', 'FDUSD', 'BUSD', 'TUSD', 'DAI', 'EURC', 'EURI', 'EUR', 'USD', 'GBP', 'CHF', 'TRY', 'BRL', 'BTC', 'ETH', 'BNB', 'XBT', 'SOL'];

  /* ---------- Texte et nombres ---------- */
  const norm = s => String(s == null ? '' : s).replace(/^\ufeff/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/["']/g, '').replace(/[_\s]+/g, ' ').trim();
  const num = (v, mode) => { const n = E.parseNum(typeof v === 'string' ? v.replace(/^[A-Z]{0,3}\$|^-[A-Z]{0,3}\$/, m => m[0] === '-' ? '-' : '') : v, mode); return n; };
  const dash = v => v == null || String(v).trim() === '' || String(v).trim() === '-';
  /* Dates de plateformes : sans fuseau = UTC (en-têtes « UTC »), sinon fuseau du fichier. */
  function utc(v) {
    if (v instanceof Date) return v.getTime(); if (typeof v === 'number') return v > 1e12 ? v : v > 1e9 ? v * 1000 : NaN;
    const s = String(v || '').trim().replace(/\s*UTC$/i, 'Z');
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})?$/);
    if (m) { if (m[8]) return Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}${m[8] === 'Z' ? 'Z' : m[8].replace(/^([+-]\d{2})(\d{2})$/, '$1:$2')}`);
      return Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Date.parse(s + 'T00:00:00Z');
    if (/^\d{9,10}(\.\d+)?$/.test(s)) return Math.round(parseFloat(s) * 1000);
    return E.parseDate(s, undefined, 'UTC');
  }
  /* Codes Kraken : XXBT -> BTC, XETH -> ETH, ZEUR -> EUR, XXDG -> DOGE, ETH2.S -> ETH2.S (suffixes gérés par le moteur de cours) */
  const KR = { XXBT: 'BTC', XBT: 'BTC', XXDG: 'DOGE', XDG: 'DOGE', XETH: 'ETH', XETC: 'ETC', XLTC: 'LTC', XXRP: 'XRP', XXLM: 'XLM', XXMR: 'XMR', XZEC: 'ZEC', XREP: 'REP', XMLN: 'MLN', ZEUR: 'EUR', ZUSD: 'USD', ZGBP: 'GBP', ZCAD: 'CAD', ZJPY: 'JPY', ZCHF: 'CHF', ZAUD: 'AUD' };
  const kAsset = a => { a = String(a || '').trim().toUpperCase(); return KR[a] || a; };
  const up = a => String(a || '').trim().toUpperCase();
  /* « 0.01000000BTC » -> [0.01, 'BTC'] ; « 500 EUR » -> [500, 'EUR'] */
  function qtyCoin(v) { const m = String(v || '').replace(/,/g, '').trim().match(/^(-?[\d.]+(?:e-?\d+)?)\s*([A-Za-z0-9]+)$/i); return m ? [Math.abs(parseFloat(m[1])), m[2].toUpperCase()] : [NaN, '']; }
  function splitPair(p, hint) {
    p = up(p).replace(/[-_]/g, '/');
    if (p.includes('/')) { const [b, q] = p.split('/'); return [kAsset(b), kAsset(q)]; }
    if (hint && p.startsWith(hint)) return [hint, p.slice(hint.length)];
    for (const q of [...Object.keys(KR).filter(k => k.length === 4), ...QUOTES]) if (p.length > q.length && p.endsWith(q)) return [kAsset(p.slice(0, -q.length)), kAsset(q)];
    return [p, ''];
  }

  /* ---------- Colonnes génériques (Date, Type, Crypto, Quantité, Montant…) ---------- */
  const CUR = /(\(|\s|^)(eur|euros?|€|usd|\$|gbp|£|chf)(\)|\s|$)/g;
  const bare = h => norm(h).replace(/[()\[\]:]/g, ' ').replace(CUR, ' ').replace(/\s+/g, ' ').trim();
  const SYN = {
    date: ['date', 'date utc', 'utc time', 'timestamp', 'time', 'horodatage', 'datetime', 'date et heure', 'date heure', 'completed date', 'started date', 'jour', 'date de l operation', 'date operation'],
    type: ['type', 'transaction type', 'type de transaction', 'operation', 'type d operation', 'side', 'sens', 'nature', 'kind', 'action'],
    asset: ['crypto', 'cryptomonnaie', 'crypto monnaie', 'asset', 'actif', 'coin', 'symbol', 'symbole', 'token', 'jeton', 'currency', 'devise', 'monnaie', 'ticker', 'crypto asset'],
    qty: ['quantite', 'quantity', 'qty', 'qte', 'quantity transacted', 'amount asset', 'montant crypto', 'quantite crypto', 'nombre', 'volume', 'vol', 'executed', 'units', 'unites', 'crypto amount', 'amount crypto'],
    price: ['prix unitaire', 'unit price', 'price', 'prix', 'cours', 'rate', 'taux', 'spot price', 'price at transaction', 'spot price at transaction', 'prix par unite', 'market price'],
    eur: ['montant', 'montant total', 'montant fiat', 'valeur', 'valeur totale', 'value', 'total', 'total value', 'amount fiat', 'fiat amount', 'fiat amount inc fees', 'fiat value', 'subtotal', 'sous total', 'prix total', 'cout', 'cout total', 'cost', 'proceeds', 'net amount', 'montant net', 'somme'],
    fee: ['frais', 'fee', 'fees', 'commission', 'commissions', 'fees and or spread', 'frais de transaction'],
    ref: ['order id', 'trade id', 'id ordre', 'id de l ordre', 'reference ordre', 'order reference', 'numero d ordre'], // v2.62 : identifiant d'ordre liant vente et achat d'un échange
    desc: ['description', 'notes', 'note', 'remarque', 'remark', 'libelle', 'commentaire', 'comment', 'product', 'details']
  };
  const ORDER = ['date', 'type', 'asset', 'qty', 'eur', 'price', 'fee', 'ref', 'desc'];
  /* Devise d'une colonne de montant d'après son en-tête (« Montant USD », « Total ($) ») ; € par défaut. */
  const headCur = h => { const s = norm(h); return /usd|\$/.test(s) ? 'USD' : /gbp|£/.test(s) ? 'GBP' : /chf/.test(s) ? 'CHF' : 'EUR'; };
  function guessMap(head) {
    const h = head.map(bare), m = {}, used = new Set();
    const take = (f, i) => { m[f] = i; used.add(i); };
    for (const f of ORDER) { const i = SYN[f].map(c => h.findIndex((x, j) => x === c && !used.has(j))).find(i => i > -1); if (i != null && i > -1) take(f, i); }
    // « Amount » seul : quantité s'il n'y en a pas d'autre, sinon montant
    const am = h.findIndex((x, j) => (x === 'amount' || x === 'montant crypto') && !used.has(j));
    if (am > -1) { if (m.qty == null) take('qty', am); else if (m.eur == null) take('eur', am); }
    for (const f of ORDER) if (m[f] == null) { const i = h.findIndex((x, j) => !used.has(j) && x && SYN[f].some(c => c.length > 3 && (x.startsWith(c + ' ') || x.endsWith(' ' + c)))); if (i > -1) take(f, i); }
    if (m.eur != null) m.cur = headCur(head[m.eur]);
    return m;
  }
  /* Ligne d'en-têtes : la première des 25 premières lignes qui contient une date et une quantité/un montant reconnus. */
  function headerRow(rows) {
    for (let i = 0; i < Math.min(rows.length, 25); i++) { const r = rows[i] || [], m = guessMap(r.map(String)); if (m.date != null && (m.qty != null || m.asset != null) && r.filter(x => String(x).trim()).length >= 3) return i; }
    return 0;
  }

  /* ---------- CSV : octets bruts → texte (BOM UTF-8/UTF-16, UTF-8 strict, repli windows-1252) ---------- */
  function decodeCSV(buf) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dec = (e, o) => new TextDecoder(e, o).decode(b);
    let text, enc;
    if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) { text = dec('utf-8'); enc = 'UTF-8 (BOM)'; }
    else if (b[0] === 0xFF && b[1] === 0xFE) { text = dec('utf-16le'); enc = 'UTF-16 LE'; }
    else if (b[0] === 0xFE && b[1] === 0xFF) { text = dec('utf-16be'); enc = 'UTF-16 BE'; }
    else {
      let z0 = 0, z1 = 0; const n = Math.min(b.length, 4000); for (let k = 0; k < n; k++) if (!b[k]) (k % 2 ? z1++ : z0++);
      if (n > 3 && z1 > n / 6 && z0 < n / 50) { text = dec('utf-16le'); enc = 'UTF-16 LE'; }
      else if (n > 3 && z0 > n / 6 && z1 < n / 50) { text = dec('utf-16be'); enc = 'UTF-16 BE'; }
      else { try { text = dec('utf-8', { fatal: true }); enc = 'UTF-8'; } catch (e) { text = dec('windows-1252'); enc = 'windows-1252'; } }
    }
    const repl = (text.match(/\ufffd/g) || []).length;
    return { text: normText(text), enc, repl };
  }
  /* retours ligne, espaces insécables/fines, signes moins unicode */
  const normText = s => String(s).replace(/^\ufeff/, '').replace(/\r\n?/g, '\n').replace(/[\u00a0\u202f\u2007\u2009]/g, ' ').replace(/\u2212|[\u2012-\u2014](?=\s*\d)/g, '-');
  /* ---------- CSV : séparateur , ; tabulation ou |, guillemets, préambule, lignes courtes ---------- */
  function parseCSV(text) {
    if (text && typeof text === 'object' && !(typeof text === 'string')) { const d = decodeCSV(text); const r = parseCSV(d.text); r.info.enc = d.enc; r.info.repl = d.repl; return r; }
    text = normText(text);
    const split = d => { const rows = []; let row = [], f = '', q = false;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
        else if (c === '"' && f.trim() === '') { q = true; f = ''; } else if (c === d) { row.push(f); f = ''; }
        else if (c === '\n') { row.push(f); f = ''; if (row.some(x => x.trim() !== '')) rows.push(row); row = []; }
        else f += c;
      }
      row.push(f); if (row.some(x => x.trim() !== '')) rows.push(row); return rows; };
    // séparateur : le plus grand nombre de lignes au même nombre de colonnes (> 1) sur les 30 premières
    let best = null;
    for (const d of [';', ',', '\t', '|']) { const R = split(d).slice(0, 30), cnt = {}; R.forEach(r => { if (r.length > 1) cnt[r.length] = (cnt[r.length] || 0) + 1; });
      const top = Object.entries(cnt).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]; const sc = top ? top[1] * 1000 + +top[0] : 0; if (!best || sc > best.sc) best = { d, sc }; }
    const rows = split(best.d).map(r => r.map(x => x.trim())), info = { delim: best.d, short: [] };
    // lignes courtes après l'en-tête : cellules manquantes complétées par des champs vides (signalées), jamais décalées
    const hi = headerRow(rows), w = (rows[hi] || []).length;
    // ligne trop longue d'un champ : nombre décimal non mis entre guillemets (« 104 190,5 » coupé en deux) → recollé et signalé
    info.merged = [];
    for (let k = hi + 1; k < rows.length; k++) if (rows[k].length === w + 1 && best.d === ',') { const r = rows[k]; for (let j = 0; j < r.length - 1; j++) if (/^-?\d{1,3}(?: \d{3})*$|^-?\d+$/.test(r[j]) && /^\d+$/.test(r[j + 1])) { r.splice(j, 2, r[j] + ',' + r[j + 1]); info.merged.push(k + 1); break; } }
    for (let k = hi + 1; k < rows.length; k++) if (rows[k].length < w) { info.short.push(k + 1); while (rows[k].length < w) rows[k].push(''); }
    rows.info = info; return rows;
  }

  /* ---------- Formats de plateformes (en-têtes publiés) ---------- */
  const FORMATS = [
    { id: 'binance', label: 'Binance (historique des transactions)', need: ['utc time', 'account', 'operation', 'coin', 'change'] },
    /* v2.40 : export récent « Transaction History » : colonne « Time » (heure du fuseau indiqué « (UTC+1) » dans le bandeau ou le nom du fichier) */
    { id: 'binance', label: 'Binance (historique des transactions)', need: ['time', 'account', 'operation', 'coin', 'change'], localTime: true },
    { id: 'binance-trades', label: 'Binance (historique des trades)', need: ['date(utc)', 'pair', 'side', 'price', 'executed', 'amount', 'fee'] },
    { id: 'binance-trades-old', label: 'Binance (historique des trades)', need: ['date(utc)', 'market', 'type', 'price', 'amount', 'total', 'fee', 'fee coin'] },
    { id: 'binance-convert', label: 'Binance (Convert)', need: ['date', 'pair', 'sell', 'buy', 'price', 'status'] },
    { id: 'kraken-ledgers', label: 'Kraken (ledgers)', need: ['refid', 'time', 'type', 'asset', 'amount', 'fee'] },
    { id: 'kraken-trades', label: 'Kraken (trades)', need: ['pair', 'time', 'type', 'price', 'cost', 'fee', 'vol'] },
    { id: 'coinbase', label: 'Coinbase', need: ['timestamp', 'transaction type', 'asset', 'quantity transacted'] },
    { id: 'bitpanda', label: 'Bitpanda', need: ['transaction id', 'timestamp', 'transaction type', 'in/out', 'amount fiat', 'fiat', 'amount asset', 'asset'] }
  ];
  function detect(rows) {
    for (let i = 0; i < Math.min(rows.length, 25); i++) {
      const h = (rows[i] || []).map(x => norm(x));
      for (const f of FORMATS) if (f.need.every(n => h.includes(n))) return { id: f.id, label: f.label, hi: i, col: n => h.indexOf(n), localTime: !!f.localTime };
    }
    return null;
  }

  /* Opérations « hors échange » communes */
  function kindOf(s) {
    s = norm(s);
    if (/airdrop|distribution|fork/.test(s)) return 'AIRDROP';
    if (/mining|minage/.test(s)) return 'INTEREST';
    if (/learn/.test(s)) return 'INTEREST';
    if (/stak|^earn|eth 2\.0|beth|launchpool|savings interest|simple earn.*(interest|reward)|locked rewards/.test(s)) return 'STAKING';
    if (/interest|reward|bonus|cashback|referral|commission rebate|commission history|learn|inflation|invite/.test(s)) return 'INTEREST';
    if (/gift|crypto box|cadeau|donation/.test(s)) return 'GIFT';
    return null;
  }
  /* Mouvements internes (aucun changement de propriétaire) : ignorés */
  const INTERNAL = /transfer between|transfer funds|main and funding|spot account and|subscription|redemption|savings purchase|staking purchase|allocation|deallocation|autoallocate|migration|spottostaking|stakingfromspot|stakingtospot|spotfromstaking|spottofutures|spotfromfutures|exchange deposit|exchange withdrawal|pro withdrawal|pro deposit|transfer\(stake\)|transfer\(unstake\)|transfer \(stake\)|transfer \(unstake\)|isolated margin|cross margin|futures|^margin/;

  /* Groupe de jambes (même horodatage / même refid) -> achat, vente ou échange. legs : { asset, d (signé), fee? } */
  function fromLegs(legs, base, push, opt) {
    const net = {}; legs.forEach(l => { if (l.asset) net[l.asset] = (net[l.asset] || 0) + l.d; });
    const fees = {}; (opt.fees || []).forEach(l => { if (l.asset) fees[l.asset] = (fees[l.asset] || 0) + Math.abs(l.d); });
    const ins = Object.keys(net).filter(a => net[a] > 1e-12), outs = Object.keys(net).filter(a => net[a] < -1e-12);
    const fIn = ins.filter(a => FIAT.includes(a)), fOut = outs.filter(a => FIAT.includes(a)), cIn = ins.filter(a => !FIAT.includes(a)), cOut = outs.filter(a => !FIAT.includes(a));
    const val = (fiat, q) => fiat === 'EUR' ? { eur: q } : { eur: 0, cur: fiat, valCur: q, fxPending: true };
    const feeOf = (a, fiat) => { const o = {}; if (fees[fiat] && fiat === 'EUR') { o.fee = fees[fiat]; delete fees[fiat]; } else if (fees[fiat]) { o.feeCur = fees[fiat]; delete fees[fiat]; } if (fees[a]) { o.feeQty = fees[a]; delete fees[a]; } return o; };
    let ok = false;
    if (fOut.length === 1 && cIn.length === 1 && !cOut.length) { const q = net[cIn[0]], fe = feeOf(cIn[0], fOut[0]); if (fe.feeQty) fe.feeQty = Math.min(fe.feeQty, q); push(Object.assign({ type: 'BUY', asset: cIn[0], qty: q }, val(fOut[0], -net[fOut[0]]), fe)); ok = true; }
    else if (cOut.length === 1 && fIn.length === 1 && !cIn.length) { push(Object.assign({ type: opt.pay ? 'PAY' : 'SELL', asset: cOut[0], qty: -net[cOut[0]] }, val(fIn[0], net[fIn[0]]), feeOf(cOut[0], fIn[0]))); ok = true; }
    else if (cOut.length >= 1 && cIn.length >= 1 && !fIn.length && !fOut.length) { cOut.forEach((a, k) => push({ type: 'EXCH_OUT', asset: a, qty: -net[a], eur: 0, seq: k })); cIn.forEach((a, k) => push({ type: 'EXCH_IN', asset: a, qty: net[a], eur: 0, seq: 10 + k })); ok = true; }
    else if (!cOut.length && !cIn.length) ok = true; // change de devises fiat : ignoré
    else { cIn.forEach(a => push({ type: 'RECEIVE', asset: a, qty: net[a], eur: 0 })); cOut.forEach(a => push({ type: 'SEND', asset: a, qty: -net[a], eur: 0 })); }
    Object.keys(fees).filter(a => !FIAT.includes(a) && fees[a] > 0).forEach(a => push({ type: 'FEE', asset: a, qty: fees[a], eur: 0, rawType: 'Frais' }));
    return ok;
  }

  /* v2.40 : décalage fixe « (UTC+1) », « (UTC-05:00) »… lu dans le bandeau au-dessus de l'en-tête, sinon dans le nom du fichier.
     Décalage FIXE (ms) : « UTC+1 » ne veut pas dire heure de Paris (pas de passage à l'heure d'été). null si absent ou ambigu. */
  function fixedOffset(rows, hi, name) {
    const RE = /\(\s*UTC\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?\s*\)/gi, found = new Set();
    const scan = s => { for (const m of String(s == null ? '' : s).matchAll(RE)) { const h = +m[2], mi = +(m[3] || 0); if (h <= 14 && mi < 60) found.add((m[1] === '-' ? -1 : 1) * (h * 60 + mi) * 60000); } };
    const fromRows = new Set(); (rows || []).slice(0, Math.max(0, hi)).forEach(r => (r || []).forEach(scan)); found.forEach(x => fromRows.add(x));
    if (fromRows.size === 1) return [...fromRows][0]; if (fromRows.size > 1) return null;
    scan(name); return found.size === 1 ? [...found][0] : null;
  }
  function parse(rows, fmt, o, uid) {
    o = o || {}; uid = uid || (() => Math.random().toString(36).slice(2));
    const head = rows[fmt.hi].map(x => norm(x)), body = rows.slice(fmt.hi + 1), c = n => head.indexOf(n), g = (r, n) => { const i = c(n); return i < 0 ? '' : r[i]; };
    const out = [], bad = [], skipped = []; let seq = 0;
    /* v2.40 : Binance « Time » = heure locale du fichier ; converti en UTC avec le décalage fixe lu, sinon lu en UTC et signalé */
    let tzShift = 0, tzNote = '';
    if (fmt.localTime) { const off = fixedOffset(rows, fmt.hi, o.source); if (off == null) tzNote = 'fuseau des heures non indiqué (colonne « Time ») : heures lues en UTC, à vérifier'; else { tzShift = off; tzNote = 'heures du fichier en UTC' + (off < 0 ? '-' : '+') + (Math.abs(off) / 3600000) + ' (décalage fixe), converties en UTC'; } }
    const base = { platform: fmt.label.split(' (')[0], source: o.source, qtyStatus: 'ok', feeInKind: false };
    let curLine = 0; /* v2.41 : n° de ligne du fichier, seulement si o.withLines (adaptateur U.S./U.K.) ; le mode France ne change pas */
    const push = (t, date, rawType) => out.push(Object.assign({ id: uid(), seq: seq++, date, rawType }, base, t, { qty: Math.abs(t.qty), seq: seq }, o.withLines ? { srcLine: curLine } : {}));
    const single = (date, raw, asset, q, opt) => {
      opt = opt || {}; const k = kindOf(raw), a = asset;
      if (FIAT.includes(a)) { skipped.push(raw); return true; }
      if (INTERNAL.test(norm(raw)) && k !== 'GIFT') { skipped.push(raw); return true; } // v2.40 : « Gift Card Redemption » = réception (pas un mouvement interne)
      if (k === 'GIFT') push({ type: q >= 0 ? 'RECEIVE' : 'SEND', asset: a, qty: q, eur: opt.eur || 0 }, date, raw);
      else if (k && q > 0) push({ type: k, asset: a, qty: q, eur: opt.eur || 0 }, date, raw);
      else if (/fee|frais/.test(norm(raw)) && q < 0) push({ type: 'FEE', asset: a, qty: q, eur: 0 }, date, raw);
      else if (/deposit|receive|incoming|depot|reception/.test(norm(raw)) || (q > 0 && /transfer|withdraw/.test(norm(raw)) === false && opt.loose)) push({ type: 'RECEIVE', asset: a, qty: q, eur: opt.eur || 0 }, date, raw);
      else if (/withdraw|send|outgoing|retrait|envoi/.test(norm(raw))) push({ type: 'SEND', asset: a, qty: q, eur: opt.eur || 0 }, date, raw);
      else if (/card spending|card payment|paiement/.test(norm(raw)) && q < 0) push({ type: 'PAY', asset: a, qty: q, eur: opt.eur || 0 }, date, raw);
      else if (q > 0 && /transfer/.test(norm(raw))) push({ type: 'RECEIVE', asset: a, qty: q, eur: opt.eur || 0 }, date, raw);
      else if (q < 0 && /transfer/.test(norm(raw))) push({ type: 'SEND', asset: a, qty: q, eur: opt.eur || 0 }, date, raw);
      else return false;
      return true;
    };
    const TRADE_B = /^(buy|sell|fee|transaction (related|buy|spend|revenue|sold|fee)|small assets exchange bnb|binance convert|sell crypto to fiat|large otc trading|auto-invest transaction|binance card spending|card spending|convert|p2p trading|fiat (deposit|withdraw)?)$/;

    if (fmt.id === 'binance' || fmt.id === 'kraken-ledgers') {
      const groups = new Map(), order = [];
      body.forEach((r, i) => {
        const kr = fmt.id === 'kraken-ledgers';
        const date = (kr ? utc(g(r, 'time')) : fmt.localTime ? utc(g(r, 'time')) - tzShift : utc(g(r, 'utc time'))), op = kr ? (g(r, 'type') + (g(r, 'subtype') ? ' ' + g(r, 'subtype') : '')) : g(r, 'operation');
        const asset = kr ? kAsset(g(r, 'asset')) : up(g(r, 'coin')), d = num(kr ? g(r, 'amount') : g(r, 'change'), 'EN'), fee = kr ? Math.abs(num(g(r, 'fee'), 'EN')) || 0 : 0;
        if (!isFinite(date) || !asset || !isFinite(d)) { bad.push(i); return; }
        curLine = fmt.hi + i + 2;
        const nop = norm(op), isTrade = kr ? /^(trade|spend|receive|adjustment)\b/.test(nop) && !/staking|earn/.test(nop) : TRADE_B.test(nop);
        if (isTrade) {
          let key = kr ? 'r' + g(r, 'refid') : 'b' + date;
          /* v2.40 : jambes d'une même opération Binance à 1-2 s d'écart (ex. « Sell Crypto to Fiat » : EUR à hh:mm:48, BTC à hh:mm:49) :
             rattachées au groupe de même opération encore à sens unique dont l'heure est à 2 s près, si la jambe est de sens opposé */
          if (!kr && !groups.has(key) && !/fee/.test(nop)) for (let j = order.length - 1; j >= 0 && j >= order.length - 6; j--) { const G0 = groups.get(order[j]);
            if (norm(G0.op) !== nop || Math.abs(G0.date - date) > 2000 || !G0.legs.length) continue;
            const sg = G0.legs.map(l => Math.sign(l.d)); if (sg.every(x => x === sg[0]) && sg[0] !== Math.sign(d)) { key = order[j]; break; } }
          if (!groups.has(key)) { groups.set(key, { date, op, legs: [], fees: [], pay: /card/.test(nop), line: curLine }); order.push(key); }
          const G = groups.get(key);
          if (/fee/.test(nop) && !kr) G.fees.push({ asset, d }); else G.legs.push({ asset, d });
          if (fee) G.fees.push({ asset, d: fee });
        } else {
          if (kr && fee && !FIAT.includes(asset)) push({ type: 'FEE', asset, qty: fee, eur: 0 }, date, 'Frais');
          if (!single(date, op, asset, d)) { if (FIAT.includes(asset)) skipped.push(op); else bad.push(i); }
        }
      });
      for (const k of order) { const G = groups.get(k); curLine = G.line; fromLegs(G.legs, base, t => push(t, G.date, G.op), { fees: G.fees, pay: G.pay }); }
    }
    else if (fmt.id === 'binance-trades' || fmt.id === 'binance-trades-old') {
      body.forEach((r, i) => {
        const date = utc(g(r, 'date(utc)')); let bq, b, qq, q, fq, f;
        if (fmt.id === 'binance-trades') { [bq, b] = qtyCoin(g(r, 'executed')); [qq, q] = qtyCoin(g(r, 'amount')); [fq, f] = qtyCoin(g(r, 'fee')); }
        else { [b, q] = splitPair(g(r, 'market')); bq = Math.abs(num(g(r, 'amount'), 'EN')); qq = Math.abs(num(g(r, 'total'), 'EN')); fq = Math.abs(num(g(r, 'fee'), 'EN')) || 0; f = up(g(r, 'fee coin')); }
        const side = norm(g(r, 'side') || g(r, 'type'));
        if (!isFinite(date) || !b || !q || !isFinite(bq) || !isFinite(qq) || !/buy|sell/.test(side)) { bad.push(i); return; }
        const buy = /buy/.test(side), legs = [{ asset: b, d: buy ? bq : -bq }, { asset: q, d: buy ? -qq : qq }];
        fromLegs(legs, base, t => push(t, date, side.toUpperCase()), { fees: fq > 0 ? [{ asset: f, d: fq }] : [] });
      });
    }
    else if (fmt.id === 'binance-convert') {
      body.forEach((r, i) => {
        if (c('status') > -1 && !/success|succes|complet/i.test(g(r, 'status'))) { skipped.push('Convert ' + g(r, 'status')); return; }
        const date = utc(g(r, 'date')), [sq, sa] = qtyCoin(g(r, 'sell')), [bq, ba] = qtyCoin(g(r, 'buy'));
        if (!isFinite(date) || !sa || !ba || !isFinite(sq) || !isFinite(bq)) { bad.push(i); return; }
        fromLegs([{ asset: sa, d: -sq }, { asset: ba, d: bq }], base, t => push(t, date, 'Convert'), {});
      });
    }
    else if (fmt.id === 'kraken-trades') {
      body.forEach((r, i) => {
        const date = utc(g(r, 'time')), [b, q] = splitPair(g(r, 'pair')), side = norm(g(r, 'type'));
        const vol = Math.abs(num(g(r, 'vol'), 'EN')), cost = Math.abs(num(g(r, 'cost'), 'EN')), fee = Math.abs(num(g(r, 'fee'), 'EN')) || 0;
        if (!isFinite(date) || !b || !q || !isFinite(vol) || !isFinite(cost) || !/buy|sell/.test(side)) { bad.push(i); return; }
        const buy = side === 'buy';
        fromLegs([{ asset: b, d: buy ? vol : -vol }, { asset: q, d: buy ? -cost : cost }], base, t => push(t, date, side.toUpperCase()), { fees: fee ? [{ asset: q, d: fee }] : [] });
      });
    }
    else if (fmt.id === 'coinbase') {
      const pc = c('price currency') > -1 ? 'price currency' : 'spot price currency';
      body.forEach((r, i) => {
        const date = utc(g(r, 'timestamp')), ty = g(r, 'transaction type'), nt = norm(ty), a = up(g(r, 'asset')), q = Math.abs(num(g(r, 'quantity transacted'), 'EN'));
        const cur = up(g(r, pc)) || 'EUR', sub = Math.abs(num(g(r, 'subtotal'), 'EN')), fee = Math.abs(num(g(r, 'fees and/or spread') || g(r, 'fees'), 'EN')) || 0, notes = String(g(r, 'notes') || '');
        if (!isFinite(date) || !a || !isFinite(q)) { bad.push(i); return; }
        const v = isFinite(sub) ? sub : 0, money = cur === 'EUR' ? { eur: v, fee } : { eur: 0, cur, valCur: v, feeCur: fee, fee: 0, fxPending: true };
        if (FIAT.includes(a)) { skipped.push(ty); return; }
        // « Bought 0.01 BTC for 500 EUR on BTC-EUR » / « Sold … » / « Converted 0.02 BTC to 0.4 ETH »
        const mc = notes.replace(/,(?=\d{3}\b)/g, '').match(/converted\s+([\d.]+)\s+([A-Z0-9]+)\s+to\s+([\d.]+)\s+([A-Z0-9]+)/i);
        const mt = notes.replace(/,(?=\d{3}\b)/g, '').match(/(bought|sold)\s+([\d.]+)\s+([A-Z0-9]+)\s+for\s+[^\d]*([\d.]+)\s+([A-Z0-9]+)/i);
        if (/convert/.test(nt)) {
          if (mc) fromLegs([{ asset: up(mc[2]), d: -parseFloat(mc[1]) }, { asset: up(mc[4]), d: parseFloat(mc[3]) }], base, t => push(t, date, ty), {});
          else push({ type: 'EXCH_OUT', asset: a, qty: q, eur: 0 }, date, ty);
        } else if (/buy|sell/.test(nt) && mt && !FIAT.includes(up(mt[5]))) {
          const buy = /bought/i.test(mt[1]); fromLegs([{ asset: up(mt[3]), d: buy ? +mt[2] : -mt[2] }, { asset: up(mt[5]), d: buy ? -mt[4] : +mt[4] }], base, t => push(t, date, ty), {});
        } else if (/^(advanced trade )?buy$|^buy$|recurring buy/.test(nt)) push(Object.assign({ type: 'BUY', asset: a, qty: q }, money), date, ty);
        else if (/^(advanced trade )?sell$/.test(nt)) push(Object.assign({ type: 'SELL', asset: a, qty: q }, money), date, ty);
        else if (/coinbase card|card spend|retail|pay/.test(nt)) push(Object.assign({ type: 'PAY', asset: a, qty: q }, money), date, ty);
        else if (!single(date, ty, a, /send|withdraw/.test(nt) ? -q : q, { eur: cur === 'EUR' ? v : 0 })) bad.push(i);
      });
    }
    else if (fmt.id === 'bitpanda') {
      body.forEach((r, i) => {
        const date = utc(g(r, 'timestamp')), ty = g(r, 'transaction type'), nt = norm(ty), io = norm(g(r, 'in/out')), cls = norm(g(r, 'asset class'));
        const a = up(g(r, 'asset')), q = dash(g(r, 'amount asset')) ? NaN : Math.abs(num(g(r, 'amount asset'), 'EN')), fiat = up(g(r, 'fiat')) || 'EUR', v = dash(g(r, 'amount fiat')) ? 0 : Math.abs(num(g(r, 'amount fiat'), 'EN'));
        if (!isFinite(date)) { bad.push(i); return; }
        if (cls && !/crypto/.test(cls)) { skipped.push(ty + ' (' + (g(r, 'asset class') || '') + ')'); return; }
        if (!a || !isFinite(q)) { bad.push(i); return; }
        const fa = up(g(r, 'fee asset')), fq = dash(g(r, 'fee')) ? 0 : Math.abs(num(g(r, 'fee'), 'EN')) || 0;
        const money = fiat === 'EUR' ? { eur: v } : { eur: 0, cur: fiat, valCur: v, fxPending: true };
        const extra = fq && fa === a ? { feeQty: fq } : {};
        if (fq && fa && fa !== a && !FIAT.includes(fa)) push({ type: 'FEE', asset: fa, qty: fq, eur: 0 }, date, 'Frais');
        if (nt === 'buy') push(Object.assign({ type: 'BUY', asset: a, qty: q }, money, extra), date, ty);
        else if (nt === 'sell') push(Object.assign({ type: 'SELL', asset: a, qty: q }, money, extra), date, ty);
        else if (!single(date, ty + (nt === 'transfer' ? (io === 'incoming' ? ' incoming' : ' outgoing') : ''), a, io === 'outgoing' ? -q : q, { eur: fiat === 'EUR' ? v : 0 })) bad.push(i);
      });
    }
    return { txs: out, bad, skipped, format: fmt.label, tzNote };
  }

  /* v2.41 : adaptateur neutre Binance « Transaction History » pour les modes U.S. et U.K. (aucune règle fiscale ici).
     Réutilise la lecture partagée (en-têtes, bandeau, colonnes vides, fuseau fixe, paires de jambes, mouvements internes) et rend des
     événements avec le montant et la DEVISE SOURCE (jamais une valeur en euros présumée) : chaque mode convertit avec ses propres outils.
     date = instant UTC si le fuseau du fichier est connu (tz: 'UTC'), sinon heure du fichier (tz: null, le fuseau choisi dans la page s'applique).
     null si les lignes ne sont pas un historique Binance « Transaction History ». */
  function binanceLedger(rows, name) {
    const d = detect(rows); if (!d || d.id !== 'binance') return null;
    const r = parse(rows, d, { source: name || '', withLines: true }, (() => { let n = 0; return () => 'b' + (++n); })());
    const tzKnown = !d.localTime || /converties en UTC/.test(r.tzNote || ''), tz = tzKnown ? 'UTC' : null, ev = [], skipped = [];
    const fiatOf = t => t.cur ? { cur: t.cur, amt: +t.valCur } : { cur: 'EUR', amt: +t.eur }; /* fromLegs : EUR -> champ eur ; autre devise -> cur/valCur */
    const T = r.txs;
    for (let i = 0; i < T.length; i++) { const t = T[i], line = t.srcLine, base = { line, date: t.date, tz, rawType: t.rawType || '', asset: t.asset, qty: t.qty };
      if (t.type === 'BUY' || t.type === 'SELL' || t.type === 'PAY') { const f = fiatOf(t);
        ev.push(Object.assign(base, { type: t.type === 'BUY' ? 'BUY' : t.type === 'PAY' ? 'SPEND' : 'SELL', cur: f.cur, amt: f.amt, feeAmt: t.fee > 0 ? +t.fee : 0, feeCur: t.fee > 0 ? 'EUR' : '', feeCurAmt: t.feeCur || 0, feeQty: t.feeQty || 0 })); }
      else if (t.type === 'EXCH_OUT') { /* jambes d'un même groupe : sorties puis entrées, même date */
        const outs = [t]; let j = i + 1; while (j < T.length && T[j].type === 'EXCH_OUT' && T[j].date === t.date) outs.push(T[j++]);
        const ins = []; while (j < T.length && T[j].type === 'EXCH_IN' && T[j].date === t.date) ins.push(T[j++]);
        if (outs.length === 1 && ins.length === 1) ev.push(Object.assign(base, { type: 'CONVERT', toAsset: ins[0].asset, toQty: ins[0].qty, cur: '', amt: NaN }));
        else skipped.push({ line, why: 'exchange with ' + outs.length + ' token(s) out and ' + ins.length + ' token(s) in: not read, to verify' });
        i = j - 1; }
      else if (t.type === 'EXCH_IN') skipped.push({ line, why: 'token received in an exchange without the token given: not read, to verify' });
      else if (t.type === 'STAKING' || t.type === 'INTEREST') ev.push(Object.assign(base, { type: 'INCOME', cur: '', amt: NaN }));
      else if (t.type === 'AIRDROP') ev.push(Object.assign(base, { type: 'AIRDROP', cur: '', amt: NaN }));
      else if (t.type === 'RECEIVE' || t.type === 'SEND') ev.push(Object.assign(base, { type: 'TRANSFER', dir: t.type === 'RECEIVE' ? 'in' : 'out', cur: '', amt: NaN }));
      else if (t.type === 'FEE') skipped.push({ line, why: 'fee of ' + +(+t.qty).toPrecision(10) + ' ' + t.asset + ' paid in tokens: not handled, to verify', kept: true });
      else skipped.push({ line, why: 'operation not read (' + t.type + '), to verify' }); }
    r.bad.forEach(i => skipped.push({ line: d.hi + i + 2, why: 'unreadable line (date, coin or change), to verify' }));
    return { events: ev, skipped, internal: r.skipped.length, tz, tzNote: r.tzNote || '', platform: 'Binance Transaction History' };
  }
  /* v2.42 : relevé PDF Binance « Transaction History » (texte lisible, une ligne par opération après regroupement pdf.js) -> lignes du tableur,
     puis même lecture que le CSV/Excel. Chaque ligne commence par l'ID utilisateur (chiffres), puis « AAAA-MM-JJ hh:mm:ss », le compte (un mot),
     l'opération (plusieurs mots), le jeton (majuscules/chiffres), la variation signée, puis une remarque facultative. En-têtes répétés à chaque
     page ignorés ; bandeau (dont « Period(UTC+1) ») gardé au-dessus de l'en-tête pour le fuseau. null si ce n'est pas ce relevé. */
  const BN_PDF_HEAD = /^User ID\s+Time\s+Account\s+Operation\s+Coin\s+Change(?:\s+Remark)?$/i;
  const BN_PDF_ROW = /^(\d+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+([A-Za-z][\w-]*)\s+(.+?)\s+([A-Z0-9][A-Z0-9.]{0,19})\s+(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)(?:\s+(.*))?$/;
  function binancePdfRows(lines) {
    const L = (lines || []).map(x => String(x).replace(/\s+/g, ' ').trim()), hi = L.findIndex(x => BN_PDF_HEAD.test(x));
    if (hi < 0 || !L.slice(0, hi).some(x => /binance|transaction history/i.test(x))) return null;
    const rows = L.slice(0, hi).map(x => [x]), info = { lines: 0, heads: 0, other: [] };
    rows.push(['User ID', 'Time', 'Account', 'Operation', 'Coin', 'Change', 'Remark']);
    for (let i = hi + 1; i < L.length; i++) { const x = L[i]; if (!x) continue;
      if (BN_PDF_HEAD.test(x)) { info.heads++; continue; }
      const m = BN_PDF_ROW.exec(x); if (m) { rows.push([m[1], m[2].replace(/\s+/, ' '), m[3], m[4], m[5], m[6], m[7] || '']); info.lines++; continue; }
      if (/^www\.binance\.com|^Page \d+\/\d+$/i.test(x)) continue;
      if (/^\d+\s+\d{4}-\d{2}-\d{2}/.test(x)) info.other.push(x.slice(0, 0)); /* ligne d'opération illisible : comptée, jamais recopiée */ }
    if (!info.lines) return null;
    rows.info = { binancePdf: true, lines: info.lines, unread: info.other.length }; return rows;
  }
  const api = { binancePdfRows, binanceLedger, fixedOffset, norm, utc, kAsset, qtyCoin, splitPair, guessMap, headCur, headerRow, parseCSV, decodeCSV, detect, parse, kindOf, FORMATS };
  if (typeof module !== 'undefined') module.exports = api; else root.KryptaxFormats = api;
})(this);
