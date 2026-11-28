// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Isolated spaces: an isolated space owns a Firefox container (contextual
 * identity), so cookies, logins and site data in it never reach another space.
 *
 * Which spaces are isolated is kept in prefs (space id to container id), not
 * on the space object, because sync and share import rebuild space objects.
 * A space is isolated while its containerTabId still equals the recorded
 * container: picking another container, or deleting it, ends the isolation by
 * itself. Only containers that Peppermint created are ever deleted, together
 * with their site data, when no space uses them any more.
 *
 * This module holds the shared state and rules. PeppermintIsolatedSpacesWindow
 * keeps each window's tabs in their space's container, and Zen's space manager
 * asks resolveNewTabContainer() before it picks a container for a new tab
 * (peppermint/patches/spaces/zen__spaces__ZenSpaceManager.mjs.patch).
 */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  ContextualIdentityService:
    "moz-src:///toolkit/components/contextualidentity/ContextualIdentityService.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

const CLEAR_TIMEOUT_MS = 10000;

const PREF_ISOLATED = "peppermint.spaces.isolated";
const PREF_CREATED = "peppermint.spaces.created-containers";
const PREF_ISOLATE_NEW = "peppermint.spaces.isolate-new";
const PREF_CONTAINERS = "privacy.userContext.enabled";

const CONTAINER_ICON = "fingerprint";
const DEFAULT_NAME = "Space";

// Container colors and their hues, for a container that looks like its space.
const COLOR_HUES = [
  ["red", 0],
  ["orange", 30],
  ["yellow", 55],
  ["green", 120],
  ["turquoise", 175],
  ["blue", 215],
  ["purple", 275],
  ["pink", 320],
];

function readJSON(pref, fallback) {
  try {
    return JSON.parse(Services.prefs.getStringPref(pref, ""));
  } catch {
    return fallback;
  }
}

function hueOf([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) {
    return null;
  }
  const d = max - min;
  let h;
  if (max === r) {
    h = ((g - b) / d) % 6;
  } else if (max === g) {
    h = (b - r) / d + 2;
  } else {
    h = (r - g) / d + 4;
  }
  return (h * 60 + 360) % 360;
}

/**
 * The container color closest to the space's first gradient color, or one
 * picked from its id when the space has no colored theme.
 *
 * @param {object} space
 * @returns {string}
 */
export function colorForSpace(space) {
  const first = space?.theme?.gradientColors?.[0]?.c;
  const hue = Array.isArray(first) ? hueOf(first) : null;
  if (hue !== null) {
    let best = COLOR_HUES[0];
    for (const entry of COLOR_HUES) {
      const distance = Math.min(
        Math.abs(entry[1] - hue),
        360 - Math.abs(entry[1] - hue)
      );
      const bestDistance = Math.min(
        Math.abs(best[1] - hue),
        360 - Math.abs(best[1] - hue)
      );
      if (distance < bestDistance) {
        best = entry;
      }
    }
    return best[0];
  }
  let sum = 0;
  for (const char of String(space?.uuid ?? "")) {
    sum = (sum + char.charCodeAt(0)) % COLOR_HUES.length;
  }
  return COLOR_HUES[sum][0];
}

class IsolatedSpaces {
  #isolated = null;
  #created = null;
  #observing = false;

