# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Peppermint's localization layer.

Zen's locale files stay exactly as upstream ships them. When they are copied
into engine/ (scripts/copy_language_pack.py calls ``finalize``), this module:

* merges Peppermint's own en-US messages from peppermint/locales/en-US on top
  of the Zen en-US files (message by message, not line by line, so upstream
  edits to other messages never conflict);
* for every other language, drops Zen's translations of the messages
  Peppermint rewrote (they would say the old thing), gives Peppermint's own
  files their English text, and merges the translations from
  peppermint/locales/<lang> on top, so anything untranslated shows in English;
* rebrands user-visible text in every language using
  peppermint/l10n-rebrand.json, leaving identifiers and comments alone.

A message whose Zen translation still fits after Peppermint changed its
English text can keep it with "# peppermint: keep-translations <id>" in the
en-US override file.

  python3 peppermint/scripts/peppermint_l10n.py preview <lang> <outdir>

builds one language the way the build does, into <outdir>, to check it
without a Firefox checkout.
"""

import json
import os
import re
import shutil

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
LOCALES = os.path.join(ROOT, "peppermint", "locales")
OVERRIDES = os.path.join(LOCALES, "en-US", "browser")
ZEN_ENGLISH = os.path.join(ROOT, "locales", "en-US", "browser")
RULES_FILE = os.path.join(ROOT, "peppermint", "l10n-rebrand.json")

REMOVE_LINE = re.compile(r"^# peppermint: remove (\S+)\s*$", re.M)
KEEP_LINE = re.compile(r"^# peppermint: keep-translations (\S+)\s*$", re.M)

ID_LINE = re.compile(r"^(-?[A-Za-z][\w-]*\s*=\s?)(.*)$")
ATTR_LINE = re.compile(r"^(\s+\.[\w-]+\s*=\s?)(.*)$")


def load_rules():
  if not os.path.exists(RULES_FILE):
    return {"replacements": [], "exact": []}
  with open(RULES_FILE, encoding="utf-8") as f:
    return json.load(f)


# --- Fluent block parsing -------------------------------------------------


def parse_blocks(text):
  """Split an .ftl file into blocks: [{"id": str|None, "lines": [str]}].

  A block is a message or term with its directly preceding comment lines and
  its continuation lines. Blank lines stay attached to the block before them.
  """
  lines = text.split("\n")
  segments = []
  for line in lines:
    # A column-0 "}" closes a multi-line placeable and, like a variant key,
    # belongs to the message above it.
    starts = bool(line) and not line[0].isspace() and line[0] not in "}[*"
    if starts or not segments:
      segments.append([line])
    else:
      segments[-1].append(line)

  blocks = []
  pending_comments = []
  for seg in segments:
    head = seg[0]
    match = ID_LINE.match(head)
    if match:
      blocks.append({"id": match.group(1).split("=")[0].strip(), "lines": pending_comments + seg})
      pending_comments = []
    elif head.startswith("#") and seg[-1].strip():
      # Comment directly attached to what follows (no trailing blank line).
      pending_comments.extend(seg)
    else:
      if pending_comments:
        blocks.append({"id": None, "lines": pending_comments})
        pending_comments = []
      blocks.append({"id": None, "lines": seg})
  if pending_comments:
    blocks.append({"id": None, "lines": pending_comments})
  return blocks


def block_body(block):
  """Block text without trailing blank lines, used for comparisons."""
  lines = list(block["lines"])
  while lines and not lines[-1].strip():
    lines.pop()
  return "\n".join(lines)


def trailing_blank(block):
  count = 0
  for line in reversed(block["lines"]):
    if line.strip():
      break
    count += 1
  return count


def render(blocks):
  return "\n".join(line for block in blocks for line in block["lines"])


def merge_overrides(upstream_text, override_text):
  """Replace/append Peppermint messages onto a Zen en-US file."""
  overrides = {b["id"]: b for b in parse_blocks(override_text) if b["id"]}
  removals = set(REMOVE_LINE.findall(override_text))
  used = set()
  out = []
  for block in parse_blocks(upstream_text):
    ident = block["id"]
    if ident in removals:
      continue
    if ident in overrides:
      replacement = overrides[ident]
      used.add(ident)
      out.append({"id": ident, "lines": replacement["lines"][: len(replacement["lines"]) - trailing_blank(replacement)] + [""] * max(trailing_blank(block), 0)})
    else:
      out.append(block)
  additions = [b for ident, b in overrides.items() if ident not in used]
  if additions:
    # Keep one blank line between the Zen content and Peppermint additions.
    if out and out[-1]["lines"] and out[-1]["lines"][-1].strip():
      out[-1] = {"id": out[-1]["id"], "lines": out[-1]["lines"] + [""]}
    for block in additions:
      out.append(block)
  return render(out)


# --- Rebranding ----------------------------------------------------------


def rebrand_value(value, rules):
  for rule in rules["replacements"]:
    value = value.replace(rule["from"], rule["to"])
  return value


def rebrand_text(text, rules=None):
  rules = rules or load_rules()
  exact = {r["key"]: r for r in rules["exact"]}
  out = []
  current_key = None
  for line in text.split("\n"):
    if line.startswith("#"):
      out.append(line)
      continue
    id_match = ID_LINE.match(line)
    attr_match = ATTR_LINE.match(line)
    if id_match:
      current_key = id_match.group(1).split("=")[0].strip()
      value = id_match.group(2)
      rule = exact.get(current_key)
      if rule and value.strip() == rule["from"]:
        value = rule["to"]
      out.append(id_match.group(1) + rebrand_value(value, rules))
    elif attr_match:
      out.append(attr_match.group(1) + rebrand_value(attr_match.group(2), rules))
    else:
      out.append(rebrand_value(line, rules))
  return "\n".join(out)


# --- Translations --------------------------------------------------------


def message_ids(text):
  return {block["id"] for block in parse_blocks(text) if block["id"]}


def drop_messages(text, ids):
  return render([block for block in parse_blocks(text) if block["id"] not in ids])


def read_text(path):
  if not os.path.exists(path):
    return None
  with open(path, encoding="utf-8") as f:
    return f.read()


def stale_ids(english, zen_english):
  """Zen ids whose translations no longer match Peppermint's English text."""
  rewritten = message_ids(english) & message_ids(zen_english or "")
  return (rewritten | set(REMOVE_LINE.findall(english))) - set(KEEP_LINE.findall(english))


