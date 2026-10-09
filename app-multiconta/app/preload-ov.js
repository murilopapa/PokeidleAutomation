// Ponte do overlay (menus por cima do jogo) com o processo principal.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ov', {
  onConteudo: (cb) => ipcRenderer.on('ov:conteudo', (_e, c) => cb(c)),
  evento: (ev) => ipcRenderer.send('ov:evento', ev),
});
