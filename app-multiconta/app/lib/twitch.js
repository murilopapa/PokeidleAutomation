// Presença na Twitch por conta, do jeito mais leve: chat por IRC (WebSocket), sem vídeo e sem página.
//
// Login: Device Code Flow da Twitch (app "público", sem segredo). O app pede um código, abre a
// página de ativação da Twitch NA SESSÃO DA CONTA (então você loga com a Twitch daquela conta) e
// espera a autorização. Escopo pedido: só chat:read.
// Tokens ficam cifrados pelo sistema (safeStorage: DPAPI no Windows) em twitch.json.
//
// Docs: https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/ (Device Code Grant Flow)
//       https://dev.twitch.tv/docs/chat/irc/
const fs = require('node:fs');
const { safeStorage } = require('electron');

const ID = process.env.PIE_TW_ID_URL || 'https://id.twitch.tv/oauth2';      // troca só em teste
const IRC = process.env.PIE_TW_IRC_URL || 'wss://irc-ws.chat.twitch.tv:443';
const ESCOPO = 'chat:read';
const CLIENT_ID_PADRAO = '2tj5avyutmp3lci7mmikyocftmt7ul';
const WS = globalThis.WebSocket;

const cifrar = (s) => (s == null ? null : safeStorage.isEncryptionAvailable() ? 'enc:' + safeStorage.encryptString(s).toString('base64') : 'raw:' + s);
const decifrar = (s) => {
  if (!s) return null;
  if (s.startsWith('enc:')) { try { return safeStorage.decryptString(Buffer.from(s.slice(4), 'base64')); } catch (_) { return null; } }
  return s.startsWith('raw:') ? s.slice(4) : null;
};
const form = (o) => new URLSearchParams(o).toString();
const minus = (s) => String(s ?? '').toLowerCase().replace(/^#/, '');

async function postForm(url, corpo) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(corpo) });
  let j = null;
  try { j = await r.json(); } catch (_) { /* corpo vazio */ }
  return { status: r.status, j };
}

class Conexao {
  // Uma conexão IRC por conta. JOIN/PART conforme a lista desejada.
  constructor(dono, i) {
    this.dono = dono; this.i = i;
    this.ws = null; this.pronto = false; this.dentro = new Set(); this.tentativas = 0; this.timer = null; this.fechada = false;
  }
  get conta() { return this.dono.contas[this.i]; }
  abrir() {
    if (this.dono.pausada?.[this.i]) return;   // conta desligada no app
    this.fechada = false;
    clearTimeout(this.timer);
    const c = this.conta;
    const token = decifrar(c?.tok);
    if (!token || !c.login) return;
    if (!WS) { this.dono.erro(this.i, 'WebSocket indisponível nesta versão do Electron'); return; }
    const ws = new WS(IRC);
    this.ws = ws; this.pronto = false; this.dentro.clear();
    ws.onopen = () => {
      ws.send('CAP REQ :twitch.tv/commands twitch.tv/membership');
      ws.send('PASS oauth:' + token);
      ws.send('NICK ' + minus(c.login));
    };
    ws.onmessage = (ev) => String(ev.data).split('\r\n').filter(Boolean).forEach((l) => this.linha(l));
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.pronto = false; this.dentro.clear(); this.dono.mudou();
      if (!this.fechada) this.reabrir();
    };
    ws.onerror = () => {};
  }
  reabrir() {
    clearTimeout(this.timer);
    const espera = Math.min(60000, 2000 * 2 ** Math.min(this.tentativas++, 5));
    this.timer = setTimeout(() => this.abrir(), espera);
  }
  fechar() {
    this.fechada = true; clearTimeout(this.timer);
    try { this.ws?.close(); } catch (_) { /* já fechou */ }
    this.ws = null; this.pronto = false; this.dentro.clear();
  }
  linha(l) {
    if (l.startsWith('PING')) { this.ws?.send('PONG' + l.slice(4)); return; }
    const m = l.match(/^(?:@\S+ )?(?::(\S+) )?(\S+)(?: (.*))?$/);
    if (!m) return;
    const [, prefixo = '', cmd, resto = ''] = m;
    const eu = minus(this.conta?.login);
    if (cmd === '001') { this.pronto = true; this.tentativas = 0; this.dono.erro(this.i, null); this.sincronizar(); return; }
    if (cmd === 'NOTICE' && /Login authentication failed|Improperly formatted auth/i.test(resto)) {
      this.fechada = true; try { this.ws?.close(); } catch (_) { /* ok */ }
      this.dono.renovar(this.i).then((ok) => { if (ok) this.abrir(); });
      return;
    }
    if (cmd === 'RECONNECT') { try { this.ws?.close(); } catch (_) { /* volta pelo onclose */ } return; }
    if (cmd === 'JOIN' && minus(prefixo.split('!')[0]) === eu) { this.dentro.add(minus(resto.split(' ')[0])); this.dono.mudou(); return; }
    if (cmd === 'PART' && minus(prefixo.split('!')[0]) === eu) { this.dentro.delete(minus(resto.split(' ')[0])); this.dono.mudou(); }
  }
  sincronizar() {
    if (!this.pronto || !this.ws) return;
    const quero = this.dono.desejados(this.i);
    const entrar = [...quero].filter((c) => !this.dentro.has(c));
    const sair = [...this.dentro].filter((c) => !quero.has(c));
    // a Twitch limita JOIN (20 a cada 10 s por usuário): manda aos poucos
    for (const c of sair) this.ws.send('PART #' + c);
    entrar.slice(0, 15).forEach((c, k) => setTimeout(() => this.ws?.send('JOIN #' + c), k * 300));
  }
}

