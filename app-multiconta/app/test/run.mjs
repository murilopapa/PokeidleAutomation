// Teste ponta a ponta do app (Electron + jogo falso + Twitch falsa).
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

const nomes = await ui.$$eval('.slot .nome', (e) => e.map((x) => x.textContent));
check('cada quadrado mostra a sua conta', ['murilo', 'segunda', 'terceira', 'quarta'].every((n) => nomes.some((x) => x.includes(n))), nomes.join(' | '));
const info = await ui.$$eval('.slot .hunt-i', (e) => e.map((x) => x.textContent));
check('hunt e XP/h no cabeçalho', info.filter((t) => /Kadabra/.test(t)).length === 3 && info.some((t) => /fora de hunt/.test(t)) && info.filter((t) => /XP\/h/.test(t)).length >= 2, info.join(' | '));

// sessões separadas: cookies de uma conta não aparecem na outra
const sep = await eapp.evaluate(async ({ session }) => {
  await session.fromPartition('persist:conta-1').cookies.set({ url: 'http://127.0.0.1:8787', name: 'x', value: '1' });
  const b = await session.fromPartition('persist:conta-2').cookies.get({ url: 'http://127.0.0.1:8787' });
  return b.length;
});
check('sessões isoladas por conta', sep === 0);

await eapp.evaluate(async ({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1600, 960); });
await sleep(500);
const shot = async (nome) => { await sleep(300); spawn('import', ['-window', 'root', path.join(OUT, nome)]); await sleep(700); };

// Painel da bola: liga a regra (Ultra Ball, abaixo de 100, lote 100) e a chave da conta 1
// helpers: o overlay é outra view (transparente, por cima do quadrado)
const ovJs = (js) => eapp.evaluate(({ webContents }, js) => webContents.getAllWebContents().find((w) => w.getURL().endsWith('/ui/overlay.html')).executeJavaScript(js), js);
const ovTexto = () => ovJs('document.getElementById("ov").textContent');
const ovMudar = (sel, valor) => ovJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(valor)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
const ovClicar = (sel) => ovJs(`document.querySelector(${JSON.stringify(sel)}).click()`);
const jogosVisiveis = () => eapp.evaluate(async ({ webContents }) => Promise.all(webContents.getAllWebContents().filter((w) => w.getURL().includes('8787/app')).map((w) => w.executeJavaScript('document.visibilityState'))));

await ui.click('.slot[data-slot="0"] [data-am="0|bola"]');
await sleep(700);
check('painel da bola abre por cima (overlay)', /Compra de Pokébola/.test(await ovTexto()));
check('jogo continua visível com o painel aberto', (await jogosVisiveis()).every((v) => v === 'visible'), JSON.stringify(await jogosVisiveis()));
await ovMudar('[data-rref="0|bola"]', '3'); await sleep(200);
await ovMudar('[data-rmin="0|bola"]', '100'); await sleep(200);
await ovClicar('[data-ron="0|bola"]'); await sleep(300);
await shot('painel-bola.png');
await ovClicar('[data-fechar]'); await sleep(200);
await ui.click('.slot[data-slot="0"] .bar label.sw');
await sleep(300);
const bar = await ui.textContent('.slot[data-slot="0"] .bar');
check('barra mostra Bola Ultra < 100', /Bola\s*Ultra\s*<\s*100/.test(bar), bar.replace(/\s+/g, ' '));
await sleep(32000);
const compras = mockOut.split('\n').filter((l) => l.includes('shop.buy'));
check('comprou 100 Ultra Ball só na conta do quadrado 1', compras.length === 1 && /"kind":"ball","id":3,"qty":100/.test(compras[0]), compras.join(' / '));

