// Preload de cada quadrado do jogo. Faz o papel da extensão dentro do app:
//  1) põe o código "MAIN world" (proto.js + inject.js) na página, antes do jogo carregar;
//  2) roda os content scripts (bridge, hunts, autohunt) aqui, no mundo isolado do preload;
//  3) troca o chrome.storage da extensão por um armazenamento por conta, guardado pelo app.
const { ipcRenderer, webFrame } = require('electron');

// --- 1) código da página (captura do WebSocket, compras, troca de hunt)
const __PIE_MAIN = /*__MAIN_WORLD__*/;
try { webFrame.executeJavaScript(__PIE_MAIN); } catch (e) { console.error('[PIE] falha ao injetar', e); }

// --- 3) chrome.storage / chrome.runtime falsos, ligados ao processo principal
const __pieStore = ipcRenderer.sendSync('jogo:store-all') || {};
const __pieOuvintes = [];
const __pieMsg = [];
function __pieAvisar(mudancas) {
  if (!Object.keys(mudancas).length) return;
  for (const f of __pieOuvintes) { try { f(mudancas, 'local'); } catch (e) { console.error(e); } }
}
function __piePegar(chaves) {
  if (chaves == null) return { ...__pieStore };
  const lista = typeof chaves === 'string' ? [chaves] : Array.isArray(chaves) ? chaves : Object.keys(chaves);
  const out = {};
  for (const k of lista) if (k in __pieStore) out[k] = __pieStore[k];
  if (chaves && typeof chaves === 'object' && !Array.isArray(chaves)) for (const k of lista) if (!(k in out)) out[k] = chaves[k];
  return out;
}
const chrome = {
  storage: {
    local: {
      get: (chaves) => Promise.resolve(JSON.parse(JSON.stringify(__piePegar(chaves)))),
      set: (itens) => {
        const mud = {};
        for (const [k, v] of Object.entries(itens)) { mud[k] = { oldValue: __pieStore[k], newValue: v }; __pieStore[k] = v; }
        ipcRenderer.send('jogo:store-set', itens);
        __pieAvisar(mud);
        return Promise.resolve();
      },
    },
    onChanged: { addListener: (f) => __pieOuvintes.push(f) },
  },
  runtime: {
    getURL: (p) => 'pie-data:' + p,
    onMessage: { addListener: (f) => __pieMsg.push(f) },
    getManifest: () => ({ version: 'app' }),
  },
};
// mudanças feitas pela interface do app (ex.: você mexeu na config desta conta)
ipcRenderer.on('jogo:store-changed', (_e, itens) => {
  const mud = {};
  for (const [k, v] of Object.entries(itens)) { mud[k] = { oldValue: __pieStore[k], newValue: v }; __pieStore[k] = v; }
  __pieAvisar(mud);
});
ipcRenderer.on('jogo:runtime-msg', (_e, msg) => { for (const f of __pieMsg) { try { f(msg); } catch (e) { console.error(e); } } });

// dados do guia: vêm do app (não dependem da CSP do jogo)
const fetch = (url, ...rest) => {
  if (typeof url === 'string' && url.startsWith('pie-data:')) {
    return ipcRenderer.invoke('jogo:data', url.slice(9)).then((j) => ({ ok: true, json: async () => j }));
  }
  return window.fetch(url, ...rest);
};

// --- modos do app (Normal / Eco / Ultra eco): liga ou desliga o Modo Economia do próprio jogo
// clicando nos mesmos botões que o jogador clicaria: o atalho da bateria (#hunt-eco) para ligar e o
// "Ligar a cena" do painel de Economia (#eco-sair) para desligar. Tenta por até ~30 s (o jogo
// pode estar carregando); depois disso você pode mudar à mão naquela conta que o app não insiste.
let __pieEcoAlvo = null, __pieEcoTimer = null;
function __pieEcoAplicar() {
  clearTimeout(__pieEcoTimer);
  if (__pieEcoAlvo == null) return;
  let tentativas = 0;
  const passo = () => {
    const ligado = document.documentElement.classList.contains('modo-economia');
    if (ligado === __pieEcoAlvo) return;
    const b = document.getElementById(__pieEcoAlvo ? 'hunt-eco' : 'eco-sair');
    if (b) b.click();
    if (++tentativas < 15) __pieEcoTimer = setTimeout(passo, 2000);
  };
  passo();
}
ipcRenderer.on('jogo:eco', (_e, ligar) => {
  __pieEcoAlvo = !!ligar;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', __pieEcoAplicar, { once: true });
  else __pieEcoAplicar();
});

// --- 2) content scripts da extensão (mesma ordem do manifest)
