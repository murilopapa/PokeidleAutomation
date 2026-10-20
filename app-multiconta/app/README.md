# PokeIdle Multi

Até 4 contas do pokeidle.io lado a lado, numa janela só. Cada quadrado tem sessão própria
(login, cookies e config separados), a mesma lógica da extensão PokeIdle Helper e presença na
Twitch pelo chat, sem vídeo.

## Usar

**Windows:** rode `PokeIdle-Multi-Instalador-<versão>.exe`. Instala só para o seu usuário (não pede
administrador), cria atalho na Área de Trabalho e no Menu Iniciar. Para atualizar, rode o
instalador da versão nova por cima: logins e configurações continuam (ficam em
`%APPDATA%\PokeIdle Multi`). Para mandar para um amigo, mande só o Setup.

O Windows pode avisar "o Windows protegeu o computador" (o instalador não é assinado):
**Mais informações → Executar assim mesmo**.

**Pelo código (precisa do Node.js 20+):** `npm install` e `npm start`.
**Gerar o instalador:** `sh tools/build-win.sh` (Linux/WSL, com `nsis` instalado).

Na primeira vez, entre em cada conta no próprio quadrado (a tela de login do jogo aparece ali).
O login fica guardado por quadrado.

## Tela

- **Layouts:** botões na barra de cima com layouts prontos (iguais, um grande e outros menores…).
  Arraste a divisória entre os quadrados para mudar o tamanho (duplo clique nela volta ao padrão).
  Arraste o cabeçalho de uma conta e solte no de outra para trocar as duas de lugar; a 1ª fica
  com o espaço maior nos layouts de destaque.
- **Barra de cima:** aviso vermelho quando alguma conta tem hunt melhor (clique para ver), modos de
  economia, **Kick (todas as contas)**, RAM do app e a versão (amarelo quando tem atualização).
- **Cabeçalho do quadrado:** conta, nível, hunt atual e XP/h. Botão **power**: desliga a conta
  (2 cliques; fecha o jogo dela, libera a RAM e sai do chat da Twitch). Fica lembrado ao reabrir. Contas desligadas saem da grade (as
  outras ganham o espaço) e ficam na barra "Desligadas" embaixo, com o botão Ligar. Ícone da Twitch (passe o mouse:
  lives oficiais abertas e onde você já está). Engrenagem: vincular/desvincular Twitch e
  recarregar o jogo, zoom do jogo (−/+/auto; ou Ctrl + roda do mouse / Ctrl +, Ctrl −, Ctrl 0 dentro do jogo). Botão de expandir (ou duplo clique no cabeçalho; teclas 1–4; Esc volta).
- **Barra de baixo:** Compras e Mapa. Clique para abrir a config por cima do jogo.
  - Compras: abre a janela de **Compras automáticas** (também pelo botão 🛒 do topo): uma aba por conta e uma lista de regras (Pokébola ou Item, "abaixo de" e lote por compra), quantas quiser. A bolinha do chip liga/desliga todas as da conta.
  - As mudanças ficam em rascunho até **Aplicar** (só esta conta) ou **Aplicar em todas as contas** (copia a lista para as outras). **Descartar** volta ao que está aplicado.
  - Mapa: seu pokémon em campo e o top 3 de hunts, com o mesmo cálculo da extensão oficial do jogo
    ("/hunt for PokeIdle"). Ligado, troca para o 1º lugar que não seja ☠ (morte estimada ou golpe
    que passa do HP), só fora de combate.
  - Chave **Automação**: nada age no jogo com ela desligada. Tudo começa desligado.

Os menus abrem numa camada transparente por cima do quadrado: o jogo continua visível e rodando.
Com uma conta expandida, as outras viram miniaturas ao vivo na tira de baixo (nunca são
escondidas, porque o navegador pausa página escondida).

**RAM:** cada conta é um jogo inteiro rodando (como uma aba do Chrome). O número no topo é a
memória própria de cada processo; passe o mouse para ver quanto cada conta, a placa de vídeo e o
app usam.

## Modos de economia (barra de cima, valem para todas as contas)

- **Normal:** cena do jogo ligada em todas as contas (tira o Modo Economia de todas).
- **Eco:** liga o Modo Economia do próprio jogo (o botão da bateria) em todas: o jogo para de
  desenhar o mapa e os pokémon andando e o servidor para de mandar o campo. A caça, as compras e a
  troca de mapa continuam iguais.
- **Ultra eco:** Eco + o app para de desenhar os jogos. Fica uma tela preta com o resumo de cada
  conta ligada (pokémon farmando, lugar, XP/h, automação). É o mais leve: quase nada de placa de vídeo. Tudo continua
  rodando por trás; "Ver os jogos (Eco)" volta.

O modo fica salvo e é reaplicado quando uma conta abre ou recarrega. Enquanto você não escolher
nenhum, o app não mexe no Modo Economia de ninguém. Dá para mudar à mão numa conta: o app só
reaplica ao recarregar ou ao trocar de modo.

