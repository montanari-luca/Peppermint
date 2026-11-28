// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Checks Peppermint's strings without a build (peppermint-checks.yml):
 *
 * - every .ftl file under peppermint/locales parses: messages, attributes,
 *   balanced braces, a default (*[...]) variant for every selector, no
 *   duplicate ids;
 * - translations (peppermint/locales/<lang>) only hold messages that exist
 *   in English, in a shipped language, with no variables or message
 *   references English does not have;
 * - every "peppermint-..." or "zen-..." string id that Peppermint's code or
 *   overlay patches use (data-l10n-id, setAttributes, formatValue[s]) has an
 *   English message, and every feature in the registry has its name,
 *   description and keywords. Ids built at run time, and prefixes such as a
 *   sidebar notification's l10nId, are not checked.
 *
 *   node peppermint/scripts/l10n-check.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OURS = path.join(root, "peppermint/locales");
const ZEN_ENGLISH = path.join(root, "locales/en-US");
const CODE_DIRS = [path.join(root, "src/peppermint")];
const PATCHES = path.join(root, "peppermint/patches");
const FEATURES_FILE = path.join(root, "src/peppermint/features/PeppermintFeatures.sys.mjs");
const CODE_FILES = /\.(m?js|xhtml|html|inc|css)$/;

const MESSAGE_START = /^(-?[A-Za-z][\w-]*)[ \t]*=/;
const REMOVE_LINE = /^# peppermint: remove (\S+)\s*$/gm;

function walk(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) {
    return out;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, predicate, out);
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

function braceErrors(body) {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (inString) {
      if (char === "\\") {
        i++;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth < 0) {
        return "has a } without a {";
      }
    } else if (char === '"' && depth > 0) {
      inString = true;
    }
  }
  return depth ? "has an unclosed {" : null;
}

/**
 * Parses a Fluent file enough to check it.
 *
 * @param {string} text
 * @returns {{messages: Map<string, {body: string, line: number}>, errors: string[]}}
 */
export function parseFtl(text) {
  const messages = new Map();
  const errors = [];
  let current = null;
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.startsWith("#")) {
      current = null;
      return;
    }
    if (!line.trim()) {
      return;
    }
    const start = MESSAGE_START.exec(line);
    if (start) {
      const id = start[1];
      if (messages.has(id)) {
        errors.push(`line ${lineNumber}: ${id} is defined twice`);
      }
      current = { body: line.slice(start[0].length), line: lineNumber };
      messages.set(id, current);
      return;
    }
    if (/^[\s}[*]/.test(line) && current) {
      current.body += `\n${line}`;
      return;
    }
    errors.push(`line ${lineNumber}: not a message, an attribute or a comment`);
  });
  for (const [id, message] of messages) {
    const brace = braceErrors(message.body);
    if (brace) {
      errors.push(`line ${message.line}: ${id} ${brace}`);
    }
    const selectors = (message.body.match(/->/g) ?? []).length;
    const defaults = (message.body.match(/^\s*\*\[/gm) ?? []).length;
    if (defaults < selectors) {
      errors.push(`line ${message.line}: ${id} has a selector without a *[default] variant`);
    }
    if (!message.body.trim()) {
      errors.push(`line ${message.line}: ${id} is empty`);
    }
  }
  return { messages, errors };
}

/** The $variables a message uses. */
export function variablesOf(body) {
  return new Set([...body.matchAll(/\$([A-Za-z][\w-]*)/g)].map(m => m[1]));
}

/** The messages a message references ({ other-message }); terms are skipped. */
export function referencesOf(body) {
  return new Set([...body.matchAll(/\{\s*([A-Za-z][\w-]*)(?:\.[\w-]+)?\s*\}/g)].map(m => m[1]));
}

function englishIds() {
  const ids = new Set();
  const removed = new Set();
  for (const file of [
    ...walk(ZEN_ENGLISH, f => f.endsWith(".ftl")),
    ...walk(path.join(OURS, "en-US"), f => f.endsWith(".ftl")),
  ]) {
    const text = fs.readFileSync(file, "utf8");
    for (const id of parseFtl(text).messages.keys()) {
      ids.add(id);
    }
    for (const match of text.matchAll(REMOVE_LINE)) {
      removed.add(match[1]);
    }
  }
  for (const id of removed) {
    ids.delete(id);
  }
  return ids;
}

