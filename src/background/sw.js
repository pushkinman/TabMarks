// TabMarks service worker: owns all per-tab mark state, applies rules,
// renders favicons, and pushes render instructions to the content script.

import { DEFAULT_LABELS, DEFAULT_SETTINGS, PR_GROUP, RESTORE_POOL_MAX, RESTORE_POOL_TTL_MS } from '../lib/constants.js';
import {
  colorById,
  cssFill,
  cssSolid,
  isRestrictedUrl,
  labelGroups,
  loadConfig,
  resolveLabel,
  visibleColors,
} from '../lib/store.js';
import { symbolById } from '../lib/symbols.js';
import { matchRule } from '../lib/rules.js';
import { renderFaviconDataURL } from '../lib/favicon.js';

const CONTENT_FILE = 'src/content/content.js';
const STARTUP_GRACE_MS = 90_000;
const FRESH_WINDOW_MS = 30_000;
const log = (...a) => console.debug('[TabMarks]', ...a);

// ---------------------------------------------------------------------------
// Serial queue: every read-modify-write of `marks`/`restorePool` goes through it.
let queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(fn);
  queue = run.catch((e) => console.warn('[TabMarks]', e));
  return run;
}

async function getMarksRaw() {
  return (await chrome.storage.local.get('marks')).marks || {};
}

// ---------------------------------------------------------------------------
// Session bootstrap & restore.
// chrome.storage.session is wiped on browser restart and on extension reload,
// so its absence means tab IDs in `marks` are stale: move them to the restore
// pool and re-match open tabs by URL.

let sessionReady = null;
function ensureSession() {
  if (!sessionReady) {
    sessionReady = serial(initSession)
      .then((restoredIds) => {
        for (const id of restoredIds || []) pushRender(id);
      })
      .catch((e) => {
        sessionReady = null;
        throw e;
      });
  }
  return sessionReady;
}

async function initSession() {
  const s = await chrome.storage.session.get('alive');
  if (s.alive) return [];
  const { marks = {}, restorePool = [] } = await chrome.storage.local.get(['marks', 'restorePool']);
  const now = Date.now();
  let pool = restorePool.filter((e) => now - (e.closedAt || 0) < RESTORE_POOL_TTL_MS);
  for (const [tabId, m] of Object.entries(marks)) pool.push({ ...m, oldTabId: Number(tabId), closedAt: now });

  const newMarks = {};
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    const m = takeFromPool(pool, tab, true);
    if (m) newMarks[tab.id] = m;
  }
  pool = pool.slice(-RESTORE_POOL_MAX);
  await chrome.storage.local.set({ marks: newMarks, restorePool: pool });
  await chrome.storage.session.set({ alive: true, sessionStart: now, freshWindows: {}, ruleSuppress: {} });
  log('session init; restored', Object.keys(newMarks).length, 'pool', pool.length);
  return Object.keys(newMarks).map(Number);
}

