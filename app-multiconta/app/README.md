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
- **Barra de cima:** aviso vermelho quando alguma conta tem hunt melhor (clique para ver), RAM
  do app, **Ligar tudo** e **Desligar tudo** (a chave "Automação" de todas as contas).
- **Cabeçalho do quadrado:** conta, nível, hunt atual e XP/h. Botão **power**: desliga a conta
  (2 cliques; fecha o jogo dela, libera a RAM e sai do chat da Twitch). Fica lembrado ao reabrir. Contas desligadas saem da grade (as
  outras ganham o espaço) e ficam na barra "Desligadas" embaixo, com o botão Ligar. Ícone da Twitch (passe o mouse:
  lives oficiais abertas e onde você já está). Engrenagem: vincular/desvincular Twitch e
  recarregar o jogo, zoom do jogo (−/+/auto; ou Ctrl + roda do mouse / Ctrl +, Ctrl −, Ctrl 0 dentro do jogo). Botão de expandir (ou duplo clique no cabeçalho; teclas 1–4; Esc volta).
- **Barra de baixo:** Bola, Poção e Mapa. Clique para abrir a config por cima do jogo.
  - Bola / Poção: tipo, "comprar quando abaixo de" e lote por compra.
  - Mapa: seu pokémon em campo e o top 3 de hunts (mesma conta do guia). Ligado, troca sempre
    para o 1º lugar, risco alto (Segura ou Tranquila), só fora de combate.
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
  conta (hunt, XP/h, automação). É o mais leve: quase nada de placa de vídeo. Tudo continua
  rodando por trás; "Ver os jogos (Eco)" volta.

O modo fica salvo e é reaplicado quando uma conta abre ou recarrega. Enquanto você não escolher
nenhum, o app não mexe no Modo Economia de ninguém. Dá para mudar à mão numa conta: o app só
reaplica ao recarregar ou ao trocar de modo.

## Atualização automática

O app procura versão nova no GitHub Releases do repositório em `package.json` →
`atualizacao.repo` (ex.: `murilo/pokeidle-multi`; o repositório precisa ser **público**).
Procura 20 s depois de abrir e a cada 3 h; também dá para clicar na versão (canto de cima). Achou:
baixa o instalador em segundo plano (conferindo o sha256) e aparece **Atualizar para X**. O
clique fecha o app, instala sem telas e abre de novo (uns 20 s). Logins e configurações ficam.

**Publicar uma versão:** suba `version` no `package.json`, faça commit e push, e rode
`sh tools/publicar.sh "o que mudou"` (ou crie a tag `vX.Y.Z` no GitHub). O GitHub Actions
(`.github/workflows/release.yml`) gera o instalador e cria a Release com o .exe em ~3 min.
A tag tem que ser maior que a versão instalada.

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
4. **Resgatar sozinho** + o tipo de bônus: assim que algum canal tiver pontos para o resgate, o app
   resgata (um por vez). Para resgatar na mão, abra a live grande e resgate na própria Kick.

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

## Atualizar a lógica

O app usa o código da extensão (pasta dois níveis acima). Depois de mudar a extensão:

```
npm run sync
```

## Arquivos

- `main.js`: janela, quadrados (WebContentsView com `persist:conta-N`), config por conta.
- `preload-jogo.js`: gerado por `tools/sync.mjs` (inject.js + content scripts da extensão).
- `lib/twitch.js`: login Device Code e chat por IRC WebSocket.
- `lib/atualizar.js`: atualização automática pelo GitHub Releases.
- `ui/`: interface. `vendor/`: cópia do cálculo e dos dados do guia.
- `test/`: jogo e Twitch falsos + teste ponta a ponta (`node test/run.mjs`; modos e atualização: `node test/modos.mjs`).
