insert into public.email_templates (
  key,
  description,
  subject_template,
  text_template,
  html_template
)
values (
  'new_feedback',
  'Sent when fresh approved feedback is ready to view.',
  'New feedback for {{ownerProductName}}',
  $new_feedback_text$
Someone just tested {{ownerProductName}}.

Your feedback is ready to view.

View Feedback:
{{feedbackUrl}}

Or open this link directly: {{feedbackUrl}}
$new_feedback_text$,
  $new_feedback_html$
<div style="font-family: Arial, sans-serif; color: #231f1c; line-height: 1.6;">
  <p>Someone just tested <strong>{{ownerProductName}}</strong>.</p>
  <p>Your feedback is ready to view.</p>
  <p>
    <a href="{{feedbackUrl}}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #f58e56; color: #fffaf6; text-decoration: none; font-weight: 600;">
      View Feedback
    </a>
  </p>
  <p style="margin-top: 18px; color: #6f655d;">
    Or open this link directly:
    <a href="{{feedbackUrl}}" style="color: #a34f25;">{{feedbackUrl}}</a>
  </p>
</div>
$new_feedback_html$
)
on conflict (key) do update
set description = excluded.description,
    subject_template = excluded.subject_template,
    text_template = excluded.text_template,
    html_template = excluded.html_template,
    updated_at = timezone('utc', now());
