// Tudo que depende do protocolo do jogo fica AQUI. Quando o jogo mudar de versão e algo
// quebrar, este é o primeiro arquivo a conferir.
// Mapeado no cliente v1.230.1 (out/2026).
window.__PIE_PROTO = {
  // Módulo oficial que remonta o estado que chega em delta. Não dá para importá-lo daqui (a CSP
  // do jogo bloqueia scripts sem nonce), então inject.js usa uma cópia e só confere se o
  // original mudou, comparando este hash.
  deltaModule: '/shared/estado-delta.mjs',
  deltaModuleHash: '6deba436',
  itemsUrl: '/assets/items.json',

  // Servidor -> cliente
  in: {
    welcome: 'welcome', // { estado (cheio), hunts, catalogoBolas, itensCompraveis, captura, chanceShiny, ... }
    estado: 'estado',   // { estado (delta) }
    batalha: 'batalha', // { ev: [{ k: 'ataque' | 'hunt' (trocaLivreEm) | ... }] }
    campoInit: 'campo.init', // { slug, heroi: {c, r}, mobs: [...], centro, pvp, casa } — entrada num mapa
    campo: 'campo',          // { heroi, mobs: [{ s slot, c, r, x morto }], fora: [slots] }
  },

  // Cliente -> servidor (mesmas mensagens que os botões da interface enviam)
  out: {
    buyItem: (id, qty) => ({ t: 'shop.buy', kind: 'item', id, qty }),
    buyBall: (id, qty) => ({ t: 'shop.buy', kind: 'ball', id, qty }),
    selectHunt: (slug) => ({ t: 'hunt.select', slug }),
  },
};
