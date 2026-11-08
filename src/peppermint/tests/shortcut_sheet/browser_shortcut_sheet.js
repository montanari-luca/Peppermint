/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { collectShortcuts, filterItems } = ChromeUtils.importESModule(
  "moz-src:///peppermint/shortcut-sheet/PeppermintShortcutSheet.sys.mjs"
);
const { ShortcutUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/ShortcutUtils.sys.mjs"
);

const PANEL_ID = "peppermint-shortcut-sheet";

function sheetShortcut() {
  return ShortcutUtils.prettifyShortcut(
    document.getElementById("key_peppermintShortcutSheet")
  );
}

async function openSheet() {
  const shown = BrowserTestUtils.waitForEvent(document, "popupshown", false, e =>
    e.target.id == PANEL_ID
  );
  EventUtils.synthesizeKey("/", { accelKey: true });
  await shown;
  return document.getElementById(PANEL_ID);
}

add_task(async function test_collects_bound_shortcuts() {
  const categories = await collectShortcuts(window);
  ok(categories.length > 3, "Several categories");
  for (const category of categories) {
    ok(category.title, "Every category has a name");
    ok(!category.title.startsWith("customkeys-"), "Names are translated");
    for (const item of category.items) {
      ok(item.shortcuts.length, `${item.title} has a shortcut`);
      ok(!item.title.startsWith("customkeys-"), "Titles are translated");
    }
  }
  const items = categories.flatMap(category => category.items);
  ok(
    items.some(item => item.shortcuts.includes(sheetShortcut())),
    "The sheet lists its own shortcut"
  );
});

add_task(async function test_follows_a_rebound_key() {
  const key = document.getElementById("key_peppermintShortcutSheet");
  const original = key.getAttribute("key");
  key.setAttribute("key", "J");
  try {
    const items = (await collectShortcuts(window)).flatMap(c => c.items);
    ok(
      items.some(item => item.shortcuts.includes(sheetShortcut())),
      "The new binding is listed"
    );
  } finally {
    key.setAttribute("key", original);
  }
});

add_task(function test_filter() {
  const category = {
    title: "Tabs",
    items: [
      { title: "Close Tab", shortcuts: ["⌘W"] },
      { title: "New Tab", shortcuts: ["⌘T"] },
    ],
  };
  Assert.equal(filterItems(category, "").length, 2, "No query keeps all");
  Assert.equal(filterItems(category, "tabs").length, 2, "Category name");
  Assert.deepEqual(
    filterItems(category, "close").map(item => item.title),
    ["Close Tab"],
    "Item name"
  );
  Assert.deepEqual(
    filterItems(category, "⌘t").map(item => item.title),
    ["New Tab"],
    "Shortcut text"
  );
  Assert.equal(filterItems(category, "zzz").length, 0, "No match");
});

add_task(async function test_shortcut_opens_a_searchable_sheet() {
  const panel = await openSheet();
  const rows = () =>
    panel.querySelectorAll(".peppermint-shortcut-sheet-row").length;
  const all = rows();
  ok(all > 10, "The sheet lists shortcuts");
  Assert.equal(
    document.activeElement,
    panel.querySelector(".peppermint-shortcut-sheet-search"),
    "The search field has focus"
  );

  EventUtils.sendString("zzzz-no-such-shortcut");
  Assert.equal(rows(), 0, "Nothing matches nonsense");
  ok(
    !panel.querySelector(".peppermint-shortcut-sheet-empty").hidden,
    "It says so"
  );

  const hidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
  EventUtils.synthesizeKey("KEY_Escape");
  await hidden;

  const reopened = await openSheet();
  Assert.equal(rows(), all, "Reopening clears the search");
  const hiddenAgain = BrowserTestUtils.waitForEvent(reopened, "popuphidden");
  reopened.hidePopup();
  await hiddenAgain;
});
