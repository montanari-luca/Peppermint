/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { ZenSessionStore } = ChromeUtils.importESModule(
  "resource:///modules/zen/ZenSessionManager.sys.mjs"
);
const { ZenLiveFoldersManager } = ChromeUtils.importESModule(
  "resource:///modules/zen/ZenLiveFoldersManager.sys.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const COLLECTED_TOPIC = "zen-sidebar-data-collected";

function browserState() {
  return JSON.parse(SessionStore.getBrowserState());
}

function withSpaceTheme(state, changes) {
  const space = state.windows[0].spaces[0];
  space.theme = { ...(space.theme || {}), ...changes };
  return state;
}

let sandbox;
let writes;
let collected = 0;
const collectedObserver = () => collected++;

add_setup(async function () {
  sandbox = sinon.createSandbox();
  // Each sidebar write also saves the live folders, so this counts writes.
  writes = sandbox.spy(ZenLiveFoldersManager, "saveState");
  Services.obs.addObserver(collectedObserver, COLLECTED_TOPIC);
  registerCleanupFunction(() => {
    Services.obs.removeObserver(collectedObserver, COLLECTED_TOPIC);
    sandbox.restore();
    ZenSessionStore.saveState(browserState(), true);
  });
  Assert.ok(
    browserState().windows[0].spaces?.length,
    "The window state carries its spaces."
  );
});

add_task(async function test_identical_sidebar_is_not_written_again() {
  ZenSessionStore.saveState(browserState(), true);
  const writesBefore = writes.callCount;
  const collectedBefore = collected;

  ZenSessionStore.saveState(browserState(), true);

  Assert.equal(
    writes.callCount,
    writesBefore,
    "An identical sidebar skips the write."
  );
  Assert.equal(
    collected,
    collectedBefore + 1,
    "Sync still hears about freshly collected sidebar data."
  );
});

add_task(async function test_theme_only_change_is_written() {
  ZenSessionStore.saveState(browserState(), true);
  const writesBefore = writes.callCount;

  ZenSessionStore.saveState(
    withSpaceTheme(browserState(), { opacity: 0.4242 }),
    true
  );

  Assert.equal(
    writes.callCount,
    writesBefore + 1,
    "A change to a space's gradient alone is written."
  );
  Assert.equal(
    ZenSessionStore.getSidebarData().spaces[0].theme.opacity,
    0.4242,
    "The sidebar data holds the new gradient."
  );
});

add_task(async function test_folder_only_change_is_written() {
  const state = browserState();
  state.windows[0].folders = [
    ...(state.windows[0].folders || []),
    {
      id: "peppermint-test-folder",
      name: "Test",
      workspaceId: state.windows[0].spaces[0].uuid,
      collapsed: false,
    },
  ];
  ZenSessionStore.saveState(state, true);
  const writesBefore = writes.callCount;

  state.windows[0].folders.at(-1).collapsed = true;
  ZenSessionStore.saveState(state, true);

  Assert.equal(
    writes.callCount,
    writesBefore + 1,
    "Collapsing a folder alone is written."
  );
});
