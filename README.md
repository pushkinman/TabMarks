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
- **Toolbar popup** (`Alt+Shift+L`): a color palette, label chips grouped by General, Pull requests and Work, a custom label field, and a note box. The popup opens with a quick-pick box focused:
  - Type a few letters, then press `Enter` to apply the top match and close the popup. `Shift+Enter` applies it and keeps the popup open. Use `↑`/`↓` to move through matches. If nothing matches, Enter sets what you typed as a custom label.
  - With the box empty, `1`–`9` applies that label from the current group, `0` clears the label, `←`/`→` switch groups, and `⌘⌫` removes the color and label.
  - `Esc` clears the box, or closes the popup if the box is already empty.
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
- `Alt+Shift+O` shows or hides the current tab's note. On a tab without a note, it opens an empty note ready to type into. It works even when floating notes are turned off.
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

### Restore & recently closed
- Marks and notes come back after a **browser restart** or when you **reopen a closed window**. They are matched by URL and tab position.
- A tab reopened with **`⌘⇧T`** (within an hour, in the same window and position) gets its mark and note back.
- The popup's **Recently closed** list keeps closed tabs that had a mark or note, for up to 14 days. It's searchable. Click an entry to reopen the tab with its mark, or click × to forget it.
- A brand-new tab with the same URL still starts clean.

### Customization (⚙ in the popup → Rules & colors)
- Rules
- Quick labels (up to 40): emoji, text, group, auto color, icon style, symbol, order
- Title emoji per color, show or hide colors, unlimited custom colors (solid or 2-stop gradient)
- Shortcuts overview
- JSON export/import of all configuration

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Alt+Shift+L` | Open the TabMarks popup (quick label) |
| `Alt+Shift+M` | Mark the tab / cycle through colors |
| `Alt+Shift+N` | Jump to the next marked tab (same color if the current tab is marked) |
| `Alt+Shift+O` | Show / hide this tab's note on the page |
| *(unassigned)* | Remove color and label (the note is kept); also `⌘⌫` in the popup |
| *(unassigned)* | Cycle PR status label |

Chrome gives an extension at most 4 default shortcuts, so the last two start unassigned.

On macOS, Alt is ⌥ (Option). You can change any shortcut at `brave://extensions/shortcuts`.

## Limits
- Browsers don't let extensions touch `brave://` and `chrome://` pages, the Web Store, or the built-in PDF viewer. TabMarks says so when you try to mark one.
- SVG favicons are rasterized in an offscreen page. If a site's favicon can't be fetched at all, a letter icon is used instead.
- Everything is stored locally in `chrome.storage.local`. There is no sync, no account and no analytics. The only network requests are fetches of the site's own favicon.

## Project layout

```
manifest.json
src/background/sw.js      service worker: mark state, rules, restore, favicon rendering, menus, shortcuts
src/content/content.js    title prefix, favicon swap, floating note (shadow DOM)
src/popup/                toolbar popup
src/options/              Rules & colors page
src/offscreen/            rasterizes SVG favicons (service workers can't decode SVG)
src/lib/                  shared constants, storage helpers, rules, symbols, favicon renderer
src/ui/base.css           shared styles
scripts/make-icons.py     regenerates icons/ (pure Python)
```

To develop, open the popup as a page for a given tab: `chrome-extension://<id>/src/popup/popup.html?tabId=<id>`.
