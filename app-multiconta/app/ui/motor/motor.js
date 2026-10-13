// Motor do "Onde caçar" — roda num Web Worker (sem acesso ao `window.app` da interface).
//
// Modelo igual ao da extensão oficial do jogo ("/hunt for PokeIdle", by Liang): as fórmulas de
// combate, XP, ouro e efetividade são os módulos `shared/` do próprio jogo (baixados da versão no
// ar pelo app e servidos em pie://app/jogo/<versão>/), o catálogo de espécies é montado na mesma
// ordem do cliente oficial, e o ritmo da hunt usa as constantes medidas + a geometria que o app
// mede nas ondas cheias enquanto você caça. O ranking é sempre o modelo de onda cheia; o ritmo
// medido aparece só como referência.
//
// Mensagens:  { t: 'carregar', versao }  →  { t: 'pronto', versao, ms } | { t: 'erro', erro }
//             { t: 'analisar', id, pk, ctx }  →  { t: 'resultado', id, r } | { t: 'erro', id, erro }

// ---- regras do jogo (Pokepédia > Combate / Stats) ------------------------------------------
const REGRAS = {
  randMedio: 0.925,      // aleatório 0,85–1,00
  stab: 1.5,
  gapJogadorMs: 900,     // intervalo mínimo entre golpes seus
  gapSelvagemS: 1.4,     // intervalo mínimo entre golpes do selvagem
  investidaPower: 30,
  investidaCdMs: 2000,
  pisoCdMs: 400,         // piso do desconto do IV de SPD
  msPorIvSpd: 10,        // −10 ms por ponto de IV de SPD (Investida e intervalo)
  hpCombateMult: 12,     // hp de combate = máx(24, arred(hp × 12))
  hpCombateMin: 24,
  ivSelvagemMedio: 16,
  poderMinimo: 15,
  ladoTmAoe: 11,         // o disco AoE pega um quadrado 11×11
};

// ---- ritmo da hunt (medido em jogo) --------------------------------------------------------
const RITMO = {
  retargetS: 1.0,
  cicloMinS: 1.8,
  gapOndaS: 2.8,
  msOndaS: 2.6,
  selvagemSPorTile: 1.9,
  heroiSPorTile: 0.26,
  fBusca: 0.31,
  spawnsPadrao: 15,
  maxSpawns: 16,
  distPadrao: 20.6,
  slotSinnohS: 30,
  slotOutrasS: 65,
  nivelOnda: 150,
  respawnS: 3,
  amostrasHp: 32,
  maxAtaquesPorAbate: 4000,
  aoeAlvosPorGolpe: 2.2,
  aoeAlvosMin: 1,
  aoeAlvosMax: 6,
  aoeMaxEngajados: 15,
};

const MODULOS = {
  cooldown: 'shared/cooldown-golpes.mjs',
  especiais: 'shared/golpes-especiais.mjs',
  planilhas: 'shared/golpes-planilhas.mjs',
  outland: 'shared/outland.mjs',
  baseOutland: 'shared/herdar-base-outland.mjs',
  golpesOrre: 'shared/herdar-golpes-orre.mjs',
  megas: 'shared/megas.mjs',
  evolucoes: 'shared/evolucoes-cruzadas.mjs',
  alias: 'shared/alias-item.mjs',
  tm: 'shared/tm-elemental.mjs',
  recompensa: 'shared/recompensa-hunt.mjs',
  analyser: 'hunt-analyser.mjs',
};
const CATALOGOS = {
  cr: 'assets/creatures.json',
  novos: 'assets/creatures-novos.json',
  outlandNovos: 'assets/creatures-outland-novos.json',
  overrides: 'assets/creatures-audit-overrides.json',
  itens: 'assets/items.json',
};
const STATS = ['hp', 'atk', 'def', 'spAtk', 'spDef', 'speed'];
const BASE = { hp: 'baseHp', atk: 'baseAtk', def: 'baseDef', spAtk: 'baseSpAtk', spDef: 'baseSpDef', speed: 'baseSpeed' };

let jogo = null; // { versao, mod, especies, precoItem }

