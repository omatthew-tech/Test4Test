import { ArrowRight, CheckCircle2, Coins } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Test4TestMark } from "@test4test/design-system";
import { AppShell, Surface } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";

export function TestSuccessPage() {
  const { submissionId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const { state, currentUser } = useAppState();
  const submission = state.submissions.find((item) => item.id === submissionId);
  const isSharedResponse = searchParams.get("shared") === "1" || !currentUser;
  const isTester = currentUser?.accountType === "tester";

  return (
    <AppShell>
      <div className="test-success-shell center-surface">
        <Surface className="test-success-panel">
          <Test4TestMark className="test-success-mark" />

          <div className="test-success-panel__content">
            <div className="test-success-chip">
              {isSharedResponse ? <CheckCircle2 size={20} /> : <Coins size={20} />}
              <span>{isSharedResponse ? "Feedback submitted" : "You earned 1 credit"}</span>
            </div>
            <h1>Nice work.</h1>
            {isSharedResponse ? (
              <p>
                Thanks for sharing feedback with{" "}
                <strong>{submission?.productName ?? "this app"}</strong>. Your notes were sent to
                the app owner.
              </p>
            ) : isTester ? (
              <p>
                Thanks for sharing feedback with{" "}
                <strong>{submission?.productName ?? "this app"}</strong>. Your credit has been added
                to your paid-test progress.
              </p>
            ) : (
              <p>
                Thanks for sharing feedback with{" "}
                <strong>{submission?.productName ?? "this app"}</strong>. You&apos;re helping
                startups and founders, just like yourself, build better apps.
              </p>
            )}
            <div className="test-success-actions">
              {!isTester && isSharedResponse ? (
                <Link to="/submit" className="button button--secondary">
                  Create your own test
                </Link>
              ) : !isTester ? (
                <Link to="/analytics" className="button button--secondary">
                  View analytics
                </Link>
              ) : null}
              <Link to="/earn" className="button button--primary">
                {isTester
                  ? "Return to Earn"
                  : isSharedResponse
                    ? "Browse more tests"
                    : "Test another app"}
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </Surface>
      </div>
    </AppShell>
  );
}
