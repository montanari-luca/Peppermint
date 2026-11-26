/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const PREF_MODE = "zen.homepage.mode";
const PREF_URL = "zen.homepage.url";
// Where today's active time used to be kept. The report store counts it
// now, written once a minute instead of on every window switch.
const OLD_ACTIVE_PREFS = [
  "zen.homepage.daily-active-ms",
  "zen.homepage.daily-active-day",
];

const CARD_PREFS = {
  "time-spent": "zen.homepage.cards.time-spent",
  "top-site": "zen.homepage.cards.top-site",
  "network-speed": "zen.homepage.cards.network-speed",
  downloads: "zen.homepage.cards.downloads",
  "visited-sites": "zen.homepage.cards.visited-sites",
  version: "zen.homepage.cards.version",
  report: "zen.homepage.cards.report",
  clock: "zen.homepage.cards.clock",
};

const MODES = new Set(["builtin", "blank", "custom"]);

let lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  bumpReport: "moz-src:///peppermint/report/PeppermintReportStore.sys.mjs",
  dayKey: "moz-src:///peppermint/report/PeppermintReportStore.sys.mjs",
  sumReport: "moz-src:///peppermint/report/PeppermintReportStore.sys.mjs",
  collectReport: "moz-src:///peppermint/report/PeppermintReport.sys.mjs",
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  Downloads: "resource://gre/modules/Downloads.sys.mjs",
});

const HISTORY_TTL_MS = 2 * 60 * 1000;

let trackingStarted = false;
let lastTick = 0;
let pendingMs = 0;
// Today's time as the report store had it when last read, and time handed to
// the store that it has not counted yet.
let storedDay = "";
let storedMs = 0;
let storedRead = null;
let handedMs = 0;
let statsInflight = null;
let historyCache = null;
let historyInflight = null;
let historyEpoch = 0;
let historyObserved = false;
let historyQueries = 0;

function readStoredToday() {
  const day = lazy.dayKey();
  if (day === storedDay && storedRead) {
    return storedRead;
  }
  storedDay = day;
  storedMs = 0;
  const read = lazy.sumReport(day, day).then(
    total => {
      if (storedDay === day) {
        storedMs = total.activeMs;
      }
    },
    error => console.error("Zen homepage could not read active time", error)
  );
  storedRead = read;
  return read;
}

function flushActiveTime() {
  if (!pendingMs) {
    return;
  }
  const amount = pendingMs;
  pendingMs = 0;
  handedMs += amount;
  const day = lazy.dayKey();
  lazy
    .bumpReport("activeMs", amount)
    .then(() => lazy.sumReport(day, day))
    .then(total => {
      if (storedDay === day) {
        storedMs = total.activeMs;
      }
    })
    .catch(error =>
      console.error("Zen homepage could not count active time", error)
    )
    .finally(() => {
      handedMs -= amount;
    });
}

function pauseActiveTime() {
  if (!lastTick) {
    return;
  }
  const elapsed = Date.now() - lastTick;
  lastTick = 0;
  if (elapsed > 0 && elapsed < 12 * 60 * 60 * 1000) {
    pendingMs += elapsed;
  }
  flushActiveTime();
}

function resumeActiveTime() {
  if (!lastTick && anyWindowFocused()) {
    lastTick = Date.now();
  }
}

function anyWindowFocused() {
  for (const win of Services.wm.getEnumerator("navigator:browser")) {
    if (!win.closed && win.document.hasFocus()) {
      return true;
    }
  }
  return false;
}

/**
 * Count focused browser time for the current local day. Focus, blur, and
 * sleep notifications replace the old one-second poll.
 */
export function startActiveTimeTracking() {
  if (trackingStarted) {
    return;
  }
  trackingStarted = true;
  for (const pref of OLD_ACTIVE_PREFS) {
    Services.prefs.clearUserPref(pref);
  }
  readStoredToday();
  const onFocus = () => resumeActiveTime();
  const onBlur = () => {
    Services.tm.dispatchToMainThread(() => {
      if (!anyWindowFocused()) {
        pauseActiveTime();
      }
    });
  };
  const watched = new WeakSet();
  const watch = win => {
    if (!win || win.closed || watched.has(win)) {
      return;
    }
    watched.add(win);
    win.addEventListener("focus", onFocus);
    win.addEventListener("blur", onBlur);
  };
  for (const win of Services.wm.getEnumerator("navigator:browser")) {
    watch(win);
  }
  Services.obs.addObserver(
    subject => watch(subject),
    "browser-delayed-startup-finished"
  );
  Services.obs.addObserver(() => pauseActiveTime(), "sleep_notification");
  Services.obs.addObserver(() => resumeActiveTime(), "wake_notification");
  Services.obs.addObserver(() => pauseActiveTime(), "quit-application");
  resumeActiveTime();
}

