// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Writes peppermint.json, the update information that the browser's updater
 * (src/peppermint/updater) and the website read, for a release.
 *
 *   node peppermint/scripts/write-update-manifest.mjs \
 *     --version 2026.0.4 --channel Beta --tag BETA-2026.0.4 \
 *     --assets <dir> [--previous <peppermint.json>] [--date YYYY-MM-DD] \
 *     [--repo owner/name] --out peppermint.json
 *       <dir> holds the release files, named Peppermint-<version>-<platform>
 *       (see ASSETS). Every download gets its SHA-256, which the updater
 *       requires. Fields of --previous that this script does not manage are
 *       kept, and platforms without a file this time are left empty, so no
 *       client is sent an older version's file.
 *   node peppermint/scripts/write-update-manifest.mjs location
 *       Prints where the updater reads the file (from
 *       prefs/peppermint/updater.yaml) as url=, owner=, repo=, branch=, path=.
 *   node peppermint/scripts/write-update-manifest.mjs tag <version> <channel>
 *       Prints the release tag (BETA-<version>, or v<version> for Stable).
 *   node peppermint/scripts/write-update-manifest.mjs newer <a> <b>
 *       Exits 0 when version <a> is newer than <b>.
 *   node peppermint/scripts/write-update-manifest.mjs check-live <json> <sig> [--timeout <s>]
 *       Waits until the published file and its signature match these copies
 *       (the raw file cache can lag by minutes), then checks that every
 *       download it lists has the listed SHA-256.
 *
 * Only Node built-ins are used, so the release job that holds the signing
 * key never runs third-party code.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Release files, and the manifest keys (the updater's and the website's) for each. */
export const ASSETS = [
  { suffix: "-macos-universal.dmg", keys: ["macos", "macos-universal"] },
  { suffix: "-windows-x64-setup.exe", keys: ["windows", "windows-x64"] },
  { suffix: "-windows-x64-portable.zip", keys: ["windows-x64-zip"] },
  { suffix: "-windows-arm64-setup.exe", keys: ["windows-arm64"] },
  { suffix: "-linux-x86_64.tar.xz", keys: ["linux", "linux-x64"] },
  { suffix: "-linux-aarch64.tar.xz", keys: ["linux-aarch64", "linux-arm64"] },
];

/** The release file name for a platform suffix. */
export function assetName(version, suffix) {
  return `Peppermint-${version}${suffix}`;
}

/** -1, 0 or 1, comparing dotted numeric versions. */
export function compareVersions(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) {
      return Math.sign(d);
    }
  }
  return 0;
}

/** The release tag for a version on a channel. */
export function tagFor(version, channel) {
  return channel === "Stable" ? `v${version}` : `${channel.toUpperCase()}-${version}`;
}

export function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/**
 * The manifest for a release.
 *
 * @param {object} options
 * @param {string} options.version
 * @param {string} options.channel - "Beta" or "Stable".
 * @param {string} options.tag
 * @param {string} options.repo - owner/name of the repository with the releases.
 * @param {string} options.assetsDir
 * @param {object} [options.previous] - The manifest being replaced.
 * @param {string} [options.date] - YYYY-MM-DD.
 */
export function buildManifest({ version, channel, tag, repo, assetsDir, previous = {}, date }) {
  if (!/^\d+(\.\d+){0,3}$/.test(version)) {
    throw new Error(`Not a release version: ${version}`);
  }
  if (previous.latest && compareVersions(version, previous.latest) <= 0) {
    throw new Error(`${version} is not newer than the published ${previous.latest}`);
  }
  const label = channel === "Stable" ? version : `${version} ${channel}`;
  const downloads = Object.fromEntries(Object.keys(previous.downloads ?? {}).map(key => [key, ""]));
  const checksums = {};
  let found = 0;
  for (const { suffix, keys } of ASSETS) {
    const name = assetName(version, suffix);
    const file = path.join(assetsDir, name);
    for (const key of keys) {
      downloads[key] ??= "";
    }
    if (!fs.existsSync(file)) {
      continue;
    }
    found++;
    const hash = sha256(file);
    for (const key of keys) {
      downloads[key] = `https://github.com/${repo}/releases/download/${tag}/${name}`;
      checksums[key] = hash;
    }
  }
  if (!found) {
    throw new Error(`No release files for ${version} in ${assetsDir}`);
  }
  return {
    ...previous,
    version: label,
    latest: version,
    versionLabel: `v${label}`,
    channel,
    releaseDate: date ?? new Date().toISOString().slice(0, 10),
    releaseUrl: `https://github.com/${repo}/releases/tag/${tag}`,
    downloads,
    sha256: checksums,
  };
}