class Twitch {
  constructor({ arquivo, slots, particao, aoMudar, janela }) {
    Object.assign(this, { arquivo, slots, particao, aoMudar, janela });
    let d = {};
    try { d = JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch (_) { /* primeira vez */ }
    // Client ID do app na Twitch (app "público": o Client ID não é segredo, vai junto no programa)
    this.clientId = d.clientId || process.env.PIE_TWITCH_CLIENT_ID || CLIENT_ID_PADRAO;
    this.contas = Array.from({ length: slots }, (_, i) => ({ auto: true, canais: [], ...(d.contas?.[i] || {}) }));
    this.jogo = Array.from({ length: slots }, () => null);   // bloco twitch do snapshot do jogo
    this.erros = Array.from({ length: slots }, () => null);
    this.vinculando = Array.from({ length: slots }, () => null);
    this.irc = Array.from({ length: slots }, (_, i) => new Conexao(this, i));
    for (let i = 0; i < slots; i++) if (this.contas[i].tok) this.validar(i).then((ok) => ok && this.irc[i].abrir());
    // a Twitch pede validar o token de hora em hora
    this.relogio = setInterval(() => { for (let i = 0; i < slots; i++) if (this.contas[i].tok) this.validar(i); }, 3600 * 1000);
  }

  gravar() {
    fs.writeFile(this.arquivo, JSON.stringify({ clientId: this.clientId, contas: this.contas }), () => {});
  }
  mudou() { this.aoMudar?.(this.estado()); }
  erro(i, msg) { this.erros[i] = msg; this.mudou(); }

  estado() {
    return {
      temClientId: !!this.clientId,
      contas: this.contas.map((c, i) => ({
        login: c.tok ? c.login : null,
        auto: c.auto !== false,
        canais: c.canais || [],
        conectado: this.irc[i].pronto,
        dentro: [...this.irc[i].dentro],
        erro: this.erros[i],
        vinculando: this.vinculando[i] ? { codigo: this.vinculando[i].codigo } : null,
        pausada: !!this.pausada?.[i],
      })),
    };
  }

  setClientId(id) {
    this.clientId = String(id || '').trim();
    this.gravar(); this.mudou();
    return { ok: !!this.clientId };
  }
  setAuto(i, on) { this.contas[i].auto = on; this.gravar(); this.irc[i].sincronizar(); this.mudou(); return true; }
  setCanal(i, canal, on) {
    const c = minus(canal);
    const s = new Set(this.contas[i].canais || []);
    on ? s.add(c) : s.delete(c);
    this.contas[i].canais = [...s];
    this.gravar(); this.irc[i].sincronizar(); this.mudou();
    return true;
  }
  snapshot(i, snap) {
    const antes = JSON.stringify(this.jogo[i]);
    this.jogo[i] = snap?.twitch ?? null;
    if (JSON.stringify(this.jogo[i]) !== antes) this.irc[i].sincronizar();
  }
  // Em quais canais esta conta deve estar: no automático, todas as lives oficiais no ar que dão bônus;
  // e sempre as que você marcou na mão.
  desejados(i) {
    const quero = new Set((this.contas[i].canais || []).map(minus));
    const tw = this.jogo[i];
    if (this.contas[i].auto !== false && tw) {
      const semBonus = new Set((tw.oficiais || []).filter((o) => o.bonus === false).map((o) => minus(o.login)));
      const oficiais = new Set((tw.oficiais || []).map((o) => minus(o.login)));
      for (const l of tw.lives || []) {
        const c = minus(l.login);
        if (oficiais.has(c) && !semBonus.has(c)) quero.add(c);
      }
    }
    return quero;
  }

  // ---------------------------------------------------------------- login (Device Code Flow)
  async vincular(i) {
    if (!this.clientId) return { erro: 'clientId' };
    if (this.vinculando[i]) { this.vinculando[i].janela?.focus(); return { ok: true }; }
    const r = await postForm(ID + '/device', { client_id: this.clientId, scopes: ESCOPO });
    if (r.status !== 200 || !r.j?.device_code) return { erro: r.j?.message || 'A Twitch recusou o Client ID (status ' + r.status + ').' };
    const { device_code, user_code, verification_uri, interval = 5, expires_in = 1800 } = r.j;
    const janela = this.janela({ width: 520, height: 760, title: 'Vincular Twitch', webPreferences: { partition: this.particao(i), sandbox: true, contextIsolation: true } });
    janela.loadURL(verification_uri);
    const v = { codigo: user_code, janela, ate: Date.now() + expires_in * 1000 };
    this.vinculando[i] = v;
    janela.on('closed', () => { v.janela = null; if (this.vinculando[i] === v) { this.vinculando[i] = null; this.mudou(); } });
    this.mudou();

    let passo = Math.max(1, interval) * 1000;
    const tentar = async () => {
      if (this.vinculando[i] !== v) return;
      if (Date.now() > v.ate) { this.vinculando[i] = null; v.janela?.close(); this.erro(i, 'O código expirou. Tente de novo.'); return; }
      const t = await postForm(ID + '/token', { client_id: this.clientId, scopes: ESCOPO, device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }).catch(() => ({ status: 0 }));
      if (t.status === 200 && t.j?.access_token) {
        this.contas[i].tok = cifrar(t.j.access_token);
        this.contas[i].ref = cifrar(t.j.refresh_token);
        this.vinculando[i] = null;
        v.janela?.close();
        if (await this.validar(i)) { this.gravar(); this.irc[i].abrir(); }
        this.mudou();
        return;
      }
      const msg = String(t.j?.message || '');
      if (/slow_down/i.test(msg)) passo += 5000;
      else if (t.status && !/authorization_pending/i.test(msg)) { this.vinculando[i] = null; v.janela?.close(); this.erro(i, 'Vínculo cancelado: ' + (msg || t.status)); return; }
      setTimeout(tentar, passo);
    };
    setTimeout(tentar, passo);
    return { ok: true, codigo: user_code };
  }

  async validar(i) {
    const tok = decifrar(this.contas[i].tok);
    if (!tok) return false;
    try {
      const r = await fetch(ID + '/validate', { headers: { Authorization: 'OAuth ' + tok } });
      if (r.status === 401) return this.renovar(i);
      if (!r.ok) return true; // fora do ar: mantém o que tem
      const j = await r.json();
      this.contas[i].login = j.login; this.contas[i].userId = j.user_id;
      this.gravar(); this.mudou();
      return true;
    } catch (_) { return true; }
  }

  async renovar(i) {
    const ref = decifrar(this.contas[i].ref);
    if (!ref) { this.limpar(i, 'Login da Twitch expirou. Vincule de novo.'); return false; }
    const r = await postForm(ID + '/token', { client_id: this.clientId, grant_type: 'refresh_token', refresh_token: ref }).catch(() => ({ status: 0 }));
    if (r.status === 200 && r.j?.access_token) {
      this.contas[i].tok = cifrar(r.j.access_token);
      this.contas[i].ref = cifrar(r.j.refresh_token || ref);
      this.gravar();
      return this.validar(i);
    }
    if (r.status === 0) return false;
    this.limpar(i, 'Login da Twitch expirou. Vincule de novo.');
    return false;
  }

  limpar(i, msg = null) {
    this.irc[i].fechar();
    const { auto, canais } = this.contas[i];
    this.contas[i] = { auto, canais };
    this.gravar();
    this.erro(i, msg);
  }

  async desvincular(i) {
    const tok = decifrar(this.contas[i].tok);
    this.limpar(i);
    if (tok && this.clientId) postForm(ID + '/revoke', { client_id: this.clientId, token: tok }).catch(() => {});
    return true;
  }

  // conta desligada no app: sai do chat; ligada de novo: volta (se tiver Twitch vinculada)
  pausar(i, on) {
    this.pausada = this.pausada || [];
    this.pausada[i] = on;
    if (on) this.irc[i].fechar();
    else if (this.contas[i].tok && !this.irc[i].ws) this.irc[i].abrir();
    this.mudou();
  }

  fechar() { clearInterval(this.relogio); this.irc.forEach((c) => c.fechar()); }
}

module.exports = Twitch;
