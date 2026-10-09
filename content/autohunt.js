// Troca de hunt automática (content script, mundo isolado).
// Usa o ranking do guia (mesma conta, mesmos dados) para o pokémon
// EM CAMPO. A página só troca com a chave geral E a "Trocar de hunt sozinho" ligadas, e espera
// sair de combate (botão "Ir para o Centro Pokémon" habilitado).
(() => {
  const ESPERA_ENTRE_TROCAS = 60 * 1000; // depois de uma troca, 1 min antes de reavaliar
  let cfg = pieMergeCfg(null);
  let snap = null;
  let catalog = null;
  let medidas = {};
  let chave = '';
  let sim = null;
  let ultimaTroca = 0;
  let pedidoEm = 0;
  let calculando = false;

  async function avaliar() {
    if (!cfg.enabled || !cfg.autoHunt?.enabled) return;
    if (!snap?.ready || !snap.connected || !catalog?.combate) return;
    // Em casa, arena ou místico: nunca mexe. Na cidade COM hunt escolhida: você foi lá de propósito
    // (o "voltar para a hunt" do jogo cuida da volta). Sem hunt nenhuma (conta nova): escolhe a 1ª.
    if (snap.emCasa || snap.arena || snap.mistico) return;
    if (snap.huntSlug && snap.noCentro) return;
    if (Date.now() - ultimaTroca < ESPERA_ENTRE_TROCAS || Date.now() - pedidoEm < 15000) return;
    const pk = (snap.team ?? []).find((p) => p.id === snap.activeId);
    if (!pk || calculando) return;

    const k = [PieHunt.chaveFicha(pk, snap, catalog), snap.level, catalog.at].join('|');
    if (k !== chave) {
      calculando = true;
      try { sim = await PieHunt.simular(pk, catalog, snap.level, snap); chave = k; }
      finally { calculando = false; }
    }
    const res = PieHunt.ajustar(sim, snap, catalog, { medidas, pk });
    const d = PieHunt.decidir(res?.lista, snap.huntSlug, cfg.autoHunt);
    if (!d) return;

    pedidoEm = Date.now();
    self.pieLog?.(`troca automática: ${pk.nome} nv ${pk.level} → ${d.melhor.hunt.nome} (${d.motivo})`);
    window.postMessage({ ns: 'PIE', dir: 'ext', type: 'selectHunt', slug: d.melhor.hunt.slug, origem: 'auto' }, '*');
  }

  window.addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.ns !== 'PIE' || d.dir !== 'page') return;
    if (d.type === 'huntOk' && d.origem === 'automática') { ultimaTroca = Date.now(); pedidoEm = 0; }
    if (d.type === 'huntFalhou' && d.origem === 'automática') { pedidoEm = Date.now(); }
  });

  let ultimaAval = 0;
  function talvez() {
    if (Date.now() - ultimaAval < 5000) return;
    ultimaAval = Date.now();
    avaliar().catch((e) => self.pieLog?.('erro na troca automática: ' + e.message, 'error'));
  }

  chrome.storage.onChanged.addListener((c, area) => {
    if (area !== 'local') return;
    if (c.cfg) cfg = pieMergeCfg(c.cfg.newValue);
    if (c.snapshot) { snap = c.snapshot.newValue; talvez(); } // aba em segundo plano: o resumo chega mesmo com timers atrasados
    if (c.catalog) { catalog = c.catalog.newValue; chave = ''; }
    if (c.medidas) medidas = c.medidas.newValue ?? {};
  });
  chrome.storage.local.get(['cfg', 'catalog', 'medidas']).then((d) => { cfg = pieMergeCfg(d.cfg); catalog = d.catalog ?? null; medidas = d.medidas ?? {}; });
  setInterval(talvez, 1000);
})();
