# App multi-conta (até 4 contas) — plano

## Fatos medidos (06/10/2026)
- pokeidle.io responde `X-Frame-Options: DENY` e `frame-ancestors 'none'`: **não dá para pôr o jogo em iframe numa página web**.
- Cada conta precisa de cookie/localStorage próprio. Iframes ou abas do mesmo navegador dividem a sessão.
- Bônus Twitch (código do cliente): "+15% de XP para quem assiste a uma live oficial LOGADO numa conta vinculada, +2,5% por live oficial a mais". Quem acha o jogador é o **vigia do servidor, lendo o chat, 1×/min**. O servidor não vê vídeo.

## Caminho viável: app desktop (Electron)
- Janela única com grade 1–4. Cada slot = uma `WebContentsView` com `partition: "persist:conta-N"` (sessão isolada, login guardado por slot).
- WebContents de topo não sofre `frame-ancestors`. É o jeito de ter "página gigante" com o jogo dentro.
- Lógica da extensão reaproveitada como `preload` de cada slot (`page/inject.js`, `sidepanel/hunts.js`): mesmo ranking, mesma compra, mesma troca.
- Painel central: uma coluna por conta (hunt atual, XP/h, itens, alerta vermelho, chave Automação por conta).
- Twitch leve: view pequena por slot na mesma partition, carregando só o **chat** (`twitch.tv/popout/<canal>/chat`), áudio mudo. Vídeo opcional em 160p.

## Peso
- 4 jogos = 4 processos de renderização. Ordem de 150–300 MB cada (medir).
- Cortes: slots fora de foco com throttle, FPS baixo, áudio mudo, sem vídeo da Twitch.

## Teste antes de construir
1. Logar na Twitch com a conta vinculada, abrir só o chat da live oficial.
2. Ver se a linha Twitch no jogo acende "ativo" em 1–2 min.
Se acender, chat-only vale. Se não, vídeo mudo em baixa qualidade.

## Riscos
- Regra do jogo sobre multi-conta: conferir os termos antes. Cada conta com ações humanas, sem cliques em massa.
- Bônus Twitch por chat sem assistir foge do texto "assiste"; o servidor pode mudar a checagem.

## Etapas
1. Casca Electron + 1 slot com sessão isolada, jogo carrega.
2. 4 slots + grade + persistência de login.
3. Preload com a lógica da extensão + painel por conta.
4. Twitch chat por slot.
5. Empacotar (.exe) para o amigo.

## Decisões de 06/10/2026
Detalhes completos em `RELATORIO.md`: configs por quadrado (bola e poção de 1 tipo com teto e gatilho, troca de mapa), Twitch por IRC WebSocket com JOIN/PART automático, login separado de PokeIdle e Twitch por slot.

## Estado em 06/10/2026: v0.1.0 pronta
- Código em `app/` (Electron 44). Executável: `PokeIdle-Multi-0.1.0-win64.zip` (extrair fora do OneDrive e abrir `PokeIdle Multi.exe`).
- Feito: grade 2×2 com sessões isoladas, expandir/reduzir, barra Bola/Poção/Mapa com overlay, top 3 + personagem, Ligar/Desligar tudo, alerta, RAM, zoom por conta, Twitch (Device Code + IRC, entrar sozinho nas lives com bônus).
- Testado com jogo e Twitch falsos (18/18). Falta testar no jogo de verdade e confirmar se o IRC faz o bônus contar ("✓ contando" no overlay).
- Extensão foi para 0.9.1: o resumo agora inclui o bloco Twitch do jogo (usado pelo app).
