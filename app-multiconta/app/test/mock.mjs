// Servidor falso para testar o app sem o jogo de verdade: página do jogo + WebSocket do jogo,
// e uma Twitch falsa (id.twitch.tv e IRC). Uso: node test/mock.mjs  (porta 8787)
import http from 'node:http';
import fs from 'node:fs';
import { WebSocketServer } from 'ws';

const SRC = process.env.SRC || '/home/claude/src';
const FX = JSON.parse(fs.readFileSync(process.env.FX || '/home/claude/test/fixture.json', 'utf8'));
const PORT = Number(process.env.PORT || 8787);
export const log = [];

const GAME_HTML = `<!doctype html><html><head><title>Poke Idle IO — MMO</title></head>
<body style="margin:0;height:100vh;background:linear-gradient(180deg,#1d2c52 0 55%,#2f5d46 55%);color:#fff;font:14px sans-serif">
<div id="app" style="padding:16px">Jogo falso <b id="nick"></b> · <span id="hunt"></span></div>
<div id="hunt-saida"><button id="ir-centro" type="button">Ir para o Centro Pokémon</button><button id="hunt-eco" type="button">bateria</button></div>
<div id="eco-painel">Modo Economia <button id="eco-sair" type="button">Ligar a cena</button></div>
<script nonce="abc">
  // Modo Economia igual ao do jogo: classe no <html> + localStorage cfg-economia
  if (localStorage.getItem('cfg-economia') === '1') document.documentElement.classList.add('modo-economia');
  const defEco = (l) => { localStorage.setItem('cfg-economia', l ? '1' : '0'); document.documentElement.classList.toggle('modo-economia', l); };
  document.getElementById('hunt-eco').addEventListener('click', () => defEco(true));
  document.getElementById('eco-sair').addEventListener('click', () => defEco(false));
  const ws = new WebSocket((location.protocol==='https:'?'wss://':'ws://') + location.host + '/ws');
  window.addEventListener('beforeunload', (e) => { e.preventDefault(); e.returnValue = ''; });
  // a prancheta de sessão que o jogo grava no navegador (sessao-hunt:<nick>)
  const sessaoFalsa = (nick) => localStorage.setItem('sessao-hunt:' + nick, JSON.stringify(nick === 'murilo'
    ? { ms: 11520000, xpTreinador: 9e6, xpPokemon: 2.8e8, gold: 1310000, abates: 5840, capturas: 31, shiniesVistos: 1, shinies: 0, bossTokens: 1, fragChave: 2, fragBicicleta: 1, bolas: { 1: 40 }, pocoes: { 201: 12 } }
    : { ms: 3900000, gold: 220000, abates: 1020, capturas: 12, shiniesVistos: 1, shinies: 1, bolas: {}, pocoes: {} }));
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.t === 'welcome' && m.estado?.nick) sessaoFalsa(m.estado.nick); if (m.estado?.nick) document.getElementById('nick').textContent = m.estado.nick; if (m.estado?.huntSlug) document.getElementById('hunt').textContent = m.estado.huntSlug; };
</script></body></html>`;

