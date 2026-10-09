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
};

function pieMergeCfg(saved) {
  const d = JSON.parse(JSON.stringify(PIE_DEFAULT_CFG));
  if (!saved) return d;
  return {
    ...d,
    ...saved,
    limits: { ...d.limits, ...(saved.limits || {}) },
    autoHunt: { ...d.autoHunt, ...(saved.autoHunt || {}), ...(saved.autoHunt?.riscoMax === 'médio' ? { riscoMax: 'alto' } : {}) },
    // regras antigas (min / buyTo / maxPerBuy) viram (min / qty)
    rules: Array.isArray(saved.rules)
      ? saved.rules.map((r) => (r.qty != null ? r : { ...r, qty: Math.max(1, Math.min(r.maxPerBuy || 100, (r.buyTo || r.min) - r.min) || 50) }))
      : [],
  };
}