// ---- carga: módulos e catálogo como o cliente monta ------------------------------------------
async function carregar(versao) {
  if (jogo?.versao === versao) return jogo;
  const t0 = performance.now();
  const base = new URL(`../../jogo/${encodeURIComponent(versao)}/`, self.location.href).href;
  const json = (rel, opcional) => fetch(base + rel).then((r) => {
    if (r.ok) return r.json();
    if (opcional) return null;
    throw new Error(`${rel}: HTTP ${r.status}`);
  }).catch((e) => { if (opcional) return null; throw e; });
  const pares = await Promise.all(Object.entries(MODULOS).map(async ([k, rel]) => [k, await import(base + rel)]));
  const mod = Object.fromEntries(pares);
  const [cr, novos, outlandNovos, overrides, itens] = await Promise.all([
    json(CATALOGOS.cr, false), json(CATALOGOS.novos, true), json(CATALOGOS.outlandNovos, true),
    json(CATALOGOS.overrides, true), json(CATALOGOS.itens, true),
  ]);
  const especies = montarEspecies(mod, { cr, novos, outlandNovos, overrides });
  const precoItem = new Map();
  for (const i of itens?.items ?? []) if (i?.name) precoItem.set(i.name, Number(i.npcPrice) || 0);
  jogo = { versao, mod, especies, precoItem, ms: Math.round(performance.now() - t0) };
  return jogo;
}

/** Stats-base, tipos e golpes de cada espécie, nos mesmos passos e na mesma ordem do cliente. */
function montarEspecies(mod, { cr, novos, outlandNovos, overrides }) {
  const lista = [...(cr?.creatures ?? []), ...(novos?.creatures ?? []), ...(outlandNovos?.creatures ?? [])];
  mod.outland.aplicarRemapOutlandLista(lista);
  for (const o of overrides?.overrides ?? []) {
    const c = lista.find((x) => x.pokeId === o.pokeId);
    if (!c) continue;
    for (const k of Object.values(BASE)) if (typeof o[k] === 'number') c[k] = o[k];
    if (Array.isArray(o.attacks)) c.attacks = o.attacks.map((a) => ({ ...a }));
  }
  mod.planilhas.aplicarGolpesDasPlanilhas((id) => lista.filter((c) => c.pokeId === id));
  mod.baseOutland.herdarBaseOutland(lista);
  mod.evolucoes.aplicarCadeiasTruncadas(lista);
  mod.evolucoes.normalizarEvolveLevel600(lista);
  const especies = new Map();
  for (const c of lista) {
    if (mod.outland.isEspelhoFantasmaPokeId(c.pokeId)) continue;
    for (const l of c.loot ?? []) l.name = mod.alias.resolverNomeItem(l.name);
    mod.especiais.injetarGolpesEspeciais(c);
    especies.set(c.pokeId, c);
  }
  mod.golpesOrre.herdarGolpesOrre(lista);
  for (const mega of mod.megas.criarEspeciesMega(lista)) especies.set(mega.pokeId, mega);
  return especies;
}

// ---- utilidades -----------------------------------------------------------------------------
const tiposDe = (esp) => [esp.type1, esp.type2].filter(Boolean);
const ivSpd = (iv) => Math.min(32, Math.max(1, Math.round(Number(iv) || 1)));
const comIvSpd = (ms, iv) => Math.max(REGRAS.pisoCdMs, ms - ivSpd(iv) * REGRAS.msPorIvSpd);
const temAoe = (pk) => { const v = pk?.tmAoe ?? pk?.tm_aoe; return v === true || v === 'true' || v === 1; };
const mediana = (xs) => { const s = xs.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const soma = (xs) => xs.reduce((a, b) => a + b, 0);

/** n valores tirados da distribuição medida (quantis), do mais perto ao mais longe. */
function quantis(valores, n) {
  const v = valores.slice().sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < n; i++) out.push(v[Math.min(v.length - 1, Math.floor(((i + 0.5) / n) * v.length))]);
  return out;
}

