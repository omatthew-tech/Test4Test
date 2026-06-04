import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell, type AudienceRole } from "../components/Layout";
import { trackEvent } from "../lib/analytics";
import { getSubmitFlowResume } from "../lib/pendingSubmission";

const groupLogoPath = "/branding/Test4Test%20Group%20Logo.png";
const formHolderLogoPath = "/branding/Raspberry.png";
// The arm overlay shares Raspberry.png's artboard so body, card, and foreground arm stay aligned.
const formHolderArmPath = "/branding/raspberry-arm-foreground-364x607.png";
const mobileFormHolderLogoPath = "/branding/Short%20Popsicle.png";
const mobileFormHolderArmsPath = "/branding/short-popsicle-arms-foreground-1024x1536.png";

const homeReviews = [
  "Test4Test helped me get my first useful feedback from real users.",
  "I found issues in my signup flow that I never would have caught alone.",
  "The credit system made user testing possible before I had a research budget.",
  "I finally understood where people were getting stuck.",
  "Other user testing sites were expensive. Test4Test gave me premium-feeling feedback for free.",
  "The reviews helped me fix things I never would have thought of.",
];

const feedbackDemoItems = [
  {
    id: "cta",
    quote: "I know what the button will do. It feels more useful than a vague Get started.",
  },
  {
    id: "progress",
    quote: "The setup list makes this feel manageable. I can see the three things left.",
  },
  {
    id: "pricing",
    quote: "The trial note and security link answer the questions I would have before trying it.",
  },
];

const feedbackFunnelSteps = [
  {
    id: "identify",
    title: "Identify",
    body: "Pins the comment to the screen, action, and moment that caused it.",
  },
  {
    id: "categorize",
    title: "Categorize",
    body: "Groups similar notes by task, page area, and risk level.",
  },
  {
    id: "analyze",
    title: "Analyze",
    body: "Turns repeated friction into priorities a team can act on.",
  },
];

const executiveReportIssues = [
  "Confirmation after report creation is still unclear.",
  "Trial renewal date needs to sit closer to the plan controls.",
  "Setup checklist helps, but handoff ownership should appear earlier.",
];

