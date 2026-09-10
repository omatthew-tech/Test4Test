# Navigation width alignment

The shared navigation row now uses the existing 960 px semantic data-width cap and centered
margins. On Earn, the logo aligns with the left edge of the cards and the profile trigger aligns
with their right edge. The header background remains full width; smaller viewports retain the
existing page gutters and navigation drawer.

Inspected at 1440 × 900 and 390 × 844, including the open mobile profile dropdown:

- [Desktop](navigation-width-desktop.png)
- [Mobile](navigation-width-mobile.png)

Formatting and design-system invariant checks passed. All four targeted Earn accessibility
checks passed, including narrow reflow, text enlargement, forced colors, and reduced motion.
The four existing Earn screenshot comparisons differ from the reference images; references
were not updated. See [targeted visual results](navigation-width-visual-check.log).

Status: **Fast-checked**. The full gate passed formatting, lint (19 existing warnings), TypeScript,
design-system validation, 65 unit tests, 71 component tests, and 174 route tests. It stopped at the
same three existing homepage heading assertion failures. Full shared-component release validation
is recorded in [the release log](navigation-width-release-check.log).
