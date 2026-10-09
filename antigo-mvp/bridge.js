// Content script isolado: faz a ponte entre a pagina (MAIN world) e o chrome.storage.
const NS = 'PIE';
const storageGet = (k) => new Promise((r) => chrome.storage.local.get(k, r));

async function pushCfg() {
  const { cfg } = await storageGet('cfg');
  window.postMessage({ ns: NS, type: 'cfg', cfg: cfg || { enabled: false, rules: [] } }, '*');
}

window.addEventListener('message', async (e) => {
  const d = e.data;
  if (e.source !== window || !d || d.ns !== NS) return;
  if (d.type === 'hello') pushCfg();
  if (d.type === 'state') chrome.storage.local.set({ snapshot: { ...d.state, at: Date.now() } });
  if (d.type === 'log') {
    const { log = [] } = await storageGet('log');
    log.push(d.msg);
    chrome.storage.local.set({ log: log.slice(-40) });
  }
});

chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.cfg) pushCfg(); });
pushCfg();
