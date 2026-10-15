// Interface do PokeIdle Multi: grade de contas, barra de automação por conta, Twitch.
// O cálculo do "Onde caçar" é o mesmo da extensão (vendor/hunts.js = sidepanel/hunts.js).
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const curto = (n) => PieFmt.curto(n);
const num = (n) => PieFmt.num(n);
const n1 = (x) => (Math.round(x * 10) / 10).toString().replace('.', ',');

const ICON = {
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  max: '<svg viewBox="0 0 24 24"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
  min: '<svg viewBox="0 0 24 24"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>',
  tw: '<svg viewBox="0 0 24 24"><path d="M4 3h17v11l-4 4h-4l-3 3v-3H4z"/><path d="M15 8v4M11 8v4"/></svg>',
  kk: '<svg viewBox="0 0 24 24"><path d="M5 3h5v6h2V6h3V3h4v6h-3v3h-2v0h2v3h3v6h-4v-3h-3v-3h-2v6H5z"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  car: '<svg class="car" viewBox="0 0 12 12"><path d="M2 8l4-4 4 4"/></svg>',
  power: '<svg viewBox="0 0 24 24"><path d="M12 3v8"/><path d="M6.3 6.6a8 8 0 1 0 11.4 0"/></svg>',
};
// Troca de mapa: sempre o 1º lugar, risco alto (aceita Segura e Tranquila), XP do pokémon.
const AUTO_HUNT = { criterio: 'pk', riscoMax: 'alto', ganhoMin: 0 };
const ID_BOLA = 'app-bola', ID_POCAO = 'app-pocao';

let N = 4;
const S = [];             // por conta: { snap, catalog, medidas, cfg, res, top, alerta, rAtual, calc }
let TW = { temClientId: false, contas: [] };
let foco = null;          // conta expandida
let painel = null;        // { i, k: 'bola'|'poc'|'mapa' }
let menu = null;          // conta com a engrenagem aberta
let twHover = null;       // conta com o overlay da Twitch (ou da Kick) aberto
let popTipo = 'tw';       // 'tw' = Twitch, 'kk' = Kick
let KK = { contas: [] };  // estado da Kick (processo principal)
let kkVer = null;         // live da Kick aberta grande: { i, slug }
let KKSOM = {};           // "conta|canal" -> está tocando som agora
let ZOOMKK = 1;           // zoom do player grande da Kick
let MODO = null;          // 'normal' | 'eco' | 'ultra' (vale para todas as contas); null = nunca escolhido
let ATT = null;           // estado da atualização automática (processo principal)

function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), 1800); }

// ------------------------------------------------------------------ config (mesmo formato da extensão)
function cfgDe(i) {
  const c = pieMergeCfg(S[i].cfg);
  c.limits = { goldPerHour: 0, goldReserve: 0 };
  c.autoHunt = { ...c.autoHunt, ...AUTO_HUNT };
  return c;
}
function regra(i, id) { return cfgDe(i).rules.find((r) => r.id === id) || null; }
function salvarCfg(i, c) {
  c.autoHunt = { ...c.autoHunt, ...AUTO_HUNT };
  S[i].cfg = c;
  app.setCfg(i, c);
  renderSlot(i);
  if (MODO === 'ultra') renderUltra();
}
function mudarRegra(i, id, kind, patch) {
  const c = cfgDe(i);
  let r = c.rules.find((x) => x.id === id);
  if (!r) { r = { id, kind, refId: null, label: '', min: 100, qty: 100, enabled: false }; c.rules.push(r); }
  Object.assign(r, patch);
  if (r.refId == null) { const o = opcoes(i, kind)[0]; if (o) { r.refId = o.id; r.label = o.nome; } }
  salvarCfg(i, c);
}
function opcoes(i, kind) {
  const cat = S[i].catalog;
  if (!cat) return [];
  if (kind === 'ball') return (cat.bolas || []).filter((b) => b.compravel && b.priceGold > 0).map((b) => ({ id: b.id, nome: b.nome, preco: b.priceGold }));
  return (cat.compraveis || []).map((x) => ({ id: x.itemId, nome: cat.items?.[x.itemId]?.name || 'Item ' + x.itemId, preco: x.preco }));
}
function estoque(i, kind, id) {
  const s = S[i].snap;
  if (!s || id == null) return null;
  return Number((kind === 'ball' ? s.balls : s.items)?.[id]) || 0;
}

// ------------------------------------------------------------------ cálculo (Onde caçar)
// Motor igual ao da extensão oficial do jogo, num Web Worker (ui/motor/motor.js) com os módulos e
// catálogos da versão do jogo no ar (baixados pelo app). Ver lib/jogo.js.
let JOGO = null;                 // { versao, pronto, erro } (processo principal)
let MOTOR_V = null;              // versão carregada no worker
let MOTOR_ERRO = null;
const motor = new Worker('motor/motor.js');
const pedidos = new Map();
let pedidoId = 0;
motor.onmessage = (ev) => {
  const m = ev.data || {};
  if (m.t === 'pronto') { MOTOR_V = m.versao; MOTOR_ERRO = null; for (let i = 0; i < N; i++) { if (S[i]) S[i].chave = ''; agendarCalculo(i); } }
  else if (m.t === 'erro' && m.id == null) { MOTOR_ERRO = m.erro; for (let i = 0; i < N; i++) renderSlot(i); }
  if (m.id != null && pedidos.has(m.id)) { const p = pedidos.get(m.id); pedidos.delete(m.id); m.t === 'erro' ? p.err(new Error(m.erro)) : p.ok(m.r); }
};
motor.onerror = (e) => { MOTOR_ERRO = e.message || 'falha no motor'; };
function carregarMotor() {
  if (JOGO?.pronto && JOGO.versao && JOGO.versao !== MOTOR_V) motor.postMessage({ t: 'carregar', versao: JOGO.versao });
}
const analisarNoMotor = (pk, ctx, op) => new Promise((ok, err) => { const id = ++pedidoId; pedidos.set(id, { ok, err }); motor.postMessage({ t: 'analisar', id, pk, ctx, op }); });

// Geometria das ondas cheias: a de todas as contas junta (o mapa é o mesmo para todo mundo).
function geoJunta() {
  const out = {};
  for (const s of S) for (const [slug, h] of Object.entries(s?.geo?.hunts ?? {})) {
    if (h.amostras?.length) (out[slug] ??= []).push(...h.amostras.flat());
  }
  return out;
}
const chaveRitmo = (pk) => `${pk.id}${pk.tmAoe === true || pk.tmAoe === 'true' || pk.tmAoe === 1 ? ':aoe' : ''}`;
function ritmoDe(s, pk) {
  const out = {}, ch = chaveRitmo(pk);
  for (const [slug, h] of Object.entries(s?.geo?.hunts ?? {})) {
    const r = h.ritmo?.[ch];
    if (r && r.seg >= 600) out[slug] = (r.abates * 3600) / r.seg;
  }
  return out;
}
// Risco como a extensão oficial: ☠ (1 golpe passa do HP ou ≥0,5 morte/h), ⚠ (pior golpe ≥ 50% do HP), ✓.
function riscoDe(l) {
  if (l.umHit) return { nivel: 'perigo', txt: '☠ 1 hit' };
  if (l.mortesH >= 0.5) return { nivel: 'perigo', txt: `☠ ${n1(l.mortesH)}/h` };
  const pct = Math.round(l.hitPct * 100);
  return pct >= 50 ? { nivel: 'médio', txt: `⚠ ${pct}%` } : { nivel: 'baixo', txt: `✓ ${pct}%` };
}

async function calcular(i) {
  const s = S[i];
  const snap = s.snap, catalog = s.catalog;
  const pk = (snap?.team ?? []).find((p) => p.id === snap?.activeId);
  if (!pk || !catalog?.combate || !snap?.ready) { s.res = null; s.top = []; s.alerta = null; s.rAtual = null; s.pk = pk || null; return; }
  if (!MOTOR_V) { s.pk = pk; return; }
  // Já calculando: refaz quando terminar (senão um catálogo/ficha que chegou no meio se perde).
  if (s.calc) { s.denovo = true; return; }
  s.calc = true;
  s.pk = pk;
  try {
    const geo = geoJunta(), ritmo = ritmoDe(s, pk);
    const comPocao = !!snap.gameAuto?.autoPotion;
    // Recalcula só quando muda o que entra na conta (como a oficial), não a cada golpe recebido.
    const chave = JSON.stringify([MOTOR_V, pk.id, pk.level, pk.tmElemental, pk.tmAoe, pk.stats, pk.maxHp, snap.euXp, comPocao, catalog.at, Object.keys(geo).length, Object.keys(ritmo).length]);
    if (chave !== s.chave || !s.bruto) {
      const precoNosso = Object.fromEntries((catalog.itensNossos ?? []).filter((x) => x.name && x.npcPrice > 0).map((x) => [x.name, x.npcPrice]));
      const c = catalog.combate;
      const ctx = {
        hunts: catalog.hunts ?? [],
        consts: { tabelaTipos: c.tabelaTipos, ampliacaoHunt: c.ampliacaoHunt, multHpSelvagem: c.multHpSelvagem, multDanoSelvagem: c.multDanoSelvagem, tiposBoost: catalog.tiposBoost ?? [] },
        eu: snap.euXp ?? { level: snap.level },
        geo, ritmo, precoNosso,
      };
      s.bruto = await analisarNoMotor(pk, ctx, { comPocao, ordem: 'xp' });
      s.chave = chave;
    }
    const r = s.bruto;
    const lista = r.linhas.filter((l) => l.liberada && !l.inviavel).map((l) => ({
      hunt: { slug: l.slug, nome: l.nome, nivel: l.nivel, area: l.regiao },
      xpH: Math.round(l.xpPokemonH), xpTrH: Math.round(l.xpTreinadorH), ouroH: Math.round(l.ouroH),
      killsH: Math.round(l.kph), killsPorVida: l.abatesPorVida, ttk: l.ttk, mortesH: l.mortesH,
      risco: riscoDe(l), aoe: l.aoe, geoMedida: l.geoMedida, kphMedido: l.kphMedido, melhorGolpe: l.melhorGolpe,
    }));
    s.pk = pk;
    s.res = { lista, total: r.linhas.length, bonusXp: r.bonusXp, aoe: r.aoe, comPocao: r.comPocao, versao: r.versao, ms: r.ms };
    // Top 3: a ordem do motor (XP do pokémon), sem as perigosas (☠) e as que ele demora a matar.
    s.top = lista.filter((l) => l.risco.nivel !== 'perigo' && l.killsPorVida >= 5 && l.ttk <= 60).slice(0, 3);
    s.rAtual = lista.find((l) => l.hunt.slug === snap.huntSlug) || null;
    s.alerta = PieHunt.decidir(lista, snap.huntSlug, AUTO_HUNT);
    trocaAutomatica(i);
  } catch (e) { console.error(e); s.res = { erro: 'Não consegui calcular: ' + e.message }; s.top = []; s.alerta = null; }
  finally {
    s.calc = false;
    if (s.denovo) { s.denovo = false; agendarCalculo(i); }
  }
}

// Troca de mapa automática (mesmas regras de antes): só com a chave da conta e a do Mapa ligadas,
// nunca em casa/arena/místico nem na cidade com hunt escolhida, 1 min depois de uma troca e no
// máximo um pedido a cada 15 s. O jogo espera sair de combate para trocar.
const ESPERA_ENTRE_TROCAS = 60 * 1000;
function trocaAutomatica(i) {
  const s = S[i], snap = s.snap, c = cfgDe(i);
  if (!c.enabled || !c.autoHunt?.enabled || !snap?.ready || !snap.connected) return;
  if (snap.emCasa || snap.arena || snap.mistico) return;
  if (snap.huntSlug && snap.noCentro) return;
  const t = (s.troca ??= { ultima: 0, pedido: 0, slug: null });
  if (t.slug && snap.huntSlug === t.slug) { t.ultima = Date.now(); t.slug = null; }
  if (!s.alerta) return;
  if (Date.now() - t.ultima < ESPERA_ENTRE_TROCAS || Date.now() - t.pedido < 15000) return;
  t.pedido = Date.now(); t.slug = s.alerta.melhor.hunt.slug;
  app.huntAuto(i, t.slug);
}
let calcTimer = {};
function agendarCalculo(i) {
  if (calcTimer[i]) return;
  calcTimer[i] = setTimeout(async () => { calcTimer[i] = null; await calcular(i); renderSlot(i); renderTopo(); }, 400);
}

// ------------------------------------------------------------------ montagem
function montar() {
  const g = $('#grid');
  g.innerHTML = Array.from({ length: N }, (_, i) => `
    <section class="slot" data-slot="${i}">
      <div class="head" data-dbl="${i}" draggable="true" title="Arraste para trocar de lugar · duplo clique expande"></div>
      <div class="game" data-game="${i}"></div>
      <div class="bar"></div>
    </section>`).join('');
  const ro = new ResizeObserver(() => enviarLayout());
  document.querySelectorAll('.game').forEach((e) => ro.observe(e));
  window.addEventListener('resize', () => { enviarLayout(); desenharDivisores(); });
  ro.observe($('#grid'));
}
function enviarLayout() {
  const rects = [];
  document.querySelectorAll('.slot').forEach((sl) => {
    const i = +sl.dataset.slot;
    // Conta expandida (ou live da Kick aberta): as outras saem da tela e viram só um rótulo na
    // faixa de baixo. O jogo delas continua rodando por trás (como no Ultra eco), só não é desenhado.
    if (sl.getClientRects().length === 0) return;
    const g = $('.game', sl), mini = false;
    if (!g) return;
    const r = g.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    rects.push({ slot: i, x: r.left, y: r.top, width: r.width, height: r.height, mini });
  });
  if (kkVer) {
    // a live aberta "cresce" no lugar da grade (o MESMO player: o que você mudar nela continua)
    const tela = $('#kktela');
    const r = tela ? tela.getBoundingClientRect() : { width: 0 };
    if (r.width > 2) rects.push({ kick: kkVer.i, canal: kkVer.slug, grande: true, x: r.left, y: r.top, width: r.width, height: r.height });
  }
  document.querySelectorAll('.kmini[data-kmini]').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (kkVer && +e.dataset.kmini === kkVer.i && e.dataset.kcanal === kkVer.slug) return;
    if (r.width > 2 && e.dataset.kcanal) rects.push({ kick: +e.dataset.kmini, canal: e.dataset.kcanal, x: r.left, y: r.top, width: r.width, height: r.height });
  });
  app.layout(rects);
}

