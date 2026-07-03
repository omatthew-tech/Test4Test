# AI Analysis dashboard upgrade — Report Cards only

This is the **dashboard piece on its own**. It drops into your existing repo and
works with the rest of your current code unchanged — your existing
`ProcessingScreen`, `ReportView`, and everything else stay exactly as they are.
No new dependencies, no API changes, no Supabase changes.

## Files

```
src/components/reports/ReportDashboard.tsx   (replace)
src/components/reports/ReportCard.tsx        (new)
```

Then append `report-card.append.css` to the end of your `src/styles.css`.

## What's different from your current dashboard

- The dense "Previous reports" list rows are replaced with a responsive grid of
  scannable **Report Cards**: status badge (Ready / Processing / Failed), key
  stats (generated date, recordings, screens), failure message when relevant,
  and a clear **View report** button that navigates to `/ai-analysis/{id}` for
  completed reports.
- Everything else in the dashboard is byte-for-byte your original behavior:
  submission selection, recording validation, the generate → poll flow, status
  ticks, completion navigation, error handling, and abort-on-unmount.

## Compatibility

- `ReportDashboard` calls your **existing** `ProcessingScreen` with the same
  props it always had (`productName`, `statusLabel`) — so you do NOT need the
  upgraded progress screen for this to work.
- Reuses your existing libs as-is: `../../lib/format`,
  `../../lib/usabilityReports`, `../../lib/selectors`,
  `../../context/AppStateContext`, `../../types`, and `../Layout`'s `Surface`.
- The old `.report-history` CSS in your `styles.css` is no longer referenced and
  can be removed if you like, but leaving it is harmless.

After copying, run `pnpm run typecheck` and click through:
generate → processing → previous reports → View report.
