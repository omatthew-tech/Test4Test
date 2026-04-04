import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ReportRequest {
  responseId?: string;
  message?: string;
}

interface NormalizedQuestion {
  id: string;
  title: string;
  sortOrder: number;
}

interface NormalizedAnswer {
  questionId: string;
  questionTitle: string;
  value: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlWithBreaks(value: string) {
  return escapeHtml(value).replaceAll("\n", "<br />");
}

function normalizeMessage(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, 500);
}

function normalizeQuestions(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as NormalizedQuestion[];
  }

  return value
    .map((question, index) => {
      const current = question as Record<string, unknown>;
      const sortOrder =
        typeof current.sortOrder === "number" && Number.isFinite(current.sortOrder)
          ? current.sortOrder
          : index + 1;

      return {
        id:
          typeof current.id === "string" && current.id.trim().length > 0
            ? current.id
            : `question-${index + 1}`,
        title:
          typeof current.title === "string" && current.title.trim().length > 0
            ? current.title.trim()
            : `Question ${index + 1}`,
        sortOrder,
      } satisfies NormalizedQuestion;
    })
    .sort((first, second) => first.sortOrder - second.sortOrder);
}

function normalizeAnswers(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as NormalizedAnswer[];
  }

  return value.flatMap((answer) => {
    const current = answer as Record<string, unknown>;
    const questionId =
      typeof current.questionId === "string" && current.questionId.trim().length > 0
        ? current.questionId.trim()
        : "";
    const questionTitle =
      typeof current.questionTitle === "string" && current.questionTitle.trim().length > 0
        ? current.questionTitle.trim()
        : "Untitled question";
    const value =
      typeof current.selectedOption === "string" && current.selectedOption.trim().length > 0
        ? current.selectedOption.trim()
        : typeof current.textAnswer === "string"
          ? current.textAnswer.trim()
          : "";

    if (!questionId && !questionTitle) {
      return [] as NormalizedAnswer[];
    }

    return [{
      questionId,
      questionTitle,
      value,
    } satisfies NormalizedAnswer];
  });
}

function getRatingLabel(ratingValue: string) {
  switch (ratingValue) {
    case "frowny":
      return "Low Value";
    case "neutral":
      return "Okay";
    case "smiley":
      return "Helpful";
    default:
      return "Unknown";
  }
}

