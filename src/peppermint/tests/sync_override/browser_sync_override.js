/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);
const { Service } = ChromeUtils.importESModule(
  "resource://services-sync/service.sys.mjs"
);
const { Observers } = ChromeUtils.importESModule(
  "resource://services-common/observers.sys.mjs"
);
const { UIState } = ChromeUtils.importESModule(
  "resource://services-sync/UIState.sys.mjs"
);
const { DIALOG_URL, MODES, REASONS, PeppermintSyncOverride } =
  ChromeUtils.importESModule(
    "moz-src:///peppermint/sync-override/PeppermintSyncOverride.sys.mjs"
  );
const { PeppermintNotesEngine, PeppermintNotesRecord } =
  ChromeUtils.importESModule(
    "resource:///modules/zen/notepad/PeppermintNotesSync.sys.mjs"
  );

let sandbox;
let engines;
let syncCalls;
let failingSyncs;
let serverInfo;

/**
 * A stand-in engine that records which override steps ran on it.
 *
 * @param {string} name
 * @param {object} [ids]
 * @param {string[]} [ids.localIds] Items on this device.
 * @param {string[]} [ids.serverIds] Items on the server.
 */
function fakeEngine(name, ids = {}) {
  const { localIds = ["a"], serverIds = [] } = ids;
  const engine = {
    name,
    enabled: true,
    calls: [],
    serverIds: new Set(serverIds),
    posted: [],
    service: { collectionKeys: { keyForCollection: () => null } },
    _store: {
      getAllIDs: async () => Object.fromEntries(localIds.map(id => [id, true])),
    },
    _recordObj: class {
      constructor(collection, id) {
        this.id = id;
      }
      async encrypt() {}
      toJSON() {
        return { id: this.id, payload: "{}" };
      }
    },
    async canDecrypt() {
      return true;
    },
    async wipeClient() {
      engine.calls.push("wipeClient");
    },
    async wipeServer() {
      engine.calls.push("wipeServer");
      engine.serverIds = new Set();
    },
    itemSource() {
      const collection = {
        full: true,
        async get() {
          return {
            success: true,
            status: 200,
            obj: [...engine.serverIds],
            headers: { "x-last-modified": "1" },
          };
        },
        newPostQueue(log, timestamp, callback) {
          const queued = [];
          return {
            async enqueue(record) {
              queued.push(record.id);
              return { enqueued: true };
            },
            async flush() {
              engine.posted.push(...queued);
              await callback(this, { success: true, obj: { failed: {} } });
            },
          };
        },
      };
      return collection;
    },
  };
  return engine;
}

add_setup(async function () {
  await Service.promiseInitialized;
  sandbox = sinon.createSandbox();
  sandbox.stub(UIState, "get").returns({
    status: UIState.STATUS_SIGNED_IN,
    syncEnabled: true,
  });
  sandbox.stub(Service, "isLoggedIn").get(() => true);
  sandbox.stub(Service, "engineManager").value({
    get: name => engines[name],
  });
  sandbox.stub(Service, "_fetchInfo").callsFake(async () => ({
    obj: serverInfo,
  }));
  sandbox.stub(Service, "sync").callsFake(async ({ engines: names, why }) => {
    syncCalls.push({ names, why });
    for (const name of names) {
      if (failingSyncs.has(name)) {
        Observers.notify("weave:engine:sync:error", new Error("test"), name);
      } else {
        Services.obs.notifyObservers(null, "weave:engine:sync:finish", name);
      }
    }
  });
  registerCleanupFunction(() => sandbox.restore());
});

function reset(list, info = {}) {
  engines = Object.fromEntries(list.map(engine => [engine.name, engine]));
  serverInfo = info;
  syncCalls = [];
  failingSyncs = new Set();
}

add_task(async function test_rebase_wipes_and_downloads_only_chosen_types() {
  const bookmarks = fakeEngine("bookmarks");
  const passwords = fakeEngine("passwords");
  const prefs = fakeEngine("prefs");
  reset([bookmarks, passwords, prefs], { bookmarks: 1, prefs: 1 });

  const result = await PeppermintSyncOverride.run(MODES.REBASE, [
    "bookmarks",
    "passwords",
  ]);

  Assert.deepEqual(bookmarks.calls, ["wipeClient"], "bookmarks are wiped");
  Assert.deepEqual(passwords.calls, [], "a type missing on the server is kept");
  Assert.deepEqual(prefs.calls, [], "an unchosen type is untouched");
  Assert.deepEqual(syncCalls, [{ names: ["bookmarks"], why: "rebase" }]);
  Assert.deepEqual(result.done, ["bookmarks"]);
  Assert.deepEqual(result.skipped, [
    { name: "passwords", reason: REASONS.EMPTY_SERVER },
  ]);
  Assert.ok(!PeppermintSyncOverride.running, "the override finished");
  Assert.ok(!Service.locked, "the Sync lock is released");
});

