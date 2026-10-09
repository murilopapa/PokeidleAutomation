// Teste só dos modos (Normal/Eco/Ultra eco) e da atualização automática.
import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const APP = path.resolve(import.meta.dirname, '..');
const OUT = path.join(APP, 'test', 'out');
fs.mkdirSync(OUT, { recursive: true });
process.on('unhandledRejection', (e) => { if (!/No dialog is showing/.test(String(e?.message))) { console.error(e); process.exit(1); } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const res = [];
const check = (n, ok, x = '') => { res.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); };

const mock = spawn('node', [path.join(APP, 'test', 'mock.mjs')], { cwd: path.join(APP, 'test'), stdio: ['ignore', 'pipe', 'inherit'] });
let mockOut = '';
mock.stdout.on('data', (d) => { mockOut += d; });
await sleep(800);

const userData = fs.mkdtempSync('/tmp/pie-ud-');
const eapp = await electron.launch({
  executablePath: path.join(APP, 'node_modules', 'electron', 'dist', 'electron'),
  args: [APP, '--no-sandbox', '--user-data-dir=' + userData],
  env: { ...process.env, PIE_GAME_URL: 'http://127.0.0.1:8787/app', PIE_TW_ID_URL: 'http://127.0.0.1:8787/tw', PIE_TW_IRC_URL: 'ws://127.0.0.1:8787/irc', PIE_KICK_URL: 'http://127.0.0.1:8787/kick', PIE_KICK_PLAYER_URL: 'http://127.0.0.1:8787/kick', PIE_KICK_RAPIDO: '1', PIE_UPDATE_API: 'http://127.0.0.1:8787/gh', PIE_UPDATE_REPO: 'murilo/pokeidle-multi', ELECTRON_ENABLE_LOGGING: '1' },
});
eapp.process().stderr.on('data', (d) => { const s = String(d); if (/error|Uncaught|PIE/i.test(s)) process.stderr.write('[electron] ' + s); });

let ui = null;
for (let k = 0; k < 40 && !ui; k++) { ui = eapp.windows().find((w) => w.url().startsWith('pie://app/ui/index')); if (!ui) await sleep(250); }
check('janela da interface abriu', !!ui);
ui.on('console', (m) => { if (m.type() === 'error') console.log('[ui]', m.text()); });
await ui.setViewportSize?.({ width: 1600, height: 900 }).catch(() => {});
await sleep(6000);

const views = await eapp.evaluate(({ webContents }) => webContents.getAllWebContents().map((w) => ({ url: w.getURL(), id: w.id })));
check('4 jogos carregados', views.filter((v) => v.url.includes('8787/app')).length === 4, JSON.stringify(views.map((v) => v.url)));

const shot = async (nome) => { await sleep(300); spawn('import', ['-window', 'root', path.join(OUT, nome)]); await sleep(700); };
await eapp.evaluate(async ({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1600, 960); w.show(); });
await sleep(800);
const viewsVis = () => eapp.evaluate(({ webContents, BaseWindow }) => BaseWindow.getAllWindows()[0].contentView.children.filter((v) => v.webContents?.getURL().includes('8787/app')).map((v) => v.getVisible()));
// ---- modos (valem para todas as contas)
const jogosJs = (js) => eapp.evaluate(({ webContents }, js) => Promise.all(webContents.getAllWebContents().filter((w) => w.getURL().includes('8787/app')).map((w) => w.executeJavaScript(js))), js);
const ecoAntes = await jogosJs("document.documentElement.classList.contains('modo-economia')");
check('sem escolher modo o app não mexe na economia', ecoAntes.every((x) => x === false), JSON.stringify(ecoAntes));
await ui.click('[data-modo="eco"]'); await sleep(1500);
const ecoOn = await jogosJs("document.documentElement.classList.contains('modo-economia')");
check('Eco liga o Modo Economia nas 4 contas', ecoOn.length === 4 && ecoOn.every(Boolean), JSON.stringify(ecoOn));
check('botão Eco marcado', await ui.$eval('#modos [data-modo="eco"]', (e) => e.classList.contains('on')));
await ui.click('[data-modo="ultra"]'); await sleep(1500);
const visU = await viewsVis();
check('Ultra eco: jogos não são desenhados (views escondidas)', visU.length === 4 && visU.every((v) => v === false), JSON.stringify(visU));
const ecoU = await jogosJs("document.documentElement.classList.contains('modo-economia')");
check('Ultra eco mantém o Modo Economia', ecoU.every(Boolean));
const linhasU = await ui.$$eval('#ultra .u-l:not(.u-cab)', (e) => e.map((x) => x.textContent));
check('tela preta: conta, pokémon e lugar', linhasU.length === 4 && linhasU.some((t) => /murilo/.test(t) && /Yanma/.test(t) && /Kadabra/.test(t) && /Kanto/.test(t)), linhasU.join(' | '));
check('sem Ligar tudo / Desligar tudo', !(await ui.$('#ligaTudo')) && !(await ui.$('#desligaTudo')));
// conta desligada some da tela preta
const desligar = (on) => ui.evaluate(async (on) => { const l = await app.power(3, on); S[3].desligada = !l; renderTudo(); }, on);
await desligar(false); await sleep(800);
const linhasOff = await ui.$$eval('#ultra .u-l:not(.u-cab)', (e) => e.length);
await ui.screenshot({ path: path.join(OUT, 'ultra2.png') });
check('conta desligada não aparece no Ultra eco', linhasOff === 3, String(linhasOff));
await desligar(true); await sleep(2500);
const timerVivo = await jogosJs('new Promise((r) => { let n = 0; const t = setInterval(() => { if (++n === 5) { clearInterval(t); r(n); } }, 100); })');
check('Ultra eco: timers do jogo continuam rodando escondidos', timerVivo.every((n) => n === 5));
await ui.screenshot({ path: path.join(OUT, 'ultra.png') });
// recarregar uma conta em Ultra continua escondida e em economia
await eapp.evaluate(({ webContents }) => webContents.getAllWebContents().find((w) => w.getURL().includes('8787/app')).reload());
await sleep(2500);
const visR = await viewsVis();
const ecoR = await jogosJs("document.documentElement.classList.contains('modo-economia')");
check('conta recarregada em Ultra continua escondida e em economia', visR.every((v) => v === false) && ecoR.every(Boolean), JSON.stringify([visR, ecoR]));
await ui.click('#ultra [data-modo="normal"]'); await sleep(1500);
const ecoN = await jogosJs("document.documentElement.classList.contains('modo-economia')");
const visN = await viewsVis();
check('Normal desliga o Modo Economia em todas', ecoN.every((x) => x === false), JSON.stringify(ecoN));
check('Normal mostra os jogos de novo', visN.length === 4 && visN.every((v) => v === true), JSON.stringify(visN));
await sleep(300);
const appJson = JSON.parse(fs.readFileSync(path.join(userData, 'app.json'), 'utf8'));
check('modo fica salvo', appJson.modo === 'normal', JSON.stringify(appJson));

// ---- atualização (GitHub falso)
const attTxt0 = await ui.$eval('#att', (e) => e.textContent);
check('versão aparece na barra', /^v\d/.test(attTxt0), attTxt0);
await ui.click('#att'); await sleep(2500);
const attTxt = await ui.$eval('#att', (e) => e.textContent);
check('acha versão nova, baixa e confere', /Atualizar para 9\.9\.9/.test(attTxt), attTxt);
await ui.screenshot({ path: path.join(OUT, 'att.png') });
await eapp.close();
mock.kill();
console.log(`\n${res.filter(Boolean).length}/${res.length} ok`);
process.exit(res.every(Boolean) ? 0 : 1);
