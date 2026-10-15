// PokeIdle Multi — processo principal.
// Uma janela com a interface (ui/index.html) e até 4 WebContentsView com o jogo, cada uma com a
// própria sessão ("persist:conta-N"): cookies, login e config separados por conta.
const { app, BaseWindow, BrowserWindow, WebContentsView, ipcMain, shell, session, protocol, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const Twitch = require('./lib/twitch');
const Kick = require('./lib/kick');
const { Jogo } = require('./lib/jogo');
let jogo = null; // dados e fórmulas do jogo no ar (motor do Onde caçar)
const Atualizador = require('./lib/atualizar');

const SLOTS = 4;                                        // o jogo permite 4 contas por IP
const GAME_URL = process.env.PIE_GAME_URL || 'https://pokeidle.io/app';
const LARGURA_BASE = 1280, ALTURA_BASE = 720;           // tamanho "natural" do jogo para o zoom automático

// Sem " Electron/x" no user-agent: o jogo vê um Chrome comum.
app.userAgentFallback = app.userAgentFallback.replace(/ Electron\/\S+/, '').replace(/ (pokeidle-multi|PokeIdleMulti)\/\S+/i, '');

// As contas e os players da Kick seguem rodando mesmo com a janela minimizada ou coberta.
// Páginas do mesmo site na MESMA conta dividem um processo (vários players da Kick = 1 processo).
app.commandLine.appendSwitch('process-per-site');
for (const s of ['disable-renderer-backgrounding', 'disable-background-timer-throttling', 'disable-backgrounding-occluded-windows', 'disable-background-media-suspend']) app.commandLine.appendSwitch(s);

protocol.registerSchemesAsPrivileged([{ scheme: 'pie', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

// ------------------------------------------------------------------ armazenamento por conta
const DIR = () => path.join(app.getPath('userData'), 'contas');
const PERSISTE = ['cfg', 'medidas', 'log', 'zoom', 'desligada', 'nick', 'sniper']; // sniper: histórico de compras aparece mesmo com o jogo fechado
const store = Array.from({ length: SLOTS }, () => ({}));
const salvarTimer = {};
function carregarStores() {
  fs.mkdirSync(DIR(), { recursive: true });
  for (let i = 0; i < SLOTS; i++) {
    try { Object.assign(store[i], JSON.parse(fs.readFileSync(path.join(DIR(), `conta-${i + 1}.json`), 'utf8'))); } catch (_) { /* conta nova */ }
  }
}
function salvar(i) {
  clearTimeout(salvarTimer[i]);
  salvarTimer[i] = setTimeout(() => {
    const out = {};
    for (const k of PERSISTE) if (store[i][k] !== undefined) out[k] = store[i][k];
    fs.writeFile(path.join(DIR(), `conta-${i + 1}.json`), JSON.stringify(out), () => {});
    delete salvarTimer[i];
  }, 800);
}
// Ao fechar (ou ao atualizar), grava na hora o que ainda estava esperando os 800 ms.
function salvarTudoJa() {
  for (const k of Object.keys(salvarTimer)) {
    const i = +k;
    clearTimeout(salvarTimer[i]); delete salvarTimer[i];
    const out = {};
    for (const c of PERSISTE) if (store[i][c] !== undefined) out[c] = store[i][c];
    try { fs.writeFileSync(path.join(DIR(), `conta-${i + 1}.json`), JSON.stringify(out)); } catch (_) { /* segue */ }
  }
}

// ------------------------------------------------------------------ dados do guia (cache)
const VENDOR = path.join(__dirname, 'vendor');
const dadosCache = {};
function dados(nome) {
  const limpo = path.normalize(nome).replace(/^([/\\])+/, '');
  if (!/^data[/\\][\w.-]+\.json$/.test(limpo)) throw new Error('arquivo não permitido: ' + nome);
  if (!dadosCache[limpo]) dadosCache[limpo] = JSON.parse(fs.readFileSync(path.join(VENDOR, limpo), 'utf8'));
  return dadosCache[limpo];
}

// ------------------------------------------------------------------ janela e quadrados
let win = null;
const views = [];             // WebContentsView do jogo, por quadrado
const visivel = [];           // o quadrado está na tela agora?
let ov = null;                // view transparente dos menus (por cima do jogo)
let ovSlot = null;            // quadrado onde o menu está aberto
const slotDe = new Map();     // webContents.id -> índice do quadrado
let twitch = null;
let kick = null;
const KICK_URL = process.env.PIE_KICK_URL || 'https://kick.com';
const KICK_PLAYER_URL = process.env.PIE_KICK_PLAYER_URL || 'https://player.kick.com';
const kickViews = Array.from({ length: SLOTS }, () => new Map());   // conta -> (canal -> player mudo)
const kickRect = {};          // "conta|canal" -> posição na doca

const ui = (canal, ...args) => { if (win && !win.isDestroyed()) win.webContents.send(canal, ...args); };

function criarJanela() {
  win = new BrowserWindow({
    width: 1600, height: 960, minWidth: 900, minHeight: 600,
    backgroundColor: '#0b1020', title: 'PokeIdle Multi', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload-ui.js'), contextIsolation: true, sandbox: true },
  });
  win.loadURL('pie://app/ui/index.html');

  for (let i = 0; i < SLOTS; i++) if (!store[i].desligada) criarView(i);
  // Menus do app por cima do jogo: view transparente adicionada por ÚLTIMO (fica no topo).
  ov = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'preload-ov.js'), contextIsolation: true, sandbox: true, spellcheck: false } });
  ov.setBackgroundColor('#00000000');
  ov.setVisible(false);
  win.contentView.addChildView(ov);
  ov.webContents.loadURL('pie://app/ui/overlay.html');
  win.on('closed', () => { win = null; });
}

