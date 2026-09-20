import { emailTokens as t } from "./chat-email-tokens.ts";

export interface ChatEmailContext {
  productName: string;
  body: string;
  founderSent: boolean;
  conversationId: string;
  stage: number;
}

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );

export function chatExcerpt(body: string) {
  const characters = Array.from(body.replace(/\s+/gu, " ").trim());
  return characters.length <= 160 ? characters.join("") : `${characters.slice(0, 159).join("")}…`;
}

export function renderChatEmail(context: ChatEmailContext, appBaseUrl: string) {
  const origin = new URL(appBaseUrl);
  if (!["https:", "http:"].includes(origin.protocol)) throw new Error("Invalid application URL.");
  const base = origin.href.replace(/\/+$/, "");
  const product = context.productName.replace(/[\r\n]+/g, " ");
  const headline = context.founderSent
    ? `The founder of ${product} sent you a message`
    : `Your tester for ${product} sent you a message`;
  const excerpt = chatExcerpt(context.body);
  const messageUrl = `${base}/messages/${encodeURIComponent(context.conversationId)}`;
  const subject = `${context.stage ? "Reminder: " : ""}${headline}`;
  // ds-exception: chat-email-platform-format — all presentation values are token-derived.
  const htmlBody = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(subject)}</title></head>
<body style="margin:0;background:${t.canvas};color:${t.text};font-family:${escape(t.font)};font-size:${t.bodySize};line-height:${t.bodyLine}">
<div role="main"><table role="presentation" style="width:100%;border-collapse:collapse"><tr><td align="center" style="padding:${t.padding}">
<table role="presentation" style="width:100%;max-width:${t.width};border-collapse:collapse;text-align:center">
<tr><td style="padding-bottom:${t.gap}"><img src="${escape(base)}/brand/test4test-email-mark.png" alt="" width="${parseFloat(t.logo)}" style="vertical-align:middle;margin-right:${t.small}"><span style="font-weight:${t.weight};font-size:${t.headingSize};vertical-align:middle">Test4Test</span></td></tr>
<tr><td style="padding-bottom:${t.gap}"><h1 style="margin:0;font-size:${t.headingSize};line-height:${t.headingLine};font-weight:${t.weight};overflow-wrap:anywhere">${escape(headline)}</h1></td></tr>
<tr><td style="padding:${t.padding};background:${t.inset};border-radius:${t.radius};overflow-wrap:anywhere">${escape(excerpt)}</td></tr>
<tr><td style="padding-top:${t.gap}"><a href="${escape(messageUrl)}" style="display:inline-block;padding:${t.buttonPadding} ${t.padding};background:${t.primary};color:${t.onPrimary};border-radius:${t.pill};font-weight:${t.weight};text-decoration:none">View message</a></td></tr>
</table></td></tr></table></div></body></html>`;
  return {
    subject,
    htmlBody,
    textBody: `Test4Test\n\n${headline}\n\n${excerpt}\n\nView message: ${messageUrl}`,
  };
}
