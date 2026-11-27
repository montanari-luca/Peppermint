// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * The Ed25519 public keys that may sign the update information
 * (peppermint.json.sig). Each entry is a raw 32-byte key in base64.
 *
 * `node peppermint/scripts/sign-update-manifest.mjs generate-key` creates a
 * key pair: its public key goes here, its private key into the release
 * workflow's PEPPERMINT_UPDATE_SIGNING_KEY secret.
 *
 * Rotating a key: add the new key next to the old one and release, then sign
 * with the new key and remove the old one in a later release.
 *
 * With no key, a build never installs an update by itself: it only links to
 * the download (forks and builds without a release key).
 */
export const UPDATE_PUBLIC_KEYS = Object.freeze([]);
