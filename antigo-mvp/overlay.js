// Overlay no jogo: painel compacto e arrastável, dentro de Shadow DOM.
// Só mostra informação. O único botão que "age" é PARAR, que desliga a automação.
(() => {
  let cfg = pieMergeCfg(null);
  let snap = null;
  let catalog = null;
  let host, root, els;

  const CSS = `
    :host { all: initial; }
    .box { position: fixed; z-index: 2147483000; width: 236px; font: 12px/1.35 system-ui, sans-serif;
      color: #eef2f7; background: rgba(17, 22, 31, 0.92); border: 1px solid rgba(255,255,255,0.14);
      border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,0.35); overflow: hidden; user-select: none; }
    .hd { display: flex; align-items: center; gap: 6px; padding: 6px 8px; cursor: move;
      background: rgba(255,255,255,0.06); }
    .hd b { flex: 1; font-size: 12px; letter-spacing: .2px; }
    .pill { font-size: 10.5px; padding: 1px 6px; border-radius: 999px; background: #39424f; color: #c9d2de; }
    .pill.on { background: #1f7a3d; color: #fff; }
    .pill.off-conn { background: #7a3a1f; color: #fff; }
    button { all: unset; cursor: pointer; padding: 1px 6px; border-radius: 6px; color: #c9d2de; }
    button:hover { background: rgba(255,255,255,0.12); }
    button.stop { background: #b3261e; color: #fff; font-weight: 600; }
    .bd { padding: 6px 8px 8px; }
    .row { display: flex; justify-content: space-between; gap: 8px; }
    .muted { color: #9aa6b5; }
    .sec { margin-top: 6px; }
    .sec h4 { margin: 0 0 2px; font-size: 10.5px; text-transform: uppercase; letter-spacing: .6px; color: #9aa6b5; font-weight: 600; }
    .low { color: #ffb4a8; }
    .collapsed .bd { display: none; }
  `;

  function mount() {
    if (host || !document.body) return;
    host = document.createElement('div');
    host.id = 'pie-overlay-host';
    root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>${CSS}</style>
      <div class="box">
        <div class="hd"><b>PokeIdle</b><span class="pill" data-k="pill">…</span>
          <button class="stop" data-k="stop" title="Desligar toda a automação" hidden>PARAR</button>
          <button data-k="fold" title="Recolher">–</button></div>
        <div class="bd" data-k="body"></div>
      </div>`;
    els = {
      box: root.querySelector('.box'),
      hd: root.querySelector('.hd'),
      pill: root.querySelector('[data-k=pill]'),
      stop: root.querySelector('[data-k=stop]'),
      fold: root.querySelector('[data-k=fold]'),
      body: root.querySelector('[data-k=body]'),
    };
    document.documentElement.appendChild(host);
    els.stop.addEventListener('click', stopAll);
    els.fold.addEventListener('click', () => saveOverlay({ collapsed: !cfg.overlay.collapsed }));
    makeDraggable();
    render();
  }

  async function stopAll() {
    const { cfg: saved } = await chrome.storage.local.get('cfg');
    const c = pieMergeCfg(saved);
    c.enabled = false;
    await chrome.storage.local.set({ cfg: c });
  }

  async function saveOverlay(patch) {
    const { cfg: saved } = await chrome.storage.local.get('cfg');
    const c = pieMergeCfg(saved);
    c.overlay = { ...c.overlay, ...patch };
    await chrome.storage.local.set({ cfg: c });
  }

  function place() {
    const o = cfg.overlay;
    const w = 236;
    const x = o.x == null ? window.innerWidth - w - 16 : Math.min(Math.max(0, o.x), window.innerWidth - 60);
    const y = o.y == null ? 72 : Math.min(Math.max(0, o.y), window.innerHeight - 30);
    els.box.style.left = x + 'px';
    els.box.style.top = y + 'px';
  }

  function makeDraggable() {
    let start = null;
    els.hd.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = els.box.getBoundingClientRect();
      start = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      els.hd.setPointerCapture(e.pointerId);
    });
    els.hd.addEventListener('pointermove', (e) => {
      if (!start) return;
      els.box.style.left = e.clientX - start.dx + 'px';
      els.box.style.top = e.clientY - start.dy + 'px';
    });
    els.hd.addEventListener('pointerup', () => {
      if (!start) return;
      start = null;
      const r = els.box.getBoundingClientRect();
      saveOverlay({ x: Math.round(r.left), y: Math.round(r.top) });
    });
    window.addEventListener('resize', () => els && place());
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function linha(nome, q, porHora, minimo) {
    const dur = PieFmt.duracao(q, porHora);
    const baixo = minimo != null && q < minimo;
    return `<div class="row"><span class="${baixo ? 'low' : ''}">${esc(nome)}</span>
      <span>${PieFmt.curto(q)}${dur ? ` <span class="muted">· ${dur}</span>` : ''}</span></div>`;
  }

  function render() {
    if (!els) return;
    host.style.display = cfg.overlay.visible ? '' : 'none';
    els.box.classList.toggle('collapsed', !!cfg.overlay.collapsed);
    els.fold.textContent = cfg.overlay.collapsed ? '+' : '–';
    place();

    const conectado = snap?.connected && snap?.ready;
    els.pill.className = 'pill' + (cfg.enabled ? ' on' : '') + (!conectado ? ' off-conn' : '');
    els.pill.textContent = !conectado ? 'sem conexão' : cfg.enabled ? 'auto ligada' : 'auto desligada';
    els.stop.hidden = !cfg.enabled;

    if (!snap?.ready) { els.body.innerHTML = '<div class="muted">Aguardando o jogo…</div>'; return; }

    const minimos = {};
    for (const r of cfg.rules) if (r.enabled) minimos[(r.kind === 'ball' ? 'ball:' : 'item:') + r.refId] = r.min;

    const h = PieFmt.hunt(catalog, snap.huntSlug);
    const mapa = snap.noCentro ? 'Centro Pokémon' : h ? `${h.nome}${h.nivel ? ' · nv ' + h.nivel : ''}` : '—';
    const bolas = PieFmt.bolas(snap, catalog).slice(0, 4);
    const cura = PieFmt.cura(snap, catalog).slice(0, 3);

    els.body.innerHTML = `
      <div class="row"><span>Ouro</span><b>${PieFmt.num(snap.gold)}</b></div>
      <div class="row"><span>Mapa</span><span>${esc(mapa)}</span></div>
      <div class="sec"><h4>Pokébolas</h4>${bolas.map((b) => linha(b.nome, b.q, b.porHora, minimos['ball:' + b.id])).join('') || '<div class="muted">nenhuma</div>'}</div>
      <div class="sec"><h4>Cura</h4>${cura.map((c) => linha(c.nome, c.q, c.porHora, minimos['item:' + c.id])).join('') || '<div class="muted">nenhum item</div>'}</div>`;
  }

  async function load() {
    const d = await chrome.storage.local.get(['cfg', 'snapshot', 'catalog']);
    cfg = pieMergeCfg(d.cfg);
    snap = d.snapshot ?? null;
    catalog = d.catalog ?? null;
    render();
  }

  chrome.storage.onChanged.addListener((c, area) => {
    if (area !== 'local') return;
    if (c.cfg) cfg = pieMergeCfg(c.cfg.newValue);
    if (c.snapshot) snap = c.snapshot.newValue;
    if (c.catalog) catalog = c.catalog.newValue;
    if (c.cfg || c.snapshot || c.catalog) render();
  });

  // Limpa o resumo da sessão anterior ao abrir o jogo, para não mostrar dado velho.
  chrome.storage.local.set({ snapshot: { at: Date.now(), connected: false, ready: false } });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { mount(); load(); });
  else { mount(); load(); }
})();
