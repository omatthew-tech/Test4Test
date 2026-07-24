# Question editor

Labeled, validated question editing composition with explicit actions.

- Family: product
- Lifecycle: stable
- Version: 1.0.0
- Public export: `QuestionEditor`
- Source: `design-system/components/product.tsx`
- Story: `design-system/stories/Product.stories.tsx#QuestionEditorContract`
- Control mode: controlled

## Public API

- Sizes: `responsive`
- Variants: `with-actions`, `without-actions`
- States: `empty`, `filled`, `disabled`, `help`, `error`, `long-content`
- Accessible name: Required label prop labels the textarea; actions retain explicit names.

## Accessibility contract

- Persistent textarea label
- Help and errors are associated

## Keyboard

- Textarea uses native editing keys
- Actions follow the field

Minimum interactive target: 44 × 44 px.

## Examples and tests

- `design-system/stories/Product.stories.tsx#QuestionEditorContract`
