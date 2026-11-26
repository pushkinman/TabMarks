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
  for (const c of children) if (c != null) e.append(c);
  return e;
}

function send(type, extra = {}) {
  return chrome.runtime.sendMessage({ type, tabId: tab.id, ...extra });
}

const currentMark = () => marks[tab.id] || null;

// ---------------------------------------------------------------------------
// Header

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url || '';
  }
}

function renderHeader() {
  const m = currentMark();
  $('#tab-title').textContent = m?.title || tab.title || 'Untitled';
  $('#tab-host').textContent = hostOf(tab.url);
  const c = $('#tab-icon');
  const ctx = c.getContext('2d');
  const color = colorById(cfg, m?.colorId);
  const label = resolveLabel(m, cfg);
  const style = label?.def?.iconStyle || cfg.settings.iconStyle;
  const symbol = label?.def?.symbol || cfg.settings.symbol;
  let st = style;
  if (st === 'emoji' && !label?.emoji) st = color ? 'badge' : 'none';
  if (st !== 'emoji' && !color) st = 'none';
  drawMarkedIcon(ctx, { bitmap: null, letter: hostOf(tab.url)[0] || '•', color, style: st, symbol, emoji: label?.emoji }, 40);
}

// ---------------------------------------------------------------------------
// Editor

function renderColors() {
  const box = $('#colors');
  box.replaceChildren();
  const cur = currentMark()?.colorId;
  let lastGroup = null;
  for (const c of visibleColors(cfg)) {
    if (lastGroup && c.group !== lastGroup && ['Gradients', 'Dev', 'Custom'].includes(c.group)) {
      box.append(el('div', { class: 'swatch-sep' }));
    }
    lastGroup = c.group;
    box.append(
      el('button', {
        class: `swatch${c.id === cur ? ' on' : ''}`,
        title: `${c.emoji || ''} ${c.name}`.trim(),
        style: `background:${cssFill(c)}`,
        onclick: () => send('tm:setColor', { colorId: c.id === cur ? null : c.id }),
      }),
    );
  }
}

