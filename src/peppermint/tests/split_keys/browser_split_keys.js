/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { PEPPERMINT_KEY_CATEGORIES, PeppermintSplitKeys } =
  ChromeUtils.importESModule(
    "moz-src:///peppermint/split-keys/PeppermintSplitKeys.sys.mjs"
  );

async function openSplit(n) {
  const tabs = [];
  for (let i = 1; i <= n; i++) {
    const url = `data:text/plain,pane${i}`;
    const tab = BrowserTestUtils.addTab(gBrowser, url, { skipAnimation: true });
    await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
    tabs.push(tab);
  }
  const activated = BrowserTestUtils.waitForEvent(
    window,
    "ZenViewSplitter:SplitViewActivated"
  );
  gZenViewSplitter.splitTabs(tabs, "vsep");
  await activated;
  await TestUtils.waitForTick();
  return tabs;
}

function paneOrder() {
  const view = gZenViewSplitter._data[gZenViewSplitter.currentView];
  const order = [];
  const walk = node =>
    node.tab ? order.push(node.tab) : node.children.forEach(walk);
  walk(view.layoutTree);
  return order;
}

add_task(async function test_focus_moves_between_panes() {
  const tabs = await openSplit(3);
  try {
    const order = paneOrder();
    gBrowser.selectedTab = order[0];
    Assert.ok(PeppermintSplitKeys.focus(window, 1), "There is a next pane");
    Assert.equal(gBrowser.selectedTab, order[1], "The next pane is selected");
    PeppermintSplitKeys.focus(window, 1);
    PeppermintSplitKeys.focus(window, 1);
    Assert.equal(gBrowser.selectedTab, order[0], "It wraps around");
    PeppermintSplitKeys.focus(window, -1);
    Assert.equal(gBrowser.selectedTab, order[2], "And goes back");
  } finally {
    gZenViewSplitter.unsplitCurrentView();
    for (const tab of tabs) {
      BrowserTestUtils.removeTab(tab);
    }
  }
});

add_task(async function test_rotate_moves_every_pane() {
  const tabs = await openSplit(3);
  try {
    const before = paneOrder();
    Assert.ok(PeppermintSplitKeys.rotate(window), "The panes rotate");
    Assert.deepEqual(
      paneOrder(),
      [before[1], before[2], before[0]],
      "Every pane moved one place"
    );
  } finally {
    gZenViewSplitter.unsplitCurrentView();
    for (const tab of tabs) {
      BrowserTestUtils.removeTab(tab);
    }
  }
});

add_task(async function test_outside_a_split_nothing_happens() {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "data:text/plain,alone"
  );
  Assert.ok(!PeppermintSplitKeys.focus(window, 1), "No pane to go to");
  Assert.ok(!PeppermintSplitKeys.rotate(window), "Nothing to rotate");
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_keys_can_be_bound() {
  for (const keys of Object.values(PEPPERMINT_KEY_CATEGORIES)) {
    for (const [id] of keys) {
      const key = document.getElementById(id);
      Assert.ok(key, `${id} exists`);
      Assert.ok(
        document.getElementById(key.getAttribute("command")),
        `${id} runs a command that exists`
      );
    }
  }
  Assert.equal(
    document.getElementById("peppermint-split-focus-next").getAttribute("key"),
    "]",
    "Next pane has a default key"
  );
});
