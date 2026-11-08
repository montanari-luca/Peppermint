/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Every feature Peppermint adds, in one list. The features pane in Settings
 * reads it, and so will the feature tour and the shortcut sheet.
 *
 * Adding a feature is an entry here and three messages in
 * browser/preferences/zen-preferences.ftl:
 *
 *   peppermint-feature-<id>               its name
 *   peppermint-feature-<id>-description   one line on what it does
 *   peppermint-feature-<id>-keywords      other words people search for
 *
 * Fields:
 *   id        unique, used in the Fluent ids
 *   category  one of CATEGORIES
 *   icon      file name in chrome://browser/skin/zen-icons/
 *   pref      boolean pref that turns it on and off (optional)
 *   pane      Settings pane with its options (optional)
 *   url       page it opens (optional)
 *   command   id of the <command> its keyboard shortcut runs (optional)
 */

export const CATEGORIES = ["privacy", "tabs", "address-bar", "tools", "system"];

export const FEATURES = [
  // Privacy
  {
    id: "ad-blocker",
    category: "privacy",
    icon: "tracking-protection-fill.svg",
    pane: "paneZenAdblock",
  },
  {
    id: "cookie-banner-blocker",
    category: "privacy",
    icon: "cookies-fill.svg",
    pref: "zen.cookie-consent.enabled",
  },
  {
    id: "tracking-parameter-removal",
    category: "privacy",
    icon: "link.svg",
    pref: "privacy.query_stripping.enabled",
  },
  {
    id: "clean-links",
    category: "privacy",
    icon: "link.svg",
    pref: "peppermint.clean-links.enabled",
  },
  {
    id: "lookalike-warning",
    category: "privacy",
    icon: "security-warning.svg",
    pref: "peppermint.lookalike.enabled",
  },
  {
    id: "permission-auto-revoke",
    category: "privacy",
    icon: "permissions.svg",
    pref: "peppermint.permissions.auto-revoke.enabled",
  },
  {
    id: "fingerprinting-protection",
    category: "privacy",
    icon: "tracking-protection.svg",
    pref: "privacy.fingerprintingProtection",
  },
  {
    id: "ghost-mode",
    category: "privacy",
    icon: "private-window.svg",
    pane: "paneZenGhostMode",
    command: "Tools:PrivateBrowsing",
  },
  {
    id: "vault",
    category: "privacy",
    icon: "passwords.svg",
    pref: "peppermint.vault.enabled",
    url: "about:vault",
  },

  // Tabs
  {
    id: "tab-islands",
    category: "tabs",
    icon: "folder.svg",
    pref: "peppermint.tabs.islands.enabled",
  },
  {
    id: "tab-archive",
    category: "tabs",
    icon: "history.svg",
    url: "about:archive",
  },
  {
    id: "tab-unloader",
    category: "tabs",
    icon: "bolt.svg",
    pane: "paneZenPerformance",
  },
  {
    id: "undo-close",
    category: "tabs",
    icon: "arrow-rotate-anticlockwise.svg",
    pref: "peppermint.tabs.undo-close-toast",
  },
  {
    id: "tab-close-confirm",
    category: "tabs",
    icon: "close.svg",
    pref: "peppermint.tabs.confirm-close-button",
  },
  {
    id: "tab-numbers",
    category: "tabs",
    icon: "tab.svg",
  },

  // Address bar
  {
    id: "tab-search",
    category: "address-bar",
    icon: "search-glass.svg",
    pref: "peppermint.urlbar.tab-search.enabled",
  },
  {
    id: "popular-sites",
    category: "address-bar",
    icon: "search-page.svg",
    pref: "peppermint.urlbar.popular-sites.enabled",
  },
  {
    id: "omni-utils",
    category: "address-bar",
    icon: "developer.svg",
    pref: "peppermint.urlbar.omni-utils.enabled",
  },
  {
    id: "url-snippets",
    category: "address-bar",
    icon: "brackets-curly.svg",
    pane: "paneZenUrlSnippets",
  },

  // Tools
  {
    id: "notepad",
    category: "tools",
    icon: "edit-theme.svg",
    url: "about:notes",
  },
  {
    id: "reader",
    category: "tools",
    icon: "reader-mode.svg",
    url: "about:saved",
    command: "View:ReaderView",
  },
  {
    id: "screenshot-editor",
    category: "tools",
    icon: "screenshot.svg",
    pref: "peppermint.screenshot.editor.enabled",
    command: "Browser:Screenshot",
  },
  {
    id: "shortcut-sheet",
    category: "tools",
    icon: "brackets-curly.svg",
    url: "about:keyboard",
    command: "cmd_peppermintShortcutSheet",
  },
  {
    id: "report",
    category: "tools",
    icon: "sliders.svg",
    url: "about:report",
  },
  {
    id: "homepage",
    category: "tools",
    icon: "home.svg",
    pane: "paneZenHomepage",
  },

  // System
  {
    id: "janitor",
    category: "system",
    icon: "sparkles.svg",
    pref: "peppermint.janitor.enabled",
    pane: "paneZenJanitor",
  },
  {
    id: "underpowered",
    category: "system",
    icon: "battery-low.svg",
    pref: "zen.underpowered.enabled",
    pane: "paneZenPerformance",
  },
  {
    id: "updater",
    category: "system",
    icon: "arrow-rotate-anticlockwise.svg",
    pref: "peppermint.update.enabled",
  },
];

/**
 * @param {object} feature - An entry of FEATURES
 * @returns {{name: string, description: string, keywords: string}} Its
 *   Fluent message ids
 */
export function featureL10nIds(feature) {
  const base = `peppermint-feature-${feature.id}`;
  return {
    name: base,
    description: `${base}-description`,
    keywords: `${base}-keywords`,
  };
}
