/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  discardTab,
  isTabHostListed,
  isTabWorkingInBackground,
  isUnloadSafe,
  parseHostList,
} from "moz-src:///peppermint/common/PeppermintTabs.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  bumpReport: "moz-src:///peppermint/report/PeppermintReportStore.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
});

const PREF = "zen.tab-unloader.timeout-minutes";
// Shared with Underpowered: sites on this list are never unloaded or frozen.
const NEVER_PREF = "zen.underpowered.never-freeze";
// Tabs that fall due close together are unloaded in one pass.
const MIN_DELAY_MS = 60 * 1000;

/**
 * Unloads background tabs that have been idle longer than
 * zen.tab-unloader.timeout-minutes. One timer for the whole process, armed
 * for the next tab that falls due. It keeps running while the browser is in
 * the background, when freeing memory helps the other apps most.
 * Pinned tabs, essentials, the selected tab, its split-view partners, Glance
 * overlays, tabs playing sound or sharing a camera, microphone or screen,
 * sites on the never-freeze list, and tabs that would prompt (beforeunload)
 * stay loaded. 0 disables it.
 */
class ZenTabUnloaderImpl {
  #started = false;
  #timer = null;
  #neverUnload = [];

  start() {
    if (this.#started) {
      return;
    }
    this.#started = true;
    Services.prefs.addObserver(PREF, this);
    Services.prefs.addObserver(NEVER_PREF, this);
    this.#readNeverUnload();
    this.#arm();
  }

  observe(subject, topic, data) {
    if (data === NEVER_PREF) {
      this.#readNeverUnload();
    }
    this.#arm();
  }

  get #timeoutMs() {
    return Math.max(0, Services.prefs.getIntPref(PREF, 10)) * 60 * 1000;
  }

  /** @returns {boolean} Whether a pass is scheduled; tests read it. */
  get armed() {
    return !!this.#timer;
  }

  #readNeverUnload() {
    this.#neverUnload = parseHostList(
      Services.prefs.getStringPref(NEVER_PREF, "")
    );
  }

  #cancel() {
    if (this.#timer) {
      this.#timer.cancel();
      this.#timer = null;
    }
  }

  #arm() {
    this.#cancel();
    if (this.#timeoutMs <= 0) {
      return;
    }
    this.#timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    this.#timer.initWithCallback(
      () => {
        this.#timer = null;
        ChromeUtils.idleDispatch(() => {
          this.unloadIdleTabs()
            .catch(error => console.error("ZenTabUnloader failed", error))
            .finally(() => this.#arm());
        });
      },
      this.nextDelay(),
      Ci.nsITimer.TYPE_ONE_SHOT
    );
  }

  /**
   * With no candidate the next pass is one timeout away: any tab that turns
   * idle from now on falls due no earlier than that.
   *
   * @param {number} [now]
   * @returns {number} Milliseconds until the next tab falls due, at least a
   *   minute and at most one timeout
   */
  nextDelay(now = Date.now()) {
    const timeout = this.#timeoutMs;
    let earliest = Infinity;
    for (const { tab } of this.#candidates()) {
      earliest = Math.min(earliest, tab.lastAccessed + timeout);
    }
    const delay = Number.isFinite(earliest) ? earliest - now : timeout;
    return Math.min(timeout, Math.max(MIN_DELAY_MS, delay));
  }

  #shouldKeep(tab, selected) {
    // isUnloadSafe covers prompts, media playback in a PiP window, split
    // partners and the selected glance. Policy on top of that stays here.
    return (
      !isUnloadSafe(tab, selected) ||
      tab.pinned ||
      tab.hasAttribute("zen-essential") ||
      isTabWorkingInBackground(tab) ||
      isTabHostListed(this.#neverUnload, tab)
    );
  }

  *#candidates() {
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      if (win.closed || !win.gBrowser) {
        continue;
      }
      const selected = win.gBrowser.selectedTab;
      for (const tab of win.gBrowser.tabs) {
        if (tab.lastAccessed && !this.#shouldKeep(tab, selected)) {
          yield { win, tab };
        }
      }
    }
  }

  /**
   * Unload idle tabs now. The timer calls this; tests call it directly.
   *
   * @returns {Promise<number>} How many tabs were unloaded
   */
  async unloadIdleTabs() {
    const timeout = this.#timeoutMs;
    if (timeout <= 0) {
      return 0;
    }
    const cutoff = Date.now() - timeout;
    const stale = [...this.#candidates()].filter(
      ({ tab }) => tab.lastAccessed <= cutoff
    );
    const results = await Promise.all(
      stale.map(({ win, tab }) =>
        discardTab(
          win,
          tab,
          () => !this.#shouldKeep(tab, win.gBrowser.selectedTab),
          { renderDiscarded: true, skipOnClose: true }
        )
          .then(unloaded => ({ win, unloaded }))
          .catch(error => {
            console.error("ZenTabUnloader could not unload a tab", error);
            return { win, unloaded: false };
          })
      )
    );
    const unloaded = results.filter(result => result.unloaded);
    const counted = unloaded.filter(
      ({ win }) => !lazy.PrivateBrowsingUtils.isWindowPrivate(win)
    ).length;
    if (counted) {
      lazy.bumpReport("unloaded", counted);
    }
    return unloaded.length;
  }
}

export const ZenTabUnloader = new ZenTabUnloaderImpl();
