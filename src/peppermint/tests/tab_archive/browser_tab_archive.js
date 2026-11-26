/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { isArchivable } = ChromeUtils.importESModule(
  "moz-src:///peppermint/common/PeppermintTabs.sys.mjs"
);
const {
  PREF_NEVER,
  archiveIdleTabs,
  archiveTab,
  canArchiveByHand,
  restoreRecord,
  snoozeTab,
  snoozeTime,
} = ChromeUtils.importESModule(
  "moz-src:///peppermint/tab-archive/PeppermintTabArchive.sys.mjs"
);
const {
  clearRecords,
  dueSnoozes,
  getRecord,
  listRecords,
  flushStore,
  nextWakeTime,
  pickEvictions,
  removeRecord,
  resetStoreForTests,
} = ChromeUtils.importESModule(
  "moz-src:///peppermint/tab-archive/PeppermintTabArchiveStore.sys.mjs"
);
const { SessionStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/sessionstore/SessionStore.sys.mjs"
);
const { TabStateFlusher } = ChromeUtils.importESModule(
  "moz-src:///browser/components/sessionstore/TabStateFlusher.sys.mjs"
);

const PAGE = "https://example.com/";
const HOUR = 60 * 60 * 1000;

async function openBackgroundTab(url) {
  const tab = BrowserTestUtils.addTab(gBrowser, url);
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser, false, url);
  await TestUtils.waitForCondition(
    () => !tab.hasAttribute("busy"),
    "background tab finished loading"
  );
  return tab;
}

