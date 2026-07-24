# Product workflows

Test creation, earning, recording, response review, and revision flows preserve existing business rules and navigation. Compose them from canonical fields, progress, alerts, dialogs, data rows, steppers, and layout primitives. Recording states always state permission, capture, upload, retry, and recovery status in text in addition to visual feedback.

## Create and edit

Use a `Stepper` with persistent drafts and a visible page heading. Platform choices are keyboard
operable and expose their selected state. Validation uses the form pattern. Editing an existing test
opens a named dialog, preserves the existing data contract, closes with Escape, and restores focus
to the edit trigger.

## Earn and record

Represent available tests with `TestRow`, `Badge`, and `StatusIndicator`. A recording test moves
through explicit preflight, microphone permission, screen-share permission, active capture,
uploading, retry/recovery, and completion states. Use text and live regions for every transition;
runtime progress widths and waveform heights are covered by the registered runtime-measurements
exception.

## Review responses

Use `ResponseViewer`, `RatingControl`, and recording status patterns. Aggregate and individual views
retain the selected version. Previous/next controls expose disabled boundaries, and rating controls
support arrow-key navigation with an accessible name for every option.

## Share

A share dialog contains a read-only, labelled URL, an optional message field, copy feedback in a
live region, and a preview headed below the page-level `h1`. Escape and the close action return focus
to the share trigger.

## Confirm and report

Account deletion, report submission, and admin moderation require an explicitly named confirmation
surface. Dialogs trap focus, support Escape, keep Cancel available, and restore focus. Destructive
and non-destructive choices must not rely on color alone. Admin and data-heavy automated states use
development-only fixtures and never contact production Supabase.
