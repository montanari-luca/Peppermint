// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Single entry point for everything Peppermint starts alongside Zen. Zen's
 * ZenStartup calls early() before the layout is built and late() after it, so
 * adding or removing a Peppermint feature never touches Zen's own files.
 *
 * late() starts each feature in one of three phases, so the first frame only
 * waits for what it shows:
 * - paint: before the first frame, for what the first frame or the first page
 *   load needs;
 * - delayed: once the window's delayed startup is done (toolbar hooks,
 *   address bar providers, panels);
 * - idle: when the main thread is next idle, for background work.
 * A feature with `when` is not even imported until it returns true; a change
 * to one of its `prefs` asks again in every open window.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PeppermintStartupDoctor:
    "moz-src:///peppermint/startup-doctor/PeppermintStartupDoctor.sys.mjs",
});

export const PAINT = "paint";
export const DELAYED = "delayed";
export const IDLE = "idle";
// Idle work still runs this long after delayed startup on a busy machine.
const IDLE_TIMEOUT_MS = 5000;

const SIDEBAR_STYLE_URL =
  "chrome://browser/content/zen-styles/peppermint-sidebar.css";

const IDLE_STYLE_URL =
  "chrome://browser/content/zen-styles/peppermint-idle.css";

const FOLDER_ICON_STYLE_URL =
  "chrome://browser/content/zen-styles/peppermint-folder-icon.css";

function loadStyle(window, href) {
  const doc = window.document;
  if (doc.querySelector(`link[href="${href}"]`)) {
    return;
  }
  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  (doc.querySelector("linkset") || doc.documentElement).appendChild(link);
}

function load(url) {
  return ChromeUtils.importESModule(url);
}

function boolPref(prefName, fallback = false) {
  return Services.prefs.getBoolPref(prefName, fallback);
}

