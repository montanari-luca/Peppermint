/* eslint-disable no-undef */
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Peppermint's about:preferences panes. Loaded by zenSidebarLayout.inc.xhtml
// instead of Zen's zen-settings.js, which Zen now keeps for its own settings
// window and Mods marketplace.

const kZenExtendedSidebar = "zen.view.sidebar-expanded";
const kZenSingleToolbar = "zen.view.use-single-toolbar";

/**
 * Binds a Glance on/off checkbox, and optionally its trigger menulist, to
 * zen.glance.activation-method: Glance is off when the method is "none".
 *
 * @param {string} checkboxId The id of the on/off checkbox.
 * @param {string} [triggerId] The id of the menulist that picks the method.
 */
function peppermintBindGlanceToggle(checkboxId, triggerId) {
  const { PeppermintGlance } = ChromeUtils.importESModule(
    "moz-src:///peppermint/common/PeppermintGlance.sys.mjs"
  );
  const checkbox = document.getElementById(checkboxId);
  if (checkbox) {
    Preferences.addSyncFromPrefListener(
      checkbox,
      () => PeppermintGlance.enabled
    );
    Preferences.addSyncToPrefListener(checkbox, () => {
      PeppermintGlance.enabled = checkbox.checked;
      return PeppermintGlance.method;
    });
  }
  const trigger = triggerId && document.getElementById(triggerId);
  if (trigger) {
    Preferences.addSyncFromPrefListener(trigger, () => {
      trigger.disabled = !PeppermintGlance.enabled;
      return PeppermintGlance.methodWhenOn;
    });
  }
}

var gZenLooksAndFeel = {
  init() {
    if (this.__hasInitialized) {
      return;
    }
    this.__hasInitialized = true;
    for (const pref of [kZenExtendedSidebar, kZenSingleToolbar]) {
      Services.prefs.addObserver(pref, this);
    }
    window.addEventListener("unload", () => {
      for (const pref of [kZenExtendedSidebar, kZenSingleToolbar]) {
        Services.prefs.removeObserver(pref, this);
      }
    });
    this.applySidebarLayout();
    this._initializeNotepadShortcut();
  },

  _initializeNotepadShortcut() {
    const input = document.getElementById("zenNotepadShortcutInput");
    const reset = document.getElementById("zenNotepadShortcutReset");
    if (!input || !reset || input.dataset.bound) {
      return;
    }
    input.dataset.bound = "true";
    const pref = "zen.notepad.autocomplete-key";
    const { shortcutFromEvent } = ChromeUtils.importESModule(
      "resource:///modules/zen/notepad/ZenNotepadMarkdown.mjs"
    );
    const show = () => {
      input.value = Services.prefs.getStringPref(pref, "Tab");
    };
    show();
    input.addEventListener("keydown", event => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        input.blur();
        return;
      }
      const spec = shortcutFromEvent(event);
      if (!spec) {
        return;
      }
      Services.prefs.setStringPref(pref, spec);
      input.value = spec;
      input.blur();
    });
    reset.addEventListener("command", () => {
      Services.prefs.setStringPref(pref, "Tab");
      show();
    });
    reset.addEventListener("click", () => {
      Services.prefs.setStringPref(pref, "Tab");
      show();
    });
  },

  observe() {
    this.applySidebarLayout();
  },

  applySidebarLayout() {
    const isSingleToolbar = Services.prefs.getBoolPref(kZenSingleToolbar);
    const isExtendedSidebar = Services.prefs.getBoolPref(kZenExtendedSidebar);
    for (const layout of document.getElementById("zenLayoutList").children) {
      layout.classList.remove("selected");
      if (layout.getAttribute("layout") == "single" && isSingleToolbar) {
        layout.classList.add("selected");
      } else if (
        layout.getAttribute("layout") == "multiple" &&
        !isSingleToolbar &&
        isExtendedSidebar
      ) {
        layout.classList.add("selected");
      } else if (
        layout.getAttribute("layout") == "collapsed" &&
        !isExtendedSidebar
      ) {
        layout.classList.add("selected");
      }
    }
    if (this.__hasInitializedLayout) {
      return;
    }
    this.__hasInitializedLayout = true;
    for (const layout of document.getElementById("zenLayoutList").children) {
      layout.addEventListener("click", () => {
        if (layout.hasAttribute("disabled")) {
          return;
        }

        for (const el of document.getElementById("zenLayoutList").children) {
          el.classList.remove("selected");
        }

        layout.classList.add("selected");

        Services.prefs.setBoolPref(
          kZenExtendedSidebar,
          layout.getAttribute("layout") != "collapsed"
        );
        Services.prefs.setBoolPref(
          kZenSingleToolbar,
          layout.getAttribute("layout") == "single"
        );
      });
    }
  },
};

