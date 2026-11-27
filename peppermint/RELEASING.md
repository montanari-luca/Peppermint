# Releasing Peppermint

Releases are built, tested, signed and published by `.github/workflows/peppermint-release.yml`. Nothing is built on a laptop: the local scripts (`scripts/build-macos.sh`, `scripts/build-windows.ps1`) are for development builds only, and they leave out the wasm library sandbox to build faster.

## One-time setup

1. **Update signing key** (required before the first published release).
   - On your own machine, run `node peppermint/scripts/sign-update-manifest.mjs generate-key`. It writes the private key to `~/.peppermint-update-signing-key` (readable by you only) and prints the public key.
   - Put the public key in `src/peppermint/updater/PeppermintUpdateKeys.sys.mjs` (`UPDATE_PUBLIC_KEYS = Object.freeze(["<key>"])`), commit and push.
   - Keep an offline backup of the private key. Losing it means shipping a new key in a release signed with the old one; leaking it lets anyone sign updates.
2. **GitHub environment `release`** (Settings, Environments):
   - Required reviewer: you. The publish job waits for your approval.
   - Deployment branches and tags: `mine`, `BETA-*`, `v*`.
   - Secret `PEPPERMINT_UPDATE_SIGNING_KEY`: the contents of the private key file.
   - Secret `RELEASES_DEPLOY_KEY`: the private half of an SSH deploy key with write access to `montanari-luca/MintFlow-Releases` (create it with `ssh-keygen -t ed25519 -N "" -f mintflow-releases`, add the `.pub` file as a deploy key there with write access).
3. **Repository secrets**:
   - `ZEN_SAFEBROWSING_API_KEY`: Peppermint's own Google Safe Browsing key. Without it, phishing and malware protection does not work in the built browser.
   - `SYNC_TOKEN`: a fine-grained token for this repository (contents, pull requests, issues and workflows: read and write) for the daily Zen sync.
4. **Optional signing** (environment `signing`). Each part turns on by itself once its secrets exist:
   - macOS Developer ID: `MACOS_CERT_P12_BASE64`, `MACOS_CERT_PASSWORD`, `MACOS_PROVISIONING_PROFILE_BASE64` (for passkeys). Notarization: `MACOS_NOTARY_KEY_P8_BASE64`, `MACOS_NOTARY_KEY_ID`, `MACOS_NOTARY_ISSUER_ID` (an App Store Connect API key).
   - Windows (Azure Trusted Signing): secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` (federated with this repository), and variables `AZURE_SIGNING_ENDPOINT` (for example `weu.codesigning.azure.net`), `AZURE_SIGNING_ACCOUNT`, `AZURE_SIGNING_PROFILE`. Only the installers are signed.
5. **Repository variables** (Settings, Secrets and variables, Variables):
   - `PEPPERMINT_NIGHTLY_TESTS` = `true` turns on the nightly test run. Set it once a run by hand (Actions, Peppermint tests) has passed.
   - `PEPPERMINT_TESTS_BLOCK_RELEASE` = `true` makes failing tests stop a release. Until then they only add a warning; set it after a couple of weeks of green nightly runs.
   - Optional: `PEPPERMINT_RUNNER` (a larger Linux runner, when builds near the 6-hour limit) and `PEPPERMINT_MAC_RUNNER` (default `macos-26`).

## Cutting a release

1. Bump the version: `scripts/version/version.sh 2026.0.5` (updates `peppermint/identity.json` and `surfer.json`), then commit on `mine`.
2. Optionally write the highlights in `peppermint/release-notes/<version>.md`; the list of changes is generated from the history.
3. Actions, **Peppermint release**, Run workflow, with **dry run** on. It builds every platform, runs the browser tests and leaves a draft release.
4. Download the draft's files and check them: install the previous release on each platform, then the new one, and confirm the app starts and your profile is intact.
5. Run the workflow again with dry run off (or push the tag `BETA-<version>`, or `v<version>` for Stable). Approve the publish job when it asks.
6. The publish job publishes the release, writes and signs `peppermint.json`, pushes it to `MintFlow-Releases`, then waits until the live file, its signature and every download match. Installed copies pick the update up within six hours.

## Rotating the update key

1. Generate a new key, and add its public key next to the old one in `PeppermintUpdateKeys.sys.mjs`.
2. Release as usual (still signed with the old key). Clients now trust both.
3. Replace `PEPPERMINT_UPDATE_SIGNING_KEY` with the new private key, remove the old public key, and release again.

Never remove a key that the currently installed releases need: a client that trusts no key that signs the live file stops updating itself (it still links to the download).

## When something fails

- **prepare**: the error says which check failed (version mismatch between `identity.json` and `surfer.json`, commit not on `mine`, version not newer than the published one, tag already published, no update key).
- **A build**: rerun the failed job. Builds close to 6 hours need sccache warm (a second run is faster) or `PEPPERMINT_RUNNER`.
- **tests**: the run summary lists each suite; logs are in the `peppermint-test-logs` artifact.
- **check-live times out**: raw.githubusercontent.com can lag; the browser retries a mismatched signature once after ten minutes, and again at the next check.
