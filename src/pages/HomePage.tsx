import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell, type AudienceRole } from "../components/Layout";
import { trackEvent } from "../lib/analytics";
import { defaultImage, getAbsoluteUrl, siteTitle, siteUrl, usePageMetadata } from "../lib/pageMetadata";
import { getSubmitFlowResume } from "../lib/pendingSubmission";

const groupLogoPath = "/branding/Test4Test%20Group%20Logo.png";
const formHolderLogoPath = "/branding/Raspberry.png";
// The arm overlay shares Raspberry.png's artboard so body, card, and foreground arm stay aligned.
const formHolderArmPath = "/branding/raspberry-arm-foreground-364x607.png";
const mobileFormHolderLogoPath = "/branding/Short%20Popsicle.png";
const mobileFormHolderArmsPath = "/branding/short-popsicle-arms-foreground-1024x1536.png";

const homeOrganizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: siteTitle,
  url: siteUrl,
  logo: {
    "@type": "ImageObject",
    url: getAbsoluteUrl(defaultImage),
  },
};

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
const processGlowLeadInSlots = 1;
const processGlowSlotsPerStep = 3;
const processGlowTotalSlots =
  processGlowLeadInSlots + processSteps.length * processGlowSlotsPerStep;

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

const qualityRivalNames = [
  "LaunchLab",
  "FlowPilot",
  "QuickCart",
  "NoteNest",
  "PixelPay",
  "TaskTide",
  "SnapShelf",
  "FitQuest",
  "MealMint",
  "PageProse",
  "BeaconGo",
  "ChatterBox",
];

const qualityRankRowDistance = 68;
// "Your app" sits this many rows below the top of the window while the board scrolls.
const qualityAppHomeSlot = 3;
const qualityWindowRows = 5;

type QualityPhase = "intro" | "earn" | "climb" | "pan" | "settle" | "celebrate" | "reset";

// Phase lengths pace the loop; "climb" and "pan" must outlast their CSS transition durations.
const qualityPhaseDurationsMs: Record<QualityPhase, number> = {
  intro: 900,
  earn: 800,
  climb: 1000,
  pan: 950,
  settle: 520,
  celebrate: 2600,
  reset: 520,
};

type QualityCompetitor = {
  id: string;
  name: string;
  rank: number;
  credits: string;
};

type QualityLadder = {
  // Rank of "Your app" after each overtake; entry 0 is the starting rank, the last entry is 1.
  appRanks: number[];
  // competitors[i] is the visible row "Your app" passes on its (i + 1)th overtake.
  competitors: QualityCompetitor[];
};

type QualityDemoState = {
  phase: QualityPhase;
  step: number;
  cycle: number;
  cameraRung: number;
  ladder: QualityLadder;
};

