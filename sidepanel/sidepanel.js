const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let cfg = pieMergeCfg(null);
let snap = null;
let catalog = null;
let logEntries = [];

const saveCfg = () => chrome.storage.local.set({ cfg });

// ------------------------------------------------------------------ abas
document.querySelectorAll('.tabs button').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.id === 'tab-' + b.dataset.tab));
  });
});

// ------------------------------------------------------------------ chave geral
// confirm() não funciona no painel lateral do Chrome (fecha sozinho como "cancelar"),
// por isso a confirmação é uma caixa dentro do próprio painel.
$('#master').addEventListener('change', (e) => {
  if (e.target.checked) {
    e.target.checked = false;
    const ativas = cfg.rules.filter((r) => r.enabled).length;
    $('#confirm-txt').textContent = ativas
      ? `${ativas} regra(s) ligada(s) vão poder comprar no jogo. Limite: ${cfg.limits.goldPerHour ? PieFmt.num(cfg.limits.goldPerHour) + ' de ouro/h' : 'sem limite por hora'}.`
      : 'Nenhuma regra de compra está ligada.';
    if (cfg.autoHunt?.enabled) $('#confirm-txt').textContent += ' A troca de hunt automática também vai poder agir.';
    $('#confirm-on').hidden = false;
    return;
  }
  cfg.enabled = false;
  saveCfg();
});
$('#confirm-sim').addEventListener('click', () => { $('#confirm-on').hidden = true; cfg.enabled = true; saveCfg(); renderHeader(); });
$('#confirm-nao').addEventListener('click', () => { $('#confirm-on').hidden = true; });

// ------------------------------------------------------------------ resumo
function renderHeader() {
  const ready = snap?.ready;
  $('#nick').textContent = ready ? snap.nick + ' ·' : '';
  $('#status').textContent = !snap ? 'Abra o pokeidle.io'
    : !snap.connected ? 'Jogo desconectado'
    : !ready ? 'Conectado, aguardando dados…'
    : `atualizado há ${PieFmt.ha(snap.at)}`;
  $('#master').checked = !!cfg.enabled;
  $('#master').closest('.master').classList.toggle('on', !!cfg.enabled);

  // Deixa explícito por que nada está sendo comprado.
  const ligadas = cfg.rules.filter((r) => r.enabled).length;
  const b = $('#banner');
  let msg = '';
  if ((cfg.rules.length || cfg.autoHunt?.enabled) && !cfg.enabled) msg = 'Automação desligada: nada compra nem troca de hunt sozinho. Ligue no botão Automação acima.';
  else if (cfg.enabled && !ligadas && !cfg.autoHunt?.enabled) msg = 'Automação ligada, mas nenhuma regra nem a troca de hunt estão ligadas.';
  b.textContent = msg;
  b.className = 'banner' + (msg ? ' warn' : '');
  b.hidden = !msg;
}

// ------------------------------------------------------------------ regras
function opcoesCompra() {
  const bolas = (catalog?.bolas ?? []).filter((b) => b.compravel !== false && b.priceGold > 0)
    .map((b) => ({ kind: 'ball', refId: b.id, label: b.nome, preco: b.priceGold }));
  const itens = (catalog?.compraveis ?? []).map((x) => ({
    kind: 'item', refId: x.itemId, label: catalog?.items?.[x.itemId]?.name ?? 'Item #' + x.itemId, preco: x.preco,
  }));
  return { bolas, itens };
}

function renderNovaRegra() {
  const { bolas, itens } = opcoesCompra();
  const opt = (o) => `<option value="${o.kind}:${o.refId}">${esc(o.label)} — ${PieFmt.num(o.preco)} ouro</option>`;
  $('#novo-ref').innerHTML = !catalog
    ? '<option>Abra o jogo para carregar a loja</option>'
    : `<optgroup label="Pokébolas">${bolas.map(opt).join('')}</optgroup><optgroup label="Itens">${itens.map(opt).join('')}</optgroup>`;
  $('#novo-add').disabled = !catalog;
}

