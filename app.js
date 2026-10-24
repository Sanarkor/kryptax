/* Kryptax — interface. Tout est stocké dans localStorage, rien n'est envoyé. */
(function () {
  'use strict';
  const E = window.KryptaxEngine, KP = window.KryptaxPipeline, $ = s => document.querySelector(s);
  const LS = { tx: 'kryptax.tx', cache: 'kryptax.prices', manual: 'kryptax.manual' };
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  let txs = load(LS.tx, []), cache = load(LS.cache, {}), manual = load(LS.manual, {});
  const save = () => { localStorage.setItem(LS.tx, JSON.stringify(txs)); localStorage.setItem(LS.manual, JSON.stringify(manual)); };
  const saveCache = () => { try { localStorage.setItem(LS.cache, JSON.stringify(cache)); } catch (e) {} };
  const eur = n => (n == null || !isFinite(n)) ? '—' : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const num = n => (n == null || !isFinite(n)) ? '' : (+n).toLocaleString('fr-FR', { maximumFractionDigits: 8 });
  const dt = t => new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const typeOpts = sel => Object.entries(E.TYPES).map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${esc(v)}</option>`).join('');
  $('#addtype').innerHTML = typeOpts('BUY');

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    text = text.replace(/^\ufeff/, '');
    const first = text.split(/\r?\n/)[0];
    const delim = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true; else if (c === delim) { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
      else f += c;
    }
    row.push(f); if (row.some(x => x !== '')) rows.push(row);
    return rows;
  }
  const FIELDS = { date: ['date', 'completed date', 'started date', 'time', 'horodatage'], type: ['type', 'transaction type', 'opération'], asset: ['symbol', 'currency', 'asset', 'coin', 'crypto', 'devise', 'actif'], qty: ['quantity', 'amount', 'quantité', 'montant crypto', 'qty'], price: ['price', 'prix', 'rate', 'cours'], eur: ['value', 'fiat amount (inc. fees)', 'fiat amount', 'valeur', 'total', 'montant €'], fee: ['fees', 'fee', 'frais'], desc: ['description', 'product', 'notes'] };
  const LABELS = { date: 'Date', type: 'Type', asset: 'Crypto', qty: 'Quantité', price: 'Prix unitaire €', eur: 'Valeur / montant €', fee: 'Frais €', desc: 'Description (aide au type)' };
  function guessMap(head) {
    const h = head.map(x => x.trim().toLowerCase()), m = {};
    for (const f in FIELDS) { for (const cand of FIELDS[f]) { const i = h.indexOf(cand); if (i > -1 && !Object.values(m).includes(i)) { m[f] = i; break; } } if (m[f] == null) { const i = h.findIndex((x, j) => FIELDS[f].some(c => x.includes(c)) && !Object.values(m).includes(j)); if (i > -1) m[f] = i; } }
    return m;
  }
  $('#files').addEventListener('change', async e => {
    for (const file of e.target.files) {
      if (/\.xlsx?$/i.test(file.name)) {
        if (!window.XLSX) { alert('Lecteur Excel indisponible.'); continue; }
        const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
        showMapping(file.name, rows, true);
      } else showMapping(file.name, parseCSV(await file.text()), false);
    }
    e.target.value = '';
  });
  function showMapping(name, rows, isXlsx) {
    if (rows.length < 2) return alert(name + ' : fichier vide ?');
    if (rows[0].some(h => /sent amount|received amount|montant envoy|montant re/i.test(h))) return showMapping2(name, rows);
    rows[0] = rows[0].map(x => E.fixText(String(x)));
    const head = rows[0], m = guessMap(head), box = document.createElement('div'); box.className = 'note';
    const sel = f => `<label>${LABELS[f]}<select data-f="${f}"><option value="">—</option>${head.map((h, i) => `<option value="${i}"${m[f] === i ? ' selected' : ''}>${esc(h)}</option>`).join('')}</select></label>`;
    box.innerHTML = `<b>${esc(name)}</b> — ${rows.length - 1} lignes. Vérifiez les colonnes :
      <div class="grid">${Object.keys(FIELDS).map(sel).join('')}
      <label>Format des dates<select data-o="dmode"><option value="">Auto</option><option value="DMY">JJ/MM/AAAA</option><option value="MDY">MM/JJ/AAAA</option></select></label>
      <label>Format des nombres<select data-o="nmode"><option value="">Auto</option><option value="FR">1 234,56</option><option value="EN">1,234.56</option></select></label>
      <label>Plateforme<input data-o="platform" value="Revolut"></label></div>
      ${isXlsx ? '<p class="warn">⚠️ Fichier .xlsx : la colonne Quantité est souvent tronquée (virgule perdue). Kryptax la reconstruit avec Valeur / Prix ou un cours historique, et marque les lignes douteuses. Privilégiez l’export CSV si possible.</p>' : ''}
      <div class="scroll"><table><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>${rows.slice(1, 6).map(r => `<tr>${r.map(c => `<td>${esc(c instanceof Date ? c.toLocaleString('fr-FR') : E.fixText(c))}</td>`).join('')}</tr>`).join('')}</table></div>
      <button class="go">Importer ces lignes</button> <button class="ghost cancel">Annuler</button>`;
    $('#mapping').appendChild(box);
    box.querySelector('.cancel').onclick = () => box.remove();
    box.querySelector('.go').onclick = () => {
      const mp = {}; box.querySelectorAll('[data-f]').forEach(s => { if (s.value !== '') mp[s.dataset.f] = +s.value; });
      const o = {}; box.querySelectorAll('[data-o]').forEach(s => o[s.dataset.o] = s.value);
      if (mp.date == null || mp.asset == null || mp.qty == null) return alert('Il faut au minimum Date, Crypto et Quantité.');
      o.xlsx = isXlsx; o.source = name;
      const res = KP.importRows(rows.slice(1), mp, o, uid); txs = txs.concat(res.txs); const nsw = E.detectSwaps(txs).length; save(); box.remove(); renderTx();
      const sus = res.txs.filter(t => t.qtyStatus !== 'ok').length, usd = res.txs.filter(t => t.fxPending).length;
      return alert(res.txs.length + ' transactions importées' + (res.bad.length ? ', ' + res.bad.length + ' lignes ignorées' : '') + (sus ? '. ' + sus + ' quantités reconstruites ou à vérifier' : '') + (usd ? '. ' + usd + ' lignes en devise étrangère, converties en € au calcul (taux BCE)' : '') + (nsw ? '. ' + nsw + ' échanges crypto→crypto détectés (non imposables, voir le tableau)' : '') + '. Vérifiez les types !');
      let n = 0, bad = 0;
      rows.slice(1).forEach((r, i) => {
        const g = f => mp[f] == null ? '' : r[mp[f]];
        const date = E.parseDate(g('date'), o.dmode), qty = E.parseNum(g('qty'), o.nmode);
        if (!isFinite(date) || !isFinite(qty)) { bad++; return; }
        let val = Math.abs(E.parseNum(g('eur'), o.nmode)); const pr = E.parseNum(g('price'), o.nmode);
        if (!isFinite(val) && isFinite(pr)) val = Math.abs(pr * qty);
        const fee = Math.abs(E.parseNum(g('fee'), o.nmode));
        let type = E.guessType(g('type'), g('desc'));
        txs.push({ id: uid(), seq: i, date, type, rawType: g('type'), asset: String(g('asset')).trim().toUpperCase(), qty: Math.abs(qty), eur: isFinite(val) ? val : 0, fee: isFinite(fee) ? fee : 0, platform: o.platform, source: name });
        n++;
      });
      save(); box.remove(); renderTx(); alert(n + ' transactions importées' + (bad ? ', ' + bad + ' lignes ignorées (date ou quantité illisible)' : '') + '. Vérifiez les types !');
    };
  }


  /* ---------- Export Coinly/Koinly : une ligne = Envoyé + Reçu ---------- */
  const F2 = { date: ['date'], sa: ['sent amount', 'montant envoyé'], sc: ['sent currency', 'devise envoyée'], ra: ['received amount', 'montant reçu'], rc: ['received currency', 'devise reçue'], fa: ['fee amount', 'montant des frais'], fc: ['fee currency', 'devise des frais'], nw: ['net worth amount', 'net value', 'valeur nette', 'net worth'], nc: ['net worth currency', 'devise valeur'], label: ['label', 'tag', 'étiquette', 'type'], desc: ['description'] };
  const L2 = { date: 'Date', sa: 'Montant envoyé', sc: 'Devise envoyée', ra: 'Montant reçu', rc: 'Devise reçue', fa: 'Frais', fc: 'Devise des frais', nw: 'Valeur (€)', nc: 'Devise de la valeur', label: 'Label / type', desc: 'Description' };
  function showMapping2(name, rows) {
    const head = rows[0], h = head.map(x => x.trim().toLowerCase()), m = {};
    for (const f in F2) { const i = h.findIndex(x => F2[f].some(c => x === c || x.startsWith(c))); if (i > -1) m[f] = i; }
    const box = document.createElement('div'); box.className = 'note';
    box.innerHTML = `<b>${esc(name)}</b> — format « Envoyé / Reçu » (export Coinly) — ${rows.length - 1} lignes. Vérifiez les colonnes :
      <div class="grid">${Object.keys(F2).map(f => `<label>${L2[f]}<select data-f="${f}"><option value="">—</option>${head.map((x, i) => `<option value="${i}"${m[f] === i ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label>`).join('')}
      <label>Format des dates<select data-o="dmode"><option value="">Auto</option><option value="DMY">JJ/MM/AAAA</option><option value="MDY">MM/JJ/AAAA</option></select></label>
      <label>Format des nombres<select data-o="nmode"><option value="">Auto</option><option value="FR">1 234,56</option><option value="EN">1,234.56</option></select></label>
      <label>Plateforme<input data-o="platform" value="Coinly"></label>
      <label><span><input type="checkbox" data-o="prices" checked> Réutiliser les valeurs comme cours</span></label></div>
      <div class="scroll"><table><tr>${head.map(x => `<th>${esc(x)}</th>`).join('')}</tr>${rows.slice(1, 6).map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></div>
      <p class="hint">Achat = € envoyés → crypto reçue ; vente = crypto → € ; crypto → crypto = échange (2 lignes). Si vous importez déjà vos relevés Revolut, n'importez pas deux fois les mêmes opérations.</p>
      <button class="go">Importer ces lignes</button> <button class="ghost cancel">Annuler</button>`;
    $('#mapping').appendChild(box);
    box.querySelector('.cancel').onclick = () => box.remove();
    box.querySelector('.go').onclick = () => {
      const mp = {}; box.querySelectorAll('[data-f]').forEach(s => { if (s.value !== '') mp[s.dataset.f] = +s.value; });
      const o = {}; box.querySelectorAll('[data-o]').forEach(s => o[s.dataset.o] = s.type === 'checkbox' ? s.checked : s.value);
      if (mp.date == null || (mp.sa == null && mp.ra == null)) return alert('Il faut au minimum Date et Montant envoyé/reçu.');
      const FI = ['EUR', 'USD', 'GBP', 'CHF'];
      let n = 0, bad = 0, np = 0;
      rows.slice(1).forEach((r, i) => {
        const g = f => mp[f] == null ? '' : String(r[mp[f]] || '').trim();
        const date = E.parseDate(g('date'), o.dmode); if (!isFinite(date)) { bad++; return; }
        const sa = Math.abs(E.parseNum(g('sa'), o.nmode)) || 0, sc = g('sc').toUpperCase(), ra = Math.abs(E.parseNum(g('ra'), o.nmode)) || 0, rc = g('rc').toUpperCase();
        let fee = Math.abs(E.parseNum(g('fa'), o.nmode)) || 0; const fc = g('fc').toUpperCase();
        const nwc = (g('nc') || 'EUR').toUpperCase(); let nw = Math.abs(E.parseNum(g('nw'), o.nmode)); if (nwc !== 'EUR') nw = NaN;
        const lab = g('label') + ' ' + g('desc'), base = { date, platform: o.platform, source: name, rawType: g('label') || undefined, fee: 0 };
        const sF = sa && FI.includes(sc), rF = ra && FI.includes(rc), sC = sa && sc && !sF, rC = ra && rc && !rF;
        let feeEur = fc === 'EUR' ? fee : 0, feeQty = 0;
        const push = t => { txs.push(Object.assign({ id: uid(), seq: i * 2 + (t.seq || 0) }, base, t)); n++; };
        if (sF && rC) { if (fc === rc) feeQty = fee; push({ type: 'BUY', asset: rc, qty: ra, eur: sc === 'EUR' ? sa : (nw || 0), fee: feeEur, feeQty }); }
        else if (sC && rF) { push({ type: /pay|achat|purchase/i.test(lab) ? 'PAY' : 'SELL', asset: sc, qty: sa, eur: rc === 'EUR' ? ra : (nw || 0), fee: feeEur }); }
        else if (sC && rC) { push({ type: 'EXCH_OUT', asset: sc, qty: sa, eur: nw || 0 }); push({ type: 'EXCH_IN', asset: rc, qty: ra, eur: nw || 0, seq: 1 }); }
        else if (rC) push({ type: E.guessType(g('label') || 'receive', g('desc')), asset: rc, qty: ra, eur: nw || 0 });
        else if (sC) { let ty = E.guessType(g('label') || 'send', g('desc')); if (ty === 'SELL' || ty === 'BUY') ty = 'PAY'; push({ type: ty, asset: sc, qty: sa, eur: nw || 0, fee: feeEur }); }
        else { bad++; return; }
        if (o.prices && nw > 0) {
          const c = rC ? [rc, ra] : sC ? [sc, sa] : null;
          if (c && c[1] > 0) { cache[key(c[0], date)] = nw / c[1]; np++; }
        }
      });
      saveCache(); save(); box.remove(); renderTx();
      alert(n + ' transactions importées, ' + np + ' cours repris de Coinly' + (bad ? ', ' + bad + ' lignes ignorées' : '') + '. Vérifiez les types !');
    };
  }

  /* ---------- Saisie manuelle ---------- */
  $('#addform').addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(e.target);
    txs.push({ id: uid(), date: new Date(f.get('date')).getTime(), type: f.get('type'), asset: f.get('asset').trim().toUpperCase(), qty: Math.abs(E.parseNum(f.get('qty'))), eur: Math.abs(E.parseNum(f.get('eur'))) || 0, fee: Math.abs(E.parseNum(f.get('fee'))) || 0, platform: f.get('platform') || 'manuel', source: 'saisie' });
    save(); renderTx(); e.target.reset();
  });

  /* ---------- Tableau des transactions ---------- */
  function renderSwaps() {
    const el = $('#swaps'); if (!el) return;
    const byId = {}; txs.forEach(t => byId[t.id] = t);
    const outs = E.sortTx(txs).filter(t => (t.swapAuto && t.type === 'EXCH_OUT') || t.swapForce === 'taxable' && t.rawSwap === 'out');
    const chk = `<details><summary class="hint">Contre-vérifier avec le relevé en euros (optionnel)</summary><p class="hint">Collez les lignes du relevé de compte EUR/USD (« Transfer from Revolut Digital Assets… – Vente de GRASS », avec date et heure). Une vente vers des euros y apparaît ; un échange crypto→crypto non.</p><textarea id="fiattxt" rows="5" style="width:100%"></textarea><button class="small" id="fiatgo">Vérifier</button><div id="fiatres"></div></details>`;
    if (!outs.length) { el.innerHTML = txs.length ? chk : ''; return; }
    el.innerHTML = chk + `<h3>Échanges crypto→crypto détectés (${outs.filter(t => t.swapAuto).length})</h3>
      <p class="hint">Une vente et un achat d’une autre crypto à la même seconde (≤ 5 s), pour une valeur proche (±8 %), sont un échange crypto→crypto : non imposable. Une vente vers des euros n’a pas d’achat simultané. Si une ligne est fausse, forcez-la.</p>
      <div class="scroll"><table><tr><th>Date</th><th>Vendu</th><th>Reçu</th><th class="n">Valeur</th><th>Traitement</th></tr>${outs.map(t => { const b = byId[t.swapWith || t.rawSwapWith]; return `<tr data-sw="${t.id}"><td>${dt(t.date)}</td><td>${num(t.qty)} ${esc(t.asset)}</td><td>${b ? num(b.qty) + ' ' + esc(b.asset) : '—'}</td><td class="n">${eur(t.eur || 0)}</td><td>${t.swapAuto ? 'Échange (non imposable) <button class="small ghost" data-force>Forcer imposable</button>' : 'Vente imposable (forcée) <button class="small ghost" data-unforce>Rétablir échange</button>'}</td></tr>`; }).join('')}</table></div>`;
  }
  $('#swaps') && $('#swaps').addEventListener('click', e => {
    if (e.target.id === 'fiatgo') {
      const f = E.parseFiatSales($('#fiattxt').value), r = E.crossCheck(txs, f), L = (a, m) => a.length ? `<li>${m} (${a.length}) : ${a.map(x => esc((x.t ? x.t.asset + ' ' + dt(x.t.date) : x.asset + ' ' + dt(x.date)))).join(', ')}</li>` : '';
      $('#fiatres').innerHTML = `<p>${f.length} lignes « Vente de » lues. ${r.confirmed.length} ventes confirmées imposables.</p><ul>${L(r.swapButFiat, '⚠️ Détectées comme échange mais présentes dans le relevé € (à forcer imposable ?)')}${L(r.sellNoFiat, '⚠️ Ventes imposables absentes du relevé € (échange ?)')}${L(r.fiatNoSell, 'Lignes du relevé € sans vente correspondante')}</ul>`;
      save(); return;
    }
    const tr = e.target.closest('tr[data-sw]'); if (!tr) return; const t = txs.find(x => x.id === tr.dataset.sw); if (!t) return;
    const b = txs.find(x => x.id === (t.swapWith || t.rawSwapWith));
    if (e.target.hasAttribute('data-force')) { t.rawSwap = 'out'; t.rawSwapWith = t.swapWith; [t, b].forEach(x => { if (x) x.swapForce = 'taxable'; }); }
    else if (e.target.hasAttribute('data-unforce')) { [t, b].forEach(x => { if (x) delete x.swapForce; }); }
    else return;
    E.detectSwaps(txs); save(); renderTx();
  });
  function renderTx() {
    renderSwaps();
    const s = E.sortTx(txs); $('#txcount').textContent = s.length ? '(' + s.length + ')' : '';
    $('#txtable').innerHTML = s.length ? `<tr><th>Date</th><th>Type</th><th>Crypto</th><th class="n">Quantité</th><th class="n">Montant €</th><th class="n">Frais €</th><th>Plateforme</th><th></th></tr>` + s.map(t => `<tr data-id="${t.id}" class="${E.CHECK.includes(t.type) ? 'chk' : ''}">
      <td>${dt(t.date)}${t.example ? ' <span class="tag">exemple</span>' : ''}</td><td><select data-k="type">${typeOpts(t.type)}</select>${t.rawType ? `<br><span class="hint">${esc(t.rawType)}</span>` : ''}</td>
      <td><input data-k="asset" value="${esc(t.asset)}" size="6"></td><td class="n${t.qtyStatus && !['ok', 'corrigée'].includes(t.qtyStatus) && !t.qtyManual ? ' bad' : ''}"><input data-k="qty" value="${num(t.qty)}" size="10">${t.qtyStatus && t.qtyStatus !== 'ok' && !t.qtyManual ? `<br><span class="hint">qté ${esc(t.qtyStatus)}</span>` : ''}</td>
      <td class="n"><input data-k="eur" value="${num(t.eur)}" size="9">${t.cur ? `<br><span class="hint">${num(t.valCur)} ${t.cur}${t.fx ? ' × ' + num(t.fx) : ' (à convertir)'}</span>` : ''}</td><td class="n"><input data-k="fee" value="${num(t.fee)}" size="6"></td>
      <td>${esc(t.platform || '')}</td><td><button class="small danger" data-del>✕</button></td></tr>`).join('') : '<tr><td>Aucune transaction. Importez un CSV ou chargez l’exemple.</td></tr>';
  }
  $('#txtable').addEventListener('change', e => {
    const tr = e.target.closest('tr'), t = txs.find(x => x.id === tr.dataset.id), k = e.target.dataset.k; if (!t || !k) return;
    t[k] = k === 'type' ? e.target.value : k === 'asset' ? e.target.value.trim().toUpperCase() : Math.abs(E.parseNum(e.target.value)) || 0;
    if (k === 'qty') t.qtyManual = true; if (k === 'type') { t.typeManual = true; delete t.swapAuto; } if (k === 'eur' && t.cur) delete t.fxPending;
    if (k === 'type') E.detectSwaps(txs);
    save(); if (k === 'type' || k === 'qty') renderTx();
  });
  $('#txtable').addEventListener('click', e => { if (!e.target.hasAttribute('data-del')) return; txs = txs.filter(x => x.id !== e.target.closest('tr').dataset.id); save(); renderTx(); });
  $('#clear').onclick = () => { if (confirm('Effacer toutes les transactions et saisies de ce navigateur ?')) { txs = []; manual = {}; save(); renderTx(); $('#results').innerHTML = ''; } };

  /* ---------- Cours historiques ---------- */
  const HOUR = 3600e3;
  let livePrice = null;
  function priceFn(a, ts, txId) {
    if (manual[a + '@' + txId] != null) return manual[a + '@' + txId];
    if (livePrice) return livePrice(a, ts);
    const v = cache[a + '|' + Math.floor(ts / HOUR)]; return (v == null || v === 'NA') ? null : v;
  }
  $('#run').onclick = async () => {
    $('#run').disabled = true;
    try {
      const src = KP.makeSources((u) => fetch(u), { ccKey: localStorage.getItem('kryptax.cckey') || '', fxCache: load('kryptax.fx', {}) });
      livePrice = await KP.prepare(txs, src, cache, m => $('#progress').textContent = m);
      saveCache(); localStorage.setItem('kryptax.fx', JSON.stringify(src.fxCache)); save(); renderTx();
      $('#progress').textContent = 'Calcul terminé.';
    } catch (e) { $('#progress').textContent = 'Erreur : ' + e.message; }
    $('#run').disabled = false; renderResults();
  };
  $('#cckey').value = localStorage.getItem('kryptax.cckey') || '';
  $('#cckey').onchange = e => localStorage.setItem('kryptax.cckey', e.target.value.trim());

  /* ---------- Résultats 2086 ---------- */
  const ROWS = [
    ['211', 'Date de la cession', c => dt(c.l211), ''],
    ['212', 'Valeur globale du portefeuille au moment de la cession', c => eur(c.l212), 'Σ quantités détenues × cours, tous portefeuilles'],
    ['213', 'Prix de cession', c => eur(c.l213), ''], ['214', 'Frais de cession', c => eur(c.l214), ''],
    ['215', 'Prix de cession net des frais', c => eur(c.l215), '213 − 214'], ['216', 'Soulte reçue ou versée', c => eur(c.l216), ''],
    ['217', 'Prix de cession net des soultes', c => eur(c.l217), '213 − 216'], ['218', 'Prix de cession net des frais et soultes', c => eur(c.l218), '213 − 214 − 216'],
    ['220', 'Prix total d’acquisition', c => eur(c.l220), 'Σ achats en € (frais inclus) depuis le début'],
    ['221', 'Fractions de capital initial', c => eur(c.l221), 'Σ des [223 × 217 / 212] des cessions antérieures'],
    ['222', 'Soultes reçues lors d’échanges antérieurs', c => eur(c.l222), ''], ['223', 'Prix total d’acquisition net', c => eur(c.l223), '220 − 221 − 222'],
    ['224', 'Plus-value ou moins-value', c => c.l224 == null ? '<b class="warn">à renseigner</b>' : '<b>' + (c.l224 >= 0 ? '+' : '') + eur(c.l224) + '</b>', '218 − [223 × (217 / 212)]']
  ];
  function renderResults() {
    const out = computeWithPrices(); const Y = E.byYear(out);
    let h = '<h2>4. Résultats</h2>';
    if (!out.cessions.length) h += '<p>Aucune cession imposable (vente contre € ou paiement en crypto).</p>';
    for (const y of Object.values(Y).sort((a, b) => b.year - a.year)) {
      h += `<h3>Année ${y.year} — déclaration ${y.year + 1}</h3><div class="scroll"><table class="form"><tr><th>Ligne</th><th></th>${y.cessions.map((c, i) => `<th class="n">Cession ${i + 1}<br><span class="hint">${num(c.qty)} ${esc(c.asset)}</span></th>`).join('')}<th>Formule</th></tr>`;
      for (const [l, lab, f, fo] of ROWS) h += `<tr><td>${l}</td><td>${lab}</td>${y.cessions.map(c => `<td class="n${c.status !== 'ok' && (l === '212' || l === '224') ? ' bad' : ''}">${f(c)}</td>`).join('')}<td class="formula">${fo}</td></tr>`;
      h += '</table></div>';
      for (const c of y.cessions.filter(c => c.status !== 'ok')) {
        if (!c.missing.length) { h += `<div class="note warn">Cession du ${dt(c.date)} : calcul suspendu, une cession antérieure est incomplète (la ligne 221 en dépend).</div>`; continue; }
        h += `<div class="note warn">Cession du ${dt(c.date)} : cours introuvable pour ${c.missing.map(esc).join(', ')}. Renseignez le cours unitaire en € à ce moment : ${c.missing.map(a => `<label>${esc(a)} <input size="8" data-man="${esc(a)}@${c.tx.id}"></label>`).join(' ')} (0 si valeur négligeable) ou la valeur globale (ligne 212) : <input size="10" data-o212="${c.tx.id}"></div>`;
      }
      const ap = (a, c) => livePrice && livePrice.approx && livePrice.approx.has(a + '|' + c.date) ? '≈' : '';
      h += `<details><summary class="hint">Détail de la ligne 212 (≈ = cours tiré de vos relevés à ±30 jours, à vérifier)</summary><p class="hint">${y.cessions.map((c, i) => 'C' + (i + 1) + ' = ' + c.detail212.map(d => d.qty != null ? `${num(d.qty)} ${esc(d.asset)} × ${ap(d.asset, c)}${eur(d.price)}` : esc(d.asset)).join(' + ')).join(' ;<br>')}</p></details>`;
      h += `<p>Ligne 51 — total des prix de cession (218) : <b>${eur(y.total218)}</b>${y.exonere ? ' → <b>≤ 305 € : cessions exonérées</b>, pas d’autres lignes à remplir.' : ''}</p>`;
      h += `<p class="total">Ligne 52 — total des plus et moins-values : ${y.incomplete ? '<span class="warn">incomplet (cours à renseigner)</span>' : (y.total224 >= 0 ? '+' : '') + eur(y.total224)}</p>`;
      if (!y.incomplete && !y.exonere) h += `<div class="note">À reporter sur la <b>2042-C</b> : ${y.total224 >= 0 ? `case <b>3AN</b> = ${eur(Math.round(y.total224))}` : `case <b>3BN</b> = ${eur(Math.round(-y.total224))}`}.<br>Indicatif : flat tax = 12,8 % d’impôt + prélèvements sociaux (≈ 30 % au total ; taux des prélèvements sociaux à vérifier pour votre année) → environ ${eur(Math.max(0, y.total224) * 0.30)}. Option barème progressif : case 3CN.</div>`;
    }
    h += cmpBlock(Y);
    h += `<div class="note">🌍 Compte Revolut ou plateforme à l’étranger : déclarez chaque compte d’actifs numériques sur le formulaire <b>3916-bis</b> (même sans cession), et les comptes bancaires étrangers sur le 3916.</div>`;
    const W = out.warnings; if (W.length) h += `<details><summary class="warn">⚠️ ${W.length} point(s) à vérifier</summary><ul>${W.map(w => `<li>${dt(w.t.date)} ${esc(w.t.asset)} : ${esc(w.msg)}</li>`).join('')}</ul><p class="hint">Staking, airdrops, intérêts : leur fiscalité est discutée (revenus BNC/BIC à la réception, ou acquisition à 0 € imposée seulement à la cession). Kryptax ne tranche pas : ils sont comptés dans les quantités avec un coût d’acquisition de 0 €. Renseignez-vous ou demandez à un professionnel.</p></details>`;
    h += '<p><button id="csv" class="ghost">Exporter en CSV</button> <button id="print" class="ghost">Imprimer / PDF</button></p>';
    $('#results').innerHTML = h; lastOut = out; lastY = Y;
  }
  let lastOut = null, lastY = null;
  function cmpBlock(Y) {
    const ys = Object.keys(Y).sort().reverse(); if (!ys.length) return '';
    const d = (k, v) => { const c = manual[k]; if (c == null || v == null) return ''; const x = v - c; return ` <span class="${Math.abs(x) < 1 ? '' : 'warn'}">écart ${x >= 0 ? '+' : ''}${eur(x)}</span>`; };
    return `<details${ys.some(y => manual['cmpPV@' + y] != null) ? ' open' : ''}><summary>🔎 Comparer avec le rapport 2086 de Coinly</summary><p class="hint">Saisissez les totaux de votre rapport Coinly (ou importez un CSV « année;prix de cession;plus-value »). Un écart vient souvent d'opérations manquantes, de types différents (staking, transferts) ou des cours.</p>
      <div class="scroll"><table><tr><th>Année</th><th>Total prix de cession (Kryptax)</th><th>Coinly</th><th>Plus/moins-value (Kryptax)</th><th>Coinly</th></tr>${ys.map(y => `<tr><td>${y}</td><td class="n">${eur(Y[y].total218)}</td><td><input size="9" data-cmp="cmpP@${y}" value="${manual['cmpP@' + y] != null ? num(manual['cmpP@' + y]) : ''}">${d('cmpP@' + y, Y[y].total218)}</td><td class="n">${Y[y].incomplete ? 'incomplet' : eur(Y[y].total224)}</td><td><input size="9" data-cmp="cmpPV@${y}" value="${manual['cmpPV@' + y] != null ? num(manual['cmpPV@' + y]) : ''}">${Y[y].incomplete ? '' : d('cmpPV@' + y, Y[y].total224)}</td></tr>`).join('')}</table></div>
      <label class="ghost btn small">Importer des totaux (CSV)<input type="file" id="cmpfile" accept=".csv" hidden></label></details>`;
  }
  function computeWithPrices() {
    const withOverride = txs.map(t => Object.assign({}, t, { override212: manual['212@' + t.id] }));
    // le moteur passe (asset, ts) ; on retrouve la cession concernée par son horodatage
    const byTs = {}; txs.forEach(t => { if (t.type === 'SELL' || t.type === 'PAY') byTs[t.date] = byTs[t.date] || t.id; });
    return E.compute(withOverride, (a, ts) => priceFn(a, ts, byTs[ts]));
  }
  $('#results').addEventListener('change', e => {
    if (e.target.id === 'cmpfile') { e.target.files[0].text().then(t => { parseCSV(t).forEach(r => { const y = parseInt(r[0]); if (y > 2000) { const p = E.parseNum(r[1]), pv = E.parseNum(r[2]); if (isFinite(p)) manual['cmpP@' + y] = p; if (isFinite(pv)) manual['cmpPV@' + y] = pv; } }); save(); renderResults(); }); return; }
    const k = e.target.dataset.cmp; if (k) { const v = E.parseNum(e.target.value); if (isFinite(v)) manual[k] = v; else delete manual[k]; save(); renderResults(); return; }
    const m = e.target.dataset.man, o = e.target.dataset.o212, v = E.parseNum(e.target.value);
    if (m) { if (v >= 0) manual[m] = v; else delete manual[m]; }
    if (o) { if (v > 0) manual['212@' + o] = v; else delete manual['212@' + o]; }
    save(); renderResults();
  });
  $('#results').addEventListener('click', e => {
    if (e.target.id === 'print') window.print();
    if (e.target.id === 'csv') {
      const lines = [['annee', 'cession', ...ROWS.map(r => r[0] + ' ' + r[1])].join(';')];
      for (const y of Object.values(lastY)) y.cessions.forEach((c, i) => lines.push([y.year, i + 1, new Date(c.date).toISOString(), ...['l212', 'l213', 'l214', 'l215', 'l216', 'l217', 'l218', 'l220', 'l221', 'l222', 'l223', 'l224'].map(k => c[k] == null ? 'A RENSEIGNER' : c[k].toFixed(2).replace('.', ','))].join(';')));
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv' })); a.download = 'kryptax-2086.csv'; a.click();
    }
  });

  /* ---------- Exemple fictif ---------- */
  $('#example').onclick = () => {
    if (txs.length && !confirm('Ajouter l’exemple fictif à vos transactions ? (Effacez-le ensuite avec « Tout effacer »)')) return;
    const d = s => new Date(s).getTime(), X = (o) => Object.assign({ id: uid(), example: true, platform: 'Exemple', source: 'exemple', fee: 0 }, o);
    const ex = [
      X({ date: d('2024-01-10T10:00'), type: 'BUY', asset: 'BTC', qty: 0.05, eur: 1980, fee: 20 }),
      X({ date: d('2024-02-01T09:00'), type: 'BUY', asset: 'ETH', qty: 1, eur: 2000 }),
      X({ date: d('2024-03-15T12:00'), type: 'STAKING', asset: 'ETH', qty: 0.01 }),
      X({ date: d('2024-04-02T18:00'), type: 'EXCH_OUT', asset: 'ETH', qty: 0.2 }),
      X({ date: d('2024-04-02T18:00'), type: 'EXCH_IN', asset: 'LLAMA', qty: 5000, seq: 1 }),
      X({ date: d('2024-06-20T14:30'), type: 'SELL', asset: 'BTC', qty: 0.02, eur: 1200, fee: 12 }),
      X({ date: d('2025-03-05T11:00'), type: 'SELL', asset: 'ETH', qty: 0.5, eur: 1500, fee: 10 }),
      X({ date: d('2025-09-12T16:00'), type: 'PAY', asset: 'BTC', qty: 0.005, eur: 450 })
    ];
    txs = txs.concat(ex);
    // cours fictifs pré-remplis (pas d'appel réseau) ; LLAMA est volontairement absent → « à renseigner »
    manual['ETH@' + ex[5].id] = 3100; manual['BTC@' + ex[6].id] = 80000; manual['ETH@' + ex[7].id] = 3800; manual['LLAMA@' + ex[6].id] = 0.04; manual['LLAMA@' + ex[7].id] = 0.06;
    save(); renderTx(); renderResults();
    alert('Exemple fictif chargé. Le jeton LLAMA n’a pas de cours : la cession de 2024 passe « à renseigner » (essayez 0,05 €).');
  };
  renderTx(); if (txs.length) renderResults();
})();
