import { BUILTIN_COLORS, DEFAULT_LABELS, DEFAULT_SETTINGS, ICON_STYLES, MAX_LABELS } from '../lib/constants.js';
import { allColors, applyTheme, cssFill, getMarks, labelGroups, loadConfig, normalizeConfig, uid } from '../lib/store.js';
import { SYMBOLS } from '../lib/symbols.js';

const $ = (s) => document.querySelector(s);
let cfg;

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k === 'value') e.value = v;
    else if (k === 'checked') e.checked = !!v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}

// Debounced writes per storage key.
const timers = {};
function save(key, immediate = false) {
  clearTimeout(timers[key]);
  const write = () => chrome.storage.local.set({ [key]: cfg[key] });
  if (immediate) write();
  else timers[key] = setTimeout(write, 300);
}

function move(arr, i, d) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

function colorSelect(value, onchange, noneText = '— none —') {
  const sel = el('select', { onchange: (e) => onchange(e.target.value || null) }, el('option', { value: '' }, noneText));
  let group = null;
  let og = null;
  for (const c of allColors(cfg)) {
    if (c.group !== group) {
      group = c.group;
      og = el('optgroup', { label: group });
      sel.append(og);
    }
    og.append(el('option', { value: c.id }, `${c.emoji || '●'} ${c.name}${c.hidden ? ' (hidden)' : ''}`));
  }
  sel.value = value || '';
  return sel;
}

function labelSelect(value, onchange) {
  const sel = el('select', { onchange: (e) => onchange(e.target.value || null) }, el('option', { value: '' }, '— none —'));
  for (const g of labelGroups(cfg.labels)) {
    const og = el('optgroup', { label: g.name });
    for (const l of g.labels) og.append(el('option', { value: l.id }, `${l.emoji || ''} ${l.text}`.trim()));
    sel.append(og);
  }
  sel.value = value || '';
  return sel;
}

function rowActions(list, i, rerender, key) {
  return el(
    'div',
    { class: 'actions' },
    el('button', { class: 'icon-btn', title: 'Move up', onclick: () => (move(list, i, -1), save(key, true), rerender()) }, '↑'),
    el('button', { class: 'icon-btn', title: 'Move down', onclick: () => (move(list, i, 1), save(key, true), rerender()) }, '↓'),
    el('button', { class: 'icon-btn', title: 'Delete', onclick: () => (list.splice(i, 1), save(key, true), rerender()) }, '×'),
  );
}

// ---------------------------------------------------------------------------
// Rules

function renderRules() {
  const box = $('#rules-table');
  box.replaceChildren();
  if (!cfg.rules.length) {
    box.append(el('div', { class: 'empty' }, 'No rules yet. Example: domain github.com/my-org, keyword "pull", label 👀 Awaiting review.'));
    return;
  }
  box.append(
    el(
      'div',
      { class: 'trow head rules-cols' },
      el('span', {}, 'On'),
      el('span', {}, 'Domain'),
      el('span', {}, 'Keyword (optional)'),
      el('span', {}, 'Color'),
      el('span', {}, 'Label'),
      el('span', {}),
    ),
  );
  cfg.rules.forEach((r, i) => {
    box.append(
      el(
        'div',
        { class: 'trow rules-cols' },
        el('input', {
          type: 'checkbox',
          checked: r.enabled !== false,
          title: 'Enabled',
          onchange: (e) => ((r.enabled = e.target.checked), save('rules', true)),
        }),
        el('input', {
          type: 'text',
          value: r.domain || '',
          placeholder: 'example.com or github.com/org',
          oninput: (e) => ((r.domain = e.target.value), save('rules')),
        }),
        el('input', {
          type: 'text',
          value: r.keyword || '',
          placeholder: 'e.g. python',
          oninput: (e) => ((r.keyword = e.target.value), save('rules')),
        }),
        colorSelect(r.colorId, (v) => ((r.colorId = v), save('rules', true))),
        labelSelect(r.labelId, (v) => ((r.labelId = v), save('rules', true))),
        rowActions(cfg.rules, i, renderRules, 'rules'),
      ),
    );
  });
}