function dano(nivel, power, atk, def, stab, efet) {
  const b = ((2 * nivel / 5 + 2) * power * Math.max(1, atk) / Math.max(1, def)) / 50 + 2;
  return b * (stab ? REGRAS.stab : 1) * efet * REGRAS.randMedio;
}

function statsSelvagem(esp, nivel, iv = REGRAS.ivSelvagemMedio) {
  const o = {};
  for (const k of STATS) o[k] = ((esp[BASE[k]] ?? 0) + 2 * iv) * nivel / 100;
  return o;
}

/** Os bônus de XP que se multiplicam (Pokepédia > Níveis e XP). */
function bonusXp(eu, consts, mod, agora = Date.now()) {
  const tiposBoost = consts.tiposBoost ?? [];
  const e = eu ?? {};
  const base = {
    pokemon: mod.analyser.multXpPokemon?.(e, agora, tiposBoost) ?? 1,
    treinador: mod.analyser.multXpTreinador?.(e, agora, tiposBoost) ?? 1,
  };
  const itens = [];
  const loja = e.loja ?? {};
  const boost = (chave) => (agora < (loja.boosts?.[chave] ?? 0) ? tiposBoost.find((b) => b.chave === chave)?.mult ?? 1 : 1);
  if (agora < (loja.vipAte ?? 0)) itens.push({ nome: 'VIP', mult: mod.analyser.VIP_MULT_XP ?? 1.5, ambos: true, base: true });
  if (boost('xp') > 1) itens.push({ nome: 'XP Boost', mult: boost('xp'), treinador: true, base: true });
  if (boost('pokexp') > 1) itens.push({ nome: 'XP Boost Pokémon', mult: boost('pokexp'), pokemon: true, base: true });
  if (Number(e.guildBonusPct) > 0) itens.push({ nome: 'Ranking da guild', mult: 1 + e.guildBonusPct / 100, ambos: true, base: true });
  if (agora < (e.guild?.boostAte ?? 0)) {
    const jaNaConta = itens.filter((i) => i.base && (i.ambos || i.pokemon)).reduce((m, i) => m * i.mult, 1);
    const g = base.pokemon / jaNaConta;
    if (g > 1.0001) itens.push({ nome: 'Boost da Guild', mult: g, ambos: true, base: true });
  }
  const extra = { pokemon: 1, treinador: 1 };
  const somar = (it) => {
    itens.push(it);
    if (it.ambos || it.pokemon) extra.pokemon *= it.mult;
    if (it.ambos || it.treinador) extra.treinador *= it.mult;
  };
  if (e.twitch?.assistindo && Number(e.twitch.pctAtual) > 0) somar({ nome: 'Twitch', mult: 1 + e.twitch.pctAtual / 100, ambos: true });
  if (agora < (Number(e.kick?.bonus?.xp) || 0) && Number(e.kick?.pct) > 0) somar({ nome: 'Kick', mult: 1 + e.kick.pct / 100, ambos: true });
  const ev = e.evento;
  if (ev && agora < (ev.terminaEm ?? 0)) {
    const tr = Number(ev.xpTreinadorPct) || 0, pk = Number(ev.xpPokemonPct) || 0;
    if (tr && tr === pk) somar({ nome: 'Evento', mult: 1 + tr / 100, ambos: true });
    else {
      if (pk) somar({ nome: 'Evento (pokémon)', mult: 1 + pk / 100, pokemon: true });
      if (tr) somar({ nome: 'Evento (treinador)', mult: 1 + tr / 100, treinador: true });
    }
  }
  const at = loja.atrasados;
  if (at && Number(at.mult) > 1 && (e.level ?? 0) < (Number(at.alvo) || 0)) somar({ nome: 'Atrasados', mult: Number(at.mult), ambos: true });
  return { pokemon: base.pokemon * extra.pokemon, treinador: base.treinador * extra.treinador, itens };
}

