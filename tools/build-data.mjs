// Gera data/especies.json a partir dos arquivos públicos do pokeidle.io.
// Só LÊ dados (JSON e as tabelas de golpes escritas como texto); nenhum código do jogo é executado.
// Reproduz o catálogo de espécies como o cliente do jogo monta (carregarCatalogoEspecies):
//   1. creatures.json + creatures-novos.json + creatures-outland-novos.json (ids legados de Outland remapeados)
//   2. remendos de looktype (creatures-sprites-lab.json)
//   3. overrides de auditoria (bases e golpes)
//   4. planilhas de golpes (shared/golpes-planilhas.mjs, lidas como texto), somadas aos golpes da espécie
//   5. variantes Outland herdam bases e golpes da espécie base (shared/outland-sprite-dex.mjs, lida como texto)
//   6. golpes de 600 nas últimas evoluções (regra de shared/golpes-especiais.mjs)
//
// Uso: node tools/build-data.mjs <pasta com os .json> <pasta com os .mjs de /shared>
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const A = process.argv[2] || './game/assets';
const SH = process.argv[3] || './game/shared';
const DATA = fileURLToPath(new URL('../data/', import.meta.url));
const j = (p) => JSON.parse(fs.readFileSync(`${A}/${p}`, 'utf8'));
const txt = (p) => fs.readFileSync(`${SH}/${p}`, 'utf8');

// ---------- regras do jogo, reescritas ----------
const OUT_MIN = 2001, OUT_MAX = 2059, LEG_MIN = 10501, LEG_MAX = 10548;
const isOutland = (id) => id >= OUT_MIN && id < OUT_MAX;
const remap = (id) => (id >= LEG_MIN && id < LEG_MAX ? id - (LEG_MIN - OUT_MIN) : id);
const isFantasma = (id) => id >= 10000 && id < LEG_MIN;
const ELEMENTOS = ['NORMAL', 'FIRE', 'WATER', 'GRASS', 'ELECTRIC', 'ICE', 'FIGHTING', 'POISON', 'GROUND', 'FLYING', 'PSYCHIC', 'BUG', 'ROCK', 'GHOST', 'DRAGON', 'DARK', 'STEEL', 'FAIRY'];
function cooldownDoPoder(power) { // curva de cooldown-golpes.mjs
  const p = Number.isFinite(Number(power)) && Number(power) > 15 ? Number(power) : 15;
  const seg = p <= 100 ? 10 + ((p - 15) * 20) / 85 : 30 + ((p - 100) * 30) / 500;
  return Math.round(seg * 10) * 100;
}

// ---------- 1. catálogo ----------
const lista = [...(j('creatures.json').creatures ?? []), ...(j('creatures-novos.json').creatures ?? []), ...(j('creatures-outland-novos.json').creatures ?? [])];
for (const c of lista) { c.pokeId = remap(c.pokeId); if (c.evolvesToId) c.evolvesToId = remap(c.evolvesToId); }
const achar = (id) => lista.find((c) => c.pokeId === id);
const todos = (id) => lista.filter((c) => c.pokeId === id);

// ---------- 2. looktypes ----------
try { for (const p of j('creatures-sprites-lab.json').patches ?? []) { const c = achar(p.pokeId); if (c && p.looktype) c.looktype = p.looktype; } } catch {}

// ---------- 3. overrides ----------
for (const o of j('creatures-audit-overrides.json').overrides ?? []) {
  const c = achar(o.pokeId);
  if (!c) continue;
  for (const k of ['baseHp', 'baseAtk', 'baseDef', 'baseSpAtk', 'baseSpDef', 'baseSpeed']) if (typeof o[k] === 'number') c[k] = o[k];
  if (Array.isArray(o.attacks)) c.attacks = o.attacks.map((a) => ({ ...a }));
}

