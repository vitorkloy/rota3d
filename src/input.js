// Interpreta entradas: coordenadas "lat,lng", links do Google Maps (inclusive curtos) ou endereço livre.
import { USER_AGENT } from './net.js';

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
const COORD_RE = new RegExp(String.raw`^\s*${NUM}\s*[,;\s]\s*${NUM}\s*$`);

const valid = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** "lat,lng" -> {lat,lng} ou null */
export function parseCoords(s) {
  const m = COORD_RE.exec(String(s));
  if (!m) return null;
  const lat = +m[1], lng = +m[2];
  return valid(lat, lng) ? { lat, lng } : null;
}

export function isUrl(s) { return /^https?:\/\//i.test(String(s).trim()); }
export function isShortGoogleUrl(u) { return /^(maps\.app\.goo\.gl|goo\.gl|g\.co)$/i.test(new URL(u).hostname); }

/**
 * Extrai o que der de uma URL do Google Maps já expandida.
 * Prioridade: !3d!4d (posição do lugar) > parâmetros q/query/ll/destination com coords > @lat,lng (centro da tela).
 * @returns {{lat?:number,lng?:number,name?:string,cid?:string,query?:string}}
 */
export function parseGoogleMapsUrl(u) {
  const url = new URL(u);
  const s = decodeURIComponent(url.href);
  const out = {};
  const place = /\/maps\/place\/([^/@?]+)/.exec(url.pathname);
  if (place) {
    const n = decodeURIComponent(place[1]).replace(/\+/g, ' ').trim();
    const c = parseCoords(n);
    if (c) Object.assign(out, c); else out.name = n;
  }
  const d34 = [...s.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)].at(-1);
  if (d34 && valid(+d34[1], +d34[2])) return { ...out, lat: +d34[1], lng: +d34[2] };
  if (out.lat != null) return out;
  for (const k of ['q', 'query', 'll', 'destination', 'daddr', 'center']) {
    const v = url.searchParams.get(k);
    if (!v) continue;
    const c = parseCoords(v.replace(/^loc:/, ''));
    if (c) return { ...out, ...c };
    if (['q', 'query', 'destination', 'daddr'].includes(k) && !out.name) out.query = v.replace(/\+/g, ' ');
  }
  const cid = url.searchParams.get('cid') ?? /!1s0x[0-9a-f]+:0x([0-9a-f]+)/i.exec(s)?.[1];
  if (cid) out.cid = /^\d+$/.test(cid) ? cid : BigInt('0x' + cid).toString();
  const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(s);
  if (at && valid(+at[1], +at[2])) { out.lat = +at[1]; out.lng = +at[2]; out.approx = true; }
  return out;
}

/** Segue redirects (links curtos) e devolve a URL final. */
export async function expandUrl(u, max = 8) {
  let cur = u;
  for (let i = 0; i < max; i++) {
    const r = await fetch(cur, { redirect: 'manual', headers: { 'User-Agent': USER_AGENT } });
    const loc = r.headers.get('location');
    if (r.status >= 300 && r.status < 400 && loc) { cur = new URL(loc, cur).href; continue; }
    return { url: cur, html: r.ok ? await r.text() : '' };
  }
  return { url: cur, html: '' };
}

/** Procura coords/nome do lugar no HTML da página do Google Maps (usado para CID). */
export function scrapeGoogleHtml(html) {
  const out = {};
  const title = /<meta content="([^"]+)" (?:itemprop="name"|property="og:title")/.exec(html)?.[1];
  if (title && !/^Google Maps$/i.test(title)) out.name = title.split(' · ')[0].trim();
  const st = /staticmap\?center=(-?\d+\.\d+)%2C(-?\d+\.\d+)&amp;zoom=(\d+)/.exec(html);
  if (st && +st[3] >= 15) { out.lat = +st[1]; out.lng = +st[2]; }
  return out;
}
