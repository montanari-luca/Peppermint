/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tab lifecycle: an idle tab is closed into the archive after
 * `peppermint.tab-archive.hours` (0 turns that off), and a tab can be snoozed
 * until a later time. Both can be opened again from about:archive, in the
 * Space they came from. Pinned tabs, Essentials, folders, split views and
 * private windows are never touched (see `isArchivable`).
 */

import {
  isArchivable,
  isTabHostListed,
  parseHostList,
  tabUrl,
} from "moz-src:///peppermint/common/PeppermintTabs.sys.mjs";
import {
  addRecord,
  dueSnoozes,
  getRecord,
  nextWakeTime,
  removeRecord,
  updateRecord,
} from "moz-src:///peppermint/tab-archive/PeppermintTabArchiveStore.sys.mjs";
import { bumpReport } from "moz-src:///peppermint/report/PeppermintReportStore.sys.mjs";
import { showToast } from "moz-src:///peppermint/palette/PeppermintPaletteAction.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  PeppermintActivity: "moz-src:///peppermint/common/PeppermintActivity.sys.mjs",
  SessionStore:
    "moz-src:///browser/components/sessionstore/SessionStore.sys.mjs",
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
});

export const PREF_HOURS = "peppermint.tab-archive.hours";
// Sites the idle sweep leaves alone; archiving by hand still works.
export const PREF_NEVER = "peppermint.tab-archive.never";
// An archived tab keeps this much of its history around the current page.
const MAX_HISTORY = 10;
const MAX_STATE_CHARS = 64 * 1024;
// What only an open tab in its old place means; restored, the tab is a
// plain tab in the Space it goes back to.
const PLACE_FIELDS = [
  "zenEssential",
  "zenIsEmpty",
  "zenSyncId",
  "zenIsGlance",
  "zenGlanceId",
  "zenLiveFolderItemId",
  "zenPinnedIcon",
  "_zenPinnedInitialState",
  "_zenIsActiveTab",
  "groupId",
  "hidden",
];
const DEFAULT_HOURS = 72;
const HOUR_MS = 60 * 60 * 1000;
const FIRST_SWEEP_DELAY_MS = 2 * 60 * 1000;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
// nsITimer delays are 32-bit; a longer wait is split into several.
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;
const SNOOZE_HOUR_OF_DAY = 9;
const SNOOZE_LATER_HOURS = 3;

let sweepTimer = null;
let wakeTimer = null;
let initialized = false;

function newTimer() {
  return Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
}

function isPrivate(win) {
  return lazy.PrivateBrowsingUtils.isWindowPrivate(win);
}

function browserWindows() {
  return Array.from(Services.wm.getEnumerator("navigator:browser")).filter(
    win => !win.closed && win.gBrowser && !isPrivate(win)
  );
}

function targetWindow(preferred) {
  if (preferred && !preferred.closed && !isPrivate(preferred)) {
    return preferred;
  }
  return lazy.BrowserWindowTracker.getTopWindow({ private: false });
}

/**
 * @param {number} now - Milliseconds since 1970
 * @param {"later"|"tomorrow"|"next-week"} preset
 * @returns {number} When a tab snoozed with the preset comes back: three hours
 *   from now, 9:00 tomorrow, or 9:00 next Monday
 */
export function snoozeTime(now, preset) {
  if (preset == "later") {
    return now + SNOOZE_LATER_HOURS * HOUR_MS;
  }
  const date = new Date(now);
  date.setHours(SNOOZE_HOUR_OF_DAY, 0, 0, 0);
  if (preset == "tomorrow") {
    date.setDate(date.getDate() + 1);
  } else {
    const daysToMonday = (8 - date.getDay()) % 7 || 7;
    date.setDate(date.getDate() + daysToMonday);
  }
  return date.getTime();
}

function neverArchiveList() {
  return parseHostList(Services.prefs.getStringPref(PREF_NEVER, ""));
}

/**
 * @param {MozTabbrowserTab} tab
 * @param {string[]} [list] - The parsed list, when checking many tabs
 * @returns {boolean} The tab's site is on the never-archive list
 */