function nomeConta(i) { const s = S[i].snap; const n = s?.nick || S[i].nickSalvo; return n ? esc(n) : `Conta ${i + 1}`; }
function estadoPonto(i) {
  const s = S[i].snap;
  if (!s?.ready || !s.connected) return '';
  if (S[i].alerta) return 'bad';
  if (s.huntSlug && !s.noCentro) return 'hunt';
  return 'fight';
}
function nomeHunt(i, slug) { return S[i].catalog?.hunts?.find((h) => h.slug === slug)?.nome || slug || ''; }
// XP/h do pokémon na hunt atual: o REAL (XP que ele ganhou nos últimos minutos) quando já deu para
// medir; senão a estimativa do Onde caçar.
function xphReal(i) {
  const s = S[i], m = s.snap?.xpMedido;
  return m && m.slug === s.snap?.huntSlug && m.xpH != null ? m.xpH : null;
}
function xphAgora(i) { return xphReal(i) ?? S[i].rAtual?.xpH ?? null; }

// ---- cabeçalho
function headHTML(i) {
  const s = S[i], snap = s.snap, tw = TW.contas[i] || {};
  if (s.desligada) return `
    <span class="dot"></span>
    <span class="nome">${nomeConta(i)}</span>
    <span class="hunt-i">desligada · não gasta RAM</span>
    <span class="sp"></span>
    <button class="ib pw off" data-power="${i}" title="Ligar esta conta">${ICON.power}</button>`;
  const dentro = tw.dentro?.length || 0;
  let info = 'carregando o jogo…';
  if (snap?.ready && snap.connected) {
    const x = xphAgora(i);
    const real = xphReal(i) != null;
    const tit = real ? 'XP/h REAL do pokémon: o XP que ele ganhou aqui nos últimos minutos' : 'Estimativa do Onde caçar (ainda medindo o real; leva uns 2 min caçando)';
    info = snap.huntSlug ? `${esc(nomeHunt(i, snap.huntSlug))}${x != null ? ` · <span title="${tit}">${real ? '' : '≈'}<b>${curto(x)}</b> XP/h ${real ? 'real' : 'estimado'}</span>` : ''}` : 'fora de hunt';
  } else if (snap && snap.ready === false && snap.connected === false) info = 'entre na conta no jogo abaixo';
  return `
    <span class="dot ${estadoPonto(i)}"></span>
    <span class="nome">${nomeConta(i)}${snap?.level ? `<small>Nv ${num(snap.level)}</small>` : ''}</span>
    <span class="hunt-i">${info}</span>
    <span class="sp"></span>
    <span class="tw-wrap" data-twwrap="${i}">
      <button class="ib tw ${tw.login && dentro ? 'on' : 'off'}" data-twbtn="${i}" title="Twitch">${ICON.tw}</button>
    </span>
    <span class="tw-wrap" data-kkwrap="${i}">${kickBotao(i)}</span>
    <button class="ib pw" data-power="${i}" title="Desligar esta conta (fecha o jogo dela e libera a RAM)">${ICON.power}</button>
    <button class="ib" data-gear="${i}" title="Conta">${ICON.gear}</button>
    <button class="ib" data-max="${i}" title="${foco === i ? 'Reduzir' : 'Expandir'}">${foco === i ? ICON.min : ICON.max}</button>`;
}

function twitchHTML(i) {
  const tw = TW.contas[i] || {}, jogo = S[i].snap?.twitch;
  const sw = `<div class="auto ${tw.login ? '' : 'off-box'}"><label class="sw" style="flex:1;font-weight:500"><span>Entrar sozinho nas lives</span><input type="checkbox" ${tw.auto ? 'checked' : ''} data-twauto="${i}"><span class="tg"></span></label></div>`;
  if (!tw.login) return `<h4>Lives oficiais</h4><div class="live"><span class="st">Twitch não vinculada. Use a engrenagem.</span></div>${sw}`;
  let aviso = '';
  if (jogo && !jogo.login) aviso = '<div class="aviso">Esta conta do jogo ainda não tem Twitch vinculada (no jogo: Twitch → Vincular). Sem isso o bônus não conta.</div>';
  else if (jogo?.login && jogo.login.toLowerCase() !== tw.login.toLowerCase()) aviso = `<div class="aviso">No jogo está vinculada <b>${esc(jogo.login)}</b>, aqui é <b>${esc(tw.login)}</b>. O bônus só conta se for a mesma.</div>`;
  const erro = tw.erro ? `<div class="erro">${esc(tw.erro)}</div>` : '';
  if (!jogo) return `<h4>Lives oficiais</h4><div class="live"><span class="st">Esperando o jogo mandar a lista…</span></div>${erro}${sw}`;
  const confirm = new Set((jogo.assistindoEm || []).map((x) => x.toLowerCase()));
  const irc = new Set(tw.dentro || []);
  const fixos = new Set(tw.canais || []);
  const bonus = new Map((jogo.oficiais || []).map((o) => [o.login.toLowerCase(), o.bonus]));
  const lives = (jogo.lives || []).filter((l) => bonus.has(l.login.toLowerCase()));
  const linhas = lives.map((l, k) => {
    const c = l.login.toLowerCase();
    const st = confirm.has(c) ? '<span class="st ok">✓ contando</span>' : irc.has(c) ? '<span class="st irc">no chat</span>' : '<span class="st">fora</span>';
    const b = bonus.get(c) === false ? '<span class="st">sem bônus</span>' : `<span class="bn">+${k === 0 ? n1(jogo.pct || 15) : n1(jogo.extra || 2.5)}%</span>`;
    return `<div class="live ${fixos.has(c) ? 'fixo' : ''}" data-twcanal="${i}|${esc(c)}" title="Clique para ${fixos.has(c) ? 'soltar' : 'fixar'} este canal"><span class="l"></span><span class="nm">${esc(l.nome || l.login)}</span>${b}${st}</div>`;
  }).join('');
  return `<h4>Lives oficiais abertas · ${tw.conectado ? 'chat conectado' : 'chat desconectado'}</h4>${linhas || '<div class="live"><span class="st">Nenhuma live oficial no ar agora.</span></div>'}${aviso}${erro}${sw}`;
}

// ---- Kick
const NOME_TIPO = { xp: 'XP', captura: 'Captura', shiny: 'Shiny' };
function tempoRestante(ms) {
  if (ms <= 0) return '';
  const h = Math.floor(ms / 3600000), m = Math.round((ms % 3600000) / 60000);
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}
function kickBotao(i) {
  const k = KK.contas[i] || {};
  return `<button class="ib kk ${k.user && k.ligado ? 'on' : 'off'}" data-kkbtn="${i}" title="Kick">${ICON.kk}</button>`;
}
function custoTipo(i, tipo) { return S[i].snap?.kick?.recompensas?.find((r) => r.tipo === tipo)?.custo || 0; }
function kickHTML(i) {
  const k = KK.contas[i] || {}, jg = S[i].snap?.kick;
  const sw = (attr, on, txt) => `<label class="sw" style="font-weight:500"><span>${txt}</span><input type="checkbox" ${attr} ${on ? 'checked' : ''}><span class="tg"></span></label>`;
  let h = `<h4>Kick · ${k.user ? 'logado como <b style="color:var(--fg)">' + esc(k.user) + '</b>' : 'não logado'}</h4>`;
  if (!k.user) h += '<div class="live"><span class="st">Kick não logada. Use a engrenagem.</span></div>';
  const swHtml = `<div class="kk-sw">${sw(`data-kkset="${i}|ligado"`, k.ligado, 'Farmar pontos (player mudo)')}
    ${sw(`data-kkset="${i}|leve"`, !k.completo, 'Player leve (só vídeo, gasta menos RAM)')}</div>`;
  if (!jg) return h + swHtml + '<div class="live"><span class="st">Esperando o jogo mandar os canais da Kick…</span></div>';
  if (!jg.vinculado) h += '<div class="aviso">Esta conta do jogo ainda não tem Kick vinculada (no jogo: Bônus na Kick → Vincular). Sem isso o resgate não vira bônus.</div>';
  else if (jg.login && k.user && jg.login.toLowerCase() !== k.user.toLowerCase()) h += `<div class="aviso">No jogo está vinculada <b>${esc(jg.login)}</b>, aqui está logada <b>${esc(k.user)}</b>. O resgate só vale na mesma conta.</div>`;
  h += swHtml;
  const ativos = Object.entries(jg.bonus || {}).filter(([, ate]) => ate > Date.now());
  if (ativos.length) h += `<div class="kk-ativos">${ativos.map(([t, ate]) => `<span>⚡ ${NOME_TIPO[t] || t} +${n1(jg.pct)}% · ${tempoRestante(ate - Date.now())}</span>`).join('')}</div>`;
  const canais = (jg.oficiais || []).filter((c) => c.ativo).sort((a, b) => Number(b.aoVivo) - Number(a.aoVivo) || (k.saldos?.[b.slug]?.pontos || 0) - (k.saldos?.[a.slug]?.pontos || 0));
  h += canais.map((c) => {
    const s = k.saldos?.[c.slug];
    return `<div class="live kk-canal"><span class="l" style="${c.aoVivo ? 'background:#53fc18' : 'background:var(--muted)'}"></span><span class="nm">${esc(c.nome || c.slug)}${(k.assistindo || []).includes(c.slug) ? ' <small>assistindo</small>' : ''}</span>
      <span class="st">${s ? num(s.pontos) + ' pts' : '—'}</span></div>`;
  }).join('') || '<div class="live"><span class="st">Nenhum canal oficial com pontos ativos.</span></div>';
  if (k.erro) h += `<div class="erro">${esc(k.erro)}</div>`;
  h += '<div class="hint" style="margin:6px 4px 0">Para resgatar, abra a live grande (clique no nome dela na doca Kick) e resgate na própria Kick.</div>';
  return h;
}
// Minimizada, a doca vira uma faixa fina: os players ficam minúsculos, mas continuam na tela
// (player escondido pausa e a Kick para de contar os pontos).
let kdockMin = (() => { try { return localStorage.getItem('pie-kdock-min') === '1'; } catch (_) { return false; } })();
// Na tela cheia (conta expandida ou live grande) a doca começa fina, mas o botão ▴/▾ manda nela também.
let kdockMinTela = true;
const telaCheia = () => foco != null || !!kkVer;
const docaFina = () => (telaCheia() ? kdockMinTela : kdockMin);
// Doca da Kick (embaixo): o player de cada conta que está farmando + saldo, sem abrir menu nenhum.
function renderKickDock() {
  const d = $('#kdock');
  const contas = S.map((s, i) => i).filter((i) => KK.contas[i]?.ligado && !S[i].desligada);
  d.classList.toggle('on', contas.length > 0);
  d.classList.toggle('min', docaFina());
  const html = contas.map((i) => {
    const k = KK.contas[i], jg = S[i].snap?.kick;
    const vendo = k.assistindo || [];
    const total = Object.values(k.saldos || {}).reduce((a, x) => a + (x.pontos || 0), 0);
    const nomeCanal = (slug) => esc((jg?.oficiais || []).find((c) => c.slug === slug)?.nome || slug);
    // cada live vira um botão (clique = abre a live grande numa janela); os players ficam escondidos,
    // a não ser que a conta esteja no modo "players visíveis"
    const chips = vendo.length
      ? vendo.map((slug) => `<div class="kcol"><span class="kchip-w ${kkVer?.i === i && kkVer.slug === slug ? 'aberta' : ''}"><button class="kchip" data-kkver="${i}|${esc(slug)}" title="Abrir esta live grande (é o mesmo player: qualidade, som e resgates que você mexer continuam)">${nomeCanal(slug)} <b>${k.saldos?.[slug] ? num(k.saldos[slug].pontos) : '—'}</b></button><button class="ksom ${KKSOM[i + '|' + slug] ? 'on' : ''}" data-kksom="${i}|${esc(slug)}" title="${KKSOM[i + '|' + slug] ? 'Tirar o som' : 'Ligar o som'}">${KKSOM[i + '|' + slug] ? '🔊' : '🔇'}</button></span>${k.visivel ? `<div class="kmini" data-kmini="${i}" data-kcanal="${esc(slug)}"></div>` : ''}</div>`).join('')
      : '<span class="kd-vazio">nenhuma live oficial com pontos no ar</span>';
    return `<div class="kd" data-kkwrap="${i}"><div class="kd-t" data-kkbtn="${i}" title="Abrir Kick desta conta"><b>${nomeConta(i)}</b>
      <span class="kd-p">${num(total)} pts</span><span class="kd-s">${vendo.length} ${vendo.length === 1 ? 'live' : 'lives'}</span>${k.erro ? '<span class="kd-e">⚠ ver Kick</span>' : ''}</div>
      <div class="kchips">${chips}</div>
      <button class="kd-vis ${k.visivel ? 'on' : ''}" data-kkvis="${i}" title="${k.visivel ? 'Esconder os players (continuam rodando)' : 'Mostrar os players pequenos'}">${k.visivel ? '◉' : '○'}</button></div>`;
  }).join('');
  const botao = `<button class="kd-min" data-kdmin="1" title="${docaFina() ? 'Mostrar a doca da Kick' : 'Minimizar a doca da Kick (os players continuam rodando, bem pequenos)'}">${docaFina() ? '▴' : '▾'}</button>`;
  const tudo = html ? botao + `<div class="kd-lista">${html}</div>` : '';
  if (d.dataset.h !== tudo) { d.innerHTML = tudo; d.dataset.h = tudo; requestAnimationFrame(enviarLayout); }
}

function menuHTML(i) {
  const tw = TW.contas[i] || {};
  let corpo = '';
  if (tw.vinculando) {
    corpo = `<div class="codigo">Confirme na janela da Twitch que abriu.<br>Código: <b>${esc(tw.vinculando.codigo)}</b></div><div class="hint" style="margin:4px">Entre com a Twitch DESTA conta. A janela fecha sozinha quando der certo.</div>`;
  } else if (tw.login) {
    corpo = `<div class="st">Twitch: <b>vinculada · ${esc(tw.login)}</b></div><button class="un" data-unlink="${i}">Desvincular Twitch</button>`;
  } else {
    corpo = `<div class="st">Twitch: <b>não vinculada</b></div><button class="tw-b" data-link="${i}">Vincular Twitch</button>`;
  }
  if (tw.erro) corpo += `<div class="erro">${esc(tw.erro)}</div>`;
  const kk = KK.contas[i] || {};
  const kick = `<div class="st">Kick: <b>${kk.user ? 'logada · ' + esc(kk.user) : 'não logada'}</b></div><button class="kk-b" data-kklogin="${i}">${kk.user ? 'Trocar conta da Kick' : 'Entrar na Kick'}</button>${kk.user ? '' : '<div class="hint" style="margin:4px">Use e-mail e senha (o Google não deixa logar dentro de apps).</div>'}`;
  const z = S[i].zoom;
  const zoom = `<div class="zoom"><span>Zoom do jogo</span><button data-zoom="${i}|-1">−</button><b>${z ? Math.round(z.z * 100) + '%' : '—'}</b><button data-zoom="${i}|1">+</button><button data-zoom="${i}|0" class="${z && !z.manual ? 'on' : ''}">auto</button></div><div class="hint" style="margin:2px 4px 0">Também dá com Ctrl + roda do mouse dentro do jogo.</div>`;
  return `<h4>${nomeConta(i)}</h4>${corpo}<div class="sep"></div>${kick}<div class="sep"></div>${zoom}<button data-reload="${i}">Recarregar jogo</button>`;
}