function protectOtherTabs(target) {
  const saved = [];
  for (const tab of gBrowser.tabs) {
    if (tab !== target) {
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

async function resetRecords() {
  await clearRecords("archive");
  await clearRecords("snooze");
}

add_setup(async function () {
  await resetRecords();
  registerCleanupFunction(resetRecords);
});

add_task(function test_snooze_times() {
  // Wednesday 2026-10-28 15:30 local time.
  const now = new Date(2026, 9, 28, 15, 30).getTime();
  Assert.equal(snoozeTime(now, "later"), now + 3 * HOUR, "Three hours later");
  Assert.equal(
    snoozeTime(now, "tomorrow"),
    new Date(2026, 9, 29, 9, 0).getTime(),
    "Tomorrow at nine"
  );
  Assert.equal(
    snoozeTime(now, "next-week"),
    new Date(2026, 10, 2, 9, 0).getTime(),
    "Next Monday at nine"
  );
  const monday = new Date(2026, 9, 26, 8, 0).getTime();
  Assert.equal(
    snoozeTime(monday, "next-week"),
    new Date(2026, 10, 2, 9, 0).getTime(),
    "On a Monday it is the Monday after"
  );
});

add_task(function test_evictions_spare_snoozed_tabs() {
  const records = [
    { id: "a", kind: "archive", archivedAt: 3 },
    { id: "b", kind: "archive", archivedAt: 1 },
    { id: "c", kind: "snooze", archivedAt: 0, wakeAt: 5 },
    { id: "d", kind: "archive", archivedAt: 2 },
  ];
  Assert.deepEqual(pickEvictions(records, 2), ["b"], "Oldest archived goes");
  Assert.deepEqual(pickEvictions(records, 0), ["b", "d", "a"]);
  Assert.deepEqual(pickEvictions(records, 5), []);
});

add_task(async function test_archivable_rules() {
  const tab = await openBackgroundTab(PAGE);
  try {
    Assert.ok(isArchivable(tab, gBrowser.selectedTab), "A plain tab is fine");
    Assert.ok(!isArchivable(tab, tab), "The selected tab stays");
    tab.setAttribute("zen-essential", "true");
    Assert.ok(!isArchivable(tab, null), "Essentials stay");
    tab.removeAttribute("zen-essential");
    gBrowser.pinTab(tab);
    Assert.ok(!isArchivable(tab, null), "Pinned tabs stay");
    gBrowser.unpinTab(tab);
    Assert.ok(isArchivable(tab, null), "Unpinned again");
  } finally {
    BrowserTestUtils.removeTab(tab);
  }
  const blank = await openBackgroundTab("about:blank");
  Assert.ok(!isArchivable(blank, null), "Only web pages are archived");
  BrowserTestUtils.removeTab(blank);
});

add_task(async function test_archive_and_restore() {
  const tab = await openBackgroundTab(PAGE);
  const closedBefore = SessionStore.getClosedTabCountForWindow(window);
  const tabsBefore = gBrowser.tabs.length;

  Assert.ok(canArchiveByHand(window, tab));
  const record = await archiveTab(window, tab);
  Assert.ok(record, "A record was made");
  Assert.equal(record.kind, "archive");
  Assert.equal(record.url, PAGE);
  Assert.equal(gBrowser.tabs.length, tabsBefore - 1, "The tab was closed");
  Assert.equal(
    SessionStore.getClosedTabCountForWindow(window),
    closedBefore,
    "Recently closed tabs are left alone"
  );
  Assert.equal((await getRecord(record.id)).url, PAGE, "It is in the store");

  const restored = await restoreRecord(record.id, window, { select: false });
  Assert.ok(restored, "The tab came back");
  await TestUtils.waitForCondition(
    () => restored.linkedBrowser.currentURI.spec == PAGE,
    "the restored tab opened the page"
  );
  Assert.equal(await getRecord(record.id), null, "The record is gone");
  BrowserTestUtils.removeTab(restored);
});

add_task(async function test_idle_sweep() {
  const idle = await openBackgroundTab(PAGE);
  const fresh = await openBackgroundTab("https://example.org/");
  const restore = protectOtherTabs(idle);
  try {
    idle._lastAccessed = Date.now() - 100 * HOUR;
    fresh._lastAccessed = Date.now() - HOUR;
    Assert.equal(await archiveIdleTabs(72), 1, "One tab sat idle long enough");
    Assert.ok(!idle.isConnected, "The idle tab was archived");
    Assert.ok(fresh.isConnected, "A recent tab stays");
    Assert.equal(await archiveIdleTabs(0), 0, "Zero hours turns it off");
  } finally {
    restore();
    BrowserTestUtils.removeTab(fresh);
    await resetRecords();
  }
});

add_task(async function test_snooze_and_wake() {
  const tab = await openBackgroundTab(PAGE);
  const wakeAt = Date.now() + HOUR;
  const record = await snoozeTab(window, tab, wakeAt);
  Assert.equal(record.kind, "snooze");
  Assert.equal(await nextWakeTime(), wakeAt, "The next wake time is known");
  Assert.equal((await dueSnoozes(Date.now())).length, 0, "Not due yet");
  Assert.equal(
    (await dueSnoozes(wakeAt + 1)).map(r => r.id)[0],
    record.id,
    "Due once the time has come"
  );
  await removeRecord(record.id);
  Assert.equal(await nextWakeTime(), null, "Nothing left to wake");
});

add_task(async function test_private_windows_are_left_alone() {
  const privateWindow = await BrowserTestUtils.openNewBrowserWindow({
    private: true,
  });
  try {
    const tab = BrowserTestUtils.addTab(privateWindow.gBrowser, PAGE);
    await BrowserTestUtils.browserLoaded(tab.linkedBrowser, false, PAGE);
    Assert.ok(!canArchiveByHand(privateWindow, tab), "Not by hand");
    Assert.equal(await archiveTab(privateWindow, tab), null);
    Assert.equal((await listRecords()).length, 0, "Nothing was stored");
  } finally {
    await BrowserTestUtils.closeWindow(privateWindow);
  }
});

add_task(async function test_restore_brings_back_history() {
  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, PAGE);
  for (const url of [`${PAGE}?second`, `${PAGE}?third`]) {
    BrowserTestUtils.startLoadingURIString(tab.linkedBrowser, url);
    await BrowserTestUtils.browserLoaded(tab.linkedBrowser, false, url);
  }
  await TabStateFlusher.flush(tab.linkedBrowser);
  const record = await archiveTab(window, tab);
  Assert.ok(record?.state, "The archive keeps the tab's session state");
  Assert.equal(record.state.entries.length, 3, "With its history");

  const restored = await restoreRecord(record.id, window);
  try {
    await TestUtils.waitForCondition(
      () =>
        restored.linkedBrowser.currentURI?.spec == `${PAGE}?third` &&
        !restored.hasAttribute("busy"),
      "The restored tab shows the page it was on"
    );
    const state = JSON.parse(SessionStore.getTabState(restored));
    Assert.equal(state.entries.length, 3, "The back history came back");
    Assert.equal(state.index, 3, "On the same page");
    Assert.ok(!restored.pinned, "As a plain tab");
    Assert.equal(
      restored.getAttribute("zen-workspace-id"),
      record.workspaceId,
      "In its Space"
    );
  } finally {
    BrowserTestUtils.removeTab(restored);
  }
});

add_task(async function test_never_archive_list() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF_NEVER, "example.com"]] });
  const tab = await openBackgroundTab(`${PAGE}?never`);
  tab._lastAccessed = Date.now() - 100 * HOUR;
  const restore = protectOtherTabs(tab);
  try {
    Assert.equal(await archiveIdleTabs(1), 0, "A listed site is not archived");
    Assert.ok(!tab.closing, "Its tab stays open");
    const record = await archiveTab(window, tab);
    Assert.ok(record, "It can still be archived by hand");
    await removeRecord(record.id);
  } finally {
    restore();
    if (!tab.closing && tab.parentNode) {
      BrowserTestUtils.removeTab(tab);
    }
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_old_archive_file_is_moved() {
  await flushStore();
  const oldPath = PathUtils.join(PathUtils.profileDir, "tab-archive.json");
  const newPath = PathUtils.join(PathUtils.profileDir, "tab-archive.jsonlz4");
  await IOUtils.remove(newPath, { ignoreAbsent: true });
  await IOUtils.writeJSON(oldPath, {
    version: 1,
    records: [
      {
        id: "old-record",
        kind: "archive",
        url: PAGE,
        title: "Old",
        archivedAt: 1,
      },
    ],
  });
  resetStoreForTests();
  Assert.ok(await getRecord("old-record"), "Records of the old file are read");
  await flushStore();
  Assert.ok(await IOUtils.exists(newPath), "They are written to the new file");
  Assert.ok(!(await IOUtils.exists(oldPath)), "The old file is removed");
  await removeRecord("old-record");
  await flushStore();
});
