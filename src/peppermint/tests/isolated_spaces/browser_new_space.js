/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_new_space_gets_a_named_container() {
  const before = ContextualIdentityService.getPublicIdentities().length;
  const travel = await createSpace("Travel");
  Assert.greater(travel.containerTabId, 0, "The space has a container");
  Assert.ok(Isolated.isIsolated(travel), "and is isolated");
  Assert.ok(
    Isolated.createdContainer(travel.containerTabId),
    "Peppermint made the container"
  );
  Assert.equal(
    ContextualIdentityService.getPublicIdentities().length,
    before + 1,
    "Exactly one container was made"
  );
  Assert.equal(
    ContextualIdentityService.getPublicIdentityFromId(travel.containerTabId)
      .name,
    "Travel",
    "It is named after the space"
  );

  travel.name = "Trips";
  await gZenWorkspaces.saveWorkspace(travel);
  await TestUtils.waitForCondition(
    () =>
      ContextualIdentityService.getPublicIdentityFromId(travel.containerTabId)
        ?.name === "Trips",
    "Renaming the space renames its container"
  );
});

add_task(async function test_given_container_is_respected() {
  const mine = createContainer("Mine");
  const given = await createSpace("Given", mine);
  Assert.equal(
    given.containerTabId,
    mine,
    "A space given a container keeps it"
  );
  Assert.ok(!Isolated.isIsolated(given), "and is not isolated until asked");
});

add_task(async function test_owned_container_is_not_shared() {
  const first = await createSpace("First");
  const second = await createSpace("Second", first.containerTabId);
  Assert.notEqual(
    second.containerTabId,
    first.containerTabId,
    "A new space never shares an isolated space's container"
  );
  Assert.ok(Isolated.isIsolated(second), "It gets one of its own");
});
