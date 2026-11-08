# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Warning bar shown when a website imitates a popular one.
## Variables:
##   $site (String) - the address of this website, for example "xn--pple-43d.com"
##   $domain (String) - the popular website it looks like, for example "apple.com"

peppermint-lookalike-message-confusable = { $site } is not { $domain }. Its name uses characters that look like the real one. Check the address before you sign in or pay.
peppermint-lookalike-message-typo = { $site } is not { $domain }. Its name is one letter away from the real one. Check the address before you sign in or pay.
peppermint-lookalike-go = Go to { $domain }
peppermint-lookalike-continue = Stay on This Site
