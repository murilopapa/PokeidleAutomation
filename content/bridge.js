// Content script (mundo isolado): ponte entre a página e o chrome.storage.
(() => {
  const NS = 'PIE';
  const toPage = (type, payload = {}) => window.postMessage({ ns: NS, dir: 'ext', type, ...payload }, '*');

  async function getCfg() {
    const { cfg } = await chrome.storage.local.get('cfg');
    return pieMergeCfg(cfg);
  }
  async function pushCfg() { toPage('cfg', { cfg: await getCfg() }); }

  // Logs em lote para não escrever no storage a cada linha.
  let logBuf = [];
  let logTimer = null;
  function queueLog(entry) {
    logBuf.push(entry);
    if (logTimer) return;
    logTimer = setTimeout(async () => {
      logTimer = null;
      const { log = [] } = await chrome.storage.local.get('log');
      const novo = log.concat(logBuf).slice(-200);
      logBuf = [];
      await chrome.storage.local.set({ log: novo });
    }, 500);
  }

  self.pieLog = (msg, level = 'info') => queueLog({ at: Date.now(), level, msg });

  // Medidas reais: abates/h de cada pokémon em cada hunt onde você caçou pelo menos 5 min.
  // O Onde caçar usa a medida no lugar da estimativa (é o que torna a lista igual ao jogo).
  let ultimaMedida = 0;
  async function guardarMedida(m) {
    if (!m?.kph || !m.slug || !m.pokemonId || (m.minutos ?? 0) < 5) return;
    if (Date.now() - ultimaMedida < 30000) return;
    ultimaMedida = Date.now();
    const { medidas = {} } = await chrome.storage.local.get('medidas');
    medidas[m.slug + "|" + m.pokemonId] = { kph: m.kph, real: !!m.kphReal, xpKill: m.xpKill || null, nivel: m.nivelPokemon, minutos: m.minutos, em: Date.now() };
    const chaves = Object.keys(medidas);
    if (chaves.length > 400) chaves.sort((a, b) => medidas[a].em - medidas[b].em).slice(0, chaves.length - 400).forEach((k) => delete medidas[k]);
    await chrome.storage.local.set({ medidas });
  }

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.ns !== NS || d.dir !== 'page') return;
    if (d.type === 'hello') pushCfg();
    else if (d.type === 'state') { chrome.storage.local.set({ snapshot: d.state }); guardarMedida(d.state?.xpMedido); }
    else if (d.type === 'catalog') chrome.storage.local.set({ catalog: d.catalog });
    else if (d.type === 'geo') chrome.storage.local.set({ geo: d.geo });
    else if (d.type === 'sniper') chrome.storage.local.set({ sniper: d.sniper });
    else if (d.type === 'log') queueLog(d.entry);
  });

  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'local' && c.cfg) pushCfg();
  });

  // O painel lateral pode pedir o estado de novo (ex.: aberto depois do jogo).
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'pie-resend') toPage('resend');
    if (msg && msg.type === 'pie-hunt' && typeof msg.slug === 'string') toPage('selectHunt', { slug: msg.slug });
    // troca automática decidida fora da página (app): a página só obedece com as chaves ligadas
    if (msg && msg.type === 'pie-hunt-auto' && typeof msg.slug === 'string') toPage('selectHunt', { slug: msg.slug, origem: 'auto' });
    if (msg && msg.type === 'pie-sniper-reset') toPage('sniperReset', { moeda: msg.moeda === 'gold' ? 'gold' : 'orb' });
  });

  // Zera o resumo da sessão anterior ao abrir o jogo, para o painel não mostrar dado velho.
  chrome.storage.local.set({ snapshot: { at: Date.now(), connected: false, ready: false } });
  pushCfg();
})();