export function isNeverArchived(tab, list = neverArchiveList()) {
  return isTabHostListed(list, tab);
}

/**
 * Put a site on the never-archive list, or take it off.
 *
 * @param {string} host
 * @param {boolean} never
 */
export function setNeverArchived(host, never) {
  const name = String(host || "").toLowerCase();
  if (!name) {
    return;
  }
  const list = neverArchiveList().filter(entry => entry !== name);
  if (never) {
    list.push(name);
  }
  Services.prefs.setStringPref(PREF_NEVER, list.join("\n"));
}

function archiveHours() {
  return Services.prefs.getIntPref(PREF_HOURS, DEFAULT_HOURS);
}

function workspaceOf(win, tab) {
  const workspaceId = tab.getAttribute("zen-workspace-id") || "";
  let workspaceName = "";
  try {
    workspaceName = workspaceId
      ? win.gZenWorkspaces?.getWorkspaceFromId(workspaceId)?.name || ""
      : "";
  } catch {
    // The Space may be gone already.
  }
  return { workspaceId, workspaceName };
}

/**
 * Whether the user can archive or snooze this tab by hand. Unlike the idle
 * sweep this accepts the selected tab.
 *
 * @param {Window} win
 * @param {MozTabbrowserTab} tab
 * @returns {boolean}
 */
export function canArchiveByHand(win, tab) {
  return !isPrivate(win) && isArchivable(tab, null);
}

/**
 * @param {object} state - A tab's session state
 * @returns {number} Its size as stored
 */
function stateSize(state) {
  return JSON.stringify(state).length;
}

/**
 * @param {MozTabbrowserTab} tab
 * @returns {object|null} The tab's session state trimmed for the archive:
 *   history around the current page, and no form data when it is large.
 *   Null when there is none worth keeping.
 */
export function archivedState(tab) {
  let state;
  try {
    state = JSON.parse(lazy.SessionStore.getTabState(tab));
  } catch {
    return null;
  }
  if (!Array.isArray(state?.entries) || !state.entries.length) {
    return null;
  }
  const index = Math.min(
    Math.max(1, state.index || state.entries.length),
    state.entries.length
  );
  const start = Math.max(0, index - MAX_HISTORY);
  state.entries = state.entries.slice(start, start + MAX_HISTORY);
  state.index = index - start;
  if (stateSize(state) > MAX_STATE_CHARS) {
    delete state.formdata;
    for (const entry of state.entries) {
      delete entry.formdata;
    }
  }
  if (stateSize(state) > MAX_STATE_CHARS) {
    state.entries = [state.entries[state.index - 1]];
    state.index = 1;
  }
  return stateSize(state) > MAX_STATE_CHARS ? null : state;
}

async function closeIntoStore(win, tab, extra) {
  const state = archivedState(tab);
  const record = await addRecord({
    ...(state ? { state } : {}),
    url: tabUrl(tab),
    title: tab.label || tabUrl(tab),
    ...workspaceOf(win, tab),
    userContextId: tab.userContextId || 0,
    lastAccessed: tab.lastAccessed || 0,
    archivedAt: Date.now(),
    ...extra,
  });
  win.gBrowser.removeTab(tab, { animate: false, skipSessionStore: true });
  bumpReport("archived");
  return record;
}

/**
 * Close a tab into the archive.
 *
 * @param {Window} win
 * @param {MozTabbrowserTab} tab
 * @returns {Promise<object|null>} The record, or null when the tab may not be
 *   archived
 */
export async function archiveTab(win, tab) {
  return canArchiveByHand(win, tab)
    ? closeIntoStore(win, tab, { kind: "archive" })
    : null;
}

/**
 * Close a tab and open it again at `wakeAt`.
 *
 * @param {Window} win
 * @param {MozTabbrowserTab} tab
 * @param {number} wakeAt - Milliseconds since 1970
 * @returns {Promise<object|null>} The record, or null when the tab may not be
 *   snoozed
 */
export async function snoozeTab(win, tab, wakeAt) {
  if (!canArchiveByHand(win, tab)) {
    return null;
  }
  const record = await closeIntoStore(win, tab, { kind: "snooze", wakeAt });
  armWake();
  return record;
}