var gZenToolbarUrlbarSettings = {
  init() {},
};

var gZenPerformanceSettings = {
  // Number fields: element id, pref, default, lowest and highest value.
  _underpoweredNumbers: [
    [
      "zenUnderpoweredBatteryThreshold",
      "zen.underpowered.battery-threshold",
      30,
      5,
      95,
    ],
    [
      "zenUnderpoweredResourceThreshold",
      "zen.underpowered.resource-threshold",
      90,
      50,
      99,
    ],
    [
      "zenUnderpoweredGrace",
      "zen.underpowered.freeze-grace-seconds",
      20,
      0,
      3600,
    ],
  ],

  _initUnderpoweredOptions() {
    for (const [id, pref, fallback, min, max] of this._underpoweredNumbers) {
      const field = document.getElementById(id);
      if (!field) {
        continue;
      }
      field.value = Services.prefs.getIntPref(pref, fallback);
      field.addEventListener("change", () => {
        const value = Math.max(
          min,
          Math.min(max, Math.round(Number(field.value)) || fallback)
        );
        field.value = value;
        Services.prefs.setIntPref(pref, value);
      });
    }
    const never = document.getElementById("zenUnderpoweredNeverFreeze");
    if (never) {
      const pref = "zen.underpowered.never-freeze";
      never.value = Services.prefs.getStringPref(pref, "");
      never.addEventListener("change", () => {
        Services.prefs.setStringPref(pref, never.value.trim());
      });
    }
    const status = document.getElementById("zenUnderpoweredStatus");
    if (status) {
      const { ZenUnderpowered } = ChromeUtils.importESModule(
        "moz-src:///peppermint/underpowered/ZenUnderpowered.sys.mjs"
      );
      if (Services.prefs.getBoolPref("zen.underpowered.enabled", false)) {
        document.l10n.setAttributes(status, "zen-underpowered-status-on", {
          count: ZenUnderpowered.frozenCount,
        });
      } else {
        document.l10n.setAttributes(status, "zen-underpowered-status-off");
      }
    }
  },

  init() {
    const batteryDescription = document.getElementById(
      "zenUnderpoweredBatteryDescription"
    );
    if (batteryDescription) {
      document.l10n.setAttributes(
        batteryDescription,
        "zen-underpowered-auto-battery-description",
        {
          percent: Services.prefs.getIntPref(
            "zen.underpowered.battery-threshold",
            30
          ),
        }
      );
    }
    this._initUnderpoweredOptions();
    peppermintBindGlanceToggle("zenPerformanceGlanceEnabled");
    const archiveInput = document.getElementById("peppermintTabArchiveHours");
    if (archiveInput) {
      const archivePref = "peppermint.tab-archive.hours";
      archiveInput.value = Services.prefs.getIntPref(archivePref, 72);
      archiveInput.addEventListener("change", () => {
        const hours = Math.max(
          0,
          Math.min(8760, Number(archiveInput.value) || 0)
        );
        archiveInput.value = hours;
        Services.prefs.setIntPref(archivePref, hours);
      });
    }
    const neverArchive = document.getElementById("peppermintTabArchiveNever");
    if (neverArchive) {
      const neverPref = "peppermint.tab-archive.never";
      neverArchive.value = Services.prefs.getStringPref(neverPref, "");
      neverArchive.addEventListener("change", () => {
        Services.prefs.setStringPref(neverPref, neverArchive.value.trim());
      });
    }
    const input = document.getElementById("zenTabUnloaderMinutes");
    if (!input) {
      return;
    }
    const pref = "zen.tab-unloader.timeout-minutes";
    input.value = Services.prefs.getIntPref(pref, 10);
    input.addEventListener("change", () => {
      const minutes = Math.max(0, Math.min(1440, Number(input.value) || 0));
      input.value = minutes;
      Services.prefs.setIntPref(pref, minutes);
    });
  },
};

