/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The Tab Archive in Zen's Library: snoozed tabs first, then archived tabs
 * by the day they were archived. Opening one brings it back in its Space,
 * with its history.
 */

import { html, repeat } from "chrome://global/content/vendor/lit.all.mjs";
import { ZenLibrarySearchSection } from "moz-src:///zen/library/sections/ZenLibrarySearchSection.mjs";
import {
  formatDay,
  groupByDay,
  shortHost,
} from "moz-src:///peppermint/library/PeppermintLibraryUtils.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  openRecord: "moz-src:///peppermint/tab-archive/PeppermintTabArchive.sys.mjs",
  snoozeRecord:
    "moz-src:///peppermint/tab-archive/PeppermintTabArchive.sys.mjs",
  listRecords:
    "moz-src:///peppermint/tab-archive/PeppermintTabArchiveStore.sys.mjs",
  removeRecord:
    "moz-src:///peppermint/tab-archive/PeppermintTabArchiveStore.sys.mjs",
  STORE_CHANGED_TOPIC:
    "moz-src:///peppermint/tab-archive/PeppermintTabArchiveStore.sys.mjs",
});

const SNOOZE_PRESETS = ["later", "tomorrow", "next-week"];

export class PeppermintLibraryArchiveSection extends ZenLibrarySearchSection {
  static id = "peppermint-archive";
  static label = "peppermint-library-archive-title";

  static properties = {
    ...ZenLibrarySearchSection.properties,
    records: { type: Array, state: true },
  };

  static render(library) {
    return html`
      <peppermint-library-archive-section
        class="zen-library-section"
        data-section="peppermint-archive"
        .library=${library}
      ></peppermint-library-archive-section>
    `;
  }

  #observer = { observe: () => this.#load() };
  #menu = null;
  #menuRecord = null;
  #menuRow = null;

  constructor() {
    super();
    this.records = null;
  }

  connectedCallback() {
    super.connectedCallback();
    Services.obs.addObserver(this.#observer, lazy.STORE_CHANGED_TOPIC);
    this.#load();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    Services.obs.removeObserver(this.#observer, lazy.STORE_CHANGED_TOPIC);
    this.#menu?.hidePopup();
    this.#menu?.remove();
    this.#menu = null;
  }

  async #load() {
    try {
      this.records = await lazy.listRecords();
    } catch (error) {
      console.error("The tab archive could not be listed", error);
      this.records = [];
    }
  }

  get searchPlaceholderL10nId() {
    return "peppermint-library-archive-search-placeholder";
  }

  get filterTitleL10nId() {
    return "peppermint-library-archive-filter-title";
  }

  get filterGroups() {
    return [
      {
        id: "kind",
        titleL10nId: "peppermint-library-archive-filter-kind",
        exclusive: true,
        options: [
          {
            id: "archive",
            l10nId: "peppermint-library-archive-filter-archived",
          },
          { id: "snooze", l10nId: "peppermint-library-archive-filter-snoozed" },
        ],
      },
    ];
  }

  onSearchChanged() {
    this.requestUpdate();
  }

  onFiltersChanged() {
    this.requestUpdate();
  }

