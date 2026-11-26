/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { addRecord, getRecord, removeRecord } = ChromeUtils.importESModule(
  "moz-src:///peppermint/tab-archive/PeppermintTabArchiveStore.sys.mjs"
);
const { clearArticles, listArticles, saveArticle } = ChromeUtils.importESModule(
  "moz-src:///peppermint/reader/PeppermintReaderStore.sys.mjs"
);

const Library = customElements.get("zen-library");
const PAGE = "https://example.com/?archived-in-library";

async function openLibrary(section) {
  if (!Library.isLibraryOpen) {
    Library.toggle(section);
  }
  const library = document.querySelector("zen-library");
  await TestUtils.waitForCondition(
    () =>
      Library.libraryProgress === 1 && !library.hasAttribute("transitioning"),
    "the library settles open"
  );
  library.activeTab = section;
  await library.updateComplete;
  return library;
}

async function closeLibrary() {
  if (!Library.isLibraryOpen) {
    return;
  }
  Library.toggle();
  await TestUtils.waitForCondition(
    () => !Library.isLibraryOpen && Library.libraryProgress === 0,
    "the library settles closed"
  );
}

function section(library, id) {
  return library.querySelector(`.zen-library-section[data-section="${id}"]`);
}

registerCleanupFunction(closeLibrary);

add_task(async function test_sections_are_in_the_rail() {
  const library = await openLibrary("history");
  const rail = [...library.querySelectorAll(".zen-library-tab")].map(
    tab => tab.dataset.section
  );
  Assert.ok(rail.includes("peppermint-archive"), "The archive has a tab");
  Assert.ok(rail.includes("peppermint-saved"), "Saved articles have a tab");
  await closeLibrary();
});

add_task(async function test_archive_section_lists_searches_and_opens() {
  const record = await addRecord({
    kind: "archive",
    url: PAGE,
    title: "Archived in the Library",
    workspaceId: gZenWorkspaces.activeWorkspace,
    archivedAt: Date.now(),
  });
  const library = await openLibrary("peppermint-archive");
  const view = section(library, "peppermint-archive");
  const rowTitled = title =>
    [...view.querySelectorAll(".zen-library-row-title")].find(
      node => node.textContent == title
    );
  await TestUtils.waitForCondition(
    () => rowTitled("Archived in the Library"),
    "The archived tab is listed"
  );

  view.searchQuery = "nothing like it";
  await view.updateComplete;
  Assert.ok(!rowTitled("Archived in the Library"), "Search filters it out");
  view.searchQuery = "";
  await view.updateComplete;

  const opened = BrowserTestUtils.waitForNewTab(gBrowser, PAGE, true);
  rowTitled("Archived in the Library").closest(".zen-library-row").click();
  const tab = await opened;
  await TestUtils.waitForCondition(
    async () => !(await getRecord(record.id)),
    "Opening it takes it out of the archive"
  );
  BrowserTestUtils.removeTab(tab);
  await removeRecord(record.id);
  await closeLibrary();
});

add_task(async function test_saved_section_lists_and_filters() {
  await saveArticle({
    url: "https://example.com/?saved-in-library",
    title: "Saved in the Library",
    content: "<p>Body</p>",
    siteName: "Example",
    readingTimeMinsFast: 3,
  });
  const library = await openLibrary("peppermint-saved");
  const view = section(library, "peppermint-saved");
  const row = () =>
    [...view.querySelectorAll(".zen-library-row-title")].find(
      node => node.textContent == "Saved in the Library"
    );
  await TestUtils.waitForCondition(row, "The saved article is listed");
  Assert.ok(
    row().closest(".zen-library-row").hasAttribute("unread"),
    "It starts unread"
  );

  view.activeFilters.add("state:read");
  view.requestUpdate();
  await view.updateComplete;
  Assert.ok(!row(), "The read filter hides it");
  view.activeFilters.clear();
  view.requestUpdate();
  await view.updateComplete;
  Assert.ok(row(), "It shows again without the filter");

  await clearArticles();
  Assert.equal((await listArticles()).length, 0, "Cleaned up");
  await closeLibrary();
});
