// Interface web local: dois campos + botão, progresso via polling, download do MP4.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { generate } from './index.js';

const PAGE = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'web', 'index.html');
const jobs = new Map();
let queue = Promise.resolve(); // um vídeo por vez (render pesado + respeito às APIs)

function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }

export function serve(port = 3000) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rota3d-'));
  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(fs.readFileSync(PAGE)); }
    if (req.method === 'POST' && url.pathname === '/api/jobs') {
      let body = ''; for await (const c of req) body += c;
      let p; try { p = JSON.parse(body); } catch { return json(res, 400, { error: 'JSON inválido' }); }
      if (!p.de || !p.para) return json(res, 400, { error: 'Preencha origem e destino' });
      const id = crypto.randomUUID();
      const job = { id, status: 'na fila', log: [], frame: 0, total: 0, out: path.join(dir, id + '.mp4') };
      jobs.set(id, job);
      queue = queue.then(() => {
        job.status = 'gerando';
        return generate({ de: p.de, para: p.para, out: job.out, log: (m) => job.log.push(m), onProgress: ({ frame, total }) => Object.assign(job, { frame, total }) })
          .then(() => { job.status = 'pronto'; }, (e) => { job.status = 'erro'; job.error = e.message; });
      });
      return json(res, 202, { id });
    }
    const m = /^\/api\/jobs\/([\w-]+)(\/video)?$/.exec(url.pathname);
    const job = m && jobs.get(m[1]);
    if (job && !m[2]) { const pub = { ...job }; delete pub.out; return json(res, 200, pub); }
    if (job && m[2] && job.status === 'pronto') {
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Disposition': 'attachment; filename="rota3d.mp4"' });
      return fs.createReadStream(job.out).pipe(res);
    }
    json(res, 404, { error: 'não encontrado' });
  });
  srv.listen(port, '127.0.0.1', () => console.log(`rota3d: abra http://localhost:${port}`));
  return srv;
}
