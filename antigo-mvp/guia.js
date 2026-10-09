// Content script no guia (guiapokeidlehardtocapture.site): usa o "Onde caçar" do próprio site
// como tabela verdade. Recebe a ficha do pokémon, cola no campo "Ctrl+V aqui" do site (o mesmo
// que você faria à mão), deixa o site calcular e devolve as linhas da tabela.
(() => {
  const $ = (s) => document.querySelector(s);

  // "24.9 M" / "878.2 k" / "509" → número
  function lerFmt(txt) {
    const m = String(txt || '').match(/([\d.,]+)\s*([kMB])?/);
    if (!m) return 0;
    const n = parseFloat(m[1].replace(',', '.'));
    return Math.round(n * ({ k: 1e3, M: 1e6, B: 1e9 }[m[2]] || 1));
  }
  const lerInteiro = (txt) => Number(String(txt || '').replace(/\D/g, '')) || 0;

  function lerTabela() {
    const tb = $('#tab-hunts')?.tBodies?.[0];
    if (!tb) return [];
    return [...tb.rows].map((r) => {
      const c = r.cells;
      if (c.length < 10) return null;
      const xp = c[8].innerText;
      return {
        nome: c[0].querySelector('b.pk-nome')?.textContent.trim() || c[0].innerText.split('\n')[0].trim(),
        nv: lerInteiro(c[1].innerText),
        xpPk: lerFmt((xp.match(/🐲\s*([\d.,]+\s*[kMB]?)/) || [])[1]),
        xpTr: lerFmt((xp.match(/🧑\s*([\d.,]+\s*[kMB]?)/) || [])[1]),
        kills: lerFmt((xp.match(/([\d.,]+)\s*kills\/h/) || [])[1]),
        ouro: lerFmt(c[9].querySelector('b')?.textContent),
      };
    }).filter(Boolean);
  }

  async function calcular({ ficha, nivelTreinador, tm, aoe }) {
    if (!$('#in-colar') || !$('#btn-colar') || !$('#tab-hunts')) return { erro: 'O guia ainda não carregou.' };
    const tr = $('#in-nivel-treinador');
    if (tr && nivelTreinador) tr.value = nivelTreinador;
    if (tm != null && $('#in-tm')) $('#in-tm').checked = !!tm;
    if (aoe != null && $('#in-aoe')) $('#in-aoe').checked = !!aoe;
    const ordem = $('#f-ordem');
    if (ordem && [...ordem.options].some((o) => o.value === 'xp')) ordem.value = 'xp';
    const area = $('#f-area');
    if (area) area.value = '';
    const busca = $('#f-busca');
    if (busca) busca.value = '';
    $('#in-colar').value = ficha;
    $('#btn-colar').click(); // o site importa a ficha e recalcula a tabela
    await new Promise((r) => setTimeout(r, 30));
    const aviso = $('#colar-msg')?.innerText?.trim() || '';
    return { linhas: lerTabela(), aviso, em: Date.now() };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
    if (msg?.type !== 'guia-calc') return;
    calcular(msg).then(responder, (e) => responder({ erro: String(e?.message || e) }));
    return true;
  });
})();
