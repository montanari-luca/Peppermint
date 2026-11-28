/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { PeppermintChromiumSpaces, spaceNameFor } = ChromeUtils.importESModule(
  "moz-src:///peppermint/isolated-spaces/PeppermintChromiumSpaces.sys.mjs"
);
const { ChromeProfileMigrator } = ChromeUtils.importESModule(
  "moz-src:///browser/components/migration/ChromeProfileMigrator.sys.mjs"
);
const { MigrationUtils } = ChromeUtils.importESModule(
  "moz-src:///browser/components/migration/MigrationUtils.sys.mjs"
);

add_task(function test_space_names() {
  Assert.equal(spaceNameFor("Google Chrome", "Work"), "Work (Google Chrome)");
  Assert.equal(spaceNameFor("Brave", "Person 1"), "Brave", "Unnamed profiles");
  Assert.equal(spaceNameFor("Microsoft Edge", "Default"), "Microsoft Edge");
  Assert.equal(spaceNameFor("Vivaldi", ""), "Vivaldi");
});

add_task(async function test_profile_bookmarks_get_an_isolated_space() {
  PeppermintChromiumSpaces.install();
  const dir = await IOUtils.createUniqueDirectory(
    PathUtils.tempDir,
    "pm-chrome"
  );
  registerCleanupFunction(() => IOUtils.remove(dir, { recursive: true }));
  await IOUtils.writeJSON(PathUtils.join(dir, "Local State"), {
    profile: { info_cache: { "Profile 2": { name: "Work" } } },
  });
  await IOUtils.makeDirectory(PathUtils.join(dir, "Profile 2"));
  await IOUtils.writeJSON(PathUtils.join(dir, "Profile 2", "Bookmarks"), {
    roots: {
      bookmark_bar: {
        children: [{ type: "url", name: "Peppermint test page", url: PAGE }],
      },
      other: { children: [] },
      synced: { children: [] },
    },
  });

  const migrator = new ChromeProfileMigrator();
  migrator._chromeUserDataPath = dir;
  const profile = { id: "Profile 2", name: "Work" };
  const spacesBefore = gZenWorkspaces.getWorkspaces().length;
  await migrator.migrate(MigrationUtils.resourceTypes.BOOKMARKS, null, profile);

  let created;
  await TestUtils.waitForCondition(() => {
    created = gZenWorkspaces
      .getWorkspaces()
      .find(s => s.name.startsWith("Work ("));
    return created;
  }, "The profile became a space");
  createdSpaces.push(created.uuid);
  Assert.equal(
    gZenWorkspaces.getWorkspaces().length,
    spacesBefore + 1,
    "One space per profile"
  );
  Assert.ok(Isolated.isIsolated(created), "It is isolated");

  const toolbar = await PlacesUtils.promiseBookmarksTree(
    PlacesUtils.bookmarks.toolbarGuid
  );
  const folder = toolbar.children.find(child => child.title === created.name);
  Assert.ok(folder, "Its bookmarks are in a folder named after it");
  Assert.ok(
    folder.children?.some(child => child.uri === PAGE),
    "holding the imported bookmark"
  );
  Assert.ok(
    !toolbar.children.some(child => child.uri === PAGE),
    "and not loose in the toolbar"
  );
  await PlacesUtils.bookmarks.remove(folder.guid);
});
