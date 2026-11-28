// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * The window side of isolated spaces (see PeppermintIsolatedSpaces.sys.mjs):
 *
 * - A guard keeps every tab of an isolated space in that space's container.
 *   Tabs reach a space in many ways (moving, dragging, the Library, folders
 *   turned into spaces, isolating a space), so instead of hooking each one it
 *   watches for tabs whose space and container disagree and reopens them in
 *   the right container, with their history.
 * - "Isolate this space" in the space menu, with a warning when the space's
 *   sites need signing in again.
 * - Inside an isolated space, the container submenus only offer the
 *   containers of other isolated spaces (choosing one opens the tab there).
 */

import { PeppermintIsolatedSpaces as Isolated } from "moz-src:///peppermint/isolated-spaces/PeppermintIsolatedSpaces.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
  ContextualIdentityService:
    "moz-src:///toolkit/components/contextualidentity/ContextualIdentityService.sys.mjs",
  E10SUtils: "resource://gre/modules/E10SUtils.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
  SessionStore:
    "moz-src:///browser/components/sessionstore/SessionStore.sys.mjs",
  TabStateFlusher:
    "moz-src:///browser/components/sessionstore/TabStateFlusher.sys.mjs",
});

const PREF_ISOLATED = "peppermint.spaces.isolated";
const PREF_WINDOW_SYNC = "zen.window-sync.enabled";
const MENU_ID = "context_peppermintIsolateSpace";
const SET_PROFILE_ID = "context_zenWorkspacesOpenInContainerTab";
const SPACE_MENU_ID = "zenWorkspaceMoreActions";
// Container submenus that open or move a tab into another container.
const CONTAINER_SUBMENUS = [
  "context_reopenInContainerPopupMenu",
  "context-openlinkinusercontext-popup",
];
const PRINCIPAL_FIELDS = [
  "triggeringPrincipal_base64",
  "principalToInherit_base64",
  "partitionedPrincipalToInherit_base64",
];

function rewritePrincipal(serialized, userContextId) {
  const principal = lazy.E10SUtils.deserializePrincipal(serialized);
  if (!principal?.isContentPrincipal) {
    return serialized;
  }
  return lazy.E10SUtils.serializePrincipal(
    Services.scriptSecurityManager.principalWithOA(principal, {
      ...principal.originAttributes,
      userContextId,
    })
  );
}

/**
 * Moves a saved tab state into another container: every principal of its
 * history gets the new container, and its session storage is dropped (it
 * belongs to the old container).
 *
 * @param {object} state - SessionStore tab state, changed in place.
 * @param {number} userContextId
 * @returns {object} The same state.
 */
export function moveTabStateToContainer(state, userContextId) {
  const visit = entries => {
    for (const entry of entries ?? []) {
      for (const field of PRINCIPAL_FIELDS) {
        if (entry[field]) {
          entry[field] = rewritePrincipal(entry[field], userContextId);
        }
      }
      visit(entry.children);
    }
  };
  visit(state.entries);
  for (const field of PRINCIPAL_FIELDS) {
    if (state[field]) {
      state[field] = rewritePrincipal(state[field], userContextId);
    }
  }
  state.userContextId = userContextId;
  delete state.storage;
  return state;
}

