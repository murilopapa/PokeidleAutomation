# PokeIdle Multi — relatório de projeto

Data: 06/10/2026. Estado: decisões fechadas com o Murilo, pronto para começar a etapa 1.
Documento irmão: `PLANO.md` (fatos medidos e etapas curtas). Este relatório detalha o produto, a tela, as configurações por conta, a Twitch e o login.

## 1. O que é

Um app de desktop (Electron) que mostra o pokeidle.io em vários quadrados na mesma janela, cada quadrado com uma conta diferente e sessão totalmente separada. Cada quadrado tem suas próprias configurações de automação (compra de bola, compra de poção, troca automática de mapa) e sua própria presença na Twitch para o bônus de XP. A lógica de ranking de hunts é a mesma da extensão, que já está idêntica ao guia.

Por que app e não página: o jogo envia `X-Frame-Options: DENY` e `frame-ancestors 'none'`, então não abre em iframe. Dentro do Electron cada quadrado é uma janela de topo embutida, e isso é permitido.

## 2. Limite de contas e tamanho da grade

O Murilo confirmou que o jogo permite até 4 contas por IP. A grade padrão é 2×2 (4 quadrados). Ele falou em "4x4"; se a intenção for 16 contas, isso passa do limite do jogo por IP e, além disso, 16 renderizadores de jogo não cabem em RAM razoável. Decisão deste plano: o número de quadrados é uma constante (`MAX_SLOTS = 4`) e a grade se ajusta (1, 2, 3 ou 4 contas usam 1×1, 1×2, 2×2). Mudar a constante depois custa pouco, se o jogo mudar a regra.

Dimensionamento exato (tamanho mínimo do quadrado, proporção do jogo) fica para depois, como combinado. A grade usa frações da janela, então já nasce redimensionável.

## 3. Tela

### 3.1 Estrutura

- Barra superior global, fina: nome do app, botões "Pausar tudo", "Retomar", "Aplicar config da conta 1 nas outras", indicador de RAM total, alerta global.
- Grade de quadrados. Cada quadrado = faixa de cabeçalho + jogo.
- Painel de configuração: abre deslizando pela lateral do quadrado, só daquela conta. Fecha com um clique fora.

### 3.2 Expandir e reduzir

Botão de expandir no cabeçalho de cada quadrado (e duplo clique no cabeçalho). O quadrado ocupa a grade inteira e os outros ficam congelados em segundo plano (throttle, sem pintura), com uma tira de miniaturas embaixo para trocar de conta. O mesmo botão reduz de volta. Atalhos: 1–4 para expandir a conta, Esc para voltar.

### 3.3 Cabeçalho do quadrado

Da esquerda para a direita:

1. Ponto de estado: verde = caçando, amarelo = em combate, cinza = parado, vermelho = alerta (hunt melhor existe) ou desconectado.
2. Nome do personagem e nível.
3. Hunt atual e XP/h (do ranking da extensão).
4. Ícone da Twitch com contador. Passar o mouse abre um overlay pequeno com as lives oficiais abertas no momento (ver seção 6).
5. Engrenagem (config), expandir.

### 3.4 Visual

Escuro, com amarelo pixel como acento, igual à extensão. Regras para não ficar feio: no máximo duas famílias de cor além do amarelo, só para estado; cabeçalho de 32 px; tipografia única; ícones em vez de texto; nada de tabela dentro do cabeçalho; painéis com cantos arredondados e sombra leve; transições curtas (150 ms). Um protótipo em HTML estático da grade vem antes de qualquer código Electron, para o Murilo aprovar o visual.

## 4. Configurações por quadrado

Cada conta tem seu próprio conjunto, guardado por slot (não global). Tudo vem desligado por padrão, como nas automações da extensão.

### 4.1 Compra de pokébola (um tipo por enquanto)

- Chave liga/desliga.
- Tipo de bola: um só, escolhido numa lista.
- Teto: quanto quer ter no estoque (exemplo do Murilo: 500).
- Gatilho: quando o estoque cair abaixo de um limite (campo próprio), compra até voltar ao teto.
- Tamanho do lote por compra e intervalo mínimo entre compras, para parecer ação humana.
- Reserva de ouro: nunca gasta abaixo desse valor.

### 4.2 Compra de poção (um tipo por enquanto)

Mesma forma da bola: liga/desliga, tipo único, teto, gatilho, lote, intervalo, reserva de ouro. Suporte a vários tipos fica para uma versão futura, a estrutura de dados já guarda uma lista com um item para não precisar migrar depois.

### 4.3 Troca automática de mapa

- Chave liga/desliga.
- Só troca fora de combate (regra já existente na extensão).
- Quão arriscado aceita: baixo = só "Tranquila"; alto = "Segura" também (mesmo critério do guia).
- Alerta vermelho quando existe hunt melhor, mesmo com a troca desligada.

### 4.4 Chave geral da conta

Um interruptor que desliga todas as automações da conta de uma vez, e um botão "copiar config para…" para espalhar a config de uma conta para as outras.

### 4.5 Armazenamento

Config em arquivo JSON por slot na pasta de dados do app. Nada de segredo nesse arquivo (tokens vão no cofre do sistema, seção 7).

## 5. Isolamento de sessão

Cada quadrado é uma `WebContentsView` com `partition: "persist:conta-N"`. Cookies, localStorage e cache ficam separados e persistem entre aberturas. O Twitch de cada conta vive na mesma partição, então a conta do jogo e a conta da Twitch ficam juntas. Cada slot recebe o mesmo `preload` que injeta a lógica da extensão (`page/inject.js`, `sidepanel/hunts.js`) e conversa com o painel por IPC.

