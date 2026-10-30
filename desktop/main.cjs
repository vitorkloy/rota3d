// App desktop rota3d (Electron). Reaproveita o core da CLI; renderiza a cena numa janela offscreen.
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const W = 1080, H = 1920;
// permite WebGL por software quando não há GPU (VMs, alguns notebooks)
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
const store = (name, def) => {
  const f = path.join(app.getPath('userData'), name + '.json');
  return {
    get: () => { try { return { ...def, ...JSON.parse(fs.readFileSync(f, 'utf8')) }; } catch { return structuredClone(def); } },
    set: (v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2)); return v; },
  };
};
let settings, history, win, current = null;

/** Backend de captura usando Electron (sem baixar outro Chromium). */
function electronBackend(url) {
  return new Promise((resolve, reject) => {
    const w = new BrowserWindow({ show: false, width: W, height: H, useContentSize: true, enableLargerThanScreen: true,
      webPreferences: { offscreen: true, backgroundThrottling: false } });
    w.webContents.on('console-message', () => {});
    w.webContents.once('did-fail-load', (_e, _c, d) => reject(new Error('falha ao carregar a cena: ' + d)));
    w.loadURL(url);
    const t0 = Date.now();
    const poll = async () => {
      if (w.isDestroyed()) return;
      try {
        const err = await w.webContents.executeJavaScript('window.__err||null');
        if (err) { w.destroy(); return reject(new Error('erro na cena 3D: ' + err)); }
        if (await w.webContents.executeJavaScript('!!window.ready')) {
          return resolve({
            frames: () => w.webContents.executeJavaScript('window.N'),
            frame: async (i) => {
              await w.webContents.executeJavaScript(`window.renderFrame(${i});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
              let img = await w.webContents.capturePage();
              const s = img.getSize();
              if (s.width !== W || s.height !== H) img = img.resize({ width: W, height: H, quality: 'best' });
              return img.toPNG();
            },
            close: async () => { if (!w.isDestroyed()) w.destroy(); },
          });
        }
      } catch { /* página ainda carregando */ }
      if (Date.now() - t0 > 600000) { w.destroy(); return reject(new Error('tempo esgotado preparando a cena')); }
      setTimeout(poll, 300);
    };
    w.webContents.once('dom-ready', () => {
      w.webContents.executeJavaScript("window.addEventListener('error',e=>window.__err=e.message);window.addEventListener('unhandledrejection',e=>window.__err=String(e.reason&&e.reason.message||e.reason))");
      poll();
    });
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1040, height: 720, minWidth: 860, minHeight: 600, backgroundColor: '#141414', show: false,
    title: 'rota3d',
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 16, y: 14 } } : { titleBarOverlay: { color: '#141414', symbolColor: '#d6d6d6', height: 36 } }),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: false },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  win.once('ready-to-show', () => win.show());
  if (process.env.ROTA3D_SCREENSHOTS) win.webContents.once('did-finish-load', () => screenshotTour(process.env.ROTA3D_SCREENSHOTS));
}

/** Modo de desenvolvimento: percorre as telas e salva PNGs (usado para documentação/CI). */
async function screenshotTour(dir) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (c) => win.webContents.executeJavaScript(c);
  const shot = async (n) => { await wait(600); fs.writeFileSync(path.join(dir, `ui-${n}.png`), (await win.webContents.capturePage()).toPNG()); };
  fs.mkdirSync(dir, { recursive: true });
  await wait(800);
  await shot('gerar');
  if (process.env.ROTA3D_DE) {
    await js(`document.getElementById('de').value=${JSON.stringify(process.env.ROTA3D_DE)};document.getElementById('para').value=${JSON.stringify(process.env.ROTA3D_PARA)};document.getElementById('go').click()`);
    while (!(await js("document.getElementById('pct').textContent.startsWith('4')||!document.getElementById('result').hidden||!!document.querySelector('#stage .err')"))) await wait(500);
    await shot('progresso');
    while (!(await js("!document.getElementById('result').hidden||!!document.querySelector('#stage .err')"))) await wait(1000);
    await js("document.getElementById('vid').pause();document.getElementById('vid').currentTime=6;document.getElementById('result').scrollIntoView()");
    await shot('resultado');
  }
  await js("document.querySelector('[data-view=historico]').click()"); await shot('historico');
  await js("document.querySelector('[data-view=definicoes]').click()"); await shot('definicoes');
  app.quit();
}

app.whenReady().then(() => {
  settings = store('settings', { outDir: path.join(app.getPath('videos') || app.getPath('home'), 'rota3d'), secPerKm: 3.4, lang: 'pt-BR', openWhenDone: true });
  history = store('history', { items: [] });
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('settings:get', () => ({ ...settings.get(), version: app.getVersion(), platform: process.platform }));
ipcMain.handle('settings:set', (_e, v) => settings.set({ ...settings.get(), ...v }));
ipcMain.handle('history:get', () => history.get().items.filter((i) => fs.existsSync(i.file)));
ipcMain.handle('history:remove', (_e, file) => { const h = history.get(); h.items = h.items.filter((i) => i.file !== file); history.set(h); });
ipcMain.handle('dialog:dir', async () => { const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] }); return r.canceled ? null : r.filePaths[0]; });
ipcMain.handle('shell:show', (_e, f) => shell.showItemInFolder(f));
ipcMain.handle('shell:open', (_e, f) => shell.openPath(f));
ipcMain.handle('job:cancel', () => current?.abort());

ipcMain.handle('job:start', async (e, { de, para }) => {
  if (current) throw new Error('Já existe um vídeo sendo gerado.');
  const s = settings.get();
  fs.mkdirSync(s.outDir, { recursive: true });
  const now = new Date(), stamp = new Date(now - now.getTimezoneOffset() * 60000).toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const out = path.join(s.outDir, `rota3d-${stamp}.mp4`);
  const send = (ch, v) => !e.sender.isDestroyed() && e.sender.send(ch, v);
  current = new AbortController();
  try {
    const { generate } = await import('../src/index.js');
    const r = await generate({
      de, para, out, secPerKm: +s.secPerKm || 3.4, signal: current.signal, backend: electronBackend,
      log: (m) => send('job:log', m), onProgress: (p) => send('job:progress', p),
    });
    const item = { file: out, de: r.from.name, para: r.to.name, km: r.km, seconds: r.seconds, duration: r.duration, at: Date.now() };
    const h = history.get(); h.items.unshift(item); history.set(h);
    return item;
  } catch (err) {
    fs.rmSync(out, { force: true });
    throw new Error(err.message, { cause: err });
  } finally { current = null; }
});
