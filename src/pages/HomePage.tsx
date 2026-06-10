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

const creditBadgeSpots = {
  desktop: [
    { x: "44%", y: "32%", driftX: "24px", driftY: "-38px" },
    { x: "63%", y: "28%", driftX: "-22px", driftY: "-34px" },
    { x: "78%", y: "43%", driftX: "-28px", driftY: "-32px" },
    { x: "58%", y: "58%", driftX: "18px", driftY: "-42px" },
    { x: "84%", y: "31%", driftX: "-26px", driftY: "-36px" },
  ],
  mobile: [
    { x: "72%", y: "23%", driftX: "-20px", driftY: "-32px" },
    { x: "43%", y: "28%", driftX: "18px", driftY: "-30px" },
    { x: "78%", y: "39%", driftX: "-24px", driftY: "-34px" },
    { x: "56%", y: "52%", driftX: "14px", driftY: "-36px" },
  ],
};

const qualityStartingRank = 34;
const qualityVisibleRanks = [31, 32, 33];
const qualityRankJumpOptions = [2, 3];
const qualityRankRowDistance = 82;

function clampProgress(value: number) {
  return Math.max(0, Math.min(1, value));
}

function getRandomQualityRankJump() {
  return qualityRankJumpOptions[Math.floor(Math.random() * qualityRankJumpOptions.length)];
}

export function HomePage() {
  const [productName, setProductName] = useState("");
  const [hasResumeSubmission] = useState(() => Boolean(getSubmitFlowResume()));
  const [qualityRankJump, setQualityRankJump] = useState(() => getRandomQualityRankJump());
  const benefitsSectionRef = useRef<HTMLElement | null>(null);
  const benefitCardRefs = useRef<Array<HTMLElement | null>>([]);
  const creditBadgeRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    const badge = creditBadgeRef.current;

    if (!badge || typeof window === "undefined") {
      return undefined;
    }

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobileQuery = window.matchMedia("(max-width: 760px)");
    let previousSpotIndex = -1;

    const setCreditBadgeSpot = () => {
      const spots = mobileQuery.matches ? creditBadgeSpots.mobile : creditBadgeSpots.desktop;
      let nextSpotIndex = Math.floor(Math.random() * spots.length);

      if (spots.length > 1 && nextSpotIndex === previousSpotIndex) {
        nextSpotIndex = (nextSpotIndex + 1) % spots.length;
      }

      previousSpotIndex = nextSpotIndex;
      const spot = reducedMotionQuery.matches ? spots[0] : spots[nextSpotIndex];

      badge.style.setProperty("--quality-credit-x", spot.x);
      badge.style.setProperty("--quality-credit-y", spot.y);
      badge.style.setProperty("--quality-credit-drift-x", spot.driftX);
      badge.style.setProperty("--quality-credit-drift-y", spot.driftY);
    };

    const setRankJump = () => {
      const nextRankJump = reducedMotionQuery.matches
        ? qualityRankJumpOptions[qualityRankJumpOptions.length - 1]
        : getRandomQualityRankJump();

      setQualityRankJump(nextRankJump);
    };

    setCreditBadgeSpot();
    const setNextCycle = () => {
      setCreditBadgeSpot();
      setRankJump();
    };

    badge.addEventListener("animationiteration", setNextCycle);
    mobileQuery.addEventListener("change", setCreditBadgeSpot);
    reducedMotionQuery.addEventListener("change", setNextCycle);

    return () => {
      badge.removeEventListener("animationiteration", setNextCycle);
      mobileQuery.removeEventListener("change", setCreditBadgeSpot);
      reducedMotionQuery.removeEventListener("change", setNextCycle);
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

  const qualityTargetRank = qualityStartingRank - qualityRankJump;
  const qualityDemoStyle = {
    "--quality-rank-rise": `${qualityRankJump * -qualityRankRowDistance}px`,
  } as CSSProperties;
  const qualityRankRows = qualityVisibleRanks.map((rank, index) => ({
    rank,
    productName: ["LaunchLab", "FlowPilot", "QuickCart"][index],
    credits: ["3 credits", "2 credits", "2 credits"][index],
    positionClassName: ["one", "two", "three"][index],
    shiftsDown: rank >= qualityTargetRank,
  }));

  const renderQualityRankLabel = (rank: number, nextRank: number, isAnimated: boolean) => {
    if (!isAnimated) {
      return `#${rank}`;
    }

    return (
      <>
        <span className="quality-demo__rank-old">#{rank}</span>
        <span className="quality-demo__rank-new">#{nextRank}</span>
      </>
    );
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

        <section className="home-quality" aria-labelledby="home-quality-title">
          <div className="home-quality__copy">
            <h2 id="home-quality-title">Quality Feedback Guaranteed</h2>
            <p>
              1 test = 1 credit. Every time you complete a test, someone will test-back your app.
              The more you test, the more you&apos;ll rank up on the earn page and the more
              feedback you&apos;ll receive.
            </p>
          </div>

          <div
            className="home-quality__visual"
            role="img"
            aria-label="A completed test earns one credit, then the user's test moves higher on Earn."
          >
            <div className="quality-demo" style={qualityDemoStyle}>
              <div ref={creditBadgeRef} className="quality-demo__credit-badge">+1 credit</div>

              <div className="quality-demo__earn-board">
                <div className="quality-demo__earn-header">
                  <span>Earn</span>
                </div>

                <div className="quality-demo__rank-track">
                  {qualityRankRows.map(({ rank, productName, credits, positionClassName, shiftsDown }) => (
                    <div
                      className={`quality-demo__rank-row quality-demo__rank-row--${positionClassName}${
                        shiftsDown ? " quality-demo__rank-row--shift" : ""
                      }`}
                      key={rank}
                    >
                      <span>{renderQualityRankLabel(rank, rank + 1, shiftsDown)}</span>
                      <strong>{productName}</strong>
                      <small>{credits}</small>
                    </div>
                  ))}
                  <div className="quality-demo__rank-row quality-demo__rank-row--you">
                    <span>
                      <span className="quality-demo__rank-old">#{qualityStartingRank}</span>
                      <span className="quality-demo__rank-new">#{qualityTargetRank}</span>
                    </span>
                    <strong>Your app</strong>
                    <small>1 credit</small>
                  </div>
                </div>
              </div>
            </div>
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
