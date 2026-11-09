/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { PeppermintPermissionAutoRevoke, PREFS, REASON } =
  ChromeUtils.importESModule(
    "moz-src:///peppermint/vault/PeppermintPermissionAutoRevoke.sys.mjs"
  );
const { PeppermintVaultPermissionLog } = ChromeUtils.importESModule(
  "moz-src:///peppermint/vault/PeppermintVaultPermissionLog.sys.mjs"
);
const { PlacesTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PlacesTestUtils.sys.mjs"
);

const DAY_MS = 24 * 60 * 60 * 1000;
const { ALLOW_ACTION, DENY_ACTION, EXPIRE_SESSION } = Ci.nsIPermissionManager;

function principal(origin) {
  return Services.scriptSecurityManager.createContentPrincipalFromOrigin(
    origin
  );
}

function grant(origin, type, { daysAgo = 0, capability = ALLOW_ACTION } = {}) {
  Services.perms.testAddFromPrincipalByTime(
    principal(origin),
    type,
    capability,
    Date.now() - daysAgo * DAY_MS
  );
}

function has(origin, type) {
  return !!Services.perms.getPermissionObject(principal(origin), type, true);
}

async function visit(url, daysAgo) {
  await PlacesTestUtils.addVisits({
    uri: url,
    visitDate: (Date.now() - daysAgo * DAY_MS) * 1000,
  });
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      [PREFS.enabled, true],
      [PREFS.days, 90],
      [PREFS.lastRun, 0],
    ],
  });
  registerCleanupFunction(async () => {
    Services.perms.removeAll();
    await PlacesUtils.history.clear();
  });
});

add_task(async function test_the_defaults() {
  const defaults = Services.prefs.getDefaultBranch("");
  Assert.ok(defaults.getBoolPref(PREFS.enabled), "On by default");
  Assert.equal(defaults.getIntPref(PREFS.days), 90, "After 90 days");
});

add_task(async function test_unused_grants_are_removed() {
  grant("https://stale.example.com", "camera", { daysAgo: 200 });
  grant("https://stale.example.com", "microphone", { daysAgo: 200 });
  grant("https://stale.example.com", "geo", { daysAgo: 200 });
  grant("https://stale.example.com", "desktop-notification", { daysAgo: 200 });
  grant("https://fresh-grant.example.com", "camera", { daysAgo: 10 });
  grant("https://visited.example.com", "geo", { daysAgo: 200 });
  await visit("https://visited.example.com/page", 5);
  grant("https://old-visit.example.com", "geo", { daysAgo: 200 });
  await visit("https://old-visit.example.com/page", 120);
  grant("https://blocked.example.com", "camera", {
    daysAgo: 200,
    capability: DENY_ACTION,
  });
  grant("https://other-type.example.com", "popup", { daysAgo: 200 });
  grant("https://port.example.com:8443", "geo", { daysAgo: 200 });
  await visit("https://port.example.com:8443/", 1);
  grant("https://no-port-visit.example.com:8443", "geo", { daysAgo: 200 });
  await visit("https://no-port-visit.example.com/", 1);

  const removed = await PeppermintPermissionAutoRevoke.run();

  for (const type of ["camera", "microphone", "geo", "desktop-notification"]) {
    Assert.ok(!has("https://stale.example.com", type), `Stale ${type} removed`);
  }
  Assert.ok(!has("https://old-visit.example.com", "geo"), "Old visit removed");
  Assert.ok(
    !has("https://no-port-visit.example.com:8443", "geo"),
    "A visit to another port does not count"
  );
  Assert.ok(
    has("https://fresh-grant.example.com", "camera"),
    "Recent grant kept"
  );
  Assert.ok(has("https://visited.example.com", "geo"), "Recent visit kept");
  Assert.ok(
    has("https://port.example.com:8443", "geo"),
    "Visit on the port kept"
  );
  Assert.ok(has("https://blocked.example.com", "camera"), "Blocks are kept");
  Assert.ok(has("https://other-type.example.com", "popup"), "Other types kept");
  Assert.equal(removed.length, 6, "Six permissions removed");

  Services.perms.removeAll();
  await PlacesUtils.history.clear();
});