// ---- barra de automação
function barHTML(i) {
  const c = cfgDe(i), bola = regra(i, ID_BOLA), poc = regra(i, ID_POCAO);
  const nomeCurto = (r) => (r?.label || '').replace(/\s*(Ball|Potion)$/i, '') || '—';
  const chip = (k, nome, on, res) => `<button class="am ${on ? 'on' : ''} ${c.enabled ? '' : 'desl'} ${painel?.i === i && painel.k === k ? 'open' : ''}" data-am="${i}|${k}"><i data-amt="${i}|${k}" title="${on ? 'Desligar' : 'Ligar'} (sem abrir o menu)"></i>${nome} <b>${on ? res : 'off'}</b>${ICON.car}</button>`;
  return `
    ${chip('bola', 'Bola', bola?.enabled, `${esc(nomeCurto(bola))} &lt; ${num(bola?.min ?? 0)}`)}
    ${chip('poc', 'Poção', poc?.enabled, `${esc(nomeCurto(poc))} &lt; ${num(poc?.min ?? 0)}`)}
    ${chip('mapa', 'Mapa', c.autoHunt?.enabled, 'top 1')}
    ${chip('sniper', 'Sniper', c.sniper?.enabled, (() => { const n = snResumo(S[i].sniper?.hist, 24).ganhou.length; return n ? `${n} compra${n > 1 ? 's' : ''}` : c.sniper?.modo === 'comprar' ? 'comprando' : 'simulando'; })())}
    <span class="sp"></span>
    <label class="sw master-c" title="Chave geral desta conta: sem ela nada age no jogo"><span>Automação</span><input type="checkbox" data-master="${i}" ${c.enabled ? 'checked' : ''}><span class="tg"></span></label>`;
}

// ---- painel (overlay acima da barra)
function painelHTML(i, k) {
  const sw = (attr, on) => `<label class="sw" style="gap:12px"><span>Ligado</span><input type="checkbox" ${attr} ${on ? 'checked' : ''}><span class="tg"></span></label>`;
  const fechar = `<button class="ib" data-fechar="1" title="Fechar">${ICON.x}</button>`;
  if (k === 'mapa') return mapaHTML(i, sw, fechar);
  if (k === 'sniper') return sniperHTML(i, sw, fechar);
  const kind = k === 'bola' ? 'ball' : 'item';
  const id = k === 'bola' ? ID_BOLA : ID_POCAO;
  const r = regra(i, id) || { min: 100, qty: 100, enabled: false, refId: null };
  const ops = opcoes(i, kind);
  const ref = r.refId ?? ops[0]?.id;
  const tem = estoque(i, kind, ref);
  const bloq = S[i].snap?.regras?.porRegra?.[id]?.bloqueadaAte;
  const tit = k === 'bola' ? 'Compra de Pokébola' : 'Compra de Poção';
  return `<div class="ph2"><span>${tit}</span><span style="display:flex;gap:6px;align-items:center">${sw(`data-ron="${i}|${k}"`, r.enabled)}${fechar}</span></div>
    <div class="${r.enabled ? '' : 'off-box'}"><div class="g4">
      <div class="field">Tipo<select data-rref="${i}|${k}">${ops.length ? ops.map((o) => `<option value="${o.id}" ${o.id === ref ? 'selected' : ''}>${esc(o.nome)} · ${num(o.preco)} ouro</option>`).join('') : '<option>abra o jogo para listar</option>'}</select></div>
      <div class="field">Comprar quando abaixo de<input type="number" min="1" value="${r.min}" data-rmin="${i}|${k}"></div>
      <div class="field">Lote por compra<input type="number" min="1" value="${r.qty}" data-rqty="${i}|${k}"></div></div>
    <div class="res">Quando ficar abaixo de <b>${num(r.min)}</b>, compra <b>${num(r.qty)}</b>.${tem != null ? ` Agora: <b>${num(tem)}</b>.` : ''}</div>
    ${bloq && bloq > Date.now() ? '<div class="res bad">A última compra não confirmou; pausada por alguns minutos.</div>' : ''}
    ${!cfgDe(i).enabled ? '<div class="hint">A chave "Automação" desta conta está desligada: nada é comprado até ligar.</div>' : ''}</div>`;
}