/** String ids used by Peppermint's code and overlay patches. */
export function usedIds({ codeDirs = CODE_DIRS, patchesDir = PATCHES } = {}) {
  const patterns = [
    /data-l10n-id="((?:peppermint|zen)-[\w-]+)"/g,
    /setAttributes\([^,]+,\s*["']((?:peppermint|zen)-[\w-]+)["']/g,
    /formatValues?(?:Sync)?\(\s*["']((?:peppermint|zen)-[\w-]+)["']/g,
    // { id, args } entries of formatValues(), not element ids.
    /\{\s*id:\s*["']((?:peppermint|zen)-[\w-]+)["']\s*(?:\}|,\s*args\b)/g,
  ];
  const used = new Map();
  const scan = (text, where) => {
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        if (!used.has(match[1])) {
          used.set(match[1], where);
        }
      }
    }
  };
  for (const dir of codeDirs) {
    for (const file of walk(dir, f => CODE_FILES.test(f))) {
      scan(fs.readFileSync(file, "utf8"), path.relative(root, file));
    }
  }
  for (const file of walk(patchesDir, f => f.endsWith(".patch"))) {
    const added = fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter(line => line.startsWith("+") && !line.startsWith("+++"))
      .join("\n");
    scan(added, path.relative(root, file));
  }
  return used;
}

function featureIds() {
  const text = fs.readFileSync(FEATURES_FILE, "utf8");
  return [...text.matchAll(/\{\s*id:\s*"([a-z][\w-]*)",\s*category:/g)].map(m => m[1]);
}

/**
 * All problems, as messages.
 *
 * @param {object} [options] - Directories, for the tests.
 * @returns {string[]}
 */
export function checkStrings({ localesDir = OURS, codeDirs, patchesDir } = {}) {
  const problems = [];
  const english = englishIds();
  const englishMessages = new Map();
  const supported = new Set(
    fs
      .readFileSync(path.join(root, "locales/supported-languages"), "utf8")
      .split(/\s+/)
      .filter(Boolean)
  );

  for (const file of walk(localesDir, f => f.endsWith(".ftl"))) {
    const relative = path.relative(localesDir, file);
    const [lang, ...rest] = relative.split(path.sep);
    const { messages, errors } = parseFtl(fs.readFileSync(file, "utf8"));
    problems.push(...errors.map(error => `${relative}: ${error}`));
    if (lang === "en-US") {
      englishMessages.set(rest.join("/"), messages);
    }
  }

  for (const file of walk(localesDir, f => f.endsWith(".ftl"))) {
    const relative = path.relative(localesDir, file);
    const [lang, ...rest] = relative.split(path.sep);
    if (lang === "en-US") {
      continue;
    }
    if (!supported.has(lang)) {
      problems.push(`${relative}: ${lang} is not in locales/supported-languages`);
      continue;
    }
    const source = englishMessages.get(rest.join("/"));
    if (!source) {
      problems.push(
        `${relative}: there is no English file peppermint/locales/en-US/${rest.join("/")}`
      );
      continue;
    }
    for (const [id, message] of parseFtl(fs.readFileSync(file, "utf8")).messages) {
      const original = source.get(id);
      if (!original) {
        problems.push(`${relative}: ${id} is not in the English file (stale translation)`);
        continue;
      }
      const allowed = variablesOf(original.body);
      for (const variable of variablesOf(message.body)) {
        if (!allowed.has(variable)) {
          problems.push(`${relative}: ${id} uses $${variable}, which English does not have`);
        }
      }
      for (const reference of referencesOf(message.body)) {
        if (!english.has(reference)) {
          problems.push(`${relative}: ${id} refers to ${reference}, which does not exist`);
        }
      }
    }
  }

  for (const [id, where] of usedIds({ codeDirs, patchesDir })) {
    if (!english.has(id)) {
      problems.push(`${where}: uses the string ${id}, which has no English message`);
    }
  }
  for (const feature of featureIds()) {
    for (const suffix of ["", "-description", "-keywords"]) {
      if (!english.has(`peppermint-feature-${feature}${suffix}`)) {
        problems.push(
          `PeppermintFeatures.sys.mjs: feature ${feature} has no message peppermint-feature-${feature}${suffix}`
        );
      }
    }
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = checkStrings();
  for (const problem of problems) {
    console.error(`l10n-check: ${problem}`);
  }
  if (!problems.length) {
    console.log("l10n-check: strings are consistent");
  }
  process.exitCode = problems.length ? 1 : 0;
}
