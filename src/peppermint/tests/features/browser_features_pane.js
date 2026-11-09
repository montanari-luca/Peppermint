/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { CATEGORIES, FEATURES, featureL10nIds } = ChromeUtils.importESModule(
  "moz-src:///peppermint/features/PeppermintFeatures.sys.mjs"
);
const { ZenKeyboardShortcuts } = ChromeUtils.importESModule(
  "resource:///modules/zen/kbs/ZenKeyboardShortcuts.sys.mjs"
);

async function openPane() {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:preferences#zenPeppermint"
  );
  const win = tab.linkedBrowser.contentWindow;
  await TestUtils.waitForCondition(
    () => win.gPeppermintFeaturesPane?._initialized,
    "The features pane is built"
  );
  await win.document.l10n.ready;
  return { tab, win, doc: win.document };
}

async function search(win, query) {
  const input = win.document.getElementById("searchInput");
  input.focus();
  const done = BrowserTestUtils.waitForEvent(
    win,
    "PreferencesSearchCompleted",
    event => event.detail == query
  );
  input.value = query;
  input.dispatchEvent(new win.Event("input", { bubbles: true }));
  await done;
}

add_task(async function test_registry_is_complete() {
  const ids = new Set();
  const l10n = new Localization(["browser/preferences/zen-preferences.ftl"]);
  for (const feature of FEATURES) {
    ok(!ids.has(feature.id), `${feature.id} is listed once`);
    ids.add(feature.id);
    ok(CATEGORIES.includes(feature.category), `${feature.id} has a category`);
    if (feature.pref) {
      Assert.equal(
        Services.prefs.getPrefType(feature.pref),
        Services.prefs.PREF_BOOL,
        `${feature.pref} is a boolean`
      );
    }
    const messages = await l10n.formatValues(
      Object.values(featureL10nIds(feature)).map(id => ({ id }))
    );
    for (const message of messages) {
      ok(message, `${feature.id} has all its messages`);
    }
  }
});

add_task(async function test_pane_lists_every_feature() {
  const { tab, doc } = await openPane();
  const rows = doc.querySelectorAll(".peppermint-feature");
  Assert.equal(rows.length, FEATURES.length, "One row per feature");
  for (const feature of FEATURES) {
    const row = doc.querySelector(
      `.peppermint-feature[data-feature="${feature.id}"]`
    );
    Assert.equal(
      row.closest("groupbox").id,
      `peppermintFeatures-${feature.category}`,
      `${feature.id} is in its category`
    );
    const chip = row.querySelector(".peppermint-feature-shortcut");
    const shortcut = feature.command
      ? ZenKeyboardShortcuts.getShortcutDisplayFromCommand(
          window,
          feature.command
        )
      : null;
    info(`${feature.id} shortcut: ${shortcut}`);
    Assert.equal(
      chip && !chip.hidden ? chip.textContent : null,
      shortcut,
      `${feature.id} shows its live shortcut`
    );
    const toggle = row.querySelector("moz-toggle");
    Assert.equal(!!toggle, !!feature.pref, `${feature.id} has a switch`);
    if (toggle) {
      Assert.equal(
        toggle.pressed,
        Services.prefs.getBoolPref(feature.pref),
        `${feature.id} switch shows the pref`
      );
    }
  }
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_switch_follows_and_sets_the_pref() {
  const pref = "peppermint.tabs.islands.enabled";
  await SpecialPowers.pushPrefEnv({ set: [[pref, true]] });
  const { tab, doc } = await openPane();
  const toggle = doc.querySelector(
    '.peppermint-feature[data-feature="tab-islands"] moz-toggle'
  );
  await toggle.updateComplete;
  ok(toggle.pressed, "On to start with");

  toggle.buttonEl.click();
  await TestUtils.waitForCondition(
    () => !Services.prefs.getBoolPref(pref),
    "Clicking the switch turns the feature off"
  );

  Services.prefs.setBoolPref(pref, true);
  ok(toggle.pressed, "The switch follows a change made elsewhere");
  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_search_matches_keywords() {
  const { tab, win, doc } = await openPane();
  // "ublock" appears only in the ad blocker's keywords.
  await search(win, "ublock");
  ok(
    BrowserTestUtils.isVisible(
      doc.getElementById("peppermintFeatures-privacy")
    ),
    "The group with the ad blocker is a result"
  );
  ok(
    !BrowserTestUtils.isVisible(doc.getElementById("peppermintFeatures-tools")),
    "Other feature groups are not"
  );
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_settings_nav_keeps_its_names() {
  const { tab, win, doc } = await openPane();
  const button = doc.getElementById("category-zen-peppermint");
  await button.updateComplete;
  const label = button.shadowRoot.querySelector("slot:not([name])");
  const shown = () => win.getComputedStyle(label).display != "none";
  const { outerWidth, outerHeight } = window;
  const resizeTo = async width => {
    const resized = BrowserTestUtils.waitForEvent(win, "resize");
    window.resizeTo(width, outerHeight);
    await resized;
  };

  // Firefox shows only icons below 950px.
  await resizeTo(900);
  Assert.less(win.innerWidth, 950, "Narrower than Firefox's limit");
  ok(shown(), "The category names stay at a usual settings width");

  await resizeTo(500);
  ok(!shown(), "Only icons when there is no room for the names");

  await resizeTo(outerWidth);
  BrowserTestUtils.removeTab(tab);
});
