/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { PeppermintIsolatedSpaces: Isolated, colorForSpace } =
  ChromeUtils.importESModule(
    "moz-src:///peppermint/isolated-spaces/PeppermintIsolatedSpaces.sys.mjs"
  );
const { PeppermintIsolatedSpacesWindow, moveTabStateToContainer } =
  ChromeUtils.importESModule(
    "moz-src:///peppermint/isolated-spaces/PeppermintIsolatedSpacesWindow.sys.mjs"
  );
const { ContextualIdentityService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/contextualidentity/ContextualIdentityService.sys.mjs"
);

const PAGE = "https://example.com/browser/";
const OTHER_PAGE = "https://example.org/browser/";

const createdSpaces = [];
const createdContainers = [];

/** Creates a space (it becomes active) and removes it after the test. */
async function createSpace(name, containerTabId = 0) {
  const space = await gZenWorkspaces.createAndSaveWorkspace(
    name,
    undefined,
    false,
    containerTabId
  );
  createdSpaces.push(space.uuid);
  return gZenWorkspaces.getWorkspaceFromId(space.uuid);
}

/** A container the test owns (not made by Peppermint). */
function createContainer(name) {
  const identity = ContextualIdentityService.create(name, "briefcase", "blue");
  createdContainers.push(identity.userContextId);
  return identity.userContextId;
}

function space(uuid) {
  return gZenWorkspaces.getWorkspaceFromId(uuid);
}

function isolation(win = window) {
  return PeppermintIsolatedSpacesWindow.forWindow(win);
}

/** Waits for the guard to settle: no tab of an isolated space in the wrong container. */
async function waitForGuard(win = window) {
  await TestUtils.waitForCondition(() => {
    for (const tab of win.gBrowser.tabs) {
      const owner = win.gZenWorkspaces.getWorkspaceFromId(
        tab.getAttribute("zen-workspace-id")
      );
      const want = Isolated.containerFor(owner);
      if (
        want &&
        tab.userContextId !== want &&
        !tab.hasAttribute("zen-essential") &&
        !tab.hasAttribute("zen-empty-tab") &&
        !tab.closing
      ) {
        return false;
      }
    }
    return true;
  }, "Every tab of an isolated space is in its container");
}

function tabsWithUrl(url, win = window) {
  return win.gBrowser.tabs.filter(
    tab => tab.linkedBrowser.currentURI.spec === url && !tab.closing
  );
}

async function setCookie(tab, value) {
  await SpecialPowers.spawn(tab.linkedBrowser, [value], v => {
    content.document.cookie = `peppermint=${v}; SameSite=Lax; Secure`;
  });
}

async function readCookie(tab) {
  return SpecialPowers.spawn(
    tab.linkedBrowser,
    [],
    () => content.document.cookie
  );
}

add_setup(async function () {
  await TestUtils.waitForCondition(
    () => isolation(),
    "Isolated spaces started in the window"
  );
  registerCleanupFunction(async () => {
    for (const uuid of createdSpaces.reverse()) {
      if (space(uuid)) {
        await gZenWorkspaces.removeWorkspace(uuid);
      }
    }
    for (const id of createdContainers) {
      ContextualIdentityService.remove(id);
    }
    for (const id of JSON.parse(
      Services.prefs.getStringPref("peppermint.spaces.created-containers", "[]")
    )) {
      await Isolated.deleteContainer(id);
    }
    Services.prefs.clearUserPref("peppermint.spaces.isolated");
    Services.prefs.clearUserPref("peppermint.spaces.created-containers");
    Isolated.resetForTesting();
  });
});