class WindowIsolation {
  #win;
  #observer = null;
  #pending = false;
  #running = false;
  #again = false;
  // Tabs being replaced, and tabs whose page refused to close (beforeunload):
  // neither is tried again.
  #reopening = new WeakSet();
  #declined = new WeakSet();
  #onPref = () => this.schedule();
  #onEvent = () => this.schedule();
  #onDataChanged = () => {
    for (const space of this.#spaces.getWorkspaces()) {
      Isolated.syncIdentity(space);
    }
    this.schedule();
  };

  constructor(win) {
    this.#win = win;
  }

  get #spaces() {
    return this.#win.gZenWorkspaces;
  }

  start() {
    const win = this.#win;
    this.#observer = new win.MutationObserver(() => this.schedule());
    this.#observer.observe(win.document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ["zen-workspace-id", "usercontextid"],
    });
    win.gBrowser.tabContainer.addEventListener("TabOpen", this.#onEvent);
    win.addEventListener("ZenWorkspaceDataChanged", this.#onDataChanged);
    Services.prefs.addObserver(PREF_ISOLATED, this.#onPref);
    this.#addMenu();
    win.document.addEventListener("popupshowing", this);
    win.addEventListener("unload", () => this.stop(), { once: true });
    this.schedule();
  }

  stop() {
    this.#observer?.disconnect();
    Services.prefs.removeObserver(PREF_ISOLATED, this.#onPref);
    this.#win.document.removeEventListener("popupshowing", this);
  }

  /** Checks the window's tabs soon, once per burst of changes. */
  schedule() {
    if (this.#pending || !Isolated.any) {
      return;
    }
    this.#pending = true;
    this.#win.setTimeout(() => {
      this.#pending = false;
      this.sweep().catch(console.error);
    }, 0);
  }

  // Window sync keeps a copy of a tab in every synced window. Only one window
  // may replace a synced tab, or each would make its own replacement.
  #syncedWindows() {
    return lazy.BrowserWindowTracker.orderedWindows.filter(
      w =>
        !w.closed &&
        !lazy.PrivateBrowsingUtils.isWindowPrivate(w) &&
        w.gZenWorkspaces &&
        !w.gZenWorkspaces.privateWindowOrDisabled
    );
  }

  #ownsTab(tab) {
    if (!Services.prefs.getBoolPref(PREF_WINDOW_SYNC, true)) {
      return true;
    }
    const windows = this.#syncedWindows();
    const others = windows.filter(w => w !== this.#win);
    const copied = others.some(w =>
      w.gZenWindowSync?.getItemFromWindow?.(w, tab.id)
    );
    return !copied || windows[0] === this.#win;
  }

  #skip(tab) {
    return (
      tab.closing ||
      !tab.hasAttribute("zen-workspace-id") ||
      tab.hasAttribute("zen-essential") ||
      tab.hasAttribute("zen-empty-tab") ||
      tab.hasAttribute("zen-glance-tab") ||
      this.#reopening.has(tab) ||
      this.#declined.has(tab)
    );
  }

  /** Reopens every tab that is in an isolated space but not in its container. */
  async sweep() {
    if (this.#running) {
      this.#again = true;
      return;
    }
    this.#running = true;
    try {
      const spaces = this.#spaces;
      if (!spaces || spaces.privateWindowOrDisabled || !Isolated.any) {
        return;
      }
      const byId = new Map(
        spaces.getWorkspaces().map(space => [space.uuid, space])
      );
      const splits = new Map();
      const singles = [];
      for (const tab of this.#win.gBrowser.tabs) {
        if (this.#skip(tab)) {
          continue;
        }
        const want = Isolated.containerFor(
          byId.get(tab.getAttribute("zen-workspace-id"))
        );
        if (!want || tab.userContextId === want || !this.#ownsTab(tab)) {
          continue;
        }
        const split = tab.group?.hasAttribute("split-view-group")
          ? tab.group
          : null;
        if (split) {
          splits.set(split, want);
        } else {
          singles.push([tab, want]);
        }
      }
      for (const [tab, want] of singles) {
        await this.reopenInContainer(tab, want);
      }
      for (const [group, want] of splits) {
        await this.#reopenSplit(group, want);
      }
    } finally {
      this.#running = false;
      if (this.#again) {
        this.#again = false;
        this.schedule();
      }
    }
  }

  async #reopenSplit(group, userContextId) {
    const splitter = this.#win.gZenViewSplitter;
    const index = splitter._data.findIndex(data =>
      data.tabs.some(t => group.tabs.includes(t))
    );
    if (index === -1) {
      return;
    }
    const { tabs, gridType } = splitter._data[index];
    const wasActive = tabs.includes(this.#win.gBrowser.selectedTab);
    splitter.removeGroup(index);
    const replaced = [];
    for (const tab of [...tabs]) {
      replaced.push(
        tab.userContextId === userContextId
          ? tab
          : await this.reopenInContainer(tab, userContextId)
      );
    }
    const live = replaced.filter(tab => tab && !tab.closing);
    if (live.length > 1) {
      splitter.splitTabs(live, gridType, wasActive ? 0 : -1, {
        activate: wasActive,
      });
    }
  }

  /**
   * Replaces a tab with one in another container, keeping its place, pin,
   * folder, selection, mute state and history. Firefox's own "Reopen in
   * Container" keeps only the address; that is the fallback here.
   *
   * @param {MozTabbrowserTab} tab
   * @param {number} userContextId
   * @returns {Promise<MozTabbrowserTab|null>} The new tab, or null if the old
   *   one could not be closed.
   */
  async reopenInContainer(tab, userContextId) {
    const win = this.#win;
    const { gBrowser } = win;
    this.#reopening.add(tab);
    const spaceId = tab.getAttribute("zen-workspace-id");
    const wasSelected = gBrowser.selectedTab === tab;
    const folder =
      tab.group && !tab.group.hasAttribute("split-view-group")
        ? tab.group
        : null;

    let state = null;
    try {
      if (tab.linkedPanel) {
        await lazy.TabStateFlusher.flush(tab.linkedBrowser);
      }
      state = moveTabStateToContainer(
        JSON.parse(lazy.SessionStore.getTabState(tab)),
        userContextId
      );
    } catch (error) {
      console.error(
        "Peppermint isolated spaces: reading the tab state failed",
        error
      );
    }
    if (tab.closing || !tab.isConnected) {
      this.#reopening.delete(tab);
      return null;
    }

    let newTab;
    if (state) {
      newTab = gBrowser.addTrustedTab("about:blank", {
        userContextId,
        skipLoad: true,
        createLazyBrowser: !wasSelected,
        inBackground: true,
        pinned: tab.pinned,
        tabIndex: tab.index + 1,
        zenWorkspaceId: spaceId,
        skipRoute: true,
      });
      Object.assign(state, {
        pinned: tab.pinned,
        zenWorkspace: spaceId,
        zenSyncId: null,
        zenEssential: false,
        zenIsGlance: false,
        zenGlanceId: null,
        zenDefaultUserContextId: "true",
      });
      try {
        lazy.SessionStore.setTabState(newTab, JSON.stringify(state));
      } catch (error) {
        console.error(
          "Peppermint isolated spaces: restoring the tab state failed",
          error
        );
        gBrowser.removeTab(newTab, { animate: false, skipSessionStore: true });
        newTab = null;
      }
    }
    newTab ??= this.#openAddress(tab, userContextId, spaceId);
    if (!newTab) {
      this.#reopening.delete(tab);
      this.#declined.add(tab);
      return null;
    }

    if (folder) {
      try {
        folder.addTabs([newTab]);
      } catch (error) {
        console.error(
          "Peppermint isolated spaces: keeping the tab in its folder failed",
          error
        );
      }
    }
    try {
      gBrowser.moveTabAfter(newTab, tab);
    } catch {
      // Order is cosmetic; the tab is in the right space either way.
    }
    if (tab.muted && !newTab.muted) {
      newTab.toggleMuteAudio(tab.muteReason);
    }
    if (wasSelected) {
      gBrowser.selectedTab = newTab;
    }
    const lastSelected = win.gZenWorkspaces.lastSelectedWorkspaceTabs;
    if (lastSelected?.[spaceId] === tab) {
      lastSelected[spaceId] = newTab;
    }

    gBrowser.removeTab(tab, { animate: false, skipSessionStore: true });
    if (!tab.closing && tab.isConnected) {
      // The page asked to stay open (beforeunload): keep it, drop the copy.
      gBrowser.removeTab(newTab, { animate: false, skipSessionStore: true });
      if (wasSelected) {
        gBrowser.selectedTab = tab;
      }
      this.#reopening.delete(tab);
      this.#declined.add(tab);
      return null;
    }
    return newTab;
  }

  // The fallback: open the tab's address in the container, as Firefox does.
  #openAddress(tab, userContextId, spaceId) {
    const uri = tab.linkedBrowser?.currentURI?.spec;
    if (!uri) {
      return null;
    }
    let principal = tab.linkedPanel ? tab.linkedBrowser.contentPrincipal : null;
    if (!principal || principal.isNullPrincipal) {
      principal = Services.scriptSecurityManager.createNullPrincipal({
        userContextId,
      });
    } else if (principal.isContentPrincipal) {
      principal = Services.scriptSecurityManager.principalWithOA(principal, {
        ...principal.originAttributes,
        userContextId,
      });
    }
    return this.#win.gBrowser.addTab(uri, {
      userContextId,
      pinned: tab.pinned,
      tabIndex: tab.index + 1,
      triggeringPrincipal: principal,
      inBackground: true,
      zenWorkspaceId: spaceId,
      skipRoute: true,
    });
  }

  // The space menu

  #addMenu() {
    const doc = this.#win.document;
    const anchor = doc.getElementById(SET_PROFILE_ID);
    if (!anchor || doc.getElementById(MENU_ID)) {
      return;
    }
    const item = doc.createXULElement("menuitem");
    item.id = MENU_ID;
    item.setAttribute("type", "checkbox");
    doc.l10n.setAttributes(item, "peppermint-space-isolate");
    item.addEventListener("command", () => {
      this.toggle(this.#spaces.contextMenuSpaceId).catch(console.error);
    });
    anchor.after(item);
  }

  #updateSpaceMenu() {
    const doc = this.#win.document;
    const item = doc.getElementById(MENU_ID);
    const setProfile = doc.getElementById(SET_PROFILE_ID);
    if (!item) {
      return;
    }
    const space = this.#spaces.getWorkspaceFromId(
      this.#spaces.contextMenuSpaceId
    );
    item.hidden = !Isolated.available || !space;
    const isolated = Isolated.isIsolated(space);
    item.toggleAttribute("checked", isolated);
    // Choosing another container would end the isolation, so it is locked
    // until "Isolate this space" is turned off.
    if (setProfile) {
      setProfile.disabled = isolated;
      if (isolated) {
        doc.l10n
          .formatValue("peppermint-space-isolated-locked")
          .then(text => setProfile.setAttribute("tooltiptext", text))
          .catch(console.error);
      } else {
        setProfile.removeAttribute("tooltiptext");
      }
    }
  }

  // In an isolated space, a container menu only offers the containers of
  // other isolated spaces: any other container would leave the space.
  #filterContainerMenu(popup) {
    const spaces = this.#spaces.getWorkspaces();
    const active = this.#spaces.getActiveWorkspaceFromCache();
    if (!Isolated.isIsolated(active)) {
      return;
    }
    for (const item of popup.querySelectorAll("menuitem[data-usercontextid]")) {
      const id = parseInt(item.getAttribute("data-usercontextid"));
      item.hidden =
        id === active.containerTabId || !Isolated.ownerOf(id, spaces);
    }
  }

  handleEvent(event) {
    if (event.type !== "popupshowing") {
      return;
    }
    const popup = event.target;
    if (popup.id === SPACE_MENU_ID) {
      this.#updateSpaceMenu();
    } else if (CONTAINER_SUBMENUS.includes(popup.id) && Isolated.any) {
      this.#filterContainerMenu(popup);
    }
  }

  /**
   * Turns isolation on or off for a space, asking first when turning it on.
   *
   * @param {string} spaceId
   * @param {object} [options]
   * @param {boolean} [options.prompt] - Ask before turning it on.
   * @returns {Promise<boolean>} Whether the space is now isolated.
   */
  async toggle(spaceId, { prompt = true } = {}) {
    const manager = this.#spaces;
    const space = manager.getWorkspaceFromId(spaceId);
    if (!space || manager.privateWindowOrDisabled) {
      return false;
    }
    if (Isolated.isIsolated(space)) {
      Isolated.unisolate(space.uuid);
      return false;
    }
    const spaces = manager.getWorkspaces();
    const kind = Isolated.isolationKind(space, spaces);
    if (prompt && !(await this.#confirm(space, kind))) {
      return false;
    }
    if (!Isolated.isolate(space, spaces, { mode: kind })) {
      return false;
    }
    await manager.saveWorkspace(space);
    this.schedule();
    return true;
  }

  async #confirm(space, kind) {
    const container =
      kind === "adopt"
        ? lazy.ContextualIdentityService.getUserContextLabel(
            space.containerTabId
          )
        : "";
    const [title, body, button] = await this.#win.document.l10n.formatValues([
      { id: "peppermint-space-isolate-title", args: { name: space.name } },
      {
        id:
          kind === "adopt"
            ? "peppermint-space-isolate-adopt-body"
            : "peppermint-space-isolate-new-body",
        args: { name: space.name, container },
      },
      { id: "peppermint-space-isolate-button" },
    ]);
    const flags =
      Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_IS_STRING +
      Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_CANCEL +
      Services.prompt.BUTTON_POS_0_DEFAULT;
    return (
      Services.prompt.confirmEx(
        this.#win,
        title,
        body,
        flags,
        button,
        null,
        null,
        null,
        {}
      ) === 0
    );
  }
}

