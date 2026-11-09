# peppermint: remove pane-zen-looks-title
# peppermint: remove category-zen-looks
# peppermint: remove pane-zen-tabs-title
# peppermint: remove category-zen-workspaces
# peppermint: remove pane-settings-workspaces-title
# peppermint: remove pane-zen-pinned-tab-manager-title
# peppermint: remove pane-zen-theme-title
# peppermint: remove zen-theme-marketplace-header
# peppermint: remove zen-theme-disable-all-enabled
# peppermint: remove zen-theme-disable-all-disabled
# peppermint: remove zen-theme-marketplace-description
# peppermint: remove zen-theme-marketplace-remove-button
# peppermint: remove zen-theme-marketplace-check-for-updates-button
# peppermint: remove zen-theme-marketplace-import-button
# peppermint: remove zen-theme-marketplace-export-button
# peppermint: remove zen-theme-marketplace-import-success
# peppermint: remove zen-theme-marketplace-import-failure
# peppermint: remove zen-theme-marketplace-export-success
# peppermint: remove zen-theme-marketplace-export-failure
# peppermint: remove zen-theme-marketplace-updates-success
# peppermint: remove zen-theme-marketplace-updates-failure
# peppermint: remove zen-theme-marketplace-toggle-enabled-button
# peppermint: remove zen-theme-marketplace-toggle-disabled-button
# peppermint: remove zen-theme-marketplace-remove-confirmation
# peppermint: remove zen-theme-marketplace-close-modal
# peppermint: remove zen-theme-marketplace-theme-header-title
# peppermint: remove zen-theme-marketplace-dropdown-default-label
# peppermint: remove zen-theme-marketplace-input-default-placeholder
# peppermint: remove pane-zen-marketplace-title
# peppermint: remove zen-themes-auto-update
# peppermint: remove zen-theme-marketplace-link
# peppermint: remove category-zen-marketplace

pane-zen-homepage-title = Homepage

category-zen-homepage =
    .tooltiptext = { pane-zen-homepage-title }

pane-zen-sidebar-layout-title = Sidebar & layout

category-zen-sidebar-layout =
    .tooltiptext = { pane-zen-sidebar-layout-title }

pane-zen-toolbar-urlbar-title = Toolbar & address bar

category-zen-toolbar-urlbar =
    .tooltiptext = { pane-zen-toolbar-urlbar-title }

pane-zen-spaces-tabs-title = Spaces & tabs

category-zen-spaces-tabs =
    .tooltiptext = { pane-zen-spaces-tabs-title }

pane-zen-adblock-title = Ad blocking

category-zen-adblock =
    .tooltiptext = { pane-zen-adblock-title }

pane-zen-performance-title = Performance and effects

category-zen-performance =
    .tooltiptext = { pane-zen-performance-title }

pane-zen-janitor-title = Janitor

category-zen-janitor =
    .tooltiptext = { pane-zen-janitor-title }

pane-zen-shortcuts-title = Shortcuts

category-zen-shortcuts =
    .tooltiptext = { pane-zen-shortcuts-title }

pane-zen-url-snippets-title = URL Snippets

category-zen-url-snippets =
    .tooltiptext = { pane-zen-url-snippets-title }

zen-sidebar-layout-section-title = Sidebar & layout

zen-tab-list-section-title = Tab list

zen-compact-toolbar-section-title = Compact toolbar

zen-address-bar-section-title = Address bar

zen-tab-switching-section-title = Tab switching

zen-tab-switching-header = Tab switching behavior

zen-tab-switching-description = Control how tabs are selected when you close tabs or cycle with Ctrl+Tab.

zen-pinned-essentials-section-title = Pinned tabs & essentials

zen-glance-section-title = Link preview

zen-split-view-settings-section-title = Split view

zen-settings-spaces-sync-footer =
    Workspace sync is managed in your Mozilla account settings.
    <a data-l10n-name="sync-link">Open Sync settings</a>

zen-library-settings-title = Library

zen-library-settings-header = General settings for the library

zen-library-settings-description = Choose which section opens when you use the library button in the sidebar.

zen-library-default-section-label = Default section

zen-library-default-section-downloads =
    .label = Downloads

