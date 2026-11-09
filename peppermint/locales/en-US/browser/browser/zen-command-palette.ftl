# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

zen-action-toggle-underpowered = Toggle Underpowered Mode
zen-action-open-notepad = Open Notepad
zen-action-search-tabs = Search Tabs
zen-action-note-about-page = Note About This Page
zen-action-open-notes = Open All Notes
zen-action-open-vault = Open Vault
zen-action-lock-vault = Lock Vault
zen-action-manage-url-snippets = Manage URL Snippets
zen-action-clear-cookie-exceptions = Clear Cookie Banner Exceptions
zen-action-toggle-reader-mode = Toggle Reader Mode
zen-action-save-article-offline = Save Article for Offline Reading
zen-action-open-saved-articles = Open Saved Articles
zen-action-open-report = Open Peppermint Report
zen-action-almost-maximize-window = Almost Maximize Window
zen-action-fullscreen-window = Fullscreen Window

# Settings. Each setting in PeppermintPaletteSettings.sys.mjs needs a name,
# and each choice of a setting with choices needs a value.
peppermint-setting-enable = Enable { $name }
peppermint-setting-disable = Disable { $name }
peppermint-setting-set = Set { $name } to { $value }
peppermint-setting-is-on = { $name } turned on
peppermint-setting-is-off = { $name } turned off
peppermint-setting-was-set = { $name } set to { $value }

peppermint-setting-name-do-not-track = Do Not Track Request
peppermint-setting-name-global-privacy-control = Global Privacy Control
peppermint-setting-name-query-stripping = Tracking Parameter Removal
peppermint-setting-name-clean-links = Clean Links (Skip Click Trackers)
peppermint-setting-name-fingerprinting-protection = Fingerprinting Protection
peppermint-setting-name-referrer-trimming = Referrer Sent to Other Sites
peppermint-setting-name-webrtc-local-addresses = Hide Local IP Addresses from WebRTC
peppermint-setting-name-site-privacy = Privacy Section in the Site Panel
peppermint-setting-name-lookalike-warning = Lookalike Site Warning
peppermint-setting-name-startup-doctor = Startup Times in the Report
peppermint-setting-name-permission-auto-revoke = Remove Permissions from Unused Sites
peppermint-setting-name-auto-revoke-days = Unused Site Permissions Removed After
peppermint-setting-name-https-first = HTTPS-First Mode
peppermint-setting-name-https-only = HTTPS-Only Mode
peppermint-setting-name-popup-blocker = Pop-up Blocker
peppermint-setting-name-save-passwords = Ask to Save Passwords
peppermint-setting-name-autofill-addresses = Address Autofill
peppermint-setting-name-autofill-cards = Payment Method Autofill
peppermint-setting-name-cookie-banner-blocker = Cookie Banner Blocker
peppermint-setting-name-search-suggestions = Search Suggestions
peppermint-setting-name-suggest-history = Browsing History Suggestions
peppermint-setting-name-suggest-open-tabs = Open Tab Suggestions
peppermint-setting-name-suggest-top-sites = Top Site Suggestions
peppermint-setting-name-popular-sites = Popular Site Suggestions
peppermint-setting-name-startup-page = Startup Page
peppermint-setting-name-warn-closing-tabs = Warning When Closing Several Tabs
peppermint-setting-name-undo-close-toast = Undo Toast After Closing Tabs
peppermint-setting-name-downloads-panel = Downloads Panel When a Download Starts
peppermint-setting-name-smooth-scrolling = Smooth Scrolling
peppermint-setting-name-autoscroll = Autoscrolling
peppermint-setting-name-find-as-you-type = Find As You Type
peppermint-setting-name-picture-in-picture-button = Picture-in-Picture Button
peppermint-setting-name-glance = Glance

peppermint-setting-value-startup-page-homepage = Open Homepage
peppermint-setting-value-startup-page-previous-session = Restore Previous Session
peppermint-setting-value-referrer-trimming-full = Full Address
peppermint-setting-value-referrer-trimming-origin = Site Only
peppermint-setting-value-auto-revoke-days-30 = 30 Days
peppermint-setting-value-auto-revoke-days-90 = 90 Days
peppermint-setting-value-auto-revoke-days-180 = 180 Days
peppermint-setting-value-auto-revoke-days-365 = 1 Year

## Other words that find a setting in the palette, separated by commas.
## They are never shown.

