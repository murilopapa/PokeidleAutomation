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
const POC = { 0: 'sem poção', 200: 'Small', 201: 'Great', 202: 'Ultra', 203: 'Hyper', 204: 'Ultimate' };
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
async function calcular(i) {
  const s = S[i];
  const snap = s.snap, catalog = s.catalog;
  const pk = (snap?.team ?? []).find((p) => p.id === snap?.activeId);
  if (!pk || !catalog?.combate || !snap?.ready) { s.res = null; s.top = []; s.alerta = null; s.rAtual = null; s.pk = pk || null; return; }
  if (s.calc) return;
  s.calc = true;
  try {
    const chave = [PieHunt.chaveFicha(pk, snap, catalog), snap.level, catalog.at].join('|');
    if (chave !== s.chave) { s.sim = await PieHunt.simular(pk, catalog, snap.level, snap); s.chave = chave; }
    s.pk = pk;
    s.res = PieHunt.ajustar(s.sim, snap, catalog, { medidas: s.medidas, pk });
    s.mult = PieHunt.multiplicadores(snap, catalog);
    const lista = s.res?.lista ?? [];
    s.top = lista.filter((r) => r.hunt?.slug && r.killsPorVida >= 5 && r.ttk <= 60).sort((a, b) => b.xpH - a.xpH).slice(0, 3);
    s.rAtual = lista.find((r) => r.hunt?.slug === snap.huntSlug) || null;
    s.alerta = PieHunt.decidir(lista, snap.huntSlug, AUTO_HUNT);
  } catch (e) { console.error(e); }
  finally { s.calc = false; }
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
    // conta expandida: as outras viram miniaturas AO VIVO na tira de baixo (nunca escondidas,
    // senão o navegador pausa o jogo delas)
    const mini = sl.getClientRects().length === 0;   // escondida (expandida outra conta, ou live da Kick aberta)
    const g = mini ? document.querySelector(`.mini[data-mini="${i}"]`) : $('.game', sl);
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
function xphAgora(i) {
  const s = S[i], m = s.snap?.xpMedido;
  if (m && m.slug === s.snap?.huntSlug && m.xpH != null) return m.xpH;
  return s.rAtual?.xpH ?? null;
}

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
    info = snap.huntSlug ? `${esc(nomeHunt(i, snap.huntSlug))}${x != null ? ` · <b>${curto(x)}</b> XP/h` : ''}` : 'fora de hunt';
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
    ${sw(`data-kkset="${i}|auto"`, k.auto, 'Resgatar sozinho')}
    ${sw(`data-kkset="${i}|leve"`, !k.completo, 'Player leve (só vídeo, gasta menos RAM)')}
    <label class="kk-tipo"><span>Bônus</span><select data-kktipo="${i}">${Object.entries(NOME_TIPO).map(([t, n]) => `<option value="${t}" ${k.tipo === t ? 'selected' : ''}>${n} · ${num(custoTipo(i, t))} pts</option>`).join('')}</select></label></div>`;
  if (!jg) return h + swHtml + '<div class="live"><span class="st">Esperando o jogo mandar os canais da Kick…</span></div>';
  if (!jg.vinculado) h += '<div class="aviso">Esta conta do jogo ainda não tem Kick vinculada (no jogo: Bônus na Kick → Vincular). Sem isso o resgate não vira bônus.</div>';
  else if (jg.login && k.user && jg.login.toLowerCase() !== k.user.toLowerCase()) h += `<div class="aviso">No jogo está vinculada <b>${esc(jg.login)}</b>, aqui está logada <b>${esc(k.user)}</b>. O resgate só vale na mesma conta.</div>`;
  h += swHtml;
  const ativos = Object.entries(jg.bonus || {}).filter(([, ate]) => ate > Date.now());
  if (ativos.length) h += `<div class="kk-ativos">${ativos.map(([t, ate]) => `<span>⚡ ${NOME_TIPO[t] || t} +${n1(jg.pct)}% · ${tempoRestante(ate - Date.now())}</span>`).join('')}</div>`;
  const custo = custoTipo(i, k.tipo);
  const canais = (jg.oficiais || []).filter((c) => c.ativo).sort((a, b) => Number(b.aoVivo) - Number(a.aoVivo) || (k.saldos?.[b.slug]?.pontos || 0) - (k.saldos?.[a.slug]?.pontos || 0));
  h += canais.map((c) => {
    const s = k.saldos?.[c.slug];
    return `<div class="live kk-canal"><span class="l" style="${c.aoVivo ? 'background:#53fc18' : 'background:var(--muted)'}"></span><span class="nm">${esc(c.nome || c.slug)}${(k.assistindo || []).includes(c.slug) ? ' <small>assistindo</small>' : ''}</span>
      <span class="st">${s ? num(s.pontos) + ' pts' : '—'}</span></div>`;
  }).join('') || '<div class="live"><span class="st">Nenhum canal oficial com pontos ativos.</span></div>';
  if (k.erro) h += `<div class="erro">${esc(k.erro)}</div>`;
  if (k.historico?.length) h += `<div class="hint" style="margin:6px 4px 0">Últimos resgates: ${k.historico.slice().reverse().map((r) => `${NOME_TIPO[r.tipo] || r.tipo} em ${esc(r.slug)} (${r.origem})`).join(' · ')}</div>`;
  return h;
}
// Minimizada, a doca vira uma faixa fina: os players ficam minúsculos, mas continuam na tela
// (player escondido pausa e a Kick para de contar os pontos).
let kdockMin = (() => { try { return localStorage.getItem('pie-kdock-min') === '1'; } catch (_) { return false; } })();
// Doca da Kick (embaixo): o player de cada conta que está farmando + saldo, sem abrir menu nenhum.
function renderKickDock() {
  const d = $('#kdock');
  const contas = S.map((s, i) => i).filter((i) => KK.contas[i]?.ligado && !S[i].desligada);
  d.classList.toggle('on', contas.length > 0);
  d.classList.toggle('min', kdockMin);
  const html = contas.map((i) => {
    const k = KK.contas[i], jg = S[i].snap?.kick, custo = custoTipo(i, k.tipo);
    const vendo = k.assistindo || [];
    const total = Object.values(k.saldos || {}).reduce((a, x) => a + (x.pontos || 0), 0);
    const nomeCanal = (slug) => esc((jg?.oficiais || []).find((c) => c.slug === slug)?.nome || slug);
    // cada live vira um botão (clique = abre a live grande numa janela); os players ficam escondidos,
    // a não ser que a conta esteja no modo "players visíveis"
    const chips = vendo.length
      ? vendo.map((slug) => `<div class="kcol"><span class="kchip-w ${kkVer?.i === i && kkVer.slug === slug ? 'aberta' : ''}"><button class="kchip" data-kkver="${i}|${esc(slug)}" title="Abrir esta live grande (é o mesmo player: qualidade, som e resgates que você mexer continuam)">${nomeCanal(slug)} <b>${k.saldos?.[slug] ? num(k.saldos[slug].pontos) : '—'}</b></button><button class="ksom ${KKSOM[i + '|' + slug] ? 'on' : ''}" data-kksom="${i}|${esc(slug)}" title="${KKSOM[i + '|' + slug] ? 'Tirar o som' : 'Ligar o som'}">${KKSOM[i + '|' + slug] ? '🔊' : '🔇'}</button></span>${k.visivel ? `<div class="kmini" data-kmini="${i}" data-kcanal="${esc(slug)}"></div>` : ''}</div>`).join('')
      : '<span class="kd-vazio">nenhuma live oficial com pontos no ar</span>';
    return `<div class="kd" data-kkwrap="${i}"><div class="kd-t" data-kkbtn="${i}" title="Abrir Kick desta conta"><b>${nomeConta(i)}</b>
      <span class="kd-p">${num(total)} pts</span><span class="kd-s">${vendo.length} ${vendo.length === 1 ? 'live' : 'lives'} · ${k.auto ? 'resgate auto' : 'resgate manual'}</span>${k.erro ? '<span class="kd-e">⚠ ver Kick</span>' : ''}</div>
      <div class="kchips">${chips}</div>
      <button class="kd-vis ${k.visivel ? 'on' : ''}" data-kkvis="${i}" title="${k.visivel ? 'Esconder os players (continuam rodando)' : 'Mostrar os players pequenos'}">${k.visivel ? '◉' : '○'}</button></div>`;
  }).join('');
  const botao = `<button class="kd-min" data-kdmin="1" title="${kdockMin ? 'Mostrar a doca da Kick' : 'Minimizar a doca da Kick (os players continuam rodando, bem pequenos)'}">${kdockMin ? '▴' : '▾'}</button>`;
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
  const chip = (k, nome, on, res) => `<button class="am ${on ? 'on' : ''} ${c.enabled ? '' : 'desl'} ${painel?.i === i && painel.k === k ? 'open' : ''}" data-am="${i}|${k}"><i></i>${nome} <b>${on ? res : 'off'}</b>${ICON.car}</button>`;
  return `
    ${chip('bola', 'Bola', bola?.enabled, `${esc(nomeCurto(bola))} &lt; ${num(bola?.min ?? 0)}`)}
    ${chip('poc', 'Poção', poc?.enabled, `${esc(nomeCurto(poc))} &lt; ${num(poc?.min ?? 0)}`)}
    ${chip('mapa', 'Mapa', c.autoHunt?.enabled, 'top 1')}
    <span class="sp"></span>
    <label class="sw master-c" title="Chave geral desta conta: sem ela nada age no jogo"><span>Automação</span><input type="checkbox" data-master="${i}" ${c.enabled ? 'checked' : ''}><span class="tg"></span></label>`;
}

// ---- painel (overlay acima da barra)
function painelHTML(i, k) {
  const sw = (attr, on) => `<label class="sw" style="gap:12px"><span>Ligado</span><input type="checkbox" ${attr} ${on ? 'checked' : ''}><span class="tg"></span></label>`;
  const fechar = `<button class="ib" data-fechar="1" title="Fechar">${ICON.x}</button>`;
  if (k === 'mapa') return mapaHTML(i, sw, fechar);
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

function retrato(pokeId) {
  const dex = PieHunt.dexDoRetrato(pokeId);
  return dex > 0 ? `<img alt="" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dex}.png">` : '';
}

