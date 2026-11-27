// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Signs the update information (peppermint.json) that the browser's updater
 * reads. The browser only installs an update by itself when peppermint.json.sig
 * is a valid Ed25519 signature by a key in
 * src/peppermint/updater/PeppermintUpdateKeys.sys.mjs.
 *
 *   node peppermint/scripts/sign-update-manifest.mjs generate-key [--out <file>]
 *       Creates a key pair. The private key is written to <file>
 *       (default ~/.peppermint-update-signing-key, readable by you only) for
 *       the PEPPERMINT_UPDATE_SIGNING_KEY secret; the public key is printed
 *       for PeppermintUpdateKeys.sys.mjs.
 *   node peppermint/scripts/sign-update-manifest.mjs public-key
 *       Prints the public key of PEPPERMINT_UPDATE_SIGNING_KEY.
 *   node peppermint/scripts/sign-update-manifest.mjs sign <json> [--out <sig>]
 *       Signs with PEPPERMINT_UPDATE_SIGNING_KEY into <json>.sig.
 *   node peppermint/scripts/sign-update-manifest.mjs verify <json> [<sig>] [--key <base64>]
 *       Checks a signature against --key, or the keys the browser trusts.
 *
 * Only Node built-ins are used, so the release job that holds the key never
 * runs third-party code.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const KEYS_FILE = path.join(root, "src/peppermint/updater/PeppermintUpdateKeys.sys.mjs");
export const SECRET_ENV = "PEPPERMINT_UPDATE_SIGNING_KEY";

/** A new key pair: base64 PKCS8 private key and base64 raw public key. */
export function generateKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  return {
    privateKey: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
    publicKey: rawPublicKey(publicKey),
  };
}

function rawPublicKey(keyObject) {
  return Buffer.from(keyObject.export({ format: "jwk" }).x, "base64url").toString("base64");
}

/** Reads a private key given as base64 PKCS8 DER or as PEM. */
export function loadPrivateKey(text) {
  const value = String(text ?? "").trim();
  if (!value) {
    throw new Error(`No signing key: set ${SECRET_ENV}`);
  }
  const key = value.startsWith("-----BEGIN")
    ? crypto.createPrivateKey(value)
    : crypto.createPrivateKey({
        key: Buffer.from(value, "base64"),
        format: "der",
        type: "pkcs8",
      });
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("The signing key is not an Ed25519 key");
  }
  return key;
}

/** The base64 public key that belongs to a private key. */
export function publicKeyOf(privateKeyText) {
  return rawPublicKey(crypto.createPublicKey(loadPrivateKey(privateKeyText)));
}

/** Base64 Ed25519 signature of `bytes`. */
export function signBytes(bytes, privateKeyText) {
  return crypto.sign(null, Buffer.from(bytes), loadPrivateKey(privateKeyText)).toString("base64");
}

/** True when `signature` (base64) signs `bytes` for one of `publicKeys`. */
export function verifyBytes(bytes, signature, publicKeys) {
  const sig = Buffer.from(String(signature ?? "").replace(/\s+/g, ""), "base64");
  if (sig.length !== 64) {
    return false;
  }
  return publicKeys.some(raw => {
    const x = Buffer.from(raw, "base64");
    if (x.length !== 32) {
      return false;
    }
    const key = crypto.createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x: x.toString("base64url") },
      format: "jwk",
    });
    return crypto.verify(null, Buffer.from(bytes), key, sig);
  });
}

/** The public keys listed in PeppermintUpdateKeys.sys.mjs. */
export function readTrustedKeys(file = KEYS_FILE) {
  const text = fs.readFileSync(file, "utf8");
  const list = text.match(/UPDATE_PUBLIC_KEYS\s*=\s*Object\.freeze\(\s*\[([^\]]*)\]/);
  if (!list) {
    throw new Error(`Could not find UPDATE_PUBLIC_KEYS in ${file}`);
  }
  return [...list[1].replace(/\/\/[^\n]*/g, "").matchAll(/["']([A-Za-z0-9+/=]+)["']/g)].map(
    match => match[1]
  );
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return null;
  }
  const value = args[index + 1];
  args.splice(index, 2);
  return value;
}

function main(argv) {
  const args = argv.slice();
  const command = args.shift();
  switch (command) {
    case "generate-key": {
      const out = path.resolve(
        option(args, "--out") ?? path.join(os.homedir(), ".peppermint-update-signing-key")
      );
      if (fs.existsSync(out)) {
        throw new Error(`${out} already exists; move it away first`);
      }
      const { privateKey, publicKey } = generateKeyPair();
      fs.writeFileSync(out, `${privateKey}\n`, { mode: 0o600 });
      console.log(`Private key written to ${out}`);
      console.log(
        `  Store its contents as the GitHub secret ${SECRET_ENV} (environment "release"),`
      );
      console.log("  keep an offline backup, and never commit it.");
      console.log("Public key, for src/peppermint/updater/PeppermintUpdateKeys.sys.mjs:");
      console.log(`  ${publicKey}`);
      return 0;
    }
    case "public-key":
      console.log(publicKeyOf(process.env[SECRET_ENV]));
      return 0;
    case "sign": {
      const out = option(args, "--out");
      const [file] = args;
      if (!file) {
        throw new Error("usage: sign <json> [--out <sig>]");
      }
      const bytes = fs.readFileSync(file);
      JSON.parse(bytes.toString("utf8"));
      const key = process.env[SECRET_ENV];
      const signature = signBytes(bytes, key);
      // A key the browser does not trust would make every client refuse it.
      const trusted = readTrustedKeys();
      if (!verifyBytes(bytes, signature, trusted)) {
        throw new Error(
          `The signing key is not in ${path.relative(root, KEYS_FILE)} (its public key is ${publicKeyOf(key)})`
        );
      }
      const target = out ?? `${file}.sig`;
      fs.writeFileSync(target, `${signature}\n`);
      console.log(`Signed ${file} -> ${target}`);
      return 0;
    }
    case "verify": {
      const key = option(args, "--key");
      const [file, sigFile = `${file}.sig`] = args;
      if (!file) {
        throw new Error("usage: verify <json> [<sig>] [--key <base64>]");
      }
      const keys = key ? [key] : readTrustedKeys();
      const ok = verifyBytes(fs.readFileSync(file), fs.readFileSync(sigFile, "utf8"), keys);
      console.log(ok ? `${file}: valid signature` : `${file}: INVALID signature`);
      return ok ? 0 : 1;
    }
    default:
      console.error(
        "usage: sign-update-manifest.mjs generate-key [--out <file>] | public-key | sign <json> [--out <sig>] | verify <json> [<sig>] [--key <base64>]"
      );
      return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`sign-update-manifest: ${error.message}`);
    process.exitCode = 1;
  }
}
