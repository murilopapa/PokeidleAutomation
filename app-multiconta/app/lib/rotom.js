'use strict';
// Rotom Sniper (extensão oficial do jogo) rodando DENTRO do app.
//
// A extensão é carregada de verdade (session.loadExtension) na sessão de cada conta, então ela
// injeta o próprio código no jogo daquela conta e guarda a config no chrome.storage daquela sessão
// (cada conta tem as suas regras, logs e carteira). A tela da extensão (cockpit.html) abre numa
// janela do app por conta. O ID da extensão é o mesmo da loja (vem da "key" do manifest).
//
// Pastas (em %APPDATA%\PokeIdle Multi\rotom):
//   original\<versão>\  cópia intocada importada do navegador (as 2 últimas ficam guardadas)
//   patches\*.json      seus ajustes: aplicados por cima da original a cada importação
//   ativa\              original + patches: é esta que o app carrega
//   info.json           versão importada, de onde veio e o resultado dos patches
//
// Formato de um patch (arquivo .json com um objeto ou uma lista de objetos):
//   { "arquivo": "injected.js", "trocar": "texto exato", "por": "texto novo", "descricao": "...", "uma": false }
//   "uma": true troca só a 1ª ocorrência; senão troca todas. Se o texto não existir mais (a extensão
//   mudou), o patch é marcado como falha e o app avisa em vez de quebrar em silêncio.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const EXT_ID = 'olccbpdjdkbfgondiiaicmlifhbcggmk';

// ID de extensão = 32 primeiras letras (a-p) do SHA-256 da chave pública do manifest.
function idDaChave(key) {
  const h = crypto.createHash('sha256').update(Buffer.from(String(key), 'base64')).digest('hex').slice(0, 32);
  return h.replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
}
const partes = (v) => String(v || '0').split('.').map((n) => parseInt(n, 10) || 0);
function cmpVersao(a, b) {
  const x = partes(a), y = partes(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d < 0 ? -1 : 1; }
  return 0;
}
const lerManifest = (pasta) => { try { return JSON.parse(fs.readFileSync(path.join(pasta, 'manifest.json'), 'utf8')); } catch (_) { return null; } };
const ehDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch (_) { return false; } };

// Onde navegadores Chromium guardam as extensões instaladas.
function bases() {
  if (process.env.PIE_ROTOM_SRC) return [['teste', process.env.PIE_ROTOM_SRC, true]];
  const home = os.homedir();
  const L = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const R = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  return [
    ['Brave', path.join(L, 'BraveSoftware', 'Brave-Browser', 'User Data')],
    ['Chrome', path.join(L, 'Google', 'Chrome', 'User Data')],
    ['Edge', path.join(L, 'Microsoft', 'Edge', 'User Data')],
    ['Vivaldi', path.join(L, 'Vivaldi', 'User Data')],
    ['Opera', path.join(R, 'Opera Software', 'Opera Stable')],
    ['Opera GX', path.join(R, 'Opera Software', 'Opera GX Stable')],
  ];
}
// Todas as cópias da extensão oficial instaladas nos navegadores desta máquina.
function acharInstaladas() {
  const out = [];
  for (const [nav, base, direto] of bases()) {
    if (!ehDir(base)) continue;
    const perfis = direto ? [base] : [base, ...fs.readdirSync(base).filter((n) => /^(Default|Profile \d+)$/.test(n)).map((n) => path.join(base, n))];
    for (const perfil of perfis) {
      const raiz = direto ? perfil : path.join(perfil, 'Extensions', EXT_ID);
      if (!ehDir(raiz)) continue;
      for (const v of fs.readdirSync(raiz)) {
        const pasta = path.join(raiz, v);
        const m = ehDir(pasta) && lerManifest(pasta);
        if (m && m.key && idDaChave(m.key) === EXT_ID) out.push({ nav, pasta, versao: String(m.version) });
      }
    }
  }
  return out.sort((a, b) => cmpVersao(b.versao, a.versao));
}

class Rotom {
  // dir: pasta do Rotom; slots; particao(i); nome(i) → texto para o título da janela
  // electron: { session, BrowserWindow, shell }
  constructor({ dir, slots, particao, nome, electron, aoMudar }) {
    this.dir = dir; this.slots = slots; this.particao = particao;
    this.nome = nome || ((i) => `Conta ${i + 1}`);
    this.el = electron; this.aoMudar = aoMudar || (() => {});
    this.ativa = path.join(dir, 'ativa');
    this.ids = Array(slots).fill(null);
    this.erros = Array(slots).fill(null);
    this.janelas = Array(slots).fill(null);
    this.nova = null;          // versão mais nova achada no navegador (ainda não importada)
    this.ultimoErro = null;
    fs.mkdirSync(path.join(dir, 'patches'), { recursive: true });
    try { fs.writeFileSync(path.join(dir, 'LEIA-ME.txt'), LEIA_ME, { flag: 'wx' }); } catch (_) { /* já existe */ }
  }

