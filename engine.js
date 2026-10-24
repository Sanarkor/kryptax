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
  const FIAT = { EUR: 1 };
  const STABLE_NOTE = ['USDT', 'USDC', 'DAI', 'EURC'];

  function guessType(raw, desc) {
    const s = (String(raw || '') + ' ' + String(desc || '')).toLowerCase();
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
    return 'RECEIVE';
  }

  // Nombres FR/EN : "€1,234.56", "1 234,56 €", "-0.5", "1.234,56"
  function parseNum(v, mode) {
    if (v == null) return NaN;
    if (typeof v === 'number') return v;
    let s = String(v).replace(/[\s\u00a0\u202f]/g, '').replace(/[€$£A-Za-z]/g, '');
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

  // Dates : ISO, JJ/MM/AAAA hh:mm(:ss), MM/JJ/AAAA, "Jan 13, 2024, 3:45:12 PM"
  function parseDate(v, mode) {
    if (v == null || v === '') return NaN;
    if (typeof v === 'number') return v;
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i);
    if (m && !/^\d{4}/.test(s)) {
      let a = +m[1], b = +m[2], y = +m[3]; if (y < 100) y += 2000;
      let day, mon;
      if (mode === 'MDY' || (mode !== 'DMY' && b > 12)) { mon = a; day = b; } else { day = a; mon = b; }
      let h = +(m[4] || 0); const mi = +(m[5] || 0), se = +(m[6] || 0);
      if (m[7]) { if (/pm/i.test(m[7]) && h < 12) h += 12; if (/am/i.test(m[7]) && h === 12) h = 0; }
      return new Date(y, mon - 1, day, h, mi, se).getTime();
    }
    const t = Date.parse(s.replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T'));
    return t;
  }

  function sortTx(txs) { return txs.slice().sort((a, b) => a.date - b.date || (a.seq || 0) - (b.seq || 0)); }
  const EPS = 1e-12;

  /* Liste des cours nécessaires : pour chaque cession, chaque actif détenu (hors actif cédé). */
  function neededPrices(txs) {
    const need = []; const h = {};
    for (const t of sortTx(txs)) {
      if (t.type === 'SELL' || t.type === 'PAY') {
        if (!(t.override212 > 0)) for (const a in h) if (h[a] > EPS && a !== t.asset && !(a in FIAT)) need.push({ asset: a, ts: t.date, txId: t.id });
      }
      apply(h, t);
    }
    return need;
  }
  function apply(h, t) {
    const a = t.asset, q = Math.abs(t.qty || 0);
    const add = (x, n) => { h[x] = (h[x] || 0) + n; };
    switch (t.type) {
      case 'BUY': case 'EXCH_IN': case 'STAKING': case 'AIRDROP': case 'INTEREST': case 'RECEIVE': add(a, q); break;
      case 'SELL': case 'PAY': case 'EXCH_OUT': case 'SEND': case 'FEE': add(a, -q); break;
    }
    if (t.feeQty > 0 && t.type !== 'FEE') add(a, -t.feeQty); // frais prélevés en crypto
  }
  function holdingsAt(txs, ts) {
    const h = {};
    for (const t of sortTx(txs)) { if (t.date > ts) break; apply(h, t); }
    return h;
  }

  /* Calcul 2086. priceFn(asset, ts) -> prix € ou null. */
  function compute(txs, priceFn) {
    const h = {}; let total220 = 0, frac221 = 0, soultes222 = 0;
    const cessions = [], warnings = []; let blocked = false;
    for (const t of sortTx(txs)) {
      if (CHECK.includes(t.type) && t.type !== 'RECEIVE' && t.type !== 'SEND') warnings.push({ t, msg: 'Revenu ' + t.type + ' : traitement fiscal à vérifier (acquis à 0 € de coût ici).' });
      if (t.type === 'RECEIVE' || t.type === 'SEND') warnings.push({ t, msg: 'Transfert : si c’est entre vos propres portefeuilles déjà saisis, passez-le en « Ignorer » pour ne pas le compter deux fois.' });
      if (t.type === 'BUY') total220 += Math.abs(t.eur || 0) + Math.abs(t.fee || 0);
      if (t.type === 'SELL' || t.type === 'PAY') {
        const p213 = Math.abs(t.eur || 0), p214 = Math.abs(t.fee || 0), p216 = t.soulte || 0;
        const held = Object.assign({}, h);
        const lines = []; let v212 = 0, missing = [];
        if (t.override212 > 0) { v212 = t.override212; lines.push({ asset: '(saisie manuelle)', value: v212 }); }
        else {
          for (const a in held) {
            if (held[a] <= EPS) continue;
            let p;
            if (a in FIAT) p = FIAT[a];
            else if (a === t.asset && Math.abs(t.qty) > 0) p = p213 / Math.abs(t.qty);
            else p = priceFn(a, t.date);
            if (p == null || !isFinite(p)) { missing.push(a); continue; }
            lines.push({ asset: a, qty: held[a], price: p, value: held[a] * p }); v212 += held[a] * p;
          }
        }
        const p215 = p213 - p214, p217 = p213 - p216, p218 = p213 - p214 - p216;
        const p223 = total220 - frac221 - soultes222;
        const c = { tx: t, date: t.date, asset: t.asset, qty: Math.abs(t.qty), l211: t.date, l212: v212, l213: p213, l214: p214, l215: p215, l216: p216, l217: p217, l218: p218, l220: total220, l221: frac221, l222: soultes222, l223: p223, detail212: lines, missing, status: missing.length ? 'à renseigner' : 'ok' };
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
    return { cessions, warnings, holdings: h, total220, frac221 };
  }

  function byYear(res) {
    const y = {};
    for (const c of res.cessions) { const k = new Date(c.date).getFullYear(); (y[k] = y[k] || { year: k, cessions: [] }).cessions.push(c); }
    for (const k in y) {
      const Y = y[k]; Y.total218 = Y.cessions.reduce((s, c) => s + c.l218, 0);
      Y.incomplete = Y.cessions.some(c => c.l224 == null);
      Y.total224 = Y.cessions.reduce((s, c) => s + (c.l224 || 0), 0);
      Y.exonere = Y.total218 <= 305;
    }
    return y;
  }
  const api = { TYPES, CHECK, parseNum, parseDate, guessType, compute, byYear, neededPrices, holdingsAt, sortTx, STABLE_NOTE };
  if (typeof module !== 'undefined') module.exports = api; else root.KryptaxEngine = api;
})(this);
