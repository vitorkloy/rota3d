// Renderiza a cena em Chromium headless (Puppeteer) e codifica com ffmpeg.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const THREE_DIR = path.dirname(path.dirname(require.resolve('three')));
export const FPS = 30, W = 1080, H = 1920;
export const SEC_PER_KM = 3.4;
export const INTRO_S = 1.5, OUTRO_S = 1.5;

export const drawFramesFor = (meters, secPerKm = SEC_PER_KM) => Math.max(30, Math.round((meters / 1000) * secPerKm * FPS));
export const durationFor = (meters, secPerKm = SEC_PER_KM) => INTRO_S + drawFramesFor(meters, secPerKm) / FPS + OUTRO_S;

export function ffmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  return require('@ffmpeg-installer/ffmpeg').path.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
}

async function launchBrowser(log) {
  const puppeteer = (await import('puppeteer')).default;
  let exe = process.env.ROTA3D_CHROME;
  if (!exe) {
    exe = puppeteer.executablePath();
    if (!fs.existsSync(exe)) {
      log('baixando Chromium (só na primeira vez)…');
      execFileSync(process.execPath, [require.resolve('puppeteer/install.mjs')], { stdio: 'inherit' });
      exe = puppeteer.executablePath();
    }
  }
  return puppeteer.launch({
    executablePath: exe, headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--hide-scrollbars'],
    protocolTimeout: 600000,
  });
}

function startServer(scene) {
  const json = JSON.stringify(scene);
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    if (u === '/scene.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(json); }
    let f;
    if (u === '/') f = path.join(ROOT, 'render', 'index.html');
    else if (u === '/render/BufferGeometryUtils.js') f = path.join(ROOT, 'render', 'BufferGeometryUtils.js');
    else if (u.startsWith('/three/')) f = path.join(THREE_DIR, path.normalize(u.slice(7)).replace(/^(\.\.[/\\])+/, ''));
    if (!f || !(f.startsWith(ROOT) || f.startsWith(THREE_DIR)) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : 'text/html' });
    res.end(fs.readFileSync(f));
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

/** @param {(p:{frame:number,total:number})=>void} onProgress */
/** Backend padrão: Puppeteer. O app desktop injeta um backend Electron com a mesma interface. */
export async function puppeteerBackend(url, log) {
  const browser = await launchBrowser(log);
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H });
  let pageErr;
  const failed = new Promise((_, rej) => page.on('pageerror', (e) => { pageErr = e; rej(new Error('erro na cena 3D: ' + e.message)); }));
  failed.catch(() => {});
  await page.goto(url);
  await Promise.race([page.waitForFunction('window.ready', { timeout: 180000 }), failed]);
  if (pageErr) throw pageErr;
  return {
    frames: () => page.evaluate('window.N'),
    frame: async (i) => { await page.evaluate((f) => globalThis.renderFrame(f), i); return page.screenshot({ type: 'png', optimizeForSpeed: true }); },
    close: () => browser.close(),
  };
}

export async function renderVideo(scene, out, { log = () => {}, onProgress = () => {}, backend = puppeteerBackend, ffmpeg = ffmpegPath(), signal } = {}) {
  const srv = await startServer(scene);
  let ff, be;
  try {
    be = await backend(`http://127.0.0.1:${srv.address().port}/`, log);
    const N = await be.frames();
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    ff = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', out],
    { stdio: ['pipe', 'inherit', 'pipe'] });
    let ffErr = '';
    ff.stderr.on('data', (d) => (ffErr += d));
    const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg falhou: ' + ffErr)))));
    for (let f = 0; f < N; f++) {
      if (signal?.aborted) throw new Error('cancelado');
      const buf = await be.frame(f);
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      onProgress({ frame: f + 1, total: N });
    }
    ff.stdin.end();
    await done;
  } finally {
    if (ff && ff.exitCode === null && !ff.stdin.writableEnded) ff.kill();
    await be?.close();
    srv.close();
  }
}