function takeFromPool(pool, tab, preferSameId) {
  const url = tab.pendingUrl || tab.url;
  if (!url) return null;
  let best = -1;
  let bestScore = Infinity;
  pool.forEach((e, i) => {
    if (e.url !== url) return;
    let score = Math.abs((e.index ?? 0) - (tab.index ?? 0));
    if (preferSameId && e.oldTabId === tab.id) score = -1;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  if (best < 0) return null;
  const [entry] = pool.splice(best, 1);
  const { oldTabId, closedAt, ...mark } = entry;
  return { ...mark, url, windowId: tab.windowId, index: tab.index };
}

async function maybeClaim(tab) {
  const s = await chrome.storage.session.get(['sessionStart', 'freshWindows']);
  const now = Date.now();
  const fresh =
    now - (s.sessionStart || 0) < STARTUP_GRACE_MS ||
    now - ((s.freshWindows || {})[tab.windowId] || 0) < FRESH_WINDOW_MS;
  if (!fresh) return false;
  const claimed = await serial(async () => {
    const { marks = {}, restorePool = [] } = await chrome.storage.local.get(['marks', 'restorePool']);
    if (marks[tab.id] || !restorePool.length) return false;
    const m = takeFromPool(restorePool, tab, false);
    if (!m) return false;
    marks[tab.id] = m;
    await chrome.storage.local.set({ marks, restorePool });
    return true;
  });
  if (claimed) pushRender(tab.id);
  return claimed;
}

// ---------------------------------------------------------------------------
// Mark mutation helpers.

function blankMark(tab) {
  return {
    colorId: null,
    colorSource: null, // manual | label | rule
    labelId: null,
    customLabel: null,
    labelSource: null, // manual | rule
    ruleId: null,
    note: '',
    noteHidden: false,
    noteCollapsed: false,
    notePos: null,
    url: tab?.url || '',
    title: '',
    iconHrefs: [],
    windowId: tab?.windowId,
    index: tab?.index,
    createdAt: Date.now(),
  };
}

function isEmptyMark(m) {
  return !m.colorId && !m.labelId && !m.customLabel && !(m.note && m.note.trim());
}

/** mutate(draft, tab) may return false to abort without writing. */
async function updateMark(tabId, mutate) {
  await ensureSession();
  return serial(async () => {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) return { changed: false, after: null };
    const marks = await getMarksRaw();
    const before = marks[tabId] || null;
    const draft = before ? structuredClone(before) : blankMark(tab);
    const res = await mutate(draft, tab);
    if (res === false) return { changed: false, after: before };
    draft.updatedAt = Date.now();
    if (isEmptyMark(draft)) delete marks[tabId];
    else marks[tabId] = draft;
    await chrome.storage.local.set({ marks });
    return { changed: true, after: marks[tabId] || null, before };
  });
}

/** Patch fields of an existing mark only (never creates one). */
async function patchMark(tabId, fields) {
  await ensureSession();
  return serial(async () => {
    const marks = await getMarksRaw();
    const m = marks[tabId];
    if (!m) return false;
    let dirty = false;
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      if (JSON.stringify(m[k]) !== JSON.stringify(v)) {
        m[k] = v;
        dirty = true;
      }
    }
    if (dirty) await chrome.storage.local.set({ marks });
    return dirty;
  });
}

async function setRuleSuppress(tabId, url) {
  const { ruleSuppress = {} } = await chrome.storage.session.get('ruleSuppress');
  if (url) ruleSuppress[tabId] = url;
  else delete ruleSuppress[tabId];
  await chrome.storage.session.set({ ruleSuppress });
}

// ---------------------------------------------------------------------------
// User actions.

async function setColor(tabId, colorId) {
  await updateMark(tabId, (m) => {
    m.colorId = colorId || null;
    m.colorSource = colorId ? 'manual' : null;
  });
  return pushRender(tabId);
}

function applyLabelColor(m, def, source) {
  // A label's bound color applies unless the color was picked by hand.
  if (m.colorSource === 'manual' && m.colorId) return;
  if (def?.colorId) {
    m.colorId = def.colorId;
    m.colorSource = source;
  } else if (m.colorSource === 'label') {
    m.colorId = null;
    m.colorSource = null;
  }
}

async function setLabel(tabId, labelId) {
  const cfg = await loadConfig();
  const def = labelId ? cfg.labels.find((l) => l.id === labelId) : null;
  await updateMark(tabId, (m) => {
    m.labelId = def ? def.id : null;
    m.customLabel = null;
    m.labelSource = def ? 'manual' : null;
    applyLabelColor(m, def, 'label');
  });
  return pushRender(tabId);
}

async function setCustomLabel(tabId, text) {
  const t = (text || '').trim().slice(0, 60);
  await updateMark(tabId, (m) => {
    m.labelId = null;
    m.customLabel = t || null;
    m.labelSource = t ? 'manual' : null;
    if (m.colorSource === 'label') {
      m.colorId = null;
      m.colorSource = null;
    }
  });
  return pushRender(tabId);
}

async function removeMark(tabId, { withNote = false } = {}) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  await updateMark(tabId, (m) => {
    m.colorId = null;
    m.colorSource = null;
    m.labelId = null;
    m.customLabel = null;
    m.labelSource = null;
    m.ruleId = null;
    if (withNote) m.note = '';
  });
  // Don't let a rule immediately re-mark this page; it applies again after navigation.
  if (tab) await setRuleSuppress(tabId, tab.url);
  return pushRender(tabId);
}

