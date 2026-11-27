// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// node --test "peppermint/scripts/tests/*.test.mjs"

import assert from "node:assert/strict";
import nodeCrypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  KEYS_FILE,
  generateKeyPair,
  publicKeyOf,
  readTrustedKeys,
  signBytes,
  verifyBytes,
} from "../sign-update-manifest.mjs";

const manifest = Buffer.from(
  JSON.stringify({ latest: "2026.0.5", downloads: { macos: "https://example.com/a.dmg" } })
);

test("a signature verifies with its key only", () => {
  const pair = generateKeyPair();
  const other = generateKeyPair();
  const signature = signBytes(manifest, pair.privateKey);
  assert.equal(publicKeyOf(pair.privateKey), pair.publicKey);
  assert.ok(verifyBytes(manifest, signature, [pair.publicKey]));
  assert.ok(verifyBytes(manifest, `${signature}\n`, [pair.publicKey]), "trailing newline");
  assert.ok(verifyBytes(manifest, signature, [other.publicKey, pair.publicKey]), "rotation");
  assert.ok(!verifyBytes(manifest, signature, [other.publicKey]), "foreign key");
  assert.ok(!verifyBytes(manifest, signature, []), "no keys");
  assert.ok(!verifyBytes(manifest, "", [pair.publicKey]), "empty signature");
});

test("one changed byte breaks the signature", () => {
  const pair = generateKeyPair();
  const signature = signBytes(manifest, pair.privateKey);
  const tampered = Buffer.from(manifest);
  tampered[10] ^= 1;
  assert.ok(!verifyBytes(tampered, signature, [pair.publicKey]));
});

test("the browser's WebCrypto check accepts the script's signatures", async () => {
  // Mirrors verifyManifest() in PeppermintUpdater.sys.mjs.
  const pair = generateKeyPair();
  const signature = signBytes(manifest, pair.privateKey);
  const key = await crypto.subtle.importKey(
    "raw",
    Buffer.from(pair.publicKey, "base64"),
    { name: "Ed25519" },
    false,
    ["verify"]
  );
  assert.ok(
    await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      Buffer.from(signature, "base64"),
      manifest
    )
  );
});

test("PEM private keys are accepted too", () => {
  const { privateKey } = nodeCrypto.generateKeyPairSync("ed25519");
  const pem = privateKey.export({ format: "pem", type: "pkcs8" });
  const signature = signBytes(manifest, pem);
  assert.ok(verifyBytes(manifest, signature, [publicKeyOf(pem)]));
});

test("trusted keys are read from PeppermintUpdateKeys.sys.mjs", () => {
  assert.ok(Array.isArray(readTrustedKeys(KEYS_FILE)));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-keys-"));
  const file = path.join(dir, "keys.sys.mjs");
  const a = generateKeyPair().publicKey;
  const b = generateKeyPair().publicKey;
  fs.writeFileSync(
    file,
    `export const UPDATE_PUBLIC_KEYS = Object.freeze([\n  // old\n  "${a}",\n  "${b}",\n]);\n`
  );
  assert.deepEqual(readTrustedKeys(file), [a, b]);
  fs.rmSync(dir, { recursive: true });
});
