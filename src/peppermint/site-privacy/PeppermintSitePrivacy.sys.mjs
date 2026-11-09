/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A "Privacy" section in Zen's site panel (the button at the start of the
 * address bar): how many trackers were blocked on the page, how many cookies
 * and how much storage the site keeps, and a button that forgets the site.
 * Zen's panel already shows the connection security and the permissions, so
 * this only adds what it lacks.
 */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  DownloadUtils: "resource://gre/modules/DownloadUtils.sys.mjs",
});
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "enabled",
  "peppermint.site-privacy.enabled",
  true
);

const PANEL_ID = "zen-unified-site-data-panel";
const FOOTER_ID = "zen-site-data-footer";
export const SECTION_ID = "peppermint-site-privacy";
const FTL = "browser/peppermint-site-privacy.ftl";
const STYLE_URL =
  "chrome://browser/content/zen-styles/peppermint-site-privacy.css";
const TOAST_ID = "peppermint-site-privacy-forgotten";
const CONFIRM_MS = 4000;

const WPL = Ci.nsIWebProgressListener;
const TRACKER_STATES =
  WPL.STATE_BLOCKED_TRACKING_CONTENT |
  WPL.STATE_BLOCKED_FINGERPRINTING_CONTENT |
  WPL.STATE_BLOCKED_CRYPTOMINING_CONTENT |
  WPL.STATE_BLOCKED_SOCIALTRACKING_CONTENT |
  (WPL.STATE_BLOCKED_EMAILTRACKING_CONTENT ?? 0) |
  WPL.STATE_COOKIES_BLOCKED_TRACKER |
  WPL.STATE_COOKIES_BLOCKED_SOCIALTRACKER;

const CD = Ci.nsIClearDataService;
// What "Forget This Site" removes; history only when asked.
export const FORGET_FLAGS =
  CD.CLEAR_COOKIES_AND_SITE_DATA |
  CD.CLEAR_ALL_CACHES |
  CD.CLEAR_PERMISSIONS |
  CD.CLEAR_CONTENT_PREFERENCES |
  CD.CLEAR_STORAGE_ACCESS;

/**
 * @param {string|object|null} log - A browser's content blocking log
 * @returns {number} How many origins had a tracker blocked
 */
export function countBlockedTrackers(log) {
  let entries = log;
  if (typeof log == "string") {
    try {
      entries = JSON.parse(log);
    } catch {
      return 0;
    }
  }
  return Object.values(entries ?? {}).filter(actions =>
    actions.some(([state, blocked]) => blocked && state & TRACKER_STATES)
  ).length;
}

function quotaUsage(site, privateBrowsingId) {
  return new Promise(resolve => {
    Services.qms.getUsage(request => {
      if (request.resultCode != Cr.NS_OK) {
        resolve(0);
        return;
      }
      let total = 0;
      for (const item of request.result) {
        try {
          const principal =
            Services.scriptSecurityManager.createContentPrincipalFromOrigin(
              item.origin
            );
          if (
            principal.privateBrowsingId == privateBrowsingId &&
            /^https?$/.test(principal.scheme) &&
            Services.eTLD.getSchemelessSite(principal.URI) == site
          ) {
            total += item.usage;
          }
        } catch {
          // Origins without a site (file:, moz-extension:, ...).
        }
      }
      resolve(total);
    });
  });
}

/**
 * @param {MozBrowser} browser
 * @returns {Promise<{site: string, cookies: number, usage: number}|null>}
 *   What the site shown in `browser` stores, or null for pages that are not
 *   websites
 */
export async function siteData(browser) {
  const uri = browser.currentURI;
  if (!uri || !(uri.schemeIs("http") || uri.schemeIs("https"))) {
    return null;
  }
  let site;
  try {
    site = Services.eTLD.getSchemelessSite(uri);
  } catch {
    return null;
  }
  const privateBrowsingId = browser.contentPrincipal?.privateBrowsingId ?? 0;
  const cookies = Services.cookies.getCookiesWithOriginAttributes(
    JSON.stringify({ privateBrowsingId }),
    site
  ).length;
  return { site, cookies, usage: await quotaUsage(site, privateBrowsingId) };
}