/**
 * Snooze a tab that is already in the archive.
 *
 * @param {string} id - Record id
 * @param {"later"|"tomorrow"|"next-week"} preset
 * @returns {Promise<object|null>} The record, or null when there is none
 */
export async function snoozeRecord(id, preset) {
  const record = await updateRecord(id, {
    kind: "snooze",
    wakeAt: snoozeTime(Date.now(), preset),
  });
  if (record) {
    armWake();
  }
  return record;
}

/**
 * @param {number} [hours] - Defaults to the pref
 * @returns {{win: Window, tab: MozTabbrowserTab}[]} Tabs that sat idle for at
 *   least `hours` and may be archived
 */
export function idleCandidates(hours = archiveHours()) {
  if (hours <= 0) {
    return [];
  }
  const cutoff = Date.now() - hours * HOUR_MS;
  const never = neverArchiveList();
  const found = [];
  for (const win of browserWindows()) {
    const selected = win.gBrowser.selectedTab;
    for (const tab of win.gBrowser.tabs) {
      const last = tab.lastAccessed || 0;
      if (
        last &&
        last <= cutoff &&
        isArchivable(tab, selected) &&
        !isNeverArchived(tab, never)
      ) {
        found.push({ win, tab });
      }
    }
  }
  return found;
}

/**
 * Archive every tab that sat idle long enough.
 *
 * @param {number} [hours] - Defaults to the pref
 * @returns {Promise<number>} How many tabs were archived
 */
export async function archiveIdleTabs(hours) {
  let count = 0;
  for (const { win, tab } of idleCandidates(hours)) {
    try {
      await closeIntoStore(win, tab, { kind: "archive" });
      count++;
    } catch (error) {
      console.error("A tab could not be archived", error);
    }
  }
  return count;
}

/**
 * Open an archived or snoozed tab again, in its Space when that still exists,
 * and take it out of the store.
 *
 * @param {string} id - Record id
 * @param {Window} [preferred] - The window to open it in
 * @param {object} [options]
 * @param {boolean} [options.select] - Switch to the tab; otherwise it opens in
 *   the background
 * @returns {Promise<MozTabbrowserTab|null>} Null when there is no such record
 *   or no window to open it in
 */
export async function restoreRecord(id, preferred, { select = true } = {}) {
  const record = await getRecord(id);
  if (!record) {
    return null;
  }
  const tab = openRecord(record, preferred, { select });
  if (tab) {
    await removeRecord(id);
  }
  return tab;
}

/**
 * Opens a record's tab right away, for callers that must open it in the
 * same task (the Library keeps itself open only around a synchronous call).
 * The caller takes the record out of the store.
 *
 * @param {object} record - From the store
 * @param {Window} [preferred] - The window to open it in
 * @param {object} [options]
 * @param {boolean} [options.select]
 * @returns {MozTabbrowserTab|null} Null when there is no window to open it in
 */
export function openRecord(record, preferred, { select = true } = {}) {
  const win = targetWindow(preferred);
  if (!win) {
    return null;
  }
  let workspaceId;
  try {
    workspaceId = win.gZenWorkspaces?.getWorkspaceFromId(record.workspaceId)
      ? record.workspaceId
      : undefined;
  } catch {
    workspaceId = undefined;
  }
  const options = {
    triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    userContextId: record.userContextId || 0,
    zenWorkspaceId: workspaceId,
    inBackground: !select,
  };
  let tab;
  if (record.state) {
    const state = { ...record.state, pinned: false };
    for (const field of PLACE_FIELDS) {
      delete state[field];
    }
    if (workspaceId) {
      state.zenWorkspace = workspaceId;
    } else {
      delete state.zenWorkspace;
    }
    tab = win.gBrowser.addTab("about:blank", options);
    lazy.SessionStore.setTabState(tab, JSON.stringify(state));
  } else {
    tab = win.gBrowser.addTab(record.url, options);
  }
  if (select) {
    win.gBrowser.selectedTab = tab;
  }
  return tab;
}

let waking = null;

