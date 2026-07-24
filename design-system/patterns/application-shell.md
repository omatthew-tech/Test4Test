# Application shell

Use a full-width shell with centered content and a top navigation on large screens. At small widths, preserve the same navigation order in an accessible drawer. The page title is the single `h1`; route content begins after a skip link and landmark-aware header.

Compose route chrome with `ApplicationShell`, `TopNavigation`, `MobileNavigationDrawer`,
`Container`, and `PageHeader`. Keep member and guest navigation order stable across breakpoints.
The mobile trigger has a persistent accessible name, the drawer is modal while open, Escape closes
it, and focus returns to the trigger. Route content must not create a second `h1`.

Marketing routes may add the product footer after the main landmark. Authenticated routes preserve
the same shell while substituting member navigation; route URLs and navigation order remain product
contracts rather than styling choices.
