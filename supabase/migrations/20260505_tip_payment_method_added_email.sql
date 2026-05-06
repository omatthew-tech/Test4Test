insert into public.email_templates (
  key,
  description,
  subject_template,
  text_template,
  html_template
)
values (
  'tip_payment_method_added',
  'Sent to a founder when a tester they wanted to tip adds payment methods.',
  'A tester added payment methods',
  $tip_payment_method_added_text$
Someone that you wanted to tip just added their payment methods. Check it out.

See Review:
{{reviewUrl}}

Happy Testing!
$tip_payment_method_added_text$,
  $tip_payment_method_added_html$
<div style="font-family: Arial, sans-serif; color: #231f1c; line-height: 1.6;">
  <p>Someone that you wanted to tip just added their payment methods. Check it out.</p>
  <p>
    <a href="{{reviewUrl}}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #f58e56; color: #fffaf6; text-decoration: none; font-weight: 600;">
      See Review
    </a>
  </p>
  <p>Happy Testing!</p>
</div>
$tip_payment_method_added_html$
)
on conflict (key) do update
set description = excluded.description,
    subject_template = excluded.subject_template,
    text_template = excluded.text_template,
    html_template = excluded.html_template,
    updated_at = timezone('utc', now());
