/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Split view from the keyboard: move to the next or previous pane, and
 * rotate the panes. Also lists, for Zen's shortcut settings, the keys
 * Peppermint adds in browser-sets (see the shortcuts overlay patch): these
 * commands, and Zen commands that had no key to bind.
 */

export const COMMANDS = {
  next: "cmd_peppermintSplitFocusNext",
  previous: "cmd_peppermintSplitFocusPrevious",
  rotate: "cmd_peppermintSplitRotate",
};

/**
 * Keys for Zen's shortcut categories, by the category's l10n id; each is
 * `[key id, label l10n id]` (labels in zen-preferences.ftl).
 */
export const PEPPERMINT_KEY_CATEGORIES = {
  "zenCKSOption-group-zen-workspace": [
    ["peppermint-unload-space", "peppermint-shortcut-unload-space"],
    [
      "peppermint-unload-other-spaces",
      "peppermint-shortcut-unload-other-spaces",
    ],
    ["peppermint-theme-picker", "peppermint-shortcut-theme-picker"],
  ],
  "zenCKSOption-group-zen-tabs": [
    ["peppermint-new-folder", "peppermint-shortcut-new-folder"],
    ["peppermint-new-live-folder", "peppermint-shortcut-new-live-folder"],
    ["peppermint-edit-pinned-url", "peppermint-shortcut-edit-pinned-url"],
  ],
  "zenCKSOption-group-zen-split-view": [
    ["peppermint-split-focus-next", "peppermint-shortcut-split-focus-next"],
    [
      "peppermint-split-focus-previous",
      "peppermint-shortcut-split-focus-previous",
    ],
    ["peppermint-split-rotate", "peppermint-shortcut-split-rotate"],
    ["peppermint-glance-split", "peppermint-shortcut-glance-split"],
  ],
  "zenCKSOption-group-zen-layout": [
    ["peppermint-tabs-on-right", "peppermint-shortcut-tabs-on-right"],
  ],
};

/**
 * @param {object} categories - Zen's ZEN_KEY_CATEGORIES
 */
export function addPeppermintKeys(categories) {
  for (const [l10nId, keys] of Object.entries(PEPPERMINT_KEY_CATEGORIES)) {
    const category = categories.find(entry => entry.l10nId == l10nId);
    if (!category) {
      continue;
    }
    for (const key of keys) {
      if (!category.keys.some(([id]) => id == key[0])) {
        category.keys.push(key);
      }
    }
  }
}

function splitOf(win) {
  const splitter = win.gZenViewSplitter;
  const view = splitter?._data?.[splitter.currentView];
  const tab = win.gBrowser.selectedTab;
  if (!view?.layoutTree || !view.tabs?.includes(tab)) {
    return null;
  }
  return { splitter, view, tab };
}

/**
 * @param {object} node - A split view layout node
 * @returns {object[]} Its panes, in the order they are laid out
 */
function leaves(node) {
  if (node.tab) {
    return [node];
  }
  return (node.children ?? []).flatMap(child => leaves(child));
}

export const PeppermintSplitKeys = {
  /**
   * Selects the pane after (or before) the selected one, wrapping around.
   *
   * @param {Window} win
   * @param {number} step - 1 or -1
   * @returns {boolean} Whether another pane was selected
   */
  focus(win, step) {
    const split = splitOf(win);
    if (!split) {
      return false;
    }
    const panes = leaves(split.view.layoutTree);
    const index = panes.findIndex(pane => pane.tab == split.tab);
    if (index < 0 || panes.length < 2) {
      return false;
    }
    const next = panes[(index + step + panes.length) % panes.length];
    win.gBrowser.selectedTab = next.tab;
    return true;
  },

  /**
   * Moves every pane one place back in the layout, the first going last.
   *
   * @param {Window} win
   * @returns {boolean}
   */
  rotate(win) {
    const split = splitOf(win);
    if (!split) {
      return false;
    }
    const panes = leaves(split.view.layoutTree);
    if (panes.length < 2) {
      return false;
    }
    for (let i = panes.length - 1; i > 0; i--) {
      split.splitter.swapNodes(panes[i], panes[i - 1]);
    }
    split.splitter.applyGridLayout(split.view.layoutTree);
    return true;
  },

  /**
   * @param {Window} win
   */
  initWindow(win) {
    const doc = win.document;
    const handlers = {
      [COMMANDS.next]: () => this.focus(win, 1),
      [COMMANDS.previous]: () => this.focus(win, -1),
      [COMMANDS.rotate]: () => this.rotate(win),
    };
    // Outside a split view the commands do nothing; Zen sends no event when a
    // split starts, so a disabled state could not be kept right.
    for (const [id, run] of Object.entries(handlers)) {
      const command = doc.getElementById(id);
      if (!command || command.hasAttribute("peppermint-bound")) {
        continue;
      }
      command.setAttribute("peppermint-bound", "true");
      command.addEventListener("command", run);
    }
  },
};
