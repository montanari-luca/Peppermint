/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A searchable sheet of every keyboard shortcut, opened with Cmd/Ctrl+/ or
 * from the Help menu. It lists what about:keyboard lists (Firefox's keys and
 * Zen's), read from the live <key> elements each time it opens, so rebound
 * and cleared shortcuts show as they are.
 */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  CustomKeysParent:
    "moz-src:///browser/components/customkeys/CustomKeysParent.sys.mjs",
  ZenKeyboardShortcuts:
    "resource:///modules/zen/kbs/ZenKeyboardShortcuts.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "keysL10n", () => {
  return new Localization(["branding/brand.ftl", "browser/customkeys.ftl"]);
});

const COMMAND_ID = "cmd_peppermintShortcutSheet";
const PANEL_ID = "peppermint-shortcut-sheet";
const STYLE_URL =
  "chrome://browser/content/zen-styles/peppermint-shortcut-sheet.css";
const FTL = "browser/peppermint-shortcut-sheet.ftl";
const PANEL_WIDTH = 640;

/**
 * Every shortcut that is bound, grouped as about:keyboard groups them.
 * Entries with the same name in a category (Reload is Cmd+R and F5) are
 * merged.
 *
 * @param {Window} window - A browser window
 * @returns {Promise<{title: string, items: {title: string, shortcuts: string[]}[]}[]>}
 */
export async function collectShortcuts(window) {
  // Firefox names most shortcuts after their menu bar item, and many <key>
  // elements get their letter from Fluent. Both can still be untranslated
  // (no native menu bar, or nothing has asked for them yet).
  const doc = window.document;
  const untranslated = [
    ...doc.querySelectorAll(
      "#main-menubar menu[data-l10n-id]:not([label]), #main-menubar menuitem[data-l10n-id]:not([label]), key[data-l10n-id]:not([key], [keycode])"
    ),
  ];
  if (untranslated.length) {
    await doc.l10n.translateElements(untranslated);
  }
  // The about:keyboard actor only needs a window and its own key lookup, so
  // it can describe this window without a page.
  const reader = {
    browsingContext: { topChromeWindow: window },
    getKeyData(id) {
      return lazy.CustomKeysParent.prototype.getKeyData.call(this, id);
    },
  };
  const keys = await lazy.ZenKeyboardShortcuts.addKeys(
    reader,
    lazy.CustomKeysParent.prototype.getKeys.call(reader)
  );

  const fluentIds = new Set();
  for (const [category, entries] of Object.entries(keys)) {
    if (category.startsWith("customkeys-")) {
      fluentIds.add(category);
    }
    for (const entry of Object.values(entries)) {
      if (entry.title?.startsWith("customkeys-")) {
        fluentIds.add(entry.title);
      }
    }
  }
  const ids = [...fluentIds];
  // Some of these messages only have an attribute (a category's .heading).
  const messages = await lazy.keysL10n.formatMessages(ids.map(id => ({ id })));
  const text = Object.fromEntries(
    ids.map((id, i) => [
      id,
      messages[i]?.value ?? messages[i]?.attributes?.[0]?.value ?? id,
    ])
  );
  const label = value => text[value] ?? value;

  const categories = [];
  for (const [category, entries] of Object.entries(keys)) {
    const items = new Map();
    for (const entry of Object.values(entries)) {
      if (!entry.shortcut || !entry.title) {
        continue;
      }
      const title = label(entry.title);
      const item = items.get(title) ?? { title, shortcuts: [] };
      if (!item.shortcuts.includes(entry.shortcut)) {
        item.shortcuts.push(entry.shortcut);
      }
      items.set(title, item);
    }
    if (items.size) {
      categories.push({ title: label(category), items: [...items.values()] });
    }
  }
  return categories;
}

/**
 * @param {{title: string, items: {title: string, shortcuts: string[]}[]}} category
 * @param {string} query - Lower case search text
 * @returns {object[]} The items of the category that match
 */
export function filterItems(category, query) {
  if (!query || category.title.toLowerCase().includes(query)) {
    return category.items;
  }
  return category.items.filter(
    item =>
      item.title.toLowerCase().includes(query) ||
      item.shortcuts.some(shortcut => shortcut.toLowerCase().includes(query))
  );
}

