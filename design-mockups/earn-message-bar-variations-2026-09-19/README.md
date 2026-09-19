# Earn message-bar image variations

Preview artifacts only. No application implementation, behavior, routes, or visual baselines changed.

Generated with the built-in image_gen tool. Each PNG was generated independently from the same prior desktop mockup. Image outputs were visually inspected for exact message wording, bar placement above the summary card, all app summary fields, and restrained presentation. These raster concepts approximate the documented components; they are not browser-rendered implementations and do not establish exact token, responsive, or accessibility conformance. No code validation lane applies to this image-only delivery.

## Design-system references

- `design-system/components/feedback.tsx` and `design-system/components/components.module.css`: existing info Alert, 16px padding, 8px icon gap, 12px radius, pale blue info tint and accent border.
- `design-system/components/surface/README.md` and `design-system/components/components.module.css`: default and subtle Surface compositions, 16px panel radius, neutral border, compact padding.
- `design-system/foundations/color.md`, `layout.md`, `typography.md`: restrained color, shared spacing rhythm, Geist typography.
- `design-system/tokens/generated/tokens.css`: resolved semantic values supplied to image generation.

## Files

- `01-information-alert.png`: pale blue two-line information alert with circle-i icon.
- `02-white-welcome-notice.png`: white two-line notice without an icon.
- `03-compact-gray-message.png`: subtle gray single-line message using compact interface typography.

## Exact prompts

### 1. Information alert

```text
Use case: ui-mockup. Asset: one standalone high-fidelity desktop screenshot mockup of Test4Test's Earn page.
Input image: edit target. Preserve the reference Earn page layout, content, navigation, card geometry, scale, metrics, and list below. Edit ONLY the welcome message bar above the Palette Pilot summary card, adjusting the vertical position of the content below only if needed. This is a normal, quiet production web application UI. Do not redesign the dashboard. Do not add captions, numbering, variant titles, watermarks, external borders, a device frame, or browser chrome. Match the reference image's wide desktop proportions, full page visible.
Message copy must be complete and EXACTLY:
"Welcome to Test4Test! Increase your test's rank by xyz when you complete any test below"
Keep xyz literally lowercase. Do not change the wording or add punctuation.
Documented Test4Test design system: UI font is Geist, fallback Inter/system sans; body 16px with 24px line-height; interface 14px with 20px line-height; normal weight 400, semibold 600. Text-primary #242A31, text-secondary #4A545C. Surface-default white #FFFFFF, surface-inset #F4F7F9, info-tint #E1F6FF, border-accent #A0D7F4, border-default #D9DFE3, border-subtle #EBEFF2, action-primary #007BAE. Standard border width 1px. Space small 8px, medium 16px, inset desktop 24px. Information Alert has 12px corner radius. Surface has 16px corner radius. All these sizes are logical CSS pixels and scale together with the screenshot. Match normal web UI typography without oversized or heavy headings.
The message bar is a separate full-content-width element ABOVE the top summary card. Leave 16px vertical space below it. Keep common horizontal alignment with the app summary card and test cards. No gradients, glows, decorative flourishes, pill badges, extra buttons, close icon, or shadows in the message bar. Do not use success green: this is guidance, not a completed outcome.
Preserve exactly the navbar, Palette Pilot app name, Edit and Share buttons, #12 Rank, 100% Test-back rate, 100% Satisfaction rate, 8 Credits, sort dropdown and TrailMixer and Pocket Pantry cards with Start test buttons. Metrics remain in three stacked rows, not horizontal columns. 
Message bar style: use the EXISTING INFO ALERT composition. Flat pale-blue background #E1F6FF, 1px #A0D7F4 border, 12px corner radius, 16px internal padding, no shadow. At the left put a small 20px dark charcoal Lucide-style outlined circle-i information icon, aligned to the first line; 8px gap to the text block. Two text lines: title "Welcome to Test4Test!" in 16px Geist semibold, then "Increase your test's rank by xyz when you complete any test below" in 16px Geist regular, 24px line-height. Both lines #242A31. Modest height about 80px. Replace the previous growth arrow completely. Keep it conventional and utilitarian.
```

### 2. White welcome notice