let contas = 0;
const INST = Buffer.alloc(300000, 7);
const INST_SHA = (await import('node:crypto')).createHash('sha256').update(INST).digest('hex');
function estadoCheio(n) {
  return {
    cheio: true, nick: ['murilo', 'segunda', 'terceira', 'quarta'][n % 4], level: [87, 120, 60, 40][n % 4], gold: 500000, xp: 50000,
    loja: { vipAte: n % 4 === 0 ? Date.now() + 864e5 : 0, boosts: {} }, guildBonusPct: 0, guild: { boostAte: 0 }, diamonds: 0, orbs: 1000,
    huntSlug: n % 4 === 3 ? null : n % 4 === 1 ? 'tangela' : 'kadabra', noCentro: n % 4 === 3, activeId: 11,
    balls: { 1: 48, 2: 5 }, items: { 200: 30, 201: 4 },
    automation: { autoPotion: true, autoBall: true, ballIds: [1], potionIds: n % 4 === 1 ? [201, 90001] : [201] },
    twitch: {
      login: n === 0 ? 'murilo_tv' : null, aoVivo: true, assistindo: false, pct: 15, pctAtual: 0, extra: 2.5, assistindoEm: [],
      oficiais: [{ login: 'faasii', nome: 'faasii', bonus: true }, { login: 'parceiro1', nome: 'Parceiro 1', bonus: true }, { login: 'parceiro2', bonus: false }],
      lives: [{ login: 'faasii', nome: 'faasii', espectadores: 120 }, { login: 'parceiro1', nome: 'Parceiro 1', espectadores: 30 }, { login: 'parceiro2', espectadores: 5 }],
    },
    kick: {
      vinculado: n % 4 === 0, login: n % 4 === 0 ? 'murilo_kick' : null, pct: 15, minutos: 60,
      recompensas: [{ tipo: 'xp', custo: 1000 }, { tipo: 'captura', custo: 1000 }, { tipo: 'shiny', custo: 1500 }],
      oficiais: [{ slug: 'faasii', nome: 'faasii', aoVivo: true, espectadores: 50, ativo: true }, { slug: 'offlinecara', nome: 'Offline Cara', aoVivo: false, espectadores: 0, ativo: true }, { slug: 'outrolive', nome: 'Outro Live', aoVivo: true, espectadores: 20, ativo: true }, { slug: 'semPontos', nome: 'Sem', aoVivo: true, ativo: false }],
      bonus: {},
    },
    pokemons: [
      { id: 11, nome: 'Yanma', speciesId: 193, level: 56 + n * 10, hp: 900, maxHp: 972, slot: 0, potencia: 1, quality: 1.717, ivs: { hp: 11, atk: 24, def: 25, spAtk: 32, spDef: 8, speed: 16 }, tipos: ['BUG', 'FLYING'],
        stats: { hp: 81 + n * 12, atk: 120 + n * 20, def: 70 + n * 10, spAtk: 140 + n * 25, spDef: 60 + n * 8, speed: 130 + n * 15 } },
      { id: 12, nome: 'Pikachu', speciesId: 25, level: 40, hp: 30, maxHp: 140, slot: 1, potencia: 1, quality: 0.95, ivs: { hp: 5, atk: 8, def: 9, spAtk: 12, spDef: 4, speed: 30 }, stats: { hp: 12, atk: 30, def: 20, spAtk: 30, spDef: 25, speed: 50 } },
    ],
  };
}

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (body, type) => { res.writeHead(200, { 'content-type': type }); res.end(body); };
  // GitHub falso (atualização automática)
  if (u.pathname === '/gh/repos/murilo/pokeidle-multi/releases/latest') {
    return send(JSON.stringify({ tag_name: 'v9.9.9', body: 'teste', assets: [{ name: 'PokeIdle-Multi-Instalador-9.9.9.exe', size: INST.length, digest: 'sha256:' + INST_SHA, browser_download_url: 'http://127.0.0.1:8787/gh/dl/inst.exe' }] }), 'application/json');
  }
  if (u.pathname === '/gh/dl/inst.exe') return send(INST, 'application/octet-stream');
  if (u.pathname === '/app') {
    res.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': "default-src 'self'; script-src 'nonce-abc'; connect-src 'self' ws: wss:" });
    return res.end(GAME_HTML);
  }
  if (u.pathname === '/shared/estado-delta.mjs') return send(fs.readFileSync(SRC + '/estado-delta.mjs'), 'text/javascript');
  if (u.pathname === '/assets/items.json') return send(fs.readFileSync(SRC + '/items.json'), 'application/json');
  // módulos e catálogos do jogo (o app baixa para o motor do Onde caçar)
  if (/^\/(shared\/[\w.-]+\.mjs|hunt-analyser\.mjs|assets\/creatures[\w-]*\.json)$/.test(u.pathname)) {
    const arq = SRC + u.pathname;
    if (fs.existsSync(arq)) return send(fs.readFileSync(arq), u.pathname.endsWith('.json') ? 'application/json' : 'text/javascript');
    res.writeHead(404); return res.end();
  }
  // Twitch falsa
  if (u.pathname === '/tw/device') return send(JSON.stringify({ device_code: 'dev123', user_code: 'ABCD-EFGH', verification_uri: `http://127.0.0.1:${PORT}/tw/activate`, interval: 1, expires_in: 600 }), 'application/json');
  if (u.pathname === '/tw/activate') return send('<h1 style="font-family:sans-serif">Twitch falsa: autorizado</h1>', 'text/html');
  if (u.pathname === '/tw/token') {
    let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
      const p = new URLSearchParams(body);
      srv.polls = (srv.polls || 0) + 1;
      if (p.get('grant_type').includes('device_code') && srv.polls < 3) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ status: 400, message: 'authorization_pending' })); }
      send(JSON.stringify({ access_token: 'tok' + srv.polls, refresh_token: 'ref', expires_in: 14000, scope: ['chat:read'] }), 'application/json');
    });
    return;
  }
  if (u.pathname === '/tw/validate') return send(JSON.stringify({ client_id: 'x', login: 'murilo_tv', user_id: '1', scopes: ['chat:read'], expires_in: 14000 }), 'application/json');
  // Kick falsa
  if (u.pathname.startsWith('/kick/')) {
    const resp = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (!u.pathname.startsWith('/kick/api/')) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<body style="background:#111;color:#53fc18;font:40px sans-serif"><video id=vv></video>KICK ' + u.pathname.slice(6) + ' sessionStorage=' + '<span id=q></span><script>document.getElementById("q").textContent=sessionStorage.getItem("stream_quality")</script></body>'); }
    if (req.headers.authorization !== 'Bearer tok-kick') return resp(401, { message: 'Unauthenticated' });
    if (u.pathname === '/kick/api/v1/user') return resp(200, { id: 9, username: 'murilo_kick' });
    const m = u.pathname.match(/^\/kick\/api\/v2\/channels\/([^/]+)\/(points|rewards)(?:\/([^/]+)\/redeem)?$/);
    if (!m) return resp(404, { message: 'no' });
    const slug = decodeURIComponent(m[1]);
    srv.kpts = srv.kpts || { faasii: 1200, offlinecara: 3000 };
    const RW = [{ id: 'r1', title: 'PokeIdle +15% XP (1h)', cost: 1000, is_paused: false, is_user_input_required: false }, { id: 'r2', title: 'PokeIdle Capture Boost', cost: 1000 }, { id: 'r3', title: 'Secret Lure', cost: 1500 }];
    if (m[2] === 'points') return resp(200, { data: { points: srv.kpts[slug] || 0 } });
    if (!m[3]) return resp(200, { data: RW });
    const r = RW.find((x) => x.id === m[3]);
    if ((srv.kpts[slug] || 0) < r.cost) return resp(400, { message: 'Not enough points' });
    srv.kpts[slug] -= r.cost;
    console.log('KICK REDEEM', slug, r.id);
    return resp(200, { data: { ok: true } });
  }
  if (u.pathname === '/tw/revoke') return send('', 'text/plain');
  res.writeHead(404); res.end();
});

