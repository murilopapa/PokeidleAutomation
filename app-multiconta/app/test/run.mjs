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
check('hunt e XP/h no cabeçalho', info.filter((t) => /Kadabra|Tangela/.test(t)).length === 3 && info.some((t) => /fora de hunt/.test(t)) && info.filter((t) => /XP\/h/.test(t)).length >= 2, info.join(' | '));

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
// os jogos seguem rodando mesmo escondidos (timers e WebSocket): conta 5 voltas de um timer de 100 ms
const jogosRodando = () => eapp.evaluate(async ({ webContents }) => Promise.all(webContents.getAllWebContents().filter((w) => w.getURL().includes('8787/app')).map((w) => w.executeJavaScript('new Promise((r) => { let n = 0; const t = setInterval(() => { if (++n === 5) { clearInterval(t); r(n); } }, 100); setTimeout(() => r(n), 3000); })'))));
// quais views de jogo o app está desenhando (setVisible) — o visibilityState não muda sem tela de verdade
const viewsDesenhadas = () => eapp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.filter((v) => v.webContents.getURL().includes('8787/app')).map((v) => v.getVisible()));
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
const visExp = await viewsDesenhadas(), rodExp = await jogosRodando();
check('expandida: só ela desenhada, as outras escondidas mas rodando', visExp.filter(Boolean).length === 1 && rodExp.every((n) => n === 5), JSON.stringify([visExp, rodExp]));
check('faixa de baixo fina, com um rótulo por conta', (await ui.$eval('#strip', (e) => e.getBoundingClientRect().height)) < 50 && (await ui.$$('#strip .th[data-th]')).length === 4, String(await ui.$eval('#strip', (e) => e.getBoundingClientRect().height)));
await shot('expandido.png');
await ui.keyboard.press('Escape');
await sleep(500);

// troca de mapa automática na conta com alerta
const alertas = await ui.$$eval('.slot.alert', (e) => e.filter((x) => !/quarta/.test(x.textContent)).map((x) => +x.dataset.slot));
const iAl = alertas.find((x) => x !== 0) ?? alertas[0];
const alvoTroca = await ui.evaluate((i) => S[i]?.alerta?.melhor?.hunt?.nome, iAl);
console.log('alerta em', alertas, iAl, alvoTroca);
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
check('cabeçalho mostra a hunt nova (1º lugar do motor)', !!alvoTroca && head.includes(alvoTroca), head + ' / esperado ' + alvoTroca);
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
check('com a live aberta as contas seguem rodando escondidas', (await jogosRodando()).every((n) => n === 5), JSON.stringify(await jogosRodando()));
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
check('sem resgate automático no painel da Kick', !/Resgatar sozinho/.test(await ovTexto()));
await ui.keyboard.press('Escape');
await sleep(300);

// Kick global (barra de cima): atalho para todas as contas logadas na Kick
const kkg = () => ui.$$eval('#kkg button', (e) => e.map((b) => b.dataset.kkg + ':' + (b.className || 'off') + (b.disabled ? ':dis' : '')));
const g0 = await kkg();
check('Kick global aparece com as contas logadas (farmar ligado, player leve)', g0.join() === 'ligado:on,leve:on', g0.join());
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
check('K da Kick global verde', (await ui.$eval('#kkg .kkg-t svg', (e) => getComputedStyle(e).fill)) === 'rgb(83, 252, 24)', await ui.$eval('#kkg .kkg-t svg', (e) => getComputedStyle(e).fill));

// Motor do Onde caçar (igual à extensão oficial): dados do jogo baixados, worker, geometria medida
const mot = await ui.evaluate(() => ({ v: MOTOR_V, erro: MOTOR_ERRO, res: S.map((s) => ({ nick: s.snap?.nick, n: s.res?.lista?.length ?? 0, top: s.top?.map((r) => r.hunt.slug + ' ' + r.risco.txt) ?? [], ver: s.res?.versao, bonus: s.res?.bonusXp?.pokemon })), geo: Object.keys(geoJunta()) }));
check('motor carregou os dados do jogo (worker)', !!mot.v && !mot.erro, JSON.stringify({ v: mot.v, erro: mot.erro }));
check('ranking calculado em todas as contas com pokémon', mot.res.filter((r) => r.n > 50 && r.top.length).length >= 3, JSON.stringify(mot.res));
check('geometria das ondas cheias medida e repassada', mot.geo.length >= 1, JSON.stringify(mot.geo));
await ui.click(`.slot[data-slot="${iK}"] [data-am="${iK}|mapa"]`); await sleep(800);
const mapaTxt = await ovTexto();
check('painel do mapa mostra o top 3 do motor novo', /Top 3/.test(mapaTxt) && /(✓|⚠)/.test(mapaTxt) && /Dados do jogo v/.test(mapaTxt), mapaTxt.replace(/\s+/g, ' ').slice(0, 400));
await shot('mapa-motor.png');
await ui.keyboard.press('Escape'); await sleep(300);

