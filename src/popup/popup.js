import { ICON_STYLES, SHOW_ON, TITLE_MARKERS } from '../lib/constants.js';
import {
  allColors,
  applyTheme,
  colorById,
  cssFill,
  cssSolid,
  getMarks,
  isRestrictedUrl,
  labelGroups,
  loadConfig,
  resolveLabel,
  saveSettings,
  visibleColors,
} from '../lib/store.js';
import { SYMBOLS, drawSymbol } from '../lib/symbols.js';
import { drawMarkedIcon, makeFill } from '../lib/favicon.js';

const $ = (s) => document.querySelector(s);

let cfg;
let marks = {};
let tab;
let markable = false;
let view = 'mark';
let activeGroup = localStorage.getItem('tm.group') || null;
let filter = 'all';

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c != null && c !== '') e.append(c);
  return e;
}

/** Emoji + text with proper spacing. */
function labelContent(emoji, text) {
  return [emoji ? el('span', { class: 'emoji' }, emoji) : null, text];
}

function send(type, extra = {}) {
  return chrome.runtime.sendMessage({ type, tabId: tab.id, ...extra });
}

const currentMark = () => marks[tab.id] || null;

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url || '';
  }
}

function faviconFor(url) {
  return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`);
}

// ---------------------------------------------------------------------------
// Views

function setView(name) {
  view = name;
  for (const b of document.querySelectorAll('.views button')) {
    const on = b.dataset.view === name;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  }
  for (const v of ['mark', 'tabs', 'settings']) $(`#view-${v}`).hidden = v !== name;
  if (name === 'mark' && markable) $('#quick').focus();
  if (name === 'tabs') $('#search').focus();
}

// ---------------------------------------------------------------------------
// Header

async function renderHeader() {
  tab = (await chrome.tabs.get(tab.id).catch(() => null)) || tab;
  const m = currentMark();
  $('#tab-title').textContent = m?.title || tab.title || 'Untitled';
  // The tab's live favicon already shows its mark.
  $('#tab-icon').src = tab.favIconUrl || faviconFor(tab.url);
}

// ---------------------------------------------------------------------------
// Current mark pill