// ---------------------------------------------------------------------------
// Labels

function renderLabels() {
  const box = $('#labels-box');
  box.replaceChildren();
  const groups = labelGroups(cfg.labels);
  $('#group-names').replaceChildren(...groups.map((g) => el('option', { value: g.name })));
  $('#add-label').disabled = cfg.labels.length >= MAX_LABELS;
  $('#add-label').title = cfg.labels.length >= MAX_LABELS ? `Up to ${MAX_LABELS} labels` : '';

  if (!cfg.labels.length) {
    box.append(el('div', { class: 'empty' }, 'No labels.'));
    return;
  }
  for (const g of groups) {
    const block = el('div', { class: 'group-block' }, el('div', { class: 'group-title' }, g.name));
    block.append(
      el(
        'div',
        { class: 'trow head label-cols' },
        el('span', {}, 'Emoji'),
        el('span', {}, 'Text'),
        el('span', {}, 'Group'),
        el('span', {}, 'Auto color'),
        el('span', {}, 'Icon style'),
        el('span', {}, 'Symbol'),
        el('span', {}),
      ),
    );
    for (const l of g.labels) {
      const i = cfg.labels.indexOf(l);
      const styleSel = el(
        'select',
        { onchange: (e) => ((l.iconStyle = e.target.value || undefined), save('labels', true)) },
        el('option', { value: '' }, 'Default'),
        ...ICON_STYLES.map((s) => el('option', { value: s.id }, s.name)),
      );
      styleSel.value = l.iconStyle || '';
      const symSel = el(
        'select',
        { onchange: (e) => ((l.symbol = e.target.value || undefined), save('labels', true)) },
        el('option', { value: '' }, 'Default'),
        ...SYMBOLS.map((s) => el('option', { value: s.id }, s.name)),
      );
      symSel.value = l.symbol || '';
      block.append(
        el(
          'div',
          { class: 'trow label-cols' },
          el('input', {
            type: 'text',
            class: 'emoji',
            value: l.emoji || '',
            maxlength: 8,
            oninput: (e) => ((l.emoji = e.target.value.trim()), save('labels')),
          }),
          el('input', { type: 'text', value: l.text || '', maxlength: 40, oninput: (e) => ((l.text = e.target.value), save('labels')) }),
          el('input', {
            type: 'text',
            value: l.group || '',
            list: 'group-names',
            onchange: (e) => ((l.group = e.target.value.trim() || 'General'), save('labels', true), renderLabels()),
          }),
          colorSelect(l.colorId, (v) => ((l.colorId = v || undefined), save('labels', true))),
          styleSel,
          symSel,
          rowActions(cfg.labels, i, renderLabels, 'labels'),
        ),
      );
    }
    box.append(block);
  }
}

// ---------------------------------------------------------------------------
// Colors

function setHidden(id, hidden) {
  const set = new Set(cfg.colorPrefs.hidden);
  if (hidden) set.add(id);
  else set.delete(id);
  cfg.colorPrefs.hidden = [...set];
  save('colorPrefs', true);
}

