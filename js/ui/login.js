/* ============ login.js — inicio ============
 * Con la nube: elegir "Jugar como invitado" (partida en el navegador, se puede
 * vincular Google más tarde) o "Entrar con Google". Sin nube no se ve (se entra directo).
 */
G.LoginUI = (() => {
  const $ = G.UI.$;
  let mode = 'login';

  function init() {
    document.querySelectorAll('#scr-login .tab').forEach(t => {
      t.onclick = () => setMode(t.dataset.tab);
    });
    $('login-form').onsubmit = async e => {
      e.preventDefault();
      $('login-err').textContent = '';
      $('btn-auth').disabled = true;
      const fn = mode === 'login' ? G.DB.login : G.DB.register;
      const r = await fn($('f-user').value, $('f-pass').value);
      $('btn-auth').disabled = false;
      if (!r.ok) { $('login-err').textContent = r.error; return; }
      $('f-pass').value = '';
      // La partida que tenías sin cuenta en este navegador pasa a tu cuenta nueva.
      if (G.DB.adoptLocal()) G.UI.toast('Tu progreso de este dispositivo se ha pasado a tu cuenta', 4000);
      G.Flow.afterLogin();
    };
    $('btn-google').onclick = () => G.AccountUI.bind();
    $('btn-guest').onclick = () => { G.DB.chooseGuest(); if (G.DB.autoLocal()) G.Flow.afterLogin(); };
  }

  /** Explica dónde se guarda la partida según el modo de la base de datos. */
  function modeNote() {
    if (G.DB.mode === 'cloud') return 'Como invitado, tu progreso se guarda sólo en este dispositivo (puedes vincular Google más tarde). Con Google se guarda en la nube y lo recuperas en cualquier dispositivo.';
    const why = G.DB.localReason === 'file'
      ? 'Abierto desde un archivo: la partida sólo se guarda en este navegador. Para guardar en la nube, juega en la versión publicada.'
      : G.DB.localReason === 'config'
        ? 'Nube sin configurar: la partida sólo se guarda en este navegador.'
        : 'No se pudo conectar con la nube: la partida sólo se guarda en este navegador.';
    return why;
  }

  function setMode(m) {
    mode = m;
    document.querySelectorAll('#scr-login .tab').forEach(t => t.classList.toggle('on', t.dataset.tab === m));
    $('btn-auth').textContent = m === 'login' ? 'Entrar' : 'Crear cuenta';
    $('f-pass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
    $('login-err').textContent = '';
    // Sólo se pregunta si quedan plazas al ir a crear cuenta (cada llamada al Worker cuenta).
    if (m === 'register' && G.DB.mode === 'cloud' && G.Signups) G.Signups.check().then(applySignups);
  }

  /** Tope de cuentas del mes alcanzado: sin "Crear cuenta" hasta el mes siguiente. */
  function applySignups(open) {
    const reg = document.querySelector('#scr-login .tab[data-tab="register"]');
    if (reg) reg.classList.toggle('hidden', !open);
    if (!open && mode === 'register') setMode('login');
    const note = $('signup-closed');
    note.classList.toggle('hidden', open);
    if (!open) note.textContent = 'Este mes se han llenado las plazas de cuentas nuevas: vuelven el 1 de ' + G.Signups.nextMonthName() +
      '. Si ya tienes cuenta, entra normal. Si no, juega como invitado.';
    $('btn-google').textContent = open ? 'Entrar con Google' : 'Entrar con Google (si ya tienes cuenta)';
  }

  function open() {
    G.UI.chrome(false);
    G.UI.show('scr-login');
    // Abiertas: no se pregunta hasta ir a "Crear cuenta". Cerradas (con la pestaña
    // escondida): se vuelve a preguntar (va con caché de 30 min) para reabrir a tiempo.
    if (G.DB.mode === 'cloud' && G.Signups) {
      if (G.Signups.closed) G.Signups.check().then(applySignups); else applySignups(true);
    }
    // Primera visita (sin cuentas en este navegador): directamente a crear cuenta.
    let hasAccounts = false;
    try { hasAccounts = Object.keys(JSON.parse(localStorage.getItem('ps.accounts') || '{}')).length > 0; } catch (e) { /* nada */ }
    setMode(hasAccounts ? 'login' : 'register');
    if (!G.DB.storageOk) $('login-err').textContent = 'Este navegador no deja guardar datos (¿modo incógnito?): abre el juego en una ventana normal.';
    // Con nube: sólo los dos botones (invitado / Google), sin nombre y contraseña.
    const choice = G.DB.mode === 'cloud';
    document.querySelector('#scr-login .tabs').classList.toggle('hidden', choice);
    $('login-form').classList.toggle('hidden', choice);
    $('btn-google').classList.toggle('hidden', !choice);
    $('guest-row').classList.toggle('hidden', !choice);
    $('login-mode').textContent = modeNote();
    setTimeout(() => $('f-user').focus(), 50);
  }

  return { init, open };
})();
