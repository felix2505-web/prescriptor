/* =====================================================================
   Prescriptor · Trabajo simplificado
   - Modo simple / avanzado (oculta los pasos técnicos)
   - Plantillas por cultivo (y plantillas propias)
   - Carga rápida: soltar el índice y el RGB juntos
   - Paquete completo para el Agras (.zip) en un botón
   - Informe directo en PDF
   Se carga sobre la app cifrada sin modificarla.
   ===================================================================== */
(() => {
  if (window.__prescSimple) return;
  window.__prescSimple = true;
  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let avisoT;
  function aviso(msg, ms = 6000) {
    const t = $('toast'); if (!t) return;
    t.textContent = msg; t.hidden = false; clearTimeout(avisoT); avisoT = setTimeout(() => { t.hidden = true; }, ms);
  }

  // ---------- Captura de descargas de la app (para armar paquetes) ----------
  // Mientras hay una sesión de captura, las descargas de la app no se bajan: se guardan aquí.
  let sesion = null;
  const blobDatos = new WeakMap(), urlBlob = new Map();
  const B0 = window.Blob;
  window.Blob = class extends B0 {
    constructor(p, o) { super(p, o); if (sesion && Array.isArray(p) && p.length === 1) blobDatos.set(this, p[0]); }
  };
  const crearURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function (obj) { const u = crearURL(obj); if (sesion && obj instanceof B0) urlBlob.set(u, obj); return u; };
  const clic0 = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (sesion && this.download && urlBlob.has(this.href)) {
      const b = urlBlob.get(this.href);
      sesion.push({ name: this.download, blob: b, data: blobDatos.get(b) });
      return;
    }
    return clic0.call(this);
  };
  // Pulsa un botón de la app y espera sus descargas (hasta que `listo(lista)` sea verdadero o se acabe el tiempo)
  async function capturar(boton, listo, maxMs = 20000) {
    if (!boton) return [];
    sesion = [];
    const t0 = Date.now();
    try {
      boton.click();
      while (Date.now() - t0 < maxMs) { await sleep(150); if (listo(sesion)) { await sleep(300); break; } }
      return sesion;
    } finally { sesion = null; }
  }
  async function aBytes(x) {
    const d = x.data != null ? x.data : x.blob;
    if (d instanceof Uint8Array) return d;
    if (d instanceof ArrayBuffer) return new Uint8Array(d);
    if (ArrayBuffer.isView(d)) return new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
    if (typeof d === 'string') return new TextEncoder().encode(d);
    if (d instanceof B0) return new Uint8Array(await d.arrayBuffer());
    return new Uint8Array(await x.blob.arrayBuffer());
  }
  async function aTexto(x) { return typeof x.data === 'string' ? x.data : new TextDecoder().decode(await aBytes(x)); }

  function descargar(blob, nombre) {
    const a = document.createElement('a'); a.href = crearURL(blob); a.download = nombre;
    document.body.appendChild(a); clic0.call(a); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  const visible = el => !!el && !el.hidden && el.offsetParent !== null;
  const hayVuelo = () => !!($('filetag') && $('filetag').textContent.trim() && $('filetag').textContent.trim() !== '—');
  const limpio = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  function baseNombre() {
    const proj = $('projName') && $('projName').value.trim();
    const file = $('filetag') && $('filetag').textContent.trim();
    return limpio(proj || (file && file !== '—' ? file.replace(/\.[^.]+$/, '') : '') || 'prescripcion');
  }

  // ---------- Estilos ----------
  const css = document.createElement('style');
  css.textContent = `
    .ps-modo { display: inline-flex; border: 1px solid var(--line, #d5dde6); border-radius: 999px; overflow: hidden; }
    .ps-modo button { border: 0; background: transparent; color: var(--muted, #5e6e82); font: inherit; font-size: 12.5px; font-weight: 700; padding: 6px 12px; cursor: pointer; }
    .ps-modo button[aria-pressed="true"] { background: var(--accent, #1e88ff); color: #fff; }
    body.ps-simple .ps-avz { display: none !important; }
    .ps-dropwrap { margin: 10px 0 4px; }
    .ps-drop { display: block !important; position: static !important; border: 2px dashed var(--line, #c9d3de); border-radius: 14px; padding: 14px; text-align: center; font-size: 13px; color: var(--muted, #5e6e82); cursor: pointer; transition: border-color .15s, background .15s; }
    .ps-drop span { display: block; line-height: 1.4; }
    .ps-drop b { display: block; color: var(--fg, #1a1b23); font-size: 14px; margin-bottom: 2px; }
    .ps-drop.on { border-color: var(--accent, #1e88ff); background: color-mix(in srgb, var(--accent, #1e88ff) 8%, transparent); }
    .ps-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end; }
    .ps-row > label { flex: 1 1 160px; }
    .ps-note { font-size: 12px; color: var(--muted, #5e6e82); margin: 0; }
    .ps-progress { font-size: 12.5px; color: var(--accent, #1e88ff); font-weight: 600; min-height: 16px; margin: 0; }`;
  document.head.appendChild(css);

  // ---------- Secciones de la app ----------
  const pasos = () => [...document.querySelectorAll('aside.panel section.step')];
  const numPaso = sec => ((sec.querySelector('h2 b') || {}).textContent || '').trim();
  const pasoPorNum = n => pasos().find(s => numPaso(s) === n);

  // ---------- 1) Modo simple / avanzado ----------
  // En modo simple quedan: Proyecto, índice, plantilla, límite, clases y dosis, y exportar.
  const VISIBLES_SIMPLE = new Set(['0', '1', '3b', '4', '8']);
  function marcarAvanzados() {
    for (const s of pasos()) {
      if (s.id === 'psPlantillas') continue;
      s.classList.toggle('ps-avz', !VISIBLES_SIMPLE.has(numPaso(s)));
    }
  }
  function setModo(m) {
    document.body.classList.toggle('ps-simple', m === 'simple');
    document.querySelectorAll('.ps-modo button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
    ls.set('presc_modo', m);
  }
  function modo() {
    const tools = document.querySelector('header.top .hdr-tools') || document.querySelector('header.top');
    if (!tools || document.querySelector('.ps-modo')) return;
    const w = document.createElement('div');
    w.className = 'ps-modo'; w.setAttribute('role', 'group'); w.setAttribute('aria-label', 'Modo de trabajo');
    w.innerHTML = '<button type="button" data-m="simple" title="Solo los pasos esenciales">Simple</button><button type="button" data-m="avanzado" title="Todos los pasos y ajustes">Avanzado</button>';
    w.onclick = e => { const b = e.target.closest('button'); if (b) setModo(b.dataset.m); };
    tools.insertBefore(w, tools.firstChild);
    marcarAvanzados();
    setModo(ls.get('presc_modo', 'simple'));
  }

  // ---------- 2) Plantillas por cultivo ----------
  // Marcos de plantación de partida (ajústalos a tu huerto). No incluyen dosis: esas las define cada aplicación.
  const BASE = [
    { id: 'b-cerezo', nombre: 'Cerezo', p: { dist: 4.5, nrows: 1, largo: 2 } },
    { id: 'b-manzano', nombre: 'Manzano', p: { dist: 4, nrows: 1, largo: 1.5 } },
    { id: 'b-vid', nombre: 'Vid (espaldera)', p: { dist: 2.5, nrows: 1, largo: 1.2 } },
    { id: 'b-arandano', nombre: 'Arándano', p: { dist: 3, nrows: 1, largo: 0.8 } },
    { id: 'b-nogal', nombre: 'Nogal', p: { dist: 7, nrows: 1, largo: 5 } },
    { id: 'b-palto', nombre: 'Palto', p: { dist: 6, nrows: 1, largo: 4 } },
  ].map(t => ({ ...t, base: true, nClass: 3, method: 'zones', zr: 2, zmin: 6 }));
  const propias = () => ls.get('presc_plantillas', []);
  const todas = () => [...BASE, ...propias()];

  function leerActual(nombre) {
    const t = { id: 'u-' + Date.now(), nombre, p: {} };
    for (const k of ['dist', 'nrows', 'largo', 'cobMin']) {
      const el = document.querySelector('[data-k="' + k + '"]'); const v = el && parseFloat(String(el.value).replace(',', '.'));
      if (Number.isFinite(v)) t.p[k] = v;
    }
    const on = document.querySelector('#nSeg button.on'); if (on) t.nClass = +on.dataset.n;
    if ($('methodSel')) t.method = $('methodSel').value;
    if ($('zrSel')) t.zr = +$('zrSel').value;
    if ($('zminIn')) t.zmin = +$('zminIn').value || 6;
    const dosis = [...document.querySelectorAll('#ctable [data-r]')].map(i => +i.value).filter(Number.isFinite);
    if (dosis.length) t.dosis = dosis;
    if ($('droneSel')) t.dron = $('droneSel').value;
    if ($('tankIn')) t.tanque = +$('tankIn').value || null;
    return t;
  }

  const setVal = (el, v, ev = 'input') => { if (!el) return; el.value = v; el.dispatchEvent(new Event(ev, { bubbles: true })); };
  async function aplicarPlantilla(t) {
    for (const [k, v] of Object.entries(t.p || {})) setVal(document.querySelector('[data-k="' + k + '"]'), v);
    await sleep(120);
    if (t.nClass) { const b = document.querySelector('#nSeg button[data-n="' + t.nClass + '"]'); if (b) b.click(); await sleep(150); }
    if (t.method && $('methodSel')) { setVal($('methodSel'), t.method, 'change'); await sleep(150); }
    if (t.method === 'zones') {
      if (t.zr && $('zrSel')) { setVal($('zrSel'), t.zr, 'change'); await sleep(100); }
      if (t.zmin && $('zminIn')) { setVal($('zminIn'), t.zmin, 'change'); await sleep(100); }
    }
    if (Array.isArray(t.dosis)) {
      await sleep(150);
      t.dosis.forEach((d, i) => setVal(document.querySelector('#ctable [data-r="' + i + '"]'), d));
    }
    if (t.dron && $('droneSel')) { setVal($('droneSel'), t.dron, 'change'); await sleep(80); }
    if (t.tanque && $('tankIn')) setVal($('tankIn'), t.tanque);
    aviso('Plantilla «' + t.nombre + '» aplicada' + (hayVuelo() ? '. Revisa el mapa y ajusta lo que necesites.' : '. Se usará al cargar el vuelo.'));
  }

  function plantillas() {
    const p1 = pasoPorNum('1');
    if (!p1 || $('psPlantillas')) return;
    const sec = document.createElement('section');
    sec.className = 'step'; sec.id = 'psPlantillas';
    sec.innerHTML = `<h2><b>★</b>Plantilla de cultivo</h2>
      <p class="hint">Carga de una vez el marco de plantación, la cantidad de tasas y el método. Después solo ajustas las dosis.</p>
      <div class="ps-row">
        <label class="f"><span>Plantilla</span><select id="psSel"></select></label>
        <button class="btn primary" id="psAplicar" type="button">Aplicar</button>
      </div>
      <p class="ps-note" id="psDet"></p>
      <div class="ps-row">
        <label class="f"><span>Guardar lo actual como plantilla</span><input type="text" id="psNombre" maxlength="40" placeholder="Ej.: Cerezo Lapins El Abuelo"></label>
        <button class="btn" id="psGuardar" type="button">Guardar</button>
        <button class="btn" id="psBorrar" type="button" hidden>Borrar</button>
      </div>
      <p class="ps-note">Las plantillas propias guardan marco, tasas, método, dosis y dron. Quedan en este navegador.</p>`;
    p1.after(sec);
    const sel = $('psSel');
    function llenar(elegir) {
      const ps = propias();
      sel.innerHTML = '<optgroup label="Cultivos (marco de partida)">' + BASE.map(t => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('') + '</optgroup>' +
        (ps.length ? '<optgroup label="Mis plantillas">' + ps.map(t => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('') + '</optgroup>' : '');
      if (elegir) sel.value = elegir;
      detalle();
    }
    function detalle() {
      const t = todas().find(x => x.id === sel.value); if (!t) return;
      const f = v => String(v).replace('.', ',');
      const d = [t.p.dist && 'entre hileras ' + f(t.p.dist) + ' m', t.p.largo && 'sobre hilera ' + f(t.p.largo) + ' m', t.nClass && t.nClass + ' tasas',
        t.method === 'zones' ? 'zonificado' : t.method, t.dosis && 'dosis ' + t.dosis.join(' / ') + ' L/ha'].filter(Boolean).join(' · ');
      $('psDet').textContent = d + (t.base ? ' (valores de partida, ajústalos a tu huerto)' : '');
      $('psBorrar').hidden = !!t.base;
    }
    sel.onchange = detalle;
    $('psAplicar').onclick = () => { const t = todas().find(x => x.id === sel.value); if (t) aplicarPlantilla(t); };
    $('psGuardar').onclick = () => {
      const nombre = $('psNombre').value.trim();
      if (!nombre) { $('psNombre').focus(); aviso('Escribe un nombre para la plantilla.'); return; }
      const t = leerActual(nombre), ps = propias().filter(x => x.nombre.toLowerCase() !== nombre.toLowerCase());
      ps.push(t);
      if (!ls.set('presc_plantillas', ps)) { aviso('Este navegador no permitió guardar la plantilla.'); return; }
      $('psNombre').value = ''; llenar(t.id); aviso('Plantilla «' + nombre + '» guardada.');
    };
    $('psBorrar').onclick = () => {
      const t = propias().find(x => x.id === sel.value); if (!t) return;
      ls.set('presc_plantillas', propias().filter(x => x.id !== t.id)); llenar(); aviso('Plantilla «' + t.nombre + '» borrada.');
    };
    llenar(ls.get('presc_plantilla_ult', null));
    sel.addEventListener('change', () => ls.set('presc_plantilla_ult', sel.value));
  }

  // ---------- 3) Carga rápida: índice + RGB juntos ----------
  async function bandas(file) {
    try { const tiff = await GeoTIFF.fromBlob(file); const img = await tiff.getImage(); return img.getSamplesPerPixel(); }
    catch (e) { return 0; }
  }
  function indiceDelNombre(nombre) {
    const n = nombre.toUpperCase();
    for (const id of ['GNDVI', 'OSAVI', 'NDRE', 'LCI', 'NDVI']) if (new RegExp('(^|[^A-Z])' + id + '([^A-Z]|$)').test(n)) return id;
    return null;
  }
  function ponerArchivo(input, file) {
    const dt = new DataTransfer(); dt.items.add(file);
    input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  async function cargaRapida(files) {
    files = [...files].filter(f => /\.tiff?$/i.test(f.name));
    if (!files.length) { aviso('Suelta archivos GeoTIFF (.tif).'); return; }
    const prog = $('psDropMsg'); prog.textContent = 'Revisando archivos…';
    const info = [];
    for (const f of files) info.push({ f, b: await bandas(f) });
    const indice = info.find(x => x.b === 1) || (info.length === 1 ? info[0] : null);
    const rgb = info.find(x => x !== indice && x.b >= 3);
    if (!indice && !rgb) { prog.textContent = ''; aviso('No reconocí los archivos: el índice debe ser un GeoTIFF de una banda y el RGB de 3 o 4 bandas.', 8000); return; }
    if (indice) {
      const id = indiceDelNombre(indice.f.name), sel = $('idxSel');
      if (id && sel && sel.value !== id) setVal(sel, id, 'change');
      prog.textContent = 'Cargando ' + indice.f.name + '…';
      ponerArchivo($('fileIn'), indice.f);
      for (let i = 0; i < 120 && !hayVuelo(); i++) await sleep(250);
    }
    if (rgb && $('rgbIn')) {
      prog.textContent = 'Cargando RGB ' + rgb.f.name + '…';
      await sleep(400);
      ponerArchivo($('rgbIn'), rgb.f);
    }
    prog.textContent = '';
    const partes = [indice && ('índice: ' + indice.f.name), rgb && ('RGB: ' + rgb.f.name)].filter(Boolean);
    aviso('Cargado ' + partes.join(' · ') + '.');
  }
  function cargaRapidaUI() {
    const p1 = pasoPorNum('1');
    if (!p1 || $('psDrop')) return;
    const box = document.createElement('div');
    box.className = 'ps-dropwrap';
    box.innerHTML = `<div class="ps-drop" id="psDrop" role="button" tabindex="0"><b>Suelta aquí el índice y el RGB juntos</b><span>o haz clic para elegirlos. Se reconoce cuál es cuál y el tipo de índice por el nombre del archivo.</span></div>
      <input type="file" id="psDropIn" accept=".tif,.tiff,image/tiff" multiple hidden><p class="ps-progress" id="psDropMsg"></p>`;
    const btns = p1.querySelector('.btns');
    (btns || p1.querySelector('h2')).after(box);
    const d = $('psDrop');
    $('psDropIn').onchange = e => { cargaRapida(e.target.files); e.target.value = ''; };
    d.onclick = () => $('psDropIn').click();
    d.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('psDropIn').click(); } };
    d.addEventListener('dragover', e => { e.preventDefault(); d.classList.add('on'); });
    d.addEventListener('dragleave', () => d.classList.remove('on'));
    d.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); d.classList.remove('on'); cargaRapida(e.dataTransfer.files); });
    // Si sueltan varios archivos sobre el mapa, también se usa la carga rápida
    const mapa = $('mapwrap');
    if (mapa) mapa.addEventListener('drop', e => {
      if (e.dataTransfer && e.dataTransfer.files.length > 1) { e.preventDefault(); e.stopImmediatePropagation(); const dr = $('drop'); if (dr) dr.hidden = true; cargaRapida(e.dataTransfer.files); }
    }, true);
  }

  // ---------- 4) Informe en PDF ----------
  const H2PDF = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
  async function informeHTML() {
    const r = await capturar($('repDl'), l => l.some(x => /\.html?$/i.test(x.name)), 60000);
    const f = r.find(x => /\.html?$/i.test(x.name));
    return f ? { html: await aTexto(f), name: f.name } : null;
  }
  // Convierte el HTML del informe a PDF dentro de un iframe oculto (con html2pdf)
  function htmlAPdf(html) {
    return new Promise((ok, mal) => {
      const fr = document.createElement('iframe');
      fr.style.cssText = 'position:fixed;left:-12000px;top:0;width:1100px;height:1400px;border:0;visibility:hidden';
      const id = 'pdf' + Math.random().toString(36).slice(2);
      const fin = e => {
        if (!e.data || e.data.id !== id) return;
        window.removeEventListener('message', fin); fr.remove();
        e.data.error ? mal(new Error(e.data.error)) : ok(e.data.blob);
      };
      window.addEventListener('message', fin);
      const extra = `<style>.bar{display:none!important}body{background:#fff!important}.page{box-shadow:none!important;margin:0 auto!important}</style>
        <script src="${H2PDF}"><\/script>
        <script>
          window.addEventListener('load', async () => {
            try {
              await new Promise(r => setTimeout(r, 400));
              const el = document.querySelector('.page') || document.body;
              const blob = await html2pdf().set({
                margin: [8, 8, 10, 8], image: { type: 'jpeg', quality: 0.92 },
                html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: 1100 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak: { mode: ['css', 'legacy'], before: ['.cmp-sec', '.cmp-fig + .cmp-fig', '.cmp-sec + section'], avoid: ['figure', 'tr', 'h2', 'h3', '.cards', 'img'] }
              }).from(el).outputPdf('blob');
              parent.postMessage({ id: '${id}', blob }, '*');
            } catch (err) { parent.postMessage({ id: '${id}', error: String(err && err.message || err) }, '*'); }
          });
        <\/script>`;
      fr.srcdoc = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, extra + '</head>') : extra + html;
      document.body.appendChild(fr);
      setTimeout(() => { window.removeEventListener('message', fin); fr.remove(); mal(new Error('El PDF tardó demasiado')); }, 180000);
    });
  }
  async function informePDF(btn) {
    if (!hayVuelo()) { aviso('Primero carga un vuelo.'); return null; }
    const txt = btn && btn.textContent; if (btn) { btn.disabled = true; btn.textContent = 'Generando PDF…'; }
    try {
      const r = await informeHTML();
      if (!r) throw new Error('no se pudo generar el informe');
      const pdf = await htmlAPdf(r.html);
      return { pdf, name: r.name.replace(/\.html?$/i, '.pdf'), html: r.html, htmlName: r.name };
    } finally { if (btn) { btn.disabled = false; btn.textContent = txt; } }
  }
  function informePdfUI() {
    const ref = $('repDl') || $('repBtn');
    if (!ref || $('psPdf')) return;
    const b = document.createElement('button');
    b.className = 'btn primary'; b.type = 'button'; b.id = 'psPdf'; b.textContent = 'Informe en PDF';
    b.onclick = async () => {
      try { const r = await informePDF(b); if (r) { descargar(r.pdf, r.name); aviso('Descargado ' + r.name + '.'); } }
      catch (e) { console.error(e); aviso('No se pudo generar el PDF (' + e.message + '). Usa «Ver informe» → «Imprimir o guardar PDF».', 9000); }
    };
    ref.after(b);
  }

  // ---------- 5) Paquete completo para el Agras ----------
  async function paquete(btn) {
    if (!hayVuelo()) { aviso('Primero carga un vuelo y define las tasas.'); return; }
    const Z = window.PrescriptorZonas;
    if (!Z || !Z.zip) { aviso('Falta el archivo zonas.js en la plataforma.'); return; }
    const txt = btn.textContent; btn.disabled = true;
    const paso = m => { btn.textContent = m; };
    const files = [], b = baseNombre(), notas = [];
    try {
      // a) Prescripción .tif + .tfw (todas las zonas si hay varias)
      paso('1/3 · Prescripción…');
      const multi = visible($('expZipBtn'));
      const rx = await capturar(multi ? $('expZipBtn') : $('expBtn'),
        l => multi ? l.some(x => /\.zip$/i.test(x.name)) : (l.some(x => /\.tif$/i.test(x.name)) && l.some(x => /\.tfw$/i.test(x.name))), 30000);
      if (!rx.length) throw new Error('no se generó la prescripción (revisa las tasas y el límite)');
      for (const x of rx) files.push({ name: '1_prescripcion_DJI/' + x.name, data: await aBytes(x) });
      if (multi) notas.push('1_prescripcion_DJI contiene un .zip con un .tif + .tfw por zona: descomprímelo antes de subirlo a SmartFarm.');
      // b) Polígonos de vuelo por mancha
      paso('2/3 · Polígonos…');
      files.push(...(await Z.archivosManchas('2_poligonos_por_mancha/')));
      // c) Informe (PDF, y el HTML por si el PDF falla)
      paso('3/3 · Informe…');
      try {
        const r = await informePDF(null);
        files.push({ name: '3_informe/' + r.name, data: new Uint8Array(await r.pdf.arrayBuffer()) });
      } catch (e) {
        const r = await informeHTML();
        if (r) { files.push({ name: '3_informe/' + r.name, data: r.html }); notas.push('El informe va en .html (no se pudo generar el PDF): ábrelo y usa «Imprimir o guardar PDF».'); }
      }
      files.push({ name: 'LEEME.txt', data: [
        'Paquete para el Agras · ' + b, 'Generado: ' + new Date().toLocaleString('es-CL'), '',
        '1_prescripcion_DJI     .tif + .tfw de dosis variable. Súbelos a DJI SmartFarm → Prescripción personalizada.',
        '2_poligonos_por_mancha un shapefile por mancha de cada tasa, para volar solo esa mancha (impórtalo como límite del campo).',
        '3_informe              informe del proyecto para el productor.', '',
        ...notas, ...(notas.length ? [''] : []),
        'Antes de volar, verifica en el control remoto que las dosis importadas coinciden con el informe. Haz una primera pasada de prueba con agua.',
      ].join('\r\n') });
      descargar(Z.zip(files), b + '_paquete_Agras.zip');
      aviso('Descargado ' + b + '_paquete_Agras.zip: prescripción, polígonos por mancha e informe.', 8000);
    } catch (e) {
      console.error(e); aviso('No se pudo armar el paquete: ' + (e.message || e), 9000);
    } finally { btn.disabled = false; btn.textContent = txt; }
  }
  function paqueteUI() {
    const p8 = pasoPorNum('8'), ref = $('expBtn');
    if (!p8 || !ref || $('psPaquete')) return;
    const w = document.createElement('div');
    w.innerHTML = `<button class="btn primary" id="psPaquete" type="button" style="width:100%;padding:12px">Paquete completo para el Agras (.zip)</button>
      <p class="ps-note" style="margin-top:6px">Un solo archivo con la prescripción (.tif + .tfw), los polígonos de vuelo por mancha y el informe en PDF.</p>`;
    const btns = ref.closest('.btns');
    (btns || ref).before(w);
    $('psPaquete').onclick = () => paquete($('psPaquete'));
  }

  // ---------- Inicio ----------
  function iniciar() {
    try { plantillas(); } catch (e) { console.error(e); }
    try { cargaRapidaUI(); } catch (e) { console.error(e); }
    try { informePdfUI(); } catch (e) { console.error(e); }
    try { paqueteUI(); } catch (e) { console.error(e); }
    try { modo(); } catch (e) { console.error(e); }
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', iniciar) : iniciar();

  window.PrescriptorSimple = { capturar, informeHTML, informePDF, aplicarPlantilla, cargaRapida, setModo, baseNombre, aviso, hayVuelo };
})();
