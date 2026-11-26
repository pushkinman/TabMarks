# TabMarks

Color, label and annotate individual browser tabs with emojis, favicon styles and notes. You can do this without grouping or moving the tabs. It's built for PR-heavy dev workflows, and it works in Brave and any Chromium browser (Manifest V3).

## Install in Brave

1. Open `brave://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder (the one containing `manifest.json`).
4. Pin TabMarks from the toolbar's extensions menu.

After editing the code, click the reload icon on the TabMarks card in `brave://extensions`.

## What it does

### Marking a tab
A mark is a **color**, an optional **label** and an optional **note**. You can mark a tab three ways:
- **Toolbar popup**: a color palette, label chips grouped by General, Pull requests and Work, a custom label field, and a note box.
- **Right-click a page → TabMarks**: color, label groups, add or edit the note, show or hide the note, remove.
- **Keyboard shortcuts**: listed below.

### How a mark appears
- **Tab title.** Example: `🔴 [👀 Awaiting review] Fix flaky auth test #123`. The page title stays prefixed even when the site changes its title (for example a notification counter like `(3)`).
- **Favicon.** Choose one icon style:
  - Halo ring
  - Full color tint
  - Badge dot
  - Label emoji badge (the label's emoji in the icon's corner)
  - Symbol (18 shapes and dev glyphs: PR, merge, eye, check, cross, hourglass, comment, bug, flame, lock, rocket, flag…)
  - None
- **Show mark on:** icon + title, icon only, or title only.
- **Title marker:** color emoji, symbol, or none.
- **Per-label override.** A label can set its own icon style and symbol. For example, "Merged" defaults to the purple merge symbol.

### Developer workflow
- **Pull request labels:**
  - 📝 Draft
  - 👀 Awaiting review
  - 🔍 Reviewing
  - 🔁 Changes requested
  - 💬 Needs reply
  - ✅ Approved
  - 🚀 Ready to merge
  - 🔀 Merged
  - 🧪 CI running
  - ❌ CI failing
  - ⛔ Blocked
  - 🧑‍💻 My PR
- **Work labels:** 🐛 Bug, 🔥 Hotfix, 🚧 WIP, 📦 Release, 🚢 Deploy, 📌 Reference, 🧭 Investigating.
- **Labels carry colors.** Picking "Awaiting review" also colors the tab Review-amber, unless you chose a color by hand.
- **Dev colors:** Draft, Review, Approved, Merged, Blocked and CI, in GitHub-like hues.
- **"Cycle PR status" shortcut.** It steps through the *Pull requests* group. Assign a key at `brave://extensions/shortcuts`.

### Notes
- Type a note in the popup. It also appears as a **floating sticky note** on the page, which you can drag, collapse or hide, and edit inline.
- Page keyboard shortcuts (such as GitHub hotkeys) are blocked while you type in the note.
- Turn floating notes off globally under Display settings, or per tab with "Show on page".

### Finding tabs
- The popup lists every marked tab, grouped by color.
- Search covers title, label, note and URL.
- Filter by label group or "With notes".
- Click a tab in the list to jump to it.

### Rules (Rules & colors page)
- A rule is a domain (optionally with a path, e.g. `github.com/my-org`) plus an optional keyword matched in the URL or title. It sets a color and/or label.
- The first matching rule wins.
- A color you pick by hand always overrides a rule.
- Removing a rule-applied mark keeps it off until the page navigates.

### Restore
- Marks and notes come back after a **browser restart** or when you **reopen a closed window**. They are matched by URL and tab position.
- A brand-new tab with the same URL starts clean.
- A single tab closed on its own drops its mark.

### Customization (⚙ in the popup → Rules & colors)
- Rules
- Quick labels (up to 40): emoji, text, group, auto color, icon style, symbol, order
- Title emoji per color, show or hide colors, unlimited custom colors (solid or 2-stop gradient)
- Shortcuts overview
- JSON export/import of all configuration

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Alt+Shift+M` | Mark the tab / cycle through colors |
| `Alt+Shift+N` | Jump to the next marked tab (same color if the current tab is marked) |
| `Alt+Shift+X` | Remove color and label (the note is kept) |
| *(unassigned)* | Cycle PR status label |

On macOS, Alt is ⌥ (Option). You can change any shortcut at `brave://extensions/shortcuts`.

## Limits
- Browsers don't let extensions touch `brave://` and `chrome://` pages, the Web Store, or the built-in PDF viewer. TabMarks says so when you try to mark one.
- Favicons that exist only as SVG fall back to the browser's cached favicon, then to a letter icon.
- Everything is stored locally in `chrome.storage.local`. There is no sync, no account and no analytics. The only network requests are fetches of the site's own favicon.

## Project layout

```
manifest.json
src/background/sw.js      service worker: mark state, rules, restore, favicon rendering, menus, shortcuts
src/content/content.js    title prefix, favicon swap, floating note (shadow DOM)
src/popup/                toolbar popup
src/options/              Rules & colors page
src/lib/                  shared constants, storage helpers, rules, symbols, favicon renderer
src/ui/base.css           shared styles
scripts/make-icons.py     regenerates icons/ (pure Python)
```

To develop, open the popup as a page for a given tab: `chrome-extension://<id>/src/popup/popup.html?tabId=<id>`.
