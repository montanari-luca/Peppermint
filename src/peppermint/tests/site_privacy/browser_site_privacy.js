/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { PeppermintSitePrivacy, SECTION_ID, countBlockedTrackers, forgetSite } =
  ChromeUtils.importESModule(
    "moz-src:///peppermint/site-privacy/PeppermintSitePrivacy.sys.mjs"
  );
const { PlacesTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PlacesTestUtils.sys.mjs"
);

const PAGE = "https://example.com/";
const WPL = Ci.nsIWebProgressListener;

function panel() {
  return document.getElementById("zen-unified-site-data-panel");
}

function section() {
  return document.getElementById(SECTION_ID);
}

function stateOf(id) {
  return section().querySelector(
    `#${id} .zen-permission-popup-permission-state-label`
  );
}

async function openPanel() {
  // The icon in the address bar only shows on hover, which headless runs
  // cannot rely on, so the panel is opened the way the icon opens it.
  await closePanel();
  const shown = BrowserTestUtils.waitForPopupEvent(panel(), "shown");
  PanelMultiView.openPopup(panel(), document.getElementById("urlbar"), {
    position: "bottomleft topleft",
  });
  await shown;
  // The section fills in after reading the site's storage.
  await TestUtils.waitForCondition(
    () => section() && !section().hidden && section().dataset.site,
    "The privacy section is filled in"
  );
}

async function closePanel() {
  if (panel().state == "closed") {
    return;
  }
  const hidden = BrowserTestUtils.waitForPopupEvent(panel(), "hidden");
  panel().hidePopup();
  await hidden;
}

async function setCookie(browser) {
  await SpecialPowers.spawn(browser, [], () => {
    content.document.cookie = "peppermint=1; max-age=3600";
  });
}

function cookieCount() {
  return Services.cookies.getCookiesWithOriginAttributes("{}", "example.com")
    .length;
}

function principal() {
  return Services.scriptSecurityManager.createContentPrincipalFromOrigin(
    "https://example.com"
  );
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["peppermint.site-privacy.enabled", true]],
  });
  registerCleanupFunction(async () => {
    await closePanel();
    Services.cookies.removeAll();
    Services.perms.removeAll();
    await PlacesUtils.history.clear();
  });
});

add_task(function test_counting_trackers() {
  const log = {
    "https://tracker.example": [[WPL.STATE_BLOCKED_TRACKING_CONTENT, true, 2]],
    "https://social.example": [
      [WPL.STATE_COOKIES_BLOCKED_SOCIALTRACKER, true, 1],
    ],
    "https://allowed.example": [
      [WPL.STATE_LOADED_LEVEL_1_TRACKING_CONTENT, false, 1],
    ],
    "https://cookies.example": [[WPL.STATE_COOKIES_LOADED, false, 1]],
  };
  Assert.equal(countBlockedTrackers(log), 2, "Two trackers blocked");
  Assert.equal(
    countBlockedTrackers(JSON.stringify(log)),
    2,
    "Reads the JSON a browser returns"
  );
  Assert.equal(countBlockedTrackers(null), 0, "No log, nothing blocked");
  Assert.equal(countBlockedTrackers("not json"), 0, "A bad log is ignored");
});

add_task(async function test_section_shows_trackers_and_data() {
  await BrowserTestUtils.withNewTab(PAGE, async browser => {
    await setCookie(browser);
    await openPanel();
    Assert.equal(section().dataset.site, "example.com", "For the site");
    Assert.equal(
      section().nextElementSibling?.id,
      "zen-site-data-footer",
      "Sits above the panel's footer"
    );
    Assert.equal(
      document.l10n.getAttributes(stateOf("peppermint-site-privacy-trackers"))
        .id,
      "peppermint-site-privacy-trackers-none",
      "No trackers on the test page"
    );
    const storage = document.l10n.getAttributes(
      stateOf("peppermint-site-privacy-storage")
    );
    Assert.equal(storage.id, "peppermint-site-privacy-storage-summary");
    Assert.equal(storage.args.cookies, 1, "Counts the cookie");
    await closePanel();
  });
  Services.cookies.removeAll();
});

add_task(async function test_hidden_where_it_does_not_apply() {
  await BrowserTestUtils.withNewTab("about:robots", async () => {
    await PeppermintSitePrivacy.update(window);
    Assert.ok(!section() || section().hidden, "Hidden on browser pages");
  });
  await SpecialPowers.pushPrefEnv({
    set: [["peppermint.site-privacy.enabled", false]],
  });
  await BrowserTestUtils.withNewTab(PAGE, async () => {
    await PeppermintSitePrivacy.update(window);
    Assert.ok(section().hidden, "Hidden when turned off");
  });
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_forget_needs_two_clicks() {
  await PlacesTestUtils.addVisits(`${PAGE}visited`);
  await BrowserTestUtils.withNewTab(PAGE, async browser => {
    await setCookie(browser);
    Services.perms.addFromPrincipal(
      principal(),
      "camera",
      Services.perms.ALLOW_ACTION
    );
    await openPanel();
    const forget = section().querySelector("#peppermint-site-privacy-forget");

    forget.click();
    Assert.ok(section().hasAttribute("confirming"), "Asks for a second click");
    Assert.equal(
      document.l10n.getAttributes(stateOf("peppermint-site-privacy-forget")).id,
      "peppermint-site-privacy-forget-confirm"
    );
    Assert.equal(cookieCount(), 1, "Nothing is removed on the first click");

    const hidden = BrowserTestUtils.waitForPopupEvent(panel(), "hidden");
    const reloaded = BrowserTestUtils.browserLoaded(browser, false, PAGE);
    forget.click();
    await hidden;
    await reloaded;
    await TestUtils.waitForCondition(
      () => cookieCount() == 0,
      "The cookies are gone"
    );
    Assert.equal(
      Services.perms.testExactPermissionFromPrincipal(principal(), "camera"),
      Services.perms.UNKNOWN_ACTION,
      "The permissions are gone"
    );
    Assert.ok(
      await PlacesUtils.history.hasVisits(`${PAGE}visited`),
      "History is kept unless asked"
    );
    await TestUtils.waitForCondition(
      () =>
        [...document.getElementById("zen-toast-container").children].some(
          toast => toast._messageId == "peppermint-site-privacy-forgotten"
        ),
      "Says the site was forgotten"
    );
  });
});

add_task(async function test_forget_with_history() {
  await PlacesTestUtils.addVisits(`${PAGE}visited`);
  await forgetSite("example.com", { history: true });
  await TestUtils.waitForCondition(
    async () => !(await PlacesUtils.history.hasVisits(`${PAGE}visited`)),
    "History is removed when asked"
  );
});

add_task(async function test_confirmation_resets_when_reopened() {
  await BrowserTestUtils.withNewTab(PAGE, async () => {
    await openPanel();
    section().querySelector("#peppermint-site-privacy-forget").click();
    section().querySelector(".peppermint-site-privacy-history").checked = true;
    await closePanel();
    await openPanel();
    Assert.ok(!section().hasAttribute("confirming"), "Not armed any more");
    Assert.ok(
      !section().querySelector(".peppermint-site-privacy-history").checked,
      "History starts unticked"
    );
    await closePanel();
  });
});
