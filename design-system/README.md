## Start here

Product behavior is governed by the root [recording-first product specification](../usability_platform_product_plan.md) and [decision 0005](decisions/0005-recording-first-product-model.md). The design-system specification remains authoritative for interface foundations, tokens, components, and accessibility.

Historical parity documents describe the v1 replacement and do not override the recording-first product model.

1. Read [specification.md](specification.md).
2. Use only exports from `@test4test/design-system`.
3. Choose semantic tokens from [tokens/source/tokens.json](tokens/source/tokens.json).
4. Check [components/catalog.json](components/catalog.json) before creating a component.
5. Follow the risk tiers in [`AGENTS.md`](../AGENTS.md).
6. For Tier 2–3 work, follow the repository skill at `../.agents/skills/test4test-design-system/`.
7. Use fast or targeted checks while iterating; run `npm run ds:check` for Tier 3 and final release validation.

Generated files live in `tokens/generated/` and generated component folders. Never edit them manually; run `npm run ds:generate`.

The `@test4test/design-system` barrel is the only supported consumer import. Importing it also installs the generated tokens, self-hosted fonts, reset, base typography, focus behavior, and accessibility utilities. Application and Storybook consumers must not import `components/`, `tokens/`, or `styles/` internals directly.

## Validation lanes

- `npm run ds:check:fast -- <files...>` checks changed files and design-system invariants for Tier 0–1 work.
- `npm run ds:check:route -- <route-name>` checks one canonical application route.
- `npm run ds:check:story -- <story-id>` checks one Storybook story.
- `npm run ds:visual:update:route -- <route-name>` updates one accepted route baseline set.
- `npm run ds:visual:update:story -- <story-id>` updates one accepted Storybook baseline set.
- `npm run ds:check` remains the complete release gate.

During visual iteration, inspect the targeted UI without rewriting baselines. After the design-system owner accepts an intentional change, update only the affected route or story baselines and run the release gate once when the batch is final.

The release requirement-to-evidence matrix is maintained in
[foundations/release-audit.md](foundations/release-audit.md). Human assistive-technology sign-off
remains separate from automated conformance evidence.

## Directory map

- `foundations/`: concise implementation guidance for visual, responsive, content, and accessibility foundations.
- `tokens/`: DTCG 2025.10 source tokens, schema, and generated CSS/TypeScript.
- `components/`: component catalog plus generated human and machine contracts.
- `patterns/`: approved product compositions and state behavior.
- `contracts/`: JSON Schemas used by validation.
- `decisions/`: short design decision records.
- `examples/`: cross-component implementation examples.
- `visual-baselines/`: visual-regression policy and tracked reference images.

## Ownership and releases

Test4Test Design System `1.0.0` is internal and repository-local. Publishing, Git tags, breaking token changes, and external deployment require explicit approval. See [CHANGELOG.md](CHANGELOG.md) and [provenance.json](provenance.json).
