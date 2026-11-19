/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * One-shot Sync overrides, like git's forced pull and push.
 *
 * Rebase makes this device match the Sync server for the chosen types and
 * never uploads this device's unsynced changes. Push makes the server match
 * this device and leaves other devices to pick it up on their next sync.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
  UIState: "resource://services-sync/UIState.sys.mjs",
  Utils: "resource://services-sync/util.sys.mjs",
  Weave: "resource://services-sync/main.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "log", () =>
  console.createInstance({
    prefix: "PeppermintSyncOverride",
    maxLogLevel: "Warn",
  })
);

export const DIALOG_URL =
  "chrome://browser/content/peppermint-sync-override/syncOverride.xhtml";

const FTL_FILE = "browser/peppermint-sync-override.ftl";

export const MODES = Object.freeze({ REBASE: "rebase", PUSH: "push" });

/**
 * The types a user can override, in the order Settings lists them. Tabs and
 * clients describe each device and are never overridden. `optIn` types start
 * unchecked.
 */
export const ENGINES = Object.freeze([
  { name: "bookmarks", l10nId: "sync-engine-bookmarks" },
  { name: "history", l10nId: "sync-engine-history", optIn: true },
  { name: "passwords", l10nId: "sync-engine-passwords" },
  { name: "addresses", l10nId: "sync-engine-addresses" },
  { name: "creditcards", l10nId: "sync-engine-payment-methods2" },
  { name: "addons", l10nId: "sync-engine-addons" },
  { name: "prefs", l10nId: "sync-engine-settings" },
  { name: "spaces", l10nId: "sync-engine-workspaces" },
  { name: "notes", l10nId: "sync-engine-notes" },
  { name: "forms", l10nId: "peppermint-sync-override-engine-forms" },
]);

// Engines whose store.wipe() deliberately keeps local data (turning Sync off
// must never delete them), so a rebase replays the server state instead.
const REPLAY_ENGINES = new Set(["spaces", "notes"]);

// The server keeps history this device never downloaded (Sync only fetches
// the newest entries), so a push must not tombstone what it doesn't see.
const NO_TOMBSTONE_ENGINES = new Set(["history"]);

const PANEL_BUTTONS = Object.freeze({
  [MODES.REBASE]: "PanelUI-fxa-menu-rebase-sync-button",
  [MODES.PUSH]: "PanelUI-fxa-menu-push-sync-button",
});

const IDLE_TIMEOUT_MS = 60 * 1000;
const IDLE_POLL_MS = 250;

export const REASONS = Object.freeze({
  EMPTY_SERVER: "empty-server",
  EMPTY_LOCAL: "empty-local",
  LOCKED: "locked",
  UNDECRYPTABLE: "undecryptable",
  ERROR: "error",
});

export class SyncOverrideError extends Error {
  constructor(code) {
    super(`Sync override failed: ${code}`);
    this.code = code;
  }
}

function sleep(ms) {
  return new Promise(resolve => lazy.setTimeout(resolve, ms));
}

class nsPeppermintSyncOverride {
  #running = false;

  get running() {
    return this.#running;
  }

  /** Whether Sync is signed in and turned on, so an override can run. */
  get isAvailable() {
    const state = lazy.UIState.get();
    return state.status === lazy.UIState.STATUS_SIGNED_IN && state.syncEnabled;
  }

  /** The overridable types this device currently syncs. */
  async availableEngines() {
    await lazy.Weave.Service.promiseInitialized;
    const manager = lazy.Weave.Service.engineManager;
    return ENGINES.filter(({ name }) => manager.get(name)?.enabled);
  }

  /**
   * Opens the override dialog over the browser window that owns `window`.
   *
   * @param {Window} window A browser window or a page inside one (Settings).
   * @param {string} mode One of MODES.
   * @returns {Promise} Resolves when the dialog closes.
   */
  openDialog(window, mode) {
    const browserWindow = window.browsingContext?.topChromeWindow ?? window;
    return browserWindow.gDialogBox.open(DIALOG_URL, { mode });
  }

