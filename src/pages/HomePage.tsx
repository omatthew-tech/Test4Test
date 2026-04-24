import { ArrowRight, Link2, Sparkles, UsersRound } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/Layout";
import { getSubmitFlowResume } from "../lib/pendingSubmission";

const groupLogoPath = "/branding/Test4Test%20Group%20Logo.png";
const formHolderLogoPath = "/branding/test4test-raspberry-no-thumb.png";
const formHolderArmPath = "/branding/test4test-raspberry-arm-only.png?v=2";

const heroHighlights = [
  { label: "Real user feedback", Icon: Link2 },
  { label: "Improve with insights", Icon: Sparkles },
  { label: "Test with confidence", Icon: UsersRound },
];

const processSteps = [
  {
    title: "Submit",
    body: "Add your app name, live link, and questions, or let AI generate them for you.",
  },
  {
    title: "Test",
    body: "Review apps from other users and earn credits for your app.",
  },
  {
    title: "Review",
    body: "Monitor your app's feedback with detailed summaries and raw responses.",
  },
];

export function HomePage() {
  const [productName, setProductName] = useState("");
  const [hasResumeSubmission] = useState(() => Boolean(getSubmitFlowResume()));
  const navigate = useNavigate();

  const startSubmission = () => {
    const query = productName.trim() ? `?productName=${encodeURIComponent(productName.trim())}` : "";
    navigate(`/submit${query}`);
  };

  const continueSubmission = () => {
    navigate("/submit");
  };

  return (
    <AppShell variant="marketing">
      <div className="home-page">
        <section className="home-hero" aria-labelledby="home-hero-title">
          <div className="home-hero__copy">
            <h1 id="home-hero-title">
              Get <span className="text-accent">FREE</span> user testing on your web or mobile app
            </h1>
            <span className="home-hero__swoosh" aria-hidden="true" />

            <div className="home-hero__features" aria-label="Platform highlights">
              {heroHighlights.map(({ label, Icon }) => (
                <div className="home-feature" key={label}>
                  <span className="home-feature__icon">
                    <Icon size={24} strokeWidth={2.35} aria-hidden="true" />
                  </span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="home-hero__visual">
            <div className="home-hero__device" aria-hidden="true">
              <span />
              <span />
            </div>
            <img
              src={formHolderLogoPath}
              alt=""
              className="home-hero__mascot-body"
              aria-hidden="true"
            />
            <div className="simple-start-card home-hero__start-card">
              <p className="simple-start-card__label">
                {hasResumeSubmission
                  ? "You have a saved submission in progress."
                  : "What's the name of your web or mobile app?"}
              </p>
              {hasResumeSubmission ? (
                <div className="simple-start-card__row simple-start-card__row--resume">
                  <button
                    type="button"
                    className="button button--primary simple-start-card__resume-button"
                    onClick={continueSubmission}
                  >
                    Continue submission
                    <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <div className="simple-start-card__row">
                  <input
                    id="home-product-name"
                    value={productName}
                    onChange={(event) => setProductName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        startSubmission();
                      }
                    }}
                    placeholder="Enter your web or mobile app"
                    aria-label="Web or mobile app name"
                  />
                  <button type="button" className="button button--primary" onClick={startSubmission}>
                    Get started
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </div>
            <img
              src={formHolderArmPath}
              alt=""
              className="home-hero__mascot-arm"
              aria-hidden="true"
            />
          </div>
        </section>

        <section className="home-process" aria-labelledby="home-process-title">
          <div className="home-process__header">
            <span className="eyebrow">How it works</span>
            <h2 id="home-process-title">Three simple steps to better product feedback</h2>
          </div>

          <div className="home-process__body">
            <div className="home-process__art" aria-hidden="true">
              <img src={groupLogoPath} alt="" className="home-process__logo" />
            </div>
            <div className="simple-steps">
              {processSteps.map(({ title, body }, index) => (
                <article className="simple-step" key={title}>
                  <div className="simple-step__heading">
                    <span className="simple-step__number">{index + 1}</span>
                    <h3>{title}</h3>
                  </div>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

