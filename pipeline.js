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
      const curTxt = E.fixText(String(vRaw || pRaw || fRaw || '')), cur = /[$£€]|USD|GBP|EUR/.test(curTxt) ? E.currencyOf(curTxt) : (o.cur || 'EUR');
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
      const t = { id: uid(), seq: i, date, type, feeInKind: o.feeInKind != null ? !!o.feeInKind : /revolut|^relev/i.test(o.platform || ''), rawType: E.fixText(g('type')), asset, qty, platform: o.platform, source: o.source, qtyStatus, qtyRaw, unitPrice: price || undefined };
      if (cur === 'EUR') { t.eur = v || 0; t.fee = fee; } else { t.cur = cur; t.valCur = v || 0; t.feeCur = fee; t.unitPriceCur = price || undefined; t.eur = 0; t.fee = 0; t.unitPrice = undefined; t.fxPending = true; }
      out.push(t);
    });
    return { txs: out, bad };
  }

  /* ---- Sources publiques ---- */
  /* Sources publiques de cours, toutes avec CORS ouvert (testé) : on demande une SÉRIE horaire par actif sur toute la période
     (quelques appels par actif au lieu d'un appel par cession × actif). Une erreur réseau n'est jamais mise en cache comme
     « pas de cours » : seul un « paire inexistante » sur toutes les sources l'est. diag : état par source (panneau « Sources de prix »). */
  const IDS = (typeof module !== 'undefined' && typeof require === 'function') ? require('./ids.js') : (root.KryptaxIds || { ids: {}, ct: {} });
  /* Renommages / homonymes : identifiants CoinGecko explicites (plusieurs = essais successifs). */
  const FIX = { MATIC: ['matic-network', 'polygon-ecosystem-token'], POL: ['polygon-ecosystem-token', 'matic-network'], EOS: ['eos', 'vaulta'], A: ['vaulta', 'eos'], MKR: ['maker', 'sky'], FXS: 'frax-share', REP: 'augur', ONE: 'harmony', XAI: 'xai-blockchain', RLB: 'rollbit-coin', GAL: 'project-galaxy',
    XMR: 'monero', WBT: 'whitebit', RLUSD: 'ripple-usd', FRAX: 'frax', AUSD: 'agora-dollar', KNTQ: 'kinetiq', GENIUS: 'genius-3', OPG: 'opengradient', TGBP: 'tokenised-gbp', AI16Z: 'ai16z', EUROP: 'schuman-europ', MXC: 'mxc', RIZE: 'rize', SAMO: 'samoyedcoin', SPC: 'spacechain-erc-20', UNFI: 'unifi-protocol-dao', USDQ: 'quantoz-usdq', XSGD: 'xsgd', ACN: 'solidus-aitech', RWS: 'real-world-services', U: 'united-stables' };
  /* Alias de tickers (anciens noms, suffixes Kraken .S/.M/.F/.P). */
  const ALIAS = { ETH2: 'ETH', XBT: 'BTC', XDG: 'DOGE' };
  function baseSym(a) { a = String(a).toUpperCase().replace(/\.(S|M|F|P)$/, ''); return ALIAS[a] || a; }
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
      if (opt.block && opt.block.some(b => srcName.includes(b))) { d.calls++; d.fail++; d.last = 'bloqué (simulation)'; noteErr(srcName, d.last); return { err: d.last }; }
      for (let i = 0; i < tries; i++) {
        if (signal && signal.aborted) throw new Error('Annulé');
        d.calls++;
        // limitation de débit : au moins GAP ms entre deux appels à la même source
        const GAP = opt.gap != null ? opt.gap : 150, nx = Math.max(Date.now(), (nextAt[srcName] || 0)); nextAt[srcName] = nx + GAP; if (nx > Date.now()) await sleep(nx - Date.now());
        try {
          const r = await fetchT(url);
          if (r.status === 429 || r.status >= 500) { err = 'HTTP ' + r.status; await sleep(1500 * (i + 1)); continue; }
          const j = await r.json().catch(() => null);
          if (r.status >= 400) { d.ok++; return { j: j || {}, status: r.status }; }
          d.ok++; return { j };
        } catch (e) { if (signal && signal.aborted) throw new Error('Annulé'); err = e && e.name === 'AbortError' ? 'délai dépassé (8 s)' : (e && e.message) || 'réseau'; if (i + 1 < tries) await sleep(500); }
      }
      d.fail++; d.last = err; noteErr(srcName, err); return { err };
    }
    const lastErr = {}, nextAt = {};
    function noteErr(src, e) { const k = /Binance/.test(src) ? ['Binance €', 'Binance USDT'] : [src]; k.forEach(x => lastErr[x] = e + (typeof location === 'undefined' ? '' : '')); }
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
    const hosts = ['https://data-api.binance.vision', 'https://api.binance.com'], deadHost = new Set(), hostFails = {};
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
        hostFails[h] = (hostFails[h] || 0) + 1; if (hostFails[h] >= 2) deadHost.add(h); else continue;
      }
      return undefined;
    }
    const dead = new Set(); // source injoignable (erreur réseau) : on ne la réessaie plus pendant ce calcul
    async function coinbaseSeries(pair, from, to) {
      if (dead.has('cb')) return undefined; // 300 bougies max par appel
      const out = {}; let s = Math.floor(from / HOUR) * HOUR - HOUR;
      while (s <= to + HOUR) {
        const e = Math.min(s + 299 * HOUR, to + 2 * HOUR);
        const r = await get('Coinbase', `https://api.exchange.coinbase.com/products/${pair}/candles?granularity=3600&start=${new Date(s).toISOString()}&end=${new Date(e).toISOString()}`);
        if (r.err) { if (r.err !== 'HTTP 429') dead.add('cb'); return undefined; } if (!Array.isArray(r.j)) return null; // NotFound : paire inexistante
        for (const k of r.j) out[Math.floor(k[0] * 1000 / HOUR)] = +k[3];
        s = e + HOUR;
      }
      return out;
    }
    const geckoIds = Object.assign({ VVV: 'venice-token', ATH: 'aethir', XDC: 'xdce-crowd-sale', GIGA: 'gigachad-2', GRASS: 'grass', MON: 'monad', MEW: 'cat-in-a-dogs-world', ZKJ: 'polyhedra-network', FLR: 'flare-networks', MATH: 'math', TON: 'the-open-network', HYPE: 'hyperliquid', STG: 'stargate-finance', DOGS: 'dogs-2', USDC: 'usd-coin', VET: 'vechain', PROVE: 'succinct', ADA: 'cardano', ZRO: 'layerzero', BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple', DOGE: 'dogecoin', PEPE: 'pepe' }, FIX, opt.geckoIds || {});
    for (const k in IDS.ids) if (!(k in geckoIds)) geckoIds[k] = IDS.ids[k];
    let gq = Promise.resolve();
    function gget(url) { const r = gq.then(async () => { let x; for (let i = 0; i < 3; i++) { if (dead.has('gecko')) return { err: 'injoignable' }; x = await get('CoinGecko', url, 1); const lim = x.err === 'HTTP 429' || (x.j && x.j.status && x.j.status.error_code === 429); if (!x.err && !lim) break; if (!lim) { dead.add('gecko'); break; } await sleep(4000 * (i + 1)); } await sleep(opt.geckoGap != null ? opt.geckoGap : 2200); return x; }); gq = r.catch(() => {}); return r; }
    async function geckoSeries(a, from, to) { // ≤ 90 jours par appel -> points horaires
      const id = [].concat(geckoIds[a] || [])[0]; if (!id) return null; // table embarquée, aucune recherche
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
    /* Gate.io : bougies 1 h (≤ 1000 par appel), CORS ouvert, liste beaucoup de petits jetons. [ts s, vol, close, high, low, open, …] */
    async function gateSeries(a, from, to) {
      const out = {}; let s = Math.floor(from / 1000) - 3600;
      while (s <= to / 1000 + 3600) {
        const e = Math.min(s + 999 * 3600, Math.floor(to / 1000) + 7200);
        const r = await get('Gate.io', `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${a}_USDT&interval=1h&from=${s}&to=${e}`);
        if (r.err) return undefined; if (!Array.isArray(r.j)) return r.j && /INVALID/.test(r.j.label || '') ? null : undefined;
        for (const k of r.j) out[Math.floor(+k[0] * 1000 / HOUR)] = +k[5];
        s = e + 3600;
      }
      return out;
    }
    /* OKX : 100 bougies par appel en remontant le temps (dernier recours, plus d'appels). */
    async function okxSeries(a, from, to) {
      const out = {}; let after = Math.floor(to / HOUR) * HOUR + 3 * HOUR;
      for (let i = 0; i < 60 && after > from - 2 * HOUR; i++) {
        const r = await get('OKX', `https://www.okx.com/api/v5/market/history-candles?instId=${a}-USDT&bar=1H&limit=100&after=${after}`);
        if (r.err) return undefined; if (!r.j || r.j.code === '51001') return null; if (!Array.isArray(r.j.data)) return undefined;
        if (!r.j.data.length) break;
        for (const k of r.j.data) out[Math.floor(+k[0] / HOUR)] = +k[1];
        after = +r.j.data[r.j.data.length - 1][0];
      }
      return out;
    }
    /* USDT -> € : Binance EURUSDT, sinon taux BCE USD (USDT ≈ 1 $). */
    let usdEur = null;
    async function toEur(s, from, to) {
      if (!usdEur) {
        const lo = Math.min(from, opt.from || from), hi = Math.max(to, opt.to || to), e = await binanceSeries('EURUSDT', lo, hi), m = {};
        if (e && Object.keys(e).length) { for (const h in e) m['h' + h] = 1 / e[h]; }
        else { const fx = await fxRange('USD', lo, hi); for (const d in fx) m[d] = fx[d]; }
        if (Object.keys(m).length) usdEur = m; else return null;
      }
      const days = Object.keys(usdEur).filter(k => k[0] !== 'h').sort(), o = {};
      for (const h in s) {
        let r = usdEur['h' + h] || usdEur['h' + (h - 1)] || usdEur['h' + (+h + 1)];
        if (!r && days.length) { const d = new Date(h * HOUR).toISOString().slice(0, 10); r = usdEur[days.filter(x => x <= d).pop() || days[0]]; }
        if (r) o[h] = s[h] * r;
      }
      return o;
    }
    /* Kraken : 720 dernières bougies 1 h seulement (≈ 30 jours) — utile pour les cessions récentes. */
    async function krakenSeries(pair) {
      const r = await get('Kraken', `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=60`);
      if (r.err) return undefined; if (!r.j || (r.j.error || []).some(e => /Unknown asset pair/i.test(e))) return null;
      const k = r.j.result && Object.keys(r.j.result).find(x => x !== 'last'); if (!k) return undefined;
      const out = {}; for (const c of r.j.result[k]) out[Math.floor(c[0] * 1000 / HOUR)] = +c[1]; return out;
    }
    /* DefiLlama : cours $ à l'heure, 500 points par appel, via l'identifiant CoinGecko (sans clé). */
    async function llamaSeries(a, from, to) {
      const ids = [].concat(geckoIds[a] || []); if (!ids.length) return null;
      for (const id of ids) { const r = await llamaOne(id, from, to); if (r === undefined) return undefined; if (r && Object.keys(r).length) return r; }
      return null;
    }
    async function llamaOne(id, from, to) {
      const out = {}; let s = Math.floor(from / 1000) - 3600;
      while (s <= to / 1000 + 3600) {
        const r = await get('DefiLlama', `https://coins.llama.fi/chart/coingecko:${id}?start=${s}&span=500&period=1h&searchWidth=1h`);
        if (r.err) return undefined; const c = r.j && r.j.coins && r.j.coins['coingecko:' + id]; if (!c) return Object.keys(out).length ? out : null;
        for (const p of c.prices || []) out[Math.round(p.timestamp * 1000 / HOUR)] = +p.price;
        s += 500 * 3600;
      }
      return out;
    }
    /* Bitget : 200 bougies 1 h par appel, en remontant le temps. */
    async function bitgetSeries(a, from, to) {
      const out = {}; let end = Math.floor(to / HOUR) * HOUR + 3 * HOUR;
      for (let i = 0; i < 80 && end > from - 2 * HOUR; i++) {
        const r = await get('Bitget', `https://api.bitget.com/api/v2/spot/market/history-candles?symbol=${a}USDT&granularity=1h&endTime=${end}&limit=200`);
        if (r.err) return undefined; if (!r.j || r.j.code === '40034') return null; const k = r.j.data || []; if (!k.length) break;
        for (const c of k) out[Math.floor(+c[0] / HOUR)] = +c[1];
        end = Math.min(...k.map(c => +c[0])) - 1;
      }
      return out;
    }
    /* Bitstamp : paires en euros, 1000 bougies par appel. */
    async function bitstampSeries(a, from, to) {
      const out = {}; let s = Math.floor(from / 1000) - 3600;
      while (s <= to / 1000 + 3600) {
        const r = await get('Bitstamp €', `https://www.bitstamp.net/api/v2/ohlc/${a.toLowerCase()}eur/?step=3600&limit=1000&start=${s}`);
        if (r.err) return undefined; if (r.status === 404 || !r.j || !r.j.data) return null;
        for (const c of r.j.data.ohlc || []) out[Math.floor(+c.timestamp * 1000 / HOUR)] = +c.open;
        s += 1000 * 3600;
      }
      return out;
    }
    /* Crypto.com : paires en $, 300 bougies par appel. */
    async function cdcSeries(a, from, to) {
      const out = {}; let s = Math.floor(from / HOUR) * HOUR - HOUR;
      while (s <= to + HOUR) {
        const e = s + 299 * HOUR, r = await get('Crypto.com', `https://api.crypto.com/exchange/v1/public/get-candlestick?instrument_name=${a}_USD&timeframe=1h&start_ts=${s}&end_ts=${e}&count=300`);
        if (r.err) return undefined; if (!r.j || r.j.code === 40004) return null;
        for (const c of (r.j.result && r.j.result.data) || []) out[Math.floor(+c.t / HOUR)] = +c.o;
        s = e + HOUR;
      }
      return out;
    }
    const assetDiag = {};
    /* Chaîne de sources : Binance € → Binance USDT → Gate.io → OKX → DefiLlama → Bitget → Bitstamp € → Crypto.com → Coinbase €/$ → Kraken → CoinGecko (id explicite). Chaque essai est noté par actif. */
    /* GeckoTerminal (DEX) : dernier recours si le contrat est connu. */
    async function gtSeries(a, from, to) {
      const id = [].concat(geckoIds[a] || [])[0], c = id && IDS.ct[id]; if (!c) return null;
      const [net, addr] = c.split(':');
      const pr = await get('GeckoTerminal', `https://api.geckoterminal.com/api/v2/networks/${net}/tokens/${addr}/pools?page=1`);
      if (pr.err) return undefined; const pool = pr.j && pr.j.data && pr.j.data[0]; if (!pool) return null;
      const pa = pool.attributes.address, out = {}; let before = Math.floor(to / 1000) + 7200;
      for (let i = 0; i < 20 && before > from / 1000 - 7200; i++) {
        const r = await get('GeckoTerminal', `https://api.geckoterminal.com/api/v2/networks/${net}/pools/${pa}/ohlcv/hour?aggregate=1&limit=1000&currency=usd&token=${addr}&before_timestamp=${before}`);
        if (r.err) return undefined; const l = r.j && r.j.data && r.j.data.attributes && r.j.data.attributes.ohlcv_list; if (!l || !l.length) break;
        for (const k of l) out[Math.floor(k[0] * 1000 / HOUR)] = +k[4];
        before = Math.min(...l.map(k => k[0])) - 1;
      }
      return Object.keys(out).length ? out : null;
    }
    /* Écart médian entre deux séries (ratio), sur les heures communes. */
    function gap(x, y) { const r = Object.keys(x).filter(h => y[h] > 0 && x[h] > 0).map(h => x[h] / y[h]).sort((u, v) => u - v); return r.length ? r[r.length >> 1] : null; }
    async function series(a0, from, to) {
      const a = baseSym(a0), log = assetDiag[a0] = []; let net = false;
      const known = geckoIds[a] != null && geckoIds[a] !== '';
      let tries = [
        ['Binance €', () => binanceSeries(a + 'EUR', from, to), false],
        ['Binance USDT', () => binanceSeries(a + 'USDT', from, to), true],
        ['Gate.io', () => gateSeries(a, from, to), true],
        ['OKX', () => okxSeries(a, from, to), true],
        ['DefiLlama', () => llamaSeries(a, from, to), true],
        ['Bitget', () => bitgetSeries(a, from, to), true],
        ['Bitstamp €', () => bitstampSeries(a, from, to), false],
        ['Crypto.com', () => cdcSeries(a, from, to), true],
        ['Coinbase', () => coinbaseSeries(a + '-EUR', from, to), false],
        ['Coinbase $', () => coinbaseSeries(a + '-USD', from, to), true],
        ['Kraken', () => krakenSeries(a + 'EUR'), false],
        ['CoinGecko', () => opt.gecko === false ? null : geckoSeries(a, from, to), false],
        ['GeckoTerminal', () => opt.gecko === false ? null : gtSeries(a, from, to), true]];
      if (opt.rotate) { const r = opt.rotate % tries.length; tries = tries.slice(r).concat(tries.slice(0, r)); }
      if (known) { const L = tries.find(t => t[0] === 'DefiLlama'); tries = tries.filter(t => t !== L); tries.splice(2, 0, L); } // id connu : DefiLlama avant Gate.io / OKX / Bitget
      let llama = null;
      for (const [name, fn, usd] of tries) {
        let s = await fn();
        if (s && Object.keys(s).length) {
          if (name === 'DefiLlama') llama = false;
          if (usd) { s = await toEur(s, from, to); if (!s || !Object.keys(s).length) { log.push(name + ' : conversion $→€ impossible'); net = true; continue; } }
          log.push(name + ' : OK');
          if (known && name !== 'DefiLlama' && opt.check !== false) { // contrôle croisé avec DefiLlama
            if (llama === null) { const l = await llamaSeries(a, from, to); llama = l && Object.keys(l).length ? await toEur(l, from, to) : false; }
            const g = llama ? gap(s, llama) : null;
            if (g && (g > 1.3 || g < 1 / 1.3)) { log.push('Écart ' + Math.round((g - 1) * 100) + ' % avec DefiLlama : cours DefiLlama retenu, à vérifier'); return { s: llama, src: 'DefiLlama', suspect: true }; }
          }
          return { s, src: name };
        }
        if (s === undefined) { net = true; log.push(name + ' : ' + (lastErr[name] || 'erreur réseau')); } else log.push(name + ' : paire absente');
      }
      return net ? undefined : null;
    }
    return { fxRange, series, diag, stats, assetDiag };
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
  function priceLookup(txs, cache, manual, opts) {
    const obs = observed(txs), approx = new Set(), unvalued = new Set();
    const fn = (a, ts, txId) => {
      if (manual && txId != null && manual[a + '@' + txId] != null) return manual[a + '@' + txId];
      if (manual && manual[a] != null) return manual[a];
      const h = Math.floor(ts / HOUR);
      for (const d of [0, -1, 1, -2, 2]) { const v = cache[a + '|h' + (h + d)]; if (typeof v === 'number') return v; }
      let o = obs(a, ts);
      if (o == null) { // cours du même actif le plus proche dans le cache (autre heure)
        let best = null, bd = Infinity; const pre = a + '|h';
        for (const k in cache) if (k.startsWith(pre) && typeof cache[k] === 'number') { const dd = Math.abs(+k.slice(pre.length) - h); if (dd < bd) { bd = dd; best = cache[k]; } }
        o = best;
      }
      if (o == null) o = obs(a, ts, true);
      if (o != null) { approx.add(a + '|' + ts); return o; }
      if (opts && opts.zeroIfUnknown) { unvalued.add(a); approx.add(a + '|' + ts); return 0; } // jamais de calcul bloqué : actif non valorisé, signalé
      return null;
    };
    fn.approx = approx; fn.unvalued = unvalued; return fn;
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
    const inc = txs.filter(t => ['INTEREST', 'STAKING', 'AIRDROP', 'SEND'].includes(t.type) && !(t.eur > 0)).map(t => ({ asset: t.asset, ts: t.date }));
    const last = Math.max(...txs.map(t => t.date)), fin = isFinite(last) ? Object.keys(E.holdingsAt(txs, last)).filter(a => !E.FIATS.includes(a)).map(a => ({ asset: a, ts: last })) : []; // revenus et soldes de clôture (synthèse)
    const need = E.neededPrices(txs).concat(rec.map(t => ({ asset: t.asset, ts: t.date })), inc, fin)
      .filter(n => typeof cache[n.asset + '|h' + Math.floor(n.ts / HOUR)] !== 'number' && cache[n.asset + '|none'] == null);
    const by = {}; for (const n of need) (by[n.asset] = by[n.asset] || []).push(n.ts);
    const assets = Object.keys(by), failed = []; let done = 0;
    await pool(assets, opt.concurrency || 4, async a => {
      const ts = by[a], r = await src.series(a, Math.min(...ts), Math.max(...ts));
      if (r === null) cache[a + '|none'] = 1; // aucune source ne connaît ce jeton
      else if (r === undefined) failed.push(a); // erreur réseau : rien n'est mis en cache, on réessaiera
      else { if (r.suspect) cache[a + '|suspect'] = 1; else delete cache[a + '|suspect']; for (const t of ts) { const h = Math.floor(t / HOUR); for (const d of [0, -1, 1, -2, 2]) if (r.s[h + d] != null) { cache[a + '|h' + h] = r.s[h + d]; break; } } }
      log('Cours', ++done, assets.length); save();
    }, signal);
    // 3. quantités tronquées (xlsx)
    const fn = priceLookup(txs, cache, opt.manual, { zeroIfUnknown: true }), obs0 = observed(txs);
    for (const t of rec) {
      const p = fn(t.asset, t.date) || obs0(t.asset, t.date);
      if (p && t.eur > 0) { t.qty = E.scaleToValue(t.qtyRaw, p, t.eur); t.qtyStatus = 'reconstruite (cours historique)'; }
      else if (p) { t.qty = E.scaleToValue(t.qtyRaw, p, 1); t.qtyStatus = 'à vérifier (≈ 1 € supposé)'; }
      else t.qtyStatus = 'à vérifier (aucun cours)';
    }
    save();
    fn.failed = failed; fn.fxMissing = txs.filter(t => t.fxPending).length; fn.missing = failed.length; fn.suspect = [...new Set(txs.map(t => t.asset))].filter(x => cache[x + '|suspect']); return fn;
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
  /* Multi-import : ajoute les transactions d'un fichier sans écraser les précédentes.
     Même nom de fichier ré-importé -> remplace l'ancien (pas de doublon) ; transactions identiques déjà présentes
     depuis un AUTRE fichier (relevés qui se chevauchent) -> ignorées. Clé : type, actif, date (minute), quantité, montant €. */
  const txKey = t => [t.type, t.asset, Math.round(+t.date / 60000), (+t.qty || 0).toPrecision(9), Math.round((+t.eur || 0) * 100)].join('|');
  function mergeImport(old, fresh) {
    const names = new Set(fresh.map(t => t.source).filter(Boolean)), kept = old.filter(t => !names.has(t.source)), replaced = old.length - kept.length;
    const seen = new Set(kept.map(txKey)), add = [], dup = [];
    for (const t of fresh) (seen.has(txKey(t)) ? dup : add).push(t);
    return { txs: kept.concat(add), added: add.length, dup: dup.length, replaced };
  }
  const fileList = txs => { const m = new Map(); txs.forEach(t => { const k = t.source || 'Saisie manuelle'; m.set(k, (m.get(k) || 0) + 1); }); return [...m].map(([name, n]) => ({ name, n })); };
  /* Titulaire du relevé (en-tête « Nom du compte », « Titulaire », colonne dédiée…) ; '' si le format n'en contient pas. */
  const HOLD_RE = /^\s*(?:nom du compte|nom du titulaire|titulaire(?: du compte)?|account (?:name|holder)|account owner|nom complet|full name)\s*[:;]?\s+(.+?)\s*$/i;
  const cleanName = s => String(s || '').replace(/[0-9@_*#]+/g, ' ').replace(/\s+/g, ' ').trim();
  function holderFromLines(lines) {
    for (const l of (lines || []).slice(0, 80)) { const m = String(l).match(HOLD_RE); if (m) { const n = cleanName(m[1]); if (/[a-zA-Z\u00C0-\u024F]{2}/.test(n)) return n; } }
    return '';
  }
  function holderFromRows(rows) {
    if (!rows || !rows.length) return '';
    const head = (rows[0] || []).map(x => String(x).trim().toLowerCase().replace(/\s*:$/, ''));
    const i = head.findIndex(h => /^(titulaire|nom du compte|nom du titulaire|account (name|holder)|account owner|holder|nom complet|full name)$/.test(h));
    if (i > -1) for (const r of rows.slice(1)) { const n = cleanName(r[i]); if (n) return n; }
    return holderFromLines(rows.slice(0, 30).map(r => (r || []).map(String).join(' ').trim()));
  }
  const normName = s => cleanName(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim().split(' ').filter(Boolean).sort().join(' ');
  /* Nom masqué : initiales (« D. M. »), ou 2 lettres si les initiales ne suffisent pas à distinguer. */
  const maskName = (s, long) => cleanName(s).split(' ').filter(Boolean).map(w => long ? w.slice(0, 2) + '…' : w[0].toUpperCase() + '.').join(' ');
  /* holders : { nomDeFichier: titulaire|'' } -> { status: 'none'|'single'|'ok'|'conflict', n, bad:[fichiers], a, b } */
  function checkHolders(holders, order) {
    const files = (order || Object.keys(holders)).filter(f => holders[f]), g = {};
    for (const f of files) (g[normName(holders[f])] = g[normName(holders[f])] || []).push(f);
    const keys = Object.keys(g);
    if (!files.length) return { status: 'none', n: 0, bad: [] };
    if (keys.length === 1) return { status: files.length > 1 ? 'ok' : 'single', n: files.length, bad: [] };
    const ref = keys.reduce((x, y) => g[y].length > g[x].length ? y : x, keys[0]); // groupe majoritaire (à égalité : le premier fichier)
    const bad = files.filter(f => normName(holders[f]) !== ref), A = holders[g[ref][0]], B = holders[bad[0]];
    const long = maskName(A) === maskName(B);
    return { status: 'conflict', n: files.length, bad, a: maskName(A, long), b: maskName(B, long) };
  }
  /* Reprise automatique : relance prepare() pour les seuls actifs en échec réseau (le cache garde les cours trouvés ; « aucun cours existant » n'est jamais retenté),
     attente progressive 2 s, 5 s, 10 s, 20 s, 30 s…, plafond 10 tentatives ou ~3 min, nouvelles sources à chaque tour (sources mortes réessayées, ordre tourné). */
  const BACKOFF = [2, 5, 10, 20, 30];
  async function prepareRetry(txs, mkSrc, cache, show, opt) {
    opt = opt || {}; const max = opt.maxTries != null ? opt.maxTries : 10, budget = opt.budget != null ? opt.budget : 180e3, t0 = Date.now(), unit = opt.unit != null ? opt.unit : 1000;
    let k = 0, src = mkSrc(0), fn = await prepare(txs, src, cache, show, opt);
    while ((fn.failed.length || fn.fxMissing) && k < max && Date.now() - t0 < budget) {
      const wait = BACKOFF[Math.min(k, BACKOFF.length - 1)] * unit; k++;
      if (opt.onRetry) opt.onRetry(k, max, fn.failed);
      await new Promise((res, rej) => { const tm = setTimeout(res, wait); if (opt.signal) opt.signal.addEventListener('abort', () => { clearTimeout(tm); rej(new Error('Annulé')); }, { once: true }); });
      src = mkSrc(k); fn = await prepare(txs, src, cache, show, opt);
    }
    fn.tries = k; fn.src = src; return fn;
  }
  const api = { prepareRetry, holderFromLines, holderFromRows, normName, maskName, checkHolders, mergeImport, fileList, txKey, priceLookup, pool, parsePdfLines, itemsToLines, importRows, makeSources, prepare, observed };
  if (typeof module !== 'undefined') module.exports = api; else root.KryptaxPipeline = api;
})(this);
