// Formatação e leitura do resumo, compartilhado entre overlay e painel lateral.
var PieFmt = {
  num(n) {
    n = Number(n) || 0;
    return n.toLocaleString('pt-BR');
  },
  curto(n) {
    n = Number(n) || 0;
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + 'M';
    if (Math.abs(n) >= 1e4) return Math.round(n / 1e3) + 'k';
    return n.toLocaleString('pt-BR');
  },
  // Quanto tempo o estoque dura no ritmo atual.
  duracao(tem, porHora) {
    if (!porHora) return '';
    const h = tem / porHora;
    if (h >= 48) return Math.round(h / 24) + ' dias';
    if (h >= 1) {
      const hh = Math.floor(h);
      const mm = Math.round((h - hh) * 60);
      return hh + 'h' + (mm ? String(mm).padStart(2, '0') : '');
    }
    return Math.max(1, Math.round(h * 60)) + ' min';
  },
  ha(ts) {
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return s + 's';
    if (s < 3600) return Math.round(s / 60) + ' min';
    return Math.round(s / 3600) + 'h';
  },
  hunt(catalog, slug) {
    if (!slug) return null;
    return (catalog?.hunts ?? []).find((h) => h.slug === slug) ?? { slug, nome: slug };
  },
  nomeBola(catalog, id) {
    return (catalog?.bolas ?? []).find((b) => b.id === Number(id))?.nome ?? 'Ball #' + id;
  },
  item(catalog, id) {
    return catalog?.items?.[id] ?? null;
  },
  // Linhas de pokébolas que você tem (ou que têm regra), com ritmo e duração.
  bolas(snap, catalog) {
    const uso = snap?.uso?.porHora ?? {};
    const out = [];
    for (const [id, q] of Object.entries(snap?.balls ?? {})) {
      if (!(q > 0)) continue;
      out.push({ id: Number(id), nome: PieFmt.nomeBola(catalog, id), q, porHora: uso['ball:' + id] ?? 0 });
    }
    return out.sort((a, b) => b.q - a.q);
  },
  // Itens de cura e revive.
  cura(snap, catalog) {
    const uso = snap?.uso?.porHora ?? {};
    const out = [];
    for (const [id, q] of Object.entries(snap?.items ?? {})) {
      const it = PieFmt.item(catalog, id);
      if (!(q > 0) || !it || (it.category !== 'heal' && it.category !== 'revive')) continue;
      out.push({ id: Number(id), nome: it.name, cat: it.category, q, porHora: uso['item:' + id] ?? 0 });
    }
    return out.sort((a, b) => (a.cat === b.cat ? b.q - a.q : a.cat === 'heal' ? -1 : 1));
  },
};
