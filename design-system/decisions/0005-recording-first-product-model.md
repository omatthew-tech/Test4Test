# 0005: Adopt the recording-first product model

- Status: accepted
- Date: 2026-08-17
- Owner: Test4Test

## Decision

The canonical product is the recording-first model in [`../../usability_platform_product_plan.md`](../../usability_platform_product_plan.md). New tests contain 1–5 owner-authored tasks and require a screen-and-voice recording. Questionnaire-first creation, AI-generated questions, written follow-up, face ratings, starter credits, and AI recruitment claims are not requirements for the redesign.

This decision supersedes the product-behavior preservation sentence in [0001](0001-adopt-test4test-design-system.md) when it conflicts with the recording-first specification. Decision 0001 remains authoritative for the design-system adoption, visual language, tokens, component contracts, and migration discipline.

## Consequences

- Product behavior may change deliberately to implement the recording-first specification while routes and data are migrated safely.
- Existing question and answer records remain readable during a compatibility period, but are non-canonical for new tests.
- Transcript review, annotations, improvement priorities, clips, context-filtered AI chat, star ratings, and managed tester packages require future implementation.
- Historical parity and release documents remain evidence of the v1 redesign state, not current product requirements.
- No interface or schema change is implied by this documentation decision; implementation and production cutover require separate approval and the specification’s launch gates.
