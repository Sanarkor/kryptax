/* Kryptax — moteur de calcul (aucune donnée envoyée : tout tourne localement). */
(function (root) {
  'use strict';
  const TYPES = {
    BUY: 'Achat (€ → crypto)',
    SELL: 'Vente (crypto → €) — imposable',
    PAY: 'Paiement bien/service en crypto — imposable',
    EXCH_OUT: 'Échange crypto→crypto : sortie (non imposable)',
    EXCH_IN: 'Échange crypto→crypto : entrée (non imposable)',
    STAKING: 'Staking / récompense — à vérifier',
    AIRDROP: 'Airdrop — à vérifier',
    INTEREST: 'Intérêts / Learn reward — à vérifier',
    RECEIVE: 'Réception (transfert entrant)',
    SEND: 'Envoi (transfert sortant)',
    FEE: 'Frais payés en crypto',
    IGNORE: 'Ignorer (ex. transfert entre mes portefeuilles)'
  };
  const CHECK = ['STAKING', 'AIRDROP', 'INTEREST', 'RECEIVE', 'SEND'];
  const FIAT = { EUR: 1 }; const FIATS = ['EUR', 'USD', 'GBP', 'CHF'];
  const STABLE_NOTE = ['USDT', 'USDC', 'DAI', 'EURC'];

  function guessType(raw, desc, strict) {
    const s = fixText(String(raw || '') + ' ' + String(desc || '')).toLowerCase();
    if (strict && /recevoir|reçu|recu\b|entrant|incoming/.test(s)) return 'RECEIVE';
    if (strict && /envoy|sortant|outgoing/.test(s)) return 'SEND';
    if (/récompense|recompense|apprendre/.test(s)) return 'INTEREST';
    if (/vendre/.test(s)) return 'SELL';
    if (/achet/.test(s)) return 'BUY';
    if (/stak/.test(s)) return 'STAKING';
    if (/airdrop/.test(s)) return 'AIRDROP';
    if (/learn|reward|interest|intérêt|cashback|earn/.test(s)) return 'INTEREST';
    if (/exchange|échange|swap|convert/.test(s)) return 'EXCH_OUT';
    if (/sell|vente|vendre/.test(s)) return 'SELL';
    if (/buy|achat|acheter/.test(s)) return 'BUY';
    if (/pay|card|paiement|carte/.test(s)) return 'PAY';
    if (/receiv|réception|deposit|dépôt|transfer in|topup/.test(s)) return 'RECEIVE';
    if (/send|envoi|withdraw|retrait|transfer out/.test(s)) return 'SEND';
    if (/fee|frais/.test(s)) return 'FEE';
    if (strict) return /autre|other|fiat/.test(s) ? 'IGNORE' : null; /* CSV/Excel : type inconnu = ligne refusée, jamais « réception » par défaut */
    return 'RECEIVE';
  }

  // Nombres FR/EN : "€1,234.56", "1 234,56 €", "-0.5", "1.234,56"
  function parseNum(v, mode) {
    if (v == null) return NaN;
    if (typeof v === 'number') return v;
    let s = fixText(String(v)).replace(/[\s\u00a0\u202f]/g, '').replace(/[€$£A-Za-z]/g, '');
    if (s === '' || s === '-') return NaN;
    let neg = /^\(.*\)$/.test(s); s = s.replace(/[()]/g, '');
    const c = s.lastIndexOf(','), d = s.lastIndexOf('.');
    if (mode === 'FR' || (mode !== 'EN' && c > -1 && d > -1 && c > d)) { s = s.replace(/\./g, '').replace(',', '.'); }
    else if (mode === 'EN' || (c > -1 && d > -1)) { s = s.replace(/,/g, ''); }
    else if (c > -1) {
      // virgule seule : décimale sauf motif de milliers "1,234" ou "12,345,678"
      if (/^-?\d{1,3}(,\d{3})+$/.test(s) && (s.match(/,/g).length > 1)) s = s.replace(/,/g, '');
      else s = s.replace(/,/g, (m, i) => (i === c ? '.' : ''));
    }
    const n = parseFloat(s);
    return neg ? -n : n;
  }

  /* Fuseaux : les instants sont en UTC (ms) ; l'affichage et l'année fiscale suivent l'heure de Paris (Intl, Europe/Paris : été/hiver et jours de bascule gérés). */
  let PF = null;
  function parisParts(ts) {
    PF = PF || new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const o = {}; for (const p of PF.formatToParts(new Date(ts))) o[p.type] = +p.value; return o;
  }
  const parisOff = ts => { const p = parisParts(ts); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ts / 1000) * 1000; };
  /* Heure murale de Paris -> instant UTC (deux passes : décalage de l'instant obtenu, correct aux bascules). */
  function fromParis(y, mo, d, h, mi, s) { const g = Date.UTC(y, mo, d, h || 0, mi || 0, s || 0); let t = g - parisOff(g); t = g - parisOff(t); return t; }
  const parisYear = ts => parisParts(ts).year;
  const p2 = n => String(n).padStart(2, '0');
  const fmtParis = (ts, sec) => { const p = parisParts(ts); return `${p2(p.day)}/${p2(p.month)}/${p.year} ${p2(p.hour)}:${p2(p.minute)}${sec ? ':' + p2(p.second) : ''}`; };
  // Dates : ISO, JJ/MM/AAAA hh:mm(:ss), MM/JJ/AAAA, "Jan 13, 2024, 3:45:12 PM". tz : 'UTC' (relevés et exports crypto) ou 'Paris' (heure murale de Paris) ; défaut Paris.
  function parseDate(v, mode, tz) {
    const mk = (y, mo, d, h, mi, se) => tz === 'UTC' ? Date.UTC(y, mo, d, h, mi, se) : fromParis(y, mo, d, h, mi, se);
    if (v == null || v === '') return NaN;
    if (typeof v === 'number') return v;
    if (v instanceof Date) return v.getTime();
    const s = fixText(String(v)).trim();
    const MOIS = { janv: 0, jan: 0, 'févr': 1, fevr: 1, 'fév': 1, feb: 1, mars: 2, mar: 2, avr: 3, apr: 3, mai: 4, may: 4, juin: 5, jun: 5, juil: 6, jul: 6, 'août': 7, aout: 7, aug: 7, sept: 8, sep: 8, oct: 9, nov: 10, 'déc': 11, dec: 11 };
    let f = s.match(/^(\d{1,2})\s+([a-zéû]+)\.?\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i);
    if (f && MOIS[f[2].toLowerCase()] != null) return mk(+f[3], MOIS[f[2].toLowerCase()], +f[1], +(f[4] || 0), +(f[5] || 0), +(f[6] || 0));
    let m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i);
    if (m && !/^\d{4}/.test(s)) {
      let a = +m[1], b = +m[2], y = +m[3]; if (y < 100) y += 2000;
      let day, mon;
      if (mode === 'MDY' || (mode !== 'DMY' && b > 12)) { mon = a; day = b; } else { day = a; mon = b; }
      let h = +(m[4] || 0); const mi = +(m[5] || 0), se = +(m[6] || 0);
      if (m[7]) { if (/pm/i.test(m[7]) && h < 12) h += 12; if (/am/i.test(m[7]) && h === 12) h = 0; }
      return mk(y, mon - 1, day, h, mi, se);
    }
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/); // ISO sans fuseau
    if (iso) return mk(+iso[1], iso[2] - 1, +iso[3], +(iso[4] || 0), +(iso[5] || 0), +(iso[6] || 0));
    const t = Date.parse(s.replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T'));
    return t;
  }

  /* Texte abîmé (mojibake) des exports Revolut .xlsx : « 100,00â_x0082_¬ » → « 100,00 € » */
  function fixText(v) {
    if (v == null || typeof v !== 'string') return v;
    let s = v.replace(/_x([0-9A-Fa-f]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
    if (/[ÃÂâ]/.test(s)) {
      try { const b = new Uint8Array([...s].map(c => c.charCodeAt(0) & 255)); if ([...s].every(c => c.charCodeAt(0) < 256)) { const d = new TextDecoder('utf-8', { fatal: true }).decode(b); s = d; } } catch (e) {}
    }
    return s.replace(/\u00a0|\u202f/g, ' ');
  }
  const currencyOf = v => /\$|USD/.test(String(v || '')) ? 'USD' : /£|GBP/.test(String(v || '')) ? 'GBP' : 'EUR';
  /* Quantité numérique tronquée (virgule perdue) : on choisit la puissance de 10 qui colle à Valeur / Prix. */
  function fixQty(raw, price, value) {
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw === 0) return { qty: Math.abs(raw), status: 'ok' };
    const target = value > 0 && price > 0 ? value / price : null;
    if (!target) return { qty: Math.abs(raw), status: 'suspect', raw };
    let best = null;
    for (let k = -3; k <= 22; k++) { const q = Math.abs(raw) / Math.pow(10, k), e = Math.abs(Math.log10(q / target)); if (!best || e < best.e) best = { q, e }; }
    return { qty: best.q, status: best.e < 0.15 ? 'corrigée' : 'suspect', raw };
  }
  function scaleToValue(raw, price, value) { // même principe avec un cours historique
    let best = null; for (let k = -3; k <= 22; k++) { const q = Math.abs(raw) / Math.pow(10, k), e = Math.abs(Math.log10(q * price / value)); if (!best || e < best.e) best = { q, e }; }
    return best.q;
  }

  function sortTx(txs) { return txs.slice().sort((a, b) => a.date - b.date || (a.seq || 0) - (b.seq || 0)); }
  const EPS = 1e-8; // poussière (résidus d'arrondi)

  /* Liste des cours nécessaires : pour chaque cession, chaque actif détenu (hors actif cédé). */
  /* Cession : vente, paiement, ou retrait qualifié « Paiement ou vente oubliée » (valorisé au cours du moment du retrait) */
  const sendSale = t => t.type === 'SEND' && t.sendChoice === 'sale', isCess = t => t.type === 'SELL' || t.type === 'PAY' || sendSale(t);
  function neededPrices(txs) {
    const need = []; const h = {};
    for (const t of sortTx(txs)) {
      if (isCess(t)) {
        if (sendSale(t) && !FIATS.includes(t.asset)) need.push({ asset: t.asset, ts: t.date, txId: t.id });
        if (!(t.override212 > 0)) for (const a in h) if (h[a] > EPS && a !== t.asset && !FIATS.includes(a)) need.push({ asset: a, ts: t.date, txId: t.id });
      }
      apply(h, t);
    }
    return need;
  }
  /* Revolut prélève les frais d'achat EN NATURE : quantité créditée = quantité affichée × (1 − frais / valeur). */
  function feeRatio(t) {
    if (!t.feeInKind) return 0;
    const v = t.cur ? Math.abs(t.valCur || 0) : Math.abs(t.eur || 0), f = t.cur ? Math.abs(t.feeCur || 0) : Math.abs(t.fee || 0);
    if (!(v > 0)) return 0;
    // Revolut X : frais « taker » de 0,09 % prélevés sur l'actif reçu ; le relevé arrondit le montant au centime (0,00 $ affiché).
    if (/revolut x/i.test(t.rawType || '')) return 0.0009;
    return f > 0 && f < v ? f / v : 0;
  }
  function netQty(t) { const q = Math.abs(t.qty || 0); return (t.type === 'BUY' || t.type === 'EXCH_IN') ? q * (1 - feeRatio(t)) : q; }
  function apply(h, t) {
    const a = t.asset, q = netQty(t);
    const add = (x, n) => { h[x] = (h[x] || 0) + n; };
    switch (t.type) {
      case 'BUY': case 'EXCH_IN': case 'STAKING': case 'AIRDROP': case 'INTEREST': case 'RECEIVE': add(a, q); break;
      case 'SEND': if (t.sendChoice === 'ignore') return; if (t.sendChoice !== 'own') add(a, -q); break; /* vers mon portefeuille non importé : reste dans le patrimoine (212), seuls les frais sortent */
      case 'SELL': case 'PAY': case 'EXCH_OUT': case 'FEE': add(a, -q); break;
    }
    if (t.feeQty > 0 && t.type !== 'FEE') add(a, -t.feeQty); // frais prélevés en crypto
  }
  function holdingsAt(txs, ts, opening) {
    const h = Object.assign({}, opening ? opening.holdings : {}), o = opening ? stateTs(opening) : -Infinity;
    for (const t of sortTx(txs)) { if (t.date > ts) break; if (t.date > o) apply(h, t); }
    return h;
  }

  /* Calcul 2086. priceFn(asset, ts) -> prix € ou null. */
  /* État reporté (JSON « état au 31/12/AAAA ») : { kryptax: 'etat', version: 1, date: 'AAAA-12-31', holdings: {actif: qté}, l220, l221, l222 }.
     Les opérations antérieures ou égales à cette date sont ignorées ; le calcul part des soldes et cumuls reportés. */
  function stateTs(st) { return fromParis(+st.date.slice(0, 4), +st.date.slice(5, 7) - 1, +st.date.slice(8, 10), 23, 59, 59) + 999; } // fin de journée, heure de Paris
  function validateState(o) {
    if (!o || typeof o !== 'object' || o.kryptax !== 'etat') throw new Error('Ce fichier n’est pas un état Kryptax.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date || '')) throw new Error('Date manquante ou invalide.');
    const holdings = {};
    for (const [a, q] of Object.entries(o.holdings || {})) { const n = +q; if (!isFinite(n) || n < 0) throw new Error('Quantité invalide pour ' + a); if (n > EPS) holdings[String(a).toUpperCase()] = n; }
    const num = (v, k) => { const n = +(v || 0); if (!isFinite(n) || n < 0) throw new Error('Valeur invalide : ' + k); return n; };
    return { kryptax: 'etat', version: 1, date: o.date, holdings, l220: num(o.l220, '220'), l221: num(o.l221, '221'), l222: num(o.l222, '222'), incomplete: !!o.incomplete };
  }
  /* Calcule l'état au 31/12/year (soldes et cumuls 220/221/222), à exporter pour l'année suivante. */
  function stateAt(txs, priceFn, year, opening) {
    const date = year + '-12-31', end = stateTs({ date });
    const r = compute(txs.filter(t => t.date <= end), priceFn, opening);
    const holdings = {}; for (const [a, q] of Object.entries(r.holdings)) if (q > EPS && !FIATS.includes(a)) holdings[a] = +q.toPrecision(12);
    return { kryptax: 'etat', version: 1, date, holdings, l220: +r.total220.toFixed(2), l221: +r.frac221.toFixed(2), l222: +(r.soultes222 || 0).toFixed(2), incomplete: r.cessions.some(c => c.l224 == null) };
  }
  function compute(txs, priceFn, opening) {
    const h = Object.assign({}, opening ? opening.holdings : {}); let total220 = opening ? opening.l220 : 0, frac221 = opening ? opening.l221 : 0, soultes222 = opening ? opening.l222 || 0 : 0;
    const cessions = [], warnings = []; let blocked = false; const o = opening ? stateTs(opening) : -Infinity;
    for (const t of sortTx(txs)) {
      if (t.date <= o) continue;
      if (CHECK.includes(t.type) && t.type !== 'RECEIVE' && t.type !== 'SEND') warnings.push({ t, msg: 'Revenu ' + t.type + ' : traitement fiscal à vérifier (acquis à 0 € de coût ici).' });
      if ((t.type === 'RECEIVE' || t.type === 'SEND') && !t.xferWith && !t.sendChoice) warnings.push({ t, msg: 'Transfert : si c’est entre vos propres portefeuilles déjà saisis, passez-le en « Ignorer » pour ne pas le compter deux fois.' });
      if (t.type === 'BUY') total220 += Math.abs(t.eur || 0) + (t.feeInKind ? 0 : Math.abs(t.fee || 0)); // Revolut : la valeur payée inclut déjà les frais
      if (isCess(t)) {
        const ss = sendSale(t), pm = ss ? (t.asset in FIAT ? FIAT[t.asset] : priceFn(t.asset, t.date)) : null;
        const p213 = ss ? (pm != null && isFinite(pm) ? pm * Math.abs(t.qty || 0) : 0) : Math.abs(t.eur || 0), p214 = t.feeInKind ? 0 : Math.abs(t.fee || 0), p216 = t.soulte || 0;
        const held = Object.assign({}, h);
        const lines = []; let v212 = 0, missing = ss && (pm == null || !isFinite(pm)) ? [t.asset] : [];
        if (t.override212 > 0) { v212 = t.override212; lines.push({ asset: '(saisie manuelle)', value: v212 }); }
        else {
          for (const a in held) {
            if (held[a] <= EPS || FIATS.includes(a)) continue;
            let p;
            if (a in FIAT) p = FIAT[a];
            else if (a === t.asset && ss) { if (pm == null || !isFinite(pm)) continue; p = pm; }
            else if (a === t.asset && Math.abs(t.qty) > 0) p = p213 / Math.abs(t.qty);
            else p = priceFn(a, t.date);
            if (p == null || !isFinite(p)) { missing.push(a); continue; }
            lines.push({ asset: a, qty: held[a], price: p, value: held[a] * p }); v212 += held[a] * p;
          }
        }
        const p215 = p213 - p214, p217 = p213 - p216, p218 = p213 - p214 - p216;
        const p223 = total220 - frac221 - soultes222;
        const c = { tx: t, date: t.date, asset: t.asset, qty: Math.abs(t.qty), l211: t.date, l212: v212, l213: p213, l214: p214, l215: p215, l216: p216, l217: p217, l218: p218, l220: total220, l221: frac221, l222: soultes222, l223: p223, detail212: lines, missing, status: missing.length ? 'à renseigner' : 'ok' };
        if (ss) { c.fromSend = true; c.price213 = pm; warnings.push({ t, msg: 'Retrait qualifié « Paiement ou vente oubliée » : cession imposable valorisée au cours du marché au moment du retrait (source du cours dans le détail de la ligne 212).' }); }
        c.blocked = blocked;
        if (blocked) c.status = 'à renseigner';
        if (!missing.length && v212 > 0 && !blocked) {
          const frac = p223 * p217 / v212;
          c.fraction = frac; c.l224 = p218 - frac; frac221 += frac;
        } else { c.l224 = null; blocked = true; }
        if ((held[t.asset] || 0) + EPS < Math.abs(t.qty)) warnings.push({ t, msg: 'Quantité vendue supérieure à la quantité détenue en ' + t.asset + ' : historique incomplet ?' });
        cessions.push(c);
      }
      apply(h, t);
    }
    return { cessions, warnings, holdings: h, total220, frac221, soultes222 };
  }

  /* Synthèse annuelle (façon « Tax summary ») : plus-values, cessions, frais, revenus, sorties, échanges exclus, soldes au 31/12.
     priceFn(asset, ts) -> cours € ; approx(asset, ts) -> true si cours estimé. Les valeurs inconnues sont signalées, jamais inventées. */
  function summary(txs, res, priceFn, year, opening, approx) {
    approx = approx || (() => false);
    const y0 = fromParis(year, 0, 1), y1 = fromParis(year + 1, 0, 1); // année civile, heure de Paris
    const inY = t => t.date >= y0 && t.date < y1 && !(opening && t.date <= stateTs(opening));
    const C = res.cessions.filter(c => c.date >= y0 && c.date < y1), done = C.filter(c => c.l224 != null);
    const S = { year, nCessions: C.length, incomplete: C.length !== done.length, produit: 0, total218: 0, acquisition: 0, gains: 0, losses: 0, net: 0,
      fees: { inKind: 0, explicit: 0, total: 0 }, income: {}, incomeTotal: 0, incomeUnknown: [], outcome: { SELL: { n: 0, eur: 0 }, PAY: { n: 0, eur: 0 }, SEND: { n: 0, eur: 0, unknown: 0 } },
      swaps: 0, estimated: 0, closing: [], closingTotal: 0, closingDate: null };
    for (const c of C) { S.produit += c.l213; S.total218 += c.l218; }
    for (const c of done) { S.acquisition += c.fraction; if (c.l224 >= 0) S.gains += c.l224; else S.losses += c.l224; S.net += c.l224; }
    const val = t => { if (t.eur > 0) return { v: t.eur }; const p = priceFn(t.asset, t.date); if (p == null || !isFinite(p)) return null; const est = approx(t.asset, t.date); if (est) S.estimated++; return { v: Math.abs(t.qty) * p, est }; };
    for (const t of txs.filter(inY)) {
      if (t.type === 'BUY' || t.type === 'SELL' || t.type === 'PAY' || t.type === 'EXCH_IN' || t.type === 'EXCH_OUT') {
        if (t.feeInKind && (t.type === 'BUY' || t.type === 'EXCH_IN')) S.fees.inKind += Math.abs(t.eur || 0) * feeRatio(t);
        else if (t.feeInKind) S.fees.inKind += Math.abs(t.fee || 0); else S.fees.explicit += Math.abs(t.fee || 0);
      }
      if (t.type === 'FEE' && !t.adjust) { const v = val(t); if (v) S.fees.explicit += v.v; }
      if (['INTEREST', 'STAKING', 'AIRDROP'].includes(t.type)) {
        const k = t.type + (t.rawType ? ' · ' + t.rawType : ''), g = S.income[k] = S.income[k] || { type: t.type, label: t.rawType || TYPES[t.type], n: 0, eur: 0, est: false };
        g.n++; const v = val(t); if (v) { g.eur += v.v; S.incomeTotal += v.v; if (v.est) g.est = true; } else S.incomeUnknown.push(t.asset);
      }
      if (t.type === 'SELL' || t.type === 'PAY') { S.outcome[t.type].n++; S.outcome[t.type].eur += Math.abs(t.eur || 0); }
      if (t.type === 'SEND') { S.outcome.SEND.n++; const v = val(t); if (v) S.outcome.SEND.eur += v.v; else S.outcome.SEND.unknown++; }
      if (t.type === 'EXCH_OUT' && t.swapAuto) S.swaps++;
    }
    S.fees.total = S.fees.inKind + S.fees.explicit;
    const last = Math.max(...txs.map(t => t.date)), end = Math.min(y1 - 1, isFinite(last) ? Math.max(last, y0) : y1 - 1);
    S.closingDate = end;
    const h = holdingsAt(txs, end, opening);
    for (const [a, q] of Object.entries(h)) {
      if (q <= EPS || FIATS.includes(a)) continue;
      const p = priceFn(a, end), ok = p != null && isFinite(p), est = ok && approx(a, end);
      S.closing.push({ asset: a, qty: q, price: ok ? p : null, eur: ok ? q * p : null, est });
      if (ok) S.closingTotal += q * p;
    }
    S.closing.sort((x, y) => (y.eur || 0) - (x.eur || 0));
    return S;
  }
  function byYear(res) {
    const y = {};
    for (const c of res.cessions) { const k = parisYear(c.date); /* année fiscale : date de cession en heure de Paris */ (y[k] = y[k] || { year: k, cessions: [] }).cessions.push(c); }
    for (const k in y) {
      const Y = y[k]; Y.total218 = Y.cessions.reduce((s, c) => s + c.l218, 0);
      Y.incomplete = Y.cessions.some(c => c.l224 == null);
      Y.total224 = Y.cessions.reduce((s, c) => s + (c.l224 || 0), 0);
      Y.exonere = Y.total218 <= 305;
    }
    return y;
  }
  /* Échanges crypto→crypto dans un relevé Revolut : la vente et l'achat apparaissent comme deux lignes
     à la même seconde (écart ≤ win ms) pour une valeur € proche (±tol). Appariement un-pour-un.
     Les ventes vers € n'ont pas d'achat simultané. t.swapForce = 'taxable' empêche l'appariement. */
  function detectSwaps(txs, o) {
    o = o || {}; const win = o.win != null ? o.win : 5000, tol = o.tol != null ? o.tol : 0.08;
    const val = t => Math.abs(t.eur || 0) || Math.abs(t.valCur || 0);
    for (const t of txs) if (t.swapAuto && !t.typeManual) { t.type = t.swapAuto; delete t.swapAuto; delete t.swapWith; }
    const free = t => !t.typeManual && t.swapForce !== 'taxable';
    const sells = txs.filter(t => t.type === 'SELL' && free(t)), buys = txs.filter(t => t.type === 'BUY' && free(t));
    const cand = [];
    for (const s of sells) for (const b of buys) {
      if (b.asset === s.asset) continue;
      const dt = Math.abs(b.date - s.date), vs = val(s), vb = val(b);
      if (dt > win || !(vs > 0 && vb > 0)) continue;
      const e = Math.abs(vb - vs) / vs; if (e > tol) continue;
      cand.push({ s, b, dt, e });
    }
    cand.sort((x, y) => x.dt - y.dt || x.e - y.e);
    const used = new Set(), pairs = [];
    for (const c of cand) {
      if (used.has(c.s) || used.has(c.b)) continue; used.add(c.s); used.add(c.b);
      c.s.swapAuto = 'SELL'; c.b.swapAuto = 'BUY'; c.s.type = 'EXCH_OUT'; c.b.type = 'EXCH_IN';
      c.s.swapWith = c.b.id; c.b.swapWith = c.s.id; c.b.seq = (c.s.seq || 0) + 0.5;
      pairs.push({ out: c.s, in: c.b, dt: c.dt, gap: c.e });
    }
    pairs.transfers = detectTransfers(txs);
    return pairs;
  }
  /* Transferts entre mes comptes : un retrait (SEND) et un dépôt (RECEIVE) de la même crypto, reçu = envoyé − frais de réseau
     (tolérance 3 % + frais connus), dépôt dans les 48 h (10 min d'avance tolérées), sont appariés : ni cession ni sortie du patrimoine (hors frais).
     Un retrait sans dépôt correspondant doit être qualifié par l'utilisateur (sendChoice : own / gift / ignore) avant l'export PDF. */
  const XFER_WIN = 48 * 3600e3, XFER_EARLY = 600e3, XFER_TOL = 0.03;
  function detectTransfers(txs, o) {
    o = o || {}; const win = o.win != null ? o.win : XFER_WIN;
    for (const t of txs) if (t.xferWith) delete t.xferWith;
    const sends = txs.filter(t => t.type === 'SEND' && !FIATS.includes(t.asset)), recs = txs.filter(t => t.type === 'RECEIVE' && !FIATS.includes(t.asset)), cand = [];
    for (const s of sends) for (const r of recs) {
      if (r.asset !== s.asset || (s.source && r.source && s.source === r.source)) continue;
      const dt = r.date - s.date; if (dt < -XFER_EARLY || dt > win) continue;
      const qs = Math.abs(s.qty || 0), qr = Math.abs(r.qty || 0), fq = Math.abs(s.feeQty || 0); if (!(qs > 0 && qr > 0)) continue;
      const gap = (qs - qr) / qs; if (qr > qs * (1 + 1e-6) + 1e-12 || qs - qr > fq + qs * XFER_TOL + 1e-12) continue;
      cand.push({ s, r, dt: Math.abs(dt), gap: Math.abs(gap) });
    }
    cand.sort((x, y) => x.gap - y.gap || x.dt - y.dt);
    const used = new Set(), pairs = [];
    for (const c of cand) { if (used.has(c.s) || used.has(c.r)) continue; used.add(c.s); used.add(c.r); c.s.xferWith = c.r.id; c.r.xferWith = c.s.id; if (c.s.sendChoice) delete c.s.sendChoice; pairs.push({ out: c.s, in: c.r, dt: c.dt }); }
    return pairs;
  }
  /* Retraits sans dépôt correspondant (à qualifier) ; avec done = true, aussi ceux déjà qualifiés */
  function openSends(txs, done) { return sortTx(txs).filter(t => t.type === 'SEND' && !FIATS.includes(t.asset) && Math.abs(t.qty || 0) > 0 && !t.xferWith && (done || !t.sendChoice)); }
  /* Contre-vérification avec un relevé en euros (texte collé ou CSV) : lignes « Vente de <ACTIF> » + date.
     Une vente avec une ligne correspondante (même actif, ±2 s ; même jour si l'heure manque) est confirmée imposable. */
  function parseFiatSales(text) {
    const out = [];
    const reD = /(\d{1,2}\s+[a-zéû.]+\s+\d{4}(?:,?\s+\d{1,2}:\d{2}(?::\d{2})?)?|\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?|\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?)/i;
    for (const line of String(text || '').split(/\r?\n/)) {
      const m = /vente de\s+([A-Za-z0-9]+)/i.exec(line); if (!m) continue;
      const d = reD.exec(line); if (!d) continue;
      const date = parseDate(d[1].replace(/,(?=\s+\d{1,2}:)/, ','), 'DMY', 'UTC'); if (!isFinite(date)) continue;
      out.push({ asset: m[1].toUpperCase(), date, hasTime: /:/.test(d[1]), line: line.trim() });
    }
    return out;
  }
  function crossCheck(txs, fiat) {
    const sells = txs.filter(t => t.type === 'SELL' || t.type === 'EXCH_OUT'), used = new Set(), res = { confirmed: [], swapButFiat: [], sellNoFiat: [], fiatNoSell: [] };
    const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
    for (const t of sells) {
      const f = fiat.find(x => !used.has(x) && x.asset === t.asset && (x.hasTime ? Math.abs(x.date - t.date) <= 2000 : sameDay(x.date, t.date)));
      if (f) { used.add(f); t.fiatConfirmed = true; (t.type === 'SELL' ? res.confirmed : res.swapButFiat).push({ t, f }); }
      else { delete t.fiatConfirmed; if (t.type === 'SELL') res.sellNoFiat.push({ t }); }
    }
    res.fiatNoSell = fiat.filter(x => !used.has(x));
    return res;
  }
  /* Compare le solde de clôture d'un relevé aux quantités reconstituées. */
  function checkBalances(txs, closing, ts, opening) {
    const h = holdingsAt(txs, isFinite(ts) ? ts : Infinity, opening), out = [];
    for (const a of new Set(Object.keys(closing).concat(Object.keys(h)))) {
      if (FIATS.includes(a)) continue;
      const exp = closing[a] || 0, got = h[a] || 0, d = got - exp;
      if (!(a in closing) && Math.abs(got) < 1e-8) continue;
      out.push({ asset: a, expected: exp, computed: got, diff: d, ok: Math.abs(d) <= Math.max(1e-8, 1e-6 * Math.abs(exp)) });
    }
    return out.sort((x, y) => x.ok - y.ok || x.asset.localeCompare(y.asset));
  }
  /* Ajustements pour aligner les quantités sur le solde de clôture d'un relevé (arrondis des frais affichés).
     Une ligne FEE (ou RECEIVE si négatif) par actif, juste après sa première entrée. */
  function balanceAdjustments(txs, closing, ts, opening) {
    const out = [];
    for (const b of checkBalances(txs, closing, ts, opening)) {
      if (b.ok) continue;
      const first = sortTx(txs).find(t => t.asset === b.asset && ['BUY', 'EXCH_IN', 'RECEIVE', 'INTEREST', 'STAKING', 'AIRDROP'].includes(t.type));
      out.push({ type: b.diff > 0 ? 'FEE' : 'RECEIVE', asset: b.asset, qty: Math.abs(b.diff), eur: 0, fee: 0, date: first ? first.date : ts, seq: first ? (first.seq || 0) + 0.9 : 0, adjust: true, rawType: 'Ajustement solde relevé' });
    }
    return out;
  }
  const api = { isCess, detectTransfers, openSends, parisParts, fromParis, parisYear, fmtParis, summary, stateAt, validateState, stateTs, balanceAdjustments, checkBalances, feeRatio, netQty, parseFiatSales, crossCheck, detectSwaps, fixText, currencyOf, fixQty, scaleToValue, FIATS, TYPES, CHECK, parseNum, parseDate, guessType, compute, byYear, neededPrices, holdingsAt, sortTx, STABLE_NOTE };
  if (typeof module !== 'undefined') module.exports = api; else root.KryptaxEngine = api;
})(this);