function renderColors() {
  const grid = $('#builtin-colors');
  grid.replaceChildren(
    ...BUILTIN_COLORS.map((c) => {
      const hidden = cfg.colorPrefs.hidden.includes(c.id);
      return el(
        'div',
        { class: `color-cell${hidden ? ' hidden-color' : ''}` },
        el('span', { class: 'swatch', style: `background:${cssFill(c)};cursor:default` }),
        el('div', { class: 'name' }, el('div', {}, c.name), el('div', { class: 'group' }, c.group)),
        el('input', {
          type: 'text',
          class: 'emoji',
          title: 'Title emoji',
          value: cfg.colorPrefs.emojis[c.id] ?? c.emoji,
          oninput: (e) => {
            const v = e.target.value.trim();
            if (v === c.emoji || !v) delete cfg.colorPrefs.emojis[c.id];
            else cfg.colorPrefs.emojis[c.id] = v;
            save('colorPrefs');
          },
        }),
        el('input', {
          type: 'checkbox',
          title: 'Show in palette',
          checked: !hidden,
          onchange: (e) => (setHidden(c.id, !e.target.checked), renderColors()),
        }),
      );
    }),
  );

  const box = $('#custom-colors');
  box.replaceChildren();
  if (!cfg.customColors.length) {
    box.append(el('div', { class: 'empty' }, 'No custom colors yet.'));
    return;
  }
  cfg.customColors.forEach((c, i) => {
    const swatch = el('span', { class: 'swatch', style: `background:${cssFill(c)};cursor:default` });
    const refresh = () => (swatch.style.background = cssFill(c));
    const isGrad = !!c.gradient;
    const stops = el(
      'div',
      { class: 'stops' },
      el('input', {
        type: 'color',
        value: isGrad ? c.gradient[0] : c.value,
        oninput: (e) => {
          if (c.gradient) c.gradient[0] = e.target.value;
          else c.value = e.target.value;
          refresh();
          save('customColors');
        },
      }),
      isGrad
        ? el('input', {
            type: 'color',
            value: c.gradient[1],
            oninput: (e) => ((c.gradient[1] = e.target.value), refresh(), save('customColors')),
          })
        : null,
    );
    const typeSel = el(
      'select',
      {
        onchange: (e) => {
          if (e.target.value === 'gradient' && !c.gradient) {
            c.gradient = [c.value || '#5b5bd6', '#d6336c'];
            delete c.value;
          } else if (e.target.value === 'solid' && c.gradient) {
            c.value = c.gradient[0];
            delete c.gradient;
          }
          save('customColors', true);
          renderColors();
        },
      },
      el('option', { value: 'solid' }, 'Solid'),
      el('option', { value: 'gradient' }, 'Gradient'),
    );
    typeSel.value = isGrad ? 'gradient' : 'solid';
    const hidden = cfg.colorPrefs.hidden.includes(c.id);
    box.append(
      el(
        'div',
        { class: 'custom-row' },
        swatch,
        el('input', { type: 'text', value: c.name, maxlength: 30, oninput: (e) => ((c.name = e.target.value), save('customColors')) }),
        typeSel,
        stops,
        el('input', {
          type: 'text',
          class: 'emoji',
          title: 'Title emoji',
          value: c.emoji || '',
          oninput: (e) => ((c.emoji = e.target.value.trim()), save('customColors')),
        }),
        el(
          'label',
          { class: 'check' },
          el('input', { type: 'checkbox', checked: !hidden, onchange: (e) => setHidden(c.id, !e.target.checked) }),
          'Show',
        ),
        el(
          'button',
          {
            class: 'icon-btn',
            title: 'Delete',
            onclick: () => {
              cfg.customColors.splice(i, 1);
              save('customColors', true);
              renderColors();
              renderRules();
              renderLabels();
            },
          },
          '×',
        ),
      ),
    );
  });
}

// ---------------------------------------------------------------------------
// Shortcuts

async function renderShortcuts() {
  const cmds = await chrome.commands.getAll();
  const box = $('#shortcut-list');
  box.replaceChildren();
  for (const c of cmds) {
    if (!c.description) continue;
    box.append(el('div', {}, c.shortcut ? el('kbd', {}, c.shortcut) : el('span', { class: 'muted' }, 'not set')), el('div', {}, c.description));
  }
}

// ---------------------------------------------------------------------------
// Backup

function status(text) {
  $('#backup-status').textContent = text;
  setTimeout(() => ($('#backup-status').textContent = ''), 4000);
}

