# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Rebase Sync (make this device match the account) and Push Sync (make the
## account match this device), from Settings > Sync and the account menu

peppermint-sync-override-panel-rebase =
    .label = Rebase from Sync…
peppermint-sync-override-panel-push =
    .label = Push to Sync…

## Dialog

peppermint-sync-override-rebase-dialog =
    .title = Rebase from Sync
    .buttonlabelaccept = Rebase
peppermint-sync-override-push-dialog =
    .title = Push to Sync
    .buttonlabelaccept = Push
peppermint-sync-override-done-dialog =
    .buttonlabelaccept = Done

peppermint-sync-override-rebase-heading = Make this device match your account
peppermint-sync-override-rebase-description = The chosen data on this device is replaced with the copy saved in your account. Changes made here since the last sync are discarded and never uploaded.
peppermint-sync-override-push-heading = Make your account match this device
peppermint-sync-override-push-description = The copy saved in your account is replaced with this device’s data. Your other devices get it on their next sync; rebase a device to also discard its own unsynced changes.

peppermint-sync-override-rebase-warning =
    .message = Data that only exists on this device is deleted and can’t be recovered. Bookmarks are backed up first.
peppermint-sync-override-push-warning =
    .message = Data that only exists in your account is removed from it, and your other devices remove it on their next sync.

peppermint-sync-override-rebase-history-note = Sync only downloads your newest 5,000 history entries, so older history on this device is removed.
peppermint-sync-override-push-history-note = Only your newest 5,000 history entries are uploaded. History already in your account is kept.

peppermint-sync-override-no-types = Turn on syncing for at least one type of data first.

peppermint-sync-override-engine-forms =
    .label = Form history

peppermint-sync-override-running = Working, keep this window open…

## Results. Variables:
##   $types (String) - a list of data types, such as “Bookmarks, Notes and Settings”

peppermint-sync-override-result-rebase-done = Now matches your account: { $types }
peppermint-sync-override-result-push-done = Your account now matches this device: { $types }
peppermint-sync-override-result-empty-server = Skipped, nothing saved in your account: { $types }
peppermint-sync-override-result-empty-local = Skipped, nothing on this device: { $types }
peppermint-sync-override-result-locked = Skipped, unlock your Primary Password first: { $types }
peppermint-sync-override-result-undecryptable = Not changed, the copy in your account can’t be read: { $types }
peppermint-sync-override-result-error = Something went wrong, try again: { $types }
peppermint-sync-override-result-none = Nothing was changed.

peppermint-sync-override-error-busy = Sync is busy. Try again in a minute.
peppermint-sync-override-error-not-configured = Turn on Sync first.
peppermint-sync-override-error-login = Couldn’t sign in to Sync. Check your connection and try again.
peppermint-sync-override-error-error = Something went wrong. Try again.