/** Golpes liberados até o nível, com o desconto do Speed, mais o TM elemental. */
function golpesDe(pk, esp, mod) {
  const cd = (ms) => mod.cooldown.cooldownGolpeComSpeed(ms, esp.baseSpeed, pk.ivs?.speed);
  const lista = (esp.attacks ?? []).filter((a) => (a.learnLevel ?? 1) <= (pk.level ?? 1)).map((a) => ({ ...a, cooldownMs: cd(a.cooldownMs) }));
  if (pk.tmElemental && mod.tm?.golpeTmElemental) {
    const tm = mod.tm.golpeTmElemental(pk.tmElemental);
    lista.push({ ...tm, cooldownMs: cd(tm.cooldownMs) });
  }
  return lista;
}

function fazEfetividade(consts, mod) {
  const tabela = consts.tabelaTipos ?? {};
  const fator = consts.ampliacaoHunt ?? 1.5;
  const memo = new Map();
  return (atq, d1, d2) => {
    const k = atq + '|' + d1 + '|' + d2;
    if (!memo.has(k)) memo.set(k, mod.analyser.efetividadeHunt(atq, d1, d2 ?? null, tabela, fator));
    return memo.get(k);
  };
}

/** A Investida usa o 1º tipo; só o 2º se o alvo for imune ao 1º. */
function tipoInvestida(tipos, ef, alvo) {
  if (tipos[1] && ef(tipos[0], alvo[0], alvo[1]) === 0) return tipos[1];
  return tipos[0];
}

/**
 * Segundos de luta por abate: a cada ataque, o golpe pronto de maior dano; sem nenhum pronto, a
 * Investida; todo ataque ocupa o intervalo global. HP do selvagem rola por abate (IV 1–32) e as
 * recargas correm no tempo morto entre um abate e outro.
 */
function lutaPorAbate(golpes, inv, gapS, hps, mortoS) {
  const ordem = golpes.map((_, i) => i).filter((i) => golpes[i].d > 0).sort((a, b) => golpes[b].d - golpes[a].d);
  const pronto = golpes.map(() => 0);
  let proxInv = 0, t = 0, luta = 0;
  for (const hp of hps) {
    let feito = 0, ini = t, ultimo = t, n = 0;
    while (feito < hp) {
      if (++n > RITMO.maxAtaquesPorAbate) return Infinity;
      const j = ordem.find((k) => pronto[k] <= t);
      if (j !== undefined) {
        feito += golpes[j].d; pronto[j] = t + golpes[j].cdS; ultimo = t; t += gapS;
      } else if (inv.d > 0 && proxInv <= t) {
        feito += inv.d; proxInv = t + inv.cdS; ultimo = t; t += gapS;
      } else {
        let prox = inv.d > 0 ? proxInv : Infinity;
        for (const k of ordem) if (pronto[k] < prox) prox = pronto[k];
        if (!Number.isFinite(prox)) return Infinity;
        t = Math.max(t, prox);
      }
    }
    luta += ultimo - ini;
    t = ultimo + mortoS;
  }
  return luta / hps.length;
}

/** O que o selvagem faz com você: dano por segundo, golpe médio e o pior golpe. */
function ameaca(esp, nivel, pk, ef, consts) {
  const st = statsSelvagem(esp, nivel);
  const tEsp = tiposDe(esp);
  const mult = consts.multDanoSelvagem ?? 1.8;
  const danos = (esp.attacks ?? []).filter((a) => (a.learnLevel ?? 1) <= nivel).map((a) => {
    const fis = a.category !== 'SPECIAL';
    return dano(nivel, Math.max(REGRAS.poderMinimo, a.power), fis ? st.atk : st.spAtk, fis ? pk.stats.def : pk.stats.spDef,
      tEsp.includes(a.type), ef(a.type, pk.tipos[0], pk.tipos[1]));
  });
  const ti = tipoInvestida(tEsp, ef, pk.tipos);
  const inv = dano(nivel, REGRAS.investidaPower, st.atk, pk.stats.def, true, ef(ti, pk.tipos[0], pk.tipos[1]));
  const media = danos.length ? (soma(danos) / danos.length) * 0.92 + inv * 0.08 : inv;
  return { dps: media * mult / REGRAS.gapSelvagemS, hitMedio: media * mult, hitMax: Math.max(inv, ...danos) / REGRAS.randMedio * mult };
}

