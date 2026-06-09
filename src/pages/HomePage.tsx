import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
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

const homeBenefitCards = [
  {
    title: "More Users",
    body: "Users love trying new things and sometimes, they'll stick around. Your first users are your most important users.",
  },
  {
    title: "More Feedback",
    body: "Have you ever gotten stuck and you're not sure what do next? User feedback helps you think of things you've never thought of before.",
  },
  {
    title: "More Usage",
    body: "Google and other search engines love how much time users spend on your app. Your engagement will soar and you'll start ranking higher.",
  },
];

function clampProgress(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function HomePage() {
  const [productName, setProductName] = useState("");
  const [hasResumeSubmission] = useState(() => Boolean(getSubmitFlowResume()));
  const benefitsSectionRef = useRef<HTMLElement | null>(null);
  const benefitCardRefs = useRef<Array<HTMLElement | null>>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const section = benefitsSectionRef.current;

    if (!section || typeof window === "undefined") {
      return undefined;
    }

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrameId = 0;

    const setCardReveal = (card: HTMLElement, progress: number) => {
      const titleLeft = card.clientWidth / 2 - progress * (card.clientWidth / 2 - 22);
      const titleX = -50 + progress * 50;
      const copyOpacity = clampProgress((progress - 0.42) * 2.1);
      const copyShift = 18 - progress * 18;

      card.style.setProperty("--benefit-progress", progress.toFixed(4));
      card.style.setProperty("--benefit-title-left", `${titleLeft.toFixed(2)}px`);
      card.style.setProperty("--benefit-title-x", `${titleX.toFixed(2)}%`);
      card.style.setProperty("--benefit-copy-opacity", copyOpacity.toFixed(4));
      card.style.setProperty("--benefit-copy-shift", `${copyShift.toFixed(2)}px`);
    };

    const updateProgress = () => {
      animationFrameId = 0;

      if (reducedMotionQuery.matches) {
        section.style.setProperty("--benefits-progress", "1");
        benefitCardRefs.current.forEach((card) => {
          if (card) {
            setCardReveal(card, 1);
          }
        });
        return;
      }

      const rect = section.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const startY = viewportHeight * 0.85;
      const travelDistance = rect.height + viewportHeight * 0.25;
      const sectionProgress = clampProgress((startY - rect.top) / travelDistance);

      section.style.setProperty("--benefits-progress", sectionProgress.toFixed(4));
      benefitCardRefs.current.forEach((card, index) => {
        const cardStart = index * 0.16;
        const cardProgress = clampProgress((sectionProgress - cardStart) / 0.5);

        if (card) {
          setCardReveal(card, cardProgress);
        }
      });
    };

    const requestProgressUpdate = () => {
      if (animationFrameId) {
        return;
      }

      animationFrameId = window.requestAnimationFrame(updateProgress);
    };

    updateProgress();
    window.addEventListener("scroll", requestProgressUpdate, { passive: true });
    window.addEventListener("resize", requestProgressUpdate);
    reducedMotionQuery.addEventListener("change", requestProgressUpdate);

    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }

      window.removeEventListener("scroll", requestProgressUpdate);
      window.removeEventListener("resize", requestProgressUpdate);
      reducedMotionQuery.removeEventListener("change", requestProgressUpdate);
    };
  }, []);

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

        <section
          ref={benefitsSectionRef}
          className="home-benefits"
          aria-labelledby="home-benefits-title"
        >
          <div className="home-benefits__header">
            <h2 id="home-benefits-title">Why Test4Test?</h2>
          </div>
          <div className="home-benefits__grid">
            {homeBenefitCards.map(({ title, body }, index) => (
              <article
                ref={(element) => {
                  benefitCardRefs.current[index] = element;
                }}
                className="home-benefit-card"
                key={title}
                style={{ "--benefit-index": index } as CSSProperties}
              >
                <div className="home-benefit-card__copy">
                  <p>{body}</p>
                </div>
                <div className="home-benefit-card__title" aria-hidden="true">
                  <h2>{title}</h2>
                </div>
                <h2 className="home-benefit-card__screen-title">{title}</h2>
              </article>
            ))}
          </div>
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
