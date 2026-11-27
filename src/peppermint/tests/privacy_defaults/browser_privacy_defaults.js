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

// Memory and disk defaults (prefs/peppermint/additions.yaml).
add_task(async function test_resource_defaults() {
  const defaults = Services.prefs.getDefaultBranch("");
  Assert.equal(
    defaults.getBoolPref("browser.newtab.preload"),
    false,
    "No hidden new tab page is kept loaded"
  );
  Assert.equal(
    defaults.getIntPref("dom.ipc.processPrelaunch.fission.number"),
    1,
    "One spare content process is kept ready"
  );
  Assert.equal(
    defaults.getBoolPref("browser.places.interactions.enabled"),
    false,
    "Page interactions are not recorded"
  );
});

// No AI (prefs/peppermint/no-ai.yaml and Zen's prefs/firefox/ai.yaml). Every
// boolean in Firefox's AI namespaces must default to off, so a merge that adds
// a new AI feature fails here until it is turned off.
const AI_PREF = new RegExp(
  "^(browser\\.ml\\.|browser\\.smartwindow\\.|browser\\.aiwindow\\.|" +
    "browser\\.genai\\.|browser\\.tabs\\.groups\\.smart\\.|" +
    "places\\.semanticHistory\\.|extensions\\.ml\\.|" +
    "browser\\.search\\.visualSearch\\.)|(^|\\.)(genai|llm|chatbot)(\\.|$)"
);
// On, but they only tune a feature that is off.
const AI_SETTINGS_ALLOWED_ON = new Set([
  "browser.ml.chat.hideLocalhost",
  "browser.ml.checkForMemory",
  "browser.ml.linkPreview.blockListEnabled",
  "browser.ml.linkPreview.longPress",
  "browser.ml.llama.hwInference",
  "browser.smartwindow.aitab.menus",
  "browser.smartwindow.searchTheWebFast",
  "browser.smartwindow.showThemesNotice",
  "browser.smartwindow.sidebar.openByDefault",
]);

add_task(async function test_no_ai() {
  const defaults = Services.prefs.getDefaultBranch("");
  for (const pref of ["browser.ml.enable", "browser.smartwindow.enabled"]) {
    Assert.ok(!defaults.getBoolPref(pref), `${pref} is off`);
  }
  const switchedOn = defaults
    .getChildList("")
    .filter(
      pref =>
        AI_PREF.test(pref) &&
        !AI_SETTINGS_ALLOWED_ON.has(pref) &&
        defaults.getPrefType(pref) == Ci.nsIPrefBranch.PREF_BOOL &&
        defaults.getBoolPref(pref)
    );
  Assert.deepEqual(
    switchedOn,
    [],
    "No AI feature is on by default (turn new ones off in prefs/peppermint/no-ai.yaml)"
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
