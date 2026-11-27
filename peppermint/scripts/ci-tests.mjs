// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Runs Peppermint's browser test suites one by one and reports each result,
 * for CI (.github/workflows/peppermint-tests.yml) and for a full local run.
 *
 *   node peppermint/scripts/ci-tests.mjs --check
 *       Fails when a suite directory is missing from
 *       src/peppermint/tests/moz.build, or the list names one that is gone.
 *       Needs no build.
 *   node peppermint/scripts/ci-tests.mjs [suite ...] [--zen] [--logs <dir>]
 *       Runs `npm test -- <suite> --headless` for every listed suite (or the
 *       ones given), writes each log to <dir> (default test-logs/), and a table
 *       to $GITHUB_STEP_SUMMARY. Exits 1 when any Peppermint suite fails.
 *       --zen also runs Zen's suites, whose failures are reported but do not
 *       fail the run.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const TESTS_DIR = path.join(root, "src/peppermint/tests");
const ZEN_TESTS_DIR = path.join(root, "src/zen/tests");
const MANIFESTS = ["browser.toml", "xpcshell.toml", "mochitest.toml"];
// A hung suite must not eat the whole job.
const SUITE_TIMEOUT_MS = 45 * 60 * 1000;

/** The suite directories that moz.build registers, by manifest kind. */
export function listedSuites(mozBuildText) {
  const suites = [];
  for (const match of mozBuildText.matchAll(/"([^"]+)\/(browser|xpcshell|mochitest)\.toml"/g)) {
    suites.push({ dir: match[1], manifest: `${match[2]}.toml` });
  }
  return suites;
}

/** The directories under `dir` that hold a test manifest. */
export function suiteDirs(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .flatMap(entry =>
      MANIFESTS.filter(manifest => fs.existsSync(path.join(dir, entry.name, manifest))).map(
        manifest => ({ dir: entry.name, manifest })
      )
    );
}

/** Problems with the registration of the suites in `dir`, as messages. */
export function checkSuites(dir = TESTS_DIR) {
  const listed = listedSuites(fs.readFileSync(path.join(dir, "moz.build"), "utf8"));
  const present = suiteDirs(dir);
  const key = suite => `${suite.dir}/${suite.manifest}`;
  const listedKeys = new Set(listed.map(key));
  const presentKeys = new Set(present.map(key));
  const problems = [];
  for (const suite of present) {
    if (!listedKeys.has(key(suite))) {
      problems.push(`${key(suite)} is not listed in moz.build, so it never runs`);
    }
  }
  for (const suite of listed) {
    if (!presentKeys.has(key(suite))) {
      problems.push(`moz.build lists ${key(suite)}, which does not exist`);
    }
  }
  return problems;
}

/** The first unexpected results in a test log. */
export function failuresIn(log, limit = 5) {
  const lines = log
    .split("\n")
    .filter(line => /TEST-UNEXPECTED-|PROCESS-CRASH|Assertion failure/.test(line))
    .map(line =>
      line.replace(/^.*?(TEST-UNEXPECTED-|PROCESS-CRASH|Assertion failure)/, "$1").trim()
    );
  return [...new Set(lines)].slice(0, limit);
}

function formatDuration(ms) {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function runSuite(suite, logsDir) {
  const logFile = path.join(logsDir, `${suite.owner}-${suite.dir}.log`);
  const fd = fs.openSync(logFile, "w");
  const started = Date.now();
  const result = spawnSync("npm", ["test", "--", suite.dir, "--headless"], {
    cwd: root,
    stdio: ["ignore", fd, fd],
    timeout: SUITE_TIMEOUT_MS,
  });
  fs.closeSync(fd);
  const log = fs.readFileSync(logFile, "utf8");
  const timedOut = result.error?.code === "ETIMEDOUT";
  // mach can exit 0 after a crash or an unexpected result, so the log counts too.
  const failures = failuresIn(log);
  const ok = !timedOut && result.status === 0 && !failures.length;
  return {
    ...suite,
    ok,
    timedOut,
    failures: timedOut ? [`timed out after ${formatDuration(SUITE_TIMEOUT_MS)}`] : failures,
    duration: Date.now() - started,
    logFile,
  };
}

function summary(results) {
  const rows = results.map(r => {
    const status = r.ok ? "pass" : r.owner === "zen" ? "fail (Zen, informational)" : "**FAIL**";
    const details = r.failures.map(f => f.replace(/\|/g, "\\|")).join("<br>");
    return `| ${r.owner} | ${r.dir} | ${status} | ${formatDuration(r.duration)} | ${details} |`;
  });
  const failed = results.filter(r => !r.ok && r.owner === "peppermint").length;
  return [
    `### Browser tests: ${failed ? `${failed} Peppermint suite(s) failed` : "all Peppermint suites passed"}`,
    "",
    "| Owner | Suite | Result | Time | First failures |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function main(argv) {
  const args = argv.slice();
  if (args.includes("--check")) {
    const problems = checkSuites();
    for (const problem of problems) {
      console.error(`ci-tests: ${problem}`);
    }
    if (!problems.length) {
      console.log(
        `ci-tests: ${listedSuites(fs.readFileSync(path.join(TESTS_DIR, "moz.build"), "utf8")).length} suites registered`
      );
    }
    return problems.length ? 1 : 0;
  }

  const logsIndex = args.indexOf("--logs");
  const logsDir = path.resolve(logsIndex === -1 ? "test-logs" : args.splice(logsIndex, 2)[1]);
  const withZen = args.includes("--zen");
  const wanted = args.filter(arg => !arg.startsWith("--"));
  fs.mkdirSync(logsDir, { recursive: true });

  let suites = suiteDirs(TESTS_DIR).map(s => ({ ...s, owner: "peppermint" }));
  if (withZen && fs.existsSync(ZEN_TESTS_DIR)) {
    suites.push(
      ...fs
        .readdirSync(ZEN_TESTS_DIR, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && entry.name !== "mochitests")
        .map(entry => ({ dir: entry.name, manifest: "", owner: "zen" }))
    );
  }
  if (wanted.length) {
    suites = suites.filter(s => wanted.includes(s.dir));
    const unknown = wanted.filter(w => !suites.some(s => s.dir === w));
    if (unknown.length) {
      console.error(`ci-tests: unknown suite(s): ${unknown.join(", ")}`);
      return 2;
    }
  }
  // One run per directory, even when it has several manifests.
  suites = suites.filter(
    (s, i) => suites.findIndex(o => o.dir === s.dir && o.owner === s.owner) === i
  );

  const results = [];
  for (const suite of suites) {
    console.log(`::group::${suite.owner}/${suite.dir}`);
    const result = runSuite(suite, logsDir);
    console.log(
      `${result.ok ? "PASS" : "FAIL"} ${suite.owner}/${suite.dir} (${formatDuration(result.duration)})`
    );
    for (const failure of result.failures) {
      console.log(`  ${failure}`);
    }
    console.log("::endgroup::");
    results.push(result);
  }

  const report = summary(results);
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  }
  return results.some(r => !r.ok && r.owner === "peppermint") ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
