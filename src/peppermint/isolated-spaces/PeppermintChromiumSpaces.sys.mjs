// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Imports each profile of a Chromium browser (Chrome, Edge, Brave, Vivaldi,
 * Opera, Dia, ...) as an isolated space: importing a profile's bookmarks also
 * makes a space named after the profile, with a container of its own, and
 * puts the bookmarks in a folder that only that space shows.
 *
 * History, passwords, cards and extensions stay shared: Firefox keeps them
 * outside containers. Arc keeps Zen's own importer, which already turns Arc
 * spaces into spaces.
 *
 * Firefox's import wizard creates its migrators from ChromeProfileMigrator,
 * so wrapping its getResources() once covers every Chromium-based browser.
 */

import { PeppermintIsolatedSpaces as Isolated } from "moz-src:///peppermint/isolated-spaces/PeppermintIsolatedSpaces.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
  ChromeProfileMigrator:
    "moz-src:///browser/components/migration/ChromeProfileMigrator.sys.mjs",
  MigrationUtils:
    "moz-src:///browser/components/migration/MigrationUtils.sys.mjs",
  PlacesUIUtils: "moz-src:///browser/components/places/PlacesUIUtils.sys.mjs",
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
});

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["browser/migrationWizard.ftl"], true)
);

const PREF_ENABLED = "peppermint.spaces.import-profiles-as-spaces";
const PREF_IMPORTED = "peppermint.spaces.imported-profiles";
// Arc has its own importer that already makes spaces.
const SKIPPED_BROWSERS = new Set(["arc"]);
// Names a browser gives a profile nobody named.
const GENERIC_PROFILE =
  /^(default|person \d+|profile \d+|user \d+|your chrome)$/i;

let installed = false;

function readImported() {
  try {
    const map = JSON.parse(Services.prefs.getStringPref(PREF_IMPORTED, "{}"));
    return map && typeof map == "object" ? map : {};
  } catch {
    return {};
  }
}

/**
 * The space name for a browser profile: "Work (Google Chrome)", or just the
 * browser for a profile it named itself.
 *
 * @param {string} browserName
 * @param {string} [profileName]
 * @returns {string}
 */
export function spaceNameFor(browserName, profileName) {
  const profile = String(profileName ?? "").trim();
  return !profile || GENERIC_PROFILE.test(profile)
    ? browserName
    : `${profile} (${browserName})`;
}

function browserNameOf(migrator) {
  const id = migrator.constructor.displayNameL10nID;
  try {
    return (id && lazy.l10n.formatValueSync(id)) || migrator.constructor.key;
  } catch {
    return migrator.constructor.key;
  }
}

function spaceWindow() {
  return lazy.BrowserWindowTracker.orderedWindows.find(
    win => win.gZenWorkspaces && !win.gZenWorkspaces.privateWindowOrDisabled
  );
}

/**
 * The isolated space for a browser profile, made the first time.
 *
 * @param {string} key - Browser key and profile id.
 * @param {string} name
 * @returns {Promise<object|null>}
 */
async function ensureSpace(key, name) {
  const win = spaceWindow();
  const manager = win?.gZenWorkspaces;
  if (!manager) {
    return null;
  }
  await manager.promiseInitialized;
  const imported = readImported();
  let space = imported[key] ? manager.getWorkspaceFromId(imported[key]) : null;
  if (!space) {
    space = await manager.createAndSaveWorkspace(name, undefined, true, 0);
    if (!space) {
      return null;
    }
    imported[key] = space.uuid;
    Services.prefs.setStringPref(PREF_IMPORTED, JSON.stringify(imported));
  }
  if (!Isolated.isIsolated(space) && Isolated.available) {
    Isolated.isolate(space, manager.getWorkspaces(), { mode: "new" });
    await manager.saveWorkspace(space);
  }
  return space;
}

async function childGuids(parentGuid) {
  const tree = await lazy.PlacesUtils.promiseBookmarksTree(parentGuid).catch(
    () => null
  );
  return new Set((tree?.children ?? []).map(child => child.guid));
}

/**
 * Wraps a profile's bookmarks resource: after Firefox imports the bookmarks,
 * they move into a folder that belongs to the profile's space.
 *
 * @param {object} resource - Firefox's bookmarks resource.
 * @param {string} key
 * @param {string} name
 * @returns {object}
 */
function bookmarksIntoSpace(resource, key, name) {
  const { PlacesUtils } = lazy;
  const roots = [
    PlacesUtils.bookmarks.toolbarGuid,
    PlacesUtils.bookmarks.unfiledGuid,
  ];
  // Everything else (type, the count the wizard reads after the import) is
  // read from Firefox's own resource.
  const wrapped = Object.create(resource);
  wrapped.migrate = function (callback) {
    return (async () => {
      const before = await Promise.all(roots.map(childGuids));
      const ok = await new Promise(resolve => {
        resource.migrate(result => resolve(result));
      });
      try {
        const added = [];
        for (const [i, root] of roots.entries()) {
          for (const guid of await childGuids(root)) {
            if (!before[i].has(guid)) {
              added.push(guid);
            }
          }
        }
        const space = added.length ? await ensureSpace(key, name) : null;
        if (space) {
          const folder = await PlacesUtils.bookmarks.insert({
            parentGuid: PlacesUtils.bookmarks.toolbarGuid,
            type: PlacesUtils.bookmarks.TYPE_FOLDER,
            title: name,
          });
          for (const guid of added) {
            await PlacesUtils.bookmarks.update({
              guid,
              parentGuid: folder.guid,
              index: PlacesUtils.bookmarks.DEFAULT_INDEX,
            });
          }
          await lazy.PlacesUIUtils.updateBookmarkWorkspaces(folder.guid, [
            space.uuid,
          ]);
        }
      } catch (error) {
        console.error(
          "Peppermint: putting imported bookmarks in their space failed",
          error
        );
      }
      callback(ok);
    })();
  };
  return wrapped;
}

export const PeppermintChromiumSpaces = {
  /** Wraps Firefox's Chromium migrator once per process. */
  install() {
    if (installed) {
      return;
    }
    installed = true;
    const proto = lazy.ChromeProfileMigrator.prototype;
    const original = proto.getResources;
    proto.getResources = async function (aProfile) {
      const resources = await original.call(this, aProfile);
      const browserKey = this.constructor.key;
      if (
        !Services.prefs.getBoolPref(PREF_ENABLED, true) ||
        SKIPPED_BROWSERS.has(browserKey) ||
        !Isolated.available ||
        !aProfile?.id
      ) {
        return resources;
      }
      const key = `${browserKey}:${aProfile.id}`;
      const name = spaceNameFor(browserNameOf(this), aProfile.name);
      return resources.map(resource =>
        resource.type === lazy.MigrationUtils.resourceTypes.BOOKMARKS
          ? bookmarksIntoSpace(resource, key, name)
          : resource
      );
    };
  },
};