// Several windows start up together; one pass at a time keeps a snoozed tab
// from coming back twice.
function wakeDueTabs() {
  waking ??= (async () => {
    const due = await dueSnoozes(Date.now());
    for (const record of due) {
      const tab = await restoreRecord(record.id, null, { select: false });
      if (tab) {
        showToast(tab.ownerGlobal, "peppermint-snooze-woke", {
          title: record.title,
        });
      }
    }
    await armWake();
  })().finally(() => {
    waking = null;
  });
  return waking;
}

async function armWake() {
  wakeTimer?.cancel();
  wakeTimer = null;
  const next = await nextWakeTime();
  if (next === null) {
    return;
  }
  const delay = Math.min(MAX_TIMER_DELAY_MS, Math.max(1000, next - Date.now()));
  wakeTimer = newTimer();
  wakeTimer.initWithCallback(
    () => wakeDueTabs().catch(error => console.error("Snooze failed", error)),
    delay,
    Ci.nsITimer.TYPE_ONE_SHOT
  );
}

function armSweep(delay) {
  sweepTimer?.cancel();
  sweepTimer = null;
  // Nothing gets older to anyone while nobody uses the browser; the sweep
  // runs again once someone is back.
  if (lazy.PeppermintActivity.inactive) {
    return;
  }
  sweepTimer = newTimer();
  sweepTimer.initWithCallback(
    () => {
      ChromeUtils.idleDispatch(async () => {
        try {
          await archiveIdleTabs();
        } catch (error) {
          console.error("Archiving idle tabs failed", error);
        }
        armSweep(SWEEP_INTERVAL_MS);
      });
    },
    delay,
    Ci.nsITimer.TYPE_ONE_SHOT
  );
}

const observer = {
  observe(subject, topic) {
    if (topic == "wake_notification") {
      wakeDueTabs().catch(error => console.error("Snooze failed", error));
    }
  },
};

/**
 * Start the timers once for the process, and bring back snoozed tabs that came
 * due while no window was open.
 */
export function initTabArchive() {
  if (!initialized) {
    initialized = true;
    Services.obs.addObserver(observer, "wake_notification");
    lazy.PeppermintActivity.addObserver({
      onInactive: () => {
        sweepTimer?.cancel();
        sweepTimer = null;
      },
      onActive: () => armSweep(FIRST_SWEEP_DELAY_MS),
    });
    armSweep(FIRST_SWEEP_DELAY_MS);
  }
  wakeDueTabs().catch(error => console.error("Snooze failed", error));
}

const MENU_ITEM_ID = "context_peppermintNeverArchive";

function contextHost(tab) {
  if (!tab || !/^https?:/.test(tabUrl(tab))) {
    return "";
  }
  try {
    return tab.linkedBrowser.currentURI.host.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Adds "Never archive this site" to the tab context menu of a window.
 *
 * @param {Window} win
 */
export function initArchiveMenu(win) {
  const menu = win.document.getElementById("tabContextMenu");
  if (!menu || isPrivate(win) || menu.querySelector(`#${MENU_ITEM_ID}`)) {
    return;
  }
  win.MozXULElement.insertFTLIfNeeded("browser/peppermint-tab-archive.ftl");
  const item = win.document.createXULElement("menuitem");
  item.id = MENU_ITEM_ID;
  item.setAttribute("type", "checkbox");
  item.setAttribute("data-l10n-id", "peppermint-tab-archive-never-site");
  item.hidden = true;
  item.addEventListener("command", () => {
    const host = item.dataset.host;
    setNeverArchived(host, item.hasAttribute("checked"));
  });
  menu.addEventListener("popupshowing", event => {
    if (event.target !== menu) {
      return;
    }
    const host =
      archiveHours() > 0 ? contextHost(win.TabContextMenu?.contextTab) : "";
    item.hidden = !host;
    if (!host) {
      return;
    }
    item.dataset.host = host;
    item.toggleAttribute(
      "checked",
      isNeverArchived(win.TabContextMenu.contextTab)
    );
  });
  const anchor = menu.querySelector("#context_closeTab");
  if (anchor) {
    anchor.before(item);
  } else {
    menu.appendChild(item);
  }
}
