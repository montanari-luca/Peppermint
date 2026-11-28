# Translating Peppermint

Zen's strings (`locales/<lang>/`) are translated in Zen's own Crowdin project and arrive with the daily upstream sync. Peppermint's strings (`peppermint/locales/en-US/`) are translated in Peppermint's Crowdin project. Never edit `locales/` by hand.

## How a translated build is made

`npm run import` and release builds call `peppermint/scripts/peppermint_l10n.py` for every language in `locales/supported-languages`. For each language it:

1. Copies Zen's translations.
2. Drops Zen's translation of every message Peppermint reworded (an id that exists in both Zen's and Peppermint's English files), so a translated build never says the old thing. The message shows in English until Peppermint's translation arrives.
3. Adds Peppermint's own files (`peppermint-*.ftl`) in English.
4. Merges the translations from `peppermint/locales/<lang>/` on top, message by message.
5. Rebrands "Zen" in user-visible text.

English (`en-US`) is built exactly as before.

When Peppermint changes the English text of a Zen message but Zen's translations still fit (for example a shorter heading for the same section), keep them with a comment in the English override file:

```
# peppermint: keep-translations zen-glance-header
```

## Checking without a build

```bash
node peppermint/scripts/l10n-check.mjs
```

```bash
python3 peppermint/scripts/peppermint_l10n.py preview de /tmp/peppermint-de
```

`l10n-check.mjs` runs in `peppermint-checks.yml`. It checks:

- that the Fluent files parse;
- that translated messages exist in English, with the same variables;
- that their languages are shipped;
- that every string id used in `src/peppermint` and the overlay patches has an English message.

## Setting up Crowdin (once)

1. Create a Crowdin project for Peppermint (a separate one from Zen's: Peppermint's files reuse some of Zen's file names). Choose the languages in `locales/supported-languages`.
2. Add the repository secrets:
   - `CROWDIN_PROJECT_ID`: the project's numeric id.
   - `CROWDIN_PERSONAL_TOKEN`: a personal access token with access to that project.
3. Run "Peppermint translations" from the Actions tab.

The workflow `.github/workflows/peppermint-l10n.yml`:

- uploads the English files whenever `peppermint/locales/en-US` changes on `mine`;
- once a day, opens a pull request from `l10n/crowdin` into `mine` with the new translations.

`peppermint/crowdin.yml` maps Crowdin's language codes to the folder names in `locales/supported-languages`. A language that lands in the wrong folder fails `l10n-check`.

## Writing strings

- Put new strings in `peppermint/locales/en-US/browser/...`, mirroring the path under `locales/en-US/browser/`.
- Give each message a comment when its meaning is not obvious from the id. Explain every `$variable`.
- Never reuse an id for a different meaning: make a new id instead, so old translations do not show the old text.
