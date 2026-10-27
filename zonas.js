/* =====================================================================
   Prescriptor · Polígonos de vuelo por mancha
   En el paso 4 «Clases y dosis» agrega «Crear polígonos de vuelo»: separa cada tasa en sus manchas
   (grupos continuos de cuadros) y permite descargar cada mancha como shapefile, o todas en un .zip.
   Sirve para volar solo una mancha. Todo en WGS84 (EPSG:4326).
   Usa la exportación «Cuadros .geojson» que ya tiene la plataforma, sin modificar la aplicación.
   ===================================================================== */
(() => {
  if (window.__prescZonas) return;
  window.__prescZonas = true;
  const $ = id => document.getElementById(id);

  // ---------- Captura de una exportación de la app sin descargarla ----------
  // La app descarga con: URL.createObjectURL(new Blob([datos])) + clic en un enlace.
  function capturar(boton) {
    if (!boton) return null;
    let datos = null;
    const B = window.Blob, clic = HTMLAnchorElement.prototype.click;
    window.Blob = class extends B { constructor(p, o) { super(p, o); if (datos === null && Array.isArray(p) && p.length === 1) datos = p[0]; } };
    HTMLAnchorElement.prototype.click = function () { if (this.download && /^blob:/.test(this.href)) return; return clic.call(this); };
    try { boton.click(); } finally { window.Blob = B; HTMLAnchorElement.prototype.click = clic; }
    return datos;
  }
  async function aBytes(d) {
    if (d == null) return null;
    if (d instanceof Uint8Array) return d;
    if (d instanceof ArrayBuffer) return new Uint8Array(d);
    if (ArrayBuffer.isView(d)) return new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
    if (d instanceof Blob) return new Uint8Array(await d.arrayBuffer());
    if (typeof d === 'string') return new TextEncoder().encode(d);
    return null;
  }

  // ---------- ZIP (sin compresión) ----------
  const T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = T[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), parts = [], central = []; let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + data.length;
    }
    const cSize = central.reduce((t, a) => t + a.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cSize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }
  // ---------- Shapefile (polígonos, WGS84) ----------
  const PRJ = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
  function escribirShp(base, feats, fields) {
    const recs = feats.map(f => {
      const parts = f.rings.map(r => { const q = r.slice(); const a = q[0], b = q[q.length - 1]; if (a[0] !== b[0] || a[1] !== b[1]) q.push(a.slice()); return q; });
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity, np = 0;
      for (const r of parts) for (const [x, y] of r) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); np++; }
      return { parts, np, box: [x1, y1, x2, y2], bytes: 44 + 4 * parts.length + 16 * np };
    });
    const shpLen = 100 + recs.reduce((t, r) => t + 8 + r.bytes, 0), shxLen = 100 + 8 * recs.length;
    const shp = new DataView(new ArrayBuffer(shpLen)), shx = new DataView(new ArrayBuffer(shxLen));
    const B = [Infinity, Infinity, -Infinity, -Infinity];
    for (const r of recs) { B[0] = Math.min(B[0], r.box[0]); B[1] = Math.min(B[1], r.box[1]); B[2] = Math.max(B[2], r.box[2]); B[3] = Math.max(B[3], r.box[3]); }
    for (const [dv, len] of [[shp, shpLen], [shx, shxLen]]) {
      dv.setInt32(0, 9994, false); dv.setInt32(24, len / 2, false); dv.setInt32(28, 1000, true); dv.setInt32(32, 5, true);
      B.forEach((v, i) => dv.setFloat64(36 + i * 8, recs.length ? v : 0, true));
    }
    let o = 100;
    recs.forEach((r, i) => {
      shx.setInt32(100 + i * 8, o / 2, false); shx.setInt32(104 + i * 8, r.bytes / 2, false);
      shp.setInt32(o, i + 1, false); shp.setInt32(o + 4, r.bytes / 2, false); o += 8;
      shp.setInt32(o, 5, true); r.box.forEach((v, k) => shp.setFloat64(o + 4 + k * 8, v, true));
      shp.setInt32(o + 36, r.parts.length, true); shp.setInt32(o + 40, r.np, true);
      let idx = 0, p = o + 44; r.parts.forEach(part => { shp.setInt32(p, idx, true); p += 4; idx += part.length; });
      for (const part of r.parts) for (const [x, y] of part) { shp.setFloat64(p, x, true); shp.setFloat64(p + 8, y, true); p += 16; }
      o += r.bytes;
    });
    const enc = new TextEncoder(), recLen = 1 + fields.reduce((t, f) => t + f.len, 0), hdr = 32 + 32 * fields.length + 1;
    const dbf = new Uint8Array(hdr + recLen * feats.length + 1), dv = new DataView(dbf.buffer), d = new Date();
    dbf[0] = 3; dbf[1] = d.getFullYear() - 1900; dbf[2] = d.getMonth() + 1; dbf[3] = d.getDate();
    dv.setUint32(4, feats.length, true); dv.setUint16(8, hdr, true); dv.setUint16(10, recLen, true);
    fields.forEach((f, i) => {
      const b = 32 + i * 32; for (let k = 0; k < Math.min(10, f.name.length); k++) dbf[b + k] = f.name.charCodeAt(k);
      dbf[b + 11] = f.type.charCodeAt(0); dbf[b + 16] = f.len; dbf[b + 17] = f.dec || 0;
    });
    dbf[hdr - 1] = 0x0D;
    feats.forEach((ft, i) => {
      let p = hdr + i * recLen; dbf[p++] = 0x20;
      for (const f of fields) {
        const v = ft.props[f.name]; let bytes;
        if (f.type === 'N') {
          let s = v == null || !Number.isFinite(+v) ? '' : (+v).toFixed(f.dec || 0);
          if (s.length > f.len) s = s.slice(0, f.len);
          bytes = enc.encode(s.padStart(f.len, ' '));
        } else {
          let b = enc.encode(String(v == null ? '' : v));
          if (b.length > f.len) { let cut = f.len; while (cut > 0 && (b[cut] & 0xC0) === 0x80) cut--; b = b.slice(0, cut); }
          bytes = new Uint8Array(f.len).fill(0x20); bytes.set(b);
        }
        dbf.set(bytes, p); p += f.len;
      }
    });
    dbf[dbf.length - 1] = 0x1A;
    return [
      { name: base + '.shp', data: new Uint8Array(shp.buffer) }, { name: base + '.shx', data: new Uint8Array(shx.buffer) },
      { name: base + '.dbf', data: dbf }, { name: base + '.prj', data: PRJ }, { name: base + '.cpg', data: 'UTF-8' },
    ];
  }
  // ---------- Geometría ----------
  const area2 = r => { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % n]; a += x1 * y2 - x2 * y1; } return a / 2; };
  const cw = r => (area2(r) < 0 ? r : r.slice().reverse());
  const ccw = r => (area2(r) > 0 ? r : r.slice().reverse());
  const abierto = r => { const a = r[0], b = r[r.length - 1]; return a[0] === b[0] && a[1] === b[1] ? r.slice(0, -1) : r.slice(); };
  function hectareas(rings) {
    // Área aproximada en ha (proyección local equirectangular; error < 0,1 % en un predio)
    let n = 0, lat0 = 0; for (const r of rings) for (const p of r) { lat0 += p[1]; n++; }
    lat0 = n ? lat0 / n : 0;
    const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110574;
    let a = 0; for (const r of rings) a += area2(abierto(r).map(([x, y]) => [x * kx, y * ky]));
    return Math.abs(a) / 1e4;
  }
  function dentro([x, y], r) {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function sinColineales(r) {
    let pts = r.slice(), cambio = true;
    while (cambio && pts.length > 3) {
      cambio = false;
      for (let i = 0; i < pts.length && pts.length > 3; i++) {
        const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
        const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
        const cr = ux * vy - uy * vx, la = Math.hypot(ux, uy) * Math.hypot(vx, vy);
        if (la === 0 || Math.abs(cr) <= 1e-9 * la) { pts.splice(i, 1); i--; cambio = true; }
      }
    }
    return pts;
  }
  /* Une cuadros (anillos de 4 vértices que comparten esquinas exactas) en un contorno.
     Se anulan los bordes compartidos y se encadenan los que quedan. Exteriores en sentido horario, huecos al revés. */
  function disolver(cuadros) {
    const K = p => p[0] + ',' + p[1], bordes = new Map(), pt = new Map();
    for (const q of cuadros) {
      const r = cw(abierto(q));
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length], ka = K(a), kb = K(b);
        pt.set(ka, a); pt.set(kb, b);
        const inv = kb + '>' + ka;
        if (bordes.has(inv)) { const n = bordes.get(inv) - 1; n ? bordes.set(inv, n) : bordes.delete(inv); }
        else bordes.set(ka + '>' + kb, (bordes.get(ka + '>' + kb) || 0) + 1);
      }
    }
    // Lista de bordes y, para cada borde, cuál sigue. En un vértice donde dos cuadros se tocan solo por la
    // esquina se elige el giro más cerrado a la derecha: así cada anillo queda separado y sin tocarse a sí mismo.
    const E = [], salen = new Map();
    for (const [e, n] of bordes) {
      const [a, b] = e.split('>');
      for (let k = 0; k < n; k++) { const id = E.length; E.push([a, b]); (salen.get(a) || salen.set(a, []).get(a)).push(id); }
    }
    const sig = new Int32Array(E.length).fill(-1), tomado = new Uint8Array(E.length);
    const giro = (e, f) => {
      const P = pt.get(E[e][0]), C = pt.get(E[e][1]), O = pt.get(E[f][1]);
      const dx = C[0] - P[0], dy = C[1] - P[1], ex = O[0] - C[0], ey = O[1] - C[1];
      return Math.atan2(dx * ey - dy * ex, dx * ex + dy * ey);
    };
    const llegan = new Map();
    E.forEach(([, b], id) => (llegan.get(b) || llegan.set(b, []).get(b)).push(id));
    for (const [v, outs] of salen) {
      const entran = llegan.get(v) || [];
      if (outs.length === 1) { for (const e of entran) sig[e] = outs[0]; continue; }
      // Varios bordes: se asignan los pares de giro más cerrado primero
      const pares = [];
      for (const e of entran) for (const f of outs) pares.push([giro(e, f), e, f]);
      pares.sort((x, y) => x[0] - y[0]);
      const usadoE = new Set(), usadoF = new Set();
      for (const [, e, f] of pares) if (!usadoE.has(e) && !usadoF.has(f)) { sig[e] = f; usadoE.add(e); usadoF.add(f); }
    }
    // En las esquinas compartidas (dos cuadros que se tocan solo por un vértice) cada anillo pasa por el mismo
    // punto. Para que ningún contorno toque a otro ni a sí mismo, ese vértice se corre ~1 mm hacia el interior
    // de su propia esquina. La superficie no cambia en la práctica.
    const EPS = 1e-8; // grados (≈ 1 mm)
    const esquina = new Set([...salen].filter(([, o]) => o.length > 1).map(([v]) => v));
    const rings = [];
    for (let s = 0; s < E.length; s++) {
      if (tomado[s]) continue;
      const ring = []; let e = s, guard = 0;
      while (e >= 0 && !tomado[e] && guard++ < 1e7) { tomado[e] = 1; ring.push(E[e][0]); e = sig[e]; }
      if (e !== s || ring.length < 3) continue;
      const n = ring.length;
      const pts = ring.map((k, i) => {
        const C = pt.get(k);
        if (!esquina.has(k)) return C;
        const P = pt.get(ring[(i - 1 + n) % n]), N = pt.get(ring[(i + 1) % n]);
        let ax = P[0] - C[0], ay = P[1] - C[1], bx = N[0] - C[0], by = N[1] - C[1];
        const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
        let mx = ax / la + bx / lb, my = ay / la + by / lb; const lm = Math.hypot(mx, my) || 1;
        return [C[0] + EPS * mx / lm, C[1] + EPS * my / lm];
      });
      rings.push(sinColineales(pts));
    }
    // Agrupa: cada exterior con los huecos que contiene (un registro por polígono)
    const ext = rings.filter(r => area2(r) < 0), huecos = rings.filter(r => area2(r) > 0);
    const polys = ext.map(e => [e]);
    for (const h of huecos) { const i = ext.findIndex(e => dentro(h[0], e)); (i >= 0 ? polys[i] : polys[0] || (polys[0] = [])).push(h); }
    return polys;
  }

  // ---------- Nombres ----------
  const limpio = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  function base() {
    const proj = $('projName') && $('projName').value.trim();
    const file = $('filetag') && $('filetag').textContent.trim();
    return limpio(proj || (file && file !== '—' ? file.replace(/\.[^.]+$/, '') : '') || 'prescripcion');
  }
  const fmt = (v, d) => v.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d });

  let avisoT;
  function aviso(msg, ms = 7000) {
    const t = $('toast'); if (!t) { alert(msg); return; }
    t.textContent = msg; t.hidden = false; clearTimeout(avisoT); avisoT = setTimeout(() => { t.hidden = true; }, ms);
  }

  // ---------- Manchas de cada tasa → polígonos de vuelo ----------
  const COLORES = { 2: ['#c8402f', '#2f8a50'], 3: ['#c8402f', '#e6c13d', '#2f8a50'], 4: ['#c8402f', '#ec8d48', '#9dc85a', '#2f8a50'], 5: ['#c8402f', '#ec8d48', '#e6c13d', '#9dc85a', '#2f8a50'] };
  const colorTasa = (t, n) => (COLORES[n] || COLORES[5])[Math.max(0, Math.min((COLORES[n] || COLORES[5]).length - 1, t - 1))];
  const CAMPOS = [{ name: 'ZONA', type: 'C', len: 60 }, { name: 'TASA', type: 'N', len: 2 }, { name: 'DOSIS_LHA', type: 'N', len: 8, dec: 1 },
    { name: 'MANCHA', type: 'N', len: 4 }, { name: 'CUADROS', type: 'N', len: 8 }, { name: 'AREA_HA', type: 'N', len: 14, dec: 4 }, { name: 'LITROS', type: 'N', len: 14, dec: 1 }];

  let estado = null; // { base, manchas: [...], nTasas, variasAreas, bbox, desactualizado }

  async function leerCuadros() {
    const gj = capturar($('geojsonBtn'));
    if (!gj) return null;
    return JSON.parse(typeof gj === 'string' ? gj : new TextDecoder().decode(await aBytes(gj)));
  }

  /* Separa cuadros en manchas: grupos de cuadros de la misma tasa que comparten un lado.
     (Dos cuadros que solo se tocan por una esquina quedan en manchas distintas: no se puede volar por un punto.) */
  function manchasDe(cuadros) {
    const K = p => p[0] + ',' + p[1], lado = new Map(), padre = cuadros.map((_, i) => i);
    const raiz = i => { while (padre[i] !== i) i = padre[i] = padre[padre[i]]; return i; };
    cuadros.forEach((q, i) => {
      const r = abierto(q);
      for (let k = 0; k < r.length; k++) {
        const a = K(r[k]), b = K(r[(k + 1) % r.length]), key = a < b ? a + '|' + b : b + '|' + a;
        if (lado.has(key)) { const x = raiz(lado.get(key)), y = raiz(i); if (x !== y) padre[x] = y; } else lado.set(key, i);
      }
    });
    const g = new Map();
    cuadros.forEach((q, i) => { const r = raiz(i); (g.get(r) || g.set(r, []).get(r)).push(q); });
    return [...g.values()];
  }

  async function crear() {
    const fc = await leerCuadros();
    if (!fc) { aviso('Primero carga el ortomosaico y define las tasas.'); return; }
    const grupos = new Map();
    for (const f of fc.features) {
      const p = f.properties || {};
      if (!p.clase) continue; // «No aplicar»
      const key = (p.zona || '') + '\u0000' + p.clase;
      if (!grupos.has(key)) grupos.set(key, { zona: p.zona || '', tasa: p.clase, dosis: +p.dosis_lha || 0, cuadros: [] });
      grupos.get(key).cuadros.push(f.geometry.coordinates[0]);
    }
    if (!grupos.size) { aviso('No hay cuadros con dosis. Revisa las tasas y el límite.'); return; }
    const nTasas = Math.max(...[...grupos.values()].map(g => g.tasa));
    const variasAreas = new Set([...grupos.values()].map(g => g.zona)).size > 1;
    const manchas = [];
    for (const g of [...grupos.values()].sort((a, b) => a.zona.localeCompare(b.zona) || a.tasa - b.tasa)) {
      const lista = manchasDe(g.cuadros).map(cs => {
        const polys = disolver(cs), ha = polys.reduce((t, r) => t + hectareas(r), 0);
        return { zona: g.zona, tasa: g.tasa, dosis: g.dosis, cuadros: cs.length, polys, ha, litros: ha * g.dosis };
      }).sort((a, b) => b.ha - a.ha);
      lista.forEach((m, i) => { m.n = i + 1; manchas.push(m); });
    }
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const m of manchas) for (const p of m.polys) for (const [x, y] of p[0]) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); }
    estado = { base: base(), manchas, nTasas, variasAreas, bbox: [x1, y1, x2, y2], desactualizado: false };
    pintar();
  }

  const nombreMancha = m => estado.base + (estado.variasAreas ? '_' + limpio(m.zona) : '') +
    '_tasa' + m.tasa + '_' + String(m.dosis).replace('.', ',') + 'Lha_mancha' + String(m.n).padStart(2, '0');
  const propsMancha = m => ({ ZONA: m.zona, TASA: m.tasa, DOSIS_LHA: m.dosis, MANCHA: m.n, CUADROS: m.cuadros, AREA_HA: m.ha, LITROS: m.litros });

  function descargar(blob, nombre) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  function bajarUna(m) {
    const nom = nombreMancha(m);
    descargar(zip(escribirShp(nom, m.polys.map(r => ({ rings: r, props: propsMancha(m) })), CAMPOS)), nom + '.zip');
    aviso('Descargado ' + nom + '.zip (' + fmt(m.ha, 2) + ' ha, WGS84). Impórtalo en el Agras como límite del campo.');
  }

  function visibles() {
    const min = Math.max(0, parseFloat(($('vmMin') || {}).value) || 0);
    return estado.manchas.filter(m => m.ha >= min);
  }

  function bajarTodas() {
    const ms = visibles();
    if (!ms.length) { aviso('No hay manchas para descargar con el área mínima elegida.'); return; }
    const files = [], b = estado.base, lineas = [];
    for (const m of ms) {
      const nom = nombreMancha(m);
      files.push(...escribirShp('tasa' + m.tasa + '/' + nom, m.polys.map(r => ({ rings: r, props: propsMancha(m) })), CAMPOS));
      lineas.push(`tasa${m.tasa}/${nom}  ·  ${estado.variasAreas ? m.zona + ' · ' : ''}tasa ${m.tasa} · ${fmt(m.dosis, 0)} L/ha · mancha ${m.n} · ${fmt(m.ha, 2)} ha · ${fmt(m.litros, 1)} L`);
    }
    // Además, todas las manchas en un solo shapefile (un registro por mancha), para revisarlas juntas en QGIS
    const todas = [];
    for (const m of ms) for (const r of m.polys) todas.push({ rings: r, props: propsMancha(m) });
    files.push(...escribirShp(b + '_todas_las_manchas', todas, CAMPOS));
    files.push({ name: 'LEEME.txt', data: [
      'Polígonos de vuelo por mancha · ' + b, 'Generado: ' + new Date().toLocaleString('es-CL'), 'Sistema de coordenadas: WGS84 (EPSG:4326)', '',
      'Cada carpeta tasaN tiene un shapefile por mancha (grupo continuo de cuadros de esa tasa).',
      b + '_todas_las_manchas tiene todas juntas, un registro por mancha, para revisarlas en un SIG.', '',
      ...lineas, '',
      'En el control del Agras: copia a la microSD los archivos de la mancha que vas a volar (.shp, .shx, .dbf, .prj) e impórtalos como límite del campo.',
      'Revisa siempre el contorno en el control antes de volar.',
    ].join('\r\n') });
    descargar(zip(files), b + '_poligonos_de_vuelo.zip');
    aviso('Descargadas ' + ms.length + ' manchas en ' + b + '_poligonos_de_vuelo.zip (una carpeta por tasa, WGS84).');
  }

  // Miniatura: todas las manchas en gris y la elegida con el color de su tasa
  function miniatura(m) {
    const [x1, y1, x2, y2] = estado.bbox, W = 64, H = 46, pad = 3;
    const kx = Math.cos(((y1 + y2) / 2) * Math.PI / 180);
    const sw = Math.max((x2 - x1) * kx, 1e-12), sh = Math.max(y2 - y1, 1e-12), s = Math.min((W - 2 * pad) / sw, (H - 2 * pad) / sh);
    const ox = (W - sw * s) / 2, oy = (H - sh * s) / 2;
    const P = r => 'M' + r.map(([x, y]) => ((x - x1) * kx * s + ox).toFixed(1) + ' ' + ((y2 - y) * s + oy).toFixed(1)).join('L') + 'Z';
    const camino = polys => polys.map(p => p.map(P).join('')).join('');
    const fondo = estado.manchas.filter(o => o !== m).map(o => camino(o.polys)).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><path d="${fondo}" fill="var(--line,#ccd)" fill-rule="evenodd" opacity=".55"/>` +
      `<path d="${camino(m.polys)}" fill="${colorTasa(m.tasa, estado.nTasas)}" stroke="var(--fg,#1a1b23)" stroke-width=".6" fill-rule="evenodd"/></svg>`;
  }

  function pintar() {
    const caja = $('vmLista'); if (!caja || !estado) return;
    const ms = visibles(), ocultas = estado.manchas.length - ms.length;
    $('vmTodas').hidden = !ms.length;
    if (!ms.length) { caja.innerHTML = '<p class="hint">No hay manchas con el área mínima elegida.</p>'; return; }
    const porTasa = new Map();
    for (const m of ms) { const k = (estado.variasAreas ? m.zona + ' · ' : '') + 'Tasa ' + m.tasa; (porTasa.get(k) || porTasa.set(k, []).get(k)).push(m); }
    let h = estado.desactualizado ? '<p class="vm-aviso">Cambiaste las tasas o el límite: vuelve a pulsar «Crear polígonos de vuelo».</p>' : '';
    h += `<p class="hint">${ms.length} mancha${ms.length === 1 ? '' : 's'} en ${porTasa.size} grupo${porTasa.size === 1 ? '' : 's'}` + (ocultas ? ` · ${ocultas} más chica${ocultas === 1 ? '' : 's'} oculta${ocultas === 1 ? '' : 's'}` : '') + '.</p>';
    for (const [titulo, lista] of porTasa) {
      const m0 = lista[0], tot = lista.reduce((t, m) => t + m.ha, 0);
      h += `<div class="vm-grupo"><div class="vm-tit"><i style="background:${colorTasa(m0.tasa, estado.nTasas)}"></i><b>${titulo}</b> · ${fmt(m0.dosis, 0)} L/ha<span>${fmt(tot, 2)} ha</span></div>`;
      for (const m of lista) {
        const i = estado.manchas.indexOf(m);
        h += `<div class="vm-item">${miniatura(m)}<div class="vm-txt"><b>Mancha ${m.n}</b><small>${fmt(m.ha, 2)} ha · ${m.cuadros} cuadro${m.cuadros === 1 ? '' : 's'} · ${fmt(m.litros, 1)} L</small></div>` +
          `<button class="btn" type="button" data-i="${i}" title="Descargar esta mancha como shapefile (.zip)">Descargar .shp</button></div>`;
      }
      h += '</div>';
    }
    caja.innerHTML = h;
    caja.querySelectorAll('button[data-i]').forEach(b => b.onclick = () => bajarUna(estado.manchas[+b.dataset.i]));
  }

  // ---------- Panel en el paso 4 «Clases y dosis» ----------
  function iniciar() {
    const metodo = $('methodSel'), sec = metodo && metodo.closest('section');
    if (!sec || $('vmPanel')) return;
    const css = document.createElement('style');
    css.textContent = `
      #vmPanel { margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--line, #d5dde6); display: grid; gap: 10px; }
      #vmPanel h3 { margin: 0; font-size: 13px; letter-spacing: .06em; text-transform: uppercase; color: var(--accent, #1e88ff); }
      #vmPanel .vm-fila { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end; }
      #vmPanel .vm-fila label { flex: 1 1 120px; }
      .vm-grupo { border: 1px solid var(--line, #d5dde6); border-radius: 12px; padding: 8px; display: grid; gap: 6px; }
      .vm-tit { display: flex; align-items: center; gap: 8px; font-size: 13px; }
      .vm-tit i { width: 12px; height: 12px; border-radius: 3px; flex: none; }
      .vm-tit span { margin-left: auto; color: var(--muted, #5e6e82); font-size: 12px; }
      .vm-item { display: flex; align-items: center; gap: 10px; padding: 4px; border-radius: 10px; }
      .vm-item:hover { background: color-mix(in srgb, var(--accent, #1e88ff) 8%, transparent); }
      .vm-item svg { flex: none; border-radius: 6px; background: color-mix(in srgb, var(--fg, #000) 4%, transparent); }
      .vm-txt { flex: 1; min-width: 0; display: grid; }
      .vm-txt b { font-size: 13px; } .vm-txt small { color: var(--muted, #5e6e82); font-size: 11.5px; }
      .vm-item .btn { padding: 6px 10px; font-size: 12px; }
      .vm-aviso { margin: 0; padding: 8px 10px; border-radius: 10px; font-size: 12.5px; background: color-mix(in srgb, #e6a23c 18%, transparent); }`;
    document.head.appendChild(css);
    const panel = document.createElement('div');
    panel.id = 'vmPanel';
    panel.innerHTML = `<h3>Polígonos de vuelo por mancha</h3>
      <p class="hint">Crea un polígono por cada mancha de cada tasa, para volar solo esa mancha. Funciona mejor con el método «Zonificado», que forma manchas continuas.</p>
      <div class="vm-fila">
        <button class="btn primary" id="vmCrear" type="button">Crear polígonos de vuelo</button>
        <label class="f"><span>Ocultar manchas menores a (ha)</span><input type="number" id="vmMin" min="0" step="0.01" value="0"></label>
      </div>
      <div id="vmLista"></div>
      <div class="btns"><button class="btn" id="vmTodas" type="button" hidden>Descargar todas (.zip)</button></div>`;
    sec.appendChild(panel);
    $('vmCrear').onclick = async () => {
      const b = $('vmCrear'); b.disabled = true; const t = b.textContent; b.textContent = 'Creando…';
      try { await crear(); } catch (e) { console.error(e); aviso('No se pudieron crear los polígonos: ' + (e.message || e)); }
      finally { b.disabled = false; b.textContent = t; }
    };
    $('vmTodas').onclick = () => estado && bajarTodas();
    $('vmMin').oninput = () => estado && pintar();
    // Si cambian las tasas, el método o el límite, la lista queda marcada como desactualizada
    const marcar = () => { if (estado && !estado.desactualizado) { estado.desactualizado = true; pintar(); } };
    ['ctable', 'polyList', 'legend'].forEach(id => { const el = $(id); if (el) new MutationObserver(marcar).observe(el, { childList: true, subtree: true, characterData: true }); });
    if (metodo) metodo.addEventListener('change', marcar);
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', iniciar) : iniciar();

  // Archivos de todas las manchas (para el paquete completo del Agras)
  async function archivosManchas(carpeta = '') {
    await crear();
    if (!estado || !estado.manchas.length) return [];
    const files = [];
    for (const m of estado.manchas) {
      const nom = nombreMancha(m);
      files.push(...escribirShp(carpeta + 'tasa' + m.tasa + '/' + nom, m.polys.map(r => ({ rings: r, props: propsMancha(m) })), CAMPOS));
    }
    return files;
  }

  window.PrescriptorZonas = { disolver, manchasDe, crear, estado: () => estado, archivosManchas, zip, escribirShp, hectareas };
})();
