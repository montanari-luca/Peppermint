/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { MODES, REASONS, PeppermintSyncOverride } = ChromeUtils.importESModule(
  "moz-src:///peppermint/sync-override/PeppermintSyncOverride.sys.mjs"
);

const mode =
  window.arguments?.[0]?.mode == MODES.PUSH ? MODES.PUSH : MODES.REBASE;
const dialog = document.getElementById("syncOverrideDialog");
const enginesBox = document.getElementById("syncOverrideEngines");
const historyNote = document.getElementById("syncOverrideHistoryNote");
const resultList = document.getElementById("syncOverrideResult");

// Ordered as the result list shows them.
const RESULT_ROWS = [
  ["done", null],
  ["skipped", REASONS.EMPTY_SERVER],
  ["skipped", REASONS.EMPTY_LOCAL],
  ["failed", REASONS.LOCKED],
  ["failed", REASONS.UNDECRYPTABLE],
  ["failed", REASONS.ERROR],
];

let state = "choose";
let engines = [];

function l10n(element, id, args) {
  document.l10n.setAttributes(element, id, args);
}

function checkboxes() {
  return [...enginesBox.querySelectorAll("checkbox")];
}

function updateAcceptButton() {
  dialog.getButton("accept").disabled =
    state == "running" ||
    (state == "choose" && !checkboxes().some(c => c.checked));
}

function updateHistoryNote() {
  const historyBox = enginesBox.querySelector('checkbox[value="history"]');
  historyNote.hidden = !historyBox?.checked;
}

async function render() {
  l10n(document.documentElement, `peppermint-sync-override-${mode}-dialog`);
  l10n(dialog, `peppermint-sync-override-${mode}-dialog`);
  l10n(
    document.getElementById("syncOverrideHeading"),
    `peppermint-sync-override-${mode}-heading`
  );
  l10n(
    document.getElementById("syncOverrideDescription"),
    `peppermint-sync-override-${mode}-description`
  );
  l10n(
    document.getElementById("syncOverrideWarning"),
    `peppermint-sync-override-${mode}-warning`
  );
  l10n(historyNote, `peppermint-sync-override-${mode}-history-note`);

  engines = await PeppermintSyncOverride.availableEngines();
  for (const { name: engineName, l10nId, optIn } of engines) {
    const checkbox = document.createXULElement("checkbox");
    checkbox.setAttribute("value", engineName);
    checkbox.checked = !optIn;
    checkbox.className = `sync-override-engine sync-engine-${engineName}`;
    l10n(checkbox, l10nId);
    checkbox.addEventListener("command", () => {
      updateHistoryNote();
      updateAcceptButton();
    });
    enginesBox.append(checkbox);
  }
  if (!engines.length) {
    const empty = document.createElement("p");
    empty.className = "sync-override-text";
    l10n(empty, "peppermint-sync-override-no-types");
    enginesBox.append(empty);
  }
  updateHistoryNote();
  updateAcceptButton();
}

async function engineLabels(names) {
  const byName = new Map(engines.map(engine => [engine.name, engine.l10nId]));
  const messages = await document.l10n.formatMessages(
    names.map(engineName => ({ id: byName.get(engineName) }))
  );
  return names.map(
    (engineName, i) =>
      messages[i]?.attributes?.find(a => a.name == "label")?.value ?? engineName
  );
}

async function showResult(result) {
  const listFormat = new Intl.ListFormat(Services.locale.appLocalesAsBCP47, {
    type: "conjunction",
  });
  let rows = 0;
  for (const [kind, reason] of RESULT_ROWS) {
    const names =
      kind == "done"
        ? result.done
        : result[kind].filter(e => e.reason == reason).map(e => e.name);
    if (!names.length) {
      continue;
    }
    const item = document.createElement("li");
    item.className = `sync-override-result-${kind}`;
    l10n(item, `peppermint-sync-override-result-${reason ?? `${mode}-done`}`, {
      types: listFormat.format(await engineLabels(names)),
    });
    resultList.append(item);
    rows++;
  }
  if (!rows) {
    const item = document.createElement("li");
    l10n(item, "peppermint-sync-override-result-none");
    resultList.append(item);
  }
}

function showError(error) {
  const code = error?.code ?? "error";
  const item = document.createElement("li");
  item.className = "sync-override-result-failed";
  l10n(item, `peppermint-sync-override-error-${code}`);
  resultList.append(item);
  if (!error?.code) {
    console.error("Sync override failed", error);
  }
}

async function start() {
  const names = checkboxes()
    .filter(c => c.checked)
    .map(c => c.getAttribute("value"));
  if (!names.length) {
    return;
  }
  state = "running";
  document.getElementById("syncOverrideChoose").hidden = true;
  document.getElementById("syncOverrideRunning").hidden = false;
  dialog.getButton("cancel").disabled = true;
  updateAcceptButton();
  try {
    await showResult(await PeppermintSyncOverride.run(mode, names));
  } catch (error) {
    showError(error);
  }
  state = "done";
  document.getElementById("syncOverrideRunning").hidden = true;
  resultList.hidden = false;
  dialog.getButton("cancel").hidden = true;
  l10n(dialog, "peppermint-sync-override-done-dialog");
  updateAcceptButton();
  dialog.getButton("accept").focus();
}

document.addEventListener("dialogaccept", event => {
  if (state == "done") {
    return;
  }
  event.preventDefault();
  if (state == "choose") {
    start();
  }
});

document.addEventListener("dialogcancel", event => {
  if (state == "running") {
    event.preventDefault();
  }
});

// The dialog sets up its buttons on load, which module scripts run before.
window.addEventListener("load", render, { once: true });
