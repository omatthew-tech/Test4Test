import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ExternalLink } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell, Surface } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import { getOrderedAccessLinks } from "../lib/format";
import { requireSupabase } from "../lib/supabase";
import { Question, TestAnswer } from "../types";

interface QuestionSetVersionRow {
  questions: Question[];
}

function buildAnswer(question: Question, value: string): TestAnswer {
  return question.type === "multiple"
    ? {
        questionId: question.id,
        questionTitle: question.title,
        type: question.type,
        selectedOption: value,
      }
    : {
        questionId: question.id,
        questionTitle: question.title,
        type: question.type,
        textAnswer: value,
      };
}

function normalizeQuestions(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Question[];
  }

  return value.map((question, index) => {
    const current = question as Partial<Question>;

    return {
      id:
        typeof current.id === "string" && current.id.trim()
          ? current.id
          : `question-${index + 1}`,
      title: typeof current.title === "string" ? current.title : "Untitled question",
      type: current.type === "paragraph" ? "paragraph" : "multiple",
      required: current.required !== false,
      sortOrder:
        typeof current.sortOrder === "number" ? current.sortOrder : index + 1,
      options: Array.isArray(current.options)
        ? current.options.map((option) => String(option))
        : undefined,
    } satisfies Question;
  });
}

export function ReviseSubmissionPage() {
  const { responseId = "" } = useParams();
  const navigate = useNavigate();
  const { state, currentUser, reviseTestResponse, isConfigured } = useAppState();
  const response = state.responses.find(
    (item) => item.id === responseId && item.testerUserId === currentUser?.id,
  );
  const submission = state.submissions.find((item) => item.id === response?.submissionId);
  const accessLinks = useMemo(
    () => (submission ? getOrderedAccessLinks(submission.accessLinks, submission.productTypes) : []),
    [submission],
  );
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [startedAt] = useState(() => Date.now());
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!response) {
      return;
    }

    setAnswers(
      Object.fromEntries(
        response.answers.map((answer) => [
          answer.questionId,
          answer.type === "multiple"
            ? answer.selectedOption ?? ""
            : answer.textAnswer ?? "",
        ]),
      ),
    );
  }, [response?.id]);

  useEffect(() => {
    let isCancelled = false;

    if (!response) {
      setQuestions([]);
      setIsLoadingQuestions(false);
      return undefined;
    }

    const stateQuestionSet = state.questionSetVersions.find(
      (version) => version.id === response.questionSetVersionId,
    );

    if (stateQuestionSet) {
      setQuestions(stateQuestionSet.questions);
      setIsLoadingQuestions(false);
      setLoadError("");
      return undefined;
    }

    if (!isConfigured) {
      setQuestions([]);
      setIsLoadingQuestions(false);
      setLoadError("This question set is not available in the current environment.");
      return undefined;
    }

    const loadQuestions = async () => {
      setIsLoadingQuestions(true);
      setLoadError("");

      try {
        const supabase = requireSupabase();
        const { data, error } = await supabase
          .from("question_set_versions")
          .select("questions")
          .eq("id", response.questionSetVersionId)
          .single();

        if (error) {
          throw new Error(error.message);
        }

        if (!isCancelled) {
          setQuestions(normalizeQuestions((data as QuestionSetVersionRow).questions));
        }
      } catch (error) {
        if (!isCancelled) {
          setQuestions([]);
          setLoadError(
            error instanceof Error
              ? error.message
              : "We could not load your original question set.",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingQuestions(false);
        }
      }
    };

    void loadQuestions();

    return () => {
      isCancelled = true;
    };
  }, [isConfigured, response, state.questionSetVersions]);

  const completion = useMemo(() => {
    if (questions.length === 0) {
      return { answered: 0, total: 0, canSubmit: false, shortParagraphs: 0 };
    }

    const answered = questions.filter((question) => {
      const value = answers[question.id]?.trim();
      return Boolean(value);
    }).length;
    const shortParagraphs = questions.filter(
      (question) =>
        question.type === "paragraph" && (answers[question.id]?.trim().length ?? 0) < 40,
    ).length;

    return {
      answered,
      total: questions.length,
      canSubmit: answered === questions.length && shortParagraphs === 0,
      shortParagraphs,
    };
  }, [answers, questions]);

  if (!currentUser || !response) {
    return (
      <AppShell title="Revise feedback" eyebrowLabel={null}>
        <Surface><p>That submitted test could not be found.</p></Surface>
      </AppShell>
    );
  }

  const submit = async () => {
    const payload = questions.map((question) =>
      buildAnswer(question, answers[question.id]?.trim() ?? ""),
    );

    setIsSubmitting(true);
    setMessage("");

    try {
      const result = await reviseTestResponse(
        response.id,
        payload,
        response.durationSeconds + Math.round((Date.now() - startedAt) / 1000),
      );
      setMessage(result.message);

      if (result.ok) {
        navigate("/submissions", { replace: true });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell eyebrowLabel={null}>
      <div className="test-layout test-layout--single revise-response-page">
        <div className="test-session__header">
          <h1>{`Revise feedback for ${submission?.productName ?? "this app"}`}</h1>
          <p>
            Submitting a revision replaces your previous answers and let's the reviewer send you a new rating.
          </p>
        </div>
        <Surface className="test-questions test-questions--full">
          <div className="test-session__intro-card">
            <div className="test-session__resource">
              <span className="test-session__label">{accessLinks.length > 1 ? "App links" : "App link"}</span>
              {accessLinks.length > 0 ? (
                <div className="test-session__link-list">
                  {accessLinks.map((link) => (
                    <a
                      key={link.productType}
                      href={link.normalizedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="test-session__link"
                    >
                      <span className="test-session__link-label">{link.label}</span>
                      <span>{link.displayUrl}</span>
                      <ExternalLink size={15} />
                    </a>
                  ))}
                </div>
              ) : (
                <p>No public app links were provided for this test.</p>
              )}
            </div>
            <div className="test-session__resource">
              <span className="test-session__label">Tester instructions</span>
              <p>
                {submission?.instructions.trim()
                  ? submission.instructions
                  : "Explore the main flow, note anything confusing, and share specific feedback that would help improve the experience."}
              </p>
            </div>
          </div>

          {loadError ? <div className="callout callout--warning">{loadError}</div> : null}
          {message ? <div className="callout callout--soft">{message}</div> : null}

          {isLoadingQuestions ? (
            <div className="empty-state empty-state--left">
              <h3>Loading your original questions</h3>
              <p>Pulling in the question set you answered the first time so you can revise it cleanly.</p>
            </div>
          ) : (
            <div className="question-list test-session__questions">
              {questions.map((question) => (
                <article key={question.id} className="question-card question-card--spacious">
                  <div className="test-session__question-body">
                    <h3>{question.sortOrder}. {question.title}</h3>
                    {question.type === "multiple" ? (
                      <div className="radio-list">
                        {(question.options ?? []).map((option) => (
                          <label key={option} className={`radio-card${answers[question.id] === option ? " radio-card--active" : ""}`}>
                            <input
                              className="radio-card__control"
                              type="radio"
                              name={question.id}
                              checked={answers[question.id] === option}
                              onChange={() => setAnswers((current) => ({ ...current, [question.id]: option }))}
                            />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <label className="field">
                        <textarea
                          rows={5}
                          value={answers[question.id] ?? ""}
                          onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                          placeholder="Add a thoughtful answer with enough detail to be genuinely useful."
                        />
                        <small className={`helper-text ${(answers[question.id]?.trim().length ?? 0) >= 40 ? "helper-text--success" : ""}`}>
                          {answers[question.id]?.trim().length ?? 0} / 40 recommended minimum characters
                        </small>
                      </label>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="wizard-actions wizard-actions--sticky test-session__footer">
            <div className="test-session__progress">
              <strong>{completion.answered} / {completion.total} answered</strong>
            </div>
            <div className="inline-actions">
              <button type="button" className="button button--secondary" onClick={() => navigate("/submissions")}>Back to Submissions</button>
              <button
                type="button"
                className="button button--primary"
                onClick={() => void submit()}
                disabled={!completion.canSubmit || isSubmitting || isLoadingQuestions || questions.length === 0}
              >
                {isSubmitting ? "Saving..." : "Save revised feedback"}
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </Surface>
      </div>
    </AppShell>
  );
}