// Roda no MAIN world, antes do app.js do jogo.
// 1) captura o WebSocket do jogo e remonta o estado completo (mesmo mesclador do jogo)
// 2) publica um resumo para a extensão (painel lateral e overlay)
// 3) executa as regras de automação, que só agem se a chave geral E a regra estiverem ligadas
(() => {
  if (window.__pie) return;
  window.__pie = true;

  const P = window.__PIE_PROTO;
  const NS = 'PIE';
  const post = (type, payload = {}) => window.postMessage({ ns: NS, dir: 'page', type, ...payload }, '*');
  const log = (msg, level = 'info') => post('log', { entry: { at: Date.now(), level, msg } });

  // ------------------------------------------------------------ remontagem do estado
  // Cópia do algoritmo de /shared/estado-delta.mjs, usada só se o import do módulo oficial falhar.
  function mescladorLocal() {
    let campos = null;
    let pokemons = new Map();
    const montar = () => ({ ...campos, pokemons: [...pokemons.values()] });
    return function mesclar(parcial) {
      if (!parcial) return campos ? montar() : null;
      const { cheio, pokemons: lista, pkMud, pkFora, dexMud, dexFora, ...resto } = parcial;
      if (cheio || !campos) {
        campos = resto;
        pokemons = new Map((lista ?? []).map((k) => [k.id, k]));
        return montar();
      }
      Object.assign(campos, resto);
      if (lista) pokemons = new Map(lista.map((k) => [k.id, k]));
      for (const k of pkMud ?? []) pokemons.set(k.id, k);
      for (const id of pkFora ?? []) pokemons.delete(id);
      if (dexMud || dexFora) {
        campos.pokedex = { ...(campos.pokedex ?? {}), ...(dexMud ?? {}) };
        for (const c of dexFora ?? []) delete campos.pokedex[c];
      }
      return montar();
    };
  }
  const criarMesclador = mescladorLocal;

  // Confere se o jogo mudou o módulo de remontagem (se mudou, a cópia acima pode estar velha).
  function conferirMesclador() {
    fetch(P.deltaModule)
      .then((r) => r.text())
      .then((txt) => {
        let h = 5381;
        for (let i = 0; i < txt.length; i++) h = ((h * 33) ^ txt.charCodeAt(i)) >>> 0;
        if (h.toString(16) !== P.deltaModuleHash) log('o jogo atualizou o módulo de estado; avise para conferir a extensão', 'warn');
      })
      .catch(() => {});
  }

  const S = {
    sock: null,
    connected: false,
    mesclar: null,
    eu: null,
    catalog: null,
    items: null,
  };

  // ------------------------------------------------------------ captura do WebSocket
  const Native = window.WebSocket;
  window.WebSocket = new Proxy(Native, {
    construct(target, args, newTarget) {
      const ws = Reflect.construct(target, args, newTarget);
      try {
        const url = new URL(String(args[0]), location.href);
        if (url.host === location.host) attach(ws);
      } catch (_) { /* nunca quebrar o jogo */ }
      return ws;
    },
  });

  function attach(ws) {
    S.sock = ws;
    ws.addEventListener('open', () => { if (S.sock === ws) { S.connected = true; publish(); } });
    ws.addEventListener('close', () => { if (S.sock === ws) { S.connected = false; publish(); } });
    ws.addEventListener('message', (ev) => {
      if (S.sock !== ws || typeof ev.data !== 'string') return;
      let m;
      try { m = JSON.parse(ev.data); } catch (_) { return; }
      try { onMessage(m); } catch (e) { log('erro lendo mensagem: ' + e.message, 'error'); }
    });
  }

  function onMessage(m) {
    if (m.t === P.in.welcome) {
      S.mesclar = criarMesclador();
      S.eu = S.mesclar(m.estado);
      // Itens próprios do jogo (Golden Potion e cia.) só vêm no welcome, não no items.json; e o
      // preço que a loja cobra de verdade também vem daqui (itensCompraveis).
      S.nossos = Array.isArray(m.itensNossos) ? m.itensNossos : [];
      S.precoLoja = new Map((m.itensCompraveis ?? []).map((x) => [Number(x.itemId), Number(x.preco) || 0]));
      montarItens();
      S.catalog = {
        at: Date.now(),
        hunts: m.hunts ?? [],
        // Bolas à venda na loja do NPC: as marcadas `compravel` (mesmo filtro da tela de compra).
        bolas: (m.catalogoBolas ?? []).map((b) => ({ id: b.id, nome: b.nome, priceGold: Number(b.priceGold) || 0, compravel: !!b.compravel, catchRate: b.catchRate ?? null })),
        compraveis: lojaDeItens(),
        captura: m.captura ?? null,
        chanceShiny: Number(m.chanceShiny) || 0,
        // Constantes de combate (mesmas que a Pokepédia do jogo usa).
        combate: {
          tabelaTipos: m.tabelaTipos ?? {},
          ampliacaoHunt: m.ampliacaoHunt ?? 1.5,
          multHpSelvagem: m.multHpSelvagem ?? 5,
          multDanoSelvagem: m.multDanoSelvagem ?? 1.8,
        },
        tiposBoost: m.tiposBoost ?? [],
        // Mercado da Comunidade: itens negociáveis (id, nome, categoria) e a retenção de anúncio novo.
        mercado: {
          catalogo: (m.mercado?.catalogo ?? []).map((i) => ({ id: i.id, nome: i.nome, categoria: i.categoria ?? null })),
          cooldownCompraMs: Number(m.mercado?.cooldownCompraMs) || null,
        },
        // itens próprios do jogo (nome e preço de NPC): entram no preço do loot, como na extensão oficial
        itensNossos: (m.itensNossos ?? []).map((i) => ({ id: i.id, name: i.name, npcPrice: i.npcPrice ?? null })),
        items: S.items,
      };
      resetUsage();
      geoWelcome(m);
      conferirMesclador();
      post('catalog', { catalog: S.catalog });
      trackUsage();
      publish(true);
    } else if (m.t === P.in.estado && S.mesclar) {
      S.eu = S.mesclar(m.estado);
      trackUsage();
      publish();
    } else if (m.t === P.in.campoInit) {
      geoCampoInit(m);
    } else if (m.t === P.in.campo) {
      geoCampo(m);
    } else if (m.t === P.in.mercado) {
      sniperMercado(m);
    } else if (m.t === P.in.erro) {
      sniperErro(m);
    } else if (m.t === P.in.batalha && Array.isArray(m.ev)) {
      for (const ev of m.ev) {
        if (ev.k === 'marketComprado' || ev.k === 'marketCompradoLote') sniperComprou(ev);
        if (ev.k === 'ataque') S.ultimoCombate = Date.now();
        if (ev.k === 'morte' && ev.quem === 'selvagem') registrarAbate(ev);
        if (ev.k === 'hunt' && ev.trocaLivreEm) S.trocaLivreEm = Number(ev.trocaLivreEm) || 0;
      }
    }
    if (m.estado?.servidorAgora) S.desvio = Date.now() - m.estado.servidorAgora;
    if (document.hidden) { processarTroca(); talvezAvaliar(); }
  }


  // ------------------------------------------------------------ geometria das hunts (igual à extensão oficial)
  // No instante em que uma ONDA CHEIA nasce (≥ 80% dos pontos de spawn da hunt juntos), guarda a
  // distância (tiles) do seu pokémon até cada selvagem novo: é a "fila de chegada" que o motor usa.
  // E o ritmo real (abates/h por pokémon, só referência). Mesma chave de armazenamento da oficial.
  const GEO_CHAVE = 'pokeidle-hunt:geo:v3';
  const GEO_MAX_AMOSTRAS = 6, GEO_JANELA_MS = 4000, GEO_FRACAO_CHEIA = 0.8, GEO_MIN_ONDA = 6, GEO_MAX_SPAWNS = 16;
  let geoBanco = (() => { try { return JSON.parse(localStorage.getItem(GEO_CHAVE)) || { hunts: {} }; } catch (_) { return { hunts: {} }; } })();
  if (!geoBanco.hunts) geoBanco = { hunts: {} };
  let geoTimer = null;
  function geoGravar() {
    clearTimeout(geoTimer);
    geoTimer = setTimeout(() => {
      try { localStorage.setItem(GEO_CHAVE, JSON.stringify(geoBanco)); } catch (_) { /* cota cheia */ }
      post('geo', { geo: geoBanco });
    }, 2000);
  }
  const geoPontos = new Map();
  function geoWelcome(m) {
    for (const h of m?.hunts ?? []) {
      const total = (h.especies ?? []).reduce((a, x) => a + (Number(x.pontos) || 0), 0);
      if (h.slug && total) geoPontos.set(h.slug, Math.min(GEO_MAX_SPAWNS, Math.round(total)));
    }
    post('geo', { geo: geoBanco });
  }
  const geoOndaCheia = (slug) => Math.max(GEO_MIN_ONDA, Math.ceil(GEO_FRACAO_CHEIA * (geoPontos.get(slug) ?? 15)));
  const geoNaoSelvagem = (x) => x.bn || x.ti !== undefined || x.cura || x.tm || x.depot || x.tr;
  const geoChavePk = (pk) => {
    if (!pk?.id) return null;
    const aoe = pk.tmAoe ?? pk.tm_aoe;
    return `${pk.id}${aoe === true || aoe === 'true' || aoe === 1 ? ':aoe' : ''}`;
  };
  let geoSessao = null;
  let geoPkAtivo = null;
  function geoFecharSessao() {
    const s = geoSessao;
    if (!s) return;
    clearTimeout(s.onda?.timer);
    const seg = (Date.now() - s.inicio) / 1000;
    if (seg >= 60 && s.abates > 0) {
      const h = (geoBanco.hunts[s.slug] ??= {});
      const r = ((h.ritmo ??= {})[s.pkId ?? '?'] ??= { abates: 0, seg: 0 });
      r.abates += s.abates; r.seg += seg;
      geoGravar();
    }
    geoSessao = null;
  }
  function geoFecharOnda(s) {
    const onda = s.onda;
    s.onda = null;
    if (!onda || onda.dists.length < geoOndaCheia(s.slug)) return;
    const h = (geoBanco.hunts[s.slug] ??= {});
    h.amostras = [...(h.amostras ?? []), onda.dists.sort((a, b) => a - b)].slice(-GEO_MAX_AMOSTRAS);
    h.medidoEm = Date.now();
    geoGravar();
  }
  function geoNasceu(s, x) {
    if (!s.heroi || x.c == null || x.r == null) return;
    if (!s.onda) {
      const onda = { dists: [] };
      onda.timer = setTimeout(() => { if (s.onda === onda) geoFecharOnda(s); }, GEO_JANELA_MS);
      s.onda = onda;
    }
    s.onda.dists.push(Math.round(Math.hypot(x.c - s.heroi.c, x.r - s.heroi.r) * 10) / 10);
  }
  function geoConferirPk() {
    const chave = geoChavePk((S.eu?.pokemons ?? []).find((p) => p.id === S.eu?.activeId));
    if (chave !== geoPkAtivo) { geoFecharSessao(); geoPkAtivo = chave; }
  }
  function geoCampoInit(m) {
    geoConferirPk();
    geoFecharSessao();
    if (!m?.slug || m.centro || m.pvp || m.casa != null) return;
    geoSessao = { slug: m.slug, pkId: geoPkAtivo, inicio: Date.now(), abates: 0, slots: new Map(), heroi: null, onda: null };
    if (m.heroi?.c != null) geoSessao.heroi = { c: m.heroi.c, r: m.heroi.r };
    for (const x of m.mobs ?? []) if (!geoNaoSelvagem(x)) geoSessao.slots.set(x.s, !x.x);
  }
  function geoCampo(m) {
    geoConferirPk();
    const s = geoSessao;
    if (!s) return;
    if (m.heroi?.c != null) s.heroi = { c: m.heroi.c, r: m.heroi.r };
    for (const x of m.mobs ?? []) {
      if (geoNaoSelvagem(x)) continue;
      const conhecido = s.slots.has(x.s);
      const vivoAntes = s.slots.get(x.s);
      if (x.x) {
        if (vivoAntes) s.abates++;
        s.slots.set(x.s, false);
      } else if (!conhecido || (vivoAntes === false && x.x === false)) {
        s.slots.set(x.s, true);
        geoNasceu(s, x);
      }
    }
    for (const slot of m.fora ?? []) s.slots.delete(slot);
  }
  addEventListener('pagehide', geoFecharSessao);


  // ------------------------------------------------------------ sniper do Mercado (itens)
  // Lê o resumo da vitrine de itens (menor preço de cada item + média vendida em 7 dias, numa
  // mensagem só) a cada ~30 s. Item da categoria escolhida com anúncio X% abaixo da média abre a
  // lista daquele item e, para cada anúncio barato, entra no sorteio da liberação: o jogo segura
  // todo anúncio novo por alguns minutos (retenção) e, quando libera, sorteia entre quem pediu nos
  // primeiros 3 s. O pedido sai DEPOIS da liberação, pelo relógio do servidor — nunca antes (isso
  // seria furar a trava, e os Termos proíbem). Em "simular" só anota o que teria comprado.
  const SN = {
    proxVarredura: 0,
    pedidosItem: new Map(),   // `${itemId}:${moeda}` -> último pedido (ms)
    filaItem: [],             // [{ itemId, moeda, limite, ref }]
    ultimoPedidoItem: 0,
    vistos: new Map(),        // anúncio id -> quando foi tratado
    agendados: new Map(),     // anúncio id -> timer
    pendentes: [],            // compras enviadas esperando o resultado
    log: [],
    status: { varreduras: 0, ultimaVarredura: 0, candidatos: 0 },
  };
  const SN_CHAVE_GASTOS = 'pie-sniper-gastos';
  let snGastos = (() => { try { return JSON.parse(localStorage.getItem(SN_CHAVE_GASTOS)) || []; } catch (_) { return []; } })();
  const snCfg = () => cfg?.sniper ?? {};
  const snLigado = () => !!snCfg().enabled;
  const snCompra = () => snLigado() && snCfg().modo === 'comprar' && !!cfg.enabled;
  const agoraSrv = () => Date.now() - (S.desvio || 0);
  const nomeItemSn = (id) => S.catalog?.mercado?.catalogo?.find((i) => i.id === id)?.nome || S.items?.[id]?.name || `item ${id}`;
  const fmtN = (n) => Math.round(n).toLocaleString('pt-BR');
  const moedaTxt = (m) => (m === 'orb' ? 'Gemas' : 'Coins');

  function snLog(tipo, texto, extra = {}) {
    SN.log.push({ t: Date.now(), tipo, texto, ...extra });
    if (SN.log.length > 60) SN.log.splice(0, SN.log.length - 60);
    snPublicar();
  }
  let snPubTimer = null;
  function snPublicar() {
    if (snPubTimer) return;
    snPubTimer = setTimeout(() => {
      snPubTimer = null;
      post('sniper', { sniper: { at: Date.now(), ...SN.status, gasto: snGastoDia(), agendados: SN.agendados.size, log: SN.log.slice(-40) } });
    }, 500);
  }
  function snGastoDia() {
    const desde = Date.now() - 24 * 3600 * 1000;
    snGastos = snGastos.filter((g) => g.t >= desde);
    const out = { gold: 0, orb: 0 };
    for (const g of snGastos) out[g.moeda] = (out[g.moeda] || 0) + g.valor;
    return out;
  }
  function snGravarGastos() { try { localStorage.setItem(SN_CHAVE_GASTOS, JSON.stringify(snGastos)); } catch (_) { /* ok */ } }

  /** Quantas unidades ainda cabem (teto do dia, reserva de Coins e saldo). */
  function snCabe(moeda, preco, qtd) {
    const c = snCfg();
    const m = c.moedas?.[moeda];
    if (!m?.on || !(preco > 0)) return 0;
    const teto = Number(m.tetoDia) || 0;
    if (teto <= 0) return 0;
    const usado = snGastoDia()[moeda] || 0;
    const saldo = moeda === 'orb' ? Number(S.eu?.orbs) || 0 : (Number(S.eu?.gold) || 0) - (Number(c.reservaGold) || 0);
    const pode = Math.min(teto - usado, saldo);
    return Math.max(0, Math.min(qtd, Math.floor(pode / preco)));
  }

  function snItemValido(id) {
    const c = snCfg();
    const it = S.catalog?.mercado?.catalogo?.find((x) => x.id === id);
    if (!it) return false;
    if (Array.isArray(c.itens) && c.itens.length) return c.itens.includes(id);
    return (c.categorias ?? []).includes(it.categoria);
  }

  let snModoAntes = null;
  function sniperCfgMudou() {
    // Trocou de modo: o que só foi anotado em "simular" pode ser comprado agora (e varre já).
    const modo = snLigado() ? snCfg().modo : null;
    if (modo !== snModoAntes) {
      for (const [id, v] of SN.vistos) if (v.modo !== 'comprar') SN.vistos.delete(id);
      SN.pedidosItem.clear();
      if (modo) SN.proxVarredura = Date.now() + 1500;
      snModoAntes = modo;
    }
    if (!snLigado()) {
      for (const t of SN.agendados.values()) clearTimeout(t);
      if (SN.agendados.size) snLog('info', 'sniper desligado: compras agendadas canceladas');
      SN.agendados.clear();
      SN.filaItem = [];
    } else if (!SN.status.ultimaVarredura) SN.proxVarredura = Date.now() + 2000;
    snPublicar();
  }

  function sniperTick() {
    const agora = Date.now();
    if (snLigado() && S.connected && S.catalog) {
      if (agora >= SN.proxVarredura) {
        SN.proxVarredura = agora + 25000 + Math.random() * 10000; // ~30 s, irregular
        if (sendGame(P.out.mercadoItens())) { SN.status.varreduras++; SN.status.ultimaVarredura = agora; }
      }
      // no máximo um pedido de lista de item a cada ~1,5 s
      if (SN.filaItem.length && agora - SN.ultimoPedidoItem > 1500) {
        const x = SN.filaItem.shift();
        SN.ultimoPedidoItem = agora;
        SN.pedidosItem.set(`${x.itemId}:${x.moeda}`, agora);
        SN.limites.set(`${x.itemId}:${x.moeda}`, x);
        sendGame(P.out.mercadoItem(x.itemId, x.moeda));
      }
    }
    // resultados que nunca chegaram
    SN.pendentes = SN.pendentes.filter((p) => {
      if (agora - p.t < 30000) return true;
      snLiberar(p);
      snLog('erro', `${p.nome}: sem resposta do jogo, considerado não comprado`);
      return false;
    });
    setTimeout(sniperTick, 500);
  }
  SN.limites = new Map();

  function sniperMercado(m) {
    if (!snLigado()) return;
    if (m.aba === 'itens' && m.resumo) {
      const c = snCfg();
      const desconto = Math.min(90, Math.max(1, Number(c.desconto) || 30)) / 100;
      const minVendas = Math.max(1, Number(c.minVendas) || 5);
      let cand = 0;
      for (const [k, r] of Object.entries(m.resumo)) {
        const id = Number(k);
        if (!r?.anuncios || !snItemValido(id)) continue;
        for (const moeda of ['gold', 'orb']) {
          if (!c.moedas?.[moeda]?.on) continue;
          const menor = moeda === 'orb' ? r.minOrb : r.minGold;
          const ref = m.medias?.[id]?.[moeda];
          if (menor == null || !ref?.media || (ref.unidades ?? 0) < minVendas) continue;
          const limite = Math.floor(ref.media * (1 - desconto));
          if (menor > limite) continue;
          cand++;
          const chave = `${id}:${moeda}`;
          if (Date.now() - (SN.pedidosItem.get(chave) || 0) < 20000) continue;
          if (!SN.filaItem.some((x) => x.itemId === id && x.moeda === moeda)) SN.filaItem.push({ itemId: id, moeda, limite, ref: ref.media });
        }
      }
      SN.status.candidatos = cand;
      snPublicar();
      return;
    }
    if (m.aba === 'item' && Array.isArray(m.linhas)) {
      const x = SN.limites.get(`${m.itemId}:${m.moeda}`);
      if (!x) return;
      const nome = nomeItemSn(m.itemId);
      for (const a of m.linhas) {
        if (!a?.id || !(a.preco <= x.limite) || SN.vistos.has(a.id)) continue;
        if (a.vendedor && S.eu?.nick && a.vendedor === S.eu.nick) continue;
        SN.vistos.set(a.id, { t: Date.now(), modo: snCompra() ? 'comprar' : 'simular' });
        const pct = Math.round((1 - a.preco / x.ref) * 100);
        const base = { id: a.id, itemId: m.itemId, nome, moeda: a.moeda || m.moeda, preco: a.preco, qtdAnuncio: a.qtd, vendedor: a.vendedor, ref: Math.round(x.ref), pct };
        const libera = Number(a.compravelEm) || 0;
        const quando = libera > agoraSrv() ? `libera em ${Math.ceil((libera - agoraSrv()) / 1000)} s` : 'já liberado';
        const resumo = `${nome} ×${a.qtd} por ${fmtN(a.preco)} ${moedaTxt(base.moeda)}/un. (média ${fmtN(x.ref)}, ${pct}% abaixo) · ${quando}`;
        if (!snCompra()) { snLog('simulado', `teria comprado: ${resumo}`, base); continue; }
        const qtd = snCabe(base.moeda, a.preco, a.qtd);
        if (qtd < 1) { snLog('pulado', `sem teto/saldo para: ${resumo}`, base); continue; }
        // Pelo relógio do servidor: só depois de liberar, com 0,4–1,2 s de folga (dentro da janela de 3 s).
        const espera = Math.max(0, libera - agoraSrv()) + (libera ? 400 + Math.random() * 800 : 300 + Math.random() * 700);
        snLog('agendado', `vai tentar: ${resumo}`, base);
        SN.agendados.set(a.id, setTimeout(() => snDisparar({ ...base, qtd, tentativa: 1 }), espera));
      }
      for (const [id, v] of SN.vistos) if (Date.now() - v.t > 6 * 3600 * 1000) SN.vistos.delete(id);
      snPublicar();
    }
  }

  function snDisparar(c) {
    SN.agendados.delete(c.id);
    if (!snCompra()) { snLog('info', `${c.nome}: cancelado (sniper ou automação desligados)`); return; }
    const qtd = snCabe(c.moeda, c.preco, c.qtd);
    if (qtd < 1) { snLog('pulado', `${c.nome}: estourou o teto do dia ou o saldo`); return; }
    if (!sendGame(P.out.mercadoComprar(c.id, qtd, c.preco, c.moeda))) { snLog('erro', `${c.nome}: jogo desconectado`); return; }
    const p = { ...c, qtd, t: Date.now(), valor: qtd * c.preco };
    snGastos.push({ t: Date.now(), moeda: c.moeda, valor: p.valor, id: c.id }); // reserva; devolve se perder
    snGravarGastos();
    SN.pendentes.push(p);
    snLog('enviado', `pedido enviado: ${c.nome} ×${qtd} por ${fmtN(c.preco)} ${moedaTxt(c.moeda)}/un.`, c);
  }
  function snLiberar(p) {
    const i = snGastos.findIndex((g) => g.id === p.id && g.valor === p.valor);
    if (i >= 0) { snGastos.splice(i, 1); snGravarGastos(); }
  }

  function sniperErro(m) {
    const ch = String(m.chave || '');
    if (!ch.startsWith('market.') || !SN.pendentes.length) return;
    const p = SN.pendentes[0];
    if (ch === 'market.sorteio' || ch === 'market.sorteioEspera') { snLog('sorteio', `${p.nome}: entrou no sorteio da liberação`); return; }
    SN.pendentes.shift();
    snLiberar(p);
    if (ch === 'market.retencao' && p.tentativa < 2) {
      // relógio um pouco adiantado: tenta uma vez mais, 1,2 s depois (ainda dentro da janela)
      snLog('info', `${p.nome}: ainda em retenção, tentando de novo`);
      SN.agendados.set(p.id, setTimeout(() => snDisparar({ ...p, tentativa: 2 }), 1200));
      return;
    }
    snLog(ch === 'market.sorteioPerdeu' ? 'perdeu' : 'erro', `${p.nome}: ${ch === 'market.sorteioPerdeu' ? 'outro jogador levou no sorteio' : (m.msg || ch)}`);
  }

  function sniperComprou(ev) {
    if (!SN.pendentes.length) return;
    const p = SN.pendentes.shift();
    snLog('comprou', `COMPROU: ${ev.descricao || p.nome} por ${fmtN(p.valor)} ${moedaTxt(p.moeda)} (média ${fmtN(p.ref)}, ${p.pct}% abaixo)`, p);
  }
  setTimeout(sniperTick, 3000);

  // ------------------------------------------------------------ trava de combate (troca de hunt)
  // O jogo só deixa trocar de área com 3 s sem trocar dano — é quando o botão "Ir para o Centro
  // Pokémon" habilita. Usa o próprio botão quando ele está na tela; senão, os mesmos carimbos do
  // servidor que o jogo usa (centroLivreEm) + o último golpe visto + a porta de 10 s da troca.
  function livreParaTrocar() {
    const e = S.eu;
    if (!e || e.casa?.dentro || e.boss?.arena || e.mistico) return { ok: false, motivo: 'fora de hunt' };
    const agoraSrv = Date.now() - (S.desvio || 0);
    if (agoraSrv < (S.trocaLivreEm || 0)) return { ok: false, motivo: 'porta de troca' };
    // Sem hunt ou na cidade não há combate: pode escolher área (como clicar no mapa).
    if (!e.huntSlug || e.noCentro) return { ok: true };
    const btn = document.getElementById('ir-centro');
    const saida = document.getElementById('hunt-saida');
    // Botão do jogo na tela e travado = em combate. Além dele, exige 3 s sem nenhum golpe visto
    // (com a aba em segundo plano o botão pode demorar a atualizar).
    if (!document.hidden && btn && saida && !saida.classList.contains('hidden') && btn.disabled) return { ok: false, motivo: 'em combate' };
    if (agoraSrv < (Number(e.centroLivreEm) || 0) || Date.now() - (S.ultimoCombate || 0) < 3000) return { ok: false, motivo: 'em combate' };
    return { ok: true };
  }

  // Pedido de troca (do botão "Ir" ou da troca automática): espera ficar livre por até 90 s.
  let trocaPendente = null; // { slug, origem, ate }
  // Fica tentando: assim que sai de combate manda; se o jogo não trocar, tenta de novo 5 s depois.
  // Desiste só se o pedido ficar 10 min sem dar certo, se você trocar de hunt por conta própria
  // ou (no caso da automática) se a chave for desligada.
  function pedirTroca(slug, origem) {
    if (S.eu?.huntSlug === slug) return;
    if (trocaPendente?.slug === slug) return;
    trocaPendente = { slug, origem, desde: Date.now(), enviadoEm: 0, proxima: 0, tentativas: 0, deOnde: S.eu?.huntSlug };
    log(`troca para ${slug} pedida (${origem}); esperando sair de combate`);
  }
  function processarTroca() {
    const t = trocaPendente;
    if (!t) return;
    const agora = Date.now();
    if (S.eu?.huntSlug === t.slug) {
      log(`agora caçando em ${t.slug}${t.tentativas > 1 ? ` (${t.tentativas} tentativas)` : ''}`);
      post('huntOk', { slug: t.slug, origem: t.origem }); trocaPendente = null; return;
    }
    if (t.origem === 'automática' && !(cfg.enabled && cfg.autoHunt?.enabled)) { trocaPendente = null; return; }
    if (S.eu?.huntSlug && S.eu.huntSlug !== t.deOnde) { log(`troca para ${t.slug} cancelada: você mudou de hunt`); trocaPendente = null; return; }
    if (agora - t.desde > 10 * 60 * 1000) { log(`desisti de trocar para ${t.slug} depois de 10 min`, 'warn'); post('huntFalhou', { slug: t.slug, origem: t.origem }); trocaPendente = null; return; }
    if (t.enviadoEm && agora - t.enviadoEm < 5000) return; // espera a resposta do jogo
    if (agora < t.proxima) return;
    if (!livreParaTrocar().ok) return;
    if (sendGame(P.out.selectHunt(t.slug))) { t.enviadoEm = agora; t.proxima = agora + 5000; t.tentativas++; }
  }
  setInterval(processarTroca, 250);

  // A loja de itens do NPC: cura e revive (mesmo filtro da tela de compra do jogo: npcPrice > 0),
  // com o preço que o SERVIDOR cobra (itensCompraveis do welcome); sem ele, o npcPrice.
  function lojaDeItens() {
    if (!S.items) return [];
    return Object.entries(S.items)
      .filter(([id, i]) => (i.category === 'heal' || i.category === 'revive') && (i.npcPrice > 0 || S.precoLoja?.get(Number(id)) > 0))
      .map(([id, i]) => ({ itemId: Number(id), preco: S.precoLoja?.get(Number(id)) || i.npcPrice }))
      .sort((a, b) => a.itemId - b.itemId);
  }

  const itemResumo = (i) => ({
    name: i.name, category: i.category, npcPrice: i.npcPrice ?? null, priceGold: i.priceGold ?? null,
    healAmount: i.healAmount ?? null, healPct: i.healPct ?? null, revivePct: i.revivePct ?? null,
  });
  // items.json (espelho) + itens próprios do welcome, no mesmo mapa (como o jogo faz).
  let itensJson = null;
  function montarItens() {
    if (!itensJson) return;
    const map = { ...itensJson };
    for (const i of S.nossos ?? []) if (i?.id != null) map[i.id] = itemResumo(i);
    S.items = map;
    if (S.catalog) { S.catalog.items = map; S.catalog.compraveis = lojaDeItens(); post('catalog', { catalog: S.catalog }); }
  }

  // Nomes e categorias dos itens (arquivo público do jogo).
  fetch(P.itemsUrl)
    .then((r) => r.json())
    .then((j) => {
      const map = {};
      for (const i of j.items ?? []) map[i.id] = itemResumo(i);
      itensJson = map;
      montarItens();
    })
    .catch(() => log('não consegui carregar items.json', 'warn'));

  // ------------------------------------------------------------ ritmo de uso (bolas e itens)
  const JANELA_MS = 30 * 60 * 1000;
  let usoPrev = null;
  let usoDesde = Date.now();
  let usoEventos = []; // { t, key, n }

  function resetUsage() { usoPrev = null; usoDesde = Date.now(); usoEventos = []; }

  function contagens() {
    const e = S.eu;
    const c = {};
    for (const [k, v] of Object.entries(e?.balls ?? {})) c['ball:' + k] = Number(v) || 0;
    for (const [k, v] of Object.entries(e?.items ?? {})) c['item:' + k] = Number(v) || 0;
    return c;
  }

  function trackUsage() {
    const agora = Date.now();
    const cur = contagens();
    if (usoPrev) {
      for (const [key, antes] of Object.entries(usoPrev)) {
        const gasto = antes - (cur[key] ?? 0);
        if (gasto > 0) usoEventos.push({ t: agora, key, n: gasto });
      }
    }
    usoPrev = cur;
    usoEventos = usoEventos.filter((x) => agora - x.t <= JANELA_MS);

    // XP/h medido do pokémon ativo na hunt atual (zera ao trocar de hunt ou de pokémon).
    const e = S.eu;
    const pk = (e?.pokemons ?? []).find((p) => p.id === e.activeId);
    if (pk && e.huntSlug && !e.noCentro) {
      if (xpMedido.slug !== e.huntSlug || xpMedido.id !== pk.id) xpMedido = { slug: e.huntSlug, id: pk.id, pts: [] };
      const ultimo = xpMedido.pts.at(-1);
      xpMedido.pts.push({ t: agora, xp: Number(pk.xp) || 0, xpTr: Number(e.xp) || 0 });
      // Multiplicador de XP real (VIP, boosts, guild): XP ganho num abate ÷ XP base do nível da hunt.
      // Medido separado para o pokémon e para o treinador (os boosts de cada um são diferentes).
      const hunt = (S.catalog?.hunts ?? []).find((h) => h.slug === e.huntSlug);
      if (ultimo && hunt && !multDeAbate) {
        const n = hunt.nivel;
        const base = n <= 150 ? n * n + 12 : n <= 1000 ? Math.round(22512 * (n / 150) ** 0.98) : Math.round(144617 * (n / 1000) ** 1.25);
        const gPk = (Number(pk.xp) || 0) - ultimo.xp;
        const gTr = (Number(e.xp) || 0) - ultimo.xpTr;
        if (gPk > 0) { multsXp.push(gPk / base); if (multsXp.length > 15) multsXp.shift(); }
        if (gTr > 0) { multsXpTr.push(gTr / base); if (multsXpTr.length > 15) multsXpTr.shift(); }
      }
      while (xpMedido.pts.length > 2 && agora - xpMedido.pts[1].t > 15 * 60 * 1000) xpMedido.pts.shift();
    }
  }

  // Abates de verdade: o evento 'morte' traz o XP base do abate (xp) e o que caiu com bônus
  // (xpPokemon / xpTreinador). Daí sai o multiplicador exato e os abates/h sem estimativa.
  let abates = { slug: null, id: null, lista: [] };
  function registrarAbate(ev) {
    const e = S.eu;
    if (!e?.huntSlug || e.noCentro) return;
    const agora = Date.now();
    if (abates.slug !== e.huntSlug || abates.id !== e.activeId) abates = { slug: e.huntSlug, id: e.activeId, lista: [] };
    const xp = Number(ev.xp) || 0;
    abates.lista.push({ t: agora, xp, pk: Number(ev.xpPokemon ?? ev.xp) || 0, tr: Number(ev.xpTreinador ?? ev.xp) || 0 });
    while (abates.lista.length > 2 && agora - abates.lista[0].t > 15 * 60 * 1000) abates.lista.shift();
    if (xp > 0) {
      if (!multDeAbate) { multsXp = []; multsXpTr = []; multDeAbate = true; } // descarta as contas pela fórmula
      const a = abates.lista.at(-1);
      if (a.pk > 0) { multsXp.push(a.pk / xp); if (multsXp.length > 15) multsXp.shift(); }
      if (a.tr > 0) { multsXpTr.push(a.tr / xp); if (multsXpTr.length > 15) multsXpTr.shift(); }
    }
  }
  let multDeAbate = false;
  function abatesAgora() {
    const l = abates.lista;
    if (l.length < 5 || abates.slug !== xpMedido.slug || abates.id !== xpMedido.id) return null;
    const dt = l.at(-1).t - l[0].t;
    if (dt < 2 * 60 * 1000) return null;
    const xs = l.map((a) => a.xp).filter((x) => x > 0).sort((a, b) => a - b);
    return { kph: Math.round(((l.length - 1) / dt) * 3600000), xpKill: xs.length ? xs[Math.floor(xs.length / 2)] : null };
  }

  let xpMedido = { slug: null, id: null, pts: [] };
  let multsXp = [];
  let multsXpTr = [];
  function multXpAgora(lista = multsXp) {
    if (lista.length < 3) return null;
    const s = [...lista].sort((a, b) => a - b);
    return Math.round(s[Math.floor(s.length / 2)] * 1000) / 1000; // mediana: ignora 2 abates no mesmo pacote
  }
  function xpMedidoAgora() {
    const p = xpMedido.pts;
    if (p.length < 2) return null;
    const dt = p.at(-1).t - p[0].t;
    if (dt < 2 * 60 * 1000) return { slug: xpMedido.slug, pokemonId: xpMedido.id, xpH: null, minutos: Math.round(dt / 60000) };
    const xpH = Math.round(((p.at(-1).xp - p[0].xp) / dt) * 3600000);
    // Abates/h medidos = XP/h ÷ (XP base do nível da hunt × seu bônus medido). Vira a "medida" da hunt.
    const hunt = (S.catalog?.hunts ?? []).find((h) => h.slug === xpMedido.slug);
    const mult = multXpAgora(multsXp);
    let kph = null;
    if (hunt && mult) {
      const n = hunt.nivel;
      const base = n <= 150 ? n * n + 12 : n <= 1000 ? Math.round(22512 * (n / 150) ** 0.98) : Math.round(144617 * (n / 1000) ** 1.25);
      kph = Math.round(xpH / (base * mult));
    }
    const ab = abatesAgora();
    let xpKill = null;
    if (ab) { kph = ab.kph; xpKill = ab.xpKill; }
    const pk = (S.eu?.pokemons ?? []).find((x) => x.id === xpMedido.id);
    return { slug: xpMedido.slug, pokemonId: xpMedido.id, nivelPokemon: pk?.level ?? null, xpH, xpKill, kphReal: !!ab, xpTrH: Math.round(((p.at(-1).xpTr - p[0].xpTr) / dt) * 3600000), kph, minutos: Math.round(dt / 60000) };
  }

  function ritmos() {
    const agora = Date.now();
    const janela = Math.max(5 * 60 * 1000, Math.min(JANELA_MS, agora - usoDesde));
    const soma = {};
    for (const x of usoEventos) soma[x.key] = (soma[x.key] ?? 0) + x.n;
    const out = {};
    for (const [k, n] of Object.entries(soma)) out[k] = Math.round((n / janela) * 3600000);
    return { porHora: out, janelaMin: Math.round(janela / 60000) };
  }

  // ------------------------------------------------------------ resumo publicado
  const pkResumo = (p) => ({
    id: p.id,
    nome: p.nome,
    speciesId: p.speciesId,
    level: p.level,
    hp: p.hp,
    maxHp: p.maxHp,
    shiny: !!p.shiny,
    potencia: p.potencia ?? null,
    quality: p.quality ?? null,
    iv: p.iv ?? (p.ivs ? Object.values(p.ivs).reduce((s, v) => s + (Number(v) || 0), 0) : null),
    slot: p.slot,
    tipos: p.tipos ?? null,
    stats: p.stats ?? null,
    ivs: p.ivs ?? null,
    nota: p.nota ?? null,
    poder: p.poder ?? null,
    refino: p.refino ?? null,
    tmElemental: p.tmElemental ?? null,
    tmAoe: p.tmAoe ?? null,
  });

  function resumo() {
    const e = S.eu;
    if (!e) return { at: Date.now(), connected: S.connected, ready: false };
    const a = e.automation ?? {};
    return {
      at: Date.now(),
      connected: S.connected,
      ready: true,
      nick: e.nick,
      level: e.level,
      gold: Number(e.gold) || 0,
      diamonds: Number(e.diamonds) || 0,
      orbs: Number(e.orbs) || 0,
      huntSlug: e.huntSlug ?? null,
      noCentro: !!e.noCentro,
      emCasa: !!e.casa?.dentro,
      arena: !!e.boss?.arena,
      mistico: !!e.mistico,
      activeId: e.activeId ?? null,
      balls: e.balls ?? {},
      items: e.items ?? {},
      team: (e.pokemons ?? []).filter((p) => p.slot != null).sort((x, y) => x.slot - y.slot).map(pkResumo),
      pokemonCount: (e.pokemons ?? []).length,
      gameAuto: {
        autoPotion: !!a.autoPotion,
        autoRevive: !!a.autoRevive,
        autoBall: !!a.autoBall,
        ballIds: a.ballIds ?? [],
        potionIds: a.potionIds ?? [],
        autoVoltarHunt: !!a.autoVoltarHunt,
      },
      uso: ritmos(),
      xpMedido: xpMedidoAgora(),
      multXp: multXpAgora(multsXp),
      multXpTr: multXpAgora(multsXpTr),
      xpTreinador: Number(e.xp) || 0,
      // Bônus de XP ativos (mesmos campos que o Hunt Analyser do jogo lê).
      bonus: {
        vipAte: Number(e.loja?.vipAte) || 0,
        boosts: e.loja?.boosts ?? {},
        guildBonusPct: Number(e.guildBonusPct) || 0,
        guildBoostAte: Number(e.guild?.boostAte) || 0,
        // Bônus Twitch: vale enquanto você está assistindo uma live oficial (o jogo mostra na ficha do treinador).
        twitchPct: e.twitch?.assistindo ? Number(e.twitch.pctAtual) || Number(e.twitch.pct) || 0 : 0,
        bicicleta: e.bicicleta?.equipadaRar ?? null,
      },
      regras: estadoRegras(),
      // Campos que o motor do jogo lê para os bônus de XP (hunt-analyser.mjs e a extensão oficial).
      euXp: {
        level: e.level ?? null,
        loja: { vipAte: e.loja?.vipAte ?? 0, boosts: e.loja?.boosts ?? {}, atrasados: e.loja?.atrasados ?? null },
        guildBonusPct: e.guildBonusPct ?? 0,
        guild: { boostAte: e.guild?.boostAte ?? 0 },
        twitch: e.twitch ? { assistindo: !!e.twitch.assistindo, pctAtual: Number(e.twitch.pctAtual) || 0 } : null,
        kick: e.kick ? { pct: Number(e.kick.pct) || 0, bonus: e.kick.bonus ?? {} } : null,
        evento: e.evento ?? null,
      },
      // Bloco Kick do jogo (canais oficiais, recompensas e horas de bônus). Usado pelo app multi-conta.
      kick: e.kick ? {
        vinculado: !!(e.kick.vinculado ?? e.kick.login),
        login: e.kick.login ?? null,
        pct: Number(e.kick.pct) || 0,
        minutos: Number(e.kick.minutos) || 60,
        recompensas: Array.isArray(e.kick.recompensas) ? e.kick.recompensas.map((r) => ({ tipo: String(r.tipo ?? ''), custo: Number(r.custo) || 0 })) : [],
        oficiais: Array.isArray(e.kick.oficiais) ? e.kick.oficiais.map((c) => ({ slug: String(c.slug ?? ''), nome: c.nome ?? null, aoVivo: !!c.aoVivo, espectadores: Number(c.espectadores) || 0, ativo: !!c.ativo })) : [],
        bonus: e.kick.bonus && typeof e.kick.bonus === 'object' ? Object.fromEntries(Object.entries(e.kick.bonus).map(([k, v]) => [k, Number(v) || 0])) : {},
      } : null,
      // Bloco Twitch do jogo (lives oficiais, em quais o servidor já te achou). Usado pelo app multi-conta.
      twitch: e.twitch ? {
        login: e.twitch.login ?? null,
        aoVivo: !!e.twitch.aoVivo,
        assistindo: !!e.twitch.assistindo,
        pct: Number(e.twitch.pct) || 0,
        pctAtual: Number(e.twitch.pctAtual) || 0,
        extra: Number(e.twitch.extra) || 0,
        assistindoEm: Array.isArray(e.twitch.assistindoEm) ? e.twitch.assistindoEm.map(String) : [],
        oficiais: Array.isArray(e.twitch.oficiais) ? e.twitch.oficiais.map((o) => ({ login: String(o.login ?? ''), nome: o.nome ?? null, bonus: o.bonus ?? null })) : [],
        lives: Array.isArray(e.twitch.lives) ? e.twitch.lives.map((l) => ({ login: String(l.login ?? ''), nome: l.nome ?? null, espectadores: Number(l.espectadores) || 0 })) : [],
      } : null,
    };
  }

  // Publica a cada mensagem do jogo (no máx. 1×/s). Não depende só de timer: com a aba em segundo
  // plano o Chrome atrasa timers em até 1 min, mas as mensagens do WebSocket continuam chegando.
  let pubTimer = null;
  let ultimoPub = 0;
  function publish(now = false) {
    const agora = Date.now();
    if (now || agora - ultimoPub >= 1000) {
      clearTimeout(pubTimer); pubTimer = null; ultimoPub = agora;
      post('state', { state: resumo() });
      return;
    }
    if (!pubTimer) pubTimer = setTimeout(() => { pubTimer = null; ultimoPub = Date.now(); post('state', { state: resumo() }); }, 1000);
  }

  // ------------------------------------------------------------ regras de automação
  let cfg = { enabled: false, rules: [], limits: { goldPerHour: 10000, goldReserve: 0 } };
  const ultimaCompra = {};      // ruleId -> timestamp
  const aguardando = {};        // ruleId -> { t, antes, qty }
  const bloqueadaAte = {};      // ruleId -> timestamp
  let gastos = [];              // { t, gold }

  const chaveRegra = (r) => (r.kind === 'ball' ? 'ball:' : 'item:') + r.refId;

  function precoDe(r) {
    if (!S.catalog) return null;
    if (r.kind === 'ball') { const b = S.catalog.bolas.find((x) => x.id === Number(r.refId)); return b && b.compravel ? b.priceGold || null : null; }
    return S.catalog.compraveis.find((x) => x.itemId === Number(r.refId))?.preco || null;
  }

  function estadoRegras() {
    const agora = Date.now();
    const out = {};
    for (const r of cfg.rules ?? []) {
      if (bloqueadaAte[r.id] > agora) out[r.id] = { bloqueadaAte: bloqueadaAte[r.id] };
    }
    const gastoHora = gastos.filter((g) => agora - g.t < 3600000).reduce((s, g) => s + g.gold, 0);
    return { porRegra: out, gastoUltimaHora: gastoHora };
  }

  function sendGame(obj) {
    const ws = S.sock;
    if (!ws || ws.readyState !== 1) return false;
    ws.send(JSON.stringify(obj));
    return true;
  }

  // As regras rodam a cada 3–6 s: pelo timer e também a cada mensagem do jogo (aba em segundo plano).
  let proximaAvaliacao = Date.now() + 5000;
  function talvezAvaliar() {
    const agora = Date.now();
    if (agora < proximaAvaliacao) return;
    proximaAvaliacao = agora + 3000 + Math.random() * 3000; // intervalo irregular
    try { avaliarRegras(); } catch (e) { log('erro nas regras: ' + e.message, 'error'); }
  }
  function tick() {
    talvezAvaliar();
    setTimeout(tick, 1000);
  }

  function avaliarRegras() {
    const agora = Date.now();
    gastos = gastos.filter((g) => agora - g.t < 3600000);
    if (!cfg.enabled || !S.eu || !S.connected || !S.catalog) return;
    const cont = contagens();

    for (const r of cfg.rules ?? []) {
      if (!r.enabled || !r.refId) continue;
      const key = chaveRegra(r);
      const tem = cont[key] ?? 0;

      // Confirmação da compra anterior: se o estoque não subiu, algo deu errado.
      const pend = aguardando[r.id];
      if (pend) {
        if (tem > pend.antes) { delete aguardando[r.id]; }
        else if (agora - pend.t > 15000) {
          delete aguardando[r.id];
          bloqueadaAte[r.id] = agora + 10 * 60 * 1000;
          log(`compra de ${r.label || key} não confirmou; regra pausada por 10 min`, 'warn');
          publish(true);
          continue;
        } else continue;
      }
      if (bloqueadaAte[r.id] > agora) continue;
      if (tem >= r.min) continue;
      if (agora - (ultimaCompra[r.id] ?? 0) < 20000 + Math.random() * 10000) continue;

      const preco = precoDe(r);
      if (!preco) { bloqueadaAte[r.id] = agora + 10 * 60 * 1000; log(`sem preço para ${r.label || key}; regra pausada`, 'warn'); continue; }

      let qty = Math.max(1, Math.round(Number(r.qty) || 0));
      const ouro = Number(S.eu.gold) || 0;
      const reserva = Number(cfg.limits?.goldReserve) || 0;
      const limiteHora = Number(cfg.limits?.goldPerHour) || 0;
      const gastoHora = gastos.reduce((s, g) => s + g.gold, 0);
      const podeOuro = Math.floor((ouro - reserva) / preco);
      const podeHora = limiteHora > 0 ? Math.floor((limiteHora - gastoHora) / preco) : Infinity;
      qty = Math.min(qty, podeOuro, podeHora);
      if (qty < 1) {
        if (!r._avisouSemOuro) log(`sem ouro/limite para comprar ${r.label || key}`, 'warn');
        r._avisouSemOuro = true;
        continue;
      }
      r._avisouSemOuro = false;

      const msg = r.kind === 'ball' ? P.out.buyBall(Number(r.refId), qty) : P.out.buyItem(Number(r.refId), qty);
      if (sendGame(msg)) {
        ultimaCompra[r.id] = agora;
        aguardando[r.id] = { t: agora, antes: tem, qty };
        gastos.push({ t: agora, gold: qty * preco });
        log(`comprei ${qty}x ${r.label || key} (tinha ${tem}, mínimo ${r.min}) por ${qty * preco} de ouro`);
        publish(true);
      }
      return; // no máximo uma compra por ciclo
    }
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.ns !== NS || e.data.dir !== 'ext') return;
    if (e.data.type === 'cfg' && e.data.cfg) {
      const antes = cfg.enabled;
      cfg = e.data.cfg;
      if (antes !== cfg.enabled) log(cfg.enabled ? 'automação LIGADA' : 'automação desligada');
      sniperCfgMudou();
      publish(true);
    }
    if (e.data.type === 'selectHunt' && typeof e.data.slug === 'string') {
      // "Ir" no painel (clique seu) ou troca automática (só com a chave geral e a da troca ligadas).
      const auto = e.data.origem === 'auto';
      if (auto && !(cfg.enabled && cfg.autoHunt?.enabled)) return;
      pedirTroca(e.data.slug, auto ? 'automática' : 'clique no painel');
    }
    if (e.data.type === 'resend') {
      if (S.catalog) post('catalog', { catalog: S.catalog });
      post('geo', { geo: geoBanco });
      publish(true);
    }
  });

  post('hello');
  setTimeout(tick, 1000);
})();