function renderLabels() {
  const groups = labelGroups(cfg.labels);
  const m = currentMark();
  const curDef = m?.labelId ? cfg.labels.find((l) => l.id === m.labelId) : null;
  if (!activeGroup || !groups.some((g) => g.name === activeGroup)) activeGroup = curDef?.group || groups[0]?.name;

  const seg = $('#label-groups');
  seg.replaceChildren(
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

  const box = $('#labels');
  box.replaceChildren();
  const group = groups.find((g) => g.name === activeGroup);
  for (const l of group?.labels || []) {
    const color = colorById(cfg, l.colorId);
    const on = m?.labelId === l.id;
    box.append(
      el(
        'button',
        {
          class: `chip${on ? ' on' : ''}`,
          style: color ? `--chip-color:${cssSolid(color)}` : null,
          title: color ? `Also sets color: ${color.name}` : null,
          onclick: () => send('tm:setLabel', { labelId: on ? null : l.id }),
        },
        color ? el('span', { class: 'dot', style: `background:${cssFill(color)}` }) : null,
        `${l.emoji ? l.emoji + ' ' : ''}${l.text}`,
      ),
    );
  }
  const input = $('#custom-label');
  if (document.activeElement !== input) input.value = m?.customLabel || '';
}

function renderNote() {
  const m = currentMark();
  const ta = $('#note');
  if (document.activeElement !== ta) ta.value = m?.note || '';
  $('#note-onpage').checked = !m?.noteHidden;
  $('#note-onpage').disabled = !cfg.settings.floatingNotes;
  $('#note-onpage').parentElement.title = cfg.settings.floatingNotes
    ? 'Show this note as a sticky note on the page'
    : 'Floating notes are turned off in Display settings';
  $('#remove-mark').disabled = !(m?.colorId || m?.labelId || m?.customLabel);
}

function renderEditor() {
  $('#editor').hidden = !markable;
  if (!markable) return;
  renderColors();
  renderLabels();
  renderNote();
}

// ---------------------------------------------------------------------------
// Marked-tab list

async function renderList() {
  const tabs = await chrome.tabs.query({});
  const byId = new Map(tabs.map((t) => [t.id, t]));
  const colors = allColors(cfg);
  const colorOrder = new Map(colors.map((c, i) => [c.id, i]));
  const q = $('#search').value.trim().toLowerCase();

  let entries = Object.entries(marks)
    .map(([id, m]) => ({ id: Number(id), m, t: byId.get(Number(id)) }))
    .filter((e) => e.t);

  // Filter chips
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
        f === 'all' ? 'All' : f === 'notes' ? '📝 With notes' : f,
      ),
    ),
  );
  if (filter === 'notes') entries = entries.filter((e) => e.m.note?.trim());
  else if (filter !== 'all') {
    entries = entries.filter((e) => cfg.labels.find((l) => l.id === e.m.labelId)?.group === filter);
  }

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

  $('#count').textContent = Object.keys(marks).filter((id) => byId.has(Number(id))).length || '';
  const list = $('#list');
  list.replaceChildren();
  if (!entries.length) {
    list.append(
      el('div', { class: 'empty' }, q || filter !== 'all' ? 'No matching tabs.' : 'No marked tabs yet. Pick a color or label above, or press Alt+Shift+M.'),
    );
    return;
  }

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
        el('img', { src: e.t.favIconUrl || '../../icons/icon16.png', alt: '' }),
        el(
          'div',
          { class: 'item-body' },
          el('div', { class: 'item-title ellipsis' }, e.m.title || e.t.title || e.t.url),
          label || note
            ? el(
                'div',
                { class: 'item-meta' },
                label ? el('span', { class: 'item-label ellipsis' }, `${label.emoji ? label.emoji + ' ' : ''}${label.text}`) : null,
                note ? el('span', { class: 'item-note ellipsis' }, `📝 ${note}`) : null,
              )
            : null,
        ),
        el(
          'button',
          {
            class: 'icon-btn',
            title: e.m.note?.trim() ? 'Remove color & label (keeps the note)' : 'Remove mark',
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
// Display settings

function previewColor() {
  return colorById(cfg, currentMark()?.colorId) || visibleColors(cfg)[0] || { value: '#5b5bd6' };
}

function renderSettings() {
  const s = cfg.settings;
  const color = previewColor();
  const label = resolveLabel(currentMark(), cfg);

  $('#icon-styles').replaceChildren(
    ...ICON_STYLES.map((st) => {
      const canvas = el('canvas', { width: 40, height: 40 });
      drawMarkedIcon(
        canvas.getContext('2d'),
        { bitmap: null, letter: 'G', color, style: st.id, symbol: s.symbol, emoji: label?.emoji || '👀' },
        40,
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
      ...options.map((o) =>
        el('button', { class: s[key] === o.id ? 'on' : '', onclick: () => saveSettings({ [key]: o.id }) }, o.name),
      ),
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
  const names = { 'cycle-color': 'color', 'next-marked': 'next', 'remove-mark': 'remove', 'cycle-pr-status': 'PR status' };
  const parts = [];
  for (const c of cmds) {
    if (!names[c.name] || !c.shortcut) continue;
    parts.push(el('span', {}, el('kbd', {}, c.shortcut), ` ${names[c.name]}`));
  }
  const footer = $('#shortcuts');
  footer.replaceChildren();
  parts.forEach((p, i) => {
    if (i) footer.append(' · ');
    footer.append(p);
  });
  footer.append(
    parts.length ? ' · ' : '',
    el(
      'button',
      { class: 'link small', onclick: () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }) },
      'Edit shortcuts',
    ),
  );
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
  $('#open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('#clear-color').addEventListener('click', () => send('tm:setColor', { colorId: null }));
  $('#clear-label').addEventListener('click', () => send('tm:setLabel', { labelId: null }));
  $('#custom-label-form').addEventListener('submit', (e) => {
    e.preventDefault();
    send('tm:setCustomLabel', { text: $('#custom-label').value });
    $('#custom-label').blur();
  });
  $('#note').addEventListener('input', () => {
    $('#note-status').textContent = 'Saving…';
    clearTimeout(noteTimer);
    noteTimer = setTimeout(flushNote, 350);
  });
  $('#note').addEventListener('blur', flushNote);
  window.addEventListener('pagehide', flushNote);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushNote());
  $('#note-onpage').addEventListener('change', (e) => send('tm:setNoteHidden', { hidden: !e.target.checked }));
  $('#remove-mark').addEventListener('click', () => send('tm:removeMark'));
  $('#search').addEventListener('input', renderList);
  $('#label-in-title').addEventListener('change', (e) => saveSettings({ labelInTitle: e.target.checked }));
  $('#floating-notes').addEventListener('change', (e) => saveSettings({ floatingNotes: e.target.checked }));
  $('#advanced').open = localStorage.getItem('tm.advanced') === '1';
  $('#advanced').addEventListener('toggle', () => localStorage.setItem('tm.advanced', $('#advanced').open ? '1' : '0'));

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    if (changes.marks) marks = changes.marks.newValue || {};
    if (Object.keys(changes).some((k) => k !== 'marks' && k !== 'restorePool')) {
      cfg = await loadConfig();
      applyTheme(document, cfg.settings.theme);
      renderSettings();
    }
    renderHeader();
    renderEditor();
    renderList();
  });
}

async function init() {
  // ?tabId= lets the popup be opened as a normal page for a specific tab (dev/testing).
  const forced = Number(new URLSearchParams(location.search).get('tabId'));
  tab = forced ? await chrome.tabs.get(forced) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
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
    $('#restricted').textContent = 'Brave doesn’t allow extensions to change this page (browser pages, Web Store, PDF viewer).';
  }
  $('#restricted').hidden = markable;

  renderHeader();
  renderEditor();
  renderSettings();
  renderShortcuts();
  bind();
  await renderList();
}

init();