// Mapa: top 3 e personagem
await ui.click('.slot[data-slot="1"] [data-am="1|mapa"]');
await sleep(1500);
const mapa = await ovTexto();
check('mapa mostra personagem e top 3', /Meu personagem/.test(mapa) && /Yanma/.test(mapa) && (await ovJs('document.querySelectorAll(".t3").length')) === 3, mapa.replace(/\s+/g, ' ').slice(0, 160));
await shot('painel-mapa.png');
await ui.keyboard.press('Escape');
await sleep(300);

// Twitch: Client ID, vincular (Device Code falso), IRC entra nas lives oficiais com bônus
await ui.click('.slot[data-slot="0"] [data-gear="0"]');
await sleep(600);
await ovClicar('[data-link="0"]');
await sleep(5000);
const tw = await ui.evaluate(() => TW);
check('Twitch vinculada (murilo_tv) e chat conectado', tw.contas[0].login === 'murilo_tv' && tw.contas[0].conectado, JSON.stringify(tw.contas[0]));
check('entrou só nas lives oficiais com bônus', JSON.stringify([...tw.contas[0].dentro].sort()) === '["faasii","parceiro1"]', JSON.stringify(tw.contas[0].dentro));
check('IRC respondeu PING', /IRC < PONG :tmi.twitch.tv/.test(mockOut));
await ui.keyboard.press('Escape');
await sleep(300);
await ui.hover('.slot[data-slot="0"] [data-twbtn="0"]');
await sleep(900);
const pop = await ovTexto();
check('overlay da Twitch lista as lives', /faasii/.test(pop) && /no chat/.test(pop), pop.replace(/\s+/g, ' ').slice(0, 160));
await shot('twitch.png');
await ui.mouse.move(800, 30);
await sleep(900);
check('overlay da Twitch fecha ao tirar o mouse', (await ovTexto()) === '');
await ui.click('.slot[data-slot="3"] [data-gear="3"]'); await sleep(600); await shot('menu.png'); await ui.keyboard.press('Escape');
await sleep(600);

// expandir: as outras contas viram miniaturas ao vivo (não pausam)
await ui.click('.slot[data-slot="2"] [data-max="2"]');
await sleep(1200);
const vis = await ui.$$eval('.slot', (e) => e.filter((x) => getComputedStyle(x).display !== 'none').length);
check('expandir mostra uma conta só', vis === 1);
check('as outras contas continuam rodando (miniaturas)', (await jogosVisiveis()).every((v) => v === 'visible'), JSON.stringify(await jogosVisiveis()));
await shot('expandido.png');
await ui.keyboard.press('Escape');
await sleep(500);

// troca de mapa automática na conta com alerta
const alertas = await ui.$$eval('.slot.alert', (e) => e.filter((x) => !/quarta/.test(x.textContent)).map((x) => +x.dataset.slot));
const iAl = alertas.find((x) => x !== 0) ?? alertas[0];
console.log('alerta em', alertas, iAl);
if (!(await ui.isChecked(`[data-master="${iAl}"]`))) await ui.click(`.slot[data-slot="${iAl}"] .bar label.sw`);
await ui.click(`.slot[data-slot="${iAl}"] [data-am="${iAl}|mapa"]`);
await sleep(600);
await ovClicar(`[data-mapa="${iAl}"]`);
await sleep(300);
await ui.keyboard.press('Escape');
await sleep(12000);
const trocas = mockOut.split('\n').filter((l) => l.includes('hunt.select'));
check('troca de mapa automática foi para o 1º lugar (só nessa conta)', trocas.length === 1, trocas.join(' / '));
const head = await ui.textContent(`.slot[data-slot="${iAl}"] .hunt-i`);
check('cabeçalho mostra a hunt nova', !/Kadabra/.test(head), head);
const ram = await ui.getAttribute('.chip', 'title');
check('RAM com divisão por conta', /Placa de vídeo/.test(ram || ''), (ram || '').replace(/\n/g, ' | '));
await shot('depois-troca.png');

