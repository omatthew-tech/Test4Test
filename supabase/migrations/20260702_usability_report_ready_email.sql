insert into public.email_templates (
  key,
  description,
  subject_template,
  text_template,
  html_template
)
values (
  'usability_report_ready',
  'Sent to an app owner when their AI usability report finishes processing.',
  'Your usability report for {{productName}} is ready',
  $usability_report_ready_text$
Hi {{ownerDisplayName}},

Your usability report for {{productName}} has finished processing. We analyzed your tester recordings and pulled out {{frameCount}} key app screens with timestamps.

View your report:
{{reportUrl}}

Happy Testing!
$usability_report_ready_text$,
  $usability_report_ready_html$
<div style="font-family: Arial, sans-serif; color: #231f1c; line-height: 1.6;">
  <p>Hi {{ownerDisplayName}},</p>
  <p>Your usability report for <strong>{{productName}}</strong> has finished processing. We analyzed your tester recordings and pulled out <strong>{{frameCount}}</strong> key app screens with timestamps.</p>
  <p>
    <a href="{{reportUrl}}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #f58e56; color: #fffaf6; text-decoration: none; font-weight: 600;">
      View Report
    </a>
  </p>
  <p>Happy Testing!</p>
</div>
$usability_report_ready_html$
)
on conflict (key) do update
set description = excluded.description,
    subject_template = excluded.subject_template,
    text_template = excluded.text_template,
    html_template = excluded.html_template,
    updated_at = timezone('utc', now());
