// Clicar no ícone da extensão abre o painel.
// Chrome, Edge e Brave têm painel lateral (chrome.sidePanel). Opera e outros navegadores sem essa
// API abrem o mesmo painel numa janelinha à parte.
const temPainelLateral = !!(chrome.sidePanel && chrome.sidePanel.setPanelBehavior);

function configurar() {
  if (temPainelLateral) chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}
chrome.runtime.onInstalled.addListener(configurar);
chrome.runtime.onStartup.addListener(configurar);

if (!temPainelLateral) {
  let janelaId = null;
  chrome.action.onClicked.addListener(async () => {
    if (janelaId != null) {
      try { await chrome.windows.update(janelaId, { focused: true }); return; } catch (_) { janelaId = null; }
    }
    const w = await chrome.windows.create({ url: chrome.runtime.getURL('sidepanel/sidepanel.html'), type: 'popup', width: 440, height: 860 });
    janelaId = w.id;
  });
  chrome.windows.onRemoved.addListener((id) => { if (id === janelaId) janelaId = null; });
}