zen-library-default-section-history =
    .label = History

zen-library-default-section-boosts =
    .label = Boosts

zen-library-default-section-spaces =
    .label = Spaces

zen-library-default-section-media =
    .label = Media

zen-glance-header = Glance

zen-split-view-settings-header = Split view

zen-split-view-settings-description = Control how split view appears in the tab strip.

zen-split-view-show-tab-split-button =
    .label = Show split view button on tabs

zen-pinned-tab-manager-header = Pinned tabs

zen-settings-workspaces-header = Spaces

zen-vertical-tabs-title = Tab list

zen-vertical-tabs-header = Tab list options

zen-urlbar-title = Address bar

zen-urlbar-header = Address bar

zen-theme-glass-enabled =
    .label = Frosted glass

zen-adblock-section-title = Ad blocking

zen-adblock-header = Ad blocker

zen-adblock-description = { -brand-short-name } blocks ads with an extension of your choice. The one you pick is installed right away and replaces the previous one.

zen-adblock-choice-label = Ad blocker

zen-adblock-status-installed = Installed and ready.

zen-adblock-status-installing = Installing...

zen-adblock-status-missing = Not installed.

zen-adblock-status-failed = The ad blocker could not be installed. Check your connection and try again.

zen-adblock-install =
    .label = Install now

# $count (Number) - how many cookie popups were handled so far.
zen-cookie-consent-status = { $count ->
        [one] 1 cookie popup handled so far.
       *[other] { $count } cookie popups handled so far.
    }

zen-cookie-consent-header = Cookie popups

zen-cookie-consent-description = Refuse cookie popups on every site and hide any that stay on screen. This works with any ad blocker, and you can pause it for one site from the site panel.

zen-cookie-consent-enabled =
    .label = Automatically refuse cookie popups

zen-site-exceptions-header = Site exceptions

zen-site-exceptions-description = Sites where cookie popup refusal differs from your global setting. Removing a site returns it to your defaults.

zen-site-exceptions-empty = No sites have exceptions yet. Use the site panel next to the address bar to add one.

zen-site-exceptions-clear =
    .label = Remove all

# $site (String) - the site the exceptions apply to, for example "example.com".
zen-site-exceptions-remove =
    .label = Remove
    .aria-label = Remove exceptions for { $site }

zen-site-exceptions-cookies = Cookie popups left alone

pane-zen-CKS-title = Shortcuts

category-zen-CKS =
    .tooltiptext = { pane-zen-shortcuts-title }

pane-settings-CKS-title = { -brand-short-name } shortcuts

zen-settings-notepad-header = Notepad

zen-settings-notepad-description = Choose the key that confirms a suggestion in the local notepad. Tab is the default, and it only applies while the suggestion menu is open.

zen-settings-notepad-autocomplete = Confirm suggestion

zen-settings-notepad-reset =
    .label = Reset

# Keyboard navigation: Tab either switches tabs or moves focus in the page.
tab-key-behavior =
    .label = Tab key

tab-key-behavior-tabs =
    .label = Use the tab key without CTRL to move between tabs

tab-key-behavior-focus =
    .label = Use the tab key to move focus between form controls and links

zen-homepage-section-title = Homepage

zen-homepage-header = Homepage

zen-homepage-description = Choose what appears when you open a new tab.

zen-homepage-mode-builtin =
    .label = Built-in homepage

zen-homepage-mode-blank =
    .label = Nothing

zen-homepage-mode-custom =
    .label = Custom URL

zen-homepage-url-label = Homepage URL

zen-homepage-url-invalid = Enter a valid http or https URL.

zen-homepage-cards-header = Cards

zen-homepage-cards-description = Choose which cards appear on the built-in homepage.

zen-homepage-card-time-spent-toggle =
    .label = Time spent browsing

zen-homepage-card-top-site-toggle =
    .label = Most used website

zen-homepage-card-network-speed-toggle =
    .label = Avg. Network Speed

zen-homepage-card-downloads-toggle =
    .label = Nº Downloads

zen-homepage-card-visited-sites-toggle =
    .label = Nº Visited websites

zen-homepage-card-version-toggle =
    .label = Current Version