$('#novo-add').addEventListener('click', () => {
  const v = $('#novo-ref').value;
  if (!v || !v.includes(':')) return;
  const [kind, refId] = v.split(':');
  const { bolas, itens } = opcoesCompra();
  const o = [...bolas, ...itens].find((x) => x.kind === kind && String(x.refId) === refId);
  if (!o) return;
  cfg.rules.push({ id: crypto.randomUUID(), kind, refId: Number(refId), label: o.label, min: 20, qty: 50, enabled: false });
  saveCfg();
  renderRegras();
});

function precoRegra(r) {
  if (r.kind === 'ball') return (catalog?.bolas ?? []).find((b) => b.id === Number(r.refId))?.priceGold;
  return (catalog?.compraveis ?? []).find((x) => x.itemId === Number(r.refId))?.preco;
}

function renderRegras() {
  const box = $('#regras');
  if (!cfg.rules.length) { box.innerHTML = '<p class="empty">Nenhuma regra ainda.</p>'; return; }
  box.innerHTML = cfg.rules.map((r) => `
    <div class="rule" data-id="${r.id}">
      <div class="head"><b>${esc(r.label)}</b>
        <label class="switch"><input type="checkbox" data-f="enabled" ${r.enabled ? 'checked' : ''}> ligada</label>
        <button class="del" data-f="del" title="Remover">×</button></div>
      <div class="sentence"><span>Quando tiver menos de</span><input type="number" min="1" data-f="min" value="${r.min}"><span></span>
        <span>comprar</span><input type="number" min="1" data-f="qty" value="${r.qty}"><span>unidades</span></div>
      <div class="st" data-st></div>
    </div>`).join('');

  box.querySelectorAll('.rule').forEach((el) => {
    const id = el.dataset.id;
    el.querySelectorAll('[data-f]').forEach((inp) => {
      const f = inp.dataset.f;
      inp.addEventListener(f === 'del' ? 'click' : 'change', () => {
        // Busca a regra no cfg ATUAL: o cfg é trocado a cada gravação no storage, e editar um
        // objeto antigo fazia a mudança se perder (era por isso que "ligada" não pegava).
        const r = cfg.rules.find((x) => x.id === id);
        if (!r) return;
        if (f === 'del') { cfg.rules = cfg.rules.filter((x) => x.id !== id); saveCfg(); renderRegras(); return; }
        if (f === 'enabled') r.enabled = inp.checked;
        else r[f] = Math.max(1, Math.round(Number(inp.value) || 0));
        saveCfg();
        renderStatusRegras();
      });
    });
  });
  renderStatusRegras();
}

function renderStatusRegras() {
  document.querySelectorAll('.rule').forEach((el) => {
    const r = cfg.rules.find((x) => x.id === el.dataset.id);
    const st = el.querySelector('[data-st]');
    if (!r || !st) return;
    const tem = r.kind === 'ball' ? snap?.balls?.[r.refId] : snap?.items?.[r.refId];
    const preco = precoRegra(r);
    const bloq = snap?.regras?.porRegra?.[r.id]?.bloqueadaAte;
    let txt = `Tenho ${snap?.ready ? PieFmt.num(tem ?? 0) : '—'} · cada compra custa ${preco ? PieFmt.num(preco * r.qty) + ' de ouro (' + PieFmt.num(preco) + ' cada)' : '?'}`;
    let warn = false;
    if (bloq && bloq > Date.now()) { txt += ` · pausada por ${Math.ceil((bloq - Date.now()) / 60000)} min (veja o Log)`; warn = true; }
    else if (r.enabled && snap?.ready && (tem ?? 0) < r.min) { txt += cfg.enabled ? ' · abaixo do mínimo, vai comprar' : ' · abaixo do mínimo (chave geral desligada)'; warn = true; }
    st.textContent = txt;
    st.classList.toggle('warn', warn);
  });
  const g = snap?.regras?.gastoUltimaHora;
  $('#gasto').textContent = g != null ? `Gasto pela automação na última hora: ${PieFmt.num(g)} de ouro (teto ${cfg.limits.goldPerHour ? PieFmt.num(cfg.limits.goldPerHour) : 'nenhum'}).` : '';
}

