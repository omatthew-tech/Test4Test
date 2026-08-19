# Review checklist

## Structure

- Landmarks and headings form a coherent outline.
- Navigation order and business behavior remain intact.
- Components come from `@test4test/design-system`.

## Visual system

- Only semantic or component tokens provide visual constants.
- Geist is used for UI and Geist Mono only for technical values.
- Controls use 40, 44, or 48 px sizing and targets are at least 44 × 44 px.
- Cards, radii, shadows, and badges are used only when they communicate structure.
- The interface contains no decorative gradient, glow, scale-hover, or generic AI imagery.

## States and access

- Keyboard-only interaction, focus visibility, Escape, focus containment, and focus restoration work.
- Labels, errors, help, status, and live updates are programmatically associated.
- Loading, empty, error, permission, destructive, and long-content states remain usable.
- Reflow works at 320 CSS px and 200% text size.
- Reduced motion and forced colors preserve meaning.

## Evidence

- Run `npm run ds:check`.
- Inspect at 390 × 844 and 1440 × 900.
- Record any exception with an owner, rationale, scope, and expiration.