// Um quadrado do jogo. Criado ao abrir (ou ao ligar a conta) e destruído ao desligar, para a
// memória daquela conta voltar inteira para o sistema.
function criarView(i) {
  if (views[i] || !win) return;
  const partition = `persist:conta-${i + 1}`;
  const v = new WebContentsView({
    webPreferences: {
      partition,
      preload: path.join(__dirname, 'preload-jogo.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      backgroundThrottling: false,   // as 4 contas continuam rodando mesmo fora de foco
      spellcheck: false,
    },
  });
  v.setBackgroundColor('#0b1020');
  v.setVisible(false);
  win.contentView.addChildView(v);
  if (ov) { win.contentView.removeChildView(ov); win.contentView.addChildView(ov); } // overlay sempre no topo
  views[i] = v; visivel[i] = false;
  slotDe.set(v.webContents.id, i);
  const wc = v.webContents;
  wc.setAudioMuted(true);
  // Links que o jogo abre (ex.: "Vincular Twitch") ficam na MESMA sessão da conta.
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/([\w-]+\.)?(pokeidle\.io|twitch\.tv|kick\.com)\//.test(url)) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 900, height: 760, autoHideMenuBar: true, webPreferences: { partition, preload: path.join(__dirname, 'preload-vazio.js') } } };
    }
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('did-start-navigation', (d) => { if (d.isMainFrame && !d.isSameDocument) cssLeve[i] = null; });
  wc.on('did-finish-load', () => { aplicarZoom(i); ecoNoJogo(i); });
  atalhosDeZoom(wc, (p) => zoomConta(i, p));
  wc.on('render-process-gone', () => setTimeout(() => !wc.isDestroyed() && wc.reload(), 3000));
  // O jogo pergunta "sair da página?" (beforeunload). Dentro do app isso só travava o
  // "Recarregar jogo" e o fechar do app, sem mostrar a pergunta: aqui a resposta é sempre sim.
  wc.on('will-prevent-unload', (e) => e.preventDefault());
  wc.loadURL(GAME_URL);
  if (limites[i]) { v.setBounds({ x: limites[i].x, y: limites[i].y, width: limites[i].width, height: limites[i].height }); v.setVisible(modo() !== 'ultra'); }
}
// Player da Kick: página do canal na sessão da conta, sem som. Pequeno, mas visível (a Kick só
// conta quem está assistindo; página escondida pausa o player).
// Som de cada player da Kick: quem manda é a própria página (o botão de som da Kick funciona igual).
// O app só começa tudo mudo e oferece um atalho de som na doca.
ipcMain.handle('kk:som', async (_e, i, canal, ligar) => {
  const v = kickViews[i]?.get(canal);
  if (!v) return false;
  v.webContents.send('kk:som', !!ligar);
  return true;
});
let audivelAntes = '';
setInterval(() => {
  const mapa = {};
  kickViews.forEach((m, i) => m.forEach((v, canal) => { if (!v.webContents.isDestroyed() && v.webContents.isCurrentlyAudible()) mapa[i + '|' + canal] = true; }));
  const s = JSON.stringify(mapa);
  if (s !== audivelAntes) { audivelAntes = s; ui('kk:audio', mapa); }
}, 1500);