/**
 * @returns {number} Milliseconds the browser was focused today. Synchronous,
 *   so it may lag the report store by a moment after midnight; await
 *   `readStoredToday()` first for an exact value.
 */
export function getTodayActiveMs() {
  if (storedDay !== lazy.dayKey()) {
    readStoredToday();
  }
  const live = lastTick ? Math.max(0, Date.now() - lastTick) : 0;
  return storedMs + handedMs + pendingMs + live;
}

export function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function ordinal(day) {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${day}th`;
  }
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

export function formatToday(date = new Date()) {
  // Ordinal suffixes only exist in English; other languages get the
  // locale's own long date.
  if (!Services.locale.appLocaleAsBCP47.toLowerCase().startsWith("en")) {
    return date.toLocaleDateString(undefined, { dateStyle: "long" });
  }
  const month = date.toLocaleString(undefined, { month: "long" });
  return `${month} ${ordinal(date.getDate())}, ${date.getFullYear()}`;
}

export function formatClock(date = new Date()) {
  // No forced 12-hour clock: the locale decides between 12 and 24 hours.
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function isValidHttpURL(raw) {
  if (!raw || typeof raw !== "string") {
    return false;
  }
  try {
    const url = new URL(raw.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) {
    return "—";
  }
  const megabytes = bytesPerSec / (1024 * 1024);
  if (megabytes >= 0.1) {
    const rounded =
      megabytes >= 10 ? Math.round(megabytes) : Math.round(megabytes * 10) / 10;
    return `${rounded}MB/s`;
  }
  return `${Math.max(1, Math.round(bytesPerSec / 1024))}KB/s`;
}

async function getDisplayName() {
  try {
    const { UIState } = ChromeUtils.importESModule(
      "resource://services-sync/UIState.sys.mjs"
    );
    const displayName = UIState.get()?.displayName?.trim();
    if (displayName) {
      return displayName;
    }
  } catch {
    // Sync UI state is optional.
  }
  const shareName = Services.prefs
    .getStringPref("zen.share.display-name", "")
    .trim();
  if (shareName) {
    return shareName;
  }
  try {
    const envName = Services.env.get("USERNAME") || Services.env.get("USER");
    if (envName) {
      return envName;
    }
  } catch {
    // Environment lookup is best-effort.
  }
  try {
    return Cc["@mozilla.org/toolkit/profile-service;1"].getService(
      Ci.nsIToolkitProfileService
    ).currentProfile.name;
  } catch {
    return "there";
  }
}

async function queryTopSite() {
  const db = await lazy.PlacesUtils.promiseDBConnection();
  const rows = await db.executeCached(
    `SELECT url, title
     FROM moz_places
     WHERE hidden = 0
       AND visit_count > 0
       AND url NOT LIKE :about
       AND url NOT LIKE :chrome
       AND url NOT LIKE :resource
       AND url NOT LIKE :extension
       AND url NOT LIKE :blob
       AND url NOT LIKE :data
     ORDER BY frecency DESC
     LIMIT 1`,
    {
      about: "about:%",
      chrome: "chrome:%",
      resource: "resource:%",
      extension: "moz-extension:%",
      blob: "blob:%",
      data: "data:%",
    }
  );
  if (!rows.length) {
    return "—";
  }
  const url = rows[0].getResultByName("url");
  const title = rows[0].getResultByName("title");
  if (title && !title.includes("://") && title.length <= 22) {
    return title;
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "") || title || "—";
  } catch {
    return title || "—";
  }
}

async function queryVisitedOrigins() {
  const db = await lazy.PlacesUtils.promiseDBConnection();
  const rows = await db.executeCached(
    `SELECT COUNT(DISTINCT rev_host) AS count
     FROM moz_places
     WHERE hidden = 0
       AND visit_count > 0
       AND rev_host <> '.'
       AND url NOT LIKE :about
       AND url NOT LIKE :chrome
       AND url NOT LIKE :extension`,
    {
      about: "about:%",
      chrome: "chrome:%",
      extension: "moz-extension:%",
    }
  );
  return String(rows[0]?.getResultByName("count") || 0);
}

function watchHistory() {
  if (historyObserved) {
    return;
  }
  try {
    lazy.PlacesUtils.observers.addListener(
      ["history-cleared", "page-removed"],
      () => {
        historyEpoch++;
        historyCache = null;
      }
    );
    historyObserved = true;
  } catch (error) {
    console.error("Zen homepage could not watch history", error);
  }
}

async function historyStats() {
  if (historyCache && Date.now() < historyCache.expires) {
    return historyCache;
  }
  if (historyInflight) {
    return historyInflight;
  }
  watchHistory();
  const epoch = historyEpoch;
  historyQueries++;
  historyInflight = Promise.all([queryTopSite(), queryVisitedOrigins()])
    .then(([topSite, visitedSites]) => {
      const result = {
        topSite,
        visitedSites,
        expires: Date.now() + HISTORY_TTL_MS,
      };
      if (epoch === historyEpoch) {
        historyCache = result;
      }
      return result;
    })
    .finally(() => {
      historyInflight = null;
    });
  return historyInflight;
}

/**
 * @returns {{ queries: number, cached: boolean }} How many history reads ran
 */
export function homepageHistoryCacheForTests() {
  return {
    queries: historyQueries,
    cached: !!historyCache && Date.now() < historyCache.expires,
  };
}

async function queryDownloads() {
  try {
    const list = await lazy.Downloads.getList(lazy.Downloads.ALL);
    const downloads = await list.getAll();
    const visible = downloads.filter(download => !download.source?.isPrivate);
    const finished = visible.filter(
      download => download.succeeded && !download.canceled
    );
    let speedSum = 0;
    let speedCount = 0;
    for (const download of visible) {
      if (download.speed > 0) {
        speedSum += download.speed;
        speedCount++;
      }
    }
    return {
      count: String(finished.length),
      speed: speedCount ? formatSpeed(speedSum / speedCount) : "—",
    };
  } catch (error) {
    console.error("Zen homepage download stats failed", error);
    return { count: "0", speed: "—" };
  }
}

/**
 * Only the cards that are on are worked out. Calls made while one is still
 * running share its result.
 *
 * @param {object} [options]
 * @param {boolean} [options.isPrivate]
 */
export function collectHomepageStats({ isPrivate = false } = {}) {
  if (statsInflight?.isPrivate === isPrivate) {
    return statsInflight.promise;
  }
  const promise = collectStats(isPrivate).finally(() => {
    if (statsInflight?.promise === promise) {
      statsInflight = null;
    }
  });
  statsInflight = { isPrivate, promise };
  return promise;
}

async function collectStats(isPrivate) {
  const shown = id => ZenHomepage.isCardEnabled(id);
  const [name, downloads] = await Promise.all([
    getDisplayName(),
    shown("downloads") || shown("network-speed")
      ? queryDownloads()
      : { count: "\u2014", speed: "\u2014" },
    shown("time-spent") ? readStoredToday() : null,
  ]);
  let topSite = "—";
  let visitedSites = "—";
  if (!isPrivate && (shown("top-site") || shown("visited-sites"))) {
    try {
      const history = await historyStats();
      topSite = history.topSite;
      visitedSites = history.visitedSites;
    } catch (error) {
      console.error("Zen homepage history stats failed", error);
    }
  }
  let report = "—";
  if (!isPrivate && shown("report")) {
    try {
      const week = await lazy.collectReport(7, { withHistory: false });
      report = new Intl.NumberFormat().format(week.trackers + week.banners);
    } catch (error) {
      console.error("Zen homepage report stats failed", error);
    }
  }
  return {
    name,
    dateLabel: formatToday(),
    clockLabel: formatClock(),
    timeSpent: formatDuration(getTodayActiveMs()),
    topSite,
    networkSpeed: downloads.speed,
    downloads: downloads.count,
    visitedSites,
    version: `v${Services.appinfo.version}`,
    report,
  };
}

export const ZenHomepage = {
  getMode() {
    const mode = Services.prefs.getStringPref(PREF_MODE, "builtin");
    return MODES.has(mode) ? mode : "builtin";
  },

  getCustomURL() {
    const raw = Services.prefs.getStringPref(PREF_URL, "").trim();
    return isValidHttpURL(raw) ? raw : "";
  },

  shouldShowBuiltin() {
    return this.getMode() === "builtin";
  },

  /**
   * URL used when Zen cannot keep the empty tab and must open a fallback tab.
   * Built-in and blank stay on about:blank; custom uses the validated URL.
   */
  getEmptyTabFallbackURL() {
    if (this.getMode() === "custom") {
      const url = this.getCustomURL();
      if (url) {
        return url;
      }
    }
    return "about:blank";
  },

  isCardEnabled(cardId) {
    const pref = CARD_PREFS[cardId];
    if (!pref) {
      return false;
    }
    return Services.prefs.getBoolPref(pref, true);
  },

  cardPrefNames() {
    return Object.values(CARD_PREFS);
  },
};
