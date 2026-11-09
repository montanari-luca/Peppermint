/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from /browser/components/preferences/preferences.js */

/**
 * The "Peppermint features" pane: one row per entry of PeppermintFeatures,
 * with its switch, its live keyboard shortcut and a way to its options.
 */
var gPeppermintFeaturesPane = {
  _observers: [],

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    this._registry = ChromeUtils.importESModule(
      "moz-src:///peppermint/features/PeppermintFeatures.sys.mjs"
    );
    this._tour = ChromeUtils.importESModule(
      "moz-src:///peppermint/feature-tour/PeppermintFeatureTour.sys.mjs"
    );
    // Read once: features stay marked "New" while the pane is open, even
    // after showing it counts them as seen.
    this._seen = Services.prefs.getIntPref(this._tour.PREFS.seen, 1);
    for (const feature of this._registry.FEATURES) {
      const group = document.getElementById(
        `peppermintFeatures-${feature.category}`
      );
      group?.append(this._row(feature));
    }
    // Keys get their letters from Fluent and can be rebound, so shortcuts
    // are read again each time the pane is shown.
    document.addEventListener("paneshown", event => {
      if (event.detail.category == "paneZenPeppermint") {
        this._refreshShortcuts();
        this._tour.markFeaturesSeen();
      }
    });
    window.addEventListener("unload", () => this._uninit(), { once: true });
  },

  _refreshShortcuts() {
    for (const feature of this._registry.FEATURES) {
      if (!feature.command) {
        continue;
      }
      const chip = document.querySelector(
        `.peppermint-feature[data-feature="${feature.id}"] .peppermint-feature-shortcut`
      );
      const shortcut = this._shortcut(feature);
      chip.textContent = shortcut ?? "";
      chip.hidden = !shortcut;
    }
  },

  _uninit() {
    for (const [pref, observer] of this._observers) {
      Services.prefs.removeObserver(pref, observer);
    }
    this._observers = [];
  },

  _row(feature) {
    const ids = this._registry.featureL10nIds(feature);
    const row = document.createElement("div");
    row.className = "peppermint-feature";
    row.dataset.feature = feature.id;

    const icon = document.createElement("img");
    icon.className = "peppermint-feature-icon";
    icon.src = `chrome://browser/skin/zen-icons/${feature.icon}`;
    icon.alt = "";

    const text = document.createElement("div");
    text.className = "peppermint-feature-text";
    const name = document.createElement("h3");
    name.className = "peppermint-feature-name";
    name.id = `peppermintFeatureName-${feature.id}`;
    document.l10n.setAttributes(name, ids.name);
    // Settings search reads this only on elements without child elements.
    name.setAttribute("search-l10n-ids", ids.keywords);
    const description = document.createElement("p");
    description.className = "peppermint-feature-description";
    document.l10n.setAttributes(description, ids.description);
    const title = document.createElement("div");
    title.className = "peppermint-feature-title";
    title.append(name);
    if (this._registry.addedIn(feature) > this._seen) {
      const badge = document.createElement("span");
      badge.className = "peppermint-feature-new";
      document.l10n.setAttributes(badge, "peppermint-features-new");
      title.append(badge);
    }
    text.append(title, description);
    row.append(icon, text);

    if (feature.command) {
      const chip = document.createElement("span");
      chip.className = "peppermint-feature-shortcut";
      const shortcut = this._shortcut(feature);
      chip.textContent = shortcut ?? "";
      chip.hidden = !shortcut;
      row.append(chip);
    }

    if (feature.pane || feature.url) {
      const button = document.createXULElement("button");
      document.l10n.setAttributes(
        button,
        feature.url ? "peppermint-features-open" : "peppermint-features-options"
      );
      button.addEventListener("command", () => this._open(feature));
      row.append(button);
    }

    if (feature.pref) {
      row.append(this._toggle(feature, name));
    }
    return row;
  },

  _toggle(feature, name) {
    const toggle = document.createElement("moz-toggle");
    toggle.className = "peppermint-feature-toggle";
    const sync = () => {
      toggle.pressed = Services.prefs.getBoolPref(feature.pref, false);
      toggle.disabled = Services.prefs.prefIsLocked(feature.pref);
    };
    sync();
    toggle.addEventListener("toggle", () => {
      Services.prefs.setBoolPref(feature.pref, toggle.pressed);
    });
    const observer = { observe: sync };
    Services.prefs.addObserver(feature.pref, observer);
    this._observers.push([feature.pref, observer]);
    // moz-toggle names its inner button from ariaLabel, not from a labelling
    // element, so it gets the translated name once it is known.
    document.l10n.translateElements([name]).then(() => {
      toggle.ariaLabel = name.textContent;
    });
    return toggle;
  },

  _shortcut(feature) {
    if (!feature.command) {
      return null;
    }
    const browserWindow = window.browsingContext.topChromeWindow;
    if (!browserWindow) {
      return null;
    }
    const { ZenKeyboardShortcuts } = ChromeUtils.importESModule(
      "resource:///modules/zen/kbs/ZenKeyboardShortcuts.sys.mjs"
    );
    return ZenKeyboardShortcuts.getShortcutDisplayFromCommand(
      browserWindow,
      feature.command
    );
  },

  _open(feature) {
    if (feature.url) {
      window.browsingContext.topChromeWindow.switchToTabHavingURI(
        feature.url,
        true
      );
    } else {
      gotoPref(feature.pane);
    }
  },
};