const wssJogo = new WebSocketServer({ noServer: true });
const wssIrc = new WebSocketServer({ noServer: true });
srv.on('upgrade', (req, sock, head) => {
  if (req.url.startsWith('/ws')) wssJogo.handleUpgrade(req, sock, head, (ws) => wssJogo.emit('connection', ws));
  else if (req.url.startsWith('/irc')) wssIrc.handleUpgrade(req, sock, head, (ws) => wssIrc.emit('connection', ws));
  else sock.destroy();
});
wssJogo.on('connection', (ws) => {
  const n = contas++;
  const e = estadoCheio(n);
  ws.send(JSON.stringify({
    t: 'welcome', estado: e, hunts: FX.hunts,
    catalogoBolas: [{ id: 1, nome: 'Poke Ball', priceGold: 10, compravel: true }, { id: 2, nome: 'Great Ball', priceGold: 50, compravel: true }, { id: 3, nome: 'Ultra Ball', priceGold: 120, compravel: true }],
    tabelaTipos: FX.tipos, ampliacaoHunt: 1.5, multHpSelvagem: 5, multDanoSelvagem: 1.8,
    captura: { base: 0.0075 }, chanceShiny: 0.001, tiposBoost: [],
    // Item próprio do jogo (não está no items.json) e preços cobrados pelo servidor.
    mercado: { cooldownCompraMs: 120000, catalogo: [{ id: 2, nome: 'Bicycle Fragment', categoria: 'fragment' }, { id: 3, nome: 'Key Fragment', categoria: 'fragment' }, { id: 4, nome: 'Fire Stone', categoria: 'stone' }, { id: 9, nome: 'Bronze Boss Token', categoria: 'boss' }] },
    itensNossos: [{ id: 90001, name: 'Golden Potion', category: 'heal', npcPrice: 5000, healPct: 1 }],
    itensCompraveis: [{ itemId: 200, preco: 50 }, { itemId: 201, preco: 150 }, { itemId: 90001, preco: 4000 }],
  }));
  // eventos que o painel do Ultra eco mostra: captura (shiny na 2ª conta), drop raro e desmaio
  if (e.huntSlug && !e.noCentro) {
    setTimeout(() => ws.send(JSON.stringify({ t: 'batalha', ev: [
      { k: 'capturado', pokemon: { nome: n % 4 === 1 ? 'Zubat' : 'Ditto', level: n % 4 === 1 ? 33 : 50, shiny: n % 4 === 1 } },
      { k: 'morte', quem: 'selvagem', nome: 'Kadabra', xp: 10, ouro: 5, drops: [{ itemId: 70011, nome: 'Key Fragment', qtd: 1 }, { itemId: 1, nome: 'Twisted Spoon', qtd: 1 }] },
      ...(n % 4 === 1 ? [{ k: 'morte', quem: 'jogador' }] : []),
    ] })), 2500);
  }
  // uma onda cheia na hunt (para a geometria medida): 15 selvagens nascendo juntos
  if (e.huntSlug && !e.noCentro) {
    setTimeout(() => {
      ws.send(JSON.stringify({ t: 'campo.init', slug: e.huntSlug, heroi: { c: 10, r: 10 }, mobs: [] }));
      ws.send(JSON.stringify({ t: 'campo', heroi: { c: 10, r: 10 }, mobs: Array.from({ length: 15 }, (_, k) => ({ s: k, c: 10 + 3 + k, r: 10 + (k % 4), x: false })) }));
    }, 1500);
  }
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    log.push({ conta: n, ...m });
    console.log('JOGO', n, JSON.stringify(m));
    // Mercado falso (em Gemas): Bicycle Fragment com um anúncio barato (retido 20 s) e outros normais;
    // Key Fragment sozinho e sem vendas (sem referência); Fire Stone barata mas fora dos alvos.
    if (m.t === 'market.itens') {
      ws.send(JSON.stringify({ t: 'market', aba: 'itens',
        resumo: { 2: { anuncios: 4, unidades: 11, minGold: null, minOrb: 60 }, 3: { anuncios: 1, unidades: 1, minOrb: 10 }, 4: { anuncios: 1, unidades: 5, minOrb: 1, minGold: 10 } },
        medias: { 2: { orb: { media: 100, unidades: 20 } } } }));
    }
    if (m.t === 'market.item') {
      ws.mercadoLib ??= Date.now() + 20000; // a retenção do anúncio 501 acaba 20 s depois da 1ª consulta
      const linhas = m.moeda !== 'orb' ? [] : m.itemId === 2 ? [
        { id: 501, tipo: 'item', qtd: 3, preco: 60, moeda: 'orb', vendedor: 'barateiro', compravelEm: ws.mercadoLib },
        { id: 502, tipo: 'item', qtd: 1, preco: 90, moeda: 'orb', vendedor: 'caro', compravelEm: 0 },
        { id: 503, tipo: 'item', qtd: 2, preco: 95, moeda: 'orb', vendedor: 'outro', compravelEm: 0 },
        { id: 504, tipo: 'item', qtd: 5, preco: 100, moeda: 'orb', vendedor: 'outro2', compravelEm: 0 },
      ] : m.itemId === 3 ? [
        { id: 601, tipo: 'item', qtd: 1, preco: 10, moeda: 'orb', vendedor: 'x', compravelEm: 0 },
      ] : [{ id: 701, tipo: 'item', qtd: 1, preco: 1, moeda: 'orb', vendedor: 'y', compravelEm: 0 }];
      ws.send(JSON.stringify({ t: 'market', aba: 'item', itemId: m.itemId, moeda: m.moeda, linhas }));
    }
    if (m.t === 'market.historicoGlobal') {
      const linhas = m.itemId === 2 && m.moeda === 'orb' ? [
        { tipo: 'item', descricao: '2× Bicycle Fragment', bruto: 196, moeda: 'orb', em: Date.now() - 6e5 },
        { tipo: 'item', descricao: '1× Bicycle Fragment', bruto: 99, moeda: 'orb', em: Date.now() - 9e5 },
        { tipo: 'item', descricao: '4× Bicycle Fragment', bruto: 388, moeda: 'orb', em: Date.now() - 2e6 },
        { tipo: 'item', descricao: '1× Bicycle Fragment', bruto: 97, moeda: 'orb', em: Date.now() - 3e6 },
        { tipo: 'item', descricao: '1× Bicycle Fragment', bruto: 300, moeda: 'orb', em: Date.now() - 9e6 }, // velha, fora das 4
      ] : [];
      ws.send(JSON.stringify({ t: 'market', aba: 'historicoGlobal', seq: m.seq, pagina: 0, linhas }));
    }
    if (m.t === 'market.comprar') {
      console.log('MERCADO compra', m.id, 'faltavam', (ws.mercadoLib || 0) - Date.now(), 'ms');
      if (m.id === 501 && Date.now() < ws.mercadoLib) ws.send(JSON.stringify({ t: 'erro', chave: 'market.retencao' }));
      else {
        ws.send(JSON.stringify({ t: 'erro', chave: 'market.sorteio' }));
        setTimeout(() => ws.send(JSON.stringify({ t: 'batalha', ev: [{ k: 'marketComprado', descricao: `${m.qtd}× Bicycle Fragment` }] })), 800);
      }
    }
    if (m.t === 'hunt.select') ws.send(JSON.stringify({ t: 'estado', estado: { huntSlug: m.slug } }));
    if (m.t === 'shop.buy') {
      const campo = m.kind === 'ball' ? 'balls' : 'items';
      e[campo] = { ...e[campo], [m.id]: (e[campo][m.id] || 0) + m.qty };
      ws.send(JSON.stringify({ t: 'estado', estado: { [campo]: e[campo] } }));
    }
  });
});
wssIrc.on('connection', (ws) => {
  let nick = '';
  ws.on('message', (raw) => {
    for (const l of String(raw).split('\r\n').filter(Boolean)) {
      console.log('IRC <', l.startsWith('PASS') ? 'PASS ***' : l);
      if (l.startsWith('NICK ')) { nick = l.slice(5); ws.send(`:tmi.twitch.tv 001 ${nick} :Welcome, GLHF!\r\n`); }
      if (l.startsWith('JOIN ')) for (const c of l.slice(5).split(',')) ws.send(`:${nick}!${nick}@${nick}.tmi.twitch.tv JOIN ${c}\r\n`);
      if (l.startsWith('PART ')) ws.send(`:${nick}!${nick}@${nick}.tmi.twitch.tv PART ${l.slice(5)}\r\n`);
    }
  });
  setTimeout(() => ws.send('PING :tmi.twitch.tv\r\n'), 1500);
});
srv.listen(PORT, '127.0.0.1', () => console.log('mock em http://127.0.0.1:' + PORT));