// ------------------------------------------------------------------ retratos (atlas do mapa do jogo)
let ATLAS = null;
async function carregarAtlas() {
  if (ATLAS) return;
  try {
    const j = await fetch('https://pokeidle.io/assets/site/assets/maps/marker-atlas.json').then((r) => r.json());
    ATLAS = { slots: j.slots ?? {}, cols: j.cols ?? 16, url: 'https://pokeidle.io' + (j.image || '/assets/site/assets/maps/marker-atlas.png') };
    calcularHunts(true);
  } catch (_) { /* sem retratos, tudo continua funcionando */ }
}
// Retrato em pixel: sprite clássico pelo número da Pokédex (PokeAPI); para variantes sem número
// nacional, tenta o atlas do mapa do próprio jogo; senão, um quadrado vazio.
function retrato(pokeId, tam = 32) {
  const dex = PieHunt.dexDoRetrato(pokeId);
  if (dex > 0) {
    return `<span class="spr" style="width:${tam}px;height:${tam}px"><img loading="lazy" alt="" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dex}.png"></span>`;
  }
  const s = ATLAS?.slots?.[PieHunt.looktypeDe(pokeId)];
  if (!s) return `<i class="spr vazio" style="width:${tam}px;height:${tam}px"></i>`;
  return `<i class="spr" style="width:${tam}px;height:${tam}px;background-image:url('${ATLAS.url}');background-size:${ATLAS.cols * tam}px auto;background-position:-${s[0] * tam}px -${s[1] * tam}px"></i>`;
}

// ------------------------------------------------------------------ onde caçar
let huntPkId = null;
let huntChave = '';
let huntRes = null;
let huntSim = null;

function renderHuntPicker() {
  const sel = $('#hunt-pk');
  const time = snap?.team ?? [];
  if (!time.length) { sel.innerHTML = '<option>Equipe vazia ou jogo fechado</option>'; return; }
  if (!huntPkId || !time.some((p) => p.id === huntPkId)) huntPkId = snap.activeId ?? time[0].id;
  const html = time.map((p) => `<option value="${p.id}" ${p.id === huntPkId ? 'selected' : ''}>${p.shiny ? '✨ ' : ''}${esc(p.nome)} · nv ${p.level}${p.id === snap.activeId ? ' (em campo)' : ''}</option>`).join('');
  if (sel.innerHTML !== html) sel.innerHTML = html;
  const pkSel = time.find((p) => p.id === huntPkId);
  if (pkSel) $('#hunt-pk-ico').innerHTML = retrato(pkSel.speciesId, 40);
}
$('#hunt-pk').addEventListener('change', (e) => { huntPkId = Number(e.target.value); calcularHunts(true); });
$('#hunt-risco').addEventListener('change', () => calcularHunts(true));

// Medidas reais (abates/h por hunt e pokémon), gravadas enquanto você caça.
let medidas = {};

