// hunts.js da extensão pede os dados com chrome.runtime.getURL: aqui eles vêm de pie://app/vendor/.
window.chrome = { runtime: { getURL: (p) => '../vendor/' + p, getManifest: () => ({ version: 'app' }) } };