// Sniper do Mercado (itens): simula, depois compra só depois da retenção, só o barato
const iSn = await ui.$$eval('.slot', (e) => +e.find((x) => /segunda/.test(x.querySelector('.nome')?.textContent || '')).dataset.slot);
await ui.click(`.slot[data-slot="${iSn}"] [data-am="${iSn}|sniper"]`); await sleep(800);
check('painel do sniper mostra os 3 alvos achados no Mercado', /Boss Token 1 no Mercado/.test(await ovTexto()) && /Fragmento de chave 1 no Mercado/.test(await ovTexto()) && /Fragmento de bike 1 no Mercado/.test(await ovTexto()), (await ovTexto()).replace(/\s+/g, ' ').slice(0, 300));
const snPadrao = await ui.evaluate((i) => cfgDe(i).sniper, iSn);
check('sniper: nada ligado por padrão', !snPadrao.enabled && snPadrao.modo === 'simular' && !snPadrao.alvos.length && !snPadrao.moedas.orb.on && !snPadrao.moedas.gold.on && !snPadrao.moedas.orb.tetoDia, JSON.stringify(snPadrao));
await ui.evaluate((i) => mudarSniper(i, { alvos: ['boss', 'chave', 'bike'], moedas: { orb: { on: true, tetoDia: 100 } } }), iSn); await sleep(300);
await ovClicar(`[data-snon="${iSn}"]`); await sleep(8000);
const snLog1 = await ui.evaluate((i) => (S[i].sniper?.log ?? []).map((l) => l.tipo + ': ' + l.texto), iSn);
check('simular: anota o fragmento de bike barato em Gemas (vs últimas vendas e vitrine) e ignora o resto', snLog1.some((l) => /^simulado: teria comprado: Bicycle Fragment ×3 por 60 Gemas\/un\. — 37% abaixo \(últimas 4 vendas 98 · vitrine 95\)/.test(l)) && !snLog1.some((l) => /Key|Fire|por 90/.test(l)) && !/MERCADO compra/.test(mockOut), JSON.stringify(snLog1));
await shot('sniper-simular.png');
// modo comprar (com a chave Automação da conta ligada)
if (!(await ui.isChecked(`[data-master="${iSn}"]`))) await ui.click(`.slot[data-slot="${iSn}"] .bar label.sw`);
await ui.evaluate((i) => { mudarSniper(i, { modo: 'comprar' }); }, iSn);
await sleep(28000);
const comprasSn = mockOut.split('\n').filter((l) => l.startsWith('MERCADO compra'));
const snLog2 = await ui.evaluate((i) => (S[i].sniper?.log ?? []).map((l) => l.tipo + ': ' + l.texto), iSn);
check('comprar: pediu só o anúncio barato e só depois de liberar', comprasSn.length === 1 && / 501 /.test(comprasSn[0]) && parseFloat(comprasSn[0].split('faltavam ')[1]) <= 0, comprasSn.join(" / "));
check('comprar: entrou no sorteio e registrou a compra', snLog2.some((l) => /^sorteio:/.test(l)) && snLog2.some((l) => /^comprou: COMPROU: 1× Bicycle Fragment por 60 Gemas/.test(l)), JSON.stringify(snLog2.slice(-5)));
// aba Compras: resumo do período, por item (pago, vender a, mínimo, lucro já sem os 15%)
await ovClicar('[data-sntab="compras"]'); await sleep(700);
const compTxt = (await ovTexto()).replace(/\s+/g, ' ');
check('aba Compras: 1 compra, 60 Gemas, mínimo 71, lucro +20 se revender a 95', /1unidades/.test(compTxt) && /60 Gemasgasto/.test(compTxt) && /Bicycle Fragment1609571\+20Gemas/.test(compTxt) && /1 ganhas/.test(compTxt), compTxt.slice(0, 600));
await shot('sniper-compras.png');
const persistido = JSON.parse(fs.readFileSync(path.join(userData, "contas", `conta-${iSn + 1}.json`), "utf8"));
check('histórico do sniper fica salvo no disco', (persistido.sniper?.hist ?? []).some((x) => x.res === 'ganhou' && x.qtd === 1 && x.preco === 60), JSON.stringify(persistido.sniper?.hist?.slice(-2)));
await ovClicar('[data-sntab="config"]'); await sleep(300);
// a chavinha do botão liga/desliga sem abrir o menu
await ui.keyboard.press('Escape'); await sleep(300);
const mapa0 = await ui.evaluate((i) => cfgDe(i).autoHunt.enabled, iSn);
await ui.click(`.slot[data-slot="${iSn}"] [data-amt="${iSn}|mapa"]`); await sleep(400);
const mapa1 = await ui.evaluate((i) => cfgDe(i).autoHunt.enabled, iSn);
await ui.click(`.slot[data-slot="${iSn}"] [data-amt="${iSn}|mapa"]`); await sleep(400);
const mapa2 = await ui.evaluate((i) => cfgDe(i).autoHunt.enabled, iSn);
check('chavinha no botão liga e desliga sem abrir o menu', mapa1 === !mapa0 && mapa2 === mapa0 && !(await ovTexto()).trim(), JSON.stringify([mapa0, mapa1, mapa2]));
await ui.click(`.slot[data-slot="${iSn}"] [data-am="${iSn}|sniper"]`); await sleep(800);
check('teto de Gemas respeitado (100/dia: levou 1 de 3) e gasto contado', (await ui.evaluate((i) => S[i].sniper?.gasto?.orb, iSn)) === 60);
// só uma conta caça por vez
const outraSn = (iSn + 1) % 4;
await ui.evaluate((k) => mudarSniper(k, { enabled: true }), outraSn); await sleep(300);
check('ligar o sniper em outra conta desliga na primeira', await ui.evaluate(([a, b]) => !cfgDe(a).sniper.enabled && cfgDe(b).sniper.enabled, [iSn, outraSn]));
await ui.evaluate((k) => mudarSniper(k, { enabled: false }), outraSn);
await shot('sniper-comprou.png');
await ui.keyboard.press('Escape'); await sleep(300);