## Keepalive (tela sempre acesa)

Botão **Tela** na barra de cima. Ligado ("☀ Tela acesa"), o app usa o `powerSaveBlocker`
(`prevent-display-sleep`) do Electron: a tela não apaga e o PC não suspende por inatividade enquanto
o app estiver aberto. Não impede o bloqueio manual (Win+L). Fica salvo e volta ligado ao abrir o app.
Ao fechar o app, o Windows volta ao normal.

## Rotom Sniper (extensão oficial do jogo)

O app carrega a extensão oficial **Rotom Sniper** de verdade (`session.loadExtension`) na sessão de
CADA conta, com o mesmo ID da loja (`olccbpdj…`). Cada conta tem o próprio sniper, as próprias
regras, logs e carteira. O Mercado é só com o Rotom: o app não tem mais sniper próprio.

- **Primeira vez:** o app procura a extensão instalada no Brave, Chrome, Edge, Vivaldi ou Opera
  (precisa estar instalada pela loja num deles) e importa sozinho. Não achou? Botão **Rotom: importar**
  ou **…** para escolher a pasta da versão (a que tem o `manifest.json`).
- **Cockpit (a tela da extensão):** ícone de alvo no cabeçalho de cada conta, ao lado da Kick. Também
  pela engrenagem da conta → *Abrir cockpit do Rotom*. Abre uma janela do
  app por conta (ligue e configure o auto-snipe lá, como na extensão).
- **Ligar/desligar:** clique em "Rotom v… · ligado". Os jogos recarregam para pegar ou largar o código.
- **Atualizar:** o app olha o navegador a cada 3 h. Se a extensão de lá estiver mais nova, aparece
  **Atualizar → versão**. O clique importa, refaz a pasta ativa com os seus patches e recarrega os jogos.
- **Mexer na extensão:** a pasta 📁 abre `%APPDATA%\PokeIdle Multi\rotom`. A cópia original fica
  intocada em `original\<versão>`; os seus ajustes ficam em `patches\*.json` (troca de texto exata num
  arquivo da extensão, veja o `LEIA-ME.txt` da pasta) e são reaplicados a cada importação. Patch que
  não encaixar mais numa versão nova aparece em vermelho (⚠ na 📁) em vez de quebrar em silêncio.

Só a extensão oficial é aceita (o app confere o ID derivado da chave do manifest). O código dela é
carregado como está: não é copiado para o repositório do app.

## Atualização automática

O app procura versão nova no GitHub Releases do repositório em `package.json` →
`atualizacao.repo` (ex.: `murilo/pokeidle-multi`; o repositório precisa ser **público**).
Procura 20 s depois de abrir e a cada 3 h; também dá para clicar na versão (canto de cima). Achou:
baixa o instalador em segundo plano (conferindo o sha256) e aparece **Atualizar para X**. O
clique fecha o app, instala sem telas e abre de novo (uns 20 s). Logins e configurações ficam.

**Publicar uma versão:** escreva o que mudou em `NOVIDADES.md`, suba `version` no
`package.json` (ex.: 0.6.0 → 0.6.1) e dê push no `main`. O GitHub Actions
(`.github/workflows/release.yml`) gera o instalador e cria a Release `v0.6.1` com o .exe em
~3 min (acompanhe na aba Actions). A versão nova tem que ser maior que a instalada.

## Twitch (bônus de XP)

1. O Client ID do app na Twitch já vem no programa (não precisa digitar nada).
2. Em cada quadrado: engrenagem → **Vincular Twitch**. Abre a página da Twitch na sessão daquela
   conta; entre com a Twitch dela e autorize (só leitura de chat).
3. No jogo, a conta precisa estar vinculada à MESMA Twitch (no jogo: Twitch → Vincular).
4. "Entrar sozinho nas lives" ligado: o app entra no chat de todas as lives oficiais no ar que
   dão bônus e sai quando acabam. Clique numa live do overlay para fixá-la.

Status no overlay: **no chat** = o app está conectado ao chat da live; **✓ contando** = o jogo
confirmou que te achou lá (o vigia do jogo passa 1×/min).

Ainda não sabemos se só estar no chat (sem vídeo) faz o jogo contar. Se em alguns minutos
nenhuma live ficar "✓ contando", avise: o plano B é abrir o chat da Twitch numa janelinha.

Tokens ficam cifrados pelo Windows (DPAPI) em `%APPDATA%/PokeIdle Multi/twitch.json`.

## Kick (horas de bônus com pontos do canal)

O bônus da Kick é comprado com os **pontos do canal** de um streamer oficial: cada resgate vale 1 h
de +15% (XP, Captura ou Shiny) e as horas se somam. A Kick dá 10 pontos a cada 5 min para quem
está **logado e assistindo**, e os pontos são de cada canal (só se gastam no mesmo canal).

1. Engrenagem da conta → **Entrar na Kick** (e-mail e senha; o Google não deixa logar em apps).
2. No jogo, a conta precisa estar com a Kick vinculada (Bônus na Kick → Vincular), na MESMA
   conta da Kick.
