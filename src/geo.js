// Geocodificação (Nominatim), rota (OSRM) e dados de mapa (Overpass).
import { fetchJSON } from './net.js';
import { parseCoords, isUrl, isShortGoogleUrl, parseGoogleMapsUrl, expandUrl, scrapeGoogleHtml } from './input.js';

const NOMINATIM = process.env.ROTA3D_NOMINATIM || 'https://nominatim.openstreetmap.org';
const OSRM = process.env.ROTA3D_OSRM || 'https://router.project-osrm.org';
const OVERPASS = (process.env.ROTA3D_OVERPASS || 'https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter').split(',');

const shortName = (r) => r.name || r.display_name.split(',')[0];

export async function geocode(q) {
  const r = await fetchJSON(`${NOMINATIM}/search?format=jsonv2&limit=1&addressdetails=0&q=${encodeURIComponent(q)}`);
  if (!r.length) throw new Error(`Endereço não encontrado: "${q}"`);
  return { lat: +r[0].lat, lng: +r[0].lon, name: shortName(r[0]) };
}

export async function reverse(lat, lng) {
  try {
    const r = await fetchJSON(`${NOMINATIM}/reverse?format=jsonv2&zoom=18&lat=${lat}&lon=${lng}`);
    if (r && !r.error) {
      const a = r.address || {};
      return r.name || [a.road, a.house_number].filter(Boolean).join(', ') || a.suburb || shortName(r);
    }
  } catch { /* sem nome */ }
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/** Converte qualquer entrada aceita em {lat,lng,name}. */
export async function resolvePlace(input, log = () => {}) {
  const s = String(input || '').trim();
  if (!s) throw new Error('Entrada vazia');
  const c = parseCoords(s);
  if (c) return { ...c, name: await reverse(c.lat, c.lng) };
  if (!isUrl(s)) return geocode(s);

  let url = s, html = '';
  if (isShortGoogleUrl(s)) { ({ url, html } = await expandUrl(s)); log(`link expandido: ${url.slice(0, 120)}`); }
  let info = parseGoogleMapsUrl(url);
  if (info.cid && (info.lat == null || info.approx)) {
    const r = await expandUrl(`https://maps.google.com/?cid=${info.cid}`);
    const again = parseGoogleMapsUrl(r.url);
    const scraped = scrapeGoogleHtml(r.html || html);
    info = { ...info, ...scraped, ...(again.lat != null && !again.approx ? again : {}) };
    if (info.lat != null && !info.approx) delete info.approx;
  }
  if (info.lat != null && !info.approx) return { lat: info.lat, lng: info.lng, name: info.name || await reverse(info.lat, info.lng) };
  if (info.name || info.query) {
    try {
      const g = await geocode(info.name || info.query);
      return { ...g, name: info.name || g.name };
    } catch (e) { if (info.lat == null) throw e; }
  }
  if (info.lat != null) return { lat: info.lat, lng: info.lng, name: info.name || await reverse(info.lat, info.lng) };
  throw new Error(`Não consegui extrair coordenadas do link: ${s}`);
}

export async function route(a, b) {
  const r = await fetchJSON(`${OSRM}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`);
  if (r.code !== 'Ok' || !r.routes?.length) throw new Error(`Rota não encontrada entre os pontos (${r.code || 'sem resposta'})`);
  return { coords: r.routes[0].geometry.coordinates, distance: r.routes[0].distance, duration: r.routes[0].duration };
}

/** Amostra a rota a cada ~stepM metros para o filtro "around" do Overpass. */
function samplePolyline(coords, stepM) {
  const out = [coords[0]]; let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    const [x0, y0] = coords[i - 1], [x1, y1] = coords[i];
    acc += Math.hypot((x1 - x0) * 111320 * Math.cos(y0 * Math.PI / 180), (y1 - y0) * 110540);
    if (acc >= stepM) { out.push(coords[i]); acc = 0; }
  }
  out.push(coords.at(-1));
  return out;
}

/** Caixas (bbox) cobrindo a rota em trechos de ~1 km, com margem — evita uma bbox gigante em rotas diagonais. */
export function routeBoxes(coords, marginM = 900, chunkM = 1000) {
  const pts = samplePolyline(coords, 50), boxes = [];
  let cur = null, acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const [lng, lat] = pts[i];
    if (!cur) cur = [lat, lng, lat, lng];
    cur = [Math.min(cur[0], lat), Math.min(cur[1], lng), Math.max(cur[2], lat), Math.max(cur[3], lng)];
    if (i) acc += 50;
    if (acc >= chunkM || i === pts.length - 1) { boxes.push(cur); cur = [lat, lng, lat, lng]; acc = 0; }
  }
  const dLat = marginM / 110540, dLng = marginM / (111320 * Math.cos(coords[0][1] * Math.PI / 180));
  return boxes.map(([s, w, n, e]) => [s - dLat, w - dLng, n + dLat, e + dLng].map((v) => v.toFixed(5)).join(','));
}

export async function mapData(coords, log = () => {}) {
  const sel = ['way["building"]', 'way["highway"]', 'way["leisure"~"^(park|garden)$"]', 'way["landuse"~"^(grass|forest|recreation_ground|meadow)$"]',
    'way["natural"~"^(wood|water|scrub|wetland)$"]', 'way["waterway"="riverbank"]', 'node["place"~"^(suburb|neighbourhood|quarter)$"]'];
  const boxes = routeBoxes(coords);
  const q = `[out:json][timeout:180];\n(\n${boxes.flatMap((b) => sel.map((x) => `  ${x}(${b});`)).join('\n')}\n);\nout geom;`;
  let lastErr;
  for (const ep of OVERPASS) {
    try {
      log(`baixando prédios/ruas do OSM (${new URL(ep).host})…`);
      const r = await fetchJSON(ep, { body: 'data=' + encodeURIComponent(q), ttlDays: 60, timeoutMs: 240000, validate: (d) => d.elements?.length > 0 });
      return r;
    } catch (e) { lastErr = e; log(`Overpass falhou: ${e.message}`); }
  }
  throw new Error(`Não consegui baixar os dados do OSM: ${lastErr?.message}`);
}
