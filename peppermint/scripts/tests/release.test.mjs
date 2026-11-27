// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { renderNotes } from "../release-notes.mjs";
import {
  assetName,
  buildManifest,
  compareVersions,
  manifestLocation,
  tagFor,
} from "../write-update-manifest.mjs";

// The manifest that was live before signed releases (BETA-2026.0.3).
const previous = {
  version: "2026.0.3 Beta",
  latest: "2026.0.3",
  versionLabel: "v2026.0.3 Beta",
  channel: "Beta",
  releaseDate: "2026-11-09",
  releaseUrl: "https://github.com/montanari-luca/Peppermint/releases/tag/BETA-2026.0.3",
  website: { keep: true },
  downloads: {
    "macos-universal": "https://example.com/old.dmg",
    "windows-x64": "https://example.com/old.zip",
    "windows-arm64": "",
    "windows-x64-zip": "https://example.com/old.zip",
    "linux-x64": "",
    "linux-arm64": "",
    macos: "https://example.com/old.dmg",
    windows: "https://example.com/old.zip",
  },
  sha256: { macos: "0".repeat(64) },
};

function assetsDir(version, suffixes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-assets-"));
  for (const suffix of suffixes) {
    fs.writeFileSync(path.join(dir, assetName(version, suffix)), `file ${suffix}`);
  }
  return dir;
}

const hash = text => crypto.createHash("sha256").update(text).digest("hex");

test("a release manifest points every platform at this release's files", () => {
  const dir = assetsDir("2026.0.4", [
    "-macos-universal.dmg",
    "-windows-x64-setup.exe",
    "-windows-x64-portable.zip",
    "-linux-x86_64.tar.xz",
  ]);
  const manifest = buildManifest({
    version: "2026.0.4",
    channel: "Beta",
    tag: "BETA-2026.0.4",
    repo: "montanari-luca/Peppermint",
    assetsDir: dir,
    previous,
    date: "2026-12-01",
  });
  const base = "https://github.com/montanari-luca/Peppermint/releases/download/BETA-2026.0.4/";
  assert.equal(manifest.latest, "2026.0.4");
  assert.equal(manifest.version, "2026.0.4 Beta");
  assert.equal(manifest.versionLabel, "v2026.0.4 Beta");
  assert.equal(manifest.releaseDate, "2026-12-01");
  assert.equal(
    manifest.releaseUrl,
    "https://github.com/montanari-luca/Peppermint/releases/tag/BETA-2026.0.4"
  );
  assert.deepEqual(manifest.website, { keep: true }, "unknown fields are kept");
  assert.equal(manifest.downloads.macos, `${base}Peppermint-2026.0.4-macos-universal.dmg`);
  assert.equal(manifest.downloads["macos-universal"], manifest.downloads.macos);
  assert.equal(
    manifest.downloads.windows,
    `${base}Peppermint-2026.0.4-windows-x64-setup.exe`,
    "the installer, not the zip"
  );
  assert.equal(
    manifest.downloads["windows-x64-zip"],
    `${base}Peppermint-2026.0.4-windows-x64-portable.zip`
  );
  assert.equal(manifest.downloads.linux, `${base}Peppermint-2026.0.4-linux-x86_64.tar.xz`);
  assert.equal(manifest.downloads["windows-arm64"], "", "no file, no link");
  assert.equal(manifest.downloads["linux-arm64"], "");
  assert.equal(manifest.sha256.macos, hash("file -macos-universal.dmg"));
  assert.equal(manifest.sha256.windows, hash("file -windows-x64-setup.exe"));
  assert.equal(manifest.sha256["linux-x64"], hash("file -linux-x86_64.tar.xz"));
  assert.equal(manifest.sha256["windows-arm64"], undefined, "old checksums are dropped");
  fs.rmSync(dir, { recursive: true });
});

test("a platform built last time but not now gets no stale link", () => {
  const dir = assetsDir("2026.0.4", ["-linux-x86_64.tar.xz"]);
  const manifest = buildManifest({
    version: "2026.0.4",
    channel: "Stable",
    tag: "v2026.0.4",
    repo: "o/r",
    assetsDir: dir,
    previous,
  });
  assert.equal(manifest.downloads.macos, "");
  assert.equal(manifest.downloads.windows, "");
  assert.equal(manifest.version, "2026.0.4");
  assert.equal(manifest.versionLabel, "v2026.0.4");
  fs.rmSync(dir, { recursive: true });
});

test("a release must be newer than the published one and have files", () => {
  const dir = assetsDir("2026.0.3", ["-linux-x86_64.tar.xz"]);
  const options = { channel: "Beta", tag: "t", repo: "o/r", assetsDir: dir, previous };
  assert.throws(() => buildManifest({ ...options, version: "2026.0.3" }), /not newer/);
  assert.throws(() => buildManifest({ ...options, version: "2026.0.2" }), /not newer/);
  assert.throws(() => buildManifest({ ...options, version: "2026.1.0" }), /No release files/);
  assert.throws(() => buildManifest({ ...options, version: "latest" }), /Not a release version/);
  fs.rmSync(dir, { recursive: true });
});

test("versions compare numerically and tags follow the channel", () => {
  assert.equal(compareVersions("2026.0.10", "2026.0.9"), 1);
  assert.equal(compareVersions("2026.0", "2026.0.0"), 0);
  assert.equal(compareVersions("2026.0.3", "2027"), -1);
  assert.equal(tagFor("2026.0.4", "Beta"), "BETA-2026.0.4");
  assert.equal(tagFor("2026.0.4", "Stable"), "v2026.0.4");
});

test("the manifest location comes from the updater's pref", () => {
  assert.deepEqual(manifestLocation(), {
    url: "https://raw.githubusercontent.com/montanari-luca/MintFlow-Releases/refs/heads/main/peppermint.json",
    owner: "montanari-luca",
    repo: "MintFlow-Releases",
    branch: "main",
    path: "peppermint.json",
  });
});

test("release notes say what is unsigned and list the checksums", () => {
  const notes = renderNotes({
    version: "2026.0.4",
    channel: "Beta",
    firefox: "161.0",
    highlights: "Signed updates.",
    changes: ["Sign the update information"],
    upstreamMerges: 2,
    sums: "abc  Peppermint-2026.0.4-linux-x86_64.tar.xz",
    macSigned: false,
    macNotarized: false,
    windowsSigned: false,
  });
  assert.match(notes, /^# Peppermint 2026\.0\.4 Beta\n/);
  assert.match(notes, /Signed updates\./);
  assert.match(notes, /Based on Firefox 161\.0\./);
  assert.match(notes, /- Sign the update information/);
  assert.match(notes, /2 merges of Zen/);
  assert.match(notes, /Not signed yet: the first time, Control-click/);
  assert.match(notes, /SmartScreen/);
  assert.match(notes, /abc {2}Peppermint-2026\.0\.4-linux-x86_64\.tar\.xz/);
  const signed = renderNotes({
    version: "2026.0.4",
    channel: "Stable",
    firefox: "161.0",
    highlights: "",
    changes: [],
    upstreamMerges: 0,
    sums: "",
    macSigned: true,
    macNotarized: true,
    windowsSigned: true,
  });
  assert.doesNotMatch(signed, /Not signed|SmartScreen|Verify your download/);
  assert.match(signed, /^# Peppermint 2026\.0\.4\n/);
});