const executiveReportFixes = [
  "Keep the action-focused CTA copy.",
  "Add a receipt state after the handoff report is built.",
  "Move renewal terms next to Edit subscription.",
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
    const trimmedProductName = productName.trim();

    if (trimmedProductName) {
      trackEvent("product_name_entered", { source: "home" });
    }

    const query = trimmedProductName ? `?productName=${encodeURIComponent(trimmedProductName)}` : "";
    navigate(`/submit${query}`);
  };

  const continueSubmission = () => {
    navigate("/submit");
  };

  const handleAudienceRoleChange = (role: AudienceRole) => {
    if (role === "Tester") {
      navigate("/get-paid-to-test");
    }
  };

  return (
    <AppShell
      variant="marketing"
      showAudienceToggle
      audienceRole="Founder"
      onAudienceRoleChange={handleAudienceRoleChange}
    >
      <div className="home-page">
        <section className="home-hero" aria-labelledby="home-hero-title">
          <div className="home-hero__copy">
            <h1 id="home-hero-title">
              Get <span className="text-accent">FREE</span> user testing on your web or mobile app
            </h1>
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
            <img
              src={mobileFormHolderLogoPath}
              alt=""
              className="home-hero__mobile-mascot-body"
              aria-hidden="true"
            />
            <div className="simple-start-card home-hero__start-card">
              <p className="simple-start-card__label">
                {hasResumeSubmission
                  ? "You have a saved submission in progress."
                  : "What's the name of your app?"}
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
                    placeholder="Enter your app's name"
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
            <img
              src={mobileFormHolderArmsPath}
              alt=""
              className="home-hero__mobile-mascot-arms"
              aria-hidden="true"
            />
          </div>
        </section>

        <section className="home-review-marquee" aria-label="Test4Test user reviews">
          <div className="home-review-marquee__viewport">
            <div className="home-review-marquee__track">
              {[0, 1].map((groupIndex) => (
                <div
                  className="home-review-marquee__group"
                  key={groupIndex}
                  aria-hidden={groupIndex === 1}
                >
                  {homeReviews.map((quote) => (
                    <span className="home-review-text" key={`${quote}-${groupIndex}`}>
                      &ldquo;{quote}&rdquo;
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="home-feedback-demo" aria-labelledby="home-feedback-demo-title">
          <div className="home-feedback-demo__header">
            <h2 id="home-feedback-demo-title">See what AI can't</h2>
          </div>

          <div className="home-feedback-demo__stage" aria-label="Example SaaS usability feedback">
            <div className="home-feedback-demo__product" aria-hidden="true">
              <div className="demo-saas">
                <div className="demo-saas__topbar">
                  <div className="demo-saas__brand">
                    <span />
                    Northstar
                  </div>
                  <div className="demo-saas__nav">
                    <span>Pipeline</span>
                    <span>Insights</span>
                    <span>Settings</span>
                  </div>
                </div>

                <div className="demo-saas__hero">
                  <div>
                    <h3>Track Deals. Get Insights. Grow Now</h3>
                    <p>
                      Pull open deals from your CRM and give every next step a clear owner before
                      the pipeline call.
                    </p>
                  </div>
                  <button type="button" className="demo-saas__cta" tabIndex={-1}>
                    Build handoff report
                  </button>
                </div>

                <div className="demo-saas__grid">
                  <div className="demo-saas__panel demo-saas__panel--progress">
                    <div className="demo-saas__panel-header">
                      <span>Launch checklist</span>
                      <strong>72%</strong>
                    </div>
                    <div className="demo-saas__progress">
                      <span />
                    </div>
                    <div className="demo-saas__checklist">
                      <span>Import open deals</span>
                      <span>Match owners to stages</span>
                      <span>Send Friday digest</span>
                    </div>
                  </div>

                  <div className="demo-saas__panel demo-saas__panel--pricing">
                    <span className="demo-saas__eyebrow">Team trial</span>
                    <strong>$19</strong>
                    <p>Per seat after the trial. Cancel before July 1 and you won't be charged.</p>
                    <span className="demo-saas__security">Edit subscription</span>
                  </div>
                </div>
              </div>
              <span className="home-feedback-demo__cursor" />
            </div>

            <div className="home-feedback-demo__callouts">
              {feedbackDemoItems.map(({ id, quote }) => (
                <figure
                  className={`home-feedback-demo__callout home-feedback-demo__callout--${id}`}
                  key={id}
                >
                  <span className="home-feedback-demo__connector" />
                  <figcaption>
                    <blockquote>&ldquo;{quote}&rdquo;</blockquote>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        <section className="home-feedback-funnel" aria-label="Feedback analysis funnel">
          <div className="home-feedback-funnel__stage">
            <div className="home-feedback-funnel__drop-zone" aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <span
                  className={`home-feedback-funnel__ball home-feedback-funnel__ball--${
                    index + 1
                  }`}
                  key={index}
                />
              ))}
            </div>

            <div className="home-feedback-funnel__visual" aria-hidden="true">
              <svg
                className="home-feedback-funnel__glass"
                viewBox="0 0 520 520"
              >
                <defs>
                  <radialGradient id="feedback-funnel-mist" cx="50%" cy="44%" r="52%">
                    <stop offset="0%" stopColor="#d8fffb" stopOpacity="0.72" />
                    <stop offset="58%" stopColor="#a8ece5" stopOpacity="0.24" />
                    <stop offset="100%" stopColor="#a8ece5" stopOpacity="0" />
                  </radialGradient>
                  <linearGradient id="feedback-funnel-glass" x1="0.15" x2="0.88" y1="0" y2="1">
                    <stop offset="0%" stopColor="#effffd" stopOpacity="0.76" />
                    <stop offset="42%" stopColor="#c8f5f0" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#7dd8d0" stopOpacity="0.56" />
                  </linearGradient>
                  <linearGradient id="feedback-funnel-edge" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="#62c9c0" stopOpacity="0.18" />
                    <stop offset="50%" stopColor="#17aaa0" stopOpacity="0.54" />
                    <stop offset="100%" stopColor="#62c9c0" stopOpacity="0.18" />
                  </linearGradient>
                </defs>
                <path
                  className="home-feedback-funnel__glow"
                  d="M62 50 H458 V520 H62 Z"
                />
                <ellipse
                  className="home-feedback-funnel__rim-shadow"
                  cx="260"
                  cy="82"
                  rx="171"
                  ry="36"
                />
                <ellipse
                  className="home-feedback-funnel__rim"
                  cx="260"
                  cy="78"
                  rx="170"
                  ry="34"
                />
                <path
                  className="home-feedback-funnel__bowl-veil"
                  d="M91 82 C123 139 178 222 222 272 C236 288 284 288 298 272 C342 222 397 139 429 82 C373 108 147 108 91 82 Z"
                />
                <path
                  className="home-feedback-funnel__bowl"
                  d="M91 82 C123 139 178 222 222 272 C236 288 284 288 298 272 C342 222 397 139 429 82 C373 108 147 108 91 82 Z"
                />
                <path
                  className="home-feedback-funnel__bowl-edge"
                  d="M91 82 C123 139 178 222 222 272 M429 82 C397 139 342 222 298 272"
                />
                <path
                  className="home-feedback-funnel__outlet-veil"
                  d="M222 264 C236 282 284 282 298 264 L302 334 C289 356 231 356 218 334 Z"
                />
                <path
                  className="home-feedback-funnel__outlet"
                  d="M222 268 C236 286 284 286 298 268 L296 330 C286 348 234 348 224 330 Z"
                />
                <ellipse
                  className="home-feedback-funnel__outlet-lip"
                  cx="260"
                  cy="268"
                  rx="39"
                  ry="12"
                />
                <path
                  className="home-feedback-funnel__inner-line"
                  d="M256 116 C248 160 240 212 238 260"
                />
                <path
                  className="home-feedback-funnel__shine"
                  d="M334 78 C318 139 290 207 276 258"
                />
              </svg>

              <span className="home-feedback-funnel__spark home-feedback-funnel__spark--one" />
              <span className="home-feedback-funnel__spark home-feedback-funnel__spark--two" />
              <span className="home-feedback-funnel__spark home-feedback-funnel__spark--three" />
            </div>
          </div>
        </section>

        <section className="home-feedback-analysis" aria-label="Feedback analysis stages">
          <div className="home-feedback-analysis__stage">
            <svg
              className="home-feedback-analysis__pipe"
              viewBox="0 0 1000 1180"
              aria-hidden="true"
            >
              <path
                className="home-feedback-analysis__pipe-edge"
                d="M830 -120 L830 58 C830 144 786 216 708 264 C636 308 540 330 454 366 C298 431 210 522 210 632 L210 772 C210 955 330 1044 486 1116 C516 1130 532 1153 500 1180"
              />
              <path
                className="home-feedback-analysis__pipe-body"
                d="M830 -120 L830 58 C830 144 786 216 708 264 C636 308 540 330 454 366 C298 431 210 522 210 632 L210 772 C210 955 330 1044 486 1116 C516 1130 532 1153 500 1180"
              />
              <path
                className="home-feedback-analysis__pipe-shine"
                d="M806 74 C798 138 758 196 692 238 C622 282 532 306 466 334 C338 389 248 482 248 610 L248 750 C248 895 350 985 506 1054 C556 1076 574 1114 522 1154"
              />
            </svg>

            <div className="home-feedback-analysis__steps">
              {feedbackFunnelSteps.map(({ id, title, body }) => (
                <article className={`home-feedback-analysis__step home-feedback-analysis__step--${id}`} key={id}>
                  <div className="home-feedback-analysis__copy">
                    <h2>{title}</h2>
                    <p>{body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="home-feedback-report-section" aria-labelledby="home-feedback-report-title">
            <article className="home-feedback-report" aria-labelledby="home-feedback-report-title">
              <div className="home-feedback-report__topbar">
                <div>
                  <span className="home-feedback-report__icon" aria-hidden="true" />
                  <div>
                    <h2 id="home-feedback-report-title">Executive Report</h2>
                    <p>Generated from 3 usability notes</p>
                  </div>
                </div>
                <span className="home-feedback-report__status">Ready</span>
              </div>

              <div className="home-feedback-report__grid">
                <section className="home-feedback-report__block home-feedback-report__block--issues">
                  <div className="home-feedback-report__block-heading">
                    <h3>Top issues</h3>
                    <span>High impact</span>
                  </div>
                  <ol>
                    {executiveReportIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ol>
                </section>

                <section className="home-feedback-report__block home-feedback-report__block--patterns">
                  <div className="home-feedback-report__pattern-line" aria-hidden="true" />
                  <h3>Key pattern</h3>
                  <p>People move faster when the next step and cost are visible before they act.</p>
                  <span>Across 80% of feedback</span>
                </section>

                <section className="home-feedback-report__block home-feedback-report__block--severity">
                  <h3>Severity</h3>
                  <div className="home-feedback-report__severity-bar" aria-hidden="true">
                    <span className="home-feedback-report__severity-high" />
                    <span className="home-feedback-report__severity-medium" />
                    <span className="home-feedback-report__severity-low" />
                  </div>
                  <div className="home-feedback-report__severity-labels">
                    <span>High 28%</span>
                    <span>Medium 45%</span>
                    <span>Low 27%</span>
                  </div>
                </section>

                <section className="home-feedback-report__block home-feedback-report__block--fixes">
                  <h3>Recommended fixes</h3>
                  <ul>
                    {executiveReportFixes.map((fix) => (
                      <li key={fix}>{fix}</li>
                    ))}
                  </ul>
                </section>
              </div>
            </article>
        </section>

        <section className="home-process" aria-labelledby="home-process-title">
          <div className="home-process__header">
            <h2 id="home-process-title">How it works</h2>
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
