/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Takes back camera, microphone, location and notification permissions from
 * websites the user has not visited for a while (90 days by default). It runs
 * at most once a day, while the browser is inactive. Blocks, permissions set
 * by policy and permissions that end with the session are left alone.
 *
 * The last visit comes from history. A permission is never older than the
 * time it was granted, so clearing history only starts the countdown from
 * the grant. Nothing runs while history is turned off, because then there is
 * no way to know which websites are still in use.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PeppermintActivity: "moz-src:///peppermint/common/PeppermintActivity.sys.mjs",
  PeppermintVaultPermissionLog:
    "moz-src:///peppermint/vault/PeppermintVaultPermissionLog.sys.mjs",
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  isUserPermission:
    "moz-src:///peppermint/vault/PeppermintVaultPermissionLog.sys.mjs",
});

export const PREFS = {
  enabled: "peppermint.permissions.auto-revoke.enabled",
  days: "peppermint.permissions.auto-revoke.days",
  lastRun: "peppermint.permissions.auto-revoke.last-run",
};

export const TYPES = ["camera", "microphone", "geo", "desktop-notification"];
export const REASON = "auto-revoked";

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_PREF = "places.history.enabled";

function isCandidate(permission) {
  const { EXPIRE_POLICY, EXPIRE_SESSION, ALLOW_ACTION } =
    Ci.nsIPermissionManager;
  return (
    TYPES.includes(permission.type) &&
    permission.capability == ALLOW_ACTION &&
    permission.expireType != EXPIRE_POLICY &&
    permission.expireType != EXPIRE_SESSION &&
    /^https?$/.test(permission.principal.scheme) &&
    lazy.isUserPermission(permission)
  );
}

/**
 * @param {string[]} origins - Origins without suffix, like https://a.example
 * @returns {Promise<Map<string, number>>} The last visit of each origin that
 *   has one, in milliseconds
 */
async function lastVisits(origins) {
  const db = await lazy.PlacesUtils.promiseDBConnection();
  const visits = new Map();
  for (const origin of origins) {
    const url = URL.parse(origin);
    if (!url) {
      continue;
    }
    const rows = await db.executeCached(
      `SELECT MAX(h.last_visit_date) AS last
       FROM moz_places h JOIN moz_origins o ON o.id = h.origin_id
       WHERE o.prefix = :prefix AND o.host = :host`,
      { prefix: `${url.protocol}//`, host: url.host }
    );
    const last = rows[0]?.getResultByName("last");
    if (last) {
      visits.set(origin, Math.floor(last / 1000));
    }
  }
  return visits;
}

class AutoRevoke {
  #started = false;
  #running = null;

  start() {
    if (this.#started) {
      return;
    }
    this.#started = true;
    lazy.PeppermintActivity.addObserver(this);
  }

  onInactive() {
    if (this.#isDue()) {
      ChromeUtils.idleDispatch(() => this.run().catch(console.error));
    }
  }

  #isDue() {
    const lastRun = Services.prefs.getIntPref(PREFS.lastRun, 0) * 1000;
    return Date.now() - lastRun >= DAY_MS;
  }

  /**
   * Removes every eligible permission whose website was last visited (or
   * which was granted) more than the set number of days ago.
   *
   * @param {object} [options]
   * @param {number} [options.now] - The current time, for tests
   * @returns {Promise<nsIPermission[]>} The permissions that were removed
   */
  run({ now = Date.now() } = {}) {
    this.#running ??= this.#run(now).finally(() => (this.#running = null));
    return this.#running;
  }

  async #run(now) {
    const days = Services.prefs.getIntPref(PREFS.days, 90);
    if (
      !Services.prefs.getBoolPref(PREFS.enabled, false) ||
      !Services.prefs.getBoolPref(HISTORY_PREF, true) ||
      days <= 0
    ) {
      return [];
    }
    Services.prefs.setIntPref(PREFS.lastRun, Math.floor(now / 1000));
    const cutoff = now - days * DAY_MS;
    const candidates = Services.perms.all.filter(
      permission =>
        isCandidate(permission) && permission.modificationTime < cutoff
    );
    if (!candidates.length) {
      return [];
    }
    const visits = await lastVisits([
      ...new Set(candidates.map(p => p.principal.originNoSuffix)),
    ]);
    const removed = [];
    for (const permission of candidates) {
      const lastVisit = visits.get(permission.principal.originNoSuffix) ?? 0;
      if (lastVisit >= cutoff) {
        continue;
      }
      // The permission may have changed while history was read.
      const current = Services.perms.getPermissionObject(
        permission.principal,
        permission.type,
        true
      );
      if (
        !current ||
        !isCandidate(current) ||
        current.modificationTime >= cutoff
      ) {
        continue;
      }
      lazy.PeppermintVaultPermissionLog.noteReason(current, REASON);
      Services.perms.removePermission(current);
      removed.push(current);
    }
    return removed;
  }
}

export const PeppermintPermissionAutoRevoke = new AutoRevoke();
