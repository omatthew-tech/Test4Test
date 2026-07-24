# Accessibility

WCAG 2.2 AA is the release baseline.

- Prefer semantic HTML to ARIA.
- Provide persistent labels, field errors, recovery instructions, and an error summary for failed submissions.
- Every action is keyboard operable and has a visible 2 px Aegean focus ring with a 2 px offset.
- Interactive targets are at least 44 × 44 px.
- Dialogs and drawers trap focus, close with Escape, and restore focus.
- Dynamic feedback uses appropriate live regions.
- Support reduced motion, forced colors, 200% text enlargement, and reflow at 320 CSS px.

Automated Axe checks supplement keyboard, NVDA/Chrome, and VoiceOver/Safari review.

Release evidence and the human screen-reader checklist are recorded in [release-evidence.md](release-evidence.md).