async function setNote(tabId, note, { push = true } = {}) {
  await updateMark(tabId, (m) => {
    m.note = (note || '').slice(0, 20000);
  });
  if (push) return pushRender(tabId);
}

async function setNoteState(tabId, state) {
  await updateMark(tabId, (m) => {
    if (typeof state.hidden === 'boolean') m.noteHidden = state.hidden;
    if (typeof state.collapsed === 'boolean') m.noteCollapsed = state.collapsed;
    if (state.pos !== undefined) m.notePos = state.pos;
  });
}

// ---------------------------------------------------------------------------
// Rules.

async function applyRules(tabId, tab, titleHint, { push = true } = {}) {
  tab = tab || (await chrome.tabs.get(tabId).catch(() => null));
  if (!tab || isRestrictedUrl(tab.url)) return false;
  const cfg = await loadConfig();
  const marks = await getMarksRaw();
  const existing = marks[tabId];
  if (!cfg.rules.length && !(existing && (existing.colorSource === 'rule' || existing.labelSource === 'rule'))) {
    return false;
  }
  const title = titleHint ?? existing?.title ?? tab.title ?? '';
  let rule = matchRule(tab.url, title, cfg.rules);
  if (rule) {
    const { ruleSuppress = {} } = await chrome.storage.session.get('ruleSuppress');
    if (ruleSuppress[tabId] === tab.url) rule = null;
  }
  if (!rule && !(existing && (existing.colorSource === 'rule' || existing.labelSource === 'rule' || existing.ruleId))) {
    return false;
  }
  const labelDef = rule?.labelId ? cfg.labels.find((l) => l.id === rule.labelId) : null;
  const ruleColor = rule ? rule.colorId || labelDef?.colorId || null : null;

  const res = await updateMark(tabId, (m) => {
    const sig = () => JSON.stringify([m.colorId, m.colorSource, m.labelId, m.labelSource, m.ruleId]);
    const before = sig();
    if (rule) {
      if (!m.colorSource || m.colorSource === 'rule') {
        m.colorId = ruleColor;
        m.colorSource = ruleColor ? 'rule' : null;
      }
      if (!m.labelSource || m.labelSource === 'rule') {
        m.labelId = labelDef ? labelDef.id : null;
        m.customLabel = null;
        m.labelSource = labelDef ? 'rule' : null;
      }
      m.ruleId = rule.id;
    } else {
      if (m.colorSource === 'rule') {
        m.colorId = null;
        m.colorSource = null;
      }
      if (m.labelSource === 'rule') {
        m.labelId = null;
        m.labelSource = null;
      }
      m.ruleId = null;
    }
    if (sig() === before) return false;
  });
  if (res.changed && push) await pushRender(tabId);
  return res.changed;
}

let rulesTimer = null;
function reapplyRulesAll() {
  clearTimeout(rulesTimer);
  rulesTimer = setTimeout(async () => {
    await ensureSession();
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) await applyRules(t.id, t);
  }, 200);
}

// ---------------------------------------------------------------------------
// Rendering.

const bitmapCache = new Map();
const renderCache = new Map();
function cacheSet(map, key, value, max) {
  map.delete(key);
  map.set(key, value);
  if (map.size > max) map.delete(map.keys().next().value);
}

async function loadBitmap(href) {
  if (bitmapCache.has(href)) return bitmapCache.get(href);
  let bm = null;
  try {
    const res = await fetch(href, { credentials: 'omit', cache: 'force-cache' });
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 0 && !/svg/i.test(blob.type)) bm = await createImageBitmap(blob);
    }
  } catch {
    bm = null;
  }
  cacheSet(bitmapCache, href, bm, 150);
  return bm;
}

