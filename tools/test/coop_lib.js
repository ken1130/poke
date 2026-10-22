/*
 * coop_lib.js — dos pestañas en grupo SIN Firebase, para pruebas (2026-10-22: antes vivía en scratchpad y se perdió).
 *
 * La base de datos en tiempo real (sólo la usa net.js: la cola rooms/{sala}/q/{uid} para las señales WebRTC y el relé)
 * se sustituye por un BroadcastChannel: las dos pestañas tienen que estar en el MISMO browser context
 * (KNOWN-FAILURES #50). El WebRTC es el de verdad (en local conecta directo).
 *
 *   const L = require('./coop_lib.js');
 *   const b = await L.chromium.launch({ executablePath: L.CHROME });
 *   const ctx = await b.newContext(); const errs = [];
 *   const host = await L.page(ctx, 'H', 25, errs), cli = await L.page(ctx, 'C', 4, errs);
 *   await L.connect(host, cli);                       // → 'direct'
 *   await L.start(host, cli, { members: [...], mods: { ch: 'guard' } });
 *
 * Entorno: PW (playwright-core), CHROME, URL (por defecto http://localhost:8765/dev.html?dev).
 */
const PW = process.env.PW || '/home/user/resume/film/node_modules/playwright-core';
const { chromium } = require(PW);
const CHROME = process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const URL = process.env.URL || 'http://localhost:8765/dev.html?dev';

/** Firebase falso: sólo lo que usan net.js y social.js de la RTDB, más un uid. */
function installFake(uid) {
  const ch = new BroadcastChannel('fake-rtdb');
  const subs = new Map();                               // ruta -> [cb]
  const snap = (path, key, val) => ({ key, val: () => val, ref: { remove: () => Promise.resolve() } });
  ch.onmessage = e => {
    const { path, key, val } = e.data || {};
    for (const cb of subs.get(path) || []) { try { cb(snap(path, key, val)); } catch (err) { console.error(err); } }
  };
  let n = 0;
  const ref = path => ({
    on(ev, cb) { if (ev === 'child_added') { if (!subs.has(path)) subs.set(path, []); subs.get(path).push(cb); } return cb; },
    off() { subs.delete(path); },
    push(val) {
      const key = uid + '-' + (n++);
      // a las demás pestañas y, si alguien de ésta escucha la misma ruta, también aquí
      ch.postMessage({ path, key, val });
      for (const cb of subs.get(path) || []) setTimeout(() => cb(snap(path, key, val)), 0);
      return Promise.resolve({ key });
    },
    set() { return Promise.resolve(); }, update() { return Promise.resolve(); }, remove() { return Promise.resolve(); },
    once() { return Promise.resolve({ val: () => null, exists: () => false }); },
    child(k) { return ref(path + '/' + k); }, onDisconnect() { return { remove: () => Promise.resolve(), set: () => Promise.resolve(), update: () => Promise.resolve() }; }
  });
  const fake = { uid, rtdb: { ref }, fs: null, emulator: false,
                 auth: { currentUser: { uid, getIdToken: async () => 'test' } } };
  Object.defineProperty(G.DB, 'fb', { configurable: true, get: () => fake });
}

async function page(ctx, uid, dex, errs = []) {
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(uid + ': ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(uid + ' console: ' + m.text().slice(0, 160)); });
  await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(2500);
  await p.evaluate(([uid, dex, src]) => {
    document.querySelectorAll('#splash,#tap-start').forEach(e => e.remove());
    G.DB.autoLocal && G.DB.autoLocal();
    G.DB.save.owned[dex] = 1; G.DB.save.partner = dex; G.DB.save.autoPick = 'all';
    G.UI.hideAll();
    (0, eval)(src)(uid);
  }, [uid, dex, '(' + installFake.toString() + ')']);
  return p;
}

/** Sala 'TEST': el primero anfitrión. Devuelve el modo de la conexión ('direct' / 'relay' / ...). */
async function connect(host, cli) {
  await host.evaluate(() => G.Net.open('TEST', true, 'H'));
  await cli.evaluate(() => G.Net.open('TEST', false, 'H'));
  await host.evaluate(() => G.Net.syncMembers(['H', 'C']));
  for (let i = 0; i < 40; i++) {
    const m = await host.evaluate(() => G.Net.mode('C'));
    if (m === 'direct' || m === 'relay' || m === 'failed') return m;
    await host.waitForTimeout(250);
  }
  return host.evaluate(() => G.Net.mode('C'));
}

/** Empieza la partida en las dos (como el 'start' de la sala) y elige la bendición inicial. */
async function start(host, cli, cfgExtra = {}) {
  const cfg = Object.assign({ seed: 4242, host: 'H', members: [{ uid: 'H', name: 'Anfitrion', dex: 25 }, { uid: 'C', name: 'Invitado', dex: 4 }] }, cfgExtra);
  await Promise.all([host, cli].map(p => p.evaluate(c => { G.Game.startRun(c); }, cfg)));
  await host.waitForTimeout(1500);
  for (let k = 0; k < 6; k++) {
    for (const p of [host, cli]) await p.evaluate(() => { if (G.UI.isOpen('scr-boon')) G.Boons.pick(0); });
    await host.waitForTimeout(250);
  }
}

module.exports = { chromium, CHROME, URL, page, connect, start };