function renderCurrent() {
  const m = currentMark();
  const box = $('#current');
  box.replaceChildren();
  const color = colorById(cfg, m?.colorId);
  const label = resolveLabel(m, cfg);
  if (!color && !label) {
    box.append(el('span', { class: 'host ellipsis' }, hostOf(tab.url) + (markable ? '  ·  not marked' : '')));
    return;
  }
  if (color) {
    box.append(
      el(
        'span',
        { class: `tag${m.colorSource === 'rule' ? ' rule' : ''}`, title: m.colorSource === 'rule' ? 'Applied by a rule' : null },
        el('span', { class: 'swatch', style: `background:${cssFill(color)}` }),
        color.name,
        el('button', { class: 'x', title: 'Remove color', onclick: () => send('tm:setColor', { colorId: null }) }, '×'),
      ),
    );
  }
  if (label) {
    box.append(
      el(
        'span',
        { class: `tag${m.labelSource === 'rule' ? ' rule' : ''}` },
        ...labelContent(label.emoji, label.text),
        el('button', { class: 'x', title: 'Remove label', onclick: () => send('tm:setLabel', { labelId: null }) }, '×'),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Quick pick (keyboard-first)

let quickIndex = 0;
let quickItems = [];

function groupLabels() {
  return cfg.labels.filter((l) => (l.group || 'General') === activeGroup);
}

function buildQuickItems(raw) {
  const q = raw.trim().toLowerCase();
  if (!q) return [];
  const score = (s) => {
    s = (s || '').toLowerCase();
    if (!s) return 9;
    if (s.startsWith(q)) return 0;
    if (s.split(/[\s/-]+/).some((w) => w.startsWith(q))) return 1;
    if (s.includes(q)) return 2;
    return 9;
  };
  const items = [];
  for (const l of cfg.labels) {
    const sc = Math.min(score(l.text), score(l.group) + 1.5, l.emoji && l.emoji === raw.trim() ? 0 : 9);
    if (sc < 9) items.push({ kind: 'label', sc, l });
  }
  for (const c of visibleColors(cfg)) {
    const sc = score(c.name);
    if (sc < 9) items.push({ kind: 'color', sc: sc + 0.25, c });
  }
  items.sort((a, b) => a.sc - b.sc);
  items.push({ kind: 'custom', text: raw.trim().slice(0, 60) });
  return items;
}

function updateKbdHints() {
  const q = $('#quick');
  document.body.classList.toggle('kbd-hints', document.activeElement === q && !q.value);
}

function renderQuick() {
  const raw = $('#quick').value;
  quickItems = buildQuickItems(raw);
  const box = $('#quick-results');
  box.hidden = !quickItems.length;
  updateKbdHints();
  if (!quickItems.length) return;
  quickIndex = Math.min(quickIndex, quickItems.length - 1);
  box.replaceChildren(
    ...quickItems.map((it, i) => {
      let body;
      if (it.kind === 'label') {
        const color = colorById(cfg, it.l.colorId);
        body = [
          el('span', { class: 'swatch', style: color ? `background:${cssFill(color)}` : 'visibility:hidden' }),
          el('span', { class: 'ellipsis' }, ...labelContent(it.l.emoji, it.l.text)),
          el('span', { class: 'kind' }, it.l.group || 'Label'),
        ];
      } else if (it.kind === 'color') {
        body = [el('span', { class: 'swatch', style: `background:${cssFill(it.c)}` }), el('span', {}, it.c.name), el('span', { class: 'kind' }, 'Color')];
      } else {
        body = [
          el('span', { class: 'swatch', style: 'visibility:hidden' }),
          el('span', { class: 'ellipsis' }, ...labelContent('🏷️', `Label as “${it.text}”`)),
          el('span', { class: 'kind' }, 'Custom'),
        ];
      }
      return el(
        'div',
        {
          class: `qr${i === quickIndex ? ' active' : ''}`,
          onmousemove: () => {
            if (quickIndex !== i) {
              quickIndex = i;
              renderQuick();
            }
          },
          onmousedown: (e) => e.preventDefault(), // keep focus in the input
          onclick: (e) => applyQuick(it, e.shiftKey),
        },
        ...body,
      );
    }),
  );
  box.children[quickIndex]?.scrollIntoView({ block: 'nearest' });
}

async function applyQuick(it, keepOpen) {
  if (it.kind === 'label') await send('tm:setLabel', { labelId: it.l.id });
  else if (it.kind === 'color') await send('tm:setColor', { colorId: it.c.id });
  else if (it.text) await send('tm:setCustomLabel', { text: it.text });
  if (keepOpen) {
    $('#quick').value = '';
    renderQuick();
  } else {
    window.close();
  }
}

async function onQuickKey(e) {
  const q = $('#quick').value;
  if (e.key === 'Escape') {
    e.preventDefault();
    if (q) {
      $('#quick').value = '';
      renderQuick();
    } else window.close();
    return;
  }
  if (!q) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') {
      e.preventDefault();
      await send('tm:removeMark');
      return;
    }
    const digit = /^Digit([0-9])$/.exec(e.code);
    if (digit && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const n = Number(digit[1]);
      if (n === 0) {
        await send('tm:setLabel', { labelId: null });
        return;
      }
      const l = groupLabels()[n - 1];
      if (!l) return;
      await send('tm:setLabel', { labelId: l.id });
      if (!e.shiftKey) window.close();
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const groups = labelGroups(cfg.labels).map((g) => g.name);
      const i = groups.indexOf(activeGroup);
      activeGroup = groups[(i + (e.key === 'ArrowRight' ? 1 : -1) + groups.length) % groups.length];
      localStorage.setItem('tm.group', activeGroup);
      renderLabels();
    }
    return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const d = e.key === 'ArrowDown' ? 1 : -1;
    quickIndex = (quickIndex + d + quickItems.length) % quickItems.length;
    renderQuick();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const it = quickItems[quickIndex];
    if (it) applyQuick(it, e.shiftKey);
  }
}

// ---------------------------------------------------------------------------
// Editor

// Two tidy rows: everyday + dev colors first, then extended + gradients, then custom.
const COLOR_ROWS = ['Basic', 'Dev', 'Extended', 'Gradients', 'Custom'];

function renderColors() {
  const box = $('#colors');
  const cur = currentMark()?.colorId;
  const colors = visibleColors(cfg).sort((a, b) => COLOR_ROWS.indexOf(a.group) - COLOR_ROWS.indexOf(b.group));
  box.replaceChildren(
    ...colors.map((c) =>
      el('button', {
        class: `swatch${c.id === cur ? ' on' : ''}`,
        title: `${c.name}${c.emoji ? '  ' + c.emoji : ''}`,
        'aria-label': c.name,
        'aria-pressed': String(c.id === cur),
        style: `background:${cssFill(c)}`,
        onclick: () => send('tm:setColor', { colorId: c.id === cur ? null : c.id }),
      }),
    ),
  );
}

function renderLabels() {
  const groups = labelGroups(cfg.labels);
  const m = currentMark();
  const curDef = m?.labelId ? cfg.labels.find((l) => l.id === m.labelId) : null;
  if (!activeGroup || !groups.some((g) => g.name === activeGroup)) activeGroup = curDef?.group || groups[0]?.name;

  $('#label-groups').replaceChildren(
    ...groups.map((g) =>
      el(
        'button',
        {
          class: g.name === activeGroup ? 'on' : '',
          onclick: () => {
            activeGroup = g.name;
            localStorage.setItem('tm.group', g.name);
            renderLabels();
          },
        },
        g.name,
      ),
    ),
  );

  const group = groups.find((g) => g.name === activeGroup);
  $('#labels').replaceChildren(
    ...(group?.labels || []).map((l, i) => {
      const color = colorById(cfg, l.colorId);
      const on = m?.labelId === l.id;
      const tip = [i < 9 ? `Press ${i + 1}` : null, color ? `also sets ${color.name}` : null].filter(Boolean).join(' · ');
      return el(
        'button',
        {
          class: `chip${on ? ' on' : ''}`,
          style: color ? `--c:${cssSolid(color)}` : null,
          title: tip || null,
          'aria-pressed': String(on),
          onclick: () => send('tm:setLabel', { labelId: on ? null : l.id }),
        },
        ...labelContent(l.emoji, l.text),
        i < 9 ? el('span', { class: 'num' }, String(i + 1)) : null,
      );
    }),
  );
}

function renderNote() {
  const m = currentMark();
  const ta = $('#note');
  if (document.activeElement !== ta) ta.value = m?.note || '';
  const sw = $('#note-onpage');
  sw.checked = !m?.noteHidden;
  sw.disabled = !cfg.settings.floatingNotes;
  sw.closest('label').title = cfg.settings.floatingNotes
    ? 'Show this note as a sticky note on the page'
    : 'Floating notes are turned off in Settings';
}

function renderEditor() {
  renderCurrent();
  $('#editor').hidden = !markable;
  if (!markable) return;
  renderColors();
  renderLabels();
  renderNote();
}

// ---------------------------------------------------------------------------
// Tabs view: marked tabs

function emptyState(title, text) {
  return el('div', { class: 'empty' }, el('b', {}, title), text);
}

async function renderList() {
  const tabs = await chrome.tabs.query({});
  const byId = new Map(tabs.map((t) => [t.id, t]));
  const colorOrder = new Map(allColors(cfg).map((c, i) => [c.id, i]));
  const q = $('#search').value.trim().toLowerCase();

  let entries = Object.entries(marks)
    .map(([id, m]) => ({ id: Number(id), m, t: byId.get(Number(id)) }))
    .filter((e) => e.t);
  $('#count').textContent = entries.length || '';

  const groups = labelGroups(cfg.labels).map((g) => g.name);
  const filters = ['all', ...groups, 'notes'];
  if (!filters.includes(filter)) filter = 'all';
  $('#filters').replaceChildren(
    ...filters.map((f) =>
      el(
        'button',
        {
          class: f === filter ? 'on' : '',
          onclick: () => {
            filter = f;
            renderList();
          },
        },
        f === 'all' ? 'All' : f === 'notes' ? 'With notes' : f,
      ),
    ),
  );
  if (filter === 'notes') entries = entries.filter((e) => e.m.note?.trim());
  else if (filter !== 'all') entries = entries.filter((e) => cfg.labels.find((l) => l.id === e.m.labelId)?.group === filter);

  if (q) {
    entries = entries.filter((e) => {
      const label = resolveLabel(e.m, cfg);
      const hay = [e.m.title || e.t.title, e.t.url, label?.text, label?.emoji, e.m.note, colorById(cfg, e.m.colorId)?.name]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }

  entries.sort((a, b) => {
    const ca = colorOrder.get(a.m.colorId) ?? 1e9;
    const cb = colorOrder.get(b.m.colorId) ?? 1e9;
    if (ca !== cb) return ca - cb;
    if (a.t.windowId !== b.t.windowId) return a.t.windowId - b.t.windowId;
    return a.t.index - b.t.index;
  });

  const list = $('#list');
  list.replaceChildren();
  if (!entries.length) {
    list.append(
      q || filter !== 'all'
        ? emptyState('No matches', 'Try a different search or filter.')
        : emptyState('No marked tabs yet', 'Open the Mark view on any tab, or press ⌥⇧M to color it.'),
    );
    return;
  }

  const counts = new Map();
  for (const e of entries) counts.set(e.m.colorId || '', (counts.get(e.m.colorId || '') || 0) + 1);
  let lastColor;
  for (const e of entries) {
    const color = colorById(cfg, e.m.colorId);
    const key = color?.id || '';
    if (key !== lastColor) {
      lastColor = key;
      list.append(
        el(
          'div',
          { class: 'group-head' },
          color ? el('span', { class: 'swatch', style: `background:${cssFill(color)}` }) : null,
          color ? color.name : 'No color',
          el('span', { class: 'n' }, `· ${counts.get(key)}`),
        ),
      );
    }
    const label = resolveLabel(e.m, cfg);
    const note = (e.m.note || '').trim().replace(/\s+/g, ' ');
    list.append(
      el(
        'div',
        {
          class: `item${e.id === tab.id ? ' current' : ''}`,
          title: `${e.m.title || e.t.title}\n${e.t.url}${note ? '\n\n📝 ' + e.m.note : ''}`,
          onclick: async () => {
            await chrome.runtime.sendMessage({ type: 'tm:focusTab', tabId: e.id });
            window.close();
          },
        },
        el('img', { src: e.t.favIconUrl || faviconFor(e.t.url), alt: '' }),
        el(
          'div',
          { class: 'item-body' },
          el('div', { class: 'item-title ellipsis' }, e.m.title || e.t.title || e.t.url),
          label || note
            ? el(
                'div',
                { class: 'item-meta' },
                label ? el('span', { class: 'item-label ellipsis' }, ...labelContent(label.emoji, label.text)) : null,
                note ? el('span', { class: 'item-note ellipsis' }, ...labelContent('📝', note)) : null,
              )
            : null,
        ),
        el(
          'button',
          {
            class: 'icon-btn',
            title: e.m.note?.trim() ? 'Unmark (keeps the note)' : 'Unmark',
            onclick: (ev) => {
              ev.stopPropagation();
              chrome.runtime.sendMessage({ type: 'tm:removeMark', tabId: e.id });
            },
          },
          '×',
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Tabs view: recently closed (restore pool)

function relTime(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

async function renderClosed() {
  const { restorePool = [] } = await chrome.storage.local.get('restorePool');
  const q = $('#search').value.trim().toLowerCase();
  let entries = restorePool.filter((e) => e.poolId).sort((a, b) => b.closedAt - a.closedAt);
  if (q) {
    entries = entries.filter((e) => {
      const label = resolveLabel(e, cfg);
      return [e.title, e.url, label?.text, e.note].join(' ').toLowerCase().includes(q);
    });
  }
  $('#closed-wrap').hidden = !entries.length;
  $('#closed-count').textContent = entries.length > 30 ? `· 30 of ${entries.length}` : `· ${entries.length}`;
  $('#closed').replaceChildren(
    ...entries.slice(0, 30).map((e) => {
      const label = resolveLabel(e, cfg);
      const color = colorById(cfg, e.colorId);
      const note = (e.note || '').trim().replace(/\s+/g, ' ');
      return el(
        'div',
        {
          class: 'item',
          title: `Reopen with its mark and note\n${e.title || ''}\n${e.url}${note ? '\n\n📝 ' + e.note : ''}`,
          onclick: async () => {
            await chrome.runtime.sendMessage({ type: 'tm:restoreClosed', poolId: e.poolId });
            window.close();
          },
        },
        el('img', { src: faviconFor(e.url), alt: '' }),
        el(
          'div',
          { class: 'item-body' },
          el(
            'div',
            { class: 'item-title ellipsis' },
            color ? el('span', { class: 'dot', style: `background:${cssFill(color)}` }) : null,
            e.title || e.url,
          ),
          el(
            'div',
            { class: 'item-meta' },
            el('span', { style: 'flex:none' }, relTime(e.closedAt)),
            label ? el('span', { class: 'item-label ellipsis' }, ...labelContent(label.emoji, label.text)) : null,
            note ? el('span', { class: 'item-note ellipsis' }, ...labelContent('📝', note)) : null,
          ),
        ),
        el(
          'button',
          {
            class: 'icon-btn',
            title: 'Forget',
            onclick: (ev) => {
              ev.stopPropagation();
              chrome.runtime.sendMessage({ type: 'tm:forgetClosed', poolId: e.poolId });
            },
          },
          '×',
        ),
      );
    }),
  );
}

// ---------------------------------------------------------------------------
// Settings view

function previewColor() {
  return colorById(cfg, currentMark()?.colorId) || colorById(cfg, 'blue') || visibleColors(cfg)[0] || { value: '#5b5bd6' };
}

function renderSettings() {
  const s = cfg.settings;
  const color = previewColor();
  const label = resolveLabel(currentMark(), cfg);

  $('#icon-styles').replaceChildren(
    ...ICON_STYLES.map((st) => {
      const canvas = el('canvas', { width: 44, height: 44 });
      drawMarkedIcon(
        canvas.getContext('2d'),
        { bitmap: null, letter: 'G', color, style: st.id, symbol: s.symbol, emoji: label?.emoji || '👀' },
        44,
      );
      return el(
        'button',
        { class: `style-opt${s.iconStyle === st.id ? ' on' : ''}`, onclick: () => saveSettings({ iconStyle: st.id }) },
        canvas,
        st.name,
      );
    }),
  );

  $('#symbols').replaceChildren(
    ...SYMBOLS.map((sym) => {
      const canvas = el('canvas', { width: 36, height: 36 });
      const ctx = canvas.getContext('2d');
      drawSymbol(ctx, sym.id, 0, 0, 36, makeFill(ctx, color, 0, 0, 36, 36));
      return el(
        'button',
        { class: `symbol-opt${s.symbol === sym.id ? ' on' : ''}`, title: sym.name, onclick: () => saveSettings({ symbol: sym.id }) },
        canvas,
      );
    }),
  );

  const seg = (sel, options, key) =>
    $(sel).replaceChildren(
      ...options.map((o) => el('button', { class: s[key] === o.id ? 'on' : '', onclick: () => saveSettings({ [key]: o.id }) }, o.name)),
    );
  seg('#show-on', SHOW_ON, 'showOn');
  seg('#title-marker', TITLE_MARKERS, 'titleMarker');
  seg(
    '#theme',
    [
      { id: 'system', name: 'System' },
      { id: 'light', name: 'Light' },
      { id: 'dark', name: 'Dark' },
    ],
    'theme',
  );
  $('#label-in-title').checked = !!s.labelInTitle;
  $('#floating-notes').checked = !!s.floatingNotes;
}

async function renderShortcuts() {
  const cmds = await chrome.commands.getAll();
  const names = {
    _execute_action: 'Open TabMarks',
    'cycle-color': 'Cycle colors',
    'next-marked': 'Next marked tab',
    'toggle-note': 'Show / hide note',
    'remove-mark': 'Unmark tab',
    'cycle-pr-status': 'Cycle PR status',
  };
  const box = $('#shortcuts');
  box.replaceChildren();
  for (const [name, text] of Object.entries(names)) {
    const c = cmds.find((x) => x.name === name);
    box.append(c?.shortcut ? el('kbd', {}, c.shortcut) : el('span', { class: 'unset' }, 'not set'), el('span', {}, text));
  }
}

// ---------------------------------------------------------------------------
// Wiring

let noteTimer = null;
function flushNote() {
  if (noteTimer === null) return;
  clearTimeout(noteTimer);
  noteTimer = null;
  send('tm:setNote', { note: $('#note').value });
  $('#note-status').textContent = 'Saved';
  setTimeout(() => ($('#note-status').textContent = ''), 1200);
}

function bind() {
  for (const b of document.querySelectorAll('.views button')) b.addEventListener('click', () => setView(b.dataset.view));
  $('#open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('#edit-shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
  $('#note').addEventListener('input', () => {
    $('#note-status').textContent = 'Saving…';
    clearTimeout(noteTimer);
    noteTimer = setTimeout(flushNote, 350);
  });
  $('#note').addEventListener('blur', flushNote);
  window.addEventListener('pagehide', flushNote);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushNote());
  $('#note-onpage').addEventListener('change', (e) => send('tm:setNoteHidden', { hidden: !e.target.checked }));
  $('#search').addEventListener('input', () => {
    renderList();
    renderClosed();
  });
  $('#quick').addEventListener('input', () => {
    quickIndex = 0;
    renderQuick();
  });
  $('#quick').addEventListener('keydown', onQuickKey);
  $('#quick').addEventListener('focus', renderQuick);
  $('#quick').addEventListener('blur', () => {
    updateKbdHints();
    // Let clicks on results land before hiding them.
    setTimeout(() => {
      if (document.activeElement !== $('#quick')) $('#quick-results').hidden = true;
    }, 150);
  });
  $('#label-in-title').addEventListener('change', (e) => saveSettings({ labelInTitle: e.target.checked }));
  $('#floating-notes').addEventListener('change', (e) => saveSettings({ floatingNotes: e.target.checked }));

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    if (changes.marks) marks = changes.marks.newValue || {};
    const cfgChanged = Object.keys(changes).some((k) => k !== 'marks' && k !== 'restorePool');
    if (cfgChanged) {
      cfg = await loadConfig();
      applyTheme(document, cfg.settings.theme);
      renderSettings();
    }
    if (changes.restorePool || cfgChanged) renderClosed();
    if (!changes.marks && !cfgChanged) return;
    renderHeader();
    renderEditor();
    renderList();
    if ($('#quick').value) renderQuick();
  });
}

async function init() {
  // ?tabId= lets the popup be opened as a normal page for a specific tab (dev/testing).
  const forced = Number(new URLSearchParams(location.search).get('tabId'));
  tab = (forced && (await chrome.tabs.get(forced).catch(() => null))) || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  cfg = await loadConfig();
  marks = await getMarks();
  applyTheme(document, cfg.settings.theme);

  if (isRestrictedUrl(tab?.url)) {
    markable = false;
  } else {
    const res = await chrome.runtime.sendMessage({ type: 'tm:canMark', tabId: tab.id }).catch(() => null);
    markable = !!res?.ok;
    if (!markable) $('#restricted').textContent = res?.reason || 'This page can’t be marked.';
  }
  if (!markable && !$('#restricted').textContent) {
    $('#restricted').textContent = 'Brave doesn’t let extensions change this page (browser pages, Web Store, PDF viewer).';
  }
  $('#restricted').hidden = markable;

  await renderHeader();
  renderEditor();
  renderSettings();
  renderShortcuts();
  bind();
  setView(markable ? 'mark' : 'tabs');
  await Promise.all([renderList(), renderClosed()]);
}

init();