var gZenWorkspacesSettings = {
  init() {
    const syncLink = document.getElementById("zenSpacesOpenSyncSettings");
    if (syncLink) {
      const openSyncSettings = event => {
        event.preventDefault();
        for (const id of ["category-sync", "category-account"]) {
          const navButton = document.getElementById(id);
          if (navButton && !navButton.hidden) {
            navButton.click();
            return;
          }
        }
      };
      syncLink.addEventListener("click", openSyncSettings);
      window.addEventListener("unload", () => {
        syncLink.removeEventListener("click", openSyncSettings);
      });
    }

    var tabsUnloaderPrefListener = {
      async observe() {
        let buttonIndex = await confirmRestartPrompt(true, 1, true, true);
        if (buttonIndex == CONFIRM_RESTART_PROMPT_RESTART_NOW) {
          Services.startup.quit(
            Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart
          );
        }
      },
    };

    let toggleZenCycleByAttrWarning = {
      observe() {
        const warning = document.getElementById(
          "zenTabsCycleByAttributeWarning"
        );
        warning.hidden = !(
          Services.prefs.getBoolPref(
            "zen.tabs.ctrl-tab.ignore-essential-tabs",
            false
          ) &&
          Services.prefs.getBoolPref(
            "browser.ctrlTab.sortByRecentlyUsed",
            false
          )
        );
      },
    };

    toggleZenCycleByAttrWarning.observe(); // call it once on initial load

    const confirmClosePref = "peppermint.tabs.confirm-close-button";
    const syncConfirmCloseDependents = () => {
      document.getElementById(
        "peppermintTabsConfirmCloseMiddleClick"
      ).disabled = !Services.prefs.getBoolPref(confirmClosePref, false);
    };
    const confirmCloseObserver = { observe: syncConfirmCloseDependents };
    Services.prefs.addObserver(confirmClosePref, confirmCloseObserver);
    window.addEventListener("unload", () => {
      Services.prefs.removeObserver(confirmClosePref, confirmCloseObserver);
    });
    syncConfirmCloseDependents();

    peppermintBindGlanceToggle(
      "zenLooksAndFeelGlanceEnabled",
      "zenGlanceTrigger"
    );
    Services.prefs.addObserver(
      "zen.workspaces.separate-essentials",
      tabsUnloaderPrefListener
    );
    Services.prefs.addObserver(
      "zen.window-sync.sync-only-pinned-tabs",
      tabsUnloaderPrefListener
    );
    Services.prefs.addObserver(
      "zen.tabs.ctrl-tab.ignore-essential-tabs",
      toggleZenCycleByAttrWarning
    );
    Services.prefs.addObserver(
      "browser.ctrlTab.sortByRecentlyUsed",
      toggleZenCycleByAttrWarning
    );
    window.addEventListener("unload", () => {
      Services.prefs.removeObserver(
        "zen.workspaces.separate-essentials",
        tabsUnloaderPrefListener
      );
      Services.prefs.removeObserver(
        "zen.window-sync.sync-only-pinned-tabs",
        tabsUnloaderPrefListener
      );
      Services.prefs.removeObserver(
        "zen.tabs.ctrl-tab.ignore-essential-tabs",
        toggleZenCycleByAttrWarning
      );
      Services.prefs.removeObserver(
        "browser.ctrlTab.sortByRecentlyUsed",
        toggleZenCycleByAttrWarning
      );
    });
  },
};

var gZenHomepageSettings = {
  init() {
    if (this.__hasInitialized) {
      return;
    }
    this.__hasInitialized = true;
    const { isValidHttpURL } = ChromeUtils.importESModule(
      "resource:///modules/zen/homepage/ZenHomepage.sys.mjs"
    );
    const row = document.getElementById("zenHomepageURLRow");
    const input = document.getElementById("zenHomepageURL");
    const warning = document.getElementById("zenHomepageURLInvalid");
    const mode = document.getElementById("zenHomepageMode");
    input.value = Services.prefs.getStringPref("zen.homepage.url", "");

    const syncRow = () => {
      row.hidden =
        Services.prefs.getStringPref("zen.homepage.mode", "builtin") !==
        "custom";
    };
    const observer = {
      observe() {
        syncRow();
      },
    };
    Services.prefs.addObserver("zen.homepage.mode", observer);
    mode.addEventListener("command", syncRow);
    mode.addEventListener("select", syncRow);
    window.addEventListener("unload", () => {
      Services.prefs.removeObserver("zen.homepage.mode", observer);
    });
    syncRow();

    const commitURL = () => {
      const value = input.value.trim();
      if (value && !isValidHttpURL(value)) {
        warning.hidden = false;
        return;
      }
      warning.hidden = true;
      input.value = value;
      Services.prefs.setStringPref("zen.homepage.url", value);
    };
    input.addEventListener("change", commitURL);
  },
};

