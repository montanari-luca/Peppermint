/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { PeppermintCleanLinks, unwrap } = ChromeUtils.importESModule(
  "moz-src:///peppermint/clean-links/PeppermintCleanLinks.sys.mjs"
);

const PREF = "peppermint.clean-links.enabled";
const DEST = "https://example.com/article?id=7";
const ENCODED = encodeURIComponent(DEST);

add_task(function test_known_forwarders() {
  const cases = [
    [`https://www.google.com/url?sa=t&q=${ENCODED}&usg=x`, DEST],
    [`https://www.google.co.uk/url?url=${ENCODED}`, DEST],
    [`https://google.de/url?q=${ENCODED}`, DEST],
    ["https://www.google.com/amp/s/example.com/page", "https://example.com/page"],
    ["https://www.google.com/amp/example.com/page", "http://example.com/page"],
    [
      "https://example-com.cdn.ampproject.org/c/s/example.com/page",
      "https://example.com/page",
    ],
    [`https://l.facebook.com/l.php?u=${ENCODED}&h=AT0`, DEST],
    [`https://out.reddit.com/t3_abc?url=${ENCODED}&token=1`, DEST],
    [`https://www.youtube.com/redirect?event=video&q=${ENCODED}`, DEST],
    [`https://www.linkedin.com/safety/go?url=${ENCODED}`, DEST],
    [`https://steamcommunity.com/linkfilter/?u=${ENCODED}`, DEST],
  ];
  for (const [wrapped, expected] of cases) {
    Assert.equal(unwrap(wrapped), expected, wrapped);
  }
});

add_task(function test_left_alone() {
  const cases = [
    "https://www.google.com/search?q=cats",
    "https://www.google.com/url?q=/search%3Fq%3Dcats",
    `https://www.google.com/url?q=${encodeURIComponent("javascript:alert(1)")}`,
    "https://www.google.com/amp/s/",
    `https://notgoogle.com/url?q=${ENCODED}`,
    `https://www.google.com.evil.example/url?q=${ENCODED}`,
    `https://example.com/url?q=${ENCODED}`,
    "about:blank",
    "not a url",
  ];
  for (const spec of cases) {
    Assert.equal(unwrap(spec), null, spec);
  }
});

add_task(async function test_page_loads_skip_the_forwarder() {
  PeppermintCleanLinks.setRulesForTests([
    { host: "example\\.org", path: "/go", param: ["to"] },
  ]);
  registerCleanupFunction(() => PeppermintCleanLinks.setRulesForTests());
  const target = "https://example.com/browser/";
  const wrapped = `https://example.org/go?to=${encodeURIComponent(target)}`;

  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, wrapped);
  Assert.equal(
    tab.linkedBrowser.currentURI.host,
    "example.com",
    "The page loaded at the destination"
  );
  BrowserTestUtils.removeTab(tab);

  await SpecialPowers.pushPrefEnv({ set: [[PREF, false]] });
  tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, wrapped);
  Assert.equal(
    tab.linkedBrowser.currentURI.host,
    "example.org",
    "Off, the forwarder loads"
  );
  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});