def merge_translations(lang_dir, lang_id):
  """Peppermint's strings for a language other than en-US.

  ``lang_dir`` holds the language's browser/browser/... files, copied from
  locales/<lang>/. Translations live in peppermint/locales/<lang>/ with the
  same layout.
  """
  translations = os.path.join(LOCALES, lang_id, "browser")
  for root, _, files in os.walk(OVERRIDES):
    for name in files:
      if not name.endswith(".ftl"):
        continue
      relative = os.path.normpath(os.path.join(os.path.relpath(root, OVERRIDES), name))
      english = read_text(os.path.join(root, name))
      zen_english = read_text(os.path.join(ZEN_ENGLISH, relative))
      target = os.path.join(lang_dir, "browser", relative)
      ours = message_ids(english)
      translation = read_text(os.path.join(translations, relative)) or ""
      # Only Peppermint's own messages, and only those that still exist.
      translation = render(
        [b for b in parse_blocks(translation) if b["id"] and b["id"] in ours]
      )

      if zen_english is None:
        # A Peppermint file: English, with whatever is translated on top.
        base = english
      else:
        base = read_text(target)
        if base is None and not translation:
          continue
        base = drop_messages(base or "", stale_ids(english, zen_english))
      merged = merge_overrides(base, translation) if translation.strip() else base
      os.makedirs(os.path.dirname(target), exist_ok=True)
      with open(target, "w", encoding="utf-8") as f:
        f.write(merged)


# --- Entry point ---------------------------------------------------------


def finalize(lang_dir, lang_id):
  """Called after a language pack was copied to ``lang_dir``."""
  rules = load_rules()

  if lang_id != "en-US" and os.path.isdir(OVERRIDES):
    merge_translations(lang_dir, lang_id)

  if lang_id == "en-US" and os.path.isdir(OVERRIDES):
    for root, _, files in os.walk(OVERRIDES):
      relative = os.path.relpath(root, OVERRIDES)
      for name in files:
        override = os.path.join(root, name)
        target = os.path.normpath(os.path.join(lang_dir, relative, name))
        with open(override, encoding="utf-8") as f:
          override_text = f.read()
        if os.path.exists(target):
          with open(target, encoding="utf-8") as f:
            merged = merge_overrides(f.read(), override_text)
        else:
          os.makedirs(os.path.dirname(target), exist_ok=True)
          merged = override_text
        with open(target, "w", encoding="utf-8") as f:
          f.write(merged)

  for root, _, files in os.walk(lang_dir):
    for name in files:
      if not name.endswith(".ftl") or not name.startswith("zen"):
        continue
      path = os.path.join(root, name)
      with open(path, encoding="utf-8") as f:
        original = f.read()
      rebranded = rebrand_text(original, rules)
      if rebranded != original:
        with open(path, "w", encoding="utf-8") as f:
          f.write(rebranded)


def preview(lang_id, out_dir):
  """Builds one language into out_dir the way copy_language_pack.py does."""
  if os.path.exists(out_dir):
    shutil.rmtree(out_dir)
  source = (
    os.path.join(ROOT, "locales", "en-US", "browser")
    if lang_id == "en-US"
    else os.path.join(ROOT, "locales", lang_id)
  )
  shutil.copytree(source, out_dir)
  finalize(out_dir, lang_id)


if __name__ == "__main__":
  import sys

  if len(sys.argv) == 4 and sys.argv[1] == "preview":
    preview(sys.argv[2], sys.argv[3])
    print(f"peppermint_l10n: {sys.argv[2]} built in {sys.argv[3]}")
  else:
    print("usage: peppermint_l10n.py preview <lang> <outdir>", file=sys.stderr)
    sys.exit(2)
