# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Report page (about:report)

peppermint-report-title = Peppermint report

peppermint-report-periods =
    .aria-label = Time period
peppermint-report-period-week = This week
peppermint-report-period-month = This month
peppermint-report-period-year = This year

peppermint-report-trackers = Trackers blocked
peppermint-report-banners = Cookie banners handled
peppermint-report-active = Time browsing
peppermint-report-unloaded = Idle tabs unloaded
peppermint-report-archived = Tabs archived

# $hours (Number) - whole hours; $minutes (Number) - minutes past the hour.
peppermint-report-duration = { $hours } h { $minutes } min

# $size (String) - an amount of memory with its unit, such as 1.5 GB.
peppermint-report-memory = About { $size } of memory freed

peppermint-report-top-sites = Most visited sites
# $count (Number) - how many times the site was visited.
peppermint-report-visits =
    { $count ->
        [one] { $count } visit
       *[other] { $count } visits
    }
peppermint-report-no-sites = No sites visited in this period.

peppermint-report-share = Share
peppermint-report-share-description = Turn this period into an image to post or send. It only contains the numbers above.
peppermint-report-copy-image = Copy image
peppermint-report-save-image = Save image
# $name (String) - the name of the file that was saved in Downloads.
peppermint-report-saved = Saved to Downloads as { $name }
peppermint-report-copied = Image copied to the clipboard
peppermint-report-share-error = The image could not be made
peppermint-report-file-name = Peppermint report

peppermint-report-share-title-week = My week with Peppermint
peppermint-report-share-title-month = My month with Peppermint
peppermint-report-share-title-year = My year with Peppermint
peppermint-report-brand = Peppermint Browser

peppermint-report-footer = Counted on this device only. Private windows are never counted.

## Startup section

peppermint-report-startup = Startup
peppermint-report-startup-empty = Restart Peppermint to measure how long it takes to start.
peppermint-report-startup-last = Last start
peppermint-report-startup-typical = Typical start
peppermint-report-startup-peppermint = Peppermint features at startup
# $count (Number) - how many launches the typical start is taken from.
peppermint-report-startup-launches =
    { $count ->
        [one] Over the last launch
       *[other] Over the last { $count } launches
    }
peppermint-report-startup-slowest = Slowest Peppermint features
peppermint-report-startup-mods = Heaviest mods
peppermint-report-startup-tips = What you can do
peppermint-report-startup-no-tips = Nothing is slowing startup down.
peppermint-report-startup-turn-off = Turn off
peppermint-report-startup-turned-off = Turned off
# $count (Number) - how many extensions are turned on.
peppermint-report-startup-tip-extensions =
    { $count ->
        [one] { $count } extension starts with the browser. Removing the ones you do not use makes starting faster.
       *[other] { $count } extensions start with the browser. Removing the ones you do not use makes starting faster.
    }
peppermint-report-startup-open-addons = Open add-ons
# $size (String) - an amount of data with its unit, such as 350 kB.
peppermint-report-startup-tip-mods = Your mods add { $size } of styles to every window. Turning off the heaviest ones makes windows open faster.
peppermint-report-startup-manage-mods = Manage mods
peppermint-report-startup-tip-restore = Every restored tab loads when Peppermint starts. Loading each tab only when you select it makes starting faster.
peppermint-report-startup-restore-fix = Load when selected