var gZenUrlSnippetsSettings = {
  _manager: null,
  _queue: Promise.resolve(),

  init() {
    if (this.__hasInitialized) {
      return;
    }
    this.__hasInitialized = true;
    const { gZenUrlSnippets, normalizeSnippetShortcut, normalizeSnippetURL } =
      ChromeUtils.importESModule(
        "resource:///modules/zen/urlsnippets/ZenUrlSnippetsManager.sys.mjs"
      );
    this._manager = gZenUrlSnippets;
    this._normalizeShortcut = normalizeSnippetShortcut;
    this._normalizeURL = normalizeSnippetURL;
    document
      .getElementById("zenUrlSnippetsAdd")
      .addEventListener("command", () => this._addRow());
    this._manager.ready().then(() => this._render());
  },

  _enqueue(task) {
    this._queue = this._queue.then(task, task);
    return this._queue;
  },

  _render() {
    const list = document.getElementById("zenUrlSnippetsList");
    list.replaceChildren();
    for (const snippet of this._manager.getAll()) {
      list.appendChild(this._createRow(snippet));
    }
  },

  _addRow() {
    const list = document.getElementById("zenUrlSnippetsList");
    const row = this._createRow({ id: "", shortcut: "", url: "" });
    list.appendChild(row);
    row.querySelector(".zenUrlSnippetShortcut").focus();
  },

  _createRow(snippet) {
    const fragment = window.MozXULElement.parseXULToFragment(`
      <hbox class="zenUrlSnippetRow">
        <html:input class="zenUrlSnippetShortcut" type="text"/>
        <html:input class="zenUrlSnippetUrl" type="text"/>
        <button class="zenUrlSnippetRemove"/>
      </hbox>
    `);
    const row = fragment.querySelector(".zenUrlSnippetRow");
    const shortcutInput = row.querySelector(".zenUrlSnippetShortcut");
    const urlInput = row.querySelector(".zenUrlSnippetUrl");
    const removeButton = row.querySelector(".zenUrlSnippetRemove");
    row.dataset.id = snippet.id || "";
    shortcutInput.value = snippet.shortcut || "";
    urlInput.value = snippet.url || "";
    document.l10n.setAttributes(
      shortcutInput,
      "zen-url-snippets-shortcut-input"
    );
    document.l10n.setAttributes(urlInput, "zen-url-snippets-url-input");
    document.l10n.setAttributes(removeButton, "zen-url-snippets-remove");
    shortcutInput.addEventListener("change", () => this._commitRow(row));
    urlInput.addEventListener("change", () => this._commitRow(row));
    removeButton.addEventListener("command", () => this._removeRow(row));
    return row;
  },

  _commitRow(row) {
    return this._enqueue(() => this._commitRowNow(row));
  },

  async _commitRowNow(row) {
    if (!row.isConnected) {
      return;
    }
    const shortcutInput = row.querySelector(".zenUrlSnippetShortcut");
    const urlInput = row.querySelector(".zenUrlSnippetUrl");
    const shortcut = this._normalizeShortcut(shortcutInput.value);
    const url = this._normalizeURL(urlInput.value);
    const duplicate =
      shortcut && this._manager.isShortcutTaken(shortcut, row.dataset.id || "");
    shortcutInput.classList.toggle(
      "zenUrlSnippetInvalid",
      !shortcut || duplicate
    );
    urlInput.classList.toggle("zenUrlSnippetInvalid", !url);
    if (!shortcut || !url || duplicate) {
      return;
    }
    shortcutInput.value = shortcut;
    urlInput.value = url;
    if (!row.dataset.id) {
      const created = await this._manager.create(shortcut, url);
      if (row.isConnected) {
        row.dataset.id = created.id;
      } else {
        await this._manager.remove(created.id);
      }
      return;
    }
    await this._manager.update({
      id: row.dataset.id,
      shortcut,
      url,
    });
  },

  _removeRow(row) {
    return this._enqueue(async () => {
      if (row.dataset.id) {
        await this._manager.remove(row.dataset.id);
      }
      row.remove();
    });
  },
};