/**
 * Removes the cookies, storage, caches and permissions of `site`, in every
 * container and in private windows.
 *
 * @param {string} site - A site without scheme, like "example.com"
 * @param {object} [options]
 * @param {boolean} [options.history] - Also remove its history
 * @returns {Promise<number>} The flags of anything that failed to clear
 */
export function forgetSite(site, { history = false } = {}) {
  const flags = FORGET_FLAGS | (history ? CD.CLEAR_HISTORY : 0);
  return new Promise(resolve => {
    Services.clearData.deleteDataFromSite(site, {}, true, flags, resolve);
  });
}

function createItem(doc, id, iconClass) {
  const item = doc.createXULElement("hbox");
  item.id = id;
  item.classList.add(
    "permission-popup-permission-item",
    "peppermint-site-privacy-item"
  );
  item.setAttribute("align", "center");

  const icon = doc.createXULElement("toolbarbutton");
  icon.classList.add(
    "permission-popup-permission-icon",
    "zen-site-data-permission-icon",
    iconClass
  );
  icon.setAttribute("tabindex", "-1");
  icon.setAttribute("aria-hidden", "true");

  const labels = doc.createXULElement("vbox");
  labels.setAttribute("flex", "1");
  labels.setAttribute("align", "start");
  labels.classList.add("permission-popup-permission-label-container");
  const name = doc.createXULElement("label");
  name.classList.add("permission-popup-permission-label");
  const state = doc.createXULElement("label");
  state.classList.add("zen-permission-popup-permission-state-label");
  labels.append(name, state);

  item.append(icon, labels);
  return { item, name, state };
}

class SitePrivacy {
  #windows = new WeakSet();

  /** @param {Window} window - A browser window */
  init(window) {
    const panel = window.document.getElementById(PANEL_ID);
    if (!panel || this.#windows.has(window)) {
      return;
    }
    this.#windows.add(window);
    window.MozXULElement.insertFTLIfNeeded(FTL);
    panel.addEventListener("popupshowing", event => {
      if (event.target == panel) {
        this.update(window).catch(console.error);
      }
    });
  }

  /**
   * Fills the section for the selected tab of `window`.
   *
   * @param {Window} window - A browser window
   */
  async update(window) {
    const doc = window.document;
    const browser = window.gBrowser.selectedBrowser;
    let section = doc.getElementById(SECTION_ID);
    const uri = browser.currentURI;
    const isWebsite =
      lazy.enabled &&
      (uri?.schemeIs("http") || uri?.schemeIs("https")) &&
      !!uri.asciiHost;
    if (!isWebsite) {
      if (section) {
        section.hidden = true;
      }
      return;
    }
    section ??= this.#build(window);
    if (!section) {
      return;
    }
    section.hidden = false;
    this.#disarm(section);
    section.querySelector(".peppermint-site-privacy-history").checked = false;

    const trackers = section.querySelector("#peppermint-site-privacy-trackers");
    let count = 0;
    try {
      count = countBlockedTrackers(browser.getContentBlockingLog());
    } catch (error) {
      console.error(error);
    }
    trackers.setAttribute("state", count ? "allow" : "block");
    doc.l10n.setAttributes(
      trackers.querySelector(".zen-permission-popup-permission-state-label"),
      count
        ? "peppermint-site-privacy-trackers-blocked"
        : "peppermint-site-privacy-trackers-none",
      { count }
    );

    const data = await siteData(browser);
    if (!data || window.gBrowser.selectedBrowser != browser) {
      return;
    }
    section.dataset.site = data.site;
    const storage = section.querySelector("#peppermint-site-privacy-storage");
    const stored = data.cookies || data.usage;
    storage.setAttribute("state", stored ? "allow" : "block");
    const [size, unit] = lazy.DownloadUtils.convertByteUnits(data.usage);
    doc.l10n.setAttributes(
      storage.querySelector(".zen-permission-popup-permission-state-label"),
      stored
        ? "peppermint-site-privacy-storage-summary"
        : "peppermint-site-privacy-storage-none",
      { cookies: data.cookies, size, unit }
    );
  }

  #build(window) {
    const doc = window.document;
    const footer = doc.getElementById(FOOTER_ID);
    if (!footer) {
      return null;
    }
    if (!doc.querySelector(`link[href="${STYLE_URL}"]`)) {
      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = STYLE_URL;
      (doc.querySelector("linkset") || doc.documentElement).append(link);
    }

