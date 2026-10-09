// Gera data/guia.json com os dados do guia pokeidle (guiapokeidlehardtocapture.site):
// espécies, hunts e tabela de tipos (data.js) + medidas de campo (geo.js).
// Os dois arquivos são lidos como TEXTO e só os objetos JSON são aproveitados; nada é executado.
// Uso: node tools/build-guia.mjs <pasta com data.js e geo.js>
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const dir = process.argv[2] || '.';
const json = (src, nome) => {
  const i = src.search(new RegExp(`window\\.${nome}\\s*=`));
  if (i < 0) return null;
  const ini = src.slice(i).search(/[[{]/) + i;
  // acha o fim do literal JSON contando chaves/colchetes fora de strings
  let prof = 0, str = false, esc = false, fim = -1;
  for (let k = ini; k < src.length; k++) {
    const c = src[k];
    if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue; }
    if (c === '"') str = true;
    else if (c === '{' || c === '[') prof++;
    else if (c === '}' || c === ']') { prof--; if (!prof) { fim = k + 1; break; } }
  }
  try { return JSON.parse(src.slice(ini, fim)); } catch { return null; }
};
const data = fs.readFileSync(`${dir}/data.js`, 'utf8');
const geo = fs.readFileSync(`${dir}/geo.js`, 'utf8');
const D = json(data, 'PI_DATA');
if (!D) throw new Error('PI_DATA não encontrado');
const out = {
  geradoEm: new Date().toISOString(),
  tipos: D.tipos,
  // só o que as contas usam
  especies: D.especies.map((e) => ({ id: e.id, n: e.n, t: e.t, b: e.b, m: e.m, l: e.l ?? [], pn: e.pn ?? 0, sv: e.sv ?? 0, hl: e.hl ?? 1, tc: e.tc ?? 0 })),
  hunts: D.hunts,
  geo: json(geo, 'PI_GEO') ?? {},
  geoFonte: json(geo, 'PI_GEO_FONTE') ?? {},
  dists: json(geo, 'PI_GEO_DISTS') ?? {},
  onda: json(geo, 'PI_GEO_ONDA') ?? {},
  dividido: json(geo, 'PI_GEO_DIVIDIDO') ?? [],
  medido: json(geo, 'PI_MEDIDO') ?? {},
  xpKill: json(geo, 'PI_XPKILL') ?? {},
};
fs.writeFileSync(fileURLToPath(new URL('../data/guia.json', import.meta.url)), JSON.stringify(out));
for (const [k, v] of Object.entries(out)) if (k !== 'geradoEm') console.log(k, Array.isArray(v) ? v.length : Object.keys(v).length);
console.log('bytes', JSON.stringify(out).length);