const kickModo = [];
function playerKick(i, canais, modo = 'leve') {
  const atuais = kickViews[i];
  if (kickModo[i] && kickModo[i] !== modo) {
    // trocou leve <-> completo: reabre os players
    for (const [, v] of atuais) { win?.contentView.removeChildView(v); try { v.webContents.close(); } catch (_) { /* ok */ } }
    atuais.clear();
  }
  kickModo[i] = modo;
  // fecha os players de lives que acabaram
  for (const [canal, v] of [...atuais]) {
    if (canais.includes(canal) && win) continue;
    atuais.delete(canal);
    win?.contentView.removeChildView(v);
    try { v.webContents.close(); } catch (_) { /* ok */ }
  }
  if (!win) return;
  // abre um para cada live nova
  for (const canal of canais) {
    if (atuais.has(canal)) continue;
    const v = new WebContentsView({ webPreferences: { partition: `persist:conta-${i + 1}`, preload: path.join(__dirname, 'preload-kick.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false, spellcheck: false } });
    v.setBackgroundColor('#000000');
    v.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    v.webContents.on('did-finish-load', () => { v.webContents.setZoomFactor(Number(appCfg.zoomKick) || 1); v.webContents.insertCSS('::-webkit-scrollbar{display:none!important}html,body{overflow:hidden!important}').catch(() => {}); });
    win.contentView.addChildView(v);
    const r = kickRect[i + '|' + canal];
    if (r) v.setBounds(r); else v.setVisible(false);
    // player leve (o player oficial de incorporar da Kick, só vídeo) ou a página inteira do canal
    v.webContents.loadURL(kickModo[i] === 'completo' ? `${KICK_URL}/${encodeURIComponent(canal)}` : `${KICK_PLAYER_URL}/${encodeURIComponent(canal)}?muted=true&autoplay=true`);
    atalhosDeZoom(v.webContents, (p) => zoomKickGrande(p));
    atuais.set(canal, v);
  }
  if (ov) { win.contentView.removeChildView(ov); win.contentView.addChildView(ov); }
}

function destruirView(i) {
  const v = views[i];
  if (!v) return;
  views[i] = null; visivel[i] = false;
  slotDe.delete(v.webContents.id);
  win?.contentView.removeChildView(v);
  try { v.webContents.close(); } catch (_) { /* já fechou */ }
}
// Botão "power" da conta: desligada = sem jogo aberto (zero RAM daquela conta) e sem Twitch.
ipcMain.handle('ui:power', (_e, i, ligar) => {
  if (!(i >= 0 && i < SLOTS)) return false;
  if (ligar) { delete store[i].desligada; criarView(i); twitch.pausar(i, false); kick.pausar(i, false); }
  else {
    store[i].desligada = true;
    destruirView(i);
    twitch.pausar(i, true);
    kick.pausar(i, true);
    if (ovSlot === i) { ovSlot = null; ov?.setVisible(false); }
    store[i].snapshot = { at: Date.now(), connected: false, ready: false };
    ui('slot:dados', i, { snapshot: store[i].snapshot });
  }
  salvar(i);
  return !store[i].desligada;
});

const limites = [];
function aplicarZoom(i) {
  const b = limites[i];
  if (!b || !views[i]) return;
  const manual = Number(store[i].zoom) || 0; // Ctrl + roda do mouse / Ctrl +/- / botões da engrenagem
  const cabe = Math.min(b.width / LARGURA_BASE, b.height / ALTURA_BASE);
  // miniatura (modo expandido): encolhe o que precisar; quadrado normal: entre 50% e 100%
  const z = b.mini ? Math.max(0.15, Math.min(1, cabe)) : manual || Math.max(0.5, Math.min(1, cabe));
  views[i].webContents.setZoomFactor(z);
  ui('slot:zoom', i, { z, manual: !!manual });
}
// Zoom do jogo por conta: automático (cabe o jogo no quadrado) ou fixo (+/− na engrenagem).
function zoomConta(i, passo) {
  if (!views[i]) return;
  if (passo === 0) delete store[i].zoom;
  else {
    const atual = views[i].webContents.getZoomFactor();
    store[i].zoom = Math.round(Math.max(0.3, Math.min(2, atual + passo * 0.1)) * 10) / 10;
  }
  salvar(i);
  aplicarZoom(i);
}
ipcMain.on('ui:zoom', (_e, i, passo) => zoomConta(i, passo));
// Ctrl + roda do mouse e Ctrl +, Ctrl -, Ctrl 0 dentro de uma página (jogo ou player grande da Kick)
function atalhosDeZoom(wc, fazer) {
  wc.on('zoom-changed', (_e, dir) => fazer(dir === 'in' ? 1 : -1));
  wc.on('before-input-event', (e, inp) => {
    if (inp.type !== 'keyDown' || !(inp.control || inp.meta)) return;
    if (inp.key === '=' || inp.key === '+') { fazer(1); e.preventDefault(); }
    else if (inp.key === '-') { fazer(-1); e.preventDefault(); }
    else if (inp.key === '0') { fazer(0); e.preventDefault(); }
  });
}
// zoom do player grande da Kick (vale para todas as lives; fica salvo)
const APP_CFG = () => path.join(app.getPath('userData'), 'app.json');
let appCfg = {};
const salvarAppCfg = () => fs.writeFile(APP_CFG(), JSON.stringify(appCfg), () => {});

// ------------------------------------------------------------------ modos (valem para TODAS as contas)
// normal = cena do jogo ligada · eco = Modo Economia do próprio jogo (o botão da bateria: para de
// desenhar o mapa e os pokémon andando; o servidor para de mandar o campo) · ultra = eco + os
// quadrados do jogo deixam de ser desenhados pelo app (a página continua rodando, só não é pintada).
// Sem escolha feita (appCfg.modo vazio) o app não mexe na economia de ninguém.
const MODOS = ['normal', 'eco', 'ultra'];
const modo = () => (MODOS.includes(appCfg.modo) ? appCfg.modo : 'normal');
function ecoNoJogo(i) {
  const v = views[i];
  if (!v || v.webContents.isDestroyed()) return;
  paginaLeve(i, modo() === 'ultra');
  if (!appCfg.modo) return;
  v.webContents.send('jogo:eco', modo() !== 'normal');
}
// Ultra eco: a página do jogo some por dentro (o navegador para de recalcular estilo e layout a
// cada evento). insertCSS passa pela CSP do jogo; sair do modo tira o CSS, sem recarregar.
const CSS_LEVE = 'body>*{display:none!important}*,*::before,*::after{animation:none!important;transition:none!important}';
const cssLeve = [];
async function paginaLeve(i, ligar) {
  const wc = views[i]?.webContents;
  if (!wc || wc.isDestroyed()) return;
  wc.send('jogo:leve', ligar);
  if (ligar && !cssLeve[i]) {
    cssLeve[i] = 'pendente';
    try { cssLeve[i] = await wc.insertCSS(CSS_LEVE); } catch (_) { cssLeve[i] = null; }
    if (modo() !== 'ultra') paginaLeve(i, false);
  } else if (!ligar && cssLeve[i] && cssLeve[i] !== 'pendente') {
    const k = cssLeve[i]; cssLeve[i] = null;
    try { await wc.removeInsertedCSS(k); } catch (_) { /* segue */ }
  }
}
function definirModo(m) {
  if (!MODOS.includes(m)) return modo();
  appCfg.modo = m;
  salvarAppCfg();
  for (let i = 0; i < SLOTS; i++) { ecoNoJogo(i); views[i]?.setVisible(!!visivel[i] && m !== 'ultra'); }
  if (m === 'ultra') ovSlot = null;
  posicionarOverlay();
  ui('app:modo', m);
  return m;
}
ipcMain.handle('ui:modo', (_e, m) => definirModo(m));
function zoomKickGrande(passo) {
  const atual = Number(appCfg.zoomKick) || 1;
  appCfg.zoomKick = passo === 0 ? 1 : Math.round(Math.max(0.5, Math.min(2.5, atual + passo * 0.1)) * 10) / 10;
  salvarAppCfg();
  for (const m of kickViews) for (const [, v] of m) if (!v.webContents.isDestroyed()) v.webContents.setZoomFactor(appCfg.zoomKick);
  ui('kk:zoom', appCfg.zoomKick);
}
ipcMain.on('kk:zoom', (_e, passo) => zoomKickGrande(passo));
let kickGrande = null;   // { i, canal } da live aberta grande

// A interface manda onde cada quadrado está (em px CSS); o resto fica escondido (mas rodando).
ipcMain.on('ui:layout', (_e, rects) => {
  const dentro = new Set();
  const kickNaTela = new Set();
  let grandeAgora = null;
  for (const r of rects) {
    if (r.kick != null) {
      const k = r.kick, chave = k + '|' + r.canal;
      if (!(k >= 0 && k < SLOTS)) continue;
      kickNaTela.add(chave);
      kickRect[chave] = { x: Math.round(r.x), y: Math.round(r.y), width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)) };
      const kv = kickViews[k].get(r.canal);
      if (r.grande) grandeAgora = { i: k, canal: r.canal };
      // zoom do Chromium é por site dentro da sessão: todos os players da Kick da conta usam o mesmo
      // (se cada um tivesse um zoom, um mexeria no outro e o player grande "pulava" de tamanho)
      if (kv) kv.setBounds(kickRect[chave]);
      continue;
    }
    const i = r.slot;
    if (!(i >= 0 && i < SLOTS)) continue;
    dentro.add(i);
    if (!views[i]) { limites[i] = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), mini: !!r.mini }; continue; }
    const b = { x: Math.round(r.x), y: Math.round(r.y), width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)), mini: !!r.mini };
    const mudou = JSON.stringify(b) !== JSON.stringify(limites[i]);
    limites[i] = b;
    views[i].setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
    if (mudou) aplicarZoom(i);
  }
  // Nunca esconde um jogo que está na tela: view escondida = página "oculta" = o navegador pausa o jogo.
  for (let i = 0; i < SLOTS; i++) {
    visivel[i] = dentro.has(i);
    // conta fora da tela (outra expandida, live grande aberta): o menu dela não pode ficar boiando
    // na posição antiga, tampando e roubando cliques
    if (!visivel[i] && limites[i]) limites[i] = { ...limites[i], oculto: true };
    views[i]?.setVisible(visivel[i] && modo() !== 'ultra');
    for (const [canal, v] of kickViews[i]) {
      const chave = i + '|' + canal;
      if (!kickNaTela.has(chave)) delete kickRect[chave];
      v.setVisible(kickNaTela.has(chave));
    }
  }
  kickGrande = grandeAgora;
  posicionarOverlay();
});

