/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Sharing without a server. Peppermint has no share service, so what Zen's
 * Share items would upload (a space, folder or split view) is saved to a
 * .peppermint file instead, and such a file is imported back from the space
 * menu, the command palette or by dropping it on the sidebar. Zen's share
 * manager calls exportDocument when zen.share.base-url is empty (see the
 * share overlay patch).
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ZenShareClient: "resource:///modules/zen/share/ZenShareClient.sys.mjs",
});
ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization([FTL_FILE], true)
);

export const FILE_EXTENSION = "peppermint";
const FTL_FILE = "browser/peppermint-share-file.ftl";
// Share documents are lists of tabs; anything this big is not one.
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MENU_ITEM_ID = "context_peppermintImportShared";

class ShareFileError extends Error {}

/**
 * @param {string} name
 * @returns {string} A file name without characters file systems refuse
 */
export function safeFileName(name) {
  const cleaned = String(name || "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || "Peppermint";
}

async function pickFile(win, mode, defaultName = "") {
  const picker = Cc["@mozilla.org/filepicker;1"].createInstance(
    Ci.nsIFilePicker
  );
  const [title, filter] = lazy.l10n.formatValuesSync([
    mode == "save"
      ? "peppermint-share-file-export-title"
      : "peppermint-share-file-import-title",
    "peppermint-share-file-filter",
  ]);
  picker.init(
    win.browsingContext,
    title,
    mode == "save" ? Ci.nsIFilePicker.modeSave : Ci.nsIFilePicker.modeOpen
  );
  picker.appendFilter(filter, `*.${FILE_EXTENSION}`);
  picker.appendFilters(Ci.nsIFilePicker.filterAll);
  if (defaultName) {
    picker.defaultString = `${safeFileName(defaultName)}.${FILE_EXTENSION}`;
    picker.defaultExtension = FILE_EXTENSION;
  }
  const result = await new Promise(resolve => picker.open(resolve));
  return result == Ci.nsIFilePicker.returnCancel ? null : picker.file.path;
}

function itemName(doc) {
  return doc?.shared?.name || "";
}

export const PeppermintShareFile = {
  /**
   * @param {Window} win
   * @param {object} doc - A share document (share.schema.json)
   * @param {object} [options]
   * @param {string} [options.path] - Where to save; asks when left out
   * @returns {Promise<boolean>} Whether a file was written
   */
  async exportDocument(win, doc, { path } = {}) {
    try {
      path ??= await pickFile(win, "save", itemName(doc) || doc?.shared?.type);
      if (!path) {
        return false;
      }
      await IOUtils.writeJSON(path, doc, { tmpPath: `${path}.tmp` });
      win.gZenUIManager?.showToast("peppermint-share-file-exported", {
        l10nArgs: { file: PathUtils.filename(path) },
        frosted: true,
      });
      return true;
    } catch (error) {
      console.error("Peppermint: the file could not be written", error);
      win.gZenUIManager?.showToast("peppermint-share-file-export-failed");
      return false;
    }
  },

  /**
   * Asks for a file and imports it.
   *
   * @param {Window} win
   * @returns {Promise<boolean>}
   */
  async importFromFile(win) {
    const path = await pickFile(win, "open");
    return path ? this.importFile(win, path) : false;
  },

  /**
   * @param {Window} win
   * @param {string} path
   * @returns {Promise<boolean>} Whether something was imported. A file that
   *   is too large or does not follow the share format imports nothing.
   */
  async importFile(win, path) {
    try {
      const { size } = await IOUtils.stat(path);
      if (size > MAX_FILE_BYTES) {
        throw new ShareFileError("The file is too large");
      }
      const doc = await IOUtils.readJSON(path);
      const { valid } = await lazy.ZenShareClient.validateDocument(doc);
      if (
        !valid ||
        !["space", "folder", "splitView"].includes(doc.shared?.type)
      ) {
        throw new ShareFileError(
          "The file is not a shared space, folder or split view"
        );
      }
      await win.gZenShareManager.importDocument(doc);
      win.gZenUIManager?.showToast("peppermint-share-file-imported", {
        l10nArgs: { name: itemName(doc) || PathUtils.filename(path) },
        frosted: true,
      });
      return true;
    } catch (error) {
      console.error("Peppermint: the file could not be imported", error);
      win.gZenUIManager?.showToast("peppermint-share-file-import-failed");
      return false;
    }
  },

  /**
   * Adds the import item to the space menu and lets a .peppermint file be
   * dropped on the sidebar.
   *
   * @param {Window} win
   */
  initWindow(win) {
    const doc = win.document;
    if (
      !win.gZenShareManager ||
      win.gZenWorkspaces?.privateWindowOrDisabled ||
      doc.getElementById(MENU_ITEM_ID)
    ) {
      return;
    }
    win.MozXULElement.insertFTLIfNeeded(FTL_FILE);
    const anchor = doc.getElementById("context_zenShareWorkspace");
    if (anchor) {
      const item = doc.createXULElement("menuitem");
      item.id = MENU_ITEM_ID;
      item.setAttribute("data-l10n-id", "peppermint-share-file-import-menu");
      item.addEventListener("command", () => this.importFromFile(win));
      anchor.after(item);
    }
    doc.getElementById("navigator-toolbox")?.addEventListener(
      "drop",
      event => {
        const file = event.dataTransfer?.mozGetDataAt(
          "application/x-moz-file",
          0
        );
        if (
          !(file instanceof Ci.nsIFile) ||
          !file.leafName.toLowerCase().endsWith(`.${FILE_EXTENSION}`)
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.importFile(win, file.path);
      },
      true
    );
  },
};
