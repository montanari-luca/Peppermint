/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { PeppermintShareFile, safeFileName } = ChromeUtils.importESModule(
  "moz-src:///peppermint/share-file/PeppermintShareFile.sys.mjs"
);

const { FileUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/FileUtils.sys.mjs"
);

const PAGE = "https://example.com/?exported-space";
const MockFilePicker = SpecialPowers.MockFilePicker;

function tempPath(name) {
  return PathUtils.join(PathUtils.tempDir, `${Date.now()}-${name}`);
}

add_setup(async function () {
  await gZenWorkspaces.promiseInitialized;
  MockFilePicker.init(window.browsingContext);
  registerCleanupFunction(() => MockFilePicker.cleanup());
});

add_task(function test_file_names_are_safe() {
  Assert.equal(safeFileName('a/b:c*"d'), "a b c d");
  Assert.equal(safeFileName(""), "Peppermint", "An empty name gets one");
});

add_task(async function test_share_exports_a_space_and_imports_it_back() {
  Assert.equal(
    Services.prefs.getStringPref("zen.share.base-url", ""),
    "",
    "Peppermint has no share service"
  );
  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, PAGE);
  const original = gZenWorkspaces.getActiveWorkspace();
  const path = tempPath("space.peppermint");
  MockFilePicker.returnValue = MockFilePicker.returnOK;
  MockFilePicker.setFiles([new FileUtils.File(path)]);

  await gZenShareManager.shareSpace(original.uuid);
  const doc = await IOUtils.readJSON(path);
  Assert.equal(doc.shared.type, "space", "The space is written to the file");
  Assert.ok(
    JSON.stringify(doc.shared.items).includes(PAGE),
    "With its tabs"
  );
  BrowserTestUtils.removeTab(tab);

  const before = new Set(gZenWorkspaces.getWorkspaces().map(w => w.uuid));
  Assert.ok(
    await PeppermintShareFile.importFile(window, path),
    "The file imports"
  );
  const imported = gZenWorkspaces
    .getWorkspaces()
    .find(workspace => !before.has(workspace.uuid));
  Assert.ok(imported, "As a new space");
  Assert.equal(imported.name, original.name, "With the same name");
  Assert.ok(
    gBrowser.tabs.some(
      t =>
        t.getAttribute("zen-workspace-id") == imported.uuid &&
        !t.hasAttribute("zen-empty-tab")
    ),
    "And its tabs"
  );
  await gZenWorkspaces.changeWorkspaceWithID(original.uuid);
  await gZenWorkspaces.removeWorkspace(imported.uuid);
  for (const t of gBrowser.tabs.filter(
    t => t.getAttribute("zen-workspace-id") == imported.uuid
  )) {
    BrowserTestUtils.removeTab(t);
  }
  await IOUtils.remove(path);
});

add_task(async function test_bad_files_import_nothing() {
  const invalid = tempPath("invalid.peppermint");
  await IOUtils.writeJSON(invalid, { shared: { type: "space", name: 3 } });
  const before = gZenWorkspaces.getWorkspaces().length;
  Assert.ok(
    !(await PeppermintShareFile.importFile(window, invalid)),
    "A file outside the share format is refused"
  );

  const large = tempPath("large.peppermint");
  await IOUtils.writeUTF8(large, " ".repeat(6 * 1024 * 1024));
  Assert.ok(
    !(await PeppermintShareFile.importFile(window, large)),
    "A file that is too large is refused"
  );
  Assert.equal(
    gZenWorkspaces.getWorkspaces().length,
    before,
    "Nothing was imported"
  );
  await IOUtils.remove(invalid);
  await IOUtils.remove(large);
});
