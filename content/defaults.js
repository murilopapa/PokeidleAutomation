// Configuração padrão: tudo que age no jogo começa DESLIGADO.
// Usado pelo content script e pelo painel lateral.
var PIE_DEFAULT_CFG = {
  enabled: false, // chave geral da automação
  rules: [],      // { id, kind: 'item'|'ball', refId, label, min, qty, enabled:false }
                  // quando tiver MENOS de `min`, compra `qty` unidades
  limits: {
    goldPerHour: 10000, // teto de gasto por hora (0 = sem teto)
    goldReserve: 0,     // nunca deixar o ouro abaixo disto
  },
  // Troca de hunt automática: só age com a chave geral E esta ligadas.
  autoHunt: {
    enabled: false,
    criterio: 'pk',   // 'pk' (XP do pokémon) | 'tr' (XP do treinador) | 'ouro'
    riscoMax: 'alto', // 'baixo' = só Tranquila (≥20 kills/vida) | 'alto' = Segura (≥5, como o guia)
    ganhoMin: 0,      // 0 = troca sempre que o 1º lugar mudar; X = só se render X% a mais
  },
  // Sniper do Mercado (itens): compra anúncio X% abaixo da média vendida em 7 dias.
  sniper: {
    enabled: false,
    modo: 'simular',               // 'simular' (só anota) | 'comprar' (precisa da chave geral também)
    versao: 2,
    alvos: ['boss', 'chave', 'bike'], // Boss Token, Key Fragment (chave), Bicycle Fragment (bike)
    desconto: 30,                  // % abaixo do preço de referência
    amostras: 4,                   // referência = mediana das últimas N vendas e dos N outros anúncios mais baratos (a menor)
    reservaGold: 0,                // nunca deixar os Coins abaixo disto
    moedas: {
      orb: { on: true, tetoDia: 100 },      // Gemas (dinheiro de verdade): teto de gasto em 24 h
      gold: { on: false, tetoDia: 1000000 },
    },
  },
};

function pieMergeCfg(saved) {
  const d = JSON.parse(JSON.stringify(PIE_DEFAULT_CFG));
  if (!saved) return d;
  return {
    ...d,
    ...saved,
    limits: { ...d.limits, ...(saved.limits || {}) },
    // sniper da versão 1 (categorias, foco em Coins): vira o da versão 2 (3 alvos, foco em Gemas), mantendo ligado/modo/%.
    sniper: saved.sniper?.versao === 2
      ? { ...d.sniper, ...saved.sniper, moedas: { gold: { ...d.sniper.moedas.gold, ...(saved.sniper.moedas?.gold || {}) }, orb: { ...d.sniper.moedas.orb, ...(saved.sniper.moedas?.orb || {}) } } }
      : { ...d.sniper, ...(saved.sniper ? { enabled: !!saved.sniper.enabled, modo: saved.sniper.modo === 'comprar' ? 'comprar' : 'simular', desconto: saved.sniper.desconto ?? d.sniper.desconto, amostras: saved.sniper.amostras ?? d.sniper.amostras } : {}) },
    autoHunt: { ...d.autoHunt, ...(saved.autoHunt || {}), ...(saved.autoHunt?.riscoMax === 'médio' ? { riscoMax: 'alto' } : {}) },
    // regras antigas (min / buyTo / maxPerBuy) viram (min / qty)
    rules: Array.isArray(saved.rules)
      ? saved.rules.map((r) => (r.qty != null ? r : { ...r, qty: Math.max(1, Math.min(r.maxPerBuy || 100, (r.buyTo || r.min) - r.min) || 50) }))
      : [],
  };
}