async function calcularHunts(forcar = false) {
  if (!document.querySelector('#tab-hunts').classList.contains('on') && !forcar) return;
  renderHuntPicker();
  const pk = (snap?.team ?? []).find((p) => p.id === huntPkId);
  if (!pk || !catalog) { $('#hunt-lista').innerHTML = '<tr><td colspan="4" class="empty">Abra o jogo para calcular.</td></tr>'; return; }
  const mult = PieHunt.multiplicadores(snap, catalog);
  const chave = [PieHunt.chaveFicha(pk, snap, catalog), snap.level, catalog.at].join('|');
  if (chave !== huntChave || forcar) {
    huntChave = chave;
    $('#hunt-lista').innerHTML = '<tr><td colspan="4" class="empty">Calculando…</td></tr>';
    huntSim = await PieHunt.simular(pk, catalog, snap.level, snap);
  }
  huntRes = PieHunt.ajustar(huntSim, snap, catalog, { mostrarArriscadas: $('#hunt-risco').checked, medidas, pk });
  if (!huntRes) return;
  huntRes.mult = mult;
  renderHunts(pk);
}

const ORDEM = {
  pk: (a, b) => b.xpH - a.xpH,
  tr: (a, b) => b.xpTrH - a.xpTrH,
  ouro: (a, b) => b.ouroH - a.ouroH,
};
$('#hunt-ordem').addEventListener('change', () => { const pk = (snap?.team ?? []).find((p) => p.id === huntPkId); if (pk) renderHunts(pk); });

const fmtMult = (m) => '×' + (Math.round(m * 1000) / 1000).toString().replace('.', ',');
const hora = (ts) => new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// A conta de cada linha, para conferir número a número com o guia (abates/h e tempo de abate).
function contaDaLinha(r) {
  const n1 = (x) => x.toFixed(1).replace('.', ',');
  const ttk = r.ttk < 60 ? n1(r.ttk) + ' s' : n1(r.ttk / 60) + ' min';
  const kpv = r.killsPorVida >= 99 ? '99+' : n1(r.killsPorVida);
  let t = `${PieFmt.num(r.killsH)} kills/h · ${ttk} +${n1(r.morto)}s ciclo · ${kpv} kills/vida · ${r.risco.txt}${r.geoEstimada ? ' · ≈' : ''}`;
  if (r.medido) t += `<br>✓ medido jogando: ${PieFmt.num(r.medido.kph)} kills/h em ${r.medido.minutos} min`;
  return t;
}

