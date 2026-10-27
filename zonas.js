/* =====================================================================
   Prescriptor · Polígonos por zona (.zip)
   Agrega en el paso 3b «Límite de aplicación» un botón que descarga, en un solo .zip:
     por_tasa/  un shapefile por cada tasa (contorno de todos los cuadros de esa dosis)
     por_area/  un shapefile por cada área dibujada o importada (con sus exclusiones como huecos)
   Sirve para volar solo una tasa o solo un área. Todo en WGS84 (EPSG:4326).
   Usa las exportaciones que ya tiene la plataforma («Cuadros .geojson» y «Descargar límites»),
   sin modificar la aplicación.
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
  function unzip(u8) {
    // Lee un .zip sin compresión (como los que genera la plataforma)
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), td = new TextDecoder(), out = {};
    let p = 0;
    while (p + 30 <= u8.length && dv.getUint32(p, true) === 0x04034b50) {
      const method = dv.getUint16(p + 8, true), size = dv.getUint32(p + 18, true), nl = dv.getUint16(p + 26, true), el = dv.getUint16(p + 28, true);
      const name = td.decode(u8.subarray(p + 30, p + 30 + nl)), start = p + 30 + nl + el;
      if (method === 0) out[name] = u8.subarray(start, start + size);
      p = start + size;
    }
    return out;
  }

  // ---------- Shapefile: escritura y lectura (polígonos, WGS84) ----------
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
  function leerShp(shpU8, dbfU8) {
    const dv = new DataView(shpU8.buffer, shpU8.byteOffset, shpU8.byteLength), geoms = [];
    let p = 100;
    while (p + 8 <= shpU8.length) {
      const len = dv.getInt32(p + 4, false) * 2, s = p + 8;
      if (dv.getInt32(s, true) === 5) {
        const np = dv.getInt32(s + 36, true), npt = dv.getInt32(s + 40, true), idx = [];
        for (let k = 0; k < np; k++) idx.push(dv.getInt32(s + 44 + 4 * k, true));
        const pts = [], b = s + 44 + 4 * np;
        for (let k = 0; k < npt; k++) pts.push([dv.getFloat64(b + 16 * k, true), dv.getFloat64(b + 16 * k + 8, true)]);
        geoms.push(idx.map((st, k) => pts.slice(st, k + 1 < np ? idx[k + 1] : npt)));
      } else geoms.push([]);
      p = s + len;
    }
    const recs = [];
    if (dbfU8) {
      const dd = new DataView(dbfU8.buffer, dbfU8.byteOffset, dbfU8.byteLength), td = new TextDecoder();
      const n = dd.getUint32(4, true), hdr = dd.getUint16(8, true), rl = dd.getUint16(10, true), fields = [];
      for (let o = 32; o < hdr - 1 && dbfU8[o] !== 0x0D; o += 32) {
        let name = ''; for (let k = 0; k < 11 && dbfU8[o + k]; k++) name += String.fromCharCode(dbfU8[o + k]);
        fields.push({ name, type: String.fromCharCode(dbfU8[o + 11]), len: dbfU8[o + 16] });
      }
      for (let i = 0; i < n; i++) {
        let o = hdr + i * rl + 1; const r = {};
        for (const f of fields) { const s = td.decode(dbfU8.subarray(o, o + f.len)).trim(); r[f.name] = f.type === 'N' ? (s === '' ? null : +s) : s; o += f.len; }
        recs.push(r);
      }
    }
    return geoms.map((g, i) => ({ rings: g, props: recs[i] || {} }));
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

  // ---------- Exportación ----------
  async function exportar(boton) {
    const gj = capturar($('geojsonBtn'));
    if (!gj) { aviso('Primero carga el ortomosaico y define las tasas: no hay cuadros para exportar.'); return; }
    boton.disabled = true; const txt = boton.textContent; boton.textContent = 'Generando…';
    try {
      const fc = JSON.parse(typeof gj === 'string' ? gj : new TextDecoder().decode(await aBytes(gj)));
      const lim = await aBytes(capturar($('clipShp')));
      const files = [], resumen = [], b = base();

      // 1) Por tasa (y por área, si hay más de una)
      const grupos = new Map();
      for (const f of fc.features) {
        const p = f.properties || {};
        if (!p.clase) continue; // «No aplicar»
        const key = (p.zona || '') + '\u0000' + p.clase;
        if (!grupos.has(key)) grupos.set(key, { zona: p.zona || '', clase: p.clase, dosis: p.dosis_lha, cuadros: [] });
        grupos.get(key).cuadros.push(f.geometry.coordinates[0]);
      }
      const variasAreas = new Set([...grupos.values()].map(g => g.zona)).size > 1;
      const ordenados = [...grupos.values()].sort((a, b) => a.zona.localeCompare(b.zona) || a.clase - b.clase);
      const camposTasa = [{ name: 'ZONA', type: 'C', len: 60 }, { name: 'TASA', type: 'N', len: 2 }, { name: 'DOSIS_LHA', type: 'N', len: 8, dec: 1 },
        { name: 'CUADROS', type: 'N', len: 8 }, { name: 'AREA_HA', type: 'N', len: 14, dec: 4 }, { name: 'LITROS', type: 'N', len: 14, dec: 1 }];
      for (const g of ordenados) {
        const polys = disolver(g.cuadros);
        const ha = polys.reduce((t, r) => t + hectareas(r), 0);
        const nombre = b + (variasAreas ? '_' + limpio(g.zona) : '') + '_tasa' + g.clase + '_' + String(g.dosis).replace('.', ',') + 'Lha';
        const props = { ZONA: g.zona, TASA: g.clase, DOSIS_LHA: g.dosis, CUADROS: g.cuadros.length, AREA_HA: ha, LITROS: ha * (g.dosis || 0) };
        files.push(...escribirShp('por_tasa/' + nombre, polys.map(r => ({ rings: r, props })), camposTasa));
        resumen.push(`por_tasa/${nombre}  ·  ${variasAreas ? g.zona + ' · ' : ''}tasa ${g.clase} · ${fmt(+g.dosis || 0, 0)} L/ha · ${fmt(ha, 2)} ha · ${polys.length} polígono${polys.length === 1 ? '' : 's'}`);
      }

      // 2) Por área dibujada (las exclusiones que caen dentro van como huecos)
      const camposArea = [{ name: 'NOMBRE', type: 'C', len: 80 }, { name: 'ZONA', type: 'N', len: 4 }, { name: 'AREA_HA', type: 'N', len: 14, dec: 4 }];
      let areas = [];
      if (lim) {
        const z = unzip(lim), shp = Object.keys(z).find(n => /\.shp$/i.test(n)), dbf = Object.keys(z).find(n => /\.dbf$/i.test(n));
        if (shp) areas = leerShp(z[shp], dbf && z[dbf]);
      }
      const aplicar = areas.filter(a => String(a.props.TIPO || '').toLowerCase() !== 'excluir' && a.rings.length);
      const excluir = areas.filter(a => String(a.props.TIPO || '').toLowerCase() === 'excluir' && a.rings.length);
      let sinHueco = 0;
      aplicar.forEach((a, i) => {
        const rings = a.rings.map(r => cw(abierto(r)));
        for (const e of excluir) for (const er of e.rings) {
          const r = abierto(er);
          if (rings.some(ar => r.every(p => dentro(p, ar)))) rings.push(ccw(r)); else sinHueco++;
        }
        const nom = a.props.NOMBRE || ('Area ' + (i + 1));
        const ha = hectareas(rings);
        const nombre = b + '_area' + (a.props.ZONA || i + 1) + '_' + (limpio(nom) || 'area');
        files.push(...escribirShp('por_area/' + nombre, [{ rings, props: { NOMBRE: nom, ZONA: a.props.ZONA || i + 1, AREA_HA: ha } }], camposArea));
        resumen.push(`por_area/${nombre}  ·  ${nom} · ${fmt(ha, 2)} ha`);
      });
      if (!aplicar.length) {
        // Sin áreas dibujadas: el contorno de todo lo que se aplica
        const todos = fc.features.filter(f => (f.properties || {}).clase).map(f => f.geometry.coordinates[0]);
        if (todos.length) {
          const polys = disolver(todos), ha = polys.reduce((t, r) => t + hectareas(r), 0), nombre = b + '_todo_el_pano';
          files.push(...escribirShp('por_area/' + nombre, polys.map(r => ({ rings: r, props: { NOMBRE: 'Todo el paño', ZONA: 1, AREA_HA: ha } })), camposArea));
          resumen.push(`por_area/${nombre}  ·  todo el paño (no hay áreas dibujadas) · ${fmt(ha, 2)} ha`);
        }
      }

      if (!files.length) { aviso('No hay cuadros con dosis para exportar. Revisa las tasas y el límite.'); return; }
      const leeme = [
        'Polígonos por zona · ' + b,
        'Generado: ' + new Date().toLocaleString('es-CL'),
        'Sistema de coordenadas: WGS84 (EPSG:4326)',
        '',
        'por_tasa: contorno de los cuadros de cada tasa. Úsalo para volar solo esa dosis.',
        'por_area: cada área a aplicar dibujada o importada; las zonas excluidas que quedan dentro van como huecos.',
        '',
        ...resumen,
        ...(sinHueco ? ['', 'Atención: ' + sinHueco + ' zona(s) excluida(s) cruzan el borde de un área y no se restaron; revísalas en el control.'] : []),
        '',
        'En el control del Agras: copia el shapefile (.shp, .shx, .dbf, .prj) de la zona que vas a volar a la microSD e impórtalo como límite del campo.',
        'Revisa siempre el contorno en el control antes de volar.',
      ].join('\r\n');
      files.push({ name: 'LEEME.txt', data: leeme });
      const nombreZip = b + '_poligonos_por_zona.zip', blob = zip(files);
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombreZip;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      const nt = ordenados.length, na = resumen.length - nt;
      aviso('Descargado ' + nombreZip + ': ' + nt + ' polígono' + (nt === 1 ? '' : 's') + ' por tasa y ' + na + ' por área (WGS84).');
    } catch (e) {
      console.error(e);
      aviso('No se pudieron generar los polígonos: ' + (e.message || e));
    } finally { boton.disabled = false; boton.textContent = txt; }
  }

  // ---------- Botón en el paso 3b ----------
  function iniciar() {
    const ref = $('clipShp') || $('clipClear');
    const fila = ref && ref.parentElement;
    if (!fila || $('zonasShp')) return;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn'; btn.id = 'zonasShp';
    btn.textContent = 'Polígonos por zona (.zip)';
    btn.title = 'Un .zip con el contorno de cada tasa y de cada área, por separado, para volar solo una zona';
    btn.onclick = () => exportar(btn);
    fila.appendChild(btn);
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = '«Polígonos por zona» descarga el contorno de cada tasa y de cada área por separado, para volar solo una zona.';
    fila.after(hint);
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', iniciar) : iniciar();

  window.PrescriptorZonas = { disolver, exportar: () => exportar($('zonasShp')) };
})();
