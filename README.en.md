[Português](README.md) · **English**

# PokeIdle Helper

Browser extension (Chrome, Edge, Brave, Opera) for pokeidle.io. Version 0.9.6.

- **Where to hunt**: same account and same data as the guide's "Onde caçar" (Where to hunt) tab (guiapokeidlehardtocapture.site), without keeping the site open.
- **Auto-buy** of balls and items when they drop below a minimum.
- **Automatic hunt switching**, only out of combat, plus a red warning when a better hunt exists.
- Everything that acts on the game starts **off** (master Automation switch + each individual rule).

## Install
1. `chrome://extensions` (Opera: `opera://extensions`) → turn on **Developer mode**.
2. **Load unpacked** → pick this folder (the one with `manifest.json`).
3. Press F5 on pokeidle.io. Clicking the icon opens the panel (Opera: a small window).

After changing files: hit the extension's reload button + F5 in the game.
To share with a friend: send `pokeidle-helper-<version>.zip` (`manifest.json` sits at the root of the zip).

## Layout
- `page/proto.js` — game message names (look here first when the game updates).
- `page/inject.js` — runs in the page: reads the WebSocket, rebuilds the state, measures kills/XP, runs rules and hunt switches.
- `content/` — bridge to `chrome.storage`, default settings, automatic switching.
- `sidepanel/hunts.js` — the guide's math (hunt simulation). `sidepanel/sidepanel.*` — the panel.
- `data/guia.json` — guide data (species, hunts, types, field measurements).
- `data/especies.json` — game species (portraits).
- `tools/` — generators for the two data files.
- `antigo-mvp/` — old versions.
- `app-multiconta/` — the app with up to 4 accounts (see `PLANO.md`).

## Updating data
- Guide changed: download `data.js` and `geo.js` from the site into a folder and run `node tools/build-guia.mjs <folder>`.
- Game changed: download `creatures.json`, `creatures-novos.json`, `creatures-outland-novos.json`, `creatures-audit-overrides.json` from `https://pokeidle.io/assets/` and `golpes-planilhas.mjs`, `outland-sprite-dex.mjs` from `/shared`, then run `node tools/build-data.mjs <assets folder> <shared folder>`.

## Safety
- Only sends the same messages as the game's own buttons (`shop.buy`, `hunt.select`).
- Gold-per-hour cap and minimum reserve in Settings. A purchase not confirmed within 15 s pauses the rule for 10 min.
- No game or guide code is executed: the data is read as text.

## Multi-account app (PokeIdle Multi)

The app for up to 4 accounts lives in `app-multiconta/app` (see its README). Windows installers are published under **Releases** in this repository, and the installed app updates itself from them.
