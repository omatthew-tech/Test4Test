# Test4Test design system

This directory is the authoritative source for Test4Test interface design and implementation. The supplied human specification is preserved in [specification.md](specification.md); machine-readable tokens, contracts, and the component catalog are the enforceable runtime contract.

## Start here

1. Read [specification.md](specification.md).
2. Use only exports from `@test4test/design-system`.
3. Choose semantic tokens from [tokens/source/tokens.json](tokens/source/tokens.json).
4. Check [components/catalog.json](components/catalog.json) before creating a component.
5. Follow the repository skill at `../.agents/skills/test4test-design-system/`.
6. Run `npm run ds:check` before handing off interface work.

Generated files live in `tokens/generated/` and generated component folders. Never edit them manually; run `npm run ds:generate`.

The `@test4test/design-system` barrel is the only supported consumer import. Importing it also installs the generated tokens, self-hosted fonts, reset, base typography, focus behavior, and accessibility utilities. Application and Storybook consumers must not import `components/`, `tokens/`, or `styles/` internals directly.

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

The user is the design-system owner. Test4Test Design System `1.0.0` is internal and repository-local. Publishing, Git tags, breaking token changes, and external deployment require explicit approval. See [CHANGELOG.md](CHANGELOG.md) and [provenance.json](provenance.json).
