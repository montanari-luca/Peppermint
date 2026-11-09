# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Confirmation shown before closing tabs, when it is turned on in settings

# Variables:
#   $tabCount (Number) - the number of tabs that would close
peppermint-tab-close-title =
    { $tabCount ->
        [one] Close this tab?
       *[other] Close { $tabCount } tabs?
    }

# Variables:
#   $tabCount (Number) - the number of tabs that would close
peppermint-tab-close-button =
    { $tabCount ->
        [one] Close Tab
       *[other] Close Tabs
    }

## Toast shown after tabs close, with a button that reopens them

# Variables:
#   $count (Number) - the number of tabs that closed together
peppermint-undo-close-toast =
    { $count ->
        [one] Tab closed
       *[other] { $count } tabs closed
    }

peppermint-undo-close-button =
    .label = Undo
    .tooltiptext = Reopen the closed tabs
