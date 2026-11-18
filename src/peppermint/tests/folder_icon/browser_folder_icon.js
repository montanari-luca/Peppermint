/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const CUSTOM_ICON = "chrome://browser/skin/zen-icons/selectable/heart.svg";

function folderGlyph(folder) {
  return getComputedStyle(folder.icon, "::before");
}

function svgPart(folder, selector) {
  return folder.icon.querySelector(`svg ${selector}`);
}

add_task(async function test_folder_shows_platform_glyph() {
  const folder = await gZenFolders.createFolder([], {
    renameFolder: false,
    label: "Glyph",
  });

  const glyph = folderGlyph(folder);
  isnot(glyph.display, "none", "The folder glyph is shown");
  ok(
    glyph.backgroundImage.includes("zen-icons/folder.svg"),
    "The glyph is the platform folder icon"
  );
  for (const part of [".back", ".front", ".dots"]) {
    for (const node of folder.icon.querySelectorAll(`svg ${part}`)) {
      is(getComputedStyle(node).display, "none", `Zen's ${part} is hidden`);
    }
  }

  folder.collapsed = true;
  gZenFolders.updateFolderIcon(folder, "auto");
  is(
    getComputedStyle(folder.icon.querySelector("svg")).transform,
    "none",
    "The icon does not move when the folder state changes"
  );

  const removed = BrowserTestUtils.waitForEvent(folder, "TabGroupRemoved");
  folder.delete();
  await removed;
});

add_task(async function test_custom_icon_replaces_glyph() {
  const folder = await gZenFolders.createFolder([], {
    renameFolder: false,
    label: "Custom",
  });

  gZenFolders.setFolderUserIcon(folder, CUSTOM_ICON);
  is(folderGlyph(folder).display, "none", "The glyph hides with a custom icon");
  is(folder.iconURL, CUSTOM_ICON, "The custom icon is kept on the folder");

  const icon = svgPart(folder, ".icon");
  is(getComputedStyle(icon).opacity, "1", "The custom icon is visible");
  is(getComputedStyle(icon).transform, "none", "The custom icon is upright");

  folder.collapsed = false;
  gZenFolders.updateFolderIcon(folder, "open");
  is(
    getComputedStyle(icon).transform,
    "none",
    "The custom icon stays upright while the folder is open"
  );

  gZenFolders.setFolderUserIcon(folder, null);
  isnot(
    folderGlyph(folder).display,
    "none",
    "Clearing the custom icon brings the glyph back"
  );

  const removed = BrowserTestUtils.waitForEvent(folder, "TabGroupRemoved");
  folder.delete();
  await removed;
});
