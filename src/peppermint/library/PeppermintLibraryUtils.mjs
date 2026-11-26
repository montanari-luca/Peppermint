/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** Formatting shared by Peppermint's Library sections. */

const MS_PER_DAY = 86400000;

/**
 * @param {number} when - Milliseconds since 1970
 * @returns {number} Midnight of that local day
 */
export function startOfDay(when) {
  const date = new Date(when);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * @param {number} day - Midnight of a local day
 * @returns {string} "Today", "Yesterday", a weekday name a few days back, or
 *   the date
 */
export function formatDay(day) {
  const daysAgo = Math.round((startOfDay(Date.now()) - day) / MS_PER_DAY);
  const formatted =
    daysAgo >= 0 && daysAgo <= 6
      ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
          -daysAgo,
          "day"
        )
      : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(day);
  return formatted.charAt(0).toLocaleUpperCase() + formatted.slice(1);
}

/**
 * @param {string} url
 * @returns {string} The host without "www.", or the URL when it has none
 */
export function shortHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || url;
  } catch {
    return url;
  }
}

/**
 * Groups items by local day, most recent day first, keeping their order.
 *
 * @param {object[]} items
 * @param {(item: object) => number} when
 * @returns {Map<number, object[]>}
 */
export function groupByDay(items, when) {
  const groups = new Map();
  for (const item of items) {
    const day = startOfDay(when(item));
    if (!groups.has(day)) {
      groups.set(day, []);
    }
    groups.get(day).push(item);
  }
  return groups;
}
