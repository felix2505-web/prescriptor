/* =====================================================================
   Asistente IA del Prescriptor NDVI · ventana de chat
   ---------------------------------------------------------------------
   ÚNICA LÍNEA QUE DEBES CAMBIAR: la dirección de tu backend publicado.
   Ejemplo: const API_URL = 'https://api.miprescriptor.cl';
   ===================================================================== */
const API_URL = '';

(() => {
  if (window.PrescriptorAsistente) return; // ya cargado

  const api = (window.PRESCRIPTOR_API || API_URL || '').replace(/\/+$/, '');
  const TOKEN_KEY = 'prescriptor-asistente-token';
  const SCREEN_KEY = 'prescriptor-asistente-pantalla';
  const SUGERENCIAS = [
    '¿Qué lotes tengo y cuándo fue su último vuelo?',
    'Explícame el NDVI de mi último vuelo',
    '¿Cuánto producto necesito para mi última prescripción?',
    '¿Qué puede causar un NDVI bajo en una zona?',
  ];

  // ---------- Almacenamiento seguro ----------
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {} },
  };

  // ---------- Estado ----------
  const st = {
    token: store.get(TOKEN_KEY),
    user: null,
    conv: null,          // id de la conversación actual
    msgs: [],            // [{rol, texto}]
    busy: false,
    view: 'chat',        // chat | login | historial | config
    quota: null,         // {usadas_hoy, limite_diario, activo}
    screen: store.get(SCREEN_KEY) !== '0',
  };

  // ---------- Íconos ----------
  const I = {
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/><path d="M8.5 10.5h7M8.5 14h4"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    hist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    leaf: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M20 9c6 3.2 8.4 8.4 6.8 14.2C25 29 20 31 20 31s-5-2-6.8-7.8C11.6 17.4 14 12.2 20 9Z" fill="currentColor" fill-opacity=".18"/><path d="M20 12v19M20 17l3.6-2.6M20 22l-3.8-2.8M20 26.5l3.4-2.4" stroke-width="1.5"/></svg>',
  };

  // ---------- Estilos (aislados en Shadow DOM) ----------
  const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .wrap { --bg:#eef2f7; --card:#fff; --ink:#1a1b23; --muted:#5e6e82; --line:#d5dde6; --a1:#1e88ff; --a2:#d4267f; --a3:#2ee8c0; --err:#c62839; --ok:#1f8a4c;
    font-family: "Montserrat","Segoe UI",system-ui,sans-serif; color: var(--ink); font-size: 14px; line-height: 1.45; }
  button { font: inherit; cursor: pointer; }
  .fab { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; display: flex; align-items: center; gap: 8px;
    border: 0; border-radius: 999px; padding: 12px 18px 12px 14px; color: #fff; font-weight: 700; font-size: 13px; letter-spacing: .04em;
    background: linear-gradient(90deg,#0f5fe0,var(--a1) 60%,#35c6f4); box-shadow: 0 10px 26px rgba(30,136,255,.35); }
  .fab svg { width: 22px; height: 22px; }
  .fab:hover { filter: brightness(1.06); }
  .fab:focus-visible, .ib:focus-visible, .send:focus-visible, .chip:focus-visible { outline: 3px solid rgba(30,136,255,.45); outline-offset: 2px; }
  .panel { position: fixed; right: 20px; bottom: 20px; z-index: 2147483001; width: 400px; height: min(620px, calc(100vh - 40px));
    background: var(--card); border-radius: 18px; box-shadow: 0 22px 60px rgba(31,59,87,.28); display: flex; flex-direction: column; overflow: hidden; }
  .panel[hidden], .fab[hidden], .ib[hidden], .foot[hidden] { display: none; }
  .top { background: var(--ink); color: #fff; padding: 14px 12px 14px 16px; display: flex; align-items: center; gap: 10px; position: relative; flex: none; }
  .top::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: linear-gradient(90deg,var(--a1),var(--a2),var(--a3)); }
  .top .logo { width: 30px; height: 30px; color: #35c6f4; flex: none; }
  .top h2 { margin: 0; font-size: 14px; letter-spacing: .12em; text-transform: uppercase; font-weight: 600; }
  .top h2 span { color: #35c6f4; font-weight: 800; }
  .top small { display: block; color: #a9b4c4; font-size: 11px; margin-top: 1px; }
  .top .t { flex: 1; min-width: 0; }
  .ib { width: 32px; height: 32px; border: 0; border-radius: 8px; background: transparent; color: #cfd8e3; display: grid; place-items: center; }
  .ib:hover { background: rgba(255,255,255,.1); color: #fff; }
  .ib svg { width: 18px; height: 18px; }
  .body { flex: 1; overflow-y: auto; padding: 16px; background: #f7f9fc; scroll-behavior: smooth; }
  .msg { margin: 0 0 12px; display: flex; }
  .msg.u { justify-content: flex-end; }
  .bub { max-width: 86%; padding: 10px 13px; border-radius: 14px; word-wrap: break-word; overflow-wrap: anywhere; }
  .u .bub { background: var(--a1); color: #fff; border-bottom-right-radius: 4px; white-space: pre-wrap; }
  .a .bub { background: #fff; border: 1px solid var(--line); border-bottom-left-radius: 4px; }
  .a .bub.err { border-color: #f1c4ca; background: #fdf3f4; color: var(--err); }
  .bub p { margin: 0 0 8px; } .bub p:last-child { margin-bottom: 0; }
  .bub ul, .bub ol { margin: 4px 0 8px; padding-left: 20px; } .bub li { margin: 2px 0; }
  .bub h4 { margin: 8px 0 4px; font-size: 13.5px; }
  .bub code { font-family: ui-monospace,Consolas,monospace; font-size: 12px; background: #eef2f7; padding: 1px 4px; border-radius: 4px; }
  .bub table { border-collapse: collapse; margin: 6px 0 8px; font-size: 12.5px; width: 100%; }
  .bub th, .bub td { border-bottom: 1px solid var(--line); padding: 4px 6px; text-align: left; }
  .bub th { color: var(--muted); font-weight: 700; }
  .dots { display: inline-flex; gap: 4px; padding: 4px 2px; }
  .dots i { width: 7px; height: 7px; border-radius: 50%; background: #9fb0c3; animation: b 1.2s infinite ease-in-out; }
  .dots i:nth-child(2) { animation-delay: .15s } .dots i:nth-child(3) { animation-delay: .3s }
  @keyframes b { 0%,80%,100% { transform: translateY(0); opacity: .5 } 40% { transform: translateY(-4px); opacity: 1 } }
  @media (prefers-reduced-motion: reduce) { .dots i { animation: none } .body { scroll-behavior: auto } }
  .hello { text-align: center; padding: 12px 6px 4px; }
  .hello .logo { width: 46px; height: 46px; color: var(--a1); margin: 0 auto 6px; }
  .hello h3 { margin: 0 0 4px; font-size: 16px; }
  .hello p { margin: 0 0 14px; color: var(--muted); font-size: 13px; }
  .chips { display: grid; gap: 8px; }
  .chip { text-align: left; border: 1.5px solid var(--line); background: #fff; border-radius: 12px; padding: 9px 12px; color: var(--ink); font-size: 13px; }
  .chip:hover { border-color: var(--a1); color: var(--a1); }
  .foot { border-top: 1px solid var(--line); padding: 10px 12px 10px; background: #fff; flex: none; }
  .row { display: flex; gap: 8px; align-items: flex-end; }
  textarea { flex: 1; font: inherit; font-size: 14px; color: var(--ink); resize: none; max-height: 120px; min-height: 42px;
    padding: 10px 12px; border: 1.5px solid var(--line); border-radius: 12px; background: #fbfcfe; outline: none; }
  textarea:focus, input:focus { border-color: var(--a1); box-shadow: 0 0 0 3px rgba(30,136,255,.15); }
  .send { width: 42px; height: 42px; flex: none; border: 0; border-radius: 12px; color: #fff; display: grid; place-items: center;
    background: linear-gradient(90deg,#0f5fe0,var(--a1)); }
  .send:disabled { opacity: .45; cursor: default; }
  .send svg { width: 20px; height: 20px; }
  .meta { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 8px; font-size: 11px; color: var(--muted); }
  .meta label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
  .meta input { accent-color: var(--a1); margin: 0; }
  .note { font-size: 11px; color: var(--muted); text-align: center; margin-top: 6px; }
  form.login { padding: 22px 20px; display: grid; gap: 12px; }
  form.login label { display: grid; gap: 6px; font-size: 13px; font-weight: 600; color: var(--muted); }
  form.login input { font: inherit; font-size: 14px; color: var(--ink); padding: 10px 12px; border: 1.5px solid var(--line); border-radius: 10px; background: #fbfcfe; outline: none; width: 100%; }
  .go { border: 0; border-radius: 999px; padding: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; font-size: 12.5px; color: #fff;
    background: linear-gradient(90deg,#0f5fe0,var(--a1) 60%,#35c6f4); }
  .go:disabled { opacity: .6; cursor: wait; }
  .err { color: var(--err); font-size: 13px; font-weight: 600; min-height: 18px; margin: 0; }
  .muted { color: var(--muted); font-size: 12.5px; margin: 0; }
  .hlist { display: grid; gap: 6px; }
  .hitem { display: flex; align-items: center; gap: 6px; background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 4px 4px 4px 12px; }
  .hitem button.open { flex: 1; text-align: left; border: 0; background: none; padding: 6px 0; color: var(--ink); min-width: 0; }
  .hitem b { display: block; font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hitem small { color: var(--muted); font-size: 11px; }
  .hitem .ib { color: var(--muted); } .hitem .ib:hover { background: #fdf3f4; color: var(--err); }
  .back { border: 0; background: none; color: var(--a1); font-weight: 700; font-size: 13px; padding: 0 0 12px; }
  .center { text-align: center; padding: 28px 18px; }
  @media (max-width: 520px) {
    .panel { right: 0; bottom: 0; width: 100vw; height: 100dvh; border-radius: 0; }
    .fab { right: 14px; bottom: 14px; }
  }`;

  // ---------- Utilidades ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inline = s => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>');

  // Markdown simple y seguro (todo se escapa antes de dar formato)
  function md(src) {
    const lines = String(src).replace(/\r/g, '').split('\n');
    let out = '', list = null, para = [], table = [];
    const flushP = () => { if (para.length) { out += '<p>' + para.map(inline).join('<br>') + '</p>'; para = []; } };
    const flushL = () => { if (list) { out += `<${list.t}>` + list.items.map(i => '<li>' + inline(i) + '</li>').join('') + `</${list.t}>`; list = null; } };
    const flushT = () => {
      if (!table.length) return;
      const rows = table.filter(r => !/^\|?\s*:?-{2,}/.test(r)).map(r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
      out += '<table>' + rows.map((r, i) => '<tr>' + r.map(c => i ? `<td>${inline(c)}</td>` : `<th>${inline(c)}</th>`).join('') + '</tr>').join('') + '</table>';
      table = [];
    };
    const flush = () => { flushP(); flushL(); flushT(); };
    for (const raw of lines) {
      const l = raw.trimEnd();
      let m;
      if (/^\s*\|.*\|\s*$/.test(l)) { flushP(); flushL(); table.push(l.trim()); continue; }
      if (table.length) flushT();
      if (!l.trim()) { flush(); continue; }
      if ((m = l.match(/^#{1,4}\s+(.*)$/))) { flush(); out += '<h4>' + inline(m[1]) + '</h4>'; continue; }
      if ((m = l.match(/^\s*[-*•]\s+(.*)$/))) { flushP(); if (!list || list.t !== 'ul') { flushL(); list = { t: 'ul', items: [] }; } list.items.push(m[1]); continue; }
      if ((m = l.match(/^\s*\d+[.)]\s+(.*)$/))) { flushP(); if (!list || list.t !== 'ol') { flushL(); list = { t: 'ol', items: [] }; } list.items.push(m[1]); continue; }
      flushL(); para.push(l);
    }
    flush();
    return out;
  }

  async function call(path, opts = {}) {
    const headers = Object.assign({}, opts.headers || {});
    if (st.token) headers.Authorization = 'Bearer ' + st.token;
    if (opts.json !== undefined) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.json); }
    let r;
    try { r = await fetch(api + path, { method: opts.method || 'GET', headers, body: opts.body }); }
    catch (e) { throw new Error('No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.'); }
    if (r.status === 401 && st.token) { logout(); throw new Error('Tu sesión expiró. Vuelve a ingresar.'); }
    if (r.status === 204) return null;
    let data = null;
    try { data = await r.json(); } catch (e) {}
    if (!r.ok) {
      let d = data && data.detail;
      if (Array.isArray(d)) d = 'Revisa los datos ingresados.';
      throw new Error(d || 'Error del servidor (' + r.status + ').');
    }
    return data;
  }

  // Texto visible de la aplicación (el chat vive en Shadow DOM y no se incluye)
  function screenText() {
    try { return (document.body.innerText || '').slice(0, 60000); } catch (e) { return ''; }
  }

  // ---------- DOM ----------
  const host = document.createElement('div');
  host.id = 'prescriptor-asistente';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${CSS}</style>
  <div class="wrap">
    <button class="fab" type="button" aria-label="Abrir asistente">${I.chat}<span>Asistente</span></button>
    <section class="panel" role="dialog" aria-label="Asistente del Prescriptor NDVI" hidden>
      <header class="top">
        <div class="logo">${I.leaf}</div>
        <div class="t"><h2>Asistente <span>NDVI</span></h2><small class="sub">Consulta sobre tus lotes y prescripciones</small></div>
        <button class="ib" data-a="nuevo" type="button" title="Nueva conversación" aria-label="Nueva conversación">${I.plus}</button>
        <button class="ib" data-a="historial" type="button" title="Conversaciones anteriores" aria-label="Conversaciones anteriores">${I.hist}</button>
        <button class="ib" data-a="salir" type="button" title="Cerrar sesión del asistente" aria-label="Cerrar sesión del asistente">${I.out}</button>
        <button class="ib" data-a="cerrar" type="button" title="Cerrar" aria-label="Cerrar">${I.close}</button>
      </header>
      <div class="body" aria-live="polite"></div>
      <footer class="foot">
        <div class="row">
          <textarea rows="1" placeholder="Escribe tu pregunta…" aria-label="Pregunta"></textarea>
          <button class="send" type="button" aria-label="Enviar">${I.send}</button>
        </div>
        <div class="meta">
          <label title="Envía al asistente el texto que estás viendo en la plataforma para que entienda el contexto"><input type="checkbox" class="scr"> Incluir lo que veo en pantalla</label>
          <span class="quota"></span>
        </div>
        <div class="note">El asistente puede equivocarse. Verifica las dosis antes de aplicar.</div>
      </footer>
    </section>
  </div>`;

  const $ = s => root.querySelector(s);
  const fab = $('.fab'), panel = $('.panel'), body = $('.body'), foot = $('.foot');
  const ta = $('textarea'), send = $('.send'), scr = $('.scr'), quota = $('.quota');
  scr.checked = st.screen;

  function setHeaderButtons() {
    const logged = !!st.token;
    root.querySelector('[data-a="nuevo"]').hidden = !logged;
    root.querySelector('[data-a="historial"]').hidden = !logged;
    root.querySelector('[data-a="salir"]').hidden = !logged;
  }

  function scrollEnd() { body.scrollTop = body.scrollHeight; }

  function renderQuota() {
    const q = st.quota;
    quota.textContent = q && q.limite_diario ? `${q.usadas_hoy} de ${q.limite_diario} consultas hoy` : '';
  }

  function render() {
    setHeaderButtons();
    foot.hidden = st.view !== 'chat';
    if (!api) {
      body.innerHTML = `<div class="center"><h3>Asistente aún no conectado</h3><p class="muted">Falta indicar la dirección del servidor en <code>asistente.js</code> (línea <code>API_URL</code>).</p></div>`;
      foot.hidden = true; return;
    }
    if (!st.token) return renderLogin();
    if (st.view === 'historial') return renderHistory();
    renderChat();
  }

  function renderLogin() {
    st.view = 'login'; foot.hidden = true;
    body.innerHTML = `<form class="login" autocomplete="on">
      <p class="muted">Ingresa con tu cuenta del Prescriptor para hacer consultas.</p>
      <label>Usuario o correo<input name="username" autocomplete="username" required></label>
      <label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label>
      <p class="err" role="alert"></p>
      <button class="go" type="submit">Ingresar</button>
    </form>`;
    const f = body.querySelector('form'), err = f.querySelector('.err'), btn = f.querySelector('.go');
    f.username.focus();
    f.onsubmit = async e => {
      e.preventDefault();
      err.textContent = ''; btn.disabled = true; btn.textContent = 'Verificando…';
      try {
        const r = await fetch(api + '/auth/login', { method: 'POST', body: new URLSearchParams({ username: f.username.value, password: f.password.value }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.detail || 'No se pudo ingresar.');
        setToken(d.access_token); st.user = d.user;
        st.view = 'chat'; render(); refreshQuota(); ta.focus();
      } catch (ex) {
        err.textContent = ex.message === 'Failed to fetch' ? 'No hay conexión con el servidor.' : ex.message;
        btn.disabled = false; btn.textContent = 'Ingresar';
      }
    };
  }

  function renderChat() {
    st.view = 'chat'; foot.hidden = false;
    if (!st.msgs.length) {
      body.innerHTML = `<div class="hello"><div class="logo">${I.leaf}</div>
        <h3>¿En qué te ayudo?</h3><p>Pregunta sobre tus lotes, vuelos, NDVI o prescripciones.</p>
        <div class="chips">${SUGERENCIAS.map(s => `<button class="chip" type="button">${esc(s)}</button>`).join('')}</div></div>`;
      body.querySelectorAll('.chip').forEach(c => c.onclick = () => ask(c.textContent));
    } else {
      body.innerHTML = st.msgs.map(m => m.rol === 'user'
        ? `<div class="msg u"><div class="bub">${esc(m.texto)}</div></div>`
        : `<div class="msg a"><div class="bub${m.err ? ' err' : ''}">${m.err ? esc(m.texto) : md(m.texto)}</div></div>`).join('');
      if (st.busy) body.insertAdjacentHTML('beforeend', '<div class="msg a"><div class="bub"><span class="dots" aria-label="Pensando"><i></i><i></i><i></i></span></div></div>');
    }
    send.disabled = st.busy || !ta.value.trim();
    renderQuota();
    scrollEnd();
  }

  async function renderHistory() {
    st.view = 'historial'; foot.hidden = true;
    body.innerHTML = '<button class="back" type="button">← Volver al chat</button><div class="hlist"><p class="muted">Cargando…</p></div>';
    body.querySelector('.back').onclick = () => { st.view = 'chat'; render(); };
    const list = body.querySelector('.hlist');
    try {
      const convs = await call('/asistente/conversaciones');
      if (st.view !== 'historial') return;
      if (!convs.length) { list.innerHTML = '<p class="muted">Aún no tienes conversaciones.</p>'; return; }
      list.innerHTML = convs.map(c => `<div class="hitem"><button class="open" type="button" data-id="${c.id}"><b>${esc(c.titulo)}</b><small>${new Date(c.actualizada).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}</small></button>
        <button class="ib del" type="button" data-id="${c.id}" title="Eliminar" aria-label="Eliminar conversación">${I.trash}</button></div>`).join('');
      list.querySelectorAll('.open').forEach(b => b.onclick = () => loadConv(+b.dataset.id));
      list.querySelectorAll('.del').forEach(b => b.onclick = async () => {
        b.disabled = true;
        try { await call('/asistente/conversaciones/' + b.dataset.id, { method: 'DELETE' }); if (st.conv === +b.dataset.id) newChat(false); renderHistory(); }
        catch (e) { b.disabled = false; }
      });
    } catch (e) { list.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }

  async function loadConv(id) {
    try {
      const c = await call('/asistente/conversaciones/' + id);
      st.conv = c.id;
      st.msgs = c.mensajes.map(m => ({ rol: m.rol, texto: m.contenido }));
      st.view = 'chat'; render();
    } catch (e) { body.insertAdjacentHTML('beforeend', `<p class="err">${esc(e.message)}</p>`); }
  }

  function newChat(rerender = true) {
    st.conv = null; st.msgs = [];
    if (rerender) { st.view = 'chat'; render(); ta.focus(); }
  }

  async function refreshQuota() {
    if (!st.token || !api) return;
    try { st.quota = await call('/asistente/estado'); renderQuota(); } catch (e) {}
  }

  async function ask(text) {
    text = String(text || '').trim();
    if (!text || st.busy) return;
    if (!st.token) { open(); return; }
    st.busy = true;
    st.msgs.push({ rol: 'user', texto: text });
    ta.value = ''; autosize();
    renderChat();
    try {
      const d = await call('/asistente/consultar', { method: 'POST', json: {
        mensaje: text, conversacion_id: st.conv, pantalla: scr.checked ? screenText() : null,
      } });
      st.conv = d.conversacion_id;
      st.msgs.push({ rol: 'assistant', texto: d.respuesta });
      st.quota = Object.assign({}, st.quota, { usadas_hoy: d.usadas_hoy, limite_diario: d.limite_diario });
    } catch (e) {
      st.msgs.push({ rol: 'assistant', texto: e.message, err: true });
    } finally {
      st.busy = false;
      if (st.token) renderChat();
    }
  }

  function setToken(t) { st.token = t || null; store.set(TOKEN_KEY, st.token); }
  function logout() { setToken(null); st.user = null; st.quota = null; newChat(false); render(); }

  function open() {
    panel.hidden = false; fab.hidden = true;
    render(); refreshQuota();
    setTimeout(() => (st.token ? ta : body.querySelector('input'))?.focus(), 30);
  }
  function close() { panel.hidden = true; fab.hidden = false; fab.focus(); }

  function autosize() { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; send.disabled = st.busy || !ta.value.trim(); }

  // ---------- Eventos ----------
  fab.onclick = open;
  root.querySelector('[data-a="cerrar"]').onclick = close;
  root.querySelector('[data-a="nuevo"]').onclick = () => newChat();
  root.querySelector('[data-a="historial"]').onclick = () => { st.view = 'historial'; render(); };
  root.querySelector('[data-a="salir"]').onclick = logout;
  send.onclick = () => ask(ta.value);
  ta.addEventListener('input', autosize);
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(ta.value); } });
  scr.onchange = () => { st.screen = scr.checked; store.set(SCREEN_KEY, scr.checked ? '1' : '0'); };
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  const mount = () => document.body.appendChild(host);
  document.body ? mount() : document.addEventListener('DOMContentLoaded', mount);

  // API pública: cuando la plataforma inicie sesión contra el backend, puede llamar
  // PrescriptorAsistente.setToken(token) para que el usuario no tenga que ingresar dos veces.
  window.PrescriptorAsistente = {
    open, close,
    ask: t => { open(); ask(t); },
    setToken: t => { setToken(t); render(); refreshQuota(); },
  };
})();
