// Rede com User-Agent identificado, cache local em disco e rate limit por host.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const pkg = createRequire(import.meta.url)('../package.json');
export const USER_AGENT = `rota3d/${pkg.version} (+https://github.com/vitorkloy/rota3d)`;
export const CACHE_DIR = process.env.ROTA3D_CACHE || path.join(os.homedir(), '.cache', 'rota3d');

const MIN_INTERVAL = { 'nominatim.openstreetmap.org': 1100, 'overpass-api.de': 1000, 'router.project-osrm.org': 1000 };
const last = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function throttle(host) {
  const min = MIN_INTERVAL[host] ?? 500;
  const wait = (last.get(host) ?? 0) + min - Date.now();
  if (wait > 0) await sleep(wait);
  last.set(host, Date.now());
}

export class HttpError extends Error {
  constructor(status, url) { super(`HTTP ${status} em ${new URL(url).host}`); this.status = status; }
}

/** GET/POST JSON com cache (TTL em dias) e retentativas com backoff. */
export async function fetchJSON(url, { body, ttlDays = 30, retries = 3, timeoutMs = 120000, validate = () => true } = {}) {
  const key = crypto.createHash('sha1').update(url + '\n' + (body ?? '')).digest('hex');
  const file = path.join(CACHE_DIR, 'http', key.slice(0, 2), key + '.json');
  try {
    const st = fs.statSync(file);
    if (Date.now() - st.mtimeMs < ttlDays * 864e5) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { /* sem cache */ }
  const host = new URL(url).host;
  for (let attempt = 0; ; attempt++) {
    await throttle(host);
    let res;
    try {
      res = await fetch(url, {
        method: body ? 'POST' : 'GET',
        body,
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'pt-BR,pt;q=0.9', ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      if (attempt >= retries) throw new Error(`Falha de rede em ${host}: ${e.message}`, { cause: e });
      await sleep(2000 * 2 ** attempt); continue;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) { await sleep(5000 * 2 ** attempt); continue; }
    if (!res.ok) throw new HttpError(res.status, url);
    const data = await res.json();
    if (data?.remark && /error|timed out|runtime/i.test(data.remark)) throw new Error(`${host}: ${data.remark}`);
    if (!validate(data)) throw new Error(`${host} devolveu resposta vazia`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data));
    return data;
  }
}