function renderHunts(pk) {
  if (!huntRes) return;
  if (huntRes.erro) { $('#hunt-lista').innerHTML = `<tr><td colspan="4" class="empty">${esc(huntRes.erro)}</td></tr>`; return; }
  const atual = snap?.huntSlug;
  const nMed = huntRes.lista.filter((r) => r.medido).length;
  const f = huntRes.ficha || {};
  const ivs = f.ivs ? ['hp', 'atk', 'def', 'spAtk', 'spDef', 'speed'].map((k) => f.ivs[k]).join('/') : '';
  const ref = f.refino ? Object.values(f.refino).reduce((a, b) => a + b, 0) : 0;
  const POC = { 0: 'sem poção', 200: 'Small', 201: 'Great', 202: 'Ultra', 203: 'Hyper', 204: 'Ultimate' };
  $('#hunt-fonte').innerHTML = `<span class="ok">●</span> Mesma conta e mesmos dados do guia. Ficha usada: <b>${esc(huntRes.poke?.nome ?? '')}</b> nv ${f.nivel} · Q ${String(f.q).replace('.', ',')} · P${f.pot}${f.shiny ? ' · shiny' : ''} · IV ${ivs}${ref ? ' · refino +' + ref : ''}${f.tm ? ' · TM elem.' : ''}${f.aoe ? ' · TM AoE' : ''} · poção ${POC[f.pocao] ?? f.pocaoExtra?.nome ?? f.pocao}${f.bike ? ' · bike +' + Math.round(f.bike * 100) + '%' : ''}${f.vip ? ' · VIP' : ''}${f.boost ? ' · boost pokémon' : ''}${f.boostTr ? ' · boost treinador' : ''}${f.guild ? ' · guild ' + String(f.guild).replace('.', ',') + '%' : ''}${f.evento ? ' · evento ' + f.evento + '%' : ''}${f.twitch ? ' · twitch ' + f.twitch + '%' : ''}${f.kick ? ' · kick ' + f.kick + '%' : ''} · treinador nv ${f.trein === Infinity ? '—' : f.trein}${nMed ? ` · ${nMed} com medida real (✓)` : ''}`;
  $('#hunt-fonte').innerHTML += ` <span class="hint">v${chrome.runtime.getManifest().version}</span>`;
  const fonte = huntRes;
  const lista = [...fonte.lista].sort(ORDEM[$('#hunt-ordem').value] || ORDEM.pk);
  const top = lista.slice(0, 25);
  const rAtual = lista.find((r) => r.hunt.slug === atual);
  if (rAtual && !top.includes(rAtual)) top.push(rAtual);
  $('#hunt-lista').innerHTML = top.map((r) => {
    if (!r.hunt.slug) return '';
    const h = r.hunt;
    const ehAtual = h.slug === atual;
    const esps = h.especies.map((e) => e.nome).filter(Boolean).slice(0, 3).join(', ');
    return `<tr class="${ehAtual ? 'atual' : ''}"><td class="hcell">${retrato(h.especies[0]?.pokeId)}<div><div class="hn"><span class="pos">${lista.indexOf(r) + 1}</span> ${esc(h.nome)}${r.medido ? ` <span class="ok" title="medido no jogo: ${PieFmt.num(r.medido.kph)} abates/h em ${r.medido.minutos} min">✓</span>` : ''}</div>
      <div class="hs">nv ${PieFmt.num(h.nivel)}${esps && esps !== h.nome ? ' · ' + esc(esps) : ''}</div>
      <div class="hs conta">${contaDaLinha(r)}</div></div></td>
      <td class="r">${PieFmt.curto(r.xpH)}<div class="hs">${PieFmt.curto(r.xpTrH)}</div></td><td class="r">${PieFmt.curto(r.ouroH)}</td>
      <td>${ehAtual ? '<span class="hs">aqui</span>' : `<button class="ir" data-slug="${esc(h.slug)}">Ir</button>`}</td></tr>`;
  }).join('') || '<tr><td colspan="4" class="empty">Nenhuma hunt segura para este pokémon.</td></tr>';
  $('#hunt-lista').querySelectorAll('button.ir').forEach((b) => b.addEventListener('click', () => irPara(b.dataset.slug)));

  // Situação atual: estimativa x medido, e de onde vem o bônus.
  const m = snap?.xpMedido;
  const hAt = PieFmt.hunt(catalog, atual);
  const mult = huntRes.mult;
  let html = !atual ? 'Fora de hunt agora.' : `Agora em <b>${esc(hAt?.nome ?? atual)}</b>`;
  if (atual && rAtual) {
    html += `<br>Guia: pokémon <b>${PieFmt.num(rAtual.xpH)}</b> · treinador <b>${PieFmt.num(rAtual.xpTrH)}</b> XP/h`;
    if (m && m.slug === atual) {
      html += m.xpH != null
        ? `<br>Medido (últimos ${m.minutos} min): pokémon <b>${PieFmt.num(m.xpH)}</b> · treinador <b>${PieFmt.num(m.xpTrH)}</b> XP/h`
        : `<br><span class="hint">Medindo… (${m.minutos} min de 2)</span>`;
    }
  }
  const partes = mult.partes.map((p) => `${esc(p.nome)} ${fmtMult(p.mult)}${p.alvo !== 'ambos' ? ' (' + p.alvo + ')' : ''}${p.ate ? ' até ' + hora(p.ate) : ''}`);
  html += `<br><span class="hint">Bônus ativos: ${partes.length ? partes.join(' · ') : 'nenhum'} → pokémon ${fmtMult(mult.calcPk)}, treinador ${fmtMult(mult.calcTr)}.`;
  if (snap.multXp && snap.multXpTr) {
    const ok = Math.abs(snap.multXp / mult.calcPk - 1) < 0.03 && Math.abs(snap.multXpTr / mult.calcTr - 1) < 0.03;
    html += ` Nos seus abates: pokémon ${fmtMult(snap.multXp)}, treinador ${fmtMult(snap.multXpTr)}${ok ? ' (confere).' : ` — <b class="low">não bate</b>: o jogo está dando ${fmtMult(snap.multXp / mult.calcPk)} a mais que a soma dos bônus acima. A lista já usa o valor medido.`}`;
  }
  html += '</span>';
  if (pk.id !== snap.activeId) html += '<br><span class="hint">O pokémon escolhido não é o que está em campo.</span>';
  $('#hunt-agora').innerHTML = html;
}

