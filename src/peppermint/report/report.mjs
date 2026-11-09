/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * about:report: shows what Peppermint did for the user over a week, a month
 * or a year, and turns it into an image to share.
 */

const { PERIOD_DAYS, collectReport } = ChromeUtils.importESModule(
  "moz-src:///peppermint/report/PeppermintReport.sys.mjs"
);
const { BrowserUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/BrowserUtils.sys.mjs"
);
const { Downloads } = ChromeUtils.importESModule(
  "resource://gre/modules/Downloads.sys.mjs"
);
const { DownloadPaths } = ChromeUtils.importESModule(
  "resource://gre/modules/DownloadPaths.sys.mjs"
);
const { FileUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/FileUtils.sys.mjs"
);
const { collectStartup, disableMod } = ChromeUtils.importESModule(
  "moz-src:///peppermint/startup-doctor/PeppermintStartupDoctor.sys.mjs"
);

const SHARE_WIDTH = 1200;
const SHARE_HEIGHT = 630;
const MB_PER_GB = 1024;

const tiles = Object.fromEntries(
  Array.from(document.querySelectorAll("[data-tile]"), tile => [
    tile.dataset.tile,
    tile,
  ])
);
const periodButtons = document.querySelectorAll(".report-period");
const siteList = document.getElementById("report-site-list");
const noSites = document.getElementById("report-no-sites");
const shareStatus = document.getElementById("report-share-status");
const shareButtons = [
  document.getElementById("report-copy"),
  document.getElementById("report-save"),
];

const numbers = new Intl.NumberFormat();

let period = "week";
let report = null;
let loadToken = 0;

function formatMemory(megabytes) {
  const gigabytes = megabytes >= MB_PER_GB;
  return new Intl.NumberFormat(undefined, {
    style: "unit",
    unit: gigabytes ? "gigabyte" : "megabyte",
    unitDisplay: "short",
    maximumFractionDigits: 1,
  }).format(gigabytes ? megabytes / MB_PER_GB : megabytes);
}

function durationArgs(ms) {
  const minutes = Math.floor(ms / 60000);
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

function setValue(tileName, text) {
  tiles[tileName].querySelector(".report-value").textContent = text;
}

function renderSites(sites) {
  siteList.replaceChildren(
    ...sites.map(({ host, visits }) => {
      const item = document.createElement("li");
      item.className = "report-site";
      const icon = document.createElement("img");
      icon.className = "report-site-icon";
      icon.src = `page-icon:https://${host}/`;
      icon.alt = "";
      const hostLabel = document.createElement("span");
      hostLabel.className = "report-site-host";
      hostLabel.textContent = host;
      const count = document.createElement("span");
      count.className = "report-site-visits";
      document.l10n.setAttributes(count, "peppermint-report-visits", {
        count: visits,
      });
      item.append(icon, hostLabel, count);
      return item;
    })
  );
  noSites.hidden = !!sites.length;
}

function render() {
  setValue("trackers", numbers.format(report.trackers));
  setValue("banners", numbers.format(report.banners));
  document.l10n.setAttributes(
    tiles.active.querySelector(".report-value"),
    "peppermint-report-duration",
    durationArgs(report.activeMs)
  );
  setValue("unloaded", numbers.format(report.unloaded));
  setValue("archived", numbers.format(report.archived));
  const hint = tiles.unloaded.querySelector(".report-hint");
  if (report.unloaded) {
    document.l10n.setAttributes(hint, "peppermint-report-memory", {
      size: formatMemory(report.memoryMb),
    });
  } else {
    hint.removeAttribute("data-l10n-id");
    hint.textContent = "";
  }
  renderSites(report.topSites);
  for (const button of periodButtons) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.period == period)
    );
  }
}

async function load() {
  const token = ++loadToken;
  const result = await collectReport(PERIOD_DAYS[period]);
  if (token == loadToken) {
    report = result;
    render();
  }
}

for (const button of periodButtons) {
  button.addEventListener("click", () => {
    period = button.dataset.period;
    shareStatus.textContent = "";
    load();
  });
}