add_task(async function test_session_grants_are_left_alone() {
  Services.perms.addFromPrincipal(
    principal("https://session.example.com"),
    "camera",
    ALLOW_ACTION,
    EXPIRE_SESSION
  );
  const removed = await PeppermintPermissionAutoRevoke.run({
    now: Date.now() + 200 * DAY_MS,
  });
  Assert.equal(removed.length, 0, "Nothing removed");
  Assert.ok(has("https://session.example.com", "camera"), "Session grant kept");
  Services.perms.removeAll();
});

add_task(async function test_turned_off() {
  for (const prefs of [
    [[PREFS.enabled, false]],
    [[PREFS.days, 0]],
    [["places.history.enabled", false]],
  ]) {
    await SpecialPowers.pushPrefEnv({ set: prefs });
    grant("https://stale.example.com", "camera", { daysAgo: 200 });
    const removed = await PeppermintPermissionAutoRevoke.run();
    Assert.equal(removed.length, 0, `Nothing removed with ${prefs[0][0]}`);
    Assert.ok(has("https://stale.example.com", "camera"), "Grant kept");
    await SpecialPowers.popPrefEnv();
  }
  Services.perms.removeAll();
});

add_task(async function test_the_days_setting() {
  await SpecialPowers.pushPrefEnv({ set: [[PREFS.days, 30]] });
  grant("https://month.example.com", "geo", { daysAgo: 45 });
  grant("https://week.example.com", "geo", { daysAgo: 7 });
  await PeppermintPermissionAutoRevoke.run();
  Assert.ok(!has("https://month.example.com", "geo"), "45 days > 30 days");
  Assert.ok(has("https://week.example.com", "geo"), "7 days < 30 days");
  await SpecialPowers.popPrefEnv();
  Services.perms.removeAll();
});

add_task(async function test_history_says_why() {
  const logPath = PathUtils.join(
    PathUtils.tempDir,
    "auto-revoke-permission-history.json"
  );
  await IOUtils.remove(logPath, { ignoreAbsent: true });
  PeppermintVaultPermissionLog.testing.setPath(logPath);
  PeppermintVaultPermissionLog.start();
  await PeppermintVaultPermissionLog.testing.ready();

  grant("https://stale.example.com", "camera", { daysAgo: 200 });
  grant("https://manual.example.com", "camera", { daysAgo: 200 });
  const recorded = async (origin, to) =>
    (await PeppermintVaultPermissionLog.entries()).find(
      e => e.origin == origin && e.type == "camera" && e.to === to
    );
  await TestUtils.waitForCondition(
    async () =>
      (await recorded("https://stale.example.com", ALLOW_ACTION)) &&
      recorded("https://manual.example.com", ALLOW_ACTION),
    "Both grants are recorded"
  );
  Services.perms.removeFromPrincipal(
    principal("https://manual.example.com"),
    "camera"
  );
  await PeppermintPermissionAutoRevoke.run();

  let manual, auto;
  await TestUtils.waitForCondition(async () => {
    manual = await recorded("https://manual.example.com", null);
    auto = await recorded("https://stale.example.com", null);
    return manual && auto;
  }, "Both removals are recorded");
  Assert.equal(manual.reason, undefined, "A manual removal has no reason");
  Assert.equal(auto.reason, REASON, "The automatic removal says so");

  PeppermintVaultPermissionLog.stop();
  PeppermintVaultPermissionLog.testing.setPath(null);
  await IOUtils.remove(logPath, { ignoreAbsent: true });
  Services.perms.removeAll();
});

add_task(async function test_runs_once_a_day_while_inactive() {
  grant("https://stale.example.com", "camera", { daysAgo: 200 });
  Services.prefs.setIntPref(PREFS.lastRun, Math.floor(Date.now() / 1000));
  PeppermintPermissionAutoRevoke.onInactive();
  await new Promise(resolve => ChromeUtils.idleDispatch(resolve));
  await TestUtils.waitForTick();
  Assert.ok(has("https://stale.example.com", "camera"), "Ran too recently");

  Services.prefs.setIntPref(
    PREFS.lastRun,
    Math.floor((Date.now() - 2 * DAY_MS) / 1000)
  );
  PeppermintPermissionAutoRevoke.onInactive();
  await TestUtils.waitForCondition(
    () => !has("https://stale.example.com", "camera"),
    "Runs once the last run is a day old"
  );
  Assert.greater(
    Services.prefs.getIntPref(PREFS.lastRun) * 1000,
    Date.now() - DAY_MS,
    "Remembers when it ran"
  );
  Services.perms.removeAll();
});
