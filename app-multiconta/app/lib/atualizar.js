// Atualização automática pelo GitHub Releases.
//
// Como funciona:
//  1) pergunta ao GitHub qual é a última versão publicada em <repo> (releases/latest);
//  2) se a tag (ex.: v0.6.0) for maior que a versão do app, baixa o instalador (.exe) anexado
//     na versão para a pasta temporária, conferindo tamanho e o sha256 que o GitHub informa;
//  3) quando você clica em "Atualizar", roda o instalador em modo silencioso (/S) e fecha o app.
//     O instalador fecha o que sobrar, troca os arquivos e abre o app de novo.
// Logins e configurações ficam em %APPDATA%\PokeIdle Multi e não são tocados.
const { app, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const UA = { 'User-Agent': 'PokeIdle-Multi' };
const API = process.env.PIE_UPDATE_API || 'https://api.github.com';   // (o teste aponta para um GitHub falso)

// "0.10.2" > "0.9.9"
function comparar(a, b) {
  const pa = String(a).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

function sha256(arq) {
  return new Promise((res, rej) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(arq).on('data', (c) => h.update(c)).on('end', () => res(h.digest('hex'))).on('error', rej);
  });
}

class Atualizador {
  constructor({ repo, aoMudar }) {
    this.repo = String(repo || '').trim();
    this.aoMudar = aoMudar || (() => {});
    this.dir = path.join(app.getPath('temp'), 'PokeIdleMulti-atualizacao');
    this.st = { atual: app.getVersion(), fase: this.repo ? 'parado' : 'sem-repo', nova: null, progresso: 0, erro: null };
  }

  estado() { const { arquivo, ...resto } = this.st; return resto; }
  mudar(p) { Object.assign(this.st, p); this.aoMudar(this.estado()); }

  async verificar() {
    if (!this.repo) { this.mudar({ fase: 'sem-repo' }); return this.estado(); }
    if (['verificando', 'baixando', 'pronto', 'instalando'].includes(this.st.fase)) return this.estado();
    this.mudar({ fase: 'verificando', erro: null });
    try {
      const r = await net.fetch(`${API}/repos/${this.repo}/releases/latest`, { headers: { ...UA, Accept: 'application/vnd.github+json' } });
      if (r.status === 404) throw new Error('nenhuma versão publicada ainda');
      if (!r.ok) throw new Error('GitHub respondeu ' + r.status);
      const rel = await r.json();
      const versao = String(rel.tag_name || '').replace(/^v/i, '');
      const asset = (rel.assets || []).find((a) => /\.exe$/i.test(a.name));
      if (!versao || !asset || comparar(versao, this.st.atual) <= 0) {
        this.mudar({ fase: 'em-dia', nova: null, verificadoEm: Date.now() });
        return this.estado();
      }
      this.mudar({ nova: versao, notas: String(rel.body || '').slice(0, 1500) });
      await this.baixar(asset, versao);
    } catch (e) {
      this.mudar({ fase: 'erro', erro: e.message || String(e) });
    }
    return this.estado();
  }

  async baixar(asset, versao) {
    fs.mkdirSync(this.dir, { recursive: true });
    const arq = path.join(this.dir, `PokeIdle-Multi-Instalador-${versao}.exe`);
    const esperado = /^sha256:/i.test(asset.digest || '') ? asset.digest.slice(7).toLowerCase() : null;
    // já baixado antes (ex.: app reaberto antes de instalar)?
    if (fs.existsSync(arq) && fs.statSync(arq).size === asset.size && (!esperado || (await sha256(arq)) === esperado)) {
      this.mudar({ fase: 'pronto', arquivo: arq, progresso: 1 });
      return;
    }
    // apaga instaladores velhos
    for (const f of fs.readdirSync(this.dir)) { try { fs.unlinkSync(path.join(this.dir, f)); } catch (_) { /* em uso */ } }

    this.mudar({ fase: 'baixando', progresso: 0 });
    const r = await net.fetch(asset.browser_download_url, { headers: UA });
    if (!r.ok || !r.body) throw new Error('download falhou (' + r.status + ')');
    const parte = arq + '.parte';
    const out = fs.createWriteStream(parte);
    const h = crypto.createHash('sha256');
    const leitor = r.body.getReader();
    let n = 0, aviso = 0;
    try {
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        h.update(value);
        n += value.length;
        if (!out.write(value)) await new Promise((res) => out.once('drain', res));
        if (Date.now() - aviso > 400) { aviso = Date.now(); this.mudar({ progresso: asset.size ? n / asset.size : 0 }); }
      }
    } finally {
      await new Promise((res) => out.end(res));
    }
    if (asset.size && n !== asset.size) { fs.rmSync(parte, { force: true }); throw new Error('download incompleto, tento de novo mais tarde'); }
    if (esperado && h.digest('hex') !== esperado) { fs.rmSync(parte, { force: true }); throw new Error('o arquivo baixado não confere (sha256)'); }
    fs.renameSync(parte, arq);
    this.mudar({ fase: 'pronto', arquivo: arq, progresso: 1 });
  }

  instalar() {
    if (this.st.fase !== 'pronto' || !this.st.arquivo || !fs.existsSync(this.st.arquivo)) return false;
    this.mudar({ fase: 'instalando' });
    // /S = instalador do NSIS sem telas; ele mesmo fecha o app e abre de novo no fim
    spawn(this.st.arquivo, ['/S'], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 400);
    return true;
  }
}

module.exports = Atualizador;
module.exports.comparar = comparar;
