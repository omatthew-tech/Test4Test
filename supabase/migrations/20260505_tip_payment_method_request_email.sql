insert into public.email_templates (
  key,
  description,
  subject_template,
  text_template,
  html_template
)
values (
  'tip_payment_method_request',
  'Sent to a tester when a founder wants to tip them but no payment method is on file.',
  'A founder wants to send you a tip',
  $tip_payment_method_request_text$
The founder of {{appName}} wants to send you a tip. Add your PayPal, Venmo and/or Cash App link to your profile. We'll notify them when you do.

Add Payment Method:
{{profileUrl}}

Happy Testing!
$tip_payment_method_request_text$,
  $tip_payment_method_request_html$
<div style="font-family: Arial, sans-serif; color: #231f1c; line-height: 1.6;">
  <p>The founder of <strong>{{appName}}</strong> wants to send you a tip. Add your PayPal, Venmo and/or Cash App link to your profile. We'll notify them when you do.</p>
  <p>
    <a href="{{profileUrl}}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #f58e56; color: #fffaf6; text-decoration: none; font-weight: 600;">
      Add Payment Method
    </a>
  </p>
  <p>Happy Testing!</p>
</div>
$tip_payment_method_request_html$
)
on conflict (key) do update
set description = excluded.description,
    subject_template = excluded.subject_template,
    text_template = excluded.text_template,
    html_template = excluded.html_template,
    updated_at = timezone('utc', now());
