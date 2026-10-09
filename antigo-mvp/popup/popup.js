const $ = (s) => document.querySelector(s);
let cfg = { enabled: false, rules: [] };
let items = [];            // [{id,name}]
let byName = new Map();
let snapshot = null;

const save = () => chrome.storage.local.set({ cfg });

async function loadItems() {
  try {
    const j = await fetch('https://pokeidle.io/assets/items.json').then((r) => r.json());
    items = (j.items || []).map((i) => ({ id: i.id, name: i.name, cat: i.category }));
    const dl = $('#itemlist');
    items.forEach((i) => { const o = document.createElement('option'); o.value = i.name; dl.appendChild(o); byName.set(i.name.toLowerCase(), i.id); });
  } catch (e) { $('#status').textContent = 'Nao consegui carregar items.json'; }
}
const nameOf = (id) => (items.find((i) => i.id == id) || {}).name || '';

function render() {
  $('#enabled').checked = !!cfg.enabled;
  const tb = $('#rules'); tb.innerHTML = '';
  cfg.rules.forEach((r, idx) => {
    const tr = document.createElement('tr');
    const have = snapshot && snapshot.items ? (snapshot.items[r.itemId] || 0) : '-';
    tr.innerHTML = `<td><input list="itemlist" value="${nameOf(r.itemId)}" data-k="name"></td><td>${have}</td>
      <td><input type="number" min="0" value="${r.min}" data-k="min"></td><td><input type="number" min="1" value="${r.buyTo}" data-k="buyTo"></td>
      <td><input type="checkbox" ${r.enabled ? 'checked' : ''} data-k="enabled"> <button data-k="del">x</button></td>`;
    tr.querySelectorAll('[data-k]').forEach((el) => {
      el.addEventListener(el.dataset.k === 'del' ? 'click' : 'change', () => {
        const k = el.dataset.k;
        if (k === 'del') cfg.rules.splice(idx, 1);
        else if (k === 'name') { const id = byName.get(el.value.trim().toLowerCase()); r.itemId = id || null; }
        else if (k === 'enabled') r.enabled = el.checked;
        else r[k] = Number(el.value);
        save(); render();
      });
    });
    tb.appendChild(tr);
  });
}

function renderStatus() {
  const s = snapshot;
  $('#status').textContent = !s ? 'Abra o pokeidle.io (recarregue a aba apos instalar).'
    : `${s.connected ? 'conectado' : 'desconectado'} | inventario ${s.ready ? 'lido' : 'aguardando'} | atualizado ${Math.round((Date.now() - s.at) / 1000)}s atras`;
}

$('#enabled').addEventListener('change', (e) => { cfg.enabled = e.target.checked; save(); });
$('#add').addEventListener('click', () => { cfg.rules.push({ itemId: null, min: 10, buyTo: 50, maxPerBuy: 100, enabled: false }); save(); render(); });

chrome.storage.onChanged.addListener((c) => {
  if (c.snapshot) { snapshot = c.snapshot.newValue; renderStatus(); render(); }
  if (c.log) $('#log').textContent = (c.log.newValue || []).join('\n');
});

(async () => {
  await loadItems();
  const d = await chrome.storage.local.get(['cfg', 'snapshot', 'log']);
  cfg = d.cfg || cfg; snapshot = d.snapshot || null;
  $('#log').textContent = (d.log || []).join('\n');
  render(); renderStatus();
})();