3. Ícone **K** no cabeçalho → **Farmar pontos**: abre um player da Kick sem som e na qualidade
   mínima em CADA live oficial (com pontos ativos) que estiver no ar, para farmar em todas ao mesmo
   tempo. Abre e fecha sozinho conforme as lives começam e acabam.
4. Para resgatar, abra a live grande (clique no nome dela na doca **Kick**) e resgate na própria Kick.
   O resgate automático saiu: a Kick não aceita resgate feito de fora do site.

**Kick na barra de cima (todas as contas):** Farmar e Player leve ligam ou desligam de
uma vez em todas as contas logadas na Kick. Verde = ligado em todas, meio verde = só em algumas
(o clique liga em todas). O painel K de cada conta continua para ajustar uma só.

O saldo de todos os canais oficiais fica salvo e é atualizado mesmo com o streamer offline (você
pode resgatar pontos de uma live que já acabou). A doca **Kick** embaixo mostra cada live como um
botão com o saldo e um atalho de som (🔇/🔊). **Clique no nome** e aquele MESMO player cresce no
lugar da grade (as contas viram miniaturas ao vivo na tira de baixo): dá para trocar a qualidade,
ligar/desligar o som e resgatar na própria Kick; **Minimizar** (ou Esc) volta com tudo do jeito que
você deixou. Os players começam mudos e na qualidade mínima, e ficam escondidos na doca (o botão ◉
mostra os players pequenos). Se com os players escondidos a Kick parar de dar pontos por 15 min, o
app volta sozinho para players visíveis naquela conta e avisa.

**RAM da Kick:** por padrão o app usa o **player leve** (o player oficial de incorporar da Kick,
`player.kick.com`, só o vídeo, sem chat nem site). Ele também conecta o espectador com o login da
conta, como o site. Players da mesma conta dividem um processo. Se o player leve não contar pontos,
o app troca sozinho para a página completa (dá para trocar na mão em "Player leve" no painel K).

Custo: um vídeo pequeno por live por conta com "Farmar pontos" ligado. Se a Kick mudar o site e algo parar,
o app guarda as últimas respostas em `%APPDATA%\PokeIdle Multi\kick-ultimas-respostas.json`
(sem senha nem token) para diagnosticar.

## Onde caçar (cálculo)

Mesmo modelo da extensão oficial do jogo: fórmulas e catálogo vêm do próprio jogo (baixados quando
ele muda de versão), a geometria de cada hunt é medida nas ondas cheias enquanto você caça (de
todas as contas juntas; no Modo Eco o jogo não manda o campo, então não mede) e o resto usa as
constantes medidas. Com a auto-poção do jogo ligada, só conta como morte o golpe que passa do HP.

## Atualizar a lógica

O app usa o código da extensão (pasta dois níveis acima). Depois de mudar a extensão:

```
npm run sync
```

## Arquivos

- `main.js`: janela, quadrados (WebContentsView com `persist:conta-N`), config por conta.
- `preload-jogo.js`: gerado por `tools/sync.mjs` (inject.js + content scripts da extensão).
- `lib/twitch.js`: login Device Code e chat por IRC WebSocket.
- `lib/rotom.js`: extensão Rotom Sniper (importar do navegador, patches, carregar nas contas, cockpit).
- `lib/atualizar.js`: atualização automática pelo GitHub Releases.
- `lib/jogo.js`: baixa da versão do jogo no ar os módulos `shared/` e os catálogos de espécies
  (em `%APPDATA%\PokeIdle Multi\jogo\<versão>`), servidos à interface em `pie://app/jogo/`.
- `ui/motor/motor.js`: o cálculo do Onde caçar, num Web Worker (modelo igual ao da extensão oficial,
  conferido linha a linha). A geometria das ondas cheias é medida na página do jogo (`page/inject.js`).
- `ui/`: interface. `vendor/`: formatação e regra da troca de mapa.
- `test/`: jogo e Twitch falsos + teste ponta a ponta (`node test/run.mjs`; modos e atualização: `node test/modos.mjs`).

## Som por conta
Menu da engrenagem de cada conta → "Som do jogo" (mudo/ligado) e "Volume". Padrão: mutado. O mudo é do
Chromium; o volume é aplicado dentro da página (`<audio>`/`<video>` e Web Audio). Fica salvo por conta.

## Twitch e Kick (janela única)
Botão **📺 Lives** no topo (ou o ícone da Twitch/Kick no cabeçalho de uma conta, ou "Twitch e Kick…" no menu da engrenagem).
Uma aba por conta, com dois cartões: **Twitch** (vincular/desvincular, "entrar sozinho nas lives", lives oficiais e canais fixos)
e **Kick** (entrar/trocar conta, farmar pontos, player leve, canais com saldo e bônus ativos). Em "Em todas as contas" ficam
os interruptores que valem para todas de uma vez. Os interruptores aplicam na hora (não há rascunho como nas compras).
