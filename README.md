# Test4Test documentation index

Test4Test is being redesigned as a recording-first usability-testing product. This index defines which repository documents are authoritative. When documents disagree, use the highest authority listed below.

## 1. Canonical product authority

- [Recording-first product specification](usability_platform_product_plan.md) — current product model, roles, flows, privacy, retention, conceptual contracts, migration requirements, gaps, and launch gates.
- [Recording-first product decision](design-system/decisions/0005-recording-first-product-model.md) — supersedes the earlier constraint to preserve v1 product behavior during the redesign.

These documents describe the intended product. They do not claim that every feature is implemented or that this branch is deployed to Test4Test.io.

## 2. Interface authority

- [Design system start page](design-system/README.md)
- [Design system specification](design-system/specification.md)
- [Recording-first product workflows](design-system/patterns/product-workflows.md)
- [Component catalog](design-system/components/catalog.json)

The design system controls interface implementation, accessibility, tokens, and reusable components. The product specification controls business behavior and information architecture.

## 3. Operational guidance

- [Supabase operations](supabase/README.md) — migrations are the authoritative database setup path.
- [Video processor](services/video-processor/README.md) — current worker behavior and the incomplete transcript integration.
- [Cloudflare deployment and production cutover](cloudflare-pages-setup.txt) — gated preview-to-production process.

## 4. Historical evidence

- [Master parity audit](design-system/MASTER-PARITY-AUDIT.md)
- [Design-system release audit](design-system/foundations/release-audit.md)
- [Accessibility release evidence](design-system/foundations/release-evidence.md)

These files preserve v1 and design-system replacement evidence. They are not current product requirements when they conflict with the recording-first specification.

## Current phase boundary

The recording-first baseline is documentation only. It does not authorize interface changes, database migrations, production writes, branch promotion, or a Test4Test.io cutover. Those actions require the launch gates in the product specification to be satisfied and separately approved.
