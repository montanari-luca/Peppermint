/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { PeppermintGlance } = ChromeUtils.importESModule(
  "moz-src:///peppermint/common/PeppermintGlance.sys.mjs"
);

const METHOD = "zen.glance.activation-method";
const PREVIOUS = "peppermint.glance.previous-activation-method";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      [METHOD, "alt"],
      [PREVIOUS, ""],
    ],
  });
});

add_task(function test_toggle_remembers_the_method() {
  ok(PeppermintGlance.enabled, "Glance is on while it has a method");
  PeppermintGlance.enabled = false;
  Assert.equal(
    Services.prefs.getStringPref(METHOD),
    "none",
    "Off is the none method"
  );
  Assert.equal(
    PeppermintGlance.methodWhenOn,
    "alt",
    "The method is remembered"
  );
  PeppermintGlance.enabled = true;
  Assert.equal(
    Services.prefs.getStringPref(METHOD),
    "alt",
    "On restores the method"
  );
});

add_task(function test_turning_on_without_a_remembered_method() {
  Services.prefs.setStringPref(METHOD, "none");
  Services.prefs.setStringPref(PREVIOUS, "");
  PeppermintGlance.enabled = true;
  const method = Services.prefs.getStringPref(METHOD);
  Assert.notEqual(method, "none", "Glance is on again");
  Assert.equal(
    method,
    Services.prefs.getDefaultBranch("").getStringPref(METHOD),
    "It falls back to the default method"
  );
  Services.prefs.setStringPref(METHOD, "alt");
});

add_task(async function test_settings_checkbox_follows_the_method() {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:preferences#zenSpacesTabs"
  );
  try {
    const browser = tab.linkedBrowser;
    const read = () =>
      SpecialPowers.spawn(browser, [], async () => {
        const doc = content.document;
        await ContentTaskUtils.waitForCondition(
          () => doc.getElementById("zenLooksAndFeelGlanceEnabled"),
          "the Glance checkbox is there"
        );
        const trigger = doc.getElementById("zenGlanceTrigger");
        return {
          checked: doc.getElementById("zenLooksAndFeelGlanceEnabled").checked,
          trigger: trigger.value,
          triggerDisabled: trigger.disabled,
        };
      });

    let state = await read();
    ok(state.checked, "The checkbox is on while Glance has a method");
    Assert.equal(state.trigger, "alt", "The trigger shows the method");
    ok(!state.triggerDisabled, "The trigger can be changed");

    await SpecialPowers.spawn(browser, [], () => {
      content.document.getElementById("zenLooksAndFeelGlanceEnabled").click();
    });
    await TestUtils.waitForCondition(
      () => Services.prefs.getStringPref(METHOD) == "none",
      "unchecking turns Glance off"
    );
    state = await read();
    ok(!state.checked, "The checkbox is off");
    Assert.equal(
      state.trigger,
      "alt",
      "The trigger keeps the remembered method"
    );
    ok(state.triggerDisabled, "The trigger is disabled while Glance is off");

    await SpecialPowers.spawn(browser, [], () => {
      content.document.getElementById("zenLooksAndFeelGlanceEnabled").click();
    });
    await TestUtils.waitForCondition(
      () => Services.prefs.getStringPref(METHOD) == "alt",
      "checking restores the method"
    );
  } finally {
    BrowserTestUtils.removeTab(tab);
  }
});
