/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tabs that were archived or snoozed. They live in
 * `<profile>/tab-archive.json`: a record keeps what is needed to open the page
 * again in its Space, nothing of the page itself.
 *
 * A record is `{ id, kind, url, title, workspaceId, workspaceName,
 * userContextId, lastAccessed, archivedAt, wakeAt }`. `kind` is "archive" for
 * a tab that sat idle or was archived by hand, and "snooze" for a tab that
 * comes back at `wakeAt`.
 */

const FILE_NAME = "tab-archive.json";
const FILE_VERSION = 1;
const MAX_ARCHIVED = 1000;
// Changes close together (an idle sweep archives many tabs) share one write.
const WRITE_DELAY_MS = 1000;

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  DeferredTask: "resource://gre/modules/DeferredTask.sys.mjs",
});

/** Notifies when the records change; the subject is null, data the id. */
export const STORE_CHANGED_TOPIC = "peppermint-tab-archive-store-changed";

let recordsPromise = null;
// Changes run one after another, so two never overwrite each other.
let writeQueue = Promise.resolve();
let writeTask = null;
// Writes to disk run one after another too.
let diskWrite = Promise.resolve();
let blockerAdded = false;

function filePath() {
  return PathUtils.join(PathUtils.profileDir, FILE_NAME);
}

/**
 * Chooses which archived records to drop so no more than `limit` stay, oldest
 * first. Snoozed tabs are a promise to the user, so they are never chosen.
 *
 * @param {object[]} records
 * @param {number} limit
 * @returns {string[]} Ids to delete
 */
export function pickEvictions(records, limit = MAX_ARCHIVED) {
  const archived = records
    .filter(record => record.kind == "archive")
    .sort((a, b) => a.archivedAt - b.archivedAt);
  return archived.slice(0, Math.max(0, archived.length - limit)).map(r => r.id);
}

function isValidRecord(record) {
  return (
    typeof record?.id == "string" &&
    typeof record.url == "string" &&
    (record.kind == "archive" || record.kind == "snooze")
  );
}

function load() {
  recordsPromise ??= (async () => {
    try {
      const data = await IOUtils.readJSON(filePath());
      if (data?.version === FILE_VERSION && Array.isArray(data.records)) {
        return new Map(
          data.records.filter(isValidRecord).map(record => [record.id, record])
        );
      }
    } catch (error) {
      if (error?.name !== "NotFoundError") {
        console.error("The tab archive could not be read", error);
      }
    }
    return new Map();
  })();
  return recordsPromise;
}

function enqueue(task) {
  const run = writeQueue.then(task);
  writeQueue = run.catch(() => {});
  return run;
}

function writeNow() {
  const run = diskWrite.then(async () => {
    const records = await load();
    await IOUtils.writeJSON(
      filePath(),
      { version: FILE_VERSION, records: [...records.values()] },
      { tmpPath: `${filePath()}.tmp` }
    );
  });
  diskWrite = run.catch(() => {});
  return run;
}

function scheduleWrite() {
  if (!blockerAdded) {
    blockerAdded = true;
    IOUtils.profileBeforeChange.addBlocker("Peppermint tab archive", () =>
      flushStore()
    );
  }
  writeTask ??= new lazy.DeferredTask(
    () =>
      writeNow().catch(error =>
        console.error("The tab archive could not be saved", error)
      ),
    WRITE_DELAY_MS
  );
  writeTask.arm();
}

function notifyChanged(id) {
  Services.obs.notifyObservers(null, STORE_CHANGED_TOPIC, id || "");
}

/**
 * @param {object} record - Without `id`, which is made here
 * @returns {Promise<object>} The stored record
 */
export async function addRecord(record) {
  const stored = { ...record, id: crypto.randomUUID() };
  await enqueue(async () => {
    const records = await load();
    records.set(stored.id, stored);
    for (const id of pickEvictions([...records.values()])) {
      records.delete(id);
    }
    scheduleWrite();
  });
  notifyChanged(stored.id);
  return stored;
}

/**
 * @param {string} id
 * @returns {Promise<boolean>} A record was removed
 */
export async function removeRecord(id) {
  const removed = await enqueue(async () => {
    const records = await load();
    if (!records.delete(id)) {
      return false;
    }
    scheduleWrite();
    return true;
  });
  if (removed) {
    notifyChanged(id);
  }
  return removed;
}

/**
 * Remove every record of one kind.
 *
 * @param {"archive"|"snooze"} kind
 */
export async function clearRecords(kind) {
  await enqueue(async () => {
    const records = await load();
    for (const [id, record] of records) {
      if (record.kind == kind) {
        records.delete(id);
      }
    }
    scheduleWrite();
  });
  notifyChanged();
}

/**
 * @returns {Promise<object[]>} Records, the most recently archived first
 */
export async function listRecords() {
  return [...(await load()).values()].sort(
    (a, b) => b.archivedAt - a.archivedAt
  );
}

/**
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getRecord(id) {
  return (await load()).get(id) ?? null;
}

/**
 * @param {number} now - Milliseconds since 1970
 * @returns {Promise<object[]>} Snoozed tabs whose time has come, earliest first
 */
export async function dueSnoozes(now) {
  return (await listRecords())
    .filter(record => record.kind == "snooze" && record.wakeAt <= now)
    .sort((a, b) => a.wakeAt - b.wakeAt);
}

/**
 * @returns {Promise<number|null>} When the next snoozed tab comes back, or null
 */
export async function nextWakeTime() {
  const times = (await listRecords())
    .filter(record => record.kind == "snooze")
    .map(record => record.wakeAt);
  return times.length ? Math.min(...times) : null;
}

/**
 * @returns {Promise<void>} Resolves once every change so far is on disk
 */
export async function flushStore() {
  await writeQueue;
  if (writeTask?.isArmed) {
    writeTask.disarm();
    await writeNow();
  }
  await diskWrite;
}

/**
 * Forget the in-memory records so the next call reads the disk again. Tests
 * use this after changing the profile directory.
 */
export function resetStoreForTests() {
  recordsPromise = null;
  writeQueue = Promise.resolve();
  writeTask?.disarm();
  writeTask = null;
  diskWrite = Promise.resolve();
}
