// Roda no MAIN world, antes do app.js do jogo. Escuta o WebSocket, mantem o estado e executa as regras.
(() => {
  if (window.__pie) return;
  window.__pie = true;
  const NS = 'PIE';
  const state = { items: {}, ready: false, connected: false };
  let cfg = { enabled: false, rules: [] };
  let sock = null;
  const lastBuy = {};

  const post = (type, payload) => window.postMessage({ ns: NS, type, ...payload }, '*');
  const log = (msg) => post('log', { msg: new Date().toLocaleTimeString() + ' ' + msg });

  // --- captura do WebSocket do jogo ---
  const Native = window.WebSocket;
  window.WebSocket = new Proxy(Native, {
    construct(target, args, newTarget) {
      const ws = Reflect.construct(target, args, newTarget);
      try {
        if (String(ws.url).includes('pokeidle.io')) {
          sock = ws;
          state.connected = true;
          ws.addEventListener('message', onMessage);
          ws.addEventListener('close', () => { if (sock === ws) { state.connected = false; state.ready = false; publish(); } });
        }
      } catch (_) {}
      return ws;
    },
  });

  function onMessage(ev) {
    let m;
    try { m = JSON.parse(ev.data); } catch (_) { return; }
    if (m.t === 'estado' && m.estado) {
      // `estado` chega parcial (deltas). `items` = mapa itemId -> quantidade.
      if (m.estado.items) { Object.assign(state.items, m.estado.items); state.ready = true; }
      publish();
    }
  }

  let pubTimer = null;
  function publish() {
    if (pubTimer) return;
    pubTimer = setTimeout(() => { pubTimer = null; post('state', { state }); }, 500);
  }

  // --- regras: compra automatica ---
  function sendGame(obj) {
    if (!sock || sock.readyState !== 1) return false;
    sock.send(JSON.stringify(obj));
    return true;
  }

  function tick() {
    try {
      if (cfg.enabled && state.ready) {
        const now = Date.now();
        for (const r of cfg.rules || []) {
          if (!r.enabled || !r.itemId) continue;
          const have = state.items[r.itemId] || 0;
          if (have >= r.min) continue;
          if (now - (lastBuy[r.itemId] || 0) < 20000) continue; // cooldown por item
          const qty = Math.max(1, Math.min(r.maxPerBuy || 100, (r.buyTo || r.min) - have));
          if (sendGame({ t: 'shop.buy', kind: 'item', id: Number(r.itemId), qty })) {
            lastBuy[r.itemId] = now;
            log(`comprando ${qty}x item ${r.itemId} (tinha ${have}, minimo ${r.min})`);
          }
        }
      }
    } catch (e) { log('erro: ' + e.message); }
    setTimeout(tick, 3000 + Math.random() * 2500); // intervalo irregular, nao robotico
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.ns !== NS) return;
    if (e.data.type === 'cfg') cfg = e.data.cfg || cfg;
  });

  post('hello', {});
  tick();
})();
