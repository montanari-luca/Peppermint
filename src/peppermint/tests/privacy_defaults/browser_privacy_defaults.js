/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Peppermint's own defaults, and the Firefox ones it relies on. A Zen or
// Firefox merge that changes one of them fails here.
const BOOL_DEFAULTS = {
  "privacy.query_stripping.enabled": true,
  "privacy.query_stripping.enabled.pbmode": true,
  "privacy.query_stripping.strip_on_share.enabled": true,
  "privacy.fingerprintingProtection": true,
  "privacy.globalprivacycontrol.enabled": true,
  "media.peerconnection.ice.default_address_only": true,
  "dom.security.https_first": true,
  "permissions.desktop-notification.postPrompt.enabled": true,
  "dom.webnotifications.requireuserinteraction": true,
};

add_task(async function test_defaults() {
  const defaults = Services.prefs.getDefaultBranch("");
  for (const [pref, value] of Object.entries(BOOL_DEFAULTS)) {
    Assert.equal(defaults.getBoolPref(pref), value, pref);
  }
  Assert.equal(
    defaults.getIntPref("network.http.referer.XOriginTrimmingPolicy"),
    2,
    "Cross-site referrers carry only the origin"
  );
});

add_task(async function test_tracking_protection_stays_standard() {
  const { ContentBlockingPrefs } = ChromeUtils.importESModule(
    "moz-src:///browser/components/protections/ContentBlockingPrefs.sys.mjs"
  );
  Assert.ok(
    ContentBlockingPrefs.prefsMatch("standard"),
    "The new defaults still count as the Standard category"
  );
});