const FEATURES = [
  // paint
  {
    name: "PeppermintActivity",
    phase: PAINT,
    run: win =>
      load(
        "moz-src:///peppermint/common/PeppermintActivity.sys.mjs"
      ).PeppermintActivity.init(win),
  },
  {
    name: "Peppermint sidebar styles",
    phase: PAINT,
    run: win => loadStyle(win, SIDEBAR_STYLE_URL),
  },
  {
    name: "Peppermint folder icon",
    phase: PAINT,
    run: win => loadStyle(win, FOLDER_ICON_STYLE_URL),
  },
  {
    name: "Peppermint idle styles",
    phase: PAINT,
    run: win => loadStyle(win, IDLE_STYLE_URL),
  },
  // A restored mint:// tab loads before delayed startup.
  {
    name: "Notepad watcher",
    phase: PAINT,
    run: win =>
      load("resource:///actors/ZenNotepadParent.sys.mjs").watchMintDocuments(
        win
      ),
  },
  // The first pages ask it whether to handle their banners.
  {
    name: "ZenCookieConsent",
    phase: PAINT,
    run: () =>
      load(
        "resource:///modules/zen/cookieconsent/ZenCookieConsentManager.sys.mjs"
      ).gZenCookieConsent.init(),
  },
  // An external link can open together with the first window.
  {
    name: "PeppermintLookalike",
    phase: PAINT,
    run: win =>
      load(
        "moz-src:///peppermint/lookalike/PeppermintLookalike.sys.mjs"
      ).PeppermintLookalike.init(win),
  },
  // Its toolbar button and the frozen-tab state are part of the first frame.
  {
    name: "ZenUnderpowered",
    phase: PAINT,
    run: () =>
      load(
        "moz-src:///peppermint/underpowered/ZenUnderpowered.sys.mjs"
      ).ZenUnderpowered.init(),
  },
  {
    name: "PeppermintGhostMode",
    phase: PAINT,
    run: () =>
      load(
        "moz-src:///peppermint/ghost-mode/PeppermintGhostMode.sys.mjs"
      ).PeppermintGhostMode.init(),
  },
  {
    name: "PeppermintTabNumbers",
    phase: PAINT,
    run: win =>
      load(
        "moz-src:///peppermint/tab-numbers/PeppermintTabNumbers.sys.mjs"
      ).PeppermintTabNumbers.init(win),
  },
  // Restored tabs keep their islands.
  {
    name: "PeppermintTabIslands",
    phase: PAINT,
    run: win =>
      load(
        "moz-src:///peppermint/tab-islands/PeppermintTabIslands.sys.mjs"
      ).PeppermintTabIslands.init(win),
  },

  // delayed
  {
    name: "Peppermint actions",
    phase: DELAYED,
    run: () =>
      load(
        "moz-src:///peppermint/common/PeppermintActions.sys.mjs"
      ).registerPeppermintActions(),
  },
  {
    name: "Popular sites suggestions",
    phase: DELAYED,
    run: () =>
      load(
        "moz-src:///peppermint/urlbar/PeppermintUrlbarProviderPopularSites.sys.mjs"
      ).registerPopularSitesProvider(),
  },
  {
    name: "Tab search",
    phase: DELAYED,
    run: () =>
      load(
        "moz-src:///peppermint/urlbar/PeppermintUrlbarProviderTabSearch.sys.mjs"
      ).registerTabSearchProvider(),
  },
  {
    name: "Omni utils",
    phase: DELAYED,
    run: () =>
      load(
        "moz-src:///peppermint/omni-utils/PeppermintUrlbarProviderOmniUtils.sys.mjs"
      ).registerOmniUtilsProvider(),
  },
  {
    name: "Tab archive search",
    phase: DELAYED,
    run: () =>
      load(
        "moz-src:///peppermint/tab-archive/PeppermintUrlbarProviderArchive.sys.mjs"
      ).registerArchiveProvider(),
  },
  {
    name: "PeppermintReader",
    phase: DELAYED,
    run: win =>
      load(
        "moz-src:///peppermint/reader/PeppermintReader.sys.mjs"
      ).PeppermintReader.init(win),
  },
  {
    name: "PeppermintScreenshotEditor",
    phase: DELAYED,
    prefs: ["peppermint.screenshot.editor.enabled"],
    when: () => boolPref("peppermint.screenshot.editor.enabled", true),
    run: () =>
      load(
        "moz-src:///peppermint/screenshot-editor/PeppermintScreenshotEditor.sys.mjs"
      ).initScreenshotEditor(),
  },
  {
    name: "PeppermintUndoClose",
    phase: DELAYED,
    run: win =>
      load(
        "moz-src:///peppermint/undo-close/PeppermintUndoClose.sys.mjs"
      ).PeppermintUndoClose.init(win),
  },
  {
    name: "PeppermintShortcutSheet",
    phase: DELAYED,
    run: win =>
      load(
        "moz-src:///peppermint/shortcut-sheet/PeppermintShortcutSheet.sys.mjs"
      ).PeppermintShortcutSheet.init(win),
  },
  {
    name: "PeppermintShortcutTooltips",
    phase: DELAYED,
    run: win =>
      load(
        "moz-src:///peppermint/shortcut-tooltips/PeppermintShortcutTooltips.sys.mjs"
      ).PeppermintShortcutTooltips.init(win),
  },
  {
    name: "PeppermintUpdater",
    phase: DELAYED,
    run: () =>
      load(
        "moz-src:///peppermint/updater/PeppermintUpdaterUI.sys.mjs"
      ).PeppermintUpdaterUI.init(),
  },
  {
    name: "PeppermintVault",
    phase: DELAYED,
    prefs: ["peppermint.vault.enabled"],
    when: () => boolPref("peppermint.vault.enabled"),
    run: win =>
      load(
        "moz-src:///peppermint/vault/PeppermintVault.sys.mjs"
      ).PeppermintVault.init(win),
  },
  {
    name: "Share to file",
    phase: DELAYED,
    run: win =>
      load(
        "moz-src:///peppermint/share-file/PeppermintShareFile.sys.mjs"
      ).PeppermintShareFile.initWindow(win),
  },
  {
    name: "Tab archive menu",
    phase: DELAYED,
    run: win =>
      load(
        "moz-src:///peppermint/tab-archive/PeppermintTabArchive.sys.mjs"
      ).initArchiveMenu(win),
  },
  {
    name: "PeppermintSitePrivacy",
    phase: DELAYED,
    run: win =>
      load(
        "moz-src:///peppermint/site-privacy/PeppermintSitePrivacy.sys.mjs"
      ).PeppermintSitePrivacy.init(win),
  },
  {
    name: "PeppermintSyncOverride",
    phase: DELAYED,
    run: win =>
      load(
        "moz-src:///peppermint/sync-override/PeppermintSyncOverride.sys.mjs"
      ).PeppermintSyncOverride.initWindow(win),
  },
  {
    name: "PeppermintFeatureTour",
    phase: DELAYED,
    run: win =>
      load(
        "moz-src:///peppermint/feature-tour/PeppermintFeatureTour.sys.mjs"
      ).PeppermintFeatureTour.init(win),
  },

  // idle
  {
    name: "Live folders idle",
    phase: IDLE,
    run: () =>
      load(
        "moz-src:///peppermint/common/PeppermintLiveFoldersIdle.sys.mjs"
      ).pauseLiveFoldersWhenInactive(),
  },
  {
    name: "PeppermintTabArchive",
    phase: IDLE,
    run: () =>
      load(
        "moz-src:///peppermint/tab-archive/PeppermintTabArchive.sys.mjs"
      ).initTabArchive(),
  },
  // Runs while on, and once while off to ask whether to turn it on.
  {
    name: "PeppermintJanitor",
    phase: IDLE,
    prefs: ["peppermint.janitor.enabled"],
    when: () =>
      boolPref("peppermint.janitor.enabled") ||
      !boolPref("peppermint.janitor.prompted"),
    run: win =>
      load(
        "moz-src:///peppermint/janitor/PeppermintJanitor.sys.mjs"
      ).PeppermintJanitor.init(win),
  },
  // Ready before the first link anyone types or clicks, built in slices.
  {
    name: "Lookalike index",
    phase: IDLE,
    when: () => boolPref("peppermint.lookalike.enabled", true),
    run: () => {
      load("moz-src:///peppermint/lookalike/PeppermintLookalikeDomains.sys.mjs")
        .prepareLookalikeIndex()
        .catch(error =>
          console.error("The lookalike index could not be built", error)
        );
    },
  },
  {
    name: "PeppermintPermissionAutoRevoke",
    phase: IDLE,
    run: () =>
      load(
        "moz-src:///peppermint/vault/PeppermintPermissionAutoRevoke.sys.mjs"
      ).PeppermintPermissionAutoRevoke.start(),
  },
];

