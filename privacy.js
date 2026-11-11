/* Kryptax — v2.64 : option « Ne rien mémoriser » et bouton « Effacer mes données » (6 pays, FR / EN / DE).
   Option active : localStorage et sessionStorage sont remplacés, pour la session, par une mémoire vive (rien n'est écrit sur le disque) ;
   indexedDB est masqué. Seule la préférence « kx-nostore » reste écrite dans le vrai localStorage.
   Chargé AVANT tous les autres scripts : les modules lisent/écrivent sans le savoir dans la mémoire vive. Aucun calcul n'est touché. */
(function (W) {
  'use strict';
  const PREF = 'kx-nostore', OURS = k => typeof k === 'string' && (k.startsWith('kryptax.') || k.startsWith('kx-')) && k !== PREF;
  let real = null; try { real = W.localStorage; } catch (e) {}
  const rget = k => { try { return real ? real.getItem(k) : null; } catch (e) { return null; } };
  const active = rget(PREF) === '1';
  function memStorage(seed) {
    const m = new Map(seed || []);
    const api = { getItem: k => m.has(String(k)) ? m.get(String(k)) : null, setItem: (k, v) => { m.set(String(k), String(v)); }, removeItem: k => { m.delete(String(k)); },
      clear: () => m.clear(), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
    return new Proxy(api, { ownKeys: () => [...m.keys()], getOwnPropertyDescriptor: (t, k) => m.has(k) ? { value: m.get(k), enumerable: true, configurable: true } : Object.getOwnPropertyDescriptor(t, k),
      get: (t, k) => k in t ? t[k] : m.has(k) ? m.get(k) : undefined, set: (t, k, v) => { if (k in t) return false; m.set(String(k), String(v)); return true; }, has: (t, k) => k in t || m.has(k) });
  }
  let mem = null;
  if (active) {
    const seed = []; try { for (let i = 0; i < real.length; i++) { const k = real.key(i); if (OURS(k)) seed.push([k, real.getItem(k)]); } } catch (e) {}
    mem = memStorage(seed);
    const def = (n, v) => { try { Object.defineProperty(W, n, { value: v, configurable: true, writable: false }); } catch (e) {} };
    def('localStorage', mem); def('sessionStorage', memStorage()); def('indexedDB', undefined);
  }
  /* Liste des clés Kryptax du stockage réel (jamais celles d'autres sites du même domaine). */
  const ourKeys = st => { const L = []; try { for (let i = 0; i < st.length; i++) { const k = st.key(i); if (OURS(k)) L.push(k); } } catch (e) {} return L; };
  function purgeReal() { if (!real) return 0; const L = ourKeys(real); L.forEach(k => { try { real.removeItem(k); } catch (e) {} }); try { const s = W.sessionStorage; ourKeys(s).forEach(k => s.removeItem(k)); } catch (e) {} return L.length; }
  const TX = {
    fr: { opt: 'Ne rien mémoriser', clr: 'Effacer mes données', on: 'Rien n’est enregistré dans ce navigateur (tout disparaît en fermant la page).',
      ask: 'Ne plus rien mémoriser dans ce navigateur ?\n\nOK : effacer aussi les données déjà enregistrées (imports, choix, cours, préférences).\nAnnuler : les garder (elles restent lisibles, rien de nouveau n’est écrit).',
      ask0: 'Activer « Ne rien mémoriser » ? La page va se recharger.', off: 'Mémoriser à nouveau dans ce navigateur ? Les données de cette session seront enregistrées. La page va se recharger.',
      sure: 'Effacer toutes les données Kryptax de ce navigateur (imports, choix, cours, préférences) ? La page va se recharger.' },
    en: { opt: 'Don’t remember anything', clr: 'Clear my data', on: 'Nothing is saved in this browser (everything is gone when you close the page).',
      ask: 'Stop remembering anything in this browser?\n\nOK: also delete the data already saved (imports, choices, prices, preferences).\nCancel: keep it (still readable, nothing new is written).',
      ask0: 'Turn on “Don’t remember anything”? The page will reload.', off: 'Remember again in this browser? This session’s data will be saved. The page will reload.',
      sure: 'Delete all Kryptax data from this browser (imports, choices, prices, preferences)? The page will reload.' },
    de: { opt: 'Nichts speichern', clr: 'Meine Daten löschen', on: 'In diesem Browser wird nichts gespeichert (alles verschwindet beim Schließen der Seite).',
      ask: 'In diesem Browser nichts mehr speichern?\n\nOK: auch bereits gespeicherte Daten löschen (Importe, Auswahlen, Kurse, Einstellungen).\nAbbrechen: behalten (weiter lesbar, nichts Neues wird geschrieben).',
      ask0: '„Nichts speichern“ einschalten? Die Seite wird neu geladen.', off: 'Wieder in diesem Browser speichern? Die Daten dieser Sitzung werden gespeichert. Die Seite wird neu geladen.',
      sure: 'Alle Kryptax-Daten in diesem Browser löschen (Importe, Auswahlen, Kurse, Einstellungen)? Die Seite wird neu geladen.' } };
  const lang = () => { const l = (W.document.documentElement.lang || 'fr').slice(0, 2); return TX[l] ? l : 'fr'; }, T = k => TX[lang()][k];
  const reload = () => { try { W.location.reload(); } catch (e) {} };
  function enable() { const had = ourKeys(real).length; if (had) { const purge = W.confirm(T('ask')); if (purge) purgeReal(); } else if (!W.confirm(T('ask0'))) return false;
    try { real.setItem(PREF, '1'); } catch (e) {} reload(); return true; }
  function disable() { if (!W.confirm(T('off'))) return false; try { real.removeItem(PREF); if (mem) for (const k of Object.keys(mem)) real.setItem(k, mem.getItem(k)); } catch (e) {} reload(); return true; }
  function clearAll() { if (!W.confirm(T('sure'))) return false; purgeReal(); if (mem) mem.clear(); reload(); return true; }
  function draw() { const b = W.document.getElementById('kxpriv'); if (!b) return; const c = b.querySelector('#kxnostore');
    b.querySelector('.kxpo').textContent = T('opt'); b.querySelector('#kxclear').textContent = T('clr'); c.checked = active; const n = b.querySelector('.kxpn'); n.hidden = !active; n.textContent = T('on'); }
  function mount() { const d = W.document; if (d.getElementById('kxpriv')) return; const h = d.querySelector('header'); if (!h) return;
    const b = d.createElement('div'); b.id = 'kxpriv'; b.className = 'kxpriv';
    b.innerHTML = '<label><input type="checkbox" id="kxnostore"> <span class="kxpo"></span></label> <button type="button" id="kxclear" class="small ghost"></button> <span class="kxpn hint" role="status"></span>';
    h.appendChild(b); b.querySelector('#kxnostore').addEventListener('change', e => { const ok = e.target.checked ? enable() : disable(); if (!ok) e.target.checked = active; });
    b.querySelector('#kxclear').addEventListener('click', clearAll); draw();
    try { new W.MutationObserver(draw).observe(d.documentElement, { attributes: true, attributeFilter: ['lang'] }); } catch (e) {} }
  if (W.document.readyState === 'loading') W.document.addEventListener('DOMContentLoaded', mount); else mount();
  W.KryptaxPrivacy = { active: () => active, enable, disable, clearAll, purgeReal, ourKeys, PREF, TX, mount };
})(window);
