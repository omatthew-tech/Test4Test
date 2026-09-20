import { mkdir, writeFile } from "node:fs/promises";
import { renderChatEmail } from "../supabase/functions/_shared/chat-email.ts";

const preview = renderChatEmail(
  {
    productName: "MastoMetrics",
    founderSent: true,
    conversationId: "preview",
    stage: 0,
    body: "Thanks for testing MastoMetrics. Your feedback on the first screen was helpful. Could you tell me a little more about what you expected to see when you opened the analytics page?",
  },
  "https://test4test.io",
);
await mkdir(new URL("../output/", import.meta.url), { recursive: true });
await writeFile(new URL("../output/chat-email-preview.html", import.meta.url), preview.htmlBody);