// ------------------------------------------------------------------ alerta de troca de hunt
// Roda sempre (mesmo com a aba fechada) para o pokémon EM CAMPO: se ele subiu de nível, o treinador
// liberou hunt nova ou a atual ficou perigosa, e existe hunt bem melhor, a aba fica vermelha.
let alertaChave = '';
let alertaRes = null;
let alertaSim = null;
const niveisVistos = new Map(); // pokemonId -> nível
let subiu = null;               // { nome, de, para, em }

async function atualizarAlerta() {
  const pk = (snap?.team ?? []).find((p) => p.id === snap?.activeId);
  if (!pk || !catalog?.combate || !snap?.ready) { alertaRes = null; renderAlerta(); return; }
  const antes = niveisVistos.get(pk.id);
  if (antes != null && pk.level > antes) subiu = { nome: pk.nome, de: antes, para: pk.level, em: Date.now() };
  niveisVistos.set(pk.id, pk.level);
  const chave = [PieHunt.chaveFicha(pk, snap, catalog), snap.level, catalog.at].join('|');
  if (chave !== alertaChave) {
    alertaChave = chave;
    alertaSim = await PieHunt.simular(pk, catalog, snap.level, snap);
  }
  alertaRes = PieHunt.ajustar(alertaSim, snap, catalog, { medidas, pk });
  renderAlerta();
}

function calcAlerta() {
  if (!snap?.huntSlug || snap.noCentro) return null;
  const r = PieHunt.decidir(alertaRes?.lista, snap.huntSlug, cfg.autoHunt ?? {});
  if (r) r.motivo = esc(r.motivo);
  return r;
}

function renderAlerta() {
  const a = calcAlerta();
  const tab = document.querySelector('.tabs button[data-tab=hunts]');
  tab.classList.toggle('alerta', !!a);
  const box = $('#hunt-alerta');
  if (!a) { box.hidden = true; return; }
  const pk = (snap.team ?? []).find((p) => p.id === snap.activeId);
  const nivel = subiu && pk && subiu.nome === pk.nome && Date.now() - subiu.em < 3 * 3600e3
    ? `${esc(subiu.nome)} subiu para o nível ${subiu.para}. ` : '';
  const sozinho = cfg.enabled && cfg.autoHunt?.enabled ? '<br><span class="hint">A troca automática está ligada: ele troca sozinho ao sair de combate (respeitando o risco máximo).</span>' : '';
  box.innerHTML = `<b>Hora de trocar de hunt</b><p>${nivel}${a.motivo}${sozinho}</p>
    <button class="ir" id="alerta-ir">Ir para ${esc(a.melhor.hunt.nome)}</button>`;
  box.hidden = false;
  $('#alerta-ir').onclick = () => irPara(a.melhor.hunt.slug);
}

async function irPara(slug) {
  const tabs = await chrome.tabs.query({ url: 'https://pokeidle.io/*' });
  for (const t of tabs) chrome.tabs.sendMessage(t.id, { type: 'pie-hunt', slug }).catch(() => {});
}

document.querySelector('.tabs button[data-tab=hunts]').addEventListener('click', () => calcularHunts());

