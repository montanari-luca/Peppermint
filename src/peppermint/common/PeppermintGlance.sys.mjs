/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Glance on/off for Peppermint's settings, the palette and anything else with
 * a single toggle. Zen has no zen.glance.enabled pref any more: Glance is off
 * when its activation method is "none". Turning it off remembers the method so
 * turning it back on restores it instead of resetting it to Zen's default.
 */

const METHOD_PREF = "zen.glance.activation-method";
const PREVIOUS_PREF = "peppermint.glance.previous-activation-method";
const OFF = "none";

export const PeppermintGlance = {
  METHOD_PREF,

  /** @returns {string} The modifier(s) that open a link in Glance, or "none". */
  get method() {
    return Services.prefs.getStringPref(METHOD_PREF, OFF);
  },

  /** @returns {string} The method Glance uses, or would use once turned on. */
  get methodWhenOn() {
    const method = this.method;
    if (method !== OFF) {
      return method;
    }
    const previous = Services.prefs.getStringPref(PREVIOUS_PREF, "");
    if (previous && previous !== OFF) {
      return previous;
    }
    const fallback = Services.prefs
      .getDefaultBranch("")
      .getStringPref(METHOD_PREF, OFF);
    return fallback !== OFF ? fallback : "shift";
  },

  get enabled() {
    return this.method !== OFF;
  },

  set enabled(on) {
    if (on === this.enabled) {
      return;
    }
    if (on) {
      Services.prefs.setStringPref(METHOD_PREF, this.methodWhenOn);
      return;
    }
    Services.prefs.setStringPref(PREVIOUS_PREF, this.method);
    Services.prefs.setStringPref(METHOD_PREF, OFF);
  },
};
