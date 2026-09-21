# Application shell

Use a full-width shell with centered content and a top navigation on large screens. At small widths, preserve the same navigation order in a compact dropdown beneath the header. The page title is the single `h1`; route content begins after a skip link and landmark-aware header.

Center the navigation row within the page gutters and cap it at the semantic data width, matching
the Earn content edges. Keep the header background full width and the mobile controls within the
same responsive gutters.

Compose route chrome with `ApplicationShell`, `TopNavigation`, `Container`, and `PageHeader`.
Keep member and guest navigation order stable across breakpoints. The mobile trigger announces
Open navigation or Close navigation and exposes its expanded state and controlled panel.
This is a non-modal disclosure: Tab follows document order, ArrowDown opens and focuses the first
link, and Escape closes and restores trigger focus. Outside clicks, focus leaving the header,
navigation, and resizing to desktop dismiss it. Route content must not create a second `h1`.

Marketing routes may add the product footer after the main landmark. Authenticated routes preserve
the same shell while substituting member navigation; route URLs and navigation order remain product
contracts rather than styling choices.

Signed-in founder navigation contains Earn, Share, and Analyze. Tester navigation contains Earn.
Messages belongs in the account dropdown and includes the total unread message count when positive.
Both account types can open the private inbox and conversation routes. Secondary account destinations
belong in the profile dropdown: Profile, a separator, Messages, My reviews, New app, then another separator
and Sign out. Tester accounts retain a dropdown with Profile, Messages, and a separated Sign out
action. Sign out belongs in this menu rather than in the Profile page content. Use `Menu` with an `IconButton` trigger named "Profile
menu" and an outlined Lucide user icon; do not show initials or personal images.

On desktop the profile dropdown aligns to the end of its trigger. On mobile, pass the same
destinations and sign-out action through `TopNavigation.mobileAccountItems` to render a separate
Account navigation group directly below the primary links. Preserve New app and My reviews for
founders and omit them for testers. Optional `NavigationItem.icon` values appear only on mobile.
Guest Sign in and Get started actions share an equal-width row beneath a divider. The panel uses
semantic surface, border, radius, shadow, spacing, and typography tokens, with a viewport-limited
scroll area for short screens and enlarged text. No modal focus trap or background scrim is used.
The existing `mobileActions(closeNavigation)` slot remains available for custom actions, and its
content unmounts on dismissal. `MobileNavigationDrawer` remains available as a separate modal
component, but is not the default shell navigation.

Opening the menu by clicking the profile icon does not highlight a row. Row backgrounds change
only on hover; keyboard focus retains the design-system outline. Sign out uses the existing
account action and redirects founders home and testers to the tester landing page.
