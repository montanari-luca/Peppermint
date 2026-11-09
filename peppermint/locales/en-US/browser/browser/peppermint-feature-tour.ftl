# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Feature tour toasts

# $count (Number) - how many features Peppermint adds.
peppermint-feature-tour-discover = Peppermint adds { $count } features to Zen
# $count (Number) - how many features the update added.
peppermint-feature-tour-new =
    { $count ->
        [one] This update adds a Peppermint feature
       *[other] This update adds { $count } Peppermint features
    }
peppermint-feature-tour-button =
    .label = Take a Look
    .tooltiptext = Open the Peppermint features in Settings
