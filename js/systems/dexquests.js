/* ============ dexquests.js — retos de cada Pokémon (ficha del Pokédex) ============
 * Cada Pokémon tiene 3 retos que se cumplen jugando CON ÉL (el que eliges al empezar,
 * aunque evolucione en la partida):
 *   1. Derrota a 1.000 Pokémon (sumando partidas)   -> 300 monedas y 2 tickets
 *   2. Aguanta 10:00 en una partida                  -> 500 monedas y 1 ticket ×10
 *   3. Derrota a 10 jefes (sumando partidas)         -> 800 monedas y 1 ticket ×10
 * Con los 3 recogidos: su versión shiny (si no la tenías) o 2.000 monedas, y la
 * medalla de maestro en la ficha.
 * Guardado: save.dexq[dex] = { k, b, t, c }  (c = bits de lo recogido; 8 = premio final)
 */
G.DexQuests = (() => {
  const QUESTS = [
    { key: 'k', goal: 1000, text: 'Derrota a {x} Pokémon con él', reward: { coins: 300, t1: 2 } },
    { key: 't', goal: 600, text: 'Aguanta {x} en una partida con él', time: true, reward: { coins: 500, t10: 1 } },
    { key: 'b', goal: 10, text: 'Derrota a {x} jefes con él', reward: { coins: 800, t10: 1 } }
  ];
  const FINAL = 8;

  function rec(dex) {
    const s = G.DB.save;
    s.dexq = s.dexq || {};
    return s.dexq[dex] = s.dexq[dex] || { k: 0, b: 0, t: 0, c: 0 };
  }

  /** Al acabar una partida: suma lo hecho con el Pokémon con el que empezaste. */
  function afterRun(dex, r) {
    if (!G.DB.save || !dex) return;
    const q = rec(dex);
    q.k += r.kills | 0; q.b += r.bosses | 0; q.t = Math.max(q.t, Math.floor(r.time));
    G.DB.commit();
  }

  const done = (q, i) => (q[QUESTS[i].key] || 0) >= QUESTS[i].goal;
  const claimed = (q, bit) => !!(q.c & bit);

  /** Premios por recoger de un Pokémon (o de todos si no se dice). */
  function pending(dex) {
    const s = G.DB.save;
    if (!s || !s.dexq) return 0;
    const one = d => { const q = s.dexq[d]; if (!q) return 0;
      let n = 0; QUESTS.forEach((_, i) => { if (done(q, i) && !claimed(q, 1 << i)) n++; });
      if (QUESTS.every((_, i) => claimed(q, 1 << i)) && !claimed(q, FINAL)) n++;
      return n; };
    if (dex != null) return one(dex);
    return Object.keys(s.dexq).reduce((a, d) => a + one(d), 0);
  }

  function give(rw) {
    const s = G.DB.save;
    s.tickets = s.tickets || { t1: 0, t10: 0 };
    if (rw.coins) s.coins += rw.coins;
    if (rw.t1) s.tickets.t1 += rw.t1;
    if (rw.t10) s.tickets.t10 += rw.t10;
  }
  const rwText = rw => [rw.coins ? rw.coins + ' ' + G.T('monedas') : '', rw.t1 ? rw.t1 + ' ' + G.T('tickets') : '', rw.t10 ? rw.t10 + ' ' + G.T('ticket ×10') : '']
    .filter(Boolean).join(' + ');

  function claim(dex, i) {
    const q = rec(dex);
    if (i === 'final') {
      if (claimed(q, FINAL) || !QUESTS.every((_, j) => claimed(q, 1 << j))) return;
      q.c |= FINAL;
      if (G.Sprites.hasShiny(dex) && !G.DB.ownsShiny(dex)) {
        G.DB.grantShiny(dex, 'quest');
        G.UI.toast(G.I18n.f('¡{x} shiny es tuyo!', G.T(G.DEX_BY[dex].name)), 3200);
      } else { give({ coins: 2000 }); G.UI.toast(G.T('+2.000 monedas'), 2400); }
      G.Audio.sfx('shinyGet');
    } else {
      if (!done(q, i) || claimed(q, 1 << i)) return;
      q.c |= 1 << i;
      give(QUESTS[i].reward);
      G.UI.toast(rwText(QUESTS[i].reward), 2400);
      G.Audio.sfx('coin');
    }
    G.DB.commit();
    if (G.UI.refreshCoins) G.UI.refreshCoins();
  }

  /** HTML para la ficha del Pokédex (sólo si lo tienes). */
  function html(dex) {
    const q = (G.DB.save.dexq || {})[dex] || { k: 0, b: 0, t: 0, c: 0 };
    const master = claimed(q, FINAL);
    const rows = QUESTS.map((Q, i) => {
      const v = Math.min(q[Q.key] || 0, Q.goal), ok = done(q, i), got = claimed(q, 1 << i);
      const goalTxt = Q.time ? G.U.mmss(Q.goal) : Q.goal.toLocaleString('es');
      const vTxt = Q.time ? G.U.mmss(v) : v.toLocaleString('es');
      return `<div class="dq-row" style="display:flex;align-items:center;gap:8px;margin:5px 0;font-size:13px">
        <div class="grow" style="flex:1"><div>${G.I18n.f(Q.text, goalTxt)}</div>
          <div class="bar" style="height:6px;background:#0006;border-radius:3px;margin-top:3px"><i style="display:block;height:100%;border-radius:3px;width:${v / Q.goal * 100}%;background:${ok ? '#ffd23f' : '#4fb4ff'}"></i></div>
          <small style="color:var(--muted)">${vTxt} / ${goalTxt} · ${rwText(Q.reward)}</small></div>
        ${got ? `<span class="gold">✔</span>` : `<button class="btn small ${ok ? 'gold' : ''}" data-dq="${i}" ${ok ? '' : 'disabled'}>${G.T('Recoger')}</button>`}
      </div>`;
    }).join('');
    const allGot = QUESTS.every((_, i) => claimed(q, 1 << i));
    const finalRw = G.Sprites.hasShiny(dex) && !G.DB.ownsShiny(dex) ? G.T('Su versión shiny') : G.T('2.000 monedas');
    return `<div class="panel" style="padding:8px 10px;margin-top:10px;text-align:left">
      <b>${G.T('Retos de este Pokémon')}</b> ${master ? `<span class="gold">🏅 ${G.T('Maestro')}</span>` : ''}
      ${rows}
      <div style="display:flex;align-items:center;gap:8px;font-size:13px;margin-top:4px">
        <div style="flex:1">${G.T('Premio final (los 3 recogidos)')}: <b class="gold">${finalRw}</b></div>
        ${master ? `<span class="gold">✔</span>` : `<button class="btn small ${allGot ? 'gold' : ''}" data-dq="final" ${allGot ? '' : 'disabled'}>${G.T('Recoger')}</button>`}
      </div></div>`;
  }

  /** Engancha los botones de recoger (tras pintar html()). */
  function wire(box, dex, refresh) {
    box.querySelectorAll('[data-dq]').forEach(b => {
      b.onclick = () => { claim(dex, b.dataset.dq === 'final' ? 'final' : +b.dataset.dq); refresh(); };
    });
  }

  /** Une dos partidas guardadas (lo mayor de cada cosa). */
  function merge(r, older) {
    if (!older.dexq) return;
    r.dexq = r.dexq || {};
    for (const d in older.dexq) {
      const a = r.dexq[d] = r.dexq[d] || { k: 0, b: 0, t: 0, c: 0 }, o = older.dexq[d];
      a.k = Math.max(a.k || 0, o.k || 0); a.b = Math.max(a.b || 0, o.b || 0); a.t = Math.max(a.t || 0, o.t || 0); a.c = (a.c || 0) | (o.c || 0);
    }
  }

  return { afterRun, pending, html, wire, merge, claim, QUESTS };
})();
