import { ArrowRight, Coins, LogOut, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { AppShell, Surface } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import { formatDateTime } from "../lib/format";
import { getCreditBalance, getMySubmissions } from "../lib/selectors";

export function ProfilePage() {
  const { state, currentUser, signOut } = useAppState();
  const credits = getCreditBalance(state, currentUser?.id ?? null);
  const mySubmissions = getMySubmissions(state);
  const myLedger = state.creditTransactions.filter(
    (transaction) => transaction.userId === currentUser?.id,
  );

  if (!currentUser) {
    return (
      <AppShell title="Profile" eyebrowLabel={null}>
        <div className="page-stack">
          <Surface>
            <div className="empty-state empty-state--left">
              <UserRound size={24} />
              <h3>Sign in to launch your account</h3>
              <p>
                Submit an app and verify your email to unlock shared data, credits,
                and live results.
              </p>
              <Link to="/submit" className="button button--primary">
                Submit your app
                <ArrowRight size={16} />
              </Link>
            </div>
          </Surface>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Profile" eyebrowLabel={null}>
      <div className="page-stack">
        <div className="stats-grid">
          <Surface className="stat-panel">
            <small>Signed in as</small>
            <strong>{currentUser.displayName}</strong>
            <span>{currentUser.email}</span>
          </Surface>
          <Surface className="stat-panel">
            <small>Credit balance</small>
            <strong>{credits}</strong>
            <span>Earn more by testing live apps from other founders.</span>
          </Surface>
          <Surface className="stat-panel">
            <small>Your submissions</small>
            <strong>{mySubmissions.length}</strong>
            <span>Keep them live to collect more feedback over time.</span>
          </Surface>
        </div>

        <div className="detail-grid">
          <Surface>
            <div className="section-heading section-heading--split">
              <div>
                <span className="eyebrow">Credits</span>
                <h2>Transaction history</h2>
              </div>
              <button type="button" className="button button--secondary" onClick={() => void signOut()}>
                <LogOut size={16} />
                Sign out
              </button>
            </div>
            <div className="list-stack">
              {myLedger.length > 0 ? (
                myLedger.map((transaction) => (
                  <article key={transaction.id} className="list-row">
                    <div>
                      <strong>{transaction.reason}</strong>
                      <p>{formatDateTime(transaction.createdAt)}</p>
                    </div>
                    <span className={`pill ${transaction.amount > 0 ? "pill--accent" : ""}`}>
                      {transaction.amount > 0 ? `+${transaction.amount}` : transaction.amount} credits
                    </span>
                  </article>
                ))
              ) : (
                <p className="helper-text">Your credit history will appear here after you verify and complete tests.</p>
              )}
            </div>
          </Surface>

          <Surface>
            <div className="section-heading">
              <span className="eyebrow">Quick links</span>
              <h2>Keep the loop moving</h2>
            </div>
            <div className="list-stack">
              <Link to="/earn" className="list-row list-row--link">
                <div>
                  <strong>Earn more credits</strong>
                  <p>Review another live app and add to your balance.</p>
                </div>
                <Coins size={18} />
              </Link>
              <Link to="/my-tests" className="list-row list-row--link">
                <div>
                  <strong>View your tests</strong>
                  <p>Check incoming feedback and question performance.</p>
                </div>
                <ArrowRight size={18} />
              </Link>
            </div>
          </Surface>
        </div>
      </div>
    </AppShell>
  );
}
