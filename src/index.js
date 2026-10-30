// Pipeline completo: entradas -> rota -> dados OSM -> cena -> MP4.
import { resolvePlace, route, mapData } from './geo.js';
import { buildScene } from './scene.js';
import { renderVideo, drawFramesFor, durationFor } from './render.js';

export const DEFAULT_MAX_KM = 15;

export async function generate({ de, para, out, maxKm = DEFAULT_MAX_KM, nomeDe, nomePara, secPerKm, log = console.error, onProgress, backend, ffmpeg, signal }) {
  const t0 = Date.now();
  log('resolvendo origem…');
  const from = await resolvePlace(de, log);
  log(`origem: ${from.name} (${from.lat.toFixed(5)}, ${from.lng.toFixed(5)})`);
  log('resolvendo destino…');
  const to = await resolvePlace(para, log);
  log(`destino: ${to.name} (${to.lat.toFixed(5)}, ${to.lng.toFixed(5)})`);
  if (nomeDe) from.name = nomeDe;
  if (nomePara) to.name = nomePara;
  const r = await route(from, to);
  const km = r.distance / 1000;
  log(`rota: ${km.toFixed(2)} km → vídeo de ~${durationFor(r.distance, secPerKm).toFixed(1)} s`);
  if (km < 0.05) throw new Error('Origem e destino são praticamente o mesmo ponto.');
  if (km > maxKm) throw new Error(`Rota de ${km.toFixed(1)} km passa do limite de ${maxKm} km (o vídeo teria ${durationFor(r.distance, secPerKm).toFixed(0)} s e exigiria muitos dados do OSM). Use --max-km para aumentar por sua conta.`);
  if (km > 8) log(`aviso: rota longa (${km.toFixed(1)} km); download e renderização vão demorar mais.`);
  const osm = await mapData(r.coords, log);
  const scene = buildScene({ coords: r.coords, osm, from, to });
  scene.drawFrames = drawFramesFor(r.distance, secPerKm);
  log(`cena: ${scene.b.length} prédios, ${scene.r.length} ruas, ${scene.g.length} áreas verdes/água`);
  log('renderizando…');
  await renderVideo(scene, out, { log, onProgress, backend, ffmpeg, signal });
  const secs = (Date.now() - t0) / 1000;
  log(`pronto: ${out} (${secs.toFixed(0)} s)`);
  return { out, from, to, km, seconds: secs, duration: durationFor(r.distance, secPerKm) };
}
