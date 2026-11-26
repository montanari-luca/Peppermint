/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Peppermint keeps its settings in about:preferences; Zen's own settings
// window must not take over openPreferences().

function settingsWindows() {
  return [...Services.wm.getEnumerator("Zen:Settings")].filter(
    win => !win.closed
  );
}

add_task(async function test_open_preferences_uses_about_preferences() {
  // An empty selected tab would be reused instead of opening a new one.
  const startTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:robots"
  );
  const tabPromise = BrowserTestUtils.waitForNewTab(
    gBrowser,
    url => url.startsWith("about:preferences"),
    true
  );
  openPreferences();
  const tab = await tabPromise;
  try {
    Assert.equal(
      settingsWindows().length,
      0,
      "Zen's settings window did not open"
    );
    const nav = await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
      const doc = content.document;
      await ContentTaskUtils.waitForCondition(
        () => doc.getElementById("category-zen-peppermint"),
        "Peppermint's panes are listed"
      );
      return {
        zenWindowButton: !!doc.getElementById("category-zen-settings"),
        marketplace: !!doc.getElementById("category-zen-marketplace"),
        panes: [
          "category-zen-sidebar-layout",
          "category-zen-spaces-tabs",
          "category-zen-adblock",
          "category-zen-ghost-mode",
        ].filter(id => doc.getElementById(id)),
      };
    });
    ok(!nav.zenWindowButton, "No nav entry opens Zen's settings window");
    ok(!nav.marketplace, "The mods marketplace stays out of the nav");
    Assert.equal(nav.panes.length, 4, "Peppermint's panes are in the nav");
  } finally {
    BrowserTestUtils.removeTab(tab);
    BrowserTestUtils.removeTab(startTab);
  }
});