peppermint-setting-keywords-do-not-track = dnt, tracking, privacy
peppermint-setting-keywords-global-privacy-control = gpc, do not sell, tracking, privacy
peppermint-setting-keywords-query-stripping = clean links, utm, fbclid, tracking
peppermint-setting-keywords-clean-links = redirect, amp, click tracking, outbound links
peppermint-setting-keywords-fingerprinting-protection = fingerprint, tracking, privacy
peppermint-setting-keywords-referrer-trimming = referer, referrer, privacy
peppermint-setting-keywords-webrtc-local-addresses = ip leak, webrtc, local ip, privacy
peppermint-setting-keywords-site-privacy = cookies, site data, forget site, trackers
peppermint-setting-keywords-lookalike-warning = phishing, scam, fake site, typo, punycode
peppermint-setting-keywords-startup-doctor = startup, launch, slow, speed, performance, about:report
peppermint-setting-keywords-permission-auto-revoke = camera, microphone, location, notifications, revoke, expire, privacy
peppermint-setting-keywords-auto-revoke-days = camera, microphone, location, notifications, revoke, expire, days
peppermint-setting-keywords-https-first = ssl, tls, secure, encryption
peppermint-setting-keywords-https-only = ssl, tls, secure, encryption
peppermint-setting-keywords-popup-blocker = popups, windows, ads
peppermint-setting-keywords-cookie-banner-blocker = cookies, consent, gdpr, banner

# Sites. Each permission in PeppermintPaletteSite.sys.mjs needs a name.
peppermint-permission-name-camera = Camera
peppermint-permission-name-microphone = Microphone
peppermint-permission-name-geo = Location
peppermint-permission-name-desktop-notification = Notifications
peppermint-permission-name-popup = Pop-ups

peppermint-site-permission-allow = Allow { $permission } for This Site
peppermint-site-permission-block = Block { $permission } for This Site
peppermint-site-permission-reset = Reset { $permission } for This Site
peppermint-site-permission-allowed = { $permission } allowed for { $site }
peppermint-site-permission-blocked = { $permission } blocked for { $site }
peppermint-site-permission-was-reset = { $permission } reset for { $site }
peppermint-site-reset-permissions = Reset All Permissions for This Site
peppermint-site-permissions-were-reset = Permissions reset for { $site }
peppermint-site-manage-permissions = Manage Permissions for This Site
peppermint-site-clear-data = Clear Cookies and Site Data for This Site

peppermint-site-cookie-banners-pause = Pause Cookie Banner Blocking on This Site
peppermint-site-cookie-banners-resume = Resume Cookie Banner Blocking on This Site
peppermint-site-rule-changed = Rules for { $site } updated

# Tabs. Each action in PeppermintPaletteTabs.sys.mjs needs a label.
peppermint-action-close-duplicate-tabs = Close Duplicate Tabs
peppermint-action-close-other-tabs = Close All Other Tabs
peppermint-action-close-tabs-below = Close Tabs Below
peppermint-action-copy-tab-urls = Copy URLs of All Tabs
peppermint-action-copy-tabs-markdown = Copy All Tabs as Markdown List
peppermint-action-copy-page-markdown-link = Copy Page as Markdown Link
peppermint-action-copy-page-title = Copy Page Title

peppermint-duplicates-closed =
    { $count ->
        [one] Closed { $count } duplicate tab
       *[other] Closed { $count } duplicate tabs
    }
peppermint-tabs-copied =
    { $count ->
        [one] Copied { $count } tab
       *[other] Copied { $count } tabs
    }
peppermint-page-copied = Copied

# Developer tools.
peppermint-action-toggle-responsive-design = Toggle Responsive Design Mode
peppermint-action-open-web-console = Open Web Console
peppermint-action-view-page-source = View Page Source
peppermint-action-toggle-disable-cache = Toggle Disable Cache (Developer Tools)

# Address bar developer tools (PeppermintUrlbarProviderOmniUtils.sys.mjs).
peppermint-omni-copied = Copied to clipboard

# Tab archive and snooze (PeppermintArchiveActions.sys.mjs).
peppermint-action-open-tab-archive = Open Tab Archive
peppermint-action-archive-this-tab = Archive This Tab
peppermint-action-archive-idle-tabs-now = Archive Idle Tabs Now
peppermint-action-snooze-tab-later = Snooze This Tab for 3 Hours
peppermint-action-snooze-tab-tomorrow = Snooze This Tab Until Tomorrow Morning
peppermint-action-snooze-tab-next-week = Snooze This Tab Until Next Monday

peppermint-tab-archived = Tab archived
# $count (Number) - how many tabs were archived.
peppermint-idle-tabs-archived =
    { $count ->
        [one] Archived { $count } idle tab
       *[other] Archived { $count } idle tabs
    }
# $time (String) - when the tab comes back, in the local format.
peppermint-tab-snoozed = Tab snoozed until { $time }
# $title (String) - the title of the page that came back.
peppermint-snooze-woke = Snoozed tab is back: { $title }