zen-homepage-card-report-toggle =
    .label = Protected This Week (Peppermint report)

zen-homepage-card-clock-toggle =
    .label = Clock

zen-url-snippets-section-title = URL Snippets

zen-url-snippets-header = URL Snippets

zen-url-snippets-description = Type > followed by a shortcut in the address bar to open its URL. For example, >yt opens YouTube.

zen-url-snippets-shortcut-label = Shortcut

zen-url-snippets-url-label = URL

zen-url-snippets-add =
    .label = Add snippet

zen-url-snippets-remove =
    .label = Remove

zen-url-snippets-shortcut-input =
    .placeholder = yt

zen-url-snippets-url-input =
    .placeholder = https://youtube.com

zen-performance-section-title = Performance and effects

zen-performance-header = Performance and effects

zen-performance-description = Turn off motion and effects you do not use. Idle tabs unload in the background after the time below. Use 0 to keep every tab loaded.

zen-performance-space-switch =
    .label = Animate switching spaces

zen-performance-download-animation =
    .label = Download animation

zen-performance-grey-out-inactive =
    .label = Grey out inactive windows

zen-performance-haptics =
    .label = Haptic feedback

zen-performance-essentials-favicon =
    .label = Background behind essential icons

zen-tab-unloader-minutes-label = Unload idle tabs after

zen-tab-unloader-minutes-description = Minutes. Pinned tabs, essentials, the tab you are viewing, and tabs playing sound stay loaded.

peppermint-tab-archive-hours-label = Archive idle tabs after

peppermint-tab-archive-hours-description = Hours. Archived tabs can be opened again from the tab archive. Pinned tabs, essentials, folders, split views and tabs playing sound are never archived. 0 turns it off.

zen-underpowered-auto-header = Underpowered Mode

zen-underpowered-auto-resources =
    .label = Turn on automatically when CPU or RAM use is very high

zen-underpowered-auto-resources-description = Starts when CPU or RAM use reaches 90% and stays there. Turns itself off again once both have stayed under 90% for 30 seconds. A session you started yourself is never turned off.

zen-underpowered-auto-battery =
    .label = Turn on automatically when the battery is low

zen-underpowered-auto-battery-description = Starts when the battery is below { $percent }% and not charging. Turns itself off when you plug in. A session you started yourself is never turned off.

zen-underpowered-when-unplugged =
    .label = Also turn on whenever the battery is not charging

zen-underpowered-battery-threshold-label = Battery counts as low below (%)

zen-underpowered-resource-threshold-label = CPU or memory load counts as heavy at (%)

zen-underpowered-grace-label = Freeze a background tab after (seconds)

zen-underpowered-never-freeze-label = Never freeze these sites

zen-underpowered-never-freeze-description = One site per line, for example mail.example.com. Tabs on these sites, and their subdomains, keep running in Underpowered Mode.

zen-underpowered-status-off = Underpowered Mode is off.

# $count (Number) - how many background tabs are frozen right now.
zen-underpowered-status-on = Underpowered Mode is on. { $count ->
        [one] 1 background tab is frozen.
       *[other] { $count } background tabs are frozen.
    }

zen-janitor-section-title = Peppermint Janitor

zen-janitor-header = Free up disk space on launch

zen-janitor-description = Every time { -brand-short-name } starts, the Janitor clears files that nothing has used for 72 hours. Your documents, downloads and browser data are never touched.

zen-janitor-enabled =
    .label = Clean automatically

zen-janitor-schedule-label = Clean

zen-janitor-schedule-startup =
    .label = On every launch

zen-janitor-schedule-daily =
    .label = Once a day

zen-janitor-schedule-weekly =
    .label = Once a week

zen-janitor-clean-header = What to clean

zen-janitor-clean-temp =
    .label = Temporary files

zen-janitor-clean-traces =
    .label = Usage traces (crash reports, old logs, recent item lists)

zen-janitor-clean-updates =
    .label = Leftover update files

zen-janitor-clean-caches =
    .label = App caches not used in the last 72 hours

zen-janitor-clean-recycle-bin =
    .label = { PLATFORM() ->
        [windows] Empty the recycle bin
       *[other] Empty the Trash
    }