// A custom property holds the text of a color function, not a color, so let
// an element resolve it for the canvas.
function resolveColor(property) {
  const probe = document.createElement("span");
  probe.style.color = `var(${property})`;
  document.body.append(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved;
}

async function drawShareImage() {
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_WIDTH;
  canvas.height = SHARE_HEIGHT;
  const context = canvas.getContext("2d");
  const [page, paper, ink, muted, accent] = [
    "--report-page",
    "--report-paper",
    "--report-ink",
    "--report-muted",
    "--report-accent",
  ].map(resolveColor);
  const [
    heading,
    trackersLabel,
    bannersLabel,
    activeLabel,
    unloadedLabel,
    duration,
    brand,
  ] = await document.l10n.formatValues([
    { id: `peppermint-report-share-title-${period}` },
    { id: "peppermint-report-trackers" },
    { id: "peppermint-report-banners" },
    { id: "peppermint-report-active" },
    { id: "peppermint-report-unloaded" },
    { id: "peppermint-report-duration", args: durationArgs(report.activeMs) },
    { id: "peppermint-report-brand" },
  ]);
  const labels = [trackersLabel, bannersLabel, activeLabel, unloadedLabel];

  context.fillStyle = page;
  context.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT);
  context.fillStyle = paper;
  context.beginPath();
  context.roundRect(40, 40, SHARE_WIDTH - 80, SHARE_HEIGHT - 80, 32);
  context.fill();
  context.fillStyle = accent;
  context.fillRect(40, 40, 12, SHARE_HEIGHT - 80);

  context.textBaseline = "alphabetic";
  context.font = "700 56px system-ui, sans-serif";
  context.fillStyle = ink;
  context.fillText(heading, 100, 140);

  const values = [
    numbers.format(report.trackers),
    numbers.format(report.banners),
    duration,
    numbers.format(report.unloaded),
  ];
  values.forEach((value, index) => {
    const x = 100 + (index % 2) * 500;
    const y = 270 + Math.floor(index / 2) * 150;
    context.font = "700 72px system-ui, sans-serif";
    context.fillStyle = accent;
    context.fillText(value, x, y);
    context.font = "400 28px system-ui, sans-serif";
    context.fillStyle = muted;
    context.fillText(labels[index], x, y + 40);
  });

  context.font = "600 28px system-ui, sans-serif";
  context.fillStyle = ink;
  context.textAlign = "right";
  context.fillText(brand, SHARE_WIDTH - 100, SHARE_HEIGHT - 80);
  context.textAlign = "left";
  return canvas;
}

function toBlob(canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, "image/png"));
}

async function share(save) {
  for (const button of shareButtons) {
    button.disabled = true;
  }
  try {
    const blob = await toBlob(await drawShareImage());
    if (save) {
      const directory = await Downloads.getPreferredDownloadsDirectory();
      const baseName = await document.l10n.formatValue(
        "peppermint-report-file-name"
      );
      const file = DownloadPaths.createNiceUniqueFile(
        new FileUtils.File(PathUtils.join(directory, `${baseName}.png`))
      );
      await IOUtils.write(file.path, new Uint8Array(await blob.arrayBuffer()));
      document.l10n.setAttributes(shareStatus, "peppermint-report-saved", {
        name: file.leafName,
      });
    } else {
      BrowserUtils.copyImageToClipboard(await blob.arrayBuffer());
      document.l10n.setAttributes(shareStatus, "peppermint-report-copied");
    }
  } catch (error) {
    console.error("The report image could not be shared", error);
    document.l10n.setAttributes(shareStatus, "peppermint-report-share-error");
  } finally {
    for (const button of shareButtons) {
      button.disabled = false;
    }
  }
}

// Startup: how long the last launches took and what slows them down. It does
// not depend on the period.

const startupSection = document.getElementById("report-startup");
const startupTiles = Object.fromEntries(
  Array.from(startupSection.querySelectorAll("[data-startup]"), tile => [
    tile.dataset.startup,
    tile,
  ])
);
const SECOND_MS = 1000;
const KB = 1024;

function formatDuration(ms) {
  if (ms == null) {
    return "\u2013";
  }
  const seconds = ms >= SECOND_MS;
  return new Intl.NumberFormat(undefined, {
    style: "unit",
    unit: seconds ? "second" : "millisecond",
    unitDisplay: "short",
    maximumFractionDigits: seconds ? 1 : 0,
  }).format(seconds ? ms / SECOND_MS : ms);
}

function formatSize(bytes) {
  const megabytes = bytes >= KB * KB;
  return new Intl.NumberFormat(undefined, {
    style: "unit",
    unit: megabytes ? "megabyte" : "kilobyte",
    unitDisplay: "short",
    maximumFractionDigits: 1,
  }).format(bytes / (megabytes ? KB * KB : KB));
}

function topWindow() {
  return window.browsingContext.topChromeWindow;
}

