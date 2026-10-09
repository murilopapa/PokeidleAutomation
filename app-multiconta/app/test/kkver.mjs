// Reproduz abrir/fechar a live grande da Kick várias vezes e tira fotos de cada passo.
import { _electron as electron } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const APP = path.resolve(import.meta.dirname, '..');
const OUT = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mock = spawn('node', [path.join(APP, 'test', 'mock.mjs')], { cwd: path.join(APP, 'test'), stdio: 'ignore' });
await sleep(800);
const ud = fs.mkdtempSync('/tmp/pie-kv-');
const eapp = await electron.launch({ executablePath: path.join(APP, 'node_modules/electron/dist/electron'), args: [APP, '--no-sandbox', '--user-data-dir=' + ud],
  env: { ...process.env, PIE_GAME_URL: 'http://127.0.0.1:8787/app', PIE_KICK_URL: 'http://127.0.0.1:8787/kick', PIE_KICK_PLAYER_URL: 'http://127.0.0.1:8787/kick', PIE_KICK_RAPIDO: '1', PIE_TW_ID_URL: 'http://127.0.0.1:8787/tw', PIE_TW_IRC_URL: 'ws://127.0.0.1:8787/irc' } });
let ui; for (let k = 0; k < 40 && !ui; k++) { ui = eapp.windows().find((w) => w.url().startsWith('pie://app/ui/index')); if (!ui) await sleep(250); }
await eapp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1600, 960));
await sleep(5000);
const iK = await ui.$$eval('.slot', (e) => +e.find((x) => /murilo/.test(x.querySelector('.nome')?.textContent || '')).dataset.slot);
await eapp.evaluate(async ({ session }, i) => { await session.fromPartition(`persist:conta-${i + 1}`).cookies.set({ url: 'http://127.0.0.1:8787', name: 'session_token', value: 'tok-kick' }); }, iK);
await ui.evaluate((i) => app.kick.set(i, 'ligado', true), iK);
await sleep(6000);
let n = 0;
const views = () => eapp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.map((v) => ({ u: v.webContents.getURL().replace('http://127.0.0.1:8787', '').replace('pie://app/ui/', ''), b: v.getBounds(), vis: v.getVisible() })));
const passo = async (nome) => { await sleep(900); const f = path.join(OUT, String(++n).padStart(2, '0') + '-' + nome + '.png'); spawn('import', ['-window', 'root', f]); await sleep(700); console.log('== ' + nome); for (const v of await views()) if (v.vis) console.log('  ', JSON.stringify(v)); };
await passo('inicio');
await ui.click(`[data-kkver="${iK}|faasii"]`); await passo('abre-faasii');
await ui.click(`[data-kkver="${iK}|outrolive"]`); await passo('troca-outrolive');
await ui.click('[data-kkfechar]'); await passo('minimiza');
await ui.click(`[data-kkver="${iK}|faasii"]`); await sleep(100); await ui.keyboard.press('Escape'); await passo('abre-e-esc-rapido');
await ui.click(`[data-kkver="${iK}|faasii"]`); await passo('abre-de-novo');
await ui.click(`[data-kkvis="${iK}"]`); await passo('players-visiveis-com-aberta');
await ui.click('[data-kkfechar]'); await passo('minimiza-com-visiveis');
await ui.click(`[data-kkvis="${iK}"]`);
await ui.click(`.slot[data-slot="2"] [data-max="2"]`); await passo('expande-conta');
await ui.click(`[data-kkver="${iK}|faasii"]`); await passo('abre-live-com-conta-expandida');
await ui.click('[data-kkfechar]'); await passo('fecha-live');
await ui.keyboard.press('Escape'); await passo('fim');
await eapp.close(); mock.kill();
