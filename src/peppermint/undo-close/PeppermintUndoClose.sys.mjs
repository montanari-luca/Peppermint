/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * After tabs close, a toast offers to reopen them. Tabs that close in the
 * same task (a multiselection, "close other tabs", the palette's duplicate
 * closer) share one toast, and Undo reopens them together: it is the same
 * restore as Cmd/Ctrl+Shift+T, so it covers exactly what SessionStore kept.
 *
 * Nothing is shown when SessionStore kept nothing (a blank tab, a tab moved
 * to another window, or one closed with skipSessionStore such as an
 * archived tab), and nothing is shown over Zen's own toast for the same
 * closing.
 */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  SessionStore: "moz-src:///browser/components/sessionstore/SessionStore.sys.mjs",
  SessionWindowUI:
    "moz-src:///browser/components/sessionstore/SessionWindowUI.sys.mjs",
});

const PREF = "peppermint.tabs.undo-close-toast";
const FTL = "browser/peppermint-tab-close.ftl";
const MESSAGE_ID = "peppermint-undo-close-toast";
const BUTTON_ID = "peppermint-undo-close-button";
// Zen toasts that already offer an undo for the tabs they closed.
const ZEN_CLOSE_TOASTS = ["zen-workspaces-close-all-unpinned-tabs-toast"];

// A saved tab older than its batch is not one the batch closed (a blank tab
// saves nothing, which leaves an older entry on top).
const BATCH_SLACK_MS = 1000;

function newestClosed(window) {
  return lazy.SessionStore.getClosedTabDataForWindow(window)[0];
}

function findToast(window, messageId) {
  const container = window.document.getElementById("zen-toast-container");
  return [...(container?.children ?? [])].find(
    toast => toast._messageId == messageId
  );
}

function dismiss(window) {
  const toast = findToast(window, MESSAGE_ID);
  if (!toast) {
    return;
  }
  const container = toast.parentElement;
  toast.remove();
  if (!container.children.length) {
    container.setAttribute("hidden", "true");
  }
}

export const PeppermintUndoClose = {
  /**
   * @param {Window} window - A browser window
   */
  init(window) {
    window.MozXULElement.insertFTLIfNeeded(FTL);
    let batchStart = null;
    // TabClose bubbles to the window, which exists before gBrowser does.
    window.addEventListener("TabClose", event => {
      const { adoptedBy, skipSessionStore } = event.detail ?? {};
      if (
        batchStart !== null ||
        adoptedBy ||
        skipSessionStore ||
        !Services.prefs.getBoolPref(PREF, true)
      ) {
        return;
      }
      batchStart = Date.now();
      // SessionStore saves each tab in its own TabClose listener; by the next
      // task every tab of the batch is saved.
      Services.tm.dispatchToMainThread(() => {
        const since = batchStart;
        batchStart = null;
        this.offerUndo(window, since);
      });
    });
  },

  /**
   * Shows the toast for the tabs SessionStore saved last, if it saved them
   * in this batch.
   *
   * @param {Window} window - A browser window
   * @param {number} since - When the batch's first tab closed (ms)
   */
  offerUndo(window, since) {
    if (window.closed) {
      return;
    }
    const newest = newestClosed(window);
    const closedId = newest?.closedId;
    if (
      closedId === undefined ||
      closedId === this._shown.get(window) ||
      newest.closedAt < since - BATCH_SLACK_MS
    ) {
      return;
    }
    this._shown.set(window, closedId);
    if (ZEN_CLOSE_TOASTS.some(id => findToast(window, id))) {
      return;
    }
    const count = lazy.SessionStore.getLastClosedTabCount(window);
    window.gZenUIManager
      .showToast(MESSAGE_ID, {
        l10nArgs: { count },
        button: {
          id: BUTTON_ID,
          command: () => this.undo(window, closedId),
        },
      })
      .catch(error => console.error("Undo close toast failed", error));
    // Zen keeps a visible toast's text when it is shown again, and its button
    // is an icon; this one needs the new count and a written label.
    const l10n = window.document.l10n;
    const toast = findToast(window, MESSAGE_ID);
    const label = toast?.querySelector("label");
    const button = toast?.querySelector(`#${BUTTON_ID}`);
    if (label && button) {
      l10n.setAttributes(label, MESSAGE_ID, { count });
      l10n.setAttributes(button, BUTTON_ID);
      // Translated now rather than on the next refresh, which a window in the
      // background may not get before the toast hides.
      l10n.translateElements([label, button]);
    }
  },

  /**
   * Reopens the tabs a toast offered, unless they were reopened already.
   *
   * @param {Window} window - A browser window
   * @param {number} closedId - closedId of the newest tab the toast covers
   * @returns {boolean} Whether anything was reopened
   */
  undo(window, closedId) {
    dismiss(window);
    if (newestClosed(window)?.closedId !== closedId) {
      return false;
    }
    lazy.SessionWindowUI.undoCloseTab(window);
    return true;
  },

  _shown: new WeakMap(),
};
