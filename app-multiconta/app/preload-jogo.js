// GERADO por tools/sync.mjs a partir da extensão 0.9.3. Não edite à mão.
// Preload de cada quadrado do jogo. Faz o papel da extensão dentro do app:
//  1) põe o código "MAIN world" (proto.js + inject.js) na página, antes do jogo carregar;
//  2) roda os content scripts (bridge, hunts, autohunt) aqui, no mundo isolado do preload;
//  3) troca o chrome.storage da extensão por um armazenamento por conta, guardado pelo app.
const { ipcRenderer, webFrame } = require('electron');

// --- 1) código da página (captura do WebSocket, compras, troca de hunt)
const __PIE_MAIN = "// Tudo que depende do protocolo do jogo fica AQUI. Quando o jogo mudar de versão e algo\n// quebrar, este é o primeiro arquivo a conferir.\n// Mapeado no cliente v1.230.1 (out/2026).\nwindow.__PIE_PROTO = {\n  // Módulo oficial que remonta o estado que chega em delta. Não dá para importá-lo daqui (a CSP\n  // do jogo bloqueia scripts sem nonce), então inject.js usa uma cópia e só confere se o\n  // original mudou, comparando este hash.\n  deltaModule: '/shared/estado-delta.mjs',\n  deltaModuleHash: '6deba436',\n  itemsUrl: '/assets/items.json',\n\n  // Servidor -> cliente\n  in: {\n    welcome: 'welcome', // { estado (cheio), hunts, catalogoBolas, itensCompraveis, captura, chanceShiny, ... }\n    estado: 'estado',   // { estado (delta) }\n    batalha: 'batalha', // { ev: [{ k: 'ataque' | 'hunt' (trocaLivreEm) | ... }] }\n  },\n\n  // Cliente -> servidor (mesmas mensagens que os botões da interface enviam)\n  out: {\n    buyItem: (id, qty) => ({ t: 'shop.buy', kind: 'item', id, qty }),\n    buyBall: (id, qty) => ({ t: 'shop.buy', kind: 'ball', id, qty }),\n    selectHunt: (slug) => ({ t: 'hunt.select', slug }),\n  },\n};\n\n;\n// Roda no MAIN world, antes do app.js do jogo.\n// 1) captura o WebSocket do jogo e remonta o estado completo (mesmo mesclador do jogo)\n// 2) publica um resumo para a extensão (painel lateral e overlay)\n// 3) executa as regras de automação, que só agem se a chave geral E a regra estiverem ligadas\n(() => {\n  if (window.__pie) return;\n  window.__pie = true;\n\n  const P = window.__PIE_PROTO;\n  const NS = 'PIE';\n  const post = (type, payload = {}) => window.postMessage({ ns: NS, dir: 'page', type, ...payload }, '*');\n  const log = (msg, level = 'info') => post('log', { entry: { at: Date.now(), level, msg } });\n\n  // ------------------------------------------------------------ remontagem do estado\n  // Cópia do algoritmo de /shared/estado-delta.mjs, usada só se o import do módulo oficial falhar.\n  function mescladorLocal() {\n    let campos = null;\n    let pokemons = new Map();\n    const montar = () => ({ ...campos, pokemons: [...pokemons.values()] });\n    return function mesclar(parcial) {\n      if (!parcial) return campos ? montar() : null;\n      const { cheio, pokemons: lista, pkMud, pkFora, dexMud, dexFora, ...resto } = parcial;\n      if (cheio || !campos) {\n        campos = resto;\n        pokemons = new Map((lista ?? []).map((k) => [k.id, k]));\n        return montar();\n      }\n      Object.assign(campos, resto);\n      if (lista) pokemons = new Map(lista.map((k) => [k.id, k]));\n      for (const k of pkMud ?? []) pokemons.set(k.id, k);\n      for (const id of pkFora ?? []) pokemons.delete(id);\n      if (dexMud || dexFora) {\n        campos.pokedex = { ...(campos.pokedex ?? {}), ...(dexMud ?? {}) };\n        for (const c of dexFora ?? []) delete campos.pokedex[c];\n      }\n      return montar();\n    };\n  }\n  const criarMesclador = mescladorLocal;\n\n  // Confere se o jogo mudou o módulo de remontagem (se mudou, a cópia acima pode estar velha).\n  function conferirMesclador() {\n    fetch(P.deltaModule)\n      .then((r) => r.text())\n      .then((txt) => {\n        let h = 5381;\n        for (let i = 0; i < txt.length; i++) h = ((h * 33) ^ txt.charCodeAt(i)) >>> 0;\n        if (h.toString(16) !== P.deltaModuleHash) log('o jogo atualizou o módulo de estado; avise para conferir a extensão', 'warn');\n      })\n      .catch(() => {});\n  }\n\n  const S = {\n    sock: null,\n    connected: false,\n    mesclar: null,\n    eu: null,\n    catalog: null,\n    items: null,\n  };\n\n  // ------------------------------------------------------------ captura do WebSocket\n  const Native = window.WebSocket;\n  window.WebSocket = new Proxy(Native, {\n    construct(target, args, newTarget) {\n      const ws = Reflect.construct(target, args, newTarget);\n      try {\n        const url = new URL(String(args[0]), location.href);\n        if (url.host === location.host) attach(ws);\n      } catch (_) { /* nunca quebrar o jogo */ }\n      return ws;\n    },\n  });\n\n  function attach(ws) {\n    S.sock = ws;\n    ws.addEventListener('open', () => { if (S.sock === ws) { S.connected = true; publish(); } });\n    ws.addEventListener('close', () => { if (S.sock === ws) { S.connected = false; publish(); } });\n    ws.addEventListener('message', (ev) => {\n      if (S.sock !== ws || typeof ev.data !== 'string') return;\n      let m;\n      try { m = JSON.parse(ev.data); } catch (_) { return; }\n      try { onMessage(m); } catch (e) { log('erro lendo mensagem: ' + e.message, 'error'); }\n    });\n  }\n\n  function onMessage(m) {\n    if (m.t === P.in.welcome) {\n      S.mesclar = criarMesclador();\n      S.eu = S.mesclar(m.estado);\n      S.catalog = {\n        at: Date.now(),\n        hunts: m.hunts ?? [],\n        // Bolas à venda na loja do NPC: as marcadas `compravel` (mesmo filtro da tela de compra).\n        bolas: (m.catalogoBolas ?? []).map((b) => ({ id: b.id, nome: b.nome, priceGold: Number(b.priceGold) || 0, compravel: !!b.compravel, catchRate: b.catchRate ?? null })),\n        compraveis: lojaDeItens(),\n        captura: m.captura ?? null,\n        chanceShiny: Number(m.chanceShiny) || 0,\n        // Constantes de combate (mesmas que a Pokepédia do jogo usa).\n        combate: {\n          tabelaTipos: m.tabelaTipos ?? {},\n          ampliacaoHunt: m.ampliacaoHunt ?? 1.5,\n          multHpSelvagem: m.multHpSelvagem ?? 5,\n          multDanoSelvagem: m.multDanoSelvagem ?? 1.8,\n        },\n        tiposBoost: m.tiposBoost ?? [],\n        items: S.items,\n      };\n      resetUsage();\n      conferirMesclador();\n      post('catalog', { catalog: S.catalog });\n      trackUsage();\n      publish(true);\n    } else if (m.t === P.in.estado && S.mesclar) {\n      S.eu = S.mesclar(m.estado);\n      trackUsage();\n      publish();\n    } else if (m.t === P.in.batalha && Array.isArray(m.ev)) {\n      for (const ev of m.ev) {\n        if (ev.k === 'ataque') S.ultimoCombate = Date.now();\n        if (ev.k === 'morte' && ev.quem === 'selvagem') registrarAbate(ev);\n        if (ev.k === 'hunt' && ev.trocaLivreEm) S.trocaLivreEm = Number(ev.trocaLivreEm) || 0;\n      }\n    }\n    if (m.estado?.servidorAgora) S.desvio = Date.now() - m.estado.servidorAgora;\n    if (document.hidden) { processarTroca(); talvezAvaliar(); }\n  }\n\n  // ------------------------------------------------------------ trava de combate (troca de hunt)\n  // O jogo só deixa trocar de área com 3 s sem trocar dano — é quando o botão \"Ir para o Centro\n  // Pokémon\" habilita. Usa o próprio botão quando ele está na tela; senão, os mesmos carimbos do\n  // servidor que o jogo usa (centroLivreEm) + o último golpe visto + a porta de 10 s da troca.\n  function livreParaTrocar() {\n    const e = S.eu;\n    if (!e || e.casa?.dentro || e.boss?.arena || e.mistico) return { ok: false, motivo: 'fora de hunt' };\n    const agoraSrv = Date.now() - (S.desvio || 0);\n    if (agoraSrv < (S.trocaLivreEm || 0)) return { ok: false, motivo: 'porta de troca' };\n    // Sem hunt ou na cidade não há combate: pode escolher área (como clicar no mapa).\n    if (!e.huntSlug || e.noCentro) return { ok: true };\n    const btn = document.getElementById('ir-centro');\n    const saida = document.getElementById('hunt-saida');\n    // Botão do jogo na tela e travado = em combate. Além dele, exige 3 s sem nenhum golpe visto\n    // (com a aba em segundo plano o botão pode demorar a atualizar).\n    if (!document.hidden && btn && saida && !saida.classList.contains('hidden') && btn.disabled) return { ok: false, motivo: 'em combate' };\n    if (agoraSrv < (Number(e.centroLivreEm) || 0) || Date.now() - (S.ultimoCombate || 0) < 3000) return { ok: false, motivo: 'em combate' };\n    return { ok: true };\n  }\n\n  // Pedido de troca (do botão \"Ir\" ou da troca automática): espera ficar livre por até 90 s.\n  let trocaPendente = null; // { slug, origem, ate }\n  // Fica tentando: assim que sai de combate manda; se o jogo não trocar, tenta de novo 5 s depois.\n  // Desiste só se o pedido ficar 10 min sem dar certo, se você trocar de hunt por conta própria\n  // ou (no caso da automática) se a chave for desligada.\n  function pedirTroca(slug, origem) {\n    if (S.eu?.huntSlug === slug) return;\n    if (trocaPendente?.slug === slug) return;\n    trocaPendente = { slug, origem, desde: Date.now(), enviadoEm: 0, proxima: 0, tentativas: 0, deOnde: S.eu?.huntSlug };\n    log(`troca para ${slug} pedida (${origem}); esperando sair de combate`);\n  }\n  function processarTroca() {\n    const t = trocaPendente;\n    if (!t) return;\n    const agora = Date.now();\n    if (S.eu?.huntSlug === t.slug) {\n      log(`agora caçando em ${t.slug}${t.tentativas > 1 ? ` (${t.tentativas} tentativas)` : ''}`);\n      post('huntOk', { slug: t.slug, origem: t.origem }); trocaPendente = null; return;\n    }\n    if (t.origem === 'automática' && !(cfg.enabled && cfg.autoHunt?.enabled)) { trocaPendente = null; return; }\n    if (S.eu?.huntSlug && S.eu.huntSlug !== t.deOnde) { log(`troca para ${t.slug} cancelada: você mudou de hunt`); trocaPendente = null; return; }\n    if (agora - t.desde > 10 * 60 * 1000) { log(`desisti de trocar para ${t.slug} depois de 10 min`, 'warn'); post('huntFalhou', { slug: t.slug, origem: t.origem }); trocaPendente = null; return; }\n    if (t.enviadoEm && agora - t.enviadoEm < 5000) return; // espera a resposta do jogo\n    if (agora < t.proxima) return;\n    if (!livreParaTrocar().ok) return;\n    if (sendGame(P.out.selectHunt(t.slug))) { t.enviadoEm = agora; t.proxima = agora + 5000; t.tentativas++; }\n  }\n  setInterval(processarTroca, 250);\n\n  // A loja de itens do NPC: cura e revive com preço de NPC (mesmo filtro da tela de compra do jogo).\n  function lojaDeItens() {\n    if (!S.items) return [];\n    return Object.entries(S.items)\n      .filter(([, i]) => (i.category === 'heal' || i.category === 'revive') && i.npcPrice > 0)\n      .map(([id, i]) => ({ itemId: Number(id), preco: i.npcPrice }));\n  }\n\n  // Nomes e categorias dos itens (arquivo público do jogo).\n  fetch(P.itemsUrl)\n    .then((r) => r.json())\n    .then((j) => {\n      const map = {};\n      for (const i of j.items ?? []) map[i.id] = { name: i.name, category: i.category, npcPrice: i.npcPrice ?? null, healAmount: i.healAmount ?? null };\n      S.items = map;\n      if (S.catalog) { S.catalog.items = map; S.catalog.compraveis = lojaDeItens(); post('catalog', { catalog: S.catalog }); }\n    })\n    .catch(() => log('não consegui carregar items.json', 'warn'));\n\n  // ------------------------------------------------------------ ritmo de uso (bolas e itens)\n  const JANELA_MS = 30 * 60 * 1000;\n  let usoPrev = null;\n  let usoDesde = Date.now();\n  let usoEventos = []; // { t, key, n }\n\n  function resetUsage() { usoPrev = null; usoDesde = Date.now(); usoEventos = []; }\n\n  function contagens() {\n    const e = S.eu;\n    const c = {};\n    for (const [k, v] of Object.entries(e?.balls ?? {})) c['ball:' + k] = Number(v) || 0;\n    for (const [k, v] of Object.entries(e?.items ?? {})) c['item:' + k] = Number(v) || 0;\n    return c;\n  }\n\n  function trackUsage() {\n    const agora = Date.now();\n    const cur = contagens();\n    if (usoPrev) {\n      for (const [key, antes] of Object.entries(usoPrev)) {\n        const gasto = antes - (cur[key] ?? 0);\n        if (gasto > 0) usoEventos.push({ t: agora, key, n: gasto });\n      }\n    }\n    usoPrev = cur;\n    usoEventos = usoEventos.filter((x) => agora - x.t <= JANELA_MS);\n\n    // XP/h medido do pokémon ativo na hunt atual (zera ao trocar de hunt ou de pokémon).\n    const e = S.eu;\n    const pk = (e?.pokemons ?? []).find((p) => p.id === e.activeId);\n    if (pk && e.huntSlug && !e.noCentro) {\n      if (xpMedido.slug !== e.huntSlug || xpMedido.id !== pk.id) xpMedido = { slug: e.huntSlug, id: pk.id, pts: [] };\n      const ultimo = xpMedido.pts.at(-1);\n      xpMedido.pts.push({ t: agora, xp: Number(pk.xp) || 0, xpTr: Number(e.xp) || 0 });\n      // Multiplicador de XP real (VIP, boosts, guild): XP ganho num abate ÷ XP base do nível da hunt.\n      // Medido separado para o pokémon e para o treinador (os boosts de cada um são diferentes).\n      const hunt = (S.catalog?.hunts ?? []).find((h) => h.slug === e.huntSlug);\n      if (ultimo && hunt && !multDeAbate) {\n        const n = hunt.nivel;\n        const base = n <= 150 ? n * n + 12 : n <= 1000 ? Math.round(22512 * (n / 150) ** 0.98) : Math.round(144617 * (n / 1000) ** 1.25);\n        const gPk = (Number(pk.xp) || 0) - ultimo.xp;\n        const gTr = (Number(e.xp) || 0) - ultimo.xpTr;\n        if (gPk > 0) { multsXp.push(gPk / base); if (multsXp.length > 15) multsXp.shift(); }\n        if (gTr > 0) { multsXpTr.push(gTr / base); if (multsXpTr.length > 15) multsXpTr.shift(); }\n      }\n      while (xpMedido.pts.length > 2 && agora - xpMedido.pts[1].t > 15 * 60 * 1000) xpMedido.pts.shift();\n    }\n  }\n\n  // Abates de verdade: o evento 'morte' traz o XP base do abate (xp) e o que caiu com bônus\n  // (xpPokemon / xpTreinador). Daí sai o multiplicador exato e os abates/h sem estimativa.\n  let abates = { slug: null, id: null, lista: [] };\n  function registrarAbate(ev) {\n    const e = S.eu;\n    if (!e?.huntSlug || e.noCentro) return;\n    const agora = Date.now();\n    if (abates.slug !== e.huntSlug || abates.id !== e.activeId) abates = { slug: e.huntSlug, id: e.activeId, lista: [] };\n    const xp = Number(ev.xp) || 0;\n    abates.lista.push({ t: agora, xp, pk: Number(ev.xpPokemon ?? ev.xp) || 0, tr: Number(ev.xpTreinador ?? ev.xp) || 0 });\n    while (abates.lista.length > 2 && agora - abates.lista[0].t > 15 * 60 * 1000) abates.lista.shift();\n    if (xp > 0) {\n      if (!multDeAbate) { multsXp = []; multsXpTr = []; multDeAbate = true; } // descarta as contas pela fórmula\n      const a = abates.lista.at(-1);\n      if (a.pk > 0) { multsXp.push(a.pk / xp); if (multsXp.length > 15) multsXp.shift(); }\n      if (a.tr > 0) { multsXpTr.push(a.tr / xp); if (multsXpTr.length > 15) multsXpTr.shift(); }\n    }\n  }\n  let multDeAbate = false;\n  function abatesAgora() {\n    const l = abates.lista;\n    if (l.length < 5 || abates.slug !== xpMedido.slug || abates.id !== xpMedido.id) return null;\n    const dt = l.at(-1).t - l[0].t;\n    if (dt < 2 * 60 * 1000) return null;\n    const xs = l.map((a) => a.xp).filter((x) => x > 0).sort((a, b) => a - b);\n    return { kph: Math.round(((l.length - 1) / dt) * 3600000), xpKill: xs.length ? xs[Math.floor(xs.length / 2)] : null };\n  }\n\n  let xpMedido = { slug: null, id: null, pts: [] };\n  let multsXp = [];\n  let multsXpTr = [];\n  function multXpAgora(lista = multsXp) {\n    if (lista.length < 3) return null;\n    const s = [...lista].sort((a, b) => a - b);\n    return Math.round(s[Math.floor(s.length / 2)] * 1000) / 1000; // mediana: ignora 2 abates no mesmo pacote\n  }\n  function xpMedidoAgora() {\n    const p = xpMedido.pts;\n    if (p.length < 2) return null;\n    const dt = p.at(-1).t - p[0].t;\n    if (dt < 2 * 60 * 1000) return { slug: xpMedido.slug, pokemonId: xpMedido.id, xpH: null, minutos: Math.round(dt / 60000) };\n    const xpH = Math.round(((p.at(-1).xp - p[0].xp) / dt) * 3600000);\n    // Abates/h medidos = XP/h ÷ (XP base do nível da hunt × seu bônus medido). Vira a \"medida\" da hunt.\n    const hunt = (S.catalog?.hunts ?? []).find((h) => h.slug === xpMedido.slug);\n    const mult = multXpAgora(multsXp);\n    let kph = null;\n    if (hunt && mult) {\n      const n = hunt.nivel;\n      const base = n <= 150 ? n * n + 12 : n <= 1000 ? Math.round(22512 * (n / 150) ** 0.98) : Math.round(144617 * (n / 1000) ** 1.25);\n      kph = Math.round(xpH / (base * mult));\n    }\n    const ab = abatesAgora();\n    let xpKill = null;\n    if (ab) { kph = ab.kph; xpKill = ab.xpKill; }\n    const pk = (S.eu?.pokemons ?? []).find((x) => x.id === xpMedido.id);\n    return { slug: xpMedido.slug, pokemonId: xpMedido.id, nivelPokemon: pk?.level ?? null, xpH, xpKill, kphReal: !!ab, xpTrH: Math.round(((p.at(-1).xpTr - p[0].xpTr) / dt) * 3600000), kph, minutos: Math.round(dt / 60000) };\n  }\n\n  function ritmos() {\n    const agora = Date.now();\n    const janela = Math.max(5 * 60 * 1000, Math.min(JANELA_MS, agora - usoDesde));\n    const soma = {};\n    for (const x of usoEventos) soma[x.key] = (soma[x.key] ?? 0) + x.n;\n    const out = {};\n    for (const [k, n] of Object.entries(soma)) out[k] = Math.round((n / janela) * 3600000);\n    return { porHora: out, janelaMin: Math.round(janela / 60000) };\n  }\n\n  // ------------------------------------------------------------ resumo publicado\n  const pkResumo = (p) => ({\n    id: p.id,\n    nome: p.nome,\n    speciesId: p.speciesId,\n    level: p.level,\n    hp: p.hp,\n    maxHp: p.maxHp,\n    shiny: !!p.shiny,\n    potencia: p.potencia ?? null,\n    quality: p.quality ?? null,\n    iv: p.iv ?? (p.ivs ? Object.values(p.ivs).reduce((s, v) => s + (Number(v) || 0), 0) : null),\n    slot: p.slot,\n    tipos: p.tipos ?? null,\n    stats: p.stats ?? null,\n    ivs: p.ivs ?? null,\n    nota: p.nota ?? null,\n    poder: p.poder ?? null,\n    refino: p.refino ?? null,\n    tmElemental: p.tmElemental ?? null,\n    tmAoe: p.tmAoe ?? null,\n  });\n\n  function resumo() {\n    const e = S.eu;\n    if (!e) return { at: Date.now(), connected: S.connected, ready: false };\n    const a = e.automation ?? {};\n    return {\n      at: Date.now(),\n      connected: S.connected,\n      ready: true,\n      nick: e.nick,\n      level: e.level,\n      gold: Number(e.gold) || 0,\n      diamonds: Number(e.diamonds) || 0,\n      orbs: Number(e.orbs) || 0,\n      huntSlug: e.huntSlug ?? null,\n      noCentro: !!e.noCentro,\n      emCasa: !!e.casa?.dentro,\n      arena: !!e.boss?.arena,\n      mistico: !!e.mistico,\n      activeId: e.activeId ?? null,\n      balls: e.balls ?? {},\n      items: e.items ?? {},\n      team: (e.pokemons ?? []).filter((p) => p.slot != null).sort((x, y) => x.slot - y.slot).map(pkResumo),\n      pokemonCount: (e.pokemons ?? []).length,\n      gameAuto: {\n        autoPotion: !!a.autoPotion,\n        autoRevive: !!a.autoRevive,\n        autoBall: !!a.autoBall,\n        ballIds: a.ballIds ?? [],\n        potionIds: a.potionIds ?? [],\n        autoVoltarHunt: !!a.autoVoltarHunt,\n      },\n      uso: ritmos(),\n      xpMedido: xpMedidoAgora(),\n      multXp: multXpAgora(multsXp),\n      multXpTr: multXpAgora(multsXpTr),\n      xpTreinador: Number(e.xp) || 0,\n      // Bônus de XP ativos (mesmos campos que o Hunt Analyser do jogo lê).\n      bonus: {\n        vipAte: Number(e.loja?.vipAte) || 0,\n        boosts: e.loja?.boosts ?? {},\n        guildBonusPct: Number(e.guildBonusPct) || 0,\n        guildBoostAte: Number(e.guild?.boostAte) || 0,\n        // Bônus Twitch: vale enquanto você está assistindo uma live oficial (o jogo mostra na ficha do treinador).\n        twitchPct: e.twitch?.assistindo ? Number(e.twitch.pctAtual) || Number(e.twitch.pct) || 0 : 0,\n        bicicleta: e.bicicleta?.equipadaRar ?? null,\n      },\n      regras: estadoRegras(),\n      // Bloco Kick do jogo (canais oficiais, recompensas e horas de bônus). Usado pelo app multi-conta.\n      kick: e.kick ? {\n        vinculado: !!(e.kick.vinculado ?? e.kick.login),\n        login: e.kick.login ?? null,\n        pct: Number(e.kick.pct) || 0,\n        minutos: Number(e.kick.minutos) || 60,\n        recompensas: Array.isArray(e.kick.recompensas) ? e.kick.recompensas.map((r) => ({ tipo: String(r.tipo ?? ''), custo: Number(r.custo) || 0 })) : [],\n        oficiais: Array.isArray(e.kick.oficiais) ? e.kick.oficiais.map((c) => ({ slug: String(c.slug ?? ''), nome: c.nome ?? null, aoVivo: !!c.aoVivo, espectadores: Number(c.espectadores) || 0, ativo: !!c.ativo })) : [],\n        bonus: e.kick.bonus && typeof e.kick.bonus === 'object' ? Object.fromEntries(Object.entries(e.kick.bonus).map(([k, v]) => [k, Number(v) || 0])) : {},\n      } : null,\n      // Bloco Twitch do jogo (lives oficiais, em quais o servidor já te achou). Usado pelo app multi-conta.\n      twitch: e.twitch ? {\n        login: e.twitch.login ?? null,\n        aoVivo: !!e.twitch.aoVivo,\n        assistindo: !!e.twitch.assistindo,\n        pct: Number(e.twitch.pct) || 0,\n        pctAtual: Number(e.twitch.pctAtual) || 0,\n        extra: Number(e.twitch.extra) || 0,\n        assistindoEm: Array.isArray(e.twitch.assistindoEm) ? e.twitch.assistindoEm.map(String) : [],\n        oficiais: Array.isArray(e.twitch.oficiais) ? e.twitch.oficiais.map((o) => ({ login: String(o.login ?? ''), nome: o.nome ?? null, bonus: o.bonus ?? null })) : [],\n        lives: Array.isArray(e.twitch.lives) ? e.twitch.lives.map((l) => ({ login: String(l.login ?? ''), nome: l.nome ?? null, espectadores: Number(l.espectadores) || 0 })) : [],\n      } : null,\n    };\n  }\n\n  // Publica a cada mensagem do jogo (no máx. 1×/s). Não depende só de timer: com a aba em segundo\n  // plano o Chrome atrasa timers em até 1 min, mas as mensagens do WebSocket continuam chegando.\n  let pubTimer = null;\n  let ultimoPub = 0;\n  function publish(now = false) {\n    const agora = Date.now();\n    if (now || agora - ultimoPub >= 1000) {\n      clearTimeout(pubTimer); pubTimer = null; ultimoPub = agora;\n      post('state', { state: resumo() });\n      return;\n    }\n    if (!pubTimer) pubTimer = setTimeout(() => { pubTimer = null; ultimoPub = Date.now(); post('state', { state: resumo() }); }, 1000);\n  }\n\n  // ------------------------------------------------------------ regras de automação\n  let cfg = { enabled: false, rules: [], limits: { goldPerHour: 10000, goldReserve: 0 } };\n  const ultimaCompra = {};      // ruleId -> timestamp\n  const aguardando = {};        // ruleId -> { t, antes, qty }\n  const bloqueadaAte = {};      // ruleId -> timestamp\n  let gastos = [];              // { t, gold }\n\n  const chaveRegra = (r) => (r.kind === 'ball' ? 'ball:' : 'item:') + r.refId;\n\n  function precoDe(r) {\n    if (!S.catalog) return null;\n    if (r.kind === 'ball') { const b = S.catalog.bolas.find((x) => x.id === Number(r.refId)); return b && b.compravel ? b.priceGold || null : null; }\n    return S.catalog.compraveis.find((x) => x.itemId === Number(r.refId))?.preco || null;\n  }\n\n  function estadoRegras() {\n    const agora = Date.now();\n    const out = {};\n    for (const r of cfg.rules ?? []) {\n      if (bloqueadaAte[r.id] > agora) out[r.id] = { bloqueadaAte: bloqueadaAte[r.id] };\n    }\n    const gastoHora = gastos.filter((g) => agora - g.t < 3600000).reduce((s, g) => s + g.gold, 0);\n    return { porRegra: out, gastoUltimaHora: gastoHora };\n  }\n\n  function sendGame(obj) {\n    const ws = S.sock;\n    if (!ws || ws.readyState !== 1) return false;\n    ws.send(JSON.stringify(obj));\n    return true;\n  }\n\n  // As regras rodam a cada 3–6 s: pelo timer e também a cada mensagem do jogo (aba em segundo plano).\n  let proximaAvaliacao = Date.now() + 5000;\n  function talvezAvaliar() {\n    const agora = Date.now();\n    if (agora < proximaAvaliacao) return;\n    proximaAvaliacao = agora + 3000 + Math.random() * 3000; // intervalo irregular\n    try { avaliarRegras(); } catch (e) { log('erro nas regras: ' + e.message, 'error'); }\n  }\n  function tick() {\n    talvezAvaliar();\n    setTimeout(tick, 1000);\n  }\n\n  function avaliarRegras() {\n    const agora = Date.now();\n    gastos = gastos.filter((g) => agora - g.t < 3600000);\n    if (!cfg.enabled || !S.eu || !S.connected || !S.catalog) return;\n    const cont = contagens();\n\n    for (const r of cfg.rules ?? []) {\n      if (!r.enabled || !r.refId) continue;\n      const key = chaveRegra(r);\n      const tem = cont[key] ?? 0;\n\n      // Confirmação da compra anterior: se o estoque não subiu, algo deu errado.\n      const pend = aguardando[r.id];\n      if (pend) {\n        if (tem > pend.antes) { delete aguardando[r.id]; }\n        else if (agora - pend.t > 15000) {\n          delete aguardando[r.id];\n          bloqueadaAte[r.id] = agora + 10 * 60 * 1000;\n          log(`compra de ${r.label || key} não confirmou; regra pausada por 10 min`, 'warn');\n          publish(true);\n          continue;\n        } else continue;\n      }\n      if (bloqueadaAte[r.id] > agora) continue;\n      if (tem >= r.min) continue;\n      if (agora - (ultimaCompra[r.id] ?? 0) < 20000 + Math.random() * 10000) continue;\n\n      const preco = precoDe(r);\n      if (!preco) { bloqueadaAte[r.id] = agora + 10 * 60 * 1000; log(`sem preço para ${r.label || key}; regra pausada`, 'warn'); continue; }\n\n      let qty = Math.max(1, Math.round(Number(r.qty) || 0));\n      const ouro = Number(S.eu.gold) || 0;\n      const reserva = Number(cfg.limits?.goldReserve) || 0;\n      const limiteHora = Number(cfg.limits?.goldPerHour) || 0;\n      const gastoHora = gastos.reduce((s, g) => s + g.gold, 0);\n      const podeOuro = Math.floor((ouro - reserva) / preco);\n      const podeHora = limiteHora > 0 ? Math.floor((limiteHora - gastoHora) / preco) : Infinity;\n      qty = Math.min(qty, podeOuro, podeHora);\n      if (qty < 1) {\n        if (!r._avisouSemOuro) log(`sem ouro/limite para comprar ${r.label || key}`, 'warn');\n        r._avisouSemOuro = true;\n        continue;\n      }\n      r._avisouSemOuro = false;\n\n      const msg = r.kind === 'ball' ? P.out.buyBall(Number(r.refId), qty) : P.out.buyItem(Number(r.refId), qty);\n      if (sendGame(msg)) {\n        ultimaCompra[r.id] = agora;\n        aguardando[r.id] = { t: agora, antes: tem, qty };\n        gastos.push({ t: agora, gold: qty * preco });\n        log(`comprei ${qty}x ${r.label || key} (tinha ${tem}, mínimo ${r.min}) por ${qty * preco} de ouro`);\n        publish(true);\n      }\n      return; // no máximo uma compra por ciclo\n    }\n  }\n\n  window.addEventListener('message', (e) => {\n    if (e.source !== window || !e.data || e.data.ns !== NS || e.data.dir !== 'ext') return;\n    if (e.data.type === 'cfg' && e.data.cfg) {\n      const antes = cfg.enabled;\n      cfg = e.data.cfg;\n      if (antes !== cfg.enabled) log(cfg.enabled ? 'automação LIGADA' : 'automação desligada');\n      publish(true);\n    }\n    if (e.data.type === 'selectHunt' && typeof e.data.slug === 'string') {\n      // \"Ir\" no painel (clique seu) ou troca automática (só com a chave geral e a da troca ligadas).\n      const auto = e.data.origem === 'auto';\n      if (auto && !(cfg.enabled && cfg.autoHunt?.enabled)) return;\n      pedirTroca(e.data.slug, auto ? 'automática' : 'clique no painel');\n    }\n    if (e.data.type === 'resend') {\n      if (S.catalog) post('catalog', { catalog: S.catalog });\n      publish(true);\n    }\n  });\n\n  post('hello');\n  setTimeout(tick, 1000);\n})();\n";
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

