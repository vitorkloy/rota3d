/* global I18N */
const api = window.rota3d;
const $ = (id) => document.getElementById(id);
let S = {}, T = I18N['pt-BR'];

function applyLang() {
  T = I18N[S.lang] || I18N['pt-BR'];
  document.documentElement.lang = S.lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = T[el.dataset.i18n]; });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = T[el.dataset.i18nPh]; });
}
function seg(id, value, onPick) {
  const el = $(id);
  el.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', b.dataset.v === String(value));
    b.onclick = () => { el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); onPick(b.dataset.v); };
  });
}
async function save(v) { S = { ...S, ...(await api.saveSettings(v)) }; }
function renderSettings() {
  seg('lang', S.lang, async (v) => { await save({ lang: v }); applyLang(); renderHistory(); });
  seg('speed', S.secPerKm, (v) => save({ secPerKm: +v }));
  $('outDir').textContent = S.outDir;
  $('openWhenDone').classList.toggle('on', !!S.openWhenDone);
}
const fileUrl = (f) => 'file://' + (f.startsWith('/') ? '' : '/') + f.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
const fmtS = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${Math.round(s)} s`);

async function renderHistory() {
  const items = await api.history(), box = $('hist');
  box.innerHTML = items.length ? '' : `<div class="empty">${T.histEmpty}</div>`;
  for (const it of items) {
    const d = document.createElement('div'); d.className = 'item';
    d.innerHTML = `<video class="thumb" muted preload="metadata"></video><div class="txt"><div class="t"></div><div class="desc"></div></div>
      <button class="ghost a">${T.openVideo}</button><button class="ghost b">${T.openFolder}</button>`;
    d.querySelector('video').src = fileUrl(it.file) + '#t=1.6';
    d.querySelector('.t').textContent = `${it.de} → ${it.para}`;
    d.querySelector('.desc').textContent = `${it.km.toFixed(2)} km · ${it.duration.toFixed(1)} s · ${new Date(it.at).toLocaleString(S.lang)}`;
    d.querySelector('.a').onclick = () => api.open(it.file);
    d.querySelector('.b').onclick = () => api.showInFolder(it.file);
    box.appendChild(d);
  }
}

document.querySelectorAll('nav button').forEach((b) => (b.onclick = () => {
  document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === b.dataset.view));
  if (b.dataset.view === 'historico') renderHistory();
}));
$('pick').onclick = async () => { const d = await api.chooseDir(); if (d) { await save({ outDir: d }); renderSettings(); } };
$('openWhenDone').onclick = async () => { await save({ openWhenDone: !S.openWhenDone }); renderSettings(); };

api.onLog((m) => { $('log').textContent += m + '\n'; $('log').scrollTop = 1e9; if (!/^\s/.test(m)) $('stage').textContent = m; });
api.onProgress(({ frame, total }) => {
  const p = frame / total; $('barfill').style.width = (p * 100).toFixed(1) + '%';
  $('stage').textContent = `${T.stRendering} · ${frame}/${total} ${T.frames}`; $('pct').textContent = Math.floor(p * 100) + '%';
});
$('cancel').onclick = () => api.cancel();
$('go').onclick = async () => {
  const de = $('de').value.trim(), para = $('para').value.trim();
  if (!de || !para) { $('job').hidden = false; $('stage').innerHTML = `<span class="err">${T.fill}</span>`; return; }
  $('go').disabled = true; $('cancel').hidden = false; $('job').hidden = false; $('result').hidden = true;
  $('log').textContent = ''; $('barfill').style.width = '0'; $('pct').textContent = ''; $('stage').textContent = T.stResolving + '…';
  try {
    const r = await api.start(de, para);
    $('barfill').style.width = '100%'; $('pct').textContent = '100%'; $('stage').textContent = T.stDone;
    $('result').hidden = false; $('vid').src = fileUrl(r.file);
    if (S.openWhenDone) $('vid').play().catch(() => {});
    $('rtitle').textContent = `${r.de} → ${r.para}`;
    $('rinfo').textContent = `${r.km.toFixed(2)} km · ${r.duration.toFixed(1)} s · ${T.gen} ${fmtS(r.seconds)}`;
    $('openFolder').onclick = () => api.showInFolder(r.file);
    $('openVideo').onclick = () => api.open(r.file);
  } catch (e) {
    $('stage').innerHTML = ''; const s = document.createElement('span'); s.className = 'err';
    s.textContent = `${T.stError}: ${String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`; $('stage').appendChild(s);
  } finally { $('go').disabled = false; $('cancel').hidden = true; }
};

(async () => { S = await api.settings(); $('ver').textContent = S.version; applyLang(); renderSettings(); })();