// ---------- 4. planilhas de golpes (texto) ----------
const plan = txt('golpes-planilhas.mjs');
const ordem = (plan.match(/const TABELAS = \[([\s\S]*?)\];/)?.[1] ?? '').match(/GOLPES_[A-Z0-9_]+/g) ?? [];
let aplicadas = 0;
for (const nome of ordem) {
  const ini = plan.indexOf(`export const ${nome} = {`);
  if (ini < 0) continue;
  const fim = plan.indexOf('\n};', ini);
  const bloco = plan.slice(ini, fim);
  for (const m of bloco.matchAll(/\n\s*(\d+):\s*\[([\s\S]*?)\n\s*\],/g)) {
    const linhas = [...m[2].matchAll(/\[\s*'([^']+)',\s*'([A-Z]+)',\s*'([A-Z]+)',\s*(\d+)\s*(,\s*MEGA)?\s*\]/g)];
    if (!linhas.length) continue;
    for (const esp of todos(Number(m[1]))) {
      const daPlanilha = linhas.map((l) => ({ name: l[1], type: l[2], category: l[3], power: Number(l[4]), cooldownMs: l[5] ? 30000 : cooldownDoPoder(Number(l[4])), learnLevel: 1, categoriaFixa: Number(l[4]) >= 600 || !!l[5], cdFixo: !!l[5] }));
      // A planilha SOMA aos golpes que a espécie já tinha (mesmo nome = vale a da planilha).
      // Conferido em jogo: com só a planilha o Charizard 220 daria ~565 abates/h na Furious Scizor;
      // medido 648, e com a soma dá 669.
      const nomes = new Set(daPlanilha.map((a) => a.name));
      esp.attacks = [...(esp.attacks ?? []).filter((a) => !nomes.has(a.name)), ...daPlanilha];
      aplicadas++;
    }
  }
}

// ---------- 5. variantes Outland herdam da base ----------
const od = txt('outland-sprite-dex.mjs');
const prefixos = [...(od.match(/PREFIXOS_OUTLAND = \[([\s\S]*?)\];/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
const dexPorNome = new Map([...(od.match(/DEX_POR_NOME = new Map\(\[([\s\S]*?)\]\);/)?.[1] ?? '').matchAll(/\['([^']+)',\s*(\d+)\]/g)].map((m) => [m[1], Number(m[2])]));
for (const esp of lista) {
  if (!isOutland(esp.pokeId)) continue;
  let base = String(esp.name ?? '').trim();
  for (const p of prefixos) if (base.startsWith(p)) { base = base.slice(p.length); break; }
  const b = achar(dexPorNome.get(base.toLowerCase()));
  if (!b) continue;
  for (const k of ['baseHp', 'baseAtk', 'baseDef', 'baseSpAtk', 'baseSpDef', 'baseSpeed']) if (typeof b[k] === 'number') esp[k] = b[k];
  if (Array.isArray(b.attacks)) esp.attacks = b.attacks.map((a) => ({ ...a }));
  esp._baseDex = b.pokeId;
}

// ---------- monta o mapa final (o último com o mesmo id vence, como no Map do jogo) ----------
const porId = new Map();
for (const c of lista) { if (isFantasma(c.pokeId)) continue; if (isOutland(c.pokeId)) { c.evolvesToId = 0; c.evolveLevel = 0; } porId.set(c.pokeId, c); }

// ---------- 6. golpes de 600 ----------
const G600 = Object.fromEntries(ELEMENTOS.map((t) => [t, { name: `Golpe 600 ${t}`, type: t, power: 600, cooldownMs: 60000 }]));
for (const c of porId.values()) {
  let atks = (c.attacks ?? []).filter((a) => a && ELEMENTOS.includes(a.type) && (a.power ?? 0) > 10);
  for (const a of atks) if ((a.power ?? 0) >= 600 && !a.cdFixo) a.cooldownMs = 60000;
  if (!c.evolvesToId) { // última evolução
    const cat = (c.baseAtk ?? 0) >= (c.baseSpAtk ?? 0) ? 'PHYSICAL' : 'SPECIAL';
    for (const a of atks) if (a.power >= 600 && !a.categoriaFixa) { a.category = cat; a.cooldownMs = 60000; }
    const tipos = [...new Set([c.type1, c.type2].filter((t) => t && ELEMENTOS.includes(t)))];
    for (const t of tipos) if (!atks.some((a) => a.power >= 600 && a.type === t)) atks.push({ ...G600[t], category: cat, learnLevel: 1 });
    const g = atks.filter((a) => a.power >= 600 && ELEMENTOS.includes(a.type));
    if (g.length === 1) atks.push({ ...g[0], name: g[0].name + ' B', category: cat, learnLevel: 1 });
  }
  c._atks = atks;
}

// ---------- retrato: espécie base com número nacional ----------
const porNome = new Map([...porId.values()].filter((c) => c.pokeId <= 1025).map((c) => [String(c.name).toLowerCase(), c.pokeId]));
function baseDe(c) {
  if (c.pokeId <= 1025) return c.pokeId;
  if (c._baseDex) return c._baseDex;
  const partes = String(c.name).toLowerCase().split(/[\s-]+/);
  for (let i = 0; i < partes.length; i++) { const id = porNome.get(partes.slice(i).join(' ')); if (id) return id; }
  for (let k = partes.length - 1; k > 0; k--) { const id = porNome.get(partes.slice(0, k).join(' ')); if (id) return id; }
  return 0;
}

const out = {
  geradoEm: new Date().toISOString(),
  fonte: 'pokeidle.io (/assets/creatures*.json + tabelas de /shared)',
  // [id, nome, [tipos], [hp,atk,def,spAtk,spDef,speed], [[golpe, tipo, especial?1:0, power, cdMs, nivel]], evolveId, evolveLevel, looktype, idDoRetrato]
  especies: [...porId.values()].map((c) => [
    c.pokeId, c.name, [c.type1, c.type2].filter(Boolean),
    [c.baseHp, c.baseAtk, c.baseDef, c.baseSpAtk, c.baseSpDef, c.baseSpeed],
    c._atks.map((a) => [a.name, a.type, a.category === 'SPECIAL' ? 1 : 0, a.power, a.cooldownMs ?? 0, a.learnLevel ?? 1]),
    c.evolvesToId || 0, c.evolveLevel || 0, c.looktype || 0, baseDe(c),
  ]),
};
fs.mkdirSync(DATA, { recursive: true });
fs.writeFileSync(DATA + 'especies.json', JSON.stringify(out));
console.log('espécies', out.especies.length, '· planilhas aplicadas', aplicadas, '· bytes', JSON.stringify(out).length);
for (const n of ['Charizard', 'Furious Scizor', 'Yanma']) console.log(JSON.stringify(out.especies.find((e) => e[1] === n)).slice(0, 400));