/** Acima do nível 150 o servidor repõe por slot: é o teto físico da hunt. */
function tetoReposicao(n, h) {
  if ((h.nivel ?? 0) <= RITMO.nivelOnda) return Infinity;
  const sinnoh = h.regiao === 'sinnoh' || String(h.slug).endsWith('_sinnoh');
  return n * 3600 / (sinnoh ? RITMO.slotSinnohS : RITMO.slotOutrasS);
}

/** Abates/h um a um: fila de chegada dos spawns, caminhada e reposição. */
function abatesH(dists, cicloS, h) {
  const d = dists.slice().sort((a, b) => a - b);
  const caminho = (soma(d) / d.length) * RITMO.heroiSPorTile * RITMO.fBusca;
  const fEncontro = RITMO.selvagemSPorTile * RITMO.heroiSPorTile / (RITMO.selvagemSPorTile + RITMO.heroiSPorTile);
  let t = 0;
  for (const x of d) t = Math.max(t + cicloS + caminho, x * fEncontro);
  return Math.min(3600 / cicloS, d.length * 3600 / (t + RITMO.gapOndaS), tetoReposicao(d.length, h));
}

/** Com TM AoE: o limite passa a ser a chegada dos spawns ao quadrado e a reposição. */
function limiteAoe(dists, h) {
  const d = dists.slice().sort((a, b) => a - b);
  const dRitmo = d.length > 1 ? d[d.length - 2] : d[0];
  const raio = (REGRAS.ladoTmAoe - 1) / 2;
  const chegada = Math.max(0, dRitmo - raio) * RITMO.selvagemSPorTile;
  return Math.min(d.length * 3600 / (chegada + RITMO.gapOndaS), tetoReposicao(d.length, h));
}