function mapaHTML(i, sw, fechar) {
  const s = S[i], c = cfgDe(i), pk = s.pk, f = s.res?.ficha;
  const cab = `<div class="ph2"><span>Trocar de mapa sozinho</span><span style="display:flex;gap:6px;align-items:center">${sw(`data-mapa="${i}"`, c.autoHunt?.enabled)}${fechar}</span></div>`;
  if (!pk || !s.res) return cab + `<div class="vazio-top">${s.snap?.ready ? 'Calculando…' : 'Abra o jogo desta conta para calcular.'}</div>`;
  if (s.res.erro) return cab + `<div class="vazio-top">${esc(s.res.erro)}</div>`;
  const ivs = f?.ivs ? ['hp', 'atk', 'def', 'spAtk', 'spDef', 'speed'].map((k) => f.ivs[k]).join('/') : '—';
  const ref = f?.refino ? Object.values(f.refino).reduce((a, b) => a + b, 0) : 0;
  const mult = s.mult;
  const pers = `<div class="col"><h5>Meu personagem</h5>
    <div class="mon-h"><div class="ic">${retrato(pk.speciesId)}</div><div><b>${pk.shiny ? '✨ ' : ''}${esc(pk.nome)}</b><div class="hint" style="margin:0">Nv ${num(pk.level)} · treinador ${num(s.snap.level)}</div></div></div>
    <div class="kv"><span>IVs</span><b>${ivs}</b><span>Qualidade · Potência</span><b>${n1(f.q)} · P${f.pot}</b><span>Refino</span><b>${ref ? '+' + ref : '0'}</b>
      <span>TM elemental · AoE</span><b>${f.tm ? 'sim' : 'não'} · ${f.aoe ? 'sim' : 'não'}</b><span>Poção</span><b>${POC[f.pocao] ?? f.pocao}</b>
      <span>Bônus XP</span><b>×${mult ? n1(mult.calcPk) : '1'}</b></div></div>`;
  const atual = s.snap.huntSlug;
  const top = s.top.length ? s.top.map((r, k) => `<div class="t3 ${k ? '' : 'first'}"><span class="n">${k + 1}</span><div class="nm">${esc(r.hunt.nome)}<small>${num(r.killsH)} kills/h · ${r.killsPorVida >= 99 ? '99+' : n1(r.killsPorVida)} kills/vida</small></div><span class="xp">${curto(r.xpH)}/h</span><span class="tag ${r.risco.txt === 'Tranquila' ? '' : 'seg'}">${r.risco.txt}</span>${r.hunt.slug === atual ? '<span class="atual">atual</span>' : ''}</div>`).join('')
    : '<div class="vazio-top">Nenhuma hunt segura para ele agora.</div>';
  const alerta = s.alerta ? `<div class="res bad">${esc(s.alerta.motivo)}</div>` : '';
  return cab + `<div class="map2">${pers}<div class="col"><h5>Top 3 mapas para ele</h5><div class="top3">${top}</div></div></div>${alerta}
    <div class="hint">Risco alto (aceita Segura e Tranquila). Troca sempre para o 1º lugar, só fora de combate. O alerta vermelho aparece mesmo com a troca desligada.${!c.enabled ? ' A chave "Automação" desta conta está desligada.' : ''}</div>`;
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
  // a tira mantém as miniaturas (onde as outras contas continuam rodando); só os rótulos mudam
  if (!comTira) { if (st.innerHTML) st.innerHTML = ''; return; }
  if (!st.children.length) st.innerHTML = S.map((s, i) => `<div class="th" data-thbox="${i}"><div class="th-h" data-th="${i}"></div><div class="mini" data-mini="${i}"></div></div>`).join('');
  S.forEach((s, i) => {
    const box = st.querySelector(`[data-thbox="${i}"]`);
    box.classList.toggle('cur', foco === i);
    box.querySelector('.th-h').innerHTML = `<span class="dot ${estadoPonto(i)}"></span><b>${nomeConta(i)}</b><span class="xp">${xphAgora(i) != null ? curto(xphAgora(i)) + '/h' : ''}</span>`;
  });
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
  const s = k.saldos?.[slug], custo = custoTipo(i, k.tipo), somOn = !!KKSOM[i + '|' + slug];
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
// Tela preta do Ultra eco: só texto, atualizada quando chega dado novo das contas.
function renderUltra() {
  const el = $('#ultra');
  const on = MODO === 'ultra';
  document.body.classList.toggle('modo-ultra', on);
  if (!on) { if (el.innerHTML) { el.innerHTML = ''; el.dataset.h = ''; } return; }
  const cap = (t) => String(t || '').replace(/^./, (c) => c.toUpperCase());
  // só as contas ligadas: nome · pokémon farmando · lugar · XP/h · automação
  const linhas = S.map((s, i) => {
    if (s.desligada) return '';
    const xp = xphAgora(i), auto = !!cfgDe(i).enabled, pk = s.pk;
    const snap = s.snap;
    const lugar = !snap?.ready ? 'carregando…' : snap.noCentro ? 'Centro Pokémon' : snap.huntSlug ? nomeHunt(i, snap.huntSlug) : 'fora de hunt';
    const area = snap?.huntSlug && !snap.noCentro ? cap(s.rAtual?.hunt?.area) : '';
    return `<div class="u-l"><span class="dot ${estadoPonto(i)}"></span>`
      + `<b class="u-n">${nomeConta(i)}</b>`
      + `<span class="u-pk">${pk ? `${pk.shiny ? '✨ ' : ''}${esc(pk.nome)} <small>Nv ${num(pk.level)}</small>` : '—'}</span>`
      + `<span class="u-h">${esc(lugar)}${area ? ` <small>${esc(area)}</small>` : ''}</span>`
      + `<span class="u-x">${xp != null ? curto(xp) + ' XP/h' : ''}</span>`
      + `<span class="u-a ${auto ? 'on' : ''}">${auto ? 'automação ligada' : 'automação desligada'}</span></div>`;
  }).join('');
  const html = `<div class="u-box"><div class="u-t">Ultra eco</div>`
    + `<p>Os jogos continuam rodando (caça, compras e troca de mapa), só não são desenhados. Menos processador e placa de vídeo.</p>`
    + (linhas ? `<div class="u-lista"><div class="u-l u-cab"><span></span><span>Conta</span><span>Pokémon</span><span>Lugar</span><span>XP/h</span><span></span></div>${linhas}</div>` : '<div class="u-lista"><div class="u-l off">Todas as contas estão desligadas.</div></div>')
    + `<div class="u-b"><button data-modo="eco">Ver os jogos (Eco)</button><button data-modo="normal" class="ghost">Normal</button></div></div>`;
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
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

function renderTudo() {
  renderKkVer();
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
  const o = ovAberto();
  const msg = o ? { slot: o.i, kind: o.kind, html: o.html() } : null;
  const k = JSON.stringify(msg);
  if (k === ovUltimo) return;
  ovUltimo = k;
  app.overlay(msg);
}
function abrir(estado) {
  painel = estado.painel !== undefined ? estado.painel : painel;
  menu = estado.menu !== undefined ? estado.menu : menu;
  twHover = estado.twHover !== undefined ? estado.twHover : twHover;
  for (let i = 0; i < N; i++) renderSlot(i);
  ovSync();
}
const fecharTudo = () => abrir({ painel: null, menu: null, twHover: null });

// ------------------------------------------------------------------ eventos
const ALVOS = '[data-kkzoom],[data-kkfechar],[data-kksom],[data-kkver],[data-kkvis],[data-kdmin],[data-kkbtn],[data-kklogin],[data-kkres],[data-lay],[data-power],[data-am],[data-gear],[data-max],[data-th],[data-link],[data-unlink],[data-cid],[data-reload],[data-fechar],[data-twcanal],[data-twbtn],[data-zoom],#alertaG,[data-modo],#att';
document.addEventListener('click', (e) => {
  const t = e.target.closest(ALVOS);
  if (!t) { if (menu != null || painel) abrir({ menu: null, painel: null }); return; }
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
    kdockMin = !kdockMin;
    try { localStorage.setItem('pie-kdock-min', kdockMin ? '1' : '0'); } catch (_) { /* ok */ }
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
    if (painel || menu != null || twHover != null) fecharTudo();
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
  agendarCalculo(i);
  renderSlot(i);
  if (MODO === 'ultra') renderUltra();
});
app.onModo((m) => { MODO = m; renderModos(); });
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
  ATT = est.att || null;
  renderAtt();
  // o que já chegou ao vivo (antes desta resposta) vale mais que o guardado
  for (let i = 0; i < N; i++) S[i] = Object.assign({ snap: est.stores[i].snapshot, catalog: est.stores[i].catalog, medidas: est.stores[i].medidas || {}, cfg: est.stores[i].cfg, top: [] }, S[i] || {}, { desligada: est.stores[i].desligada, nickSalvo: est.stores[i].nick });
  montar();
  renderTudo();
  PieHunt.carregar().then(() => { for (let i = 0; i < N; i++) agendarCalculo(i); });
})();
