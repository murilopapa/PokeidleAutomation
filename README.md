# PokeIdle Helper

Extensão (Chrome, Edge, Brave, Opera) para o pokeidle.io. Versão 0.9.0.

- **Onde caçar**: mesma conta e mesmos dados da aba Onde caçar do guia (guiapokeidlehardtocapture.site), sem precisar do site aberto.
- **Compra automática** de bolas e itens abaixo de um mínimo.
- **Troca de hunt automática**, só fora de combate, e aviso vermelho quando existe hunt melhor.
- Tudo que age no jogo começa **desligado** (chave geral Automação + cada regra).

## Instalar
1. `chrome://extensions` (Opera: `opera://extensions`) → ligar **Modo do desenvolvedor**.
2. **Carregar sem compactação** → escolher esta pasta (a que tem o `manifest.json`).
3. F5 no pokeidle.io. Clicar no ícone abre o painel (Opera: janelinha).

Depois de mudar arquivos: botão de recarregar da extensão + F5 no jogo.
Para o amigo: mandar `pokeidle-helper-0.9.0.zip` (o `manifest.json` fica na raiz do zip).

## Estrutura
- `page/proto.js` — nomes das mensagens do jogo (olhar aqui primeiro quando o jogo atualizar).
- `page/inject.js` — roda na página: lê o WebSocket, remonta o estado, mede abates/XP, executa regras e trocas de hunt.
- `content/` — ponte com `chrome.storage`, configuração padrão, troca automática.
- `sidepanel/hunts.js` — a conta do guia (simulação de hunts). `sidepanel/sidepanel.*` — painel.
- `data/guia.json` — dados do guia (espécies, hunts, tipos, medidas de campo).
- `data/especies.json` — espécies do jogo (retratos).
- `tools/` — geradores dos dois arquivos de dados.
- `antigo-mvp/` — versões antigas.
- `app-multiconta/` — ideia do app com até 4 contas (ver `PLANO.md`).

## Atualizar dados
- Guia mudou: baixar `data.js` e `geo.js` do site numa pasta e rodar `node tools/build-guia.mjs <pasta>`.
- Jogo mudou: baixar `creatures.json`, `creatures-novos.json`, `creatures-outland-novos.json`, `creatures-audit-overrides.json` de `https://pokeidle.io/assets/` e `golpes-planilhas.mjs`, `outland-sprite-dex.mjs` de `/shared`, e rodar `node tools/build-data.mjs <pasta assets> <pasta shared>`.

## Segurança
- Só envia as mesmas mensagens que os botões do jogo (`shop.buy`, `hunt.select`).
- Teto de ouro por hora e reserva mínima em Ajustes. Compra sem confirmação em 15 s pausa a regra por 10 min.
- Nenhum código do jogo ou do guia é executado: os dados são lidos como texto.

## App multiconta (PokeIdle Multi)

O app de até 4 contas fica em `app-multiconta/app` (veja o README de lá). Os instaladores do
Windows ficam em **Releases** deste repositório, e o app instalado se atualiza sozinho por elas.
