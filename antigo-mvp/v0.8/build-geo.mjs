// Gera data/geo.json com as medidas de campo do guia (distâncias dos spawns, ondas, XP por abate, abates/h medidos).
// Lê o arquivo de dados do guia como TEXTO: só as linhas `window.PI_X = {json}` são aproveitadas, nada é executado.
// Uso: node tools/build-geo.mjs <geo.js do guia>
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const src = fs.readFileSync(process.argv[2] || './guia_geo.js', 'utf8');
const pega = (nome) => {
  const m = src.match(new RegExp(`window\\.${nome}\\s*=\\s*([\\[{].*?)\\s*;?\\s*$`, 'm'));
  if (!m) return null;
  try { return JSON.parse(m[1].replace(/;\s*$/, '')); } catch { return null; }
};
const medido = pega('PI_MEDIDO') ?? {};
const out = {
  geradoEm: new Date().toISOString(),
  geo: pega('PI_GEO') ?? {},            // distância média até o vizinho (tiles)
  dists: pega('PI_GEO_DISTS') ?? {},    // distância de cada ponto de spawn
  onda: pega('PI_GEO_ONDA') ?? {},      // [período típico, pior caso] em s
  dividido: pega('PI_GEO_DIVIDIDO') ?? [],
  xpKill: pega('PI_XPKILL') ?? {},      // XP base por abate medido
  kph: Object.fromEntries(Object.entries(medido).filter(([, v]) => v?.kph).map(([k, v]) => [k, v.kph])),
};
const dir = fileURLToPath(new URL('../data/', import.meta.url));
fs.writeFileSync(dir + 'geo.json', JSON.stringify(out));
for (const k of Object.keys(out)) if (k !== 'geradoEm') console.log(k, Array.isArray(out[k]) ? out[k].length : Object.keys(out[k]).length);
console.log('bytes', JSON.stringify(out).length);
