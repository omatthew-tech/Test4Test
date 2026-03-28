import { ArrowRight, Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import { AppShell, Surface } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import { formatDate } from "../lib/format";
import { getMySubmissions } from "../lib/selectors";
import { SubmissionStatus } from "../types";

function submissionStatusLabel(status: SubmissionStatus) {
  switch (status) {
    case "live":
      return "Live";
    case "pending_verification":
      return "Awaiting verification";
    case "paused":
      return "Paused";
    case "flagged":
      return "Needs review";
    default:
      return "Draft";
  }
}

export function MyTestsPage() {
  const { state } = useAppState();
  const submissions = getMySubmissions(state);

  return (
    <AppShell title="My Tests" eyebrowLabel={null}>
      <div className="page-stack my-tests-page">
        {submissions.length === 0 ? (
          <Surface>
            <div className="empty-state">
              <Inbox size={24} />
              <h3>No submissions yet</h3>
              <p>Publish a product first, verify your email, and your results will start filling up as feedback comes in.</p>
              <Link to="/submit" className="button button--primary">Submit your app</Link>
            </div>
          </Surface>
        ) : (
          <div className="my-tests-list">
            {submissions.map((submission) => {

              return (
                <Surface key={submission.id} className={`my-test-row my-test-row--${submission.status}`}>
                  <div className="my-test-row__header">
                    <div className="my-test-row__identity">
                      <span className={`my-test-status my-test-status--${submission.status}`}>
                        <span className="my-test-status__dot" />
                        {submissionStatusLabel(submission.status)}
                      </span>
                      <h3>{submission.productName}</h3>
                    </div>
                    <small className="my-test-row__date">Submitted {formatDate(submission.createdAt)}</small>
                  </div>

                  {submission.description ? (
                    <p className="my-test-row__description">{submission.description}</p>
                  ) : null}

                  <div className="my-test-row__footer">
                    <div className="my-test-row__meta">
                      <div className="my-test-row__metric">
                        <strong>{submission.responseCount}</strong>
                        <span>{submission.responseCount === 1 ? "response" : "responses"}</span>
                      </div>

                      {submission.lastResponseAt ? (
                        <span className="my-test-row__latest">Latest feedback {formatDate(submission.lastResponseAt)}</span>
                      ) : null}
                    </div>

                    <Link to={`/my-tests/${submission.id}`} className="button button--primary">
                      View results
                      <ArrowRight size={16} />
                    </Link>
                  </div>
                </Surface>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