// ===== content/defaults.js (extensão 0.9.3) =====
// Configuração padrão: tudo que age no jogo começa DESLIGADO.
// Usado pelo content script e pelo painel lateral.
var PIE_DEFAULT_CFG = {
  enabled: false, // chave geral da automação
  rules: [],      // { id, kind: 'item'|'ball', refId, label, min, qty, enabled:false }
                  // quando tiver MENOS de `min`, compra `qty` unidades
  limits: {
    goldPerHour: 10000, // teto de gasto por hora (0 = sem teto)
    goldReserve: 0,     // nunca deixar o ouro abaixo disto
  },
  // Troca de hunt automática: só age com a chave geral E esta ligadas.
  autoHunt: {
    enabled: false,
    criterio: 'pk',   // 'pk' (XP do pokémon) | 'tr' (XP do treinador) | 'ouro'
    riscoMax: 'alto', // 'baixo' = só Tranquila (≥20 kills/vida) | 'alto' = Segura (≥5, como o guia)
    ganhoMin: 0,      // 0 = troca sempre que o 1º lugar mudar; X = só se render X% a mais
  },
};

function pieMergeCfg(saved) {
  const d = JSON.parse(JSON.stringify(PIE_DEFAULT_CFG));
  if (!saved) return d;
  return {
    ...d,
    ...saved,
    limits: { ...d.limits, ...(saved.limits || {}) },
    autoHunt: { ...d.autoHunt, ...(saved.autoHunt || {}), ...(saved.autoHunt?.riscoMax === 'médio' ? { riscoMax: 'alto' } : {}) },
    // regras antigas (min / buyTo / maxPerBuy) viram (min / qty)
    rules: Array.isArray(saved.rules)
      ? saved.rules.map((r) => (r.qty != null ? r : { ...r, qty: Math.max(1, Math.min(r.maxPerBuy || 100, (r.buyTo || r.min) - r.min) || 50) }))
      : [],
  };
}

