/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const PREF = "zen.tab-unloader.timeout-minutes";
const NEVER_PREF = "zen.underpowered.never-freeze";

const { isUnloadSafe } = ChromeUtils.importESModule(
  "moz-src:///peppermint/common/PeppermintTabs.sys.mjs"
);
const { ZenTabUnloader } = ChromeUtils.importESModule(
  "resource:///modules/zen/ZenTabUnloader.sys.mjs"
);

function protectOtherTabs(target) {
  const saved = [];
  for (const win of Services.wm.getEnumerator("navigator:browser")) {
    if (win.closed || !win.gBrowser) {
      continue;
    }
    for (const tab of win.gBrowser.tabs) {
      if (tab === target) {
        continue;
      }
      saved.push([tab, tab._lastAccessed]);
      tab._lastAccessed = Date.now();
    }
  }
  return () => {
    for (const [tab, last] of saved) {
      try {
        tab._lastAccessed = last;
      } catch {
        // The tab may already be gone.
      }
    }
  };
}

async function openBackgroundTab(url) {
  const tab = BrowserTestUtils.addTab(gBrowser, url);
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser, false, url);
  await TestUtils.waitForCondition(
    () => !tab.hasAttribute("busy"),
    "background tab finished loading"
  );
  return tab;
}

function unloadBlockers(tab, selected) {
  const browser = tab.linkedBrowser;
  const reasons = [];
  if (tab === selected) {
    reasons.push("selected");
  }
  if (tab.closing) {
    reasons.push("closing");
  }
  if (!tab.linkedPanel) {
    reasons.push("no-panel");
  }
  if (tab.hasAttribute("pending")) {
    reasons.push("pending");
  }
  if (tab.hasAttribute("busy")) {
    reasons.push("busy");
  }
  if (tab.hasAttribute("zen-empty-tab")) {
    reasons.push("empty-tab");
  }
  if (tab.hasAttribute("pictureinpicture")) {
    reasons.push("pip");
  }
  if (tab.isEmpty) {
    reasons.push("isEmpty");
  }
  if (!browser) {
    reasons.push("no-browser");
  }
  if (browser?.zenModeActive) {
    reasons.push("zen-mode");
  }
  if (browser?.hasBeforeUnload) {
    reasons.push("beforeunload");
  }
  if (
    tab.group?.hasAttribute("split-view-group") &&
    selected?.group === tab.group
  ) {
    reasons.push("split");
  }
  const glanceId = selected?.getAttribute("glance-id");
  if (glanceId && tab.getAttribute("glance-id") === glanceId) {
    reasons.push(`glance:${glanceId}`);
  }
  return reasons.join(", ") || "none";
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, 1]] });
  registerCleanupFunction(async () => {
    await SpecialPowers.popPrefEnv();
  });
});

add_task(async function test_beforeunload_tab_is_kept() {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );
  await SpecialPowers.spawn(tab.linkedBrowser, [], () => {
    content.addEventListener("beforeunload", event => {
      event.preventDefault();
    });
  });
  ok(tab.linkedBrowser.hasBeforeUnload, "The page registered beforeunload");

  const other = await openBackgroundTab("https://example.org/?keep-selected");
  gBrowser.selectedTab = other;
  tab._lastAccessed = Date.now() - 5 * 60 * 1000;

  ok(
    !isUnloadSafe(tab, gBrowser.selectedTab),
    "A beforeunload tab is not unload-safe"
  );
  const restore = protectOtherTabs(tab);
  try {
    // Only run the unloader when the tab is already excluded. Calling it on a
    // tab that would prompt opens a dialog and stalls the test.
    if (!isUnloadSafe(tab, gBrowser.selectedTab)) {
      ZenTabUnloader.unloadIdleTabs();
    }
    await TestUtils.waitForTick();
    ok(tab.linkedPanel, "The beforeunload tab stays loaded");
    ok(!tab.hasAttribute("pending"), "The beforeunload tab is not discarded");
  } finally {
    restore();
    BrowserTestUtils.removeTab(tab);
    BrowserTestUtils.removeTab(other);
  }
});

add_task(async function test_idle_tab_is_unloaded() {
  const selected = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/?selected"
  );
  const tab = await openBackgroundTab("https://example.org/?idle");
  gBrowser.selectedTab = selected;
  tab._lastAccessed = Date.now() - 5 * 60 * 1000;
  ok(
    isUnloadSafe(tab, selected),
    `An ordinary background tab is unload-safe (${unloadBlockers(tab, selected)})`
  );

  const restore = protectOtherTabs(tab);
  try {
    ZenTabUnloader.unloadIdleTabs();
    await TestUtils.waitForCondition(
      () => tab.hasAttribute("pending") && !tab.linkedPanel,
      "The idle tab is unloaded"
    );
  } finally {
    restore();
    BrowserTestUtils.removeTab(tab);
    BrowserTestUtils.removeTab(selected);
  }
});

add_task(async function test_sharing_tab_is_kept() {
  const selected = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/?selected-sharing"
  );
  const tab = await openBackgroundTab("https://example.org/?sharing");
  gBrowser.selectedTab = selected;
  tab._lastAccessed = Date.now() - 5 * 60 * 1000;
  // What webrtcUI sets while a page uses the camera, microphone or screen.
  tab.setAttribute("sharing", "camera");

  const restore = protectOtherTabs(tab);
  try {
    const unloaded = await ZenTabUnloader.unloadIdleTabs();
    Assert.equal(unloaded, 0, "Nothing is unloaded");
    ok(tab.linkedPanel, "A tab sharing the camera stays loaded");
  } finally {
    tab.removeAttribute("sharing");
    restore();
    BrowserTestUtils.removeTab(tab);
    BrowserTestUtils.removeTab(selected);
  }
});

add_task(async function test_never_unload_site_is_kept() {
  await SpecialPowers.pushPrefEnv({
    set: [[NEVER_PREF, "example.org"]],
  });
  const selected = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/?selected-never"
  );
  const tab = await openBackgroundTab("https://test1.example.org/?never");
  gBrowser.selectedTab = selected;
  tab._lastAccessed = Date.now() - 5 * 60 * 1000;

  const restore = protectOtherTabs(tab);
  try {
    const unloaded = await ZenTabUnloader.unloadIdleTabs();
    Assert.equal(unloaded, 0, "Nothing is unloaded");
    ok(tab.linkedPanel, "A subdomain of a listed site stays loaded");
  } finally {
    restore();
    BrowserTestUtils.removeTab(tab);
    BrowserTestUtils.removeTab(selected);
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_timer_waits_for_the_next_due_tab() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, 10]] });
  const selected = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/?selected-delay"
  );
  const tab = await openBackgroundTab("https://example.org/?delay");
  gBrowser.selectedTab = selected;
  const now = Date.now();
  tab._lastAccessed = now - 7 * 60 * 1000;

  const restore = protectOtherTabs(tab);
  try {
    Assert.ok(ZenTabUnloader.armed, "A pass is scheduled");
    Assert.equal(
      ZenTabUnloader.nextDelay(now),
      3 * 60 * 1000,
      "The next pass runs when the idlest tab falls due"
    );
    tab._lastAccessed = now - 9.9 * 60 * 1000;
    Assert.equal(
      ZenTabUnloader.nextDelay(now),
      60 * 1000,
      "Tabs that fall due within a minute share one pass"
    );
  } finally {
    restore();
    BrowserTestUtils.removeTab(tab);
    BrowserTestUtils.removeTab(selected);
    await SpecialPowers.popPrefEnv();
  }
});