function posicionarOverlay() {
  if (!ov) return;
  const b = ovSlot != null ? limites[ovSlot] : null;
  if (!b || b.mini || b.oculto || modo() === 'ultra') { ov.setVisible(false); return; }
  ov.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
  ov.setVisible(true);
}
// A interface manda o menu aberto (ou null). O jogo de baixo continua visível e rodando.
ipcMain.on('ui:overlay', (_e, msg) => {
  if (!ov) return;
  ovSlot = msg && msg.slot >= 0 && msg.slot < SLOTS ? msg.slot : null;
  ov.webContents.send('ov:conteudo', ovSlot == null ? null : { kind: msg.kind, html: String(msg.html || '') });
  posicionarOverlay();
  if (ovSlot != null && msg.kind !== 'pop') ov.webContents.focus();
});
// Arrastar a divisória entre quadrados: o overlay cobre a janela toda enquanto você arrasta,
// para o mouse não "cair" dentro de um jogo no meio do movimento.
ipcMain.on('ui:arraste', (_e, on, cursor) => {
  if (!ov || !win) return;
  if (on) {
    const [w, h] = win.getContentSize();
    ov.setBounds({ x: 0, y: 0, width: w, height: h });
    ov.setVisible(true);
    ov.webContents.send('ov:conteudo', { kind: 'drag', cursor: cursor || 'col-resize', html: '' });
  } else {
    ov.webContents.send('ov:conteudo', null);
    ovSlot = null;
    ov.setVisible(false);
  }
});
ipcMain.on('ov:evento', (e, ev) => { if (ov && e.sender === ov.webContents) ui('ov:evento', ev); });

