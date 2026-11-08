/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Pages that only forward to another address, and where that address is.
 * Every rule needs a `host` (a regular expression on the whole host name)
 * and a `path` (on the whole path), and one way to find the destination:
 *
 *   param   query parameters that hold it, tried in order
 *   suffix  the destination is the rest of the path after `path` matched,
 *           without its scheme; `scheme` is put back in front of it
 *
 * A destination is only used when it is an absolute http(s) address.
 */
export const RULES = [
  // Google search results and Gmail
  {
    host: "(www\\.)?google\\.[a-z]{2,3}(\\.[a-z]{2})?",
    path: "/url",
    param: ["q", "url"],
  },
  // Google AMP viewer: /amp/s/example.com/page is https://example.com/page
  {
    host: "(www\\.)?google\\.[a-z]{2,3}(\\.[a-z]{2})?",
    path: "/amp/s/",
    suffix: true,
    scheme: "https://",
  },
  {
    host: "(www\\.)?google\\.[a-z]{2,3}(\\.[a-z]{2})?",
    path: "/amp/",
    suffix: true,
    scheme: "http://",
  },
  // AMP cache: example-com.cdn.ampproject.org/c/s/example.com/page
  {
    host: "[a-z0-9-]+\\.cdn\\.ampproject\\.org",
    path: "/[cvi]/s/",
    suffix: true,
    scheme: "https://",
  },
  {
    host: "[a-z0-9-]+\\.cdn\\.ampproject\\.org",
    path: "/[cvi]/",
    suffix: true,
    scheme: "http://",
  },
  { host: "(l|lm)\\.facebook\\.com", path: "/l\\.php", param: ["u"] },
  { host: "l\\.instagram\\.com", path: "/", param: ["u"] },
  { host: "l\\.messenger\\.com", path: "/l\\.php", param: ["u"] },
  { host: "out\\.reddit\\.com", path: "/.*", param: ["url"] },
  { host: "(www\\.)?youtube\\.com", path: "/redirect", param: ["q"] },
  { host: "(www\\.)?linkedin\\.com", path: "/safety/go", param: ["url"] },
  { host: "steamcommunity\\.com", path: "/linkfilter/", param: ["u", "url"] },
  { host: "away\\.vk\\.com", path: "/away\\.php", param: ["to"] },
  { host: "slack-redir\\.net", path: "/link", param: ["url"] },
  { host: "t\\.umblr\\.com", path: "/redirect", param: ["z"] },
  { host: "exit\\.sc", path: "/", param: ["url"] },
  { host: "(www\\.)?deviantart\\.com", path: "/users/outgoing", param: ["url"] },
  { host: "click\\.linksynergy\\.com", path: "/.*", param: ["murl", "RD_PARM1"] },
];
