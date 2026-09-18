# Recording sharing

The recording toolbar places Share after Message. It opens the design-system Dialog
with a read-only, selectable URL, Copy link, an announced Copied state, and manual-copy
recovery if clipboard permission is denied. Link creation failures can be retried.

`/recordings/shared#<token>` is a public viewer with no sign-in requirement. The token
stays in the URL fragment so it is not sent in HTTP referrers or server URL logs.
The viewer sends it in a POST body to `get-response-recording-access`, which returns
a fresh five-minute playback URL and product name. Contact details, ratings,
transcripts, and other recordings are not returned.

Only an authenticated owner or the recording's tester can create a share link.
The endpoint stores a random capability in `recording_share_links`, a table with RLS
enabled and no client privileges. Existing links are reused for the same recording
source. Replacing or deleting that source invalidates public access; a new recording
requires a new share action. Deleting the response also deletes its share links.

Deployment requires applying `20260918190627_recording_share_links.sql` and deploying
the updated `get-response-recording-access` function before deploying the frontend.
Its existing `verify_jwt = false` setting is required for guests; the handler checks
the user session for private access and the capability for public access.

Validation: recording feedback unit tests cover copy success, denied clipboard,
and retry; recording share client tests cover authenticated creation and guest access;
recording share access tests execute the endpoint and migration, including unauthorized
access, token tampering, replacement/deletion, client privileges, and cascading cleanup.
The recording feedback browser journey checks keyboard focus, clipboard contents,
accessibility, and a separate guest browser at 1440 × 900 and 390 × 844.

Validation on 2026-09-18: **Fast-checked**. The 32 focused unit tests, both sharing
browser journeys, and production build pass. The complete release command passed
316 unit tests and 74 component tests, then stopped with 12 failures among 239
browser checks. Those failures concern existing home content/contrast, outdated
analytics links and labels, Earn fixtures/preferences, and microphone setup styling.
Recording and shared-recording accessibility, reflow, enlarged text, forced colors,
and sharing journeys passed.

Targeted visual comparisons report the intentionally changed recording toolbar and
missing baselines for the new public viewer. Baselines were not written or updated.
Reviewed desktop/mobile screenshots are in `output/validation/recording-share/`.
Live backend deployment and live-media verification have not been performed.
