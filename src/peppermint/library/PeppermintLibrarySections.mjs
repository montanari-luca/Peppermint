/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Peppermint's sections in Zen's Library, after Zen's own. Zen's Library
 * spreads `forWindow()` into its section map (see the library overlay patch),
 * so a new section needs no change to Zen's files.
 */

import { PeppermintLibraryArchiveSection } from "moz-src:///peppermint/library/PeppermintLibraryArchiveSection.mjs";
import { PeppermintLibrarySavedSection } from "moz-src:///peppermint/library/PeppermintLibrarySavedSection.mjs";

const STYLE_URL = "chrome://browser/content/zen-styles/peppermint-library.css";
const FTL_FILE = "browser/peppermint-library.ftl";

export const PeppermintLibrarySections = {
  /**
   * @param {Window} win
   * @returns {{[id: string]: Function}} The sections for this window's Library
   */
  forWindow(win) {
    if (win.PrivateBrowsingUtils?.isWindowPrivate(win)) {
      return {};
    }
    const doc = win.document;
    if (!doc.querySelector(`link[href="${STYLE_URL}"]`)) {
      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = STYLE_URL;
      (doc.querySelector("linkset") || doc.documentElement).appendChild(link);
    }
    win.MozXULElement.insertFTLIfNeeded(FTL_FILE);
    return {
      [PeppermintLibraryArchiveSection.id]: PeppermintLibraryArchiveSection,
      [PeppermintLibrarySavedSection.id]: PeppermintLibrarySavedSection,
    };
  },
};
