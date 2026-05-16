import { ArrowRight, WalletCards } from "lucide-react";
import { Link } from "react-router-dom";
import { AppShell, Surface } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import { getCreditBalance } from "../lib/selectors";

export function CreditsPage() {
  const { state, currentUser } = useAppState();

  if (!currentUser) {
    return (
      <AppShell
        title="Credits"
        description="Credits power the exchange between giving feedback and receiving feedback."
        eyebrowLabel={null}
      >
        <Surface>
          <div className="empty-state empty-state--left">
            <WalletCards size={24} />
            <h3>Sign in to view your credit balance</h3>
            <p>
              Your credits show how many tests you can receive and help determine
              where your app appears on the Earn page.
            </p>
            <Link to="/sign-in" className="button button--primary">
              Log in
              <ArrowRight size={16} />
            </Link>
          </div>
        </Surface>
      </AppShell>
    );
  }

  const credits = getCreditBalance(state, currentUser.id);

  return (
    <AppShell
      title="Credits"
      eyebrowLabel={null}
    >
      <div className="page-stack credits-page">
        <Surface className="credits-hero-panel">
          <div className="credits-balance" aria-label={`Your credits: ${credits}`}>
            <span className="credits-balance__label">
              Your credits
            </span>
            <div className="credits-balance__amount">
              <strong>{credits}</strong>
            </div>
          </div>

          <div className="credits-hero-copy">
            <h2>1 Credit = 1 Test</h2>
            <p>
              Complete tests to earn credits. Your balance is automatically
              applied to your apps. The more credits you have, the more
              visibility your test will gain on the earn page.
            </p>
            <div className="inline-actions credits-hero-actions">
              <Link to="/my-tests" className="button button--secondary">
                View my apps
              </Link>
              <Link to="/earn" className="button button--primary">
                Earn credits
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </Surface>
      </div>
    </AppShell>
  );
}
