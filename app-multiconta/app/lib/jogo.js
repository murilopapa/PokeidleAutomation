// Os dados e as fórmulas do próprio jogo, sempre da versão no ar.
//
// Mesma ideia da extensão oficial "/hunt for PokeIdle": nada de tabela copiada. Os módulos
// `shared/` do pokeidle.io (golpes, cooldown, XP/ouro por abate, efetividade, bônus) e os
// catálogos de espécies são baixados do jogo e servidos à interface em pie://app/jogo/<versão>/,
// onde o motor (ui/motor/) os importa. Quando o jogo sobe de versão, baixa de novo.
const fs = require('node:fs');
const path = require('node:path');

// A mesma lista da extensão oficial (game.js).
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
const OPCIONAIS = new Set([CATALOGOS.novos, CATALOGOS.outlandNovos, CATALOGOS.overrides, CATALOGOS.itens]);
const VERIFICAR_MS = 30 * 60 * 1000;

class Jogo {
  constructor({ dir, gameUrl, fetch, aoMudar }) {
    this.dir = dir;
    this.origem = new URL(gameUrl).origin;
    this.gameUrl = gameUrl;
    this.fetch = fetch;
    this.aoMudar = aoMudar || (() => {});
    this.estado = { versao: null, pronto: false, erro: null };
    this.baixando = null;
  }

  iniciar() {
    this.verificar();
    this.timer = setInterval(() => this.verificar(), VERIFICAR_MS);
  }

  /** Versão do cliente no ar (o `?v=` da página do jogo). Sem ela, um carimbo do dia. */
  async versaoNoAr() {
    try {
      const r = await this.fetch(this.gameUrl, { cache: 'no-store' });
      const html = await r.text();
      const m = html.match(/[?&]v=(\d+\.\d+\.\d+)/);
      if (m) return m[1];
    } catch (_) { /* sem rede: usa o que tiver */ }
    return null;
  }

  async verificar() {
    if (this.baixando) return this.baixando;
    this.baixando = (async () => {
      let v = await this.versaoNoAr();
      if (!v) v = this.ultimaBaixada() || 'dev-' + new Date().toISOString().slice(0, 10);
      if (v === this.estado.versao && this.estado.pronto) return this.estado;
      const pasta = path.join(this.dir, v);
      if (!fs.existsSync(path.join(pasta, '.pronto'))) {
        try { await this.baixar(pasta); }
        catch (e) {
          this.estado = { ...this.estado, erro: e.message };
          const velha = this.ultimaBaixada();
          if (velha && !this.estado.pronto) this.estado = { versao: velha, pronto: true, erro: e.message };
          this.aoMudar(this.estado);
          return this.estado;
        }
      }
      this.estado = { versao: v, pronto: true, erro: null };
      this.limpar(v);
      this.aoMudar(this.estado);
      return this.estado;
    })().finally(() => { this.baixando = null; });
    return this.baixando;
  }

  ultimaBaixada() {
    try {
      return fs.readdirSync(this.dir)
        .filter((d) => fs.existsSync(path.join(this.dir, d, '.pronto')))
        .map((d) => ({ d, t: fs.statSync(path.join(this.dir, d, '.pronto')).mtimeMs }))
        .sort((a, b) => b.t - a.t)[0]?.d || null;
    } catch (_) { return null; }
  }

  /** Guarda só as 2 últimas versões. */
  limpar(atual) {
    try {
      const velhas = fs.readdirSync(this.dir).filter((d) => d !== atual)
        .map((d) => ({ d, t: fs.statSync(path.join(this.dir, d)).mtimeMs })).sort((a, b) => b.t - a.t).slice(1);
      for (const { d } of velhas) fs.rmSync(path.join(this.dir, d), { recursive: true, force: true });
    } catch (_) { /* segue */ }
  }

  /** Baixa os módulos (com tudo o que eles importam) e os catálogos para `pasta`. */
  async baixar(pasta) {
    const tmp = pasta + '.baixando';
    fs.rmSync(tmp, { recursive: true, force: true });
    const grava = (rel, txt) => {
      const alvo = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(alvo), { recursive: true });
      fs.writeFileSync(alvo, txt);
    };
    const pega = async (rel, opcional) => {
      const r = await this.fetch(`${this.origem}/${rel}`, { cache: 'no-store' });
      if (!r.ok) { if (opcional) return null; throw new Error(`${rel}: HTTP ${r.status}`); }
      return r.text();
    };
    const vistos = new Set();
    const fila = Object.values(MODULOS);
    while (fila.length) {
      const rel = fila.shift();
      if (vistos.has(rel)) continue;
      vistos.add(rel);
      const txt = await pega(rel, false);
      for (const dep of importsDe(txt)) {
        if (!dep.startsWith('.')) continue;
        const abs = new URL(dep, `${this.origem}/${rel}`);
        if (abs.origin === this.origem) fila.push(abs.pathname.slice(1));
      }
      grava(rel, ajustarImports(txt, rel));
    }
    for (const rel of Object.values(CATALOGOS)) {
      const txt = await pega(rel, OPCIONAIS.has(rel));
      if (txt != null) grava(rel, txt);
    }
    fs.writeFileSync(path.join(tmp, '.pronto'), new Date().toISOString());
    fs.rmSync(pasta, { recursive: true, force: true });
    fs.renameSync(tmp, pasta);
  }

  /** Caminho no disco para pie://app/jogo/<versão>/<rel> (ou null). */
  arquivo(rel) {
    const alvo = path.normalize(path.join(this.dir, rel));
    if (!alvo.startsWith(path.normalize(this.dir + path.sep))) return null;
    return fs.existsSync(alvo) ? alvo : null;
  }
}

// No site, `../shared/x.mjs` dentro de /hunt-analyser.mjs volta para /shared (não dá para subir
// acima da raiz). Aqui a raiz é a pasta da versão, então reescreve cada import relativo para o
// caminho que ele tem de verdade no site, relativo ao arquivo.
function ajustarImports(txt, rel) {
  const dir = path.posix.dirname(rel);
  return txt.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\2/g, (todo, antes, q, dep) => {
    const real = new URL(dep, 'https://x/' + rel).pathname.slice(1);
    let novo = path.posix.relative(dir, real);
    if (!novo.startsWith('.')) novo = './' + novo;
    return antes + q + novo + q;
  });
}

function importsDe(txt) {
  const out = [];
  const re = /(?:^|[;\s])(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|(?:^|[;\s])import\s+['"]([^'"]+)['"]/gm;
  for (const m of txt.matchAll(re)) out.push(m[1] || m[2] || m[3]);
  return out;
}

module.exports = { Jogo, MODULOS, CATALOGOS, importsDe, ajustarImports };
