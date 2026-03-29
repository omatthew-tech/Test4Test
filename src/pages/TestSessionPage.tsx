import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell, Surface } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import { displayAccessUrl, normalizeAccessUrl } from "../lib/format";
import { getActiveQuestionSet } from "../lib/selectors";
import { Question, TestAnswer } from "../types";

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

export function TestSessionPage() {
  const { submissionId = "" } = useParams();
  const navigate = useNavigate();
  const { state, completeTest } = useAppState();
  const submission = state.submissions.find((item) => item.id === submissionId);
  const questionSet = submission ? getActiveQuestionSet(state, submission.id) : null;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [startedAt] = useState(() => Date.now());

  const completion = useMemo(() => {
    if (!questionSet) {
      return { answered: 0, total: 0, canSubmit: false, shortParagraphs: 0 };
    }

    const answered = questionSet.questions.filter((question) => {
      const value = answers[question.id]?.trim();
      return Boolean(value);
    }).length;
    const shortParagraphs = questionSet.questions.filter(
      (question) =>
        question.type === "paragraph" && (answers[question.id]?.trim().length ?? 0) < 40,
    ).length;

    return {
      answered,
      total: questionSet.questions.length,
      canSubmit: answered === questionSet.questions.length && shortParagraphs === 0,
      shortParagraphs,
    };
  }, [answers, questionSet]);

  if (!submission || !questionSet) {
    return (
      <AppShell title="Test session" description="The test you're looking for could not be loaded.">
        <Surface><p>Try returning to the Earn page and choosing another live submission.</p></Surface>
      </AppShell>
    );
  }

  const submit = async () => {
    const payload = questionSet.questions.map((question) =>
      buildAnswer(question, answers[question.id]?.trim() ?? ""),
    );

    setIsSubmitting(true);

    try {
      const result = await completeTest(
        submission.id,
        payload,
        Math.round((Date.now() - startedAt) / 1000),
      );
      setMessage(result.message);
      if (result.ok) {
        navigate("/test/" + submission.id + "/success");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell eyebrowLabel={null}>
      <div className="test-layout test-layout--single">
        <div className="test-session__header">
          <h1>{`Test ${submission.productName}`}</h1>
          <p>
            Open the app in a new tab, keep this questionnaire here, and leave
            thoughtful answers that are actually useful to the person who
            submitted it.
          </p>
        </div>
        <Surface className="test-questions test-questions--full">
          <div className="test-session__intro-card">
            <div className="test-session__resource">
              <span className="test-session__label">App link</span>
              <a href={normalizeAccessUrl(submission.accessUrl)} target="_blank" rel="noreferrer" className="test-session__link">
                <span>{displayAccessUrl(submission.accessUrl)}</span>
                <ExternalLink size={15} />
              </a>
            </div>
            <div className="test-session__resource">
              <span className="test-session__label">Tester instructions</span>
              <p>
                {submission.instructions.trim()
                  ? submission.instructions
                  : "Explore the main flow, note anything confusing, and share specific feedback that would help improve the experience."}
              </p>
            </div>
          </div>

          <div className="question-list test-session__questions">
            {questionSet.questions.map((question) => (
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

          {message ? <div className="callout callout--soft">{message}</div> : null}

          <div className="wizard-actions wizard-actions--sticky test-session__footer">
            <div className="test-session__progress">
              <strong>{completion.answered} / {completion.total} answered</strong>
            </div>
            <div className="inline-actions">
              <button type="button" className="button button--secondary" onClick={() => navigate("/earn")}>
                Back to Earn
              </button>
              <button type="button" className="button button--primary" onClick={() => void submit()} disabled={!completion.canSubmit || isSubmitting}>
                Submit test
              </button>
            </div>
          </div>
        </Surface>
      </div>
    </AppShell>
  );
}
