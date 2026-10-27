# Stage 5: Initial Zoom Out review

Date: 2026-10-26 (America/New_York)

## Outcome

Two Major findings; no Blockers. The objective is understandable, and the repository-local React, token, contract, and Storybook architecture fits the project. Two instructions conflict with the shared solutions and workflows already in use.

This stage is complete. The interactive review is awaiting the Stage 6 checkpoint; later stages have not run. No changes to the specification or implementation were made.

## Scope and method

- Target: [design-system/specification.md](C:/Projects/Test4Test-Redesign/design-system/specification.md), all 703 lines.
- Additional context: the entire `C:/Projects/Test4Test-Redesign/design-system/` folder was available to the reviewer and inventoried. The evidence manifest below identifies actual reads.
- Preset: interactive review with a checkpoint after each stage.
- FeatureRange: lines 1–703. DetailedRange: N/A. Section 17 is an adoption roadmap, not a separate detailed implementation plan. Stages 5–8 apply to this specification; Stage 9 requires a concrete implementation plan.
- Reviewer: `/root/egm_stage5_zoom_out`, launched through the native subagent tool with `fork_turns: "none"`. The reviewer read the persona, standard, and complete target before returning its completed review. The orchestrator checked the cited navigation and validation evidence before writing this report.
- Standard: [zoom-out-standard.md](C:/Users/matth/.codex/plugins/cache/egm/egm/0.1.0/resources/document_standards/zoom-out-standard.md).
- Persona: [zoom_out.md](C:/Users/matth/.codex/plugins/cache/egm/egm/0.1.0/agents/zoom_out.md).
- Repository HEAD at intake: `055fb0ecf0856be4cd01db9d7ebb88ef64c8e385`. Existing unrelated working-tree changes were present, so HEAD alone does not describe the entire reviewed workspace.
- Target SHA-256 at intake: `4b31bf28d67e82bfa7e4efea53dc88a5b4e9071ecde1d36c6e5f6f0bef8b84e7`, matching the recorded specification provenance.

## ZO-01 — Major: Mobile-navigation guidance would replace an existing shared solution

**Affected scope:** Section 6, [specification.md:489](C:/Projects/Test4Test-Redesign/design-system/specification.md:489).

The specification says authenticated navigation collapses into a mobile navigation drawer. The current shared shell deliberately uses a non-modal disclosure below the header. Its contract preserves normal tab order, closes when focus leaves the header, and restores trigger focus on Escape. `MobileNavigationDrawer` remains a separate optional modal component.

**Verified evidence:**

- [application-shell.md:12](C:/Projects/Test4Test-Redesign/design-system/patterns/application-shell.md:12), lines 12–14, defines the non-modal interaction. Lines 28–37 explicitly distinguish the default shell disclosure from the optional modal drawer.
- [top-navigation/contract.json:9](C:/Projects/Test4Test-Redesign/design-system/components/top-navigation/contract.json:9), lines 9–21, specifies the same semantics and keyboard behavior.
- [navigation.tsx:77](C:/Projects/Test4Test-Redesign/design-system/components/navigation.tsx:77), lines 77–115 and 164–187, implements the disclosure.
- [Layout.tsx:262](C:/Projects/Test4Test-Redesign/src/components/Layout.tsx:262), lines 262–266, shows the application shell using `TopNavigation`.

**Why it matters:** Following the higher-level specification literally would introduce modal behavior and focus containment where the existing shared component already solves the navigation requirement. That adds work, risks a multi-route behavior regression, and leaves competing instructions for future changes.

**Minimal remedy:** Update line 489 to describe the existing `TopNavigation` mobile disclosure and link the application-shell pattern. Keep `MobileNavigationDrawer` available for deliberately modal use cases. This remedy aligns the documentation with the existing implementation; it does not require a new component.

## ZO-02 — Major: Universal validation requirements bypass the established risk tiers

**Affected scope:** Section 13, [specification.md:621](C:/Projects/Test4Test-Redesign/design-system/specification.md:621), lines 621–622.

These lines require every UI change to run formatting, lint, type checking, unit tests, accessibility checks, and builds, plus inspection at both viewports. That includes content-only changes and single-token substitutions, despite the repository's explicit risk tiers.