/** Where the updater reads peppermint.json from, per prefs/peppermint/updater.yaml. */
export function manifestLocation(prefsFile = path.join(root, "prefs/peppermint/updater.yaml")) {
  const text = fs.readFileSync(prefsFile, "utf8");
  const url = text.match(/name:\s*peppermint\.update\.url\s*\n\s*value:\s*"([^"]+)"/)?.[1];
  const parts = url?.match(
    /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/(?:refs\/heads\/)?([^/]+)\/(.+)$/
  );
  if (!parts) {
    throw new Error(`peppermint.update.url is not a raw.githubusercontent.com file: ${url}`);
  }
  const [, owner, repo, branch, file] = parts;
  return { url, owner, repo, branch, path: file };
}

function option(args, name, fallback) {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
}

async function fetchBytes(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

/** Waits for the published manifest and signature, then checks every download. */
export async function checkLive(manifestFile, signatureFile, { timeoutSeconds = 600 } = {}) {
  const { url } = manifestLocation();
  const wanted = [
    [url, digest(fs.readFileSync(manifestFile))],
    [`${url}.sig`, digest(fs.readFileSync(signatureFile))],
  ];
  const deadline = Date.now() + timeoutSeconds * 1000;
  for (const [target, hash] of wanted) {
    // A query string skips the raw file cache's copy of the previous version.
    for (;;) {
      const live = await fetchBytes(`${target}?check=${Date.now()}`).catch(() => null);
      if (live && digest(live) === hash) {
        console.log(`live: ${target}`);
        break;
      }
      if (Date.now() > deadline) {
        throw new Error(`${target} still does not match after ${timeoutSeconds}s`);
      }
      await new Promise(resolve => setTimeout(resolve, 15000));
    }
  }
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const checked = new Map();
  for (const [key, download] of Object.entries(manifest.downloads)) {
    if (!download) {
      continue;
    }
    if (!checked.has(download)) {
      checked.set(download, digest(await fetchBytes(download)));
    }
    if (checked.get(download) !== manifest.sha256[key]) {
      throw new Error(`${key}: ${download} does not match its SHA-256`);
    }
    console.log(`ok: ${key}`);
  }
}

async function main(args) {
  switch (args[0]) {
    case "location":
      for (const [key, value] of Object.entries(manifestLocation())) {
        console.log(`${key}=${value}`);
      }
      return 0;
    case "tag":
      console.log(tagFor(args[1], args[2]));
      return 0;
    case "newer":
      return compareVersions(args[1], args[2]) > 0 ? 0 : 1;
    case "check-live":
      await checkLive(args[1], args[2], {
        timeoutSeconds: Number(option(args, "--timeout", 600)),
      });
      return 0;
  }
  const required = ["--version", "--channel", "--tag", "--assets", "--out"];
  const missing = required.filter(name => !option(args, name));
  if (missing.length) {
    console.error(`write-update-manifest: missing ${missing.join(", ")}`);
    return 2;
  }
  const previousFile = option(args, "--previous");
  const previous = previousFile ? JSON.parse(fs.readFileSync(previousFile, "utf8")) : {};
  const identity = JSON.parse(fs.readFileSync(path.join(root, "peppermint/identity.json"), "utf8"));
  const manifest = buildManifest({
    version: option(args, "--version"),
    channel: option(args, "--channel"),
    tag: option(args, "--tag"),
    repo: option(args, "--repo", identity.repository),
    assetsDir: option(args, "--assets"),
    previous,
    date: option(args, "--date"),
  });
  const out = option(args, "--out");
  fs.writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${out}:`);
  for (const [key, url] of Object.entries(manifest.downloads)) {
    console.log(`  ${key}: ${url || "(none)"}`);
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    code => (process.exitCode = code),
    error => {
      console.error(`write-update-manifest: ${error.message}`);
      process.exitCode = 1;
    }
  );
}