  /**
   * Wires the account panel buttons of a browser window.
   *
   * @param {Window} window
   */
  initWindow(window) {
    const buttons = [];
    for (const [mode, id] of Object.entries(PANEL_BUTTONS)) {
      const button = window.PanelMultiView.getViewNode(window.document, id);
      if (!button) {
        continue;
      }
      button.addEventListener("command", () => {
        window.CustomizableUI.hidePanelForNode(button);
        this.openDialog(window, mode);
      });
      buttons.push(button);
    }
    if (!buttons.length) {
      return;
    }
    window.MozXULElement.insertFTLIfNeeded(FTL_FILE);
    const update = () => {
      const hidden = !this.isAvailable;
      for (const button of buttons) {
        button.hidden = hidden;
      }
    };
    update();
    Services.obs.addObserver(update, "sync-ui-state:update");
    window.addEventListener(
      "unload",
      () => Services.obs.removeObserver(update, "sync-ui-state:update"),
      { once: true }
    );
  }

  /**
   * Runs an override for the given engine names.
   *
   * @param {string} mode One of MODES.
   * @param {string[]} names Engine names, see ENGINES.
   * @returns {Promise<{done: string[], skipped: object[], failed: object[]}>}
   *   `skipped` and `failed` hold `{ name, reason }` with a REASONS value.
   */
  async run(mode, names) {
    if (!Object.values(MODES).includes(mode)) {
      throw new TypeError(`Unknown sync override mode: ${mode}`);
    }
    if (this.#running) {
      throw new SyncOverrideError("busy");
    }
    this.#running = true;
    Services.obs.notifyObservers(null, "peppermint-sync-override", "start");
    try {
      return await this.#run(mode, names);
    } finally {
      this.#running = false;
      Services.obs.notifyObservers(null, "peppermint-sync-override", "finish");
    }
  }

  async #run(mode, names) {
    const service = lazy.Weave.Service;
    await service.promiseInitialized;
    if (!this.isAvailable) {
      throw new SyncOverrideError("not-configured");
    }
    if (!service.isLoggedIn && !(await service.login({ prompt: true }))) {
      throw new SyncOverrideError("login");
    }

    const result = { done: [], skipped: [], failed: [] };
    const allowed = new Set(ENGINES.map(({ name }) => name));
    let engines = names
      .filter(name => allowed.has(name))
      .map(name => service.engineManager.get(name))
      .filter(engine => engine?.enabled);

    if (
      engines.some(engine => engine.name == "passwords") &&
      lazy.Utils.mpLocked() &&
      !lazy.Utils.ensureMPUnlocked()
    ) {
      result.failed.push({ name: "passwords", reason: REASONS.LOCKED });
      engines = engines.filter(engine => engine.name != "passwords");
    }

    lazy.log.info(`Starting ${mode} for ${engines.map(e => e.name)}`);
    const step =
      mode == MODES.REBASE
        ? await this.#rebaseLocal(service, engines, result)
        : await this.#pushLocal(service, engines, result);