// conta nova (sem hunt, na cidade): a troca automática escolhe a 1ª hunt
const iNova = await ui.$$eval('.slot', (e) => +e.find((x) => /quarta/.test(x.textContent)).dataset.slot);
if (!(await ui.isChecked(`[data-master="${iNova}"]`))) await ui.click(`.slot[data-slot="${iNova}"] .bar label.sw`);
await ui.click(`.slot[data-slot="${iNova}"] [data-am="${iNova}|mapa"]`);
await sleep(600);
await ovClicar(`[data-mapa="${iNova}"]`);
await sleep(300);
await ui.keyboard.press('Escape');
await sleep(12000);
const trocas2 = mockOut.split('\n').filter((l) => l.includes('hunt.select'));
check('conta nova sem hunt foi para um mapa sozinha', trocas2.length === 2, trocas2.join(' / '));

// botão power: desliga (2 cliques) e fecha o jogo; liga de novo
const iOff = await ui.$$eval('.slot', (e) => +e.find((x) => /terceira/.test(x.textContent)).dataset.slot);
const nJogos = () => eapp.evaluate(({ webContents }) => webContents.getAllWebContents().filter((w) => w.getURL().includes('8787/app') && !w.isDestroyed()).length);
await ui.click(`.slot[data-slot="${iOff}"] [data-power]`);
await sleep(300);
check('power pede confirmação (1º clique não desliga)', (await nJogos()) === 4);
await ui.click(`.slot[data-slot="${iOff}"] [data-power]`);
await sleep(1500);
check('power desliga: 3 jogos abertos', (await nJogos()) === 3, String(await nJogos()));
check('desligada sai da grade e as outras ganham espaço (3 quadrados)', (await ui.$$eval('.slot', (e) => e.filter((x) => getComputedStyle(x).display !== 'none').length)) === 3 && !(await ui.isVisible(`.slot[data-slot="${iOff}"]`)) && /terceira/.test(await ui.textContent('#offbar')));
await shot('desligada.png');
await ui.click(`#offbar [data-power="${iOff}"]`);
await sleep(4000);
check('ligar de novo abre o jogo e a conta volta', (await nJogos()) === 4 && !/Conta desligada/.test(await ui.textContent(`.slot[data-slot="${iOff}"]`)));

// recarregar jogo mesmo com "sair da página?" do jogo (beforeunload, depois de um clique nele)
await eapp.evaluate(async ({ webContents }) => {
  global.__recargas = 0;
  for (const w of webContents.getAllWebContents().filter((x) => x.getURL().includes('8787/app'))) {
    w.sendInputEvent({ type: 'mouseDown', x: 30, y: 30, button: 'left', clickCount: 1 });
    w.sendInputEvent({ type: 'mouseUp', x: 30, y: 30, button: 'left', clickCount: 1 });
    w.on('did-finish-load', () => global.__recargas++);
  }
});
await sleep(300);
await ui.click('.slot[data-slot="0"] [data-gear="0"]'); await sleep(600);
await ovClicar('[data-reload="0"]');
await sleep(2500);
check('recarregar jogo funciona (mesmo com beforeunload)', (await eapp.evaluate(() => global.__recargas)) >= 1);
check('menu sem zoom', !/Zoom/.test(await ovTexto().catch(() => '')));

// layouts prontos e arrastar para trocar de lugar
await ui.click('[data-lay="4|destaque"]');
await sleep(800);
const areas = await ui.$eval('#grid', (g) => g.style.gridTemplateAreas);
check('layout destaque aplicado', /"a b" "a c" "a d"/.test(areas), areas);
const antes = await ui.$$eval('.slot', (e) => e.map((x) => x.style.gridArea));
await ui.dragAndDrop('.slot[data-slot="1"] .head .nome', '.slot[data-slot="0"] .head .hunt-i');
await sleep(800);
const depois = await ui.$$eval('.slot', (e) => e.map((x) => x.style.gridArea));
check('arrastar troca as contas de lugar', antes[0] === depois[1] && antes[1] === depois[0], JSON.stringify([antes, depois]));
await shot('layout-destaque.png');
await ui.click('[data-lay="4|grade"]');
await sleep(500);

