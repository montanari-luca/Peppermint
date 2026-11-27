// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkSuites, failuresIn, listedSuites } from "../ci-tests.mjs";

test("every Peppermint suite is registered", () => {
  assert.deepEqual(checkSuites(), []);
});

test("an unlisted or missing suite is reported", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-suites-"));
  for (const name of ["listed", "forgotten"]) {
    fs.mkdirSync(path.join(dir, name));
    fs.writeFileSync(path.join(dir, name, "browser.toml"), "[DEFAULT]\n");
  }
  fs.writeFileSync(
    path.join(dir, "moz.build"),
    'BROWSER_CHROME_MANIFESTS += [\n    "listed/browser.toml",\n    "gone/browser.toml",\n]\n'
  );
  assert.deepEqual(checkSuites(dir), [
    "forgotten/browser.toml is not listed in moz.build, so it never runs",
    "moz.build lists gone/browser.toml, which does not exist",
  ]);
  fs.rmSync(dir, { recursive: true });
});

test("moz.build entries are parsed by manifest kind", () => {
  assert.deepEqual(
    listedSuites(
      'BROWSER_CHROME_MANIFESTS += ["a/browser.toml"]\nXPCSHELL_TESTS_MANIFESTS += ["b/xpcshell.toml"]'
    ),
    [
      { dir: "a", manifest: "browser.toml" },
      { dir: "b", manifest: "xpcshell.toml" },
    ]
  );
});

test("unexpected results and crashes are picked out of a log", () => {
  const log = [
    " 0:01.00 TEST_START: peppermint/tests/a/browser_a.js",
    " 0:02.00 TEST-PASS | browser_a.js | fine",
    " 0:03.00 TEST-UNEXPECTED-FAIL | peppermint/tests/a/browser_a.js | wrong - Got 1, expected 2",
    " 0:04.00 PROCESS-CRASH | application crashed [@ mozalloc_abort]",
    " 0:03.00 TEST-UNEXPECTED-FAIL | peppermint/tests/a/browser_a.js | wrong - Got 1, expected 2",
  ].join("\n");
  assert.deepEqual(failuresIn(log), [
    "TEST-UNEXPECTED-FAIL | peppermint/tests/a/browser_a.js | wrong - Got 1, expected 2",
    "PROCESS-CRASH | application crashed [@ mozalloc_abort]",
  ]);
  assert.deepEqual(failuresIn("TEST-PASS | ok"), []);
});
