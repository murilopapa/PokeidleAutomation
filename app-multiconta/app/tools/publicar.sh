#!/bin/sh
# Gera o instalador e publica uma versão nova no GitHub Releases. Os apps instalados acham
# sozinhos (a cada 3 h, ou no botão da versão no canto de cima) e baixam.
# Antes: suba o número em package.json ("version") e confira "atualizacao.repo".
# Precisa: o mesmo do build-win.sh + GitHub CLI (gh) logado (`gh auth login`).
set -e
cd "$(dirname "$0")/.."
VERSAO=$(node -p "require('./package.json').version")
REPO=$(node -p "require('./package.json').atualizacao.repo")
[ -n "$REPO" ] || { echo "preencha atualizacao.repo no package.json (ex.: murilo/pokeidle-multi)"; exit 1; }
sh tools/build-win.sh
gh release create "v$VERSAO" "dist/PokeIdle-Multi-Instalador-$VERSAO.exe" --repo "$REPO" --title "PokeIdle Multi $VERSAO" --notes "${NOTAS:-Versão $VERSAO}"
echo "publicado: v$VERSAO em $REPO"