// ---- Sniper do Mercado (itens)
const SN_ALVOS = {
  boss: { nome: 'Boss Token', re: /boss token/i },
  chave: { nome: 'Fragmento de chave', re: /key fragment|fragmento de chave/i },
  bike: { nome: 'Fragmento de bike', re: /bicycle fragment|fragmento de bicicleta/i },
};
const CAT_MERCADO = { stone: 'Pedras', mega: 'Mega Stones', loot: 'Drops', fragment: 'Fragmentos', tm: 'TMs', card: 'Cartas', boss: 'Boss Tokens', ticket: 'Tickets', clan: 'Clã', ovo: 'Ovo Shiny', box: 'Boxes', bicicleta: 'Bicicletas', casa: 'Casas', skin: 'Skins', beast: 'Beast Ball' };
const SN_COR = { comprou: 'ok', perdeu: 'bad', erro: 'bad', simulado: 'sim', agendado: 'ag', enviado: 'ag', sorteio: 'ag', pulado: '', info: '' };
const hora = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
function sniperHTML(i, sw, fechar) {
  const c = cfgDe(i), sn = c.sniper, st = S[i].sniper;
  const cat = S[i].catalog?.mercado?.catalogo ?? [];
  const achados = (k) => cat.filter((it) => SN_ALVOS[k].re.test(it.nome || '')).map((it) => it.nome);
  const chk = (attr, on, txt) => `<label class="sn-chk"><input type="checkbox" ${attr} ${on ? 'checked' : ''}><span>${txt}</span></label>`;
  const outra = S.findIndex((s, k) => k !== i && cfgDe(k).sniper?.enabled);
  const gasto = st?.gasto || { gold: 0, orb: 0 };
  const moeda = (m, nome) => `<div class="sn-moeda">${chk(`data-snmoeda="${i}|${m}"`, sn.moedas[m].on, nome)}
      <label class="sn-teto">teto 24 h <input type="number" min="0" value="${sn.moedas[m].tetoDia}" data-snteto="${i}|${m}"></label>
      <span class="sn-gasto">gasto <b>${num(gasto[m] || 0)}</b></span></div>`;
  const log = (st?.log ?? []).slice().reverse().slice(0, 14).map((l) => `<div class="sn-l ${SN_COR[l.tipo] || ''}"><span>${hora(l.t)}</span>${esc(l.texto)}</div>`).join('')
    || `<div class="hint" style="margin:4px">${!sn.enabled ? 'Ligue para começar a procurar.' : st?.varreduras ? `Nenhum anúncio ${sn.desconto}% abaixo da referência ainda. Veja em "Olhados agora" quanto falta em cada item.` : 'Procurando… a 1ª varredura sai em segundos.'}</div>`;
  const olh = st?.olhados ?? [];
  const tabela = olh.length ? `<div class="sn-olh"><div class="sn-oh"><span>Olhados agora (o mais barato de cada item)</span><span>preço</span><span>últimas vendas</span><span>vitrine</span><span>abaixo</span></div>${olh.map((o) => `<div class="sn-or ${o.pct >= sn.desconto ? 'bom' : ''}"><span>${esc(o.nome)}${o.moeda === 'orb' ? ' <small>Gemas</small>' : ''}</span><span>${num(o.menor)}</span><span>${o.medVen != null ? num(o.medVen) : '—'}</span><span>${o.medVit != null ? num(o.medVit) : '—'}</span><b>${o.ref ? (o.pct > 0 ? `−${o.pct}%` : `+${-o.pct}%`) : 'sem ref.'}</b></div>`).join('')}</div>` : '';
  const status = st?.ultimaVarredura ? `Última varredura ${hora(st.ultimaVarredura)} · ${st.varreduras} varreduras · ${st.candidatos} item(ns) mudaram na última · ${st.respostas || 0} listas de item lidas${st.agendados ? ` · <b>${st.agendados} compra(s) agendada(s)</b>` : ''}` : '';
  const abas = `<div class="sn-abas"><button data-sntab="config" class="${snAba === 'config' ? 'on' : ''}">Ajustes e agora</button><button data-sntab="compras" class="${snAba === 'compras' ? 'on' : ''}">Compras${(() => { const n = snResumo(st?.hist, 24).ganhou.length; return n ? ` <b>${n}</b>` : ''; })()}</button></div>`;
  if (snAba === 'compras') return `<div class="ph2"><span>Sniper do Mercado (itens)</span><span style="display:flex;gap:6px;align-items:center">${sw(`data-snon="${i}"`, sn.enabled)}${fechar}</span></div>${abas}${comprasHTML(i, st)}`;
  return `<div class="ph2"><span>Sniper do Mercado (itens)</span><span style="display:flex;gap:6px;align-items:center">${sw(`data-snon="${i}"`, sn.enabled)}${fechar}</span></div>${abas}
    ${outra >= 0 && !sn.enabled ? `<div class="res">O sniper está ligado em ${nomeConta(outra)}. Ligar aqui desliga lá (só uma conta caça por vez, para não disputar o mesmo anúncio).</div>` : ''}
    <div class="g4">
      <label class="field">Modo<select data-snmodo="${i}"><option value="simular" ${sn.modo !== 'comprar' ? 'selected' : ''}>Simular (só anota)</option><option value="comprar" ${sn.modo === 'comprar' ? 'selected' : ''}>Comprar</option></select></label>
      <label class="field" title="Quanto abaixo do preço de referência o anúncio tem de estar">% abaixo da referência<input type="number" min="1" max="90" value="${sn.desconto}" data-sndesc="${i}"></label>
      <label class="field" title="Referência = a menor entre a mediana das últimas N vendas do item e a dos N outros anúncios mais baratos da vitrine">Comparar com os últimos<input type="number" min="2" max="10" value="${sn.amostras}" data-snamostras="${i}"></label>
      <label class="field">Reserva de Coins<input type="number" min="0" value="${sn.reservaGold}" data-snres="${i}"></label>
    </div>
    <div class="sn-cats">${Object.entries(SN_ALVOS).map(([k, a]) => { const n = achados(k); return chk(`data-snalvo="${i}|${k}"`, sn.alvos.includes(k), `${a.nome}${cat.length ? ` <small title="${esc(n.join(', '))}">${n.length ? n.length + ' no Mercado' : 'não achei no Mercado'}</small>` : ''}`); }).join('')}</div>
    <div class="sn-moedas">${moeda('orb', 'Gemas <small>(dinheiro real)</small>')}${moeda('gold', 'Coins')}</div>
    ${sn.modo === 'comprar' && !c.enabled ? '<div class="res bad">A chave "Automação" desta conta está desligada: não compra nada (só simula) até ligar.</div>' : ''}
    ${tabela}
    <div class="sn-log">${log}</div>
    ${status ? `<div class="hint">${status}</div>` : ''}
    <div class="hint">Referência de cada item = a MENOR entre a mediana das últimas ${sn.amostras} vendas dele e a dos ${sn.amostras} outros anúncios mais baratos da vitrine agora. Só pega anúncio ${sn.desconto}% abaixo disso. Todo anúncio novo fica retido alguns minutos; quando libera, o jogo sorteia entre quem pediu nos primeiros 3 s, e o sniper pede logo depois de liberar (nunca antes). Varre a vitrine a cada ~30 s.</div>`;
}
// ---- histórico do sniper (aba Compras)
let snAba = 'config';
let snPeriodo = 24; // horas (0 = tudo)
const TAXA_VENDA = 0.15; // comissão do Mercado sobre item (shared/taxa-mercado.mjs do jogo), quem paga é quem vende
function snResumo(hist, horas) {
  const desde = horas ? Date.now() - horas * 3600000 : 0;
  const h = (hist ?? []).filter((x) => x.t >= desde);
  return { todos: h, ganhou: h.filter((x) => x.res === 'ganhou'), perdeu: h.filter((x) => x.res === 'perdeu'), erro: h.filter((x) => x.res === 'erro'), simulado: h.filter((x) => x.res === 'simulado') };
}
const moedaN = (m) => (m === 'orb' ? 'Gemas' : 'Coins');
const quando = (t) => { const d = new Date(t); const hoje = new Date().toDateString() === d.toDateString(); return hoje ? hora(t) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
function comprasHTML(i, st) {
  const r = snResumo(st?.hist, snPeriodo);
  const per = `<label class="sn-per">Período <select data-snper="${i}">${[[24, 'últimas 24 h'], [168, 'últimos 7 dias'], [0, 'tudo']].map(([v, n]) => `<option value="${v}" ${snPeriodo === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
  const lista = r.ganhou.length ? r.ganhou : r.simulado;
  const simul = !r.ganhou.length && r.simulado.length;
  if (!lista.length) {
    return per + `<div class="vazio-top">${r.perdeu.length ? `Nenhuma compra ainda; ${r.perdeu.length} sorteio(s) perdido(s) para outro jogador.` : 'Nada comprado (nem simulado) neste período.'}</div>`;
  }
  // por moeda e por item: unidades, custo médio, referência de agora, preço mínimo (empate) e lucro se revender
  const refAgora = {};
  for (const o of st?.olhados ?? []) if (o.ref) refAgora[`${o.nome}|${o.moeda}`] = o.ref;
  const porItem = {};
  for (const x of lista) {
    const k = `${x.nome}|${x.moeda}`;
    const g = (porItem[k] ??= { nome: x.nome, moeda: x.moeda, un: 0, custo: 0, refCompra: 0 });
    g.un += x.qtd; g.custo += x.qtd * x.preco; g.refCompra += x.qtd * (x.ref || x.preco);
  }
  const totais = {};
  const linhasItem = Object.entries(porItem).map(([k, g]) => {
    const medio = g.custo / g.un;
    const ref = refAgora[k] ?? g.refCompra / g.un;
    const minimo = Math.ceil(medio / (1 - TAXA_VENDA));
    const liquido = Math.floor(ref * (1 - TAXA_VENDA));
    const lucro = (liquido - medio) * g.un;
    const t = (totais[g.moeda] ??= { gasto: 0, lucro: 0, un: 0, ref: 0 });
    t.gasto += g.custo; t.lucro += lucro; t.un += g.un; t.ref += g.refCompra;
    return `<div class="sn-it"><span>${esc(g.nome)}</span><span>${num(g.un)}</span><span>${num(Math.round(medio))}</span><span title="${refAgora[k] ? 'referência de agora (últimas vendas / vitrine)' : 'referência na hora da compra'}">${num(Math.round(ref))}${refAgora[k] ? '' : '*'}</span><span title="abaixo disso você perde dinheiro (a taxa de 15% sai de quem vende)">${num(minimo)}</span><b class="${lucro >= 0 ? 'ok' : 'bad'}">${lucro >= 0 ? '+' : ''}${num(Math.round(lucro))}</b><span>${moedaN(g.moeda)}</span></div>`;
  }).join('');
  const cards = Object.entries(totais).map(([m, t]) => `<div class="sn-card"><b>${num(t.un)}</b><span>unidades${simul ? ' (simulado)' : ''}</span></div>
    <div class="sn-card"><b>${num(Math.round(t.gasto))} ${moedaN(m)}</b><span>${simul ? 'teria gastado' : 'gasto'}</span></div>
    <div class="sn-card"><b>${t.ref ? Math.round((1 - t.gasto / t.ref) * 100) : 0}%</b><span>desconto médio</span></div>
    <div class="sn-card"><b class="${t.lucro >= 0 ? 'ok' : 'bad'}">${t.lucro >= 0 ? '+' : ''}${num(Math.round(t.lucro))} ${moedaN(m)}</b><span>lucro se revender agora (já sem os 15%)</span></div>`).join('');
  const ult = lista.slice().reverse().slice(0, 30).map((x) => `<div class="sn-l ${x.res === 'ganhou' ? 'ok' : 'sim'}"><span>${quando(x.t)}</span>${esc(x.nome)} ×${num(x.qtd)} por ${num(x.preco)} ${moedaN(x.moeda)}/un. (−${x.pct}% da ref. ${num(x.ref)})${x.vendedor ? ` · de ${esc(x.vendedor)}` : ''}</div>`).join('');
  return per + (simul ? '<div class="res">Modo simular: estes são os que ele <b>teria</b> comprado.</div>' : '')
    + `<div class="sn-cards">${cards}</div>`
    + `<div class="hint" style="margin:6px 2px 2px">Tentativas no período: <b>${r.ganhou.length}</b> ganhas · <b>${r.perdeu.length}</b> sorteios perdidos${r.erro.length ? ` · <b>${r.erro.length}</b> com erro` : ''}${r.simulado.length && r.ganhou.length ? ` · ${r.simulado.length} simuladas` : ''}</div>`
    + `<div class="sn-tab"><div class="sn-it sn-ith"><span>Item</span><span>Unid.</span><span>Paguei/un.</span><span>Vender a</span><span>Mínimo</span><span>Lucro</span><span></span></div>${linhasItem}</div>`
    + `<div class="hint">"Vender a" = referência de agora (a menor entre as últimas vendas e a vitrine)${Object.keys(refAgora).length ? '' : '; * = referência na hora da compra'}. "Mínimo" = abaixo disso a venda dá prejuízo (a comissão de 15% sai de quem vende; item não paga diária).</div>`
    + `<div class="sn-log">${ult}</div>`;
}

function mudarSniper(i, patch) {
  const c = cfgDe(i);
  c.sniper = { ...c.sniper, ...patch, moedas: { ...c.sniper.moedas, ...(patch.moedas || {}) } };
  salvarCfg(i, c);
  // só uma conta caça por vez
  if (patch.enabled) for (let k = 0; k < N; k++) if (k !== i && cfgDe(k).sniper?.enabled) { const o = cfgDe(k); o.sniper.enabled = false; salvarCfg(k, o); }
}

function retrato(pokeId) {
  const dex = PieHunt.dexDoRetrato(pokeId);
  return dex > 0 ? `<img alt="" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dex}.png">` : '';
}

function mapaHTML(i, sw, fechar) {
  const s = S[i], c = cfgDe(i), pk = s.pk;
  const cab = `<div class="ph2"><span>Trocar de mapa sozinho</span><span style="display:flex;gap:6px;align-items:center">${sw(`data-mapa="${i}"`, c.autoHunt?.enabled)}${fechar}</span></div>`;
  if (!pk || !s.res) {
    const msg = !s.snap?.ready ? 'Abra o jogo desta conta para calcular.'
      : MOTOR_ERRO ? 'Não consegui carregar os dados do jogo: ' + MOTOR_ERRO
      : !MOTOR_V ? (JOGO?.erro && !JOGO?.pronto ? 'Não consegui baixar os dados do jogo: ' + JOGO.erro : 'Baixando os dados do jogo…') : 'Calculando…';
    return cab + `<div class="vazio-top">${esc(msg)}</div>`;
  }
  if (s.res.erro) return cab + `<div class="vazio-top">${esc(s.res.erro)}</div>`;
  const ivs = pk.ivs ? ['hp', 'atk', 'def', 'spAtk', 'spDef', 'speed'].map((k) => pk.ivs[k]).join('/') : '—';
  const ref = pk.refino ? Object.values(pk.refino).reduce((a, b) => a + (Number(b) || 0), 0) : 0;
  const bx = s.res.bonusXp;
  const sim = (v) => (v === true || v === 'true' || v === 1 || (typeof v === 'string' && v && v !== 'false') ? 'sim' : 'não');
  const pers = `<div class="col"><h5>Meu personagem</h5>
    <div class="mon-h"><div class="ic">${retrato(pk.speciesId)}</div><div><b>${pk.shiny ? '✨ ' : ''}${esc(pk.nome)}</b><div class="hint" style="margin:0">Nv ${num(pk.level)} · treinador ${num(s.snap.level)}</div></div></div>
    <div class="kv"><span>IVs</span><b>${ivs}</b><span>Qualidade · Potência</span><b>${pk.quality != null ? n1(pk.quality) : '—'} · P${pk.potencia ?? 1}</b><span>Refino</span><b>${ref ? '+' + ref : '0'}</b>
      <span>TM elemental · AoE</span><b>${sim(pk.tmElemental)} · ${sim(pk.tmAoe)}</b><span>Poção automática</span><b>${s.res.comPocao ? 'sim' : 'não'}</b>
      <span title="${esc((bx?.itens ?? []).map((x) => `${x.nome} ×${n1(x.mult)}`).join(' · ') || 'nenhum bônus ativo')}">Bônus XP</span><b>×${bx ? n1(bx.pokemon) : '1'}${s.snap.multXp ? ` <small title="Bônus que o jogo está dando de verdade (XP de cada abate ÷ XP base)">(real ×${n1(s.snap.multXp)})</small>` : ''}</b></div></div>`;
  const atual = s.snap.huntSlug;
  const realAqui = xphReal(i);
  const top = s.top.length ? s.top.map((r, k) => `<div class="t3 ${k ? '' : 'first'}"><span class="n">${k + 1}</span><div class="nm">${esc(r.hunt.nome)}<small>${num(r.killsH)} abates/h${r.hunt.slug === atual && realAqui != null ? ` · real agora: <b>${curto(realAqui)}</b> XP/h` : ''}</small></div><span class="xp" title="XP/h estimado do pokémon (mesma conta da extensão oficial)">≈${curto(r.xpH)}/h</span><span class="tag ${r.risco.nivel === 'baixo' ? '' : 'seg'}" title="${r.risco.nivel === 'baixo' ? 'Risco baixo: o golpe mais forte dos selvagens daqui tira essa % do HP do seu pokémon' : 'Atenção: o golpe mais forte dos selvagens daqui tira metade ou mais do HP do seu pokémon'}">${esc(r.risco.txt.replace(/^([✓⚠]) (\d+%)$/, '$1 golpe tira $2 do HP'))}</span>${r.hunt.slug === atual ? '<span class="atual">atual</span>' : ''}</div>`).join('')
    : '<div class="vazio-top">Nenhuma hunt segura para ele agora.</div>';
  const alerta = s.alerta ? `<div class="res bad">${esc(s.alerta.motivo)}</div>` : '';
  const rod = `<div class="hint">Dados do jogo v${esc(s.res.versao)} · cálculo igual à extensão oficial · geometria medida em ${Object.keys(geoJunta()).length} hunts${s.res.aoe ? ` · TM AoE ${n1(s.res.aoe.alvosPorGolpe)} alvos/golpe${s.res.aoe.calibradoEm ? ` (calibrado em ${s.res.aoe.calibradoEm})` : ''}` : ''}</div>`;
  return cab + `<div class="map2">${pers}<div class="col"><h5>Top 3 mapas para ele</h5><div class="top3">${top}</div></div></div>${alerta}
    ${rod}<div class="hint">≈ = estimativa (ondas cheias, igual à extensão oficial). "Real" = o XP que ele está ganhando agora, medido. A % é quanto do HP do seu pokémon o golpe mais forte dos selvagens dali tira. Troca sempre para o 1º lugar sem ☠ (morte ou golpe que passa do HP), só fora de combate. O alerta vermelho aparece mesmo com a troca desligada.${!c.enabled ? ' A chave "Automação" desta conta está desligada.' : ''}</div>`;
}

// ------------------------------------------------------------------ render
function renderSlot(i) {
  const sl = document.querySelector(`.slot[data-slot="${i}"]`);
  if (!sl) return;
  sl.classList.toggle('alert', !!S[i].alerta);
  sl.classList.toggle('big', foco === i);
  const head = $('.head', sl);
  // não redesenha o menu enquanto você digita o Client ID
  head.innerHTML = headHTML(i);
  $('.bar', sl).innerHTML = barHTML(i);
  sl.classList.toggle('desligada', !!S[i].desligada);
  sl.classList.toggle('fora', !!S[i].desligada && foco !== i);
  const g = $('.game', sl);
  const vazio = S[i].desligada ? `<div class="off-msg"><div>${ICON.power}</div><b>Conta desligada</b><span>O jogo desta conta está fechado e não usa memória.</span><button class="primary" data-power="${i}">Ligar conta</button></div>` : '';
  if (g.innerHTML !== vazio) g.innerHTML = vazio;
  if (ovAberto()?.i === i) ovSync();
}
function renderTopo() {
  const al = S.map((s, i) => (s.alerta ? i : -1)).filter((i) => i >= 0);
  const e = $('#alertaG');
  e.classList.toggle('on', al.length > 0);
  e.dataset.i = al[0] ?? '';
  e.textContent = al.length ? `● hunt melhor em ${al.map((i) => nomeConta(i).replace(/<[^>]+>/g, '')).join(', ')}` : '';
  const st = $('#strip');
  const comTira = foco != null || !!kkVer;
  st.classList.toggle('on', comTira);
  // faixa fina: um rótulo por conta ligada (clique = expande ela); os jogos continuam rodando por trás
  if (!comTira) { if (st.innerHTML) st.innerHTML = ''; return; }
  const html = S.map((s, i) => (s.desligada ? '' : `<button class="th ${foco === i ? 'cur' : ''}" data-th="${i}" title="${foco === i ? 'Expandida acima' : 'Expandir esta conta'}"><span class="dot ${estadoPonto(i)}"></span><b>${nomeConta(i)}</b><span class="xp">${xphAgora(i) != null ? curto(xphAgora(i)) + '/h' : ''}</span></button>`)).join('')
    + `<button class="th volta" data-voltar="1" title="Voltar para a grade (Esc)">▦ Grade</button>`;
  if (st.dataset.h !== html) { st.innerHTML = html; st.dataset.h = html; }
}
// Contas desligadas saem da grade e as ligadas ganham o espaço (1, 2, 3 ou 4 quadrados).
// Layouts prontos (como os do Windows), por número de contas ligadas. A ordem das contas vem do
// arrastar-e-soltar pelo cabeçalho; a 1ª da ordem é a que fica maior nos layouts com destaque.
const LAYOUTS = {
  1: { unico: { c: '1fr', r: '1fr', a: ['a'] } },
  2: {
    lado: { c: '1fr 1fr', r: '1fr', a: ['a b'] },
    pilha: { c: '1fr', r: '1fr 1fr', a: ['a', 'b'] },
    destaque: { c: '2fr 1fr', r: '1fr', a: ['a b'] },
  },
  3: {
    grade: { c: '1fr 1fr', r: '1fr 1fr', a: ['a b', 'c c'] },
    destaque: { c: '2fr 1fr', r: '1fr 1fr', a: ['a b', 'a c'] },
    colunas: { c: '1fr 1fr 1fr', r: '1fr', a: ['a b c'] },
  },
  4: {
    grade: { c: '1fr 1fr', r: '1fr 1fr', a: ['a b', 'c d'] },
    destaque: { c: '2fr 1fr', r: '1fr 1fr 1fr', a: ['a b', 'a c', 'a d'] },
    topo: { c: '1fr 1fr 1fr', r: '2fr 1fr', a: ['a a a', 'b c d'] },
    dupla: { c: '1fr 1fr', r: '3fr 2fr', a: ['a b', 'c d'] },
  },
};
const LETRAS = 'abcd';
const pref = (() => { try { return JSON.parse(localStorage.getItem('pie-layout') || '{}'); } catch (_) { return {}; } })();
let ordem = Array.isArray(pref.ordem) && pref.ordem.length === 4 ? pref.ordem : [0, 1, 2, 3];
const modoPorQtd = pref.modo || {};
pref.tam = pref.tam || {};
let layoutAtual = null;
const salvarPref = () => { try { localStorage.setItem('pie-layout', JSON.stringify({ ordem, modo: modoPorQtd, tam: pref.tam })); } catch (_) { /* sem armazenamento */ } };

// ---- divisórias arrastáveis entre os quadrados (como redimensionar janelas lado a lado)
const GAP = 10, MIN_PX = 180;
function trilhas() {
  const cs = getComputedStyle($('#grid'));
  return { c: cs.gridTemplateColumns.split(' ').map(parseFloat), r: cs.gridTemplateRows.split(' ').map(parseFloat) };
}
function desenharDivisores() {
  const box = $('#divs');
  if (!box) return;
  if (!layoutAtual || foco != null || arrastoDiv) { if (!arrastoDiv) box.innerHTML = ''; return; }
  const { l } = layoutAtual, t = trilhas();
  const area = l.a.map((x) => x.split(' '));
  const pos = (lista) => { const p = [0]; lista.forEach((v) => p.push(p.at(-1) + v + GAP)); return p; };
  const xs = pos(t.c), ys = pos(t.r);
  const out = [];
  // divisórias verticais (entre colunas j e j+1), só onde as áreas são diferentes
  for (let j = 0; j < t.c.length - 1; j++) {
    let r0 = null;
    for (let r = 0; r <= area.length; r++) {
      const corta = r < area.length && area[r][j] !== area[r][j + 1];
      if (corta && r0 == null) r0 = r;
      if (!corta && r0 != null) { out.push(`<div class="div-v" data-div="c|${j}" style="left:${xs[j + 1] - GAP}px;top:${ys[r0]}px;height:${ys[r] - ys[r0] - GAP}px"></div>`); r0 = null; }
    }
  }
  for (let j = 0; j < t.r.length - 1; j++) {
    let c0 = null;
    for (let c = 0; c <= area[0].length; c++) {
      const corta = c < area[0].length && area[j][c] !== area[j + 1][c];
      if (corta && c0 == null) c0 = c;
      if (!corta && c0 != null) { out.push(`<div class="div-h" data-div="r|${j}" style="top:${ys[j + 1] - GAP}px;left:${xs[c0]}px;width:${xs[c] - xs[c0] - GAP}px"></div>`); c0 = null; }
    }
  }
  box.innerHTML = out.join('');
}
let arrastoDiv = null;
function moverDivisor(x, y) {
  const a = arrastoDiv;
  if (!a) return;
  const d = (a.tipo === 'c' ? x : y) - a.inicio;
  const s = a.tam.slice();
  const tot = s[a.j] + s[a.j + 1];
  s[a.j] = Math.max(MIN_PX, Math.min(tot - MIN_PX, a.tam[a.j] + d));
  s[a.j + 1] = tot - s[a.j];
  const fr = s.map((v) => Math.round(v));
  const g = $('#grid');
  if (a.tipo === 'c') g.style.gridTemplateColumns = fr.map((v) => v + 'fr').join(' ');
  else g.style.gridTemplateRows = fr.map((v) => v + 'fr').join(' ');
  a.final = fr;
  if (!a.raf) a.raf = requestAnimationFrame(() => { a.raf = 0; enviarLayout(); });
}
function fimDivisor() {
  const a = arrastoDiv;
  if (!a) return;
  arrastoDiv = null;
  app.arraste(false);
  document.body.classList.remove('arrastando-div');
  if (a.final && layoutAtual) {
    const t = trilhas();
    pref.tam[layoutAtual.chave] = { c: t.c.map(Math.round), r: t.r.map(Math.round) };
    salvarPref();
  }
  desenharDivisores();
  requestAnimationFrame(enviarLayout);
}
document.addEventListener('pointerdown', (e) => {
  const h = e.target.closest?.('[data-div]');
  if (!h) return;
  e.preventDefault();
  const [tipo, j] = h.dataset.div.split('|');
  const t = trilhas();
  arrastoDiv = { tipo, j: +j, inicio: tipo === 'c' ? e.clientX : e.clientY, tam: tipo === 'c' ? t.c : t.r };
  try { h.setPointerCapture(e.pointerId); } catch (_) { /* ok */ }
  document.body.classList.add('arrastando-div');
  if (ovAberto()) fecharTudo();
  app.arraste(true, tipo === 'c' ? 'col-resize' : 'row-resize');
});
document.addEventListener('pointermove', (e) => { if (arrastoDiv) moverDivisor(e.clientX, e.clientY); });
document.addEventListener('pointerup', () => fimDivisor());
document.addEventListener('dblclick', (e) => {
  // duplo clique na divisória: volta ao tamanho padrão do layout
  if (!e.target.closest?.('[data-div]') || !layoutAtual) return;
  delete pref.tam[layoutAtual.chave];
  salvarPref();
  renderTudo();
});
function miniLayout(l) {
  // desenho pequeno do layout (para os botões da barra de cima)
  const cols = l.c.split(' ').map((x) => parseFloat(x)), rows = l.r.split(' ').map((x) => parseFloat(x));
  const W = 22, H = 14, sc = cols.reduce((a, b) => a + b), sr = rows.reduce((a, b) => a + b);
  const xs = [0], ys = [0];
  cols.forEach((c) => xs.push(xs.at(-1) + (c / sc) * W)); rows.forEach((r) => ys.push(ys.at(-1) + (r / sr) * H));
  const area = l.a.map((linha) => linha.split(' '));
  const rects = [...new Set(area.flat())].map((k) => {
    let r0 = 99, r1 = -1, c0 = 99, c1 = -1;
    area.forEach((ln, r) => ln.forEach((x, c) => { if (x === k) { r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c); } }));
    return `<rect x="${xs[c0] + 0.8}" y="${ys[r0] + 0.8}" width="${xs[c1 + 1] - xs[c0] - 1.6}" height="${ys[r1 + 1] - ys[r0] - 1.6}" rx="1.2"/>`;
  });
  return `<svg viewBox="0 0 22 14" class="lay">${rects.join('')}</svg>`;
}
function aplicarGrade() {
  const ativos = ordem.filter((i) => i < N && !S[i]?.desligada);
  const g = $('#grid');
  const opcoesL = LAYOUTS[ativos.length] || null;
  const nome = opcoesL ? (opcoesL[modoPorQtd[ativos.length]] ? modoPorQtd[ativos.length] : Object.keys(opcoesL)[0]) : null;
  const l = nome ? opcoesL[nome] : null;
  // tamanhos ajustados à mão (arrastando a divisória) valem por layout
  const tam = l ? pref.tam?.[ativos.length + '|' + nome] : null;
  const ncols = l ? l.c.split(' ').length : 0, nrows = l ? l.r.split(' ').length : 0;
  g.style.gridTemplateColumns = l ? (tam?.c?.length === ncols ? tam.c.map((x) => x + 'fr').join(' ') : l.c) : '';
  g.style.gridTemplateRows = l ? (tam?.r?.length === nrows ? tam.r.map((x) => x + 'fr').join(' ') : l.r) : '';
  layoutAtual = l ? { chave: ativos.length + '|' + nome, l } : null;
  g.style.gridTemplateAreas = l ? l.a.map((x) => `"${x}"`).join(' ') : '';
  document.querySelectorAll('.slot').forEach((sl) => {
    const k = ativos.indexOf(+sl.dataset.slot);
    sl.style.gridArea = k >= 0 ? LETRAS[k] : '';
  });
  const box = $('#layouts');
  box.innerHTML = opcoesL && Object.keys(opcoesL).length > 1
    ? Object.entries(opcoesL).map(([k, v]) => `<button class="lay-b ${k === nome ? 'on' : ''}" data-lay="${ativos.length}|${k}" title="Layout">${miniLayout(v)}</button>`).join('')
    : '';
  const off = S.map((s, i) => (s.desligada ? i : -1)).filter((i) => i >= 0);
  const bar = $('#offbar');
  bar.classList.toggle('on', off.length > 0 && foco == null);
  bar.innerHTML = off.length ? `<span class="t">Desligadas</span>` + off.map((i) => `<span class="offc"><i class="dot"></i><b>${nomeConta(i)}</b><button class="primary" data-power="${i}">Ligar</button></span>`).join('') : '';
  $('#vazio').classList.toggle('on', ativos.length === 0 && foco == null);
}
function renderKkVer() {
  // fecha sozinho se a live acabou
  if (kkVer && !(KK.contas[kkVer.i]?.assistindo || []).includes(kkVer.slug)) kkVer = null;
  document.body.classList.toggle('modo-kk', !!kkVer);
  const p = $('#kkpainel');
  if (!kkVer) { p.innerHTML = ''; delete p.dataset.h; return; }
  const { i, slug } = kkVer, k = KK.contas[i] || {}, jg = S[i].snap?.kick;
  const canal = (jg?.oficiais || []).find((c) => c.slug === slug);
  const s = k.saldos?.[slug], somOn = !!KKSOM[i + '|' + slug];
  const html = `<div class="kk-barra"><b>${esc(canal?.nome || slug)}</b><span>na conta ${nomeConta(i)}</span><span class="kd-p">${s ? num(s.pontos) : '—'} pts</span>
    <span class="sp"></span><span class="hint" style="margin:0">Mesmo player da doca: o que você mudar aqui continua.</span>
    <span class="kk-zoom"><button data-kkzoom="-1" title="Diminuir (Ctrl −)">−</button><b>${Math.round(ZOOMKK * 100)}%</b><button data-kkzoom="1" title="Aumentar (Ctrl +)">+</button></span>
    <button class="ksom ${somOn ? 'on' : ''}" data-kksom="${i}|${esc(slug)}">${somOn ? '🔊 Som ligado' : '🔇 Sem som'}</button><button data-kkfechar="1">▾ Minimizar</button></div><div id="kktela"></div>`;
  if (p.dataset.h !== html) { p.innerHTML = html; p.dataset.h = html; }
}
// ------------------------------------------------------------------ modos e atualização
const MODO_TOAST = {
  normal: 'Modo Normal: cena do jogo ligada em todas as contas',
  eco: 'Modo Eco: cena desligada em todas as contas (a caça continua)',
  ultra: 'Ultra eco: os jogos seguem rodando, só não são desenhados',
};
function renderModos() {
  document.querySelectorAll('#modos [data-modo]').forEach((b) => b.classList.toggle('on', b.dataset.modo === MODO));
  renderUltra();
}
// Ultra eco: os jogos não são desenhados (nem por dentro); no lugar, um cartão por conta com o
// que dá para acompanhar de longe. Cada cartão só é redesenhado quando o conteúdo dele muda.
const ACHADOS = [
  ['bossTokens', 'Boss Token'], ['fragChave', 'Frag. de chave'], ['fragBicicleta', 'Frag. de bike'], ['fragShiny', 'Frag. shiny stone'],
  ['fragMega', 'Frag. mega'], ['fragMegaShiny', 'Frag. mega shiny'], ['tmPeca', 'Peça de TM'], ['tmPecaAoe', 'Peça de TM AoE'],
  ['ticketMistico', 'Mystic Ticket'], ['ticketSafari', 'Safari Ticket'], ['fragOvoShiny', 'Frag. ovo shiny'],
];
const ONDE = { equipe: 'na equipe', colecao: 'na Coleção', depot: 'no Depot', chegando: 'chegando', fora: 'saiu da conta' };
let uDet = null;
let ORIGEM_JOGO = 'https://pokeidle.io';
// ícone de item/bola do próprio jogo; se não carregar, some (sem ícone quebrado)
const ico = (src, cls = '') => (src ? `<img class="u-ico ${cls}" data-ico alt="" src="${esc(ORIGEM_JOGO + src)}">` : `<span class="u-ico vazio ${cls}"></span>`);
document.addEventListener('error', (e) => { const t = e.target; if (t?.tagName === 'IMG' && t.dataset?.ico != null) t.classList.add('falhou'); }, true);          // Ultra eco: "Ver tudo" aberto { i, aba: 'capturas'|'itens', filtro }
const ICONE_FEED = { captura: '●', shiny: '✨', drop: '◆', boss: '♛', desmaio: '✖' };
const tempoCurto = (ms) => { const m = Math.floor(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`; };
const horaCurta = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function retratoPk(pk) {
  if (!pk) return '';
  const dex = PieHunt.dexDoRetrato(pk.speciesId);
  return dex > 0 ? `<img alt="" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pk.shiny ? 'shiny/' : ''}${dex}.png">` : '';
}
function barraHp(p, grande) {
  const max = Number(p?.maxHp) || 0, hp = Math.max(0, Number(p?.hp) || 0);
  if (!max) return '';
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  const cor = pct > 50 ? 'ok' : pct > 20 ? 'warn' : 'bad';
  return `<div class="u-hp ${grande ? 'g' : ''} ${cor}" title="${num(hp)} / ${num(max)} HP"><i style="width:${pct.toFixed(1)}%"></i></div>`;
}
// O que a conta usa de bola e de poção: as que você escolheu no automático do jogo (todas, na
// ordem dele); sem nenhuma lá, a da nossa regra de compra.
function consumiveis(i, kind) {
  const s = S[i], snap = s.snap, cat = s.catalog;
  const ga = snap?.gameAuto || {};
  const rid = kind === 'ball' ? ID_BOLA : ID_POCAO;
  const r = regra(i, rid);
  let ids = (kind === 'ball' ? ga.ballIds : ga.potionIds) || [];
  if (!ids.length && r?.refId != null) ids = [r.refId];
  return ids.map((id) => {
    const nome = kind === 'ball' ? (cat?.bolas?.find((b) => b.id === Number(id))?.nome || `Bola ${id}`) : (cat?.items?.[id]?.name || `Item ${id}`);
    const q = estoque(i, kind, id) ?? 0;
    const pouco = q < Math.max(1, r?.enabled && Number(r.refId) === Number(id) ? r.min : kind === 'ball' ? 50 : 20);
    const b = snap?.bolsa;
    const ic = (kind === 'ball' ? b?.bolas : b?.cura)?.find((x) => Number(x.id) === Number(id))?.ico ?? null;
    return { id, nome, q, pouco, ico: ic };
  });
}
// Todas as bolas que a conta tem (as escolhidas no automático primeiro, marcadas).
function bolasDaConta(i) {
  const esc0 = consumiveis(i, 'ball');
  const sel = new Set(esc0.map((x) => Number(x.id)));
  const todas = S[i].snap?.bolsa?.bolas;
  if (!todas) return esc0.map((x) => ({ ...x, sel: true }));
  const lista = todas.map((b) => ({ ...b, sel: sel.has(Number(b.id)), pouco: sel.has(Number(b.id)) && (esc0.find((x) => Number(x.id) === Number(b.id))?.pouco) }));
  for (const x of esc0) if (!lista.some((b) => Number(b.id) === Number(x.id))) lista.push({ ...x, sel: true });
  return lista.sort((a, b) => (b.sel - a.sel) || (Number(a.id) - Number(b.id)));
}
function ultraDados(i) {
  const s = S[i], snap = s.snap;
  if (!snap?.ready) return { i, carregando: true };
  const agora = Date.now();
  const team = snap.team || [];
  const pk = team.find((p) => p.id === snap.activeId) || s.pk || team[0] || null;
  const ses = snap.sessao, sesH = ses && ses.ms >= 5 * 60000 ? 3600000 / ses.ms : null;
  let lugar = 'fora de hunt', st = 'parado', cls = 'warn';
  if (!snap.connected) { lugar = 'sem conexão com o jogo'; st = 'desconectado'; cls = 'bad'; }
  else if (snap.arena) { lugar = 'Arena do boss'; st = 'boss'; cls = 'ok'; }
  else if (snap.mistico) { lugar = 'Arena Mística'; st = 'mística'; cls = 'ok'; }
  else if (snap.noCentro) { lugar = 'Centro Pokémon'; st = 'curando'; cls = 'warn'; }
  else if (snap.huntSlug) { lugar = nomeHunt(i, snap.huntSlug); st = 'caçando'; cls = 'ok'; }
  const parado = st === 'caçando' && snap.ultimoCombate && agora - snap.ultimoCombate > 5 * 60000;
  if (parado) { st = `sem luta há ${tempoCurto(agora - snap.ultimoCombate)}`; cls = 'warn'; }
  if (S[i].alerta && cls === 'ok') cls = 'warn';
  const b = snap.bonus || {}, bonus = [];
  if (b.vipAte > agora) bonus.push('VIP');
  if (b.twitchPct > 0) bonus.push(`Twitch +${b.twitchPct}%`);
  if (Object.values(snap.kick?.bonus || {}).some((t) => t > agora)) bonus.push('Kick');
  if (b.guildBoostAte > agora) bonus.push('Guild');
  return {
    i, pk, team, lugar, st, cls, bonus, ses,
    area: snap.huntSlug && !snap.noCentro ? s.rAtual?.hunt?.area : '',
    xp: xphReal(i), xpEst: xphReal(i) == null ? S[i].rAtual?.xpH ?? null : null,
    ouroH: sesH && ses.gold ? Math.round(ses.gold * sesH) : null,
    abH: snap.xpMedido?.kph ?? (sesH && ses.abates ? Math.round(ses.abates * sesH) : null),
    bolas: bolasDaConta(i), pocs: consumiveis(i, 'item'), bolsa: snap.bolsa || null,
    capturas: snap.capturas || [],
    achados: ses ? ACHADOS.filter(([k]) => ses[k] > 0).map(([k, n]) => [n, ses[k]]) : [],
    feed: (snap.feed || []).slice(-3).reverse(),
    desmaiosH: snap.desmaiosH || 0,
  };
}
function cartaoUltra(d) {
  const i = d.i, c = cfgDe(i), snap = S[i].snap;
  const sw = (k, nome, on) => `<button class="u-sw ${on ? 'on' : ''}" data-am="${i}|${k}" title="Abrir ${nome.toLowerCase()}"><i data-amt="${i}|${k}" title="${on ? 'Desligar' : 'Ligar'} sem abrir"></i>${nome}</button>`;
  const chaves = `<div class="u-sws"><label class="sw u-master" title="Chave geral desta conta"><input type="checkbox" data-master="${i}" ${c.enabled ? 'checked' : ''}><span class="tg"></span><span>Automação</span></label>`
    + `<span class="u-swg ${c.enabled ? '' : 'desl'}">${sw('bola', 'Bola', regra(i, ID_BOLA)?.enabled)}${sw('poc', 'Poção', regra(i, ID_POCAO)?.enabled)}${sw('mapa', 'Mapa', c.autoHunt?.enabled)}${sw('sniper', 'Sniper', c.sniper?.enabled)}</span></div>`;
  if (d.carregando) return `<div class="u-cab2"><span class="dot"></span><b>${nomeConta(i)}</b><span class="u-st">carregando o jogo…</span></div>${chaves}`;
  const pk = d.pk, ses = d.ses;
  const outros = d.team.filter((p) => p !== pk);
  const num2 = (v, est) => (v == null ? '—' : (est ? '≈ ' : '') + curto(v));
  const cons = (lista, tipo) => lista.map((x) => `<span class="u-it ${x.pouco ? 'pouco' : ''} ${tipo === 'poc' || x.sel ? 'sel' : ''}" title="${esc(x.nome)}${x.pouco ? ' · está acabando' : tipo === 'poc' || x.sel ? ' · em uso no automático' : ''}">${ico(x.ico)}<b>${num(x.q)}</b></span>`).join('');
  const chipsBolsa = (lista, cls, rot) => (lista?.length ? `<div class="u-grupo ${cls}" data-udet="${i}|bolsa" title="Ver a bolsa"><small>${rot} <b>${num(lista.reduce((t, x) => t + x.q, 0))}</b></small><div class="u-its">${lista.map((x) => `<span class="u-it" title="${esc(x.nome)}">${ico(x.ico)}<b>${num(x.q)}</b></span>`).join('')}</div></div>` : '');
  const caps = d.capturas.slice(0, 7);
  return `<div class="u-cab2"><span class="dot ${d.cls === 'ok' ? 'hunt' : d.cls === 'bad' ? 'bad' : 'fight'}"></span><b>${nomeConta(i)}</b><small>Nv ${num(snap.level)}</small>`
    + `${d.bonus.map((x) => `<span class="u-bn">${esc(x)}</span>`).join('')}<span class="sp"></span><span class="u-st ${d.cls}">${esc(d.st)}</span><button class="u-ver" data-udet="${i}|capturas" title="Capturas, itens e gastos desta conta">Ver tudo</button></div>`
    + `<div class="u-pkb"><div class="u-ret">${retratoPk(pk)}</div><div class="u-pki">`
    + `<div class="u-pkn">${pk ? `${pk.shiny ? '✨ ' : ''}<b>${esc(pk.nome)}</b> <small>Nv ${num(pk.level)}</small>` : '<small>sem pokémon ativo</small>'}</div>`
    + barraHp(pk, true)
    + `<div class="u-lug">${esc(d.lugar)}${d.area ? ` <small>${esc(String(d.area).replace(/^./, (x) => x.toUpperCase()))}</small>` : ''}</div>`
    + (outros.length ? `<div class="u-time">${outros.slice(0, 5).map((p) => `<span title="${esc(p.nome)} Nv ${num(p.level)}">${barraHp(p)}</span>`).join('')}</div>` : '')
    + `</div></div>`
    + `<div class="u-nums"><div><small>XP/h${d.xp == null && d.xpEst != null ? ' (estim.)' : ''}</small><b class="xp">${num2(d.xp ?? d.xpEst, d.xp == null && d.xpEst != null)}</b></div>`
    + `<div><small>Ouro/h</small><b class="ouro">${num2(d.ouroH)}</b></div><div><small>Abates/h</small><b>${num2(d.abH)}</b></div></div>`
    + `<div class="u-sal"><span>Ouro <b>${curto(snap.gold)}</b></span><span>Gemas <b>${num(snap.orbs)}</b></span>${snap.diamonds ? `<span>Diamantes <b>${num(snap.diamonds)}</b></span>` : ''}</div>`
    + `<div class="u-grupo"><small>Pokébolas</small><div class="u-its">${cons(d.bolas, 'bola') || '<span class="hint">nenhuma</span>'}</div></div>`
    + `<div class="u-grupo"><small>Poções em uso</small><div class="u-its">${cons(d.pocs, 'poc') || '<span class="hint">nenhuma escolhida</span>'}</div></div>`
    + chipsBolsa(d.bolsa?.raros, 'raros', 'Itens raros') + chipsBolsa(d.bolsa?.pedras, 'pedras', 'Pedras')
    + (caps.length ? `<div class="u-caps" data-udet="${i}|capturas" title="Ver todas as capturas">${caps.map((p) => `<span class="u-cap ${p.shiny ? 'sh' : ''} ${p.onde}" title="${esc(p.nome)} Nv ${num(p.level)} · ${ONDE[p.onde]}">${retratoPk(p)}<i></i></span>`).join('')}<span class="u-mais">ver tudo ›</span></div>` : '')
    + (d.feed.length ? `<div class="u-feed">${d.feed.map((f) => `<div class="${f.tipo}"><small>${horaCurta(f.t)}</small> ${ICONE_FEED[f.tipo] || '·'} ${esc(f.texto)}</div>`).join('')}</div>` : '')
    + chaves;
}

function detalheHTML(i, aba, filtro) {
  const s = S[i], snap = s.snap || {}, ses = snap.sessao, cat = s.catalog;
  const caps = snap.capturas || [];
  const conta = (o) => caps.filter((c) => c.onde === o).length;
  const abas = `<div class="sn-abas"><button class="${aba === 'capturas' ? 'on' : ''}" data-udet="${i}|capturas">Capturas <b>${caps.length}</b></button><button class="${aba === 'bolsa' ? 'on' : ''}" data-udet="${i}|bolsa">Bolsa</button></div>`;
  const cab = `<div class="ph2"><span>${nomeConta(i)}</span><button class="ib" data-ufechar="1" title="Fechar (Esc)">${ICON.x}</button></div>${abas}`;
  if (aba === 'bolsa') {
    const b = snap.bolsa || { bolas: [], raros: [], pedras: [] };
    const sel = new Set(consumiveis(i, 'ball').map((x) => Number(x.id)));
    const tab = (lista, vazio, marca) => (lista.length ? `<table class="u-tab"><tr><th></th><th>Item</th><th class="n">Qtd</th></tr>${lista.map((x) => `<tr><td class="u-tico">${ico(x.ico)}</td><td>${esc(x.nome)}${marca && marca(x) ? ' <span class="u-onde equipe">em uso</span>' : ''}</td><td class="n">${num(x.q)}</td></tr>`).join('')}</table>` : `<div class="hint">${vazio}</div>`);
    const total = (l) => num(l.reduce((t, x) => t + x.q, 0));
    return cab + `<div class="u-dcols3"><div><div class="u-dsec">Pokébolas</div>${tab(b.bolas, 'Nenhuma bola.', (x) => sel.has(Number(x.id)))}<div class="u-dsec">Poções e revives</div>${tab(b.cura || [], 'Nenhuma.', (x) => consumiveis(i, 'item').some((c) => Number(c.id) === Number(x.id)))}</div>`
      + `<div><div class="u-dsec">Itens raros <small>${total(b.raros)} no total</small></div>${tab(b.raros, 'Nenhum item raro.')}</div><div><div class="u-dsec">Pedras <small>${total(b.pedras)} no total</small></div>${tab(b.pedras, 'Nenhuma pedra.')}</div></div>`;
  }
  if (aba === 'itens') {
    const nomeBola = (id) => cat?.bolas?.find((b) => b.id === Number(id))?.nome || `Bola ${id}`;
    const nomeItem = (id) => cat?.items?.[id]?.name || `Item ${id}`;
    const gasto = (m, nome) => Object.entries(m || {}).filter(([, q]) => q > 0).map(([id, q]) => `<tr><td>${esc(nome(id))}</td><td class="n">${num(q)}</td></tr>`).join('');
    const raros = ses ? ACHADOS.filter(([k]) => ses[k] > 0) : [];
    return cab + (ses ? `<div class="u-dres">Sessão de <b>${tempoCurto(ses.ms)}</b> · <b>${num(ses.abates)}</b> abates · <b>${curto(ses.gold)}</b> de ouro · <b>${num(ses.capturas)}</b> capturas</div>` : '<div class="vazio-top">O jogo ainda não gravou a sessão desta conta.</div>')
      + (raros.length ? `<div class="u-dsec">Achados raros</div><div class="u-ach">${raros.map(([k, n]) => `<span>${esc(n)} <b>×${num(ses[k])}</b></span>`).join('')}</div>` : '')
      + `<div class="u-dsec">Gastos na sessão</div>`
      + (ses && (gasto(ses.bolas, nomeBola) || gasto(ses.pocoes, nomeItem)) ? `<table class="u-tab"><tr><th>Usado</th><th class="n">Qtd</th></tr>${gasto(ses.bolas, nomeBola)}${gasto(ses.pocoes, nomeItem)}</table>` : '<div class="hint">Nada gasto ainda.</div>');
  }
  const fs = [['todos', 'Todas', caps.length], ['shiny', '✨ Shiny', caps.filter((c) => c.shiny).length], ['equipe', 'Equipe', conta('equipe')], ['colecao', 'Coleção', conta('colecao')], ['depot', 'Depot', conta('depot')], ['fora', 'Saíram', conta('fora')]];
  const f = filtro || 'todos';
  const lista = caps.filter((c) => f === 'todos' || (f === 'shiny' ? c.shiny : c.onde === f));
  return cab + `<div class="u-filtros">${fs.map(([k, n, q]) => `<button class="${f === k ? 'on' : ''}" data-ufil="${k}">${n} <b>${q}</b></button>`).join('')}</div>`
    + (lista.length ? `<table class="u-tab u-captab"><tr><th></th><th>Pokémon</th><th class="n">Nv</th><th class="n">Qualidade</th><th class="n">IV</th><th>Onde está</th><th class="n">Hora</th></tr>`
      + lista.map((c) => `<tr class="${c.shiny ? 'sh' : ''}"><td class="u-mini">${retratoPk(c)}</td><td>${c.shiny ? '✨ ' : ''}${esc(c.nome)}</td><td class="n">${num(c.level)}</td><td class="n">${c.quality != null ? n1(c.quality) : '—'}</td><td class="n">${c.iv != null ? num(c.iv) : '—'}</td><td><span class="u-onde ${c.onde}">${ONDE[c.onde] || c.onde}</span></td><td class="n">${c.em ? new Date(c.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td></tr>`).join('') + '</table>'
      : `<div class="vazio-top">${caps.length ? 'Nenhuma captura neste filtro.' : 'Nenhuma captura guardada pelo jogo nesta conta ainda.'}</div>`)
    + '<div class="hint">As últimas 100 capturas, como o jogo guarda no histórico dele. "Saíram" = vendidas, oferendadas ou anunciadas.</div>';
}
// A janela por cima dos cartões: o painel de uma automação (o mesmo do modo normal) ou o "Ver tudo".
let uModalPend = false;
function renderUltraModal(el) {
  let box = el.querySelector('.u-modal');
  const conteudo = painel ? `<div class="panel on u-mpanel" data-ovbox>${painelHTML(painel.i, painel.k)}</div>`
    : uDet && S[uDet.i] && !S[uDet.i].desligada ? `<div class="panel on u-mpanel u-mdet" data-ovbox>${detalheHTML(uDet.i, uDet.aba, uDet.filtro)}</div>` : '';
  if (!conteudo) { if (box) box.remove(); return; }
  if (!box) { box = document.createElement('div'); box.className = 'u-modal'; el.appendChild(box); box.dataset.h = ''; }
  // não redesenha enquanto você digita num campo
  const ativo = document.activeElement;
  if (ativo && box.contains(ativo) && ativo.matches('input,select')) { uModalPend = true; return; }
  uModalPend = false;
  if (box.dataset.h !== conteudo) { const rolagem = box.firstElementChild?.scrollTop || 0; box.innerHTML = conteudo; box.dataset.h = conteudo; if (box.firstElementChild) box.firstElementChild.scrollTop = rolagem; }
}
document.addEventListener('focusout', () => setTimeout(() => { if (uModalPend && MODO === 'ultra') renderUltra(); }, 0));
function renderUltra() {
  const el = $('#ultra');
  const on = MODO === 'ultra';
  document.body.classList.toggle('modo-ultra', on);
  if (!on) { if (el.innerHTML) { el.innerHTML = ''; el.dataset.h = ''; } return; }
  const ligadas = [];
  for (let i = 0; i < N; i++) if (S[i] && !S[i].desligada) ligadas.push(i);
  const dados = ligadas.map(ultraDados);
  const soma = (f) => dados.reduce((t, d) => t + (Number(f(d)) || 0), 0);
  const somaBolsa = (k) => soma((d) => (d.bolsa?.[k] || []).reduce((t, x) => t + x.q, 0));
  const tot = {
    ouroH: soma((d) => d.ouroH), xp: soma((d) => d.xp ?? d.xpEst),
    ouro: soma((d) => (d.carregando ? 0 : S[d.i].snap?.gold)), gemas: soma((d) => (d.carregando ? 0 : S[d.i].snap?.orbs)),
    raros: somaBolsa('raros'), pedras: somaBolsa('pedras'),
  };
  const esq = `<div class="u-tot"><div class="u-tit">Ultra eco<small>os jogos seguem rodando, só não são desenhados</small></div>`
    + `<div><small>Ouro/h</small><b class="ouro">${curto(tot.ouroH)}</b></div><div><small>XP/h somado</small><b class="xp">${curto(tot.xp)}</b></div>`
    + `<div><small>Ouro (todas)</small><b class="ouro">${curto(tot.ouro)}</b></div><div><small>Gemas (todas)</small><b>${num(tot.gemas)}</b></div>`
    + `<div><small>Itens raros</small><b>${num(tot.raros)}</b></div><div><small>Pedras</small><b>${num(tot.pedras)}</b></div>`
    + `<span class="sp"></span><div class="u-b"><button data-modo="eco">Ver os jogos (Eco)</button><button data-modo="normal" class="ghost">Normal</button></div></div>`;
  const forma = `${ligadas.join(',')}`;
  if (el.dataset.forma !== forma || !el.querySelector('.u-tot')) {
    el.innerHTML = `<div class="u-wrap"><div class="u-topo"></div>${ligadas.length ? `<div class="u-cards n${ligadas.length}">${ligadas.map((i) => `<div class="u-card" data-uc="${i}"></div>`).join('')}</div>` : '<div class="u-vazio">Todas as contas estão desligadas.</div>'}</div>`;
    el.dataset.forma = forma;
  }
  const topo = el.querySelector('.u-topo');
  if (topo.dataset.h !== esq) { topo.innerHTML = esq; topo.dataset.h = esq; }
  for (const d of dados) {
    const box = el.querySelector(`[data-uc="${d.i}"]`);
    if (!box) continue;
    const h = cartaoUltra(d);
    if (box.dataset.h !== h) { box.innerHTML = h; box.dataset.h = h; }
  }
  renderUltraModal(el);
}
// Botão da versão: só diz se tem atualização ou não (sem "procurando").
function renderAtt() {
  const b = $('#att');
  if (!b || !ATT) return;
  const v = 'v' + ATT.atual;
  let txt = v, cls = '', tit = 'Clique para procurar atualização';
  if (ATT.fase === 'verificando') return;   // fica como estava
  if (ATT.fase === 'pronto') { txt = `Atualizar para ${ATT.nova}`; cls = 'novo'; tit = 'Fecha o app, instala e abre de novo (uns 20 s). Logins e configurações continuam.' + (ATT.notas ? '\n\nNovidades:\n' + ATT.notas : ''); }
  else if (ATT.fase === 'baixando') { txt = `Nova versão ${ATT.nova} · ${Math.round((ATT.progresso || 0) * 100)}%`; cls = 'baixa'; tit = 'Baixando a versão nova em segundo plano'; }
  else if (ATT.fase === 'instalando') { txt = 'Instalando…'; cls = 'baixa'; }
  else if (ATT.fase === 'em-dia') { txt = v + ' · atualizado'; tit = 'Você está na versão mais nova. Clique para procurar de novo.'; }
  else if (ATT.fase === 'erro') tit = 'Não deu para procurar atualização: ' + ATT.erro + '\nClique para tentar de novo';
  else if (ATT.fase === 'sem-repo') tit = 'Atualização automática não configurada';
  b.textContent = txt;
  b.className = 'att ' + cls;
  b.title = tit;
}

// ---- Kick global (barra de cima): liga/desliga em todas as contas logadas na Kick de uma vez.
// Cada conta continua com o seu painel K; aqui é só o atalho. Cinza = nenhuma, meio = algumas.
const KKG = [
  { campo: 'ligado', nome: 'Farmar', de: (k) => !!k.ligado, tit: 'Farmar pontos (player mudo) em todas as contas logadas na Kick' },
  { campo: 'leve', nome: 'Player leve', de: (k) => !k.completo, tit: 'Player leve (só vídeo, menos RAM) em todas. Desligado = página completa da Kick' },
];
const contasKick = () => Array.from({ length: N }, (_, i) => i).filter((i) => KK.contas[i]?.user && !S[i]?.desligada);
function renderKickGlobal() {
  const el = $('#kkg');
  if (!el) return;
  const cs = contasKick();
  el.classList.toggle('vazio', !cs.length);
  const html = `<span class="kkg-t" title="Kick: vale para todas as contas logadas na Kick (${cs.length})">${ICON.kk}</span>` + KKG.map((g) => {
    const n = cs.filter((i) => g.de(KK.contas[i])).length;
    const st = !cs.length || !n ? '' : n === cs.length ? 'on' : 'meio';
    return `<button data-kkg="${g.campo}" class="${st}" ${cs.length ? '' : 'disabled'} title="${g.tit}${st === 'meio' ? ` (ligado em ${n} de ${cs.length}; clique liga em todas)` : ''}">${g.nome}</button>`;
  }).join('');
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
}
async function kickGlobal(campo) {
  const g = KKG.find((x) => x.campo === campo), cs = contasKick();
  if (!g || !cs.length) return;
  const ligar = !cs.every((i) => g.de(KK.contas[i]));
  for (const i of cs) {
    if (g.de(KK.contas[i]) === ligar) continue;
    if (campo === 'leve') await app.kick.set(i, 'completo', !ligar);
    else await app.kick.set(i, campo, ligar);
  }
  toast(`${g.nome}: ${ligar ? 'ligado' : 'desligado'} em ${cs.length} conta${cs.length > 1 ? 's' : ''}`);
}

function renderTudo() {
  renderKkVer();
  renderKickGlobal();
  $('#grid').classList.toggle('focus', foco != null);
  aplicarGrade();
  renderKickDock();
  for (let i = 0; i < N; i++) renderSlot(i);
  renderTopo();
  renderModos();
  requestAnimationFrame(() => { enviarLayout(); desenharDivisores(); });
}

// ------------------------------------------------------------------ overlay por cima do jogo
// O jogo é uma view nativa: HTML da interface não fica por cima dele. Os menus abrem numa view
// transparente própria, posta sobre o quadrado. O jogo continua visível e rodando por baixo.
function ovAberto() {
  if (painel) return { i: painel.i, kind: 'panel', html: () => painelHTML(painel.i, painel.k) };
  if (menu != null) return { i: menu, kind: 'menu', html: () => menuHTML(menu) };
  if (twHover != null) return { i: twHover, kind: 'pop', html: () => (popTipo === 'kk' ? kickHTML(twHover) : twitchHTML(twHover)) };
  return null;
}
let ovUltimo = '';
function ovSync() {
  if (MODO === 'ultra') {
    if (ovUltimo !== 'null') { ovUltimo = 'null'; app.overlay(null); }
    renderUltra();
    return;
  }
  const o = ovAberto();
  const msg = o ? { slot: o.i, kind: o.kind, html: o.html() } : null;
  const k = JSON.stringify(msg);
  if (k === ovUltimo) return;
  ovUltimo = k;
  app.overlay(msg);
}
function abrir(estado) {
  if (estado.painel) uDet = null;
  painel = estado.painel !== undefined ? estado.painel : painel;
  menu = estado.menu !== undefined ? estado.menu : menu;
  twHover = estado.twHover !== undefined ? estado.twHover : twHover;
  for (let i = 0; i < N; i++) renderSlot(i);
  ovSync();
}
const fecharTudo = () => abrir({ painel: null, menu: null, twHover: null });

// ------------------------------------------------------------------ eventos
const ALVOS = '[data-udet],[data-ufil],[data-ufechar],[data-sntab],[data-voltar],[data-amt],[data-kkg],[data-kkzoom],[data-kkfechar],[data-kksom],[data-kkver],[data-kkvis],[data-kdmin],[data-kkbtn],[data-kklogin],[data-kkres],[data-lay],[data-power],[data-am],[data-gear],[data-max],[data-th],[data-link],[data-unlink],[data-cid],[data-reload],[data-fechar],[data-twcanal],[data-twbtn],[data-zoom],#alertaG,[data-modo],#att';
document.addEventListener('click', (e) => {
  const t = e.target.closest(ALVOS);
  if (!t) {
    if (e.target.closest('[data-ovbox]')) return;           // dentro da janela do Ultra eco
    if (uDet && e.target.closest('.u-modal')) { uDet = null; renderUltra(); return; }
    if (menu != null || painel) abrir({ menu: null, painel: null });
    return;
  }
  acaoClick({ ...t.dataset }, t.id, {});
});
async function acaoClick(d, id, campos) {
  if (d.modo) {
    if (d.modo === 'ultra') { foco = null; kkVer = null; painel = null; menu = null; twHover = null; }
    MODO = await app.modo(d.modo);
    renderTudo(); ovSync();
    toast(MODO_TOAST[MODO]);
  } else if (id === 'att') {
    if (ATT?.fase === 'pronto') { toast('Instalando a versão nova… o app abre sozinho em seguida'); app.att.instalar(); return; }
    if (ATT && ['baixando', 'verificando', 'instalando'].includes(ATT.fase)) return;
    ATT = await app.att.verificar(); renderAtt();
    if (ATT.fase === 'em-dia') toast('Você já está na versão mais nova');
    else if (ATT.fase === 'pronto') toast(`Versão ${ATT.nova} baixada: clique em "Atualizar para ${ATT.nova}"`);
    else if (ATT.fase === 'erro') toast('Não deu para procurar: ' + ATT.erro);
    else if (ATT.fase === 'sem-repo') toast('Atualização automática ainda não configurada');
  } else if (id === 'alertaG') {
    if (d.i !== '') { foco = +d.i; painel = { i: +d.i, k: 'mapa' }; renderTudo(); abrir({}); }
  } else if (d.kkg) {
    await kickGlobal(d.kkg);
  } else if (d.kkver) {
    const [i, slug] = d.kkver.split('|');
    kkVer = kkVer && kkVer.i === +i && kkVer.slug === slug ? null : { i: +i, slug };
    foco = null; painel = null; menu = null; twHover = null;
    renderTudo(); ovSync();
  } else if (d.kkzoom) {
    app.kick.zoom(+d.kkzoom);
  } else if (d.kkfechar) {
    kkVer = null; renderTudo();
  } else if (d.kksom) {
    const [i, slug] = d.kksom.split('|');
    await app.kick.som(+i, slug, !KKSOM[i + '|' + slug]);
  } else if (d.kkvis) {
    const i = +d.kkvis;
    await app.kick.set(i, 'visivel', !KK.contas[i]?.visivel);
  } else if (d.kdmin) {
    if (telaCheia()) kdockMinTela = !kdockMinTela;
    else {
      kdockMin = !kdockMin;
      try { localStorage.setItem('pie-kdock-min', kdockMin ? '1' : '0'); } catch (_) { /* ok */ }
    }
    renderKickDock();
  } else if (d.kkbtn != null && d.kkbtn !== undefined && d.kkbtn !== '') {
    const i = +d.kkbtn;
    popTipo = 'kk';
    abrir({ twHover: twHover === i ? null : i, menu: null, painel: null });
  } else if (d.kklogin) {
    abrir({ menu: null, twHover: null });
    app.kick.login(+d.kklogin);
    toast('Entre na Kick na janela que abriu. Feche a janela quando terminar.');
  } else if (d.kkres) {
    const [i, slug] = d.kkres.split('|');
    const r = await app.kick.resgatar(+i, slug, KK.contas[+i]?.tipo);
    toast(r?.erro ? 'Kick: ' + r.erro : `Resgatado: ${r.titulo || 'bônus'} (${num(r.custo)} pts)`);
  } else if (d.lay) {
    const [qtd, k] = d.lay.split('|');
    modoPorQtd[qtd] = k; salvarPref(); renderTudo();
  } else if (d.power) {
    const i = +d.power;
    if (!S[i].desligada && armado !== i) {
      armado = i; clearTimeout(armadoT); armadoT = setTimeout(() => { armado = null; }, 3000);
      return toast('Clique de novo no botão para desligar esta conta');
    }
    armado = null;
    if (ovAberto()?.i === i) fecharTudo();
    const ligada = await app.power(i, !!S[i].desligada);
    S[i].desligada = !ligada;
    if (!ligada) { S[i].res = null; S[i].top = []; S[i].alerta = null; if (foco === i) foco = null; }
    renderTudo();
    toast(ligada ? 'Conta ligada' : 'Conta desligada: jogo fechado, RAM liberada');
  } else if (d.udet) {
    const [i, aba] = d.udet.split('|');
    painel = null; menu = null; twHover = null;
    uDet = { i: +i, aba, filtro: uDet?.i === +i ? uDet.filtro : null };
    renderUltra();
  } else if (d.ufil) {
    if (uDet) { uDet.filtro = d.ufil; renderUltra(); }
  } else if (d.ufechar) {
    uDet = null; renderUltra();
  } else if (d.sntab) {
    snAba = d.sntab === 'compras' ? 'compras' : 'config';
    ovSync();
  } else if (d.voltar) {
    foco = null; kkVer = null; painel = null; menu = null; twHover = null;
    renderTudo(); ovSync();
  } else if (d.amt) {
    // a bolinha do botão: liga/desliga direto
    const [si, k] = d.amt.split('|'), i = +si;
    if (k === 'mapa') { const c = cfgDe(i); c.autoHunt.enabled = !c.autoHunt.enabled; salvarCfg(i, c); toast(`Mapa ${c.autoHunt.enabled ? 'ligado' : 'desligado'}`); }
    else if (k === 'sniper') { const on = !cfgDe(i).sniper.enabled; mudarSniper(i, { enabled: on }); toast(`Sniper ${on ? 'ligado' : 'desligado'}`); }
    else {
      const id = k === 'bola' ? ID_BOLA : ID_POCAO, on = !regra(i, id)?.enabled;
      mudarRegra(i, id, k === 'bola' ? 'ball' : 'item', { enabled: on });
      toast(`${k === 'bola' ? 'Compra de bola' : 'Compra de poção'} ${on ? 'ligada' : 'desligada'}`);
    }
    if (painel?.i === i) ovSync();
  } else if (d.am) {
    const [i, k] = d.am.split('|');
    abrir({ painel: painel?.i === +i && painel.k === k ? null : { i: +i, k }, menu: null, twHover: null });
  } else if (d.fechar) abrir({ painel: null });
  else if (d.gear) abrir({ menu: menu === +d.gear ? null : +d.gear, painel: null, twHover: null });
  else if (d.max) { foco = foco === +d.max ? null : +d.max; painel = null; menu = null; twHover = null; renderTudo(); ovSync(); }
  else if (d.th) { foco = +d.th; painel = null; menu = null; twHover = null; renderTudo(); ovSync(); }
  else if (d.twbtn) { popTipo = 'tw'; abrir({ twHover: twHover === +d.twbtn && popTipo === 'tw' ? null : +d.twbtn, menu: null, painel: null }); }
  else if (d.link) {
    const r = await app.twitch.vincular(+d.link);
    if (r?.erro === 'clientId') toast('Falta o Client ID da Twitch');
    else if (r?.erro) toast(r.erro);
  } else if (d.unlink) { await app.twitch.desvincular(+d.unlink); toast('Twitch desvinculada desta conta'); }
  else if (d.cid) {
    const v = String(campos['cid-' + d.cid] ?? '').trim();
    if (!v) return toast('Cole o Client ID');
    await app.twitch.clientId(v);
    toast('Client ID salvo');
  } else if (d.zoom) { const [i, p] = d.zoom.split('|'); app.zoom(+i, +p); }
  else if (d.reload) { app.recarregar(+d.reload); abrir({ menu: null }); }
  else if (d.twcanal) {
    const [i, c] = d.twcanal.split('|');
    const fixo = (TW.contas[+i]?.canais || []).includes(c);
    await app.twitch.canal(+i, c, !fixo);
  }
}
document.addEventListener('dblclick', (e) => {
  const h = e.target.closest('[data-dbl]');
  if (!h || e.target.closest('button,.pop,.menu')) return;
  const i = +h.dataset.dbl;
  foco = foco === i ? null : i; painel = null; menu = null; twHover = null;
  renderTudo(); ovSync();
});
// overlay da Twitch: abre ao passar o mouse
let saidaTw = null;
let armado = null, armadoT = null;   // desligar pede 2 cliques
document.addEventListener('mouseover', (e) => {
  const w = e.target.closest('[data-twwrap],.head [data-kkwrap]');
  if (!w) return;
  clearTimeout(saidaTw);
  const tipo = w.dataset.kkwrap != null ? 'kk' : 'tw';
  const i = +(w.dataset.kkwrap ?? w.dataset.twwrap);
  if ((twHover !== i || popTipo !== tipo) && painel == null && menu == null) { popTipo = tipo; abrir({ twHover: i }); }
});
document.addEventListener('mouseout', (e) => {
  const w = e.target.closest('[data-twwrap],.head [data-kkwrap]');
  if (!w || w.contains(e.relatedTarget)) return;
  clearTimeout(saidaTw);
  fecharTwDepois();
});
function fecharTwDepois() {
  clearTimeout(saidaTw);
  saidaTw = setTimeout(() => { if (twHover != null && !painel && menu == null) abrir({ twHover: null }); }, 400);
}
document.addEventListener('change', (e) => acaoChange({ ...e.target.dataset }, e.target.value, e.target.checked));
function acaoChange(d, value, checked) {
  const par = (v) => { const [i, k] = v.split('|'); return { i: +i, k, id: k === 'bola' ? ID_BOLA : ID_POCAO, kind: k === 'bola' ? 'ball' : 'item' }; };
  if (d.master) { const i = +d.master, c = cfgDe(i); c.enabled = checked; salvarCfg(i, c); toast(c.enabled ? 'Automação desta conta ligada' : 'Automação desta conta desligada'); }
  else if (d.mapa) { const i = +d.mapa, c = cfgDe(i); c.autoHunt.enabled = checked; salvarCfg(i, c); }
  else if (d.snon) mudarSniper(+d.snon, { enabled: checked });
  else if (d.snmodo) {
    const i = +d.snmodo;
    mudarSniper(i, { modo: value === 'comprar' ? 'comprar' : 'simular' });
    if (value === 'comprar') toast('Sniper vai COMPRAR de verdade (com a chave Automação ligada), dentro dos tetos');
  }
  else if (d.sndesc) mudarSniper(+d.sndesc, { desconto: Math.min(90, Math.max(1, Math.round(Number(value) || 30))) });
  else if (d.snper) { snPeriodo = Number(value) || 0; ovSync(); }
  else if (d.snamostras) mudarSniper(+d.snamostras, { amostras: Math.min(10, Math.max(2, Math.round(Number(value) || 4))) });
  else if (d.snres) mudarSniper(+d.snres, { reservaGold: Math.max(0, Math.round(Number(value) || 0)) });
  else if (d.snalvo) {
    const [i, k] = d.snalvo.split('|'), atuais = cfgDe(+i).sniper.alvos;
    mudarSniper(+i, { alvos: checked ? [...new Set([...atuais, k])] : atuais.filter((x) => x !== k) });
  }
  else if (d.snmoeda) { const [i, m] = d.snmoeda.split('|'); mudarSniper(+i, { moedas: { [m]: { ...cfgDe(+i).sniper.moedas[m], on: checked } } }); }
  else if (d.snteto) { const [i, m] = d.snteto.split('|'); mudarSniper(+i, { moedas: { [m]: { ...cfgDe(+i).sniper.moedas[m], tetoDia: Math.max(0, Math.round(Number(value) || 0)) } } }); }
  else if (d.twauto) app.twitch.auto(+d.twauto, checked);
  else if (d.kkset) { const [i, campo] = d.kkset.split('|'); if (campo === 'leve') app.kick.set(+i, 'completo', !checked); else app.kick.set(+i, campo, checked); }
  else if (d.kktipo) app.kick.set(+d.kktipo, 'tipo', value);
  else if (d.ron) { const p = par(d.ron); mudarRegra(p.i, p.id, p.kind, { enabled: checked }); }
  else if (d.rref) { const p = par(d.rref); const o = opcoes(p.i, p.kind).find((x) => x.id === Number(value)); if (o) mudarRegra(p.i, p.id, p.kind, { refId: o.id, label: o.nome }); }
  else if (d.rmin || d.rqty) {
    const p = par(d.rmin || d.rqty);
    const v = Math.max(1, Math.round(Number(value) || 1));
    mudarRegra(p.i, p.id, p.kind, d.rmin ? { min: v } : { qty: v });
  }
}
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input,select')) { if (e.key === 'Enter') e.target.blur(); return; }
  if (e.key === 'Escape') {
    if (uDet) { uDet = null; renderUltra(); }
    else if (painel || menu != null || twHover != null) fecharTudo();
    else if (kkVer) { kkVer = null; renderTudo(); }
    else if (foco != null) { foco = null; renderTudo(); }
  }
  if (/^[1-4]$/.test(e.key) && +e.key <= N) { foco = +e.key - 1; painel = null; menu = null; twHover = null; renderTudo(); ovSync(); }
});
// Arrastar o cabeçalho de uma conta e soltar no cabeçalho de outra: troca as duas de lugar.
let arrastando = null;
document.addEventListener('dragstart', (e) => {
  const h = e.target.closest?.('.head[data-dbl]');
  if (!h) return;
  arrastando = +h.dataset.dbl;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'conta-' + arrastando);
  document.body.classList.add('arrastando');
  if (ovAberto()) fecharTudo();
});
document.addEventListener('dragover', (e) => {
  const h = e.target.closest?.('.head[data-dbl]');
  if (arrastando == null || !h) return;
  e.preventDefault();
  document.querySelectorAll('.head.alvo').forEach((x) => x !== h && x.classList.remove('alvo'));
  if (+h.dataset.dbl !== arrastando) h.classList.add('alvo');
});
document.addEventListener('drop', (e) => {
  const h = e.target.closest?.('.head[data-dbl]');
  if (arrastando == null || !h) return;
  e.preventDefault();
  const alvo = +h.dataset.dbl;
  if (alvo !== arrastando) {
    const a = ordem.indexOf(arrastando), b = ordem.indexOf(alvo);
    [ordem[a], ordem[b]] = [ordem[b], ordem[a]];
    salvarPref(); renderTudo();
  }
});
document.addEventListener('dragend', () => {
  arrastando = null;
  document.body.classList.remove('arrastando');
  document.querySelectorAll('.head.alvo').forEach((x) => x.classList.remove('alvo'));
});