  info() { try { return JSON.parse(fs.readFileSync(path.join(this.dir, 'info.json'), 'utf8')); } catch (_) { return null; } }
  disponivel() { return !!lerManifest(this.ativa); }
  versao() { return lerManifest(this.ativa)?.version ?? null; }

  estado() {
    const inf = this.info();
    return {
      disponivel: this.disponivel(),
      versao: this.versao(),
      origem: inf?.nav ?? null,
      patches: inf?.patches ?? [],
      nova: this.nova,
      carregadas: this.ids.map((x) => !!x),
      erros: this.erros,
      erro: this.ultimoErro,
    };
  }
  _avisar() { this.aoMudar(this.estado()); }

  // Procura no(s) navegador(es) uma versão mais nova que a importada.
  verificar() {
    const achadas = acharInstaladas();
    const atual = this.versao();
    this.nova = achadas[0] && (!atual || cmpVersao(achadas[0].versao, atual) > 0) ? achadas[0].versao : null;
    this._avisar();
    return { achadas: achadas.length, nova: this.nova, melhor: achadas[0] || null };
  }

  // Importa a cópia (de um navegador ou de uma pasta) e monta a pasta "ativa" (original + patches).
  importar(origem) {
    let src = origem;
    let nav = 'pasta escolhida';
    if (!src) {
      const m = acharInstaladas()[0];
      if (!m) throw new Error('Não achei a extensão Rotom Sniper instalada em nenhum navegador (Brave, Chrome, Edge, Vivaldi, Opera). Instale pela loja ou escolha a pasta dela.');
      src = m.pasta; nav = m.nav;
    }
    let m = lerManifest(src);
    if (!m) {   // escolheu a pasta da extensão (que tem as versões dentro)
      const subs = ehDir(src) ? fs.readdirSync(src).map((n) => path.join(src, n)).filter((p) => lerManifest(p)) : [];
      subs.sort((a, b) => cmpVersao(lerManifest(b).version, lerManifest(a).version));
      if (!subs.length) throw new Error('Essa pasta não tem um manifest.json de extensão.');
      src = subs[0]; m = lerManifest(src);
    }
    if (!m.key || idDaChave(m.key) !== EXT_ID) throw new Error('Essa não é a extensão oficial Rotom Sniper (o ID não bate).');
    const versao = String(m.version);
    const orig = path.join(this.dir, 'original', versao);
    fs.rmSync(orig, { recursive: true, force: true });
    fs.cpSync(src, orig, { recursive: true, filter: (s) => !/[\\/]_metadata([\\/]|$)/.test(s) });
    // guarda só as 2 versões mais novas
    const guardadas = fs.readdirSync(path.join(this.dir, 'original')).sort(cmpVersao).reverse();
    for (const v of guardadas.slice(2)) fs.rmSync(path.join(this.dir, 'original', v), { recursive: true, force: true });
    const patches = this.montar(versao);
    fs.writeFileSync(path.join(this.dir, 'info.json'), JSON.stringify({ versao, nav, origem: src, em: Date.now(), patches }, null, 1));
    this.ultimoErro = null;
    this.nova = null;
    this._avisar();
    return { versao, patches };
  }

  // ativa = cópia da original + patches (refaz sempre do zero).
  montar(versao) {
    fs.rmSync(this.ativa, { recursive: true, force: true });
    fs.cpSync(path.join(this.dir, 'original', versao), this.ativa, { recursive: true });
    const resultado = [];
    const pdir = path.join(this.dir, 'patches');
    for (const nome of fs.readdirSync(pdir).filter((n) => n.endsWith('.json')).sort()) {
      let lista;
      try { const j = JSON.parse(fs.readFileSync(path.join(pdir, nome), 'utf8')); lista = Array.isArray(j) ? j : [j]; } catch (e) { resultado.push({ patch: nome, ok: false, erro: 'JSON inválido: ' + e.message }); continue; }
      lista.forEach((p, k) => {
        const rot = lista.length > 1 ? `${nome}#${k + 1}` : nome;
        try {
          const alvo = path.resolve(this.ativa, String(p.arquivo || ''));
          if (!alvo.startsWith(this.ativa + path.sep)) throw new Error('arquivo fora da extensão');
          const txt = fs.readFileSync(alvo, 'utf8');
          if (!p.trocar || !txt.includes(p.trocar)) throw new Error('o texto a trocar não existe mais nesta versão');
          const novo = p.uma ? txt.replace(p.trocar, () => String(p.por ?? '')) : txt.split(p.trocar).join(String(p.por ?? ''));
          fs.writeFileSync(alvo, novo);
          resultado.push({ patch: rot, ok: true, descricao: p.descricao || '' });
        } catch (e) { resultado.push({ patch: rot, ok: false, erro: e.message, descricao: p.descricao || '' }); }
      });
    }
    return resultado;
  }