async function sourceIcon(tab, info) {
  for (const h of info?.iconHrefs || []) {
    if (/^data:image\/svg/i.test(h) || /\.svg(\?|#|$)/i.test(h)) continue;
    const bm = await loadBitmap(h);
    if (bm) return { bitmap: bm, key: h };
  }
  // Chromium's own favicon cache (also rasterizes SVG favicons).
  try {
    const fav = chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(tab.url)}&size=32`);
    const bm = await loadBitmap(fav);
    if (bm) return { bitmap: bm, key: fav };
  } catch {
    /* favicon API unavailable */
  }
  let letter = '•';
  try {
    letter = new URL(tab.url).hostname.replace(/^www\./, '')[0] || '•';
  } catch {
    /* ignore */
  }
  return { bitmap: null, letter, key: `letter:${letter}` };
}

async function faviconFor(tab, info, { color, style, symbol, emoji }) {
  let st = style;
  if (st === 'none') return null;
  if (st === 'emoji' && !emoji) st = color ? 'badge' : null;
  if (!st) return null;
  if (st !== 'emoji' && !color) return null;
  const src = st === 'symbol' ? { bitmap: null, key: 'none' } : await sourceIcon(tab, info);
  const key = JSON.stringify([src.key, color?.value, color?.gradient, st, symbol, emoji]);
  if (renderCache.has(key)) return renderCache.get(key);
  const url = await renderFaviconDataURL({ bitmap: src.bitmap, letter: src.letter, color, style: st, symbol, emoji });
  cacheSet(renderCache, key, url, 300);
  return url;
}

async function computeRender(tab, mark, info, cfg) {
  const s = cfg.settings;
  const color = mark ? colorById(cfg, mark.colorId) : null;
  const label = mark ? resolveLabel(mark, cfg) : null;
  const style = label?.def?.iconStyle || s.iconStyle;
  const symbol = label?.def?.symbol || s.symbol;

  let prefix = '';
  if (mark && s.showOn !== 'icon') {
    const parts = [];
    if (color) {
      if (s.titleMarker === 'emoji' && color.emoji) parts.push(color.emoji);
      else if (s.titleMarker === 'symbol') parts.push(symbolById(symbol).text);
    }
    if (label && s.labelInTitle) parts.push(`[${label.emoji ? label.emoji + ' ' : ''}${label.text}]`);
    if (parts.length) prefix = parts.join(' ') + ' ';
  }

  let favicon = null;
  if (mark && s.showOn !== 'title') {
    favicon = await faviconFor(tab, info, { color, style, symbol, emoji: label?.emoji });
  }

  const note = {
    text: mark?.note || '',
    hidden: !!mark?.noteHidden,
    collapsed: !!mark?.noteCollapsed,
    pos: mark?.notePos || null,
    enabled: !!s.floatingNotes,
    theme: s.theme,
    accent: color ? cssFill(color) : null,
    accentSolid: color ? cssSolid(color) : null,
    label: label ? `${label.emoji ? label.emoji + ' ' : ''}${label.text}` : '',
  };
  return { prefix, favicon, note };
}

async function ping(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'tm:ping' }, { frameId: 0 });
  } catch {
    return null;
  }
}

async function ensureContent(tabId) {
  const info = await ping(tabId);
  if (info) return info;
  try {
    await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: [CONTENT_FILE] });
  } catch {
    return null;
  }
  return ping(tabId);
}

async function pushRender(tabId, extra = {}) {
  await ensureSession();
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || isRestrictedUrl(tab.url) || tab.discarded) return false;
  const mark = (await getMarksRaw())[tabId] || null;
  // Nothing to show: only talk to an already-injected script (to clear old marks).
  const info = mark || extra.focusNote ? await ensureContent(tabId) : await ping(tabId);
  if (!info) return false;
  if (mark) await patchMark(tabId, { title: info.title, iconHrefs: info.iconHrefs });
  const cfg = await loadConfig();
  const r = await computeRender(tab, mark, info, cfg);
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'tm:render', ...r, ...extra }, { frameId: 0 });
  } catch {
    return false;
  }
  return true;
}

let rerenderTimer = null;
function rerenderAll() {
  clearTimeout(rerenderTimer);
  rerenderTimer = setTimeout(async () => {
    const marks = await getMarksRaw();
    for (const id of Object.keys(marks)) pushRender(Number(id));
  }, 150);
}

// ---------------------------------------------------------------------------
// Badge feedback (e.g. trying to mark a restricted page).

async function flash(tabId, text, color = '#cf222e') {
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    await chrome.action.setBadgeText({ tabId, text });
    setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {}), 1500);
  } catch {
    /* tab gone */
  }
}

async function canMark(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) return { ok: false, reason: 'Tab not found.' };
  if (isRestrictedUrl(tab.url)) return { ok: false, reason: 'Brave doesn’t allow extensions to change this page.' };
  if (tab.discarded) return { ok: true, discarded: true };
  const info = await ensureContent(tabId);
  if (!info) return { ok: false, reason: 'This page can’t be marked (PDF viewer or protected page).' };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Commands.

async function activeTab() {
  const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return t || null;
}

async function cycleColor(tab) {
  const cfg = await loadConfig();
  const colors = visibleColors(cfg);
  if (!colors.length) return;
  const cur = (await getMarksRaw())[tab.id]?.colorId;
  const idx = colors.findIndex((c) => c.id === cur);
  const next = idx === -1 ? colors[0].id : idx + 1 < colors.length ? colors[idx + 1].id : null;
  await setColor(tab.id, next);
}

async function cyclePrStatus(tab) {
  const cfg = await loadConfig();
  const prLabels = cfg.labels.filter((l) => l.group === PR_GROUP);
  if (!prLabels.length) return;
  const cur = (await getMarksRaw())[tab.id]?.labelId;
  const idx = prLabels.findIndex((l) => l.id === cur);
  const next = idx === -1 ? prLabels[0].id : idx + 1 < prLabels.length ? prLabels[idx + 1].id : null;
  await setLabel(tab.id, next);
}

async function jumpToNext(tab) {
  const marks = await getMarksRaw();
  const curColor = marks[tab.id]?.colorId || null;
  const all = await chrome.tabs.query({ windowType: 'normal' });
  all.sort((a, b) => {
    if (a.windowId !== b.windowId) {
      if (a.windowId === tab.windowId) return -1;
      if (b.windowId === tab.windowId) return 1;
      return a.windowId - b.windowId;
    }
    return a.index - b.index;
  });
  const start = all.findIndex((t) => t.id === tab.id);
  const ordered = [...all.slice(start + 1), ...all.slice(0, Math.max(start, 0))];
  const target = ordered.find((t) => {
    const m = marks[t.id];
    if (!m) return false;
    if (curColor) return m.colorId === curColor;
    return !!(m.colorId || m.labelId || m.customLabel);
  });
  if (!target) {
    flash(tab.id, '–', '#6e7781');
    return;
  }
  await chrome.tabs.update(target.id, { active: true });
  if (target.windowId !== tab.windowId) await chrome.windows.update(target.windowId, { focused: true });
}

chrome.commands.onCommand.addListener(async (command, tabArg) => {
  await ensureSession();
  const tab = tabArg?.id ? tabArg : await activeTab();
  if (!tab) return;
  if (command !== 'next-marked') {
    const c = await canMark(tab.id);
    if (!c.ok) return flash(tab.id, '✕');
  }
  if (command === 'cycle-color') await cycleColor(tab);
  else if (command === 'remove-mark') await removeMark(tab.id);
  else if (command === 'next-marked') await jumpToNext(tab);
  else if (command === 'cycle-pr-status') await cyclePrStatus(tab);
});

// ---------------------------------------------------------------------------
// Context menu.

const MENU_CONTEXTS = ['page', 'frame', 'selection', 'link', 'editable', 'image', 'video', 'audio'];
let menuChain = Promise.resolve();

function rebuildMenus() {
  menuChain = menuChain.then(buildMenus).catch((e) => console.warn('[TabMarks] menus', e));
  return menuChain;
}

async function buildMenus() {
  const cfg = await loadConfig();
  await chrome.contextMenus.removeAll();
  const add = (p) =>
    new Promise((resolve) =>
      chrome.contextMenus.create({ contexts: MENU_CONTEXTS, ...p }, () => {
        void chrome.runtime.lastError;
        resolve();
      }),
    );
  await add({ id: 'tm', title: 'TabMarks' });
  await add({ id: 'tm-color', parentId: 'tm', title: '🎨 Color' });
  for (const c of visibleColors(cfg)) {
    await add({ id: `tm-color:${c.id}`, parentId: 'tm-color', title: `${c.emoji || '●'}  ${c.name}` });
  }
  await add({ id: 'tm-color-sep', parentId: 'tm-color', type: 'separator' });
  await add({ id: 'tm-color:', parentId: 'tm-color', title: 'No color' });
  for (const g of labelGroups(cfg.labels)) {
    const gid = `tm-lg:${g.name}`;
    await add({ id: gid, parentId: 'tm', title: `🏷️ ${g.name}` });
    for (const l of g.labels) {
      await add({ id: `tm-label:${l.id}`, parentId: gid, title: `${l.emoji ? l.emoji + '  ' : ''}${l.text}` });
    }
  }
  await add({ id: 'tm-label:', parentId: 'tm', title: 'Clear label' });
  await add({ id: 'tm-sep1', parentId: 'tm', type: 'separator' });
  await add({ id: 'tm-note', parentId: 'tm', title: '📝 Add / edit note' });
  await add({ id: 'tm-note-toggle', parentId: 'tm', title: 'Show / hide note on page' });
  await add({ id: 'tm-sep2', parentId: 'tm', type: 'separator' });
  await add({ id: 'tm-remove', parentId: 'tm', title: 'Remove color & label' });
  await add({ id: 'tm-options', parentId: 'tm', title: 'Rules & colors…' });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const id = String(info.menuItemId);
  if (id === 'tm-options') return chrome.runtime.openOptionsPage();
  if (!tab?.id) return;
  await ensureSession();
  const c = await canMark(tab.id);
  if (!c.ok) return flash(tab.id, '✕');
  if (id.startsWith('tm-color:')) return setColor(tab.id, id.slice('tm-color:'.length) || null);
  if (id.startsWith('tm-label:')) return setLabel(tab.id, id.slice('tm-label:'.length) || null);
  if (id === 'tm-remove') return removeMark(tab.id);
  if (id === 'tm-note') {
    await setNoteState(tab.id, { hidden: false, collapsed: false });
    return pushRender(tab.id, { focusNote: true });
  }
  if (id === 'tm-note-toggle') {
    const m = (await getMarksRaw())[tab.id];
    await setNoteState(tab.id, { hidden: !m?.noteHidden });
    return pushRender(tab.id);
  }
});

// ---------------------------------------------------------------------------
// Messages (popup + content script).

const handlers = {
  // --- content script ---
  async 'tm:hello'(msg, sender) {
    const tab = sender.tab;
    if (!tab || sender.frameId !== 0) return null;
    await ensureSession();
    await patchMark(tab.id, { title: msg.title, iconHrefs: msg.iconHrefs, url: tab.url });
    await applyRules(tab.id, tab, msg.title, { push: false });
    const mark = (await getMarksRaw())[tab.id] || null;
    const cfg = await loadConfig();
    return computeRender(tab, mark, msg, cfg);
  },
  async 'tm:noteEdit'(msg, sender) {
    await setNote(sender.tab.id, msg.note, { push: false });
    return { ok: true };
  },
  async 'tm:noteState'(msg, sender) {
    await setNoteState(sender.tab.id, msg);
    return { ok: true };
  },
  async 'tm:titleChanged'(msg, sender) {
    const tabId = sender.tab.id;
    await patchMark(tabId, { title: msg.title });
    const cfg = await loadConfig();
    if (cfg.rules.some((r) => r.keyword)) await applyRules(tabId, sender.tab, msg.title);
    return { ok: true };
  },
  async 'tm:iconsChanged'(msg, sender) {
    const tabId = sender.tab.id;
    await patchMark(tabId, { iconHrefs: msg.iconHrefs });
    if ((await getMarksRaw())[tabId]) await pushRender(tabId);
    return { ok: true };
  },

  // --- popup / options ---
  async 'tm:canMark'(msg) {
    await ensureSession();
    return canMark(msg.tabId);
  },
  async 'tm:setColor'(msg) {
    await setColor(msg.tabId, msg.colorId);
    return { ok: true };
  },
  async 'tm:setLabel'(msg) {
    await setLabel(msg.tabId, msg.labelId);
    return { ok: true };
  },
  async 'tm:setCustomLabel'(msg) {
    await setCustomLabel(msg.tabId, msg.text);
    return { ok: true };
  },
  async 'tm:removeMark'(msg) {
    await removeMark(msg.tabId, { withNote: !!msg.withNote });
    return { ok: true };
  },
  async 'tm:setNote'(msg) {
    await setNote(msg.tabId, msg.note);
    return { ok: true };
  },
  async 'tm:setNoteHidden'(msg) {
    await setNoteState(msg.tabId, { hidden: !!msg.hidden });
    await pushRender(msg.tabId);
    return { ok: true };
  },
  async 'tm:focusTab'(msg) {
    const t = await chrome.tabs.update(msg.tabId, { active: true });
    await chrome.windows.update(t.windowId, { focused: true });
    return { ok: true };
  },
  async 'tm:openNote'(msg) {
    await setNoteState(msg.tabId, { hidden: false, collapsed: false });
    await pushRender(msg.tabId, { focusNote: true });
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const h = msg && handlers[msg.type];
  if (!h) return false;
  Promise.resolve(h(msg, sender))
    .then((r) => sendResponse(r))
    .catch((e) => {
      console.warn('[TabMarks]', msg.type, e);
      sendResponse({ ok: false, error: String(e?.message || e) });
    });
  return true;
});

// ---------------------------------------------------------------------------
// Tab / window lifecycle.

chrome.tabs.onCreated.addListener(async (tab) => {
  await ensureSession();
  maybeClaim(tab);
});

chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  if (!change.url && change.status !== 'complete') return;
  await ensureSession();
  const marked = !!(await getMarksRaw())[tabId];
  if (change.url) {
    if (marked) await patchMark(tabId, { url: change.url });
    else if (await maybeClaim(tab)) return;
  }
  await applyRules(tabId, tab);
});

chrome.tabs.onRemoved.addListener(async (tabId, info) => {
  await ensureSession();
  await serial(async () => {
    const { marks = {}, restorePool = [] } = await chrome.storage.local.get(['marks', 'restorePool']);
    const m = marks[tabId];
    if (!m) return;
    delete marks[tabId];
    if (info.isWindowClosing) {
      restorePool.push({ ...m, oldTabId: tabId, closedAt: Date.now() });
      while (restorePool.length > RESTORE_POOL_MAX) restorePool.shift();
    }
    await chrome.storage.local.set({ marks, restorePool });
  });
  setRuleSuppress(tabId, null);
});

chrome.tabs.onReplaced.addListener(async (addedId, removedId) => {
  await ensureSession();
  await serial(async () => {
    const marks = await getMarksRaw();
    if (!marks[removedId]) return;
    marks[addedId] = marks[removedId];
    delete marks[removedId];
    await chrome.storage.local.set({ marks });
  });
  pushRender(addedId);
});

chrome.tabs.onMoved.addListener((tabId, info) => {
  patchMark(tabId, { index: info.toIndex, windowId: info.windowId });
});

chrome.tabs.onAttached.addListener((tabId, info) => {
  patchMark(tabId, { index: info.newPosition, windowId: info.newWindowId });
});

chrome.windows.onCreated.addListener(async (win) => {
  await ensureSession();
  const { freshWindows = {} } = await chrome.storage.session.get('freshWindows');
  const now = Date.now();
  for (const [id, ts] of Object.entries(freshWindows)) if (now - ts > FRESH_WINDOW_MS) delete freshWindows[id];
  freshWindows[win.id] = now;
  await chrome.storage.session.set({ freshWindows });
});

// ---------------------------------------------------------------------------
// Config changes.

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.labels || changes.customColors || changes.colorPrefs) rebuildMenus();
  if (changes.settings || changes.labels || changes.customColors || changes.colorPrefs) rerenderAll();
  if (changes.rules) reapplyRulesAll();
});

// ---------------------------------------------------------------------------
// Install / startup.

chrome.runtime.onInstalled.addListener(async () => {
  const r = await chrome.storage.local.get(['labels', 'settings']);
  const seed = {};
  if (!Array.isArray(r.labels)) seed.labels = DEFAULT_LABELS;
  if (!r.settings) seed.settings = DEFAULT_SETTINGS;
  if (Object.keys(seed).length) await chrome.storage.local.set(seed);
  rebuildMenus();
  await ensureSession();
  // Re-attach to marked tabs after an install/update/reload.
  const marks = await getMarksRaw();
  for (const id of Object.keys(marks)) pushRender(Number(id));
});

chrome.runtime.onStartup.addListener(() => {
  rebuildMenus();
  ensureSession();
});

ensureSession();
