/* =====================================================================
   Prescriptor · Herramientas de valor agregado
   Botón «Herramientas» en la barra superior con:
     1. Puntos de inspección en terreno (vigor bajo + referencia), KML / GPX / CSV / Google Maps / hoja imprimible
     2. Comparar vuelos (dos GeoTIFF del índice de fechas distintas): mapa de cambio y % de área
     3. Cuaderno de campo: registro de aplicaciones, CSV para Excel y certificado de aplicación
     4. Cotizador: cotización imprimible con logo, IVA y número correlativo
   Todo funciona en el navegador, sin servidor. Lo que se guarda queda en este navegador.
   ===================================================================== */
(() => {
  if (window.__prescHerr) return;
  window.__prescHerr = true;
  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };
  const num = (v, d = 2) => Number.isFinite(v) ? v.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  const clp = v => '$ ' + Math.round(v || 0).toLocaleString('es-CL');
  const hoyISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const fechaCL = iso => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return d + '-' + m + '-' + y; };
  const S = () => window.PrescriptorSimple || {};
  const aviso = (m, ms) => (S().aviso ? S().aviso(m, ms) : alert(m));
  const proyecto = () => (($('projName') && $('projName').value.trim()) || (($('filetag') || {}).textContent || '').trim().replace(/\.[^.]+$/, '').replace(/^—$/, ''));
  const indice = () => (window.PrescriptorIndice ? window.PrescriptorIndice.get() : 'NDVI');
  const logo = () => (window.PrescriptorLogo ? window.PrescriptorLogo() : '');
  function descargar(data, nombre, tipo) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: tipo || 'application/octet-stream' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); HTMLAnchorElement.prototype.click.call(a); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  // Documento imprimible en una ventana nueva (o descarga .html si el navegador bloquea la ventana)
  function documento(titulo, cuerpo, nombre) {
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap">
<style>
 :root{--ink:#1a1b23;--muted:#5e6e82;--line:#d5dde6;--accent:#1e6fe0}
 *{box-sizing:border-box} body{margin:0;font-family:Montserrat,"Segoe UI",system-ui,sans-serif;color:var(--ink);background:#eef1f5;font-size:13px;line-height:1.45}
 .bar{position:sticky;top:0;background:#1a1b23;padding:10px;text-align:center} .bar button{border:0;border-radius:999px;padding:9px 18px;font:inherit;font-weight:700;color:#fff;background:linear-gradient(90deg,#0f5fe0,#1e88ff);cursor:pointer}
 .page{max-width:900px;margin:18px auto;background:#fff;padding:32px 36px;border-radius:10px;box-shadow:0 8px 30px rgba(31,59,87,.12)}
 header{display:flex;align-items:center;gap:16px;border-bottom:3px solid var(--accent);padding-bottom:14px;margin-bottom:18px}
 header img{max-height:56px;max-width:220px} header .t{margin-left:auto;text-align:right} header h1{margin:0;font-size:20px} header small{color:var(--muted)}
 h2{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin:22px 0 8px}
 table{width:100%;border-collapse:collapse} th,td{padding:7px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top} th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
 td.n,th.n{text-align:right} .kv td:first-child{color:var(--muted);width:38%} .tot td{font-weight:700;border-top:2px solid var(--ink)}
 .muted{color:var(--muted)} .firma{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:60px} .firma div{border-top:1px solid var(--ink);padding-top:6px;text-align:center;color:var(--muted)}
 img.full{width:100%;border-radius:8px;border:1px solid var(--line)} .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px} .chip{display:inline-block;padding:2px 9px;border-radius:99px;font-size:11px;font-weight:700;color:#fff}
 .nota{min-height:38px;border-bottom:1px dotted var(--line)}
 @media print{body{background:#fff}.bar{display:none}.page{box-shadow:none;margin:0;max-width:none;padding:0}.pb{break-before:page}}
</style></head><body><div class="bar"><button onclick="window.print()">Imprimir o guardar PDF</button></div><div class="page">
<header>${logo() ? `<img src="${logo()}" alt="Logo">` : ''}<div class="t"><h1>${esc(titulo)}</h1><small>${new Date().toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short' })}</small></div></header>
${cuerpo}</div></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
    else { descargar(html, nombre + '.html', 'text/html'); aviso('El navegador bloqueó la ventana: se descargó ' + nombre + '.html.'); }
  }

  // ---------- Cuadros de la prescripción actual ----------
  async function cuadros() {
    const btn = $('geojsonBtn');
    if (!btn || !S().capturar) return null;
    const r = await S().capturar(btn, l => l.some(x => /geojson/i.test(x.name)), 8000);
    const f = r.find(x => /geojson/i.test(x.name));
    if (!f) return null;
    try { return JSON.parse(typeof f.data === 'string' ? f.data : await f.blob.text()); } catch (e) { return null; }
  }
  function resumen(fc) {
    let ha = 0, lt = 0;
    for (const f of fc.features) { const p = f.properties || {}; if (p.clase) { const a = (p.area_m2 || 0) / 1e4; ha += a; lt += a * (p.dosis_lha || 0); } }
    return { ha, litros: lt, dosisMedia: ha ? lt / ha : 0 };
  }

  // ---------- Estilos ----------
  const css = document.createElement('style');
  css.textContent = `
  .hz-open{display:inline-flex;align-items:center;gap:7px}
  .hz-open svg{width:16px;height:16px}
  .hz-dlg{position:fixed;inset:0;z-index:5000;background:rgba(10,14,20,.55);display:grid;place-items:center;padding:16px}
  .hz-dlg[hidden]{display:none}
  .hz-box{width:min(1080px,100%);height:min(860px,calc(100vh - 32px));background:var(--panel,#fff);color:var(--fg,#1a1b23);border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.35);display:flex;flex-direction:column;overflow:hidden}
  .hz-top{display:flex;align-items:center;gap:6px;padding:10px 12px;border-bottom:1px solid var(--line,#d5dde6);flex-wrap:wrap}
  .hz-top h2{margin:0 10px 0 6px;font-size:15px}
  .hz-tabs{display:flex;gap:4px;flex-wrap:wrap}
  .hz-tabs button{border:0;background:transparent;color:var(--muted,#5e6e82);font:inherit;font-size:13px;font-weight:700;padding:8px 12px;border-radius:10px;cursor:pointer}
  .hz-tabs button[aria-selected="true"]{background:color-mix(in srgb,var(--accent,#1e88ff) 14%,transparent);color:var(--accent,#1e88ff)}
  .hz-x{margin-left:auto;border:0;background:transparent;color:var(--muted,#5e6e82);font-size:22px;line-height:1;width:36px;height:36px;border-radius:10px;cursor:pointer}
  .hz-x:hover{background:color-mix(in srgb,var(--fg,#000) 8%,transparent)}
  .hz-body{flex:1;overflow:auto;padding:16px 18px}
  .hz-body section[hidden]{display:none}
  .hz-body h3{margin:0 0 4px;font-size:16px}
  .hz-body p.hint{margin:0 0 12px}
  .hz-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px 12px;margin-bottom:12px}
  .hz-grid label{display:grid;gap:4px;font-size:12px;font-weight:600;color:var(--muted,#5e6e82)}
  .hz-grid input,.hz-grid select,.hz-grid textarea,.hz-tab input,.hz-tab select{font:inherit;font-size:14px;padding:8px 10px;border:1px solid var(--line,#d5dde6);border-radius:9px;background:var(--bg,#fff);color:var(--fg,#1a1b23);width:100%}
  .hz-grid .wide{grid-column:1/-1}
  .hz-btns{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 12px}
  .hz-split{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:16px;align-items:start}
  .hz-map{width:100%;border:1px solid var(--line,#d5dde6);border-radius:12px;background:color-mix(in srgb,var(--fg,#000) 4%,transparent);display:block}
  .hz-tab{width:100%;border-collapse:collapse;font-size:13px}
  .hz-tab th,.hz-tab td{padding:7px 6px;border-bottom:1px solid var(--line,#d5dde6);text-align:left;vertical-align:middle}
  .hz-tab th{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted,#5e6e82)}
  .hz-tab td.n,.hz-tab th.n{text-align:right}
  .hz-tab a{color:var(--accent,#1e88ff);font-weight:600}
  .hz-pin{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;color:#fff;font-size:11px;font-weight:800}
  .hz-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:10px 0}
  .hz-cards div{border:1px solid var(--line,#d5dde6);border-radius:12px;padding:10px 12px}
  .hz-cards strong{display:block;font-size:22px} .hz-cards span{font-size:12px;color:var(--muted,#5e6e82)}
  .hz-leg{display:flex;gap:6px;align-items:center;font-size:12px;color:var(--muted,#5e6e82);margin-top:6px}
  .hz-leg i{flex:1;height:10px;border-radius:5px;background:linear-gradient(90deg,#b2182b,#ef8a62,#f7f7f7,#7fbf7b,#1b7837)}
  .hz-empty{padding:18px;border:1px dashed var(--line,#d5dde6);border-radius:12px;color:var(--muted,#5e6e82);text-align:center}
  .hz-tot td{font-weight:700}
  @media (max-width:760px){.hz-split{grid-template-columns:1fr}.hz-box{height:100dvh;border-radius:0}.hz-dlg{padding:0}}`;
  document.head.appendChild(css);

  // ---------- Ventana ----------
  const dlg = document.createElement('div');
  dlg.className = 'hz-dlg'; dlg.hidden = true;
  dlg.innerHTML = `<div class="hz-box" role="dialog" aria-modal="true" aria-label="Herramientas">
    <div class="hz-top"><h2>Herramientas</h2>
      <div class="hz-tabs" role="tablist">
        <button role="tab" data-t="puntos" aria-selected="true">Puntos de inspección</button>
        <button role="tab" data-t="comparar" aria-selected="false">Comparar vuelos</button>
        <button role="tab" data-t="cuaderno" aria-selected="false">Cuaderno de campo</button>
        <button role="tab" data-t="cotizador" aria-selected="false">Cotizador</button>
      </div>
      <button class="hz-x" type="button" aria-label="Cerrar">×</button></div>
    <div class="hz-body">
      <section data-s="puntos"></section><section data-s="comparar" hidden></section>
      <section data-s="cuaderno" hidden></section><section data-s="cotizador" hidden></section>
    </div></div>`;
  const sec = n => dlg.querySelector('section[data-s="' + n + '"]');
  let pestana = 'puntos';
  function abrir(t) {
    if (t) pestana = t;
    dlg.hidden = false;
    dlg.querySelectorAll('.hz-tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === pestana)));
    dlg.querySelectorAll('.hz-body section').forEach(s => { s.hidden = s.dataset.s !== pestana; });
    ({ puntos: initPuntos, comparar: initComparar, cuaderno: initCuaderno, cotizador: initCotizador })[pestana]();
  }
  const cerrar = () => { dlg.hidden = true; };
  dlg.querySelector('.hz-x').onclick = cerrar;
  dlg.onclick = e => { if (e.target === dlg) cerrar(); };
  dlg.addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(); });
  dlg.querySelector('.hz-tabs').onclick = e => { const b = e.target.closest('button'); if (b) abrir(b.dataset.t); };

  // =================================================================
  // 1) PUNTOS DE INSPECCIÓN
  // =================================================================
  const COL = { 2: ['#c8402f', '#2f8a50'], 3: ['#c8402f', '#e6c13d', '#2f8a50'], 4: ['#c8402f', '#ec8d48', '#9dc85a', '#2f8a50'], 5: ['#c8402f', '#ec8d48', '#e6c13d', '#9dc85a', '#2f8a50'] };
  let PI = null; // { fc, puntos, nClases }
  function initPuntos() {
    const s = sec('puntos');
    if (s.dataset.ok) return; s.dataset.ok = 1;
    s.innerHTML = `<h3>Puntos de inspección en terreno</h3>
      <p class="hint">Ubica los puntos que el agrónomo debe revisar: el centro de las manchas de vigor más bajo y, como comparación, algunas de vigor alto. Se descargan para el GPS o el celular.</p>
      <div class="hz-grid">
        <label>Puntos de vigor bajo<input type="number" id="hzNBajo" min="1" max="30" value="6"></label>
        <label>Puntos de referencia (vigor alto)<input type="number" id="hzNAlto" min="0" max="10" value="2"></label>
        <label>Mancha mínima (cuadros)<input type="number" id="hzMinC" min="1" max="500" value="4"></label>
      </div>
      <div class="hz-btns"><button class="btn primary" id="hzCalc" type="button">Calcular puntos</button></div>
      <div id="hzPRes"></div>`;
    $('hzCalc').onclick = calcularPuntos;
  }
  function centroide(rings) {
    let a = 0, cx = 0, cy = 0;
    for (const r of rings) for (let i = 0, n = r.length - 1; i < n; i++) { const [x1, y1] = r[i], [x2, y2] = r[i + 1], f = x1 * y2 - x2 * y1; a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f; }
    return a ? [cx / (3 * a), cy / (3 * a)] : rings[0][0];
  }
  async function calcularPuntos() {
    const out = $('hzPRes'); out.innerHTML = '<p class="hint">Calculando…</p>';
    const fc = await cuadros();
    if (!fc || !fc.features.length) { out.innerHTML = '<div class="hz-empty">Primero carga un vuelo y define las tasas.</div>'; return; }
    const Z = window.PrescriptorZonas;
    const feats = fc.features.filter(f => f.properties && f.properties.clase);
    const nClases = Math.max(...feats.map(f => f.properties.clase));
    const minC = Math.max(1, +$('hzMinC').value || 1);
    function puntosDe(clase, n, tipo) {
      const fs = feats.filter(f => f.properties.clase === clase);
      const anillos = fs.map(f => f.geometry.coordinates[0]);
      const grupos = Z ? Z.manchasDe(anillos) : anillos.map(a => [a]);
      const idx = new Map(anillos.map((a, i) => [a, fs[i]]));
      return grupos.filter(g => g.length >= minC).map(g => {
        const cs = g.map(a => idx.get(a));
        const ndvi = cs.map(c => c.properties.ndvi).filter(Number.isFinite);
        const area = cs.reduce((t, c) => t + (c.properties.area_m2 || 0), 0) / 1e4;
        // Punto: centro del cuadro de la mancha más cercano a su centro (siempre cae dentro de la mancha)
        const cents = g.map(a => { const r = a.slice(0, -1); return [r.reduce((t, p) => t + p[0], 0) / r.length, r.reduce((t, p) => t + p[1], 0) / r.length]; });
        const c0 = centroide(g); let best = 0, bd = Infinity;
        cents.forEach((c, i) => { const d = (c[0] - c0[0]) ** 2 + (c[1] - c0[1]) ** 2; if (d < bd) { bd = d; best = i; } });
        return { tipo, clase, lon: cents[best][0], lat: cents[best][1], ha: area, cuadros: g.length, ndvi: ndvi.length ? ndvi.reduce((t, v) => t + v, 0) / ndvi.length : NaN, dosis: cs[0].properties.dosis_lha, zona: cs[0].properties.zona };
      }).sort((a, b) => b.ha - a.ha).slice(0, n);
    }
    const bajo = puntosDe(1, Math.max(0, +$('hzNBajo').value || 0), 'bajo');
    const alto = nClases > 1 ? puntosDe(nClases, Math.max(0, +$('hzNAlto').value || 0), 'alto') : [];
    const puntos = [...bajo, ...alto].map((p, i) => ({ ...p, n: i + 1 }));
    PI = { fc, puntos, nClases };
    if (!puntos.length) { out.innerHTML = '<div class="hz-empty">No hay manchas del tamaño mínimo. Baja «Mancha mínima».</div>'; return; }
    const ix = indice(), gm = p => `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(7)},${p.lon.toFixed(7)}`;
    const ruta = 'https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=' + puntos[puntos.length - 1].lat.toFixed(7) + ',' + puntos[puntos.length - 1].lon.toFixed(7) +
      (puntos.length > 1 ? '&waypoints=' + puntos.slice(0, -1).slice(0, 9).map(p => p.lat.toFixed(7) + ',' + p.lon.toFixed(7)).join('%7C') : '');
    out.innerHTML = `<div class="hz-split"><div><img class="hz-map" id="hzPMap" alt="Mapa de puntos"></div><div>
      <table class="hz-tab"><thead><tr><th>#</th><th>Tipo</th><th class="n">ha</th><th class="n">${ix}</th><th>Ubicación</th></tr></thead><tbody>
      ${puntos.map(p => `<tr><td><span class="hz-pin" style="background:${p.tipo === 'bajo' ? '#1a1b23' : '#1e6fe0'}">${p.n}</span></td>
        <td>${p.tipo === 'bajo' ? 'Vigor bajo' : 'Referencia'}<br><small class="muted">tasa ${p.clase} · ${p.cuadros} cuadros</small></td>
        <td class="n">${num(p.ha, 2)}</td><td class="n">${num(p.ndvi, 2)}</td>
        <td><a href="${gm(p)}" target="_blank" rel="noopener">${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}</a></td></tr>`).join('')}
      </tbody></table>
      <div class="hz-btns" style="margin-top:12px">
        <a class="btn primary" href="${ruta}" target="_blank" rel="noopener">Ruta a pie en Google Maps</a>
        <button class="btn" type="button" id="hzKml">KML</button><button class="btn" type="button" id="hzGpx">GPX</button>
        <button class="btn" type="button" id="hzCsv">CSV</button><button class="btn" type="button" id="hzHoja">Hoja de inspección</button>
      </div><p class="hint">KML para Google Earth o el control; GPX para GPS y apps de celular; la hoja se imprime para anotar en terreno. La ruta de Google Maps admite hasta 10 puntos.</p></div></div>`;
    $('hzPMap').src = mapaPuntos(fc, puntos, nClases, 900);
    const base = (S().baseNombre ? S().baseNombre() : 'puntos') + '_inspeccion';
    $('hzKml').onclick = () => descargar(kml(puntos), base + '.kml', 'application/vnd.google-earth.kml+xml');
    $('hzGpx').onclick = () => descargar(gpx(puntos), base + '.gpx', 'application/gpx+xml');
    $('hzCsv').onclick = () => descargar('﻿' + ['Punto;Tipo;Tasa;Latitud;Longitud;ha;' + ix + ';Google Maps',
      ...puntos.map(p => [p.n, p.tipo === 'bajo' ? 'Vigor bajo' : 'Referencia', p.clase, p.lat.toFixed(7), p.lon.toFixed(7), num(p.ha, 3), num(p.ndvi, 3), gm(p)].join(';'))].join('\r\n'), base + '.csv', 'text/csv');
    $('hzHoja').onclick = () => hojaInspeccion(puntos, $('hzPMap').src);
  }
  // Mapa (PNG) con los cuadros coloreados por tasa y los puntos numerados
  function mapaPuntos(fc, puntos, nClases, W) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const f of fc.features) for (const [x, y] of f.geometry.coordinates[0]) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); }
    const kx = Math.cos(((y1 + y2) / 2) * Math.PI / 180), w = (x2 - x1) * kx, h = y2 - y1, pad = 24;
    const sc = (W - 2 * pad) / w, H = Math.round(h * sc + 2 * pad);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.fillStyle = '#f3f5f8'; g.fillRect(0, 0, W, H);
    const X = x => pad + (x - x1) * kx * sc, Y = y => pad + (y2 - y) * sc;
    const cols = COL[nClases] || COL[5];
    for (const f of fc.features) {
      const cl = (f.properties || {}).clase; g.fillStyle = cl ? cols[cl - 1] : '#c9ced6'; g.globalAlpha = cl ? .85 : .5;
      g.beginPath(); f.geometry.coordinates[0].forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.fill();
    }
    g.globalAlpha = 1;
    for (const p of puntos) {
      const px = X(p.lon), py = Y(p.lat);
      g.beginPath(); g.arc(px, py, 13, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
      g.beginPath(); g.arc(px, py, 10, 0, Math.PI * 2); g.fillStyle = p.tipo === 'bajo' ? '#1a1b23' : '#1e6fe0'; g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(p.n), px, py + .5);
    }
    return c.toDataURL('image/png');
  }
  const xmlEsc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  function kml(ps) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xmlEsc(proyecto() || 'Puntos de inspección')}</name>
<Style id="bajo"><IconStyle><color>ff2f40c8</color><scale>1.2</scale></IconStyle></Style><Style id="alto"><IconStyle><color>ff508a2f</color><scale>1.2</scale></IconStyle></Style>
${ps.map(p => `<Placemark><name>${p.n}</name><styleUrl>#${p.tipo}</styleUrl><description>${xmlEsc((p.tipo === 'bajo' ? 'Vigor bajo' : 'Referencia (vigor alto)') + ' · tasa ' + p.clase + ' · ' + num(p.ha, 2) + ' ha · ' + indice() + ' ' + num(p.ndvi, 2))}</description><Point><coordinates>${p.lon.toFixed(7)},${p.lat.toFixed(7)},0</coordinates></Point></Placemark>`).join('\n')}
</Document></kml>`;
  }
  function gpx(ps) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Prescriptor" xmlns="http://www.topografix.com/GPX/1/1">
${ps.map(p => `<wpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}"><name>${p.n} ${p.tipo === 'bajo' ? 'Vigor bajo' : 'Referencia'}</name><desc>${xmlEsc('tasa ' + p.clase + ' · ' + num(p.ha, 2) + ' ha · ' + indice() + ' ' + num(p.ndvi, 2))}</desc></wpt>`).join('\n')}
</gpx>`;
  }
  function hojaInspeccion(ps, img) {
    const ix = indice();
    documento('Hoja de inspección en terreno', `
      <table class="kv"><tr><td>Predio / proyecto</td><td>${esc(proyecto() || '—')}</td></tr><tr><td>Índice</td><td>${ix}</td></tr>
      <tr><td>Inspector</td><td class="nota"></td></tr><tr><td>Fecha de visita</td><td class="nota"></td></tr></table>
      <h2>Mapa</h2><img class="full" src="${img}" alt="Mapa de puntos">
      <p class="muted">Puntos negros: vigor bajo. Puntos azules: referencia de vigor alto para comparar.</p>
      <h2 class="pb">Puntos</h2><table><thead><tr><th>#</th><th>Tipo</th><th>Coordenadas</th><th class="n">ha</th><th class="n">${ix}</th><th style="width:38%">Observación en terreno</th></tr></thead><tbody>
      ${ps.map(p => `<tr><td><b>${p.n}</b></td><td>${p.tipo === 'bajo' ? 'Vigor bajo' : 'Referencia'}</td><td>${p.lat.toFixed(6)}<br>${p.lon.toFixed(6)}</td><td class="n">${num(p.ha, 2)}</td><td class="n">${num(p.ndvi, 2)}</td><td class="nota"></td></tr>`).join('')}
      </tbody></table>
      <p class="muted">Revisar en cada punto: riego (goteros, humedad), plagas y enfermedades, nutrición (color de hojas), malezas, daño mecánico, suelo.</p>`, 'hoja_inspeccion');
  }

  // =================================================================
  // 2) COMPARAR VUELOS
  // =================================================================
  function initComparar() {
    const s = sec('comparar');
    if (s.dataset.ok) return; s.dataset.ok = 1;
    s.innerHTML = `<h3>Comparar dos vuelos</h3>
      <p class="hint">Carga el GeoTIFF del índice de dos fechas del mismo predio. Se calcula el cambio en cada punto: verde mejoró, rojo empeoró.</p>
      <div class="hz-grid">
        <label>Vuelo anterior (.tif)<input type="file" id="hzA" accept=".tif,.tiff"></label>
        <label>Fecha anterior<input type="date" id="hzFA"></label>
        <label>Vuelo reciente (.tif)<input type="file" id="hzB" accept=".tif,.tiff"></label>
        <label>Fecha reciente<input type="date" id="hzFB"></label>
        <label>Cambio mínimo a considerar<input type="number" id="hzU" min="0.01" max="0.5" step="0.01" value="0.05"></label>
        <label>Ignorar suelo (índice menor a)<input type="number" id="hzSuelo" min="-1" max="1" step="0.05" value="0.2"></label>
      </div>
      <div class="hz-btns"><button class="btn primary" id="hzComp" type="button">Comparar</button></div>
      <div id="hzCRes"></div>`;
    for (const [i, f] of [['hzA', 'hzFA'], ['hzB', 'hzFB']]) $(i).onchange = e => { const d = fechaDeNombre((e.target.files[0] || {}).name || ''); if (d) $(f).value = d; };
    $('hzComp').onclick = comparar;
  }
  function fechaDeNombre(n) {
    let m = n.match(/(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = n.match(/(\d{2})[-_.](\d{2})[-_.](20\d{2})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return '';
  }
  function crsDe(img) {
    const k = img.getGeoKeys() || {}, code = k.ProjectedCSTypeGeoKey || k.GeographicTypeGeoKey;
    if (code === 4326 || (!k.ProjectedCSTypeGeoKey && k.GeographicTypeGeoKey)) return { code: 4326, def: '+proj=longlat +datum=WGS84 +no_defs' };
    if ((code >= 32601 && code <= 32660) || (code >= 32701 && code <= 32760)) {
      const sur = code > 32700, zona = code - (sur ? 32700 : 32600);
      return { code, def: `+proj=utm +zone=${zona}${sur ? ' +south' : ''} +datum=WGS84 +units=m +no_defs` };
    }
    return code ? { code, def: null } : null;
  }
  async function leerIndice(file, maxDim) {
    const tiff = await GeoTIFF.fromBlob(file), img = await tiff.getImage();
    const W = img.getWidth(), H = img.getHeight(), f = Math.max(1, Math.max(W, H) / maxDim);
    const w = Math.round(W / f), h = Math.round(H / f);
    const [band] = await img.readRasters({ samples: [0], width: w, height: h, resampleMethod: 'nearest' });
    const bb = img.getBoundingBox(), nd = img.getGDALNoData(), crs = crsDe(img);
    return { w, h, bb, nd, crs, data: band, bandas: img.getSamplesPerPixel(), nombre: file.name };
  }
  async function comparar() {
    const fa = $('hzA').files[0], fb = $('hzB').files[0], out = $('hzCRes');
    if (!fa || !fb) { out.innerHTML = '<div class="hz-empty">Elige los dos archivos.</div>'; return; }
    out.innerHTML = '<p class="hint">Leyendo y comparando…</p>';
    try {
      const A = await leerIndice(fa, 1400), B = await leerIndice(fb, 2000);
      if (A.bandas !== 1 || B.bandas !== 1) throw new Error('los dos archivos deben ser GeoTIFF del índice, de una banda');
      if (!A.crs || !B.crs || !A.crs.def || !B.crs.def) throw new Error('sistema de coordenadas no reconocido (se aceptan WGS84 y UTM)');
      const tr = A.crs.code === B.crs.code ? null : proj4(A.crs.def, B.crs.def);
      const U = Math.max(0.001, +$('hzU').value || 0.05), suelo = parseFloat($('hzSuelo').value);
      const ok = (v, nd) => Number.isFinite(v) && v !== nd && v >= -1.5 && v <= 1.5;
      const dx = (A.bb[2] - A.bb[0]) / A.w, dy = (A.bb[3] - A.bb[1]) / A.h;
      const bdx = (B.bb[2] - B.bb[0]) / B.w, bdy = (B.bb[3] - B.bb[1]) / B.h;
      const diff = new Float32Array(A.w * A.h).fill(NaN);
      let n = 0, mej = 0, emp = 0, est = 0, suma = 0, sA = 0, sB = 0, solape = 0, validosA = 0;
      for (let r = 0; r < A.h; r++) {
        const y = A.bb[3] - (r + 0.5) * dy;
        for (let c = 0; c < A.w; c++) {
          const va = A.data[r * A.w + c];
          if (!ok(va, A.nd)) continue;
          validosA++;
          let x = A.bb[0] + (c + 0.5) * dx, yy = y;
          if (tr) [x, yy] = tr.forward([x, yy]);
          const bc = Math.floor((x - B.bb[0]) / bdx), br = Math.floor((B.bb[3] - yy) / bdy);
          if (bc < 0 || br < 0 || bc >= B.w || br >= B.h) continue;
          const vb = B.data[br * B.w + bc];
          if (!ok(vb, B.nd)) continue;
          solape++;
          if (Number.isFinite(suelo) && va < suelo && vb < suelo) continue;
          const d = vb - va; diff[r * A.w + c] = d; n++; suma += d; sA += va; sB += vb;
          if (d >= U) mej++; else if (d <= -U) emp++; else est++;
        }
      }
      if (!solape) throw new Error('los vuelos no se superponen: revisa que sean del mismo predio');
      if (!n) throw new Error('no quedó vegetación para comparar: baja «Ignorar suelo»');
      // Área de cada píxel en ha (en grados se aproxima con la latitud)
      const lat = (A.bb[1] + A.bb[3]) / 2;
      const pxHa = A.crs.code === 4326 ? (dx * 111320 * Math.cos(lat * Math.PI / 180)) * (dy * 110574) / 1e4 : dx * dy / 1e4;
      const R = { A, B, n, mej, emp, est, media: suma / n, mediaA: sA / n, mediaB: sB / n, ha: n * pxHa, cobertura: solape / validosA, U };
      const png = mapaCambio(diff, A.w, A.h, U);
      const fA = $('hzFA').value, fB = $('hzFB').value, ix = indice(), pct = v => num(100 * v / n, 1) + ' %';
      out.innerHTML = `<div class="hz-cards">
          <div><strong style="color:#1b7837">${pct(mej)}</strong><span>mejoró (≥ +${num(U, 2)})</span></div>
          <div><strong style="color:#b2182b">${pct(emp)}</strong><span>empeoró (≤ −${num(U, 2)})</span></div>
          <div><strong>${pct(est)}</strong><span>sin cambio relevante</span></div>
          <div><strong>${(R.media >= 0 ? '+' : '') + num(R.media, 3)}</strong><span>cambio medio del ${ix} (${num(R.mediaA, 2)} → ${num(R.mediaB, 2)})</span></div></div>
        <div class="hz-split"><div><img class="hz-map" id="hzCMap" src="${png}" alt="Mapa de cambio">
          <div class="hz-leg">empeoró <i></i> mejoró</div></div>
        <div><table class="hz-tab"><tbody>
          <tr><td>Vuelo anterior</td><td>${esc(A.nombre)}${fA ? '<br><small>' + fechaCL(fA) + '</small>' : ''}</td></tr>
          <tr><td>Vuelo reciente</td><td>${esc(B.nombre)}${fB ? '<br><small>' + fechaCL(fB) + '</small>' : ''}</td></tr>
          <tr><td>Superficie comparada</td><td>${num(R.ha, 2)} ha</td></tr>
          <tr><td>Superposición</td><td>${num(100 * R.cobertura, 0)} % del vuelo anterior</td></tr></tbody></table>
          <div class="hz-btns" style="margin-top:12px"><button class="btn primary" id="hzEvo" type="button">Informe de evolución</button><button class="btn" id="hzPng" type="button">Descargar mapa (.png)</button></div>
          <p class="hint">Para que la comparación sea justa, los dos vuelos deben tener la misma calibración (mismo dron y panel de reflectancia) y una hora del día parecida.</p></div></div>`;
      $('hzPng').onclick = () => fetch(png).then(r => r.blob()).then(b => descargar(b, 'cambio_' + ix + '.png'));
      $('hzEvo').onclick = () => documento('Evolución del ' + ix, `
        <table class="kv"><tr><td>Predio / proyecto</td><td>${esc(proyecto() || '—')}</td></tr>
        <tr><td>Vuelo anterior</td><td>${fA ? fechaCL(fA) + ' · ' : ''}${esc(A.nombre)}</td></tr><tr><td>Vuelo reciente</td><td>${fB ? fechaCL(fB) + ' · ' : ''}${esc(B.nombre)}</td></tr>
        <tr><td>Superficie comparada</td><td>${num(R.ha, 2)} ha</td></tr><tr><td>${ix} medio</td><td>${num(R.mediaA, 3)} → ${num(R.mediaB, 3)} (${(R.media >= 0 ? '+' : '') + num(R.media, 3)})</td></tr></table>
        <h2>Resultado</h2><table><thead><tr><th>Estado</th><th class="n">% de la superficie</th><th class="n">ha</th></tr></thead><tbody>
        <tr><td><span class="chip" style="background:#1b7837">Mejoró</span></td><td class="n">${pct(mej)}</td><td class="n">${num(mej * pxHa, 2)}</td></tr>
        <tr><td><span class="chip" style="background:#888">Sin cambio</span></td><td class="n">${pct(est)}</td><td class="n">${num(est * pxHa, 2)}</td></tr>
        <tr><td><span class="chip" style="background:#b2182b">Empeoró</span></td><td class="n">${pct(emp)}</td><td class="n">${num(emp * pxHa, 2)}</td></tr></tbody></table>
        <h2>Mapa de cambio</h2><img class="full" src="${png}" alt="Mapa de cambio">
        <p class="muted">Rojo: el ${ix} bajó al menos ${num(U, 2)}. Verde: subió al menos ${num(U, 2)}. Blanco: sin cambio relevante. Se excluyó el suelo (${ix} menor a ${num(suelo, 2)} en ambas fechas).</p>`, 'evolucion_' + ix);
    } catch (e) { console.error(e); out.innerHTML = '<div class="hz-empty">No se pudo comparar: ' + esc(e.message || e) + '</div>'; }
  }
  function mapaCambio(d, w, h, U) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), im = g.createImageData(w, h), M = Math.max(U * 4, 0.2);
    const stops = [[-1, [178, 24, 43]], [-.5, [239, 138, 98]], [0, [247, 247, 247]], [.5, [127, 191, 123]], [1, [27, 120, 55]]];
    for (let i = 0; i < d.length; i++) {
      const v = d[i]; if (!Number.isFinite(v)) continue;
      let t = Math.max(-1, Math.min(1, v / M)); if (Math.abs(v) < U) t = 0;
      let k = 0; while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
      const [t0, c0] = stops[k], [t1, c1] = stops[k + 1], f = (t - t0) / (t1 - t0);
      im.data[i * 4] = c0[0] + (c1[0] - c0[0]) * f; im.data[i * 4 + 1] = c0[1] + (c1[1] - c0[1]) * f; im.data[i * 4 + 2] = c0[2] + (c1[2] - c0[2]) * f; im.data[i * 4 + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    return c.toDataURL('image/png');
  }

  // =================================================================
  // 3) CUADERNO DE CAMPO
  // =================================================================
  const CK = 'presc_cuaderno';
  const CAMPOS = [
    ['fecha', 'Fecha', 'date'], ['predio', 'Predio / cuartel', 'text'], ['cultivo', 'Cultivo / variedad', 'text'], ['ha', 'Superficie aplicada (ha)', 'number'],
    ['producto', 'Producto comercial', 'text'], ['ia', 'Ingrediente activo', 'text'], ['dosis', 'Dosis de producto', 'text'], ['caldo', 'Caldo (L/ha)', 'number'],
    ['objetivo', 'Objetivo (plaga, enfermedad, nutrición)', 'text'], ['carencia', 'Carencia (días)', 'number'], ['reingreso', 'Reingreso (horas)', 'number'],
    ['dron', 'Dron', 'text'], ['operador', 'Operador / piloto', 'text'], ['temp', 'Temperatura (°C)', 'number'], ['viento', 'Viento (km/h)', 'number'],
    ['hr', 'Humedad relativa (%)', 'number'], ['obs', 'Observaciones', 'text'],
  ];
  const registros = () => ls.get(CK, []);
  async function initCuaderno() {
    const s = sec('cuaderno');
    if (!s.dataset.ok) {
      s.dataset.ok = 1;
      s.innerHTML = `<h3>Cuaderno de campo</h3>
        <p class="hint">Registra cada aplicación: queda la trazabilidad que piden las exportadoras y certificaciones, y puedes entregar un certificado al productor.</p>
        <div class="hz-grid" id="hzCForm">${CAMPOS.map(([k, t, ty]) => `<label${k === 'obs' ? ' class="wide"' : ''}>${t}<input id="hzC_${k}" type="${ty}"${ty === 'number' ? ' step="any" min="0"' : ''}></label>`).join('')}</div>
        <div class="hz-btns"><button class="btn primary" id="hzCSave" type="button">Guardar registro</button><button class="btn" id="hzCAuto" type="button">Completar con la prescripción actual</button></div>
        <p class="hint" id="hzCCar"></p>
        <div id="hzCList"></div>`;
      $('hzCSave').onclick = guardarRegistro;
      $('hzCAuto').onclick = () => autocompletar(true);
      $('hzC_carencia').oninput = $('hzC_fecha').oninput = carencia;
    }
    if (!$('hzC_fecha').value) $('hzC_fecha').value = hoyISO();
    await autocompletar(false);
    listaRegistros();
  }
  async function autocompletar(forzar) {
    const set = (k, v) => { const el = $('hzC_' + k); if (el && (forzar || !el.value) && v != null && v !== '') el.value = v; };
    set('predio', proyecto());
    const dr = $('droneSel'); if (dr && dr.selectedOptions[0]) set('dron', dr.selectedOptions[0].textContent.split('·')[0].trim());
    const fc = await cuadros();
    if (fc) { const r = resumen(fc); set('ha', +r.ha.toFixed(2)); set('caldo', Math.round(r.dosisMedia)); }
    carencia();
  }
  function carencia() {
    const f = $('hzC_fecha').value, c = parseInt($('hzC_carencia').value, 10);
    if (!f || !Number.isFinite(c)) { $('hzCCar').textContent = ''; return; }
    const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + c);
    $('hzCCar').textContent = 'Cosecha permitida desde el ' + d.toLocaleDateString('es-CL', { dateStyle: 'long' }) + ' (carencia de ' + c + ' días).';
  }
  function cosechaDesde(r) { if (!r.fecha || !Number.isFinite(+r.carencia) || r.carencia === '') return ''; const d = new Date(r.fecha + 'T12:00:00'); d.setDate(d.getDate() + (+r.carencia)); return d.toISOString().slice(0, 10); }
  function guardarRegistro() {
    const r = { id: Date.now() };
    for (const [k] of CAMPOS) r[k] = $('hzC_' + k).value.trim();
    if (!r.fecha || !r.predio || !r.producto) { aviso('Completa al menos fecha, predio y producto.'); return; }
    const lista = registros(); lista.push(r);
    if (!ls.set(CK, lista)) { aviso('Este navegador no permitió guardar el registro.'); return; }
    for (const k of ['producto', 'ia', 'dosis', 'objetivo', 'carencia', 'reingreso', 'temp', 'viento', 'hr', 'obs']) $('hzC_' + k).value = '';
    carencia(); listaRegistros(); aviso('Registro guardado.');
  }
  function listaRegistros() {
    const l = registros().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || b.id - a.id), box = $('hzCList');
    if (!l.length) { box.innerHTML = '<div class="hz-empty">Aún no hay aplicaciones registradas en este navegador.</div>'; return; }
    box.innerHTML = `<div class="hz-btns"><button class="btn" id="hzCCsv" type="button">Exportar a Excel (.csv)</button><span class="hint" style="align-self:center">${l.length} registro${l.length === 1 ? '' : 's'} · quedan en este navegador; exporta para respaldar.</span></div>
      <table class="hz-tab"><thead><tr><th>Fecha</th><th>Predio</th><th>Producto</th><th class="n">ha</th><th>Cosecha desde</th><th></th></tr></thead><tbody>
      ${l.map(r => `<tr><td>${fechaCL(r.fecha)}</td><td>${esc(r.predio)}</td><td>${esc(r.producto)}${r.dosis ? '<br><small class="muted">' + esc(r.dosis) + '</small>' : ''}</td><td class="n">${r.ha ? num(+r.ha, 2) : ''}</td><td>${fechaCL(cosechaDesde(r))}</td>
        <td style="white-space:nowrap"><button class="btn" type="button" data-cert="${r.id}">Certificado</button> <button class="btn" type="button" data-del="${r.id}" title="Borrar">×</button></td></tr>`).join('')}
      </tbody></table>`;
    $('hzCCsv').onclick = () => {
      const cab = [...CAMPOS.map(c => c[1]), 'Cosecha permitida desde'];
      const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const NUM = new Set(CAMPOS.filter(c => c[2] === 'number').map(c => c[0]));
      const val = (k, v) => k === 'fecha' ? fechaCL(v) : (NUM.has(k) ? String(v || '').replace('.', ',') : v);
      descargar('﻿' + [cab.map(q).join(';'), ...l.map(r => [...CAMPOS.map(([k]) => val(k, r[k])), fechaCL(cosechaDesde(r))].map(q).join(';'))].join('\r\n'), 'cuaderno_de_campo.csv', 'text/csv');
    };
    box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { if (!confirm('¿Borrar este registro?')) return; ls.set(CK, registros().filter(r => r.id !== +b.dataset.del)); listaRegistros(); });
    box.querySelectorAll('[data-cert]').forEach(b => b.onclick = () => certificado(registros().find(r => r.id === +b.dataset.cert)));
  }
  function certificado(r) {
    if (!r) return;
    const fila = (t, v) => v ? `<tr><td>${t}</td><td>${esc(v)}</td></tr>` : '';
    documento('Certificado de aplicación', `
      <h2>Aplicación</h2><table class="kv">${fila('Fecha', fechaCL(r.fecha))}${fila('Predio / cuartel', r.predio)}${fila('Cultivo / variedad', r.cultivo)}${fila('Superficie aplicada', r.ha && num(+r.ha, 2) + ' ha')}${fila('Objetivo', r.objetivo)}</table>
      <h2>Producto</h2><table class="kv">${fila('Producto comercial', r.producto)}${fila('Ingrediente activo', r.ia)}${fila('Dosis de producto', r.dosis)}${fila('Volumen de caldo', r.caldo && num(+r.caldo, 0) + ' L/ha')}
        ${fila('Carencia', r.carencia && r.carencia + ' días')}${fila('Cosecha permitida desde', fechaCL(cosechaDesde(r)) !== '—' ? fechaCL(cosechaDesde(r)) : '')}${fila('Reingreso', r.reingreso && r.reingreso + ' horas')}</table>
      <h2>Equipo y condiciones</h2><table class="kv">${fila('Equipo', r.dron && 'Dron ' + r.dron + ' con prescripción de dosis variable')}${fila('Operador / piloto', r.operador)}
        ${fila('Temperatura', r.temp && r.temp + ' °C')}${fila('Viento', r.viento && r.viento + ' km/h')}${fila('Humedad relativa', r.hr && r.hr + ' %')}${fila('Observaciones', r.obs)}</table>
      <div class="firma"><div>Operador / piloto</div><div>Recibe conforme (productor)</div></div>`, 'certificado_aplicacion');
  }

  // =================================================================
  // 4) COTIZADOR
  // =================================================================
  const QK = 'presc_cotizador';
  function initCotizador() {
    const s = sec('cotizador');
    if (s.dataset.ok) { refrescarHa(); return; }
    s.dataset.ok = 1;
    const cfg = ls.get(QK, { tarifa: 0, traslado: 0, minimo: 0, iva: true, validez: 15, emisor: '', n: 0 });
    s.innerHTML = `<h3>Cotizador</h3>
      <p class="hint">Arma la cotización del servicio con la superficie del proyecto. Las tarifas se recuerdan para la próxima.</p>
      <div class="hz-grid">
        <label>Cliente<input id="hzQCli" type="text" placeholder="Nombre o razón social"></label>
        <label>RUT del cliente<input id="hzQRut" type="text" placeholder="Opcional"></label>
        <label>Predio<input id="hzQPre" type="text"></label>
        <label>Emisor (tu empresa)<input id="hzQEmi" type="text" value="${esc(cfg.emisor)}" placeholder="Ej.: Summit Agro Chile"></label>
      </div>
      <table class="hz-tab" id="hzQTab"><thead><tr><th style="width:44%">Descripción</th><th class="n">Cantidad</th><th>Unidad</th><th class="n">Precio unitario ($)</th><th class="n">Subtotal</th><th></th></tr></thead><tbody></tbody></table>
      <div class="hz-btns"><button class="btn" id="hzQAdd" type="button">+ Agregar línea</button></div>
      <div class="hz-grid">
        <label>Cargo mínimo ($)<input id="hzQMin" type="number" min="0" step="1000" value="${cfg.minimo || ''}"></label>
        <label>Descuento (%)<input id="hzQDes" type="number" min="0" max="100" step="1" value="0"></label>
        <label>Validez (días)<input id="hzQVal" type="number" min="1" step="1" value="${cfg.validez || 15}"></label>
        <label style="align-self:end;display:flex;gap:8px;align-items:center"><input id="hzQIva" type="checkbox" style="width:auto" ${cfg.iva ? 'checked' : ''}> Agregar IVA (19 %)</label>
        <label class="wide">Notas<input id="hzQNot" type="text" placeholder="Ej.: incluye vuelo multiespectral previo y prescripción."></label>
      </div>
      <table class="hz-tab" style="max-width:420px;margin-left:auto"><tbody id="hzQTot"></tbody></table>
      <div class="hz-btns" style="justify-content:flex-end"><button class="btn primary" id="hzQGen" type="button">Generar cotización</button></div>`;
    const tb = $('hzQTab').querySelector('tbody');
    const fila = (d = '', c = 1, u = 'ha', p = 0) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><input class="d" type="text" value="${esc(d)}"></td><td><input class="c" type="number" min="0" step="any" value="${c}" style="text-align:right"></td>
        <td><input class="u" type="text" value="${esc(u)}" style="width:70px"></td><td><input class="p" type="number" min="0" step="any" value="${p || ''}" style="text-align:right"></td><td class="n s">—</td>
        <td><button class="btn" type="button" title="Quitar">×</button></td>`;
      tr.querySelector('button').onclick = () => { tr.remove(); totales(); };
      tr.querySelectorAll('input').forEach(i => i.oninput = totales);
      tb.appendChild(tr);
    };
    fila('Aplicación con dron · dosis variable', 0, 'ha', cfg.tarifa);
    fila('Traslado de equipo', 1, 'servicio', cfg.traslado);
    $('hzQAdd').onclick = () => { fila(); totales(); };
    ['hzQMin', 'hzQDes', 'hzQIva'].forEach(id => $(id).oninput = $(id).onchange = totales);
    $('hzQPre').value = proyecto();
    $('hzQGen').onclick = generarCotizacion;
    refrescarHa();
  }
  async function refrescarHa() {
    const fc = await cuadros(); if (!fc) { totales(); return; }
    const r = resumen(fc), c = $('hzQTab') && $('hzQTab').querySelector('tbody tr .c');
    if (c && (!+c.value)) c.value = +r.ha.toFixed(2);
    if ($('hzQPre') && !$('hzQPre').value) $('hzQPre').value = proyecto();
    totales();
  }
  function calc() {
    const lineas = [...$('hzQTab').querySelectorAll('tbody tr')].map(tr => ({
      d: tr.querySelector('.d').value.trim(), c: +tr.querySelector('.c').value || 0, u: tr.querySelector('.u').value.trim(), p: +tr.querySelector('.p').value || 0, tr,
    })).filter(l => l.d || l.c || l.p);
    lineas.forEach(l => { l.s = l.c * l.p; });
    let sub = lineas.reduce((t, l) => t + l.s, 0);
    const min = +$('hzQMin').value || 0, ajusteMin = min > sub ? min - sub : 0;
    sub += ajusteMin;
    const des = Math.round(sub * Math.min(100, Math.max(0, +$('hzQDes').value || 0)) / 100), neto = sub - des;
    const iva = $('hzQIva').checked ? Math.round(neto * 0.19) : 0;
    return { lineas, ajusteMin, sub, des, neto, iva, total: neto + iva };
  }
  function totales() {
    if (!$('hzQTot')) return;
    const r = calc();
    r.lineas.forEach(l => { l.tr.querySelector('.s').textContent = clp(l.s); });
    $('hzQTot').innerHTML = (r.ajusteMin ? `<tr><td>Ajuste a cargo mínimo</td><td class="n">${clp(r.ajusteMin)}</td></tr>` : '') +
      `<tr><td>Subtotal</td><td class="n">${clp(r.sub)}</td></tr>` + (r.des ? `<tr><td>Descuento</td><td class="n">− ${clp(r.des)}</td></tr>` : '') +
      `<tr><td>Neto</td><td class="n">${clp(r.neto)}</td></tr>` + ($('hzQIva').checked ? `<tr><td>IVA 19 %</td><td class="n">${clp(r.iva)}</td></tr>` : '') +
      `<tr class="hz-tot"><td>Total</td><td class="n">${clp(r.total)}</td></tr>`;
  }
  function generarCotizacion() {
    const r = calc();
    if (!r.lineas.length || !r.total) { aviso('Agrega al menos una línea con cantidad y precio.'); return; }
    const cfg = ls.get(QK, {}), n = (cfg.n || 0) + 1, ls0 = r.lineas;
    const aplic = ls0.find(l => /aplicaci/i.test(l.d)), tras = ls0.find(l => /traslado/i.test(l.d));
    ls.set(QK, { ...cfg, n, tarifa: aplic ? aplic.p : cfg.tarifa, traslado: tras ? tras.p : cfg.traslado, minimo: +$('hzQMin').value || 0,
      iva: $('hzQIva').checked, validez: +$('hzQVal').value || 15, emisor: $('hzQEmi').value.trim() });
    const folio = 'COT-' + String(n).padStart(4, '0'), val = new Date(); val.setDate(val.getDate() + (+$('hzQVal').value || 15));
    const fila = (t, v) => v ? `<tr><td>${t}</td><td>${esc(v)}</td></tr>` : '';
    documento('Cotización ' + folio, `
      <table class="kv">${fila('Emisor', $('hzQEmi').value.trim())}${fila('Cliente', $('hzQCli').value.trim())}${fila('RUT', $('hzQRut').value.trim())}${fila('Predio', $('hzQPre').value.trim())}
        <tr><td>Válida hasta</td><td>${val.toLocaleDateString('es-CL', { dateStyle: 'long' })}</td></tr></table>
      <h2>Detalle</h2><table><thead><tr><th>Descripción</th><th class="n">Cantidad</th><th>Unidad</th><th class="n">Precio unitario</th><th class="n">Subtotal</th></tr></thead><tbody>
      ${ls0.map(l => `<tr><td>${esc(l.d)}</td><td class="n">${num(l.c, Number.isInteger(l.c) ? 0 : 2)}</td><td>${esc(l.u)}</td><td class="n">${clp(l.p)}</td><td class="n">${clp(l.s)}</td></tr>`).join('')}
      ${r.ajusteMin ? `<tr><td colspan="4">Ajuste a cargo mínimo</td><td class="n">${clp(r.ajusteMin)}</td></tr>` : ''}</tbody></table>
      <table style="max-width:360px;margin:14px 0 0 auto"><tbody>
        <tr><td>Subtotal</td><td class="n">${clp(r.sub)}</td></tr>${r.des ? `<tr><td>Descuento</td><td class="n">− ${clp(r.des)}</td></tr>` : ''}
        <tr><td>Neto</td><td class="n">${clp(r.neto)}</td></tr>${$('hzQIva').checked ? `<tr><td>IVA 19 %</td><td class="n">${clp(r.iva)}</td></tr>` : ''}
        <tr class="tot"><td>Total</td><td class="n">${clp(r.total)}</td></tr></tbody></table>
      ${$('hzQNot').value.trim() ? `<h2>Notas</h2><p>${esc($('hzQNot').value.trim())}</p>` : ''}
      <p class="muted" style="margin-top:28px">Valores en pesos chilenos. La superficie final se ajusta según el límite de aplicación definido en la prescripción.</p>`, 'cotizacion_' + folio);
  }

  // ---------- Botón en la barra superior ----------
  function iniciar() {
    document.body.appendChild(dlg);
    const tools = document.querySelector('header.top .hdr-tools') || document.querySelector('header.top');
    if (!tools || $('hzOpen')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'hzOpen'; b.className = 'theme-btn hz-open';
    b.title = 'Puntos de inspección, comparar vuelos, cuaderno de campo y cotizador';
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4Z"/></svg>Herramientas';
    b.onclick = () => abrir();
    const modo = tools.querySelector('.ps-modo');
    modo ? modo.after(b) : tools.insertBefore(b, tools.firstChild);
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', iniciar) : iniciar();
  window.PrescriptorHerramientas = { abrir };
})();
