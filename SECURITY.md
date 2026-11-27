<!--
   - This Source Code Form is subject to the terms of the Mozilla Public
   - License, v. 2.0. If a copy of the MPL was not distributed with this
   - file, You can obtain one at http://mozilla.org/MPL/2.0/.
   -->

# Security Policy

## Supported versions

Only the latest Peppermint release gets security fixes. Installed copies update themselves; About Peppermint shows the version and checks for a newer one.

## Reporting a vulnerability

Please report vulnerabilities privately through [GitHub's advisory form](https://github.com/montanari-luca/Peppermint/security/advisories/new), not in a public issue. Include the Peppermint version, your platform and the steps to reproduce.

Where to report depends on where the bug lives:

- **Peppermint** (anything under `src/peppermint/`, the updater, the release builds): here.
- **Firefox's engine** (Gecko, SpiderMonkey, networking, the sandbox): [Mozilla's security bug process](https://www.mozilla.org/security/bug-bounty/), which also reaches Firefox, Zen and every other Firefox-based browser. Let us know as well, so the fix ships here quickly.
- **Zen's own features** (spaces, split view, Glance, compact mode): [Zen's advisory form](https://github.com/zen-browser/desktop/security/advisories/new), and here.

## How updates are protected

Peppermint installs an update only when the update information (`peppermint.json`) carries a valid Ed25519 signature by a key built into the browser (`src/peppermint/updater/PeppermintUpdateKeys.sys.mjs`), and the downloaded file matches the SHA-256 listed in it. Release files also carry GitHub build provenance; see "Verify your download" in the README.