    const section = doc.createXULElement("vbox");
    section.id = SECTION_ID;
    section.classList.add("zen-site-data-section");
    const header = doc.createXULElement("hbox");
    header.classList.add("zen-site-data-section-header");
    const title = doc.createXULElement("label");
    title.setAttribute("flex", "1");
    doc.l10n.setAttributes(title, "peppermint-site-privacy-title");
    header.append(title);

    const trackers = createItem(
      doc,
      "peppermint-site-privacy-trackers",
      "zen-permission-shield-icon"
    );
    doc.l10n.setAttributes(trackers.name, "peppermint-site-privacy-trackers");
    const storage = createItem(
      doc,
      "peppermint-site-privacy-storage",
      "zen-permission-cookie-icon"
    );
    doc.l10n.setAttributes(storage.name, "peppermint-site-privacy-storage");
    const forget = createItem(
      doc,
      "peppermint-site-privacy-forget",
      "peppermint-site-privacy-forget-icon"
    );
    forget.item.setAttribute("role", "button");
    forget.item.setAttribute("tabindex", "0");
    doc.l10n.setAttributes(forget.name, "peppermint-site-privacy-forget");

    const history = doc.createXULElement("checkbox");
    history.classList.add("peppermint-site-privacy-history");
    doc.l10n.setAttributes(history, "peppermint-site-privacy-also-history");

    section.append(header, trackers.item, storage.item, forget.item, history);
    footer.before(section);

    forget.item.addEventListener("click", () =>
      this.#onForget(window, section)
    );
    forget.item.addEventListener("keydown", event => {
      if (event.key == "Enter" || event.key == " ") {
        event.preventDefault();
        this.#onForget(window, section);
      }
    });
    return section;
  }

  #disarm(section) {
    section.ownerDocument.defaultView.clearTimeout(section._confirmTimer);
    section.removeAttribute("confirming");
    const forget = section.querySelector("#peppermint-site-privacy-forget");
    forget.removeAttribute("state");
    section.ownerDocument.l10n.setAttributes(
      forget.querySelector(".zen-permission-popup-permission-state-label"),
      "peppermint-site-privacy-forget-description"
    );
  }

  #onForget(window, section) {
    const doc = window.document;
    const forget = section.querySelector("#peppermint-site-privacy-forget");
    if (!section.hasAttribute("confirming")) {
      section.setAttribute("confirming", "true");
      forget.setAttribute("state", "allow");
      doc.l10n.setAttributes(
        forget.querySelector(".zen-permission-popup-permission-state-label"),
        "peppermint-site-privacy-forget-confirm"
      );
      section._confirmTimer = window.setTimeout(
        () => this.#disarm(section),
        CONFIRM_MS
      );
      return;
    }
    const site = section.dataset.site;
    const history = section.querySelector(
      ".peppermint-site-privacy-history"
    ).checked;
    const browser = window.gBrowser.selectedBrowser;
    this.#disarm(section);
    doc.getElementById(PANEL_ID)?.hidePopup();
    if (site) {
      this.forget(window, browser, site, { history }).catch(console.error);
    }
  }

  /**
   * Forgets `site`, reloads `browser` and says so.
   *
   * @param {Window} window
   * @param {MozBrowser} browser
   * @param {string} site
   * @param {object} options - See forgetSite()
   */
  async forget(window, browser, site, options) {
    await forgetSite(site, options);
    browser.reload();
    const messageId = options.history ? `${TOAST_ID}-with-history` : TOAST_ID;
    window.gZenUIManager
      ?.showToast(messageId, { l10nArgs: { site } })
      .catch(console.error);
    // Zen keeps the text of a toast that is still showing, so forgetting a
    // second site right after the first needs the new name set here.
    const container = window.document.getElementById("zen-toast-container");
    const toast = [...(container?.children ?? [])].find(
      child => child._messageId == messageId
    );
    const label = toast?.querySelector("label");
    if (label) {
      window.document.l10n.setAttributes(label, messageId, { site });
      window.document.l10n.translateElements([label]);
    }
  }
}

export const PeppermintSitePrivacy = new SitePrivacy();
