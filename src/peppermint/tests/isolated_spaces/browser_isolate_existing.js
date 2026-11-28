/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_isolating_a_plain_space_makes_a_container() {
  await SpecialPowers.pushPrefEnv({
    set: [["peppermint.spaces.isolate-new", false]],
  });
  const plain = await createSpace("Plain");
  await SpecialPowers.popPrefEnv();
  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, PAGE);
  Assert.equal(tab.userContextId, 0, "Before, the tab uses no container");

  Assert.equal(
    Isolated.isolationKind(plain, gZenWorkspaces.getWorkspaces()),
    "new"
  );
  Assert.ok(
    await isolation().toggle(plain.uuid, { prompt: false }),
    "Isolated"
  );
  const isolated = space(plain.uuid);
  Assert.greater(isolated.containerTabId, 0, "It got a container");
  Assert.ok(
    Isolated.createdContainer(isolated.containerTabId),
    "made by Peppermint"
  );

  await waitForGuard();
  const reopened = tabsWithUrl(PAGE).find(
    t => t.getAttribute("zen-workspace-id") === plain.uuid
  );
  Assert.equal(
    reopened?.userContextId,
    isolated.containerTabId,
    "Its tabs moved into it"
  );
  BrowserTestUtils.removeTab(reopened);
});

add_task(async function test_isolating_keeps_an_unshared_container() {
  const own = createContainer("Already mine");
  const kept = await createSpace("Kept", own);
  Assert.equal(
    Isolated.isolationKind(kept, gZenWorkspaces.getWorkspaces()),
    "adopt"
  );
  const before = ContextualIdentityService.getPublicIdentities().length;
  await isolation().toggle(kept.uuid, { prompt: false });
  Assert.equal(
    space(kept.uuid).containerTabId,
    own,
    "The space keeps its container"
  );
  Assert.ok(Isolated.isIsolated(space(kept.uuid)), "and is isolated");
  Assert.equal(
    ContextualIdentityService.getPublicIdentities().length,
    before,
    "No container was made, so sign-ins stay"
  );

  Assert.ok(!(await isolation().toggle(kept.uuid)), "Turning it off");
  Assert.ok(!Isolated.isIsolated(space(kept.uuid)), "ends the isolation");
  Assert.equal(space(kept.uuid).containerTabId, own, "and keeps the container");
});

add_task(async function test_shared_container_is_not_adopted() {
  const shared = createContainer("Shared");
  const a = await createSpace("Shares A", shared);
  await createSpace("Shares B", shared);
  Assert.equal(
    Isolated.isolationKind(a, gZenWorkspaces.getWorkspaces()),
    "new",
    "A container used by two spaces cannot become one space's own"
  );
});

add_task(async function test_space_menu_locks_the_profile_choice() {
  const locked = await createSpace("Locked");
  const popup = document.getElementById("zenWorkspaceMoreActions");
  const shown = BrowserTestUtils.waitForPopupEvent(popup, "shown");
  popup.openPopup(document.documentElement, "after_start");
  await shown;
  const item = document.getElementById("context_peppermintIsolateSpace");
  Assert.ok(item && !item.hidden, "The space menu offers isolation");
  Assert.ok(item.hasAttribute("checked"), "checked for an isolated space");
  Assert.ok(
    document.getElementById("context_zenWorkspacesOpenInContainerTab").disabled,
    "and the profile cannot be changed"
  );
  const hidden = BrowserTestUtils.waitForPopupEvent(popup, "hidden");
  popup.hidePopup();
  await hidden;
  Assert.ok(Isolated.isIsolated(locked));
});