// Kick: login (cookie da sessão da conta), player mudo, saldo, resgate manual e automático
const iK = await ui.$$eval('.slot', (e) => +e.find((x) => /murilo/.test(x.querySelector('.nome')?.textContent || '')).dataset.slot);
await eapp.evaluate(async ({ session }, i) => { await session.fromPartition(`persist:conta-${i + 1}`).cookies.set({ url: 'http://127.0.0.1:8787', name: 'session_token', value: 'tok-kick' }); }, iK);
await ui.click(`.slot[data-slot="${iK}"] [data-kkbtn="${iK}"]`);
await sleep(700);
check('overlay da Kick abre', /Kick/.test(await ovTexto()), (await ovTexto()).slice(0, 120));
await ovClicar(`[data-kkset="${iK}|ligado"]`);
await sleep(7000);
const kkUrls = await eapp.evaluate(({ webContents }) => webContents.getAllWebContents().map((w) => w.getURL()).filter((u) => u.includes('/kick/')));
check('um player da Kick por live oficial com pontos no ar (faasii e outrolive)', kkUrls.length === 2 && kkUrls.some((u) => /\/kick\/faasii\?muted=true/.test(u)) && kkUrls.some((u) => /\/kick\/outrolive\?muted=true/.test(u)), JSON.stringify(kkUrls));
const kkQual = await eapp.evaluate(({ webContents }) => webContents.getAllWebContents().find((w) => w.getURL().includes('/kick/faasii'))?.executeJavaScript('sessionStorage.getItem("stream_quality")'));
check('player pediu qualidade mínima', kkQual === '160', String(kkQual));
const dock = await ui.textContent('#kdock');
check('doca da Kick mostra as lives com saldo (players escondidos)', /faasii\s*1\.200/.test(dock) && /Outro Live/.test(dock) && (await ui.$$('#kdock .kmini')).length === 0, dock.replace(/\s+/g, ' '));
const kkTxt = await ovTexto();
check('overlay lista canais com saldo (inclusive offline)', /Offline Cara/.test(kkTxt) && /3\.000 pts/.test(kkTxt) && !/Sem\b/.test(kkTxt), kkTxt.replace(/\s+/g, ' ').slice(0, 300));
await ui.keyboard.press('Escape');
await sleep(300);
await ui.click(`[data-kkver="${iK}|faasii"]`);
await sleep(1500);
const grande = await eapp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.map((v) => ({ url: v.webContents.getURL(), b: v.getBounds(), vis: v.getVisible() })).find((x) => x.url.includes('/kick/faasii')));
check('clique na live: o mesmo player cresce no lugar da grade', grande && grande.vis && grande.b.width > 1000, JSON.stringify(grande));
check('as contas continuam rodando (miniaturas) com a live aberta', (await jogosVisiveis()).every((v) => v === 'visible'), JSON.stringify(await jogosVisiveis()));
const mutadoAntes = await eapp.evaluate(({ webContents }) => webContents.getAllWebContents().find((w) => w.getURL().includes('/kick/faasii'))?.executeJavaScript('document.getElementById("vv").muted'));
await ui.click('#kkpainel [data-kksom]');
await sleep(600);
const mutadoDepois = await eapp.evaluate(({ webContents }) => webContents.getAllWebContents().find((w) => w.getURL().includes('/kick/faasii'))?.executeJavaScript('document.getElementById("vv").muted'));
check('começa mudo e o botão liga o som na própria página', mutadoAntes === true && mutadoDepois === false, `${mutadoAntes} -> ${mutadoDepois}`);
await shot('kick-grande.png');
await ui.click('#kkpainel [data-kkzoom="1"]');
await sleep(500);
const zk = await eapp.evaluate(({ webContents }) => webContents.getAllWebContents().find((w) => w.getURL().includes('/kick/faasii'))?.getZoomFactor());
check('zoom do player grande da Kick (+)', Math.abs(zk - 1.1) < 0.01, String(zk));
const zTodos = await eapp.evaluate(({ webContents }) => webContents.getAllWebContents().filter((w) => w.getURL().includes('/kick/')).map((w) => w.getZoomFactor()));
check('todos os players da Kick com o mesmo zoom (não se atropelam)', zTodos.every((z) => Math.abs(z - zk) < 0.01), JSON.stringify(zTodos));
await ui.click('#kkpainel [data-kkzoom="-1"]');
await ui.click('[data-kkfechar]');
await sleep(1000);
const pequeno = await eapp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.map((v) => ({ url: v.webContents.getURL(), vis: v.getVisible() })).find((x) => x.url.includes('/kick/faasii')));
const somFica = await eapp.evaluate(({ webContents }) => webContents.getAllWebContents().find((w) => w.getURL().includes('/kick/faasii'))?.executeJavaScript('document.getElementById("vv").muted'));
check('minimizar volta o mesmo player (escondido) e mantém o que você mudou', pequeno && !pequeno.vis && somFica === false, JSON.stringify(pequeno) + ' mudo=' + somFica);
await ui.click(`[data-kkvis="${iK}"]`);
await sleep(1000);
check('botão ◉ mostra os players pequenos', (await ui.$$('#kdock .kmini')).length === 2);
await shot('kick.png');
await ui.click(`[data-kkvis="${iK}"]`);
await sleep(500);
await ui.click(`.slot[data-slot="${iK}"] [data-kkbtn="${iK}"]`);
await sleep(700);
await ovClicar(`[data-kkset="${iK}|auto"]`);
await sleep(12000);
check('resgate automático (canais com pontos, inclusive offline)', /KICK REDEEM (faasii|offlinecara) r1/.test(mockOut), mockOut.split('\n').filter((l) => l.includes('KICK')).join(' / '));
await ui.keyboard.press('Escape');
await sleep(300);

