# Earn test card

Responsive Earn listing card with badges, an explicit action, and optional reputation context. Set expandableDescription (default false) to preview descriptions in two lines and expand overflowing text in place. Collapsed descriptions retain plain text styling on hover and press, with a muted more label after the ellipsis and a visible keyboard focus ring.

- Family: product
- Lifecycle: stable
- Version: 1.0.0
- Public export: `EarnTestCard`
- Source: `design-system/components/product.tsx`
- Story: `design-system/stories/Product.stories.tsx#EarnTestCardContract`
- Control mode: uncontrolled

## Public API

- Sizes: `responsive`
- Variants: `with-action`, `without-action`, `with-reputation`, `expandable-description`
- States: `default`, `long-content`, `narrow-width`, `supporting-note`, `collapsed`, `expanded`, `short-description`, `two-line-description`
- Accessible name: A visible heading names the card and the action has visible link text. Description disclosure buttons are named by their action and card heading.

## Accessibility contract

- Article or section
- Visible heading names the card
- Overflowing descriptions use a button with aria-expanded and aria-controls; short descriptions remain plain text

## Keyboard

- The navigation action is a separate focus target
- Enter or Space expands the description or activates Show less while retaining focus

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Product.stories.tsx#EarnTestCardContract`