;
// ===== content/fmt.js (extensão 0.9.3) =====
// Formatação e leitura do resumo, compartilhado entre overlay e painel lateral.
var PieFmt = {
  num(n) {
    n = Number(n) || 0;
    return n.toLocaleString('pt-BR');
  },
  curto(n) {
    n = Number(n) || 0;
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + 'M';
    if (Math.abs(n) >= 1e4) return Math.round(n / 1e3) + 'k';
    return n.toLocaleString('pt-BR');
  },
  // Quanto tempo o estoque dura no ritmo atual.
  duracao(tem, porHora) {
    if (!porHora) return '';
    const h = tem / porHora;
    if (h >= 48) return Math.round(h / 24) + ' dias';
    if (h >= 1) {
      const hh = Math.floor(h);
      const mm = Math.round((h - hh) * 60);
      return hh + 'h' + (mm ? String(mm).padStart(2, '0') : '');
    }
    return Math.max(1, Math.round(h * 60)) + ' min';
  },
  ha(ts) {
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return s + 's';
    if (s < 3600) return Math.round(s / 60) + ' min';
    return Math.round(s / 3600) + 'h';
  },
  hunt(catalog, slug) {
    if (!slug) return null;
    return (catalog?.hunts ?? []).find((h) => h.slug === slug) ?? { slug, nome: slug };
  },
  nomeBola(catalog, id) {
    return (catalog?.bolas ?? []).find((b) => b.id === Number(id))?.nome ?? 'Ball #' + id;
  },
  item(catalog, id) {
    return catalog?.items?.[id] ?? null;
  },
  // Linhas de pokébolas que você tem (ou que têm regra), com ritmo e duração.
  bolas(snap, catalog) {
    const uso = snap?.uso?.porHora ?? {};
    const out = [];
    for (const [id, q] of Object.entries(snap?.balls ?? {})) {
      if (!(q > 0)) continue;
      out.push({ id: Number(id), nome: PieFmt.nomeBola(catalog, id), q, porHora: uso['ball:' + id] ?? 0 });
    }
    return out.sort((a, b) => b.q - a.q);
  },
  // Itens de cura e revive.
  cura(snap, catalog) {
    const uso = snap?.uso?.porHora ?? {};
    const out = [];
    for (const [id, q] of Object.entries(snap?.items ?? {})) {
      const it = PieFmt.item(catalog, id);
      if (!(q > 0) || !it || (it.category !== 'heal' && it.category !== 'revive')) continue;
      out.push({ id: Number(id), nome: it.name, cat: it.category, q, porHora: uso['item:' + id] ?? 0 });
    }
    return out.sort((a, b) => (a.cat === b.cat ? b.q - a.q : a.cat === 'heal' ? -1 : 1));
  },
};

