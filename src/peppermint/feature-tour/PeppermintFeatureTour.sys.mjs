/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Points people at the Peppermint features pane with one toast:
 *
 *   discover  after Zen's welcome, on a new profile: how many features
 *             Peppermint adds
 *   new       after an update that adds features (a higher GENERATION in
 *             PeppermintFeatures): how many are new; the pane marks them
 *             "New" until it is opened
 *
 * Each toast shows once, a few seconds after the first window has settled.
 */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  FEATURES: "moz-src:///peppermint/features/PeppermintFeatures.sys.mjs",
  GENERATION: "moz-src:///peppermint/features/PeppermintFeatures.sys.mjs",
  newFeatures: "moz-src:///peppermint/features/PeppermintFeatures.sys.mjs",
});
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "enabled",
  "peppermint.features.tour.enabled",
  true
);

export const PREFS = {
  seen: "peppermint.features.seen",
  announced: "peppermint.features.announced",
};
const WELCOME_PREF = "zen.welcome-screen.seen";
const WELCOME_ATTRIBUTE = "zen-welcome-stage";
const FTL = "browser/peppermint-feature-tour.ftl";
const BUTTON_ID = "peppermint-feature-tour-button";
export const PANE = "paneZenPeppermint";
// Time for the window to settle after startup or the welcome.
const SHOW_DELAY_MS = 3000;
const TOAST_TIMEOUT_MS = 10000;

function findToast(window, messageId) {
  const container = window.document.getElementById("zen-toast-container");
  return [...(container?.children ?? [])].find(
    toast => toast._messageId == messageId
  );
}

function delayedStartup(window) {
  if (window.gBrowserInit?.delayedStartupFinished) {
    return Promise.resolve();
  }
  return new Promise(resolve => {
    const topic = "browser-delayed-startup-finished";
    const observer = subject => {
      if (subject == window) {
        Services.obs.removeObserver(observer, topic);
        resolve();
      }
    };
    Services.obs.addObserver(observer, topic);
  });
}

// Zen marks the window while its welcome runs and removes the mark at the
// end; the welcome starts a little after the first window, so this also
// waits for one to begin on a new profile.
function welcomeDone(window, newProfile) {
  const root = window.document.documentElement;
  return new Promise(resolve => {
    let started = root.hasAttribute(WELCOME_ATTRIBUTE);
    if (!newProfile && !started) {
      resolve();
      return;
    }
    const observer = new window.MutationObserver(() => {
      if (root.hasAttribute(WELCOME_ATTRIBUTE)) {
        started = true;
      } else if (started) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(root, {
      attributes: true,
      attributeFilter: [WELCOME_ATTRIBUTE],
    });
  });
}

class FeatureTour {
  #started = false;

  /** @param {Window} window - The first browser window */
  init(window) {
    if (this.#started || Cu.isInAutomation) {
      return;
    }
    this.#started = true;
    // Read before Zen's welcome runs, which marks the profile as welcomed.
    const newProfile = !Services.prefs.getBoolPref(WELCOME_PREF, false);
    (async () => {
      await delayedStartup(window);
      await welcomeDone(window, newProfile);
      await new Promise(resolve => window.setTimeout(resolve, SHOW_DELAY_MS));
      if (!window.closed) {
        await this.maybeShow(window, { newProfile });
      }
    })().catch(error => console.error("The feature tour failed", error));
  }

  /**
   * @param {{newProfile: boolean}} options
   * @returns {{kind: string, count: number}|null} The toast due, if any
   */
  pending({ newProfile }) {
    if (!lazy.enabled) {
      return null;
    }
    if (newProfile) {
      return { kind: "discover", count: lazy.FEATURES.length };
    }
    const announced = Services.prefs.getIntPref(PREFS.announced, 1);
    if (announced >= lazy.GENERATION) {
      return null;
    }
    const seen = Services.prefs.getIntPref(PREFS.seen, 1);
    const count = lazy.newFeatures(Math.max(seen, announced)).length;
    return count ? { kind: "new", count } : null;
  }

  /**
   * Shows the toast that is due and remembers that it was shown.
   *
   * @param {Window} window - A browser window
   * @param {{newProfile: boolean}} options
   * @returns {Promise<object|null>} What was shown
   */
  async maybeShow(window, { newProfile = false } = {}) {
    const toast = this.pending({ newProfile });
    if (!toast) {
      return null;
    }
    Services.prefs.setIntPref(PREFS.announced, lazy.GENERATION);
    if (toast.kind == "discover") {
      // Everything is new on a new profile, so nothing is marked "New".
      Services.prefs.setIntPref(PREFS.seen, lazy.GENERATION);
    }
    await this.show(window, toast);
    return toast;
  }

  /**
   * @param {Window} window - A browser window
   * @param {{kind: string, count: number}} toast
   */
  async show(window, { kind, count }) {
    window.MozXULElement.insertFTLIfNeeded(FTL);
    const messageId = `peppermint-feature-tour-${kind}`;
    const shown = window.gZenUIManager.showToast(messageId, {
      l10nArgs: { count },
      timeout: TOAST_TIMEOUT_MS,
      button: { id: BUTTON_ID, command: () => this.open(window, messageId) },
    });
    // Zen's toast button is an icon unless given a label.
    const element = findToast(window, messageId);
    const button = element?.querySelector(`#${BUTTON_ID}`);
    if (button) {
      window.document.l10n.setAttributes(button, BUTTON_ID);
      window.document.l10n.translateElements([button]);
    }
    await shown;
  }

  /**
   * Opens the features pane and closes the toast.
   *
   * @param {Window} window - A browser window
   * @param {string} [messageId] - The toast to close
   */
  open(window, messageId) {
    const toast = messageId && findToast(window, messageId);
    if (toast) {
      const container = toast.parentElement;
      toast.remove();
      if (!container.children.length) {
        container.setAttribute("hidden", "true");
      }
    }
    window.openPreferences(PANE);
  }
}

export const PeppermintFeatureTour = new FeatureTour();

/**
 * Called when the features pane is shown: the features it marks "New" now
 * count as seen.
 */
export function markFeaturesSeen() {
  Services.prefs.setIntPref(PREFS.seen, lazy.GENERATION);
}
