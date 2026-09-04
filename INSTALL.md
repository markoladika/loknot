# Installing Loknot

Three ways, easiest first. Loknot is not in the Chrome or Firefox stores yet, so every path
below is a manual install.

> **Everything you download comes from the [Releases page](../../releases/latest), not from
> the green "Code → Download ZIP" button.** That button gives you the source, which has no
> built extension in it — the build output is deliberately not committed.

---

## 1 · Bookmarklet — nothing to install, any browser

Best for trying it out, and the only option on a locked-down machine.

1. Download **`loknot-bookmarklet.html`** from the latest [release](../../releases/latest) (or build it,
   see below) and open it in your browser.
2. Drag the pink **Loknot** button onto your bookmarks bar.
3. Open any page, click the bookmark, press `⌘/Ctrl+Shift+L`.

Limitation: sites with a strict Content-Security-Policy block bookmarklets. If nothing
happens on such a site, use the extension.

---

## 2 · Chrome — load the unpacked extension

Permanent. Survives restarts. Shows a "developer mode extensions" notice on each launch.

1. Download **`loknot-chrome-<version>.zip`** from the latest release and unzip it.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the unzipped folder.
5. Pin Loknot from the puzzle-piece menu, then press `⌘/Ctrl+Shift+L` on any page.

Optional:
- **`file://` pages** — Details → enable *Allow access to file URLs*.
- **Keep overlays after a page reload** — right-click anywhere → *"Loknot: keep overlays
  across page loads"* → Allow.

---

## 3 · Firefox — install the signed add-on

1. Download **`loknot-firefox-<version>.xpi`** from the latest release.
2. Open `about:addons` → gear icon ⚙ → **Install Add-on From File…** → pick the `.xpi`.
3. Press `⌘/Ctrl+Shift+L` on any page.

The file is signed by Mozilla, so it stays installed after a restart. Firefox refuses
unsigned add-ons permanently — `about:debugging` installs vanish when the browser closes.

---

## Building it yourself

The repository does not track build output. If you cloned the source instead of downloading
a release, build first — it needs Node and nothing else:

```bash
git clone https://github.com/markoladika/loknot.git loknot
cd loknot
node build.js
```

That writes everything into `dist/`:

```
dist/extension-chrome/          load unpacked here
dist/extension-firefox/         about:debugging → Load Temporary Add-on (dev only)
dist/loknot-bookmarklet.html    open, drag the bookmarklet
dist/loknot.user.js             paste into Tampermonkey / Violentmonkey
dist/bookmarklet.txt            the raw javascript: URL
```

Only the maintainer can produce a **signed** `.xpi`, since signing needs Mozilla API
credentials: `npm run sign:firefox` → `dist/signed/`.

---

## First use

```
⌘/Ctrl+Shift+L      lock on / off
click an element    write one line, ⌘/Ctrl+Enter to save
Copy                the whole set lands on your clipboard
```

Paste into your coding agent. The README explains everything the tool captures.

---

## Uninstalling

| Where | How |
|---|---|
| Chrome | `chrome://extensions` → Remove |
| Firefox | `about:addons` → ⋯ → Remove |
| Bookmarklet | delete the bookmark |

Notes live in your browser's `localStorage` per site; removing the extension leaves them
behind harmlessly. Clearing site data removes them.
