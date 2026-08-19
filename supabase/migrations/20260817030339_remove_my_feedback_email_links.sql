-- Retarget owner-facing results email copy to the supported Analytics destination.
-- The Edge Functions continue to provide the existing template variables, now with
-- Analytics URLs, so no historical template or delivery records need to change.

update public.email_templates
set text_template = $new_feedback_text$
Someone just tested {{ownerProductName}}.

Your latest activity is ready in Analytics.

Open Analytics:
{{feedbackUrl}}
$new_feedback_text$,
    html_template = $new_feedback_html$
<div style="font-family: Arial, sans-serif; color: #231f1c; line-height: 1.6;">
  <p>Someone just tested <strong>{{ownerProductName}}</strong>.</p>
  <p>Your latest activity is ready in Analytics.</p>
  <p>
    <a href="{{feedbackUrl}}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #f58e56; color: #fffaf6; text-decoration: none; font-weight: 600;">
      Open Analytics
    </a>
  </p>
</div>
$new_feedback_html$,
    updated_at = timezone('utc', now())
where key = 'new_feedback';

update public.email_templates
set text_template = $stage_1_text$
Hi {{ownerDisplayName}},

{{testerDisplayName}} just tested {{ownerProductName}}.

Please test back {{targetProductName}} while the exchange is still fresh:
{{testBackUrl}}

Open Analytics:
{{feedbackUrl}}

Testing back helps keep your Test4Test exchange rate healthy and encourages more people to test your app.
$stage_1_text$,
    html_template = $stage_1_html$
<div style="font-family: Arial, sans-serif; color: #231f1c; line-height: 1.6;">
  <p>Hi {{ownerDisplayName}},</p>
  <p><strong>{{testerDisplayName}}</strong> just tested <strong>{{ownerProductName}}</strong>.</p>
  <p>Please test back <strong>{{targetProductName}}</strong> while the exchange is still fresh.</p>
  <p>
    <a href="{{testBackUrl}}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #a34f25; color: #fffaf6; text-decoration: none; font-weight: 600; margin-right: 10px;">
      Test back now
    </a>
    <a href="{{feedbackUrl}}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #f8e8dc; color: #8a3f1d; text-decoration: none; font-weight: 600;">
      Open Analytics
    </a>
  </p>
  <p style="color: #6f655d;">Testing back helps keep your Test4Test exchange rate healthy and encourages more people to test your app.</p>
</div>
$stage_1_html$,
    updated_at = timezone('utc', now())
where key = 'test_back_reminder_stage_1';

update public.email_templates
set text_template = $stage_2_text$
Hi {{ownerDisplayName}},

Friendly reminder: {{testerDisplayName}} tested {{ownerProductName}}, and you still have an open chance to test back {{targetProductName}}.

Test back now:
{{testBackUrl}}

Open Analytics:
{{feedbackUrl}}
$stage_2_text$,
    html_template = $stage_2_html$
<div style="font-family: Arial, sans-serif; color: #231f1c; line-height: 1.6;">
  <p>Hi {{ownerDisplayName}},</p>
  <p>Friendly reminder: <strong>{{testerDisplayName}}</strong> tested <strong>{{ownerProductName}}</strong>, and you still have an open chance to test back <strong>{{targetProductName}}</strong>.</p>
  <p>
    <a href="{{testBackUrl}}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #a34f25; color: #fffaf6; text-decoration: none; font-weight: 600; margin-right: 10px;">
      Test back now
    </a>
    <a href="{{feedbackUrl}}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #f8e8dc; color: #8a3f1d; text-decoration: none; font-weight: 600;">
      Open Analytics
    </a>
  </p>
</div>
$stage_2_html$,
    updated_at = timezone('utc', now())
where key = 'test_back_reminder_stage_2';

update public.email_templates
set text_template = $stage_3_text$
Hi {{ownerDisplayName}},

Final reminder: {{testerDisplayName}} tested {{ownerProductName}}, and you still have not tested back {{targetProductName}}.

Please test back here:
{{testBackUrl}}

If you do not test back, it can lower your test-back rate. Lower test-back rates can lead to fewer people choosing to test your app.

Open Analytics:
{{feedbackUrl}}
$stage_3_text$,
    html_template = $stage_3_html$
<div style="font-family: Arial, sans-serif; color: #231f1c; line-height: 1.6;">
  <p>Hi {{ownerDisplayName}},</p>
  <p><strong>Final reminder:</strong> <strong>{{testerDisplayName}}</strong> tested <strong>{{ownerProductName}}</strong>, and you still have not tested back <strong>{{targetProductName}}</strong>.</p>
  <p>
    <a href="{{testBackUrl}}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #8f2f20; color: #fffaf6; text-decoration: none; font-weight: 600; margin-right: 10px;">
      Test back now
    </a>
    <a href="{{feedbackUrl}}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #f8e8dc; color: #8a3f1d; text-decoration: none; font-weight: 600;">
      Open Analytics
    </a>
  </p>
  <p style="color: #6f655d;">If you do not test back, it can lower your test-back rate. Lower test-back rates can lead to fewer people choosing to test your app.</p>
</div>
$stage_3_html$,
    updated_at = timezone('utc', now())
where key = 'test_back_reminder_stage_3';

update public.email_templates
set text_template = $tip_payment_method_added_text$
Someone that you wanted to tip just added their payment methods.

Open Analytics:
{{reviewUrl}}

Happy Testing!
$tip_payment_method_added_text$,
    html_template = $tip_payment_method_added_html$
<div style="font-family: Arial, sans-serif; color: #231f1c; line-height: 1.6;">
  <p>Someone that you wanted to tip just added their payment methods.</p>
  <p>
    <a href="{{reviewUrl}}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #f58e56; color: #fffaf6; text-decoration: none; font-weight: 600;">
      Open Analytics
    </a>
  </p>
  <p>Happy Testing!</p>
</div>
$tip_payment_method_added_html$,
    updated_at = timezone('utc', now())
where key = 'tip_payment_method_added';