```text
Use case: ui-mockup. Asset: one standalone high-fidelity desktop screenshot mockup of Test4Test's Earn page.
Input image: edit target. Preserve the reference Earn page layout, content, navigation, card geometry, scale, metrics, and list below. Edit ONLY the welcome message bar above the Palette Pilot summary card, adjusting the vertical position of the content below only if needed. This is a normal, quiet production web application UI. Do not redesign the dashboard. Do not add captions, numbering, variant titles, watermarks, external borders, a device frame, or browser chrome. Match the reference image's wide desktop proportions, full page visible.
Message copy must be complete and EXACTLY:
"Welcome to Test4Test! Increase your test's rank by xyz when you complete any test below"
Keep xyz literally lowercase. Do not change the wording or add punctuation.
Documented Test4Test design system: UI font is Geist, fallback Inter/system sans; body 16px with 24px line-height; interface 14px with 20px line-height; normal weight 400, semibold 600. Text-primary #242A31, text-secondary #4A545C. Surface-default white #FFFFFF, surface-inset #F4F7F9, info-tint #E1F6FF, border-accent #A0D7F4, border-default #D9DFE3, border-subtle #EBEFF2, action-primary #007BAE. Standard border width 1px. Space small 8px, medium 16px, inset desktop 24px. Information Alert has 12px corner radius. Surface has 16px corner radius. All these sizes are logical CSS pixels and scale together with the screenshot. Match normal web UI typography without oversized or heavy headings.
The message bar is a separate full-content-width element ABOVE the top summary card. Leave 16px vertical space below it. Keep common horizontal alignment with the app summary card and test cards. No gradients, glows, decorative flourishes, pill badges, extra buttons, close icon, or shadows in the message bar. Do not use success green: this is guidance, not a completed outcome.
Preserve exactly the navbar, Palette Pilot app name, Edit and Share buttons, #12 Rank, 100% Test-back rate, 100% Satisfaction rate, 8 Credits, sort dropdown and TrailMixer and Pocket Pantry cards with Start test buttons. Metrics remain in three stacked rows, not horizontal columns. 
Message bar style: use the EXISTING DEFAULT SURFACE composition. Flat white #FFFFFF background with a fine 1px #D9DFE3 border, 16px corner radius, no shadow. No icon at all. Left-aligned two-line text block, padded 24px horizontally and 16px vertically. First line "Welcome to Test4Test!" in 16px Geist semibold 600 #242A31; second line "Increase your test's rank by xyz when you complete any test below" in 16px Geist regular 400 #4A545C and 24px line-height. Modest height about 80px. This looks like a calm everyday welcome notice; the white background and absent icon distinguish it clearly from the blue alert. Remove the existing arrow and blue tint completely.
```

### 3. Compact gray message bar

```text
Use case: ui-mockup. Asset: one standalone high-fidelity desktop screenshot mockup of Test4Test's Earn page.
Input image: edit target. Preserve the reference Earn page layout, content, navigation, card geometry, scale, metrics, and list below. Edit ONLY the welcome message bar above the Palette Pilot summary card, adjusting the vertical position of the content below only if needed. This is a normal, quiet production web application UI. Do not redesign the dashboard. Do not add captions, numbering, variant titles, watermarks, external borders, a device frame, or browser chrome. Match the reference image's wide desktop proportions, full page visible.
Message copy must be complete and EXACTLY:
"Welcome to Test4Test! Increase your test's rank by xyz when you complete any test below"
Keep xyz literally lowercase. Do not change the wording or add punctuation.
Documented Test4Test design system: UI font is Geist, fallback Inter/system sans; body 16px with 24px line-height; interface 14px with 20px line-height; normal weight 400, semibold 600. Text-primary #242A31, text-secondary #4A545C. Surface-default white #FFFFFF, surface-inset #F4F7F9, info-tint #E1F6FF, border-accent #A0D7F4, border-default #D9DFE3, border-subtle #EBEFF2, action-primary #007BAE. Standard border width 1px. Space small 8px, medium 16px, inset desktop 24px. Information Alert has 12px corner radius. Surface has 16px corner radius. All these sizes are logical CSS pixels and scale together with the screenshot. Match normal web UI typography without oversized or heavy headings.
The message bar is a separate full-content-width element ABOVE the top summary card. Leave 16px vertical space below it. Keep common horizontal alignment with the app summary card and test cards. No gradients, glows, decorative flourishes, pill badges, extra buttons, close icon, or shadows in the message bar. Do not use success green: this is guidance, not a completed outcome.
Preserve exactly the navbar, Palette Pilot app name, Edit and Share buttons, #12 Rank, 100% Test-back rate, 100% Satisfaction rate, 8 Credits, sort dropdown and TrailMixer and Pocket Pantry cards with Start test buttons. Metrics remain in three stacked rows, not horizontal columns. 
Message bar style: use the EXISTING SUBTLE SURFACE composition with COMPACT padding. Flat light cool-gray #F4F7F9 background, fine 1px #D9DFE3 border, 16px corner radius, no shadow. No icon. Render the entire exact message as one continuous left-aligned line at desktop width using interface typography 14px Geist with 20px line-height. "Welcome to Test4Test!" semibold #242A31, followed by a single normal space and the rest in regular #4A545C. Padding 16px all around; compact total height about 54px, clearly slimmer than the prior tall banner. Avoid title/body line break if the copy fits; do not truncate. This is a standard understated contextual help strip. Remove the large arrow, blue fill, and blue border. Shift the summary card and rest of the page upward to maintain a 16px gap below the slim bar.
```

