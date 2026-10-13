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
  // Poção fora da tabela do guia (itens próprios do jogo): cura fixa ou % do HP, preço da loja.
  function pocaoDe(id, catalog) {
    if (POCOES[id]) return POCOES[id];
    const it = catalog?.items?.[id];
    if (!it || it.category !== 'heal') return null;
    const pct = Number(it.healPct) > 0 ? Number(it.healPct) : 0;
    const heal = Number(it.healAmount) > 0 ? Number(it.healAmount) : 0;
    if (!pct && !heal) return null;
    const loja = (catalog.compraveis ?? []).find((x) => x.itemId === id)?.preco;
    const price = Number(it.priceGold) || Number(loja) || Number(it.npcPrice) || 0;
    return pct ? { pct, price, nome: it.name } : { heal, price, nome: it.name };
  }
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
    // poção: a mais forte das escolhidas na auto-poção do jogo (o guia usa Ultimate de padrão).
    // As do guia (200–204) têm cura fixa; as próprias do jogo (Golden Potion…) vêm do catálogo e
    // podem curar % do HP — aí "mais forte" é pela cura neste pokémon.
    let pocao = '0', pocaoExtra = null;
    if (auto.autoPotion) {
      const hp = Number(pk.maxHp) || Math.max(24, (Number(pk.stats?.hp) || 0) * 12);
      const cands = (auto.potionIds ?? []).map(Number).map((id) => ({ id, p: pocaoDe(id, catalog) })).filter((x) => x.p);
      const forca = (p) => (p.pct ? p.pct * hp : p.heal);
      cands.sort((a, b) => forca(b.p) - forca(a.p) || b.id - a.id);
      pocao = String(cands.length ? cands[0].id : 204);
      if (cands.length && !POCOES[cands[0].id]) pocaoExtra = cands[0].p;
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
      pocao, pocaoExtra, ballCr,
      vip: (b.vipAte || 0) > agora,
      boost: ativo('pokexp'),
      boostTr: ativo('xp'),
      guild: Number(b.guildBonusPct) || 0,
      evento: (b.guildBoostAte || 0) > agora ? 10 : 0, // Boost da Guild (+10%) entra como evento
      twitch: Number(b.twitchPct) || 0,
      // Kick: hora de bônus de XP resgatada com pontos do canal (vale para pokémon e treinador).
      kick: kickXpPct(snap, agora),
      bike: BIKE[b.bicicleta] ?? 0,
    };
  }
  const chaveFicha = (pk, snap, catalog) => JSON.stringify([pk.id, pk.speciesId, fichaDoJogo(pk, snap, catalog)]);

  function montarPoke(esp, c) {
    const mult = (1 + BONUS_POT[c.pot - 1]) * (c.shiny ? MULT_SHINY : 1);
    const stats = {};
    STATS.forEach((k, i) => { stats[k] = statNasc(esp.b[i] + (c.refino[k] ?? 0), c.ivs[k], c.nivel, c.q, EXPO_Q[k], mult); });
    const comum = (c.vip ? 1.5 : 1) * (1 + c.guild / 100) * (1 + c.evento / 100) * (1 + c.twitch / 100) * (1 + (c.kick || 0) / 100);
    return {
      esp, nome: esp.n, t: esp.t, nivel: c.nivel, stats, ivs: c.ivs,
      golpes: esp.m.filter((m) => m[5] <= c.nivel).map((m) => ({ nome: m[0], tipo: m[1], cat: m[2], p: m[3], cd: m[4] })),
      tm: c.tm, aoe: c.aoe, pocao: POCOES[+c.pocao] || c.pocaoExtra || null, ballCr: c.ballCr,
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
    const curaPocao = poke.pocao ? (poke.pocao.pct ? poke.pocao.pct * hpPoke : poke.pocao.heal) : 0;
    const pocoesH = poke.pocao && !inviavel ? (danoPorKill * kphEff) / Math.max(1e-6, curaPocao) : 0;
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

  const kickXpPct = (snap, agora = Date.now()) => {
    const k = snap?.kick;
    return k && agora < (Number(k.bonus?.xp) || 0) ? Number(k.pct) || 0 : 0;
  };

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
    const kp = kickXpPct(snap, agora);
    const kick = 1 + kp / 100;
    if (kick > 1) partes.push({ nome: `Bônus Kick (+${String(kp).replace('.', ',')}%)`, mult: kick, ate: Number(snap.kick.bonus.xp), alvo: 'ambos' });
    const tr = boost('xp') * vip * guild * gBoost * twitch * kick;
    const pk = boost('pokexp') * vip * guild * gBoost * twitch * kick;
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
