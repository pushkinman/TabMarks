// Shared defaults for TabMarks. Everything here can be customised from the
// Rules & colors page; these are only the starting values.

export const BUILTIN_COLORS = [
  // Basic
  { id: 'red', name: 'Red', value: '#e5484d', emoji: '🔴', group: 'Basic' },
  { id: 'orange', name: 'Orange', value: '#f76b15', emoji: '🟠', group: 'Basic' },
  { id: 'yellow', name: 'Yellow', value: '#f2b705', emoji: '🟡', group: 'Basic' },
  { id: 'green', name: 'Green', value: '#30a46c', emoji: '🟢', group: 'Basic' },
  { id: 'blue', name: 'Blue', value: '#0090ff', emoji: '🔵', group: 'Basic' },
  { id: 'purple', name: 'Purple', value: '#8e4ec6', emoji: '🟣', group: 'Basic' },
  // Extended
  { id: 'pink', name: 'Pink', value: '#ff8fb1', emoji: '🩷', group: 'Extended' },
  { id: 'magenta', name: 'Magenta', value: '#c2298a', emoji: '🌺', group: 'Extended' },
  { id: 'teal', name: 'Teal', value: '#12a594', emoji: '🩵', group: 'Extended' },
  { id: 'cyan', name: 'Cyan', value: '#00a2c7', emoji: '💎', group: 'Extended' },
  { id: 'indigo', name: 'Indigo', value: '#3e63dd', emoji: '🫐', group: 'Extended' },
  { id: 'lime', name: 'Lime', value: '#8cc21b', emoji: '🍏', group: 'Extended' },
  { id: 'brown', name: 'Brown', value: '#ad7f58', emoji: '🟤', group: 'Extended' },
  { id: 'gray', name: 'Gray', value: '#8b8d98', emoji: '🩶', group: 'Extended' },
  // Gradients
  { id: 'sunset', name: 'Sunset', gradient: ['#ff7a18', '#d6336c'], emoji: '🌅', group: 'Gradients' },
  { id: 'ocean', name: 'Ocean', gradient: ['#00c6ff', '#0052d4'], emoji: '🌊', group: 'Gradients' },
  { id: 'aurora', name: 'Aurora', gradient: ['#00e0a1', '#8e4ec6'], emoji: '🌌', group: 'Gradients' },
  { id: 'twilight', name: 'Twilight', gradient: ['#3a1c71', '#d76d77'], emoji: '🌆', group: 'Gradients' },
  // Dev workflow (GitHub-like hues)
  { id: 'dev-draft', name: 'Draft', value: '#6e7781', emoji: '⬜', group: 'Dev' },
  { id: 'dev-review', name: 'Review', value: '#d4a72c', emoji: '🟨', group: 'Dev' },
  { id: 'dev-approved', name: 'Approved', value: '#1f883d', emoji: '🟩', group: 'Dev' },
  { id: 'dev-merged', name: 'Merged', value: '#8250df', emoji: '🟪', group: 'Dev' },
  { id: 'dev-blocked', name: 'Blocked', value: '#cf222e', emoji: '🟥', group: 'Dev' },
  { id: 'dev-ci', name: 'CI', value: '#0969da', emoji: '🟦', group: 'Dev' },
];

export const PR_GROUP = 'Pull requests';

