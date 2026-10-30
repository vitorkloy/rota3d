const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('rota3d', {
  settings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (v) => ipcRenderer.invoke('settings:set', v),
  history: () => ipcRenderer.invoke('history:get'),
  removeHistory: (f) => ipcRenderer.invoke('history:remove', f),
  chooseDir: () => ipcRenderer.invoke('dialog:dir'),
  showInFolder: (f) => ipcRenderer.invoke('shell:show', f),
  open: (f) => ipcRenderer.invoke('shell:open', f),
  start: (de, para) => ipcRenderer.invoke('job:start', { de, para }),
  cancel: () => ipcRenderer.invoke('job:cancel'),
  onLog: (cb) => ipcRenderer.on('job:log', (_e, m) => cb(m)),
  onProgress: (cb) => ipcRenderer.on('job:progress', (_e, p) => cb(p)),
});
