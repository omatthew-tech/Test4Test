# Stepper

Ordered workflow progress with current-step text.

- Family: product
- Lifecycle: stable
- Version: 1.0.0
- Public export: `Stepper`
- Source: `design-system/components/product.tsx`
- Story: `design-system/stories/Product.stories.tsx#StepperContract`
- Control mode: controlled

## Public API

- Sizes: `responsive`
- Variants: `ordered-progress`
- States: `upcoming`, `current`, `complete`, `long-label`
- Accessible name: Progress list label and visible step names; current step uses aria-current.

## Accessibility contract

- Ordered list
- Current step uses aria-current

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Product.stories.tsx#StepperContract`
