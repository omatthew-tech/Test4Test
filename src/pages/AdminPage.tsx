import { ShieldAlert } from "lucide-react";
import { AppShell, Surface } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import { formatDateTime } from "../lib/format";
import { getModerationQueue, getUserById } from "../lib/selectors";

export function AdminPage() {
  const { state, addModerationAction } = useAppState();
  const queue = getModerationQueue(state);

  return (
    <AppShell title="Admin and moderation" description="A launch-ready placeholder for trust tooling: flagging, warnings, credit revocation, and review notes.">
      <div className="page-stack">
        <Surface className="callout callout--warning">
          <ShieldAlert size={18} />
          <span>High-quality responses are a core product area, not a side feature. This screen highlights flagged or low-quality feedback that may need action.</span>
        </Surface>
        <div className="list-stack">
          {queue.map((response) => {
            const tester = getUserById(state, response.testerUserId);
            return (
              <Surface key={response.id} className="moderation-card">
                <div className="moderation-card__header">
                  <div>
                    <span className="eyebrow">{response.status}</span>
                    <h3>{response.anonymousLabel}</h3>
                    <p>{tester?.displayName ?? "Unknown tester"} · {formatDateTime(response.submittedAt)}</p>
                  </div>
                  <span className="pill">Quality {response.qualityScore}</span>
                </div>
                <p>{response.internalFlags.join(" · ") || "Low confidence response"}</p>
                <div className="inline-actions inline-actions--compact">
                  <button type="button" className="button button--secondary" onClick={() => addModerationAction(response.id, response.testerUserId, "warn", "Warned for low-effort feedback patterns.")}>Warn user</button>
                  <button type="button" className="button button--secondary" onClick={() => addModerationAction(response.id, response.testerUserId, "revoke_credit", "Credit revoked pending moderator review.")}>Revoke credit</button>
                  <button type="button" className="button button--primary" onClick={() => addModerationAction(response.id, response.testerUserId, "reject", "Response rejected for MVP quality floor.")}>Reject response</button>
                </div>
              </Surface>
            );
          })}
        </div>

        <Surface>
          <div className="section-heading">
            <span className="eyebrow">Moderation log</span>
            <h2>Recent actions</h2>
          </div>
          <div className="list-stack">
            {state.moderationActions.map((action) => (
              <article key={action.id} className="list-row">
                <div>
                  <strong>{action.action}</strong>
                  <p>{action.notes}</p>
                </div>
                <small>{formatDateTime(action.createdAt)}</small>
              </article>
            ))}
          </div>
        </Surface>
      </div>
    </AppShell>
  );
}