function simular(h, pk, golpesPk, ef, ctx, op) {
  const lista = (h.especies ?? []).map((e) => ({ esp: jogo.especies.get(e.pokeId), pontos: Number(e.pontos) || 0 })).filter((e) => e.esp && e.pontos > 0);
  const total = soma(lista.map((e) => e.pontos));
  if (!total) return null;
  const nivel = h.nivel ?? 1;
  const n = Math.max(1, Math.min(RITMO.maxSpawns, Math.round(total) || RITMO.spawnsPadrao));
  const medida = ctx.geo?.[h.slug];
  const dists = medida?.length ? quantis(medida, n) : Array(n).fill(RITMO.distPadrao);
  const mortoS = RITMO.msOndaS / dists.length + RITMO.retargetS;
  const gapS = comIvSpd(REGRAS.gapJogadorMs, pk.ivs?.speed) / 1000;
  const cdInvS = comIvSpd(REGRAS.investidaCdMs, pk.ivs?.speed) / 1000;
  const multHp = ctx.consts.multHpSelvagem ?? 5;
  const { mod, precoItem } = jogo;

  let ttk = 0, dps = 0, hitMax = 0, hitMedio = 0, xpKill = 0, ouroKill = 0, lootKill = 0, efMedia = 0;
  let melhor = null, melhorDano = -1;
  const alvos = [];
  for (const { esp, pontos } of lista) {
    const w = pontos / total;
    const tA = tiposDe(esp);
    const st = statsSelvagem(esp, nivel);
    const golpes = golpesPk.map((g) => {
      const fis = g.category !== 'SPECIAL';
      const d = dano(pk.level, Math.max(REGRAS.poderMinimo, g.power), fis ? pk.stats.atk : pk.stats.spAtk, fis ? st.def : st.spDef,
        pk.tipos.includes(g.type), ef(g.type, tA[0], tA[1]));
      return { d, cdS: g.cooldownMs / 1000, g };
    });
    for (const g of golpes) if (g.d * w > melhorDano) { melhorDano = g.d * w; melhor = g.g; }
    const ti = tipoInvestida(pk.tipos, ef, tA);
    const inv = { d: dano(pk.level, REGRAS.investidaPower, pk.stats.atk, st.def, true, ef(ti, tA[0], tA[1])), cdS: cdInvS };
    const hps = [];
    for (let k = 0; k < RITMO.amostrasHp; k++) {
      const iv = 1 + Math.floor(k * 32 / RITMO.amostrasHp + 0.5);
      hps.push(Math.max(REGRAS.hpCombateMin, Math.round(((esp.baseHp ?? 0) + 2 * iv) * nivel / 100 * REGRAS.hpCombateMult)) * multHp);
    }
    const s = lutaPorAbate(golpes, inv, gapS, hps, mortoS);
    if (!Number.isFinite(s)) { ttk = Infinity; break; }
    ttk += w * s;
    const a = ameaca(esp, nivel, pk, ef, ctx.consts);
    dps += w * a.dps; hitMedio += w * a.hitMedio; hitMax = Math.max(hitMax, a.hitMax);
    xpKill += w * mod.recompensa.xpPorDerrota(h, nivel, esp);
    ouroKill += w * mod.recompensa.ouroPorDerrotaHunt(h, nivel, esp);
    for (const l of esp.loot ?? []) {
      const preco = ctx.precoNosso?.[l.name] ?? precoItem.get(l.name) ?? 0;
      if (!preco || !(l.chance > 0)) continue;
      lootKill += w * (l.chance / 100000) * (((l.minCount ?? 1) + (l.maxCount ?? 1)) / 2) * preco;
    }
    alvos.push({ w, tA });
  }
  for (const { w, tA } of alvos) efMedia += w * (melhor ? ef(melhor.type, tA[0], tA[1]) : 1);

  const base = {
    slug: h.slug, nome: h.nome, nivel, regiao: h.regiao ?? h.area ?? null,
    liberada: (ctx.eu?.level ?? Infinity) >= nivel,
    geoMedida: !!medida?.length,
    melhorGolpe: melhor ? { nome: melhor.name, tipo: melhor.type } : null,
    efetividade: efMedia,
  };
  if (!Number.isFinite(ttk)) return { ...base, inviavel: true, motivo: 'não mata', xpPokemonH: 0, xpTreinadorH: 0, ouroH: 0, kph: 0 };

  const cicloS = Math.max(ttk + RITMO.retargetS, RITMO.cicloMinS);
  let kph = abatesH(dists, cicloS, h);
  let aoe = false, engajados = 1;
  if (op.aoe) {
    const kA = Math.min(3600 * op.alvosAoe / cicloS, limiteAoe(dists, h));
    if (kA > kph) { kph = kA; aoe = true; }
    engajados = Math.min(RITMO.aoeMaxEngajados, 1 + kph * ttk / 3600); // lei de Little
  }
  // Com poção automática só morre quem leva de uma vez mais que o HP inteiro; sem poção, quando o
  // dano somado dos abates passa do HP.
  const hpPk = pk.maxHp ?? Math.max(REGRAS.hpCombateMin, Math.round(pk.stats.hp * REGRAS.hpCombateMult));
  const danoPorAbate = dps * engajados * ttk;
  const hitPior = hitMax + (engajados - 1) * hitMedio;
  const umHit = hitPior >= hpPk;
  const abatesPorVida = op.comPocao ? (umHit ? hpPk / hitPior : 999) : hpPk / Math.max(1e-6, danoPorAbate);
  const dMed = soma(dists) / dists.length;
  const tempoMorte = RITMO.respawnS + dMed * RITMO.heroiSPorTile;
  const vidaS = abatesPorVida * (kph > 0 ? 3600 / kph : 0);
  const uptime = vidaS / (vidaS + tempoMorte);
  const mortesH = abatesPorVida >= 999 ? 0 : 3600 / (vidaS + tempoMorte);
  const kphEf = kph * uptime;
  return {
    ...base, inviavel: false,
    ttk, kph: kphEf, kphModelo: kphEf, kphMedido: ctx.ritmo?.[h.slug] ?? null, mortesH, umHit, abatesPorVida,
    hitPct: hitPior / hpPk, danoPorAbate, aoe, engajados,
    _cicloS: cicloS, _limiteAoe: limiteAoe(dists, h),
    xpPokemonH: kphEf * xpKill * (op.bonus?.pokemon ?? 1),
    xpTreinadorH: kphEf * xpKill * (op.bonus?.treinador ?? 1),
    ouroH: kphEf * (ouroKill + lootKill),
    ouroKill, lootKill, xpKill,
  };
}

