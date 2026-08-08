# Stepper

Ordered workflow progress with labeled and numbers-only presentations.

- Family: product
- Lifecycle: stable
- Version: 1.0.0
- Public export: `Stepper`
- Source: `design-system/components/product.tsx`
- Story: `design-system/stories/Product.stories.tsx#StepperContract`
- Control mode: controlled

## Public API

- Sizes: `responsive`
- Variants: `labeled`, `numbers-only`
- States: `upcoming`, `current`, `complete`, `long-label`
- Accessible name: Progress list label and step names; the numbers-only presentation keeps names available to assistive technology.

## Accessibility contract

- Ordered list
- Current step uses aria-current
- Numbers-only presentation visually hides step names without removing them from the accessibility tree

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Product.stories.tsx#StepperContract`
