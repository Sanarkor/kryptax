/* Kryptax — import des lignes et préparation (devises, quantités, cours). Navigateur et Node. */
(function (root) {
  'use strict';
  const E = root.KryptaxEngine || (typeof require !== 'undefined' ? require('./engine.js') : null);
  const MIN = 60e3, HOUR = 3600e3, DAY = 24 * HOUR;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* rows : tableaux (valeurs brutes, nombres conservés). mp : index des colonnes. */
  function importRows(rows, mp, o, uid) {
    const out = [], bad = [];
    rows.forEach((r, i) => {
      const g = f => mp[f] == null ? '' : r[mp[f]];
      const date = E.parseDate(g('date'), o.dmode);
      const asset = String(E.fixText(g('asset')) || '').trim().toUpperCase();
      if (!isFinite(date) || !asset) { bad.push(i); return; }
      const rawQ = g('qty'), vRaw = g('eur'), pRaw = g('price'), fRaw = g('fee');
      const cur = E.currencyOf(E.fixText(String(vRaw || pRaw || fRaw || '')));
      const val = Math.abs(E.parseNum(vRaw, o.nmode)), price = Math.abs(E.parseNum(pRaw, o.nmode)), fee = Math.abs(E.parseNum(fRaw, o.nmode)) || 0;
      let type = E.guessType(g('type'), g('desc'));
      if (E.FIATS.includes(asset)) type = 'IGNORE'; // lignes « Autre » : dépôts / change de devises
      let qty, qtyStatus = 'ok', qtyRaw;
      if (typeof rawQ === 'number' && Number.isInteger(rawQ) && o.xlsx) {
        const f = E.fixQty(rawQ, price, val); qty = f.qty; qtyStatus = f.status; qtyRaw = rawQ;
        if (!(price > 0 && val > 0)) qtyStatus = 'à reconstruire';
      } else qty = Math.abs(E.parseNum(rawQ, o.nmode));
      if (!isFinite(qty)) { if (type === 'IGNORE') qty = 0; else { bad.push(i); return; } }
      let v = isFinite(val) ? val : (price > 0 ? price * qty : 0);
      const t = { id: uid(), seq: i, date, type, feeInKind: o.feeInKind != null ? !!o.feeInKind : /revolut/i.test(o.platform || ''), rawType: E.fixText(g('type')), asset, qty, platform: o.platform, source: o.source, qtyStatus, qtyRaw, unitPrice: price || undefined };
      if (cur === 'EUR') { t.eur = v || 0; t.fee = fee; } else { t.cur = cur; t.valCur = v || 0; t.feeCur = fee; t.unitPriceCur = price || undefined; t.eur = 0; t.fee = 0; t.unitPrice = undefined; t.fxPending = true; }
      out.push(t);
    });
    return { txs: out, bad };
  }

  /* ---- Sources publiques ---- */
  /* Sources publiques de cours, toutes avec CORS ouvert (testé) : on demande une SÉRIE horaire par actif sur toute la période
     (quelques appels par actif au lieu d'un appel par cession × actif). Une erreur réseau n'est jamais mise en cache comme
     « pas de cours » : seul un « paire inexistante » sur toutes les sources l'est. diag : état par source (panneau « Sources de prix »). */
  function makeSources(fetchFn, opt) {
    opt = opt || {};
    const TIMEOUT = opt.timeout || 8000, signal = opt.signal, diag = {};
    const D = s => diag[s] || (diag[s] = { calls: 0, ok: 0, fail: 0, last: '' });
    const stats = { get calls() { return Object.values(diag).reduce((a, d) => a + d.calls, 0); }, get fails() { return Object.values(diag).reduce((a, d) => a + d.fail, 0); } };
    async function fetchT(url) {
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const onAbort = () => ac && ac.abort(); if (signal && signal.addEventListener) signal.addEventListener('abort', onAbort);
      const tm = setTimeout(() => ac && ac.abort(), TIMEOUT); // 8 s maximum par requête
      try { return await fetchFn(url, ac ? { signal: ac.signal } : undefined); }
      finally { clearTimeout(tm); if (signal && signal.removeEventListener) signal.removeEventListener('abort', onAbort); }
    }
    /* -> { j } réponse JSON (même 4xx), ou { err } erreur réseau / 429 / 5xx après réessais */
    async function get(srcName, url, tries = 2) {
      const d = D(srcName); let err = '';
      for (let i = 0; i < tries; i++) {
        if (signal && signal.aborted) throw new Error('Annulé');
        d.calls++;
        try {
          const r = await fetchT(url);
          if (r.status === 429 || r.status >= 500) { err = 'HTTP ' + r.status; await sleep(1500 * (i + 1)); continue; }
          const j = await r.json().catch(() => null);
          if (r.status >= 400) { d.ok++; return { j: j || {}, status: r.status }; }
          d.ok++; return { j };
        } catch (e) { if (signal && signal.aborted) throw new Error('Annulé'); err = e && e.name === 'AbortError' ? 'délai dépassé (8 s)' : (e && e.message) || 'réseau'; if (i + 1 < tries) await sleep(500); }
      }
      d.fail++; d.last = err; return { err };
    }
    const day = ts => new Date(ts).toISOString().slice(0, 10);
    /* Taux de change BCE sur une plage (un seul appel), repli : Binance EURUSDT. map jour -> 1 unité de cur en € */
    async function fxRange(cur, from, to) {
      const m = {};
      const r = await get('Frankfurter (BCE)', `https://api.frankfurter.dev/v1/${day(from - 7 * DAY)}..${day(to)}?from=${cur}&to=EUR`);
      if (r.j && r.j.rates) for (const k in r.j.rates) if (r.j.rates[k].EUR) m[k] = r.j.rates[k].EUR;
      if (!Object.keys(m).length && cur === 'USD') { const s = await binanceSeries('EURUSDT', from, to); if (s) for (const h in s) m[day(+h * HOUR)] = 1 / s[h]; }
      return m;
    }
    /* Série horaire Binance (limit 1000 par appel). null = paire inexistante, undefined = hôte injoignable. */
    const hosts = ['https://data-api.binance.vision', 'https://api.binance.com'], deadHost = new Set();
    async function binanceSeries(sym, from, to) {
      for (const h of hosts) {
        if (deadHost.has(h)) continue;
        const out = {}; let start = Math.floor(from / HOUR) * HOUR - HOUR, failed = false;
        while (start <= to + HOUR) {
          const r = await get(h.includes('vision') ? 'Binance (data-api)' : 'Binance (api)', `${h}/api/v3/klines?symbol=${sym}&interval=1h&startTime=${start}&limit=1000`);
          if (r.err) { failed = true; break; }
          if (!Array.isArray(r.j)) { if (r.j && r.j.code === -1121) return null; failed = true; break; } // -1121 : paire inexistante
          if (!r.j.length) break;
          for (const k of r.j) out[Math.floor(k[0] / HOUR)] = +k[1];
          start = r.j[r.j.length - 1][0] + HOUR; if (r.j.length < 1000) break;
        }
        if (!failed) return out;
        deadHost.add(h);
      }
      return undefined;
    }
    async function coinbaseSeries(pair, from, to) { // 300 bougies max par appel
      const out = {}; let s = Math.floor(from / HOUR) * HOUR - HOUR;
      while (s <= to + HOUR) {
        const e = Math.min(s + 299 * HOUR, to + 2 * HOUR);
        const r = await get('Coinbase', `https://api.exchange.coinbase.com/products/${pair}/candles?granularity=3600&start=${new Date(s).toISOString()}&end=${new Date(e).toISOString()}`);
        if (r.err) return undefined; if (!Array.isArray(r.j)) return null; // NotFound : paire inexistante
        for (const k of r.j) out[Math.floor(k[0] * 1000 / HOUR)] = +k[3];
        s = e + HOUR;
      }
      return out;
    }
    const geckoIds = Object.assign({}, opt.geckoIds || {});
    let gq = Promise.resolve();
    function gget(url) { const r = gq.then(async () => { let x; for (let i = 0; i < 3; i++) { x = await get('CoinGecko', url, 1); if (!x.err && !(x.j && x.j.status && x.j.status.error_code === 429)) break; await sleep(4000 * (i + 1)); } await sleep(opt.geckoGap != null ? opt.geckoGap : 2200); return x; }); gq = r.catch(() => {}); return r; }
    async function geckoSeries(a, from, to) { // ≤ 90 jours par appel -> points horaires
      if (!(a in geckoIds)) {
        const r = await gget(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(a)}`);
        if (r.err || !r.j || !r.j.coins) return undefined;
        const c = r.j.coins.filter(x => String(x.symbol).toUpperCase() === a).sort((x, y) => (x.market_cap_rank || 1e9) - (y.market_cap_rank || 1e9))[0];
        geckoIds[a] = c ? c.id : null;
      }
      const id = geckoIds[a]; if (!id) return null;
      const out = {}; let s = from - 2 * HOUR;
      while (s <= to) {
        const e = Math.min(s + 89 * DAY, to + 2 * HOUR);
        const r = await gget(`https://api.coingecko.com/api/v3/coins/${id}/market_chart/range?vs_currency=eur&from=${Math.floor(s / 1000)}&to=${Math.floor(e / 1000)}`);
        if (r.err || !r.j || !r.j.prices) return undefined;
        for (const [t, p] of r.j.prices) out[Math.round(t / HOUR)] = p;
        s = e;
      }
      return out;
    }
    /* Série en € pour un actif : chaîne de sources avec repli automatique. -> { s, src } | null (aucune paire) | undefined (réseau) */
    let eurusdt;
    async function series(a, from, to) {
      let net = false;
      let s = await binanceSeries(a + 'EUR', from, to); if (s && Object.keys(s).length) return { s, src: 'Binance' }; if (s === undefined) net = true;
      s = await binanceSeries(a + 'USDT', from, to);
      if (s && Object.keys(s).length) {
        if (!eurusdt) eurusdt = await binanceSeries('EURUSDT', Math.min(from, opt.from || from), Math.max(to, opt.to || to));
        if (eurusdt) { const o = {}; for (const h in s) { const e = eurusdt[h] || eurusdt[h - 1] || eurusdt[+h + 1]; if (e) o[h] = s[h] / e; } return { s: o, src: 'Binance (USDT)' }; }
      } else if (s === undefined) net = true;
      s = await coinbaseSeries(a + '-EUR', from, to); if (s && Object.keys(s).length) return { s, src: 'Coinbase' }; if (s === undefined) net = true;
      if (opt.gecko !== false) { s = await geckoSeries(a, from, to); if (s && Object.keys(s).length) return { s, src: 'CoinGecko' }; if (s === undefined) net = true; }
      return net ? undefined : null;
    }
    return { fxRange, series, diag, stats };
  }
  /* Exécute des tâches avec au plus n en parallèle. */
  async function pool(items, n, fn, signal) {
    let i = 0; const run = async () => { while (i < items.length) { if (signal && signal.aborted) throw new Error('Annulé'); const k = i++; await fn(items[k], k); } };
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
  }

  /* Cours observés dans les relevés (achats/ventes), utilisés en dernier recours (cours le plus proche, ±30 jours, signalé « ≈ »). */
  function observed(txs) {
    const o = {};
    for (const t of txs) {
      if (!['BUY', 'SELL', 'PAY', 'EXCH_IN', 'EXCH_OUT'].includes(t.type) || !(t.qty > 0) || t.qtyStatus === 'suspect' || t.qtyStatus === 'à reconstruire') continue;
      const p = t.eur > 0 ? t.eur / t.qty : null; if (p) (o[t.asset] = o[t.asset] || []).push([t.date, p]);
    }
    return (a, ts, any) => { const L = o[a]; if (!L) return null; let b = null; for (const [d, p] of L) { const e = Math.abs(d - ts); if ((any || e <= 30 * DAY) && (!b || e < b.e)) b = { e, p }; } return b && b.p; };
  }

  /* Prépare : conversion devises, quantités tronquées, cours nécessaires. cache[key]= prix | 'NA' */
  /* Recherche de cours : cache horaire (±2 h) puis cours observé dans les relevés (≤30 j, sinon le plus proche), marqué ≈. */
  function priceLookup(txs, cache, manual) {
    const obs = observed(txs), approx = new Set();
    const fn = (a, ts, txId) => {
      if (manual && txId != null && manual[a + '@' + txId] != null) return manual[a + '@' + txId];
      if (manual && manual[a] != null) return manual[a];
      const h = Math.floor(ts / HOUR);
      for (const d of [0, -1, 1, -2, 2]) { const v = cache[a + '|h' + (h + d)]; if (typeof v === 'number') return v; }
      const o = obs(a, ts) != null ? obs(a, ts) : obs(a, ts, true); if (o != null) approx.add(a + '|' + ts); return o;
    };
    fn.approx = approx; return fn;
  }
  /* progress(étape, fait, total) ; opt.signal pour annuler ; opt.onSave() appelé régulièrement (cache persistant). */
  async function prepare(txs, src, cache, log, opt) {
    log = log || (() => {}); opt = opt || {}; const signal = opt.signal, save = opt.onSave || (() => {});
    // 1. devises : un appel par devise pour toute la période
    const pending = txs.filter(t => t.fxPending), curs = [...new Set(pending.map(t => t.cur))];
    let k = 0;
    for (const cur of curs) {
      log('Taux de change ' + cur, k, curs.length);
      const ts = pending.filter(t => t.cur === cur).map(t => t.date), m = await src.fxRange(cur, Math.min(...ts), Math.max(...ts));
      const days = Object.keys(m).sort();
      for (const t of pending.filter(t => t.cur === cur)) {
        const d = new Date(t.date).toISOString().slice(0, 10); let r = m[d];
        if (!r) { const prev = days.filter(x => x <= d).pop(); r = m[prev] || m[days[0]]; } // jour ouvré précédent
        if (r) { t.fx = r; t.eur = t.valCur * r; t.fee = t.feeCur * r; if (t.unitPriceCur) t.unitPrice = t.unitPriceCur * r; delete t.fxPending; if (t.qtyStatus === 'suspect' || t.qtyStatus === 'corrigée') { const f = E.fixQty(t.qtyRaw, t.unitPrice, t.eur); t.qty = f.qty; t.qtyStatus = f.status; } }
      }
      log('Taux de change ' + cur, ++k, curs.length);
    }
    // 2. cours : une série horaire par actif sur la plage utile
    const rec = txs.filter(t => t.qtyStatus === 'à reconstruire' && t.qtyRaw && !t.qtyManual);
    const need = E.neededPrices(txs).concat(rec.map(t => ({ asset: t.asset, ts: t.date })))
      .filter(n => typeof cache[n.asset + '|h' + Math.floor(n.ts / HOUR)] !== 'number' && cache[n.asset + '|none'] == null);
    const by = {}; for (const n of need) (by[n.asset] = by[n.asset] || []).push(n.ts);
    const assets = Object.keys(by), failed = []; let done = 0;
    await pool(assets, opt.concurrency || 4, async a => {
      const ts = by[a], r = await src.series(a, Math.min(...ts), Math.max(...ts));
      if (r === null) cache[a + '|none'] = 1; // aucune source ne connaît ce jeton
      else if (r === undefined) failed.push(a); // erreur réseau : rien n'est mis en cache, on réessaiera
      else for (const t of ts) { const h = Math.floor(t / HOUR); for (const d of [0, -1, 1, -2, 2]) if (r.s[h + d] != null) { cache[a + '|h' + h] = r.s[h + d]; break; } }
      log('Cours', ++done, assets.length); save();
    }, signal);
    // 3. quantités tronquées (xlsx)
    const fn = priceLookup(txs, cache, opt.manual), obs0 = observed(txs);
    for (const t of rec) {
      const p = fn(t.asset, t.date) || obs0(t.asset, t.date);
      if (p && t.eur > 0) { t.qty = E.scaleToValue(t.qtyRaw, p, t.eur); t.qtyStatus = 'reconstruite (cours historique)'; }
      else if (p) { t.qty = E.scaleToValue(t.qtyRaw, p, 1); t.qtyStatus = 'à vérifier (≈ 1 € supposé)'; }
      else t.qtyStatus = 'à vérifier (aucun cours)';
    }
    save();
    fn.failed = failed; fn.fxMissing = txs.filter(t => t.fxPending).length; fn.missing = failed.length; return fn;
  }
  /* Relevé PDF Revolut : lignes de texte -> lignes à 7 colonnes (Symbole, Type, Quantité, Prix, Valeur, Frais, Date)
     + lignes des relevés en devises (« Vente de X » / « Achat de X ») pour la contre-vérification. */
  const DATE_RE = '(\\d{1,2}\\s+[a-zéèûô.]+\\s+\\d{4},?\\s+\\d{1,2}:\\d{2}(?::\\d{2})?)';
  function parsePdfLines(lines) {
    const rows = [], fiat = [], skipped = [], closing = {}, opening = {}; let period = null, inRep = false;
    const trade = new RegExp('^([A-Z0-9]{1,15})\\s+(.+?)\\s+(-?\\d[\\d\\u00a0\\u202f]*(?:[.,]\\d+)?)((?:\\s+-?[\\d\\u00a0\\u202f.,]+\\s?[€$£])*)\\s+' + DATE_RE + '$', 'i');
    const fiatRe = new RegExp('^' + DATE_RE + '\\s+(.*)$', 'i');
    for (let l of lines) {
      l = String(l).replace(/\s+/g, ' ').trim(); if (!l) continue;
      if (/^symbole\s+type\s+quantit/i.test(l)) { inRep = false; continue; } // en-tête de page répété
      let pm = /^p[ée]riode\s+(.+?)\s+-\s+(.+)$/i.exec(l); if (pm && !period) { period = { from: pm[1], to: pm[2] }; continue; }
      if (/^r[ée]partition du portefeuille/i.test(l)) { inRep = true; continue; }
      if (/^valeur des cryptos/i.test(l)) { inRep = false; continue; }
      // Résumé du compte : « 0 BTC 0,02726735 BTC » = valeur d'ouverture, valeur de clôture
      pm = /^(-?\d[\d\u00a0\u202f]*(?:,\d+)?)\s+([A-Z0-9]{1,15})\s+(-?\d[\d\u00a0\u202f]*(?:,\d+)?)\s+\2$/.exec(l);
      if (pm) { opening[pm[2]] = E.parseNum(pm[1], 'FR'); closing[pm[2]] = E.parseNum(pm[3], 'FR'); continue; }
      if (inRep) { pm = /^([A-Z0-9]{1,15})\s+.*?\s(\d[\d\u00a0\u202f]*(?:,\d+)?)\s+-?[\d\u00a0\u202f.,]+\s?€\s+-?[\d\u00a0\u202f.,]+\s?€/.exec(l); if (pm) { closing[pm[1]] = E.parseNum(pm[2], 'FR'); continue; } }
      let m = fiatRe.exec(l);
      if (m) { if (/(vente|achat) de\s+[A-Za-z0-9]+/i.test(m[2])) fiat.push(l); continue; }
      m = trade.exec(l);
      if (m && /^[A-Z0-9]+$/.test(m[1]) && /[a-zé]/i.test(m[2]) && !/\d/.test(m[2])) {
        const am = m[4].trim() ? m[4].trim().split(/\s+(?=-?\d)/) : [];
        rows.push([m[1], m[2], m[3], am[0] || '', am[1] || '', am[2] || '', m[5]]);
      } else skipped.push(l);
    }
    const to = period ? E.parseDate(period.to + ', 23:59:59', 'DMY') : NaN;
    return { rows, fiat, skipped, balances: Object.keys(closing).length ? { closing, opening, period, to } : null };
  }
  /* Regroupe les fragments de texte pdf.js en lignes (même ordonnée). */
  function itemsToLines(items) {
    const by = [];
    for (const it of items) { if (!it.str || !it.str.trim()) continue; const y = it.transform[5], x = it.transform[4]; let L = by.find(b => Math.abs(b.y - y) < 2.5); if (!L) by.push(L = { y, parts: [] }); L.parts.push({ x, s: it.str }); }
    by.sort((a, b) => b.y - a.y);
    return by.map(L => L.parts.sort((a, b) => a.x - b.x).map(p => p.s.trim()).join(' '));
  }
  const api = { priceLookup, pool, parsePdfLines, itemsToLines, importRows, makeSources, prepare, observed };
  if (typeof module !== 'undefined') module.exports = api; else root.KryptaxPipeline = api;
})(this);
