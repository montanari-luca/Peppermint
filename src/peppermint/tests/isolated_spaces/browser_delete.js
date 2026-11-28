/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

function cookiesIn(userContextId) {
  return Services.cookies.getCookiesWithOriginAttributes(
    JSON.stringify({ userContextId })
  );
}

add_task(async function test_deleting_a_space_deletes_its_container() {
  const start = gZenWorkspaces.getActiveWorkspace();
  const doomed = await createSpace("Doomed");
  const id = doomed.containerTabId;
  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, PAGE);
  await setCookie(tab, "doomed");
  Assert.greater(cookiesIn(id).length, 0, "The space has a cookie");
  Assert.ok(Isolated.deletesDataWith(doomed, gZenWorkspaces.getWorkspaces()));

  await gZenWorkspaces.changeWorkspace(start);
  await gZenWorkspaces.removeWorkspace(doomed.uuid);
  await TestUtils.waitForCondition(
    () => !ContextualIdentityService.getPublicIdentityFromId(id),
    "The container is deleted with the space"
  );
  Assert.equal(cookiesIn(id).length, 0, "and so are its cookies");
  Assert.ok(!Isolated.createdContainer(id), "and its record");
});

add_task(async function test_adopted_container_survives() {
  const start = gZenWorkspaces.getActiveWorkspace();
  const own = createContainer("Keep me");
  const kept = await createSpace("Adopted", own);
  await isolation().toggle(kept.uuid, { prompt: false });
  Assert.ok(
    !Isolated.deletesDataWith(space(kept.uuid), gZenWorkspaces.getWorkspaces()),
    "A container Peppermint did not make is never deleted"
  );
  await gZenWorkspaces.changeWorkspace(start);
  await gZenWorkspaces.removeWorkspace(kept.uuid);
  await new Promise(resolve => setTimeout(resolve, 500));
  Assert.ok(
    ContextualIdentityService.getPublicIdentityFromId(own),
    "It is still there"
  );
});

add_task(async function test_prune_ignores_an_empty_space_list() {
  const keep = await createSpace("Never pruned");
  Assert.deepEqual(
    await Isolated.prune([]),
    [],
    "An empty list deletes nothing"
  );
  Assert.ok(
    ContextualIdentityService.getPublicIdentityFromId(keep.containerTabId),
    "The container is kept"
  );
  Assert.deepEqual(
    await Isolated.prune(gZenWorkspaces.getWorkspaces()),
    [],
    "Containers in use are kept"
  );
});