// Kick global (barra de cima): atalho para todas as contas logadas na Kick
const kkg = () => ui.$$eval('#kkg button', (e) => e.map((b) => b.dataset.kkg + ':' + (b.className || 'off') + (b.disabled ? ':dis' : '')));
const g0 = await kkg();
check('Kick global aparece com as contas logadas (farmar e resgatar ligados, player leve)', g0.join() === 'ligado:on,auto:on,leve:on', g0.join());
await ui.click('#kkg [data-kkg="leve"]'); await sleep(4000);
const urlsCompl = await eapp.evaluate(({ webContents }) => webContents.getAllWebContents().map((w) => w.getURL()).filter((u) => u.includes('/kick/')));
check('Kick global: Player leve desligado troca para a página completa', (await kkg()).includes('leve:off') && urlsCompl.length === 2 && urlsCompl.every((u) => !u.includes('?muted')), JSON.stringify(urlsCompl));
await ui.click('#kkg [data-kkg="leve"]'); await sleep(4000);
await ui.click('#kkg [data-kkg="ligado"]'); await sleep(4000);
const urlsOff = await eapp.evaluate(({ webContents }) => webContents.getAllWebContents().map((w) => w.getURL()).filter((u) => u.includes('/kick/')));
check('Kick global: Farmar desligado fecha os players de todas', (await kkg()).includes('ligado:off') && urlsOff.length === 0, JSON.stringify(urlsOff));
await shot('kick-global.png');
await ui.click('#kkg [data-kkg="ligado"]'); await sleep(3000);
check('Kick global: Farmar liga de novo', (await kkg()).includes('ligado:on'), (await kkg()).join());

