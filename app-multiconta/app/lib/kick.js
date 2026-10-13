// Bônus da Kick por conta.
//
// Como o bônus funciona (código do jogo): os canais oficiais da Kick têm recompensas de pontos do
// canal; cada resgate vale 1 h de +15% (XP, captura ou shiny) e o servidor do jogo credita sozinho.
// Os pontos são da Kick: 10 a cada 5 min assistindo LOGADO, e são de cada canal (só se gastam no
// mesmo canal). Por isso a conta precisa de um player de verdade aberto (mudo, qualidade mínima).
// https://help.kick.com/en/articles/10709188-guide-to-channel-points
//
// Saldo e resgate usam as mesmas rotas que o site da Kick usa, com o login da própria conta
// (cookie "session_token" da sessão daquele quadrado). Nada de fingir espectador: quem assiste é o
// player aberto pelo app.
// Resgate automático desligado: o resgate pela API da Kick não funciona de fora do site.
const AUTO_RESGATE = false;
const fs = require('node:fs');
const crypto = require('node:crypto');
const { session } = require('electron');

const BASE = process.env.PIE_KICK_URL || 'https://kick.com';       // troca só em teste
const PALAVRAS = { xp: /\bxp\b|exp|experi/i, captura: /captur|catch/i, shiny: /shiny|lure|brilh/i };
const SALDO_ATUAL_MS = 2 * 60 * 1000;     // canal que está assistindo
const SALDO_OUTROS_MS = 15 * 60 * 1000;   // demais canais oficiais (inclusive offline)
const RAPIDO = !!process.env.PIE_KICK_RAPIDO;               // só em teste
const ENTRE_RESGATES_MS = RAPIDO ? 2000 : 90 * 1000;
const JANELA_OCULTO_MS = RAPIDO ? 6000 : 15 * 60 * 1000;
const minus = (s) => String(s ?? '').toLowerCase();

function numero(d) {
  if (typeof d === 'number') return d;
  if (!d || typeof d !== 'object') return null;
  for (const k of ['points', 'balance', 'amount', 'total']) if (typeof d[k] === 'number') return d[k];
  if (d.data != null) return numero(d.data);
  return null;
}
function lista(d) {
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d?.rewards)) return d.rewards;
  if (Array.isArray(d?.data?.rewards)) return d.data.rewards;
  return [];
}

