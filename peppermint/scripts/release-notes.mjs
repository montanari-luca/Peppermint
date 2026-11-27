// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Prints the GitHub release notes for a version (Markdown).
 *
 *   node peppermint/scripts/release-notes.mjs --version 2026.0.4 --channel Beta \
 *     [--previous-tag BETA-2026.0.3] [--sums SHA256SUMS.txt] \
 *     [--mac-signed true] [--mac-notarized true] [--windows-signed true]
 *
 * Highlights come from peppermint/release-notes/<version>.md when it exists;
 * the list of changes is the first-parent history since --previous-tag
 * (upstream merges are summarized in one line).
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

/** Commit subjects since `previousTag`, Zen merges counted apart. */
export function changesSince(previousTag) {
  let known = false;
  if (previousTag) {
    try {
      git("rev-parse", "--verify", "--quiet", `${previousTag}^{commit}`);
      known = true;
    } catch {
      console.error(`release-notes: no tag ${previousTag} here, listing the last 50 changes`);
    }
  }
  const range = known ? [`${previousTag}..HEAD`] : ["-n", "50", "HEAD"];
  const subjects = git("log", "--first-parent", "--format=%s", ...range)
    .split("\n")
    .filter(Boolean);
  const merges = subjects.filter(
    s =>
      /^Merge (upstream|remote-tracking branch 'upstream)/.test(s) ||
      /^Merge pull request .*sync\/upstream-/.test(s)
  );
  return {
    changes: subjects.filter(s => !merges.includes(s) && !/^Merge /.test(s)),
    upstreamMerges: merges.length,
  };
}

export function renderNotes({
  version,
  channel,
  firefox,
  highlights,
  changes,
  upstreamMerges,
  sums,
  macSigned,
  macNotarized,
  windowsSigned,
}) {
  const lines = [`# Peppermint ${version}${channel === "Stable" ? "" : ` ${channel}`}`, ""];
  if (highlights) {
    lines.push(highlights.trim(), "");
  }
  lines.push(`Based on Firefox ${firefox}.`, "");
  if (changes.length) {
    lines.push("## Changes", "", ...changes.map(c => `- ${c}`), "");
  }
  if (upstreamMerges) {
    lines.push(
      `Includes ${upstreamMerges} merge${upstreamMerges === 1 ? "" : "s"} of Zen's latest changes.`,
      ""
    );
  }
  lines.push("## Install", "");
  lines.push(
    "- **macOS** (Apple silicon and Intel): `Peppermint-*-macos-universal.dmg`." +
      (macNotarized
        ? ""
        : macSigned
          ? " Not notarized yet: the first time, Control-click the app and choose Open."
          : " Not signed yet: the first time, Control-click the app and choose Open, or run `xattr -dr com.apple.quarantine /Applications/Peppermint.app`.")
  );
  lines.push(
    "- **Windows**: `Peppermint-*-windows-x64-setup.exe`, or the portable `.zip`." +
      (windowsSigned
        ? ""
        : " Not signed yet: SmartScreen may ask you to confirm (More info, then Run anyway).")
  );
  lines.push(
    "- **Linux**: `Peppermint-*-linux-x86_64.tar.xz`; extract it and run `peppermint/peppermint`."
  );
  lines.push(
    "",
    "Installed copies update themselves; every update is checked against a signed list of checksums.",
    ""
  );
  if (sums) {
    lines.push("## Verify your download", "");
    lines.push(
      "Compare `sha256sum <file>` (macOS: `shasum -a 256 <file>`) with this list, or check the build provenance with `gh attestation verify <file> --repo montanari-luca/Peppermint`.",
      "",
      "```",
      sums.trim(),
      "```",
      ""
    );
  }
  return `${lines.join("\n").trim()}\n`;
}

function option(args, name, fallback = null) {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
}

function main(args) {
  const version = option(args, "--version");
  if (!version) {
    console.error("release-notes: --version is required");
    return 2;
  }
  const highlightsFile = path.join(root, "peppermint/release-notes", `${version}.md`);
  const sumsFile = option(args, "--sums");
  const surfer = JSON.parse(fs.readFileSync(path.join(root, "surfer.json"), "utf8"));
  process.stdout.write(
    renderNotes({
      version,
      channel: option(args, "--channel", "Beta"),
      firefox: surfer.version.candidate || surfer.version.version,
      highlights: fs.existsSync(highlightsFile) ? fs.readFileSync(highlightsFile, "utf8") : "",
      ...changesSince(option(args, "--previous-tag")),
      sums: sumsFile ? fs.readFileSync(sumsFile, "utf8") : "",
      macSigned: option(args, "--mac-signed") === "true",
      macNotarized: option(args, "--mac-notarized") === "true",
      windowsSigned: option(args, "--windows-signed") === "true",
    })
  );
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
