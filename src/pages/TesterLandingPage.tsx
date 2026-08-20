import {
  ArrowRight,
  CheckCircle,
  ClipboardCheck,
  Lock,
  ShieldCheck,
  Star,
  UserPlus,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AppShell, type AudienceRole } from "../components/Layout";

const greenLogoPath = "/branding/Green%20Logo.png";
const greenLogoArmPath = "/branding/Green%20Logo%20Arm.png";
const paypalSymbolPath = "/assets/PayPal%20P.svg";

const testerSteps = [
  {
    number: "1",
    title: "Sign up for a free account",
    body: "Create your account in seconds. It's free and only takes a minute.",
    icon: UserPlus,
  },
  {
    number: "2",
    title: "Complete your profile",
    body: "Tell us a bit about yourself so we can match you with the right tests.",
    icon: ClipboardCheck,
  },
  {
    number: "3",
    title: "Receive 2 satisfactory ratings to unlock paid tests",
    body: "Once you receive 2 satisfactory ratings, you'll unlock paid tests and start earning.",
    icon: ShieldCheck,
  },
];

export function TesterLandingPage() {
  const navigate = useNavigate();

  const handleAudienceRoleChange = (role: AudienceRole) => {
    if (role === "Founder") {
      navigate("/");
    }
  };

  return (
    <AppShell
      variant="marketing"
      showAudienceToggle
      audienceRole="Tester"
      onAudienceRoleChange={handleAudienceRoleChange}
    >
      <div className="tester-page">
        <section className="tester-hero" aria-labelledby="tester-hero-title">
          <div className="tester-hero__copy">
            <h1 id="tester-hero-title">Make over $22/hour testing websites and apps</h1>
            <button
              type="button"
              className="button button--primary tester-hero__cta"
              onClick={() => navigate("/get-paid-to-test/coming-soon")}
            >
              Get started
              <ArrowRight size={20} aria-hidden="true" />
            </button>
          </div>

          <div className="tester-hero__visual">
            <div className="tester-visual-stack">
              <span className="tester-visual-stack__dots" aria-hidden="true" />
              <img
                src={greenLogoPath}
                alt=""
                className="tester-mascot tester-mascot--body"
                aria-hidden="true"
              />

              <article className="tester-earnings-card" aria-label="Example tester earnings">
                <div className="tester-earnings-card__header">
                  <span>Your earnings</span>
                  <strong>$186.50</strong>
                </div>

                <svg
                  className="tester-earnings-chart"
                  viewBox="0 0 360 120"
                  role="img"
                  aria-label="Example upward earnings chart"
                >
                  <defs>
                    <linearGradient id="tester-earnings-fill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
                      <stop offset="72%" stopColor="currentColor" stopOpacity="0.06" />
                      <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    className="tester-earnings-chart__fill"
                    d="M8 92 C42 70 72 64 96 82 S148 88 178 65 S238 54 268 46 S318 18 352 20 L352 116 L8 116 Z"
                  />
                  <path
                    d="M8 92 C42 70 72 64 96 82 S148 88 178 65 S238 54 268 46 S318 18 352 20"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="4"
                  />
                  <circle cx="352" cy="20" r="8" fill="currentColor" />
                </svg>

                <div className="tester-earnings-card__stats">
                  <div>
                    <span>Available tests</span>
                    <strong>12</strong>
                  </div>
                  <div>
                    <span>Total tests completed</span>
                    <strong>24</strong>
                  </div>
                </div>

                <div className="tester-payout">
                  <div className="tester-payout__copy">
                    <span>Next payout</span>
                    <strong>$75.00</strong>
                  </div>
                  <div className="tester-payout__progress">
                    <span>Threshold: $25.00</span>
                    <div aria-hidden="true">
                      <span />
                    </div>
                  </div>
                  <span className="tester-paypal-mark" aria-hidden="true">
                    <img src={paypalSymbolPath} alt="" className="tester-paypal-logo" loading="lazy" />
                  </span>
                </div>
              </article>

              <img
                src={greenLogoArmPath}
                alt=""
                className="tester-mascot tester-mascot--arm"
                aria-hidden="true"
              />
              <span className="tester-sparkle tester-sparkle--top" aria-hidden="true" />
              <span className="tester-sparkle tester-sparkle--bottom" aria-hidden="true" />
            </div>
          </div>
        </section>

        <section className="tester-start" aria-labelledby="tester-start-title">
          <h2 id="tester-start-title">How to get started</h2>

          <div className="tester-steps">
            {testerSteps.map(({ number, title, body, icon: Icon }) => (
              <article className="tester-step-card" key={number}>
                <span className="tester-step-card__number">{number}</span>
                <div className="tester-step-card__icon" aria-hidden="true">
                  <Icon size={42} strokeWidth={1.8} />
                  {number === "1" ? <CheckCircle className="tester-step-card__check" size={24} /> : null}
                  {number === "3" ? <Star className="tester-step-card__star" size={22} fill="currentColor" /> : null}
                </div>
                <div className="tester-step-card__copy">
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </article>
            ))}
          </div>

          <p className="tester-legal">
            <Lock size={15} aria-hidden="true" />
            <span>Your data is secure and never shared. By signing up, you agree to our</span>
            <span className="tester-legal__link">Terms of Service</span>
            <span>and</span>
            <span className="tester-legal__link">Privacy Policy</span>
            <span>.</span>
          </p>
        </section>
      </div>
    </AppShell>
  );
}

export function TesterComingSoonPage() {
  return (
    <main className="tester-coming-soon">
      <h1>Coming Soon!</h1>
    </main>
  );
}
