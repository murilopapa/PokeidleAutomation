#!/bin/sh
# Publica uma versão nova: cria a tag vX.Y.Z e envia. O GitHub Actions
# (.github/workflows/release.yml) gera o instalador e cria a Release sozinho.
# Antes: suba "version" no package.json, faça commit e push.
# Uso: sh tools/publicar.sh "o que mudou nesta versão"
set -e
cd "$(dirname "$0")/.."
VERSAO=$(node -p "require('./package.json').version")
git tag -a "v$VERSAO" -m "${1:-Versão $VERSAO}"
git push origin "v$VERSAO"
echo "tag v$VERSAO enviada: acompanhe em Actions; a Release sai em ~3 min"
