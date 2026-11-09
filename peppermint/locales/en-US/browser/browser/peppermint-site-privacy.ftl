# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Privacy section of the site panel, opened from the start of the address bar.

peppermint-site-privacy-title = Privacy

peppermint-site-privacy-trackers = Trackers
# $count (Number) - how many trackers were blocked on the page
peppermint-site-privacy-trackers-blocked =
    { $count ->
        [one] 1 blocked on this page
       *[other] { $count } blocked on this page
    }
peppermint-site-privacy-trackers-none = None blocked on this page

peppermint-site-privacy-storage = Cookies and site data
# $cookies (Number) - how many cookies the site has
# $size (String) - the storage the site uses, for example "3.4"
# $unit (String) - the unit of $size, for example "MB"
peppermint-site-privacy-storage-summary =
    { $cookies ->
        [one] 1 cookie, { $size } { $unit }
       *[other] { $cookies } cookies, { $size } { $unit }
    }
peppermint-site-privacy-storage-none = Nothing stored

peppermint-site-privacy-forget = Forget This Site
peppermint-site-privacy-forget-description = Cookies, storage, cache and permissions
peppermint-site-privacy-forget-confirm = Click again to forget
peppermint-site-privacy-also-history =
    .label = Also remove its history

## Toast shown after a site was forgotten.
## $site (String) - the site, for example "example.com"

peppermint-site-privacy-forgotten = Forgot { $site }
peppermint-site-privacy-forgotten-with-history = Forgot { $site } and its history