zen-janitor-recycle-bin-description = { PLATFORM() ->
    [windows] Files in the recycle bin cannot be restored afterwards. Off by default.
   *[other] Files in the Trash cannot be restored afterwards. Off by default.
}

zen-janitor-notifications =
    .label = Show a notification for every location that was cleaned

zen-janitor-clean-now =
    .label = Clean now

# $date (String) - when the Janitor last ran, for example "Oct 18, 2026, 3:04 PM".
# $size (String) - the space it freed, for example "1.4 GB".
zen-janitor-last-run = Last cleaned { $date }: { $size } freed.

zen-janitor-never-run = The Janitor has not cleaned anything yet.

# $size (String) - the space freed in total, for example "12.3 GB".
# $count (Number) - how many cleanings that adds up.
zen-janitor-totals = { $count ->
    [one] { $size } freed in { $count } cleaning.
   *[other] { $size } freed in { $count } cleanings.
}

## Peppermint Vault, in the password settings

peppermint-vault-settings-set-up =
    .label = Set up Peppermint Vault
    .description = Protect your saved passwords with a Primary Password and an automatic lock.

peppermint-vault-settings-open =
    .label = Open Peppermint Vault
    .description = Vault is on. The Primary Password cannot be turned off while it is on.

sync-currently-syncing-notes = Notes

sync-engine-notes =
    .label = Notes
    .tooltiptext = Sync your notes across devices
    .accesskey = N

pane-zen-ghost-mode-title = Ghost Mode

category-zen-ghost-mode =
    .tooltiptext = { pane-zen-ghost-mode-title }

zen-ghost-mode-section-title = Ghost Mode

zen-ghost-mode-header = Ghost windows

zen-ghost-mode-description = A Ghost window does not keep your history, cookies or site data once the last Ghost window is closed.

zen-ghost-mode-delete-downloads =
    .label = Delete files downloaded in Ghost windows when they close

zen-ghost-mode-delete-downloads-description = Only files that finished downloading in a Ghost window are removed, and only if you have not changed them. Off by default, so downloads stay on disk.

zen-ghost-mode-search-suggestions =
    .label = Show search suggestions in Ghost windows

zen-ghost-mode-search-suggestions-description = Suggestions send what you type to your search engine while you type. Off by default in Ghost windows.

zen-ghost-mode-resist-fingerprinting =
    .label = Resist fingerprinting in Ghost windows

zen-ghost-mode-resist-fingerprinting-description = Makes your browser look the same as other browsers to websites. Some sites may show the wrong time zone or window size, or break.

zen-ghost-mode-protects-header = What Ghost windows protect

zen-ghost-mode-protects-history = Browsing history, cookies, cache, form data and site storage are erased when the last Ghost window closes, and Ghost tabs are never restored after a restart.

zen-ghost-mode-protects-tracking = Trackers, cross-site cookies and known tracking parameters in links are blocked, and { -brand-short-name } sends a Global Privacy Control signal.

zen-ghost-mode-protects-notepad = Notepad does not save notes written in a Ghost window, and Reader does not save articles for offline reading from one.

zen-ghost-mode-limits-header = What they do not protect

zen-ghost-mode-limits-network = Your network provider, your employer and the sites you visit can still see your connection. A Ghost window does not hide your IP address.

zen-ghost-mode-limits-downloads = Downloaded files and bookmarks you save stay on disk unless you remove them.

zen-ghost-mode-limits-extensions = Extensions only run in Ghost windows if you allow them to.

peppermint-about-heading =
    .label = About
    .description = { -brand-short-name } is a Firefox-based browser built around speed, privacy and a calm workspace. Your data stays on your computer unless you turn on sync or choose a service that needs the network.

peppermint-about-logo =
    .alt = MintFlow

peppermint-about-developer = Developed by MintFlow Technologies

peppermint-about-lead = Lead developer: Luca Montanari

peppermint-about-link = mintflow.dev

# $version (String) - the { -brand-short-name } version, such as 2026.0.2.
peppermint-about-version = { -brand-short-name } { $version }

peppermint-tabs-confirm-close-button =
    .label = Ask for confirmation when closing a tab through the close button

