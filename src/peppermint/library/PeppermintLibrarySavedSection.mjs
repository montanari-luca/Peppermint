/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Articles saved for offline reading, in Zen's Library, by the day they were
 * saved. Opening one shows the offline copy in Reader View.
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
  PeppermintReader: "moz-src:///peppermint/reader/PeppermintReader.sys.mjs",
  listArticles: "moz-src:///peppermint/reader/PeppermintReaderStore.sys.mjs",
  removeArticle: "moz-src:///peppermint/reader/PeppermintReaderStore.sys.mjs",
  setRead: "moz-src:///peppermint/reader/PeppermintReaderStore.sys.mjs",
  STORE_CHANGED_TOPIC:
    "moz-src:///peppermint/reader/PeppermintReaderStore.sys.mjs",
});

export class PeppermintLibrarySavedSection extends ZenLibrarySearchSection {
  static id = "peppermint-saved";
  static label = "peppermint-library-saved-title";

  static properties = {
    ...ZenLibrarySearchSection.properties,
    articles: { type: Array, state: true },
  };

  static render(library) {
    return html`
      <peppermint-library-saved-section
        class="zen-library-section"
        data-section="peppermint-saved"
        .library=${library}
      ></peppermint-library-saved-section>
    `;
  }

  #observer = { observe: () => this.#load() };
  #menu = null;
  #menuArticle = null;
  #menuRow = null;