/** Alvos por golpe do AoE, recalibrados com as hunts em que você caçou 10+ min com ele. */
function calibrarAoe(pk, golpes, ef, ctx, op) {
  if (!ctx.ritmo) return null;
  const obs = [];
  const semRitmo = { ...ctx, ritmo: null };
  for (const h of ctx.hunts ?? []) {
    const medido = ctx.ritmo[h.slug];
    if (!medido) continue;
    const r = simular(h, pk, golpes, ef, semRitmo, { ...op, alvosAoe: RITMO.aoeAlvosPorGolpe });
    if (!r || r.inviavel || medido >= 0.9 * r._limiteAoe) continue;
    obs.push(medido * r._cicloS / 3600);
  }
  if (!obs.length) return null;
  return { alvos: Math.min(RITMO.aoeAlvosMax, Math.max(RITMO.aoeAlvosMin, mediana(obs))), hunts: obs.length };
}

/**
 * Todas as hunts para o pokémon `pk`. ctx: { hunts, consts, eu, geo: {slug: dists[]},
 * ritmo: {slug: abates/h}, precoNosso: {nome: preço} }. op: { comPocao, ordem }.
 */
function analisar(pkIn, ctx, opIn = {}) {
  const t0 = performance.now();
  const op = { comPocao: true, ordem: 'xp', ...opIn };
  const esp = jogo.especies.get(pkIn.speciesId);
  if (!esp) throw new Error(`espécie ${pkIn.speciesId} (${pkIn.nome}) não está no catálogo do jogo`);
  if (!pkIn.stats) throw new Error('o jogo não mandou os stats deste pokémon');
  const pk = { ...pkIn, level: pkIn.level ?? 1, tipos: pkIn.tipos?.length ? pkIn.tipos : tiposDe(esp) };
  const ef = fazEfetividade(ctx.consts, jogo.mod);
  const golpes = golpesDe(pk, esp, jogo.mod);
  op.aoe = temAoe(pk);
  op.bonus = bonusXp(ctx.eu, ctx.consts, jogo.mod);
  const cal = op.aoe ? calibrarAoe(pk, golpes, ef, ctx, op) : null;
  op.alvosAoe = cal?.alvos ?? RITMO.aoeAlvosPorGolpe;
  const linhas = [];
  for (const h of ctx.hunts ?? []) {
    const r = simular(h, pk, golpes, ef, ctx, op);
    if (r) linhas.push(r);
  }
  const k = op.ordem === 'ouro' ? 'ouroH' : 'xpPokemonH';
  linhas.sort((a, b) => (b[k] - a[k]) || (a.nivel - b.nivel));
  return {
    versao: jogo.versao,
    especie: esp.name ?? esp.nome ?? null,
    golpes: golpes.map((g) => ({ nome: g.name, tipo: g.type, power: g.power, cd: g.cooldownMs })),
    aoe: op.aoe ? { alvosPorGolpe: op.alvosAoe, calibradoEm: cal?.hunts ?? 0 } : null,
    bonusXp: op.bonus,
    comPocao: op.comPocao,
    linhas,
    ms: Math.round(performance.now() - t0),
  };
}

self.onmessage = async (ev) => {
  const m = ev.data || {};
  try {
    if (m.t === 'carregar') {
      const j = await carregar(m.versao);
      self.postMessage({ t: 'pronto', versao: j.versao, ms: j.ms, especies: j.especies.size });
    } else if (m.t === 'analisar') {
      if (!jogo) throw new Error('dados do jogo ainda carregando');
      self.postMessage({ t: 'resultado', id: m.id, r: analisar(m.pk, m.ctx, m.op) });
    }
  } catch (e) {
    self.postMessage({ t: 'erro', id: m.id ?? null, erro: String(e?.message || e) });
  }
};
