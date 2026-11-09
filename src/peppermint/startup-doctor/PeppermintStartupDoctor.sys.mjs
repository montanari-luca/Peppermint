/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Times every launch so about:report can say what makes startup slow and
 * offer a fix. Each launch keeps how long the first window took to appear and
 * the session to come back, and how long each Peppermint feature took to
 * start in that window. The last LAUNCHES launches live in
 * `<profile>/peppermint-startup.json`: numbers and feature names only.
 *
 * Extensions and Zen mods are read when the report opens, not stored.
 */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
  FEATURES: "moz-src:///peppermint/features/PeppermintFeatures.sys.mjs",
});
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "enabled",
  "peppermint.startup-doctor.enabled",
  true
);

const FILE_NAME = "peppermint-startup.json";
const FILE_VERSION = 1;
export const LAUNCHES = 10;
const SLOWEST = 5;
// A feature that takes this long to start, typically, is worth a mention.
export const SLOW_FEATURE_MS = 20;
// Mods add their CSS to every window; past this much they slow it down.
export const HEAVY_MODS_BYTES = 200 * 1024;
// Past this many, extensions are a likely reason for a slow start.
export const MANY_EXTENSIONS = 10;
const RESTORED_TOPIC = "sessionstore-windows-restored";

let gPathOverride = null;
let gLaunchesPromise = null;
let gWriteQueue = Promise.resolve();

function filePath() {
  return gPathOverride ?? PathUtils.join(PathUtils.profileDir, FILE_NAME);
}

function cleanLaunch(raw) {
  if (!raw || !Number.isFinite(raw.when)) {
    return null;
  }
  const number = value =>
    Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  const features = {};
  for (const [name, ms] of Object.entries(raw.features ?? {})) {
    if (typeof name == "string" && number(ms) != null) {
      features[name] = number(ms);
    }
  }
  return {
    when: raw.when,
    firstPaintMs: number(raw.firstPaintMs),
    restoredMs: number(raw.restoredMs),
    peppermintMs: number(raw.peppermintMs) ?? 0,
    features,
  };
}

function load() {
  gLaunchesPromise ??= (async () => {
    try {
      const data = await IOUtils.readJSON(filePath());
      if (data?.version === FILE_VERSION && Array.isArray(data.launches)) {
        return data.launches.map(cleanLaunch).filter(Boolean).slice(-LAUNCHES);
      }
    } catch (error) {
      if (error?.name !== "NotFoundError") {
        console.error("The startup times could not be read", error);
      }
    }
    return [];
  })();
  return gLaunchesPromise;
}

async function save(launches) {
  const path = filePath();
  const data = { version: FILE_VERSION, launches };
  const run = gWriteQueue.then(() =>
    IOUtils.writeJSON(path, data, { tmpPath: `${path}.tmp` })
  );
  gWriteQueue = run.catch(() => {});
  return run;
}

/**
 * @param {number[]} values
 * @returns {number|null} The middle value, null for none
 */
export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) {
    return null;
  }
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/**
 * @returns {{firstPaintMs: number|null, restoredMs: number|null}} How long
 *   after the process started the first window was painted and the session
 *   restored
 */
function milestones() {
  const info = Services.startup.getStartupInfo();
  const since = milestone =>
    info.process && info[milestone]
      ? info[milestone].getTime() - info.process.getTime()
      : null;
  return {
    firstPaintMs: since("firstPaint2") ?? since("firstPaint"),
    restoredMs: since("sessionRestored"),
  };
}

class StartupDoctor {
  // Feature start times in the first window of this launch.
  #features = {};
  #recording = true;

