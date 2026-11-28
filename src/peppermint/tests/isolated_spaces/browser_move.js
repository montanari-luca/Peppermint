/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_moved_tab_reopens_in_the_container() {
  const start = gZenWorkspaces.getActiveWorkspace();
  await SpecialPowers.pushPrefEnv({
    set: [["peppermint.spaces.isolate-new", false]],
  });
  const open = await createSpace("Open");
  await SpecialPowers.popPrefEnv();
  Assert.ok(!Isolated.isIsolated(open), "The source space is not isolated");

  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, PAGE);
  BrowserTestUtils.startLoadingURIString(tab.linkedBrowser, OTHER_PAGE);
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser, false, OTHER_PAGE);
  await setCookie(tab, "outside");
  gBrowser.pinTab(tab);

  const work = await createSpace("Work");
  gZenWorkspaces.moveTabToWorkspace(tab, work.uuid);
  await waitForGuard();

  const moved = tabsWithUrl(OTHER_PAGE).find(
    t => t.getAttribute("zen-workspace-id") === work.uuid
  );
  Assert.ok(moved, "The page is in the isolated space");
  Assert.ok(!tab.isConnected || tab.closing, "The old tab is gone");
  Assert.equal(
    moved.userContextId,
    work.containerTabId,
    "in the space's container"
  );
  Assert.ok(moved.pinned, "It stays pinned");

  await gZenWorkspaces.changeWorkspace(work);
  gBrowser.selectedTab = moved;
  await TestUtils.waitForCondition(
    () =>
      moved.linkedBrowser.currentURI.spec === OTHER_PAGE &&
      !moved.hasAttribute("pending"),
    "The moved tab restores"
  );
  await BrowserTestUtils.browserLoaded(moved.linkedBrowser).catch(() => {});
  Assert.ok(moved.linkedBrowser.canGoBack, "Its history came along");
  Assert.ok(
    !(await readCookie(moved)).includes("peppermint=outside"),
    "Cookies of the old container do not follow it"
  );

  gBrowser.unpinTab(moved);
  BrowserTestUtils.removeTab(moved);
  await gZenWorkspaces.changeWorkspace(start);
});

add_task(async function test_split_view_moves_together() {
  const work = await createSpace("Split target");
  await SpecialPowers.pushPrefEnv({
    set: [["peppermint.spaces.isolate-new", false]],
  });
  const source = await createSpace("Split source");
  await SpecialPowers.popPrefEnv();

  const left = await BrowserTestUtils.openNewForegroundTab(gBrowser, PAGE);
  const right = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    OTHER_PAGE
  );
  gZenViewSplitter.splitTabs([left, right], "vsep");
  await TestUtils.waitForCondition(
    () => left.splitView && right.splitView,
    "Split"
  );

  gZenWorkspaces.moveTabToWorkspace(left, work.uuid);
  await waitForGuard();

  const tabs = gBrowser.tabs.filter(
    t =>
      t.getAttribute("zen-workspace-id") === work.uuid &&
      !t.closing &&
      !t.hasAttribute("zen-empty-tab")
  );
  Assert.equal(tabs.length, 2, "Both panes reached the isolated space");
  for (const t of tabs) {
    Assert.equal(t.userContextId, work.containerTabId, "in its container");
  }
  Assert.ok(
    tabs.every(t => t.splitView),
    "and they are split again"
  );

  for (const t of tabs) {
    BrowserTestUtils.removeTab(t);
  }
  Assert.ok(source, "The source space stays");
});