ipcMain.handle('ui:estado', () => ({
  slots: SLOTS,
  origemJogo: new URL(GAME_URL).origin,
  zoomKick: Number(appCfg.zoomKick) || 1,
  modo: appCfg.modo ? modo() : null,
  att: atualizador?.estado() ?? null,
  stores: store.map((s) => ({ cfg: s.cfg ?? null, snapshot: s.snapshot ?? null, catalog: s.catalog ?? null, medidas: s.medidas ?? {}, geo: s.geo ?? null, sniper: s.sniper ?? null, desligada: !!s.desligada, nick: s.nick ?? null })),
  twitch: twitch.estado(),
  kick: kick.estado(),
  jogo: jogo?.estado ?? null,
}));
ipcMain.handle('ui:dados', (_e, nome) => dados(nome));

// Config de uma conta mudou na interface → grava e avisa o jogo daquela conta.
ipcMain.on('ui:cfg', (_e, i, cfg) => {
  if (!(i >= 0 && i < SLOTS)) return;
  store[i].cfg = cfg;
  salvar(i);
  views[i]?.webContents.send('jogo:store-changed', { cfg });
});
ipcMain.on('ui:recarregar', (_e, i) => views[i]?.webContents.reloadIgnoringCache());
ipcMain.on('ui:devtools', (_e, i) => views[i]?.webContents.openDevTools({ mode: 'detach' }));
ipcMain.on('ui:hunt-auto', (_e, i, slug) => {
  const v = views[i];
  if (v && !v.webContents.isDestroyed() && typeof slug === 'string') v.webContents.send('jogo:runtime-msg', { type: 'pie-hunt-auto', slug });
});

