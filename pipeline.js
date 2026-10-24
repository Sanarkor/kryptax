/* Kryptax — import des lignes et préparation (devises, quantités, cours). Navigateur et Node. */
(function (root) {
  'use strict';
  const E = root.KryptaxEngine || (typeof require !== 'undefined' ? require('./engine.js') : null);
  const HOUR = 3600e3, DAY = 24 * HOUR;
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
      const t = { id: uid(), seq: i, date, type, rawType: E.fixText(g('type')), asset, qty, platform: o.platform, source: o.source, qtyStatus, qtyRaw, unitPrice: price || undefined };
      if (cur === 'EUR') { t.eur = v || 0; t.fee = fee; } else { t.cur = cur; t.valCur = v || 0; t.feeCur = fee; t.unitPriceCur = price || undefined; t.eur = 0; t.fee = 0; t.unitPrice = undefined; t.fxPending = true; }
      out.push(t);
    });
    return { txs: out, bad };
  }

  /* ---- Sources publiques ---- */
  function makeSources(fetchFn, opt) {
    opt = opt || {};
    async function getJSON(url, tries = 4, log) {
      for (let i = 0; i < tries; i++) {
        try {
          const r = await fetchFn(url);
          if (r.status === 429 || r.status >= 500) { log && log('Limite d’API, pause…'); await sleep(2000 * (i + 1)); continue; }
          const j = await r.json();
          if (j && j.Response === 'Error' && /rate|limit/i.test(j.Message || '')) { log && log('Limite d’API, pause…'); await sleep(4000 * (i + 1)); continue; }
          return j;
        } catch (e) { await sleep(1000 * (i + 1)); }
      }
      return null;
    }
    const fxCache = opt.fxCache || {};
    async function fx(cur, ts) { // 1 unité de cur en EUR (BCE via Frankfurter, jour ouvré précédent)
      if (cur === 'EUR') return 1;
      const d = new Date(ts); const day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const k = cur + '|' + day; if (fxCache[k]) return fxCache[k];
      const j = await getJSON(`https://api.frankfurter.dev/v1/${day}?from=${cur}&to=EUR`);
      const v = j && j.rates && j.rates.EUR; if (v) fxCache[k] = v; return v || null;
    }
    const hosts = ['https://api.binance.com', 'https://data-api.binance.vision'];
    async function kline(sym, ts) {
      for (const h of hosts) {
        const j = await getJSON(`${h}/api/v3/klines?symbol=${sym}&interval=1h&startTime=${Math.floor(ts / HOUR) * HOUR}&limit=1`, 2);
        if (Array.isArray(j)) return j.length ? +j[0][4] : null;
        if (j && j.code === -1121) return null; // paire inexistante
      }
      return null;
    }
    async function price(a, ts, log) {
      if (opt.ccKey) {
        const recent = Date.now() - ts < 6.5 * DAY;
        const j = await getJSON(`https://min-api.cryptocompare.com/data/v2/histo${recent ? 'minute' : 'hour'}?fsym=${encodeURIComponent(a)}&tsym=EUR&limit=1&toTs=${Math.floor(ts / 1000)}&api_key=${encodeURIComponent(opt.ccKey)}`, 4, log);
        const d = j && j.Data && j.Data.Data; if (d && d.length && d[d.length - 1].close > 0) return { p: d[d.length - 1].close, src: 'CryptoCompare' };
      }
      let p = await kline(a + 'EUR', ts); if (p) return { p, src: 'Binance' };
      const u = await kline(a + 'USDT', ts);
      if (u) { const eu = await kline('EURUSDT', ts); if (eu) return { p: u / eu, src: 'Binance (USDT)' }; }
      return null;
    }
    return { fx, price, fxCache };
  }

  /* Cours observés dans les relevés (achats/ventes), utilisés en dernier recours (cours le plus proche, ±30 jours, signalé « ≈ »). */
  function observed(txs) {
    const o = {};
    for (const t of txs) {
      if (!['BUY', 'SELL', 'PAY', 'EXCH_IN', 'EXCH_OUT'].includes(t.type) || !(t.qty > 0) || t.qtyStatus === 'suspect' || t.qtyStatus === 'à reconstruire') continue;
      const p = t.eur > 0 ? t.eur / t.qty : null; if (p) (o[t.asset] = o[t.asset] || []).push([t.date, p]);
    }
    return (a, ts) => { const L = o[a]; if (!L) return null; let b = null; for (const [d, p] of L) { const e = Math.abs(d - ts); if (e <= 30 * DAY && (!b || e < b.e)) b = { e, p }; } return b && b.p; };
  }

  /* Prépare : conversion devises, quantités tronquées, cours nécessaires. cache[key]= prix | 'NA' */
  async function prepare(txs, src, cache, log) {
    log = log || (() => {});
    const key = (a, ts) => a + '|' + Math.floor(ts / HOUR);
    const pending = txs.filter(t => t.fxPending);
    for (let i = 0; i < pending.length; i++) {
      const t = pending[i]; log(`Taux ${t.cur}→EUR ${i + 1}/${pending.length}…`);
      const r = await src.fx(t.cur, t.date);
      if (r) { t.fx = r; t.eur = t.valCur * r; t.fee = t.feeCur * r; if (t.unitPriceCur) t.unitPrice = t.unitPriceCur * r; delete t.fxPending; if (t.qtyStatus === 'suspect' || t.qtyStatus === 'corrigée') { const f = E.fixQty(t.qtyRaw, t.unitPrice, t.eur); t.qty = f.qty; t.qtyStatus = f.status; } }
    }
    const getP = async (a, ts) => {
      const k = key(a, ts); if (cache[k] == null) { log(`Cours ${a}…`); const r = await src.price(a, ts, log); cache[k] = r ? r.p : 'NA'; await sleep(120); }
      return cache[k] === 'NA' ? null : cache[k];
    };
    // quantités tronquées sans prix fiable : cours historique (ou observé)
    const obs0 = observed(txs);
    for (const t of txs.filter(t => t.qtyStatus === 'à reconstruire' && t.qtyRaw && !t.qtyManual)) {
      const p = (await getP(t.asset, t.date)) || obs0(t.asset, t.date);
      if (p && t.eur > 0) { t.qty = E.scaleToValue(t.qtyRaw, p, t.eur); t.qtyStatus = 'reconstruite (cours historique)'; }
      else if (p) { t.qty = E.scaleToValue(t.qtyRaw, p, 1); t.qtyStatus = 'à vérifier (≈ 1 € supposé)'; }
      else t.qtyStatus = 'à vérifier (aucun cours)';
    }
    for (const n of E.neededPrices(txs)) await getP(n.asset, n.ts);
    const obs = observed(txs);
    const approx = new Set();
    const fn = (a, ts) => { const v = cache[key(a, ts)]; if (v != null && v !== 'NA') return v; const o = obs(a, ts); if (o != null) approx.add(a + '|' + ts); return o; };
    fn.approx = approx; return fn;
  }
  /* Relevé PDF Revolut : lignes de texte -> lignes à 7 colonnes (Symbole, Type, Quantité, Prix, Valeur, Frais, Date)
     + lignes des relevés en devises (« Vente de X » / « Achat de X ») pour la contre-vérification. */
  const DATE_RE = '(\\d{1,2}\\s+[a-zéèûô.]+\\s+\\d{4},?\\s+\\d{1,2}:\\d{2}(?::\\d{2})?)';
  function parsePdfLines(lines) {
    const rows = [], fiat = [], skipped = [];
    const trade = new RegExp('^([A-Z0-9]{1,15})\\s+(.+?)\\s+(-?\\d[\\d\\u00a0\\u202f]*(?:[.,]\\d+)?)((?:\\s+-?[\\d\\u00a0\\u202f.,]+\\s?[€$£])*)\\s+' + DATE_RE + '$', 'i');
    const fiatRe = new RegExp('^' + DATE_RE + '\\s+(.*)$', 'i');
    for (let l of lines) {
      l = String(l).replace(/\s+/g, ' ').trim(); if (!l) continue;
      if (/^symbole\s+type\s+quantit/i.test(l)) continue; // en-tête de page répété
      let m = fiatRe.exec(l);
      if (m) { if (/(vente|achat) de\s+[A-Za-z0-9]+/i.test(m[2])) fiat.push(l); continue; }
      m = trade.exec(l);
      if (m && /^[A-Z0-9]+$/.test(m[1]) && /[a-zé]/i.test(m[2]) && !/\d/.test(m[2])) {
        const am = m[4].trim() ? m[4].trim().split(/\s+(?=-?\d)/) : [];
        rows.push([m[1], m[2], m[3], am[0] || '', am[1] || '', am[2] || '', m[5]]);
      } else skipped.push(l);
    }
    return { rows, fiat, skipped };
  }
  /* Regroupe les fragments de texte pdf.js en lignes (même ordonnée). */
  function itemsToLines(items) {
    const by = [];
    for (const it of items) { if (!it.str || !it.str.trim()) continue; const y = it.transform[5], x = it.transform[4]; let L = by.find(b => Math.abs(b.y - y) < 2.5); if (!L) by.push(L = { y, parts: [] }); L.parts.push({ x, s: it.str }); }
    by.sort((a, b) => b.y - a.y);
    return by.map(L => L.parts.sort((a, b) => a.x - b.x).map(p => p.s.trim()).join(' '));
  }
  const api = { parsePdfLines, itemsToLines, importRows, makeSources, prepare, observed };
  if (typeof module !== 'undefined') module.exports = api; else root.KryptaxPipeline = api;
})(this);
