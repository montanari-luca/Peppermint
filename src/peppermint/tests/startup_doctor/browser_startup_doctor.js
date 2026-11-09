/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const {
  HEAVY_MODS_BYTES,
  LAUNCHES,
  PeppermintStartupDoctor,
  SLOW_FEATURE_MS,
  collectStartup,
  median,
  setStorePathForTests,
} = ChromeUtils.importESModule(
  "moz-src:///peppermint/startup-doctor/PeppermintStartupDoctor.sys.mjs"
);

const RESTORE_PREF = "browser.sessionstore.restore_on_demand";
const VAULT_PREF = "peppermint.vault.enabled";
const MODS_FILE = PathUtils.join(PathUtils.profileDir, "zen-themes.json");
const MOD_ID = "peppermint-startup-test-mod";
const MOD_DIR = PathUtils.join(
  PathUtils.profileDir,
  "chrome",
  "zen-themes",
  MOD_ID
);

let gModsBackup = null;

function useNewStore() {
  setStorePathForTests(
    PathUtils.join(PathUtils.tempDir, `peppermint-startup-${Date.now()}.json`)
  );
}

async function addHeavyMod() {
  gModsBackup = (await IOUtils.exists(MODS_FILE))
    ? await IOUtils.readUTF8(MODS_FILE)
    : null;
  await IOUtils.writeJSON(MODS_FILE, {
    [MOD_ID]: { id: MOD_ID, name: "Heavy Test Mod", enabled: true },
  });
  await IOUtils.makeDirectory(MOD_DIR, { ignoreExisting: true });
  await IOUtils.writeUTF8(
    PathUtils.join(MOD_DIR, "chrome.css"),
    "a{}".repeat(HEAVY_MODS_BYTES / 3 + 10)
  );
}

async function removeHeavyMod() {
  await IOUtils.remove(MOD_DIR, { recursive: true, ignoreAbsent: true });
  if (gModsBackup == null) {
    await IOUtils.remove(MODS_FILE, { ignoreAbsent: true });
  } else {
    await IOUtils.writeUTF8(MODS_FILE, gModsBackup);
  }
  gModsBackup = null;
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["peppermint.startup-doctor.enabled", true],
      [RESTORE_PREF, true],
      [VAULT_PREF, true],
    ],
  });
  registerCleanupFunction(async () => {
    setStorePathForTests(null);
    await removeHeavyMod();
  });
});

add_task(async function test_this_launch_was_recorded() {
  await TestUtils.waitForCondition(
    async () => (await PeppermintStartupDoctor.launches()).length,
    "The launch that started this test run is recorded"
  );
  const launch = (await PeppermintStartupDoctor.launches()).at(-1);
  Assert.greater(launch.firstPaintMs, 0, "Knows when the window appeared");
  Assert.ok("PeppermintVault" in launch.features, "Times each feature");
  Assert.ok(
    !("PeppermintStartupDoctor" in launch.features),
    "Leaves its own start out"
  );
  Assert.greaterOrEqual(launch.peppermintMs, launch.features.PeppermintVault);

  let ran = false;
  PeppermintStartupDoctor.measure("Later window", () => (ran = true));
  Assert.ok(ran, "Features in later windows still start");
  Assert.ok(
    !(
      "Later window" in
      (await PeppermintStartupDoctor.launches()).at(-1).features
    ),
    "Only the first window is timed"
  );
});

add_task(function test_median() {
  Assert.equal(median([]), null);
  Assert.equal(median([5]), 5);
  Assert.equal(median([9, 1, 5]), 5);
  Assert.equal(median([1, 2, 3, 10]), 3, "Even counts take the middle two");
  Assert.equal(median([null, 4, undefined]), 4, "Missing values are skipped");
});

add_task(async function test_keeps_the_last_launches() {
  useNewStore();
  for (let i = 0; i < LAUNCHES + 3; i++) {
    await PeppermintStartupDoctor.recordLaunch({
      when: i,
      firstPaintMs: 1000 + i,
      restoredMs: 2000,
      features: { PeppermintVault: 3, broken: -1, PeppermintJanitor: "x" },
    });
  }
  let launches = await PeppermintStartupDoctor.launches();
  Assert.equal(launches.length, LAUNCHES, "Only the last launches are kept");
  Assert.equal(launches[0].when, 3, "The oldest are dropped");
  Assert.deepEqual(
    launches[0].features,
    { PeppermintVault: 3 },
    "Bad times are dropped"
  );

  // Read the file again, as the next launch would.
  const path = PathUtils.join(
    PathUtils.tempDir,
    `peppermint-startup-reread-${Date.now()}.json`
  );
  setStorePathForTests(path);
  await PeppermintStartupDoctor.recordLaunch({ firstPaintMs: 900 });
  setStorePathForTests(path);
  launches = await PeppermintStartupDoctor.launches();
  Assert.equal(launches.length, 1, "Launches survive a restart");
  Assert.equal(launches[0].firstPaintMs, 900);
  await IOUtils.remove(path);
});