// Golden Potion: item próprio do jogo (welcome), preço do servidor e cura em %
const gp = await ui.evaluate(() => S.map((s) => ({ nick: s.snap?.nick, ops: opcoes(S.indexOf(s), 'item').map((o) => o.nome + '=' + o.preco).join(','), poc: s.res?.ficha?.pocao, extra: s.res?.ficha?.pocaoExtra })));
const gSeg = gp.find((x) => x.nick === 'segunda'), gMu = gp.find((x) => x.nick === 'murilo');
check('Golden Potion aparece na compra com o preço do servidor', gp.every((x) => /Golden Potion=4000/.test(x.ops)) && gp.every((x) => /Small Potion=50/.test(x.ops)), JSON.stringify(gp.map((x) => x.ops)));
check('ficha usa a Golden Potion quando ela está na auto-poção (cura 100%)', gSeg?.poc === '90001' && gSeg?.extra?.pct === 1 && gMu?.poc === '201', JSON.stringify([gSeg, gMu]));

// zoom manual do jogo pela engrenagem
await ui.click('.slot[data-slot="1"] [data-gear="1"]'); await sleep(600);
const z0 = await eapp.evaluate(({ webContents }) => webContents.getAllWebContents().filter((w) => w.getURL().includes('8787/app')).map((w) => w.getZoomFactor()));
await ovClicar('[data-zoom="1|1"]'); await sleep(500);
const z1 = await eapp.evaluate(({ webContents }) => webContents.getAllWebContents().filter((w) => w.getURL().includes('8787/app')).map((w) => w.getZoomFactor()));
check('zoom do jogo pela engrenagem muda só aquela conta', z0.filter((v, k) => Math.abs(v - z1[k]) > 0.05).length === 1, JSON.stringify([z0, z1]));
await ovClicar('[data-zoom="1|0"]'); await sleep(300);
await ui.keyboard.press('Escape'); await sleep(300);

// divisória arrastável entre os quadrados (layout 2×2)
await ui.click('[data-lay="4|grade"]');
await sleep(800);
const dv = await ui.$('[data-div="c|0"]');
check('divisórias aparecem entre os quadrados', !!dv && (await ui.$$('[data-div]')).length >= 2);
const bx = await dv.boundingBox();
const larg0 = await ui.$eval('.slot[data-slot="0"]', (e) => e.getBoundingClientRect().width);
await ui.mouse.move(bx.x + 5, bx.y + 60);
await ui.mouse.down();
for (let k = 1; k <= 10; k++) { await ui.mouse.move(bx.x + 5 + k * 20, bx.y + 60); await sleep(30); }
await ui.mouse.up();
await sleep(800);
const larg1 = await ui.$eval('.slot[data-slot="0"]', (e) => e.getBoundingClientRect().width);
check('arrastar a divisória aumenta um lado e diminui o outro', Math.abs(Math.abs(larg1 - larg0) - 200) < 30, `${larg0} -> ${larg1}`);
await shot('divisoria.png');

