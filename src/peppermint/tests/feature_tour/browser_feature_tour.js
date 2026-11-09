/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { FEATURES, GENERATION, newFeatures } = ChromeUtils.importESModule(
  "moz-src:///peppermint/features/PeppermintFeatures.sys.mjs"
);
const { PREFS, PeppermintFeatureTour } = ChromeUtils.importESModule(
  "moz-src:///peppermint/feature-tour/PeppermintFeatureTour.sys.mjs"
);

const BUTTON_ID = "peppermint-feature-tour-button";

function findToast(messageId) {
  return [...document.getElementById("zen-toast-container").children].find(
    toast => toast._messageId == messageId
  );
}

function setGenerations({ seen, announced }) {
  Services.prefs.setIntPref(PREFS.seen, seen);
  Services.prefs.setIntPref(PREFS.announced, announced);
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["peppermint.features.tour.enabled", true]],
  });
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref(PREFS.seen);
    Services.prefs.clearUserPref(PREFS.announced);
    document.getElementById("zen-toast-container").replaceChildren();
  });
});

add_task(function test_generations() {
  Assert.greater(GENERATION, 1, "Some features arrived after the first");
  for (const feature of FEATURES) {
    Assert.lessOrEqual(
      feature.added ?? 1,
      GENERATION,
      `${feature.id} is not from a future generation`
    );
  }
  Assert.equal(newFeatures(GENERATION).length, 0, "Nothing is newer");
  Assert.ok(
    newFeatures(GENERATION - 1).some(feature => feature.id == "startup-doctor"),
    "The newest features are listed"
  );
  Assert.ok(
    !newFeatures(1).some(feature => feature.id == "vault"),
    "Older features are not"
  );
});

add_task(function test_what_is_due() {
  setGenerations({ seen: 1, announced: 1 });
  Assert.deepEqual(
    PeppermintFeatureTour.pending({ newProfile: true }),
    { kind: "discover", count: FEATURES.length },
    "A new profile hears about every feature"
  );
  Assert.deepEqual(
    PeppermintFeatureTour.pending({ newProfile: false }),
    { kind: "new", count: newFeatures(1).length },
    "An update hears about the new ones"
  );
  setGenerations({ seen: GENERATION, announced: 1 });
  Assert.equal(
    PeppermintFeatureTour.pending({ newProfile: false }),
    null,
    "Nothing to announce once the pane has shown them"
  );
  setGenerations({ seen: 1, announced: GENERATION });
  Assert.equal(
    PeppermintFeatureTour.pending({ newProfile: false }),
    null,
    "Announced only once"
  );
  Services.prefs.setBoolPref("peppermint.features.tour.enabled", false);
  setGenerations({ seen: 1, announced: 1 });
  Assert.equal(
    PeppermintFeatureTour.pending({ newProfile: true }),
    null,
    "Nothing when turned off"
  );
  Services.prefs.setBoolPref("peppermint.features.tour.enabled", true);
});

add_task(async function test_update_toast_opens_the_pane() {
  setGenerations({ seen: 1, announced: 1 });
  const shown = await PeppermintFeatureTour.maybeShow(window);
  Assert.equal(shown?.kind, "new");
  Assert.equal(
    Services.prefs.getIntPref(PREFS.announced),
    GENERATION,
    "Remembers the announcement"
  );
  Assert.equal(
    Services.prefs.getIntPref(PREFS.seen),
    1,
    "The new features stay marked until the pane is opened"
  );
  Assert.equal(
    await PeppermintFeatureTour.maybeShow(window),
    null,
    "Not shown twice"
  );

  const toast = findToast("peppermint-feature-tour-new");
  Assert.ok(toast, "The toast is shown");
  Assert.deepEqual(
    document.l10n.getAttributes(toast.querySelector("label")).args,
    { count: newFeatures(1).length },
    "Says how many features are new"
  );
  const button = toast.querySelector(`#${BUTTON_ID}`);
  Assert.equal(
    document.l10n.getAttributes(button).id,
    BUTTON_ID,
    "The button has a written label"
  );

  const opened = BrowserTestUtils.waitForNewTab(
    gBrowser,
    url => url.startsWith("about:preferences"),
    true
  );
  button.doCommand();
  const tab = await opened;
  Assert.ok(!findToast("peppermint-feature-tour-new"), "The toast closes");
  const win = tab.linkedBrowser.contentWindow;
  await TestUtils.waitForCondition(
    () => win.gPeppermintFeaturesPane?._initialized,
    "The features pane is built"
  );
  Assert.equal(win.location.hash, "#zenPeppermint", "Opens the features pane");

  const row = id =>
    win.document.querySelector(`.peppermint-feature[data-feature="${id}"]`);
  Assert.ok(
    row("startup-doctor").querySelector(".peppermint-feature-new"),
    "A new feature is marked New"
  );
  Assert.ok(
    !row("vault").querySelector(".peppermint-feature-new"),
    "An older feature is not"
  );
  await TestUtils.waitForCondition(
    () => Services.prefs.getIntPref(PREFS.seen) == GENERATION,
    "Showing the pane counts the features as seen"
  );
  BrowserTestUtils.removeTab(tab);

  const again = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:preferences#zenPeppermint"
  );
  const againWin = again.linkedBrowser.contentWindow;
  await TestUtils.waitForCondition(
    () => againWin.gPeppermintFeaturesPane?._initialized,
    "The features pane is built again"
  );
  Assert.ok(
    !againWin.document.querySelector(".peppermint-feature-new"),
    "Nothing is marked New the next time"
  );
  BrowserTestUtils.removeTab(again);
});

add_task(async function test_new_profile_toast() {
  setGenerations({ seen: 1, announced: 1 });
  const shown = await PeppermintFeatureTour.maybeShow(window, {
    newProfile: true,
  });
  Assert.equal(shown?.kind, "discover");
  Assert.ok(
    findToast("peppermint-feature-tour-discover"),
    "The toast is shown"
  );
  Assert.equal(
    Services.prefs.getIntPref(PREFS.seen),
    GENERATION,
    "Nothing is marked New on a new profile"
  );
  Assert.equal(Services.prefs.getIntPref(PREFS.announced), GENERATION);
  findToast("peppermint-feature-tour-discover").remove();
});
