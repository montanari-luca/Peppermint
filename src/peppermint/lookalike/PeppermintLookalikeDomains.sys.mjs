/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tells whether a domain imitates a popular one, by comparing it with the
 * popular sites list the address bar already ships. Two kinds are caught:
 *
 *   confusable  letters from another script or characters that look alike
 *               (Cyrillic "а" for "a", "0" for "o", "rn" for "m"), so the
 *               name reads like a popular one: аpple.com, paypa1.com
 *   typo        one letter added, missing, changed or swapped compared with
 *               one of the most popular names under the same suffix:
 *               amazom.com, githbu.com
 *
 * A popular name under another suffix (google.de next to google.com) is not
 * a lookalike.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  loadSites:
    "moz-src:///peppermint/urlbar/PeppermintUrlbarProviderPopularSites.sys.mjs",
});
ChromeUtils.defineLazyGetter(lazy, "idn", () =>
  Cc["@mozilla.org/network/idn-service;1"].getService(Ci.nsIIDNService)
);

// How many of the most popular sites typos are compared with, and the
// shortest name compared: short names are one letter away from too much.
const TYPO_SITES = 1000;
const TYPO_MIN_LENGTH = 5;
const CONFUSABLE_MIN_LENGTH = 3;

// Characters drawn like a Latin letter in common fonts.
const CONFUSABLES = {
  // Cyrillic
  а: "a",
  в: "b",
  с: "c",
  ԁ: "d",
  е: "e",
  ё: "e",
  ҽ: "e",
  һ: "h",
  і: "i",
  ї: "i",
  ј: "j",
  к: "k",
  ӏ: "l",
  м: "m",
  п: "n",
  о: "o",
  р: "p",
  ԛ: "q",
  г: "r",
  ѕ: "s",
  т: "t",
  ц: "u",
  ѵ: "v",
  ԝ: "w",
  х: "x",
  у: "y",
  // Greek
  α: "a",
  β: "b",
  ε: "e",
  η: "n",
  ι: "i",
  κ: "k",
  ν: "v",
  ο: "o",
  ρ: "p",
  τ: "t",
  υ: "u",
  χ: "x",
  γ: "y",
  // Armenian
  հ: "h",
  ո: "n",
  օ: "o",
  ս: "u",
  ց: "g",
  զ: "q",
  // Latin letters that are not ASCII
  ɑ: "a",
  ɡ: "g",
  ı: "i",
  ɩ: "i",
  ȷ: "j",
  ℓ: "l",
  ɴ: "n",
  ʀ: "r",
  // Digits
  0: "o",
  1: "l",
};

const SEQUENCES = [
  [/rn/g, "m"],
  [/vv/g, "w"],
];

/**
 * @param {string} label - A domain label in Unicode, lower case
 * @returns {string} The Latin letters it reads as
 */
export function skeleton(label) {
  let result = "";
  for (const char of label.normalize("NFD").replace(/\p{M}/gu, "")) {
    result += CONFUSABLES[char] ?? char;
  }
  for (const [pattern, replacement] of SEQUENCES) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {boolean} Whether one letter added, removed, changed, or two
 *   neighbours swapped, turns `a` into `b`
 */
export function isOneEditAway(a, b) {
  if (a == b || Math.abs(a.length - b.length) > 1) {
    return false;
  }
  let start = 0;
  while (start < a.length && a[start] == b[start]) {
    start++;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] == b[endB - 1]) {
    endA--;
    endB--;
  }
  const restA = endA - start;
  const restB = endB - start;
  if (restA <= 1 && restB <= 1) {
    return true;
  }
  return (
    restA == 2 &&
    restB == 2 &&
    a[start] == b[start + 1] &&
    a[start + 1] == b[start]
  );
}

function split(host) {
  try {
    const base = Services.eTLD.getBaseDomainFromHost(host);
    const suffix = Services.eTLD.getPublicSuffixFromHost(host);
    const name = base.slice(0, -(suffix.length + 1));
    if (!name || name.includes(".")) {
      return null;
    }
    return { base, suffix, name };
  } catch {
    // IP addresses, single labels and bare public suffixes have no base.
    return null;
  }
}

let gIndex = null;
let gSitesOverride = null;

function buildIndex(domains) {
  const index = {
    domains: new Set(),
    names: new Set(),
    byName: new Map(),
    typos: [],
  };
  domains.forEach((domain, rank) => {
    const parts = split(domain);
    if (!parts) {
      return;
    }
    index.domains.add(parts.base);
    index.names.add(parts.name);
    if (
      parts.name.length >= CONFUSABLE_MIN_LENGTH &&
      skeleton(parts.name) == parts.name
    ) {
      const list = index.byName.get(parts.name) ?? [];
      list.push(parts);
      index.byName.set(parts.name, list);
    }
    if (rank < TYPO_SITES && parts.name.length >= TYPO_MIN_LENGTH) {
      index.typos.push(parts);
    }
  });
  return index;
}

async function getIndex() {
  if (!gIndex) {
    const domains =
      gSitesOverride ?? (await lazy.loadSites()).map(site => site.domain);
    gIndex ??= buildIndex(domains);
  }
  return gIndex;
}

/**
 * @param {string} host - An ASCII host name (punycode for Unicode names)
 * @returns {Promise<{base: string, domain: string, reason: string}|null>}
 *   The popular domain `host` imitates and how, or null when it does not
 *   look like one
 */
export async function findLookalike(host) {
  const parts = split(host.toLowerCase());
  if (!parts) {
    return null;
  }
  const index = await getIndex();
  if (index.domains.has(parts.base)) {
    return null;
  }
  let name;
  try {
    name = lazy.idn.convertACEtoUTF8(parts.name).toLowerCase();
  } catch {
    return null;
  }
  if (index.names.has(name)) {
    return null;
  }
  const reads = skeleton(name);
  const matches = reads != name && index.byName.get(reads);
  if (matches) {
    const match =
      matches.find(site => site.suffix == parts.suffix) ?? matches[0];
    return { base: parts.base, domain: match.base, reason: "confusable" };
  }
  if (/^[a-z0-9-]+$/.test(name) && name.length >= TYPO_MIN_LENGTH - 1) {
    const match = index.typos.find(
      site => site.suffix == parts.suffix && isOneEditAway(name, site.name)
    );
    if (match) {
      return { base: parts.base, domain: match.base, reason: "typo" };
    }
  }
  return null;
}

/**
 * Test hook: compare with these domains instead of the popular sites list.
 *
 * @param {string[]|null} domains - Most popular first; null for the real list
 */
export function setSitesForTests(domains) {
  gSitesOverride = domains;
  gIndex = null;
}