async function exportJson() {
  const marks = await getMarks();
  const { restorePool = [] } = await chrome.storage.local.get('restorePool');
  const tabs = await chrome.tabs.query({});
  const byId = new Map(tabs.map((t) => [t.id, t]));
  const notes = Object.entries(marks)
    .filter(([id]) => byId.has(Number(id)))
    .map(([id, m]) => ({ url: byId.get(Number(id)).url, title: m.title, colorId: m.colorId, labelId: m.labelId, customLabel: m.customLabel, note: m.note }));
  const data = {
    app: 'TabMarks',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: cfg.settings,
    labels: cfg.labels,
    rules: cfg.rules,
    customColors: cfg.customColors,
    colorPrefs: cfg.colorPrefs,
    openTabsSnapshot: notes,
    closedTabsSnapshot: restorePool.map((e) => ({
      url: e.url,
      title: e.title,
      colorId: e.colorId,
      labelId: e.labelId,
      customLabel: e.customLabel,
      note: e.note,
      closedAt: new Date(e.closedAt).toISOString(),
    })),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `tabmarks-backup-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  status('Exported.');
}

async function importJson(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data !== 'object') throw new Error('Not a JSON object');
    const next = normalizeConfig({
      settings: data.settings,
      labels: data.labels,
      rules: data.rules,
      customColors: data.customColors,
      colorPrefs: data.colorPrefs,
    });
    next.labels = next.labels.filter((l) => l && l.id && typeof l.text === 'string').slice(0, MAX_LABELS);
    next.rules = next.rules.filter((r) => r && r.id && typeof r.domain === 'string');
    next.customColors = next.customColors.filter((c) => c && c.id && (c.value || Array.isArray(c.gradient)));
    await chrome.storage.local.set(next);
    cfg = next;
    renderAll();
    status('Imported.');
  } catch (e) {
    status(`Import failed: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------

function renderAll() {
  applyTheme(document, cfg.settings.theme);
  renderRules();
  renderLabels();
  renderColors();
}

function bind() {
  $('#add-rule').addEventListener('click', () => {
    cfg.rules.push({ id: uid('rule'), enabled: true, domain: '', keyword: '', colorId: 'blue', labelId: null });
    save('rules', true);
    renderRules();
    $('#rules-table').querySelector('.trow:last-child input[type=text]')?.focus();
  });
  $('#add-label').addEventListener('click', () => {
    if (cfg.labels.length >= MAX_LABELS) return;
    cfg.labels.push({ id: uid('lbl'), emoji: '🏷️', text: 'New label', group: 'General' });
    save('labels', true);
    renderLabels();
  });
  $('#reset-labels').addEventListener('click', () => {
    if (!confirm('Replace all quick labels with the defaults?')) return;
    cfg.labels = DEFAULT_LABELS.map((l) => ({ ...l }));
    save('labels', true);
    renderLabels();
    renderRules();
  });
  $('#add-color').addEventListener('click', () => {
    cfg.customColors.push({ id: uid('color'), name: 'My color', value: '#5b5bd6', emoji: '🔷' });
    save('customColors', true);
    renderColors();
  });
  $('#open-shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
  $('#export').addEventListener('click', exportJson);
  $('#import').addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (f) importJson(f);
    e.target.value = '';
  });
  $('#reset-all').addEventListener('click', async () => {
    if (!confirm('Reset settings, labels, rules and colors to defaults? Your tab marks and notes are kept.')) return;
    cfg = normalizeConfig({ settings: DEFAULT_SETTINGS, labels: DEFAULT_LABELS });
    await chrome.storage.local.set(cfg);
    renderAll();
    status('Reset.');
  });

  // Reflect changes made elsewhere (popup), unless the user is typing here.
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    if (!['settings', 'labels', 'rules', 'customColors', 'colorPrefs'].some((k) => changes[k])) return;
    const fresh = await loadConfig();
    if (changes.settings) {
      cfg.settings = fresh.settings;
      applyTheme(document, cfg.settings.theme);
    }
    const typing = document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
    if (!typing && JSON.stringify(fresh) !== JSON.stringify(cfg)) {
      cfg = fresh;
      renderAll();
    }
  });
}

async function init() {
  cfg = await loadConfig();
  renderAll();
  renderShortcuts();
  bind();
}

init();