const windows = new WeakMap();

export const PeppermintIsolatedSpacesWindow = {
  /**
   * Starts isolation in a browser window. Private windows have no spaces of
   * their own and are left alone.
   *
   * @param {Window} win
   */
  async initWindow(win) {
    if (
      windows.has(win) ||
      lazy.PrivateBrowsingUtils.isWindowPrivate(win) ||
      !win.gZenWorkspaces
    ) {
      return;
    }
    await win.gZenWorkspaces.promiseInitialized;
    if (win.closed || win.gZenWorkspaces.privateWindowOrDisabled) {
      return;
    }
    const isolation = new WindowIsolation(win);
    windows.set(win, isolation);
    isolation.start();
  },

  /** The window's isolation, for tests and other Peppermint features. */
  forWindow(win) {
    return windows.get(win) ?? null;
  },

  /**
   * Deletes containers left behind by spaces deleted elsewhere (another
   * device, another window), once the spaces are restored.
   *
   * @param {Window} win
   */
  async prune(win) {
    if (!win.gZenWorkspaces || win.gZenWorkspaces.privateWindowOrDisabled) {
      return;
    }
    await win.gZenWorkspaces.promiseInitialized;
    await Isolated.prune(win.gZenWorkspaces.getWorkspaces());
  },
};