;
// ===== content/bridge.js (extensão 0.9.3) =====
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
    else if (d.type === 'log') queueLog(d.entry);
  });

  chrome.storage.onChanged.addListener((c, area) => {
    if (area === 'local' && c.cfg) pushCfg();
  });

  // O painel lateral pode pedir o estado de novo (ex.: aberto depois do jogo).
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'pie-resend') toPage('resend');
    if (msg && msg.type === 'pie-hunt' && typeof msg.slug === 'string') toPage('selectHunt', { slug: msg.slug });
  });

  // Zera o resumo da sessão anterior ao abrir o jogo, para o painel não mostrar dado velho.
  chrome.storage.local.set({ snapshot: { at: Date.now(), connected: false, ready: false } });
  pushCfg();
})();

;
// ===== sidepanel/hunts.js (extensão 0.9.3) =====
// "Onde caçar": o mesmo cálculo do guia pokeidle (guiapokeidlehardtocapture.site), aba Onde caçar.
//
// Dados: data/guia.json (espécies, hunts, tipos e medidas de campo do guia — tools/build-guia.mjs).
// Entrada: o pokémon do jogo vira a mesma ficha que você preencheria no guia
//   nome, nível, qualidade, potência, shiny, IVs, refino, TM elemental, TM AoE,
//   poção (auto-poção do jogo), bola, VIP, boosts, guild, Twitch, bicicleta, nível do treinador.
// Saída: XP/h, kills/h, kills/vida, dinheiro/h… como na tabela do guia, mesma ordem e mesmo filtro.
var PieHunt = (() => {
  let G = null;            // dados do guia
  let ESP = null;          // id → espécie do guia
  let NOME = null;         // nome minúsculo → espécie do guia (a 1ª com o nome, como no guia)
  let JOGO = null;         // espécies do jogo (retratos e nomes)

  async function carregar() {
    if (G) return G;
    const [g, j] = await Promise.all([
      fetch(chrome.runtime.getURL('data/guia.json')).then((r) => r.json()),
      fetch(chrome.runtime.getURL('data/especies.json')).then((r) => r.json()),
    ]);
    ESP = new Map(g.especies.map((e) => [e.id, e]));
    NOME = new Map();
    for (const e of g.especies) { const k = e.n.toLowerCase(); if (!NOME.has(k)) NOME.set(k, e); }
    JOGO = new Map(j.especies.map((e) => [e[0], { id: e[0], nome: e[1], lt: e[7] || 0, base: e[8] || 0 }]));
    G = g;
    return G;
  }

  // ---------- constantes (as do guia) ----------
  const BONUS_POT = [0, 0.05, 0.1, 0.25, 1];
  const MULT_SHINY = 3;
  const EXPO_Q = { hp: 0.95, atk: 0.8, def: 0.8, spAtk: 0.8, spDef: 0.8, speed: 0.95 };
  const STATS = ['hp', 'atk', 'def', 'spAtk', 'spDef', 'speed'];
  const RAND = 0.925;
  const GAP_PLAYER = 0.9, GAP_WILD = 1.5;
  const INVESTIDA_CD = 2.0, INVESTIDA_PW = 30;
  const WILD_IV = 16, WILD_HP_MULT = 5, WILD_DMG_MULT = 1.8;
  const MS_ONDA = 2.6, MAX_MOBS = 16, MS_PASSO = 0.26, NN_PADRAO = 4.9;
  const VEL_SELV = 1.9, GAP_ONDA = 2.8, F_BUSCA = 0.31, RETARGET = 1.0, CICLO_MIN = 1.8, K_AOE = 2.2;
  const WILD_POOL_FATOR = 1.4;
  const POCOES = { 200: { heal: 60, price: 5 }, 201: { heal: 150, price: 10 }, 202: { heal: 400, price: 22 }, 203: { heal: 1000, price: 55 }, 204: { heal: 3000, price: 135 } };
  const BOLA_ULTRA = 4;
  const BIKE = { comum: 0.15, incomum: 0.25, rara: 0.5, mitica: 0.75, lendaria: 1 };
  const E_QUALIDADE = 1.1766;
  const EXPO_OURO = Math.log(6000 / 36) / Math.log(5000);
  const TETO_OURO = Math.round(36 * 25000 ** EXPO_OURO);
  const TETO_SELL_PK = 6 * TETO_OURO;

  // ---------- economia ----------
  const xpDoNivel = (n) => (n <= 150 ? n * n + 12 : n <= 1000 ? Math.round(22512 * (n / 150) ** 0.98) : Math.round(144617 * (n / 1000) ** 1.25));
  const xpKillHunt = (h) => G.xpKill[h.s] ?? xpDoNivel(h.nv);
  const ouroKill = (n) => Math.min(TETO_OURO, Math.max(1, Math.round(36 * Math.max(1, n) ** EXPO_OURO)));
  const ouroDoNivel = (n) => Math.round(12000 * (n / 150) ** 0.6);
  function valorVendaBase(e) {
    const hl = Math.max(1, e.hl || 1);
    let v;
    if (e.sv > 0 && e.sv <= 500000) v = e.sv;
    else if (e.sv > 500000) v = ouroDoNivel(hl);
    else if (e.pn > 0 && e.pn <= 500000) v = e.pn;
    else v = ouroDoNivel(hl);
    return Math.min(hl > 150 ? Math.min(ouroDoNivel(hl), v) : v, TETO_SELL_PK);
  }
  const precoVenda = (e, nivel, q) => Math.max(1, Math.floor(valorVendaBase(e) * (1 + nivel / 50) * q));
  const nivelCaptura = (nv, teto) => (nv <= 100 ? Math.max(1, nv) : Math.min(nv, Math.max(1, teto || 100)));
  function chanceCaptura(e, cr) {
    if (cr >= 255) return 1;
    const preco = e.pn > 0 ? e.pn : 787928;
    const rar = Math.log10(Math.max(100, preco)) - 1;
    return Math.max(0.003, Math.min(0.1, 0.0075 * (cr / (1 + rar ** 3 / 17)) * 1.4));
  }

  // ---------- tipos e dano ----------
  function multAtq(atq, def) {
    const l = G.tipos[atq] || {};
    if (def === atq) {
      if (l[def] != null) return l[def];
      if (atq === 'GHOST' || atq === 'DRAGON') return 2;
      if (atq === 'NORMAL' || atq === 'GROUND' || atq === 'FLYING') return 1;
      return 0.5;
    }
    return l[def] ?? 1;
  }
  const ef = (a, d1, d2) => { let v = multAtq(a, d1); if (d2 && d2 !== d1) v *= multAtq(a, d2); return v; };
  const amp = (v) => (v === 0 || v === 1 ? v : v > 1 ? 1 + (v - 1) * 1.5 : v / 1.5);
  const dano = (nv, power, atk, def, stab, efet) => ((((2 * nv) / 5 + 2) * power * Math.max(1, atk)) / Math.max(1, def) / 50 + 2) * (stab ? 1.5 : 1) * efet * RAND;
  const statSelv = (base, nv) => ((base + 2 * WILD_IV) * nv) / 100;
  const comSpeed = (ms, iv) => Math.max(400, ms - Math.min(32, Math.max(1, Math.round(iv || 1))) * 10);
  const statNasc = (base, iv, nivel, q, expo, mult) => Math.round((((base + 2 * iv) * nivel) / 100) * Math.pow(q, expo) * mult);

  // ---------- a ficha do guia, montada a partir do jogo ----------
  function especieDoGuia(pk) {
    const nomeJogo = JOGO?.get(pk.speciesId)?.nome;
    return NOME.get(String(nomeJogo ?? '').toLowerCase()) || NOME.get(String(pk.nome ?? '').toLowerCase()) || null;
  }
  function fichaDoJogo(pk, snap, catalog) {
    const b = snap?.bonus ?? {};
    const agora = Date.now();
    const auto = snap?.gameAuto ?? {};
    const ativo = (k) => (Number(b.boosts?.[k]) || 0) > agora;
    // poção: a mais forte das escolhidas na auto-poção do jogo (o guia usa Ultimate de padrão)
    let pocao = '0';
    if (auto.autoPotion) {
      const ids = (auto.potionIds ?? []).map(Number).filter((id) => POCOES[id]);
      pocao = String(ids.length ? Math.max(...ids) : 204);
    }
    // bola: a de maior captura entre as do auto-bola; sem auto-bola, Ultra (padrão do guia)
    let ballCr = BOLA_ULTRA;
    const bolas = Object.values(catalog?.bolas ?? {});
    if (auto.autoBall && auto.ballIds?.length) {
      const crs = auto.ballIds.map((id) => Number(bolas.find((x) => x.id === id)?.catchRate)).filter((x) => x > 0);
      if (crs.length) ballCr = Math.max(...crs);
    }
    const ivs = {}, refino = {};
    for (const k of STATS) {
      ivs[k] = Math.max(1, Math.min(32, Math.round(+pk.ivs?.[k] || 1)));
      refino[k] = Math.max(0, Math.min(500, Math.round(+pk.refino?.[k] || 0)));
    }
    return {
      nivel: Math.max(1, Math.min(9999, Math.round(+pk.level || 1))),
      trein: Math.max(0, Math.round(+snap?.level || 0)) || Infinity,
      q: Math.max(0.8, Math.min(1.8, +pk.quality || 1)),
      pot: Math.max(1, Math.min(5, Math.round(+pk.potencia || 1))),
      shiny: !!pk.shiny,
      ivs, refino,
      tm: !!pk.tmElemental,
      aoe: pk.tmAoe === true || pk.tmAoe === 'true' || pk.tmAoe === 1,
      pocao, ballCr,
      vip: (b.vipAte || 0) > agora,
      boost: ativo('pokexp'),
      boostTr: ativo('xp'),
      guild: Number(b.guildBonusPct) || 0,
      evento: (b.guildBoostAte || 0) > agora ? 10 : 0, // Boost da Guild (+10%) entra como evento
      twitch: Number(b.twitchPct) || 0,
      bike: BIKE[b.bicicleta] ?? 0,
    };
  }
  const chaveFicha = (pk, snap, catalog) => JSON.stringify([pk.id, pk.speciesId, fichaDoJogo(pk, snap, catalog)]);

  function montarPoke(esp, c) {
    const mult = (1 + BONUS_POT[c.pot - 1]) * (c.shiny ? MULT_SHINY : 1);
    const stats = {};
    STATS.forEach((k, i) => { stats[k] = statNasc(esp.b[i] + (c.refino[k] ?? 0), c.ivs[k], c.nivel, c.q, EXPO_Q[k], mult); });
    const comum = (c.vip ? 1.5 : 1) * (1 + c.guild / 100) * (1 + c.evento / 100) * (1 + c.twitch / 100);
    return {
      esp, nome: esp.n, t: esp.t, nivel: c.nivel, stats, ivs: c.ivs,
      golpes: esp.m.filter((m) => m[5] <= c.nivel).map((m) => ({ nome: m[0], tipo: m[1], cat: m[2], p: m[3], cd: m[4] })),
      tm: c.tm, aoe: c.aoe, pocao: POCOES[+c.pocao] || null, ballCr: c.ballCr,
      xpBonus: comum * (c.boost ? 1.5 : 1),
      xpBonusTrein: comum * (c.boostTr ? 1.5 : 1),
      guildPct: c.guild,
      passo: MS_PASSO / (1 + Math.max(0, c.bike)),
    };
  }

  // ---------- geometria e entrega de spawn ----------
  const distsHunt = (s) => G.dists[s] ?? Array(15).fill((G.geo[s] ?? NN_PADRAO) * 2.22 + 9.7);
  const capSlot = (h, n) => {
    if ((h.nv ?? 0) <= 150) return G.onda[h.s] ? (n * 3600) / G.onda[h.s][0] : Infinity;
    return (n * 3600) / (h.s.endsWith('_sinnoh') ? 30 : 65);
  };
  const capOnda = (h, n) => (G.onda[h.s] ? (n * 3600) / G.onda[h.s][0] : capSlot(h, n));
  const kphOndaMin = (h) => (distsHunt(h.s).length * 3600) / (G.onda[h.s] ? G.onda[h.s][1] : 75);
  function kphEntrega(h, ttk, aoe, ciclo, passo) {
    const d = distsHunt(h.s).slice().sort((a, b) => a - b);
    const n = d.length;
    const caminho = (d.reduce((a, b) => a + b, 0) / n) * passo * F_BUSCA;
    if (aoe) return Math.min((3600 * K_AOE) / Math.max(ciclo || ttk || CICLO_MIN, CICLO_MIN), capSlot(h, n));
    const encontro = (VEL_SELV * passo) / (VEL_SELV + passo);
    let t = 0;
    for (const x of d) t = Math.max(t + ciclo + caminho, x * encontro);
    return Math.min((n * 3600) / (t + GAP_ONDA), capOnda(h, n));
  }

  // ---------- combate ----------
  function danoNaHunt(g, poke, pesos, nv) {
    const atq = g.cat === 0 ? poke.stats.atk : poke.stats.spAtk;
    const stab = poke.t.includes(g.tipo);
    let soma = 0;
    for (const [id, w] of pesos) {
      const s = ESP.get(id); if (!s) continue;
      const def = g.cat === 0 ? statSelv(s.b[2], nv) : statSelv(s.b[4], nv);
      soma += w * dano(poke.nivel, g.p, atq, def, stab, amp(ef(g.tipo, s.t[0], s.t[1])));
    }
    return soma;
  }

  // Fila de ataques do servidor; HP do selvagem rolado por abate (IV 1–32).
  function lutaPorAbate(gs, dInv, esp, nv, ivSpd, morto) {
    const gap = comSpeed(GAP_PLAYER * 1000, ivSpd) / 1000;
    const cdInv = comSpeed(INVESTIDA_CD * 1000, ivSpd) / 1000;
    const cds = gs.map((g) => comSpeed(g.cd, ivSpd) / 1000);
    const pronto = new Array(gs.length).fill(0);
    const naFila = new Array(gs.length).fill(false);
    const fila = [];
    const N = 32;
    let proxInv = 0, t = 0, luta = 0;
    for (let k = 0; k < N; k++) {
      const iv = 1 + Math.floor((k * 32) / N + 0.5);
      const hp = Math.max(24, (((esp.b[0] + 2 * iv) * nv) / 100) * 12 * WILD_HP_MULT);
      let feito = 0, ini = t, ult = t, guarda = 0;
      while (feito < hp && guarda++ < 600) {
        for (let i = 0; i < gs.length; i++) if (pronto[i] <= t && !naFila[i]) { fila.push(i); naFila[i] = true; }
        if (fila.length) {
          const i = fila.shift(); naFila[i] = false;
          feito += gs[i].d; pronto[i] = t + cds[i]; ult = t; t += gap;
        } else if (proxInv <= t) { feito += dInv; proxInv = t + cdInv; ult = t; t += gap; }
        else t = Math.min(Math.min(...pronto), proxInv);
      }
      if (feito < hp) return Infinity;
      luta += ult - ini;
      t = ult + morto;
    }
    return luta / N;
  }

  function dpsSelvagem(esp, nv, poke) {
    let soma = 0, n = 0;
    for (const m of esp.m) {
      const atq = m[2] === 0 ? statSelv(esp.b[1], nv) : statSelv(esp.b[3], nv);
      const def = m[2] === 0 ? poke.stats.def : poke.stats.spDef;
      soma += dano(nv, Math.max(15, m[3]), atq, def, esp.t.includes(m[1]), amp(ef(m[1], poke.t[0], poke.t[1])));
      n++;
    }
    const dInv = dano(nv, INVESTIDA_PW, statSelv(esp.b[1], nv), poke.stats.def, true, amp(ef(esp.t[0], poke.t[0], poke.t[1])));
    const media = n ? soma / n : 0;
    return ((media * 0.92 + dInv * 0.08) / GAP_WILD) * WILD_DMG_MULT * WILD_POOL_FATOR;
  }

  function simularHunt(h, poke) {
    const total = h.e.reduce((s, x) => s + x[1], 0) || 1;
    const pesos = h.e.map(([id, p]) => [id, p / total]);
    let tmTipo = null;
    if (poke.tm) {
      let melhor = null;
      for (const t of poke.t) {
        const d = danoNaHunt({ tipo: t, cat: 1, p: 2800 }, poke, pesos, h.nv);
        if (!melhor || d > melhor.d) melhor = { d, tipo: t };
      }
      if (melhor) tmTipo = melhor.tipo;
    }
    const atqInv = poke.stats.atk;
    const onda = G.dists[h.s]?.length ?? Math.min(MAX_MOBS, total);
    const morto = MS_ONDA / onda + RETARGET;
    let ttk = 0, inviavel = false;
    for (const [id, w] of pesos) {
      const s = ESP.get(id); if (!s) continue;
      const gs = poke.golpes.map((g) => ({ d: danoNaHunt(g, poke, [[id, 1]], h.nv), cd: g.cd }));
      if (tmTipo) gs.push({ d: danoNaHunt({ tipo: tmTipo, cat: 1, p: 2800 }, poke, [[id, 1]], h.nv), cd: 60000 });
      const dInv = dano(poke.nivel, INVESTIDA_PW, atqInv, statSelv(s.b[2], h.nv), true, amp(ef(poke.t[0], s.t[0], s.t[1])));
      const c = lutaPorAbate(gs, dInv, s, h.nv, poke.ivs.speed, morto);
      if (!isFinite(c)) { inviavel = true; break; }
      ttk += w * c;
    }
    let dpsSelv = 0;
    for (const [id, w] of pesos) { const s = ESP.get(id); if (s) dpsSelv += w * dpsSelvagem(s, h.nv, poke); }
    const hpPoke = Math.max(24, poke.stats.hp * 12);
    if (inviavel) ttk = Infinity;
    const ciclo = Math.max(ttk + RETARGET, CICLO_MIN);
    let kph = inviavel ? 0 : Math.min(3600 / ciclo, kphEntrega(h, ttk, false, ciclo, poke.passo));
    if (poke.aoe && !inviavel) kph = Math.max(kph, kphEntrega(h, ttk, true, ciclo, poke.passo));
    const medKph = G.medido[h.s]?.kph;
    if (medKph) kph = Math.min(kph, medKph);

    const engajados = poke.aoe ? Math.min(15, 1 + (kph * ttk) / 3600) : 1;
    const danoPorKill = dpsSelv * engajados * ttk;
    const hitMax = dpsSelv * GAP_WILD * 1.6;
    const kpv = inviavel ? 0
      : poke.pocao ? (hitMax >= hpPoke ? hpPoke / Math.max(1e-6, hitMax) : 999)
      : hpPoke / Math.max(1e-6, danoPorKill);
    const distMedia = distsHunt(h.s).reduce((a, b) => a + b, 0) / 15;
    const tempoMorte = 3 + distMedia * poke.passo;
    const vida = kpv * (kph > 0 ? 3600 / kph : 0);
    const uptime = inviavel ? 0 : vida / (vida + tempoMorte);
    const mortesH = inviavel ? 0 : 3600 / (vida + tempoMorte);
    const kphEff = kph * uptime;

    const guildMult = 1 + (poke.guildPct ?? 0) / 100;
    let loot = 0, venda = 0;
    for (const [id, w] of pesos) {
      const s = ESP.get(id); if (!s) continue;
      const cc = chanceCaptura(s, poke.ballCr);
      for (const [, pct, mn, mx, preco] of s.l ?? []) loot += w * (pct / 100) * ((mn + mx) / 2) * preco;
      venda += w * cc * precoVenda(s, nivelCaptura(h.nv, s.tc), E_QUALIDADE);
    }
    loot *= guildMult;
    const pocoesH = poke.pocao && !inviavel ? (danoPorKill * kphEff) / poke.pocao.heal : 0;
    const custoPocaoH = poke.pocao ? pocoesH * poke.pocao.price : 0;
    const xpK = xpKillHunt(h);
    const lo = Math.min(kph, kphOndaMin(h)) * uptime * xpK * poke.xpBonus;
    const hi = kph * uptime * xpK * poke.xpBonus;
    return {
      ttk, kph, kphEff, killsPorVida: kpv, mortesH, uptime, inviavel,
      morto: inviavel ? 0 : Math.max(0, 3600 / kphEff - ttk),
      xpH: kphEff * xpK * poke.xpBonus,
      xpMin: lo < hi * 0.9 ? lo : null,
      xpTreinH: kphEff * xpK * poke.xpBonusTrein,
      xpKill: xpK,
      ouroKillH: kphEff * ouroKill(h.nv),
      lootH: kphEff * loot, vendaH: kphEff * venda,
      dinheiroH: kphEff * (ouroKill(h.nv) + loot + venda) - custoPocaoH,
      custoPocaoH,
    };
  }

  // ---------- API usada pelo painel e pela troca automática ----------
  // Simula todas as hunts do guia para o pokémon (pesado; quem chama guarda o resultado pela chaveFicha).
  async function simular(pk, catalog, nivelTreinador, snap = null) {
    await carregar();
    const esp = especieDoGuia(pk);
    if (!esp) return { erro: `O guia não conhece ${pk.nome ?? 'este pokémon'}.` };
    const c = fichaDoJogo(pk, snap ?? { level: nivelTreinador }, catalog);
    if (nivelTreinador) c.trein = nivelTreinador;
    return simularFicha(esp, c, catalog);
  }
  // A mesma simulação a partir de uma ficha no formato do guia (também usada nos testes).
  async function simularFicha(esp, c, catalog = null) {
    await carregar();
    if (typeof esp === 'string') esp = NOME.get(esp.toLowerCase());
    const poke = montarPoke(esp, c);
    const doJogo = new Map((catalog?.hunts ?? []).map((h) => [h.slug, h]));
    const brutos = G.hunts.map((h) => {
      const r = simularHunt(h, poke);
      const hj = doJogo.get(h.s);
      r.hunt = { slug: h.s, nome: h.n, area: h.a, nivel: h.nv, especies: hj?.especies ?? h.e.map(([id, p]) => ({ pokeId: id, pontos: p, nome: ESP.get(id)?.n })) };
      r.geoEstimada = !G.geoFonte[h.s] || G.geoFonte[h.s] === 'padrao';
      return r;
    });
    return { brutos, total: brutos.length, ficha: c, poke: { nome: esp.n, stats: poke.stats } };
  }

  const selo = (kpv) => (kpv >= 20 ? { nivel: 'baixo', txt: 'Tranquila', cls: 'ok' } : kpv >= 5 ? { nivel: 'médio', txt: 'Segura', cls: 'mid' } : kpv >= 1 ? { nivel: 'alto', txt: 'Apertada', cls: 'warn' } : { nivel: 'morre', txt: 'Perigosa', cls: 'bad' });

  // Filtro e ordem da tabela do guia: kills/vida ≥ mínimo (5 = "segura"; 0,5 = "arriscada"),
  // tempo de abate ≤ 120 s e hunt liberada pelo nível do treinador. Medidas reais só aparecem ao lado.
  function ajustar(sim, snap, catalog, { mostrarArriscadas = false, medidas = null, pk = null } = {}) {
    if (!sim || sim.erro) return sim;
    const min = mostrarArriscadas ? 0.5 : 5;
    const teto = sim.ficha?.trein ?? Infinity;
    const lista = [];
    for (const b of sim.brutos) {
      if (!(b.killsPorVida >= min && b.ttk <= 120 && b.hunt.nivel <= teto)) continue;
      const r = { ...b, risco: selo(b.killsPorVida) };
      r.xpH = Math.round(b.xpH);
      r.xpTrH = Math.round(b.xpTreinH);
      r.ouroH = Math.round(b.dinheiroH);
      r.killsH = Math.round(b.kphEff);
      const med = pk && medidas ? medidas[b.hunt.slug + '|' + pk.id] : null;
      if (med?.real && med.kph > 0 && (med.nivel == null || Math.abs(med.nivel - pk.level) <= 5)) r.medido = med;
      lista.push(r);
    }
    lista.sort((a, b) => b.xpH - a.xpH);
    return { lista, total: sim.total, ficha: sim.ficha, poke: sim.poke };
  }

  async function ranking(pk, catalog, nivelTreinador, opts = {}) {
    return ajustar(await simular(pk, catalog, nivelTreinador, opts.snap ?? null), opts.snap ?? null, catalog, opts);
  }

  // Bônus de XP do jogo (só para mostrar no painel; a conta usa a ficha do guia).
  function multiplicadores(snap, catalog, agora = Date.now()) {
    const b = snap?.bonus ?? {};
    const tipos = catalog?.tiposBoost ?? [];
    const partes = [];
    const boost = (chave) => {
      const ate = Number(b.boosts?.[chave]) || 0;
      if (agora >= ate) return 1;
      const tb = tipos.find((x) => x.chave === chave);
      const m = Number(tb?.mult) || 1;
      if (m !== 1) partes.push({ nome: tb?.nome || `Boost ${chave}`, mult: m, ate, alvo: chave === 'xp' ? 'treinador' : 'pokémon' });
      return m;
    };
    const vip = agora < (b.vipAte || 0) ? 1.5 : 1;
    if (vip > 1) partes.push({ nome: 'VIP', mult: 1.5, ate: b.vipAte, alvo: 'ambos' });
    const guild = 1 + (b.guildBonusPct || 0) / 100;
    if (guild > 1) partes.push({ nome: `Bônus de ranking da guild (+${String(b.guildBonusPct).replace('.', ',')}%)`, mult: guild, ate: null, alvo: 'ambos' });
    const gBoost = (b.guildBoostAte || 0) > agora ? 1.1 : 1;
    if (gBoost > 1) partes.push({ nome: 'Boost da Guild', mult: 1.1, ate: b.guildBoostAte, alvo: 'ambos' });
    const twitch = 1 + (b.twitchPct || 0) / 100;
    if (twitch > 1) partes.push({ nome: `Bônus Twitch (+${String(b.twitchPct).replace('.', ',')}%)`, mult: twitch, ate: null, alvo: 'ambos' });
    const tr = boost('xp') * vip * guild * gBoost * twitch;
    const pk = boost('pokexp') * vip * guild * gBoost * twitch;
    const medPk = Number(snap?.multXp) || null;
    const medTr = Number(snap?.multXpTr) || null;
    return { tr: medTr || tr, pk: medPk || pk, calcTr: tr, calcPk: pk, medido: !!(medPk || medTr), partes };
  }

  const looktypeDe = (pokeId) => JOGO?.get(pokeId)?.lt || 0;
  // Número da Pokédex nacional para o retrato (variantes e ids próprios do jogo → espécie base).
  const dexDoRetrato = (pokeId) => JOGO?.get(pokeId)?.base || (pokeId <= 1025 ? pokeId : 0);

  // Decide se vale trocar (mesma regra para o aviso vermelho e para a troca automática).
  // lista: ranking (estimativa + medidas); ah: cfg.autoHunt
  function decidir(lista, slugAtual, ah = {}, _opts = {}) {
    if (!lista?.length) return null;
    const val = (r) => (ah.criterio === 'tr' ? r.xpTrH : ah.criterio === 'ouro' ? r.ouroH : r.xpH);
    const nomeCrit = ah.criterio === 'tr' ? 'XP do treinador' : ah.criterio === 'ouro' ? 'ouro' : 'XP do pokémon';
    const RISCO = { baixo: 0, 'médio': 1, alto: 2 };
    // como o "Melhor farm" do guia: só hunts seguras (≥5 kills/vida) que ele mata em até 60 s
    const ok = lista.filter((r) => r.hunt?.slug && r.killsPorVida >= 5 && r.ttk <= 60 && (!r.risco || (RISCO[r.risco.nivel] ?? 9) <= (RISCO[ah.riscoMax] ?? 2)));
    if (!ok.length) return null;
    const melhor = ok.reduce((a, b) => (val(b) > val(a) ? b : a));
    // conta sem hunt escolhida (conta nova, ou parada na cidade sem área): vai para a 1ª
    if (!slugAtual) return { melhor, motivo: `Sem hunt escolhida: ${melhor.hunt.nome} é a 1ª em ${nomeCrit}.` };
    if (melhor.hunt.slug === slugAtual) return null;
    const atual = lista.find((r) => r.hunt?.slug === slugAtual);
    if (!atual) {
      return { melhor, motivo: 'A hunt atual ficou perigosa (ele pode morrer lá) ou não está liberada.' };
    }
    const ganho = val(melhor) / Math.max(1, val(atual)) - 1;
    if (ganho <= (Number(ah.ganhoMin) || 0) / 100) return null;
    return { melhor, atual, ganho, motivo: `${melhor.hunt.nome} é a 1ª em ${nomeCrit}: +${Math.round(ganho * 100)}% (${PieFmtCurto(val(melhor))} contra ${PieFmtCurto(val(atual))}/h).` };
  }
  const PieFmtCurto = (n) => (typeof PieFmt !== 'undefined' ? PieFmt.curto(n) : String(n));

  return { decidir, looktypeDe, dexDoRetrato, carregar, simular, ajustar, ranking, multiplicadores, chaveFicha, fichaDoJogo, simularFicha, xpDoNivel, ouroKill };
})();

;
// ===== content/autohunt.js (extensão 0.9.3) =====
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

