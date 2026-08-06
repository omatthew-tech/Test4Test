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
import { Button, Card, Test4TestMark } from "@test4test/design-system";
import { AppShell } from "../components/Layout";
import styles from "./TesterLandingPage.module.css";

const paypalSymbolPath = "/Assets/PayPal%20P.svg";

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

  return (
    <AppShell variant="marketing">
      <div className={styles.page}>
        <section className={styles.hero} aria-labelledby="tester-hero-title">
          <div className={styles.heroCopy}>
            <h1 id="tester-hero-title">Make over $22/hour testing websites and apps</h1>
            <Button className={styles.heroCta} onClick={() => navigate("/sign-in")}>
              Get started
              <ArrowRight size={20} aria-hidden="true" />
            </Button>
          </div>

          <div className={styles.heroVisual}>
            <div className={styles.visualStack}>
              <div className={styles.brandComposition} aria-hidden="true">
                <Test4TestMark className={styles.brandMark} />
              </div>

              <Card
                as="article"
                className={styles.earningsCard}
                aria-label="Example tester earnings"
              >
                <div className={styles.earningsHeader}>
                  <span>Your earnings</span>
                  <strong>$186.50</strong>
                </div>

                <svg
                  className={styles.earningsChart}
                  viewBox="0 0 360 120"
                  role="img"
                  aria-label="Example upward earnings chart"
                >
                  <path
                    className={styles.earningsChartFill}
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

                <div className={styles.earningsStats}>
                  <div>
                    <span>Available tests</span>
                    <strong>12</strong>
                  </div>
                  <div>
                    <span>Total tests completed</span>
                    <strong>24</strong>
                  </div>
                </div>

                <div className={styles.payout}>
                  <div className={styles.payoutCopy}>
                    <span>Next payout</span>
                    <strong>$75.00</strong>
                  </div>
                  <div className={styles.payoutProgress}>
                    <span>Threshold: $25.00</span>
                    <div aria-hidden="true">
                      <span />
                    </div>
                  </div>
                  <span className={styles.paypalMark} aria-hidden="true">
                    <img
                      src={paypalSymbolPath}
                      alt=""
                      className={styles.paypalLogo}
                      loading="lazy"
                    />
                  </span>
                </div>
              </Card>
            </div>
          </div>
        </section>

        <section className={styles.start} aria-labelledby="tester-start-title">
          <h2 id="tester-start-title">How to get started</h2>

          <div className={styles.steps}>
            {testerSteps.map(({ number, title, body, icon: Icon }) => (
              <article className={styles.stepCard} key={number}>
                <span className={styles.stepNumber}>{number}</span>
                <div className={styles.stepIcon} aria-hidden="true">
                  <Icon size={24} />
                  {number === "1" ? <CheckCircle className={styles.stepAccent} size={24} /> : null}
                  {number === "3" ? (
                    <Star className={styles.stepAccent} size={24} fill="currentColor" />
                  ) : null}
                </div>
                <div className={styles.stepCopy}>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </article>
            ))}
          </div>

          <p className={styles.legal}>
            <Lock size={16} aria-hidden="true" />
            <span>Your data is secure and never shared. By signing up, you agree to our</span>
            <span className={styles.legalLink}>Terms of Service</span>
            <span>and</span>
            <span className={styles.legalLink}>Privacy Policy</span>
            <span>.</span>
          </p>
        </section>
      </div>
    </AppShell>
  );
}