function buildPanel(window) {
  const doc = window.document;
  const panel = doc.createXULElement("panel");
  panel.id = PANEL_ID;
  panel.setAttribute("type", "arrow");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-labelledby", `${PANEL_ID}-title`);
  panel.className = "panel-no-padding";

  const root = doc.createElement("div");
  root.className = "peppermint-shortcut-sheet";

  const header = doc.createElement("div");
  header.className = "peppermint-shortcut-sheet-header";
  const title = doc.createElement("h1");
  title.id = `${PANEL_ID}-title`;
  doc.l10n.setAttributes(title, "peppermint-shortcut-sheet-title");
  const search = doc.createElement("input");
  search.type = "search";
  search.className = "peppermint-shortcut-sheet-search";
  doc.l10n.setAttributes(search, "peppermint-shortcut-sheet-search");
  header.append(title, search);

  const list = doc.createElement("div");
  list.className = "peppermint-shortcut-sheet-list";

  const empty = doc.createElement("p");
  empty.className = "peppermint-shortcut-sheet-empty";
  empty.hidden = true;
  doc.l10n.setAttributes(empty, "peppermint-shortcut-sheet-no-results");

  const footer = doc.createElement("div");
  footer.className = "peppermint-shortcut-sheet-footer";
  const customize = doc.createElement("button");
  customize.className = "peppermint-shortcut-sheet-customize";
  doc.l10n.setAttributes(customize, "peppermint-shortcut-sheet-customize");
  customize.addEventListener("click", () => {
    panel.hidePopup();
    window.switchToTabHavingURI("about:keyboard", true);
  });
  footer.append(customize);

  root.append(header, list, empty, footer);
  panel.append(root);
  search.addEventListener("input", () => render(panel));
  // A search field clears itself on Escape; here Escape closes the sheet.
  search.addEventListener("keydown", event => {
    if (event.key == "Escape") {
      event.preventDefault();
      panel.hidePopup();
    }
  });
  panel.addEventListener("popupshown", () => search.focus());
  doc.getElementById("mainPopupSet").append(panel);
  return panel;
}

function render(panel) {
  const doc = panel.ownerDocument;
  const query = panel
    .querySelector(".peppermint-shortcut-sheet-search")
    .value.trim()
    .toLowerCase();
  const list = panel.querySelector(".peppermint-shortcut-sheet-list");
  const sections = [];
  for (const category of panel._categories ?? []) {
    const items = filterItems(category, query);
    if (!items.length) {
      continue;
    }
    const section = doc.createElement("section");
    const heading = doc.createElement("h2");
    heading.textContent = category.title;
    section.append(heading);
    for (const item of items) {
      const row = doc.createElement("div");
      row.className = "peppermint-shortcut-sheet-row";
      const name = doc.createElement("span");
      name.textContent = item.title;
      const keys = doc.createElement("span");
      keys.className = "peppermint-shortcut-sheet-keys";
      for (const shortcut of item.shortcuts) {
        const kbd = doc.createElement("kbd");
        kbd.textContent = shortcut;
        keys.append(kbd);
      }
      row.append(name, keys);
      section.append(row);
    }
    sections.push(section);
  }
  list.replaceChildren(...sections);
  panel.querySelector(".peppermint-shortcut-sheet-empty").hidden =
    !!sections.length;
}

export const PeppermintShortcutSheet = {
  init(window) {
    // The Help menu item is labelled from the same file.
    window.MozXULElement.insertFTLIfNeeded(FTL);
    window.document
      .getElementById(COMMAND_ID)
      ?.addEventListener("command", () => this.toggle(window));
  },

  /**
   * Opens the sheet in `window`, or closes it when it is open.
   *
   * @param {Window} window - A browser window
   * @returns {Promise<XULElement>} The panel
   */
  async toggle(window) {
    const doc = window.document;
    let panel = doc.getElementById(PANEL_ID);
    if (panel?.state == "open" || panel?.state == "showing") {
      panel.hidePopup();
      return panel;
    }
    if (!panel) {
      if (!doc.querySelector(`link[href="${STYLE_URL}"]`)) {
        const link = doc.createElement("link");
        link.rel = "stylesheet";
        link.href = STYLE_URL;
        (doc.querySelector("linkset") || doc.documentElement).append(link);
      }
      panel = buildPanel(window);
    }
    panel._categories = await collectShortcuts(window);
    panel.querySelector(".peppermint-shortcut-sheet-search").value = "";
    render(panel);

    const anchor = doc.getElementById("tabbrowser-tabbox");
    const width = Math.min(PANEL_WIDTH, anchor.clientWidth - 32);
    panel.style.setProperty("--peppermint-shortcut-sheet-width", `${width}px`);
    const shown = new Promise(resolve =>
      panel.addEventListener("popupshown", resolve, { once: true })
    );
    panel.openPopup(anchor, {
      position: "overlap",
      x: Math.max(0, (anchor.clientWidth - width) / 2),
      y: 48,
    });
    await shown;
    return panel;
  },
};