var gZenAdblockSettings = {
  init() {
    if (this.__hasInitialized) {
      return;
    }
    this.__hasInitialized = true;
    const { ADBLOCKERS, PeppermintAdblocker } = ChromeUtils.importESModule(
      "moz-src:///peppermint/adblocker/PeppermintAdblocker.sys.mjs"
    );
    const list = document.getElementById("zenAdblocker");
    const install = document.getElementById("zenAdblockInstall");
    const status = document.getElementById("zenAdblockStatus");
    if (list) {
      list.removeAllItems();
      for (const { key, name } of ADBLOCKERS) {
        list.appendItem(name, key);
      }
      list.value = PeppermintAdblocker.selected.key;
      const show = (state, retry) => {
        document.l10n.setAttributes(status, `zen-adblock-status-${state}`);
        install.hidden = !retry;
        list.disabled = state === "installing";
      };
      const apply = async installing => {
        show("installing", false);
        const ok = await installing;
        show(ok ? "installed" : "failed", !ok);
      };
      list.addEventListener("command", () =>
        apply(PeppermintAdblocker.select(list.value))
      );
      install.addEventListener("command", () =>
        apply(PeppermintAdblocker.install())
      );
      PeppermintAdblocker.isInstalled().then(installed =>
        show(installed ? "installed" : "missing", !installed)
      );
    }
    this._showCookieStatus();
    this._initExceptions();
  },

  _showCookieStatus() {
    const { gZenCookieConsent } = ChromeUtils.importESModule(
      "resource:///modules/zen/cookieconsent/ZenCookieConsentManager.sys.mjs"
    );
    const status = document.getElementById("zenCookieConsentStatus");
    if (status) {
      document.l10n.setAttributes(status, "zen-cookie-consent-status", {
        count: gZenCookieConsent.handledTotal,
      });
    }
  },

  async _initExceptions() {
    const { gZenCookieConsent } = ChromeUtils.importESModule(
      "resource:///modules/zen/cookieconsent/ZenCookieConsentManager.sys.mjs"
    );
    const list = document.getElementById("zenSiteExceptionsList");
    const empty = document.getElementById("zenSiteExceptionsEmpty");
    const clear = document.getElementById("zenSiteExceptionsClear");
    if (!list) {
      return;
    }
    const collect = () => {
      return gZenCookieConsent
        .listPaused()
        .map(site => ({ site }))
        .sort((a, b) => a.site.localeCompare(b.site));
    };
    const removeSite = site => gZenCookieConsent.unpauseSite(site);
    const render = () => {
      const rows = collect();
      list.replaceChildren();
      for (const row of rows) {
        const item = document.createXULElement("hbox");
        item.setAttribute("align", "center");
        item.setAttribute("role", "listitem");
        const text = document.createXULElement("vbox");
        text.setAttribute("flex", "1");
        const site = document.createXULElement("label");
        site.setAttribute("value", row.site);
        text.append(site);
        const fact = document.createXULElement("label");
        fact.classList.add("description-deemphasized");
        document.l10n.setAttributes(fact, "zen-site-exceptions-cookies");
        text.append(fact);
        const remove = document.createXULElement("button");
        document.l10n.setAttributes(remove, "zen-site-exceptions-remove", {
          site: row.site,
        });
        remove.addEventListener("command", () => {
          removeSite(row.site);
          render();
        });
        item.append(text, remove);
        list.append(item);
      }
      empty.hidden = !!rows.length;
      clear.disabled = !rows.length;
    };
    clear.addEventListener("command", () => {
      for (const { site } of collect()) {
        removeSite(site);
      }
      render();
    });
    await gZenCookieConsent.ready;
    render();
  },
};

