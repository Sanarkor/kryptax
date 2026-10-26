/* Kryptax — import des lignes et préparation (devises, quantités, cours). Navigateur et Node. */
(function (root) {
  'use strict';
  const E = root.KryptaxEngine || (typeof require !== 'undefined' ? require('./engine.js') : null);
  const MIN = 60e3, HOUR = 3600e3, DAY = 24 * HOUR;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  /* Le relevé donne-t-il l'heure ? (minuit pile, heure de Paris ou UTC = date seule) */
  const hasTime = ts => { const d = new Date(ts); return !(d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) && !(d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0); };
  const minKey = (a, ts) => a + '|m' + Math.floor(ts / 60e3);
  /* Précision d'un cours (par opération) et libellé ; la pire précision d'une cession l'emporte. */
  const PREC = ['seconde', 'minute', 'horaire', 'journalier', 'estimé'];
  const precLabel = p => p ? (p.k === 'seconde' ? 'cours à la seconde' : p.k === 'minute' ? 'cours à la minute' : p.k === 'horaire' ? 'cours horaire' : p.k === 'journalier' ? 'cours journalier' : 'cours estimé') + (p.src && p.k !== 'estimé' ? ' (' + p.src + ')' : '') : '';
  function cessionPrec(fn, c) { // -> { k, src, n, nMin } pour une cession (detail212)
    let w = null, n = 0, nMin = 0, own = null;
    for (const d of c.detail212 || []) { const key = d.asset + '|' + c.date, p = fn && fn.approx && fn.approx.has(key) ? { k: 'estimé', src: '' } : (fn && fn.prec && fn.prec.get(key)) || null; if (!p) continue; if (d.asset === c.asset) own = p; n++; if (p.k === 'minute' || p.k === 'seconde') nMin++; if (!w || PREC.indexOf(p.k) > PREC.indexOf(w.k)) w = p; }
    return w ? Object.assign({ n, nMin, own }, w) : { k: '', src: '', n, nMin, own };
  }

  /* ---- Lecture CSV/Excel fiable : formats déduits par COLONNE (jamais cellule par cellule), sinon refus clair ---- */
  const cellTxt = v => String(E.fixText(v == null ? '' : String(v))).replace(/[\s\u00a0\u202f€$£]|[A-Za-z]{3}$/g, '').replace(/^[(-]+|\)$/g, '');
  /* Format des nombres d'une colonne : 'FR' (1 234,56), 'EN' (1,234.56), '' (indécidable : entiers, 1,234…), 'X' (les deux : incohérent). */
  function numMode(vals) {
    let fr = 0, en = 0;
    for (const v of vals) { if (typeof v !== 'string') continue; const s = cellTxt(v); if (!/^\d[\d.,]*$/.test(s)) continue;
      const c = s.lastIndexOf(','), d = s.lastIndexOf('.');
      if (c > -1 && d > -1) { if (c > d) fr++; else en++; }
      else if (c > -1) { if (!/^\d{1,3}(,\d{3})+$/.test(s)) fr++; }
      else if (d > -1) { if (!/^\d{1,3}(\.\d{3})+$/.test(s)) en++; } }
    return fr && en ? 'X' : fr ? 'FR' : en ? 'EN' : '';
  }
  /* Ordre jour/mois d'une colonne de dates JJ/MM ou MM/JJ : 'DMY', 'MDY', '' (indécidable) ou 'X' (les deux). */
  function dateMode(vals) {
    let dmy = 0, mdy = 0;
    for (const v of vals) { if (typeof v !== 'string') continue; const m = v.trim().match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-]\d{2,4}/); if (!m) continue; if (+m[1] > 12) dmy++; if (+m[2] > 12) mdy++; }
    return dmy && mdy ? 'X' : dmy ? 'DMY' : mdy ? 'MDY' : '';
  }
  /* Date de cellule Excel : objet Date (heure affichée dans la cellule) ou numéro de série (jours depuis 1899-12-30). */
  function cellDate(v, tz) {
    const mk = (y, mo, d, h, mi, s) => tz === 'UTC' ? Date.UTC(y, mo, d, h, mi, s) : E.fromParis(y, mo, d, h, mi, s);
    if (v instanceof Date) { if (isNaN(v)) return NaN; const r = new Date(Math.round(v.getTime() / 1000) * 1000); return mk(r.getFullYear(), r.getMonth(), r.getDate(), r.getHours(), r.getMinutes(), r.getSeconds()); }
    if (typeof v === 'number' && v > 1 && v < 2958466) { const ms = Math.round((v - 25569) * 864e5 / 1000) * 1000, r = new Date(ms); return mk(r.getUTCFullYear(), r.getUTCMonth(), r.getUTCDate(), r.getUTCHours(), r.getUTCMinutes(), r.getUTCSeconds()); }
    return null;
  }
  const isTotalRow = r => r.some(x => /^\s*(sous[- ]?)?totaux?\b|^\s*total\b|^\s*somme\b|^\s*grand total/i.test(String(x == null ? '' : x)));
  /* Hypothèses de virgule perdue : raw / 10^k, les plus proches de la cible (ordre de grandeur attendu). */
  function qtyChoices(raw, target, n) {
    const L = []; for (let k = -3; k <= 22; k++) { const q = raw / Math.pow(10, k); L.push({ q, e: target > 0 ? Math.abs(Math.log10(q / target)) : k }); }
    return L.sort((a, b) => a.e - b.e).slice(0, n).map(x => +x.q.toPrecision(12));
  }
  /* Ligne jumelle d'un autre fichier du même compte (relevé PDF…) : même crypto, même type, même minute (à un décalage horaire près)
     et quantité égale à l'une des hypothèses de virgule → quantité reprise, confiance élevée. */
  function twinFix(all) {
    let n = 0;
    for (const t of all) {
      if (!t.tab || !(t.qtyRaw && (t.reconPending || t.qtyStatus === 'à reconstruire' || t.qtyStatus === 'suspect')) || t.qtyManual) continue;
      for (const u of all) {
        if (u === t || u.source === t.source || u.qtyRaw || u.asset !== t.asset || u.type !== t.type) continue;
        const d = Math.abs(u.date - t.date); if (d > 14 * 3600e3 || Math.min(d % 900e3, 900e3 - d % 900e3) > 60e3) continue;
        let k = 0; for (; k <= 25; k++) { const q = t.qtyRaw / Math.pow(10, k - 3); if (Math.abs(q - u.qty) <= 1e-9 * Math.max(1, u.qty)) break; }
        if (k > 25) continue;
        t.qty = u.qty; t.qtyStatus = 'reconstruite (relevé jumeau)'; delete t.reconPending; if (!t.eur && u.eur) t.eur = u.eur;
        t.recon = (t.recon || []).filter(r => r.field !== 'quantité').concat({ field: 'quantité', raw: String(t.qtyRaw), val: u.qty, method: 'ligne jumelle « ' + (u.source || 'autre fichier') + ' »', conf: 'élevée' }); n++; break;
      }
    }
    return n;
  }
  /* Quantités à virgule perdue sans Valeur/Prix : cours historique × montant, sinon opérations similaires (même crypto, même type,
     quantité sûre), sinon hypothèses vraisemblables (valeur entre 0,001 € et 5 000 €) → « à confirmer » par l'utilisateur. */
  function resolveRecon(txs, rec, price) {
    twinFix(txs);
    const sure = t => !t.qtyRaw || ['corrigée', 'reconstruite (relevé jumeau)'].includes(t.qtyStatus) || t.qtyManual;
    for (const t of rec) {
      if (t.qtyStatus === 'reconstruite (relevé jumeau)' || t.qtyManual) continue;
      const p = price(t.asset, t.date), raw = t.qtyRaw, put = (q, method, conf) => { t.qty = q; t.qtyStatus = 'reconstruite'; delete t.reconPending; t.recon = (t.recon || []).filter(r => r.field !== 'quantité').concat({ field: 'quantité', raw: String(raw), val: q, method, conf }); };
      if (p && t.eur > 0) { const q = E.scaleToValue(raw, p, t.eur), e = Math.abs(Math.log10(q * p / t.eur)); if (e < 0.3) { put(q, 'montant ÷ cours historique', e < 0.1 ? 'moyenne' : 'faible'); if (e >= 0.1) t.reconPending = { field: 'quantité', choices: qtyChoices(raw, t.eur / p, 3) }; continue; } }
      const sib = txs.filter(u => u !== t && u.asset === t.asset && u.type === t.type && sure(u) && u.qty > 0).map(u => u.qty).sort((a, b) => a - b);
      if (sib.length) { const m = sib[sib.length >> 1], q = qtyChoices(raw, m, 1)[0], e = Math.abs(Math.log10(q / m)); if (e < 0.5) { put(q, 'opérations similaires (' + sib.length + ')', 'moyenne'); continue; } }
      // décimales du fichier (lignes sûres) : hypothèse de tête = même nombre de décimales que la ligne la plus longue du groupe (zéros finaux perdus)
      const dec = q => { const s = String(+(+q).toPrecision(12)); return s.includes('.') ? s.split('.')[1].length : 0; };
      const D = Math.min(8, Math.max(0, ...txs.filter(u => u.source === t.source && u.qtyRaw && sure(u)).map(u => dec(u.qty)))) || 8;
      const grp = rec.filter(u => u.asset === t.asset && u.type === t.type && u.source === t.source), ref = Math.max(...grp.map(u => u.qtyRaw)), head = qtyChoices(raw, ref / Math.pow(10, D), 1)[0];
      let ch = qtyChoices(raw, 1, 26); if (p) ch = ch.filter(q => q * p >= 0.001 && q * p <= 5000).sort((a, b) => Math.abs(Math.log10(a * p)) - Math.abs(Math.log10(b * p)));
      const h0 = t.int0 ? raw : head; /* prix arrondi à 0 : l'entier lu est l'hypothèse de tête */ ch = [h0].concat(ch.filter(q => q !== h0)).slice(0, 4); t.qty = ch[0] != null ? ch[0] : raw; t.qtyStatus = 'à confirmer';
      t.reconPending = { field: 'quantité', method: p ? 'hypothèses de virgule (cours historique)' : 'hypothèses de virgule (aucun cours)', choices: ch, price: p || undefined };
    }
  }
  /* Liste des valeurs reconstruites / à confirmer (affichage des contrôles et note du PDF). */
  function reconList(txs) {
    const L = []; for (const t of txs) for (const r of (t.recon || [])) L.push(Object.assign({ id: t.id, line: t.line, source: t.source, asset: t.asset, date: t.date, pending: !!t.reconPending }, r));
    for (const t of txs) if (t.reconPending && !(t.recon || []).length) L.push({ id: t.id, line: t.line, source: t.source, asset: t.asset, date: t.date, field: t.reconPending.field, raw: String(t.qtyRaw != null ? t.qtyRaw : ''), val: t.qty, method: t.reconPending.method || 'hypothèses de virgule', conf: 'faible', pending: true });
    return L;
  }
  /* rows : tableaux (valeurs brutes, nombres conservés). mp : index des colonnes. o.strict : fichier CSV/Excel (refus plutôt que deviner). */
  function importRows(rows, mp, o, uid) {
    const out = [], bad = [], why = [], strict = !!o.strict, col = f => mp[f] == null ? [] : rows.map(r => r[mp[f]]);
    const nm = {}, fatal = [];
    for (const f of ['qty', 'eur', 'price', 'fee']) { const k = o.nmode || numMode(col(f)); if (k === 'X') fatal.push('colonne « ' + (o.head ? o.head[mp[f]] : f) + ' » : nombres écrits de deux façons (1 234,56 et 1,234.56)'); nm[f] = k === 'X' ? '' : k; }
    if (strict && !o.nmode) { const all = Object.values(nm).filter(Boolean); const one = all.length && all.every(x => x === all[0]) ? all[0] : ''; for (const f in nm) if (!nm[f]) nm[f] = one; }
    let dmode = o.dmode; if (!dmode) { const k = dateMode(col('date')); if (k === 'X') fatal.push('colonne de dates : jour/mois et mois/jour mélangés'); else dmode = k || undefined; }
    if (strict && mp.type == null) {
      const q = col('qty').map(v => E.parseNum(v, nm.qty)); if (!(q.some(x => x < 0) && q.some(x => x > 0))) fatal.push('colonne Type (achat/vente) manquante : impossible de distinguer achats et ventes');
    }
    if (fatal.length) return { txs: [], bad: [], why: [], fatal: fatal.join(' ; ') };
    rows.forEach((r, i) => {
      const g = f => { const v = mp[f] == null ? '' : r[mp[f]]; return typeof v === 'string' && /^\s*#{3,}\s*$/.test(v) ? '' : v; }; // ##### : colonne trop étroite, valeur absente
      if (strict && (!r.some(x => String(x == null ? '' : x).trim() !== '') || (isTotalRow(r) && !(g('date') instanceof Date) && !isFinite(E.parseDate(g('date'), dmode, o.tz))))) return; // lignes vides / totaux
      const cd = cellDate(g('date'), o.tz), date = cd != null ? cd : E.parseDate(g('date'), dmode, o.tz);
      const asset = String(E.fixText(g('asset')) || '').trim().toUpperCase();
      if (!isFinite(date)) { bad.push(i); why.push('date illisible'); return; }
      if (!asset) { bad.push(i); why.push('crypto manquante'); return; }
      const rawQ = g('qty'), vRaw = g('eur'), pRaw = g('price'), fRaw = g('fee');
      const curTxt = E.fixText(String(vRaw || pRaw || fRaw || '')), cur = /[$£€]|USD|GBP|EUR/.test(curTxt) ? E.currencyOf(curTxt) : (o.cur || 'EUR');
      const val = Math.abs(E.parseNum(vRaw, nm.eur || o.nmode)), price = Math.abs(E.parseNum(pRaw, nm.price || o.nmode)), fee = Math.abs(E.parseNum(fRaw, nm.fee || o.nmode)) || 0;
      let type;
      if (strict && mp.type == null) type = E.parseNum(rawQ, nm.qty) < 0 ? 'SELL' : 'BUY';
      else type = E.guessType(g('type'), g('desc'), strict);
      if (E.FIATS.includes(asset)) type = 'IGNORE'; // lignes « Autre » : dépôts / change de devises
      if (!type) { bad.push(i); why.push('type inconnu « ' + String(E.fixText(g('type')) || '').slice(0, 30) + ' »'); return; }
      
      const conf = e => e < 0.05 ? 'élevée' : e < 0.15 ? 'moyenne' : 'faible';
      let qty, qtyStatus = 'ok', qtyRaw; const recon = [], line = i + (o.line0 || 2), blank = x => x == null || String(x).trim() === '';
      let pq = typeof rawQ === 'number' ? rawQ : E.parseNum(rawQ, nm.qty || o.nmode);
      /* virgule perdue : entier (cellule numérique xlsx, ou CSV réenregistré) qui ne colle pas à Valeur / Prix */
      const lost = Number.isInteger(pq) && pq !== 0 && (o.xlsx ? typeof rawQ === 'number' : (strict && Math.abs(pq) >= 1000 && val > 0 && ((price > 0 && Math.abs(Math.log10(Math.abs(pq) * price / val)) > 0.5) || (price === 0 && !blank(pRaw))))); // prix arrondi à 0 : entier invérifiable → cours historique
      if (lost) {
        const f = E.fixQty(pq, price, val); qty = f.qty; qtyStatus = f.status; qtyRaw = Math.abs(pq);
        if (!(price > 0 && val > 0)) qtyStatus = 'à reconstruire';
        else if (qty !== qtyRaw) { const e = Math.abs(Math.log10(qty * price / val)); recon.push({ field: 'quantité', raw: String(rawQ), val: qty, method: 'valeur ÷ prix (virgule perdue)', conf: f.status === 'suspect' ? 'faible' : conf(e) }); }
      } else qty = Math.abs(pq);
      if (!isFinite(qty) && blank(rawQ) && type !== 'IGNORE' && price > 0 && val > 0) { qty = val / price; recon.push({ field: 'quantité', raw: '(vide)', val: qty, method: 'valeur ÷ prix', conf: 'élevée' }); }
      if (!isFinite(qty)) { if (type === 'IGNORE') qty = 0; else { bad.push(i); why.push('quantité illisible'); return; } }
      let eurMissing = false;
      if (strict && (type === 'BUY' || type === 'SELL') && !(isFinite(val) && val > 0) && !(price > 0)) {
        if (!(qty > 0) || !blank(vRaw) || !blank(pRaw)) { bad.push(i); why.push('montant en € manquant pour un achat/une vente'); return; }
        eurMissing = true; // valeur reconstruite au cours historique (prepare), signalée
      }
      let v = isFinite(val) ? val : (price > 0 ? price * qty : 0);
      if (!isFinite(val) && price > 0 && qty > 0 && type !== 'IGNORE' && qtyStatus === 'ok') recon.push({ field: 'montant', raw: '(vide)', val: v, method: 'quantité × prix', conf: 'élevée' });
      if (!(price > 0) && isFinite(val) && val > 0 && qty > 0 && blank(pRaw) && mp.price != null && type !== 'IGNORE') recon.push({ field: 'prix', raw: '(vide)', val: val / qty, method: 'montant ÷ quantité', conf: 'élevée' });
      if (price === 0 && !blank(pRaw) && isFinite(val) && val > 0 && qty > 0 && type !== 'IGNORE' && qtyStatus === 'ok') recon.push({ field: 'prix', raw: String(E.fixText(pRaw)), val: val / qty, method: 'prix arrondi à 0 : montant ÷ quantité', conf: 'élevée' });
      const t = { id: uid(), seq: i, line, date, type, feeInKind: o.feeInKind != null ? !!o.feeInKind : /^relev/i.test(o.platform || ''), rawType: E.fixText(g('type')), asset, qty, platform: o.platform, source: o.source, qtyStatus, qtyRaw, unitPrice: price || (recon.some(r => r.field === 'prix') ? val / qty : undefined) };
      if (strict) { t.tab = 1; if (lost && price === 0) t.int0 = 1; if (recon.length) t.recon = recon; if (eurMissing) t.eurMissing = true; } // reconstructions : CSV/Excel uniquement (le PDF reste inchangé)
      else { delete t.line; t.unitPrice = price || undefined; }
      if (strict && qtyStatus === 'suspect' && price > 0 && val > 0) { t.reconPending = { field: 'quantité', choices: qtyChoices(qtyRaw, val / price, 3) }; }
      const fCur = strict && /[$£€]|USD|GBP|EUR/.test(E.fixText(String(fRaw || ''))) ? E.currencyOf(E.fixText(String(fRaw))) : cur; // frais dans une autre devise que le montant
      if (cur === 'EUR') { t.eur = v || 0; t.fee = fee; if (fCur !== 'EUR' && fee > 0) { t.fee = 0; t.cur = fCur; t.valCur = 0; t.feeCur = fee; t.eurKeep = t.eur; t.fxPending = true; } } else if (fCur === 'EUR' && fCur !== cur) { t.cur = cur; t.valCur = v || 0; t.feeCur = 0; t.feeEur = fee; t.unitPriceCur = price || undefined; t.eur = 0; t.fee = 0; t.unitPrice = undefined; t.fxPending = true; } else { t.cur = cur; t.valCur = v || 0; t.feeCur = fee; t.unitPriceCur = price || undefined; t.eur = 0; t.fee = 0; t.unitPrice = undefined; t.fxPending = true; }
      out.push(t);
    });
    return { txs: out, bad, why };
  }
  /* Résumé court des lignes refusées : « 3 lignes non lues : type inconnu « Staking X » (ligne 5), date illisible (ligne 9)… » (n° de ligne du fichier) */
  function badSummary(res, first) {
    if (!res.bad.length) return '';
    const parts = []; const seen = new Set();
    res.bad.forEach((i, k) => { const w = (res.why && res.why[k]) || 'ligne illisible'; if (!seen.has(w) && parts.length < 3) { seen.add(w); parts.push(w + ' (ligne ' + (i + (first || 2)) + ')'); } });
    return res.bad.length + ' ligne' + (res.bad.length > 1 ? 's' : '') + ' non lue' + (res.bad.length > 1 ? 's' : '') + ' : ' + parts.join(', ') + (seen.size < new Set(res.why).size ? '…' : '') + '.';
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
    const TIMEOUT = opt.timeout || 5000, signal = opt.signal, diag = {};
    const D = s => diag[s] || (diag[s] = { calls: 0, ok: 0, fail: 0, last: '' });
    const stats = { get calls() { return Object.values(diag).reduce((a, d) => a + d.calls, 0); }, get fails() { return Object.values(diag).reduce((a, d) => a + d.fail, 0); } };
    async function fetchT(url) {
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const onAbort = () => ac && ac.abort(); if (signal && signal.addEventListener) signal.addEventListener('abort', onAbort);
      const tm = setTimeout(() => ac && ac.abort(), TIMEOUT); // 5 s maximum par requête, puis source suivante
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
        const GAP = opt.gap != null ? opt.gap : /Binance/.test(srcName) ? 25 : /^(OKX|Bitget)$/.test(srcName) ? 100 : 150, /* limites publiques : Binance 6000 poids/min, OKX 10 req/s, Bitget 20 req/s */ nx = Math.max(Date.now(), (nextAt[srcName] || 0)); nextAt[srcName] = nx + GAP; if (nx > Date.now()) await sleep(nx - Date.now());
        try {
          const r = await fetchT(url);
          if (r.status === 429 || r.status >= 500) { err = 'HTTP ' + r.status; await sleep(1500 * (i + 1)); continue; }
          const j = await r.json().catch(() => null);
          if (r.status >= 400) { d.ok++; return { j: j || {}, status: r.status }; }
          d.ok++; return { j };
        } catch (e) { if (signal && signal.aborted) throw new Error('Annulé'); err = e && e.name === 'AbortError' ? 'délai dépassé (' + TIMEOUT / 1000 + ' s)' : (e && e.message) || 'réseau'; if (i + 1 < tries) await sleep(500); }
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
    /* Liste des paires Binance (un seul appel, ~160 ko, réutilisée 24 h par l'appli) : on ne demande jamais une paire inexistante.
       Sinon Binance répond 400 sans en-tête CORS : erreur console, allers-retours perdus et hôte jugé mort pour tout le calcul. */
    let symP = null;
    function binSyms() {
      if (opt.binSyms) return Promise.resolve(opt.binSyms);
      if (!symP) symP = (async () => {
        for (const h of hosts) {
          try { const r = await fetchT(h + '/api/v3/ticker/price'); if (r.status !== 200) continue; const j = await r.json(); if (Array.isArray(j) && j.length > 50) { const set = new Set(j.map(x => x.symbol)); if (opt.onBinSyms) opt.onBinSyms([...set]); return set; } }
          catch (e) { if (signal && signal.aborted) throw new Error('Annulé'); }
        }
        return null; // liste indisponible : on essaie quand même les paires
      })();
      return symP;
    }
    const binHas = async sym => { const set = await binSyms(); return !set || set.has(sym); };
    async function binanceSeries(sym, from, to) {
      if (!(await binHas(sym))) return null;
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
      if (r.err) return undefined; if (!r.j || [].concat(r.j.error || []).some(e => /Unknown asset pair/i.test(e))) return null;
      const k = r.j.result && Object.keys(r.j.result).find(x => x !== 'last'); if (!k) return undefined;
      const out = {}; for (const c of r.j.result[k]) out[Math.floor(c[0] * 1000 / HOUR)] = +c[1]; return out;
    }
    /* DefiLlama : cours $ à l'heure, 500 points par appel, via l'identifiant CoinGecko (sans clé). */
    async function llamaSeries(a, from, to) {
      const ids = [].concat(geckoIds[a] || []); if (!ids.length) return null;
      for (const id of ids) { const r = await llamaOne(id, from, to); if (r === undefined) return undefined; if (r && Object.keys(r).length) return r; }
      return null;
    }
    async function llamaDaily(a, from, to) { // points journaliers DefiLlama (≤ 500 par appel), pour le contrôle croisé
      const id = [].concat(geckoIds[a] || [])[0]; if (!id) return null; const out = {}; let st = Math.floor(from / 1000) - DAY / 1000;
      while (st <= to / 1000 + DAY / 1000) {
        const r = await get('DefiLlama', `https://coins.llama.fi/chart/coingecko:${id}?start=${st}&span=500&period=1d&searchWidth=1h`);
        if (r.err) return undefined; const c = r.j && r.j.coins && r.j.coins['coingecko:' + id]; if (!c) break;
        for (const p of c.prices || []) out[Math.round(p.timestamp * 1000 / HOUR)] = +p.price;
        st += 500 * DAY / 1000;
      }
      return out;
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
      let llama = null, merged = null, mSrc = '';
      for (const [name, fn, usd] of tries) {
        let s = await fn();
        if (s && Object.keys(s).length) {
          if (name === 'DefiLlama') llama = false;
          if (usd) { s = await toEur(s, from, to); if (!s || !Object.keys(s).length) { log.push(name + ' : conversion $→€ impossible'); net = true; continue; } }
          log.push(name + ' : OK');
          if (known && name !== 'DefiLlama' && opt.check !== false) { // contrôle croisé avec DefiLlama
            if (llama === null) { const l = await llamaDaily(a, from, to); llama = l && Object.keys(l).length ? await toEur(l, from, to) : false; } // contrôle sur points journaliers : 1 appel pour 500 jours
            const g = llama ? gap(s, llama) : null;
            if (g && (g > 1.3 || g < 1 / 1.3)) { log.push('Écart ' + Math.round((g - 1) * 100) + ' % avec DefiLlama : cours DefiLlama retenu, à vérifier'); const lh = await llamaSeries(a, from, to), le = lh && Object.keys(lh).length ? await toEur(lh, from, to) : null; return { s: le && Object.keys(le).length ? le : llama, src: 'DefiLlama', suspect: true }; }
          }
          // série partielle (paire listée après le début de la plage, ou trou) : on garde et on complète avec les sources suivantes
          const h0 = Math.floor(from / HOUR), h1 = Math.floor(Math.min(to, Date.now() - HOUR) / HOUR);
          merged = Object.assign({}, s, merged || {}); if (!mSrc) mSrc = name;
          const mk = Object.keys(merged).map(Number), mlo = Math.min(...mk), mhi = Math.max(...mk);
          if (mlo <= h0 + 2 && mhi >= h1 - 2) return { s: merged, src: mSrc === name ? name : mSrc + ' + ' + name };
          log.push(name + ' : partiel, complété par la source suivante'); continue;
        }
        if (s === undefined) { net = true; log.push(name + ' : ' + (lastErr[name] || 'erreur réseau')); } else log.push(name + ' : paire absente');
      }
      if (merged) return { s: merged, src: mSrc, partial: true };
      return net ? undefined : null;
    }
    /* Cours à la minute (ou à la seconde) : Binance (aggTrades si l'heure a des secondes, sinon bougie 1 min), puis OKX et Bitget 1 min.
       Bougie retenue seulement si elle correspond exactement à la minute demandée. -> { p (€), src, k: 'seconde'|'minute' } | null | undefined */
    const minEur = {}, klMemo = {};
    /* Regroupement sans perte : les minutes proches d'une même paire (≤ 1000 min) en une seule requête de bougies 1 min ; bougie exacte ou rien, comme la requête unitaire. */
    async function rangeFill(sym, L) {
      if (!(await binHas(sym))) return; L = [...new Set(L)].filter(m => !((sym + '|' + m) in klMemo)).sort((x, y) => x - y);
      const groups = []; for (const m of L) { const g = groups[groups.length - 1]; if (g && m - g[0] <= 999 * MIN) g.push(m); else groups.push([m]); }
      await Promise.all(groups.filter(g => g.length > 1).map(async g => {
        const h = hosts.find(x => !deadHost.has(x)); if (!h) return;
        const r = await get(h.includes('vision') ? 'Binance (data-api)' : 'Binance (api)', `${h}/api/v3/klines?symbol=${sym}&interval=1m&startTime=${g[0]}&endTime=${g[g.length - 1]}&limit=1000`);
        if (r.err || !Array.isArray(r.j)) return; const o = {}; for (const c of r.j) o[+c[0]] = +c[1];
        for (const m of g) klMemo[sym + '|' + m] = o[m] != null ? o[m] : null;
      }));
    }
    async function prefetchMinutes(items) {
      const M = ts => Math.floor(ts / MIN) * MIN; await rangeFill('EURUSDT', items.map(n => M(n.ts)));
      const by = {}; for (const n of items) if (n.ts % MIN === 0) (by[baseSym(n.asset)] = by[baseSym(n.asset)] || []).push(M(n.ts)); // à la seconde : aggTrades d'abord, pas de bougies d'avance
      await Promise.all(Object.entries(by).map(async ([a, L]) => { await rangeFill(a + 'EUR', L); await rangeFill(a + 'USDT', L.filter(m => !klMemo[a + 'EUR|' + m])); }));
    }
    async function binMin(sym, m) { // bougie 1 min Binance : ouverture de la minute m (ms) ; null = paire absente / pas de bougie
      if (!(await binHas(sym))) return null;
      const mk = sym + '|' + m; if (mk in klMemo) return klMemo[mk];
      for (const h of hosts) {
        if (deadHost.has(h)) continue;
        const r = await get(h.includes('vision') ? 'Binance (data-api)' : 'Binance (api)', `${h}/api/v3/klines?symbol=${sym}&interval=1m&startTime=${m}&limit=1`);
        if (r.err) continue; if (!Array.isArray(r.j)) return null;
        return r.j[0] && +r.j[0][0] === m ? +r.j[0][1] : null;
      }
      return undefined;
    }
    async function usdtEur(m) { // 1 USDT en € à la minute m (Binance EURUSDT), mutualisé entre actifs
      if (minEur[m] === undefined) minEur[m] = binMin('EURUSDT', m).then(v => v ? 1 / v : null);
      return minEur[m];
    }
    async function minute(a0, ts) {
      const a = baseSym(a0), m = Math.floor(ts / MIN) * MIN, sec = ts % MIN !== 0; let net = false;
      const hasE = await binHas(a + 'EUR'), hasU = await binHas(a + 'USDT');
      if (sec && (hasU || hasE)) { // à la seconde : une seule requête, sur la paire la plus liquide (USDT, sinon EUR)
        const q = hasU ? 'USDT' : 'EUR', h = hosts.find(x => !deadHost.has(x));
        if (h) {
          const r = await get(h.includes('vision') ? 'Binance (data-api)' : 'Binance (api)', `${h}/api/v3/aggTrades?symbol=${a}${q}&startTime=${ts}&endTime=${ts + 999}&limit=1`);
          if (r.err) net = true; else if (Array.isArray(r.j) && r.j[0]) { const f = q === 'USDT' ? await usdtEur(m) : 1; if (f) return { p: +r.j[0].p * f, src: 'Binance', k: 'seconde' }; }
        }
      }
      for (const [q, usd, has] of [['EUR', false, hasE], ['USDT', true, hasU]]) { // sinon bougie de la minute
        if (!has) continue;
        const p = await binMin(a + q, m);
        if (p === undefined) { net = true; continue; }
        if (p) { const f = usd ? await usdtEur(m) : 1; if (f) return { p: p * f, src: 'Binance', k: 'minute' }; }
      }
      const r1 = await get('OKX', `https://www.okx.com/api/v5/market/history-candles?instId=${a}-USDT&bar=1m&limit=1&after=${m + MIN}`);
      if (r1.err) net = true; else { const c = r1.j && Array.isArray(r1.j.data) && r1.j.data[0]; if (c && +c[0] === m) { const f = await usdtEur(m); if (f) return { p: +c[1] * f, src: 'OKX', k: 'minute' }; } }
      const r2 = await get('Bitget', `https://api.bitget.com/api/v2/spot/market/history-candles?symbol=${a}USDT&granularity=1min&endTime=${m + MIN}&limit=2`);
      if (r2.err) net = true; else { const c = r2.j && Array.isArray(r2.j.data) && r2.j.data.find(x => +x[0] === m); if (c && +c[5] > 0) { const f = await usdtEur(m); if (f) return { p: +c[1] * f, src: 'Bitget', k: 'minute' }; } }
      return net ? undefined : null;
    }
    /* Crypto identifiée : présente dans la table d'identifiants ou cotée sur Binance (liste des paires). Sinon : aucun appel. */
    async function known(a0) {
      const a = baseSym(a0); if (geckoIds[a] != null && geckoIds[a] !== '') return true;
      const set = await binSyms(); return !set || set.has(a + 'EUR') || set.has(a + 'USDT');
    }
    async function checkPts(a0, pts) { // rapport médian cours minute / DefiLlama journalier (point le plus proche, ±24 h)
      const a = baseSym(a0); if (!geckoIds[a] || !pts.length) return null;
      const ts = pts.map(p => p.ts), lo = Math.min(...ts), hi = Math.max(...ts), l = await llamaDaily(a, lo, hi); if (!l || !Object.keys(l).length) return null;
      const le = await toEur(l, lo, hi); if (!le) return null; const ks = Object.keys(le).map(Number), r = [];
      for (const p of pts) { const h = p.ts / HOUR; let b = null; for (const k of ks) if (Math.abs(k - h) <= 24 && (b == null || Math.abs(k - h) < Math.abs(b - h))) b = k; if (b != null && le[b] > 0) r.push(p.p / le[b]); }
      r.sort((u, v) => u - v); return r.length ? r[r.length >> 1] : null;
    }
    return { fxRange, series, minute, prefetchMinutes, known, checkPts, diag, stats, assetDiag };
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
    const obs = observed(txs), approx = new Set(), unvalued = new Set(), prec = new Map();
    const fn = (a, ts, txId) => {
      if (manual && txId != null && manual[a + '@' + txId] != null) return manual[a + '@' + txId];
      if (manual && manual[a] != null) return manual[a];
      const h = Math.floor(ts / HOUR), mk = minKey(a, ts);
      if (typeof cache[mk] === 'number') { const [k, s] = String(cache[mk + 's'] || 'minute|').split('|'); prec.set(a + '|' + ts, { k, src: s }); return cache[mk]; }
      for (const d of [0, -1, 1, -2, 2]) { const v = cache[a + '|h' + (h + d)]; if (typeof v === 'number') { prec.set(a + '|' + ts, { k: hasTime(ts) ? 'horaire' : 'journalier', src: cache[a + '|src'] || '' }); return v; } }
      let o = obs(a, ts);
      if (o == null) { // cours du même actif le plus proche dans le cache (autre heure)
        let best = null, bd = Infinity; const pre = a + '|h';
        for (const k in cache) if (k.startsWith(pre) && typeof cache[k] === 'number') { const dd = Math.abs(+k.slice(pre.length) - h); if (dd < bd) { bd = dd; best = cache[k]; } }
        const pm = a + '|m'; for (const k in cache) if (k.startsWith(pm) && typeof cache[k] === 'number') { const dd = Math.abs(+k.slice(pm.length) * MIN / HOUR - h); if (dd < bd) { bd = dd; best = cache[k]; } } // cours à la minute aussi
        o = best;
      }
      if (o == null) o = obs(a, ts, true);
      if (o != null) { approx.add(a + '|' + ts); return o; }
      if (opts && opts.zeroIfUnknown) { unvalued.add(a); approx.add(a + '|' + ts); return 0; } // jamais de calcul bloqué : actif non valorisé, signalé
      return null;
    };
    fn.approx = approx; fn.unvalued = unvalued; fn.prec = prec; return fn;
  }
  /* progress(étape, fait, total) ; opt.signal pour annuler ; opt.onSave() appelé régulièrement (cache persistant). */
  async function prepare(txs, src, cache, log, opt) {
    log = log || (() => {}); opt = opt || {}; const signal = opt.signal, save = opt.onSave || (() => {});
    // opt.onUnit(phase, fait, total) : progression réelle unifiée (« lecture » puis « cours », le total des cours grandit au fil des sous-étapes)
    const unit = opt.onUnit || (() => {}); let uL = 0, uLT = 0, uC = 0, uCT = 0;
    // 1. devises : un appel par devise pour toute la période
    const pending = txs.filter(t => t.fxPending), curs = [...new Set(pending.map(t => t.cur))];
    let k = 0; uLT = curs.length; unit('lecture', 0, uLT);
    for (const cur of curs) {
      log('Taux de change ' + cur, k, curs.length);
      const ts = pending.filter(t => t.cur === cur).map(t => t.date), m = await src.fxRange(cur, Math.min(...ts), Math.max(...ts));
      const days = Object.keys(m).sort();
      for (const t of pending.filter(t => t.cur === cur)) {
        const d = new Date(t.date).toISOString().slice(0, 10); let r = m[d];
        if (!r) { const prev = days.filter(x => x <= d).pop(); r = m[prev] || m[days[0]]; } // jour ouvré précédent
        if (r) { t.fx = r; t.eur = t.valCur * r + (t.eurKeep || 0); t.fee = t.feeCur * r + (t.feeEur || 0); if (t.unitPriceCur) t.unitPrice = t.unitPriceCur * r; delete t.fxPending; if (t.qtyStatus === 'suspect' || t.qtyStatus === 'corrigée') { const f = E.fixQty(t.qtyRaw, t.unitPrice, t.eur); t.qty = f.qty; t.qtyStatus = f.status; } }
      }
      log('Taux de change ' + cur, ++k, curs.length); unit('lecture', ++uL, uLT);
    }
    // 2. cours : uniquement les cryptos identifiées des imports, aux dates utiles à l'année choisie
    //    (valeur globale du portefeuille à chaque cession jusqu'à opt.until, toutes les cryptos détenues à ce moment ; quantités tronquées à reconstruire)
    const until = opt.until || Infinity, unknown = new Set(), idc = {};
    const known = async a => idc[a] != null ? idc[a] : (idc[a] = src.known ? await src.known(a) : true);
    const rec = txs.filter(t => t.qtyStatus === 'à reconstruire' && t.qtyRaw && !t.qtyManual);
    const base = [], cand = E.neededPrices(txs).filter(n => n.ts < until).concat(rec.map(t => ({ asset: t.asset, ts: t.date, rec: 1 })));
    uLT = uL + cand.length; unit('lecture', uL, uLT);
    for (const n of cand) { if (await known(n.asset)) base.push(n); else unknown.add(n.asset); unit('lecture', ++uL, uLT); }
    unit('lecture', uLT, uLT);
    // 2 a. à la minute (ou à la seconde) d'abord quand le relevé donne l'heure
    if (src.minute && opt.minute !== false) {
      const seen = new Set(), todo = base.filter(n => !n.rec && hasTime(n.ts)).map(n => ({ asset: n.asset, ts: n.ts, k: minKey(n.asset, n.ts) }))
        .filter(n => typeof cache[n.k] !== 'number' && cache[n.k + 'x'] == null && !seen.has(n.k) && seen.add(n.k)).slice(0, opt.maxMinute != null ? opt.maxMinute : 400);
      let dm = 0; const got = {}; uCT += todo.length + (src.prefetchMinutes && todo.length > 1 ? 1 : 0); unit('cours', uC, uCT);
      if (src.prefetchMinutes && todo.length > 1) { await src.prefetchMinutes(todo); unit('cours', ++uC, uCT); }
      await pool(todo, opt.minuteConcurrency || 8, async n => {
        const r = await src.minute(n.asset, n.ts);
        if (r) { cache[n.k] = r.p; cache[n.k + 's'] = r.k + '|' + r.src; (got[n.asset] = got[n.asset] || []).push({ ts: n.ts, p: r.p, k: n.k }); } else if (r === null) cache[n.k + 'x'] = 1; // undefined (réseau) : réessayé au prochain calcul
        log('Cours à la minute', ++dm, todo.length); unit('cours', ++uC, uCT); if (dm % 20 === 0) save();
      }, signal);
      // contrôle croisé des cours minute avec DefiLlama (points journaliers, 1 appel / actif) : écart > 30 % -> minute écartée, cours horaire contrôlé
      if (src.checkPts && opt.check !== false) { uCT += Object.keys(got).length; unit('cours', uC, uCT); }
      if (src.checkPts && opt.check !== false) await pool(Object.keys(got), 2, async a => {
        const g = await src.checkPts(a, got[a]); unit('cours', ++uC, uCT);
        if (g && (g > 1.3 || g < 1 / 1.3)) { for (const x of got[a]) { delete cache[x.k]; delete cache[x.k + 's']; cache[x.k + 'x'] = 1; } }
      }, signal);
    }
    // 2 b. cours horaire seulement pour ce qui n'a pas de cours à la minute (date seule, paire sans bougie minute, quantités à reconstruire)
    const need = base.filter(n => (n.rec || typeof cache[minKey(n.asset, n.ts)] !== 'number') && typeof cache[n.asset + '|h' + Math.floor(n.ts / HOUR)] !== 'number' && cache[n.asset + '|none'] == null);
    const by = {}; for (const n of need) (by[n.asset] = by[n.asset] || []).push(n.ts);
    const assets = Object.keys(by), failed = []; let done = 0; uCT += assets.length; unit('cours', uC, uCT);
    await pool(assets, opt.concurrency || 4, async a => {
      const ts = by[a], r = await src.series(a, Math.min(...ts), Math.max(...ts));
      if (r === null) cache[a + '|none'] = 1; // aucune source ne connaît ce jeton
      else if (r === undefined) failed.push(a); // erreur réseau : rien n'est mis en cache, on réessaiera
      else { cache[a + '|src'] = r.src; if (r.suspect) cache[a + '|suspect'] = 1; else delete cache[a + '|suspect']; for (const t of ts) { const h = Math.floor(t / HOUR); for (const d of [0, -1, 1, -2, 2]) if (r.s[h + d] != null) { cache[a + '|h' + h] = r.s[h + d]; break; } } }
      log('Cours', ++done, assets.length); unit('cours', ++uC, uCT); save();
    }, signal);
    // 3. quantités tronquées (xlsx)
    const fn = priceLookup(txs, cache, opt.manual, { zeroIfUnknown: true }), obs0 = observed(txs);
    resolveRecon(txs, rec, (a, ts) => fn(a, ts) || obs0(a, ts));
    for (const t of txs) if (t.tab && t.eurMissing && !t.eurDone) { const p = fn(t.asset, t.date) || obs0(t.asset, t.date); if (p) { t.eur = p * t.qty; t.eurDone = 1; (t.recon = t.recon || []).push({ field: 'montant', raw: '(vide)', val: t.eur, method: 'quantité × cours historique', conf: 'moyenne' }); } else if (!t.reconPending) t.reconPending = { field: 'montant', method: 'aucun cours : saisissez le montant', choices: [] }; }
    save(); unit('cours', uCT, uCT);
    fn.unknown = [...unknown]; fn.failed = failed; fn.fxMissing = txs.filter(t => t.fxPending).length; fn.missing = failed.length; fn.suspect = [...new Set(txs.map(t => t.asset))].filter(x => cache[x + '|suspect']); return fn;
  }
  /* Relevé PDF de l'exchange : lignes de texte -> lignes à 7 colonnes (Symbole, Type, Quantité, Prix, Valeur, Frais, Date)
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
    const to = period ? E.parseDate(period.to + ', 23:59:59', 'DMY', 'Paris') : NaN;
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
    twinFix(old.concat(fresh));
    const names = new Set(fresh.map(t => t.source).filter(Boolean)), kept = old.filter(t => !names.has(t.source)), replaced = old.length - kept.length;
    const seen = new Map(kept.map(t => [txKey(t), t])), add = [], dup = [], drop = new Set();
    for (const t of fresh) { const o = seen.get(txKey(t)); if (!o) add.push(t); else if (o.tab && !t.tab && !drop.has(o)) { drop.add(o); add.push(t); } else dup.push(t); } // relevé PDF maître : remplace la ligne CSV/Excel équivalente
    return { txs: kept.filter(t => !drop.has(t)).concat(add), added: add.length, dup: dup.length + drop.size, replaced };
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
  /* Cryptos qui comptent pour l'alerte ≈ et la relance : cédées dans l'année ou détenues à une cession avec un cours estimé.
     Une crypto reçue seulement en récompense (intérêts, staking, airdrop) sans cours : ignorée (valeur 0 documentée), ni alerte ni relance.
     Une crypto « inexistante » (aucune source) : alerte mais pas de relance. */
  function alertAssets(txs, cessions, fn, cache, manual) {
    manual = manual || {}; cache = cache || {};
    const rewardOnly = a => { const L = txs.filter(t => t.asset === a); return L.length > 0 && L.every(t => ['INTEREST', 'STAKING', 'AIRDROP'].includes(t.type)); };
    const est = new Set(), ign = new Set();
    for (const c of cessions) for (const d of (c.detail212 || [])) if (fn && fn.approx && fn.approx.has(d.asset + '|' + c.date) && manual[d.asset] == null) (rewardOnly(d.asset) ? ign : est).add(d.asset);
    return { est: [...est], ign: [...ign].filter(a => fn.unvalued && fn.unvalued.has(a)), retry: [...est].filter(a => cache[a + '|none'] == null) };
  }
  /* Glisser-déposer : ne garder que les fichiers (texte, liens… ignorés) */
  function hasFileDrag(dt) { return !!dt && Array.from(dt.types || []).indexOf('Files') >= 0; }
  function droppedFiles(dt) {
    if (!dt) return [];
    if (dt.items && dt.items.length) return Array.from(dt.items).filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean);
    return Array.from(dt.files || []);
  }
  const api = { hasFileDrag, droppedFiles, numMode, dateMode, cellDate, badSummary, alertAssets, hasTime, minKey, precLabel, cessionPrec, prepareRetry, holderFromLines, holderFromRows, normName, maskName, checkHolders, mergeImport, fileList, txKey, priceLookup, pool, parsePdfLines, itemsToLines, importRows, twinFix, resolveRecon, reconList, qtyChoices, makeSources, prepare, observed };
  if (typeof module !== 'undefined') module.exports = api; else root.KryptaxPipeline = api;
})(this);