add_task(async function test_rebase_never_wipes_what_it_cannot_read() {
  const history = fakeEngine("history");
  history.canDecrypt = async () => false;
  reset([history], { history: 1 });

  const result = await PeppermintSyncOverride.run(MODES.REBASE, ["history"]);
  Assert.deepEqual(history.calls, [], "nothing is wiped");
  Assert.deepEqual(result.failed, [
    { name: "history", reason: REASONS.UNDECRYPTABLE },
  ]);
  Assert.deepEqual(syncCalls, [], "and nothing syncs");
});

add_task(async function test_rebase_reports_a_failed_download() {
  const forms = fakeEngine("forms");
  reset([forms], { forms: 1 });
  failingSyncs.add("forms");

  const result = await PeppermintSyncOverride.run(MODES.REBASE, ["forms"]);
  Assert.deepEqual(result.done, []);
  Assert.deepEqual(result.failed, [{ name: "forms", reason: REASONS.ERROR }]);
});

add_task(async function test_rebase_replays_notes_without_uploading() {
  const notes = new PeppermintNotesEngine(Service);
  await notes.initialize();
  const tracker = notes._tracker;

  // The real store's apply path is covered by notepad/browser_notes_sync.js;
  // an in-memory copy keeps this test away from the OS key store.
  const shared = crypto.randomUUID();
  const localOnly = crypto.randomUUID();
  const remoteOnly = crypto.randomUUID();
  const local = new Map([
    [shared, "# Edited here\n"],
    [localOnly, "# Only here\n"],
  ]);
  const ignoredWhileApplying = [];
  sandbox
    .stub(notes._store, "getAllIDs")
    .callsFake(async () =>
      Object.fromEntries([...local.keys()].map(id => [id, true]))
    );
  sandbox.stub(notes._store, "applyIncomingBatch").callsFake(async records => {
    ignoredWhileApplying.push(tracker.ignoreAll);
    for (const record of records) {
      if (record.deleted) {
        local.delete(record.id);
      } else {
        local.set(record.id, record.cleartext.markdown);
      }
    }
    return [];
  });

  try {
    await tracker.addChangedID(shared);
    await tracker.addChangedID(localOnly);

    const server = [
      [shared, "# From the Mac\n"],
      [remoteOnly, "# Also from the Mac\n"],
    ].map(([id, markdown]) => {
      const record = new PeppermintNotesRecord("notes", id);
      record.cleartext = { id, markdown, title: null, url: null };
      record.decrypt = async () => {};
      return record;
    });
    sandbox.stub(notes, "itemSource").returns({
      async getBatched() {
        return {
          response: { success: true, headers: { "x-last-modified": "1234.5" } },
          records: server,
        };
      },
    });
    sandbox.stub(Service.collectionKeys, "keyForCollection").returns(null);
    sandbox.stub(notes, "canDecrypt").resolves(true);
    sandbox.stub(notes, "enabled").get(() => true);
    reset([notes], { notes: 1 });

    const result = await PeppermintSyncOverride.run(MODES.REBASE, ["notes"]);
    Assert.deepEqual(result.done, ["notes"]);
    Assert.deepEqual(syncCalls, [], "replayed types need no extra sync");
    Assert.deepEqual(
      ignoredWhileApplying,
      [true],
      "applying the server copy is not tracked as a local change"
    );
    Assert.equal(
      local.get(shared),
      "# From the Mac\n",
      "a note edited here goes back to the account's text"
    );
    Assert.ok(!local.has(localOnly), "a note only on this device goes");
    Assert.equal(
      local.get(remoteOnly),
      "# Also from the Mac\n",
      "a note only in the account arrives"
    );
    Assert.deepEqual(
      await tracker.getChangedIDs(),
      {},
      "nothing is left to upload"
    );
    Assert.equal(
      await notes.getLastSync(),
      1234.5,
      "the next sync starts here"
    );
  } finally {
    tracker.clearChangedIDs();
    await notes.resetLastSync();
    await notes.finalize();
  }
});

