// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkStrings, parseFtl, referencesOf, variablesOf } from "../l10n-check.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("Peppermint's strings are consistent", () => {
  assert.deepEqual(checkStrings(), []);
});

test("broken Fluent is reported", () => {
  const { errors } = parseFtl(
    [
      "one = One",
      "one = Again",
      "open = { $count",
      "choice = { $n ->",
      "    [one] One",
      "    [other] Many",
      "}",
      "stray text",
    ].join("\n")
  );
  assert.ok(errors.some(e => e.includes("one is defined twice")));
  assert.ok(errors.some(e => e.includes("open has an unclosed {")));
  assert.ok(errors.some(e => e.includes("choice has a selector without a *[default]")));
  assert.ok(errors.some(e => e.includes("line 8: not a message")));
  const good = parseFtl(
    "ok = { $n ->\n    [one] One\n   *[other] Many\n}\nattr =\n    .label = A { -brand-short-name }\n"
  );
  assert.deepEqual(good.errors, []);
  assert.deepEqual([...variablesOf("Hi { $name } and { $other }")], ["name", "other"]);
  assert.deepEqual([...referencesOf("See { pane-title } and { -brand }")], ["pane-title"]);
});

test("translations must match English", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-l10n-"));
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  write("en-US/browser/browser/peppermint-x.ftl", "peppermint-x-hello = Hello { $name }\n");
  write(
    "de/browser/browser/peppermint-x.ftl",
    "peppermint-x-hello = Hallo { $nom }\npeppermint-x-gone = Weg\n"
  );
  write("de/browser/browser/peppermint-y.ftl", "peppermint-y = Y\n");
  write("xx/browser/browser/peppermint-x.ftl", "peppermint-x-hello = ?\n");
  const problems = checkStrings({ localesDir: dir, codeDirs: [], patchesDir: dir });
  fs.rmSync(dir, { recursive: true });
  assert.ok(problems.some(p => p.includes("uses $nom, which English does not have")));
  assert.ok(problems.some(p => p.includes("peppermint-x-gone is not in the English file")));
  assert.ok(problems.some(p => p.includes("there is no English file")));
  assert.ok(problems.some(p => p.includes("xx is not in locales/supported-languages")));
});

test("a translated build drops stale Zen translations and keeps English for Peppermint", t => {
  if (spawnSync("python3", ["--version"]).status !== 0) {
    t.skip("python3 is not installed");
    return;
  }
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "pm-l10n-de-"));
  const result = spawnSync(
    "python3",
    [
      path.join(root, "peppermint/scripts/peppermint_l10n.py"),
      "preview",
      "de",
      path.join(out, "de"),
    ],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  const read = rel => fs.readFileSync(path.join(out, "de/browser/browser", rel), "utf8");
  assert.doesNotMatch(read("zen-share.ftl"), /^zen-share-space =/m, "Share is now Export");
  assert.match(read("preferences/zen-preferences.ftl"), /^zen-glance-header =/m, "kept on purpose");
  assert.doesNotMatch(read("preferences/zen-preferences.ftl"), /^category-zen-CKS =/m);
  assert.match(
    read("peppermint-vault.ftl"),
    /^peppermint-vault/m,
    "Peppermint files exist, in English"
  );
  fs.rmSync(out, { recursive: true });
});