// eventos vindos do overlay (view transparente por cima do jogo)
app.onOverlay((ev) => {
  if (ev.tipo === 'click') acaoClick(ev.d || {}, ev.id || '', ev.campos || {});
  else if (ev.tipo === 'change') acaoChange(ev.d || {}, ev.value, ev.checked);
  else if (ev.tipo === 'drag-move') moverDivisor(ev.x, ev.y);
  else if (ev.tipo === 'drag-fim') fimDivisor();
  else if (ev.tipo === 'fora') fecharTudo();
  else if (ev.tipo === 'esc') fecharTudo();
  else if (ev.tipo === 'enter') clearTimeout(saidaTw);
  else if (ev.tipo === 'leave' && twHover != null && !painel && menu == null) fecharTwDepois();
});

// ------------------------------------------------------------------ dados do app
app.onDados((i, d) => {
  const s = S[i] || (S[i] = { top: [], medidas: {} });
  if ('snapshot' in d) { s.snap = d.snapshot; if (d.snapshot?.nick) s.nickSalvo = d.snapshot.nick; }
  if ('catalog' in d) { s.catalog = d.catalog; s.chave = ''; }
  if ('medidas' in d) s.medidas = d.medidas || {};
  if ('cfg' in d && d.cfg) s.cfg = d.cfg;
  if ('geo' in d) s.geo = d.geo || null;
  if ('sniper' in d) {
    const antes = s.sniper?.log?.at(-1)?.t || 0;
    s.sniper = d.sniper || null;
    for (const l of s.sniper?.log ?? []) if (l.t > antes && l.tipo === 'comprou') toast(`${nomeConta(i).replace(/<[^>]+>/g, '')}: ${l.texto}`);
    if (painel?.i === i && painel.k === 'sniper') ovSync();
  }
  agendarCalculo(i);
  renderSlot(i);
  if (MODO === 'ultra') renderUltra();
});
app.onModo((m) => { MODO = m; renderModos(); });
app.onJogo((e) => { JOGO = e; carregarMotor(); for (let i = 0; i < N; i++) renderSlot(i); });
app.att.onEstado((e) => { const antes = ATT?.fase; ATT = e; renderAtt(); if (e.fase === 'pronto' && antes !== 'pronto') toast(`Versão ${e.nova} pronta: clique em "Atualizar para ${e.nova}" lá em cima`); });
app.onZoom((i, z) => { if (!S[i]) return; S[i].zoom = z; if (menu === i) renderSlot(i); });
const fmtMb = (mb) => (mb >= 1024 ? n1(mb / 1024) + ' GB' : Math.round(mb) + ' MB');
app.onRelayout(() => requestAnimationFrame(enviarLayout));
app.onRam((r) => {
  $('#ram').textContent = fmtMb(r.total);
  const partes = r.contas.map((mb, i) => `${nomeConta(i).replace(/<[^>]+>/g, '')}: ${fmtMb(mb)}`);
  partes.push(`Placa de vídeo: ${fmtMb(r.gpu)}`, `App (interface, Twitch): ${fmtMb(r.app)}`);
  $('#ram').parentElement.title = 'Memória própria de cada parte (sem contar a compartilhada duas vezes)\n' + partes.join('\n');
});
app.twitch.onEstado((e) => { TW = e; for (let i = 0; i < N; i++) renderSlot(i); });
app.kick.onEstado((e) => {
  KK = e;
  renderKickGlobal();
  const antes = kkVer;
  for (let i = 0; i < N; i++) renderSlot(i);
  renderKkVer();
  if (antes && !kkVer) renderTudo(); else renderKickDock();
  if (twHover != null && popTipo === 'kk') ovSync();
});
app.kick.onZoom((z) => { ZOOMKK = z; renderKkVer(); });
app.kick.onAudio((m) => { KKSOM = m || {}; renderKickDock(); renderKkVer(); });

(async () => {
  const est = await app.estado();
  N = est.slots;
  TW = est.twitch;
  KK = est.kick || KK;
  ZOOMKK = est.zoomKick || 1;
  MODO = est.modo || null;
  if (est.origemJogo) ORIGEM_JOGO = est.origemJogo;
  ATT = est.att || null;
  renderAtt();
  // o que já chegou ao vivo (antes desta resposta) vale mais que o guardado
  for (let i = 0; i < N; i++) S[i] = Object.assign({ snap: est.stores[i].snapshot, catalog: est.stores[i].catalog, medidas: est.stores[i].medidas || {}, geo: est.stores[i].geo || null, sniper: est.stores[i].sniper || null, cfg: est.stores[i].cfg, top: [] }, S[i] || {}, { desligada: est.stores[i].desligada, nickSalvo: est.stores[i].nick });
  montar();
  renderTudo();
  JOGO = est.jogo || null;
  carregarMotor();
  for (let i = 0; i < N; i++) agendarCalculo(i);
  PieHunt.carregar().then(() => renderTudo()).catch(() => {}); // só para os retratos
})();
