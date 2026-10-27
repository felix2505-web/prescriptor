/* =====================================================================
   Ajustes de la plataforma Prescriptor (se cargan sobre la app cifrada)
   - Logo de la empresa incorporado para todos (también en los informes)
   - Selector de índice en la barra superior: NDVI, GNDVI, LCI o SAVI
   Para cambiar el logo, reemplaza el archivo logo.png en el repositorio.
   ===================================================================== */
(() => {
  if (window.__prescPlataforma) return;
  window.__prescPlataforma = true;

  const LOGO_URL = 'logo.png?v=1';
  const INDICES = [
    { id: 'NDVI', nombre: 'NDVI · Índice de vegetación de diferencia normalizada', formula: '(NIR − Rojo) / (NIR + Rojo)' },
    { id: 'GNDVI', nombre: 'GNDVI · Índice de vegetación verde normalizado', formula: '(NIR − Verde) / (NIR + Verde)' },
    { id: 'LCI', nombre: 'LCI · Índice de clorofila de la hoja', formula: '(NIR − Red Edge) / (NIR + Rojo)' },
    { id: 'SAVI', nombre: 'SAVI · Índice de vegetación ajustado al suelo', formula: '1,5 × (NIR − Rojo) / (NIR + Rojo + 0,5)' },
  ];
  const KEY = 'presc_indice';
  const RX = /(?<![A-Za-z0-9])(NDVI|GNDVI|LCI|SAVI)(?![A-Za-z0-9])/g;
  const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
  const $ = id => document.getElementById(id);
  const store = {
    get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} },
  };

  let actual = INDICES.some(i => i.id === store.get()) ? store.get() : 'NDVI';
  const cambiar = s => (s && s.indexOf && /NDVI|LCI|SAVI/.test(s)) ? s.replace(RX, actual) : s;

  // ---------- Estilos ----------
  const css = document.createElement('style');
  css.textContent = `
    #userLogoBtn, #userLogoDel { display: none !important; }
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

  // ---------- Logo incorporado ----------
  async function logo() {
    const box = $('userLogoBox'), img = $('userLogo');
    if (!box || !img) return;
    try {
      const r = await fetch(LOGO_URL, { cache: 'no-cache' });
      if (!r.ok) throw new Error('sin logo');
      const blob = await r.blob();
      // Como imagen incrustada, para que también salga en los informes descargados
      const url = await new Promise((ok, mal) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = mal; f.readAsDataURL(blob); });
      img.src = url;
      img.alt = 'Logo';
      box.hidden = false;
      const btn = $('userLogoBtn'); if (btn) btn.hidden = true;
    } catch (e) {
      // Sin logo.png se mantiene el botón «Tu logo» como antes
      document.querySelectorAll('#userLogoBtn').forEach(b => b.style.setProperty('display', 'inline-flex', 'important'));
    }
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
          d.write = (...s) => escribir(...s.map(x => typeof x === 'string' ? cambiar(x) : x));
        }
      } catch (e) { /* ventana de otro sitio: no se toca */ }
      return w;
    };
    const B = window.Blob;
    class BlobIndice extends B {
      constructor(partes, op) {
        if (op && /^text\/html/i.test(op.type || '') && Array.isArray(partes)) {
          partes = partes.map(x => typeof x === 'string' ? cambiar(x) : x);
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
    informe();
    aplicar(document.body);
    document.title = cambiar(document.title);
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', iniciar) : iniciar();

  window.PrescriptorIndice = { get: () => actual, lista: INDICES.map(i => i.id) };
})();
