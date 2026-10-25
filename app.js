/* Kryptax — interface. Tout est stocké dans localStorage, rien n'est envoyé. */
(function () {
  'use strict';
  const E = window.KryptaxEngine, KP = window.KryptaxPipeline, $ = s => document.querySelector(s);
  const LS = { tx: 'kryptax.tx', cache: 'kryptax.prices2', manual: 'kryptax.manual' };
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  let lastIgn = []; // récompenses sans cours (valeur non incluse à la 212)
  const rewardOnly = a => { const L = txs.filter(t => t.asset === a); return L.length > 0 && L.every(t => ['INTEREST', 'STAKING', 'AIRDROP'].includes(t.type)); };
  let lastEst = new Set(); // actifs au cours estimé (≈) ou absent, mis à jour par renderResults
  let txs = load(LS.tx, []), cache = load(LS.cache, {}), manual = load(LS.manual, {});
  // purge des anciens caches : 'NA' (souvent des échecs réseau mis en cache à tort) et anciens formats de clé
  for (const k in cache) if (typeof cache[k] !== 'number' || !/\|h\d+$|\|none$/.test(k)) delete cache[k];
  const save = () => { localStorage.setItem(LS.tx, JSON.stringify(txs)); localStorage.setItem(LS.manual, JSON.stringify(manual)); };
  let showAll = false, pdfBal = load('kryptax.balances', null), opening = load('kryptax.opening', null);
  const saveCache = () => { try { localStorage.setItem(LS.cache, JSON.stringify(cache)); } catch (e) {} };
  const eur = n => (n == null || !isFinite(n)) ? '—' : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const num = n => (n == null || !isFinite(n)) ? '' : (+n).toLocaleString('fr-FR', { maximumFractionDigits: 8 });
  const dt = t => E.fmtParis(t); // heure de Paris
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const typeOpts = sel => Object.entries(E.TYPES).map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${esc(v)}</option>`).join('');

  /* ---------- CSV ---------- */
  const KF = window.KryptaxFormats, parseCSV = KF.parseCSV;
  const FIELDS = { date: ['date', 'completed date', 'started date', 'time', 'horodatage'], type: ['type', 'transaction type', 'opération'], asset: ['symbol', 'currency', 'asset', 'coin', 'crypto', 'devise', 'actif'], qty: ['quantity', 'amount', 'quantité', 'montant crypto', 'qty'], price: ['price', 'prix', 'rate', 'cours'], eur: ['value', 'fiat amount (inc. fees)', 'fiat amount', 'valeur', 'total', 'montant €'], fee: ['fees', 'fee', 'frais'], desc: ['description', 'product', 'notes'] };
  const LABELS = { date: 'Date', type: 'Type', asset: 'Crypto', qty: 'Quantité', price: 'Prix unitaire €', eur: 'Valeur / montant €', fee: 'Frais €', desc: 'Description (aide au type)' };
  const guessMap = KF.guessMap;
  let holders = JSON.parse(localStorage.getItem('kryptax.holders') || '{}'), holdInfo = '';
  const saveHolders = () => localStorage.setItem('kryptax.holders', JSON.stringify(holders));
  /* Mentions légales et vie privée : <dialog> natif (Échap, focus, clic hors du cadre) */
  { const d = $('#privacy'), o = $('#privopen');
    if (d && o) {
      o.onclick = e => { e.preventDefault(); if (d.showModal) d.showModal(); else d.setAttribute('open', ''); $('#privclose').focus(); };
      $('#privclose').onclick = () => { d.close ? d.close() : d.removeAttribute('open'); o.focus(); };
      d.addEventListener('click', e => { if (e.target === d) $('#privclose').click(); });
      d.addEventListener('close', () => o.focus());
    } }
  const showErr = m => { const n = $('#err'); if (n) { n.textContent = m || ''; n.hidden = !m; } };
  $('#files').addEventListener('change', async e => {
    showErr('');
    holdInfo = '';
    for (const file of e.target.files) { try {
      if (KP.fileList(txs).some(f => f.name === file.name)) { holdInfo = 'Fichier déjà ajouté, ignoré : ' + file.name; renderFiles(); continue; }
      if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') { await importPdf(file); continue; }
      if (/\.xlsx?$/i.test(file.name)) {
        if (!window.XLSX) { showErr('Lecture Excel indisponible, rechargez la page.'); continue; }
        const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
        /* feuille utile : la première dont l'en-tête est reconnu (date + crypto/quantité), sinon la première non vide */
        const sh = wb.SheetNames.map(n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' })).filter(r => r.length);
        const ok = sh.filter(r => KF.detect(r) || (() => { const m = guessMap((r[KF.headerRow(r)] || []).map(String)); return m.date != null && (m.qty != null || m.asset != null); })());
        if (ok.length > 1) holdInfo = file.name + ' : ' + ok.length + ' feuilles lisibles, seule la première est importée.';
        showMapping(file.name, ok[0] || sh[0] || [], true);
      } else showMapping(file.name, parseCSV(await file.text()), false);
    } catch (err) { showErr(file.name + ' : fichier illisible. Vérifiez qu\'il s\'agit bien d\'un relevé PDF, CSV ou Excel.'); } }
    e.target.value = '';
  });
  /* ---------- PDF Revolut (pdf.js local, rien n'est envoyé) ---------- */
  async function importPdf(file) {
    if (!window.pdfjsLib) return showErr('Lecture PDF indisponible, rechargez la page.');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
    $('#progress').textContent = 'Lecture du PDF…';
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    let lines = [];
    for (let i = 1; i <= doc.numPages; i++) { const c = await (await doc.getPage(i)).getTextContent(); lines = lines.concat(KP.itemsToLines(c.items)); }
    $('#progress').textContent = '';
    const r = KP.parsePdfLines(lines);
    if (!r.rows.length && !r.fiat.length) return showErr(file.name + ' : aucune opération crypto trouvée dans ce PDF.');
    holders[file.name] = KP.holderFromLines(lines); saveHolders();
    const res = KP.importRows(r.rows, { asset: 0, type: 1, qty: 2, price: 3, eur: 4, fee: 5, date: 6 }, { platform: 'Relevé', feeInKind: true, source: file.name, dmode: 'DMY', nmode: 'FR', tz: 'UTC' }, uid);
    txs = txs.concat(res.txs); const nsw = E.detectSwaps(txs).length;
    if (r.balances) { pdfBal = { closing: r.balances.closing, to: r.balances.to }; localStorage.setItem('kryptax.balances', JSON.stringify(pdfBal)); }
    if (r.fiat.length) { fiatText = (fiatText ? fiatText + '\n' : '') + r.fiat.join('\n'); localStorage.setItem('kryptax.fiat', fiatText); }
    save(); renderTx(); autoRun();
    let msg = res.txs.length + ' transactions lues dans le PDF' + (nsw ? ', ' + nsw + ' échanges crypto→crypto détectés' : '') + (r.fiat.length ? ', ' + r.fiat.length + ' lignes « Vente de / Achat de » des relevés en devises' : '') + '.';
    if (r.fiat.length) { const cc = E.crossCheck(txs, E.parseFiatSales(fiatText)); msg += ' Contre-vérification : ' + cc.confirmed.length + ' ventes confirmées, ' + (cc.swapButFiat.length + cc.sellNoFiat.length) + ' divergences (voir le tableau des échanges).'; }
    void msg; // plus d'alerte : on passe directement au calcul
  }
  let fiatText = localStorage.getItem('kryptax.fiat') || '';
  function showMapping(name, rows, isXlsx) {
    if (rows.length < 2) return showErr(name + ' : fichier vide.');
    const fmt = KF.detect(rows);
    if (fmt) {
      const res = KF.parse(rows, fmt, { source: name }, uid);
      if (!res.txs.length) return showErr(name + ' : ' + fmt.label + ' reconnu, mais aucune opération crypto lisible.');
      holders[name] = KP.holderFromRows(rows); saveHolders(); txs = txs.concat(res.txs); E.detectSwaps(txs);
      save(); renderTx(); autoRun();
      if (res.bad.length) showErr(res.bad.length + ' ligne' + (res.bad.length > 1 ? 's' : '') + ' de ' + name + ' non lue' + (res.bad.length > 1 ? 's' : '') + ' (type d’opération inconnu ou valeur manquante) : vérifiez ce fichier.');
      return;
    }
    let hi0 = 0; { const hi = KF.headerRow(rows); if (hi > 0) { rows = rows.slice(hi); hi0 = hi; } }
    if (rows[0].some(h => /sent amount|received amount|montant envoy|montant re/i.test(h))) return showMapping2(name, rows);
    rows[0] = rows[0].map(x => E.fixText(String(x)));
    { const n = rows[0].length, sh = rows.slice(1).filter(r => r.slice(n).some(x => String(x).trim() !== '')).length;
      if (sh) return showErr(name + ' : colonnes décalées (' + sh + ' ligne' + (sh > 1 ? 's ont' : ' a') + ' plus de valeurs que d’en-têtes, souvent une virgule décimale dans un CSV séparé par des virgules). Exportez avec « ; » comme séparateur.'); }
    const head = rows[0], m = guessMap(head), box = document.createElement('div'); box.className = 'note';
    const sel = f => `<label>${LABELS[f]}<select data-f="${f}"><option value="">—</option>${head.map((h, i) => `<option value="${i}"${m[f] === i ? ' selected' : ''}>${esc(h)}</option>`).join('')}</select></label>`;
    box.innerHTML = `<b>${esc(name)}</b> — ${rows.length - 1} lignes. ${m.date == null || m.asset == null || m.qty == null ? '<span class="warn">Format non reconnu automatiquement : indiquez les colonnes ci-dessous.</span>' : 'Vérifiez les colonnes :'}
      <div class="grid">${Object.keys(FIELDS).map(sel).join('')}
      <label>Format des dates<select data-o="dmode"><option value="">Auto</option><option value="DMY">JJ/MM/AAAA</option><option value="MDY">MM/JJ/AAAA</option></select></label><label>Fuseau des heures <select data-o="tz"><option value="UTC">UTC (exports crypto)</option><option value="Paris">Heure de Paris</option></select></label>
      <label>Format des nombres<select data-o="nmode"><option value="">Auto</option><option value="FR">1 234,56</option><option value="EN">1,234.56</option></select></label>
      <label>Plateforme<input data-o="platform" value="Relevé"></label></div>
      ${isXlsx ? '<p class="warn">⚠️ Fichier .xlsx : la colonne Quantité est souvent tronquée (virgule perdue). Kryptax la reconstruit avec Valeur / Prix ou un cours historique, et marque les lignes douteuses. Privilégiez l’export CSV si possible.</p>' : ''}
      <div class="scroll"><table><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>${rows.slice(1, 6).map(r => `<tr>${r.map(c => `<td>${esc(c instanceof Date ? c.toLocaleString('fr-FR') : E.fixText(c))}</td>`).join('')}</tr>`).join('')}</table></div>
      <button class="go">Importer ces lignes</button> <button class="ghost cancel">Annuler</button>`;
    $('#mapping').appendChild(box);
    box.querySelector('.cancel').onclick = () => box.remove();
    box.querySelector('.go').onclick = () => {
      const mp = {}; box.querySelectorAll('[data-f]').forEach(s => { if (s.value !== '') mp[s.dataset.f] = +s.value; });
      const o = {}; box.querySelectorAll('[data-o]').forEach(s => o[s.dataset.o] = s.value);
      if (mp.date == null || mp.asset == null || mp.qty == null) return alert('Format non reconnu : choisissez au moins les colonnes Date, Crypto et Quantité.');
      if (mp.eur == null && mp.price == null) return alert('Choisissez la colonne du montant en € (ou du prix) : sans elle, les achats et ventes seraient comptés à 0 €.');
      o.cur = mp.eur != null ? KF.headCur(head[mp.eur]) : mp.price != null ? KF.headCur(head[mp.price]) : 'EUR';
      o.xlsx = isXlsx; o.source = name; o.strict = true; o.head = head;
      const res = KP.importRows(rows.slice(1), mp, o, uid);
      if (res.fatal) { box.remove(); return showErr(name + ' : fichier refusé, ' + res.fatal + '. Corrigez les colonnes puis réimportez.'); }
      if (!res.txs.length) { box.remove(); return showErr(name + ' : aucune opération lisible. ' + KP.badSummary(res, hi0 + 2)); }
      holders[name] = KP.holderFromRows(rows); saveHolders(); txs = txs.concat(res.txs); const nsw = E.detectSwaps(txs).length;
      save(); box.remove(); renderTx(); autoRun();
      const sus = res.txs.filter(t => t.qtyStatus !== 'ok').length, usd = res.txs.filter(t => t.fxPending).length;
      if (res.bad.length) showErr(name + ' : ' + KP.badSummary(res, hi0 + 2) + ' Corrigez ces lignes ou saisissez-les à la main.');
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
      <label>Format des dates<select data-o="dmode"><option value="">Auto</option><option value="DMY">JJ/MM/AAAA</option><option value="MDY">MM/JJ/AAAA</option></select></label><label>Fuseau des heures <select data-o="tz"><option value="UTC">UTC (exports crypto)</option><option value="Paris">Heure de Paris</option></select></label>
      <label>Format des nombres<select data-o="nmode"><option value="">Auto</option><option value="FR">1 234,56</option><option value="EN">1,234.56</option></select></label>
      <label>Plateforme<input data-o="platform" value="Coinly"></label>
      <label><span><input type="checkbox" data-o="prices" checked> Réutiliser les valeurs comme cours</span></label></div>
      <div class="scroll"><table><tr>${head.map(x => `<th>${esc(x)}</th>`).join('')}</tr>${rows.slice(1, 6).map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></div>
      <p class="hint">Achat = € envoyés → crypto reçue ; vente = crypto → € ; crypto → crypto = échange (2 lignes). Si vous importez déjà le relevé de cette plateforme, n'importez pas deux fois les mêmes opérations.</p>
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
        const date = E.parseDate(g('date'), o.dmode, o.tz); if (!isFinite(date)) { bad++; return; }
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
          if (c && c[1] > 0) { cache[c[0] + '|h' + Math.floor(date / 3600e3)] = nw / c[1]; np++; }
        }
      });
      saveCache(); save(); box.remove(); renderTx(); autoRun();
      if (bad) showErr(bad + ' lignes de ' + name + ' n\'ont pas pu être lues.');
    };
  }


  /* ---------- Tableau des transactions ---------- */
  /* Mobile : chaque cellule reçoit le libellé de sa colonne (data-l) pour l'affichage empilé en CSS. */
  function labelTables(root) {
    root.querySelectorAll('table:not(.form)').forEach(t => { const hr = t.querySelector('tr'); if (!hr || !hr.querySelector('th')) return; const L = [...hr.children].map(x => x.textContent.trim()); hr.classList.add('hdr');
      t.querySelectorAll('tr').forEach(r => { if (r === hr) return; [...r.children].forEach((td, i) => { if (L[i] && !td.dataset.l) td.dataset.l = L[i]; }); }); });
  }
  new MutationObserver(() => labelTables(document.body)).observe(document.body, { childList: true, subtree: true });
  let swOpen = false;
  function renderSwaps() {
    const d0 = $('#swdet'); if (d0) swOpen = d0.open;
    const el = $('#swaps'); if (!el) return;
    const byId = {}; txs.forEach(t => byId[t.id] = t);
    const outs = E.sortTx(txs).filter(t => (t.swapAuto && t.type === 'EXCH_OUT') || t.swapForce === 'taxable' && t.rawSwap === 'out');
    const chk = `<details><summary class="hint">Contre-vérifier avec le relevé en euros (optionnel)</summary><p class="hint">Collez les lignes du relevé de compte EUR/USD (ligne de type « … – Vente de GRASS », avec date et heure). Une vente vers des euros y apparaît ; un échange crypto→crypto non.</p><textarea id="fiattxt" rows="5" class="wfull">${esc(fiatText)}</textarea><button class="small" id="fiatgo">Vérifier</button><div id="fiatres"></div></details>`;
    if (!outs.length) { el.innerHTML = txs.length ? chk : ''; return; }
    const nAuto = outs.filter(t => t.swapAuto).length, nForced = outs.length - nAuto;
    el.innerHTML = `<p class="ok">🔁 ${nAuto} échange${nAuto > 1 ? 's' : ''} crypto→crypto détecté${nAuto > 1 ? 's' : ''}, non imposable${nAuto > 1 ? 's' : ''}${nForced ? ` · ${nForced} forcé${nForced > 1 ? 's' : ''} imposable${nForced > 1 ? 's' : ''}` : ''}.</p>
      <details id="swdet"${swOpen ? ' open' : ''}><summary class="hint">Voir/corriger les échanges</summary>
      <p class="hint">Une vente et un achat d’une autre crypto à la même seconde (≤ 5 s), pour une valeur proche (±8 %), sont un échange crypto→crypto : non imposable. Une vente vers des euros n’a pas d’achat simultané. Si une ligne est fausse, forcez-la.</p>
      <div class="scroll"><table><tr><th>Date</th><th>Vendu</th><th>Reçu</th><th class="n">Valeur</th><th>Traitement</th></tr>${outs.map(t => { const b = byId[t.swapWith || t.rawSwapWith]; return `<tr data-sw="${t.id}"><td>${dt(t.date)}</td><td>${num(t.qty)} ${esc(t.asset)}</td><td>${b ? num(b.qty) + ' ' + esc(b.asset) : '—'}</td><td class="n">${eur(t.eur || 0)}</td><td>${t.swapAuto ? 'Échange (non imposable) <button class="small ghost" data-force>Forcer imposable</button>' : 'Vente imposable (forcée) <button class="small ghost" data-unforce>Rétablir échange</button>'}</td></tr>`; }).join('')}</table></div></details>` + chk;
  }
  $('#swaps') && $('#swaps').addEventListener('click', e => {
    if (e.target.id === 'fiatgo') {
      fiatText = $('#fiattxt').value; localStorage.setItem('kryptax.fiat', fiatText); const f = E.parseFiatSales(fiatText), r = E.crossCheck(txs, f), L = (a, m) => a.length ? `<li>${m} (${a.length}) : ${a.map(x => esc((x.t ? x.t.asset + ' ' + dt(x.t.date) : x.asset + ' ' + dt(x.date)))).join(', ')}</li>` : '';
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
  // Import : on cumule les fichiers, le calcul ne part qu'avec « Valider mes imports »
  let dirty = false;
  function autoRun() {
    const old = txs.filter(t => t._in), fresh = txs.filter(t => !t._in); fresh.forEach(t => t._in = 1);
    const m = KP.mergeImport(old, fresh); txs = m.txs; E.detectSwaps(txs);
    cancelAuto(); save(); dirty = true; window.__kxDone = false; $('#results').innerHTML = ''; renderTx();
  }
  function renderFiles() {
    const L = KP.fileList(txs), box = $('#flist'); if (!box) return;
    for (const k in holders) if (!L.some(f => f.name === k)) { delete holders[k]; saveHolders(); }
    const H = KP.checkHolders(holders, L.map(f => f.name)), hm = $('#holdmsg');
    if (hm) {
      const msg = H.status === 'conflict' ? `<div class="note warn">Ces relevés ne semblent pas appartenir à la même personne (${esc(H.a)} ≠ ${esc(H.b)}). Retirez le fichier concerné.</div>` : H.status === 'ok' ? `<div class="note ok">✅ Même titulaire sur les ${H.n} fichiers</div>` : '';
      hm.innerHTML = msg + (holdInfo ? `<div class="note ok">${esc(holdInfo)}</div>` : ''); hm.hidden = !hm.innerHTML;
    }
    box.innerHTML = L.map(f => `<li${H.bad.includes(f.name) ? ' class="badf"' : ''}><span>${H.bad.includes(f.name) ? '⚠️ ' : ''}${esc(f.name)}</span> <button class="small ghost" data-rmf="${esc(f.name)}" aria-label="Retirer ${esc(f.name)}">✕</button></li>`).join('');
    box.hidden = !L.length; $('#validate').disabled = !txs.length || !dirty || H.status === 'conflict';
  }
  $('#flist').addEventListener('click', e => { const n = e.target.dataset && e.target.dataset.rmf; if (n == null) return; txs = txs.filter(t => (t.source || 'Saisie manuelle') !== n); E.detectSwaps(txs); cancelAuto(); save(); dirty = !!txs.length; window.__kxDone = false; $('#results').innerHTML = ''; renderTx(); });
  $('#validate').onclick = () => { if (!txs.length || KP.checkHolders(holders, KP.fileList(txs).map(f => f.name)).status === 'conflict') return; holdInfo = ''; dirty = false; renderFiles(); $('#run').click(); };
  function renderTx() {
    renderSwaps(); renderFiles();
    const all = E.sortTx(txs), sales = all.filter(t => t.type === 'SELL' || t.type === 'PAY'), s = showAll ? all : sales;
    $('#txcount').textContent = all.length ? '(' + all.length + ')' : '';
    $('#calc').hidden = !all.length; $('#txnote2').textContent = '';
    $('#txinfo').textContent = all.length ? (showAll ? `${all.length} transactions affichées (dont ${sales.length} ventes)` : `${sales.length} ventes affichées sur ${all.length} transactions`) : '';
    $('#txall').hidden = !all.length; $('#txall').textContent = showAll ? 'Afficher seulement les ventes' : 'Afficher toutes les transactions';
    renderBalances(); renderOpening();
    $('#txtable').innerHTML = s.length ? `<tr><th>Date</th><th>Type</th><th>Crypto</th><th class="n">Quantité</th><th class="n">Montant €</th><th class="n">Frais €</th><th>Plateforme</th><th></th></tr>` + s.map(t => `<tr data-id="${t.id}" class="${E.CHECK.includes(t.type) ? 'chk' : ''}">
      <td>${dt(t.date)}${t.example ? ' <span class="tag">exemple</span>' : ''}</td><td><select data-k="type">${typeOpts(t.type)}</select>${t.rawType ? `<br><span class="hint">${esc(t.rawType)}</span>` : ''}</td>
      <td><input data-k="asset" value="${esc(t.asset)}" size="6"></td><td class="n${t.qtyStatus && !['ok', 'corrigée'].includes(t.qtyStatus) && !t.qtyManual ? ' bad' : ''}"><input data-k="qty" value="${num(t.qty)}" size="10">${t.qtyStatus && t.qtyStatus !== 'ok' && !t.qtyManual ? `<br><span class="hint">qté ${esc(t.qtyStatus)}</span>` : ''}</td>
      <td class="n"><input data-k="eur" value="${num(t.eur)}" size="9">${t.cur ? `<br><span class="hint">${num(t.valCur)} ${t.cur}${t.fx ? ' × ' + num(t.fx) : ' (à convertir)'}</span>` : ''}</td><td class="n"><input data-k="fee" value="${num(t.fee)}" size="6"></td>
      <td>${esc(/revolut/i.test(t.platform || '') ? 'Relevé' : (t.platform || ''))}</td><td><button class="small danger" data-del>✕</button></td></tr>`).join('') : (all.length ? '<tr><td>Aucune vente (cession imposable). Cliquez « Afficher toutes les transactions ».</td></tr>' : '<tr><td>Aucune transaction. Importez un CSV ou chargez l’exemple.</td></tr>');
  }
  $('#txall').onclick = () => { showAll = !showAll; renderTx(); };
  /* ---------- Soldes de clôture du relevé PDF ---------- */
  function renderBalances() {
    const el = $('#balances'); if (!pdfBal || !txs.length) { el.innerHTML = ''; return; }
    const rows = E.checkBalances(txs, pdfBal.closing, pdfBal.to, opening), bad = rows.filter(b => !b.ok);
    el.innerHTML = `<details><summary>📊 Soldes de clôture : relevé PDF vs calculés — ${bad.length ? bad.length + ' écart(s)' : 'aucun écart ✓'}</summary>
      <p class="hint">Fin de période du relevé : ${isFinite(pdfBal.to) ? dt(pdfBal.to) : '?'}. Les petits écarts viennent des frais affichés arrondis ; un gros écart signale une opération manquante.</p>
      <div class="scroll"><table><tr><th>Actif</th><th class="n">Relevé</th><th class="n">Calculé</th><th class="n">Écart</th><th></th></tr>${rows.map(b => `<tr><td>${esc(b.asset)}</td><td class="n">${num(b.expected)}</td><td class="n">${num(b.computed)}</td><td class="n ${b.ok ? '' : 'neg'}">${b.ok ? '0' : num(b.diff)}</td><td>${b.ok ? '✓' : '⚠'}</td></tr>`).join('')}</table></div>
      ${bad.length ? '<button id="baladj" class="small">Ajouter des lignes d’ajustement pour aligner sur le relevé</button>' : ''}</details>`;
    const btn = $('#baladj'); if (btn) btn.onclick = () => { txs = txs.concat(E.balanceAdjustments(txs, pdfBal.closing, pdfBal.to, opening).map(t => Object.assign({ id: uid(), platform: 'Relevé', feeInKind: true }, t))); save(); renderTx(); };
  }
  /* ---------- État reporté au 31/12 ---------- */
  function renderOpening() {
    const el = $('#opening'), yrs = [...new Set(txs.map(t => E.parisYear(t.date)))].sort();
    el.innerHTML = `<details><summary>📅 Report d’une année sur l’autre (état au 31/12)</summary>
      ${opening ? `<p class="ok">État chargé au <b>${opening.date.split('-').reverse().join('/')}</b> : ${Object.keys(opening.holdings).length} actifs, ligne 220 = ${eur(opening.l220)}, ligne 221 = ${eur(opening.l221)}${opening.incomplete ? ' <span class="neg">(calcul de l’année précédente incomplet)</span>' : ''}. Les opérations jusqu’à cette date sont ignorées. <button id="opdel" class="small ghost">Retirer</button></p>`
        : '<p class="hint">Sans état reporté, il faut importer <b>tout l’historique</b> depuis votre premier achat de crypto : les lignes 220 et 221 cumulent toutes les années. Exportez l’état au 31/12 chaque année et réimportez-le l’année suivante.</p>'}
      <p>${yrs.map(y => `<button class="small" data-st="${y}">Exporter l’état au 31/12/${y}</button>`).join(' ')} <label class="btn small">Importer un état (.json)<input type="file" id="opfile" accept=".json,application/json" hidden></label></p>
      <p class="hint">Le fichier reste sur votre appareil (aucun envoi).</p></details>`;
    el.querySelectorAll('[data-st]').forEach(b => b.onclick = () => {
      const st = E.stateAt(txs.map(t => Object.assign({}, t, { override212: manual['212@' + t.id] })), (a, ts) => priceFn(a, ts), +b.dataset.st, opening);
      if (st.incomplete && !confirm('Des cessions de cette année sont incomplètes (cours manquants) : la ligne 221 sera fausse. Exporter quand même ?')) return;
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(st, null, 2)], { type: 'application/json' })); a.download = 'kryptax-etat-' + st.date + '.json'; a.click();
    });
    $('#opfile').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { opening = E.validateState(JSON.parse(await f.text())); localStorage.setItem('kryptax.opening', JSON.stringify(opening)); renderTx(); $('#results').innerHTML = ''; } catch (x) { alert('Import impossible : ' + x.message); } };
    const d = $('#opdel'); if (d) d.onclick = () => { opening = null; localStorage.removeItem('kryptax.opening'); renderTx(); $('#results').innerHTML = ''; };
  }
  $('#txtable').addEventListener('change', e => {
    const tr = e.target.closest('tr'), t = txs.find(x => x.id === tr.dataset.id), k = e.target.dataset.k; if (!t || !k) return;
    t[k] = k === 'type' ? e.target.value : k === 'asset' ? e.target.value.trim().toUpperCase() : Math.abs(E.parseNum(e.target.value)) || 0;
    if (k === 'qty') t.qtyManual = true; if (k === 'type') { t.typeManual = true; delete t.swapAuto; } if (k === 'eur' && t.cur) delete t.fxPending;
    if (k === 'type') E.detectSwaps(txs);
    save(); if (k === 'type' || k === 'qty') renderTx();
  });
  $('#txtable').addEventListener('click', e => { if (!e.target.hasAttribute('data-del')) return; cancelAuto(); txs = txs.filter(x => x.id !== e.target.closest('tr').dataset.id); save(); renderTx(); });
  $('#clearman').onclick = () => { if (confirm('Effacer les cours et montants saisis à la main ?')) { manual = {}; livePrice = null; save(); renderTx(); renderResults(); } };
  $('#reset').onclick = () => {
    if (!confirm('Tout réinitialiser ? Fichiers importés, transactions, saisies manuelles, résultats et cache de prix de ce navigateur seront effacés.')) return; cancelAuto();
    Object.keys(localStorage).filter(k => k.startsWith('kryptax.')).forEach(k => localStorage.removeItem(k));
    location.reload(); // la page revient à son état initial
  };
  $('#clear').onclick = () => { if (confirm('Effacer toutes les transactions et saisies de ce navigateur ?')) { cancelAuto(); txs = []; manual = {}; fiatText = ''; pdfBal = null; localStorage.removeItem('kryptax.fiat'); localStorage.removeItem('kryptax.balances'); save(); renderTx(); $('#results').innerHTML = ''; } };

  /* ---------- Cours historiques ---------- */
  const HOUR = 3600e3;
  let livePrice = null;
  function priceFn(a, ts, txId) {
    if (manual[a + '@' + txId] != null) return manual[a + '@' + txId];
    if (manual[a] != null) return manual[a];
    if (!livePrice || livePrice.txs !== txs) { livePrice = KP.priceLookup(txs, cache, manual, { zeroIfUnknown: true }); livePrice.txs = txs; livePrice.suspect = [...new Set(txs.map(t => t.asset))].filter(x => cache[x + '|suspect']); } // même sans relancer : cache + cours observés ≈
    return livePrice(a, ts);
  }
  function renderDiag(src, fnr) {
    const rows = Object.entries(src.diag).map(([k, d]) => `<tr><td>${k}</td><td class="${d.fail ? 'neg' : 'pos'}">${d.fail ? (d.ok ? 'partiel' : 'échec') : 'OK'}</td><td class="num">${d.calls}</td><td>${d.last || ''}</td></tr>`).join('');
    const est = (fnr.failed || []).length + ((fnr.unvalued && fnr.unvalued.size) || 0);
    $('#diag').innerHTML = `<details><summary class="hint">Sources de prix : ${est ? est + ' actif' + (est > 1 ? 's' : '') + ' estimé' + (est > 1 ? 's' : '') + ' (≈)' : 'tous les cours trouvés'}</summary><table><tr><th>Source</th><th>État</th><th>Appels</th></tr>${Object.entries(src.diag).map(([k, d]) => `<tr><td>${esc(k)}</td><td>${d.ok ? 'OK' : '—'}</td><td class="num">${d.calls}</td></tr>`).join('')}</table>` +
      (src.assetDiag && Object.keys(src.assetDiag).length ? `<p class="hint">${Object.entries(src.assetDiag).map(([a, l]) => { const ok = l.find(x => / : OK$/.test(x)); return `<b>${esc(a)}</b> : ${ok ? esc(ok.replace(/ : OK$/, '')) : '≈ relevés'}`; }).join(' · ')}</p>` : '') + '</details>';
  }
  let runCtl = null, scopedYear = null;
  /* Périmètre des cours : cessions jusqu'à la fin de l'année choisie (ou de la dernière année avec cessions) ; une année plus récente relance le calcul. */
  function scopeUntil() {
    const now = new Date().getFullYear(), ys = txs.filter(t => t.type === 'SELL' || t.type === 'PAY').map(t => E.parisYear(t.date)).filter(y => y <= now);
    scopedYear = fyear || (ys.length ? Math.max(...ys) : now); return new Date(scopedYear + 1, 0, 1).getTime();
  }
  function binSymsCached() { try { const o = JSON.parse(localStorage.getItem('kryptax.binsyms') || 'null'); return o && Date.now() - o.t < 864e5 && o.L.length > 50 ? new Set(o.L) : null; } catch (e) { return null; } } // liste publique des paires Binance (non sensible), 24 h
  /* Relance automatique tant qu'un cours n'est qu'estimé (≈) ou absent : 1 s après la fin du calcul, plafond AUTO_MAX, backoff léger après la 5e. */
  const RETRY_DELAY_MS = 1000, AUTO_MAX = 10;
  let autoTry = 0, autoTimer = null, autoTick = null, autoFire = false;
  const retryDelay = k => k <= 5 ? RETRY_DELAY_MS : RETRY_DELAY_MS * Math.min(2 ** (k - 5), 10);
  function autoInd(on) { const i = $('#autoind'); if (i) i.hidden = !on; }
  function cancelAuto() { clearTimeout(autoTimer); clearInterval(autoTick); autoTimer = autoTick = null; autoTry = 0; autoInd(false); const p = $('#progress'); if (p && /dans \d+ s…$/.test(p.textContent)) p.textContent = ''; }
  function scheduleAuto(failed) {
    clearTimeout(autoTimer); clearInterval(autoTick); autoTimer = autoTick = null;
    const p = $('#progress'), est = [...lastEst].filter(x => x !== '*');
    if (failed || !lastEst.size) { autoInd(false); autoTry = 0; return; }
    const names = est.length ? ' pour ' + est.map(esc).join(', ') : '';
    if (autoTry >= AUTO_MAX) { p.textContent = `Cours toujours estimé (≈)${names} après ${AUTO_MAX} tentatives automatiques : saisissez le cours ou touchez « Relancer » plus tard.`; p.className = 'warn'; autoInd(false); autoTry = 0; return; }
    autoTry++; const k = autoTry, at = Date.now() + retryDelay(k);
    est.forEach(a => { delete cache[a + '|none']; }); // « aucune source » : on redemande
    autoInd(true); // relance discrète : petit indicateur dans les résultats, sans barre ni compte à rebours
    autoTimer = setTimeout(() => { clearInterval(autoTick); autoTimer = autoTick = null; if (runCtl) return; autoFire = true; $('#run').click(); }, retryDelay(k));
  }
  /* Barre = progression réelle pondérée : taux de change 0–5 %, cours à la minute 5–70 %, cours horaires 70–90 %, calcul et affichage 90–100 %.
     Une relance (étape déjà passée) répartit le reste entre la valeur atteinte et 90 % : jamais de recul, jamais d'avance sur le réel. */
  const PHASES = [['Taux de change', 0, 25], ['Cours à la minute', 25, 50], ['Cours', 50, 60]];
  const PLABEL = v => v < 25 ? 'Lecture de vos fichiers…' : v < 60 ? 'Récupération des cours…' : 'Génération du formulaire 2086…';
  // Popup de fin de calcul réussi (une fois par calcul) : ✓, titre, bouton vers « 2. Résultat et export »
  let doneShown = false;
  function showDone() {
    const d = $('#donepop'); if (!d || d.open || doneShown || ($('#adgate') && $('#adgate').open)) return;
    doneShown = true; d.showModal(); $('#donego').focus();
  }
  { const d = $('#donepop');
    if (d) {
      const close = () => { if (d.open) d.close(); };
      $('#donego').addEventListener('click', () => { // même parcours que « Voir le PDF » : pub (si pas déjà vue) puis aperçu
        close(); const b = currentBlockers(), btn = $('#pdfx');
        if (btn && !b.length && !runCtl) { btn.click(); return; }
        if (btn && b.length) pdfRefused(b);
        const m = $('#pdfmsg'), t = (m && !m.hidden) ? m : $('#results');
        if (m && !b.length) { m.textContent = 'Votre PDF n’est pas encore prêt : mise à jour des cours en cours, réessayez dans un instant.'; m.hidden = false; }
        if (t) { const rm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; t.scrollIntoView({ behavior: rm ? 'auto' : 'smooth', block: 'center' }); }
      });
      $('#doneclose').addEventListener('click', close);
      d.addEventListener('click', e => { if (e.target === d) close(); });
    }
  }
  function progBar() {
    const w = $('#barwrap'), b = $('#bar'), f = $('#barfill'); let val = 0, last = -1, lo = 0, hi = 60, lab = '', live = false;
    const paint = () => { f.style.transform = 'scaleX(' + (val / 100).toFixed(4) + ')'; b.setAttribute('aria-valuenow', String(Math.floor(val))); const t = PLABEL(val), pg = $('#progress'); if (live && (t !== lab || !pg.textContent) && !/^Nouvelle/.test(pg.textContent)) { lab = t; pg.textContent = t; pg.className = ''; } };
    const set = v => { if (v > val) { val = Math.min(100, v); paint(); } };
    const map = (p, r) => lo + (hi - lo) * (PHASES[p][1] + (PHASES[p][2] - PHASES[p][1]) * r) / 60;
    return {
      start(quiet) { val = 0; last = -1; lo = 0; hi = 60; lab = ''; live = !quiet; w.classList.remove('done'); if (!quiet) w.hidden = false; paint(); },
      step(name, n, tot) {
        const p = PHASES.findIndex(x => name === x[0] || name.indexOf(x[0] + ' ') === 0); if (p < 0 || !tot) return;
        if (p < last) { lo = val; last = -1; } /* relance : nouvelle passe sur la part restante */
        for (let q = last + 1; q < p; q++) set(map(q, 1)); /* étapes sans rien à faire : comptées comme faites */
        last = p; set(map(p, Math.min(1, n / tot)));
      },
      at(v) { set(v); },
      end(ok) { live = false; if (ok) { set(100); w.classList.add('done'); setTimeout(() => { w.hidden = true; }, 600); } else w.hidden = true; }
    };
  }
  $('#run').onclick = async () => {
    if (autoFire) autoFire = false; else cancelAuto(); clearTimeout(autoTimer); clearInterval(autoTick);
    $('#run').disabled = true; $('#run').hidden = true; $('#diag').hidden = true; const quiet = autoTry > 0; $('#cancel').hidden = quiet; runCtl = new AbortController(); pdfState(); let failed = false;
    const bar = progBar(), t0 = Date.now(); bar.start(quiet); if (!autoTry) doneShown = false; /* relances auto = même calcul */
    const show = (step, n, tot) => { if (/^Nouvelle/.test($('#progress').textContent)) $('#progress').textContent = ''; bar.step(step, n, tot); };
    let src;
    try {
      const persist = () => saveCache(), sig = runCtl.signal;
      livePrice = await KP.prepareRetry(txs, k => (src = KP.makeSources((u, o) => fetch(u, o), { signal: sig, rotate: k, binSyms: binSymsCached(), onBinSyms: L => { try { localStorage.setItem('kryptax.binsyms', JSON.stringify({ t: Date.now(), L })); } catch (e) {} } })), cache, show, { signal: sig, concurrency: 4, onSave: persist, manual, until: scopeUntil(), maxTries: 0, // les reprises sont gérées par scheduleAuto (1 s)
       
        onRetry: (k, max, f) => { if (quiet) return; $('#progress').textContent = `Nouvelle tentative… (${k}/${max}, ${f.length} cours manquant${f.length > 1 ? 's' : ''})`; $('#progress').className = 'hint'; } });
      bar.at(60); livePrice.txs = txs; renderDiag(src, livePrice);
      persist(); save(); bar.at(80); renderTx(); bar.at(92);
      const st = src.stats;
      $('#progress').dataset.full = `Calcul terminé en ${Math.round((Date.now() - t0) / 1000)} s (${st.calls} requêtes${st.fails ? ', ' + st.fails + ' échecs réseau' : ''}${livePrice.failed.length ? ', ' + livePrice.failed.length + ' actifs sans source joignable → cours observé ≈' : ''}).`;
    } catch (e) {
      try { saveCache(); } catch (x) {}
      if (src) renderDiag(src, { failed: [], fxMissing: txs.filter(t => t.fxPending).length });
      failed = true; $('#progress').textContent = /Annul/.test(e.message) ? 'Calcul annulé.' : 'Le calcul n\'a pas pu aboutir (connexion ?). Relancez.'; $('#progress').className = 'warn';
    }
    if (!failed) $('#progress').textContent = '';
    $('#run').disabled = false; $('#run').hidden = !failed; $('#diag').hidden = true; window.__kxDone = true; $('#cancel').hidden = true; bar.end(!failed); runCtl = null; renderResults(); scheduleAuto(failed); if (!failed) showDone();
  };
  $('#cancel').onclick = () => { cancelAuto(); if (runCtl) runCtl.abort(); };

  /* ---------- Résultats 2086 ---------- */
  const ROWS = [
    ['211', 'Date de la cession (heure de Paris)', c => dt(c.l211), ''],
    ['212', 'Valeur globale du portefeuille au moment de la cession', c => eur(c.l212), 'Σ quantités détenues × cours, tous portefeuilles'],
    ['213', 'Prix de cession', c => eur(c.l213), ''], ['214', 'Frais de cession', c => eur(c.l214), ''],
    ['215', 'Prix de cession net des frais', c => eur(c.l215), '213 − 214'], ['216', 'Soulte reçue ou versée', c => eur(c.l216), ''],
    ['217', 'Prix de cession net des soultes', c => eur(c.l217), '213 − 216'], ['218', 'Prix de cession net des frais et soultes', c => eur(c.l218), '213 − 214 − 216'],
    ['220', 'Prix total d’acquisition', c => eur(c.l220), 'Σ achats en € (frais inclus) depuis le début'],
    ['221', 'Fractions de capital initial', c => eur(c.l221), 'Σ des [223 × 217 / 212] des cessions antérieures'],
    ['222', 'Soultes reçues lors d’échanges antérieurs', c => eur(c.l222), ''], ['223', 'Prix total d’acquisition net', c => eur(c.l223), '220 − 221 − 222'],
    ['224', 'Plus-value ou moins-value', c => c.l224 == null ? '<b class="warn">à renseigner</b>' : '<b class="' + (c.l224 >= 0 ? 'pos' : 'neg') + '">' + (c.l224 >= 0 ? '+' : '') + eur(c.l224) + '</b>', '218 − [223 × (217 / 212)]']
  ];
  let lastS = {};
  const sgn = v => (v >= 0 ? '+' : '') + eur(v);
  function summaryRows(S) { // [section, libellé, valeur texte, valeur numérique]
    const R = [], add = (sec, l, v, n) => R.push([sec, l, v, n]);
    add('Plus-values', 'Gains', eur(S.gains), S.gains); add('Plus-values', 'Pertes', eur(S.losses), S.losses);
    add('Plus-values', 'Plus-value nette' + (S.incomplete ? ' (incomplet)' : ''), sgn(S.net), S.net);
    add('Cessions', 'Nombre de cessions imposables', String(S.nCessions), S.nCessions); add('Cessions', 'Produit total des cessions (213)', eur(S.produit), S.produit);
    add('Cessions', 'Prix d’acquisition des actifs cédés (fractions 220)', eur(S.acquisition), S.acquisition);
    add('Frais', 'Frais en nature', eur(S.fees.inKind), S.fees.inKind); add('Frais', 'Frais explicites', eur(S.fees.explicit), S.fees.explicit); add('Frais', 'Frais totaux', eur(S.fees.total), S.fees.total);
    for (const g of Object.values(S.income)) add('Revenus (income)', `${g.label} (${g.n})`, (g.est ? '≈ ' : '') + eur(g.eur), g.eur);
    add('Revenus (income)', 'Total revenus' + (S.incomeUnknown.length ? ` (${S.incomeUnknown.length} sans cours)` : ''), eur(S.incomeTotal), S.incomeTotal);
    add('Sorties (outcome)', `Ventes vers euros (${S.outcome.SELL.n})`, eur(S.outcome.SELL.eur), S.outcome.SELL.eur);
    if (S.outcome.PAY.n) add('Sorties (outcome)', `Paiements en crypto (${S.outcome.PAY.n})`, eur(S.outcome.PAY.eur), S.outcome.PAY.eur);
    if (S.outcome.SEND.n) add('Sorties (outcome)', `Transferts sortants (${S.outcome.SEND.n})`, eur(S.outcome.SEND.eur) + (S.outcome.SEND.unknown ? ` + ${S.outcome.SEND.unknown} sans cours` : ''), S.outcome.SEND.eur);
    for (const c of S.closing) add(`Soldes au ${new Date(S.closingDate).toLocaleDateString('fr-FR')}`, `${num(c.qty)} ${c.asset}`, c.eur == null ? 'cours inconnu' : (c.est ? '≈ ' : '') + eur(c.eur), c.eur);
    add(`Soldes au ${new Date(S.closingDate).toLocaleDateString('fr-FR')}`, 'Valeur totale', eur(S.closingTotal), S.closingTotal);
    return R;
  }
  function summaryHtml(S) {
    const R = summaryRows(S); let h = '<div class="summary"><h4>Synthèse ' + S.year + '</h4>', sec = '';
    for (const [s, l, v] of R) { if (s !== sec) { h += (sec ? '</dl>' : '') + `<h5>${esc(s)}</h5><dl>`; sec = s; } h += `<dt>${esc(l)}</dt><dd>${esc(v)}</dd>`; }
    h += '</dl>';
    if (S.estimated || Object.values(S.income).some(g => g.est) || S.closing.some(c => c.est)) h += '<p class="hint">≈ cours estimé (tiré de vos relevés, à vérifier).</p>';
    if (S.incomeUnknown.length) h += `<p class="hint">Revenus sans cours connu : ${[...new Set(S.incomeUnknown)].map(esc).join(', ')} (non valorisés).</p>`;
    return h + '</div>';
  }
  function renderResults() {
    const out = computeWithPrices(); const Y = E.byYear(out);
    let h = '';
    if (!out.cessions.length) h += '<p>Aucune cession imposable (vente contre € ou paiement en crypto).</p>';
    for (const y of Object.values(Y).sort((a, b) => b.year - a.year)) {
      const S = E.summary(txs, out, (a, ts) => priceFn(a, ts), y.year, opening, (a, ts) => !!(livePrice && livePrice.approx && livePrice.approx.has(a + '|' + ts))); lastS[y.year] = S;
      h += `<h3>Année ${y.year} — déclaration ${y.year + 1}</h3>` + summaryHtml(S) + `<h4>Détail par cession</h4><div class="cards">${y.cessions.map((c, i) => `<div class="card${c.status !== 'ok' ? ' badc' : ''}"><h4>Cession ${i + 1} · ${num(c.qty)} ${esc(c.asset)}</h4><dl>${ROWS.map(([l, lab, f]) => `<dt><b>${l}</b> ${lab}</dt><dd>${f(c)}</dd>`).join('')}</dl></div>`).join('')}</div><div class="scroll formwrap"><table class="form"><tr><th>Ligne</th><th></th>${y.cessions.map((c, i) => `<th class="n">Cession ${i + 1}<br><span class="hint">${num(c.qty)} ${esc(c.asset)}</span></th>`).join('')}<th>Formule</th></tr>`;
      for (const [l, lab, f, fo] of ROWS) h += `<tr><td>${l}</td><td>${lab}</td>${y.cessions.map(c => `<td class="n${c.status !== 'ok' && (l === '212' || l === '224') ? ' bad' : ''}">${f(c)}</td>`).join('')}<td class="formula">${fo}</td></tr>`;
      h += '</table></div>';
      for (const c of y.cessions.filter(c => c.status !== 'ok')) {
        if (!c.missing.length) { h += `<div class="note warn">Cession du ${dt(c.date)} : calcul suspendu, une cession antérieure est incomplète (la ligne 221 en dépend).</div>`; continue; }
        h += `<div class="note warn">Cession du ${dt(c.date)} : cours introuvable pour ${c.missing.map(esc).join(', ')}. Renseignez le cours unitaire en € à ce moment : ${c.missing.map(a => `<label>${esc(a)} <input size="8" data-man="${esc(a)}@${c.tx.id}"></label>`).join(' ')} (0 si valeur négligeable) ou la valeur globale (ligne 212) : <input size="10" data-o212="${c.tx.id}"></div>`;
      }
      const ap = (a, c) => livePrice && livePrice.approx && livePrice.approx.has(a + '|' + c.date) ? '≈' : '';
      h += `<details><summary class="hint">Détail de la ligne 212 (≈ = cours tiré de vos relevés à ±30 jours, à vérifier)</summary><p class="hint">${y.cessions.map((c, i) => 'C' + (i + 1) + ' = ' + c.detail212.map(d => d.qty != null ? `${num(d.qty)} ${esc(d.asset)} × ${ap(d.asset, c)}${eur(d.price)}` : esc(d.asset)).join(' + ') + (c.detail212.length ? ` <span class="prec">(${esc(KP.precLabel(KP.cessionPrec(livePrice, c)))})</span>` : '')).join(' ;<br>')}</p></details>`;
      h += `<p>Ligne 51 — total des prix de cession (218) : <b>${eur(y.total218)}</b>${y.exonere ? ' → <b>≤ 305 € : cessions exonérées</b>, pas d’autres lignes à remplir.' : ''}</p>`;
      h += `<p class="total">Ligne 52 — total des plus et moins-values : ${y.incomplete ? '<span class="warn">incomplet (cours à renseigner)</span>' : '<span class="' + (y.total224 >= 0 ? 'pos' : 'neg') + '">' + (y.total224 >= 0 ? '+' : '') + eur(y.total224) + '</span>'}</p>`;
      if (!y.incomplete && !y.exonere) h += `<div class="note">À reporter sur la <b>2042-C</b> : ${y.total224 >= 0 ? `case <b>3AN</b> = ${eur(Math.round(y.total224))}` : `case <b>3BN</b> = ${eur(Math.round(-y.total224))}`}.<br>Indicatif : flat tax = 12,8 % d’impôt + prélèvements sociaux (≈ 30 % au total ; taux des prélèvements sociaux à vérifier pour votre année) → environ ${eur(Math.max(0, y.total224) * 0.30)}. Option barème progressif : case 3CN.</div>`;
    }
    const unv = livePrice && livePrice.unvalued ? [...livePrice.unvalued].filter(x => manual[x] == null && !rewardOnly(x)) : [];
    if (unv.length) h += `<div class="note warn">Aucun cours trouvé pour ${unv.map(esc).join(', ')} : compté 0 € dans la ligne 212 (≈, à vérifier). Cours unitaire en € si vous le connaissez : ${unv.map(x => `<label>${esc(x)} <input size="8" data-man="${esc(x)}"></label>`).join(' ')} — ou relancez le calcul plus tard.</div>`;
    h += cmpBlock(Y);
    h += `<div class="note">🌍 Compte ou plateforme à l’étranger : déclarez chaque compte d’actifs numériques sur le formulaire <b>3916-bis</b> (même sans cession), et les comptes bancaires étrangers sur le 3916.</div>`;
    const W = out.warnings; if (W.length) h += `<details><summary class="warn">⚠️ ${W.length} point(s) à vérifier</summary><ul>${W.map(w => `<li>${dt(w.t.date)} ${esc(w.t.asset)} : ${esc(w.msg)}</li>`).join('')}</ul><p class="hint">Staking, airdrops, intérêts : leur fiscalité est discutée (revenus BNC/BIC à la réception, ou acquisition à 0 € imposée seulement à la cession). Kryptax ne tranche pas : ils sont comptés dans les quantités avec un coût d’acquisition de 0 €. Renseignez-vous ou demandez à un professionnel.</p></details>`;
    const exportsHtml = '<p class="exports"><button id="pdfx" class="btn">Voir le PDF</button> <button id="print" class="ghost" hidden>Imprimer</button></p><p id="pdfmsg" class="note warn pdfmsg" role="status" aria-live="polite" hidden></p>';
    h = '<div id="detail" hidden>' + h + '</div>' + exportsHtml; // détail masqué (gardé pour le code et l'export)
    const X = window.KryptaxExport;
    if (X) {
      const now = new Date().getFullYear(), yrs = X.yearOptions(Y, now); if (!X.selectable(fyear, now)) fyear = X.defaultYear(Y, now);
      const t = X.exportData(Y, {}, () => [], [], fyear).totals[0], yc = (Y[fyear] || { cessions: [] }).cessions;
      const est = new Set(); yc.forEach(c => (c.detail212 || []).forEach(d => { if (livePrice && livePrice.approx && livePrice.approx.has(d.asset + '|' + c.date)) est.add(d.asset); }));
      const AA = KP.alertAssets(txs, yc, livePrice, cache, manual); est.clear(); AA.est.forEach(x => est.add(x)); lastIgn = AA.ign; // récompense sans cours : ignorée à la 212, sans alerte ni relance
      const unk = (livePrice && livePrice.unknown || []).filter(x => manual[x] == null && yc.some(c => (c.detail212 || []).some(d => d.asset === x)));
      const errs = [];
      if (t.incomplete) errs.push('Certains cours sont introuvables : le résultat est incomplet. Relancez le calcul plus tard.');
      else if (est.size) errs.push('Cours estimé (≈) pour ' + [...est].map(esc).join(', ') + ' : vérifiez le montant ou relancez plus tard.');
      const sus = (livePrice && livePrice.suspect || []).filter(x => yc.some(c => (c.detail212 || []).some(d => d.asset === x)));
      const warns = (unk.length ? ['Symbole non identifié, aucun cours demandé : ' + unk.map(esc).join(', ') + '. Saisissez son cours si besoin.'] : []).concat(sus.length ? ['Cours à vérifier pour ' + sus.map(esc).join(', ') + ' : sources de cours divergentes (> 30 %), cours DefiLlama retenu.'] : []);
      lastEst = new Set(AA.retry.filter(x => !unk.includes(x))); /* seulement les échecs transitoires des cryptos qui comptent */ if (t.incomplete) lastEst.add('*'); // symbole non identifié : pas de relance
      const PP = precOf(yc), precH = (PP.n ? `<p class="hint" id="precsum">${esc(precText(PP))}</p>` : '') + (lastIgn.length ? `<p class="hint" id="ignsum">Cours introuvable pour ${lastIgn.map(esc).join(', ')} (récompenses, valeur ignorée à la ligne 212).</p>` : '');
      blockers = pdfBlockers(t, est);
      const sel = `<label class="yearsel">Année <select id="fyear">${yrs.map(y => `<option value="${y}"${y === fyear ? ' selected' : ''}>${y} (déclaration ${y + 1})</option>`).join('')}</select></label>`;
      const tot = t.n ? `<div class="note total-global"><b>Total global plus-value nette ${t.year} : <span class="${t.l224 >= 0 ? 'pos' : 'neg'}">${t.l224 >= 0 ? '+' : ''}${eur(t.l224)}</span></b> (${t.n} cession${t.n > 1 ? 's' : ''})<br>${esc(X.globalText(t))}</div>` : `<div class="note total-global">Aucune cession imposable en ${t.year} : rien à déclarer sur la 2086 pour cette année.</div>`;
      h = '<div class="sechead"><h2>2. Résultat et export</h2>' + sel + '</div>' + (errs.length || !window.__kxDone || !$('#err').hidden ? '' : '<div class="note ok" id="noerr">✅ Aucune erreur</div>') + errs.map(e => `<div class="note warn">${e}${$('#run').hidden ? ' <button class="small ghost" id="rerun">↻ Relancer</button>' : ''}</div>`).join('') + warns.map(e => `<div class="note warn">${e}</div>`).join('') + specialNote(X.special(txs, fyear)) + tot + precH + h;
    }
    $('#results').innerHTML = h; lastOut = out; lastY = Y; pdfState();
  }
  function precOf(yc) { let n = 0, m = 0; const L = (yc || []).map(c => { const p = KP.cessionPrec(livePrice, c); n += p.n; m += p.nMin; return p.n ? KP.precLabel(p) : ''; }); return { L, n, m }; }
  const precText = P => `Cours pris à la minute pour ${P.m} opération${P.m > 1 ? 's' : ''} sur ${P.n} (sinon cours horaire, journalier si le relevé n’a pas l’heure, ou estimé ≈).`;
  function withPrec(x) { const P = precOf((lastY[fyear] || { cessions: [] }).cessions); x.cessions.forEach((c, i) => { c.prec = P.L[i] || ''; }); x.prec = (P.n ? precText(P) : '') + (lastIgn.length ? (P.n ? ' ' : '') + lastIgn.join(', ') + ' : cours introuvable, valeur non incluse (récompenses).' : ''); return x; }
  /* ---------- Blocage du PDF tant qu'une erreur est affichée ---------- */
  let blockers = [], pdfBusy = false;
  // Erreurs bloquantes, une phrase claire par cause ; rerun = le bouton « ↻ Relancer » aide
  function pdfBlockers(t, est) {
    const b = [];
    if (runCtl || !window.__kxDone) b.push({ k: 'calc', msg: 'le calcul est en cours : attendez qu’il se termine.' });
    if (dirty) b.push({ k: 'imports', msg: 'vos imports ont changé : touchez « Valider mes imports » pour recalculer.' });
    if (KP.checkHolders(holders, KP.fileList(txs).map(f => f.name)).status === 'conflict') b.push({ k: 'holders', msg: 'vos relevés semblent appartenir à des personnes différentes : retirez le fichier concerné.' });
    if ($('#err') && !$('#err').hidden) b.push({ k: 'import', msg: 'un fichier n’a pas été lu en entier (format non reconnu ou lignes illisibles) : corrigez ou retirez ce fichier.' });
    if (t && t.incomplete) b.push({ k: 'cours', rerun: true, msg: 'des cours sont introuvables, le résultat est incomplet : relancez le calcul.' });
    else if (est && est.size) b.push({ k: 'estime', rerun: true, msg: 'un cours est seulement estimé (≈) : relancez le calcul ou saisissez le cours.' });
    return b;
  }
  function currentBlockers() { // revérifié au moment du clic (le calcul a pu démarrer depuis l’affichage)
    const b = blockers.filter(x => x.k !== 'calc');
    if (runCtl || !window.__kxDone) b.unshift({ k: 'calc', msg: 'le calcul est en cours : attendez qu’il se termine.' });
    if (!lastY) b.push({ k: 'calc', msg: 'aucun résultat calculé pour l’instant.' });
    return b;
  }
  function pdfState() {
    const btn = $('#pdfx'); if (!btn) return;
    const off = currentBlockers().length > 0;
    btn.classList.toggle('off', off); btn.setAttribute('aria-disabled', off ? 'true' : 'false');
    btn.title = off ? 'Téléchargement impossible tant qu’une erreur est affichée' : '';
    const m = $('#pdfmsg'); if (m && !off) { m.hidden = true; m.innerHTML = ''; }
  }
  function pdfRefused(b) {
    const m = $('#pdfmsg'); if (!m) return;
    const rr = b.some(x => x.rerun) && !runCtl;
    m.innerHTML = '<b>PDF indisponible</b> : corrigez d’abord l’erreur ci-dessus.' + b.map(x => '<br>• ' + esc(x.msg.charAt(0).toUpperCase() + x.msg.slice(1))).join('') + (rr ? ' <button class="small ghost" id="rerun">↻ Relancer</button>' : '');
    m.hidden = false;
  }
  /* ---------- Pub de démonstration avant le PDF (fictive) ---------- */
  const AD_DELAY_S = 6; // durée de la pub avant le PDF, en secondes
  let adDone = false, adTimer = null, adSeen = false; // adSeen : pub vue jusqu’au bout (mémoire seulement, jusqu’au rechargement)
  function openAdGate() {
    const b = currentBlockers(); pdfState();
    if (b.length) { pdfRefused(b); return; }
    const d = $('#adgate'); if (!d) return;
    const img = $('#adgateimg'); if (img && !img.src && window.KryptaxAd) img.src = window.KryptaxAd.img;
    const go = $('#adgatego'), cnt = $('#adgatecount'), bar = $('#adgatebar');
    adDone = false; clearInterval(adTimer);
    go.disabled = true; go.setAttribute('aria-disabled', 'true'); go.textContent = 'Voir mon PDF';
    let left = AD_DELAY_S; const t0 = Date.now();
    const tick = () => {
      left = Math.max(0, AD_DELAY_S - Math.floor((Date.now() - t0) / 1000));
      cnt.textContent = left > 0 ? `Votre PDF sera prêt dans ${left} s` : 'Votre PDF est prêt';
      bar.value = Math.min(AD_DELAY_S, (Date.now() - t0) / 1000);
      if (left <= 0) { clearInterval(adTimer); adDone = true; adSeen = true; go.disabled = false; go.setAttribute('aria-disabled', 'false'); go.focus(); }
    };
    bar.max = AD_DELAY_S; tick(); adTimer = setInterval(tick, 200);
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    $('#adgateclose').focus();
  }
  function closeAdGate() { clearInterval(adTimer); adDone = false; const d = $('#adgate'); if (d && d.open) { if (d.close) d.close(); else d.removeAttribute('open'); } const p = $('#pdfx'); if (p) p.focus(); }
  { const d = $('#adgate');
    if (d) {
      d.addEventListener('close', () => { clearInterval(adTimer); adDone = false; });
      $('#adgateclose').onclick = closeAdGate;
      $('#adgatego').onclick = () => { if (!adDone) return; if (downloadPdf()) closeAdGate(); };
    } }
  /* Aperçu : pages rendues en images (pdf.js local, fonctionne sur iOS/Android), puis « Enregistrer le PDF ». */
  let pvUrl = null, pvBlob = null, pvName = '';
  async function showPdf(blob, name) {
    const d = $('#pdfview'), box = $('#pvpages'); if (pvUrl) URL.revokeObjectURL(pvUrl);
    pvBlob = blob; pvName = name; pvUrl = URL.createObjectURL(blob); $('#pvopen').href = pvUrl;
    box.innerHTML = '<p class="hint">Préparation de l’aperçu…</p>'; box.setAttribute('aria-busy', 'true');
    if (d.showModal) d.showModal(); else d.setAttribute('open', ''); $('#pvsave').focus();
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise; box.innerHTML = '';
      const w = Math.max(320, box.clientWidth || 340), dpr = Math.min(3, window.devicePixelRatio || 1);
      for (let i = 1; i <= doc.numPages; i++) {
        const pg = await doc.getPage(i), v0 = pg.getViewport({ scale: 1 }), v = pg.getViewport({ scale: Math.max(w * dpr / v0.width, 1.5) });
        const c = document.createElement('canvas'); c.width = Math.ceil(v.width); c.height = Math.ceil(v.height); c.setAttribute('role', 'img'); c.setAttribute('aria-label', 'Page ' + i + ' du PDF');
        box.appendChild(c); await pg.render({ canvasContext: c.getContext('2d'), viewport: v }).promise;
      }
    } catch (e) { box.innerHTML = '<p class="hint">Aperçu indisponible sur cet appareil : utilisez « Ouvrir dans le navigateur » ou « Enregistrer le PDF ».</p>'; }
    box.setAttribute('aria-busy', 'false');
  }
  function savePdf() {
    if (!pvBlob) return;
    const f = typeof File === 'function' ? new File([pvBlob], pvName, { type: 'application/pdf' }) : null;
    if (f && navigator.canShare && navigator.canShare({ files: [f] }) && /iPhone|iPad|iPod/.test(navigator.userAgent)) { navigator.share({ files: [f], title: pvName }).catch(() => {}); return; } // iOS : « Enregistrer dans Fichiers »
    const a = document.createElement('a'); a.href = pvUrl; a.download = pvName; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 1000); window.__kxPdfSaved = (window.__kxPdfSaved || 0) + 1;
  }
  { const d = $('#pdfview'); if (d) { $('#pvsave').onclick = savePdf; $('#pvclose').onclick = () => { if (d.close) d.close(); else d.removeAttribute('open'); const p = $('#pdfx'); if (p) p.focus(); }; } }
  // Seul point de génération du PDF : refuse s’il reste une erreur, si la pub n’est pas finie, et ignore un double clic
  function downloadPdf() {
    const b = currentBlockers(); pdfState();
    if (b.length) { pdfRefused(b); return false; }
    if (!adDone) return false;
    if (pdfBusy) return false; pdfBusy = true; setTimeout(() => { pdfBusy = false; }, 1500);
    const X = window.KryptaxExport, data = withPrec(X.exportData(lastY, lastS, summaryRows, txs, fyear)), stamp = fyear + '-decl' + (fyear + 1);
    try { showPdf(X.makePdf(window.jspdf.jsPDF, data, X.title(fyear)).output('blob'), `kryptax-2086-${stamp}.pdf`); window.__kxPdfCount = (window.__kxPdfCount || 0) + 1; return true; }
    catch (err) { const m = $('#pdfmsg'); if (m) { m.textContent = 'Export impossible, réessayez.'; m.hidden = false; } return false; }
  }
  { const hb = $('#helpbtn'), hp = $('#helppanel'); if (hb && hp) hb.addEventListener('click', () => { const op = hp.hidden; hp.hidden = !op; hb.setAttribute('aria-expanded', String(op)); if (op) hp.scrollIntoView({ block: 'nearest' }); }); }
  // Opérations particulières (staking, airdrop…) : un seul message replié, discret, jamais bloquant
  function specialNote(sp) {
    if (!sp || (!sp.n && !sp.pay)) return '';
    const ex = sp.cats.filter(x => x.key !== 'paiements'), pl = (n, s, p) => n + ' ' + (n > 1 ? p : s);
    const head = sp.n ? `ℹ️ ${pl(sp.n, 'opération particulière détectée', 'opérations particulières détectées')} (${ex.slice(0, 2).map(x => x.label.split(' ')[0]).join(', ')}${ex.length > 2 ? '…' : ''}) : non ${sp.n > 1 ? 'traitées' : 'traitée'} comme des cessions. Voir le PDF`
      : `ℹ️ ${pl(sp.pay, 'paiement en crypto détecté', 'paiements en crypto détectés')} : à vérifier. Voir le PDF`;
    const li = sp.cats.map(x => `<li>${esc(x.label[0].toUpperCase() + x.label.slice(1))} : ${x.n}${x.key === 'paiements' ? ' — compté comme une vente, à vérifier' : ''}</li>`).join('');
    return `<details class="note spec" id="special"><summary>${esc(head)}</summary><ul>${li}</ul><p>Kryptax ne calcule pas leur imposition propre (revenus, etc.).</p></details>`;
  }
  let lastOut = null, lastY = null, fyear = null;
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
    return E.compute(withOverride, (a, ts) => priceFn(a, ts, byTs[ts]), opening);
  }
  $('#results').addEventListener('change', e => {
    if (e.target.id === 'fyear') { cancelAuto(); fyear = +e.target.value; if (scopedYear != null && fyear > scopedYear && !runCtl) { $('#run').click(); return; } renderResults(); return; }
    if (e.target.id === 'cmpfile') { e.target.files[0].text().then(t => { parseCSV(t).forEach(r => { const y = parseInt(r[0]); if (y > 2000) { const p = E.parseNum(r[1]), pv = E.parseNum(r[2]); if (isFinite(p)) manual['cmpP@' + y] = p; if (isFinite(pv)) manual['cmpPV@' + y] = pv; } }); save(); renderResults(); }); return; }
    const k = e.target.dataset.cmp; if (k) { const v = E.parseNum(e.target.value); if (isFinite(v)) manual[k] = v; else delete manual[k]; save(); renderResults(); return; }
    const m = e.target.dataset.man, o = e.target.dataset.o212, v = E.parseNum(e.target.value);
    if (m) { if (v >= 0) manual[m] = v; else delete manual[m]; }
    if (o) { if (v > 0) manual['212@' + o] = v; else delete manual['212@' + o]; }
    save(); renderResults();
  });
  $('#results').addEventListener('click', e => {
    if (e.target.id === 'print') window.print();
    if (e.target.id === 'rerun') $('#run').click();
    if (e.target.id === 'pdfx') { if (adSeen) { adDone = true; downloadPdf(); adDone = false; } else openAdGate(); }
  });

  /* ---------- Exemple fictif ---------- */
  txs.forEach(t => t._in = 1); dirty = txs.length > 0; renderTx();
})();