// Golden Potion: item próprio do jogo (welcome), preço do servidor e cura em %
const gp = await ui.evaluate(() => S.map((s) => ({ nick: s.snap?.nick, ops: opcoes(S.indexOf(s), 'item').map((o) => o.nome + '=' + o.preco).join(',') })));
check('Golden Potion aparece na compra com o preço do servidor', gp.every((x) => /Golden Potion=4000/.test(x.ops)) && gp.every((x) => /Small Potion=50/.test(x.ops)), JSON.stringify(gp.map((x) => x.ops)));

// tela cheia: a doca da Kick começa fina, mas o botão ▴ expande (e ▾ volta)
await ui.click(`.slot[data-slot="${iK}"] [data-max="${iK}"]`); await sleep(800);
const docaAntes = await ui.$eval('#kdock', (e) => e.classList.contains('min'));
await ui.click('#kdock [data-kdmin]'); await sleep(600);
const docaDepois = await ui.$eval('#kdock', (e) => e.classList.contains('min'));
await ui.click('#kdock [data-kdmin]'); await sleep(400);
check('tela cheia: doca da Kick fina, e o botão expande/minimiza', docaAntes === true && docaDepois === false && (await ui.$eval('#kdock', (e) => e.classList.contains('min'))) === true, JSON.stringify([docaAntes, docaDepois]));
await ui.keyboard.press('Escape'); await sleep(600);

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
const visU = await viewsDesenhadas();
check('Ultra eco: jogos não são desenhados (views escondidas)', visU.every((v) => !v), JSON.stringify(visU));
const ecoU = await jogosJs("document.documentElement.classList.contains('modo-economia')");
check('Ultra eco mantém o Modo Economia', ecoU.every(Boolean));
const leveU = await jogosJs("document.documentElement.classList.contains('pie-leve') && getComputedStyle(document.getElementById('app')).display === 'none'");
check('Ultra eco: a página do jogo some por dentro (sem layout)', leveU.every(Boolean), JSON.stringify(leveU));
const cards = await ui.$$eval('#ultra .u-card', (e) => e.map((x) => x.textContent.replace(/\s+/g, ' ')));
const c0 = cards.find((t) => /murilo/.test(t)) || '', c1 = cards.find((t) => /segunda/.test(t)) || '';
check('um cartão por conta', cards.length === 4, String(cards.length));
check('cartão: pokémon, nível, lugar e status', /Yanma/.test(c0) && /Kadabra/.test(c0) && /caçando/.test(c0), c0);
check('cartão: bônus VIP', /VIP/.test(c0), c0);
check('cartão: sessão do jogo (tempo, abates, capturas)', /Sessão 3h12/.test(c0) && /5\.840 abates/.test(c0) && /31 capturas/.test(c0), c0);
check('cartão: achados da sessão', /Frag\. de chave ×2/.test(c0) && /Boss Token ×1/.test(c0), c0);
check('cartão: ouro/h da sessão', /Ouro\/h\s*409/.test(c0), c0);
check('cartão: bola e poção em uso com estoque', /48 Poke Ball/.test(c0) && /5 Great Ball/.test(c0) && /4 Great Potion/.test(c0), c0);
check('cartão: últimos eventos (captura e drop raro)', /capturou Ditto Nv 50/.test(c0) && /Key Fragment ×1/.test(c0) && !/Twisted Spoon/.test(c0), c0);
check('cartão: shiny e desmaio na 2ª conta', /shiny capturado: Zubat/.test(c1) && /1 desmaio na última hora/.test(c1) && /✨ 1\/1 shiny/.test(c1), c1);
const hp = await ui.$$eval('#ultra [data-uc="0"] .u-hp', (e) => e.map((x) => x.className + ' ' + x.firstElementChild.style.width));
check('cartão: barra de vida do ativo e do time', hp.length === 2 && /g ok 92\.6%/.test(hp[0]) && /warn 21\.4%/.test(hp[1]), JSON.stringify(hp));
check('cartão: retrato do pokémon', await ui.$eval('#ultra [data-uc="0"] .u-ret img', (e) => /\/193\.png$/.test(e.src)).catch(() => false));
const totTxt = await ui.$eval('#ultra .u-tot', (e) => e.textContent.replace(/\s+/g, ' '));
const somaCap = await ui.evaluate(() => S.reduce((t, s) => t + (s.desligada ? 0 : s.snap?.sessao?.capturas || 0), 0));
check('faixa de totais (capturas e gemas somadas)', somaCap > 0 && new RegExp('Capturas na sessão\\s*' + somaCap + '\\b').test(totTxt) && /Gemas\s*4\.000/.test(totTxt), somaCap + ' ' + totTxt);
const mapaAntes = await ui.evaluate(() => cfgDe(0).autoHunt.enabled);
await ui.click('#ultra [data-uc="0"] [data-amt="0|mapa"]'); await sleep(600);
const mapaOn = await ui.evaluate(() => cfgDe(0).autoHunt.enabled);
const swOn = await ui.$eval('#ultra [data-uc="0"] [data-amt="0|mapa"]', (e) => e.classList.contains('on'));
check('chavinha no cartão troca o Mapa', mapaOn === !mapaAntes && swOn === mapaOn, JSON.stringify([mapaAntes, mapaOn, swOn]));
await ui.click('#ultra [data-uc="0"] [data-amt="0|mapa"]'); await sleep(400);
// capturas no cartão e o "Ver tudo"
const nCaps = await ui.$$eval('#ultra [data-uc="0"] .u-cap', (e) => e.map((x) => x.className));
check('cartão: miniaturas das capturas com onde estão', nCaps.length === 4 && nCaps.some((c) => /colecao/.test(c)) && nCaps.some((c) => /sh/.test(c) && /depot/.test(c)) && nCaps.some((c) => /fora/.test(c)), JSON.stringify(nCaps));
const m0 = await ui.evaluate(() => S.findIndex((x) => x.snap?.nick === 'murilo'));
await ui.click(`#ultra [data-uc="${m0}"] .u-ver`); await sleep(500);
await shot('ultra-det.png');
const det = await ui.$eval('#ultra .u-modal', (e) => e.textContent.replace(/\s+/g, ' ')).catch(() => '');
check('Ver tudo: lista de capturas com local', /Abra/.test(det) && /na Coleção/.test(det) && /no Depot/.test(det) && /na equipe/.test(det) && /saiu da conta/.test(det), det.slice(0, 400));
await ui.click('#ultra .u-modal [data-ufil="colecao"]'); await sleep(300);
const linhasCol = await ui.$$eval('#ultra .u-captab tr:not(:first-child)', (e) => e.map((x) => x.textContent));
check('Ver tudo: filtro Coleção', linhasCol.length === 1 && /Abra/.test(linhasCol[0]), JSON.stringify(linhasCol));
await ui.click(`#ultra .u-modal [data-udet="${m0}|itens"]`); await sleep(300);
await shot('ultra-itens.png');
const itTxt = await ui.$eval('#ultra .u-modal', (e) => e.textContent.replace(/\s+/g, ' '));
check('Ver tudo: itens que caíram e gastos', /Twisted Spoon\s*(\d+)\s*\1/.test(itTxt) && /Key Fragment/.test(itTxt) && /Poke Ball\s*40/.test(itTxt) && /Great Potion\s*12/.test(itTxt), itTxt.slice(0, 500));
await ui.click('#ultra .u-modal', { position: { x: 5, y: 5 } }); await sleep(300);
check('clicar fora fecha o Ver tudo', !(await ui.$('#ultra .u-modal')));
// painel de automação abre dentro do Ultra eco (o mesmo do modo normal)
await ui.click('#ultra [data-uc="0"] [data-am="0|bola"]'); await sleep(500);
await shot('ultra-painel.png');
const pnl = await ui.$eval('#ultra .u-modal', (e) => e.textContent).catch(() => '');
check('Ultra eco: clicar na automação abre o painel', /Compra de Pokébola/.test(pnl), pnl.slice(0, 200));
await ui.fill('#ultra .u-modal [data-rmin="0|bola"]', '77'); await ui.press('#ultra .u-modal [data-rmin="0|bola"]', 'Enter'); await sleep(500);
check('painel no Ultra eco salva o ajuste', (await ui.evaluate(() => regra(0, 'app-bola')?.min)) === 77);
check('painel continua aberto depois de ajustar', !!(await ui.$('#ultra .u-modal [data-rmin="0|bola"]')));
await ui.keyboard.press('Escape'); await sleep(300);
check('Esc fecha o painel no Ultra eco', !(await ui.$('#ultra .u-modal')));
check('sem Ligar tudo / Desligar tudo', !(await ui.$('#ligaTudo')) && !(await ui.$('#desligaTudo')));
// conta desligada some da tela preta
const desligar = (on) => ui.evaluate(async (on) => { const l = await app.power(3, on); S[3].desligada = !l; renderTudo(); }, on);
await desligar(false); await sleep(800);
const linhasOff = await ui.$$eval('#ultra .u-card', (e) => e.length);
check('conta desligada não aparece no Ultra eco', linhasOff === 3, String(linhasOff));
await desligar(true); await sleep(2500);
const timerVivo = await jogosJs('new Promise((r) => { let n = 0; const t = setInterval(() => { if (++n === 5) { clearInterval(t); r(n); } }, 100); })');
check('Ultra eco: timers do jogo continuam rodando escondidos', timerVivo.every((n) => n === 5));
await shot('ultra.png');
// recarregar uma conta em Ultra continua escondida e em economia
await eapp.evaluate(({ webContents }) => webContents.getAllWebContents().find((w) => w.getURL().includes('8787/app')).reload());
await sleep(2500);
const visR = await viewsDesenhadas();
check('conta recarregada em Ultra continua escondida', visR.every((v) => !v), JSON.stringify(visR));
await ui.click('#ultra [data-modo="normal"]'); await sleep(1500);
const ecoN = await jogosJs("document.documentElement.classList.contains('modo-economia')");
const visN = (await viewsDesenhadas()).map((v) => (v ? 'visible' : 'hidden'));
check('Normal desliga o Modo Economia em todas', ecoN.every((x) => x === false), JSON.stringify(ecoN));
check('Normal mostra os jogos de novo', visN.every((v) => v === 'visible'), JSON.stringify(visN));
const leveN = await jogosJs("document.documentElement.classList.contains('pie-leve') || getComputedStyle(document.getElementById('app')).display === 'none'");
check('Normal: a página do jogo volta sem recarregar', leveN.every((x) => x === false), JSON.stringify(leveN));
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