  /**
   * Runs `run`, timing it while the first window starts.
   *
   * @param {string} name - The feature, as PeppermintStartup names it
   * @param {Function} run
   */
  measure(name, run) {
    if (!this.#recording) {
      run();
      return;
    }
    const start = ChromeUtils.now();
    try {
      run();
    } finally {
      this.#features[name] =
        (this.#features[name] ?? 0) + ChromeUtils.now() - start;
    }
  }

  /**
   * Called once the first window has started every feature. Records the
   * launch when the session is back and the browser is idle.
   */
  firstWindowReady() {
    if (!this.#recording) {
      return;
    }
    this.#recording = false;
    if (!lazy.enabled) {
      return;
    }
    // A copy, so the doctor's own start is left out.
    const features = { ...this.#features };
    const record = () =>
      ChromeUtils.idleDispatch(() =>
        this.recordLaunch({ features, ...milestones() }).catch(error =>
          console.error("The startup could not be recorded", error)
        )
      );
    if (Services.startup.getStartupInfo().sessionRestored) {
      record();
      return;
    }
    const observer = () => {
      Services.obs.removeObserver(observer, RESTORED_TOPIC);
      record();
    };
    Services.obs.addObserver(observer, RESTORED_TOPIC);
  }

  /**
   * Adds a launch to the stored list, keeping the last LAUNCHES.
   *
   * @param {object} launch - `{ features, firstPaintMs, restoredMs }`
   * @param {number} [launch.when] - Milliseconds since 1970, now by default
   */
  async recordLaunch({ when = Date.now(), ...rest }) {
    const launch = cleanLaunch({ ...rest, when });
    launch.peppermintMs = Object.values(launch.features).reduce(
      (sum, ms) => sum + ms,
      0
    );
    const launches = await load();
    launches.push(launch);
    launches.splice(0, launches.length - LAUNCHES);
    await save(launches);
  }

  /** @returns {Promise<object[]>} The stored launches, oldest first */
  launches() {
    return load();
  }
}

export const PeppermintStartupDoctor = new StartupDoctor();

async function extensions() {
  try {
    const addons = await lazy.AddonManager.getAddonsByTypes(["extension"]);
    return addons
      .filter(addon => addon.isActive && !addon.isBuiltin && !addon.isSystem)
      .map(addon => ({ id: addon.id, name: addon.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error("The extensions could not be listed", error);
    return [];
  }
}

/**
 * @returns {Promise<{id: string, name: string, bytes: number}[]>} The enabled
 *   Zen mods, heaviest first, with the size of their CSS
 */
async function mods() {
  if (Services.prefs.getBoolPref("zen.themes.disable-all", false)) {
    return [];
  }
  const root = PathUtils.join(PathUtils.profileDir, "chrome", "zen-themes");
  let data = {};
  try {
    data = await IOUtils.readJSON(
      PathUtils.join(PathUtils.profileDir, "zen-themes.json")
    );
  } catch {
    return [];
  }
  const enabled = Object.values(data ?? {}).filter(
    mod => mod?.id && mod.enabled !== false
  );
  const sized = await Promise.all(
    enabled.map(async mod => {
      let bytes = 0;
      try {
        bytes = (await IOUtils.stat(PathUtils.join(root, mod.id, "chrome.css")))
          .size;
      } catch {
        // A mod without a stylesheet costs nothing at startup.
      }
      return { id: mod.id, name: mod.name || mod.id, bytes };
    })
  );
  return sized.sort((a, b) => b.bytes - a.bytes);
}

function featureFor(name) {
  return lazy.FEATURES.find(feature => feature.startup == name) ?? null;
}

/**
 * Everything the Startup section of about:report shows.
 *
 * @returns {Promise<object>} `{ enabled, launches, lastMs, typicalMs,
 *   restoredMs, slowest, extensions, mods, modBytes, tips }`. Times are in
 *   milliseconds. `slowest` lists the Peppermint features that typically
 *   take longest to start (`{ name, ms, feature }`), and `tips` the likely
 *   causes of a slow start, each with what fixes it.
 */
export async function collectStartup() {
  const [launches, extensionList, modList] = await Promise.all([
    load(),
    extensions(),
    mods(),
  ]);
  // Only features the user knows by name are listed; the rest still count in
  // the total.
  const names = new Set(
    launches.flatMap(launch => Object.keys(launch.features))
  );
  const slowest = [...names]
    .map(name => ({
      name,
      ms: median(launches.map(launch => launch.features[name])),
      feature: featureFor(name),
    }))
    .filter(item => item.feature)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, SLOWEST);
  const modBytes = modList.reduce((sum, mod) => sum + mod.bytes, 0);

  const tips = [];
  if (extensionList.length >= MANY_EXTENSIONS) {
    tips.push({ id: "extensions", count: extensionList.length });
  }
  if (modBytes >= HEAVY_MODS_BYTES) {
    tips.push({ id: "mods", bytes: modBytes });
  }
  if (!Services.prefs.getBoolPref("browser.sessionstore.restore_on_demand")) {
    tips.push({ id: "restore-on-demand" });
  }
  for (const item of slowest) {
    const { pref } = item.feature;
    if (
      item.ms >= SLOW_FEATURE_MS &&
      pref &&
      Services.prefs.getBoolPref(pref, false)
    ) {
      tips.push({ id: "feature", feature: item.feature, ms: item.ms });
    }
  }

  return {
    enabled: lazy.enabled,
    launches: launches.length,
    lastMs: launches.at(-1)?.firstPaintMs ?? null,
    typicalMs: median(launches.map(launch => launch.firstPaintMs)),
    restoredMs: median(launches.map(launch => launch.restoredMs)),
    peppermintMs: median(launches.map(launch => launch.peppermintMs)),
    slowest,
    extensions: extensionList,
    mods: modList,
    modBytes,
    tips,
  };
}

/**
 * Turn off a Zen mod, as its switch in Settings does.
 *
 * @param {string} id
 */
export async function disableMod(id) {
  const window = Services.wm.getMostRecentWindow("navigator:browser");
  await window.gZenMods.disableMod(id);
  window.gZenMods.triggerModsUpdate();
}

/**
 * Test hook: keep launches in another file, and read it again.
 *
 * @param {string|null} path - null for the profile's file
 */
export function setStorePathForTests(path) {
  gPathOverride = path;
  gLaunchesPromise = null;
  gWriteQueue = Promise.resolve();
}
