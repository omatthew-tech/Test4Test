# 0002: Use a repository-local React design system

- Status: accepted
- Date: 2026-07-23
- Owner: Test4Test

The runtime uses TypeScript, CSS Modules, and a single `@test4test/design-system` public barrel. Source tokens generate CSS custom properties and typed TypeScript exports. Components consume semantic aliases, while application code consumes component props and layout primitives. The system is internal rather than a separately published package.