  #visibleRecords() {
    const query = this.searchQuery.toLowerCase();
    const kinds = ["archive", "snooze"].filter(kind =>
      this.isFilterActive("kind", kind)
    );
    return (this.records || []).filter(
      record =>
        (!kinds.length || kinds.includes(record.kind)) &&
        (!query ||
          record.title?.toLowerCase().includes(query) ||
          record.url.toLowerCase().includes(query))
    );
  }

  // Actions

  // Like History: a click opens the tab and closes the Library, a middle
  // click opens it in the background and keeps the Library open.
  #open(record, { select = true } = {}) {
    const openTab = () => {
      if (lazy.openRecord(record, window, { select })) {
        lazy
          .removeRecord(record.id)
          .catch(error =>
            console.error("An archived tab could not be removed", error)
          );
      }
    };
    if (select) {
      openTab();
      this.library.constructor.toggle();
      return;
    }
    this.library.keepOpenWhile(openTab);
    window.gZenUIManager.showToast("library-history-opened-in-background");
  }

  #remove(record) {
    lazy
      .removeRecord(record.id)
      .catch(error =>
        console.error("An archived tab could not be removed", error)
      );
  }

  #snooze(record, preset) {
    lazy
      .snoozeRecord(record.id, preset)
      .catch(error =>
        console.error("An archived tab could not be snoozed", error)
      );
  }

  #buildMenu() {
    const menu = document.createXULElement("menupopup");
    menu.className = "peppermint-library-archive-menu";
    const items = [
      ["open", "peppermint-library-archive-menu-open"],
      ["open-background", "peppermint-library-archive-menu-open-background"],
      ["separator"],
      ...SNOOZE_PRESETS.map(preset => [
        `snooze-${preset}`,
        `peppermint-library-archive-menu-snooze-${preset}`,
      ]),
      ["separator"],
      ["delete", "peppermint-library-archive-menu-delete"],
    ];
    for (const [action, l10nId] of items) {
      if (action == "separator") {
        menu.appendChild(document.createXULElement("menuseparator"));
        continue;
      }
      const item = document.createXULElement("menuitem");
      item.dataset.action = action;
      item.setAttribute("data-l10n-id", l10nId);
      menu.appendChild(item);
    }
    menu.addEventListener("command", event => {
      const record = this.#menuRecord;
      const action = event.target.dataset.action;
      if (!record || !action) {
        return;
      }
      if (action == "open") {
        this.#open(record);
      } else if (action == "open-background") {
        this.#open(record, { select: false });
      } else if (action == "delete") {
        this.#remove(record);
      } else if (action.startsWith("snooze-")) {
        this.#snooze(record, action.slice("snooze-".length));
      }
    });
    menu.addEventListener("popupshowing", () => {
      const snoozed = this.#menuRecord?.kind == "snooze";
      for (const preset of SNOOZE_PRESETS) {
        menu.querySelector(`[data-action="snooze-${preset}"]`).hidden = snoozed;
      }
    });
    menu.addEventListener("popuphidden", () => {
      this.#menuRow?.removeAttribute("menu-open");
      this.#menuRow = null;
      this.#menuRecord = null;
    });
    document.getElementById("mainPopupSet").appendChild(menu);
    return menu;
  }

  #openMenu(record, row, event) {
    this.#menu ??= this.#buildMenu();
    this.#menuRow?.removeAttribute("menu-open");
    this.#menuRecord = record;
    this.#menuRow = row;
    row.setAttribute("menu-open", "true");
    this.#menu.openPopupAtScreen(event.screenX, event.screenY, true, event);
  }

  // Rendering

  #subtitle(record) {
    if (record.kind == "snooze") {
      return html`<span
        data-l10n-id="peppermint-library-archive-wakes"
        data-l10n-args=${JSON.stringify({
          date: new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(record.wakeAt),
        })}
      ></span>`;
    }
    return record.workspaceName
      ? `${shortHost(record.url)} · ${record.workspaceName}`
      : shortHost(record.url);
  }

  #renderRecord(record) {
    return html`
      <div
        class="zen-library-row peppermint-library-archive-row"
        @click=${() => this.#open(record)}
        @auxclick=${event => {
          if (event.button === 1) {
            event.preventDefault();
            this.#open(record, { select: false });
          }
        }}
        @contextmenu=${event => {
          event.preventDefault();
          this.#openMenu(record, event.currentTarget, event);
        }}
      >
        <img
          class="zen-library-row-icon"
          src=${`page-icon:${record.url}`}
          decoding="async"
          alt=""
        />
        <div class="zen-library-row-text">
          <span class="zen-library-row-title"
            >${record.title || record.url}</span
          >
          <span class="zen-library-row-subtitle"
            >${this.#subtitle(record)}</span
          >
        </div>
        <div class="zen-library-row-actions">
          <toolbarbutton
            class="toolbarbutton-1"
            data-l10n-id="peppermint-library-archive-delete-button"
            @click=${event => {
              event.stopPropagation();
              this.#remove(record);
            }}
          >
            <img
              class="toolbarbutton-icon"
              src="chrome://browser/skin/zen-icons/trash.svg"
              alt=""
            />
          </toolbarbutton>
          <toolbarbutton
            class="toolbarbutton-1"
            data-l10n-id="peppermint-library-archive-open-button"
            @click=${event => {
              event.stopPropagation();
              this.#open(record);
            }}
          >
            <img
              class="toolbarbutton-icon"
              src="chrome://browser/skin/zen-icons/u-turn-to-left.svg"
              alt=""
            />
          </toolbarbutton>
        </div>
      </div>
    `;
  }

  #renderGroup(header, records) {
    return html`
      <div class="zen-library-group">
        ${header}
        ${repeat(
          records,
          record => record.id,
          record => this.#renderRecord(record)
        )}
      </div>
    `;
  }

  renderItems() {
    if (!this.records) {
      return null;
    }
    const records = this.#visibleRecords();
    if (!records.length) {
      return html`
        <div
          class="zen-library-empty"
          data-l10n-id="peppermint-library-archive-empty"
        ></div>
      `;
    }
    const snoozed = records
      .filter(record => record.kind == "snooze")
      .sort((a, b) => a.wakeAt - b.wakeAt);
    const archived = records.filter(record => record.kind == "archive");
    const days = groupByDay(archived, record => record.archivedAt);
    return html`
      ${
        snoozed.length
          ? this.#renderGroup(
              html`<h3 data-l10n-id="peppermint-library-archive-snoozed"></h3>`,
              snoozed
            )
          : null
      }
      ${repeat(
        days.entries(),
        ([day]) => day,
        ([day, dayRecords]) =>
          this.#renderGroup(html`<h3>${formatDay(day)}</h3>`, dayRecords)
      )}
    `;
  }
}

customElements.define(
  "peppermint-library-archive-section",
  PeppermintLibraryArchiveSection
);