// ------------------------------------------------------------------ ponte com o jogo (preload)
ipcMain.on('jogo:store-all', (e) => {
  const i = slotDe.get(e.sender.id);
  e.returnValue = i == null ? {} : JSON.parse(JSON.stringify(store[i]));
});
ipcMain.on('jogo:store-set', (e, itens) => {
  const i = slotDe.get(e.sender.id);
  if (i == null || !itens || typeof itens !== 'object') return;
  Object.assign(store[i], itens);
  if (itens.snapshot?.nick && itens.snapshot.nick !== store[i].nick) { store[i].nick = itens.snapshot.nick; salvar(i); }
  if (PERSISTE.some((k) => k in itens)) salvar(i);
  const paraUi = {};
  for (const k of ['snapshot', 'catalog', 'medidas', 'cfg', 'geo', 'sniper']) if (k in itens) paraUi[k] = itens[k];
  if (Object.keys(paraUi).length) ui('slot:dados', i, paraUi);
  if (itens.snapshot) { twitch.snapshot(i, itens.snapshot); kick.snapshot(i, itens.snapshot); }
});
ipcMain.handle('jogo:data', (e, nome) => dados(nome));

// ------------------------------------------------------------------ Twitch
ipcMain.handle('tw:vincular', (_e, i) => twitch.vincular(i));
ipcMain.handle('tw:desvincular', (_e, i) => twitch.desvincular(i));
ipcMain.handle('tw:auto', (_e, i, on) => twitch.setAuto(i, !!on));
ipcMain.handle('tw:canal', (_e, i, canal, on) => twitch.setCanal(i, canal, !!on));
ipcMain.handle('tw:clientId', (_e, id) => twitch.setClientId(id));

