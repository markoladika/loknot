(function () {
  'use strict';
  var NS = '__loknot';
  // Re-running the script toggles pick mode on the live instance instead of unloading it,
  // so the same hotkey can be used to enter and leave selector mode.
  if (window[NS] && window[NS].togglePick) { window[NS].togglePick(); return; }

  var PREFIX = 'loknot::';
  var FKEY = 'loknot::follow';
  var OKEY = 'loknot::overlay';
  var SKEY = 'loknot::fields';

  // What goes into the exported markdown. "note" is always in.
  var FIELDS = [
    { k: 'page',      l: 'Page URL' },
    { k: 'name',      l: 'Name + role' },
    { k: 'element',   l: 'Element tag' },
    { k: 'selector',  l: 'CSS selector' },
    { k: 'text',      l: 'Visible text' },
    { k: 'region',    l: 'Region (where on the page)' },
    { k: 'component', l: 'Framework component' },
    { k: 'source',    l: 'Source file:line' },
    { k: 'dompath',   l: 'DOM path' },
    { k: 'props',     l: 'React props' },
    { k: 'handlers',  l: 'Event handler source' },
    { k: 'calls',     l: 'Backend calls' },
    { k: 'box',       l: 'Position + size' }
  ];
  var PRESETS = {
    quick:    ['page', 'name', 'element', 'selector'],
    standard: ['page', 'name', 'element', 'selector', 'text', 'region', 'component', 'source'],
    full:     FIELDS.map(function (f) { return f.k; })
  };
  var cfg = (function () {
    var d = { preset: 'standard', fields: PRESETS.standard.slice(), env: false, scope: 'site' };
    try {
      var j = JSON.parse(get(SKEY) || 'null');
      if (j && j.fields) {
        return { preset: j.preset || 'custom', fields: j.fields, env: !!j.env, scope: j.scope || 'site' };
      }
    } catch (e) {}
    return d;
  })();
  function saveCfg() { set(SKEY, JSON.stringify(cfg)); }
  function on(k) { return cfg.fields.indexOf(k) >= 0; }
  function scopeIs(v) { return cfg.scope === v; }

  // Device / browser / OS / time — one header line, never repeated per note.
  function envLine() {
    var ua = navigator.userAgent, d = navigator.userAgentData, brow = '', os = '', dev = 'desktop';
    try {
      if (d && d.brands && d.brands.length) {
        var b = d.brands.filter(function (x) { return !/not.?a.?brand/i.test(x.brand); })[0] || d.brands[0];
        brow = b.brand + ' ' + b.version;
        os = d.platform || '';
        dev = d.mobile ? 'mobile' : 'desktop';
      }
    } catch (e) {}
    if (!brow) {
      var m = ua.match(/(Firefox|Edg|OPR|Chrome|Version)\/([\d.]+)/);
      if (m) brow = ({ Edg: 'Edge', OPR: 'Opera', Version: 'Safari' }[m[1]] || m[1]) + ' ' + m[2].split('.')[0];
    }
    if (!os) {
      os = /Mac OS X/.test(ua) ? 'macOS' : /Windows NT/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android'
        : /(iPhone|iPad|iPod)/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : 'unknown OS';
    }
    if (/iPad|Tablet/i.test(ua)) dev = 'tablet';
    else if (/Mobi|Android/i.test(ua)) dev = 'mobile';
    var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}
    return '**Environment:** ' + (brow || 'unknown browser') + ' · ' + os + ' · ' + dev +
      ' · viewport ' + innerWidth + '×' + innerHeight + ' @' + (window.devicePixelRatio || 1) + 'x' +
      ' · screen ' + screen.width + '×' + screen.height +
      (tz ? ' · ' + tz : '') + ' · ' + new Date().toString().replace(/ GMT.*/, '');
  }
  // Injected automatically after a navigation (extension "follow" mode). If the user
  // closed Loknot with the x button, stay out of the way.
  var AUTO = window.__LOKNOT_AUTO === true;
  // A "page" is its path plus meaningful query — many apps route on ?view=… — but
  // tracking junk must not split one page into several buckets.
  var JUNK = /^(utm_|fbclid|gclid|msclkid|_ga|mc_|igsh|si$)/;
  function keyFor() {
    var q = '';
    try {
      var kept = [];
      new URLSearchParams(location.search).forEach(function (v, k) { if (!JUNK.test(k)) kept.push(k + '=' + v); });
      kept.sort();
      if (kept.length) q = '?' + kept.join('&');
    } catch (e) { q = location.search; }
    return PREFIX + location.origin + location.pathname + q;
  }
  var KEY = keyFor();
  var TKEY = 'loknot::theme';
  var notes = read(KEY);
  var seq = notes.reduce(function (m, n) { return Math.max(m, n.id || 0); }, 0);
  var picking = false, hovered = null, composerTarget = null, raf = 0;
  var recording = false, traceFrom = 0, traceTick = 0, traceClick = null, pendingCalls = null;

  var theme = get(TKEY) || 'auto';
  var draft = null;             // edited markdown in the review pane

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function read(k) { try { return JSON.parse(get(k) || '[]'); } catch (e) { return []; } }
  if (AUTO && get(FKEY) === '0') return;
  if (AUTO) set('loknot::followok', '1');   // proof that re-injection works here
  set(FKEY, '1');

  var STYLE = [
    ':host{all:initial;--accent:#ff2d78;--bg:#ffffff;--bg2:#f6f7f9;--fg:#15181d;--mut:#6b7280;--line:#dde1e6;--btn:#f1f3f5;--btnh:#e4e7eb;--in:#ffffff;color-scheme:light}',
    ':host([data-theme="dark"]){--bg:#14161a;--bg2:#1b1e24;--fg:#e6e8ec;--mut:#8b94a3;--line:#2a2f38;--btn:#232830;--btnh:#2d333d;--in:#0f1114;color-scheme:dark}',
    '*{box-sizing:border-box;font-family:ui-sans-serif,-apple-system,Segoe UI,Roboto,sans-serif}',
    '.hl{position:fixed;border:2px solid var(--accent);background:rgba(255,45,120,.12);pointer-events:none;display:none;border-radius:2px}',
    '.hl-tag{position:fixed;background:var(--accent);color:#fff;font-size:11px;line-height:1;padding:4px 6px;border-radius:3px;pointer-events:none;display:none;max-width:60vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,Menlo,monospace}',
    '.nbox{position:fixed;border:2px solid var(--accent);border-radius:3px;background:rgba(255,45,120,.10);pointer-events:none;box-shadow:0 0 0 1px rgba(255,255,255,.35) inset}',
    '.nbox.stale{border-style:dashed;background:transparent;opacity:.6}',
    '.ntip{position:fixed;max-width:300px;background:var(--bg);color:var(--fg);border:1px solid var(--accent);border-radius:7px;padding:7px 9px;font-size:11.5px;line-height:1.45;box-shadow:0 6px 22px rgba(0,0,0,.3);pointer-events:none;display:none;white-space:pre-wrap;word-break:break-word}',
    '.ask{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.45);pointer-events:auto}',
    '.ask .box{width:min(340px,88vw);background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:11px;padding:16px;box-shadow:0 14px 44px rgba(0,0,0,.4)}',
    '.ask .box p{margin:0 0 14px;font-size:12.5px;line-height:1.5}',
    '.ask .box .btns{display:flex;gap:7px;justify-content:flex-end}',
    'button.danger{background:#e5484d;border-color:#e5484d;color:#fff}',
    'button.danger:hover{background:#d63b40}',
    '.ntip .who{color:var(--mut);font-size:10px;display:block;margin-bottom:3px;font-family:ui-monospace,Menlo,monospace}',
    '.mark{position:fixed;width:20px;height:20px;border-radius:50%;background:var(--accent);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;pointer-events:auto;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.35)}',
    '.panel{position:fixed;right:12px;bottom:12px;width:340px;max-height:74vh;display:flex;flex-direction:column;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:10px;box-shadow:0 10px 34px rgba(0,0,0,.28);pointer-events:auto;font-size:12px;overflow:hidden}',
    '.hd{display:flex;align-items:center;gap:6px;padding:8px 10px;background:var(--bg2);border-bottom:1px solid var(--line);cursor:move}',
    '.hd b{flex:1;font-size:12px}',
    '.tb{padding:7px 10px;border-bottom:1px solid var(--line);background:var(--bg2)}',
    '.tbrow{display:flex;align-items:center;gap:5px;margin-bottom:5px}',
    '.tbrow:last-child{margin-bottom:0}',
    '.tbrow .lbl{color:var(--mut);font-size:10px;text-transform:uppercase;letter-spacing:.04em;margin-right:1px}',
    '.tbrow .spacer{flex:1}',
    'button{font:inherit;font-size:11px;padding:4px 8px;border-radius:5px;border:1px solid var(--line);background:var(--btn);color:var(--fg);cursor:pointer;display:inline-flex;align-items:center;gap:5px;line-height:1}',
    'button svg{width:13px;height:13px;flex:0 0 auto;pointer-events:none}',
    'button span{pointer-events:none}',
    '.hd button{padding:5px}',
    '.hd button svg{width:17px;height:17px}',
    'button:hover{background:var(--btnh)}',
    'button.on{background:var(--accent);border-color:var(--accent);color:#fff}',
    '.sub{padding:6px 10px;border-bottom:1px solid var(--line);color:var(--mut);font-size:10.5px;background:var(--bg2)}',
    '.list{overflow:auto;padding:6px}',
    '.pg{display:flex;gap:8px;align-items:center;padding:7px 8px;border-radius:6px;border:1px solid var(--line);margin-bottom:5px;background:var(--bg2);cursor:pointer}',
    '.pg:hover{border-color:var(--accent)}',
    '.pg .c{flex:0 0 auto;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:var(--accent);color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center}',
    '.pg .u{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,Menlo,monospace;font-size:10.5px}',
    '.pg.here{border-color:var(--accent)}',
    '.set{padding:2px}',
    '.set .row{display:flex;align-items:center;gap:7px;padding:5px 6px;border-radius:5px;cursor:pointer}',
    '.set .row:hover{background:var(--bg2)}',
    '.set .row input{margin:0;accent-color:var(--accent)}',
    '.set .row.lock{opacity:.55;cursor:default}',
    '.set .cap{color:var(--mut);font-size:10px;padding:9px 6px 4px;text-transform:uppercase;letter-spacing:.04em}',
    '.set .est{color:var(--mut);font-size:10.5px;padding:8px 6px 2px;border-top:1px solid var(--line);margin-top:6px}',
    '.grp{color:var(--mut);font-size:10px;padding:5px 4px 3px;word-break:break-all}',
    '.item{display:flex;gap:6px;padding:6px;border-radius:6px;border:1px solid var(--line);margin-bottom:5px;background:var(--bg2)}',
    '.item .n{flex:0 0 18px;height:18px;border-radius:50%;background:var(--accent);color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center}',
    '.item .b{flex:1;min-width:0}',
    '.t{white-space:pre-wrap;word-break:break-word;cursor:text}',
    '.t:hover{text-decoration:underline dotted var(--mut)}',
    '.sel{color:var(--mut);font-family:ui-monospace,Menlo,monospace;font-size:10px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.x{flex:0 0 auto;border:0;background:transparent;color:var(--mut);padding:0 2px;cursor:pointer;font-size:14px}',
    '.empty{color:var(--mut);padding:12px;text-align:center;line-height:1.6}',
    '.cmp{position:fixed;width:310px;background:var(--bg);color:var(--fg);border:1px solid var(--accent);border-radius:9px;box-shadow:0 10px 34px rgba(0,0,0,.28);pointer-events:auto;padding:8px;display:none}',
    '.cmp .sel{margin:0 0 6px}',
    'textarea{width:100%;background:var(--in);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:7px;font:inherit;font-size:12px}',
    '.cmp textarea{height:80px;resize:vertical}',
    '.row{display:flex;gap:6px;margin-top:6px;align-items:center}',
    '.hint{flex:1;color:var(--mut);font-size:10px}',
    '.veil{position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;pointer-events:auto}',
    '.mod{width:min(720px,88vw);height:min(560px,78vh);display:flex;flex-direction:column;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,.45);overflow:hidden}',
    '.mod textarea{flex:1;border:0;border-radius:0;resize:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;line-height:1.55;padding:14px;outline:none}',
    '.mod .ft{display:flex;gap:6px;align-items:center;padding:9px 12px;border-top:1px solid var(--line);background:var(--bg2)}',
    '.badge{color:var(--mut);font-size:10px;flex:1}',
    '.seg{display:flex;gap:0}',
    '.seg button{border-radius:0;margin:0}',
    '.seg button:first-child{border-radius:5px 0 0 5px}',
    '.seg button:last-child{border-radius:0 5px 5px 0;border-left:0}',
    '.prev{flex:1;overflow:auto;padding:14px 18px;font-size:12.5px;line-height:1.65}',
    '.prev h1{font-size:18px;margin:0 0 4px}',
    '.prev h2{font-size:14px;margin:18px 0 6px;padding-bottom:5px;border-bottom:1px solid var(--line)}',
    '.prev h3{font-size:13px;margin:14px 0 4px;color:var(--accent)}',
    '.prev ul{margin:4px 0;padding-left:18px}',
    '.prev li{margin:2px 0}',
    '.prev code{background:var(--bg2);border:1px solid var(--line);border-radius:4px;padding:1px 4px;font-family:ui-monospace,Menlo,monospace;font-size:11.5px;word-break:break-all}',
    '.prev pre{background:var(--bg2);border:1px solid var(--line);border-radius:6px;padding:10px;overflow-x:auto}',
    '.prev pre code{border:0;background:none;padding:0}',
    '.prev a{color:var(--accent)}',
    '.prev p{margin:6px 0}',
    '.cd{position:fixed;inset:0;display:none;align-items:center;justify-content:center;pointer-events:none}',
    '.cd b{font-size:132px;font-weight:800;color:var(--accent);text-shadow:0 8px 40px rgba(0,0,0,.4);font-family:ui-sans-serif,-apple-system,sans-serif;line-height:1}',
    '.rec{position:fixed;top:14px;left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;padding:7px 10px 7px 14px;border-radius:22px;font-size:12px;font-weight:600;display:none;align-items:center;gap:9px;pointer-events:auto;box-shadow:0 6px 24px rgba(0,0,0,.35)}',
    '.rec .dot{width:9px;height:9px;border-radius:50%;background:#fff;animation:lkpulse 1s infinite}',
    '.rec button{background:rgba(255,255,255,.18);border-color:rgba(255,255,255,.5);color:#fff}',
    '@keyframes lkpulse{0%,100%{opacity:1}50%{opacity:.2}}'
  ].join('');

  var host = document.createElement('div');
  host.setAttribute('data-loknot', '');
  host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647';
  document.documentElement.appendChild(host);
  var root = host.attachShadow({ mode: 'open' });
  var st = document.createElement('style'); st.textContent = STYLE; root.appendChild(st);

  function el(t, c) { var e = document.createElement(t); if (c) e.className = c; return e; }

  // Inline SVG so every button looks the same on every platform (emoji do not).
  var ICONS = {
    select: '<path d="M8 1v4M8 11v4M1 8h4M11 8h4"/><circle cx="8" cy="8" r="2.5"/>',
    trace:  '<circle cx="8" cy="8" r="4.5" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="7"/>',
    stop:   '<rect x="4.5" y="4.5" width="7" height="7" rx="1.5" fill="currentColor" stroke="none"/>',
    eye:    '<path d="M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8z"/><circle cx="8" cy="8" r="2"/>',
    review: '<rect x="3" y="1.8" width="10" height="12.4" rx="1.6"/><path d="M5.6 5.4h4.8M5.6 8h4.8M5.6 10.6h3"/>',
    copy:   '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.2V2.9A1.4 1.4 0 0 0 9.1 1.5H3.9A1.4 1.4 0 0 0 2.5 2.9v5.2a1.4 1.4 0 0 0 1.4 1.4h.3"/>',
    down:   '<path d="M8 2v8M4.8 7l3.2 3.2L11.2 7M2.5 13.5h11"/>',
    pages:  '<path d="M8 1.6L14.4 5 8 8.4 1.6 5z"/><path d="M1.6 8.4L8 11.8l6.4-3.4"/><path d="M1.6 11.6L8 15l6.4-3.4"/>',
    trash:  '<path d="M2.8 4.3h10.4M6.4 4.3V2.8h3.2v1.5M4.2 4.3l.7 9.1h6.2l.7-9.1M6.6 6.8v4M9.4 6.8v4"/>',
    cog:    '<circle cx="8" cy="8" r="2.6"/><path d="M13 9.6a1.2 1.2 0 0 0 .24 1.32l.05.04a1.45 1.45 0 1 1-2.05 2.05l-.04-.05a1.2 1.2 0 0 0-1.32-.24 1.2 1.2 0 0 0-.73 1.1v.12a1.45 1.45 0 1 1-2.9 0v-.06a1.2 1.2 0 0 0-.79-1.1 1.2 1.2 0 0 0-1.32.24l-.04.05A1.45 1.45 0 1 1 1.8 10.9l.05-.04a1.2 1.2 0 0 0 .24-1.32 1.2 1.2 0 0 0-1.1-.73H.87a1.45 1.45 0 1 1 0-2.9h.06a1.2 1.2 0 0 0 1.1-.79 1.2 1.2 0 0 0-.24-1.32L1.75 3.8A1.45 1.45 0 1 1 3.8 1.75l.04.05a1.2 1.2 0 0 0 1.32.24h.06a1.2 1.2 0 0 0 .73-1.1V.87a1.45 1.45 0 1 1 2.9 0v.06a1.2 1.2 0 0 0 .73 1.1 1.2 1.2 0 0 0 1.32-.24l.04-.05a1.45 1.45 0 1 1 2.05 2.05l-.05.04a1.2 1.2 0 0 0-.24 1.32v.06a1.2 1.2 0 0 0 1.1.73h.12a1.45 1.45 0 1 1 0 2.9h-.06a1.2 1.2 0 0 0-1.1.73z"/>',
    sun:    '<circle cx="8" cy="8" r="3.2"/><path d="M8 .8v1.8M8 13.4v1.8M2.9 2.9l1.3 1.3M11.8 11.8l1.3 1.3M.8 8h1.8M13.4 8h1.8M2.9 13.1l1.3-1.3M11.8 4.2l1.3-1.3"/>',
    moon:   '<path d="M13.2 9.6A5.8 5.8 0 0 1 6.4 2.8a5.8 5.8 0 1 0 6.8 6.8z"/>',
    auto:   '<circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" stroke="none"/>',
    close:  '<path d="M4 4l8 8M12 4l-8 8"/>'
  };
  function svg(name) {
    return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>';
  }
  function btn(action, icon, label, title) {
    return '<button data-a="' + action + '"' + (title ? ' title="' + title + '"' : '') + '>' +
      svg(icon) + (label ? '<span>' + label + '</span>' : '') + '</button>';
  }

  var hl = el('div', 'hl'), hlTag = el('div', 'hl-tag'), marks = el('div', ''), tip = el('div', 'ntip'),
      panel = el('div', 'panel'), cmp = el('div', 'cmp'), veil = el('div', 'veil'),
      cd = el('div', 'cd'), rec = el('div', 'rec'), ask = el('div', 'ask');
  [hl, hlTag, marks, tip, cd, rec, panel, cmp, veil, ask].forEach(function (n) { root.appendChild(n); });
  ask.innerHTML = '<div class="box"><p></p><div class="btns">' +
    '<button data-a="askno">Cancel</button>' +
    '<button data-a="askyes" class="danger">Delete</button></div></div>';
  cd.innerHTML = '<b></b>';
  rec.innerHTML = '<span class="dot"></span><span class="txt">Recording</span>' +
    '<button data-a="stoptrace">Stop &amp; note</button>';

  panel.innerHTML =
    '<div class="hd"><b>Loknot</b>' +
      btn('settings', 'cog', '', 'What goes into the copied prompt') +
      btn('theme', 'auto', '', 'Theme') +
      btn('close', 'close', '', 'Unload Loknot') +
    '</div>' +
    '<div class="tb">' +
      '<div class="tbrow">' +
        btn('pick', 'select', 'Lock', 'Lock onto an element on the page and note it (\u2318/Ctrl+Shift+L)') +
        btn('trace', 'trace', 'Trace', 'Record the backend calls an interaction fires') +
        btn('overlay', 'eye', '', 'Show or hide the outlines and numbers on the page') +
      '</div>' +
      '<div class="tbrow">' +
        btn('review', 'review', 'Review', 'Read and edit every note before copying') +
        btn('copy', 'copy', 'Copy', 'Copy the prompt to the clipboard') +
        btn('md', 'down', '.md', 'Download as a markdown file') +
        '<span class="spacer"></span>' +
        btn('pages', 'pages', '', 'Every page you have notes on') +
        btn('clear', 'trash', '', 'Delete notes') +
      '</div>' +
    '</div><div class="sub"></div><div class="list"></div>';

  cmp.innerHTML =
    '<div class="sel"></div><textarea placeholder="What about this element?"></textarea>' +
    '<div class="row"><span class="hint">&#8984;/Ctrl+Enter save &middot; Esc cancel</span>' +
    '<button data-a="save">Save</button><button data-a="cancel">Cancel</button></div>';

  veil.innerHTML =
    '<div class="mod"><div class="hd"><b>Review</b>' +
      '<span class="badge"></span>' +
      '<span class="seg"><button data-a="mprev">Preview</button><button data-a="medit">Edit</button></span>' +
      '<button data-a="mclose">&times;</button></div>' +
      '<div class="prev"></div>' +
      '<textarea spellcheck="false"></textarea>' +
      '<div class="ft"><span class="hint"></span>' +
      '<button data-a="regen" title="Throw away your edits and rebuild the text from the saved notes">Reset to notes</button>' +
      '<button data-a="mdl">.md</button>' +
      '<button data-a="mcopy" class="on">Copy</button></div></div>';

  var listEl = panel.querySelector('.list');
  var taEl = cmp.querySelector('textarea');
  var cmpSel = cmp.querySelector('.sel');
  var modTa = veil.querySelector('.mod textarea');
  var modPrev = veil.querySelector('.prev');
  var modBadge = veil.querySelector('.badge');
  var modHint = veil.querySelector('.ft .hint');
  var modView = 'preview';

  // ---------- theme ----------
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function applyTheme() {
    var eff = theme === 'auto' ? (mq && mq.matches ? 'dark' : 'light') : theme;
    host.setAttribute('data-theme', eff);
    var b = panel.querySelector('[data-a=theme]');
    b.innerHTML = svg(theme === 'auto' ? 'auto' : theme === 'dark' ? 'moon' : 'sun');
    b.title = 'Theme: ' + theme + ' \u2014 click to cycle auto \u2192 light \u2192 dark';
  }
  function cycleTheme() {
    theme = theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto';
    set(TKEY, theme); applyTheme();
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', applyTheme);

  // ---------- element analysis ----------
  function uniq(sel) { try { return document.querySelectorAll(sel).length === 1; } catch (e) { return false; } }
  function esc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }

  function cssPath(node) {
    if (!node || node.nodeType !== 1) return '';
    if (node.id && uniq('#' + esc(node.id))) return '#' + esc(node.id);
    var tid = node.getAttribute('data-testid') || node.getAttribute('data-test-id') || node.getAttribute('data-cy');
    if (tid && uniq('[data-testid="' + tid + '"]')) return '[data-testid="' + tid + '"]';
    var parts = [], cur = node, depth = 0;
    while (cur && cur.nodeType === 1 && depth < 7) {
      if (cur.id && uniq('#' + esc(cur.id))) { parts.unshift('#' + esc(cur.id)); break; }
      var part = cur.tagName.toLowerCase();
      var cls = (cur.getAttribute('class') || '').trim().split(/\s+/).filter(function (c) {
        return c && c.length < 30 && !/^(ng-|css-|sc-|jsx-|svelte-|_)/.test(c) && !/\d{4,}/.test(c);
      }).slice(0, 2);
      if (cls.length) part += '.' + cls.map(esc).join('.');
      var p = cur.parentElement;
      if (p) {
        var sibs = Array.prototype.filter.call(p.children, function (c) { return c.tagName === cur.tagName; });
        if (sibs.length > 1) part += ':nth-of-type(' + (sibs.indexOf(cur) + 1) + ')';
      }
      parts.unshift(part);
      var cand = parts.join(' > ');
      if (uniq(cand)) return cand;
      cur = p; depth++;
    }
    return parts.join(' > ');
  }

  function framework(node) {
    var out = {};
    try {
      var k = Object.keys(node).filter(function (x) {
        return x.indexOf('__reactFiber$') === 0 || x.indexOf('__reactInternalInstance$') === 0;
      })[0];
      if (k) {
        var f = node[k], hops = 0;
        while (f && hops < 12) {
          var src = f._debugSource;
          if (src && src.fileName && !out.file) out.file = src.fileName + ':' + (src.lineNumber || '');
          var t = f.type;
          if (t && typeof t !== 'string') {
            var nm = t.displayName || t.name || (t.render && (t.render.displayName || t.render.name)) ||
                     (t.type && (t.type.displayName || t.type.name));
            if (nm && !out.component) out.component = nm;
          }
          if (out.file && out.component) break;
          f = f.return || f._debugOwner; hops++;
        }
      }
      var vc = node.__vueParentComponent;
      if (vc && vc.type) {
        out.component = out.component || vc.type.name || vc.type.__name;
        out.file = out.file || vc.type.__file;
      }
    } catch (e) {}
    return out;
  }


  // ---------- network recorder ----------
  // Everything the page asks the backend for, kept as a rolling buffer so a note can
  // carry the calls that surround it. Patches are reverted in destroy().
  var netlog = [], NETMAX = 200, patched = [];

  function short(v, n) {
    v = String(v == null ? '' : v);
    return v.length > (n || 160) ? v.slice(0, n || 160) + '…' : v;
  }

  function bodyPreview(b) {
    try {
      if (!b) return '';
      if (typeof b === 'string') {
        var j = null; try { j = JSON.parse(b); } catch (e) {}
        if (j && typeof j === 'object') {
          if (j.query && (j.operationName || /query|mutation/.test(j.query))) {
            return 'graphql ' + (j.operationName || String(j.query).trim().split(/[\s({]/)[1] || '');
          }
          return '{' + Object.keys(j).slice(0, 8).join(', ') + '}';
        }
        return short(b, 120);
      }
      if (typeof FormData !== 'undefined' && b instanceof FormData) {
        var ks = []; try { b.forEach(function (v, k) { ks.push(k); }); } catch (e) {}
        return 'FormData{' + ks.slice(0, 8).join(', ') + '}';
      }
      if (typeof Blob !== 'undefined' && b instanceof Blob) return 'Blob ' + b.type + ' ' + b.size + 'B';
      if (typeof b === 'object') return '{' + Object.keys(b).slice(0, 8).join(', ') + '}';
    } catch (e) {}
    return '';
  }

  // Name the backend the call actually hits.
  function serviceOf(url, method, bodyText) {
    var u; try { u = new URL(url, location.href); } catch (e) { return { host: '', path: String(url), svc: '' }; }
    var p = u.pathname, q = u.search, svc = '', m;
    if ((m = p.match(/\/rest\/v1\/rpc\/([^/?]+)/))) svc = 'Supabase RPC ' + m[1] + '()';
    else if ((m = p.match(/\/rest\/v1\/([^/?]+)/))) {
      svc = 'Supabase table "' + m[1] + '"';
      var sel = u.searchParams.get('select'); if (sel) svc += ' select=' + short(sel, 50);
    }
    else if (p.indexOf('/auth/v1/') === 0) svc = 'Supabase Auth /' + p.split('/auth/v1/')[1];
    else if (p.indexOf('/storage/v1/') === 0) svc = 'Supabase Storage /' + p.split('/storage/v1/')[1];
    else if (p.indexOf('/functions/v1/') === 0) svc = 'Supabase Edge Function ' + p.split('/functions/v1/')[1];
    else if (/graphql/i.test(p)) {
      svc = 'GraphQL';
      var g = bodyPreview(bodyText); if (g.indexOf('graphql ') === 0) svc = 'GraphQL ' + g.slice(8);
    }
    else if (/\/(api|v\d+)\//.test(p)) svc = 'API ' + method + ' ' + p;
    else if (u.host !== location.host) svc = 'third party ' + u.host;
    return { host: u.host, path: p + short(q, 90), svc: svc };
  }

  function pushNet(e) { netlog.push(e); if (netlog.length > NETMAX) netlog.shift(); }

  function record(method, url, status, ms, bodyText, resType, resPreview, err) {
    var s = serviceOf(url, method, bodyText);
    pushNet({
      t: Date.now(), m: (method || 'GET').toUpperCase(), host: s.host, path: s.path, svc: s.svc,
      status: err ? 'failed: ' + short(err, 60) : status, ms: Math.round(ms),
      req: bodyPreview(bodyText), res: resPreview || '', type: resType || ''
    });
  }

  function summarize(res) {
    try {
      var ct = res.headers && res.headers.get('content-type') || '';
      var len = parseInt((res.headers && res.headers.get('content-length')) || '0', 10);
      if (ct.indexOf('json') < 0 || (len && len > 200000)) return { ct: ct, prev: '' };
      res.clone().text().then(function (txt) {
        var prev = '';
        try {
          var j = JSON.parse(txt);
          if (Array.isArray(j)) prev = 'array[' + j.length + ']' + (j[0] && typeof j[0] === 'object' ? ' of {' + Object.keys(j[0]).slice(0, 8).join(', ') + '}' : '');
          else if (j && typeof j === 'object') prev = '{' + Object.keys(j).slice(0, 10).join(', ') + '}';
          else prev = short(txt, 80);
        } catch (e) { prev = short(txt, 80); }
        for (var i = netlog.length - 1; i >= 0 && i > netlog.length - 6; i--) {
          if (netlog[i]._res === res) { netlog[i].res = prev; break; }
        }
      }, function () {});
      return { ct: ct, prev: '' };
    } catch (e) { return { ct: '', prev: '' }; }
  }

  (function patchNet() {
    var of = window.fetch;
    if (of && !of.__loknot) {
      var wf = function (input, init) {
        var url = typeof input === 'string' ? input : (input && input.url) || String(input);
        var method = (init && init.method) || (input && input.method) || 'GET';
        var body = init && init.body;
        var t0 = performance.now();
        return of.apply(this, arguments).then(function (res) {
          var sum = summarize(res);
          record(method, url, res.status, performance.now() - t0, body, sum.ct, '');
          netlog[netlog.length - 1]._res = res;
          return res;
        }, function (e) {
          record(method, url, 0, performance.now() - t0, body, '', '', e && e.message);
          throw e;
        });
      };
      wf.__loknot = 1; window.fetch = wf;
      patched.push(function () { if (window.fetch === wf) window.fetch = of; });
    }

    var XP = window.XMLHttpRequest && XMLHttpRequest.prototype;
    if (XP && !XP.open.__loknot) {
      var oo = XP.open, os = XP.send;
      XP.open = function (m, u) { this.__lk = { m: m, u: u }; return oo.apply(this, arguments); };
      XP.open.__loknot = 1;
      XP.send = function (b) {
        var self = this, t0 = performance.now();
        if (self.__lk) {
          self.addEventListener('loadend', function () {
            record(self.__lk.m, self.__lk.u, self.status, performance.now() - t0, b,
              (self.getResponseHeader && self.getResponseHeader('content-type')) || '', '');
          });
        }
        return os.apply(this, arguments);
      };
      patched.push(function () { XP.open = oo; XP.send = os; });
    }

    var OW = window.WebSocket;
    if (OW && !OW.__loknot) {
      var WS = function (url, protos) {
        record('WS', url, 'open', 0, '', 'websocket', '');
        return protos === undefined ? new OW(url) : new OW(url, protos);
      };
      WS.prototype = OW.prototype; WS.__loknot = 1;
      ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k) { WS[k] = OW[k]; });
      window.WebSocket = WS;
      patched.push(function () { if (window.WebSocket === WS) window.WebSocket = OW; });
    }

    // Requests that happened before Loknot loaded — no bodies, but the endpoints are there.
    try {
      performance.getEntriesByType('resource').filter(function (r) {
        return r.initiatorType === 'fetch' || r.initiatorType === 'xmlhttprequest';
      }).slice(-40).forEach(function (r) {
        var s = serviceOf(r.name, 'GET', '');
        netlog.push({
          t: Date.now() - Math.round(performance.now() - r.startTime), m: '?', host: s.host, path: s.path,
          svc: s.svc, status: '', ms: Math.round(r.duration), req: '', res: '', type: 'before Loknot loaded'
        });
      });
      netlog.sort(function (a, b) { return a.t - b.t; });
    } catch (e) {}
  })();

  function callsSince(from) {
    return netlog.filter(function (c) { return c.t >= from; }).map(function (c) {
      return { m: c.m, host: c.host, path: c.path, svc: c.svc, status: c.status, ms: c.ms, req: c.req, res: c.res, type: c.type };
    }).slice(-12);
  }

  // ---------- React props + event handlers ----------
  function propsOf(node) {
    var out = { names: [], handlers: [] };
    try {
      var pk = Object.keys(node).filter(function (x) { return x.indexOf('__reactProps$') === 0; })[0];
      var props = pk ? node[pk] : null;
      if (!props) {
        var fk = Object.keys(node).filter(function (x) { return x.indexOf('__reactFiber$') === 0; })[0];
        var f = fk ? node[fk] : null;
        props = f && (f.memoizedProps || (f.return && f.return.memoizedProps));
      }
      if (!props) return out;
      Object.keys(props).forEach(function (k) {
        if (k === 'children') return;
        out.names.push(k);
        if (typeof props[k] === 'function' && /^on[A-Z]/.test(k)) {
          var src = '';
          try { src = Function.prototype.toString.call(props[k]).replace(/\s+/g, ' '); } catch (e) {}
          out.handlers.push({ name: k, fn: props[k].name || '', src: short(src, 220) });
        }
      });
      out.names = out.names.slice(0, 14);
    } catch (e) {}
    return out;
  }

  function describe(node) {
    var attrs = ['id', 'class', 'name', 'type', 'role', 'aria-label', 'placeholder', 'href', 'src', 'data-testid'];
    var s = '<' + node.tagName.toLowerCase();
    attrs.forEach(function (a) {
      var v = node.getAttribute && node.getAttribute(a);
      if (v) s += ' ' + a + '="' + String(v).slice(0, 90) + '"';
    });
    return s + '>';
  }
  function textOf(node) { return txt(node, 140); }
  function txt(node, max) {
    return ((node && (node.innerText || node.textContent)) || '').replace(/\s+/g, ' ').trim().slice(0, max || 60);
  }

  var IMPLICIT = {
    a: 'link', button: 'button', h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading',
    h5: 'heading', h6: 'heading', img: 'image', nav: 'navigation', main: 'main', form: 'form',
    table: 'table', ul: 'list', ol: 'list', li: 'list item', select: 'combobox', textarea: 'textbox',
    dialog: 'dialog', header: 'banner', footer: 'contentinfo', aside: 'complementary',
    section: 'section', article: 'article', label: 'label', summary: 'disclosure', option: 'option'
  };
  function roleOf(node) {
    var r = node.getAttribute && node.getAttribute('role');
    if (r) return r;
    var t = node.tagName.toLowerCase();
    if (t === 'input') {
      var ty = (node.getAttribute('type') || 'text').toLowerCase();
      return ty === 'checkbox' || ty === 'radio' || ty === 'submit' || ty === 'button' ? ty : 'input:' + ty;
    }
    return IMPLICIT[t] || t;
  }

  // The human-visible name of the element, the way a person would refer to it.
  function labelOf(node) {
    var v = node.getAttribute && node.getAttribute('aria-label');
    if (v && v.trim()) return { name: v.trim().slice(0, 70), from: 'aria-label' };
    var lb = node.getAttribute && node.getAttribute('aria-labelledby');
    if (lb) {
      var t = lb.split(/\s+/).map(function (id) {
        var e = document.getElementById(id); return e ? txt(e, 40) : '';
      }).filter(Boolean).join(' ');
      if (t) return { name: t.slice(0, 70), from: 'aria-labelledby' };
    }
    if (node.id) {
      var l = null; try { l = document.querySelector('label[for="' + esc(node.id) + '"]'); } catch (e) {}
      if (l) return { name: txt(l, 70), from: 'label[for]' };
    }
    var pl = node.closest && node.closest('label');
    if (pl && pl !== node) { var pt = txt(pl, 70); if (pt) return { name: pt, from: 'wrapping label' }; }
    var attrs = ['title', 'alt', 'placeholder', 'name'];
    for (var i = 0; i < attrs.length; i++) {
      var a = node.getAttribute && node.getAttribute(attrs[i]);
      if (a && a.trim()) return { name: a.trim().slice(0, 70), from: attrs[i] };
    }
    var own = txt(node, 70);
    if (own && own.length <= 70 && node.children.length < 4) return { name: own, from: 'visible text' };
    var img = node.querySelector && node.querySelector('img[alt]:not([alt=""]),[aria-label]');
    if (img) {
      var iv = img.getAttribute('alt') || img.getAttribute('aria-label');
      if (iv) return { name: iv.slice(0, 70), from: 'child image alt' };
    }
    var h = node.querySelector && node.querySelector('h1,h2,h3,h4,legend,caption,summary,[role=heading]');
    if (h) { var ht = txt(h, 70); if (ht) return { name: ht, from: 'heading inside' }; }
    var tid = node.getAttribute && (node.getAttribute('data-testid') || node.getAttribute('data-test-id') || node.getAttribute('data-cy'));
    if (tid) return { name: tid, from: 'data-testid' };
    if (own) return { name: own.slice(0, 70), from: 'visible text' };
    return { name: '', from: '' };
  }

  // Where on the page this lives, in words: "Settings › Billing (section)".
  var REGION_SEL = 'main,nav,aside,header,footer,form,section,article,dialog,fieldset,table,' +
    '[role=main],[role=navigation],[role=region],[role=dialog],[role=banner],[role=contentinfo],' +
    '[role=search],[role=form],[role=tabpanel],[role=list],[role=table]';
  function regionOf(node) {
    var out = [], cur = node.parentElement, guard = 0;
    while (cur && guard++ < 50 && out.length < 3) {
      var hit = false;
      try { hit = cur.matches && cur.matches(REGION_SEL); } catch (e) {}
      if (hit) {
        var nm = cur.getAttribute('aria-label') || '';
        if (!nm) {
          var lb = cur.getAttribute('aria-labelledby');
          if (lb) { var e2 = document.getElementById(lb.split(/\s+/)[0]); nm = e2 ? txt(e2, 40) : ''; }
        }
        var kind = roleOf(cur);
        // A page-level landmark must not borrow a heading that belongs to a section inside it.
        var BROAD = kind === 'main' || kind === 'navigation' || kind === 'banner' || kind === 'contentinfo';
        if (!nm && !BROAD) { var h = cur.querySelector('h1,h2,h3,h4,legend,caption'); if (h) nm = txt(h, 40); }
        if (!nm) nm = cur.getAttribute('data-testid') || '';
        var label = nm ? nm + ' (' + kind + ')' : kind;
        if (out.indexOf(label) === -1) out.push(label);
      }
      cur = cur.parentElement;
    }
    return out.reverse().join(' › ');
  }

  function domPath(node) {
    var parts = [], cur = node, g = 0;
    while (cur && cur.nodeType === 1 && cur.tagName !== 'BODY' && g++ < 9) {
      var t = cur.tagName.toLowerCase();
      var r = cur.getAttribute('role'); if (r) t += '[' + r + ']';
      if (cur.id) t += '#' + cur.id;
      parts.unshift(t);
      cur = cur.parentElement;
    }
    return 'body > ' + parts.join(' > ');
  }

  // ---------- picking ----------
  function target(e) { var p = e.composedPath ? e.composedPath() : [e.target]; return p[0]; }
  function inHost(n) { while (n) { if (n === host) return true; n = n.parentNode || n.host; } return false; }

  function setPicking(v) {
    picking = v;
    panel.querySelector('[data-a=pick]').classList.toggle('on', v);
    document.documentElement.style.cursor = v ? 'crosshair' : '';
    if (v) hideTip();
    if (!v) { hl.style.display = 'none'; hlTag.style.display = 'none'; hovered = null; }
  }

  function paint(node) {
    if (!node || !node.getBoundingClientRect) return;
    var r = node.getBoundingClientRect();
    hl.style.display = 'block';
    hl.style.left = r.left + 'px'; hl.style.top = r.top + 'px';
    hl.style.width = r.width + 'px'; hl.style.height = r.height + 'px';
    var fw = framework(node), lab = labelOf(node);
    hlTag.textContent = (lab.name ? '"' + lab.name + '" · ' : '') + roleOf(node) +
      (fw.component ? ' · <' + fw.component + '>' : '') +
      ' · ' + Math.round(r.width) + '×' + Math.round(r.height);
    hlTag.style.display = 'block';
    hlTag.style.left = Math.max(2, r.left) + 'px';
    hlTag.style.top = (r.top > 22 ? r.top - 22 : r.bottom + 4) + 'px';
  }

  function onMove(e) {
    if (!picking) return;
    var t = target(e);
    if (inHost(t) || !t || t.nodeType !== 1) return;
    hovered = t; paint(t);
  }
  function swallow(e) {
    var tt = target(e);
    if (recording && e.type === 'click' && !inHost(tt)) { traceClick = tt; return; }
    if (!picking) return;
    var t = tt;
    if (inHost(t)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (e.type === 'click') { setPicking(false); openComposer(t); }
  }

  // ---------- trace: 3-2-1, then use the app for real ----------
  function armTrace() {
    if (recording) { stopTrace(); return; }
    setPicking(false); closeComposer(); closeReview();
    var n = 3;
    cd.style.display = 'flex';
    cd.firstChild.textContent = n;
    var t = setInterval(function () {
      n--;
      if (n > 0) { cd.firstChild.textContent = n; return; }
      clearInterval(t);
      cd.firstChild.textContent = 'GO';
      setTimeout(function () { cd.style.display = 'none'; startTrace(); }, 450);
    }, 700);
  }

  function startTrace() {
    recording = true; traceFrom = Date.now(); traceClick = null;
    rec.style.display = 'flex';
    var t0 = Date.now();
    traceTick = setInterval(function () {
      var secs = ((Date.now() - t0) / 1000).toFixed(0);
      rec.querySelector('.txt').textContent =
        'Recording ' + secs + 's · ' + callsSince(traceFrom).length + ' call(s)';
      render();
    }, 500);
    render();
  }

  function stopTrace() {
    if (!recording) return;
    recording = false;
    clearInterval(traceTick); traceTick = 0;
    rec.style.display = 'none';
    pendingCalls = callsSince(traceFrom);
    var node = traceClick; traceClick = null;
    render();
    if (node && node.isConnected) openComposer(node);
    else { setPicking(true); flash(pendingCalls.length + ' call(s) captured — pick the element'); }
  }

  // ---------- composer ----------
  function openComposer(node) {
    composerTarget = node;
    var r = node.getBoundingClientRect();
    cmpSel.textContent = cssPath(node) +
      (pendingCalls && pendingCalls.length ? '  ·  ' + pendingCalls.length + ' backend call(s) captured' : '');
    taEl.value = '';
    cmp.style.display = 'block';
    var top = r.bottom + 8, left = r.left;
    if (top + 170 > innerHeight) top = Math.max(8, r.top - 170);
    if (left + 320 > innerWidth) left = Math.max(8, innerWidth - 320);
    cmp.style.top = top + 'px'; cmp.style.left = left + 'px';
    paint(node);
    taEl.focus();
  }
  function closeComposer() {
    cmp.style.display = 'none'; composerTarget = null;
    hl.style.display = 'none'; hlTag.style.display = 'none';
  }
  function saveNote() {
    if (!composerTarget) return;
    var body = taEl.value.trim();
    if (!body) { closeComposer(); return; }

    var node = composerTarget, r = node.getBoundingClientRect(), fw = framework(node);
    var lab = labelOf(node), pr = propsOf(node);
    var calls = pendingCalls && pendingCalls.length ? pendingCalls : callsSince(Date.now() - 15000);
    pendingCalls = null;
    notes.push({
      id: ++seq, note: body, selector: cssPath(node), tag: node.tagName.toLowerCase(),
      name: lab.name, nameFrom: lab.from, role: roleOf(node), region: regionOf(node), path: domPath(node),
      desc: describe(node), text: textOf(node), file: fw.file || '', component: fw.component || '',
      calls: calls, props: pr.names, handlers: pr.handlers,
      rect: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
      url: location.href, title: document.title, ts: Date.now()
    });
    persist(); closeComposer(); draft = null; render(); setPicking(true);
  }
  function persist() { set(KEY, JSON.stringify(notes)); }

  // ---------- scope ----------
  function siteNotes() {
    var out = [], keys = [];
    try { for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i)); } catch (e) {}
    keys.filter(function (k) { return k && k.indexOf(PREFIX + location.origin) === 0; }).sort().forEach(function (k) {
      var arr = k === KEY ? notes : read(k);
      arr.forEach(function (n) { out.push(Object.assign({ _key: k }, n)); });
    });
    return out;
  }
  // Every page on this origin that holds notes — the cross-page collection.
  function pageIndex() {
    var out = [], keys = [];
    try { for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i)); } catch (e) {}
    keys.filter(function (k) { return k && k.indexOf(PREFIX + location.origin) === 0; }).sort().forEach(function (k) {
      var arr = k === KEY ? notes : read(k);
      if (!arr.length) return;
      out.push({
        key: k,
        path: k.slice((PREFIX + location.origin).length) || '/',
        url: (arr[0] && arr[0].url) || (location.origin + k.slice((PREFIX + location.origin).length)),
        title: (arr[0] && arr[0].title) || '',
        count: arr.length,
        here: k === KEY
      });
    });
    return out;
  }

  function inScope() {
    return scopeIs('site') ? siteNotes() : notes.map(function (n) { return Object.assign({ _key: KEY }, n); });
  }
  function removeNote(key, id) {
    var arr = key === KEY ? notes : read(key);
    arr = arr.filter(function (n) { return String(n.id) !== String(id); });
    if (key === KEY) { notes = arr; persist(); } else set(key, JSON.stringify(arr));
  }
  function updateNote(key, id, txt) {
    var arr = key === KEY ? notes : read(key);
    arr.forEach(function (n) { if (String(n.id) === String(id)) n.note = txt; });
    if (key === KEY) { notes = arr; persist(); } else set(key, JSON.stringify(arr));
  }

  // ---------- render ----------
  var view = 'notes';   // 'notes' | 'pages'
  var overlay = get(OKEY) !== '0';   // draw the outline over every noted element

  function render() {
    var set_ = inScope();
    var idx = pageIndex();
    var total = idx.reduce(function (m, p) { return m + p.count; }, 0);
    panel.querySelector('.sub').textContent =
      notes.length + ' on this page · ' + total + ' across ' + idx.length + ' page' + (idx.length === 1 ? '' : 's') +
      ' · copying ' + (scopeIs('site') ? 'all of them' : 'this page only');
    panel.querySelector('b').textContent = 'Loknot (' + set_.length + ')';
    panel.querySelector('[data-a=pages]').classList.toggle('on', view === 'pages');
    panel.querySelector('[data-a=overlay]').classList.toggle('on', overlay);
    var tb = panel.querySelector('[data-a=trace]');
    tb.classList.toggle('on', recording);
    tb.innerHTML = recording ? svg('stop') + '<span>Stop</span>' : svg('trace') + '<span>Trace</span>';
    var th = panel.querySelector('[data-a=theme]');
    var eff = theme === 'auto' ? 'auto' : theme === 'dark' ? 'moon' : 'sun';
    th.innerHTML = svg(eff);
    th.title = 'Theme: ' + theme + ' \u2014 click to cycle auto \u2192 light \u2192 dark';
    panel.querySelector('[data-a=settings]').classList.toggle('on', view === 'settings');
    if (view === 'settings') { renderSettings(); placeMarks(); return; }
    if (view === 'pages') { renderPages(idx); placeMarks(); return; }
    listEl.innerHTML = '';
    if (!set_.length) {
      var e0 = el('div', 'empty');
      e0.innerHTML = 'Press <b>&#8984;/Ctrl+Shift+L</b> (or <b>Lock</b>), click any element, write a note.';
      listEl.appendChild(e0);
    } else {
      var lastUrl = null, i = 0;
      set_.forEach(function (n) {
        i++;
        if (scopeIs('site') && n.url !== lastUrl) {
          lastUrl = n.url;
          var g = el('div', 'grp');
          g.textContent = n.url === location.href ? '● this page' : n.url.replace(location.origin, '');
          listEl.appendChild(g);
        }
        var it = el('div', 'item');
        var num = el('div', 'n'); num.textContent = i;
        var b = el('div', 'b');
        var t = el('div', 't'); t.textContent = n.note;
        var s = el('div', 'sel');
        s.textContent = (n.name ? '"' + n.name + '" · ' : '') + (n.role ? n.role + ' · ' : '') +
          (n.component ? '<' + n.component + '> · ' : '') + n.selector;
        b.appendChild(t); b.appendChild(s);
        var x = el('button', 'x'); x.innerHTML = '&times;'; x.title = 'Delete';
        x.addEventListener('click', function () { removeNote(n._key, n.id); draft = null; render(); });
        t.addEventListener('click', function () { editInline(t, n); });
        it.appendChild(num); it.appendChild(b); it.appendChild(x);
        listEl.appendChild(it);
      });
    }
    placeMarks();
  }

  function renderSettings() {
    listEl.innerHTML = '';
    var box = el('div', 'set');

    var cap = el('div', 'cap'); cap.textContent = 'Preset'; box.appendChild(cap);
    var seg = el('div', 'seg');
    [['quick', 'Quick'], ['standard', 'Standard'], ['full', 'Full']].forEach(function (p) {
      var b = el('button', cfg.preset === p[0] ? 'on' : '');
      b.setAttribute('data-a', 'preset'); b.setAttribute('data-v', p[0]);
      b.textContent = p[1];
      seg.appendChild(b);
    });
    if (cfg.preset === 'custom') {
      var c = el('span', 'cap'); c.textContent = ' custom'; seg.appendChild(c);
    }
    box.appendChild(seg);

    var capS = el('div', 'cap'); capS.textContent = 'Which notes get copied'; box.appendChild(capS);
    var sseg = el('div', 'seg');
    [['site', 'Whole site'], ['page', 'This page only']].forEach(function (o) {
      var b = el('button', scopeIs(o[0]) ? 'on' : '');
      b.setAttribute('data-a', 'scope'); b.setAttribute('data-v', o[0]);
      b.textContent = o[1];
      sseg.appendChild(b);
    });
    box.appendChild(sseg);

    var cap2 = el('div', 'cap'); cap2.textContent = 'Per note'; box.appendChild(cap2);
    var lock = el('label', 'row lock');
    lock.innerHTML = '<input type="checkbox" checked disabled><span>Your note (always)</span>';
    box.appendChild(lock);

    FIELDS.forEach(function (f) {
      var row = el('label', 'row');
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = on(f.k);
      cb.addEventListener('change', function () {
        cfg.fields = cb.checked ? cfg.fields.concat([f.k]) : cfg.fields.filter(function (x) { return x !== f.k; });
        var match = Object.keys(PRESETS).filter(function (p) {
          return PRESETS[p].length === cfg.fields.length &&
            PRESETS[p].every(function (x) { return on(x); });
        })[0];
        cfg.preset = match || 'custom';
        saveCfg(); draft = null; render();
      });
      var t = el('span', ''); t.textContent = f.l;
      row.appendChild(cb); row.appendChild(t);
      box.appendChild(row);
    });

    var cap3 = el('div', 'cap'); cap3.textContent = 'Once per export'; box.appendChild(cap3);
    var erow = el('label', 'row');
    var ecb = document.createElement('input');
    ecb.type = 'checkbox'; ecb.checked = cfg.env;
    ecb.addEventListener('change', function () { cfg.env = ecb.checked; saveCfg(); draft = null; render(); });
    var et = el('span', ''); et.textContent = 'Environment (browser, OS, device, screen, time)';
    erow.appendChild(ecb); erow.appendChild(et);
    box.appendChild(erow);

    var chars = markdown().length;
    var est = el('div', 'est');
    est.textContent = '≈ ' + (chars > 1000 ? (chars / 1000).toFixed(1) + 'k' : chars) + ' chars · ' +
      '~' + Math.round(chars / 4) + ' tokens for ' + inScope().length + ' note(s)';
    box.appendChild(est);

    listEl.appendChild(box);
  }

  function renderPages(idx) {
    listEl.innerHTML = '';
    if (get('loknot::followok') !== '1') {
      var warn = el('div', 'grp');
      warn.textContent = 'Opening another page unloads Loknot — press \u2318/Ctrl+Shift+L there, ' +
        'or right-click \u2192 "Loknot: keep overlays across page loads".';
      warn.style.whiteSpace = 'normal';
      listEl.appendChild(warn);
    }
    if (!idx.length) {
      var e1 = el('div', 'empty'); e1.textContent = 'No notes stored for ' + location.origin + ' yet.';
      listEl.appendChild(e1); return;
    }
    idx.forEach(function (p) {
      var row = el('div', 'pg' + (p.here ? ' here' : ''));
      var c = el('div', 'c'); c.textContent = p.count;
      var u = el('div', 'u'); u.textContent = (p.here ? '● ' : '') + (p.title ? p.title + ' — ' : '') + p.path;
      u.title = p.url;
      row.appendChild(c); row.appendChild(u);
      if (!p.here) {
        var go = el('button', ''); go.textContent = 'Open';
        go.addEventListener('click', function (e) { e.stopPropagation(); location.href = p.url; });
        row.appendChild(go);
      }
      row.addEventListener('click', function () { if (!p.here) location.href = p.url; });
      listEl.appendChild(row);
    });
  }

  function editInline(tEl, n) {
    var ta = document.createElement('textarea');
    ta.value = n.note; ta.style.height = Math.max(52, tEl.offsetHeight + 22) + 'px';
    tEl.replaceWith(ta); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    function done(commit) {
      if (commit) { var v = ta.value.trim(); if (v) { updateNote(n._key, n.id, v); draft = null; } }
      render();
    }
    ta.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); done(false); }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); done(true); }
    });
    ta.addEventListener('blur', function () { done(true); });
  }

  function showTip(n, x, y) {
    tip.innerHTML = '';
    var who = el('span', 'who');
    who.textContent = (n.name ? '"' + n.name + '" · ' : '') + (n.role || n.tag) +
      (n.region ? ' · ' + n.region : '');
    tip.appendChild(who);
    tip.appendChild(document.createTextNode(n.note));
    tip.style.display = 'block';
    var w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(Math.max(6, x), innerWidth - w - 6) + 'px';
    tip.style.top = (y - h - 10 > 6 ? y - h - 10 : y + 22) + 'px';
  }
  function hideTip() { tip.style.display = 'none'; }

  function placeMarks() {
    marks.innerHTML = '';
    if (!overlay) { hideTip(); return; }   // one switch for boxes AND numbers
    // Walk the same ordered set the panel lists, so a badge on the page and its row
    // in the panel always carry the same number. Only this page can be drawn.
    inScope().forEach(function (n, i) {
      if (n._key && n._key !== KEY) return;
      var node = null;
      try { node = document.querySelector(n.selector); } catch (e) {}
      var l, t, w, h, stale = !node;
      if (node) { var r = node.getBoundingClientRect(); l = r.left; t = r.top; w = r.width; h = r.height; }
      else { l = n.rect.x - scrollX; t = n.rect.y - scrollY; w = n.rect.w; h = n.rect.h; }
      if (t + h < -40 || t > innerHeight + 40) return;

      if (w > 0 && h > 0) {
        var box = el('div', 'nbox' + (stale ? ' stale' : ''));
        box.style.left = l + 'px'; box.style.top = t + 'px';
        box.style.width = w + 'px'; box.style.height = h + 'px';
        marks.appendChild(box);
      }

      var m = el('div', 'mark');
      m.textContent = i + 1;
      m.style.left = Math.max(2, l - 10) + 'px';
      m.style.top = Math.max(2, t - 10) + 'px';
      m.title = stale ? 'This element is no longer on the page' : '';
      m.addEventListener('mouseenter', function () { showTip(n, l, t); });
      m.addEventListener('mouseleave', hideTip);
      m.addEventListener('click', function () {
        if (node) { node.scrollIntoView({ block: 'center', behavior: 'smooth' }); paint(node); }
      });
      marks.appendChild(m);
    });
  }

  // ---------- export ----------
  function markdown() {
    var set_ = inScope();
    var head = '# UI notes (Loknot) — ' + set_.length + ' note(s)\n' +
      (scopeIs('site') ? 'Site: ' + location.origin : 'Page: ' + location.href) + '\n';
    if (cfg.env) head += envLine() + '\n';
    head += '\nEach item is an element I selected in the browser plus what I want changed.\n';

    var lastUrl = null, i = 0, body = '';
    set_.forEach(function (n) {
      i++;
      if (on('page') && n.url !== lastUrl) {
        lastUrl = n.url;
        body += '\n## [' + (n.title || n.url) + '](' + n.url + ')\n';
      }
      var id = n.name ? '"' + n.name + '" (' + (n.role || n.tag) + ')'
                      : '<' + n.tag + '>' + (n.selector ? ' ' + n.selector : '');
      var L = ['\n### ' + i + '. ' + id];
      L.push('- **Note:** ' + n.note.replace(/\n/g, '\n  '));
      if (on('page')) L.push('- **Page:** ' + n.url);
      if (on('name')) {
        if (n.name) L.push('- **Name:** "' + n.name + '" — ' + (n.role || n.tag) +
          (n.nameFrom ? ' (from ' + n.nameFrom + ')' : ''));
        else if (n.role) L.push('- **Role:** ' + n.role);
      }
      if (on('element')) L.push('- **Element:** `' + n.desc + '`');
      if (on('text') && n.text) L.push('- **Text:** "' + n.text + '"');
      if (on('region') && n.region) L.push('- **Region:** ' + n.region);
      if (on('selector')) L.push('- **Selector:** `' + n.selector + '`');
      if (on('component') && n.component) L.push('- **Component:** `<' + n.component + '>`');
      if (on('source') && n.file) L.push('- **Source:** `' + n.file + '`');
      if (on('dompath') && n.path) L.push('- **DOM path:** `' + n.path + '`');
      if (on('props') && n.props && n.props.length) L.push('- **Props:** `' + n.props.join('`, `') + '`');
      if (on('handlers')) (n.handlers || []).forEach(function (h) {
        L.push('- **Handler ' + h.name + ':** `' + (h.src || h.fn) + '`');
      });
      if (on('calls') && n.calls && n.calls.length) {
        L.push('- **Backend calls around this interaction:**');
        n.calls.forEach(function (c) {
          L.push('  - `' + c.m + ' ' + c.path + '` → ' + (c.status === '' ? '?' : c.status) +
            (c.ms ? ' · ' + c.ms + 'ms' : '') + (c.host ? ' · ' + c.host : '') +
            (c.svc ? ' · **' + c.svc + '**' : '') +
            (c.req ? ' · req ' + c.req : '') + (c.res ? ' · res ' + c.res : '') +
            (c.type === 'before Loknot loaded' ? ' _(seen before Loknot loaded)_' : ''));
        });
      }
      if (on('box')) L.push('- **Box:** x=' + n.rect.x + ' y=' + n.rect.y + ' w=' + n.rect.w + ' h=' + n.rect.h);
      body += L.join('\n') + '\n';
    });
    return head + body;
  }

  function payload() { return draft !== null ? draft : markdown(); }

  function copy() {
    var txt = payload();
    var done = function () { flash('Copied ' + inScope().length + ' note(s)'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fb);
    else fb();
    function fb() {
      var ta = document.createElement('textarea');
      ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0;top:0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { flash('Copy failed — see console'); console.log(txt); }
      ta.remove();
    }
  }
  function download() {
    var b = new Blob([payload()], { type: 'text/markdown' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = 'loknot-' + location.hostname + '-' + Date.now() + '.md';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function flash(msg) {
    var b = panel.querySelector('b'), old = b.textContent;
    b.textContent = msg;
    setTimeout(function () { b.textContent = old; }, 1500);
  }

  // ---------- review pane ----------
  // Small, dependency-free markdown -> HTML. Everything is escaped first, so the
  // rendered preview can never execute what a note happens to contain.
  function esch(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function inline(t) {
    return t
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      // only ever link out to real web schemes — a note must not be able to smuggle
      // javascript: or data: into the preview
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>')
      .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noreferrer noopener">$2</a>');
  }
  function mdHtml(src) {
    var lines = esch(src).split('\n'), out = [], list = 0, fence = false, para = [];
    function flushP() { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } }
    function closeList() { while (list > 0) { out.push('</ul>'); list--; } }
    lines.forEach(function (ln) {
      if (/^```/.test(ln.trim())) {
        flushP(); closeList();
        out.push(fence ? '</code></pre>' : '<pre><code>');
        fence = !fence; return;
      }
      if (fence) { out.push(ln); return; }
      var m;
      if ((m = ln.match(/^(#{1,4})\s+(.*)$/))) {
        flushP(); closeList();
        var lv = Math.min(m[1].length, 3);
        out.push('<h' + lv + '>' + inline(m[2]) + '</h' + lv + '>'); return;
      }
      if ((m = ln.match(/^(\s*)[-*]\s+(.*)$/))) {
        flushP();
        var depth = m[1].length >= 2 ? 2 : 1;
        while (list < depth) { out.push('<ul>'); list++; }
        while (list > depth) { out.push('</ul>'); list--; }
        out.push('<li>' + inline(m[2]) + '</li>'); return;
      }
      if (!ln.trim()) { flushP(); closeList(); return; }
      closeList(); para.push(ln.trim());
    });
    flushP(); closeList();
    if (fence) out.push('</code></pre>');
    return out.join('\n');
  }

  function setModView(v) {
    modView = v;
    var editing = v === 'edit';
    modTa.style.display = editing ? 'block' : 'none';
    modPrev.style.display = editing ? 'none' : 'block';
    veil.querySelector('[data-a=medit]').classList.toggle('on', editing);
    veil.querySelector('[data-a=mprev]').classList.toggle('on', !editing);
    veil.querySelector('.mod .hd b').textContent = editing ? 'Edit' : 'Review';
    modHint.textContent = editing
      ? 'Copy takes what is in this box. \u2318/Ctrl+Enter copies.'
      : 'Click the text to edit it.';
    if (editing) modTa.focus(); else modPrev.innerHTML = mdHtml(modTa.value);
  }

  function openReview() {
    setPicking(false);
    modTa.value = payload();
    modBadge.textContent = inScope().length + ' note(s) · ' + (scopeIs('site') ? 'whole site' : 'this page');
    veil.style.display = 'flex';
    setModView('preview');
  }
  function closeReview() {
    if (veil.style.display === 'flex') draft = modTa.value;
    veil.style.display = 'none';
  }

  // ---------- route changes ----------
  // Single-page apps swap the whole screen without a reload, so watch history and
  // re-key to the new path: the overlays for THAT page appear the moment you land.
  var reanchor = 0;
  function onRoute() {
    var k = keyFor();
    if (k === KEY) { placeMarks(); return; }
    KEY = k;
    notes = read(KEY);
    seq = notes.reduce(function (m, n) { return Math.max(m, n.id || 0); }, 0);
    draft = null;
    render();
    if (notes.length) flash(notes.length + ' note(s) on this view');
    // the app usually paints after the URL changes, so re-place a few times
    [150, 500, 1200, 2500].forEach(function (d) { setTimeout(placeMarks, d); });
  }

  ['pushState', 'replaceState'].forEach(function (m) {
    var o = history[m];
    if (o && !o.__loknot) {
      var w = function () { var r = o.apply(this, arguments); setTimeout(onRoute, 0); return r; };
      w.__loknot = 1; history[m] = w;
      patched.push(function () { if (history[m] === w) history[m] = o; });
    }
  });

  // Keep the boxes glued to elements while the app re-renders underneath them.
  var mo = null;
  try {
    mo = new MutationObserver(function () {
      if (reanchor) return;
      reanchor = setTimeout(function () { reanchor = 0; placeMarks(); }, 250);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  // ---------- events ----------
  panel.addEventListener('click', function (e) {
    var a = e.target.getAttribute && e.target.getAttribute('data-a');
    if (!a) return;
    if (a === 'pick') setPicking(!picking);
    else if (a === 'review') openReview();
    else if (a === 'copy') copy();
    else if (a === 'md') download();
    else if (a === 'theme') cycleTheme();
    else if (a === 'scope') {
      cfg.scope = e.target.getAttribute('data-v') || 'site';
      saveCfg(); draft = null; render();
    }
    else if (a === 'pages') { view = view === 'pages' ? 'notes' : 'pages'; render(); }
    else if (a === 'settings') { view = view === 'settings' ? 'notes' : 'settings'; render(); }
    else if (a === 'preset') {
      cfg.preset = e.target.getAttribute('data-v');
      cfg.fields = PRESETS[cfg.preset].slice();
      saveCfg(); draft = null; render();
    }
    else if (a === 'overlay') { overlay = !overlay; set(OKEY, overlay ? '1' : '0'); render(); }
    else if (a === 'trace') { armTrace(); }
    else if (a === 'clear') {
      var n = inScope().length;
      if (!n) { flash('Nothing to delete'); return; }
      confirmAsk('Delete ' + n + ' note' + (n === 1 ? '' : 's') + ' ' +
        (scopeIs('site') ? 'from every page on ' + location.host : 'on this page') +
        '? This cannot be undone.', function () {
          if (scopeIs('site')) inScope().forEach(function (x) { removeNote(x._key, x.id); });
          else { notes = []; persist(); }
          draft = null; render();
          flash('Deleted ' + n + ' note' + (n === 1 ? '' : 's'));
        });
    } else if (a === 'close') destroy();
  });

  // In-panel confirmation, so we never hand the user a raw browser dialog.
  var askYes = null;
  function confirmAsk(msg, onYes) {
    ask.querySelector('p').textContent = msg;
    askYes = onYes;
    ask.style.display = 'flex';
  }
  ask.addEventListener('click', function (e) {
    var a = e.target.getAttribute && e.target.getAttribute('data-a');
    if (a === 'askyes') { ask.style.display = 'none'; var f = askYes; askYes = null; if (f) f(); }
    else if (a === 'askno' || e.target === ask) { ask.style.display = 'none'; askYes = null; }
  });

  rec.addEventListener('click', function (e) {
    if (e.target.getAttribute && e.target.getAttribute('data-a') === 'stoptrace') stopTrace();
  });

  cmp.addEventListener('click', function (e) {
    var a = e.target.getAttribute && e.target.getAttribute('data-a');
    if (a === 'save') saveNote(); else if (a === 'cancel') closeComposer();
  });
  taEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveNote(); }
    if (e.key === 'Escape') { e.preventDefault(); closeComposer(); }
    e.stopPropagation();
  });

  veil.addEventListener('click', function (e) {
    if (e.target === veil) { closeReview(); return; }
    var a = e.target.getAttribute && e.target.getAttribute('data-a');
    if (a === 'mcopy') { draft = modTa.value; copy(); }
    else if (a === 'mdl') { draft = modTa.value; download(); }
    else if (a === 'regen') { draft = null; modTa.value = markdown(); setModView(modView); }
    else if (a === 'medit') setModView('edit');
    else if (a === 'mprev') setModView('preview');
    else if (a === 'mclose') closeReview();
    else if (modView === 'preview' && modPrev.contains(e.target) && e.target.tagName !== 'A') setModView('edit');
  });
  modTa.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); draft = modTa.value; copy(); }
    if (e.key === 'Escape') { e.preventDefault(); closeReview(); }
  });

  // The extension and the userscript own the hotkey themselves (the browser fires it
  // before the page does), so the core only binds it when it is running standalone.
  var OWNS_HOTKEY = !window.__LOKNOT_HOST;
  function onKey(e) {
    if (OWNS_HOTKEY && e.shiftKey && (e.metaKey || e.ctrlKey) && (e.key === 'L' || e.key === 'l')) {
      e.preventDefault(); e.stopPropagation();
      if (recording) stopTrace(); else setPicking(!picking);
      return;
    }
    if (e.key === 'Escape') {
      if (ask.style.display === 'flex') { ask.style.display = 'none'; askYes = null; return; }
      if (recording) { stopTrace(); return; }
      if (veil.style.display === 'flex') closeReview();
      else if (cmp.style.display === 'block') closeComposer();
      else if (picking) setPicking(false);
    }
  }
  function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0; placeMarks();
      if (picking && hovered) paint(hovered);
      if (composerTarget) paint(composerTarget);
    });
  }

  (function drag() {
    var hd = panel.querySelector('.hd'), sx = 0, sy = 0, px = 0, py = 0, on = false;
    hd.addEventListener('mousedown', function (e) {
      if (e.target.tagName === 'BUTTON') return;
      on = true; sx = e.clientX; sy = e.clientY;
      var r = panel.getBoundingClientRect(); px = r.left; py = r.top;
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
      panel.style.left = px + 'px'; panel.style.top = py + 'px';
      e.preventDefault();
    });
    addEventListener('mousemove', function (e) {
      if (!on) return;
      panel.style.left = (px + e.clientX - sx) + 'px';
      panel.style.top = (py + e.clientY - sy) + 'px';
    }, true);
    addEventListener('mouseup', function () { on = false; }, true);
  })();

  var L = [
    ['mousemove', onMove, true], ['mouseover', onMove, true],
    ['click', swallow, true], ['mousedown', swallow, true], ['mouseup', swallow, true],
    ['keydown', onKey, true], ['scroll', onScroll, true], ['resize', onScroll, true],
    ['popstate', onRoute, false], ['hashchange', onRoute, false]
  ];
  L.forEach(function (a) { addEventListener(a[0], a[1], a[2]); });

  function destroy() {
    L.forEach(function (a) { removeEventListener(a[0], a[1], a[2]); });
    if (mq && mq.removeEventListener) mq.removeEventListener('change', applyTheme);
    document.documentElement.style.cursor = '';
    if (mo) mo.disconnect();
    if (reanchor) clearTimeout(reanchor);
    patched.forEach(function (undo) { try { undo(); } catch (e) {} });
    if (traceTick) clearInterval(traceTick);
    set(FKEY, '0');            // stop the extension re-injecting after navigations
    host.remove(); delete window[NS];
  }

  window[NS] = {
    get notes() { return inScope(); },
    togglePick: function () { setPicking(!picking); },
    trace: armTrace,
    stopTrace: stopTrace,
    get network() { return netlog.slice(); },
    markdown: markdown, copy: copy, review: openReview, destroy: destroy,
    pick: function () { setPicking(true); },
    theme: function (t) { theme = t || 'auto'; set(TKEY, theme); applyTheme(); }
  };
  applyTheme(); render();
  // A user-triggered load drops you straight into selector mode; an automatic
  // re-load after a navigation just restores the panel and the numbered markers.
  setPicking(!AUTO);
  window.__uiNotes = window[NS];   // legacy alias
})();