var gZenJanitorSettings = {
  // Only the launch-time notification depends on the Janitor being on. The
  // cleanup options and "Clean now" also drive a manual run, so they stay
  // usable while the automatic cleaning is off.
  _dependents: ["zenJanitorNotifications", "zenJanitorSchedule"],

  init() {
    if (this.__hasInitialized) {
      return;
    }
    this.__hasInitialized = true;
    const pref = "peppermint.janitor.enabled";
    const cleanNow = document.getElementById("zenJanitorCleanNow");
    const syncDependents = () => {
      const enabled = Services.prefs.getBoolPref(pref, false);
      for (const id of this._dependents) {
        const element = document.getElementById(id);
        if (element) {
          element.disabled = !enabled;
        }
      }
    };
    const observer = {
      observe() {
        syncDependents();
      },
    };
    Services.prefs.addObserver(pref, observer);
    window.addEventListener("unload", () => {
      Services.prefs.removeObserver(pref, observer);
    });
    syncDependents();
    this._showHistory();

    cleanNow.addEventListener("command", async () => {
      const { PeppermintJanitor } = ChromeUtils.importESModule(
        "moz-src:///peppermint/janitor/PeppermintJanitor.sys.mjs"
      );
      cleanNow.disabled = true;
      try {
        await PeppermintJanitor.run({ manual: true });
      } catch (error) {
        console.error("Janitor: clean now failed", error);
      } finally {
        syncDependents();
        this._showHistory();
      }
    });
  },

  async _showHistory() {
    const { getHistory, summarizeHistory } = ChromeUtils.importESModule(
      "moz-src:///peppermint/janitor/PeppermintJanitorHistory.sys.mjs"
    );
    const { formatSize } = ChromeUtils.importESModule(
      "moz-src:///peppermint/janitor/PeppermintJanitor.sys.mjs"
    );
    const summary = summarizeHistory(await getHistory());
    const last = document.getElementById("zenJanitorLastRun");
    const totals = document.getElementById("zenJanitorTotals");
    if (!summary.lastRun) {
      document.l10n.setAttributes(last, "zen-janitor-never-run");
      totals.hidden = true;
      return;
    }
    const when = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(summary.lastRun.at);
    document.l10n.setAttributes(last, "zen-janitor-last-run", {
      date: when,
      size: formatSize(summary.lastRun.bytes),
    });
    document.l10n.setAttributes(totals, "zen-janitor-totals", {
      size: formatSize(summary.bytes),
      count: summary.runs,
    });
    totals.hidden = false;
  },
};

var gZenGhostModeSettings = {
  // Firefox registers these two with its Search and Privacy sections, which
  // load on their own. Registering them again would throw, so these checkboxes
  // read and write the prefs directly.
  _checkboxes: {
    zenGhostModeSearchSuggestions: "browser.search.suggest.enabled.private",
    zenGhostModeResistFingerprinting: "privacy.resistFingerprinting.pbmode",
  },

  init() {
    if (this.__hasInitialized) {
      return;
    }
    this.__hasInitialized = true;
    for (const [id, pref] of Object.entries(this._checkboxes)) {
      const checkbox = document.getElementById(id);
      const sync = () => {
        checkbox.checked = Services.prefs.getBoolPref(pref, false);
      };
      const observer = { observe: sync };
      Services.prefs.addObserver(pref, observer);
      window.addEventListener("unload", () => {
        Services.prefs.removeObserver(pref, observer);
      });
      checkbox.addEventListener("command", () => {
        Services.prefs.setBoolPref(pref, checkbox.checked);
      });
      sync();
    }
  },
};