    const why = mode;
    const synced = await this.#syncEngines(
      service,
      step.toSync.map(entry => entry.engine.name),
      why
    );
    for (const entry of step.toSync) {
      const { name } = entry.engine;
      if (!synced.has(name)) {
        result.failed.push({ name, reason: REASONS.ERROR });
        continue;
      }
      try {
        if (entry.before) {
          await this.#tombstoneMissing(entry.engine, entry.before);
        }
        result.done.push(name);
      } catch (error) {
        lazy.log.error(`Could not finish ${mode} of ${name}`, error);
        result.failed.push({ name, reason: REASONS.ERROR });
      }
    }
    lazy.log.info(`Finished ${mode}`, result);
    return result;
  }

  async #rebaseLocal(service, engines, result) {
    const toSync = [];
    await this.#lock(service);
    try {
      const info = (await service._fetchInfo()).obj || {};
      for (const engine of engines) {
        const { name } = engine;
        try {
          if (!(name in info)) {
            result.skipped.push({ name, reason: REASONS.EMPTY_SERVER });
            continue;
          }
          if (!(await engine.canDecrypt())) {
            result.failed.push({ name, reason: REASONS.UNDECRYPTABLE });
            continue;
          }
          if (REPLAY_ENGINES.has(name)) {
            await this.#replayServer(engine);
            result.done.push(name);
          } else {
            await engine.wipeClient();
            toSync.push({ engine });
          }
        } catch (error) {
          lazy.log.error(`Could not rebase ${name}`, error);
          result.failed.push({ name, reason: REASONS.ERROR });
        }
      }
    } finally {
      service.unlock();
    }
    return { toSync };
  }

  async #pushLocal(service, engines, result) {
    const toSync = [];
    await this.#lock(service);
    try {
      for (const engine of engines) {
        const { name } = engine;
        try {
          if (await this.#isLocallyEmpty(engine)) {
            result.skipped.push({ name, reason: REASONS.EMPTY_LOCAL });
            continue;
          }
          const before = NO_TOMBSTONE_ENGINES.has(name)
            ? null
            : (await this.#serverIds(engine)).ids;
          // Deletes the collection and resets the local sync state, so the
          // next sync of this engine uploads every local item and has
          // nothing to download.
          await engine.wipeServer();
          toSync.push({ engine, before });
        } catch (error) {
          lazy.log.error(`Could not push ${name}`, error);
          result.failed.push({ name, reason: REASONS.ERROR });
        }
      }
    } finally {
      service.unlock();
    }
    return { toSync };
  }

  /**
   * Applies every server record of `engine` locally, plus tombstones for
   * local items the server doesn't have, without tracking any of it as a
   * local change.
   *
   * @param {SyncEngine} engine
   */
  async #replayServer(engine) {
    const key = engine.service.collectionKeys.keyForCollection(engine.name);
    const collection = engine.itemSource();
    collection.full = true;
    const { response, records } = await collection.getBatched();
    if (!response.success) {
      throw response;
    }
    for (const record of records) {
      await record.decrypt(key);
    }
    const serverIds = new Set(records.map(record => record.id));
    const localIds = Object.keys(await engine._store.getAllIDs());
    for (const id of localIds) {
      if (!serverIds.has(id)) {
        const tombstone = new engine._recordObj(engine.name, id);
        tombstone.deleted = true;
        records.push(tombstone);
      }
    }

    engine._tracker.ignoreAll = true;
    let failed;
    try {
      failed = await engine._store.applyIncomingBatch(records, null);
      await engine._tracker.asyncObserver?.promiseObserversComplete();
    } finally {
      engine._tracker.ignoreAll = false;
    }
    await engine._tracker.clearChangedIDs();
    const modified = parseFloat(response.headers["x-last-modified"]);
    if (modified) {
      await engine.setLastSync(modified);
    }
    if (failed?.length) {
      throw new Error(`${failed.length} ${engine.name} records did not apply`);
    }
  }

  async #isLocallyEmpty(engine) {
    if (engine.name == "bookmarks") {
      const { bookmarks } = lazy.PlacesUtils;
      const db = await lazy.PlacesUtils.promiseDBConnection();
      const rows = await db.execute(
        `SELECT EXISTS(
           SELECT 1 FROM moz_bookmarks b
           JOIN moz_bookmarks p ON p.id = b.parent
           WHERE p.guid IN (:menu, :toolbar, :unfiled, :mobile)
         ) AS found`,
        {
          menu: bookmarks.menuGuid,
          toolbar: bookmarks.toolbarGuid,
          unfiled: bookmarks.unfiledGuid,
          mobile: bookmarks.mobileGuid,
        }
      );
      return !rows[0].getResultByName("found");
    }
    try {
      return !Object.keys(await engine._store.getAllIDs()).length;
    } catch (error) {
      lazy.log.debug(`Can't list local ${engine.name} items`, error);
      return false;
    }
  }

  async #serverIds(engine) {
    const collection = engine.itemSource();
    collection.full = false;
    const response = await collection.get();
    if (response.status == 404) {
      return { ids: new Set(), modified: 0 };
    }
    if (!response.success) {
      throw response;
    }
    return {
      ids: new Set(response.obj),
      modified: parseFloat(response.headers["x-last-modified"]) || 0,
    };
  }

  /**
   * After a push, uploads tombstones for items the server held before the
   * push and no longer does, so other devices delete them too. Retries once
   * if something else wrote to the collection in between.
   *
   * @param {SyncEngine} engine
   * @param {Set<string>} before Server ids from before the push.
   * @param {number} [attempt]
   */
  async #tombstoneMissing(engine, before, attempt = 0) {
    const after = await this.#serverIds(engine);
    const missing = [...before].filter(id => !after.ids.has(id));
    if (!missing.length) {
      return;
    }
    const key = engine.service.collectionKeys.keyForCollection(engine.name);
    const failed = [];
    const queue = engine
      .itemSource()
      .newPostQueue(lazy.log, after.modified, async (_queue, response) => {
        if (!response.success) {
          throw response;
        }
        failed.push(...Object.keys(response.obj.failed || {}));
      });
    try {
      for (const id of missing) {
        const tombstone = new engine._recordObj(engine.name, id);
        tombstone.deleted = true;
        await tombstone.encrypt(key);
        const { enqueued, error } = await queue.enqueue(tombstone);
        if (!enqueued) {
          throw error;
        }
      }
      await queue.flush(true);
    } catch (error) {
      if (error?.status == 412 && !attempt) {
        await this.#tombstoneMissing(engine, before, attempt + 1);
        return;
      }
      throw error;
    }
    if (failed.length) {
      throw new Error(`${failed.length} ${engine.name} tombstones failed`);
    }
  }

  /**
   * Syncs `names` and returns the ones that synced without an error. A
   * scheduled sync that grabs the lock first is waited out and retried once.
   *
   * @param {object} service The Sync service.
   * @param {string[]} names Engine names.
   * @param {string} why The reason Sync records for this sync.
   * @returns {Promise<Set<string>>}
   */
  async #syncEngines(service, names, why) {
    const synced = new Set();
    if (!names.length) {
      return synced;
    }
    const failed = new Set();
    const onFinish = (_subject, _topic, name) => {
      if (names.includes(name) && !failed.has(name)) {
        synced.add(name);
      }
    };
    const onError = (_subject, _topic, name) => {
      if (names.includes(name)) {
        failed.add(name);
        synced.delete(name);
      }
    };
    Services.obs.addObserver(onFinish, "weave:engine:sync:finish");
    Services.obs.addObserver(onError, "weave:engine:sync:error");
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const pending = names.filter(
          name => !synced.has(name) && !failed.has(name)
        );
        if (!pending.length) {
          break;
        }
        await this.#waitUntilIdle(service);
        await service.sync({ engines: pending, why });
      }
    } finally {
      Services.obs.removeObserver(onFinish, "weave:engine:sync:finish");
      Services.obs.removeObserver(onError, "weave:engine:sync:error");
    }
    return synced;
  }

  async #waitUntilIdle(service) {
    const deadline = Date.now() + IDLE_TIMEOUT_MS;
    while (service.locked) {
      if (Date.now() > deadline) {
        throw new SyncOverrideError("busy");
      }
      await sleep(IDLE_POLL_MS);
    }
  }

  async #lock(service) {
    const deadline = Date.now() + IDLE_TIMEOUT_MS;
    while (!service.lock()) {
      if (Date.now() > deadline) {
        throw new SyncOverrideError("busy");
      }
      await sleep(IDLE_POLL_MS);
    }
  }
}

export const PeppermintSyncOverride = new nsPeppermintSyncOverride();