peppermint-tabs-confirm-close-middle-click =
    .label = Also ask for confirmation when closing a tab with middle click

peppermint-tabs-islands =
    .label = Group tabs opened from a tab into an island

## Peppermint features pane. One name, description and keywords message per
## entry of src/peppermint/features/PeppermintFeatures.sys.mjs. Keywords are
## extra words Settings search matches; they are never shown.

pane-zen-peppermint-title = Peppermint Features

category-zen-peppermint =
    .tooltiptext = { pane-zen-peppermint-title }

peppermint-features-section-title = Peppermint Features
peppermint-features-category-privacy = Privacy
peppermint-features-category-tabs = Tabs
peppermint-features-category-address-bar = Address Bar
peppermint-features-category-tools = Tools
peppermint-features-category-system = System

peppermint-features-open =
    .label = Open
peppermint-features-options =
    .label = Options
# Marks a feature added since the pane was last opened.
peppermint-features-new = New

peppermint-feature-ad-blocker = Ad Blocker
peppermint-feature-ad-blocker-description = Blocks ads and trackers with the blocker you pick.
peppermint-feature-ad-blocker-keywords = ads, advertising, ublock, adguard, trackers, block

peppermint-feature-cookie-banner-blocker = Cookie Banner Blocker
peppermint-feature-cookie-banner-blocker-description = Answers cookie consent banners for you, refusing what it can.
peppermint-feature-cookie-banner-blocker-keywords = cookies, consent, gdpr, popup, banner

peppermint-feature-tracking-parameter-removal = Tracking Parameter Removal
peppermint-feature-tracking-parameter-removal-description = Strips tracking codes such as utm_source and fbclid from links you open.
peppermint-feature-tracking-parameter-removal-keywords = clean links, utm, fbclid, query stripping, url

peppermint-feature-clean-links = Clean Links
peppermint-feature-clean-links-description = Skips click trackers and AMP pages and goes straight to where a link leads.
peppermint-feature-clean-links-keywords = redirect, click tracking, amp, outbound links, google url, unwrap

peppermint-feature-site-privacy = Site Privacy and Forget This Site
peppermint-feature-site-privacy-description = Shows blocked trackers and stored data in the site panel, and forgets a site in two clicks.
peppermint-feature-site-privacy-keywords = cookies, storage, site data, clear, delete, forget, trackers, identity

peppermint-feature-lookalike-warning = Lookalike Site Warning
peppermint-feature-lookalike-warning-description = Warns you when a site you have never visited uses a name made to look like a popular one.
peppermint-feature-lookalike-warning-keywords = phishing, scam, fake, typo, punycode, homograph, impersonation

peppermint-feature-permission-auto-revoke = Unused Permission Removal
peppermint-feature-permission-auto-revoke-description = Takes back camera, microphone, location and notification access from sites you have not visited in 90 days.
peppermint-feature-permission-auto-revoke-keywords = camera, microphone, location, notifications, revoke, expire, permissions

peppermint-feature-fingerprinting-protection = Fingerprinting Protection
peppermint-feature-fingerprinting-protection-description = Makes it harder for sites to recognize your device without cookies.
peppermint-feature-fingerprinting-protection-keywords = fingerprint, tracking, canvas, identify

peppermint-feature-ghost-mode = Ghost Mode
peppermint-feature-ghost-mode-description = Private windows that leave no history and can delete their downloads.
peppermint-feature-ghost-mode-keywords = private, incognito, private browsing

peppermint-feature-vault = Vault
peppermint-feature-vault-description = Passwords, two-factor codes and site permissions behind one lock.
peppermint-feature-vault-keywords = passwords, logins, 2fa, totp, authenticator, permissions

peppermint-feature-tab-islands = Tab Islands
peppermint-feature-tab-islands-description = Groups a tab with the tabs opened from it.
peppermint-feature-tab-islands-keywords = groups, tree, related tabs

peppermint-feature-tab-archive = Tab Archive
peppermint-feature-tab-archive-description = Archives tabs you have not used for a while and lets you snooze tabs.
peppermint-feature-tab-archive-keywords = snooze, old tabs, inactive, later