function buildQuestionAnswerPairs(questionsRaw: unknown, answersRaw: unknown) {
  const questions = normalizeQuestions(questionsRaw);
  const answers = normalizeAnswers(answersRaw);
  const answerByQuestionId = new Map<string, NormalizedAnswer>();
  const usedAnswerKeys = new Set<string>();

  for (const answer of answers) {
    if (answer.questionId && !answerByQuestionId.has(answer.questionId)) {
      answerByQuestionId.set(answer.questionId, answer);
    }
  }

  const pairs = questions.map((question) => {
    const matchedAnswer = answerByQuestionId.get(question.id);

    if (matchedAnswer) {
      usedAnswerKeys.add(matchedAnswer.questionId || `${question.title}:${matchedAnswer.value}`);
    }

    return {
      question: question.title,
      answer: matchedAnswer?.value || "(No answer saved)",
    };
  });

  for (const answer of answers) {
    const answerKey = answer.questionId || `${answer.questionTitle}:${answer.value}`;

    if (usedAnswerKeys.has(answerKey)) {
      continue;
    }

    pairs.push({
      question: answer.questionTitle,
      answer: answer.value || "(No answer saved)",
    });
    usedAnswerKeys.add(answerKey);
  }

  return pairs;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  const secretKey =
    Deno.env.get("SUPABASE_SECRET_KEY")?.trim() ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ||
    "";
  const smtp2goApiKey = Deno.env.get("SMTP2GO_API_KEY")?.trim() ?? "";
  const smtp2goSender = Deno.env.get("SMTP2GO_SENDER")?.trim() ?? "";
  const reportRecipient = Deno.env.get("REPORT_FEEDBACK_TO")?.trim() || "matthewoz101@gmail.com";
  const authHeader = request.headers.get("Authorization") ?? "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!supabaseUrl || !secretKey) {
    return json({ error: "Missing Supabase server secrets for reports." }, 500);
  }

  if (!smtp2goApiKey || !smtp2goSender) {
    return json({ error: "Missing SMTP2GO secrets for reports." }, 500);
  }

  if (!accessToken) {
    return json({ error: "Unauthorized." }, 401);
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(accessToken);

  if (userError || !user) {
    return json({ error: userError?.message ?? "Unauthorized." }, 401);
  }

  const payload = (await request.json().catch(() => ({}))) as ReportRequest;
  const responseId = payload.responseId?.trim() ?? "";
  const reporterMessage = normalizeMessage(payload.message);

  if (!responseId) {
    return json({ error: "Missing response id." }, 400);
  }

  const { data: responseRow, error: responseError } = await admin
    .from("test_responses")
    .select("id, submission_id, tester_user_id, question_set_version_id, answers")
    .eq("id", responseId)
    .single();

  if (responseError || !responseRow) {
    return json({ error: responseError?.message ?? "Test response not found." }, 404);
  }

  if (responseRow.tester_user_id !== user.id) {
    return json({ error: "You do not have permission to report this rating." }, 403);
  }

  const { data: submission, error: submissionError } = await admin
    .from("submissions")
    .select("id, product_name, user_id")
    .eq("id", responseRow.submission_id)
    .single();

  if (submissionError || !submission) {
    return json({ error: submissionError?.message ?? "Submission not found." }, 404);
  }

  const { data: ratingRow, error: ratingError } = await admin
    .from("feedback_ratings")
    .select("rating_value")
    .eq("test_response_id", responseRow.id)
    .eq("rated_by_user_id", submission.user_id)
    .maybeSingle();

  if (ratingError) {
    return json({ error: ratingError.message }, 500);
  }

  if (!ratingRow?.rating_value) {
    return json({ error: "This feedback has not been rated yet." }, 400);
  }

  if (ratingRow.rating_value !== "frowny" && ratingRow.rating_value !== "neutral") {
    return json({ error: "Only Low Value or Okay ratings can be reported." }, 400);
  }

  const { data: questionSetVersion, error: questionSetError } = await admin
    .from("question_set_versions")
    .select("questions")
    .eq("id", responseRow.question_set_version_id)
    .single();

  if (questionSetError || !questionSetVersion) {
    return json({ error: questionSetError?.message ?? "Question set not found." }, 404);
  }

  const { data: reporterProfile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const reporterDisplayName = reporterProfile?.display_name?.trim() || user.email?.trim() || user.id;
  const questionAnswerPairs = buildQuestionAnswerPairs(
    questionSetVersion.questions,
    responseRow.answers,
  );

  const ratingLabel = getRatingLabel(ratingRow.rating_value);
  const safeProductName = escapeHtml(submission.product_name);
  const safeReporterDisplayName = escapeHtml(reporterDisplayName);
  const safeReporterEmail = escapeHtml(user.email?.trim() || "No email on account");
  const safeReporterMessage = reporterMessage ? escapeHtmlWithBreaks(reporterMessage) : "None provided.";
  const questionAnswerText = questionAnswerPairs
    .map(
      (item, index) => `${index + 1}. ${item.question}\nAnswer: ${item.answer}`,
    )
    .join("\n\n");
  const questionAnswerHtml = questionAnswerPairs
    .map(
      (item, index) => `
        <li style="margin-bottom: 18px;">
          <p style="margin: 0 0 6px; font-weight: 700; color: #231f1c;">${index + 1}. ${escapeHtml(item.question)}</p>
          <p style="margin: 0; color: #4f4741; white-space: pre-wrap;">${escapeHtmlWithBreaks(item.answer)}</p>
        </li>
      `,
    )
    .join("");

  const subject = `Reported ${ratingLabel} rating for ${submission.product_name}`;
  const textBody = [
    `A tester reported a ${ratingLabel} rating on ${submission.product_name}.`,
    "",
    `Reporter: ${reporterDisplayName}`,
    `Reporter email: ${user.email?.trim() || "No email on account"}`,
    `Reporter user id: ${user.id}`,
    `Response id: ${responseRow.id}`,
    `Submission id: ${submission.id}`,
    "",
    "Optional message:",
    reporterMessage || "None provided.",
    "",
    "Questions and answers:",
    questionAnswerText || "No saved answers found.",
  ].join("\n");

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; color: #231f1c; line-height: 1.6;">
      <p>A tester reported a <strong>${escapeHtml(ratingLabel)}</strong> rating on <strong>${safeProductName}</strong>.</p>
      <div style="margin: 18px 0; padding: 16px 18px; border-radius: 18px; border: 1px solid rgba(216, 208, 200, 0.9); background: #fffaf6;">
        <p style="margin: 0 0 6px;"><strong>Reporter:</strong> ${safeReporterDisplayName}</p>
        <p style="margin: 0 0 6px;"><strong>Reporter email:</strong> ${safeReporterEmail}</p>
        <p style="margin: 0 0 6px;"><strong>Reporter user id:</strong> ${escapeHtml(user.id)}</p>
        <p style="margin: 0 0 6px;"><strong>Response id:</strong> ${escapeHtml(responseRow.id)}</p>
        <p style="margin: 0;"><strong>Submission id:</strong> ${escapeHtml(submission.id)}</p>
      </div>
      <div style="margin: 18px 0; padding: 16px 18px; border-radius: 18px; border: 1px solid rgba(216, 208, 200, 0.9); background: #fffefc;">
        <p style="margin: 0 0 8px; font-weight: 700;">Optional message</p>
        <p style="margin: 0; color: #4f4741; white-space: pre-wrap;">${safeReporterMessage}</p>
      </div>
      <div style="margin-top: 22px;">
        <p style="margin: 0 0 12px; font-weight: 700;">Questions and answers</p>
        <ol style="margin: 0; padding-left: 22px;">
          ${questionAnswerHtml || '<li><p style="margin: 0; color: #4f4741;">No saved answers found.</p></li>'}
        </ol>
      </div>
    </div>
  `;

  const smtpResponse = await fetch("https://api.smtp2go.com/v3/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Smtp2go-Api-Key": smtp2goApiKey,
    },
    body: JSON.stringify({
      sender: `Test4Test <${smtp2goSender}>`,
      to: [reportRecipient],
      subject,
      text_body: textBody,
      html_body: htmlBody,
    }),
  });

  const smtpPayload = await smtpResponse.json().catch(() => null);

  if (!smtpResponse.ok) {
    const message = smtpPayload?.data?.error || smtpPayload?.error || "SMTP2GO request failed.";
    return json({ error: message }, smtpResponse.status);
  }

  if ((smtpPayload?.data?.succeeded ?? 0) < 1) {
    const failureMessage = Array.isArray(smtpPayload?.data?.failures)
      ? smtpPayload.data.failures.join("; ")
      : "SMTP2GO did not confirm a successful send.";
    return json({ error: failureMessage }, 502);
  }

  return json({ ok: true, message: "Report sent. We emailed the rating and your answers for review." });
});