  constructor() {
    super();
    this.articles = null;
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
      this.articles = await lazy.listArticles();
    } catch (error) {
      console.error("The saved articles could not be listed", error);
      this.articles = [];
    }
  }

  get searchPlaceholderL10nId() {
    return "peppermint-library-saved-search-placeholder";
  }

  get filterTitleL10nId() {
    return "peppermint-library-saved-filter-title";
  }

  get filterGroups() {
    const groups = [
      {
        id: "state",
        titleL10nId: "peppermint-library-saved-filter-state",
        exclusive: true,
        options: [
          { id: "unread", l10nId: "peppermint-library-saved-filter-unread" },
          { id: "read", l10nId: "peppermint-library-saved-filter-read" },
        ],
      },
    ];
    const tags = [
      ...new Set((this.articles || []).flatMap(article => article.tags || [])),
    ].sort((a, b) => a.localeCompare(b));
    if (tags.length) {
      groups.push({
        id: "tag",
        titleL10nId: "peppermint-library-saved-filter-tags",
        options: tags.map(tag => ({ id: tag, label: tag })),
      });
    }
    return groups;
  }

  onSearchChanged() {
    this.requestUpdate();
  }

  onFiltersChanged() {
    this.requestUpdate();
  }

  #visibleArticles() {
    const query = this.searchQuery.toLowerCase();
    const unread = this.isFilterActive("state", "unread");
    const read = this.isFilterActive("state", "read");
    const tags = [...this.activeFilters]
      .filter(key => key.startsWith("tag:"))
      .map(key => key.slice("tag:".length));
    return (this.articles || []).filter(
      article =>
        (!unread || !article.read) &&
        (!read || article.read) &&
        tags.every(tag => article.tags?.includes(tag)) &&
        (!query ||
          article.title?.toLowerCase().includes(query) ||
          article.siteName?.toLowerCase().includes(query) ||
          article.excerpt?.toLowerCase().includes(query) ||
          article.url.toLowerCase().includes(query))
    );
  }

  // Actions

  #open(article, where = "current") {
    lazy.PeppermintReader.openArticle(window, article.id, where)
      .then(opened => {
        if (opened && where == "current") {
          this.library.constructor.toggle();
        }
      })
      .catch(error => console.error("A saved article could not open", error));
  }

  #setRead(article, read) {
    lazy
      .setRead(article.id, read)
      .catch(error =>
        console.error("A saved article could not be marked", error)
      );
  }

  #remove(article) {
    lazy
      .removeArticle(article.id)
      .catch(error =>
        console.error("A saved article could not be removed", error)
      );
  }

  #buildMenu() {
    const menu = document.createXULElement("menupopup");
    menu.className = "peppermint-library-saved-menu";
    const items = [
      ["open", "peppermint-library-saved-menu-open"],
      ["open-tab", "peppermint-library-saved-menu-open-tab"],
      ["separator"],
      ["read", "peppermint-library-saved-menu-read"],
      ["unread", "peppermint-library-saved-menu-unread"],
      ["separator"],
      ["delete", "peppermint-library-saved-menu-delete"],
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
      const article = this.#menuArticle;
      switch (article && event.target.dataset.action) {
        case "open":
          this.#open(article);
          break;
        case "open-tab":
          this.#open(article, "tab");
          break;
        case "read":
          this.#setRead(article, true);
          break;
        case "unread":
          this.#setRead(article, false);
          break;
        case "delete":
          this.#remove(article);
          break;
      }
    });
    menu.addEventListener("popupshowing", () => {
      const read = !!this.#menuArticle?.read;
      menu.querySelector('[data-action="read"]').hidden = read;
      menu.querySelector('[data-action="unread"]').hidden = !read;
    });
    menu.addEventListener("popuphidden", () => {
      this.#menuRow?.removeAttribute("menu-open");
      this.#menuRow = null;
      this.#menuArticle = null;
    });
    document.getElementById("mainPopupSet").appendChild(menu);
    return menu;
  }

  #openMenu(article, row, event) {
    this.#menu ??= this.#buildMenu();
    this.#menuRow?.removeAttribute("menu-open");
    this.#menuArticle = article;
    this.#menuRow = row;
    row.setAttribute("menu-open", "true");
    this.#menu.openPopupAtScreen(event.screenX, event.screenY, true, event);
  }

  // Rendering

  #renderArticle(article) {
    const minutes = article.readingTimeMinsFast || 0;
    return html`
      <div
        class="zen-library-row peppermint-library-saved-row"
        ?unread=${!article.read}
        @click=${event =>
          this.#open(
            article,
            event.getModifierState("Accel") ? "tab" : "current"
          )}
        @auxclick=${event => {
          if (event.button === 1) {
            event.preventDefault();
            this.#open(article, "tab");
          }
        }}
        @contextmenu=${event => {
          event.preventDefault();
          this.#openMenu(article, event.currentTarget, event);
        }}
      >
        <img
          class="zen-library-row-icon"
          src=${`page-icon:${article.url}`}
          decoding="async"
          alt=""
        />
        <div class="zen-library-row-text">
          <span class="zen-library-row-title"
            >${article.title || article.url}</span
          >
          <span class="zen-library-row-subtitle"
            >${article.siteName || shortHost(article.url)}${
              minutes
                ? html` ·
                    <span
                      data-l10n-id="peppermint-library-saved-reading-time"
                      data-l10n-args=${JSON.stringify({ minutes })}
                    ></span>`
                : null
            }</span
          >
        </div>
        <div class="zen-library-row-actions">
          <toolbarbutton
            class="toolbarbutton-1"
            data-l10n-id="peppermint-library-saved-delete-button"
            @click=${event => {
              event.stopPropagation();
              this.#remove(article);
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
            data-l10n-id=${
              article.read
                ? "peppermint-library-saved-unread-button"
                : "peppermint-library-saved-read-button"
            }
            @click=${event => {
              event.stopPropagation();
              this.#setRead(article, !article.read);
            }}
          >
            <img
              class="toolbarbutton-icon"
              src="chrome://browser/skin/zen-icons/check.svg"
              alt=""
            />
          </toolbarbutton>
        </div>
      </div>
    `;
  }

  renderItems() {
    if (!this.articles) {
      return null;
    }
    const articles = this.#visibleArticles();
    if (!articles.length) {
      return html`
        <div
          class="zen-library-empty"
          data-l10n-id="peppermint-library-saved-empty"
        ></div>
      `;
    }
    const days = groupByDay(articles, article => article.savedAt);
    return repeat(
      days.entries(),
      ([day]) => day,
      ([day, dayArticles]) => html`
        <div class="zen-library-group">
          <h3>${formatDay(day)}</h3>
          ${repeat(
            dayArticles,
            article => article.id,
            article => this.#renderArticle(article)
          )}
        </div>
      `
    );
  }
}

customElements.define(
  "peppermint-library-saved-section",
  PeppermintLibrarySavedSection
);
