#!/bin/sh
# Gera o executável e o instalador do Windows (roda em Linux ou WSL).
# Precisa: node, @electron/packager (npx baixa), makensis (pacote "nsis").
set -e
cd "$(dirname "$0")/.."
VERSAO=$(node -p "require('./package.json').version")
node tools/sync.mjs
npx --yes @electron/packager@18 . "PokeIdle Multi" --platform=win32 --arch=x64 --electron-version=44.5.1 \
  --out=dist --overwrite --ignore="^/test" --ignore="^/tools" --ignore="^/dist"
# caminhos absolutos: o makensis roda a partir da pasta tools/
makensis -DVERSAO="$VERSAO" -DORIGEM="$PWD/dist/PokeIdle Multi-win32-x64" -DSAIDA="$PWD/dist/PokeIdle-Multi-Instalador-$VERSAO.exe" tools/instalador.nsi
echo "pronto: dist/PokeIdle-Multi-Instalador-$VERSAO.exe"
