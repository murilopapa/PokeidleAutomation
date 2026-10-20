// View transparente por cima de um quadrado do jogo: mostra o menu aberto e devolve os cliques
// para a interface principal (que é quem decide o que fazer).
'use strict';
const box = document.getElementById('ov');
let pendente = null;
const CLASSE = { pop: 'pop ov-pop', menu: 'menu on ov-menu', panel: 'panel on ov-panel' };
let arrasto = false;
function aplicar(c) {
  arrasto = c?.kind === 'drag';
  document.documentElement.style.cursor = arrasto ? c.cursor : '';
  if (!c || arrasto) { box.innerHTML = ''; return; }
  const ativo = document.activeElement;
  // não redesenha enquanto você digita num campo do menu
  if (ativo && box.contains(ativo) && ativo.matches('input,select')) { pendente = c; return; }
  pendente = null;
  const html = `<div class="${CLASSE[c.kind] || ''}" data-ovbox>${c.html}</div>`;
  if (box.innerHTML !== html) box.innerHTML = html;
}
ov.onConteudo(aplicar);
document.addEventListener('focusout', () => setTimeout(() => { if (pendente) aplicar(pendente); }, 0));

const ALVOS = '[data-somm],[data-rotabrir],[data-kklogin],[data-kkres],[data-am],[data-gear],[data-link],[data-unlink],[data-cid],[data-reload],[data-fechar],[data-twcanal],[data-zoom]';
function campos() {
  const out = {};
  box.querySelectorAll('input[id]').forEach((e) => { out[e.id] = e.value; });
  return out;
}
document.addEventListener('click', (e) => {
  if (arrasto) return;
  const t = e.target.closest(ALVOS);
  if (t) { ov.evento({ tipo: 'click', d: { ...t.dataset }, id: t.id, campos: campos() }); return; }
  if (!e.target.closest('[data-ovbox]')) ov.evento({ tipo: 'fora' });
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (!t.dataset) return;
  ov.evento({ tipo: 'change', d: { ...t.dataset }, value: t.value, checked: !!t.checked });
  if (t.matches('input[type=number]')) t.blur();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') ov.evento({ tipo: 'esc' });
  else if (e.key === 'Enter' && e.target.matches('input')) e.target.blur();
});
let dentro = false;
document.addEventListener('mousemove', (e) => {
  const d = !!e.target.closest('[data-ovbox]');
  if (d !== dentro) { dentro = d; ov.evento({ tipo: d ? 'enter' : 'leave' }); }
});
document.addEventListener('mouseleave', () => { if (dentro) { dentro = false; ov.evento({ tipo: 'leave' }); } });

// enquanto arrasta uma divisória da grade, o overlay cobre a janela e repassa o movimento
document.addEventListener('pointermove', (e) => { if (arrasto) ov.evento({ tipo: 'drag-move', x: e.clientX, y: e.clientY }); });
document.addEventListener('pointerup', (e) => { if (arrasto) ov.evento({ tipo: 'drag-fim', x: e.clientX, y: e.clientY }); });