## 6. Twitch: IRC por WebSocket

### 6.1 Método

Conexão `wss://irc-ws.chat.twitch.tv:443`. Sequência: `PASS oauth:<token>`, `NICK <login>`, `CAP REQ :twitch.tv/commands twitch.tv/tags twitch.tv/membership`, `JOIN #canal`. Responder `PING :tmi.twitch.tv` com `PONG :tmi.twitch.tv`. Escopo do token: `chat:read` (só ler; não precisa de `chat:edit`). Uma única conexão por conta pode dar `JOIN #a,#b,#c` para várias lives. É a opção mais leve: sem vídeo, sem página, poucos KB de memória, e roda no processo principal, sem renderizador extra.

O modo anônimo (`justinfan`) não serve: não é a conta vinculada ao jogo.

### 6.2 Como o bônus funciona no jogo

Pelo código do cliente: +15% de XP (pokémon e treinador) para quem assiste a uma live oficial logado numa conta Twitch vinculada, +2,5% por live oficial extra aberta ao mesmo tempo. O servidor tem um "vigia" que lê o chat uma vez por minuto; ele não vê vídeo.

### 6.3 Pergunta aberta (decide tudo)

Não está documentado se o vigia enxerga quem está apenas conectado no IRC ou só quem de fato aparece como espectador. O teste de 2 minutos resolve:

1. Gerar o token da conta vinculada.
2. Conectar por IRC e dar JOIN na live oficial, sem abrir vídeo nem página.
3. Esperar 1–2 minutos e olhar o snapshot do jogo: `twitch.assistindo`, `pctAtual`, `assistindoEm`.

Resultado acende: método aprovado, bônus quase de graça. Resultado não acende: plano B é uma view pequena só com o chat (`twitch.tv/popout/<canal>/chat`) na partição da conta; plano C é vídeo mudo em 160p. O teste vem antes do app, como script solto.

### 6.4 Quais lives estão abertas e automação do join

O próprio snapshot do jogo traz `twitch.oficiais[{login, bonus}]` e `lives[]`, ou seja, a lista de lives oficiais e quais estão ao vivo. O preload lê isso e entrega ao app. Com isso:

- Overlay no cabeçalho: ao passar o mouse no ícone da Twitch, lista as lives oficiais abertas, com bônus de cada uma e se a conta já está dentro.
- Modo manual: o usuário marca/desmarca canais na lista; o app dá JOIN/PART.
- Modo automático (chave por conta): o app dá JOIN em todas as lives oficiais que aparecerem ao vivo e PART quando terminarem. Não precisa abrir aba nova nem fechar nada: é só um comando no IRC.
- Limite configurável de lives simultâneas por conta (por padrão todas as oficiais; mais lives = mais bônus, mas o app avisa quando o jogo não soma mais).

## 7. Login

Cada quadrado tem um estado "sem sessão" com dois botões grandes, separados:

1. **Entrar no PokeIdle**: carrega a tela de login do jogo dentro da partição do slot. O usuário digita; o app nunca vê nem guarda a senha, só os cookies da partição (persistem).
2. **Conectar Twitch**: abre o fluxo de autorização da Twitch na mesma partição para o usuário logar e autorizar o escopo `chat:read`. O app recebe o token e guarda no cofre do sistema (`safeStorage` do Electron), nunca em texto puro.

Pendências do fluxo Twitch, a conferir na documentação antes de codar: o app precisa de um Client ID (registro gratuito em dev.twitch.tv, com tipo público); decidir entre implicit grant e device code (preferência: device code, pois não precisa de servidor de redirecionamento); validar o token na abertura e renovar/pedir login de novo quando expirar. O app mostra no cabeçalho um aviso discreto "Twitch desconectada" quando isso acontecer.

Regra do projeto: o app nunca digita senha nem token por conta própria em formulário; o usuário faz o login.

## 8. Peso

Quatro jogos = quatro renderizadores. Estimativa de 150–300 MB cada, a medir. Cortes planejados: quadrados fora de foco com throttle de FPS, áudio mudo, sem vídeo da Twitch (IRC fica no processo principal), indicador de RAM na barra superior para o Murilo enxergar o custo real.

## 9. Riscos

- Termos do jogo: 4 contas por IP está liberado, conforme o Murilo. Manter ações com intervalo e lote humano, sem cliques em massa.
- Bônus Twitch por IRC pode não contar (seção 6.3) ou o servidor pode mudar a checagem no futuro.
- O jogo pode mudar o formato do snapshot (campos `twitch.*`): isolar a leitura em um módulo só, com teste.
- Token Twitch expira: tratar com aviso e novo login.

## 10. Etapas

0. Teste do IRC em 2 minutos (script solto) e protótipo visual estático da grade.
1. Casca Electron com 1 slot isolado, jogo carregando, tela de login.
2. 4 slots, grade 2×2, expandir/reduzir, persistência de login por slot.
3. Preload com a lógica da extensão e painel de configuração por conta (bola, poção, mapa).
4. Twitch: login, IRC com JOIN/PART, overlay de lives, modo automático.
5. Medir RAM, ajustar throttle, empacotar (.exe) para o amigo.

## 11. Fontes

- Twitch, chat via IRC: https://dev.twitch.tv/docs/chat/irc/
- Electron, WebContentsView: https://www.electronjs.org/docs/latest/api/web-contents-view