  #ensure() {
    if (this.#isolated) {
      return;
    }
    const isolated = readJSON(PREF_ISOLATED, {});
    this.#isolated = new Map(
      Object.entries(isolated && typeof isolated == "object" ? isolated : {})
        .map(([space, id]) => [space, Number(id)])
        .filter(([, id]) => Number.isInteger(id) && id > 0)
    );
    const created = readJSON(PREF_CREATED, []);
    this.#created = new Set(
      (Array.isArray(created) ? created : []).map(Number)
    );
    if (!this.#observing) {
      this.#observing = true;
      Services.prefs.addObserver(PREF_ISOLATED, this);
      Services.prefs.addObserver(PREF_CREATED, this);
      Services.obs.addObserver(this, "contextual-identity-deleted");
    }
  }

  observe(subject, topic) {
    if (topic === "nsPref:changed") {
      // Another window, a test or about:config changed the record.
      this.#isolated = null;
      this.#created = null;
      this.#ensure();
    } else if (topic === "contextual-identity-deleted") {
      const id = subject?.wrappedJSObject?.userContextId;
      if (this.#created?.delete(id)) {
        this.#saveCreated();
      }
    }
  }

  #saveIsolated() {
    Services.prefs.setStringPref(
      PREF_ISOLATED,
      JSON.stringify(Object.fromEntries(this.#isolated))
    );
  }

  #saveCreated() {
    Services.prefs.setStringPref(
      PREF_CREATED,
      JSON.stringify([...this.#created])
    );
  }

  /** Containers are a Firefox feature that can be turned off. */
  get available() {
    return Services.prefs.getBoolPref(PREF_CONTAINERS, false);
  }

  /** Whether new spaces get a container of their own. */
  get isolateNew() {
    return this.available && Services.prefs.getBoolPref(PREF_ISOLATE_NEW, true);
  }

  /** Whether any space is isolated, so callers can skip all work otherwise. */
  get any() {
    this.#ensure();
    return this.#isolated.size > 0;
  }

  /**
   * @param {object} space - A space object (uuid, containerTabId).
   * @returns {boolean}
   */
  isIsolated(space) {
    if (!space?.uuid || !(space.containerTabId > 0)) {
      return false;
    }
    this.#ensure();
    return this.#isolated.get(space.uuid) === space.containerTabId;
  }

  /** The container of an isolated space, or 0. */
  containerFor(space) {
    return this.isIsolated(space) ? space.containerTabId : 0;
  }

  /** Whether Peppermint created this container. */
  createdContainer(userContextId) {
    this.#ensure();
    return this.#created.has(userContextId);
  }

  /**
   * The isolated space that owns a container, if any.
   *
   * @param {number} userContextId
   * @param {object[]} spaces
   * @returns {object|null}
   */
  ownerOf(userContextId, spaces) {
    if (!(userContextId > 0)) {
      return null;
    }
    return (
      spaces.find(
        space =>
          this.isIsolated(space) && space.containerTabId === userContextId
      ) ?? null
    );
  }

  /**
   * Picks the container for a new tab when an isolated space is involved, in
   * the shape Zen's getContextIdIfNeeded() returns
   * ([userContextId, usesSpaceContainer, spaceIdToMoveTo]); null leaves the
   * choice to Zen.
   *
   * a) A tab that asks for the container of an isolated space opens in that
   *    space (unless a target space was given).
   * b) A tab whose target space (the given one, else the active space) is
   *    isolated gets that space's container, whatever was asked for.
   *
   * @param {object} spaceManager - The window's gZenWorkspaces.
   * @param {object} options
   * @param {number} [options.userContextId] - The container asked for.
   * @param {string} [options.targetSpaceId] - The space the tab is opened in.
   * @returns {Array|null}
   */
  resolveNewTabContainer(spaceManager, { userContextId, targetSpaceId } = {}) {
    if (!this.any || spaceManager.privateWindowOrDisabled) {
      return null;
    }
    const spaces = spaceManager.getWorkspaces();
    const active = spaceManager.getActiveWorkspaceFromCache();
    if (!targetSpaceId && typeof userContextId === "number") {
      const owner = this.ownerOf(userContextId, spaces);
      if (owner) {
        return [
          userContextId,
          true,
          owner.uuid !== active?.uuid ? owner.uuid : undefined,
        ];
      }
    }
    const target = targetSpaceId
      ? spaceManager.getWorkspaceFromId(targetSpaceId)
      : active;
    if (this.isIsolated(target)) {
      return [target.containerTabId, true, undefined];
    }
    return null;
  }

  /**
   * Turns isolation on for a space. The caller saves the space afterwards.
   *
   * "adopt" keeps the space's container when no other space uses it, so
   * nobody is signed out; "new" always creates one.
   *
   * @param {object} space - The space object, changed in place.
   * @param {object[]} spaces - Every space.
   * @param {object} [options]
   * @param {"adopt"|"new"} [options.mode]
   * @returns {number} The space's container, or 0 when containers are off.
   */
  isolate(space, spaces, { mode = "adopt" } = {}) {
    if (!this.available || !space?.uuid) {
      return 0;
    }
    this.#ensure();
    let id = space.containerTabId > 0 ? space.containerTabId : 0;
    const shared =
      id &&
      spaces.some(
        other => other.uuid !== space.uuid && other.containerTabId === id
      );
    const known =
      id && lazy.ContextualIdentityService.getPublicIdentityFromId(id);
    if (mode === "new" || !id || shared || !known) {
      const identity = lazy.ContextualIdentityService.create(
        space.name || DEFAULT_NAME,
        CONTAINER_ICON,
        colorForSpace(space)
      );
      id = identity.userContextId;
      this.#created.add(id);
      this.#saveCreated();
    }
    space.containerTabId = id;
    this.#isolated.set(space.uuid, id);
    this.#saveIsolated();
    return id;
  }

  /**
   * What turning isolation on would do: "adopt" (keeps sign-ins) or "new".
   *
   * @param {object} space
   * @param {object[]} spaces
   * @returns {"adopt"|"new"}
   */
  isolationKind(space, spaces) {
    const id = space?.containerTabId > 0 ? space.containerTabId : 0;
    if (!id || !lazy.ContextualIdentityService.getPublicIdentityFromId(id)) {
      return "new";
    }
    return spaces.some(
      other => other.uuid !== space.uuid && other.containerTabId === id
    )
      ? "new"
      : "adopt";
  }

  /**
   * Turns isolation off. The space keeps its container, so nothing is lost.
   *
   * @param {string} spaceId
   */
  unisolate(spaceId) {
    this.#ensure();
    if (this.#isolated.delete(spaceId)) {
      this.#saveIsolated();
    }
  }

  /**
   * Whether deleting the space would also delete its container and site data.
   *
   * @param {object} space
   * @param {object[]} spaces
   * @returns {boolean}
   */
  deletesDataWith(space, spaces) {
    return (
      this.isIsolated(space) &&
      this.createdContainer(space.containerTabId) &&
      !spaces.some(
        other =>
          other.uuid !== space.uuid &&
          other.containerTabId === space.containerTabId
      )
    );
  }

  /**
   * Called when a space was deleted: its record goes, and a container
   * Peppermint created for it goes too, with its site data, once no space
   * uses it.
   *
   * @param {string} spaceId
   * @param {number} userContextId - The deleted space's container.
   * @param {object[]} remaining - The spaces left.
   * @returns {Promise<boolean>} Whether a container was deleted.
   */
  async onSpaceRemoved(spaceId, userContextId, remaining) {
    this.#ensure();
    const recorded = this.#isolated.get(spaceId);
    this.unisolate(spaceId);
    const id = recorded || userContextId;
    if (
      !this.#created.has(id) ||
      remaining.some(space => space.containerTabId === id)
    ) {
      return false;
    }
    await this.deleteContainer(id);
    return true;
  }

  /**
   * Closes the container's tabs, deletes its site data and the container.
   * Only for containers Peppermint created.
   *
   * @param {number} userContextId
   */
  async deleteContainer(userContextId) {
    this.#ensure();
    if (!this.#created.has(userContextId)) {
      return;
    }
    try {
      await lazy.ContextualIdentityService.closeContainerTabs(userContextId, {
        skipSessionStore: true,
      });
    } catch (error) {
      console.error(
        "Peppermint isolated spaces: closing container tabs failed",
        error
      );
    }
    // The callback always runs, but never let a stuck cleaner block the rest.
    await Promise.race([
      new Promise(resolve => {
        Services.clearData.deleteDataFromOriginAttributesPattern(
          { userContextId },
          { onDataDeleted: resolve }
        );
      }),
      new Promise(resolve => lazy.setTimeout(resolve, CLEAR_TIMEOUT_MS)),
    ]);
    lazy.ContextualIdentityService.remove(userContextId);
    this.#created.delete(userContextId);
    this.#saveCreated();
  }

  /**
   * Keeps a created container's name and color in step with its space.
   *
   * @param {object} space
   */
  syncIdentity(space) {
    if (
      !this.isIsolated(space) ||
      !this.createdContainer(space.containerTabId)
    ) {
      return;
    }
    const identity = lazy.ContextualIdentityService.getPublicIdentityFromId(
      space.containerTabId
    );
    if (!identity) {
      return;
    }
    const name = space.name || DEFAULT_NAME;
    const color = colorForSpace(space);
    if (identity.name !== name || identity.color !== color) {
      lazy.ContextualIdentityService.update(
        space.containerTabId,
        name,
        identity.icon,
        color
      );
    }
  }

  /**
   * Drops records of spaces that are gone or changed container, and deletes
   * created containers that no space uses. `spaces` must be the complete,
   * restored list; an empty list is ignored, so a failed restore never
   * deletes data.
   *
   * @param {object[]} spaces
   * @returns {Promise<number[]>} The deleted containers.
   */
  async prune(spaces) {
    if (!spaces?.length) {
      return [];
    }
    this.#ensure();
    let changed = false;
    for (const [spaceId, id] of this.#isolated) {
      const space = spaces.find(s => s.uuid === spaceId);
      if (!space || space.containerTabId !== id) {
        this.#isolated.delete(spaceId);
        changed = true;
      }
    }
    if (changed) {
      this.#saveIsolated();
    }
    const deleted = [];
    for (const id of [...this.#created]) {
      if (!lazy.ContextualIdentityService.getPublicIdentityFromId(id)) {
        this.#created.delete(id);
        this.#saveCreated();
      } else if (!spaces.some(space => space.containerTabId === id)) {
        await this.deleteContainer(id);
        deleted.push(id);
      }
    }
    return deleted;
  }

  /** For tests: forget the cached record. */
  resetForTesting() {
    this.#isolated = null;
    this.#created = null;
  }
}

export const PeppermintIsolatedSpaces = new IsolatedSpaces();