// config persiste por conta
const cfgArq = path.join(userData, 'contas', 'conta-1.json');
const salvo = fs.existsSync(cfgArq) ? JSON.parse(fs.readFileSync(cfgArq, 'utf8')) : null;
check('config da conta 1 gravada', salvo?.cfg?.enabled === true && salvo.cfg.rules.some((r) => r.id === 'app-bola' && r.refId === 3 && r.min === 100 && r.enabled));
const tj = JSON.parse(fs.readFileSync(path.join(userData, 'twitch.json'), 'utf8'));
check('token não fica em texto puro quando há cofre', !JSON.stringify(tj).includes('tok') || /"tok":"(enc|raw):/.test(JSON.stringify(tj)), JSON.stringify(tj).slice(0, 120));

await shot('grade.png');

// ---- modos (valem para todas as contas)
const jogosJs = (js) => eapp.evaluate(({ webContents }, js) => Promise.all(webContents.getAllWebContents().filter((w) => w.getURL().includes('8787/app')).map((w) => w.executeJavaScript(js))), js);
const ecoAntes = await jogosJs("document.documentElement.classList.contains('modo-economia')");
check('sem escolher modo o app não mexe na economia', ecoAntes.every((x) => x === false), JSON.stringify(ecoAntes));
await ui.click('[data-modo="eco"]'); await sleep(1500);
const ecoOn = await jogosJs("document.documentElement.classList.contains('modo-economia')");
check('Eco liga o Modo Economia nas 4 contas', ecoOn.length === 4 && ecoOn.every(Boolean), JSON.stringify(ecoOn));
check('botão Eco marcado', await ui.$eval('#modos [data-modo="eco"]', (e) => e.classList.contains('on')));
await ui.click('[data-modo="ultra"]'); await sleep(1500);
const visU = await jogosJs('document.visibilityState');
check('Ultra eco: jogos não são desenhados (views escondidas)', visU.every((v) => v === 'hidden'), JSON.stringify(visU));
const ecoU = await jogosJs("document.documentElement.classList.contains('modo-economia')");
check('Ultra eco mantém o Modo Economia', ecoU.every(Boolean));
const linhasU = await ui.$$eval('#ultra .u-l:not(.u-cab)', (e) => e.map((x) => x.textContent));
check('tela preta: conta, pokémon e lugar', linhasU.length === 4 && linhasU.some((t) => /murilo/.test(t) && /Yanma/.test(t) && /Kadabra/.test(t) && /Kanto/.test(t)), linhasU.join(' | '));
check('sem Ligar tudo / Desligar tudo', !(await ui.$('#ligaTudo')) && !(await ui.$('#desligaTudo')));
// conta desligada some da tela preta
const desligar = (on) => ui.evaluate(async (on) => { const l = await app.power(3, on); S[3].desligada = !l; renderTudo(); }, on);
await desligar(false); await sleep(800);
const linhasOff = await ui.$$eval('#ultra .u-l:not(.u-cab)', (e) => e.length);
check('conta desligada não aparece no Ultra eco', linhasOff === 3, String(linhasOff));
await desligar(true); await sleep(2500);
const timerVivo = await jogosJs('new Promise((r) => { let n = 0; const t = setInterval(() => { if (++n === 5) { clearInterval(t); r(n); } }, 100); })');
check('Ultra eco: timers do jogo continuam rodando escondidos', timerVivo.every((n) => n === 5));
await shot('ultra.png');
// recarregar uma conta em Ultra continua escondida e em economia
await eapp.evaluate(({ webContents }) => webContents.getAllWebContents().find((w) => w.getURL().includes('8787/app')).reload());
await sleep(2500);
const visR = await jogosJs('document.visibilityState');
check('conta recarregada em Ultra continua escondida', visR.every((v) => v === 'hidden'), JSON.stringify(visR));
await ui.click('#ultra [data-modo="normal"]'); await sleep(1500);
const ecoN = await jogosJs("document.documentElement.classList.contains('modo-economia')");
const visN = await jogosJs('document.visibilityState');
check('Normal desliga o Modo Economia em todas', ecoN.every((x) => x === false), JSON.stringify(ecoN));
check('Normal mostra os jogos de novo', visN.every((v) => v === 'visible'), JSON.stringify(visN));
await sleep(300);
const appJson = JSON.parse(fs.readFileSync(path.join(userData, 'app.json'), 'utf8'));
check('modo fica salvo', appJson.modo === 'normal', JSON.stringify(appJson));

// ---- atualização (GitHub falso)
const attTxt0 = await ui.$eval('#att', (e) => e.textContent);
check('versão aparece na barra', /^v\d/.test(attTxt0), attTxt0);
await ui.click('#att'); await sleep(2500);
const attTxt = await ui.$eval('#att', (e) => e.textContent);
check('acha versão nova, baixa e confere', /Atualizar para 9\.9\.9/.test(attTxt), attTxt);
await shot('att.png');
await eapp.close();
mock.kill();
console.log(`\n${res.filter(Boolean).length}/${res.length} ok`);
process.exit(res.every(Boolean) ? 0 : 1);