function randomQualityInt(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function generateQualityLadder(): QualityLadder {
  for (;;) {
    const appRanks = [randomQualityInt(21, 27)];
    let rank = appRanks[0];

    while (rank > 1) {
      rank -= Math.min(randomQualityInt(1, 5), rank - 1);
      appRanks.push(rank);
    }

    // Keep the loop a reasonable length; an all-small-jumps run is extremely unlikely.
    if (appRanks.length > 13) {
      continue;
    }

    const nameOffset = randomQualityInt(0, qualityRivalNames.length - 1);
    const competitors = appRanks.slice(1).map((nextRank, index) => {
      // The visible rival's rank sits inside the span of ranks this jump clears.
      const rivalRank = randomQualityInt(nextRank, appRanks[index] - 1);

      return {
        id: `rival-${index}`,
        name: qualityRivalNames[(nameOffset + index) % qualityRivalNames.length],
        rank: rivalRank,
        credits: `${Math.max(2, 2 + Math.floor((30 - rivalRank) / 7))} credits`,
      };
    });

    return { appRanks, competitors };
  }
}

function getQualityCameraRung(step: number, maxStep: number) {
  const appRung = maxStep - step;
  const highestCameraRung = Math.max(maxStep + 1 - qualityWindowRows, 0);

  return Math.min(Math.max(appRung - qualityAppHomeSlot, 0), highestCameraRung);
}

function createQualityDemoState(cycle: number): QualityDemoState {
  const ladder = generateQualityLadder();

  return {
    phase: "intro",
    step: 0,
    cycle,
    cameraRung: getQualityCameraRung(0, ladder.appRanks.length - 1),
    ladder,
  };
}

function advanceQualityDemo(state: QualityDemoState): QualityDemoState {
  const maxStep = state.ladder.appRanks.length - 1;

  switch (state.phase) {
    case "intro":
    case "pan":
    case "settle":
      return { ...state, phase: "earn" };
    case "earn":
      return { ...state, phase: "climb", step: state.step + 1 };
    case "climb": {
      if (state.step >= maxStep) {
        return { ...state, phase: "celebrate" };
      }

      const nextCameraRung = getQualityCameraRung(state.step, maxStep);

      // Pan the board down to keep "Your app" at its home slot, revealing the next rival above.
      return nextCameraRung === state.cameraRung
        ? { ...state, phase: "settle" }
        : { ...state, phase: "pan", cameraRung: nextCameraRung };
    }
    case "celebrate":
      return { ...state, phase: "reset" };
    case "reset":
      return createQualityDemoState(state.cycle + 1);
  }
}

function getQualityRowStyle(slot: number) {
  return {
    "--quality-row-y": `${slot * qualityRankRowDistance}px`,
  } as CSSProperties;
}

function QualityRankDemo() {
  const demoRef = useRef<HTMLDivElement | null>(null);
  const [isInView, setIsInView] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [demoState, setDemoState] = useState<QualityDemoState>(() => createQualityDemoState(0));

  useEffect(() => {
    const node = demoRef.current;

    if (!node || typeof IntersectionObserver === "undefined") {
      setIsInView(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => setIsInView(entries.some((entry) => entry.isIntersecting)),
      { threshold: 0.3 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyPreference = () => setPrefersReducedMotion(reducedMotionQuery.matches);

    applyPreference();
    reducedMotionQuery.addEventListener("change", applyPreference);
    return () => reducedMotionQuery.removeEventListener("change", applyPreference);
  }, []);

  useEffect(() => {
    // Only run the loop while the demo is on screen so it never costs idle CPU.
    if (!isInView || prefersReducedMotion) {
      return undefined;
    }

    const timerId = window.setTimeout(
      () => setDemoState(advanceQualityDemo),
      qualityPhaseDurationsMs[demoState.phase],
    );

    return () => window.clearTimeout(timerId);
  }, [demoState, isInView, prefersReducedMotion]);

  const { cycle, ladder } = demoState;
  const maxStep = ladder.appRanks.length - 1;
  const staticStep = Math.min(2, maxStep);
  // Reduced motion shows a frozen mid-climb frame instead of running the loop.
  const { phase, step, cameraRung } = prefersReducedMotion
    ? {
        phase: "settle" as const,
        step: staticStep,
        cameraRung: getQualityCameraRung(staticStep, maxStep),
      }
    : demoState;
  const isClimbing = phase === "climb";
  const appRung = maxStep - step;
  const appRank = ladder.appRanks[step];
  const previousAppRank = ladder.appRanks[Math.max(0, step - 1)];
  const appCredits = step + 1;
  const youRowClassName = [
    "quality-demo__rank-row",
    "quality-demo__rank-row--you",
    isClimbing ? "quality-demo__rank-row--climbing" : "",
    phase === "celebrate" ? "quality-demo__rank-row--celebrating" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={demoRef} className="quality-demo">
      <div className="quality-demo__earn-board">
        <div className="quality-demo__earn-header">
          <span>Earn</span>
        </div>

        <div
          key={cycle}
          className={`quality-demo__rank-track${
            phase === "reset" ? " quality-demo__rank-track--resetting" : ""
          }`}
        >
          <div
            className="quality-demo__rank-ladder"
            style={
              {
                "--quality-camera-y": `${-cameraRung * qualityRankRowDistance}px`,
              } as CSSProperties
            }
          >
            {ladder.competitors.map(({ id, name, rank, credits }, index) => {
              const isPassed = index < step;
              const isDropping = isClimbing && index === step - 1;
              const rung = isPassed ? maxStep - index : maxStep - 1 - index;

              return (
                <div
                  className={`quality-demo__rank-row quality-demo__rank-row--demo${
                    isDropping ? " quality-demo__rank-row--dropping" : ""
                  }`}
                  key={id}
                  style={getQualityRowStyle(rung)}
                >
                  <span className="quality-demo__rank-chip">#{isPassed ? rank + 1 : rank}</span>
                  <strong>{name}</strong>
                  <small>{credits}</small>
                </div>
              );
            })}

            <div className={youRowClassName} style={getQualityRowStyle(appRung)}>
              <span className="quality-demo__rank-chip">
                {isClimbing ? (
                  <>
                    <span className="quality-demo__rank-old">#{previousAppRank}</span>
                    <span className="quality-demo__rank-new">#{appRank}</span>
                  </>
                ) : (
                  <>#{appRank}</>
                )}
              </span>
              <strong>Your app</strong>
              <small>
                <span key={appCredits} className="quality-demo__credit-count">
                  {appCredits} {appCredits === 1 ? "credit" : "credits"}
                </span>
              </small>
              {phase === "earn" ? (
                <span className="quality-demo__credit-badge" aria-hidden="true">
                  +1 credit
                </span>
              ) : null}
              {phase === "celebrate" ? (
                <span className="quality-demo__celebrate-ring" aria-hidden="true" />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HomePage() {
  usePageMetadata({
    canonicalPath: "/",
    image: defaultImage,
    jsonLd: homeOrganizationJsonLd,
  });

  const [productName, setProductName] = useState("");
  const [hasResumeSubmission] = useState(() => Boolean(getSubmitFlowResume()));
  const processGridRef = useRef<HTMLDivElement | null>(null);
  const processStepRefs = useRef<Array<HTMLElement | null>>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const cardsGrid = processGridRef.current;

    if (!cardsGrid || typeof window === "undefined") {
      return undefined;
    }

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrameId = 0;
    let activeIndex = -2;
    let previousScrollY = window.scrollY;
    let isScrollingUp = false;

    const setGlowStep = (index: number) => {
      if (activeIndex === index) {
        return;
      }

      activeIndex = index;
      processStepRefs.current.forEach((card, cardIndex) => {
        card?.classList.toggle("simple-step--glow", cardIndex === index);
      });
    };

    const syncGlowStep = () => {
      animationFrameId = 0;

      if (reducedMotionQuery.matches || isScrollingUp) {
        setGlowStep(-1);
        return;
      }

      const rect = cardsGrid.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

      if (rect.bottom <= 0 || rect.top >= viewportHeight) {
        setGlowStep(-1);
        return;
      }

      const firstGlowY = viewportHeight * 0.72;
      const finalGlowY = Math.min(-rect.height * 0.24, -64);
      const progress = Math.max(
        0,
        Math.min(0.999, (firstGlowY - rect.top) / (firstGlowY - finalGlowY)),
      );
      const slot = Math.floor(progress * processGlowTotalSlots);

      if (slot < processGlowLeadInSlots) {
        setGlowStep(-1);
        return;
      }

      setGlowStep(
        Math.min(
          processSteps.length - 1,
          Math.floor((slot - processGlowLeadInSlots) / processGlowSlotsPerStep),
        ),
      );
    };

    const requestGlowSync = (scrollingUp = false) => {
      isScrollingUp = scrollingUp;

      if (isScrollingUp) {
        setGlowStep(-1);
      }

      if (animationFrameId) {
        return;
      }

      animationFrameId = window.requestAnimationFrame(syncGlowStep);
    };

    const handleScroll = () => {
      const nextScrollY = window.scrollY;
      const scrollingUp = nextScrollY < previousScrollY;

      previousScrollY = nextScrollY;
      requestGlowSync(scrollingUp);
    };

    const handleResize = () => requestGlowSync(false);
    const handleReducedMotionChange = () => requestGlowSync(false);

    syncGlowStep();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);
    reducedMotionQuery.addEventListener("change", handleReducedMotionChange);

    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }

      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
      reducedMotionQuery.removeEventListener("change", handleReducedMotionChange);
      setGlowStep(-1);
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

        <section className="home-process" aria-labelledby="home-process-title">
          <div className="home-process__header">
            <h2 id="home-process-title">How it works</h2>
          </div>

          <div className="home-process__body">
            <div className="home-process__art" aria-hidden="true">
              <img src={groupLogoPath} alt="" className="home-process__logo" />
            </div>
            <div className="simple-steps" ref={processGridRef}>
              {processSteps.map(({ title, body }, index) => (
                <article
                  ref={(element) => {
                    processStepRefs.current[index] = element;
                  }}
                  className="simple-step"
                  key={title}
                >
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

        <section className="home-quality" aria-labelledby="home-quality-title">
          <div className="home-quality__copy">
            <h2 id="home-quality-title">1 Test = 1 Credit</h2>
            <p>
              Every time you complete a test, someone will test-back your app. The more you test,
              the more you&apos;ll rank up and the more feedback you&apos;ll receive.
            </p>
          </div>

          <div
            className="home-quality__visual"
            role="img"
            aria-label="Earn leaderboard demo: each completed test earns one credit and jumps Your app several ranks, passing other apps as new ones scroll in from above, until it reaches number one."
          >
            <QualityRankDemo />
          </div>
        </section>

        <section className="home-benefits" aria-labelledby="home-benefits-title">
          <div className="home-benefits__header">
            <h2 id="home-benefits-title">Why Test4Test?</h2>
          </div>
          <div className="home-benefits__grid">
            {homeBenefitCards.map(({ title, body }) => (
              <article className="home-benefit-card" key={title}>
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

        <section className="home-final-cta" aria-labelledby="home-final-cta-title">
          <h2 id="home-final-cta-title">Ready for feedback?</h2>
          <p>It takes minutes to submit your app and start seeing real user feedback</p>
          <button
            type="button"
            className="button button--primary home-final-cta__button"
            onClick={continueSubmission}
          >
            Get started
            <ArrowRight size={18} />
          </button>
        </section>
      </div>
    </AppShell>
  );
}
