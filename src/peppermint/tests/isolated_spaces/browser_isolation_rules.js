/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(function test_tab_state_moves_to_the_container() {
  const principal = Services.scriptSecurityManager.createContentPrincipal(
    Services.io.newURI(PAGE),
    {}
  );
  const serialized = E10SUtils.serializePrincipal(principal);
  const state = {
    userContextId: 0,
    storage: { "https://example.com": { key: "value" } },
    entries: [
      {
        url: PAGE,
        triggeringPrincipal_base64: serialized,
        children: [{ url: OTHER_PAGE, principalToInherit_base64: serialized }],
      },
    ],
  };
  moveTabStateToContainer(state, 7);
  Assert.equal(state.userContextId, 7, "The tab state names the container");
  Assert.ok(!state.storage, "Session storage of the old container is dropped");
  for (const serializedPrincipal of [
    state.entries[0].triggeringPrincipal_base64,
    state.entries[0].children[0].principalToInherit_base64,
  ]) {
    const moved = E10SUtils.deserializePrincipal(serializedPrincipal);
    Assert.equal(
      moved.originAttributes.userContextId,
      7,
      "History principals move too"
    );
    Assert.equal(
      moved.origin.split("^")[0],
      principal.origin,
      "for the same site"
    );
  }
});

add_task(function test_container_colors_follow_the_space() {
  const red = colorForSpace({
    theme: { gradientColors: [{ c: [220, 30, 30] }] },
  });
  Assert.equal(red, "red", "A red space gets a red container");
  const blue = colorForSpace({
    theme: { gradientColors: [{ c: [40, 90, 230] }] },
  });
  Assert.equal(blue, "blue", "A blue space gets a blue container");
  Assert.ok(
    colorForSpace({ uuid: "{abc}" }),
    "Spaces without colors still get one"
  );
});

add_task(async function test_new_tabs_take_the_space_container() {
  const work = await createSpace("Work");
  Assert.ok(Isolated.isIsolated(work), "A new space is isolated");

  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, PAGE);
  Assert.equal(
    tab.userContextId,
    work.containerTabId,
    "A new tab opens in the space's container"
  );

  const other = createContainer("Elsewhere");
  const asked = gBrowser.addTrustedTab(PAGE, { userContextId: other });
  Assert.equal(
    asked.userContextId,
    work.containerTabId,
    "A container that no isolated space owns cannot be used in the space"
  );
  Assert.equal(
    asked.getAttribute("zen-workspace-id"),
    work.uuid,
    "and the tab stays"
  );

  const home = await createSpace("Home");
  await gZenWorkspaces.changeWorkspace(work);
  const routed = gBrowser.addTrustedTab(PAGE, {
    userContextId: home.containerTabId,
  });
  Assert.equal(
    routed.userContextId,
    home.containerTabId,
    "Asking for another space's container"
  );
  Assert.equal(
    routed.getAttribute("zen-workspace-id"),
    home.uuid,
    "opens the tab in that space"
  );

  const placed = gBrowser.addTrustedTab(PAGE, { zenWorkspaceId: home.uuid });
  Assert.equal(
    placed.userContextId,
    home.containerTabId,
    "A tab opened into a space gets that space's container, not the active one's"
  );

  for (const t of [tab, asked, routed, placed]) {
    BrowserTestUtils.removeTab(t);
  }
});

add_task(async function test_plain_spaces_are_unchanged() {
  await SpecialPowers.pushPrefEnv({
    set: [["peppermint.spaces.isolate-new", false]],
  });
  const plain = await createSpace("Plain");
  Assert.equal(
    plain.containerTabId,
    0,
    "With the setting off, a new space has no container"
  );
  Assert.ok(!Isolated.isIsolated(plain), "and is not isolated");
  const other = createContainer("Chosen");
  const tab = gBrowser.addTrustedTab(PAGE, { userContextId: other });
  Assert.equal(
    tab.userContextId,
    other,
    "An explicit container is kept, as in Zen"
  );
  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});
