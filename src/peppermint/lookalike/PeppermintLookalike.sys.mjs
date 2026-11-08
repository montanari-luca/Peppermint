/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Warns with a bar above the page when a website the user has never visited
 * imitates a popular one (see PeppermintLookalikeDomains). The bar offers
 * the real website or carrying on; carrying on is remembered for the site
 * until its site data is cleared. Everything is checked locally.
 */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  findLookalike:
    "moz-src:///peppermint/lookalike/PeppermintLookalikeDomains.sys.mjs",
});
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "enabled",
  "peppermint.lookalike.enabled",
  true
);

const FTL = "browser/peppermint-lookalike.ftl";
export const NOTIFICATION_VALUE = "peppermint-lookalike-domain";
export const PERMISSION_TYPE = "peppermint-lookalike-allowed";
// A first visit is recorded while the page loads, so visits this recent do
// not count as having been there before.
const VISIT_SLACK_MS = 10000;

const { LOCATION_CHANGE_SAME_DOCUMENT } = Ci.nsIWebProgressListener;

function principalFor(base, browser) {
  return Services.scriptSecurityManager.createContentPrincipal(
    Services.io.newURI(`https://${base}`),
    browser.contentPrincipal?.originAttributes ?? {}
  );
}

/**
 * @param {string} base - A base domain
 * @param {number} before - Time in milliseconds
 * @returns {Promise<boolean>} Whether history has a visit to the domain, or
 *   one of its subdomains, from before `before`
 */
async function visitedBefore(base, before) {
  const db = await lazy.PlacesUtils.promiseDBConnection();
  const rows = await db.executeCached(
    `SELECT 1 FROM moz_historyvisits v
     JOIN moz_places h ON h.id = v.place_id
     JOIN moz_origins o ON o.id = h.origin_id
     WHERE (o.host = :base OR substr(o.host, -length(:dotted)) = :dotted)
       AND v.visit_date < :before
     LIMIT 1`,
    { base, dotted: `.${base}`, before: before * 1000 }
  );
  return rows.length > 0;
}

class Lookalike {
  #windows = new WeakSet();
  // When each lookalike was first warned about in this session, so leaving
  // the bar alone and browsing on keeps warning.
  #firstWarned = new Map();

  listener = {
    QueryInterface: ChromeUtils.generateQI([
      "nsIWebProgressListener",
      "nsISupportsWeakReference",
    ]),
    onLocationChange: (browser, webProgress, request, location, flags) => {
      if (webProgress.isTopLevel && !(flags & LOCATION_CHANGE_SAME_DOCUMENT)) {
        this.check(browser, location).catch(console.error);
      }
    },
  };

  /** @param {Window} window - A browser window */
  init(window) {
    if (this.#windows.has(window)) {
      return;
    }
    this.#windows.add(window);
    window.MozXULElement.insertFTLIfNeeded(FTL);
    if (window.gBrowser) {
      window.gBrowser.addTabsProgressListener(this.listener);
      return;
    }
    const topic = "browser-delayed-startup-finished";
    const observer = subject => {
      if (subject == window) {
        Services.obs.removeObserver(observer, topic);
        window.gBrowser.addTabsProgressListener(this.listener);
      }
    };
    Services.obs.addObserver(observer, topic);
  }

  /**
   * Shows the warning in `browser` when `uri` imitates a popular website.
   *
   * @param {MozBrowser} browser
   * @param {nsIURI} uri - The address the browser moved to
   * @returns {Promise<object|null>} The lookalike that was warned about
   */
  async check(browser, uri) {
    if (!lazy.enabled || !(uri?.schemeIs("http") || uri?.schemeIs("https"))) {
      return null;
    }
    const host = uri.asciiHost;
    const lookalike = host && (await lazy.findLookalike(host));
    if (!lookalike) {
      return null;
    }
    const { base } = lookalike;
    const principal = principalFor(base, browser);
    if (
      Services.perms.testExactPermissionFromPrincipal(
        principal,
        PERMISSION_TYPE
      ) == Services.perms.ALLOW_ACTION
    ) {
      return null;
    }
    const since = this.#firstWarned.get(base) ?? Date.now();
    if (await visitedBefore(base, since - VISIT_SLACK_MS)) {
      return null;
    }
    if (browser.currentURI?.asciiHost != host) {
      return null;
    }
    this.#firstWarned.set(base, since);
    await this.#show(browser, lookalike);
    return lookalike;
  }

  async #show(browser, { base, domain, reason }) {
    const window = browser.ownerDocument.defaultView;
    const box = window.gBrowser.getNotificationBox(browser);
    if (box.getNotificationWithValue(NOTIFICATION_VALUE)) {
      return;
    }
    const [goLabel, continueLabel] = await window.document.l10n.formatValues([
      { id: "peppermint-lookalike-go", args: { domain } },
      { id: "peppermint-lookalike-continue" },
    ]);
    await box.appendNotification(
      NOTIFICATION_VALUE,
      {
        label: {
          "l10n-id": `peppermint-lookalike-message-${reason}`,
          "l10n-args": { site: base, domain },
        },
        image: "chrome://browser/skin/zen-icons/security-warning.svg",
        priority: box.PRIORITY_WARNING_HIGH,
      },
      [
        {
          label: goLabel,
          callback: () => {
            browser.fixupAndLoadURIString(`https://${domain}/`, {
              triggeringPrincipal:
                Services.scriptSecurityManager.getSystemPrincipal(),
            });
          },
        },
        {
          label: continueLabel,
          callback: () => this.allow(base, browser),
        },
      ]
    );
  }

  /**
   * Stops warning about `base`.
   *
   * @param {string} base - A base domain
   * @param {MozBrowser} browser - Where it was visited, for private windows
   */
  allow(base, browser) {
    this.#firstWarned.delete(base);
    Services.perms.addFromPrincipal(
      principalFor(base, browser),
      PERMISSION_TYPE,
      Services.perms.ALLOW_ACTION
    );
  }
}

export const PeppermintLookalike = new Lookalike();
