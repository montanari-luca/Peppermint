/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Clean links: a page load that goes to a known forwarding page (a search
 * engine's click tracker, a social network's outbound link, an AMP viewer)
 * goes straight to the destination instead, so the forwarder never sees the
 * click. Query parameter stripping (Firefox's own) then removes tracking
 * parameters from the destination.
 *
 * Only top-level GET page loads are rewritten; images, scripts and frames
 * load as they are.
 */

import { RULES } from "moz-src:///peppermint/clean-links/PeppermintCleanLinksRules.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "enabled",
  "peppermint.clean-links.enabled",
  true
);

function compile(rules) {
  return rules.map(rule => ({
    ...rule,
    host: new RegExp(`^(?:${rule.host})$`, "i"),
    path: new RegExp(`^(?:${rule.path})${rule.suffix ? "" : "$"}`, "i"),
  }));
}

let compiled = compile(RULES);

// A destination rebuilt from a path must name a real host ("example.com"),
// so "/amp/s/" with nothing after it is not read as the host "s".
function isWebAddress(spec, { needsDomain = false } = {}) {
  try {
    const url = new URL(spec);
    return (
      (url.protocol == "https:" || url.protocol == "http:") &&
      (!needsDomain || url.hostname.includes("."))
    );
  } catch {
    return false;
  }
}

/**
 * Where a forwarding address leads.
 *
 * @param {string} spec - An address
 * @returns {string|null} The destination, or null when `spec` is not a
 *   known forwarding address or holds no usable destination
 */
export function unwrap(spec) {
  let url;
  try {
    url = new URL(spec);
  } catch {
    return null;
  }
  if (url.protocol != "https:" && url.protocol != "http:") {
    return null;
  }
  for (const rule of compiled) {
    if (!rule.host.test(url.hostname)) {
      continue;
    }
    const match = rule.path.exec(url.pathname);
    if (!match) {
      continue;
    }
    if (rule.suffix) {
      const rest = url.pathname.slice(match[0].length);
      const target = `${rule.scheme}${rest}${url.search}${url.hash}`;
      if (rest && isWebAddress(target, { needsDomain: true })) {
        return target;
      }
      continue;
    }
    for (const name of rule.param) {
      const target = url.searchParams.get(name);
      if (target && isWebAddress(target) && target != spec) {
        return target;
      }
    }
  }
  return null;
}

const observer = {
  observe(subject) {
    if (!lazy.enabled) {
      return;
    }
    const channel = subject.QueryInterface(Ci.nsIHttpChannel);
    if (
      channel.loadInfo.externalContentPolicyType !=
        Ci.nsIContentPolicy.TYPE_DOCUMENT ||
      channel.requestMethod != "GET"
    ) {
      return;
    }
    const target = unwrap(channel.URI.spec);
    if (!target) {
      return;
    }
    try {
      channel.redirectTo(Services.io.newURI(target));
    } catch (error) {
      console.error("Clean links could not skip", channel.URI.spec, error);
    }
  },
};

let started = false;

export const PeppermintCleanLinks = {
  start() {
    if (started) {
      return;
    }
    started = true;
    Services.obs.addObserver(observer, "http-on-modify-request");
  },

  /**
   * Replaces the rules, for tests. Pass nothing to restore the real ones.
   *
   * @param {object[]} [rules]
   */
  setRulesForTests(rules = RULES) {
    compiled = compile(rules);
  },
};
