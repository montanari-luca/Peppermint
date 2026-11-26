/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const VAULT_PREF = "peppermint.vault.enabled";
const VAULT_URL = "moz-src:///peppermint/vault/PeppermintVault.sys.mjs";
const SIDEBAR_STYLE = "chrome://browser/content/zen-styles/peppermint-sidebar.css";
const SITE_PRIVACY_FTL = "browser/peppermint-site-privacy.ftl";

// Zen's window sync rejects while a test window is set up (see the
// window_sync suite); that is not what these tests are about.
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PromiseTestUtils.sys.mjs"
);
PromiseTestUtils.allowMatchingRejectionsGlobally(/gBrowser is undefined/);
PromiseTestUtils.allowMatchingRejectionsGlobally(/^undefined$/);

add_task(async function test_disabled_feature_is_not_imported() {
  Assert.ok(!Services.prefs.getBoolPref(VAULT_PREF), "Vault starts off");
  Assert.ok(
    !Cu.isESModuleLoaded(VAULT_URL),
    "Startup does not even load Vault while it is off"
  );

  await SpecialPowers.pushPrefEnv({ set: [[VAULT_PREF, true]] });
  Assert.ok(Cu.isESModuleLoaded(VAULT_URL), "Turning Vault on starts it");
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_new_window_runs_every_phase() {
  const tabsBefore = new Set(gBrowser.tabs);
  const win = await BrowserTestUtils.openNewBrowserWindow();
  Assert.ok(
    win.document.querySelector(`link[href="${SIDEBAR_STYLE}"]`),
    "Features of the first frame are there as soon as the window is"
  );
  await TestUtils.waitForCondition(
    () => win.document.querySelector(`link[href="${SITE_PRIVACY_FTL}"]`),
    "Features that wait for delayed startup start in a new window"
  );
  await BrowserTestUtils.closeWindow(win);
  // Window sync mirrors the new window's first tab into this one.
  for (const tab of gBrowser.tabs.filter(tab => !tabsBefore.has(tab))) {
    BrowserTestUtils.removeTab(tab);
  }
});