// ------------------------------------------------------------------ log
function renderLog() {
  $('#log').innerHTML = logEntries.slice().reverse().map((e) => {
    const t = new Date(e.at).toLocaleTimeString('pt-BR');
    return `<span class="l-${e.level}">${t}  ${esc(e.msg)}</span>`;
  }).join('\n') || 'Nada ainda.';
}
$('#log-clear').addEventListener('click', () => chrome.storage.local.set({ log: [] }));

// ------------------------------------------------------------------ ajustes
function renderAjustes() {
  if (document.activeElement !== $('#lim-hora')) $('#lim-hora').value = cfg.limits.goldPerHour;
  $('#ah-on').checked = !!cfg.autoHunt.enabled;
  $('#ah-criterio').value = cfg.autoHunt.criterio;
  $('#ah-risco').value = cfg.autoHunt.riscoMax;
  if (document.activeElement !== $('#ah-ganho')) $('#ah-ganho').value = cfg.autoHunt.ganhoMin;
  if (document.activeElement !== $('#lim-reserva')) $('#lim-reserva').value = cfg.limits.goldReserve;
}
$('#ah-on').addEventListener('change', (e) => { cfg.autoHunt.enabled = e.target.checked; saveCfg(); });
$('#ah-criterio').addEventListener('change', (e) => { cfg.autoHunt.criterio = e.target.value; saveCfg(); });
$('#ah-risco').addEventListener('change', (e) => { cfg.autoHunt.riscoMax = e.target.value; saveCfg(); });
$('#ah-ganho').addEventListener('change', (e) => { cfg.autoHunt.ganhoMin = Math.max(0, Math.round(Number(e.target.value) || 0)); saveCfg(); });
$('#lim-hora').addEventListener('change', (e) => { cfg.limits.goldPerHour = Math.max(0, Math.round(Number(e.target.value) || 0)); saveCfg(); });
$('#lim-reserva').addEventListener('change', (e) => { cfg.limits.goldReserve = Math.max(0, Math.round(Number(e.target.value) || 0)); saveCfg(); });

// ------------------------------------------------------------------ carga e atualização
function renderAll() { renderHeader(); renderNovaRegra(); renderRegras(); renderLog(); renderAjustes(); calcularHunts(true); }

chrome.storage.onChanged.addListener((c, area) => {
  if (area !== 'local') return;
  if (c.cfg) {
    const antes = JSON.stringify(cfg.rules);
    cfg = pieMergeCfg(c.cfg.newValue);
    renderHeader(); renderAjustes();
    if (JSON.stringify(cfg.rules) !== antes) renderRegras(); else renderStatusRegras();
  }
  if (c.snapshot) { snap = c.snapshot.newValue; renderHeader(); renderStatusRegras(); calcularHunts(); atualizarAlerta(); }
  if (c.catalog) { catalog = c.catalog.newValue; carregarAtlas(); renderNovaRegra(); renderAjustes(); renderStatusRegras(); atualizarAlerta(); }
  if (c.log) { logEntries = c.log.newValue ?? []; renderLog(); }
  if (c.medidas) { medidas = c.medidas.newValue ?? {}; calcularHunts(); atualizarAlerta(); }
});

setInterval(renderHeader, 5000);

(async () => {
  const d = await chrome.storage.local.get(['cfg', 'snapshot', 'catalog', 'log', 'medidas']);
  medidas = d.medidas ?? {};
  cfg = pieMergeCfg(d.cfg);
  snap = d.snapshot ?? null;
  catalog = d.catalog ?? null;
  logEntries = d.log ?? [];
  carregarAtlas();
  renderAll();
  atualizarAlerta();
  // Pede ao jogo aberto para reenviar o estado.
  try {
    const tabs = await chrome.tabs.query({ url: 'https://pokeidle.io/*' });
    for (const t of tabs) chrome.tabs.sendMessage(t.id, { type: 'pie-resend' }).catch(() => {});
  } catch (_) {}
})();