// ------------------------------------------------------------------ Kick
ipcMain.handle('kk:set', (_e, i, campo, valor) => kick.set(i, campo, valor));
ipcMain.handle('kk:resgatar', async (_e, i, slug, tipo) => {
  try { return await kick.resgatar(i, slug, tipo, 'manual'); } catch (e) { return { erro: e.message }; }
});
// Entrar na Kick com a sessão da conta (a janela usa o site normal da Kick; e-mail e senha).
ipcMain.handle('kk:login', (_e, i) => {
  const w = new BrowserWindow({ width: 520, height: 760, parent: win ?? undefined, autoHideMenuBar: true, title: 'Entrar na Kick',
    webPreferences: { partition: `persist:conta-${i + 1}`, preload: path.join(__dirname, 'preload-vazio.js'), contextIsolation: true, sandbox: true } });
  w.loadURL(KICK_URL + '/');
  w.on('closed', () => kick.logou(i));
  return true;
});

// ------------------------------------------------------------------ RAM
// Memória PRÓPRIA de cada processo (privateBytes no Windows). O "working set" conta a memória
// compartilhada em cada processo e infla a soma.
setInterval(() => {
  if (!win) return;
  const met = app.getAppMetrics();
  const mb = (m) => ((m.memory?.privateBytes ?? m.memory?.workingSetSize) || 0) / 1024;
  const porPid = new Map(met.map((m) => [m.pid, m]));
  const doPid = (v) => { const m = v && !v.webContents.isDestroyed() && porPid.get(v.webContents.getOSProcessId()); return m ? mb(m) : 0; };
  const contas = views.map((v, i) => Math.round(doPid(v) + [...kickViews[i].values()].reduce((s, k) => s + doPid(k), 0)));
  const gpu = Math.round(met.filter((m) => m.type === 'GPU').reduce((s, m) => s + mb(m), 0));
  const total = Math.round(met.reduce((s, m) => s + mb(m), 0));
  ui('app:ram', { total, contas, gpu, app: Math.max(0, total - gpu - contas.reduce((a, b) => a + b, 0)) });
}, 3000);

