# Application shell

Use a full-width shell with centered content and a top navigation on large screens. At small widths, preserve the same navigation order in an accessible drawer. The page title is the single `h1`; route content begins after a skip link and landmark-aware header.

Center the navigation row within the page gutters and cap it at the semantic data width, matching
the Earn content edges. Keep the header background full width and the mobile controls within the
same responsive gutters.

Compose route chrome with `ApplicationShell`, `TopNavigation`, `MobileNavigationDrawer`,
`Container`, and `PageHeader`. Keep member and guest navigation order stable across breakpoints.
The mobile trigger has a persistent accessible name, the drawer is modal while open, Escape closes
it, and focus returns to the trigger. Route content must not create a second `h1`.

Marketing routes may add the product footer after the main landmark. Authenticated routes preserve
the same shell while substituting member navigation; route URLs and navigation order remain product
contracts rather than styling choices.

Signed-in founder navigation contains Earn, Share, and Analytics. Secondary account destinations
belong in the profile dropdown: Profile, a separator, New app, My reviews, then another separator
and Sign out. Tester accounts retain Earn and a dropdown with Profile and a separated Sign out
action. Sign out belongs in this menu rather than in the Profile page content. Use `Menu` with an `IconButton` trigger named "Profile
menu" and an outlined Lucide user icon; do not show initials or personal images.

On desktop the dropdown aligns to the end of its trigger. On mobile it appears inside the
navigation drawer and aligns to the start. Supply `TopNavigation.mobileActions(closeNavigation)`
to close the drawer after selecting an account destination, including the current route. This
content is unmounted when the drawer closes. Key the menu by route and account identity so it
also resets on navigation. The first Escape dismisses the dropdown and restores focus to its
trigger; a second Escape dismisses the drawer.

Opening the menu by clicking the profile icon does not highlight a row. Row backgrounds change
only on hover; keyboard focus retains the design-system outline. Sign out uses the existing
account action and redirects founders home and testers to the tester landing page.
