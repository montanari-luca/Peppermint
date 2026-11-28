// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Every overlay patch on one of Zen's own files (the ones that live under
// src/) must apply to Zen's copy. Checked without a Firefox checkout, so a
// broken hand-written or stale patch fails here instead of in `npm run import`.
// Patches on Firefox files need the engine and are left to the import.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { listOverlayPatches, patchTargets, runPatch, srcDir } from "../lib.mjs";

const zenPatches = listOverlayPatches()
  .map(file => ({ file, targets: patchTargets(fs.readFileSync(file, "utf8")) }))
  .filter(
    ({ targets }) =>
      targets.length &&
      targets.every(t => fs.statSync(path.join(srcDir, t), { throwIfNoEntry: false })?.isFile())
  );

test("there are overlay patches on Zen's files to check", () => {
  assert.ok(zenPatches.length > 0);
});

for (const { file, targets } of zenPatches) {
  test(`${path.relative(path.join(srcDir, ".."), file)} applies to Zen's copy`, () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "pm-overlay-"));
    try {
      for (const target of targets) {
        fs.mkdirSync(path.dirname(path.join(work, target)), { recursive: true });
        fs.copyFileSync(path.join(srcDir, target), path.join(work, target));
      }
      const result = runPatch(["-p1", "--dry-run", "--batch", "--forward", "-i", file], work);
      assert.ok(result.ok, result.output);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  });
}