class Kick {
  constructor({ arquivo, debug, slots, particao, aoMudar, aoAssistir }) {
    Object.assign(this, { arquivo, debug, slots, particao, aoMudar, aoAssistir });
    let d = {};
    try { d = JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch (_) { /* primeira vez */ }
    this.contas = Array.from({ length: slots }, (_, i) => ({ ligado: false, auto: false, tipo: 'xp', canal: null, saldos: {}, ...(d.contas?.[i] || {}) }));
    this.jogo = Array.from({ length: slots }, () => null);
    this.user = Array.from({ length: slots }, () => null);      // usuário da Kick logado na sessão
    this.assistindo = Array.from({ length: slots }, () => []);   // TODAS as lives oficiais com pontos no ar
    this.erro = Array.from({ length: slots }, () => null);
    this.rewards = Array.from({ length: slots }, () => ({}));   // slug -> { em, lista }
    this.ultimoResgate = Array.from({ length: slots }, () => 0);
    this.falhaCanal = Array.from({ length: slots }, () => ({})); // slug -> até quando não tentar
    this.historico = Array.from({ length: slots }, () => []);
    this.amostras = Array.from({ length: slots }, () => ({}));
    this.modoAtual = [];
    this.ocultoDesde = this.contas.map((c) => (c.visivel ? 0 : Date.now()));
    this.pausada = [];
    this.ultimas = {};
    this.timer = setInterval(() => this.ciclo(), RAPIDO ? 4000 : 30 * 1000);
    setTimeout(() => this.ciclo(), 3000);
  }

  gravar() {
    fs.writeFile(this.arquivo, JSON.stringify({ contas: this.contas }), () => {});
  }
  mudou() { this.aoMudar?.(this.estado()); }

  estado() {
    return {
      contas: this.contas.map((c, i) => ({
        ligado: !!c.ligado && !this.pausada[i],
        auto: !!c.auto,
        tipo: c.tipo,
        canal: c.canal,
        user: this.user[i],
        assistindo: this.assistindo[i],
        saldos: c.saldos,
        erro: this.erro[i],
        historico: this.historico[i].slice(-5),
        visivel: !!c.visivel,
        completo: !!c.completo,
        naoContaOculto: !!c.naoContaOculto,
      })),
    };
  }

  // ---------------------------------------------------------------- chamadas à Kick
  async token(i) {
    const ses = session.fromPartition(this.particao(i));
    const [c] = await ses.cookies.get({ url: BASE, name: 'session_token' });
    return c ? decodeURIComponent(c.value) : null;
  }
  async api(i, method, caminho, corpo) {
    const tok = await this.token(i);
    if (!tok) throw Object.assign(new Error('Conta não está logada na Kick'), { semLogin: true });
    const ses = session.fromPartition(this.particao(i));
    const r = await ses.fetch(BASE + caminho, {
      method,
      headers: { Accept: 'application/json', 'x-app-platform': 'web', Authorization: 'Bearer ' + tok, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    let data = null;
    try { data = await r.json(); } catch (_) { /* sem corpo */ }
    // guarda as últimas respostas (sem token) para diagnosticar se a Kick mudar o site
    this.ultimas[method + ' ' + caminho.replace(/\/[^/]+\/(points|rewards)/, '/*/$1')] = { status: r.status, data, em: new Date().toISOString() };
    if (this.debug) fs.writeFile(this.debug, JSON.stringify(this.ultimas, null, 1), () => {});
    if (r.status === 401) this.user[i] = null;
    if (!r.ok) throw Object.assign(new Error(data?.message || `Kick respondeu ${r.status}`), { status: r.status, data });
    return data;
  }

  async quemSou(i) {
    try {
      const d = await this.api(i, 'GET', '/api/v1/user');
      this.user[i] = d?.username || d?.data?.username || d?.user?.username || '?';
    } catch (e) { this.user[i] = null; if (!e.semLogin) this.erro[i] = e.message; }
    return this.user[i];
  }

  async atualizarSaldo(i, slug) {
    const d = await this.api(i, 'GET', `/api/v2/channels/${encodeURIComponent(slug)}/points`);
    const n = numero(d);
    if (n != null) {
      this.contas[i].saldos[slug] = { pontos: n, em: Date.now() };
      this.gravar();
      this.vigiarOculto(i, slug, n);
    }
    return n;
  }

  // Players escondidos: confere se a Kick continua dando pontos. Se uma live no ar passar 15 min
  // sem ganhar nada (e sem resgate no meio), volta esta conta para players pequenos VISÍVEIS.
  vigiarOculto(i, slug, n) {
    const c = this.contas[i];
    if ((c.visivel && c.completo) || !this.assistindo[i].includes(slug)) { delete this.amostras[i][slug]; return; }
    const agora = Date.now();
    const a = (this.amostras[i][slug] ||= []);
    a.push({ t: agora, n });
    while (a.length && agora - a[0].t > 25 * 60 * 1000) a.shift();
    const desde = Math.max(this.ocultoDesde[i] || 0, this.ultimoResgate[i] || 0);
    const janela = a.filter((x) => x.t >= desde);
    if (janela.length >= 2 && janela.at(-1).t - janela[0].t >= JANELA_OCULTO_MS && Math.max(...janela.map((x) => x.n)) <= janela[0].n) {
      // 1º passo: players visíveis; se mesmo assim não contar, a página inteira da Kick
      if (!c.visivel) { c.visivel = true; this.erro[i] = 'Com o player escondido a Kick parou de dar pontos. Deixei os players pequenos e visíveis nesta conta.'; }
      else { c.completo = true; this.erro[i] = 'O player leve não estava contando pontos. Troquei para a página completa da Kick nesta conta.'; }
      c.naoContaOculto = true;
      this.ocultoDesde[i] = Date.now();
      this.amostras[i] = {};
      this.gravar();
      this.decidirPlayer(i);
      this.mudou();
    }
  }

  async recompensasDe(i, slug) {
    const c = this.rewards[i][slug];
    if (c && Date.now() - c.em < 10 * 60 * 1000) return c.lista;
    const d = await this.api(i, 'GET', `/api/v2/channels/${encodeURIComponent(slug)}/rewards?is_enabled=true`);
    const l = lista(d).map((r) => ({ id: r.id, titulo: r.title ?? r.name ?? '', custo: Number(r.cost ?? r.price) || 0, pausada: !!(r.is_paused ?? r.paused), pedeTexto: !!r.is_user_input_required }));
    this.rewards[i][slug] = { em: Date.now(), lista: l };
    return l;
  }

  // A recompensa do jogo para o tipo (xp/captura/shiny) neste canal: mesmo custo do jogo e nome parecido.
  async recompensaDoTipo(i, slug, tipo) {
    const custo = this.jogo[i]?.recompensas?.find((r) => r.tipo === tipo)?.custo || 0;
    const l = (await this.recompensasDe(i, slug)).filter((r) => !r.pausada && !r.pedeTexto);
    const porCusto = custo ? l.filter((r) => r.custo === custo) : l;
    return porCusto.find((r) => PALAVRAS[tipo]?.test(r.titulo)) || (custo && porCusto.length === 1 ? porCusto[0] : null);
  }

  async resgatar(i, slug, tipo = this.contas[i].tipo, origem = 'manual') {
    const r = await this.recompensaDoTipo(i, slug, tipo);
    if (!r) throw new Error(`Não achei a recompensa de ${tipo} no canal ${slug}`);
    await this.api(i, 'POST', `/api/v2/channels/${encodeURIComponent(slug)}/rewards/${encodeURIComponent(r.id)}/redeem`, { transaction_id: crypto.randomUUID(), message: '' });
    this.ultimoResgate[i] = Date.now();
    this.historico[i].push({ em: Date.now(), slug, tipo, custo: r.custo, origem });
    const s = this.contas[i].saldos[slug];
    if (s) s.pontos = Math.max(0, s.pontos - r.custo);
    this.gravar();
    setTimeout(() => this.atualizarSaldo(i, slug).then(() => this.mudou()).catch(() => {}), 4000);
    this.mudou();
    return { ok: true, custo: r.custo, titulo: r.titulo };
  }

  // ---------------------------------------------------------------- escolha do canal e ciclo
  canaisComPontos(i) {
    return (this.jogo[i]?.oficiais || []).filter((c) => c.ativo && c.slug);
  }
  // Um player por live oficial (com pontos ativos) que estiver no ar: farma em todas ao mesmo tempo.
  alvos(i) {
    const c = this.contas[i];
    if (!c.ligado || this.pausada[i]) return [];
    return this.canaisComPontos(i).filter((x) => x.aoVivo).sort((a, b) => b.espectadores - a.espectadores).map((x) => x.slug);
  }
  decidirPlayer(i) {
    const a = this.alvos(i);
    const modo = this.contas[i].completo ? 'completo' : 'leve';
    if (a.join('|') !== this.assistindo[i].join('|') || modo !== this.modoAtual[i]) { this.assistindo[i] = a; this.modoAtual[i] = modo; this.aoAssistir?.(i, a, modo); this.mudou(); }
  }

  snapshot(i, snap) {
    const antes = JSON.stringify(this.jogo[i]);
    this.jogo[i] = snap?.kick ?? null;
    if (JSON.stringify(this.jogo[i]) !== antes) { this.decidirPlayer(i); this.mudou(); }
  }

  async ciclo() {
    if (this.rodando) return;
    this.rodando = true;
    try { await this.cicloContas(); } finally { this.rodando = false; }
  }
  async cicloContas() {
    for (let i = 0; i < this.slots; i++) {
      const c = this.contas[i];
      if (!c.ligado || this.pausada[i]) continue;
      try {
        this.decidirPlayer(i);
        if (!this.user[i]) await this.quemSou(i);
        if (!this.user[i]) { this.erro[i] = 'Entre na Kick nesta conta (engrenagem → Entrar na Kick).'; continue; }
        // saldos: o canal assistido a cada 2 min; os outros oficiais (até offline) a cada 15 min
        for (const canal of this.canaisComPontos(i)) {
          const s = c.saldos[canal.slug];
          const prazo = this.assistindo[i].includes(canal.slug) ? SALDO_ATUAL_MS : SALDO_OUTROS_MS;
          if (!s || Date.now() - s.em > prazo) await this.atualizarSaldo(i, canal.slug).catch(() => {});
        }
        this.erro[i] = null;
        await this.talvezResgatar(i);
      } catch (e) {
        this.erro[i] = e.message;
      }
      this.mudou();
    }
  }

  // Resgate automático (desligado, ver AUTO_RESGATE): só com o jogo vinculado à MESMA conta da Kick, um por vez, no tipo escolhido.
  async talvezResgatar(i) {
    const c = this.contas[i], jg = this.jogo[i];
    // Desligado: o resgate pela API da Kick não funciona de fora do site. Resgate na própria live.
    if (!AUTO_RESGATE || !c.auto || !jg?.vinculado) return;
    if (jg.login && this.user[i] && minus(jg.login) !== minus(this.user[i])) {
      this.erro[i] = `No jogo está vinculada a Kick "${jg.login}", aqui está logada "${this.user[i]}". Resgate automático parado.`;
      return;
    }
    if (Date.now() - this.ultimoResgate[i] < ENTRE_RESGATES_MS) return;
    const custo = jg.recompensas?.find((r) => r.tipo === c.tipo)?.custo || 0;
    if (!custo) return;
    const canais = this.canaisComPontos(i)
      .filter((x) => (c.saldos[x.slug]?.pontos || 0) >= custo && !(this.falhaCanal[i][x.slug] > Date.now()))
      .sort((a, b) => (c.saldos[b.slug]?.pontos || 0) - (c.saldos[a.slug]?.pontos || 0));
    for (const canal of canais) {
      try { await this.resgatar(i, canal.slug, c.tipo, 'automático'); return; }
      catch (e) { this.falhaCanal[i][canal.slug] = Date.now() + 30 * 60 * 1000; this.erro[i] = `${canal.nome || canal.slug}: ${e.message}`; }
    }
  }

  // ---------------------------------------------------------------- ajustes vindos da interface
  set(i, campo, valor) {
    const c = this.contas[i];
    if (campo === 'ligado') c.ligado = !!valor;
    else if (campo === 'auto') c.auto = !!valor;
    else if (campo === 'tipo' && PALAVRAS[valor]) c.tipo = valor;
    else if (campo === 'canal') c.canal = valor || null;
    else if (campo === 'completo') { c.completo = !!valor; this.ocultoDesde[i] = Date.now(); this.amostras[i] = {}; }
    else if (campo === 'visivel') { c.visivel = !!valor; if (!valor) { this.ocultoDesde[i] = Date.now(); this.amostras[i] = {}; } }
    this.gravar();
    this.decidirPlayer(i);
    if (campo === 'ligado' && valor) setTimeout(() => this.ciclo(), 500);
    this.mudou();
    return this.estado().contas[i];
  }
  pausar(i, on) { this.pausada[i] = on; this.decidirPlayer(i); this.mudou(); }
  async logou(i) { this.user[i] = null; await this.quemSou(i); this.erro[i] = null; this.ciclo(); this.mudou(); }
  fechar() { clearInterval(this.timer); }
}

module.exports = Kick;
