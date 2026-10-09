// Player da Kick dentro do app.
// - Qualidade mínima ao abrir (o site guarda a escolha em sessionStorage "stream_quality" = altura).
//   Depois você pode trocar a qualidade pelo próprio player da Kick quando abrir ele grande.
// - Começa mudo. O som é da própria página: o botão de som da Kick funciona, e o atalho 🔇/🔊 da
//   doca do app liga/desliga o som de todos os vídeos desta live.
const { ipcRenderer } = require('electron');
try { sessionStorage.setItem('stream_quality', '160'); } catch (_) { /* ok */ }
let som = false;
const aplicar = (v) => { if (!v.__pie) { v.__pie = true; v.muted = !som; } };
const varrer = () => document.querySelectorAll('video').forEach(aplicar);
new MutationObserver(varrer).observe(document, { childList: true, subtree: true });
ipcRenderer.on('kk:som', (_e, ligar) => {
  som = !!ligar;
  document.querySelectorAll('video').forEach((v) => { v.muted = !som; if (som && !v.volume) v.volume = 0.5; });
});
