/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { findLookalike, isOneEditAway, setSitesForTests, skeleton } =
  ChromeUtils.importESModule(
    "moz-src:///peppermint/lookalike/PeppermintLookalikeDomains.sys.mjs"
  );
const { NOTIFICATION_VALUE, PERMISSION_TYPE, PeppermintLookalike } =
  ChromeUtils.importESModule(
    "moz-src:///peppermint/lookalike/PeppermintLookalike.sys.mjs"
  );
const { PlacesTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PlacesTestUtils.sys.mjs"
);

const PAGE = "https://example.com/";
const DAY_MS = 24 * 60 * 60 * 1000;

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["peppermint.lookalike.enabled", true],
      ["security.notification_enable_delay", 0],
    ],
  });
  await PlacesUtils.history.clear();
  registerCleanupFunction(async () => {
    setSitesForTests(null);
    Services.perms.removeByType(PERMISSION_TYPE);
    await PlacesUtils.history.clear();
  });
});

add_task(function test_skeleton() {
  Assert.equal(skeleton("аpple"), "apple", "Cyrillic a reads as a");
  Assert.equal(skeleton("gοοgle"), "google", "Greek o reads as o");
  Assert.equal(skeleton("paypa1"), "paypal", "1 reads as l");
  Assert.equal(skeleton("amaz0n"), "amazon", "0 reads as o");
  Assert.equal(skeleton("rnicrosoft"), "microsoft", "rn reads as m");
  Assert.equal(skeleton("ébay"), "ebay", "Accents are dropped");
  Assert.equal(skeleton("github"), "github", "Plain names are unchanged");
});

add_task(function test_one_edit() {
  Assert.ok(isOneEditAway("amazom", "amazon"), "Changed letter");
  Assert.ok(isOneEditAway("amazn", "amazon"), "Missing letter");
  Assert.ok(isOneEditAway("amazoon", "amazon"), "Added letter");
  Assert.ok(isOneEditAway("githbu", "github"), "Swapped letters");
  Assert.ok(!isOneEditAway("amazon", "amazon"), "Same name");
  Assert.ok(!isOneEditAway("gitlab", "github"), "Two letters apart");
  Assert.ok(!isOneEditAway("abcd", "badc"), "Two swaps");
});

add_task(async function test_popular_sites() {
  setSitesForTests(null);
  const cases = [
    ["xn--pple-43d.com", "apple.com", "confusable"],
    ["paypa1.com", "paypal.com", "confusable"],
    ["rnicrosoft.com", "microsoft.com", "confusable"],
    ["www.xn--pypal-4ve.com", "paypal.com", "confusable"],
    ["xn--ggle-55da.de", "google.de", "confusable"],
    ["amazom.com", "amazon.com", "typo"],
    ["githbu.com", "github.com", "typo"],
    ["gooogle.com", "google.com", "typo"],
  ];
  for (const [host, domain, reason] of cases) {
    const result = await findLookalike(host);
    Assert.equal(result?.domain, domain, `${host} looks like ${domain}`);
    Assert.equal(result?.reason, reason, `${host} is a ${reason}`);
  }
  for (const host of [
    "google.com",
    "mail.google.com",
    "google.de",
    "google.fr",
    "amazon.co.uk",
    "peppermint-lookalike-test.org",
    "amazom.net",
    "127.0.0.1",
    "localhost",
    "com",
  ]) {
    Assert.equal(await findLookalike(host), null, `${host} is left alone`);
  }
});

async function waitForBar(browser) {
  const box = gBrowser.getNotificationBox(browser);
  await TestUtils.waitForCondition(
    () => box.getNotificationWithValue(NOTIFICATION_VALUE),
    "The warning bar is shown"
  );
  return box.getNotificationWithValue(NOTIFICATION_VALUE);
}

function buttons(notification) {
  return [
    ...notification.buttonContainer.querySelectorAll(".notification-button"),
  ];
}

add_task(async function test_the_bar_and_staying() {
  setSitesForTests(["exampla.com"]);
  await BrowserTestUtils.withNewTab(PAGE, async browser => {
    const notification = await waitForBar(browser);
    Assert.equal(
      notification.messageL10nId,
      "peppermint-lookalike-message-typo",
      "Says the name is one letter away"
    );
    Assert.deepEqual(
      notification.messageL10nArgs,
      { site: "example.com", domain: "exampla.com" },
      "Names both websites"
    );
    const [go, stay] = buttons(notification);
    Assert.equal(go.label, "Go to exampla.com", "Offers the real website");
    Assert.ok(stay.label, "Offers to stay");

    stay.click();
    await TestUtils.waitForCondition(
      () =>
        !gBrowser
          .getNotificationBox(browser)
          .getNotificationWithValue(NOTIFICATION_VALUE),
      "The bar closes"
    );
    Assert.equal(
      await PeppermintLookalike.check(browser, browser.currentURI),
      null,
      "Staying is remembered"
    );
  });
  Services.perms.removeByType(PERMISSION_TYPE);
});

add_task(async function test_going_to_the_real_website() {
  // A test host spelled "exämple", which reads as example.org.
  setSitesForTests(["example.org"]);
  await SpecialPowers.pushPrefEnv({
    set: [["dom.security.https_first", false]],
  });
  await BrowserTestUtils.withNewTab(
    "http://xn--exmple-cua.test/",
    async browser => {
      const notification = await waitForBar(browser);
      Assert.equal(
        notification.messageL10nId,
        "peppermint-lookalike-message-confusable",
        "Says the name uses lookalike characters"
      );
      const [go] = buttons(notification);
      const loaded = BrowserTestUtils.browserLoaded(
        browser,
        false,
        "https://example.org/"
      );
      go.click();
      await loaded;
      Assert.equal(browser.currentURI.spec, "https://example.org/");
    }
  );
  await SpecialPowers.popPrefEnv();
  await PlacesUtils.history.clear();
});

add_task(async function test_known_websites_are_left_alone() {
  setSitesForTests(["exampla.com"]);
  await PlacesTestUtils.addVisits({
    uri: "https://www.example.com/before",
    visitDate: (Date.now() - 2 * DAY_MS) * 1000,
  });
  await BrowserTestUtils.withNewTab(PAGE, async browser => {
    Assert.equal(
      await PeppermintLookalike.check(browser, browser.currentURI),
      null,
      "A website visited before is not a surprise"
    );
  });
  await PlacesUtils.history.clear();
});

add_task(async function test_turned_off() {
  setSitesForTests(["exampla.com"]);
  await SpecialPowers.pushPrefEnv({
    set: [["peppermint.lookalike.enabled", false]],
  });
  await BrowserTestUtils.withNewTab(PAGE, async browser => {
    Assert.equal(
      await PeppermintLookalike.check(browser, browser.currentURI),
      null,
      "Nothing is checked"
    );
    Assert.ok(
      !gBrowser
        .getNotificationBox(browser)
        .getNotificationWithValue(NOTIFICATION_VALUE),
      "No bar"
    );
  });
  await SpecialPowers.popPrefEnv();
});