add_task(async function test_collects_causes_and_fixes() {
  useNewStore();
  let startup = await collectStartup();
  Assert.equal(startup.launches, 0, "Nothing measured yet");
  Assert.equal(startup.typicalMs, null);

  for (const firstPaintMs of [800, 1200, 1000]) {
    await PeppermintStartupDoctor.recordLaunch({
      firstPaintMs,
      restoredMs: firstPaintMs + 500,
      features: {
        PeppermintVault: SLOW_FEATURE_MS * 2,
        PeppermintJanitor: 1,
        "Peppermint sidebar styles": 90,
      },
    });
  }
  startup = await collectStartup();
  Assert.equal(startup.launches, 3);
  Assert.equal(startup.lastMs, 1000, "The last launch");
  Assert.equal(startup.typicalMs, 1000, "The typical launch");
  Assert.equal(startup.restoredMs, 1500);
  Assert.equal(startup.peppermintMs, SLOW_FEATURE_MS * 2 + 91);
  Assert.deepEqual(
    startup.slowest.map(item => item.feature.id),
    ["vault", "janitor"],
    "Lists named features, slowest first"
  );
  Assert.ok(
    startup.tips.some(tip => tip.id == "feature" && tip.feature.id == "vault"),
    "Offers to turn off a slow feature"
  );
  Assert.ok(
    !startup.tips.some(tip => tip.id == "restore-on-demand"),
    "Restored tabs already load when selected"
  );

  await SpecialPowers.pushPrefEnv({
    set: [
      [VAULT_PREF, false],
      [RESTORE_PREF, false],
    ],
  });
  startup = await collectStartup();
  Assert.ok(
    !startup.tips.some(tip => tip.id == "feature"),
    "A feature that is already off is not suggested"
  );
  Assert.ok(
    startup.tips.some(tip => tip.id == "restore-on-demand"),
    "Suggests loading restored tabs when selected"
  );
  await SpecialPowers.popPrefEnv();

  await addHeavyMod();
  startup = await collectStartup();
  Assert.equal(startup.mods[0]?.id, MOD_ID, "Lists the mod");
  Assert.greaterOrEqual(startup.modBytes, HEAVY_MODS_BYTES);
  Assert.ok(
    startup.tips.some(tip => tip.id == "mods"),
    "Heavy mods are a cause"
  );
  await removeHeavyMod();
});

async function openReport() {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:report"
  );
  const doc = tab.linkedBrowser.contentDocument;
  await TestUtils.waitForCondition(() => {
    const section = doc.getElementById("report-startup");
    return (
      section &&
      !section.hidden &&
      doc.querySelector('[data-startup="typical"] .report-value')?.textContent
    );
  }, "The startup section is shown");
  return { tab, doc };
}

add_task(async function test_report_section_and_fixes() {
  useNewStore();
  await PeppermintStartupDoctor.recordLaunch({
    firstPaintMs: 1500,
    features: { PeppermintVault: SLOW_FEATURE_MS * 3, PeppermintJanitor: 2 },
  });
  await SpecialPowers.pushPrefEnv({ set: [[RESTORE_PREF, false]] });
  const { tab, doc } = await openReport();

  Assert.ok(
    !doc.getElementById("report-startup-measured").hidden,
    "Shows the times"
  );
  const rows = doc.querySelectorAll("#report-startup-slowest > li");
  Assert.equal(rows.length, 2, "One row per feature");
  Assert.equal(
    doc.l10n.getAttributes(rows[0].querySelector(".report-row-label")).id,
    "peppermint-feature-vault",
    "Named like the features page"
  );
  const turnOff = rows[0].querySelector('[data-action="turn-off"]');
  Assert.ok(turnOff, "The slow feature can be turned off");
  Assert.ok(
    !rows[1].querySelector("button"),
    "A quick feature has nothing to fix"
  );

  turnOff.click();
  await TestUtils.waitForCondition(
    () => !Services.prefs.getBoolPref(VAULT_PREF),
    "The feature is turned off"
  );
  await TestUtils.waitForCondition(
    () =>
      !doc.querySelector('#report-startup-slowest [data-action="turn-off"]'),
    "Nothing left to turn off"
  );

  const restore = doc.querySelector(
    '#report-startup-tips [data-action="restore-on-demand"]'
  );
  Assert.ok(restore, "Offers to load restored tabs when selected");
  restore.click();
  await TestUtils.waitForCondition(
    () => Services.prefs.getBoolPref(RESTORE_PREF),
    "Restored tabs load when selected"
  );
  await TestUtils.waitForCondition(
    () => !doc.getElementById("report-startup-no-tips").hidden,
    "Nothing else to do"
  );

  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
  Services.prefs.setBoolPref(VAULT_PREF, true);
});

add_task(async function test_report_before_any_launch_and_when_off() {
  useNewStore();
  let { tab, doc } = await openReport();
  Assert.ok(
    !doc.getElementById("report-startup-empty").hidden,
    "Asks for a restart first"
  );
  Assert.ok(doc.getElementById("report-startup-measured").hidden);
  BrowserTestUtils.removeTab(tab);

  await SpecialPowers.pushPrefEnv({
    set: [["peppermint.startup-doctor.enabled", false]],
  });
  tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:report");
  doc = tab.linkedBrowser.contentDocument;
  await TestUtils.waitForCondition(
    () =>
      doc.querySelector('[data-tile="trackers"] .report-value')?.textContent,
    "The report is shown"
  );
  await new Promise(resolve => doc.defaultView.requestIdleCallback(resolve));
  Assert.ok(
    doc.getElementById("report-startup").hidden,
    "No startup section when turned off"
  );
  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});