// Label: { id, emoji, text, group, colorId?, iconStyle?, symbol? }
// colorId: picking the label also sets this color (unless you chose a color by hand).
// iconStyle/symbol: optional per-label override of the global icon style.
export const DEFAULT_LABELS = [
  { id: 'lbl-important', emoji: '❗', text: 'Important', group: 'General' },
  { id: 'lbl-todo', emoji: '✏️', text: 'To do', group: 'General' },
  { id: 'lbl-waiting', emoji: '⏳', text: 'Waiting', group: 'General' },
  { id: 'lbl-readlater', emoji: '📖', text: 'Read later', group: 'General' },

  { id: 'lbl-pr-draft', emoji: '📝', text: 'Draft', group: PR_GROUP, colorId: 'dev-draft' },
  { id: 'lbl-pr-awaiting', emoji: '👀', text: 'Awaiting review', group: PR_GROUP, colorId: 'dev-review' },
  { id: 'lbl-pr-reviewing', emoji: '🔍', text: 'Reviewing', group: PR_GROUP, colorId: 'indigo' },
  { id: 'lbl-pr-changes', emoji: '🔁', text: 'Changes requested', group: PR_GROUP, colorId: 'dev-blocked' },
  { id: 'lbl-pr-reply', emoji: '💬', text: 'Needs reply', group: PR_GROUP, colorId: 'orange' },
  { id: 'lbl-pr-approved', emoji: '✅', text: 'Approved', group: PR_GROUP, colorId: 'dev-approved' },
  { id: 'lbl-pr-ready', emoji: '🚀', text: 'Ready to merge', group: PR_GROUP, colorId: 'dev-approved' },
  { id: 'lbl-pr-merged', emoji: '🔀', text: 'Merged', group: PR_GROUP, colorId: 'dev-merged', iconStyle: 'symbol', symbol: 'merge' },
  { id: 'lbl-pr-ci-running', emoji: '🧪', text: 'CI running', group: PR_GROUP, colorId: 'dev-ci' },
  { id: 'lbl-pr-ci-failing', emoji: '❌', text: 'CI failing', group: PR_GROUP, colorId: 'dev-blocked' },
  { id: 'lbl-pr-blocked', emoji: '⛔', text: 'Blocked', group: PR_GROUP, colorId: 'dev-blocked' },
  { id: 'lbl-pr-mine', emoji: '🧑‍💻', text: 'My PR', group: PR_GROUP },

  { id: 'lbl-work-bug', emoji: '🐛', text: 'Bug', group: 'Work' },
  { id: 'lbl-work-hotfix', emoji: '🔥', text: 'Hotfix', group: 'Work', colorId: 'orange' },
  { id: 'lbl-work-wip', emoji: '🚧', text: 'WIP', group: 'Work' },
  { id: 'lbl-work-release', emoji: '📦', text: 'Release', group: 'Work' },
  { id: 'lbl-work-deploy', emoji: '🚢', text: 'Deploy', group: 'Work' },
  { id: 'lbl-work-reference', emoji: '📌', text: 'Reference', group: 'Work' },
  { id: 'lbl-work-investigating', emoji: '🧭', text: 'Investigating', group: 'Work' },
];

export const MAX_LABELS = 40;

export const ICON_STYLES = [
  { id: 'halo', name: 'Halo ring' },
  { id: 'tint', name: 'Full color' },
  { id: 'badge', name: 'Badge dot' },
  { id: 'emoji', name: 'Label emoji badge' },
  { id: 'symbol', name: 'Symbol' },
  { id: 'none', name: 'None' },
];

export const TITLE_MARKERS = [
  { id: 'emoji', name: 'Color emoji' },
  { id: 'symbol', name: 'Symbol' },
  { id: 'none', name: 'None' },
];

// How a label appears in the tab title.
export const LABEL_STYLES = [
  { id: 'full', name: 'Emoji + text' },
  { id: 'emoji', name: 'Emoji only' },
  { id: 'none', name: 'Hidden' },
];

export const SHOW_ON = [
  { id: 'both', name: 'Icon + title' },
  { id: 'icon', name: 'Icon only' },
  { id: 'title', name: 'Title only' },
];

export const DEFAULT_SETTINGS = {
  iconStyle: 'halo',
  symbol: 'circle',
  showOn: 'both',
  titleMarker: 'emoji',
  labelStyle: 'full', // full | emoji | none (replaces the old labelInTitle boolean)
  prCycleGroup: PR_GROUP, // label group stepped through by the "Cycle PR status" shortcut
  floatingNotes: true,
  theme: 'system', // system | light | dark
};

export const RESTORE_POOL_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const RESTORE_POOL_MAX = 500;
