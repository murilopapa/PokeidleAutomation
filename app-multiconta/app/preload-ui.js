// Ponte da interface com o processo principal (só o que a interface precisa).
const { contextBridge, ipcRenderer } = require('electron');
const on = (canal) => (cb) => ipcRenderer.on(canal, (_e, ...a) => cb(...a));
contextBridge.exposeInMainWorld('app', {
  estado: () => ipcRenderer.invoke('ui:estado'),
  dados: (nome) => ipcRenderer.invoke('ui:dados', nome),
  layout: (rects) => ipcRenderer.send('ui:layout', rects),
  overlay: (msg) => ipcRenderer.send('ui:overlay', msg),
  onOverlay: on('ov:evento'),
  setCfg: (i, cfg) => ipcRenderer.send('ui:cfg', i, cfg),
  recarregar: (i) => ipcRenderer.send('ui:recarregar', i),
  power: (i, ligar) => ipcRenderer.invoke('ui:power', i, ligar),
  devtools: (i) => ipcRenderer.send('ui:devtools', i),
  onDados: on('slot:dados'),
  onRam: on('app:ram'),
  onRelayout: on('app:relayout'),
  arraste: (on, cursor) => ipcRenderer.send('ui:arraste', on, cursor),
  zoom: (i, passo) => ipcRenderer.send('ui:zoom', i, passo),
  modo: (m) => ipcRenderer.invoke('ui:modo', m),
  onModo: on('app:modo'),
  att: {
    verificar: () => ipcRenderer.invoke('att:verificar'),
    instalar: () => ipcRenderer.invoke('att:instalar'),
    onEstado: on('att:estado'),
  },
  onZoom: on('slot:zoom'),
  onJogo: on('jogo:estado'),
  // troca de hunt pedida pela interface (troca automática): o jogo só obedece com as chaves ligadas
  huntAuto: (i, slug) => ipcRenderer.send('ui:hunt-auto', i, slug),
  kick: {
    set: (i, campo, valor) => ipcRenderer.invoke('kk:set', i, campo, valor),
    resgatar: (i, slug, tipo) => ipcRenderer.invoke('kk:resgatar', i, slug, tipo),
    login: (i) => ipcRenderer.invoke('kk:login', i),
    som: (i, canal, ligar) => ipcRenderer.invoke('kk:som', i, canal, ligar),
    onAudio: on('kk:audio'),
    zoom: (passo) => ipcRenderer.send('kk:zoom', passo),
    onZoom: on('kk:zoom'),
    onEstado: on('kk:estado'),
  },
  twitch: {
    vincular: (i) => ipcRenderer.invoke('tw:vincular', i),
    desvincular: (i) => ipcRenderer.invoke('tw:desvincular', i),
    auto: (i, on) => ipcRenderer.invoke('tw:auto', i, on),
    canal: (i, c, on) => ipcRenderer.invoke('tw:canal', i, c, on),
    clientId: (id) => ipcRenderer.invoke('tw:clientId', id),
    onEstado: on('tw:estado'),
  },
});