  // ---- carregar nas sessões
  _api(i) {
    const ses = this.el.session.fromPartition(this.particao(i));
    return ses.extensions && ses.extensions.loadExtension ? ses.extensions : ses;
  }
  async carregarConta(i) {
    if (!this.disponivel()) return false;
    const api = this._api(i);
    try {
      for (const e of (api.getAllExtensions?.() ?? [])) if (e.id === EXT_ID) await api.removeExtension(e.id);
      const ext = await api.loadExtension(this.ativa);
      this.ids[i] = ext.id;
      this.erros[i] = null;
      if (ext.id !== EXT_ID) console.warn('[PIE] Rotom: ID diferente do esperado:', ext.id);
      return true;
    } catch (e) {
      this.ids[i] = null;
      this.erros[i] = String(e?.message || e);
      console.error('[PIE] Rotom: falha ao carregar na conta', i + 1, this.erros[i]);
      return false;
    }
  }
  async carregar() {
    for (let i = 0; i < this.slots; i++) await this.carregarConta(i);
    this._avisar();
  }
  // Desliga: tira a extensão das sessões (os jogos precisam ser recarregados para largar o código dela).
  async descarregar() {
    this.fecharJanelas();
    for (let i = 0; i < this.slots; i++) {
      try { const api = this._api(i); for (const e of (api.getAllExtensions?.() ?? [])) if (e.id === EXT_ID) await api.removeExtension(e.id); } catch (_) { /* segue */ }
      this.ids[i] = null; this.erros[i] = null;
    }
    this._avisar();
  }
  // Depois de importar uma versão nova: fecha os cockpits e recarrega a extensão nas contas.
  async recarregar() {
    this.fecharJanelas();
    await this.carregar();
  }

  // ---- cockpit (a tela da extensão), uma janela por conta
  abrirCockpit(i) {
    if (!(i >= 0 && i < this.slots)) return { erro: 'conta inválida' };
    const id = this.ids[i];
    if (!id) return { erro: this.erros[i] || 'A extensão não está carregada nesta conta.' };
    let w = this.janelas[i];
    if (w && !w.isDestroyed()) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); return { ok: true }; }
    const titulo = () => `Rotom Sniper — ${this.nome(i)}`;
    w = new this.el.BrowserWindow({
      width: 1160, height: 760, minWidth: 700, minHeight: 480, autoHideMenuBar: true, backgroundColor: '#0b1020', title: titulo(),
      webPreferences: { partition: this.particao(i), spellcheck: false },
    });
    w.on('page-title-updated', (e) => { e.preventDefault(); w.setTitle(titulo()); });
    w.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) this.el.shell.openExternal(url); return { action: 'deny' }; });
    w.on('closed', () => { if (this.janelas[i] === w) this.janelas[i] = null; });
    w.loadURL(`chrome-extension://${id}/cockpit.html`);
    this.janelas[i] = w;
    return { ok: true };
  }
  fecharJanelas() {
    for (let i = 0; i < this.slots; i++) { const w = this.janelas[i]; if (w && !w.isDestroyed()) w.close(); this.janelas[i] = null; }
  }
  abrirPasta() { this.el.shell.openPath(this.dir); }
}

const LEIA_ME = `Rotom Sniper dentro do PokeIdle Multi
====================================

original\\<versão>   cópia intocada da extensão oficial (importada do seu navegador)
ativa\\              original + seus patches: é esta pasta que o app carrega
patches\\            coloque aqui arquivos .json com os seus ajustes

Para mexer na extensão SEM perder o ajuste quando ela atualizar, crie um patch, por exemplo
patches\\meu-ajuste.json:

  [
    { "arquivo": "injected.js", "trocar": "texto exato que existe no arquivo", "por": "texto novo",
      "descricao": "o que isso faz" }
  ]

Cada vez que você importar/atualizar a extensão, o app refaz a pasta "ativa" aplicando os patches.
Se um patch não encaixar mais (a extensão mudou), o app avisa em vermelho.
Depois de mexer nos patches: botão Rotom → Atualizar/reaplicar, e recarregue os jogos.
(Também dá para editar a pasta "ativa" na mão para testar, mas ela é refeita a cada importação.)
`;

module.exports = Rotom;
module.exports.EXT_ID = EXT_ID;
module.exports.idDaChave = idDaChave;
module.exports.acharInstaladas = acharInstaladas;
module.exports.cmpVersao = cmpVersao;