// Each feature starts independently: one failing never blocks the others.
// The startup doctor times each one in the first window (see about:report).
function start(feature, win) {
  try {
    lazy.PeppermintStartupDoctor.measure(
      feature.name,
      () => feature.run(win),
      feature.phase
    );
  } catch (error) {
    console.error(`${feature.name} failed to start`, error);
  }
}

// Windows whose phase has run, so a pref change starts a gated feature
// only where its phase has come.
const reached = {
  [PAINT]: new WeakSet(),
  [DELAYED]: new WeakSet(),
  [IDLE]: new WeakSet(),
};
// Gated features already started, per window.
const gatedStarted = new WeakMap();
let prefsObserved = false;

function allowed(feature, win) {
  if (!feature.when) {
    return true;
  }
  try {
    return !!feature.when(win);
  } catch (error) {
    console.error(`${feature.name} could not check whether to start`, error);
    return false;
  }
}

function runPhase(win, phase) {
  if (win.closed || reached[phase].has(win)) {
    return;
  }
  reached[phase].add(win);
  for (const feature of FEATURES) {
    if (feature.phase !== phase || !allowed(feature, win)) {
      continue;
    }
    if (feature.when) {
      let started = gatedStarted.get(win);
      if (!started) {
        started = new Set();
        gatedStarted.set(win, started);
      }
      started.add(feature.name);
    }
    start(feature, win);
  }
}

function startGatedNow(prefName) {
  for (const feature of FEATURES) {
    if (!feature.prefs?.includes(prefName)) {
      continue;
    }
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      if (
        win.closed ||
        !reached[feature.phase].has(win) ||
        gatedStarted.get(win)?.has(feature.name) ||
        !allowed(feature, win)
      ) {
        continue;
      }
      let started = gatedStarted.get(win);
      if (!started) {
        started = new Set();
        gatedStarted.set(win, started);
      }
      started.add(feature.name);
      start(feature, win);
    }
  }
}

function observeGatePrefs() {
  if (prefsObserved) {
    return;
  }
  prefsObserved = true;
  const observer = (_subject, _topic, prefName) => startGatedNow(prefName);
  for (const prefName of new Set(
    FEATURES.flatMap(feature => feature.prefs ?? [])
  )) {
    Services.prefs.addObserver(prefName, observer);
  }
}

let firstWindowDone = false;

export const PeppermintStartup = {
  early() {
    start(
      {
        name: "ZenTabUnloader",
        phase: PAINT,
        run: () =>
          load(
            "resource:///modules/zen/ZenTabUnloader.sys.mjs"
          ).ZenTabUnloader.start(),
      },
      null
    );
    start(
      {
        name: "PeppermintCleanLinks",
        phase: PAINT,
        run: () =>
          load(
            "moz-src:///peppermint/clean-links/PeppermintCleanLinks.sys.mjs"
          ).PeppermintCleanLinks.start(),
      },
      null
    );
  },

  late(window) {
    observeGatePrefs();
    runPhase(window, PAINT);
    window.delayedStartupPromise.then(() => {
      runPhase(window, DELAYED);
      ChromeUtils.idleDispatch(
        () => {
          runPhase(window, IDLE);
          if (!firstWindowDone) {
            firstWindowDone = true;
            lazy.PeppermintStartupDoctor.firstWindowReady();
          }
        },
        { timeout: IDLE_TIMEOUT_MS }
      );
    });
  },
};
