// Copia a lógica da extensão para o app e monta o preload do jogo.
// Rode de novo sempre que mudar a extensão:  npm run sync
// A extensão fica dois níveis acima (pokeextension/app-multiconta/app → pokeextension).
// Para apontar para outro lugar: EXT_DIR=/caminho node tools/sync.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.resolve(process.env.EXT_DIR || path.join(APP, '..', '..'));
const ler = (p) => fs.readFileSync(path.join(EXT, p), 'utf8');
if (!fs.existsSync(path.join(EXT, 'manifest.json'))) { console.error('Extensão não encontrada em ' + EXT); process.exit(1); }
const versao = JSON.parse(ler('manifest.json')).version;

// 1) arquivos usados pela interface do app (cálculo do Onde caçar)
fs.mkdirSync(path.join(APP, 'vendor', 'data'), { recursive: true });
for (const f of ['content/defaults.js', 'content/fmt.js', 'sidepanel/hunts.js']) fs.copyFileSync(path.join(EXT, f), path.join(APP, 'vendor', path.basename(f)));
for (const f of ['data/guia.json', 'data/especies.json']) fs.copyFileSync(path.join(EXT, f), path.join(APP, 'vendor', f));

// 2) preload do jogo: o mesmo código dos content scripts, num arquivo só
const principal = ler('page/proto.js') + '\n;\n' + ler('page/inject.js');
const isolado = ['content/defaults.js', 'content/fmt.js', 'content/bridge.js', 'sidepanel/hunts.js', 'content/autohunt.js']
  .map((f) => `// ===== ${f} (extensão ${versao}) =====\n${ler(f)}`).join('\n;\n');
const cabeca = fs.readFileSync(path.join(APP, 'tools', 'preload-jogo.head.js'), 'utf8');
const saida = `// GERADO por tools/sync.mjs a partir da extensão ${versao}. Não edite à mão.\n`
  + cabeca.replace('/*__MAIN_WORLD__*/', () => JSON.stringify(principal)) + '\n' + isolado + '\n';
fs.writeFileSync(path.join(APP, 'preload-jogo.js'), saida);
fs.writeFileSync(path.join(APP, 'vendor', 'versao.json'), JSON.stringify({ extensao: versao, em: new Date().toISOString() }));
console.log(`ok: extensão ${versao} → preload-jogo.js (${Math.round(saida.length / 1024)} KB) e vendor/`);
