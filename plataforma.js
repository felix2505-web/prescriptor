/* =====================================================================
   Ajustes de la plataforma Prescriptor (se cargan sobre la app cifrada)
   - Logo de Summit Agro incorporado para todos (también en los informes); nadie puede subir otro
   - Nombre del usuario de la sesión en la barra superior
   - Selector de índice en la barra superior: NDVI, GNDVI, LCI, NDRE u OSAVI
   Logos: logo.png (texto blanco, para fondos oscuros) y logo-oscuro.png (texto oscuro, para fondos claros).
   ===================================================================== */
(() => {
  if (window.__prescPlataforma) return;
  window.__prescPlataforma = true;

  const LOGO_URL = 'logo.png?v=2';
  const LOGO_OSCURO_URL = 'logo-oscuro.png?v=2';
  const INDICES = [
    { id: 'NDVI', nombre: 'NDVI · Índice de vegetación de diferencia normalizada', formula: '(NIR − Rojo) / (NIR + Rojo)' },
    { id: 'GNDVI', nombre: 'GNDVI · Índice de vegetación verde normalizado', formula: '(NIR − Verde) / (NIR + Verde)' },
    { id: 'LCI', nombre: 'LCI · Índice de clorofila de la hoja', formula: '(NIR − Red Edge) / (NIR + Rojo)' },
    { id: 'NDRE', nombre: 'NDRE · Índice de diferencia normalizada de borde rojo', formula: '(NIR − Red Edge) / (NIR + Red Edge)' },
    { id: 'OSAVI', nombre: 'OSAVI · Índice de vegetación ajustado al suelo optimizado', formula: '(NIR − Rojo) / (NIR + Rojo + 0,16)' },
  ];
  const KEY = 'presc_indice';
  // SAVI queda en la lista solo para corregir textos de una versión anterior
  const RX = /(?<![A-Za-z0-9])(NDVI|GNDVI|NDRE|LCI|OSAVI|SAVI)(?![A-Za-z0-9])/g;
  // Solo se modifican los informes, nunca otros archivos (por ejemplo, el archivo de usuarios que descarga el admin)
  const esInforme = h => typeof h === 'string' && /<title>Informe/.test(h);
  const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
  const $ = id => document.getElementById(id);
  const store = {
    get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} },
  };

  const guardado = store.get() === 'SAVI' ? 'OSAVI' : store.get();
  let actual = INDICES.some(i => i.id === guardado) ? guardado : 'NDVI';
  const cambiar = s => (s && s.indexOf && /NDVI|NDRE|LCI|SAVI/.test(s)) ? s.replace(RX, actual) : s;

  // ---------- Estilos ----------
  const css = document.createElement('style');
  css.textContent = `
    #userLogoBtn, #userLogoDel, #userLogoIn { display: none !important; }
    .ses-user { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 999px;
      border: 1px solid var(--line, #d5dde6); color: var(--fg, #1a1b23); font-weight: 700; font-size: 14px; white-space: nowrap;
      max-width: 260px; overflow: hidden; text-overflow: ellipsis; }
    .ses-user svg { width: 18px; height: 18px; flex: none; color: var(--accent, #1e88ff); }
    .ses-user span { overflow: hidden; text-overflow: ellipsis; }
    .userlogo img { height: 54px !important; max-width: 240px !important; object-fit: contain; }
    @media (max-width: 820px) { .userlogo img { height: 40px !important; max-width: 170px !important; } }
    .idx-sel { font: inherit; color: inherit; letter-spacing: inherit; text-transform: inherit; line-height: inherit;
      background-color: transparent; border: 0; border-radius: 6px; width: auto; field-sizing: content;
      padding: 0 18px 0 0; margin: 0; cursor: pointer; appearance: none; -webkit-appearance: none;
      background-image: linear-gradient(45deg, transparent 50%, var(--accent, #1e88ff) 50%), linear-gradient(135deg, var(--accent, #1e88ff) 50%, transparent 50%);
      background-clip: border-box; -webkit-background-clip: border-box;
      background-position: right 9px top 55%, right 4px top 55%; background-size: 5px 5px, 5px 5px; background-repeat: no-repeat; }
    .idx-sel:hover { background-color: color-mix(in srgb, currentColor 10%, transparent); }
    .idx-sel:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    .idx-sel option { color: #1a1b23; background: #fff; font-size: 15px; }`;
  document.head.appendChild(css);

  // ---------- Logo incorporado (nadie puede subir otro) ----------
  // logo.png tiene el texto en blanco (fondos oscuros); logo-oscuro.png lo tiene en gris oscuro (fondos claros e informes)
  const LOGOS = { claro: null, oscuro: null };

  async function comoDataURL(url) {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error('sin ' + url);
    const blob = await r.blob();
    return new Promise((ok, mal) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = mal; f.readAsDataURL(blob); });
  }

  // ¿La barra superior es oscura? Se mira el color del título: texto claro = fondo oscuro.
  function barraOscura() {
    const h1 = document.querySelector('header.top h1') || document.body;
    const m = getComputedStyle(h1).color.match(/[\d.]+/g);
    if (!m) return true;
    const [r, g, b] = m.map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 140;
  }

  function ponerLogo() {
    const box = $('userLogoBox'), img = $('userLogo');
    if (!box || !img) return;
    const url = barraOscura() ? (LOGOS.claro || LOGOS.oscuro) : (LOGOS.oscuro || LOGOS.claro);
    if (!url) { box.hidden = true; return; }
    if (img.src !== url) img.src = url;
    img.alt = 'Summit Agro';
    box.hidden = false;
  }

  async function logo() {
    const box = $('userLogoBox'), img = $('userLogo'), input = $('userLogoIn');
    if (input) { input.disabled = true; input.remove(); }
    try { localStorage.removeItem('presc_logo'); } catch (e) {}
    if (!box || !img) return;
    box.hidden = true; img.removeAttribute('src');
    const [claro, oscuro] = await Promise.allSettled([comoDataURL(LOGO_URL), comoDataURL(LOGO_OSCURO_URL)]);
    LOGOS.claro = claro.status === 'fulfilled' ? claro.value : null;
    LOGOS.oscuro = oscuro.status === 'fulfilled' ? oscuro.value : null;
    ponerLogo();
    // Al cambiar de apariencia (o de tema claro/oscuro) se cambia la versión del logo
    new MutationObserver(() => setTimeout(ponerLogo, 30))
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-skin', 'data-theme', 'class'] });
  }

  // Informe: siempre fondo blanco, así que lleva el logo con texto oscuro
  function prepararInforme(h) {
    h = cambiar(h);
    if (LOGOS.claro && LOGOS.oscuro) h = h.split(LOGOS.claro).join(LOGOS.oscuro);
    return h;
  }

  // ---------- Usuario de la sesión ----------
  function usuario() {
    const A = window.__PRESC_AUTH;
    const nombre = A && (A.user || (A.entry && A.entry.u));
    const ref = $('filetag');
    if (!nombre || !ref || $('sesionUsuario')) return;
    const el = document.createElement('div');
    el.id = 'sesionUsuario';
    el.className = 'ses-user';
    el.title = 'Sesión iniciada como ' + nombre + (A.role === 'admin' ? ' (administrador)' : '');
    el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg><span></span>';
    el.querySelector('span').textContent = nombre;
    ref.after(el);
  }

  // ---------- Selector de índice ----------
  function selector() {
    const span = document.querySelector('header.top h1 span');
    if (!span) return null;
    const sel = document.createElement('select');
    sel.className = 'idx-sel';
    sel.id = 'idxSel';
    sel.setAttribute('aria-label', 'Índice de vegetación');
    sel.title = 'Elige el índice del ortomosaico que vas a cargar. El cálculo de zonas y dosis es el mismo.';
    INDICES.forEach(i => { const o = document.createElement('option'); o.value = i.id; o.textContent = i.id; o.title = i.nombre + ' = ' + i.formula; sel.appendChild(o); });
    sel.value = actual;
    // Se deja el <span> original (cada estilo de apariencia le da su formato) y el menú va adentro
    span.textContent = '';
    span.appendChild(sel);
    sel.addEventListener('change', () => {
      actual = sel.value;
      store.set(actual);
      aplicar(document.body);
      document.title = cambiar(document.title);
      const i = INDICES.find(x => x.id === actual);
      aviso(i.nombre + '. Carga el GeoTIFF de ' + actual + ' (una banda): todo lo demás funciona igual.');
    });
    return sel;
  }

  // ---------- Cambio de textos ----------
  const fuera = n => {
    for (let e = n.nodeType === 1 ? n : n.parentElement; e; e = e.parentElement) {
      if (e.id === 'idxSel' || e.tagName === 'SCRIPT' || e.tagName === 'STYLE' || e.tagName === 'TEXTAREA') return true;
    }
    return false;
  };
  function nodoTexto(t) {
    const v = t.nodeValue;
    if (!v || fuera(t)) return;
    const n = cambiar(v);
    if (n !== v) t.nodeValue = n;
  }
  function elemento(el) {
    if (fuera(el)) return;
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v) { const n = cambiar(v); if (n !== v) el.setAttribute(a, n); }
    }
  }
  function aplicar(root) {
    if (!root) return;
    if (root.nodeType === 3) return nodoTexto(root);
    if (root.nodeType !== 1) return;
    elemento(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = w.nextNode(); n; n = w.nextNode()) n.nodeType === 3 ? nodoTexto(n) : elemento(n);
  }

  // Textos que la app crea después (avisos, tablas, ayudas, leyendas)
  const obs = new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'characterData') nodoTexto(m.target);
      else if (m.type === 'attributes') elemento(m.target);
      else m.addedNodes.forEach(aplicar);
    }
  });

  // Informe: la app lo abre en una ventana nueva (document.write) o lo descarga como .html (Blob).
  // En ambos casos se cambia el nombre del índice en el HTML generado.
  function informe() {
    const abrir = window.open;
    window.open = function () {
      const w = abrir.apply(this, arguments);
      try {
        if (w && w.document) {
          const d = w.document, escribir = d.write.bind(d);
          d.write = (...s) => escribir(...s.map(x => esInforme(x) ? prepararInforme(x) : x));
        }
      } catch (e) { /* ventana de otro sitio: no se toca */ }
      return w;
    };
    const B = window.Blob;
    class BlobIndice extends B {
      constructor(partes, op) {
        if (op && /^text\/html/i.test(op.type || '') && Array.isArray(partes)) {
          partes = partes.map(x => esInforme(x) ? prepararInforme(x) : x);
        }
        super(partes, op);
      }
    }
    window.Blob = BlobIndice;
  }

  // Aviso breve usando el mismo recuadro de avisos de la app
  let avisoT;
  function aviso(msg) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(avisoT); avisoT = setTimeout(() => { t.hidden = true; }, 5000);
  }

  function iniciar() {
    selector();
    logo();
    usuario();
    informe();
    aplicar(document.body);
    document.title = cambiar(document.title);
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', iniciar) : iniciar();

  window.PrescriptorIndice = { get: () => actual, lista: INDICES.map(i => i.id) };
})();