function row({ label, labelId, text, textId, textArgs, value, action }) {
  const item = document.createElement("li");
  item.className = "report-site";
  if (label || labelId) {
    const labelElement = document.createElement("span");
    labelElement.className = "report-row-label";
    if (labelId) {
      document.l10n.setAttributes(labelElement, labelId);
    } else {
      labelElement.textContent = label;
    }
    item.append(labelElement);
  }
  if (text || textId) {
    const paragraph = document.createElement("span");
    paragraph.className = "report-row-text";
    if (textId) {
      document.l10n.setAttributes(paragraph, textId, textArgs);
    } else {
      paragraph.textContent = text;
    }
    item.append(paragraph);
  }
  if (value) {
    const amount = document.createElement("span");
    amount.className = "report-row-value";
    amount.textContent = value;
    item.append(amount);
  }
  if (action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "report-button";
    button.dataset.action = action.name;
    document.l10n.setAttributes(button, action.l10nId);
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await action.run();
      } catch (error) {
        console.error("The startup fix failed", error);
        button.disabled = false;
      }
    });
    item.append(button);
  }
  return item;
}

function turnOff(pref) {
  return {
    name: "turn-off",
    l10nId: "peppermint-report-startup-turn-off",
    run: async () => {
      Services.prefs.setBoolPref(pref, false);
      await loadStartup();
    },
  };
}

const TIPS = {
  extensions: tip =>
    row({
      textId: "peppermint-report-startup-tip-extensions",
      textArgs: { count: tip.count },
      action: {
        name: "open-addons",
        l10nId: "peppermint-report-startup-open-addons",
        run: () =>
          topWindow().BrowserAddonUI.openAddonsMgr("addons://list/extension"),
      },
    }),
  mods: tip =>
    row({
      textId: "peppermint-report-startup-tip-mods",
      textArgs: { size: formatSize(tip.bytes) },
      action: {
        name: "manage-mods",
        l10nId: "peppermint-report-startup-manage-mods",
        run: () => topWindow().openPreferences("paneZenMarketplace"),
      },
    }),
  "restore-on-demand": () =>
    row({
      textId: "peppermint-report-startup-tip-restore",
      action: {
        name: "restore-on-demand",
        l10nId: "peppermint-report-startup-restore-fix",
        run: async () => {
          Services.prefs.setBoolPref(
            "browser.sessionstore.restore_on_demand",
            true
          );
          await loadStartup();
        },
      },
    }),
};

function renderStartup(startup) {
  startupSection.hidden = !startup.enabled;
  if (!startup.enabled) {
    return;
  }
  const measured = startup.launches > 0;
  document.getElementById("report-startup-empty").hidden = measured;
  document.getElementById("report-startup-measured").hidden = !measured;

  startupTiles.last.querySelector(".report-value").textContent = formatDuration(
    startup.lastMs
  );
  startupTiles.typical.querySelector(".report-value").textContent =
    formatDuration(startup.typicalMs);
  document.l10n.setAttributes(
    startupTiles.typical.querySelector(".report-hint"),
    "peppermint-report-startup-launches",
    { count: startup.launches }
  );
  startupTiles.peppermint.querySelector(".report-value").textContent =
    formatDuration(startup.peppermintMs);

  const slowFeatures = new Set(
    startup.tips.filter(tip => tip.id == "feature").map(tip => tip.feature.id)
  );
  document.getElementById("report-startup-slowest").replaceChildren(
    ...startup.slowest.map(({ ms, feature }) =>
      row({
        labelId: `peppermint-feature-${feature.id}`,
        value: formatDuration(ms),
        action: slowFeatures.has(feature.id) ? turnOff(feature.pref) : null,
      })
    )
  );

  const mods = startup.mods.filter(mod => mod.bytes > 0).slice(0, 3);
  document.getElementById("report-startup-mods-group").hidden = !mods.length;
  document.getElementById("report-startup-mods").replaceChildren(
    ...mods.map(mod =>
      row({
        label: mod.name,
        value: formatSize(mod.bytes),
        action: {
          name: "disable-mod",
          l10nId: "peppermint-report-startup-turn-off",
          run: async () => {
            await disableMod(mod.id);
            await loadStartup();
          },
        },
      })
    )
  );

  const tips = startup.tips.filter(tip => TIPS[tip.id]);
  document
    .getElementById("report-startup-tips")
    .replaceChildren(...tips.map(tip => TIPS[tip.id](tip)));
  document.getElementById("report-startup-no-tips").hidden = !!tips.length;
}

let startupToken = 0;

async function loadStartup() {
  const token = ++startupToken;
  const startup = await collectStartup();
  if (token == startupToken) {
    renderStartup(startup);
    startupSection.dispatchEvent(new CustomEvent("StartupRendered"));
  }
}

document
  .getElementById("report-copy")
  .addEventListener("click", () => share(false));
document
  .getElementById("report-save")
  .addEventListener("click", () => share(true));

load();
loadStartup();