peppermint-feature-tab-unloader = Tab Unloader
peppermint-feature-tab-unloader-description = Frees memory by unloading tabs left idle in the background.
peppermint-feature-tab-unloader-keywords = memory, ram, sleep, discard, performance

peppermint-feature-undo-close = Undo Close
peppermint-feature-undo-close-description = After tabs close, a toast lets you reopen them with one click.
peppermint-feature-undo-close-keywords = reopen, restore, closed tabs, undo, mistake

peppermint-feature-tab-close-confirm = Close Confirmation
peppermint-feature-tab-close-confirm-description = Asks before a tab closes from its close button.
peppermint-feature-tab-close-confirm-keywords = confirm, warning, accidental close

peppermint-feature-tab-numbers = Tab Numbers
peppermint-feature-tab-numbers-description = Hold the tab shortcut modifier to see the number that selects each tab.
peppermint-feature-tab-numbers-keywords = switch tabs, numbers, keyboard

peppermint-feature-tab-search = Tab Search
peppermint-feature-tab-search-description = Finds open tabs by title and address from the address bar.
peppermint-feature-tab-search-keywords = find tab, switch to tab, open tabs

peppermint-feature-popular-sites = Popular Site Suggestions
peppermint-feature-popular-sites-description = Completes the address of well known sites as you type, without a network request.
peppermint-feature-popular-sites-keywords = autocomplete, domains, suggestions

peppermint-feature-omni-utils = Address Bar Tools
peppermint-feature-omni-utils-description = Decodes JWTs, converts timestamps and previews colors right in the address bar.
peppermint-feature-omni-utils-keywords = developer, jwt, timestamp, color, base64, hash, uuid, json

peppermint-feature-url-snippets = URL Snippets
peppermint-feature-url-snippets-description = Short keywords that open a search or page, such as "yt" for YouTube.
peppermint-feature-url-snippets-keywords = keywords, bangs, shortcuts, search engines

peppermint-feature-notepad = Notepad
peppermint-feature-notepad-description = Encrypted Markdown notes, on their own or about the page you are on.
peppermint-feature-notepad-keywords = notes, markdown, write, memo

peppermint-feature-reader = Reader and Saved Articles
peppermint-feature-reader-description = Reads articles without clutter and saves them for offline reading.
peppermint-feature-reader-keywords = read later, offline, article, reader view, saved

peppermint-feature-screenshot-editor = Screenshot Editor
peppermint-feature-screenshot-editor-description = Adds arrows, boxes, text and redaction to screenshots before you save them.
peppermint-feature-screenshot-editor-keywords = capture, annotate, markup, image

peppermint-feature-shortcut-sheet = Keyboard Shortcut Sheet
peppermint-feature-shortcut-sheet-description = Every keyboard shortcut in one searchable sheet. Open lets you change them.
peppermint-feature-shortcut-sheet-keywords = keys, hotkeys, keybindings, cheat sheet, help

peppermint-feature-report = Peppermint Report
peppermint-feature-report-description = What Peppermint blocked, unloaded and archived for you this week, month or year.
peppermint-feature-report-keywords = statistics, stats, summary, blocked trackers

peppermint-feature-homepage = Homepage
peppermint-feature-homepage-description = A new tab page with your top sites, a clock and your report.
peppermint-feature-homepage-keywords = new tab, start page, dashboard

peppermint-feature-janitor = Janitor
peppermint-feature-janitor-description = Clears old temporary files and caches on launch to free disk space.
peppermint-feature-janitor-keywords = disk space, cleanup, cache, storage, trash

peppermint-feature-underpowered = Underpowered Mode
peppermint-feature-underpowered-description = Freezes background tabs while the computer is struggling.
peppermint-feature-underpowered-keywords = battery, slow, cpu, performance, power saving

peppermint-feature-startup-doctor = Startup Doctor
peppermint-feature-startup-doctor-description = Times each launch and shows in the report what slows startup down, with a fix for each cause.
peppermint-feature-startup-doctor-keywords = startup, launch, slow, speed, performance, extensions, mods

peppermint-feature-updater = Automatic Updates
peppermint-feature-updater-description = Checks for new Peppermint versions and installs them when you restart.
peppermint-feature-updater-keywords = update, version, upgrade
