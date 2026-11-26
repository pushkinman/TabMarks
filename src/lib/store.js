// Config access shared by the service worker, popup and options page.
// Marks (per-tab state) are written only by the service worker; this module
// exposes read helpers for them.

import { BUILTIN_COLORS, DEFAULT_LABELS, DEFAULT_SETTINGS } from './constants.js';

export const CONFIG_KEYS = ['settings', 'labels', 'rules', 'customColors', 'colorPrefs'];

export async function loadConfig() {
  const r = await chrome.storage.local.get(CONFIG_KEYS);
  return normalizeConfig(r);
}

export function normalizeConfig(r = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...(r.settings || {}) };
  // Migrate v1.0–1.2 setting without touching stored data.
  if (!r.settings?.labelStyle && r.settings?.labelInTitle === false) settings.labelStyle = 'none';
  return {
    settings,
    labels: Array.isArray(r.labels) ? r.labels : DEFAULT_LABELS.map((l) => ({ ...l })),
    rules: Array.isArray(r.rules) ? r.rules : [],
    customColors: Array.isArray(r.customColors) ? r.customColors : [],
    colorPrefs: { emojis: {}, hidden: [], ...(r.colorPrefs || {}) },
  };
}

export async function saveConfig(patch) {
  await chrome.storage.local.set(patch);
}

export async function saveSettings(patch) {
  const { settings } = await loadConfig();
  await chrome.storage.local.set({ settings: { ...settings, ...patch } });
}

/** All colors (built-in + custom) with emoji overrides and hidden flags applied. */
export function allColors(cfg) {
  const { emojis, hidden } = cfg.colorPrefs;
  const builtins = BUILTIN_COLORS.map((c) => ({
    ...c,
    builtin: true,
    emoji: emojis[c.id] ?? c.emoji,
    hidden: hidden.includes(c.id),
  }));
  const custom = cfg.customColors.map((c) => ({
    ...c,
    builtin: false,
    group: 'Custom',
    hidden: hidden.includes(c.id),
  }));
  return [...builtins, ...custom];
}

export function visibleColors(cfg) {
  return allColors(cfg).filter((c) => !c.hidden);
}

export function colorById(cfg, id) {
  if (!id) return null;
  return allColors(cfg).find((c) => c.id === id) || null;
}

/** CSS background value for a color (solid or gradient). */
export function cssFill(color) {
  if (!color) return 'transparent';
  if (color.gradient) return `linear-gradient(135deg, ${color.gradient[0]}, ${color.gradient[1]})`;
  return color.value;
}

/** First stop of a gradient or the solid value; for borders/accents. */
export function cssSolid(color) {
  if (!color) return null;
  return color.gradient ? color.gradient[0] : color.value;
}

/** Resolve the label shown on a mark: {emoji, text, def} or null. */
export function resolveLabel(mark, cfg) {
  if (!mark) return null;
  if (mark.labelId) {
    const def = cfg.labels.find((l) => l.id === mark.labelId);
    if (def) return { emoji: def.emoji || '', text: def.text || '', def };
  }
  if (mark.customLabel) return { emoji: '', text: mark.customLabel, def: null };
  return null;
}

export function labelGroups(labels) {
  const groups = [];
  const byName = new Map();
  for (const l of labels) {
    const name = l.group || 'General';
    if (!byName.has(name)) {
      const g = { name, labels: [] };
      byName.set(name, g);
      groups.push(g);
    }
    byName.get(name).labels.push(l);
  }
  return groups;
}

export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function getMarks() {
  return (await chrome.storage.local.get('marks')).marks || {};
}

/** Pages Chromium/Brave never let extensions script. */
export function isRestrictedUrl(url) {
  if (!url) return true;
  let u;
  try {
    u = new URL(url);
  } catch {
    return true;
  }
  if (!['http:', 'https:', 'file:'].includes(u.protocol)) return true;
  if (u.hostname === 'chromewebstore.google.com') return true;
  if (u.hostname === 'chrome.google.com' && u.pathname.startsWith('/webstore')) return true;
  return false;
}

/** Apply the theme setting to a document (popup / options). */
export function applyTheme(doc, theme) {
  const dark =
    theme === 'dark' || (theme === 'system' && globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
  doc.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
