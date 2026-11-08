/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { TabStateFlusher } = ChromeUtils.importESModule(
  "moz-src:///browser/components/sessionstore/TabStateFlusher.sys.mjs"
);

const PREF = "peppermint.tabs.undo-close-toast";
const MESSAGE_ID = "peppermint-undo-close-toast";
const PAGE = "https://example.com/";

function toast() {
  const container = document.getElementById("zen-toast-container");
  return [...container.children].find(child => child._messageId == MESSAGE_ID);
}

function clearToasts() {
  document.getElementById("zen-toast-container").replaceChildren();
}

async function openPages(count) {
  const tabs = [];
  for (let i = 0; i < count; i++) {
    const tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      `${PAGE}?page=${i}`
    );
    await TabStateFlusher.flush(tab.linkedBrowser);
    tabs.push(tab);
  }
  return tabs;
}

async function waitForToast() {
  await TestUtils.waitForCondition(toast, "The undo toast shows");
  const label = toast().querySelector("label");
  await TestUtils.waitForCondition(
    () => label.textContent,
    "The toast is translated"
  );
  return toast();
}

async function settle() {
  await new Promise(resolve => setTimeout(resolve, 200));
}

// Closing tabs shows its toast a task later, so this waits before clearing.
async function closePagesAndToasts() {
  for (const tab of gBrowser.tabs.filter(t =>
    t.linkedBrowser.currentURI.spec.startsWith(PAGE)
  )) {
    BrowserTestUtils.removeTab(tab);
  }
  await settle();
  clearToasts();
}

function openPageCount() {
  return gBrowser.tabs.filter(tab =>
    tab.linkedBrowser.currentURI.spec.startsWith(PAGE)
  ).length;
}

add_setup(async function () {
  Assert.ok(
    Services.prefs.getDefaultBranch("").getBoolPref(PREF),
    "On by default"
  );
  registerCleanupFunction(clearToasts);
});

add_task(async function test_undo_reopens_one_tab() {
  clearToasts();
  const [tab] = await openPages(1);
  BrowserTestUtils.removeTab(tab);
  const shown = await waitForToast();
  Assert.equal(
    shown.querySelector("label").textContent,
    "Tab closed",
    "It says one tab closed"
  );
  const button = shown.querySelector("#peppermint-undo-close-button");
  await TestUtils.waitForCondition(
    () => button.getAttribute("label") == "Undo",
    "The button is labelled"
  );

  const restored = BrowserTestUtils.waitForEvent(
    gBrowser.tabContainer,
    "SSTabRestored"
  );
  button.doCommand();
  await restored;
  Assert.equal(openPageCount(), 1, "The tab is back");
  ok(!toast(), "The toast is gone");
  await closePagesAndToasts();
});

add_task(async function test_tabs_closed_together_share_a_toast() {
  clearToasts();
  const tabs = await openPages(2);
  gBrowser.removeTabs(tabs, { animate: false });
  const shown = await waitForToast();
  await TestUtils.waitForCondition(
    () => shown.querySelector("label").textContent == "2 tabs closed",
    "It counts both tabs"
  );

  shown.querySelector("#peppermint-undo-close-button").doCommand();
  await TestUtils.waitForCondition(
    () => openPageCount() == 2,
    "Both tabs are back"
  );
  await closePagesAndToasts();
});

add_task(async function test_nothing_to_undo_shows_nothing() {
  clearToasts();
  const [archived] = await openPages(1);
  gBrowser.removeTab(archived, { animate: false, skipSessionStore: true });
  await settle();
  ok(!toast(), "No toast for a tab SessionStore did not keep");

  const blank = BrowserTestUtils.addTab(gBrowser, "about:blank");
  BrowserTestUtils.removeTab(blank);
  await settle();
  ok(!toast(), "No toast for a blank tab");
});

add_task(async function test_off() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF, false]] });
  clearToasts();
  const [tab] = await openPages(1);
  BrowserTestUtils.removeTab(tab);
  await settle();
  ok(!toast(), "No toast while the pref is off");
  await SpecialPowers.popPrefEnv();
  clearToasts();
});

add_task(async function test_undo_after_a_manual_reopen_does_nothing() {
  clearToasts();
  const { PeppermintUndoClose } = ChromeUtils.importESModule(
    "moz-src:///peppermint/undo-close/PeppermintUndoClose.sys.mjs"
  );
  const { SessionStore } = ChromeUtils.importESModule(
    "moz-src:///browser/components/sessionstore/SessionStore.sys.mjs"
  );
  const [tab] = await openPages(1);
  BrowserTestUtils.removeTab(tab);
  await waitForToast();
  const closedId = SessionStore.getClosedTabDataForWindow(window)[0].closedId;
  SessionStore.undoCloseTab(window, 0);
  ok(
    !PeppermintUndoClose.undo(window, closedId),
    "The toast's undo finds its tabs already reopened"
  );
  await closePagesAndToasts();
});
