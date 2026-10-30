// Converte dados OSM em coordenadas locais (metros) para a cena Three.js — porta do prep.py.
const ROAD_W = { motorway: 16, trunk: 14, primary: 13, secondary: 12, tertiary: 10, residential: 8, unclassified: 8, living_street: 6, service: 5 };
const LEVEL_H = 3.2;

function hash(n) { let h = 2166136261; for (const c of String(n)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

export function buildScene({ coords, osm, from, to }) {
  const [lon0, lat0] = coords[0];
  const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110540;
  const P = (lon, lat) => [Math.round((lon - lon0) * kx * 10) / 10, Math.round(-(lat - lat0) * ky * 10) / 10];
  const route = coords.map(([lo, la]) => P(lo, la));
  // grade espacial com a rota densificada (passo 40 m) para filtrar o que está perto dela
  const CELL = 100, grid = new Set();
  for (let i = 1; i < route.length; i++) {
    const [a, b] = [route[i - 1], route[i]], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 40));
    for (let k = 0; k <= n; k++) grid.add(`${Math.floor((a[0] + (b[0] - a[0]) * k / n) / CELL)},${Math.floor((a[1] + (b[1] - a[1]) * k / n) / CELL)}`);
  }
  const near = (pts, m) => {
    const r = Math.ceil(m / CELL);
    return pts.some(([x, z], i) => (i % Math.max(1, pts.length >> 2) === 0 || i === pts.length - 1) && (() => {
      const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (grid.has(`${cx + dx},${cz + dz}`)) return true;
      return false;
    })());
  };
  const B = [], R = [], G = [], L = [];
  for (const e of osm.elements || []) {
    const t = e.tags || {};
    if (e.type === 'node') {
      if (t.place && t.name && near([P(e.lon, e.lat)], 500)) L.push({ n: t.name, p: P(e.lon, e.lat) });
      continue;
    }
    if (!e.geometry) continue;
    const pts = e.geometry.map((g) => P(g.lon, g.lat));
    if (t.building) {
      if (!near(pts, 650)) continue;
      let h = null;
      const num = (v) => { const x = parseFloat(String(v).replace(',', '.')); return Number.isFinite(x) ? x : null; };
      if (t.height) h = num(t.height);
      else if (t['building:levels']) { const l = num(t['building:levels']); if (l != null) h = l * LEVEL_H + 1; }
      if (h == null || h <= 0) h = [4, 5, 6, 6, 7, 8, 9, 11][hash(e.id) % 8];
      const closed = pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1];
      if (pts.length >= 3) B.push({ p: closed ? pts.slice(0, -1) : pts, h: Math.round(Math.min(h, 90) * 10) / 10 });
    } else if (t.highway) {
      const k = t.highway;
      if ((!(k in ROAD_W) && !k.endsWith('_link')) || !near(pts, 900)) continue;
      R.push({ p: pts, w: ROAD_W[k] ?? 9, m: ['primary', 'secondary', 'trunk'].includes(k) });
    } else {
      G.push({ p: pts, t: t.natural === 'water' || t.waterway ? 'w' : 'g' });
    }
  }
  // rótulos de bairro: remove duplicados e os muito perto da origem/destino
  const seen = new Set(), end = route.at(-1);
  const labels = L.filter((l) => !seen.has(l.n) && seen.add(l.n)
    && Math.hypot(l.p[0], l.p[1]) > 150 && Math.hypot(l.p[0] - end[0], l.p[1] - end[1]) > 150);
  return { route, b: B, r: R, g: G, l: labels, from: from.name, to: to.name };
}