**Verified evidence:**

- [AGENTS.md:18](C:/Projects/Test4Test-Redesign/AGENTS.md:18), lines 18–22, requires fast checks for Tier 0–1, targeted checks during iteration, and the full gate under the listed Tier 3 and finalization conditions. Two-viewport inspection applies when layout can reflow.
- [design-system/README.md:35](C:/Projects/Test4Test-Redesign/design-system/README.md:35), lines 35–44, documents fast, route, story, and release lanes.
- [package.json:28](C:/Projects/Test4Test-Redesign/package.json:28), lines 28–34, exposes those commands.
- [check-ui-change.mjs:106](C:/Projects/Test4Test-Redesign/scripts/check-ui-change.mjs:106), lines 106–120, implements changed-file checks. Lines 123–158 implement targeted route and Storybook verification.

**Why it matters:** The universal rule makes routine edits invoke release-scale work and duplicates an implemented, more precise policy. Agents receive conflicting instructions about sufficient validation. Repository instructions take precedence, but the specification should describe that workflow consistently.

**Minimal remedy:** Replace the universal statements with a reference to `AGENTS.md`'s tiers: fast checks for Tier 0–1, targeted checks for Tier 2 and iteration, and full validation for Tier 3 and the listed finalization conditions. Tie the two-viewport requirement to layout reflow.

## Reuse and architectural assessment

Code searches confirmed existing implementations for all seven foundation families in Section 12, together with product-specific components. The reviewer found no verified need for another framework, component layer, token pipeline, or validation mechanism.

The numerical foundation tables are appropriate specification detail. Their presence alone is not premature implementation detail. The review found enough context to understand the root goal: help agents build consistent, accessible interfaces using repository-defined components and tokens.

## Evidence manifest

The reviewer reported complete reads of the following:

- The EGM persona and standard linked above, and all 703 lines of the target.
- Root `AGENTS.md`, `README.md`, and `usability_platform_product_plan.md`.
- `design-system/README.md`.
- All nine files under `design-system/foundations/`.
- All four files under `design-system/patterns/`.
- All five files under `design-system/decisions/`.
- All four schemas under `design-system/contracts/`.
- `design-system/CHANGELOG.md`, `MASTER-PARITY-AUDIT.md`, `exceptions.json`, `provenance.json`, and `index.ts`.
- `design-system/styles/base.css`, `visual-baselines/README.md`, and `examples/page-composition.md`.
- `design-system/tokens/schema/tokens.schema.json`.
- `design-system/tokens/generated/manifest.json`, `breakpoints.ts`, `tokens.css`, and `tokens.ts`.
- Guides and contracts under `design-system/components/top-navigation/` and `design-system/components/mobile-navigation-drawer/`.
- `design-system/components/navigation.tsx`.
- Root `package.json` and `scripts/check-ui-change.mjs`.
- `.agents/skills/test4test-design-system/SKILL.md` and its `references/review-checklist.md`.

Structured or partial reads:

- `design-system/tokens/source/tokens.json`: complete metadata and flattened token entries, including types, values, descriptions, and extensions.
- `design-system/components/catalog.json`: all 54 records' identity, source, export, lifecycle, story, sizes, variants, states, and dependencies. Detailed navigation semantics were inspected through the two navigation contracts.
- `src/components/Layout.tsx`: shell composition at lines 245–275.
- `scripts/validate-design-system.mjs`: validation and specification-provenance searches.
- `design-system/stories/Navigation.stories.tsx`: component usage and registered-example searches.
- Other component implementations: searches for actual exports; complete implementation bodies were not audited.

No required file was missing. Initial truncated outputs were followed by narrower reads where needed. The directory was available as general context; this report does not claim a line-by-line audit of every file in it.

## Limits and next checkpoint

This was a static architectural document review. No builds, tests, accessibility checks, or visual comparisons were run. It is not a runtime conformance or release-validation result. No dependencies were installed, visual baselines changed, or other reviewers consulted by the Goldfish.

Choose the next action: continue to Stage 6 (Comprehension Test), update the specification before one Stage 5 re-audit, or pause the review. Changes to the reviewed document require recalculating line ranges and recording the new snapshot.
