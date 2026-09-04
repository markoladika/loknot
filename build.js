#!/usr/bin/env node
// Builds: dist/bookmarklet.txt, dist/install.html, dist/loknot.user.js,
//         dist/extension-chrome/, dist/extension-firefox/ (+ a .zip of each)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const dir = __dirname, dist = path.join(dir, 'dist');
const VERSION = '1.3.3';
const src = fs.readFileSync(path.join(dir, 'loknot.js'), 'utf8');
const NAME = 'Loknot — lock it, note it';
const DESC = 'Click any element on a page, attach a note, then copy every note as one ready-made prompt for an AI coding agent.';

// Clear generated output but never touch dist/signed — those are AMO-signed builds
// that cannot be regenerated locally.
fs.mkdirSync(dist, { recursive: true });
for (const entry of fs.readdirSync(dist)) {
  if (entry === 'signed') continue;
  fs.rmSync(path.join(dist, entry), { recursive: true, force: true });
}

/* ---------- bookmarklet ---------- */
const bookmarklet = 'javascript:' + encodeURIComponent(src).replace(/'/g, '%27');
fs.writeFileSync(path.join(dist, 'bookmarklet.txt'), bookmarklet);

/* ---------- install page ---------- */
fs.writeFileSync(path.join(dist, 'loknot-bookmarklet.html'), `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Loknot — install</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#15181d;--mut:#6b7280;--card:#f6f7f9;--line:#dde1e6}
@media(prefers-color-scheme:dark){:root{--bg:#14161a;--fg:#e6e8ec;--mut:#8b94a3;--card:#1b1e24;--line:#2a2f38}}
body{font:15px/1.65 ui-sans-serif,-apple-system,Segoe UI,Roboto,sans-serif;max-width:660px;margin:56px auto;padding:0 20px;background:var(--bg);color:var(--fg)}
h1{font-size:26px;margin:0 0 4px}p.sub{color:var(--mut);margin:0 0 28px}
a.bm{display:inline-block;background:#ff2d78;color:#fff;padding:11px 20px;border-radius:9px;text-decoration:none;font-weight:600;cursor:grab}
kbd{background:var(--card);border:1px solid var(--line);border-radius:4px;padding:1px 5px;font-size:13px}
code{background:var(--card);padding:1px 5px;border-radius:4px}
section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 20px;margin:18px 0}
h2{font-size:15px;margin:0 0 8px}
</style>
<h1>Loknot</h1><p class="sub">${DESC}</p>
<section><h2>1 · Extension (recommended — gives you the hotkey)</h2>
<p>Chrome: <code>chrome://extensions</code> → Developer mode → <b>Load unpacked</b> → <code>dist/extension-chrome</code><br>
Firefox: <code>about:debugging#/runtime/this-firefox</code> → <b>Load Temporary Add-on</b> → <code>dist/extension-firefox/manifest.json</code></p>
<p><kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> on Windows/Linux) enters and leaves selector mode.</p></section>
<section><h2>2 · Bookmarklet (any browser, nothing to install)</h2>
<p>Drag to your bookmarks bar:</p><p><a class="bm" href="${bookmarklet}">Loknot</a></p></section>
<section><h2>3 · Userscript</h2><p>Tampermonkey / Violentmonkey → paste <code>dist/loknot.user.js</code>.</p></section>
<section><h2>Use</h2><ol>
<li><kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> → crosshair.</li>
<li>Click an element → write a note → <kbd>⌘/Ctrl</kbd>+<kbd>Enter</kbd>.</li>
<li><b>Review &amp; edit</b> shows every note as editable markdown.</li>
<li><b>Copy</b> → paste into your AI coding agent.</li></ol>
<p><kbd>Esc</kbd> leaves selector mode · <b>Auto/Light/Dark</b> themes the panel · <b>×</b> unloads.</p></section>`);

/* ---------- userscript ---------- */
fs.writeFileSync(path.join(dist, 'loknot.user.js'), `// ==UserScript==
// @name         Loknot
// @namespace    marko.loknot
// @version      ${VERSION}
// @description  ${DESC}
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(function () {
  window.__LOKNOT_HOST = 'userscript';   // this wrapper owns the hotkey
  function boot() {
${src.split('\n').map(l => '    ' + l).join('\n')}
  }
  window.addEventListener('keydown', function (e) {
    if (e.shiftKey && (e.metaKey || e.ctrlKey) && (e.key === 'L' || e.key === 'l')) {
      e.preventDefault(); e.stopPropagation(); boot();
    }
  }, true);
})();
`);

/* ---------- extensions ---------- */
const background = `// Loknot — toolbar button / hotkey toggles selector mode in the active tab.
// The script goes into the MAIN world so it can read React/Vue internals on the page
// (component name + source file). Re-injecting toggles pick mode.
//
// Follow mode: once you open Loknot in a tab, that tab stays in a capture session, so
// after every navigation the panel and its numbered markers come back on their own.
// That re-injection needs site access, which is an OPTIONAL permission — without it
// the extension still works, you just press the hotkey again on each new page.
const api = typeof browser !== 'undefined' ? browser : chrome;
const RUNNABLE = /^(https?|file):/;
const session = new Set();          // tab ids currently in a capture session

async function inject(tabId, auto) {
  const target = { tabId };
  // executeScript cannot close over variables, so the flag is passed as an argument.
  const mark = {
    target,
    func: (isAuto) => { window.__LOKNOT_HOST = 'extension'; window.__LOKNOT_AUTO = isAuto; },
    args: [!!auto]
  };
  try {
    await api.scripting.executeScript({ ...mark, world: 'MAIN' });
    await api.scripting.executeScript({ target, world: 'MAIN', files: ['loknot.js'] });
  } catch (e) {
    // Firefox before 128 has no MAIN world: fall back to the isolated world.
    // Everything works there except framework component/source detection.
    await api.scripting.executeScript(mark);
    await api.scripting.executeScript({ target, files: ['loknot.js'] });
  }
}

// One-click way to grant the site access that follow mode needs. A context-menu click
// counts as the user gesture permissions.request requires; the page cannot ask for it.
const FOLLOW_ID = 'loknot-follow';
async function hasAllSites() {
  try { return await api.permissions.contains({ origins: ['*://*/*'] }); } catch (e) { return false; }
}
api.runtime.onInstalled.addListener(() => {
  try {
    api.contextMenus.removeAll(() => {
      api.contextMenus.create({
        id: FOLLOW_ID,
        title: 'Loknot: keep overlays across page loads',
        contexts: ['action', 'page']
      });
    });
  } catch (e) {}
});
api.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== FOLLOW_ID) return;
  let granted = false;
  try { granted = await api.permissions.request({ origins: ['*://*/*'] }); } catch (e) {}
  if (granted && tab && tab.id) {
    session.add(tab.id);
    api.action.setBadgeText({ tabId: tab.id, text: '\u25CF' });
    api.action.setTitle({ tabId: tab.id, title: 'Loknot — overlays follow you across pages' });
    await inject(tab.id, false);
  }
});

api.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  if (!RUNNABLE.test(tab.url || '')) {
    api.action.setBadgeText({ tabId: tab.id, text: '!' });
    api.action.setTitle({ tabId: tab.id, title: 'Loknot cannot run on this page' });
    return;
  }
  session.add(tab.id);
  api.action.setBadgeText({ tabId: tab.id, text: (await hasAllSites()) ? '\u25CF' : '' });
  await inject(tab.id, false);
});

// Re-arm after a navigation. Silently does nothing when site access was not granted;
// the injected script also bows out if the user closed Loknot with the x button.
api.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  if (change.status !== 'complete' || !session.has(tabId)) return;
  if (!RUNNABLE.test((tab && tab.url) || '')) return;
  try { await inject(tabId, true); } catch (e) { /* no host permission for this URL */ }
});

api.tabs.onRemoved.addListener((tabId) => session.delete(tabId));
`;

const HOMEPAGE = 'https://productinglabs.com';
const AUTHOR = 'Producting Labs';

const icons = { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' };
const common = {
  manifest_version: 3,
  name: NAME,
  version: VERSION,
  description: DESC,
  permissions: ['activeTab', 'scripting', 'contextMenus'],
  optional_host_permissions: ['*://*/*'],
  action: { default_title: 'Loknot — lock an element and note it (Cmd/Ctrl+Shift+L)', default_icon: icons },
  icons,
  homepage_url: HOMEPAGE,
  developer: { name: AUTHOR, url: HOMEPAGE },
  commands: {
    _execute_action: {
      suggested_key: { default: 'Ctrl+Shift+L', mac: 'Command+Shift+L' },
      description: 'Lock onto an element with Loknot'
    }
  }
};

const manifests = {
  'extension-chrome': Object.assign({}, common, {
    background: { service_worker: 'background.js' },
    author: { email: 'tools@productinglabs.com' }
  }),
  'extension-firefox': Object.assign({}, common, {
    background: { scripts: ['background.js'] },
    author: AUTHOR,
    browser_specific_settings: {
      gecko: {
        id: 'loknot@productinglabs.com',
        // 140 is the floor for data_collection_permissions; MAIN-world executeScript
        // and optional_host_permissions arrived earlier, in 128.
        strict_min_version: '140.0',
        // Firefox's built-in data-consent declaration: Loknot collects nothing.
        data_collection_permissions: { required: ['none'] }
      },
      // Android reached the same key two releases later
      gecko_android: { strict_min_version: '142.0' }
    }
  })
};

for (const [name, manifest] of Object.entries(manifests)) {
  const out = path.join(dist, name);
  fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(out, 'background.js'), background);
  fs.writeFileSync(path.join(out, 'loknot.js'), src);
  for (const f of fs.readdirSync(path.join(dir, 'icons'))) {
    fs.copyFileSync(path.join(dir, 'icons', f), path.join(out, 'icons', f));
  }
  // names people see on the release page
  const archive = name === 'extension-chrome'
    ? `loknot-chrome-${VERSION}.zip`            // unzip, load unpacked
    : `loknot-firefox-source-${VERSION}.zip`;   // what gets uploaded to AMO
  try { cp.execSync(`cd "${out}" && zip -qr ../${archive} .`); } catch (e) { console.warn('zip skipped: ' + e.message); }
}

console.log('bookmarklet: ' + bookmarklet.length + ' chars');
console.log('dist/: ' + fs.readdirSync(dist).join('  '));
