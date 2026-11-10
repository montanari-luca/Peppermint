<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="branding-art/peppermint-full.png">
    <img src="branding-art/peppermint-full.png" alt="Peppermint" width="200">
  </picture>
</p>

<div align="center">

# Peppermint

**A performant, productive Firefox-based browser. Built for focus, convenience & speed.**

_Peppermint is an independent fork._

[![License: MPL-2.0](https://img.shields.io/badge/License-MPL_2.0-brightgreen.svg)](https://opensource.org/licenses/MPL-2.0)
[![Firefox Version](https://img.shields.io/badge/Firefox-159.0.1-orange.svg)](https://www.mozilla.org/firefox/)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/montanari-luca/Peppermint/actions)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/montanari-luca/Peppermint/releases)

[📥 Download Latest Release](https://github.com/montanari-luca/Peppermint/releases/latest) • [🐛 Report Bug](https://github.com/montanari-luca/Peppermint/issues/new?template=bug_report.md) • [💡 Request Feature](https://github.com/montanari-luca/Peppermint/issues/new?template=feature_request.md) • [📖 Documentation](https://peppermint.mintflow.dev/docs/)

</div>

---

## Before we begin

**Read this if you're worried about "AI slop". I would be too, so I get you.**

MintFlow Technologies is simply a brand name I came up with to make my products feel more "unified". I'm a solo developer, I work on my projects only in my free time, I don't earn anything from them, and I've been very interested in the LLM world ever since the 2023 boom. I've been trying to fine-tune & benchmark LLMs since then.

I'm not planning to add any AI-based features to this browser, as that would mostly defeat its "fast & light, clutter-free" premise. That said, of course, many of these features have been developed with assistance from LLM agents, sometimes through fully AI-driven workflows. Nevertheless, **I aim to use the strongest, smartest models available while carefully examining and double-checking their work**. Since I always keep an eye on every LLM release, bechmarks + my own tests, you can trust I'll be using the best LLMs at all times.

This applies to most of my products (not all of them, but almost). So, while there's always a chance something might slip under my nose, you can generally trust the changes being made.

This isn't my biggest project, not even close, but it's still the one I **care about the most**. I've dreamed of making a browser for as long as I can remember, simply because it's something I use every day and, by far, my most-used app on any desktop. That means you can generally trust that, with Peppermint, you'll get the version of a browser I've always wanted for myself, improved every time I come up with a new idea (and if you have any, feel free to reach out. Thanks!).

With that said, thank you for taking the time to read this, and first and foremost, for choosing Peppermint.

Oh, and I'm also pouring a decent amount of money into these agents and being a university students with 0 earnings, trust that I'll do my best to put them to good use.

---

## ✨ Why Peppermint?

Modern browsers focus too much on adding useless features that you'll maybe end up using once, instead of focusing on actual QoL features that will make your experience more enjoyable & hassle-free; No telemetry, sponsored shortcuts, and UI that fights for your attention. **Peppermint strips it all away and only focuses on making your experience smoother.**

|       🎯 **Focus First**        |     🛡️ **Privacy by Default**     |  ⚡ **Performance Tuned**  |
| :-----------------------------: | :-------------------------------: | :------------------------: |
|     Zen-inspired minimal UI     | No telemetry, no studies, no ads  | Optimized startup & memory |
|   Vertical tabs that breathe    |  Privacy defaults & clean links   |  PGO/LTO optimized builds  |
| Command palette for power users | Ad blocker set up on first launch |  Native vertical tab bar   |

---

## Highlight features

- Tab Islands, tab archive & snooze, undo close
- MintNotes: markdown notepad with encrypted saving, per-page notes and `about:notes`
- URL Snippets
- Underpowered mode
- Advanced idle resource consumption reduction
- Cookie blocker & auto-refusal
- Auto ad-blocker setup system
- Temporary permissions & automatic revoke for unused sites
- Privacy defaults: tracking parameter removal, fingerprinting protection, clean links, lookalike domain warning
- Forget This Site, from the site panel
- Vault: website permissions, permission history and one-time codes
- Reader Mode & reading list
- Screenshot editor
- Peppermint features hub in Settings, with a shortcut cheat sheet (`Cmd/Ctrl + /`)
- Startup doctor in `about:report`
- Peppermint Janitor (opt-in space saver that clears stale temp files, caches and traces on launch)
- Rich homepage
- Light & Fast
- More secure Ghost mode
- Polished frosted glass UI
- No telemetry

### Improved upon Zen

- All Highlight Features
- More organized settings
- More consistent panels colors & design
- Additional settings
- Minor QoL features
- Default themes & settings

---

### Known issues

- No QR code passkey sign-in on MacOS

[Temporary Fixes](KITF.md)

---

### TODOs

- [ ] Create fully isolated containers (highly requested, apparently)
- [ ] Linux builds

---

## If you're not interested in the source-code or contributing, you can stop here.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 22 (see `.nvmrc`)
- **Python** 3.11 (see `.python-version`)
- **Rust** 1.95 (see `rust-toolchain.toml`; used by the `ffprefs` tool)
- **Git**
- Platform build tools:
  - **Windows**: Visual Studio 2022 + Windows 10 SDK
  - **macOS**: Xcode Command Line Tools
  - **Linux**: `build-essential`, `pkg-config`, `gtk3-devel`, `libasound2-dev`

### One-Command Setup

```bash
git clone https://github.com/montanari-luca/Peppermint.git peppermint
cd peppermint

# macOS: installs missing tools, downloads Firefox, builds once and launches
./scripts/run-macos.sh

# Windows
powershell -ExecutionPolicy Bypass -File .\scripts\run-windows.ps1
```

Pass `--rebuild` (macOS) or `-Rebuild` (Windows) to force a new build.

### Manual Build

```bash
# Install dependencies
npm ci

# Download the Firefox source, apply Zen and Peppermint patches, bootstrap
npm run init

# Full build (needed for C++, moz.build or new .patch changes)
npm run build

# UI-only rebuild (JS, CSS, XHTML), after a full build
npm run build:ui

# Run from source
npm start
```

`npm run build` caps parallel jobs to the machine (one per 4 GB of RAM, two cores free). Override with `PM_BUILD_JOBS=<n>`.

---

### Key Technologies

| Layer            | Technology                                                          |
| ---------------- | ------------------------------------------------------------------- |
| **Engine**       | Firefox 159.0.1 (Gecko)                                             |
| **Base**         | [Zen Browser](https://github.com/zen-browser/desktop), merged daily |
| **UI**           | Browser chrome in JavaScript modules, XHTML and CSS                 |
| **Build System** | [Surfer](https://github.com/zen-browser/surfer)                     |
| **Patching**     | Zen patches + Peppermint overlay patches (`peppermint/patches/`)    |
| **Preferences**  | YAML in `prefs/`, compiled by `ffprefs` (Rust)                      |

---

## 🎨 Features Deep Dive

### Vertical Tabs, Spaces & Tab Islands

Zen's vertical tab bar, spaces, split view and Glance, plus Peppermint's tab islands (named after their first tab, renamable), numbered tab shortcuts, tab archive & snooze and an undo toast after closing tabs.

### Command Palette

Type in the address bar to search tabs across spaces, history, bookmarks, settings and actions. Peppermint adds window, site and settings commands, plus a toggle for every Peppermint feature. Press `Cmd/Ctrl + /` for the shortcut cheat sheet.

### Peppermint Features Hub

Settings has a **Peppermint features** pane with a switch, the shortcut and search keywords for every feature. New features get a "New" badge after an update.

### Privacy Defaults (`prefs/peppermint/`)

```yaml
# Telemetry, health reports and studies are off
datareporting.healthreport.uploadEnabled: false
toolkit.telemetry.enabled: false

# Strip tracking parameters from links
privacy.query_stripping.enabled: true

# Fingerprinting protection in normal windows
privacy.fingerprintingProtection: true

# Trim cross-site referrers to the origin
network.http.referer.XOriginTrimmingPolicy: 2

# WebRTC only exposes the default address
media.peerconnection.ice.default_address_only: true
```

On top of these: clean links (skips known click trackers and AMP viewers), a lookalike domain warning, permission auto-revoke after 90 days without a visit, and **Forget This Site** in the site panel.

### Ad Blocking

On first launch Peppermint offers to install a content blocker of your choice: uBlock Origin, AdGuard AdBlocker, Ghostery or AdBlock. Only the extension Peppermint installed is ever swapped out; one you installed yourself is left alone.

### Startup Doctor

`about:report` shows how long recent launches took, which features and mods slow startup down, and lets you turn them off.

### Live Folders

Folders that refresh themselves from RSS feeds or GitHub (pull requests, issues and review requests).

---

## 🤝 Contributing

We welcome contributions! Please read our [Contributing Guide](docs/contribute.md) and [Code of Conduct](CODE_OF_CONDUCT.md) first.

### Development Workflow

```bash
# 1. Fork & clone
git clone https://github.com/<your-user>/Peppermint.git
cd Peppermint

# 2. Create a feature branch from mine
git checkout -b feat/amazing-feature mine

# 3. Make changes, apply them and test locally
npm run import && npm run build:ui && npm start
npm test -- <suite> --headless

# 4. Lint & format
npm run lint:fix

# 5. Open a PR into `mine`
```

### Branch Strategy

```
mine (default, releases build from here)
  ├── feat/*                 short-lived feature branches, PR into mine
  └── sync/upstream-<date>   daily Zen merge, PR into mine (merge commit)
```

### Where changes go

Zen's files stay identical to upstream so the daily merge stays clean. Peppermint's own code lives in its own layer:

- **New feature**: `src/peppermint/<feature>/`, registered in `src/peppermint/moz.build` and `src/peppermint/jar.inc.mn`.
- **New pref**: `prefs/peppermint/`. Changed default of a Zen or Firefox pref: `prefs/peppermint/overrides.yaml`.
- **Strings**: `peppermint/locales/en-US/`.
- **Change to a Zen or Firefox file**: edit it under `engine/`, then save it as an overlay patch:

```bash
npm run pm:record -- <engine path> <feature>
npm run import
```

---

## 📦 Distribution

### Official Builds

- **macOS**: `.dmg` (universal)
- **Windows**: installer (x64)
- **Linux**: coming soon

### Updates

Peppermint has its own updater instead of Mozilla's MAR updates: it reads a small JSON manifest, downloads the installer for your platform in the background and swaps the app on restart. Point `peppermint.update.url` at your own manifest to self-host updates.

---

## 🛡️ Security

- **Report Vulnerabilities**: privately through [GitHub Security Advisories](https://github.com/montanari-luca/Peppermint/security/advisories/new)
- **Dependencies**: weekly `npm audit` in CI

---

## 📄 License

**Mozilla Public License 2.0**; see [LICENSE](LICENSE) or [MPL-2.0](https://www.mozilla.org/MPL/2.0/).

> This project incorporates code from:
>
> - [Mozilla Firefox](https://github.com/mozilla/gecko-dev) (MPL-2.0)
> - [Zen Browser](https://github.com/zen-browser/desktop) (MPL-2.0)
> - [LibreWolf](https://gitlab.com/librewolf-community/browser) (MPL-2.0)
> - [arkenfox user.js](https://github.com/arkenfox/user.js) (Unlicense)

---

## 🙏 Acknowledgments

<div align="center">

| Project                                         | Contribution                               |
| ----------------------------------------------- | ------------------------------------------ |
| [Mozilla](https://mozilla.org/)                 | Firefox engine & platform                  |
| [Zen Browser](https://zen-browser.app/)         | Upstream fork base & Surfer build system   |
| [LibreWolf](https://librewolf.net/)             | Privacy patches & hardened prefs reference |
| [arkenfox](https://github.com/arkenfox/user.js) | Privacy preference templates               |
| [uBlock Origin](https://ublockorigin.com/)      | Content blocker offered at first launch    |

</div>

---