add_task(async function test_push_replaces_the_server_copy() {
  const passwords = fakeEngine("passwords", {
    localIds: ["kept", "new"],
    serverIds: ["kept", "gone"],
  });
  const forms = fakeEngine("forms", { localIds: [] });
  reset([passwords, forms]);
  // The upload puts every local item back on the server.
  Service.sync.callsFake(async ({ engines: names, why }) => {
    syncCalls.push({ names, why });
    passwords.serverIds = new Set(["kept", "new"]);
    for (const name of names) {
      Services.obs.notifyObservers(null, "weave:engine:sync:finish", name);
    }
  });

  const result = await PeppermintSyncOverride.run(MODES.PUSH, [
    "passwords",
    "forms",
  ]);
  Assert.deepEqual(passwords.calls, ["wipeServer"]);
  Assert.deepEqual(forms.calls, [], "an empty local type is not pushed");
  Assert.deepEqual(syncCalls, [{ names: ["passwords"], why: "push" }]);
  Assert.deepEqual(
    passwords.posted,
    ["gone"],
    "items deleted here are tombstoned for other devices"
  );
  Assert.deepEqual(result.done, ["passwords"]);
  Assert.deepEqual(result.skipped, [
    { name: "forms", reason: REASONS.EMPTY_LOCAL },
  ]);
});

add_task(async function test_push_never_tombstones_history() {
  const history = fakeEngine("history", { serverIds: ["old"] });
  reset([history]);
  Service.sync.callsFake(async ({ engines: names }) => {
    syncCalls.push(names);
    history.serverIds = new Set(["a"]);
    for (const name of names) {
      Services.obs.notifyObservers(null, "weave:engine:sync:finish", name);
    }
  });

  const result = await PeppermintSyncOverride.run(MODES.PUSH, ["history"]);
  Assert.deepEqual(result.done, ["history"]);
  Assert.deepEqual(history.posted, [], "older history stays in the account");
});

add_task(async function test_override_waits_for_a_running_sync() {
  const prefs = fakeEngine("prefs");
  reset([prefs], { prefs: 1 });
  Assert.ok(Service.lock(), "a sync holds the lock");
  const run = PeppermintSyncOverride.run(MODES.REBASE, ["prefs"]);
  await TestUtils.waitForTick();
  Assert.deepEqual(prefs.calls, [], "nothing happens while Sync is busy");
  Service.unlock();
  const result = await run;
  Assert.deepEqual(prefs.calls, ["wipeClient"], "then the rebase runs");
  Assert.deepEqual(result.done, ["prefs"]);
});

add_task(async function test_dialog_lists_types_with_history_unchecked() {
  for (const mode of Object.values(MODES)) {
    reset([fakeEngine("bookmarks"), fakeEngine("history"), fakeEngine("tabs")]);
    const closed = PeppermintSyncOverride.openDialog(window, mode);
    await TestUtils.waitForCondition(
      () =>
        window.gDialogBox.dialog?._frame?.contentDocument?.querySelectorAll(
          "checkbox"
        ).length,
      "the types are listed"
    );
    const frame = window.gDialogBox.dialog._frame;
    const doc = frame.contentDocument;
    const boxes = [...doc.querySelectorAll("checkbox")];
    Assert.deepEqual(
      boxes.map(b => b.getAttribute("value")),
      ["bookmarks", "history"],
      `${mode}: per-device types are never offered`
    );
    Assert.ok(boxes[0].checked, "most types start checked");
    Assert.ok(!boxes[1].checked, "history starts unchecked");
    Assert.ok(
      doc.getElementById("syncOverrideHistoryNote").hidden,
      "the history note shows only once history is picked"
    );
    EventUtils.synthesizeMouseAtCenter(boxes[1], {}, frame.contentWindow);
    Assert.ok(boxes[1].checked, "history can be picked");
    Assert.ok(
      !doc.getElementById("syncOverrideHistoryNote").hidden,
      "picking history explains the 5,000 entry limit"
    );
    Assert.equal(frame.contentWindow.location.href, DIALOG_URL);
    doc.getElementById("syncOverrideDialog").cancelDialog();
    await closed;
  }
});
