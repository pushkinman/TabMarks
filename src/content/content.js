// TabMarks content script (top frame only). Self-contained: no imports.
// - Prefixes document.title with the mark (and keeps it there when the page changes its title)
// - Swaps the favicon for the rendered marked icon (and follows page favicon changes)
// - Shows the floating note in a closed shadow root

(() => {
  const INSTANCE = Math.random().toString(36).slice(2);
  const TEARDOWN_EVT = 'tabmarks:teardown';

  // Ask any orphaned instance (from a previous extension load) to restore the page.
  document.dispatchEvent(new CustomEvent(TEARDOWN_EVT, { detail: INSTANCE }));

  const S = {
    alive: true,
    prefix: '',
    realTitle: null, // page title without our prefix; null while inactive
    favicon: null,
    ourLink: null,
    restoreLink: null,
    observer: null,
    iconHrefs: [],
    note: null,
    editing: false,
    host: null,
    root: null,
    ui: null,
    timers: {},
  };

  // ---------------------------------------------------------------------------
  // Messaging

  function isDeadError(e) {
    return /context invalidated|Extension context|Receiving end does not exist/i.test(String(e?.message || e));
  }

  function send(msg) {
    if (!S.alive) return Promise.resolve(null);
    try {
      return chrome.runtime.sendMessage(msg).catch((e) => {
        if (isDeadError(e) && !chrome.runtime?.id) teardown();
        return null;
      });
    } catch (e) {
      teardown();
      return Promise.resolve(null);
    }
  }

  function debounce(key, fn, ms) {
    clearTimeout(S.timers[key]);
    S.timers[key] = setTimeout(fn, ms);
  }

  // ---------------------------------------------------------------------------
  // Title

  function stripPrefix(t) {
    if (!S.prefix || !t) return t || '';
    return t.split(S.prefix).join('');
  }

  function setTitle(t) {
    if (document.title !== t) document.title = t;
  }

  function applyTitle() {
    if (S.realTitle == null) return;
    setTitle(S.prefix ? S.prefix + S.realTitle : S.realTitle);
  }

  function handleTitleMutation() {
    if (S.realTitle == null) return;
    const want = S.prefix + S.realTitle;
    const cur = document.title;
    if (cur === want) return;
    const real = stripPrefix(cur);
    if (real !== S.realTitle) {
      S.realTitle = real;
      debounce('title', () => send({ type: 'tm:titleChanged', title: S.realTitle }), 400);
    }
    applyTitle();
  }

  // ---------------------------------------------------------------------------
  // Favicon

  function isIconRel(rel) {
    return /(^|\s)icon(\s|$)/i.test(rel || '');
  }

  function pageIconLinks() {
    return Array.from(document.querySelectorAll('link')).filter(
      (l) =>
        l !== S.ourLink &&
        l !== S.restoreLink &&
        (l.hasAttribute('data-tm-rel') || isIconRel(l.getAttribute('rel'))),
    );
  }

  function collectIconHrefs() {
    const scored = [];
    for (const l of pageIconLinks()) {
      const href = l.href;
      if (!href) continue;
      const type = (l.getAttribute('type') || '').toLowerCase();
      const sizes = (l.getAttribute('sizes') || '').toLowerCase();
      let score = 0;
      if (/svg/.test(type) || /\.svg(\?|#|$)/i.test(href)) score -= 10;
      if (/png|x-icon|vnd\.microsoft\.icon/.test(type) || /\.(png|ico)(\?|#|$)/i.test(href)) score += 2;
      if (/\b(16x16|32x32|48x48)\b/.test(sizes)) score += 3;
      if (/\b(192x192|180x180|512x512)\b/.test(sizes)) score += 1;
      scored.push({ href, score });
    }
    scored.sort((a, b) => b.score - a.score);
    const hrefs = scored.map((s) => s.href);
    if (/^https?:$/.test(location.protocol)) hrefs.push(location.origin + '/favicon.ico');
    return Array.from(new Set(hrefs)).slice(0, 6);
  }

  function applyFavicon(dataUrl) {
    const head = document.head;
    if (!head) return;
    for (const l of pageIconLinks()) {
      if (!l.hasAttribute('data-tm-rel')) {
        l.setAttribute('data-tm-rel', l.getAttribute('rel') || '');
        l.setAttribute('rel', 'tm-disabled-icon');
      }
    }
    if (S.restoreLink) {
      S.restoreLink.remove();
      S.restoreLink = null;
    }
    if (!S.ourLink) {
      S.ourLink = document.createElement('link');
      S.ourLink.setAttribute('rel', 'icon');
      S.ourLink.setAttribute('data-tabmarks', '');
    }
    if (S.ourLink.getAttribute('href') !== dataUrl) S.ourLink.setAttribute('href', dataUrl);
    if (!S.ourLink.isConnected) head.appendChild(S.ourLink);
  }

  function removeFavicon() {
    if (!S.ourLink) return;
    S.ourLink.remove();
    S.ourLink = null;
    const disabled = Array.from(document.querySelectorAll('link[data-tm-rel]'));
    for (const l of disabled) {
      l.setAttribute('rel', l.getAttribute('data-tm-rel') || 'icon');
      l.removeAttribute('data-tm-rel');
    }
    // Page had no <link rel=icon>: nudge the browser back to /favicon.ico.
    if (!disabled.length && document.head && /^https?:$/.test(location.protocol)) {
      S.restoreLink = document.createElement('link');
      S.restoreLink.setAttribute('rel', 'icon');
      S.restoreLink.setAttribute('href', location.origin + '/favicon.ico');
      S.restoreLink.setAttribute('data-tabmarks-restore', '');
      document.head.appendChild(S.restoreLink);
    }
  }

  function handleIconMutation() {
    if (!S.favicon) return;
    applyFavicon(S.favicon); // disable newly added page icons, re-add ours if removed
    const hrefs = collectIconHrefs();
    if (JSON.stringify(hrefs) !== JSON.stringify(S.iconHrefs)) {
      S.iconHrefs = hrefs;
      debounce('icons', () => send({ type: 'tm:iconsChanged', iconHrefs: S.iconHrefs }), 300);
    }
  }

  // ---------------------------------------------------------------------------
  // Head observer (only while the tab is marked)

  function onMutations(muts) {
    if (!S.alive) return;
    let title = false;
    let icons = false;
    for (const m of muts) {
      const t = m.target;
      if (t.nodeName === 'TITLE' || t.parentNode?.nodeName === 'TITLE') title = true;
      if (m.type === 'attributes' && t.nodeName === 'LINK' && t !== S.ourLink && t !== S.restoreLink) icons = true;
      for (const n of m.addedNodes) {
        if (n.nodeName === 'TITLE') title = true;
        if (n.nodeName === 'LINK' && n !== S.ourLink && isIconRel(n.getAttribute?.('rel'))) icons = true;
      }
      for (const n of m.removedNodes) {
        if (n === S.ourLink) icons = true;
        if (n.nodeName === 'TITLE') title = true;
      }
    }
    if (title) handleTitleMutation();
    if (icons) handleIconMutation();
  }

  function startObserver() {
    if (S.observer || !document.head) return;
    S.observer = new MutationObserver(onMutations);
    S.observer.observe(document.head, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['rel', 'href'],
    });
  }

  function stopObserver() {
    S.observer?.disconnect();
    S.observer = null;
  }

  // ---------------------------------------------------------------------------
  // Floating note

  const NOTE_CSS = `
    :host { all: initial; }
    .card {
      --accent: #8b8d98; --accent-solid: #8b8d98;
      --bg: rgba(255,255,255,.96); --fg: #16181d; --fg2: #3c4049; --muted: #6b7079;
      --line: rgba(16,24,40,.10); --btn: rgba(16,24,40,.06);
      position: fixed; z-index: 2147483647; width: 288px; max-width: calc(100vw - 24px);
      background: var(--bg); color: var(--fg);
      -webkit-backdrop-filter: blur(14px) saturate(1.4); backdrop-filter: blur(14px) saturate(1.4);
      border: 1px solid var(--line); border-radius: 14px;
      box-shadow: 0 18px 40px -12px rgba(16,24,40,.28), 0 4px 12px rgba(16,24,40,.08);
      font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
      overflow: hidden; display: flex; flex-direction: column;
      animation: tm-in .18s cubic-bezier(.2,.8,.2,1);
    }
    @keyframes tm-in { from { opacity: 0; transform: translateY(6px) scale(.98); } }
    .card.dark {
      --bg: rgba(30,31,37,.94); --fg: #eceef2; --fg2: #c9ccd3; --muted: #8f939c;
      --line: rgba(255,255,255,.10); --btn: rgba(255,255,255,.08);
      box-shadow: 0 18px 40px -12px rgba(0,0,0,.6), 0 4px 12px rgba(0,0,0,.35);
    }
    .strip { height: 3px; background: var(--accent); flex: none; }
    .bar {
      display: flex; align-items: center; gap: 7px; padding: 7px 6px 5px 12px;
      cursor: grab; user-select: none; -webkit-user-select: none; flex: none;
    }
    .bar:active { cursor: grabbing; }
    .title { font-weight: 600; white-space: nowrap; display: inline-flex; align-items: center; gap: 5px; }
    .em { font-family: "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif; line-height: 1; }
    .label {
      display: inline-flex; align-items: center; gap: 4px; min-width: 0; max-width: 150px;
      height: 20px; padding: 0 8px; border-radius: 999px;
      font-size: 11px; font-weight: 500; color: var(--fg2);
      background: color-mix(in srgb, var(--accent-solid) 16%, transparent);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .label:empty { display: none; }
    .label span:last-child { overflow: hidden; text-overflow: ellipsis; }
    .spacer { flex: 1; }
    .btn {
      all: unset; cursor: pointer; width: 24px; height: 24px; border-radius: 7px;
      display: grid; place-items: center; color: var(--muted);
      transition: background .12s, color .12s;
    }
    .btn svg { width: 14px; height: 14px; }
    .btn:hover { background: var(--btn); color: var(--fg); }
    .btn:focus-visible { outline: 2px solid var(--accent-solid); outline-offset: 1px; }
    textarea {
      all: unset; box-sizing: border-box; display: block; width: 100%;
      min-height: 56px; max-height: 45vh; overflow: auto;
      padding: 2px 12px 4px; white-space: pre-wrap; word-wrap: break-word;
      font: inherit; font-size: 13.5px; line-height: 1.55; color: var(--fg); cursor: text;
    }
    textarea::placeholder { color: var(--muted); }
    .foot { font-size: 11px; color: var(--muted); padding: 0 12px 8px; height: 15px; text-align: right; }
    .card.collapsed { width: auto; max-width: 288px; }
    .card.collapsed textarea, .card.collapsed .foot { display: none; }
    .card.collapsed .bar { padding-bottom: 7px; }
    .card.collapsed .spacer { flex: 0 0 4px; }
  `;

  function el(tag, props = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const c of children) e.append(c);
    return e;
  }

  function svgIcon(d) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.6');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('fill', 'none');
    svg.append(path);
    return svg;
  }

  function ensureNoteHost() {
    if (S.host) {
      if (!S.host.isConnected) document.documentElement.appendChild(S.host);
      return;
    }
    const host = document.createElement('tabmarks-note');
    host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
    const root = host.attachShadow({ mode: 'closed' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(NOTE_CSS);
    root.adoptedStyleSheets = [sheet];

    const label = el('span', { class: 'label' });
    const collapseBtn = el('button', { class: 'btn', title: 'Collapse' });
    collapseBtn.append(svgIcon('M4 8h8'));
    const closeBtn = el('button', { class: 'btn', title: 'Hide note on this tab (⌥⇧O or the TabMarks popup brings it back)' });
    closeBtn.append(svgIcon('M4.5 4.5l7 7M11.5 4.5l-7 7'));
    const bar = el(
      'div',
      { class: 'bar' },
      el('span', { class: 'title' }, el('span', { class: 'em' }, '📝'), 'Note'),
      label,
      el('span', { class: 'spacer' }),
      collapseBtn,
      closeBtn,
    );
    const ta = el('textarea', { placeholder: 'Write a note for this tab…', spellcheck: 'true' });
    const foot = el('div', { class: 'foot' });
    const card = el('div', { class: 'card' }, el('div', { class: 'strip' }), bar, ta, foot);
    root.append(card);

    // Keep page keyboard shortcuts (e.g. GitHub hotkeys) from firing while typing.
    for (const type of ['keydown', 'keyup', 'keypress']) {
      card.addEventListener(type, (e) => {
        e.stopPropagation();
        if (type === 'keydown' && e.key === 'Escape') ta.blur();
      });
    }

    ta.addEventListener('focus', () => {
      S.editing = true;
    });
    ta.addEventListener('input', () => {
      autosize();
      foot.textContent = 'Saving…';
      debounce('note', saveNote, 400);
    });
    ta.addEventListener('blur', () => {
      saveNote();
      S.editing = false;
      if (!ta.value.trim()) hideNote();
    });

    collapseBtn.addEventListener('click', () => {
      const collapsed = !card.classList.contains('collapsed');
      setCollapsed(collapsed);
      send({ type: 'tm:noteState', collapsed });
    });
    closeBtn.addEventListener('click', () => {
      saveNote();
      S.editing = false;
      if (S.note) S.note.hidden = true;
      hideNote();
      if (ta.value.trim()) send({ type: 'tm:noteState', hidden: true });
    });

    // Dragging
    let drag = null;
    bar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.btn') || e.button !== 0) return;
      const r = card.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      bar.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    bar.addEventListener('pointermove', (e) => {
      if (!drag) return;
      placeCard({ x: e.clientX - drag.dx, y: e.clientY - drag.dy });
    });
    bar.addEventListener('pointerup', (e) => {
      if (!drag) return;
      drag = null;
      bar.releasePointerCapture(e.pointerId);
      const r = card.getBoundingClientRect();
      const pos = { x: Math.round(r.left), y: Math.round(r.top) };
      if (S.note) S.note.pos = pos;
      send({ type: 'tm:noteState', pos });
    });
    bar.addEventListener('dblclick', (e) => {
      if (e.target.closest('.btn')) return;
      collapseBtn.click();
    });

    S.host = host;
    S.root = root;
    S.ui = { card, label, ta, foot, collapseBtn };
    document.documentElement.appendChild(host);
    window.addEventListener('resize', onResize);
  }

  function onResize() {
    if (S.ui && S.note?.pos) placeCard(S.note.pos);
  }

  function placeCard(pos) {
    const { card } = S.ui;
    if (!pos) {
      card.style.left = '';
      card.style.top = '';
      card.style.right = '16px';
      card.style.bottom = '16px';
      return;
    }
    const w = card.offsetWidth || 280;
    const h = card.offsetHeight || 40;
    const x = Math.min(Math.max(8, pos.x), Math.max(8, window.innerWidth - w - 8));
    const y = Math.min(Math.max(8, pos.y), Math.max(8, window.innerHeight - h - 8));
    card.style.right = '';
    card.style.bottom = '';
    card.style.left = x + 'px';
    card.style.top = y + 'px';
  }

  function autosize() {
    const { ta } = S.ui;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight + 2, window.innerHeight * 0.45) + 'px';
  }

  function setCollapsed(collapsed) {
    const { card, collapseBtn } = S.ui;
    card.classList.toggle('collapsed', collapsed);
    collapseBtn.replaceChildren(svgIcon(collapsed ? 'M4 8h8M8 4v8' : 'M4 8h8'));
    collapseBtn.title = collapsed ? 'Expand' : 'Collapse';
    if (S.note) S.note.collapsed = collapsed;
    if (S.note?.pos) placeCard(S.note.pos);
  }

  function saveNote() {
    clearTimeout(S.timers.note);
    if (!S.ui) return;
    const text = S.ui.ta.value;
    if (S.note && S.note.text === text) {
      S.ui.foot.textContent = '';
      return;
    }
    if (S.note) S.note.text = text;
    send({ type: 'tm:noteEdit', note: text }).then(() => {
      if (S.ui) S.ui.foot.textContent = text.trim() ? 'Saved' : '';
      debounce('foot', () => S.ui && (S.ui.foot.textContent = ''), 1500);
    });
  }

  function hideNote() {
    if (S.host) S.host.style.display = 'none';
  }

  function noteVisible() {
    return !!S.host && S.host.isConnected && S.host.style.display !== 'none';
  }

  // Shortcut / menu: show the note (or an empty editor), or hide it.
  function toggleNote() {
    if (!S.note) return;
    if (noteVisible()) {
      saveNote();
      S.editing = false;
      S.note.hidden = true;
      S.ui?.ta.blur();
      hideNote();
      if (S.note.text.trim()) send({ type: 'tm:noteState', hidden: true });
      return;
    }
    const wasHidden = S.note.hidden;
    // Works even when floating notes are turned off globally.
    renderNote({ ...S.note, hidden: false, enabled: true }, !S.note.text.trim());
    if (wasHidden && S.note.text.trim()) send({ type: 'tm:noteState', hidden: false });
  }

  function isDark(theme) {
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  }

  function renderNote(n, focus) {
    S.note = n ? { ...n } : null;
    if (!n || !n.enabled) {
      S.editing = false;
      return hideNote();
    }
    if (focus) {
      S.editing = true;
      S.note.hidden = false;
      S.note.collapsed = false;
    }
    const show = !S.note.hidden && (S.note.text.trim() || S.editing);
    if (!show) return hideNote();

    ensureNoteHost();
    S.host.style.display = '';
    const { card, label, ta } = S.ui;
    card.classList.toggle('dark', !!isDark(n.theme));
    card.style.setProperty('--accent', n.accent || '#8b8d98');
    card.style.setProperty('--accent-solid', n.accentSolid || '#8b8d98');
    label.replaceChildren();
    if (n.labelText) {
      if (n.labelEmoji) label.append(el('span', { class: 'em' }, n.labelEmoji));
      label.append(el('span', {}, n.labelText));
    }
    if (S.root.activeElement !== ta && ta.value !== n.text) ta.value = n.text;
    setCollapsed(!!S.note.collapsed);
    placeCard(S.note.pos);
    autosize();
    if (focus) {
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Apply render instructions from the service worker

  function apply(r) {
    if (!S.alive || !r) return;
    const nextPrefix = r.prefix || '';
    const nextFav = r.favicon || null;
    const active = !!(nextPrefix || nextFav);
    if (document.head) {
      if (active && S.realTitle == null) S.realTitle = stripPrefix(document.title);
      S.prefix = nextPrefix;
      applyTitle();
      S.favicon = nextFav;
      if (nextFav) {
        S.iconHrefs = collectIconHrefs();
        applyFavicon(nextFav);
      } else {
        removeFavicon();
      }
      if (active) startObserver();
      else {
        stopObserver();
        S.realTitle = null;
      }
    }
    renderNote(r.note, !!r.focusNote);
  }

  function info() {
    return {
      title: S.realTitle ?? document.title,
      iconHrefs: collectIconHrefs(),
    };
  }

  function onMessage(msg, sender, sendResponse) {
    if (!S.alive || !msg) return;
    if (msg.type === 'tm:ping') {
      sendResponse(info());
    } else if (msg.type === 'tm:render') {
      apply(msg);
      sendResponse({ ok: true });
    } else if (msg.type === 'tm:toggleNote') {
      toggleNote();
      sendResponse({ ok: true });
    }
  }

  function hello() {
    send({ type: 'tm:hello', ...info() }).then(apply);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle

  function teardown() {
    if (!S.alive) return;
    stopObserver();
    if (S.realTitle != null) setTitle(S.realTitle);
    removeFavicon();
    S.restoreLink?.remove();
    S.host?.remove();
    for (const t of Object.values(S.timers)) clearTimeout(t);
    S.alive = false;
    document.removeEventListener(TEARDOWN_EVT, onTeardownEvent);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pageshow', onPageShow);
    try {
      chrome.runtime.onMessage.removeListener(onMessage);
    } catch {
      /* context gone */
    }
  }

  function onTeardownEvent(e) {
    if (e.detail !== INSTANCE) teardown();
  }

  function onPageShow(e) {
    if (e.persisted) hello(); // restored from back/forward cache
  }

  document.addEventListener(TEARDOWN_EVT, onTeardownEvent);
  window.addEventListener('pageshow', onPageShow);
  chrome.runtime.onMessage.addListener(onMessage);
  hello();
})();