// ------------------------------------------------------------------ atualização automática
// O app procura versão nova no GitHub Releases (repo em package.json → "atualizacao.repo"),
// baixa o instalador em segundo plano e mostra "Atualizar para X" na barra de cima. O clique
// fecha o app, roda o instalador sem perguntas (/S) e o instalador abre o app de novo.
let atualizador = null;
ipcMain.handle('att:verificar', () => atualizador.verificar());
// Antes de fechar para instalar: grava no disco os cookies e o armazenamento de cada conta. O
// login da Kick troca de token toda hora; sem isto o instalador fechava o app antes do Chromium
// gravar o token novo e a Kick voltava deslogada.
async function gravarSessoes() {
  const parts = [''];
  for (let i = 0; i < SLOTS; i++) parts.push(`persist:conta-${i + 1}`);
  await Promise.all(parts.map(async (p) => {
    const ses = p ? session.fromPartition(p) : session.defaultSession;
    try { ses.flushStorageData(); } catch (_) { /* segue */ }
    try { await ses.cookies.flushStore(); } catch (_) { /* segue */ }
  }));
}
ipcMain.handle('att:instalar', async () => { salvarTudoJa(); await gravarSessoes(); return atualizador.instalar(); });

// ------------------------------------------------------------------ início
app.whenReady().then(() => {
  carregarStores();
  try { appCfg = JSON.parse(fs.readFileSync(APP_CFG(), 'utf8')); } catch (_) { appCfg = {}; }
  // a interface é servida por pie://app/... (mesma origem para os fetch dos dados do guia)
  protocol.handle('pie', (req) => {
    const u = new URL(req.url);
    const rel = path.normalize(decodeURIComponent(u.pathname)).replace(/^([/\\])+/, '');
    if (u.host === 'app' && /^jogo[/\\]/.test(rel)) {
      const arq = jogo?.arquivo(rel.slice(5));
      if (!arq) return new Response('não', { status: 404 });
      const tipo = /\.m?js$/.test(arq) ? 'text/javascript' : /\.json$/.test(arq) ? 'application/json' : 'application/octet-stream';
      return new Response(fs.readFileSync(arq), { headers: { 'content-type': tipo + '; charset=utf-8' } });
    }
    if (u.host !== 'app' || !/^(ui|vendor)[/\\]/.test(rel)) return new Response('não', { status: 404 });
    return net.fetch(pathToFileURL(path.join(__dirname, rel)).toString());
  });
  twitch = new Twitch({
    arquivo: path.join(app.getPath('userData'), 'twitch.json'),
    slots: SLOTS,
    particao: (i) => `persist:conta-${i + 1}`,
    aoMudar: (estado) => ui('tw:estado', estado),
    janela: (opts) => new BrowserWindow({ ...opts, parent: win ?? undefined, autoHideMenuBar: true }),
  });
  jogo = new Jogo({
    dir: path.join(app.getPath('userData'), 'jogo'),
    gameUrl: GAME_URL,
    fetch: (url) => net.fetch(url, { bypassCustomProtocolHandlers: true }),
    aoMudar: (estado) => ui('jogo:estado', estado),
  });
  jogo.iniciar();
  kick = new Kick({
    arquivo: path.join(app.getPath('userData'), 'kick.json'),
    debug: path.join(app.getPath('userData'), 'kick-ultimas-respostas.json'),
    slots: SLOTS,
    particao: (i) => `persist:conta-${i + 1}`,
    aoMudar: (estado) => ui('kk:estado', estado),
    aoAssistir: (i, canais, modo) => playerKick(i, canais, modo),
  });
  for (let i = 0; i < SLOTS; i++) if (store[i].desligada) { twitch.pausar(i, true); kick.pausar(i, true); }
  let repo = process.env.PIE_UPDATE_REPO || '';
  try { repo = repo || require('./package.json').atualizacao?.repo || ''; } catch (_) { /* sem repo */ }
  atualizador = new Atualizador({ repo, aoMudar: (e) => ui('att:estado', e) });
  criarJanela();
  // procura sozinho 20 s depois de abrir e a cada 3 h (só no app instalado, não no `npm start`)
  if (app.isPackaged) { setTimeout(() => atualizador.verificar(), 20000); setInterval(() => atualizador.verificar(), 3 * 3600 * 1000); }
});
app.on('before-quit', () => { salvarTudoJa(); gravarSessoes(); });
app.on('window-all-closed', () => { twitch?.fechar(); kick?.fechar(); app.quit(); });