Preferences.addAll([
  {
    id: "zen.urlbar.behavior",
    type: "string",
  },
  {
    id: "zen.splitView.show-tab-split-button",
    type: "bool",
  },
  {
    id: "zen.view.compact.toolbar-flash-popup",
    type: "bool",
    default: true,
  },
  {
    id: "zen.workspaces.hide-default-container-indicator",
    type: "bool",
    default: true,
  },
  {
    id: "zen.workspaces.switch-animation",
    type: "bool",
    default: true,
  },
  {
    id: "zen.downloads.download-animation",
    type: "bool",
    default: true,
  },
  {
    id: "zen.view.grey-out-inactive-windows",
    type: "bool",
    default: true,
  },
  {
    id: "zen.haptic-feedback.enabled",
    type: "bool",
    default: true,
  },
  {
    id: "zen.theme.essentials-favicon-bg",
    type: "bool",
    default: true,
  },
  {
    id: "zen.theme.glass",
    type: "bool",
    default: true,
  },
  {
    id: "zen.tab-unloader.timeout-minutes",
    type: "int",
    default: 10,
  },
  {
    id: "zen.underpowered.auto-on-resources",
    type: "bool",
    default: true,
  },
  {
    id: "zen.underpowered.auto-on-battery",
    type: "bool",
    default: true,
  },
  {
    id: "zen.underpowered.auto-when-unplugged",
    type: "bool",
    default: false,
  },
  {
    id: "zen.pinned-tab-manager.restore-pinned-tabs-to-pinned-url",
    type: "bool",
    default: true,
  },
  {
    id: "zen.pinned-tab-manager.close-shortcut-behavior",
    type: "string",
    default: "switch",
  },
  {
    id: "zen.workspaces.force-container-workspace",
    type: "bool",
    default: false,
  },
  {
    id: "zen.workspaces.open-new-tab-if-last-unpinned-tab-is-closed",
    type: "bool",
    default: true,
  },
  {
    id: "zen.glance.activation-method",
    type: "string",
    default: "ctrl",
  },
  {
    id: "zen.view.drag-window-from-content",
    type: "bool",
    default: true,
  },
  {
    id: "zen.library.default-section",
    type: "string",
    default: "downloads",
  },
  {
    id: "zen.workspaces.separate-essentials",
    type: "bool",
    default: true,
  },
  {
    id: "peppermint.spaces.isolate-new",
    type: "bool",
    default: true,
  },
  {
    id: "zen.tabs.show-newtab-vertical",
    type: "bool",
    default: true,
  },
  {
    id: "zen.view.show-newtab-button-top",
    type: "bool",
    default: true,
  },
  {
    id: "media.videocontrols.picture-in-picture.enabled",
    type: "bool",
    default: true,
  },
  {
    id: "zen.workspaces.continue-where-left-off",
    type: "bool",
    default: true,
  },
  {
    id: "zen.tabs.ctrl-tab.ignore-essential-tabs",
    type: "bool",
    default: false,
  },
  {
    id: "zen.tabs.ctrl-tab.ignore-pending-tabs",
    type: "bool",
    default: false,
  },
  {
    id: "zen.tabs.close-on-back-with-no-history",
    type: "bool",
    default: false,
  },
  {
    id: "zen.tabs.select-recently-used-on-close",
    type: "bool",
    default: true,
  },
  {
    id: "peppermint.tabs.confirm-close-button",
    type: "bool",
    default: false,
  },
  {
    id: "peppermint.tabs.confirm-close-middle-click",
    type: "bool",
    default: false,
  },
  {
    id: "peppermint.tabs.islands.enabled",
    type: "bool",
    default: true,
  },
  {
    id: "zen.window-sync.sync-only-pinned-tabs",
    type: "bool",
    default: false,
  },
  {
    id: "zen.cookie-consent.enabled",
    type: "bool",
    default: true,
  },
  {
    id: "zen.homepage.mode",
    type: "string",
    default: "builtin",
  },
  {
    id: "zen.homepage.url",
    type: "string",
    default: "",
  },
  {
    id: "zen.homepage.cards.time-spent",
    type: "bool",
    default: true,
  },
  {
    id: "zen.homepage.cards.top-site",
    type: "bool",
    default: true,
  },
  {
    id: "zen.homepage.cards.network-speed",
    type: "bool",
    default: true,
  },
  {
    id: "zen.homepage.cards.downloads",
    type: "bool",
    default: true,
  },
  {
    id: "zen.homepage.cards.visited-sites",
    type: "bool",
    default: true,
  },
  {
    id: "zen.homepage.cards.version",
    type: "bool",
    default: true,
  },
  {
    id: "zen.homepage.cards.report",
    type: "bool",
    default: true,
  },
  {
    id: "zen.homepage.cards.clock",
    type: "bool",
    default: true,
  },
  {
    id: "zen.notepad.autocomplete-key",
    type: "string",
    default: "Tab",
  },
  {
    id: "peppermint.janitor.enabled",
    type: "bool",
    default: false,
  },
  {
    id: "peppermint.janitor.schedule",
    type: "string",
    default: "startup",
  },
  {
    id: "peppermint.janitor.clean-temp",
    type: "bool",
    default: true,
  },
  {
    id: "peppermint.janitor.clean-traces",
    type: "bool",
    default: true,
  },
  {
    id: "peppermint.janitor.clean-updates",
    type: "bool",
    default: true,
  },
  {
    id: "peppermint.janitor.clean-caches",
    type: "bool",
    default: true,
  },
  {
    id: "peppermint.janitor.clean-recycle-bin",
    type: "bool",
    default: false,
  },
  {
    id: "peppermint.janitor.notifications",
    type: "bool",
    default: true,
  },
  {
    id: "zen.ghost-mode.delete-downloads",
    type: "bool",
    default: false,
  },
]);

Preferences.addSetting({
  id: "zenWorkspaceContinueWhereLeftOff",
  pref: "zen.workspaces.continue-where-left-off",
});
